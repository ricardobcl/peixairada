# peixAIrada — the guide

Everything the [README](../README.md) leaves out: every feature, the keys, installing in full, the settings and the
setup file, and how the pictures are made.

- [The board](#the-board) · [Beside a chat](#beside-a-chat) · [Make it yours](#make-it-yours) · [Keys](#keys)
- [Install in full](#install-in-full) · [Settings and setup](#settings-and-setup) · [Hacking](#hacking)

## The board

- 🚦 **Sorted by who owes whom** — in lanes: asking you, clauding, then the rest by their last word — ready, and idle
  (untouched for more than four days). *Done* is a tick you give; Idle and Done start folded, and a click on any lane's
  head folds or opens it. **The funnel** beside the search shows only the chats with a PR at your move, or only those
  Claude answered since you last looked. Cards are compact unless you'd rather — or large only for the chats that want
  you.
- 💡 **The card's edge tells you why it's busy** — each card a lit edge in its project's colour; a light runs round it
  while Claude works, one per sub-agent, slower for a monitor; a question pings out in red.
- 🔔 **Alerts** — a notification when a chat finishes or needs you, answered where it shows in the app: *Reply…*
  (straight into the chat's Claude, when it runs here), *Done*, or *In 15 minutes*. The Dock badge and the menu bar
  count the chats asking you and those with a new reply; the menu lists them, your PRs' moves and what is clauding.
- 🐙 **PRs** — chips stacked on a card, fanned out under the pointer (scroll them when they're more than fit). ⌥-click
  the ✓ to tick a chat done for good: its PRs won't bring it back. Take a PR off a chat from its chip's right-click
  menu (or ⌥-click) — until you name it there yourself.
- 🎫 **Jira tickets** — a ticket a chat names (`ACME-12`, a link, its branch) wears its status on the card and in the
  header, beside its PRs. Set your site, email and an API token in Setup.
- 🎨 **Projects** — folders, or named sets of folders, each in a colour of your choosing.
- 🏠 **Home** — with no chat open (⌥⌘0): an ASCII sunset at sea with our fish leaping across the sun (click it), the
  board at a glance — each count a way to what it counts — and your day, every chat's turns and how long each waited
  on you.
- 🐟 **It moves when something happens** — counts roll to their new value, a ✓ draws itself, an answered question's
  ring closes in, a PR's CI is drawn in as it lands; a clauding card names the tool it is running, a monitor's card
  its newest event; a pixel fish in the status bar swims faster the more agents are at work, and floats belly-up
  while the board has lost its server. In the app the trackpad bumps as a divider snaps; sounds, if you switch them
  on. All of it stills under the system's *reduce motion*.
- 📊 **A status bar** — along the window's foot: the search, the connection, what asks you, the board's own update,
  the faces on your PRs, your plan's limits (or its monthly spend cap) as small pies, keeping the Mac awake (with the
  lid closed too, by Touch ID where sudo takes it), CPU and memory, and the time.

<table>
  <tr>
    <td><img width="380" src="shots/cards-dark.webp" alt="Cards: asking, working with your move on its PR, three sub-agents, and a monitor"></td>
    <td><img width="380" src="shots/timeline-dark.webp" alt="The timeline swelled under the pointer, every day's label out"></td>
  </tr>
  <tr>
    <td align="center"><sub>asking · clauding, your move on its PR · sub-agents · watching</sub></td>
    <td align="center"><sub>point at the scrollbar and the days come out</sub></td>
  </tr>
</table>

<p align="center"><img width="760" src="shots/home-dark.webp" alt="Home: the board's facts beside a pixel fish, and the day — every chat's turns, waits and monitors since the morning"><br><sub>⌥⌘0 — home: the board at a glance, and your day</sub></p>

## Beside a chat

Each is a tab of the chat; the column splits in two halves when there's more than one thing to look at.

<img src="shots/chat-dark.webp" alt="A chat with Claude Code resumed in the pane on the left, the PR's state and CI under the header, and the repo open in VS Code Web on the right">

| Key | Beside the chat |
|---|---|
| ⌥⌘C | 🖥️ **Claude Code itself** — the real terminal: resume any chat, or take over one running in iTerm or VS Code. A chat whose Claude has ended resumes on a click (or ⌥⌘C), cloning its repo first when its folder isn't checked out, and making its worktree again when that was removed (on the chat's branch). It survives the board's restarts. |
| ⌥⌘T · ⌘T | 🐚 **A shell** in the chat's folder, on a tab of its own — ⌘T opens another, or on a web page a blank tab, its address ready to type into. ⌘W closes the tab you are in. |
| ⌥⌘G | 🐙 **The PR on GitHub** — its page on a tab (a chip in the header opens it too); its state, its CI and whose move it is under the header. With several, ⌥⌘G again from one picks another. |
| ⌥⌘E · ⌥⌘V | 🧩 **The in-app editor** on the chat's folder, on a tab: VS Code Web, or vim in a terminal (Settings › General › In-app editor) — or ⌥⌘V, the folder in the external editor: VS Code, or Zed (Settings › General › External editor), in its own window. A file path clicked in a chat opens there at its line. |
| ⌥⌘D | 🔀 **The chat's changes** — this turn's edits, everything uncommitted, the branch against its base, or a PR's, as a diff. Commit… and Push type into its shell; a note on a line goes to Claude. |
| ⌘2 · ⌥⌘2 | ◫ **Split** the column side by side, or one half over the other; drag a tab across, ⌘0 closes the other half. Press a tab's key again from it (⌥⌘C, ⌥⌘T, ⌥⌘G, ⌥⌘E, ⌥⌘D) and its half fills the column (⌥⌘G with several PRs: their picker first); once more, both are back. |

GitHub and VS Code open in the chat in the Mac app; in a browser they open in a tab of their own. In the app GitHub's pages
open on a tab of the chat and every other page in your browser, a link out of a page to another site too; Settings ›
General › Links keeps more sites in the board (an address's start each, like `github.com/acme` or `localhost:3000`), or
every page. The cards' PRs, rounds, tickets and faces can each be left out (Settings › Chat list › Show on a card), and
the PR list under the header is as tall as you drag its foot.

<table>
  <tr>
    <td><img width="420" src="shots/changes-dark.webp" alt="The chat's changes beside Claude: the uncommitted diff of the file it edited, Commit… and Push above it"></td>
    <td><img width="420" src="shots/overview-dark.webp" alt="⌥⌘A: every live chat in columns — asking you, clauding, watching — each showing what it is doing"></td>
  </tr>
  <tr>
    <td align="center"><sub>⌥⌘D — the diff of what Claude just did, the list hidden for the room (⌥⌘B)</sub></td>
    <td align="center"><sub>⌥⌘A — every agent at once, by what it wants from you</sub></td>
  </tr>
</table>

## Make it yours

Every look is in Settings › Appearance and Chat list (⌘,), or a key: the chat list hidden and the chat the whole width
(⌥⌘B, or the first button in the status bar, whose mark says which), Omarchy's twelve themes (⌥⌘Y — Tokyo Night,
Catppuccin, Gruvbox, Nord, Rosé Pine…), dark or light whatever macOS shows, or one of each following it; your projects
keep their hue in the theme's shades.

<table>
  <tr>
    <td><img width="420" src="shots/look-tokyo.webp" alt="The Tokyo Night theme"></td>
    <td><img width="420" src="shots/look-latte.webp" alt="The Catppuccin Latte theme, in light mode"></td>
  </tr>
  <tr>
    <td align="center"><sub><b>⌥⌘Y</b> — a dark theme (Tokyo Night)…</sub></td>
    <td align="center"><sub>…or a light one (Catppuccin Latte), whatever macOS shows</sub></td>
  </tr>
</table>

## Chat with the people you share it with

An optional chat between boards — off until you turn it on. One chat, with no rooms: it lives in a **private GitHub
repo**, as one issue whose comments are the messages, and every board reads it with its own `gh` login, so there is no
server to run and a Mac that slept catches up when it wakes.

- **Starting it** (whoever owns it): Settings › Chat › *A new chat* comes filled in — the newest GitHub organization
  you own and `chat` (your account if you own none) — and *Make it* makes it. The board makes the repo private and
  its one issue, *Chat* (labelled `room`). A free GitHub organization is the best home: there its
  members can be readers only — on a personal account every collaborator can also push and delete anyone's messages.
- **Inviting**: the chat's **People** (the two heads in its panel, the owner's alone) suggests the people of your chats'
  PRs, most often first, and takes any GitHub login. Only the repo's admin invites, cancels an invitation or removes
  someone — GitHub refuses it from anyone else's board too.
- **Joining**: an invitation shows as *invited* in the status bar and in Settings › Chat, with *Join*; GitHub mails it
  too. A chat you're already in is listed under *Your chats*, with *Use*; any other by its repo, which the board checks
  with GitHub first. A chat set up whose repo you can't read (not made yet, renamed, access gone) shows with *Forget
  it* above the same choices.
- **Using it**: *chat* in the status bar opens the panel (its count is what you haven't read); ⏎ sends, ⇧⏎ is a new
  line, Esc closes. Markdown works; images don't show and links open in your browser. A message from someone else
  while the panel isn't in front of you is a notification. ··· has the chat on GitHub, its settings, and leaving.
- **Polls**: the bar chart beside the box asks a question with two to eight answers — one answer each, or *Several
  each*. Everyone's votes show under each answer, by name; a click votes, another answer moves your vote, the same one
  again takes it back. *Lunch* fills it in with your lunch places and *Not today*. A vote is a reaction on GitHub —
  the poll's message there says which reaction is which answer —, so a vote given there counts too.

The board turns off GitHub's own emails about the chat's repo for you (its notifications, *ignored*) — otherwise every
message would mail everyone. What anyone says stays in their message: nothing from the chat is ever typed into a
terminal or handed to Claude.

## Lunch

An optional reminder that it's lunch time, and the day's menus of the places you go — off until Settings › Lunch
turns it on. Give it a time (the reminder's), the days, and each place with its Instagram account.

- **Before lunch**, through the morning, the board reads each place's menu: its posts as anyone sees them — a week's
  card, a month's dishes, a closure — and, with *Read the stories* on and an Instagram account logged in
  (*Log in to Instagram…* opens a window; it closes itself once you're in), its stories, where most places post the
  day's menu. A Slack channel where colleagues post the menus as screenshots is read too, if you name one. Claude reads
  each picture once, on your plan (*Read by*: Haiku unless you pick Sonnet).
- **⌥⌘M** shows them on a chalkboard, any time; home shows it too until lunch. A place's name opens its Instagram in
  your browser. *Read again* reads them now. With the chat on, *Ask the chat* asks who's going, and where, as a poll.
- **At lunch time** a sign drops into the status bar's lane over the fish — *LUNCH* — and the day's dishes scroll under
  it; a click on either is the chalkboard. A notification comes with *Menus · Going · In 15 minutes*.
- **Going**: the sign says *ENJOY* and the fish swims off the bar. Lock the Mac and it reads *BACK SOON*; come back
  (ten minutes on, at least) and the fish swims in fed, burps, and the sign says how long you were out.

The stories need a login because Instagram shows a story to no one logged out. A second account just for this is wiser
than your own: one that watches stories on a schedule can be challenged.

## Zé's game

**⌥⌘Z** is a break: Zé, the Bruce Lee of Barcelos, eats the meat that falls and dodges the vegetables — or kicks them
out of the sky. ← → run, ↑ jumps, space kicks, P pauses, M turns the funk off and on; esc or ⌥⌘Z again closes it. The
golden rooster is a life. His face is `ze.png` beside your setup file (`~/.config/peixairada/ze.png`), cropped to the
head — the ellipse inside the picture is what shows; without one he has a drawn face.

## Keys

| Key | Does |
|---|---|
| ⌥⌘K | jump to any chat |
| ⌥⌘N · ⌥⌘O | new chat · new chat in your ⌥⌘O project |
| ⌥⌘P · ⌥⌘F | pick a project · filter the list |
| ⌥⌘↑ ⌥⌘↓ | previous · next chat |
| ⌥⌘C | this chat's Claude, in the pane |
| ⌥⌘T · ⌥⌘E · ⌥⌘G | a shell · the in-app editor (VS Code Web or vim) · the PR |
| ⌥⌘V | the chat's folder in the external editor (VS Code or Zed), its own window |
| ⌘T · ⌘W | a new tab — a shell, or a page from a page · close the tab you are in (VS Code Web's editors first, as in VS Code) |
| ⌘2 · ⌘0 | split · close the other half |
| ⌥⌘B | hide the chat list, and show it again |
| ⌥⌘L | the launcher: chats, projects, PRs, tickets, actions, switches |
| ⌥⌘A · ⌥⌘D · ⌥⌘0 | the overview: every live chat at once · this chat's changes · home |
| ⌥⌘M | lunch: today's menus, on a chalkboard |
| ⌥⌘Z | Zé's game |
| ⌥⌘Y | the theme |
| ⌥⌘R · ⌘R | reload the board · reload the page in the pane (VS Code Web keeps its own ⌘R) |

`?` (or *Keyboard shortcuts* in Settings) lists the rest, grouped. A right-click on a card, a PR chip or a project's colour square has
what ⌥-click and a double-click do — rename, tick done, take a PR off, let go of a colour — and the launcher has the
same for the open chat.

<p align="center"><img src="shots/launcher-dark.webp" alt="⌥⌘L, the launcher: chats, projects, a new chat, PRs, every switch, the theme, settings, keys" width="560"></p>

## Install in full

**You need** macOS 13 or later, the Xcode Command Line Tools (`xcode-select --install`), Node ≥ 22 (`brew install node`,
or mise, nvm, asdf) and Claude Code, signed in. Install from the shell you use every day — the server takes its `PATH`
and its `node`, which is how it finds `claude`, `gh` and the rest (the commands are the [README's](../README.md#-install)).

**The board has a key**: only a page that holds it reads your chats or types into a terminal — a container, another
account or anything else that reaches the port gets nothing. The app has it; a browser gets it once, from
`scripts/launchd.sh open` or the button on the page that asks for it, and keeps it.

**On first open** the board asks where your repos live, its guess from your chats already filled in, then shows you
round its main parts — Skip it, or take it again later from Settings, ⌥⌘L or home; macOS asks to let `security` read
the *Claude Code-credentials* keychain item (your plan usage — *Always Allow*), and the app to show notifications.

**Optional** — each adds one thing:

| | Adds | Install |
|---|---|---|
| [GitHub CLI](https://cli.github.com), signed in | PRs — their state, CI, faces and whose move — and cloning repos | `brew install gh && gh auth login` |
| VS Code | ⌥⌘E (VS Code Web beside the chat) and file links | [code.visualstudio.com](https://code.visualstudio.com) |
| [Zed](https://zed.dev) | file links in Zed instead (Settings › General) | none: picking it installs it |
| [Task](https://taskfile.dev) | new chats in folders whose Taskfile starts Claude (folders Claude Code trusts) | `brew install go-task` |

**Updating**: the status bar says when new commits have come; click it and it pulls them — a fast-forward that leaves
your own changes as they are — and restarts only what they changed: the packages, the server (your chats stay open),
the page, the app. When a file you changed is one the commits change too, or your branch has commits of its own,
Settings › Updates & access says so, with the command that clears the way under Details. *Update automatically* pulls on its own once you've left the
board be for two minutes, and never while a file is changed here. By hand: `git pull && npm install &&
scripts/launchd.sh restart` — the board's page follows —, and `mac/build.sh install` when `mac/` changed. After
switching Node versions, or installing a CLI outside the `PATH` you installed with, run the last two install lines
again.

**Removing**: `scripts/launchd.sh uninstall`, then delete `/Applications/peixAIrada.app` — and `~/.config/peixairada`
and `~/Library/Application Support/peixAIrada` to forget your setup and the board's state.

## Settings and setup

**Settings** — ⌘, or ··· in the chat's header — is a sidebar of panes with a search box on top (type *dark*, *zoom*
or *key* to find a setting wherever it is):

- **General** — notifications and sounds, which editor a file path opens in, and (in the app) which full screen ⌃⌘F is.
- **Appearance** — Auto, Dark or Light (Auto follows macOS), a theme for each as tiles (⌥⌘Y shows them all on the
  board), the text size, and what else the status bar shows (a right-click on the bar picks that too).
- **Chat list** — card size (compact, or larger only where a chat needs you).
- **Terminal** — ⌥ as Meta, and a screen reader in the drawer (on by itself while VoiceOver runs).
- **Projects** — your repo folders and their GitHub org (⌥⌘N lists every repo and clones the ones you don't have), the
  project ⌥⌘O starts a chat in, a colour per project, and the projects you hid.
- **Jira** — your site, email and API token (the token goes to your keychain, never into the file).
- **Chat** — the chat's repo: a new one, one you're in, an invitation to join; or leaving it (see below).
- **Updates & access** — where the board's update stands and whether it updates itself (off to begin with: the status
  bar says when new commits came, and *Update now* takes them), whether the board's key is required yet and a new key
  (every browser then asks for it again), and where the setup file is.

The sidebar's foot has the keyboard shortcuts and the tour.

The setup is a file of yours, `~/.config/peixairada/config.json` (`$XDG_CONFIG_HOME` moves it) — edit it by hand or
keep it with your dotfiles; the board picks up a change within seconds:

```json
{
  "roots": [{ "dir": "~/code", "org": "my-org" }],
  "quick": "my-service",
  "projects": { "my-service": { "abbr": "SVC", "color": "#2f7fd8" } },
  "jira": { "site": "https://my-org.atlassian.net", "email": "me@my-org.com" },
  "chat": { "repo": "my-org/chat" }
}
```

What the board records as you use it — done ticks, titles, pins — stays in `~/Library/Application Support/peixAIrada/`,
with its key (`key`) and VS Code Web's token (`vsweb-token`).

**What leaves your machine**: only `gh` (PR states, clones), the plan-usage call, Jira (once you set it up), the
chat's GitHub calls (once you join one — with none, a look for an invitation every ten minutes), a `git
fetch` of the board's own checkout every half hour (its updates) and, with VS Code installed, an hourly look at VS
Code's update service (so VS Code Web has its newest build before you open it). Transcripts hold everything Claude
read: keep the server on `127.0.0.1` — past it, the key crosses your network unencrypted.

<details>
<summary>Environment variables</summary>

| Variable | Default | |
|---|---|---|
| `PORT` | `7331` | the board's port |
| `NOTIFY` | `native` (`off` with the app) | who posts notifications |
| `USAGE` | on | `off` hides the plan usage |
| `JIRA_API_TOKEN` | the keychain's | the Jira token, if you'd rather not keep it in the keychain |
| `DRAWER_IDLE_MS` | 24 h | an unwatched idle Claude in the pane ends itself; `0` never |
| `VSWEB_FRESH_MS` | 1 h | how often VS Code Web's newest build is fetched ahead of time; `0` never |
| `CLAUDE_BIN` `GH_BIN` `CODE_BIN` `TASK_BIN` | from `PATH` | where the CLIs are |
| `CLAUDE_DIR` · `STATE_FILE` | `~/.claude` · `~/Library/Application Support/peixAIrada/state.json` | what it reads · keeps |
| `CONFIG_FILE` | `~/.config/peixairada/config.json` (beside `STATE_FILE` when that is set) | the setup |
| `KEY_MODE` | — | `enforce`: the key from the first request, before the app has opened with it |

The login agent takes `PORT`, `NOTIFY` and your `PATH` at `scripts/launchd.sh install`.

</details>

## Hacking

`npm test` · `npm run check` · `npm run scenarios`. The pictures are taken on a made-up board
(`scripts/readme-board.mjs`), never yours: `npm run scenario -- scripts/readme-shots.mjs` redraws the stills, and
`npm run scenario -- scripts/readme-clips.mjs --timeout 900000 [-- <clip>…]` the README's clips (animated WebP, by
libwebp's `img2webp` — `brew install webp`); VS Code Web's want the `code` CLI. The browser checks drive Google Chrome
(`CHROME` points at another); `npm run webkit` runs the board in WebKit, the app's engine, and `npm run perf` measures
what it costs there on a busy made-up board (`-- --against <commit>` beside an older one, `-- --app` the app as it
runs). The API from a terminal wants the key too: `scripts/board.sh /api/terminals` sends it; `npm run verify` and
`npm run webkit` hand the page the live board's (`KEY=` for another). [CLAUDE.md](../CLAUDE.md) holds the working
notes, [DECISIONS.md](DECISIONS.md) the why.

Home's sunset is [*ocean sunset*](https://ascii.rest/ocean-sunset/) by [bas3line](https://github.com/bas3line/ascii)
(MIT), ported as it stands; the leaping fish is ours.
