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

  /// Finding node from a GUI app is genuinely awkward:
  ///  * launchd gives us a bare PATH (/usr/bin:/bin:…), so node is usually not on it;
  ///  * version managers (mise, nvm, fnm, asdf) activate in `.zshrc`, i.e. only in an *interactive*
  ///    shell — a plain login shell finds nothing;
  ///  * an interactive shell also prints shell-integration escape sequences (iTerm2 emits
  ///    `ESC ] 1337 ; … BEL`) onto stdout, so its output is not a bare path.
  /// So: ask an interactive login shell, scrub the escapes, and fall back to known install layouts.
  /// The answer is cached in UserDefaults, and `PEIXAIRADA_NODE` or
  /// `defaults write net.peixairada.app nodePath /path/to/node` override everything.
  static var triedPaths: [String] = []

  private static func isExec(_ path: String) -> Bool {
    FileManager.default.isExecutableFile(atPath: path)
  }

  /// Pull the path out of an interactive shell's output. No regex: split on control characters and
  /// whitespace (which is exactly what the escape sequences are made of) and take the last token
  /// that is an absolute path to something executable. `ESC ] 1337 ; CurrentDir=/x BEL` splits into
  /// `]1337;CurrentDir=/x`, which does not start with "/" and is discarded.
  private static func pathFromShellOutput(_ raw: String) -> String? {
    let separators = CharacterSet.whitespacesAndNewlines.union(.controlCharacters)
    return raw.components(separatedBy: separators)
      .filter { $0.hasPrefix("/") }
      .last { isExec($0) }
  }

  private static func askShell(_ args: [String]) -> String? {
    let p = Process(), pipe = Pipe()
    p.executableURL = URL(fileURLWithPath: "/bin/zsh")
    p.arguments = args
    p.standardOutput = pipe
    p.standardError = FileHandle.nullDevice
    p.standardInput = FileHandle.nullDevice
    guard (try? p.run()) != nil else { return nil }
    // a misbehaving .zshrc must not wedge startup
    DispatchQueue.global().asyncAfter(deadline: .now() + 6) { if p.isRunning { p.terminate() } }
    let data = pipe.fileHandleForReading.readDataToEndOfFile()
    p.waitUntilExit()
    let raw = String(data: data, encoding: .utf8) ?? ""
    let found = pathFromShellOutput(raw)
    logLine("findNode: zsh \(args.joined(separator: " ")) → \(found ?? "nothing") (raw \(data.count) bytes)")
    return found
  }

  /// Well-known install layouts, newest version first where a manager keeps several.
  private static func candidatePaths() -> [String] {
    let home = FileManager.default.homeDirectoryForCurrentUser.path
    var out: [String] = ["\(home)/.local/share/mise/shims/node", "\(home)/.volta/bin/node"]
    let versionDirs = [
      ("\(home)/.local/share/mise/installs/node", "bin/node"),
      ("\(home)/.nvm/versions/node", "bin/node"),
      ("\(home)/Library/Application Support/fnm/node-versions", "installation/bin/node"),
      ("\(home)/.asdf/installs/nodejs", "bin/node"),
    ]
    for (dir, suffix) in versionDirs {
      let names = (try? FileManager.default.contentsOfDirectory(atPath: dir)) ?? []
      // prefer an explicit "lts"/"latest" alias, then the highest-looking version
      let ordered = names.filter { $0 == "lts" || $0 == "latest" }
        + names.filter { $0 != "lts" && $0 != "latest" }.sorted {
            $0.compare($1, options: .numeric) == .orderedDescending }
      out += ordered.map { "\(dir)/\($0)/\(suffix)" }
    }
    return out + ["/opt/homebrew/bin/node", "/usr/local/bin/node", "/usr/bin/node"]
  }

  static func findNode() -> String? {
    triedPaths = []
    if let override = ProcessInfo.processInfo.environment["PEIXAIRADA_NODE"] {
      triedPaths.append("PEIXAIRADA_NODE=\(override)")
      if isExec(override) { return override }
    }
    if let saved = UserDefaults.standard.string(forKey: "nodePath"), isExec(saved) {
      logLine("findNode: using remembered \(saved)")
      return saved
    }
    for args in [["-lic", "command -v node"], ["-lc", "command -v node"]] {
      triedPaths.append("zsh \(args[0])")
      if let found = askShell(args) { remember(found); return found }
    }
    for candidate in candidatePaths() {
      triedPaths.append(candidate)
      if isExec(candidate) { logLine("findNode: found \(candidate)"); remember(candidate); return candidate }
    }
    logLine("findNode: FAILED after \(triedPaths.count) attempts")
    return nil
  }

  private static func remember(_ path: String) {
    UserDefaults.standard.set(path, forKey: "nodePath")
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
      guard let node = ServerController.findNode() else {
        let tried = ServerController.triedPaths.suffix(4).joined(separator: ", ")
        DispatchQueue.main.async {
          done("""
          Could not find node — tried \(ServerController.triedPaths.count) places (…\(tried)).
          Install Node ≥ 20, point the app at it with
          `defaults write net.peixairada.app nodePath /full/path/to/node`,
          or start the server yourself with `npm start` and reopen this app.
          See ~/Library/Logs/peixairada-app.log
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
    server.start { [weak self] problem in
      guard let self else { return }
      if let problem { self.showMessage(problem) } else { self.web.load(URLRequest(url: kURL)) }
    }
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
    window.titlebarAppearsTransparent = false
    window.contentView = web
    window.contentMinSize = NSSize(width: 760, height: 520)
    window.setFrameAutosaveName("peixairada.main")
    window.center()
    window.makeKeyAndOrderFront(nil)
    NSApp.activate(ignoringOtherApps: true)
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
    server.restart { [weak self] problem in
      guard let self else { return }
      if let problem { self.showMessage(problem) } else { self.web.load(URLRequest(url: kURL)) }
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

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.run()
