# peixAIrada — decision log and hand-off

What was decided, why, and what is still open, so the work can be picked up in another session.
Newest at the top of each list. `CLAUDE.md` is the working notes (how things are built, what bit us);
this file is the *why* and the *state*. Last updated 2026-10-13. The company, its repos and the people on its PRs go
by stand-ins here — `acme`, made-up repo names and PR numbers — since 2026-10-01; keep it so.

## Decisions of 2026-10-13, on a branch, later — a PR's branch in the editor

The study's second half (the entry below): to edit a PR whose branch the folder does not have out, a working tree of
its own — the folder's branch never moves under the chats in it. Ricardo chose the place: inside the repo.

* **The tree that has the branch first** (`ensureWorktree`): `git worktree list --porcelain` — the folder itself when it
  is on the branch, any worktree that has it (one beside the repo too). Only then one is made: git refuses a branch
  out twice, and a second tree of one branch is a second place to commit to.
* **Made inside the repo**, `<repo>/.claude/worktrees/<slug>` — where Claude Code's `--worktree` puts its own; the
  repo's Peacock colour, its named projects (a prefix) and VS Code Web's trust of the repo reach it; a tree not
  ignored there goes into the repo's `.git/info/exclude`, never a tracked file. Origin's branch is checked out
  `--track`ing it, a local one as is; a fork's PR (its branch name means nothing here) or *review only* is `--detach`ed
  at the PR's head, fetched into the object store alone as the diff does — nothing to push to.
* **Nothing is installed.** node_modules is what a worktree costs (on this Mac 30 MB to 1.1 GB each, 92 of 137 with
  their own): *Link node_modules from <repo>* (a symlink to the main tree's) only when the lockfile's blob is the main
  tree's, else *npm ci there…* typed into the chat's zsh, unrun.
* **Removed only what the board made, and never by force** (`sweepWorktrees`): its PR merged or closed (asked about if
  no chat names it any more), no live chat or drawer in it, `git status` clean, no commit beyond the one it was made at
  that no remote has — then `git worktree remove`, which itself refuses a tree with work in it. A tree gone by hand is
  forgotten.
* **"Switch this folder…" is said, not done**: `git switch <branch>` typed into the chat's zsh, unrun, offered only
  when no other chat (live, or touched in the last day) and no other drawer is in that tree, this chat is not mid-turn,
  nothing is uncommitted, no merge or rebase is under way and the branch is out nowhere else; otherwise the row is
  there, disabled, saying which of those stands in the way (`ctxRow` learned `off`).
* **VS Code Web on a tab of the chat's**, named `<repo> @ <branch>` (`state.paneWt` beside the folder's own
  `paneIde`, so the folder's editor stays); with Zed picked, Zed's window on the tree.
* → `test/worktrees.test.mjs` (temp repos: made and found again, the folder's own branch reused, a fork's PR and review
  only detached, a fresh branch from origin's main, node_modules linked, the sweep keeping a dirty tree, one with an
  unpushed commit and one with a live chat, and removing the clean one; the switch guard),
  `scripts/scenarios/editor-branch.mjs`.

## Decisions of 2026-10-13, on a branch — a PR's diff without its checkout

Ricardo: "Both the git diff view and edit (VS Code Web) could benefit from opening in the correct branch. One challenge
is to have multiple PRs for the current project in the same chat, but that could be fixed with some buttons to
'open+change to branch' or 'switch to branch'. At the same time, we may have concurrent chats doing other stuff and we
can easily change branches due to changes. Are worktrees the answer?" A study on the branch `branch-views` answered:
not for reading a PR — git diffs one with nothing checked out —, yes for editing one (the entries after this), and the
board never switches a shared checkout. He picked the PR diff, the editor at a branch, chats in worktrees, and a
warning when a branch moves under a chat (built apart). This is the first.

* **Why**: the changes tab read only the folder's HEAD, and a chat's folder is shared. In 400 recent transcripts read
  for the field alone, 75 chats saw `gitBranch` change mid-chat, and of 333 such switches with the folder unchanged
  two in three followed no git command of that chat's within the hour — another chat or the user moved the branch
  under it. 187 of the 400 named two PRs or more, and only 47 of those ever changed branch: most PRs a chat talks of
  are not the folder's checkout.
* **Read from origin into the object store alone** (`prRange`): `git ls-remote origin refs/pull/<n>/head
  refs/heads/<base>`, then a fetch of only what is not here, `--no-tags --no-write-fetch-head --refmap=` — objects,
  and nothing else: no ref moves, no FETCH_HEAD (a `git pull` running in another chat reads it between its fetch and
  its merge), nothing checked out. The diff is `merge-base(base, head)..head`, as GitHub shows it; the base is the PR's
  own (`baseRefName`, now in `PR_FIELDS` with the head's name, the base's commit and whether the head is a fork's —
  `prRefs`, `pr.refs`): a stacked PR is diffed against the PR under it. ls-remote every time rather than GraphQL's
  commit, which is up to a poll old: a push is seen at once.
* **GitHub's diff when git cannot** (`prFromGh`): a PR of another repo than the checkout's, a folder that is no
  checkout, an origin that does not answer or has no such PR — `gh pr diff <url>`, counted by `patchStat`. GitHub
  caps it (some hundreds of files); the tab says which it was (`.csrc`: *as pushed, at <oid> · read from origin,
  nothing checked out*, or *from GitHub (gh pr diff) — why*).
* **The tab**: `PR #n ▾` closes the scope row; with several PRs it opens a picker (`#ctxm`, rows of two lines — `sub`
  — added to `ctxRow` for this) naming each PR's branch and where it lives. In the PR scope Commit… and Push go (they
  are the folder's), `#n ↗` stays, and a note on a line is prefixed `PR #n`, since Claude's folder may have another
  branch out. The scope is remembered as the others are; the PR is per chat (`changes.pr`), else its first open one.
* **The PR rows**: each is a `.prline` — the link as it was (`.prrow`, still what the harness and ⌥⌘G read), where its
  branch lives (*this folder* · *worktree x* · *the repo's folder* · *not checked out* · *not this folder's repo*, from
  `GET /api/worktrees?cwd=`, `git worktree list --porcelain`), and **Diff**. A button in a link would be the link's,
  hence the line around it.
* → `test/changes.test.mjs` (a bare origin with `refs/pull/7/head`, a checkout on another branch with an edit: the
  PR's files only, HEAD, the tree, every ref and FETCH_HEAD as they were; nothing fetched twice; GitHub's diff for
  another repo, a folder that is none, a PR origin lacks; a stacked PR against its base; the worktree list),
  `scripts/scenarios/changes-pr.mjs`; the fake gh answers `pr diff` from an entry's `diff`.

## Decisions of 2026-10-13, late night — a way out of the fill

Ricardo, living filled: nothing on screen says how to leave the board's own full screen; options, with mocks. A study
(six options on the made-up board at the notch, the menu bar and the lights drawn over it) had the only visible way out
behind the auto-hidden menu bar — View › Exit Full Screen — the green button gone with the window's border, and the
launcher, the ··· menu, Settings and the fish's menu silent. Picked: the fish's menu, the lights with the menu bar, a
word on the way in. Not picked: a ⤡ in the status bar, rows in ··· and the launcher, a pill under the housing.

* **The fish's menu says it** (`rebuildStatusMenu`): *Exit Full Screen ⌃⌘F* above Reload, *Enter* while windowed —
  `toggleFill`, its title flipped by `validateMenuItem` as View's is. With the board in the back the fill still covers
  the screen and the menu bar is the other app's, so the fish is then the one native control in reach. Its ⌃⌘F is a
  hint: a status item's key equivalents answer only while its menu is open.
* **The lights come down with the menu bar**, as the system's full screen shows its title bar: when the menu bar
  comes out — the pointer at the top edge beside a housing, the 1 s hold elsewhere (`menuOut`) — a 28 pt strip slides
  in under it (`lightsDown`), the three lights on the left and the window's title (the open chat, as the page posts
  it) in the middle, over the board and the pane's pages (the last of the content view's subviews). Green leaves the
  fill, yellow minimizes (`lightsMinimize`: the fill's borderless mask gains `.miniaturizable`, and the fill's options
  are dropped while the window is in the Dock, which they would otherwise keep hidden), red is ⌘W's path
  (`closeHalfOrWindow`: a tab or a half first, then the window).
  * **The menu bar is held out while the strip is down** (`lightsOut`: `fillOptions()` then hides the Dock alone) —
    an auto-hidden menu bar goes as soon as the pointer leaves it, which is on the way down to the lights. Both go
    once the pointer is below the strip (`lightsBand`) or off the screen, never under an open menu of the app's
    (the tick's run loop is tracking it); beside a housing the bar is tucked half a second on (`tuckMenuBar`), which
    has unstuck an auto-hidden bar before.
  * **The tick stays cheap**: `menuBarVisible()` is asked only while the pointer is within the menu bar's height of
    the top (`fillMenuH`, the housing's strip or the main menu's own height, read in `placeFill`), and not at all
    while the strip is down.
  * **Drawn, not the system's** (`LightButton`, `LightsGroup`): on a borderless window the standard buttons only beep
    (`performClose`/`performZoom` want the title bar's own buttons), and they draw no marks outside a title bar. A
    12 pt disc each, a shade darker pressed; the three marks show together while the pointer is over any of them (a
    tracking area); green's mark is the two corners pointing in, and its tooltip says ⌃⌘F.
  * The app log says `fill: lights down (menu bar N pt)` and `fill: lights up (why)`. Not checkable outside the app:
    the harness is a page, and the strip is native. The study's mock (the lights under a drawn menu bar) is what it
    is meant to look like.
* **A word on the way in** (`fillHint`): the fill gone on while the page heard it off — ⌃⌘F, the green button, the
  fish's menu — puts a pill under the head row, centred on the housing (the window without one): *Full screen, up to
  the notch · ⌃⌘F leaves it, or the green light at the top edge* (without a housing, *…after a hold at the top edge*),
  for 3.2 s, then it fades (in place under reduced motion). A load or a launch that finds the fill on says nothing:
  the first `peixFill` a page hears is never a change (`state.fillHeard`). Three times in all (`prefs.fillHints`) —
  the board lives filled and comes back filled, so it is a lesson, not a habit. Not an alert, so not against *no
  in-page toasts*: it answers what the hand just did, as `note()` does, and it is a `status` for a reader. Its own
  element, not `.note` (that is `note()`'s popup, removed by every call). A page up in the pane, a native view, can cover its lower edge.
* **The keys sheet's esc row** no longer says it never leaves full screen: nothing has, since the fill replaced the
  system's full screen.

## Decisions of 2026-10-13, late night — the branch moved under a chat

The ask, from the branch-views study (its *Detect drift*): warn when a chat's branch is moved under it — by another chat
or by hand — because the dangerous case is Claude editing the wrong branch; a chip in the header saying what the folder
is on now and what the chat was on, a mark on the card, an alert when it happens to a chat at work.

* **Two signals, one move.** The transcript: Claude Code writes `gitBranch` on every line, so a change between lines in
  the same folder that the chat's own git does not explain is drift (`noteBranch` → `s.drift`). The disk: each live
  chat's checkout's HEAD file, read on the registry poll with no git spawned — a worktree's own, from its `.git` file's
  `gitdir:` (`sweepHeads`, `headAt`, `noteHead` → `s.headNow`, `s.diskDrift`) — for a chat that writes nothing while
  its branch moves. The summary's `drift` is the disk's when it has one (newer), else the transcript's; the same move
  seen by both is one move (`from→to`), alerted once.
* **What the chat's own git is.** The study's commands (checkout, switch, rebase, reset, stash, pull, merge, worktree,
  `gh pr checkout`) plus a branch renamed and a bisect, read right after `git` and its own options — a commit message
  saying *merge* is no move —, from the chat's Bash calls, a sidechain's, a sub-agent's own transcript (read only when
  nothing else explains the move, `agentsMoved`) and a `!` command typed into the chat. Explained: one in the hour before
  (the study's rule), **or one since the chat was on the old branch that names the new one**. Measured before building:
  Claude Code's branch lags the chat's own checkout — of 185 checkouts that moved it, the result's line still carried the
  old branch in 166, the new one coming lines, minutes and once six hours later —, so "the line before" explains nothing
  and an hour is not always enough; the branch's name in the command is.
* **None of it is drift**: a move through `HEAD` and back (a rebase), a move back to where the chat was, another folder.
  A move first seen on your prompt is yours: **a word of yours clears it**, and takes the folder's branch as it stood as
  the chat's (`headOk`) for the lines still to catch up — so the transcript saying the same move later is no new one.
  Through `HEAD` and elsewhere is a move; `HEAD` left standing (someone's detached checkout) is not flagged.
* **Shown only while the chat's claude runs.** An ended chat's next word is yours, which clears it anyway, and an old
  card wearing a move from its last turn would be noise.
* **The chip** `.hdrift`, before the changes' count: the branch glyph, *main now · was feat/tax-rounding*, a 16 % tint of
  `--needs` with its words in that red pulled 30 % towards the header's ink — so it reads on the header's black and on
  the light theme's panel (6.2 light, 7.7 dark, measured in `branch-drift.mjs`; ≈ 5.6 on the notch's black in the light
  theme, by hand). It gives way as the move's line does (`--hmin`, the words first) and folds last, after the move's line
  and the changes' count; `fitHeadPrs` now folds a header with no PRs too, which it never had to. Its tooltip names the
  other live chats in that checkout (`peers`), *(clauding)* on one at work. **The card** wears the red branch beside its
  title (`.trow .drift`, 4.9 / 5.3 against the ground) with the move alone in its markup, so the others coming and going
  rebuild no card. Both say it in words to a screen reader (`.vh`).
* **Dismissal: a click on the chip sets that move aside** — card mark and all — until it is gone (`driftAcks` in the state
  file, by `from→to`; `POST /api/sessions/:id/drift`). The next move shows again; the move going (your word, the branch
  back) drops the set-aside. Simpler than a timer, and the state file keeps it across a restart, as the move itself is
  read again from the transcript and the disk.
* **The alert** is `kind: 'drift'` with a heading (*Branch moved · widgets*) and the move as its snippet, through
  `queueNotify` — never on the boot's scan, a re-read or the boot's first look at the disks — and only for a chat at
  work. Your word within the debounce takes it back. In front of the board it chimes as a question does.
* **The study's figure, measured again**: its own rule over the 422 newest transcripts finds 334 changes with the folder
  unchanged (51 round trips through `HEAD`, as it said) but 61 with no git command of the chat's own in the hour before,
  not 222 — that figure was not reproduced. The rule as built flags 24 moves in 21 chats of the 422; 37 more were first
  seen on your prompt.
* Open: the study's list includes four commands that never change which branch is checked out (stash, reset, pull,
  merge); dropping them would catch a move made within an hour of one. A resumed chat whose folder moved while it was
  ended says nothing (your first word clears it). The app's banner for it has the snooze only, as a PR's turn does.

## Decisions of 2026-10-13, night — the harness for the board's frames; npm test under load; no perf skill

Ricardo, on the round's report: "commit and push. also improve harness, leave notes for future work if needed and check
if we need a perf-skill". Pushed (`7b3f0ef..aa14719`); then what the profiling had done by hand went into the scripts.

* **`npm run perf` measures what the day measured by hand.** Besides rest, the pointer and the scroll: *home* (no chat
  open, the sea), *a chat opened* from its card (three clauding, three not; the click to the log drawn and two frames),
  *the layers* (the compositor's tree, counted) and *the memory* (the web process's footprint, now and its peak).
  `--runs n` takes medians; `--against <ref>` starts the same board on that commit's page and server from a detached
  worktree (this checkout's `node_modules`) and interleaves the runs, A B then B A — the before-and-after that took a
  script and a second server each time; `--sample` runs macOS `sample` on the web process through each phase and
  prints the top of its stacks, idle waits left out; `--json` for a script. `--app [s]` measures the app as it runs —
  the board's web process (named by main.swift in the app log, `board: web process <pid>`, from the next build; until
  then the first web process the app started): its CPU over s seconds, its memory and where its time went. The body
  says when each phase starts (`say('phase …')` on stderr), so a sample covers its phase. `--against` reaches back to
  2026-10-03 (the harness waits on `peix.state().snapshots`).
* **The WebKit harness answers asks** (`Asks` in webkit.swift, a `WKScriptMessageHandlerWithReply`): a body's
  `await layers()` is `_caLayerTreeAsText`, `await footprint()` is `proc_pid_rusage` on the web process (the
  footprint Activity Monitor shows, and its lifetime peak), `say(line)` a line on stderr at once. `WK_BORDERS=1` and
  `WK_COUNTERS=1` turn on WebKit's compositing borders and repaint counters (preference setters the SDK does not
  declare) — what is a layer and what paints, in a `--shot`. All three were throwaway copies of the harness that day.
* **The numbers, one run each, the screen awake**: this tree at rest 5.2–7.2 % of a core, the pointer 6.3–7.9, the
  scroll 14.6–16.2 (a frame or two over 20 ms), home 10.8–13.9, a chat opened in 125–129 ms, 274–279 layers,
  490–520 MB (peak 1.0–1.2 GB); `--against 33ac94c~1`, the page before the first round: 34.5 / 34.2 / 94.5 (31 slow frames) / 42.6 %,
  417 ms, 1,359 layers, 610 MB, and five rules broken — the splitter's undrawn animation, the fish's SVG group and its
  rate, `--openc` over 12,555 elements and the header's colours. The live board with the app's own prefs, home and a
  clauding chat open, breaks none. `--app`, with this chat streaming into the board: ~16 % of a core, 630–640 MB; and
  with the display asleep (`away: display — the board hidden` in the app log), 0.0 % over 10 s, 683 MB — the first
  round's fix in the app itself, against ~40 % with the screen locked that morning.
* **`npm test` holds under load.** Run whole, it lost one of the drawer tests one run in two or three — each time
  another (`tied to its session by pid`, `the resumed chat alive`, `both fakes registered`, `the newest build`). Alone
  each passes in 1–3 s; side by side the Mac's endpoint-security agent ran at 115–120 % of a core vetting every exec,
  and a fake claude that registers in 1.2 s alone took over 10. Three changes: `waitFor` waits 15 s by default — a
  timeout is for what never comes, and a passing wait never spends it — and the tests' own 10 s waits use it; the
  suite runs four files at once (`--test-concurrency=4`; ≈31 s against ≈29) — three runs green, where thirteen at once
  still lost one in three; and `idle-drawer.test.mjs` had a race of its own: both drawers were started and *then*
  both pages attached, so the first sat unwatched while the second's holder started and was ended before anyone looked
  (its log: `idle 0 h with no page on it — ending it` before the other's `claude in`); each page now goes on as soon
  as its drawer is there, and the window is 3 s.
* **No perf skill.** A skill would hold the procedure; the procedure is now the script's flags, written at its head,
  and CLAUDE.md — read by every session — points at it (*Verifying*: `npm run perf`, `--against`, `--sample`, `--app`;
  and *the cost is read off the web process, never Chrome*). A skill would be a fourth place to keep in step, and
  `.claude/` is ignored by this Mac's global gitignore, so it would live outside the repo unless forced in. Worth it
  only if profiling grows steps no script can take.
* **Left, for later** — each with what to run:
  - *The home's sea*, measured now by perf's `home`: 10.8–13.9 % against 5.8–7.2 at rest; its sample is `cos`, `exp`,
    `pow` and `memmove` — the halftone painted in script fifteen times a second (`seaRun`, `seaPaint`). Fewer frames,
    only the rows that move, or a rest after a minute untouched.
  - *A chat's open restyles the board once* (Chrome: 4,800 elements, 22 ms — `tintChat`'s colours on `#chat` and
    `main` inherit everywhere); setting them on the few surfaces that read them.
  - *Something paints at rest*: `RenderBox::computeVisibleRectsInContainer` leads the rest phase's sample (a third to
    two fifths of what it lists) — repaint rects, with the board still. `WK_COUNTERS=1` on the made-up board (perf's
    prefs, a `--shot` after a few seconds) says which layer's count climbs.
  - *The app's board busier than the made-up one* (~16 % against 6–7 with this chat streaming; its sample keeps
    animation upkeep — `DocumentTimeline::currentTime`, `updateFinishedState`): `--app` on a quiet board, and
    `getAnimations().length` there, to see whether finished animations pile up.
  - *The peak memory*: 1.0–1.2 GB within a 40 s run that ends at ~500 MB — which phase (the six opens?) by
    `footprint()` after each.

## Decisions of 2026-10-13, after the frames — the PR list folds from its foot

Ricardo, on the header's PR list: once it is unfolded nothing says how to fold it again — an arrow at the list's foot
would.

* **The open list ends in an arrow up that folds it** (`#prFold`, in a `.pfoot` row after the rows): a stroked chevron
  (`ICON.up`, the tab strip's family) centred on the controls' fill, 56 × 18 px, `--ctl-hi` and the ink under the
  pointer, the small controls' hover ease and 97 % press. It does what the chips do — `showPrs(false)`, the one path
  (the pref, `renderHead`) — and lives in the list's own markup, so `drawn.prs` still decides when it is redrawn.
  Centred because the eye ends at the bottom of what it just read and an arrow in the middle reads as *put this away*;
  a full-width bar was the other shape, heavier than the rows over it. `… n more` keeps the left of the same line, so
  the foot costs one line at most.
* **The opener says which way it goes**: the whole count's ▾ (`10 PRs ▾`, `+9 ▾`) is ▴ while the list is open — the
  text arrow it already had, turned, not a new glyph. With every chip shown there is no count; the chips' fill (`.on`)
  is the state, as before. `#prToggle` names the list it opens (`aria-controls`).
* **From the keyboard the keys stay on the chips**: the arrow goes with the list and a toggle redraws the header, so
  either pressed with Enter or Space (no clicks counted, the button focused) puts the focus on the new `#prToggle`. A
  mouse click or a script's `.click()` moves nothing.
* `header-prs.mjs` checks the arrow (a named button under every row, in the middle, nothing over it), a real click
  folding the list (pref, `aria-expanded`, the rows still there), the chips unfolding it, and Enter both ways with the
  focus kept; `header-prs-fit.mjs` the count's ▴ and ▾.

## Decisions of 2026-10-13, after Zed, later still — the board's frames, the next round

Ricardo, on the list of what was left (the entry "the board's frames, profiled", below): "do it". Measured as before:
the made-up 400-card board with the user's prefs in a WKWebView, the median of three where it says so.

* **Nobody looking, the board is hidden** (`watchAway`, `showAway` in main.swift). With the screen locked and the
  display off, the app's web process had run at ~40 % of a core — timer-driven style passes and layouts, nothing
  drawn: WebKit did not count the page hidden. The window's content is now hidden while the screen is locked, the
  display asleep, the screen saver up or the session switched away (`com.apple.screenIsLocked`, `screensDidSleep`,
  `com.apple.screensaver.didstart`, `sessionDidResignActive`, each with its opposite), and shown once all have
  cleared, or the app comes forward — a missed opposite must not leave the board blank. Hiding a superview makes every
  web view in it hidden to WebKit: measured with the harness's own view, `visibilitychange` to `hidden` and 8.7 % of a
  core → 0.2. AppKit takes the keys off a view whose ancestor is hidden, so the first responder is kept and put back —
  a drawer typed into after an unlock has them. The page's script still runs: the stream, the alerts and the badge
  carry on, their timers slowed. The app log says `away: lock, display — the board hidden` and `away: back`.
* **The pointer's and the scroll's paths do less a frame.** With the board otherwise still, the pointer moving anywhere
  cost 16–18 % of a core against 7.5 at rest: the wallpaper's glow (`wallGo`) took a new 1.1 s transition every frame —
  a style pass and in WebKit a walk of every layer each —, and now takes one `WALL_MS` (125 ms) apart at most; the ease
  starts from where the glow is, so eight a second still glide. The card's glow (`spotSoon`) read the hovered card's
  rect every frame, after the frame's writes; it now reads it once per card, again after a scroll, a render or the list
  resized. The hidden timeline's thumb and labels were placed on every scroll frame; a frame asked for by a scroll alone
  now leaves it be (`listChanged(true)`) — `show()` draws it as it comes out, and a render still does, so it is right
  at rest as `timeline.mjs` reads it. Measured with every card shown, against the commit before: the pointer moving
  16.7 / 14.8 → 13.2 / 11.8 % of a core, the glow under it ~20 → 18–19 %, scrolling 36.7 → 31–33 %; with the long
  lanes held back (below) 10–11, 14 and 17 %.
* **No full style pass on a clock.** A count that rolled (the bar's CPU and memory every 3 s, a lane's count) laid
  its strips out at the old digit with `void document.body.offsetWidth` — a style pass and a layout of the whole page,
  and in WebKit a walk of every layer — so that a transition had somewhere to start; each strip now rolls by an
  animation of its own from the old digit, and the transition is gone. `phaseAnims()` asked `getAnimations()` — a style
  pass too — twice a render, the render's own call and `renderBoardSoon`'s at once, whether or not a node had been
  made; now `drawCards` says whether it changed the list, a render that did not queues nothing, `renderBoardSoon` runs
  a queued one at once, and that run clears the queue. The presence line's verb (3.2 s) and the header's menu still
  phase what they make.
* **The floating header's half without a strip is a class** (`.grp.nostrip`, set by `renderTabs`; `.gbody.haslog`,
  set by `placeLog`), not `:has(> .ptabs[hidden])` and `:has(> #log:not([hidden]))`. Chrome invalidated whole subtrees
  for those rules on most DOM changes (its trace: `allDescendantsMightBeInvalid` on the body, a dozen restyles of
  ~12,900 elements a chat's open): a clauding chat's open restyled for 127–165 ms and took 165–240 ms; now 37–43 and
  92–127. WebKit measured no difference — this one is the browser's. `UNDER_HEAD` follows.
* **A long lane shows its newest 30 cards and a line for the rest** (`LANE_CAP`; Idle and Done, the two that only
  grow). With every lane open here the list held 400 cards, ~13,000 elements, each restyled, laid out and walked on
  every render. Now the line — *272 more done chats*, `+272` on the rail — shows the rest when clicked, until the page
  is loaded again (`laneMore`, page state: in the prefs, one click would put the 400 back for good); the open chat's
  card is there whatever its place, and a query or a filter shows every match; a lane's head still counts them all. On
  the made-up board: 400 → 130 cards, 13,081 → 5,154 elements; at rest 9.1 → 6.6 % of a core; at one chat event a
  second 11.9 → 8.1 %; a clauding chat opened in 215–244 ms → 120–147. `long-lanes.mjs` holds it.
* **A guard: `npm run perf` and `compositor-rules.mjs`.** Every one of the day's causes passed every scenario — Chrome
  composites what WebKit does not. `lib/animcheck.mjs` is the rules as one expression to run on the board: nothing
  never-ending (a scroll-driven one counts) on an SVG element inside an svg, at a playback rate other than 1, or with
  nothing drawn; no inherited registered property under a transition on an element with more than 50 under it.
  `compositor-rules.mjs` runs it in Chrome with the lights on (tiles, the floating header, the bar and its fish, two
  chats clauding, one asking, one watching); `npm run perf` runs it in WebKit — the only engine that keeps an
  animation on a box it does not draw — on a 400-chat board, and measures the web process's CPU (its pid from the
  harness, `WK_PIDFILE`) at rest, with the pointer moving and scrolling, against ceilings about twice the day's
  numbers. Against the page as it was that morning, from a worktree: the scenario names four of the five causes and
  `npm run perf` all five, rest 31 %, pointer 37 %, scroll 81 % with 40 frames dropped — every ceiling broken; against
  this one, 8.9 / 10.7 / 17.1 % and a frame or two.
* **Not changed: the done cards' `filter: saturate(.45)`.** With a layer each, a done card is painted through its filter
  only when it repaints, not on every scroll; the glow run over done cards cost the same with the filter as with
  `filter: none` (13.5 / 14.2 / 13.2 % of a core against 13.0 / 13.9 / 13.7) — nothing to win by trading it for colours.
* **Memory: no leak found.** The app's web process held 1.6–1.8 GB after hours (~730–790 MB WebKit malloc, 630–830 MB
  graphics) against ~0.4 GB for a fresh page — but held it: its malloc read 787, 785 and 727 MB over five hours of its
  uptime, not climbing. A WebKit soak on the made-up board — a chat event a second, a chat opened every 8 s, the
  pointer moved and the list scrolled, 20 minutes — rose from 474 MB to ~650 by its seventh minute and stayed there
  (malloc ~270 MB, graphics ~360 MB, surging now and then to ~850 MB and falling back), its DOM at 5,157 nodes at the
  end as at the start: what grew between two heap censuses was DOM nodes and finished animations, and it
  fell back as WebKit's collector ran (283 → 266 MB) — waiting on it, not kept. Chrome's heap stayed flat over 120 chat
  opens (6–7 MB, the same node count). The same soak without a layer per card held the same. Relaunched onto this
  page — 130 cards rather than 400, ~550 layers rather than 1,325 — the app held 493 MB ten minutes in.
* **Together, this round**, from the commit before it on the made-up board in WebKit: at rest ~7.5–9 → 6.6 % of a
  core; the pointer moving 15–17 → 10–11 %; the glow under it ~20 → 14 %; a chat event a second 11.9 → 8.1 %; a
  clauding chat opened in 215–244 → 120–147 ms (Chrome 165–240 → 92–127); with the screen locked, a hidden page
  (0.2 % in the harness). `npm run perf`: 8.9 % at rest, 10.7 with the pointer, 17.1 scrolling, no rule broken. The
  scenarios pass (`tiles` flaked once on its known pixel at the notch); `npm test` passes file by file — a run of all
  at once under this Mac's load loses one of the server's timing tests now and then, as it did before this round. The
  app, rebuilt and relaunched onto this page: its web process at ~13 % of a core a few minutes in and ~1 % ten minutes
  in with a chat and its drawer open (~40 % that morning), 493 MB (1.6 GB that morning, after hours).
* **Left, measured**: *the home's sea* (`seaRun`, `seaPaint`) paints its 200 × 100 halftone fifteen times a second in
  script while no chat is open — 13–15 % of a core against 5–7 with a chat open in the harness, ~21 % in the app just
  relaunched onto it (its rAF callbacks half the main thread's samples); fewer frames, only the rows that move, or a
  rest after a minute without the pointer would keep most of it. *A chat's open* still restyles the board once
  (Chrome: 4,800 elements, 22 ms — `tintChat`'s colours on `#chat` and `main` inherit everywhere, eased or not); setting
  them on the few surfaces that read them would leave a few hundred.

## Decisions of 2026-10-13, after Zed, later — Zed is where files open, not the pane

Ricardo, on whether Zed could open inside the board as VS Code Web does — "you can leave 2. but make it clear on settings
what this does, so we don't creat false expectations".

* **Zed cannot be in the pane**: VS Code Web is VS Code's own UI served as a web page (`code serve-web`), which a
  WKWebView shows; Zed is native, drawn by its own GPU framework, with no web build (1.0, April 2026, is macOS, Linux and
  Windows binaries; WebAssembly only for its extensions), and macOS has no way to put another app's window inside
  ours. Holding Zed's own window over the pane through Accessibility was offered and left: a separate window, its own
  title bar and keyboard, behind the board at a click.
* **So the setting is where files open, and only that**: *files open in — VS Code · Zed*, each the app's own window
  outside the board. ⌥⌘E and ··· 's VS Code Web row stay VS Code Web whichever is picked (its zoom-again too); with
  Zed picked ··· adds *its folder in Zed* (↗, no key) and the launcher a row for it. Under the pick, whenever Zed is
  picked, a line says in so many words what it is not: *Zed opens in its own window, outside the board — it has no
  web version the pane could show. ⌥⌘E stays VS Code Web, on a tab here; ··· has the chat's folder in Zed.* The Keys
  sheet's ⌥⌘E row and the README say the same.
* What the earlier entry made ⌥⌘E do with Zed — the folder in Zed's own window — is now that ··· row; nothing else
  about the links or the install changed.

## Decisions of 2026-10-13, after Zed — Zed installed when it is picked

Ricardo, on Zed not being on this Mac: "how do I install? put that on readme also (optional). or... can we just
install on-demand if we choose zed in settings?"

* **Picking Zed without it installs it**: the page asks the server (`POST /api/editors/zed/install`), which runs
  `brew install --cask zed` — the app into /Applications, the `zed` CLI beside brew, no password, and Zed updates
  itself from then on. Homebrew because it is how this Mac's tools came (gh, task, node) and needs no admin prompt;
  Zed's own `install.sh` would be a script piped from the network into the board's process. One install at a time, a
  second ask joins it; brew's newest `==>` line is the settings' line under the pick (`#edSay`, `editor` events),
  its `Error:` line too, with *try again*. No brew: the line points at zed.dev's download.
* **Launch Services is told of the app** (`lsregister -f`) once it is there, so a `zed://` link is answered before
  Zed was ever opened — not seen to be needed, but cheap and idempotent.
* **Until it is there, the board says so where you clicked** (`zedNote`): ⌥⌘E, a transcript's `zed:` link and a
  drawer's — macOS would otherwise be handed a URL nothing answers, which in the app fails without a word.
* **Where Zed is looked for** is `APP_DIRS` (/Applications, ~/Applications; Zed Preview too), read on every ask, and
  the settings ask again when opened, so a Zed installed by hand is seen.
* **No test reaches brew or /Applications**: every test server has `APP_DIRS` of its own, `BREW_BIN` the fake
  (`scripts/fakebrew.mjs`, which writes a Zed.app with an Info.plist) and `LSREGISTER_BIN` `/usr/bin/true`.
  `chat-links` now waits for that fake install after picking Zed.
* The README's requirements row says both ways: picking it, or `brew install --cask zed` / zed.dev/download.

## Decisions of 2026-10-13, after the last, later still — Zed as the editor

Ricardo: "can we also support ZED instead of vscode? if so, it would could have a setting to change the default
editor".

* **One setting, two editors** (`prefs.editor`: `vscode`, the default, or `zed`; Settings › Board › Chats, a
  segmented pick like the card light's). A browser's prefs, not the setup file: the server never needs it — VS Code
  Web's server and its freshening stay as they are, unused while Zed is picked.
* **File links are the same URL in another scheme**: Zed's open listener takes `zed://file<path>`, URL-decoded, and
  parses a `:line:col` suffix off it as its CLI does (a file whose own name ends that way wins) — the shape of
  `vscode://file`. So `pathHref` and `md()`'s `[file:42](…#L42)` build one URL through `fileUrl` (the path now
  `encodeURI`d, so one with a space is a URL wherever it is parsed — Swift's `URL(string:)` on macOS 13 refuses it; marked's already-encoded hrefs are decoded first),
  and the app's navigation policy hands any scheme to the system unchanged — no Swift change. A switch redraws the open
  transcript (`logView.arr = null`); the drawer's links are read on hover, so they follow at once.
* **⌥⌘E is the folder in Zed's own window**: Zed has no web build, so there is nothing to put in the pane — no tab,
  and ⌥⌘E pressed again does not zoom a half (the zoom-again stays VS Code Web's). The ··· row keeps its id
  (`#webBtn`) and is named by the editor (*Zed*, its mark from Simple Icons, CC0); the launcher offers it in a browser
  too, since nothing in it needs the app.
* **In a browser an app's URL is followed as a link**, not `window.open`ed: a new tab for `zed://` (or a drawer's
  `vscode://` link, as before) stayed blank behind the browser's question.
* Not checked on this Mac: Zed is not installed here, so the hand-over itself is read off Zed's source
  (`crates/zed/src/zed/open_listener.rs`: `zed://file`, `derive_paths_with_position`), not seen. The scenario holds the
  URLs, the redraw, the row and ⌥⌘E's URL (`chat-links.mjs`).

## Decisions of 2026-10-13, after the last, later — the board's frames, profiled

Ricardo: "the app seems a bit slugish, animations etc.. do a deep analysis and profile to find issues", and on the
findings: "yes, implemente 1-4 and then give me the next improvements and expected gains/effort".

The board's web process ran at ~40 % of a core at rest, its main thread busy in ~94 % of an 8 s `sample`: every frame
a style pass and then WebKit's walk of every layer to decide what is composited (`computeCompositingRequirements`), over
~1,300 CALayers for a list of 400 cards (every lane open here). Two things multiplied: animations that kept every frame
on the main thread, and what each frame then cost. Measured in a WKWebView — the app's engine — on a made-up board
shaped like this one (400 chats, 300 done, five clauding, the user's prefs), each variant three times, the median;
the server (0.5 %) and the drawers (a 10 Hz spinner, +1–3 %) were not it.

* **The splitter's scroll-driven black is off where it is not drawn** — with tiles and on the rail
  (`:is(main.tiles, main.scompact) #splitter.scrolls::after`). There `#splitter::after` is `display: none`, but WebKit
  keeps its animation, and this one, kept, had it resolve the board's animations on the main thread every frame: the
  five rings alone (every other animation cancelled) were 5 % of a core, with it 23 %; tiles off, where the black is
  drawn, 1.6 %. With it gone the rings, the shimmer, the header's shade and the Clauding head's pixels are each 2–6 %
  over the 3.6 % of nothing at all. Alone it moves the whole board nothing (39 %): the fish still keeps every frame on
  the main thread — the next entries.
* **The list is a stacking context of its own** (`#slist { isolation: isolate }`). It was positioned but not one, so
  the cards — positioned, each its own stacking context — sat in the stacking context above it, and WebKit, which
  scrolls the list on the compositor, made each a layer of its own to scroll with it, each under a clip layer the
  list's size: the layer tree dump (`_caLayerTreeAsText`) counted 1,325 CALayers on this board, 117 with it (156 on
  the made-up one), and every frame that
  restyles walks them all. The whole board at rest 39 % → 26 % of a core. The frozen frames (every animation paused
  at 0) before and after are the same but for 20 px of a lane's chevron, antialiased a hair differently; nothing in
  a card reaches past the list (the chips' and faces' z-indexes are inside the card's own context).
* **…and each card is a layer of its own inside it** (`#slist > .card { will-change: transform }`), as every card was
  before but now under the list's own layer, with no clip layer each: 544 CALayers. With the cards painted into the
  list's tiles, the fixes above had made scrolling worse — a scroll driven a frame at a time (12 px a frame) dropped
  34–44 frames in 6 s against 17 before, every exposed card painted, the done ones through their filter —, and a
  glow under the pointer repainted the tile it was in (41 % of a core). With a layer each: the scroll 39 % of a core
  and no frame dropped, the glow 21 %, at rest and a chat's open the same or a hair better, and the web process's
  memory the same (~440 MB, ~280 MB of it graphics: WebKit gives no backing to a layer out of sight). The frozen
  frames are the same.
* **The status bar's fish is boxes, and its pace its length.** Its tail wagged as an SVG `<g>`, whose transform WebKit
  never composites — 4.5 % of a core on a page of 400 plain cards, and on the board every frame a style pass and a
  layer walk, since the wag never stops; and its pace was `updatePlaybackRate`, a rate other than 1, which kept the
  swim resolved on the main thread too (0 % at rate 1, 3.5 % at 1.4, on the same page). Now the swimmer is a span
  holding an svg for the body (`.fb`, the gulp's swell) and one for the tail (`.ft`, the wag) inside `.fw` (the pat's
  turn), the same pixels and the same pivots (fill-box origins become the boxes' own: the tail's left middle, the
  body's right middle, the fish's middle half a pixel left), and the pace is the swim's length (`swimPaceTo`, its place
  in the loop kept, as the lane's ResizeObserver already did). Alone, the swim and the wag are now 1–2 % over nothing;
  the whole board at rest 26 % → 10 % of a core. The empty list's resting fish keeps a single svg (`REST_FISH`).
  `small-motions` reads the pace from `peix.state().swim.rate`, and three of its waits no longer race the board's own
  clock (they failed on the commit before too, under load): the motion log read by time, not by an index the capped
  log shifts; a pat waits for a moment with no bubble out and no burp due; the lane's count alone is waited on to stop
  rolling, not the bar's CPU, which rolls every 3 s.
* **The colour eases on the surfaces that draw it.** The header's ground and veils, the transcript's wash and the
  divider were registered colours that inherit, on `#chat` and `main`, under a 250 ms transition: every frame of each
  switch of chat restyled every element below them — the whole board (Chrome's trace: ~12,900 elements a frame), and
  in WebKit a walk of every layer after each. Now `tintChat` sets plain properties where it did and each surface eases
  a copy of its own that does not inherit (`--hbg-eased` on `.shead`, `#log` and the floating header's `.gbody`; the
  veils on `.shead`), the divider its own `background-color` — its existing .15 s transition, so it now eases in .15 s
  rather than .25 s. The header still slides from one colour to the next (sampled across a switch: blue, teal, green
  over 250 ms); a frame of the ease restyles 48 elements, and the frozen frames are the same but for ages that moved
  on. Opening a clauding chat took 450–600 ms in WebKit, and 220–275 with those transitions turned off altogether
  (measured before the change). The other half of an open's
  cost is still there: a dozen full restyles in Chrome, from the floating header's `:has()` rules and the open path's
  reads after writes — *Next*, below.
* **Together** — the page as it was against this one, on the made-up board with the user's prefs, in a WKWebView, the
  medians: at rest 38.8 → 7.5 % of a core; 1,358 → 544 CALayers; the list scrolled a frame at a time 97 → 39 %, its
  8–17 dropped frames in 6 s none; the pointer moving over the board 39 → 16–18 %; the glow under it 45 → 21 %; a
  clauding chat opened in 445–570 ms → 220–250. The app keeps the page it loaded: ⌥⌘R takes this one. `npm test`
  and the scenarios pass as on the commit before (one timing test of the server's and `small-motions` flaked there
  too under this Mac's load; two more of the latter's waits now wait for the board instead).
* **Next, by what each would bring for its effort** (not done; measured where a number is given):
  1. *The board at rest while nobody looks* (small; Swift). With the screen locked and the display off the app's web
     process still ran at ~40 % of a core — timer-driven style passes and layouts, no frames drawn — where the
     harness's page, which WebKit hides then, costs 0.1 %: the app's page is not hidden. Hiding the board's web
     view on `NSWorkspace.screensDidSleepNotification` and the lock (`com.apple.screenIsLocked`), shown again on wake,
     should bring it near the hidden page's 0.1 %. Re-measure first: with the four fixes in, less may be left to save.
  2. *The floating header's `:has(> .ptabs[hidden])` rules as a class* (small; `renderTabs` knows when a strip is
     hidden; `UNDER_HEAD` follows). In Chrome they make most DOM changes restyle the whole board — a chat's open spent
     135–190 ms restyling, 40 without them. WebKit showed no difference, so it is the browser's gain, not the app's.
  3. *Fewer cards in the page* (medium). Every lane open here is 400 cards, ~13,000 elements; every restyle, layout,
     hit test and render scales with them. At rest after the fixes, the same board with Idle and Done folded is ~4
     points lower; a render per chat event costs ~60 ms of the main thread in WebKit (1 event a second adds ~6 % of a
     core). The newest few done cards and a *N more* row would keep most of it (drawCards, the lane counts, the
     timeline's runs and the ends all count cards); `content-visibility` on resting cards was tried: 12 → 10.6 % at
     rest but chat opens ~10 % slower.
  4. *Interaction paths* (small each). `wallGo` starts a new 1.1 s transition on every pointer frame anywhere on the
     board; `spotSoon` reads the hovered card's rect every frame and every scroll; `drawTimeline` writes the hidden
     timeline's labels and thumb on every scroll frame and render. Reading the card's rect once on enter, moving the
     glow by one retargeted animation, and not drawing the timeline until it is called would leave a scroll frame
     restyling nothing but what scrolls. After the fixes the pointer moving anywhere costs 16–18 % of a core against
     7.5 at rest, the glow following it 21 %.
  5. *Forced layouts on a clock* (small). `rollIn`'s `void document.body.offsetWidth` on every rolling count — the
     bar's CPU and memory every 3 s —, `phaseAnims`' `getAnimations()` flush after every render and every verb of
     the presence line (3.2 s): each is a full style pass and layout, and in WebKit a layer walk. A rolling count can
     start from a frame's `requestAnimationFrame` pair; `phaseAnims` need only touch animations of nodes made since.
  6. *Done cards dimmed by colours, not `filter: saturate(.45)`* (small–medium): a done card is painted through a
     filter each time it repaints; with a layer each that is no longer every scroll (unfiltered, the tile-painted list
     dropped 24 frames rather than 34–44). Small now, unmeasured.
  7. *A guard* (medium): all four of today's causes passed every scenario — Chrome composites what WebKit does not.
     An `npm run perf` on the made-up board in a WKWebView (CPU at rest and scrolling, against a ceiling), and a
     scenario that fails on a running animation whose target is an SVG child or has no box, a playback rate other than
     1, or a transition on an inherited registered property.
  8. *Memory* (medium, unknown gain): after hours the app's web process held 1.6–1.8 GB (785 MB WebKit malloc,
     630–830 MB graphics) against 463 MB for a fresh page; the graphics should fall with the layers (to be read after
     a reload), the malloc wants a long soak and heap snapshots — Chrome's heap stayed flat over 120 chat opens.

## Decisions of 2026-10-13, after the last — the board no longer updates itself unless asked

Ricardo: "turn off auto-update by default - but still leave alert of a new version".

* **The switch is off to begin with**; the looking is not. The agent still fetches every half hour, and what came is
  the status bar's *N new commits* — the news alone, no *· updates off* after it, since off is now the usual state and
  not a reason worth saying (*changes here*, *diverged* and *once you rest* still are, with the switch on). A click
  opens Settings › Updates, whose line reads *N new commits on origin/main — update now takes them* and whose button
  is *update now*. The About box names the switch only when it is on (*updates itself*).
* **A new key, so the old default goes with it**: the state file's `autoUpdate` was `true` in every file, written by
  each save since the switch came a day earlier, and could not be told from a switch turned on by hand. The switch is
  now `selfUpdate`; the old key is ignored and dropped on the next save, so every board starts off, this one included.
  On is one click (Settings › Board › Updates).
* Not done: with the status bar off, new commits are said only in the settings' line.

## Decisions of 2026-10-13, last — a PR opened again is a tab still at it

Ricardo: "when opening a PR, if the tag address does not start with the PR link, open a new tab".

* **A page opened again is the tab it already has only while that tab is at it** (`pageTab`): its address the page or
  further in — a PR's files, a comment on it, its checks (`atPage`: the page's URL, then `/`, `?`, `#` or nothing, so
  `pull/12` is not `pull/123`). A tab followed somewhere else — an issue, another repo, a run — was showing what it was
  opened at under its old name; opening the PR brought that page forward, not the PR. Now the PR gets a new tab, where a
  new tab goes and in front, and the old one stays where it went. Any tab at the page will do, the one opened at it
  first, so a repo's tab followed into the PR is the PR's too. Every page goes the same way, not only PRs — the chip,
  ⌥⌘G and its picker, a link in the chat, a blank tab's ⏎ — since it is one rule in one place (`openExternal`).
* **A tab is named for where it is**: the strip's label and tooltip read the address (`paneUrl`), not the key's — two
  tabs opened at one PR, one of them followed off it, would otherwise both read `widgets#12`.
* **Two tabs of one page need two names**: the key was the URL, one tab per page. A second is `gh2:<url>`, then `gh3:`
  (`pageKey`) — the shell already reads a key's URL past the first colon, so nothing changed there — and
  `state.paneGh` holds the keys, not the URLs. **A name is never one whose view the shell keeps somewhere else**: a
  closed tab's view lingers until it needs the room, and a key is shown as its view stands, so reopening a PR whose old
  tab had wandered and been closed would have shown where it wandered.
* **A tab clicked is shown as it stands** (`openTab` no longer goes through `showPr`), and **⌥⌘G fills the column only
  from a page at one of the chat's PRs** (the repo with none) — from a page followed elsewhere it opens the PR, as the
  ask reads; a docs page or a run is not what ⌥⌘G brings up (the later-still entry below had any page).

## Decisions of 2026-10-13, later still — ⌥⌘R reloads the board; a tab's key again fills the column

Ricardo: "change the refresh app to hotkey R, and leave the cmd R to refresh webpages and such (or whatever vscode does
with that hotkey)" and "when already focussed and I use the hotkey to open that same pane, just toggle the fullscreen
… I'm focussed on web, then I do hotkey C to focus on claude, if I do again hotkey C it goes fullscreen (like cmd 0),
and I do again cmd C, it goes back to 2 panes. Same for web/terminal/vscode/diff".

* **⌥⌘R reloads the board, ⌘R only ever a page's**: ⌘R was the View menu's *Reload*, the page in the pane while it was
  up and the board otherwise — and a menu's key equivalent comes before any page, so VS Code Web never heard ⌘R. Now
  the menu has *Reload Page* with no key and *Reload Board* on ⌥⌘R (the board's own HOTKEYS has R too, forwarded from
  the pane, and a browser's page answers it); ⌘R is a key monitor's: the page on top of the pane reloads, unless it is
  VS Code Web, which hears its own ⌘R, and with no page up the key goes on to whatever has the keys (the board ignores
  it). VS Code Web's ⌥⌘R, *reveal in Finder*, has no Finder to reveal in.
* **A tab's key pressed again from that tab fills the column with its half**, and once more gives the two back:
  ⌥⌘C on a claude that runs here, ⌥⌘T on a zsh, ⌥⌘G on a page (any — so with several PRs the picker comes from
  another tab, or ⌥⌘←→ walks to them), ⌥⌘E on the editor, ⌥⌘D on the changes. Not ⌘0, which closes the other half and
  merges its tabs into one strip — there would be nothing to give back — but a zoom, tmux's: the other half is only
  hidden, its terminal keeps its size (the PTY hears no resize, so claude does not repaint behind it) and its page is
  not laid over the column. **It holds while the keys stay in that half**: going to a tab of the half behind it — its
  key, ⌘1/⌘2, ⌥⌘←→, a new tab that opens there — brings both back, as selecting another pane unzooms tmux. With one
  half the key does what it always did. The first press only goes to the tab, as before.

## Decisions of 2026-10-13, later — ⌘T on a page is a blank tab

Ricardo: "the opening tab should be more like a browser and open immediately the empty tab to write something, vs the
current popup".

* **⌘T on a page opens a blank tab at once**, a browser's new tab: no dialog — the tab is there, in front where a new
  tab goes, and the keys are in its address, the field the page in front already is in the strip. Under it, in the
  half, the list the box had: what was typed first (an address, a bare host, words to search), then the chat's own
  pages not on a tab, the one ⏎ opens marked, ↑↓ to pick, a click to open. ⏎ turns the tab into the page in its place,
  and the page takes the keys; esc empties the box, then closes the tab (it never held anything); ⌘W and its × close
  it; ⌘T on it opens another. The pickers' `page` mode is gone.
* **What is typed lives outside the markup**: the strip is drawn only when its markup changes, so typing redraws
  nothing; when something else redraws it, the text, the keys and the caret are put back. A closed tab's stand-in,
  folding for 180 ms, is a copy of its markup — the box included —, so the box is always looked for in a live
  `.ptab.blank`, never as `.paddr` alone (the first try threw on exactly that, and left the list standing).
* **The tab in front closed, the one beside it comes forward** — its right, else its left — as a browser's does; the
  half's first came forward before, which sent two ⌘W meant for two blank tabs to one of them and the PR. A zsh's
  neighbour comes forward at once, while the server is still ending it.

## Decisions of 2026-10-13 — ⌘T and ⌘W are the tabs'

Ricardo: "cmd W should close the terminal focused or the webpage focused" and "cmd T should open a new terminal or web
tab".

* **⌘W closes the tab the keys are in**, as a browser's or iTerm's does: a zsh ends, a page or VS Code Web goes, the
  changes close — `dropTab`, what ⌥⌘W and a tab's × already did, so the keys go back to the chat when the half empties
  and a split the board made folds. Its old job, the half, is kept where there is no tab to close: on the chat's own
  tab, which no key ends (✓ does, and claude is not a terminal to lose by a slip), and on an empty half; with one half
  there it is still the window's key. A dialog up still goes first. ⌥⌘W stays as it was — a tab and never more — and
  ⌘0 is the way to close a half from the other one, which the strip's ⨯ tooltip now says.
* **⌘T opens a new tab of the kind the keys are in**: read as the ⌘W line reads, "the terminal focused or the webpage
  focused". In a terminal — claude's drawer, a zsh — and on the transcript, the changes or an empty half, another zsh in
  the chat's folder, as iTerm's ⌘T, at once; on a page, a box for the address, as a browser's ⌘T: what was typed first
  (an address as given, a bare host over https, localhost and the loopback over http, anything else a web search), then
  the chat's own pages not on a tab (its PRs, its tickets, its repository). Either opens where a new tab goes — beside
  the chat, splitting the column the first time. The box is the pickers' own dialog (`pick.mode` `page`), so the pane
  goes down under it as under any dialog.
* **A chat has as many zsh as asked for**: one per chat until now, and a "new terminal" that showed the old one would
  not be one. Each is its own tab, `shell:<terminal id>` — never `shell` for the first, which would hand its key to the
  next when it ended and move the tab — named zsh, zsh 2… by its place. The server's summary carries `shells` (every
  zsh, oldest first) beside `shell` (the first, as before, which the scenarios wait on); `POST …/shell` with `fresh`
  starts another every time, not one at a time as the first is (a second ⌥⌘C on one transcript was the danger; a
  second zsh is none). ⌥⌘T shows the zsh the keys are in, else the first, else starts one; ··· *end the zsh* ends the one
  the keys are in, else the first. The registry's choice of a chat's own process now skips the zsh holders — with
  several, one started before the claude drawer could have been taken for it.
* **The app forwards ⌘T from the pane** (`cmdKeys`), so ⌘T in VS Code Web — its *go to symbol in workspace* — is given
  up for it, as its ⌥⌘W was; ⌘W was the Window menu's already. `npm run check` now holds the ⌘ letters as it held the
  ⌥⌘ ones: one the board answers and the forwarder does not is a failure. → `tab-keys.mjs`, `test/terminals.test.mjs`.

## Decisions of 2026-10-12, night, last — a page's × closes it

Ricardo: "when I click on X on the address bar for a webpage, it bounces and sometime the click release is not on the X
anymore, so it fails to close".

* **The address does not dip, nor does a tab pressed on its ×**: the press dip of 2026-10-11 scaled the whole tab to
  97 % round its middle, and the page in front is a tab up to 560 px wide — its ×, at the left over the mark, moved some
  8 px towards the middle while held. A press near the ×'s left edge was let go off it, and a click whose press and
  release are on different elements lands on what holds both: the tab, which only opens itself. The address is a
  field (it holds the URL and ‹ › ↻ ↗, each a button that dips on its own), so it never dips; a plain tab still does,
  but not under a press on its ×. `pane-tabs.mjs` closes the page by a real press at the ×'s near edge, held while a
  dip would land.

## Decisions of 2026-10-12, night, later still — the board updates itself

Ricardo: "can we implement an auto-update functionality that pull code and restart what's need to update? can be
turn-off in settings".

* **An update is a pull of the checkout the agent runs from, and only a fast-forward**: the server fetches its
  branch's upstream (that branch alone, no FETCH_HEAD, no tags) and moves to it when the branch is strictly behind.
  Never a merge or a rebase, never over a tracked file changed here (untracked files are left be — one the commits
  would write over fails the merge, and says so), and a branch with commits of its own is said to have diverged and is
  left. Sessions commit to this checkout's main, so *ahead, nothing to pull* is the usual answer here, and the right one.
* **Only the login agent looks by the clock** — every half hour, the first a minute after it starts. A server run by
  hand looks only when asked, so nobody's working copy moves because a board was run from it; the agent is known as
  launchd's own child (`XPC_SERVICE_NAME` alone is not enough: a drawer's shell inherits the agent's environment, so
  `npm start` in a drawer would pass for it).
* **Not while you work**: an update waits until nothing has been typed into a drawer, nor done on the board, for two
  minutes — a restart drops the drawers' sockets for a moment, and the app's rebuild quits and reopens it. *Check now*
  is asked for, so it does not wait; with the switch off the line says how many commits are waiting, and the button
  becomes *update now*.
* **What changed starts again, and nothing else**: the packages (`npm install`, then a restart), the server (the agent
  restarted — the drawers stay, each a holder; serve-web goes with the server, as on any restart), the page (it reloads
  itself), the app (`mac/build.sh install`, detached, only when `mac/` changed: the app runs the agent's server and its
  page). Docs, tests and the harness start nothing.
* **The page reloads itself once it is left be**: at once when the update was asked for from it, or while it is
  hidden; otherwise not under a dialog, not while a box has the keyboard, not with a page of the pane in front, not
  within 15 s of a key or a click — and never before the server is back from its own restart, since a page loaded from
  one about to go is half a page (its vendored scripts come after it).
* **A commit that does not start is not kept**: before anything restarts, the new page's script is compiled
  (check-page) and the new server started on a spare port with a state of its own — the tests' throwaway server,
  imported fresh from the checkout. A failure undoes the fast-forward (`git reset --keep`) and holds that commit back
  until a newer one comes, so one broken push to main cannot take every board down with it.
* **The switch is the server's** (the state file's `autoUpdate`, on), as notifications are: one setting for the app and
  every browser. Settings › Board › *Updates* says where the checkout stands; the About box its commit.
* Not done: the agent's plist is not installed again when `scripts/launchd.sh` changes (`launchd.sh install` by hand),
  and the app is rebuilt when the update is taken, not at its own quiet moment — the build takes about a minute.
* **The status bar says it** — Ricardo, after the first cut: "does it says somewhere (like status bar) that an updated
  is available and does it show progress when its happening?" (it did not: only the settings' line). A segment in the
  bar's left, after the clones and like them: *N new commits* and why they wait (*updates off*, *changes here*,
  *diverged*, *once you rest*); the update under way as its step — pulling, installing the packages, trying the new
  page, trying the new server, rebuilding the app, restarting the server — with a bar for how far, and a turning mark;
  *updated · reload the page* while the page waits to be left be (a click reloads it now); *update held back*, *update
  failed*, *the app was not rebuilt*; for a minute after, *updated · N commits*. Nothing while it is up to date — the
  bar is for what wants a look. A click opens Settings › Updates, whose line says the same with the step's number.
* **The app's rebuild is followed to its end**, though the server's restart usually comes a second after it starts:
  the build's pid is kept on the update's record, the new server watches it, and build.sh's last word (`installed →`)
  says whether it went — a failure is said in the bar and the settings, with `mac/build.sh install` to run by hand.

## Decisions of 2026-10-12, night, later — a round of your move let go

Ricardo: "if I click on option and hover on "your move" on a card or chat tile, an X should be there to dismiss this
round (e.g. I don't have anything to do just yet, but want an alert for the next event that trigger "your move")".

* **⌥ over *your move* is an ✕** — on the card's line and on the chat header's (the chat's tile, with tiles on): the
  tag turns red and its PR mark an ✕, as ⌥ over the ✓ shows done for good's and ⌥ over a PR chip its unlink. The whole
  line is the target, not the 15 px tag; ⌥-click lets the round go for every PR of the chat at your move — the card
  says one *your move*, so all of them, or the tag would stay for the next.
* **Let go is the PR's, not the chat's**: the move is the PR's, so every chat that names it stops saying it. Not your
  move, not counted (the Dock, the menu bar, the funnel), no un-tick — but still said, quietly, on the PR's row under
  the header (*let go · pushed since your review*) and its tooltips, so it is not lost.
* **Until the next move**, which is a move like any other: what counts as one is what already did (`newsIn`: a new
  head, a newer word of theirs, a new request), its alert said even though the turn was yours before (`released` —
  the alert had only ever been for a turn coming *from* theirs, or a chat you had ticked). A word of yours that answers
  it ends the round and the mark. Kept on the PR's `prTurns` record, so a restart lets nothing back.
* No undo: the next move brings it back, and a mistaken ⌥-click costs one round's line. Done for good is the other
  way to quiet a PR — for the chat, and for as long as its tick stands.

## Decisions of 2026-10-12, night — a theme is worn whatever macOS shows

Ricardo: "the dark and light themes are restricted to the system light/dark setting, but they should be decoupled".

* **The board picks its own appearance.** The 2026-10-10 themes kept a dark theme for while macOS is dark and a light
  one for while it is light, because the page's dark rules hung off `prefers-color-scheme`, which a page cannot set —
  and forcing it was thought to need the app's `NSAppearance`, which a browser never has. It needs neither: every dark
  rule now reads `<html data-theme="dark|light">`, which the page sets (`applySkin`), with `color-scheme` beside it so
  the native controls and scrollbars agree. A head script sets it before the first paint from what the board wore
  last (`prefs.look`) — the vendored scripts load before the page's own, so without it a dark board on a light Mac
  would flash light at every load.
* **The theme picked is worn** (`prefs.skin`: a theme, or the board's own dark or light — the grid's two own tiles),
  and ⌥⌘Y's arrows preview any theme in its own appearance: no more *it cannot show now*. A board from before wears
  what its slot for macOS's appearance gave it, so nothing changes on the upgrade until a pick.
* **Following macOS stays, as a switch** (Settings › Look, *follow macOS*, off; the launcher's switches too): on, the
  two slots as before, Ghostty's `dark:…,light:…`. A pick fills its appearance's slot either way, so turning it on
  finds the themes last picked for each; turning it off keeps what was worn. VS Code's model: one theme, unless
  auto-detect is on.
* **In the app the window wears the board's appearance** (`{type: 'appearance', dark}` → `window.appearance`; null
  while following): the pane's pages (GitHub dark beside a dark board on a light Mac), the find bar, the ground under
  the page and a page still loading. Kept as `peixairada.dark` so the next launch's window is right before the page
  says. While following, nothing is forced — the board's media query has to keep saying macOS's appearance.
* **The harness follows the emulated colour scheme** (`launchChrome` sets `skinFollow` unless given): `DARK=1` and the
  scenarios that flip the scheme mid-run (simple colours, the PR turn, the README's shots) keep working; `themes.mjs`
  starts from the board's own default and checks both ways, the head script's choice included.

## Decisions of 2026-10-12, evening — the working notes pared again

Claude Code, on starting a session here: "CLAUDE.md is over the 150.0k-char limit (163.9k chars)"; Ricardo: "can we
improve this".

* **The file had grown back into stories.** Pared to its invariants on 2026-09-27, it was 163 863 characters fifteen
  days later — *The board* alone 43 % of them — as each feature's bullet took on its look to the pixel, what it was
  before and until when, and the time of day of each decision. Every bullet is now its rule, the names to find it by
  and the test that holds it, with the date of its decision as the pointer here; related bullets merged (the tokens,
  the accessibility rules, the card's rows, the PR chips). 95 963 characters, the sections in the same order under the
  same headings, so the *→ Findings* pointers and the scenarios' names lead where they did; every identifier and
  selector it names was checked against the tracked sources. Two things it did not say and now does: the fakes' files
  say their own knobs (`faketask.mjs` was missing from the layout), and a page edit is loaded once before it is called
  done (`typeof window.peix`).
* **A budget with teeth**: `npm run check` fails when CLAUDE.md is over 120 000 characters and says where the stories
  go — Claude Code's own warning comes at 150 000, after every session has paid for the excess. The file's head says
  so: a bullet is not a story.
* **Nothing is lost**: the file as it stood is at the end of this one, verbatim, under *Findings — the working notes as
  they stood on 2026-10-12*.

## Decisions of 2026-10-12, later — your move is a filter, not a lane

Of the morning's lanes (T1, below): "I think "your move" should be a filter that I can trigger maybe on new "filter"
button on manu bar. I still like to have clauding first, and then the rest order by last update. filtering by "your
move" should be an add-on, not the main view".

* **The lanes are Asking you · Clauding · Ready · Idle · Done** again but for Idle: a chat at your move is where its
  last word puts it (a PR come round to you still counts as one, `movedAt`), and so is a chat with a new reply — a lane
  of its own above Ready was the same break in "the rest order by last update". Asking you stays over Clauding, as it
  was before the morning: it is a turn waiting on you, and rare. Idle stays: it is the tail of that order, folded.
* **The funnel** (`#fBtn`, after the magnifier in `#filters`, so in the status bar — the board's bar at the foot; the
  list's foot with it off): *Every chat · Your move · New replies*, each counted in the project in view, the choice
  ticked; on, it names the filter and its count. New replies came along because it is the same kind of thing — a
  question you ask of the list now and then, which the morning made a lane. Done chats are in neither; a clauding chat
  is in Your move (the PR waits on you all the same). A filter shows every match, folded or not, so the heads it draws
  do not fold, and *All caught up* is not drawn under one. Kept in the prefs, as the person the list is narrowed to.
  The menu is the right-click's (`ctxShow`), its rows able to be choices with a mark and a count.
* What the morning built for the two stays: the server's `seen`, the rail's dot (`data-want` now, not the rank), cards
  by lane making those cards large, the Dock's badge and the menu bar counting new replies.

## Decisions of 2026-10-12 — the UI/UX review, built

A review of the board (a page of 38 findings, each a letter and a number) got: "do: T1, T2, T3, T5 · L1 — let's try
to do this dynamic card sizing, but make it an option. also, compact size should be the default. · L3–L7 · C1, C2, C3,
C5, C6 · V1–V5 · W1–W7 · A1–A5 · P1, P2 · can we add a cool ascii art to homescreen like this one:
https://ascii.rest/ocean-sunset/ ?" Not asked for: T4 (a motion budget), T6 (cards reachable by keyboard,
pickers a screen reader can use, a ✓ naming its chat, a live region), C4 (type to resume). One commit each, below in
the order they landed.

* **T2 — a snippet is markdown as a sentence** (`plain`, server): cards showed `[a link](https://claude.ai/…)`,
  `## a heading`, `- an item` and a PR's whole URL over three lines. A link is its words, a heading or a quote loses
  its marker, an item starts with ·, a table's cells sit in a row, bold and emphasis go; a GitHub PR or issue URL is
  `repo#n`, any other loses its scheme and its long segments. For the last prompt, the last reply and the tiles'
  words; a tool's input and result stay as they were. **Backticks stay**, and the page draws them as code in a title, a
  card's snippet, the pickers, the header, the tiles and home (`ticks()`, `code.icode` — `.ic` is the icons' class).
* **C2 — an MCP tool by its server and its name** (`toolName`): `mcp__claude_ai_Slack__slack_search_users` is *Slack:
  search users* — the server's prefix (`claude_ai_`, `plugin_<pkg>_`) and the tool's repeat of the server dropped — in
  the transcript's rows (the raw name their tooltip), a folded run's summary (counted by that name), the card's live
  line and the tiles. A colon, not ·, which the summary already uses between its parts.
* **L4 — a long path keeps its end** (`pathTail`): the live line cut `Read /private/tmp/claude-501/-Users-…` at its
  end, the file name lost. Word by word: in the chat's folder a path is from there, under a home it starts at `~`, and
  one still over 34 characters is `…/` and its last two segments. The card's live line and the tiles; the transcript's
  rows keep the whole path, which is a link there.
* **T5 — a day's label is over its cards** (`dayBefore`): under its run, *today* sat between a chat from a minute
  ago and one from yesterday and read as yesterday's. Over the lane's first card and every card whose day is not the
  one before, at the left with a hairline after it — none in a lane whose cards are all from today, where it says
  nothing the lane's head does not. **The day by name** (`dayOf`): Today, Yesterday, the weekday within the week,
  then DD-MM-YYYY — the transcript's day lines too. Not sticky: the list's top pill and the FLIP slides would have to
  learn about it, for a label never far from its cards.
* **T1 — Ready, split three ways, and your move a lane** (`rankOf`): the board had 106 ready chats, 77 untouched for
  a week, 13 of them with a PR waiting on you. The lanes are *Asking you · Your move · Clauding · New replies · Ready ·
  Idle · Done*. **New replies is the server's**, not the page's unread count (which is the alerts a page saw while it
  was open, and starts again at every reload): `seen` in the state file, when the board last showed each chat — the
  page posts it on opening one, and when a reply lands in the one in front — and a reply after it is new. A chat never
  shown counts from `seenSince`, the first boot that kept this, so the board did not wake to a hundred new replies.
  Read in the browser or the app, a chat is read in both. **Ready is a chat whose last word is from today or the three
  days before** — four calendar days, so Friday's chats are still Ready on a Monday — and **Idle** is older, folded to
  begin with; a board saved with only Done folded gets Idle folded too, once (`lanesIdle`), one that opened every lane
  (the harness) keeps it. A clauding chat stays Clauding whatever its PRs say. *All caught up* now means no question,
  no PR at your move, no new reply and nothing ready. The overview's fourth column is *New replies* (the server's, or
  the page's unread count while it has one). Your move and New replies left the lanes the same day, for a filter (the
  entry above).
* **L1 — compact by default, and cards by lane, a switch**: compact (the title, its chips, the question and your
  move) is the default; a board saved on large — the old default, saved with every pref — moves to compact once
  (`cardsMoved`), medium stays. *By lane*, under the slider and off: a card in a lane that wants you — asking, your
  move, clauding, new replies — is large whatever the slider says, the rest at its size; a class on the card
  (`.roomy`, from its rank) and an attribute on the list, so the switch, like the slider, redraws nothing. The harness
  starts its pages on large (the scenarios read the cards' words); `card-sizes.mjs` asks for the board's own.
* **L3 — a chat running elsewhere wears a terminal's mark**, not *CLI*: its tooltip says where (a terminal outside the
  board, or outside it) and that ⌥⌘C takes it over here. A drawer here still says nothing; VS Code's own chat still
  nothing on the card; *VS Code too* still a chip.
* **L5 — the lower end's pill at the right**, on a fog 24 px tall (30 before): centred, it sat on the last card's *your
  move* line, which is left-aligned — the right of a card's last line is where it is most often empty. The upper one
  stays centred (a card's top row ends in its ✓ and chips); on the rail, both centred. At the list's end the pill and
  its fog are gone, so no padding was needed.
* **L6 — the rail says more**: a short name of three letters or four set smaller, so *WAI* fits its square rather than
  lose its end; a dot at a square's corner for a PR at your move (the accent's diamond) or a new reply (green) — what
  has no ring or red edge to say it — and an idle or done square dimmed; and **the lanes fold there too** (they did not,
  and the rail showed every done chat): a lane's head on the rail is its mark and its count, a click folding or opening
  it as in the list. Two chats of one project are still alike but for those marks; the tooltip names each.
* **T3 — the chat header keeps its title**: a chat with thirteen PRs had its title cut to *Sync user accou* by eleven
  chips. **Two chips at most**, the PRs at your move first, the newest move first (the one the move's line names);
  the rest behind **the whole count** — *13 PRs · 3 tickets ▾*, which is the toggle of the list of them all — or `+n ▾`
  where even that is too wide beside one chip; and the title keeps **40 % of the row** at least, beside the old floor
  (its repo name and `TITLE_ROOM`). Both counts are in the markup and measured in the one layout. The notch keeps two
  chips right of the housing (six before).
* **C1 — Claude's prose keeps a measure**: at 1700 px a line ran to ~200 characters. Its paragraphs, lists, quotes and
  headings stop at 80ch; a code block, a table, a rule and an image take the width they need. Your bubble was already
  capped. The conversation is not centred: the bubbles on the right and the words on the left stay where the eye knows
  them.
* **C3 — the resume bar says what you need to act**: *Claude isn't running in this chat*, and a second line only when
  there is something to know — last used in VS Code (resuming moves it here; the tab there will not follow), a folder to
  clone first, a folder gone, no folder known, a failure. *What you see is its transcript … Resume runs claude --resume
  on it, in a terminal here* went: the button's tooltip says what it runs.
* **C5 — the editor's tab is its folder**: VS Code Web's address read `127.0.0.1:7332/?folder=%2FUsers%2F…`; in front
  its tab says *VS Code · storefront* (the URL's `folder`), the URL in the tooltip, and a click still copies it.
* **C6 — in the light theme the header is light**: the black right of the project's name was the heaviest thing on a
  light page, and Latte's header showed a light one reads. In the board's own light theme the black (`--crust`) is the
  panel and the header's borrowed inks (`--hd-*`) are the light ones — the splitter's black with them — **but not at
  the notch**, where the black is the camera housing's colour and the header's right is the housing's own. A theme
  still sets its own; a near-black project's grey (`darkchat`) is not needed on a light panel.
* **V1 — the overview's empty columns step aside**: on the live board three of its four equal columns said *none* and
  both live chats sat in a quarter of the screen. An empty column is its head and its 0, narrow and dimmed; the full
  ones share the width. (The class is `.nil`: `.empty`, the first try, is the log's own message, 30vh down.)
* **V2 — the small terminals show the work**: a tile keeps the bottom of a drawer's screen in view, and the bottom of
  Claude Code's is its prompt box, its status line (tokens, cost, the model) and the agents' list. From the upper of
  the prompt box's two rules of ─ (the last two near the bottom) down, the screen is moved below the tile's edge, so the
  work and the spinner sit at its foot; re-read a quarter second after the screen changes. Not on a chat asking you:
  the choices are where the prompt box was. **A stack tile's tail starts under its head** — it sat at the foot over
  two-thirds of empty black — unless it is longer than the tile, when its newest rows are the ones kept.
* **V3 — a zero says nothing in colour**: home wrote *0 asking you*, *0 at your move* and *waited on you 0m* in red,
  and the overview's chips a red dot by *0 asking you* — an alarm for nothing. A count is red or amber only when there
  is one; the overview's chip of a zero is muted, its dot grey.
* **V4 — home's day starts with the day's work**: from 8:00 (or earlier), an evening's work was a sliver at the right
  of a fourteen-hour axis. It starts at the hour half an hour before the first span, still not before midnight, and
  runs to the hour after now.
* **V5 — home is called home, and its counts go somewhere**: the header said *Pick a chat* over it; it says *Home*. A
  count with something behind it is a button in the line's own type, dotted under: *asking you* opens the chat asking,
  *live*, *clauding*, *at work* and *watching* the overview, *at your move* the launcher's PRs. Under the palette's
  blocks, the keys a new board most needs: ⌥⌘L, ⌥⌘K, ⌥⌘N, ⌥⌘A and ?.
* **Home's ASCII art — the sunset itself, and our fish in it**: *ocean sunset* (ascii.rest, by bas3line, MIT — its
  notice is in the code with it) is ported from its TypeScript as it stands: the sun past a pine headland, cloud lit
  from below, a glitter path, swells, a sloop, shaded per cell on a 200 × 100 grid and drawn as a halftone of · • ●.
  It is home's fastfetch logo, where the pixel fish was, ~520 px wide beside the facts. **The board's part**: the fish
  (`FISH`, at .85, mirrored and tilted along its path, never past ~43°) leaps across the sun every 16–40 s, a spray
  where it leaves and re-enters the water — and on a click. **Drawn cheaply**: each glyph drawn once into a mask, the
  palette blended over the scene's ground into a table, and every frame written into one ImageData — 15 fps, 18 ms at
  worst between frames in WebKit — only while home is on screen and the page in view; one still frame, the fish at the
  top of its leap, under reduced motion. The canvas outlives home's draws (the facts are redrawn every few seconds),
  which now go into boxes of their own.
* **W2 — the stale words**: the tiles switch's label (it described the stack: *the panels as tiles, Hyprland's way*
  now), the status bar's label and tooltip (they listed the chats, the drawers and the shells, gone from the bar), the
  same-height tooltip (*blinking* — the card pings), ···'s tooltip (code folding, gone since 2026-09-28), and the empty
  column's *Pick a chat on the left* hint, which home always replaced: the element stays, the sentinel `leaveChat`
  knows home by, with nothing in it. The lane heads' tooltips were T1's.
* **W3 — one word per state**: a chat waiting on your answer is *asking you* everywhere — the status bar (*asking*
  before), a notification's heading (*Claude needs input*), the app's menu (*Needs your input*, *Nothing waiting on
  you*); a monitor's state is *watching* in the bar too (*N monitors*; the card's chip still names the task, *monitor ·
  …*); *your move* is a PR's alone (the status label said *ready — your turn*); the overview is *Overview*, not *All
  agents* (a card's *N agents* are sub-agents); the terminal is *Claude in its drawer* or *Claude here* (*claude
  session*, *the pane*, *holder* in the Keys); and Claude has its capital in the words (`claude` stays in commands).
  Where a chat runs says *a drawer here*, *a terminal elsewhere*, *elsewhere*, *not running* — CLI, live and stale
  were the entrypoint's words.
* **W5 — a box says what it searches**: five chat finders, five scopes. ⌥⌘K's placeholder says *every project,
  asking, clauding or ready*; the list's own box (⌥⌘F) *this project's chats, done too*; the new-chat steps already
  named theirs. **The launcher's prefixes went under its list** (`#pickfoot`, `PICK_FOOT`): its placeholder was cut off
  at *@ proje*; it says *Anything — chats, projects, PRs, tickets, actions*, and a line under the rows has `>` `#` `@`
  `!` and → into a menu.
* **W4 — what wants you can be clicked, and counts one thing**: the status bar's *N asking you* is a button that opens
  the chats asking you one after another from the one open (`nextAsking`). With a project in view, a line over the
  lanes says how many ask you in other projects, and a click is ALL. **The Dock's badge and the menu bar's count are one
  number** — the chats asking you and the ones with a new reply (`wanting()`, posted as `needs` and `replied`) — where
  the badge counted the alerts that came while the app was in the back, and the menu bar the questions; the status
  menu lists both, a section each, and the page's title counts the same.
* **P2 — the menu bar's menu lists what wants you, and what is at work**: *Asking you*, *Your move* (each chat with a
  PR at your move, the newest move's PR before its title), *New replies* and *Clauding*, a section each, twelve rows at
  most, each opening its chat; only the first and third are counted on the icon.
* **P1 — a notification can be answered where it shows**: the app's banners carry a category. A reply on a chat whose
  drawer runs here: *Reply…* (a text box; what is typed goes into the chat's Claude), *Done* and *In 15 minutes*; a
  reply elsewhere: *Done* and *In 15 minutes*; a question or a PR's turn: *In 15 minutes* alone — a ✓ ends the chat's
  processes, and a question is Claude waiting, so it is not ticked from a banner. Reply… and Done go through the page
  (`peixReply`: the drawer over the page's socket to it when the chat is open, else one opened for the reply and closed,
  which sends no size; `peixDone`: the card's own tick, where the card offers one); the snooze is the same banner again
  fifteen minutes later. A question's answers are not buttons: the transcript has them only once answered.
* **W1 — the Board settings in sections**: one flat list of fifteen switches and more, behaviour mixed in with looks.
  *Alerts* (notifications, sounds), *Chats* (the cards' size, by lane, same height, auto-resume), *Look* (simple colours,
  the theme, tiles and theirs, the floating header, the status bar and its stats), *Terminal* (⌥ as Meta) — and
  *Lights and motion*, folded: the rings in step, the light under the pointer, and the edge light as **a choice, card
  light *ring* or *edge*** (its checkbox stays, hidden, so the launcher's Toggle row still flips it). Every id kept.
* **W6 — the keys from one table, grouped and checked**: about forty keys in code order, each a sentence long, kept by
  hand in three places. `KEYS` is the one list — what you press, its group (*Go to · This chat · Layout · Look · In the
  drawer · In a page*), one line, the rest as its tooltip (on the ? sheet, a second line), and the codes it is in the
  maps — and the Keys pane and the sheet are drawn from it; ⌥⌘O's row says *a new chat in oracle*, not *oracle —
  oracle — a new chat there…*. `npm run check` holds HOTKEYS, CMDKEYS and the app's `boardKeys` to it. The sheet's
  filter hides a group's head with its rows.
* **W7 — a right-click is a menu**: taking a PR off a chat and letting go of a colour were ⌥-click alone, a rename a
  double-click, a tab moved across a drag. On a card the menu has Open, Rename…, Done (or Done for good, or Back on
  the board), Take #n off this chat for each PR and Copy its link; on a PR chip, Open the PR and Take it off this chat;
  on the colour square, Pick a colour… and Let go of the colour. ↑↓ walk it, a click elsewhere puts it away; in a box,
  a terminal or the transcript's words the system's own menu stays. **The keyboard's way is the launcher**: the open
  chat's rows now include Rename it, Take #n off it, Move this tab to the other half and Let go of its project's colour.
  (The menu's first build put a `const` from further down straight into a listener — the page stopped at load until
  the next save. `check-page.mjs` compiles; a load is what finds that.)
* **A1 — the light theme's small text reads**: ratios from the tokens put the PR chips at 3.15 (open) and 3.17 (draft),
  the ticket chips at 3.08 and 3.64, the *your move* tag at 3.60 in 9.5 px, the unread badge at 3.90, the Clauding
  lane's head at 2.90, the asking red at 4.05 (4.21 in the dark, where it was never redefined), a done card's snippet
  at 2.15, the day lines at 3.34, the code's comments at 2.56 — against AA's 4.5. The state fills and the ticket fills a
  shade deeper in the light, the page's ground still their ink; the unread badge deeper in both; a red for each
  theme; the tag the accent mixed towards the ink; the lane's head and the day lines the plain muted ink; the
  comments darker; and **a done card dimmed by colour** — its title and snippet muted, the card desaturated — not by
  `opacity: .55`, which dimmed the text with it.
* **A3 — a state said in words, out of sight**: on the rail and under a query no lane head names a card's state, the
  CI badge was an SVG with no text, a tool row's mark too, and the unread badge a bare number. A card now starts with
  its lane's name — and *watching*, *N agents at work* — in `.vh` (clipped, read; the rolling counts' `.rv` pattern);
  a CI badge says *CI passed · failing · running* (not in a PR row, which says it already); a tool row's mark is an
  image named *running · done · failed*; the unread badge is labelled *N unread*.
* **A4 — tabs that say which is in front, a menu that keeps its focus, a terminal a reader can follow**: the settings'
  tabs carry `aria-selected`, their panels are `tabpanel`s, and ← → walk them; each half's strip is a `tablist`, its
  tabs `aria-selected` (the page in front, a `div` with buttons in it, is a focusable tab too); ··· says it opens a
  dialog and keeps the focus `show()` gives its first row (it blurred it, which left a keyboard nowhere —
  `:focus-visible` draws no ring for a pointer's open); *screen reader* under Terminal turns on xterm's
  `screenReaderMode` in every drawer (`prefs.termReader`, off); and the small terminals of the overview and the stack
  are `inert`, so their helper text areas are out of the tab order.
* **A5 — Increase Contrast, Reduce Transparency, forced colours**: none were heard. With macOS's Increase Contrast
  (`prefers-contrast: more`) the muted ink comes nearer the ink, the lines and the controls' fills are stronger, every
  control that is a fill alone gets an edge, a card its border and its words the ink. With Reduce Transparency the
  overview's and the list's ends' blurs go solid. Under forced colours a card is outlined in the system's text colour,
  the open one in its highlight, and the marks that are colour alone (lane dots, the rail's dot, the CI badge, a tool's
  state, the counts) keep theirs.
* **L7 — a type scale and radii**: the CSS used eighteen font sizes from 9 to 19 px in half-pixel steps and fourteen
  radii, one of each a rule wanted. Seven sizes (`--fs-2xs` 10 · `--fs-xs` 11 · `--fs-sm` 12 · `--fs-md` 13 ·
  `--fs-base` 14 · `--fs-lg` 15 · `--fs-xl` 18) and five radii (3 · 4 · 6 · 10 · 14 px), every `font-size`, `font`
  shorthand and single `border-radius` in the page's CSS moved to the nearest — 9 and 9.5 px up to 10, the halves to
  the size above or below, 16 down to 15, 17 and 19 to 18. 14 px is a step of its own: the header's title, measured
  to the pixel round the camera housing, kept its size. The rail's four-letter names keep their 8.5 px. A page-wide
  zoom (A2) is one variable away now, but A2 zooms the page itself.
* **A2 — the whole board larger or smaller**: every size was in px, ⌘+ and ⌘− zoom only the chat and its drawer,
  and the app's board view had no magnification. *Text size* under Look — 90, 100, 110, 125 or 140 % — is the app's
  web view's `pageZoom`, so the page's CSS px stay its own and everything inside it agrees; what crosses to the shell
  is turned between the two there (the pane's rects, the housing's place, the pane's edge). Not CSS `zoom` on the
  root: rectangles read back and written again as CSS (the list's slides, the notch, the trail) would have been scaled
  twice. In a browser the row says to use its own View → Zoom.

## Decisions of 2026-10-11, towards midnight — the README's screenshots again, and what a chat has beside it

Ricardo: "readme screenshots needs a refresher. also, highlight the features like opening terminal, github, vscode in
chat and different configurations".

* **The shots are the board as it starts now** — tiles, the floating header, the status bar — and seventeen of them,
  not seven: the board in both appearances, the chat with what is beside it, its changes, the overview, home, the
  launcher (⌥⌘K's picker before), the cards and the timeline, and six looks (tiles off, the rail, the stack, compact
  cards with the edge light, a dark and a light theme) beside simple colours. **WebP at 92**: the grain made each PNG
  megabytes — 3.9 MB for the seventeen against 12 for the seven.
* **A new section, *Everything about a chat, beside it***, under the hero: one shot of a chat with Claude Code in the
  drawer, a zsh, the PR and VS Code Web on tabs in the other half, the PR's row open under the header — and a table of
  the keys (⌥⌘C T G E D, ⌘2 · ⌥⌘2). The two feature bullets it replaces went from the list. A second section, *Make it
  yours*, is the looks; the simple-colours pair moved there from the top.
* **The pane is the app's, so the shots fake its shell**: the bridge as `pane-tabs.mjs` fakes it, and every page the app
  would put in a native view over a half is an iframe there. **VS Code Web is the real thing** — a `code serve-web` of
  the script's own on the made-up repo (its own server data; the user's settings it reads from the browser seeded into
  IndexedDB by a page of its origin first: a dark theme, no welcome, no trust prompt, no AI panel), behind a small proxy
  that drops serve-web's `X-Frame-Options` and `frame-ancestors` and passes its sockets through; Quick Open, typed over
  CDP, opens the card's stylesheet, the uncommitted edit in its gutter. Without the `code` CLI that shot goes without it.
  **GitHub's page is not drawn**: it cannot be framed, and the made-up PR is nobody's — the PR is its tab in the strip
  and its row under the header, which is the board's own drawing of it.
* **Claude Code in the drawer is the fake claude, drawing a screen the script writes** (`FAKE_SCREEN`, wrapped at its
  words to the drawer's width as Claude Code wraps): the banner, the turn's tool calls, the edit's diff, the reply.
* **The made-up board is made up all the way**: the Mac's CPU and memory (`/api/stats`) and the snapshot's user and host
  (the home's `user@host`, the About box) are answered in the page, as the plan usage was; the storefront is a git repo
  with the chat's edit uncommitted, so the changes tab and VS Code's gutter show it; the PRs carry people, CI and one at
  your move, so the faces, the CI marks and the *your move* tag are in the shots.

## Decisions of 2026-10-11, late night, later still — the WebKit check in the repo

Ricardo, asked whether the check that found the rings' bug should join the harness: "continue".

* **`npm run webkit`**: a body of script on the live board in a `WKWebView`, what it returns printed — `verify` in the
  app's engine — and with `--shot` the window as WebKit's compositor drew it; `--then` runs a second body on that
  frame (`shot.px`, `shot.where`), so what is measured in the drawn pixels is written in the page's language, not in
  Swift. `scripts/webkit.swift` is compiled on first use into `node_modules/.cache`; `npm run check` type-checks it.
* **One pixel on screen, not 1 % opacity.** The first check's window was at 1 % alpha, and its capture comes back
  premultiplied by it — 3 of 255 — so every colour read back in steps of 85: a pure red light survived, a glow would
  not have. Wholly off a screen, WebKit hides the page and runs no frames. Opaque, and placed so that one pixel is on
  the main screen, in a corner no other screen touches, the page is visible, the frame whole and the colours exact
  (drawn from the display's space into sRGB). The earlier entry's "its colours intact" was wrong.
* **What it showed**: the rings' bug again on a page of two rings — a start set on a running ring left them drawn 65°
  apart while the script read them equal; the current time and then the start put them together. And the wallpaper's
  glow, not watched in WebKit before (the screen had locked): at rest at 88 % 6 %, part of the way 300 ms after a move,
  under the pointer once the ease ends.
* The board opened there starts from no prefs but auto-resume off (`PREFS` over them) — the app's defaults — in a
  store of its own: nothing of the app's carries over, or back.

## Decisions of 2026-10-11, late night, after — rings in step in the app; a 24-hour clock; the title under the housing; the wallpaper's glow follows the pointer

Ricardo: "the "rings in step" seems to not be working"; "I want 24H format in status bar"; "now that we have a
floating header, seems like we have just about the space to have the tile always on the left and if it goes to the
middle where the notch is, they do intersect? if they do, just try to lower a couple pixels until they don't collide";
"the background glow behind the tiles could move with the cursor".

* **The switch worked in Chrome and nowhere else.** `phaseAnims` set each ring's `startTime` (0, or a time hashed from
  the chat's id); the script read it back, the harness's Chrome drew it, and `card-signals` passed. In a `WKWebView` —
  the app's engine — a transform animation is the compositor's once it has run a frame, and a start set after that
  never reaches it: twelve rings made and phased at six moments (in the task that made them, a frame on, inside a
  frame, two frames on…) and captured from the window itself (`CGWindowListCreateImage` on a window at 1 % opacity,
  its colours coarse but a red light plain — see the entry after): every running ring stayed where it began, and one pending one too, while every one read 0. A
  card rebuilt within its frame was phased in time, which is why it mostly looked right; the switch, which re-phases
  running rings, moved none — what Ricardo saw.
* **The current time first, then the start.** Setting `currentTime` reaches the compositor in both engines; it leaves a
  pending animation's start unresolved, so the start is set after it, which also makes Chrome's exact (it read
  2e-13). The same twelve, and the live board's two clauding cards (one ring remade 700 ms late, then the switch off
  and on), came out in step in WebKit; off, each at its own.
* **The status bar's clock is on 24 hours** (`hourCycle: 'h23'`, two digits: 09:05), whatever the locale says; it
  read the time as the transcript's who-lines do (8:47 PM in an English locale). The who-lines and the home are left
  as they were — the ask was the bar's.
* **The floating header's title stays on the left and runs on under the housing** ("tile" read as the title: the one
  thing in the header that moved for the housing). It jumped the housing whenever its whole text did not fit left of
  it (`.tright`, 2026-09-28); with the header dipping round the housing there is a line's room under it. Measured with
  tiles, the housing 32 px tall: the tile's line round it ends at 34, the title's glyphs began at 35.4 in Chrome and
  36.4 in WebKit — so they did not quite collide, but touched. The header is lowered by what the glyphs need to clear
  the line by 2 px (`HEAD_CLEAR`): a pixel in Chrome, none in the app. Lowered as a whole (its top margin), not padded,
  so its row stays centred; the glyphs' top is measured from the title's own text and `Hdl`, so two chats' titles
  lower it alike and the header does not hop between them. Without tiles the header sits 10 px higher (no gap above
  it) and would want 14 px — not a couple — so there the title jumps as before (`HEAD_DROP_MAX`, 8). The chips stay
  right of the housing: the h2 reaches its far side at least.
* **The wallpaper's bright glow follows the pointer**, eased (1.1 s on `--ease-out`, retargeted every frame, so it
  trails like light under glass) and left where the pointer leaves the page. The glow was a gradient on the body's
  ground; moving that would repaint the window under the board on every move, so the wallpaper became a fixed layer of
  its own (`#wall`) and the glow a child of it moved by a transform — the compositor's. Its size and colour are what
  they were, so at rest nothing changed; it shows only in the tiles' gaps, so the effect is the gaps near the pointer
  lighting. A switch under tiles (*the glow follows the pointer*, on), as the board's looks are; still under reduced
  motion.

## Decisions of 2026-10-11, late night, last — the header's black fades in smoothly (Round V, S8)

Ricardo, on the pixel dissolve an hour after it was built: "present me some alternatives to that project | title
separator - not sure I like this iteration"; on the sheet of ten (Round V: an arrow, a slant, a round cap, a pixel
chevron, racing stripes, a halftone, a lit seam, a smooth fade, a badge, a breadcrumb): "Build S8".

* **A plain gradient where the pixels were.** The black's first 48 px are masked from transparent to whole, from 8 px
  after the project's name to 8 px past where the black used to begin; the separator's span keeps 32 px, so the title
  sits where the dissolve had put it (30 px right of the hard edge). `HEAD_FADE` and its mask went.
* **Built in a worktree** (`sep-smooth-fade`, from local `main`): another chat had the main checkout's `index.html`
  open with work of its own, and the board's agent serves that checkout's `public/`; picked onto `main` once that chat
  had committed.

## Decisions of 2026-10-11, late night, later — a new chat's drawer under the floating header; the overview closes on nothing

Ricardo: "when opening a new chat the initial part is now covered by the floating top bar. can we the chat not as high
initially so it's not covered?" and "on the all agented overview, if I click on the empty space it should dismisss the
view".

* **A click on nothing closes the overview**, as Mission Control's does. It closed only on a click that landed on the
  dialog itself — its padding, a few pixels round the edge; the columns fill the window, so the room under their tiles
  and their heads were the columns' and did nothing. Now anything that is not a tile or a control (a button, a link, a
  box) closes it, the bar's words included. A press that began on a tile and was let go off it — a selection dragged
  out of a tile's tail — lands its click on the column, so the press has to have been on nothing too.
* **What covered the new chat**: the floating header lets a half with no strip run up behind it — the transcript pads
  only its words, the drawer was simply taller (late morning). A terminal draws from its top: under `tui: fullscreen`
  Claude Code puts its banner on the second row and pins its prompt to the bottom, with the gap between, and a zsh's
  first prompt is its first row — so the start of every new chat, and of every /clear (how most chats here begin),
  sat behind the header. Read off the live drawers' screens through their holders (`{t:'snap'}`, read-only).
* **A drawer starts under the header while its screen has room, and runs up behind it once full.** Room is the
  longest run of blank rows on the screen: a full fullscreen claude has a blank first row and one over its prompt, so
  two at most is full; back under takes room for the rows the header covers and four more — a /clear, a /compact, a
  zsh's `clear`. The band between is so that the grow, which shows those rows again, does not undo itself; and a want
  is acted on only when seen twice 200 ms apart, since a repaint read between its clear and its draw is a blank
  screen. Every change is a resize and a whole Claude Code repaint, sent at once. Kept per drawer, so a chat switched
  back to comes up as it was left; a drawer never seen starts under unless it is a resume. Always under was the other
  way — it gives up the rows behind the header for good, which the floating header was for.
* **With the focus view it moves at turns**: the view shows the prompt and the latest step, so a turn under way has
  room and sits under the header, and a long final reply fills the screen and runs it up behind — a resize each way,
  at a moment Claude Code repaints anyway.
* **The fake claude draws as `tui: fullscreen` with `FAKE_TUI=fullscreen`**: the alternate screen, the transcript from
  the top, the prompt pinned, a reply growing in place. Its usual drawing is bottom-anchored (the transcript scrolls
  up above the live region), where the top of a new chat is blank anyway and nothing was ever covered.

## Decisions of 2026-10-11, late night — the header's black dissolves in; the fish eats

Ricardo: "on the chat bar, the transition from the background color and the black bar with the title of the chat could
be faded in pixel form" and "the fish on status bar could blurp some bubbles to the front, so he can it eat - make it
more fun, like a pet".

* **The header's black comes in over a pixel dissolve.** The black right of the project's name (`.shead::after`) began
  on a hard edge at the separator; its first 40 px are now masked by `HEAD_FADE`, a 10 × 16 pattern of 4 px pixels,
  each column a tenth more black. Tried on the made-up board at 2× (the Retina scale): a Bayer matrix read as a
  checkerboard, R2 and interleaved-gradient noise as diagonal or vertical stripes, plain random noise as clumps; blue
  noise — best-candidate ranks, the lowest of each column kept so every column has exactly its share — reads as the
  black dissolving. 2 and 3 px pixels were finer sand; 4 px reads as pixels at the header's 14 px type. The 26 px
  between the name and the title was too narrow for a fade (a 24 px band was a strip of checks), so the separator's
  span keeps 32 px and the band reaches 4 px past it each side: the title starts 30 px further right. `--hsplit` still
  says where the black is whole, so the notch's check and the open chat's light are unchanged.
* **The status bar's fish eats.** Now and then (2.6 s ticks, half the time at rest, a third at work, only with nothing
  out) it blurps one to three bubbles 16–44 px ahead of itself — never past where it turns — which bob where they land.
  It swims on to them; within 6 px its lips go (an open mouth, the swimmer's own path), within 10 px it darts at three
  times its pace, and at its mouth the bubble is drawn in and its body swells. Every third one gulped, a burp rises (the
  rising bubble it used to make at rest, which this replaces). A bubble it turned away from rises and pops after 12 s.
  The pointer on the fish is a pat: it wiggles (the whole fish turned, a group inside the svg — the svg's transform is
  the swim's) and blurps one. Its click is still the overview.
* **No layout in the loop.** Where the fish is comes from the swim animation's own clock and the lane's width, the same
  arithmetic as its keyframes, so the frame loop that watches for a bite reads no rect — and it runs only while a bubble
  is out. The dart is a playback rate (`swimPace`), so the scenario that read the rate at rest reads it net of a dart.
* **Not done**: food dropped by the user (a click is the overview's), or the fish following the pointer — the swim is
  one animation on the compositor, and steering it would make it the main thread's.

## Decisions of 2026-10-11, night, later — VS Code Web on its newest build before it is opened

Ricardo: "sometime when opening VScode, it's starts downloading the newest version I guess. can we auto-update in the
background so I don't want for the update when I need to open vscode?"

* **What the wait was**: `code serve-web` serves VS Code's newest release, checks for one hourly, and fetches a build
  only when a page asks for it — the pane opened after a release got serve-web's 202 "downloading" page until the
  build was in (that afternoon: 1.141.0, the minute he opened it). The board restarting kills serve-web with it, so a
  fresh one asked again.
* **The board fetches it ahead**: once an hour (90 s after boot first) it asks VS Code's update service which build is
  the newest and, when serve-web's cache has not got it, asks serve-web for that build by name (`/stable-<commit>/`):
  serve-web answers 202 at once and downloads it in the background — 13 s, measured against the real CLI and update
  service, into a throwaway data dir. Not the root: that starts the newest build's server (a few hundred MB of node)
  even when nothing is new, so the board asks for nothing while the cache has the newest, and starts serve-web only
  when there is something to fetch. After a download serve-web starts that build's server and lets it go after an
  hour with no one on it.
* **A new call leaves the Mac**: the update service, hourly, only with a `code` CLI — the README's list says so, and
  `VSWEB_FRESH_MS=0` turns it off (every test server).
* **Not done**: the leftover servers of old builds. One from 11 days before was still running, orphaned — its
  serve-web gone with an earlier board, its process group not. Quit by hand on Ricardo's word ("can you kill that rogue
  vscode?"); nothing here ends processes it did not start.

## Decisions of 2026-10-11, night — the tile's tabs, one family; tiles and the floating header by default

Ricardo, on the Round IV studies (the chat tile's tabs — a contact sheet, seven directions): "let's go with Q1, Q5 and
Q7 for now, but the artifact should render with tiles and floating header, which should be default".

* **Tiles and the floating header are the defaults.** Both were switches to try (2026-10-09, 2026-10-10); they are the
  look Ricardo lives in, and the studies judged on the plain column judged the wrong board. The prefs' defaults are
  on — a profile that has saved prefs keeps what it has. The harness starts its pages with both off, as it does
  auto-resume and the folded lanes: most scenarios measure the plain column, and the ones about tiles, the header
  and the notch turn them on. The study sheet was shot again with both on.
* **Q1 · the strip is one family of controls.** What the inventory found: the tab in front in the accent while
  everything else selected wore the project's colour; tabs, nav buttons and the header's chips 20 to 22 px with radii
  from 4 to 9; the nav glyphs text beside drawn marks; a × always on every tab. Now every tab, nav button and field is
  26 px with a 6 px radius, the header's PR chips and `+n −n` with them; no fill at rest; the tab in front and the
  rule of the half with the keys in the chat's colour lifted to read on the panel (as a card's edge is), never the
  accent — that is the board calling you; the glyphs are drawn; a tab's × is its mark's place under the pointer; and a
  strip short of room folds the tabs behind the one in front to their marks (and drops their ×: a mark alone is
  chosen by a click, never closed by one).
* **Q5 · the page in front is its own address.** Its tab grows into the field — the mark, the address (the host
  quieter than the path), ‹ › ↻ ↗ inside it — where the address was a squeezed text after the tabs ("github.com/" in a
  half). The half's ◫ and ⨯ went behind a ⋯ at the strip's end, which puts them out until the pointer leaves.
* **Q7 · with tiles, each half is a tile.** Split, 8 px round and between the halves, each bordered as the tiles are and
  whole on the half with the keys — so the rule under its strip and a lone half's 2 px rule have nothing left to say
  and go. Under the floating header the halves start below it (the study found their borders running up behind it).
* **Not built**: Q2 (underlined tabs, a strip of one), Q3 (a segmented control), Q4 (islands), Q6 (a rail of marks) —
  on the sheet for reference. Settings' segmented control and the changes tab's scope are not yet in the family.

## Decisions of 2026-10-11, evening, later — a card counts nothing

Ricardo: "the user avatars on cards should be a LOT more compact on top of each other and then reveal more on hover.
remove the "+1" etc. on the cards, for users, PRs or JIRA. Jira should also stake like PRs on cards".

* **The faces are a pile.** Three faces overlapping by 4 px and a `+n` became up to eight in a pile the PR stack's way
  round: the newest on top at the right end, by the chips, each other one under the one before with 4 px of it
  showing — six faces take 36 px where three and a count took about 55. The pointer on the pile spreads them side by
  side, each whole, on the spring; each face keeps its tooltip.
* **No counts on a card.** The faces' `+n` went with the pile; the tickets' with their stack; the *your move* line's
  `+n PRs` too — the line names the newest move and its tooltip the rest, and the stack under the pointer shows every
  PR. The chat header keeps its `+n`: there the chips fold for room, and the count says what folded.
* **Tickets stack as PRs do.** The first ticket and a count became a stack of every ticket, the PRs' own (`chipStack`,
  shared): the branch's or the last named on top, three slivers under it in their status colours, fanned under the
  pointer and scrolled past the row's room, a click on one opening it. Not greyed with the PRs on a chat done for good.

## Decisions of 2026-10-11, evening — a drawer switched to does not jump

Ricardo: "when switching chats, the claude chat seeems to start higher than it shuold then it quickly goes back down a
bit to the right place. Visually distracting".

* **It was the nudge.** Every attach — every chat switched to with its claude in a drawer — resizes the PTY a row
  short and back 150 ms later, so Claude Code repaints over the snapshot (2026-09-20, against replays cut mid-paint;
  kept since as belt and braces). Claude Code pins its prompt to the bottom of the size it is told, so for those
  150 ms the whole screen sat a row high in a page one row taller: measured per frame on the fake claude, the last line
  on row 56 from the first frame to 160–210 ms, then on 57.
* **The repaint stays, unseen**: the nudge now starts on the socket's first frame — the holder's snapshot, which is
  where the screen belongs — and the page holds what follows (as it does behind a refit) until the true size's
  repaint has come: 60 ms with nothing, 600 ms at most. Both repaints are then written at once and only the second is
  painted. Measured again: the last line on its row from the first frame. Keys typed in those few hundred ms echo when
  it lets go. Dropping the nudge was the other way; the snapshot has been exact since 2026-10-03, but the repaint
  costs nothing now that it is not seen.

## Decisions of 2026-10-11, late afternoon — the header meets the tile's line; a ring without an edge

Ricardo: "on "It bends around the notch" it should meet with the tile border, not go below it. my point was to not go
straight and bend a little to meet the tragetory of the tile line"; "the chat border should only be on on the active
chat. clauding chats should just have the glow around border animation (a bit more glowing maybe)".

* **The floating header bends into the tile's line.** It dipped round the housing as a second line 5 px under the
  tile's own, two parallel curves. With tiles the dip is now that line: the header's top edge bends down into it — a
  10 px curve tangent to the edge and to the line where it meets it (the line's side, or, the header being only 12 px
  below the tile's top, its rounded corner) — and follows it round, a pixel under its outer edge so no seam of the
  wallpaper shows between them. The header's own border is only the two bends; the tile's line draws the rest.
  Without tiles there is no line to meet, and the dip stays a few pixels clear of the housing.
* **Only the open card has an edge.** A clauding card's ring ran on a track of its colour round the whole card, a 1 px
  line of the light outside it: a border. Now its light runs on nothing — the track transparent, the light's tail
  shorter, so it reads as a light going round and not a line — with a stronger glow round the card. The open card
  keeps its edge and the light runs on it; a monitor's ring was already trackless and loses its line too; a question
  keeps its red line and pings. Under reduced motion the steady band stays: it is the only sign of work left there.

## Decisions of 2026-10-11, afternoon — the header's row holds; quieter cards

Ricardo, with a screenshot of the board filled at the notch, tiles and the floating header on: "seems like some times
the "..." is wraping around and making 2 rows, which shouldn't happen"; "the card on hover should no highlight the
borders"; "the card selected should not have the aggressive gradient on the right - should be background color
(usually black)".

* **The header's row never wraps.** The header is a wrapping flex row (the details fold under it as a second line),
  and a line breaks on its items' basis sizes before anything shrinks: the *your move* line's was its whole reason (a
  PR, *pushed since your review · 2 comments from …*, up to 45 % of the header), so beside the housing — the title
  left of it, everything else in what is right of it — ··· went to a second line. The line now has a basis of 0 and
  grows into what the row leaves, up to its own width, the reason ellipsized; a task's chip the same. `fitHeadPrs`
  counts them at their least — the move's tag and its `+n` — when it folds the PR chips, and down to one chip with the
  row still too full puts the move's line away, then the `+n −n` (the card says the one, ··· has the other). The title
  keeps its 170 px; ··· is always on its line.
* **Hover lights no border.** The hovered card's border and halo in its colour went; the glow still spreads under the
  pointer. The colour round the edge is the open card's and the clauding one's alone.
* **The open card's right is the panel.** Its glow rose to the full colour over its last 44 px to meet the splitter in
  the bar's own colour (2026-09-29) — with tiles, where the splitter is a gap, a block of colour at the card's end for
  nothing, and loud anywhere. It now falls to the panel at its right edge as every card's does; the card still runs
  over the list's padding, and its 2 px outline meets the bar.

## Decisions of 2026-10-11, midday — a PR taken off a chat

Ricardo: "if I click on option and hover on a PR on the top bar in the chat, an X should appear to de-associated the PR
with the chat".

* **⌥ over a PR in the chat header shows an ✕**: on its chip, white on red, the chip keeping its size (the number goes
  clear under the mark) — the done-for-good ✕'s look, what the click will do before it is done. Its row under the
  header does the same on its number, which reaches the PRs folded behind `+n`. ⌥-click takes the PR off the chat; the
  chip folds out and the header is drawn without it. A plain click is what it was.
* **Off that chat, not off the board**: gone from its chips, its rows and its card's stack; it no longer titles the
  card, un-ticks it, ranks it, alerts on it or is asked about for it. A chat that still names it keeps it — a PR
  mentioned in passing in one chat is the work in another.
* **Kept off as the chat goes on**: Claude naming it again, a `pr-link` line, the chat read afresh after a restart —
  none brings it back. **A word of yours naming it does**: the way back, with no list of what was taken off to keep;
  Claude names the other PRs in passing all the time, and you name the one you mean.
* **Not done: tickets.** A Jira ticket a chat names stays on it — not asked for.

## Decisions of 2026-10-11, late morning — done for good; the header floats

Ricardo: "why do I have 4 [one service's] chats always poping up on my feed? right now their are after this chat. are
the PRs associated really having new events? if so, we should have a way to permanently say: done, forgot about this
and PR events".

* **They were real moves, four chats deep**: four chats in that service's folder had reviewed a colleague's stack of
  single-commit PRs — five to seventeen PRs named a chat. The author amends and force-pushes them: the base of the
  stack four times in five days since the review, the last that morning with real changes (three files' patches
  differ). Each new head is *pushed since your review*, a move, and a move un-ticks every chat that names the PR and
  ranks it by the move's time — three of the four had been ticked two days before, and all four rose under the chat
  in front, together, at every push.
* **Done for good, per chat**: ⌥-click on the card's ✓, *done for good* in ··· (a chat with PRs only), or the
  launcher's action. While that tick stands the chat's PRs are forgotten: a move un-ticks nothing, ranks nothing,
  alerts nothing, and the PR is not asked about for it — a PR that only such chats name is not polled at all. Per chat,
  as asked, not per PR: the same PR still counts in a chat where its review is going on, and a PR-wide mute would
  silence that too. The chips stay, in grey; opened, the header still says whose move the PR is at — that is the PR's.
* **⌥ turns the ✓ into an ✕** (Ricardo, next: "when clicking on option and hovering, the icon should change form the
  current "done" to an X for delete"): held over the ✓ of a chat with PRs, white on red — what the click will do,
  before it is done; let go, the ✓ again. The ✕ is what fills and draws when clicked, and ··· *done for good* wears it.
  ⌥ is read off the keys and off the pointer's own events, since in the app a key pressed with a page of the pane in
  front never reaches the board. A chat with no PRs keeps its ✓: for it, done for good is done.
* **It ends with its tick**: the mark is the done mark it came with, so a word in the chat (back at work in it), ↩, or
  a tick of another kind (a plain ✓, a /clear's) is a plain chat again. Nothing to forget by hand.
* **Not done: telling a rebase from a change.** A force-push that only rebases is a move all the same; telling them
  apart wants each push's patch, a call per PR per push. This morning's push changed code, so it would not have helped.
* **The floating header floats** (Ricardo: "I like the floating chat header, but it shuold be really floating, meaning
  the chat should fade a bit but go behind it to the top"): it was a bar inset over a column that started under it, so
  the inset was only a frame. Now the chat runs up behind it to the column's top: the transcript starts its words under
  the header (and the PR rows, when open) and scrolls on up behind, shown at a third in the gutters round the bar; the
  drawer — where a chat run here is read — is simply taller, its top rows behind the bar, faint round it. Only where
  nothing else stands between: a half with a tab strip, a page or the changes starts under the header as before, as
  does a split's other half, and stacked, the lower one.
* **…and bends round the notch** (the same message: "the intersection of the header with the notch should be soften by
  bending a bit like the tile bends, just a little so we don't lose vertical space"): the header ran under the camera
  housing, the housing's black over its own. Its top edge now dips round it, a few pixels clear (and clear of the tiles'
  border round it), the shoulders rounded and the corners following the housing's — and the header stays where it was,
  so the row loses nothing. Its border runs round the dip.

## Decisions of 2026-10-11, later — the status bar trimmed, lanes that fold, the live notch taken out

Ricardo, having lived with the morning's list: "status bar: add a clock at far right · remove "X live", "X drawers .
Y shells" · bars like cpu, ram, tokens -> move to a more concise pie-chart · we can remove the "ready | clauding |
done" from the status bar and just have the "ready | clauding | done" title clickable on the cards tile, collapsing.
done should be last and should be collapsed by default" — and "remove the new animation for the notch - doesn't bring
anything and it does't look pretty with the floating chat bar".

* **The live notch, taken out** (#23 below): its commit was dropped before anything was pushed, the switch and its
  34 px of room round the housing with it — the header's row is 10 px from the housing again. With the floating header
  the black shape hung over the header's inset bar rather than growing out of the screen's edge, and the ears said
  nothing the list and the status bar's fish do not.
* **The status bar, trimmed**: the live chats' count and the drawers and shells went; how many chats are asking you
  (red) and how many monitors run stay, each only while there is one — what may want you, not what is merely open.
* **A clock, far right**: in the fill the menu bar is hidden, and its clock with it; the status bar's last segment is
  the time now, written as the transcript's who-lines write it (the locale's), the whole date in its tooltip, drawn
  again on the minute.
* **Pies, not bars**: CPU, memory and the plan's windows were each a 40 px bar and a number — memory's was *34.6 GB /
  48.0 GB*. Each is a label, a 12 px pie of what is spent and its percent now; memory a percent like the rest (*RAM
  72 %*), its sizes in the tooltip. Half the width, and a pie reads at a glance the way the menu bar's own do.
* **Lanes that fold, no state chips**: the three chips (ready · clauding · done) filtered the list from the status
  bar; the lanes' heads say the same three things over the cards themselves, so the heads became the toggles and the
  chips went — from the bar and from the list's foot alike. A folded lane keeps its head and its count, so it still
  says how much is in it; Done is last, as it always was, and **folded to begin with**: what you ticked is out of the
  way until you ask for it. A ticked chat folds into it as it went when its chip was off. A query shows every match,
  folded or not — a search that hid what it found would be a search that lies. Not on the rail, which has no heads to
  open a lane by. A filter saved from before is dropped on load, since nothing could bring back a state it hid; the
  harness opens every lane, as most scenarios tick a chat and look for its card, and `lanes.mjs` asks for the
  board's own default.
* **The faces folded away, the fish takes the room** (Ricardo, next: "the git users should just shrink when compacted
  (which should be the default) - let the fish occupy all the empty space", and, after a first cut kept every face at
  14 px in an overlapping stack: "when I said shink, I mean folding, aka don't see anything"): folded is the default,
  and folded is GitHub's mark alone — the count the 2026-10-09 fold showed beside it went too; the mark unfolds them.
  The one face kept is the person the list is narrowed to, as before: a filter nothing on screen owns up to would be a
  list that lies. The faces fade and shrink away rather than vanish (`display` held by `allow-discrete`). It is a new
  pref (`peopleCompact`); the old fold's is dropped on load, since everyone had it saved as off. The fish's lane is the bar's free room rather than 64 px, the faces after it: it swims the whole width at the speed
  it had, and keeps its place when the window's width moves.
* **Three more, from the app** (Ricardo: "the chat tile should not leave any gap to the notch, so we maximize space to
  the floating header (maintain the curvature of the tile border) - move the gh icon that toggle the avatars in the
  status bar to the left of the fish, so GH icon is static when folding/unfolding - make the fish always move, just
  faster if more claudes are working, and when it hits one of sides, it turns back instead of wraping around"):
  * **The cut hugs the housing**: with tiles at the notch the panel was cut 8 px wide of the camera housing, the
    wallpaper showing in a band round it, and the header's row kept 20 px clear. The hole is the housing's own shape
    now — its lower corners the housing's radius, the border's 2 px round them concentric — and the row keeps 12 px
    clear, so the header (floating or not) has 8 px more either side of it.
  * **GitHub's mark before the fish**: the faces sat after the fish's lane, so folding them moved the mark the width
    of the faces. The mark and its faces come before the lane now, after the left's segments: the faces open to the
    mark's right and the fish's lane gives way, and the mark stays where the hand left it.
  * **The fish never stops, and turns at the ends**: it rested where it stood while nothing was at work, and swam off
    the left to come back on the right. It swims always now — at half the pace with nothing at work, still blowing a
    bubble now and then (from whichever side its mouth is on) — and turns at either end, mirrored at once, as a pixel
    sprite turns. One animation still, a length each way per iteration, so the rate and the lane's width change it in
    place as before. RunCat's cat stops; this fish, asked, does not — the one thing on the board that moves with
    nothing running, and the request is why.

## Decisions of 2026-10-11 — the third studies built: twenty-eight small motions

Ricardo: "we need more animations, small design details, something to spice up the app. search the web for
inspiration if you need, articles, popular well-designed apps, etc. come up with a list" — a list of twenty-eight
(Emil Kowalski's and Rauno Freiberg's writing, NumberFlow, Things, RunCat, the Dynamic Island and the Mac's notch apps,
Apple's haptics), then "create an artifact to visualize the ideas" — the third studies page, every idea a live sketch in
the board's tokens — and "Build 1, 2, 3, … 28": all of them, one commit each. The rules under all of it are the
2026-09-27 pass's: motion means running or something just changed, a key's move stays instant, a one-off runs under
300 ms on transform and opacity, and each has its line in the reduced-motion block.

* **1 · springs**: the curves became tokens (`--ease-out`, `--spring`, `--spring-soft`, `--t-hover`) rather than a
  cubic-bezier per rule. A spring in CSS is `linear()` with enough stops (40 here) — both engines have had it since
  2023 — so no library and no JS physics: the oscillator is sampled once, by hand, into the stylesheet. The snappy one
  overshoots by 9 %, the soft one by 1 %. The badge's pop is the spring now (a hand-made 1.15 keyframe before), and the
  PR stack's fan, its grid columns and its chips on the same curve, as the fan's own rule asks.
* **2 · a press dips**: the board answered a click only once it was over. Held, a card is 99 % and a button, chip or
  tab 97 % (Emil Kowalski's numbers), back on the spring when let go. The `scale` property rather than `transform`, so
  nothing that already moves by a transform — the list's FLIP, a stacked PR chip — is overwritten; and a card does not
  dip under a press on its own ✓ or chip (`:has(:active)`), or both would. Menu rows and the project's line are left
  out: a whole row shrinking reads as a glitch. The scenario lets go off the target, so a press is not a click.
* **3 · counts roll** (NumberFlow's): the lanes', the chips', a card's unread and agents, the usage and the bar's
  numbers slide digit by digit to the new value — an odometer, so 2 → 1 rolls down and 9 → 10 brings a new place in
  from empty. The boxes are redrawn by markup and compared as strings (`setHtml`, the cards' and lines' reconcile), so
  the roll cannot live in the markup: the markup keeps the plain number, the key remembers what it showed, and the
  digits are dressed after the draw and undressed when they land. The strips' digits are CSS content and the number
  stays in the text beside them, out of sight: the first cut put 0–9 in the text, and two scenarios read a count as
  0123456789 mid-roll.
* **4 · a tick is felt** (Things' checkbox): the ✓ was a text glyph that vanished with its card; it is a stroke now,
  which fills and draws itself where it was clicked, and the Done count rolls on. **The server is told once the stroke
  is drawn** (230 ms), not at the click: its answer redraws the card — as a done one, or folding it away — and a mark on
  the old node would go with it. The open chat's move to the next card waits as well, for the same reason (the move
  redraws the ticked card without its `.active`); it was made at the click so an empty chat's event could not leave the
  column first, and both still happen in that order.
* **5 · all caught up**: the moment needed a place that is not a toast (the board has none), so it is a state first —
  a lane head, *All caught up*, where the Ready lane would be, for as long as nothing in the project waits on you — and
  a moment only when your tick made it so: the head's pixel mark hops and throws a dozen pixel sparks. A list that is
  caught up because its last ready chat was ticked elsewhere, or that loads that way, shows the head still. The mark is
  the clauding lane's sprite held at its full frame: still, since motion on the board means running.
* **6 · the question heard**: the asking card's red simply went when the answer came, and the ring started — nothing
  said the board had heard you. Now the sonar runs once backwards: a red outline drawing in from where the pings fade
  to the card's edge, half a second, while the ring of what Claude does next fades in under it. An outline's offset
  rather than a transform, because the card's two pseudo-elements are taken by the ring and its cover; a one-off on one
  card. Marked and replayed like the landing (`heardAt`, a negative delay), so a card rebuilt mid-way carries on.
* **7 · CI resolves, a PR merges**: the badge swapped its ring for a tick or a cross between two draws. Now an answer
  is drawn in where it lands, the badge pops on the spring, and a failure shakes its chip the way macOS shakes a wrong
  password — the one motion on the board that means *no*. A merge sweeps a sheen across the chip, on the header and on
  the card, as it turns purple. Both chips are redrawn by markup, so the moment is found after the draw by comparing each
  chip with what it showed last under its key (the PR and where it stands); a chat opened for the first time plays
  nothing, and neither does a PR that was never running.
* **8 · your move arrives**: the tag slides in from the left on the spring and nudges once — the board's way of
  saying *this is new* without a toast. Found by presence (the tag there now, not the last pass, on a card or header
  that was), so opening a chat that already waits on you, or a load, plays nothing.
* **9 · a monitor's event**: a watching card looked the same quiet or busy. It has a live line now — the newest event,
  in the code face under the title — and each event rolls in from below while the watching light blips once, a heart
  monitor's beat. The line is an empty slot in the markup and filled after the render: an event in the text would have
  changed the card's markup, and so its node, at every event of a chatty monitor. Not at compact, not on the rail.
* **10 · located** (Rauno Freiberg's *shake the pointer to find it*): opened from a picker, the launcher, a notification,
  the overview or the home, a chat's card is scrolled to and flashed — a band of its own light sweeping across it once —
  so the eye learns where the chat lives in the list. Not when the card itself was clicked (you are looking at it) nor
  on ⌥⌘↑↓, which walks the list a card at a time and would flash on every press. The scroll stays a jump: a key's move
  is instant on the board, and the flash is what draws the eye.
* **11 · the shimmer**: *clauding…* in the transcript's presence line and the Clauding lane's name carry a light
  running across them, as Claude Code's own spinner word does. The agent apps do it with a gradient clipped to the text
  and its position animated — a repaint every frame. Here it is two transforms: a window as wide as the word, masked
  to a soft band, slides one way while the bright copy inside it slides the other by the same amount, so the copy
  stays over the word and only the band moves. Percentages of the word's own width, so nothing is measured; the copy
  is the window's `::before` from an attribute, so the word is in the text once and the scenarios read it as before.
* **12 · fish verbs**: Claude Code's spinner changes its verb as it works; the board's presence line now does too, from
  a fish market — trawling, filleting, netting, haggling (a *peixeirada* is a fishwives' quarrel), gutting, brining…
  — every few seconds, rolled up and in, still shimmering. English, as the board's words are. In place rather than in
  the markup, so the line is not rebuilt each time and a check that reads it as it appears still reads *clauding…*.
* **13 · what it is doing**: a clauding card says the tool it called last and what for — *Bash · run the tests*,
  *Edit · retry.ts*, *Agent · review the diff* — on the live line #9 made, and flips to the next like a split-flap
  board. The server already kept each chat's last tool calls for the overview's tiles; the summary now carries the
  newest of the turn (`doing`), so no second fetch. Not in the card's markup: a tool call every few seconds would have
  rebuilt the card, and its ring, that often — the reason a tool call was kept out of the markup in the first place.
* **14 · tool calls, live** (GitHub Actions' step list): the transcript's tool rows said what was called and, a row
  later, what came back; nothing said which call was still out. Each call now starts with its state — a ring turning
  until its result comes, then a dot, or a red cross for an error — and a folded run of calls turns on its summary, so
  the open chat's foot says *working on this one* without opening the run. A call whose chat is no longer at work (an
  interrupt, a claude that ended) keeps a still ring: motion means running.
* **15 · a reply landing**: the agent apps stream their text; the board cannot — a reply is one transcript line, there
  whole. It can still arrive the way a streamed one reads: when it lands while you are at the end of the log, its
  paragraphs, code and lists come up one after another, 45 ms apart, out of a slight blur. Scrolled up, it fades in as
  before and lights the pill: nobody is watching it arrive.
* **16 · the title travels**: a card clicked open sends its title up into the header, where the chat's name now lives,
  as the header's colour eases from the last chat's to this one's. A copy flies rather than the element itself — the
  header is drawn by markup and the card stays where it is — on one line, scaled from the card's size to the header's.
  The study named the View Transitions API; a hand-made FLIP needed no snapshot of the page, which the app's native pane
  (its web views over the chat column) could not be part of anyway. A click only: ⌥⌘↑↓ is a key's move, and instant.
* **17 · the overview zooms** (Mission Control, Hyprland's overview): ⌥⌘A's tiles grow out of their cards in the list
  behind the blur — a FLIP from each card's rectangle — so the overview reads as the list laid out, not a new place;
  and the tile you open grows into the chat column as the overview fades. That ghost is a popover: a closing modal
  dialog keeps its place in the top layer until its fade is over, and anything in the page would have grown under it.
  It is a key's mode, but not a key's move — the zoom is the way in and out, once each, not a step repeated.
* **18 · a new look spreads** (Telegram's theme switch): the ⌥⌘Y grid already previews under the arrows, so ⏎ keeps
  what is on screen and changes nothing to reveal — the study's "⏎ spreads it" was the wrong moment. The moment is a
  tile *clicked*, which wears a theme the board was not showing: it spreads from that tile in a circle over the old
  look. And the simple colours switch, from the switch. A view transition does the work — both engines have them — with
  the default cross-fade turned off, so it is one page clipped over the other.
* **19 · the tab strip**: the highlight slides to the tab that takes it, a tab opened grows in, a tab closed folds
  where it stood — Linear's and Arc's strips. The strip is drawn by markup, so the old one is read just before it is
  replaced, and only when it is about to be; a closed tab's fold is a stand-in that is not a tab. The study kept the
  keys' switches instant; on reflection a switch of tab is one move to one place, not a walk through many, so ⌥⌘←→
  slides as a click does — the list's ⌥⌘↑↓ is the walk that stays a jump.
* **20 · the fish belly-up**: the SSE light was the logo greyed out; now the fish in it floats belly-up, its sparks
  gone, bobbing — a dead fish is a frozen board — and flips back over with a wiggle when the stream returns. With the
  status bar on the list's head row (and so its fish) is hidden, so the bar's connection, a green dot before, is the
  fish itself now: green and upright while connected, grey and belly-up while not.
* **21 · RunCat, as a fish**: the home's pixel fish swims in a lane of the status bar, faster the more is at work —
  each clauding chat and each of its sub-agents — and rests, blowing a bubble now and then, when nothing is. The pace
  is the swim's playback rate, changed in place, so the fish never jumps when the count does; its lane is a slot of its
  own, so the bar's redraws never restart it. A click opens the overview: the fish *is* the agents at work.
* **22 · empty, with a fish**: a list with nothing in it said so in grey; it shows the fish resting now, what is empty
  (*Nothing matches*, *Nothing clauding*, *No chats yet*) and the key or the gesture that fills it. It barely moves — a
  bubble now and then — because nothing is running.
* **24 · trackpad haptics** (Apple's alignment pattern, `NSHapticFeedbackManager`): the app can do what a web page
  cannot — bump the hand on the trackpad. A divider dragged near a stop snaps to it and bumps (the list at its own
  width or at half the window, the halves even); a tab let go in the other half bumps as it lands; the timeline's thumb
  bumps at each run of days it crosses, a level passed. Apple's guidance, kept: only in answer to the hand, always with
  something seen (the snap, the landing, the label), and sparingly — once on entering a stop, not while held there.
* **25 · sounds, off by default** (Tweetbot's): the board in front shows no notification for an alert — you are
  looking at it — but you may not be looking at the card. A switch makes it heard: a soft tick for a reply or a PR come
  round, two rising notes for a question. Off by default: sound is the one thing on a Mac that reaches everyone in the
  room. Web Audio rather than files, so nothing is shipped; a page cannot start sound until it has been touched, so
  the context is made on the first press or key after the switch is on.
* **26 · grain**: a dark gradient across a wide box — the transcript's wash, the header's veils, the tiles' wallpaper
  — shows its steps on an 8-bit panel. A faint tile of still noise over them dithers the steps away, the trick the
  well-made dark sites use; a few percent of white speckle, so it reads as texture, never as dirt. Static: nothing
  moves, nothing is drawn again.
* **27 · the scroll shadow** (the Mac's toolbars, which show their edge only once something is under them): the
  chat header casts a soft shadow onto the transcript once it has scrolled from its top, and none at the top. A fade on
  the log's own scroll timeline, the compositor's like the splitter's black, so it is never a frame behind the scroll.
  The study's list-top shadow was left out: the list's top already has its end pill counting the cards out of sight.
* **28 · fade, not …** (Arc's tabs): a name too long for its box fades out at its edge — the header's title, a page's
  address in the strip, a card's title at the end of its third line. Only where it does overflow: the board reads which
  ones do after a draw (a mask on a name that fits would fade its last letters). The card's three-line clamp still
  writes its own ellipsis, which fades with the rest. The tabs' own names are never cut, so the study's tab example
  is the address beside them.

## Decisions of 2026-10-10, evening — the second studies built: themes, tiles, home, the launcher, the overview, changes

Ricardo, on the second studies page (eight screens H–P from Omarchy and the agent managers): "do H, I, L, N, O and P".
J (workspaces in the status bar) and K (the btop frames) were not picked.

* **H · themes** (⌥⌘Y): Omarchy's twelve — Tokyo Night, Catppuccin, Gruvbox, Everforest, Kanagawa, Rosé Pine, Nord,
  Matte Black, Osaka Jade, Ristretto, Catppuccin Latte, Flexoki Light — each the board's tokens, the header's black,
  the status bar's ground and the drawer's sixteen colours. **A slot per appearance**, as Ghostty's `dark:…,light:…`:
  the page's dark rules hang off `prefers-color-scheme`, which a page cannot set, so a dark theme picked while macOS is
  light is kept for the dark and says it cannot show now. (Forcing an appearance would have meant the app setting its
  web view's `NSAppearance` and a browser never could — two boards that disagree.) A project keeps its hue: its
  Peacock colour moves to the nearest of the theme's own (by the hue's angle; greys and blacks stay), a switch keeps
  them exact. Riso (G, `docs/studies/`) is not among them yet: it is shapes as much as colours.
* **N · the launcher and the keys** (⌥⌘L, `?`): the study's ⌥⌘/ for the sheet is `?` instead — the board's keys go by
  `e.code`, and on a Portuguese layout the key in the US slash's place types `-`, so ⌥⌘/ would have been a key no label
  could name. The sheet is the settings' Keys list (one list to keep), and the launcher has a Keys row. Its switches
  click the settings' checkboxes rather than set prefs, so each runs its own handler (the status bar's dock, the
  server's notifications). Not done: the launcher does not take ⌥⌘K, ⌥⌘P and ⌥⌘N in — they are its menu's rows.
* **P · changes** (⌥⌘D, the header's `+n −n`): git in the chat's folder when the tab or the chip asks — never on the
  poll (the first studies had turned a diff count per chat down for that cost). **"This turn" is the files the turn's
  Edit / Write calls named, diffed against HEAD** — not a snapshot taken at each prompt, which would have meant
  `git stash create` writing objects into the user's repo on every prompt; a file that was dirty before the turn shows
  whole, and the tab says which scope it is in. **Commit…, Push and PR… type their command into the chat's zsh and
  leave ⏎ to you** — the board runs nothing that leaves the Mac. A note on a diff line is typed into the chat's claude
  in its drawer as `path:line — note` and sent; with no drawer here it is copied.
* **O · the overview** (⌥⌘A): columns by what the chat wants — asking, clauding, watching, ready with unread words — not
  a kanban to drag (the states are Claude's, not a plan's). A tile shows a chat in a drawer here as its drawer's own
  screen, read-only and at the PTY's size (a resize would make Claude Code repaint narrow, and its own view resize it
  back): the study's question with its answers is mostly that screen, since the transcript writes a question with its
  answer. Every other chat is its tail, which the server now keeps for every chat (16 items, the cost of a list each),
  and a monitor its last event. Sub-agents show as their Agent calls in the tail and a count; their own transcripts are
  not read for it.
* **I · tiles** (a switch, off by default — a layout to live with before it is the board's): the stack holds the
  list's asking and clauding chats, three at most. **A tile watches; it does not take the keys**: a drawer tile is the
  chat's screen read-only at its own size, and a click makes the chat the master, where it is typed in. An interactive
  tile would have resized each chat's PTY to the tile, and every promotion back — Claude Code repainting narrow, then
  wide — as the study's own cost said. The gaps, the wallpaper and the borders are part of the switch. **The border is
  the project's colour, not Omarchy's cyan-to-green gradient** (Ricardo, once he had tried it: *"can we make the border
  tile the same color of the project? if black, make it light gray"*): every panel wears its own — faint, and whole on
  the panel the keys are in — so the colour says whose chat it is, as the cards' edges do; a black one (`nearBlack`,
  the board's own rule) is the grey that reads on the ground, light in the dark. Then (*"should the background hue be
  the same as the project selected? also, the tile on the left for cards should have the same project color if in
  focus"*): the wallpaper is in the open chat's hue rather than the theme's accent and watch colours, and the list on
  ALL — which is no project, so its black was a grey border — wears the open chat's colour; a list narrowed to a
  project keeps that project's. And at the notch (*"can you add the tile border around the mac notch (if present of
  course)?"*): the panel under the housing is cut round it the tiles' gap away and its border follows the cut, so the
  housing reads as one more window in the layout rather than something laid over the panel's edge — its lower corners
  round, concentric with the housing's (*"round the lower corners of tile around the notch to match it's shape"*; the
  system gives the housing's rectangle, not its radius, so 9 px is by eye); the header's title and chips keep 20 px from
  the housing with tiles (10 without), clear of the border. Then the screen's own corners (*"also round a bit the top
  right and left edge of tiles to match the macbook pro screen (don't do it on external monitors)"*): the tiles in the
  two top corners round, concentric with the screen's (its radius by eye, the tile's 10 px, the gap less). The housing
  is the test for a MacBook's own screen — the shell sends one only for a screen with a camera housing, so an external
  display, filled or not, keeps square tiles. The bottom corners stay square: the ask was the top two. The cut's top
  as well (*"the upper corners of the tile in the notch also, I didn't notice that the notch is rounder top and
  bottom"*): the screen flares into the housing where they meet, so the panel's two corners beside the cut's top round,
  9 px — the housing's own radius, since 8 px below the screen's edge they cannot be concentric with its flare. **The stack
  became a toggle** (*"I like the tiles UI, but have the 3 tile mandatory for running sessions is a bit much, we should
  be able to toggle it"*): tiles are the look — gaps, borders, wallpaper, the notch — and the stack a switch under it,
  off to begin with, and ⌥⌘S. Omarchy tiles by itself and makes everything else a toggle on SUPER: S the scratchpad (a
  hidden workspace shown and hidden over the rest), T floating, F full screen, J the split's direction, L the layout,
  SHIFT+BACKSPACE the gaps, the arrows the focus. The stack is closest to the scratchpad — windows kept out of the way
  and called in — so it took S. **⌥⌘S is not forwarded from the app's pane** (`boardKeys` leaves it out): there it is
  VS Code Web's Save All, which the board had no cause to take; from the board itself it works anywhere, the drawer
  included. With tiles off ⌥⌘S turns both on, as the stack is theirs. **And an × on it** (*"when the 3rd tile is open,
  we should have a small button (e.g top left of the tile) to close it (so it a bit more obvious that it can be hidden).
  also, hovering that button should say the shorcut"*): one ×, at the first tile's top left, for the whole stack — a ×
  on each tile would read as closing that chat — and its title says ⌥⌘S brings it back.
  A clip-path rather than a shape drawn over the panel, so the gap shows the wallpaper as the other gaps do.
* **L · home** (⌥⌘0, and the column whenever no chat is open): the study's "a click on the fish" became a key — the
  fish is the About box's, and with the status bar on it is not shown. The day is read from the transcript's own
  times as each line is folded, so a server restarted at noon still has the morning (the boot's tail read is 512 KB a
  chat; a chat that wrote more than that today loses its earliest spans). A question's wait is its asking line's time
  to its answer's — both lines arrive together, at the answer, but each carries its own time — and a question still
  open is timed from the registry. Permission prompts never reach the transcript, so they are not waits here.

## Decisions of 2026-10-10 — /clear ticks the chat it left

Ricardo: "when I do "/clear" on a chat, we correctly open a new one, but the old one is not marked as Done".

* **What /clear is to the board**: the same claude under a new session id, in a fresh transcript whose head is the
  command (a caveat, `<command-name>/clear</command-name>`, its empty output — the real ones and the fake's alike). The
  new transcript names no old session, so the link is the process: its pid and `procStart` were on one chat at the
  last look of the registry and are on another now (`held` in `loadRegistry` → `clearedFrom`).
* **Only a /clear**: a process also moves on an in-app /resume (into a chat with history) and a fork. So the old chat is
  ticked only once the new one's transcript begins with the command (`clearedAt`), and that command is at or after the
  old chat's last word — a /resume into a chat that a /clear began a day ago is not one. The registry and the transcript
  land in either order (the fake writes the file first; the test writes both orders); whichever comes second ticks.
* **A tick as the ✓ makes, without its ending**: `doneMarks` and the state file, so the card goes to the Done lane and a
  word in the old chat, or a PR come round to you, brings it back as any tick. The done route also ends the chat's
  processes; here the process is the new chat's, so nothing is signalled.
* **Any claude**: a /clear in iTerm ticks too — the registry is every claude's. A /clear the server was down for is not
  seen (the move is between two looks).

## Decisions of 2026-10-09, evening — no worktrees in ⌥⌘N's folders

Ricardo: "is there any way to not include folders for worktrees on the new project (hotkey N) menu?"

* **Why**: `git worktree add ../<repo>-<branch>` puts each worktree beside its repo, right under the root — on this
  Mac 131 of the root's 204 folders were worktrees, and all but one had no chat. The project step listed every one.
* **What a worktree is here**: a folder whose `.git` is a file naming `…/worktrees/…` (`isWorktree`; a submodule's
  names `modules/`). The server marks it `worktree` in `/api/folders` (`foldersIn`, under the same mtime cache), and
  `freeFolders` leaves it out.
* **Not gone**: a worktree a chat ran in is a project of the board's and stays in the step, and one typed by its whole
  name is offered as itself (`cloneRows`' folder that is here), as a hidden folder is — never as a clone gh would
  refuse. No switch: nobody starts a chat in a worktree with no chat in it, and the name still reaches one.

## Decisions of 2026-10-09, afternoon, later — a chat's folder not checked out is cloned first

Ricardo: "make sure that when opening a chat in a project that's not checked out, we download it and provide visual
feedback while it's happening".

* **Before**: resuming a chat whose folder was gone failed with `cwd no longer exists`, and so did a new chat in a
  project whose folder was — the auto-resume ran into it on every opening. The only clone was ⌥⌘N's ＋ clone row, with
  a line of text and no progress.
* **Which repo**: the folder's place under one of the setup's roots with an org — `<root>/<name>[/…]` is
  `<org>/<name>`, cloned to `<root>/<name>`. A folder under no such root, or inside a repo that is there (a worktree
  since removed), is said to be beyond a clone, in words that say which. The transcript names no remote, and a PR's
  repo could be a fork; the root is what ⌥⌘N's clone row already trusts.
* **Where it happens**: the server refuses the spawn with the repo (`clone`), and the page clones it through the
  existing `/api/clone` and asks again — for a resume, ⌥⌘T and a new chat alike. The server keeps one clone per folder
  (a second ask joins it; a spawn waits for it) — before, a second ask mid-clone was told the folder was there.
* **The feedback is git's own progress**: `--progress` through gh, its phases weighted into one percent, as `clone`
  events. The resume bar becomes the clone (the line along its top is the progress), a new chat's column says it, and
  the status bar has a segment while any clone runs — the picker's clone line too. Before the resume, the bar already
  says the folder is not checked out and the button reads *Clone and resume*.
* **On the way**: `new-chat-card` read the ready count 300 ms after the first prompt, while the fake was still
  replying (seven 60 ms lines) — it now waits for the reply to land; it had been passing on the page's lag.

## Decisions of 2026-10-09, afternoon — the cup says when it has nothing to hold off

Ricardo: "on the awake button, I assume that claude stop working when the mac goes to sleep - it's true right? when it
goes to sleep should be another config on the system (maybe it doesn't go when it's power connected?)" — and, to a
muted cup on a charger set never to sleep, "yes".

* **What was found**: asleep, every process is frozen, Claude Code with them, and the API's connection drops. But
  Claude Code (2.1.295) already holds a `caffeinate -i -t 300` of its own while a chat is busy, renewed every 4 min and
  let go 30 s after — so the cup is for what is not busy: a chat waiting on you, a monitor or a background command after
  the turn. And macOS has the setting Ricardo guessed: *Prevent automatic sleeping on power adapter when the display is off*
  (Battery › Options) — on on Ricardo's Mac (`pmset` AC `sleep 0`; battery `sleep 1`, the display at 5 min). The lid sleeps a
  Mac whatever either says, short of an external display; hence the lid's switch.
* **The cup is muted while there is nothing to hold off**: the server reads, on the poll that reads the lid, the idle
  sleep in use on the power drawn from (`pmset -g`'s `sleep` under *Currently in use*) and that power (`pmset -g ps`).
  `sleep 0`, or the lid's setting holding, mutes the cup on or off and its tooltip says why — on a charger, that it holds
  on battery. On, it keeps its caffeinate: unplugged, it is amber again within a poll.
* **Seen on the way**: a bare `caffeinate` from a shell, running since 2 Oct with no end, held that Mac awake on battery
  too, whatever the cup said; left for Ricardo to end. Two earlier quotes here named the company — now `[acme]`.

## Decisions of 2026-10-09, morning, later — CPU and memory on by default

Ricardo: "make the ram/cpu on by default".

* **The status bar shows CPU and memory from the start**; Claude's memory stays a box in Settings → Board. The pref is
  `barStats` now (`sbStats` before): every saved prefs held the old empty default, which would have outlived a new
  one, so the old key is dropped on load — and carried over only where something had been picked.

## Decisions of 2026-10-09, morning — the Mac's line-editing keys in the drawer

Ricardo: "the \"cmd + arrows\" on a normal chat like iterm, goes to the begining and end of the line, but doesn't
work here. can we fix it? and are the more common key combos that we should support (flag if it clashed with current
shortcuts)?"

* **Why it did nothing**: xterm.js sends nothing for ⌘ with an arrow — it leaves those to the browser, where ⌘← is
  history back — and a plain DEL for ⌘⌫.
* **iTerm's Natural Text Editing preset, as control codes**: ⌘← ⌘→ ⌃A ⌃E, ⌘⌫ ⌃U, ⌘⌦ (fn⌘⌫) ⌃K, ⌥⌦ ESC d. Claude
  Code's prompt reads all five (its own ctrl and meta maps: line start and end, delete to them, the word ahead), and so
  does zsh's emacs keymap, so the ⌥⌘T shell gets them too — rather than the CSI sequences with the super modifier,
  which Claude Code also reads but zsh does not. ⌥← ⌥→ ⌥⌫ already worked (xterm's ESC b, ESC f, ESC DEL).
* **No clash**: plain ⌘← ⌘→ ⌘⌫ are bound nowhere on the board or in the app's menus; ⌥⌘← ⌥⌘→ (the tabs) are left alone,
  as is any chord with ⇧ or ⌃.
* **Flagged, not done**: ⌘Z as Claude Code's undo (⌃_) — the app's Edit menu owns ⌘Z, so the page never sees it; it
  would go the way ⌘W does (the menu asks the board first). ⌘↑ ⌘↓ (the scrollback's top and bottom in iTerm) — Claude
  Code's full-screen view keeps its own scroll, so there is little for them to do.

## Decisions of 2026-10-09, towards morning, later — a black project's ground stays black

Ricardo: "I want the backgroun to still be black for black projects (like [acme]), unless we are hovering and for the
border lines, so it contrasts with the background".

* **On a black project's card the glow is black again; the lines are the grey**: the glow's colour is a variable of
  its own (`--wash`), the lifted colour on every card and the black itself on a black one — so its edge, its border
  and the ring's track show against the panel while its ground is black, as the project is. The open card too.
* **Under the pointer, and under the magnifier's mark, the ground lights in the grey**, with the light under the
  pointer; `--wash` is a registered colour, so it eases there and back.
* **Black only** — the projects painted `#000000` (`.card.black`); a navy or a maroon keeps its lifted glow.

## Decisions of 2026-10-09, towards morning — a dark project's colour, lifted where it shows

Ricardo: "some project colors (like [acme]) are black or tooo dark to have contrast with the background. what should
we do? us a lighter glow/effect for those cases?"

* **Yes, lighter — by lightness alone, for every colour, in CSS**: the card's lit colour (`--lift`) is the project's
  colour with its OKLCH lightness held at .62 or above in the dark theme — hue and chroma kept, so a navy is a mid blue,
  a maroon a rose, a black a neutral grey — and at .72 or below in the light, where a yellow or a cyan was the same
  problem the other way round. A colour already in range is untouched. The edge, the glow, the light under the pointer,
  the border of a hovered, open or clauding card and the ring's track wear it.
* **Rather than a list of dark colours, or a second look for them**: a threshold on brightness (`nearBlack`, as the
  header does) would switch looks at an arbitrary line — one shade either side of it worlds apart; clamping the
  lightness is continuous, and needs nothing from the script. The black card's grey edge of its own (`#77776f`) went
  into it.
* **The name follows**: in the dark it is lifted from the same floor — a black's name, a grey of .45, sank into its
  grey glow. In the light it was already held dark enough.
* **The colour as set stays everywhere else**: the rail's squares, the chat header, the splitter, and the open card's
  last 44 px running into the splitter wear `--repo` — that black is what the header's and splitter's greys were made
  to stand beside.

## Decisions of 2026-10-09, late night, later still — the glow follows the pointer

Ricardo: "there's this amazin effect that I saw in other apps, where when hovering on a card, the glow follows the
mouse".

* **A round light of the card's colour sits under the pointer** while it is on a card, and moves with it — a third
  background layer, between the edge and the glow, at the pointer's place in the card (`--mx`, `--my`, written once a
  frame by the page). It fades in as the pointer arrives and out where it stood as it leaves. In the dark it is the
  colour lifted a third of the way to white: a dark project's colour (a forest green) was barely there as itself.
* **Hover is that light**: the edge's glow stays as it is at rest rather than spreading across the card — the light
  moving is the hover. The open card and the magnifier's mark keep their glow, and wear the light too.
* **On by default, with a switch** (Settings → Board → *light under the pointer*) to compare with hover's glow spread
  from the edge, which is what off gives.
* **Cheap**: one card's rect read and two properties written per frame while the pointer moves over the list; the
  properties are registered not to inherit, so only that card restyles. A card redrawn under a still pointer, or
  another brought under it by a scroll, is placed again from the last position.

## Decisions of 2026-10-09, late night, later — the cards' glow, stronger

Ricardo: "the edger color fade on cards is a bit weak for my task. make it more obvious and more \"contrasty\"".

* **The ink card's glow is twice as strong and reaches further**: at rest half the project's colour at the edge
  (`--tint` 50 %, 22 % before) over three fifths of the card (`--reach` 60 %, a quarter before); hover and the
  magnifier's mark 60 % over nine tenths (34 % over three quarters); the open card 65 % across (40 %).
* **It falls steeply, then tails out**: a colour hint at `--fall` of the reach — a third at rest — so the colour stays
  bright beside the edge and is gone well before the text's middle; an even fall read as a wash. The open card keeps
  an even fall (.5): with the steep one its middle sank darker than both its ends, the edge and the splitter's colour.
  `--fall` is a registered number, so it eases with the other two.

## Decisions of 2026-10-09, late night — the faces fold behind GitHub's mark

Ricardo: "so many faces is a bit distracting - allow to collapse the GH avatars, and use a GH icon instead of git icon
the currently exists on the left of avatars".

* **GitHub's mark heads the faces** (the octicon; the PR mark before) **and is their fold** (`prefs.peopleFold`, kept
  across reloads): folded, the mark and how many people there are; the one person the list is narrowed to keeps their
  face, ringed, so the filter never hides behind the fold. In the status bar and in the list's row alike.
  → the fold's step in `scripts/scenarios/people-row.mjs`.

## Decisions of 2026-10-09, night — the status bar takes the list's foot, and the lid asks for Touch ID

Ricardo: "the GH user avatars can also go the the new lower footer in the middle", "we can add the search icon to the
bottom footer also, far left", "the app icon row can be removed", "awake button is repeated up top now, remove it from
the header", "now that we have more space on new footer, put there the other option to close sleeping when closing the
lid (also can we use touch-id instead of pass for sudo?)".

* **The bar holds what the list's foot row held**: the search and the state chips far left (the very nodes, moved in,
  with their handlers), the faces in its middle, and the row with the fish, the search, the chips and the usage goes —
  on the rail too. The fish's two jobs: the connection is the bar's first segment, and a click on it is the About box.
  The live count stays in the bar (the chips count the project in view; live counts every claude) with the asking
  ones in red; "clauding" left it, the chips say it.
* **Both awake switches are the bar's**, always there: the cup (amber while on) and the laptop (red while on, *Touch
  ID…* while sudo asks), muted marks while off. The chat header's cup and the ··· row for the lid show only with the
  bar off, so neither is ever lost.
* **Touch ID for the lid**: the board runs `sudo pmset -a disablesleep …` first. This Mac's `/etc/pam.d/sudo_local`
  already has `auth sufficient pam_tid.so`, so sudo asks for a fingerprint — from the server, a launchd agent in the
  user's session, with no terminal: if Touch ID is cancelled, sudo cannot read a password and fails at once, and the
  board falls back to osascript's administrator dialog (the password). On a Mac without pam_tid it is the dialog, as
  before; a sudoers NOPASSWD rule for that one command would make it ask nothing. Not tried live here: it puts a
  prompt on the screen.
* **The scenarios can start from prefs** (`meta.prefs`, passed to `launchChrome`): project-cue, people-row, notch and
  list-ends run with the bar off — they are about the list's foot as it was — and status-bar, people-row and
  keep-awake check the docked bar.
* **timeline.mjs flakes under load**: its thumb's width and its labels' fade are read on the clock, and with the
  machine's load average near 5 it failed two runs in three — the same on the commit before these changes.

## Decisions of 2026-10-09, later — the studies picked: ink cards, lanes, the edge light, sonar, the landing wash, a floating header to try, the status bar; Riso for later

Ricardo, on the studies page (seven screens A–G, five motions M1–M5): "B and C are pretty, so do it", "E's header that
floats seems pretty, but I need to test it so make it a toggle with the current one and the new one", "F is amazing
and we could support other stuff optionally like RAM usage and cpu stats", "G definetely a theme we should persue at a
later stage (save the intention and screenshot/data to support future development)", "do M2, M3", "M5 could be
interesting with B's change, but I would need to see it live - so make it a toggle between today's ring and charging
edge (M5)".

* **B · Ink cards**: the card is the panel; its project's colour a lit 3 px edge on the left and a glow of it from
  there (`--tint`, `--reach`), the project's name in its colour (lighter in the dark, darker in the light). Hover and
  the open card glow across; the open card still bleeds into the splitter. A project in the board's black wears a grey
  edge in the dark. The grey ground under a list of near-black cards (`#sessions.onblack`) went: every card is the
  panel now. The rail's squares keep their solid tint — there it is the only cue.
* **C · Lanes**: a head over each group the list ranks by — *Asking you · Clauding · Ready · Done* — its mark and its
  count at the right end; Claude's pixel mark, which stood alone between the clauding and the ready cards, is the
  Clauding head's now. Not sticky (the study's were): pinned heads fought the list's top pill and the timeline. None
  under a query, which ranks by the match; none on the rail. The day lines stay, inside the lanes.
* **M2 · Sonar**: a question no longer blinks the border on and off; the border is red and pings leave it — two
  outlines of it, half a beat apart, growing out from the card and fading (transform and opacity, phased like the
  ring). Still, under reduced motion: the red border and its glow.
* **M3 · the landing wash**: when a reply lands, besides the edge's flare, a wash of the card's light spreads from the
  ✓ corner over the card and fades (1.1 s, a scaled blob under the content). Not on a card still watching something
  (its pseudo-elements are the ring's); none under reduced motion.
* **E · the floating header, a switch** (Settings → Board → *floating header*, off by default): the chat header as a
  rounded bar inset from the column's edges, an edge of the project's colour and a shadow under it; the PR rows under
  it inset alike. Only the header, not the study's reading column or tool timeline. With it, the open chat's light
  runs round the card and up the splitter but not round the header's box, which no longer touches the splitter.
* **F · the status bar** (on by default; Settings → Board → *status bar*): a strip at the window's foot — connected or
  not, the chats live · clauding · asking, the drawers · shells · monitors, the plan usage as small meters (moved out of
  the list's foot; a click shows its rows) and the Mac kept awake. *Also*, off by default: **CPU** (every core's busy
  share since the last look), **memory** (used of total, counted as Activity Monitor does — app memory, wired and
  compressed from vm_stat; total less free would count the file cache as used and read 95 % on any Mac) and **Claude's
  memory** (the resident size of the live claude processes, their children aside), asked of the server every 3 s while
  the bar shows them. Each a meter: a word, a 40 px bar, the figure.
* **G · Riso, kept for later**: the study's intention, palette, shapes, CSS and screenshot are in `docs/studies/` —
  a light theme printed in two inks (navy and fluorescent pink on off-white), halftone cards, condensed titles with a
  misregistration, hard offset shadows. What is left to decide is listed there. A, D and the motions M1 and M4 were
  not picked.
* **M5 · the edge light, a switch** (Settings → Board → *edge light*, off by default): a clauding card's light runs
  down its lit edge instead of round the card — one light per sub-agent, a monitor's slowly in its colour — with a
  soft glow off the edge. The ring stays the default; with the edge light the open chat's light no longer runs on
  past its card round the splitter and the header's box (that comet is the ring's).

## Decisions of 2026-10-09 — awake always in sight, CI on the header, design ideas drafted

Ricardo, on the day before's five: "make the normal awake button always visible, on or off - the close lid with sudo,
leave it in "..."" and "having the CI status is a nice touch (but only on the chat top header, the cards are already
too busy to add more info".

* **Awake is a button in the header row, on or off** (`#awakeBtn`, before ···): off, a muted cup, as ··· is; on, the
  cup in amber saying *awake*. The menu keeps one row, *awake with the lid closed* (it takes a password). While the lid
  holds, the button is the red laptop, and its click turns the lid's setting off — idle sleep stays held if it was.

* **CI on a PR, in the chat header only**: the same GraphQL call asks the head commit's `statusCheckRollup` — its state
  alone, about a point of GitHub's budget for forty PRs, nothing per check — and an open or draft PR's chip in the
  header gets a round badge after its number: a tick in green, a cross in red (the chip ringed in red too, to be seen
  from across the room), or a ring turning in amber while the checks run; its row under the header says *passed ·
  failing · running*. The cards say nothing of it. It moves at the PR's own pace (a minute for a chat touched within
  the hour). Not done: which check failed (the PR's page, a click away, says), nor an alert when one fails.

## Decisions of 2026-10-08 — five asks in one message

Jira tickets as PRs are, the usage of a plan capped in money, the project's row, keeping the Mac awake, and ideas from
two apps of the same kind — one message, each its own commit, in the order they landed.

### The project's own row, its toggle in the header

Ricardo: "when filtering a project, the search on the bottom is to condensed to see, it should be expanded so it's
visible the project name and the X. also, clicking again on the project name up top on the chat header, should toggle
this filter".

* **The project in view is a row of its own** (`#stitle`, `#sessions`' grid row 3, the list's whole width, over the
  fish, the magnifier, the chips and the usage — which are row 4 now): its name, ellipsed only when it is longer than
  the list, and × at the row's end. It shared the controls' row since 2026-09-24 and was what gave way there; at 380 px
  the chips and the usage took everything and the name showed nothing but its ×. The row's tint is the project's
  colour, a shade deeper than the controls'. On the rail it is the short name under the fish, as before (row 4 there).
* **The chat header's folder name is the filter's toggle**: a click shows that folder's chats (as it did), a second
  goes back to ALL; underlined while it is the filter in view (`.repo.on`). `selectProject` redraws the header for it.
* → `scripts/scenarios/project-cue.mjs`: the row's width, place and whole name; the toggle both ways.

### The usage of a plan capped in money

Ricardo: "the token usage works for max subscriptions and so on, but for enterprise plans where you just have a hard
month $ cap, doesn't seem to work".

* **What such a plan answers**, read off the 2.1.295 binary (the CLI's usage schema, and the guide it carries for a
  gateway that serves the same endpoint): no rolling windows, but `extra_usage` — `{is_enabled, monthly_limit,
  used_credits, utilization, currency}`, the amounts in cents — and a `limits[]` row per cap, `{kind: 'spend', group:
  'daily' | 'weekly' | 'monthly', percent, resets_at, is_active}`, the dollars belonging to the active row. The board
  read neither: a spend row has no model to name it and was skipped, so the foot said *nothing reported for this
  account* (or, with extra usage over 0 %, a stray "E" with no reset). Not measured on a real enterprise seat — this
  Mac's account is a Max plan.
* **`usageWindows` makes a spend row a window** — `spend · this month` (the CLI's *today · this week · this month*),
  `$` its tag — carrying `used`, `limit` (whole units) and `currency` when the dollars are its own; `extra_usage` with no
  spend row to hang on is a window of its own, `extra usage · this month` (no reset is given); `wattle_ember`, a grant
  counted in dollars, keeps its label and amounts. In the panel the row says `$271 of $500` under its bar, and a
  month's tick is the calendar month before its reset.
* → `test/usage.test.mjs`, new; the money step in `scripts/scenarios/usage-bar.mjs`.

### Jira tickets, as PRs are

Ricardo: "can we do for jira tickets and we did for GH PRs?"

* **What names a ticket** (`ticketsIn`): `KEY-123` in a prompt or a reply — in inline code too, since Claude writes
  keys that way, but not in a fenced block (a log) nor glued to a word (`x-ACME-1`, `ACME-2b`) —, a `…/browse/KEY-123`
  link, and the chat's git branch (`feature/acme-31-…`, any case). A bare key could be anything — UTF-8, SHA-256,
  GPT-4 — so it is asked about only when its project is one of the site's (the project list, asked hourly), and no
  ticket shows until Jira has answered for it; a key Jira has no issue for is let go.
* **What Jira says** — summary, status (its name and its category: to do · in progress · done), type, assignee, and
  whether that is you (`myself`) — comes from one `bulkfetch` call per hundred keys, polled by how recently the chat
  was touched, as its PRs are (a done ticket an hour apart: it can be reopened). Jira Cloud only; a Server/DC site has
  no bulkfetch.
* **Where it shows**: the card wears the first ticket (the branch's, else the last named) as a chip in its category's
  colour — Jira's own grey, blue and green, which simple colours leave alone as they leave the PRs' — and `+n`; the
  chat header has every ticket among its PR chips, after them, and a row each under the PRs' (status · key · summary
  · *yours* or whose). A click on a chip or a row opens the ticket in the pane. Not done: a ticket's summary as the
  card's title (a PR's title is one), nor a ticket's *your move* — what would come round to you on a ticket is not as
  plain as on a PR.
* **The token**: a site and an email in the setup file (Setup → Jira, or by hand); the API token in the keychain —
  item *peixAIrada Jira*, written by `security -i` reading its command from stdin, so the token is in no process's
  arguments — or `JIRA_API_TOKEN` in the server's environment (jira-cli's own variable). It goes into Jira's requests
  and nowhere else: the page is told only where it is kept. jira-cli's own config, when there is one, is offered in
  the empty boxes (this Mac's has a site and a login, and no token the board could use).
* → `test/jira.test.mjs`, `scripts/scenarios/jira-tickets.mjs`, `scripts/fakejira.mjs`, all new; test servers keep
  the token in a file of their own (`JIRA_TOKEN_FILE`) and see no jira-cli config.

### Keeping the Mac awake, with its lid closed too

Ricardo: "we shuold have a button to 1) avoid sleep the mac, 2) avoid sleeping when the lid in closed. the buttons can
be on the "..." for now, but if active it whould be a perm sign probaby on TOP RIGHT".

* **Two rows in the chat header's ···**, before *settings*: *keep the Mac awake* and *…with the lid closed too*, each
  saying on or off; they toggle and leave the menu up.
* **Awake is `caffeinate -i`, held by the server** (`keepAwake`): idle sleep off while it runs — the display may still
  sleep, which costs agents nothing — `-w` on the server's own pid, so it can never outlive the board by accident. The
  switch is the board's (`awake` in the state file), so a restart starts it again. The server and not the app: the
  board is also a browser page, and the server is the process that is up while chats run.
* **The lid is `pmset -a disablesleep 1`** (`setLid`): nothing short of root keeps a Mac awake with its lid shut — an
  IOKit assertion does not — so each turn asks for an administrator's password through osascript's own dialog (no
  helper installed, no sudoers line). It is **the system's setting**: it survives the server and a reboot, so the
  board reads it back from `pmset -g` on every poll instead of remembering it, and shows it whoever set it. Not done:
  turning it off by itself on a low battery (that would need the password with nobody there).
* **The mark, top right** (`#awakeMark`): a pill before ··· in every header — a chat's or the empty one — a cup in the
  spend's amber while only idle sleep is held off, a laptop in red when not even the lid sleeps the Mac (the bag-and-
  battery warning). A click lets the Mac sleep again: the cup at once, the lid after the password.
* **Every test server runs fakes** (`scripts/fakecaffeinate.mjs`, `scripts/fakepmset.mjs`, `AWAKE_ADMIN=none`): no test
  holds this Mac awake or puts up a dialog. → `test/awake.test.mjs`, `scripts/scenarios/keep-awake.mjs`, both new.

### Ideas from two apps of the same kind

Ricardo: "we have similar apps out there: https://paseo.sh/ https://www.onorca.dev/ so borrow design ideas to
beautify this app".

Both sites were looked at in headless Chrome (their app mockups at 1.5×). What they share: a dark neutral ground,
Geist or Inter, thin edges, rounded panels; a tab strip where each tab wears its agent's or its kind's mark (Codex,
Claude Code, `npm run dev` with a prompt, a URL with a globe); a prompt drawn as a right-aligned bubble and the reply
as plain text under no label, each reply closed by a quiet row — copy, fork, *Worked for 31m 46s* — and chips under
the last one (*6/6 tasks · 3 subagents · +1.9k −684*); a sidebar grouped *Ready to review · Working · Done*, each row
a title, an age, and a second line with its PR and *✓ passed*; Orca's sub-agents listed under their task with a
spinner or a tick, and its status bar of usage bars (*58% 5h · 41% wk*). What came over, each small and in the
board's own idiom:

* **Marks on the tabs**: Claude's burst on the chat's tab (in the accent), the prompt on the shell's, a PR's mark or a
  globe on a page's, VS Code's on the editor's.
* **A prompt is a bubble on the right**, as wide as its words — the full-width block with the accent down its left
  edge goes; a hairline of the accent stays round it.
* **One who-line a turn**: Claude's second and later words in a turn drop their *Claude 8:16 PM* (the time stays on
  hover) — a long turn read as a column of labels.
* **The turn's footer**: under the reply that ends a turn, *copy* (the whole turn's words, as markdown) and *worked
  for 12m 4s* — measured on the server from your prompt (or the first line of a turn a task's notice woke) to that
  reply, since only the transcript's times can say it.
* **Not taken**: their typefaces (the board ships no fonts and the system's reads as well), rounded cards (square on
  purpose, 2026-09-27), the grouped sidebar (the board's clauding/ready divider and day lines say the same in less
  room), CI checks on a PR (*✓ passed* — a fair next step: `statusCheckRollup` on the call already made), the
  sub-agents' list under a card (their descriptions are in the main transcript's tool calls — a tooltip's worth), and
  a diff count per chat (git per folder on every poll).

## Decisions of 2026-10-07 — a chat whose claude has ended says so, and resumes itself

Ricardo: "seems like it's confusing to enter a old chat and not have the live claude session. instead of a text input
below to write and resume, make it more obvious (via a button) that you can resume the claude session and the current
chat is just render of that dead session. also, auto-resume after 5 seconds (had a toggle to turn this part off in
settings)".

* **The reply box is gone, and its route with it**: the box under a stale chat sent a one-shot `claude --resume -p`,
  and read as if the chat were still there to answer. With nothing on the page to call it, `POST /api/sessions/:id/reply`,
  `replyToStale`, `replying`/`replyError` on the summary, `REPLY_TIMEOUT_MS` and the fake claude's `-p` went too.
* **The resume bar** (`#resume`, `renderResume`, where the box was): *This chat's claude has ended* — what you see is
  its transcript — and one button in the accent, Resume, which is >_'s path (`termAction`, ⌥⌘C). Shown on the same rule
  the box had (`resumable`: no process, a file, no drawer on the chat); a chat last continued in VS Code says the tab
  there will not follow; a failure to start the drawer is said on the bar, in red.
* **Opening such a chat resumes it 5 s later** (`armResume` from `openSession`; the settings' *auto-resume*, on by
  default, `prefs.autoResume`): the button counts the seconds and a line runs along the bar's top; *Not now*, Esc (not
  inside a terminal), opening another chat or the switch off stop it; a dialog up holds it until it closes — a picker
  opened from that chat may well lead elsewhere. It starts the drawer where the chat tab is and leaves the tab on show
  and the keys where they were (`termAction(s, { stay: true })`): a GitHub page of the chat in front stays in front.
* **What does not count down**: a chat ticked done (browsing the done cards would start a claude on each); one whose
  claude ended while it was open (you, Done or `/exit` ended it, and 5 s later it was back); and the chat a load opens
  — a reload, the app rebuilt, the board started — which nobody chose just then (`openSession(id, { auto: false })`).
  Each of those has the button.
* **`drawer.err` is the chat's**: opening another chat clears it. A failed drawer said *failed* on every chat's >_,
  and would have said *Could not resume* on every ended chat's bar, until the next try.
* **The harness keeps it off**: `launchChrome` writes `autoResume: false` into the prefs of every page it drives,
  unless a page set it — `verify --hash` drives the live board, and 5 s on an ended chat started a real
  `claude --resume`; the scenarios open fixture chats and look at them for longer than that.
* **Left**: a file dropped on an ended chat is no longer typed anywhere (the box took its path) — the note says to
  resume first.
* → `scripts/scenarios/resume-bar.mjs`, new: the bar and no box, Resume, the bar back without a countdown when the
  drawer ends, the countdown (the seconds, the line) and the resume ~5 s on on the same tab, Not now, Esc, another chat,
  the switch, a done chat, a reload.

## Decisions of 2026-10-06 — a PR named short

Ricardo (the org and its repos as stand-ins): "PR scraping should also work with "#1234" and we should check if the PR
exist for the current project and if so, present it as normal. also "widgets#1234" and "gadgets#1234" should also
work, assuming github.com/acme".

* **Four spellings, each resolved as its line is read** (`refsIn`): `#12` is the chat's own repo's; `widgets#12` the
  org of the root holding a checkout of that name — else of the root the chat's folder is under, else the one root
  with an org, else the chat's own owner — or the chat's own repo when that is its name; `acme/widgets#12` as written; and `widgets #12`, with a space, when `widgets`
  is the chat's repo or a checkout under a root, a list after it on the same line (`widgets #12, #14 and #15`,
  `#12/#14`) being that repo's too. The space is how Claude writes it: in two weeks of this Mac's transcripts a repo, a
  space and `#n` came as often as without the space, and read as a bare `#n` it was the chat's own repo's — which, in a
  repo of thousands of PRs, GitHub confirms. `PR#12` is no repo called PR.
* **The chat's repo is read from its checkout** (`ghRepoOf`: the origin in `.git/config`, a worktree's `gitdir:` and
  its `commondir` followed — this Mac's worktrees live beside their repo), not taken from `repos`: that asks git, six
  folders a poll, and the boot has read every transcript before the first answer. Kept an hour, as `repos` is.
* **A short reference is no PR until GitHub says so**: it rides the batched call every PR does, is left out of the
  summary and of the card's title until a state comes back (`shownPr`), and a NOT_FOUND on its alias — an issue's
  number, a repo that is not there or not ours to see — lets it go from every chat that had it only so (`forgetRef`),
  and it is not taken up again until a restart (`noPr`). A URL or a pr-link line makes a PR the chat's whatever GitHub
  says, as before; one PR said both ways in a message counts once, where first said, as the fuller. A message is now
  read in the order it says things (the URLs were read before the rest).
* **A bare `#n` names something current** (`REF_AGE_MS`, 90 days): one GitHub finds merged or closed, and opened more
  than that before it was said, is not shown. A review report numbers its points `#1`…`#8`, and the chat's own repo has
  a PR #3 from years ago — the dry run over two weeks of transcripts turned up a #1 and a #6 of that kind, and would
  have titled cards with them. Named with its repo a reference is meant, and shown whatever its age (the request's own
  `widgets#1234`) — but no such past PR titles the card (`pastRef`): this very chat's two examples are a merged PR of
  2015 and a closed one of 2021, and the oldest titled PR names a chat with none open. Open or draft, a bare one is
  shown however old.
* **Code is not prose**: no `#12` inside a fence or backticks (GitHub links none there, and `#333` is a colour), nor
  in a link's text (its URL says which PR) or a URL's fragment; `&#12;`, `#0a0` and a leading zero are no numbers. A
  repo's name in backticks still names the repo after it.
* **The fake gh answers NOT_FOUND** for a PR its file does not name — `errors` and a non-zero exit, as gh does; only
  `null` before.
* **The cost**: every short reference in the transcripts' tails is asked about once at boot, in the same batches of
  forty; reading two weeks of whole transcripts (5 136 messages, 7.4 M characters) took 83 ms more than the URLs alone.
* **Left**: a `#12` in the transcript is still text, not a link — the answer comes after the line is drawn; a chat in a
  submodule resolves to the repo holding it (`checkoutOf`'s rule), and a fork's `#12` is the fork's.
* → `test/pr-refs.test.mjs` (the spellings, the checkout read, what is not prose, shown or not, let go);
  `scripts/scenarios/pr-refs.mjs` (the card's stack and the header's rows hold exactly what was meant, the card titled
  by the open one, a `#20` said live coming on).

## Decisions of 2026-10-04 — the card's PRs as a stack

Ricardo: "on the cards, the list of PRs should be stack and only expand on hover. the stack should reveal a bit of the
ones below, by drifting to the left".

* **A stack at rest**: the same chips — three, every one at your move among them, and the `+n` — the first on top at
  the row's end, each one under it 5 px further left, so a sliver of its colour shows. A 1 px edge in the panel's
  colour on the left of each chip over another (as the faces are ringed) keeps two of one state two. The ones under
  have no number and are clipped to the sliver and the radius: a chip GitHub has not answered for is a 7 % wash, and
  three of those stacked were three numbers through one another and a top chip in three shades.
* **The pointer on the stack fans it out** — the stack, not the card: under the card's hover every card the pointer
  crossed would fan and move its row. Side by side, 5 px apart, the top chip where it was; the row makes room, the
  faces and the ✓ sliding left (the fan does not lie over them). The pointer gone, it closes; a click on a fanned chip
  opens that PR, as before.
* **CSS only, nothing measured**: every chip sits in the grid's last column, so all take the widest chip's width, and
  a transform places each — `-5px` a step of depth stacked, `-(its own width + 5px)` a step fanned: a translate's
  percentage is the element's own width, the one length CSS lends without a measure, and equal widths make it the
  step. The columns before it are empty, one per chip under the top one (`--under`): `0fr` stacked — only their gaps,
  which the slivers fill — and `1fr` fanned, where an empty flexible column takes the fr's size, the widest chip's. So
  the grid's own width follows the fan, and the row with it. `grid-template-columns` interpolates `0fr` ↔ `1fr` (the
  accordion trick) and the two transitions share their curve, so the stack's edge and its last chip move together —
  in WebKit a frame apart at most (read mid-way on the board: 4 px of 151). **Equal widths are the price**: a `#12`
  beside a `#12345` is as wide as it, the `+n` as wide as a PR; in one repo the numbers are mostly one length.
* **The chips' transition was silently not theirs**: the small controls' one hover ease (2026-09-27, night) is
  `:is(.btn, …, .cpr, …, #usage button, #stitle)`, and an `:is()` weighs its heaviest argument — an id. The stack's
  `.card .top .tprs > *` lost to it in both engines: the fan jumped open while the box beside it eased, and the first
  scenario passed, reading only the settled rects. Its transition rules now carry `#slist`, and the scenario asks
  for the running slides at the move. A line in CLAUDE.md's *Invariants that bit us*.
* **`overflow: clip`, not hidden**: hidden makes the box a scroll container, whose least width is 0, and a tight row
  (a long folder name on ALL) squeezed the stack with the name — the top chip lost its corners while the name still had
  letters. Clipped, the stack's least width is its own and the name ellipsizes first; a fan with no room loses the
  chips at its far left. The 2026-09-28 wrap (a chip past the row's room on a hidden second line) went with it.
* **Probed in both engines**: a static page of the CSS in headless Chrome and in a `WKWebView` (a Swift probe of the
  session) gave the same rects at rest, fanned and mid-way, a lone chip and a tight row included; then the board itself
  in the probe, at rest and fanned (WebKit's hover does not follow a synthesized move, so the page's own `:hover` rules
  were copied onto a class) — which is how the transition above was found.
* → `scripts/scenarios/card-pr-stack.mjs`: the geometry at rest and fanned, what the pointer finds at each chip's middle
  and sliver, which numbers show, the ✓ moved by what the fan took, a click on the third chip, the stack back, two of
  one colour, a lone chip, the fan at once under reduced motion.

### Later the same day — the fan scrolls, and holds every PR

Ricardo: "when hovering and it's expanded, allow to scroll the list of PRs".

* **Every PR is in the stack now**, the `+n` gone: what it hid is what the scroll is for. At rest the stack looks as
  it did — the top chip and three slivers (the first four in the chat's order, every one at your move among them) —
  and the rest lie under the third sliver, so a chat on eight PRs is no wider than one on four.
* **The fan takes the row's free room and scrolls past it**, rather than push the folder's name or run off the card:
  the box is `flex: 999 0 0` — a basis of nothing and all the grow, so it takes the free room before the spacer does —
  between `min-width: min-content` (the stack, so a tight row still takes the name down first) and
  `max-width: max-content` (the fan, so the spacer gets the rest). Because it is always so, the box's width is
  `min(the fan as it slides, the room)` coming and going: with the old `flex: 0 1 auto` at rest, the box would have
  jumped to the whole fan's width the moment the pointer left. `overflow: clip` gave way to the scroll container;
  `min-content` keeps its promise (a scroll container's own least width is 0).
* **The grid runs right to left**: a scroll container reaches what overflows it at its end, and an LTR box's end is
  the right — the fan grows left. With `direction: rtl` the chips' column is the first, on the right, the spacers
  follow to the left, the scroll starts at the top chip, and `scrollLeft` runs negative into the stack. The chips set
  `direction: ltr` back. What scrolls is the chips' transformed boxes: once the box is narrower than the fan, the
  flexible spacers shrink to fit it, and the transforms carry the chips past.
* **The slivers stay three with any number under them**, so the spacers can no longer be one per chip: there is one
  per sliver (`--under`), `0fr` stacked with the 5 px gaps, and fanned each `--span` chips wide (`(n − 1) / under`,
  in fr, from `cardPrs`) with the gap at 0 — the 5 px between fanned chips is a margin on each chip instead, which
  makes the column the chip and its margin (and puts 5 px past the deepest sliver, which `margin-left: -5px` on the
  box lays under the row's gap). Transform and track still move together: the box's edge is the deepest chip's, 5 px
  out, all the way.
* **A wheel turned over the fan scrolls it** (`fanWheel`): a trackpad's sideways swipe scrolls it natively; a vertical
  turn would have scrolled the list, carrying the card from under the pointer and closing the fan. Down is deeper,
  leftwards. Only while the fan overflows, so a wheel over a stack at rest is still the list's. The listener is the
  stack's own, added on the first `pointerover` (a rebuilt card is a new node and gets one the same way): a
  non-passive wheel listener on `#slist` would make every scroll of the list wait on the page.
  `overscroll-behavior-x: contain` keeps a swipe past its end from turning into the browser's back gesture.
* **The pointer gone, the fan scrolls back** (smooth, or at once under reduced motion) while it closes: left scrolled,
  the shrinking scroll range would pin the view to the deepest chip, and the stack close round it backwards.
* Probed in WebKit on the board: the same rects at rest and fanned, the box the free room (224 of 355 px), the
  folder's name untouched, and the page's own wheel handler taking the fan to `scrollLeft` −131, the deepest chip at
  the box's edge. The scenario now runs on eight PRs: at rest, fanned, wheeled to the end and back, a sideways swipe,
  a click on the deepest, and back at the start once the pointer leaves.

## Decisions of 2026-10-03, night — the menu bar left out beside the notch

Ricardo, back on the MacBook: "seems like the menu bar when the screen has a notch, is not disapearing anymore when
the app is on?"

* **What happened**: not the options. A probe outside the app (`NSApplication.currentSystemPresentationOptions`, and
  the window server's `Menubar` window in `CGWindowListCopyWindowInfo`) read `hideDock` + `autoHideMenuBar` the whole
  time the board was in front — and the menu bar down at y 0, 18 s on, the pointer nowhere near it. Each time it
  stayed, the board had come forward **across a change of desktop** (its window sliding in from x -148, -103, -675;
  the old build twice, the review's build once, at its launch). Back from Mission Control, no desktop changed, the bar
  went within the second. Before 2026-09-28 every screen was auto-hidden; since, the user had mostly been on the DELL,
  where the bar is hidden outright and a change of desktop cannot leave it out.
* **The fix**: `tuckMenuBar()`, half a second after the app comes forward or the active Space changes
  (`tuckMenuBarSoon`, one pending at a time): filled beside a housing, it sets `hideMenuBar` and 0.1 s later
  `fillOptions()` again — hidden outright for a moment, then auto-hidden with nothing showing. Not while the Dock is
  out (AppKit throws on `hideMenuBar` without `hideDock`), nor with the pointer in the strip, reaching for the bar. The
  app log says `menu bar: tucked (it was out | it was in)`, by `NSMenu.menuBarVisible()`.
* **Not seen on a stuck bar yet**: on the build with the fix, the one change of desktop measured had the bar gone at 1 s
  — but the log said it was already in when the tuck ran, so macOS hid that one itself. The next `it was out` in the
  log, with the bar gone, is the proof; one that stays out with that line says the hide-and-back is not enough.

## Decisions of 2026-10-03 — a review of the whole tree: what it found, what changed, what was left

Ricardo: "do a thorough review of the code, try to improve performance, fix bugs and improve code quality (and
modernize it)".

Nine readers went over it in parallel — the server in three parts, the page's script in three, its CSS, the Swift
shell with the two shell scripts, and the harness — about 150 findings between them. Each was checked against the
code (and most by running something) before it was changed; the ones kept are in the commits from `ef298bf` to
`15468c2`, a commit per subject. `npm test` grew from 50 tests to 62 and runs in 7.7 s instead of 12.7.

* **The bugs worth a story.**
  * *Agents counted for fifteen minutes after they were done.* Sub-agents now end by calling `SubagentHandback` — a
    tool_use, its tool_result, and no `end_turn` after — and `agentRunning` took only an `end_turn` as the end. The
    card stayed clauding with "N agents", and the chat's own reply, which ended while they counted, was never alerted
    (found in a real chat: three agents handed back, two replies suppressed). The handback's result ends an agent now,
    and so does an interrupt; a chat whose claude is gone counts none.
  * *The drawer's drift, at its root.* The page's xterm and the holder's drifted by a line on a resize and stayed so —
    the open item of 2026-09-22, whose fix was to be a re-sync after a resize settles. The cause was simpler: a grow
    parks the cursor (`refit`) and returns it with a CUU written behind the parser's queue, so output that arrived
    meanwhile — the app's repaint after its SIGWINCH, most of all — was parsed in between and had its cursor moved by
    the CUU. The holder and the page now hold what reaches the screen until the refit is done. Measured against the
    holder's own snapshot after six window resizes: two runs in three drifted before, none after. The re-sync protocol
    was written, tried, and taken out again: not needed once the cause was gone. Behind it, the fake claude's own
    geometry (its region drawn mid-screen after a grow, its cursor at the bottom) had `drawer-altkeys` failing every
    run on this Mac; fixed in the fake.
  * *A launcher's drawer never followed `/clear`*: it was known by its PTY's pid, which is `task`'s; it is known by the
    claude it was tied to now.
  * *The server could fall over or be held*: an error after a `writeHead` (a reload while a checkout briefly removed
    index.html), a bad frame on a drawer's socket, a spawn of a `code` that is not a program, a holder that accepts the
    connection and never says hello (held the boot, and the port, for good). And a server waiting on a busy port —
    the agent behind the app's own, an `npm start` beside the agent — adopted the holders, polled GitHub, posted
    alerts and wrote its boot-time state over the live server's: the port is taken first now, and nothing runs until
    it is.
  * *Two `claude --resume` on one transcript* from two quick presses of ⌥⌘C: one spawn per chat at a time, on the
    server and on the page; and Done or Take over signalled whatever had inherited a dead claude's pid — the registry's
    `procStart` is checked first.
  * *Opening a chat raced its stream*: an entry pushed before the fetch's answer went into the previous chat's log,
    one in both was drawn twice, one could be lost. Entries are numbered on the wire (`gen`, `upto`).
  * *A late answer painted another chat*: the take-over's disarm timer, its spawn, the focus view's wait, the editor
    row and ⌥⌘T all acted on whichever chat was open when they finished.
  * *A drawer whose socket dropped was dead until a reload* — every server restart; it re-attaches now.
  * *PRs*: case made two PRs of one, a comment on someone else's PR made every later push "your move", a bot's
    force-push was a move, a PR GitHub would not show lost its title, a pause outlived the outage.
  * *Peacock* read and wrote straight through settings.json's comments (a `{` in a comment took the inserted key), and
    taking the colour out left Peacock's own copy, which the reading fell back to.
  * *Safety*: the fake claude's guard compared spellings (`~/.claude/`, `~/.Claude`, a symlink and `HOME` pointed
    elsewhere all got past it); any site could GET a route through an `<img>` (`Sec-Fetch-Site` now); bound to every
    interface the board answered the LAN; a reply could have the board fetch `![](https://…?q=secret)` on sight, or
    restyle the board with a `<style>`.
* **Performance.** The list draws once a frame and touches nothing when nothing moved (it measured every card twice
  per update); the boxes redrawn per update are drawn only when they changed — which also fixed clicks lost on a
  button replaced between press and release (the project cue's × opened the picker instead). The path matcher was
  quadratic on `+` and `@` (800 ms for a 40 000-character line, now under 1). The sort reads each chat's time once;
  the fuzzy matcher stops at the first start that cannot finish; the open chat's light keeps its animations; a growing
  run of tool calls is appended to rather than redrawn; the PTY hears a size once it stops moving. On the server: one
  lsof at a time, backing off for a long-running command; ps only when a new process is in the registry; plan usage
  one question at a time, a failure kept half a minute (a refused keychain was a prompt per poll).
* **The harness** fails fast (a closed devtools socket rejects every pending command; a command gives up after 60 s;
  Chrome picks its own port — `9222 + pid % 500` drove somebody else's page now and then), cleans up on every way out,
  reloads with `ctx.reload()` (fifteen reload-and-sleep pairs), waits for the right chat in `openChat` (it waited for
  any `.text.md`), and its test servers read nothing of this Mac's: an empty `~/.claude` (the real one before — and a
  real `gh` call for every PR in it, every `npm test`), the fake gh, no inherited `CONFIG_FILE`, a zsh with no rc files.
  Temp dirs go with the process (a hundred were left in `$TMPDIR`).
* **The app**: one server of its own at a time, ended when given up on; with the agent installed, the app waits for
  it and Restart Server is `launchctl kickstart -k` (it restarted nothing); the board comes back by itself once the
  server answers again; a dead web process is reloaded; the pane opens a file panel and shows `alert`/`confirm`/
  `prompt` (GitHub's "are you sure" buttons did nothing); the log is appended on a queue of its own; the window comes
  back where it was left. **Not installed from here** — `mac/build.sh install` puts it in /Applications.
* **Left as they were, on purpose or for now.**
  * *The asking card's blink* animates `border-color` and `box-shadow` on the main thread for as long as a question
    waits. Moving it to an `::after`'s opacity would run it on the compositor — but the card clips at its padding box,
    so the red edge and its glow would move inside the card: a change of look, for Ricardo to see first.
  * *The tint transitions* (`--hbg`, `--openc`… registered `inherits: true`, eased on `main` and `#chat`) restyle every
    descendant each frame of the 250 ms after a chat switch; unmeasured, so unchanged.
  * *The trail over the usage panel* (both z-index 30) and the rail's `::-webkit-scrollbar` want a look in the app's
    WebKit, not Chrome's.
  * *A link in VS Code Web* replaces the editor (the pane loads a `window.open` into the view that asked); a new tab
    for it is a design question.
  * *`latestOpinionatedReviews`* would see an approval older than the last twenty reviews; not added to the query.
  * *The notes under a modal* go to `document.body` when their anchor is gone; a popover would put them in the top
    layer. *md()* still parses a message three times (marked, DOMPurify, a template).
  * `ServerController` is still callbacks, not async/await; the CSS's dark inks are still written out in four places.

## Decisions of 2026-10-02 — the light keeps up with its card, is lighter than its colour, and ⌥⌘B folds the list

Ricardo: "sometimes the vertical separator bar has a delay accompaning the height of the card. it's a bit jarring
because we can clearly see the colors now. · sometimes the go-araound card animation when it's clauding gets out of
position, the height is wrong and takes a few seconds to recognize that the card is elsewhere · the go around-animation
should have more contrast sometime, probably always on the lighter side. [a project] is a dark blue and I barely see
the animation because it seems to dark, low contrast · the cmd B to hide the cards column should be hotkey B".

* **One cause for the first two: the frame was drawn from the start of a slide.** A render calls `listChanged()`,
  whose frame reads every rect once — but `drawCards` has just started the FLIPs, and a rect read then is the card at
  its *old* place (the transform at its first frame). So when a card moved above the open one (another chat's newer
  word, a new chat, a fold), the splitter's colour and the open chat's light stayed where the open card had been, at
  the old height, until the next update — seconds later, or never while the board was quiet. Measured with a
  scenario: the card at 87–167 after the slide, the light's shape and `--split` still ending at 80. **Now the frame
  follows the motion**: every slide and fold goes through `follow()`, and while one runs (`sliding`) the frame is
  drawn again each frame and once more when the last ends — the black under the card slides with it, and the light's
  outline grows and shrinks with the card. A slide is 220 ms; the frame's reads were already the cheap kind (a few
  hundred offsets under ALL). **And the open card's size is watched** (`watchOpen`, a `ResizeObserver` on that one
  card): its height can change with no render of the list — the 30 s tick writing an age a digit longer, the title
  beside it wrapping to another line — and nothing redrew the splitter then either.
* **The clauding light is the colour lifted towards white** (`--glow`): the ring was the colour itself running on a
  track of the colour at 85 % — on a navy (`#001e57`), navy on navy, nothing went round that the eye could follow.
  Now it is OKLCH with the lightness 85 % of the way to white, hue and chroma kept: a periwinkle on the navy, a pink on
  a wine, a pale orange on an orange — every light lighter than its edge, a dark colour's by far. Tried at 60, 75 and
  85 % against six of this Mac's colours in both themes: 85 is the first where the darkest read at a glance and the
  hue still names the project. The yellow's light is as faint as it always was — the yellow is nearly white already.
  `--ring` (white, on a black card where the card is dark) still wins. **The landing flare is the same light**: it was
  the ring's colour by design, and was as unseen on the navy.
* **The open chat's light is white on every colour**: it was the header's ink (`inkOn`) — white on a dark colour, but
  near-black on a light one (an orange, a green): a shadow going round, not a light. White is the lightest thing on
  every colour, and in the dark theme the open card's tint under the band is darker than the colour, so it reads even
  on a yellow. The light theme on a light colour reads less well than the black did; *always on the lighter side* is
  the ask.
* **⌥⌘B folds the list** (`HOTKEYS`; `boardKeys` in main.swift): ⌘B was VS Code's own sidebar key, and the app's
  forwarder took it from every page in the pane — VS Code Web's sidebar, GitHub's bold. As every ⌥⌘ letter, ⌥⌘B is
  now taken from the pane instead: VS Code Web gives up its ⌥⌘B (the secondary side bar), as it gave up ⌥⌘F and ⌥⌘W.
  ⌘ alone keeps the halves (⌘1 ⌘2 ⌘0 ⌘W) and ⌘,.
* **A chat's answer that comes after another was opened is dropped, and the address is set at once**: the suite's
  `hotkeys` failed twice in a row with these changes (and 1 in 6 on the commit before them): ⌥⌘↓ then ⌥⌘↑ opened the
  chat below and came back, and `openSession` wrote the address only once its fetch answered — so the first chat's
  late answer put its id back in the address while the second was open, and the harness's next `location.hash =` that
  id was no change of hash: nothing opened. The same late answer drew its transcript under the other chat's header.
  Now `openSession` sets the address before it asks, and an answer for a chat no longer open changes nothing. 8 runs
  out of 8 after.
* **Verified**: `scripts/scenarios/open-light.mjs` — the other clauding chat says something newer, the open card
  slides down under it, and the light's outline and `--split` end at its new bottom (against the page before this
  change, in a scratch worktree, the same step fails: both still at 80); back up again with it; and the ring's light
  read off a probe as an OKLCH lightness (.94 for a .6 blue). `chat-filter.mjs`: plain ⌘B no longer folds, ⌥⌘B does;
  `hotkeys.mjs`: ⌥⌘B in the settings' list, no ⌘B; the nine scenarios that folded with ⌘B fold with ⌥⌘B. Screens of
  six project colours, both themes.

## Decisions of 2026-10-01 — the setup in ~/.config, and a first run that asks where the repos live

Ricardo: "I want to make this available to other developer, so I need to segregate my config (shoul we use
~/.config/peixairada ?) for the source code, where the code has little to no leaks of specific stuff for my setup. if
we never configured the app, we should probably prompt for the base folder where git project will leave (in my case
is ~/acme)."

* **What was still one Mac's in the tree**: nothing that runs — the setup left the code on 2026-09-28 — but words: the
  company's folder and org in a test server's comment and two scenarios', a CSS comment naming a long-gone
  `PROJECT_COLORS` entry, the new-project dialog's placeholder, the org in two tests and a GitHub URL in another, the
  org's name in CLAUDE.md. All generic now (`acme`, as the README's shots). **Left as they were then**: the dated
  quotes in comments and this file (both went later the same day, below); and the README's clone URL, which is
  where the repo lives.
* **The setup is a file of the user's: `~/.config/peixairada/config.json`** (`$XDG_CONFIG_HOME`, `CONFIG_FILE`). The
  split is setup against state: what someone sets once and might keep with their dotfiles — the folders of repos,
  ⌥⌘O's project, the short names and colours — goes there; what the board records as it is used — ticks, titles,
  pins, hidden projects, environments, PR turns, 35 KB that move every minute — stays in Application Support with the
  holders' sockets and the attachments. Named projects, pins and hidden were weighed and left as state: they are made
  by gestures on the board, not set. The notifications switch too (one bit, the board's).
* **Moved, not copied**: the state file's `config` is written to the new file at boot and dropped from the state
  file at once, so deleting the new file later starts over rather than resurrecting the old setup. **At boot only**
  (`loadConfig()` in `main()`): written first at the module's top level, the move ran from `npm test` —
  `test/agents.test.mjs` imports the server with no `STATE_FILE` of its own — against this Mac's real files. It did
  the move that was meant (this Mac's setup is in `~/.config/peixairada/config.json` since), but a test writing a
  user's files is the bug; a test now imports the module under a made-up home and checks nothing was written.
* **The file reads by hand**: two spaces, keys in a fixed order, a folder under the home as `~/…` (so the same file
  works for another user name), written in place — a rename would turn a dotfiles symlink into a plain file. **A hand
  edit reaches every page within two seconds**: a stat every `CONFIG_POLL_MS` against the board's own record of the
  file's mtime. `fs.watchFile` came first and missed a file made and deleted between two of its looks — the
  scenario's own step, and a dotfiles checkout's.
* **A file that does not parse is never written over**: the board keeps what it had, the Setup says why in red, and a
  PUT is refused (409) until it reads — losing someone's hand-written file to a click in the settings is worse than a
  refusal.
* **A STATE_FILE of its own takes the config along**: unless `CONFIG_FILE` says otherwise, the config sits beside an
  explicit `STATE_FILE`. Every test server and every `test/*.test.mjs` sets one, so none of them can read or write the
  real `~/.config` file — the safe default without touching forty-two scenarios.
* **The first run asks, once** (`ask`: no roots ever set, none from `ORG_DIR` / `ORG`, the file readable): a modal
  over the board — the fish, "Where do your repositories live?", the server's guesses as rows, the folder and the
  GitHub org in two boxes, Skip and *Use this folder*. **The guess comes from the chats**: the folders holding the
  checkouts they ran in, by how many (a subfolder, a worktree, a submodule count as their repo; the home never), then
  the usual names (`~/code`, `~/src`, `~/Developer`…) that hold a checkout; a lone chat in a lone checkout (a download
  unzipped) is dropped while anything likelier is there. The org is the commonest GitHub account in those checkouts'
  `origin`, an ssh alias's host (`github.com-work`) included. On this Mac: `~/acme`, 155 repos, 33 with chats,
  `acme` — the answer is ⏎. **Skip is an answer** (`roots: []`, never asked again); Esc only puts it off to the next
  load; a folder under the home that is not there yet is offered to be made (*Make it and use it*, `create: true` —
  the welcome's alone: a typo in the Setup stays a refusal). In the app, *Choose…* is the system's folder panel.
* **The README says what to install first** (the same day, "is readme update with installation setups (including
  dependencies that need to be installed first)?" — it was not): a table of what it runs on, the optional three marked,
  then install, first open, updating and removing. Writing it found a gap: the login agent's PATH was Homebrew's and
  the system's only, so a `gh` installed by mise or asdf was never found and the PR states stayed off without a word.
  `launchd.sh install` now bakes the installing shell's PATH (absolute entries, once each) ahead of those.
* **This file names no real org, repo or person** (the same day — Ricardo: "I don't think I want to leak
  decisions.md as it is now, ca[n] we replace things like [the company's name] with "acme"?"): the company is `acme`,
  its folder `~/acme`; the repos that told it apart have stand-ins (`notifier`, `admin-service`, `chain-service`,
  `scheduler`, `web-clients`, `site`, `shop-backend`), PR numbers are made up, a reviewer's handle is `ana` (the
  fixtures' name), a chat title and a search lost the words that said what the company does, and a launcher's
  environment says *a cluster's credentials* instead of which services. Kept: names any company has (`wallet-api`,
  `backend`, `oracle`), which the tests and the code use as fixtures too. **The history was rewritten to match**, before the
  repo goes public (Ricardo: "I WANT to redefine all commits to remove PII traces before making the project
  public"): `git filter-repo` ran the same replacements over every version of every file and every commit message,
  the home path became `/Users/me/`, and every commit's address GitHub's noreply one (`user.email` in this repo's
  config, so new commits carry it too). 291 commits, the newest tree byte for byte the same; a scan of every blob and
  message finds none of the names. GitHub's `main` was force-pushed; the commit IDs this file cites are the new ones.
  The author's name stays — the repo is under it.
* **The quotes left the code too** (the same day, "yes, strip the quotes too and push"): 175 mentions in comments that
  said `(2026-09-28, Ricardo: "…")` now say `(2026-09-28)` — the date stays, the words are in this file's entries,
  where they always were too. What a quote alone carried (a context after it, "a popover … before") was kept.
  Checked mechanically: every changed file is the same code with its comments taken out. From here on a comment
  carries a date and never a person's words (CLAUDE.md).
* **Verified**: `test/config.test.mjs` (the move, a hand edit, a broken file, the guesses over a made-up home with a
  worktree, an ssh alias and a download, `create`), `scripts/scenarios/welcome.mjs` (new — the guess in the boxes, a
  folder made, the file deleted by hand bringing the question back, a double click answering it, ⌥⌘N listing the repo
  no chat ran in, Skip lasting a reload), the guesses against this Mac's real chats, and the dialog in both themes.

## Decisions of 2026-10-01 — simple colours

Ricardo: "some people don't like so many colors in the apps, it's too stimulating. can we have a them config with
simple colors?"

* **A switch, not a theme picker**: *simple colours* in the settings' Board pane, beside the other switches — a pref of
  this browser, like the card size, since each person who wants it is at their own board. Light and dark still follow
  the system; each has its simple set.
* **Greys and one accent**: every project colour goes — Peacock's, the setup's and ALL's black — so the cards, the
  list's edge, the splitter, the chat header and the rail take the grey a folder without a colour always had
  (`repoColor` and `projColor` answer null). The hues that only name a state go grey and differ by tone: ready darker
  than clauding, done lightest; the plan's spend, the monitor's teal, VS Code's blue, inline code and the syntax
  (comments and strings apart by tone alone).
* **…but not the PRs or the people** (later the same day, Ricardo: "the theme should affect the project colors, no
  mute the PR and user icons color"): a PR chip keeps its state's colour — on the card and in the header —, GitHub's
  faces theirs, and your mark before a card's prompt its teal. The first cut had greyed them all (a PR by tone, open
  darkest; the faces grayscale): the theme is the projects' colours and the states' hues, not who or which PR.
* **One colour of your choosing instead of the grey** (later still, Ricardo: "for the file color, allow customized the
  color itself with a color picker"): under the switch, while it is on, a swatch — the colour every project then
  wears, ALL included: the cards, the list's edge, the splitter, the header, the rail. Grey until one is picked; ⌥-click
  goes back to it. The chat header's square, which picks the folder's Peacock colour, picks this one instead while
  simple colours are on — the square shows the board's colour then, and changing Peacock's from it changed nothing on
  the board. The states stay grey and the PRs and faces keep theirs. A pref, like the switch.
* **Black as that colour still stands out** (later again, Ricardo: "the background color for the 2nd color is black,
  but if we use a single mono color, ensure there is some contrast (e.g. if we choose all cards black, make the
  background not balck (gray?))"): a colour as dark as the board's black (`nearBlack`) turns that black grey — the
  header right of the project's box and the splitter under the open card (`#4a4a45`), and, in the dark theme, the
  ground behind a list whose cards are all that dark (`#2e2e2b`); the light theme's ground was light enough. It goes
  by the colour, not the switch, so a project painted `#000000` gets it too. An open black card's name, which kept
  the light theme's dark ink on the black, takes the light one like the rest of the card.
* **Black is the default** (and again: "leave black as the default color when picking the 'simple color' option"):
  with no colour picked, simple colours paint every project black (`simpleTint()`), not grey; ⌥-click on the swatch
  or the header's square goes back to black. Grey is still a colour the picker can choose.
* **The README shows both** (and: "update the readme screenshot with current UI and show case both colorful version
  and the simple color (black) version"): `scripts/readme-shots.mjs` turns the switch on last and shoots the same
  board again (`docs/shots/simple-*.png`), and the README shows it full width right under the board in colour, each
  in the reader's theme (side by side in the features table first, at 380 px, it went unseen).
* **The accent is kept for what wants you**: a question's blinking edge (`--needs` is the accent here, not red),
  *your move*, the unread count, the focus ring, the selection, links. Claude's ✳ on every card and a Fable chat's F,
  which wore it as decoration, go grey; Claude's pixel mark between the clauding and the ready cards keeps it — one per
  list.
* **The colours are not lost**: Peacock's setting and the setup's are untouched, and the setup's squares and the
  header's colour picker show the colour as set (`ownColor`), since that is where it is set. Off again, all of it is back.
* **Not done**: the terminal's colours are Claude Code's own (its `/theme`); and motion — the rings, the blink, the
  comet — is the system's *reduce motion*, which the board already honours. A board quieter still is the two together.
* **Verified**: `scripts/scenarios/simple-colors.mjs`, new — the chroma of every surface measured off, on, after a
  reload and off again; the setup's square; the question still in the accent; the PR chips, a face and your mark in
  colour either way; the one colour picked under the switch and at the header's square (Peacock's file untouched),
  ⌥-click back to grey, kept by a reload; black as that colour, in both themes, against the greys beside it. open-light, card-signals, cog-setup,
  header-prs, people-row and project-cue still pass.

## Decisions of 2026-09-30 — ticking the open chat moves on

Ricardo: "when I mark as done, we should move the the next chat (up or down)".

* **Down first, then up**: ✓ on the open chat opens the card below it in the list as shown — the one that slides into
  its place — and, when it was the last chat still to do, the one above. Done cards are stepped over (with the done
  chip on they sit at the bottom, and opening one is no next thing to do); nothing left to do, the chat stays open as
  before. One function, `tickDone`, for the card's ✓ and ↩ and the chats step's ✓, so ⌥⌘N's cleaning moves the column
  along too while the picker stays up.
* **Only the open chat**: a card ticked while another chat is open leaves the column where it is; ↩ moves nothing.
* **At the click**: the move does not wait for the server. An empty chat ticked done leaves the board on its
  `session` event (`leaveChat`), which can arrive before the POST's answer; moving first keeps that path for the case
  with no neighbour only. A failed tick still says so, by the card.
* **Verified**: `scripts/scenarios/tick-next.mjs`, new — down, up over a done card, another card, ↩, and the chats step.

## Decisions of 2026-09-29, morning — compact cards of one height

Ricardo: "add an option in the compact setting to make cards same height".

* **Same height, a switch of compact's own**: under the cards slider, shown only when compact is chosen. On, a card's
  title is one line (ellipsed) and nothing hangs under it — the question and *your move* lines are what made compact
  cards of different heights besides a wrapped title — so every card is the top row and one title line. The signals
  those lines carried stay on the card: an asking card's edge blinks red as ever, and a PR at your move is ringed in
  the accent. Off by default; a pref, kept while the slider is elsewhere.
* **…keeping the *your move* line** (the same morning: "the same height should preserve the 'your move' row"): it
  stays on the cards that have one, and every other card holds an invisible line of the same metrics in its place, so
  the heights still match — the top row, one title line, that row. The ring on the chip, a stand-in for the line, went.

## Decisions of 2026-09-29, one o'clock — /compact ends, the splitter scrolls with the list, a row of faces that filters

Ricardo: "seems like when I do a /compact even after it finishes, the card stays 'clauding'"; "the vertical separator
has some kind of lag when scrolling, which looks bad because it's supposed to be attached to the card now"; "add an
extra row at the bottom of the cards with all the users I have interactions with PRs and by clicking on their face, I
filter only those cards".

* **A /compact ends.** Claude Code 2.1.283 writes the typed `/compact` as a plain prompt line (no tags — it reads as a
  prompt, so the chat went clauding and its last prompt read "/compact"), and once compacted writes the boundary, the
  summary and the command's own tagged lines — no assistant line, so no `end_turn`, and nothing in the transcript ever
  said the turn was over. The registry does: `statusOf` takes the process's `idle` over the transcript's `working` when
  it came after your last word (`statusUpdatedAt` ≥ `lastUserAt`); an idle older than the prompt is the turn before,
  so a prompt that reaches the transcript a beat before the registry says busy does not flicker. The fake claude now
  reports busy and idle as the real one does, and does a `/compact` the real one's way; `drawer-compact.mjs` failed
  without the rule and passes with it.
* **The splitter's black scrolls with the list.** The list's scroll runs on the compositor; `--split` was rewritten
  from the scroll event in the next frame, so the black trailed the card by a frame or two — visible now that the bar
  is meant to be the card's. `--split` is in the list's own coordinates now (the card's bottom as at scroll 0, so a
  scroll writes nothing), and a scroll-driven animation on the list's scroll timeline slides the black up by the
  scroll; the bar lost its 1 px edges so it can clip what slides. A Swift probe of the system WebKit (a `WKWebView`
  on the live board, scrolled 500 px) read the black slid by exactly -500, and `CSS.supports` true for scroll
  timelines and `timeline-scope`; Chrome runs it on the compositor. Without them, the old per-scroll write stays.
  The harness's `settle()` now leaves scroll-driven animations alone — one runs for as long as the list can scroll.
  The open chat's light (`#trail`) is still drawn from the list's frame, so it can trail the card while you scroll.
* **A row of faces under the cards filters by person.** Everyone in the PRs of the chats in view (the project's, in
  the states the chips show) — the same `people` the cards' faces come from, you and bots out — once each, newest
  first, in a row between the cards and the list's own row. A click narrows the list, its counts and its timeline to
  the chats whose PRs have that person, rings the face and dims the rest; the same face again lets go, and so does
  the person leaving the view (another project, a chip turned off). It is a pref, like the project. Not on the rail.
* **Verified**: `npm test` (47), and all thirty-nine scenarios at 09:46 — past the midnight trap, so `transcript-live`
  passes again — with `drawer-compact` and `people-row` new.

## Decisions of 2026-09-29, towards one — no VS Code opener, the card flush with the box, faces on the cards

Ricardo: "remove the 'open in VScode' option"; of a screenshot of the open card beside the splitter, "the colors don't
blend well between the card gradient and the vertical separator - make it seamless" and "the vertical [splitter]
doesn't [go] all the way to the low border of the card"; "leave 0 space for the card at the top, so it matches the
project box on the chat"; "can we get avatar of GH users in cards, that interacted with PRs associated with a chat?".

* **No *open in VS Code***: the header menu's row, its handler and the server's `/api/sessions/:id/focus` route (which
  ran `code <cwd>` and then the extension's undocumented `open?session=` URI) are gone. VS Code Web stays.
* **The open card meets the splitter seamlessly**: its flat 65 % tint stood against the bar's full colour, a hard
  step down the card's right side. The card's fill now rises to the full colour over its last 44 px, so it arrives at
  the bar in the bar's colour; the text keeps the tint under it everywhere but the padding and the chips.
* **The bar reaches the card's bottom edge**: it ended at the card's rounded `offsetTop + offsetHeight`, and the open
  card's outline stands a pixel outside that — a notch at the corner. `splitEnd` reads the card's rect and adds the
  outline's pixel.
* **The first card is flush with the top**, as the project box atop the chat is: the list's top padding went (8 px),
  and at the notch it pads by the strip alone. Card, splitter and box now share one top edge, so the open chat's
  light runs round a shape without a step in it.
* **Faces on the cards**: the PR call already walked the author, the reviews, the comments and the pushes to say whose
  move it is; each of those people now comes with `avatarUrl` (a scalar — the query costs the same), and the server
  keeps who had a hand in each PR (`prPeople`: each person once, what they did, when last; you and bots out). The card
  shows three faces before its PR chips, merged across the chat's PRs, newest first, and `+n`; hovering one says who
  and what, PR by PR. The page loads the images from GitHub's avatar host directly — no proxy, as the PR links do.

## Decisions of 2026-09-29, small hours — the clauding light on the border, and on past the open card

Ricardo: "the clauding ring glow that goes around should 1) be on the border and not inside the border and 2) should
now travel across the vertical separator, go around the project box at the top of the chat and got back again".

* **The ring runs on the border.** The card's `overflow: hidden` clips at its padding box, so the turning square showed
  only inside the 2 px border, in a 3 px band — the light ran just inside the coloured edge. A card with a ring now has
  no border (its padding takes the 2 px, so nothing inside moves) and the cover stands 2 px in: the band is the edge
  itself, and where the light is not, it shows the border's own colour (`--track`: the clauding card's 85 % mix;
  nothing on a card that is only watching). The open card's outline moves outside the band rather than over it.
* **The open chat's light runs on past its card.** The open card bleeds into the splitter, the splitter is its colour
  down to it, and the header's project box is the same colour: one shape. While the chat clauds, the light runs round
  that shape's edge, clockwise as the ring turns — up the splitter, round the box, down again and round the card. An
  overlay (`#trail`) clipped to a 2 px band along the shape's outline carries a comet of round blobs, each moved by a
  transform animation, so it is the compositor's motion like the ring (an SVG stroke with a moving dash would have
  repainted every frame). The light is the ink that reads on the colour — white on a dark one — since the shape is
  the colour itself and a light in the same colour vanished on it (tried first); a faint track of it outlines the
  shape. Pace and number of lights are the card's ring's. Scrolled out of sight, the card leaves the shape and the
  light runs round the box alone; the rail has no splitter and keeps the card's own ring.

## Decisions of 2026-09-28, near midnight — a cleared chat on top, fewer switches, the splitter to the open card, a setup worth looking at

Ricardo, six at once: "new chats seems to start all the way in the bottom, instead of at the top"; "remove all vscode
icons from cards"; "the vertical separator from cards and chat is still full color top to bottom, instead of top until
the height the card it's select"; "fold code should be always on, remove that option"; "remove option to customize
dates"; "make the 'setup' inside settings pretty - seems pretty barebones".

* **A cleared chat's card is first, not last.** The chats he starts are mostly `/clear` in a drawer, and Claude Code
  writes the new transcript at once with the command's own lines (a caveat, `/clear`, its empty output) — none of them
  a word, so no `lastActivity`. The server gave a start only to a chat with *no file*, so a cleared one had neither:
  `wordAt` was empty, the card sorted under every ready chat, with no age, no ✓ (`statusOf` said `unknown` for the same
  reason) and titled *(untitled)*. The three rules now ask for no word instead of no file. The fake claude wrote a
  cleared transcript only on the next turn, so `drawer-clear.mjs` never saw it; it writes the lines now, before the
  registry names the id — the order that fails without the fix (run before the server's fix: the card not first, and *(untitled)*). The
  scenario's age check read `.top .time`, which moved beside the title on 2026-09-28; it reads `.trow .time`.
* **No VS Code logo on the cards.** A third of the list is VS Code's chats, and the blue mark on each said nothing
  the card needs; the chat header's ··· keeps its *VS Code's chat* row, and *VS Code too* (a rival process on a chat
  run elsewhere) stays a word on the card, since that one is news.
* **The splitter's colour ends at the open chat's card**, not the last card: with a long list the last card is out of
  sight, so the rule of the morning left the bar coloured top to bottom. `drawSplit` measures the `.active` card now —
  in sight, the colour stops at its bottom; below the window, it runs to the list's foot; above it, or not in the list
  (another project in view, a filter), the bar is black.
* **Long code is always folded.** A block over six lines is a `details` with its language and length as the summary,
  in every chat; the settings' *fold code* switch and the `{ }` row under ··· (a chat's own word over it, since
  2026-09-20) are gone, and their prefs (`foldCode`, `foldBy`) are deleted on load. A fold still opens with a click.
* **A date is DD-MM-YYYY again**, the day lines', the transcript's and the timeline's (without the year there): the
  settings' *dates* (year or month first, added that morning with the setup) is gone and `prefs.dates` deleted on load.
* **The Setup pane is dressed.** It was three bare groups of bordered boxes under one-line captions. Now each part is
  a section — *Repositories*, *Quick chat*, *Projects* — with a title, a line of what it is for, and an inset list of
  rows in the way of the system's own settings: a folder icon and the path as text until touched, the org as a
  `github.com/…` pill, ⌥⌘O as a key cap beside a picker that wears the crystal ball, and for each project the square
  the rail will draw — its short name on its colour (Peacock's when there is one, said under the name) — followed live
  as the short name is typed and the colour picked, with a round swatch and a × that comes with the pointer. A line
  at the foot says the setup is the server's. The class names the scenario reaches the rows by are unchanged.
* **Verified**: `npm test`; the scenarios for each change (`drawer-clear` failing before the server's fix and passing
  after it, `new-chat-card`, `list-ends`, `code-blocks`, `head-menu`, `hotkeys`, `cog-setup`, `day-separator`), then all
  thirty-six. Run at 00:05 local, `card-signals` and `transcript-live` failed on day lines between fixtures that fell
  either side of midnight — `transcript-live` the same on the commit before this work, `card-signals` passing again at
  00:30; the README's shots, redrawn then, carried a stray day line and were left as they were. The trap is in
  CLAUDE.md's *Verifying changes*.

## Decisions of 2026-09-29, later — keyboard first: no ＋, settings under ···, the row at the bottom, the budget in words, the splitter's black

Ricardo, six more: "the '+' can be removed, let's be more keyboard centric"; "the settings can be moved to inside the
'...' on the right and it should open a nice and pretty settings popup"; "give the same padding on the left of the
card, that we have on the right, so it's symmetrical"; "move the top app icon etc. from the top to the bottom"; "the
token budget should be more '5H x% 1W y% F z%' with stylized fonts for the 5H/1W/F"; "the vertical splitter of cards
and chat, that is the same color of the project, should be black from the lower card down — if I scroll, that should
also move".

* **No ＋**: ⌥⌘N opens with the project in view selected, so ⌥⌘N ⏎ ⏎ is what the button did on a one-folder project
  (and on a named one, its folder step). On ALL the project step starts at the top as before.
* **The settings are a modal dialog**, centred: ⌘, (the app menu's *Settings…* in the app), the last row of the chat
  header's ···, and the empty header's ··· when no chat is open. A head with the name and the counts and a round ×, a
  segmented control over three panes — Board (the switches, the cards' size, the dates, what is hidden), Setup (the
  server's), Keys — one size for all three so switching does not jump. The cog and its cell at the list's foot went.
  Being modal, it takes the keys while it is up, as every dialog here does; the scenarios that set something and then
  press ⌥⌘N or ⌘B close it first.
* **The list's row went to its foot**: the cards run from the column's top, the fish, the magnifier, the state chips
  and the usage under them — the grid's rows swapped, nothing moved in the markup. On the rail the rings sit over the
  fish, which keeps the bottom corner. Filled at the notch with the list under the housing, the cards start under the
  strip instead of the head padding down.
* **The budget is words**: `5H 42%  1W 75%  F 95%` — each limit's tag in the rounded face, heavy, on a wash of its
  colour (orange, red from 90 %), the percent in the ink. A credit grant (Claude Code & Cowork's) has no reset, so it
  stays out of the row and in the rows over it; four in the row ran the chips under the words at 380 px. The row clips
  rather than overlaps at the list's narrowest.
* **The splitter wears the open chat's colour only down to the last card**, black under it: `--split` is where the
  last card ends, measured with the list's ends once a frame (scroll, render, resize), so it moves as the list
  scrolls; with the last card out of sight the colour runs to the list's foot, and hovering or dragging the splitter
  lights the whole of it as before.
* **The cards are 8 px from the list's edge on both sides again** — flush on the left for a day, to use the room the
  timeline's column had held; symmetric reads better than 8 px more.

## Decisions of 2026-09-29, small hours — no edge at rest, the marks beside the title, the header black from the name, one row atop the list, no grey borders

Ricardo, six at once: "when a card is not select, it has this gray border — make it the same color as the background,
so it's invisible"; "maybe put fable icon and time on the 2nd row, next to the summary, since it has more room and the
text wraps anyway"; "top chat, the summary should have the black background, only the project should have the solid
project color"; "when working with a notch, use the left for the card summary if it has space, otherwise use the right
of the notch"; "I want to combine the header with app icon with the footer with cog and credits into a single line —
come up with ideas to compact it (remove compact button, since the hotkey is enough; make the search small and only
expand when selected; compact view of credits, etc.)"; "in general, there seems to be these gray borders around
buttons and such — remove them and prefer solid background".

* **A card at rest has no edge**: transparent, with the wash drawn from the border box so nothing shows where the
  edge was; the hover, the open card, the clauding ring and the question's blink bring their colour in as before.
* **The age and the F moved beside the title** (the "summary" of the ask): title · chips · time · F · unread count,
  on the title's first line. The top row keeps the project, the ✓ and the PR chips.
* **In the chat header only the project's name keeps the project's colour**; from the separator on it is black, the
  title in the dark theme's ink.
* **At the notch the title goes where it fits**: left of the housing when its whole text fits there (measured with a
  `Range`: an element's `scrollWidth` is never under its own box, which the first try took for the text), else right
  of the housing, its margin jumping it, the project alone on the left. The chips and ··· stay at the far right.
* **The list's head and foot are one row**: the fish, the project's name, a small magnifier, the state chips, ＋, then
  the plan usage as four bare rings and the cog. The foot keeps its markup and moves by the grid alone — a column of
  its own in the head's row while the list is open, its old row on the rail, where it is still the foot. Of the ideas
  in the ask: « went (⌘B folds and unfolds, and » on the rail went with it); the magnifier is an icon again, and open,
  its box takes the row's spare room and the rings' (hidden while searching); the usage is rings without words, the
  rows a panel under the row on hover (a quarter of a second late, so a pointer on its way to the cog does not open
  it) or pinned by a click — the fold it had went. The cog's popover opens under the cog.
* **Controls wear a fill, not a grey edge**: buttons, the magnifier, the state chips, the small chips, the tabs, the PR
  chips GitHub has not answered for, the list's end pills, the tool-call folds, the timeline's labels. The edge stays
  as a transparent pixel so nothing shifts; the fill is the ink at 7 % (13 % under the pointer), and what was a
  coloured edge — the chip that is on, the tab in front, a VS Code or agents chip — is a tint of its colour. Text
  boxes, dialogs and popovers keep their frames, and a meaningful edge — a failure's red, the accent round the open
  search — stays.

## Decisions of 2026-09-28, towards midnight — the card's line back, solid chips, the header in black, a hidden timeline

Ricardo, five at once: "the 'your move' with the message below on the card was cool, put it back and move the PR's to
the same place as fable icon"; "why do some PR icon full background green and some aren't? I kinda like the solid
background on all"; "the top chat [header] when there's a [notch], the right part '...' + PRs [are] not pushed to the
right — make it"; "on top chat header, make whatever is right of the title black background (we don't need the
separator visual anymore)"; "the timeline on the left should disappear and just appear when the mouse [is] all the way
to the [edge] and stays there for a couple of seconds (like the dock or the menu bar) — given this, the cards should
be pushed all the way to the left, to use all real-estate".

* **The card's line is back** (`moveHtml`: the tag, `#n · why`, `+n PRs`), and **the PR chips moved up**: last in the
  top row, after the ✓ and the F (`cardPrs`, `.tprs`) — three, every one at your move among them, and a dashed `+n`
  whose tooltip names the rest. A chip past the row's room wraps onto a hidden line, whole, rather than being clipped
  in half: measuring every card's row would be a layout per render for the rare card with a long project name and
  three PRs. The body lost its chips' row, so every card with a PR is a line shorter.
* **Every chip GitHub has answered for is solid**, in its state's colour with the page's ground as ink — the fill had
  meant "your move", and with it on all, which PR is at your move is said by name (the card's line, the header), not
  by the chip. One whose state is not known yet stays an outline.
* **At the notch, what follows the title stands at the far right**: the h2 has a set width there, so it no longer grew
  to push the chips and ··· over; the first thing after it takes the free room as a margin.
* **Right of the title the header is black** — the housing's colour, so filled at the notch the housing is part of the
  header rather than a hole in its tint. A paint under the row from the title's right edge (`paintHeadSplit`, read
  after the notch and the chips' fold), the first row only, what stands on it in the dark theme's inks. **"The
  separator" read as the bar between the project and the title**, the header's one separator: gone, its 2 px span
  kept as the colour square's place. If the words meant something else, the bar is one CSS line to put back.
* **The timeline is out of sight until called**: the pointer held on the list's coloured edge — the window's own edge
  when filled — for a second (the fill's menu bar's time; the Dock is on the right on this Mac, so the left edge is
  free) brings it out over the cards, swollen round the pointer; half a second after the pointer leaves it, it goes.
  "All the way to the right" in the ask read as the left: the timeline is on the left, the Dock takes the right. The
  rail no longer has a column: the cards run from the coloured edge, 20 px wider. **The scroll bubble went** — the day
  beside the thumb while the list scrolled under a hand elsewhere — since a rail shown only under the hand never saw
  that scroll.

## Decisions of 2026-09-28, late night, later still — the tag where the F is, the reason in the header, your word answers

Ricardo, on the card's line: "'your move' should be where fable is (when fable is there, put fable left)"; "'your
move' seems stable? just replied to a chat, left a comment and still says 'your move' (it's the latest
notifier chat)"; "'your move' reason/text should live up on the chat header (to the right)".

* **The card wears a tag, not a line**: `.ymove`, last in the top row — after the ✓ and the F — at every size, its
  tooltip the reasons. **The reason moved to the chat header** (`headMove`): the tag, the newest move's `repo#n` and why,
  `+n` for the others, right of the title and just before the PR chips; the tag in `--rink` on a tinted header, where
  the accent could be the header's own colour.
* **Why it stayed "your move"**: `notifier#137` was *pushed since your review · your review asked for
  again*; Ricardo's comment at 21:07 was a conversation comment, not a review, so the review's commit was still behind
  the head and he was still in `reviewRequests` — both reasons stood. Worse, the comment emptied the "newest word of
  theirs" part of the move's key, and a changed key counted as a new move: the chat was stamped as moved *by his own
  reply* and jumped to the top.
* **Now any word of yours answers every reason before it**: a push counts only if its commit is newer than your last
  word since the review (a comment made while an older commit sat unpushed still misses it — the commit's date is all
  GitHub keeps), a re-request only if it came after your last word (the timeline's last 10 requests now, not 5). **And
  only news is a move** (`newsIn`): a new head, a newer word of theirs, a new request; a reason answered keeps the
  move's time. On the real board, the fixed rule puts `#137` at *1 comment from ana* — a reply at 21:13, after
  Ricardo's — which is right.
  → `test/pr-turn.test.mjs`, `scripts/scenarios/pr-turn.mjs` (a comment of yours hands the PR back, no alert, the chat
  falls back to its place).

## Decisions of 2026-09-28, late night, later — a PR come round to you, on the card itself

Ricardo, on the first cut: "what is exactly the visual cue for chats/PRs that need my attention?" — the answer was the
filled chip, a ✓ taken off, an unread count that goes when the chat is opened, and a notification: nothing on the card
once seen, and the chat stayed where its last word put it, days down the list. Then: "do it" to both fixes.

* **A line on the card** (`moveHtml`), the question line's twin, at every card size, after it: a tag filled in the
  accent — the PR glyph (Primer's octicon) and *your move* — then the newest move's `#n` and its reason in the card's
  ink, `+n PRs` for the others; the tooltip lists them all. **The tag is filled, not the text coloured**: the accent as
  text read poorly on an orange project's wash (the first screenshot), a filled tag reads on any tint, as the chip does.
  Not on a ticked card — a tick after the move is "seen"; the chip stays filled there.
* **The move is a word** (`wordAt`, both copies): the newest `turn.movedAt` of the chat's PRs at your move, if newer
  than its last word. The chat rises to the top of its group, under today's line, and the list slides it there; when
  the PR goes back to them it falls back to where its own words put it. The age's tooltip names the move.
* **Still not on the rail**: the squares carry the ring and the question's blink only.
  → `scripts/scenarios/pr-turn.mjs` (the line, at compact size too, gone once ticked; the rank above a newer chat).

## Decisions of 2026-09-28, late night — a PR come round to you

Ricardo: "one workflow that is still lacking is me knowing that a chat with PR or PRs where I asked for review or left a
review was already addressed (by pushed to the branch, or replies on the PR). I don't have that visibility which makes
me have to check slack, github app messages on slack, or just re-check manually from time to time" — then, on the
proposal (the rule, a filled chip, the tick undone, an alert, a watch of its own): "do it".

* **The rule is GitHub's own record, asked in the call the board already makes** (`PR_FIELDS`, `viewer`; `prTurn`,
  pure). Someone else's PR you reviewed is **your move** when its head is no longer the commit your latest review was on
  — a push or a force-push, by anyone but you, and not after you approved (unless GitHub dismissed the approval) —,
  when someone else wrote after your last word (a comment, a review; every reply in a thread is a review), or when your
  review is asked for again (you are back in `reviewRequests`). Your own PR is your move when someone else reviewed,
  commented or pushed after your last word — your reviews, comments and pushes. Bots are nobody (`__typename: Bot`, a
  `[bot]` login). A PR you neither wrote nor reviewed nor commented on has no turn, and neither does a merged or closed
  one. Comparing the reviewed commit with the head rather than times is what makes a push exact: a commit's date is
  when it was committed, not pushed, and GitHub's push date is gone from the API.
* **Measured on this board** before writing it: 40 open PRs with every field cost 2 points of the 5000 an hour.
  Of them, 7 were at Ricardo's move — `backend#812` pushed, twice replied to and re-requested since 25-09, in a chat
  past the three days `PR_POLL` still asks about, so the board could never have shown it.
* **What it does**: the chip fills with its state's colour (card, header — and `+n` when it folds one —, and the row
  under the header says why); **every chat that mentions the PR is un-ticked** (`isDone` weighs the tick against the
  move's time as well as the chat's last activity: a tick after a review is "waiting on them"); **one alert**,
  `kind: 'pr'`, on the chat touched last, heading `Your move · repo#n`, the reasons as its text — sent as the ball
  comes back from them, or when a chat you had ticked comes back with it, not for every further comment while it is
  already yours. The app, the page and the server's osascript read `heading` before the kind's words.
* **When a move became news is the board's, kept in the state file** (`prTurns`: url → `{ key, at }`, `moveTurn`).
  The first look at a PR takes GitHub's time for the move (so the first run un-ticks what moved after its tick); every
  change after takes the board's clock — a push committed at 9 and pushed after a 13:30 tick is news, and so is one
  the board learnt of after the tick. Kept across restarts, or a restart would hand every move back to GitHub's times.
  The `key` is what came round (the head, the newest foreign word, the re-request): a new one is a new move.
* **Watched by its own clock** (`PR_WATCH`): a chat goes quiet exactly while you wait on someone, so a PR with a turn
  is asked every 2 min while its newest event is within two days and every 10 within two weeks, whatever its chat's
  age. With ~60 such PRs that is a call or two every two minutes.
* **Not done**: GitHub's notifications API as a faster trigger (a free 304 when nothing changed) — it does not cover
  pushes, and its read state is the GitHub inbox's; a first review request (never reviewed) as your move — the chats
  here are ones you already worked in; only the chat that holds the PR's review coming back — 97 of the 103 open PRs
  on the board sit in one chat, 6 in two, so every chat it is.
* Checked: `test/pr-turn.test.mjs` (the rules, the tick against the move, a first look, a PR out of sight),
  `test/pr-poll.test.mjs` (the watch); `scripts/scenarios/pr-turn.mjs` on the fake gh (`FAKEGH_VIEWER`; an entry is
  handed back whole): waiting, ticked, the push un-ticking it by the watch alone, the filled chips, one alert and its
  banner, a second tick holding through a restart, the next review handing it back. `npm test`'s idle-drawer test
  timed out waiting for its fakes to register — at HEAD too, in a scratch worktree, with the load average at 97.

## Decisions of 2026-09-28, night — ✓ in the chats step

Ricardo: "when using hotkey N and then inside a project, I see the current chats there - I want to have the "done" icon
there to clean the house"

* **The card's ✓ on the row**: `button.pkdone`, last on each chat's row of the `chats` step (⌥⌘N and ⌥⌘O alike), the
  card's route (`POST /api/sessions/:id/done`) and the card's rule — `canTick(s)`, now one function for both: an idle
  claude or none, on a chat with a time. Ticking one that runs would end it mid-turn, so a clauding or asking row has an
  empty cell instead. Every row keeps the 22 px column, so the ages line up. Inked only on the row under the pointer or
  the selection, as the card's is since 2026-09-26.
* **The picker stays up, and follows its chats**: the row leaves on the server's `session` event — the `chats` step now
  redraws on one about a chat it lists or would list, with `pickRender(true)` keeping the selection on the chat it was
  on (a ticked selected chat gives its place to the one that slid up). A click puts the keys back in the box. Only a
  single click ticks: a double click's second press would land on the next row, slid up under the pointer.
* **`note()` goes into an open dialog** when its anchor is in one — under the backdrop a failed tick said nothing.
* **No key for it**: the box is for typing; a chord to tick the selected row is an easy addition if wanted.
  → `scripts/scenarios/new-chat-flow.mjs`, its last section.

## Decisions of 2026-09-28, evening — the board for colleagues: the setup in the cog, a README that fits a screen

Ricardo: "I'm going to invite some colleagues to use this app. what decisions were made (like the default ~/acme,
etc.) that could be made configurable for other people? also, the readme has too much text" — then, on the list:
"the config looks good, maybe we could integrate it into the cog setting?"

* **What was one Mac's, written into the code**: ⌥⌘O bound to `oracle` (`ORACLE`, and its crystal ball in
  `PROJECT_ICONS`); `acme` painted black (`PROJECT_COLORS`); `BE` and `WAPI` on the rail (`PROJECT_ABBR`); the repos
  under `~/acme` from the `acme` org (`ORG_DIR` / `ORG`, env only — and the login agent's plist carries only `PORT`
  and `NOTIFY`, so an agent could not be told otherwise); `/bin/zsh` for every drawer and ⌥⌘T; ⌥ always Meta in the
  terminal (a German layout's ⌥L is @); dates only `DD-MM-YYYY`; the cog's key list naming `~/acme` and oracle.
* **Now the setup is the server's, set in the cog** (`config` in the state file, `GET/PUT /api/config`, a `config`
  event): `roots` — any number of folders of repos, each with the GitHub org ＋ clone asks for, or none (then it only
  lists) —, `quick` (⌥⌘O's project, which wears the crystal ball) and `projects` (a short name and a colour per project,
  by shown name; the colour only where Peacock gives none, `#000000` being the board's black). A key never set is the
  default, worked out when asked: the roots from `ORG_DIR` / `ORG` when either is in the environment (the tests' — so
  every test server still has its own empty root), else none; no ⌥⌘O project; no names or colours. **Ricardo's own
  values went into his state file through the API**, not into the code.
* **The cog's other three are this browser's** (`prefs`): *fold code* (back — it went on 2026-09-21 when the ··· { }
  took over per chat; that stays, this is the default under it), *⌥ is Meta* (on, as it always was), *dates* (day,
  year or month first — the day lines, the transcript's and the timeline's labels, `fmtDate`).
* **The shell is the login shell** (`LOGIN_SHELL` for ⌥⌘T, whatever it is; `RUN_SHELL` for claude, when it is zsh or
  bash — `-l -i -c 'exec "$0" "$@"'` reads the same in both — else `/bin/zsh`, as before). The tab wears its name. No
  switch: nobody wants a shell other than their own.
* **The popover grew a second column**: the switches and the setup on the left, the keys on the right, 860 px; one
  column (`.one`) where the window has not the room, scrolled past its height. It reaches well into the chat column, so
  **the pane goes down while it is up**, as it does under a dialog; a box that takes the keyboard pins it, so the
  pointer wandering off while typing does not close it.
* **Deliberately not in the cog**: the port (the server's own address; the app reads `PEIXAIRADA_PORT`, the agent
  `PORT` — still two names, and a Finder-launched app has neither), the ⌥⌘ keys themselves (fixed, and repeated in
  main.swift), the idle drawers' 24 h (`DRAWER_IDLE_MS`), the notification's sound.
* **The README went from 563 lines to 115** (Ricardo, after a first cut of 150: "make sure readme is reduced,
  simplified and beautified"): a line of what it is, eight one-line features, install in four commands, the cog's
  setup (the environment folded away), the everyday keys, three caveats, hacking in a line — and its facts checked
  (the badges said Node ≥ 20, two npm dependencies and a 1.4 MB app). **Its screenshots are of a made-up board**
  (`scripts/readme-shots.mjs`: projects under an `acme` org with Peacock colours, chats in every state, PR states from
  `scripts/fakegh.mjs`, a plan-usage answer of the page's own) — never of this Mac's, whose chats are work. `npm run scenario -- scripts/readme-shots.mjs` redraws them into
  `docs/shots/`, in both themes for the hero.

## Decisions of 2026-09-28, afternoon — a PR is polled by how recently its chat was touched

Ricardo: "what's the logic behind updating the PR status? seems like it takes a while — we should improve the algorithm
to poll more for recent ones, and not poll after 3 days — unless we open the chat for example".

* **What it was**: nothing polled. Boot asked GitHub about every PR once (for the cards' titles), in the sessions'
  readdir order; after that a PR was asked about only when its chat was opened or the PR was said again live, and even
  then not within 10 min (`PR_TTL_MS`). A PR merged on GitHub stayed open on its card until one of those happened —
  or forever, for a chat nobody reopened.
* **Now** (`duePrs`, from `sweepPrs` on the registry poll): a PR never asked about is due whatever its age — boot is
  that, now in recency order, the chats in play first; otherwise the most recently touched chat mentioning it sets the
  pace (`PR_POLL`): every minute within the hour, 5 min within the day, 30 within three days, never after. **Touched**
  is the chat's `lastActivity` or `openedAt` — a page fetching its messages — so opening an old chat asks at once and
  keeps it polled for as long as it counts as recent. A PR said live, or on the chat being opened, is asked unless it
  was within `PR_TTL_MS`, now 30 s. Merged and closed are still terminal; a PR GitHub will not show us still backs off
  an hour.
* **A failed call no longer wipes anything**: `gh` failing as a whole (no `data` — offline, a timeout, rate-limited)
  used to set every PR of the batch to `state: null, title: null` for an hour, which the cards showed as colourless
  chips and the transcript's title instead of the PR's. With a poll every minute that would have been every blip; now
  the entries stand, the queue is dropped, and the polls pause 1 min, doubling to 30. A PR GitHub cannot resolve still
  fails its own alias only (checked: `data.p1: null` beside `data.p0`, exit 1).
* **The numbers, the board as it stood**: 336 chats, 238 PRs — 8 in chats touched within the hour, 22 within the day,
  16 within three days, 192 older; 138 merged and 8 closed are never asked again. Boot is 6–7 calls of 40 at ≈ 1.5 s
  each; after that about one call a minute. The rate limit (5000 points an hour) is nowhere near.
* **A PR being asked about is not queued again** (`prAsking`): the first live run asked the same 6 PRs twice, a second
  apart. A sweep that lands while a batch is in flight finds its PRs unanswered and queues them again, to be asked the
  moment the first answer comes; a run with logging caught one 10 s after boot, 20 PRs in flight.
* Checked: `test/pr-poll.test.mjs` (the tiers, the opening, a PR in two chats, terminal and unseen states); a throwaway
  server on the real `~/.claude` (port 7399, its own state file, a `gh` that logs each call): boot asked 220 PRs in
  six calls, answered in 10 s, the newest chat's PR first; a chat 4.9 days old, once opened, led every sweep after
  (its 4 drafts and the 2 open PRs of the last hour, every 60–70 s — the sweep rides the 10 s registry poll); three
  PRs another session wrote live were asked within 250 ms, then joined the minute's sweep; no PR asked twice.

## Decisions of 2026-09-28, later — without a notch, the fill hides the menu bar outright

Ricardo, on the DELL with the MacBook mirroring it: "I'm on a external monitor and thus I don't have a notch. the menu
bar is showing and overlapping the app" — and, to the first fix: "on the external monitor: I want the full app
experience, to maximize vertical space. on my macbook, I want that the notch to be there, but also maximize vertical
space - how can we have both? … maybe depending on the resolution of the screen you detect if the main display is
external or not?"

* **What happened**: the fill set the frame to the whole screen and the menu bar to auto-hide on every screen. Beside a
  camera housing that is the point — the strip either side of it is dead space the menu bar and the board share. On a
  screen without one the board's top row *is* the menu bar's strip, and the auto-hidden menu bar slid over the search
  box, the chips and the chat's title at every reach for the top edge.
* **The screen says which it is, exactly**: a housing is a top safe-area inset (`safeAreaInsets.top > 0`), which is
  what the page's notch layout already went by — no guess from the resolution, and it follows the lid, a display
  plugged in and mirroring (mirrored, the one `NSScreen` is the master's: the DELL, no housing). `placeFill(on:)`
  decides per screen, on the fill and on every change of screen: **beside a housing, as before** — the whole screen,
  the menu bar auto-hidden into the strip; **without one, the whole screen and `hideMenuBar`** — no menu bar while the
  board is in front, not even at the top edge. Both hide the Dock; let out by a hold at its edge (`dockTick`), the
  options are `autoHideMenuBar` + `autoHideDock` on both, since AppKit throws on `hideMenuBar` without `hideDock`.
* **…and let out by a hold at the top edge** (Ricardo: "can the menubar still show if I go to the top edge and stay
  for a sec? like the dock"): the Dock's own mechanism in `dockTick` — a pointer held at the top edge for `menuHold`
  (1 s, longer than the Dock's 0.7: the search box is up there, and a pointer rests on the edge while typing) turns the
  menu bar to auto-hidden with the pointer already there. It goes back to hidden outright only once the pointer is
  100 pt below the top **and** `NSMenu.menuBarVisible()` says the system has hidden it — the Dock's "100 px off" alone
  would pull the bar from under an open menu, ours or a status item's. `fillOptions()` spells the options in one
  place: the menu bar auto-hidden beside a housing, while let out, or while the Dock is out (AppKit throws on
  `hideMenuBar` without `hideDock`), hidden otherwise. The holds reset when the app goes to the back.
  **Not seen yet**: the reveal itself needs a hand on the pointer; the app log says `menu bar: out` / `menu bar: back`.
* **Tried first, same day**: without a housing the menu bar stayed and the frame started under it — nothing
  overlapped, but 30 pt went to the menu bar; Ricardo wanted them. Also considered: the system full screen's trick of
  sliding the top row down with the menu bar — a resize of every terminal at each reach for the top edge.
* Checked on the DELL: the window 2560 × 1440 at 0, 0, options 10 (`hideMenuBar` + `hideDock`), in the app log and the
  window server's list. The notch side is the code that was there, unchanged.

## Decisions of 2026-09-28 — a half with one tab has no strip; ⌥⌘W closes a tab

Ricardo: "the a pane only has one thing active (e.g. claude, terminal) we don nee the tab up top, takes unnnecessary
screen. the exception may be the web, because we maybe want to copy the url. any suggestions for forcing the terminal
or vscode to close if we want?"

* **A lone tab's strip is a 2 px rule** (`.ptabs.lone`): split, a half whose one tab is claude, the zsh or VS Code Web
  shows no tabs, no ⊟ and no ⨯. The rule is what said which half has the keys (the accent under the strip), so it
  stays, and at the same height lit or not — a strip that came and went with the keys would resize both terminals on
  every ⌘1 / ⌘2. **A web page alone keeps its strip**, as Ricardo asked: the address to copy and ‹ › ↻ ↗ live there.
  VS Code Web counts as the terminal does — its address is a local port, and it has its own chrome. **An empty half
  keeps its strip**: it is where a tab is dropped and the one visible way to close that half. Unsplit is unchanged:
  the one strip shows from two tabs up.
* **What is lost with it, on purpose**: a lone tab cannot be dragged to the other half (⌘W / ⌘0 fold it into the other
  strip instead), and ⊟ / ⨯ are the keys' only (⌥⌘1 / ⌥⌘2 against ⌘1 / ⌘2, ⌘W, ⌘0). Considered and dropped: a strip
  that slides down over the top of the half on hover — it would cover the terminal's first rows, and over VS Code
  Web, a native view above the page, the page never sees the pointer.
* **Closing without the ×**: **⌥⌘W closes the tab the keys are in** (`hotCloseTab()` → `dropTab()`): the zsh ends
  through the server as its × did, a page or the editor is let go; the split the board made for the tab folds, one
  asked for by hand keeps its empty half. When the half empties the keys go back to the chat, not into an empty half
  or a zsh on its way out. On the chat's own tab it is a note (nothing to close; ⌘W closes a half, ✓ ends the chat).
  ⌥⌘ is "this chat's thing"; plain ⌘W stays the half's. VS Code Web's own ⌥⌘W (whole word in its find box) is given
  up for it in the app's forwarder. **The header's ··· menu has the mouse's way**: *end the zsh* while one runs and
  *close VS Code Web* while the editor has a tab; the menu is redrawn when it opens, since the editor's tab is page
  state no SSE update redraws. `exit` in the zsh still ends it too.
* **The app reports a click on a page** (`installPaneClickMonitor`, `peixPaneFocus(key)`): a page is a native view
  over the half, so a click into VS Code Web never moved the board's idea of where the keys were — ⌘W (and now ⌥⌘W)
  acted on the half the keys had been in before. The page answers with `focusGroup`, and so the shell's own
  `paneFocus` (⌘F, ‹ › ↻ ↗) follows as well.
* **Learned by the harness**: the drag's click swallow was removed by a `setTimeout(0)`, and the harness's Chrome is a
  page out of sight, whose timers run up to a second apart — so a click right after a drag (the rewritten
  `pane-tabs.mjs`) was eaten, onclick and all. The swallow is `{ once: true }` now; the timeout stays for a release
  that makes no click. → `split-halves.mjs` (lone rules, sizes kept across ⌘1, ⌥⌘W on the chat and on the zsh, the
  empty half's strip back), `split-stacked.mjs` (⊟ on the empty half, ··· ends the zsh), `pane-tabs.mjs` (a page alone
  keeps its strip, the editor's page under its rule, `peixPaneFocus`, the drags moved here, ⌥⌘W on a page, ··· closes
  the editor), `hotkeys.mjs` (⌥⌘W ends the zsh and folds the board's split).

## Decisions of 2026-09-27, late night — the last 1 %: the board moves, and the small things a craftsman looks at

Ricardo: "what are the nice animations, nice touches, the things that only craftsman look at, the last 1% of dev that
we can do on this project, from a visual/UX PoV?" — a list of nineteen, then "do everything". One commit each, each
verified in headless Chrome (a scenario where there is state to drive, `npm run verify` where a look is enough), the
app type-checked and rebuilt for the shell's. The rule under all of it: an enter is fast (80–150 ms) and an exit slower
(200–250 ms), a keyboard move is instant, nothing runs past 300 ms but a one-shot mark, and everything runs on
transform and opacity where it can — the compositor's kind of motion, as the ring taught.

* **The list moves rather than jumps** (`drawCards`): a card that changes rank slides to its place — FLIP, its
  rectangle read before the reconcile and after, the difference played back as a `translateY` by the Web Animations
  API, 220 ms; a card that arrives fades in from 6 px up (180 ms); a card that leaves — ticked done with done filtered
  out, a chip switched off — folds shut where it stood (200 ms: height, padding, border and the list's 7 px gap to
  nothing) and goes on finish. Only what lies within a screen of the list's window moves; the first draw and reduced
  motion put everything in place. A folding card is `.leaving` with no `data-id`, so the reconcile steps over it and
  `listGeom`, `markQsel` and `hotMove` leave it out; the old node of a card merely redrawn goes at once (the first cut
  folded those too, and every card below measured a card lower — a cascade of slides on every rebuild).
  `window.peix.motion()` lists the last moves by kind, so a check need not catch a 200 ms slide in the act.
  → `scripts/scenarios/list-motion.mjs`.
* **The reply landed**: the flip from clauding to ready had no visual but the ring vanishing. The `session` handler
  marks a chat that goes `working` → `idle` (`landedAt`) and `flareLanded`, from `drawCards`, gives its card the
  `landed` class: the edge at the ring's colour with its glow, easing to the plain edge over 600 ms, once — with a
  negative `animation-delay` of however long ago it landed, so a card rebuilt mid-flare carries on where it was (a
  card is rebuilt on most updates in the seconds after a reply). The unread badge the alert brings pops in
  (`onAlert`, a 260 ms scale by WAAPI on the node the render made). Both are in `motion()` as `landed` and `pop`.
  → the landing section of `list-motion.mjs`: a live chat mid tool call, its end_turn written in.
* **Hover and the open card ease in**: the card's tint is two registered percentages (`@property --tint`, `--slope`:
  37 % at the bottom right and 8 % more at the top left at rest; 65 % and 0 under the pointer, on the open card and
  on ⌥⌘F's mark; 20 % and 100 % on a black card), so the gradient *can* transition to the solid tint — a gradient
  cannot go to a flat colour, and two gradients only when nothing but their colours differ. The border, the outline
  (1 px transparent at rest, so its colour and width have something to come from) and the opacity (a card ticked done
  dims rather than snaps) transition with it, 200 ms out and 100 ms in — the destination's transition is the one that
  runs, so `.card:hover` shortens it. The `::after` cover inherits the background and follows. The two dividers light
  after a 300 ms beat, as VS Code's sash does, so a pointer crossing on its way to the chat no longer flashes them; a
  drag lights at once. Every small control — buttons, chips, tabs, menu rows — eases its ink, edge and wash in 120 ms
  under one rule. Measured: `--tint` reads 61 % a hundred milliseconds into a click on a card.
* **A switch of chat slides the colour**: the header's ground and its two veils, the transcript's wash and the
  divider are registered colours (`@property --hbg`, `--hveil`, `--hveil2` on `#chat`; `--openc`, `--openb` on
  `main`) that `tintChat` sets beside `--repo` and `--rink`, and a registered colour interpolates — 250 ms from one
  project's colour to the next. `--repo` itself cannot be registered: its fallback to `--nocolor` is what a
  colourless card relies on, and a registered property always has a value. The ink still cuts: a grey half-way
  between white and black reads on neither. Measured: `--hbg` on the way from peixairada's orange to wallet-api's
  blue read `rgb(81, 133, 174)` at 110 ms.
* **Dialogs, the popover and the note come and go**: `@starting-style` gives the open state something to transition
  from (opacity 0, 4 px down, a touch of scale), and `display` and `overlay` with `allow-discrete` hold the element —
  and a modal's place in the top layer — until the exit has run; the backdrop fades with it. In 120 ms, out 140; the
  cog's popover, which opens on hover, in 80. `note()` adds `.out` and removes the popup 140 ms later instead of at
  once. Both engines have it (probed: WKWebView on this Mac answers yes to `@starting-style`, `transition-behavior`
  and `::details-content`, no to `interpolate-size`). The `open` attribute still flips at once, which is what the Esc
  handler, `postPane` and the harness read. Measured on the board: the picker's opacity 0 at open and 1 at 220 ms,
  the backdrop from clear to its 35 %; the popover's fade-out at 0.42 forty milliseconds in, `display: none` at 120.
* **A fold's chevron turns and its body fades in**: one ▸ rotated 90° (it swapped for ▾ before, which nothing can
  ease), and `::details-content` from opacity 0 and 3 px up — both engines; Chrome also runs the height, under
  `@supports (interpolate-size: allow-keywords)`, which WebKit has not got, so there the height still jumps under the
  fade. Measured: the chevron mid-turn and the body at 0.85 with its height at 1084 of 1420 px, 120 ms after the click.
* **Reduced motion, honoured throughout**: the spinner and the timeline respected it; the ring, the blink, the pulse,
  the flare and the new moves did not. One block now, at the end of the CSS, with a line for every animation on the
  board: clauding and watching a steady edge in the light's colour (the `::before` square filled flat), a question a
  steady red border with its glow, the dots still, the spinner its full frame, no flare; dialogs, the popover and the
  note fade without moving; a fold's chevron and body switch; `drawCards` reads `REDUCED` and puts cards in place.
  Colour eases stay — a fade is not motion. → `scripts/scenarios/reduced-motion.mjs`, the media feature emulated over
  CDP (which `matchMedia` sees too), then lifted: the ring turns again.
* **Presence at the foot of the transcript**: the open chat showed nothing of its state but a dot in the ··· menu.
  `renderPresence` keeps a `.presence` line last in the log — Claude's mark (the divider's sprite, its rules now on
  `.pix` alone, phased with the rest) and *clauding…* with the sub-agents' count while the chat works; the question,
  in the card's red and the card's own markup (`askHtml`, its rules now `:is(.card, .presence)`), while it asks;
  nothing once it is ready. From `renderLog` and from the `session` event, where the state flips; it keeps the bottom
  when you are at it. → `scripts/scenarios/transcript-live.mjs`.
* **What comes while you read fades in, and a pill says so when you have scrolled up**: `renderLog` marks what it
  appends after the first fill `.in` (180 ms from 4 px down; not under a live drawer, not under reduced motion) and
  puts new nodes before the log's tail. Scrolled up when something arrives, `logNew` lights a sticky pill at the
  foot — *↓ new reply*, *↓ 3 new replies*, *↓ more below* for tool activity alone — the twin of the list's ends; a
  click scrolls to the end, and reaching it yourself (the log's scroll listener) puts it away; at the end when a
  reply comes, no pill, as before. The pill is made on first need and kept the last thing in the log; the presence
  line sits before it. `motion()` records `msg` (with the count) and `pill`. → the long chat in `transcript-live.mjs`:
  nothing fades on the first fill; a reply written in with the log at its top fades in and lights the pill, which
  stays last while the log stays put; the click; a reply at the end with no pill.
* **Times without seconds, a day line in the transcript, and ages that tick**: the who-line said "6:50:13 PM"; it
  says "6:50 PM" — or "18:50", the locale's — in tabular figures. Where the transcript crosses a day it gets the
  list's day line (`dayOf`, shared with `dayName`; none for today's messages at the top, a date where it goes to
  another day, *today* where it comes back). And an age is no longer written into markup: the card's, the pickers'
  rows', the menu's *for 5m* carry `data-at` and `fillAges` writes the words — and the card's tooltip, from the chat's
  own times — after every render and on the 30 s tick, touching only text that changed. Before, `rel()` in
  `cardHtml` made a card's html change every minute and its node with it (the review had noted the tick rebuilding
  the list for the ages alone); a hover-only age that read *5m* when it was *25m* was wrong information. → the last
  section of `transcript-live.mjs`.
* **Two things the motion taught**: the ··· menu is anchored to its button, so it fades in place — `#hmenu` keeps
  `transform: none` through the dialog transition; `head-menu.mjs` measures it four pixels under the button the
  moment it opens, and a menu that slides off its anchor reads as loose anyway. And `card-marks.mjs` read a card's
  rectangle while the fixture's cards were still sliding in, then put the pointer at its centre — on the card above,
  once the slide had ended. The runner has `ctx.settle()` now, which waits for every animation the page named (flip ·
  enter · leave · pop) to end; a scenario reads a rectangle after it.
* **Code blocks carry their language and a copy button**: `md()` wraps every `pre` in a `.codebox` with a bar at its
  top right — the language from the fence (or from highlight.js's guess) and *copy* — that shows under the pointer;
  the wrapper takes the pre's margins, so the bar stays put while the block scrolls sideways. A long block still folds,
  the wrapper inside the `details` and the summary naming the language, so the bar there is the button alone. The
  click writes the block's text with the async clipboard, else selects it and `execCommand`s, and the button says
  *copied* (or *failed*) for a second — the button is the whole answer, there is no toast.
  → `scripts/scenarios/code-blocks.mjs` (the clipboard granted over CDP, then read back).
* **The small print**, one CSS section: prose wraps `pretty` and a short centred text `balance`s; a card's title breaks
  at a word with hyphens instead of `anywhere` (the snippet keeps `anywhere` for its paths); every count, age, PR
  number and key sits in tabular figures; the selection is the accent's at 28 % — the default blue was the one foreign
  colour left — and the terminal's `--term-sel` matches it; one `:focus-visible` ring, 2 px of accent (the header's
  ink on a tinted header), through `:where()` so the text boxes' own `:focus` rules still win and keep their border as
  their focus; `overscroll-behavior: contain` on every scrolling list, so a fling at its end stays in it. Read back
  on the board: `pretty`/`break-word`/`auto` on a title, `balance` on the empty state, `tabular-nums` on a count, the
  selection `color(srgb … / 0.28)`, `contain` on the list and the log, and a 2 px solid accent outline on a focused
  button.
* **No flash before the page paints** (the app): a WKWebView draws white until the document's CSS lands — in dark
  mode a flash of the wrong colour at every launch and reload. The board's web view draws no ground of its own
  (`drawsBackground` off), the window's `backgroundColor` is the page's `--bg` for the appearance in force (a dynamic
  `NSColor`), and `underPageBackgroundColor` is the same for the moments WebKit paints its own ground. Type-checked
  and built; not driven — the flash is a launch, which the harness does not do. The two hex pairs are `:root`'s `--bg`
  and have to move with it.
* **The window is named after the open chat** (the app): the page posts `{type: 'chat', project, title, cwd}` whenever
  the chat header is drawn anew (`postChat`, from `renderHead` and `leaveChat`), and the shell sets the window's
  title — *wallet-api · Price quote cache*, *peixAIrada* with the column empty — so ⌘Tab, Mission Control
  and the Window menu name the chat, and its `representedURL` to the chat's folder, which puts the folder's proxy
  icon in the title bar and the path under a ⌘-click on the title. Not `subtitle`: that makes the title bar taller.
  → `scripts/scenarios/window-title.mjs`, the bridge faked as `pane-tabs` fakes it: one post per header, none for a
  render that leaves it.
* **The Dock bounces once for a question** (the app): the `state` message lists the chats waiting on you; one that was
  not on the last list, arriving while the app is in the back, is `requestUserAttention(.informationalRequest)` — a
  single bounce, the Dock's word for the one state that is stopped, beside the badge that only counts. AppKit ignores
  the request while the app is active and cancels it when the app comes to the front. Type-checked and built; the
  bounce needs a real Dock.
* **Left: the title bar as one surface with the head row.** Measured with a probe window built like the app's
  (`fullSizeContentView`, the web view pinned to the content view): WebKit insets the page by the title bar on its
  own, so in a window the bar is the system's grey strip *above* the page — a second surface — and with
  `titlebarAppearsTransparent` the page runs under it and the traffic lights and the title land on the head row's
  fish and search box. One surface means the page laying its top row out around the traffic lights (as it does around
  the camera housing when filled), the title hidden, and the folded rail — 58 px, narrower than the lights — padding
  down instead; and a transparent bar leaves no strip to drag the window by, since a WKWebView does not move its
  window. That is a design to settle in front of the app, which lives filled anyway (`fill: on` in every launch in
  the log); not done blind.
* **The suite, run whole, found three more** (31 of 34 on the first run): `chat-filter` read the first `#slist > .card`
  while a card the filter had dropped was still folding at the top — a leaving card is now wrapped in a `div.leaving`
  that does the folding, so the card is no longer a child of the list and nothing that counts `#slist > .card` sees it;
  `project-cue` measured the About box the moment it opened, mid-rise — `ctx.settle()` waits for CSS transitions too
  now (every finite animation), and the scenario calls it; `card-signals` expected a tool call to rebuild the clauding
  card — it had, because the age in the markup ticked — and then expected a second one *not* to, which held only when
  the two fell in the same second. The card's `.time` carries nothing in its markup at all now (`fillAges` sets its
  `data-at` from the chat), so a tool call keeps the node and the ring on it; the scenario writes a prompt for the
  rebuild it wants, since a new last word is a new card. The second whole run turned up two more of the first kind —
  `day-separator` reading every child of the list and `list-ends` reading the pills while the other project's cards
  were still folding out after ⌥⌘P (the pills themselves had gone stale: nothing re-read the list when a fold ended,
  so `leaveCard` calls `listChanged()` on finish now) — both settle before they read. The rule for the harness is
  in the notes: a rectangle, a count of children or a pill is read after `ctx.settle()`. The third whole run was
  34 of 34, with `hotkeys` flaky once: ⌥⌘G on the plain chat read an empty note (the note is made synchronously, and
  the scenario passed on the rerun and three times more by hand); seen once in five whole runs, not chased.

## Decisions of 2026-09-27, night — an empty chat's card can be ticked done

Ricardo: "new chats now create cards before I say anything, but those cards don't have the done check to clean them up."

* **What kept the ✓ off**: `cardHtml` offered it only to a chat with a `lastActivity` — from the board's first day,
  when a card without one did not exist. It goes by `lastActivity || startedAt` now, as the card's age does, so an empty
  chat idle in its drawer has it.
* **Ticked, an empty chat is gone, not dimmed**: Done ends its claude as it ends any, and a chat with no transcript has
  nothing to read and nothing `claude --resume` could take up, so a *done* card for it would only be clutter. `visible()`
  shows a chat with no activity only while it is alive, not done, and not VS Code's. The server needed nothing: `isDone`
  already held for a mark against an empty `lastActivity`.
* **The column leaves it too**: an open chat that a `session` event takes off the board that way is left for the page as
  a load with no chat draws it — `leaveChat()`, the markup read from the page at start (`NO_CHAT`). ＋ (`newChat`) went
  through the same few lines by hand and now calls it with its own header; it also resets `drawn`, which `newChat`'s
  hand-written header never did. → `scripts/scenarios/new-chat-card.mjs` (the ✓ on the fresh card; a second empty chat
  ticked: its card and drawer gone, the counts back, the column on *Pick a chat*, the first chat opening again).

## Decisions of 2026-09-27, evening — the review: what was measured, what changed, what is left

Ricardo: "do a thorough review of the codebase, look for performance bootlenecks and code hygine", then "do them all".
The whole tree read, three reviewers over the page, the app and the harness, and the live server, its logs, the real
`~/.claude` and `$TMPDIR` measured before anything changed. Thirty-odd commits, one per finding, each verified against
the tests and the scenarios.

* **Measured first.** 72 claude drawers alive from a week of chats, 2 of them with a page attached: 13.3 GB in the
  claudes, 2.0 GB in their holders. 236 of 309 transcripts longer than TAIL_BYTES; opening the 91 MB one cost 300 MB of
  RSS. `$TMPDIR` held 1.5 GB — 1504 Chrome profiles, 1359 fixture dirs. Two test servers from a scenario run of
  2026-09-20 (pids 86170 and 86496, ports 55162 and 55180) still watched the real `~/.claude` and asked GitHub about PRs.
  The app log had 48k `state:` lines. One `lsof` took 0.9 s of wall, and eight had timed out.
* **Confirmed bugs, fixed.** Opening any chat longer than TAIL_BYTES fired "Claude replied" for its last, old reply
  (the full re-read folded every line with the boot's `indexing` long over); `indexFile` replaced the session object
  with its timers pending and its sub-agent count dropped; an SSE reconnect left the open transcript stale; the app's
  restart adopted the server it had just told to quit, and its start truncated the server log; the holder socket decoded
  each chunk alone, so a glyph split across two came out U+FFFD; no route and not the terminal upgrade checked Origin or
  Host, so any page open in a browser on this Mac could start a claude in a known folder or type into a drawer.
* **Performance.** The transcript is appended to, not rebuilt; the cards are reconciled by id, the header diffed, the
  list's geometry read once a frame; `fitTerm` sends only a size that moved; the app's bridge and its second SSE stream
  are gone, its watchdog probes a few bytes, its Dock poll rests with the app in the back; a whole transcript is read a
  chunk at a time; one `lsof` per poll; one terminals index per snapshot; the summary no longer prunes as it reads.
* **Hygiene.** The hooks path is gone; four prefs nothing set, and `beep`; the fetch boilerplate is one `api()`; the
  picker clamps once; the page's per-chat maps are pruned on a snapshot; `paneChat` and the `pr*` names; the harness's
  leaks (the Chrome profile race, the fixture dirs, a failed setup, the holder's log); `waitFor`, `post`, `ctx.type` and
  `ctx.fill`; exact pins and Node 22; the vendored xterm compared in `npm run check`; `CLAUDE.md` pared to its
  invariants — its bullets as they stood are at the end of this file, under *Findings*.
* **Left to Ricardo at first, then done on his word.**
  * **An idle-drawer sweep** (`sweepDrawers`, on the registry poll): a drawer whose claude reports idle, with no
    sub-agent or background task at work, no page attached and no word in the chat nor the drawer's own start within
    `DRAWER_IDLE_MS` (24 h), ended as Done ends it — the chat loses nothing, the card goes stale, `>_` resumes it; a
    chat waiting on a question and every zsh left standing; 0 disables. The harness's policy had refused code that
    ends processes on its own; Ricardo's "do it" later that evening settled it. It is the whole memory story: nothing
    else ended a drawer but Done or its ×. → `test/idle-drawer.test.mjs`.
  * **The two stray test servers** (pids 86170 and 86496) were ended by hand on the same word, and their state dirs
    under `$TMPDIR` removed; so were the 1546 Chrome profiles and 1399 fixture dirs the harness had leaked before its
    fix, and the 71 holder logs left by drawers that ended before theirs.
  * The reviewers' further findings, not in the report and not done: `openChat` in the harness never fails; the
    terminals test's 2.5 s sleep for zsh's rc files; `build.sh` copying every platform's node-pty prebuilds (58 MB of
    the bundle); the pane's closed pages kept until eight are open; the `WKScriptMessageHandler` retain cycle
    (immaterial while the delegate is immortal); `wordAt` computed several times per card per render; the 30 s tick
    rebuilding the list for the ages alone.

## Decisions of 2026-09-27, afternoon, later — a new chat's card before its first word

Ricardo: "when I clear the chat or when I select new chat, I don't see the card until I press enter to send the first
message."

* **What hid it**: the page's `visible()` kept a rule from the lane board — a live chat with no activity is not shown —
  written for VS Code's restored panels, which mount a claude per tab and never get asked anything. The server had the
  session all along (`newSession(id, null)` from the registry, titled *(no messages yet)*, `idle`), and pushed it; the
  page filtered it out of every project, so ＋ and `/clear` both left the chat column on a chat the list did not have.
* **The rule now**: an empty live chat shows unless it is VS Code's. A drawer's (＋, `/clear`, which keeps the process
  and gives it a new id) and a claude in a terminal elsewhere are both yours to type into; VS Code's empty panels stay
  hidden for the reason they always were.
* **The card needs a time**, for its place (first in the ready group — the newest thing you did) and its age: the
  server records `startedAt` on a session born from the registry — the moment the board first saw the id, **not the
  registry's `startedAt`**, which is the process's start and survives a `/clear` (measured on this Mac: `startedAt`
  three seconds after `procStart`, the clear half an hour later). Only at boot, where every id is new to the board, does
  the process's start stand in. `indexFile` carries it over when the transcript arrives; `wordAt`, both copies, falls
  back to it after `lastActivity`; the card's `.time` and its tooltip (*started 4s ago · no messages yet*) read it.
* **`openSession` on a chat the snapshot did not have** — the drawer's new one, told of over the `terminal` event a
  beat before its own `session` push — now switches the project and renders the board from the answer it fetched,
  as it does from `state.sessions` for a known one.
* **Learned by the harness**: the auto fixture's second folder was `tmpdir()` — `/var/folders/…` — and a fake claude
  started there registers its real path, `/private/var/folders/…`: to the board, another folder named T, so the new
  chat's card switched the project in view and the fixture chat's card was gone. `scripts/scenario.mjs` builds the
  fixture on the real path now. → `scripts/scenarios/new-chat-card.mjs` (＋, then the first prompt: the same card,
  titled, in its place) and the card assertions added to `drawer-clear.mjs`.

## Decisions of 2026-09-27, afternoon — the halves one over the other: ⌥⌘1 and ⌥⌘2

Ricardo: "what do you suggest for toggling the vertical split for an horizontal one? · this should be a per chat
setting · should be hotkey 2 to change to horizontal split. cmd 2 makes the vertical split · hotkey 1 goes the top
split (pane 1 is up, pane 2 is down). cmd 0 still closes the non-active pane".

* **The two halves can stand one over the other**, the same halves, the same tabs, the same terminals: `#groups`
  turns into a flex column and the divider lies across it. The halves' flex basis runs along whichever axis is the
  main one, so `applySplit` did not change its arithmetic — only which pref it reads.
* **The digit is the pane, the modifier the layout.** ⌘1 / ⌘2 are the left and right halves as before, ⌥⌘1 / ⌥⌘2 the
  top and the bottom; pane 1 is left or top, pane 2 right or bottom. A key pressed on the other layout turns the
  split first, then moves the keys — so ⌘2 on a stacked column puts it side by side and ⌥⌘1 on a side-by-side one
  stacks it. ⌘0 and ⌘W name no layout and close halves the same way in both. Considered and dropped: ⇧⌘2 as a flip
  ("the split, the other way") — one more chord to learn, and a flip says nothing about which layout you get; VS
  Code's ⌥⌘0 — the board's rule is that ⌥⌘ is about the chat, and a digit pair beside ⌘1 / ⌘2 keeps the pair readable.
  This is the one ⌥⌘ pair about the window's shape.
* **The layout is the chat's, like the split** (`stacked`, a set of ids beside `splits`), and Ricardo's call over the
  board-level pref first proposed: a PR beside a terminal wants width, a terminal under a transcript wants height,
  and that is the chat's work, not the window's. **It outlives the split**: `unsplit` leaves it, so the split the
  board makes itself for a new tab (⌥⌘T, a PR) comes back the way the chat was left, while a split asked for by hand
  takes its key's layout. Page state, like `tabs` and `splits`: gone with a reload.
* **One divider place per layout**, both the board's (`prefs.splitAt`, `prefs.stackAt`): a tall column and a wide one
  want the divider in different places, and neighbouring chats can now differ, so one shared fraction would have
  had it jump as you walk the list.
* **The second strip carries ◫ / ⊟ beside ⨯** (`.gturn`), the mouse's way, showing the layout it would give.
* **The app forwards ⌥⌘1 / ⌥⌘2 by key code**, not by character: ⌥ composes a symbol over a digit on a Portuguese
  layout (⌥2 is @), so `charactersIgnoringModifiers` was not to be trusted there.
* **Learned by the harness**: a zsh ended through its × lingers on the summary with `exited` set (the holder keeps
  its last screen for `TERM_LINGER_MS`), so a scenario waiting for the tab to go waits on `exited`, not on `s.shell`
  being null — `split-stacked.mjs` timed out on that once before it was written that way.

## Decisions of 2026-09-27, small hours, later — the divider in pixels, the age on hover, the search as wide as the head

Ricardo: "remove the lines next to the claude icon on the card separator · make the claude icon animation more
"pixely", more fun · the last update time on the card should only show on hover · the search icon on top, should
take the entire space between the app icon and the ready counter · the token budget counter down low should space a
bit more the 3 counters".

* **The divider is Claude's mark alone**, centred: its two hairlines went the way of the day lines' an hour earlier.
  Nothing on a line between the cards is a rule any more — the mark and the days say where a run ends.
* **The mark is pixel art, and it plays**: a 9 × 9 star of 2 px pixels, in frames — full, twinkling (long axes, then
  long diagonals), shrinking to a dot and bursting back with a two-pixel hop — the way Claude Code's spinner runs
  `· ✢ ✳ ✶ ✻ ✽`. Frame by frame is what makes it read as pixels: a smooth turn of a pixel star blurs it into a
  starburst again. So the frames are a sprite strip behind a one-frame window, and the animation is a `transform`
  with `steps(1, end)` on each keyframe — still the compositor's, still phased at 0 with the rings, and the hop is
  the same length so it stays on the burst. The sheet in the source (`PIX_SHEET`) is the strip, frame beside frame,
  so a frame is redrawn by editing its `#`s.
* **The card's age comes back under the pointer only**, where it stands now (left of the ✓), not top left where the
  afternoon had it: transparent at rest but keeping its room, so the row does not shift when it shows. At rest a
  card says states — the ✓, the F, the chips — and the age, a reading, waits to be asked for.
* **The magnifier is a field**, from the fish (or the project's name) to the first state chip: a search box at rest,
  not an icon in a pill. Opened, the icon becomes the box's left cap and the box runs on to the chips — which stay,
  now that the box has room of its own; they hid while it was open, since it had to take theirs. `#stitle` is as wide
  as the name now (it held the row's slack before), and hidden on ALL for real: `[hidden]` lost to `.colhead .t`'s
  `display: flex`, so an empty title had stood there invisibly all along.
* **The folded usage's rings are 20 px apart**, 12 before — the app's list is 378 px wide, and it is the folded line
  Ricardo sees (the open rows got the same ask on 2026-09-26). From 350 px of list only: below that 20 pushes the
  chevron, then a ring, onto a second line and the foot grows, so a narrow list keeps 12 (`@container` on
  `#sessions`, the chips' own trick). `usage-bar.mjs` measures the gap.

## Decisions of 2026-09-27, small hours after — ⌃⌘F fills the screen up to the notch

Ricardo: "fullscreen app on a macbook with a notch, we don't really use that upper real estate. is it possible?" —
then "let's try it".

* **Not with the system's full screen.** Apple's doc for `NSScreen.safeAreaInsets` is plain: a window that enters
  full screen through `toggleFullScreen` is placed below the camera housing, and the strip beside the housing is the
  auto-hidden menu bar's. No key or option changes that. What Apple allows is a *custom full-screen experience*: the
  window borderless, its frame the screen's, the menu bar and the Dock auto-hidden — kitty's and Sublime Text's
  "traditional" full screen — and the two `auxiliaryTop*Area` rects are declared safe to draw in.
* **So ⌃⌘F is the board's** (`toggleFill`): the View menu's item, its title flipped in `validateMenuItem`, the green
  button left as the system's (⌃⌘F pressed in that one leaves it). `BoardWindow` is the subclass it needs: a
  borderless NSWindow refuses to be key, and `constrainFrameRect` would pull the frame back under the menu bar. The
  frame's autosave is off while filled, so a quit mid-fill does not bring the next launch up screen-sized; ⌘W leaves
  the fill first, since a borderless window has no close button for `performClose` to press.
  `NSFullScreenMenuItemEverywhere` registered false keeps AppKit from adding its own *Enter Full Screen* beside ours.
  Info.plist carries `NSPrefersDisplaySafeAreaCompatibilityMode = false`: the system may otherwise answer a window
  behind the housing with the shrunken compatibility mode.
* **The page lays the top row around the housing** (`peixFill` → `layoutNotch`): the shell sends the strip's height
  and the x range the housing covers, in CSS px (points), on every toggle, screen change and load. The chat list's
  head stays put while the list ends short of the housing; the chat header keeps its title left of it and its chips
  and ··· right of it — the h2 given a width ending 10 px short of the housing and a right margin carrying the next
  item 10 px past it (`.hole`), while both sides have room (220 px for the name and a title, 120 for the tail); a
  list dragged under the housing pads its head down by the strip, a header without the room pads down too (`.npad`,
  the tint filling the room), a header wholly right of the housing lifts as it is. `fitHeadPrs` measures the fixed h2
  and its margin in hole mode. Measured on the 16": a 32 pt strip, the housing x 771.5–956.5 of 1728 — about 3 % of
  the height, with a 185 pt hole.
* **What it costs**: no Space of its own (Mission Control shows a window, ⌃← → does not reach it), and the menu bar
  slides down over the strip whenever the pointer touches the top edge. `notch.mjs` drives the page with the 16"'s
  numbers; the app itself is checked by hand.
* **The green button is the fill too, and the fill is remembered** (later that night, Ricardo: "I quit and now I
  don't see it using the top part again. If I click on the fullscreen button (mac's green circle), I end up as
  before"): the window's `collectionBehavior` is `.fullScreenNone`, so the button zooms, and `windowShouldZoom` turns
  a plain click on it (the current event: one click, ⌥ up) into `toggleFill`; ⌥-click and a title-bar double-click
  zoom as they always did. The system's full screen is not offered at all now — it would only ever be the "as
  before". `peixairada.fill` in the defaults says whether the board was filled when it was last up, and a launch
  fills itself again before the page loads (`didFinish` then tells the page). `kill -USR1` on the app's pid is the
  same toggle from a shell, for the drawers, which cannot press a key in the app.
* **The Dock is hidden, not auto-hidden** (Ricardo: "one downside now is that in this mode, the dock is still
  visible"): `.hideDock` in place of `.autoHideDock`. His Dock is on the right, where the chat column's edge and its
  controls are, so an auto-hidden Dock came out under the pointer all the time; hidden, it is gone while the board
  is in front and back the moment another app is. The menu bar stays auto-hidden — the menus have to be reachable.
  The fill's log line now carries the presentation options and the screen's visible frame, which is the check that
  the options took (the whole width, the height less the strip).
* **…and comes out after a hold at its edge** (Ricardo, next: "the dock is not showing when I go to the edge on the
  right"): the system full screen's push, done by hand — `dockTick`, a 10 Hz timer while filled, reads the pointer
  (`NSEvent.mouseLocation`, over web views and native views alike) and, once it has been at the Dock's edge (its
  `orientation` preference) for 0.7 s, swaps `.hideDock` for `.autoHideDock`, which lets the Dock out with the pointer
  already there; 100 px off that edge, `.hideDock` again. A touch of the edge in passing shows nothing. The app log
  says `dock: out` and `dock: back`.

## Decisions of 2026-09-27, night — the head bare on ALL, the age beside the tick, About behind the fish

Ricardo: "remove the lines left and right of the date, on the card separators · clicking on the app icon should
show an About info box center screen · the ALL next to the app icon should disappear, as we assume not having
anything is the default All (aka no filter) · also, remove the color picking on the filter next to the icon, and
leave it to the chats that we have right now · the time since last update on the card should live left of the Done
icon on each card".

* **The day lines are the day alone**, centred: the two hairlines of an hour before went the way of the fish. The
  divider between the clauding and the ready cards keeps its hairlines either side of Claude's mark.
* **The head says nothing on ALL** (`#stitle` `hidden`) and, on a project, only its name and ×: no filter is the
  default and needs no word; the colour square went too — it was only a colour, but it read as a picker, and the
  chat header's square is the one that picks. On the rail the head shows the project's short name (`projAbbr`, the
  squares' rule) as the picker's handle, since the square was that; ALL shows nothing there either. ⌥⌘P is the way
  to the picker from ALL.
* **The card's age is in the top row, left of the ✓** (`.top .time`, always shown, in the muted ink): time · tick · F
  end the row. Every card has the row now, at least 18 px tall, so nothing jumps when a tick appears. The hover-only
  top-left placement of the afternoon lasted an afternoon.
* **The fish opens About**: a modal `<dialog>` centred by the browser, lowered under nothing (the pane goes down
  like under any dialog), Esc or the backdrop closing it. It says the version (the package's, read by the server
  and sent with the snapshot as `about`, with node, pid, port, uptime, the Claude dir and the state file) and the
  chats' counts. `project-cue.mjs` checks the head on ALL, on a project and on the rail, and the box.

## Decisions of 2026-09-27, evening — the lines between the cards, and the rings' step

Ricardo: "put that phase lock sync as an toggle on the settings cog, so I can switch back and forth to see what I
like · remove the fishes from the date spacing between cards · as for the divider between ready cards and clauding
cards, which has fishes today, remove the fishes and leave a claude icon animation in the middle".

* **The day lines are bare**: the day between two hairlines (`.gsep i`, 1 px of the muted ink at 35 %), where a
  still school of `<><` stood either side since 2026-09-23. The two boxes are still equal, so the day sits dead
  centre; nothing moves on the line, so it is plain markup as before. `day-separator.mjs` now measures the two
  lines instead of counting whole fish.
* **The divider is Claude's mark**: between the last clauding card and the first ready one, the starburst
  (`ICON.claude`, the reply glyph's) 15 px in the accent, turning once in six seconds and breathing to half its
  ink and back every 2.4 s (`breathe`, its own: the dots' `pulse` drops to a third, which read as a flicker on a
  line), between the same two hairlines — where the school of `><>` had swum since 2026-09-20. Both motions are
  transform and opacity, the compositor's, and `spin` and `breathe` joined `phaseAnims()`'s names, so the mark is
  plain markup rebuilt with the list: the kept node, `school()` and its Web Animations phasing went with the fish.
  Off under reduced motion, as the school was. The rail still shows no line: a 36 px square has no room for one.
  `card-signals.mjs` checks the mark, its two lines and its two animations at start time 0.
* **Rings in step is a switch on the cog** (`#ringsInStep`, `prefs.ringsInStep`, on by default): off,
  `phaseAnims()` gives each card's animations a start time hashed from the chat's id instead of 0 — as steady across
  renders, so nothing resets, only not shared, so the lights are scattered as they were before the phase lock (by
  accident then, by the id now). The header's dot and the divider have no card and keep 0. Flipping it re-phases
  what runs, so the two looks can be compared on the spot. `card-signals.mjs` flips it both ways across a rebuild.

## Decisions of 2026-09-27, later — the clauding ring: phased across renders, and off the main thread

Ricardo: "the animations like the border when clauding still reset randomly and breaks the smoothness. research and
check if we need to put this in a different thread", then "do 1 and 2. be mindful of performance issues, I don't
want this to consume measurable CPU".

* **What reset it**: every SSE `session` event rebuilds the list with `innerHTML`, so each card is a new node and
  the ring's CSS animation starts over at its first frame — the fish's stutter of 2026-09-20, on the ring. Measured
  in headless Chrome: five renders, five start times, the light half a second old at every read. "Random" because
  it is timed by any chat's transcript line, a registry poll, a peacock or pins event. The asking border's blink
  and the state dot's pulse did the same.
* **The fix is the fish's** — `phaseAnims()` after `renderSessionList` and `renderHead`: every `ring`, `blink` and
  `pulse` animation in the document is put at start time 0 on the document clock, so a new node is exactly where
  the old one was (and every ring turns in step, like the school). A CSS animation rather than the Web Animations
  API, because the ring is on a pseudo-element; `startTime = 0` on a CSSAnimation holds in Chrome and in WebKit
  (checked in a WKWebView on this Mac: the new `::before`'s angle is the clock's). Once at 0 it stays there, so the
  loop touches nothing on a node that survived; `getAnimations()` is the document's running animations, a few
  dozen at most, and the style flush it forces is the one the frame was about to do.
* **A thread is not the answer, the compositor is**: the ring animated a registered custom property feeding a conic
  gradient. Chrome's own trace said `compositeFailed: 8192, unsupportedProperties: ["--spin"]` — main thread,
  repainted every frame, frozen for every main-thread stall (11 ms for the list of 287 cards, 36 ms for a short
  chat's transcript, 130 ms opening the largest) — and WebKit accelerates only transform, opacity and filter. A
  worker cannot touch the DOM. So the ring is now a conic gradient on a square `::before` 160 % of the card's width,
  turned by `transform: rotate()`, under an `::after` cover in the card's own background (`background: inherit`)
  3 px in; both at z-index -1 in the card's stacking context (`isolation: isolate`), the card's overflow clipping
  the square. The same picture — a rotated conic gradient is a conic gradient with another start angle — paused at
  the same phase, screenshot for screenshot, on the plain, the hovered, the open and the black card, in both themes
  and on the rail. Chrome's trace no longer flags it.
* **The CPU, three clauding cards, ten seconds**: WebKit's WebContent process 7.2 % of a core → 3.0 %, of which the
  ring is 1.3 % and the fish 1.5 % (every animation off: 0.2 %) — the residual is WebKit's rendering update per
  frame while any animation runs, accelerated or not. Headless Chrome: the renderer 8.1 % → 0.9 %, the GPU process
  2.7 % → 5.0 % (it draws the turning textures; headless composites in software). The square's texture is 2.56 × the
  card's area at the display's scale, about 3 MB per clauding card at 2×, rasterised once.
* **Measured with** `getAnimations()` across appended transcript lines, a `Tracing` capture of Chrome's `Animation`
  events, `ps -o time` deltas on the browser's processes, and a WKWebView probe (a Swift tool of the session, not
  kept). `card-signals.mjs` checks the phase, the property and the angle across a render.

## Decisions of 2026-09-27 — the card: the last word, an F for Fable, the age under the pointer

Ricardo: "sort by the latest: either my reply or claude reply · if the chat is using Fable, put a special marker
on the card, like a star or a stylized F or something · the time since last update on the card should only show
on hover and should be a top left on the card".

* **The order goes by the last word, whoever said it** (`wordAt`, the newer of `lastUserAt` and `lastReplyAt`, falling
  back to the last activity; `byWord`): every list — the cards, ⌥⌘K, the new-chat flow's chats step, the day lines
  and the timeline's runs, the server's `/api/sessions` — where it had been your last touch alone since 2026-09-20
  ("Claude finishing a long job does not move a card up"). Now it does: a reply landing brings the card to where
  you will look next, which is what a board of chats is for. A tool call is still not a word, so a clauding card
  keeps its place through a turn. The card's tooltip says when Claude last replied beside when you last wrote.
* **An F with a spark for a chat on Fable** (`onFable`, `ICON.fable`): the model is the last assistant line's
  (`s.model`, which the server already kept for the chat header), so a chat that switched models shows what it runs
  on now; a `<synthetic>` line — Claude Code's own, for an API error — no longer overwrites it. A stylized F over a
  star: a star on a card reads as a favourite. It stood at the end of the title row for an hour, where the age had
  been; on the solid tint of a hovered or open card it takes the card's ink, like the matcher's hits.
* **The ✓ and the F end the top row, the tick first** (Ricardo, next: "both F and done icon are on the row of the
  card title, but I want them above, on the project name height. also, switch the order, first done icon, then F for
  fable. when fable is not there, move the done icon to the right where F would be"): both leave the title row for the
  end of `.top`, after the folder chips and VS Code's mark, right-aligned by the row's spacer — so with no F the tick is
  the last thing on the row, where the F would be. A card in a folder project had no top row (the name is not shown
  there); the tick or the F brings it into being, and both are 18 px tall in it, the row's own height, so a row
  holding only the marks costs no more than one with a name. The title row keeps the agents and task chips and the
  unread badge.
* **The age is a corner mark under the pointer** (`.card .time`): the card's first child, absolute at the top left,
  invisible until the card is hovered. A first cut was a tag on a wash of the panel, 12 px tall — it sat over the
  first letters of the project's name. Now 11 px tall with a 10 px face, in the 8 px of top padding: it ends a pixel
  above the first row's capitals, so it covers nothing and needs no background. It cannot sit on the border — the
  card clips its overflow for the ring and the ellipsis. Nothing moves under the pointer (the ✓ that a hover brings
  out narrows the title, as before). The badge and the chips keep the title row's right end.
  → `scripts/scenarios/card-marks.mjs` checks all three: the order against the server's and ⌥⌘K's, the one F and
  its tooltip, the age's opacity and place at rest and hovered. `makeFixture` takes a `model` per chat for it.

## Decisions of 2026-09-26 — a bar between the project and the title

Ricardo: "instead of '/' dividing the project from the chat title, on the chat's header, but a vertical black bar (or
white if it's too dark, like 'acme' project black color)".

* The `/` is a 2 px bar in `--rink`, the ink `inkOn` already picks for the header by the colour's brightness
  — black on admin-service's blue, white on acme's black — and the page's ink on the plain header of a chat
  with no colour. **From the header's top to its bottom** (Ricardo, next: "the bar should go from top to bottom";
  15 px tall for a moment): the span holds 2 px of the row and its `::before` is positioned from `.shead` — top 0
  to bottom 0 at the span's own x — since the h2 clips its overflow for the ellipsis and a bar drawn inside it
  could not leave it. The title's tooltip still reads "project / title". Checked on the live board on the blue
  header, and with the header's variables forced to the black one.
* **The same room either side of the bar, and of the name** (Ricardo, next: "make the space between the last
  letter and the bar equal to the next letter on the right", then "the spacing seems off. make left and right
  spacing the same for the project name"): the colour square is invisible at rest, so wherever it took room in
  the row — between the name and the bar first, before the name after that — the room read as a lopsided gap. It
  takes none now: it sits on the bar, centred, out of the flow (positioned from `.shead` at the span's x, so the
  h2's clip does not reach it; the picker's hover scale keeps that centre). The row's gap is 12 px, the header's
  padding, so the name has 12 px either side and so does the bar. The square keeps the picker and ⌥-click.

## Decisions of 2026-09-26 — square cards

Ricardo: "remove the round corners from cards".

* `.card`'s 10 px radius is 0, and so is the 8 px of the ring its `::before` draws inside the border for a
  clauding, watching or asking card — a round light on a square card would have shown at the corners. The open
  card's bleed into the splitter no longer needs to square its right corners. The PR chips keep their 4 px: they
  are chips, not cards. The folded rail's squares are square too.

## Decisions of 2026-09-26 — paths and pages in the chat are links

Ricardo: "let me click url's on chat and open them if local or open in web if it's web".

* **Read as: a local thing is a file, and it opens; a web thing opens "in web"**, which on this board is the pane —
  the vocabulary of 2026-09-24 ("when a PR is open in web…"). So a file path opens in VS Code at its line, the href
  `md()` already gave the `[file:42](src/file.ts#L42)` links Claude writes, and a web URL opens on a tab of the chat
  like a PR does; `openExternal` takes every http(s) page there now, not GitHub's alone (the rest went to the
  browser), with the strip's ↗ as the way out. A tab's label is the PR's `repo#n` or the page's hostname.
* **What is a path** (`PATH_RE`): `/absolute`, `~/…`, `./…` with any segments; `folder/file.ext` with the first
  segment dotless (a domain is not a folder) and not an npm scope; `name.ext` right before `:line`; `:line[:col]`
  on any. `pathHref` then says no to what is no file of ours: an absolute path under no root a file lives under
  (`/Users`, `/private`, `/tmp`, `/var`, `/opt`, `/etc`, `/usr`, `/Library`, `/Applications`, `/Volumes`,
  `/home`) and with no extension — `/api/sessions`, `/clear` — a `~` with no home to read off the chat's folder, a
  relative path with no folder. Claude Code's `@` before an attachment is not part of it. Trailing punctuation is
  not either. Measured on a real chat: 332 files and 31 pages linked, one false positive (the `@` one, fixed).
* **Where**: the transcript, after every render — `linkify` walks the text nodes the markdown and the tool rows
  left, skipping anchors (marked's own autolinks, `md()`'s file links, the PR rows) and summaries; a tool row's
  links are dotted-underlined in the row's own ink, the reply's are the accent as before. The drawer: a link provider
  beside the web-links addon (`termLinks`), the line read back to its cells so a wide character does not shift
  the range; activation goes through `openExternal`, which hands a `vscode://` URL to the system. Wrapped lines
  are not joined; a path split by the wrap is two non-paths.
* Not done: resolving `~` for a chat outside `/Users` or `/home`; joining wrapped lines in the drawer; VS Code
  Web instead of VS Code for a file (no URL opens a file there).
* `scripts/scenarios/chat-links.mjs`: one reply with nine links and eight look-alikes, checked as anchors in
  order; a path typed into the fake claude's drawer, read back as a link on its own cells (`peix.links`).

## Decisions of 2026-09-26 — the open card bleeds into the splitter

Ricardo: "the open card now is hard to spot... can we have some extra visual cue like bleeding the color to the right
so that the bar that divides the chat and the column stays in that card color".

* **The open card runs over the list's padding to the column's edge**, its right corners square, and **the splitter
  is the open chat's colour** — `--open` on `main`, set by `tintChat` with the chat's tint (the grey of no colour
  for a chat without one, the panel again while no chat is open) — so the card, the bar and the chat's tinted
  header are one stroke of the colour: the card reads as the tab the chat hangs off. The card's 1 px border and
  2 px ring at its right edge are in the same colour, so the seam does not show. The splitter's hover and drag
  keep the accent.
* Not on the rail of squares (⌘B), which has no splitter: the rule is scoped to `main:not(.scompact)`.
* Looked at on the live board with the admin-service chat open (its blue from the card through the bar to the
  header) and with none.

## Decisions of 2026-09-26 — the usage rows spaced out

Ricardo: "space a bit more the 3 token usage on the bottom left".

* The three rows of the plan usage sit 9 px apart (5 before), the heading 7 px above them (4), and the block has
  2 px more above and below. Open, the foot is about 100 px now; folded it is the 34 px it was.

## Decisions of 2026-09-26 — the card's done button, bigger and only under the pointer

Ricardo: "the done button on the card is a bit small and hard to see, also make it visible only on hover".

* **A 22 × 20 px rounded button with a 16 px tick** (12 px, no box, before) at the end of the title row, beside the
  time; the same for ↩ on a done card. At rest it is fully transparent and keeps its box, so the row does not move
  when it comes; the card's hover brings it to 70 %, its own hover to full in the accent on a wash of it; in the card.s ink, not the muted grey, so it reads on a tinted card, and
  keyboard focus shows it too (`:focus-visible`). Looked at on the live board with the two states forced.

## Decisions of 2026-09-26 — no carets after the project's name and the PR chips

Ricardo: "remove the down [arrow] from PRs in the chat top bar and from the project picker next to the app icon".

* The ▾ after the project's name in the chat list's head and the one after the PR chips in the chat header went.
  Both said "this is a button"; the head's hover wash and the chips' own look say as much, and the caret took a few
  px from the one row in which the name is what gives way. `project-cue.mjs` reads the head as `ALL` now.

## Decisions of 2026-09-26 — the timeline pared down to an orange thumb at the far left

Ricardo: "the timeline on the left is a bit ugly: it's too close to the cards, it's green, it's has the ticks for
dates, which is not pretty. what do you suggest? I would like it to stick to the far left and if we need color, use
orange" — and, to the proposal below, "do it".

* **The rail is 12 px, flush against the list's coloured edge** (26 px before, its track 21.5 px in so as to line up
  under the fish and the cog — an alignment given up for the far left). The list's own padding grows from 4 to 8 px,
  so the cards start 10 px further left than they did and 8 px clear of the rail.
* **At rest, the thumb alone**: a 5 px pill in `--spend`, the usage bars' orange under it and the board's one true
  orange (`--accent` is terracotta), 90 % opaque; under the pointer 8 px and solid, like an overlay scrollbar that
  is hovered. Never under 24 px tall (`TL_MIN`; 10 before), so a long list's is still there to find — and a press
  on the thumb *as drawn* (taller than the window, or swollen round the pointer) now holds it where it was grabbed
  instead of counting as a press on the track and jumping.
* **Beside the edge, not on it.** Mocked both: on the edge itself the thumb vanished on a project whose Peacock colour
  is orange; beside it, on the panel, it reads on every colour and in both themes.
* **The track in the state groups' colours went** — on ALL it was one long green — **and so did the tick per day.**
  The fish line in the list already marks where clauding ends and ready begins, the day lines mark the days, and the
  labels say the state in words on hover; the labels lost their coloured state dot for the same reason. What is
  gone from the rail at rest: the ready/done boundary and the bold tick for today.
* The labels come out 16 px from the rail's left (`TL_LX`; 30 before) and the rail's reach at rest is 24 px
  (`TL_CATCH`: the 4 px edge, the rail and the list's padding, to the cards' edge). The near label's ring and the
  scroll bubble's edge are in the same orange.
* `timeline.mjs`: the runs are placed by their labels now (at rest a label sits where its run is, only kept inside
  the rail by half its height); checks the rail's place and width, the cards' distance, the thumb's colour and its
  two widths, and that nothing else is drawn at rest. The fish-and-cog alignment check is gone with the alignment.

## Decisions of 2026-09-26 — the cards wear more of their colour at rest

Ricardo: "the brightness of cards is a bit low, bring it much closer to what it looks when hover. the hover should
bring to full color + extra border like it is today".

* **The wash goes from 22 %→6 %→panel to 45 %→37 %**: nearly the old hover's 55 %, and no longer fading to panel —
  the wash was mostly panel, which is why a list read as grey with a coloured corner on each card. A faint slope is
  kept (8 points), so a card is still a wash and not a swatch.
* **Hover and the open card step up to 65 %**, keeping the full-colour border and the halo / the 2 px ring as they
  were: with the wash at 45 % a hover at 55 % was too small a step to read as a change — the border alone is a thin
  cue at a glance. Read "full colour" as the hover's tint at full strength, not a 100 % background: the card's inks
  are not chosen by the colour's brightness (the header's `--rink` is, the cards' is not), and the PR chips wear
  GitHub's state colours, which a solid card of the same hue would swallow.
* **A black card's wash stays lighter (28 %→20 %)**: 45 % of black over the light panel is the mid-grey the
  `.card.black` rule already had to dodge at 55 %; its hover and open tint are the black itself with the dark inks,
  unchanged.
* The muted snips lose some contrast on a bright colour in the dark theme (measured: ~2.3:1 at 45 % of the orange
  against ~4:1 before). Asked for; the title and Claude's line are in the brighter inks.
* Looked at in both themes on the live board; no scenario reads these numbers.

## Decisions of 2026-09-25, evening — glass under the days, and a smaller swell

Ricardo: "put a glass tint on the background, when hovering the timeline with genie effect (also make the zoom a bit
smaller)".

* **Glass, not a dim**: the cards used to drop to half opacity while the days were out. Now a pane goes over the
  list's cell — a 3 px `backdrop-filter` blur, a little desaturation and a 42 % wash of the page colour — under the
  labels and the list's ends, taking no pointer events. Frosted, the card text stops competing with the labels, and
  the cards' colours still show through as colour. Fades in and out with the swell (0.2 s).
* **The swell is 1.4× at the pointer** (1.65 before); the fisheye's radius and strength are as they were, since what
  was asked about was the size, not the spread.
* `timeline.mjs` checks the glass is up while the days are out and gone once the pointer has left.

## Decisions of 2026-09-25, evening — the timeline holds on to the pointer

Ricardo: "it a bit hard to keep the timeline open, because any gap below or above a date, closes it? also, if I go to
the far left of the screen, it's not triggering the timeline effect".

* **Both were the hit area**: the rail was its 26 px column and the labels themselves, so the pointer between two
  labels was over the cards — the rail left, the days went back in — and the window's first 4 px are the list's
  coloured edge, a border of `#sessions` that is no part of the rail.
* **One transparent layer is the rail's reach** (`.tl-catch`, first in the rail, so everything else on it is above
  it): from x = −4 px of the rail — the window's own edge, over the coloured border, the way the cog's cell already
  reaches the bottom-left pixel — to the rail's right edge at rest, and while the days are out to the furthest right
  a label has come plus 28 px. The furthest is a high-water mark for as long as the swell is out: labels shrink as
  the pointer moves on, and a reach that shrank with them would pull the rail from under the pointer. Past it — or
  above into the head, or below into the foot — is leaving.
* **A press in the gaps means the day ringed as nearest** (`.near`), the one the swell is centred on: a click goes to
  it, a drag scrubs from there. A press on the strip itself is what it was — the thumb comes to it.
* The cost: while the days are out, the cards under the labels' reach take no clicks — they are under glass then, and a
  move past the labels gives them back.
* `timeline.mjs` adds: the pointer in the gap between two labels keeps them out (`elementFromPoint` there is the
  catch), a click there scrolls to the ringed day, past the labels the swell goes back in, and x = 0 halfway down
  the list swells it.

## Decisions of 2026-09-25, later — a timeline down the list's left edge

Ricardo: "can we build a slim vertical timeline - form the app icon to the bottom settings cog - showing where we are
on dates on the cards? and you can drag and has this "genie effect" like macos dock".

* **Read as the list's scrollbar, with the days on it.** "Showing where we are" is what a scrollbar does; "dates" is
  what it lacked; "drag" is how one is used. So the rail is the list to scale — its inner height is the list's
  scroll height — with a tick where each run of one day's cards begins and a thumb for the window, and the native
  scrollbar is hidden while it shows. A chronological axis (today at the top, a day's place by its date) was the
  other reading, and it cannot be what the list is: the list is grouped first — asking, clauding, ready, done — so
  today comes back under the done cards, and a date axis would have had one place for two places in the list.
* **A run is a day and a state group**, which is where the list's own lines fall (the fish between clauding and
  ready, a day's line under each day). Its label says both: *today · 16 ready*, *Wed 23-09 · 9 done*. The track
  under the ticks is coloured by group in the chips' colours, so the rail also says where ready ends and done begins.
  Day names are short — today, yesterday, the weekday for the last week, then DD-MM (the year when not this one) —
  in the day lines' DD-MM order.
* **From the app icon to the cog**: the rail is the first of the list's two grid columns, 26 px, in the list's row;
  its track sits 21.5 px in, under the middle of the fish above and of the cog below (measured: 25.5 against 26 and
  25). The cards give up 22 px of width for it — the rail's 26, less 4 of left padding the list no longer needs.
  Folded to the rail of squares there is no room, and no timeline.
* **The "genie effect" is the Dock's magnification**, which is what the Dock does under a pointer (the genie proper is
  its minimise animation, which has nothing to point at here). Pointed at, every day comes out over the cards as a
  label, and the ones near the pointer swell and push apart — a fisheye (Sarkar and Brown's, radius 150 px) applied
  to everything drawn on the rail: ticks, labels, the track, the thumb. Being a warp around the pointer, it keeps
  the order and keeps the point under the pointer where it is, so a drag can read the list's position straight off
  the pointer even while everything around it moves. Labels that would overlap a nearer one are left out, so a
  crowded stretch (46 runs on the live board) reads where it is pointed at and thins out away from it. The cards dim
  to half while the labels are out, which is what makes them readable over card text.
* **Moving the list from the rail**: drag the thumb (it stays under the pointer where it was grabbed); press the
  track elsewhere and the thumb comes there, centred, then drags; click a label and its run's first card is scrolled
  to just under the top pill; the wheel over the rail scrolls the list. Scrolling the list anywhere else shows the
  run at the top of the window beside the thumb for 0.9 s — the date a scrollbar's thumb never tells you.
* **Under a query there are no days**: the list is in the match's order, as it has no day lines then either; the
  thumb stays.
* **The swell runs by the clock, not by the frame**: the first version eased a fixed fraction per frame, and in
  headless Chrome, whose frames come slowly and irregularly, it was still at 5 % a second after the pointer left —
  suppressing the bubble. 140 ms in, 220 ms out, smoothstepped.
* `scripts/scenarios/timeline.mjs`: fourteen chats over four days and a done pair; the runs, the groups, the ticks
  against their cards and the thumb against the window (to 0.4 %); the track under the fish and the cog; the swell
  (every run's label, the nearest largest with its day and count, none overlapping); a label clicked; a thumb
  dragged 120 px; a press on the track; the wheel; the labels going back in; the bubble; a query; the rail of
  squares. Screenshots looked at in both themes and on the live board (283 chats, 46 runs).

## Decisions of 2026-09-25, later — the list's ends count what is out of sight

Ricardo: "when scrolling down the cards, the top should visually say how many cards are hiding, same for below".

* **A pill at each end of the list, over a fog of the page**: *↑ 5 more* at the top once anything is scrolled past,
  *↓ 12 more* at the bottom while anything is below. They lie over the list's own grid cell (`.sedge`), so they
  neither scroll with the cards nor take room from them; the fog lets every click through to the cards, only the
  pill takes one.
* **Out of sight is more than half out**: a card counts once its middle is past the visible edge. A card cut in two
  is still being shown, and one with a sliver showing is not something you can read.
* **A dot for the two states that should not be able to hide**: red when a chat out there is asking you, amber when
  one is clauding (asking wins, as it does in the order). Both sort to the top, so this is mostly the top pill once
  you have scrolled down — the case where a question could otherwise sit unseen. The tooltip counts them.
* **A click scrolls a screenful that way**, smoothly, not to the end: the count is a hint of how far, and the end of
  a 280-card list is rarely where you meant to go.
* **Redrawn at most once a frame** (`listChanged()`): on scroll, after every render, when the list's box changes
  size (⌘B, the splitter, the window) and from the cog's card-size slider, which changes every card's height under
  the same scroll position. A pass over ~280 cards' `offsetTop` is nothing when the layout is clean.
* On the folded rail the pill keeps the arrow and the number and drops the word.
* `scripts/scenarios/list-ends.mjs`: twenty-four chats, one asking and one clauding; the counts against the cards'
  own rectangles at the top, the middle and the end; the red dot over the amber one; a click on the bottom pill; the
  counts following the compact cards without a scroll; the rail. Screenshots looked at, the live board's too
  (283 chats: *↑ 17 more* with an amber dot, *↓ 262 more*).

## Decisions of 2026-09-25, later — each half's strip lists its own tabs

Ricardo: "pane tabs show all open stuff, regardless if they are in the 1st or 2nd pane - filter by what's open on
1st vs 2nd pane".

* **Read as VS Code's editor groups**: a tab belongs to one half's strip, not only to the half showing it. Before,
  both strips listed every tab of the chat and the other half's was dimmed; a click on the dimmed one traded the
  two halves' tabs. Now the left strip is claude's (and whatever was dragged to it), the right one the zsh and the
  pages — `homes`, per chat, beside `tabs`.
* **The default is the rule of the commit before**: chat left, everything else right. Only a tab that was dragged is
  written down (`moveTab`), and the record goes with the split (`unsplit`) — the next split starts from claude on
  the left again, which is what "always on the 1st pane" asks.
* **A tab goes across by being dragged** — a press on it, onto the other half (its strip or its body), a release.
  Pointer events rather than HTML drag and drop, because the drop often lands over the app's pane, a native web
  view the page cannot see: AppKit keeps sending the drag's moves to the board's view, where the press began, and
  `elementFromPoint` still names the half under the pointer. The tab fades in its strip, a copy follows the pointer
  and the half underneath lights its strip (the part the pane never covers) and outlines its body. A press that
  travels under 5 px is a click; the click a real drag's release makes is swallowed.
* **Choosing a tab never moves it**: a click, ⌥⌘G on a PR already open, ⌥⌘T on a live zsh show it in its own half
  and take the keys there (`setTab`). ⌥⌘← / ⌥⌘→ read the two strips as one row, left then right, so they still reach
  every tab and cross the divider on the way.
* **An emptied half**: a split the board made itself folds away (the zsh exited, the last page closed, the last tab
  dragged out) and the column shows what the other half was showing; a split asked for with ⌘2 keeps its empty half,
  whose strip says *drop a tab here*.
* Scenarios: `split-halves` drags the zsh from the right strip onto the left one (the left half lit while it
  travels, the right one left empty, nothing of the drag left behind) and the chat onto the right half's body (the
  transcript and the drawer go with it), and walks ⌥⌘→ across the divider; `pane-tabs` reads both strips — claude
  alone on the left, zsh · PR · PR · editor on the right — and drags a PR into the left half to have a page up in
  each. `ctx.drag(from, to, mid)` in the runner does the press, eight moves and the release through CDP's input.

## Decisions of 2026-09-25, later — a split keeps claude in the first half

Ricardo: "when opening a 2nd pane on the chat, keep the claude always on the 1st pane".

* **Every split puts the chat on the left** (`splitChat()`): the one a new tab makes and ⌘2's alike. What the column
  was showing, when it was not the chat, goes to the right — so ⌘2 over the zsh gives claude beside the zsh, with the
  keys still on the zsh, instead of the zsh on the left and claude pushed across.
* **A new tab goes into the half the chat is not in**, not the half the keys are in: ⌥⌘E with the keys on claude used
  to replace claude in its own half. Only the chat is protected — a page in the right half is still what the next
  new tab replaces.
* **Going back to the chat moves the keys, not the chat** (`showChat()`): Esc from a page, ⌥⌘C and the ◎ row used to
  put the chat tab into the half the keys were in, trading it with the page there, which is how claude ended up on
  the right. Now the keys go to the half showing the chat, and the page beside it stays up. A chat shown in neither
  half comes back into the left one.
* A click on a tab in the other half's strip still traded the two — a hand asking for it, not the board deciding;
  the next entry changes what the strips list, and with it that.
* Scenarios: `split-halves` (⌘2 from the zsh alone: claude left, zsh right, keys on the zsh), `pane-tabs` (Esc goes
  to the chat's half; ⌥⌘E with the keys on claude opens on the right), `focus-view` (⌥⌘C from the zsh goes left, so
  its hand-typed /focus is typed into the left half now), `drawer-reattach` (it re-attached the drawer by ⌥⌘C
  trading the halves; now ⌘W folds the zsh's half away and the zsh tab and back happen in the one column, at the
  size the drawer left at).

## Decisions of 2026-09-25 — the cards come in three sizes, a slider in the cog

Ricardo: "make a setting in the bottom left cog to compact the cards by 1) [large] as is 2) [medium] leave the last
interaction, either me or claude and 3) [compact] remove both mine and claudes text … make it a slider".

* **Three stops, in the order asked: large · medium · compact**, left to right — the slider is how much the cards are
  compacted, so it runs the way the request counted. The stop names under it are its scale and a click each.
* **Medium is the last word, and "last" is by time, not by who usually speaks second.** Claude's reply is the last
  word when it came after your last touch (`lastReplyAt ≥ lastUserAt`); a prompt it has not answered yet, an Escape
  after it, an answer to its question all make yours the last. The case that needs it: you asked again and pressed
  Escape — the reply on the card is the turn before's, and showing it as the latest would be wrong. A card with only
  one of the two keeps it.
* **Compact drops both words and nothing else**: title, chips, time, PRs stay; so does a question waiting on you
  (`askHtml`), which is neither your word nor Claude's reply but the one line on a card that asks you to act — the
  blinking edge says *something*, the line says what.
* **A pref of this window, not the server's word** — like the widths, the zoom and the folds. The notifications
  switch is the server's because the server's alerts are what the switch silences; this is only how a list looks.
* **The markup always holds both words**: `cardHtml` marks the older one `.older` and CSS hides by `#sessions`'
  `data-cards` — the usage footer's way — so moving the slider re-renders nothing and the fuzzy filter still searches
  the prompt a compact card does not show.
* `scripts/scenarios/card-sizes.mjs`: three chats — Claude with the last word, you with it (a second prompt, then
  Escape), one waiting on a permission prompt; both words at large, the right one each at medium, none at compact,
  the two plain cards shorter at each step, the question at all three; the slider's input and the stop's click both
  move it; compact survives a reload. Screenshots of each and of the popover looked at.

## Decisions of 2026-09-25 — ⌥⌘F: the chat list's filter, fuzzy like ⌥⌘K

Ricardo: "make hotkey F fuzzy search like K".

* **Read as: F is the chat list's magnifier, from the keyboard, and it matches the way K does.** There was no ⌥⌘F, and
  a second dialog that did what K does would be K twice. What K had that the list did not was the matcher, so the
  list got it; what the list has that K does not — the done chats, the project in view, the state chips — is why a
  finder there is worth a key of its own. A different reading (F as K over every chat, done ones included) would be
  a small change on top of this one.
* **This reverses 2026-09-21's "the column's own filter boxes stay literal"**, and for that entry's own reason: fuzzy
  without ranking is only a longer list, so the list is ranked too. With something typed the cards are in the
  match's order — `fuzzy(chatFields(s), q)`, the board's order breaking ties — and the fish and the day lines are
  left out, since each says where a state or a day ends and neither is what the list is ordered by any more. An
  emptied box (Esc) gives the board's order and its lines back.
* **The letters that matched are bolded on the card**, title and folder name — `markHits()`, the picker's `mark()`
  hoisted so both use it —, underlined as well as in the accent, because a card is tinted in its project's colour
  and on the solid tint of the open, hovered or marked card the accent does not read (there it takes the card's ink).
* **↑↓ from the box walk the cards, ⏎ opens the marked one** — K's keys. The mark (`.qsel`, the hover's tint) is
  drawn only while the box has the keyboard, and on every render, so an SSE update does not drop it. ⏎ keeps the
  query, lets go of the box and hands the keyboard to the chat's drawer if it has one (`focusTerm`); Esc in the box
  is still what empties it.
* **Folded to the rail, ⌥⌘F opens the list first** — the rail has no box. Again with the box open, it selects what is
  in it, so typing replaces the query.
* **The app forwards ⌥⌘F from the pane** (`boardKeys`), the rule for every ⌥⌘ letter. It costs VS Code Web in the
  pane its ⌥⌘F (Replace), as ⌥⌘T and ⌥⌘C already cost it theirs.
* Measured on the live board (277 chats): 2–10 ms a keystroke, the whole list re-ranked and redrawn.
* `scripts/scenarios/chat-filter.mjs`: ⌥⌘F from the rail (the list opens, the box has the keyboard); `pln cht`,
  held by no chat literally, puts *Plain chat* first with `Pl`, `n`, `ch`, `t` bolded and no lines; `res` puts
  *Wallet resolvers* before the newer *Arrest the drift* (a word's start against a word's middle, against the board's
  order); ↓ ↑ and ⏎; ⌥⌘F again selects the query; Esc gives the order and the lines back; the cog lists the key.
  `day-separator` narrowed the list with the magnifier, which now drops the very lines it checks — it narrows by the
  project picker now, and its "a day closes under its only card" is the done card alone, the ready chip off.

## Decisions of 2026-09-24, small hours — the header's PR chips' edge is 1 px again

Ricardo: "with the background gradient, we can go back on the extra thick border for each PR on the chat header - aka
make it thinner again".

* **1 px**, as the cards'. The 2 px edge was there to make the chips stand out; the wash does that now. What stays
  from that change is the height (20 px lines, 11.5 px type) and the edge's strength, 85 % of the state's colour
  against the cards' 55 % — a thin line in the full colour frames the wash better than a faint one. `header-prs`
  expects 1 px.

## Decisions of 2026-09-24, small hours — the header's PR chips take the row

Ricardo: "seems like after 4 PRs, they are being collapse even if we have space on the bar - try to use all
real-estate and only collapse if its really close to the title".

* **Every chip is drawn; only what does not fit folds.** The cap of four (`HPR_CHIPS`) went. `fitHeadPrs()` measures
  the row — its width, the other things in it (a task's chip, `>_` while it warns, ···), the gaps — and hides chips
  from the end into `+n` only while the button would leave the title less than its repo name plus 160 px
  (`TITLE_ROOM`), 170 at the least, the title's own flex-basis, under which the row would wrap. One chip always
  shows. `+n`'s tooltip lists the folded ones. It runs on every draw of the header and on its `ResizeObserver`, so
  a window resize, the list's width or the split refit it. On the live board the twelve-PR admin-service chat now
  shows all twelve with the title whole.
* `scripts/scenarios/header-prs-fit.mjs`: a chat mentioning ten PRs shows all ten and no `+n` in a wide column;
  with the list widened to 1100 px some fold, `+n` counts them, the row stays one line and the title keeps its
  room; the list back at 380 px, all ten return.

## Decisions of 2026-09-24, late night — the header's PR chips get a wash

Ricardo: "the PRs on the header could have a bit of brackground gradient, to make it prettier".

* **A wash of the chip's own state colour**, deeper at the top left: 28 % of it over the panel fading to 7 %, the
  angle the cards' wash has. The state rules set `--prc` for both chips, and only the header's paints with it — the
  cards' stay plain. On the dark panel 28 % hardly showed, so the start is a theme token (`--prg`, 44 % there). The
  wash is built over the panel, so the tinted header needs no background of its own under the chips any more; `+n`
  has no state and takes the muted grey.

## Decisions of 2026-09-24, late night — no strip under the header for the PR in front of you

Ricardo: "when a PR is open in web, there a row at the top (below the header) with extra PR info (branch, etc.) ->
remove it".

* **The strip is gone, and so is what fed it.** `#prbar` said what `gh pr view` knew about the PR you had clicked —
  state, review, checks, size, head → base, the author — in a row under the header, over the page that says all of
  it. The page no longer asks, so the server's `GET /api/pr` and its `prView()` cache went too: one `gh` call per
  click less, and the only `gh` left is the batched GraphQL for the cards' titles and states. The running server
  keeps the route until its next restart; nothing calls it.
* **What stays is which PR is in front** (`shownPr.url`, `peix.state().pr` — `prbar` before), for ⌥⌘G's picker to
  mark *current*. `hotkeys`, `pane-tabs` and `header-prs` read that instead of the strip, and the last two check the
  strip is not there.

## Decisions of 2026-09-24, night — the header's buttons go under ···

Ricardo: "on the chat top bar, every icon that's on the right should live under a discrete '...' borderless button".

* **The row is the title, the PR chips, a running task's chip and ···.** The claude session, VS Code Web, open in
  VS Code, focus view, the code fold and the state dot with its age (the details fold) are rows of a menu under a
  borderless ···, each with a word and, on the right, its key or its state (*on*/*off*, *show path*). The VS Code
  mark became an information row there. The task chip stayed in the row: it is not a button but news, like the PRs.
* **The menu is a non-modal `<dialog>`**, for three things the board already does for dialogs: the pane goes down
  while one is up (a GitHub page in the app is a native view and would cover the menu), Esc closes it without
  leaving full screen, and it is out of the header's markup, so the header's redraw on every update does not close
  it. Toggles leave it up and redraw their row; actions that go somewhere close it; so do a click elsewhere and any
  hotkey — a menu should not swallow ⌥⌘K the way a picker does. The buttons kept their ids, which is what the hotkeys
  and the scenarios reach them by.
* **`>_` comes back into the row while it has a warning** — armed for a take-over (*sure?*) or failed. The take-over
  is two presses, and a *sure?* folded under ··· would have made ⌥⌘C's second press a guess. A note about a folded
  button (a failed VS Code open, focus view with no claude) is anchored at ··· instead of at an invisible button,
  and the two VS Code rows now say their failures in a note too, since their words are out of sight.
* **Found on the way**: a click on a toggle redraws the menu under it, so by the time the click reaches the page's
  "click elsewhere closes it" handler its target is detached, and `closest('#hmenu')` from it finds nothing — the
  menu closed on every toggle. The handler reads `composedPath()`, which keeps the path the click took. And
  `show()` focuses the first row, which then wore a focus ring nobody asked for; the menu drops that focus.
* `scripts/scenarios/head-menu.mjs`: the row's only buttons are the PRs' and ···, ··· borderless and last; the chips
  22 px or taller with a 2 px edge; the menu right-aligned 4 px under ···, the actions by their ids; a toggle keeps it
  up with its new state, details show the path; Esc, a click elsewhere and ⌥⌘K close it, the last opening its picker.
  Looked at on the live board — a stale chat only — light and dark.
* **A slip, owned**: while checking the PR chips earlier the same evening, a headless page opened
  *chain-service*'s chat, which has a drawer, and resized its holder to 179×46. Nothing was typed into it and
  nobody was watching it; the next time the app attaches it refits to its own size. The screenshot scripts now open
  only chats with no process.

## Decisions of 2026-09-24, night — the header's PR chips stand out

Ricardo: "make the PRs on that top bar take a bit more vertical space and with a ticker border to be more visible".

* **Taller, and edged in 2 px** — 20 px lines, 11.5 px type, the edge at 85 % of the state's colour against the
  cards' 55 % (`--prb`, which the shared rule reads with the cards' value as its fallback). The cards' chips are
  unchanged. `header-prs` holds them to 22 px or taller with a 2 px edge.

## Decisions of 2026-09-24, evening — a quieter foot, one row atop the list, the header's PRs folded

Ricardo: "make the cog cleaner by removing the border and the vertical separator from the credits. also, mke that
bottom row a bit smaller vertically", "a the top of the column, we have 2 rows, but we could use just 1: remove the
cards counter, the new chat should be a + icon only", and "on the chat header, make PRs appear compact as they do on
cards and on click, they toggle to the expanded version per row that we have now".

* **The foot is quieter and shorter.** The cog lost its button border (the open state is its accent colour alone)
  and the cell lost the rule between it and the usage — on the rail the rule above it too; the cell's hover wash is
  its only outline. Folded, the foot is 34 px (44 before): the cell's padding 8 → 5 px and the cog's 5/8 → 4 px, the
  usage's 7/8 → 5/6 px, and the open rows a pixel closer. The usage starts 6 px from the cell rather than 12, since
  nothing divides them now. `usage-bar` holds the foot to 34 px at the least.
* **One row atop the list.** The filters moved into the head: the fish, the project (square, name, ▾, ×), the
  magnifier, the three state chips, ＋ and «. The head's count went, as asked — the chips count by state anyway.
  ＋ is an icon alone: one folder starts the chat there, a named project over several asks which folder, and ALL is
  ⌥⌘N's flow (which project, its open chats, ＋ a new one) — the pick-list of every folder is gone with the words.
* **The chips had to shrink to fit.** At the default 380 px the row with the words — *ready 153 · clauding 3 · done
  102* — left the project's name no room at all, and the name is the cue this row is for. So a chip is a dot in the
  state's colour and a count, filled while on and a ring while off; the word is in the tooltip always and on the chip
  once the list is 600 px wide, and under 340 px the counts go too (container queries on `#sessions`). The fish is
  24 px in the head, the buttons a little narrower. Even so a long name ends in … at 380 px (*notificat…*), and with
  every chip at its narrowest the name had 4 px at 270: **the list's minimum is 300 px now** (260 before), where it
  has 34. The magnifier's box, open, takes the chips' place rather than the name's.
* **Found on the way**: `.colhead .n`, the head's count pill, also styled the chips' counts once they were in the
  head, and `.colhead .t` is `display: flex`, which no `text-overflow` reaches — the name was cut mid-letter instead
  of ending in …. The pill is gone with the count; the name is a block.
* `project-cue` checks the one row: the magnifier, the chips, ＋ and « in the head, the cards straight under it, ＋
  with no words, and ＋ on ALL opening ⌥⌘N's first step.
* **The header's PRs are chips, and the rows are what a click on them unfolds.** One button in the header row holds
  the cards' chips — `#n` in the state's colour, four and a `+n` (a chat here mentions up to twelve) — and a caret; a
  click shows `#prlist` under the header, the rows as they were, and a second hides it. The fold is a pref, so a
  review you keep open stays open from chat to chat, and folded is the default: the rows took a line per PR under
  every header before. The rows are still rendered when folded, which keeps ⌥⌘G's list and the harness's
  `#prlist .prrow` as they were. On a tinted header the chips sit on the panel — green or purple on a project's
  colour was unreadable on half the projects. `scripts/scenarios/header-prs.mjs`: chips in the header row and the
  rows folded; a click unfolds, a reload keeps it, a row opens its PR, a second click folds; no PRs, neither.

## Decisions of 2026-09-24, later still — the projects column goes

Ricardo: "so the first column ends up not being used and it's taking space. I use more the hotkeys and I just want
visual cues that a project filter is done or not. so remove the entire 1st column and make the project cue on the 2nd
column open the project select (P hotkey). leave the app icon at the top on the old 2nd column (after this refactor
should be the only colunm)".

* **No projects column.** `#projects` is gone with everything only it had: the strip and its full width
  (`projectsCompact`, dropped from saved prefs), its name filter, its rows' counts, the drag that pinned. The chat
  list is the board's one column beside the chat.
* **The list's head is the cue.** The fish first — the app icon, still the SSE light —, then `#stitle`: the
  project's square, its name, ▾ and its count. A click anywhere on it is ⌥⌘P's picker; **×** beside any project but
  ALL goes back to ALL. With the edge and the head's tint already in the project's colour (ALL's black), a filter
  that is on reads from across the room, and the × is the one thing that says *this is a filter* rather than a title.
  The square there is only a colour now — a click on it is the picker, like the rest of the head; picking a colour
  is the chat header's square, which has done it since 2026-09-22. On the rail the head is the fish and the square.
* **What only the column's rows did moved into ⌥⌘P**: ✎ on a named project opens its editor (three on this board:
  web-clients, site, shop-backend), and ＋ new project closes the list, never filtered out, like ⌥⌘N's
  ＋ clone. **Pins were not moved**: the five pinned folders still head the pickers in their order, but nothing on
  the page pins or unpins any more — `PUT /api/pins` still does. Said so to Ricardo rather than guessed at.
* **The cog stays in the window's bottom left corner**, now the chat list's: `#sfoot` is the cog's cell beside the
  usage (under it on the rail). The corner pixel belonged to the list's 4 px coloured edge, not the cell, so the cell
  is drawn over the edge (`margin-left: -4px`) and carries the edge on its own border — the pointer thrown into the
  corner still opens the popover, which opens beside the cell. The folded usage and the cell are one 44 px row.
* **A select is as wide as its widest option**: `+ new chat in…` on ALL took 180 px for a long folder name and cut
  the project's name to `AL…`. It is 128 px wide in the head.
* `scripts/scenarios/project-cue.mjs`: no column; the fish heads the list; the head says ALL with no ×, opens the
  picker on a click, names the project chosen with × beside it, and × is ALL again; ✎ on the one named project and
  nowhere else, opening its editor; ＋ new project last, opening an empty one; on the rail the head is the square, and
  it opens the picker; the bottom left pixel is the cog's, rail or not, and the popover opens 8 px beside the cell.
  `usage-bar` expects the foot as one row — four rings wrap to a second line beside the cog at the fixture's width,
  so it asserts the cell and the usage are level and as tall, 44 px at the least. `hotkeys` waited
  for the oracle folder's row in the column; it waits for the pin now. Looked at on the live board, light and dark:
  ALL, a project, the picker, the rail, the popover.

## Decisions of 2026-09-24, later — the usage spends in orange

Ricardo: "make the credits used color green -> orange".

* **Orange, red from 90 %.** Read as the colour of what is spent — the bars were green, and green is all this
  account's numbers ever showed: every bar and ring is `--spend` (an orange of its own, one per theme — the accent
  is too near the red), red from 90 % as before. The amber step at 70 % went: amber under orange would have read as
  a step *down*. `usage-bar` expects it.

## Decisions of 2026-09-24 — the plan usage is the chat list's footer

Ricardo: "move the credits from the cog to a permanent bottom bar on 2nd column, make it compact and pretty (and
collapsable)".

* **Always in view, under the chat list.** `#usage` is the fourth row of `#sessions`; the cog's popover is the
  notifications switch and the keys now. Hovering to read a number was the popover's cost, and the number is the one
  thing on it that changes while you work.
* **Compact: a row per window at 11 px**, one grid for all of them (subgrid rows) so the bars start and the percents
  end in one line: the window's name, a 5 px bar — green, amber from 70 %, red from 90 %, the thresholds the popover
  had —, the percent in ink and the time to the reset, short (`4h 3m`, `3d 19h`; the date is on hover). Three windows
  come to 96 px.
* **One thing the popover did not have: a tick on each bar where the window's clock stands** — 57 minutes into five
  hours is a tick at 19 %. A bar that has run past its tick is being spent faster than the window is passing, which
  is the question the percent alone leaves you to work out. Only for the windows whose length is known (the five
  hours, the weeks); a credit grant has no clock and no tick.
* **Collapsible: the heading or its chevron folds it to one line of rings** — a conic ring per window, its short
  name (`5h`, `week`, `Fable`) and the percent. Folded, the bar is 44 px, `#pfoot`'s height, so its top rule and the
  cog's run across the window as one line. The fold is a pref (`usageFolded`), so it stays folded across reloads.
* **On the rail (⌘B) the rings stack**, 32 px with the percent inside, whatever the fold says — the rail has no room
  for rows and no reason to lose the numbers. The markup holds both shapes and CSS chooses, so neither the fold nor
  ⌘B re-renders anything.
* **Asked for on its own now**, not on hover: on load, every two minutes while the page is in view, once a window's
  reset has passed since the last answer, and on the way back to a page that was hidden. The server's one-minute cache
  still caps it at one call a minute however many pages are open. A tick every 30 s re-renders the countdown and
  assigns nothing when the markup has not changed, so a tooltip that is up stays up.
* **Failures back off** — twice as long each time, to half an hour. The first ask on a Mac can be a keychain prompt,
  and a refused one would otherwise have been put back up every two minutes, all day. A failure keeps the last
  numbers, dimmed, with the error on hover; with none yet, the bar says the error.
* **`USAGE=off` hides the bar**: the server's 503 carries `off: true`, and the page keeps no bar for a lookup that was
  turned off. Every test server runs so, so no other scenario sees it.
* **`#sessions`' rows are placed by hand now**, the chat column's rule: the rail hides `#filters`, and with a fourth
  row the list would have slid into the `auto` row and the bar into the `1fr`.
* `scripts/scenarios/usage-bar.mjs`: against a faked `/api/usage` (a script the page runs before its own) — hidden
  under `USAGE=off` and gone from the cog; four rows in the three colours; ticks at half way where the window has a
  clock, none on the credit; the fold, level with the cog row, surviving a reload; the rail's stacked rings, which a
  click does not unfold; a failure after numbers (kept, `.stale`, the error in the title) and one before any (the
  error itself). Looked at on the live board, light and dark: open, folded and on the rail.
* **Seen once, not chased**: `card-signals` failed its rail step (`['SR', 'T', 'PE']`, the order of the rail's short
  names) in one `npm run scenarios` run and passed on the retry and four runs after it. The usage bar is hidden on
  test servers; the step reads the cards' order, which this change does not touch.

## Decisions of 2026-09-23 — notifications get a switch in the cog

Ricardo: "are system notifications working? I like the notification when claude has finished or is asking me a
question/prompt. let me turn on or off notifications in the cog settings".

* **They were working.** The app's log for 2026-09-22: 114 alerts, 47 of them while the board was not in front, and
  47 `notify: UN add ok` — every one posted through UserNotifications, none fell back to osascript; the permission is
  `authorized` (2). The other 67 were *meant* to be silent: the app posts nothing while its window is key and the app
  active — the board in front is where the alert would have sent you anyway. Seven of the 114 were `needs-input`, the
  registry's `waiting` (2026-09-22) at work.
* **One switch, and it is the server's.** Not a pref: the app posts its banners from the alerts it hears on its own
  bridge, a browser tab posts its own, and a server run without the app posts through osascript — three posters, one
  Mac, so the setting belongs in `state.json` (`notifications`) where all of them read the same word. `PUT
  /api/notifications {on}` sets it and a `notifications` event tells every page; the snapshot carries it.
* **Off is quiet, not silent.** Every alert still goes out, flagged `quiet: true`: the unread counts on the cards and
  the Dock badge go on counting, and the posters skip the banner — main.swift (`quiet` on the bridge's message), the
  page (`onAlert` returns before `Notification` and the old `sound` beep), the server (`nativeNotify` guarded). A
  missing flag reads as loud, so an older app against a newer server, or the other way round, still notifies.
* **One switch, not two.** Replies and questions share it: what was asked for is a way to turn them off, and a
  question with no banner is still a blinking card.
* A browser tab that has never been asked for notification permission is asked when the switch is turned on; the
  app has its own, granted to the app.
* **Found on the way**: the usage's messages (*usage: asking…*, a keychain failure) wore `.note` — the class of
  `note()`'s popup, `position: fixed` — so they floated over the popover's top instead of sitting in it, over the
  new switch every time the popover opened, and any `note()` elsewhere deleted them. Renamed `.unote`.
* **A card no longer says *terminal here*** (Ricardo: "remove the 'terminal here' from cards as that is the norm and
  becomes cleaner"). The chip is kept for the exceptions — *CLI* (live in iTerm), *live*, *VS Code too* — and a card
  in a project column whose only chip it was loses the whole `.top` row. The chat header still names it.
* **A line per day in the chat list, named** (Ricardo: "instead use a per day divider and put the day there, using
  'today' for today (all cards up are from today) and the rest of the dividers, use 'DD-MM-YYYY'"). The one line
  where today ended becomes a line under every run of cards from one day, the day's name at its left and the fish
  still swimming left past it. *All cards up are from today* is the reading every line keeps: a line closes the day
  above it, so the oldest day in the list has its line at the bottom, and a list of today's chats alone ends in
  *today*. The list is grouped before it is dated — asking, clauding, ready, done — so a day can come back further
  down (a chat from today ticked done sits under older ready ones) and that run gets a line of its own.
* **…centred, and still** (Ricardo, the same day: "center the date (or 'today') and stop the animation, leave it
  static with the fishes"). The day sits between two equal boxes of `<><`, spaced as the swimming school was, the
  day included. With nothing moving, the lines are plain markup again — the kept nodes were only ever there so a
  re-render would not restart an animation. Each fish is its own item in a one-line wrapping row, so the ones that do
  not fit drop out of sight whole instead of being cut in half at the column's edge — a clipped glyph read as a stray
  `:` there. The fish between the clauding cards and the ready ones still swim.
* `scripts/scenarios/notifications.mjs`: a faked browser `Notification` counts banners — one for an alert while on,
  none while off with the alert still arriving `quiet`; the switch flips the server and the state file; the API
  flips the switch back (the event); a restart keeps it and a reloaded page reads it from the snapshot.

## Decisions of 2026-09-22, late night — a question is the registry's word, not the transcript's (committed 2026-09-23)

Ricardo: "the blink warning for cards that have claude blocked waiting for my response to a prompt is still not
working … when I check the chat, there's a prompt with some questions". The blink was right; what fed it was not.

* **The transcript hears of a question only with its answer.** The app's log has the proof: today's two
  `needs-input` alerts came one second after each AskUserQuestion was *answered* (peixairada asked 16:23:37 and was
  answered 16:24:36, alerted 16:24:37; scheduler asked 16:18:21, answered 16:25:04, alerted 16:25:05).
  Claude Code writes the assistant line that asks together with the tool_result — the timestamp inside it is the
  question's, the write is the answer's — so for the whole time the question was up the card read *clauding*: the
  last line was a tool call in flight. A permission prompt (Bash, Edit… awaiting approval) never reaches the
  transcript at all, which is the other half of "I think it's working, but there's a prompt". No reading of the
  transcript fixes that.
* **Claude Code says it itself, in the registry.** Since at least 2.1.278 every interactive claude rewrites its
  `~/.claude/sessions/<pid>.json` on each change of state with `status` — `busy`, `idle`, `waiting`, `shell` — and,
  while waiting, `waitingFor`: `input needed` (an AskUserQuestion, an MCP elicitation), `permission prompt` (the
  default for a dialog on top — a tool's approval), `dialog open`, `sandbox request`, `worker request` (read out of
  the 2.1.280 binary: `pme()` computes it, `Zbe({status, waitingFor})` writes it). **Measured on this very chat**
  with a sampler at 200 ms: the question went up at 22:59:02.8 and the registry said `waiting / input needed` at
  once; the board said `needs-input` 200 ms later and the alert went out; the transcript had no AskUserQuestion line
  for the four minutes the question was up, and got it — with the answer — at 23:03:00.8. The board already
  watches that directory for liveness; the status rides the same watch, 100 ms after the write. So `waitingOn(s)`
  is the chat's waiting-for when any live process on it is waiting, and `statusOf(s)` makes that `needs-input`
  ahead of everything, sub-agents included (the card's CSS already had a question beating both).
* **The registry is the word when it says anything.** A claude that reports a status and is not waiting is not
  asking, whatever the transcript's last lines say; the transcript's pending AskUserQuestion is only the fallback for
  a claude from before the field. Where both agree the transcript still gives the card the question itself; where
  only the registry knows, the card says what it waits on — *asking you — input needed*.
* **`dialog open` does not blink** (Ricardo, asked: "not dialogs"). It is mostly a slash command's dialog you opened
  yourself — /model, /config — at that terminal already; a few notices Claude raises share the label, and lose it.
* **The alert goes out as the prompt goes up**, from `loadRegistry` on the flip into waiting — and the old one, which
  fired when the question's line landed with its answer, is dropped by the answer (a system notification and an
  unread badge for a question you had just answered).
* `card-signals` has a chat blocked on a permission prompt whose transcript reads as work, and flips a live chat's
  registry file to `waiting` and back with no transcript line at all — the blink, the alert and its words, and no
  second alert when the asking and answering lines then land together.

## Decisions of 2026-09-22, night — six from a list: ✕, the second half, ⌘0, the day's rule, the header's colour, ＋ always

Ricardo's list, one commit each.

* **✕ on a ⌥⌘N row takes a project off the board.** The project step has listed every folder under `~/acme`
  since yesterday, which is the right list to start a chat from and the wrong one to keep reading: repos nobody
  works in, one-off clones, a folder made by mistake. Asked what ✕ should *mean* — the named project only, the
  folder into the Trash, or off the board — he chose **off the board**. So the key (a cwd, or `c:<id>` for a named
  project, the pins' own spelling) goes into a `hidden` list in the server's state file, `projectList()` and
  `freeFolders()` skip it, and that is all: no column row, no picker row, no pin. **No chat is hidden with it** —
  they are still there under ALL. Hiding a folder is tidying an index, not throwing work away, and a board that
  silently swallows chats is a board you cannot trust. The cog grew a line per hidden row with a *show* beside it
  (the only way back), and starting a chat in a hidden folder puts it back by itself: working somewhere again is
  the plainest way of saying it belongs.
* **A second tab opens in the second half, splitting the column.** Opening a PR, the editor or a zsh replaced the
  whole chat column with it — the thing you opened it *beside* went away, and getting both took ⌘2 and then the
  tab again. `openNewTab()` is the path for a tab that has just come into being; it splits the first time and puts
  the page in the right half. Only the first one splits: after that a new tab lands where the keys are, and
  choosing a tab that already exists never splits. The split the board makes itself is remembered apart
  (`autoSplit`) and folds back on its own once the chat is down to one tab — an empty half is what ⌘2 asks for,
  not what a zsh's `exit` should leave behind.
* **⌘0 keeps the half the keys are in.** ⌘W closes the one you are in; the mirror was missing, and ⌘0 is where a
  browser and an editor both put it. With one half there is nothing to close and the key is what it always was —
  the chat's size back to normal — so both meanings live in `hotOnlyHalf` rather than in two handlers that race.
  `"0"` joined the forwarder's list in main.swift, so it works with the pane up.
* **A second rule in the chat list, where today ends.** Inside a group the order is your own last touch, newest
  first, so today's chats sit together at the top with nothing to say where they stop. A second school of fish
  swims there, `<><` the other way, drawn at the first crossing from today into before-today wherever it falls —
  and not at all when there is none. `school()` builds both as kept nodes with an animation phased to the document
  clock: `innerHTML` would hand them a new animation every few seconds, which is a visible stutter.
* **The project's colour is a square in the chat header, on hover.** Changing it meant finding the project's row
  in a column that is a strip most of the time, while the thing the colour is *for* is the chat in front of you.
  The same `.sq.pick`, so the same picker, the same ⌥-click, the same write to `.vscode/settings.json`. It is
  inked only while the pointer is in the header but keeps its place in the row always, so nothing moves under the
  pointer as you reach for it.
* **The chats step shows even with nothing to choose from.** It used to skip itself when the scope had no chats,
  and the next step spawned a terminal with nothing in between: a folder you had never worked in, a fresh clone
  and an empty environment were each one keystroke from a running claude. Now it is ＋ alone, selected — ⏎ starts
  one, esc walks away.

### And one thing the split made visible

**The page's screen and the holder's drift on every resize, and nothing re-syncs them.** The flake `focus-view`
has been retried for two days is not the test's: the two emulators are fed bytes drawn for one size and read at
another, and they stay drifted until the next attach rebuilds the page's screen from the snapshot. Moving a live
drawer from one half to the other reproduces it on demand — which is how it was pinned down tonight. What reads a
screen then reads the wrong line (the focus-view button), and the fake claude, which repaints its live region at
an absolute row, eats a different transcript line in each. The scenario now re-attaches by reloading the page —
what the app does on every restart, and the one re-attach no resize can spoil — so the suite is honest again.
**The fix is still the one named on Saturday: after a resize settles, the page asks the holder for a fresh
snapshot and rebuilds its screen from it.** It is a change to the drawer's protocol and has not been written.

## Decisions of 2026-09-22, evening — the harness: one command, a fast clock, and the flakes named

* **`npm run scenarios` runs all thirteen**, one at a time, in about a minute, with a line each and a verdict.
  Sequential on purpose: four servers and four Chromes on one Mac is how a suite starts failing on the clock
  rather than on the board, which is worse than a suite that takes a minute. A failure is run **once more**;
  passing then is reported `FLAKY` *with what it failed on the first time*, and the suite still exits 0 — a
  browser scenario that passes on the second go is usually the machine. `--no-retry` is the gate for a bisect.
* **Every test server now gets a fast clock and an empty org directory.** The registry poll is what notices a pid
  that died, a chat that moved to a new session id and a background command that let its output file go; at the
  live ten seconds a scenario either waits half a minute or races it. `lib/testserver.mjs` sets it to 1.2 s (and
  `TASK_GRACE_MS` to 400 ms) for every scenario, and gives each server an `ORG_DIR` of its own under its state
  dir, so nothing can list the real `~/acme`. `meta.env` is spread last, so a scenario that means something
  else still says so. Three scenarios lost their boilerplate to this.
* **Two flakes were real and are fixed, and one of them was a bug in the board.** `drawer-clear` asserted that
  the old chat had gone stale the instant the board followed the process to its new one — that happens on the
  registry poll, so it is a wait, not an assertion; but with the wait it still failed one run in six, because
  **the chat a holder leaves was never pushed**. `linkTermToRegistry` told the chat the drawer moved *to* and
  nobody else, so the old card kept a drawer that had moved on until something unrelated happened to that chat.
  A flake worth chasing: `/clear` in a drawer is the ordinary way to hit it. `focus-view`'s read-back gave up two seconds after an attach and took **the first line it found**,
  which mid-snapshot is as often the older `/focus` line as the newer one — and a verdict equal to what the board
  already thinks *is* a verdict, so it stopped looking. It waits for the screen to stop growing and reads once.
* **One flake is understood and named rather than hidden.** `focus-view`'s last step still fails perhaps one run
  in three. The page's screen and the holder's are two emulators fed the same bytes, and a resize reaches them at
  slightly different moments, so they can drift by a line and stay drifted until the next attach re-syncs the
  page. The fake claude repaints its live region at an absolute row, so one line of drift makes its erase eat a
  *different* transcript line in each — measured: the page kept the newest `/focus` line and the holder did not,
  and the snapshot is the holder's. The fix is a re-sync after a resize settles, which is a change to the drawer,
  not to the test; until it is written the runner reports the flake with its reason, which is better than a green
  suite that lies.
* **lsof's silence is now audible.** `taskGone` shells out to `lsof`, which reads every process on the Mac and
  takes the better part of a second on an idle one; a run killed by the five-second timeout looked exactly like
  "still running", so a chip could sit on a card forever with nothing in the log. Fifteen seconds, `-w`, and a
  line in the log when it does not answer.

## Decisions of 2026-09-22, later — the split belongs to a chat, the rail, the blinking question, and a black pane

* **The drawer was sizing itself to its terminal instead of to the pane** (Ricardo: "you restart the FE and all
  chats are pulled up, so ~60% bottom is just black"). Mine, from the morning's split: a half's grid rows were not
  placed by hand, and a hidden tab strip is `display: none` — which takes it out of auto-placement and slides the
  body into the `auto` row. There it took its height from the terminal it held, so the drawer kept whatever height
  it was first drawn at, and straight after a reload that is xterm's own default of 24 rows. The same trap `#chat`
  has carried a warning about since the rows were placed there; the warning now covers both.
* **And underneath it, a real one: a terminal that grows has to pull its scrollback back down.** xterm only takes
  that path when the cursor is on the *last line of the buffer*, and Claude Code's never is — its live region is a
  box with the prompt in it and three status lines under it, and the cursor stays in the box. So every grow appended
  that many blank rows at the bottom instead, and the session stayed pinned to the top for good. `lib/refit.mjs`
  parks the cursor on the last line for the length of the resize and puts it back after, which is enough to take
  xterm down the scrollback path; the holder and the page both do it, and `test/refit.test.mjs` includes the case
  that fails the old way round, so the test means something. A drawer started before any xterm exists also asked
  for a fixed 120×30 and had to grow out of it — it asks for the last size this browser fitted now.
* **The split is the chat's, not the board's** (Ricardo: "the pane splitting should be chat, not a general
  setting"). A PR beside its terminal is something you want for the review you are doing; carrying it into every
  chat you then open is noise. `splits` is a set of chat ids, alongside the `tabs` map and for the same reason —
  it lasts as long as the chats do, not across reloads. Only the divider's place stays a board preference.
* **A question blinks the border instead of running a light round it** (Ricardo: "a card that's waiting my input …
  should flash the boarder instead on having the go-around animation"). Every other signal on a card is motion
  around the edge, and a question is the one state that is *stopped* — so it gets the one signal that is not
  motion. Two hard states, not a fade: a fade reads as another kind of running, which is what it was doing.
* **Folded, the chat list is a rail of squares** (Ricardo: "small squares with only the project they are in, with
  initial … in these condesed view, keep the visual cues for running, agents, etc."). One per chat: the project's
  short name on a solid tint of its colour, and the card's own edge, so clauding, the agents' count, a monitor and
  a question all still read from a 58 px rail. The short name is the initial of each part of a hyphenated name, or
  the first two letters of a single word — NS, AS, MS, FC come out right on their own — and `PROJECT_ABBR` carries
  the ones whose spoken short name is not that (backend is BE, wallet-api is WAPI), by hand, like `PROJECT_ICONS`.
* **A class name that is also a selector is a trap.** A background command's chip wore `card` as a placement
  marker that nothing read, and `#slist .card` matched it — so ⌥⌘↑/↓ walked over a chip and opened nothing. The
  marker is gone and the walkers take `#slist > .card`.

## Decisions of 2026-09-22 — the chat column is one half or two, ⌘B folds the list, the pickers are centred again

* **⌘2 splits the chat column in two; ⌘1 and ⌘2 are the halves** (Ricardo: "cmd 2 should split the main chat in
  two, support opening the terminal/editor/chat/github in both paths — cmd 1 and 2 should move focus to left or
  right panel, respectively"). Asked whether the right half should be able to hold *another chat*, he chose the
  smaller thing: both halves belong to the open chat and pick from its own tabs — the claude session or the
  transcript, the zsh, a GitHub page, the editor. One selection in the list, one transcript, two tab strips.
* **A tab lives in exactly one half.** There is one transcript element, one xterm per half and one web view per
  page, so showing a tab twice would mean duplicating whichever of those it is. Instead, choosing in one half what
  the other is showing makes the two **trade places** (`setTab`) — which is also how you move a tab across: click
  it in the strip of the half you want it in. The other half's tab is dimmed in your strip (`.ptab.away`), not
  hidden, so the swap is offered rather than hidden away.
* **Where things are is derived, not stored.** `tabs` keeps `[left, right]` per chat and `placeOf(s)` reads it
  against the tabs the chat actually has now: a key that is gone falls away, the left half takes the first tab
  left, and the right half fills with a spare one while the column is split. So a zsh that starts while the right
  half is empty simply appears there, and a zsh that ends leaves no dangling half.
* **The empty half says what would fill it** rather than showing a blank panel — ⌥⌘T, ⌥⌘G, ⌥⌘E, or a tab from the
  strip above. ⌘2 on a chat with nothing but its transcript is a legitimate thing to do; it should not look broken.
* **The split is the board's, the placement is the chat's.** `prefs.split` and `prefs.splitAt` (the divider) are
  per browser, like the column widths; which tab is in which half is per chat, like the tab was before.
* **⌘W closes the half the keys are in** (Ricardo: "cmd W should close the focused pan[e]"), the way it closes an
  editor rather than a window, and each strip's ⨯ closes the half it sits in — so the mouse and the key say the
  same thing. What the column keeps is the *other* half's tab. With one half the board has nothing to close, so
  ⌘W is the window's own key again; with a picker up it closes the picker, which is what ⌘W does to a panel.
  It has to be the Window menu's item in the app: a key equivalent is dispatched before any responder, so ⌘W
  never reaches the page. `closeHalfOrWindow` asks the board and calls `performClose` only when the answer is no,
  which is why every hotkey now returns whether it took the key.
* **The app's pane is now an overlay over the whole window**, with each page's web view placed inside it from the
  rect the board gives it, instead of one view pinned to the chat column. That is what lets both halves hold a
  page at once. It has to let clicks through where no page is (`PaneOverlay.hitTest`), and the ⌘F bar is placed
  from the focused page's rect rather than pinned to the pane, so it follows ⌘1 / ⌘2.
* **⌘B folds the chat list** (Ricardo: "cmd B should toggle colapse of 2nd column") — the switch the « button
  already was, on VS Code's key for the same idea. Plain ⌘ chords get their own map (`CMDKEYS`) beside the ⌥⌘ one,
  because the modifier says what the key is about: ⌥⌘ is *this chat, over there*, ⌘ alone is *this window, this
  shape*. The shell's forwarder carries both now, so the keys work with a page in the pane.
* **The pickers are centred again** (Ricardo: "hover menu … is not centered when there's a webpage open. make it
  always centered"). The pane is a native view over the chat column, so a dialog centred on the board opened
  underneath it, and the picker used to sidle into whatever strip of board was still showing — off to one side and
  narrower than it is anywhere else (`#pick.aside`). Lowering the pane for as long as a dialog is up is the better
  trade: `postPane` sends no page while one is open, the shell hides the view and hands the keyboard back, and
  every dialog's close puts it back. Nothing reloads — the web view is only hidden.
* **Checks**: `scripts/scenarios/split-halves.mjs` (two live terminals side by side, the trade, the fit of each
  half, ⨯ leaving the focused half) and the split section of `pane-tabs.mjs` (two pages placed side by side in one
  `pane` message, with the focus). `ctx.cmd(code)` in the runner is the plain-⌘ press.

## Decisions of 2026-09-21 — the card's edge says which kind of busy

* **Four readings, one mechanism** (Ricardo: "would be great to have different Card signaling for: normal claude
  work · a monitor is still running · N sub-agents are running · claude is asking me something via multiple-choice
  and waiting"). The card had two states in its edge — a running light or nothing — and everything else was a word
  somewhere: *asking you* in small red type at the bottom, an *N agents* chip on the title row, and nothing at all
  for a monitor. They are now the same ring with three variables: `--lit` (what runs), `--seg` (how much of the
  edge one light owns) and `--spins` (how fast). Clauding is the project's colour, one light. N sub-agents are N
  lights, `--seg: 100% / N`, so a card at work with three agents out is countable across the room. A monitor is one
  light in the watch colour at a sixth of the speed. A question is the whole edge in red, breathing instead of
  running — motion says *this one is stopped*, which is the opposite of everything else on the board.
* **The three CSS rules are in priority order**, because a card can be more than one thing: work beats a monitor
  (a chat clauding *and* watching shows the work), a question beats both. The states are otherwise independent —
  a *ready* card can carry a monitor's ring, which is the whole point of having one.
* **A monitor is something the board could never see before.** Claude Code leaves work running behind the turn —
  `Monitor` watches something and wakes the chat on each event, a `Bash` with `run_in_background` runs on and
  reports when it exits — and until now the turn ended, the card went ready, and a chat watching a CI run looked
  exactly like a chat that was finished. The transcript had it all along: the tool_result of the call carries the
  id the harness gave the task ("Monitor started (task bs6h9ok2c, expires in 30m…", "Command running in background
  with ID: b3b928ii6"), and every event and the end arrive as `<task-notification>` lines. Those lines were already
  dropped as synthetic — rightly, they are not your words — so they are now read *before* that drop, for their
  `<task-id>` and the `<status>` that ends one.
* **Nothing is polled and nothing is trusted forever.** A task belongs to the claude that started it: one older
  than `live.startedAt` (the chat was resumed — the old process took its tasks with it), past a Monitor's own
  expiry, or in a chat with no live process at all is not running, and `runningTasks` drops it on the next summary.
  The ten-second loop that already lets a quiet sub-agent go now also pushes when a task expires, because a chat
  whose last word was "monitor started" has nothing else to push.
* **The question goes on the card.** `s.ask` — which tool asked, what it asked, how many answers it offers — is
  carried only while the status is `needs-input`, so it cannot go stale. The card reads *asking you: Which database
  should the service use?* with *3 answers* beside it, which is often enough to answer without opening the chat.
* **Every rule of the ring sets every variable of it.** A card can be two of these at once — clauding *with* a
  monitor of its own is the ordinary case — and the priority order only decides what the *later* rule says, not
  what it leaves out: `.card.working` gave no `--spins`, so the work light ran at the monitor's sixth of the speed.
  Found on the live board, on the board's own chat, which was both while this was being written; the scenario has
  a fifth chat that is both, to keep it found.
* **The asking card leads the list** (Ricardo, on being offered it: "yes, update the RANK"). It was the one state
  whose card you might not see: a question sorts by your last touch like any ready chat, so it could sit below a
  dozen others while Claude waited. `RANK` gained a step above clauding (`asking: 0`) and `rankOf` — the sort's
  view of a chat, where `bucket` stays the filters' — puts it there, in the column and in ⌥⌘K alike. Above
  clauding, not below it, because it is the only state that costs you a second and unblocks a whole turn. The
  fish still swim where they always did (the last clauding card, the first plain ready one): they mark that
  boundary by the same rank, and an asking chat is no longer a 'ready' for their purposes.
* **A task's end does not reliably reach the transcript at all** (found on the live board, Ricardo: "why is this
  chat card hand the slow teal? I don't see a mention on having a monitor running"). The start does — four seconds
  after a real background command in the board's own chat, `/api/sessions` had it with the harness's wording and
  the description. The completion notice does *not*, when it is delivered to a chat that is mid-turn: the two test
  jobs in that chat ended, and half an hour later their `<task-notification>` was still not a line in the file.
  (The ones in older transcripts are there, as ordinary user lines — those went to a chat sitting idle, where the
  notice *starts* a turn and is written as its prompt.) A board that only read the transcript would have shown that
  chat as watching until `TASK_MAX_MS`.
* **So a background command is asked about directly.** The harness spawns it with its output redirected to
  `tasks/<id>.output` and holds that file open until it exits — measured on a running job: two holders, and none
  the moment it ended. `taskGone` runs `lsof -t` on the file (the path comes from the tool_result, "Output is being
  written to: …"), and `sweepTasks` on the registry poll lets go of what nothing holds any more. Only after
  `TASK_GRACE_MS`, since the file exists before the process has opened it, and never on lsof's own failure: the
  verdict is "no holders", not "no answer". A Monitor names no file, so it keeps the two signals it had — its
  events and end do reach an idle chat's transcript, and it expires by itself.
* **The first "live proof" of that sweep was no proof at all.** The board's own chat did drop its two stale tasks
  seconds after a restart, which looked like the sweep working; it was the *tail window*. That transcript is 9.7 MB
  and the board reads the last 512 KB, so on the re-index the lines that started those tasks were simply out of
  view (`indexFile` rebuilds a session from the tail, carrying over only what the registry knows). Which errs the
  right way — a forgotten task is no chip — but it is not the sweep, and the sweep's proof is the scenario, where
  a real process holds a real output file and the task goes within one poll of it being killed.
* **Verified in the browser, both themes** (`scripts/scenarios/card-signals.mjs`): four chats, each with a live pid
  of its own (a `sleep` — the server only asks whether the pid is there), the server's `tasks`/`ask`/`agents` and
  then the cards built from them, down to `--lights: 3` and the chip text, and the monitor's completion taking its
  ring and chip away again. The fixture grew what those need: `toolLines`, `taskNoteLine`, `replyLines` and a
  `live` registry file (`scripts/fixture.mjs`). `peix.sessions()` — the harness's reduced view of the board —
  carries `agents`, `tasks` and `ask` now; the first cut of the scenario failed against it, not against the code.

## Decisions of 2026-09-21 — a project is a folder in ~/acme, or a repo to clone

* **⌥⌘N's project step lists the folders too** (Ricardo: "adding a new project is a bit cumbersome: we should
  present all folders locally on ~/acme and to add a new one, assume it's an acme organization git repo, clone
  it to ~/acme and open a new chat"). A project on this board is a folder some chat ran in, which is a fine rule
  for a board of the work in flight and a poor one for *starting* work: the step could only ever offer a folder
  that already had a chat, so a repo you had not opened here was reached by leaving the board — a terminal, a `cd`,
  `claude`. The step now carries every folder directly under the org's directory that is on no project, after the
  board's own, with its path beside the name.
* **One name for the directory and the organisation.** `ORG` is `acme` and `ORG_DIR` is `~/acme`, the second
  defaulting from the first, because that is how this Mac is laid out: the folder you keep the org's repos in is
  named after the org. Both are env overrides, so a machine that does it differently says so once.
* **The folders are matched by their exact path**, so a repo whose chats all live in a *subfolder* of it — the
  wallet-api resolvers, oracle's own — is still offered at its root. Two rows with the same name, one of them
  showing a path, is the honest picture: they are two places to start.
* **A name that matches no folder is a repo you have not cloned**, and the last row offers to: `POST /api/clone`
  runs `gh repo clone <org>/<name>` into ORG_DIR and the ordinary new-chat flow carries on in what it cloned, so
  ⌥⌘N, a name and ⏎ is the whole of "add a project". gh, not git: it is already how the board asks GitHub about
  PRs, it knows the account's protocol, and it says plainly when there is no such repo. The row is never filtered
  out — it *is* what a query nothing matches is for — and it takes the query as typed, since a repository has a
  name and not a spelling.
* **This is the one thing the board writes outside its own state.** Everything else it does to `~` is reading, and
  `~/.claude` is never written at all. A clone is a new directory with a name the server checks against
  `/^[A-Za-z0-9][\w.-]*$/`, in one fixed parent; a clone that fails and left an empty directory behind takes it
  away again, so the next try is not told the folder is already there.
* **A long path goes beside the name, never in its own column.** The first cut put `~/acme/<name>` in the row's
  last (`auto`) column: that track is sized by the whole string — a percentage `max-width` on the item does not
  come into it — and the name's `1fr` collapsed to "＋ cl…". It reads `into ~/acme` inside the name span now,
  where the row's own ellipsis takes it, which is what the folder rows were already doing.
* **The hint is written twice**: the step opens before the server has answered, so the box first names no directory
  at all (`~`), and `loadFolders` writes it again with the rows. Verified in the browser —
  `scripts/scenarios/new-project.mjs` (its own ORG_DIR of three folders, the clone POST stubbed: the rows, the
  ranking, the clone row and the chat that follows both it and a plain folder) — and `test/folders.test.mjs` for
  the listing and what a clone refuses. `hotkeys` and `new-chat-flow` now point ORG_DIR at an empty directory of
  their own: `~/acme/oracle` exists on this Mac and would have competed with the fixture's oracle project.

## Decisions of 2026-09-21 — ⌘F searches the page in the pane

* **⌘F is find-on-page, for the pane only** (Ricardo: "I want to search inside github page like I do on browsers",
  then "cmd f"). A PR is a long page and the pane is a native `WKWebView`, which has the search — `find(_:
  configuration:)`, the very one Safari's bar drives — but no bar to drive it with and no key bound to it, so ⌘F
  did nothing in the app while it works on every GitHub tab in a browser. The Edit menu now carries *Find… ·
  Find Next · Find Previous* (⌘F · ⌘G · ⇧⌘G) pointed at the page on top of the pane.
* **The board is not searched.** The three items grey out through `validateMenuItem` while the pane is down: the
  board has the column filter boxes and the pickers (⌥⌘K, fuzzy since this morning) for finding a chat, and a
  find bar over the transcript would be a second, worse one. ⌘F with the drawer showing is left alone entirely —
  the key still goes to the page, as it did before.
* **The bar floats over the top right of the pane**, Chrome's place, not Safari's. Safari's bar pushes the page
  down; here that would mean moving the top constraint of every pane web view (they are pinned to all four edges
  of `prPane`, made one per page) for a bar that is up for a few seconds. It is a `NSVisualEffectView` in the
  *window's* content view — added after the pane, so a web view made later cannot cover it — with the `.popover`
  material, which reads in either theme.
* **No match count.** WebKit's `WKFindResult` says *whether* it found one, not how many: the count Safari shows
  comes from an API macOS does not hand out (iOS has `findInteraction`; the counting one is private). Rather than
  count matches ourselves in injected JavaScript — over GitHub's CSP, on a page it repaints under us — a miss
  turns the field's text red, which is the thing you actually need to know.
* **The match is the page's selection**, which is how WebKit's find shows it. So closing the bar has to drop the
  selection (`kDropSelection`), and a query that has just changed has to drop it *before* searching, or the next
  keystroke carries on from the last match instead of starting at the top (`runFind(fromTop:)`).
* **The find bar takes Esc and ⏎ back from the pane.** Esc with the pane up means "back to the chat" here
  (`peixKey('Escape')`), and in a text field it means "empty the box"; while the bar is up it closes the bar and
  stops — the browser's answer, and the local monitor that already owns Esc is where that lives. ⏎ / ⇧⏎ step the
  matches from the field, the keys the field would otherwise give to its own action. A pane change — a tab
  switch, the pane hiding — closes the bar; `findQuery` outlives it, so ⌘G brings it back on the same words.
* **Verified by hand in the app**: there is no harness for the native shell (the scenarios drive the board in
  headless Chrome, which has no pane), so this is `npm run check`'s `swiftc -typecheck`, `mac/build.sh install`,
  and a PR page in the pane.

## Decisions of 2026-09-21 — the pane behaves like a browser: ⌘R, pinch, and the address in the strip

* **⌘R reloads what is in front of you** (Ricardo: "when web (github) open, can we have: 1) cmd R to refresh the
  page"). The menu item reloaded the board whatever was on top, which with the pane up meant reloading the thing you
  could not see and leaving the GitHub page untouched. It now reloads the page on top of the pane while the pane is
  up, the board otherwise; the View menu's item renames itself (*Reload Page* / *Reload*) through
  `validateMenuItem`, so the menu says which one the key will hit. The strip's ↻ still drives the same view — this
  is the key for it.
* **Pinch zooms a page in the pane**, as in Safari: `allowsMagnification` on each pane web view, one line, off by
  default in a WKWebView (which is why it never worked). The board's own view keeps its ⌘+/⌘−/⌘0 zoom and is left
  alone — the two are different things, and magnifying the board would fight the terminal's fit.
* **The address of the page on top sits in the tab strip, and a click copies it** (Ricardo: "when web is open, make
  the url visible and copy'able"). A tab is labelled `repo#n`, which says which PR but not *where* in it you are —
  and a page in a native view has no address bar at all. The strip now shows the URL without its scheme (the tail is
  what changes: `/files`, `/commits`, a review), ellipsised on the left-over room, selectable by hand, and a click
  anywhere on it puts the whole URL — scheme and all — on the clipboard with a `note` to say so. A selection made
  inside it wins over the click: that is someone copying part of it themselves.
* **Where a page *is* comes from the shell, not from the key it was opened with.** Each pane web view gets a KVO
  watch on its `url` (`paneObs`, invalidated with the view when it is evicted) and every navigation — a link
  followed, a pushState inside GitHub — is reported to the board as `peixPaneUrl(key, url)`, carrying the key it
  belongs to, since the board may be on another tab by the time a load finishes. The board keeps them per key
  (`paneUrls`), so a tab switch and back shows the address it was left on; the shell also re-sends on every `pane`
  message, which is what gives the address back after a board reload. → `scripts/scenarios/pane-tabs.mjs`.
* **Headless Chrome has no clipboard**: `navigator.clipboard.writeText` resolves and `readText` comes back empty
  regardless, so the scenario stubs `writeText` and checks what the page hands it. The page keeps a textarea +
  `execCommand('copy')` fallback for a real browser that refuses the API.

## Decisions of 2026-09-21 — the pickers match the way fzf does

* **⌥⌘K matches fuzzily and ranks by how well it matched** (Ricardo: "I want S hotkey to fuzzy search non-done
  chats"; told ⌥⌘K already holds exactly that list with a literal filter, "keep K but make it fuzzy"). So no new
  key — ⌥⌘S is still free — and the matcher became the picker's one matcher, in every mode: the chat picker, the
  chats step of ⌥⌘N and ⌥⌘O, the projects, the folders, the environments, the PRs. With the box empty each list
  keeps its own order (the board's for chats, mention order for PRs, the Taskfile's for environments); with
  something typed the best match leads, because fuzzy without ranking is just a longer list.
* **Each word of the query is hunted inside *one* field**, not across a concatenated blob. The first cut searched
  `chatText(s)` — project, title, prompt, branch run together — and `wapi res` matched 92 of the 152 chats on the
  real board, spelling words out of letters borrowed from a title *and* a prompt. Field by field it is 54, and the
  wallet-api chats lead. Two words may still land in different fields (`oracle rollout` takes one from the project
  and one from the title), which is the whole point.
* **The scoring, in one line each**: a run of letters is worth far more than scattered ones; a letter starting a
  word is worth more than one inside it (that is what makes `res` find *res*olvers rather than a*r*r*es*t); a gap
  costs, capped, so a match that wanders the length of a prompt loses to a tight one; an earlier start wins a tie;
  and a field's worth falls off down the list (1, ¾, ⅗…) so a name or a branch beats a long prompt. Every place a
  word's first letter appears is tried as a start and the best wins — greedy from there, which is the one corner cut:
  `wapi` scores *w*allet-a*pi* rather than the slightly better *w*allet-*api*, and both rank well above the noise.
  A word that only scraped a match is worth nothing rather than something negative, which would have made the field
  weighting work backwards.
* **The column's own filter boxes stay literal.** Nothing there re-orders — the list keeps the board's order — so
  fuzzy would only widen the list without saying which one you meant. Fuzzy where there is a selection to rank,
  literal where the order is fixed.
* **Measured on the real board** (152 ready-or-clauding chats): 2–6 ms per keystroke, the whole list re-ranked.
  Checked in the browser — `peix` puts the peixairada chats on top, `oracle rollout` the oracle rollout ones,
  `wapi res` the wallet-api ones. The regression check is in `scripts/scenarios/hotkeys.mjs`: `pln cht` matches no
  chat literally, *P*l*a*i*n* *ch*a*t* leads, and the bolding comes back as `Pl`, `n`, `ch`, `t`.

## Decisions of 2026-09-21 — ⌥⌘N and ⌥⌘O end on a chat, not only on a new one

* **The new-chat flow's last step is a list of the scope's open chats, with ＋ new chat at its head** (Ricardo: "so
  N hotkey opens the project to open a new chat — but after selecting the project, we should allow choosing open
  chats (sorted by last interaction) with '+ new chat' as first option"). ⌥⌘N was a one-way street: project →
  folder → environment → a chat that did not exist a second ago, while the chat you actually wanted was two keys
  away on ⌥⌘K. Now the project step hands over to a `chats` step — that project's ready and clauding chats, ordered
  by *your* last touch (`byUser`, the board's one order), done ones out — and the first row carries on with the old
  flow. ⏎ with nothing typed still starts a chat, so the keystrokes that built one yesterday build one today;
  typing filters the chats and moves the selection onto the first match, and a name no chat has leaves ＋ alone and
  selected, which is exactly the moment you meant to start something new. A scope with no open chats skips the step
  altogether, the way a project with one folder skips the folder step.
* **⌥⌘O asks the environment first and then shows that environment's chats** (Ricardo: "same for oracle, we should
  show open chats with the option for a new one, scoped by env"; asked which order, he picked env-then-chats over one
  flat list). So the two keys differ on purpose: ⌥⌘N is oracle's chats whatever cluster they were started against,
  ⌥⌘O is *production-workload's* chats and a new one beside them. One flag through the flow says which — `then:
  'chats'` on the folder and environment steps, which ⌥⌘O sets and the + button never does.
* **The server remembers which environment a chat was started in** (`envs` in `state.json`, keyed by session id).
  The terminal has carried `task` all along, but only while it runs, and a cluster is what an oracle chat *is* about
  long after its drawer has gone — without the record ⌥⌘O could only ever list the chats open in a drawer right
  now. Written where the pid ties a terminal to its session (`noteEnv`, also on adoption, so a drawer from before the
  record gets one), pruned of forgotten sessions there, and read back on the summary as `s.env`. Asked whether to
  keep it live-only; Ricardo chose the record. A chat with none — a bare `claude` in the folder, or one that ran
  before today — shows under ⌥⌘N and under no environment, so the rollout is quiet: until a launcher's chat is
  linked, ⌥⌘O behaves exactly as it did.
* **The environment step counts what each environment holds, and the cards say which one they ran in** (Ricardo:
  "can we put a counter on 'not done' chats for each oracle env when doing the O hotkey?" and "on the oracle cards on
  2nd column, can we put the env somewhere?"). The counter is the column's own pills — clauding then ready, the two
  numbers that add up to *not done* — so the environment step tells you where the work already is before you pick
  one, in the language the projects strip has always used. On the card the environment is a label beside the folder
  name, not a bordered chip: the chips on the right of that row are about the chat's *process* (`cli`, *VS Code too*)
  and this is about where it runs, so it is drawn quietly, in the project's colour, and borrows the card's ink where
  the card is too dark or too tinted for that colour. It is also what pulls the card's top row into existence at all
  in a project column, where there is no folder name to sit beside — and it appears only where the server has a
  record, which is to say only in the folders whose Taskfile launches claude. Looked at in both themes.
* **Checked in the browser**: `scripts/scenarios/new-chat-flow.mjs` is the new regression check — three oracle chats,
  two of them recorded under environments, seeded into `state.json` and read back across a server restart; then ⌥⌘O
  on each environment (only its own chat, ＋ at the head, ↓⏎ opens the chat), ⌥⌘N on the project (all three, newest
  by last touch, each row wearing its environment), the filter moving the selection, and a query nothing matches
  starting a chat through the environment step — plus the environments' counts and the cards' environment labels.
  Screenshots looked at: the ＋ row reads `in oracle` for a folder and `task <env>` for an environment, because that
  column is the chats' environment column and a bare folder name read like one; and the card label lost its border
  after the first cut, where an unbordered chip on an uncoloured card and a bordered one on the open card were plainly
  two different things.

## Decisions of 2026-09-21 — the cog holds everything, and opens on hover

* **The settings popover is the plan usage and the keys, and nothing else** (Ricardo: "move the claude credits
  there and remove all the options that I don't need: so just hotkeys and claude credits for now"): the credits
  moved off the fish into the cog's card, still half again the size of the rest of it, with the live · ready ·
  clauding counts in its heading; out went *show empty & >30d*, *tool calls*, *fold code*, *sound*, *enable browser
  alerts* and *test alert*. The prefs behind them (`sound`, `showAll`, `toolsMode`, `foldCode`) are left exactly as
  they were saved and the code still reads them — all four are at their defaults on this board, and the chat
  header's `{ }` is still the fold for a chat — so nothing on the board moved; there is simply no control for them
  any more. The fish keeps one job, the SSE light: it is not a button, and its cursor says so.
* **The cog opens on hover, and the target is the whole footer** (Ricardo: "make the cog active on hover (it should
  cover everything until the bottom leftest pixel)"): the listeners are on `#pfoot`, the strip's footer row, which
  starts at x = 0 and ends at the window's last pixel — measured, 0 and 0 — so the pointer can be thrown into the
  corner and the card is there. The rest is the behaviour the fish's card had, moved over: a click on the cog pins
  it, leaving both closes it after 250 ms, Esc or a click away once pinned closes it too. Checked in the browser:
  hover opens, leaving closes, the pin survives a leave, Esc closes, and the popover holds no input, select or
  button at all any more.

## Decisions of 2026-09-21 — the usage card at half again the size

* **The plan-usage card that hangs off the fish is half again as big** (Ricardo: "make the claude credits hover the
  app icon 100% bigger", then "maybe 50% small now"): doubled first — 640 px wide, 24 px type — which was more card
  than board, so it sits at × 1.5 instead: 480 px wide, 18 px type, 9 px bars, the label, percent and resets columns
  with them. Every number in `.upop` is `.pop`'s times one and a half, and nothing else moved, because `.pop` is
  shared with the settings popover, which keeps the plain ones (checked after the change: still 12 px type, still
  410 px wide). It is the one popover with nothing to click in it, read at a glance from further off than anything
  else on the board, so size is all it wants. A `max-width: calc(100vw - 68px)` keeps the wider card inside a narrow
  window, which at 320 px was never a question. Looked at on the live board at both sizes: 480×185, three windows.

## Decisions of 2026-09-20, dawn — ⌥ composes again in the drawer, ⌘K clears it

* **⌘K clears the drawer, holder and all** (Ricardo: "why does cmd+K not work to clear the shell?"): because nothing
  bound it — the app's menus claim no ⌘K, the page claims only ⌘+ / ⌘− / ⌘0 and the ⌥⌘ family, and xterm.js acts
  on exactly one ⌘ chord (⌘A). Clearing on ⌘K is the terminal emulator's feature, not the shell's: ⌃L is zsh's own
  and keeps the scrollback, which is not what ⌘K means in Terminal.app or iTerm. The cheap version — clear the
  page's xterm — would have come undone on the next attach, because what a page is served is the *holder's* screen,
  serialized. So the holder learnt a `clear`: the page asks, the holder clears the screen it keeps and echoes the
  clear back, and that echo is what wipes the pages, all of them, in their right place in the output stream. A nudge
  follows so whatever runs repaints into the empty screen. `scripts/scenarios/drawer-clearscreen.mjs` runs a marker
  through a zsh tab, presses ⌘K, and then opens a *second* socket to the same drawer to read what a re-attach would
  be handed — the marker has to be gone from there too, which is the whole point of the holder's half.
* **Two things that cost time getting there**, both worth knowing. **xterm parses on its own schedule**: `write()`
  queues, and a `clear()` called straight after it wipes only what has been parsed — the tail lands afterwards and
  paints the screen back. The snapshot path already knew this (`screen.write('', cb)`); the clear goes through the
  same door now, on the holder and on the page. **And the first cut of the scenario measured a race, not the
  feature**: it typed `echo peixmark` and waited for the marker, but zsh echoes what you type long before it runs
  it, so the wait was satisfied by the *typed line* and ⌘K landed between the typing and the command. The holder's
  own log (`<state dir>/terms/<id>.log`, where a holder's stdout goes) is what showed the command running after the
  clear. The marker is `printf 'peix%s\n' mark` now: it can only reach the screen as output.
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
    here verbatim (see *Findings* below). Commits per item from now on (`166dac3` bundled the day before this).
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

* **`main` is 14 commits ahead of `origin/main`, nothing pushed.** Range `7aa56db..d5413bd`, all from the
  2026-09-19/20 session described below. Pushing is a deliberate choice left to Ricardo.
* **The working tree carries a *second* session's uncommitted work** on top of `d5413bd`: `server.mjs`,
  `public/index.html`, `mac/build.sh`, `README.md`, `CLAUDE.md` (≈335 lines). Do not discard or blindly
  commit it; review it. What it contains, from its own CLAUDE.md notes:
  * plan usage — `GET /api/usage` calling `https://api.anthropic.com/api/oauth/usage` with Claude Code's
    OAuth token from the keychain item *Claude Code-credentials* (the second network call in the app,
    `USAGE=off` disables it) — shown in a **settings popover behind a cog** at the bottom of the projects
    strip; the page header is gone with it (the window title bar carries the name);
  * the **chat list folds to a rail** (`sessionsCompact`, `«` in its header); **⌥⌘O** opens a modal
    project picker;
  * **a chat's PRs as rows under the chat header (`#prlist`)** instead of chips in it — note this overlaps
    with the per-card PR chips committed in `efc7348`; decide which stays;
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

## Findings — the working notes as they stood on 2026-09-27, before the slimming (moved verbatim)

The bullets of `CLAUDE.md` from *The board* to *Deliberately not done*, with their dates, quotes and stories, as the
file held them until the review of 2026-09-27 pared each to its invariant. Headings demoted one level.

### The board

* **Two columns** (2026-09-24; a projects column before): the selected project's chats → the chat. **The chat list's
  head is the project filter's whole cue** — the fish (the SSE light), then `#stitle`: the project's name (2026-09-27: no colour square — Ricardo, "remove the color picking on the
  filter next to the icon, and leave it to the chats" — and **nothing at all on ALL**, `hidden`: "we assume not having
  anything is the default All"; no ▾ since 2026-09-26), a click being ⌥⌘P's picker, and × back to ALL; the list's
  edge and the head's tint are the project's colour. **The head is one row** (2026-09-24): `#filters` — the magnifier, **a field as wide as
  the row leaves it** (2026-09-27, late, Ricardo: "the search icon on top, should take the entire space between the app
  icon and the ready counter"): at rest `#qBtn` spans the fish (or the project's name, `#stitle` being `flex: 0 1
  auto`) to the first chip; open, it is the left cap of `#q` (`width: 0; flex: 1 1 0`, or the box's own width pushes ＋
  and « out) and the chips stay where they were — and the state chips, a dot and a count (the word from 600 px of list, the count gone under 340;
  `#sessions` is a size container) — then ＋ (`#newChatBtn`: one folder starts it, several ask which, ALL is ⌥⌘N's
  flow) and «. The name is what gives way, which is why the list's minimum is 300 px. The colour picker is the chat header's. On the
  rail the head keeps the fish and, for a project, its short name (`projAbbr`, `.ab`) as the picker's handle. ⌥⌘P's rows carry what the column's did: ✎ on a named project (the
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
  chips beside the title say the numbers (`N agents`, `monitor`). **The ring is a conic gradient on a square
  `::before` turned by a `transform`, under an `::after` cover in the card's own background 3 px in** (2026-09-27;
  a registered property animated in place before — main-thread, repainted every frame, frozen under every transcript
  render): the compositor's kind of motion, in Chrome and in WebKit, and `phaseAnims()` puts every `ring`, `blink`
  and `pulse` at start time 0 on the document clock after each render, because every SSE update rebuilds the cards
  and a CSS animation starts over on a new node — or, with the cog's *rings in step* off (`prefs.ringsInStep`),
  at a time hashed from the chat's id: each card's own, as steady across renders. → `scripts/scenarios/card-signals.mjs`,
  Decisions 2026-09-21, 2026-09-22 and 2026-09-27.
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
  the plain panel header. **The colour square sits on the bar there** (2026-09-26; beside the name before), centred, out of the flow —
  positioned from `.shead` at the `.sep`'s x, since a square invisible at rest read as a gap wherever it took room
  — the same `.sq.pick`, so the same picker and the same ⌥-click — inked only while the pointer is in the header;
  nothing moves under the pointer. The h2's gap is 12 px, the header's padding, so the name has the same room either
  side and so does the bar. `colorAt` remembers which header the picker was
  opened from, so the answer (`note`) pops up by the square that was clicked. **Between the project and the title
  stands a 2 px bar in `--rink`, the header's whole height** (2026-09-26; a `/` before): black on a light colour,
  white on a dark one like acme's black, the page's ink on the plain header — `.shead h2 .sep`, an empty span
  holding the room, its `::before` positioned from `.shead` (top 0 to bottom 0, at the span's x) so the h2's
  `overflow: hidden` does not clip it.
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
* **A chat on Fable wears an F** (2026-09-27, Ricardo: "if the chat is using Fable, put a special marker on the
  card, like a star or a stylized F"): `onFable(s)` is `/fable/i` on `s.model`, the model of the chat's last
  assistant line (`claude-fable-5-1`, `claude-fable-5[1m]`…), and the mark is `ICON.fable` — an italic F with a
  spark, inline SVG like every card glyph — **last in the top row, after the ✓ / ↩** (`.top .fable`, the project
  name's height; the title row's end for an hour), in `--accent`, the card's own ink on the solid tint. The tick
  comes first so it takes the F's place when there is none; either brings the `.top` row into being on a card that
  had none (a folder project's), both 18 px tall there so the row is no taller. The rail does not show it.
* **The card's age stands in the top row, left of the ✓, under the pointer only** (2026-09-27, later, Ricardo: "the
  time since last update on the card should live left of the Done icon on each card", then "should only show on
  hover"; top left under the pointer for an afternoon, the title row's end before that): `.top .time`, 10 px, after
  the row's spacer and before the ✓ / ↩ and the F — the row's end reads time · tick · F. `opacity` 0 → .8 on
  `.card:hover`, keeping its room at rest, so nothing in the row moves when it comes. Every card has the top row now,
  18 px at least (the marks' height), so a tick appearing changes no card's height. The tooltip (last activity · you
  last wrote · Claude last replied) is on it. → `scripts/scenarios/card-marks.mjs` (the order, the F and the ✓'s
  place, the age).
* **Cards are square** (2026-09-26, Ricardo: "remove the round corners from cards"; 10 px before): `.card` and the
  ring its `::before` draws inside the border both at `border-radius: 0`. The PR chips keep their 4 px.
* **The open chat's card and a hovered one are a solid tint** of its colour (`.card.active`, `.card:hover`, 65 %
  since 2026-09-26, 55 % before), the rest a wash nearly as strong (45 % to 37 %, 2026-09-26; 22 % to nothing before)
  **under a plain edge** (2026-09-20 evening): only the clauding card, the hovered one and the open one wear the
  colour on their border. A black card's wash stays lighter (28 % to 20 %), for the same reason as below.
  **ALL** (the flat list, `key: 'all'`) is black in both themes — `BLACK`, through `projColor()` — and so is the
  `acme` folder (`PROJECT_COLORS`). A card in that black is marked `.card.black`: its solid tint is the black
  itself and it borrows the dark theme's inks, because 65 % of black over a light panel is a mid-grey nothing reads on;
  `--ring` turns its clauding light white wherever the card under it is dark (the dark theme, and the tint in either).
  **The open card bleeds into the splitter** (2026-09-26): `main:not(.scompact) #slist > .card.active` runs over the
  list's padding to the column's edge, and `#splitter` is `--open` on `main` — set by
  `tintChat`, the chat's colour or the grey of none — so card, bar and the chat's tinted header are one stroke.
* **A new chat has a card before its first word** (2026-09-27, Ricardo: "when I clear the chat or when I select new
  chat, I don't see the card until I press enter"): `visible()` shows a live chat with no transcript unless it is VS
  Code's (its restored panels, never prompted — the rule's original reason). The server's `startedAt` on a session born
  from the registry is the card's time and place — the moment the board first saw the id, not the registry's
  `startedAt`, which is the process's and survives a `/clear`; the process's start only at boot — carried over by
  `indexFile` when the transcript lands, the last fallback of `wordAt` (both copies), the card's `.time`. `openSession`
  on a chat the snapshot lacks renders the board from its fetch. → `scripts/scenarios/new-chat-card.mjs`, the card
  checks in `drawer-clear.mjs`, Decisions 2026-09-27 (afternoon, later).
* **A chat waiting on your answer first, then clauding, then ready, done last** (`RANK` / `rankOf`, the asking
  step added 2026-09-21), inside each group **by the last word, yours or Claude's** (`wordAt`: the newer of
  `lastUserAt` and `lastReplyAt`, 2026-09-27 — your last touch alone before, so a reply landing moved nothing; a tool
  call is not a word, so a clauding card does not climb with every step), newest first; a project ranks by its
  newest chat. The filters and every count still go by
  `bucket()`, where an asking chat is a ready one — only the order knows the difference, in the list and in ⌥⌘K. **The lines between the cards** (`.gsep`): between the clauding cards and the ready ones, **Claude's mark**
  in pixels, alone and centred — `DIVIDER`, plain markup: a 9 × 9 window on a strip of frames drawn from
  `PIX_SHEET` (the sheet in the source *is* the strip, `#` a pixel of 2 px), `pix` sliding it a whole frame at a
  time (`steps(1, end)` on every keyframe) so the star sits full, twinkles, shrinks to a dot and bursts back like
  Claude Code's spinner, and `pixhop` lifting it by whole pixels on the burst; both transforms, both 2.4 s, phased
  by `phaseAnims()` (2026-09-27, Ricardo: "remove the fishes and leave a claude icon animation in the middle", then
  "more "pixely", more fun"; a school of `><>` swimming right since 2026-09-20, kept as one node across renders;
  the smooth `ICON.claude` turning and breathing between two hairlines for an evening) — and a still line **under every run of cards from one day** (2026-09-23,
  `dayHtml()`, plain markup since nothing on it moves): the day centred — `today`, else `DD-MM-YYYY` (`dayName()`, by
  `userAt`) — alone on its line (2026-09-27; `<><` either side before, then two hairlines for an hour). A day's line closes the cards *above* it, so the oldest day in the list gets one at the bottom; the list is grouped
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
  columns, row 2 only; the native scrollbar is hidden while it shows, and it is `display: none` on the rail of
  squares. **At rest it is the thumb alone** (2026-09-26): 12 px wide flush against the list's coloured edge (`TL_W`;
  26 px and lined up under the fish and the cog before), the cards 8 px on from it, the thumb an orange pill
  (`--spend`, the usage bars' — beside the edge, not on it, so it reads on an orange project too), never under
  `TL_MIN` tall, wider under the pointer. The track in the state groups' colours and the tick per day went (Ricardo:
  "too close to the cards, it's green, it has the ticks for dates"): the divider and the day lines in the list say
  the same, and the labels say it in words, so they lost their coloured dot too. **To scale**: the rail's inner height
  is the list's `scrollHeight`, so a label is where its run starts in the list and the thumb is the window. A run
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
  coloured edge, as `#pfoot` is) to the cards' edge (`TL_CATCH`, over the list's padding) and, while the days are
  out, as far right as a label has reached plus 28 px (`tl.reach`, a high-water mark until the swell is back in) —
  so a gap between labels never closes it. A press there (right of the strip, on no label) is a press on the label
  ringed `.near`; a press on the thumb *as drawn* holds it where it was grabbed.
  → `scripts/scenarios/timeline.mjs`.
* **The plan usage is the chat list's footer** (2026-09-24): `#usage`, the fourth row of `#sessions`. Open, a row
  per window — name, a bar in `--spend` (orange; red from 90 %, `uColor`), a tick where the window's clock stands
  (`uPace`, only for the windows whose length `uSpan` knows), percent, time to reset; folded (`prefs.usageFolded`,
  the heading or the chevron), one line of rings — 20 px apart from 350 px of list (a container query on
  `#sessions`; 12 below it, where 20 would wrap the line, and everywhere before 2026-09-27) —, 34 px with the cog's
  cell beside it (`#pfoot`, in `#sfoot`; no
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

### Hotkeys and the pane

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
  ← / → the tab beside in the strip, wrapping (`hotTab()` → `openTab()`, the tab click's path), **1 / 2 the top and the bottom half of the chat column stood one over
  the other** (`hotGroup(g, true)`; see *The chat column's two halves*).
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
  goes over as `Digit<n>`. ⌘K is *not* here (the drawer's clear) and neither are ⌘+ ⌘− (`chatZoomKey`, which sees ⌘0 only when nothing is split). **⌥⌘1 / ⌥⌘2 are the one ⌥⌘ pair about the shape**
  (2026-09-27): the same two panes stood one over the other — the digit is the pane, the modifier the layout; see
  *The chat column's two halves*.
* **⌘W is the Window menu's item, not the forwarder's** (2026-09-22): a key equivalent is dispatched before any
  responder, so the page never sees ⌘W in the app. `closeHalfOrWindow` asks the board (`peixKey('KeyW','cmd')`)
  and calls `performClose` only when it answers false. Anything else the board wants to take off ⌘-something that
  a menu item already claims has to go the same way.
* **⌃⌘F is the board's own full screen, up to the notch** (2026-09-27, Ricardo: "fullscreen app on a macbook with a
  notch, we don't really use that upper real estate"): `toggleFill` in main.swift — the window borderless
  (`BoardWindow`: still key, and while `fill` not constrained back under the menu bar), its frame the screen's, the
  menu bar auto-hidden and **the Dock hidden, out only after the pointer has been held at its edge for 0.7 s**
  (`dockTick`, a 10 Hz poll of the pointer while filled; auto-hidden, the Dock came out under every touch of the right
  edge, where the board's controls are; hidden outright, it never came — Ricardo, both) — what Apple calls a *custom full-screen experience*, kitty's. **The system's full
  screen always sits below the camera housing** (its doc for `NSScreen.safeAreaInsets` says so; the strip is the
  auto-hidden menu bar's), so the window does not offer it: `collectionBehavior` is `.fullScreenNone`, **the green
  button zooms and `windowShouldZoom` makes a plain click on it the fill** (⌥-click and a title-bar double-click zoom
  as ever; 2026-09-27, later, Ricardo: "If I click on the fullscreen button (mac's green circle), I end up as
  before"). **The fill is remembered** (`peixairada.fill` in the defaults): a relaunch comes back filled. The page hears
  `peixFill(on, notch)` — the strip's height and the x range the housing covers, in CSS px, from `safeAreaInsets` and
  the two `auxiliaryTop*Area`s; null on a screen without one — on every toggle, screen change and board load, and
  `layoutNotch()` lays the top row around it: the chat list's head stays put while the list ends short of the housing,
  the chat header keeps its title left of it and its chips right (`.hole`: the h2's width and right margin, which
  `fitHeadPrs` then measures), and whichever has not the room pads down by the strip (`.npad`), its tint filling the
  room. `NSFullScreenMenuItemEverywhere` is registered false, or AppKit adds its own *Enter Full Screen* beside ours;
  the frame's autosave is off while filled; ⌘W leaves the fill first (no close button on a borderless window);
  Info.plist says `NSPrefersDisplaySafeAreaCompatibilityMode` false. Mission Control shows a window, not a Space. On
  this Mac the strip is 32 pt and the housing x 771.5–956.5 of 1728. **From a shell, `kill -USR1 $(pgrep -x peixAIrada)`
  is the same toggle** — the app log says `fill: on {{0, 0}, {1728, 1117}}` — since no drawer can press a key in the app
  without an Accessibility grant. → `scripts/scenarios/notch.mjs`, Decisions 2026-09-27.
* **The pickers match fuzzily, and with something typed the best match leads** (2026-09-21): `fuzzy(fields, q)` —
  each word of the query hunted *within one field* (`chatFields(s)`), letters in order, a run worth more than
  scattered ones, a word's start worth more than its middle, a gap costing; a field's worth falls off down the list,
  so a name or a branch beats a long prompt a short word wandered into. `hunt()` ranks; an empty box leaves every
  list in its own order. `markHits()` bolds what landed (`fuzzMarks`), runs merged. → Decisions, 2026-09-21.
* **The chat list's magnifier matches the same way, and ⌥⌘F opens it** (2026-09-25; literal before, on purpose):
  `renderSessionList` scores each chat with `fuzzy(chatFields(s), q)` and, with something typed, sorts by the score
  (the board's order breaking ties) and **draws neither the divider nor the day lines** — they say where a state or a
  day ends, and the order is the match's now. The title and the folder name are bolded (`markHits`, underlined on
  a card). ↑↓ in the box walk a `.qsel` card, ⏎ opens it (`openSession`, then `focusTerm`) and keeps the query; the
  mark shows only while the box has the keyboard (`markQsel()`, on every render). What it has over ⌥⌘K: done chats,
  the project in view and the state chips still apply. → `scripts/scenarios/chat-filter.mjs`.
* **The last step of the new-chat flow is a list of chats** (2026-09-21): the `chats` step is the scope's ready and
  clauding chats by `byWord` (newest word first, done ones out) under a ＋ *new chat* row that carries on with the
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
  (2026-09-23, `#notifyOn`), **the rings' step** (2026-09-27, `#ringsInStep`, above), **the cards' size** (2026-09-25, `.dens`, above) and the keys — nothing else; the plan usage left it for the chat list's footer
  (2026-09-24, below). It opens on *hover of `#pfoot`*, the cog's cell in the chat list's foot, which reaches the
  window's bottom left pixel — **drawn over the list's 4 px coloured edge** (`margin-left: -4px`, the edge carried on
  its own border), because the edge is not the cell; a click on the cog pins it, Esc or a click away closes it, and
  it opens beside the cell (`settingsOpen`). The fish is the SSE light and, clicked, **the About box** (`#about`, a modal dialog centred by the browser,
  2026-09-27: version, process and paths from the snapshot's `about`, and the chats' counts). `sound`, `showAll`, `toolsMode` and `foldCode` keep whatever they were saved as and
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
  while a zsh lives, `gh:<url>` per web page the chat opened (any page since 2026-09-26; GitHub's before, the rest went to the browser — the strip's ↗ is the way out to it) and `ide:<url>` for its folder's editor — `tabKeys()`
  from `state.paneGh` (per chat) and `state.paneIde` (per folder); `tabs` holds each chat's `[left, right]`, read back
  through `placeOf()`, and one whose page is gone falls away. `syncTerm()` keeps both bodies right and posts one
  `{type:'pane', id, keys, panes:[{key,left,top,width,height}], focus}` to the shell (`postPane`, again when the
  geometry moves; `show`/`left`/`top` repeat the first pane for a shell built before the split): it keeps a web view
  per page (`paneViews`, up to `paneViewsMax`, the chat's own spared) and places each one in its half. **The overlay
  covers the whole window** and lets a click that lands on no page through (`PaneOverlay.hitTest`) — that is what lets
  both halves hold a page at once; ⌘F's bar is placed from the focused page's rect, so it follows ⌘1 / ⌘2.
  `‹ › ↻ ↗` in the strip are `{type:'nav'}`; × forgets a page (`closeTab`). In a browser the tabs are chat and zsh
  only (`inApp`). GitHub cannot be iframed, hence the second `WKWebView`; a web view with no UI delegate drops
  `target=_blank`, hence `PaneDelegate`. → Findings: *the pane*.
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

### The chat column's two halves

* **⌘2 splits the chat column, ⌘1 / ⌘2 are the halves** (2026-09-22): each has its own tab strip and body, and both
  pick from the *one* open chat's tabs — its claude session or transcript, its zsh, its GitHub pages, its editor.
  The left half keeps the plain ids (`#ptabs`, `#term`, `#termBody`, `#log`): it is the whole column while nothing
  is split, and the harness reads it by those names. `GEL` maps each half to its elements, `terms[g]` owns that
  half's xterm and socket, and the take-over state (armed, failed) is the board's `drawer`, not a terminal's.
* **⌥⌘2 splits it one half over the other, and ⌥⌘1 / ⌥⌘2 are the top and the bottom** (2026-09-27, Ricardo: "hotkey 2
  to change to horizontal split. cmd 2 makes the vertical split · hotkey 1 goes the top split (pane 1 is up, pane 2 is
  down) · cmd 0 still closes the non-active pane · this should be a per chat setting"): **the digit is the pane, the
  modifier the layout** — pane 1 is left or top, pane 2 right or bottom, the keys go to the pane named, and a key
  pressed on the other layout turns the split first (`hotGroup(g, stack)` → `stackSplit`, which is `syncTerm` and a
  refit: the same terminals in the same halves, nothing re-attached). The layout is the chat's like the split
  (`stacked`, a set of ids beside `splits`) **and outlives it** — `unsplit` leaves it alone — so the split the board
  makes itself for a new tab comes back the way the chat was left; a split asked for by hand takes its key's layout.
  The divider's place is the board's, one per layout (`prefs.splitAt`, `prefs.stackAt`): a tall column and a wide one
  want it in different places. Stacked is `#groups.stack` (`flex-direction: column`; the halves' flex basis runs
  along either axis, so `applySplit` is the same arithmetic), the divider 6 px tall across the column and dragged by y;
  the second strip's ◫ / ⊟ (`.gturn`) turns it too. ⌘0 and ⌘W carry no layout and needed no change. The app forwards
  ⌥⌘1 / ⌥⌘2 by key code (18, 19), since ⌥ composes a symbol over a digit on a Portuguese layout. **A zsh ended by its ×
  lingers on the summary with `exited` set** — a wait for the tab to go is a wait on that, not on `s.shell` being gone.
  → `scripts/scenarios/split-stacked.mjs`, Decisions 2026-09-27.
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

### The drawer

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
* **Paths and pages in the chat are links** (2026-09-26): a file path in the transcript or on a drawer's line —
  `/absolute` (under a root a file lives under, or with an extension: `/api/sessions` is a route), `./relative`,
  `folder/file.ext`, `~/…`, `name.ext:12`, one after Claude Code's `@` — opens in VS Code at that line
  (`vscode://file`, the href `md()` gives `[file:42](src/file.ts#L42)`; relative ones against the chat's `cwd`,
  `PATH_RE` / `pathHref` / `chatLinks`), a web URL opens the page in the pane on a tab of the chat (`openExternal`,
  `IN_PANE` is every `http(s)` now). The transcript is linkified after every render (`linkify`, the text nodes the
  markdown and the tool rows left, anchors and summaries skipped); the drawer has a link provider beside the
  web-links addon (`termLinks`, `peix.links(y)` in the harness). → `scripts/scenarios/chat-links.mjs`.
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

### Invariants that bit us — one line each, the story in Findings

* Transcript line types are undocumented: ignore the unknown; drop `isSidechain`, `isMeta`, `isCompactSummary`,
  `<system-reminder>` blocks (strip them *first* — a prompt can follow one) and `<local-command…>` synthetic lines.
* `.cards > * { flex: none }` is load-bearing; `.card { --repo: initial }` too (custom properties inherit — the orange cards).
  `.card { isolation: isolate }` as well: the ring and its cover sit at z-index -1, above the card's background only
  because the card is its own stacking context.
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
* **A CSS animation starts over on a rebuilt node, and only `transform` and `opacity` run off the main thread**
  (2026-09-27): the list is `innerHTML` on every SSE update, so anything that moves on a card is phased to the
  document clock after the render (`phaseAnims()`) — and nothing continuous animates a custom
  property, a gradient or a colour: Chrome repaints that on the main thread every frame and freezes it under every
  transcript render (Chrome's own trace says `compositeFailed` for it). → Decisions 2026-09-27.
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

### Verifying changes

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
  default — the whole column while nothing is split), `drag(from, to, mid)` (a real press, move and release). The twenty-nine in `scripts/scenarios/` are the
  regression checks for the drawer (re-attach, restart, geometry, `/clear`, ⌘K, the focus-view button, ⌥ as a
  compose key), the hotkeys, the tab strip and the split (side by side and stacked), the new-chat flow and a new chat's card before its first word, the project step's folders and ✕,
  the chat list's rules, its filter, its ends and its timeline, the card sizes and marks, the notifications switch, the usage bar, the project cue, the header's PRs
  and its ··· menu, the chat's links, the top row around the notch.
* **`npm run scenarios` runs the lot**, one at a time — four servers and four Chromes at once is how a suite
  starts failing on the clock rather than on the board. A failure is **run once more**: passing then is reported
  `FLAKY` with what it failed on the first time, and the suite still exits 0; `--no-retry` is the honest gate.
  Nothing is known to need it since the drift below was taken out of `focus-view` (2026-09-22).
* **The auto fixture's second folder is the temp dir's real path** (`realpathSync(tmpdir())`, 2026-09-27): a fake
  claude started there registers `/private/var/…`, and a fixture chat under `/var/…` is another folder to the board —
  a second project named T, and the wrong one in view after ＋.
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

### Deliberately not done

* **Making VS Code's tab follow a chat continued elsewhere** — the extension watches only `~/.claude/sessions/`.
* **Attaching to a *live* session from the board** — the session's inbox socket cannot answer a permission
  prompt on your behalf, and its message JSON is undocumented. Live chats are refused on purpose.
* **PR status costs a network call**, so boot queues every PR once, batched; merged/closed cached forever,
  open re-checked after `PR_TTL_MS`. A card is titled by the oldest still-open PR (`prTitle()`).
* **The app is signed for this machine only**, not for distribution.
* **Chat-level pins** were dropped for sorting by your own last touch; **board-set colours** for Peacock's.

## Findings — the working notes as they stood on 2026-10-12, before the second slimming (moved verbatim)

The bullets of `CLAUDE.md` from *Run, build, check* to *Deliberately not done*, with their dates and stories, as
the file held them until they were pared again on 2026-10-12 (see that evening's entry). Headings demoted one level.

### Run, build, check

```sh
scripts/launchd.sh install          # the server as a login agent, run from this checkout — the recommended setup
scripts/launchd.sh restart [--after N]   # after a server.mjs change; the drawers stay (holders); N s first, so a recap lands
mac/build.sh install                # the native app (bundles node, node_modules, lib/) into /Applications — Swift changes
npm start                           # node server.mjs → http://127.0.0.1:7331, by hand
npm test                            # node:test over test/ — pure logic, and the drawers end to end (≈12 s)
npm run check                       # static: every script parses, the page's script compiles, the vendored xterm = node_modules, shell, swiftc -typecheck (≈10 s)
npm run verify -- "<js>"            # one expression on the live board in headless Chrome (see Verifying)
npm run webkit -- "<body>"          # the same in WebKit, the app's engine; --shot is the compositor's own frame
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

### Layout

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
| `scripts/webkit.mjs`, `scripts/webkit.swift` | The live board in a `WKWebView` (the app's engine), the window captured as its compositor drew it — what Chrome cannot show |
| `scripts/fakeclaude.mjs`, `scripts/fixture.mjs` | A stand-in CLI for tests (`FAKE_TUI=fullscreen`: drawn as Claude Code's `tui: fullscreen`, from the top; `FAKE_SCREEN`: a screen given, wrapped to its width — the README's drawer); a `~/.claude` look-alike |
| `scripts/fakejira.mjs` | Jira Cloud's three calls (projects, `myself`, `bulkfetch`) on a loopback port, from a list — `startFakeJira`, for the tests and scenarios |
| `scripts/fakecode.mjs` | `code serve-web` for the VS Code Web test: a build asked for by name lands in `VSCODE_CLI_DATA_DIR` a moment later, with a 202; `FAKE_CODE_LOG` logs every request |
| `scripts/fakepmset.mjs`, `scripts/fakecaffeinate.mjs` | `pmset` (its SleepDisabled in `FAKE_PMSET_FILE`; `FAKE_PMSET_FAIL` fails a set) and `caffeinate -i -w` (lives until its pid goes; `FAKE_CAFFEINATE_PIDS` logs it) — every test server's (`PMSET_BIN`, `CAFFEINATE_BIN`, `AWAKE_ADMIN=none`) |
| `scripts/fakegh.mjs`, `scripts/readme-shots.mjs` | `gh api graphql` answered from a file (`GH_BIN`, `FAKEGH_PRS`, `FAKEGH_VIEWER`; a PR's entry is handed back whole, so it can carry the turn's fields; one it does not name is a NOT_FOUND, as GitHub's), and `gh repo clone` without the network (git's progress over `FAKEGH_CLONE_MS`, a `.git/config`; a repo named `no-such-…` is GitHub's error); the README's screenshots from a made-up board → `docs/shots/`, WebP — never shoot the real one: the Mac's numbers and name are made up too, the app's pane is iframes over the halves (a `code serve-web` of its own for VS Code Web, behind a proxy that lets it be framed) |
| `scripts/check.sh`, `scripts/check-page.mjs`, `scripts/map.mjs` | Static checks; the section maps |
| `test/` | `node:test` files (`npm test`) |

### How it reads Claude Code

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
| PRs mentioned | `pr-link` lines, GitHub pull URLs *and short references* in user/assistant text, in the order said; most recently mentioned first; `gh api graphql` batched for state, title and whose move it is (one of the two network calls), polled by the chat's recency and the PR's own — see *The server*. **A short reference** (2026-10-06, `refsIn`): `#12` the chat's own repo (its checkout's `.git/config`, `ghRepoOf` — a worktree's followed), `widgets#12` the org of the root holding that checkout (else the chat's root's, else the one root's), `acme/widgets#12`, `widgets #12` when widgets is a checkout under a root, and a list after one on its line; none in code, a link's text or a URL. **It is on the chat only once GitHub finds a PR there** (`shownPr` filters the summary and `prTitle`) — a bare one not when that PR was merged or closed and opened over `REF_AGE_MS` before it was said (a review's numbered points), and no such past one titles the card (`pastRef`) — and a NOT_FOUND lets it go (`forgetRef`, `noPr`). → `test/pr-refs.test.mjs`. **A PR taken off a chat** (2026-10-11: ⌥-click on its chip in the header or its row under it — ⌥ shows an ✕ there, `--xmask`; `POST /api/sessions/:id/unlink`, `unlinkPr` on both sides) leaves `s.prs` and goes to `unlinked` in the state file (chat → url → when): `notePr` takes none of the chat's lines naming it up again, a re-read's too, **but a word of yours after**. → the last test of `test/pr-turn.test.mjs`, `scripts/scenarios/header-prs.mjs` |
| Jira tickets named | `KEY-123` in user/assistant prose (inline code counts, fenced code not), `…/browse/KEY-123` links, and the chat's `gitBranch` (`feature/key-123-…`) — `ticketsIn`, `noteTickets`, `noteBranchTicket` → `s.tickets`. **A bare key is asked about only when its project is one of the site's** (`jiraProjects`, `/rest/api/3/project/search`, hourly) and **shown only once Jira answered for it** (`shownTickets`; the branch's first); none Jira has is let go (`noTicket`). `POST /rest/api/3/issue/bulkfetch` (≤ 100 a call; `myself` for whose) with Basic auth: setup.jira `{site, email}` and a token from `JIRA_API_TOKEN`, else the keychain item *peixAIrada Jira* (account the email) written by `security -i` from its stdin; polled by `prEvery` like PRs, a done one an hour apart; a failure as a whole pauses, 1 min doubling to 30 (2026-10-08). → `test/jira.test.mjs` |
| Plan usage (the chat list's footer) | `GET https://api.anthropic.com/api/oauth/usage` with Claude Code's own OAuth bearer from the keychain item *Claude Code-credentials*; `USAGE=off` disables; the token never reaches the page. **A cap in money** (2026-10-08, an enterprise seat's): `limits[]` rows of `kind: 'spend'` (`group` daily · weekly · monthly) and `extra_usage`'s cents → windows with `used`, `limit`, `currency` (`usageWindows`, → `test/usage.test.mjs`). → Findings: *plan usage* |
| Permission prompts | the registry's `waiting` (above) — they never reach the transcript |
| Chat from the board | a holder runs `claude --resume <id>` or `claude` in the chat's cwd through an interactive login shell (mise's PATH; `RUN_SHELL` — the user's zsh or bash, else `/bin/zsh`); it registers like any CLI run; a new chat is tied to its session by pid. **A folder whose Taskfile launches claude** (a task whose description mentions Claude) starts new chats as `task <name>` instead: `GET /api/launchers?cwd=` lists them (`task --list --json`, cached by the file's mtime, `TASK_BIN` overrides), `POST /api/terminals {cwd, task}` checks the name; claude is then a *descendant* of the PTY's pid, found through `ps` (`linkTermToRegistry`, `t.claudePid`), which is also where the launcher's name is written down for good (`noteEnv` → `envs` in the state file → `s.env`, what ⌥⌘O scopes by). A resume never goes through task. **`/clear` (or `/resume`) in the drawer** gives that pid a new session id and `linkTermToRegistry` moves the holder to it and pushes **both** chats; the page follows the holder (`terminal` event → `openSession`), the old chat is a stale card. **A /clear ticks the chat it left done** (2026-10-10, any claude's, not only a drawer's): `loadRegistry` sees a process (pid and `procStart`) turn up under another chat (`clearedFrom`), and `tickCleared` marks the old one done once that chat's transcript begins with the command (`clearedAt`, fold — either may come first) at or after the old chat's last word; an in-app /resume, or a fork, leaves it be. Nothing is ended. → `test/clear-done.test.mjs` |

**Never written: anything under `~/.claude`.** The board is read-only against Claude Code's data. The fake claude
refuses to run against the real directory for the same reason — known by its device and inode, at CLAUDE_DIR or any
folder above it, for `$HOME`'s home and the account's (2026-10-03; a string compare before).

### The server

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
* **A prompt's and a reply's snippet is markdown as a sentence** (2026-10-12, `plain`, `plainSnippet`): a link is its
  words, headings, quotes and list markers go (an item starts with ·), a GitHub PR or issue URL is `repo#n`, other URLs
  lose their scheme and long segments — `lastPrompt`, `lastReply`, the tiles' words. Backticks stay; the page draws
  them as code (`ticks()` over escaped markup, `code.icode`). → the last test of `test/transcript.test.mjs`.
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
  `pmset -a disablesleep 1|0` as root — **through `sudo` first** (2026-10-09: Touch ID where `/etc/pam.d/sudo_local`
  has pam_tid, as on Ricardo's Mac, or a NOPASSWD rule; no terminal, so a password sudo cannot read is a quick failure),
  **then osascript's administrator dialog** (a password; a cancel is a 409, `cancelled`, said nowhere; `AWAKE_ADMIN`:
  `sudo` the default, `osascript` the dialog alone, `none` the tests' plain call) — **the system's setting, never kept here**: `readPower` reads `pmset -g`'s SleepDisabled on
  every registry poll, whoever set it. The one thing the board changes outside its own files besides a Peacock colour
  and a clone. **The same poll reads the idle sleep in use and the power drawn from** (2026-10-09: `sleep` under
  *Currently in use*, minutes, 0 never — the setting, the assertions only bracketed after it — and `pmset -g ps`;
  `idleSleep`, `power` on `awake`): **the cup is muted while it has nothing to hold off** (`cupMoot`: that `sleep` is 0,
  as on a charger set never to sleep, or the lid's setting holds), on or off, its tooltip saying why (`cupTip`); on, it
  still holds the moment that changes. The fake's power is `FAKE_PMSET_POWER` (`ac 0`, `battery 1` by default).
  → `test/awake.test.mjs`, the moot step of `scripts/scenarios/keep-awake.mjs`.
* **Every CLI the server shells out to goes through `findBin()`** — `git` too — the app's server has a bare PATH;
  `<NAME>_BIN` overrides. A file it can run, not any path that exists; none found is looked for again a minute later
  (2026-10-03). The login agent's PATH is the installing shell's, then the system's (`launchd.sh`, 2026-10-01). The
  network calls are `gh` (PR state and title), the usage endpoint — one usage question at a time, its answer kept a
  minute, a failure half a minute (`planUsage`) —, once the setup names a site, Jira (`jiraAsk`; its token never
  reaches the page, nor the setup file — `GET /api/jira` says only where it is: `env` · `keychain` · `file`) — and,
  with a `code` CLI, VS Code's update service once an hour (`freshenVsWeb`, below).
* **VS Code Web is kept on its newest build** (2026-10-11, `freshenVsWeb`, every `VSWEB_FRESH_MS` — an hour, the first
  90 s after boot; 0 off, every test server's): serve-web fetches a release only when it is first asked for it, so the
  first open after one waited on its 202 "downloading" page. The board asks the update service which build is the
  newest (`VSWEB_UPDATE_URL`, `server-darwin-<arch>-web/<quality>`, the quality from the `code` app's product.json) and,
  when serve-web's cache (`$VSCODE_CLI_DATA_DIR` or `~/.vscode/cli`, `serve-web/<commit>`) has not got it, asks serve-web
  for **that build by name, `/<quality>-<commit>/`** — never its root, which starts the newest build's server — starting
  serve-web for it if need be (`ensureVsWeb(path)`); serve-web answers 202 and downloads it, then starts its server and
  lets it go after an hour unused. A build asked for is not asked for again for 15 min. Read only under `~/.vscode`.
  → `test/vsweb.test.mjs` (`scripts/fakecode.mjs`).
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
  (`PR_WATCH`: 2 min within two days, 10 within two weeks; `PR_WATCH_MS`), however quiet its chat. **Not a chat ticked
  done for good** (2026-10-11: ⌥-click on the card's ✓, ··· *done for good* on a chat with PRs, the launcher;
  `forGoodMarks` → `forGood` in the state file, the done mark it came with, so it holds while that tick does — a word
  in the chat, another tick or ↩ ends it): `forgotten(s)` — its PRs neither un-tick it, rank it (`wordAt`, the page's
  `movedAt`), alert on it nor are asked about for it (`duePrs`); `forGood` on the summary, its chips grey. **⌥ held
  over the ✓ of a chat with PRs shows its ✕**, white on red, and the ✕ is what draws when clicked (`ICON.forget` beside
  the tick in the markup, `<html data-alt>` from `altHeld` — the keys and the pointer's own `altKey`, since in the app a
  key pressed with the pane in front never reaches the page; `.fg`).
  → `test/pr-turn.test.mjs`, `scripts/scenarios/pr-turn.mjs`.
* **A PR knows who had a hand in it** (2026-09-29): every person in `PR_FIELDS` comes with `avatarUrl(size: 48)`
  (`WHO`; a scalar, no cost), and `prPeople` — pure — gives the author, reviewers (not pending), commenters and pushers,
  each once with what they did and when last, newest first, at most `PEOPLE_MAX`, **you and the bots left out**.
  `people` on `prStatus` and on each chat's PR; a PR the call could not see keeps the faces it had.

### The board

* **Two columns**: the selected project's chats → the chat. **The chat list's foot — under the cards since
  2026-09-28 (`#sessions` rows: the list `minmax(0, 1fr)`, the people, the project, the controls) — is the project
  filter's whole cue**: **`#stitle`, a row of its own over the controls** (2026-10-08, grid row 3, the whole width; in
  the controls' row before, where a list at its usual width showed its × alone) — the project's name (nothing at all
  on ALL, `hidden`), a click being ⌥⌘P's picker, and × at the row's end back to ALL; **the chat header's folder name
  toggles it** (that folder, then ALL; `.repo.on` while it is the filter). The list's edge and the rows' tint are
  the project's colour. **The controls are one row, the usage included** (2026-09-28): the fish (the SSE light), `#filters` — the magnifier, an icon at rest (`#qBtn`); open, the left cap of
  `#q` (`width: 0; flex: 1 1 0`), which takes the row's spare room and the rings' (hidden while it is open, `:has`),
  and the funnel after it (`#fBtn`, the list's filter, below) —
  no state chips since 2026-10-11, later (the lanes fold instead, below; `#sessions` is still a size container) — no ＋ since 2026-09-28: ⌥⌘N, which opens on the project in view (⏎ ⏎ is a new chat there); then **`#sfoot`, in
  the head's grid row as a column of its own** (`main:not(.scompact)`): the usage. No cog: the settings are ⌘, and ···. **No « / »**: ⌥⌘B
  folds and unfolds. The row clips rather than run its controls under the usage. On the rail the fish and, under it for a
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
  the project cue, the hidden list, the tab strips, the rival's bar — a button replaced between press
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
  from there — `--tint` how strong it starts, `--reach` how far it runs before it is the panel, `--fall` (a registered
  number, 2026-10-09, late night) where in that run it is half gone: .35 at rest, so it drops steeply off the edge;
  .5, an even fade, on the open card. Hover, `.active` and `.qsel` set the numbers, never a `background`, and the
  change eases (`transition` on `.card`, shortened under `:hover`; the `::after` cover inherits and follows). A new
  card state that wants a glow sets the variables. The
  project's name is in its colour, towards what reads on the panel (`oklch(from …)`, lighter in the dark). The
  outline is `1px solid transparent` at rest for the same reason. `#splitter` and `#gsplit` light after a 300 ms
  `transition-delay` on hover, none on `.drag`; the small controls share one 120 ms hover transition.
* **Under the pointer a card's glow follows it** (2026-10-09, late night; Settings → Board → *light under the pointer*,
  `prefs.cardSpot`, on → `<html data-spot>`): a `radial-gradient` layer between the edge and the glow, at `--mx` /
  `--my`, `--spot` strong in `--spotc` (the colour, lifted towards white in the dark) — registered, not inheriting, so
  a move restyles that card alone; `--spot` is 0 % at rest (transparent) and eases in and out with the pointer, which
  leaves the light where it stood. `spotSoon` writes the place on the card that is `:hover`, once a frame, from the
  list's `pointermove`, its scroll and after `renderSessionList` (a card redrawn under a still pointer is a new node).
  With it on, hover keeps the rest glow (`.active` and `.qsel` keep theirs); off, hover spreads it as before. Not on
  the rail. → `scripts/scenarios/card-spot.mjs`.
* **Type and corners are a scale** (2026-10-12): `--fs-2xs` 10 · `--fs-xs` 11 · `--fs-sm` 12 · `--fs-md` 13 · `--fs-base` 14
  · `--fs-lg` 15 · `--fs-xl` 18 px, and `--r-1` … `--r-5` (3 · 4 · 6 · 10 · 14 px); a new rule takes one of them, a fit
  that needs its own number (the rail's four-letter names) says why.
* **Motion is a handful of tokens** (2026-10-11): `--ease-out`, `--spring` and `--spring-soft` on `:root` — the springs
  `linear()` curves of a damped oscillator — and `--t-hover`, the small controls' ease; the script's `EASE_OUT`,
  `SPRING`, `SPRING_SOFT` read them (`cssToken`). Something that settles eases out, something that arrives springs (the
  badge's pop, the PR fan). A new motion takes one of them, never a cubic-bezier of its own.
* **A press dips** (2026-10-11): `:active` scales a card to 99 % — not while the press is on a control inside it
  (`:has`), which dips itself — and the small controls to 97 %, by the `scale` property (the FLIP's `transform` and
  the ring's stay theirs), springing back on release. A menu row or a whole line does not. → `small-motions.mjs`, the
  scenario of the 2026-10-11 motions, one section each.
* **Counts roll** (2026-10-11, `rn(key, n)`, `rollIn`, `rollSoon`): a count is plain text in the markup, wrapped in
  `.rn[data-rk]`; after a draw (the board's, the status bar's, the usage's, a new header) each one whose key showed
  another number last (`rolled`) becomes a strip of 0–9 per digit (the digits a `::before`'s content), moved by a
  transform on the spring, beside the number as text out of sight (`.rv`), and is put back to plain text `ROLL_MS`
  later — so `setHtml` and the reconciles compare the same strings, and anything reading a count's `textContent`
  reads the number, mid-roll too (it read 0123456789 for half a second before). In `motion()` as `roll`. The lanes,
  a card's unread badge and agents, the usage, CPU, the live and asking counts, the header's `+n −n`.
* **Dialogs, `.pop` and `.note` ease in and out with `@starting-style`** (2026-09-27, night), `display` and `overlay`
  held by `allow-discrete` until the exit ends — so a closed dialog is still `display: block` for 140 ms while its
  `open` attribute is already off (read `open`, never `display`, to know). `note()` fades its popup out (`.out`) before
  removing it. A new dialog or popover gets this for free; one that must vanish at once sets `transition: none`.
* **An age is `data-at`, never words in markup** (2026-09-27, night): the pickers' `.t` and the menu's *for …* carry
  the timestamp, and `fillAges(root)` writes `rel()` of it after the list's render, after `pickRender`, and on the 30 s
  tick (which also refreshes the open picker and menu). **A card's `.time` carries nothing at all** — `fillAges` sets
  its `data-at` and tooltip from the chat — so neither the clock nor a tool call (which moves `lastActivity`) changes a
  card's html: the node is kept, and the ring on it (`card-signals` relies on this; a *prompt* still rebuilds the card,
  since its last word changes). `dayOf(ts)` is the one spelling of a day (`Today` · `Yesterday` · the weekday · `DD-MM-YYYY`), for
  the list's lines and the transcript's (`.sysline.day`, from `renderLog` where the day changes). The who-line's time is
  `toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })`.
* **Controls wear a fill, never a grey edge** (2026-09-28): `.btn`, `.fsearch`, `.chip`, `.ptab`, the PR chips,
  the ends' pills — `border: 1px solid transparent` (so nothing moves) and `background: var(--ctl)`, `var(--ctl-hi)`
  under the pointer; a state that was an accent or coloured edge (`.on`, a tab in front, a VS Code
  or agents chip) is a tint of that colour instead. `--ctl` is the ink at 7 %, **set on every element** (`*`), so it
  follows an `--ink` borrowed there (a black card, the header's black). Text boxes, dialogs and popovers keep their
  edges; a semantic edge (the red of a failure, the accent round an open box) stays.
* **The header casts a shadow on a scrolled transcript** (2026-10-11): `.shead::before`, under the header's edge
  (the header lifted, `z-index: 3`), faded in over the log's first 24 px of scroll by a scroll-driven animation on
  `--log` (`#log`'s `scroll-timeline`, seen through `main`'s `timeline-scope`); without scroll timelines, `--shade` from
  the log's scroll listener (`SPLIT_SCROLLS`).
* **A name too long fades rather than ends in …** (2026-10-11, `fadeOver`, `fadeSoon`): the header's title and a
  page's address (`.purl`) at their right edge, a card's title at its last line's end, by a mask — only where `.over`
  says it overflows (a mask on one that fits would fade its last letters). The header's and the strip's are read on
  every draw; a card's once per node (`.ovr`), and every card's when the list's width moves.
* **The broad gradients wear grain** (2026-10-11, `--grain` on `:root`: a 160 px tile of still SVG noise, white
  speckles at 7 %): the chat header's, the transcript's wash (`#log`) and the tiles' wallpaper, its first background
  layer — where a dark gradient across a wide box bands into steps. Not the cards (narrow, and their first layer is the
  lit edge, which the harness reads). A new wide gradient takes it the same way.
* **Tabs say which is in front** (2026-10-12): the settings' `.stabs` and each half's strip are `tablist`s, their tabs
  `aria-selected` (the settings' with `tabpanel`s and ← →); the overview's and the stack's small terminals are `inert`;
  `prefs.termReader` is xterm's `screenReaderMode` for every drawer.
* **What colour or motion says, words say too, out of sight** (2026-10-12, `.vh`): a card starts with its lane's name
  (and *watching*, *N agents at work*), a CI badge with *CI passed · failing · running* (`ckHtml(pr, said)`: not where
  a row says it), a tool row's mark is `role=img` with its state, the unread badge has its label.
* **Small text reads at AA in both themes** (2026-10-12): the state, ticket and badge fills are deep enough for their ink
  (`--pr-*`, `--tk-*`, `--unread`), each theme has its own `--needs`, and a done card is dimmed by colour (`filter:
  saturate`, its words muted), never `opacity`. A new small-text colour gets its ratio checked.
* **The small print is one CSS section** (2026-09-27, night, before the reduced-motion block): `text-wrap` for prose
  and centred texts, tabular figures for every count and age, `::selection` in the accent (and `--term-sel` to match),
  one `:where(…):focus-visible` ring — a text box that wants its border as its focus keeps its own `:focus { outline:
  none }`, which out-specifies it — and `overscroll-behavior: contain` on every scroller. A new number, list or control
  joins those lists rather than getting a rule of its own.
* **Increase Contrast, Reduce Transparency and forced colours have a block each** (2026-10-12), before the reduced-motion
  one: the muted ink, the lines and `--ctl` stronger and an edge on every fill-only control; the blurs solid; the
  colour-only marks kept (`forced-color-adjust: none`). A new fill-only control joins the first block's list.
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
  `--watch`, slowly, and can sit on a *ready* card — **its newest event on the card's live line**, each new one rolled
  in and the light blipping once (2026-10-11, `liveSlot`, `fillLive`, `liveSeen`; `blip` and `event` in `motion()`);
  **a clauding card's live line is the tool it called last** (the summary's `doing`, `doingOf` on the server: the
  newest tool_use since your last word; a path in it from the chat's folder, a long one its last two segments —
  `pathTail`, the tiles' too), flipping to the next like a split-flap board (`flap`). The line is an empty
  slot in the markup, filled after the render — its memo in properties, since `data-at` is `fillAges`' — so an event or
  a tool call keeps the card's node; **asking** (`needs-input` while alive) has **no ring**: the card's
  border is red and **pings leave it** (2026-10-09, `@keyframes sonar`; it blinked before) — its `::before` and `::after`
  as two outlines half a beat apart, scaled out and faded, the card `overflow: visible` to let them out — with the
  question and its answer count on the card
  (`askHtml`). **Answered, it hears it** (2026-10-11): a chat that stops asking while alive is noted in `heardAt` by the
  `session` handler, and `flareLanded` gives its card `heard` with a negative `--heard-delay` — an outline drawing in
  from where the pings fade to the edge, and the ring of what comes next fading in (`ringin`); `heard` in `motion()`. The three CSS rules are in priority order — work beats a monitor, a question beats both — **and each
  sets every variable**. The chips beside the title say the numbers (`N agents`, `monitor`). **The ring is a conic
  gradient on a square `::before` turned by a `transform`, under an `::after` cover in the card's background 2 px in,
  on the edge itself** (2026-09-29): a card with a ring has no border — its padding takes the 2 px, so nothing inside
  moves — and the band's unlit part is `--track`, the border's colour **on the open card only**: elsewhere it is
  transparent, the light running on nothing with a glow round the card (`box-shadow`, no 1 px line; `--tail` shortens
  the light) — the colour round the edge is the open card's alone (2026-10-11, afternoon; a question keeps its red);
  the card's overflow clips at its padding box, so with a border the light ran inside it. The compositor's kind of motion — and `phaseAnims()` (once a frame, before
  it paints; `phaseAnims(true)` at once, the cog's switch) puts every `ring`, `edge`, `sonar`, `pulse`, `pix` and `pixhop` at
  start time 0 on the document clock, or, with *rings in step* off (`prefs.ringsInStep`), at a time hashed from the
  chat's id — **by its `currentTime` first, then its `startTime`** (2026-10-11, night; see the invariants: in the app the
  switch moved no ring). → `scripts/scenarios/card-signals.mjs`.
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
  left standing, and it carries the hover tooltip — but for `.rdot` (2026-10-12): a dot at the square's corner for a
  PR at your move (the accent's diamond) or a new reply (green), by the card's `data-want` (`wantOf`), and an idle or done square
  dimmed; a short name of three letters or more is set smaller (`data-n`). **The lanes fold on the rail too**, their
  heads there a mark and a count, a click on one still folding it.
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
* **A theme is every surface at once, worn by appearance** (2026-10-10; ⌥⌘Y, `SKINS`, `skinCss`, `applySkin`): Omarchy's
  twelve, each a block of tokens under `:root:root[data-skin=…]` inside its own appearance's media query — three
  classes deep, so it beats `:root` and the dark block; its states and syntax only outside simple colours. **Two slots,
  `prefs.skinDark` / `prefs.skinLight`**: the page cannot choose its appearance, so a dark theme is worn only while the
  system is dark (`skinOn`). The blacks the CSS spelled out read `--crust` (the header's right, the splitter), `--bar`
  (the status bar) and `--hd-*` (the header's borrowed inks), each with the old value as its fallback. A project's
  colour moves to the theme's nearest hue (`skinColor`, in `repoColor`; `prefs.skinExact` keeps it as set) and the
  drawer's sixteen colours are the theme's (`xtTheme`, `ANSI`). The grid previews as the arrows move (`skinPreview`),
  Esc puts back what was worn, ⏎ keeps it in its appearance's slot. **A tile clicked spreads its theme from there**
  (2026-10-11, `revealFrom(pt, change)`, `centreOf`): the change inside `document.startViewTransition`, the new page's
  snapshot clipped to a circle growing from the point (`::view-transition-new(root)`, no cross-fade); the simple
  colours switch does it from the switch. ⏎, a key, keeps what the arrows were already showing: nothing to reveal.
  `look` in `motion()`. A colour on the board that reads no token is one
  no theme reaches. → `scripts/scenarios/themes.mjs`.
* **The floating header is a switch, on by default** (2026-10-09, the studies' E, to try; the default since 2026-10-11,
  evening; Settings → Board → *floating header*, `prefs.headFloat` → `<html data-head="float">`): `#shead` a rounded bar inset 14 px from the column's sides and 10 px
  from its top, an edge of the project's colour and a shadow; `#prlist` inset alike. With it the open chat's light
  does not run round the header's box (`trailGeom`'s `box` is null — it no longer touches the splitter). **It floats
  over the chat** (2026-10-11, late morning): `#groups` spans the header's rows (`grid-row: 1 / 5`, and every row of
  `#chat` placed in column 1 — of two overlapping items one left to auto-placement goes to a column of its own), with
  `#shead`, `#prlist` and `#rival` over it; a half the header floats over (both side by side, the top one stacked)
  pads down by `--float-h` (`floatH`, a ResizeObserver on the three: from the column's top to under the last one shown;
  a transcript at its end stays there), but **a half with no strip runs up behind it**: the transcript pads only its
  words (zoomed: the lengths divided by `--chat-zoom`), the drawer is simply taller, both masked to a third over that
  height, the wash moved onto `.gbody` while the transcript shows — **but a drawer starts under it while its screen has
  room** (2026-10-11, late night; `.gterm.under`, `checkRoom` on its writes): a terminal draws from its top, so a new
  chat's banner was behind the header. The longest run of blank rows decides — two at most is full, and it runs up
  behind; room for the header's rows and `ROOM_MORE` besides (a /clear) brings it back — each want seen twice
  `ROOM_MS` apart, every change a resize; kept per drawer (`underOf`), a new one under unless resumed.
  → `scripts/scenarios/drawer-under-head.mjs`. **At the notch its top edge dips round the camera
  housing** (`headNotch`, from `layoutNotch`): a clip-path run wide of the box (its shadow stays). **With tiles the dip
  is the tile's own line round the housing** (2026-10-11, afternoon; a second line under it before): the top edge bends
  into it — a `HEAD_BEND` circle tangent to the edge and to the line's side or corner — and follows it a pixel under
  its outer edge (no seam), the corners concentric (`HOUSING_R` + `TILE_BW`, shared with `tileNotch`); without tiles,
  the housing `HEAD_GAP` clear. The header's border there is `#chat > svg.hcut`, drawn outside the header, which clips
  what it holds — with tiles only the two bends, the tile's `.ncut` (over it) drawing the rest. The header keeps its
  place and height — **but for its title, which runs on under the housing** (2026-10-11, late night; `headDrop`,
  `.tunder`): a title longer than the room left of the housing no longer jumps it; the h2 reaches at least the
  housing's far side (`flex: 1 0 …`, the chips past it, `fitHeadPrs` reserving as much), and the header is lowered
  (`--hdrop`, on its top margin, so the row stays centred) by what the glyphs need to clear the dip's line by
  `HEAD_CLEAR` (2 px) — their top the canvas's measure of the title in its own font, of `Hdl` at least, so titles of
  one font lower it alike; with tiles about a pixel in Chrome, none in the app. More than `HEAD_DROP_MAX` (8) — the
  plain column without tiles, where the header sits 10 px higher, wants 14 — and it jumps as the plain header's does.
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
* **Only the project's name is on the project's colour; the rest of the header is black** (2026-09-28) — **but in
  the board's own light theme off the notch, the panel** (2026-10-12: `--crust` and the `--hd-*` inks set to the light
  ones on `main:not(.notch)`, the splitter's black with them; at the notch it is the housing's colour and stays):
  `.shead::after` from `--hsplit` (the `.sep`'s right edge) down `--hrow` (the first row; open details keep the
  header's ground), set by `paintHeadSplit()` after `layoutNotch(); fitHeadPrs()` and on `peixFill`; `.shead`
  isolates so the paint sits under the row. The title (`.shead h2 .t`) and everything right of the h2 borrow the dark
  theme's inks (the variables; their colour through `:where`, so a control's own rule still wins). At the notch the
  housing is inside the black. **The black fades in** (2026-10-11, late night; a hard edge before, then a pixel
  dissolve for an hour — Round V's S8): a plain gradient masks the `::after`'s first `--hfade-w` (48 px), from 8 px
  after the name to 8 px past `--hsplit`; the `.sep` keeps that room less 16 px (the colour square centred on it), so
  the title starts 30 px further right than on the hard edge. No `--hsplit`, no black, as before.
* **A colour as dark as that black turns the black grey** (2026-10-01; `nearBlack`, Peacock's brightness under 40):
  the open chat's (`tintChat` → `main.darkchat`) makes the header's `::after` and the splitter's `::after`/`::before`
  `#4a4a45`. Simple colours' black, or a project painted `#000000`. No grey ground under a list of black cards since
  the ink cards (2026-10-09). **On a card, a colour too dark (or too light) for the panel is held where it shows**
  (2026-10-09, late night): `--lift` is `oklch(from <the colour> max(l, .62) c h)` in the dark, `min(l, .72)` in the
  light — hue and chroma kept, a black a grey — and the edge, the glow, the light under the pointer, the hovered, open
  and clauding border and the ring's track wear it; the project's name in the dark is lifted from the same floor.
  **A black project's ground stays black** (towards morning): the glow's colour is `--wash` (a registered colour,
  eased) — `--lift` on every card but `.card.black:not(:hover, .qsel)`, where it is the black; its lines are the grey.
  `--repo` stays the colour as set for the rail's squares, the header, the splitter and the open card's bleed into it.
  → the black step of `scripts/scenarios/simple-colors.mjs`.
* **With no chat open the column is home** (2026-10-10; its header says *Home*; its counts are buttons to what is behind
  them, `.hgo` — the chat asking, the overview, the PRs at your move — and a line of keys under the blocks, 2026-10-12; `showHome`, from `leaveChat` when its log is `NO_CHAT.log` and
  from a snapshot with nothing to open; ⌥⌘0 from anywhere): fastfetch's block — **an ASCII sunset at sea** (2026-10-12, `makeSea`: ascii.rest's *ocean-sunset*, MIT, ported as it
  stands — a halftone of · • ● on a 200 × 100 grid, each glyph masked once and blitted into one ImageData at 15 fps while
  home is on screen; the board's fish leaps across the sun now and then and on a click, `seaLeap`; a still frame, the
  fish at the top of its leap, under reduced motion; `peix.sea()`; the canvas outlives the draws, the facts and the day
  drawn into boxes of their own) where the pixel fish (`FISH`) in the accent was,
  the board's facts in key: value lines (`about.user`, `about.host` from the server; chats, agents, PRs, the plan, the
  Mac from the status bar's stats, the theme) and the palette's blocks — then **the day**: `GET /api/today?since=<the
  page's midnight>` (`dayOf`), a row per chat that did anything since, most recent first, on an axis from the hour half
  an hour before the first span to the hour after now (2026-10-12; from 8:00 before), its turns in its colour, its
  questions hatched red (`a`), its monitors a thin line (`m`), what is still going drawn to now; the sum is the
  questions, the median answer, the longest wait. **The spans come from the transcript as it is folded** (`noteSpan`,
  `s.day`, a day and a half kept): a turn from its first line to the reply that ends it or the interrupt, a question
  from its asking to its answer (both lines carry their own times, though written together), a monitor from its start
  to its end; worked is the turns less the waits inside them. A question still open comes from the registry
  (`live.statusAt`). Drawn again on session events (`homeSoon`), the day asked again each minute and when a turn
  lands. → `test/today.test.mjs`, `scripts/scenarios/home.mjs`.
* **⌥⌘A is the overview, every live agent at once** (2026-10-10; `#ov`, a modal `<dialog>` over the whole window, the
  board blurred under it): `ovColumns` — Asking you, Clauding, Watching (a live chat's tasks), New replies — every
  project, done chats never; an empty column is its head alone, narrow (`.oc.nil`; `.empty` is the log's message), the
  full ones sharing the width (2026-10-12); a tile per chat, numbered in reading order (1–9 and ⏎ open, the arrows
  move; **a click on nothing closes it** — not a tile or a control, pressed and let go there, `ovNothing`, 2026-10-11,
  late night), drawn again on its chats' `session` events (`ovSoon`). **A tile is a live tile** (shared with the stack, see
  *The chat column's two halves*): the chat's drawer here as a read-only xterm (`mountMini` — it never sends a resize,
  so the PTY keeps the size the chat's own view gave it; scaled to the tile down to .7, cropped past that, the bottom
  left in view — **Claude Code's footer below the edge** (2026-10-12, `footRows`, `placeMini`: from the upper of the
  prompt box's two rules of ─ down; not on a chat asking you, whose choices are there)), else its tail (`tailHtml` over `GET /api/tails?ids=`, polled every 2 s while up). The server keeps
  that tail for every chat, open or not (`noteRecent`, `s.recent`, the last 16 tool calls, results and words); a
  monitor's last event is `last` on its task; a question's answers are `ask.labels` — **known only once the
  transcript has the question, which is written with its answer** (see *How it reads*): a live question usually shows
  as the drawer's own screen. An answer clicked opens the chat and types its digit into the drawer (`answerInDrawer`).
  **It zooms** (2026-10-11, Mission Control's): opened, each tile grows out of its chat's card (`ovZoomIn`, a FLIP from
  the card's rectangle, 18 ms apart; one out of sight rises in place), and a tile opened grows into the chat column as
  the overview goes (`ovGo`: a ghost `.ovghost`, a popover so it is over the closing dialog); `ovzoom`, `ovgrow` in
  `motion()`.
  → `scripts/scenarios/overview.mjs`.
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
  awake is the status bar's** (2026-10-09, later — `#sbAwake`, `#sbLid`, see the bar); **with the bar off** it is a
  button in the header row (`#awakeBtn`, before ···: a muted cup off, the cup in amber saying *awake* on, the laptop in
  red while the lid's setting holds — its click then turns that off) and a row of ··· (`#lidBtn`). The header's is drawn
  into whichever header is up, a chat's or the empty one (`drawAwake()` after every header drawn anew and on the
  snapshot; not in `drawn.head`'s markup), and none while the bar is on. → `scripts/scenarios/keep-awake.mjs`.
* **A PR's CI is said in the chat header only** (2026-10-09; the cards have enough): `commits(last: 1) { … statusCheckRollup
  { state } }` in `PR_FIELDS` → `prChecks` → `checks` (pass · fail · pending) on each PR; `.hpr` wears `.ck` — a round
  badge after its number in the page's ground, a tick, a cross, or a ring turning (`ring`, stilled under reduced
  motion) — and a failing chip a red ring; the row says *passed · failing · running*. Only for open and draft PRs. **A
  change is seen** (2026-10-11, `prMoments`, in `rollSoon`'s pass): each `.hpr` and card `.cpr` (both carry
  `data-url`), keyed by where it stands and its PR (`prShown`), against what it showed last — running → passed or
  failing strokes the mark in (`.ck.now`, `ckdraw`) and pops the badge, a failure shaking its chip (the `translate`
  property); open → merged sweeps a sheen across (`.sheen`). A first sight plays nothing; `ci:pass`, `ci:fail` and
  `merged` in `motion()`.
  → `scripts/scenarios/pr-checks.mjs`.
* **A chat's Jira tickets are chips as its PRs are** (2026-10-08): on the card, `cardTickets` — a stack as the PRs' (`chipStack`,
  `.tprs.ttks`, 2026-10-11; the first and `+n` before), the first (the branch's, else the last named) on top, each `.ctk`
  solid in its status category's colour (`--tk-todo` · `--tk-doing` · `--tk-done`, `data-cat`), before the faces; a click opens the chat and the ticket in the pane. In the header they are
  `.hpr.tk` inside `#prToggle`, after the PRs (so `fitHeadPrs` folds them first), and `.prrow.tk` rows under the PRs'
  in `#prlist` (status · key · summary · whose). The settings' Setup has a Jira section (`jiraSetup`: the site and
  email into the setup file, the token box write-only into the keychain via `PUT /api/jira/token`, a line from
  `GET /api/jira` — who Jira says you are, or what went wrong; jira-cli's server and login offered while empty).
  → `scripts/scenarios/jira-tickets.mjs`.
* **The chat's PRs are chips in the header row, folded**: `#prToggle`, one button of the cards' chips (`.hpr` shares
  `.cpr`'s rule; `fitHeadPrs()` measures every width once and shows **two chips at most** (2026-10-12, `CHIPS_MAX`; the PRs at
  your move first, the newest move first), the rest behind **the whole count** — *13 PRs · 3 tickets ▾*, which opens
  the list — or `+n ▾` where that is too wide beside one chip; fewer while the row would leave the title less than
  the largest of its repo name plus `TITLE_ROOM` and **40 % of the row** (`TITLE_SHARE`; `TITLE_MIN` is the h2's
  flex-basis) — on every new header
  draw and on the header's `ResizeObserver`, which runs only when the width moved or under the housing;
  → `scripts/scenarios/header-prs-fit.mjs`). **The row never wraps** (2026-10-11, afternoon): the move's line and a
  task's chip are `flex: 1 1 0` up to `max-content` — they grow into what is left and count at their least (the move's
  tag and count, `--hmin`), never breaking the line; down to one chip and still too full, the move's line and then the
  `+n −n` are put away (`.hfold`), ··· always on the title's line (→ the narrow step of `pr-turn.mjs`). It toggles `#prlist` under the header; `prefs.prsOpen`, the board's. The rows
  are rendered folded too (`#prlist` hidden), so ⌥⌘G and the harness still read `#prlist .prrow`. The header's chips
  are 20 px tall. → `scripts/scenarios/header-prs.mjs`.
* **Every PR chip GitHub has answered for is solid** (2026-09-28): `.cpr` and `.hpr` filled with `--prc`, its state's
  colour, the ink the page's `--bg`; one whose state is not known yet stays an outline (the header's on a wash of
  `--prg`).
* **A PR at your move is said by name, not by its chip**: `data-turn` (`turnOf(pr)`: `you` · `them` · empty) on
  `.cpr`, `.hpr` and `.prrow` and the tooltips (`turnTip`), but no look of its own. **The card has a line** (`moveHtml`,
  after the question's, at every size, not on a ticked card): a tag filled in the accent (`.ymove`: `ICON.pr`, *your
  move*), the newest move's `#n` and reason (the others in its tooltip: **a card counts nothing**,
  2026-10-11 — no `+n` for faces, PRs or tickets); **the chat header says it too** (`headMove`, `.hmove`, just
  before the PR chips), and the PR row in `.why`. The chat also ranks by the move (see the order below). **The tag
  arrives** (2026-10-11, `moveMoments` in the after-draw pass): a *your move* tag on a card or a header (`#shead`
  carries `data-sid`) that the last pass did not have, where that card or header was already shown, slides in on the
  spring and nudges once; `move` in `motion()`.
* **The card's PR chips end its top row, stacked** (`cardPrs` → `chipStack`, `.top .tprs`, 2026-09-28; a stack since 2026-10-04):
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
  who else had a hand in the chat's PRs, merged across them, newest first — GitHub's avatars (an initial when there is
  no `avatar`), **a pile** (2026-10-11, late afternoon; three overlapping a little and `+n` before): up to `CARD_FACES`,
  the newest on top at its right end, each other one under the one before with 4 px of it showing (`row-reverse`, a
  margin of −12 px, `z-index` from `--i`), spread side by side under the pointer (the margins, on the spring); the
  tooltip says what each did, PR by PR. The images come from GitHub's
  avatar host; the tests hand the fake gh `data:` faces so nothing is fetched.
* **The people row: everyone in the PRs of the chats in view, under the cards** (`#people`, `renderPeople`,
  2026-09-29): the project's chats in the lanes open give their PRs' `people`, merged by login, newest
  first (`peopleOf`), a face a button behind GitHub's mark (`ICON.github`, 2026-10-09; the PR mark before), **which folds
  them away** (`.pgh`, `prefs.peopleCompact`, on by default — 2026-10-11, later; off by default and a count beside the
  mark from 2026-10-09): folded, the mark alone, but for the face the list is narrowed to; the state is
  `#people.compact` and the mark's words are set after the draw, not in the markup, so a fold keeps the nodes and the
  faces fade out (`allow-discrete`). A click is `prefs.person`: the list, its counts and its
  timeline narrow to the chats whose PRs have that person (`hasPerson`, applied with the query in
  `renderSessionList`), the face ringed in the accent and the others dimmed; the same face again, or the person
  leaving the view, lets go. Grid row 2 of `#sessions`, the list's row and the usage in row 3; `display: none` on the
  rail. Drawn only when its markup changed (`peopleDrawn`). → `scripts/scenarios/people-row.mjs`.
* **A card comes in three sizes, the cog's slider** (`#cardsSize`, `prefs.cards`): *large* — your last prompt and
  Claude's last reply —, *medium* the last word only, *compact* neither — **compact the default** (2026-10-12; a board
  saved on large, the old default, moved once, `cardsMoved`). **By lane** (`#cardsByLane`, `prefs.cardsByLane`, off): a
  card that wants you (`roomy(s)`: asking, clauding, a PR at your move, a new reply) is `.roomy` and, with the list's
  `data-bylane`, large whatever the slider says. `cardHtml` always writes both `.snip`s and
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
  since 2026-09-28, the background running under it: `background-origin: border-box`): only the clauding card and the
  open one wear the colour round their border (the hovered one did until 2026-10-11, afternoon). **ALL** (`key: 'all'`) is black in both
  themes — `BLACK`, through `projColor()` — and so is a folder the setup paints `#000000`. A card in that black is
  `.card.black`; `--ring` turns its clauding light white wherever the card under it is dark. **The open card runs
  into the splitter**: `main:not(.scompact) #slist > .card.active` runs to the column's edge, its glow falling to the
  panel at its right edge as every card's (it rose to the full colour over its last 44 px to meet the bar, 2026-09-29
  to 2026-10-11, afternoon), and `#splitter` is `--open`
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
* **A chat waiting on your answer first, then clauding, then ready, idle, done last** (`RANK` / `rankOf`): **Ready** a
  chat whose last word is from today or the `IDLE_DAYS` (3) before, **Idle** older — folded to begin with (2026-10-12;
  and once, `lanesIdle`, on a board saved with Done alone folded). A PR at your move and a new reply were lanes of
  their own above Clauding for a morning (2026-10-12) and are **the list's filter** since — not the main view (below).
  → `scripts/scenarios/lanes.mjs`. Inside each
  group **by the last word, yours or Claude's** (`wordAt`: the newer of `lastUserAt` and `lastReplyAt`; a tool call
  is not a word — **a PR come round to you is**, at its `turn.movedAt`: `movedAt(s)`, in both copies), newest first; a project ranks by its newest chat. Every count goes by `bucket()`,
  where an asking chat is a ready one — only the order knows the difference, in the list and in ⌥⌘K. **The lines
  between the cards** (`.gsep`): **a lane's head over each group** (2026-10-09, `laneHtml`, `.gsep.lane.<group>`; one
  divider between the clauding and the ready cards before) — its mark, its name (`.ln`: *Asking you · Clauding ·
  Ready · Idle · Done*) and its count at the right end, none under a query — **and a toggle that folds its lane** (2026-10-11,
  later; three state chips filtered the list before): `data-lane`, a click or ⏎/space (`foldLane`), `prefs.lanesShut`
  — **Done and Idle folded to begin with** — the head dimmed with its chevron turned and its count kept, its cards folding away
  as a ticked one does (`laneShut`; not on the rail, which draws no heads; the harness opens every lane unless a
  scenario's `prefs` say otherwise); `fold` and `unfold` in `motion()`. → `scripts/scenarios/lanes.mjs`; the Clauding head's mark is **Claude's in pixels**, a
  9 × 9 window on a strip of frames drawn from `PIX_SHEET` (`#` a pixel of 2 px), `pix` sliding it a frame at a time
  (`steps(1, end)`), `pixhop` lifting it on the burst; both transforms, 2.4 s, phased by `phaseAnims()` — and a still label **over every run of cards from one day in a lane** (`dayHtml()`, `dayBefore`; 2026-10-12, under
  it before): the day at the left, a hairline after it — `dayOf` by `wordAt` (`dayName()`) — none in a lane whose cards
  are all from today; the list is grouped first, so a day can come back and each run gets its own label.
  **All caught up** (2026-10-11, `ZERO_HTML`, `caughtUp`): with no ready chat and no question in the project and
  something else in view, a still lane head says so where the Ready lane goes (before the done cards) — the pixel mark
  at rest, in the ready green; reached from a ✓ within 3 s (`lastTickAt`) its mark hops and throws pixel sparks, once.
  None under a query. → `scripts/scenarios/day-separator.mjs`, the caught-up section of `small-motions.mjs`.
* **The list's filter is the funnel beside the magnifier** (2026-10-12, `#fBtn`, `FILTERS`, `prefs.listFilter`; the
  status bar's, or the list's foot with the bar off — it is in `#filters`): its menu (`#ctxm` through `ctxShow`, a
  tick on the choice, each counted in the project in view — `drawFilter`, `fCounts`) is *Every chat* · *Your move*
  (`yourMove`: a PR waiting on you, not done for good — a clauding chat too) · *New replies* (`replied`: a ready chat
  whose last word is Claude's and came after the board last showed it — the summary's `seenAt`, the server's `seen` in
  the state file, `POST /api/sessions/:id/seen` from `markSeen` on opening a chat and on a reply landing in the one in
  front; never shown, `seenSince`, the first boot that kept it). Done chats never. On, the list is narrowed before
  anything counts it, the lanes keep their order and **every match shows, folded or not** — the heads `.still`, which
  do not fold (`foldLane` does nothing) —, the funnel says which and how many (`.fl`), the caught-up head is not
  drawn, and an empty list says so. The launcher has *Show only: …* and *Show every chat again*. The rail's dot, the
  Dock's badge and the menu bar still read `replied`. → `test/seen.test.mjs`, the filter steps of
  `scripts/scenarios/lanes.mjs` (New replies) and `pr-turn.mjs` (Your move).
* **A card clicked open sends its title into the header** (2026-10-11, `flyFrom`, `flyTitle`): a copy on one line
  (`.flytitle`, fixed, over everything) from the card's title to `#shead h2 .t`, translated and scaled from the card's
  size to the header's while the header's own waits at opacity 0; `fly` in `motion()`. The card's click handler only —
  never a key, a picker or the chat already open.
* **A chat opened from elsewhere is located** (2026-10-11, `openSession(id, { locate: true })`, `locateCard`): from
  ⌥⌘K and the chats step, the launcher, a notification, the address (a deep link, the app's notifications), the
  overview, a tile and the home, its card is scrolled to and a band of its light sweeps across it once (`.card > .loc`,
  its own box: the pseudo-elements are the ring's); `locate` in `motion()`. A click on the card, ⌥⌘↑↓ and a tick's move
  do not.
* **Ticking the open chat moves on** (2026-09-30): `tickDone` — the card's ✓ and ↩, the chats step's ✓ — opens the
  card below it in the list as shown, else the one above, stepping over done cards; a chat ticked while another is
  open moves nothing. The move is made **at the click**, not on the server's answer (an empty chat's `session` event
  would `leaveChat` first). **The card's ✓ is felt first** (2026-10-11): it fills with the ready green and draws its stroke
  (`.act.tk`, `ICON.tick`, `tkdraw`), and the move and the server's answer wait `TICK_MS` for it — a redraw before would
  take the mark with it; a second click meanwhile does nothing. Under reduced motion, at once. `tick` in `motion()`. → `scripts/scenarios/tick-next.mjs`.
* **The list's frame reads its geometry once** (2026-09-27): `listChanged()` runs once a frame — `listGeom()` (every
  card's top and height, the window, the rail) first, then `drawEdges(g)`, `drawTimeline(g)`, `drawSplit(g)` and
  `drawTrail(g)`. A read after a write is a layout each; keep the reads at the top. The pointer
  handlers call `tlGeom()` (the same function) themselves. **It follows the list's motion** (2026-10-02): a rect read
  mid-slide is where the slide has got to, so while a slide or a fold runs (`follow()`, `sliding`) the frame is drawn
  every frame and once after — drawn once after the render, the splitter's colour and the open chat's light stood
  where the card had been until the next update; and the open card's own size is watched (`watchOpen`). A new
  animation that moves cards goes through `follow`. → the slide step of `scripts/scenarios/open-light.mjs`.
* **An empty list is the fish** (2026-10-11): `drawCards`' empty markup is the home's fish at rest (`SWIM_FISH`, 2 px a
  pixel, its tail still), what is empty in a word and the way to fill it (a query: Esc; ⌥⌘N) — a bubble from
  its mouth now and then, from the bar's own interval. None of it on the rail but the words.
* **The list's two ends count the cards out of sight**: `#sup` / `#sdown` (`.sedge`), over the list's grid cell (so
  `#slist` has a definite `grid-column`), a pill on a fog of `--bg` — the lower one at the right (2026-10-12; centred it
  sat on the last card's your-move line), centred on the rail; a card is out of sight when its *middle* is past
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
  `body`'s grid row 2; on by default, Settings → Board → *status bar*, `prefs.statusBar` → `<html data-sbar>`). **Four
  slots** (2026-10-09, later): `#sbFind` far left — **the search, `#filters` itself moved in** (`dockBar`, its
  handlers with it; the state chips with it until 2026-10-11, later) —, `#sbLeft` — the connection (the stream's open
  and error, `bar.conn`; a click is the About box, the fish's whose row went), how many are asking and the
  monitors, each only while there is one (the live chats and the drawers and shells went 2026-10-11, later) —, `#sbPeople` —
  **the faces, `#people` moved in**, before the fish since 2026-10-11, later, so GitHub's mark stays put as they fold —,
  **`#sbSwim`, the pixel fish swimming at the pace of what is at work** (2026-10-11, RunCat's cat;
  `swimAt(n)` from `renderBar`, n the clauding chats and their agents: one `swim` animation whose rate
  `updatePlaybackRate` changes in place (`swimPace`: `swimRate`, times `DART` while it darts), **never still** — at 0
  half the pace, `.rest` (paused there until 2026-10-11, later) — **and back and forth**, mirrored at either end
  (`swimFrames`: a length each way, the turn two keyframes at .5; `fishAt` says where it is and which way it faces, from
  the swim's own clock, never a rect), its tail wagging; **a pet that eats** (2026-10-11, late night): now and then it
  blurps a bubble or three ahead of itself (`blurp`, room ahead only), chases them — its lips (`.m`) away while
  `.open`, darting the last `DART_PX` — and gulps each, the body swelling (`gulp`); every third, a burp rises; one it
  turned from pops after `FOOD_MS`; the pointer on it is a pat (`pat`: it wiggles, `.fw`, and blurps one). `feed` is a
  frame loop only while a bubble is out, reading no layout; `blurp`, `dart`, `gulp`, `burp`, `pat` in `motion()`,
  `peix.state().swim`; none under reduced motion (no swim). A lane of its own, outside the redrawn slots, **the bar's free room** since 2026-10-11, later (64 px before:
  `flex: 1`; `swimFrames`/`swimMs` follow its width at the same speed in pixels, its place kept, a `ResizeObserver` on
  it), the fish an SVG of `FISH`; a click is ⌥⌘A) — and `#sbRight`:
  the machine (`prefs.barStats`: CPU and memory by default since 2026-10-09 — `sbStats`, none, before; a pick there
  carries over —, Claude's memory a box in the settings — `GET
  /api/stats?want=cpu,mem,claude`, every 3 s while shown and visible, `machineStats` on the server: the cores' busy share
  since the last ask, vm_stat's used as Activity Monitor counts it, `ps` over the registry's live claude pids), **the
  plan usage as meters** — every meter a pie since 2026-10-11, later (`sbMeter`: the label, a 12 px `conic-gradient`
  pie of what is spent in its colour, the percent; RAM a percent too, its sizes in the tooltip) — with the bar on, the list's foot has none (`:root[data-sbar] #usage`) — whose click lifts its
  rows in a panel (`usageRows`, shared with `#usage`; a click elsewhere, by `composedPath()`, puts it away), and **both
  awake switches** (`#sbAwake` the cup, amber while on, muted while it has nothing to hold off; `#sbLid` the laptop, red while on, *Touch ID…* while sudo asks;
  muted marks while off), and **the clock, last** (2026-10-11, later: `.clock`, the time on a 24-hour clock whatever the
  locale — `hourCycle: 'h23'`, 2026-10-11, late night; the who-lines' form before — the day in its tooltip; `clockTick` draws the bar again on the minute). **The list's foot row goes** — the fish, the search, the usage (`:root[data-sbar]
  :is(#shd, #sfoot)`) — on the rail too; the bar off, `dockBar(false)` puts `#filters` and `#people` back. The slots
  `#sbLeft`/`#sbRight` are drawn by markup (`setHtml`) from `renderBoard`, the usage, the awake state, the stream and
  each stats answer; the two moved-in nodes are never redrawn by the bar. → `scripts/scenarios/status-bar.mjs`, the stats in `test/awake.test.mjs`.
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
  when the board last showed each chat
  and which are for good, the PRs taken off a chat, named projects, board titles, pins, hidden, the environment each chat was started in, notifications on or off, PR
  turns; `STATE_FILE` overrides) and the user's `~/.config/peixairada/config.json` (the setup, below), both shared by
  the app and every browser; the browser's `localStorage` `peixairada-prefs`
  (selected project, the lanes folded, widths, zoom, folds, card size and compact's same height, simple colours and their one colour, the theme for each appearance, the tiles, their stack and their glow, the changes tab's scope, the person the list is narrowed to, the list's filter, ⌥ as Meta, auto-resume, the edge light, the light under the pointer, the floating header, sounds, the status bar and what it adds, the faces folded, drawer open/height — the keys are the `prefs` literal,
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

### Hotkeys and the pane

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
  ⌥⌘B), **Y the themes** (`themesOpen`, 2026-10-10), **L the launcher** (`pickOpen('launch')`, 2026-10-10), **D the chat's changes** (`hotDiff`, 2026-10-10), **A the overview** (`ovOpen`, 2026-10-10), **S the tiles' stack** (`hotStack`, 2026-10-10 — not in `boardKeys`: from a page in the pane ⌥⌘S stays VS Code Web's Save All), **0 home** (`hotHome`: no chat open, 2026-10-10), N a
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
  its chat tab, if still open), and ⌥⌘T's zsh and the editor's page wait on a chat that was left. **Every key is a row of `KEYS`** (2026-10-12; the Keys pane was typed by hand before): what you press, its group
  (*Go to · This chat · Layout · Look · In the drawer · In a page*), one line, the rest its tooltip, and the codes it
  is in HOTKEYS or CMDKEYS — the Keys pane and the ? sheet are drawn from it, and `scripts/check-page.mjs` (`npm run
  check`) fails a HOTKEYS or CMDKEYS code with no row, a row no map answers, or a ⌥⌘ letter `boardKeys` in main.swift
  does not forward (⌥⌘S aside).
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
  and `TITLE_ROOM`) — the floating header's runs on under the housing instead, lowered a little (`.tunder`, above), and
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
  keeps the query; the mark shows only while the box has the keyboard (`markQsel()`, on every render). The project in
  view still applies; a folded lane does not — a query shows every match. → `scripts/scenarios/chat-filter.mjs`.
* **A right-click is a menu where ⌥-click, a double-click or a drag did alone** (2026-10-12, `#ctxm`, `ctxRows`, shown
  by `ctxShow` — the list's filter's menu too): on a
  card — Open, Rename…, Done / Done for good / Back on the board, Take #n off this chat for each PR, Copy its link; on a
  PR chip (card, header, row) — Open the PR, Take it off this chat; on the colour square — Pick a colour…, Let go of the
  colour. Not in a box, a terminal or the transcript's words (the system's menu there). The launcher has the open
  chat's rows too (Rename it, Take #n off it, Move this tab to the other half, Let go of its project's colour).
  → `scripts/scenarios/context-menu.mjs`.
* **⌥⌘L is the launcher, one box for everything** (2026-10-10; Walker and the Omarchy menu): `#pick` in mode `launch` —
  `launchRows` gives each section's best (chats, projects, PRs across every chat `allPrs`, tickets `allTickets`,
  `actionRows`, `toggleRows`), six each, all of them under a prefix (`>` actions and switches, `#` PRs, `@` projects,
  `!` tickets); a section's first row carries its head (`.pkhd`, not a `.pkrow`). Empty, it is the menu
  (`LAUNCH_MENU`): → or ⏎ goes into a row with › — the other pickers, opened with `ctx.back`, and two modes of its own,
  `toggle` and `prs` — and ← or ⌫ on an empty box comes back. **A switch is the settings' own checkbox, clicked**
  (`SWITCHES`), so its handler is the one that runs; ⏎ flips and the menu stays. **`?` is the sheet of every key**
  (`keysOpen`, `#keysheet`), outside a box or a terminal: the settings' Keys pane is its source, its box narrows by
  words. → `scripts/scenarios/launcher.mjs`.
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
  repos under the home), the only thing the board writes outside its own state and config** — and `cloneAndStart()` carries on into the same flow.
  **A worktree is not offered** (2026-10-09, evening): a folder whose `.git` is a file naming `…/worktrees/…` is
  `worktree` in the listing (`isWorktree`) and `freeFolders` skips it — one a chat ran in is a project anyway, and
  typed by its whole name it is offered as itself (`cloneRows`). A long path belongs beside the name (`.cur`),
  never in the row's `auto` column. → `scripts/scenarios/new-project.mjs`. **A clone is one per folder and says how
  far it is** (2026-10-09): `clones`, by the folder cloned into — a second ask joins the one under way (git makes the
  folder at once, and it was "already there" to a second ask), and a spawn in it is refused until it is done
  (`cloneUnder`); `gh repo clone … -- --progress` (git writes no progress into a pipe otherwise), its phases weighted
  into one percent (`CLONE_PHASES`) and broadcast as `clone` events (`clones` in the snapshot too); a failure removes
  what git left. → `test/folders.test.mjs`.
* **A chat's folder not checked out is cloned before the chat starts** (2026-10-09): `spawnTerm` refuses a folder that
  is not there (or is being cloned) with `clone` — **`cloneFor(cwd)`: under one of the setup's roots with an org,
  `<root>/<name>[/…]` is `<org>/<name>`**, null for a folder under no such root or inside a repo folder that is there
  (a worktree since removed) — and an error that says which. The page's `withCheckout(key, spawn)` clones it through
  `/api/clone` and asks again, for a resume (`openTerminalFor`), ⌥⌘T and a new chat (`newChat`). **What it draws**
  (`cloneShown`, from `state.clones`): the resume bar is the clone — its title, git's phase and percent, the line along
  its top as the progress (`.cloning`, `--clone-p`), a ring turning round the mark; a new chat's column is a
  `.clonebox` (and the picker's clone line is one too); the status bar has a `.cl` segment per clone. A new chat
  cloned while another chat was opened does not take the column back: it is a card. **Before the resume**, the summary
  of a chat with no claude says `folderMissing` and `cloneRef` (not `gone` — the card's class for no process), so the
  bar says what Resume will do and the button is *Clone and resume*; with no `cloneRef` the auto-resume does not arm.
  → `scripts/scenarios/clone-folder.mjs`.
* **The settings are one modal dialog** (`#settings`, 2026-09-28; the cog's popover before): **⌘,** (`CMDKEYS.Comma`,
  in the app the app menu's *Settings…*, which asks `peixKey` as ⌘W does), the chat header's ··· (`#settingsBtn`, the
  menu's last row) and, with no chat open, the empty header's own ··· (`#noChatMore`, delegated — `leaveChat` rewrites
  the header). A head (the name, the counts, × `#settingsClose`), a segmented control (`.stabs`) over three panes
  (`.spane`): **Board** — in sections since 2026-10-12 (`h4.shd`: *Alerts · Chats · Look · Terminal*, and *Lights and
  motion* folded, `details.sadv` — the rings' step, the card light as a choice of *ring* or *edge*, `.lightpick` over the
  hidden `#edgeLight`, and the light under the pointer): the notifications switch (`#notifyOn`), the rings' step (`#ringsInStep`), the edge light (`#edgeLight`), the light under the pointer (`#cardSpot`), the floating header (`#headFloat`), sounds (`#soundsOn`), the status bar (`#sbarOn`) and what it adds (`#sbarStats`), the cards' size
  (`.dens`), auto-resume (`#autoResume`), ⌥ as Meta (`#optMeta`), what is hidden (`#hidden`) — no date format (DD-MM-YYYY, `fmtDate`); **Setup** — the server's (`#setup`); **Keys** — the list (`.keys`). The class
  is still `pop`, so every row keeps its `.pop …` rule. Esc, the backdrop, ×, ⌘, or ⌘W close it; its `close` drops a
  setup row half typed. **It is modal**: the pane is down while it is up (`postPane`), and the ⌥⌘ / ⌘ keys are swallowed
  under it — close it first (the scenarios do). The fish is the SSE light — **belly-up while the stream is down** (2026-10-11: `.fishg` flipped, the sparks
  out, bobbing, grey; back, it flips over and wiggles, `.back` for 900 ms; the status bar's connection wears the same
  fish, in the ready green with no square, as its light — `FISH_LOGO()`, animations rather than transitions since the
  bar redraws it; `fishback` in `motion()`) — and, clicked, **the About box** (`#about`, a modal dialog:
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
  posts `{type: 'state', needs, replied, moves, working}` from `renderBoard` when what wants you changes (`postState`, `wanting()`:
  the chats asking you and the ones with a new reply; **the Dock's badge and the menu bar's count are both their number**
  and the status menu lists them — with the PRs at your move and what is clauding, uncounted — 2026-10-12; the badge
  counted the alerts that came while the app was in the back,
  the menu bar the questions; the page's own title the same), each alert as
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
* **The trackpad bumps** (2026-10-11, `haptic(kind)` → `{type: 'haptic', kind}` → `NSHapticFeedbackManager`'s
  `.alignment`, `.levelChange`, `.generic`): the list's splitter snapping to the list's own width (`LIST_W`) or half
  the window, the halves' divider to even halves (both within `SNAP_PX`), a tab dropped into the other half
  (`moveTab`), the timeline's thumb crossing a run (`tlScrub`). Only under a hand on a Force Touch trackpad — the page
  says when, never whether; in a browser it is a `haptic:<kind>` in `motion()` and nothing else.
* **A notification can be answered where it shows** (2026-10-12): the app's carry a category — a reply on a chat
  with a drawer here *Reply… · Done · In 15 minutes*, one elsewhere *Done · In 15 minutes*, a question or a PR's turn
  *In 15 minutes* alone (a ✓ ends the chat's processes; a question is Claude waiting). Reply… and Done go to the page
  (`window.peixReply` — the chat's drawer over the page's own socket, else one opened for it, which sends no size;
  `window.peixDone` — `tickDone`, where `canTick`); the snooze is the same alert again, by the system's clock. The page
  says whether a drawer runs here on the alert it posts (`drawer`). → `scripts/scenarios/notify-actions.mjs`.
* **The board zooms as a whole in the app** (2026-10-12, `prefs.pageZoom`, the settings' *text size*): `{type: 'zoom'}`
  sets the board view's `pageZoom`; the page's CSS px are then `zoom` points, and main.swift turns what crosses — the
  pane's rects (×), `peixPane`'s edge and `peixFill`'s housing (÷). Never CSS `zoom` on the root (rects read and written
  back as CSS would scale twice). A browser zooms itself.
* **Both web views are inspectable** (main.swift sets it): Safari → Develop reaches the real app.
* **The app's server lifecycle** (`ServerController`, main-thread throughout): `start` adopts a server already
  answering, waits for the launchd agent when its plist is installed, else runs the bundled one — one at a time,
  ended when given up on — with its log *appended* (`O_APPEND`); `restart` is `launchctl kickstart -k` for an adopted
  agent, and otherwise waits for the probe to fail before starting again; the 5 s watchdog probes `/api/projects` and
  brings the board back over a message once the server answers (`boardShown`). A web process that dies is loaded
  again. `logLine` writes on its own queue with one formatter and one handle. The bridge answers the board's own main
  frame only.

### The chat column's two halves

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
* **Tiles: the chats that want an eye, stacked beside the open one** (2026-10-10; Settings → Board → *tiles*,
  `prefs.tiles` → `main.tiles`, on by default since 2026-10-11, evening): **the look, and a stack that is a switch of its own** — *the stack*
  under it (`#tileStackOn`, `prefs.tileStack`, off by default) and **⌥⌘S** (`hotStack`, Omarchy's scratchpad key; with
  tiles off it turns both on), and the × at the first tile's top left (`.sclose`, its title the key) hides it. `tilesOn` is the look (the border's `.kf`, the notch), `stackOn` the column. The stack is
  `#stack`, a third column after `#chat` — up to three chats of the list
  as it stands that are alive and asking or clauding, never the open one (`stackChats`), each a live tile (`mountMini`
  into its own registry, `stackMinis`, else `tailHtml`, the tails asked every 2.5 s while any tile needs them); a click
  makes one the chat. Kept by chat (`stackTiles`), drawn in the frame after the board (`stackSoon` from `renderBoard`
  — `tilesOn` and `stackOn` are `var`s, as `renderBoard` runs before the block has). Hyprland's look rides on the class: gaps
  (`main`'s padding, the splitter an 8 px gap), square panels, **each panel's border its project's colour**
  (`--tile-edge`: `tileEdge` from `tintChat`, `tileTints` and `renderStack`; a near-black one `--tile-grey`, the grey
  that reads on the ground; none `--nocolor`) — 30 % of it into `--tile-line`, and **whole on the panel the keys are in**
  (`.kf`, from a press or a focus inside it: the list, the chat or a tile; Omarchy's gradient border until the same
  evening). **The list on ALL, no project's, wears the open chat's colour**, and **the wallpaper is in that hue**
  (`--wallc` on `#wall`, registered and eased: the chat column's colour, else the list's project's, else the accent —
  `tileTints`, from `renderSessionList` and `tintChat`). **Its bright glow eases after the pointer** (2026-10-11, late
  night; *the glow follows the pointer* under the tiles' switch, `prefs.wallFollow`, on): the wallpaper is `#wall`, a
  fixed layer under the board (the body's ground before), and its glow `#wall i`, the same ellipse, a layer of its own
  moved by a transform — `wallGo`, once a frame from the document's `pointermove`, the `transition` easing it — so a
  move repaints nothing; it stays where the pointer left the page, and off, under reduced motion or without tiles it
  is in its corner (88 % 6 %). **At the notch a panel the housing reaches is cut round it**,
  hugging it (2026-10-11, later; the tiles' gap away before), its border running round the cut (`tileNotch`, from
  `layoutNotch` and `renderStack`: the panel's `clip-path` is the hole — the housing's own shape, its lower corners
  `HOUSING_R`, 9 px by eye, the system does not say it —, `.ncut` the border's three sides, concentric with it, its
  colour the panel's by `border-color: inherit`; and the panel's corners beside its top round too, where the screen
  flares into the housing: `.ncap`, a quarter ring each), and the row keeps `notchPad()` clear of it — 12 px with tiles
  (the border's 2), `NOTCH_PAD` without. **On that screen the tiles in its two top
  corners round as the screen's do** (`main.tiles.notch`, `--screen-r` 10 px — the screen's radius by eye less the gap;
  the list's top left, and the first tile of the stack's top right, or the chat's without one; `overflow: hidden`, so
  the header's black does not square it off): a housing is what says the screen is a MacBook's own, so a fill on an
  external display (`peixFill` with no notch) keeps them square.
  The open chat's light past its card does not run with tiles (`trailGeom`). → `scripts/scenarios/tiles.mjs` (the
  fake claude's `slow <s>` prompt keeps a turn going).
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
* **A strip moves rather than jumps** (2026-10-11, `tabMotion`, from `renderTabs`, which reads the strip only when
  it is about to draw it anew and only for the same chat): the highlight slides from the tab that had it (`.ptabpill`
  over the strip, the new `.on` tab `.slid` — plain — until it lands), a new tab grows in from nothing, a closed one
  folds where it stood as a stand-in `.ptabgone` — never a `.ptab`, so what counts the tabs counts the real ones. A
  strip coming out of hiding just appears. `tabslide`, `tabgrow`, `tabfold` in `motion()`.
* **The strip is one family of controls** (2026-10-11, evening — the Round IV studies' Q1, Q5 and Q7): every tab,
  nav button and field 26 px with a 6 px radius (the header's PR chips and `+n −n` too), no fill at rest and `--ctl`
  under the pointer; **the tab in front and the rule of the half with the keys in `--tablit`** — the chat's colour
  lifted to read on the panel, as a card's `--lift`, set on `#chat` — never the accent; the glyphs drawn (`ICON.back`,
  `forward`, `reload`, `external`, `side`, `over`, `close`: strokes, `.ic.st`). **A tab's × is drawn over its mark,
  under the pointer**; short of room (`.ptabs` is a size container, under 640 px) the tabs behind the one in front fold
  to their marks, the name in the tooltip — and lose the × (a mark alone is chosen, never closed: ⌥⌘W). **The page in
  front is its own address** (Q5): its tab is a `div.ptab.addr` (it holds buttons) — the mark, `.purl` (no scheme, the
  host `.h` quieter: `urlHtml`, which `peixPaneUrl` draws too; the editor's is *VS Code · its folder*, `addrHtml`,
  2026-10-12) and `.navs` inside, a click on the address still copying
  it; a page behind wears its name. **The half's ◫/⊟ and ⨯ are behind ⋯** (`.gmore` → `.gopen` on the strip, folded
  again when the pointer leaves it; `.click()` on `.gturn` / `.gclose` works folded). The tab drag ignores a press on
  the address or its buttons. **With tiles, split, each half is a tile of its own** (Q7): 8 px round and between them
  (`#gsplit` is the gap), each bordered as the tiles are — 30 % of `--tile-edge`, whole on the half with the keys — the
  rule under a strip and a lone strip's 2 px gone; under the floating header the halves start below it (`#groups`
  pads by `--float-h`, not the halves). → the address steps of `pane-tabs.mjs`, the strip's step of `split-halves.mjs`.
* **A half whose one tab is not a web page has no strip** (2026-09-28): split, claude, the zsh or the editor alone in
  a half makes its strip `.lone` — emptied, a 2 px rule, the accent under the keys and the line elsewhere, **the same
  height either way**, so moving the keys resizes no terminal. A web page alone keeps its strip (the address, ‹ › ↻ ↗),
  an empty half keeps its (the drop, ⋯), and a half of two tabs is a strip as ever. What the lone tab's × did is
  ⌥⌘W's and the header menu's (*end the zsh*, *close VS Code Web*; `dropTab()` — the keys go back to the chat when the
  half empties); ⌘W / ⌘0 close the half and the keys turn it; a lone tab cannot be dragged. Unsplit, the strip hides
  under two tabs as it always did. → `scripts/scenarios/split-halves.mjs`, `split-stacked.mjs`, `pane-tabs.mjs`.
* **Placement is derived**: `tabs` holds `[left, right]` per chat and `placeOf(s)` reads it against `keysIn` *now* —
  a key that is gone falls away. `tabOf(s)` is the focused half's. A half with nothing says what would fill it
  (`.gempty`) and its strip takes a drop (`.pdrop`).
* **The changes tab is git in the chat's folder, read when asked** (2026-10-10; ⌥⌘D, the header's `+n −n` chip
  `#diffBtn`, the ··· row `#chgBtn`): a tab `changes` beside claude and the zsh while the chat is in `changesOpen`, one
  element `#chg` moved into the half that shows it (`placeChanges`, from `syncTerm`, as `placeLog` moves the
  transcript), opened by `openNewTab` like any new tab. `GET /api/sessions/:id/changes?scope=` — `uncommitted` (the
  tree against HEAD, untracked files as added), `branch` (against the merge base with origin's default branch), `turn`
  (the uncommitted diff of the files the last turn's Edit / Write calls named, `s.turnFiles`, reset by a prompt that
  starts a turn) — and `?stat=1` for the chip's counts, kept 4 s per folder (`changeStat`); `prefs.changesScope`
  remembers the scope. Re-read when the chat has moved on (`upto` against `lastActivity`) or by ↻; nothing is polled.
  **Commit…, Push and PR… type the command into the chat's zsh, unrun** (`typeInShell`); **a note on a line is a
  prompt typed into the chat's claude** when it is in a drawer here (`sendToClaude`), copied otherwise. Diff lines are
  highlight.js per line by extension (`DIFF_LANG`). → `test/changes.test.mjs`, `scripts/scenarios/changes-tab.mjs`.
* **An MCP tool is named by its server and tool** (2026-10-12, `toolName`): *Slack: search users*, in the rows, a run's
  summary, the card's live line and the tiles; the raw name is the row's tooltip.
* **A tool call wears its state** (2026-10-11, `toolRes`, `toolMark`): each tool_use row starts with `.tst[data-tu]` —
  `run` (a ring turning while `#log.working`, which `renderPresence` sets; still otherwise), `ok` (a dot), `err` (a red
  cross) — from the results the open chat's entries hold; a result arriving for a row already drawn sets its mark with a
  pop, and a folded run's summary carries the turning ring while any of its calls is out.
* **The transcript reads as a conversation** (2026-10-08, from the agent apps): your words are a bubble on the right,
  as wide as they are (`.msg.user`); Claude's paragraphs, lists, quotes and headings stop at 80ch (2026-10-12), its
  code, tables and images taking the width they need; Claude's run the width under **one who-line a turn** — a text after another of
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
  clauding (the `.pix` sprite and the word, **which shimmers** — `shim()`, as the Clauding lane's name does: a window
  the word's width, masked to a soft band, and its `::before` copy from `data-t` moving opposite ways by transform, so
  the text is in the DOM once; `shimw`/`shimi`, phased; **and every `VERB_MS` its word becomes a fish market's** —
  `VERBS`, rolled in place in `.verb`, the markup still saying *clauding…*) or asking (`askHtml`), and removes it otherwise, **and after it the
  new-reply pill** (`.lognew`, `logNew()`, made on first need): `renderLog` inserts new nodes before that tail, marks
  them `.in` (the fade; never on the first fill) — **but a reply of Claude's landing with the log at its end comes up
  part by part instead** (2026-10-11, `reveal`: its `.text > *` and footer out of a 3 px blur, `REVEAL_GAP` apart;
  `reveal` in `motion()`, its count as `dy`) and, when the log is not at its end, lights the pill; the log's scroll
  listener puts it away at the end. Anything else that appends to the log has to go before the tail, and a check for
  "the last message" reads `:scope > .msg:last-of-type`. → `scripts/scenarios/transcript-live.mjs`.
* **Split or not is the chat's**: `splits`, a set of chat ids beside the `tabs` map and lasting as long as it does.
  `syncTerm` calls `applySplit()` on every open, so the column follows whichever chat is in front; only the divider's
  place is the board's. **⌘W closes the half the keys are in**, and each strip's ⨯ closes *its own* half
  (`closeHalf(g)`): what the column keeps is the other half's tab, or the closer's when the other had none. **⌘0 is
  the mirror**: it closes the *other* half. The per-chat maps (`tabs`, `homes`, `splits`, `autoSplit`, `stacked`,
  `focusView`, `state.unread`, `state.paneGh`) are pruned on every snapshot to the chats the board still has.
  → `scripts/scenarios/split-halves.mjs`, the split section of `pane-tabs.mjs`.

### The drawer

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
  repaint over whatever the page holds. **The row-short repaint is never shown** (2026-10-11, late afternoon: a chat
  switched to drew its drawer a row high, then dropped it — the prompt is pinned to the bottom of the size it is
  told): the nudge starts on the socket's first frame, the snapshot, and what follows until the true size's repaint has
  come (`NUDGE_QUIET_MS` with nothing, `NUDGE_MAX_MS` at most) is held through `toXt` (`tm.refits`, as a refit's) and
  written at once. → `scripts/scenarios/drawer-switch.mjs`.
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
* **The Mac's line-editing keys are iTerm's Natural Text Editing** (2026-10-09, `MAC_EDIT` / `macEdit` in the drawer's
  key handler): ⌘← ⌘→ send ⌃A ⌃E, ⌘⌫ ⌃U, ⌘⌦ ⌃K, ⌥⌦ ESC d — control codes, which Claude Code's prompt and zsh both
  read; xterm sends nothing for ⌘ with an arrow, a plain DEL for ⌘⌫, and a modified Delete for ⌥⌦ (Claude Code: to the
  line's end). ⌥← ⌥→ ⌥⌫ are xterm's own (ESC b, ESC f, ESC DEL). ⇧, ⌃, or ⌘ with ⌥ (the board's ⌥⌘←→) is none of them.
  ⌘Z is the app's Edit menu (the page never sees it) — Claude Code's undo, ⌃_, is not mapped.
  → `scripts/scenarios/drawer-mackeys.mjs`.
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
  `renderResume` from `renderHead` while `resumable(s)` — no process, a file, no drawer on the chat; *Claude isn't
  running in this chat*, a second line only when there is something to know (2026-10-12); Resume is
  `termAction` (>_'s path, ⌥⌘C). **Opening such a chat counts down to its resume** (`armResume` from `openSession`,
  `AUTO_RESUME_MS`; `prefs.autoResume`, the settings' *auto-resume*): the button counts, a line runs along the bar's top
  (`rfill`, its time set from the countdown's), and `termAction(s, { stay: true })` keeps the tab and the keys. Not
  now, Esc outside a terminal, another chat and the switch stop it (`stopResume`); a dialog up holds it. A done chat,
  one whose claude ends while open, and the one a load opens (`openSession(id, { auto: false })`) wait for the button.
  **The harness has it off**: `launchChrome` writes `autoResume: false` into the prefs of every page it drives unless
  set — `verify --hash` drives the live board. `peix.state().resume`. → `scripts/scenarios/resume-bar.mjs`.

### Invariants that bit us — one line each, the story in Findings

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
* **A running animation is moved by its `currentTime`, never its `startTime` alone** (2026-10-11, night): WebKit — the
  app — hands a transform to the compositor, and a start set once it has (a frame after the node was made, or the
  switch's re-phase) reads back from the script but never reaches the screen; Chrome takes either, so the harness
  cannot see it. `phaseAnims` sets the current time, then the start (which resolves a pending one and makes it exact).
  The proof is the compositor's frame, not the script's word: `npm run webkit` (see Verifying).
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
  **With the board the window in front, an alert can be heard instead** (2026-10-11, `chime`, Settings → Board →
  *sounds*, `prefs.sounds`, off by default): a tick for a reply or a PR, two rising notes for a question — Web Audio,
  its context made on a press or a key (`audioUp`), the switch's change playing the tick; `sound:<kind>` in `motion()`.
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

### Verifying changes

**Do not claim a UI change works without loading it in a real browser** — squashed cards, detached fins, column
overlap, lone digits were all invisible in the code and obvious on screen. Look at the screenshots (`Read` renders PNGs).

* `npm run verify -- "<js>"` evaluates one expression on the live board; `--hash <id>` opens a chat first,
  `--shot file.png` saves a screenshot after, `DARK=1`, `URL=http://127.0.0.1:<port>/`. `--dump-dom` is useless here
  (fires before the SSE snapshot); drive Chrome over CDP — `lib/cdp.mjs`.
* **What only the app shows is checked in WebKit** (2026-10-11, late night; `npm run webkit -- "<body>"`): the harness
  is Chrome, and a bug of WebKit's passes every scenario — rings in step did. `scripts/webkit.mjs` compiles
  `scripts/webkit.swift` on first use and runs an async body on the live board in a `WKWebView` (`frame`, `sleep`,
  `until` at hand; `--hash`, `URL`, `SIZE`, `PREFS` — the app's defaults otherwise, auto-resume off); `--shot` saves the
  window as **the compositor** drew it (`CGWindowListCreateImage` on its own window, no grant needed), and `--then`
  runs a second body on that frame — `shot.px(x, y)`, `shot.where(test, rect)` (a count and a centroid), in sRGB and
  CSS px. **The window is opaque and on screen by one pixel**, in a corner of the main screen: wholly off a screen,
  WebKit hides the page and runs no frames; at 1 % opacity the colours came back in steps of 85. A locked screen hides
  it too, and it says so.
* `npm run scenario -- scripts/scenarios/<name>.mjs` for anything with more than one step. A scenario exports
  `meta` (`server`, `fake`, `fixture`, `env`, and `prefs` — what the page starts from, 2026-10-09: `{ statusBar: false }`
  for a scenario about the list's foot; **without it a page starts with every lane open, large cards, and neither tiles nor the
  floating header**, the board's defaults since 2026-10-11 — the scenarios measure the plain column, and the ones about
  those two turn them on) and a default `async (ctx) => result`; the runner starts a throwaway server
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
  `peix(expr)`, `server.api/post/terminals/restart/logText`, `fixture.chats`, `assert`. The sixty-six in
  `scripts/scenarios/` are the regression checks for the drawer (a chat switched to with it open, and a new one under the floating header, too), the hotkeys, the tab strip and the split, the new-chat
  flow, the project step, the chat list's rules, its filter, its ends, its timeline and its motion, the card sizes and
  marks and the PR stack, the notifications switch, the usage bar, the project cue, the header's PRs and its ··· menu, a PR's turn, the chat's links,
  the notch, reduced motion, the transcript's presence line, the code blocks' bar, the window's title, the cog's setup, the open chat's light, /compact in the drawer, the people row, the tick moving on, simple colours, the first run's welcome, a PR named short, the resume bar, keeping the Mac awake, Jira tickets, the transcript's turns, a PR's CI, the floating header, the status bar, the light under the pointer, the Mac's line-editing keys in the drawer, a chat's folder cloned before it resumes, the themes, the launcher and the keys sheet, the changes tab, the overview, the tiles, the home, the lanes that fold, a notification answered where it shows, the right-click menu, and the small motions of 2026-10-11 (`small-motions.mjs`, one section each, for those no other scenario had a place for).
* **`npm run scenarios` runs the lot**, one at a time — four servers and four Chromes at once is how a suite
  starts failing on the clock rather than on the board. A failure is **run once more**: passing then is reported
  `FLAKY`, and the suite still exits 0; `--no-retry` is the honest gate.
* **Not just after local midnight**: the fixtures are minutes to hours old, so a run then puts a day line between
  them — `card-signals` sees a divider too many (its first quarter hour), `transcript-live` a second node fading in
  (until 02:00: its long chat is two hours old), `home` fewer rows than its chats (until 01:00: the day starts at
  midnight and its oldest chat is an hour old), and `readme-shots.mjs` draws a `DD-MM-YYYY` line into the README's
  board. They fail the same on older commits; wait — or run them with `TZ=` a zone where it is morning, which Chrome
  and the page follow.
* **The auto fixture's second folder is the temp dir's real path** (`realpathSync(tmpdir())`): a fake claude started
  there registers `/private/var/…`. **Its two chats are a second apart** (`defaultFixture`), so the board's order
  between them is never the readdir's.
* **Every test server gets a fast clock, an empty org directory, and nothing of this Mac's** (`lib/testserver.mjs`):
  `REGISTRY_POLL_MS` 1200, `TASK_GRACE_MS` 400 and `CONFIG_POLL_MS` 200; an `ORG_DIR` of its own under the state dir —
  which also keeps the first run's welcome away; an empty `CLAUDE_DIR` of its own unless given a fixture; the fake gh
  (`GH_BIN`, no PR file: GitHub shows nothing); fake `caffeinate` and `pmset`, run without a password dialog
  (`AWAKE_ADMIN=none`); Jira's token in a file of its own (`JIRA_TOKEN_FILE`), no jira-cli config and no inherited
  `JIRA_API_TOKEN`; a `ZDOTDIR` with no rc files for its drawers' zsh; VS Code Web never kept fresh (`VSWEB_FRESH_MS`
  0: no update service, no serve-web started); and no inherited
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

### Deliberately not done

* **Riso, a light theme in two inks — later, not never** (2026-10-09, the design studies' G): the intention, the
  palette, the shapes and a screenshot are in `docs/studies/` (`README.md`, `riso.css`, `riso-light.jpg`). When it is
  built it is a theme to pick, beside simple colours.

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
