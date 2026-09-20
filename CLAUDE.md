# peixAIrada — working notes

One board for every Claude Code chat on this Mac. Reads what Claude Code already writes to `~/.claude`; no
private API, no cooperation from Claude Code itself. Built as a PoC on 2026-08-31 and grown from there.

**Three documents, three jobs.** [README.md](README.md) is for the user. This file is the *current invariants*
— one bullet each, under stable headings, what a session must know to change the code without breaking it.
[docs/DECISIONS.md](docs/DECISIONS.md) is the *why and the history*: dated decisions, open items, the state of the
tree, and *Findings* — the full stories behind the bullets below (moved there verbatim on 2026-09-20). When a
finding is new, add a decision entry there and a bullet here with a pointer; do not grow this file with stories.

## Run, build, check

```sh
scripts/launchd.sh install          # the server as a login agent, run from this checkout — the recommended setup
scripts/launchd.sh restart [--after N]   # after a server.mjs change; the drawers stay (holders); N s first, so a recap lands
mac/build.sh install                # the native app (bundles node, node_modules, lib/) into /Applications — Swift changes
npm start                           # node server.mjs → http://127.0.0.1:7331, by hand
npm test                            # node:test over test/ — pure logic, and the drawers end to end (≈8 s)
npm run check                       # static: every script parses, the page's script compiles, shell, swiftc -typecheck (≈10 s)
npm run verify -- "<js>"            # one expression on the live board in headless Chrome (see Verifying)
npm run scenario -- scripts/scenarios/<name>.mjs   # a multi-step browser check on its own server (see Verifying)
npm run map                         # rewrite the section maps at the top of server.mjs and index.html
```

* **The server is a launchd agent run from the repo; the app adopts whatever answers on 7331.** Quitting or
  rebuilding the app touches no chat. A page change is live on reload (the agent serves the working tree's
  `public/`); a `server.mjs` change needs `restart`. The bundled server in the app is the fallback for a Mac
  without the agent. → Findings: *launchd agent*.
* **A restart no longer ends the drawers** (2026-09-20 evening): each drawer is a holder process the server
  connects to (see *The drawer*). Drawers started by a server *before* that change end with its restart, once.
* **Node ≥ 20, `npm install` first.** Runtime deps: `node-pty` (native), `ws`, `@xterm/headless` 5.5 and
  `@xterm/addon-serialize` 0.13 (the holder's screen; pinned to the vendored xterm's version). The xterm client
  packages are dev-only sources for `public/vendor/`; `marked`/`DOMPurify`/`highlight.js` are vendored by hand.
  Rebuild the app after `npm install` or a node switch (it copies `node_modules` and the node binary).
* **A session that runs in a drawer**: finish the work, write the notes and the recap first, and run
  `restart --after 20` last. `GET /api/terminals` says which chats are in drawers. `launchd.sh` and `build.sh`
  detach themselves when run from a drawer (`PEIXAIRADA_DRAWER`, the app's bundle id). → Findings: *build.sh from a drawer*.

## Layout

| Path | What |
|---|---|
| `server.mjs` | The backend: transcript tailing, sessions, SSE, HTTP, notifications, the holder proxy. A **section map** at its top (`npm run map`); boots only when run as the program, exports its pure parts for the tests |
| `lib/termhold.mjs` | The holder: one process per drawer — the PTY, the exact screen, a Unix socket |
| `lib/cdp.mjs`, `lib/testserver.mjs` | Harness plumbing: headless Chrome over the DevTools protocol; a throwaway server with cleanup |
| `public/index.html` | The frontend, one file, no build step: projects · chats · chat, the drawer, the transcript renderer. A section map at the top of its script |
| `public/vendor/` | `marked` 18.0.11 + `DOMPurify` 3.4.14 + `highlight.js` 11.11.1 + `xterm` 5.5.0 (+ fit 0.11, web-links 0.12) — UMD builds, no CDN at runtime |
| `mac/Sources/main.swift` | The native shell: window, the pane (web views per page), server lifecycle, Dock badge, menu bar, notifications, the hotkey forwarder |
| `mac/icon/MakeIcon.swift`, `mac/build.sh` | The icon, drawn in CoreGraphics; compile + bundle + sign + install |
| `scripts/launchd.sh` | The server as a login agent; `restart [--after N]` |
| `scripts/verify.mjs`, `scripts/scenario.mjs`, `scripts/scenarios/` | The browser harness (see Verifying) |
| `scripts/fakeclaude.mjs`, `scripts/fixture.mjs` | A stand-in CLI for tests; a `~/.claude` look-alike |
| `scripts/check.sh`, `scripts/check-page.mjs`, `scripts/map.mjs` | Static checks; the section maps |
| `test/` | `node:test` files (`npm test`) |
| `hooks/` | Optional Claude Code hooks that POST to `/hook`. **Not installed** — Ricardo's call |

## How it reads Claude Code

| Signal | Source |
|---|---|
| Transcript, appended live | `~/.claude/projects/<cwd-slug>/<session-id>.jsonl`, `fs.watch(recursive)` — no polling needed |
| Which sessions are alive | `~/.claude/sessions/<pid>.json` + `process.kill(pid, 0)`; watched *and* polled every 10 s (pids die silently) |
| Where a chat lives | `entrypoint` on user/assistant lines (`claude-vscode` / `cli`), the registry's while it runs — `inVsCode()`. Several processes on one chat: the drawer's own is `live`, else the newest non-VS Code one; the rest are `rivals` on the summary |
| Reply finished | assistant line with `stop_reason: "end_turn"` (tool calls are `"tool_use"`) |
| Waiting on the user | `AskUserQuestion` / `ExitPlanMode` tool call with no result yet |
| Titles | board title (state file) › `custom-title` › the oldest still-open PR › `ai-title` › last prompt — `summary()`, `prTitle()` |
| PRs mentioned | `pr-link` lines *and* GitHub pull URLs in user/assistant text; most recently mentioned first; `gh api graphql` batched for state and title (one of the two network calls) |
| Plan usage (the fish) | `GET https://api.anthropic.com/api/oauth/usage` with Claude Code's own OAuth bearer from the keychain item *Claude Code-credentials*; `USAGE=off` disables; the token never reaches the page. → Findings: *plan usage* |
| Permission prompts | only via hooks (they never reach the transcript), or visibly in the drawer |
| Chat from the board | a holder runs `claude --resume <id>` or `claude` in the chat's cwd through an interactive login zsh (mise's PATH); it registers like any CLI run; a new chat is tied to its session by pid |

**Never written: anything under `~/.claude`.** The board is read-only against Claude Code's data. The fake claude
refuses to run against the real directory for the same reason.

## The board

* **Three columns**: projects (a strip by default) → the selected project's chats → the chat. A chat is *ready ·
  clauding · done*: done is the tick only, clauding is `working`, ready is everything else (`bucket()`); the
  server keeps the finer `status` for notifications and the badge. → Findings: *The board and its state*.
* **A project is a folder** (the registry's `cwd`, never the transcript's — that one moves with `cd`) **or a
  named set of folders** (state file); worktrees under a repo count as the repo. **Pinned projects** head the
  column (`PUT /api/pins`, the whole list, a `pins` event); folder projects exist only through their sessions.
* **A project's colour is Peacock's and nothing else** — `pollPeacock()` reads the nearest `.vscode/settings.json`
  at or above every folder it knows, stopping short of `$HOME`; the board can *set* it (`PUT/DELETE /api/peacock`,
  a text edit of the JSONC, tested). No colour → `--nocolor`. The colour square is the picker (`#colorInput`).
* **The chat header is the project's colour** (2026-09-20): `tintChat()` sets `--repo`, `--rink` and `#chat.tinted`;
  `--rink` is the ink that reads on it, white or near-black by Peacock's own brightness rule (`inkOn()`), and every
  control in `.shead` is redrawn in it. No colour → the plain panel header.
* **Order is by when *you* last acted** (`lastUserAt`), newest first; done chats sink; a project ranks by its
  newest chat. Claude finishing a job never reshuffles the list.
* **State lives in three places**: the server's `~/Library/Application Support/peixAIrada/state.json` (done
  ticks, named projects, board titles, pins; `STATE_FILE` overrides) shared by the app and every browser; the
  browser's `localStorage` `peixairada-prefs` (selected project, filters, widths, zoom, folds, drawer open/height);
  and never `~/.claude`. `renderHead` re-runs on every SSE update — anything it renders reads its state from prefs.

## Hotkeys and the pane

* **`HOTKEYS` in index.html is the whole ⌥⌘ family**: T a fresh zsh in this chat's folder (`hotShell()` →
  `POST /api/sessions/:id/shell` → `open -a iTerm <cwd>`, Terminal without iTerm), E the VS Code *Web* button
  (edit inline, in the pane), V the real VS Code (the focus button), G the chat's PR on GitHub — one opens straight
  away, several open the picker in `pr` mode, and with one already showing the next opens (a toggle with two, a
  cycle with more) —, C this chat's claude session (`termAction()`, the `>_` button's path — arm and take over
  included, focus at the end), O the project picker. Capture phase, `e.code` (with ⌥ held `e.key` is a symbol). A
  `dialog[open]` swallows them; no chat or no PR is a `note()`. The cog lists every key (`.keys` in `#settings`) —
  keep it in step by hand, with `boardKeys` in main.swift.
* **In the app the pane is a native view** over the chat column with its own web views: a key pressed there never
  reaches the page, so `installHotkeyForwarder()` forwards ⌥⌘ + the six letters to `window.peixKey`; the shell
  reports `peixPane(visible, left)` so the picker opens beside the pane (`.aside`) and asks for the keyboard
  (`{type:'focus'}`). Esc closes the pane from anywhere (a local monitor, so full screen keeps it).
* **The pane keeps a web view per page and a tab per page of the current chat** (`tabKeys`, `setTabs`,
  `repo#n` per PR, *VS Code* for the editor); the page remembers each chat's pages (`state.paneGh` = `{list, cur}`,
  `state.paneIde` per cwd) and posts them on every switch. GitHub cannot be iframed, hence a second `WKWebView`;
  a web view with no UI delegate drops `target=_blank`, hence `PrPaneDelegate`. → Findings: *the pane*.
* **Both web views are inspectable** (main.swift sets it): Safari → Develop reaches the real app.

## The drawer

* **A drawer is a holder** (`lib/termhold.mjs`): a detached process that owns the PTY (node-pty, `zsh -l -i -c
  'exec claude …'`) and the exact screen (`@xterm/headless` + serialize), listening on `<state dir>/terms/<id>.sock`
  — newline-delimited JSON: `in`, `resize`, `snap`, `kill`, `quit`, `meta` in; `hello`, `out` (with `seq`), `snap`
  (with `upto`), `exit` out. The server connects, proxies pages (`attachTermSocket`), adopts holders on boot
  (`adoptHolders`), and tells a holder its session id once the registry reveals it. An exited holder lingers
  `TERM_LINGER_MS` with its last screen, then removes its files. The socket path must stay under 104 bytes — test
  state dirs are short on purpose.
* **A page that attaches gets the screen serialized, then only what followed it** (`ws.hold` until the snapshot,
  flushed minus `seq ≤ upto`). It replaced a raw byte replay that was capped and cut by chunk: Claude Code paints
  its prompt box and status bar once and then rewrites only changed cells, so a truncated replay showed blank rules
  and lone digits. → Findings: *round three*.
* **`nudgeTerm()` after every attach** — a resize one row short, then the true size 150 ms later — makes Claude
  repaint over whatever the page holds; belt and braces now, the fix before the snapshot existed.
* **The drawer's geometry**: `grid-template-columns: minmax(0, 1fr)` on `#term` and `#chat`, `min-width: 0;
  overflow: hidden` on `.tbody`, and `.tbody { box-sizing: content-box }` (the fit addon reads the padded size under
  the page's border-box rule and proposed one row too many). Refits on the body's `ResizeObserver`, on
  display-scale change (`watchDpr`), on focus and on visibility. → Findings: *run off the right edge*, *round two*.
* **Shift+Enter is a newline**: the drawer sends `ESC CR` itself (what `/terminal-setup` binds in VS Code) and
  swallows the keypress too. `macOptionIsMeta: true`. → Findings: *Shift+Enter*.
* **Attaching a file is typing its path** (`@dir/file`, spaces as `\ `); the app hands real paths over the
  bridge (`peixDrop`), a browser uploads (`PUT /api/attach`). ⌘V with an image sends ⌃V to claude in the app.
* **`termEnv()` strips only `CLAUDECODE` and `CLAUDE_CODE_*`** (the CLI refuses to nest) and keeps `CLAUDE_DIR`
  (the fake claude reads it). Every CLI the server shells out to goes through `findBin()` — the app's server has
  a bare PATH. `exit code 129` in a drawer is SIGHUP from its holder ending, not a crash.
* **Take-over**: a chat live in iTerm or VS Code can be resumed here — SIGTERM the other processes, wait, spawn.
  Nothing respawns a CLI claude, and VS Code's extension never respawns one that died (it launches one when a tab
  *mounts* a chat). The tab in VS Code goes dead and does not follow. → Findings: *VS Code chats can be taken over*.
* **Live chats are never written to** from the board (a second writer on one transcript); stale ones get
  `claude --resume -p` for a one-shot reply, or a drawer.

## Invariants that bit us — one line each, the story in Findings

* Transcript line types are undocumented: ignore the unknown; drop `isSidechain`, `isMeta`, `isCompactSummary`,
  `<system-reminder>` blocks (strip them *first* — a prompt can follow one) and `<local-command…>` synthetic lines.
* `.cards > * { flex: none }` is load-bearing; `.card { --repo: initial }` too (custom properties inherit — the orange cards).
* `.shead { min-width: 0 }` and a fixed `flex-basis` on `.shead h2`; PR chips are direct children of the header.
* `#chat` has explicit grid rows and `.termmax` repeats them — a new block in the chat pane means touching both.
* Inline code gets a tint, never a border; card glyphs are inline SVG, not emoji; the working ring is the project's colour.
* No in-page toasts: alerts are the badge plus a system notification; the app sets `NOTIFY=off` on its own server.
* Swift: `Result<Void, String>` does not compile; `isReleasedWhenClosed = false` on the window; drop -999 in every
  navigation-failure callback; pin the deployment target (`-target`, `LSMinimumSystemVersion`); an Edit menu or no ⌘V.
* Sign with the one Apple Development identity (stable team → App Management grants survive installs); chmod
  node-pty's spawn-helper only when the bit is missing (a same-mode chmod is still a write to the bundle).
* macOS has no `timeout(1)`: `perl -e 'alarm shift; exec @ARGV' 60 <cmd>`.
* `pkill -f server.mjs` also kills the app's own server — stop test servers **by port**.
* Opening a chat in VS Code rides on an undocumented URI parameter (`session`); `code <cwd>` first, the URI 400 ms later.
* VS Code Web (`code serve-web`): extensions live in `~/.vscode-server`, trust lives in the browser profile. → Findings: *VS Code Web*.
* Ink redraws only its live region on a resize; earlier lines keep the old width. That is Claude Code's, not ours.

## Verifying changes

**Do not claim a UI change works without loading it in a real browser** — squashed cards, detached fins, column
overlap, lone digits were all invisible in the code and obvious on screen. Look at the screenshots (`Read` renders PNGs).

* `npm run verify -- "<js>"` evaluates one expression on the live board; `--hash <id>` opens a chat first,
  `--shot file.png` saves a screenshot after, `DARK=1`, `URL=http://127.0.0.1:<port>/`. `--dump-dom` is useless here
  (fires before the SSE snapshot); drive Chrome over CDP — `lib/cdp.mjs`.
* `npm run scenario -- scripts/scenarios/<name>.mjs` for anything with more than one step. A scenario exports
  `meta` (`server`, `fake`, `fixture`) and a default `async (ctx) => result`; the runner starts a throwaway server
  on a free port with its own state dir (`lib/testserver.mjs`), builds the fixture (`scripts/fixture.mjs`), runs the
  fake claude when asked, launches Chrome with **focus emulation on**, and ends terminals, holders, Chrome and temp
  dirs on exit (`--keep` to inspect). `ctx`: `evaluate`, `waitFor`, `send`, `sleep`, `shot(label)`, `key(code)`,
  `openChat(id)`, `screen()`, `waitPrompt()`, `peix(expr)`, `server.api/terminals/restart/logText`, `fixture.chats`,
  `assert`. The four in `scripts/scenarios/` are the regression checks for the drawer (re-attach, restart,
  geometry) and the hotkeys.
* **Test against the fake claude, not real chats**: `scripts/fakeclaude.mjs` via `CLAUDE_BIN` (the test server's
  `fake: true`) is instant and touches nothing. A test against the real `~/.claude` (read-only, `claudeDir` unset)
  must use a stale chat and `DELETE` the terminals it made.
* **Two measurement traps** (2026-09-20): Claude Code stops rendering while the terminal reports focus lost — a
  headless page's `focus()` is not a focus without `Emulation.setFocusEmulationEnabled` (the runner sets it); and a
  chat switch as a re-attach resizes the drawer by itself (the other chat's reply box) and masks results — hide
  + `>_` is the clean re-attach.
* The page's script is one IIFE: read it through `window.peix` (`state()`, `session(id)`, `sessions()`, `prefs()`,
  `term()`, `screen()`) or the DOM; `#termBtn.click()` spawns, an `InputEvent` on `#termBody textarea` types.
* Server logic without a browser: `npm test` (the terminals test is the reference for driving the API and the
  socket); or a fixture tree `CLAUDE_DIR=/tmp/fix` and assertions on `/api/sessions`.
* The app logs to `~/Library/Logs/peixairada-app.log` (alerts, badges, pane opens, drops); the agent's server to
  `~/Library/Logs/peixairada.log` (spawns, adoptions, snapshots). Read those before guessing.

## Deliberately not done

* **Making VS Code's tab follow a chat continued elsewhere** — the extension watches only `~/.claude/sessions/`.
* **Attaching to a *live* session from the board** — the session's inbox socket cannot answer a permission
  prompt on your behalf, and its message JSON is undocumented. Live chats are refused on purpose.
* **PR status costs a network call**, so boot queues every PR once, batched; merged/closed cached forever,
  open re-checked after `PR_TTL_MS`. A card is titled by the oldest still-open PR (`prTitle()`).
* **Hooks are not installed** in `~/.claude/settings.json`; `hooks/settings-snippet.json` is what makes
  permission prompts visible.
* **The app is signed for this machine only**, not for distribution.
* **Chat-level pins** were dropped for sorting by your own last touch; **board-set colours** for Peacock's.
