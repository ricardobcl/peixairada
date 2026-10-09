# peixAIrada — working notes

One board for every Claude Code chat on this Mac. Reads what Claude Code already writes to `~/.claude`; no
private API, no cooperation from Claude Code itself. Built as a PoC on 2026-08-31 and grown from there.

**Three documents, three jobs.** [README.md](README.md) is for the user. This file is the *current invariants*
— one bullet each, under stable headings, what a session must know to change the code without breaking it.
[docs/DECISIONS.md](docs/DECISIONS.md) is the *why and the history*: dated decisions, open items, the state of the
tree, and *Findings* — the full stories behind the bullets below (the bullets as they stood before 2026-09-27, with
their dates and quotes, are there verbatim). When a finding is new, add a decision entry there and a bullet here with
a pointer; do not grow this file with stories. **A comment in the code carries the date of its decision, never a
person's words**: the request, quoted, goes in the decision entry (since 2026-10-01 — the board is shared). **Nothing
names the real org, its repos or the people on its PRs** — `acme` and stand-ins, in the code, the tests and both docs;
commits carry GitHub's noreply address (this repo's `user.email`).

## Run, build, check

```sh
scripts/launchd.sh install          # the server as a login agent, run from this checkout — the recommended setup
scripts/launchd.sh restart [--after N]   # after a server.mjs change; the drawers stay (holders); N s first, so a recap lands
mac/build.sh install                # the native app (bundles node, node_modules, lib/) into /Applications — Swift changes
npm start                           # node server.mjs → http://127.0.0.1:7331, by hand
npm test                            # node:test over test/ — pure logic, and the drawers end to end (≈12 s)
npm run check                       # static: every script parses, the page's script compiles, the vendored xterm = node_modules, shell, swiftc -typecheck (≈10 s)
npm run verify -- "<js>"            # one expression on the live board in headless Chrome (see Verifying)
npm run scenario -- scripts/scenarios/<name>.mjs   # a multi-step browser check on its own server (see Verifying)
npm run scenarios                   # all of them, one at a time, with a verdict (several minutes); `-- drawer` narrows it
npm run map                         # rewrite the section maps at the top of server.mjs and index.html
```

* **The server is a launchd agent run from the repo; the app adopts whatever answers on 7331.** Quitting or
  rebuilding the app touches no chat. A page change is live on reload (the agent serves the working tree's
  `public/`); a `server.mjs` change needs `restart`. The bundled server in the app is the fallback for a Mac
  without the agent. → Findings: *launchd agent*.
* **A restart does not end the drawers**: each drawer is a holder process the server connects to (see *The drawer*).
* **Node ≥ 22** (the harness uses the global WebSocket), **`npm install` first.** Runtime deps: `node-pty` (native),
  `ws`, `@xterm/headless` 5.5.0 and `@xterm/addon-serialize` 0.13.0 — pinned exactly to the vendored xterm's version;
  `npm run check` compares the four vendored xterm files with `node_modules`. The xterm client packages are dev-only
  sources for `public/vendor/`; `marked`/`DOMPurify`/`highlight.js` are vendored by hand. Rebuild the app after
  `npm install` or a node switch (it copies `node_modules` and the node binary).
* **A session that runs in a drawer**: finish the work, write the notes and the recap first, and run
  `restart --after 20` last. `GET /api/terminals` says which chats are in drawers. `launchd.sh` and `build.sh`
  detach themselves when run from a drawer (`PEIXAIRADA_DRAWER`, the app's bundle id). → Findings: *build.sh from a drawer*.

## Layout

| Path | What |
|---|---|
| `server.mjs` | The backend: transcript tailing, sessions, SSE, HTTP, notifications, the holder proxy. A **section map** at its top (`npm run map`); boots only when run as the program, exports its pure parts for the tests |
| `lib/termhold.mjs` | The holder: one process per drawer — the PTY, the exact screen, a Unix socket |
| `lib/cdp.mjs`, `lib/testserver.mjs` | Harness plumbing: headless Chrome over the DevTools protocol; a throwaway server with cleanup, `waitFor`, `post` |
| `lib/refit.mjs` | Resizing a terminal so a grow pulls the scrollback back down (the holder's copy; the page keeps its own) |
| `public/index.html` | The frontend, one file, no build step: chats · chat (one half or two), the drawer, the transcript renderer. A section map at the top of its script |
| `public/vendor/` | `marked` 18.0.11 + `DOMPurify` 3.4.14 + `highlight.js` 11.11.1 + `xterm` 5.5.0 (+ fit 0.11, web-links 0.12) — UMD builds, no CDN at runtime |
| `mac/Sources/main.swift` | The native shell: window, the pane (web views per page), server lifecycle, Dock badge, menu bar, notifications, the hotkey forwarder |
| `mac/icon/MakeIcon.swift`, `mac/build.sh` | The icon, drawn in CoreGraphics; compile + bundle + sign + install (the version is `package.json`'s) |
| `scripts/launchd.sh` | The server as a login agent; `restart [--after N]` |
| `scripts/verify.mjs`, `scripts/scenario.mjs`, `scripts/scenarios/` | The browser harness (see Verifying) |
| `scripts/fakeclaude.mjs`, `scripts/fixture.mjs` | A stand-in CLI for tests; a `~/.claude` look-alike |
| `scripts/fakejira.mjs` | Jira Cloud's three calls (projects, `myself`, `bulkfetch`) on a loopback port, from a list — `startFakeJira`, for the tests and scenarios |
| `scripts/fakepmset.mjs`, `scripts/fakecaffeinate.mjs` | `pmset` (its SleepDisabled in `FAKE_PMSET_FILE`; `FAKE_PMSET_FAIL` fails a set) and `caffeinate -i -w` (lives until its pid goes; `FAKE_CAFFEINATE_PIDS` logs it) — every test server's (`PMSET_BIN`, `CAFFEINATE_BIN`, `AWAKE_ADMIN=none`) |
| `scripts/fakegh.mjs`, `scripts/readme-shots.mjs` | `gh api graphql` answered from a file (`GH_BIN`, `FAKEGH_PRS`, `FAKEGH_VIEWER`; a PR's entry is handed back whole, so it can carry the turn's fields; one it does not name is a NOT_FOUND, as GitHub's); the README's screenshots from a made-up board → `docs/shots/` — never shoot the real one |
| `scripts/check.sh`, `scripts/check-page.mjs`, `scripts/map.mjs` | Static checks; the section maps |
| `test/` | `node:test` files (`npm test`) |

## How it reads Claude Code

| Signal | Source |
|---|---|
| Transcript, appended live | `~/.claude/projects/<cwd-slug>/<session-id>.jsonl`, `fs.watch(recursive)` — no polling needed. Boot reads the last `TAIL_BYTES` of each; opening a chat reads it whole, a chunk at a time (`readLines`) |
| Which sessions are alive | `~/.claude/sessions/<pid>.json` + `process.kill(pid, 0)`; watched *and* polled every 10 s (pids die silently) |
| Where a chat lives | `entrypoint` on user/assistant lines (`claude-vscode` / `cli`), the registry's while it runs — `inVsCode()`. Several processes on one chat: the drawer's own is `live`, else the newest non-VS Code one; the rest are `rivals` on the summary |
| Reply finished | assistant line with `stop_reason` `end_turn` (also `stop_sequence`, `max_tokens` unless it cut a tool call, `refusal` — `TURN_ENDS`, 2026-10-03; tool calls are `"tool_use"`) — **or the registry's `idle` with a `statusUpdatedAt` after your last word** (`statusOf`, 2026-09-29: `/compact` is written as a plain prompt line and ends with no assistant line at all) — unless a **sub-agent** is at work: `<slug>/<id>/subagents/agent-*.jsonl`, running while its last line is not an end_turn — **nor the result of its `SubagentHandback` call, nor an interrupt** (2026-10-03: agents hand back through a tool and write no end_turn after) — and it wrote within `AGENT_STALE_MS` (`scanAgents()`, on their fs events and every 10 s; a dead chat counts none); a background agent ends the main turn at once, so this is what keeps the card clauding |
| Waiting on the user | **the registry's `status: "waiting"`** — every interactive claude rewrites its `sessions/<pid>.json` on each change of state (`busy` · `idle` · `waiting` · `shell`), with `waitingFor` (`input needed` for an AskUserQuestion; `permission prompt` for a tool's approval; `sandbox request`…) — `waitingOn()` / `statusOf()`; any live process on the chat waiting is the chat waiting, and it beats the agents. **`dialog open` is not asking** (`NOT_ASKING`). **The transcript cannot say it**: the line that asks is written *with its answer*; it is only the fallback for a claude that reports no status (a pending `AskUserQuestion` / `ExitPlanMode`, whose question is `s.ask`); otherwise the card says what the registry waits on (`ask.waitingFor`). The flip into waiting is the `needs-input` alert (`loadRegistry`) |
| Work behind the turn | `Monitor` and a `Bash` with `run_in_background` leave a task running: the tool_result names it (`Monitor started (task …`, `Command running in background with ID: …`) and `<task-notification>` lines carry its events and, with a `<status>`, its end. `s.tasks` → `tasks` on the summary; a task dies with the claude that started it (`live.startedAt`), at its expiry (`MONITOR_MS`, `TASK_MAX_MS`), or with the chat's process (`pruneTasks`, on the poll — `runningTasks` only reads). **A completion notice delivered mid-turn never becomes a line**, so a background command is also asked about directly: `sweepTasks` runs **one** `lsof -F n` per poll over every task's output file (the harness holds it open until the command exits), after `TASK_GRACE_MS`, never on lsof's own failure, names compared resolved |
| Titles | board title (state file) › `custom-title` › the oldest still-open PR › `ai-title` › last prompt — `summary()`, `prTitle()` |
| Model | `message.model` on assistant lines, the last one wins, `<synthetic>` skipped — `s.model`; the card wears an F for Fable (`onFable`) |
| PRs mentioned | `pr-link` lines, GitHub pull URLs *and short references* in user/assistant text, in the order said; most recently mentioned first; `gh api graphql` batched for state, title and whose move it is (one of the two network calls), polled by the chat's recency and the PR's own — see *The server*. **A short reference** (2026-10-06, `refsIn`): `#12` the chat's own repo (its checkout's `.git/config`, `ghRepoOf` — a worktree's followed), `widgets#12` the org of the root holding that checkout (else the chat's root's, else the one root's), `acme/widgets#12`, `widgets #12` when widgets is a checkout under a root, and a list after one on its line; none in code, a link's text or a URL. **It is on the chat only once GitHub finds a PR there** (`shownPr` filters the summary and `prTitle`) — a bare one not when that PR was merged or closed and opened over `REF_AGE_MS` before it was said (a review's numbered points), and no such past one titles the card (`pastRef`) — and a NOT_FOUND lets it go (`forgetRef`, `noPr`). → `test/pr-refs.test.mjs` |
| Jira tickets named | `KEY-123` in user/assistant prose (inline code counts, fenced code not), `…/browse/KEY-123` links, and the chat's `gitBranch` (`feature/key-123-…`) — `ticketsIn`, `noteTickets`, `noteBranchTicket` → `s.tickets`. **A bare key is asked about only when its project is one of the site's** (`jiraProjects`, `/rest/api/3/project/search`, hourly) and **shown only once Jira answered for it** (`shownTickets`; the branch's first); none Jira has is let go (`noTicket`). `POST /rest/api/3/issue/bulkfetch` (≤ 100 a call; `myself` for whose) with Basic auth: setup.jira `{site, email}` and a token from `JIRA_API_TOKEN`, else the keychain item *peixAIrada Jira* (account the email) written by `security -i` from its stdin; polled by `prEvery` like PRs, a done one an hour apart; a failure as a whole pauses, 1 min doubling to 30 (2026-10-08). → `test/jira.test.mjs` |
| Plan usage (the chat list's footer) | `GET https://api.anthropic.com/api/oauth/usage` with Claude Code's own OAuth bearer from the keychain item *Claude Code-credentials*; `USAGE=off` disables; the token never reaches the page. **A cap in money** (2026-10-08, an enterprise seat's): `limits[]` rows of `kind: 'spend'` (`group` daily · weekly · monthly) and `extra_usage`'s cents → windows with `used`, `limit`, `currency` (`usageWindows`, → `test/usage.test.mjs`). → Findings: *plan usage* |
| Permission prompts | the registry's `waiting` (above) — they never reach the transcript |
| Chat from the board | a holder runs `claude --resume <id>` or `claude` in the chat's cwd through an interactive login shell (mise's PATH; `RUN_SHELL` — the user's zsh or bash, else `/bin/zsh`); it registers like any CLI run; a new chat is tied to its session by pid. **A folder whose Taskfile launches claude** (a task whose description mentions Claude) starts new chats as `task <name>` instead: `GET /api/launchers?cwd=` lists them (`task --list --json`, cached by the file's mtime, `TASK_BIN` overrides), `POST /api/terminals {cwd, task}` checks the name; claude is then a *descendant* of the PTY's pid, found through `ps` (`linkTermToRegistry`, `t.claudePid`), which is also where the launcher's name is written down for good (`noteEnv` → `envs` in the state file → `s.env`, what ⌥⌘O scopes by). A resume never goes through task. **`/clear` (or `/resume`) in the drawer** gives that pid a new session id and `linkTermToRegistry` moves the holder to it and pushes **both** chats; the page follows the holder (`terminal` event → `openSession`), the old chat is a stale card |

**Never written: anything under `~/.claude`.** The board is read-only against Claude Code's data. The fake claude
refuses to run against the real directory for the same reason — known by its device and inode, at CLAUDE_DIR or any
folder above it, for `$HOME`'s home and the account's (2026-10-03; a string compare before).

## The server

* **Only the board's own page may ask** (2026-09-27): every route and the terminal upgrade refuse a request whose
  Origin is not this server's, or whose Host is not a loopback name — `foreign()`; no Origin at all (curl, the app's
  fetches, the tests) passes; a `null` Origin is nobody's. Loopback is no trust boundary a browser keeps, and
  WebSockets have no same-origin rule. **A browser sends no Origin on an `<img>`, a `<script>` or a navigation**, so
  `Sec-Fetch-Site` must be `same-origin` or `none` when sent — a navigation to `/` itself aside (2026-10-03). Bound to
  every interface, the Origin must name the Host, and no Origin is only for this Mac. → `test/origin.test.mjs`.
* **The port first, then the boot** (2026-10-03): `main()` waits until `listen` succeeds before it adopts holders,
  reads the registry, polls GitHub or saves state — a server waiting on a busy port does nothing — and every request
  and upgrade waits for `booted`. **A route writes its head only once its body is in hand**, and the handler's catch
  destroys a response whose head went out: a second `writeHead` in the catch was an unhandled rejection, and the end.
* **A drawer's WebSocket has an `'error'` listener** and `maxPayload` 8 MB: a bad frame was an unheard `'error'` —
  and so is every spawn's (`code serve-web`): nothing the server starts or accepts may emit one unheard.
* **A chat re-read is silent and keeps what the transcript cannot say** (`indexFile` on a chat the board holds —
  opening one longer than `TAIL_BYTES`, a truncated file): `s.silent` stops `queueNotify` for the re-read (every reply
  in it was alerted once), `live`/`rivals`/`alive`/`startedAt`/`openedAt`/`agentsRunning` carry over, a
  tail re-read keeps `prev.tasks`, and the replaced object's timers are cleared. A registry-made placeholder (no file
  yet) is **not** silent: its first reply is news. → `test/reindex.test.mjs`.
* **`summary()` reads only.** `pruneTasks` (the poll) deletes expired tasks; `sortedSummaries` builds one
  `termIndex()` and hands it to `summary(s, ti)` (a single summary still asks `termOf`/`shellOf`).
* **Bodies go through `jsonBody(req)`**: `readRaw` collects the bytes and decodes them whole (a character split across
  chunks was two U+FFFD); none, unparseable, not an object or too large all read as `{}`. Past its limit a body is
  drained, not destroyed (a destroyed request took its socket, and the 413 went nowhere); a refusing route sets
  `connection: close`.
* **The state file is written beside itself and renamed over** (`saveState`, 2026-10-03), and one that does not parse
  is kept as `state.json.bad-<ms>` and said in the log — never dropped in silence and written over. STATE_FILE set
  never reads the legacy one. → `test/state.test.mjs`.
* **One spawn per chat and kind at a time** (`spawnOnce`, `<chat>:claude` / `:shell`): a drawer is in `terms` only
  once its holder answers, and a second ⌥⌘C meanwhile started a second `claude --resume`. **Nothing is signalled that
  is not the registry's process**: `endClaude(entry)` compares `procStart` with `ps -o lstart=` in UTC
  (`sameProcess`) — a dead claude's file lingers, and its pid can be anyone's by then. → `test/terminals.test.mjs`.
* **The open chat's entries are numbered on the wire** (2026-10-03): `/messages` and every `entries` event carry
  `gen` (which reading of the file — `newSession` numbers each object) and `upto` (`entryCount`: the entries end
  there), and the page keeps only what is past what it holds; another `gen` or a gap is a fetch. See *The transcript*.
* **The holder socket is `setEncoding('utf8')` on both ends** — a glyph split across chunks decodes whole.
* **Keeping the Mac awake is two switches, and only one is the board's** (2026-10-08, `keepAwake`, `setLid`,
  `/api/awake`, an `awake` event, `awake` in the snapshot): *awake* is a `caffeinate -i -w <the server's pid>` the
  server holds while `awake` is on in the state file — started again at boot, gone by itself when the server goes, and
  a caffeinate that ends on its own turns the switch off rather than leave the mark lying; *lid closed* is
  `pmset -a disablesleep 1|0` through osascript's administrator dialog (a password each turn; a cancel is a 409,
  `cancelled`, said nowhere), **the system's setting, never kept here**: `readLid` reads `pmset -g`'s SleepDisabled on
  every registry poll, whoever set it. The one thing the board changes outside its own files besides a Peacock colour
  and a clone. → `test/awake.test.mjs`.
* **Every CLI the server shells out to goes through `findBin()`** — `git` too — the app's server has a bare PATH;
  `<NAME>_BIN` overrides. A file it can run, not any path that exists; none found is looked for again a minute later
  (2026-10-03). The login agent's PATH is the installing shell's, then the system's (`launchd.sh`, 2026-10-01). The
  network calls are `gh` (PR state and title), the usage endpoint — one usage question at a time, its answer kept a
  minute, a failure half a minute (`planUsage`) — and, once the setup names a site, Jira (`jiraAsk`; its token never
  reaches the page, nor the setup file — `GET /api/jira` says only where it is: `env` · `keychain` · `file`).
* **A PR is polled by how recently its chat was touched** (2026-09-28): `sweepPrs` on the registry poll queues what
  `duePrs` says — a PR never asked about (so boot asks every one, the recent chats' first), else by `PR_POLL`: every
  minute for a chat touched within the hour, 5 min within the day, 30 within three days, **never after**. Touched is
  `lastActivity` or `s.openedAt` — a page fetching the chat's messages, which also asks at once, as a PR said live does
  (unless asked within `PR_TTL_MS`, 30 s). The most recent chat mentioning a PR sets its pace; merged and closed are
  never asked twice, one in flight is not queued (`prAsking`). **A call that fails as a whole changes nothing** (it used to wipe the batch's states and titles)
  and pauses the polls, 1 min doubling to 30. → `test/pr-poll.test.mjs`.
* **A PR you wrote or reviewed has a turn** (2026-09-28): the same call asks `PR_FIELDS` and `viewer`, and `prTurn` —
  pure — says `you` when someone else's PR has a head that is not the commit your latest review was on (not after you
  approved), someone else wrote after your last word (a reply in a thread is a review), or your review is asked for
  again; on your own PR, when someone else reviewed, commented or pushed after your last word. Bots are nobody. **Any
  word of yours answers every reason before it** (a comment after the push, after the request), and only a reason that
  *came* is a move (`newsIn`: a new head, a newer word of theirs, a new request) — an answer never is. **A
  move un-ticks every chat that mentions the PR** (`isDone`: the tick against `turn.movedAt` too) and sends one alert,
  `kind: 'pr'` with a `heading`, to the chat touched last (`notifyPr`) — on the way from `them`, or when a ticked chat
  comes back. `movedAt` is `prTurns` in the state file (`moveTurn`): GitHub's time for a PR's first look, the board's
  clock for every change after, so a restart moves nothing. **The PR is watched by its own newest event as well**
  (`PR_WATCH`: 2 min within two days, 10 within two weeks; `PR_WATCH_MS`), however quiet its chat.
  → `test/pr-turn.test.mjs`, `scripts/scenarios/pr-turn.mjs`.
* **A PR knows who had a hand in it** (2026-09-29): every person in `PR_FIELDS` comes with `avatarUrl(size: 48)`
  (`WHO`; a scalar, no cost), and `prPeople` — pure — gives the author, reviewers (not pending), commenters and pushers,
  each once with what they did and when last, newest first, at most `PEOPLE_MAX`, **you and the bots left out**.
  `people` on `prStatus` and on each chat's PR; a PR the call could not see keeps the faces it had.

## The board

* **Two columns**: the selected project's chats → the chat. **The chat list's foot — under the cards since
  2026-09-28 (`#sessions` rows: the list `minmax(0, 1fr)`, the people, the project, the controls) — is the project
  filter's whole cue**: **`#stitle`, a row of its own over the controls** (2026-10-08, grid row 3, the whole width; in
  the controls' row before, where a list at its usual width showed its × alone) — the project's name (nothing at all
  on ALL, `hidden`), a click being ⌥⌘P's picker, and × at the row's end back to ALL; **the chat header's folder name
  toggles it** (that folder, then ALL; `.repo.on` while it is the filter). The list's edge and the rows' tint are
  the project's colour. **The controls are one row, the usage included** (2026-09-28): the fish (the SSE light), `#filters` — the magnifier, an icon at rest (`#qBtn`); open, the left cap of
  `#q` (`width: 0; flex: 1 1 0`), which takes the row's spare room and the rings' (hidden while it is open, `:has`) —
  the state chips (a dot and a count; the word from 600 px of list, the count gone under 340; `#sessions` is a size
  container) — no ＋ since 2026-09-28: ⌥⌘N, which opens on the project in view (⏎ ⏎ is a new chat there); then **`#sfoot`, in
  the head's grid row as a column of its own** (`main:not(.scompact)`): the usage. No cog: the settings are ⌘, and ···. **No « / »**: ⌥⌘B
  folds and unfolds. The row clips rather than run the chips under the usage. On the rail the fish and, under it for a
  project, `projAbbr` (`.ab`, `#stitle`'s grid row 4 there) as the picker's handle keep the bottom corner, the usage's
  rings over them. Filled at the notch with the list under the housing, the cards start under the
  strip (`.npad` on `#slist` and the top pill); **elsewhere the first card is flush with the top** (no top padding,
  2026-09-29), level with the project box atop the chat. ⌥⌘P's rows carry
  ✎ on a named project and ＋ new project, last and never filtered out. → `scripts/scenarios/project-cue.mjs`. A chat
  is *ready · clauding · done*: done is the tick only, clauding is `working`, ready is everything else (`bucket()`);
  the server keeps the finer `status` for notifications and the badge.
* **The cards are reconciled, not rebuilt** (2026-09-27): `renderSessionList` builds `{id, html}` items and
  `drawCards` keeps the node of every card whose markup is what it was (`cardNodes`), makes the others anew, and puts
  them in order with the fewest moves; the lines between the cards are kept the same way, by their markup and its
  count (`lineNodes`, 2026-10-03). **An update that moves, adds and removes nothing reads and touches nothing.**
  Anything that mutates a card's DOM directly is lost on the next change of its markup and kept until then.
  `markQsel` re-toggles `.qsel` after every render, on the chat it marked (`qsel.id`), not its place.
* **What the stream says is drawn once a frame** (`renderBoardSoon`, 2026-10-03; a 100 ms timer where there are no
  frames): the `session`, `projects`, `peacock` and `pins` events. A landing (`working` → `idle`) and anything a click
  does are drawn at once (`renderBoard`, which cancels the pending one). `peix.state().rendering` says one is pending,
  and `ctx.settle()` waits for it.
* **A box the page redraws on every update is drawn only when its markup changed** (`setHtml(el, html)`, `el._drawn`):
  the project cue, the state chips, the hidden list, the tab strips, the rival's bar — a button replaced between press
  and release lost its click. Whatever edits such a box in place forgets `_drawn` (`peixPaneUrl` does).
* **The list moves rather than jumps** (2026-09-27, night): `drawCards` FLIPs a card that changed rank (its rect before
  and after the reconcile, a `translateY` by WAAPI, `FLIP_MS`), fades in one that arrived (`ENTER_MS`) and folds shut
  one that left (`leaveCard`, `LEAVE_MS`) — within a screen of the list's window only, never on the first draw or under
  reduced motion. **A folding card is wrapped in `div.leaving`** and loses its `data-id`: the wrapper is what folds, the
  reconcile steps over it, and `#slist > .card` — the page's and the harness's count of the cards — never sees it.
  Each animation carries its kind in `id`; `window.peix.motion()` is the log of the last moves.
  → `scripts/scenarios/list-motion.mjs`.
  **The reply landed** is the `landed` class: the `session` handler notes `working` → `idle` in `landedAt`, and
  `flareLanded()` (from `drawCards`) sets the class with a negative `animation-delay` for `LANDED_MS` (1.1 s), so a
  rebuilt card carries the flare on — the edge's flare, and since 2026-10-09 **a wash from the ✓ corner** (`::before`,
  `@keyframes wash`, `animation-delay: inherit`; not on a card still watching, whose `::before` is the ring's); the badge pops from `onAlert`. Neither is in `PHASED`.
* **A card's glow is `--tint` and `--reach`, registered percentages** (2026-09-27, night; ink cards since 2026-10-09):
  the card is the panel, its colour a lit 3 px edge on the left (`--edge`, a first `background` layer) and a glow of it
  from there — `--tint` how strong it starts, `--reach` how far it runs before it is the panel. Hover, `.active` and
  `.qsel` set the numbers, never a `background`, and the change eases (`transition` on `.card`, shortened under
  `:hover`; the `::after` cover inherits and follows). A new card state that wants a glow sets the two variables. The
  project's name is in its colour, towards what reads on the panel (`oklch(from …)`, lighter in the dark). The
  outline is `1px solid transparent` at rest for the same reason. `#splitter` and `#gsplit` light after a 300 ms
  `transition-delay` on hover, none on `.drag`; the small controls share one 120 ms hover transition.
* **Dialogs, `.pop` and `.note` ease in and out with `@starting-style`** (2026-09-27, night), `display` and `overlay`
  held by `allow-discrete` until the exit ends — so a closed dialog is still `display: block` for 140 ms while its
  `open` attribute is already off (read `open`, never `display`, to know). `note()` fades its popup out (`.out`) before
  removing it. A new dialog or popover gets this for free; one that must vanish at once sets `transition: none`.
* **An age is `data-at`, never words in markup** (2026-09-27, night): the pickers' `.t` and the menu's *for …* carry
  the timestamp, and `fillAges(root)` writes `rel()` of it after the list's render, after `pickRender`, and on the 30 s
  tick (which also refreshes the open picker and menu). **A card's `.time` carries nothing at all** — `fillAges` sets
  its `data-at` and tooltip from the chat — so neither the clock nor a tool call (which moves `lastActivity`) changes a
  card's html: the node is kept, and the ring on it (`card-signals` relies on this; a *prompt* still rebuilds the card,
  since its last word changes). `dayOf(ts)` is the one spelling of a day (`today` · `DD-MM-YYYY`), for
  the list's lines and the transcript's (`.sysline.day`, from `renderLog` where the day changes). The who-line's time is
  `toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })`.
* **Controls wear a fill, never a grey edge** (2026-09-28): `.btn`, `.fsearch`, `.fchip`, `.chip`, `.ptab`, the PR chips,
  the ends' pills — `border: 1px solid transparent` (so nothing moves) and `background: var(--ctl)`, `var(--ctl-hi)`
  under the pointer; a state that was an accent or coloured edge (`.on`, a tab in front, the chips' state, a VS Code
  or agents chip) is a tint of that colour instead. `--ctl` is the ink at 7 %, **set on every element** (`*`), so it
  follows an `--ink` borrowed there (a black card, the header's black). Text boxes, dialogs and popovers keep their
  edges; a semantic edge (the red of a failure, the accent round an open box) stays.
* **The small print is one CSS section** (2026-09-27, night, before the reduced-motion block): `text-wrap` for prose
  and centred texts, tabular figures for every count and age, `::selection` in the accent (and `--term-sel` to match),
  one `:where(…):focus-visible` ring — a text box that wants its border as its focus keeps its own `:focus { outline:
  none }`, which out-specifies it — and `overscroll-behavior: contain` on every scroller. A new number, list or control
  joins those lists rather than getting a rule of its own.
* **Every animation has its line in the reduced-motion block** (2026-09-27, night): the one
  `@media (prefers-reduced-motion: reduce)` at the end of the CSS stills the ring (a flat edge in `--lit`), the
  question's pings (a steady red border and its glow), the pulse, the spinner, the flare and every transform; `drawCards` reads `REDUCED` and puts
  cards in place. A new animation adds a line there, and to `scripts/scenarios/reduced-motion.mjs` if it is a state's.
* **The card's edge is one ring with four readings** — or, with the settings' *edge light* (`prefs.edgeLight` →
  `<html data-light="edge">`, 2026-10-09), the same readings running down the card's lit left edge: a strip twice the
  card's height, a light every card-height ÷ lights, turned by a `transform` (`@keyframes edge`, phased like `ring`);
  the card keeps its border but on the left, its padding taking the 2 px (the overflow clips at the padding box), and
  the open chat's light runs on past its card only with the ring (`trailGeom`; → the last step of `card-signals.mjs`). Either way: `--lit` is what runs in it, `--seg` how much of the edge one
  light owns (`100% / --lights`, one light per sub-agent), `--spins` how fast. Clauding is the project's colour
  **lifted towards white** (`--glow`, 2026-10-02: OKLCH, 85 % of the way to white, hue and chroma kept — the colour
  itself went round a navy unseen; the landing flare is the same light); **watching** (`s.tasks`) is one light in
  `--watch`, slowly, and can sit on a *ready* card; **asking** (`needs-input` while alive) has **no ring**: the card's
  border is red and **pings leave it** (2026-10-09, `@keyframes sonar`; it blinked before) — its `::before` and `::after`
  as two outlines half a beat apart, scaled out and faded, the card `overflow: visible` to let them out — with the
  question and its answer count on the card
  (`askHtml`). The three CSS rules are in priority order — work beats a monitor, a question beats both — **and each
  sets every variable**. The chips beside the title say the numbers (`N agents`, `monitor`). **The ring is a conic
  gradient on a square `::before` turned by a `transform`, under an `::after` cover in the card's background 2 px in,
  on the edge itself** (2026-09-29): a card with a ring has no border — its padding takes the 2 px, so nothing inside
  moves — and the band's unlit part is the border's colour (`--track`); the card's overflow clips at its padding box,
  so with a border the light ran inside it. The compositor's kind of motion — and `phaseAnims()` (once a frame, before
  it paints; `phaseAnims(true)` at once, the cog's switch) puts every `ring`, `edge`, `sonar`, `pulse`, `pix` and `pixhop` at
  start time 0 on the document clock, or, with *rings in step* off (`prefs.ringsInStep`), at a time hashed from the
  chat's id. → `scripts/scenarios/card-signals.mjs`.
* **The open chat's light runs past its card** (2026-09-29): while it is clauding or watching, the open card, the
  splitter down to it (`splitEnd`) and the project's box atop the chat (`--hsplit` × `--hrow`) are one shape, and the
  light runs clockwise round that shape's edge — up the splitter, round the box, down and round the card. `#trail`, a
  fixed overlay (z 30, no pointer), is clipped to a 2 px band inside the outline (`clip-path: path(evenodd, outline,
  inset)`; `outline()` unions the rectangles on a grid, `insetLoop()`), and the light is a comet of round blobs
  (`#trail i`), each moved along the outline by a WAAPI `transform` animation — no paint per frame. The light is
  white (2026-10-02; the header's ink before, a shadow on a light colour), a monitor's `--watch`; the pace and the
  lights are the card's ring's (its perimeter per `--spins`, one per sub-agent), and `main.trail` stands the card's own ring
  down. `drawTrail(g)` runs in the list's frame from `trailGeom()` (read in `listGeom`) and does nothing while the
  shape is unchanged; a changed shape keeps each light's place on the outline, which starts at the box's top right.
  The card out of sight: the box alone. On the rail, none. Reduced motion: no blobs, the band steady.
  `peix.trail()`. → `scripts/scenarios/open-light.mjs`.
* **Folded (⌥⌘B), the chat list is a rail of squares**: one per chat, `projAbbr` (the setup's short name for the ones
  the rule, `abbrRule`, gets wrong) on a solid tint of its colour, and the card's own edge — clauding, the agents' count, a monitor and a
  question still read from the rail. Everything inside the card is `display: none` there; `.abbr` is the only child
  left standing, and it carries the hover tooltip.
* **A project is a folder** (the registry's `cwd`, never the transcript's) **or a named set of folders** (state
  file); worktrees under a repo count as the repo. **Pinned projects** head the pickers (`state.pins`, a `pins`
  event; `PUT /api/pins`). Folder projects exist only through their sessions. **✕ on a row of ⌥⌘N hides a project**:
  its key — a cwd or `c:<id>` — goes to `hidden` in the state file (`PUT /api/hidden`, a `hidden` event) and
  `projectList()` and `freeFolders()` skip it. **Its chats are untouched** and still show under ALL. The cog lists what
  is hidden with a *show* beside it; starting a chat in a hidden folder puts it back (`newChat`).
* **A project's colour is Peacock's** — `pollPeacock()` reads the nearest `.vscode/settings.json` at or above every
  folder it knows, stopping short of `$HOME`; the board can *set* it (`PUT/DELETE /api/peacock`, a text edit of the
  JSONC, tested). No colour → `--nocolor`, unless the setup gives the folder one (by its shown name, `projCfg`); `#000000`
  there is `BLACK`, with its inks. The chat header's colour square is the picker (`#colorInput`).
* **Simple colours: greys and the one accent** (2026-10-01; the settings' `#simpleColors`, `prefs.simpleColors` →
  `<html data-colors="simple">`, `applyColors`): `repoColor` and `projColor` answer **the one colour** picked for
  every project (`prefs.simpleColor`, `setTint`: the `#tintRow` swatch under the switch, or the chat header's square,
  which then leaves Peacock's alone — `colorInput.dataset.tint`; ⌥-click lets go), black until one is (`simpleTint()`)
  — ALL included — so every surface takes the `--repo` path, and `:root[data-colors="simple"]` (light, and dark in its media block) redefines
  the state, spend and syntax tokens, `--needs` being the accent; a short block before the reduced-motion one does
  what tokens cannot (the ✳ and the F grey, a count pill's ink). **A PR and the people keep their colours** — the PR
  chips' `--pr-*`, GitHub's faces, `--you` — the theme is the projects' and the states'. **The setup's
  squares read `ownColor`**, and so does the header's square outside simple colours — the colour as set. A new colour on the board reads a token or
  `repoColor`, never a hex or `ownColor` of its own, or it shows through. → `scripts/scenarios/simple-colors.mjs`.
* **The floating header is a switch, to try** (2026-10-09, the studies' E; Settings → Board → *floating header*,
  `prefs.headFloat` → `<html data-head="float">`): `#shead` a rounded bar inset 14 px from the column's sides and 10 px
  from its top, an edge of the project's colour and a shadow; `#prlist` inset alike. With it the open chat's light
  does not run round the header's box (`trailGeom`'s `box` is null — it no longer touches the splitter).
  → `scripts/scenarios/head-float.mjs`.
* **The chat header is a gradient of the project's colour**: `tintChat()` sets `--repo`, `--rink`, `--rover`/`--rover2`
  and `#chat.tinted`; `--rink` is the ink that reads on it (`inkOn()`), every control in `.shead` redrawn in it; the
  veils pull the colour away from that ink towards the bottom right. No colour → the plain panel header. **The colour
  eases from chat to chat** (2026-09-27, night): the header's ground, the two veils, the transcript's wash and the
  divider read registered colours — `--hbg`, `--hveil`, `--hveil2` on `#chat`, `--openc` on `main`, all set
  by `tintChat` — and `transition` on those two elements does the rest; `--repo` stays unregistered (its fallback is
  load-bearing) and `--rink` cuts. A new surface in the chat's colour reads `--hbg`, not `--repo`. **The
  colour square sits between the project and the title**, centred, out of the flow — positioned from `.shead` at the
  `.sep`'s x (a 2 px span; the bar it drew went on 2026-09-28) — the same `.sq.pick`, inked only while the pointer is
  in the header; `colorAt` remembers which header the picker was opened from, so `note` pops up by the square. The
  h2's gap is 12 px, the header's padding.
* **Only the project's name is on the project's colour; the rest of the header is black** (2026-09-28):
  `.shead::after` from `--hsplit` (the `.sep`'s right edge) down `--hrow` (the first row; open details keep the
  header's ground), set by `paintHeadSplit()` after `layoutNotch(); fitHeadPrs()` and on `peixFill`; `.shead`
  isolates so the paint sits under the row. The title (`.shead h2 .t`) and everything right of the h2 borrow the dark
  theme's inks (the variables; their colour through `:where`, so a control's own rule still wins). At the notch the
  housing is inside the black.
* **A colour as dark as that black turns the black grey** (2026-10-01; `nearBlack`, Peacock's brightness under 40):
  the open chat's (`tintChat` → `main.darkchat`) makes the header's `::after` and the splitter's `::after`/`::before`
  `#4a4a45`. Simple colours' black, or a project painted `#000000`. A black card's edge is grey in the dark theme
  (`--edge`), its name the page's ink; no grey ground under a list of them since the ink cards (2026-10-09).
* **The chat header is drawn only when it changed** (2026-09-27): `renderHead` compares the header's, the menu's and
  the PR rows' markup with `drawn` and sets innerHTML only when different, then `layoutNotch(); fitHeadPrs()` only for
  a new header; the handlers are still bound on every call (they close over `s`). Anything that edits the header in
  place must reset `drawn.head` (`editTitle` does).
* **The chat header's row is the title, the PR chips, a task's chip and ···**: every button it had — `#termBtn`,
  `#viewBtn`, `#webBtn`, `#detailsBtn` (the state dot and its age), the VS Code mark — is a
  row of `#hmenu`, keeping its id, so the hotkeys and the harness still reach them, and `.click()` works on a closed
  menu. `#hmenu` is a **non-modal `<dialog>`**, static in the markup: `postPane` lowers the pane while it is up, Esc
  closes it, `runHotkey` closes it rather than let it swallow the key. Toggles leave it up (the click-outside test goes
  by `composedPath()`); actions that go somewhere close it. **`>_` comes back into the row while armed or failed**, and
  a note about a folded button is anchored at ··· (`seen()`). → `scripts/scenarios/head-menu.mjs`. **Keeping the Mac
  awake is a button in the row, always** (`#awakeBtn`, before ···, 2026-10-09 — a row of the menu and a mark shown only
  while on, the day before): a muted cup while the Mac may sleep, the cup in the spend's amber saying *awake* while the
  server holds idle sleep off; a click switches it. *Awake with the lid closed* stays a row of the menu (`#lidBtn`, a
  password); while it holds the button is a laptop in the needs' red and its click lets the lid sleep the Mac again.
  In whichever header is up, a chat's or the empty one (`drawAwake()` after every header drawn anew and on the
  snapshot; not in `drawn.head`'s markup). → `scripts/scenarios/keep-awake.mjs`.
* **A PR's CI is said in the chat header only** (2026-10-09; the cards have enough): `commits(last: 1) { … statusCheckRollup
  { state } }` in `PR_FIELDS` → `prChecks` → `checks` (pass · fail · pending) on each PR; `.hpr` wears `.ck` — a round
  badge after its number in the page's ground, a tick, a cross, or a ring turning (`ring`, stilled under reduced
  motion) — and a failing chip a red ring; the row says *passed · failing · running*. Only for open and draft PRs.
  → `scripts/scenarios/pr-checks.mjs`.
* **A chat's Jira tickets are chips as its PRs are** (2026-10-08): on the card, `cardTickets` — the first (the branch's,
  else the last named) as `.ctk`, solid in its status category's colour (`--tk-todo` · `--tk-doing` · `--tk-done`,
  `data-cat`), then `+n`, before the faces; a click opens the chat and the ticket in the pane. In the header they are
  `.hpr.tk` inside `#prToggle`, after the PRs (so `fitHeadPrs` folds them first), and `.prrow.tk` rows under the PRs'
  in `#prlist` (status · key · summary · whose). The settings' Setup has a Jira section (`jiraSetup`: the site and
  email into the setup file, the token box write-only into the keychain via `PUT /api/jira/token`, a line from
  `GET /api/jira` — who Jira says you are, or what went wrong; jira-cli's server and login offered while empty).
  → `scripts/scenarios/jira-tickets.mjs`.
* **The chat's PRs are chips in the header row, folded**: `#prToggle`, one button of the cards' chips (`.hpr` shares
  `.cpr`'s rule; `fitHeadPrs()` measures every width once and folds the last chips into `+n` only while the row would
  leave the title less than its repo name plus `TITLE_ROOM` (`TITLE_MIN` is the h2's flex-basis) — on every new header
  draw and on the header's `ResizeObserver`, which runs only when the width moved or under the housing;
  → `scripts/scenarios/header-prs-fit.mjs`), toggles `#prlist` under the header; `prefs.prsOpen`, the board's. The rows
  are rendered folded too (`#prlist` hidden), so ⌥⌘G and the harness still read `#prlist .prrow`. The header's chips
  are 20 px tall. → `scripts/scenarios/header-prs.mjs`.
* **Every PR chip GitHub has answered for is solid** (2026-09-28): `.cpr` and `.hpr` filled with `--prc`, its state's
  colour, the ink the page's `--bg`; one whose state is not known yet stays an outline (the header's on a wash of
  `--prg`).
* **A PR at your move is said by name, not by its chip**: `data-turn` (`turnOf(pr)`: `you` · `them` · empty) on
  `.cpr`, `.hpr` and `.prrow` and the tooltips (`turnTip`), but no look of its own. **The card has a line** (`moveHtml`,
  after the question's, at every size, not on a ticked card): a tag filled in the accent (`.ymove`: `ICON.pr`, *your
  move*), the newest move's `#n` and reason, `+n PRs`; **the chat header says it too** (`headMove`, `.hmove`, just
  before the PR chips), and the PR row in `.why`. The chat also ranks by the move (see the order below).
* **The card's PR chips end its top row, stacked** (`cardPrs`, `.top .tprs`, 2026-09-28; a stack since 2026-10-04):
  every PR the chat mentions, the first on top at the row's end and three under it 5 px further left each, a sliver
  of their colour showing (the first four in the chat's order, every one at your move among them), the rest under the
  third; **the pointer on the stack fans them all out** side by side, the row makes room, and **a fan wider than the
  row's free room scrolls** — a sideways swipe, or a wheel turned over it (`fanWheel`, its own non-passive listener,
  added on `pointerover`; down is deeper, leftwards); the pointer gone, it scrolls back as it closes. CSS only: the
  grid runs right to left (what overflows it does on the left, where a scroll container reaches), every chip in its
  first column, the widest chip's width and a 5 px margin, moved by a transform (`--d` its depth stacked, `--i` its
  place fanned); the empty columns after it (`--under`, one per sliver) are `0fr` stacked and `--span` fanned, the
  gaps going to 0, so the grid's own width follows the fan on the transform's curve. The box is `flex: 999 0 0`
  between `min-content` (the stack) and `max-content` (the fan): it takes the row's free room and never the folder's
  name. → `scripts/scenarios/card-pr-stack.mjs`. **Before them, the faces** (`cardFaces`, `.top .faces`, 2026-09-29):
  who else had a hand in the chat's PRs, merged across them, newest first — three GitHub avatars overlapping (an
  initial when there is no `avatar`) and `+n`; the tooltip says what each did, PR by PR. The images come from GitHub's
  avatar host; the tests hand the fake gh `data:` faces so nothing is fetched.
* **The people row: everyone in the PRs of the chats in view, under the cards** (`#people`, `renderPeople`,
  2026-09-29): the project's chats in the states the chips show give their PRs' `people`, merged by login, newest
  first (`peopleOf`), a face a button behind `ICON.pr`. A click is `prefs.person`: the list, its counts and its
  timeline narrow to the chats whose PRs have that person (`hasPerson`, applied with the query in
  `renderSessionList`), the face ringed in the accent and the others dimmed; the same face again, or the person
  leaving the view, lets go. Grid row 2 of `#sessions`, the list's row and the usage in row 3; `display: none` on the
  rail. Drawn only when its markup changed (`peopleDrawn`). → `scripts/scenarios/people-row.mjs`.
* **A card comes in three sizes, the cog's slider** (`#cardsSize`, `prefs.cards`): *large* — your last prompt and
  Claude's last reply —, *medium* the last word only, *compact* neither. `cardHtml` always writes both `.snip`s and
  marks the older one `.older` (Claude's reply is the last word when `lastReplyAt ≥ lastUserAt`); CSS hides by
  `#sessions[data-cards]`, so the slider re-renders nothing. The question line (`askHtml`) shows at every size —
  **unless compact's own switch, *same height*, is on** (`#cardsEven` under the slider, shown only at compact;
  `prefs.cardsEven` → `#sessions[data-even]`, 2026-09-29): the title on one line, the question left to the card's
  red edge and its pings, and the *your move* line kept — a card without one shows `.moveslot` instead, an invisible line of
  the same metrics (in the markup always, `display: none` elsewhere; not `.prmove`, which the harness reads the real
  line by) — so every card is the top row, one title line and that row.
  → `scripts/scenarios/card-sizes.mjs`.
* **A chat on Fable wears an F**: `onFable(s)` is `/fable/i` on `s.model`; the mark is `ICON.fable`, **beside the
  title** (`.trow .fable`, since 2026-09-28), in `--accent`. The rail does not show it.
* **The card's age stands beside the title, under the pointer only** (`.trow .time`, 10 px, since 2026-09-28): the
  title row reads title · chips · time · F · unread count, on the title's first line; the top row ends ✓ · PRs.
  `opacity` 0 → .8 on `.card:hover`, keeping its room, so nothing moves. Every card has the top row, 18 px at least.
  The tooltip (last activity · you last wrote · Claude last replied) is on it. → `scripts/scenarios/card-marks.mjs`.
* **Cards are square**: `.card` and the ring its `::before` draws at `border-radius: 0`. The PR chips keep their 4 px.
* **The open chat's card and a hovered one glow across** (`.card.active` 40 % to the far edge, `.card:hover` 34 % over
  three quarters), the rest a glow of 22 % over their first quarter, **with no edge but the lit left one** (transparent
  since 2026-09-28, the background running under it: `background-origin: border-box`): only the clauding card, the
  hovered one and the open one wear the colour round their border. **ALL** (`key: 'all'`) is black in both
  themes — `BLACK`, through `projColor()` — and so is a folder the setup paints `#000000`. A card in that black is
  `.card.black`; `--ring` turns its clauding light white wherever the card under it is dark. **The open card bleeds
  into the splitter**: `main:not(.scompact) #slist > .card.active` runs to the column's edge, its glow rising to the
  full colour over its last 44 px so it meets the bar seamlessly (a `background-image` layer over the edge and the
  glow, 2026-09-29), and `#splitter` is `--open`
  on `main` (set by `tintChat`); the bar ends at the card's edge as drawn — its rect, plus the outline's pixel
  (`splitEnd`). **The splitter wears it only down to the open card**
  (2026-09-28): black under it (`#splitter::after` from `--split`); the open card out of sight below, the colour runs
  to the list's foot (`::before` blacks the bar beside the foot row, `--sfoot`); above it, or not in the list, the
  splitter is black. **The black slides with the list's scroll by itself** (2026-09-29): `--split` is in the list's
  own coordinates, written by `drawSplit(g)` only when the card moves in the list, and a scroll-driven animation
  (`split-scroll` on the `--slist` scroll timeline, seen from the splitter through `main`'s `timeline-scope`) moves it
  up by the scroll, to `--smax` — the compositor's scroll, not a scroll event's frame behind it. The bar clips it
  (`overflow: hidden`; no edges since). An engine without scroll timelines gets `.scrolls` off and the old on-screen
  `--split` on every scroll (`SPLIT_SCROLLS`); the system WebKit has them (probed 2026-09-29).
* **A new chat has a card before its first word**: `visible()` shows a live chat with no transcript unless it is VS
  Code's. The server's `startedAt` on a session born from the registry is the card's time and place — the moment the
  board first saw the id (the process's start only at boot) — carried over by `indexFile`, the last fallback of
  `wordAt` (both copies), the card's `.time`. **Empty is no word, not no file** (2026-09-28): `/clear` writes its own
  lines into the new transcript at once, none of them a word, so the start, the `idle` of `statusOf` and the
  *(no messages yet)* title all go by `!s.lastActivity` — by `!s.file`, a cleared chat's card sank to the bottom with no
  age and no ✓; the fake writes those lines before the registry, the order that caught it. `openSession` on a chat the
  snapshot lacks renders the board from its fetch. **It has the ✓ like any idle chat, and ticked it is gone** — no dimmed done card, nothing to resume: `visible()`
  drops an empty chat once done, and the column moves on to the next card (`tickDone`) or, with none, leaves it
  (`leaveChat()`, from the `session` event; ＋ goes through the same function). → `scripts/scenarios/new-chat-card.mjs`, the card checks in `drawer-clear.mjs`.
* **A chat waiting on your answer first, then clauding, then ready, done last** (`RANK` / `rankOf`), inside each
  group **by the last word, yours or Claude's** (`wordAt`: the newer of `lastUserAt` and `lastReplyAt`; a tool call
  is not a word — **a PR come round to you is**, at its `turn.movedAt`: `movedAt(s)`, in both copies), newest first; a project ranks by its newest chat. The filters and every count go by `bucket()`,
  where an asking chat is a ready one — only the order knows the difference, in the list and in ⌥⌘K. **The lines
  between the cards** (`.gsep`): **a lane's head over each group** (2026-10-09, `laneHtml`, `.gsep.lane.<group>`; one
  divider between the clauding and the ready cards before) — its mark, its name (`.ln`: *Asking you · Clauding · Ready
  · Done*) and its count at the right end, none under a query; the Clauding head's mark is **Claude's in pixels**, a
  9 × 9 window on a strip of frames drawn from `PIX_SHEET` (`#` a pixel of 2 px), `pix` sliding it a frame at a time
  (`steps(1, end)`), `pixhop` lifting it on the burst; both transforms, 2.4 s, phased by `phaseAnims()` — and a still line **under every run of cards from one day** (`dayHtml()`): the day centred — `today`,
  else `DD-MM-YYYY` (`dayName()`, by `wordAt`). A day's line closes the cards *above* it, so the oldest day gets one at
  the bottom; the list is grouped first, so a day can come back and each run gets its own line.
  → `scripts/scenarios/day-separator.mjs`.
* **Ticking the open chat moves on** (2026-09-30): `tickDone` — the card's ✓ and ↩, the chats step's ✓ — opens the
  card below it in the list as shown, else the one above, stepping over done cards; a chat ticked while another is
  open moves nothing. The move is made **at the click**, not on the server's answer (an empty chat's `session` event
  would `leaveChat` first). → `scripts/scenarios/tick-next.mjs`.
* **The list's frame reads its geometry once** (2026-09-27): `listChanged()` runs once a frame — `listGeom()` (every
  card's top and height, the window, the rail) first, then `drawEdges(g)`, `drawTimeline(g)`, `drawSplit(g)` and
  `drawTrail(g)`. A read after a write is a layout each; keep the reads at the top. The pointer
  handlers call `tlGeom()` (the same function) themselves. **It follows the list's motion** (2026-10-02): a rect read
  mid-slide is where the slide has got to, so while a slide or a fold runs (`follow()`, `sliding`) the frame is drawn
  every frame and once after — drawn once after the render, the splitter's colour and the open chat's light stood
  where the card had been until the next update; and the open card's own size is watched (`watchOpen`). A new
  animation that moves cards goes through `follow`. → the slide step of `scripts/scenarios/open-light.mjs`.
* **The list's two ends count the cards out of sight**: `#sup` / `#sdown` (`.sedge`), over the list's grid cell (so
  `#slist` has a definite `grid-column`), a pill on a fog of `--bg`; a card is out of sight when its *middle* is past
  the edge (`drawEdges`, by `offsetTop`, hence `#slist { position: relative }`). A dot: red when one out there is
  asking, amber when clauding. A click scrolls a screenful. Redrawn on scroll, after every render, on the list's
  `ResizeObserver` and from `applyCards`. An end that is off keeps its words while it fades.
  → `scripts/scenarios/list-ends.mjs`.
* **The timeline is the list's scrollbar, with the days on it, out of sight until called** (2026-09-28): `#tline`,
  laid over the list's own cell (`justify-self: start`, row 2), `display: none` on the rail of squares; the native
  scrollbar is hidden. **Hidden** (`visibility`, which its labels' own `pointer-events` cannot undo), the cards have the
  whole width — 8 px from the list's coloured edge, as from its right (`#slist`'s padding). **The pointer held on that edge** (x under `TL_EDGE`, within
  the list's row) for `TL_DWELL_MS` calls it out, swollen round the pointer (`#sessions.tlshow`, `show()`, a document
  `pointermove`); off it and not dragging, it goes `TL_HIDE_MS` later. `peix.state().timeline.shown`. **Shown, the
  thumb**: 12 px wide (`TL_W`), an orange pill (`--spend`), never under `TL_MIN`, wider under the pointer. **To scale**: the rail's inner height is the list's `scrollHeight`, a
  label is where its run starts, the thumb is the window. A run (`tl.runs`, built in `renderSessionList`, none under a
  query) is one day *and* one state group in a row. **The Dock's swell is a fisheye** (`tlWarp`, Sarkar–Brown,
  radius `TL_R`) around the pointer, which stays a fixed point — so a drag reads the list's position off the pointer
  (`tlScrub`, holding the thumb where it was grabbed). Every day's label comes out, the nearest largest (`TL_MAX`),
  overlaps culled nearest-first; a pane of glass goes over the list (`.tl-glass`, `#sessions.tlon`). The swell is by
  the clock (`tlAnimate`, `tl.k` linear, `tl.K` eased; `REDUCED` jumps). A label clicked scrolls its run under the top
  pill; a wheel over the rail scrolls the list. (The day beside the thumb while the list scrolled elsewhere went with
  the rail going out of sight.)
  `peix.state().timeline` has `k` and the runs. **What counts as the rail is `.tl-catch`**: from x = 0 to the cards'
  edge (`TL_CATCH`) and, while the days are out, as far right as a label has reached plus 28 px (`tl.reach`). A press
  there on no label is a press on the label ringed `.near`; a press on the thumb *as drawn* holds it where grabbed.
  → `scripts/scenarios/timeline.mjs`.
* **The status bar is the machine at the window's foot** (2026-10-09, the studies' F — Orca's; `#sbar`, `renderBar`,
  `body`'s grid row 2; on by default, Settings → Board → *status bar*, `prefs.statusBar` → `<html data-sbar>`): the
  connection (the stream's open and error, `bar.conn`), the chats live · clauding · asking, the drawers · shells ·
  monitors, then on the right what the settings add (`prefs.sbStats`: CPU, memory, Claude's memory — `GET
  /api/stats?want=cpu,mem,claude`, every 3 s while shown and visible, `machineStats` on the server: the cores' busy share
  since the last ask, vm_stat's used as Activity Monitor counts it, `ps` over the registry's live claude pids), **the
  plan usage as meters** — with the bar on, the list's foot has none (`:root[data-sbar] #usage`) — whose click lifts its
  rows in a panel (`usageRows`, shared with `#usage`; a click elsewhere, by `composedPath()`, puts it away), and the
  Mac kept awake (a click lets it sleep). Drawn by markup (`setHtml`) from `renderBoard`, the usage, the awake state,
  the stream and each stats answer. → `scripts/scenarios/status-bar.mjs`, the stats in `test/awake.test.mjs`.
* **The plan usage is words at the row's end** (with the status bar off; the bar's otherwise): `#usage` in `#sfoot` — `5H 42%  1W 75%  F 95%`, a tag per limit
  (`uShort`: 5H, 1W, a model's initial for its own week, CR for a credit grant — which stays out of the row, `.grant`
  (`uGrant`: no reset and no money) —, $ for a cap in money, whose row over it adds what is spent of what, `.umoney`)
  set in the rounded face, heavy, on a wash of `--u` (the window's colour, on the chip), the percent beside it.
  **The rows** — name, a bar in `--spend` (red from 90 %, `uColor`), a tick where the window's clock stands (`uPace`,
  for the windows `uSpan` knows), percent, time to reset — **are a panel over the row** (`.uopen`), on hover a beat late
  or pinned by a click on the words (`.pin`; its heading or a click elsewhere lets go). On the rail, rings stacked with
  the percent inside and the tag under each, over the fish. **The
  markup holds both shapes** and CSS picks (`main.scompact`). `loadUsage()` on load, every `USAGE_EVERY_MS` while visible, once a window's reset
  has passed, and on the way back to a hidden page, **backing off on failures**; a failure keeps the last numbers,
  `.stale`. The server's `USAGE=off` answers `off: true` and the bar hides — every test server.
  → `scripts/scenarios/usage-bar.mjs`.
* **State lives in four places**: the server's `~/Library/Application Support/peixAIrada/state.json` (done ticks,
  named projects, board titles, pins, hidden, the environment each chat was started in, notifications on or off, PR
  turns; `STATE_FILE` overrides) and the user's `~/.config/peixairada/config.json` (the setup, below), both shared by
  the app and every browser; the browser's `localStorage` `peixairada-prefs`
  (selected project, filters, widths, zoom, folds, card size and compact's same height, simple colours and their one colour, the person the list is narrowed to, ⌥ as Meta, auto-resume, the edge light, the floating header, the status bar and what it adds, drawer open/height — the keys are the `prefs` literal,
  and old ones are deleted on load); and never `~/.claude`. `renderHead` re-runs on every SSE update — anything it
  renders reads its state from prefs. **`state`'s keys are declared in its literal**; add there, not at first use.
* **The setup is the user's file, and nothing about one Mac is written in the code** (2026-09-28; the file since
  2026-10-01): `CONFIG_FILE` — `$XDG_CONFIG_HOME/peixairada/config.json`, **beside `STATE_FILE` when that is set**
  (so every test server has its own); the state file's old `config` is moved there **at boot, never on an import**
  (`loadConfig()` from `main()` — a test imports the module against the real state file), and `saveState` no longer
  writes it. Written in place (a dotfiles symlink stays one), two spaces, a root under the home as `~/…`; **re-read
  on a hand edit** (`reloadConfig`, a stat every `CONFIG_POLL_MS` against `configStamp`, the board's own record — a
  `fs.watchFile` missed a file made and gone between two looks); one that does not parse is `error` on the config,
  the board keeps what it had, and a PUT is refused (409) rather than write over it. It holds `roots` (`[{dir, org}]`: the folders of repos ⌥⌘N lists, the org ＋ clone asks), `quick` (⌥⌘O's project, which
  wears the crystal ball), `projects` (`{name: {abbr, color}}`, by shown name) and `jira` (`{site, email}`: the site
  an origin — `jiraSite`, http only on loopback —, null for none; 2026-10-08). `cleanSetup` shapes it (strict for a
  PUT: says what is wrong, asks that a root exists); a key never set is the default at read time (`boardConfig()`: the
  roots from `ORG_DIR` / `ORG` when either is in the environment, else none). `GET/PUT /api/config` — a PUT replaces
  the keys it gives —, a `config` event, `config` in the snapshot; the page's `state.config`, `configChanged()`; the
  config also carries `file`, `error` and `ask`. **`ask` is the first run** (roots never set, none in the
  environment, the file readable): the page's `#welcome`, a modal over everything (`welcomeSync`, from the snapshot
  and `configChanged`), asks for the folder and its org, filled from `GET /api/config/suggest` (`suggestRoots`: the
  parents of the checkouts the chats ran in — `checkoutOf`, a worktree's or a submodule's `.git` file climbing to its
  repo —, then `ROOT_NAMES` under the home; the org by the commonest `origin` in their `.git/config`, `orgOf`). Skip
  is `roots: []`, an answer; Esc only puts it off; a folder under the home not there yet is made on a second click
  (`create: true` on the PUT, the welcome's only); in the app, Choose… is an `NSOpenPanel` (`chooseFolder` →
  `peixFolder`). Test servers set `ORG_DIR`, so the welcome never shows there unless a scenario clears it. The
  settings' Setup pane draws it (`renderSetup`, never under a box that has the keyboard): **three sections —
  Repositories, Quick chat, Projects — each a title and a line over an inset list of rows** (`.sg` › `.sgh`, `.slist` ›
  `.srow`; 2026-09-28, night); a path or a name is text until hovered or focused, the org and the short name wear a
  fill, and a project's row leads with its rail square (`.stile`, `tileStyle()`: Peacock's colour, else the setup's,
  in `inkOn`'s ink), which follows the short name and the colour as they are typed and picked. The scenario reaches the
  rows by `.srow.root(.add)`, `.sdir`, `.sorg`, `#quickSel`, `.srow.proj`, `.sab`, `.ssw`, `.sadd` — keep those names.
  → `test/config.test.mjs`, `scripts/scenarios/cog-setup.mjs`, `scripts/scenarios/welcome.mjs`.
* **The page asks the server through `api(method, url, body)`** (2026-09-27): JSON in, JSON out, a throw with the
  server's own `error` (else the status) when it says no — `e.status`, `e.body`. Every caller says what went wrong
  where it happened, or catches on purpose. The attach upload keeps a raw `fetch`: its body is a file.

## Hotkeys and the pane

* **`HOTKEYS` in index.html is the whole ⌥⌘ family**: T this chat's shell tab (`hotShell()` →
  `POST /api/sessions/:id/shell`, a holder running the login shell `-l -i` in its folder, `s.shell`; the tab wears its
  name, `shName()`), E the VS Code *Web* button
  (in the pane; nothing opens the real VS Code since 2026-09-29, when *open in VS Code* went), G the chat's PR on GitHub — one
  opens straight away, several open the picker in `pr` mode, the one showing marked *current* (no PR → the folder's
  GitHub repo, `state.repos` from `git remote`) —, C this chat's claude session (`termAction()`, the `>_` button's
  path), **W the tab the keys are in, closed** (`hotCloseTab()` → `dropTab()`: the zsh ended, a page or the editor let
  go; on the chat's own tab a `note()`), P the project picker, K the chat picker (`chat` mode: every ready or clauding chat, the list's order,
  searched by `chatFields()`; ⏎ is `openSession`), **F the chat list's own box** (`hotFind()` → `qShow(true)`), **B the chat list
  folded to a rail and back** (`toggleSessions`; plain ⌘B until 2026-10-02 — VS Code Web keeps its ⌘B, gives up its
  ⌥⌘B), N a
  chat as steps of the one dialog (`new` → `chats` → `folder` when the project spans several → `env` when
  `newChatIn()` finds launchers), **O the same with the project answered and the environment brought forward**
  (`hotOracle()` → `newChatIn(cwd, 'chats')` on the project the setup names, `state.config.quick`; none named, or
  off the board, is a `note()`), ↑ / ↓ the
  chat above or below in the list as shown (`hotMove()`), ← / → the tab beside in the strip, wrapping (`hotTab()` →
  `openTab()`), **1 / 2 the top and the bottom half of the chat column stood one over the other** (`hotGroup(g,
  true)`). Capture phase, `e.code` (with ⌥ held `e.key` is a symbol). A `dialog[open]` swallows them; no chat or no PR
  is a `note()`. **A key held down is one press** (`e.repeat` is swallowed, the arrows aside), and `termAction` takes
  one press per chat at a time (`termAsking`). **A late answer acts on its own chat only**: `renderHead` draws the open
  chat's header and nothing else, a drawer the server just started attaches through `showTerminal` (the half holding
  its chat tab, if still open), and ⌥⌘T's zsh and the editor's page wait on a chat that was left. The cog lists every key (`.keys` in `#settings`) — keep it in step by hand, with `boardKeys` in
  main.swift.
* **Plain ⌘ is the window's shape, and lives in `CMDKEYS`**: **1** and **2** the left and right halves of the chat column — ⌘2 splits it the first time —,
  **W** closes the half the keys are in, or a dialog that is up, **0** closes the *other* half (`hotOnlyHalf`; with
  one half it is the chat's size back to normal). ⌥⌘ is "this chat, over there", ⌘ alone is "this window, this
  shape". `peixKey(code, mods)` carries which map and **returns whether the key was taken**; `cmdKeys` in main.swift
  is the forwarder's copy — a digit goes over as `Digit<n>`. ⌘K is *not* here (the drawer's clear) and neither are
  ⌘+ ⌘− (`chatZoomKey`, which sees ⌘0 only when nothing is split). **⌥⌘1 / ⌥⌘2 and ⌥⌘B are the ⌥⌘ keys
  about the shape**: the same two panes stood one over the other — see *The chat column's two halves* —, and the fold.
* **⌘W is the Window menu's item, not the forwarder's**: a key equivalent is dispatched before any responder, so the
  page never sees ⌘W in the app. `closeHalfOrWindow` asks the board (`peixKey('KeyW','cmd')`) and calls
  `performClose` only when it answers false. Anything else the board wants off a ⌘ a menu item claims goes the same way.
* **⌃⌘F is the board's own full screen, up to the notch**: `toggleFill` in main.swift — the window borderless
  (`BoardWindow`), its frame the whole screen, the menu bar auto-hidden **beside a camera housing and hidden outright
  on a screen without one** (`placeFill`, on the fill and every change of screen, 2026-09-28: there the menu bar's strip
  is the head row, which an auto-hidden one slid over; the housing is the screen's top safe-area inset, mirroring
  included) **and let out, there, by the pointer held at the top edge for 1 s** (`menuOut`, back once the pointer is
  100 pt down and the system has hidden it — `NSMenu.menuBarVisible()`; `fillOptions()` is the one spelling of the
  options); **beside the housing, coming forward across a change of desktop left the auto-hidden bar out** — the
  options right all along — so `tuckMenuBar` hides it outright for 0.1 s half a second after (2026-10-03; the log
  says `menu bar: tucked`), and **the Dock hidden, out only after the pointer
  has been held at its edge for 0.7 s** (`dockTick`, a 10 Hz poll while filled *and the app active*; `dockSide` read
  when the poll starts, `startDockTick`). The system's full screen always sits below the camera housing, so the
  window does not offer it: `collectionBehavior` is `.fullScreenNone`, **the green button zooms and
  `windowShouldZoom` makes a plain click on it the fill** (⌥-click and a double-click zoom). **The fill is
  remembered** (`peixairada.fill`). The page hears `peixFill(on, notch)` — the strip's height and the x range the
  housing covers, in CSS px; null on a screen without one — on every toggle, screen change and board load, and
  `layoutNotch()` lays the top row around it (reads, then writes; returns at once with no housing and nothing to
  undo): the chat list's head stays put while the list ends short of the housing, the chat header keeps its title
  left of it and its chips right — at the far right, `.shead.hole > h2 + *` taking the free room as a margin (`.hole`:
  the h2's width and right margin, which `fitHeadPrs` then measures) — **unless the title's whole text does not fit
  left of the housing** (a `Range` measures it; `scrollWidth` is never under the box's): then `.tright`, the h2 grows
  again and the title's own margin jumps the housing, the project alone staying left (`fitHeadPrs` reserves the jump
  and `TITLE_ROOM`), and
  whichever has not the room pads down by the strip (`.npad`). `NSFullScreenMenuItemEverywhere` is registered false;
  the frame's autosave is off while filled; ⌘W leaves the fill first; Info.plist says
  `NSPrefersDisplaySafeAreaCompatibilityMode` false. On this Mac the strip is 32 pt and the housing x 771.5–956.5 of
  1728. **From a shell, `kill -USR1 $(pgrep -x peixAIrada)` is the same toggle** — the app log says `fill: on …`.
  → `scripts/scenarios/notch.mjs`.
* **The pickers match fuzzily, and with something typed the best match leads**: `fuzzy(fields, q)` — each word of
  the query hunted *within one field* (`chatFields(s)`), letters in order, a run worth more than scattered ones, a
  word's start worth more than its middle, a gap costing; a field's worth falls off down the list. `hunt()` ranks; an
  empty box leaves every list in its own order. `markHits()` bolds what landed (`fuzzMarks`), runs merged. `pickRender`
  fills `pick.list` and a `row` per mode and clamps the selection once.
* **The chat list's magnifier matches the same way, and ⌥⌘F opens it**: `renderSessionList` scores each chat with
  `fuzzy(chatFields(s), q)` and, with something typed, sorts by the score and **draws neither the divider nor the day
  lines**. The title and the folder name are bolded (`markHits`). ↑↓ in the box walk a `.qsel` card, ⏎ opens it and
  keeps the query; the mark shows only while the box has the keyboard (`markQsel()`, on every render). Done chats, the
  project in view and the state chips still apply. → `scripts/scenarios/chat-filter.mjs`.
* **The last step of the new-chat flow is a list of chats**: the `chats` step is the scope's ready and clauding chats
  by `byWord` under a ＋ *new chat* row that carries on with the flow — `scopeChats()` / `chatsStep()` /
  `newFromChats()`; **it shows even when the scope has none**: ＋ alone, so ⏎ starts a chat and esc walks away. ⌥⌘N
  scopes it to the project, ⌥⌘O to *one environment* (`then: 'chats'` rides the `folder` and `env` steps). Typing
  filters the chats only, and moves the selection off ＋ onto the first match. A chat's environment is `s.env`; a chat
  with none shows under ⌥⌘N and under no environment. The `env` step counts what each environment holds
  (`pillsHtml(envCounts(cwd, name))`) and a card whose chat has an `env` wears it beside the folder name (`.chip.env`).
  **Each idle chat's row has the card's ✓** (`button.pkdone`, `canTick(s)` — the card's rule too), under the pointer
  or the selection; ticked, the row leaves on the `session` event (the step redraws with `pickRender(true)`, which keeps
  the selection on its chat) and the picker stays up. → `scripts/scenarios/new-chat-flow.mjs`.
* **The project step holds the folders you have no chat in, and clones one you have not got**: after the board's own
  projects come the folders directly under each of the setup's roots that are on no project (`freeFolders()`, by the
  exact cwd), and a query that names none of them is offered last as **＋ clone `<org>/<name>`**, a row per root with
  an org (`cloneRows()`, never filtered out). `GET /api/folders` lists them (`{roots, folders}`, each folder with its
  `root` and `org`), cached by each root's mtime; `POST /api/clone {name, root}` runs `gh repo clone <org>/<name>` into
  that root (no `root`: the one root with an org, if only one) — **with the welcome's *make it* (an empty folder of
  repos under the home), the only thing the board writes outside its own state and config** — and `cloneAndStart()` carries on into the same flow. A long path belongs beside the name (`.cur`),
  never in the row's `auto` column. → `scripts/scenarios/new-project.mjs`.
* **The settings are one modal dialog** (`#settings`, 2026-09-28; the cog's popover before): **⌘,** (`CMDKEYS.Comma`,
  in the app the app menu's *Settings…*, which asks `peixKey` as ⌘W does), the chat header's ··· (`#settingsBtn`, the
  menu's last row) and, with no chat open, the empty header's own ··· (`#noChatMore`, delegated — `leaveChat` rewrites
  the header). A head (the name, the counts, × `#settingsClose`), a segmented control (`.stabs`) over three panes
  (`.spane`): **Board** — the notifications switch (`#notifyOn`), the rings' step (`#ringsInStep`), the edge light (`#edgeLight`), the floating header (`#headFloat`), the status bar (`#sbarOn`) and what it adds (`#sbarStats`), the cards' size
  (`.dens`), auto-resume (`#autoResume`), ⌥ as Meta (`#optMeta`), what is hidden (`#hidden`) — no date format (DD-MM-YYYY, `fmtDate`); **Setup** — the server's (`#setup`); **Keys** — the list (`.keys`). The class
  is still `pop`, so every row keeps its `.pop …` rule. Esc, the backdrop, ×, ⌘, or ⌘W close it; its `close` drops a
  setup row half typed. **It is modal**: the pane is down while it is up (`postPane`), and the ⌥⌘ / ⌘ keys are swallowed
  under it — close it first (the scenarios do). The fish is the SSE light and, clicked, **the About box** (`#about`, a modal dialog:
  version, process and paths from the snapshot's `about`, and the chats' counts). **Long code is always folded**
  (2026-09-28): a block over six lines, no switch in the settings and no `{ }` row per chat. **Every `pre` in the transcript is
  inside a `.codebox`** (2026-09-27, night; `md()`): the bar with the language and the copy button is its first
  child, a folded block is `details.codefold > summary + .codebox`, and a rule that reaches a `pre` goes through the
  box. The copy click is delegated on `#log`.
* **In the app the pane is a native view** over the chat column with its own web views: a key pressed there never
  reaches the page, so `installHotkeyForwarder()` forwards ⌥⌘ + the letters and the arrows, and ⌘ + the layout keys
  (`hotkeyCode()`), to `window.peixKey`, and **a click on a page there as `peixPaneFocus(key)`**
  (`installPaneClickMonitor()`, 2026-09-28), so the half with the keys — ⌘W's, ⌥⌘W's — follows the pointer into a
  page too; the shell reports `peixPane(visible, left)` — **a dialog open lowers the
  pane** so every picker is centred: `postPane` sends no page while a `dialog[open]` exists, and every dialog's
  `close` puts it back; `postPane` posts only a message that differs from the last. Esc with the pane up is forwarded
  as `peixKey('Escape')` — `hotEscape()`: a dialog or the settings popover closes first, else the chat tab comes back.
  **With the pane hidden, Esc is the page's**: a capture-phase handler closes an open dialog or popover itself and
  `preventDefault()`s; with nothing to close the key is untouched.
* **The app hears the board's own state** (2026-09-27; an injected script with its own SSE stream before): the page
  posts `{type: 'state', needs}` from `renderBoard` when the chats waiting on you change (`postState`), each alert as
  it comes with `serverNotify` (the snapshot's `notify === 'native'`) and `quiet`, and the pane's places; the shell's
  `hub` handler reads only those. `refreshBadges` redraws the badge and the status menu only on a change (`badged`).
  **Since 2026-09-27 (night) also `{type: 'chat', project, title, cwd}`** from `renderHead` (a new header) and
  `leaveChat` (`postChat`): the window's title and its `representedURL`; and a `state` with a chat that was not asking
  before, while the app is in the back, bounces the Dock once (`requestUserAttention`).
* **The page owns the tabs**: each half's strip lists — each tab with its mark before its name (2026-10-08: Claude's
  burst, the prompt, a PR's or a globe, VS Code's) — `chat` (`claude` while the session runs here), `shell` while a
  zsh lives, `gh:<url>` per web page the chat opened (any page; the strip's ↗ is the way out to the browser) and
  `ide:<url>` for its folder's editor — `tabKeys()` from `state.paneGh` (per chat) and `state.paneIde` (per folder);
  `tabs` holds each chat's `[left, right]`, read back through `placeOf()`. `syncTerm()` keeps both bodies right and
  posts one `{type:'pane', id, keys, panes:[{key,left,top,width,height}], focus}` to the shell (`postPane`): it keeps
  a web view per page (`paneViews`, up to `paneViewsMax`, the chat's own spared) and places each one in its half.
  **The overlay covers the whole window** and lets a click that lands on no page through (`PaneOverlay.hitTest`);
  ⌘F's bar is placed from the focused page's rect. `‹ › ↻ ↗` in the strip are `{type:'nav'}`; × forgets a page
  (`closeTab`). In a browser the tabs are chat and zsh only (`inApp`). GitHub cannot be iframed, hence the second
  `WKWebView`; a web view with no UI delegate drops `target=_blank`, hence `PaneDelegate`. → Findings: *the pane*.
* **A page in the pane behaves like a browser tab**: **⌘R** reloads *it* while the pane is up (the View menu's item
  renames itself in `validateMenuItem`), **pinch zooms** it (`allowsMagnification`), and **its address sits in the
  strip**, scheme stripped, a click copying the whole URL (`copyPaneUrl`). A KVO watch on each view's `url`
  (`paneObs`) reports every navigation as `peixPaneUrl(key, url)`, kept per key in `paneUrls`.
* **⌘F finds on that page**: the Edit menu's *Find… · Find Next · Find Previous* (⌘F · ⌘G · ⇧⌘G), greyed out with
  the pane down. The bar is native (`buildFindBar`, a `NSVisualEffectView` over the pane's **top right**, in `content`
  above the pane) and drives WKWebView's own `find(_:configuration:)`: no match count, the match *is* the page's
  selection, so closing the bar drops it (`kDropSelection`). Typing searches from the top (`runFind(fromTop:)`), ⏎ /
  ⇧⏎ step, a miss turns the text red. A pane change closes it; `findQuery` outlives it.
* **Both web views are inspectable** (main.swift sets it): Safari → Develop reaches the real app.
* **The app's server lifecycle** (`ServerController`, main-thread throughout): `start` adopts a server already
  answering, waits for the launchd agent when its plist is installed, else runs the bundled one — one at a time,
  ended when given up on — with its log *appended* (`O_APPEND`); `restart` is `launchctl kickstart -k` for an adopted
  agent, and otherwise waits for the probe to fail before starting again; the 5 s watchdog probes `/api/projects` and
  brings the board back over a message once the server answers (`boardShown`). A web process that dies is loaded
  again. `logLine` writes on its own queue with one formatter and one handle. The bridge answers the board's own main
  frame only.

## The chat column's two halves

* **⌘2 splits the chat column, ⌘1 / ⌘2 are the halves**: each has its own tab strip and body, and both pick from the
  *one* open chat's tabs. The left half keeps the plain ids (`#ptabs`, `#term`, `#termBody`, `#log`): it is the whole
  column while nothing is split, and the harness reads it by those names. `GEL` maps each half to its elements,
  `terms[g]` owns that half's xterm and socket, and the take-over state (armed, failed) is the board's `drawer`.
* **⌥⌘2 splits it one half over the other, and ⌥⌘1 / ⌥⌘2 are the top and the bottom**: **the digit is the pane, the
  modifier the layout** — pane 1 is left or top, pane 2 right or bottom, the keys go to the pane named, and a key
  pressed on the other layout turns the split first (`hotGroup(g, stack)` → `stackSplit`, which is `syncTerm` and a
  refit: nothing re-attached). The layout is the chat's like the split (`stacked`, a set of ids beside `splits`)
  **and outlives it** — `unsplit` leaves it alone. The divider's place is the board's, one per layout
  (`prefs.splitAt`, `prefs.stackAt`). Stacked is `#groups.stack` (`flex-direction: column`; `applySplit` is the same
  arithmetic), the divider 6 px tall and dragged by y; the second strip's ◫ / ⊟ (`.gturn`) turns it too. The app
  forwards ⌥⌘1 / ⌥⌘2 by key code (18, 19). **A zsh ended by its × lingers on the summary with `exited` set** — a wait
  for the tab to go is a wait on that. → `scripts/scenarios/split-stacked.mjs`.
* **A tab that is new opens in the second half, and splits the column the first time** (`openNewTab()` — a zsh, a
  GitHub page, the editor). **Claude keeps the first half**: every split puts the chat on the left (`splitChat()`,
  ⌘2's path too), a new tab goes into the half the chat is *not* in, and Esc, ⌥⌘C and the ◎ row take the keys to the
  chat where it stands (`showChat()`). Choosing a tab that already exists is `openTab()` and never splits. The split
  the board makes itself is remembered in `autoSplit` and **folds back on its own** when the chat is down to one tab
  again (`syncTerm`).
* **A tab lives in exactly one half, and split, each strip lists only its own**: one transcript element, one xterm
  per half, one web view per page. `homes` says which strip a tab is in — the chat's left, every other right
  (`homeOf`), written down only for a tab that was **dragged across** (`moveTab`, pointer events; a press that moves
  under 5 px is a click) and forgotten with the split. `keysIn(s, g)` is a strip's list; `setTab` shows a tab in *its*
  half and takes the keys there. ⌥⌘←→ walk both strips as one row. An auto split whose half empties folds.
* **A half whose one tab is not a web page has no strip** (2026-09-28): split, claude, the zsh or the editor alone in
  a half makes its strip `.lone` — emptied, a 2 px rule, the accent under the keys and the line elsewhere, **the same
  height either way**, so moving the keys resizes no terminal. A web page alone keeps its strip (the address, ‹ › ↻ ↗),
  an empty half keeps its (the drop, ⊟, ⨯), and a half of two tabs is a strip as ever. What the lone tab's × did is
  ⌥⌘W's and the header menu's (*end the zsh*, *close VS Code Web*; `dropTab()` — the keys go back to the chat when the
  half empties); ⌘W / ⌘0 close the half and the keys turn it; a lone tab cannot be dragged. Unsplit, the strip hides
  under two tabs as it always did. → `scripts/scenarios/split-halves.mjs`, `split-stacked.mjs`, `pane-tabs.mjs`.
* **Placement is derived**: `tabs` holds `[left, right]` per chat and `placeOf(s)` reads it against `keysIn` *now* —
  a key that is gone falls away. `tabOf(s)` is the focused half's. A half with nothing says what would fill it
  (`.gempty`) and its strip takes a drop (`.pdrop`).
* **The transcript reads as a conversation** (2026-10-08, from the agent apps): your words are a bubble on the right,
  as wide as they are (`.msg.user`); Claude's run the width under **one who-line a turn** — a text after another of
  the same turn is `.cont` (`logView.lastWho`, reset by a turn's end, an interrupt, a compaction); and **the reply that
  ends a turn has a footer**: *copy* (every text of the turn, as markdown — `.tcopy`, found by `data-ts`) and *worked
  for 12m 4s* — the server marks that entry `turnEnd` and `worked` (`s.turnStart`: your prompt, else a turn's first
  line when a task's notice woke it). → `scripts/scenarios/transcript-turns.mjs` (the tabs' marks too).
* **The transcript moves, it does not multiply**: `placeLog()` reparents `#log` into the half holding the chat tab
  (scroll position carried by hand) and hides it under a live drawer; with no half showing it, it is parked in the
  left one, hidden. **The transcript is appended to, not rebuilt** (2026-09-27): `renderLog` keeps `logView` (the
  array, how many entries are drawn, the trailing run of tool calls and its `<details>`) and renders only what
  arrived (a run of tool calls growing at the end gets its new rows appended, its summary redone); another chat or a
  new array from a fetch starts over. A reconnect (a snapshot with a chat open) is `refetchCurrent()`, in place —
  **your place kept and no pill lit** for the same chat drawn again. **The fetch and the stream are reconciled**
  (`logOf`, `awaitEntries` / `takeEntries` / `mergeEntries`, 2026-10-03): while a fetch is out the stream's entries wait
  in `pending`, and only those past `upto` are taken; a summary older than a `session` event is not (`sessionSeen`).
  `#log` has no `scroll-behavior` — every jump the page makes is a jump. A transcript's images load only when they are
  `data:` (any other is a link to it), and DOMPurify forbids `<style>`, `style=` and form controls but the checkbox. **The log's last child is the presence line** (2026-09-27, night):
  `renderPresence()` — from `renderLog` and the `session` event — keeps `.presence` last while the open chat is
  clauding (the `.pix` sprite and the word) or asking (`askHtml`), and removes it otherwise, **and after it the
  new-reply pill** (`.lognew`, `logNew()`, made on first need): `renderLog` inserts new nodes before that tail, marks
  them `.in` (the fade; never on the first fill) and, when the log is not at its end, lights the pill; the log's scroll
  listener puts it away at the end. Anything else that appends to the log has to go before the tail, and a check for
  "the last message" reads `:scope > .msg:last-of-type`. → `scripts/scenarios/transcript-live.mjs`.
* **Split or not is the chat's**: `splits`, a set of chat ids beside the `tabs` map and lasting as long as it does.
  `syncTerm` calls `applySplit()` on every open, so the column follows whichever chat is in front; only the divider's
  place is the board's. **⌘W closes the half the keys are in**, and each strip's ⨯ closes *its own* half
  (`closeHalf(g)`): what the column keeps is the other half's tab, or the closer's when the other had none. **⌘0 is
  the mirror**: it closes the *other* half. The per-chat maps (`tabs`, `homes`, `splits`, `autoSplit`, `stacked`,
  `focusView`, `state.unread`, `state.paneGh`) are pruned on every snapshot to the chats the board still has.
  → `scripts/scenarios/split-halves.mjs`, the split section of `pane-tabs.mjs`.

## The drawer

* **A drawer is a holder** (`lib/termhold.mjs`): a detached process that owns the PTY (node-pty, `<sh> -l -i -c
  'exec claude …'`, `sh` from the spec — the login shell when it is zsh or bash, else `/bin/zsh`) and the exact screen (`@xterm/headless` + serialize), listening on `<state dir>/terms/<id>.sock`
  — newline-delimited JSON: `in`, `resize`, `snap`, `clear`, `kill`, `quit`, `meta` in; `hello`, `out` (with `seq`),
  `snap` (with `upto`), `clear` (with `seq`), `exit` out. The server connects, proxies pages (`attachTermSocket`),
  adopts holders on boot (`adoptHolders`), and tells a holder its session id once the registry reveals it. An exited
  holder lingers `TERM_LINGER_MS` with its last screen, then removes its files — the socket, the spec and its own log.
  The socket path must stay under 104 bytes — test state dirs are short on purpose.
* **The drawer is automatic**: it is the pane's body while the chat runs here and goes when the process exits
  (`termEnded`); `syncTerm` on every open and update. **⌥⌘T is a zsh tab** beside it: a holder with `shell: true`
  (`shellOf()`, `s.shell` on the summary, one per chat, `exit` or the tab's × ends it); `#ptabs` shows while there is
  more than the chat, and the tab a chat is on is page state (`tabs`). **Done ends the chat's processes** — the
  drawer's holders and a claude live elsewhere (SIGTERM) — from the `done` route. **An idle drawer ends itself**
  (`sweepDrawers`, on the registry poll, 2026-09-27): a claude the registry reports idle, no sub-agent or task at work,
  no page attached, and no word in the chat nor the drawer's own start within `DRAWER_IDLE_MS` (24 h; 0 disables) — as
  Done ends it: the card goes stale and `>_` resumes it. A chat waiting on a question and every zsh are left standing.
  → `test/idle-drawer.test.mjs`.
* **A page that attaches gets the screen serialized, then only what followed it** (`ws.hold` until the snapshot,
  flushed minus `seq ≤ upto`). It replaced a raw byte replay. → Findings: *round three*.
* **The two screens stay in step because nothing reaches one while it refits** (2026-10-03): a grow parks the cursor
  and returns it with a CUU written behind the parser's queue (`refit`), so output parsed in between — the app's own
  repaint after its SIGWINCH — had its cursor moved by the CUU. The holder holds its PTY's output, a clear and a
  snapshot in `held` until `refit`'s `done`, resizes one at a time to the newest size, and reads the cursor behind the
  queue; the page holds its socket's frames the same way (`toXt`, `tm.refits`) but reads the cursor at the call — its
  fit must land at once, for the nudge and `termSize`. A clear is numbered where it was asked for. Measured: two
  re-reads in three drifted after six window resizes before, none after.
* **A drawer whose socket closed while its claude runs is attached again** (`tm.lost`, a backed-off `syncTerm`, 5 s
  at most): a server restart left the last screen up and every key going nowhere. A holder that accepts the
  connection and never says hello is a failure after `HELLO_MS` (it held the boot); the holders are adopted at once.
* **`nudgeTerm()` after every attach** — a resize one row short, then the true size 150 ms later — makes Claude
  repaint over whatever the page holds.
* **`fitTerm` sends a resize only when the size moved** (2026-09-27), **and once it has stopped moving** (120 ms,
  2026-10-03; at once with `now`, as a socket opens): `tm.sent` is the size this attachment last sent and a new socket
  starts over (`attachTerm`); the holder forwards a resize unchecked, and every send is a SIGWINCH and a whole Claude
  Code repaint. The prefs' `termSize` is saved only when it changed.
* **The drawer's geometry**: `grid-template-columns: minmax(0, 1fr)` on `#term` and `#chat`, `min-width: 0;
  overflow: hidden` on `.tbody`, and `.tbody { box-sizing: content-box }` (the fit addon reads the padded size under
  the page's border-box rule). Refits on the body's `ResizeObserver`, on display-scale change (`watchDpr`), on focus
  and on visibility. → Findings: *run off the right edge*, *round two*.
* **⌘K clears the terminal**: the page asks the holder (`clearTerm()` → `{t:'clear'}`), the holder clears the screen
  *it* serializes and echoes the clear back, and that echo wipes every page on that drawer — so a re-attach and a
  server restart stay clear. A nudge follows. ⌃L is still the shell's own.
* **Shift+Enter is a newline**: the drawer sends `ESC CR` itself and swallows the keypress. `macOptionIsMeta` is the
  cog's *⌥ is Meta* (`prefs.optMeta`, on by default; a switch sets it on every live xterm). → Findings: *Shift+Enter*.
* **⌥ over a digit or a punctuation key types what macOS composed**: with ⌥ as Meta, the handler sends `e.key` for the
  codes in `ALT_COMPOSES`, and leaves ⌥+letter to Meta; off, xterm composes them all. → Findings: *⌥ is a compose key too*.
* **The chat header menu's ◎ row types `/focus`** into that chat's holder — Claude Code's focus view, which has no key
  and no API: `toggleFocusView()` sends the command, then reads the newest `Focus view enabled|disabled` line off the
  drawer's screen (`focusSaid()`) and lights `#viewBtn` from *that*; `focusView` (page state) is only what the
  session last said. **Every attach reads that line too** (`readFocusFromScreen()` from `ws.onopen`). The row shows
  while `termLive(s)`; on the zsh tab it shows the claude session. The fake claude answers `/focus` with the same
  line — `scripts/scenarios/focus-view.mjs`.
* **Paths and pages in the chat are links**: a file path in the transcript or on a drawer's line — `/absolute` (under
  a root a file lives under, or with an extension), `./relative`, `folder/file.ext`, `~/…`, `name.ext:12`, one after
  Claude Code's `@` — opens in VS Code at that line (`vscode://file`; relative ones against the chat's `cwd`,
  `PATH_RE` / `pathHref` / `chatLinks`; not after a `+` or an `@` inside a word, or it is quadratic), a web URL opens
  the page in the pane on a tab of the chat (`openExternal(url, { ide, s })`, `IN_PANE` is every `http(s)`; the
  folder's editor is the one the editor row opens, `ide: true`, never a port's guess). The transcript is linkified as it is rendered (`linkify` on each new fragment); the
  drawer has a link provider beside the web-links addon (`termLinks`, `peix.links(y)`).
  → `scripts/scenarios/chat-links.mjs`.
* **Attaching a file is typing its path** (`@dir/file`, spaces as `\ `); the app hands real paths over the bridge
  (`peixDrop`), a browser uploads (`PUT /api/attach`). ⌘V with an image sends ⌃V to claude in the app.
* **`termEnv()` strips only `CLAUDECODE` and `CLAUDE_CODE_*`** (the CLI refuses to nest) and keeps `CLAUDE_DIR`.
  `exit code 129` in a drawer is SIGHUP from its holder ending, not a crash.
* **Take-over**: a chat live in iTerm or VS Code can be resumed here — SIGTERM the other processes, wait, spawn.
  Nothing respawns a CLI claude, and VS Code's extension never respawns one that died. The tab in VS Code goes dead
  and does not follow. → Findings: *VS Code chats can be taken over*.
* **Live chats are never written to** from the board (a second writer on one transcript); stale ones are resumed in
  a drawer.
* **A chat whose claude has ended is its transcript, with the resume bar under it** (2026-10-07; a one-shot
  `claude --resume -p` reply box before, gone with its route): `#resume`, the chat column's row 5, drawn by
  `renderResume` from `renderHead` while `resumable(s)` — no process, a file, no drawer on the chat; Resume is
  `termAction` (>_'s path, ⌥⌘C). **Opening such a chat counts down to its resume** (`armResume` from `openSession`,
  `AUTO_RESUME_MS`; `prefs.autoResume`, the settings' *auto-resume*): the button counts, a line runs along the bar's top
  (`rfill`, its time set from the countdown's), and `termAction(s, { stay: true })` keeps the tab and the keys. Not
  now, Esc outside a terminal, another chat and the switch stop it (`stopResume`); a dialog up holds it. A done chat,
  one whose claude ends while open, and the one a load opens (`openSession(id, { auto: false })`) wait for the button.
  **The harness has it off**: `launchChrome` writes `autoResume: false` into the prefs of every page it drives unless
  set — `verify --hash` drives the live board. `peix.state().resume`. → `scripts/scenarios/resume-bar.mjs`.

## Invariants that bit us — one line each, the story in Findings

* Transcript line types are undocumented: ignore the unknown; drop `isSidechain`, `isMeta`, `isCompactSummary`,
  `<system-reminder>` blocks (strip them *first* — a prompt can follow one) and `<local-command…>` synthetic lines.
* `.cards > * { flex: none }` is load-bearing; `.card { --repo: initial }` too (custom properties inherit).
  `.card { isolation: isolate }` as well: the ring and its cover sit at z-index -1 under the card's background only
  because the card is its own stacking context.
* `.shead { min-width: 0 }` and a fixed `flex-basis` on `.shead h2`; PR chips are direct children of the header.
* **Every grid row in the chat column is placed by hand** — `#chat`'s, each half's `.ptabs` / `.gbody`, and
  `#sessions`' (the rail hides `#filters`), whose *column* is placed too — the timeline, the glass and the ends lie over
  the list's cell. A hidden block is
  `display:none`, which takes it out of auto-placement and slides its siblings up a row; a body that lands in an
  `auto` row sizes itself to the terminal it holds. A new block means placing it too.
* **A terminal that grows has to pull its scrollback back down** (`lib/refit.mjs`, and the page's own copy in
  `refitTerm`): xterm only does it when the cursor is on the last line of the buffer. → `test/refit.test.mjs`.
* Inline code gets a tint, never a border; card glyphs are inline SVG, not emoji; the working ring is the project's
  colour lifted (`--glow`) — `--ring`, which only `.card.black` sets, with white, wins over it.
* **A CSS animation starts over on a rebuilt node, and only `transform` and `opacity` run off the main thread**: a
  card is rebuilt only when its markup changes now, but anything that moves on one is still phased to the document
  clock after the render (`phaseAnims()`) — and nothing continuous animates a custom property, a gradient or a colour.
* **A read after a write is a layout**: the list's frame (`listGeom`), `fitHeadPrs` and `layoutNotch` read everything
  first; keep it so when adding to them.
* `projIcon(name)` marks ⌥⌘O's project wherever its name is written, before the name; `projAbbr` is the folded list's
  squares. Both, and a folder's colour, read the setup by the shown name (`projCfg`) — never a map in the code.
* **The small controls' hover ease is an `:is()` with ids in it, so it weighs an id** (2026-10-04): a `transition` of
  its own on a `.cpr`, `.btn`, `.act`… needs an id in its selector (`#slist .card .top .tprs > *`), or it is the
  ease's, silently — settled rects never show it; ask `getAnimations()` at the move.
* **Never name a modifier class after something the page also selects by**: the walkers take `#slist > .card`; the
  usage's messages wear `.unote`, since `.note` is `note()`'s fixed-position popup.
* No in-page toasts: alerts are the badge plus a system notification; the app sets `NOTIFY=off` on its own server.
  **The cog's switch is the server's word** (`notifications` in the state file, `PUT /api/notifications`, a
  `notifications` event): off, every alert still goes out but `quiet: true`, and the three posters (main.swift, the
  page's `Notification`, the server's osascript) each skip it. A new poster has to read `quiet` too — and `heading`,
  the server's title for an alert that is not Claude's (a PR's turn), which the three put before the kind's words.
  → `scripts/scenarios/notifications.mjs`.
* Swift: `Result<Void, String>` does not compile; `isReleasedWhenClosed = false` on the window; drop -999 in every
  navigation-failure callback; pin the deployment target (`-target`, `LSMinimumSystemVersion`); an Edit menu or no ⌘V.
  **The board's web view draws no ground** (2026-09-27, night; `drawsBackground` off): the window's `backgroundColor`
  and `underPageBackgroundColor` are the page's `--bg` per appearance, so nothing white shows before the CSS lands —
  a change to `:root`'s `--bg` moves the two hex pairs in `buildWindow` with it.
* Sign with the one Apple Development identity (stable team → App Management grants survive installs); chmod
  node-pty's spawn-helper only when the bit is missing (a same-mode chmod is still a write to the bundle).
* macOS has no `timeout(1)`: `perl -e 'alarm shift; exec @ARGV' 60 <cmd>`. BSD sed has no `\b`.
* `pkill -f server.mjs` also kills the app's own server — stop test servers **by port**.
* VS Code Web (`code serve-web`): extensions live in `~/.vscode-server`, trust lives in the browser profile. → Findings: *VS Code Web*.
* Ink redraws only its live region on a resize; earlier lines keep the old width. That is Claude Code's, not ours.
* xterm parses what it is written on its own schedule: read or wipe a screen through `write('', cb)`, never straight
  after a `write()`.
* **`openSession` sets the address before it fetches, and drops an answer for a chat no longer open** (2026-10-02): a
  late answer drew its transcript under another chat's header and put its id back in the address.
* A page out of sight (the harness's Chrome) runs its timers up to a second apart: a listener left for a
  `setTimeout(0)` to remove outlives the next few steps. The drag's click swallow is `once` for that (2026-09-28).

## Verifying changes

**Do not claim a UI change works without loading it in a real browser** — squashed cards, detached fins, column
overlap, lone digits were all invisible in the code and obvious on screen. Look at the screenshots (`Read` renders PNGs).

* `npm run verify -- "<js>"` evaluates one expression on the live board; `--hash <id>` opens a chat first,
  `--shot file.png` saves a screenshot after, `DARK=1`, `URL=http://127.0.0.1:<port>/`. `--dump-dom` is useless here
  (fires before the SSE snapshot); drive Chrome over CDP — `lib/cdp.mjs`.
* `npm run scenario -- scripts/scenarios/<name>.mjs` for anything with more than one step. A scenario exports
  `meta` (`server`, `fake`, `fixture`) and a default `async (ctx) => result`; the runner starts a throwaway server
  on a free port with its own state dir (`lib/testserver.mjs`), builds the fixture (`scripts/fixture.mjs`), runs the
  fake claude when asked, launches Chrome with **focus emulation on**, and ends terminals, holders, Chrome, the fixture
  and temp dirs on exit — after a failed setup too, on SIGTERM, SIGHUP and a stray error too, never waiting on cleanup
  for more than 15 s (`--keep` to inspect). The CDP client rejects every command waiting when Chrome goes and gives one
  up after 60 s; Chrome picks its own port. **`ctx.reload()`** reloads and waits for the new document's snapshot
  (`peix.state().snapshots`) — never a reload and a sleep; `openChat` waits for *that* chat's log (`#log[data-sid]`).
  **A rectangle is read after `ctx.settle()`**
  (2026-09-27, night): the list's cards slide for up to 220 ms after they arrive or change rank, a dialog rises as it
  opens, and a rect read mid-move puts the pointer on the neighbour or a box off-centre; `settle` waits for every
  finite animation (the named slides, the CSS transitions) to end and leaves the endless ones alone — and the
  scroll-driven ones, which run as long as the list can scroll — and for a pending draw. `ctx`: `evaluate`, `waitFor`, `send`, `reload`,
  `sleep`, `shot(label)`, `key(code)`, `cmd(code)` (a plain ⌘), `openChat(id)`, `screen(g)`, `waitPrompt(ms, g)`,
  `type(text, g)` (the drawer's keyboard), `fill(selector, text)` (a box on the page), `drag(from, to, mid)`,
  `peix(expr)`, `server.api/post/terminals/restart/logText`, `fixture.chats`, `assert`. The fifty-one in
  `scripts/scenarios/` are the regression checks for the drawer, the hotkeys, the tab strip and the split, the new-chat
  flow, the project step, the chat list's rules, its filter, its ends, its timeline and its motion, the card sizes and
  marks and the PR stack, the notifications switch, the usage bar, the project cue, the header's PRs and its ··· menu, a PR's turn, the chat's links,
  the notch, reduced motion, the transcript's presence line, the code blocks' bar, the window's title, the cog's setup, the open chat's light, /compact in the drawer, the people row, the tick moving on, simple colours, the first run's welcome, a PR named short, the resume bar, keeping the Mac awake, Jira tickets, the transcript's turns, a PR's CI, the floating header, the status bar.
* **`npm run scenarios` runs the lot**, one at a time — four servers and four Chromes at once is how a suite
  starts failing on the clock rather than on the board. A failure is **run once more**: passing then is reported
  `FLAKY`, and the suite still exits 0; `--no-retry` is the honest gate.
* **Not just after local midnight**: the fixtures are minutes to hours old, so a run then puts a day line between
  them — `card-signals` sees a divider too many (its first quarter hour), `transcript-live` a second node fading in
  (until 02:00: its long chat is two hours old), and `readme-shots.mjs` draws a `DD-MM-YYYY` line into the README's
  board. They fail the same on older commits; wait.
* **The auto fixture's second folder is the temp dir's real path** (`realpathSync(tmpdir())`): a fake claude started
  there registers `/private/var/…`. **Its two chats are a second apart** (`defaultFixture`), so the board's order
  between them is never the readdir's.
* **Every test server gets a fast clock, an empty org directory, and nothing of this Mac's** (`lib/testserver.mjs`):
  `REGISTRY_POLL_MS` 1200, `TASK_GRACE_MS` 400 and `CONFIG_POLL_MS` 200; an `ORG_DIR` of its own under the state dir —
  which also keeps the first run's welcome away; an empty `CLAUDE_DIR` of its own unless given a fixture; the fake gh
  (`GH_BIN`, no PR file: GitHub shows nothing); fake `caffeinate` and `pmset`, run without a password dialog
  (`AWAKE_ADMIN=none`); Jira's token in a file of its own (`JIRA_TOKEN_FILE`), no jira-cli config and no inherited
  `JIRA_API_TOKEN`; a `ZDOTDIR` with no rc files for its drawers' zsh; and no inherited
  `CONFIG_FILE`, `TERMS_DIR` or XDG dirs. Its config file is beside its `STATE_FILE`, never the real one. Up is its own
  `listening` line. `meta.env` is spread last. `waitFor(fn, {timeout, what})`, `srv.post(path, body)` and `tmpDir()`
  (a temp dir that goes with the process) are the tests' polls, POSTs and dirs.
* **Test against the fake claude, not real chats**: `scripts/fakeclaude.mjs` via `CLAUDE_BIN` (the test server's
  `fake: true`) is instant and touches nothing. A test against the real `~/.claude` names it as `claudeDir` outright
  (read-only), uses a stale chat and `DELETE`s the terminals it made.
* **Two measurement traps**: Claude Code stops rendering while the terminal reports focus lost — a headless page's
  `focus()` is not a focus without `Emulation.setFocusEmulationEnabled` (the runner sets it); and **every re-attach
  that moves the drawer resizes it**. **The clean re-attach is a reload of the page** (`Page.reload`, then
  `openChat`): a fresh xterm, built from the holder's snapshot, at one size. That is what `focus-view` does.
* **The page's screen and the holder's are two emulators** fed the same bytes; they drifted by a line on a resize and
  stayed drifted until the next attach — output parsed between a refit's parked cursor and its return (see *The
  drawer*, 2026-10-03). Fixed at the root; a re-sync protocol was tried and was not needed.
* **The fake claude scrolls before it repaints on a shrink** (`drawLive`), as a terminal app would, and after a grow
  erases from the old region's top and draws at the bottom (its cursor went to the bottom while the region stayed
  mid-screen, 2026-10-03). A red drawer scenario can be the fake's geometry, not the drawer's.
* The page's script is one IIFE: read it through `window.peix` (`state()`, `session(id)`, `sessions()`, `prefs()`,
  `term()`, `screen()`) or the DOM; `#termBtn.click()` spawns, an `InputEvent` on `#termBody textarea` types.
* Server logic without a browser: `npm test` (the terminals test is the reference for driving the API and the
  socket); or a fixture tree `CLAUDE_DIR=/tmp/fix` and assertions on `/api/sessions`.
* The app logs to `~/Library/Logs/peixairada-app.log` (alerts, badges, pane opens, drops); the agent's server to
  `~/Library/Logs/peixairada.log` (spawns, adoptions, snapshots). Read those before guessing.

## Deliberately not done

* **The title bar as one surface with the head row** (2026-09-27, night): WebKit insets the page by the bar on its
  own, so in a window the bar is the system's strip above the page; making it transparent puts the traffic lights and
  the title on the head row's fish and search box, and leaves nothing to drag the window by. The page would have to
  lay its top row out around the lights (as it does around the camera housing when filled) and the rail pad down —
  a design for in front of the app, which lives filled. → Decisions 2026-09-27, late night.
* **Making VS Code's tab follow a chat continued elsewhere** — the extension watches only `~/.claude/sessions/`.
* **Attaching to a *live* session from the board** — the session's inbox socket cannot answer a permission
  prompt on your behalf, and its message JSON is undocumented. Live chats are refused on purpose.
* **PR status costs a network call**, so a chat untouched for three days is not polled — opening it asks — and
  merged/closed are cached forever (see *The server*). A card is titled by the oldest still-open PR (`prTitle()`).
* **The app is signed for this machine only**, not for distribution.
* **Chat-level pins** were dropped for sorting by your own last touch; **board-set colours** for Peacock's.
