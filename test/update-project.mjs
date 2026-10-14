// The update tests' throwaway project (2026-10-14, out of test/update.test.mjs, so its stories run as files of their own,
// side by side): a bare "origin", a clone the server updates (`co`) and one that commits and pushes (`dev`); its
// server.mjs a few lines that answer, its lib/testserver.mjs, check-page and page the real ones (the pre-flight runs
// them); the restart, the app's build and npm stand-ins that write down what they were asked; the installed app a folder
// with an Info.plist, stamped as build.sh does.
import { execFileSync } from 'node:child_process';
import { chmodSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpDir } from '../lib/testserver.mjs';

export const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const TINY = `import { createServer } from 'node:http';\nconst s = createServer((req, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{}'); });\ns.listen(Number(process.env.PORT), '127.0.0.1', () => console.log('[tiny] listening on ' + process.env.PORT));\nprocess.on('SIGTERM', () => process.exit(0));\n`;
export const PAGE = readFileSync(join(ROOT, 'public', 'index.html'), 'utf8');

/** origin.git, a clone the server updates (`co`) and one that commits and pushes (`dev`); the stand-ins write to `marks`;
 *  the installed app (`app`) built from the first commit's mac/, until a build stamps it again. */
export function project() {
  const root = tmpDir('peix-upd-'), origin = join(root, 'origin.git'), co = join(root, 'co'), dev = join(root, 'dev'), marks = join(root, 'marks'), app = join(root, 'peixAIrada.app');
  const git = (cwd, ...args) => execFileSync('git', ['-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', '-C', cwd, ...args], { encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 'test', GIT_AUTHOR_EMAIL: 'test@example.com', GIT_COMMITTER_NAME: 'test', GIT_COMMITTER_EMAIL: 'test@example.com' } }).trim();
  const write = (dir, files) => { for (const [f, body] of Object.entries(files)) { mkdirSync(dirname(join(dir, f)), { recursive: true }); writeFileSync(join(dir, f), body); } };
  mkdirSync(dev);
  git(dev, 'init', '-q', '-b', 'main');
  write(dev, { 'server.mjs': TINY, 'package.json': '{ "name": "tiny" }\n', 'README.md': 'tiny\n', 'public/index.html': PAGE });
  for (const f of ['lib/testserver.mjs', 'scripts/check-page.mjs', 'mac/Sources/main.swift']) cpSync(join(ROOT, f), join(dev, f));
  git(dev, 'add', '-A'); git(dev, 'commit', '-q', '-m', 'the first');
  git(root, 'init', '-q', '--bare', '-b', 'main', origin);
  git(dev, 'remote', 'add', 'origin', origin); git(dev, 'push', '-q', '-u', 'origin', 'main');
  git(root, 'clone', '-q', origin, co);
  const plist = join(app, 'Contents', 'Info.plist'), stamp = tree => { mkdirSync(dirname(plist), { recursive: true }); writeFileSync(plist, `<plist version="1.0"><dict>\n  <key>PeixSource</key><string>${tree}</string>\n</dict></plist>\n`); };
  stamp(git(co, 'rev-parse', 'HEAD:mac'));
  const stand = (name, then = '') => { const f = join(root, name); writeFileSync(f, `#!/bin/sh\necho "${name} $*" >> "${marks}"\n${then}`); chmodSync(f, 0o755); return f; };
  // the app's build as build.sh ends: stamped with the checkout's mac/ and `installed →`, or a compiler's complaint; slow
  // when asked to (a file says so)
  const build = stand('build', `[ -f "${root}/build-slow" ] && sleep 2\n[ -f "${root}/build-fails" ] && { echo "swiftc: error: no such module 'Cocoa'"; exit 1; }\nprintf '<plist><dict><key>PeixSource</key><string>%s</string></dict></plist>\\n' "$(git -C "${co}" rev-parse HEAD:mac)" > "${plist}"\necho "installed → /Applications/peixAIrada.app"\n`);
  const env = { UPDATE_DIR: co, UPDATE_RESTART_BIN: stand('restart'), UPDATE_BUILD_BIN: build, NPM_BIN: stand('npm'), BOARD_APP: app };
  /** a commit on origin, as from someone else's machine; its sha */
  const push = (files, msg = 'a change') => { write(dev, files); git(dev, 'add', '-A'); git(dev, 'commit', '-q', '-m', msg); git(dev, 'push', '-q'); return git(dev, 'rev-parse', 'HEAD'); };
  const head = () => git(co, 'rev-parse', 'HEAD');
  const asked = () => existsSync(marks) ? readFileSync(marks, 'utf8').trim().split('\n') : [];
  /** a commit made here, in the checkout the server runs from — never pushed, so no pull ever brings it */
  const commit = (files, msg = 'a change of mine') => { write(co, files); git(co, 'add', '-A'); git(co, 'commit', '-q', '-m', msg); return git(co, 'rev-parse', 'HEAD'); };
  const builds = () => asked().filter(l => l.startsWith('build ')).length;
  return { root, co, env, git, write, push, commit, head, asked, builds, stamp, flag: (name, on) => on ? writeFileSync(join(root, name), '') : rmSync(join(root, name), { force: true }) };
}
