# peixAIrada — decision log and hand-off

What was decided, why, and what is still open, so the work can be picked up in another session.
Newest at the top of each list. `CLAUDE.md` is the working notes (how things are built, what bit us);
this file is the *why* and the *state*. Last updated 2026-09-20 (dawn).

## Decisions of 2026-09-20, dawn — ⌥ composes again in the drawer

* **⌥ over a digit or a punctuation key types the character macOS composed** (Ricardo: "why can't I write ‘at’ symbol
  with ‘option + 2’ combo on claude chat?"): on a Portuguese layout `@` *is* ⌥2, and the drawer swallowed it.
  `macOptionIsMeta: true` is why — xterm takes the third-level-shift path only when `isMac && !macOptionIsMeta`, and
  with the flag on it also skips the composition helper, so every ⌥ chord left as `ESC <key>`: ⌥2 went out as `ESC 2`
  and the one character Claude Code asks for by name could only be pasted. The flag is not expendable — it is what
  makes ⌥Enter a newline and what gives readline its ⌥b / ⌥f / ⌥⌫ — so the split is by key rather than wholesale:
  the custom handler sends `e.key` (the browser hands the composed character over already) for `Digit*` and the
  punctuation codes, `ALT_COMPOSES`; ⌥ over a letter is still Meta. A dead key reports `'Dead'`, longer than one
  character, and falls through to xterm untouched. `scripts/scenarios/drawer-altkeys.mjs` types ⌥2 then ⌥b and reads
  `❯ @b` off the drawer — the fake claude drops a lone ESC and echoes the rest, so the two behaviours land side by
  side on one line; with the branch disabled the scenario times out waiting for the `@`, which is how we know the
  character is ours and not something else's.

## Decisions of 2026-09-20, the small hours — ⌥⌘O is a new oracle chat, the project picker is ⌥⌘P, acme goes black, /focus from the header

* **A focus-view toggle in the chat header** (Ricardo: "add a toggle on the chat header for toggling focus mode on the
  current live session"): Claude Code's `/focus` — prompt, summary and reply, the steps hidden — has no keybinding and
  no API, so the only way in is the drawer's own keyboard. The ◎ button types `/focus` into that chat's holder and
  then reads the session's answer back off the screen (`Focus view enabled` / `disabled`), which is what lights it:
  the board never claims a state it was not told, and the guess dies with the process. It shows only while a claude
  runs here — the point is the live session — and from the zsh tab it shows the claude session first rather than type
  a slash command into a shell. Checked twice: `scripts/scenarios/focus-view.mjs` drives it end to end against the
  fake claude (which learned `/focus`, the same line the real one prints), and against the **real** CLI on the live
  board — a stale chat of mine resumed in a drawer, toggled on and off, the terminal ended after.
  **Then the other direction** (Ricardo, of a `/focus` typed in the drawer itself: "do it"): every attach reads the
  newest such line off the screen and takes the button from it, so the board catches up with a session that was
  toggled by hand. It polls while the snapshot is still being written, and a session that never printed the line —
  `"viewMode": "focus"` in settings, or the line long scrolled past — leaves the button where it was, which is the
  same rule as before: nothing is claimed that the session did not say. The scenario now types `/focus` into the
  drawer as a hand would, checks the button stays dark, and re-attaches (⌥⌘T, ⌥⌘C) to watch it light by itself.
* **A black card's clauding light is white** (Ricardo: "when it acme card, the background is black and we don't
  notice the border animation because it's also black"): the light that runs round a clauding card — and the glow
  under it — is the card's own colour, which on the black card was black on black. Both now read `--ring`, the
  colour unless the card under them is dark: white in the dark theme, and white in either theme while the card wears
  the solid tint (hovered, open). On the light theme's pale wash the black light still reads best, so it stays.
  Looked at in both themes with the ring forced on a plain, an open and a done card.
* **The `acme` folder is black** (Ricardo: "make acme folder special by making it's cards all black"): the root
  the repos sit under is a project of its own — the chats that belong to no repo run there — and it had no Peacock
  colour, so it wore the colourless gray like any unnamed folder. `PROJECT_COLORS` gives it the board's black, by the
  shown name, the way `PROJECT_ICONS` gives oracle its crystal ball; Peacock still wins if it ever speaks for that
  folder. The black flows everywhere a colour does — the strip tab, the cards' wash and edge, the list's edge, the
  chat header's gradient (white ink by `inkOn()`). One thing needed a rule of its own: the open and hovered card is a
  *solid* 55 % tint of the colour, and 55 % of black over a light panel is a mid-grey with the page's dark ink on it —
  unreadable. `.card.black` makes that tint the black itself and redefines `--ink`, `--muted`, `--snip-claude`,
  `--you` and `--accent` on the card: custom properties inherit, so title, snips, times and the two speaker marks
  follow in one rule, and in the dark theme they are the values they already had. Looked at in both themes, on a
  plain, an open and a done card. The `--all` CSS token went with it: black now has one spelling, `BLACK` in the
  script, which `inkOn()` can also read (a `var()` is opaque to it).
* **⌥⌘O opens oracle's environments and nothing else** (Ricardo: "the O hotkey should open oracle prompt directly,
  to select the env and open a chat"): `hotOracle()` is the ⌥⌘N flow with its first steps already answered. It takes
  the project `ORACLE` names in `projectList()` — a folder of its own, a pin, or a named set of folders, always by the
  name the board shows, the same key `PROJECT_ICONS` hangs the crystal ball on — and calls the same `newChatIn()`, so
  the picker opens on the eight `task <env>` launchers of oracle's Taskfile and ⏎ starts one. A name over several
  folders asks which folder first; oracle off the board altogether (nothing there in 30 days, nothing pinned) is a
  note saying ⌥⌘N is the way in. Nothing else about the flow changed — one route to a new chat, not two.
* **The project picker moved to ⌥⌘P** (asked before touching O; Ricardo chose to keep it rather than drop it): the
  same dialog over the same list, one letter over. The cog's legend, `boardKeys` in main.swift (the shell forwards the
  chord from the pane — the app was rebuilt) and the hotkeys scenario moved with it.
* **The environment step names its folder** — *New chat in oracle — which environment?*: coming through ⌥⌘O nobody
  ever said which folder, so the step has to. `PICK_HINT.env` is a function of the picker's ctx now; the ⌥⌘N flow
  reads better for it too.
* Checked end to end in `scripts/scenarios/hotkeys.mjs` (extended): the no-oracle note, ⌥⌘P the project picker, a
  pinned `…/oracle` folder — a pin is how a folder reaches the board without a chat in it —, ⌥⌘O opening straight on
  the environments with the folder in the hint, ⏎ posting `{cwd, task: 'production-workload'}`, and the cog's ten
  chords in order. And on the live board headless: ⌥⌘O listed oracle's eight clusters, screenshot looked at.

## Decisions of 2026-09-20, later that night — three tweaks: the fish swim, hover is the open tint, the veil runs down

* **The fish swim** (Ricardo: "animate ascii fish separator"): the line slides right one fish per 2.4 s — six
  characters, letter-spacing included, so the loop is seamless — and starts with a negative delay taken from the
  clock, because the list re-renders on every SSE update and a fresh animation would jolt the school each time. Off
  under reduced motion.
* **A hovered card takes the open card's solid tint** (Ricardo: "the hover cards, make the background as if it was
  select"), keeping the full-colour border and halo; the open card still adds its ring.
* **The header's veil runs down as well as across** (Ricardo: "the header gradient, make it from top to bottom
  also"): a second, lighter layer (`--rover2`) from transparent at the top to the veil at the bottom, so the
  bottom-right corner is the deepest and the title at the top left the purest.
* **The fish stuttered every few seconds** (Ricardo: "the animation for the fish stutters after a few seconds"): the
  list is rebuilt by `innerHTML` on every SSE update, so the separator — and its CSS animation — was new each time,
  and the negative delay from the clock could not hide the restart. Now one node (`fishEl`) is kept and swapped in
  for a stand-in after every render, and its animation is the Web Animations API's with `startTime = 0`: it carries
  on while the node is out of the document and is phased to the document clock, so the same fish is at the same
  place whenever the node comes back. Measured through four re-renders: the same node, one animation, x on the
  clock to a tenth of a pixel.
* **⌥⌘G with several PRs is always the picker** (Ricardo: "always open the menu to choose the PR when there's more
  than 1, even if the web tab is already open"): the toggle/cycle on a second press is gone; the picker marks the
  one showing *current* and the other rows open theirs.
* **⌥⌘V is gone** (Ricardo: "remove the V external vscode shortcut, leave the button up top only"): the real VS Code
  is the header's focus button only — `hotCode` and the cog row went, `boardKeys` in the shell lost `v` (the app was
  rebuilt), the hotkeys scenario checks the key hits no route.
* **The open and hovered cards' tint is 55 % of the colour**, up from 36 % (Ricardo: "make the active/hover
  background effect even stronger"); checked in both themes, the text still reads.
* **`/clear` in the drawer closed the chat** (Ricardo: "I'm trying to /clear and it closes this chat … and doesn't
  really clear and I still have a lot of context"): Claude Code's `/clear` keeps the process and takes a new session id
  — the registry file for the pid says so — and the server already re-linked the holder to it (`linkTermToRegistry`),
  which took the drawer away from the old chat; the page only followed a holder to its *first* chat. Resuming the old
  card then started a second `claude --resume` with the old context — the "not cleared". Now the page follows the
  holder to whatever chat it runs (the `terminal` event), the drawer stays attached, and `openSession` no longer
  detaches while the new chat's summary is still on its way. The fake claude has a `/clear` that does the same;
  `scripts/scenarios/drawer-clear.mjs` checks it end to end: one process, the new chat open, the old one a stale card.

## Decisions of 2026-09-20, late night — five more: pages as tabs, the cards' own colour, the header's gradient, ⌥⌘↑↓, fish

* **The chat's pages are tabs of the chat** (Ricardo: "I like the row that opens when there's a chat and a shell open
  - can we make the same mechanism for the github and for vscode? so 4 tabs. maybe the a tab per PR also, instead of
  being inside the browser? ESC should still navigate to chat."): `#ptabs` lists *chat* (*claude* while it runs
  here), *zsh*, a `repo#n` tab per GitHub page the chat opened and *VS Code* for its folder's editor; the strip shows
  while there is more than the chat. The app's pane lost its own toolbar and tabs: it is the chat column below the
  strip, placed where the page says (`{type:'pane', id, keys, show, left, top}`, once per change and again when the
  geometry moves), and ‹ › ↻ ↗ moved into the strip (`{type:'nav'}`). Esc with the pane up goes through the page
  (`peixKey('Escape')` → `hotEscape()`): the chat tab, the pane hides, the pages stay; × on a tab forgets its page.
  Each chat comes back on the tab it was on. Dropped with it: the pane's grip and remembered width (it *is* the column
  now — resize the column), its title label, the "closed on this chat" memory (`paneClosedFor` — the tab is that), the
  `open`/`chat`/`toggle` messages. The PR strip under the header stays: it is the PR's facts, the tab is the page.
  Verified in Chrome with the bridge faked (`scripts/scenarios/pane-tabs.mjs`: five tabs, the messages, the geometry,
  Esc, ×, the tab coming back, the zsh's tab going); the native side typechecks and the app was rebuilt — the pane's
  placement under the strip is the part only the real app shows.
* **Cards enhance their own colour on hover and when open** (Ricardo: "hovering and selecting a cards still show a
  orange border. change it to just enhance the border with its own color."): hover is the full colour with a 1px halo
  outside, the open card a 2px ring of it over its border — three pixels of its colour — on the solid tint. The
  accent is off the cards.
* **The chat header is a gradient** (Ricardo: "the top head of the chat has a solid background color. make it a
  gradient"): the colour at the left, and to the right a veil *away* from the ink — black under white ink, white
  under dark (`--rover`, set by `tintChat`) — so the buttons at that end keep their contrast whichever ink `inkOn`
  chose. A fade towards the panel would have put white ink on a pale blue.
* **⌥⌘↑ / ⌥⌘↓ walk the list** (Ricardo: "cmd option up/down arrow should chat the card selected" — change the card
  selected): the chat above or below as the list stands, filters and order included, the ends stop; from the pane
  too (`hotkeyCode()` maps the arrow key codes to the page's `e.code`). The cog lists it.
* **The separator is a school of ascii fish** (Ricardo: "the divider for card looks good, maybe tweak it to be more
  like ascii fishes instead of barbewire, to be more thematic"): `><>   ><>   ><>` in monospace, muted, clipped to
  the column; the wire's SVG mask is gone.
* **A fixture finding on the way**: `drawer-reattach` was red before any of this was touched — the fake claude erased
  its own banner when the drawer shrank by the strip's two rows on re-attach (`\x1b[J` from the live region's new
  top, which had moved above the banner). It now scrolls up by the difference before it repaints, as a terminal app
  would, and clears the old region's rows on a grow. The scenario's scrollback check is unchanged and passes again
  (a snapshot of 862 chars, the banner in it). Noted under *Verifying* in CLAUDE.md: a red drawer scenario can be the
  fake's geometry, not the drawer's.

## Decisions of 2026-09-20, late — six more: the repo on G, sub-agents, the wire, borders, the automatic drawer, the zsh tab

* **⌥⌘G with no PR opens the folder's repository** (Ricardo: "when there no PRs in the chat, make the G hotkey open
  the github page of the project if it exists"): `pollRepos()` asks `git remote get-url origin` once per folder the
  board knows (the Peacock set), hourly after, and ships the GitHub URL in the snapshot and as a `repos` event;
  `hotGh` opens it the way a PR opens (the pane in the app). No remote → the note says so.
* **A sub-agent at work keeps the chat clauding** (Ricardo: "seems like sub-agents don't make the animation for the
  card work?"). Found: Claude Code writes each sub-agent's transcript to `<slug>/<id>/subagents/agent-*.jsonl`
  (every line `isSidechain`, a `.meta.json` with `requestShape: "background"` or not), which the server ignored. A
  foreground agent holds the main transcript at a tool_use, so the chat stayed working; a *background* one answers
  at once and the main turn ends with `end_turn` — the card went ready, ring off, with agents still working.
  `scanAgents()` counts an agent as running while its file's last line is not an assistant end_turn and it wrote
  within `AGENT_STALE_MS` (15 min; a killed agent never writes its end_turn), on their fs events and every 10 s
  for alive chats; the summary's status is `working` while any runs, `agents` carries the count (a chip on the
  card), and the 'reply' alert waits for them. `test/agents.test.mjs`.
* **Clauding on top, then ready, one barbed wire between them** (Ricardo: "I only want 1 separator on 2nd column
  for live cards and ready cards. something like ====== or barb-wire"). One rule needs a group above it, so the
  order changed: working › ready › done, inside each group your last touch, newest first — a finished job now moves
  its card into the ready group, where its last prompt puts it (the morning's "never reshuffles" gave way to this;
  the group move is the one reshuffle). The wire is an SVG mask (`.gsep`, a twist every 24 px) coloured by the
  theme, put there once by `renderSessionList`.
* **Cards: the colour on every side** (Ricardo: "cards have a left border more visible than the rest … make it
  equal symmetrically"): a 2 px border in the project's colour all round, the 5 px left bar gone; a hover paints
  the frame in the accent.
* **The drawer is automatic** (Ricardo: "remove the row at the top of the chat for 'claude --resume …' and the
  button on the right 'show chat | end | hide'. all of this is automatic now. either the session is live and
  we're in a claude session, or we rendering the chat while we don't resume. also marking a card as Done, should
  kill/archive the claude session to not waste resources"). The drawer's header, hide, end, show-chat, the split
  and its drag, `prefs.termOpen` and `termHeight` are gone: the drawer is the pane's body while the chat runs here
  and goes when the process exits (`termEnded`; the transcript is the pane again, the composer with it);
  `syncTerm` decides on every open and update. The `done` route ends the chat's processes — the drawer's holders
  (claude and zsh) and a claude live elsewhere (SIGTERM, not awaited; the registry notices). The done tick is
  still offered only to idle or stale chats.
* **⌥⌘T is a zsh tab beside the chat, inline** (Ricardo: "T -> the zsh terminal should be inline, not opening in
  iterm" — the iTerm route of the previous round is gone). A holder with `shell: true` runs `zsh -l -i` in the
  chat's folder (`POST /api/sessions/:id/shell`, `shellOf()`, `s.shell` on the summary, one per chat); the pane
  grows a tab strip (`#ptabs`, a grid row of its own — `.termmax` repeats it) only while a zsh lives: [claude|chat]
  and [zsh ×]. ⌥⌘T starts or shows it, ⌥⌘C brings the claude session back, `exit` or the × ends it; the tab a chat
  is on is page state. A claude run inside the zsh tab registers like any CLI run and shows up as a chat of its
  own. Verified: `test/terminals.test.mjs` (a zsh holder answers `echo`, one per chat, DELETE ends it), the four
  scenarios (`drawer-reattach` now re-attaches through the zsh tab and back — the clean re-attach since hide is
  gone; the tab strip costs the drawer a row, so the fake's banner moves into scrollback and the check reads
  `peix.buffer()`, the whole buffer), and the live board.

## Decisions of 2026-09-20, night — the hotkeys, the header in the project's colour, the list's looks

* **The hotkeys are ⌥⌘, one letter per place the open chat lives** (Ricardo: "for hotkeys with command + control —
  T open terminal · E editar inline aka vscode web · V real vscode · G github · C claude/chat session", then
  "sorry, it should be option+command and not control+command · C was supposed to be the claude session. the chat
  is only useful when there is no live session, so remove all the extra complexity · does T work? I want a zsh
  like a new tab on iterm"). A first cut had moved the chord to ⌃⌘ and read C as "show the chat" (the pane closed,
  a filled drawer split, the keyboard on the transcript, a `pane` bridge message); both undone. `HOTKEYS` is
  now T `hotShell` (new: `POST /api/sessions/:id/shell` → `open -a iTerm <cwd>`, which iTerm answers with a new
  tab whose zsh starts in the folder — Terminal takes the same call; no AppleScript, so no Automation grant is
  asked of the launchd agent), E `hotVsCode` (the web button's route), V `hotCode` (the focus button's — the real
  VS Code, new), G `hotGh`, C `hotClaude` (the `>_` button's path: the drawer shown or started, the take-over
  armed — what T used to be), and O the project picker, unchanged. `boardKeys` in main.swift is the six letters.
  Verified headless (`scenarios/hotkeys.mjs`: the shell, vscode-web, focus and terminal routes hit by T, E, V and
  C; ⌃⌘ doing nothing; the cog's six entries), the route for real on a throwaway server (a zsh under iTerm's
  `login` with this checkout as its cwd), the re-attach scenario re-run, the app rebuilt and installed.
* **The chat header is the project's colour** (Ricardo: "make the chat header on top the same color as the
  project"). Not the 18 % wash the chat column's header wears — the colour itself, Peacock's title bar in effect,
  with an ink that reads on it: `inkOn()` uses Peacock's own rule (tinycolor's brightness, `(299r + 587g + 114b) /
  1000`, light from 128) rather than WCAG luminance, which would put black on the azure `#007fff` that Peacock
  paints white — the board and the VS Code title bar of the same folder agree. `tintChat()` sets `--repo`,
  `--rink` and `#chat.tinted` (CSS cannot ask whether a custom property is set); every control in `.shead` is
  redrawn in `--rink` — muted text at 78 %, borders at 40 %, `.on` and `.take` a 14 % pill — and an armed or
  failed button keeps `--needs` on a panel-coloured pill so it reads on a red project too. `inkStyle` is gone:
  the repo name used to wear the colour it now sits on. Checked on an orange (dark ink) and a blue (white ink) chat.
* **The open chat's card is a solid tint** (Ricardo: "the 2nd column card that active, a more solid background,
  so we can notice it better"): `.card.active` paints a flat 36 % mix of the colour over the panel under the
  accent outline it already had; the others keep the 22 → 6 % gradient wash.
* **A rule and more air where a clauding card meets a ready one** (Ricardo: "a little horizontal space between
  clauding cards and ready cards", then "make the gap … a bit bigger, or some extra visual cue"): the working
  ring's glow spreads 18 px into a 7 px gap. `renderSessionList` puts a `.gsep` rule — the projects column's
  pinned line again, a shade darker — between a working card and a non-working neighbour, either way round; with
  its margins the gap is 23 px. The sort is untouched (your last touch, newest first — Claude finishing never
  reshuffles), so the rule sits once under the clauding cards when they are on top, as they usually are since you
  just wrote to them, and at every transition when they are not. Grouping clauding on top would be a one-line
  sort change and a reshuffle on every finish; not done.
* **"All chats" is ALL, in black** (Ricardo): the row, the strip's tab, the swatch and the chat column's header
  say ALL and paint `--all` (`#000` in both themes — an off-white tab would carry white text) where every other
  project paints Peacock's; it borrowed the accent before.
* A first run of `drawer-reattach` failed on "the status bar is whole" — the fake's two lower status lines missing
  from the re-attached screen — while the tree was being edited under it; the re-run on the finished tree passed.
  A flake to watch, not chased.

## Decisions of 2026-09-20, evening — the harness, and the drawers moved into holders

* **"Do everything" — the whole quality-and-harness list, on Ricardo's word.** Built and committed one item per commit:
  * **A fake claude for tests** (`scripts/fakeclaude.mjs`): the CLI's shapes the board depends on — registers in
    `$CLAUDE_DIR/sessions`, appends transcript lines, a prompt box and a status bar whose timer rewrites only its
    cells, a full repaint on SIGWINCH — and none of the cost: instant, deterministic, no tokens, and it refuses to run
    against the real `~/.claude`. Every drawer test today had resumed a real August chat and waited for it.
  * **Fixtures, a throwaway server, a scenario runner** (`scripts/fixture.mjs`, `lib/testserver.mjs`, `lib/cdp.mjs`,
    `scripts/scenario.mjs`, `scripts/scenarios/`): the multi-step browser checks that had been rebuilt in a scratchpad
    five times and lost — drawer re-attach, a server restart under a drawer, the hotkeys, the drawer's geometry — are
    files in the repo, each starting its own server on a free port with its own state dir and cleaning up terminals,
    holders and temp dirs on exit. Focus emulation is on by default (Claude Code stops rendering without it).
  * **`npm test`** (`test/`, `node:test`, no dependencies): the transcript folder, PR bookkeeping and titles, project
    input, the Peacock JSONC edit, and the drawers end to end over the API with the fake — holder, snapshot, restart,
    adoption, input, kill. `server.mjs` boots only when run as the program and exports its pure parts. The first run
    caught a real bug: a prompt whose text starts with a `<system-reminder>` block was judged synthetic before the
    block was stripped, so the prompt after it was dropped — fixed (strip first, judge what remains).
  * **`npm run check`** (`scripts/check.sh`): node --check everywhere, the page's inline script compiled
    (`scripts/check-page.mjs`), the shell scripts parsed, `swiftc -typecheck` at the deployment target. Ten seconds.
  * **Level two, built: a holder per drawer** (`lib/termhold.mjs`). The PTY and the exact screen (headless xterm)
    live in a small detached process with a Unix socket under `<state dir>/terms`; the server proxies pages to it,
    adopts the holders it finds on boot, and a `scripts/launchd.sh restart` leaves every chat running. The
    snapshot protocol numbers output (`seq`) and says what it already contains (`upto`), so a page attaching while
    output flows gets the screen and then only what followed. Verified by the end-to-end test and the
    `drawer-restart` scenario: server killed under a drawer, new server adopts it, the page reattaches and types.
    The drawers of the server *before* this change still end with its restart — once; the next ones do not.
    `restart --after N` waits so a recap can land first; the drawer environment keeps `CLAUDE_DIR` (only the
    nesting markers are stripped — the fake needs it, the CLI ignores it).
  * **Observability**: terminal summaries carry pid, holderPid, cols, rows, attached pages, whether the holder is
    connected and the last snapshot's size; `window.peix` on the page is a read-only window on its closure (state,
    session, prefs, term, screen) for the console and the runner. The board's web view was *already* inspectable
    (main.swift sets it, as it does the pane's) — the earlier note saying otherwise was wrong and is gone.
  * **Section maps** (`npm run map`, `scripts/map.mjs`) at the top of `server.mjs` and `public/index.html`,
    generated from the files' own banners — names, not line numbers, so they do not drift.
  * **Notes reshaped**: `CLAUDE.md` is current invariants, one bullet each, under stable headings; the stories moved
    here verbatim (see *Findings* below). Commits per item from now on (`9560f90` bundled the day before this).
  * The app rebuilt with `lib/` in its bundle; the live server restarted last, `--after 20`, from this drawer.

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
  notifications, hence none while the app is closed. **Level two — built that evening (`lib/termhold.mjs`, see above); as designed here:** a small holder process per drawer
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
* **…and with the pane hidden, the page takes Esc itself when it has something to close** (2026-09-20, evening).
  The project and PR pickers closed on Esc and the app left full screen with them: a `<dialog>`'s own Esc is not
  reported to WebKit as handled, and an unhandled key climbs to the window, whose full-screen Esc is exactly that. The
  page now closes the open dialog, the settings popover or the usage card in a capture-phase handler and calls
  `preventDefault()`, which is what makes WebKit report the key handled and stop there; with nothing to close the key is
  left alone, so the filter boxes, the rename box and full screen keep theirs. Not a second Swift monitor: the page
  knows what is open, the shell does not. Verified for the close and the `defaultPrevented` in the hotkeys scenario;
  the full-screen half follows from WebKit's rule and was not driven in the app.

### The board

* **A plain edge on ready cards, ⌥⌘←/→ for the tabs, oracle's crystal ball, code folding per chat** (2026-09-20, late
  evening, Ricardo's list). The 2px border in the project's colour, asked for earlier that day, now stays only where a
  card is special — clauding (under the ring), hovered, open; the rest are the wash with the panel's line. ← and → walk
  the strip's tabs through `openTab`, the same function the tab click uses (extracted for it). The oracle folder — the
  investigations project that runs claude against the clusters — wears a crystal ball next to its name wherever the name
  is written; `PROJECT_ICONS` is keyed by the shown name, so nothing is configured and a worktree of it inherits the mark.
  Ricardo asked whether Claude could collapse code: Claude Code's TUI cannot (its only collapse is ctrl+o for tool
  output; the requests for it are open issues on the CLI), so the answer is the board's transcript fold, which existed
  as one cog-wide switch and is now per chat as well — the `{ }` button in the header, `prefs.foldBy[id]` over
  `prefs.foldCode`. In a drawer the transcript is not shown, so the button matters for chats rendered here. And "simplify
  the icon on the top banner right" turned out to be the header's dot · age · ··· — three things for one fold — asked
  about, answered; the dot and its age are the details button now, the ··· is gone.
* **⌥⌘K, the chat picker; ⌥⌘N, a new chat as steps; and folders that launch claude their own way** (2026-09-20,
  evening, Ricardo's list). K fills the ⌥⌘O dialog with every chat that is ready or clauding — done ones out — across the
  projects, in the list's own order, searched by the magnifier's words; ⏎ is `openSession`, which switches project when
  the chat is not in view. N is the same dialog as a flow: the project (no ALL, no folderless named project), the folder
  when the project spans several, then the environment — because oracle does not start claude bare: its Taskfile has
  `task production-workload`, `task sandbox-workload`, `task development-<cluster>`, each setting a cluster's credentials and
  dashboards before `mise exec -- claude`. Rather than name oracle, a folder *has launchers* when its Taskfile's
  `task --list --json` has tasks whose description mentions Claude (`launchersFor`, cached by mtime; `TASK_BIN`; mise's
  shim is the first fallback and answers with the agent's bare PATH); the page asks before any new chat, from ⌥⌘N, the +
  button or the folder pick-list alike (`newChatIn`), and `POST /api/terminals` takes `task`, checked against the list.
  Behind task, claude is a descendant of the PTY's process (task → sh → mise → claude), so `linkTermToRegistry` walks
  `ps -axo pid=,ppid=` while such a drawer waits for its session, and the holder keeps `claudePid`. A resume stays
  `claude --resume`: the Taskfile's command line takes no arguments, and the environment is oracle's to pass through
  (`{{.CLI_ARGS}}`) if it ever wants resumes to go through task. Tested with `scripts/faketask.mjs`, which runs the fake
  claude as a child, not exec — the descent is the point.
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
   **Done that evening**: `scripts/scenario.mjs` with `scripts/scenarios/`, and `npm test`.
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

## Findings — the stories behind the invariants (moved verbatim from CLAUDE.md on 2026-09-20)

CLAUDE.md keeps one bullet per invariant and points here for the how-we-learnt-it. These are those paragraphs as
they stood, dated where they were dated. Newer findings go into the decision entries above, not here.

### The board and its state, as CLAUDE.md described them

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

### Things that bit us

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
* **⌥ is a compose key too, and `macOptionIsMeta` took that away** (fixed 2026-09-20). A Portuguese layout writes
  `@` as ⌥2, `|` as ⌥1; the flag above turns xterm's third-level-shift path off (`isMac && !macOptionIsMeta`) and
  skips the composition helper, so those chords left as `ESC <key>` and there was no way to type an `@` in the
  drawer. The same handler now sends `e.key` — the composed character, which the browser reports on the keydown —
  whenever ⌥ alone is down over a digit or a punctuation code (`ALT_COMPOSES`), and `preventDefault()`s, or xterm's
  own path sends the `ESC` pair behind it. ⌥ over a letter is untouched: Meta is what readline wants there, and it
  is what carries ⌥Enter. A layout that needs a chord outside that key class means growing the list.
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

### VS Code Web in the pane

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
