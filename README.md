<div align="center">

<img src="docs/icon.png" alt="" width="120">

# peixAIrada

**Every Claude Code chat on your Mac, on one board — the one waiting for you on top.**

[![node](https://img.shields.io/badge/node-%E2%89%A5%2022-3c873a?logo=node.js&logoColor=white)](https://nodejs.org)
[![macOS](https://img.shields.io/badge/macOS-13%2B-1c1c1a?logo=apple&logoColor=white)](mac/)
[![build step](https://img.shields.io/badge/build%20step-none-c96442)](public/index.html)

</div>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/shots/board-dark.png">
  <img src="docs/shots/board-light.png" alt="The board: chat cards coloured by project on the left, the open chat on the right">
</picture>

<p align="center"><sub>Every project in its colour — or, with <b>simple colours</b> on (Settings › Board), every project in black and the states in grey:</sub></p>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/shots/simple-dark.png">
  <img src="docs/shots/simple-light.png" alt="The same board with simple colours: every project in black, the states in grey, the PRs and the question still in colour">
</picture>

It reads what Claude Code already writes to `~/.claude` — no plugin, no private API, and it never writes there.

## ✨ Features

- 🚦 **Sorted by who owes whom** — asking you first, then working, then ready. *Done* is a tick you give.
- 💡 **The card's edge tells you why it's busy** — Claude working, sub-agents out, a monitor watching, or a question
  waiting (the red one, question on the card).
- 🖥️ **Claude in a drawer** — resume any chat in the real Claude Code terminal, inside the board. Drawers survive
  restarts; chats running in iTerm or VS Code can be taken over.
- 🔔 **Alerts** — a notification when a chat finishes or needs you; a Dock badge and menu-bar list in the app.
- 🐙 **PRs** — chips in GitHub's colours, stacked on a card and fanned out under the pointer; a chat with an open PR
  is named after it. A PR you reviewed or wrote fills in, notifies you and brings its ticked chat back when it's your
  move again — a push, a reply, a review.
- 🎨 **Projects** — folders in their [Peacock](https://marketplace.visualstudio.com/items?itemName=johnpapa.vscode-peacock)
  colour, or named sets of folders.
- 🌑 **Simple colours** — a quieter board: every project in black (or one colour you pick), the states in grey; PRs
  and faces keep their colours, and the accent is left for what needs you.
- 🪟 **Tabs and splits** — a shell, VS Code Web and GitHub pages beside the chat.
- 📊 **Plan usage** — your session and weekly limits, always in view.

<table>
  <tr>
    <td><img width="380" src="docs/shots/cards-dark.png" alt="Cards: asking, three sub-agents, working, and a monitor"></td>
    <td><img width="380" src="docs/shots/timeline-dark.png" alt="The timeline swelled under the pointer, every day's label out"></td>
  </tr>
  <tr>
    <td align="center"><sub>asking · sub-agents · working · watching</sub></td>
    <td align="center"><sub>point at the scrollbar and the days come out</sub></td>
  </tr>
</table>

## 🚀 Install

**First, what it runs on** — the last three are optional: without one, only what it is for is missing.

| | For | Install |
|---|---|---|
| macOS 13 or later | the app, the login agent, the keychain | |
| Xcode Command Line Tools | `git`, and `swiftc` for the app | `xcode-select --install` |
| Node ≥ 22 | the server | `brew install node` — or mise, nvm, asdf |
| Claude Code, signed in | the chats themselves | `curl -fsSL https://claude.ai/install.sh \| bash`, then run `claude` once to sign in |
| [GitHub CLI](https://cli.github.com), signed in | PR states, faces and turns, cloning | `brew install gh && gh auth login` |
| VS Code | ⌥⌘E (VS Code Web); [Peacock](https://marketplace.visualstudio.com/items?itemName=johnpapa.vscode-peacock) for project colours | [code.visualstudio.com](https://code.visualstudio.com) |
| [Task](https://taskfile.dev) | folders whose Taskfile starts Claude | `brew install go-task` |

**Then**, from the shell you use every day — the login agent keeps its `PATH` and its `node`, which is how it finds
`claude`, `gh` and the rest:

```sh
git clone git@github.com:ricardobcl/peixairada.git && cd peixairada
npm install                    # node-pty comes prebuilt for macOS: no compiler needed
scripts/launchd.sh install     # the server, started at login → http://127.0.0.1:7331
mac/build.sh install           # the Mac app, in /Applications (optional — any browser works)
```

**On first open** the board asks where your repos live, its guess from your chats already filled in. macOS asks to let
`security` read the *Claude Code-credentials* keychain item (that's the plan usage — *Always Allow*), and the app to
show notifications.

**Updating**: `git pull && npm install`, then `scripts/launchd.sh restart` — your chats stay open — and
`mac/build.sh install` when `mac/` or the dependencies changed. After switching Node versions, or installing a CLI
somewhere new, run `scripts/launchd.sh install` and `mac/build.sh install` again.

**Removing**: `scripts/launchd.sh uninstall`, then delete `/Applications/peixAIrada.app` — and `~/.config/peixairada`
and `~/Library/Application Support/peixAIrada` to forget your setup and the board's state.

## ⚙️ Setup

**Settings** — ⌘, or ··· in the chat's header:

- **Board** — notifications, simple colours (every project in black, or one colour you pick, the states in grey, for a quieter board), card size, ⌥ as Meta.
- **Setup** — your repo folders and their GitHub org (⌥⌘N lists every repo and clones the ones you don't have), the
  project ⌥⌘O starts a chat in, and a short name and a colour where Peacock has none, per project.

The setup is a file of yours, `~/.config/peixairada/config.json` (`$XDG_CONFIG_HOME` moves it) — edit it by hand or
keep it with your dotfiles; the board picks up a change within seconds:

```json
{
  "roots": [{ "dir": "~/code", "org": "my-org" }],
  "quick": "my-service",
  "projects": { "my-service": { "abbr": "SVC", "color": "#2f7fd8" } }
}
```

What the board records as you use it — done ticks, titles, pins — stays in `~/Library/Application Support/peixAIrada/`.

<details>
<summary>Environment variables</summary>

| Variable | Default | |
|---|---|---|
| `PORT` | `7331` | the board's port |
| `NOTIFY` | `native` (`off` with the app) | who posts notifications |
| `USAGE` | on | `off` hides the plan usage |
| `DRAWER_IDLE_MS` | 24 h | an unwatched idle drawer ends itself; `0` never |
| `CLAUDE_BIN` `GH_BIN` `CODE_BIN` `TASK_BIN` | from `PATH` | where the CLIs are |
| `CLAUDE_DIR` · `STATE_FILE` | `~/.claude` · `~/Library/Application Support/peixAIrada/state.json` | what it reads · keeps |
| `CONFIG_FILE` | `~/.config/peixairada/config.json` (beside `STATE_FILE` when that is set) | the setup |

The login agent takes `PORT`, `NOTIFY` and your `PATH` at `scripts/launchd.sh install`.

</details>

## ⌨️ Keys

| Key | Does |
|---|---|
| ⌥⌘K | jump to any chat |
| ⌥⌘N · ⌥⌘O | new chat · new chat in your ⌥⌘O project |
| ⌥⌘P · ⌥⌘F | pick a project · filter the list |
| ⌥⌘↑ ⌥⌘↓ | previous · next chat |
| ⌥⌘C | this chat's Claude, in the drawer |
| ⌥⌘T · ⌥⌘E · ⌥⌘G | a shell · VS Code Web · the PR |
| ⌘2 · ⌘W | split · close a half |
| ⌥⌘B | fold the list |

Settings › Keys lists the rest.

<p align="center"><img src="docs/shots/picker-dark.png" alt="⌥⌘K, the chat picker" width="620"></p>

## 🔒 Good to know

- Transcripts hold everything Claude read. The server listens on `127.0.0.1` only, with no login — keep it that way.
- Only `gh` (PR states, clones) and the plan-usage call leave your machine.
- A chat running elsewhere is never written to: take it over, or continue it where it is.

## 🛠 Hacking

`npm test` · `npm run check` · `npm run scenarios` — and `npm run scenario -- scripts/readme-shots.mjs` redraws these
screenshots from a made-up board. The browser checks drive Google Chrome (`CHROME` points at another).
[CLAUDE.md](CLAUDE.md) holds the working notes, [docs/DECISIONS.md](docs/DECISIONS.md) the why.

<div align="center"><br><sub>🐟 A <i>peixarada</i> is a Portuguese fish feast — more than anyone planned for.</sub></div>
