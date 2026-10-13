#!/usr/bin/env node
// A stand-in for `brew install --cask zed` (2026-10-13): it says what brew says and puts a Zed.app — an Info.plist,
// nothing to run — into the first of APP_DIRS, every test server's folder of its own, so no test installs anything
// (BREW_BIN). FAKE_BREW_LOG, when set, gets a line with its arguments; FAKE_BREW_MS spaces its lines (0 by default);
// FAKE_BREW_FAIL fails as brew does, on stderr, with no app. A test that wants to see Launch Services asked hands it as
// LSREGISTER_BIN too: it logs its arguments and does nothing else.
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const args = process.argv.slice(2), env = process.env;
if (env.FAKE_BREW_LOG) appendFileSync(env.FAKE_BREW_LOG, args.join(' ') + '\n');
if (args[0] !== 'install') process.exit(0);
const sleep = ms => new Promise(r => setTimeout(r, ms)), gap = Number(env.FAKE_BREW_MS || 0);
const dir = (env.APP_DIRS || '').split(':').filter(Boolean)[0];
for (const l of ['==> Downloading https://zed.dev/fake/Zed-aarch64.dmg', '==> Installing Cask zed']) { console.log(l); await sleep(gap); }
if (env.FAKE_BREW_FAIL || !dir) { console.error('Error: Download failed on Cask \'zed\' with message: the fake was told to fail'); process.exit(1); }
console.log(`==> Moving App 'Zed.app' to '${join(dir, 'Zed.app')}'`); await sleep(gap);
mkdirSync(join(dir, 'Zed.app', 'Contents'), { recursive: true });
writeFileSync(join(dir, 'Zed.app', 'Contents', 'Info.plist'), '<plist><dict><key>CFBundleIdentifier</key><string>dev.zed.Zed</string></dict></plist>\n');
console.log('🍺  zed was successfully installed!');
