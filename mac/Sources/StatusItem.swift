// The fish in the menu bar, its menu and the key that opens it from anywhere; the Dock's badge.
import Carbon
import Cocoa

extension AppDelegate {
  func buildStatusItem() {
    statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
    statusItem.button?.imagePosition = .imageLeading
    statusMenu.delegate = self; statusMenu.autoenablesItems = false
    statusItem.menu = statusMenu
    drawFish()
    rebuildStatusMenu()
  }

  // The fish's menu from anywhere (2026-11-01, round XIX's M2). Probed on 27.2: popUp opens it where it is told, with the
  // menu bar hidden and with the app behind, no activation and no Space changed; the button's performClick opens it off the
  // top of the screen once the bar is hidden, so never that. Under the housing, a fixed place you learn. A Carbon hot key
  // needs no permission dialog. The same key again, the menu open, closes it.
  private static let macKeyCode: [String: UInt32] = ["KeyA": 0, "KeyS": 1, "KeyD": 2, "KeyF": 3, "KeyH": 4, "KeyG": 5, "KeyZ": 6, "KeyX": 7, "KeyC": 8, "KeyV": 9, "KeyB": 11, "KeyQ": 12, "KeyW": 13, "KeyE": 14, "KeyR": 15, "KeyY": 16, "KeyT": 17, "Digit1": 18, "Digit2": 19, "Digit3": 20, "Digit4": 21, "Digit6": 22, "Digit5": 23, "Equal": 24, "Digit9": 25, "Digit7": 26, "Minus": 27, "Digit8": 28, "Digit0": 29, "BracketRight": 30, "KeyO": 31, "KeyU": 32, "BracketLeft": 33, "KeyI": 34, "KeyP": 35, "Enter": 36, "KeyL": 37, "KeyJ": 38, "Quote": 39, "KeyK": 40, "Semicolon": 41, "Backslash": 42, "Comma": 43, "Slash": 44, "KeyN": 45, "KeyM": 46, "Period": 47, "Tab": 48, "Space": 49, "Backquote": 50, "F1": 122, "F2": 120, "F3": 99, "F4": 118, "F5": 96, "F6": 97, "F7": 98, "F8": 100, "F9": 101, "F10": 109, "F11": 103, "F12": 111, "F13": 105, "F14": 107, "F15": 113, "F16": 106, "F17": 64, "F18": 79, "F19": 80, "F20": 90]
  func setSummonKey(code: String, mods: [String]) {
    if let ref = summonRef { UnregisterEventHotKey(ref); summonRef = nil }
    guard !code.isEmpty else { logLine("summon: no key"); return }
    guard let key = Self.macKeyCode[code] else { logLine("summon: no key code for \(code)"); return }
    if !summonInstalled {
      summonInstalled = true
      var spec = EventTypeSpec(eventClass: OSType(kEventClassKeyboard), eventKind: OSType(kEventHotKeyPressed))
      InstallEventHandler(GetApplicationEventTarget(), { _, _, me in
        Unmanaged<AppDelegate>.fromOpaque(me!).takeUnretainedValue().summonMenu(); return noErr
      }, 1, &spec, Unmanaged.passUnretained(self).toOpaque(), nil)
    }
    var carbon: UInt32 = 0
    if mods.contains("cmd") { carbon |= UInt32(cmdKey) }; if mods.contains("alt") { carbon |= UInt32(optionKey) }
    if mods.contains("ctrl") { carbon |= UInt32(controlKey) }; if mods.contains("shift") { carbon |= UInt32(shiftKey) }
    let st = RegisterEventHotKey(key, carbon, EventHotKeyID(signature: OSType(0x50454958), id: 1), GetEventDispatcherTarget(), 0, &summonRef)
    logLine("summon: \(code) \(mods.joined(separator: "+")) status=\(st)")
  }
  fileprivate func summonMenu() {
    if statusMenuOpen { statusMenu.cancelTracking(); return }
    let mouse = NSEvent.mouseLocation
    guard let screen = NSScreen.screens.first(where: { $0.frame.contains(mouse) }) ?? NSScreen.main else { return }
    rebuildStatusMenu()
    let top = max(screen.safeAreaInsets.top, NSApp.mainMenu?.menuBarHeight ?? 0)
    let at = NSPoint(x: screen.frame.midX - statusMenu.size.width / 2, y: screen.frame.maxY - top - 6)
    logLine("summon: opened, app \(NSApp.isActive ? "in front" : "behind")")
    statusMenu.popUp(positioning: nil, at: at, in: nil)
  }

  /// The fish as drawn: the system's, a template. Belly-up it hangs under a line, the water's surface: `fish.fill` has a fin
  /// above and below, so turned over alone it reads as the same fish at this size (rendered and looked at, 2026-11-01).
  private func fishFace(bellyUp: Bool, slashed: Bool) -> NSImage? {
    guard let sym = NSImage(systemSymbolName: "fish.fill", accessibilityDescription: "peixAIrada") else { return nil }
    if slashed && !bellyUp {   // notifications off (S7): a slash with a gap round it, as the system's bell.slash has
      let img = NSImage(size: sym.size, flipped: false) { r in
        sym.draw(in: r)
        let k = r.height / 16, line = NSBezierPath(); line.lineCapStyle = .round
        line.move(to: NSPoint(x: r.minX + r.width * 0.12, y: r.minY + r.height * 0.1)); line.line(to: NSPoint(x: r.maxX - r.width * 0.12, y: r.maxY - r.height * 0.1))
        NSGraphicsContext.current?.compositingOperation = .clear; line.lineWidth = 3.6 * k; line.stroke()
        NSGraphicsContext.current?.compositingOperation = .sourceOver; NSColor.black.set(); line.lineWidth = 1.5 * k; line.stroke()
        return true
      }
      img.isTemplate = true; img.accessibilityDescription = "peixAIrada, notifications off"
      return img
    }
    guard bellyUp else { sym.isTemplate = true; return sym }
    let img = NSImage(size: NSSize(width: 22, height: 17), flipped: false) { r in
      guard let g = NSGraphicsContext.current?.cgContext else { return false }
      NSColor.black.set()
      let water = NSBezierPath(); water.move(to: NSPoint(x: 0.5, y: r.maxY - 1)); water.line(to: NSPoint(x: r.maxX - 0.5, y: r.maxY - 1)); water.lineWidth = 1.2; water.stroke()
      let k = (r.height - 3) / sym.size.height, w = sym.size.width * k
      g.translateBy(x: 0, y: r.height - 2.5); g.scaleBy(x: 1, y: -1)
      sym.draw(in: NSRect(x: r.midX - w / 2, y: 0, width: w, height: r.height - 3))
      return true
    }
    img.isTemplate = true
    img.accessibilityDescription = "peixAIrada, its server gone"
    return img
  }

  func rebuildStatusMenu() {
    let menu = statusMenu
    menu.removeAllItems()
    if !fishingUntil.isEmpty && !serverDown {   // a quiet you chose (M4): it shows, and comes back in one click
      menu.addItem(withTitle: "Gone fishing till \(fishingUntil) · Come Back", action: #selector(fishingFromMenu(_:)), keyEquivalent: "").target = self
      menu.addItem(.separator())
    }
    if muted && !serverDown {   // an inhibit shows, and undoes in one click (S7)
      menu.addItem(withTitle: "Notifications are off · Turn On", action: #selector(notificationsOn(_:)), keyEquivalent: "").target = self
      menu.addItem(.separator())
    }
    if serverDown {   // what can help, first; what the page last said would be stale, so it is not shown (2026-11-01, S2)
      menu.addItem(withTitle: "The server isn't answering", action: nil, keyEquivalent: "").isEnabled = false
      menu.addItem(withTitle: "Restart Server", action: #selector(restartServer(_:)), keyEquivalent: "").target = self
      menu.addItem(withTitle: "Open Server Log", action: #selector(openLog(_:)), keyEquivalent: "").target = self
      menu.addItem(.separator())
      menu.addItem(withTitle: "Show Board", action: #selector(showWindow(_:)), keyEquivalent: "").target = self
      menu.addItem(.separator())
      menu.addItem(withTitle: "Quit peixAIrada", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
      return
    }
    // what wants you, a section each (2026-10-12), in the menu's own clothes (2026-11-01, round XIX's S5): real headers with
    // their counts, the project and how long under each row, a row saying what did not fit, the work you cannot act on
    // folded into submenus, the plan in a line. Asks come longest wait first, as the page sorts them.
    let waited: ([String: String]) -> String = { s in
      guard let since = Double(s["since"] ?? ""), since > 0 else { return "" }
      let m = Int((Date().timeIntervalSince1970 * 1000 - since) / 60_000)
      return m < 1 ? "just now" : m < 60 ? "waited \(m) min" : "waited \(m / 60) h"
    }
    if needsInput.isEmpty && yourMoves.isEmpty && newReplies.isEmpty {
      menu.addItem(withTitle: "Caught up", action: nil, keyEquivalent: "").isEnabled = false
    }
    // Next, first (M1): what ⌥⌘⏎ would do, so the menu answers "what now" before it lists; below, the rest.
    let nextId = nextUp["id"] ?? ""
    if !nextId.isEmpty {
      let waitedSoFar = waited(nextUp), sub = [nextUp["sub"] ?? "", waitedSoFar].filter { !$0.isEmpty }.joined(separator: " · ")
      let item = NSMenuItem(title: nextUp["verb"] ?? "Next", action: #selector(openFromMenu(_:)), keyEquivalent: "\r")
      item.keyEquivalentModifierMask = [.option, .command]; item.target = self; item.representedObject = nextId
      if #available(macOS 14.4, *) { item.subtitle = sub } else { item.title += "  ·  \(sub)" }
      menu.addItem(item); menu.addItem(.separator())
    }
    let sections: [(heading: String, chats: [[String: String]], room: Int, sub: ([String: String]) -> String)] = [
      ("Asking you", needsInput, 12, waited), ("Your move", yourMoves, 6, { $0["why"] ?? "" }), ("New replies", newReplies, 5, { _ in "" })]
    for section in sections where !section.chats.isEmpty {
      menu.addItem(sectionHeading(section.heading, section.chats.count))
      let rows = section.chats.filter { $0["id"] != nextId }
      for s in rows.prefix(section.room) {
        menu.addItem(chatRow(s, sub: section.sub(s)))
        // Hold ⌥ and a reply's row marks it read (2026-11-01, S8): reading is most of what the fish asks of you, and this
        // triages it from where you are. isAlternate reads no event, so 27's empty currentEvent flags do not touch it.
        if section.heading == "New replies" {
          let read = chatRow(s, sub: section.sub(s)); read.title = "✓ Mark read: \(read.title)"
          read.action = #selector(markReadFromMenu(_:)); read.isAlternate = true; read.keyEquivalentModifierMask = [.option]
          menu.addItem(read)
        }
      }
      let more = rows.count - section.room
      if more > 0 {
        let item = NSMenuItem(title: "+\(more) more…", action: #selector(overviewFromMenu(_:)), keyEquivalent: ""); item.target = self
        menu.addItem(item)
      }
    }
    let folded: [(String, [[String: String]])] = [("Clauding", clauding), ("Watching", watching)]
    if !needsInput.isEmpty || !yourMoves.isEmpty || !newReplies.isEmpty, folded.contains(where: { !$0.1.isEmpty }) { menu.addItem(.separator()) }
    for (title, chats) in folded where !chats.isEmpty {
      let item = NSMenuItem(title: title, action: nil, keyEquivalent: "")
      if #available(macOS 14, *) { item.badge = NSMenuItemBadge(count: chats.count) } else { item.title = "\(title) (\(chats.count))" }
      let sub = NSMenu(); for s in chats.prefix(20) { sub.addItem(chatRow(s, sub: "")) }
      item.submenu = sub
      menu.addItem(item)
    }
    if !plan.isEmpty { menu.addItem(withTitle: plan, action: nil, keyEquivalent: "").isEnabled = false }
    menu.addItem(.separator())
    // Each recovery row hides behind one you use, with ⌥ (S8); the server gone, they show plainly (the branch above).
    let alt: (String, Selector) -> NSMenuItem = { title, action in
      let item = NSMenuItem(title: title, action: action, keyEquivalent: ""); item.target = self; item.isAlternate = true; item.keyEquivalentModifierMask = [.option]
      return item
    }
    menu.addItem(withTitle: "Show Board", action: #selector(showWindow(_:)), keyEquivalent: "").target = self
    menu.addItem(alt("Reload Board", #selector(reloadBoard(_:))))
    if fishingUntil.isEmpty { menu.addItem(withTitle: "Go Fishing, 25 min", action: #selector(fishingFromMenu(_:)), keyEquivalent: "").target = self }
    menu.addItem(withTitle: "Settings…", action: #selector(settingsFromMenu(_:)), keyEquivalent: "").target = self
    menu.addItem(alt("Restart Server", #selector(restartServer(_:))))
    // ⌃⌘F's way out where the menu bar shows it (2026-10-13): filled, the View menu is behind the auto-hidden menu bar, and
    // with the board in the back the fill still covers the screen — this menu is then the one control in reach. Its
    // title flips with View's (validateMenuItem).
    let full = menu.addItem(withTitle: isFull ? "Exit Full Screen" : "Enter Full Screen", action: #selector(toggleFull(_:)), keyEquivalent: "f")
    full.keyEquivalentModifierMask = [.control, .command]; full.target = self
    menu.addItem(.separator())
    menu.addItem(withTitle: "Quit peixAIrada", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "")
    menu.addItem(alt("Open Server Log", #selector(openLog(_:))))
  }
  // Drawn as it opens too (menuNeedsUpdate), so "waited 12 min" is right whenever you look, and not while it is open: a
  // menu emptied under the pointer loses its highlight.
  func menuNeedsUpdate(_ m: NSMenu) { if m === statusMenu { rebuildStatusMenu() } }
  func menuWillOpen(_ m: NSMenu) { if m === statusMenu { statusMenuOpen = true } }
  func menuDidClose(_ m: NSMenu) { if m === statusMenu { statusMenuOpen = false } }
  private func sectionHeading(_ title: String, _ count: Int) -> NSMenuItem {
    if #available(macOS 14, *) { return NSMenuItem.sectionHeader(title: "\(title) · \(count)") }
    let item = NSMenuItem(title: "\(title) · \(count)", action: nil, keyEquivalent: ""); item.isEnabled = false
    return item
  }
  /// A chat's row: its title, and under it its project and what `sub` says. Before 14.4, one line. Long titles are clipped:
  /// a menu is as wide as its widest row.
  private func chatRow(_ s: [String: String], sub: String) -> NSMenuItem {
    let clip: (String) -> String = { $0.count > 58 ? String($0.prefix(57)) + "…" : $0 }
    let project = s["project"] ?? "", title = clip(s["title"] ?? ""), below = sub.isEmpty ? project : "\(project) · \(clip(sub))"
    let item = NSMenuItem(title: title, action: #selector(openFromMenu(_:)), keyEquivalent: "")
    if #available(macOS 14.4, *) { item.subtitle = below } else { item.title = "\(below)  ·  \(title)" }
    item.target = self; item.representedObject = s["id"]
    return item
  }

  @objc func notificationsOn(_ sender: Any?) { toBoard("window.peixNotifyOn?.()", completionHandler: nil) }
  @objc func fishingFromMenu(_ sender: Any?) { toBoard("window.peixFishing?.(\(fishingUntil.isEmpty))", completionHandler: nil) }
  @objc func markReadFromMenu(_ sender: NSMenuItem) {
    guard let id = sender.representedObject as? String else { return }
    toBoard("window.peixMarkRead?.(\(jsLit(id)))", completionHandler: nil)
  }
  @objc func settingsFromMenu(_ sender: Any?) { showWindow(nil); toBoard("window.peixKey && window.peixKey('Comma', 'cmd')", completionHandler: nil) }
  @objc func overviewFromMenu(_ sender: Any?) { showWindow(nil); toBoard("window.peixKey && window.peixKey('KeyA', 'altcmd')", completionHandler: nil) }
  @objc func openFromMenu(_ sender: NSMenuItem) {
    guard let id = sender.representedObject as? String else { return }
    open(sessionId: id)
  }

  func open(sessionId: String, hash: String = "") {
    showWindow(nil)
    toBoard("location.hash = \(jsLit(hash.isEmpty ? sessionId : hash))", completionHandler: nil)
  }

  func refreshBadges() {
    guard badged.waiting != needsInput || badged.replies != newReplies || badged.moves != yourMoves || badged.clauding != clauding || badged.watching != watching || badged.plan != plan || badged.muted != muted || badged.next != nextUp || badged.fishing != fishingUntil else { return }   // the status menu was rebuilt per message before (2026-09-27)
    badged = (needsInput, newReplies, yourMoves, clauding, watching, plan, muted, nextUp, fishingUntil)
    let wanting = needsInput.count + newReplies.count
    NSApp.dockTile.badgeLabel = wanting > 0 ? String(wanting) : nil
    drawFish()
    if !statusMenuOpen { rebuildStatusMenu() }
  }

  // The fish in the menu bar says one thing at a glance (2026-11-01, round XIX's S1, its face V1): dim, nothing wants you;
  // full, something does; a number, that many chats are asking. A reply or a PR at your move lights it and adds no number,
  // so a question never drowns in them (replies are three alerts in four, questions under one in a hundred). The Dock
  // keeps the count of what wants you.
  // The server gone, it floats belly-up with no number (S2): those counts are the page's, and a dead board must not look
  // like a quiet one. The watchdog says so, not the page, whose view hides whenever the screen locks.
  func drawFish() {
    guard let b = statusItem.button else { return }
    b.image = fishFace(bellyUp: serverDown, slashed: muted || !fishingUntil.isEmpty)
    if serverDown {
      b.title = ""; b.appearsDisabled = true
      b.toolTip = "peixAIrada: the server isn't answering"; b.setAccessibilityLabel(b.toolTip)
      return
    }
    let asks = needsInput.count, replies = newReplies.count, moves = yourMoves.count
    b.title = asks > 0 ? " \(asks)" : ""
    b.appearsDisabled = asks + replies + moves == 0
    var said = [String]()
    if asks > 0 { said.append("\(asks) asking you") }
    if moves > 0 { said.append("\(moves) at your move") }
    if replies > 0 { said.append("\(replies) new \(replies == 1 ? "reply" : "replies")") }
    if muted { said.append("notifications off") }
    if !fishingUntil.isEmpty { said.append("gone fishing till \(fishingUntil)") }
    b.toolTip = said.isEmpty ? "peixAIrada: nothing wants you" : "peixAIrada: " + said.joined(separator: ", ")
    b.setAccessibilityLabel(b.toolTip)
  }
}
