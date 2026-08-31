# peixAIrada — one board for every Claude Code chat on this Mac

A **local web page** (served by a zero-dependency Node script) that puts every Claude Code session
running on this machine — VS Code extension and terminal alike — on a three-lane board, shows any
transcript live, and **alerts you when Claude finishes a reply or is waiting on you**.

## Running it

Node ≥ 20, **no `npm install`**. macOS for native notifications (everything else is portable).

```sh
# one-off, in a terminal
npm start                    # = node server.mjs  →  http://127.0.0.1:7331
open http://127.0.0.1:7331

# always on: start at login, restart if it dies (launchd user agent)
scripts/launchd.sh install   # PORT=8000 scripts/launchd.sh install to pick another port
scripts/launchd.sh status    # / logs / uninstall / print
```

Board layout, collapsed lanes and chat position are remembered per browser; **done** ticks and
**pins** live server-side in `~/Library/Application Support/peixAIrada/state.json`, so they survive restarts and are the same
in every browser.

### As a Mac app

```sh
mac/build.sh install     # build + move to /Applications + launch  (mac/build.sh alone just builds)
```

A 1.4 MB native app ([`mac/`](mac/)) — a 180 KB binary, the rest is the icon — wrapping the same
board in a `WKWebView`: no Electron, nothing bundled but the UI and the server. It adds what a web page cannot do for itself:

* **Owns the server** — starts `node server.mjs` on launch (Node is found through a login shell, so
  mise/nvm/homebrew all work), stops it on quit. If a server is already running on the port — from
  `npm start` or the launchd agent — it just attaches to that one instead, and defers to it for
  notifications so you never get two of everything.
* **Native notifications** from *peixAIrada*, not from "Script Editor", and clicking one opens that
  session in the board. Only fires while the window is not in front. Falls back to the old
  `osascript` banner if notification permission is refused.
* **Dock badge** with alerts you have not seen, and a **menu-bar fish** whose menu lists the sessions
  needing your input — click one to jump straight to it.
* ⌘R reload, ⌘⇧R restart server, closing the window leaves it running in the menu bar.
* Its icon is drawn in code ([`mac/icon/MakeIcon.swift`](mac/icon/MakeIcon.swift)) — a fish in Claude
  terracotta with a starburst eye — and simplifies itself at 16/32 px so it stays legible.

Logs: `~/Library/Logs/peixairada.log` (server) and `peixairada-app.log` (the shell: how it resolved
node, notification permission, alerts, badge counts). Ad-hoc signed, so it is for this machine, not
for distribution.

**If it says it cannot find node:** the app has no PATH to speak of when macOS launches it, so it asks
an interactive login shell and then falls back to the usual install layouts (mise, nvm, fnm, asdf,
volta, homebrew). Point it straight at your binary if that ever fails:

```sh
defaults write net.peixairada.app nodePath "$(which node)"
```

Prefer no app at all? Chrome → ⋮ → *Cast, save and share* → *Install page as app…*, or Safari →
*File → Add to Dock*, gives you a window and a Dock icon with zero build.

## The board

| Lane | What lands there |
|---|---|
| **Stale** | The Claude process is gone (panel or terminal closed). Write to that chat again — resume it in VS Code or `claude --resume <id>` — and it registers a new pid and walks back into Clauding / Ready by itself. Stale chats idle for more than 30 days are hidden (*show empty & >30d* reveals them); Claude Code deletes their transcripts after 30 days anyway. |
| **Ready** | Claude stopped and the ball is with you: it replied (`idle`) or asked a question / wants plan approval (`needs-input`, sorted first, red). |
| **Clauding** | Claude is working: a prompt is in flight or tools are running. |
| **Done** | Only what **you tick ✓ done** (from Ready or Stale). Persisted server-side; a tick beats staleness, so a ticked chat stays in Done even after its process exits. The mark **expires as soon as the session has new activity**, so a chat you re-prompt walks Clauding → Ready again. |

**Order inside a lane:** pinned cards first, then cards of pinned repos, then the rest by latest
update (Ready puts `needs-input` before `idle`). **📌 on a card** pins it; **⇧-click** the same 📌 pins
its repo. **group by repo** in the header turns each lane into repo blocks — pinned repos first, then
by the repo's latest update, cards by update inside; each block header has its own 📌. **Click a repo
header to fold that repo** down to one line (colour, name, counter — red when something in it needs
your input); **⇕** in any column header is collapse-all: with *group by repo* on it folds
every repo block in that column, otherwise it folds that column's cards down to one line each
(dot · repo · title · time · 📌). ⌥-click a repo header filters the board to it. Folds are per lane, so folding `backend` under Stale leaves it open
under Ready. Pins live
next to the done ticks in `~/Library/Application Support/peixAIrada/state.json`. **compact** shrinks cards back to a two-line
title and a single snippet line; by default a card shows up to three title lines, the last thing you
asked and (when Claude has answered) the start of its reply.

Click a lane header to collapse it into a narrow strip with its colour, name and live counter (red
when something needs your input); click the strip to expand. **⤢ focus** collapses every other lane
(press again to restore). Lanes are capped at 340 px wide; the board scrolls sideways if needed.

Every card leads with the **repo name** (colour-coded per repo; click it to filter the board to that
repo), then the session title, the last reply or prompt, the state, and chips for VS Code/CLI, the
session name (`peixairada-f1`) and branch.

**Chat pane:** click a card to open its transcript. Consecutive tool calls (Bash, Read, Edit…) are
folded into one line — *“12 tool calls · Bash ×9, Read ×3”* — so the conversation reads as prose;
the header's **tools:** selector switches between collapsed / expanded / hidden, and **fold code**
collapses fenced code blocks longer than 6 lines behind a *“bash · 23 lines”* summary. `hide chat` / `show chat` toggles it,
`◨ chat right` / `◧ chat left` flips which side of the board it sits on, and the divider drags to
resize. All of that is remembered per browser. Messages render as GitHub-flavoured markdown via
vendored copies of `marked` and `DOMPurify` in [`public/vendor/`](public/vendor/) (no CDN at
runtime); relative file links Claude writes — `[server.mjs:42](server.mjs#L42)` — resolve against
the session cwd and open in VS Code.

## How it works (no private API)

Claude Code (CLI *and* the VS Code extension, which runs the same binary) writes everything to disk:

| What | Where | Used for |
|---|---|---|
| Full transcript, appended line-by-line as JSONL | `~/.claude/projects/<cwd-slug>/<session-id>.jsonl` | Messages, tool calls, status, titles, PR links |
| Live-session registry, one file per running process | `~/.claude/sessions/<pid>.json` (`sessionId`, `cwd`, `name`, `entrypoint: "claude-vscode" \| "cli"`) | Which sessions are alive, which come from VS Code, names, the stable repo path |
| Session titles | `ai-title` / `custom-title` lines inside the transcript | Card titles |
| End of a reply | assistant line with `stop_reason: "end_turn"` (tool calls are `"tool_use"`) | The "replied" alert → Waiting feedback |
| Waiting for the user | `AskUserQuestion` / `ExitPlanMode` tool call with no result yet | The "needs input" alert |
| Hooks (optional) | `~/.claude/settings.json` → `Stop`, `Notification(permission_prompt…)`, `UserPromptSubmit`, `SessionEnd` | Exact signals, incl. **permission prompts**, which never reach the transcript |

`fs.watch(…, { recursive: true })` fires on every append (verified on macOS/Node 24), so the board
updates within ~100 ms of Claude writing a line. Native notifications work from plain Node via
`osascript`, which is why **Electron is not required** (see below).

```
~/.claude/projects/**/*.jsonl ──fs.watch──▶ server.mjs ──SSE /events──▶ public/index.html
~/.claude/sessions/*.json ────poll/watch──▶    │  (tail from byte offset,     (lanes, cards, live transcript,
…/peixAIrada/state.json ◀─done + pins──────▶  │   fold lines → session state)  unread badges, browser alerts)
Claude Code hooks ─────POST /hook────────────▶  │
                                                └──▶ osascript "display notification"   (native macOS alert)
```

* **Startup:** reads the last 512 KB of every transcript (≈200 files / 0.5 GB indexed in ~0.4 s),
  then tails from the byte offset. A full file is parsed only when you open its chat.
* **Alerts:** debounced 400 ms (a reply's thinking block and text block land as separate lines) and
  suppressed during the initial scan.
* Subagent transcripts, sidechain lines, injected skill/meta lines and `<system-reminder>` blocks are
  filtered out. `[Request interrupted by user]` flips a session to idle.

### HTTP surface (all bound to 127.0.0.1)

| Route | Purpose |
|---|---|
| `GET /` | the UI (`/vendor/*.js` serves the two vendored libraries) |
| `GET /events` | SSE: `snapshot`, `session`, `entries`, `alert` |
| `GET /api/sessions` | summaries of every known session (incl. `done`) |
| `GET /api/sessions/:id/messages` | full (capped) entry list, parsed on demand |
| `POST /api/sessions/:id/done` `{done: true\|false}` | tick / untick a card (persisted in `~/Library/Application Support/peixAIrada/state.json`) |
| `POST /api/pins` `{type: "session"\|"project", key, pinned}` | pin / unpin a card or a repo (same state file) |
| `POST /api/sessions/:id/focus` | runs `code <cwd>` → brings that VS Code window to the front |
| `POST /hook` | receives Claude Code hook payloads (`hooks/hook.sh`) |
| `POST /api/test-notify` | fire a test alert |

Env: `PORT` (7331), `HOST` (127.0.0.1), `NOTIFY=native|off`, `CLAUDE_DIR` (~/.claude),
`STATE_FILE` (defaults to `~/Library/Application Support/peixAIrada/state.json`; `$XDG_STATE_HOME/peixairada/`
off macOS), `TAIL_BYTES`, `MAX_ENTRIES`.

## Optional: hooks for exact signals

Transcript watching already gives "replied" and "asked a question". What it **cannot** see is a
pending *permission prompt* (Claude waiting for you to approve a tool) — that never reaches the
transcript. Hooks fill that gap and make "replied" exact rather than inferred. They fire for VS Code
sessions too (settings are shared between the extension and the CLI).

Merge [`hooks/settings-snippet.json`](hooks/settings-snippet.json) into `~/.claude/settings.json`.
`hooks/hook.sh` POSTs the payload with a 1 s timeout, in the background, so Claude is never slowed
down or blocked when the server is not running. Restart or `/hooks`-reload sessions for it to apply.

## Electron vs. web page

| | Web page + local server (this) | Electron |
|---|---|---|
| Access to all chats | ✅ same (both read `~/.claude`) | ✅ same |
| Native macOS notifications | ✅ via `osascript` (shows as "Script Editor"; `terminal-notifier` would fix the icon) | ✅ first-class, own icon, click → focus |
| Menu-bar / dock badge with unread count | ❌ (tab-title badge only) | ✅ |
| Always-on-top mini window | ❌ | ✅ |
| Install/update cost | zero deps, one file | ~250 MB app, signing/notarising |
| Reuse | UI is already HTML — Electron can load the same page | — |

**Recommendation:** keep the web page + server (optionally a `launchd` agent so it is always
running, and Chrome/Safari "Add to Dock" for its own window). Move to Electron only if the tray
badge / always-on-top window becomes a real want — the UI carries over unchanged.

## Caveats

* Transcripts contain everything Claude read — code, secrets in tool output, prompts. The server
  binds to loopback only and has no auth; **do not** expose it on a network interface.
* Status is inferred from the transcript unless hooks are installed; a session interrupted in a way
  that writes nothing may sit in Clauding until its next line.
* "Stale" is about the *process*, not the conversation: headless `claude -p` runs and transcripts
  from before Claude Code kept a session registry never had a tracked pid, so they show as stale too.
* Reading is solid; **writing back** (replying from the board) is not: the per-session socket in
  `/tmp/cc-socks/<pid>.sock` used by `SendMessage` is documented as internal. "Focus in VS Code" is
  the supported next step.
* Tested on macOS 26 / Node 24 / Claude Code 2.1.25x. Line types are undocumented and may change;
  the parser ignores anything it does not recognise.

## Next steps

1. Launch the Mac app at login (System Settings → General → Login Items).
2. Per-session mute / quiet hours; syntax highlighting in code blocks.
3. Search across all transcripts (they are already on disk — a grep box is cheap).
4. Reply from the board once a supported API for sending into a session exists.
