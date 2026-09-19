<div align="center">

<img src="docs/icon.png" alt="peixAIrada" width="170">

# peixAIrada

### Every Claude Code chat on your Mac. One board.<br>**Zero guessing about which one is waiting for you.**

[![node](https://img.shields.io/badge/node-%E2%89%A5%2020-3c873a?logo=node.js&logoColor=white)](https://nodejs.org)
[![dependencies](https://img.shields.io/badge/npm%20dependencies-2-c96442)](package.json)
[![build step](https://img.shields.io/badge/build%20step-none-c96442)](public/index.html)
[![macOS](https://img.shields.io/badge/macOS-13%2B-1c1c1a?logo=apple&logoColor=white)](mac/)
[![native app](https://img.shields.io/badge/native%20app-1.4%20MB-2f9e5b)](mac/build.sh)
[![private API](https://img.shields.io/badge/private%20APIs%20used-none-2f9e5b)](#-how-it-works-no-private-api-no-permission-needed)

</div>

---

## 🐟 The 4pm problem

Eight Claude Code sessions. Three VS Code windows, two terminals, and one you genuinely forgot about.

**Which one finished?** Which one is parked on a permission prompt for a `rm` you'd rather look at
first? Which one asked you a question forty minutes ago and has been sitting there, politely, ever
since — while you alt-tabbed straight past it?

peixAIrada puts every one of them on a single board, streams any transcript live, and **taps you on
the shoulder the moment one of them finishes or needs you**.

> *A **peixarada** is a Portuguese fish feast — a whole table of the stuff, more than anyone planned
> for. Drop an **AI** in the middle and you get this: your Mac, on a Tuesday afternoon.* 🐟

<div align="center">
<img src="docs/icon-sizes.png" alt="the icon at 16, 32, 64, 128 and 256px" width="620">
</div>

---

## ⚡ Sixty seconds to a board

Node ≥ 20. macOS for native notifications; everything else is portable.

```sh
npm install                  # two runtime deps: node-pty (the terminal drawer) and ws
npm start                    # = node server.mjs  →  http://127.0.0.1:7331
open http://127.0.0.1:7331
```

That's it. That's the whole setup. Want it always there?

```sh
scripts/launchd.sh install   # starts at login, restarts if it dies
scripts/launchd.sh status    # …also: logs · uninstall · print
                             # PORT=8000 scripts/launchd.sh install  to pick another port
```

Lane collapse, repo folds and chat position are remembered **per browser**. **Done** ticks live
server-side in `~/Library/Application Support/peixAIrada/state.json`, so they survive a restart and
look the same in every browser *and* in the Mac app.

---

## 🍎 …or as a real Mac app

```sh
mac/build.sh install     # build → /Applications → launch   (mac/build.sh alone just builds)
```

**1.4 MB.** A 180 KB binary; the rest is the icon. It all lives in [`mac/`](mac/). It wraps the same board in a `WKWebView` — no
Electron, nothing bundled but the UI and the server — and adds the things a web page simply cannot
do for itself:

|  | What the app adds |
|---|---|
| 🚀 | **Owns the server.** Starts `node server.mjs` on launch (Node found through a login shell, so mise/nvm/homebrew all work), stops it on quit. If a server is *already* running on the port — from `npm start` or the launchd agent — it attaches to that one instead and defers to it for notifications, so you never get two of everything. |
| 🔔 | **Native notifications** from *peixAIrada*, not from "Script Editor" — and clicking one opens that session in the board. Only fires while the window isn't in front. Falls back to the old `osascript` banner if notification permission is refused. |
| 🎯 | **Dock badge** with the alerts you haven't seen, and a **menu-bar fish** whose menu lists every session waiting on you. Click one to jump straight to it. |
| ⌨️ | ⌘R reload, ⌘⇧R restart server. Close the window and it keeps running in the menu bar. |
| 🎨 | **An icon drawn in code** ([`mac/icon/MakeIcon.swift`](mac/icon/MakeIcon.swift)) — a fish in Claude terracotta with a starburst eye, no image assets anywhere — that simplifies itself at 16/32 px so it stays legible in the menu bar. |

Logs live in `~/Library/Logs/peixairada.log` (server) and `peixairada-app.log` (the shell: how it
resolved node, notification permission, every alert, badge counts). Ad-hoc signed — this machine,
not distribution.

<details>
<summary><b>😤 "It says it cannot find node"</b></summary>

<br>

macOS hands the app essentially no PATH, and version managers activate in `.zshrc`. So the app asks
an interactive login shell, then falls back to the usual install layouts (mise, nvm, fnm, asdf,
volta, homebrew). If even that fails, point it straight at your binary:

```sh
defaults write net.peixairada.app nodePath "$(which node)"
```

`~/Library/Logs/peixairada-app.log` has the full `findNode:` trace if you want to see what it tried.

</details>

**Prefer no app at all?** Chrome → ⋮ → *Cast, save and share* → *Install page as app…*, or Safari →
*File → Add to Dock*. A window and a Dock icon, zero build.

---

## 🎛 The board

Four lanes. A session lands in exactly one of them, and moves on its own.

| | Lane | What lands there |
|---|---|---|
| 🟡 | **Clauding** | Claude is working — a prompt is in flight or tools are running. |
| 🔴 | **Ready** | Claude stopped and the ball is with **you**: it replied (`idle`), or it asked a question / wants plan approval (`needs-input`, in red). |
| 🟢 | **Done** | Only what **you tick ✓ done**, from Ready or Stale. Persisted server-side; a tick beats staleness, so a ticked chat stays put even after its process exits. The mark **expires the instant the session has new activity**, so a chat you re-prompt walks back through Clauding → Ready. |
| ⚪ | **Stale** | The Claude process is gone — panel or terminal closed. Write to that chat again (resume it in VS Code, or `claude --resume <id>`) and it registers a new pid and walks back into Clauding / Ready by itself. Stale chats idle >30 days are hidden behind *show empty & >30d*; Claude Code deletes their transcripts after 30 days anyway. |

### Sorting and folding

**Inside a lane:** the chat **you** wrote to most recently comes first — the one rule, in every lane.
Claude finishing a long job does not move its card up; answering its question or interrupting it
does. So the chats you are actively driving stay at the top and the ones you have parked sink by
themselves, which is what pins used to be for (there are none any more). The time on a card is still
when *anything* last happened to it; hover it for when you last wrote.

* **group by repo** turns each lane into repo blocks, ordered by the block's newest card, cards in
  the same order inside.
* **Click a repo header** to fold it to one line (colour, name, counter — red when something in it
  needs you). **⌥-click** it to filter the whole board to that repo.
* **⇕** in a column header is collapse-all: with *group by repo* on it folds every repo block in that
  column, otherwise it folds that column's cards to one line each (dot · repo · title · time · ✓).
* Folds are **per lane**, so folding `backend` under Stale leaves it open under Ready.
* **compact** shrinks cards to a two-line title and one snippet line. By default a card shows up to
  three title lines, the last thing you asked, and — once Claude answers — the start of its reply.

**Whole lanes** collapse too: click a lane header for a narrow strip with its colour, name and live
counter (red when something needs input); click the strip to expand. **⤢ focus** collapses every
other lane, press again to restore. Lanes cap at 340 px and the board scrolls sideways if it needs to.

### Anatomy of a card

Every card leads with the **repo name** — colour-coded per repo, click to filter the board to it —
then the session title, the last thing you asked and the start of Claude's reply — each marked by a
glyph rather than a word — a teal figure for you, Claude's sunburst in clay for Claude, with Claude's
line set brighter because that is the one you scan a lane for. That is all: the
card answers *what changed*, and the column it sits in already answers *what state it is in*, so
there is no "working…" or "replied — your turn" line repeating it.

The one exception is **needs your input**, in red — because Ready holds idle *and* needs-input, that
is the single status its column cannot tell you.

What a chat *is* rather than what just happened — VS Code or CLI, the session name
(`peixairada-f1`), the path and branch, the model, the pid — lives in the **chat header** on the
right, folded behind **···** so the header fits on **one line**: repo / title, a status dot with how
long it has been that way, the fold, the VS Code button, then the PR chips. No status word — the
dot's colour says it and hovering spells it out. PR chips flow after the button and spill onto
further lines only when they genuinely do not fit. The fold is remembered per browser. Filtering
still matches the session name and branch even though neither is printed.

### 💬 The chat pane

Click any card to open its transcript, live.

Consecutive tool calls (Bash, Read, Edit…) fold into a single line — *"12 tool calls · Bash ×9,
Read ×3"* — so the conversation actually **reads as prose** instead of a wall of JSON. The header's
**tools:** selector switches between collapsed / expanded / hidden, and **fold code** tucks fenced
blocks longer than 6 lines behind a *"bash · 23 lines"* summary.

**The header lists every PR the chat mentioned** — one chip per pull request, most recently
mentioned first, so the one you are on now leads. It picks them up from the URLs you or Claude wrote
in the conversation as well as from Claude Code's own `pr-link` lines.

**A chat with a PR is named by it.** The card and the header lead with the pull request's own title
instead of the one Claude wrote for the chat — the name the work already has on GitHub, on the
branch and at standup. Where a chat mentions several, the title comes from the *oldest one still
open*: the later ones tend to be references, and a merged PR is finished business. A title you set
yourself still wins over both, and hovering the title says which PR it came from and what Claude had
called the chat.

Each chip is **coloured by what GitHub says about it** — green open, violet merged, red closed, grey
draft — looked up through your own `gh` CLI, so a chat you have not touched in a week tells you at a
glance which of its PRs actually landed. A neutral chip means the lookup has
not come back (or `gh` is not installed — then the colours simply never appear). Hover for the full
title and URL, the state, when it last came up and how many times it was mentioned.

**⌨ Chat from the board — in a real terminal.** The `>_` button in the chat header opens a drawer
under the transcript running *Claude Code itself*: `claude --resume <id>` for that chat, in its
folder, in a pseudo-terminal on the server, shown through xterm.js. It is the actual TUI, so
everything it can do you can do here — permission prompts, questions, plan mode, slash commands,
pasting — and it registers and writes its transcript exactly like a Terminal.app run, so the card
above walks Stale → Clauding → Ready and the rendered chat keeps up. Read above, type below. **+**
starts a *new* chat in the same repo the same way; the pane switches to it as soon as Claude
registers the session. The process lives on the server: **hide** keeps it running, switching chats
keeps it running, **end** stops it — and it does not survive a server restart. A chat that is live
in VS Code or another terminal cannot be attached from here (the button says so); use the VS Code
button instead. The first time in a folder Claude asks its usual *trust this folder?* question.

**On a stale chat there is also a one-line reply box** — type, ⏎, and the board resumes the chat
with `claude --resume <id> -p`; ⇧⏎ for a newline. It hides while a terminal is open on that chat.

`hide chat` / `show chat` toggles it, `◨ chat right` / `◧ chat left` flips which side it sits on, and
the divider drags to resize — all remembered per browser. Messages render as GitHub-flavoured
markdown through **vendored** copies of `marked`, `DOMPurify` and `highlight.js` in
[`public/vendor/`](public/vendor/) (no CDN at runtime, ever) — so code blocks come out **syntax
highlighted**, in a palette that follows the light/dark theme. Relative file links Claude writes —
`[server.mjs:42](server.mjs#L42)` — resolve against the session cwd and **open in VS Code**.

---

## 🔬 How it works (no private API, no permission needed)

Here's the trick: **Claude Code already writes everything to disk.** The CLI and the VS Code
extension run the same binary and share the same files. peixAIrada just reads them.

> **It never writes a single byte back into `~/.claude`.** No plugin, no patch, no private API, no
> cooperation from Claude Code required. If peixAIrada vanished tomorrow, Claude Code wouldn't notice.

| What | Where | Used for |
|---|---|---|
| Full transcript, appended line-by-line as JSONL | `~/.claude/projects/<cwd-slug>/<session-id>.jsonl` | Messages, tool calls, status, titles, PR links |
| Live-session registry, one file per running process | `~/.claude/sessions/<pid>.json` (`sessionId`, `cwd`, `name`, `entrypoint: "claude-vscode" \| "cli"`) | Which sessions are alive, which come from VS Code, names, the stable repo path |
| Session titles | `ai-title` / `custom-title` lines inside the transcript | Card titles |
| End of a reply | assistant line with `stop_reason: "end_turn"` (tool calls are `"tool_use"`) | The "replied" alert → Waiting feedback |
| Waiting for the user | `AskUserQuestion` / `ExitPlanMode` tool call with no result yet | The "needs input" alert |
| Hooks *(optional)* | `~/.claude/settings.json` → `Stop`, `Notification(permission_prompt…)`, `UserPromptSubmit`, `SessionEnd` | Exact signals, including **permission prompts**, which never reach the transcript |

`fs.watch(…, { recursive: true })` fires on every append (verified on macOS / Node 24), so the board
updates within **~100 ms** of Claude writing a line. Native notifications work from plain Node via
`osascript` — which is exactly why **Electron is not required**.

```
  ~/.claude/projects/**/*.jsonl  ──fs.watch────▶┐
  ~/.claude/sessions/*.json      ──poll+watch──▶│                                   ┌──▶  the board
  Claude Code hooks (optional)   ──POST /hook──▶├──▶  server.mjs  ──SSE /events──▶──┤     lanes · cards · live transcript
  …/peixAIrada/state.json        ◀─done ticks──▶┘     tail from byte offset         └──▶  unread badges · alerts
                                                      fold lines → session state
                                                              │
                                                              └──▶ osascript ──▶ 🔔 native macOS alert
```

* **Startup:** reads the last 512 KB of every transcript — ≈200 files / 0.5 GB indexed in **~0.4 s** —
  then tails from the byte offset. A full file is parsed only when you open its chat.
* **Alerts:** debounced 400 ms (a reply's thinking block and text block arrive as separate lines) and
  suppressed entirely during the initial scan, so starting up doesn't fire twenty banners. They land
  as a *system* notification plus the unread badge on the card — there is no in-page toast, on
  purpose: in the Mac app it duplicated the banner the app had just posted.
* Subagent transcripts, sidechain lines, injected skill/meta lines and `<system-reminder>` blocks are
  filtered out. `[Request interrupted by user]` flips a session back to idle.

<details>
<summary><b>🔌 HTTP surface</b> — every route, all bound to 127.0.0.1</summary>

<br>

| Route | Purpose |
|---|---|
| `GET /` | the UI (`/vendor/*.{js,css}` serves the vendored libraries) |
| `GET /events` | SSE: `snapshot`, `session`, `entries`, `alert`, `terminal` |
| `GET /api/sessions` | summaries of every known session (incl. `done`) |
| `GET /api/sessions/:id/messages` | full (capped) entry list, parsed on demand |
| `POST /api/sessions/:id/done` `{done: true\|false}` | tick / untick a card (persisted in the state file) |
| `POST /api/sessions/:id/reply` `{text}` | **stale chats only** — resumes the chat with `claude --resume <id> -p <text>`; 202 and the answer arrives through the transcript |
| `POST /api/sessions/:id/terminal` `{cols, rows}` | attach to this chat's terminal, or start one with `claude --resume <id>` in its cwd; 409 if the chat is live elsewhere |
| `POST /api/terminals` `{cwd, cols, rows}` | start a **new** chat: `claude` in a PTY in that folder; the `terminal` SSE event carries its session id once Claude registers |
| `GET /api/terminals` · `DELETE /api/terminals/:id` | list terminals · end one (SIGHUP) |
| `WS /api/terminals/:id/ws` | the terminal: binary frames are output (scrollback replayed first), text frames are JSON — `{t:'in', d}` / `{t:'resize', cols, rows}` up, `{t:'exit', code}` down |
| `POST /api/sessions/:id/focus` | runs `code <cwd>` to bring that window to the front, then opens `vscode://anthropic.claude-code/open?session=<id>` so the chat itself comes up in the Claude panel |
| `POST /hook` | receives Claude Code hook payloads (`hooks/hook.sh`) |
| `POST /api/test-notify` | fire a test alert |

**Environment:** `PORT` (7331) · `HOST` (127.0.0.1) · `NOTIFY=native|off` · `CLAUDE_DIR` (`~/.claude`) ·
`STATE_FILE` (defaults to `~/Library/Application Support/peixAIrada/state.json`;
`$XDG_STATE_HOME/peixairada/` off macOS) · `TAIL_BYTES` · `MAX_ENTRIES` · `CLAUDE_BIN` (path to the
`claude` binary, if PATH can't find it) · `REPLY_TIMEOUT_MS` (10 min) · `TERM_SCROLLBACK` (256 KB of
terminal output kept per PTY for replay).

</details>

---

## 🪝 Optional: hooks, for signals instead of guesses

Watching the transcript already gets you "replied" and "asked a question". What it **cannot** see is
a pending **permission prompt** — Claude waiting on you to approve a tool call. That never reaches
the transcript at all.

Hooks close that gap and make "replied" *exact* rather than inferred. They fire for VS Code sessions
too, since the extension and the CLI share settings.

Merge [`hooks/settings-snippet.json`](hooks/settings-snippet.json) into `~/.claude/settings.json`.
[`hooks/hook.sh`](hooks/hook.sh) POSTs the payload with a 1 s timeout, in the background, and always
exits 0 — so Claude is **never** slowed down or blocked, even with the server stopped. Restart or
`/hooks`-reload your sessions to pick it up.

---

## 🤔 Why not Electron?

| | Web page + local server *(this)* | Electron |
|---|---|---|
| Access to all chats | ✅ same — both just read `~/.claude` | ✅ same |
| Native macOS notifications | ✅ via `osascript` (shows as "Script Editor"; `terminal-notifier` fixes the icon) | ✅ first-class, own icon, click → focus |
| Menu-bar / dock badge with unread count | ❌ tab-title badge only | ✅ |
| Always-on-top mini window | ❌ | ✅ |
| Install / update cost | **two deps (a PTY, a WebSocket server), one file** | ~250 MB app, signing, notarising |
| Reuse | UI is already HTML — Electron could load the same page | — |

**The verdict:** keep the web page + server (plus a `launchd` agent so it's always up, and
"Add to Dock" for its own window). The **native Mac app above already buys back the badge and the
menu bar for 1.4 MB** — so Electron only makes sense if an always-on-top window becomes a real want.
Either way, the UI carries over unchanged.

---

## ⚠️ Caveats — read these

* 🔒 **Transcripts contain everything Claude read**: your code, secrets that landed in tool output,
  your prompts. The server binds to **loopback only** and has **no auth** — do *not* expose it on a
  network interface.
* 🌐 **Opening a chat asks GitHub about its PRs.** That is the one thing here that leaves the
  machine: `gh api graphql`, with your own credentials, sending nothing but `owner/repo#number` —
  which GitHub already knows. Nothing from the transcript goes with it. No `gh`, no colours, no call.
* Status is **inferred** from the transcript unless you install the hooks. A session interrupted in a
  way that writes nothing may sit in Clauding until its next line.
* **"Stale" is about the *process*, not the conversation.** Headless `claude -p` runs, and
  transcripts from before Claude Code kept a session registry, never had a tracked pid — so they show
  as stale too.
* **You can chat with a stale or new chat here, but not attach to a live one.** The terminal drawer
  and the reply box both go through the public CLI (`claude --resume <id>`), which appends to the
  same transcript. A *live* chat already has a process writing that file, and a second writer racing
  it is how a transcript gets mangled — so the board refuses, and the VS Code button (which now opens
  the chat itself) is the answer there. The terminals' processes belong to the server: restart it and
  they are gone, along with anything Claude was in the middle of.
* **A live chat could take a *nudge*, but never an *answer*.** Reaching one means its inbox socket
  (`messagingSocketPath` in the registry), which is a documented feature — [cross-session
  messaging](https://code.claude.com/docs/en/cross-session-messaging) — and on macOS a script may post
  to it without authenticating. But a message arriving that way is attributed to *another session*,
  not to you, and the docs are explicit that it "can't answer a pending permission prompt on your
  behalf". So it could tell a running chat something; it could never approve its plan or answer its
  question — which is exactly what the red lane is for.
* Tested on **macOS 26 / Node 24 / Claude Code 2.1.25x**. Transcript line types are undocumented and
  may change at any time; the parser ignores anything it doesn't recognise, on purpose.

---

## 🗺 Where this goes next

- [ ] Launch the Mac app at login (System Settings → General → Login Items)
- [ ] Per-session **mute** / quiet hours, and syntax highlighting in code blocks
- [ ] **Search across every transcript** — they're already on disk, a grep box is cheap
- [x] Reply straight from the board — done for stale chats, via `claude --resume`
- [x] **Chat from the board** — a real `claude` in a terminal drawer under the transcript, resume or new
- [ ] ~~Reply into a **live** chat~~ — *not planned.* The socket is there and documented, but a
      message posted to it can never answer the question a chat is waiting on, which is the only
      reason to want it

<div align="center">
<br>
<sub>Built for one Mac, one human, and rather too many fish. 🐟</sub>
</div>
