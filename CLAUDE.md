# peixAIrada — working notes

One board for every Claude Code chat on this Mac. Reads what Claude Code already writes to
`~/.claude`, so it needs no private API and no cooperation from Claude Code itself. Built as a PoC on
2026-08-31 and grown from there. **See [README.md](README.md) for the user-facing description** — this
file is what a future session needs to pick the work back up.

## Run / build

```sh
npm start                 # node server.mjs → http://127.0.0.1:7331
mac/build.sh install      # build the native app (bundling node + node_modules) into /Applications and launch it
scripts/launchd.sh install    # or run the bare server at login
node scripts/verify.mjs '<js>'  # headless-browser check of the live UI (see "Verifying" below)
```

Node ≥ 20. `npm install` first: two runtime dependencies since 2026-09-19 — `node-pty` (native, the
terminal drawer) and `ws` (the WebSocket server Node lacks) — plus the xterm packages as dev-only
sources for the copies vendored in `public/vendor/` (`marked`/`DOMPurify`/`highlight.js` are vendored
by hand). The Mac app needs `swiftc` (full Xcode is installed here) and bundles `node_modules`.

## Layout

| Path | What |
|---|---|
| `server.mjs` | The whole backend: transcript tailing, session state, SSE, HTTP, notifications |
| `public/index.html` | The whole frontend, one file, no build step: projects · chats · chat, the terminal drawer, the transcript renderer |
| `public/vendor/` | `marked` 18.0.11 + `DOMPurify` 3.4.14 + `highlight.js` 11.11.1 + `xterm` 5.5.0 (+ fit 0.11, web-links 0.12) — UMD builds, vendored on purpose, no CDN at runtime |
| `mac/Sources/main.swift` | Native shell: window, the PR pane (second web view), server lifecycle, Dock badge, menu bar, notifications |
| `mac/icon/MakeIcon.swift` | The app icon, drawn in CoreGraphics (no image assets) |
| `mac/build.sh` | Compile + bundle + ad-hoc sign + optional install |
| `hooks/` | Optional Claude Code hooks that POST to `/hook`. **Not installed** — Ricardo's call |
| `scripts/launchd.sh` | Run the bare server as a login agent |
| `scripts/verify.mjs` | Headless-Chrome harness for checking UI changes |

## How it reads Claude Code

| Signal | Source |
|---|---|
| Transcript, appended live | `~/.claude/projects/<cwd-slug>/<session-id>.jsonl` |
| Which sessions are alive | `~/.claude/sessions/<pid>.json` + `process.kill(pid, 0)` |
| Reply finished | assistant line with `stop_reason: "end_turn"` (tool calls are `"tool_use"`) |
| Waiting on the user | `AskUserQuestion` / `ExitPlanMode` tool call with no result yet |
| Titles | the oldest still-open PR the chat mentions, else `custom-title` / `ai-title` lines |
| PRs mentioned | `pr-link` lines *and* GitHub pull URLs scanned out of user/assistant message text |
| PR open/merged/closed | `gh api graphql`, batched — the only thing here that talks to the network |
| Permission prompts | **only** via hooks — these never reach the transcript — *or* visibly, in the terminal drawer |
| Chat from the board | a PTY (`node-pty`) running `claude --resume <id>` or `claude` in the chat's cwd, through an interactive login zsh so mise's PATH applies; it registers like any CLI run. A new chat is tied to its session by pid when the registry entry appears |

The page is three columns — projects → chats of the selected project → the chat — since
2026-09-19; the four lanes (stale / ready / clauding / done) are gone. A chat's state is
`done → stale → needs-input → working → ready` (first match wins; `bucket()` in index.html), shown as
a dot and offered as filter chips. A *project* is a folder (`s.cwd`, the registry's stable repo
path — never the transcript's, which moves with `cd`) or a named set of folders from the state file
(`projects`); a chat is in its folder and in every named project whose folder is a prefix of its
cwd, so worktrees under a repo count as the repo. Folder projects exist only through their
sessions; named ones always show.

Order everywhere is by when *you* last acted on the chat (`lastUserAt`: a prompt, an answer to
its question, an interrupt), newest first; done chats sink below the rest, and a project ranks by
its newest chat. A session whose tail held no prompt of yours (boot reads only the end of a long
transcript) sorts by `lastActivity` instead of sinking. Pins were dropped the same day: sorting by
your own last touch keeps the chats you are driving on top, which is what pinning was for, and
Claude finishing a long job no longer reshuffles the list. The card still *shows* `lastActivity`;
its tooltip carries `lastUserAt`.

## State: what lives where

* **Server-side, shared across browsers and the Mac app** —
  `~/Library/Application Support/peixAIrada/state.json` (Apple's location for app data, matching the
  logs in `~/Library/Logs/`; `$XDG_STATE_HOME/peixairada/state.json` off macOS, `STATE_FILE` overrides
  both). Holds done ticks and the named projects (`projects: {id: {name, cwds, createdAt}}`) — a
  `pins` key from before 2026-09-19 is ignored and dropped on the next save. A done mark is `doneMarks[id] >= lastActivity`, so it expires by itself when the
  session moves. It used to be `~/.peixairada/state.json`; the server moves that file
  across on first run and the migration code can go once it has clearly run everywhere.
* **Browser-only** — `localStorage` key `peixairada-prefs`: selected project, filter chip, chat-list
  width, tools mode, fold code, sound, show-all, chat-header details fold, terminal drawer
  open/height. Keys from the lane board are deleted on load. `renderHead`
  re-runs on every SSE update, so anything it renders must read its open/closed state from here — the
  DOM it built is thrown away each time.
* **Never written**: anything under `~/.claude`. This tool is read-only against Claude Code's data.

## Things that bit us — keep them in mind

* **Transcript line types are undocumented and varied.** The parser ignores anything it does not
  recognise; ~20 `type` values seen in the wild. Filter out `isSidechain`, `isMeta`,
  `isCompactSummary`, `<system-reminder>` blocks and `<local-command…>`-style synthetic prompts, or
  Claude's own injected text shows up as user messages.
* **Registry `cwd` beats transcript `cwd`.** Transcript lines record the shell's *current* directory,
  which moves with `cd`; the registry has the stable repo path. Grouping uses the registry.
* **Flexbox squashed the cards.** `.cards` is a flex column and cards have `overflow: hidden`, so a
  full lane shrank them to 17 px. `.cards > * { flex: none }` is load-bearing — don't remove it.
* **…and stretched the chat header.** `.shead` is a grid item, so its `min-width: auto` resolved to
  min-content: a long cwd made the header wider than the chat pane and spilled it over the board.
  `.shead { min-width: 0 }` is what keeps it inside. The cwd now lives in the `···` fold, and PR chips
  are *direct* children of `.shead` rather than a nested row — as one flex item they could not wrap,
  which is why that row used to scroll sideways instead. `.shead h2` must keep a fixed `flex-basis`
  for the same reason: at `auto` a long title exceeds the line by itself and pushes the status, the
  buttons and every chip onto the next one.
* **No Edit menu, no ⌘V.** A menu bar built in code has no Edit menu unless it makes one, and
  without Cut/Copy/Paste/Select All items the key equivalents are dispatched to nobody: paste did
  nothing in GitHub's login form in the PR pane, in the filter box, or in the terminal drawer. Fixed
  on 2026-09-19 by adding the menu with the standard `cut:`/`copy:`/`paste:`/`selectAll:` actions
  and a nil target (first responder).
* **Swift:** `Result<Void, String>` does not compile (`String` isn't an `Error`); the server callbacks
  use `(String?) -> Void` where nil means success.
* **The app can lose its server without noticing.** It adopts whatever already answers on 7331, and on
  2026-09-09 that was an orphan: the app had segfaulted on reopen (an `NSWindow` built in code defaults
  to `isReleasedWhenClosed = true`, so ⌘W over-released it) and left its server running. Nothing
  watched that server, so when it was killed the board froze with every button failing. The window now
  sets `isReleasedWhenClosed = false`, and a watchdog polls `/api/sessions` every 5 s and starts a
  server after three misses.
* **CoreGraphics:** filling several overlapping subpaths in one path punches holes when their winding
  directions disagree. The icon fills each shape separately inside `beginTransparencyLayer` so they
  merge and still get one shadow.
* **`fs.watch(recursive: true)` works fine on macOS** and fires on every append; there is no need to
  poll transcripts. The session registry is watched *and* polled every 10 s (pids die silently).
* **Notifications:** the app sets `NOTIFY=off` on the server it spawns, because it posts its own. When
  it attaches to a server it did not start, it reads `notify` from the SSE snapshot and stays quiet so
  you don't get two banners.
* **The app's server has `PATH=/usr/bin:/bin:/usr/sbin:/sbin`** — no `/usr/local/bin`, no homebrew.
  Every CLI the server shells out to therefore goes through `findBin()` (PATH, then the layouts the
  installers actually use, `<NAME>_BIN` overriding both); `execFile('code', …)` by bare name is what
  made "Focus in VS Code" a dead button in the packaged app while it worked fine under `npm start`.
* **Syntax highlighting** is `hljs` over the DOM *after* DOMPurify (hljs escapes what it emits), with
  the palette written into `index.html` as `--hl-*` tokens rather than shipping a hljs theme — the
  vendor route only serves `.js`, and this way it follows light/dark like everything else. Unlabelled
  fences auto-detect only under `AUTO_MAX` chars and only among `AUTO_LANGS`: `highlightAuto` costs
  ~4× a known language and `renderLog` re-renders the whole transcript on every SSE update.
* **No in-page toasts.** Alerts are the unread badge plus a *system* notification. The old bottom-right
  toast double-banner'd inside the Mac app, which posts its own.
* **Inline `code` gets a tint, never a border.** These transcripts are dense with inline code — a
  bordered chip per term turns a paragraph into a fence of boxes, and the chip, being taller than the
  words around it, makes every line containing one taller than the ones that don't. A translucent
  `--inline-bg` (so it composites over the page, the user bubble or a table cell alike) at `.88em`
  keeps a term the same visual size as the prose. Blocks are the opposite case and do keep a border.
* **Card glyphs are inline SVG, not emoji.** At 11px inside muted snippet text an emoji brings its own
  palette and weight and stops reading as part of the sentence; `currentColor` SVG stays typographic
  and themes itself. The Claude sunburst needs *few, thick* rays — the first cut had 12 fine ones and
  rendered as a fuzzy dot at card size. Rebuild it with the generator in the git history, not by hand.
  You is teal, Claude is the accent clay, and Claude's snippet text sits brighter than yours — the reply
  is the thing you scan a lane for. `#focusBtn .ic` is an *id* selector, so the VS Code icon's error
  colour has to be `#focusBtn.err .ic` to out-specify it; `.btn.icon.err .ic` silently loses.
* **Pin the Swift deployment target.** `swiftc` without `-target` stamps the binary with the
  *toolchain's* default OS, not this Mac's: on 2026-09-19 a beta Xcode wrote `minos 28.0` on a 27.0
  machine and LaunchServices refused to open the app (`-10825`, `kLSIncompatibleSystemVersionErr`)
  — after `build.sh install` had already deleted the old one, so the board was simply gone. A CLI
  run from the shell skips that check, which is why `makeicon` still worked. `build.sh` now passes
  `-target <arch>-apple-macosx$MIN_OS` and puts the same number in `LSMinimumSystemVersion`;
  `otool -l <binary> | grep -A4 LC_BUILD_VERSION` shows what a binary actually says.
* **Opening the *chat* in VS Code rides on an undocumented URI parameter.** The extension's URI handler
  (`vscode://anthropic.claude-code/open`) reads `session` and `prompt` and hands them to its own
  open-session command; the docs only list `q`, `cwd` and `repo`. Verified on 2.1.278: a stale session
  opened this way registers with `entrypoint: claude-vscode` within a second. It lands in whichever
  window is focused, so the focus endpoint runs `code <cwd>` first and the URI 400 ms later. If an
  update drops the parameter, the window still comes up and the chat does not — check the handler
  with `grep -oE 'case"/open":.{300}' ~/.vscode/extensions/anthropic.claude-code-*/extension.js`.
* **node-pty's spawn-helper arrives without its executable bit.** npm's prebuilt
  `prebuilds/darwin-arm64/spawn-helper` is mode 644, and the first terminal fails with
  `posix_spawnp failed`. `postinstall` chmods it and the server does so again before importing the
  module. The terminals' PTYs are owned by the server process: restart it and every claude in a
  drawer gets SIGHUP. `exit code 129` in the drawer is that, not a crash.
* **The server's own environment says it is inside Claude** when started from a Claude shell
  (`CLAUDECODE`, `CLAUDE_CODE_*`), and the CLI refuses to nest. `termEnv()` strips those before
  spawning; keep it that way.
* **macOS has no `timeout(1)`** — use `perl -e 'alarm shift; exec @ARGV' 60 <cmd>`.
* **The app ships its own node** (since 2026-09-19). `build.sh` copies the node on PATH — the one
  that ran `npm install`, so node-pty's addon matches its ABI — into `Contents/Resources/node`, and
  the app runs that. The old search (an interactive login shell to get mise's PATH, scrubbing
  iTerm2's shell-integration escapes off its output, a fallback list of install layouts, a
  UserDefaults cache) is gone with the bugs it kept growing; `PEIXAIRADA_NODE` still overrides.
  Rebuild after switching node versions, and after `npm install` — `node_modules` is copied too.
* **GitHub cannot be iframed** (`frame-ancestors 'none'`), so the app's PR pane is a second
  `WKWebView` in an `NSSplitView` beside the board, with its *own* delegate: the board's delegate
  sends every non-local link to the system browser, and a web view with no UI delegate silently drops
  `target=_blank`, which is why `PrPaneDelegate` implements `createWebViewWith` by loading into the
  same view. The page asks for the pane over the bridge (`{type: 'open', url}`) and sends other
  external links out the same way (`external`); in a plain browser the same clicks open tabs. Both
  web views share the default website data store, so the GitHub login survives a relaunch.

## Verifying changes

Do not claim a UI change works without loading it in a real browser — several bugs here
(squashed cards, detached fins, column overlap) were invisible in the code and obvious on screen.

```sh
node scripts/verify.mjs "document.querySelectorAll('.card').length"
node scripts/verify.mjs "JSON.stringify([...document.querySelectorAll('.lane')].map(l => l.dataset.lane))"
node scripts/verify.mjs --hash <id> --shot /tmp/x.png "1"    # screenshot after the expression; DARK=1 for dark mode
```

Look at the screenshot (`Read` renders PNGs) — the drawer's first cut only looked right because
someone did.

* `--dump-dom` is **useless** here: it fires on `load`, before the SSE snapshot and `fetch` populate
  the page. `--virtual-time-budget` never expires either, because the SSE stream is always in flight.
  Drive Chrome over CDP and wait for the DOM state you expect — that is what `scripts/verify.mjs` does.
* For server logic, point a throwaway server at a fixture tree:
  `CLAUDE_DIR=/tmp/fix STATE_FILE=/tmp/state.json PORT=7399 NOTIFY=off node server.mjs`, then append
  JSONL lines to it and assert on `/api/sessions`. Terminal endpoints spawn a *real* `claude` in a
  PTY — point the test server at the real `~/.claude`, use a stale chat, and `DELETE` the terminals
  you made (`GET /api/terminals` lists them). Stop it **by port** —
  `lsof -ti tcp:7399 -sTCP:LISTEN | xargs kill`. `pkill -f server.mjs` also matches the Mac app's own
  server (it runs the bundle's `server.mjs`); that is what took the board down on 2026-09-11 and left
  every button on it, VS Code first, failing with `Load failed`.
* The Mac app logs its own decisions to `~/Library/Logs/peixairada-app.log` (notification permission,
  every alert with `focused=`/`useUN=`, badge counts) — read that instead of guessing.

## Deliberately not done

* **Attaching to a *live* session from the board.** Stale chats *can* be replied to and chatted
  with — `replyToStale` shells out to `claude --resume <id> -p <text>` and the terminal drawer runs
  `claude --resume <id>` in a PTY: public CLI, same transcript, and the watcher shows the answer with
  no special casing. Live chats are refused on purpose (a second writer on one transcript). Reaching them means the peer socket at
  the session's inbox socket (`messagingSocketPath` in the registry). That is a *documented* feature —
  https://code.claude.com/docs/en/cross-session-messaging — and "a script or hook posting into a
  session" is a supported use of it; on macOS the `{"type":"auth","token":…}` first line is optional,
  so no credential is needed. Two things stopped it anyway:
  1. **It cannot do the job.** A message posted to the socket is attributed to another *session*, and
     the docs state it "can't answer a pending permission prompt on your behalf". The red needs-input
     lane — the only reason to want this — is off the table by design.
  2. The exact JSON of a *message* line is not in the docs (only the auth line is), and establishing it
     empirically means writing to a session socket, which the auto-mode classifier blocks.
* **PR status costs a network call.** It *used* to be lazy for everything — fetched when a chat was
  opened, never for the whole history at boot. Titles ended that: they head every card, so the whole
  board needs them up front and boot queues every PR it has seen (~280 here = ~7 batched GraphQL
  calls, in the background, once per run). Everything else is still lazy and `indexing` still guards
  the queue during the scan, so a PR is asked about once, not once per mention. Merged
  and closed are terminal and cached forever; open/draft re-check after `PR_TTL_MS` (10 min), a PR we
  cannot see after an hour. `gh` brings its own token, so it works from the app's bare launchd
  environment; `GH_BIN` overrides the search, and without `gh` the chips just stay neutral and every
  card keeps Claude's own title.
* **A card is titled by its PR, and `prTitle()` picks which one.** Chats mention several — the one
  being worked on is the *oldest still open*: the later ones are usually references (the PR this
  follows, the one it conflicts with), and merged/closed is finished business. With none open the
  oldest wins anyway, so a card keeps its title through the merge rather than flipping back. A title
  the user typed (`custom-title`) still beats the PR. Two consequences to remember: the title is null
  until `gh` answers, so cards render Claude's title for the first second or so of a run; and boot
  reads only the last `TAIL_BYTES` of a long transcript, so a PR mentioned only near its top is not
  known — and cannot title the card — until the chat is opened once and parsed in full.
* **Hooks are not installed** in `~/.claude/settings.json`. Merging `hooks/settings-snippet.json` is
  what makes permission prompts visible and "replied" exact instead of inferred.
* **The Mac app is only ad-hoc signed** — this machine, not distribution.
