// peixAIrada.app — a thin native shell around the board.
//
// It owns the Node server (starts it on launch, stops it on quit), shows the UI in a WKWebView, and
// adds the things a web page cannot do on its own: a Dock badge and menu-bar counter for sessions
// waiting on you, and real notifications that come from this app (not from "Script Editor") and open
// the right session when clicked.
//
// The page knows it is in the app (the `hub` message handler) and posts what the shell needs — the chats waiting on you,
// each alert, the pane's places — and takes the shell's word back through window.peix* calls.

import Cocoa
import WebKit
import UserNotifications

let kPort = ProcessInfo.processInfo.environment["PEIXAIRADA_PORT"].flatMap(Int.init) ?? 7331
let kURL = URL(string: "http://127.0.0.1:\(kPort)/")!
let kFrameName = "peixairada.main"   // the window's frame in the defaults — off while ⌃⌘F fills the screen
let kFillKey = "peixairada.fill"      // whether the board filled the screen when it was last up: a relaunch comes back filled
let kLog = FileManager.default.homeDirectoryForCurrentUser
  .appendingPathComponent("Library/Logs/peixairada.log")
let kAppLog = FileManager.default.homeDirectoryForCurrentUser
  .appendingPathComponent("Library/Logs/peixairada-app.log")

/// WebKit reports a navigation that a *newer* one replaced as a failure: NSURLErrorCancelled, -999.
/// It is not one. At launch the "Starting the server…" page is still provisional when a server that is
/// already up (the launchd agent) lets `web.load(kURL)` follow within milliseconds; taking the cancel
/// for "could not reach the server" put that message up instead of the board — and its own load
/// then cancelled the board's. Every navigation-failure callback drops these.
func isCancelled(_ error: Error) -> Bool {
  let e = error as NSError
  return e.domain == NSURLErrorDomain && e.code == NSURLErrorCancelled
}

/// A Swift string as a JavaScript literal, for the calls the shell makes into the board (a page's address).
func jsStr(_ s: String) -> String {
  var out = ""
  for c in s.unicodeScalars {
    switch c {
    case "\\": out += "\\\\"
    case "'": out += "\\'"
    case "\n", "\r", "\u{2028}", "\u{2029}": out += " "
    default: out.unicodeScalars.append(c)
    }
  }
  return "'" + out + "'"
}

/// The find bar's highlight *is* the page's selection: this is how it is taken away again.
let kDropSelection = "window.getSelection && window.getSelection().removeAllRanges()"

/// Append a line to the app log — the only way to see what the shell is doing once it is a bundle. One formatter and
/// one handle, kept open (2026-09-27: a formatter made and the file opened, sought and closed per line, on the main
/// thread, for tens of lines a minute).
let logStamp = ISO8601DateFormatter()
var logHandle: FileHandle?
func logLine(_ s: String) {
  let line = "\(logStamp.string(from: Date())) \(s)\n"
  if logHandle == nil {
    if !FileManager.default.fileExists(atPath: kAppLog.path) {
      FileManager.default.createFile(atPath: kAppLog.path, contents: nil)
    }
    logHandle = try? FileHandle(forWritingTo: kAppLog)
    logHandle?.seekToEndOfFile()
  }
  logHandle?.write(Data(line.utf8))
}

// ---------------------------------------------------------------------------------------------
// Server lifecycle
// ---------------------------------------------------------------------------------------------

final class ServerController {
  private var process: Process?
  private(set) var adopted = false      // true when a server was already running and we just attached

  /// The node that runs the server ships inside the bundle: build.sh copies the one that ran
  /// `npm install`, so node-pty's native addon matches it. Finding a node on the machine from a
  /// GUI app was the fragile part of this whole thing — bare launchd PATH, mise activating only in
  /// interactive shells, shell-integration escapes in the shell's output — and is gone with it.
  /// `PEIXAIRADA_NODE` still overrides, for running against a different node.
  static func nodePath() -> String? {
    if let override = ProcessInfo.processInfo.environment["PEIXAIRADA_NODE"], isExec(override) { return override }
    if let bundled = Bundle.main.url(forResource: "node", withExtension: nil)?.path, isExec(bundled) { return bundled }
    return nil
  }

  private static func isExec(_ path: String) -> Bool {
    FileManager.default.isExecutableFile(atPath: path)
  }

  /// The smallest answer the server has had from the start — every session summarized, 584 KB, was the probe until
  /// 2026-09-27, twelve times a minute from the watchdog.
  static func isServing(_ completion: @escaping (Bool) -> Void) {
    var req = URLRequest(url: kURL.appendingPathComponent("api/projects"))
    req.timeoutInterval = 1.2
    URLSession.shared.dataTask(with: req) { _, resp, _ in
      completion((resp as? HTTPURLResponse)?.statusCode == 200)
    }.resume()
  }

  /// Calls back with nil on success, or a message to show the user. On the main thread throughout: `process` and
  /// `adopted` are read and written by stop() and restart() there, and the probe answers on URLSession's own queue.
  func start(_ done: @escaping (String?) -> Void) {
    ServerController.isServing { [weak self] running in DispatchQueue.main.async {
      guard let self else { return }
      if running {                        // a server is already up (launchd, or a terminal) — use it
        self.adopted = true
        done(nil)
        return
      }
      guard let node = ServerController.nodePath() else {
        done("""
        This app bundle has no node binary. Rebuild it with mac/build.sh (it copies the node that
        ran npm install), point PEIXAIRADA_NODE at one, or start the server yourself with
        `npm start` and reopen this app.
        """)
        return
      }
      guard let script = Bundle.main.url(forResource: "server", withExtension: "mjs") else {
        done("server.mjs is missing from the app bundle.")
        return
      }
      let p = Process()
      p.executableURL = URL(fileURLWithPath: node)
      p.arguments = [script.path]
      p.currentDirectoryURL = script.deletingLastPathComponent()
      var env = ProcessInfo.processInfo.environment
      env["PORT"] = String(kPort)
      env["NOTIFY"] = "off"               // this app posts the notifications instead
      p.environment = env
      // appended, like the app's own log: createFile on an existing path truncated it, and Restart Server from the
      // menu wiped the run being looked into (2026-09-27)
      if !FileManager.default.fileExists(atPath: kLog.path) {
        FileManager.default.createFile(atPath: kLog.path, contents: nil)
      }
      if let h = try? FileHandle(forWritingTo: kLog) {
        h.seekToEndOfFile(); p.standardOutput = h; p.standardError = h
      }
      do { try p.run() } catch {
        done("Could not start the server: \(error.localizedDescription)")
        return
      }
      self.process = p
      self.waitUntilUp(attempts: 40, done)
    } }
  }

  private func waitUntilUp(attempts: Int, _ done: @escaping (String?) -> Void) {
    guard attempts > 0 else {
      DispatchQueue.main.async { done("The server did not come up. See \(kLog.path)") }
      return
    }
    ServerController.isServing { ok in
      if ok { DispatchQueue.main.async { done(nil) } }
      else { DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) { self.waitUntilUp(attempts: attempts - 1, done) } }
    }
  }

  func stop() {
    process?.terminate()
    process = nil
  }

  /// Only once the port has fallen silent: a start right after the terminate found the server still answering while
  /// it shut down, adopted it, and the watchdog reported it gone fifteen seconds later (2026-09-27).
  func restart(_ done: @escaping (String?) -> Void) {
    stop()
    adopted = false
    waitUntilDown(attempts: 20) { self.start(done) }
  }

  private func waitUntilDown(attempts: Int, _ then: @escaping () -> Void) {
    ServerController.isServing { ok in
      DispatchQueue.main.async {
        if !ok || attempts <= 1 { then() }
        else { DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) { self.waitUntilDown(attempts: attempts - 1, then) } }
      }
    }
  }
}

// ---------------------------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------------------------

final class AppDelegate: NSObject, NSApplicationDelegate, WKScriptMessageHandler,
                         WKNavigationDelegate, UNUserNotificationCenterDelegate, NSMenuItemValidation,
                         NSSearchFieldDelegate, NSWindowDelegate {
  var window: BoardWindow!
  var web: BoardWebView!
  var content: NSView!
  var paneOverlay: PaneOverlay!
  // A web view per page (`key`: gh:<a PR's url>, ide:<a folder's editor url>), kept loaded; the page's strip has the tabs.
  var paneViews: [String: WKWebView] = [:]
  var paneOrder: [String] = []                 // least recently shown first — what goes when there are too many
  var paneObs: [String: NSKeyValueObservation] = [:]   // each view's url, watched — the strip shows the address it is on
  var paneFrameC: [String: [NSLayoutConstraint]] = [:] // each view's place in the overlay: leading, top, width, height
  var paneRects: [String: CGRect] = [:]        // …and what the page last said it was, for the find bar
  var paneKeys: [String] = []                  // the open chat's pages — spared by the eviction
  var paneShownKeys: [String] = []             // the pages up, one per half of the chat column; empty hides the overlay
  var paneFocus: String?                       // the one the keys, ⌘F and ‹ › ↻ ↗ act on
  static let paneViewsMax = 8
  var findBar: NSVisualEffectView!             // ⌘F's bar, over the focused page's top right corner; hidden until asked for
  var findRightC: NSLayoutConstraint!         // …placed from that page's rect, so it follows the keys between halves
  var findTopC: NSLayoutConstraint!
  var findField: NSSearchField!
  var findQuery = ""                           // what was last searched for — ⌘G carries on with it after the bar closes
  let paneDelegate = PaneDelegate()
  let server = ServerController()
  var statusItem: NSStatusItem!
  var unread = 0                 // alerts that arrived while the window was not in front
  var needsInput: [[String: String]] = []
  var badged: (unread: Int, waiting: [[String: String]]) = (0, [])   // what the badge and the status menu last showed
  var useUN = false              // native notifications available?
  var fillSaved: (frame: NSRect, mask: NSWindow.StyleMask, opts: NSApplication.PresentationOptions)?   // set while ⌃⌘F fills the screen: what to come back to
  var fillSignal: DispatchSourceSignal!   // SIGUSR1 is ⌃⌘F from a shell
  var fillTick: Timer?                    // while filled: watches the pointer for a hold at the Dock's edge (dockTick)
  var dockOut = false                     // the Dock let out after a hold at its edge, until the pointer is off it again
  var fillMenu: NSApplication.PresentationOptions = []   // filled: the menu bar auto-hidden beside a camera housing, hidden outright without one (placeFill)
  var edgeSince: TimeInterval?            // when the pointer reached the Dock's edge
  var dockSide = "bottom"                 // the Dock's edge, read when the fill starts and when the app comes back (dockEdge)
  static let dockHold: TimeInterval = 0.7 // how long the pointer is held at the edge before the Dock comes out

  func applicationDidFinishLaunching(_ note: Notification) {
    NSApp.setActivationPolicy(.regular)
    buildMenu()
    buildStatusItem()
    buildWindow()
    setUpNotifications()

    NotificationCenter.default.addObserver(forName: NSWindow.didBecomeKeyNotification,
                                           object: window, queue: .main) { [weak self] _ in
      self?.unread = 0; self?.refreshBadges()
    }

    // `kill -USR1 $(pgrep -x peixAIrada)` is ⌃⌘F from a shell: a session in a drawer has no way to press a key in the
    // app short of an Accessibility grant, and the fill is checked from there (the app log says the frame it took).
    signal(SIGUSR1, SIG_IGN)
    fillSignal = DispatchSource.makeSignalSource(signal: SIGUSR1, queue: .main)
    fillSignal.setEventHandler { [weak self] in self?.toggleFill(nil) }
    fillSignal.resume()

    showMessage("Starting the server…")
    bringUpServer()
    Timer.scheduledTimer(withTimeInterval: 5, repeats: true) { [weak self] _ in self?.checkServer() }
  }

  func applicationWillTerminate(_ note: Notification) { server.stop() }
  /// Filled and behind another app, there is no pointer to watch for a hold at the Dock's edge: the poll stops, and
  /// comes back with the app — with the Dock's edge read again, in case it moved meanwhile.
  func applicationDidResignActive(_ note: Notification) { fillTick?.invalidate(); fillTick = nil }
  func applicationDidBecomeActive(_ note: Notification) { if fillSaved != nil && fillTick == nil { startDockTick() } }
  func applicationShouldTerminateAfterLastWindowClosed(_ app: NSApplication) -> Bool { false }
  func applicationShouldHandleReopen(_ app: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
    showWindow(nil); return true
  }

  // ---- UI ------------------------------------------------------------------------------------

  private func buildWindow() {
    let cfg = WKWebViewConfiguration()
    let ucc = WKUserContentController()
    ucc.add(self, name: "hub")   // the page sees the handler and posts its state, its alerts and the pane's places
    cfg.userContentController = ucc
    web = BoardWebView(frame: NSRect(x: 0, y: 0, width: 1440, height: 900), configuration: cfg)
    web.navigationDelegate = self
    // No flash before the page paints (2026-09-27, night): a WKWebView draws white until the document's CSS lands —
    // in dark mode a flash of the wrong colour at every launch and reload. The view draws no ground of its own and
    // the window's is the page's --bg for the appearance in force, so what shows first is what the page will show;
    // underPageBackgroundColor is the same colour for the moments WebKit paints its own ground (an overscroll).
    let ground = NSColor(name: nil) { $0.bestMatch(from: [.aqua, .darkAqua]) == .darkAqua
      ? NSColor(srgbRed: 0x14 / 255, green: 0x14 / 255, blue: 0x13 / 255, alpha: 1)
      : NSColor(srgbRed: 0xf6 / 255, green: 0xf6 / 255, blue: 0xf4 / 255, alpha: 1) }
    web.setValue(false, forKey: "drawsBackground")
    web.underPageBackgroundColor = ground
    // A file dragged in from the Finder: the page gets its path (a browser page never could) and hands
    // it to the chat as an @-mention; while it hovers, the page marks the chat pane.
    web.onDragging = { [weak self] on in self?.web.evaluateJavaScript("window.peixDragging && window.peixDragging(\(on))") }
    web.onFiles = { [weak self] paths in
      guard let self = self, let data = try? JSONSerialization.data(withJSONObject: paths), let json = String(data: data, encoding: .utf8) else { return }
      logLine("drop: \(paths.count) file(s)")
      self.web.evaluateJavaScript("window.peixDrop && window.peixDrop(\(json))")
    }
    if web.responds(to: Selector(("setInspectable:"))) { web.setValue(true, forKey: "inspectable") }

    window = BoardWindow(contentRect: NSRect(x: 0, y: 0, width: 1440, height: 900),
                      styleMask: [.titled, .closable, .resizable, .miniaturizable, .fullSizeContentView],
                      backing: .buffered, defer: false)
    window.title = "peixAIrada"
    // A window built in code releases itself on close, on top of the strong ref above: ⌘W, then a
    // Dock click, and showWindow messages a freed window (SIGSEGV in applicationShouldHandleReopen).
    window.isReleasedWhenClosed = false
    window.titlebarAppearsTransparent = false
    window.backgroundColor = ground   // what shows until the page paints, and behind a web view that draws none (above)
    // The board fills the window; the pane is a transparent overlay over all of it, and each page's web view is
    // placed inside it where the page says — one half of the chat column, or both, below their tab strips. An
    // overlay, not a split: the board's columns never reflow under it, and it lets clicks that miss a page through.
    buildPaneOverlay()
    content = NSView(frame: NSRect(x: 0, y: 0, width: 1440, height: 900))
    web.translatesAutoresizingMaskIntoConstraints = false
    paneOverlay.translatesAutoresizingMaskIntoConstraints = false
    content.addSubview(web); content.addSubview(paneOverlay)
    NSLayoutConstraint.activate([
      web.leadingAnchor.constraint(equalTo: content.leadingAnchor), web.trailingAnchor.constraint(equalTo: content.trailingAnchor),
      web.topAnchor.constraint(equalTo: content.topAnchor), web.bottomAnchor.constraint(equalTo: content.bottomAnchor),
      paneOverlay.leadingAnchor.constraint(equalTo: content.leadingAnchor), paneOverlay.topAnchor.constraint(equalTo: content.topAnchor),
      paneOverlay.trailingAnchor.constraint(equalTo: content.trailingAnchor), paneOverlay.bottomAnchor.constraint(equalTo: content.bottomAnchor)
    ])
    buildFindBar()
    paneOverlay.isHidden = true
    window.contentView = content
    installEscapeMonitor()
    installHotkeyForwarder()
    installPaneClickMonitor()
    window.contentMinSize = NSSize(width: 760, height: 520)
    window.setFrameAutosaveName(kFrameName)
    // No system full screen: it always sits below the camera housing. The green button zooms instead, and
    // windowShouldZoom makes a plain click on it the fill (toggleFill) — ⌥-click and a title bar double-click zoom.
    window.collectionBehavior = [.fullScreenNone]
    window.delegate = self
    window.center()
    window.makeKeyAndOrderFront(nil)
    NSApp.activate(ignoringOtherApps: true)
    if UserDefaults.standard.bool(forKey: kFillKey) { toggleFill(nil) }   // as it was left
    // Filling the screen, the frame is the screen's: it follows the window to another display (Mission Control can
    // drag it there) and through a change of resolution, and the page hears where the housing is now.
    for name in [NSWindow.didChangeScreenNotification, NSApplication.didChangeScreenParametersNotification] {
      NotificationCenter.default.addObserver(forName: name, object: nil, queue: .main) { [weak self] _ in
        guard let self, self.fillSaved != nil, let screen = self.window.screen else { return }
        self.placeFill(on: screen)
        self.tellFill()
      }
    }
  }

  // ---- the pane --------------------------------------------------------------------------------
  // github.com sends `frame-ancestors 'none'`, so the board cannot iframe a pull request. The app
  // shows the chat's pages — its PRs, its folder's VS Code Web — in web views of its own instead: the
  // same window, their own history, the default (persistent) website data store, so the GitHub login
  // survives a relaunch. Since 2026-09-20 (late) the page owns the tabs: each half's strip lists the
  // chat's pages beside the claude/chat and zsh tabs, and every change comes over the bridge as one
  // {type: "pane", id, keys, panes: [{key, left, top, width, height}], focus} — the chat's pages (kept
  // loaded, never evicted), where each page on show goes (a half of the chat column, in the board's CSS
  // px, points here) and which one has the keys. Since 2026-09-22 that list can hold two, one per half.
  // A web view per page, made on first show and never reloaded on a switch; up
  // to paneViewsMax stay alive (an editor is a whole workbench), the least recently shown goes. Esc
  // with the pane up goes to the page (peixKey('Escape')), which puts the chat tab back and hides the
  // pane; ‹ › ↻ ↗ sit in the strip too ({type: "nav", what}).

  private func buildPaneOverlay() {
    paneOverlay = PaneOverlay()
    paneOverlay.wantsLayer = true
    paneOverlay.layer?.backgroundColor = NSColor.clear.cgColor
  }
  /// The web view for a page, made on first use (and then loaded by the caller). Touches the recency order
  /// and lets the oldest go once there are too many — never one of the current chat's.
  private func paneView(for key: String) -> (WKWebView, Bool) {
    if let w = paneViews[key] { paneOrder.removeAll { $0 == key }; paneOrder.append(key); return (w, false) }
    let w = WKWebView(frame: .zero, configuration: WKWebViewConfiguration())
    w.navigationDelegate = paneDelegate
    w.uiDelegate = paneDelegate
    w.allowsBackForwardNavigationGestures = true
    w.allowsMagnification = true                 // pinch to zoom, Safari's own gesture — off by default in a WKWebView
    if w.responds(to: Selector(("setInspectable:"))) { w.setValue(true, forKey: "inspectable") }
    w.translatesAutoresizingMaskIntoConstraints = false
    w.isHidden = true
    w.wantsLayer = true
    w.layer?.backgroundColor = NSColor.windowBackgroundColor.cgColor   // the overlay is clear: a page still loading needs its own
    paneOverlay.addSubview(w)
    let frame = [w.leadingAnchor.constraint(equalTo: paneOverlay.leadingAnchor, constant: 0),
                 w.topAnchor.constraint(equalTo: paneOverlay.topAnchor, constant: 0),
                 w.widthAnchor.constraint(equalToConstant: 100), w.heightAnchor.constraint(equalToConstant: 100)]
    NSLayoutConstraint.activate(frame)
    paneFrameC[key] = frame
    paneViews[key] = w; paneOrder.append(key)
    // Every navigation, a link followed or a pushState inside GitHub included: the strip shows where the view is.
    paneObs[key] = w.observe(\.url) { [weak self] v, _ in self?.tellPaneUrl(key, v.url?.absoluteString) }
    while paneViews.count > AppDelegate.paneViewsMax, let old = paneOrder.first(where: { !paneKeys.contains($0) && $0 != key }) {
      paneViews[old]?.removeFromSuperview(); paneViews[old] = nil; paneOrder.removeAll { $0 == old }
      paneObs[old]?.invalidate(); paneObs[old] = nil
      paneFrameC[old] = nil; paneRects[old] = nil
      logLine("pane: let go of \(old)")
    }
    return (w, true)
  }
  /// The page's word on the pane: the open chat's pages, which of them are up and where, and which has the keys.
  /// A page shown for the first time loads then; a switch between loaded pages loads nothing. Nothing up hides the
  /// overlay and the board takes the keyboard back.
  func setPane(chat id: String?, keys: [String], places: [PanePlace], focus: String?) {
    paneKeys = keys
    var shown: [String] = []
    for pl in places {
      guard let url = URL(string: String(pl.key.drop(while: { $0 != ":" }).dropFirst())) else { continue }
      if !paneKeys.contains(pl.key) { paneKeys.append(pl.key) }
      let (w, fresh) = paneView(for: pl.key)
      if fresh { w.load(URLRequest(url: url)) }
      if let c = paneFrameC[pl.key] {
        c[0].constant = max(0, pl.rect.minX); c[1].constant = max(0, pl.rect.minY)
        c[2].constant = max(1, pl.rect.width); c[3].constant = max(1, pl.rect.height)
      }
      paneRects[pl.key] = pl.rect
      shown.append(pl.key)
      tellPaneUrl(pl.key, w.url?.absoluteString ?? url.absoluteString)
    }
    let was = paneShownKeys, wasFocus = paneFocus
    for (key, v) in paneViews { v.isHidden = !shown.contains(key) }
    paneShownKeys = shown
    paneOverlay.isHidden = shown.isEmpty
    paneFocus = focus.flatMap { shown.contains($0) ? $0 : nil } ?? shown.first
    layoutFindBar()
    guard shown != was || paneFocus != wasFocus else { return }
    closeFind(focusPage: false)
    window.makeFirstResponder(paneFocus.flatMap { paneViews[$0] } ?? web)
    tellPane()
    logLine("pane: \(shown.isEmpty ? "hidden" : shown.joined(separator: " | ")) focus=\(paneFocus ?? "-") pages=\(keys.count)")
  }
  /// The page cannot see the pane — native views over its chat column — so it is told whether one is up and where
  /// the focused one starts (points, which are the board view's CSS px). window.peix reports it for the harness.
  func tellPane() {
    let left = paneFocus.flatMap { paneRects[$0]?.minX } ?? 0
    web.evaluateJavaScript("window.peixPane && window.peixPane(\(paneOverlay.isHidden ? "false" : "true"), \(Int(left)))", completionHandler: nil)
  }
  /// Where a page is now, for the strip to show and copy — with the key it belongs to, since the board may have
  /// moved on to another tab by the time a load finishes. Sent on every pane message too: a board reload forgets it.
  func tellPaneUrl(_ key: String, _ url: String?) {
    guard let url = url, !url.isEmpty else { return }
    web.evaluateJavaScript("window.peixPaneUrl && window.peixPaneUrl(\(jsStr(key)), \(jsStr(url)))", completionHandler: nil)
  }
  /// ⌘W: the board's business first — the half of the chat column the keys are in, or a picker that is up — and
  /// the window only when it says it took neither (2026-09-22, Ricardo: "cmd W should close the focused pan[e]").
  /// It has to be the menu item: a key equivalent is dispatched before any responder, so the page never sees ⌘W.
  @objc func closeHalfOrWindow(_ sender: Any?) {
    web.evaluateJavaScript("window.peixKey ? !!window.peixKey('KeyW', 'cmd') : false") { [weak self] v, _ in
      guard let self, (v as? Bool) != true else { return }
      if self.fillSaved != nil { self.toggleFill(nil) }   // borderless, the window has no close button for performClose to press
      self.window.performClose(nil)
    }
  }
  /// ‹ › ↻ ↗ from the strip, for the page on top.
  func paneNav(_ what: String) {
    guard let w = paneFocus.flatMap({ paneViews[$0] }) else { return }
    switch what {
    case "back": w.goBack()
    case "forward": w.goForward()
    case "reload": w.reload()
    case "external": if let u = w.url { NSWorkspace.shared.open(u) }
    default: break
    }
  }
  // ---- find in page ------------------------------------------------------------------------------
  // ⌘F over a page in the pane, the one thing a browser does that a native web view does not: WKWebView has
  // `find(_:configuration:)` (the same search Safari's bar drives — it selects and scrolls to the match) but no
  // bar to drive it with. This is that bar: a floating strip over the *top right* of the focused page, Chrome's
  // place for it rather than Safari's, because pushing the page down would mean moving its top constraint. It is
  // placed from the rect the board last gave that page, so it follows ⌘1 / ⌘2 between the two halves.
  // It lives in the window's content view, added after the pane, so a web view made later cannot cover it.
  // The keys are the browser's: ⌘F opens it on whatever was last searched for and selects it, ⏎ / ⇧⏎ and ⌘G /
  // ⇧⌘G step, Esc closes it (the pane stays — that Esc never reaches the page), a miss turns the text red.

  private var findOn: Bool { findBar != nil && !findBar.isHidden }

  private func buildFindBar() {
    findBar = NSVisualEffectView()
    findBar.material = .popover          // the popover's own background: light or dark, whichever the Mac is
    findBar.blendingMode = .withinWindow
    findBar.state = .active
    findBar.wantsLayer = true
    findBar.layer?.cornerRadius = 8
    findBar.layer?.masksToBounds = true
    findBar.translatesAutoresizingMaskIntoConstraints = false
    findBar.isHidden = true

    findField = NSSearchField()
    findField.placeholderString = "Find on page"
    findField.sendsWholeSearchString = true    // typing is searched by controlTextDidChange; the action is ⏎ only
    findField.delegate = self
    findField.target = self
    findField.action = #selector(findNext(_:))
    findField.controlSize = .small
    findField.font = NSFont.systemFont(ofSize: 12)
    findField.widthAnchor.constraint(equalToConstant: 190).isActive = true

    let done = NSButton(title: "Done", target: self, action: #selector(findDone(_:)))
    done.bezelStyle = .rounded
    done.controlSize = .small
    done.font = NSFont.systemFont(ofSize: 11)

    let stack = NSStackView(views: [findField, findStep("chevron.up", "Previous match (⇧⌘G)", #selector(findPrevious(_:))),
                                    findStep("chevron.down", "Next match (⌘G)", #selector(findNext(_:))), done])
    stack.orientation = .horizontal
    stack.spacing = 5
    stack.edgeInsets = NSEdgeInsets(top: 6, left: 7, bottom: 6, right: 7)
    stack.translatesAutoresizingMaskIntoConstraints = false
    findBar.addSubview(stack)
    content.addSubview(findBar)
    NSLayoutConstraint.activate([
      stack.leadingAnchor.constraint(equalTo: findBar.leadingAnchor), stack.trailingAnchor.constraint(equalTo: findBar.trailingAnchor),
      stack.topAnchor.constraint(equalTo: findBar.topAnchor), stack.bottomAnchor.constraint(equalTo: findBar.bottomAnchor)
    ])
    findRightC = findBar.trailingAnchor.constraint(equalTo: content.leadingAnchor, constant: 0)
    findTopC = findBar.topAnchor.constraint(equalTo: content.topAnchor, constant: 12)
    NSLayoutConstraint.activate([findRightC, findTopC])
  }
  /// The bar sits over the top right of the page that has the keys — whichever half that is.
  private func layoutFindBar() {
    guard findBar != nil, let r = paneFocus.flatMap({ paneRects[$0] }) else { return }
    findRightC.constant = r.maxX - 14
    findTopC.constant = r.minY + 12
  }

  private func findStep(_ symbol: String, _ tip: String, _ action: Selector) -> NSButton {
    let b = NSButton(image: NSImage(systemSymbolName: symbol, accessibilityDescription: tip) ?? NSImage(),
                     target: self, action: action)
    b.bezelStyle = .texturedRounded
    b.controlSize = .small
    b.toolTip = tip
    return b
  }

  /// ⌘F: the bar comes up on the last query, selected, so typing replaces it and ⏎ carries on with it.
  @objc func findInPage(_ sender: Any?) {
    guard !paneOverlay.isHidden else { return }
    findBar.isHidden = false
    findField.stringValue = findQuery
    findField.textColor = .labelColor
    window.makeFirstResponder(findField)
    findField.currentEditor()?.selectAll(nil)
  }
  @objc func findNext(_ sender: Any?) { stepFind(forward: true) }
  @objc func findPrevious(_ sender: Any?) { stepFind(forward: false) }
  @objc func findDone(_ sender: Any?) { closeFind() }

  /// ⌘G with the bar closed opens it again rather than searching invisibly — the query is still there.
  private func stepFind(forward: Bool) {
    guard !paneOverlay.isHidden, !findQuery.isEmpty else { return }
    if !findOn { findBar.isHidden = false; findField.stringValue = findQuery }
    runFind(fromTop: false, forward: forward)
  }

  func controlTextDidChange(_ note: Notification) {
    guard (note.object as? NSSearchField) === findField else { return }
    findQuery = findField.stringValue
    runFind(fromTop: true, forward: true)
  }

  /// One pass over the page on top. A query that just changed starts from the top of the document — that means
  /// dropping the selection first, since WebKit's find carries on from wherever the last match left it.
  private func runFind(fromTop: Bool, forward: Bool) {
    guard !paneOverlay.isHidden, let w = paneFocus.flatMap({ paneViews[$0] }) else { return }
    let q = findQuery
    guard !q.isEmpty else { findField.textColor = .labelColor; clearFindSelection(); return }
    let go = { [weak self] in
      let cfg = WKFindConfiguration()
      cfg.backwards = !forward
      cfg.caseSensitive = false
      cfg.wraps = true
      w.find(q, configuration: cfg) { res in
        guard let self = self, self.findQuery == q else { return }
        self.findField.textColor = res.matchFound ? .labelColor : .systemRed
      }
    }
    if fromTop { w.evaluateJavaScript(kDropSelection) { _, _ in go() } } else { go() }
  }

  private func clearFindSelection() {
    paneFocus.flatMap({ paneViews[$0] })?.evaluateJavaScript(kDropSelection, completionHandler: nil)
  }

  /// The bar goes, the match's highlight with it (it is the page's selection), and the page takes the keyboard back.
  /// `focusPage` is false when the caller is about to hand the keyboard somewhere itself.
  func closeFind(focusPage: Bool = true) {
    guard findOn else { return }
    findBar.isHidden = true
    findField.textColor = .labelColor
    clearFindSelection()
    guard focusPage else { return }
    let page = paneOverlay.isHidden ? nil : paneFocus.flatMap({ paneViews[$0] })
    window.makeFirstResponder(page ?? web)
  }

  // Esc with the pane up, from the board or from the page in the pane: the page's business (the chat tab comes
  // back and the pane goes) — forwarded as peixKey('Escape') and swallowed, so the window does not also leave full
  // screen (the editor's own Esc is given up for this, by choice). With the pane hidden the key is not touched at
  // all (dialogs, full screen, the rename box keep it).
  private func installEscapeMonitor() {
    NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] e in
      guard let self = self, e.modifierFlags.intersection([.command, .control, .option]).isEmpty else { return e }
      // The find bar takes both keys back from the pane while it is up: Esc closes it (and stops there — the pane
      // stays), ⏎ / ⇧⏎ step the matches from the field, where Esc would otherwise only empty the box.
      if self.findOn {
        if e.keyCode == 53 { self.closeFind(); return nil }
        if e.keyCode == 36, self.findField.currentEditor() != nil {
          self.stepFind(forward: !e.modifierFlags.contains(.shift)); return nil
        }
      }
      guard e.keyCode == 53, !self.paneOverlay.isHidden, let fr = self.window.firstResponder as? NSView else { return e }
      guard fr.isDescendant(of: self.web) || fr.isDescendant(of: self.paneOverlay) else { return e }
      self.web.evaluateJavaScript("window.peixKey && window.peixKey('Escape')", completionHandler: nil)
      return nil
    }
  }
  // ⌥⌘ + one of the board's hotkeys (HOTKEYS in index.html — the same list here, kept by hand): the letters, ↑ ↓ for
  // the chat above or below, ← → for the tab beside, 1 and 2 for the top and bottom halves of a stacked chat column
  // (2026-09-27; by key code, since ⌥ composes a symbol over a digit on a Portuguese layout), W to close the tab the
  // keys are in (2026-09-28 — VS Code Web's own ⌥⌘W, whole word in its find, is given up for it); and ⌘ + one of the
  // layout keys (CMDKEYS there): B folds the
  // chat list, 1 and 2 the left and right halves of the chat column. Pressed while the pane has the keyboard: its web views are not the board's, so the page
  // would never hear it. Forwarded through peixKey as the page's e.code and which map it belongs to; the page asks
  // for the keyboard back ({type: "focus"}) only when it opens a dialog.
  static let boardKeys: Set<String> = ["t", "e", "g", "c", "w", "o", "p", "k", "f", "n"]
  static let cmdKeys: Set<String> = ["b", "0", "1", "2"]
  static func hotkeyCode(_ e: NSEvent) -> (code: String, mods: String)? {
    let held = e.modifierFlags.intersection([.command, .option, .control, .shift])
    let ch = e.charactersIgnoringModifiers?.lowercased()
    if held == [.command, .option] {
      if e.keyCode == 126 { return ("ArrowUp", "altcmd") }
      if e.keyCode == 125 { return ("ArrowDown", "altcmd") }
      if e.keyCode == 123 { return ("ArrowLeft", "altcmd") }
      if e.keyCode == 124 { return ("ArrowRight", "altcmd") }
      if e.keyCode == 18 { return ("Digit1", "altcmd") }
      if e.keyCode == 19 { return ("Digit2", "altcmd") }
      if let ch = ch, boardKeys.contains(ch) { return ("Key" + ch.uppercased(), "altcmd") }
    }
    if held == [.command], let ch = ch, cmdKeys.contains(ch) { return ((ch.first!.isNumber ? "Digit" : "Key") + ch.uppercased(), "cmd") }
    return nil
  }
  // A click on a page in the pane takes the keys to its half (2026-09-28): the board hears a click on its own halves,
  // but a page is a native view over them, so ⌘W, ⌥⌘W and the half's rule went on naming the half the keys were in
  // before. The page answers with a `pane` message, as for any change of half; the click goes on to the page.
  private func installPaneClickMonitor() {
    NSEvent.addLocalMonitorForEvents(matching: .leftMouseDown) { [weak self] e in
      guard let self = self, e.window === self.window, !self.paneOverlay.isHidden else { return e }
      let key = self.paneShownKeys.first { k in
        guard let v = self.paneViews[k], !v.isHidden else { return false }
        return v.bounds.contains(v.convert(e.locationInWindow, from: nil))
      }
      if let key = key, key != self.paneFocus {
        self.web.evaluateJavaScript("window.peixPaneFocus && window.peixPaneFocus(\(jsStr(key)))", completionHandler: nil)
      }
      return e
    }
  }
  private func installHotkeyForwarder() {
    NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] e in
      guard let self = self, !self.paneOverlay.isHidden, let hot = AppDelegate.hotkeyCode(e),
            let fr = self.window.firstResponder as? NSView,
            fr.isDescendant(of: self.paneOverlay) || (self.findBar != nil && fr.isDescendant(of: self.findBar)) else { return e }
      self.web.evaluateJavaScript("window.peixKey && window.peixKey('\(hot.code)', '\(hot.mods)')", completionHandler: nil)
      return nil
    }
  }

  private func showMessage(_ text: String) {
    let esc = text.replacingOccurrences(of: "&", with: "&amp;").replacingOccurrences(of: "<", with: "&lt;")
    web.loadHTMLString("""
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <style>html{color-scheme:light dark}body{margin:0;height:100vh;display:grid;place-items:center;
    font:14px -apple-system,BlinkMacSystemFont,sans-serif;background:#f6f6f4;color:#1c1c1a}
    @media (prefers-color-scheme:dark){body{background:#141413;color:#e8e6df}}
    div{max-width:32em;text-align:center;line-height:1.5}b{display:block;font-size:15px;margin-bottom:6px}</style>
    <div><b>peixAIrada</b>\(esc)</div>
    """, baseURL: nil)
  }

  private func buildStatusItem() {
    statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
    if let img = NSImage(systemSymbolName: "fish.fill", accessibilityDescription: "peixAIrada") {
      img.isTemplate = true
      statusItem.button?.image = img
    } else {
      statusItem.button?.title = "🐟"
    }
    statusItem.button?.imagePosition = .imageLeading
    rebuildStatusMenu()
  }

  private func rebuildStatusMenu() {
    let menu = NSMenu()
    menu.addItem(withTitle: "Show Board", action: #selector(showWindow(_:)), keyEquivalent: "").target = self
    menu.addItem(.separator())
    if needsInput.isEmpty {
      menu.addItem(withTitle: "Nothing waiting on you", action: nil, keyEquivalent: "").isEnabled = false
    } else {
      menu.addItem(withTitle: "Needs your input", action: nil, keyEquivalent: "").isEnabled = false
      for s in needsInput {
        let item = NSMenuItem(title: "  \(s["project"] ?? "")  ·  \(s["title"] ?? "")",
                              action: #selector(openFromMenu(_:)), keyEquivalent: "")
        item.target = self; item.representedObject = s["id"]
        menu.addItem(item)
      }
    }
    menu.addItem(.separator())
    menu.addItem(withTitle: "Reload", action: #selector(reload(_:)), keyEquivalent: "").target = self
    menu.addItem(withTitle: "Restart Server", action: #selector(restartServer(_:)), keyEquivalent: "").target = self
    menu.addItem(withTitle: "Open Server Log", action: #selector(openLog(_:)), keyEquivalent: "").target = self
    menu.addItem(.separator())
    menu.addItem(withTitle: "Quit peixAIrada", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
    statusItem.menu = menu
  }

  private func buildMenu() {
    let main = NSMenu()
    let appItem = NSMenuItem(); main.addItem(appItem)
    let appMenu = NSMenu()
    appMenu.addItem(withTitle: "About peixAIrada", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
    appMenu.addItem(.separator())
    appMenu.addItem(withTitle: "Hide peixAIrada", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
    appMenu.addItem(withTitle: "Quit peixAIrada", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
    appItem.submenu = appMenu

    // A menu bar built in code has no Edit menu unless it makes one — and without these items ⌘C,
    // ⌘V, ⌘X, ⌘A and ⌘Z do nothing anywhere in the app: not in a text field, not in a web view
    // (GitHub's login form), not in the terminal drawer. The key equivalents are dispatched
    // through the menu to the first responder; the items are the mechanism, not decoration.
    let editItem = NSMenuItem(); main.addItem(editItem)
    let edit = NSMenu(title: "Edit")
    edit.addItem(withTitle: "Undo", action: Selector(("undo:")), keyEquivalent: "z")
    edit.addItem(withTitle: "Redo", action: Selector(("redo:")), keyEquivalent: "Z")
    edit.addItem(.separator())
    edit.addItem(withTitle: "Cut", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
    edit.addItem(withTitle: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
    edit.addItem(withTitle: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
    edit.addItem(withTitle: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
    edit.addItem(.separator())
    // Find is the pane's: it searches the page in front of you (GitHub, the editor), the one thing in this window
    // that is a real web page. The board has its own filter boxes and pickers, and the items grey out for it.
    edit.addItem(withTitle: "Find…", action: #selector(findInPage(_:)), keyEquivalent: "f").target = self
    edit.addItem(withTitle: "Find Next", action: #selector(findNext(_:)), keyEquivalent: "g").target = self
    edit.addItem(withTitle: "Find Previous", action: #selector(findPrevious(_:)), keyEquivalent: "G").target = self
    editItem.submenu = edit

    let viewItem = NSMenuItem(); main.addItem(viewItem)
    let view = NSMenu(title: "View")
    view.addItem(withTitle: "Reload", action: #selector(reload(_:)), keyEquivalent: "r").target = self
    view.addItem(withTitle: "Restart Server", action: #selector(restartServer(_:)), keyEquivalent: "R").target = self
    view.addItem(.separator())
    // ⌃⌘F is the board's own full screen (toggleFill), not the system's. AppKit adds an Enter Full Screen of its own to
    // any View menu without a toggleFullScreen: item — the default below keeps it out; the green button stays the system's.
    UserDefaults.standard.register(defaults: ["NSFullScreenMenuItemEverywhere": false])
    let full = view.addItem(withTitle: "Enter Full Screen", action: #selector(toggleFill(_:)), keyEquivalent: "f")
    full.keyEquivalentModifierMask = [.control, .command]; full.target = self
    viewItem.submenu = view

    let winItem = NSMenuItem(); main.addItem(winItem)
    let win = NSMenu(title: "Window")
    win.addItem(withTitle: "Minimize", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m")
    win.addItem(withTitle: "Close", action: #selector(closeHalfOrWindow(_:)), keyEquivalent: "w").target = self
    winItem.submenu = win
    NSApp.mainMenu = main
    NSApp.windowsMenu = win
  }

  // ---- actions ---------------------------------------------------------------------------------

  @objc func showWindow(_ sender: Any?) {
    window.makeKeyAndOrderFront(nil)
    NSApp.activate(ignoringOtherApps: true)
  }
  /// ⌘R reloads what you are looking at: the page on top of the pane while the pane is up (GitHub, the editor —
  /// the board's own tab strip has ↻ for it too), the board itself otherwise. The menu item says which.
  @objc func reload(_ sender: Any?) {
    if let w = paneFocus.flatMap({ paneViews[$0] }), !paneOverlay.isHidden { w.reload(); return }
    web.load(URLRequest(url: kURL))
  }
  func validateMenuItem(_ item: NSMenuItem) -> Bool {
    let paneUp = paneOverlay != nil && !paneOverlay.isHidden
    if item.action == #selector(reload(_:)) {
      item.title = paneUp ? "Reload Page" : "Reload"
    }
    if item.action == #selector(toggleFill(_:)) {
      item.title = fillSaved != nil ? "Exit Full Screen" : "Enter Full Screen"
    }
    if item.action == #selector(findInPage(_:)) { return paneUp }
    if item.action == #selector(findNext(_:)) || item.action == #selector(findPrevious(_:)) {
      return paneUp && !findQuery.isEmpty
    }
    return true
  }
  @objc func openLog(_ sender: Any?) { NSWorkspace.shared.open(kLog) }
  /// ⌃⌘F, and the green button: the board fills the screen, the strip beside the camera housing included (2026-09-27,
  /// Ricardo: "fullscreen app on a macbook with a notch, we don't really use that upper real estate"). Not the system's
  /// full screen: that one always sets the window below the housing and leaves the strip black — it is where the
  /// auto-hidden menu bar slides in — and nothing in AppKit changes it (its own doc for NSScreen.safeAreaInsets says
  /// so), which is why the window does not offer it at all (fullScreenNone; Ricardo: "If I click on the fullscreen
  /// button (mac's green circle), I end up as before"). This is what Apple calls a custom full-screen experience,
  /// kitty's and Sublime Text's: the window borderless, its frame the whole screen, the menu bar auto-hidden and the
  /// Dock hidden, out only after a hold at its edge (dockTick) — on a screen with a housing; without one the menu bar
  /// is hidden outright (placeFill). The page is told where the housing is (tellFill) and
  /// lays its top row around it. No Space of its own —
  /// Mission Control shows a window. The frame's autosave is off meanwhile, so a quit mid-fill does not bring the next
  /// launch up screen-sized; the fill itself is remembered (kFillKey), so it does come back filled. Info.plist says
  /// NSPrefersDisplaySafeAreaCompatibilityMode = false, or a window behind the housing could switch the display into
  /// the shrunken compatibility mode.
  @objc func toggleFill(_ sender: Any?) {
    if let saved = fillSaved {
      fillSaved = nil
      fillTick?.invalidate(); fillTick = nil; dockOut = false; edgeSince = nil
      NSApp.presentationOptions = saved.opts
      window.styleMask = saved.mask
      window.fill = false
      window.setFrame(saved.frame, display: true)
      window.setFrameAutosaveName(kFrameName)
    } else {
      guard let screen = window.screen ?? NSScreen.main else { return }
      fillSaved = (window.frame, window.styleMask, NSApp.presentationOptions)
      window.setFrameAutosaveName("")
      window.fill = true
      window.styleMask = .borderless
      placeFill(on: screen)
      startDockTick()
    }
    window.makeKeyAndOrderFront(nil)
    window.makeFirstResponder(paneFocus.flatMap { paneViews[$0] } ?? web)   // a new style mask can drop the first responder
    UserDefaults.standard.set(fillSaved != nil, forKey: kFillKey)
    // The visible frame says whether the options took: filled, it is the whole screen (the Dock and the menu bar gone).
    logLine("fill: \(fillSaved != nil ? "on \(NSStringFromRect(window.frame))" : "off") options \(NSApp.presentationOptions.rawValue) visible \(NSStringFromRect(window.screen?.visibleFrame ?? .zero))")
    tellFill()
  }
  /// What becomes of the menu bar in the fill, per screen (2026-09-28, Ricardo: "on the external monitor: I want the
  /// full app experience, to maximize vertical space. on my macbook, I want that the notch to be there, but also
  /// maximize vertical space"). Both take the whole screen; what tells them apart is the camera housing, which the
  /// screen reports exactly (a top safe-area inset) — no guessing from the resolution, and it follows the lid, a display
  /// plugged in and mirroring (mirrored, the one screen is the external's). Beside a housing the strip either side of it
  /// is the menu bar's and the board's both: the menu bar auto-hidden, sliding into the strip at the top edge, the page
  /// laying its top row around the housing (tellFill). Without one there is no such strip — an auto-hidden menu bar
  /// slid over the search box and the chat's title at every reach for the top edge ("the menu bar is showing and
  /// overlapping the app") — so it is hidden outright while the board is in front. The Dock is hidden on both
  /// (dockTick lets it out). Run on the fill and on every change of screen.
  func placeFill(on screen: NSScreen) {
    fillMenu = screen.safeAreaInsets.top > 0 ? [.autoHideMenuBar] : [.hideMenuBar]
    NSApp.presentationOptions = dockOut ? AppDelegate.dockOutOptions : fillMenu.union(.hideDock)
    if window.frame != screen.frame { window.setFrame(screen.frame, display: true) }
  }
  /// The Dock let out: auto-hidden, with the menu bar auto-hidden too on every screen — AppKit refuses hideMenuBar
  /// without hideDock (an exception, not a no-op).
  static let dockOutOptions: NSApplication.PresentationOptions = [.autoHideMenuBar, .autoHideDock]
  /// The Dock's edge of the screen, from its own preference: bottom unless it says left or right.
  static func dockEdge() -> String { UserDefaults(suiteName: "com.apple.dock")?.string(forKey: "orientation") ?? "bottom" }
  /// The poll, in .common so it runs under menu tracking too; the Dock's edge read once here, not on every tick
  /// (a UserDefaults suite made ten times a second, 2026-09-27).
  func startDockTick() {
    dockSide = AppDelegate.dockEdge()
    let t = Timer(timeInterval: 0.1, repeats: true) { [weak self] _ in self?.dockTick() }
    RunLoop.main.add(t, forMode: .common); fillTick = t
  }
  /// Ten times a second while filled. The Dock is hidden outright (hideDock): auto-hidden it came out under every touch
  /// of the right edge, where the chat column's own controls are (Ricardo, 2026-09-27: "the dock is still visible").
  /// A pointer *held* at its edge for dockHold lets it out (autoHideDock, with the pointer already there) until the
  /// pointer is 100 px off that edge again — the system full screen's kind of push (then: "the dock is not showing
  /// when I go to the edge on the right"). Polled, not tracked: the pointer is over web views and native views alike.
  func dockTick() {
    guard fillSaved != nil, let screen = window.screen else { return }
    let p = NSEvent.mouseLocation, f = screen.frame, now = Date().timeIntervalSinceReferenceDate
    guard f.insetBy(dx: -2, dy: -2).contains(p) else { return }   // on another screen
    let at: Bool, off: Bool
    switch dockSide {
    case "left": at = p.x <= f.minX + 2; off = p.x > f.minX + 100
    case "right": at = p.x >= f.maxX - 2; off = p.x < f.maxX - 100
    default: at = p.y <= f.minY + 2; off = p.y > f.minY + 100
    }
    if dockOut {
      if off { dockOut = false; NSApp.presentationOptions = fillMenu.union(.hideDock); logLine("dock: back") }
    } else if at {
      if let since = edgeSince, now - since >= AppDelegate.dockHold {
        dockOut = true; edgeSince = nil; NSApp.presentationOptions = AppDelegate.dockOutOptions; logLine("dock: out")
      } else if edgeSince == nil { edgeSince = now }
    } else { edgeSince = nil }
  }
  /// The green button, and a title bar double-click, come here as a zoom (fullScreenNone above): a plain click on the
  /// button is the fill; ⌥-click, and the double-click, zoom as they always did. The button's click is the current
  /// event — one click, ⌥ up; a zoom asked for any other way is left alone.
  func windowShouldZoom(_ window: NSWindow, toFrame newFrame: NSRect) -> Bool {
    guard let e = NSApp.currentEvent, e.type == .leftMouseUp || e.type == .leftMouseDown, e.clickCount <= 1,
          !e.modifierFlags.contains(.option) else { return true }
    toggleFill(nil)
    return false
  }
  /// The page hears of the fill (peixFill): on or off and, on a screen with a camera housing, where the housing is in
  /// its own px — the strip's height and the x range the housing covers — so its top row keeps out of it and uses the
  /// strips either side. Sent on every toggle, on a change of screen, and when the board has loaded (a reload forgets).
  func tellFill() {
    var notch = "null"
    if fillSaved != nil, let screen = window.screen, screen.safeAreaInsets.top > 0,
       let l = screen.auxiliaryTopLeftArea, let r = screen.auxiliaryTopRightArea {
      notch = "{top: \(screen.safeAreaInsets.top), left: \(l.maxX - window.frame.minX), right: \(r.minX - window.frame.minX)}"
    }
    web.evaluateJavaScript("window.peixFill && window.peixFill(\(fillSaved != nil), \(notch))", completionHandler: nil)
  }
  @objc func restartServer(_ sender: Any?) {
    showMessage("Restarting the server…")
    bringUpServer(restart: true)
  }

  // ---- watchdog --------------------------------------------------------------------------------
  // The server can vanish under the app: an adopted one was never ours to watch, and a
  // `pkill -f server.mjs` aimed at a throwaway test server matches this one too. The page keeps
  // showing the last board and every button on it just fails, so poll and bring it back.
  private var misses = 0
  private var recovering = false          // a start is in flight — don't race it with a second one

  private func bringUpServer(restart: Bool = false) {
    recovering = true
    let done: (String?) -> Void = { [weak self] problem in
      guard let self else { return }
      self.recovering = false; self.misses = 0
      if let problem { self.showMessage(problem) } else { self.web.load(URLRequest(url: kURL)) }
    }
    if restart { server.restart(done) } else { server.start(done) }
  }

  private func checkServer() {
    guard !recovering else { return }
    ServerController.isServing { [weak self] ok in
      DispatchQueue.main.async {
        guard let self, !self.recovering else { return }
        self.misses = ok ? 0 : self.misses + 1
        guard self.misses >= 3 else { return }   // ~15 s of silence, not one slow answer
        logLine("watchdog: nothing answering on :\(kPort) — starting the server")
        self.showMessage("The server stopped — starting it again…")
        self.bringUpServer()
      }
    }
  }
  @objc func openFromMenu(_ sender: NSMenuItem) {
    guard let id = sender.representedObject as? String else { return }
    open(sessionId: id)
  }

  private func open(sessionId: String) {
    showWindow(nil)
    let safe = sessionId.replacingOccurrences(of: "'", with: "")
    web.evaluateJavaScript("location.hash = '\(safe)'", completionHandler: nil)
  }

  private func refreshBadges() {
    guard badged.unread != unread || badged.waiting != needsInput else { return }   // the status menu was rebuilt per message before (2026-09-27)
    badged = (unread, needsInput)
    NSApp.dockTile.badgeLabel = unread > 0 ? String(unread) : nil
    let waiting = needsInput.count
    statusItem.button?.title = waiting > 0 ? " \(waiting)" : (unread > 0 ? " \(unread)" : "")
    rebuildStatusMenu()
  }

  // ---- bridge ----------------------------------------------------------------------------------

  func userContentController(_ ucc: WKUserContentController, didReceive message: WKScriptMessage) {
    guard let body = message.body as? [String: Any], let type = body["type"] as? String else { return }
    switch type {
    case "state":   // the chats waiting on you, posted by the page when that changes (48k `state:` log lines before, one per burst)
      let asked = Set(needsInput.map { $0["id"] ?? "" })
      needsInput = (body["needs"] as? [[String: Any]] ?? []).map {
        ["id": $0["id"] as? String ?? "", "project": $0["project"] as? String ?? "",
         "title": $0["title"] as? String ?? ""]
      }
      refreshBadges()
      // A chat that starts asking while the app is in the back bounces the Dock icon once (2026-09-27, night): a
      // question is the stopped state, and the badge only counts. AppKit ignores the request while the app is active,
      // and takes it back when the app comes to the front.
      if !NSApp.isActive, needsInput.contains(where: { !asked.contains($0["id"] ?? "") }) { NSApp.requestUserAttention(.informationalRequest) }
    case "alert":
      let focused = window.isKeyWindow && NSApp.isActive
      // Quiet: notifications are off (the board's cog). The Dock still counts it; no banner.
      let quiet = body["quiet"] as? Bool ?? false
      logLine("alert: kind=\(body["kind"] as? String ?? "?") project=\(body["project"] as? String ?? "?") focused=\(focused) serverNotify=\(body["serverNotify"] as? Bool ?? false) quiet=\(quiet) useUN=\(useUN)")
      if !focused { unread += 1; refreshBadges() }
      // If the user is running a server that already posts its own notifications, don't double up.
      let serverNotifies = body["serverNotify"] as? Bool ?? false
      if !focused && !serverNotifies && !quiet {
        notify(kind: body["kind"] as? String ?? "reply",
               project: body["project"] as? String ?? "",
               title: body["title"] as? String ?? "",
               snippet: body["snippet"] as? String ?? "",
               sessionId: body["sessionId"] as? String ?? "")
      }
    case "pane":
      let places: [PanePlace] = (body["panes"] as? [[String: Any]] ?? []).compactMap { r in
        guard let key = r["key"] as? String else { return nil }
        let d = { (n: String) in CGFloat((r[n] as? Double) ?? 0) }
        return PanePlace(key: key, rect: CGRect(x: d("left"), y: d("top"), width: d("width"), height: d("height")))
      }
      setPane(chat: body["id"] as? String, keys: body["keys"] as? [String] ?? [], places: places, focus: body["focus"] as? String)
    case "nav":
      paneNav(body["what"] as? String ?? "")
    case "chat":   // the open chat (2026-09-27, night): the window is named after it, and its folder is the represented file
      let title = body["title"] as? String ?? "", project = body["project"] as? String ?? "", cwd = body["cwd"] as? String ?? ""
      window.title = title.isEmpty ? "peixAIrada" : (project.isEmpty ? title : "\(project) · \(title)")
      window.representedURL = cwd.isEmpty ? nil : URL(fileURLWithPath: cwd, isDirectory: true)   // the proxy icon, and ⌘-click on the title for the path
    case "focus":
      window.makeFirstResponder(web)
    case "external":
      if let s = body["url"] as? String, let url = URL(string: s) { NSWorkspace.shared.open(url) }
    default: break
    }
  }

  // ---- notifications ----------------------------------------------------------------------------

  private func setUpNotifications() {
    guard Bundle.main.bundleIdentifier != nil else { return }
    let center = UNUserNotificationCenter.current()
    center.delegate = self
    center.getNotificationSettings { settings in
      logLine("notifications: current authorization = \(settings.authorizationStatus.rawValue)")
    }
    center.requestAuthorization(options: [.alert, .sound]) { [weak self] granted, error in
      DispatchQueue.main.async {
        self?.useUN = granted && error == nil
        logLine("notifications: granted=\(granted) error=\(error?.localizedDescription ?? "none") → useUN=\(granted && error == nil)")
      }
    }
  }

  private func notify(kind: String, project: String, title: String, snippet: String, sessionId: String) {
    let heading = (kind == "reply" ? "Claude replied" : "Claude needs input") + (project.isEmpty ? "" : " · \(project)")
    let body = [title, snippet].filter { !$0.isEmpty }.joined(separator: "\n")
    guard useUN else {
      logLine("notify: falling back to osascript (useUN=false)")
      return notifyViaAppleScript(heading, title, snippet)
    }
    let content = UNMutableNotificationContent()
    content.title = heading
    content.body = body
    content.sound = .default
    content.userInfo = ["sessionId": sessionId]
    let req = UNNotificationRequest(identifier: sessionId.isEmpty ? UUID().uuidString : sessionId,
                                    content: content, trigger: nil)
    UNUserNotificationCenter.current().add(req) { [weak self] err in
      logLine("notify: UN add \(err.map { "failed: \($0.localizedDescription)" } ?? "ok")")
      if err != nil { DispatchQueue.main.async { self?.notifyViaAppleScript(heading, title, snippet) } }
    }
  }

  /// Fallback when notification authorization is unavailable (unsigned build, permission denied).
  private func notifyViaAppleScript(_ heading: String, _ subtitle: String, _ body: String) {
    let p = Process()
    p.executableURL = URL(fileURLWithPath: "/usr/bin/osascript")
    p.arguments = ["-e", "on run argv",
                   "-e", "display notification (item 3 of argv) with title (item 1 of argv) subtitle (item 2 of argv) sound name \"Glass\"",
                   "-e", "end run", heading, subtitle, body]
    try? p.run()
  }

  func userNotificationCenter(_ center: UNUserNotificationCenter,
                              didReceive response: UNNotificationResponse,
                              withCompletionHandler completionHandler: @escaping () -> Void) {
    if let id = response.notification.request.content.userInfo["sessionId"] as? String, !id.isEmpty {
      open(sessionId: id)
    } else {
      showWindow(nil)
    }
    completionHandler()
  }

  func userNotificationCenter(_ center: UNUserNotificationCenter,
                              willPresent notification: UNNotification,
                              withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
    completionHandler([.banner, .sound])
  }

  // ---- navigation ---------------------------------------------------------------------------------

  /// Keep the app on the board; anything external (PR links, docs) opens in the real browser.
  func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
               decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
    if let url = action.request.url, action.navigationType == .linkActivated,
       url.host != "127.0.0.1" {
      NSWorkspace.shared.open(url)
      return decisionHandler(.cancel)
    }
    decisionHandler(.allow)
  }

  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { tellFill() }   // a reload forgets the fill
  func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
    if isCancelled(error) { return }
    showMessage("Could not load the board: \(error.localizedDescription)")
  }
  func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
    if isCancelled(error) { return }
    showMessage("Could not reach the server on port \(kPort): \(error.localizedDescription)")
  }
}

/// The pane's own delegate: it navigates *inside* the pane (the board's delegate would send every
/// non-local link to the system browser), keeps GitHub's target=_blank links in the pane — a web
/// view with no UI delegate silently drops those — and hands non-web schemes (mailto:, vscode:) out.
/// The board's web view, with Finder drops taken before WebKit sees them. A web page only ever gets a
/// dropped file's bytes; the shell gets its path from the pasteboard — and a path is what claude wants.
/// A drag without file URLs (the page's own row drags, text) goes to WebKit untouched, and a drag this
/// view takes is kept from WebKit at every step, so it never hears of a session it did not start.
final class BoardWebView: WKWebView {
  var onFiles: (([String]) -> Void)?
  var onDragging: ((Bool) -> Void)?
  private var mine = false
  private func filePaths(_ info: NSDraggingInfo) -> [String] {
    let pb = info.draggingPasteboard
    guard pb.types?.contains(.fileURL) == true,
          let urls = pb.readObjects(forClasses: [NSURL.self], options: [.urlReadingFileURLsOnly: true]) as? [URL] else { return [] }
    return urls.map { $0.path }
  }
  override func draggingEntered(_ sender: NSDraggingInfo) -> NSDragOperation {
    mine = !filePaths(sender).isEmpty
    if mine { onDragging?(true); return .copy }
    return super.draggingEntered(sender)
  }
  override func draggingUpdated(_ sender: NSDraggingInfo) -> NSDragOperation { mine ? .copy : super.draggingUpdated(sender) }
  override func draggingExited(_ sender: NSDraggingInfo?) {
    if mine { mine = false; onDragging?(false) } else { super.draggingExited(sender) }
  }
  override func prepareForDragOperation(_ sender: NSDraggingInfo) -> Bool { mine ? true : super.prepareForDragOperation(sender) }
  override func performDragOperation(_ sender: NSDraggingInfo) -> Bool {
    guard mine else { return super.performDragOperation(sender) }
    onDragging?(false)
    let paths = filePaths(sender)
    if !paths.isEmpty { onFiles?(paths) }
    return true
  }
  override func concludeDragOperation(_ sender: NSDraggingInfo?) { if !mine { super.concludeDragOperation(sender) } }
  override func draggingEnded(_ sender: NSDraggingInfo) { if mine { mine = false } else { super.draggingEnded(sender) } }
}

final class PaneDelegate: NSObject, WKNavigationDelegate, WKUIDelegate {
  func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
               for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
    if let url = navigationAction.request.url { webView.load(URLRequest(url: url)) }
    return nil
  }
  func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
               decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
    if let url = action.request.url, let scheme = url.scheme?.lowercased(), !["http", "https", "about", "blob", "data"].contains(scheme) {
      NSWorkspace.shared.open(url)
      return decisionHandler(.cancel)
    }
    decisionHandler(.allow)
  }
  func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
    if isCancelled(error) { return }
    logLine("pane: could not load \(webView.url?.absoluteString ?? "?"): \(error.localizedDescription)")
  }
}

/// The pane's overlay covers the whole window so each page can sit where the board puts it. A click that lands on
/// none of them belongs to the board underneath, so the overlay never claims one for itself.
final class PaneOverlay: NSView {
  override func hitTest(_ point: NSPoint) -> NSView? { let v = super.hitTest(point); return v === self ? nil : v }
}

/// A page on show and the rect the board gave it, in the board view's CSS px (points here).
struct PanePlace { let key: String; let rect: CGRect }

/// The board's window. Borderless — ⌃⌘F's fill — a bare NSWindow refuses the keys, and its frame would be pulled back
/// under the menu bar: while `fill` is on, the frame is left exactly where it was put, the whole screen.
final class BoardWindow: NSWindow {
  var fill = false
  override var canBecomeKey: Bool { true }
  override var canBecomeMain: Bool { true }
  override func constrainFrameRect(_ frameRect: NSRect, to screen: NSScreen?) -> NSRect {
    fill ? frameRect : super.constrainFrameRect(frameRect, to: screen)
  }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.run()
