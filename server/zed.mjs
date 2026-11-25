// Zed (2026-10-13): the other editor, found, and installed when it is picked.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { execFile } from 'node:child_process';
import { findBin } from './bins.mjs';
import { broadcast } from './sse.mjs';
import { termEnv } from './terminals/terms.mjs';

// ---- Zed: the other editor, found and installed when it is picked (2026-10-13) ----------------------------------------
// The page opens a file or a folder in Zed by its URL (zed://file…), as it does VS Code; the server only says whether
// Zed is on this Mac — its app in one of APP_DIRS (/Applications, ~/Applications; a test's folder of its own), Zed
// Preview too — and installs it when asked: picking Zed in the settings without it does. Homebrew's cask (`brew install
// --cask zed`: the app into /Applications and the zed CLI beside brew, no password; Zed updates itself after), one
// install at a time, brew's newest `==>` line going out as an `editor` event — the settings' line under the pick. With
// no brew the page points at zed.dev's download. The app is then registered with Launch Services (`lsregister -f`), so
// a zed:// link works before Zed was ever opened.
const APP_DIRS = (process.env.APP_DIRS || `/Applications:${join(homedir(), 'Applications')}`)
  .split(':')
  .filter(Boolean);
const ZED_APPS = ['Zed.app', 'Zed Preview.app'];
const ZED_INSTALL_MS = 15 * 60_000;
const zedApp = () =>
  APP_DIRS.flatMap(d => ZED_APPS.map(a => join(d, a))).find(p => existsSync(join(p, 'Contents', 'Info.plist'))) || null;
function brewBin() {
  return findBin('brew', 'Zed cannot be installed from the board');
}
let zedInstall = null; // { line, at, child } while brew runs; { error } once it failed, until the next try
export function editorState() {
  const z = zedInstall;
  return {
    zed: {
      app: zedApp(),
      brew: !!brewBin(),
      installing: !!z?.child,
      line: z?.child ? z.line : null,
      error: z?.error || null,
    },
  };
}
/** Zed's install, started — or the one under way, or none needed: the editors' state, else { code, error }. */
export function installZed() {
  if (zedApp() || zedInstall?.child) return editorState();
  const brew = brewBin();
  if (!brew) return { code: 503, error: 'Homebrew not found — get Zed from zed.dev/download' };
  const z = (zedInstall = { line: 'brew install --cask zed', at: 0, child: null });
  console.log('[peixairada] Zed: brew install --cask zed');
  const done = (err, _out, stderr) => {
    z.child = null;
    const app = zedApp();
    if (app) {
      zedInstall = null;
      console.log(`[peixairada] Zed: installed, ${app}`);
      const ls = findBin('lsregister', 'a zed:// link may wait for Zed to be opened once');
      if (ls)
        execFile(ls, ['-f', app], { timeout: 30_000 }, e => {
          if (e) console.error(`[peixairada] Zed: lsregister ${e.message}`);
        });
    } else {
      // brew says why on stderr (Error: …); one that ended well with no app to show is said as that
      const lines = String(stderr || '')
        .split(/[\r\n]+/)
        .map(l => l.trim())
        .filter(Boolean);
      z.error =
        lines.filter(l => /^Error:/.test(l)).pop() ||
        (err ? lines.pop() || err.message : `brew is done, and there is no Zed.app in ${APP_DIRS.join(' or ')}`);
      console.error(`[peixairada] Zed: ${z.error}`);
    }
    broadcast('editor', editorState());
  };
  try {
    z.child = execFile(
      brew,
      ['install', '--cask', 'zed'],
      { env: termEnv(), timeout: ZED_INSTALL_MS, maxBuffer: 16e6 },
      done,
    );
  } catch (e) {
    zedInstall = { error: e.message };
    return { code: 500, error: e.message };
  }
  const said = chunk => {
    const l = chunk
      .split(/[\r\n]+/)
      .map(x => x.trim())
      .filter(x => x.startsWith('==> '))
      .pop();
    if (!l) return;
    z.line = l.slice(4);
    if (Date.now() - z.at >= 150) {
      z.at = Date.now();
      broadcast('editor', editorState());
    }
  };
  for (const st of [z.child.stdout, z.child.stderr]) st?.on('data', said);
  broadcast('editor', editorState());
  return editorState();
}
