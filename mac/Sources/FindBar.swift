// ⌘F on a page in the pane.
import Cocoa
import WebKit

extension AppDelegate {
  // ---- find in page ------------------------------------------------------------------------------
  // ⌘F over a page in the pane, the one thing a browser does that a native web view does not: WKWebView has
  // `find(_:configuration:)` (the same search Safari's bar drives — it selects and scrolls to the match) but no
  // bar to drive it with. This is that bar: a floating strip over the *top right* of the focused page, Chrome's
  // place for it rather than Safari's, because pushing the page down would mean moving its top constraint. It is
  // placed from the rect the board last gave that page, so it follows ⌘1 / ⌘2 between the two halves.
  // It lives in the window's content view, added after the pane, so a web view made later cannot cover it.
  // The keys are the browser's: ⌘F opens it on whatever was last searched for and selects it, ⏎ / ⇧⏎ and ⌘G /
  // ⇧⌘G step, Esc closes it (the pane stays — that Esc never reaches the page), a miss turns the text red.

  var findOn: Bool { findBar != nil && !findBar.isHidden }

  func buildFindBar() {
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
    findTopC = findBar.topAnchor.constraint(equalTo: paneOverlay.topAnchor, constant: 12)   // the page's rect is in the overlay's terms
    NSLayoutConstraint.activate([findRightC, findTopC])
  }
  /// The bar sits over the top right of the page that has the keys — whichever half that is.
  func layoutFindBar() {
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
  func stepFind(forward: Bool) {
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
}
