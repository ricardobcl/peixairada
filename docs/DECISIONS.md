# peixAIrada — decision log and hand-off

What was decided, why, and what is still open, so the work can be picked up in another session.
Newest at the top of each list. `CLAUDE.md` is the working notes (how things are built, what bit us);
this file is the *why* and the *state*. Last updated 2026-09-20 (later that morning).

## Decisions of 2026-09-20, later that morning (the uncommitted session)

* **Hotkeys, round two: ⌥⌘V is VS Code Web, ⌥⌘G (GitHub) replaces ⌥⌘P and cycles, the pane has a tab per page,
  keys work from the pane** (2026-09-20 afternoon, Ricardo: "the vscode hotkey is for vscode web inline, not opening
  the real vscode · change the PR hotkey from P to G (for Github) · the PR hotkey should also work when a PR is
  already open and we have more than 1, so I can toggle. it could open a tab, instead of reloading the single tab").
  Why it did not work with a PR open: in the app the pane is a native view — over the chat column, where the
  centred picker opened unseen, and with its own web views, so a key pressed in it never reached the page. Built:
  `installHotkeyForwarder()` (⌥⌘ + the four letters, from the pane to `window.peixKey`), `tellPane()` → `peixPane`
  (the picker opens beside the pane, `.aside`, and asks for the keyboard with `{type:'focus'}`), the cycle
  (`hotGh`: the strip's PR is current, the next one opens), and the segmented control rebuilt per chat with one tab
  per page — `repo#n` per PR, *VS Code* for the editor — so a second PR is a second tab, not the first tab's new
  page. Page side verified headless (picker → ⏎ → A, ⌥⌘G → B, ⌥⌘G → A, the forwarded call, the aside class with the
  pane reported up, ⌥⌘V hitting the vscode-web route); Swift side type-checked, installed and reasoned, not driven.
* **The drawer's grid, round three: found** (2026-09-20, later; Ricardo, with the screenshot on the Desktop: "as you
  can see, the rending issue is still not fixed"). The picture: a status bar of lone digits under blank rows — a
  screen rebuilt from the server's *truncated* byte replay on re-attach (`TERM_SCROLLBACK`, trimmed by chunk), which
  Claude Code, rewriting only changed cells, never repairs until a resize. Every chat switch re-attaches. Fix in the
  page: `nudgeTerm()` after every attach — a resize one row short, then the true size 150 ms later — so Claude
  repaints over the replay; reproduced and verified A/B on a throwaway server with a 1.2 KB cap, hide + `>_` as the
  re-attach (with the nudge the full frame, with its resizes dropped the broken one; a chat switch resizes the drawer
  by itself and masks the result; headless needs focus emulation or Claude Code stops rendering). **Then the proper
  fix, on Ricardo's "do it"**: the server keeps the exact screen of every drawer in a headless xterm (`@xterm/headless`
  5.5 + `@xterm/addon-serialize` 0.13, pinned to the vendored client's version) and a page that attaches gets it
  serialized — scrollback, colours, cursor, modes — with output that arrives meanwhile held and sent after; the byte
  buffer is only the fallback without the modules. Verified with the nudge suppressed: complete. `npm install` done,
  app rebuilt for its bundled copy (build.sh no longer strips `@xterm` whole), `scripts/launchd.sh restart` run from
  this drawer, detached and delayed a few seconds so the recap was written first — it ended every drawer, this chat's
  included. Details under *Things that bit us*.
* **The drawer's grid, round two** (2026-09-20 afternoon, Ricardo: "still happening the visual bug on the app after some
  time. if I increase or decrease the font, it fixes"; the screenshot was in macOS's screen-capture staging folder,
  unreadable from the sandbox, so the work went from the code and measurements). Fixed for certain: the fit addon
  over-counts the drawer body's padding under the page's border-box rule, one row too many, the status line clipped
  by 3 px always — `.tbody` is content-box now. Added on reasoning: a refit on display-scale change (xterm re-measures
  and repaints on it, refits nothing, and the row height rounds through the scale), on focus and on coming back into
  view — the same `fit()` ⌘+ runs, a resize only when the numbers moved. Ruled out: a second page attached to the same
  terminal (only the app is connected to 7331); a rows-only shrink under an idle claude (redraws cleanly on a throwaway
  server). Not reproduced: the bug itself. `window.peixDebug()` prints the grid numbers for the next report; the ask
  is the screenshot on the Desktop plus whether a window resize also fixes it. Details under *Things that bit us*.
* **The cog lists the keys** (2026-09-20, Ricardo: "put the current keybindings on the cog, to check if I forget").
  A `kbd` · text grid under a rule in the settings popover, the one in-page legend: ⌥⌘O/T/V/P, ⌘+/−/0, ⇧⏎, esc, and
  the app's ⌘R/⇧⌘R. Keep it in step with `HOTKEYS` and the app menu by hand — nothing generates it.
* **Hotkeys for the open chat: ⌥⌘T terminal, ⌥⌘V VS Code, ⌥⌘P pull request** (2026-09-20, Ricardo: "I want
  some hotkeys for: attach to a claude session, open VScode and Open GH PR browse (if more than one, give me a
  prompt like the project picker)"). One `HOTKEYS` table beside ⌥⌘O's listener, same chord family, same
  capture-phase / `e.code` mechanics, so they work from inside the drawer too. Each key *is* the header's
  control rather than a parallel path: T runs `termAction()`, which the `>_` button now calls as well (so the
  arm-then-take-over safety holds — two presses on a chat live elsewhere) and ends by focusing xterm; V clicks
  `#focusBtn`, whose *failed* state is the report; P opens the PR with `showPr()` when the chat has one and
  otherwise reuses `#pick` in a `pr` mode over `s.prs` — the `#prlist` row layout, filtered by number or
  title. Nothing fires while a dialog is open; no chat or no PR is a transient note under the header rather
  than silence. The button tooltips carry the keys; there is still no in-page key legend (README has it).
  Checked headless on the two-, one- and no-PR chats, the notes, ⌥⌘O, the stubbed POSTs, and ⌥⌘T for real on a
  throwaway server on 7399 (terminal deleted, server stopped by port).

* **VS Code chats can be taken over; the 2026-09-19 "extension respawns" finding was a misread** (2026-09-20,
  Ricardo: revisit the decision "because they do the same in reverse" — a chat started here, opened in VS Code,
  came back to the board marked VS Code; the trade-off of not keeping that chat open in VS Code is fine, with a
  warning). Re-measured on 2.1.278 with the extension host log open: the extension launches a claude when a
  *tab mounts* a chat (the sessions list, the `/open` URI for a chat with no tab yet, a window restore) and can
  do so twice for one chat — two `claude-vscode` pids on one session id were already in the registry for two
  other chats — but never respawns one that died. SIGTERM on the process behind the tab in front: "Closing
  Claude on channel …", the 143 error, nothing for 60 s; the same for a chat in the background; the same after
  a real take-over from the board. Both "respawns" of 2026-09-19 sit in the log right after a `webview_focused`
  + sessions-dialog request, and after the panel switching back to the chat — the user reopening it. So the
  cost of a take-over is only this: the tab in VS Code goes dead and does not follow the chat, and opening the
  chat there again starts another claude on it. Built: `rivals` on the summary (every other live process on a
  chat; the chat's own is the drawer's, else the newest non-VS-Code one), a red bar under the header with
  **end it** when a chat driven here has one (the take-over route, which with the chat already here ends only
  the others), the `>_` take-over on VS Code chats with the warning in the tooltip (armed label *sure? ends VS
  Code's*), the composer and terminal on a stale chat last continued in VS Code with a note, a *VS Code too*
  chip on the card. Verified: both route branches on a fixture with stand-in processes; end to end against a
  real VS Code chat ("Day inquiry") — taken over, resumed in the drawer as CLI within 2 s, VS Code stayed away
  for 30 s. Not done, still: making VS Code's tab follow — its only watcher is `~/.claude/sessions/`.
* **The server runs as a launchd agent from the checkout; the app adopts it ("level one").** A drawer's claude
  hangs off the server that spawned it, so with the app's own server every quit or rebuild killed every chat.
  Under the agent the app is only a window: quit it, rebuild it, the chats stay. Costs: a `server.mjs` change
  needs `scripts/launchd.sh restart` (drawers end); the agent installs with `NOTIFY=off` so the app keeps its own
  notifications, hence none while the app is closed. **Level two, not built:** a small holder process per drawer
  (a node dtach: owns the PTY, Unix socket, scrollback, reattach on server start) so chats survive a server
  restart too; not tmux — prefix key, status bar, smallest-client resize, `TMUX` quirks in Claude Code. Make it
  the default for every drawer rather than an opt-in "detachable" mark; the board then needs a view of orphans.
* **Washes are the project's colour; where a chat lives is a mark.** The VS Code blue and the CLI orange on
  cards and the pane went once VS Code chats became takeable — the distinction stopped meaning "hands off". Both
  are washed in the project's Peacock colour (none without one); VS Code ownership is a small VS Code mark at the
  card's top right and at the end of the chat header.
* **Plan usage lives on the fish, not in the cog.** Hovering the app icon at the top of the strip opens the
  usage card (a click pins it); the cog keeps only the settings. Ricardo's ask: "move the credits to display
  when I hover on the app icon".
* **Codename buckets show only when non-zero.** The usage API returned `nimbus_quill` at 0 % — a bucket the
  2.1.278 CLI has no label for and never shows (its sibling `cinder_cove` is "Claude Code and Cowork credit").
  Per-model weekly allowances (Fable, Sonnet…) come from the response's `limits[]` rows and are all shown, no
  allowlist. The Fable row is verified against a fixture only; the live call needs Ricardo's login.
* **Sign with the keychain's Apple Development identity.** Ad-hoc signing made every install a new app to TCC:
  the App Management grant reset each time and the app's own bundle writes raised "prevented from modifying
  apps on your Mac". `build.sh` now uses the single valid identity when there is one (`CODESIGN_ID` overrides,
  `-` forces ad-hoc); the server no longer chmods spawn-helper unless the bit is missing.
* **PR rows under the chat header stay, and so do the `#n` chips on cards.** They are different places for
  different moments — the card is scanned, the header is read — and the rows were asked for explicitly
  ("one per row at the top and with the title visible"). Not an overlap to resolve.
* **Three chat states: ready · clauding · done — and done is only the tick** (the first cut, earlier the same day,
  folded stale into done; asked to change). Needs-input folds into ready ("ready for my input" — the card still
  says *asking you*), and so does a chat with no live process: it resumes on the first write, so nothing is done
  until you say so. The grey dot and the slight dim still say "no process" on the card, and the project pills count
  by the same rule. The server keeps the finer statuses for notifications and the Dock badge; the list order (your
  last touch) is untouched by state.
* **Project colours are Peacock's, nothing else; no colour is black** (asked later the same day — the board-set
  swatch and the hashed hues lasted a morning). A colour on the board now always means the VS Code window is
  that colour; a folder without one is black wherever a colour is needed and neutral elsewhere (card frame,
  working ring). The server polls the nearest `.vscode/settings.json` at or above every known folder every 3 s
  and pushes changes, so the board follows a Peacock change within seconds. The `colors` state key is dropped
  on the next save. Cards keep the project colour on the whole border, not only the left bar.
* **The board sets Peacock's colour too** (asked later still). A swatch on hover, folder rows and single-folder
  named projects, writes `peacock.color` into the folder's `.vscode/settings.json` — the file the poll reads, or a
  new one — as a text edit so the JSONC survives; Peacock repaints the window from its own watcher, the board from
  the forced poll. ⌥-click removes the key. Rejected: rewriting the file as JSON (comments and formatting would go)
  and deriving Peacock's `workbench.colorCustomizations` ourselves (Peacock does that on the change). Known cost:
  where a repo tracks `.vscode/settings.json`, the write shows up in `git status`; the tooltip says so.
* **Projects pin, and the pinned ones are arranged by hand.** Server state (`pinned`, ordered keys), so the app
  and every browser agree; the pinned block heads the column above a line, a pinned folder shows even with no
  chat in view, and drag and drop — in the strip too — is the ordering UI: above the line pins at that place,
  below it unpins. Chat pins were dropped on 2026-09-19 in favour of sorting by your last touch; project pins
  are a different thing — the projects you live in are a short, stable list, and recency alone kept moving them.
* **The state chips are toggles; there is no *all*.** Each of ready · clauding · done shows or hides that state;
  all three on is what *all* was, the set is remembered per browser, and every one off says so instead of
  showing an empty list.
* **The page header is gone; the fish and the cog took its jobs.** No badge on the fish (asked); it greys out
  when the SSE stream drops instead.
* **`build.sh install` from a drawer detaches itself, marked by an argument, never an env var** — `open`
  hands the caller's environment to the app and it came back round to the next install.

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
* The installed app (`/Applications/peixAIrada.app`) is rebuilt from the working tree after each change in
  the uncommitted session, most recently with the usage card on the fish and the new signing identity.
* **Later on 2026-09-20, also uncommitted:** project pins with drag-and-drop ordering, Peacock-only colours
  polled live, toggle state chips. The `server.mjs` part (pins route, `peacock` event, the poller) needs
  `scripts/launchd.sh restart` to go live; until then a reloaded page shows every project black (the old
  server sends no `peacock` map) and pinning 404s. The session that built it was itself in a drawer, so the
  restart was left to Ricardo.
* **Later still on 2026-09-20, uncommitted, from a third session running alongside the one above:** VS Code
  chats takeable — `rivals`, the red bar, the gates lifted (`server.mjs`, `public/index.html`), and the notes
  here, in `CLAUDE.md` and `README.md`. The same `scripts/launchd.sh restart` puts it live; that session was in
  a drawer too, next to a live one editing the same files, so it did not restart the agent either.

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

* **VS Code chats are read-only on the board** (2026-09-19) — **reversed on 2026-09-20**, see the top of
  this file. The 2026-09-19 evidence ("the extension respawns `--resume=<id>` 10–30 s after a kill") was the
  user reopening the chat in its panel, as the extension host log shows; what does hold is that the tab is
  bound to its process and the extension's only file watcher is on `~/.claude/sessions/`, so a take-over
  leaves a dead tab that does not follow. Rule now: any live chat not in the drawer can be taken over; a
  chat's tint says where it lives, `rivals` says who else runs it. Where a chat lives = the registry's
  entrypoint while it runs (the drawer's own process first, else the newest that is not VS Code's), else
  the transcript's last.
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
* **Two tabs, GitHub and VS Code Web — and, later the same day, a web view per page** (2026-09-20). One view
  per tab was reloaded on every chat switch ("seems like it reloads every time I switch cards"). Now a
  `WKWebView` per key (`gh:<url>`, `ide:<url>`), loaded once; the page tells the shell on every switch which two
  are the chat's (`{type:'chat'}`), the tabs swap without loading, the pane hides for a chat with no page and
  returns for one with, unless closed there; eight views kept, least recently shown evicted. Rejected: a view per
  *chat* — several chats in one folder would each load a workbench, for the same editor.
* **Esc closes the pane, from the board or from either page, and is swallowed** (2026-09-20). In full
  screen the window otherwise took Esc to leave full screen. Handled by a local key monitor in Swift.
  With the pane hidden Esc is untouched. Trade-off accepted by Ricardo: the editor in the pane gives up
  its own Esc; if it bites, give the pane its own shortcut instead.

### The board

* **Attaching a file is a path typed for claude, never an upload the server understands** (2026-09-20).
  Claude Code's own forms — an `@` mention, ⌃V for the clipboard — already work in the drawer, so a Finder drop
  becomes `@path` in the prompt (or in the reply box on a stale chat). The app hands the real path over
  (`BoardWebView` takes file drags before WebKit); a browser cannot, so there the bytes go to
  `PUT /api/attach` and the saved copy's path is typed instead. The copy lives beside the state file and is
  never cleaned up — cheap, and deleting something claude was told about is worse.
* **The colour square is the picker, in the chat list's header too** (2026-09-20). The first cut was a hover
  swatch at the row's right, open column only; asked for the header as well. One real `<input type=color>` for
  the page, moved under the clicked square: the lists are re-rendered on every update and an input inside them
  lost its open panel. Live preview while the panel moves, write on rest and on close, a note by the square
  with the outcome — the 404 from a server older than the page included, since "choosing the colour does
  nothing" was that.
* **Three columns, ordered by *your* last touch, pins dropped** (2026-09-19). Projects → chats → chat.
  A project is a folder or a named set of folders (prefix match, so worktrees count). Done chats sink.
* **A chat that runs in the drawer is all terminal** (2026-09-19). The rendered transcript would be the
  same conversation twice. `show chat` splits for that attach; `hide` keeps claude running and shows the
  transcript; it comes back when the process ends. Chats the board does not drive always render.
* **Titles**: PR title beats Claude's `ai-title`, a `custom-title` (VS Code rename) beats both, and a
  **board title** (double-click the header; `PUT /api/sessions/:id/title`, `titles` in state.json) beats
  all. The CLI writes `ai-title` lines too, which is where iTerm chats get their names.
* **Look** (2026-09-19/20, all Ricardo's calls): VS Code chats get a VS Code mark top right on the card and at the end of the header (the blue outline and
  wash, and the CLI's orange, lasted until later on 2026-09-20 — washes are the project's colour now, none without one); cards have no status dot — Claude at work is a light
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
   (CLI and VS Code, the rival bar, both branches of the route on a fixture with `sleep` stand-ins in a
   throwaway `CLAUDE_DIR`) and the VS Code Web lifecycle (start / adopt / die with the server) are covered
   by headless checks that live in the sessions' transcripts, not in the repo — worth turning into `scripts/`.
7. The take-over test left "Day inquiry" (`b5f030fc`) with a dead tab in VS Code's peixairada window, and
   the respawn tests did the same to "Orange gradient…" (`361dff0b`) and "Port 7331 NSURLErrorDomain…"
   (`ae6315a1`); reopening any of them there starts a fresh claude on it. VS Code was left open.
8. `scripts/launchd.sh restart` was run for `PUT/DELETE /api/peacock` and `PUT /api/attach` on 2026-09-20 around
   13:00, on Ricardo's word, from the drawer chat itself (detached; it ended the four drawer chats). Check on resume:
   a colour change on a folder row shows *Written to …* rather than the 404 note; the app was rebuilt for the drop
   and the pane per page just before.
9. The Finder drop in the app and the pane per page were type-checked, installed and reasoned through, not
   driven: no headless harness reaches an `NSDraggingInfo`. First real drag: `drop: n file(s)` in
   `~/Library/Logs/peixairada-app.log`; first switch between two chats with pages: `pane … (kept)` there.
