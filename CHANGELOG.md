# Changelog

What each release of peixAIrada brought, newest first. A board on *Releases* (Settings › Updates › Follow, the default)
takes the newest one and shows its notes; *Every commit* follows main.

## 0.2 — 27 November 2026

### Changed

- **Your board now updates to releases** instead of every commit on main. The status bar says when one is out,
  Settings › Updates shows what it brings, and What's new shows these notes once you have it (⌥⌘L › Release notes
  shows them again). To keep getting every commit the day it lands, pick **Every commit** under Settings › Updates ›
  Follow.
- The status bar no longer shows PR moves or Next, the list's filter lost *Your move*, and the fish's menu keeps only
  what people use.
- A board running older code than its checkout says so, and **Update now** restarts it.

### New

- **Space** (⌥⌘X) shows every chat as a node with its agents around it. Answer a question from its node without
  opening the chat, find chats with ⌘F (`is:asking`, `pr:changes`, `@agent`, `#project`), see where each PR's review
  stands, and mark several chats done at once.
- **Pinned** keeps the chats you pin in a section above the lanes, in the order you set. ⌥⌘U shows only them.
- **Snooze** (⌥⌘S) puts a chat away until a time, until its PR comes back to you, its checks finish or Claude replies.
  It comes back on its own.
- **Auto-tiling** gives every new terminal a tile of its own, with i3-style keys to move between tiles and rearrange
  them. A switch in Settings › Terminal, off by default.
- The team chat takes **pictures and GIFs**, and you can edit your messages and react to any.
- **Dictation works in drawers**: a drawer's claude now asks macOS for the microphone itself.
- Choose how a working chat shows it: a ring, an arc or a still edge (Settings › Chat list). The ring is calmer, one
  lap in 4 s.
- `make install` and `make update` in the terminal.

### Security

- Fixes from an outside security audit. Among them, a notification's Reply can no longer approve a tool call. Nothing
  to do on your side.

### Fixed

- Links in a drawer open when clicked, and about 40 smaller fixes.

