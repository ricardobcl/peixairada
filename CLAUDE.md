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
npm run scenarios                   # all of them, one at a time, with a verdict (~60 s); `-- drawer` narrows it
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
| `lib/refit.mjs` | Resizing a terminal so a grow pulls the scrollback back down (the holder's copy; the page keeps its own) |
| `public/index.html` | The frontend, one file, no build step: chats · chat (one half or two), the drawer, the transcript renderer. A section map at the top of its script |
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
| Waiting on the user | **the registry's `status: "waiting"`** — every interactive claude rewrites its `sessions/<pid>.json` on each change of state (`busy` · `idle` · `waiting` · `shell`), with `waitingFor` (`input needed` for an AskUserQuestion — measured; `permission prompt` for a tool's approval; `sandbox request`…) — `waitingOn()` / `statusOf()`; any live process on the chat waiting is the chat waiting, and it beats the agents. **`dialog open` is not asking** (`NOT_ASKING`, Ricardo's call): mostly a /model or /config you opened yourself. **The transcript cannot say it** (2026-09-22): the line that asks is written *with its answer*. It is only the fallback for a claude that reports no status: a pending `AskUserQuestion` / `ExitPlanMode`, whose question is `s.ask` (tool, text, options); otherwise the card says what the registry waits on (`ask.waitingFor`). The flip into waiting is the `needs-input` alert (`loadRegistry`) |
| Work behind the turn | `Monitor` and a `Bash` with `run_in_background` leave a task running: the tool_result names it (`Monitor started (task …`, `Command running in background with ID: …`) and `<task-notification>` lines carry its events and, with a `<status>`, its end. `s.tasks` → `tasks` on the summary; a task dies with the claude that started it (`live.startedAt`), at its expiry (`MONITOR_MS`, `TASK_MAX_MS`), or with the chat's process. **A completion notice delivered mid-turn never becomes a line at all**, so a background command is also asked about directly: `taskGone` runs `lsof -t` on the output file the tool_result named (the harness holds it open until the command exits) and `sweepTasks` lets go on the registry poll, after `TASK_GRACE_MS` and never on lsof's own failure |
| Titles | board title (state file) › `custom-title` › the oldest still-open PR › `ai-title` › last prompt — `summary()`, `prTitle()` |
| PRs mentioned | `pr-link` lines *and* GitHub pull URLs in user/assistant text; most recently mentioned first; `gh api graphql` batched for state and title (one of the two network calls) |
| Plan usage (the chat list's footer) | `GET https://api.anthropic.com/api/oauth/usage` with Claude Code's own OAuth bearer from the keychain item *Claude Code-credentials*; `USAGE=off` disables; the token never reaches the page. → Findings: *plan usage* |
| Permission prompts | the registry's `waiting` (above) — they never reach the transcript; hooks are no longer needed for them |
| Chat from the board | a holder runs `claude --resume <id>` or `claude` in the chat's cwd through an interactive login zsh (mise's PATH); it registers like any CLI run; a new chat is tied to its session by pid. **A folder whose Taskfile launches claude** (a task whose description mentions Claude — oracle's `task production-workload`…) starts new chats as `task <name>` instead: `GET /api/launchers?cwd=` lists them (`task --list --json`, cached by the file's mtime, `TASK_BIN` overrides), `POST /api/terminals {cwd, task}` checks the name against that list; claude is then a *descendant* of the PTY's pid, found through `ps` (`linkTermToRegistry`, `t.claudePid`), which is also where the launcher's name is written down for good (`noteEnv` → `envs` in the state file → `s.env`, what ⌥⌘O scopes by). A resume never goes through task. **`/clear` (or `/resume`) in the drawer** gives that pid a new session id — the registry file says so — and `linkTermToRegistry` moves the holder to it and pushes **both** chats, the one it joins and the one it leaves (2026-09-22: only the first was told, so the old card kept a drawer that had moved on); the page follows the holder to whatever chat it runs (`terminal` event → `openSession`), the old chat is a stale card |

**Never written: anything under `~/.claude`.** The board is read-only against Claude Code's data. The fake claude
refuses to run against the real directory for the same reason.

## The board

* **Two columns** (2026-09-24; a projects column before): the selected project's chats → the chat. **The chat list's
  head is the project filter's whole cue** — the fish (the SSE light), then `#stitle`: the project's square, name and
  ▾, a click being ⌥⌘P's picker, and × back to ALL on any other project; the list's edge and the head's tint are the
  project's colour. **The head is one row** (2026-09-24): `#filters` — the magnifier, whose box takes the chips'
  place while open, and the state chips, a dot and a count (the word from 600 px of list, the count gone under 340;
  `#sessions` is a size container) — then ＋ (`#newChatBtn`: one folder starts it, several ask which, ALL is ⌥⌘N's
  flow) and «. The name is what gives way, which is why the list's minimum is 300 px. The square there is only a colour; the colour picker is the chat header's. On the
  rail the head keeps the fish and the square. ⌥⌘P's rows carry what the column's did: ✎ on a named project (the
  editor) and ＋ new project, last and never filtered out. → `scripts/scenarios/project-cue.mjs`. A chat is *ready ·
  clauding · done*: done is the tick only, clauding is `working`, ready is everything else (`bucket()`); the
  server keeps the finer `status` for notifications and the badge. → Findings: *The board and its state*.
* **The card's edge is one ring with four readings** (2026-09-21): `--lit` is what runs in it, `--seg` how much of
  the edge one light owns (`100% / --lights`, one light per sub-agent), `--spins` how fast. Clauding is the project's
  colour; **watching** (`s.tasks` — a monitor or a background command still running, see *How it reads Claude Code*)
  is one light in `--watch`, slowly, and can sit on a *ready* card; **asking** (`needs-input` while alive — the registry's `waiting`) has **no
  ring at all** — the card's own border blinks red (`@keyframes blink`, two hard states), the one signal that is not
  motion around the edge, because a question is the one state that is *stopped* (2026-09-22) — with the question and
  its answer count on the card
  (`askHtml`). The three CSS rules are in priority order — work beats a monitor, a question beats both — **and each
  sets every variable**, since a card can be two of them (clauding with a monitor) and what a rule leaves out the
  earlier one keeps. The
  chips beside the title say the numbers (`N agents`, `monitor`). → `scripts/scenarios/card-signals.mjs`,
  Decisions 2026-09-21 and 2026-09-22.
* **Folded (⌘B), the chat list is a rail of squares** (2026-09-22): one per chat, the project's short name
  (`projAbbr`, `PROJECT_ABBR` for the ones the rule gets wrong) on a solid tint of its colour, and the card's own
  edge — so clauding, the agents' count, a monitor and a question all still read from the rail. Everything inside
  the card is `display: none` there; `.abbr` is the only child left standing, and it carries the hover tooltip.
* **A project is a folder** (the registry's `cwd`, never the transcript's — that one moves with `cd`) **or a
  named set of folders** (state file); worktrees under a repo count as the repo. **Pinned projects** head the
  pickers (`state.pins`, a `pins` event) — nothing on the page sets them since the column went; `PUT /api/pins`
  still does. Folder projects exist only through their sessions.
  **✕ on a row of ⌥⌘N hides a project** (2026-09-22): its key — a cwd or `c:<id>`, the pins' own spelling — goes to
  `hidden` in the state file (`PUT /api/hidden`, the whole list, a `hidden` event) and `projectList()` and
  `freeFolders()` skip it, so it is on no picker and no pin. **Its chats are untouched** and still show
  under ALL: hiding tidies the index, it does not throw work away. The cog lists what is hidden with a *show*
  beside it, and starting a chat in a hidden folder puts it back (`newChat`).
* **A project's colour is Peacock's** — `pollPeacock()` reads the nearest `.vscode/settings.json`
  at or above every folder it knows, stopping short of `$HOME`; the board can *set* it (`PUT/DELETE /api/peacock`,
  a text edit of the JSONC, tested). No colour → `--nocolor`, unless the folder is named in `PROJECT_COLORS` (by its
  shown name, like `PROJECT_ICONS`): `acme` is the board's own `BLACK` (2026-09-20). Peacock still wins where it
  speaks. The chat header's colour square is the picker (`#colorInput`).
* **The chat header is a gradient of the project's colour** (2026-09-20): `tintChat()` sets `--repo`, `--rink`,
  `--rover`/`--rover2` and `#chat.tinted`; `--rink` is the ink that reads on it, white or near-black by Peacock's own
  brightness rule (`inkOn()`), and every control in `.shead` is redrawn in it; the veils (`--rover` across, `--rover2`
  down) pull the colour *away* from that ink towards the bottom right, so contrast holds at the buttons. No colour →
  the plain panel header. **The colour square sits beside the project's name there too** (2026-09-22) — the same
  `.sq.pick`, so the same picker and the same ⌥-click — inked only while the pointer is in the header; it keeps its
  place in the row always, so nothing moves under the pointer. `colorAt` remembers which header the picker was
  opened from, so the answer (`note`) pops up by the square that was clicked.
* **The chat header's row is the title, the PR chips, a task's chip and ···** (2026-09-24): every button it had —
  `#termBtn`, `#viewBtn`, `#webBtn`, `#focusBtn`, `#foldBtn`, `#detailsBtn` (the state dot and its age), the VS Code
  mark — is a row of `#hmenu`, keeping its id, so the hotkeys (`hotVsCode` clicks `#webBtn`) and the harness still
  reach them, and `.click()` works on a closed menu. `#hmenu` is a **non-modal `<dialog>`**, static in the markup:
  `postPane` lowers the pane while it is up (a web view would cover it), Esc closes it like any dialog, and
  `runHotkey` closes it rather than let it swallow the key. Toggles leave it up (the click-outside test goes by
  `composedPath()`, since the redraw detaches the row that was clicked); actions that go somewhere close it. **`>_`
  comes back into the row while armed or failed** — a warning under a fold is none — and a note about a folded
  button is anchored at ··· (`seen()`). → `scripts/scenarios/head-menu.mjs`.
* **The chat's PRs are chips in the header row, folded** (2026-09-24): `#prToggle`, one button of the cards' chips
  (`.hpr` shares `.cpr`'s rule; every PR is drawn, and `fitHeadPrs()` folds the last ones into `+n` only while the
  row would leave the title less than its repo name plus `TITLE_ROOM` — on every draw and on the header's
  `ResizeObserver`; → `scripts/scenarios/header-prs-fit.mjs`), toggles `#prlist` — the rows, one per PR — under the
  header; `prefs.prsOpen`, the board's and not the chat's. The rows are rendered folded too (`#prlist` hidden), so
  ⌥⌘G and the harness still read `#prlist .prrow`. On a tinted header the chips sit on the panel, so a state's
  colour reads on any project's; taller (20 px) than the cards', edged in 1 px of the state's colour at 85 % (`--prb`), on a wash of the
  state's colour (`--prc`, set by the shared state rules; `--prg` per theme, stronger on the dark panel). → `scripts/scenarios/header-prs.mjs`.
* **A card comes in three sizes, the cog's slider** (2026-09-25, `#cardsSize`, `prefs.cards`): *large* — your last
  prompt and Claude's last reply, as always —, *medium* the last word only, *compact* neither. `cardHtml` always
  writes both `.snip`s and marks the older one `.older` (Claude's reply is the last word when `lastReplyAt ≥
  lastUserAt`, which an answer or an Escape also moves); CSS hides by `#sessions[data-cards]`, so the slider
  re-renders nothing. The question line (`askHtml`) is neither word and shows at every size.
  → `scripts/scenarios/card-sizes.mjs`.
* **The open chat's card and a hovered one are a solid tint** of its colour (`.card.active`, `.card:hover`, 55 %), the
  rest keep the gradient wash **under a plain edge** (2026-09-20 evening): only the clauding card, the hovered one and
  the open one wear the colour on their border.
  **ALL** (the flat list, `key: 'all'`) is black in both themes — `BLACK`, through `projColor()` — and so is the
  `acme` folder (`PROJECT_COLORS`). A card in that black is marked `.card.black`: its solid tint is the black
  itself and it borrows the dark theme's inks, because 55 % of black over a light panel is a mid-grey nothing reads on;
  `--ring` turns its clauding light white wherever the card under it is dark (the dark theme, and the tint in either).
* **A chat waiting on your answer first, then clauding, then ready, done last** (`RANK` / `rankOf`, the asking
  step added 2026-09-21), inside each group **by when *you* last acted**
  (`lastUserAt`), newest first; a project ranks by its newest chat. The filters and every count still go by
  `bucket()`, where an asking chat is a ready one — only the order knows the difference, in the list and in ⌥⌘K. **Rules of ascii fish** (`.gsep`): `><>` swimming right between the clauding cards and the ready ones — one fish
  per cycle, phased by the document clock so a re-render does not jolt it; `school()` builds it as a kept node and
  `fishHtml(cls)` is its stand-in — and a still line **under every run of cards from one day** (2026-09-23,
  `dayHtml()`, plain markup since nothing on it moves): the day centred — `today`, else `DD-MM-YYYY` (`dayName()`, by
  `userAt`) — with `<><` either side, each fish its own item in a one-line wrapping row so none is cut in half. A
  day's line closes the cards *above* it, so the oldest day in the list gets one at the bottom; the list is grouped
  first, so a day can come back (a done card from today after older ready ones) and each run gets its own line.
  → `scripts/scenarios/day-separator.mjs`. A finished job moves its card into the ready group, where its
  last prompt puts it.
* **The list's two ends count the cards out of sight** (2026-09-25): `#sup` / `#sdown` (`.sedge`), laid over the
  list's own grid cell — so `#slist` has a definite `grid-column` too — a pill on a fog of `--bg`; a card is out of
  sight when its *middle* is past the visible edge (`drawEdges()`, by `offsetTop`, hence `#slist { position:
  relative }`). A dot: red when one out there is asking, amber when clauding. A click scrolls a screenful.
  `listChanged()` redraws once a frame, on scroll, after `renderSessionList`, on the list's `ResizeObserver` and
  from `applyCards` (the slider changes heights under the same scroll). An end that is off keeps its words while it
  fades — read it as zero. → `scripts/scenarios/list-ends.mjs`.
* **The timeline is the list's scrollbar, with the days on it** (2026-09-25): `#tline`, the first of `#sessions`' two
  columns (26 px, the track 21.5 px in — under the fish's middle and the cog's), row 2 only; the native scrollbar is
  hidden while it shows, and it is `display: none` on the rail of squares. **To scale**: the rail's inner height is
  the list's `scrollHeight`, so a tick is where its run starts in the list and the thumb is the window. A run
  (`tl.runs`, built in `renderSessionList`, none under a query) is one day *and* one state group in a row, so today
  can come back under the done cards. **The Dock's swell is a fisheye** (`tlWarp`, Sarkar–Brown, radius `TL_R`)
  applied to everything drawn, around the pointer, which stays a fixed point — so a drag reads the list's position
  straight off the pointer (`tlScrub`, holding the thumb where it was grabbed). Every day's label comes out, the
  nearest largest (`TL_MAX`, 1.4), overlaps culled nearest-first; a pane of glass goes over the list (`.tl-glass`,
  in the list's cell under the ends and the rail, `backdrop-filter` blur + a wash of `--bg`, `#sessions.tlon`). The swell is by the
  clock (`tlAnimate`, `tl.k` linear, `tl.K` eased) — headless Chrome's frame rate is slow and a per-frame ease stalled.
  A label clicked scrolls its run under the top pill; a wheel over the rail scrolls the list; scrolling elsewhere
  shows the top run beside the thumb (`tlBubble`). `peix.state().timeline` has `k` and the runs.
  **What counts as the rail is `.tl-catch`**, under everything on it: from x = 0 of the window (over the list's
  coloured edge, as `#pfoot` is) and, while the days are out, as far right as a label has reached plus 28 px
  (`tl.reach`, a high-water mark until the swell is back in) — so a gap between labels never closes it. A press
  there (right of the strip, on no label) is a press on the label ringed `.near`.
  → `scripts/scenarios/timeline.mjs`.
* **The plan usage is the chat list's footer** (2026-09-24): `#usage`, the fourth row of `#sessions`. Open, a row
  per window — name, a bar in `--spend` (orange; red from 90 %, `uColor`), a tick where the window's clock stands
  (`uPace`, only for the windows whose length `uSpan` knows), percent, time to reset; folded (`prefs.usageFolded`,
  the heading or the chevron), one line of rings, 34 px with the cog's cell beside it (`#pfoot`, in `#sfoot`; no
  rule between them and no border on the cog — the cell's hover wash is its only outline);
  on the rail, the rings stacked with the percent inside and the cog under them. **The markup holds both shapes**
  and CSS picks (`.folded`, `main.scompact`), so ⌘B re-renders nothing. `loadUsage()` on load, every `USAGE_EVERY_MS` while visible, once a
  window's reset has passed, and on the way back to a hidden page, **backing off on failures** (a refused keychain
  prompt would come back every two minutes otherwise); a failure keeps the last numbers, `.stale`. The server's
  `USAGE=off` answers `off: true` and the bar hides — every test server. → `scripts/scenarios/usage-bar.mjs`.
* **State lives in three places**: the server's `~/Library/Application Support/peixAIrada/state.json` (done
  ticks, named projects, board titles, pins, the environment each chat was started in, notifications on or off; `STATE_FILE` overrides) shared by the app and every browser; the
  browser's `localStorage` `peixairada-prefs` (selected project, filters, widths, zoom, folds, card size, drawer open/height);
  and never `~/.claude`. `renderHead` re-runs on every SSE update — anything it renders reads its state from prefs.

## Hotkeys and the pane

* **`HOTKEYS` in index.html is the whole ⌥⌘ family**: T this chat's zsh tab (`hotShell()` →
  `POST /api/sessions/:id/shell`, a holder running `zsh -l -i` in its folder, `s.shell`), E the VS Code *Web* button
  (edit inline, in the pane; the real VS Code is the header menu's *open in VS Code* only, no key), G the chat's PR on GitHub — one opens straight
  away, several open the picker in `pr` mode every time, the one showing marked *current* (no PR → the folder's
  GitHub repo, `state.repos` from `git remote`) —, C this chat's claude session (`termAction()`, the `>_` button's path — arm and take over
  included, focus at the end), P the project picker, K the chat picker (`chat` mode: every ready or clauding chat,
  every project, the list's order, searched by `chatFields()`; ⏎ is `openSession`), **F the chat list's own box**
  (`hotFind()` → `qShow(true)`, the rail unfolding first — the magnifier, matched like K, below), N a chat as steps of the one
  dialog (`new` → `chats` → `folder` when the project spans several → `env` when `newChatIn()` finds launchers), **O the
  same with the project answered and the environment brought forward** (`hotOracle()` → `newChatIn(cwd, 'chats')` on
  the project `ORACLE` names in `projectList()` — a folder, a pin or a named set; off the board is a `note()`),
  ↑ / ↓ the chat above or below in the list as shown (`hotMove()`),
  ← / → the tab beside in the strip, wrapping (`hotTab()` → `openTab()`, the tab click's path).
  Capture phase, `e.code` (with ⌥ held `e.key` is a symbol). A
  `dialog[open]` swallows them; no chat or no PR is a `note()`. The cog lists every key (`.keys` in `#settings`) —
  keep it in step by hand, with `boardKeys` in main.swift.
* **Plain ⌘ is the window's shape, and lives in `CMDKEYS`** (2026-09-22): **B** folds the chat list to a rail
  (`toggleSessions`, the « button's switch), **1** and **2** the left and right halves of the chat column —
  ⌘2 splits it the first time —, **W** closes the half the keys are in, or a dialog that is up, **0** closes the
  *other* half so the one the keys are in is the column (`hotOnlyHalf`; with one half it is still the chat's size
  back to normal, ⌘0's older meaning — see *The chat column's two halves*). The modifier is the distinction: ⌥⌘ is
  "this chat, over there", ⌘ alone is "this window, this shape". `peixKey(code, mods)` carries which map and
  **returns whether the key was taken**; `cmdKeys` in main.swift is the forwarder's copy of this list — a digit
  goes over as `Digit<n>`. ⌘K is *not* here (the drawer's clear) and neither are ⌘+ ⌘− (`chatZoomKey`, which sees ⌘0 only when nothing is split).
* **⌘W is the Window menu's item, not the forwarder's** (2026-09-22): a key equivalent is dispatched before any
  responder, so the page never sees ⌘W in the app. `closeHalfOrWindow` asks the board (`peixKey('KeyW','cmd')`)
  and calls `performClose` only when it answers false. Anything else the board wants to take off ⌘-something that
  a menu item already claims has to go the same way.
* **The pickers match fuzzily, and with something typed the best match leads** (2026-09-21): `fuzzy(fields, q)` —
  each word of the query hunted *within one field* (`chatFields(s)`), letters in order, a run worth more than
  scattered ones, a word's start worth more than its middle, a gap costing; a field's worth falls off down the list,
  so a name or a branch beats a long prompt a short word wandered into. `hunt()` ranks; an empty box leaves every
  list in its own order. `markHits()` bolds what landed (`fuzzMarks`), runs merged. → Decisions, 2026-09-21.
* **The chat list's magnifier matches the same way, and ⌥⌘F opens it** (2026-09-25; literal before, on purpose):
  `renderSessionList` scores each chat with `fuzzy(chatFields(s), q)` and, with something typed, sorts by the score
  (the board's order breaking ties) and **draws neither the fish nor the day lines** — they say where a state or a
  day ends, and the order is the match's now. The title and the folder name are bolded (`markHits`, underlined on
  a card). ↑↓ in the box walk a `.qsel` card, ⏎ opens it (`openSession`, then `focusTerm`) and keeps the query; the
  mark shows only while the box has the keyboard (`markQsel()`, on every render). What it has over ⌥⌘K: done chats,
  the project in view and the state chips still apply. → `scripts/scenarios/chat-filter.mjs`.
* **The last step of the new-chat flow is a list of chats** (2026-09-21): the `chats` step is the scope's ready and
  clauding chats by `byUser` (newest touch first, done ones out) under a ＋ *new chat* row that carries on with the
  flow — `scopeChats()` / `chatsStep()` / `newFromChats()`; **it shows even when the scope has none** (2026-09-22):
  ＋ alone, so ⏎ starts a chat and esc walks away — skipping the step ran the next one straight into a spawning terminal. ⌥⌘N scopes it to
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
* **The cog's popover is the whole of the board's settings** (2026-09-21): **the notifications switch**
  (2026-09-23, `#notifyOn`), **the cards' size** (2026-09-25, `.dens`, above) and the keys — nothing else; the plan usage left it for the chat list's footer
  (2026-09-24, below). It opens on *hover of `#pfoot`*, the cog's cell in the chat list's foot, which reaches the
  window's bottom left pixel — **drawn over the list's 4 px coloured edge** (`margin-left: -4px`, the edge carried on
  its own border), because the edge is not the cell; a click on the cog pins it, Esc or a click away closes it, and
  it opens beside the cell (`settingsOpen`). The fish is only the SSE light. `sound`, `showAll`, `toolsMode` and `foldCode` keep whatever they were saved as and
  nothing sets them — the `{ }` row under the chat header's ··· is still the fold for a chat.
* **In the app the pane is a native view** over the chat column with its own web views: a key pressed there never
  reaches the page, so `installHotkeyForwarder()` forwards ⌥⌘ + the letters and the arrows, and ⌘ + the layout
  keys (`hotkeyCode()`, the page's `e.code` and which map), to `window.peixKey`; the shell
  reports `peixPane(visible, left)`, which the board only reports on now — **a dialog open lowers the pane**
  instead of dodging it (2026-09-22), so every picker is centred: `postPane` sends no page while a `dialog[open]`
  exists, and every dialog's `close` puts it back. Esc with the pane up is forwarded as `peixKey('Escape')` (a local monitor swallows it, so full
  screen keeps it) — `hotEscape()`: a dialog or the settings popover closes first, else the chat tab comes back.
  **With the pane hidden, Esc is the page's**: a capture-phase handler closes an open dialog or popover itself and
  `preventDefault()`s, so WebKit reports the key handled — an unhandled Esc (a `<dialog>`'s own does not count) climbs
  to the window, which in full screen leaves it. With nothing to close the key is untouched (the filter boxes, the
  rename box, full screen keep theirs).
* **The page owns the tabs** (2026-09-20, late): each half's strip lists `chat` (`claude` while the session runs here), `shell`
  while a zsh lives, `gh:<url>` per GitHub page the chat opened and `ide:<url>` for its folder's editor — `tabKeys()`
  from `state.paneGh` (per chat) and `state.paneIde` (per folder); `tabs` holds each chat's `[left, right]`, read back
  through `placeOf()`, and one whose page is gone falls away. `syncTerm()` keeps both bodies right and posts one
  `{type:'pane', id, keys, panes:[{key,left,top,width,height}], focus}` to the shell (`postPane`, again when the
  geometry moves; `show`/`left`/`top` repeat the first pane for a shell built before the split): it keeps a web view
  per page (`paneViews`, up to `paneViewsMax`, the chat's own spared) and places each one in its half. **The overlay
  covers the whole window** and lets a click that lands on no page through (`PaneOverlay.hitTest`) — that is what lets
  both halves hold a page at once; ⌘F's bar is placed from the focused page's rect, so it follows ⌘1 / ⌘2.
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

## The chat column's two halves

* **⌘2 splits the chat column, ⌘1 / ⌘2 are the halves** (2026-09-22): each has its own tab strip and body, and both
  pick from the *one* open chat's tabs — its claude session or transcript, its zsh, its GitHub pages, its editor.
  The left half keeps the plain ids (`#ptabs`, `#term`, `#termBody`, `#log`): it is the whole column while nothing
  is split, and the harness reads it by those names. `GEL` maps each half to its elements, `terms[g]` owns that
  half's xterm and socket, and the take-over state (armed, failed) is the board's `drawer`, not a terminal's.
* **A tab that is new opens in the second half, and splits the column the first time** (2026-09-22): `openNewTab()`
  — a zsh (⌥⌘T), a GitHub page, the editor — because what a second tab is for is standing beside the chat, not
  replacing it. **Claude keeps the first half** (2026-09-25): every split puts the chat on the left whatever the
  column was showing (`splitChat()`, ⌘2's path too), a new tab goes into the half the chat is *not* in, and Esc,
  ⌥⌘C and the ◎ row take the keys to the chat where it stands (`showChat()`) instead of moving it into the half the
  keys were in. Choosing a tab that
  already exists (a click, ⌥⌘←→, ⌥⌘G on a PR already open) is `openTab()` and never splits. The split the board
  makes itself is remembered in `autoSplit` and **folds back on its own** when the chat is down to one tab again
  (`syncTerm`) — the empty half is what ⌘2 asks for, not what a zsh's `exit` should leave behind.
* **A tab lives in exactly one half, and split, each strip lists only its own** (2026-09-25): one transcript element,
  one xterm per half, one web view per page. `homes` says which strip a tab is in — the chat's left, every other
  right (`homeOf`), written down only for a tab that was **dragged across** (`moveTab`, pointer events so a drop
  over the app's native pane still lands; a press that moves under 5 px is a click) and forgotten with the split.
  `keysIn(s, g)` is a strip's list; choosing a tab (`setTab`) shows it in *its* half and takes the keys there —
  nothing trades places any more. ⌥⌘←→ walk both strips as one row. An auto split whose half empties folds.
* **Placement is derived**: `tabs` holds `[left, right]` per chat and `placeOf(s)` reads it against `keysIn` *now*
  — a key that is gone falls away and its half shows the first of its own left, or nothing. `tabOf(s)` is the
  focused half's. A half with nothing says what would fill it (`.gempty`) and its strip takes a drop (`.pdrop`).
* **The transcript moves, it does not multiply**: `placeLog()` reparents `#log` into the half holding the chat tab
  (scroll position carried by hand) and hides it under a live drawer; with no half showing it, it is parked in the
  left one, hidden.
* **Split or not is the chat's** (2026-09-22): `splits`, a set of chat ids beside the `tabs` map and lasting as
  long as it does — a PR beside its terminal is for the review you are doing, not for every chat you then open.
  `syncTerm` calls `applySplit()` on every open, so the column follows whichever chat is in front; only the
  divider's place is the board's (`prefs.splitAt`), like the column widths.
  **⌘W closes the half the keys are in**, and each strip's ⨯ closes *its own* half (`closeHalf(g)`): what the
  column keeps is the other half's tab, or the closer's when the other had none. **⌘0 is the mirror** (2026-09-22):
  it closes the *other* half, so the tab under the keys is what stays.
  → `scripts/scenarios/split-halves.mjs`, the split section of `pane-tabs.mjs`, Decisions 2026-09-22 and 2026-09-25.

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
* **The chat header menu's ◎ row types `/focus`** into that chat's holder (2026-09-20) — Claude Code's focus view, which
  has no key and no API: `toggleFocusView()` sends the command, then reads the newest `Focus view enabled|disabled`
  line off the drawer's screen (`focusSaid()`) and lights `#viewBtn` from *that*; `focusView` (page state, dropped in
  `termEnded`) is only what the session last said. **Every attach reads that line too** (`readFocusFromScreen()` from
  `ws.onopen`, polling while the snapshot is still being written), so a `/focus` typed in the drawer by hand is picked
  up; a session that never printed one — `"viewMode": "focus"` in settings, or the line scrolled past — leaves the
  button as it was. The row shows while `termLive(s)`; on the zsh tab it shows the
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
* **Every grid row in the chat column is placed by hand** — `#chat`'s, each half's `.ptabs` / `.gbody`, and
  `#sessions`' since the usage footer (the rail hides `#filters`), whose *columns* are placed too since the timeline
  (2026-09-25: an item locked to a row and left to auto-place its column goes to the next free one — a new column). A
  hidden block is `display:none`, which takes it out of auto-placement and slides its siblings up a row; a body
  that lands in an `auto` row sizes itself to the terminal it holds instead of to the pane, and the drawer keeps
  whatever height it was first drawn at with black under it (2026-09-22). A new block means placing it too.
* **A terminal that grows has to pull its scrollback back down** (`lib/refit.mjs`, and the page's own copy in
  `refitTerm`): xterm only does it when the cursor is on the last line of the buffer, and Claude Code's never is.
  → `test/refit.test.mjs`.
* Inline code gets a tint, never a border; card glyphs are inline SVG, not emoji; the working ring is the project's
  colour — `--ring`, which only a card too dark to show it (`.card.black`) overrides, with white.
* `PROJECT_ICONS` (index.html) marks a project by its shown name wherever the name is written — oracle's crystal ball;
  `projIcon(name)` goes before the name in the chat list's header, the chat header, the cards, the pickers.
  `PROJECT_ABBR` is the same idea for the folded list's squares, and is read only by `projAbbr`.
* **Never name a modifier class after something the page also selects by**: a background command's chip wore `card`
  as a placement marker nothing read, and `#slist .card` matched it — ⌥⌘↑/↓ walked over a chip and opened nothing
  (2026-09-22). The walkers take `#slist > .card` now. Same trap the other way: the usage's messages wore `.note`,
  which is `note()`'s fixed-position popup — they floated over the popover (2026-09-23); `.unote` now.
* Code folds per chat: `prefs.foldBy[id]` (the `{ }` row under the header's ···) over `prefs.foldCode`, which has no control now; `foldOn(id)` is the one
  rule, used by `md()`. Claude Code cannot fold the code it prints in the drawer — ctrl+o is tool output only.
* No in-page toasts: alerts are the badge plus a system notification; the app sets `NOTIFY=off` on its own server.
  **The cog's switch is the server's word** (`notifications` in the state file, `PUT /api/notifications`, a
  `notifications` event): off, every alert still goes out — the cards' and the Dock's counts — but `quiet: true`,
  and the three posters (main.swift, the page's `Notification`, the server's osascript) each skip it. A new poster
  has to read `quiet` too. → `scripts/scenarios/notifications.mjs`.
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
  `assert`, `cmd(code)` (a plain ⌘ press; `key(code)` is ⌥⌘), `screen(g)` / `waitPrompt(ms, g)` (the half, 0 by
  default — the whole column while nothing is split), `drag(from, to, mid)` (a real press, move and release). The twenty-four in `scripts/scenarios/` are the
  regression checks for the drawer (re-attach, restart, geometry, `/clear`, ⌘K, the focus-view button, ⌥ as a
  compose key), the hotkeys, the tab strip and the split, the new-chat flow, the project step's folders and ✕,
  the chat list's rules, its filter, its ends and its timeline, the card sizes, the notifications switch, the usage bar, the project cue, the header's PRs
  and its ··· menu.
* **`npm run scenarios` runs the lot**, one at a time — four servers and four Chromes at once is how a suite
  starts failing on the clock rather than on the board. A failure is **run once more**: passing then is reported
  `FLAKY` with what it failed on the first time, and the suite still exits 0; `--no-retry` is the honest gate.
  Nothing is known to need it since the drift below was taken out of `focus-view` (2026-09-22).
* **Every test server gets a fast clock and an empty org directory** (`lib/testserver.mjs`): `REGISTRY_POLL_MS`
  1200 and `TASK_GRACE_MS` 400, because the live ten seconds is what a scenario either waits out or races; and an
  `ORG_DIR` of its own under the state dir, so nothing ever lists the real `~/acme`. `meta.env` is spread last,
  so a scenario that means something else says so (`new-project` points `ORG_DIR` at a tree it built).
* **Test against the fake claude, not real chats**: `scripts/fakeclaude.mjs` via `CLAUDE_BIN` (the test server's
  `fake: true`) is instant and touches nothing. A test against the real `~/.claude` (read-only, `claudeDir` unset)
  must use a stale chat and `DELETE` the terminals it made.
* **Two measurement traps** (2026-09-20): Claude Code stops rendering while the terminal reports focus lost — a
  headless page's `focus()` is not a focus without `Emulation.setFocusEmulationEnabled` (the runner sets it); and
  **every re-attach that moves the drawer resizes it**, which is what the drift below rides on — a chat switch
  (the other chat's reply box), and since 2026-09-22 ⌥⌘T too, which now splits the column and re-attaches nothing.
  **The clean re-attach is a reload of the page** (`Page.reload`, then `openChat`): a fresh xterm, built from the
  holder's snapshot, at one size. That is what `focus-view` does.
* **The page's screen and the holder's are two emulators** fed the same bytes, and a *resize* is drawn for one
  size and read at another — so they drift by a line and **stay** drifted until the next attach builds the page's
  screen from the snapshot again. It is the board's bug, not the test's: a drawer that has drifted has whatever
  reads its screen (the focus-view button) reading the wrong line, and the fake claude repainting its live region
  at an absolute row then eats a *different* transcript line in each. Measured 2026-09-22, when the split made it
  reproducible: move a live drawer from one half to the other and read the screen. **The fix is a re-sync after a
  resize settles — the page asking for a fresh snapshot — and it is not written.** `focus-view` re-attaches by
  reloading the page, which is why it no longer flakes.
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
* **Hooks are not installed** in `~/.claude/settings.json`; `hooks/settings-snippet.json` would make "replied"
  exact. Permission prompts no longer need them — the registry says `waiting` (2026-09-22).
* **The app is signed for this machine only**, not for distribution.
* **Chat-level pins** were dropped for sorting by your own last touch; **board-set colours** for Peacock's.
