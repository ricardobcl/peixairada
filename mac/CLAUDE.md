# peixAIrada — the app's shell

The notes for `mac/` alone: `Sources/main.swift`, `build.sh`, the icon. Claude Code loads this file once a session reads a
file under `mac/`; the [root CLAUDE.md](../CLAUDE.md), loaded into every session, keeps what the page does across the
bridge (`peixKey`, `peixFill`, `peixPane…`, the posts — its *Hotkeys and the pane*) and points here (2026-10-28). Its
rules hold here too: one bullet each — the rule, the names to find it by, the test that holds it —, the story in
[docs/DECISIONS.md](../docs/DECISIONS.md), a comment dated and never in a person's words. **This file stays under 20 000
characters** (`npm run check`). **A note here rebuilds nothing**: the app's stamp leaves `mac/*.md` out (`macSource` in
server.mjs, build.sh's `SOURCE`).

## Keys and menus

* **⌘W is the Window menu's item, not the forwarder's**: a key equivalent goes to the key window's views before the
  menu (2026-10-14), and a web view with the keys hands it to its page — so the menu hears only a ⌘W the page left
  alone. `closeHalfOrWindow` asks the board (`peixKey('KeyW','cmd')`) and calls `performClose` only on false. Anything
  else the board wants off a ⌘ a menu item claims goes the same way (⌘, does).
* **⌘W in VS Code Web with no editor open closes its tab** (2026-10-14; `editorEmptyScript`, `closeWhenEmpty` →
  `window.peixPaneClose(key)` → the page's `dropTab`): the workbench's close-editor takes it whatever is open. A script
  in the `ide:` views alone takes it first only when the editor part is `.content.empty` (one group, no editor), and the
  tab of the view it came from goes, by its key. An editor open, ⌘W is VS Code's; ⌥⌘W closes the tab any time.
  → `tab-keys.mjs`.
* **A pane page's ⌘R is a key monitor, never a menu key equivalent** (2026-10-13, in `installHotkeyForwarder`): a
  menu's takes the key first — VS Code Web's ⌘R is its own, and with no page up ⌘R goes on to whatever has the keys;
  the View menu's *Reload Page* carries none, *Reload Board* is ⌥⌘R (`reloadBoard`). Pinch zooms a page
  (`allowsMagnification`); each navigation is observed (KVO, `paneObs`) and told the page as `peixPaneUrl(key, url)`.
* **⌘F finds on that page**: the Edit menu's *Find… · Find Next · Find Previous*, greyed with the pane down; a native
  bar (`buildFindBar`, the pane's top right) over WKWebView's `find(_:configuration:)` — no count, the match is the
  page's selection, dropped on close (`kDropSelection`); typing searches from the top (`runFind(fromTop:)`). A pane
  change closes it; `findQuery` outlives it.
* **VS Code Web is told the Mac's keyboard layout** (2026-10-14, `KeyboardMap`, `ide:` views only): WebKit has no
  `navigator.keyboard`; a user script gives it Chrome's `getLayoutMap()` (`KeyboardMap.current()` over the
  `peixKeyboard` handler) and a `layoutchange` on a new input source (`layoutChanged`). Portugal's: Spanish ISO, as in
  Chrome.

## The window

* **⌃⌘F's two full screens** (2026-10-14; the page's `toggleFull` → `fullscreen` → `spaceMode`): on at quit,
  `peixairada.fill`, on again at launch; `kill -USR1 $(pgrep -x peixAIrada)` too. **Its own Space** is macOS's
  (`.fullScreenPrimary`), below the housing: the page hears no fill. **Up to the notch is the fill** (`toggleFill`;
  `BoardWindow`, borderless, the whole screen): the menu bar auto-hidden beside a camera housing, else hidden
  (`placeFill`, `fillOptions()`), out with the pointer at the top (`menuOut`), tucked after a change of desktop
  (`tuckMenuBar`); the Dock out at its edge (`dockTick`); `.fullScreenNone`, the green button's plain click the fill
  (`windowShouldZoom`); ⌘W leaves it first. `NSFullScreenMenuItemEverywhere` and
  `NSPrefersDisplaySafeAreaCompatibilityMode` are false; *Exit Full Screen* (View's, the fish's) is retitled in
  `validateMenuItem`. The page is told `peixFill(on, notch)`, the housing in CSS px. → `full-screen-pick.mjs`.
* **The lights come down with the menu bar** (2026-10-13; `lightsTick`): a strip under it, over the pane too — the
  lights (`LightButton`), the title —, the menu bar held out over it (`lightsOut`) until the pointer is below.
* **The pane's views**: a web view per page (`paneViews`, up to `paneViewsMax`, the chat's own spared), placed by the
  page's `{type:'pane'}`; **the overlay covers the window**, a click on no page let through (`PaneOverlay.hitTest`). A
  page's new window is a tab beside it (`PaneDelegate.open` → `peixPaneOpen`), a link to another host the page's to
  judge (`PaneDelegate.linkOut` → `peixLinkOut`).
* **The badge and the Dock**: the page's `{type: 'state'}` is their number; `refreshBadges` redraws only on a change
  (`badged`); a newly asking chat, the app behind, bounces the Dock once.
* **Both web views are inspectable** (Safari → Develop). **A drop brings the app forward** (2026-10-28, `onFiles`); in
  front, a view has the keys (`keysBack`, logged `focus:`).
* **Nobody looking, the board is hidden** (2026-10-13, `watchAway`, `showAway`): the screen locked, the display
  asleep, the screen saver up or the session switched away hides the window's content (WebKit stops every web view's
  frames) until all have cleared or the app comes forward; the first responder is put back (logged `away:`).

## The server and the build

* **The app's server lifecycle** (`ServerController`, main-thread throughout): `start` adopts a server already
  answering, waits for the launchd agent when its plist is installed, else runs the bundled one — one at a time, its
  log appended (`O_APPEND`); `restart` is `launchctl kickstart -k` for an adopted agent, else waits for the probe to
  fail first; the 5 s watchdog probes `/api/projects` and brings the board back once the server answers
  (`boardShown`). A web process that dies is loaded again. The bridge answers the board's own main frame only.
* Swift: `Result<Void, String>` does not compile; `isReleasedWhenClosed = false` on the window; drop -999 in every
  navigation-failure callback; pin the deployment target (`-target`, `LSMinimumSystemVersion`); an Edit menu or no ⌘V.
  **The board's web view draws no ground** (`drawsBackground` off): the window's `backgroundColor` and
  `underPageBackgroundColor` are the page's `--bg` per appearance, two hex pairs in `buildWindow`.
* Sign with the one Apple Development identity (stable team → App Management grants survive installs); chmod
  node-pty's spawn-helper only when the bit is missing (a same-mode chmod is still a write to the bundle).
