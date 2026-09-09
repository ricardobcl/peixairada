# peixAIrada — working notes

One board for every Claude Code chat on this Mac. Reads what Claude Code already writes to
`~/.claude`, so it needs no private API and no cooperation from Claude Code itself. Built as a PoC on
2026-08-31 and grown from there. **See [README.md](README.md) for the user-facing description** — this
file is what a future session needs to pick the work back up.

## Run / build

```sh
npm start                 # node server.mjs → http://127.0.0.1:7331
mac/build.sh install      # build the native app into /Applications and launch it
scripts/launchd.sh install    # or run the bare server at login
node scripts/verify.mjs '<js>'  # headless-browser check of the live UI (see "Verifying" below)
```

Node ≥ 20, zero npm dependencies (`marked`/`DOMPurify` are vendored in `public/vendor/`). The Mac app
needs `swiftc` (full Xcode is installed here).

## Layout

| Path | What |
|---|---|
| `server.mjs` | The whole backend: transcript tailing, session state, SSE, HTTP, notifications |
| `public/index.html` | The whole frontend, one file, no build step |
| `public/vendor/` | `marked` 18.0.11 + `DOMPurify` 3.4.14 (UMD builds, vendored on purpose — no CDN at runtime) |
| `mac/Sources/main.swift` | Native shell: window, server lifecycle, Dock badge, menu bar, notifications |
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
| Titles | `ai-title`, `custom-title` lines |
| PRs mentioned | `pr-link` lines *and* GitHub pull URLs scanned out of user/assistant message text |
| PR open/merged/closed | `gh api graphql`, batched — the only thing here that talks to the network |
| Permission prompts | **only** via hooks — these never reach the transcript |

Lane order is `done → stale → clauding → ready` (first match wins), where *stale* = process gone and
*done* = user-ticked.

## State: what lives where

* **Server-side, shared across browsers and the Mac app** —
  `~/Library/Application Support/peixAIrada/state.json` (Apple's location for app data, matching the
  logs in `~/Library/Logs/`; `$XDG_STATE_HOME/peixairada/state.json` off macOS, `STATE_FILE` overrides
  both). Holds done ticks and pins. A done mark is `doneMarks[id] >= lastActivity`, so it expires by
  itself when the session moves. It used to be `~/.peixairada/state.json`; the server moves that file
  across on first run and the migration code can go once it has clearly run everywhere.
* **Browser-only** — `localStorage` key `peixairada-prefs`: lane collapse, repo folds, card folds,
  grouping, compact, chat side/width/visibility, tools mode.
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
  min-content: a long cwd — never mind a row of PR chips — made the header wider than the chat pane
  and spilled it over the board. `.shead { min-width: 0 }`, plus the same on the scrolling `.prs`
  row, is what keeps it inside the pane.
* **Swift:** `Result<Void, String>` does not compile (`String` isn't an `Error`); the server callbacks
  use `(String?) -> Void` where nil means success.
* **CoreGraphics:** filling several overlapping subpaths in one path punches holes when their winding
  directions disagree. The icon fills each shape separately inside `beginTransparencyLayer` so they
  merge and still get one shadow.
* **`fs.watch(recursive: true)` works fine on macOS** and fires on every append; there is no need to
  poll transcripts. The session registry is watched *and* polled every 10 s (pids die silently).
* **Notifications:** the app sets `NOTIFY=off` on the server it spawns, because it posts its own. When
  it attaches to a server it did not start, it reads `notify` from the SSE snapshot and stays quiet so
  you don't get two banners.
* **macOS has no `timeout(1)`** — use `perl -e 'alarm shift; exec @ARGV' 60 <cmd>`.
* **Finding `node` from the GUI app is the fragile part.** launchd hands the app a bare PATH, and
  version managers (mise here) activate in `.zshrc`, so only an *interactive* login shell can resolve
  node — and an interactive shell prints shell-integration escapes (iTerm2's `ESC ] 1337 ; … BEL`)
  onto stdout, so its output is not a bare path. `pathFromShellOutput` therefore splits on control
  characters and takes the last executable absolute path, and there is a fallback list of known
  install layouts (mise/nvm/fnm/asdf/volta/homebrew). The result is cached in UserDefaults; override
  with `PEIXAIRADA_NODE` or `defaults write net.peixairada.app nodePath /path/to/node`. If the app
  ever says it cannot find node, `~/Library/Logs/peixairada-app.log` has the full `findNode:` trace.

## Verifying changes

Do not claim a UI change works without loading it in a real browser — several bugs here
(squashed cards, detached fins, column overlap) were invisible in the code and obvious on screen.

```sh
node scripts/verify.mjs "document.querySelectorAll('.card').length"
node scripts/verify.mjs "JSON.stringify([...document.querySelectorAll('.lane')].map(l => l.dataset.lane))"
```

* `--dump-dom` is **useless** here: it fires on `load`, before the SSE snapshot and `fetch` populate
  the page. `--virtual-time-budget` never expires either, because the SSE stream is always in flight.
  Drive Chrome over CDP and wait for the DOM state you expect — that is what `scripts/verify.mjs` does.
* For server logic, point a throwaway server at a fixture tree:
  `CLAUDE_DIR=/tmp/fix STATE_FILE=/tmp/state.json PORT=7399 NOTIFY=off node server.mjs`, then append
  JSONL lines to it and assert on `/api/sessions`.
* The Mac app logs its own decisions to `~/Library/Logs/peixairada-app.log` (notification permission,
  every alert with `focused=`/`useUN=`, badge counts) — read that instead of guessing.

## Deliberately not done

* **Replying into a *live* session from the board.** Stale chats *can* be replied to — see
  `replyToStale` in `server.mjs`, which shells out to `claude --resume <id> -p <text>`: public CLI,
  same transcript, and the watcher shows the answer with no special casing. Live chats are refused on
  purpose (a second writer on one transcript). Reaching them means the peer socket at
  the session's inbox socket (`messagingSocketPath` in the registry). That is a *documented* feature —
  https://code.claude.com/docs/en/cross-session-messaging — and "a script or hook posting into a
  session" is a supported use of it; on macOS the `{"type":"auth","token":…}` first line is optional,
  so no credential is needed. Two things stopped it anyway:
  1. **It cannot do the job.** A message posted to the socket is attributed to another *session*, and
     the docs state it "can't answer a pending permission prompt on your behalf". The red needs-input
     lane — the only reason to want this — is off the table by design.
  2. The exact JSON of a *message* line is not in the docs (only the auth line is), and establishing it
     empirically means writing to a session socket, which the auto-mode classifier blocks.
* **PR status costs a network call**, so it is lazy: statuses are fetched when a chat is *opened*
  (and when a PR comes up live), never for the whole history at boot — `indexing` guards that. Merged
  and closed are terminal and cached forever; open/draft re-check after `PR_TTL_MS` (10 min), a PR we
  cannot see after an hour. `gh` brings its own token, so it works from the app's bare launchd
  environment; `GH_BIN` overrides the search, and without `gh` the chips just stay neutral.
* **Hooks are not installed** in `~/.claude/settings.json`. Merging `hooks/settings-snippet.json` is
  what makes permission prompts visible and "replied" exact instead of inferred.
* **The Mac app is only ad-hoc signed** — this machine, not distribution.
