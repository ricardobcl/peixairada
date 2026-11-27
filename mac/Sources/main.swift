// peixAIrada.app — a thin native shell around the board.
//
// It owns the Node server (starts it on launch, stops it on quit), shows the UI in a WKWebView, and
// adds the things a web page cannot do on its own: a Dock badge and menu-bar counter for sessions
// waiting on you, and real notifications that come from this app (not from "Script Editor") and open
// the right session when clicked.
//
// The page knows it is in the app (the `hub` message handler) and posts what the shell needs — the chats waiting on you,
// each alert, the pane's places — and takes the shell's word back through window.peix* calls.

import Cocoa

/// `npm run shell` (2026-11-04) builds this file with scripts/shell-probe.swift and -D PEIX_PROBE: the real shell on a
/// throwaway server, driven by a test, out of the way of the app in use. build.sh sets no flag, so the app has none of it.
#if PEIX_PROBE
let kProbeAside = ProcessInfo.processInfo.environment["PEIX_PROBE_SPACE"] == nil   // …but when it is macOS's full screen being tried
#else
let kProbeAside = false
#endif

/// The port: the launchd agent's own (scripts/launchd.sh's PORT), else 7331 (2026-11-06). The environment says it only to a
/// probe build (npm run shell): the app took PEIXAIRADA_PORT and PEIXAIRADA_NODE from whatever launched it, so anything
/// that could `launchctl setenv` pointed the app — and the key it sends, the grants it holds — wherever it liked.
#if PEIX_PROBE
let kPort = ProcessInfo.processInfo.environment["PEIXAIRADA_PORT"].flatMap(Int.init) ?? 7331
#else
let kPort = (NSDictionary(contentsOf: FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/LaunchAgents/net.peixairada.server.plist"))?["EnvironmentVariables"] as? [String: Any])?["PORT"]
  .flatMap { ($0 as? String).flatMap(Int.init) } ?? 7331
#endif
let kURL = URL(string: "http://127.0.0.1:\(kPort)/")!
let kFrameName = "peixairada.main"   // the window's frame in the defaults — off while ⌃⌘F fills the screen
let kFillKey = "peixairada.fill"      // whether the board was full screen (either kind) when it was last up: a relaunch comes back so
let kSpaceKey = "peixairada.space"    // ⌃⌘F is the system's full screen, in a Space of its own, not the fill (2026-10-14, Settings › Look)
let kDarkKey = "peixairada.dark"      // the board's own appearance when it last said one (none: it follows macOS), for the next launch
let kBarKey = "peixairada.titlebar"   // a theme's title bar colour when the page last said one (none: macOS's bar), for the next launch (2026-11-24)
/// "#rrggbb" in sRGB, else nil.
func hexColor(_ s: String?) -> NSColor? {
  guard let s, s.count == 7, s.hasPrefix("#"), let v = UInt32(s.dropFirst(), radix: 16) else { return nil }
  return NSColor(srgbRed: CGFloat(v >> 16 & 255) / 255, green: CGFloat(v >> 8 & 255) / 255, blue: CGFloat(v & 255) / 255, alpha: 1)
}
/// The board's key (2026-10-16): a file beside the server's state, this user's alone, made at the server's first boot.
/// The app's page gets it from a script of the app's own before the page's runs (`giveKey`), and the probe sends it.
let kKeyFile = FileManager.default.homeDirectoryForCurrentUser
  .appendingPathComponent("Library/Application Support/peixAIrada/key")
func boardKey() -> String? {
  guard let s = try? String(contentsOf: kKeyFile, encoding: .utf8) else { return nil }
  let k = s.trimmingCharacters(in: .whitespacesAndNewlines)
  return k.count == 64 && k.allSatisfy(\.isHexDigit) ? k : nil
}
let kLog = FileManager.default.homeDirectoryForCurrentUser
  .appendingPathComponent("Library/Logs/peixairada.log")
let kAppLog = FileManager.default.homeDirectoryForCurrentUser
  .appendingPathComponent("Library/Logs/peixairada-app.log")

/// WebKit reports a navigation that a *newer* one replaced as a failure: NSURLErrorCancelled, -999.
/// It is not one. At launch the "Starting the server…" page is still provisional when a server that is
/// already up (the launchd agent) lets `web.load(kURL)` follow within milliseconds; taking the cancel
/// for "could not reach the server" put that message up instead of the board — and its own load
/// then cancelled the board's. Every navigation-failure callback drops these.
func isCancelled(_ error: Error) -> Bool {
  let e = error as NSError
  return e.domain == NSURLErrorDomain && e.code == NSURLErrorCancelled
}

/// The find bar's highlight *is* the page's selection: this is how it is taken away again.
let kDropSelection = "window.getSelection && window.getSelection().removeAllRanges()"

/// A file opened for appending — every write lands at the end, whoever else writes it (the agent's server and the
/// app's own share peixairada.log) — or nil.
func appendHandle(_ url: URL) -> FileHandle? {
  let fd = open(url.path, O_WRONLY | O_APPEND | O_CREAT, 0o644)
  return fd < 0 ? nil : FileHandle(fileDescriptor: fd, closeOnDealloc: true)
}

/// Append a line to the app log — the only way to see what the shell is doing once it is a bundle. One formatter and
/// one handle, kept open (2026-09-27: a formatter made and the file opened, sought and closed per line, on the main
/// thread, for tens of lines a minute) — on a queue of their own, since the notification center's callbacks come from
/// another thread, and written with the throwing call: a full disk was an Objective-C exception, which ends an app.
let logQueue = DispatchQueue(label: "net.peixairada.log")
let logStamp = ISO8601DateFormatter()
var logHandle: FileHandle?
func logLine(_ s: String) {
  let when = Date()
  logQueue.async {
    if logHandle == nil { logHandle = appendHandle(kAppLog) }
    try? logHandle?.write(contentsOf: Data("\(logStamp.string(from: when)) \(redacted(s))\n".utf8))
  }
}
/// A secret in an address is never written down (2026-11-06): VS Code Web's `tkn=` rode the pane's keys into this log,
/// readable by every process of the user's, dozens of times a day; a key's or a ticket's would have too.
private let secretInURL = try! NSRegularExpression(pattern: "([?&#](?:tkn|key|token|ticket)=)[^&#\\s'\"]+", options: [.caseInsensitive])
func redacted(_ s: String) -> String {
  secretInURL.stringByReplacingMatches(in: s, range: NSRange(s.startIndex..., in: s), withTemplate: "$1…")
}

/// A Swift string as a JavaScript literal — JSON's own escaping, so a quote, a backslash or a line break in a path or
/// an id is the text it was (2026-10-03: three hand-rolled ways before, one of which turned newlines into spaces and one
/// of which let a backslash through).
func jsLit(_ s: String) -> String {
  guard let d = try? JSONSerialization.data(withJSONObject: s, options: .fragmentsAllowed), let lit = String(data: d, encoding: .utf8) else { return "''" }
  return lit
}

/// What the app hands to another app, from anywhere — the board's `external`, a link off the board, the strip's ↗, a page
/// in the pane (2026-11-06): the web, mail, the editors and GitHub Desktop, nothing else. Every one went to NSWorkspace
/// as it came from the board's side — file:, an .app, a .command, x-apple.systempreferences:, ssh: — and the pane had
/// the only list (2026-10-14). `from` names the asker in the log; a refusal is logged and nothing opens. The board's own
/// asks (`board`) are what its page sends, `OUT_OK`'s (2026-11-27, an outside audit's note): an editor only at a file
/// (`<scheme>://file/…`), never an extension's handler (`vscode://<publisher.extension>/…`), and no GitHub Desktop.
let kHandOn: Set<String> = ["http", "https", "mailto", "vscode", "vscode-insiders", "zed", "x-github-client"]
let kEditors: Set<String> = ["vscode", "vscode-insiders", "zed"]
@discardableResult
func handOn(_ url: URL, from: String, board: Bool = false) -> Bool {
  let scheme = url.scheme?.lowercased() ?? ""
  let boardNo = board && (scheme == "x-github-client" || (kEditors.contains(scheme) && url.host?.lowercased() != "file"))
  guard kHandOn.contains(scheme), !boardNo else {
    logLine("open: \(scheme.isEmpty ? "no scheme" : scheme + ":")\(boardNo ? " but at a file" : "") refused — from \(from)"); return false
  }
  NSWorkspace.shared.open(url)
  return true
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.run()
