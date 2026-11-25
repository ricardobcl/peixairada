// The fish in the menu bar and its menu; the Dock's badge.
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

  /// The fish as drawn: the system's, a template. Belly-up it hangs under a line, the water's surface: `fish.fill` has a fin
  /// above and below, so turned over alone it reads as the same fish at this size (rendered and looked at, 2026-11-01).
  private func fishFace(bellyUp: Bool) -> NSImage? {
    guard let sym = NSImage(systemSymbolName: "fish.fill", accessibilityDescription: "peixAIrada") else { return nil }
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

  // The bare minimum (2026-11-25): the chats asking you, longest wait first as the page sorts them, then the board and
  // Quit. The server gone, what can bring it back instead: what the page last said would be stale (2026-11-01, S2).
  func rebuildStatusMenu() {
    let menu = statusMenu
    menu.removeAllItems()
    if serverDown {
      menu.addItem(withTitle: "The server isn't answering", action: nil, keyEquivalent: "").isEnabled = false
      menu.addItem(withTitle: "Restart Server", action: #selector(restartServer(_:)), keyEquivalent: "").target = self
      menu.addItem(withTitle: "Open Server Log", action: #selector(openLog(_:)), keyEquivalent: "").target = self
      menu.addItem(.separator())
    } else if !needsInput.isEmpty {
      menu.addItem(sectionHeading("Asking you", needsInput.count))
      for s in needsInput { menu.addItem(chatRow(s)) }
      menu.addItem(.separator())
    }
    menu.addItem(withTitle: "Show Board", action: #selector(showWindow(_:)), keyEquivalent: "").target = self
    menu.addItem(withTitle: "Quit peixAIrada", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
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
  /// A question's row: the chat's title, and under it its project and how long it has waited. Before 14.4, one line. Long
  /// titles are clipped: a menu is as wide as its widest row.
  private func chatRow(_ s: [String: String]) -> NSMenuItem {
    let title = s["title"] ?? "", project = s["project"] ?? ""
    var waited = ""
    if let since = Double(s["since"] ?? ""), since > 0 {
      let m = Int((Date().timeIntervalSince1970 * 1000 - since) / 60_000)
      waited = m < 1 ? "just now" : m < 60 ? "waited \(m) min" : "waited \(m / 60) h"
    }
    let below = [project, waited].filter { !$0.isEmpty }.joined(separator: " · ")
    let item = NSMenuItem(title: title.count > 58 ? String(title.prefix(57)) + "…" : title, action: #selector(openFromMenu(_:)), keyEquivalent: "")
    if #available(macOS 14.4, *) { item.subtitle = below } else { item.title = "\(below)  ·  \(item.title)" }
    item.target = self; item.representedObject = s["id"]
    return item
  }

  @objc func openFromMenu(_ sender: NSMenuItem) {
    guard let id = sender.representedObject as? String else { return }
    open(sessionId: id)
  }

  func open(sessionId: String, hash: String = "") {
    showWindow(nil)
    toBoard("location.hash = \(jsLit(hash.isEmpty ? sessionId : hash))", completionHandler: nil)
  }

  func refreshBadges() {
    guard badged.waiting != needsInput || badged.replies != newReplies else { return }   // the status menu was rebuilt per message before (2026-09-27)
    badged = (needsInput, newReplies)
    let wanting = needsInput.count + newReplies.count
    NSApp.dockTile.badgeLabel = wanting > 0 ? String(wanting) : nil
    drawFish()
    if !statusMenuOpen { rebuildStatusMenu() }
  }

  // The fish in the menu bar says one thing at a glance (2026-11-01, round XIX's S1, its face V1): dim, nothing wants you;
  // full, something does; a number, that many chats are asking. A reply lights it and adds no number, so a question never
  // drowns in them (replies are three alerts in four, questions under one in a hundred). The Dock keeps the count of what
  // wants you.
  // The server gone, it floats belly-up with no number (S2): those counts are the page's, and a dead board must not look
  // like a quiet one. The watchdog says so, not the page, whose view hides whenever the screen locks.
  func drawFish() {
    guard let b = statusItem.button else { return }
    b.image = fishFace(bellyUp: serverDown)
    if serverDown {
      b.title = ""; b.appearsDisabled = true
      b.toolTip = "peixAIrada: the server isn't answering"; b.setAccessibilityLabel(b.toolTip)
      return
    }
    let asks = needsInput.count, replies = newReplies.count
    b.title = asks > 0 ? " \(asks)" : ""
    b.appearsDisabled = asks + replies == 0
    var said = [String]()
    if asks > 0 { said.append("\(asks) asking you") }
    if replies > 0 { said.append("\(replies) new \(replies == 1 ? "reply" : "replies")") }
    b.toolTip = said.isEmpty ? "peixAIrada: nothing wants you" : "peixAIrada: " + said.joined(separator: ", ")
    b.setAccessibilityLabel(b.toolTip)
  }
}
