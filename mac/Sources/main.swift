// peixAIrada.app — a thin native shell around the board.
//
// It owns the Node server (starts it on launch, stops it on quit), shows the UI in a WKWebView, and
// adds the things a web page cannot do on its own: a Dock badge and menu-bar counter for sessions
// waiting on you, and real notifications that come from this app (not from "Script Editor") and open
// the right session when clicked.
//
// The page knows it is in the app (the `hub` message handler) and posts what the shell needs — the chats waiting on you,
// each alert, the pane's places — and takes the shell's word back through window.peix* calls.

import Carbon
import Cocoa
import WebKit
import UserNotifications

let kPort = ProcessInfo.processInfo.environment["PEIXAIRADA_PORT"].flatMap(Int.init) ?? 7331
let kURL = URL(string: "http://127.0.0.1:\(kPort)/")!
let kFrameName = "peixairada.main"   // the window's frame in the defaults — off while ⌃⌘F fills the screen
let kFillKey = "peixairada.fill"      // whether the board was full screen (either kind) when it was last up: a relaunch comes back so
let kSpaceKey = "peixairada.space"    // ⌃⌘F is the system's full screen, in a Space of its own, not the fill (2026-10-14, Settings › Look)
let kDarkKey = "peixairada.dark"      // the board's own appearance when it last said one (none: it follows macOS), for the next launch
/// The board's key (2026-10-16): a file beside the server's state, this user's alone, made at the server's first boot.
/// The app's page gets it from a script of the app's own before the page's runs (`giveKey`), and the probe sends it.
let kKeyFile = FileManager.default.homeDirectoryForCurrentUser
  .appendingPathComponent("Library/Application Support/peixAIrada/key")
func boardKey() -> String? {
  guard let s = try? String(contentsOf: kKeyFile, encoding: .utf8) else { return nil }
  let k = s.trimmingCharacters(in: .whitespacesAndNewlines)
  return k.count == 64 && k.allSatisfy(\.isHexDigit) ? k : nil
}
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

/// The find bar's highlight *is* the page's selection: this is how it is taken away again.
let kDropSelection = "window.getSelection && window.getSelection().removeAllRanges()"

/// A file opened for appending — every write lands at the end, whoever else writes it (the agent's server and the
/// app's own share peixairada.log) — or nil.
func appendHandle(_ url: URL) -> FileHandle? {
  let fd = open(url.path, O_WRONLY | O_APPEND | O_CREAT, 0o644)
  return fd < 0 ? nil : FileHandle(fileDescriptor: fd, closeOnDealloc: true)
}

/// Append a line to the app log — the only way to see what the shell is doing once it is a bundle. One formatter and
/// one handle, kept open (2026-09-27: a formatter made and the file opened, sought and closed per line, on the main
/// thread, for tens of lines a minute) — on a queue of their own, since the notification center's callbacks come from
/// another thread, and written with the throwing call: a full disk was an Objective-C exception, which ends an app.
let logQueue = DispatchQueue(label: "net.peixairada.log")
let logStamp = ISO8601DateFormatter()
var logHandle: FileHandle?
func logLine(_ s: String) {
  let when = Date()
  logQueue.async {
    if logHandle == nil { logHandle = appendHandle(kAppLog) }
    try? logHandle?.write(contentsOf: Data("\(logStamp.string(from: when)) \(s)\n".utf8))
  }
}

/// A Swift string as a JavaScript literal — JSON's own escaping, so a quote, a backslash or a line break in a path or
/// an id is the text it was (2026-10-03: three hand-rolled ways before, one of which turned newlines into spaces and one
/// of which let a backslash through).
func jsLit(_ s: String) -> String {
  guard let d = try? JSONSerialization.data(withJSONObject: s, options: .fragmentsAllowed), let lit = String(data: d, encoding: .utf8) else { return "''" }
  return lit
}

// ---------------------------------------------------------------------------------------------
// Server lifecycle
// ---------------------------------------------------------------------------------------------

final class ServerController {
  private var process: Process?
  private(set) var adopted = false      // true when a server was already running and we just attached
  /// The launchd agent's plist (scripts/launchd.sh): when it is there, the server answering is the agent's, and a
  /// restart is launchd's to do — the app never had a process to stop, and ⇧⌘R restarted nothing (2026-10-03).
  static let agentLabel = "net.peixairada.server"
  static var agentInstalled: Bool {
    FileManager.default.fileExists(atPath: FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/LaunchAgents/\(agentLabel).plist").path)
  }

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
    if let key = boardKey() { req.setValue(key, forHTTPHeaderField: "X-Peix-Key") }   // a server from before the key ignores it
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
      // One of its own at a time (2026-10-03): a start while the last one was still coming up — ⇧⌘R twice, the
      // watchdog during a slow boot — spawned another and dropped the first, which then outlived the app.
      if let p = self.process, p.isRunning { self.waitUntilUp(attempts: 40, done); return }
      // The agent installed: launchd keeps it alive and is the one to start it — a server of the app's own beside it
      // only waited on the port (a probe that timed out while the agent booted was enough to spawn one).
      if ServerController.agentInstalled {
        logLine("server: nothing answering yet — the launchd agent is installed, so waiting for it")
        self.adopted = true
        // …and given up on, the app's own server takes its place (2026-10-14): a plist there says nothing of an agent
        // unloaded, crashing or run from a checkout that is gone, and the watchdog only ever waited on it again
        self.waitUntilUp(attempts: 80, done) { [weak self] in
          logLine("server: the launchd agent did not answer (launchctl print gui/\(getuid())/\(ServerController.agentLabel) says why) — starting the app's own")
          self?.adopted = false
          self?.spawn(done)
        }
        return
      }
      self.spawn(done)
    } }
  }

  /// The bundled server, the app's own.
  private func spawn(_ done: @escaping (String?) -> Void) {
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
    if let h = appendHandle(kLog) { p.standardOutput = h; p.standardError = h }   // appended, beside the agent's lines
    p.terminationHandler = { [weak self] ended in DispatchQueue.main.async { if self?.process === ended { self?.process = nil } } }
    do { try p.run() } catch {
      done("Could not start the server: \(error.localizedDescription)")
      return
    }
    self.process = p
    self.waitUntilUp(attempts: 40, done)
  }

  /// `orElse`, when given, is what follows a wait given up on, in place of the failure.
  private func waitUntilUp(attempts: Int, _ done: @escaping (String?) -> Void, orElse: (() -> Void)? = nil) {
    guard attempts > 0 else {
      if let orElse { return DispatchQueue.main.async(execute: orElse) }
      // given up on, it is ended: it would otherwise come up later beside the next one, or hold the port for good
      DispatchQueue.main.async { self.stop(); done("The server did not come up. See \(kLog.path)") }
      return
    }
    ServerController.isServing { ok in
      // what answers is not ours when ours has ended (the port was taken — the agent came up meanwhile): adopted
      if ok { DispatchQueue.main.async { if self.process?.isRunning != true { self.adopted = true }; done(nil) } }
      else { DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) { self.waitUntilUp(attempts: attempts - 1, done, orElse: orElse) } }
    }
  }

  func stop() {
    process?.terminate()
    process = nil
  }

  /// Only once the port has fallen silent: a start right after the terminate found the server still answering while
  /// it shut down, adopted it, and the watchdog reported it gone fifteen seconds later (2026-09-27).
  func restart(_ done: @escaping (String?) -> Void) {
    if adopted && process == nil && ServerController.agentInstalled {
      let k = Process()
      k.executableURL = URL(fileURLWithPath: "/bin/launchctl")
      k.arguments = ["kickstart", "-k", "gui/\(getuid())/\(ServerController.agentLabel)"]
      // its word read (2026-10-14): an agent launchd does not have — the plist there, never loaded or booted out — has
      // nothing restarted, and the start that follows waits on it, then runs the app's own
      k.terminationHandler = { [weak self] k in DispatchQueue.main.async {
        guard let self else { return }
        logLine("server: launchctl kickstart -k \(ServerController.agentLabel) — \(k.terminationStatus == 0 ? "restarted" : "failed, exit \(k.terminationStatus)")")
        if k.terminationStatus == 0 { self.waitUntilDown(attempts: 20) { self.start(done) } } else { self.start(done) }
      } }
      do { try k.run() } catch { return done("Could not restart the agent: \(error.localizedDescription)") }
      return
    }
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
  var paneFocus: String?                       // the one with the keys — nil while they are the board's (2026-10-14)
  /// The page ⌘F, ⌘R and ‹ › ↻ ↗ act on: the one with the keys, else the first one up — the keys can be in claude's
  /// drawer beside a page (2026-10-14).
  var paneTarget: String? { paneFocus ?? paneShownKeys.first }
  static let paneViewsMax = 8
  var findBar: NSVisualEffectView!             // ⌘F's bar, over the focused page's top right corner; hidden until asked for
  var findRightC: NSLayoutConstraint!         // …placed from that page's rect, so it follows the keys between halves
  var findTopC: NSLayoutConstraint!
  var findField: NSSearchField!
  var findQuery = ""                           // what was last searched for — ⌘G carries on with it after the bar closes
  let paneDelegate = PaneDelegate()
  let boardUI = BoardUI()   // the board's own view's file panel (2026-10-30, later); a web view holds its delegate weakly
  let keyboardMap = KeyboardMap()                // the Mac's layout for VS Code Web's pages (2026-10-14)
  let server = ServerController()
  var statusItem: NSStatusItem!
  // What wants you, as the page posts it (2026-10-12): the chats asking you and the ones with a new reply — the Dock's
  // badge and the menu bar's count are both their number (the badge counted the alerts that came while the window was
  // in the back before, the menu bar the questions), and the status menu lists them.
  var needsInput: [[String: String]] = []
  var newReplies: [[String: String]] = []
  var yourMoves: [[String: String]] = [], clauding: [[String: String]] = []   // the status menu's too, not counted (2026-10-12)
  // The board's own zoom (2026-10-12, the settings' text size): the web view's pageZoom, so the page's CSS px are
  // `zoom` points — what the page and the shell say of places (the pane's rects, the housing, the pane's edge) is
  // turned between the two here.
  var zoom: CGFloat = 1
  var badged: (waiting: [[String: String]], replies: [[String: String]], moves: [[String: String]], clauding: [[String: String]]) = ([], [], [], [])   // what the badge and the status menu last showed
  var useUN = false              // native notifications available?
  var fillSaved: (frame: NSRect, mask: NSWindow.StyleMask, opts: NSApplication.PresentationOptions)?   // set while ⌃⌘F fills the screen: what to come back to
  var fillSaid: String?                   // what the page last heard of the fill (tellFill): the same is not said again
  // Which full screen ⌃⌘F is (2026-10-14): the fill, up to the camera housing on this desktop, or the system's, in a Space
  // of its own below the housing — the page's Settings › General says (`fullscreen`), remembered for the next launch
  var spaceMode = UserDefaults.standard.bool(forKey: kSpaceKey)
  var fillAfterSpace = false              // the switch went back to the fill while in a Space: the fill once the window is out of it
  var fillSignal: DispatchSourceSignal!   // SIGUSR1 is ⌃⌘F from a shell
  var voiceOverObs: NSKeyValueObservation?   // VoiceOver on or off, told to the page (tellVoiceOver)
  var fillTick: Timer?                    // while filled: watches the pointer for a hold at the Dock's edge (dockTick)
  var dockOut = false                     // the Dock let out after a hold at its edge, until the pointer is off it again
  var fillHousing = false                 // filled on a screen with a camera housing: the menu bar auto-hidden there, hidden outright elsewhere (placeFill)
  var menuOut = false                     // no housing: the menu bar let out after a hold at the top edge, until it has hidden again
  var edgeSince: TimeInterval?            // when the pointer reached the Dock's edge
  var topSince: TimeInterval?             // when the pointer reached the top edge
  var tuck: DispatchWorkItem?             // a tuckMenuBar pending after the app came forward or the Space changed
  var dockSide = "bottom"                 // the Dock's edge, read when the fill starts and when the app comes back (dockEdge)
  static let dockHold: TimeInterval = 0.7 // how long the pointer is held at the edge before the Dock comes out
  static let menuHold: TimeInterval = 1.0 // …and at the top edge before the menu bar does, where the search box sits
  // The fill's lights (2026-10-13): borderless, the window has none of its own; they come down in a title strip under the
  // menu bar, as the system's full screen shows its own (lightsTick)
  var lights: NSVisualEffectView!         // the strip: the lights on the left, the window's title in the middle
  var lightsGroup: LightsGroup!
  var lightsTitle: NSTextField!
  var lightsTopC: NSLayoutConstraint!     // …hung under the menu bar
  var lightsOut = false                   // the strip down, and the menu bar held out over it (fillOptions)
  var lightsBand: CGFloat = 0             // how far below the top edge the pointer may go with the strip staying
  var fillMenuH: CGFloat = 24             // the menu bar's height on the fill's screen (placeFill)
  static let lightsH: CGFloat = 28        // a title bar's

  func applicationDidFinishLaunching(_ note: Notification) {
    NSApp.setActivationPolicy(.regular)
    buildMenu()
    buildStatusItem()
    buildWindow()
    setUpNotifications()
    watchAway()
    voiceOverObs = NSWorkspace.shared.observe(\.isVoiceOverEnabled) { [weak self] _, _ in DispatchQueue.main.async { self?.tellVoiceOver() } }

    NotificationCenter.default.addObserver(forName: NSWindow.didBecomeKeyNotification,
                                           object: window, queue: .main) { [weak self] _ in
      self?.refreshBadges()
      self?.keysBack("key")
    }

    // `kill -USR1 $(pgrep -x peixAIrada)` is ⌃⌘F from a shell: a session in a drawer has no way to press a key in the
    // app short of an Accessibility grant, and the fill is checked from there (the app log says the frame it took).
    signal(SIGUSR1, SIG_IGN)
    fillSignal = DispatchSource.makeSignalSource(signal: SIGUSR1, queue: .main)
    fillSignal.setEventHandler { [weak self] in self?.toggleFull(nil) }
    fillSignal.resume()

    showMessage("Starting the server…")
    bringUpServer()
    Timer.scheduledTimer(withTimeInterval: 5, repeats: true) { [weak self] _ in self?.checkServer() }.tolerance = 1
  }

  func applicationWillTerminate(_ note: Notification) { server.stop() }
  /// Filled and behind another app, there is no pointer to watch for a hold at the Dock's edge: the poll stops, and
  /// comes back with the app — with the Dock's edge read again, in case it moved meanwhile.
  func applicationDidResignActive(_ note: Notification) { fillTick?.invalidate(); fillTick = nil; edgeSince = nil; topSince = nil; lightsUp("the app in the back") }
  func applicationDidBecomeActive(_ note: Notification) {
    if fillSaved != nil && fillTick == nil && !window.isMiniaturized { startDockTick() }; tuckMenuBarSoon()   // down in the Dock, it waits for the window (windowDidDeminiaturize)
    if !away.isEmpty { away.removeAll(); showAway() }   // in front again: someone is looking, whatever was missed
    // In front with the keys nowhere (2026-10-28): ⌘-Tab to the board now and then left typing going nowhere, or to the
    // app on the other screen. The window made key, the keys where they were — the next turn of the run loop, once
    // AppKit has given them back itself; the log says when it had not, so the cause can be read off it.
    DispatchQueue.main.async { [weak self] in self?.keysBack("in front") }
  }
  /// The board's window key with a view holding the keys, if the app is in front without: no key window at all (a
  /// panel, the About box or a menu keeps them as they should), or the window itself holding them, which no view hears.
  func keysBack(_ why: String) {
    guard NSApp.isActive, window.isVisible, !window.isMiniaturized, content?.isHidden != true else { return }
    if NSApp.keyWindow == nil { logLine("focus: \(why) with no key window — the board made key"); window.makeKeyAndOrderFront(nil) }
    guard window.isKeyWindow, window.firstResponder === window else { return }
    logLine("focus: \(why) with the keys on no view — given to the \(paneFocus != nil ? "page" : "board")")
    window.makeFirstResponder(paneFocus.flatMap { paneViews[$0] } ?? web)
  }
  func applicationShouldTerminateAfterLastWindowClosed(_ app: NSApplication) -> Bool { false }
  func applicationShouldHandleReopen(_ app: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
    showWindow(nil); return true
  }

  // ---- nobody looking --------------------------------------------------------------------------
  // (2026-10-13) The screen locked, the display asleep, the screen saver up, the session switched away: the board's web
  // views went on as if seen — with the screen locked and the display off its web process ran at ~40 % of a core — while
  // a page WebKit knows is hidden costs nothing (0.2 % against 8.7 shown, measured with a superview hidden). So the
  // window's content is hidden while any of them holds, and every web view in it with it (the board, the pane's pages):
  // WebKit stops their frames and animations and slows their timers. The script still runs — the stream, the alerts and
  // the badge carry on, a little later. Shown again once they have all cleared, the keys where they were.
  var away = Set<String>()
  var awayResponder: NSResponder?
  private func watchAway() {
    let ws = NSWorkspace.shared.notificationCenter, dn = DistributedNotificationCenter.default()
    let marks: [(NotificationCenter, Notification.Name, String, Bool)] = [
      (ws, NSWorkspace.screensDidSleepNotification, "display", true), (ws, NSWorkspace.screensDidWakeNotification, "display", false),
      (ws, NSWorkspace.sessionDidResignActiveNotification, "session", true), (ws, NSWorkspace.sessionDidBecomeActiveNotification, "session", false),
      (dn, Notification.Name("com.apple.screenIsLocked"), "lock", true), (dn, Notification.Name("com.apple.screenIsUnlocked"), "lock", false),
      (dn, Notification.Name("com.apple.screensaver.didstart"), "saver", true), (dn, Notification.Name("com.apple.screensaver.didstop"), "saver", false),
    ]
    for (center, name, why, on) in marks {
      center.addObserver(forName: name, object: nil, queue: .main) { [weak self] _ in
        guard let self else { return }
        let was = self.away.isEmpty
        if on { self.away.insert(why) } else { self.away.remove(why) }
        if was != self.away.isEmpty { self.showAway() }
      }
    }
  }
  /// The content hidden while anything keeps the board unseen, shown once nothing does — the first responder put back:
  /// AppKit moves the keys off a view whose ancestor is hidden, and a drawer typed into after an unlock must have them.
  private func showAway() {
    guard let content else { return }
    let hide = !away.isEmpty
    guard content.isHidden != hide else { return }
    if hide { awayResponder = window.firstResponder }
    content.isHidden = hide
    if !hide, let r = awayResponder { window.makeFirstResponder(r); awayResponder = nil }
    web.evaluateJavaScript("window.peixAway?.(\(hide))", completionHandler: nil)   // lunch's sign and fish (2026-10-18): a lock at lunch time is lunch
    logLine(hide ? "away: \(away.sorted().joined(separator: ", ")) — the board hidden" : "away: back — the board shown")
  }

  // ---- UI ------------------------------------------------------------------------------------

  private func buildWindow() {
    let cfg = WKWebViewConfiguration()
    let ucc = WKUserContentController()
    ucc.add(self, name: "hub")   // the page sees the handler and posts its state, its alerts and the pane's places
    cfg.userContentController = ucc
    web = BoardWebView(frame: NSRect(x: 0, y: 0, width: 1440, height: 900), configuration: cfg)
    web.navigationDelegate = self
    web.uiDelegate = boardUI
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
    // A drop brings the board forward with the keys in it (2026-10-28): macOS activates no app a drop lands on, so a
    // screenshot's thumbnail dragged in from another screen left that screen's app with the keys, and what was typed
    // after the @-mention went there. The page puts the keys in the drawer the path went to (attachPaths).
    web.onFiles = { [weak self] paths in
      guard let self = self, let data = try? JSONSerialization.data(withJSONObject: paths), let json = String(data: data, encoding: .utf8) else { return }
      let was = NSApp.isActive
      self.window.makeKeyAndOrderFront(nil)
      if #available(macOS 14, *) { NSApp.activate() } else { NSApp.activate(ignoringOtherApps: true) }
      if self.window.firstResponder !== self.web { self.window.makeFirstResponder(self.web) }
      self.web.evaluateJavaScript("window.peixDrop && window.peixDrop(\(json))")
      // whether the system let it come forward: cooperative activation may refuse, and the log is where that shows
      DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
        logLine("drop: \(paths.count) file(s)\(was ? "" : NSApp.isActive ? " — the app brought forward" : " — the app NOT brought forward")")
      }
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
    // The board's appearance is its own (2026-10-12): it says which (`appearance`), and the window wears it — the
    // ground above, the pane's pages, the find bar. As it was last said until the page says again.
    if let dark = UserDefaults.standard.object(forKey: kDarkKey) as? Bool { window.appearance = NSAppearance(named: dark ? .darkAqua : .aqua) }
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
    buildLights()
    paneOverlay.isHidden = true
    window.contentView = content
    installEscapeMonitor()
    installHotkeyForwarder()
    installPaneClickMonitor()
    window.contentMinSize = NSSize(width: 760, height: 520)
    // Where it was left, centred only the first time (2026-10-03: centred after the saved frame was restored, and the
    // autosave then wrote the centred one over it — every launch came up in the middle).
    if !window.setFrameUsingName(kFrameName) { window.center() }
    window.setFrameAutosaveName(kFrameName)
    // The system's full screen only when Settings › Look picks it (spaceMode): it always sits below the camera housing.
    // Otherwise the green button zooms, and windowShouldZoom makes a plain click on it the fill (toggleFill) — ⌥-click
    // and a title bar double-click zoom.
    window.collectionBehavior = spaceMode ? [.fullScreenPrimary] : [.fullScreenNone]
    window.delegate = self
    window.makeKeyAndOrderFront(nil)
    NSApp.activate(ignoringOtherApps: true)
    if UserDefaults.standard.bool(forKey: kFillKey) {   // as it was left
      if spaceMode { DispatchQueue.main.async { self.window.toggleFullScreen(nil) } } else { toggleFill(nil) }
    }
    // Filling the screen, the frame is the screen's: it follows the window to another display (Mission Control can
    // drag it there) and through a change of resolution, and the page hears where the housing is now. The board's own
    // window's change of screen only (2026-10-15): with no object it heard every window of the app's. Both come more
    // often than anything changes — every few seconds in use, measured — so placeFill and tellFill act only on a change.
    for (name, object) in [(NSWindow.didChangeScreenNotification, window as Any?), (NSApplication.didChangeScreenParametersNotification, nil)] {
      NotificationCenter.default.addObserver(forName: name, object: object, queue: .main) { [weak self] _ in
        guard let self, self.fillSaved != nil, !self.window.isMiniaturized, let screen = self.window.screen else { return }
        self.placeFill(on: screen)
        self.tellFill()
      }
    }
    NSWorkspace.shared.notificationCenter.addObserver(forName: NSWorkspace.activeSpaceDidChangeNotification, object: nil,
                                                      queue: .main) { [weak self] _ in self?.tuckMenuBarSoon() }
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
    paneDelegate.open = { [weak self] w, url in self?.paneOpen(w, url) }
    paneDelegate.linkOut = { [weak self] url, done in self?.paneLinkOut(url, done) ?? done(false) }
  }
  /// A page's new window, for the board to put on a tab beside it (2026-10-21) — or, the board saying no (a view not
  /// the open chat's), loaded where it came from, as before.
  private func paneOpen(_ w: WKWebView, _ url: URL) {
    guard let key = paneViews.first(where: { $0.value === w })?.key else { w.load(URLRequest(url: url)); return }
    web.evaluateJavaScript("window.peixPaneOpen ? !!window.peixPaneOpen(\(jsLit(key)), \(jsLit(url.absoluteString))) : false") { [weak w] v, _ in
      let taken = (v as? Bool) == true
      logLine("pane: a new window from \(key) — \(url.host ?? "?") \(taken ? "on a tab of its own" : "loaded where it was asked")")
      if !taken { w?.load(URLRequest(url: url)) }
    }
  }
  /// Whether a link out of a page goes to the browser (2026-10-21): the board's rule (`peixLinkOut`, its Links setting).
  /// No board to ask, or no answer: the page keeps it, as before.
  private func paneLinkOut(_ url: URL, _ done: @escaping (Bool) -> Void) {
    web.evaluateJavaScript("window.peixLinkOut ? !!window.peixLinkOut(\(jsLit(url.absoluteString))) : false") { v, _ in done((v as? Bool) == true) }
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
    closeWhenEmpty(w, key)
    if key.hasPrefix("ide:") { keyboardMap.install(on: w) }   // the editor: which layout the keys type in
    w.translatesAutoresizingMaskIntoConstraints = false
    w.isHidden = true
    w.wantsLayer = true
    window.effectiveAppearance.performAsCurrentDrawingAppearance {   // the board's appearance, which may not be macOS's
      w.layer?.backgroundColor = NSColor.windowBackgroundColor.cgColor   // the overlay is clear: a page still loading needs its own
    }
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
    paneFocus = focus.flatMap { shown.contains($0) ? $0 : nil }   // none: the board keeps the keys, a page beside them or not
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
    let left = (paneTarget.flatMap { paneRects[$0]?.minX } ?? 0) / zoom
    web.evaluateJavaScript("window.peixPane && window.peixPane(\(paneOverlay.isHidden ? "false" : "true"), \(Int(left)))", completionHandler: nil)
  }
  /// Where a page is now, for the strip to show and copy — with the key it belongs to, since the board may have
  /// moved on to another tab by the time a load finishes. Sent on every pane message too: a board reload forgets it.
  func tellPaneUrl(_ key: String, _ url: String?) {
    guard let url = url, !url.isEmpty else { return }
    web.evaluateJavaScript("window.peixPaneUrl && window.peixPaneUrl(\(jsLit(key)), \(jsLit(url)))", completionHandler: nil)
  }
  /// ⌘W: the board's business first — the half of the chat column the keys are in, or a picker that is up — and
  /// the window only when it says it took neither (2026-09-22).
  /// It is the menu item: a key equivalent is dispatched before any responder's keyDown — to the key window's views
  /// first, though, and the menu after them (2026-10-14, measured): a web view with the keys hands ⌘W to its page, and
  /// the menu hears only what the page left alone — a GitHub page's ⌘W, the board's when it had nothing to close
  /// (2026-10-14: its CMDKEYS prevent only a ⌘W they took), never VS Code Web's.
  @objc func closeHalfOrWindow(_ sender: Any?) {
    // another window in front (the About panel): it is the one ⌘W closes, not a half of the board
    guard NSApp.keyWindow == nil || NSApp.keyWindow === window else { NSApp.keyWindow?.performClose(sender); return }
    web.evaluateJavaScript("window.peixKey ? !!window.peixKey('KeyW', 'cmd') : false") { [weak self] v, _ in
      guard let self, (v as? Bool) != true else { return }
      if self.fillSaved != nil { self.toggleFill(nil) }   // borderless, the window has no close button for performClose to press
      self.window.performClose(nil)
    }
  }
  // ⌘W in VS Code Web with no editor open closes its tab (2026-10-14), as it closes desktop VS Code's window. A page
  // in the pane hears ⌘W before the Window menu does — AppKit offers a key equivalent to the key window's views first,
  // and WKWebView takes it for the page, handing it back only when the page leaves it alone — and the workbench never
  // leaves it: its close-editor is ⌘W with no condition, so with nothing to close the key was swallowed. This script
  // takes ⌘W first only when the editor area is empty, one group and no editor in it: the editor part's own `empty`
  // (its isEmpty, `count === 1 && activeGroup.isEmpty`, which VS Code's CSS styles by — 1.139 to 1.141 alike). The
  // board then drops the tab of the view it came from, by its key. An editor open, ⌘W is VS Code's; a key held down is
  // one press; an event the page made itself (a webview's keys, passed on) is left alone.
  static let editorEmptyScript = """
    addEventListener('keydown', e => {
      if (!e.isTrusted || !e.metaKey || e.ctrlKey || e.altKey || e.shiftKey || e.key.toLowerCase() !== 'w') return;
      const parts = document.querySelectorAll('.monaco-workbench .part.editor > .content');
      if (parts.length !== 1 || !parts[0].classList.contains('empty')) return;
      e.preventDefault(); e.stopImmediatePropagation();
      if (!e.repeat) webkit.messageHandlers.peixPaneClose.postMessage('empty');
    }, true);
    """
  /// The editor's views (`ide:`) get the script and its handler — once per content controller, should views share one.
  private func closeWhenEmpty(_ w: WKWebView, _ key: String) {
    let ucc = w.configuration.userContentController
    guard key.hasPrefix("ide:"), !ucc.userScripts.contains(where: { $0.source == AppDelegate.editorEmptyScript }) else { return }
    ucc.addUserScript(WKUserScript(source: AppDelegate.editorEmptyScript, injectionTime: .atDocumentStart, forMainFrameOnly: true))
    ucc.add(EditorEmpty { [weak self] in self?.editorEmpty($0) }, name: "peixPaneClose")
  }
  /// Heard from an editor's view: its main frame, at the origin of the page its key opened, and nothing else.
  private func editorEmpty(_ m: WKScriptMessage) {
    let o = m.frameInfo.securityOrigin
    guard let key = paneViews.first(where: { $0.value === m.webView })?.key, key.hasPrefix("ide:"),
          let page = URL(string: String(key.dropFirst(4))), m.frameInfo.isMainFrame, o.host == page.host, o.port == page.port ?? 0 else { return }
    logLine("pane: ⌘W on an empty editor — \(key) closed")
    web.evaluateJavaScript("window.peixPaneClose && window.peixPaneClose(\(jsLit(key)))", completionHandler: nil)
  }
  /// ⌘, — the board's settings dialog (2026-09-28: they left the list's cog for the chat header's ···). A menu item's
  /// key equivalent comes before any responder, so it asks the page itself, as ⌘W does.
  @objc func openSettings(_ sender: Any?) {
    web.evaluateJavaScript("window.peixKey && window.peixKey('Comma', 'cmd')", completionHandler: nil)
  }
  /// ‹ › ↻ ↗ from the strip, for the page on top — or for the page `key` names: its address edited in the strip
  /// (2026-10-27), `go` loads what was typed in that view, its history kept, and `keys` hands the page the keys back.
  func paneNav(_ what: String, key: String? = nil, url: String? = nil) {
    guard let w = (key ?? paneTarget).flatMap({ paneViews[$0] }) else { return }
    switch what {
    case "back": w.goBack()
    case "forward": w.goForward()
    case "reload": w.reload()
    case "external": if let u = w.url { NSWorkspace.shared.open(u) }
    case "go":
      guard let u = url.flatMap({ URL(string: $0) }), ["http", "https"].contains(u.scheme?.lowercased() ?? "") else { return }
      w.load(URLRequest(url: u)); if !w.isHidden { window.makeFirstResponder(w) }
    case "keys": if !w.isHidden { window.makeFirstResponder(w) }
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
    guard findBar != nil, let r = paneTarget.flatMap({ paneRects[$0] }) else { return }
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
    guard !paneOverlay.isHidden, let w = paneTarget.flatMap({ paneViews[$0] }) else { return }
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
    paneTarget.flatMap({ paneViews[$0] })?.evaluateJavaScript(kDropSelection, completionHandler: nil)
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

  // Esc with the pane up, from a page in the pane: the board's business (the chat tab comes back and the pane goes) —
  // forwarded as peixKey('Escape') and swallowed (the editor's own Esc is given up for this, by choice). An Esc on the
  // board's own view is not touched (2026-10-14): swallowed too, claude's drawer beside a page never heard it — no
  // interrupt —, nor did a box; the page does hotEscape's itself outside a terminal or a box. With the pane hidden the
  // key is not touched at all (dialogs, the rename box keep it).
  private func installEscapeMonitor() {
    NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] e in
      guard let self = self, e.window === self.window, e.modifierFlags.intersection([.command, .control, .option]).isEmpty else { return e }
      // The find bar takes both keys back from the pane while it is up: Esc closes it (and stops there — the pane
      // stays), ⏎ / ⇧⏎ step the matches from the field, where Esc would otherwise only empty the box.
      if self.findOn {
        if e.keyCode == 53 { self.closeFind(); return nil }
        if e.keyCode == 36, self.findField.currentEditor() != nil {
          self.stepFind(forward: !e.modifierFlags.contains(.shift)); return nil
        }
      }
      guard e.keyCode == 53, !self.paneOverlay.isHidden, let fr = self.window.firstResponder as? NSView else { return e }
      guard fr.isDescendant(of: self.paneOverlay) else { return e }
      self.web.evaluateJavaScript("window.peixKey && window.peixKey('Escape')", completionHandler: nil)
      return nil
    }
  }
  // ⌥⌘ + one of the board's hotkeys (HOTKEYS in index.html — the same list here, kept by hand): the letters, ↑ ↓ for
  // the chat above or below, ← → for the tab beside, 1 and 2 for the top and bottom halves of a stacked chat column
  // (2026-09-27; by key code, since ⌥ composes a symbol over a digit on a Portuguese layout), W to close the tab the
  // keys are in (2026-09-28 — VS Code Web's own ⌥⌘W, whole word in its find, is given up for it), B to hide the chat
  // list (⌘B until 2026-10-02; VS Code Web's ⌥⌘B, its secondary side bar, is given up for it), Y the themes, L the launcher, D a chat's changes, A the overview and 0 the home (2026-10-10), R the
  // board reloaded (2026-10-13 — VS Code Web's ⌥⌘R, reveal in Finder, has no Finder to reveal in), V the folder in VS Code's
  // own window (2026-10-14), J the chat's timeline (2026-10-17), M lunch's menus (2026-10-18), Z Zé's game (2026-10-30);
  // and ⌘ + one of the
  // layout keys (CMDKEYS there): 0, 1 and 2 for the halves of the chat column, and T a new tab (2026-10-13 — VS Code Web's
  // ⌘T, a symbol in the workspace, is given up for it; ⌘W is the Window menu's). Pressed while the pane has the keyboard: its web views are not the board's, so the page
  // would never hear it. Forwarded through peixKey as the page's e.code and which map it belongs to; the page asks
  // for the keyboard back ({type: "focus"}) only when it opens a dialog, or a page's address is edited (2026-10-27).
  static let boardKeys: Set<String> = ["t", "e", "v", "g", "c", "w", "o", "p", "k", "f", "n", "b", "y", "l", "d", "a", "r", "j", "m", "z"]
  static let cmdKeys: Set<String> = ["0", "1", "2", "t"]
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
      if e.keyCode == 29 { return ("Digit0", "altcmd") }   // ⌥⌘0, the home (2026-10-10)
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
      if let key = key {   // always (2026-10-14): the board's half is its own to compare, a click on the half it has already moves nothing
        self.web.evaluateJavaScript("window.peixPaneFocus && window.peixPaneFocus(\(jsLit(key)))", completionHandler: nil)
      }
      return e
    }
  }
  private func installHotkeyForwarder() {
    // ⌘R (2026-10-13): the page on top of the pane reloads, as in a browser — but not VS Code Web, whose own key it is
    // (it hears it), and not the board, which ⌥⌘R reloads: with neither up, the key goes on to whatever has the keys.
    NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] e in
      guard let self = self, e.window === self.window, e.modifierFlags.intersection([.command, .option, .control, .shift]) == [.command],
            e.charactersIgnoringModifiers?.lowercased() == "r", !self.paneOverlay.isHidden,
            let key = self.paneTarget, !key.hasPrefix("ide:"), let w = self.paneViews[key] else { return e }
      w.reload()
      return nil
    }
    NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] e in
      guard let self = self, !self.paneOverlay.isHidden, let hot = AppDelegate.hotkeyCode(e),
            let fr = self.window.firstResponder as? NSView,
            fr.isDescendant(of: self.paneOverlay) || (self.findBar != nil && fr.isDescendant(of: self.findBar)) else { return e }
      // a key held down is one press, as the board's own listener has it — the arrows walk on (2026-10-14: ⌥⌘G held on a
      // page filled the column and gave it back over and over, ⌥⌘R reloaded the board as many times); a repeat is swallowed
      if e.isARepeat && !hot.code.hasPrefix("Arrow") { return nil }
      self.web.evaluateJavaScript("window.peixKey && window.peixKey('\(hot.code)', '\(hot.mods)')", completionHandler: nil)
      return nil
    }
  }

  private func showMessage(_ text: String) {
    boardShown = false
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
    // what wants you, a section each (2026-10-12): the chats asking you, the PRs at your move, the new replies — and
    // what Claude is at work in, last
    let sections: [(String, [[String: String]])] = [("Asking you", needsInput), ("Your move", yourMoves), ("New replies", newReplies), ("Clauding", clauding)]
    if sections.prefix(3).allSatisfy({ $0.1.isEmpty }) {
      menu.addItem(withTitle: "Nothing is asking you", action: nil, keyEquivalent: "").isEnabled = false
    }
    for (heading, chats) in sections where !chats.isEmpty {
      menu.addItem(withTitle: heading, action: nil, keyEquivalent: "").isEnabled = false
      for s in chats.prefix(12) {
        let item = NSMenuItem(title: "  \(s["project"] ?? "")  ·  \(s["title"] ?? "")",
                              action: #selector(openFromMenu(_:)), keyEquivalent: "")
        item.target = self; item.representedObject = s["id"]
        menu.addItem(item)
      }
    }
    menu.addItem(.separator())
    // ⌃⌘F's way out where the menu bar shows it (2026-10-13): filled, the View menu is behind the auto-hidden menu bar, and
    // with the board in the back the fill still covers the screen — this menu is then the one control in reach. Its
    // title flips with View's (validateMenuItem).
    let full = menu.addItem(withTitle: isFull ? "Exit Full Screen" : "Enter Full Screen", action: #selector(toggleFull(_:)), keyEquivalent: "f")
    full.keyEquivalentModifierMask = [.control, .command]; full.target = self
    menu.addItem(.separator())
    menu.addItem(withTitle: "Reload", action: #selector(reloadBoard(_:)), keyEquivalent: "").target = self
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
    appMenu.addItem(withTitle: "Settings…", action: #selector(openSettings(_:)), keyEquivalent: ",").target = self
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
    // ⌘R is a page's, never the menu's (2026-10-13): the key monitor reloads the page in the pane with it and leaves it to
    // VS Code Web and the board, so this item carries no key equivalent — one would take ⌘R before VS Code could
    view.addItem(withTitle: "Reload Page", action: #selector(reloadPage(_:)), keyEquivalent: "").target = self
    let board = view.addItem(withTitle: "Reload Board", action: #selector(reloadBoard(_:)), keyEquivalent: "r")
    board.keyEquivalentModifierMask = [.option, .command]; board.target = self
    view.addItem(withTitle: "Restart Server", action: #selector(restartServer(_:)), keyEquivalent: "R").target = self
    view.addItem(.separator())
    // ⌃⌘F is whichever full screen Settings › Look picks (toggleFull): the board's own fill, or the system's. AppKit adds
    // an Enter Full Screen of its own to any View menu without a toggleFullScreen: item — the default below keeps it out.
    UserDefaults.standard.register(defaults: ["NSFullScreenMenuItemEverywhere": false])
    let full = view.addItem(withTitle: "Enter Full Screen", action: #selector(toggleFull(_:)), keyEquivalent: "f")
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
  /// The page on top of the pane, reloaded (the strip's ↻ does it too) — ⌘R through the key monitor, or the menu.
  @objc func reloadPage(_ sender: Any?) {
    if let w = paneTarget.flatMap({ paneViews[$0] }), !paneOverlay.isHidden { w.reload() }
  }
  /// The board itself (⌥⌘R, 2026-10-13; ⌘R's when no page was up before): reloaded where it is, the open chat's address
  /// kept — or loaded afresh over a message.
  @objc func reloadBoard(_ sender: Any?) {
    loadBoard(reload: boardShown)
  }
  /// The board loaded, or reloaded where it is, with its key given first (2026-10-16).
  func loadBoard(reload: Bool = false) {
    giveKey()
    if reload { web.reload() } else { web.load(URLRequest(url: kURL)) }
  }
  private var keyGiven: String?
  /// The file's key on the board's view, as `window.PEIX_KEY` before the page's script — on the board's own origin only —,
  /// put there again when the file's has changed (a first boot, a new key). The board's view has no other user script.
  private func giveKey() {
    let key = boardKey()
    guard key != keyGiven else { return }
    keyGiven = key
    let ucc = web.configuration.userContentController
    ucc.removeAllUserScripts()
    guard let key else { logLine("key: none at \(kKeyFile.path) — the board asks for it"); return }
    let origin = String(kURL.absoluteString.dropLast())
    ucc.addUserScript(WKUserScript(source: "if (location.origin === '\(origin)') window.PEIX_KEY = '\(key)';", injectionTime: .atDocumentStart, forMainFrameOnly: true))
  }
  func validateMenuItem(_ item: NSMenuItem) -> Bool {
    let paneUp = paneOverlay != nil && !paneOverlay.isHidden
    if item.action == #selector(reloadPage(_:)) { return paneUp && paneTarget.flatMap({ paneViews[$0] }) != nil }
    if item.action == #selector(toggleFull(_:)) {
      item.title = isFull ? "Exit Full Screen" : "Enter Full Screen"
    }
    if item.action == #selector(findInPage(_:)) { return paneUp }
    if item.action == #selector(findNext(_:)) || item.action == #selector(findPrevious(_:)) {
      return paneUp && !findQuery.isEmpty
    }
    return true
  }
  @objc func openLog(_ sender: Any?) { NSWorkspace.shared.open(kLog) }
  /// Full screen either way: the window in one now, the fill or the system's.
  var isFull: Bool { fillSaved != nil || window?.styleMask.contains(.fullScreen) == true }   // the status menu is built before the window
  /// ⌃⌘F — the View menu's item, the fish's, a shell's SIGUSR1 — is the full screen Settings › Look picks (2026-10-14):
  /// the fill (toggleFill), or the system's, in a Space of its own (spaceMode). Out of whichever the window is in.
  @objc func toggleFull(_ sender: Any?) {
    if fillSaved != nil { toggleFill(nil) }
    else if spaceMode || window.styleMask.contains(.fullScreen) { window.toggleFullScreen(nil) }
    else { toggleFill(nil) }
  }
  /// Settings › Look's pick (2026-10-14), posted by the page on every load and change. Turned while full screen, the
  /// window goes from one kind to the other: out of the fill and into a Space at once; out of a Space first — its
  /// animation runs — and into the fill when it is over (windowDidExitFullScreen).
  func setSpaceMode(_ on: Bool) {
    UserDefaults.standard.set(on, forKey: kSpaceKey)
    guard on != spaceMode else { return }
    spaceMode = on
    logLine("full screen: \(on ? "its own Space" : "the fill")")
    if on {
      window.collectionBehavior = [.fullScreenPrimary]
      if fillSaved != nil { toggleFill(nil); DispatchQueue.main.async { self.window.toggleFullScreen(nil) } }
    } else if window.styleMask.contains(.fullScreen) {
      fillAfterSpace = true
      window.toggleFullScreen(nil)
    } else {
      window.collectionBehavior = [.fullScreenNone]
    }
  }
  // The system's full screen (2026-10-14): a Space of its own — Mission Control's tile, a swipe between desktops, the
  // menu bar and the title bar coming down together at the top edge, the Dock as full screen has it — all the
  // system's, so the fill's machinery (dockTick, the lights, the tuck) stays off. The window sits below the housing:
  // measured, AppKit keeps a full-screen window's frame there whatever setFrame or willUseFullScreenContentSize ask, and
  // the strip beside the housing is the menu bar's. So the page hears no fill and no housing (tellFill). The frame's
  // autosave is off meanwhile, as in the fill; a close leaves the Space first (AppKit's own), a quit does not.
  func windowWillEnterFullScreen(_ note: Notification) { window.setFrameAutosaveName("") }
  func windowDidEnterFullScreen(_ note: Notification) {
    UserDefaults.standard.set(true, forKey: kFillKey)
    logLine("full screen: on, its own Space \(NSStringFromRect(window.frame))")
    tellFill()
  }
  func windowDidFailToEnterFullScreen(_ window: NSWindow) { window.setFrameAutosaveName(kFrameName) }
  func windowDidExitFullScreen(_ note: Notification) {
    window.setFrameAutosaveName(kFrameName)
    UserDefaults.standard.set(false, forKey: kFillKey)
    logLine("full screen: off \(NSStringFromRect(window.frame))")
    if !spaceMode { window.collectionBehavior = [.fullScreenNone] }
    if fillAfterSpace { fillAfterSpace = false; toggleFill(nil) } else { tellFill() }
  }
  /// ⌃⌘F's fill (2026-09-27): the board fills the screen, the strip beside the camera housing included.
  /// Not the system's full screen: that one always sets the window below the housing and leaves the strip black — it is
  /// where the auto-hidden menu bar slides in — and nothing in AppKit changes it (its own doc for
  /// NSScreen.safeAreaInsets says so; measured again 2026-10-14), which is why the window offers it only when Settings ›
  /// Look picks it (toggleFull). This is what
  /// Apple calls a custom full-screen experience, kitty's and Sublime Text's: the window borderless, its frame the
  /// whole screen, the menu bar auto-hidden and the Dock hidden, out only after a hold at its edge (dockTick) — on a
  /// screen with a housing; without one the menu bar is hidden outright (placeFill). The page is told where the housing
  /// is (tellFill) and lays its top row around it. No Space of its own —
  /// Mission Control shows a window. The frame's autosave is off meanwhile, so a quit mid-fill does not bring the next
  /// launch up screen-sized; the fill itself is remembered (kFillKey), so it does come back filled. Info.plist says
  /// NSPrefersDisplaySafeAreaCompatibilityMode = false, or a window behind the housing could switch the display into
  /// the shrunken compatibility mode.
  @objc func toggleFill(_ sender: Any?) {
    if let saved = fillSaved {
      fillSaved = nil
      lightsUp("fill off")
      fillTick?.invalidate(); fillTick = nil; dockOut = false; edgeSince = nil; menuOut = false; topSince = nil
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
      if NSApp.isActive { startDockTick() }   // ⌃⌘F from a shell (SIGUSR1) comes with the app behind: it starts when the app comes forward
    }
    window.makeKeyAndOrderFront(nil)
    window.makeFirstResponder(paneFocus.flatMap { paneViews[$0] } ?? web)   // a new style mask can drop the first responder
    UserDefaults.standard.set(fillSaved != nil, forKey: kFillKey)
    // The visible frame says whether the options took: filled, it is the whole screen (the Dock and the menu bar gone).
    logLine("fill: \(fillSaved != nil ? "on \(NSStringFromRect(window.frame))" : "off") options \(NSApp.presentationOptions.rawValue) visible \(NSStringFromRect(window.screen?.visibleFrame ?? .zero))")
    tellFill()
  }
  /// What becomes of the menu bar in the fill, per screen (2026-09-28). Both take the whole screen; what tells them
  /// apart is the camera housing, which the screen reports exactly (a top safe-area inset) — no guessing from the
  /// resolution, and it follows the lid, a display plugged in and mirroring (mirrored, the one screen is the
  /// external's). Beside a housing the strip either side of it is the menu bar's and the board's both: the menu bar
  /// auto-hidden, sliding into the strip at the top edge, the page laying its top row around the housing (tellFill).
  /// Without one there is no such strip — an auto-hidden menu bar slid over the search box and the chat's title at
  /// every reach for the top edge ("the menu bar is showing and overlapping the app") — so it is hidden outright while
  /// the board is in front, and let out by a hold at the top edge, as the Dock is at its own (dockTick). The Dock is
  /// hidden on both. Run on the fill and on every change of screen.
  func placeFill(on screen: NSScreen) {
    fillHousing = screen.safeAreaInsets.top > 0
    fillMenuH = max(screen.safeAreaInsets.top, NSApp.mainMenu?.menuBarHeight ?? 0)   // the housing's strip beside one, the main menu's own elsewhere
    if fillMenuH <= 0 { fillMenuH = 24 }
    let options = fillOptions()
    if NSApp.presentationOptions != options { NSApp.presentationOptions = options }   // the same again is the Dock's and the menu bar's work for nothing (2026-10-15)
    if window.frame != screen.frame { window.setFrame(screen.frame, display: true) }
  }
  /// The fill's options as things stand: the Dock hidden unless let out; the menu bar auto-hidden beside a housing or
  /// while let out, hidden outright otherwise — and auto-hidden whenever the Dock is out, since AppKit refuses
  /// hideMenuBar without hideDock (an exception, not a no-op). With the lights down the menu bar is not hidden at all,
  /// so it stays out over their strip while the pointer goes down to them (lightsDown).
  func fillOptions() -> NSApplication.PresentationOptions {
    let dock: NSApplication.PresentationOptions = dockOut ? .autoHideDock : .hideDock
    if lightsOut { return dock }
    let menu: NSApplication.PresentationOptions = fillHousing || menuOut || dockOut ? .autoHideMenuBar : .hideMenuBar
    return menu.union(dock)
  }
  /// Beside a housing the menu bar is auto-hidden, and coming forward across a change of Space — a swipe, ⌘-Tab to the
  /// board on another desktop, a launch — left it out over the head row until the pointer had been through it
  /// (2026-10-03, measured: the system's options autoHideMenuBar all along and the bar still out 18 s on; back from
  /// Mission Control, no Space changed, it went at once). So half a second on, the slide over, it is hidden outright for a
  /// moment and auto-hidden again — not while the Dock is out (hideMenuBar wants hideDock), nor with the pointer in the
  /// strip, reaching for it. The log says whether it was out.
  func tuckMenuBarSoon() {
    tuck?.cancel()
    let w = DispatchWorkItem { [weak self] in self?.tuckMenuBar() }
    tuck = w
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.5, execute: w)
  }
  func tuckMenuBar() {
    guard fillSaved != nil, fillHousing, !dockOut, !lightsOut, NSApp.isActive, !window.isMiniaturized, let screen = window.screen,
          NSEvent.mouseLocation.y < screen.frame.maxY - screen.safeAreaInsets.top - 8 else { return }
    let out = NSMenu.menuBarVisible()
    NSApp.presentationOptions = [.hideDock, .hideMenuBar]
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { [weak self] in
      guard let self, self.fillSaved != nil, !self.window.isMiniaturized else { return }
      NSApp.presentationOptions = self.fillOptions()
    }
    logLine("menu bar: tucked (\(out ? "it was out" : "it was in"))")
  }
  /// The Dock's edge of the screen, from its own preference: bottom unless it says left or right.
  static func dockEdge() -> String { UserDefaults(suiteName: "com.apple.dock")?.string(forKey: "orientation") ?? "bottom" }
  /// The poll, in .common so it runs under menu tracking too; the Dock's edge read once here, not on every tick
  /// (a UserDefaults suite made ten times a second, 2026-09-27).
  func startDockTick() {
    fillTick?.invalidate()
    dockSide = AppDelegate.dockEdge()
    let t = Timer(timeInterval: 0.1, repeats: true) { [weak self] _ in self?.dockTick() }
    t.tolerance = 0.03   // the system may fold its wakeups in with others
    RunLoop.main.add(t, forMode: .common); fillTick = t
  }
  /// Ten times a second while filled. The Dock is hidden outright (hideDock): auto-hidden it came out under every touch
  /// of the right edge, where the chat column's own controls are (2026-09-27).
  /// A pointer *held* at its edge for dockHold lets it out (autoHideDock, with the pointer already there) until the
  /// pointer is 100 px off that edge again — the system full screen's kind of push (then: "the dock is not showing
  /// when I go to the edge on the right"). Polled, not tracked: the pointer is over web views and native views alike.
  /// The menu bar the same way on a screen without a housing (2026-09-28): a hold at the top edge for menuHold lets it
  /// out (auto-hidden, with the pointer already there), and it goes back to hidden outright once the pointer is 100 pt
  /// below the top *and* the system has hidden it again — never under an open menu, ours or a status item's.
  func dockTick() {
    guard fillSaved != nil, let screen = window.screen else { return }
    let p = NSEvent.mouseLocation, f = screen.frame, now = Date().timeIntervalSinceReferenceDate
    lightsTick(p, f)
    guard f.insetBy(dx: -2, dy: -2).contains(p) else { return }   // on another screen
    let at: Bool, off: Bool
    switch dockSide {
    case "left": at = p.x <= f.minX + 2; off = p.x > f.minX + 100
    case "right": at = p.x >= f.maxX - 2; off = p.x < f.maxX - 100
    default: at = p.y <= f.minY + 2; off = p.y > f.minY + 100
    }
    if dockOut {
      if off { dockOut = false; NSApp.presentationOptions = fillOptions(); logLine("dock: back") }
    } else if at {
      if let since = edgeSince, now - since >= AppDelegate.dockHold {
        dockOut = true; edgeSince = nil; NSApp.presentationOptions = fillOptions(); logLine("dock: out")
      } else if edgeSince == nil { edgeSince = now }
    } else { edgeSince = nil }
    guard !fillHousing else { return }
    if menuOut {
      if p.y < f.maxY - 100, !NSMenu.menuBarVisible() { menuOut = false; NSApp.presentationOptions = fillOptions(); logLine("menu bar: back") }
    } else if p.y >= f.maxY - 2 {
      if let since = topSince, now - since >= AppDelegate.menuHold {
        menuOut = true; topSince = nil; NSApp.presentationOptions = fillOptions(); logLine("menu bar: out")
      } else if topSince == nil { topSince = now }
    } else { topSince = nil }
  }
  // ---- the lights ----------------------------------------------------------------------------------
  // (2026-10-13) Filled, the window is borderless: no title bar, no lights, and the one way out in sight was View's item
  // behind the hidden menu bar. So the lights come down with the menu bar, as the system's full screen shows its title
  // bar: when the menu bar comes out — the pointer at the top edge beside a housing, its hold elsewhere (menuOut) — a
  // strip slides in under it, the three lights on the left and the window's title (the page's chat) in the middle,
  // over the board and the pane's pages alike. Green leaves the fill, yellow minimizes, red quits the app
  // (2026-10-13: the window is the app, so its close is the app's). While the strip is down the menu bar is held out (fillOptions), or it would slide away as the
  // pointer left it for the lights; both go once the pointer is below the strip. Drawn here (LightButton): a
  // borderless window's standard buttons only beep, and show no marks outside a title bar.

  /// The lights' part of dockTick. Down when the pointer is within the menu bar's height of the top and the menu bar is
  /// out — the system asked only then, so the tick costs nothing more anywhere else; up when the pointer is below the
  /// strip or off the screen, but not while a menu of the app's is open (the run loop is tracking it).
  func lightsTick(_ p: NSPoint, _ f: NSRect) {
    let on = f.insetBy(dx: -2, dy: -2).contains(p)
    if lightsOut {
      if !on || p.y < f.maxY - lightsBand, RunLoop.current.currentMode != .eventTracking { lightsUp("the pointer left") }
    } else if on, p.y >= f.maxY - fillMenuH, NSMenu.menuBarVisible() { lightsDown() }
  }
  func lightsDown() {
    let top = fillMenuH
    lightsBand = top + AppDelegate.lightsH + 12
    lightsTitle.stringValue = window.title
    lightsOut = true
    NSApp.presentationOptions = fillOptions()
    lightsGroup.hover = false
    lights.alphaValue = 0; lights.isHidden = false
    let still = NSWorkspace.shared.accessibilityDisplayShouldReduceMotion   // Reduce Motion: a fade, no slide
    lightsTopC.constant = still ? top : top - 6
    NSAnimationContext.runAnimationGroup { ctx in
      ctx.duration = 0.18
      ctx.timingFunction = CAMediaTimingFunction(name: .easeOut)
      lights.animator().alphaValue = 1
      lightsTopC.animator().constant = top
    }
    logLine("fill: lights down (menu bar \(Int(top)) pt)")
  }
  /// The strip up and the menu bar let go — beside a housing tucked half a second on, since an auto-hidden menu bar
  /// let go with the pointer away from it has stayed out before (tuckMenuBar).
  func lightsUp(_ why: String) {
    guard lightsOut else { return }
    lightsOut = false
    lightsGroup.hover = false
    if fillSaved != nil { NSApp.presentationOptions = fillOptions(); if fillHousing { tuckMenuBarSoon() } }
    NSAnimationContext.runAnimationGroup({ ctx in ctx.duration = 0.15; lights.animator().alphaValue = 0 }, completionHandler: { [weak self] in
      guard let self, !self.lightsOut else { return }
      self.lights.isHidden = true
    })
    logLine("fill: lights up (\(why))")
  }
  /// Yellow: a borderless window cannot be miniaturized, so the fill's gains the flag (toggleFill sets the mask whole
  /// again), the keys kept where they were.
  @objc func lightsMinimize(_ sender: Any?) {
    lightsUp("minimize")
    let keys = window.firstResponder
    window.styleMask.insert(.miniaturizable)
    window.makeFirstResponder(keys)
    window.miniaturize(nil)
  }
  /// Down in the Dock, the fill's options would keep the Dock hidden while the app is in front — and the window with it,
  /// out of reach; they come back with the window. Nothing else puts them back meanwhile (2026-10-14): the app coming
  /// forward, a change of Space or of screen, and the menu bar's tuck each did, the Dock hidden over the window in it.
  func windowDidMiniaturize(_ note: Notification) {
    guard fillSaved != nil else { return }
    fillTick?.invalidate(); fillTick = nil
    NSApp.presentationOptions = []
  }
  func windowDidDeminiaturize(_ note: Notification) {
    guard fillSaved != nil, let screen = window.screen ?? NSScreen.main else { return }
    placeFill(on: screen)
    if NSApp.isActive { startDockTick() }
  }
  private func buildLights() {
    lights = NSVisualEffectView()
    lights.material = .titlebar
    lights.blendingMode = .withinWindow
    lights.state = .active
    lights.translatesAutoresizingMaskIntoConstraints = false
    lights.isHidden = true
    lightsGroup = LightsGroup([
      LightButton(.close, tip: "Quit peixAIrada", target: NSApp, action: #selector(NSApplication.terminate(_:))),
      LightButton(.minimize, tip: "Minimize", target: self, action: #selector(lightsMinimize(_:))),
      LightButton(.fill, tip: "Exit Full Screen (⌃⌘F)", target: self, action: #selector(toggleFill(_:))),
    ])
    lightsTitle = NSTextField(labelWithString: "")
    lightsTitle.font = NSFont.titleBarFont(ofSize: NSFont.systemFontSize)
    lightsTitle.lineBreakMode = .byTruncatingTail
    lightsTitle.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
    let rule = NSBox(); rule.boxType = .separator
    for v in [lightsGroup!, lightsTitle!, rule] as [NSView] { v.translatesAutoresizingMaskIntoConstraints = false; lights.addSubview(v) }
    content.addSubview(lights)   // the last: over the board, the pane's pages and the find bar
    lightsTopC = lights.topAnchor.constraint(equalTo: content.topAnchor, constant: 0)
    let mid = lightsTitle.centerXAnchor.constraint(equalTo: lights.centerXAnchor)
    mid.priority = .defaultHigh   // centred while it fits between the lights and the edge, truncated otherwise
    NSLayoutConstraint.activate([
      lightsTopC, lights.leadingAnchor.constraint(equalTo: content.leadingAnchor), lights.trailingAnchor.constraint(equalTo: content.trailingAnchor),
      lights.heightAnchor.constraint(equalToConstant: AppDelegate.lightsH),
      lightsGroup.leadingAnchor.constraint(equalTo: lights.leadingAnchor, constant: 7), lightsGroup.centerYAnchor.constraint(equalTo: lights.centerYAnchor),
      mid, lightsTitle.centerYAnchor.constraint(equalTo: lights.centerYAnchor),
      lightsTitle.leadingAnchor.constraint(greaterThanOrEqualTo: lightsGroup.trailingAnchor, constant: 20),
      lightsTitle.trailingAnchor.constraint(lessThanOrEqualTo: lights.trailingAnchor, constant: -20),
      rule.leadingAnchor.constraint(equalTo: lights.leadingAnchor), rule.trailingAnchor.constraint(equalTo: lights.trailingAnchor),
      rule.bottomAnchor.constraint(equalTo: lights.bottomAnchor),
    ])
  }
  /// The green button, and a title bar double-click, come here as a zoom (fullScreenNone above): a plain click on the
  /// button is the fill; ⌥-click, and the double-click, zoom as they always did. The button's click is the current
  /// event — one click, ⌥ up; a zoom asked for any other way is left alone. With the system's full screen picked the
  /// button is its own, and a zoom is a zoom.
  func windowShouldZoom(_ window: NSWindow, toFrame newFrame: NSRect) -> Bool {
    guard !spaceMode, let e = NSApp.currentEvent, e.type == .leftMouseUp || e.type == .leftMouseDown, e.clickCount <= 1,
          !e.modifierFlags.contains(.option) else { return true }
    toggleFill(nil)
    return false
  }
  /// The page hears of the fill (peixFill): on or off and, on a screen with a camera housing, where the housing is in
  /// its own px — the strip's height and the x range the housing covers — so its top row keeps out of it and uses the
  /// strips either side. Sent on every toggle, on a change of screen, and when the board has loaded (a reload forgets).
  /// Only when it says something new (2026-10-15, `fillSaid`): peixFill lays the top row out again, which reads the
  /// layout — after a screen's notification, a full style and layout of the board at once, ~0.5 s of the main thread
  /// in a page open for hours — and the screen's notifications came every few seconds with nothing changed.
  func tellFill() {
    var notch = "null"
    if fillSaved != nil, let screen = window.screen, screen.safeAreaInsets.top > 0,
       let l = screen.auxiliaryTopLeftArea, let r = screen.auxiliaryTopRightArea {
      notch = "{top: \(screen.safeAreaInsets.top / zoom), left: \((l.maxX - window.frame.minX) / zoom), right: \((r.minX - window.frame.minX) / zoom)}"
    }
    let js = "window.peixFill && window.peixFill(\(fillSaved != nil), \(notch))"
    if js == fillSaid { return }
    fillSaid = js
    web.evaluateJavaScript(js, completionHandler: nil)
  }
  @objc func restartServer(_ sender: Any?) {
    guard !recovering else { return }   // a start or a restart is already on its way
    showMessage("Restarting the server…")
    bringUpServer(restart: true)
  }

  // ---- watchdog --------------------------------------------------------------------------------
  // The server can vanish under the app: an adopted one was never ours to watch, and a
  // `pkill -f server.mjs` aimed at a throwaway test server matches this one too. The page keeps
  // showing the last board and every button on it just fails, so poll and bring it back.
  private var misses = 0
  private var recovering = false          // a start is in flight — don't race it with a second one
  private var boardShown = false          // the board, not a message, is what the window shows
  private var boardPid: Int32 = 0        // its web process, logged once each time it is a new one (`npm run perf -- --app`)

  private func bringUpServer(restart: Bool = false) {
    recovering = true
    let done: (String?) -> Void = { [weak self] problem in
      guard let self else { return }
      self.recovering = false; self.misses = 0
      if let problem { self.showMessage(problem) } else { self.loadBoard() }
    }
    if restart { server.restart(done) } else { server.start(done) }
  }

  private func checkServer() {
    guard !recovering else { return }
    ServerController.isServing { [weak self] ok in
      DispatchQueue.main.async {
        guard let self, !self.recovering else { return }
        // A message up while the server answers — ⌘R mid-restart, a boot slower than the wait — went on saying so until
        // a reload by hand (2026-10-03): the board comes back on its own.
        if ok && !self.boardShown { logLine("watchdog: the server answers — the board again"); self.loadBoard() }
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

  private func open(sessionId: String, hash: String = "") {
    showWindow(nil)
    web.evaluateJavaScript("location.hash = \(jsLit(hash.isEmpty ? sessionId : hash))", completionHandler: nil)
  }

  private func refreshBadges() {
    guard badged.waiting != needsInput || badged.replies != newReplies || badged.moves != yourMoves || badged.clauding != clauding else { return }   // the status menu was rebuilt per message before (2026-09-27)
    badged = (needsInput, newReplies, yourMoves, clauding)
    let wanting = needsInput.count + newReplies.count
    NSApp.dockTile.badgeLabel = wanting > 0 ? String(wanting) : nil
    statusItem.button?.title = wanting > 0 ? " \(wanting)" : ""
    rebuildStatusMenu()
  }

  // ---- bridge ----------------------------------------------------------------------------------

  func userContentController(_ ucc: WKUserContentController, didReceive message: WKScriptMessage) {
    // The board's page, its main frame, and no one else: the bridge opens any URL in the system (`external`).
    let origin = message.frameInfo.securityOrigin
    guard message.frameInfo.isMainFrame, origin.host == "127.0.0.1", origin.port == kPort,
          let body = message.body as? [String: Any], let type = body["type"] as? String else { return }
    switch type {
    case "state":   // the chats waiting on you, posted by the page when that changes (48k `state:` log lines before, one per burst)
      let asked = Set(needsInput.map { $0["id"] ?? "" })
      let brief: ([String: Any]) -> [String: String] = {
        ["id": $0["id"] as? String ?? "", "project": $0["project"] as? String ?? "", "title": $0["title"] as? String ?? ""]
      }
      needsInput = (body["needs"] as? [[String: Any]] ?? []).map(brief)
      newReplies = (body["replied"] as? [[String: Any]] ?? []).map(brief)
      yourMoves = (body["moves"] as? [[String: Any]] ?? []).map(brief)
      clauding = (body["working"] as? [[String: Any]] ?? []).map(brief)
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
      // If the user is running a server that already posts its own notifications, don't double up.
      let serverNotifies = body["serverNotify"] as? Bool ?? false
      if !focused && !serverNotifies && !quiet {
        notify(kind: body["kind"] as? String ?? "reply",
               heading: body["heading"] as? String ?? "",
               project: body["project"] as? String ?? "",
               title: body["title"] as? String ?? "",
               snippet: body["snippet"] as? String ?? "",
               sessionId: body["sessionId"] as? String ?? "",
               drawer: body["drawer"] as? Bool ?? false,
               hash: body["hash"] as? String ?? "")
      }
    case "pane":
      let places: [PanePlace] = (body["panes"] as? [[String: Any]] ?? []).compactMap { r in
        guard let key = r["key"] as? String else { return nil }
        let d = { (n: String) in CGFloat((r[n] as? Double) ?? 0) * self.zoom }
        return PanePlace(key: key, rect: CGRect(x: d("left"), y: d("top"), width: d("width"), height: d("height")))
      }
      setPane(chat: body["id"] as? String, keys: body["keys"] as? [String] ?? [], places: places, focus: body["focus"] as? String)
    case "nav":
      paneNav(body["what"] as? String ?? "", key: body["key"] as? String, url: body["url"] as? String)
    case "fullscreen":   // Settings › Look's full screen (2026-10-14): the fill, or the system's in a Space of its own
      setSpaceMode(body["space"] as? Bool ?? false)
    case "key":   // the lock's *Read the key again*, a new key made on the board (2026-10-16)
      logLine("key: read again\(boardKey() == nil ? " — there is no key file" : "")")
      loadBoard(reload: true)
    case "zoom":   // the settings' text size (2026-10-12)
      let z = CGFloat(min(2, max(0.5, body["value"] as? Double ?? 1)))
      if z != zoom { zoom = z; web.pageZoom = z; logLine("zoom: \(z)"); tellFill(); tellPane() }
    case "chat":   // the open chat (2026-09-27, night): the window is named after it, and its folder is the represented file
      let title = body["title"] as? String ?? "", project = body["project"] as? String ?? "", cwd = body["cwd"] as? String ?? ""
      window.title = title.isEmpty ? "peixAIrada" : (project.isEmpty ? title : "\(project) · \(title)")
      if lightsOut { lightsTitle.stringValue = window.title }
      window.representedURL = cwd.isEmpty ? nil : URL(fileURLWithPath: cwd, isDirectory: true)   // the proxy icon, and ⌘-click on the title for the path
    case "focus":
      window.makeFirstResponder(web)
    case "appearance":   // the board's dark or light, whatever macOS shows (2026-10-12); null while its theme follows macOS
      let dark = body["dark"] as? Bool
      window.appearance = dark.flatMap { NSAppearance(named: $0 ? .darkAqua : .aqua) }
      if let dark { UserDefaults.standard.set(dark, forKey: kDarkKey) } else { UserDefaults.standard.removeObject(forKey: kDarkKey) }
      logLine("appearance: \(dark.map { $0 ? "dark" : "light" } ?? "macOS's")")
    case "haptic":   // a bump on the trackpad (2026-10-11): a divider at a stop, a tab dropped, a run of days crossed
      let pattern: NSHapticFeedbackManager.FeedbackPattern = switch body["kind"] as? String {
        case "levelChange": .levelChange
        case "generic": .generic
        default: .alignment
      }
      NSHapticFeedbackManager.defaultPerformer.perform(pattern, performanceTime: .now)
    case "external":
      if let s = body["url"] as? String, let url = URL(string: s) { NSWorkspace.shared.open(url) }
    case "chooseFolder":   // the first run's Choose… (2026-10-01): the system's folder panel, its path back to the page
      let panel = NSOpenPanel()
      panel.canChooseDirectories = true; panel.canChooseFiles = false; panel.allowsMultipleSelection = false
      panel.canCreateDirectories = true
      panel.prompt = "Use This Folder"; panel.message = "The folder your git checkouts sit in"
      let dir = ((body["dir"] as? String ?? "") as NSString).expandingTildeInPath   // a regex template took a $ or \\ in the home's path for its own
      if !dir.isEmpty { panel.directoryURL = URL(fileURLWithPath: dir, isDirectory: true) }
      panel.beginSheetModal(for: window) { [weak self] r in
        let path = r == .OK ? panel.url?.path : nil
        self?.web.evaluateJavaScript("window.peixFolder && window.peixFolder(\(path.map(jsLit) ?? "null"))", completionHandler: nil)
      }
    default: break
    }
  }

  // ---- notifications ----------------------------------------------------------------------------

  private func setUpNotifications() {
    guard Bundle.main.bundleIdentifier != nil else { return }
    let center = UNUserNotificationCenter.current()
    center.delegate = self
    // What an alert can be answered with where it shows (2026-10-12): a reply — written into the chat's Claude when its
    // drawer runs here —, done (the card's ✓), or later (the same alert again in 15 minutes). A question is opened, or
    // put off; a ✓ is not offered on it, since a tick ends the chat's processes and a question is Claude waiting.
    let later = UNNotificationAction(identifier: "snooze", title: "In 15 minutes", options: [])
    let done = UNNotificationAction(identifier: "done", title: "Done", options: [])
    let reply = UNTextInputNotificationAction(identifier: "reply", title: "Reply…", options: [], textInputButtonTitle: "Send", textInputPlaceholder: "to Claude, in its drawer")
    center.setNotificationCategories([
      UNNotificationCategory(identifier: "reply-drawer", actions: [reply, done, later], intentIdentifiers: [], options: []),
      UNNotificationCategory(identifier: "reply", actions: [done, later], intentIdentifiers: [], options: []),
      UNNotificationCategory(identifier: "later", actions: [later], intentIdentifiers: [], options: []),
      // lunch time (2026-10-18): the menus (the board in front, ⌥⌘M's chalkboard), Going, or the reminder again in 15
      // minutes — the server's In 15 min, so every page's sign agrees, and its alert comes back by itself
      UNNotificationCategory(identifier: "lunch", actions: [
        UNNotificationAction(identifier: "lunch-menus", title: "Menus", options: [.foreground]),
        UNNotificationAction(identifier: "lunch-going", title: "Going", options: []),
        UNNotificationAction(identifier: "lunch-snooze", title: "In 15 minutes", options: []),
      ], intentIdentifiers: [], options: []),
    ])
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

  /// `heading` is the server's own when it has one (a PR come round to you: "Your move · repo#n"), else the kind's.
  /// `hash` is where a click lands when it is not the chat alone — a PR's alert, its timeline on that PR (2026-10-17).
  private func notify(kind: String, heading given: String, project: String, title: String, snippet: String, sessionId: String, drawer: Bool = false, hash: String = "") {
    let heading = !given.isEmpty ? given : (kind == "reply" ? "Claude replied" : "Claude is asking you") + (project.isEmpty ? "" : " · \(project)")
    let body = [title, snippet].filter { !$0.isEmpty }.joined(separator: "\n")
    guard useUN else {
      logLine("notify: falling back to osascript (useUN=false)")
      return notifyViaAppleScript(heading, title, snippet)
    }
    let content = UNMutableNotificationContent()
    content.title = heading
    content.body = body
    content.sound = .default
    content.userInfo = ["sessionId": sessionId, "hash": hash, "kind": kind]
    content.categoryIdentifier = kind == "lunch" ? "lunch" : sessionId.isEmpty ? "" : kind == "reply" ? (drawer ? "reply-drawer" : "reply") : "later"
    let req = UNNotificationRequest(identifier: kind == "lunch" ? "lunch" : sessionId.isEmpty ? UUID().uuidString : sessionId,
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
    let id = response.notification.request.content.userInfo["sessionId"] as? String ?? ""
    let hash = response.notification.request.content.userInfo["hash"] as? String ?? ""
    let kind = response.notification.request.content.userInfo["kind"] as? String ?? ""
    switch response.actionIdentifier {
    case "lunch-going", "lunch-snooze":
      logLine("notify: lunch \(response.actionIdentifier)")
      web.evaluateJavaScript("window.peixLunch?.(\(jsLit(response.actionIdentifier == "lunch-going" ? "going" : "snooze")))", completionHandler: nil)
    case "lunch-menus":
      showWindow(nil); web.evaluateJavaScript("window.peixLunch?.('menus')", completionHandler: nil)
    case _ where kind == "lunch":   // the banner itself: the menus
      showWindow(nil); web.evaluateJavaScript("window.peixLunch?.('menus')", completionHandler: nil)
    case "reply" where !id.isEmpty:   // into the chat's Claude, by the page (peixReply): the drawer's socket is the page's to speak
      let text = (response as? UNTextInputNotificationResponse)?.userText ?? ""
      logLine("notify: reply to \(id.prefix(8)) (\(text.count) chars)")
      if !text.isEmpty { web.evaluateJavaScript("window.peixReply?.(\(jsLit(id)), \(jsLit(text)))", completionHandler: nil) }
    case "done" where !id.isEmpty:
      logLine("notify: done \(id.prefix(8))")
      web.evaluateJavaScript("window.peixDone?.(\(jsLit(id)))", completionHandler: nil)
    case "snooze":
      let again = UNNotificationRequest(identifier: (id.isEmpty ? UUID().uuidString : id) + "-later", content: response.notification.request.content,
                                        trigger: UNTimeIntervalNotificationTrigger(timeInterval: 15 * 60, repeats: false))
      UNUserNotificationCenter.current().add(again) { err in logLine("notify: later \(err.map { "failed: \($0.localizedDescription)" } ?? "in 15 min")") }
    default:
      if !id.isEmpty { open(sessionId: id, hash: hash) } else { showWindow(nil) }
    }
    completionHandler()
  }

  func userNotificationCenter(_ center: UNUserNotificationCenter,
                              willPresent notification: UNNotification,
                              withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
    completionHandler([.banner, .sound])
  }

  // ---- navigation ---------------------------------------------------------------------------------

  /// Keep the app on the board; anything external (PR links, docs) opens in the real browser — a dev server on another
  /// port of this Mac included: only the board's own origin stays in its view, where the bridge is (2026-10-03).
  func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
               decisionHandler: @escaping @MainActor @Sendable (WKNavigationActionPolicy) -> Void) {
    if let url = action.request.url, action.navigationType == .linkActivated,
       url.host != "127.0.0.1" || url.port != kPort {
      NSWorkspace.shared.open(url)
      return decisionHandler(.cancel)
    }
    decisionHandler(.allow)
  }

  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
    if webView.url?.port == kPort {
      boardShown = true
      // which web process draws the board, for `npm run perf -- --app` (2026-10-13): the app's others are the pane's
      if let pid = (webView.value(forKey: "_webProcessIdentifier") as? NSNumber)?.int32Value, pid > 0, pid != boardPid {
        boardPid = pid; logLine("board: web process \(pid)")
      }
    }
    fillSaid = nil; tellFill()   // a reload forgets the fill
    tellVoiceOver()
  }
  /// The page hears whether VoiceOver runs (2026-10-16, `peixVoiceOver`): the drawer reads its lines out while it does —
  /// the terminal's screen-reader mode, a switch in Settings › Terminal before, which a page alone cannot know to turn on.
  /// Sent when the board has loaded and on every change.
  func tellVoiceOver() {
    web.evaluateJavaScript("window.peixVoiceOver && window.peixVoiceOver(\(NSWorkspace.shared.isVoiceOverEnabled))", completionHandler: nil)
  }
  /// The board's web process gone (killed under memory pressure, crashed): WebKit leaves the view blank and reloads
  /// nothing, and the watchdog only asks the server.
  func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
    logLine("board: its web process ended — loading it again")
    boardShown = false
    loadBoard()
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
  var open: ((WKWebView, URL) -> Void)?   // a new window's web page, to the board (AppDelegate.paneOpen)
  var linkOut: ((URL, @escaping (Bool) -> Void) -> Void)?   // whether a link out goes to the browser, the board's word (AppDelegate.paneLinkOut)
  /// A page's new window — a link with target=_blank, a window.open — is a tab of the chat's own, as a browser's new tab
  /// (2026-10-21). It was loaded in the view it came from: VS Code Web opens every link out that way, and the editor's
  /// tab has no strip, so GitHub filled its half with no address and no way back. Not a web page: loaded here, where
  /// the policy below hands it on or not.
  func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
               for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
    guard let url = navigationAction.request.url else { return nil }
    if let open, ["http", "https"].contains(url.scheme?.lowercased() ?? "") { open(webView, url) } else { webView.load(URLRequest(url: url)) }
    return nil
  }
  /// What a page in the pane may hand to another app (2026-10-14): a link clicked in its own main frame — not a script, a
  /// redirect or a frame inside it — and only to these, mail, the editors and GitHub Desktop. Any other scheme not the
  /// web's is cancelled: every one went to NSWorkspace, file: included, with no click at all.
  static let outSchemes: Set<String> = ["mailto", "vscode", "vscode-insiders", "zed", "x-github-client"]
  func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
               decisionHandler: @escaping @MainActor @Sendable (WKNavigationActionPolicy) -> Void) {
    if let url = action.request.url, let scheme = url.scheme?.lowercased(), !["http", "https", "about", "blob", "data"].contains(scheme) {
      let clicked = action.navigationType == .linkActivated && action.sourceFrame.isMainFrame
      if clicked && PaneDelegate.outSchemes.contains(scheme) { NSWorkspace.shared.open(url) }
      else { logLine("pane: \(scheme): not opened, from \(webView.url?.host ?? "?") — \(clicked ? "not a scheme handed on" : "no link clicked in the page")") }
      return decisionHandler(.cancel)
    }
    // A link to another site clicked in a page (2026-10-21): the board says whether it goes to the browser — Settings ›
    // General › Links, *in the browser* but for the sites it keeps. The page's own site, a script, a redirect, a frame:
    // here, as ever. A new window's link is the board's already (open, above).
    if let url = action.request.url, let ask = linkOut, action.navigationType == .linkActivated, action.targetFrame?.isMainFrame == true,
       url.host?.lowercased() != webView.url?.host?.lowercased() {
      return ask(url) { out in
        if out { logLine("pane: a link to \(url.host ?? "?") — to the browser"); NSWorkspace.shared.open(url) }
        decisionHandler(out ? .cancel : .allow)
      }
    }
    decisionHandler(.allow)
  }
  func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
    if isCancelled(error) { return }
    logLine("pane: could not load \(webView.url?.absoluteString ?? "?"): \(error.localizedDescription)")
  }
  /// A page's web process gone: WebKit leaves the view blank and reloads nothing — the editor most of all, the
  /// heaviest page there is.
  func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
    logLine("pane: the web process of \(webView.url?.absoluteString ?? "?") ended — reloading it")
    webView.reload()
  }
  // What a browser tab does and a web view does not until asked (2026-10-03): an <input type=file> opens the system's
  // panel — GitHub's "attach files" did nothing — and alert(), confirm() and prompt() are sheets over the window:
  // without them alert() was silent and confirm() always said no, so a GitHub button that asks first never went on.
  func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters, initiatedByFrame frame: WKFrameInfo,
               completionHandler: @escaping @MainActor @Sendable ([URL]?) -> Void) {
    PaneDelegate.openPanel(webView, parameters, completionHandler)
  }
  static func openPanel(_ webView: WKWebView, _ parameters: WKOpenPanelParameters, _ completionHandler: @escaping @MainActor @Sendable ([URL]?) -> Void) {
    let panel = NSOpenPanel()
    panel.allowsMultipleSelection = parameters.allowsMultipleSelection
    panel.canChooseDirectories = parameters.allowsDirectories
    panel.canChooseFiles = true
    guard let w = webView.window else { return completionHandler(panel.runModal() == .OK ? panel.urls : nil) }
    panel.beginSheetModal(for: w) { completionHandler($0 == .OK ? panel.urls : nil) }
  }
  func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo,
               completionHandler: @escaping @MainActor @Sendable () -> Void) {
    sheet(alert(frame, message, ["OK"]), over: webView) { _ in completionHandler() }
  }
  func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo,
               completionHandler: @escaping @MainActor @Sendable (Bool) -> Void) {
    sheet(alert(frame, message, ["OK", "Cancel"]), over: webView) { completionHandler($0 == .alertFirstButtonReturn) }
  }
  func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String, defaultText: String?, initiatedByFrame frame: WKFrameInfo,
               completionHandler: @escaping @MainActor @Sendable (String?) -> Void) {
    let a = alert(frame, prompt, ["OK", "Cancel"])
    let field = NSTextField(string: defaultText ?? ""); field.frame = NSRect(x: 0, y: 0, width: 280, height: 24)
    a.accessoryView = field; a.window.initialFirstResponder = field
    sheet(a, over: webView) { completionHandler($0 == .alertFirstButtonReturn ? field.stringValue : nil) }
  }
  private func alert(_ frame: WKFrameInfo, _ text: String, _ buttons: [String]) -> NSAlert {
    let a = NSAlert()
    a.messageText = frame.securityOrigin.host.isEmpty ? "This page says" : "\(frame.securityOrigin.host) says"
    a.informativeText = text
    for b in buttons { a.addButton(withTitle: b) }
    return a
  }
  private func sheet(_ a: NSAlert, over v: WKWebView, _ done: @escaping (NSApplication.ModalResponse) -> Void) {
    if let w = v.window { a.beginSheetModal(for: w, completionHandler: done) } else { done(a.runModal()) }
  }
}

/// What an editor's view says when ⌘W finds it empty (2026-10-14, AppDelegate.closeWhenEmpty): a page in the pane is not
/// the board, so it is heard apart from the board's bridge.
// The board's own view opens the system's panel for an <input type=file> too (2026-10-30, later): Settings › General ›
// Zé's game chooses his face with one, and without a UI delegate WebKit opens nothing. Only that: the rest a UI delegate
// may do — new windows, alerts — stays as the board has always had it.
final class BoardUI: NSObject, WKUIDelegate {
  func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters, initiatedByFrame frame: WKFrameInfo,
               completionHandler: @escaping @MainActor @Sendable ([URL]?) -> Void) {
    PaneDelegate.openPanel(webView, parameters, completionHandler)
  }
}
final class EditorEmpty: NSObject, WKScriptMessageHandler {
  private let heard: (WKScriptMessage) -> Void
  init(_ heard: @escaping (WKScriptMessage) -> Void) { self.heard = heard }
  func userContentController(_ ucc: WKUserContentController, didReceive m: WKScriptMessage) { heard(m) }
}

/// The pane's overlay covers the whole window so each page can sit where the board puts it. A click that lands on
/// none of them belongs to the board underneath, so the overlay never claims one for itself.
final class PaneOverlay: NSView {
  override func hitTest(_ point: NSPoint) -> NSView? { let v = super.hitTest(point); return v === self ? nil : v }
}

/// The Mac's keyboard layout for VS Code Web (2026-10-14). WebKit has no Keyboard Map API, so the workbench cannot ask
/// which layout the keys type in: it starts on U.S. and guesses again from single keys typed, against the 16 Mac
/// layouts it bundles — on a Portuguese Mac ⌘ and its - key commented a line and ⌘⇧7 (its /) did not, until a - or a '
/// was typed and the guess turned Spanish. The editor's pages get Chrome's API here: getLayoutMap() is what the current
/// layout gives each key unshifted (UCKeyTranslate; a dead key its mark), and a change of input source is a
/// `layoutchange` — so VS Code takes the bundled layout nearest the Mac's from the start, as it does in Chrome (Spanish
/// ISO for Portugal's, which it has not got; a layout of the user's own in its keyboardLayout.json then matches whole).
final class KeyboardMap: NSObject, WKScriptMessageHandlerWithReply {
  /// KeyboardEvent.code → macOS key code: the keys Chrome's map names, ISO's two as WebKit's events name them
  static let keys: [(String, UInt16)] = [
    ("KeyA", 0x00), ("KeyS", 0x01), ("KeyD", 0x02), ("KeyF", 0x03), ("KeyH", 0x04), ("KeyG", 0x05), ("KeyZ", 0x06),
    ("KeyX", 0x07), ("KeyC", 0x08), ("KeyV", 0x09), ("IntlBackslash", 0x0A), ("KeyB", 0x0B), ("KeyQ", 0x0C),
    ("KeyW", 0x0D), ("KeyE", 0x0E), ("KeyR", 0x0F), ("KeyY", 0x10), ("KeyT", 0x11), ("Digit1", 0x12), ("Digit2", 0x13),
    ("Digit3", 0x14), ("Digit4", 0x15), ("Digit6", 0x16), ("Digit5", 0x17), ("Equal", 0x18), ("Digit9", 0x19),
    ("Digit7", 0x1A), ("Minus", 0x1B), ("Digit8", 0x1C), ("Digit0", 0x1D), ("BracketRight", 0x1E), ("KeyO", 0x1F),
    ("KeyU", 0x20), ("BracketLeft", 0x21), ("KeyI", 0x22), ("KeyP", 0x23), ("KeyL", 0x25), ("KeyJ", 0x26),
    ("Quote", 0x27), ("KeyK", 0x28), ("Semicolon", 0x29), ("Backslash", 0x2A), ("Comma", 0x2B), ("Slash", 0x2C),
    ("KeyN", 0x2D), ("KeyM", 0x2E), ("Period", 0x2F), ("Backquote", 0x32), ("IntlYen", 0x5D), ("IntlRo", 0x5E),
  ]
  static let script = """
    (() => {
      const ask = window.webkit?.messageHandlers?.peixKeyboard;
      if (navigator.keyboard || !ask) return;
      let map = null;   // the layout's, until it changes
      class Keyboard extends EventTarget {
        getLayoutMap() {
          map ||= ask.postMessage('map').then(m => new Map(Object.entries(m))).catch(e => { map = null; throw e; });
          return map.then(m => new Map(m));
        }
        lock() { return Promise.resolve(); }   // VS Code's when it thinks it is full screen, which a pane's page never is
        unlock() {}
      }
      const kb = new Keyboard();
      kb.addEventListener('layoutchange', () => { map = null; });
      Object.defineProperty(Navigator.prototype, 'keyboard', { configurable: true, enumerable: true, get: () => kb });
    })();
    """
  private let views = NSHashTable<WKWebView>.weakObjects()
  override init() {
    super.init()
    let changed = Notification.Name(kTISNotifySelectedKeyboardInputSourceChanged as String)
    DistributedNotificationCenter.default().addObserver(self, selector: #selector(layoutChanged), name: changed, object: nil)
  }
  /// Another input source chosen: each page asks for the map again.
  @objc func layoutChanged() {
    for w in views.allObjects {
      w.evaluateJavaScript("navigator.keyboard?.dispatchEvent(new Event('layoutchange'))", completionHandler: nil)
    }
  }
  /// The API in the view's pages, from its next load on.
  func install(on w: WKWebView) {
    let ucc = w.configuration.userContentController
    ucc.addUserScript(WKUserScript(source: KeyboardMap.script, injectionTime: .atDocumentStart, forMainFrameOnly: true))
    ucc.removeScriptMessageHandler(forName: "peixKeyboard", contentWorld: .page)   // a second on one controller throws
    ucc.addScriptMessageHandler(self, contentWorld: .page, name: "peixKeyboard")
    views.add(w)
  }
  /// What the current layout gives each key with no modifier; nil for a layout with no Unicode table.
  static func current() -> [String: String]? {
    guard let src = TISCopyCurrentKeyboardLayoutInputSource()?.takeRetainedValue(),
          let p = TISGetInputSourceProperty(src, kTISPropertyUnicodeKeyLayoutData) else { return nil }
    let data = Unmanaged<CFData>.fromOpaque(p).takeUnretainedValue() as Data
    return data.withUnsafeBytes { raw -> [String: String]? in
      guard let layout = raw.bindMemory(to: UCKeyboardLayout.self).baseAddress else { return nil }
      var map: [String: String] = [:]
      let down = UInt16(kUCKeyActionDown), kb = UInt32(LMGetKbdType())
      for (code, vk) in keys {
        var dead: UInt32 = 0, n = 0, chars = [UniChar](repeating: 0, count: 4)
        var ok = UCKeyTranslate(layout, vk, down, 0, kb, 0, &dead, 4, &n, &chars) == noErr
        if ok && dead != 0 {   // a dead key types nothing yet: its mark is what it gives before a space
          ok = UCKeyTranslate(layout, 0x31, down, 0, kb, 0, &dead, 4, &n, &chars) == noErr
        }
        if ok && n > 0 { map[code] = String(utf16CodeUnits: chars, count: n) }
      }
      return map
    }
  }
  func userContentController(_ ucc: WKUserContentController, didReceive message: WKScriptMessage,
                             replyHandler: @escaping @MainActor @Sendable (Any?, String?) -> Void) {
    guard let map = KeyboardMap.current() else { return replyHandler(nil, "this keyboard layout has no Unicode table") }
    replyHandler(map, nil)
  }
}

/// One of the fill's lights (2026-10-13), drawn as a title bar draws its own: a 12 pt disc in the system's colour, a
/// shade darker while pressed, and its mark while the pointer is over the three (LightsGroup) — the close cross, the
/// minimize bar, and full screen's two corners pointing in, which is leaving it.
final class LightButton: NSButton {
  enum Kind { case close, minimize, fill }
  let kind: Kind
  var hover = false { didSet { if hover != oldValue { needsDisplay = true } } }
  init(_ kind: Kind, tip: String, target: AnyObject, action: Selector) {
    self.kind = kind
    super.init(frame: NSRect(x: 0, y: 0, width: 14, height: 16))
    title = ""; isBordered = false; setButtonType(.momentaryPushIn)
    self.target = target; self.action = action
    toolTip = tip; setAccessibilityLabel(tip)
  }
  required init?(coder: NSCoder) { fatalError("not from a nib") }
  override func draw(_ dirtyRect: NSRect) {
    let r = NSRect(x: (bounds.width - 12) / 2, y: (bounds.height - 12) / 2, width: 12, height: 12)
    let (disc, ink): (NSColor, NSColor) = switch kind {
      case .close: (NSColor(srgbRed: 1, green: 0.373, blue: 0.341, alpha: 1), NSColor(srgbRed: 0.3, green: 0, blue: 0, alpha: 0.9))
      case .minimize: (NSColor(srgbRed: 0.996, green: 0.737, blue: 0.18, alpha: 1), NSColor(srgbRed: 0.6, green: 0.34, blue: 0, alpha: 0.9))
      case .fill: (NSColor(srgbRed: 0.157, green: 0.784, blue: 0.251, alpha: 1), NSColor(srgbRed: 0, green: 0.39, blue: 0, alpha: 0.9))
    }
    (isHighlighted ? disc.blended(withFraction: 0.2, of: .black) ?? disc : disc).setFill()
    NSBezierPath(ovalIn: r).fill()
    NSColor.black.withAlphaComponent(0.15).setStroke()
    let rim = NSBezierPath(ovalIn: r.insetBy(dx: 0.25, dy: 0.25)); rim.lineWidth = 0.5; rim.stroke()
    guard hover else { return }
    let at = { (x: CGFloat, y: CGFloat) in NSPoint(x: r.minX + x, y: self.isFlipped ? r.minY + y : r.maxY - y) }   // the disc's square, from its top left
    let mark = NSBezierPath()
    mark.lineCapStyle = .round
    ink.set()
    switch kind {
    case .close:
      mark.move(to: at(3.6, 3.6)); mark.line(to: at(8.4, 8.4)); mark.move(to: at(8.4, 3.6)); mark.line(to: at(3.6, 8.4))
      mark.lineWidth = 1.1; mark.stroke()
    case .minimize:
      mark.move(to: at(3, 6)); mark.line(to: at(9, 6)); mark.lineWidth = 1.2; mark.stroke()
    case .fill:
      for (a, b, c) in [(at(2.7, 5.6), at(5.6, 5.6), at(5.6, 2.7)), (at(9.3, 6.4), at(6.4, 6.4), at(6.4, 9.3))] {
        mark.move(to: a); mark.line(to: b); mark.line(to: c); mark.close()
      }
      mark.fill()
    }
  }
}

/// The three lights side by side (2026-10-13): their marks show together while the pointer is over any of them.
final class LightsGroup: NSView {
  let buttons: [LightButton]
  var hover = false { didSet { buttons.forEach { $0.hover = hover } } }
  init(_ buttons: [LightButton]) {
    self.buttons = buttons
    super.init(frame: NSRect(x: 0, y: 0, width: 54, height: 16))
    for (i, b) in buttons.enumerated() { b.frame.origin = NSPoint(x: CGFloat(i) * 20, y: 0); addSubview(b) }
    addTrackingArea(NSTrackingArea(rect: .zero, options: [.mouseEnteredAndExited, .activeAlways, .inVisibleRect], owner: self))
  }
  required init?(coder: NSCoder) { fatalError("not from a nib") }
  override var intrinsicContentSize: NSSize { NSSize(width: 54, height: 16) }
  override func mouseEntered(with event: NSEvent) { hover = true }
  override func mouseExited(with event: NSEvent) { hover = false }
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
