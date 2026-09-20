// peixAIrada.app — a thin native shell around the board.
//
// It owns the Node server (starts it on launch, stops it on quit), shows the UI in a WKWebView, and
// adds the things a web page cannot do on its own: a Dock badge and menu-bar counter for sessions
// waiting on you, and real notifications that come from this app (not from "Script Editor") and open
// the right session when clicked.
//
// The web UI is untouched: a small injected script opens its own SSE stream and forwards a summary.

import Cocoa
import WebKit
import UserNotifications

let kPort = ProcessInfo.processInfo.environment["PEIXAIRADA_PORT"].flatMap(Int.init) ?? 7331
let kURL = URL(string: "http://127.0.0.1:\(kPort)/")!
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

/// Append a line to the app log — the only way to see what the shell is doing once it is a bundle.
func logLine(_ s: String) {
  let stamp = ISO8601DateFormatter().string(from: Date())
  let line = "\(stamp) \(s)\n"
  if !FileManager.default.fileExists(atPath: kAppLog.path) {
    FileManager.default.createFile(atPath: kAppLog.path, contents: nil)
  }
  if let h = try? FileHandle(forWritingTo: kAppLog) {
    h.seekToEndOfFile(); h.write(line.data(using: .utf8)!); try? h.close()
  }
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

  static func isServing(_ completion: @escaping (Bool) -> Void) {
    var req = URLRequest(url: kURL.appendingPathComponent("api/sessions"))
    req.timeoutInterval = 1.2
    URLSession.shared.dataTask(with: req) { _, resp, _ in
      completion((resp as? HTTPURLResponse)?.statusCode == 200)
    }.resume()
  }

  /// Calls back with nil on success, or a message to show the user.
  func start(_ done: @escaping (String?) -> Void) {
    ServerController.isServing { [weak self] running in
      guard let self else { return }
      if running {                        // a server is already up (launchd, or a terminal) — use it
        self.adopted = true
        DispatchQueue.main.async { done(nil) }
        return
      }
      guard let node = ServerController.nodePath() else {
        DispatchQueue.main.async {
          done("""
          This app bundle has no node binary. Rebuild it with mac/build.sh (it copies the node that
          ran npm install), point PEIXAIRADA_NODE at one, or start the server yourself with
          `npm start` and reopen this app.
          """)
        }
        return
      }
      guard let script = Bundle.main.url(forResource: "server", withExtension: "mjs") else {
        DispatchQueue.main.async { done("server.mjs is missing from the app bundle.") }
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
      FileManager.default.createFile(atPath: kLog.path, contents: nil)
      if let h = try? FileHandle(forWritingTo: kLog) {
        h.seekToEndOfFile(); p.standardOutput = h; p.standardError = h
      }
      do { try p.run() } catch {
        DispatchQueue.main.async { done("Could not start the server: \(error.localizedDescription)") }
        return
      }
      self.process = p
      self.waitUntilUp(attempts: 40, done)
    }
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

  func restart(_ done: @escaping (String?) -> Void) {
    stop()
    adopted = false
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { self.start(done) }
  }
}

// ---------------------------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------------------------

final class AppDelegate: NSObject, NSApplicationDelegate, WKScriptMessageHandler,
                         WKNavigationDelegate, UNUserNotificationCenterDelegate {
  var window: NSWindow!
  var web: BoardWebView!
  var content: NSView!
  var prPane: NSView!
  // A web view per page (`key`: gh:<a PR's url>, ide:<a folder's editor url>), kept loaded; the page's strip has the tabs.
  var paneViews: [String: WKWebView] = [:]
  var paneOrder: [String] = []                 // least recently shown first — what goes when there are too many
  var paneKeys: [String] = []                  // the open chat's pages — spared by the eviction
  var paneShown: String?                       // the page on top; nil while the pane is hidden
  var paneChat: String?                        // the chat the page says is open
  var paneLeftC: NSLayoutConstraint!           // the pane's place: the chat column below the strip, as the page says
  var paneTopC: NSLayoutConstraint!
  static let paneViewsMax = 8
  let prDelegate = PrPaneDelegate()
  let server = ServerController()
  var statusItem: NSStatusItem!
  var unread = 0                 // alerts that arrived while the window was not in front
  var needsInput: [[String: String]] = []
  var useUN = false              // native notifications available?

  // ---- injected bridge -----------------------------------------------------------------------
  private let bridgeJS = """
  (() => {
    if (window.__peix) return; window.__peix = true;
    const post = m => window.webkit?.messageHandlers?.hub?.postMessage(m);
    const sessions = new Map(); let serverNotify = false, t = null;
    const summarize = () => {
      const live = [...sessions.values()].filter(s => s.alive);
      post({ type: 'state',
             needs: live.filter(s => s.status === 'needs-input').map(s => ({ id: s.id, project: s.project, title: s.title })),
             ready: live.filter(s => s.status === 'idle' && !s.done).length,
             clauding: live.filter(s => s.status === 'working').length, live: live.length });
    };
    const schedule = () => { clearTimeout(t); t = setTimeout(summarize, 200); };
    const es = new EventSource('/events');
    es.addEventListener('snapshot', e => { const d = JSON.parse(e.data); serverNotify = d.notify === 'native';
      sessions.clear(); for (const s of d.sessions) sessions.set(s.id, s); schedule(); });
    es.addEventListener('session', e => { const s = JSON.parse(e.data); sessions.set(s.id, s); schedule(); });
    es.addEventListener('alert', e => { const a = JSON.parse(e.data);
      post({ type: 'alert', kind: a.kind, project: a.project || '', title: a.title || '',
             snippet: a.snippet || '', sessionId: a.sessionId || '', serverNotify }); });
  })();
  """

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

    showMessage("Starting the server…")
    bringUpServer()
    Timer.scheduledTimer(withTimeInterval: 5, repeats: true) { [weak self] _ in self?.checkServer() }
  }

  func applicationWillTerminate(_ note: Notification) { server.stop() }
  func applicationShouldTerminateAfterLastWindowClosed(_ app: NSApplication) -> Bool { false }
  func applicationShouldHandleReopen(_ app: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
    showWindow(nil); return true
  }

  // ---- UI ------------------------------------------------------------------------------------

  private func buildWindow() {
    let cfg = WKWebViewConfiguration()
    let ucc = WKUserContentController()
    ucc.add(self, name: "hub")
    ucc.addUserScript(WKUserScript(source: bridgeJS, injectionTime: .atDocumentEnd, forMainFrameOnly: true))
    cfg.userContentController = ucc
    web = BoardWebView(frame: NSRect(x: 0, y: 0, width: 1440, height: 900), configuration: cfg)
    web.navigationDelegate = self
    // A file dragged in from the Finder: the page gets its path (a browser page never could) and hands
    // it to the chat as an @-mention; while it hovers, the page marks the chat pane.
    web.onDragging = { [weak self] on in self?.web.evaluateJavaScript("window.peixDragging && window.peixDragging(\(on))") }
    web.onFiles = { [weak self] paths in
      guard let self = self, let data = try? JSONSerialization.data(withJSONObject: paths), let json = String(data: data, encoding: .utf8) else { return }
      logLine("drop: \(paths.count) file(s)")
      self.web.evaluateJavaScript("window.peixDrop && window.peixDrop(\(json))")
    }
    if web.responds(to: Selector(("setInspectable:"))) { web.setValue(true, forKey: "inspectable") }

    window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1440, height: 900),
                      styleMask: [.titled, .closable, .resizable, .miniaturizable, .fullSizeContentView],
                      backing: .buffered, defer: false)
    window.title = "peixAIrada"
    // A window built in code releases itself on close, on top of the strong ref above: ⌘W, then a
    // Dock click, and showWindow messages a freed window (SIGSEGV in applicationShouldHandleReopen).
    window.isReleasedWhenClosed = false
    window.titlebarAppearsTransparent = false
    // The board fills the window; the pane (hidden until a chat puts a page's tab on) lies over the chat column
    // below the page's tab strip — the page says where, on every change. An overlay, not a split: the board's
    // columns never reflow under it.
    buildPrPane()
    content = NSView(frame: NSRect(x: 0, y: 0, width: 1440, height: 900))
    web.translatesAutoresizingMaskIntoConstraints = false
    prPane.translatesAutoresizingMaskIntoConstraints = false
    content.addSubview(web); content.addSubview(prPane)
    paneLeftC = prPane.leadingAnchor.constraint(equalTo: content.leadingAnchor, constant: 0)
    paneTopC = prPane.topAnchor.constraint(equalTo: content.topAnchor, constant: 0)
    NSLayoutConstraint.activate([
      web.leadingAnchor.constraint(equalTo: content.leadingAnchor), web.trailingAnchor.constraint(equalTo: content.trailingAnchor),
      web.topAnchor.constraint(equalTo: content.topAnchor), web.bottomAnchor.constraint(equalTo: content.bottomAnchor),
      paneLeftC, paneTopC, prPane.trailingAnchor.constraint(equalTo: content.trailingAnchor), prPane.bottomAnchor.constraint(equalTo: content.bottomAnchor)
    ])
    prPane.isHidden = true
    window.contentView = content
    installEscapeMonitor()
    installHotkeyForwarder()
    window.contentMinSize = NSSize(width: 760, height: 520)
    window.setFrameAutosaveName("peixairada.main")
    window.center()
    window.makeKeyAndOrderFront(nil)
    NSApp.activate(ignoringOtherApps: true)
  }

  // ---- the pane --------------------------------------------------------------------------------
  // github.com sends `frame-ancestors 'none'`, so the board cannot iframe a pull request. The app
  // shows the chat's pages — its PRs, its folder's VS Code Web — in web views of its own instead: the
  // same window, their own history, the default (persistent) website data store, so the GitHub login
  // survives a relaunch. Since 2026-09-20 (late) the page owns the tabs: its #ptabs strip lists the
  // chat's pages beside the claude/chat and zsh tabs, and every change comes over the bridge as one
  // {type: "pane", id, keys, show, left, top} — the chat's pages (kept loaded, never evicted), the one
  // to put on top or null, and where the pane goes: the chat column below the strip, in the board's
  // CSS px (points here). A web view per page, made on first show and never reloaded on a switch; up
  // to paneViewsMax stay alive (an editor is a whole workbench), the least recently shown goes. Esc
  // with the pane up goes to the page (peixKey('Escape')), which puts the chat tab back and hides the
  // pane; ‹ › ↻ ↗ sit in the strip too ({type: "nav", what}).

  private func buildPrPane() {
    prPane = NSView()
    prPane.wantsLayer = true
    prPane.layer?.backgroundColor = NSColor.windowBackgroundColor.cgColor
  }
  /// The web view for a page, made on first use (and then loaded by the caller). Touches the recency order
  /// and lets the oldest go once there are too many — never one of the current chat's.
  private func paneView(for key: String) -> (WKWebView, Bool) {
    if let w = paneViews[key] { paneOrder.removeAll { $0 == key }; paneOrder.append(key); return (w, false) }
    let w = WKWebView(frame: .zero, configuration: WKWebViewConfiguration())
    w.navigationDelegate = prDelegate
    w.uiDelegate = prDelegate
    w.allowsBackForwardNavigationGestures = true
    if w.responds(to: Selector(("setInspectable:"))) { w.setValue(true, forKey: "inspectable") }
    w.translatesAutoresizingMaskIntoConstraints = false
    w.isHidden = true
    prPane.addSubview(w)
    NSLayoutConstraint.activate([w.leadingAnchor.constraint(equalTo: prPane.leadingAnchor), w.trailingAnchor.constraint(equalTo: prPane.trailingAnchor),
                                 w.topAnchor.constraint(equalTo: prPane.topAnchor), w.bottomAnchor.constraint(equalTo: prPane.bottomAnchor)])
    paneViews[key] = w; paneOrder.append(key)
    while paneViews.count > AppDelegate.paneViewsMax, let old = paneOrder.first(where: { !paneKeys.contains($0) && $0 != key }) {
      paneViews[old]?.removeFromSuperview(); paneViews[old] = nil; paneOrder.removeAll { $0 == old }
      logLine("pane: let go of \(old)")
    }
    return (w, true)
  }
  /// The page's word on the pane: the open chat's pages, the one on top (nil: none — the pane hides) and its place.
  /// A page shown for the first time loads then; a switch between loaded pages loads nothing. The keyboard follows:
  /// to the page put on top, back to the board when the pane goes.
  func setPane(chat id: String?, keys: [String], show: String?, left: CGFloat, top: CGFloat) {
    paneChat = id; paneKeys = keys
    paneLeftC.constant = max(0, left); paneTopC.constant = max(0, top)
    guard let k = show, let url = URL(string: String(k.drop(while: { $0 != ":" }).dropFirst())) else {
      if !prPane.isHidden { prPane.isHidden = true; paneShown = nil; window.makeFirstResponder(web); tellPane(); logLine("pane: hidden") }
      return
    }
    if !paneKeys.contains(k) { paneKeys.append(k) }
    let (w, fresh) = paneView(for: k)
    if fresh { w.load(URLRequest(url: url)) }
    let change = paneShown != k || prPane.isHidden
    for (key, v) in paneViews { v.isHidden = key != k }
    paneShown = k; prPane.isHidden = false
    if change { window.makeFirstResponder(w); tellPane(); logLine("pane: \(url.absoluteString)\(fresh ? "" : " (kept)") pages=\(keys.count) at \(Int(left)),\(Int(top))") }
  }
  /// The page cannot see the pane — a native view over its chat column — so it is told whether the pane is up and
  /// where its edge is (points, which are the board view's CSS px): a dialog can then open beside it, not under it.
  func tellPane() {
    web.evaluateJavaScript("window.peixPane && window.peixPane(\(prPane.isHidden ? "false" : "true"), \(Int(paneLeftC.constant)))", completionHandler: nil)
  }
  /// ‹ › ↻ ↗ from the strip, for the page on top.
  func paneNav(_ what: String) {
    guard let w = paneShown.flatMap({ paneViews[$0] }) else { return }
    switch what {
    case "back": w.goBack()
    case "forward": w.goForward()
    case "reload": w.reload()
    case "external": if let u = w.url { NSWorkspace.shared.open(u) }
    default: break
    }
  }
  // Esc with the pane up, from the board or from the page in the pane: the page's business (the chat tab comes
  // back and the pane goes) — forwarded as peixKey('Escape') and swallowed, so the window does not also leave full
  // screen (the editor's own Esc is given up for this, by choice). With the pane hidden the key is not touched at
  // all (dialogs, full screen, the rename box keep it).
  private func installEscapeMonitor() {
    NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] e in
      guard let self = self, e.keyCode == 53, e.modifierFlags.intersection([.command, .control, .option]).isEmpty,
            !self.prPane.isHidden, let fr = self.window.firstResponder as? NSView else { return e }
      guard fr.isDescendant(of: self.web) || fr.isDescendant(of: self.prPane) else { return e }
      self.web.evaluateJavaScript("window.peixKey && window.peixKey('Escape')", completionHandler: nil)
      return nil
    }
  }
  // ⌥⌘ + one of the board's hotkeys (HOTKEYS in index.html — the same list here, kept by hand): the letters, and ↑ ↓ for
  // the chat above or below. Pressed while the pane has the keyboard: its web views are not the board's, so the page
  // would never hear it. Forwarded through peixKey as the page's e.code; the page asks for the keyboard back
  // ({type: "focus"}) only when it opens a dialog.
  static let boardKeys: Set<String> = ["t", "e", "g", "c", "o", "k", "n"]
  static func hotkeyCode(_ e: NSEvent) -> String? {
    if e.keyCode == 126 { return "ArrowUp" }
    if e.keyCode == 125 { return "ArrowDown" }
    if let ch = e.charactersIgnoringModifiers?.lowercased(), boardKeys.contains(ch) { return "Key" + ch.uppercased() }
    return nil
  }
  private func installHotkeyForwarder() {
    NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] e in
      guard let self = self, e.modifierFlags.intersection([.command, .option, .control, .shift]) == [.command, .option],
            !self.prPane.isHidden, let code = AppDelegate.hotkeyCode(e),
            let fr = self.window.firstResponder as? NSView, fr.isDescendant(of: self.prPane) else { return e }
      self.web.evaluateJavaScript("window.peixKey && window.peixKey('\(code)')", completionHandler: nil)
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
    editItem.submenu = edit

    let viewItem = NSMenuItem(); main.addItem(viewItem)
    let view = NSMenu(title: "View")
    view.addItem(withTitle: "Reload", action: #selector(reload(_:)), keyEquivalent: "r").target = self
    view.addItem(withTitle: "Restart Server", action: #selector(restartServer(_:)), keyEquivalent: "R").target = self
    view.addItem(.separator())
    let full = view.addItem(withTitle: "Enter Full Screen", action: #selector(NSWindow.toggleFullScreen(_:)), keyEquivalent: "f")
    full.keyEquivalentModifierMask = [.control, .command]
    viewItem.submenu = view

    let winItem = NSMenuItem(); main.addItem(winItem)
    let win = NSMenu(title: "Window")
    win.addItem(withTitle: "Minimize", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m")
    win.addItem(withTitle: "Close", action: #selector(NSWindow.performClose(_:)), keyEquivalent: "w")
    winItem.submenu = win
    NSApp.mainMenu = main
    NSApp.windowsMenu = win
  }

  // ---- actions ---------------------------------------------------------------------------------

  @objc func showWindow(_ sender: Any?) {
    window.makeKeyAndOrderFront(nil)
    NSApp.activate(ignoringOtherApps: true)
  }
  @objc func reload(_ sender: Any?) { web.load(URLRequest(url: kURL)) }
  @objc func openLog(_ sender: Any?) { NSWorkspace.shared.open(kLog) }
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
    NSApp.dockTile.badgeLabel = unread > 0 ? String(unread) : nil
    let waiting = needsInput.count
    statusItem.button?.title = waiting > 0 ? " \(waiting)" : (unread > 0 ? " \(unread)" : "")
    rebuildStatusMenu()
  }

  // ---- bridge ----------------------------------------------------------------------------------

  func userContentController(_ ucc: WKUserContentController, didReceive message: WKScriptMessage) {
    guard let body = message.body as? [String: Any], let type = body["type"] as? String else { return }
    switch type {
    case "state":
      logLine("state: needs=\((body["needs"] as? [[String: Any]] ?? []).count) ready=\(body["ready"] as? Int ?? -1) clauding=\(body["clauding"] as? Int ?? -1) live=\(body["live"] as? Int ?? -1)")
      needsInput = (body["needs"] as? [[String: Any]] ?? []).map {
        ["id": $0["id"] as? String ?? "", "project": $0["project"] as? String ?? "",
         "title": $0["title"] as? String ?? ""]
      }
      refreshBadges()
    case "alert":
      let focused = window.isKeyWindow && NSApp.isActive
      logLine("alert: kind=\(body["kind"] as? String ?? "?") project=\(body["project"] as? String ?? "?") focused=\(focused) serverNotify=\(body["serverNotify"] as? Bool ?? false) useUN=\(useUN)")
      if !focused { unread += 1; refreshBadges() }
      // If the user is running a server that already posts its own notifications, don't double up.
      let serverNotifies = body["serverNotify"] as? Bool ?? false
      if !focused && !serverNotifies {
        notify(kind: body["kind"] as? String ?? "reply",
               project: body["project"] as? String ?? "",
               title: body["title"] as? String ?? "",
               snippet: body["snippet"] as? String ?? "",
               sessionId: body["sessionId"] as? String ?? "")
      }
    case "pane":
      setPane(chat: body["id"] as? String, keys: body["keys"] as? [String] ?? [], show: body["show"] as? String,
              left: CGFloat((body["left"] as? Double) ?? 0), top: CGFloat((body["top"] as? Double) ?? 0))
    case "nav":
      paneNav(body["what"] as? String ?? "")
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

  func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
    if isCancelled(error) { return }
    showMessage("Could not load the board: \(error.localizedDescription)")
  }
  func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
    if isCancelled(error) { return }
    showMessage("Could not reach the server on port \(kPort): \(error.localizedDescription)")
  }
}

/// The PR pane's own delegate: it navigates *inside* the pane (the board's delegate would send every
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

final class PrPaneDelegate: NSObject, WKNavigationDelegate, WKUIDelegate {
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

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.run()
