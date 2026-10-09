# peixAIrada — decision log and hand-off

What was decided, why, and what is still open, so the work can be picked up in another session.
Newest at the top of each list. `CLAUDE.md` is the working notes (how things are built, what bit us);
this file is the *why* and the *state*. Last updated 2026-10-09. The company, its repos and the people on its PRs go
by stand-ins here — `acme`, made-up repo names and PR numbers — since 2026-10-01; keep it so.

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
