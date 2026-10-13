// The page as the app's engine draws it (2026-10-11, late night): the harness is Chrome, and a bug of WebKit's alone
// passes every scenario — rings in step read their start back from the script and drew each ring where it began.
// This loads a page in a WKWebView, runs a body of script on it and, asked, captures the window as WebKit's compositor
// drew it — CGWindowListCreateImage on its own window, which needs no Screen Recording grant. The window is opaque and
// on screen by one pixel, in a corner of the main screen no other screen touches: wholly off a screen, WebKit hides
// the page and runs no frames; at 1 % alpha the capture comes back premultiplied, its colours in steps of 85.
// Floating, on every Space, no mouse; WK_PIDFILE is given the web process's pid. Driven by scripts/webkit.mjs, which
// compiles it:
//   webkit <url> <body> <shot.png or ""> <then or "">
import AppKit
import WebKit

let env = ProcessInfo.processInfo.environment
let args = CommandLine.arguments
func fail(_ s: String, _ code: Int32 = 1) -> Never { FileHandle.standardError.write((s + "\n").data(using: .utf8)!); exit(code) }
guard args.count == 5, let url = URL(string: args[1]) else { fail("usage: webkit <url> <body> <shot.png|\"\"> <then|\"\">", 2) }
let body = args[2], shotPath = args[3], then = args[4]
let W = Double(env["WK_W"] ?? "1600") ?? 1600, H = Double(env["WK_H"] ?? "900") ?? 900
let settle = Double(env["WK_WAIT"] ?? "0.3") ?? 0.3, timeout = Double(env["WK_TIMEOUT"] ?? "30") ?? 30

// What every body has at hand: frames, sleeps, a poll; and the board ready — its snapshot, and the chat of --hash open.
let tools = """
  const frame = () => new Promise(r => requestAnimationFrame(r)), sleep = ms => new Promise(r => setTimeout(r, ms));
  const until = async (fn, ms = 10000, what = String(fn)) => { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v;
    if (Date.now() - t0 > ms) throw new Error('timed out waiting for ' + what); await sleep(50); } };
  """
let ready = """
  if (document.visibilityState === 'hidden') throw new Error('the page is hidden (the screen locked, or asleep?): WebKit runs no frames then');
  if (window.peix) await until(() => peix.state().snapshots > 0, 12000, 'the board\\'s snapshot');
  if (HASH) { location.hash = HASH; await until(() => peix.state().current === HASH && document.querySelector('#log')?.dataset.sid === HASH, 8000, 'the chat to open'); }
  """
// The captured frame, for --then: `shot.px(x, y)` → [r, g, b] at a point in CSS px; `shot.where(test, [x, y, w, h])` →
// how many pixels pass test(r, g, b) in that rect (the window by default), and their centroid in CSS px.
let shotTools = """
  const img = new Image(); img.src = 'data:image/png;base64,' + PNG; await img.decode();
  const cv = document.createElement('canvas'); cv.width = img.naturalWidth; cv.height = img.naturalHeight;
  const cx = cv.getContext('2d', { willReadFrequently: true }); cx.drawImage(img, 0, 0);
  const D = cx.getImageData(0, 0, cv.width, cv.height).data, S = cv.width / innerWidth;
  const at = (i, j) => { const k = (j * cv.width + i) * 4; return [D[k], D[k + 1], D[k + 2]]; };
  const shot = { width: cv.width, height: cv.height, scale: S, px: (x, y) => at(Math.round(x * S), Math.round(y * S)),
    where(test, [x, y, w, h] = [0, 0, innerWidth, innerHeight]) { let n = 0, sx = 0, sy = 0;
      for (let j = Math.max(0, Math.round(y * S)); j < Math.min(cv.height, Math.round((y + h) * S)); j++)
        for (let i = Math.max(0, Math.round(x * S)); i < Math.min(cv.width, Math.round((x + w) * S)); i++) if (test(...at(i, j))) { n++; sx += i; sy += j; }
      return n ? { n, x: +(sx / n / S).toFixed(1), y: +(sy / n / S).toFixed(1) } : { n: 0 }; } };
  """
// The page's prefs start empty (a store of its own), with auto-resume off — on the live board a chat opened would
// otherwise resume itself in a drawer — and WK_PREFS over them.
let seed = """
  window.__wkErrs = []; addEventListener('error', e => __wkErrs.push(String(e.message) + ' @' + e.lineno));
  addEventListener('unhandledrejection', e => __wkErrs.push('unhandled rejection: ' + String(e.reason)));
  try { const k = 'peixairada-prefs', p = JSON.parse(localStorage.getItem(k) || '{}'); Object.assign(p, \(env["WK_PREFS"] ?? "{}"));
    if (!('autoResume' in p)) p.autoResume = false; localStorage.setItem(k, JSON.stringify(p)); } catch {}
  """

let app = NSApplication.shared
app.setActivationPolicy(.prohibited)
let win = NSWindow(contentRect: NSRect(x: 0, y: 0, width: W, height: H), styleMask: [.borderless], backing: .buffered, defer: false)
let config = WKWebViewConfiguration()
config.websiteDataStore = .nonPersistent()
config.userContentController.addUserScript(WKUserScript(source: seed, injectionTime: .atDocumentStart, forMainFrameOnly: true))
let wv = WKWebView(frame: win.contentView!.bounds, configuration: config)
win.contentView!.addSubview(wv)
win.ignoresMouseEvents = true; win.level = .floating
win.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary]
// one pixel of it on the main screen, in the first corner where the rest falls on no other screen
if let main = NSScreen.screens.first {
  let f = main.frame, corners = [(f.maxX - 1, f.minY - H + 1), (f.minX - W + 1, f.minY - H + 1), (f.maxX - 1, f.maxY - 1), (f.minX - W + 1, f.maxY - 1)]
  // a mirror of the main screen has its frame (2026-10-13: a display mirrored left no corner clear): the same pixels,
  // not another screen the window could show on
  let others = NSScreen.screens.dropFirst().filter { $0.frame != f }
  let spot = corners.first { c in others.allSatisfy { !$0.frame.intersects(NSRect(x: c.0, y: c.1, width: W, height: H)) } }
  if let (x, y) = spot { win.setFrameOrigin(NSPoint(x: x, y: y)) } else { fail("no corner of the main screen is clear of the others") }
}
win.orderFrontRegardless()

func run(_ js: String, _ argv: [String: Any], _ done: @escaping (String) -> Void) {
  wv.callAsyncJavaScript("return JSON.stringify(await (async () => { \(js) })()) ?? 'undefined'", arguments: argv, in: nil, in: .page) { r in
    switch r {
    case .success(let v): done(v as? String ?? "\(String(describing: v))")
    case .failure(let e): fail("EXCEPTION: " + ((e as NSError).userInfo["WKJavaScriptExceptionMessage"] as? String ?? "\(e)"))
    }
  }
}
// The window's pixels in sRGB, as the page's colours are written: the capture is in the display's space.
func srgb(_ img: CGImage) -> NSBitmapImageRep {
  let ctx = CGContext(data: nil, width: img.width, height: img.height, bitsPerComponent: 8, bytesPerRow: 0,
                      space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!
  ctx.draw(img, in: CGRect(x: 0, y: 0, width: img.width, height: img.height))
  return NSBitmapImageRep(cgImage: ctx.makeImage()!)
}
typealias Capture = @convention(c) (CGRect, UInt32, UInt32, UInt32) -> Unmanaged<CGImage>?
// unavailable in the SDK since macOS 15, still in the system: looked up by name
let capture = unsafeBitCast(dlsym(dlopen(nil, RTLD_NOW), "CGWindowListCreateImage"), to: Capture.self)

func finish() {
  wv.evaluateJavaScript("JSON.stringify(window.__wkErrs || [])") { v, _ in
    if let s = v as? String, s != "[]" { fail("page JS errors: " + s) }
    exit(0)
  }
}
final class Loaded: NSObject, WKNavigationDelegate {
  var once = false
  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
    if once { return }; once = true
    // the web process's pid, for a caller that reads its CPU time (scripts/perf.mjs, 2026-10-13)
    if let f = env["WK_PIDFILE"], let pid = webView.value(forKey: "_webProcessIdentifier") as? NSNumber {
      try? "\(pid.intValue)".write(toFile: f, atomically: true, encoding: .utf8)
    }
    run(tools + ready + body, ["HASH": env["WK_HASH"] ?? ""]) { out in
      print(out)
      if shotPath.isEmpty && then.isEmpty { return finish() }
      DispatchQueue.main.asyncAfter(deadline: .now() + settle) {
        // optionIncludingWindow (1 << 3), boundsIgnoreFraming (1 << 0)
        guard let img = capture(.null, 1 << 3, UInt32(win.windowNumber), 1)?.takeRetainedValue() else { fail("no image of the window") }
        let png = srgb(img).representation(using: .png, properties: [:])!
        if !shotPath.isEmpty {
          do { try png.write(to: URL(fileURLWithPath: shotPath)) } catch { fail("cannot write \(shotPath): \(error)") }
          FileHandle.standardError.write("screenshot → \(shotPath)\n".data(using: .utf8)!)
        }
        if then.isEmpty { return finish() }
        run(tools + shotTools + then, ["PNG": png.base64EncodedString()]) { out in print(out); finish() }
      }
    }
  }
  func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { fail("load failed: \(error.localizedDescription)") }
  func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
    fail("load failed: \(error.localizedDescription) — is the server running at \(CommandLine.arguments[1])?")
  }
}
let loaded = Loaded()
wv.navigationDelegate = loaded
if url.isFileURL { wv.loadFileURL(url, allowingReadAccessTo: url.deletingLastPathComponent()) } else { wv.load(URLRequest(url: url)) }
DispatchQueue.main.asyncAfter(deadline: .now() + timeout) { fail("timed out after \(Int(timeout)) s") }
app.run()
