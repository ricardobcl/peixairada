# peixAIrada — working notes

One board for every Claude Code chat on this Mac. Reads what Claude Code already writes to `~/.claude`; no
private API, no cooperation from Claude Code itself.

**Three documents, three jobs.** [README.md](README.md) and [docs/GUIDE.md](docs/GUIDE.md) are for the user. This file is the *current invariants* —
one bullet each, under stable headings, what a session must know to change the code without breaking it: the rule,
the names to find it by, the test that holds it. [docs/DECISIONS.md](docs/DECISIONS.md) is the *why and the history*:
dated decisions, open items, and *Findings* — the full stories. **A bullet here is not a story**: no "before" or "until", no
who asked — the date of its decision is the pointer to all of that. **The app's shell has its own notes**,
[mac/CLAUDE.md](mac/CLAUDE.md), loaded once a session reads a file under `mac/` (2026-10-28). **This file stays under
120 000 characters** (`npm run check` fails past it): a new finding is a decision entry there and a line or
two here, and a bullet that grows is pared. **A comment in the code carries the date of its decision, never a
person's words**: the request, quoted, goes in the decision entry (the board is shared). **Nothing names the real
org, its repos or the people on its PRs** — `acme` and stand-ins, in the code, the tests and both docs; commits carry
GitHub's noreply address (this repo's `user.email`). **A commit's message is a subject line, a blank line, the body**
(2026-10-21), never one long line.

## Run, build, check

```sh
scripts/launchd.sh install          # the server as a login agent, run from this checkout — the recommended setup
scripts/launchd.sh restart [--after N]   # after a server.mjs change; the drawers stay (holders); N s first, so a recap lands
scripts/worktree.sh new <name> | list | done <name>... | prune   # parallel work beside other sessions (below)
mac/build.sh install                # the native app into /Applications — Swift changes
npm start                           # node server.mjs → http://127.0.0.1:7331, by hand
npm test                            # node:test over test/, the drawers end to end too (≈45 s)
npm run check                       # static: the page compiles, the tests' rules, swiftc -typecheck, this file's size (≈10 s)
npm run verify -- "<js>"            # one expression on the live board in headless Chrome (see Verifying)
npm run webkit -- "<body>"          # the same in WebKit, the app's engine; --shot is the compositor's own frame
npm run shell                       # the real shell on a throwaway server, by the window's pixels; never in front (≈20 s)
npm run perf                        # the board's cost in WebKit, and the animation rules (≈40 s)
npm run scenario -- scripts/scenarios/<name>.mjs   # a multi-step browser check on its own server (see Verifying)
npm run scenarios                   # all of them, one at a time, with a verdict (several minutes); `-- drawer` narrows it
npm run map                         # rewrite the section maps at the top of server.mjs and index.html
```

* **The server is a launchd agent run from the repo; the app adopts whatever answers on 7331.** Quitting or
  rebuilding the app touches no chat. A page change is live on reload (the agent serves the working tree's
  `public/`); a `server.mjs` change needs `restart`, which ends no drawer (each is a holder)
  and brings the page along. The app's bundled server is the fallback for a Mac without the agent.
  → Findings: *launchd agent*.
* **Node ≥ 22** (the harness uses the global WebSocket), **`npm install` first.** Runtime deps: `node-pty` (native),
  `ws`, `@xterm/headless` 5.5.0 and `@xterm/addon-serialize` 0.13.0 — pinned exactly to the vendored xterm's version,
  which `npm run check` compares with `node_modules`. The xterm client packages, marked, DOMPurify and highlight.js are
  dev-only, `public/vendor/`'s sources byte for byte (2026-11-06); every version exact. Rebuild the app after `npm install` or
  a node switch (it copies `node_modules` and the node binary).
* **A session that runs in a drawer**: finish the work, write the notes and the recap first, and run
  `restart --after 20` last. `scripts/board.sh /api/terminals` says which chats are in drawers. `launchd.sh` and `build.sh`
  detach themselves when run from a drawer (`PEIXAIRADA_DRAWER`, the app's bundle id). → Findings: *build.sh from a drawer*.
* **Parallel work goes in a worktree, `scripts/worktree.sh`** (2026-10-14): `new <name>` is `.claude/worktrees/<name>`
  on its branch from the local main, with no node_modules link — Node and `npm run check` find the
  checkout's up the folders. Land it on main (a fast-forward, else a cherry-pick), then `done <name>`: the worktree and
  its branch go only when every commit is on main (by patch), nothing is uncommitted and no process is inside, never by
  force; `prune` does it for every finished one left an hour.
  → `test/worktree-script.test.mjs`.

## Layout

| Path | What |
|---|---|
| `server.mjs` | The backend: transcript tailing, sessions, SSE, HTTP, notifications, the holder proxy. A **section map** at its top (`npm run map`); boots only when run as the program, exports its pure parts for the tests |
| `lib/termhold.mjs` | The holder: one process per drawer — the PTY, the exact screen, a Unix socket |
| `lib/instagram.mjs` | Lunch's Instagram, in Chrome: a profile, the stories, the login |
| `lib/cdp.mjs`, `lib/testserver.mjs` | Harness plumbing: headless Chrome over the DevTools protocol; a throwaway server with cleanup, `waitFor`, `post` |
| `lib/refit.mjs` | A terminal's refit, the holder's copy |
| `lib/version.mjs` | The version (2026-10-21): package.json's major.minor, the patch the commits since; the server's per HEAD, build.sh's into the app |
| `public/index.html` | The frontend, one file, no build step. A section map at the top of its script |
| `public/vendor/` | `marked` 18.1.2 + `DOMPurify` 3.4.17 + `highlight.js` 11.12.0 + `xterm` 5.5.0 (+ fit 0.11, web-links 0.12) — UMD builds, no CDN at runtime |
| `mac/Sources/main.swift` | The native shell: window, the pane (web views per page), server lifecycle, Dock badge, menu bar, notifications, the hotkey forwarder |
| `mac/icon/MakeIcon.swift`, `mac/build.sh` | The icon, drawn in CoreGraphics; compile + bundle + sign + install (the version `lib/version.mjs`'s) |
| `scripts/launchd.sh` | The server as a login agent; `restart [--after N]` |
| `scripts/worktree.sh` | A worktree per piece of parallel work (see above) |
| `scripts/verify.mjs`, `scenario.mjs`, `scenarios.mjs`, `scenarios/` | The browser harness (see Verifying) |
| `scripts/perf.mjs`, `lib/animcheck.mjs` | The board's cost in WebKit (see Verifying) |
| `scripts/shell.mjs`, `shell-probe.swift`, `shell-checks/` | `mac/Sources/main.swift` itself, driven (see Verifying) |
| `scripts/webkit.mjs`, `webkit.swift` | The live board in a `WKWebView`, the app's engine |
| `scripts/fakeclaude.mjs`, `fixture.mjs` | A stand-in CLI for tests; a `~/.claude` look-alike |
| `scripts/fake*.mjs` | What every test server runs instead of the real CLIs and services; each file's head says its knobs |
| `scripts/readme-board.mjs`, `-shots`, `-clips` | The README's pictures from a made-up board, never the real one: stills and clips (animated WebP) → `docs/shots/` |
| `scripts/check.sh`, `check-page.mjs`, `map.mjs` | Static checks; the section maps |
| `test/` | `node:test` files (`npm test`) |

## How it reads Claude Code

| Signal | Source |
|---|---|
| Transcript, appended live | `~/.claude/projects/<cwd-slug>/<session-id>.jsonl`, `fs.watch(recursive)`, started before the boot's scan; a live chat's file stat'ed on the poll too (2026-10-14). Boot reads the last `TAIL_BYTES` of each and the PRs in its first `HEAD_BYTES` (`headPrs`); opening one reads it whole, a chunk at a time (`readLines`) |
| Which sessions are alive | `~/.claude/sessions/<pid>.json` + `process.kill(pid, 0)` and, given a `procStart`, that pid's start (`procAlive`, `LC_ALL=C TZ=UTC ps -o lstart=`, 2026-10-14); watched *and* polled every 10 s (pids die silently) |
| Where a chat lives | `entrypoint` on user/assistant lines (`claude-vscode` / `cli`), the registry's while it runs — `inVsCode()`. Several processes on one chat: the drawer's own is `live`, else the newest in no VS Code or background; the rest are `rivals`. **A background session** (2026-11-04; `kind: bg`: `/bg`, `/fork`, `--bg`; `jobOf`): `/terminal` attaches it (`claude attach <job>`, which registers nothing; `t.claudePid` the worker), `endClaude` by `claude stop` (SIGTERMed, the daemon may start it again), a `spare` no chat. → `terminals.test.mjs`, `resume-bar.mjs` |
| Reply finished | an assistant line whose `stop_reason` is in `TURN_ENDS` (`end_turn`, `stop_sequence`, `max_tokens` unless it cut a tool call, `refusal`; tool calls are `tool_use`) — **or the registry's `idle` with a `statusUpdatedAt` after your last word** (`statusOf`: `/compact` ends with no assistant line) — unless a **sub-agent** is at work: `<slug>/<id>/subagents/agent-*.jsonl` whose last line is not a turn's end, nor its `SubagentHandback` result, nor an interrupt, written within `AGENT_STALE_MS` (`scanAgents()`; a dead chat counts none). A background agent ends the main turn at once; this keeps the card clauding |
| An agent's row | (2026-11-02) its `.meta.json`, its transcript's first line (`agentBorn`) and last (`mateLast`), its notice to the chat (`noteAgentNotices`, by `toolUseId`) → `s.agentRows` (`noteAgents`): the last round (one starting after all before ended), an older failure kept (`old`); words hold `AGENT_WORDS_MS`; `finished` with nothing written since ends one (`agentFinished`); a roster's name with no file is `joined`. `…/agents/:id`: totals, `?after=n` its transcript, read when asked (`agentLog`). → `test/agent-rows.test.mjs`, `team.test.mjs` |
| Waiting on the user | **the registry's `status: "waiting"`** — every interactive claude rewrites its `sessions/<pid>.json` on each change (`busy` · `idle` · `waiting` · `shell`), with `waitingFor` (`input needed`, `permission prompt`, …) — `waitingOn()` / `statusOf()`; any live process waiting is the chat waiting, and it beats the agents; **`dialog open` is not asking** (`NOT_ASKING`). **The transcript cannot say it**: the line that asks is written *with its answer* — only the fallback for a claude that reports no status (`s.ask`). The flip into waiting is the `needs-input` alert (`loadRegistry`) |
| Work behind the turn | `Monitor`, a `Bash` `run_in_background`: the tool_result names the task, `<task-notification>` lines its events and end. `s.tasks` → `tasks`; a task dies with its claude (`live.startedAt`, `pruneTasks`) or at its expiry (`MONITOR_MS`; `TASK_MAX_MS` from lsof's last *held*, 2026-11-04, `taskOverdue`). **A completion delivered mid-turn never becomes a line**, so `sweepTasks` runs **one** `lsof -F n` per poll over the output files (held till it exits), after `TASK_GRACE_MS`, never on lsof's own failure. **The registry's `shell` says one runs**: none known, the chat is read whole, once (`findTasks`). → `test/long-tasks.test.mjs`. **Wake-ups** (2026-10-31): `ScheduleWakeup`, `CronCreate` → `wake` (`nextWake`, `cronNext`); a stopped turn → `stopped` (`stopOf`). → `test/watch-lane.test.mjs`, `stopped-reason.mjs` |
| A copy of a chat | (2026-11-04) its first user line's uuid, kept by `/branch`, `/fork`, `--fork-session` (`noteFirstLine`, `firstLines`): the oldest file (`bornAt`) is the chat, each other its `branch` link (`tieCopies`), its past no news (`forkAt`). **`/bg`**: a `continued-in` line is a `continued` link and a tick, once (`noteContinued`). → `test/chat-copies.test.mjs`, `chat-went-on.mjs` |
| Chats talking | (2026-10-31) a meta `user` line or `queued_command` attachment with `origin.kind: "peer"`, no `senderTaskId`; queued, a `queue-operation` envelope (`peerOf`). **Never your word**; sender by `msg_id`, pid, name (`peerSender`) → `peers.test.mjs` |
| Titles | board title (state file) › `custom-title` › its own PR, merged too — the first pr-link's, else the first you named (`linked`, `named`; 2026-10-27) › `ai-title` › last prompt — `summary()`, `prTitle()` |
| Model | `message.model` on assistant lines, the last one wins, `<synthetic>` skipped — `s.model` |
| PRs mentioned | `pr-link` lines, GitHub pull URLs *and short references* in user/assistant text, newest first; `gh api graphql`, batched (see *The server*). **Not Claude's listing** (`LIST_MIN`: ten, most unheard of: `prsHeard`); **a `gh pr create`'s output is its own** (`noteOpened`); past `MAX_PRS` the oldest only heard of goes aside (`prsGone`). **A short reference** (2026-10-06, `refsIn`): `#12` the checkout's repo (`ghRepoOf`, a worktree followed), `widgets#12` the org of the root holding the checkout, `acme/widgets#12`, `widgets #12` under a root, a list after one on its line; none in code, a link's text, a URL or after *step*… (`COUNTED`). **On the chat only once GitHub finds a PR there** (`shownPr`); a bare one not when merged or closed and opened `REF_AGE_MS` before it was said (`pastRef`); a NOT_FOUND lets it go (`forgetRef`, `noPr`). → `test/pr-refs.test.mjs`. **Taken off** (2026-10-11, `unlinkPr`, `…/unlink`, `unlinked`), it stays off but for a word of yours after. → `header-prs.mjs` |
| Jira tickets named | `KEY-123` in prose (inline code counts, fenced not), `…/browse/KEY-123` links and the chat's `gitBranch` — `ticketsIn`, `noteTickets`, `noteBranchTicket` → `s.tickets`. **A bare key is asked about only when its project is the site's** (`jiraProjects`, hourly; none before they are known, an answer from before a reset dropped — `jiraGen`) and **shown only once Jira answered** (`shownTickets`); one Jira lacks is let go (`noTicket`). Basic auth: setup.jira `{site, email}`, the token from `JIRA_API_TOKEN`, else the keychain item *peixAIrada Jira* (by `security -i` from stdin, never argv); polled as PRs are (`prEvery`). → `test/jira.test.mjs` |
| Branch moved under it | (2026-10-13) `gitBranch` on every line (`HEAD` detached): a change in the same folder no git command of the chat's own explains is held (`noteBranch` → `s.driftDue`) and judged `MOVE_SLACK_MS` after it is seen (`settleDrift`, on a timer too) — only then shown or alerted. Its own: one that can change the branch (`GIT_MOVE_RE`, the subcommand whole — no stash, reset, pull, merge, merge-base) in its Bash, a sidechain's, a `!` one, a sub-agent's (`agentsMoved`): in the hour before, since the old branch's run naming the new one, or later in the same message naming it (`ownMove`). Through `HEAD` and back is none; your prompt clears it (`branchHeard`, `headOk`). The disk: each live chat's checkout's HEAD file on the poll (a worktree's its own), a move judged on a look `MOVE_SLACK_MS` after the first (a chat at work: once a line of its own came, `DISK_HOLD_MS` at most; the boot at once, in silence), against the branch before a held move (`sweepHeads`, `headAt`, `noteHead` → `headNow`, `diskDrift`, `peers`). Summary `drift` (live chats, not set aside — `driftOf`) and `headNow`; a `drift` alert for a chat at work (`driftNotify`); a click on the chip sets it aside (`driftAcks`, `POST /api/sessions/:id/drift`). → `test/drift.test.mjs`, `branch-drift.mjs` |
| Plan usage | `GET https://api.anthropic.com/api/oauth/usage` with Claude Code's own OAuth bearer from the keychain item *Claude Code-credentials* — never reaching the page; `USAGE=off` disables. A cap in money (`limits[]` of `kind: 'spend'`, `extra_usage`'s cents) → `used`, `limit`, `currency` (`usageWindows`). No five-hour window (2026-11-02): `five_hour` is dropped. → `test/usage.test.mjs`, Findings: *plan usage* |
| Chat from the board | a holder runs `claude --resume <id>` or `claude` in the chat's cwd through an interactive login shell (`RUN_SHELL`), tied to its session by pid. **A folder whose Taskfile launches claude** starts new chats as `task <name>` (`GET /api/launchers?cwd=`, `task --list --json` cached by mtime, `TASK_BIN`; `POST /api/terminals {cwd, task}`) — only where Claude Code trusts the folder or one above it up to the repo's root (2026-10-16, 2026-11-06; `claudeTrusts`, `CLAUDE_JSON`): claude is then a *descendant* of the PTY's pid, as under a wrapper that does not exec (2026-11-04; `untied`), found through `ps` (`linkTermToRegistry`, `t.claudePid`), the launcher's name kept (`noteEnv` → `envs` → `s.env`); a resume never goes through task. **`/clear` or `/resume` in a drawer** gives the pid a new session id: `linkTermToRegistry` moves the holder and the chat's live zsh holders, and pushes **both** chats (`terminal` event). **A /clear ticks the chat it left done** (2026-10-10; `clearedFrom`, `loadRegistry`, `tickCleared`): once the new transcript begins with the command at or after the old one's last word; not a /resume or a fork. → `test/clear-done.test.mjs` |

**Never written: anything under `~/.claude`.** The board is read-only against Claude Code's data. The
  fake claude refuses the real one too (by device and inode, at CLAUDE_DIR or above). A chat's folder in it is refused where the board would write (`inClaudeDir`). **Never opened** (2026-10-31): `sessions/*.key` (a chat's peer token), `shell-snapshots/`, `history.jsonl`, team `inboxes/` → `peer-keys.test.mjs`.

## The server

* **Only the board's own page may ask** (2026-09-27): every route and the terminal upgrade refuse a request whose
  Origin is not this server's or whose Host is not a loopback name (`foreign()`); no Origin passes (curl, the app, the
  tests), a `null` one is nobody's. An `<img>`, `<script>` or navigation sends no Origin, so `Sec-Fetch-Site` must be
  `same-origin` or `none` when sent — a tab's navigation to `/` aside (`Sec-Fetch-Dest` `document`). **`/` is served under
  `pageCsp`** (2026-11-06): inline scripts by hash at serve time, connections and images as listed, `frame-ancestors
  'none'`; a violation fails a scenario (`meta.csp: false` reads its own), a new remote host goes into it
  (`page-load.test.mjs`). Bound past loopback, the Host must be an address, a loopback name or this Mac's (`foreignTo`), and no Origin is only for this Mac. → `test/origin.test.mjs`.
* **Every route but the page wants the board's key** (2026-10-16; `keyWant`, `KEY_OPEN`): `<state dir>/key`, 0600, as
  `x-peix-key` (`api()`) or `?key=` (the stream, a socket); the app injects it (`giveKey` → `PEIX_KEY`), a browser
  trades a ticket on a tab the server opens (`/api/key/open`, on osascript's stdin; `keyTicket` → `localStorage`, never a
  cookie), else the lock (`#lock`). A wrong key is refused always, none too (2026-11-06) but under `KEY_MODE=lax`
  (till `keyEnforced`: the app's page with it, no app, Settings). `/api/alive` with `x-peix-nonce` answers its HMAC
  under the key (`aliveProof`): the app trusts no listener before it (mac/CLAUDE.md). **A new route is keyed unless in `KEY_OPEN`; a new client
  sends the key** (`keyed()`, `keyHeaders()`; a test's `srv.api` · `srv.ws` · `srv.key`; `window.PEIX_KEY` in a
  scenario's page). → `test/key.test.mjs`, `board-key.mjs`.
* **The port first, then the boot**: `main()` waits until `listen` succeeds before it reads the state file (`loadState`; an import neither reads nor saves it), adopts holders, reads the
  registry, polls or saves state; every request and upgrade waits for `booted`. **A route writes its head only once
  its body is in hand**, and the handler's catch destroys a response whose head went out.
* **Nothing the server starts or accepts may emit an unheard `'error'`**: a drawer's WebSocket (`maxPayload` 8 MB),
  every spawn (`code serve-web`).
* **A chat re-read is silent and keeps what the transcript cannot say** (`indexFile` on a chat the board holds):
  `s.silent` stops `queueNotify` for the re-read; `live`/`rivals`/`alive`/`startedAt`/`openedAt`/`agentsRunning`/`team`/
  `headNow`/`headOk`/`peers` carry over (`diskDrift` after the read), a tail re-read keeps `prev.tasks`, the replaced object's timers are cleared. A registry-made
  placeholder is **not** silent: its first reply is news. → `test/reindex.test.mjs`.
* **A snippet is markdown as a sentence** (`plain`, `plainSnippet` — `lastPrompt`, `lastReply`, the tiles): a link is
  its words, markers go, a GitHub PR or issue URL is `repo#n`, other URLs lose scheme and long segments; backticks
  stay (the page draws them, `ticks()`). → `test/transcript.test.mjs`.
* **`summary()` reads only.** `pruneTasks` (the poll) deletes expired tasks; `sortedSummaries` builds one
  `termIndex()` and hands it to `summary(s, ti)`.
* **Bodies go through `jsonBody(req)`**: `readRaw` decodes the bytes whole; none, unparseable, not an object or too
  large all read as `{}`. Past its limit a body is drained, not destroyed (the 413 must reach its socket); a refusing
  route sets `connection: close`.
* **The state file is written beside itself and renamed over** (`saveState`, 0600); one that does not parse is kept as
  `state.json.bad-<ms>` and logged, never dropped and written over. STATE_FILE set never reads the legacy one.
  → `test/state.test.mjs`. **The state folder is this user's alone** (2026-11-06; `privateDir`: 0700, one not this
  user's refused — TERMS_DIR too, before a spawn and an adoption).
* **Nothing secret rides argv** (2026-11-06; `ps` shows every account's): the ticket on osascript's stdin, board.sh's
  key by `curl -K -`, Jira's by `security -i`. A chat id never starts with `-` (`spawnTerm`); osascript's words follow
  `--`; a spawn's prompt has no control character; the Jira token goes only to its own site (`jiraTokenSite`); the log
  writes `…` for `key=`, `tkn=`, `ticket=`.
* **One spawn per chat and kind at a time** (`spawnOnce`, `<chat>:claude` / `:shell`). **Nothing is signalled that
  is not the registry's process**: `endClaude(entry)` compares `procStart` with `ps -o lstart=` in UTC
  (`sameProcess`) — a dead claude's file lingers and its pid can be anyone's. → `test/terminals.test.mjs`.
* **The open chat's entries are numbered on the wire**: `/messages` and every `entries` event carry `gen` (which
  reading of the file, `newSession` numbering each) and `upto` (`entryCount`); the page keeps only what is past what it holds, and another `gen`
  or a gap is a fetch (see *The transcript*).
* **The holder socket is `setEncoding('utf8')` on both ends.**
* **Keeping the Mac awake is two switches, and only one is the board's** (2026-10-08, `keepAwake`, `setLid`,
  `/api/awake`, an `awake` event): *awake* is a `caffeinate -i -w <server pid>` held while `awake` is on in the state
  file (one that ends on its own turns the switch off); *lid closed* is `/usr/bin/pmset -a disablesleep 1|0` as root (`lidRuns`) — through
  `sudo` first, then osascript's dialog (a cancel is a 409); `AWAKE_ADMIN` is `sudo` · `osascript` · `none` (the tests).
  **The lid's setting is the system's, never kept here**: `readPower` reads `pmset -g` every minute (`POWER_POLL_MS`),
  with the idle sleep in use and the power source (`idleSleep`, `power`); the cup is muted while it has nothing to hold
  off (`cupMoot`, `cupTip`). → `test/awake.test.mjs`, `keep-awake.mjs`.
* **Every CLI the server shells out to goes through `findBin()`** — `git` too — the app's server has a bare PATH;
  `<NAME>_BIN` overrides; a file it can run, looked for again a minute after none was found. The login agent's PATH
  is the installing shell's, then the system's. **The network calls**: `gh` (PRs, a PR's diff), `git` to a checkout's
  origin when a PR's diff or a worktree is asked (`GIT_TERMINAL_PROMPT=0`), the usage endpoint
  (`planUsage`), Jira once the setup names a site (`jiraAsk`; its token
  never reaches the page or the setup file — `GET /api/jira` says only where it is), GitHub's REST API for the chat, Instagram and
  `claude -p` for lunch, VS Code's update service, and Homebrew when Zed is picked and missing.
* **VS Code Web wants the board's token** (2026-10-16; `vsweb-token` in the state folder, 0600): the page gets it from
  `POST /api/vscode-web` and opens `?tkn=` (`vswebAt`), traded by serve-web for its cookie; one on the port the board
  did not start, serving without it, is refused, and nothing is sent the token before its listener is the serve-web this
  server started or this user's VS Code (2026-11-06; `vswebWhyNot`, `portListener`). **Kept on its newest build** (2026-10-11,
  `freshenVsWeb`, `VSWEB_FRESH_MS`; 0 in tests): the newest, when serve-web's cache lacks it, asked of serve-web **by
  name, `/<quality>-<commit>/`** — never its root, which starts a server. Read only under `~/.vscode`.
  → `test/vsweb.test.mjs`.
* **The board updates itself from its checkout** (2026-10-12; `checkUpdate`; `selfUpdate` in the state file, **off by
  default** (2026-10-13): what came is said, *update now* takes it; Settings › Updates, `GET/PUT/POST /api/update`, an
  `update` event): only the agent looks by the clock (`UNDER_AGENT`, `UPDATE_EVERY_MS`), fetching its branch's upstream
  alone (no FETCH_HEAD, no tags), **fast-forward only, to a tip a key in `.github/allowed_signers` signed** (2026-11-06;
  `signedBy`, HEAD's list, never the new commits'; else `unsigned`, not even *update now*; named, `commits`) — not over
  a tracked change (`dirty`), a branch moved on its own (`diverged`), a held commit, or within `UPDATE_QUIET_MS` of a
  touch (`lastTouchAt`); *check now* (`asked`) skips that wait, *update now* (`apply`) the switch, the hold and a change
  the commits do not touch too (`clash`, 2026-10-15; `whyNot`, `updWord`). What they touched restarts (`updateParts`):
  `npm ci --ignore-scripts` (2026-11-06), the agent (`launchd.sh restart`) and, when behind, the app (`mac/build.sh
  install`), both detached; the page reloads once left be (`takeUpdate`, `reloadBusy`; never mid-update nor before the
  new server is back). **Its progress is the status bar's** (`updSeg`, `updRun`, `watchBuild`), a click on news taking it
  (2026-10-14; `canPull`, `canBuild` → `data-take`, `updNow`). **First the new page compiles and the new server starts
  on a spare port** (`preflight`); one that does not is undone (`git reset --keep`, only while HEAD is the commit pulled)
  and held (`updateHeld`). **The app is held against the checkout** (2026-10-14; `readApp`, `appWhyNot` → `app`,
  `appWhy`; `lookApp` every minute): build.sh stamps `PeixSource`, mac/'s tree as built (its notes out), and one not
  HEAD's (`macSource`) is behind — rebuilt with a pull, else by *update now* or the switch once quiet, by the clock never
  twice for one source (`appBuild`), never over work in mac/. → `test/update.test.mjs` (knobs `UPDATE_DIR`,
  `UPDATE_*_BIN`, `NPM_BIN`, `BOARD_APP`), `auto-update.mjs`.
* **The page follows a restart** (2026-10-13; `pageStamp`, `pageFollows`): `/` is served with `<meta name="peix-page">`
  — a stamp of the file on disk and the serving boot (`SINCE`) —, every snapshot names the page on disk (`page`); one
  from a server started since, with another page, wants a reload as an update's does (`reload.want`). A reconnect to
  the same server reloads nothing. → `test/update.test.mjs`, `restart-page.mjs`.
* **A PR is polled by how recently its chat was touched** (2026-09-28, `sweepPrs`, `duePrs`, `PR_POLL`): never asked →
  at once, then 1 · 5 · 30 min within the hour · day · three days, never after; touched is `lastActivity` or
  `s.openedAt` (a fetch, asking at once past `PR_TTL_MS`). Merged and closed never twice; one in flight unqueued
  (`prAsking`); `PR_BATCH` twenty a call. **A call that fails as a whole changes nothing** and pauses the polls, 1 min
  doubling to 30; one GitHub refuses is asked again in halves (`prSplit`). → `test/pr-poll.test.mjs`.
* **A PR you wrote or reviewed has a turn** (2026-09-28; `PR_FIELDS`, `viewer`, `prTurn` — pure): `you` when someone
  else's PR moved past your last review or word, or asks for you again; on yours, when someone else reviewed,
  commented or pushed after your last word. Bots are nobody. **Any word of yours answers every reason before it**;
  only a reason that *came* is a move (`newsIn` against `came`, 2026-10-14). **A move un-ticks every chat that names
  the PR** (`isDone` against `turn.movedAt`, kept in `prTurns` by `moveTurn`) and alerts the chat touched last
  (`notifyPr`, a `heading`). Polled by its own newest event too (`PR_WATCH`). **A chat done for good** (2026-10-11;
  `forGoodMarks` → `forGood`, while that tick holds) is `forgotten(s)`: its PRs neither un-tick, rank, alert nor are
  asked about for it. →
  `test/pr-turn.test.mjs`, `pr-turn.mjs`.
* **A round let go** (2026-10-12; ⌥-click on a card's `.prmove` or the header's `.hmove`, their right-click row →
  `letGo` → `POST /api/sessions/:id/waive` → `waiveTurn`; one PR `{url}`, back `{url, undo}` → `unwaiveTurn`,
  2026-10-15): its PRs at your move read `you: false, waived: true` — no line, no count, no un-tick — till the next
  move (`released`, alerted); `waived` is on `prTurns`. → `let-go.mjs`.
* **A PR keeps its history** (2026-10-15; every PR a chat shows, 2026-10-17 — `prLogs`): each look's events
  (`prEvents`, `u` each one's page; `ciEvent` a change since the last look) merged by id (`logEvents`: a short or stale
  look takes none back; 150, `older` when GitHub has more before); rounds (`noteRounds`, a turn's, 30) opened by a move
  at GitHub's time, closed `answered` only by your word at or after it (else `them`, `gone` an hour on). Kept past a
  merge while a chat not done for good names it, a month on (`pruneLogs`). `pr.rounds` the last three, `pr.logged` its
  count, `…/prlog` every shown PR. **The chat's own hand** (`prActs` → `takeActs`): a push or a `gh` that writes to a
  PR, no error, tied by URL, number or branch, is its event and a round's `by`; asked again `PR_CONFIRM_MS` on.
  → `test/pr-rounds.test.mjs`, `test/pr-ledger.test.mjs`.
* **A PR knows who had a hand in it** (2026-09-29): `avatarUrl(size: 48)` on each person (`WHO`); `prPeople` —
  author, reviewers, commenters, pushers, newest first, `PEOPLE_MAX`, no you nor bots; a PR the
  call could not see keeps its faces.
* **The chat is a GitHub repo's issue** (2026-10-17; setup.chat `{repo}`, `chatTick`, `chatRoute`): one, unnamed
  (2026-10-18), the oldest open labelled `room` (`chatFind`; `chatStart`, the admin's), its comments the messages, by
  REST with gh's token (`ghRest`, `GITHUB_API`): the newest comments by one URL and ETag (a 304 free), `CHAT_FAST_MS`
  while watched, writes `CHAT_GAP_MS` apart (`chatWrite`), its mails off (`chatQuiet`); only its `admin` manages
  people. **A poll is a message, a vote its reaction** (2026-10-20; `pollOf`; `chatVotes` when the list's `rx` moves).
  No repo: invitations every `CHAT_INVITES_MS`, never at boot; `chatPlaces`. One GitHub hides is `missing`; `use` asks
  first. → `test/chat.test.mjs`.
* **Lunch** (2026-10-18; setup.lunch; `lunchTick`, `lunchRun`): at `LUNCH_LOOKS` from `at`, for places not `settled`
  (a month's dishes are not, 2026-10-20), the profile logged out, the stories logged in (`lib/instagram.mjs`),
  the Slack channel at `LUNCH_SLACKS`; **each picture read once by `claude -p`** (`runReader`, `reads.json`), today's
  `dishesOn`'s, a week's story kept (`lunchKept`); **a reader is no chat** (`ownReader`) **and only reads** (2026-11-06; `readerArgs`: `dontAsk`, Slack's writes denied); alert kind `lunch`.
  → `test/lunch.test.mjs`.

## The board

* **Two columns**: the selected project's chats → the chat. **A project in view is the list's own tab, at its top** (2026-11-04, round XXV; `#stitle`, `cueDraw`, `hidden` on ALL; its row `auto`, the list's `minmax(0, 1fr)`, changed inside `drawCards`, so the cards slide by it): level with the toolbar (`--cue-h`, `--cue-drop`, `floatH`), the name (`.t`, ⌥⌘P's picker), `.cn`, Show all (`.sx`), a question elsewhere counted there (`.ask`). **A card and the list's ground are the same as on ALL**; its end what is hidden (`.gsep.others`), the toolbar's tab solid with the funnel (`.repo.on`, `scopedOn`). ⌥⌘P ⌥⌘P ALL and back (`projectAgain`, `prefs.lastProject`). **A chat from elsewhere lets it go; it never moves by itself** (`scopeTo`). `tabFlight`; `cueWave`. → `project-filter.mjs`, `project-cue.mjs`. A chat is *ready · clauding · done*
  (`bucket()`); the server keeps the finer `status` for notifications and the badge.
* **The cards are reconciled, not rebuilt** (2026-09-27): `renderSessionList` builds `{id, html}` items;
  `drawCards` keeps each card's node whose markup is unchanged (`cardNodes`), makes the rest, and orders them with the
  fewest moves; the lines likewise (`lineNodes`). **An update that moves, adds
  and removes nothing reads and touches nothing.** Anything that mutates a card's DOM directly is lost on the next
  change of its markup. `markQsel` re-toggles `.qsel` after every render, on the chat (`qsel.id`), not its place.
* **What the stream says is drawn once a frame** (`renderBoardSoon`; a 100 ms timer where there are no frames): the
  `session`, `projects` and `pins` events. A landing and anything a click does are drawn at once
  (`renderBoard`, which cancels the pending one). `peix.state().rendering`; `ctx.settle()` waits for it.
* **A box the page redraws on every update is drawn only when its markup changed** (`setHtml(el, html)`,
  `el._drawn`) — a button replaced between press and release loses its click. Whatever edits such a box in place
  forgets `_drawn` (`peixPaneUrl` does).
* **The list moves rather than jumps** (2026-09-27): `drawCards` FLIPs a card that changed rank (WAAPI, `FLIP_MS`),
  fades in one that arrived (`ENTER_MS`) and folds one that left (`leaveCard`, `LEAVE_MS`) — within a screen of the
  window, never on the first draw or under reduced motion. **A folding card is wrapped in `div.leaving` and loses its
  `data-id`**, so `#slist > .card` — the page's and the harness's count — never sees it. `peix.motion()` logs
  every move by its `id`. → `list-motion.mjs`. **A landing** is `landed` (`landedAt` from `working` → `idle`;
  `flareLanded()` sets a negative `animation-delay` for `LANDED_MS`, so a rebuilt card carries it on).
* **A card's glow** (`--edge`, `--tint`, `--reach`, `--fall`) is the base under the rows, which draw none.
* **Type, corners and motion are tokens**: `--fs-2xs` … `--fs-xl` (10–18 px), `--r-1` … `--r-5` (3–14 px), and
  `--ease-out`, `--spring` (a `linear()` curve, read by the script through `cssToken`) and `--t-hover`.
  A new rule takes one — settling eases out, arriving springs —, and a fit that needs its own number says why. **A press
  dips by the `scale` property** (the FLIP's `transform` and the ring's stay theirs): a card 99 % unless the press is on
  a control in it (`:has`), small controls 97 % — never the address, nor a tab
  pressed on its ×. → `small-motions.mjs`, `pane-tabs.mjs`.
* **Counts roll** (`rn(key, n)`, `rollSoon`): a count is plain text in `.rn[data-rk]`; after a draw, one whose key
  showed another number becomes a digit strip, plain text again `ROLL_MS` later — so `setHtml` and the reconciles
  compare the same strings, and `textContent` reads the number mid-roll (`.rv`). Each strip rolls by an animation of
  its own from the old digit — never a transition after a forced layout (2026-10-13).
* **Dialogs, `.pop` and `.note` ease in and out with `@starting-style`** and `allow-discrete`: a closed dialog is
  still `display: block` for 140 ms with `open` already off — read `open`, never `display`. One that must vanish at
  once sets `transition: none`. `note()` fades (`.out`) first.
* **An age is `data-at`, never words in markup**: `fillAges(root)` writes `rel()` after the list's render, after
  `pickRender` and on the 30 s tick. **A card's `.time` carries nothing at all** — `fillAges` sets it from the chat —
  so neither the clock nor a tool call changes a card's html (a *prompt* still rebuilds it). `dayOf(ts)` is the one
  spelling of a day (`Today` · `Yesterday` · the weekday · `DD-MM-YYYY`).
* **Controls wear a fill, never a grey edge** (2026-09-28): `border: 1px solid transparent` and `background:
  var(--ctl)`, `var(--ctl-hi)` under the pointer; a state is a tint of its colour. `--ctl` is the ink at 7 %, set on
  every element (`*`) so it follows a borrowed `--ink`. Text boxes, dialogs and popovers keep their edges, as does a
  semantic one (a failure's red, an open box's accent).
* **The header's shadow on a scrolled transcript** is `.shead::before` on a scroll-driven animation (`#log`'s `--log`
  timeline, `main`'s `timeline-scope`); else `--shade` (`SCROLL_TIMELINES`).
* **A name too long fades, not …** (`fadeOver`, `fadeSoon`): a mask only where `.over` says it overflows — the header's
  title and `.purl` on every draw, a card's title once per node (`.ovr`) and when the list's width moves.
* **A broad gradient wears grain** (`--grain`, its first layer).
* **Accessibility is kept by rule** (2026-10-12): the settings' `.stabs` and each half's strip are `tablist`s
  (`aria-selected`), the small terminals `inert`, `readerOn` xterm's `screenReaderMode` (VoiceOver or
  `prefs.termReader`); what colour or motion
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
* **The card's edge is one ring with four readings**: `--lit` what runs, `--seg` how much of the edge one light owns
  (`100% / --lights`, one per sub-agent), `--spins` how fast. **Clauding**: the project's colour lifted towards white
  (`--glow`, OKLCH). **Watching** (`s.tasks`): one light in `--watch`, slowly — on a ready card too. **Asking**
  (`needs-input` while alive): no ring — a red border and pings (`@keyframes sonar` on `::before` and `::after`, the
  card `overflow: visible`), the question on the card (`askHtml`); answered while alive, `heard` (`heardAt`,
  `flareLanded`). **The three CSS rules are in priority order — work beats a monitor, a question beats both — and each
  sets every variable.** **The ring is a conic gradient on a square `::before` turned by a `transform`, under an
  `::after` cover 2 px in**: a card with a ring has no border (its padding takes the 2 px); the track (`--track`) on the
  open card only. **The live line** (`liveSlot`, `fillLive`, `liveSeen`) is a slot filled after the render, its memo in
  properties, so a tool call keeps the card's node: the last tool call (`doing`, `doingOf`; `pathTail`), a watching
  card's newest event. **`phaseAnims()`** (once a frame before paint; `true` at once) puts every `ring`, `sonar`,
  `pulse`, `pix` and `pixhop` at start 0 on the document clock, by its `currentTime`, then its `startTime` — only when
  something new may have started (`drawCards` says the list changed; 2026-10-13). → `card-signals.mjs`.
* **A card opens to its agents while they work** (2026-11-02; `fillAgents`, `agPlan`, `.agl`): asked, doing (`agNow`), age (`agLabel`), `AG_SHOW` rows then `+N`; one ended ticks, then a done row of results; a failure first, the chip red, until the chat is opened (`seenAt`), a summary once the last ended; nothing leaves under the pointer (`agHover`). **Chip, rows and `--lights` are out of the markup**: a new node filled before `drawCards` measures (`agFresh`). The chip folds them (`prefs.agentCards`), the live line naming who stepped last (`.agwho`). At same height too, in `.moveslot`'s place; folded, one height unless a move wants the line. `data-hide~="agents"`: none. Its card `#mxtip`'s (`agCardHtml`), its menu `agMenu`; rows too under the transcript (`renderPresence`) and on ⌥⌘A's tile. → `agent-rows.mjs`, `agent-even.mjs`, `agent-menu.mjs`.
* **Hidden (⌥⌘B, `#sbList` first in the status bar), the list is out of the layout** (2026-10-25; `prefs.listHidden` →
  `main.lhide`, `applyList`): `#sessions` and `#splitter` `display: none` — no card runs a thing —, the chat the whole
  width. **What only narrows the list shows it** (`showList`: the magnifier, a filter, a face, a project); shown, its
  scroll is back and `phaseAnims()` phases the new rings. → `list-hide.mjs`.
* **A project is a folder** (the registry's `cwd`, never the transcript's) **or a named set of folders** (state
  file); worktrees under a repo count as the repo — a named project's by its prefix (`inFolder`), its colour by
  the repo's name (`colorKey`), and **a folder project keyed by the repo for a chat in `<repo>/.claude/worktrees/<name>`**
  (2026-10-13; `projDir`, the server's `projectDir` → the summary's `project`; its pins, hiding and name are the
  repo's, its card wears its branch, `.chip.wtb` from `s.worktree` — `headNow` while it runs, else `gitBranch`). Pinned projects head the pickers (`state.pins`, `PUT /api/pins`).
  **✕ on a row of ⌥⌘N hides a project** (`hidden` in the state file, `PUT /api/hidden`; `projectList()` and
  `freeFolders()` skip it); its chats still show under ALL; starting a chat there puts it back (`newChat`).
* **A project's colour is the setup's** (2026-10-15):
  `projects[name].color` by name (`colorKey`: a worktree's is its repo's). None → `--nocolor`;
  `#000000` is `BLACK`, with its inks. The header's square is the picker (`setColor`); it and the
  setup's squares read `ownColor`, the board `repoColor` (a theme's hue). **A new colour on the board reads a token or `repoColor`, never a hex or `ownColor` of
  its own, or a theme does not reach it.** → `project-colors.mjs`.
* **A theme is every surface at once** (2026-10-10; ⌥⌘Y, `SKINS`, `skinCss`, `applySkin`): tokens under
  `:root:root[data-skin=…]`, beside its own appearance; **a family of two halves** (2026-11-01; `FAMILIES`, `halfOf`,
  `#themePick`, `setTheme`), one with a single half the board's own for the other. **The appearance is the board's,
  whatever macOS shows** (2026-10-12): `<html data-theme="dark|light">`, set before the first paint, which every dark
  rule reads — **never `prefers-color-scheme`**. Worn (`wornKey()`, `skinOn()`): the family's half of `darkNow()` —
  Appearance › Auto (`prefs.skinFollow`, the default; `setLook`) the system's, else `prefs.look`; the app's window wears
  it (`appearance` → `window.appearance`, `peixairada.dark`), so the pane's pages follow. The blacks read `--crust`,
  `--bar`, `--hd-*`; a project's colour moves to the theme's nearest hue (`skinColor` in `repoColor`; not under the
  board's own, `asSet`); the drawer's sixteen are the theme's (`xtTheme`, `ANSI`). **Every theme lays the chat in a
  frame** (2026-11-01): `--frame` (`:root`'s, a theme's `crust`) the window's ground, the sidebar (`--side`) and the
  status bar. **`data-frame` is the frame's appearance** — dark round a light chat under *Dark frame*
  (`prefs.darkFrame`; skinCss's `[data-frame="dark"]` blocks) —, which `#sessions` and `#sbar` read, never
  `data-theme`. **Every small ink holds 4.5:1 on its grounds** (the CSS's own; a theme's by `themeInks`; amber text is
  `--working-ink`). **A colour that reads no token is one no theme reaches.** → `themes.mjs`, `frame-themes.mjs`,
  `test/inks.test.mjs`.
* **The header floats** (2026-10-09; `<html data-head="float">` in the markup, never toggled): `#shead` and
  `#prlist` inset and rounded, **over the chat** — `#groups` spans the header's rows (`grid-row: 1 / 5`, every row of
  `#chat` placed in column 1: two overlapping items, one auto-placed, take two columns). A half with a strip pads down
  by `--float-h` (`floatH`, a ResizeObserver); one without runs up behind it — **but a drawer starts under it while its
  screen has room** (`.gterm.under`, `checkRoom`, `underOf`; a terminal draws from its top). → `drawer-under-head.mjs`.
  A half without a strip is `.grp.nostrip` (`renderTabs`) and the body holding the log `.gbody.haslog` (`placeLog`) —
  **classes, never `:has()`** (2026-10-13).
  **At the notch** its top edge dips round the camera housing
  (`headNotch` from `layoutNotch`; `HEAD_BEND`, `svg.hcut`), a long title running under it, the header lowered by `--hdrop` (`headDrop`, `.tunder`) up to `HEAD_DROP_MAX`, past which it
  jumps the housing. → `head-float.mjs`.
* **The chat's colour**: `tintChat()` sets `--repo`, `--rink` (`inkOn()`), `--rover`/`--rover2`, `#chat.tinted`; **it eases from chat to chat** (2026-10-13) on registered copies that do not inherit (`--hbg-eased`, `--hveil-eased`, `--hveil2-eased`; `.shead`, `#log`, `.gbody`). **Never an inherited registered property under a transition**: every element below it is restyled each frame. `--repo` stays unregistered (its fallback is load-bearing). A new surface in the chat's colour reads `--hbg-eased` and joins the `:where(.shead, #log, .gbody)` rule. The colour square (`.sq.pick`; `colorAt` remembers which header opened it) sits at the `.sep`'s x, out of the flow.
* **The header's black** (`.shead::after`, `paintHeadSplit()`) is the base under the sidebar's toolbar, which hides it.
* **A colour as dark as that black turns it grey** (`nearBlack` → `main.darkchat`). **On a card, a colour too dark
  or too light for the panel is held where it shows**: `--lift` (`oklch(from … max(l, .62) c h)` dark, `min(l, .72)`
  light) for what draws it on a row. `--repo` stays the colour as set (the header). → the black step of `project-colors.mjs`.
* **With no chat open the column is home** (2026-10-10; `showHome`; ⌥⌘0): the sea (`makeSea`, 15 fps on screen, at rest after `SEA_REST_MS` with no
  input, still under reduced motion; `peix.sea()`), the board's facts, and the day — `GET /api/today?since=<the page's midnight>`, a row per chat with
  its turns, questions (`a`) and monitors (`m`), spans from the transcript as folded (`noteSpan`, `s.day`), an open question from the registry.
  `homeSoon` on session events; the day asked again each minute and on a landing. → `test/today.test.mjs`, `home.mjs`.
* **⌥⌘A is the overview** (2026-10-10; `#ov`, a modal dialog): `ovColumns` — Asking you, Clauding, Watching, New replies
  — every project, never a done chat; a tile per chat (1–9 and ⏎ open, arrows move, a click on nothing closes —
  `ovNothing`), `ovSoon` on its chats' events. **A tile
  is live**: the chat's drawer as a read-only xterm (`mountMini` — **it never sends a resize**: the PTY keeps the chat's
  own size; scaled to .7 and cropped, the footer below the edge unless asking — `footRows`, `placeMini`), else its tail
  (`tailHtml`, `GET /api/tails?ids=`, every 2 s). A question's answers (`ask.labels`) come
  once the transcript has it; one clicked types its digit into the drawer (`answerInDrawer`). → `overview.mjs`.
* **The chat header is drawn only when it changed**: `renderHead` compares the header's, the menu's and the PR rows'
  markup with `drawn`, and runs `layoutNotch(); fitHeadPrs()` only for a new header; the handlers are bound on every
  call. Anything that edits the header in place resets `drawn.head` (`editTitle` does).
* **The chat header's row is the title, the PR matrix and its git mark, a task's chip and ···**: its buttons — `#termBtn`,
  `#viewBtn`, `#webBtn`, `#detailsBtn`, VS Code — are rows of `#hmenu`, keeping their ids for the hotkeys and the
  harness (`.click()` works on a closed menu). `#hmenu` is a **non-modal `<dialog>`**, static in the markup:
  `postPane` lowers the pane while it is up, Esc closes it, `runHotkey` closes it rather than let it swallow the key.
  Toggles leave it up (the click-outside test goes by `composedPath()`); actions close it. `>_` comes back into the
  row while failed; a note about a folded button anchors at ··· (`seen()`). → `head-menu.mjs`.
* **A PR's CI is said in the chat header only** (2026-10-09): `statusCheckRollup` in `PR_FIELDS` → `prChecks` →
  `checks` (pass · fail · pending) → for open and draft PRs, the number's `.ck`, a square's `data-checks` (a ring, a pulse: `mxrun`). **A change is seen** (`prMoments`, keyed
  by `data-url` and place, `prShown`): a first sight plays nothing. → `pr-checks.mjs`.
* **A chat's Jira tickets are chips** (2026-10-08): on the card a stack that fans out (`cardTickets`, `chipStack`, `fanWheel`,
  `.tprs.ttks`, `.ctk[data-cat]`), the branch's first; in the header dots after the PRs (`.mxs.tk`), `.prrow.tk` in `#prlist`. Setup's Jira section (`jiraSetup`): site and email into the setup file, the token
  write-only into the keychain (`PUT /api/jira/token`). → `jira-tickets.mjs`.
* **The header's PRs are the card's matrix** (2026-11-03; `headMatrix`, `fitHeadPrs()`, `#prToggle` the git mark,
  counting PRs and tickets): the same squares, order and number, up to `HEAD_ROWS` rows, `HEAD_COLS` columns till three
  rows ask for more, the fewest rows there is room for, past that `.mxg` scrolling (`--mxw`), the toolbar no taller; a
  stack's line is the square's (`.j`, `.jw`); a square's card `#mxtip` (`.far` over a pane page); ⌥-click takes it off;
  the tickets dots after them. The title keeps its repo name plus `TITLE_ROOM` and `TITLE_SHARE` of the row (every new
  header, its `ResizeObserver`). **The row never wraps**: the move's line, a task's chip and the branch's move
  (`.hdrift`) shrink to `--hmin`, then go (`.hfold`: the move's line, the count, the branch last); ··· stays on the
  title's line. A card's branch move is `.trow .drift`. `#prlist` (`prefs.prsOpen`) is rendered folded too (the harness
  reads `#prlist .prrow`); open, its foot's arrow folds it (`#prFold`); `#prTl` up top; the rows scroll (`#prScroll`,
  `prEdges`); the foot drags its height (`prefs.prsHeight`). → `header-matrix.mjs`, `header-prs.mjs`, `pr-turn.mjs`.
* **A PR's square GitHub has answered for is solid** (`--prc`, its state's colour, a draft hollow), one not known yet a faint grey. **A PR
  at your move is said by name, not by its square's look**: `data-turn` (`turnOf(pr)`: `you` · `them` · empty) on
  `.mxs`, `.prrow` and tooltips (`turnTip`); the card's (`moveHtml`, `.ymove`, at every size, not
  ticked — **a card counts nothing**; hovered, the move's age, `.mt`: `turn.at`, else `movedAt`), the header's
  (`headMove`, `.hmove`). A new tag slides in (`moveMoments`, `#shead[data-sid]`). **Each PR's round** (2026-10-15;
  `roundOf`): `.prround` under its `#prlist` row (the round before, Let go · Ask Claude · Undo; `.why` hidden); on the card each PR in play (`pipsHtml`, `pchip` in `prHue`; not at same height),
  `answeredHtml` for `ANSWERED_MS`, `#rpop` beside it with the pointer at rest on the card (2026-11-01, later; `REST_MS`,
  not on a part with a tooltip of its own; a pane page there, under; a PR-titled chat's `titleTip` its first line). → `pr-rounds.mjs`.
* **A card's PRs are a matrix, ending its top row** (2026-11-01, round XVI; the one way 2026-11-03; `cardMatrix`, `.tmx`): a
  square a PR in stack order (`prGroups`, `prChain` on `pr.refs`), the number your move's, else the newest `pr.updated`
  (`mxLead`); one size, nothing round a square; past the row's room `.mxg` scrolls (`mxWheel`; `fadeOver` brings the
  numbered one into sight); no tooltips: a square's or the number's PR card (`#mxtip`, `mxtShow`, `mxCardHtml`), on a
  spring, the square lifted (`.hot`); `#rpop` lists every PR. → `card-pr-matrix.mjs`.
* **The people row** (`#people`, `renderPeople`, `peopleOf`): everyone in the PRs of the chats in view, behind
  GitHub's mark, folded by default (`prefs.peopleCompact`). A face
  clicked narrows the list to that person's chats (`prefs.person`, `hasPerson`); the same face, or the person leaving
  the view, lets go. Drawn only when its markup changed (`peopleDrawn`). → `people-row.mjs`.
* **A card comes in four sizes** (`#cardsSize`, `prefs.cards`; compact the default): *large* — your last prompt and Claude's last reply —, *medium* the last word, *compact* neither, *one line* (2026-11-03, round XXII; `'line'` → `data-line` beside `data-cards="compact"` and `data-even`): same height's third row is the first of the question, the move (`.rowmove`), the agents (`.agrows`, which still grow it), the live line, the last word. `cardHtml` always writes both `.snip`s (the older `.older`) and CSS hides by `#sessions[data-cards]`, so the size re-renders nothing. *By lane* (`prefs.cardsByLane` → `data-bylane`): a card that wants you (`roomy(s)`) is large. **Compact's *same height*** (`prefs.cardsEven` → `#sessions[data-even]`): rows of a fixed height: one title line, the question left to the red edge, the move line or `.moveslot`, never `.prmove`, which the harness reads. **Its words on one line** (2026-11-03; a switch to try, `prefs.cardsSnipOne` → `data-snipone`): each `.snip` clamped to one. → `card-sizes.mjs`, `card-one-line.mjs`, `card-words-line.mjs`.
* **Every part of a card can go** (2026-11-03, round XXII; `CARD_PART`, `prefs.cardParts` → `#sessions[data-hide]`, CSS alone; the age and the ✓ are *at rest*, off by default): a click on the real card in Settings › Chat list (`#cardPanel`, `cardLabMake`), a part left out faint there. **The list's rules reach it by a copy while the pane shows** (`clabCss`: `#slist`, `#sessions` for `.clab`, `.clabs` at the same weight). → `card-parts.mjs`.
* **A card is raised** (2026-11-03, round XXII): the ground `--step` (towards the ink on a dark frame), the chat's hairline, `--lo`; under the pointer `translate` and `--hi`, `::before` 2 px lower or the card drops off the pointer. A card's `--side` is its ground, for its chips. A state keeps its edge; a question keeps still. The list's inks are fitted to `--step` (`raisedInks`, by hand for the board's own; INK_CHECK's `step`). → `card-raised.mjs`.
* **A card's title row reads title · chips · time · F ·
  unread; its top row ends ✓ · PRs** (every card has it, 18 px at least). The age and the ✓ show under the
  pointer only, no room at rest (2026-11-03; the ✓ `width: 0`: focusable), unless kept. The F is Fable (`onFable(s)`: `/fable/i` on `s.model`).
  → `card-marks.mjs`.
* **ALL** (`key: 'all'`) is `BLACK` through
  `projColor()`, as is a folder painted `#000000`: `.card.black`, where `--ring` turns the light white. `#splitter`
  is the line between the list and the chat, dragged to size the list.
* **A new chat has a card before its first word**: `visible()` shows a live chat with no transcript (not VS Code's);
  its `startedAt` — the moment the board first saw the id — is its time and place, carried over by `indexFile`, the
  last fallback of `wordAt` (both copies). **Empty is no word, not no file**: `/clear` writes lines at once, none of
  them a word, so the start, `statusOf`'s `idle` and the *(no messages yet)* title go by `!s.lastActivity`.
  `openSession` on a chat the snapshot lacks renders from its fetch. Ticked, an empty chat is gone (`visible()`), and
  the column moves on (`tickDone`) or leaves (`leaveChat()`). → `new-chat-card.mjs`, `drawer-clear.mjs`.
* **The order** (`RANK` / `rankOf`): asking, clauding, **Watching** (2026-10-31, `inWatch`: a live task or `wake`, any
  age; a turn its task woke stays, `woken`), **Ready** (a last word from today or the `IDLE_DAYS` before), **Idle**
  (older), **Done** — inside each by the last word (`wordAt`: the newer of `lastUserAt` and `lastReplyAt`; a tool call is
  no word, **a PR come round to you is**, at `turn.movedAt` — `movedAt(s)`, both copies), newest first; a project by its
  newest chat. Every count goes by `bucket()`. **Each group has a lane head** (`laneHtml`; sticky, `--stick` and
  `.covered` from `drawEdges`; none under a query) that folds it (`data-lane`, `foldLane`, `prefs.lanesShut`; Idle and
  Done folded at first) in one motion (`lineMorph`; 2026-11-01, `foldRun`, `openRun`). **A day label over each run of
  one day** (`dayHtml`, `dayBefore`, `dayName`) **but today's** (2026-10-14). **All caught up** (`ZERO_HTML`,
  `caughtUp`): no ready chat and no question; reached from a ✓ (`lastTickAt`) it sparks once. **Your move and new replies
  are the funnel's filters, never lanes.** **A long lane holds back** (2026-10-13; `LANE_CAP` 30, Idle and Done): its
  newest cards and a `.gsep.more` line (`laneMore`); the open chat's card whatever its place; a query or a filter every
  match. → `lanes.mjs`, `lane-heads.mjs`, `lane-fold.mjs`, `day-separator.mjs`, `long-lanes.mjs`.
* **The list's filter is the funnel** (2026-10-12; `#fBtn`, `FILTERS`, `prefs.listFilter`; its menu through
  `ctxShow`, counted by `fCounts`): *Every chat* · *Your move* (`yourMove`: a PR waiting on you, not done for good) ·
  *New replies* (`replied`: a ready chat whose last word is Claude's and came after the board last showed it —
  `seenAt`, the server's `seen` in the state file, `POST /api/sessions/:id/seen` from `markSeen`; `seenSince` for a
  chat never shown). Done chats never. On, the list is narrowed before anything counts it, every match shows (the
  heads `.still`, unfoldable), the caught-up head is not drawn, and an empty list says so. The Dock's
  badge and the menu bar read `replied` too. → `test/seen.test.mjs`, `lanes.mjs`, `pr-turn.mjs`.
* **A chat opened from elsewhere is located** (`locate`, `locateCard`): scrolled to, and a band of light sweeps
  across it (`.card > .loc`, a box of its own: the pseudo-elements are the ring's). Not a click on the card, ⌥⌘↑↓ or a
  tick's move.
* **⌥-click on any card's button deletes it from the board** (2026-11-04; `removeChat`, `.act.del` on a chat at work, `…/remove`, `removedMarks` → `removed`; `data-alt` from `altHeld`: the pane eats the key): a tick for good, hidden (`visible`), whatever it is doing. Its claudes and drawers end, awaited, what that interrupts asking once more (`removeGate`), vim's unsaved work keeping it; the transcript stays. Back by a word, a claude started on it, a resume or `{undo}`; ⌥⌘K, typed, finds it. → `test/chat-remove.test.mjs`, `chat-delete.mjs`.
* **Your word takes the list to the open chat's card** (2026-11-02; `followCard`): at once; the top if it is on the first
  screen; no slide past a screen (`far`). No reply or other chat's word. → `list-follows-word.mjs`.
* **Ticking the open chat moves on** (`tickDone` — the card's ✓ and ↩, the chats step's ✓): to the card below as
  shown, else above, over done cards; a chat ticked while another is open moves nothing. **The move is made at the
  click**, after `TICK_MS` for the ✓'s own draw (`.act.tk`; a second click does nothing;
  at once under reduced motion). **A watching chat's asks once more, naming what it ends** (`tickGate`). →
  `tick-next.mjs`, `watch-lane.mjs`.
* **The list's frame reads its geometry once** (`listChanged()`, once a frame): `listGeom()` first, then
  `drawEdges(g)`, `drawTimeline(g)` — keep the reads at the top. **It follows the list's motion**: while a slide or a
  fold runs (`follow()`, `sliding`) it draws every frame and once after, and the open card's size is watched
  (`watchOpen`). A new animation that moves cards goes through `follow`.

* **The list's two ends count the cards out of sight** (`#sup` / `#sdown`, `.sedge`, over the list's grid cell, so
  `#slist` has a definite `grid-column`): a card is out of sight when its *middle* is past the edge (`drawEdges`, by
  `offsetTop`, hence `#slist { position: relative }`); a dot red for one asking, amber for clauding; a click scrolls a
  screenful; the PR list's likewise (`.pedge`). → `list-ends.mjs`.
* **The timeline is the list's scrollbar, out of sight until called** (`#tline`, over the list's cell; the native
  scrollbar hidden): the pointer held at the list's edge shows it (`TL_DWELL_MS`, `#sessions.tlshow`). **To scale**: its height is the list's
  `scrollHeight`, a label where its run starts (`tl.runs`: one day and one group; none under a query), the thumb the window. **The swell is a fisheye**
  round the pointer (`tlWarp`), which stays fixed, so a drag reads the list's position off it (`tlScrub`); by the clock (`tlAnimate`; `REDUCED` jumps).
  A press on no label is on the `.near` one. **Hidden, a frame a scroll alone asked for does not draw it** (`listChanged(true)`, 2026-10-13).
  `peix.state().timeline`. → `timeline.mjs`.
* **The status bar is the machine at the window's foot** (2026-10-09; `#sbar`, `renderBar`, `body`'s grid row 2):
  `#sbFind` (`#sbList`, `#filters`), `#sbLeft` (the connection, `bar.conn`, its fish the SSE light — its colour the
  state, `bar.lost`, belly-up while down —, its click the About box: Copy details, `detailsText`, no chat, path or
  address → `about-details.mjs`; Next `nextSeg`, a mute `muteSeg`, the monitors `ICON.watch`, the chat `chatSeg`, the
  update `updSeg`), `#sbPeople` (`#people`), `#sbSwim`, and `#sbRight` — the machine (`prefs.barStats`, `setBarStats`;
  `GET /api/stats?want=…` every 3 s), the plan usage as pies (`sbMeter`; a click lifts `usageRows`), both awake switches
  (`#sbAwake`, `#sbLid`), the clock. `#sbLeft` and `#sbRight` are drawn by markup (`setHtml`); **`#filters` and
  `#people` are never redrawn by the bar**. **The fish** (`swimAt(n)`): one `swim` animation whose pace is its length
  (`swimPaceTo`, never `updatePlaybackRate`); two svgs, body (`.fb`) and tail (`.ft`), **never SVG groups**; `fishAt`
  reads the swim's clock, never a rect; `feed` a frame loop only while a bubble is out; `peix.state().swim`.
  → `status-bar.mjs`, `small-motions.mjs`.
* **Next is the queue** (2026-11-01, round XIX; ⌥⌘⏎, `.seg.nx`, `nextQueue`, `hotNext`): questions by longest wait
  (`askedAt`, `byWait`), then PRs at your move, then what to read, oldest first: a fixed order, only on a press, never a
  lane. **Red on the bar means asking**: a meter past 90 % is the ink and a `!` (`hotInk`, `hotMark`). **A mute shows**
  (`muteSeg`, `setNotify`). → `next-verb.mjs`, `asking-oldest.mjs`, `bar-one-red.mjs`, `mute-shows.mjs`.
* **The lane's news and switches** (2026-11-01): `laneNews`, a line whose click is Next: *while you were out* (`wentOut`, `outLine`; `peixFront`, `peixAway`)
  and *gone fishing*'s catch (`fishing`; `onAlert` holds reply and pr). Off by default: a fish per chat (`prefs.laneSchool`) and the seabed (`prefs.laneBed`).
  → `while-out.mjs`, `gone-fishing.mjs`, `lane-school.mjs`, `lane-seabed.mjs`.
* **The plan usage is asked** by `loadUsage()` on load, every `USAGE_EVERY_MS` while visible, after a reset, on coming
  back; backing off on failure, keeping the last numbers (`.stale`). `USAGE=off` leaves it out of
  the bar. → `usage-bar.mjs`.
* **The chat's panel is `#room`** (2026-10-17; `chatOpen`, non-modal, from `#sbChat`): messages by `chatMd`
  alone (no raw HTML or image; https/mailto links, to the browser), polls, the
  admin's people (`chatPeopleDraw`); Settings › Chat (`chatSetHtml`). **Yours is in the log at ⏎** (2026-10-27,
  `chatUi.out`): faded till GitHub has it; one not sent says so there alone (`chatRetry`).
  **No chat code reaches a drawer, a claude or `md()`**. → `chat-room.mjs`, `chat-poll.mjs`.
* **Lunch on the board** (2026-10-18; `lunchBar` from `renderBar`): the lane's sign (`.lsign`), the dishes (`.ltick`),
  the fish out (`lunchOut`), ⌥⌘M's `#lunchd`
  and home's `.hlunch` (`chalkHtml`), `#lunchSet`. → `lunch.mjs`.
* **⌥⌘Z is Zé's game** (2026-10-30; `#zeGame`, `zeOpen`, `peix.ze()`, `.lab` the harness's): a 720 × 900 picture,
  frames only while open, unpaused, uncalled; its own Web Audio (`zeRadio`), made by a press, closed with it or M. **What falls is the day's** (`zeSeed`; the demo, `g.demo`, chance's and silent). **It
  hears the board**: a chat that starts asking stops it (`zeHeard`), today's lunch falls, a score reaches the room only
  by a K.O. button (`zePost`). **A stage on the GPU** (2026-11-01; `zg`): WebGL2 made and let go with the dialog **by
  hand** (`zgLetGo`), else the 2D canvas (`zeDraw`); what moves on a batcher (`zgBatch`), **never a canvas handed to
  WebGL a frame**; blur by layer, never by screen height. Calm under reduced motion (`zeCalm`); **no sound outlives it**
  (`zeHush`). → `ze-*.mjs`.
* **State lives in four places**: the server's `~/Library/Application Support/peixAIrada/state.json` (`STATE_FILE`:
  ticks, titles, pins, PR turns… — whatever the board decides) and the user's `~/.config/peixairada/config.json` (the setup, below) — both shared by the app and every
  browser —; the browser's `localStorage` `peixairada-prefs` (the keys are the `prefs` literal, and old ones are
  deleted on load); `sessionStorage` the tabs (below); and never `~/.claude`. `renderHead` re-runs on every SSE update — anything it renders reads its
  state from prefs. **`state`'s keys are declared in its literal**; add there, not at first use.
* **The setup is the user's file; nothing about one Mac is in the code** (2026-09-28): `CONFIG_FILE` —
  `$XDG_CONFIG_HOME/peixairada/config.json`, **beside `STATE_FILE` when that is set**; the state file's old `config`
  moved there **at boot, never on an import** (`loadConfig()` from `main()`). Written into the file as it stands (an
  unknown key stays), renamed over at its real path, a root under the home as `~/…`; **re-read on a hand edit**
  (`reloadConfig`, every `CONFIG_POLL_MS`, `configStamp`); one that does not parse is the config's `error`: the board
  keeps what it had, a PUT is a 409. Keys: `roots` (`[{dir, org}]`), `quick` (⌥⌘O's), `projects` (`{name: {abbr,
  color}}`), `jira` (`{site, email}`; `jiraSite`, http only on loopback), `chat` (`{repo}`). `cleanSetup` shapes it
  (strict for a PUT); a key never set is the default at read time (`boardConfig()`: roots from `ORG_DIR` / `ORG`).
  `GET/PUT /api/config` (a PUT replaces the keys it gives), a `config` event, `configChanged()`. **`ask` is the first
  run** (no roots set or in the environment): `#welcome` (`welcomeSync`) from `GET /api/config/suggest`
  (`suggestRoots`, `checkoutOf`, `orgOf`); Skip is `roots: []`, Esc puts it off; `create: true` (the welcome's only)
  makes a folder under the home; the app's Choose… is an `NSOpenPanel` (`peixFolder`). Settings' Projects and Jira
  panes (`renderSetup` → `#setup`, `#jiraSet`; not redrawn under a box with the keys): keep `.srow.root(.add)`,
  `.sdir`, `.sorg`, `#quickSel`, `.srow.proj` (`.stile` opens `.ssw`), `.sadd`. → `test/config.test.mjs`,
  `cog-setup.mjs`, `welcome.mjs`.
* **The tour** (2026-10-14; `#tour`, `TOUR`, `tourStart`, `tourPlace`): a modal dialog the window's size — a hole in a
  veil (the hole's own shadow) round each step's part, the card on the side with room. Once on its own after the
  welcome's answer (`prefs.toured`; the harness's `true`).
  A step's part is found as the board stands (`at`); none, `need` leaves the step out, else the card is centred. A new main part gets a step. → `tour.mjs`.
* **The page asks the server through `api(method, url, body)`**: JSON in, JSON out, a throw with the server's own
  `error` (else the status) — `e.status`, `e.body`. Every caller says what went wrong where it happened, or catches on
  purpose. The attach upload keeps a raw `fetch`: its body is a file.

## Hotkeys and the pane

* **The shell's own workings are [mac/CLAUDE.md](mac/CLAUDE.md)'s** (2026-10-28): the fill and the menu bar, the menus,
  VS Code Web's keys, the pane's views, the badge, a drop, the server it adopts, Swift's traps. Here: what the page does across the bridge.
* **`HOTKEYS` in index.html is the whole ⌥⌘ family, and every key is a row of `KEYS`** (2026-10-12): what you press, its
  group, one line, and the codes it is in HOTKEYS or CMDKEYS — the ? sheet is drawn from it (`keyNotes`: the setup's words), and
  `npm run check` (`check-page.mjs`) fails a code with no row, a row no map answers, a ⌥⌘ key `boardKeys` in
  main.swift does not forward or forwards unanswered, or an *again* row no `hot…Key` answers. Handlers are `hot…`. **C T G E D J pressed again from the tab they bring up** (`hot…Key`: `zoomAgain`, then the plain `hot…`) fill
  the column with that half, and back (`toggleZoom`); `typeInShell` and the launcher
  call the plain ones. Capture phase, `e.code` (with ⌥ held `e.key` is a symbol). A `dialog[open]` swallows them (`#hmenu` and `#room` close instead);
  nothing to act on is a `note()`; a key held down is one press (`e.repeat`, the arrows aside) and `termAction` one
  press per chat at a time (`termAsking`). **A late answer acts on its own chat only**: `renderHead` draws the open
  chat's header alone, a new drawer attaches through `showTerminal`, and ⌥⌘T's zsh and the editor's page wait on a chat
  that was left.
* **Plain ⌘ is the window's shape and its tabs, in `CMDKEYS`**: **1** / **2** the left and right halves (⌘2 splits the
  first time), **0** closes the *other* half (`hotOnlyHalf`); **T** a new tab of the kind the keys are in (2026-10-13,
  `hotNewTab`: in a terminal, on the chat, the changes or an empty half another zsh, `startShell(s, true)`; on a page
  or a blank tab a blank tab, `openBlank` — see *Placement*), **W** the tab the keys are in
  (`hotClose` → `dropTab`; a dialog up first; on the chat's tab or an empty half, the half; with one half, `false`).
  `peixKey(code, mods)` says which map and **returns whether the key was taken**; `cmdKeys` in main.swift is the
  forwarder's copy (a digit as `Digit<n>`; `npm run check` holds it). ⌘K is *not* here (the drawer's clear), nor ⌘+ ⌘−
  (`chatZoomKey`, which sees ⌘0 only when nothing is split).
* **⌃⌘F is the full screen Settings › General picks** (2026-10-14; `toggleFull`; `prefs.fullSpace` → `fullscreen` →
  `spaceMode`): its own Space, where the page hears no fill, or **up to the notch, the fill** (the shell's both).
  → `full-screen-pick.mjs`. **The fill gone on while the page heard it off says so once** (`fillHint`): never on a load
  that finds it on (`state.fillHeard`), `FILL_HINTS` times in all. → `fill-hint.mjs`. The page hears `peixFill(on,
  notch)` — the strip's height and the housing's x range in CSS px, null without one; only when new (`fillSaid`,
  2026-10-15) — and **`layoutNotch()` lays the top row round it**: the title left of the housing, its chips right
  (`.shead.hole`), unless the whole title does not fit (a `Range` measures it, never `scrollWidth`): `.tright`, the title
  jumps the housing — or, floating, runs under it (`.tunder`); what lacks the room pads down by the strip (`.npad`).
  → `notch.mjs`.
* **The pickers match fuzzily, and with something typed the best match leads**: `fuzzy(fields, q)` — each word
  hunted *within one field* (`chatFields(s)`; a chat's PRs and tickets are one, `chatIds` — 2026-10-14 —, and
  ⌥⌘K's row names those a word is in, `idsHit`), letters in order, runs and word starts worth more, gaps costing, a
  field's worth falling off down the list — **a web address found whole**, as itself or the chip it names (2026-10-28,
  `wordIn`, `urlForms`); `hunt()` ranks; an empty box keeps each list's order. `markHits()` bolds
  what landed (`fuzzMarks`). `pickRender` fills `pick.list` and a `row` per mode and clamps the selection once.
* **⌥⌘K, typed, finds done chats too** (2026-11-03; half their worth, `doneWorth`); **a PR's link alone asks every
  transcript** (`namedAsk` → `/api/named`, `chatsNaming`: read when asked, never chips). → `named-prs.test.mjs`, `k-finds-done.mjs`.
* **The list's magnifier matches the same way** (⌥⌘F): `renderSessionList` sorts by `fuzzy(chatFields(s), q)`, no lane
  heads or day lines; a folded lane does not apply, the project in view does. ↑↓ walk a `.qsel` card, ⏎ opens it, the
  query kept; the mark shows only while the box has the keyboard (`markQsel()`). → `chat-filter.mjs`.
* **A right-click is a menu where ⌥-click, a double-click or a drag did alone** (2026-10-12; `#ctxm`, `ctxRows`,
  `ctxShow`): a card, a PR chip, the colour square, the status bar — not a box, a terminal or the transcript's words, which keep the
  system's. The launcher has the open chat's rows too. A row may carry `sub` (a second line, `.two`) and `off`
  (disabled, its `sub` the reason). → `context-menu.mjs`.
* **⌥⌘L is the launcher** (2026-10-10; `#pick` in mode `launch`): `launchRows` gives each section's best (chats,
  projects, PRs `allPrs`, tickets `allTickets`, `actionRows`, `toggleRows`), all under a prefix (`>` `#` `@` `!`); a
  section's head is `.pkhd`, not a `.pkrow`. Empty, it is `LAUNCH_MENU` (→/⏎ into a row with ›, ←/⌫ back,
  `ctx.back`). A PR row whose branch GitHub named has **Chat** (`button.pkchat`, ⌥⏎ — `chatOnPr`). **A switch is the settings' own checkbox, clicked** (`SWITCHES`), so its handler runs. **`?` is the
  sheet of every key** (`keysOpen`, `#keysheet`) outside a box or a terminal. → `launcher.mjs`.
* **The last step of the new-chat flow is a list of chats** (`scopeChats()`, `chatsStep()`, `newFromChats()`): the
  scope's ready and clauding chats by `byWord` under ＋ *new chat* — **shown even when the scope has none**, so ⏎ starts
  one. ⌥⌘N scopes it to the project, ⌥⌘O to one environment (`then: 'chats'` rides `folder` and `env`). Typing filters
  the chats only, the selection on the first match (`pick.typed`), else ＋. **A git checkout gives ＋ a switch, *this
  folder | new worktree*** (2026-10-13; `pick.git`, `pick.wt`, `pickWt`): on *new worktree* the text is the branch's
  name, and ＋ says what ⏎ would do (`wtSay` from `brAsk` → `branchWhere`: a new branch, one here or on origin, or **one
  out in a tree already — said in red, and only then `share`d**, else refused, `out`). **A new branch asks its base**
  (2026-10-28; mode `base`, `worktreeBases`; the default selected, the checkout's if ahead, `prefer`);
  `newChatOnBranch` makes the tree and starts the chat. **One press, one chat** (2026-11-04): a step answering
  (`pick.cloning`) dims the rows and `pickChoose` takes nothing; `wtStarting`, `prChatting`. A new branch asks origin
  `WT_ASK_MS` at most (`unasked`). `s.env` is a chat's environment (`.chip.env`, `envCounts`). An idle chat's row has the
  card's ✓ (`button.pkdone`, `canTick(s)`). **Who runs it** (2026-11-06; `agentChip`): ＋'s chip or @, the no-folder
  row's too; the project's last first (`prefs.agentFor`); `agentsFor`; `--agent` only on a new chat; a chat's `agent` its
  last `agent-setting`, else the registry's. → `new-chat-flow.mjs`, `chat-worktree.mjs`, `new-chat-agent.mjs`,
  `test/worktree-origin.test.mjs`.
* **The project step holds the folders you have no chat in, and clones one you have not got**: after the board's
  projects come the folders under each root on no project (`freeFolders()`; `GET /api/folders`, cached by each
  root's mtime), and a query naming none is offered as **＋ clone `<org>/<name>`** per root with an org (`cloneRows()`,
  never filtered out) — `POST /api/clone {name, root}`, `gh repo clone` into that root, `cloneAndStart()` carrying on.
  **A worktree is not offered** (`isWorktree`: a `.git` file naming `…/worktrees/…`) unless typed whole. → `new-project.mjs`. **A clone is one per folder and
  says how far it is** (`clones`, by target folder; a second ask joins it; a spawn in it is refused until done,
  `cloneUnder`): `gh repo clone … -- --progress`, phases weighted into one percent (`CLONE_PHASES`), `clone` events
  and `clones` in the snapshot; a failure removes what git left. → `test/folders.test.mjs`.
* **⌥⌘N's first row is a chat in no folder** (2026-10-14, `NO_FOLDER`): ⏎ starts claude at once in the board's own
  `<state dir>/no folder` (`SCRATCH_DIR`, `about.scratch`; `spawnTerm` makes it) — never `$HOME`. Hunted like a project. → `new-chat-nofolder.mjs`.
* **A chat's folder not checked out is cloned before the chat starts** (2026-10-09): `spawnTerm` refuses a missing
  folder (or one being cloned) with `clone` — **`cloneFor(cwd)`: under a root with an org, `<root>/<name>[/…]` is
  `<org>/<name>`**, null under no such root or inside a repo that is there. The page's `withCheckout(key, spawn)`
  clones and asks again (a resume, ⌥⌘T, a new chat); its draws read `state.clones` (`cloneShown`: `.cloning`,
  `.clonebox`, `.cl`). A chat with no claude says `folderMissing` and `cloneRef`. → `clone-folder.mjs`.
* **A chat's worktree gone is made again by its resume** (2026-10-19; `folderBack` → `back`, `putBack`, `restoreTree`):
  at its path, the repo there, on the chat's `gitBranch` — here, else origin's, else anew from the main ahead —; a
  branch out in another tree is that tree. Any other folder gone in a checkout starts in the nearest one left. → `worktrees.test.mjs`, `folders.test.mjs`, `resume-worktree.mjs`.
* **The settings are one modal dialog** (`#settings`): ⌘, (`CMDKEYS.Comma`; in the app the menu's *Settings…* asks
  `peixKey`), the header's ··· row (`#settingsBtn`) and the empty header's ··· (`#noChatMore`, delegated — `leaveChat`
  rewrites the header). **A sidebar of panes and a search box** (2026-10-16; `settingsTab`, `prefs.settingsPane`;
  `settingsAt(pane, row)` opens on a row, lit): `#sq` has the keys on open, `settingsFind` hides what does not match
  (`.nomatch`) and marks it (`::highlight(sfind)`), Esc lets a search go first. **A setting is a `.srow.set`** — `.sl`
  (name, one line), its control right — in a `.sgrp` (`.sgh`, `.slist`, `.sgf`); a dependent `.sub`, `.off` with the
  reason, never hidden; `data-kw` feeds search. → `settings-panes.mjs`. The class is `pop`: rows keep `.pop …` rules. **It is modal**: the pane down, the ⌥⌘ / ⌘ keys swallowed — close it first (the scenarios
  do); `close` drops a setup row half typed.
* **Every `pre` in the transcript is inside a `.codebox`** (`md()`): the bar (language, copy) is its first child; a
  block over six lines is always folded, `details.codefold > summary + .codebox`. A rule that reaches a `pre` goes
  through the box; the copy click is delegated on `#log`.
* **In the app the pane is a native view** over the chat column: a key pressed there never reaches the page, so
  `installHotkeyForwarder()` forwards ⌥⌘ + letters and arrows and ⌘ + the layout keys (`hotkeyCode()`) to
  `window.peixKey`, a click on a page as `peixPaneFocus(key)` (`installPaneClickMonitor()`); the shell reports
  `peixPane(visible, left)`. **A dialog open lowers the pane** (`postPane` sends no page while a `dialog[open]` exists;
  `repostPane()` beside every `showModal()`, `npm run check`'s; `close` puts it back); `postPane` posts only what
  differs. Esc in a pane page is forwarded (`hotEscape()`: a dialog first, else the chat tab); on the board the
  capture-phase handler closes a dialog or popover and, the pane up, does hotEscape's outside a terminal or a box
  (2026-10-14). `focus` is null unless the keys' half shows a page.
* **The app hears the board's own state**: the page posts `{type: 'state', needs, replied, moves, working, watching, muted, plan, next, fishing, mutes}` from
  `renderBoard` when what wants you changes (`postState`, `wanting()`: the chats asking and the new replies — **the
  Dock's badge and the page's title are their number**, the fish's the questions alone (2026-11-01); the status menu lists
  them with the PRs at your move and what is clauding), each alert with `serverNotify` and `quiet`, the pane's places, and
  `{type: 'chat', project, title, cwd}` from `renderHead` and `leaveChat` (`postChat`: the window's title and
  `representedURL`).
* **The page owns the tabs**: each half's strip lists `chat` (`claude` while it runs here), `shell:<id>` per live zsh or vim
  (`shellsOf`; zsh, zsh 2…), `gh:<url>` per web page the chat opened and `ide:<url>` for its folder's editor —
  `tabKeys()` from `state.paneGh` (per chat) and `state.paneIde` (per folder); `tabs` holds each chat's `[left, right]`,
  read through `placeOf()`. `syncTerm()` keeps both bodies right and posts one `{type:'pane', id, keys, panes, focus}`
  (`postPane`), the shell a web view per page. `‹ › ↻ ↗` are `{type:'nav'}`;
  × forgets a page (`closeTab`). In a browser the tabs are chat and zsh only (`inApp`). **A page's new window is a tab
  beside it** (2026-10-21, `PaneDelegate.open` → `peixPaneOpen`).
  **Which pages are the board's** (2026-10-21, `inBoard`, `prefs.pagesOut`, `boardSites`): the sites kept (the default), or all; the
  rest go `external`, a link out of a pane page to another host too (`PaneDelegate.linkOut` → `peixLinkOut`).
  → Findings: *the pane*, `links-out.mjs`.
* **A page opened again is the tab still at it** (2026-10-13, `openExternal` → `pageTab`): the page or further in
  (`atPage`: then `/`, `?`, `#` or the end); a tab followed elsewhere leaves it a new tab, `gh2:<url>`, `gh3:`…
  (`pageKey`, `isPageTab`; the shell loads a key's URL past its first colon), never a key whose lingering view
  (`paneUrls`) is somewhere else. A tab is named for its address, and clicked is shown as it stands (`openTab`).
  → `pr-tab-again.mjs`.
* **A page in the pane behaves like a browser tab** (⌘R, a pinch, ⌘F: the shell's): its address sits in the strip —
  **a page's, clicked, is a box** (2026-10-27, `addrEditAt`: ⏎ nav `go` in that view, esc `keys`) —, `.pcopy` copies it
  (`copyPaneUrl`, said in the address, `addrSay`: a `note()` is under the page), each navigation told
  as `peixPaneUrl(key, url)` (`paneUrls`).
* **The trackpad bumps** (`haptic(kind)`): a splitter snapping (`SNAP_PX`), a tab dropped across, the timeline's thumb
  crossing a run; in a browser, `haptic:<kind>` in `motion()`.
* **A notification can be answered where it shows** (2026-10-12): the app's carry a category — a reply *Reply… · Done ·
  In 15 minutes* (Reply… with a drawer here), a question or a PR's turn the snooze alone. Reply… and Done go to the page
  (`window.peixReply`: the chat's drawer, else one opened for it, sending no size; `window.peixDone`: `tickDone` where
  `canTick`); the page says whether a drawer runs here on the alert (`drawer`); lunch's, `peixLunch`; *Mute this chat* on any, `peixMute`. → `notify-actions.mjs`.
* **The board zooms as a whole in the app** (2026-10-12, `prefs.pageZoom`): `{type: 'zoom'}` sets the board view's
  `pageZoom`, and main.swift turns what crosses — the pane's rects (×), `peixPane`'s edge and `peixFill`'s housing (÷).
  **Never CSS `zoom` on the root**. A browser zooms itself.

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
* **The sidebar is the one layout** (2026-10-30, round X; no Tiles 2026-11-01): `<html data-layout="sidebar">` in the
  markup, never toggled, **its every rule `:root[data-layout="sidebar"] …`** over the tiles' rules, which stay the
  panels' base (`main.tiles` in the markup: `--tile-edge` from `tileEdge` in `tintChat` for a split's halves,
  `tileNotch`'s cut round the housing). The shell: no gaps or edges (no `.ncut`); the list
  and the status bar flat on `--side` (the frame); the header a flush toolbar of glass, the theme's inks
  (`--hd-*`), lowered at the notch by padding; cards 6 px apart (a head or day line 4 off its own), raised, no light of their own, the open
  one solid in its project's colour (`--selc`), white on it; the project a corner tab on every row (`.top .repo`; `.card.gone` dims all but it) and in the toolbar (the h2's padding, `--htop`; 2026-11-03), inks in `INK_CHECK`; chips `--r-3`; lanes on the rows' edges
  (→ `project-tab.mjs`); PR and ticket chips a tint. **`.card > .rg` (every card) is the row's ring** — a still mask to a 1.5 px
  band, its `::before` the turning square; the card's own pseudo-elements the sonar's. A new animation joins
  `PHASED` and the reduced-motion block. → `sidebar-layout.mjs`.
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
  rest; **the tab in front and the half with the keys in `--tablit`** (the chat's colour lifted),
  never the accent; glyphs are strokes (`ICON.back` …, `.ic.st`). A tab's × is over its mark under the pointer; under
  640 px (a size container) the tabs behind fold to marks and lose the × (⌥⌘W). **The page in front is its own
  address**: `div.ptab.addr` with `.purl` (`urlHtml`, `addrHtml`) and `.navs`; the tab drag ignores it. The half's ◫/⊟
  and ⨯ are behind ⋯ (`.gmore` → `.gopen`; `.click()` on `.gturn` / `.gclose` works folded). Split, each half is a
  tile (`#gsplit` the gap); under the floating header `#groups` pads by `--float-h`, not the halves. → `pane-tabs.mjs`, `split-halves.mjs`.
* **The tabs scroll; the one in front never gives way** (2026-10-30): the tabs are in `.ptrack`, the strip's own box
  past which they run (⋯ outside it) — a swipe, or a wheel down it (`tabsWheel`); an end with more faded (`trackEdges`,
  `.ofl` `.ofr`). The address is `min(420px, 100%)` whatever is beside it; a tab come in front is scrolled to
  (`revealTab`, keyed `el._on`, a new one once grown in), a redraw keeps the scroll. Stand-ins and the pill go in the
  box. → `tab-scroll.mjs`.
* **A half whose one tab is not a web page has no strip** (`.lone`, of no height: the tile's border says where the keys
  are, so moving them resizes no terminal). A web page alone keeps its strip, an empty half keeps
  its (the drop, ⋯). The lone tab's × is ⌘W's, ⌥⌘W's and the header menu's (`dropTab()`); ⌘0 closes the other half; a
  lone tab cannot be dragged. Unsplit, the strip hides under two tabs. → `split-halves.mjs`, `split-stacked.mjs`,
  `pane-tabs.mjs`.
* **Placement is derived**: `tabs` holds `[left, right]` per chat and `placeOf(s)` reads it against `keysIn` *now* —
  a key that is gone falls away. `tabOf(s)` is the focused half's. A half with nothing says what would fill it
  (`.gempty`), and its strip takes a drop (`.pdrop`). **The tab in front closed, the one beside it comes forward**
  (2026-10-13, `closeTab`): its right, else its left — a zsh's at once, before the server says it ended.
* **A blank tab is a browser's new tab** (2026-10-13, ⌘T on a page; `blanks`, `new:<n>` after the pages, page state
  only): in front, its address a box with the keys (`.ptab.blank .paddr`; what was typed is out of the markup, given back
  with the caret on a redraw — as a page's address edited, `addrEdit`), and under it, in the half, what ⏎
  would open (`.gblank`, `placeBlanks` from `syncTerm`, `blankRows`: typed first — `typedPage`: an address, a bare host,
  else a search —, then `chatPages`). ⏎ or a click puts the page in its place (`fillBlank`); esc empties the box, then
  closes the tab (`blankEscape`, also `hotEscape`'s: with the pane up the app takes esc). `focusTerm` focuses the box
  where a terminal would be. Never `.paddr` alone: a closed tab's stand-in (`.ptabgone`) carries a copy.
  → `tab-keys.mjs`.
* **The changes tab is git in the chat's folder, read when asked** (2026-10-10; ⌥⌘D, the header's `#diffBtn`, ···'s
  `#chgBtn`): a tab `changes` while the chat is in `changesOpen`, one element `#chg` moved into its half
  (`placeChanges`, from `syncTerm`). `GET /api/sessions/:id/changes?scope=` — `uncommitted` (untracked as added),
  `branch` (against the merge base with origin's default branch), `turn` (the uncommitted diff of the files the last
  turn edited, `s.turnFiles`) — and `?stat=1` for the chip (kept 4 s per folder, `changeStat`);
  `prefs.changesScope`. Re-read when the chat moved on or by ↻, its place kept; read on a copy of the index
  (`indexCopy`), lists `-z`, a file past `CHANGES_MAX` named in `left`. **Commit…, Push and PR… type the command into the chat's
  zsh, unrun** (`typeInShell`). **A line's comments are a review** (2026-10-28; `reviews`, `drawComments`, found by its
  words), **a range's too** (drag, ⇧-click; one hunk, `spanOf`): Submit types it into the drawer's claude, one prompt
  (`reviewPrompt`; else copied, kept). → `test/changes.test.mjs`, `changes-tab.mjs`, `changes-review.mjs`.
* **The timeline tab is the chat and its PRs in one order** (2026-10-17; ⌥⌘J, `#tvBtn`): `timeline` in `timelineOpen`,
  `#tv` moved into its half (`placeTimeline`), drawn on show (`tvSoon`) from the entries (`tvTurns`) and ledgers
  (`tvLogOf`, on a `pr.logged` move); `tvModel` ties turns to PRs. Turns one line (`tvTurnSum`), a lane per PR (`tvLanes`, `tvStyle`), the Now bar (`tvGo`), folds (`tvRuns`,
  `tvFold`). **The narrow** (`tvNarrow` vs `tvInPlay`; `tvSolo`; you and Claude a chip each) rides the address, `#<id>/tl:p=repo.n…`
  (`tvHash`, `tvFromHash`) — **the id is `hashId()`**; `tvOpenOn` from `.hmove`, a card's `.prmove`/`.pp`, a PR alert,
  a PR row's Timeline, the menus; the move gone to once both are in (`tv.lit`). Its word
  (`tvHint`) till seen (`prefs.tvSeen`). Its tracks (`tvTracksHtml`, its alone) hold times for `fillTracks`. → `timeline-tab.mjs`.
* **An agent's tab** (2026-11-02; `agentTabs`, `placeAgent`, `#agv`): `agent:<id>`, a row clicked, read-only, from `…/agents/:id?after=n` while it shows and works. Alone in a half, no strip: `.agvx` closes it. **Its call in the transcript**: a line out of the fold, tied by its result's `agent` (`agCallHtml`). → `agent-tab.mjs`, `agent-call.mjs`.
* **A PR's diff never touches the folder** (2026-10-13; scope `pr`, `&pr=<n or URL>&base=`; `prRange`): `ls-remote`
  for `refs/pull/<n>/head` and the PR's base (`baseRefName`, else origin's default), then a fetch of what is missing
  **into the object store alone** — `--refmap=`, `--no-write-fetch-head`: no ref, no FETCH_HEAD, no checkout — and
  `merge-base..head`. What git cannot (no checkout of that repo, origin unreachable) is `gh pr diff` (`prFromGh`,
  `patchStat`; `pr.source`, `pr.why`). The page: `PR #n ▾` in `.cseg` (`scopePrs`, `prOfScope`, `changes.pr` per
  chat; the picker `prScopeMenu` through `ctxShow`), a `.csrc` line saying where it was read, no Commit… or Push, a
  note prefixed `PR #n`. **Each `#prlist` row is a `.prline`** — the `.prrow` link, where its branch lives
  (`.prwhere`, `whereOf` over `GET /api/worktrees?cwd=` — `worktreesFor`, `parseWorktrees`; `wtOf` keeps it 10 s),
  then its buttons (`.pract`; Diff → `openPrDiff`, Editor ▾ and Chat below); `.prcopy` after its title copies its
  link (2026-10-21). The PR's branches are `pr.refs` (`prRefs` from `PR_FIELDS`'
  `headRefName baseRefName baseRefOid isCrossRepository headRepository`). → `test/changes.test.mjs`, `changes-pr.mjs`.
* **A PR's branch in the editor is a working tree, never the folder switched** (2026-10-13; the row's **Editor ▾**,
  `editorMenu`): `POST /api/worktrees {cwd, pr | branch, base, detach, fresh, share}` → `ensureWorktree` **finds the
  tree that has the branch first**, else makes one **at `<repo>/.claude/worktrees/<slug>`** — a fork's PR in the state
  folder's `reviews/`, out of any trust given the repo (2026-11-06) — (`makeWorktree`): a local branch as is, origin's
  `--track`, a fork's PR or *review only* `--detach` at its head (fetched into the object store alone), a `fresh` one
  `--no-track` from origin's default; one making per repo and branch (`wtAsking`); a tree not ignored goes in
  `info/exclude`. **Nothing is installed**: `GET /api/worktrees` says each tree's `modules` (`here` · `same` · `differ`);
  *Link node_modules* is `POST /api/worktrees/modules`, else `npm ci` typed into the zsh, unrun. **Only the trees it
  made are removed** (`worktreesMade`; `sweepWorktrees`, every `WT_SWEEP_MS`): their PR merged or closed after it was
  seen open (`prState`) — a new branch's, its PR (`prOfBranch`) or its commits (`ownCommits`) on origin's default
  (`landed`) —, nothing in them (`busyIn`), on its branch, clean, no commit no remote has (`keepWorktree`) — `git
  worktree remove`, never `--force`. *Switch this folder…* types `git switch <branch>` into the zsh, unrun, only when
  `switchGuard` (`GET …/switch?branch=`) finds the tree (`treeOf`) free — no other chat or drawer, none mid-turn, nothing
  uncommitted, no merge or rebase, the branch out nowhere else —, else its row says why. In the in-app editor
  (`openEditorAt`): VS Code Web on a tab (`state.paneWt`; `<repo> @ <branch>`, `ideLabels`) or vim. **Chat ▾**
  (`prChatMenu`) is `chatOnPr`: `newChat` in that tree. → `test/worktrees.test.mjs`, `editor-branch.mjs`, `chat-worktree.mjs`.
* **An MCP tool is named by its server and tool** (`toolName`: *Slack: search users*) in the rows, a run's summary,
  the card's live line and the tiles; the raw name its tooltip.
* **A tool call wears its state** (`toolRes`, `toolMark`): `.tst[data-tu]` — `run` (turning while `#log.working`),
  `ok`, `err` — from the open chat's entries; a result for a row already drawn sets its mark in place, and a folded
  run's summary turns while any call is out.
* **The transcript reads as a conversation** (2026-10-08): your words a bubble on the right (`.msg.user`); Claude's
  prose stops at 80ch; **one who-line a turn** (a text after
  another of the same turn is `.cont`; `logView.lastWho`, reset by a turn's end, an interrupt, a compaction); the
  reply that ends a turn has a footer — *copy* (`.tcopy`, by `data-ts`) and *worked for …* (the server's `turnEnd` and
  `worked` from `s.turnStart`). → `transcript-turns.mjs`.
* **The transcript moves, it does not multiply**: `placeLog()` reparents `#log` into the half holding the chat tab (its
  scroll carried by hand), hidden under a live drawer, parked in the left half when none shows it. **It is appended to,
  not rebuilt**: `renderLog` keeps `logView` (the array, the entries drawn, the trailing run of tool calls and its
  `<details>`) and renders what arrived; another chat or array starts over. A reconnect is `refetchCurrent()`, in place,
  no pill lit. **The fetch and the stream are reconciled** (`logOf`, `awaitEntries` / `takeEntries` / `mergeEntries`):
  while a fetch is out the stream's entries wait in `pending`, and only those past `upto` are taken; a summary older
  than a `session` event is not (`sessionSeen`). `#log` has no `scroll-behavior`. Nothing in it fetches from elsewhere
  (2026-10-14): images only from `data:`; DOMPurify forbids `<style>`, `style=`, form controls but the checkbox, media,
  `picture`, SVG `image`/`use`, `srcset`/`poster`/`background`, an SVG `url()` not `#`. **A reply borrows nothing of the board's**
  (2026-11-06; `MD_PURIFY`, `MD_URI`): no id, name, class (but a code's `language-*`), data-\*, dialog, open, popover,
  hidden; links http(s), mailto, relative (`normPath`); handlers answer their own boxes; copy is `innerText`.
  → `transcript-markup.mjs`. **The log ends with the presence
  line** (`renderPresence()`, while clauding or asking; `shim()`, `VERBS`) **and the new-reply pill** (`.lognew`,
  `logNew()`): new nodes go before that tail, marked `.in` (not on the first fill), or come up part by part when a reply
  lands at the end (`reveal`, `REVEAL_GAP`) — **anything appended goes before the tail**, and "the last message" is
  `:scope > .msg:last-of-type`. → `transcript-live.mjs`.
* **Split or not is the chat's** (`splits`, beside `tabs`); `syncTerm` calls `applySplit()` on every open; only the
  divider's place is the board's. **⌘W on the chat's tab closes the half the keys are in**, each strip's ⨯ its own
  (`closeHalf(g)`); **⌘0 closes the other**. The per-chat maps (`tabs`, `splits`, `state.paneGh`… — the snapshot's list)
  are pruned on every snapshot to the chats it has, carried to the new id across a /clear (`carryChat`) and **kept
  across a reload** (2026-10-16, `keepTabs`: sessionStorage, which lives as the shell's views do; written after
  `syncTerm`, read before the first snapshot). → `split-halves.mjs`, `pane-tabs.mjs`, `tabs-reload.mjs`.
* **A half can fill the column and give it back** (2026-10-13, `zoomed`: chat → half, `toggleZoom`): the other half is
  hidden as it is (`.grp[hidden]`), never unsplit — its terminal is not resized (`fitTerm` gets no size from a hidden
  body), its page not posted (`postPane` skips a hidden half) —, `#groups.zoomed` on and `.stack` off. **It holds while
  the keys stay in that half**: `applySplit` drops it otherwise, and `focusGroup` runs `applySplit` while one is held,
  so ⌘1/⌘2, ⌥⌘←→ or a key of a tab behind it bring both back. → `half-zoom.mjs`.

## The drawer

* **A drawer is a holder** (`lib/termhold.mjs`): a detached process that owns the PTY (node-pty, `<sh> -l -i -c
  'exec claude …'`, `sh` the login shell when zsh or bash, else `/bin/zsh`) and the exact screen (`@xterm/headless` +
  serialize), listening on `<state dir>/terms/<id>.sock` —
  newline-delimited JSON, listed at the holder's head (`seq`, `upto`). The
  server connects, proxies pages (`attachTermSocket`), adopts holders on boot (`adoptHolders`), and tells a holder its
  session id once the registry reveals it. An exited holder lingers `TERM_LINGER_MS` with its last screen, then
  removes its files. **The socket path must stay under 104 bytes** — test state dirs are short on purpose.
* **The drawer is automatic**: the pane's body while the chat runs here, gone when the process exits (`termEnded`);
  `syncTerm` on every open and update. **⌥⌘T is a zsh tab** beside it (a holder with `shell: true`, `shellOf()`,
  `s.shell`), **⌘T another** (`fresh` on the POST, never one at a time; `shellsOf`, `s.shells`, oldest first). **Vim**
  (2026-10-21, `openVim`): a holder with `editor`, among `shells`, never the zsh (`zshsOf`), asked to quit (`killTerm`). **Done
  ends the chat's processes** — the drawer's holders and a claude live elsewhere (SIGTERM). **An idle drawer ends
  itself** (`sweepDrawers`, on the registry poll): a claude idle, no sub-agent or task at work, no page attached, and no
  word in the chat nor the drawer's start within `DRAWER_IDLE_MS` (24 h; 0 off) — the card goes stale and `>_` resumes
  it. A chat waiting on a question and every zsh are left standing.
  → `test/idle-drawer.test.mjs`.
* **A page that attaches gets the screen serialized, then only what followed it** (`ws.hold` until the snapshot,
  flushed minus `seq ≤ upto`). → Findings: *round three*.
* **The two screens stay in step because nothing reaches one while it refits** (2026-10-03): the holder holds its PTY's
  output, a clear and a snapshot until `refit`'s `done`, one resize at a time to the newest, the cursor read behind the
  queue; the page likewise (`toXt`, `tm.refits`); both go back only as far as the park's CUD went.
* **A drawer whose socket closed while its claude runs is attached again** (`tm.lost`, a backed-off `syncTerm`, 5 s
  at most). A holder that accepts and never says hello is a failure after `HELLO_MS`.
* **`nudgeTerm()` after every attach** — a resize one row short, then the size last told, 150 ms later — makes Claude
  repaint over the snapshot, **unseen**: from the first frame till that repaint is in, output is held (`NUDGE_QUIET_MS`,
  `NUDGE_MAX_MS`). → `drawer-switch.mjs`.
* **A drawer comes up at its end, and stays through a resize** (2026-10-29, `settleUntil`; 2026-11-05, `keepEnd`): a
  scroll leaving the end is undone at once, till the nudge lets go and `KEEP_END_MS` past a resize. → `drawer-at-end.mjs`.
* **A TUI's grid waits for its repaint** (2026-11-05; `paintsItself`): the PTY is told, its answer held (`tm.hold`, `REPAINT_*`),
  then grid and bytes go in one parser pass (`endHold`, `unhold`); a zsh reflows at once (`fitLocal`). A size goes at once
  (`moving()`, `FIT_STILL_MS`: once still). → `drawer-repaint*.mjs`, `drawer-soak*.mjs`.
* **The drawer's geometry**: `grid-template-columns: minmax(0, 1fr)` on `#term` and `#chat`, `min-width: 0;
  overflow: hidden` on `.tbody`, and `.tbody { box-sizing: content-box }`. Refits on the body's `ResizeObserver`, a display-scale change (`watchDpr`), focus and
  visibility. → Findings: *run off the right edge*, *round two*. **A glyph's width is read to the fraction**
  (`exactGlyphs`, 2026-10-20), **and the fit by the device cell** (`exactFit`, 2026-10-29). → `drawer-fit.mjs`.
* **⌘K clears the terminal**: the page asks the holder (`clearTerm()` → `{t:'clear'}`), which clears the screen *it*
  serializes and echoes it to every page on that drawer. A nudge follows. ⌃L is the shell's own.
* **What the board types is text, never keys** (2026-11-06; `typable`, `forClaude`, `forShell`): every string it
  composes reaches a drawer through them — line breaks kept (ESC CR for claude), a tab two spaces, every other control
  gone; a dropped name with a control character is refused. Your own keys never pass there. → `typed-text.mjs`.
* **Shift+Enter is a newline**: the drawer sends `ESC CR` itself and swallows the keypress. `macOptionIsMeta` is
  *⌥ is Meta* (`prefs.optMeta`, on). → Findings: *Shift+Enter*.
* **The Mac's line-editing keys are iTerm's Natural Text Editing** (`MAC_EDIT` / `macEdit`): ⌘← ⌘→ ⌃A ⌃E, ⌘⌫ ⌃U,
  ⌘⌦ ⌃K, ⌥⌦ ESC d — control codes Claude Code and zsh both read. ⌥← ⌥→ ⌥⌫ are xterm's own; ⇧, ⌃ or ⌘ with ⌥ (⌥⌘←→)
  is none of them. ⌘Z is the app's Edit menu. → `drawer-mackeys.mjs`.
* **⌥ over a digit or punctuation types what macOS composed**: with ⌥ as Meta, the handler sends `e.key` for the
  codes in `ALT_COMPOSES`, and over any key when it is ASCII and no letter (`ALT_ASCII`: German ⌥L @), else Meta. → Findings: *⌥ is a compose key too*.
* **The ◎ row types `/focus`** into the chat's holder — Claude Code's focus view has no key and no API:
  `toggleFocusView()` sends it, then reads the newest `Focus view enabled|disabled` off the screen (`focusSaid()`) and
  lights `#viewBtn` from that; every attach reads it too (`readFocusFromScreen()`).
  → `focus-view.mjs`.
* **Paths and pages in the chat are links**: a file path in the transcript or a drawer's line — `/absolute`, `./relative`, `folder/file.ext`, `~/…`, `name.ext:12`, after Claude Code's `@` — opens
  in the editor at that line (`fileUrl`, relative to the chat's `cwd`; `PATH_RE`, `pathHref`, `chatLinks`; not
  after a `+` or an in-word `@`, or it is quadratic); a web URL opens in the pane on a tab of the chat
  (`openExternal`, which hands on only `OUT_OK`: http(s), mailto, the editors' `…://file/`; 2026-11-06). The transcript is linkified as rendered (`linkify`); the drawer has a link
  provider beside the web-links addon (`termLinks`, `peix.links(y)`). → `chat-links.mjs`.
* **Two editors, two picks** (Settings › General): the external one (2026-10-13; `prefs.editor`, `EDITORS`, `#edPick`:
  VS Code or Zed — file links, ⌥⌘V `hotEditorApp`, `#zedBtn`) opens `<scheme>://file/<path>:<line>:<col>` (handed
  to the system; never `window.open`); the in-app one (2026-10-21; `prefs.inEditor`,
  `#inEdPick`: VS Code Web or vim) is ⌥⌘E, `#webBtn`, Editor ▾. A switch redraws the transcript (`logView.arr = null`), so its links
  follow; the drawer's are read on hover. → `chat-links.mjs`. **Picking Zed without it installs it** (`wantZed` →
  `POST /api/editors/zed/install` → `installZed`: `brew install --cask zed`, one at a time, then `lsregister -f`);
  until it is there
  `#zedBtn` and a `zed:` link say so (`zedNote`). → `test/editors.test.mjs`, `zed-install.mjs`.
* **Attaching a file is typing its path** (`@dir/file`, spaces as `\ `); the app hands real paths over the bridge
  (`peixDrop`), a browser uploads (`PUT /api/attach`). ⌘V with an image sends ⌃V to claude in the app.
* **Chats that talk** (2026-10-31; `#handoff`): Send to… types into the drawer (`drawerType`), else the resume takes the
  words after `--` (`spawnTerm`'s `prompt`, never logged); a merge or a branch (`fork`) gets the board's id (`newId`);
  `links` ties chats (`addLink`). **A fork writes no line until its first word** (2026-11-04): closed before it, no card, no link, no resume (`noneLeft`, `leaveEmpty`, `linksShown`). → `handoffs.test.mjs`, `branch-chat.mjs`. **A card dragged onto another** (2026-11-02; `cdLift`, `cdHit`, `cdEnd`, `#cdghost`) is Fold
  into…: the list held still (`renderBoard.held`), and the box asks. → `card-drag-fold.mjs`.
* **`termEnv()` strips `CLAUDECODE` and `CLAUDE_CODE_*`** (the CLI refuses to nest) and keeps `CLAUDE_DIR`; a drawer's and
  serve-web's is `drawerEnv()`, without every name the server reads (`BOARD_ENV`: `PORT`… — terminals.test holds it).
  `exit code 129` in a drawer is SIGHUP from its holder ending, not a crash.
* **Take-over**: a chat live in iTerm or VS Code can be resumed here — SIGTERM the other processes, wait, spawn.
  Nothing respawns a CLI claude; VS Code's tab goes dead. → Findings: *VS Code chats can be taken over*.
* **Live chats are never written to** from the board (a second writer on one transcript); stale ones are resumed in
  a drawer.
* **A chat whose claude has ended is its transcript with the resume bar under it** (2026-10-07; `#resume`, row 5,
  `renderResume` from `renderHead` while `resumable(s)`: no process, a file, no drawer). Resume is `termAction`, and
  only the button (or ⌥⌘C) starts it — nothing resumes a chat by itself. **One running outside the board has the bar too**
  (2026-11-04; `elsewhereBar`, `renderElsewhere`): where, its pid, `#takeGo` pressed twice. → `resume-bar.mjs`.

## Invariants that bit us — one line each, the story in Findings

* Transcript line types are undocumented: ignore the unknown; drop `isSidechain`, `isMeta`, `isCompactSummary`,
  `<system-reminder>` blocks (strip them *first* — a prompt can follow one) and `<local-command…>` synthetic lines.
* `.cards > * { flex: none }` is load-bearing; `.card { --repo: initial }` too (custom properties inherit), and
  `.card { isolation: isolate }`: the ring and its cover sit at z-index -1 under the card's background only because
  the card is its own stacking context. **So is `#slist { isolation: isolate }`** (2026-10-13): A new scroller of positioned boxes gets one too. **And each card is a layer inside it**
  (`#slist > .card { will-change: transform }`).
* `.shead { min-width: 0 }` and a fixed `flex-basis` on `.shead h2`; the matrix and its mark are direct children of the header.
* **Every grid row in the chat column is placed by hand** — `#chat`'s, each half's `.ptabs` / `.gbody`, and
  `#sessions`' (its *column* too: the timeline, the glass and the ends lie over the list's cell). A hidden
  block is `display:none`, which slides its siblings up a row; a body in an `auto` row sizes itself to its terminal. A
  new block means placing it too.
* **A terminal that grows has to pull its scrollback back down** (`lib/refit.mjs`, and the page's copy in
  `refitTerm`): xterm only does it when the cursor is on the buffer's last line. → `test/refit.test.mjs`.
* Inline code gets a tint, never a border; card glyphs are inline SVG, not emoji; `--ring` (`.card.black`'s white)
  wins over `--glow`.
* **A CSS animation starts over on a rebuilt node, and only `transform` and `opacity` run off the main thread**:
  anything that moves on a card is phased to the document clock after the render (`phaseAnims()`), and nothing
  continuous animates a custom property, a gradient or a colour, nor eases by `steps()` — WebKit composites none: a
  held frame is two keyframes on a linear easing (`pix`, 2026-10-15).
* **A running animation is moved by its `currentTime`, never its `startTime` alone**: WebKit's compositor never
  sees a start set after it has; Chrome takes either, so the harness cannot see it. The proof is the compositor's frame: `npm run webkit`.
* **In WebKit one main-thread animation makes every frame a style pass and a walk of every layer** (2026-10-13): a
  running animation needs a box that is drawn — WebKit keeps one on a `display: none` pseudo-element. The cost is read off the web process (`sample <WebContent pid>`), never Chrome.
* **WebKit keeps every `animate()` with a timeline** (2026-10-15) with its element, walking the ended each frame:
  `letGoEnded` (`Element.prototype.animate`'s) cancels each when done, timeline nulled. → `animations-let-go.mjs`.
* **A read after a write is a layout**: the list's frame (`listGeom`), `fitHeadPrs` and `layoutNotch` read
  everything first; keep it so.
* `projIcon(name)` marks ⌥⌘O's project wherever its name is written. It, and a folder's colour, read the setup by the
  shown name (`projCfg`) — never a map in the code.
* **The small controls' hover ease is an `:is()` with ids in it, so it weighs an id**: a `transition` of its own on a
  `.btn`, `.act`… needs an id in its selector, or it is the ease's, silently — ask `getAnimations()` mid-move.
* **Never name a modifier class after something the page also selects by**: the walkers take `#slist > .card`, `.note`
  is `note()`'s popup.
* **No in-page toasts**: alerts are the badge plus a system notification (the app sets `NOTIFY=off` on its own
  server); with the board in front an alert can be heard instead (`chime`, `prefs.sounds`, off; none for the chat in view, `CHIME_GAP_MS`; Web Audio made on a
  press, `audioUp`, suspended between sounds, `audioRest`). **The notifications switch is the server's** (`notifications` in the state file, `PUT
  /api/notifications`): off, every alert still goes out but `quiet: true`, and the three posters (main.swift, the
  page's `Notification`, the server's osascript) skip it. A new poster reads `quiet` — and `heading`, the server's
  title for an alert that is not Claude's. → `notifications.mjs`.
* **A chat muted** (2026-11-02; `mutedChats`, `…/mute`, `hushOf`, `setMuted`, `.chip.cmute` on its top row): its alerts `quiet` and `muted`, questions too; a PR's goes to another chat (`prAlertChat`); nothing that calls you counts it (`askingLoud`, `wanting`), its card still does. → `mute-chat.test.mjs`, `chat-mute.mjs`.
* **A change to `:root`'s `--frame` moves the two hex pairs in main.swift's `buildWindow` with it**: the board's web view
  draws no ground, the window's colours are the page's `--frame` per appearance.
* macOS has no `timeout(1)`: `perl -e 'alarm shift; exec @ARGV' 60 <cmd>`. BSD sed has no `\b`.
* `pkill -f server.mjs` also kills the app's own server: stop test servers **by port**.
* VS Code Web (`code serve-web`): extensions live in `~/.vscode-server`, trust in the browser profile. → Findings: *VS Code Web*.
* xterm parses what it is written on its own schedule: read or wipe a screen through `write('', cb)`, never straight
  after a `write()`.
* **`openSession` sets the address before it fetches, and takes only its newest ask's answer.**
* A listener left for a `setTimeout(0)` to remove can outlive the next CDP step (the drag's click swallow is `once`).

## Verifying changes

**Do not claim a UI change works without loading it in a real browser** — the screen shows what code hides.
Look at the screenshots. **After any edit to the page, load it**: `check-page` only compiles, and a `const` read before its line kills
the board at load — `npm test` loads the page (`test/page-load.test.mjs`); `npm run verify` reads the live one.

* `npm run verify -- "<js>"` evaluates one expression on the live board, handed its key; `--hash`, `--shot`, `URL=` at its head. Drive
  Chrome over CDP (`lib/cdp.mjs`), never `--dump-dom`: it fires before the SSE snapshot. **Over a pipe, never a port**
  (2026-11-06; `--remote-debugging-pipe`, the page flat by `sessionId`).
* **What only the app shows is checked in WebKit** (`npm run webkit -- "<body>"`): the harness is Chrome, and a bug of
  WebKit's passes every scenario. It runs an async body on the live board in a `WKWebView`;
  `--shot` saves the window as **the compositor** drew it, and `--then` runs a body on that frame. What a body can ask (`burst()`, 2026-11-05) and `WK_BORDERS` are at its head. On screen by one pixel (off a screen WebKit runs no
  frames); a locked screen or a sleeping display hides it.
* **What the page and the shell do only together is checked in the real shell** (2026-11-04; `npm run shell`, `shell-checks/`): a fake
  bridge says what the page asks for, this whether the window agrees; how is in mac/CLAUDE.md. **A change to `main.swift` or to what
  crosses the bridge runs it before it lands** (`npm run check` says when the shell has moved since). → `pane-place.mjs`.
* **What a change costs is read in WebKit too** (`npm run perf`, 2026-10-13): a 400-chat board, lights on: the web process's
  CPU, layers, memory against ceilings (`CEIL_REST` …), and **the animation rules** (`lib/animcheck.mjs`:
  nothing never-ending on an SVG child, at a playback rate other than 1, by `steps()` or with nothing drawn; no
  inherited registered property transitioned over a big subtree) — Chrome checks them too (`compositor-rules.mjs`) but
  the undrawn box. Rest and home sleep (2026-10-15): a frame asked for each frame hides a main-thread animation. A
  change to motion, the list or the page's structure runs it before it lands — `--against <ref>` puts the same board
  on that commit beside it; `--app` the app as it runs, the rest at its head.
* `npm run scenario -- scripts/scenarios/<name>.mjs` for anything with more than one step. A scenario exports `meta`
  (`server`, `fake`, `fixture`, `env`, `key: false`, `gl` a software WebGL, `prefs` — what the page starts from; **without it a page starts with every
  lane open, large cards, the theme the emulated scheme's, the tour taken, the timeline seen, every page in the board**) and a default `async (ctx) => result`. The runner starts a throwaway server on a free
  port with its own state dir, builds the fixture, runs the fake claude when asked, launches Chrome with **focus
  emulation on**, and cleans up on any way out (`--keep` to inspect; `npm run scenarios` prints `LEAK`). **`ctx.reload()`** waits
  for the new document's snapshot — never a reload and a sleep; `openChat` waits for that chat's log
  (`#log[data-sid]`). **A rectangle is read after `ctx.settle()`**: cards slide after they arrive or move, dialogs rise;
  `settle` waits for every finite animation and a pending draw. `ctx` is listed at the head of `scripts/scenario.mjs`; `watchFrames` a drawer's every frame.
* **`npm run scenarios` runs the lot**, one at a time. A failure is run once more: passing then is `FLAKY`, and the
  suite still exits 0; `--no-retry` is the honest gate.
* **The harness makes no sound** (2026-11-01): headless Chrome has no audio device (`--disable-audio-output`), the WKWebView is muted (`_setPageMuted:`, `muted()`). → `ze-sound-off.mjs`, `ze-webkit.mjs`.
* **A scenario's clock reads noon** (2026-10-14): the runner, its server and Chrome take the `Etc/GMT±N` zone where it
  is noon now (`meta.tz` another or `false`; `ctx.tz`).
* **The auto fixture's folders are temp ones, real paths**: chat A's `repo-a` (no git, no colour), chat B's the temp
  dir itself (`realpathSync(tmpdir())`) — a fake claude there registers `/private/var/…`; a running pid gets its `procStart`.
* **Every test server gets a fast clock, an empty org directory, and nothing of this Mac's** (`lib/testserver.mjs`,
  whose env is the list): fast polls (`REGISTRY_POLL_MS` 1200 …), its own `ORG_DIR` (no welcome), `CLAUDE_DIR` (empty
  unless a fixture) and config beside its `STATE_FILE`; a fake for every CLI and service (`GH_BIN` — only the fields the
  query asks, `FAKEGH_FAIL` —; `CLAUDE_BIN` `noclaude.mjs` unless `fake`; …), `USAGE=off`,
  `KEY_MODE=enforce`, a `ZDOTDIR` with no rc files. Up is its `listening` line (a port taken first moves it to a fresh
  one); stdin a pipe whose end stops it (`PEIX_TEST_PARENT`); `meta.env` is spread last. `waitFor(fn, {timeout, what})`, `srv.post(path, body)` and
  `tmpDir()` are the tests' polls, POSTs and dirs (a bare `mkdtempSync` fails `npm run check`); every test process has
  its own state (`test/env.mjs`, preloaded). **A wait's timeout is for what never comes** (15 s by default, 2026-10-13).
* **Test against the fake claude, not real chats**: `scripts/fakeclaude.mjs` via `CLAUDE_BIN` (`fake: true`) is
  instant and touches nothing; the real CLI, at no cost: `lib/reallab.mjs`. A test against the real `~/.claude` names it as `claudeDir` outright (read-only), uses
  a stale chat and `DELETE`s the terminals it made.
* **Two measurement traps**: Claude Code stops rendering while the terminal reports focus lost — a headless page's
  `focus()` is no focus without `Emulation.setFocusEmulationEnabled` (the runner sets it); and **every re-attach that
  moves the drawer resizes it** — the clean re-attach is a reload of the page, then `openChat`.
* **The fake claude scrolls before it repaints on a shrink** (`drawLive`): a red drawer scenario can be its geometry.
* The page's script is one IIFE: read it through `window.peix` (`state()`, `session(id)`, `sessions()`, `prefs()`,
  `term()`, `screen()`, `motion()`) or the DOM.
* The terminals test is the reference for the API and the socket.
* The app logs to `~/Library/Logs/peixairada-app.log`; the agent's server to
  `~/Library/Logs/peixairada.log` (in UTC).

## Deliberately not done

* **The title bar as one surface with the head row** — round the traffic lights, with something to drag the window
  by: a design for in front of the app. → Decisions 2026-09-27.
* **Making VS Code's tab follow a chat continued elsewhere** — the extension watches only `~/.claude/sessions/`.
* **Attaching to a *live* session from the board** — its socket cannot answer a permission prompt for you, and only its
  auth line is documented (2026-10-31). Live chats are refused on purpose, but for what `claude attach` opens.
* **The app is signed for this machine only**, not for distribution.

