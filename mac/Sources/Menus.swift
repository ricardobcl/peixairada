// The menu bar's menus and their actions.
import Cocoa
import WebKit

extension AppDelegate {
  func buildMenu() {
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
  /// ⌘W: the board's business first — the half of the chat column the keys are in, or a picker that is up — and
  /// the window only when it says it took neither (2026-09-22).
  /// It is the menu item: a key equivalent is dispatched before any responder's keyDown — to the key window's views
  /// first, though, and the menu after them (2026-10-14, measured): a web view with the keys hands ⌘W to its page, and
  /// the menu hears only what the page left alone — a GitHub page's ⌘W, the board's when it had nothing to close
  /// (2026-10-14: its CMDKEYS prevent only a ⌘W they took), never VS Code Web's.
  @objc func closeHalfOrWindow(_ sender: Any?) {
    // another window in front (the About panel): it is the one ⌘W closes, not a half of the board
    guard NSApp.keyWindow == nil || NSApp.keyWindow === window else { NSApp.keyWindow?.performClose(sender); return }
    toBoard("window.peixKey ? !!window.peixKey('KeyW', 'cmd') : false") { [weak self] v, _ in
      guard let self, (v as? Bool) != true else { return }
      if self.fillSaved != nil { self.toggleFill(nil) }   // borderless, the window has no close button for performClose to press
      self.window.performClose(nil)
    }
  }
  /// ⌘, — the board's settings dialog (2026-09-28: they left the list's cog for the chat header's ···). A menu item's
  /// key equivalent comes before any responder, so it asks the page itself, as ⌘W does.
  @objc func openSettings(_ sender: Any?) {
    toBoard("window.peixKey && window.peixKey('Comma', 'cmd')", completionHandler: nil)
  }
}
