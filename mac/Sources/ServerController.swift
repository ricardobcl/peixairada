// The board's server: adopted when one answers, the launchd agent's when it is installed, else the bundled one.
import Cocoa
import CryptoKit

// ---------------------------------------------------------------------------------------------
// Server lifecycle
// ---------------------------------------------------------------------------------------------

final class ServerController {
  private var process: Process?
  private(set) var adopted = false      // true when a server was already running and we just attached
  /// The launchd agent's plist (scripts/launchd.sh): when it is there, the server answering is the agent's, and a
  /// restart is launchd's to do — the app never had a process to stop, and ⇧⌘R restarted nothing (2026-10-03).
  static let agentLabel = "net.peixairada.server"
  static var agentInstalled: Bool {
    FileManager.default.fileExists(atPath: FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/LaunchAgents/\(agentLabel).plist").path)
  }

  /// The node that runs the server ships inside the bundle: build.sh copies the one that ran
  /// `npm install`, so node-pty's native addon matches it. Finding a node on the machine from a
  /// GUI app was the fragile part of this whole thing — bare launchd PATH, mise activating only in
  /// interactive shells, shell-integration escapes in the shell's output — and is gone with it.
  /// `PEIXAIRADA_NODE` overrides it in a probe build only (2026-11-06, see kPort).
  static func nodePath() -> String? {
    #if PEIX_PROBE
    if let override = ProcessInfo.processInfo.environment["PEIXAIRADA_NODE"], isExec(override) { return override }
    #endif
    if let bundled = Bundle.main.url(forResource: "node", withExtension: nil)?.path, isExec(bundled) { return bundled }
    return nil
  }

  private static func isExec(_ path: String) -> Bool {
    FileManager.default.isExecutableFile(atPath: path)
  }

  /// The app's own server is up — spawned here, not adopted.
  var ownRunning: Bool { process?.isRunning == true }
  /// The agent's process as launchd has it (2026-11-25): `launchctl print`'s `pid = N`, nil while it runs nothing (not
  /// loaded, between two runs). It waits on launchctl: off the main thread.
  static func agentPid() -> Int32? {
    let p = Process(), out = Pipe()
    p.executableURL = URL(fileURLWithPath: "/bin/launchctl")
    p.arguments = ["print", "gui/\(getuid())/\(agentLabel)"]
    p.standardOutput = out
    p.standardError = FileHandle.nullDevice
    do { try p.run() } catch { return nil }
    let data = out.fileHandleForReading.readDataToEndOfFile()
    p.waitUntilExit()
    guard p.terminationStatus == 0 else { return nil }
    for line in String(decoding: data, as: UTF8.self).split(separator: "\n") {
      let t = line.trimmingCharacters(in: .whitespaces)
      if t.hasPrefix("pid = "), let pid = Int32(t.dropFirst(6)) { return pid }
    }
    return nil
  }

  /// What answers on the port: the board, nothing, or something that could not prove it is the board.
  enum Answer { case ours, silent, stranger }
  /// The server proves itself before anything is trusted to it (2026-11-06): the probe sends a fresh nonce and no key, and
  /// only an answer carrying the HMAC of it under the key file's key is the board (`aliveProof` in server.mjs). Whatever
  /// answered on the port was adopted before, sent the key on every probe, and its page got the key and the bridge —
  /// another account or a container holding 7331 while the server was down had them. No key file yet (a first boot):
  /// nothing can be proved, so nothing is up until the server has written it. Never cached: a 204 may be.
  static func probe(_ completion: @escaping (Answer) -> Void) {
    guard let key = boardKey() else { return completion(.silent) }
    let nonce = (0..<16).map { _ in String(format: "%02x", UInt8.random(in: 0...255)) }.joined()
    var req = URLRequest(url: kURL.appendingPathComponent("api/alive"), cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 1.2)
    req.setValue(nonce, forHTTPHeaderField: "X-Peix-Nonce")
    URLSession.shared.dataTask(with: req) { _, resp, _ in
      guard let r = resp as? HTTPURLResponse else { return completion(.silent) }
      let want = HMAC<SHA256>.authenticationCode(for: Data("peix-alive:\(nonce)".utf8), using: SymmetricKey(data: Data(key.utf8))).map { String(format: "%02x", $0) }.joined()
      completion(r.statusCode == 204 && r.value(forHTTPHeaderField: "X-Peix-Proof") == want ? .ours : .stranger)
    }.resume()
  }
  /// Whether the board answers: proved (probe). The smallest answer the server has (2026-09-27: every session summarized,
  /// 584 KB, twelve times a minute from the watchdog, before).
  static func isServing(_ completion: @escaping (Bool) -> Void) { probe { completion($0 == .ours) } }
  static let strangerText = """
    Something answers on port \(kPort) that is not your board: it could not prove it holds this Mac's board key, so it \
    gets neither the key nor this window. If it is your own server from before 2026-11-06, restart it \
    (scripts/launchd.sh restart). The app keeps looking.
    """

  /// Calls back with nil on success, or a message to show the user. On the main thread throughout: `process` and
  /// `adopted` are read and written by stop() and restart() there, and the probe answers on URLSession's own queue.
  func start(_ done: @escaping (String?) -> Void) {
    ServerController.probe { [weak self] answer in DispatchQueue.main.async {
      guard let self else { return }
      if answer == .ours {                // a server is already up (launchd, or a terminal) — use it
        self.adopted = true
        done(nil)
        return
      }
      // the port held by what is not the board: neither adopted nor raced — the agent, or the next start, takes it back
      // once it is let go (the server waits on a busy port)
      if answer == .stranger, self.process?.isRunning != true {
        logLine("server: :\(kPort) answers without the board's proof — not adopted, and given nothing")
        return done(ServerController.strangerText)
      }
      // One of its own at a time (2026-10-03): a start while the last one was still coming up — ⇧⌘R twice, the
      // watchdog during a slow boot — spawned another and dropped the first, which then outlived the app.
      if let p = self.process, p.isRunning { self.waitUntilUp(attempts: 40, done); return }
      // The agent installed: launchd keeps it alive and is the one to start it — a server of the app's own beside it
      // only waited on the port (a probe that timed out while the agent booted was enough to spawn one).
      if ServerController.agentInstalled {
        logLine("server: nothing answering yet — the launchd agent is installed, so waiting for it")
        self.adopted = true
        // …and given up on, the app's own server takes its place (2026-10-14): a plist there says nothing of an agent
        // unloaded, crashing or run from a checkout that is gone, and the watchdog only ever waited on it again
        self.waitUntilUp(attempts: 80, done) { [weak self] in
          logLine("server: the launchd agent did not answer (launchctl print gui/\(getuid())/\(ServerController.agentLabel) says why) — starting the app's own")
          self?.adopted = false
          self?.spawn(done)
        }
        return
      }
      self.spawn(done)
    } }
  }

  /// The bundled server, the app's own.
  private func spawn(_ done: @escaping (String?) -> Void) {
    guard let node = ServerController.nodePath() else {
      done("""
      This app bundle has no node binary. Rebuild it with mac/build.sh (it copies the node that
      ran npm install), or start the server yourself (scripts/launchd.sh install, or `npm start`)
      and reopen this app.
      """)
      return
    }
    guard let script = Bundle.main.url(forResource: "server", withExtension: "mjs") else {
      done("server.mjs is missing from the app bundle.")
      return
    }
    let p = Process()
    p.executableURL = URL(fileURLWithPath: node)
    p.arguments = [script.path]
    p.currentDirectoryURL = script.deletingLastPathComponent()
    // what the app was launched with, but what would load code into the server (2026-11-06): a DYLD_ library or a
    // NODE_OPTIONS --require set for every app by `launchctl setenv` ran inside the server, with the key
    var env = ProcessInfo.processInfo.environment.filter { !$0.key.hasPrefix("DYLD_") && $0.key != "NODE_OPTIONS" }
    env["PORT"] = String(kPort)
    env["NOTIFY"] = "off"               // this app posts the notifications instead
    p.environment = env
    // appended, like the app's own log: createFile on an existing path truncated it, and Restart Server from the
    // menu wiped the run being looked into (2026-09-27)
    if !FileManager.default.fileExists(atPath: kLog.path) {
      FileManager.default.createFile(atPath: kLog.path, contents: nil)
    }
    if let h = appendHandle(kLog) { p.standardOutput = h; p.standardError = h }   // appended, beside the agent's lines
    p.terminationHandler = { [weak self] ended in DispatchQueue.main.async { if self?.process === ended { self?.process = nil } } }
    do { try p.run() } catch {
      done("Could not start the server: \(error.localizedDescription)")
      return
    }
    self.process = p
    self.waitUntilUp(attempts: 40, done)
  }

  /// `orElse`, when given, is what follows a wait given up on, in place of the failure.
  private func waitUntilUp(attempts: Int, _ done: @escaping (String?) -> Void, orElse: (() -> Void)? = nil) {
    guard attempts > 0 else {
      if let orElse { return DispatchQueue.main.async(execute: orElse) }
      // given up on, it is ended: it would otherwise come up later beside the next one, or hold the port for good
      DispatchQueue.main.async { self.stop(); done("The server did not come up. See \(kLog.path)") }
      return
    }
    ServerController.isServing { ok in
      // what answers is not ours when ours has ended (the port was taken — the agent came up meanwhile): adopted
      if ok { DispatchQueue.main.async { if self.process?.isRunning != true { self.adopted = true }; done(nil) } }
      else { DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) { self.waitUntilUp(attempts: attempts - 1, done, orElse: orElse) } }
    }
  }

  func stop() {
    process?.terminate()
    process = nil
  }

  /// Only once the port has fallen silent: a start right after the terminate found the server still answering while
  /// it shut down, adopted it, and the watchdog reported it gone fifteen seconds later (2026-09-27).
  func restart(_ done: @escaping (String?) -> Void) {
    if adopted && process == nil && ServerController.agentInstalled {
      let k = Process()
      k.executableURL = URL(fileURLWithPath: "/bin/launchctl")
      k.arguments = ["kickstart", "-k", "gui/\(getuid())/\(ServerController.agentLabel)"]
      // its word read (2026-10-14): an agent launchd does not have — the plist there, never loaded or booted out — has
      // nothing restarted, and the start that follows waits on it, then runs the app's own
      k.terminationHandler = { [weak self] k in DispatchQueue.main.async {
        guard let self else { return }
        logLine("server: launchctl kickstart -k \(ServerController.agentLabel) — \(k.terminationStatus == 0 ? "restarted" : "failed, exit \(k.terminationStatus)")")
        if k.terminationStatus == 0 { self.waitUntilDown(attempts: 20) { self.start(done) } } else { self.start(done) }
      } }
      do { try k.run() } catch { return done("Could not restart the agent: \(error.localizedDescription)") }
      return
    }
    stop()
    adopted = false
    waitUntilDown(attempts: 20) { self.start(done) }
  }

  private func waitUntilDown(attempts: Int, _ then: @escaping () -> Void) {
    ServerController.isServing { ok in
      DispatchQueue.main.async {
        if !ok || attempts <= 1 { then() }
        else { DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) { self.waitUntilDown(attempts: attempts - 1, then) } }
      }
    }
  }
}
