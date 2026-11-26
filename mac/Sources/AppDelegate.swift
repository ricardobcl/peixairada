// The app's delegate: every stored property of it (an extension holds none), its launch, in front and behind, nobody
// looking, the watchdog over the server.
import Cocoa
import WebKit
import UserNotifications

// ---------------------------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------------------------

final class AppDelegate: NSObject, NSApplicationDelegate, NSMenuDelegate, WKScriptMessageHandler,
                         WKNavigationDelegate, UNUserNotificationCenterDelegate, NSMenuItemValidation,
                         NSSearchFieldDelegate, NSWindowDelegate {
  var window: BoardWindow!
  var web: BoardWebView!
  var keyGiven: String?
  var content: NSView!
  var paneOverlay: PaneOverlay!
  var ground: NSColor!                          // the window's own ground, the board's --frame per appearance (buildWindow)
  var barColor: NSColor?                        // a theme's title bar (the page's `titlebar`), nil for macOS's own (wearBar)
  var lookObs: NSKeyValueObservation?           // the window's appearance, for WebKit's ground (wearBar)
  var webTopC: NSLayoutConstraint!             // the board's top: under the title bar, where the overlay's is (paneTop)
  var paneTopC: NSLayoutConstraint!            // the overlay's top: where the page's own y = 0 is, under a title bar (paneTop)
  var paneTopObs: NSKeyValueObservation?
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
  // Auto-tiling's keys (2026-11-25) — ⌘D, ⇧⌘D, ⌥⌘⇧←→, ⌃⌥⌘T — forwarded (Keys.swift) only while the page says the
  // setting is on (`tiles`): off, VS Code Web keeps them. ⌥⌘⇧←→ only while they move a tile, the column split too
  // (2026-11-26, `arrows`): one half, they are VS Code's column-select.
  static var tileKeys = false
  static var tileArrows = false
  // A press or a key of the user's in a page (2026-11-06): what a page may hand to another app follows one (PaneDelegate's
  // `gestured`). A script's click() arrives as a link clicked in the main frame — WebKit cannot tell them apart.
  var gestureAt: [ObjectIdentifier: Date] = [:]
  var findBar: NSVisualEffectView!             // ⌘F's bar, over the focused page's top right corner; hidden until asked for
  var findRightC: NSLayoutConstraint!         // …placed from that page's rect, so it follows the keys between halves
  var findTopC: NSLayoutConstraint!
  var findField: NSSearchField!
  var findQuery = ""                           // what was last searched for — ⌘G carries on with it after the bar closes
  let paneDelegate = PaneDelegate()
  let keyboardMap = KeyboardMap()                // the Mac's layout for VS Code Web's pages (2026-10-14)
  let server = ServerController()
  var statusItem: NSStatusItem!
  // What wants you, as the page posts it (2026-10-12): the chats asking you and the ones with a new reply — the Dock's
  // badge is their number (it counted the alerts that came while the window was in the back before); the fish's, and its
  // menu, the questions alone (2026-11-25).
  var needsInput: [[String: String]] = []
  var newReplies: [[String: String]] = []
  var mutedChats = Set<String>()          // the chats muted (2026-11-02): what the system still holds for one goes when it joins
  let statusMenu = NSMenu()
  var statusMenuOpen = false
  // The board's own zoom (2026-10-12, the settings' text size): the web view's pageZoom, so the page's CSS px are
  // `zoom` points — what the page and the shell say of places (the pane's rects, the housing, the pane's edge) is
  // turned between the two here.
  var zoom: CGFloat = 1
  var badged: (waiting: [[String: String]], replies: [[String: String]]) = ([], [])   // what the badge and the status menu last showed
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
  var menuOut = false                     // the menu bar let out after a hold at the top edge, until it has hidden again (every screen since 2026-11-01)
  var edgeSince: TimeInterval?            // when the pointer reached the Dock's edge
  var topSince: TimeInterval?             // when the pointer reached the top edge
  var elsewhere = false                   // the pointer on another screen than the fill's: the menu bar and the Dock as any window's (2026-11-07)
  var awaySince: TimeInterval?            // when the pointer left the fill's screen
  static let elsewhereAfter: TimeInterval = 0.25   // …and how long it stays off it before it is elsewhere
  var clickedOut: TimeInterval?           // the last click outside the app (handBack)
  var cameForward: (app: NSRunningApplication, at: TimeInterval)?   // the last other app come forward, and when (handBack)
  var handedBack: TimeInterval?           // the click handBack last answered: once a click
  static let handBackWithin: TimeInterval = 0.5   // the board brought forward this soon after a click elsewhere is no one's doing
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
    NSApp.setActivationPolicy(kProbeAside ? .prohibited : .regular)
    buildMenu()
    buildStatusItem()
    buildWindow()
    #if PEIX_PROBE
    probeBegin()
    #endif
    setUpNotifications()
    watchAway()
    voiceOverObs = NSWorkspace.shared.observe(\.isVoiceOverEnabled) { [weak self] _, _ in DispatchQueue.main.async { self?.tellVoiceOver() } }

    NotificationCenter.default.addObserver(forName: NSWindow.didBecomeKeyNotification,
                                           object: window, queue: .main) { [weak self] _ in
      self?.refreshBadges()
      // A turn later, and never to make it key (2026-11-07): on 27.2 NSApp.keyWindow is still nil while the window's own
      // didBecomeKey is posted, so every activation logged "no key window" and made the board key from inside the
      // notification — which posted it again, up to twenty deep in one second.
      DispatchQueue.main.async { self?.keysBack("key", makeKey: false) }
    }
    watchFront()

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
  func applicationDidResignActive(_ note: Notification) { fillTick?.invalidate(); fillTick = nil; edgeSince = nil; topSince = nil; awaySince = nil; lightsUp("the app in the back"); toBoard("window.peixFront?.(false)", completionHandler: nil) }
  func applicationDidBecomeActive(_ note: Notification) {
    if handBack() { return }   // brought forward by no one: in front for a moment, nothing to do there
    toBoard("window.peixFront?.(true)", completionHandler: nil)   // While you were out (2026-11-01, round XIX's M3)
    if fillSaved != nil && fillTick == nil && !window.isMiniaturized { startDockTick() }; tuckMenuBarSoon()   // down in the Dock, it waits for the window (windowDidDeminiaturize)
    if !away.isEmpty { away.removeAll(); showAway() }   // in front again: someone is looking, whatever was missed
    // In front with the keys nowhere (2026-10-28): ⌘-Tab to the board now and then left typing going nowhere, or to the
    // app on the other screen. The window made key, the keys where they were — the next turn of the run loop, once
    // AppKit has given them back itself; the log says when it had not, so the cause can be read off it.
    DispatchQueue.main.async { [weak self] in self?.keysBack("in front") }
  }
  /// The board's window key with a view holding the keys, if the app is in front without: no key window at all (a
  /// panel, the About box or a menu keeps them as they should), or the window itself holding them, which no view hears.
  /// `makeKey` false when the window has just become key itself.
  func keysBack(_ why: String, makeKey: Bool = true) {
    guard NSApp.isActive, window.isVisible, !window.isMiniaturized, content?.isHidden != true else { return }
    if makeKey, NSApp.keyWindow == nil, !window.isKeyWindow { logLine("focus: \(why) with no key window — the board made key"); window.makeKeyAndOrderFront(nil) }
    guard window.isKeyWindow, window.firstResponder === window else { return }
    logLine("focus: \(why) with the keys on no view — given to the \(paneFocus != nil ? "page" : "board")")
    window.makeFirstResponder(paneFocus.flatMap { paneViews[$0] } ?? web)
  }
  /// Who comes forward, and the clicks that land outside the app (2026-11-07), for handBack. A click elsewhere is heard
  /// by a global monitor, which mouse events need no grant for (key events would).
  func watchFront() {
    NSWorkspace.shared.notificationCenter.addObserver(forName: NSWorkspace.didActivateApplicationNotification, object: nil,
                                                      queue: .main) { [weak self] note in
      guard let self, let app = note.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication else { return }
      if app.processIdentifier == getpid() { DispatchQueue.main.async { self.handBack() } }
      else if app.activationPolicy == .regular { self.cameForward = (app, Date().timeIntervalSinceReferenceDate) }
    }
    NSEvent.addGlobalMonitorForEvents(matching: [.leftMouseDown, .rightMouseDown, .otherMouseDown]) { [weak self] _ in
      self?.clickedOut = Date().timeIntervalSinceReferenceDate
    }
  }
  /// The front given back to the app a click on another screen gave it (2026-11-07). Filled on one screen of two, a
  /// click on another app's window on the other one brought that app forward, and a tenth of a second later the board was
  /// in front again — no code of the board's asks for it: on macOS 27 the menu bars' own process (MenuBarAgent, its
  /// `SetMenuBars` in the window server's log) makes an app front after such a click, one the click was not for, with
  /// the menu bar hidden by an app's custom full screen — a game's the same (docs/DECISIONS.md). So within
  /// handBackWithin of a click outside the app, the app that click brought forward running and the pointer off the
  /// board's window (a click on the board itself is the board's), the board hands the front back, once a click.
  /// One screen never: the pointer is always over the fill there. Logged `focus:`; true when handed back.
  @discardableResult func handBack() -> Bool {
    let now = Date().timeIntervalSinceReferenceDate
    guard fillSaved != nil, NSApp.isActive, let click = clickedOut, click != handedBack, now - click <= AppDelegate.handBackWithin,
          let came = cameForward, came.at >= click - 0.1, !came.app.isTerminated,
          !window.frame.contains(NSEvent.mouseLocation) else { return false }
    handedBack = click
    let ok: Bool
    if #available(macOS 14, *) { ok = came.app.activate(from: .current, options: []) } else { ok = came.app.activate(options: []) }
    logLine("focus: in front \(Int((now - click) * 1000)) ms after a click that brought \(came.app.localizedName ?? "another app") forward, the pointer on another screen — \(ok ? "handed back" : "handing back refused")")
    return ok
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
    toBoard("window.peixAway?.(\(hide))", completionHandler: nil)   // lunch's sign and fish (2026-10-18): a lock at lunch time is lunch
    logLine(hide ? "away: \(away.sorted().joined(separator: ", ")) — the board hidden" : "away: back — the board shown")
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
  var boardShown = false          // the board, not a message, is what the window shows
  var serverDown = false          // the fish floats belly-up, its counts stale (setServerDown)
  var boardPid: Int32 = 0        // its web process, logged once each time it is a new one (`npm run perf -- --app`)

  private func bringUpServer(restart: Bool = false) {
    recovering = true
    let done: (String?) -> Void = { [weak self] problem in
      guard let self else { return }
      self.recovering = false; self.misses = 0
      if let problem { self.showMessage(problem) } else { self.loadBoard() }
    }
    if restart { server.restart(done) } else { server.start(done) }
  }

  /// The fish says it (2026-11-01, S2). ~15 s of silence, the watchdog's own, so a `launchd.sh restart` passes unseen.
  private func setServerDown(_ down: Bool) {
    guard down != serverDown else { return }
    serverDown = down
    logLine("fish: the server \(down ? "gone, belly-up" : "back")")
    NSApp.dockTile.badgeLabel = down ? nil : (needsInput.count + newReplies.count > 0 ? String(needsInput.count + newReplies.count) : nil)
    drawFish(); if !statusMenuOpen { rebuildStatusMenu() }
  }

  private func checkServer() {
    guard !recovering else { return }
    ServerController.probe { [weak self] answer in
      DispatchQueue.main.async {
        guard let self, !self.recovering else { return }
        let ok = answer == .ours
        // A message up while the server answers — ⌘R mid-restart, a boot slower than the wait — went on saying so until
        // a reload by hand (2026-10-03): the board comes back on its own.
        if ok && !self.boardShown { logLine("watchdog: the server answers — the board again"); self.loadBoard() }
        self.misses = ok ? 0 : self.misses + 1
        if ok { self.setServerDown(false); self.portToAgent() }
        guard self.misses >= 3 else { return }   // ~15 s of silence, not one slow answer
        self.setServerDown(true)
        logLine(answer == .stranger ? "watchdog: :\(kPort) answers without the board's proof" : "watchdog: nothing answering on :\(kPort) — starting the server")
        if answer == .silent { self.showMessage("The server stopped — starting it again…") }   // a stranger's: start() says so
        self.bringUpServer()
      }
    }
  }
  /// The port back to the agent (2026-11-25). The app runs its own server when the agent is slow to answer (`start`'s
  /// wait), and the agent that comes up after waits for the port behind it — server.mjs retries a busy one — until the
  /// app quits: ten hours on 2026-10-27, the board the bundle's copy all along, its updates "not a git checkout". Seen
  /// running by launchd on two looks in a row, five seconds apart (not a crash's respawn), the agent gets the port: the
  /// app's own stopped, the agent adopted (`restart`). Once per agent: one that takes no port is not waited on again.
  private var agentSeen: Int32 = 0
  private var agentHanded: Int32 = 0
  private func portToAgent() {
    guard server.ownRunning, ServerController.agentInstalled else { return }
    DispatchQueue.global(qos: .utility).async { [weak self] in
      let pid = ServerController.agentPid()
      DispatchQueue.main.async {
        guard let self else { return }
        let seen = self.agentSeen
        self.agentSeen = pid ?? 0
        guard let pid, pid == seen, pid != self.agentHanded, !self.recovering, self.server.ownRunning else { return }
        self.agentHanded = pid
        logLine("server: the launchd agent (pid \(pid)) waits behind the app's own server — handing the port to it")
        self.bringUpServer(restart: true)
      }
    }
  }
}
