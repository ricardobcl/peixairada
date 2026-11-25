// The board's window: built, the page's top under its title bar, a theme's bar, About's details.
import Cocoa
import WebKit

extension AppDelegate {
  // ---- UI ------------------------------------------------------------------------------------

  func buildWindow() {
    let cfg = WKWebViewConfiguration()
    let ucc = WKUserContentController()
    ucc.add(self, name: "hub")   // the page sees the handler and posts its state, its alerts and the pane's places
    cfg.userContentController = ucc
    web = BoardWebView(frame: NSRect(x: 0, y: 0, width: 1440, height: 900), configuration: cfg)
    web.navigationDelegate = self
    web.uiDelegate = self   // an <input type=file> on the board opens the system's panel (2026-11-25: the chat's pictures)
    // No flash before the page paints (2026-09-27, night): a WKWebView draws white until the document's CSS lands —
    // in dark mode a flash of the wrong colour at every launch and reload. The view draws no ground of its own and
    // the window's is the page's --frame for the appearance in force (its --bg until 2026-11-01, when the board's own
    // themes laid the chat in a frame), so what shows first is what the page will show; underPageBackgroundColor is the
    // same colour for the moments WebKit paints its own ground (an overscroll).
    ground = NSColor(name: nil) { $0.bestMatch(from: [.aqua, .darkAqua]) == .darkAqua
      ? NSColor(srgbRed: 0x28 / 255, green: 0x28 / 255, blue: 0x25 / 255, alpha: 1)
      : NSColor(srgbRed: 0xde / 255, green: 0xdc / 255, blue: 0xd6 / 255, alpha: 1) }
    web.setValue(false, forKey: "drawsBackground")
    // A file dragged in from the Finder: the page gets its path (a browser page never could) and hands
    // it to the chat as an @-mention; while it hovers, the page marks the chat pane.
    web.onDragging = { [weak self] on in self?.toBoard("window.peixDragging && window.peixDragging(\(on))") }
    // A drop brings the board forward with the keys in it (2026-10-28): macOS activates no app a drop lands on, so a
    // screenshot's thumbnail dragged in from another screen left that screen's app with the keys, and what was typed
    // after the @-mention went there. The page puts the keys in the drawer the path went to (attachPaths).
    web.onFiles = { [weak self] paths in
      guard let self = self, let data = try? JSONSerialization.data(withJSONObject: paths), let json = String(data: data, encoding: .utf8) else { return }
      let was = NSApp.isActive
      self.window.makeKeyAndOrderFront(nil)
      if #available(macOS 14, *) { NSApp.activate() } else { NSApp.activate(ignoringOtherApps: true) }
      if self.window.firstResponder !== self.web { self.window.makeFirstResponder(self.web) }
      self.toBoard("window.peixDrop && window.peixDrop(\(json))")
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
    // The board's appearance is its own (2026-10-12): it says which (`appearance`), and the window wears it — the
    // ground above, the pane's pages, the find bar. As it was last said until the page says again.
    if let dark = UserDefaults.standard.object(forKey: kDarkKey) as? Bool { window.appearance = NSAppearance(named: dark ? .darkAqua : .aqua) }
    // What shows until the page paints, and behind a web view that draws none (above): `ground`, or the theme's bar as the
    // page last said it (2026-11-24), so a theme with one opens on it rather than turning it once the page has run. A bar
    // is a light frame's (applySkin), so not in a dark launch: macOS gone dark under Auto opens on the dark ground.
    let light = window.effectiveAppearance.bestMatch(from: [.aqua, .darkAqua]) == .aqua
    barColor = light ? hexColor(UserDefaults.standard.string(forKey: kBarKey)) : nil
    wearBar()
    lookObs = window.observe(\.effectiveAppearance) { [weak self] _, _ in self?.wearBar() }
    // The board and the pane start under the title bar (paneTop; the window's top in the fill and macOS's full screen);
    // the pane is a transparent overlay over the whole board, and each page's web view is placed inside it where the
    // page says — one half of the chat column, or both, below their tab strips. An
    // overlay, not a split: the board's columns never reflow under it, and it lets clicks that miss a page through.
    buildPaneOverlay()
    content = NSView(frame: NSRect(x: 0, y: 0, width: 1440, height: 900))
    web.translatesAutoresizingMaskIntoConstraints = false
    paneOverlay.translatesAutoresizingMaskIntoConstraints = false
    content.addSubview(web); content.addSubview(paneOverlay)
    paneTopC = paneOverlay.topAnchor.constraint(equalTo: content.topAnchor)
    webTopC = web.topAnchor.constraint(equalTo: content.topAnchor)
    NSLayoutConstraint.activate([
      web.leadingAnchor.constraint(equalTo: content.leadingAnchor), web.trailingAnchor.constraint(equalTo: content.trailingAnchor),
      webTopC, web.bottomAnchor.constraint(equalTo: content.bottomAnchor),
      paneOverlay.leadingAnchor.constraint(equalTo: content.leadingAnchor), paneTopC,
      paneOverlay.trailingAnchor.constraint(equalTo: content.trailingAnchor), paneOverlay.bottomAnchor.constraint(equalTo: content.bottomAnchor)
    ])
    buildFindBar()
    buildLights()
    paneOverlay.isHidden = true
    window.contentView = content
    // In a window WebKit insets the page by the title bar on its own, from contentLayoutRect, so the page's y = 0 is below
    // the bar while the overlay's was above it (2026-11-04): every page sat that much too high, over its half's strip,
    // and short of the half's foot. The fill and macOS's full screen have no inset, so the overlay goes by the same word
    // — and the board too, under the bar itself since 2026-11-16 (paneTop), so WebKit insets nothing.
    paneTopObs = window.observe(\.contentLayoutRect, options: [.initial]) { [weak self] w, _ in self?.paneTop(w) }
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
  /// What a report wants of the window (2026-11-04; the page's detailsText): its shape and where the pages' views really
  /// are, in the window's terms, from its top; never a page's address. Their places hold while a dialog has them hidden.
  func tellDetails() {
    let h = window.frame.height
    var d: [String: Any] = [
      "macos": ProcessInfo.processInfo.operatingSystemVersionString,
      "app": Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "",
      "mode": fillSaved != nil ? "fill" : window.styleMask.contains(.fullScreen) ? "full" : "window",
      "w": window.frame.width, "h": h, "inset": paneTopC.constant, "zoom": zoom, "screens": NSScreen.screens.count,
      "views": paneKeys.compactMap { paneViews[$0] }.map { v -> [CGFloat] in let r = v.convert(v.bounds, to: nil); return [r.minX, h - r.maxY, r.width, r.height] },
    ]
    if let s = window.screen { d["screen"] = [s.frame.width, s.frame.height, s.backingScaleFactor]; d["housing"] = s.safeAreaInsets.top > 0 }
    guard let data = try? JSONSerialization.data(withJSONObject: d), let json = String(data: data, encoding: .utf8) else { return }
    toBoard("window.peixDetails?.(\(json))", completionHandler: nil)
  }
  /// The overlay's top where WebKit puts the page's: under what the title bar takes of the window (2026-11-04). By the
  /// rect's height, never its origin: AppKit says an origin a window's height off while it lays the bar out, and an
  /// inset past the window's height makes the constraints grow the window.
  private func paneTop(_ w: NSWindow) {
    let inset = max(0, w.frame.height - w.contentLayoutRect.height)
    // The board itself starts under the bar (2026-11-16), so WebKit insets nothing: a clear bar (a theme's) is no inset to
    // it, and the board ran under the lights and took the window's drags — and a theme turning the bar moves nothing.
    webTopC.constant = inset
    guard paneTopC.constant != inset else { return }
    paneTopC.constant = inset
    logLine("pane: the page starts \(inset) pt down the window")
  }
  /// A theme's title bar (2026-11-16, Flashbang): clear over its colour, the window's ground; none, macOS's own bar over
  /// `ground`. Opaque in macOS's full screen (2026-11-24): there the bar slides down over the head row, and a clear one
  /// left the lights and the title over its controls with nothing behind them. `full` while AppKit is between the two.
  func wearBar(full: Bool? = nil) {
    window.titlebarAppearsTransparent = barColor != nil && !(full ?? window.styleMask.contains(.fullScreen))
    window.backgroundColor = barColor ?? ground
    // WebKit's own ground, the strip under the bar included: it takes a colour as it resolves when set, under macOS's
    // appearance, so `ground` is resolved under the window's here, and again on every change of it (lookObs; 2026-11-24).
    window.effectiveAppearance.performAsCurrentDrawingAppearance {
      web.underPageBackgroundColor = window.backgroundColor.usingColorSpace(.sRGB) ?? window.backgroundColor
    }
  }
}

/// The board's window. Borderless — ⌃⌘F's fill — a bare NSWindow refuses the keys, and its frame would be pulled back
/// under the menu bar: while `fill` is on, the frame is left exactly where it was put, the whole screen.
final class BoardWindow: NSWindow {
  var fill = false
  override var canBecomeKey: Bool { true }
  override var canBecomeMain: Bool { true }
  override func constrainFrameRect(_ frameRect: NSRect, to screen: NSScreen?) -> NSRect {
    fill || kProbeAside ? frameRect : super.constrainFrameRect(frameRect, to: screen)
  }
}
