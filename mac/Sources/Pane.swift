// The pane: a web view per page over the chat column, where the board puts it.
import Cocoa
import WebKit

extension AppDelegate {
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

  func buildPaneOverlay() {
    paneOverlay = PaneOverlay()
    paneOverlay.wantsLayer = true
    paneOverlay.layer?.backgroundColor = NSColor.clear.cgColor
    paneDelegate.open = { [weak self] w, url in self?.paneOpen(w, url) }
    paneDelegate.linkOut = { [weak self] url, done in self?.paneLinkOut(url, done) ?? done(false) }
    paneDelegate.gestured = { [weak self] w in self?.gestureAt[ObjectIdentifier(w)].map { Date().timeIntervalSince($0) < 1 } ?? false }
  }
  /// A page's new window, for the board to put on a tab beside it (2026-10-21) — or, the board saying no (a view not
  /// the open chat's), loaded where it came from, as before.
  private func paneOpen(_ w: WKWebView, _ url: URL) {
    guard let key = paneViews.first(where: { $0.value === w })?.key else { w.load(URLRequest(url: url)); return }
    toBoard("window.peixPaneOpen ? !!window.peixPaneOpen(\(jsLit(key)), \(jsLit(url.absoluteString))) : false") { [weak w] v, _ in
      let taken = (v as? Bool) == true
      logLine("pane: a new window from \(key) — \(url.host ?? "?") \(taken ? "on a tab of its own" : "loaded where it was asked")")
      if !taken { w?.load(URLRequest(url: url)) }
    }
  }
  /// Whether a link out of a page goes to the browser (2026-10-21): the board's rule (`peixLinkOut`, its Links setting).
  /// No board to ask, or no answer: the page keeps it, as before.
  private func paneLinkOut(_ url: URL, _ done: @escaping (Bool) -> Void) {
    toBoard("window.peixLinkOut ? !!window.peixLinkOut(\(jsLit(url.absoluteString))) : false") { v, _ in done((v as? Bool) == true) }
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
      if let v = paneViews[old] { gestureAt[ObjectIdentifier(v)] = nil }
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
      // a pane's page is a web page (2026-11-06): the board names its keys, and a key's URL is loaded as it is named
      guard ["http", "https"].contains(url.scheme?.lowercased() ?? "") else { logLine("pane: \(url.scheme ?? "no scheme"): not loaded — a pane shows web pages"); continue }
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
    toBoard("window.peixPane && window.peixPane(\(paneOverlay.isHidden ? "false" : "true"), \(Int(left)))", completionHandler: nil)
  }
  /// Where a page is now, for the strip to show and copy — with the key it belongs to, since the board may have
  /// moved on to another tab by the time a load finishes. Sent on every pane message too: a board reload forgets it.
  func tellPaneUrl(_ key: String, _ url: String?) {
    guard let url = url, !url.isEmpty else { return }
    toBoard("window.peixPaneUrl && window.peixPaneUrl(\(jsLit(key)), \(jsLit(url)))", completionHandler: nil)
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
    toBoard("window.peixPaneClose && window.peixPaneClose(\(jsLit(key)))", completionHandler: nil)
  }
  /// ‹ › ↻ ↗ from the strip, for the page on top — or for the page `key` names: its address edited in the strip
  /// (2026-10-27), `go` loads what was typed in that view, its history kept, and `keys` hands the page the keys back.
  func paneNav(_ what: String, key: String? = nil, url: String? = nil) {
    guard let w = (key ?? paneTarget).flatMap({ paneViews[$0] }) else { return }
    switch what {
    case "back": w.goBack()
    case "forward": w.goForward()
    case "reload": w.reload()
    case "external": if let u = w.url { handOn(u, from: "the strip's ↗") }   // a data: or blob: page has nowhere to go
    case "go":
      guard let u = url.flatMap({ URL(string: $0) }), ["http", "https"].contains(u.scheme?.lowercased() ?? "") else { return }
      w.load(URLRequest(url: u)); if !w.isHidden { window.makeFirstResponder(w) }
    case "keys": if !w.isHidden { window.makeFirstResponder(w) }
    default: break
    }
  }
}

/// The pane's own delegate: it navigates *inside* the pane (the board's delegate would send every
/// non-local link to the system browser), keeps GitHub's target=_blank links in the pane — a web
/// view with no UI delegate silently drops those — and hands non-web schemes (mailto:, vscode:) out.
final class PaneDelegate: NSObject, WKNavigationDelegate, WKUIDelegate {
  var open: ((WKWebView, URL) -> Void)?   // a new window's web page, to the board (AppDelegate.paneOpen)
  var linkOut: ((URL, @escaping (Bool) -> Void) -> Void)?   // whether a link out goes to the browser, the board's word (AppDelegate.paneLinkOut)
  var gestured: ((WKWebView) -> Bool)?   // a press or a key of the user's in that view within the second (AppDelegate.gestureAt)
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
  /// web's is cancelled: every one went to NSWorkspace, file: included, with no click at all. A script's click() is a
  /// link clicked to WebKit, so the click must be the user's (2026-11-06): a press or a key in that view a moment before.
  static let outSchemes = kHandOn.subtracting(["http", "https"])
  func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
               decisionHandler: @escaping @MainActor @Sendable (WKNavigationActionPolicy) -> Void) {
    if let url = action.request.url, let scheme = url.scheme?.lowercased(), !["http", "https", "about", "blob", "data"].contains(scheme) {
      let clicked = action.navigationType == .linkActivated && action.sourceFrame.isMainFrame, yours = gestured?(webView) ?? false
      if clicked && yours && PaneDelegate.outSchemes.contains(scheme) { handOn(url, from: "a page in the pane") }
      else { logLine("pane: \(scheme): not opened, from \(webView.url?.host ?? "?") — \(!clicked ? "no link clicked in the page" : !yours ? "no click or key of yours there" : "not a scheme handed on")") }
      return decisionHandler(.cancel)
    }
    // A link to another site clicked in a page (2026-10-21): the board says whether it goes to the browser — Settings ›
    // General › Links, *in the browser* but for the sites it keeps. The page's own site, a script, a redirect, a frame:
    // here, as ever. A new window's link is the board's already (open, above).
    if let url = action.request.url, let ask = linkOut, action.navigationType == .linkActivated, action.targetFrame?.isMainFrame == true,
       url.host?.lowercased() != webView.url?.host?.lowercased(), gestured?(webView) ?? false {   // a script's: here, as a redirect
      return ask(url) { out in
        if out { logLine("pane: a link to \(url.host ?? "?") — to the browser"); handOn(url, from: "a page in the pane") }
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

/// A page on show and the rect the board gave it, in the board view's CSS px (points here).
struct PanePlace { let key: String; let rect: CGRect }
