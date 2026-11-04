// The real shell, driven (2026-11-04). scripts/shell.mjs compiles mac/Sources/main.swift with this file beside it and
// -D PEIX_PROBE, and talks to it over stdin and stdout, a line of JSON each way: `{id, do, …}` in, `{id, ok, value | error}`
// out. Nothing here is in the app: build.sh does not compile it, and main.swift calls it behind the flag.
// What it is for: the page and the shell each right in their own terms and wrong together — Chrome with a fake bridge
// sees the one, a probe built like buildWindow a copy of the other. So the window, the overlay, the pane's views, the
// fill and the bridge are the app's own code here, and what a check believes is the window's pixels (`shot`, `runs`).
// Out of the way of the app in use (kProbeAside): no activation, no Dock icon, no fish; on top, on every Space, with no
// mouse, one pixel on the main screen — wholly off a screen WebKit runs no frames. The fill keeps that frame: its style
// mask and its word to the page are the real ones, the screen is not taken. Its files are the fake home's (CFFIXED_USER_HOME).
// stdin's end is the driver gone, and this goes with it.
import AppKit
import WebKit

private typealias Capture = @convention(c) (CGRect, UInt32, UInt32, UInt32) -> Unmanaged<CGImage>?
// unavailable in the SDK since macOS 15, still in the system: looked up by name, as scripts/webkit.swift does
private let capture = unsafeBitCast(dlsym(dlopen(nil, RTLD_NOW), "CGWindowListCreateImage"), to: Capture.self)

/// The window as last captured, in sRGB as the pages' colours are written (the capture is in the display's space).
private final class Shot {
  let ctx: CGContext, width: Int, height: Int, scale: CGFloat
  init?(_ img: CGImage, points: CGFloat) {
    guard let ctx = CGContext(data: nil, width: img.width, height: img.height, bitsPerComponent: 8, bytesPerRow: 0,
                              space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue) else { return nil }
    ctx.draw(img, in: CGRect(x: 0, y: 0, width: img.width, height: img.height))
    self.ctx = ctx; width = img.width; height = img.height; scale = CGFloat(img.width) / points
  }
  /// [r, g, b] of a pixel, from the top left.
  func px(_ x: Int, _ y: Int) -> [Int] {
    let p = ctx.data!.assumingMemoryBound(to: UInt8.self), at = y * ctx.bytesPerRow + x * 4
    return [Int(p[at]), Int(p[at + 1]), Int(p[at + 2])]
  }
  /// One line of pixels as runs of one colour, in points: down the column at `at`, or across the row.
  func runs(down: Bool, at: CGFloat) -> [[String: Any]] {
    let fixed = Int((at * scale).rounded()), n = down ? height : width
    guard fixed >= 0, fixed < (down ? width : height) else { return [] }
    var out: [[String: Any]] = [], start = 0, ink = down ? px(fixed, 0) : px(0, fixed)
    let close = { (a: [Int], b: [Int]) in zip(a, b).allSatisfy { abs($0 - $1) <= 6 } }
    for i in 1...n {
      let c = i < n ? (down ? px(fixed, i) : px(i, fixed)) : []
      if i < n && close(c, ink) { continue }
      out.append(["c": ink, "at": CGFloat(start) / scale, "len": CGFloat(i - start) / scale])
      start = i; if i < n { ink = c }
    }
    return out
  }
}
private var shot: Shot?
private var probeInput = Data()

extension AppDelegate {
  /// Right after the window is built, before the server is looked for.
  func probeBegin() {
    statusItem.isVisible = false
    if kProbeAside {
      window.ignoresMouseEvents = true
      window.level = .screenSaver   // a pixel covered is a page hidden: above the Dock and whatever else comes to that corner
      window.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary]
      guard probeTuck() else { probeFail("no corner of the main screen is clear of the others") }
      window.orderFrontRegardless()
    }
    FileHandle.standardInput.readabilityHandler = { h in
      let d = h.availableData
      DispatchQueue.main.async { self.probeHear(d) }
    }
    probeSay(["ready": true, "pid": ProcessInfo.processInfo.processIdentifier, "unseen": probeUnseen() as Any])
  }

  private func probeFail(_ why: String) -> Never { FileHandle.standardError.write(Data((why + "\n").utf8)); exit(1) }
  private func probeSay(_ o: [String: Any]) {
    guard let d = try? JSONSerialization.data(withJSONObject: o) else { return }
    FileHandle.standardOutput.write(d + Data("\n".utf8))
  }
  /// Why nobody could be looking, which is why WebKit would run no frames: the check cannot be run now.
  private func probeUnseen() -> String? {
    let s = CGSessionCopyCurrentDictionary() as? [String: Any]
    if (s?["CGSSessionScreenIsLocked"] as? Bool) == true { return "the screen is locked" }
    if CGDisplayIsAsleep(CGMainDisplayID()) != 0 { return "the display is asleep" }
    return nil
  }
  /// One pixel of the window on the main screen, in the first corner where the rest falls on no other screen: a mirror of
  /// the main screen has its frame, and is not another screen the window could show on (scripts/webkit.swift's).
  private func probeTuck() -> Bool {
    guard let main = NSScreen.screens.first else { return false }
    let f = main.frame, W = window.frame.width, H = window.frame.height
    let corners = [(f.maxX - 1, f.minY - H + 1), (f.minX - W + 1, f.minY - H + 1), (f.maxX - 1, f.maxY - 1), (f.minX - W + 1, f.maxY - 1)]
    let others = NSScreen.screens.dropFirst().filter { $0.frame != f }
    guard let (x, y) = corners.first(where: { c in others.allSatisfy { !$0.frame.intersects(NSRect(x: c.0, y: c.1, width: W, height: H + 40)) } }) else { return false }
    window.setFrameOrigin(NSPoint(x: x, y: y))
    return true
  }
  private func probeHear(_ d: Data) {
    if d.isEmpty { exit(0) }   // the driver gone
    probeInput.append(d)
    while let nl = probeInput.firstIndex(of: 10) {
      let line = probeInput.subdata(in: probeInput.startIndex..<nl)
      probeInput.removeSubrange(probeInput.startIndex...nl)
      guard let o = try? JSONSerialization.jsonObject(with: line) as? [String: Any], let id = o["id"] else { continue }
      let reply = { (value: Any?, error: String?) in
        self.probeSay(error.map { ["id": id, "ok": false, "error": $0] } ?? ["id": id, "ok": true, "value": value ?? NSNull()])
      }
      probeDo(o, reply)
    }
  }
  private func probeDo(_ o: [String: Any], _ reply: @escaping (Any?, String?) -> Void) {
    let answered = { (r: Result<Any, Error>) in
      switch r {
      case .success(let v): reply(v, nil)
      case .failure(let e): reply(nil, (e as NSError).userInfo["WKJavaScriptExceptionMessage"] as? String ?? "\(e)")
      }
    }
    switch o["do"] as? String ?? "" {
    case "js":     // a body of script on the board: an async function's, what it returns JSON's
      web.callAsyncJavaScript("return JSON.stringify(await (async () => { \(o["code"] as? String ?? "") })()) ?? 'null'", arguments: [:], in: nil, in: .page) { answered($0.map { $0 as Any }) }
    case "page":   // …on a page in the pane, by its key
      guard let v = paneViews[o["key"] as? String ?? ""] else { return reply(nil, "no view for \(o["key"] ?? "?") among \(Array(paneViews.keys))") }
      v.callAsyncJavaScript("return JSON.stringify(await (async () => { \(o["code"] as? String ?? "") })()) ?? 'null'", arguments: [:], in: nil, in: .page) { answered($0.map { $0 as Any }) }
    case "full":   // ⌃⌘F, whichever it is
      toggleFull(nil); reply(true, nil)
    case "size":   // the window dragged to another size, its corner where it was
      let f = window.frame, w = (o["w"] as? Double).map { CGFloat($0) } ?? f.width, h = (o["h"] as? Double).map { CGFloat($0) } ?? f.height
      window.setFrame(NSRect(x: f.minX, y: f.minY, width: w, height: h), display: true)
      if kProbeAside { _ = probeTuck() }
      reply(true, nil)
    case "window":
      let h = window.frame.height
      var panes: [String: Any] = [:]
      for (k, v) in paneViews {
        let r = v.convert(v.bounds, to: nil)   // from the window's bottom left
        panes[k] = ["x": r.minX, "y": h - r.maxY, "w": r.width, "h": r.height, "up": !v.isHidden && !paneOverlay.isHidden]
      }
      reply(["w": window.frame.width, "h": h, "titled": window.styleMask.contains(.titled), "fill": fillSaved != nil, "full": window.styleMask.contains(.fullScreen),
             "inset": paneTopC.constant, "zoom": zoom, "active": NSApp.isActive, "seen": window.occlusionState.contains(.visible), "unseen": probeUnseen() as Any,
             "panes": panes], nil)
    case "shot":   // optionIncludingWindow (1 << 3), boundsIgnoreFraming (1 << 0)
      guard let img = capture(.null, 1 << 3, UInt32(window.windowNumber), 1)?.takeRetainedValue(), let s = Shot(img, points: window.frame.width) else { return reply(nil, "no image of the window") }
      shot = s
      if let path = o["path"] as? String, let cg = s.ctx.makeImage(), let png = NSBitmapImageRep(cgImage: cg).representation(using: .png, properties: [:]) {
        do { try png.write(to: URL(fileURLWithPath: path)) } catch { return reply(nil, "cannot write \(path): \(error)") }
      }
      reply(["width": s.width, "height": s.height, "scale": s.scale], nil)
    case "runs":   // on the last shot, in points: { down: true, at: x } or { down: false, at: y }
      guard let s = shot else { return reply(nil, "no shot yet") }
      reply(s.runs(down: o["down"] as? Bool ?? true, at: CGFloat(o["at"] as? Double ?? 0)), nil)
    case "quit": exit(0)
    default: reply(nil, "no such thing to do: \(o["do"] ?? "?")")
    }
  }
}
