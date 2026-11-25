// The fill's lights: a title strip that comes down with the menu bar.
import Cocoa

extension AppDelegate {
  // ---- the lights ----------------------------------------------------------------------------------
  // (2026-10-13) Filled, the window is borderless: no title bar, no lights, and the one way out in sight was View's item
  // behind the hidden menu bar. So the lights come down with the menu bar, as the system's full screen shows its title
  // bar: when the menu bar comes out — after its hold at the top edge (menuOut; beside a housing a touch, till 2026-11-01) — a
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
  /// The strip up and the menu bar let go: auto-hidden again, and hidden outright once the system has hidden it with
  /// the pointer below its strip (dockTick). Not tucked (2026-11-01; beside a housing it was, half a second on, and the
  /// log never once found the bar out then): forced, it would pull the bar from under a status item's menu the pointer
  /// went down into, which the run loop does not track.
  func lightsUp(_ why: String) {
    guard lightsOut else { return }
    lightsOut = false
    lightsGroup.hover = false
    if fillSaved != nil { NSApp.presentationOptions = fillOptions() }
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
  func buildLights() {
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
