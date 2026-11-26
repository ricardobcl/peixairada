// The bridge: the shell's word to the board's page (toBoard), and the page's messages to the shell (the hub).
import Cocoa
import WebKit
import UserNotifications

extension AppDelegate {
  /// The board's own page: the server's origin (2026-11-06).
  static func isBoard(_ u: URL?) -> Bool { u?.scheme == "http" && u?.host == "127.0.0.1" && u?.port == kPort }
  /// Every word the shell says to the board's page — a reply's text, a dropped path, the folder chosen, a page's address —
  /// goes only to the board (2026-11-06): its view kept off every other origin (decidePolicyFor), and not said to whatever
  /// else it shows (a message, a page between two loads). Unsaid, `done` hears nothing, as from a page without the call.
  func toBoard(_ js: String, completionHandler done: ((Any?, Error?) -> Void)? = nil) {
    guard let web, AppDelegate.isBoard(web.url) else { done?(nil, nil); return }
    web.evaluateJavaScript(js, completionHandler: done)
  }

  // ---- bridge ----------------------------------------------------------------------------------

  func userContentController(_ ucc: WKUserContentController, didReceive message: WKScriptMessage) {
    // The board's page, its main frame, and no one else: the bridge opens any URL in the system (`external`).
    let origin = message.frameInfo.securityOrigin
    guard message.frameInfo.isMainFrame, origin.host == "127.0.0.1", origin.port == kPort,
          let body = message.body as? [String: Any], let type = body["type"] as? String else { return }
    switch type {
    case "state":   // the chats waiting on you, posted by the page when that changes (48k `state:` log lines before, one per burst)
      let asked = Set(needsInput.map { $0["id"] ?? "" })
      let brief: ([String: Any]) -> [String: String] = {
        ["id": $0["id"] as? String ?? "", "project": $0["project"] as? String ?? "", "title": $0["title"] as? String ?? "", "since": $0["since"] as? String ?? ""]
      }
      needsInput = (body["needs"] as? [[String: Any]] ?? []).map(brief)
      newReplies = (body["replied"] as? [[String: Any]] ?? []).map(brief)
      let mutes = Set(body["mutes"] as? [String] ?? [])
      let newlyMuted = mutes.subtracting(mutedChats)
      mutedChats = mutes
      if useUN, !newlyMuted.isEmpty {   // a snooze would ring in spite of it: it is the system's timer, and the alert's quiet never reaches it
        let ids = newlyMuted.flatMap { [$0, $0 + "-later"] }
        UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: ids)
        UNUserNotificationCenter.current().removeDeliveredNotifications(withIdentifiers: ids)
      }
      refreshBadges()
      // A chat that starts asking while the app is in the back bounces the Dock icon once (2026-09-27, night): a
      // question is the stopped state, and the badge only counts. AppKit ignores the request while the app is active,
      // and takes it back when the app comes to the front.
      if !NSApp.isActive, needsInput.contains(where: { !asked.contains($0["id"] ?? "") }) { NSApp.requestUserAttention(.informationalRequest) }
    case "alert":
      let focused = window.isKeyWindow && NSApp.isActive
      // Quiet: notifications are off (the board's cog). The Dock still counts it; no banner.
      let quiet = body["quiet"] as? Bool ?? false
      logLine("alert: kind=\(body["kind"] as? String ?? "?") project=\(body["project"] as? String ?? "?") focused=\(focused) serverNotify=\(body["serverNotify"] as? Bool ?? false) quiet=\(quiet) useUN=\(useUN)")
      // If the user is running a server that already posts its own notifications, don't double up.
      let serverNotifies = body["serverNotify"] as? Bool ?? false
      if !focused && !serverNotifies && !quiet {
        notify(kind: body["kind"] as? String ?? "reply",
               heading: body["heading"] as? String ?? "",
               project: body["project"] as? String ?? "",
               title: body["title"] as? String ?? "",
               snippet: body["snippet"] as? String ?? "",
               sessionId: body["sessionId"] as? String ?? "",
               drawer: body["drawer"] as? Bool ?? false,
               hash: body["hash"] as? String ?? "")
      }
    case "pane":
      let places: [PanePlace] = (body["panes"] as? [[String: Any]] ?? []).compactMap { r in
        guard let key = r["key"] as? String else { return nil }
        let d = { (n: String) in CGFloat((r[n] as? Double) ?? 0) * self.zoom }
        return PanePlace(key: key, rect: CGRect(x: d("left"), y: d("top"), width: d("width"), height: d("height")))
      }
      setPane(chat: body["id"] as? String, keys: body["keys"] as? [String] ?? [], places: places, focus: body["focus"] as? String)
    case "nav":
      paneNav(body["what"] as? String ?? "", key: body["key"] as? String, url: body["url"] as? String)
    case "fullscreen":   // Settings › Look's full screen (2026-10-14): the fill, or the system's in a Space of its own
      setSpaceMode(body["space"] as? Bool ?? false)
    case "details":   // About's Copy details (2026-11-04)
      tellDetails()
    case "key":   // the lock's *Read the key again*, a new key made on the board (2026-10-16)
      logLine("key: read again\(boardKey() == nil ? " — there is no key file" : "")")
      loadBoard(reload: true)
    case "tiles":   // Settings › Terminal › Auto-tiling (2026-11-25): whether the forwarder takes its keys
      AppDelegate.tileKeys = body["on"] as? Bool ?? false
    case "zoom":   // the settings' text size (2026-10-12)
      let z = CGFloat(min(2, max(0.5, body["value"] as? Double ?? 1)))
      if z != zoom { zoom = z; web.pageZoom = z; logLine("zoom: \(z)"); tellFill(); tellPane() }
    case "chat":   // the open chat (2026-09-27, night): the window is named after it, and its folder is the represented file
      let title = body["title"] as? String ?? "", project = body["project"] as? String ?? "", cwd = body["cwd"] as? String ?? ""
      window.title = title.isEmpty ? "peixAIrada" : (project.isEmpty ? title : "\(project) · \(title)")
      if lightsOut { lightsTitle.stringValue = window.title }
      window.representedURL = cwd.isEmpty ? nil : URL(fileURLWithPath: cwd, isDirectory: true)   // the proxy icon, and ⌘-click on the title for the path
    case "focus":
      window.makeFirstResponder(web)
    case "appearance":   // the board's dark or light, whatever macOS shows (2026-10-12); null while its theme follows macOS
      let dark = body["dark"] as? Bool
      window.appearance = dark.flatMap { NSAppearance(named: $0 ? .darkAqua : .aqua) }
      if let dark { UserDefaults.standard.set(dark, forKey: kDarkKey) } else { UserDefaults.standard.removeObject(forKey: kDarkKey) }
      logLine("appearance: \(dark.map { $0 ? "dark" : "light" } ?? "macOS's")")
    case "titlebar":   // a theme's title bar in its frame (2026-11-16, Flashbang): the bar clear over that ground; null, macOS's own
      let hex = body["color"] as? String
      barColor = hexColor(hex)
      if barColor != nil { UserDefaults.standard.set(hex, forKey: kBarKey) } else { UserDefaults.standard.removeObject(forKey: kBarKey) }
      wearBar()
      logLine("titlebar: \(hex ?? "macOS's")")
    case "haptic":   // a bump on the trackpad (2026-10-11): a divider at a stop, a tab dropped, a run of days crossed
      let pattern: NSHapticFeedbackManager.FeedbackPattern = switch body["kind"] as? String {
        case "levelChange": .levelChange
        case "generic": .generic
        default: .alignment
      }
      NSHapticFeedbackManager.defaultPerformer.perform(pattern, performanceTime: .now)
    case "external":
      if let s = body["url"] as? String, let url = URL(string: s) { handOn(url, from: "the board") }
    case "chooseFolder":   // the first run's Choose… (2026-10-01): the system's folder panel, its path back to the page
      let panel = NSOpenPanel()
      panel.canChooseDirectories = true; panel.canChooseFiles = false; panel.allowsMultipleSelection = false
      panel.canCreateDirectories = true
      panel.prompt = "Use This Folder"; panel.message = "The folder your git checkouts sit in"
      let dir = ((body["dir"] as? String ?? "") as NSString).expandingTildeInPath   // a regex template took a $ or \\ in the home's path for its own
      if !dir.isEmpty { panel.directoryURL = URL(fileURLWithPath: dir, isDirectory: true) }
      panel.beginSheetModal(for: window) { [weak self] r in
        let path = r == .OK ? panel.url?.path : nil
        self?.toBoard("window.peixFolder && window.peixFolder(\(path.map(jsLit) ?? "null"))", completionHandler: nil)
      }
    default: break
    }
  }
}
