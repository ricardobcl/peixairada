// ⌃⌘F: the fill up to the camera housing, or macOS's full screen in a Space of its own.
import Cocoa

extension AppDelegate {
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
  func windowWillEnterFullScreen(_ note: Notification) { window.setFrameAutosaveName(""); wearBar(full: true) }
  func windowDidEnterFullScreen(_ note: Notification) {
    UserDefaults.standard.set(true, forKey: kFillKey)
    logLine("full screen: on, its own Space \(NSStringFromRect(window.frame))")
    tellFill()
  }
  func windowDidFailToEnterFullScreen(_ window: NSWindow) { window.setFrameAutosaveName(kFrameName); wearBar(full: false) }
  func windowDidExitFullScreen(_ note: Notification) {
    window.setFrameAutosaveName(kFrameName)
    wearBar(full: false)
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
  /// whole screen, the menu bar and the Dock hidden, each out only after a hold at its edge (dockTick, placeFill). The
  /// page is told where the housing is (tellFill) and lays its top row around it. No Space of its own —
  /// Mission Control shows a window. The frame's autosave is off meanwhile, so a quit mid-fill does not bring the next
  /// launch up screen-sized; the fill itself is remembered (kFillKey), so it does come back filled. Info.plist says
  /// NSPrefersDisplaySafeAreaCompatibilityMode = false, or a window behind the housing could switch the display into
  /// the shrunken compatibility mode.
  @objc func toggleFill(_ sender: Any?) {
    if let saved = fillSaved {
      fillSaved = nil
      lightsUp("fill off")
      fillTick?.invalidate(); fillTick = nil; dockOut = false; edgeSince = nil; menuOut = false; topSince = nil; elsewhere = false; awaySince = nil
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
  /// The menu bar in the fill (2026-09-28, every screen alike since 2026-11-01): hidden outright while the board is in
  /// front, and let out by a hold at the top edge, as the Dock is at its own (dockTick). Its strip is the head row's — on
  /// a screen without a camera housing the row is right under the top edge, beside one the page lays it into the strip
  /// either side of the housing (tellFill) —, and an auto-hidden menu bar slid over it at every touch of the top edge:
  /// without a housing over the search box and the chat's title ("the menu bar is showing and overlapping the app"),
  /// beside one over the head row's ···, chips and switches, a reach for one that overshot to the edge bringing the bar
  /// and the lights down over it, the click landing on the menu bar. The Dock is hidden too. Run on the fill and on
  /// every change of screen.
  func placeFill(on screen: NSScreen) {
    fillMenuH = max(screen.safeAreaInsets.top, NSApp.mainMenu?.menuBarHeight ?? 0)   // the housing's strip beside one, the main menu's own elsewhere
    if fillMenuH <= 0 { fillMenuH = 24 }
    if kProbeAside { return }   // the fill's style and its word to the page, off the screen in use
    let options = fillOptions()
    if NSApp.presentationOptions != options { NSApp.presentationOptions = options }   // the same again is the Dock's and the menu bar's work for nothing (2026-10-15)
    if window.frame != screen.frame { window.setFrame(screen.frame, display: true) }
  }
  /// The fill's options as things stand: the Dock hidden unless let out; the menu bar hidden outright unless let out
  /// (menuOut), when it is auto-hidden — and auto-hidden whenever the Dock is out, since AppKit refuses hideMenuBar
  /// without hideDock (an exception, not a no-op). With the lights down the menu bar is not hidden at all, so it stays
  /// out over their strip while the pointer goes down to them (lightsDown). With the pointer on another screen, none
  /// (elsewhere): the menu bars and the Dock are every screen's, and that one's are as any window's (pointerCrossed).
  func fillOptions() -> NSApplication.PresentationOptions {
    if elsewhere { return [] }
    let dock: NSApplication.PresentationOptions = dockOut ? .autoHideDock : .hideDock
    if lightsOut { return dock }
    let menu: NSApplication.PresentationOptions = menuOut || dockOut ? .autoHideMenuBar : .hideMenuBar
    return menu.union(dock)
  }
  /// An auto-hidden menu bar has stayed out with the pointer away from it: coming forward across a change of Space — a
  /// swipe, ⌘-Tab to the board on another desktop, a launch — left it out over the head row until the pointer had been
  /// through it (2026-10-03, measured beside a housing, where it was auto-hidden at rest: the system's options
  /// autoHideMenuBar all along and the bar still out 18 s on; back from Mission Control, no Space changed, it went at
  /// once). Hidden outright at rest, it cannot be (2026-11-01); let out by the hold, it is auto-hidden, so half a second
  /// after the app comes forward or the Space changes, the slide over, a bar let out is let go — hidden outright again —
  /// not while the Dock is out (hideMenuBar wants hideDock), nor with the pointer in the strip, reaching for it. The log
  /// says whether it was out.
  func tuckMenuBarSoon() {
    tuck?.cancel()
    let w = DispatchWorkItem { [weak self] in self?.tuckMenuBar() }
    tuck = w
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.5, execute: w)
  }
  func tuckMenuBar() {
    guard fillSaved != nil, menuOut, !dockOut, !lightsOut, NSApp.isActive, !window.isMiniaturized, let screen = window.screen,
          NSEvent.mouseLocation.y < screen.frame.maxY - fillMenuH - 8 else { return }
    let out = NSMenu.menuBarVisible()
    menuOut = false; topSince = nil
    NSApp.presentationOptions = fillOptions()
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
  /// The menu bar the same way (2026-09-28; beside a housing too since 2026-11-01): a hold at the top edge for menuHold
  /// lets it out (auto-hidden, with the pointer already there), and it goes back to hidden outright once the pointer is
  /// below its strip *and* the system has hidden it again — never under an open menu, ours or a status item's. Below the
  /// strip, not 100 pt down as the Dock's (2026-11-01): the head row is in it, and a reach for the row that touched the
  /// top edge on the way brought the bar back over it.
  func dockTick() {
    guard fillSaved != nil, let screen = window.screen else { return }
    let p = NSEvent.mouseLocation, f = screen.frame, now = Date().timeIntervalSinceReferenceDate
    let here = f.insetBy(dx: -2, dy: -2).contains(p)
    if here { awaySince = nil; if elsewhere { pointerCrossed(back: true) } }
    else if let since = awaySince { if !elsewhere, now - since >= AppDelegate.elsewhereAfter { pointerCrossed(back: false) } }
    else { awaySince = now }   // an overshoot past the edge is not a stay
    lightsTick(p, f)
    guard here else { return }   // on another screen
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
    if menuOut {
      if p.y < f.maxY - fillMenuH - 8, !NSMenu.menuBarVisible() { menuOut = false; NSApp.presentationOptions = fillOptions(); logLine("menu bar: back") }
    } else if p.y >= f.maxY - 2 {
      if let since = topSince, now - since >= AppDelegate.menuHold {
        menuOut = true; topSince = nil; NSApp.presentationOptions = fillOptions(); logLine("menu bar: out")
      } else if topSince == nil { topSince = now }
    } else { topSince = nil }
  }
  /// The pointer gone to another screen, or back to the fill's (2026-11-07). The fill's options hide the menu bar and
  /// the Dock on every screen, so a second screen had neither while the board was in front; and a click there, giving
  /// another app the front out of that state, is when macOS brought the board forward again (handBack) — a custom full
  /// screen's state, never a window's. Off the fill's screen the board asks for nothing — its screen shows the menu bar
  /// over the head row meanwhile, as it does with any other app in front —, back on it the fill's options again; what
  /// was let out is put back.
  func pointerCrossed(back: Bool) {
    elsewhere = !back
    dockOut = false; menuOut = false; edgeSince = nil; topSince = nil
    if lightsOut { lightsUp("the pointer left") }
    let options = fillOptions()
    if NSApp.presentationOptions != options { NSApp.presentationOptions = options }
    logLine("fill: the pointer \(back ? "back — the menu bar and the Dock hidden" : "on another screen — the menu bar and the Dock as any window's")")
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
      let left = kProbeAside ? screen.frame.minX : window.frame.minX   // where the fill's frame starts, the probe's window being elsewhere
      notch = "{top: \(screen.safeAreaInsets.top / zoom), left: \((l.maxX - left) / zoom), right: \((r.minX - left) / zoom)}"
    }
    let js = "window.peixFill && window.peixFill(\(fillSaved != nil), \(notch))"
    if js == fillSaid { return }
    fillSaid = js
    toBoard(js, completionHandler: nil)
  }
}
