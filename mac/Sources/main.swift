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
  var web: WKWebView!
  var split: NSSplitView!
  var prPane: NSView!
  var prWeb: WKWebView!
  var prTitle: NSTextField!
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
    web = WKWebView(frame: NSRect(x: 0, y: 0, width: 1440, height: 900), configuration: cfg)
    web.navigationDelegate = self
    if web.responds(to: Selector(("setInspectable:"))) { web.setValue(true, forKey: "inspectable") }

    window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1440, height: 900),
                      styleMask: [.titled, .closable, .resizable, .miniaturizable, .fullSizeContentView],
                      backing: .buffered, defer: false)
    window.title = "peixAIrada"
    // A window built in code releases itself on close, on top of the strong ref above: ⌘W, then a
    // Dock click, and showWindow messages a freed window (SIGSEGV in applicationShouldHandleReopen).
    window.isReleasedWhenClosed = false
    window.titlebarAppearsTransparent = false
    // Board on the left, the PR pane (hidden until asked for) on the right.
    buildPrPane()
    split = NSSplitView(frame: NSRect(x: 0, y: 0, width: 1440, height: 900))
    split.isVertical = true
    split.dividerStyle = .thin
    split.addArrangedSubview(web)
    split.addArrangedSubview(prPane)
    split.setHoldingPriority(NSLayoutConstraint.Priority(250), forSubviewAt: 0)
    split.setHoldingPriority(NSLayoutConstraint.Priority(260), forSubviewAt: 1)
    prPane.isHidden = true
    window.contentView = split
    window.contentMinSize = NSSize(width: 760, height: 520)
    window.setFrameAutosaveName("peixairada.main")
    window.center()
    window.makeKeyAndOrderFront(nil)
    NSApp.activate(ignoringOtherApps: true)
  }

  // ---- PR pane ---------------------------------------------------------------------------------
  // github.com sends `frame-ancestors 'none'`, so the board cannot iframe a pull request. The app
  // shows it in a second web view beside the board instead: same window, its own history, and the
  // default (persistent) website data store, so the GitHub login survives a relaunch. The page asks
  // for it over the bridge ({type: "open", url}); "×" hides it and keeps the page loaded.

  private func buildPrPane() {
    prWeb = WKWebView(frame: .zero, configuration: WKWebViewConfiguration())
    prWeb.navigationDelegate = prDelegate
    prWeb.uiDelegate = prDelegate
    prWeb.allowsBackForwardNavigationGestures = true
    if prWeb.responds(to: Selector(("setInspectable:"))) { prWeb.setValue(true, forKey: "inspectable") }
    prDelegate.onTitle = { [weak self] t in self?.prTitle.stringValue = t }

    func button(_ title: String, _ action: Selector, _ target: AnyObject?, tip: String) -> NSButton {
      let b = NSButton(title: title, target: target, action: action)
      b.bezelStyle = .rounded; b.controlSize = .small; b.font = .systemFont(ofSize: 12); b.toolTip = tip
      b.setContentHuggingPriority(.required, for: .horizontal)
      return b
    }
    prTitle = NSTextField(labelWithString: "")
    prTitle.lineBreakMode = .byTruncatingTail
    prTitle.font = .systemFont(ofSize: 12); prTitle.textColor = .secondaryLabelColor
    prTitle.setContentHuggingPriority(NSLayoutConstraint.Priority(1), for: .horizontal)
    prTitle.setContentCompressionResistancePriority(NSLayoutConstraint.Priority(1), for: .horizontal)
    let bar = NSStackView(views: [
      button("‹", #selector(WKWebView.goBack(_:)), prWeb, tip: "Back"),
      button("›", #selector(WKWebView.goForward(_:)), prWeb, tip: "Forward"),
      button("↻", #selector(WKWebView.reload(_:)), prWeb, tip: "Reload"),
      prTitle,
      button("Open in Browser", #selector(openPrExternally(_:)), self, tip: "Open this page in your default browser"),
      button("×", #selector(closePrPane(_:)), self, tip: "Close the pane (the page stays loaded)")
    ])
    // .fill, not the default gravity areas: under those a view without an intrinsic size (the web
    // view; the title label once it may shrink) is given nothing and the pane shows only a toolbar.
    bar.orientation = .horizontal; bar.spacing = 6; bar.distribution = .fill
    bar.edgeInsets = NSEdgeInsets(top: 5, left: 8, bottom: 5, right: 8)
    bar.setContentHuggingPriority(.required, for: .vertical)
    let sep = NSBox(); sep.boxType = .separator
    prPane = NSStackView(views: [bar, sep, prWeb])
    (prPane as! NSStackView).orientation = .vertical
    (prPane as! NSStackView).spacing = 0
    (prPane as! NSStackView).alignment = .width
    (prPane as! NSStackView).distribution = .fill
    prWeb.setContentHuggingPriority(NSLayoutConstraint.Priority(1), for: .vertical)
    prWeb.setContentCompressionResistancePriority(NSLayoutConstraint.Priority(1), for: .vertical)
  }

  func openPrPane(_ url: URL) {
    if prPane.isHidden {
      prPane.isHidden = false
      let saved = UserDefaults.standard.double(forKey: "prPaneWidth")
      let w = saved > 240 ? saved : split.bounds.width * 0.48
      split.setPosition(max(420, split.bounds.width - w - split.dividerThickness), ofDividerAt: 0)
    }
    prTitle.stringValue = url.absoluteString
    prWeb.load(URLRequest(url: url))
    logLine("pr pane: \(url.absoluteString)")
  }
  @objc func closePrPane(_ sender: Any?) {
    UserDefaults.standard.set(Double(prPane.bounds.width), forKey: "prPaneWidth")
    prPane.isHidden = true
  }
  @objc func openPrExternally(_ sender: Any?) {
    if let u = prWeb.url { NSWorkspace.shared.open(u) }
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
    case "open":
      if let s = body["url"] as? String, let url = URL(string: s) { openPrPane(url) }
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
    showMessage("Could not load the board: \(error.localizedDescription)")
  }
  func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
    showMessage("Could not reach the server on port \(kPort): \(error.localizedDescription)")
  }
}

/// The PR pane's own delegate: it navigates *inside* the pane (the board's delegate would send every
/// non-local link to the system browser), keeps GitHub's target=_blank links in the pane — a web
/// view with no UI delegate silently drops those — and hands non-web schemes (mailto:, vscode:) out.
final class PrPaneDelegate: NSObject, WKNavigationDelegate, WKUIDelegate {
  var onTitle: ((String) -> Void)?
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
  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
    onTitle?(webView.title.flatMap { $0.isEmpty ? nil : $0 } ?? webView.url?.absoluteString ?? "")
  }
  func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
    onTitle?("Could not load: \(error.localizedDescription)")
  }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.run()
