# peixAIrada — decision log and hand-off

What was decided, why, and what is still open, so the work can be picked up in another session.
Newest at the top of each list. `CLAUDE.md` is the working notes (how things are built, what bit us);
this file is the *why* and the *state*. Last updated 2026-09-20.

## State of the tree (2026-09-20, early morning)

* **`main` is 14 commits ahead of `origin/main`, nothing pushed.** Range `eace89a..217b3f3`, all from the
  2026-09-19/20 session described below. Pushing is a deliberate choice left to Ricardo.
* **The working tree carries a *second* session's uncommitted work** on top of `217b3f3`: `server.mjs`,
  `public/index.html`, `mac/build.sh`, `README.md`, `CLAUDE.md` (≈335 lines). Do not discard or blindly
  commit it; review it. What it contains, from its own CLAUDE.md notes:
  * plan usage — `GET /api/usage` calling `https://api.anthropic.com/api/oauth/usage` with Claude Code's
    OAuth token from the keychain item *Claude Code-credentials* (the second network call in the app,
    `USAGE=off` disables it) — shown in a **settings popover behind a cog** at the bottom of the projects
    strip; the page header is gone with it (the window title bar carries the name);
  * the **chat list folds to a rail** (`sessionsCompact`, `«` in its header); **⌥⌘O** opens a modal
    project picker;
  * **a chat's PRs as rows under the chat header (`#prlist`)** instead of chips in it — note this overlaps
    with the per-card PR chips committed in `0d1eea2`; decide which stays;
  * the working ring recoloured to the **project's colour**, 3 px, with a glow (was amber, 2 px);
  * **Shift+Enter in the drawer** no longer submits (sends `ESC CR`, what Claude Code's own
    `/terminal-setup` binds);
  * `mac/build.sh install` **detaches itself when run from a drawer** inside the app (the install would
    otherwise kill its own shell).
* The installed app (`/Applications/peixAIrada.app`) was built from `217b3f3` plus whatever of the above
  was on disk at the time; rebuild after the review.

## How to resume

```sh
npm install && npm start            # bare server → http://127.0.0.1:7331
mac/build.sh install                # native app into /Applications (from a drawer it detaches itself)
node scripts/verify.mjs --hash <session-id> --shot /tmp/x.png "<js>"   # headless check; URL=… for a test server
PORT=7399 NOTIFY=off STATE_FILE=/tmp/s.json node server.mjs            # throwaway server; stop it BY PORT
lsof -ti tcp:7399 -sTCP:LISTEN | xargs kill                            # never pkill server.mjs (kills the app's)
```

Test chats that exist only because of this work (safe to ignore or tick done): *Reply with ok*
(`580936f0`, `~/acme`), *Day inquiry* (`b5f030fc`), *Basic arithmetic question*, the `~/acme`
"OK" experiment. A VS Code Web server may be left on port 7332 by a killed test; the board adopts it.

## Decisions

### Architecture

* **Keep Node + one HTML file + a Swift shell; no rewrite** (2026-09-19). Go/Rust were considered for a
  "super app". Everything hard here is *reading Claude Code's files and driving a PTY*, which Node does
  well; the Swift shell exists only for what a browser cannot do (second web view for GitHub, menu bar,
  Dock badge, notifications). A rewrite would have re-done the transcript parser for nothing.
* **Chat from the board is the real `claude` in a PTY, not the SDK** (2026-09-19). The TUI brings
  permission prompts, plan mode, slash commands and questions for free; an SDK chat would have to
  re-implement each. `node-pty` + `ws` + vendored xterm.js. The PTY belongs to the server: restart it and
  every drawer chat gets SIGHUP (exit 129).
* **Nothing is ever written under `~/.claude`.** Board-side state (done ticks, named projects, board
  titles) lives in `~/Library/Application Support/peixAIrada/state.json`.

### VS Code

* **VS Code chats are read-only on the board** (2026-09-19). Tried and dropped: taking a chat over by
  killing the extension's process. Evidence: the extension embeds the Agent SDK and respawns
  `--resume=<id>` 10–30 s after a kill (no restart limit in the bundle); its tab is bound to that
  process, and its only file watcher is on `~/.claude/sessions/`, never on transcripts, so a turn added
  by any other claude never appears in the open tab. Rule: a chat whose registry entry, else last
  transcript line, says `entrypoint: "claude-vscode"` gets 409 from reply/terminal, no `>_`, no
  composer. Where a chat lives = the registry's entrypoint while it runs, else the transcript's last.
* **CLI chats in another terminal *can* be taken over** (2026-09-19). Nothing respawns a CLI claude.
  `POST /api/sessions/:id/takeover`: SIGTERM, SIGKILL after 5 s, wait for the pid, `spawnTerm`. Two-click
  arm on the `>_` button, warns *mid-reply*. Verified with a stand-in claude in a PTY: exited 143, drawer
  resumed under a new pid.
* **Open the chat itself in VS Code with the extension's URI** (2026-09-19):
  `vscode://anthropic.claude-code/open?session=<id>` — undocumented parameter (docs list q/cwd/repo),
  verified on 2.1.278; `code <cwd>` first, the URI 400 ms later, because it lands in the focused window.
* **VS Code Web in the pane** (2026-09-20) — experiment succeeded. `code serve-web` serves the editor
  with a server-side extension host; the Claude Code extension is workspace-side (`main` only, no
  `browser`) and reads the same `~/.claude`: its sidebar showed the account, usage bars and the same
  sessions. Facts that cost time: extensions for it live in `~/.vscode-server/extensions`, installed once
  with `~/.vscode/cli/serve-web/<commit>/bin/code-server --install-extension anthropic.claude-code`; the
  web workbench keeps **settings and the trust decision in the browser profile**, not on the server (a
  `settings.json` under `~/.vscode-server/data/User` does nothing — one was written there, harmless,
  removable), and the extension refuses untrusted workspaces, so trust is clicked once in the pane and
  sticks in the app's WKWebView store; the extension's housekeeping runs there too (it archived 3 idle
  sessions on first start). `ensureVsWeb()` starts it on first use (loopback, port 7332, own process
  group, dies with the server) or adopts one already answering.

### The pane

* **A second `WKWebView`, because GitHub cannot be iframed** (`frame-ancestors 'none'`). Its own UI
  delegate, or `target=_blank` links are dropped silently. Both web views share the default data store,
  so the GitHub login survives relaunches. Ad-hoc signed app; the Edit menu had to be built for ⌘V to work.
* **An overlay, not a split** (2026-09-20). The `NSSplitView` reflowed the board's columns with every
  drag. Now the pane lies over the board's right side with a `PaneGrip` on its left edge; width in
  UserDefaults `paneWidth`; first open covers the chat column (the page sends the column's left edge).
* **Two pages on two tabs, GitHub and VS Code Web**, so one never replaces the other (2026-09-20).
* **Esc closes the pane, from the board or from either page, and is swallowed** (2026-09-20). In full
  screen the window otherwise took Esc to leave full screen. Handled by a local key monitor in Swift.
  With the pane hidden Esc is untouched. Trade-off accepted by Ricardo: the editor in the pane gives up
  its own Esc; if it bites, give the pane its own shortcut instead.

### The board

* **Three columns, ordered by *your* last touch, pins dropped** (2026-09-19). Projects → chats → chat.
  A project is a folder or a named set of folders (prefix match, so worktrees count). Done chats sink.
* **A chat that runs in the drawer is all terminal** (2026-09-19). The rendered transcript would be the
  same conversation twice. `show chat` splits for that attach; `hide` keeps claude running and shows the
  transcript; it comes back when the process ends. Chats the board does not drive always render.
* **Titles**: PR title beats Claude's `ai-title`, a `custom-title` (VS Code rename) beats both, and a
  **board title** (double-click the header; `PUT /api/sessions/:id/title`, `titles` in state.json) beats
  all. The CLI writes `ai-title` lines too, which is where iTerm chats get their names.
* **Look** (2026-09-19/20, all Ricardo's calls): VS Code chats get a blue outline and wash on the pane
  and the wash on the card, no chip in the header; cards have no status dot — Claude at work is a light
  running round the edge, needs-input a red border; title, age and ✓ on one row; the PRs a chat mentions
  as `#n` chips in GitHub's colours on the card; the projects column is a strip of solid colour tabs by
  default, opened only by » (no hover), the selected one bleeding into the chat list; filters hide behind
  a magnifier; ⌘+ / ⌘- / ⌘0 size the chat pane (transcript by CSS `zoom`, terminal by font size).

### Deliberately not done

* Attaching to a live session through its peer socket: documented feature, but it cannot answer a
  pending prompt, which is the only reason to want it.
* Hooks in `~/.claude/settings.json` (would make permission prompts visible): Ricardo's call.
* Distribution signing; the app is ad-hoc signed for this Mac.

## Open items

1. Ricardo's last message ended at "the web tab … 2)" — the second point about the pane never arrived.
2. Review and commit (or drop) the second session's work listed under *State of the tree*; resolve the
   PR-chips-on-cards vs PR-rows-under-the-header overlap.
3. Push, when wanted: `git push --force-with-lease --force-if-includes` only if history was rewritten;
   plain `git push` otherwise.
4. VS Code Web: decide whether the editor should keep its Esc (own shortcut for the pane instead).
5. The `~/acme` and `peixairada` test chats above; `~/.vscode-server/data/User/settings.json`.
6. Hover expansion of the strip and the pane's grip were only eyeballed, never scripted; the take-over
   and the VS Code Web lifecycle (start / adopt / die with the server) are covered by headless checks
   that live in this session's transcript, not in the repo — worth turning into `scripts/`.
