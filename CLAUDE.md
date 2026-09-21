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
| Reply finished | assistant line with `stop_reason: "end_turn"` (tool calls are `"tool_use"`) — unless a **sub-agent** is at work: `<slug>/<id>/subagents/agent-*.jsonl`, running while its last line is not an end_turn and it wrote within `AGENT_STALE_MS` (`scanAgents()`, on their fs events and every 10 s); a background agent ends the main turn at once, so this is what keeps the card clauding |
| Waiting on the user | `AskUserQuestion` / `ExitPlanMode` tool call with no result yet |
| Titles | board title (state file) › `custom-title` › the oldest still-open PR › `ai-title` › last prompt — `summary()`, `prTitle()` |
| PRs mentioned | `pr-link` lines *and* GitHub pull URLs in user/assistant text; most recently mentioned first; `gh api graphql` batched for state and title (one of the two network calls) |
| Plan usage (the cog's popover) | `GET https://api.anthropic.com/api/oauth/usage` with Claude Code's own OAuth bearer from the keychain item *Claude Code-credentials*; `USAGE=off` disables; the token never reaches the page. → Findings: *plan usage* |
| Permission prompts | only via hooks (they never reach the transcript), or visibly in the drawer |
| Chat from the board | a holder runs `claude --resume <id>` or `claude` in the chat's cwd through an interactive login zsh (mise's PATH); it registers like any CLI run; a new chat is tied to its session by pid. **A folder whose Taskfile launches claude** (a task whose description mentions Claude — oracle's `task production-workload`…) starts new chats as `task <name>` instead: `GET /api/launchers?cwd=` lists them (`task --list --json`, cached by the file's mtime, `TASK_BIN` overrides), `POST /api/terminals {cwd, task}` checks the name against that list; claude is then a *descendant* of the PTY's pid, found through `ps` (`linkTermToRegistry`, `t.claudePid`), which is also where the launcher's name is written down for good (`noteEnv` → `envs` in the state file → `s.env`, what ⌥⌘O scopes by). A resume never goes through task. **`/clear` (or `/resume`) in the drawer** gives that pid a new session id — the registry file says so — and `linkTermToRegistry` moves the holder to it; the page follows the holder to whatever chat it runs (`terminal` event → `openSession`), the old chat is a stale card |

**Never written: anything under `~/.claude`.** The board is read-only against Claude Code's data. The fake claude
refuses to run against the real directory for the same reason.

## The board

* **Three columns**: projects (a strip by default) → the selected project's chats → the chat. A chat is *ready ·
  clauding · done*: done is the tick only, clauding is `working`, ready is everything else (`bucket()`); the
  server keeps the finer `status` for notifications and the badge. → Findings: *The board and its state*.
* **A project is a folder** (the registry's `cwd`, never the transcript's — that one moves with `cd`) **or a
  named set of folders** (state file); worktrees under a repo count as the repo. **Pinned projects** head the
  column (`PUT /api/pins`, the whole list, a `pins` event); folder projects exist only through their sessions.
* **A project's colour is Peacock's** — `pollPeacock()` reads the nearest `.vscode/settings.json`
  at or above every folder it knows, stopping short of `$HOME`; the board can *set* it (`PUT/DELETE /api/peacock`,
  a text edit of the JSONC, tested). No colour → `--nocolor`, unless the folder is named in `PROJECT_COLORS` (by its
  shown name, like `PROJECT_ICONS`): `acme` is the board's own `BLACK` (2026-09-20). Peacock still wins where it
  speaks. The colour square is the picker (`#colorInput`).
* **The chat header is a gradient of the project's colour** (2026-09-20): `tintChat()` sets `--repo`, `--rink`,
  `--rover`/`--rover2` and `#chat.tinted`; `--rink` is the ink that reads on it, white or near-black by Peacock's own
  brightness rule (`inkOn()`), and every control in `.shead` is redrawn in it; the veils (`--rover` across, `--rover2`
  down) pull the colour *away* from that ink towards the bottom right, so contrast holds at the buttons. No colour →
  the plain panel header.
* **The open chat's card and a hovered one are a solid tint** of its colour (`.card.active`, `.card:hover`, 55 %), the
  rest keep the gradient wash **under a plain edge** (2026-09-20 evening): only the clauding card, the hovered one and
  the open one wear the colour on their border.
  **ALL** (the flat list, `key: 'all'`) is black in both themes — `BLACK`, through `projColor()` — and so is the
  `acme` folder (`PROJECT_COLORS`). A card in that black is marked `.card.black`: its solid tint is the black
  itself and it borrows the dark theme's inks, because 55 % of black over a light panel is a mid-grey nothing reads on;
  `--ring` turns its clauding light white wherever the card under it is dark (the dark theme, and the tint in either).
* **Clauding cards first, then ready, done last** (2026-09-20), inside each group **by when *you* last acted**
  (`lastUserAt`), newest first; a project ranks by its newest chat. The ascii fish (`.gsep`, a line of `><>` that slides a fish per cycle, phased by the clock so re-renders do not jolt it) swim
  once, between the clauding and the ready cards. A finished job moves its card into the ready group, where its
  last prompt puts it.
* **State lives in three places**: the server's `~/Library/Application Support/peixAIrada/state.json` (done
  ticks, named projects, board titles, pins, the environment each chat was started in; `STATE_FILE` overrides) shared by the app and every browser; the
  browser's `localStorage` `peixairada-prefs` (selected project, filters, widths, zoom, folds, drawer open/height);
  and never `~/.claude`. `renderHead` re-runs on every SSE update — anything it renders reads its state from prefs.

## Hotkeys and the pane

* **`HOTKEYS` in index.html is the whole ⌥⌘ family**: T this chat's zsh tab (`hotShell()` →
  `POST /api/sessions/:id/shell`, a holder running `zsh -l -i` in its folder, `s.shell`), E the VS Code *Web* button
  (edit inline, in the pane; the real VS Code is the header's focus button only, no key), G the chat's PR on GitHub — one opens straight
  away, several open the picker in `pr` mode every time, the one showing marked *current* (no PR → the folder's
  GitHub repo, `state.repos` from `git remote`) —, C this chat's claude session (`termAction()`, the `>_` button's path — arm and take over
  included, focus at the end), P the project picker, K the chat picker (`chat` mode: every ready or clauding chat,
  every project, the list's order, searched by `chatText()`; ⏎ is `openSession`), N a chat as steps of the one
  dialog (`new` → `chats` → `folder` when the project spans several → `env` when `newChatIn()` finds launchers), **O the
  same with the project answered and the environment brought forward** (`hotOracle()` → `newChatIn(cwd, 'chats')` on
  the project `ORACLE` names in `projectList()` — a folder, a pin or a named set; off the board is a `note()`),
  ↑ / ↓ the chat above or below in the list as shown (`hotMove()`),
  ← / → the tab beside in the strip, wrapping (`hotTab()` → `openTab()`, the tab click's path).
  Capture phase, `e.code` (with ⌥ held `e.key` is a symbol). A
  `dialog[open]` swallows them; no chat or no PR is a `note()`. The cog lists every key (`.keys` in `#settings`) —
  keep it in step by hand, with `boardKeys` in main.swift.
* **The pickers match fuzzily, and with something typed the best match leads** (2026-09-21): `fuzzy(fields, q)` —
  each word of the query hunted *within one field* (`chatFields(s)`, which `chatText` joins for the column's literal
  magnifier), letters in order, a run worth more than scattered ones, a word's start worth more than its middle, a
  gap costing; a field's worth falls off down the list, so a name or a branch beats a long prompt a short word
  wandered into. `hunt()` ranks; an empty box leaves every list in its own order. `mark()` bolds what landed
  (`fuzzMarks`), runs merged. **The column's own filter boxes stay literal** — nothing there re-orders, so fuzzy
  would only add noise. → Decisions, 2026-09-21.
* **The last step of the new-chat flow is a list of chats** (2026-09-21): the `chats` step is the scope's ready and
  clauding chats by `byUser` (newest touch first, done ones out) under a ＋ *new chat* row that carries on with the
  flow — `scopeChats()` / `chatsStep()` / `newFromChats()`; it skips itself when the scope has none. ⌥⌘N scopes it to
  the project, ⌥⌘O to *one environment* (`then: 'chats'` rides the `folder` and `env` steps and makes the environment
  a scope instead of the last thing asked). Typing filters the chats only, and moves the selection off ＋ onto the
  first match. A chat's environment is `s.env` — the server's `envs` record, so it outlives the drawer; a chat with
  none shows under ⌥⌘N and under no environment. The `env` step counts what each environment holds — the column's own
  pills, `pillsHtml(envCounts(cwd, name))` — and a card whose chat has an `env` wears it beside the folder name
  (`.chip.env`, borderless, in `--repo`; it forces the card's `.top` row into being in a project column, where there
  is no folder name to sit next to). → `scripts/scenarios/new-chat-flow.mjs`.
* **The project step holds the folders you have no chat in, and clones one you have not got** (2026-09-21): after the
  board's own projects come the folders directly under `ORG_DIR` (`~/acme` — the env name doubles as the GitHub
  organisation, `ORG`) that are on no project (`freeFolders()`, matched by the exact cwd), and a query that names none
  of them is offered last as **＋ clone `<org>/<name>`** (`cloneRow()`, never filtered out, like the chats step's ＋).
  `GET /api/folders` lists them, cached by that directory's mtime and asked on every opening; `POST /api/clone {name}`
  runs `gh repo clone <org>/<name>` into it — **the only thing the board writes outside its own state** — and
  `cloneAndStart()` carries straight on into the same flow in what it cloned. A long path belongs beside the name
  (`.cur`), never in the row's `auto` column: it sizes the track and the name's `1fr` is left with nothing.
  → `scripts/scenarios/new-project.mjs`, Decisions 2026-09-21.
* **The cog's popover is the whole of the board's settings** (2026-09-21): the plan usage at the top, half again
  the size of the rest, and the keys under it — nothing else. It opens on *hover of `#pfoot`*, the strip's footer,
  which reaches the window's bottom left pixel; a click on the cog pins it, Esc or a click away closes it. The fish
  is only the SSE light now. `sound`, `showAll`, `toolsMode` and `foldCode` keep whatever they were saved as and
  nothing sets them — the chat header's `{ }` is still the fold for a chat.
* **In the app the pane is a native view** over the chat column with its own web views: a key pressed there never
  reaches the page, so `installHotkeyForwarder()` forwards ⌥⌘ + the letters and the arrows (`hotkeyCode()`, the page's
  `e.code`) to `window.peixKey`; the shell
  reports `peixPane(visible, left)` so the picker opens beside the pane (`.aside`) and asks for the keyboard
  (`{type:'focus'}`). Esc with the pane up is forwarded as `peixKey('Escape')` (a local monitor swallows it, so full
  screen keeps it) — `hotEscape()`: a dialog or the settings popover closes first, else the chat tab comes back.
  **With the pane hidden, Esc is the page's**: a capture-phase handler closes an open dialog or popover itself and
  `preventDefault()`s, so WebKit reports the key handled — an unhandled Esc (a `<dialog>`'s own does not count) climbs
  to the window, which in full screen leaves it. With nothing to close the key is untouched (the filter boxes, the
  rename box, full screen keep theirs).
* **The page owns the tabs** (2026-09-20, late): `#ptabs` lists `chat` (`claude` while the session runs here), `shell`
  while a zsh lives, `gh:<url>` per GitHub page the chat opened and `ide:<url>` for its folder's editor — `tabKeys()`
  from `state.paneGh` (per chat) and `state.paneIde` (per folder); `tabs` holds each chat's tab, and one whose page is
  gone falls back to the chat. `syncTerm()` keeps the body right and posts one `{type:'pane', id, keys, show, left,
  top}` to the shell (`postPane`, again when the geometry moves): it keeps a web view per page (`paneViews`, up to
  `paneViewsMax`, the chat's own spared), shows `show` or hides, and sits over the chat column below the strip.
  `‹ › ↻ ↗` in the strip are `{type:'nav'}`; × forgets a page (`closeTab`). In a browser the tabs are chat and zsh
  only (`inApp`). GitHub cannot be iframed, hence the second `WKWebView`; a web view with no UI delegate drops
  `target=_blank`, hence `PrPaneDelegate`. → Findings: *the pane*.
* **A page in the pane behaves like a browser tab** (2026-09-21): **⌘R** reloads *it* while the pane is up (the
  board otherwise — the View menu's item renames itself in `validateMenuItem`), **pinch zooms** it
  (`allowsMagnification`, off by default in a WKWebView), and **its address sits in the strip**, scheme stripped,
  a click copying the whole URL (`copyPaneUrl`). The address is the shell's word: a KVO watch on each view's `url`
  (`paneObs`) reports every navigation as `peixPaneUrl(key, url)`, kept per key in `paneUrls` — so a tab switch,
  and a board reload (the shell re-sends on every `pane` message), keep it. → Decisions, 2026-09-21.
* **⌘F finds on that page** (2026-09-21), the Edit menu's *Find… · Find Next · Find Previous* (⌘F · ⌘G · ⇧⌘G),
  greyed out with the pane down — the board keeps its filter boxes and pickers. The bar is native (`buildFindBar`,
  a `NSVisualEffectView` over the pane's **top right**, in `content` above the pane so a web view made later
  cannot cover it) and drives WKWebView's own `find(_:configuration:)`: no match count, the match *is* the page's
  selection, so closing the bar drops it (`kDropSelection`). Typing searches from the top of the document
  (`runFind(fromTop:)` clears the selection first), ⏎ / ⇧⏎ step from the field — the Esc monitor takes both keys
  while `findOn`, so Esc closes the bar instead of reaching the page — and a miss turns the text red. A pane
  change closes it (`closeFind(focusPage: false)`); `findQuery` outlives it, so ⌘G opens it again on the same
  words. → Decisions, 2026-09-21.
* **Both web views are inspectable** (main.swift sets it): Safari → Develop reaches the real app.

## The drawer

* **A drawer is a holder** (`lib/termhold.mjs`): a detached process that owns the PTY (node-pty, `zsh -l -i -c
  'exec claude …'`) and the exact screen (`@xterm/headless` + serialize), listening on `<state dir>/terms/<id>.sock`
  — newline-delimited JSON: `in`, `resize`, `snap`, `clear`, `kill`, `quit`, `meta` in; `hello`, `out` (with `seq`),
  `snap` (with `upto`), `clear` (with `seq`), `exit` out. The server connects, proxies pages (`attachTermSocket`), adopts holders on boot
  (`adoptHolders`), and tells a holder its session id once the registry reveals it. An exited holder lingers
  `TERM_LINGER_MS` with its last screen, then removes its files. The socket path must stay under 104 bytes — test
  state dirs are short on purpose.
* **The drawer is automatic** (2026-09-20): it is the pane's body while the chat runs here and goes when the process
  exits (`termEnded`) — no header, no hide/end/show-chat, no split; `syncTerm` on every open and update. **⌥⌘T is
  a zsh tab** beside it: a holder with `shell: true` (`zsh -l -i` in the chat's folder; `shellOf()`, `s.shell` on the
  summary, one per chat, `exit` or the tab's × ends it); `#ptabs` shows while there is more than the chat (a zsh, a
  page in the pane), and the tab a chat is on is page state (`tabs`). **Done ends the chat's processes** — the drawer's holders and a claude live elsewhere
  (SIGTERM) — from the `done` route.
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
* **⌘K clears the terminal** (2026-09-20), the key Terminal.app and iTerm have and xterm.js does not: the page asks
  the holder (`clearTerm()` → `{t:'clear'}`), the holder clears the screen *it* serializes and echoes the clear back,
  and that echo is what wipes every page on that drawer — so a re-attach and a server restart stay clear. A nudge
  follows, to make whatever runs repaint into the empty screen. ⌃L is still the shell's own, scrollback and all.
* **Shift+Enter is a newline**: the drawer sends `ESC CR` itself (what `/terminal-setup` binds in VS Code) and
  swallows the keypress too. `macOptionIsMeta: true`. → Findings: *Shift+Enter*.
* **⌥ over a digit or a punctuation key types what macOS composed** (2026-09-20): `macOptionIsMeta` reads every
  ⌥ chord as Meta, and a Portuguese layout lost its `@` (⌥2). The same handler sends `e.key` — the composed
  character — for the codes in `ALT_COMPOSES`, and leaves ⌥+letter to Meta, where readline and ⌥Enter want it.
  → Findings: *⌥ is a compose key too*.
* **The chat header's ◎ button types `/focus`** into that chat's holder (2026-09-20) — Claude Code's focus view, which
  has no key and no API: `toggleFocusView()` sends the command, then reads the newest `Focus view enabled|disabled`
  line off the drawer's screen (`focusSaid()`) and lights `#viewBtn` from *that*; `focusView` (page state, dropped in
  `termEnded`) is only what the session last said. **Every attach reads that line too** (`readFocusFromScreen()` from
  `ws.onopen`, polling while the snapshot is still being written), so a `/focus` typed in the drawer by hand is picked
  up; a session that never printed one — `"viewMode": "focus"` in settings, or the line scrolled past — leaves the
  button as it was. The button shows while `termLive(s)`; on the zsh tab it shows the
  claude session instead of typing into a shell. The fake claude answers `/focus` with the same line — `scripts/scenarios/focus-view.mjs`.
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
* Inline code gets a tint, never a border; card glyphs are inline SVG, not emoji; the working ring is the project's
  colour — `--ring`, which only a card too dark to show it (`.card.black`) overrides, with white.
* `PROJECT_ICONS` (index.html) marks a project by its shown name wherever the name is written — oracle's crystal ball;
  `projIcon(name)` goes before the name in the strip, the column, the chat list's header, the chat header, the cards, the pickers.
* Code folds per chat: `prefs.foldBy[id]` (the header's `{ }` button) over `prefs.foldCode`, which has no control now; `foldOn(id)` is the one
  rule, used by `md()`. Claude Code cannot fold the code it prints in the drawer — ctrl+o is tool output only.
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
* xterm parses what it is written on its own schedule: read or wipe a screen through `write('', cb)`, never straight
  after a `write()` — the snapshot does, and so does the clear, or the unparsed tail paints itself back over it.

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
  `assert`. The eleven in `scripts/scenarios/` are the regression checks for the drawer (re-attach, restart,
  geometry, `/clear`, ⌘K, the focus-view button, ⌥ as a compose key), the hotkeys, the tab strip, the new-chat flow
  and the project step's folders. `meta.env` goes to the throwaway server — a scenario that reads a directory of the
  machine's (`ORG_DIR`) points it at one of its own, so it does not depend on what `~/acme` happens to hold.
* **Test against the fake claude, not real chats**: `scripts/fakeclaude.mjs` via `CLAUDE_BIN` (the test server's
  `fake: true`) is instant and touches nothing. A test against the real `~/.claude` (read-only, `claudeDir` unset)
  must use a stale chat and `DELETE` the terminals it made.
* **Two measurement traps** (2026-09-20): Claude Code stops rendering while the terminal reports focus lost — a
  headless page's `focus()` is not a focus without `Emulation.setFocusEmulationEnabled` (the runner sets it); and a
  chat switch as a re-attach resizes the drawer by itself (the other chat's reply box) and masks results — ⌥⌘T then
  ⌥⌘C (the zsh tab and back) is the clean re-attach.
* **The fake claude scrolls before it repaints on a shrink** (`drawLive`, 2026-09-20 late), as a terminal app would:
  before that the strip's two rows made it erase its own banner on re-attach, and the scrollback check in
  `drawer-reattach` failed for a fixture reason. A red drawer scenario can be the fake's geometry, not the drawer's.
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
