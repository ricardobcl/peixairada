// The board's web view: its load and key, a message in its place, where it may go; Finder drops (BoardWebView).
import Cocoa
import WebKit

extension AppDelegate {
  func showMessage(_ text: String) {
    boardShown = false
    let esc = text.replacingOccurrences(of: "&", with: "&amp;").replacingOccurrences(of: "<", with: "&lt;")
    web.loadHTMLString("""
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <style>html{color-scheme:light dark}body{margin:0;height:100vh;display:grid;place-items:center;
    font:14px -apple-system,BlinkMacSystemFont,sans-serif;background:#f6f6f4;color:#1c1c1a}
    @media (prefers-color-scheme:dark){body{background:#141413;color:#e8e6df}}
    div{max-width:32em;text-align:center;line-height:1.5}b{display:block;font-size:15px;margin-bottom:6px}</style>
    <div><b>peixAIrada</b>\(esc)</div>
    """, baseURL: nil)
  }
  /// The board loaded, or reloaded where it is, with its key given first (2026-10-16).
  func loadBoard(reload: Bool = false) {
    giveKey()
    if reload { web.reload() } else { web.load(URLRequest(url: kURL)) }
  }
  /// The file's key on the board's view, as `window.PEIX_KEY` before the page's script — on the board's own origin only —,
  /// put there again when the file's has changed (a first boot, a new key). The board's view has no other user script.
  private func giveKey() {
    let key = boardKey()
    guard key != keyGiven else { return }
    keyGiven = key
    let ucc = web.configuration.userContentController
    ucc.removeAllUserScripts()
    guard let key else { logLine("key: none at \(kKeyFile.path) — the board asks for it"); return }
    let origin = String(kURL.absoluteString.dropLast())
    ucc.addUserScript(WKUserScript(source: "if (location.origin === '\(origin)') window.PEIX_KEY = '\(key)';", injectionTime: .atDocumentStart, forMainFrameOnly: true))
  }

  // ---- navigation ---------------------------------------------------------------------------------

  /// Keep the app on the board; anything external (PR links, docs) opens in the real browser — a dev server on another
  /// port of this Mac included: only the board's own origin stays in its view, where the bridge is (2026-10-03). Every
  /// other way there is refused too (2026-11-06): a redirect, a script's `location`, a form, a frame — the board has none —
  /// took its view to another origin, which got no key and no bridge but every word the shell went on saying to the
  /// page there. The messages (`showMessage`) are about:blank pages of the shell's own.
  func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
               decisionHandler: @escaping @MainActor @Sendable (WKNavigationActionPolicy) -> Void) {
    guard let url = action.request.url else { return decisionHandler(.allow) }
    // Every page the board's view loads from the board's origin is proved first (2026-11-06): the key's script and the
    // bridge are that origin's, and the port may have changed hands since the last probe — a reload, an update's, the
    // page's own. A move inside the page (its #hash) is no new page; a frame is none of the board's.
    if AppDelegate.isBoard(url) {
      let sans = { (u: URL) in u.absoluteString.split(separator: "#", maxSplits: 1).first.map(String.init) ?? "" }
      if action.targetFrame?.isMainFrame == false || (action.navigationType != .reload && url.fragment != nil
          && webView.url.map { AppDelegate.isBoard($0) && sans($0) == sans(url) } == true) { return decisionHandler(.allow) }
      ServerController.probe { [weak self] answer in DispatchQueue.main.async {
        guard answer != .ours else { return decisionHandler(.allow) }
        decisionHandler(.cancel)
        logLine(answer == .stranger ? "board: :\(kPort) answers without the board's proof — its page not loaded" : "board: nothing answering on :\(kPort) — the board not loaded")
        self?.showMessage(answer == .stranger ? ServerController.strangerText : "The server is not answering on port \(kPort) — the board comes back once it does.")
      } }
      return
    }
    if url.absoluteString == "about:blank" && action.targetFrame?.isMainFrame != false { return decisionHandler(.allow) }
    if action.navigationType == .linkActivated { handOn(url, from: "a link on the board") }
    else { logLine("board: a navigation to \(url.scheme ?? "?")://\(url.host ?? "") refused — the board's view shows the board") }
    decisionHandler(.cancel)
  }

  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
    if webView.url?.port == kPort {
      boardShown = true
      // which web process draws the board, for `npm run perf -- --app` (2026-10-13): the app's others are the pane's
      if let pid = (webView.value(forKey: "_webProcessIdentifier") as? NSNumber)?.int32Value, pid > 0, pid != boardPid {
        boardPid = pid; logLine("board: web process \(pid)")
      }
    }
    fillSaid = nil; tellFill()   // a reload forgets the fill
    tellVoiceOver()
  }
  /// The page hears whether VoiceOver runs (2026-10-16, `peixVoiceOver`): the drawer reads its lines out while it does —
  /// the terminal's screen-reader mode, a switch in Settings › Terminal before, which a page alone cannot know to turn on.
  /// Sent when the board has loaded and on every change.
  func tellVoiceOver() {
    toBoard("window.peixVoiceOver && window.peixVoiceOver(\(NSWorkspace.shared.isVoiceOverEnabled))", completionHandler: nil)
  }
  /// The board's web process gone (killed under memory pressure, crashed): WebKit leaves the view blank and reloads
  /// nothing, and the watchdog only asks the server.
  func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
    logLine("board: its web process ended — loading it again")
    boardShown = false
    loadBoard()
  }
  func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
    if isCancelled(error) { return }
    showMessage("Could not load the board: \(error.localizedDescription)")
  }
  func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
    if isCancelled(error) { return }
    showMessage("Could not reach the server on port \(kPort): \(error.localizedDescription)")
  }
}

/// The board's web view, with Finder drops taken before WebKit sees them. A web page only ever gets a
/// dropped file's bytes; the shell gets its path from the pasteboard — and a path is what claude wants.
/// A drag without file URLs (the page's own row drags, text) goes to WebKit untouched, and a drag this
/// view takes is kept from WebKit at every step, so it never hears of a session it did not start.
final class BoardWebView: WKWebView {
  var onFiles: (([String]) -> Void)?
  var onDragging: ((Bool) -> Void)?
  private var mine = false
  private func filePaths(_ info: NSDraggingInfo) -> [String] {
    let pb = info.draggingPasteboard
    guard pb.types?.contains(.fileURL) == true,
          let urls = pb.readObjects(forClasses: [NSURL.self], options: [.urlReadingFileURLsOnly: true]) as? [URL] else { return [] }
    return urls.map { $0.path }
  }
  override func draggingEntered(_ sender: NSDraggingInfo) -> NSDragOperation {
    mine = !filePaths(sender).isEmpty
    if mine { onDragging?(true); return .copy }
    return super.draggingEntered(sender)
  }
  override func draggingUpdated(_ sender: NSDraggingInfo) -> NSDragOperation { mine ? .copy : super.draggingUpdated(sender) }
  override func draggingExited(_ sender: NSDraggingInfo?) {
    if mine { mine = false; onDragging?(false) } else { super.draggingExited(sender) }
  }
  override func prepareForDragOperation(_ sender: NSDraggingInfo) -> Bool { mine ? true : super.prepareForDragOperation(sender) }
  override func performDragOperation(_ sender: NSDraggingInfo) -> Bool {
    guard mine else { return super.performDragOperation(sender) }
    onDragging?(false)
    let paths = filePaths(sender)
    if !paths.isEmpty { onFiles?(paths) }
    return true
  }
  override func concludeDragOperation(_ sender: NSDraggingInfo?) { if !mine { super.concludeDragOperation(sender) } }
  override func draggingEnded(_ sender: NSDraggingInfo) { if mine { mine = false } else { super.draggingEnded(sender) } }
}
