# peixAIrada — working notes

One board for every Claude Code chat on this Mac. Reads what Claude Code already writes to `~/.claude`; no
private API, no cooperation from Claude Code itself. Built as a PoC on 2026-08-31 and grown from there.

**Three documents, three jobs.** [README.md](README.md) is for the user. This file is the *current invariants* —
one bullet each, under stable headings, what a session must know to change the code without breaking it: the rule,
the names to find it by, the test that holds it. [docs/DECISIONS.md](docs/DECISIONS.md) is the *why and the history*:
dated decisions, open items, and *Findings* — the full stories (this file as it stood on 2026-09-20, 2026-09-27 and
2026-10-12 is there verbatim). **A bullet here is not a story**: no "before" or "until", no pixel-by-pixel look, no
who asked — the date of its decision is the pointer to all of that. **This file stays under 120 000 characters**
(`npm run check` fails past it; Claude Code warns at 150 000): a new finding is a decision entry there and a line or
two here, and a bullet that grows is pared. **A comment in the code carries the date of its decision, never a
person's words**: the request, quoted, goes in the decision entry (the board is shared). **Nothing names the real
org, its repos or the people on its PRs** — `acme` and stand-ins, in the code, the tests and both docs; commits carry
GitHub's noreply address (this repo's `user.email`).

## Run, build, check

```sh
scripts/launchd.sh install          # the server as a login agent, run from this checkout — the recommended setup
scripts/launchd.sh restart [--after N]   # after a server.mjs change; the drawers stay (holders); N s first, so a recap lands
mac/build.sh install                # the native app (bundles node, node_modules, lib/) into /Applications — Swift changes
npm start                           # node server.mjs → http://127.0.0.1:7331, by hand
npm test                            # node:test over test/ — pure logic, and the drawers end to end (≈12 s)
npm run check                       # static: every script parses, the page's script compiles, the vendored xterm = node_modules, shell, swiftc -typecheck, this file's size (≈10 s)
npm run verify -- "<js>"            # one expression on the live board in headless Chrome (see Verifying)
npm run webkit -- "<body>"          # the same in WebKit, the app's engine; --shot is the compositor's own frame
npm run scenario -- scripts/scenarios/<name>.mjs   # a multi-step browser check on its own server (see Verifying)
npm run scenarios                   # all of them, one at a time, with a verdict (several minutes); `-- drawer` narrows it
npm run map                         # rewrite the section maps at the top of server.mjs and index.html
```

* **The server is a launchd agent run from the repo; the app adopts whatever answers on 7331.** Quitting or
  rebuilding the app touches no chat. A page change is live on reload (the agent serves the working tree's
  `public/`); a `server.mjs` change needs `restart`, which does not end the drawers (each is a holder, see *The
  drawer*). The app's bundled server is the fallback for a Mac without the agent. → Findings: *launchd agent*.
* **Node ≥ 22** (the harness uses the global WebSocket), **`npm install` first.** Runtime deps: `node-pty` (native),
  `ws`, `@xterm/headless` 5.5.0 and `@xterm/addon-serialize` 0.13.0 — pinned exactly to the vendored xterm's version,
  which `npm run check` compares with `node_modules`. The xterm client packages are dev-only sources for
  `public/vendor/`; `marked`/`DOMPurify`/`highlight.js` are vendored by hand. Rebuild the app after `npm install` or
  a node switch (it copies `node_modules` and the node binary).
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
| `public/index.html` | The frontend, one file, no build step. A section map at the top of its script |
| `public/vendor/` | `marked` 18.0.11 + `DOMPurify` 3.4.14 + `highlight.js` 11.11.1 + `xterm` 5.5.0 (+ fit 0.11, web-links 0.12) — UMD builds, no CDN at runtime |
| `mac/Sources/main.swift` | The native shell: window, the pane (web views per page), server lifecycle, Dock badge, menu bar, notifications, the hotkey forwarder |
| `mac/icon/MakeIcon.swift`, `mac/build.sh` | The icon, drawn in CoreGraphics; compile + bundle + sign + install (the version is `package.json`'s) |
| `scripts/launchd.sh` | The server as a login agent; `restart [--after N]` |
| `scripts/verify.mjs`, `scripts/scenario.mjs`, `scripts/scenarios.mjs`, `scripts/scenarios/` | The browser harness (see Verifying) |
| `scripts/webkit.mjs`, `scripts/webkit.swift` | The live board in a `WKWebView` (the app's engine), the window captured as its compositor drew it |
| `scripts/fakeclaude.mjs`, `scripts/fixture.mjs` | A stand-in CLI for tests (`FAKE_TUI=fullscreen`: drawn as Claude Code's `tui: fullscreen`; `FAKE_SCREEN`: a screen given); a `~/.claude` look-alike |
| `scripts/fakegh.mjs`, `fakejira.mjs`, `fakecode.mjs`, `fakepmset.mjs`, `fakecaffeinate.mjs`, `faketask.mjs` | `gh` (`api graphql` from `FAKEGH_PRS`, `FAKEGH_VIEWER` — a PR it does not name is a NOT_FOUND —, and `repo clone` offline), Jira's three calls (`startFakeJira`), `code serve-web`, `pmset`, `caffeinate`, `task` — what every test server runs instead of the real ones; each file's head says its knobs |
| `scripts/readme-shots.mjs` | The README's screenshots from a made-up board → `docs/shots/`, WebP — never shoot the real one |
| `scripts/check.sh`, `scripts/check-page.mjs`, `scripts/map.mjs` | Static checks; the section maps |
| `test/` | `node:test` files (`npm test`) |

## How it reads Claude Code

| Signal | Source |
|---|---|
| Transcript, appended live | `~/.claude/projects/<cwd-slug>/<session-id>.jsonl`, `fs.watch(recursive)` — no polling needed. Boot reads the last `TAIL_BYTES` of each; opening a chat reads it whole, a chunk at a time (`readLines`) |
| Which sessions are alive | `~/.claude/sessions/<pid>.json` + `process.kill(pid, 0)`; watched *and* polled every 10 s (pids die silently) |
| Where a chat lives | `entrypoint` on user/assistant lines (`claude-vscode` / `cli`), the registry's while it runs — `inVsCode()`. Several processes on one chat: the drawer's own is `live`, else the newest non-VS Code one; the rest are `rivals` |
| Reply finished | an assistant line whose `stop_reason` is in `TURN_ENDS` (`end_turn`, `stop_sequence`, `max_tokens` unless it cut a tool call, `refusal`; tool calls are `tool_use`) — **or the registry's `idle` with a `statusUpdatedAt` after your last word** (`statusOf`: `/compact` ends with no assistant line) — unless a **sub-agent** is at work: `<slug>/<id>/subagents/agent-*.jsonl` whose last line is not a turn's end, nor its `SubagentHandback` result, nor an interrupt, written within `AGENT_STALE_MS` (`scanAgents()`; a dead chat counts none). A background agent ends the main turn at once; this keeps the card clauding |
| Waiting on the user | **the registry's `status: "waiting"`** — every interactive claude rewrites its `sessions/<pid>.json` on each change (`busy` · `idle` · `waiting` · `shell`), with `waitingFor` (`input needed`, `permission prompt`, …) — `waitingOn()` / `statusOf()`; any live process waiting is the chat waiting, and it beats the agents; **`dialog open` is not asking** (`NOT_ASKING`). **The transcript cannot say it**: the line that asks is written *with its answer* — only the fallback for a claude that reports no status (`s.ask`). The flip into waiting is the `needs-input` alert (`loadRegistry`) |
| Work behind the turn | `Monitor` and a `Bash` `run_in_background`: the tool_result names the task, `<task-notification>` lines carry its events and its end. `s.tasks` → `tasks`; a task dies with the claude that started it (`live.startedAt`), at its expiry (`MONITOR_MS`, `TASK_MAX_MS`) or with the chat's process (`pruneTasks`, on the poll). **A completion delivered mid-turn never becomes a line**, so `sweepTasks` runs **one** `lsof -F n` per poll over every task's output file (held open until the command exits), after `TASK_GRACE_MS`, never on lsof's own failure, names compared resolved |
| Titles | board title (state file) › `custom-title` › the oldest still-open PR › `ai-title` › last prompt — `summary()`, `prTitle()` |
| Model | `message.model` on assistant lines, the last one wins, `<synthetic>` skipped — `s.model` |
| PRs mentioned | `pr-link` lines, GitHub pull URLs *and short references* in user/assistant text; most recently mentioned first; state, title and turn from `gh api graphql`, batched (see *The server*). **A short reference** (2026-10-06, `refsIn`): `#12` the checkout's repo (`ghRepoOf`, a worktree followed), `widgets#12` the org of the root holding the checkout, `acme/widgets#12`, `widgets #12` for a checkout under a root, and a list after one on its line; none in code, a link's text or a URL. **It is on the chat only once GitHub finds a PR there** (`shownPr`); a bare one not when that PR was merged or closed and opened over `REF_AGE_MS` before it was said (`pastRef`); a NOT_FOUND lets it go (`forgetRef`, `noPr`). → `test/pr-refs.test.mjs`. **A PR taken off a chat** (2026-10-11, `unlinkPr`, `POST /api/sessions/:id/unlink`) goes to `unlinked` in the state file: `notePr` takes none of the chat's lines up again, a re-read's too, but a word of yours after. → `test/pr-turn.test.mjs`, `header-prs.mjs` |
| Jira tickets named | `KEY-123` in prose (inline code counts, fenced not), `…/browse/KEY-123` links and the chat's `gitBranch` — `ticketsIn`, `noteTickets`, `noteBranchTicket` → `s.tickets`. **A bare key is asked about only when its project is the site's** (`jiraProjects`, hourly) and **shown only once Jira answered** (`shownTickets`); one Jira lacks is let go (`noTicket`). `bulkfetch` (≤ 100 a call; `myself` for whose), Basic auth from setup.jira `{site, email}` and a token from `JIRA_API_TOKEN`, else the keychain item *peixAIrada Jira* (written by `security -i` from stdin); polled by `prEvery` like PRs; a failure as a whole pauses, 1 min doubling to 30. → `test/jira.test.mjs` |
| Plan usage | `GET https://api.anthropic.com/api/oauth/usage` with Claude Code's own OAuth bearer from the keychain item *Claude Code-credentials* — never reaching the page; `USAGE=off` disables. A cap in money (`limits[]` of `kind: 'spend'`, `extra_usage`'s cents) → `used`, `limit`, `currency` (`usageWindows`). → `test/usage.test.mjs`, Findings: *plan usage* |
| Permission prompts | the registry's `waiting` (above) — they never reach the transcript |
| Chat from the board | a holder runs `claude --resume <id>` or `claude` in the chat's cwd through an interactive login shell (`RUN_SHELL`: the user's zsh or bash, else `/bin/zsh`); it registers like any CLI run; a new chat is tied to its session by pid. **A folder whose Taskfile launches claude** (a task whose description mentions Claude) starts new chats as `task <name>` (`GET /api/launchers?cwd=`, `task --list --json` cached by mtime, `TASK_BIN`; `POST /api/terminals {cwd, task}`): claude is then a *descendant* of the PTY's pid, found through `ps` (`linkTermToRegistry`, `t.claudePid`), and the launcher's name is kept (`noteEnv` → `envs` → `s.env`). A resume never goes through task. **`/clear` or `/resume` in a drawer** gives the pid a new session id: `linkTermToRegistry` moves the holder and pushes **both** chats, the page follows (`terminal` event). **A /clear ticks the chat it left done** (2026-10-10, any claude's): `loadRegistry` sees a process (pid and `procStart`) under another chat (`clearedFrom`), and `tickCleared` marks the old one done once the new transcript begins with the command at or after the old chat's last word; a /resume or a fork leaves it be. → `test/clear-done.test.mjs` |

**Never written: anything under `~/.claude`.** The board is read-only against Claude Code's data. The fake claude
refuses to run against the real directory too — known by its device and inode, at CLAUDE_DIR or any folder above it,
for `$HOME`'s home and the account's.

## The server

* **Only the board's own page may ask** (2026-09-27): every route and the terminal upgrade refuse a request whose
  Origin is not this server's or whose Host is not a loopback name (`foreign()`); no Origin passes (curl, the app, the
  tests), a `null` one is nobody's. An `<img>`, `<script>` or navigation sends no Origin, so `Sec-Fetch-Site` must be
  `same-origin` or `none` when sent — a navigation to `/` aside. Bound to every interface, the Origin must name the
  Host and no Origin is only for this Mac. → `test/origin.test.mjs`.
* **The port first, then the boot**: `main()` waits until `listen` succeeds before it adopts holders, reads the
  registry, polls or saves state; every request and upgrade waits for `booted`. **A route writes its head only once
  its body is in hand**, and the handler's catch destroys a response whose head went out.
* **Nothing the server starts or accepts may emit an unheard `'error'`**: a drawer's WebSocket (`maxPayload` 8 MB),
  every spawn (`code serve-web`).
* **A chat re-read is silent and keeps what the transcript cannot say** (`indexFile` on a chat the board holds):
  `s.silent` stops `queueNotify` for the re-read; `live`/`rivals`/`alive`/`startedAt`/`openedAt`/`agentsRunning`
  carry over, a tail re-read keeps `prev.tasks`, the replaced object's timers are cleared. A registry-made
  placeholder is **not** silent: its first reply is news. → `test/reindex.test.mjs`.
* **A snippet is markdown as a sentence** (`plain`, `plainSnippet` — `lastPrompt`, `lastReply`, the tiles): a link is
  its words, markers go, a GitHub PR or issue URL is `repo#n`, other URLs lose scheme and long segments; backticks
  stay (the page draws them, `ticks()`). → `test/transcript.test.mjs`.
* **`summary()` reads only.** `pruneTasks` (the poll) deletes expired tasks; `sortedSummaries` builds one
  `termIndex()` and hands it to `summary(s, ti)`.
* **Bodies go through `jsonBody(req)`**: `readRaw` decodes the bytes whole; none, unparseable, not an object or too
  large all read as `{}`. Past its limit a body is drained, not destroyed (the 413 must reach its socket); a refusing
  route sets `connection: close`.
* **The state file is written beside itself and renamed over** (`saveState`); one that does not parse is kept as
  `state.json.bad-<ms>` and logged, never dropped and written over. STATE_FILE set never reads the legacy one.
  → `test/state.test.mjs`.
* **One spawn per chat and kind at a time** (`spawnOnce`, `<chat>:claude` / `:shell`). **Nothing is signalled that
  is not the registry's process**: `endClaude(entry)` compares `procStart` with `ps -o lstart=` in UTC
  (`sameProcess`) — a dead claude's file lingers and its pid can be anyone's. → `test/terminals.test.mjs`.
* **The open chat's entries are numbered on the wire**: `/messages` and every `entries` event carry `gen` (which
  reading of the file, `newSession` numbering each) and `upto` (`entryCount`); the page keeps only what is past what it holds, and another `gen`
  or a gap is a fetch (see *The transcript*).
* **The holder socket is `setEncoding('utf8')` on both ends** — a glyph split across chunks decodes whole.
* **Keeping the Mac awake is two switches, and only one is the board's** (2026-10-08, `keepAwake`, `setLid`,
  `/api/awake`, an `awake` event): *awake* is a `caffeinate -i -w <server pid>` held while `awake` is on in the state
  file (one that ends on its own turns the switch off); *lid closed* is `pmset -a disablesleep 1|0` as root — through
  `sudo` first (Touch ID or a NOPASSWD rule; with no terminal a password is a quick failure), then osascript's
  administrator dialog (a cancel is a 409, `cancelled`); `AWAKE_ADMIN` is `sudo` · `osascript` · `none` (the tests).
  **The lid's setting is the system's, never kept here**: `readPower` reads `pmset -g` on every registry poll, with
  the idle sleep in use and the power source (`idleSleep`, `power`); the cup is muted while it has nothing to hold
  off (`cupMoot`, `cupTip`). It is the one thing the board changes outside its own files besides a Peacock colour and
  a clone. → `test/awake.test.mjs`, `keep-awake.mjs`.
* **Every CLI the server shells out to goes through `findBin()`** — `git` too — the app's server has a bare PATH;
  `<NAME>_BIN` overrides; a file it can run, looked for again a minute after none was found. The login agent's PATH
  is the installing shell's, then the system's. **The network calls**: `gh` (PRs), the usage endpoint (one ask at a
  time, kept a minute, a failure half a minute — `planUsage`), Jira once the setup names a site (`jiraAsk`; its token
  never reaches the page or the setup file — `GET /api/jira` says only where it is), and VS Code's update service.
* **VS Code Web is kept on its newest build** (2026-10-11, `freshenVsWeb`, every `VSWEB_FRESH_MS`; 0 off, every test
  server's): the board asks the update service for the newest build and, when serve-web's cache lacks it, asks
  serve-web for **that build by name, `/<quality>-<commit>/`** — never its root, which starts a server — so the first
  open after a release does not wait on its download. Read only under `~/.vscode`. → `test/vsweb.test.mjs`.
* **A PR is polled by how recently its chat was touched** (2026-09-28, `sweepPrs`, `duePrs`, `PR_POLL`): never asked
  → at once; then every minute within the hour, 5 min within the day, 30 within three days, never after. Touched is
  `lastActivity` or `s.openedAt` (a page fetching the chat, which also asks at once unless asked within `PR_TTL_MS`).
  Merged and closed are never asked twice; one in flight is not queued (`prAsking`). **A call that fails as a whole
  changes nothing** and pauses the polls, 1 min doubling to 30. → `test/pr-poll.test.mjs`.
* **A PR you wrote or reviewed has a turn** (2026-09-28; `PR_FIELDS`, `viewer`, `prTurn` — pure): `you` when someone
  else's PR moved past your last review or word, or asks for you again; on your own PR, when someone else reviewed,
  commented or pushed after your last word. Bots are nobody. **Any word of yours answers every reason before it**, and
  only a reason that *came* is a move (`newsIn`). **A move un-ticks every chat that mentions the PR** (`isDone` against
  `turn.movedAt`) and alerts the chat touched last (`notifyPr`, `kind: 'pr'`, a `heading`). `movedAt` is `prTurns` in
  the state file (`moveTurn`), so a restart moves nothing. The PR is also polled by its own newest event (`PR_WATCH`,
  `PR_WATCH_MS`). **A chat done for good** (2026-10-11; `forGoodMarks` → `forGood`, holding while that tick does —
  a word, another tick or ↩ ends it) is `forgotten(s)`: its PRs neither un-tick, rank, alert nor are asked about for
  it. ⌥ held over its ✓ shows the ✕ (`<html data-alt>` from `altHeld` — in the app a key pressed with the pane in
  front never reaches the page). → `test/pr-turn.test.mjs`, `pr-turn.mjs`.
* **A PR knows who had a hand in it** (2026-09-29): every person in `PR_FIELDS` comes with `avatarUrl(size: 48)`
  (`WHO`), and `prPeople` — pure — gives author, reviewers, commenters and pushers, newest first, at most
  `PEOPLE_MAX`, you and the bots left out; a PR the call could not see keeps the faces it had.

## The board

* **Two columns**: the selected project's chats → the chat. **The list's foot is the project filter's whole cue**
  (`#sessions` rows: the list `minmax(0, 1fr)`, the people, the project, the controls): `#stitle` names the project
  (`hidden` on ALL; a click is ⌥⌘P, × back to ALL), and the chat header's folder name toggles it (`.repo.on`). The
  controls row: the fish (the SSE light), `#filters` (the magnifier `#qBtn` opening `#q`, the funnel `#fBtn`), the
  usage (`#sfoot`); no ＋ (⌥⌘N), no cog (⌘, and ···), no « » (⌥⌘B). With the status bar on, the bar holds them (see
  below). On the rail the fish and `projAbbr` (`.ab`) keep the bottom corner. At the notch the cards start under the
  strip (`.npad`); elsewhere flush with the top. → `project-cue.mjs`. A chat is *ready · clauding · done*
  (`bucket()`); the server keeps the finer `status` for notifications and the badge.
* **The cards are reconciled, not rebuilt** (2026-09-27): `renderSessionList` builds `{id, html}` items and
  `drawCards` keeps the node of every card whose markup is what it was (`cardNodes`), makes the others anew, and puts
  them in order with the fewest moves; the lines between cards likewise (`lineNodes`). **An update that moves, adds
  and removes nothing reads and touches nothing.** Anything that mutates a card's DOM directly is lost on the next
  change of its markup. `markQsel` re-toggles `.qsel` after every render, on the chat (`qsel.id`), not its place.
* **What the stream says is drawn once a frame** (`renderBoardSoon`; a 100 ms timer where there are no frames): the
  `session`, `projects`, `peacock` and `pins` events. A landing and anything a click does are drawn at once
  (`renderBoard`, which cancels the pending one). `peix.state().rendering`; `ctx.settle()` waits for it.
* **A box the page redraws on every update is drawn only when its markup changed** (`setHtml(el, html)`,
  `el._drawn`) — a button replaced between press and release loses its click. Whatever edits such a box in place
  forgets `_drawn` (`peixPaneUrl` does).
* **The list moves rather than jumps** (2026-09-27): `drawCards` FLIPs a card that changed rank (WAAPI, `FLIP_MS`),
  fades in one that arrived (`ENTER_MS`) and folds one that left (`leaveCard`, `LEAVE_MS`) — within a screen of the
  window, never on the first draw or under reduced motion. **A folding card is wrapped in `div.leaving` and loses its
  `data-id`**, so `#slist > .card` — the page's and the harness's count — never sees it. `window.peix.motion()` logs
  every move by its `id`. → `list-motion.mjs`. **A landing** is `landed` (`landedAt` from `working` → `idle`;
  `flareLanded()` sets a negative `animation-delay` for `LANDED_MS`, so a rebuilt card carries it on).
* **A card's glow is registered properties, never a `background`**: the lit 3 px edge (`--edge`, the first
  `background` layer) and a glow from it, `--tint` · `--reach` · `--fall`; hover, `.active` and `.qsel` set the
  numbers and the `transition` eases them. A new card state that wants a glow sets the variables. The outline is
  `1px solid transparent` at rest, so nothing moves.
* **Under the pointer a card's glow follows it** (2026-10-09, `prefs.cardSpot` → `<html data-spot>`): a
  `radial-gradient` layer at `--mx` / `--my`, `--spot` strong in `--spotc` — registered, not inheriting, so a move
  restyles one card; `spotSoon` writes it once a frame on the `:hover` card, and after a render (a card redrawn under
  a still pointer is a new node). Not on the rail. → `card-spot.mjs`.
* **Type, corners and motion are tokens**: `--fs-2xs` … `--fs-xl` (10–18 px), `--r-1` … `--r-5` (3–14 px), and
  `--ease-out`, `--spring`, `--spring-soft` (`linear()` curves, read by the script through `cssToken`) and `--t-hover`.
  A new rule takes one — settling eases out, arriving springs —, and a fit that needs its own number says why. **A press
  dips by the `scale` property** (the FLIP's `transform` and the ring's stay theirs): a card 99 % unless the press is on
  a control in it (`:has`), small controls 97 %. → `small-motions.mjs` (the 2026-10-11 motions, one section each).
* **Counts roll** (`rn(key, n)`, `rollSoon`): a count is plain text in `.rn[data-rk]`; after a draw, one whose key
  showed another number becomes a digit strip, plain text again `ROLL_MS` later — so `setHtml` and the reconciles
  compare the same strings, and `textContent` reads the number mid-roll (`.rv`).
* **Dialogs, `.pop` and `.note` ease in and out with `@starting-style`** and `allow-discrete`: a closed dialog is
  still `display: block` for 140 ms with `open` already off — read `open`, never `display`. One that must vanish at
  once sets `transition: none`. `note()` fades its popup (`.out`) before removing it.
* **An age is `data-at`, never words in markup**: `fillAges(root)` writes `rel()` after the list's render, after
  `pickRender` and on the 30 s tick. **A card's `.time` carries nothing at all** — `fillAges` sets it from the chat —
  so neither the clock nor a tool call changes a card's html (a *prompt* still rebuilds it). `dayOf(ts)` is the one
  spelling of a day (`Today` · `Yesterday` · the weekday · `DD-MM-YYYY`). The who-line's time is
  `toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })`.
* **Controls wear a fill, never a grey edge** (2026-09-28): `border: 1px solid transparent` and `background:
  var(--ctl)`, `var(--ctl-hi)` under the pointer; a state is a tint of its colour. `--ctl` is the ink at 7 %, set on
  every element (`*`) so it follows a borrowed `--ink`. Text boxes, dialogs and popovers keep their edges, as does a
  semantic one (a failure's red, an open box's accent).
* **The header's shadow on a scrolled transcript** is `.shead::before` on a scroll-driven animation (`#log`'s
  `--log` timeline, through `main`'s `timeline-scope`); `--shade` from the scroll listener without scroll timelines
  (`SPLIT_SCROLLS`).
* **A name too long fades, not …** (`fadeOver`, `fadeSoon`): a mask only where `.over` says it overflows — the header's
  title and `.purl` on every draw, a card's title once per node (`.ovr`) and when the list's width moves.
* **The broad gradients wear grain** (`--grain` as their first layer: the header, `#log`'s wash, the wallpaper) —
  not the cards, whose first layer is the lit edge the harness reads. A new wide gradient takes it.
* **Accessibility is kept by rule** (2026-10-12): the settings' `.stabs` and each half's strip are `tablist`s
  (`aria-selected`), the small terminals `inert`, `prefs.termReader` xterm's `screenReaderMode`; what colour or motion
  says, words say too, out of sight (`.vh`: a card's lane and *watching*, a CI badge — `ckHtml(pr, said)` —, a tool
  row's state, the unread count); small text reads at AA in both themes (`--pr-*`, `--tk-*`, `--unread`, each theme's
  `--needs`; a done card dimmed by `filter: saturate`, never `opacity`) — **a new small-text colour gets its ratio
  checked**. Increase Contrast, Reduce Transparency and forced colours have a block each; a new fill-only control
  joins the first's list.
* **The small print is one CSS section** (before the reduced-motion block): `text-wrap`, tabular figures for every
  count and age, `::selection` in the accent (`--term-sel` to match), one `:where(…):focus-visible` ring, and
  `overscroll-behavior: contain` on every scroller. A new number, list or control joins those lists.
* **Every animation has its line in the one `@media (prefers-reduced-motion: reduce)` block** at the end of the CSS;
  `drawCards` reads `REDUCED`. A new animation adds a line there, and to `reduced-motion.mjs` if it is a state's.
* **The card's edge is one ring with four readings** — or, with *edge light* (`prefs.edgeLight` →
  `<html data-light="edge">`), the same readings running down the lit left edge (`@keyframes edge`). `--lit` is what
  runs, `--seg` how much of the edge one light owns (`100% / --lights`, one per sub-agent), `--spins` how fast.
  **Clauding**: the project's colour lifted towards white (`--glow`, OKLCH). **Watching** (`s.tasks`): one light in
  `--watch`, slowly — on a ready card too. **Asking** (`needs-input` while alive): no ring — a red border and pings
  (`@keyframes sonar` on `::before` and `::after`, the card `overflow: visible`), the question on the card
  (`askHtml`); answered while alive, `heard` (`heardAt`, `flareLanded`). **The three CSS rules are in priority order —
  work beats a monitor, a question beats both — and each sets every variable.** **The ring is a conic gradient on a
  square `::before` turned by a `transform`, under an `::after` cover 2 px in**: a card with a ring has no border (its
  padding takes the 2 px; the overflow clips at the padding box), and the track (`--track`) shows on the open card
  only. **The live line** (`liveSlot`, `fillLive`, `liveSeen`) is an empty slot in the markup filled after the
  render, its memo in properties, so a tool call or an event keeps the card's node: a clauding card's last tool call
  (the summary's `doing`, `doingOf`; paths by `pathTail`), a watching card's newest event. **`phaseAnims()`** (once a
  frame before paint; `true` at once) puts every `ring`, `edge`, `sonar`, `pulse`, `pix` and `pixhop` at start 0 on
  the document clock — or hashed from the chat's id with *rings in step* off (`prefs.ringsInStep`) — by its
  `currentTime` first, then its `startTime` (see the invariants). → `card-signals.mjs`.
* **The open chat's light runs past its card** (2026-09-29; `#trail`, `drawTrail(g)` from `trailGeom()`): while it
  is clauding or watching, the open card, the splitter down to it (`splitEnd`) and the header's project box are one
  shape, the light running clockwise round its edge — a fixed overlay clipped to a 2 px band (`clip-path: path(evenodd,
  …)`, `outline()`, `insetLoop()`), blobs (`#trail i`) moved by WAAPI transforms, no paint per frame. Pace and lights
  are the card's ring's; `main.trail` stands the card's own ring down; an unchanged shape draws nothing. Not on the
  rail; not round the box under the floating header (`box` null); not at all with tiles. `peix.trail()`.
  → `open-light.mjs`.
* **Folded (⌥⌘B), the list is a rail of squares**: `projAbbr` on a solid tint of the colour, the card's own edge
  (ring, agents, monitor, question) still read; inside the card everything is `display: none` but `.abbr` (it carries
  the tooltip) and `.rdot` (a PR at your move or a new reply, `wantOf` → `data-want`). The lanes fold on the rail too.
* **A project is a folder** (the registry's `cwd`, never the transcript's) **or a named set of folders** (state
  file); worktrees under a repo count as the repo. Pinned projects head the pickers (`state.pins`, `PUT /api/pins`).
  **✕ on a row of ⌥⌘N hides a project** (`hidden` in the state file, `PUT /api/hidden`; `projectList()` and
  `freeFolders()` skip it); its chats still show under ALL; starting a chat there puts it back (`newChat`).
* **A project's colour is Peacock's** — `pollPeacock()` reads the nearest `.vscode/settings.json` at or above every
  folder, stopping short of `$HOME`; the board can set it (`PUT/DELETE /api/peacock`, a text edit of the JSONC,
  tested). None → `--nocolor`, unless the setup gives one (`projCfg`); `#000000` is `BLACK`, with its inks. The
  header's colour square is the picker (`#colorInput`).
* **Simple colours** (2026-10-01, `prefs.simpleColors` → `<html data-colors="simple">`, `applyColors`): `repoColor`
  and `projColor` answer **one colour** for every project, ALL included (`prefs.simpleColor`, `simpleTint()`, black
  until picked; `setTint`), and `:root[data-colors="simple"]` redefines the state, spend and syntax tokens. A PR and
  the people keep their colours. The setup's squares read `ownColor`. **A new colour on the board reads a token or
  `repoColor`, never a hex or `ownColor` of its own, or it shows through.** → `simple-colors.mjs`.
* **A theme is every surface at once** (2026-10-10; ⌥⌘Y, `SKINS`, `skinCss`, `applySkin`): a block of tokens under
  `:root:root[data-skin=…]` (three classes deep, beating `:root` and the dark block), set only beside its own
  appearance. **The appearance is the board's, whatever macOS shows** (2026-10-12): `<html data-theme="dark|light">`,
  which every dark rule reads — **never `prefers-color-scheme`**; a new one is `:root[data-theme="dark"] …` —, set
  before the first paint by the head's script from `prefs.look` and kept by `applySkin`. Worn (`wornKey()`, `skinOn()`):
  `prefs.skin` (a theme, `own-dark` or `own-light`), or with *follow macOS* (`prefs.skinFollow`; the harness's
  default, `launchChrome`) the slot of the system's appearance (`slotOf`: `prefs.skinDark` / `prefs.skinLight`, which
  every pick fills). The app's window wears the appearance kept (`appearance` → `window.appearance`, remembered as
  `peixairada.dark`; none while following), so the pane's pages follow it. The CSS's blacks read `--crust`, `--bar`,
  `--hd-*`. A project's colour moves to the theme's nearest hue (`skinColor` in
  `repoColor`; `prefs.skinExact` keeps it); the drawer's sixteen colours are the theme's (`xtTheme`, `ANSI`). A tile
  clicked reveals from the point (`revealFrom`, a view transition). **A colour that reads no token is one no theme
  reaches.** → `themes.mjs`.
* **The floating header** (2026-10-09, on by default; `prefs.headFloat` → `<html data-head="float">`): `#shead` and
  `#prlist` inset and rounded, **over the chat** — `#groups` spans the header's rows (`grid-row: 1 / 5`, every row of
  `#chat` placed in column 1: two overlapping items, one auto-placed, take two columns). A half with a strip pads down
  by `--float-h` (`floatH`, a ResizeObserver); one without runs up behind it — **but a drawer starts under it while its
  screen has room** (`.gterm.under`, `checkRoom`, `underOf`; a terminal draws from its top). → `drawer-under-head.mjs`.
  **At the notch** its top edge dips round the camera housing (`headNotch` from `layoutNotch`; with tiles along the
  tile's own line — `HEAD_BEND`, `HOUSING_R` + `TILE_BW` —, the border there `svg.hcut`), and a long title runs on
  under the housing, the header lowered by `--hdrop` (`headDrop`, `.tunder`) up to `HEAD_DROP_MAX`, past which it
  jumps the housing as the plain header's does. → `head-float.mjs`.
* **The chat header is a gradient of the project's colour**: `tintChat()` sets `--repo`, `--rink` (the ink on it,
  `inkOn()`), `--rover`/`--rover2` and `#chat.tinted`; no colour, the plain panel header. **The colour eases from chat
  to chat** through registered colours — `--hbg`, `--hveil`, `--hveil2` on `#chat`, `--openc` on `main`; `--repo`
  stays unregistered (its fallback is load-bearing). A new surface in the chat's colour reads `--hbg`. The colour
  square (`.sq.pick`; `colorAt` remembers which header opened it) sits at the `.sep`'s x, out of the flow.
* **Only the project's name is on its colour; the rest of the header is black** — `.shead::after` from `--hsplit`
  down `--hrow`, fading in over `--hfade-w` (`paintHeadSplit()` after `layoutNotch(); fitHeadPrs()` and on
  `peixFill`) — the panel in the light theme off the notch (`main:not(.notch)` sets `--crust` and `--hd-*`). The
  title and everything right of the h2 borrow the dark inks through `:where`, so a control's own rule wins.
* **A colour as dark as that black turns it grey** (`nearBlack` → `main.darkchat`). **On a card, a colour too dark
  or too light for the panel is held where it shows**: `--lift` (`oklch(from … max(l, .62) c h)` dark, `min(l, .72)`
  light) for the edge, glow, spot, border and track; the glow's colour `--wash` is `--lift` but on
  `.card.black:not(:hover, .qsel)`, whose ground stays black. `--repo` stays the colour as set (rail, header,
  splitter). → the black step of `simple-colors.mjs`.
* **With no chat open the column is home** (2026-10-10; `showHome`, from `leaveChat` and a snapshot with nothing to
  open; ⌥⌘0): the sea (`makeSea`, after ascii.rest's *ocean-sunset*, MIT; a canvas that outlives the draws, 15 fps
  while on screen, still under reduced motion; `peix.sea()`), the board's facts (`about.user`, `about.host`), and the
  day — `GET /api/today?since=<the page's midnight>`, a row per chat with its turns, questions (`a`) and monitors
  (`m`). The spans come from the transcript as folded (`noteSpan`, `s.day`), an open question from the registry
  (`live.statusAt`). `homeSoon` on session events; the day asked again each minute and on a landing.
  → `test/today.test.mjs`, `home.mjs`.
* **⌥⌘A is the overview** (2026-10-10; `#ov`, a modal dialog): `ovColumns` — Asking you, Clauding, Watching, New
  replies — every project, never a done chat; a tile per chat (1–9 and ⏎ open, the arrows move, a click on nothing
  closes — `ovNothing`), `ovSoon` on its chats' events; it zooms out of the cards and into the column (`ovZoomIn`,
  `ovGo`). **A tile is a live tile** (the stack's too): the chat's drawer as a read-only xterm (`mountMini` — **it never
  sends a resize**, so the PTY keeps the size the chat's own view gave it; scaled down to .7, then cropped, Claude
  Code's footer below the edge unless asking — `footRows`, `placeMini`), else its tail (`tailHtml` over
  `GET /api/tails?ids=`, every 2 s; the server's `s.recent`, `noteRecent`). A question's answers (`ask.labels`) are
  known only once the transcript has it; one clicked types its digit into the drawer (`answerInDrawer`).
  → `overview.mjs`.
* **The chat header is drawn only when it changed**: `renderHead` compares the header's, the menu's and the PR rows'
  markup with `drawn`, and runs `layoutNotch(); fitHeadPrs()` only for a new header; the handlers are bound on every
  call. Anything that edits the header in place resets `drawn.head` (`editTitle` does).
* **The chat header's row is the title, the PR chips, a task's chip and ···**: its buttons — `#termBtn`,
  `#viewBtn`, `#webBtn`, `#detailsBtn`, VS Code — are rows of `#hmenu`, keeping their ids for the hotkeys and the
  harness (`.click()` works on a closed menu). `#hmenu` is a **non-modal `<dialog>`**, static in the markup:
  `postPane` lowers the pane while it is up, Esc closes it, `runHotkey` closes it rather than let it swallow the key.
  Toggles leave it up (the click-outside test goes by `composedPath()`); actions close it. `>_` comes back into the
  row while armed or failed; a note about a folded button anchors at ··· (`seen()`). → `head-menu.mjs`. The awake
  switches are the status bar's; with the bar off, `#awakeBtn` before ··· and `#lidBtn` in it (`drawAwake()`, not in
  `drawn.head`'s markup). → `keep-awake.mjs`.
* **A PR's CI is said in the chat header only** (2026-10-09): `statusCheckRollup` in `PR_FIELDS` → `prChecks` →
  `checks` (pass · fail · pending) → `.ck` on `.hpr`, for open and draft PRs. **A change is seen** (`prMoments`, keyed
  by `data-url` and place, `prShown`): a first sight plays nothing. → `pr-checks.mjs`.
* **A chat's Jira tickets are chips as its PRs are** (2026-10-08): on the card a stack (`cardTickets`, `chipStack`,
  `.tprs.ttks`, `.ctk[data-cat]`), the branch's first; in the header `.hpr.tk` after the PRs in `#prToggle` (so
  `fitHeadPrs` folds them first) and `.prrow.tk` rows in `#prlist`. Setup's Jira section (`jiraSetup`): site and
  email into the setup file, the token write-only into the keychain (`PUT /api/jira/token`). → `jira-tickets.mjs`.
* **The header's PRs are chips, folded** (`#prToggle`, `fitHeadPrs()`): every width measured once, **`CHIPS_MAX` (two)
  at most**, your move first, the rest behind the whole count (or `+n ▾`); fewer while the title would have less than
  its repo name plus `TITLE_ROOM` and `TITLE_SHARE` of the row; on every new header and the header's
  `ResizeObserver`. **The row never wraps**: the move's line and a task's chip shrink to `--hmin`, then go
  (`.hfold`); ··· stays on the title's line. `#prlist` (`prefs.prsOpen`) is rendered folded too, so ⌥⌘G and the
  harness read `#prlist .prrow`. → `header-prs-fit.mjs`, `header-prs.mjs`, the narrow step of `pr-turn.mjs`.
* **A PR chip GitHub has answered for is solid** (`--prc`, its state's colour), one not known yet an outline. **A PR
  at your move is said by name, not by its chip's look**: `data-turn` (`turnOf(pr)`: `you` · `them` · empty)
  on `.cpr`, `.hpr`, `.prrow` and the tooltips (`turnTip`); the card's line (`moveHtml`, `.ymove`, at every size, not
  on a ticked card — **a card counts nothing**, the others in its tooltip), the header's (`headMove`, `.hmove`), the
  row's `.why`. A new tag slides in (`moveMoments`; `#shead` carries `data-sid`).
* **The card's PR chips end its top row, stacked** (`cardPrs` → `chipStack`, `.top .tprs`): the first four in the
  chat's order with every one at your move; **the pointer fans them out**, and a fan wider than the row scrolls
  (`fanWheel`, its own non-passive listener added on `pointerover`). CSS only — a right-to-left grid, `--d`, `--i`,
  `--under`, `--span` —, the box `flex: 999 0 0` between `min-content` and `max-content`: the row's free room, never
  the folder's name's. → `card-pr-stack.mjs`. **Before them, the faces** (`cardFaces`, `.top .faces`, up to
  `CARD_FACES`, a pile spread under the pointer). The tests hand the fake gh `data:` faces, so nothing is fetched.
* **The people row** (`#people`, `renderPeople`, `peopleOf`): everyone in the PRs of the chats in view, behind
  GitHub's mark, folded by default (`prefs.peopleCompact` → `#people.compact`; its words set after the draw, so a fold
  keeps the nodes). A face clicked narrows the list to the chats with that person (`prefs.person`, `hasPerson` in
  `renderSessionList`); the same face, or the person leaving the view, lets go. Drawn only when its markup changed
  (`peopleDrawn`); `display: none` on the rail. → `people-row.mjs`.
* **A card comes in three sizes** (`#cardsSize`, `prefs.cards`; compact the default): *large* — your last prompt and
  Claude's last reply —, *medium* the last word, *compact* neither. `cardHtml` always writes both `.snip`s (the older
  `.older`) and CSS hides by `#sessions[data-cards]`, so the slider re-renders nothing. *By lane*
  (`prefs.cardsByLane` → `data-bylane`): a card that wants you (`roomy(s)`) is large. **Compact's *same height***
  (`prefs.cardsEven` → `#sessions[data-even]`): one title line, the question left to the red edge, and the move line or
  `.moveslot` — an invisible line of its metrics, never `.prmove`, which the harness reads. → `card-sizes.mjs`.
* **A card is square** (`border-radius: 0`, the ring's too). **Its title row reads title · chips · time · F ·
  unread; its top row ends ✓ · PRs** (every card has it, 18 px at least). The age (`.trow .time`) shows under the
  pointer only, by `opacity`, keeping its room. The F is Fable (`onFable(s)`: `/fable/i` on `s.model`; not on the
  rail). → `card-marks.mjs`.
* **Only the open card and a clauding one wear the colour round their border**; the rest have the lit left edge alone
  (`background-origin: border-box` under a transparent border). **ALL** (`key: 'all'`) is `BLACK` through
  `projColor()`, as is a folder painted `#000000`: `.card.black`, where `--ring` turns the light white. **The open card
  runs into the splitter**: `#splitter` is `--open` (from `tintChat`) down to the open card's edge as drawn
  (`splitEnd`), black under it — `#splitter::after` from `--split`, in the list's own coordinates, written by
  `drawSplit(g)` only when the card moves in the list, slid by the scroll through a scroll-driven animation on the
  `--slist` timeline (the old on-screen `--split` per scroll where there are none, `SPLIT_SCROLLS`). The open card
  out of sight below, the colour runs to the foot (`--sfoot`); above, the splitter is black.
* **A new chat has a card before its first word**: `visible()` shows a live chat with no transcript (not VS Code's);
  its `startedAt` — the moment the board first saw the id — is its time and place, carried over by `indexFile`, the
  last fallback of `wordAt` (both copies). **Empty is no word, not no file**: `/clear` writes lines at once, none of
  them a word, so the start, `statusOf`'s `idle` and the *(no messages yet)* title go by `!s.lastActivity`.
  `openSession` on a chat the snapshot lacks renders from its fetch. Ticked, an empty chat is gone (`visible()`), and
  the column moves on (`tickDone`) or leaves (`leaveChat()`). → `new-chat-card.mjs`, `drawer-clear.mjs`.
* **The order** (`RANK` / `rankOf`): asking, clauding, **Ready** (a last word from today or the `IDLE_DAYS` before),
  **Idle** (older), **Done** — inside each by the last word (`wordAt`: the newer of `lastUserAt` and `lastReplyAt`; a
  tool call is not a word, **a PR come round to you is**, at `turn.movedAt` — `movedAt(s)`, both copies), newest first;
  a project ranks by its newest chat. Every count goes by `bucket()`, where an asking chat is a ready one — only the
  order knows. **Each group has a lane head** (`laneHtml`, `.gsep.lane.<group>`, its count at the right; none under a
  query) that folds it (`data-lane`, `foldLane`, `prefs.lanesShut`; Idle and Done folded at first; the harness opens
  every lane unless a scenario's `prefs` say otherwise). The Clauding head's mark is Claude in pixels (`PIX_SHEET`,
  `pix`, `pixhop`). **A day label over each run of one day in a lane** (`dayHtml()`, `dayBefore`, `dayName()`; none in
  a lane all today). **All caught up** (`ZERO_HTML`, `caughtUp`): no ready chat and no question, a still head where
  Ready goes; reached from a ✓ (`lastTickAt`) it sparks once. **Your move and new replies are the funnel's filters,
  never lanes.** → `lanes.mjs`, `day-separator.mjs`.
* **The list's filter is the funnel** (2026-10-12; `#fBtn`, `FILTERS`, `prefs.listFilter`; its menu through
  `ctxShow`, counted by `fCounts`): *Every chat* · *Your move* (`yourMove`: a PR waiting on you, not done for good) ·
  *New replies* (`replied`: a ready chat whose last word is Claude's and came after the board last showed it —
  `seenAt`, the server's `seen` in the state file, `POST /api/sessions/:id/seen` from `markSeen`; `seenSince` for a
  chat never shown). Done chats never. On, the list is narrowed before anything counts it, every match shows (the
  heads `.still`, unfoldable), the caught-up head is not drawn, and an empty list says so. The rail's dot, the Dock's
  badge and the menu bar read `replied` too. → `test/seen.test.mjs`, `lanes.mjs`, `pr-turn.mjs`.
* **A card clicked open flies its title into the header** (`flyFrom`, `flyTitle`, `.flytitle`) — the click handler
  only, never a key, a picker or the chat already open.
* **A chat opened from elsewhere is located** (`openSession(id, { locate: true })`, `locateCard`): from the pickers,
  the launcher, a notification, the address, the overview, a tile and home — scrolled to, and a band of light sweeps
  across it (`.card > .loc`, a box of its own: the pseudo-elements are the ring's). Not a click on the card, ⌥⌘↑↓ or a
  tick's move.
* **Ticking the open chat moves on** (`tickDone` — the card's ✓ and ↩, the chats step's ✓): to the card below as
  shown, else above, over done cards; a chat ticked while another is open moves nothing. **The move is made at the
  click**, not on the server's answer (an empty chat's `session` event would `leaveChat` first), after `TICK_MS` for
  the ✓'s own draw (`.act.tk`; a second click does nothing; at once under reduced motion). → `tick-next.mjs`.
* **The list's frame reads its geometry once** (`listChanged()`, once a frame): `listGeom()` first, then
  `drawEdges(g)`, `drawTimeline(g)`, `drawSplit(g)`, `drawTrail(g)` — keep the reads at the top. **It follows the
  list's motion**: while a slide or a fold runs (`follow()`, `sliding`) it draws every frame and once after, and the
  open card's size is watched (`watchOpen`). A new animation that moves cards goes through `follow`.
  → the slide step of `open-light.mjs`.
* **An empty list is the fish at rest** (`SWIM_FISH`) and the way to fill it (Esc for a query; ⌥⌘N).
* **The list's two ends count the cards out of sight** (`#sup` / `#sdown`, `.sedge`, over the list's grid cell, so
  `#slist` has a definite `grid-column`): a card is out of sight when its *middle* is past the edge (`drawEdges`, by
  `offsetTop`, hence `#slist { position: relative }`); a dot red for one asking, amber for clauding; a click scrolls a
  screenful. → `list-ends.mjs`.
* **The timeline is the list's scrollbar, out of sight until called** (`#tline`, over the list's cell, `display:
  none` on the rail; the native scrollbar hidden): the pointer held at the list's edge (`TL_EDGE`, `TL_DWELL_MS`; gone
  `TL_HIDE_MS` after) shows it (`#sessions.tlshow`). **To scale**: its height is the list's `scrollHeight`, a label
  where its run starts (`tl.runs`, built in `renderSessionList`: one day and one group; none under a query), the thumb
  (`TL_W`, ≥ `TL_MIN`) the window. **The swell is a fisheye** round the pointer (`tlWarp`, `TL_R`, `TL_MAX`), which
  stays fixed, so a drag reads the list's position off it (`tlScrub`); by the clock (`tlAnimate`, `tl.k`, `tl.K`;
  `REDUCED` jumps). The rail's hit area is `.tl-catch` (`TL_CATCH`, `tl.reach`); a press on no label is on the `.near`
  one. `peix.state().timeline`. → `timeline.mjs`.
* **The status bar is the machine at the window's foot** (2026-10-09; `#sbar`, `renderBar`, `body`'s grid row 2;
  `prefs.statusBar` → `<html data-sbar>`, on): `#sbFind` (`#filters` moved in by `dockBar`, handlers and all),
  `#sbLeft` (the connection, `bar.conn`, its click the About box; the asking and monitor counts while any), `#sbPeople`
  (`#people` moved in), `#sbSwim`, and `#sbRight` — the machine (`prefs.barStats`; `GET /api/stats?want=cpu,mem,claude`
  every 3 s while shown, `machineStats`), the usage as pie meters (`sbMeter`; a click lifts its rows, `usageRows`),
  both awake switches (`#sbAwake`, `#sbLid`), and the clock (24-hour, `hourCycle: 'h23'`; `clockTick`). `#sbLeft` and
  `#sbRight` are drawn by markup (`setHtml`); **the moved-in nodes are never redrawn by the bar**. On, the list's foot
  row goes (`:root[data-sbar] :is(#shd, #sfoot)`); off, `dockBar(false)` puts them back. **The fish** (`swimAt(n)`, n
  the clauding chats and their agents): one `swim` animation whose rate changes in place (`updatePlaybackRate`), never
  still; `fishAt` reads where it is from the swim's own clock, never a rect, and `feed` (its bubbles) is a frame loop
  only while one is out, reading no layout; a click is ⌥⌘A; `peix.state().swim`. → `status-bar.mjs`.
* **The plan usage with the bar off** is `#usage` in `#sfoot`: a tag per limit (`uShort`: 5H, 1W, a model's initial,
  CR a grant — kept out of the row, `uGrant` —, $ a cap in money, `.umoney`) and its percent; its rows (a bar in
  `--spend`, red from 90 % — `uColor` —, the clock's tick `uPace`/`uSpan`, the time to reset) a panel on hover or a
  click (`.uopen`, `.pin`). On the rail, rings. Both shapes are in the markup and CSS picks (`main.scompact`).
  `loadUsage()` on load, every `USAGE_EVERY_MS` while visible, after a reset, on coming back; backing off on failure,
  keeping the last numbers (`.stale`). `USAGE=off` (every test server) hides it. → `usage-bar.mjs`.
* **State lives in four places**: the server's `~/Library/Application Support/peixAIrada/state.json` (`STATE_FILE`;
  ticks, seen, for good, unlinked PRs, named projects, titles, pins, hidden, `envs`, notifications, PR turns,
  awake) and the user's `~/.config/peixairada/config.json` (the setup, below) — both shared by the app and every
  browser —; the browser's `localStorage` `peixairada-prefs` (the keys are the `prefs` literal, and old ones are
  deleted on load); and never `~/.claude`. `renderHead` re-runs on every SSE update — anything it renders reads its
  state from prefs. **`state`'s keys are declared in its literal**; add there, not at first use.
* **The setup is the user's file; nothing about one Mac is in the code** (2026-09-28): `CONFIG_FILE` —
  `$XDG_CONFIG_HOME/peixairada/config.json`, **beside `STATE_FILE` when that is set** (every test server has its
  own); the state file's old `config` is moved there **at boot, never on an import** (`loadConfig()` from `main()` — a
  test imports the module against the real state file). Written in place (a dotfiles symlink stays one), a root under
  the home as `~/…`; **re-read on a hand edit** (`reloadConfig`, a stat every `CONFIG_POLL_MS` against
  `configStamp`); one that does not parse is `error` on the config, the board keeps what it had and a PUT is refused
  (409). Keys: `roots` (`[{dir, org}]`), `quick` (⌥⌘O's project), `projects` (`{name: {abbr, color}}`, by shown
  name), `jira` (`{site, email}`; `jiraSite`, http only on loopback). `cleanSetup` shapes it (strict for a PUT); a key
  never set is the default at read time (`boardConfig()`: the roots from `ORG_DIR` / `ORG`, else none). `GET/PUT
  /api/config` (a PUT replaces the keys it gives), a `config` event, `state.config`, `configChanged()`. **`ask` is the
  first run** (no roots set or in the environment, the file readable): `#welcome` (`welcomeSync`), filled from `GET
  /api/config/suggest` (`suggestRoots`, `checkoutOf`, `orgOf`); Skip is `roots: []`, Esc only puts it off; `create:
  true` (the welcome's only) makes a folder under the home; in the app Choose… is an `NSOpenPanel` (`peixFolder`).
  Test servers set `ORG_DIR`, so the welcome never shows unless a scenario clears it. The Setup pane (`renderSetup`,
  never redrawn under a box with the keyboard) is reached by `.srow.root(.add)`, `.sdir`, `.sorg`, `#quickSel`,
  `.srow.proj`, `.sab`, `.ssw`, `.sadd` — keep those names. → `test/config.test.mjs`, `cog-setup.mjs`, `welcome.mjs`.
* **The page asks the server through `api(method, url, body)`**: JSON in, JSON out, a throw with the server's own
  `error` (else the status) — `e.status`, `e.body`. Every caller says what went wrong where it happened, or catches on
  purpose. The attach upload keeps a raw `fetch`: its body is a file.

## Hotkeys and the pane

* **`HOTKEYS` in index.html is the whole ⌥⌘ family, and every key is a row of `KEYS`** (2026-10-12): what you
  press, its group, one line, and the codes it is in HOTKEYS or CMDKEYS — the Keys pane and the ? sheet are drawn
  from it, and `npm run check` (`check-page.mjs`) fails a code with no row, a row no map answers, or a ⌥⌘ letter
  `boardKeys` in main.swift does not forward (⌥⌘S aside). The letters: **T** the chat's zsh tab (`hotShell()` →
  `POST /api/sessions/:id/shell`, `s.shell`, `shName()`), **E** VS Code Web in the pane, **G** the chat's PR on GitHub
  (several → the picker in `pr` mode; none → the repo, `state.repos`), **C** the chat's claude (`termAction()`, the
  `>_` path), **W** the tab the keys are in, closed (`hotCloseTab()` → `dropTab()`), **P** projects, **K** chats
  (`chatFields()`), **F** the list's box (`hotFind()`), **B** the rail (`toggleSessions`), **Y** themes (`themesOpen`), **L** the
  launcher (`pickOpen('launch')`), **D** changes (`hotDiff`), **A** the overview (`ovOpen`), **S** the stack (`hotStack`; not in `boardKeys`: in the pane ⌥⌘S stays
  VS Code Web's Save All), **0** home (`hotHome`), **N** a new chat as steps of one dialog (`new` → `chats` → `folder` → `env`,
  `newChatIn()`), **O** the same on the setup's `quick` project (`hotOracle()`), **↑↓** the chat above or below as
  shown (`hotMove()`), **←→** the tab beside, wrapping (`hotTab()`), **1 / 2** the halves stood one over the other
  (`hotGroup(g, true)`). Capture phase, `e.code` (with ⌥ held `e.key` is a symbol). A `dialog[open]` swallows them;
  nothing to act on is a `note()`; a key held down is one press (`e.repeat`, the arrows aside) and `termAction` one
  press per chat at a time (`termAsking`). **A late answer acts on its own chat only**: `renderHead` draws the open
  chat's header alone, a new drawer attaches through `showTerminal`, and ⌥⌘T's zsh and the editor's page wait on a
  chat that was left.
* **Plain ⌘ is the window's shape, in `CMDKEYS`**: **1** / **2** the left and right halves (⌘2 splits the first
  time), **W** closes the half the keys are in or a dialog that is up, **0** closes the *other* half
  (`hotOnlyHalf`). `peixKey(code, mods)` says which map and **returns whether the key was taken**; `cmdKeys` in
  main.swift is the forwarder's copy (a digit as `Digit<n>`). ⌘K is *not* here (the drawer's clear), nor ⌘+ ⌘−
  (`chatZoomKey`, which sees ⌘0 only when nothing is split).
* **⌘W is the Window menu's item, not the forwarder's**: a key equivalent is dispatched before any responder.
  `closeHalfOrWindow` asks the board (`peixKey('KeyW','cmd')`) and calls `performClose` only on false. Anything else
  the board wants off a ⌘ a menu item claims goes the same way (⌘, does).
* **⌃⌘F is the board's own full screen, up to the notch** (`toggleFill` in main.swift; `BoardWindow`, borderless, the
  whole screen; remembered as `peixairada.fill`; `kill -USR1 $(pgrep -x peixAIrada)` toggles it too, the app log
  saying `fill: on …`). The menu bar is auto-hidden beside a camera housing and hidden outright without one
  (`placeFill`, `fillOptions()`), let out by the pointer held at the top 1 s (`menuOut`), and tucked again after a
  change of desktop (`tuckMenuBar`); the Dock comes out only after 0.7 s at its edge (`dockTick`, 10 Hz while filled
  and active). The system's full screen is not offered (`.fullScreenNone`; a plain click on the green button is the
  fill, `windowShouldZoom`; `NSFullScreenMenuItemEverywhere` and Info.plist's
  `NSPrefersDisplaySafeAreaCompatibilityMode` are false; ⌘W leaves the fill first). The page hears `peixFill(on, notch)` — the strip's height and the housing's x range in
  CSS px, null without one — and **`layoutNotch()` lays the top row round it** (reads, then writes; with no housing
  and nothing to undo it returns at once): the header's title left of the housing and its chips right
  (`.shead.hole`), unless the whole title does not fit (a `Range` measures it; `scrollWidth` never reads under the
  box's): `.tright`, the title jumps the housing — or, floating, runs under it (`.tunder`); what has not the room
  pads down by the strip (`.npad`). On this Mac the strip is 32 pt and the housing x 771.5–956.5 of 1728.
  → `notch.mjs`.
* **The pickers match fuzzily, and with something typed the best match leads**: `fuzzy(fields, q)` — each word
  hunted *within one field* (`chatFields(s)`), letters in order, runs and word starts worth more, gaps costing, a
  field's worth falling off down the list; `hunt()` ranks; an empty box keeps each list's order. `markHits()` bolds
  what landed (`fuzzMarks`). `pickRender` fills `pick.list` and a `row` per mode and clamps the selection once.
* **The list's magnifier matches the same way** (⌥⌘F): `renderSessionList` scores by `fuzzy(chatFields(s), q)`
  and, with something typed, sorts by score and draws neither lane heads nor day lines; a folded lane does not apply,
  the project in view does. ↑↓ walk a `.qsel` card, ⏎ opens it and keeps the query; the mark shows only while the box
  has the keyboard (`markQsel()`). → `chat-filter.mjs`.
* **A right-click is a menu where ⌥-click, a double-click or a drag did alone** (2026-10-12; `#ctxm`, `ctxRows`,
  `ctxShow`): a card, a PR chip, the colour square — not a box, a terminal or the transcript's words, which keep the
  system's. The launcher has the open chat's rows too. → `context-menu.mjs`.
* **⌥⌘L is the launcher** (2026-10-10; `#pick` in mode `launch`): `launchRows` gives each section's best (chats,
  projects, PRs `allPrs`, tickets `allTickets`, `actionRows`, `toggleRows`), all under a prefix (`>` `#` `@` `!`); a
  section's head is `.pkhd`, not a `.pkrow`. Empty, it is `LAUNCH_MENU` (→/⏎ into a row with ›, ←/⌫ back,
  `ctx.back`). **A switch is the settings' own checkbox, clicked** (`SWITCHES`), so its handler runs. **`?` is the
  sheet of every key** (`keysOpen`, `#keysheet`) outside a box or a terminal. → `launcher.mjs`.
* **The last step of the new-chat flow is a list of chats** (`scopeChats()`, `chatsStep()`, `newFromChats()`): the
  scope's ready and clauding chats by `byWord` under ＋ *new chat* — **shown even when the scope has none**, so ⏎
  starts one. ⌥⌘N scopes it to the project, ⌥⌘O to one environment (`then: 'chats'` rides `folder` and `env`).
  Typing filters the chats only and moves the selection onto the first match. A chat's environment is `s.env`
  (`.chip.env` on its card); the `env` step counts each (`envCounts`). An idle chat's row has the card's ✓
  (`button.pkdone`, `canTick(s)`); ticked, it leaves on the `session` event (`pickRender(true)` keeps the selection)
  and the picker stays up. → `new-chat-flow.mjs`.
* **The project step holds the folders you have no chat in, and clones one you have not got**: after the board's
  projects come the folders under each root on no project (`freeFolders()`; `GET /api/folders`, cached by each
  root's mtime), and a query naming none is offered as **＋ clone `<org>/<name>`** per root with an org (`cloneRows()`,
  never filtered out) — `POST /api/clone {name, root}`, `gh repo clone` into that root, `cloneAndStart()` carrying on.
  **A worktree is not offered** (`isWorktree`: a `.git` file naming `…/worktrees/…`) unless typed whole. A long path
  goes beside the name (`.cur`), never in the row's `auto` column. → `new-project.mjs`. **A clone is one per folder and
  says how far it is** (`clones`, by target folder; a second ask joins it; a spawn in it is refused until done,
  `cloneUnder`): `gh repo clone … -- --progress`, phases weighted into one percent (`CLONE_PHASES`), `clone` events
  and `clones` in the snapshot; a failure removes what git left. → `test/folders.test.mjs`.
* **A chat's folder not checked out is cloned before the chat starts** (2026-10-09): `spawnTerm` refuses a missing
  folder (or one being cloned) with `clone` — **`cloneFor(cwd)`: under a root with an org, `<root>/<name>[/…]` is
  `<org>/<name>`**, null under no such root or inside a repo that is there. The page's `withCheckout(key, spawn)`
  clones and asks again, for a resume (`openTerminalFor`), ⌥⌘T and a new chat. What it draws reads `state.clones`
  (`cloneShown`: the resume bar's progress `.cloning`/`--clone-p`, a new chat's `.clonebox`, the status bar's `.cl`).
  A chat with no claude says `folderMissing` and `cloneRef` (not `gone`); without `cloneRef` auto-resume does not arm.
  → `clone-folder.mjs`.
* **The settings are one modal dialog** (`#settings`): ⌘, (`CMDKEYS.Comma`; in the app the menu's *Settings…* asks
  `peixKey`), the header's ··· row (`#settingsBtn`) and the empty header's ··· (`#noChatMore`, delegated — `leaveChat`
  rewrites the header). Three panes (`.spane`) under `.stabs`: **Board** (sections `h4.shd`, *Lights and motion*
  folded in `details.sadv`), **Setup** (`#setup`), **Keys** (`.keys`). The class is still `pop`, so rows keep their
  `.pop …` rules. **It is modal**: the pane is down and the ⌥⌘ / ⌘ keys are swallowed under it — close it first (the
  scenarios do); its `close` drops a setup row half typed. **The fish is the SSE light**, belly-up while the stream is
  down (`FISH_LOGO()`; animations, not transitions, since the bar redraws it); clicked, the About box (`#about`).
* **Every `pre` in the transcript is inside a `.codebox`** (`md()`): the bar (language, copy) is its first child; a
  block over six lines is always folded, `details.codefold > summary + .codebox`. A rule that reaches a `pre` goes
  through the box; the copy click is delegated on `#log`.
* **In the app the pane is a native view** over the chat column with its own web views: a key pressed there never
  reaches the page, so `installHotkeyForwarder()` forwards ⌥⌘ + the letters and arrows and ⌘ + the layout keys
  (`hotkeyCode()`) to `window.peixKey`, and a click on a page as `peixPaneFocus(key)` (`installPaneClickMonitor()`),
  so the half with the keys follows the pointer. The shell reports `peixPane(visible, left)`. **A dialog open lowers
  the pane** (`postPane` sends no page while a `dialog[open]` exists; every dialog's `close` puts it back); `postPane`
  posts only a message that differs. Esc with the pane up is forwarded (`hotEscape()`: a dialog closes first, else the
  chat tab comes back); with it hidden, a capture-phase handler closes a dialog or popover itself.
* **The app hears the board's own state**: the page posts `{type: 'state', needs, replied, moves, working}` from
  `renderBoard` when what wants you changes (`postState`, `wanting()`: the chats asking and the new replies — **the
  Dock's badge and the menu bar's count are their number**, the page's title too; the status menu lists them with the
  PRs at your move and what is clauding), each alert with `serverNotify` and `quiet`, the pane's places, and
  `{type: 'chat', project, title, cwd}` from `renderHead` and `leaveChat` (`postChat`: the window's title and
  `representedURL`). `refreshBadges` redraws only on a change (`badged`); a newly asking chat with the app in the back
  bounces the Dock once.
* **The page owns the tabs**: each half's strip lists `chat` (`claude` while the session runs here), `shell` while a
  zsh lives, `gh:<url>` per web page the chat opened (the strip's ↗ goes out to the browser) and `ide:<url>` for its
  folder's editor — `tabKeys()` from `state.paneGh` (per chat) and `state.paneIde` (per folder); `tabs` holds each
  chat's `[left, right]`, read through `placeOf()`. `syncTerm()` keeps both bodies right and posts one
  `{type:'pane', id, keys, panes, focus}` (`postPane`): the shell keeps a web view per page (`paneViews`, up to
  `paneViewsMax`, the chat's own spared). **The overlay covers the whole window** and lets a click on no page through
  (`PaneOverlay.hitTest`). `‹ › ↻ ↗` are `{type:'nav'}`; × forgets a page (`closeTab`). In a browser the tabs are chat
  and zsh only (`inApp`). GitHub cannot be iframed, hence the `WKWebView`; one with no UI delegate drops
  `target=_blank`, hence `PaneDelegate`. → Findings: *the pane*.
* **A page in the pane behaves like a browser tab**: ⌘R reloads it while the pane is up (`validateMenuItem` renames
  the item), pinch zooms it (`allowsMagnification`), its address sits in the strip (a click copies it,
  `copyPaneUrl`), each navigation reported as `peixPaneUrl(key, url)` (a KVO watch, `paneObs`; `paneUrls`).
* **⌘F finds on that page**: the Edit menu's *Find… · Find Next · Find Previous*, greyed with the pane down; a native
  bar (`buildFindBar`, the pane's top right) over WKWebView's `find(_:configuration:)` — no count, the match is the
  page's selection, dropped on close (`kDropSelection`); typing searches from the top (`runFind(fromTop:)`), a miss
  turns red. A pane change closes it; `findQuery` outlives it.
* **The trackpad bumps** (`haptic(kind)` → `{type: 'haptic'}` → `NSHapticFeedbackManager`): a splitter snapping
  (`LIST_W`, half the window, even halves — `SNAP_PX`), a tab dropped across (`moveTab`), the timeline's thumb crossing
  a run. In a browser it is a `haptic:<kind>` in `motion()` and nothing else.
* **A notification can be answered where it shows** (2026-10-12): the app's carry a category — a reply on a chat
  with a drawer here *Reply… · Done · In 15 minutes*, elsewhere *Done · In 15 minutes*, a question or a PR's turn the
  snooze alone (a ✓ ends the chat's processes; a question is Claude waiting). Reply… and Done go to the page
  (`window.peixReply`: the chat's drawer, else one opened for it, sending no size; `window.peixDone`: `tickDone` where
  `canTick`); the page says whether a drawer runs here on the alert (`drawer`). → `notify-actions.mjs`.
* **The board zooms as a whole in the app** (2026-10-12, `prefs.pageZoom`): `{type: 'zoom'}` sets the board view's
  `pageZoom`, and main.swift turns what crosses — the pane's rects (×), `peixPane`'s edge and `peixFill`'s housing (÷).
  **Never CSS `zoom` on the root** (rects read and written back would scale twice). A browser zooms itself.
* **Both web views are inspectable** (main.swift sets it): Safari → Develop reaches the real app.
* **The app's server lifecycle** (`ServerController`, main-thread throughout): `start` adopts a server already
  answering, waits for the launchd agent when its plist is installed, else runs the bundled one — one at a time, its
  log appended (`O_APPEND`); `restart` is `launchctl kickstart -k` for an adopted agent, else waits for the probe to
  fail first; the 5 s watchdog probes `/api/projects` and brings the board back once the server answers
  (`boardShown`). A web process that dies is loaded again. The bridge answers the board's own main frame only.

## The chat column's two halves

* **⌘2 splits the chat column, ⌘1 / ⌘2 are the halves**: each has its own tab strip and body, both picking from the
  *one* open chat's tabs. The left half keeps the plain ids (`#ptabs`, `#term`, `#termBody`, `#log`) — the whole
  column while nothing is split, and the harness reads it by those names. `GEL` maps each half to its elements,
  `terms[g]` owns its xterm and socket, the take-over state (armed, failed) is the board's `drawer`.
* **⌥⌘2 splits it one half over the other; the digit is the pane, the modifier the layout**: pane 1 is left or top,
  pane 2 right or bottom, and a key of the other layout turns the split first (`hotGroup(g, stack)` → `stackSplit`:
  `syncTerm` and a refit, nothing re-attached). The layout is the chat's (`stacked`, beside `splits`) **and outlives
  the split** (`unsplit` leaves it); the divider's place is the board's, one per layout (`prefs.splitAt`, `prefs.stackAt`). Stacked is
  `#groups.stack`; the second strip's `.gturn` turns it too. The app forwards ⌥⌘1 / ⌥⌘2 by key code (18, 19). **A zsh
  ended by its × lingers on the summary with `exited` set** — wait on that. → `split-stacked.mjs`.
* **Tiles** (2026-10-10; `prefs.tiles` → `main.tiles`, on by default; `tilesOn`): gaps, square panels, **each
  panel's border its project's colour** (`--tile-edge` from `tileEdge` in `tintChat`, `tileTints` and `renderStack`;
  a near-black one `--tile-grey`, none `--nocolor`), 30 % at rest and whole on the panel the keys are in (`.kf`). The
  list on ALL wears the open chat's colour; **the wallpaper** (`#wall`, `--wallc` registered and eased) is in that
  hue, its glow (`#wall i`) following the pointer by a transform (`wallGo`, `prefs.wallFollow`) — a move repaints
  nothing. **The stack** (`prefs.tileStack`, off; ⌥⌘S, `hotStack`; `stackOn`): `#stack`, a third column — up to three
  live chats asking or clauding, never the open one (`stackChats`), each a live tile (`mountMini` into `stackMinis`,
  else `tailHtml`), kept by chat (`stackTiles`), drawn in the frame after the board (`stackSoon`; `tilesOn` and
  `stackOn` are `var`s, as `renderBoard` runs before the block has). **At the notch** a panel the housing reaches is cut
  round it (`tileNotch` from `layoutNotch` and `renderStack`: a `clip-path`, `.ncut` the border, `.ncap` the corners;
  `HOUSING_R` by eye) and the row keeps `notchPad()` clear; the top corners round as the screen's
  (`main.tiles.notch`, `--screen-r`) only where a housing says the screen is a MacBook's. → `tiles.mjs`.
* **A new tab opens in the second half, and splits the column the first time** (`openNewTab()` — a zsh, a page, the
  editor). **Claude keeps the first half**: every split puts the chat on the left (`splitChat()`), a new tab goes
  where the chat is *not*, and Esc, ⌥⌘C and the ◎ row take the keys to the chat where it stands (`showChat()`).
  Choosing a tab that exists is `openTab()` and never splits. A split the board made (`autoSplit`) folds back on its
  own when the chat is down to one tab (`syncTerm`).
* **A tab lives in exactly one half, and split, each strip lists only its own**: one transcript element, one xterm
  per half, one web view per page. `homes` says which strip a tab is in — the chat's left, every other right
  (`homeOf`) — written only for a tab **dragged across** (`moveTab`; a press under 5 px is a click) and forgotten
  with the split. `keysIn(s, g)` is a strip's list; `setTab` shows a tab in *its* half. ⌥⌘←→ walk both strips as one.
* **A strip moves rather than jumps** (`tabMotion`, from `renderTabs`, reading the strip only when it redraws it for
  the same chat): the highlight slides (`.ptabpill`, the new tab `.slid` until it lands), a new tab grows in, a closed
  one folds as a stand-in **`.ptabgone` — never a `.ptab`**, so counts of tabs count the real ones.
* **The strip is one family of controls** (2026-10-11): every tab, nav button and field 26 px, `--r-3`, no fill at
  rest; **the tab in front and the half with the keys in `--tablit`** (the chat's colour lifted, set on `#chat`),
  never the accent; glyphs are strokes (`ICON.back` …, `.ic.st`). A tab's × is over its mark under the pointer; under
  640 px (`.ptabs` is a size container) the tabs behind fold to marks and lose the × (⌥⌘W). **The page in front is its
  own address**: `div.ptab.addr` (it holds buttons) with `.purl` (`urlHtml`, `addrHtml`) and `.navs`; a click on the
  address copies it; the tab drag ignores it. The half's ◫/⊟ and ⨯ are behind ⋯ (`.gmore` → `.gopen`; `.click()` on
  `.gturn` / `.gclose` works folded). With tiles, split, each half is a tile (`#gsplit` the gap); under the floating
  header `#groups` pads by `--float-h`, not the halves. → `pane-tabs.mjs`, `split-halves.mjs`.
* **A half whose one tab is not a web page has no strip** (`.lone`: a 2 px rule, the accent under the keys —
  **the same height either way**, so moving the keys resizes no terminal). A web page alone keeps its strip, an empty
  half keeps its (the drop, ⋯). The lone tab's × is ⌥⌘W's and the header menu's (`dropTab()`); ⌘W / ⌘0 close the half;
  a lone tab cannot be dragged. Unsplit, the strip hides under two tabs. → `split-halves.mjs`, `split-stacked.mjs`,
  `pane-tabs.mjs`.
* **Placement is derived**: `tabs` holds `[left, right]` per chat and `placeOf(s)` reads it against `keysIn` *now* —
  a key that is gone falls away. `tabOf(s)` is the focused half's. A half with nothing says what would fill it
  (`.gempty`), and its strip takes a drop (`.pdrop`).
* **The changes tab is git in the chat's folder, read when asked** (2026-10-10; ⌥⌘D, the header's `#diffBtn`, ···'s
  `#chgBtn`): a tab `changes` while the chat is in `changesOpen`, one element `#chg` moved into its half
  (`placeChanges`, from `syncTerm`). `GET /api/sessions/:id/changes?scope=` — `uncommitted` (untracked as added),
  `branch` (against the merge base with origin's default branch), `turn` (the uncommitted diff of the files the last
  turn edited, `s.turnFiles`) — and `?stat=1` for the chip (kept 4 s per folder, `changeStat`); `prefs.changesScope`.
  Re-read when the chat moved on or by ↻; nothing is polled. **Commit…, Push and PR… type the command into the chat's
  zsh, unrun** (`typeInShell`); a note on a line is a prompt typed into the drawer's claude (`sendToClaude`), else
  copied. → `test/changes.test.mjs`, `changes-tab.mjs`.
* **An MCP tool is named by its server and tool** (`toolName`: *Slack: search users*) in the rows, a run's summary,
  the card's live line and the tiles; the raw name is the row's tooltip.
* **A tool call wears its state** (`toolRes`, `toolMark`): `.tst[data-tu]` — `run` (turning while `#log.working`),
  `ok`, `err` — from the open chat's entries; a result for a row already drawn sets its mark in place, and a folded
  run's summary turns while any call is out.
* **The transcript reads as a conversation** (2026-10-08): your words a bubble on the right (`.msg.user`); Claude's
  prose stops at 80ch, its code, tables and images take the width they need; **one who-line a turn** (a text after
  another of the same turn is `.cont`; `logView.lastWho`, reset by a turn's end, an interrupt, a compaction); the
  reply that ends a turn has a footer — *copy* (`.tcopy`, by `data-ts`) and *worked for …* (the server's `turnEnd` and
  `worked` from `s.turnStart`). → `transcript-turns.mjs`.
* **The transcript moves, it does not multiply**: `placeLog()` reparents `#log` into the half holding the chat tab
  (its scroll carried by hand), hidden under a live drawer, parked in the left half when no half shows it. **It is
  appended to, not rebuilt**: `renderLog` keeps `logView` (the array, how many entries are drawn, the trailing run of
  tool calls and its `<details>`) and renders only what arrived; another chat or a new array starts over. A reconnect
  is `refetchCurrent()`, in place — your place kept, no pill lit. **The fetch and the stream are reconciled** (`logOf`,
  `awaitEntries` / `takeEntries` / `mergeEntries`): while a fetch is out the stream's entries wait in `pending`, and
  only those past `upto` are taken; a summary older than a `session` event is not (`sessionSeen`). `#log` has no
  `scroll-behavior`. Images load only from `data:`; DOMPurify forbids `<style>`, `style=` and form controls but the
  checkbox. **The log's last child is the presence line** (`renderPresence()`, while clauding or asking; its word
  shimmers, `shim()`, and turns over, `VERBS`, the markup still *clauding…*), **then the new-reply pill** (`.lognew`,
  `logNew()`): new nodes go before that tail, marked `.in` (never on the first fill), or come up part by part when a
  reply lands at the log's end (`reveal`, `REVEAL_GAP`). **Anything else that appends to the log goes before the
  tail**, and "the last message" is `:scope > .msg:last-of-type`. → `transcript-live.mjs`.
* **Split or not is the chat's** (`splits`, beside `tabs`); `syncTerm` calls `applySplit()` on every open; only the
  divider's place is the board's. **⌘W closes the half the keys are in**, each strip's ⨯ its own (`closeHalf(g)`);
  **⌘0 closes the other**. The per-chat maps (`tabs`, `homes`, `splits`, `autoSplit`, `stacked`, `focusView`,
  `state.unread`, `state.paneGh`) are pruned on every snapshot to the chats the board still has.
  → `split-halves.mjs`, the split section of `pane-tabs.mjs`.

## The drawer

* **A drawer is a holder** (`lib/termhold.mjs`): a detached process that owns the PTY (node-pty, `<sh> -l -i -c
  'exec claude …'`, `sh` the login shell when zsh or bash, else `/bin/zsh`) and the exact screen (`@xterm/headless` +
  serialize), listening on `<state dir>/terms/<id>.sock` — newline-delimited JSON: `in`, `resize`, `snap`, `clear`,
  `kill`, `quit`, `meta` in; `hello`, `out` (with `seq`), `snap` (with `upto`), `clear` (with `seq`), `exit` out. The
  server connects, proxies pages (`attachTermSocket`), adopts holders on boot (`adoptHolders`), and tells a holder its
  session id once the registry reveals it. An exited holder lingers `TERM_LINGER_MS` with its last screen, then
  removes its files. **The socket path must stay under 104 bytes** — test state dirs are short on purpose.
* **The drawer is automatic**: the pane's body while the chat runs here, gone when the process exits (`termEnded`);
  `syncTerm` on every open and update. **⌥⌘T is a zsh tab** beside it (a holder with `shell: true`, `shellOf()`,
  `s.shell`; one per chat). **Done ends the chat's processes** — the drawer's holders and a claude live elsewhere
  (SIGTERM). **An idle drawer ends itself** (`sweepDrawers`, on the registry poll): a claude idle, no sub-agent or
  task at work, no page attached, and no word in the chat nor the drawer's start within `DRAWER_IDLE_MS` (24 h; 0
  off) — the card goes stale and `>_` resumes it. A chat waiting on a question and every zsh are left standing.
  → `test/idle-drawer.test.mjs`.
* **A page that attaches gets the screen serialized, then only what followed it** (`ws.hold` until the snapshot,
  flushed minus `seq ≤ upto`). → Findings: *round three*.
* **The two screens stay in step because nothing reaches one while it refits** (2026-10-03): the holder holds its
  PTY's output, a clear and a snapshot in `held` until `refit`'s `done`, resizes one at a time to the newest size, and
  reads the cursor behind the queue; the page holds its socket's frames the same way (`toXt`, `tm.refits`) but reads
  the cursor at the call. A clear is numbered where it was asked for.
* **A drawer whose socket closed while its claude runs is attached again** (`tm.lost`, a backed-off `syncTerm`, 5 s
  at most). A holder that accepts and never says hello is a failure after `HELLO_MS`.
* **`nudgeTerm()` after every attach** — a resize one row short, then the true size 150 ms later — makes Claude
  repaint over whatever the page holds. **The row-short repaint is never shown**: from the socket's first frame until
  the true size's repaint has come (`NUDGE_QUIET_MS`, `NUDGE_MAX_MS`), output is held through `toXt` (`tm.refits`).
  → `drawer-switch.mjs`.
* **`fitTerm` sends a resize only when the size moved, and once it has stopped moving** (120 ms; at once with `now`,
  as a socket opens): `tm.sent` is per attachment (`attachTerm`); every send is a SIGWINCH and a whole repaint. The
  prefs' `termSize` is saved only when it changed.
* **The drawer's geometry**: `grid-template-columns: minmax(0, 1fr)` on `#term` and `#chat`, `min-width: 0;
  overflow: hidden` on `.tbody`, and `.tbody { box-sizing: content-box }` (the fit addon reads the padded size under
  the border-box rule). Refits on the body's `ResizeObserver`, a display-scale change (`watchDpr`), focus and
  visibility. → Findings: *run off the right edge*, *round two*.
* **⌘K clears the terminal**: the page asks the holder (`clearTerm()` → `{t:'clear'}`), which clears the screen *it*
  serializes and echoes the clear back to every page on that drawer — so a re-attach and a restart stay clear. A
  nudge follows. ⌃L is the shell's own.
* **Shift+Enter is a newline**: the drawer sends `ESC CR` itself and swallows the keypress. `macOptionIsMeta` is
  *⌥ is Meta* (`prefs.optMeta`, on). → Findings: *Shift+Enter*.
* **The Mac's line-editing keys are iTerm's Natural Text Editing** (`MAC_EDIT` / `macEdit`): ⌘← ⌘→ ⌃A ⌃E, ⌘⌫ ⌃U,
  ⌘⌦ ⌃K, ⌥⌦ ESC d — control codes Claude Code and zsh both read. ⌥← ⌥→ ⌥⌫ are xterm's own; ⇧, ⌃ or ⌘ with ⌥ (⌥⌘←→)
  is none of them. ⌘Z is the app's Edit menu. → `drawer-mackeys.mjs`.
* **⌥ over a digit or punctuation types what macOS composed**: with ⌥ as Meta, the handler sends `e.key` for the
  codes in `ALT_COMPOSES` and leaves ⌥+letter to Meta. → Findings: *⌥ is a compose key too*.
* **The ◎ row types `/focus`** into the chat's holder — Claude Code's focus view has no key and no API:
  `toggleFocusView()` sends it, then reads the newest `Focus view enabled|disabled` off the screen (`focusSaid()`) and
  lights `#viewBtn` from that; every attach reads it too (`readFocusFromScreen()`). The fake claude answers alike.
  → `focus-view.mjs`.
* **Paths and pages in the chat are links**: a file path in the transcript or a drawer's line — `/absolute` (under a
  root, or with an extension), `./relative`, `folder/file.ext`, `~/…`, `name.ext:12`, after Claude Code's `@` — opens
  in VS Code at that line (`vscode://file`, relative to the chat's `cwd`; `PATH_RE`, `pathHref`, `chatLinks`; not
  after a `+` or an in-word `@`, or it is quadratic); a web URL opens in the pane on a tab of the chat
  (`openExternal(url, { ide, s })`). The transcript is linkified as rendered (`linkify`); the drawer has a link
  provider beside the web-links addon (`termLinks`, `peix.links(y)`). → `chat-links.mjs`.
* **Attaching a file is typing its path** (`@dir/file`, spaces as `\ `); the app hands real paths over the bridge
  (`peixDrop`), a browser uploads (`PUT /api/attach`). ⌘V with an image sends ⌃V to claude in the app.
* **`termEnv()` strips only `CLAUDECODE` and `CLAUDE_CODE_*`** (the CLI refuses to nest) and keeps `CLAUDE_DIR`.
  `exit code 129` in a drawer is SIGHUP from its holder ending, not a crash.
* **Take-over**: a chat live in iTerm or VS Code can be resumed here — SIGTERM the other processes, wait, spawn.
  Nothing respawns a CLI claude; VS Code's tab goes dead and does not follow. → Findings: *VS Code chats can be taken over*.
* **Live chats are never written to** from the board (a second writer on one transcript); stale ones are resumed in
  a drawer.
* **A chat whose claude has ended is its transcript with the resume bar under it** (2026-10-07; `#resume`, row 5,
  `renderResume` from `renderHead` while `resumable(s)`: no process, a file, no drawer). Resume is `termAction`.
  **Opening such a chat counts down to its resume** (`armResume` from `openSession`, `AUTO_RESUME_MS`,
  `prefs.autoResume`; `termAction(s, { stay: true })`); Not now, Esc, another chat and the switch stop it
  (`stopResume`), a dialog holds it; a done chat, one whose claude ends while open and the one a load opens
  (`openSession(id, { auto: false })`) wait for the button. **The harness has it off**: `launchChrome` writes
  `autoResume: false` unless set — `verify --hash` drives the live board. `peix.state().resume`. → `resume-bar.mjs`.

## Invariants that bit us — one line each, the story in Findings

* Transcript line types are undocumented: ignore the unknown; drop `isSidechain`, `isMeta`, `isCompactSummary`,
  `<system-reminder>` blocks (strip them *first* — a prompt can follow one) and `<local-command…>` synthetic lines.
* `.cards > * { flex: none }` is load-bearing; `.card { --repo: initial }` too (custom properties inherit), and
  `.card { isolation: isolate }`: the ring and its cover sit at z-index -1 under the card's background only because
  the card is its own stacking context.
* `.shead { min-width: 0 }` and a fixed `flex-basis` on `.shead h2`; PR chips are direct children of the header.
* **Every grid row in the chat column is placed by hand** — `#chat`'s, each half's `.ptabs` / `.gbody`, and
  `#sessions`' (whose *column* is placed too: the timeline, the glass and the ends lie over the list's cell). A hidden
  block is `display:none`, which slides its siblings up a row; a body in an `auto` row sizes itself to its terminal. A
  new block means placing it too.
* **A terminal that grows has to pull its scrollback back down** (`lib/refit.mjs`, and the page's copy in
  `refitTerm`): xterm only does it when the cursor is on the buffer's last line. → `test/refit.test.mjs`.
* Inline code gets a tint, never a border; card glyphs are inline SVG, not emoji; `--ring`, which only `.card.black`
  sets, with white, wins over `--glow`.
* **A CSS animation starts over on a rebuilt node, and only `transform` and `opacity` run off the main thread**:
  anything that moves on a card is phased to the document clock after the render (`phaseAnims()`), and nothing
  continuous animates a custom property, a gradient or a colour.
* **A running animation is moved by its `currentTime`, never its `startTime` alone**: WebKit — the app — hands a
  transform to the compositor, and a start set after it has reads back from the script but never reaches the screen;
  Chrome takes either, so the harness cannot see it. The proof is the compositor's frame: `npm run webkit`.
* **A read after a write is a layout**: the list's frame (`listGeom`), `fitHeadPrs` and `layoutNotch` read
  everything first; keep it so.
* `projIcon(name)` marks ⌥⌘O's project wherever its name is written; `projAbbr` is the rail's squares. Both, and a
  folder's colour, read the setup by the shown name (`projCfg`) — never a map in the code.
* **The small controls' hover ease is an `:is()` with ids in it, so it weighs an id**: a `transition` of its own on a
  `.cpr`, `.btn`, `.act`… needs an id in its selector, or it is the ease's, silently — ask `getAnimations()` mid-move.
* **Never name a modifier class after something the page also selects by**: the walkers take `#slist > .card`; the
  usage's messages wear `.unote`, since `.note` is `note()`'s popup.
* **No in-page toasts**: alerts are the badge plus a system notification (the app sets `NOTIFY=off` on its own
  server); with the board in front an alert can be heard instead (`chime`, `prefs.sounds`, off; Web Audio made on a
  press, `audioUp`). **The notifications switch is the server's** (`notifications` in the state file, `PUT
  /api/notifications`): off, every alert still goes out but `quiet: true`, and the three posters (main.swift, the
  page's `Notification`, the server's osascript) skip it. A new poster reads `quiet` — and `heading`, the server's
  title for an alert that is not Claude's. → `notifications.mjs`.
* Swift: `Result<Void, String>` does not compile; `isReleasedWhenClosed = false` on the window; drop -999 in every
  navigation-failure callback; pin the deployment target (`-target`, `LSMinimumSystemVersion`); an Edit menu or no ⌘V.
  **The board's web view draws no ground** (`drawsBackground` off): the window's `backgroundColor` and
  `underPageBackgroundColor` are the page's `--bg` per appearance — a change to `:root`'s `--bg` moves the two hex
  pairs in `buildWindow` with it.
* Sign with the one Apple Development identity (stable team → App Management grants survive installs); chmod
  node-pty's spawn-helper only when the bit is missing (a same-mode chmod is still a write to the bundle).
* macOS has no `timeout(1)`: `perl -e 'alarm shift; exec @ARGV' 60 <cmd>`. BSD sed has no `\b`.
* `pkill -f server.mjs` also kills the app's own server — stop test servers **by port**.
* VS Code Web (`code serve-web`): extensions live in `~/.vscode-server`, trust in the browser profile. → Findings: *VS Code Web*.
* Ink redraws only its live region on a resize; earlier lines keep the old width. That is Claude Code's, not ours.
* xterm parses what it is written on its own schedule: read or wipe a screen through `write('', cb)`, never straight
  after a `write()`.
* **`openSession` sets the address before it fetches, and drops an answer for a chat no longer open.**
* A page out of sight (the harness's Chrome) runs its timers up to a second apart: a listener left for a
  `setTimeout(0)` to remove outlives the next few steps (the drag's click swallow is `once` for that).

## Verifying changes

**Do not claim a UI change works without loading it in a real browser** — squashed cards, detached fins, column
overlap, lone digits were all invisible in the code and obvious on screen. Look at the screenshots (`Read` renders
PNGs). **After any edit to the page, load it**: `check-page` only compiles, and a `const` read before its line kills
the live board at load — `npm run verify -- "typeof window.peix"`.

* `npm run verify -- "<js>"` evaluates one expression on the live board; `--hash <id>` opens a chat first,
  `--shot file.png` saves a screenshot after, `DARK=1`, `URL=http://127.0.0.1:<port>/`. `--dump-dom` is useless here
  (fires before the SSE snapshot); drive Chrome over CDP — `lib/cdp.mjs`.
* **What only the app shows is checked in WebKit** (`npm run webkit -- "<body>"`): the harness is Chrome, and a bug of
  WebKit's passes every scenario. It runs an async body on the live board in a `WKWebView` (`frame`, `sleep`, `until`;
  `--hash`, `URL`, `SIZE`, `PREFS`); `--shot` saves the window as **the compositor** drew it, and `--then` runs a body
  on that frame (`shot.px(x, y)`, `shot.where(test, rect)`). The window is opaque and on screen by one pixel (off a
  screen WebKit runs no frames); a locked screen hides it, and it says so.
* `npm run scenario -- scripts/scenarios/<name>.mjs` for anything with more than one step. A scenario exports `meta`
  (`server`, `fake`, `fixture`, `env`, `prefs` — what the page starts from; **without it a page starts with every
  lane open, large cards, neither tiles nor the floating header, and the theme following the emulated colour scheme**:
  the scenarios measure the plain column, and the ones about those turn them on) and a default `async (ctx) => result`. The runner starts a throwaway server on a free
  port with its own state dir, builds the fixture, runs the fake claude when asked, launches Chrome with **focus
  emulation on**, and cleans up everything on any exit within 15 s (`--keep` to inspect). **`ctx.reload()`** waits
  for the new document's snapshot — never a reload and a sleep; `openChat` waits for that chat's log
  (`#log[data-sid]`). **A rectangle is read after `ctx.settle()`**: cards slide after they arrive or move, dialogs rise;
  `settle` waits for every finite animation and a pending draw. `ctx`: `evaluate`, `waitFor`, `send`, `reload`,
  `sleep`, `shot(label)`, `key(code)`, `cmd(code)`, `openChat(id)`, `screen(g)`, `waitPrompt(ms, g)`, `type(text, g)`
  (the drawer), `fill(selector, text)` (a box), `drag(from, to, mid)`, `peix(expr)`,
  `server.api/post/terminals/restart/logText`, `fixture.chats`, `assert`. `ls scripts/scenarios/` is the regression
  suite, one file per feature, named as the bullets above point to them.
* **`npm run scenarios` runs the lot**, one at a time. A failure is run once more: passing then is `FLAKY`, and the
  suite still exits 0; `--no-retry` is the honest gate.
* **Not just after local midnight**: the fixtures are minutes to hours old, so a run then puts a day line between
  them — `card-signals`, `transcript-live`, `home` and `readme-shots.mjs` fail the same on older commits. Wait, or run
  with `TZ=` a zone where it is morning.
* **The auto fixture's second folder is the temp dir's real path** (`realpathSync(tmpdir())`): a fake claude there
  registers `/private/var/…`. Its two chats are a second apart, so the board's order is never the readdir's.
* **Every test server gets a fast clock, an empty org directory, and nothing of this Mac's** (`lib/testserver.mjs`):
  `REGISTRY_POLL_MS` 1200, `TASK_GRACE_MS` 400, `CONFIG_POLL_MS` 200; its own `ORG_DIR` (no welcome), `CLAUDE_DIR`
  (empty unless a fixture), config beside its `STATE_FILE`; the fakes (`GH_BIN`, `caffeinate`, `pmset` with
  `AWAKE_ADMIN=none`); Jira's token in its own file (`JIRA_TOKEN_FILE`), no inherited `JIRA_API_TOKEN`; a `ZDOTDIR`
  with no rc files; `VSWEB_FRESH_MS` 0; `USAGE=off`; no inherited `CONFIG_FILE`, `TERMS_DIR` or XDG dirs. Up is its
  `listening` line; `meta.env` is spread last. `waitFor(fn, {timeout, what})`, `srv.post(path, body)` and `tmpDir()`
  are the tests' polls, POSTs and dirs.
* **Test against the fake claude, not real chats**: `scripts/fakeclaude.mjs` via `CLAUDE_BIN` (`fake: true`) is
  instant and touches nothing. A test against the real `~/.claude` names it as `claudeDir` outright (read-only), uses
  a stale chat and `DELETE`s the terminals it made.
* **Two measurement traps**: Claude Code stops rendering while the terminal reports focus lost — a headless page's
  `focus()` is no focus without `Emulation.setFocusEmulationEnabled` (the runner sets it); and **every re-attach that
  moves the drawer resizes it** — the clean re-attach is a reload of the page (`Page.reload`, then `openChat`), as
  `focus-view` does.
* **The fake claude scrolls before it repaints on a shrink** (`drawLive`) and after a grow draws at the bottom, as a
  terminal app would. A red drawer scenario can be the fake's geometry, not the drawer's.
* The page's script is one IIFE: read it through `window.peix` (`state()`, `session(id)`, `sessions()`, `prefs()`,
  `term()`, `screen()`, `motion()`) or the DOM; `#termBtn.click()` spawns, an `InputEvent` on `#termBody textarea`
  types.
* Server logic without a browser: `npm test` (the terminals test is the reference for driving the API and the
  socket); or a fixture tree `CLAUDE_DIR=/tmp/fix` and assertions on `/api/sessions`.
* The app logs to `~/Library/Logs/peixairada-app.log` (alerts, badges, pane opens, drops); the agent's server to
  `~/Library/Logs/peixairada.log` (spawns, adoptions, snapshots). Read those before guessing.

## Deliberately not done

* **Riso, a light theme in two inks — later, not never**: the intention, palette and shapes are in `docs/studies/`.
  When built, it is a theme to pick.
* **The title bar as one surface with the head row**: the page would have to lay its top row out round the traffic
  lights and leave something to drag the window by — a design for in front of the app, which lives filled.
  → Decisions 2026-09-27, late night.
* **Making VS Code's tab follow a chat continued elsewhere** — the extension watches only `~/.claude/sessions/`.
* **Attaching to a *live* session from the board** — its inbox socket cannot answer a permission prompt for you, and
  its message JSON is undocumented. Live chats are refused on purpose.
* **PR status costs a network call**, so a chat untouched for three days is not polled (opening it asks) and merged
  or closed PRs are cached forever.
* **The app is signed for this machine only**, not for distribution.
* **Chat-level pins** were dropped for sorting by your own last touch; **board-set colours** for Peacock's.
