# peixAIrada — working notes

One board for every Claude Code chat on this Mac. Reads what Claude Code already writes to
`~/.claude`, so it needs no private API and no cooperation from Claude Code itself. Built as a PoC on
2026-08-31 and grown from there. **See [README.md](README.md) for the user-facing description** — this
file is what a future session needs to pick the work back up. The dated **decision log** — why things are the way they are, what is open, the state of the tree — is [docs/DECISIONS.md](docs/DECISIONS.md); update it when a decision changes.

## Run / build

```sh
scripts/launchd.sh install    # the server as a login agent, run from this checkout — the recommended setup, see below
scripts/launchd.sh restart    # after a change to server.mjs (every drawer ends); page changes need only a reload
mac/build.sh install      # build the native app (bundling node + node_modules) into /Applications and launch it — needed for Swift changes only once the agent runs
npm start                 # node server.mjs → http://127.0.0.1:7331, by hand
node scripts/verify.mjs '<js>'  # headless-browser check of the live UI (see "Verifying" below)
```

**Since 2026-09-20 the server runs as a launchd agent and the app adopts it.** The app's own server died
with the app, and every drawer's claude with it — including the one this project was being built from.
`scripts/launchd.sh install` runs `server.mjs` *from the repo* under launchd (`KeepAlive`), hands over
from a running app (quits it, waits for the agent to take the port, reopens it — the app attaches to
whatever answers on 7331), and installs with `NOTIFY=off` so the app keeps posting its own notifications
(it stays quiet when the server's are native). Consequences: quitting or rebuilding the app no longer
touches the chats; a page change is live on reload (the agent serves the working tree's `public/`); a
`server.mjs` change needs `scripts/launchd.sh restart`, which does end the drawers. The bundled server in
the app is now only the fallback for a Mac without the agent. Level two — a holder process per drawer so
the chats survive even a server restart — is designed in docs/DECISIONS.md and not built.

Node ≥ 20. `npm install` first: four runtime dependencies — `node-pty` (native, the terminal drawer) and `ws`
(the WebSocket server Node lacks) since 2026-09-19, `@xterm/headless` 5.5 and `@xterm/addon-serialize` 0.13 (the
exact screen of every drawer, snapshotted for a page that attaches; pinned to the vendored xterm's version) since
2026-09-20 — plus the xterm packages as dev-only
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
| Where a chat lives | `entrypoint` on every user/assistant line (`claude-vscode` / `cli`), the registry's while it runs — `inVsCode()` in server.mjs, `entrypoint` in the summary. VS Code chats: a VS Code mark at the card's top right and at the end of the chat header (`.own`; the blue and orange washes went later on 2026-09-20 — cards and the pane are washed in the project's colour, `var(--repo)` on the card and on `#chat`, the light gray `--nocolor` without one), and since 2026-09-20 takeable like any other (see *VS Code chats can be taken over* under *Things that bit us*). A chat live anywhere but the drawer: `POST …/takeover` (SIGTERM every process on it, wait for the pids, `spawnTerm`); with the chat already in the drawer the same route ends only the others. Several processes on one chat: `loadRegistry()` picks the drawer's own as `live`, else the newest that is not VS Code's, and lists the rest as `rivals` on the summary (with `tailEntrypoint`/`tailEntrypointAt`, who wrote the last turn) — the page's red bar and *VS Code too* chip |
| Reply finished | assistant line with `stop_reason: "end_turn"` (tool calls are `"tool_use"`) |
| Waiting on the user | `AskUserQuestion` / `ExitPlanMode` tool call with no result yet |
| Titles | the oldest still-open PR the chat mentions, else `custom-title` / `ai-title` lines |
| PRs mentioned | `pr-link` lines *and* GitHub pull URLs scanned out of user/assistant message text |
| PR open/merged/closed | `gh api graphql`, batched — one of the two things here that talk to the network |
| Plan usage (the cog) | `GET https://api.anthropic.com/api/oauth/usage` with `anthropic-beta: oauth-2025-04-20` and Claude Code's own OAuth bearer — the keychain item `Claude Code-credentials` (`security find-generic-password -w`, JSON, `claudeAiOauth.accessToken`), `~/.claude/.credentials.json` off macOS. `/usage`'s own endpoint, read off the 2.1.278 binary; `utilization` is a percentage, `resets_at` ISO; `limits[]` carries the server's own rows (`kind` session / weekly_all / weekly_scoped, `percent`, `scope.model.display_name`) and the per-model weekly allowances live there — `usageWindows()` shows every weekly_scoped row (the CLI hides them behind an allowlist). Codename buckets of the window shape come too: `cinder_cove` is the CLI's "Claude Code and Cowork credit", `nimbus_quill` appeared at 0 % on 2026-09-20 with no label anywhere in 2.1.278; they show only when non-zero, the rest go back as `other`. `planUsage()` in server.mjs: cached 60 s, `USAGE=off` disables, the token never reaches the page. An API-key login has no plan usage and says so |
| Permission prompts | **only** via hooks — these never reach the transcript — *or* visibly, in the terminal drawer |
| Chat from the board | a PTY (`node-pty`) running `claude --resume <id>` or `claude` in the chat's cwd, through an interactive login zsh so mise's PATH applies; it registers like any CLI run. A new chat is tied to its session by pid when the registry entry appears. Any chat, VS Code's included since 2026-09-20 — a live one is taken over first |

The page is three columns — projects → chats of the selected project → the chat — since
2026-09-19; the four lanes (stale / ready / clauding / done) are gone. A chat's state is
`ready · clauding · done` (see below), shown as
a dot and offered as three *toggle* chips (`prefs.filters`, the set of states shown, remembered per browser;
all three on is what the old *all* chip was, none on says so in the list). **Three states since 2026-09-20** — `bucket()` in index.html: *done* is
the tick and nothing else (a chat with no live process is *ready* — grey dot, `.card.gone` dimmed a touch; asked
later that day, the first cut folded stale into done), *clauding* is `working`, *ready* is everything else, a
pending question included (the card still says *asking you*); the server keeps the finer `status` for
notifications and the app's badge, and the list order is untouched by state. The project pills count by the
same rule: every chat not ticked is working or ready. A *project* is a folder (`s.cwd`, the registry's stable repo
path — never the transcript's, which moves with `cd`) or a named set of folders from the state file
(`projects`); a chat is in its folder and in every named project whose folder is a prefix of its
cwd, so worktrees under a repo count as the repo. Folder projects exist only through their
sessions; named ones always show — and so do pinned ones.

**Pinned projects** (2026-09-20) head the column in your order, above a line (`.psep`); a pinned folder shows
even with no chat in view. The list is server state — `pinned` in the state file, folder cwds and `c:<id>` keys;
`PUT /api/pins` replaces the whole ordered list and a `pins` event carries it to every page — so the app and
every browser agree, and `projectList()` in index.html puts `state.pins` first, then named projects, then
folders by their newest chat (the ⌥⌘O picker follows). The pin on a row (open column; always shown while
pinned) pins at the end of the block; dragging a row — in the strip too — sets its place: anywhere above the
line pins it there, a pinned row dropped below the line is let go. `dropAt()` maps the drop through the key of
the pinned row it lands before, so rows hidden by the column filter do not shift it; the indicators are
box-shadows, so nothing moves under the pointer.

A project's colour is Peacock's and nothing else (2026-09-20 — the board-set swatch and the hashed hues lasted a
morning) — and since later that day the board can *set* it: the swatch on a row with one folder (folder rows,
single-folder named projects) writes `peacock.color`. `writePeacock()` in server.mjs, `PUT`/`DELETE /api/peacock`
`{cwd, color}` (the cwd must be one `peacockCwds()` knows): a text edit of the JSONC file `peacockFile()` resolves,
or a new `<cwd>/.vscode/settings.json` — the key is inserted first, replaced in place, or its line removed (and the
comma it followed, if it was last); comments and other keys come out as they went in. `pollPeacock()` is forced
right after, so the board follows at once; Peacock's own configuration watcher repaints the window. The answer
carries `tracked` (git ls-files) and the note by the square says so. **The square *is* the picker** (later on
2026-09-20, the hover swatch lasted an hour): the colour square on a one-folder row and on the chat list's header
(`.sq.pick`, `sqHtml()`); the real control is the one `#colorInput` on the page, moved under the square and opened
with `showPicker()` — the lists are re-rendered on every update, and an `<input type=color>` inside them lost the
panel it had opened on the next render. `input` previews on the board (`previewColor`, one render per frame) and
writes 350 ms after the panel rests, `change` writes at once, `written` keeps the two from writing the same colour
twice; ⌥-click removes. The outcome pops up by the square (`note()`, a transient line anchored to an element, not
an alert). `repoColor(cwds)` in index.html looks the folder up in `state.peacock` (cwd → `#rrggbb`, on the
snapshot and pushed as a `peacock` event); a named project takes the first of its folders' with one; a folder
without one has *no* colour — `--repo` stays unset and the CSS paints `--nocolor` (a light gray; black until
later on 2026-09-20) where a colour is
needed (the strip tab, the swatches, the card's left bar, the chat list's edge and header tint) while the card
frame and the working ring keep their neutral fallbacks, and the header's folder name just inherits the ink.
So a colour on the board always means the VS Code window is that colour. `pollPeacock()` in server.mjs stats,
every `PEACOCK_POLL_MS` (3 s), the nearest `.vscode/settings.json` at or above every folder it knows — session
cwds, named projects' folders, pinned folders; the walk stops short of `$HOME`, so a chat in `apps/x` or a
worktree of a repo wears the repo's colour — re-reads on mtime (`peacock.color`, else `activityBar.background`,
by regex since the file is JSONC) and broadcasts only on change; verified end to end: a colour rewritten in the
file was on the page 4 s later. The card's border is that colour mixed 70 % into `--line`, the left bar full.

Order everywhere is by when *you* last acted on the chat (`lastUserAt`: a prompt, an answer to
its question, an interrupt), newest first; done chats sink below the rest, and a project ranks by
its newest chat. A session whose tail held no prompt of yours (boot reads only the end of a long
transcript) sorts by `lastActivity` instead of sinking. *Chat* pins were dropped the same day (projects pin, see above): sorting by
your own last touch keeps the chats you are driving on top, which is what pinning was for, and
Claude finishing a long job no longer reshuffles the list. The card still *shows* `lastActivity`;
its tooltip carries `lastUserAt`.

## State: what lives where

* **Server-side, shared across browsers and the Mac app** —
  `~/Library/Application Support/peixAIrada/state.json` (Apple's location for app data, matching the
  logs in `~/Library/Logs/`; `$XDG_STATE_HOME/peixairada/state.json` off macOS, `STATE_FILE` overrides
  both). Holds done ticks, the named projects (`projects: {id: {name, cwds, createdAt}}`) and board-side
  chat titles (`titles: {id: string}`, above every title the transcript carries) and the pinned projects
  (`pinned: [key]`, folder cwds and `c:<id>`, in display order — `PUT /api/pins` with the whole list, pushed to
  every page as a `pins` event; a deleted named project leaves it) — a `pins` key from before 2026-09-19 (chat
  pins) and a `colors` key from 2026-09-20 (board-set colours) are ignored and dropped on the next save. A done mark is `doneMarks[id] >= lastActivity`, so it expires by itself when the
  session moves. It used to be `~/.peixairada/state.json`; the server moves that file
  across on first run and the migration code can go once it has clearly run everywhere.
* **Browser-only** — `localStorage` key `peixairada-prefs`: selected project, the states shown (`filters`, an array; a
  `filter` string from before 2026-09-20 is converted on load), chat-list
  width, tools mode, fold code, sound, show-all, chat-header details fold, terminal drawer
  open/height, chat zoom (`chatZoom`: CSS `zoom` on `#log` plus xterm's fontSize, ⌘+/⌘−/⌘0), the
  projects strip (`projectsCompact`, default on — a 46px column, opened only by the » button), the chat list
  folded to a rail (`sessionsCompact`, `main.scompact`, `«` in its header; the saved width comes back on unfold,
  because the rail width lives in CSS and the inline width is cleared). The settings
  controls sit in `#settings`, a popover the cog at the strip's bottom opens (no page header since 2026-09-20:
  the Mac window's title bar carries the name; the fish at the strip's top carries the counts in its tooltip
  and greys out — `.brand.off` — while the SSE stream is down; the popover's `left` is set from the strip's
  width on open). Hovering the fish opens `#usagePop` — the same `.pop`, at the top — which fetches `/api/usage`;
  a click pins it, Esc or a click elsewhere lets it go. Searching projects from the strip opens the column
  and folds it back when the box closes (`opened` in the filter wiring; the pref is not saved meanwhile).
  ⌥⌘O opens `#pick`, a modal project picker over the same `projectList()` (capture-phase keydown on `e.code`,
  since `e.key` is `ø` with ⌥ held; the drawer's xterm never sees it). **`HOTKEYS` in index.html is the whole
  ⌥⌘ family** (2026-09-20): O the picker, T the open chat's terminal — `termAction()`, the `>_` button's own
  path, arm-and-take-over included, plus `term.xt.focus()` at the end so a second press is "put me in the
  terminal" — V a click on `#webBtn` (VS Code *Web*, the editor in the pane — not the real VS Code, asked later
  that day; the button's failure state is the report), G (GitHub; it was P for an hour) the chat's PR: `showPr()`
  with one, the *next* one when the strip under the header already shows one of them (`prbar.url` — a toggle
  with two, a cycle with more), `pickOpen('pr')` with several and none showing — the same dialog in `pick.mode`
  `pr`, rows over `s.prs` (`.pkrow.pr`, the `#prlist` columns, filtered on label and title, ⏎ = `showPr`). A
  `dialog[open]` swallows all four; no chat, or no PR, is a `note()` under the header. The button tooltips carry
  the keys (`WEB_TIP`, `KEY_T` in `termTip`). **In the app the pane is a native view with its own web views**, so
  a key pressed there never reaches the page: `installHotkeyForwarder()` in main.swift (a local monitor like
  Esc's, `boardKeys` = the same four letters, kept in step by hand) calls `window.peixKey('KeyG')`; the pane also
  covers the chat column, where a centred dialog would open under it, so the shell reports `peixPane(visible,
  left)` on every show/hide/drag and `pickOpen` adds `.aside` (the picker beside the pane, `--pane-left` wide)
  and posts `{type:'focus'}` so the board gets the keyboard back for the box.
  Verified headless on 2026-09-20: the picker on a two-PR chat, the one- and no-PR paths, ⌥⌘O still, the notes,
  the stubbed focus/terminal POSTs, and the real ⌥⌘T against a throwaway server (claude resumed in 3 s, focus
  back in xterm on the second press). The cog's popover lists every key (`.keys` in `#settings`, a `kbd` · text
  grid under a rule) — the one in-page legend; keep it in step with `HOTKEYS`, `chatZoomKey` and the app menu. The
  filter boxes are not remembered; `renderSessionList` re-renders only `#fchips`, never the box. While the drawer's terminal is live the pane is all terminal — the rendered transcript
  would be the same conversation twice — unless `show chat` split it (`term.split`, page state, reset on
  every attach); an exited terminal or a hidden drawer shows the transcript again. Keys from the lane board are deleted on load. `renderHead`
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
* **Custom properties inherit — the orange cards** (2026-09-20). `#sessions` sets `--repo` for its own edge and
  header tint, the accent on *All chats*, and every card inside without a colour of its own inherited it: an orange
  wash on colourless cards the moment the wash started reading `--repo`. `.card { --repo: initial }` (and the same
  on `#chat`) resets it; the card's inline `--repo` still wins, and the fallbacks paint `--nocolor`.
* **Flexbox squashed the cards.** `.cards` is a flex column and cards have `overflow: hidden`, so a
  full lane shrank them to 17 px. `.cards > * { flex: none }` is load-bearing — don't remove it.
* **…and let the drawer run off the right edge** (2026-09-20, "why does chat sometimes become messy"). `#term` is a
  grid with rows only, so its one *implicit* column is `auto`, whose minimum is the content's min-content — and xterm
  sets `.xterm-screen` to an explicit pixel width (cols × cell). Make the pane narrower, or the font bigger (⌘+ grows
  xterm's font), and `.tbody` could not follow: it stayed as wide as the terminal had last been, the `ResizeObserver`
  on it saw little or nothing, `fit()` measured *it* rather than the pane, and the rows ran past the pane's edge,
  clipped instead of wrapped (measured: pane 748 px, body 765, screen 759 before the fix; all three equal after, through
  narrow, wide, 19 px zoom and reset). `grid-template-columns: minmax(0, 1fr)` on `#term` and on `#chat`, and
  `min-width: 0; overflow: hidden` on `.tbody`: the same family as the header's `min-width: 0` below — a grid track's
  `auto` minimum is min-content, exactly like a flex item's. What the fix does not touch is Claude Code's own
  scrollback: Ink redraws only its live region on a resize, so lines already written stay laid out for the old width
  (the same in Terminal.app); only new output wraps at the new edge.
  **Round two, "still happening after some time, a font change fixes it" (2026-09-20, afternoon; the screenshot sat in
  macOS's screen-capture staging folder, which the sandbox cannot read, so this was worked from the code).** Two things
  found and changed, neither proven to be *the* bug: (1) the fit addon reads `getComputedStyle(parent).height/width`
  and subtracts only the terminal element's own padding — under the page's `* { box-sizing: border-box }` that is
  `.tbody`'s *padded* size, so when the remainder is short it proposes one row or column too many and the bottom row
  (or last column) is clipped by up to the padding: measured 51 rows × 15 px in a 762 px body, 3 px of the status
  line gone, always. `.tbody` is `box-sizing: content-box` now (50 rows, 12 px of slack). (2) xterm re-measures
  its cell on a display-scale change (`handleDevicePixelRatioChange`: measure + repaint, no fit) and the cell height
  rounds through the scale — `ceil(h × dpr)`, then `floor(× lineHeight)` — so the window moving to another screen,
  a monitor coming or going, the lid reopening can repaint every row at a new height while the body never resized
  and the `ResizeObserver` never fired: the grid no longer matches the body until something calls `fit()`, which
  ⌘+ does. `watchDpr()` refits on that (re-armed per change; 50 ms after, so xterm's own handler has run), and so do
  `focus` and `visibilitychange`; `fit()` sends a resize only when the numbers moved. Measured on a throwaway
  server: a rows-only shrink under an *idle* claude (a 44 px block appearing above the drawer, 50 → 47 rows) redraws
  cleanly, so that is not the trigger by itself. `window.peixDebug()` in the console (the app's web view is not
  inspectable; a browser tab on 7331 is) prints dpr, zoom, cols/rows, what fit would propose, body vs screen size,
  the socket state.
  **Round three — the screenshot, and the real cause** (2026-09-20, later that afternoon; the screenshot was on the
  Desktop this time). The status bar under the prompt showed *only the digits that change every second* — timer,
  counters — with blank rows where the rules, the labels and the first status line belong. That is a terminal rebuilt
  from a **partial byte stream**: on attach the socket replays the server's `t.chunks`, capped at `TERM_SCROLLBACK`
  (256 KB) and trimmed from the front *by chunk*, so the replay starts wherever the drop landed — mid-sequence, even
  (`3;153m` printed as text in the repro) — and Claude Code paints its prompt box and status bar once and then
  rewrites only the cells that change, so everything painted before the cut is simply not there. Every chat switch
  re-attaches (`syncTerm` → `attachTerm`), so a drawer that has produced 256 KB of output (an hour of status ticks, or
  one long turn) comes back broken on the next switch; a resize makes Claude repaint the whole screen, which is why
  ⌘+ "fixed" it. Reproduced on a throwaway server with `TERM_SCROLLBACK=1200`: resume, wait 20 s, hide the drawer,
  `>_` again → rules gone, lone digits. **Fix: `nudgeTerm()` in index.html** — after every attach, once the replay
  is on the wire (the socket replays before it reads anything from the page), the page sends a resize a row short
  and, 150 ms later, the true size: only the PTY changes size, xterm here does not, and Claude's repaint lands over
  the replayed screen. Two steps with a pause on purpose: a debounced handler seeing the same size twice repaints
  nothing. Verified A/B: the same repro with the nudge → the full frame within 2.5 s (probe on the socket: `50, 49, 50`
  and ~7 KB of repaint following); with the nudge's resizes dropped at the socket → the broken frame, unchanged.
  **Then the proper fix, the same evening: the server keeps the exact screen.** `spawnTerm` gives every drawer a
  headless xterm (`@xterm/headless`, `t.screen`, `TERM_SCROLLBACK_LINES` = 5000 like the page's) fed the PTY's output
  and resized with it; `attachTermSocket` sends a page the screen *serialized* (`@xterm/addon-serialize`: scrollback,
  cells with their colours, cursor, DEC modes — bracketed paste and focus reporting included) instead of the byte
  buffer. Ordering: `t.screen.write('', cb)` resolves once everything queued is parsed, and output arriving meanwhile
  waits in `ws.hold` and follows the snapshot; the exit notice too. The byte buffer (`t.chunks`, `TERM_SCROLLBACK`)
  is only the fallback without the modules — and `mac/build.sh` now strips only the client xterm packages from the
  bundle, not `@xterm` whole. Verified on the throwaway server with the nudge's resizes dropped at the socket: the
  re-attached screen complete, scrollback and all — the control that stayed broken an hour earlier. The nudge stays
  as belt and braces (a repaint after attach costs nothing). Two traps in measuring this: Claude Code stops rendering while the terminal
  reports focus lost, and a headless page's `focus()` is not a focus — `Emulation.setFocusEmulationEnabled` first,
  or the repaint never comes and the timer freezes; and a *chat switch* as the re-attach resizes the drawer by itself
  (the other chat's reply box shows under it → RO → 50 → 48 → 50 = a real SIGWINCH), so it repairs the screen with or
  without the nudge — hide + `>_` is the clean re-attach.
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
* **The first launch after `launchd.sh install` showed "Could not reach the server on port 7331: … (NSURLErrorDomain
  error -999.)" instead of the board** (2026-09-20). -999 is `NSURLErrorCancelled`: WebKit reports a navigation that
  a newer one replaced as a *failure*. At launch the app loads the "Starting the server…" page and then asks whether
  a server answers; with the agent there the answer is yes within milliseconds, `web.load(kURL)` cancels the
  still-provisional page, and `didFailProvisionalNavigation` turned the cancel into the error page — whose own load
  cancelled the board's in turn, so the board never came up, and the watchdog, seeing a healthy server, never acted.
  While the app spawned its own server the wait was ≥ 250 ms and the race never showed. `isCancelled()` in
  main.swift now drops -999 in every navigation-failure callback, the pane's included. An app already stuck on the
  message recovers with View → Reload (⌘R).
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
* **The working ring is the project's colour, and bold.** `.card.working::before` paints `var(--repo)` (the
  card's inline `--repo`) as a 3px comet, arc 45→92 %, 1.4 s round, over a `box-shadow` glow in the same
  colour; `--working` amber is only the fallback for a card without a project colour. Until 2026-09-20 it was
  always amber and 2px, which read as a hairline.
* **A chat's PRs are rows under the header (`#prlist`), not chips in it** (2026-09-20): state · `repo#n` ·
  the whole title · age, six rows then *… n more* (`state.prsAll`, reset per chat). `#chat` has six explicit
  grid rows — `#prlist` is row 2 — and `.termmax` repeats them; a new block in the chat pane means touching
  both lines, or it lands in the wrong row silently.
* **Pin the Swift deployment target.** `swiftc` without `-target` stamps the binary with the
  *toolchain's* default OS, not this Mac's: on 2026-09-19 a beta Xcode wrote `minos 28.0` on a 27.0
  machine and LaunchServices refused to open the app (`-10825`, `kLSIncompatibleSystemVersionErr`)
  — after `build.sh install` had already deleted the old one, so the board was simply gone. A CLI
  run from the shell skips that check, which is why `makeicon` still worked. `build.sh` now passes
  `-target <arch>-apple-macosx$MIN_OS` and puts the same number in `LSMinimumSystemVersion`;
  `otool -l <binary> | grep -A4 LC_BUILD_VERSION` shows what a binary actually says.
* **VS Code chats can be taken over — the 2026-09-19 "the extension respawns its claude" finding was a
  misread** (2026-09-20). Re-measured on 2.1.278 with the extension host log open (`~/Library/Application
  Support/Code/logs/<run>/window<n>/exthost/Anthropic.claude-code/Claude VSCode.log`): the extension launches
  a claude when a *tab mounts* a chat — the sessions list, the `/open` URI for a chat with no tab yet, a window
  restore — and can do so twice for one chat (two `claude-vscode` pids on one session id were already in the
  registry for two other chats); it never respawns one that died. SIGTERM on the process behind the tab in
  front: `Closing Claude on channel …`, the `exited with code 143` error, nothing for 60 s; the same for a chat
  in the background; the same after a real take-over from the board. Both "respawns" of 2026-09-19 sit in that
  log right after a `webview_focused` + `list_sessions_request` (the sessions dialog) and after the panel
  switching back to the chat — the user reopening it. What tripped the first re-test here: a URI open during
  VS Code's window restore mounted the chat twice, so the second process looked like a 3 s relaunch of the
  first; and the URI for a chat whose tab already exists (dead process or not) only focuses it — no launch, no
  log line — so a chat can only be re-mounted by hand. Consequences in the code: `rivals` on the summary, the
  take-over on any live chat, the red bar with *end it*, the composer and terminal on stale VS Code chats.
  Kill nothing to test this again; the log above answers first.
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
* **Shift+Enter in the drawer sent the prompt** (fixed 2026-09-20). xterm.js emits the same `\r` for
  Shift+Enter as for Enter; only the terminal can make the two differ, and Claude Code's `/terminal-setup`
  tells us what it wants: for VS Code's terminal (xterm.js as well) it binds Shift+Enter to send
  `ESC CR` (`"\u001b\r"`, the Option+Enter sequence; `args:{text:"\x1B\r"}` in the 2.1.278 binary). The
  drawer's `attachCustomKeyEventHandler` sends that itself on the keydown and returns false for the
  keypress too — a custom handler that refuses the keydown leaves `_keyDownHandled` unset, so xterm's
  keypress path would still put the `\r` through. Verified against a real claude in a PTY: `❯ hello` /
  `  world` on two lines, nothing submitted. `macOptionIsMeta: true` is what makes Option+Enter the same
  newline, so both work.
* **A Claude session in a drawer dies with the app — so `build.sh install` must never run plainly from
  one.** The install quits the app, the app's server owns every drawer PTY, and the SIGHUP lands on the
  script itself between the `quit` and the `cp` — after the `rm -rf` on a bad day, with no app left in
  /Applications. Since 2026-09-20 the script notices it is in a drawer (the environment inherits
  `__CFBundleIdentifier=net.peixairada.app` from the app) and re-runs itself under `nohup` with stdin,
  stdout and stderr off the PTY, logging to `$TMPDIR/peixairada-build.log`. The detached copy is marked
  by the `--detached` *argument* — the first cut used an env var, and `open` passes the caller's
  environment to the app, the app to its server, the server to every drawer shell: the very next install
  from a drawer saw the marker, ran inline, quit the app and was killed at `sleep 1`, install undone
  (the old app survived only because the kill came before the `rm`). The chat in that drawer still
  ends: its transcript is on disk and complete up to Claude's last *written* turn, and the board offers
  `>_` (`claude --resume <id>`) once the app is back. The right order for a session that is itself in a
  drawer is therefore: finish the work, write the notes and the recap *first*, and run the install as the
  very last action — anything Claude is doing when the app quits is lost. `GET /api/terminals` on 7331
  says which chats are in drawers before you pull the plug on them. With the launchd agent in place the
  app's quit no longer matters — the drawers hang off the agent — and the same care moves to
  `scripts/launchd.sh restart`; `launchd.sh` detaches itself when `PEIXAIRADA_DRAWER` (set by `termEnv()`
  in every drawer shell) or the app's bundle id is in the environment; `build.sh` only on the bundle id, which a
  drawer shell inherits only while the *app's* server owns it — under the agent an inline install from a drawer
  is harmless (2026-09-20: it quit and reopened the app under this very chat, which did not notice).
* **"peixAIrada was prevented from modifying apps on your Mac"** — App Management, 2026-09-20. Two writers
  touched `/Applications/peixAIrada.app`: the server's unconditional `chmodSync` on node-pty's spawn-helper
  at every start (a chmod to the *same* mode is still a write), and the install itself, run from a drawer
  and therefore attributed to the app. An ad-hoc app has no team, so even its own bundle is "another
  developer's app" to TCC, and the grant toggled on in System Settings is keyed to the signature — a new
  cdhash every build — so each install dropped it. Fixes: the chmod runs only when the bit is missing, and
  `build.sh` signs with the keychain's Apple Development identity when it finds exactly one, which gives a
  stable designated requirement and a team (an app may modify apps of its own team). The first signing asks
  for the key (*Always Allow*); notifications may ask once more, the identity being new to TCC. tccd's
  decisions are private in the unified log, so this was reasoned, not read — `log show` showed nothing.
* **The app ships its own node** (since 2026-09-19). `build.sh` copies the node on PATH — the one
  that ran `npm install`, so node-pty's addon matches its ABI — into `Contents/Resources/node`, and
  the app runs that. The old search (an interactive login shell to get mise's PATH, scrubbing
  iTerm2's shell-integration escapes off its output, a fallback list of install layouts, a
  UserDefaults cache) is gone with the bugs it kept growing; `PEIXAIRADA_NODE` still overrides.
  Rebuild after switching node versions, and after `npm install` — `node_modules` is copied too.
* **Attaching a file is typing its path** (2026-09-20). Claude Code takes a file as an `@` mention — `@dir/file`,
  a space as `\ ` (how the CLI writes one itself: `"@"+w.replaceAll(" ","\\ ")` in the 2.1.278 binary) — and reads
  the Mac clipboard itself on ⌃V (`osascript … the clipboard as «class PNGf»`, and a copied Finder file's POSIX
  path); verified in the drawer with a PNG on the clipboard: `[Image #1]` on the prompt line. So a drop is a path
  typed into the drawer, or into the reply box on a stale chat (`attachPaths()` in index.html; a note when there is
  nowhere for it). In the app the shell sees the pasteboard: `BoardWebView` in main.swift takes a drag carrying file
  URLs before WebKit hears of it — at *every* `NSDraggingDestination` step, or WebKit is told about a session it
  never started — and calls `window.peixDrop(paths)` / `peixDragging(on)`; a web page only ever gets the bytes, so
  in a browser the page uploads them — `PUT /api/attach?session=&name=`, raw body, saved under
  `<state dir>/attachments/<chat id>/` (name kept, deduplicated, `..` neutralised, never cleaned up) — and types
  the saved path. ⌘V with an image: the drawer's capture-phase `paste` handler sends ⌃V (`\x16`) for claude in the
  app (same Mac, same clipboard) and uploads in a browser; the reply box uploads. `#chat.dropping` is the dashed
  outline while a file hovers. Not driven by a script: no headless harness reaches an `NSDraggingInfo` — the first
  real drag shows as `drop: n file(s)` in `~/Library/Logs/peixairada-app.log`.
* **The pane keeps a web view per page, and a chat's pages come back with the chat — one tab each** (2026-09-20).
  One view per tab was reloaded on every switch: the web button on chat B loaded B's folder into the editor view,
  and back on A it loaded A's again. `openPrPane(url, key:)` keeps a `WKWebView` per `key` (`gh:<url>`,
  `ide:<url>` — a PR, a folder's editor), created and loaded once. Later that day the two fixed segments (GitHub,
  VS Code) became **a tab per page of the current chat**: `tabKeys: [String]`, one segment each, `repo#n` for a PR
  URL (`paneLabel`), *VS Code* for the editor, a disabled "—" with none; `setTabs(keys, select:)` rebuilds the
  `NSSegmentedControl`. The page remembers what it opened from where — `state.paneGh` per chat id is `{list, cur}`,
  every GitHub page in the order first opened and the one last shown; `state.paneIde` per cwd — and `syncPane()`
  posts `{type:'chat', id, github: [keys], current, ide}` on every switch; `setPaneChat` rebuilds the tabs over
  the chat's views without loading (the tab that was showing stays on top if it is one of them, else the chat's
  last PR), shows the pane for a chat with a page and hides it for one with none — unless × or Esc closed it on
  that chat (`paneClosedFor`; an open from the page clears that). `openPrPane` appends a GitHub key before the
  editor's and replaces the editor's. `paneViewsMax` (8) views stay alive, least recently shown and not a tab
  first to go — an editor is a whole workbench. `currentWeb` is optional; no page shows `panePlaceholder`.
  `tellPane()` reports visibility and the pane's left edge to the page (`peixPane`) from every show, close,
  chat switch and grip release. Type-checked and installed, not driven — no harness reaches the pane.
* **GitHub cannot be iframed** (`frame-ancestors 'none'`), so the app's PR pane is a second
  `WKWebView` laid *over* the board's right side (a plain container with Auto Layout, a `PaneGrip` on
  the pane's left edge for dragging; `paneWidth` in UserDefaults; not an `NSSplitView`, which reflowed
  the board's columns with every drag), with its *own* delegate: the board's delegate
  sends every non-local link to the system browser, and a web view with no UI delegate silently drops
  `target=_blank`, which is why `PrPaneDelegate` implements `createWebViewWith` by loading into the
  same view. The page asks for the pane over the bridge (`{type: 'open', url, left, pane}` — `left` is the chat
  column's edge in CSS px, which are points in the board's web view, so the pane covers exactly the chat
  column; `pane` is `github` or `ide`, a web view and a toolbar tab per page so a PR never replaces the
  editor, nor another PR). Esc is handled in Swift by a local key monitor, because in full screen
  the window would otherwise take it to leave full screen: with the pane visible, Esc from the board or
  from anywhere in the pane closes it and is swallowed (the editor's own Esc is given up, by choice);
  with the pane hidden it is not touched at all and sends other
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
  `lsof -ti tcp:7399 -sTCP:LISTEN | xargs kill`. Add `USAGE=off` so a headless run never trips the keychain
  prompt. `pkill -f server.mjs` also matches the Mac app's own
  server (it runs the bundle's `server.mjs`); that is what took the board down on 2026-09-11 and left
  every button on it, VS Code first, failing with `Load failed`.
* The page's script is one IIFE, so nothing of it — `state`, `term`, `termSend` — is reachable from an
  evaluated expression; a bare `term` there is the `#term` div (named access). Drive the drawer through
  the DOM: `#termBtn.click()` spawns the claude, an `InputEvent('input', {data, inputType: 'insertText'})`
  on `#termBody textarea` types, a `KeyboardEvent` on it presses keys, and `#termBody .xterm-rows > div`
  is the screen (xterm's DOM renderer). Claude takes ~20 s to resume, so raise `TIMEOUT_MS` and wait for
  the `❯` line before typing; `DELETE /api/terminals/<id>` on the test port afterwards.
* The Mac app logs its own decisions to `~/Library/Logs/peixairada-app.log` (notification permission,
  every alert with `focused=`/`useUN=`, badge counts) — read that instead of guessing.

* **VS Code Web in the pane** (2026-09-20). `code serve-web` serves the editor with a server-side
  extension host; the Claude Code extension (`main` only, no `browser`, `untrustedWorkspaces:
  supported false`) runs there and reads the same `~/.claude`. Three things cost an evening to learn:
  the server's extensions live in `~/.vscode-server/extensions` and are installed with
  `~/.vscode/cli/serve-web/<commit>/bin/code-server --install-extension anthropic.claude-code` (the
  desktop's are not seen); the web workbench keeps *user settings and the trust decision in the
  browser profile*, not on the server — a settings.json under `~/.vscode-server/data/User` does
  nothing, and a headless run with a fresh profile is always in Restricted Mode, where the extension
  never activates — so trust is clicked once in the pane (status bar → *Trust*) and sticks in the
  app's WKWebView store; and the extension's housekeeping runs there too (it archived idle sessions
  on first start, as the desktop one does). `ensureVsWeb()` in server.mjs spawns it with the
  claude-stripped env and adopts an instance that already answers.

## Deliberately not done

* **Making VS Code's tab follow a chat continued elsewhere.** Resuming a VS Code chat from the board
  was dropped on 2026-09-19 and brought back on 2026-09-20 (see *VS Code chats can be taken over* under
  *Things that bit us*); what stays undone is the tab: the extension's only file watcher is on
  `~/.claude/sessions/`, never on transcripts, so a turn added by any other claude never appears in the
  open tab, and a take-over leaves that tab dead (the SDK reports the exit; the extension does nothing
  until the chat is opened there again). The page says so wherever it offers the take-over. The other
  direction works: a chat started here, ended, and opened with the VS Code button registers there within
  seconds (verified) and is a VS Code chat from then on; whether its tab rebuilds the history from the
  transcript was not confirmed on screen.
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
* **The Mac app is signed for this machine only, not for distribution** — with the keychain's one Apple
  Development identity when there is exactly one (`CODESIGN_ID` picks another, `CODESIGN_ID=-` forces
  ad-hoc), else ad-hoc. The identity is what keeps macOS's privacy grants across installs; see the App
  Management note under *Things that bit us*.
