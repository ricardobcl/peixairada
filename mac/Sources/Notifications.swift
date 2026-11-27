// The system's notifications: an alert posted, and answered where it shows.
import Cocoa
import UserNotifications

extension AppDelegate {
  // ---- notifications ----------------------------------------------------------------------------

  func setUpNotifications() {
    guard Bundle.main.bundleIdentifier != nil else { return }
    let center = UNUserNotificationCenter.current()
    center.delegate = self
    // What an alert can be answered with where it shows (2026-10-12): a reply — written into the chat's Claude when its
    // drawer runs here —, done (the card's ✓), or later (the same alert again in 15 minutes). A question is opened, or
    // put off; a ✓ is not offered on it, since a tick ends the chat's processes and a question is Claude waiting. Any of
    // them can mute the chat that sent it (2026-11-02).
    // Later on a reply, a PR's turn or a chat back is the chat snoozed for an hour (2026-11-24, round XXX's S3, `peixSnooze`):
    // its card leaves the list and comes back with a banner of its own. A question's stays the banner again in 15 minutes:
    // a question wakes a snooze.
    let later = UNNotificationAction(identifier: "snooze", title: "In 15 minutes", options: [])
    let hour = UNNotificationAction(identifier: "snooze-hour", title: "In an hour", options: [])
    // What acts on a chat asks for the Mac unlocked first (2026-11-06): Reply… types into its claude and presses ⏎, Done
    // ends its processes, Mute quiets it — none of them anybody's at a locked screen. The snooze changes nothing.
    let done = UNNotificationAction(identifier: "done", title: "Done", options: [.authenticationRequired])
    let mute = UNNotificationAction(identifier: "mute", title: "Mute this chat", options: [.authenticationRequired])
    let reply = UNTextInputNotificationAction(identifier: "reply", title: "Reply…", options: [.authenticationRequired], textInputButtonTitle: "Send", textInputPlaceholder: "to Claude, in its drawer")
    center.setNotificationCategories([
      UNNotificationCategory(identifier: "reply-drawer", actions: [reply, done, hour, mute], intentIdentifiers: [], options: []),
      UNNotificationCategory(identifier: "reply", actions: [done, hour, mute], intentIdentifiers: [], options: []),
      UNNotificationCategory(identifier: "later", actions: [later, mute], intentIdentifiers: [], options: []),
      UNNotificationCategory(identifier: "hour", actions: [hour, mute], intentIdentifiers: [], options: []),
      // lunch time (2026-10-18): the menus (the board in front, ⌥⌘M's chalkboard), Going, or the reminder again in 15
      // minutes — the server's In 15 min, so every page's sign agrees, and its alert comes back by itself
      UNNotificationCategory(identifier: "lunch", actions: [
        UNNotificationAction(identifier: "lunch-menus", title: "Menus", options: [.foreground]),
        UNNotificationAction(identifier: "lunch-going", title: "Going", options: []),
        UNNotificationAction(identifier: "lunch-snooze", title: "In 15 minutes", options: []),
      ], intentIdentifiers: [], options: []),
    ])
    center.getNotificationSettings { settings in
      logLine("notifications: current authorization = \(settings.authorizationStatus.rawValue)")
    }
    center.requestAuthorization(options: [.alert, .sound]) { [weak self] granted, error in
      DispatchQueue.main.async {
        self?.useUN = granted && error == nil
        logLine("notifications: granted=\(granted) error=\(error?.localizedDescription ?? "none") → useUN=\(granted && error == nil)")
      }
    }
  }

  /// `heading` is the server's own when it has one (a PR come round to you: "Your move · repo#n"), else the kind's.
  /// `hash` is where a click lands when it is not the chat alone — a PR's alert, its timeline on that PR (2026-10-17).
  /// `at` is the alert's time: a reply from its banner is for that turn alone (2026-11-27, `peixReply`).
  func notify(kind: String, heading given: String, project: String, title: String, snippet: String, sessionId: String, drawer: Bool = false, hash: String = "", at: String = "") {
    let heading = !given.isEmpty ? given : (kind == "reply" ? "Claude replied" : "Claude is asking you") + (project.isEmpty ? "" : " · \(project)")
    let body = [title, snippet].filter { !$0.isEmpty }.joined(separator: "\n")
    guard useUN else {
      logLine("notify: falling back to osascript (useUN=false)")
      return notifyViaAppleScript(heading, title, snippet)
    }
    let content = UNMutableNotificationContent()
    content.title = heading
    content.body = body
    content.sound = .default
    content.userInfo = ["sessionId": sessionId, "hash": hash, "kind": kind, "at": at]
    // a reply the page refused (`unsent`, 2026-11-27) takes the banner's place, with nothing to answer it with
    content.categoryIdentifier = kind == "lunch" ? "lunch" : sessionId.isEmpty || kind == "unsent" ? "" : kind == "reply" || kind == "back" ? (drawer ? "reply-drawer" : "reply") : kind == "needs-input" ? "later" : "hour"
    let req = UNNotificationRequest(identifier: kind == "lunch" ? "lunch" : sessionId.isEmpty ? UUID().uuidString : sessionId,
                                    content: content, trigger: nil)
    UNUserNotificationCenter.current().add(req) { [weak self] err in
      logLine("notify: UN add \(err.map { "failed: \($0.localizedDescription)" } ?? "ok")")
      if err != nil { DispatchQueue.main.async { self?.notifyViaAppleScript(heading, title, snippet) } }
    }
  }

  /// Fallback when notification authorization is unavailable (unsigned build, permission denied).
  private func notifyViaAppleScript(_ heading: String, _ subtitle: String, _ body: String) {
    let p = Process()
    p.executableURL = URL(fileURLWithPath: "/usr/bin/osascript")
    // its words after `--` (2026-11-27), as the server's own: a heading that starts with a dash is no option to osascript
    p.arguments = ["-e", "on run argv",
                   "-e", "display notification (item 3 of argv) with title (item 1 of argv) subtitle (item 2 of argv) sound name \"Glass\"",
                   "-e", "end run", "--", heading, subtitle, body]
    try? p.run()
  }

  func userNotificationCenter(_ center: UNUserNotificationCenter,
                              didReceive response: UNNotificationResponse,
                              withCompletionHandler completionHandler: @escaping () -> Void) {
    let id = response.notification.request.content.userInfo["sessionId"] as? String ?? ""
    let hash = response.notification.request.content.userInfo["hash"] as? String ?? ""
    let kind = response.notification.request.content.userInfo["kind"] as? String ?? ""
    let at = response.notification.request.content.userInfo["at"] as? String ?? ""
    switch response.actionIdentifier {
    case "lunch-going", "lunch-snooze":
      logLine("notify: lunch \(response.actionIdentifier)")
      toBoard("window.peixLunch?.(\(jsLit(response.actionIdentifier == "lunch-going" ? "going" : "snooze")))", completionHandler: nil)
    case "lunch-menus":
      showWindow(nil); toBoard("window.peixLunch?.('menus')", completionHandler: nil)
    case _ where kind == "lunch":   // the banner itself: the menus
      showWindow(nil); toBoard("window.peixLunch?.('menus')", completionHandler: nil)
    case "reply" where !id.isEmpty:   // into the chat's Claude, by the page (peixReply): the drawer's socket is the page's to speak
      let text = (response as? UNTextInputNotificationResponse)?.userText ?? ""
      logLine("notify: reply to \(id.prefix(8)) (\(text.count) chars)")
      if !text.isEmpty { toBoard("window.peixReply?.(\(jsLit(id)), \(jsLit(text)), \(jsLit(at)))", completionHandler: nil) }
    case "done" where !id.isEmpty:
      logLine("notify: done \(id.prefix(8))")
      toBoard("window.peixDone?.(\(jsLit(id)))", completionHandler: nil)
    case "mute" where !id.isEmpty:
      logLine("notify: mute \(id.prefix(8))")
      toBoard("window.peixMute?.(\(jsLit(id)))", completionHandler: nil)
    case "snooze-hour" where !id.isEmpty:   // the chat snoozed an hour, by the page (2026-11-24): the server wakes it, with its own banner
      logLine("notify: snooze \(id.prefix(8)) an hour")
      toBoard("window.peixSnooze?.(\(jsLit(id)))", completionHandler: nil)
    case "snooze":
      let again = UNNotificationRequest(identifier: (id.isEmpty ? UUID().uuidString : id) + "-later", content: response.notification.request.content,
                                        trigger: UNTimeIntervalNotificationTrigger(timeInterval: 15 * 60, repeats: false))
      UNUserNotificationCenter.current().add(again) { err in logLine("notify: later \(err.map { "failed: \($0.localizedDescription)" } ?? "in 15 min")") }
    default:
      if !id.isEmpty { open(sessionId: id, hash: hash) } else { showWindow(nil) }
    }
    completionHandler()
  }

  func userNotificationCenter(_ center: UNUserNotificationCenter,
                              willPresent notification: UNNotification,
                              withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
    completionHandler([.banner, .sound])
  }
}
