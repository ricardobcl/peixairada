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
  `BoardWindow`, borderless, the whole screen): **the menu bar hidden outright on every screen** (`placeFill`,
  `fillOptions()`; 2026-11-01 — auto-hidden beside a housing, a touch of the top edge brought it and the lights over
  the head row's controls), out after a 1 s hold at the top edge (`menuOut`, `menuHold`), back once the pointer is below
  its strip and it has hidden, a let-out one tucked after a change of desktop (`tuckMenuBar`); the Dock out after a
  hold at its edge (`dockTick`); `.fullScreenNone`, the green button's plain click the fill
  (`windowShouldZoom`); ⌘W leaves it first. `NSFullScreenMenuItemEverywhere` and
  `NSPrefersDisplaySafeAreaCompatibilityMode` are false; *Exit Full Screen* (View's, the fish's) is retitled in
  `validateMenuItem`. The page is told `peixFill(on, notch)`, the housing in CSS px. → `full-screen-pick.mjs`.
* **Filled on one screen of two, the fill's options hold only while the pointer is on its screen** (2026-11-07;
  `pointerCrossed`, `elsewhere`, `elsewhereAfter`): elsewhere `[]` — the menu bars and the Dock as with any window —, what
  was let out put back. **A front no one gave the board is handed back** (`handBack`, `watchFront`): filled, in front within
  `handBackWithin` of a click outside the app that brought another regular app forward, the pointer off the window, it goes
  back to that app, once a click — macOS 27's MenuBarAgent (`SetMenuBars`) makes such an app front. One screen, neither.
  Logged `fill: the pointer`, `focus:`; who made what front is the window server's log (docs/DECISIONS.md, 2026-11-07).
* **The lights come down with the menu bar** (2026-10-13; `lightsTick`): a strip under it, over the pane too — the
  lights (`LightButton`), the title —, the menu bar held out over it (`lightsOut`) until the pointer is below. Both
  cover the head row, so only a hold brings them — the menu bar's own, or the Dock's (with the Dock out AppKit
  wants the menu bar auto-hidden) (2026-11-01).
* **The pane's views**: a web view per page (`paneViews`, up to `paneViewsMax`, the chat's own spared), placed by the
  page's `{type:'pane'}`; **the overlay covers the page, not the window**: its top is where WebKit puts the page's y = 0,
under the title bar (2026-11-04; `paneTop`, a KVO on `contentLayoutRect`, by its height), a click on no page let through
(`PaneOverlay.hitTest`). A rect from the page is in the overlay's terms: anything placed by one hangs from it. A
  page's new window is a tab beside it (`PaneDelegate.open` → `peixPaneOpen`), a link to another host the page's to
  judge (`PaneDelegate.linkOut` → `peixLinkOut`). → `shell-checks/pane-place.mjs`.
* **The badge and the Dock**: the page's `{type: 'state'}` is their number; `refreshBadges` redraws only on a change
  (`badged`); a newly asking chat, the app behind, bounces the Dock once.
* **The fish in the menu bar** (2026-11-01, round XIX; `drawFish`, `fishFace`): dim, nothing wants you (`appearsDisabled`);
  full, something does; its number the questions alone, the Dock's what wants you; a slash while muted or fishing; belly-up
  under a waterline with no number once the watchdog's 15 s pass (`setServerDown`). **Its menu is one `statusMenu`, drawn as
  it opens** (`menuNeedsUpdate`), never while open: Next first, `sectionHeader`s, `subtitle`s, `+n more`, submenus for what
  works, each behind `#available`; ⌥ rows are `isAlternate`, which reads no event. **Its key is `popUp`, never
  `performClick`** (`setSummonKey`, `summonMenu`; Carbon): on 27.2 performClick opens off the top of the screen with the
  bar hidden. On 27.2 a status button's `NSApp.currentEvent` has no flags and its type swapped: read `NSEvent.modifierFlags`.
  Logged `fish:`, `summon:`.
* **About's Copy details asks the shell** (2026-11-04; `details` → `tellDetails` → `peixDetails`): macOS, the window's shape and inset, the
  screen, where each page's view really is in the window's terms, never its address. → `shell-checks/details.mjs`.
* **Both web views are inspectable** (Safari → Develop). **A drop brings the app forward** (2026-10-28, `onFiles`); in
  front, a view has the keys (`keysBack`, logged `focus:`) — **never made key from its own `didBecomeKey`**: on 27.2
  `NSApp.keyWindow` is nil there, and it posted it again (2026-11-07).
* **Nobody looking, the board is hidden** (2026-10-13, `watchAway`, `showAway`): the screen locked, the display
  asleep, the screen saver up or the session switched away hides the window's content (WebKit stops every web view's
  frames) until all have cleared or the app comes forward; the first responder is put back (logged `away:`).

## What the shell trusts (2026-11-06, the security audit)

* **The server proves itself before it is trusted**: every probe (`ServerController.probe`: ours · silent · stranger) sends
  `x-peix-nonce` and never the key; only an `x-peix-proof` that is the HMAC of it under the key file's key
  (`aliveProof` in server.mjs) is the board — adopted, its page loaded, the key script and the hub given. A listener
  that fails it gets nothing, and the window says so. Every load of the board's origin is proved in `decidePolicyFor`.
  → `test/key.test.mjs`, `shell-checks/port-stranger.mjs` (`meta.stranger`).
* **The board's view never leaves the board's origin**, by any kind of navigation (the shell's own `about:blank`
  messages aside), and every call into its page goes through `toBoard`, which says nothing off the board.
  → `board-stays.mjs`.
* **Everything handed to another app goes through `handOn`** (`kHandOn`: http, https, mailto, vscode, vscode-insiders,
  zed, x-github-client) — `external`, a link on the board, the strip's ↗, a pane page; a refusal is logged
  `open: <scheme>: refused`. `setPane` loads http(s) keys only. A pane page hands one on only within 1 s of a press or
  key of yours in that view (`gestureAt`, `PaneDelegate.gestured`): WebKit calls a script's `click()` `.linkActivated`.
  → `scheme-out.mjs`, `pane-gesture.mjs`.
* **Hardened runtime, no entitlements** (`build.sh`'s codesign; the bundled node keeps its own signature).
  `PEIXAIRADA_PORT` and `PEIXAIRADA_NODE` only under `PEIX_PROBE`; the bundled server's environment drops `DYLD_*` and
  `NODE_OPTIONS`. Reply…, Done and Mute are `.authenticationRequired`. `logLine` writes through `redacted()` (no
  `tkn=`, `key=`, `token=`, `ticket=` value). build.sh's lock, log and index and launchd.sh's detached log live in
  `getconf DARWIN_USER_TEMP_DIR` (else `~/Library/Caches/peixairada`, 0700), never `/tmp`. → `log-secrets.mjs`.

## The server and the build

* **The app's server lifecycle** (`ServerController`, main-thread throughout): `start` adopts a server already
  answering, waits for the launchd agent when its plist is installed, else runs the bundled one — one at a time, its
  log appended (`O_APPEND`); `restart` is `launchctl kickstart -k` for an adopted agent, else waits for the probe to
  fail first; the 5 s watchdog probes (`probe`, `/api/alive` with a nonce) and brings the board back once the server proves itself
  (`boardShown`). A web process that dies is loaded again. The bridge answers the board's own main frame only.
* **`npm run shell` runs this very file** (2026-11-04; `scripts/shell.mjs`, `shell-probe.swift`, `shell-checks/`): with the probe beside it
  and `-D PEIX_PROBE`, which build.sh does not set, on a throwaway server and fixture, a line of JSON each way; `ctx` is at the runner's
  head, and what a check believes is the window's pixels in sRGB (`ask('shot')`, `ask('runs')`). Out of the way of the app in use
  (`kProbeAside`): never in front, one pixel on the screen, its home a temp folder (`CFFIXED_USER_HOME`). **It differs from the app in
  five places, each a hole in what it proves**: the activation policy, `probeBegin`, `BoardWindow`'s frame, `placeFill`, `tellFill`'s
  left edge; keep them few, and a new command in the probe, not here (a change under `mac/` puts every app behind). **A new check first
  fails on the bug it is for** (`--src <dir>/main.swift`). A locked screen is `NOT RUN`, exit 3; `--space` is macOS's full screen, and takes the screen. → `shell-up.mjs`.
* Swift: `Result<Void, String>` does not compile; `isReleasedWhenClosed = false` on the window; drop -999 in every
  navigation-failure callback; pin the deployment target (`-target`, `LSMinimumSystemVersion`); an Edit menu or no ⌘V.
  **The board's web view draws no ground** (`drawsBackground` off): the window's `backgroundColor` and
  `underPageBackgroundColor` are the page's `--frame` per appearance (2026-11-01), two hex pairs in `buildWindow`.
* Sign with the one Apple Development identity (stable team → App Management grants survive installs); chmod
  node-pty's spawn-helper only when the bit is missing (a same-mode chmod is still a write to the bundle).
