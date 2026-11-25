// The keys from a page in the pane: Esc, ⌘R, the ⌥⌘ and ⌘ hotkeys forwarded to the board; VS Code Web's keyboard layout.
import Carbon
import Cocoa
import WebKit

extension AppDelegate {
  // Esc with the pane up, from a page in the pane: the board's business (the chat tab comes back and the pane goes) —
  // forwarded as peixKey('Escape') and swallowed (the editor's own Esc is given up for this, by choice). An Esc on the
  // board's own view is not touched (2026-10-14): swallowed too, claude's drawer beside a page never heard it — no
  // interrupt —, nor did a box; the page does hotEscape's itself outside a terminal or a box. With the pane hidden the
  // key is not touched at all (dialogs, the rename box keep it).
  func installEscapeMonitor() {
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
      self.toBoard("window.peixKey && window.peixKey('Escape')", completionHandler: nil)
      return nil
    }
  }
  // ⌥⌘ + one of the board's hotkeys (HOTKEYS in index.html — the same list here, kept by hand): the letters, ↑ ↓ for
  // the chat above or below, ← → for the tab beside, 1 and 2 for the top and bottom halves of a stacked chat column
  // (2026-09-27; by key code, since ⌥ composes a symbol over a digit on a Portuguese layout), W to close the tab the
  // keys are in (2026-09-28 — VS Code Web's own ⌥⌘W, whole word in its find, is given up for it), B to hide the chat
  // list (⌘B until 2026-10-02; VS Code Web's ⌥⌘B, its secondary side bar, is given up for it), Y the themes, L the launcher, D a chat's changes, A the overview and 0 the home (2026-10-10), R the
  // board reloaded (2026-10-13 — VS Code Web's ⌥⌘R, reveal in Finder, has no Finder to reveal in), V the folder in VS Code's
  // own window (2026-10-14), J the chat's timeline (2026-10-17), M lunch's menus (2026-10-18), Z Zé's game (2026-10-30), X Space (2026-11-18; ⌥⌘S until 2026-11-24),
  // I a chat into Top priority or out, S its snooze, U the section alone (2026-11-24, round XXX — VS Code Web's ⌥⌘S, Save
  // All, is given up for it; its ⌘S saves) and ⌥⌘⇧↑↓ a card's place in it — tiled, ⌥⌘⇧←→↑↓ the tile's (2026-11-25);
  // and ⌘ + one of the
  // layout keys (CMDKEYS there): 0, 1 and 2 for the halves of the chat column, and T a new tab (2026-10-13 — VS Code Web's
  // ⌘T, a symbol in the workspace, is given up for it; ⌘W is the Window menu's), D and ⇧D a tile cut side by side or one
  // over the other (2026-11-25, iTerm's; VS Code Web's ⌘D, the next match, and ⇧⌘D, Run and Debug, given up). Pressed while the pane has the keyboard: its web views are not the board's, so the page
  // would never hear it. Forwarded through peixKey as the page's e.code and which map it belongs to; the page asks
  // for the keyboard back ({type: "focus"}) only when it opens a dialog, or a page's address is edited (2026-10-27).
  static let boardKeys: Set<String> = ["t", "e", "v", "g", "c", "w", "o", "p", "k", "f", "n", "b", "y", "l", "d", "a", "r", "j", "m", "z", "x", "i", "s", "u"]
  static let cmdKeys: Set<String> = ["0", "1", "2", "t", "d"]
  static let cmdShiftKeys: Set<String> = ["d"]
  static let ctrlShiftKeys: Set<String> = ["t"]   // ⌃⌘⇧T, a zsh on a tab where the keys are (2026-11-25)
  // Tile new terminals' keys (2026-11-25) — ⌘D, ⇧⌘D, ⌥⌘⇧←→ — only while the page says the setting is on (`tiles`):
  // off, VS Code Web keeps them.
  static var tileKeys = false
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
    if held == [.command, .option, .shift] {   // Top priority's place (2026-11-24), a tile's (2026-11-25): the page's SHIFTKEYS
      if e.keyCode == 126 { return ("ArrowUp", "shift") }
      if e.keyCode == 125 { return ("ArrowDown", "shift") }
      if tileKeys, e.keyCode == 123 { return ("ArrowLeft", "shift") }
      if tileKeys, e.keyCode == 124 { return ("ArrowRight", "shift") }
    }
    if held == [.command, .control] {   // a strip's tabs (2026-11-25): the page's CTRLKEYS
      if e.keyCode == 123 { return ("ArrowLeft", "ctrlcmd") }
      if e.keyCode == 124 { return ("ArrowRight", "ctrlcmd") }
    }
    if held == [.command, .control, .shift], let ch = ch, ctrlShiftKeys.contains(ch) { return ("Key" + ch.uppercased(), "ctrlshift") }   // the page's CTRLSHIFTKEYS
    if held == [.command, .shift], tileKeys, let ch = ch, cmdShiftKeys.contains(ch) { return ("Key" + ch.uppercased(), "cmdshift") }   // the page's CMDSHIFTKEYS
    if held == [.command], let ch = ch, cmdKeys.contains(ch), ch != "d" || tileKeys { return ((ch.first!.isNumber ? "Digit" : "Key") + ch.uppercased(), "cmd") }
    return nil
  }
  // A click on a page in the pane takes the keys to its half (2026-09-28): the board hears a click on its own halves,
  // but a page is a native view over them, so ⌘W, ⌥⌘W and the half's rule went on naming the half the keys were in
  // before. The page answers with a `pane` message, as for any change of half; the click goes on to the page.
  func installPaneClickMonitor() {
    NSEvent.addLocalMonitorForEvents(matching: [.leftMouseDown, .leftMouseUp, .keyDown]) { [weak self] e in
      guard let self = self, e.window === self.window, !self.paneOverlay.isHidden else { return e }
      if e.type == .keyDown {
        if let fr = self.window.firstResponder as? NSView, let v = self.paneViews.values.first(where: { fr.isDescendant(of: $0) }) { self.gestureAt[ObjectIdentifier(v)] = Date() }
        return e
      }
      let key = self.paneShownKeys.first { k in
        guard let v = self.paneViews[k], !v.isHidden else { return false }
        return v.bounds.contains(v.convert(e.locationInWindow, from: nil))
      }
      if let key, let v = self.paneViews[key] { self.gestureAt[ObjectIdentifier(v)] = Date() }
      guard e.type == .leftMouseDown else { return e }
      if let key = key {   // always (2026-10-14): the board's half is its own to compare, a click on the half it has already moves nothing
        self.toBoard("window.peixPaneFocus && window.peixPaneFocus(\(jsLit(key)))", completionHandler: nil)
      }
      return e
    }
  }
  func installHotkeyForwarder() {
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
      self.toBoard("window.peixKey && window.peixKey('\(hot.code)', '\(hot.mods)')", completionHandler: nil)
      return nil
    }
  }
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
