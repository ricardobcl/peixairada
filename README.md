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

It reads what Claude Code already writes to `~/.claude` — no plugin, no private API, and it never writes there.

## ✨ Features

- 🚦 **Sorted by who owes whom** — asking you first, then working, then ready. *Done* is a tick you give.
- 💡 **The card's edge tells you why it's busy** — Claude working, sub-agents out, a monitor watching, or a question
  waiting (the red one, question on the card).
- 🖥️ **Claude in a drawer** — resume any chat in the real Claude Code terminal, inside the board. Drawers survive
  restarts; chats running in iTerm or VS Code can be taken over.
- 🔔 **Alerts** — a notification when a chat finishes or needs you; a Dock badge and menu-bar list in the app.
- 🐙 **PRs** — chips in GitHub's colours; a chat with an open PR is named after it.
- 🎨 **Projects** — folders in their [Peacock](https://marketplace.visualstudio.com/items?itemName=johnpapa.vscode-peacock)
  colour, or named sets of folders.
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

Needs macOS, Node ≥ 22 and the Claude Code CLI. [`gh`](https://cli.github.com) adds PR states and cloning.

```sh
git clone git@github.com:ricardobcl/peixairada.git && cd peixairada
npm install
scripts/launchd.sh install     # the server, started at login → http://127.0.0.1:7331
mac/build.sh install           # the Mac app (optional — any browser works)
```

After pulling, `scripts/launchd.sh restart` — your chats stay open. The first time, allow `security` to read the
*Claude Code-credentials* keychain item (that's the plan usage).

## ⚙️ Setup

Everything is in the **cog**, bottom left:

- **Your repos** — the folders they live in and their GitHub org. ⌥⌘N lists them all and clones the ones you don't have.
- **⌥⌘O** — one project to start a chat in with a single key.
- **Projects** — a short name for the folded list, a colour where Peacock has none.
- **Preferences** — notifications, card size, code folding, ⌥ as Meta, date format.

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

The login agent takes `PORT` and `NOTIFY` at `scripts/launchd.sh install`.

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
| ⌘B | fold the list |

The cog lists the rest.

<p align="center"><img src="docs/shots/picker-dark.png" alt="⌥⌘K, the chat picker" width="620"></p>

## 🔒 Good to know

- Transcripts hold everything Claude read. The server listens on `127.0.0.1` only, with no login — keep it that way.
- Only `gh` (PR states, clones) and the plan-usage call leave your machine.
- A chat running elsewhere is never written to: take it over, or continue it where it is.

## 🛠 Hacking

`npm test` · `npm run check` · `npm run scenarios` — and `npm run scenario -- scripts/readme-shots.mjs` redraws these
screenshots from a made-up board. [CLAUDE.md](CLAUDE.md) holds the working notes, [docs/DECISIONS.md](docs/DECISIONS.md)
the why.

<div align="center"><br><sub>🐟 A <i>peixarada</i> is a Portuguese fish feast — more than anyone planned for.</sub></div>
