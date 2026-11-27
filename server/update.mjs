// The board's own code, kept up to date from its checkout (2026-10-12): looked for, tried, taken — and what it
// touched started again.
import { createHash } from 'node:crypto';
import {
  chmodSync,
  closeSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { CHANGELOG, notesBetween, verCmp } from '../lib/changelog.mjs';
import { versionFrom } from '../lib/version.mjs';
import { execFileP, PKG, ROOT, STATE_FILE } from './env.mjs';
import { canRun, findBin } from './bins.mjs';
import { pidAlive } from './registry.mjs';
import { tildePath } from './setup.mjs';
import { broadcast } from './sse.mjs';
import {
  appBuild,
  autoUpdate,
  saveState,
  setAppBuild,
  setUpdateHeld,
  setUpdateLast,
  updateChannel,
  updateHeld,
  updateLast,
} from './state.mjs';
import { cleanEnv } from './terminals/terms.mjs';

// The login agent runs the board from a git checkout (scripts/launchd.sh), so an update is a pull. Every UPDATE_EVERY_MS
// the agent fetches its branch's upstream and says what came (the status bar's *N new commits*); with the switch on
// (`autoUpdate`, the settings' Updates — off by default since 2026-10-13) it fast-forwards to it — never a merge or a
// rebase, and never over a change of yours: a tracked file changed here, a branch that has moved on its own, a commit
// held back, each is said and waited out — once nothing has been typed into a drawer or done on the board for
// UPDATE_QUIET_MS. What the commits touched is started again (`updateParts`): the packages installed, the agent
// restarted (`launchd.sh restart`: the drawers stay, each a holder), the page reloaded (by itself, once it is left be: the
// `update` event), the app rebuilt (`mac/build.sh install`, detached: it quits and reopens the app) — whenever it is behind
// the checkout's mac/, not only when a pull touched it (2026-10-14, readApp): commits made here, which no pull ever sees,
// leave it as far behind, and that is said and rebuilt alone. Before any of that the new page is compiled and the new
// server started on a spare port (lib/testserver.mjs): one that does not come up is undone (`git reset --keep`) and its
// commit held back until a newer one comes. Only the agent looks by itself; a server run by hand, or a test's, looks when
// asked (`POST /api/update`). What it follows (2026-11-27, Settings › Updates' *Follow*): `releases`, the default — the
// newest release past the one HEAD is on, a release being the signed commit that sets package.json's version, its notes in
// CHANGELOG.md (lib/changelog.mjs; scripts/release.mjs cuts one) — or `main`, the upstream's tip, every commit. Knobs:
// UPDATE_DIR (the checkout), UPDATE_QUIET_MS, UPDATE_CHANNEL (the default of a board that never picked), UPDATE_RESTART_BIN
// / UPDATE_BUILD_BIN / NPM_BIN, what is run to restart, rebuild and install, and BOARD_APP, the installed app (the tests'
// stand-ins).
const UNDER_AGENT = process.env.XPC_SERVICE_NAME === 'net.peixairada.server' && process.ppid === 1; // launchd's own child, not a server started from a drawer (whose environment is the agent's)
export const UPDATE_EVERY_MS = Number(process.env.UPDATE_EVERY_MS ?? (UNDER_AGENT ? 30 * 60_000 : 0));
const UPDATE_QUIET_MS = Number(process.env.UPDATE_QUIET_MS ?? 2 * 60_000);
const UPDATE_DIR = process.env.UPDATE_DIR || ROOT;
export const CHANNELS = ['releases', 'main'];
const CHANNEL_DEFAULT = CHANNELS.includes(process.env.UPDATE_CHANNEL) ? process.env.UPDATE_CHANNEL : 'releases';
/** What this board follows: the one picked, else the default (2026-11-27). */
export const channelNow = () => updateChannel || CHANNEL_DEFAULT;
export const APP_DIR = process.env.BOARD_APP || '/Applications/peixAIrada.app'; // the installed app (BOARD_APP: the tests' stand-in)
export const APP_LOOK_MS = Number(process.env.APP_LOOK_MS || 60_000); // how often the installed app, and the code this server runs (2026-11-25), are held against the checkout (lookApp)
const restartBin = process.env.UPDATE_RESTART_BIN || (UNDER_AGENT ? join(UPDATE_DIR, 'scripts', 'launchd.sh') : '');
const buildBin =
  process.env.UPDATE_BUILD_BIN || (UNDER_AGENT && existsSync(APP_DIR) ? join(UPDATE_DIR, 'mac', 'build.sh') : '');
export let lastTouchAt = 0; // the last key sent to a drawer, or anything the board was asked to do (the HTTP handler)
export function setLastTouchAt(v) {
  lastTouchAt = v;
} // for the modules that write it: an import is read-only
// `steps`/`step`: what the update under way does and where it is (the status bar's progress); `failed`: its error, when the
// update itself went wrong — not a look that could not reach the remote; `building`: the app's rebuild running; `app`: the
// installed app against the checkout (readApp), and `appWhy` why it is not being rebuilt (appWhyNot).
export const upd = {
  busy: null,
  checkout: null,
  checkedAt: null,
  error: null,
  failed: null,
  why: null,
  pending: [],
  steps: null,
  step: -1,
  building: false,
  app: null,
  appWhy: null,
};
let updRetry = null;
// The code this server runs, against its checkout's (2026-11-25): a pull by hand — the way round an update the board would
// not take — left the agent on the server it started with, serving the new page from disk, whose new routes answered `not
// found` (every pin, the day Pinned came). What a restart takes in (updateParts' `deps` and `server`), stamped as it was
// when this server loaded it — at import, before a busy port is waited on: the agent behind the app's own server waits
// for hours with the code it loaded — and again as the checkout is read. What differs is `pending`, said where the update
// is; *update now* restarts the agent for it, the packages installed first when they moved.
const CODE_PARTS = { deps: ['package.json', 'package-lock.json'], server: ['server.mjs', 'server', 'lib'] };
function codeStamp(dir = UPDATE_DIR) {
  const out = {};
  for (const [part, files] of Object.entries(CODE_PARTS)) {
    const h = createHash('sha1');
    for (const f of files) {
      let names = [f];
      try {
        if (statSync(join(dir, f)).isDirectory())
          names = readdirSync(join(dir, f), { recursive: true })
            .map(n => join(f, n))
            .sort();
      } catch {}
      for (const n of names)
        try {
          h.update(`${n}\0`).update(readFileSync(join(dir, n)));
        } catch {} // a folder in lib/, a file gone: its name alone
    }
    out[part] = h.digest('hex');
  }
  return out;
}
const RAN_CODE = codeStamp();
/** What a restart would take in that this server lacks, in updateParts' order — none while one is on its way. */
export function staleParts() {
  if (upd.restarting || !upd.checkout) return [];
  const now = codeStamp(),
    moved = Object.keys(CODE_PARTS).filter(k => now[k] !== RAN_CODE[k]);
  return moved.includes('deps') ? ['deps', 'server'] : moved;
}
/** What a change to these files asks for, in the order it is done — pure. `deps`: npm install; `server`: a restart;
 *  `page`: a reload; `app`: a rebuild. The rest (docs, tests, the harness) asks for nothing. */
export function updateParts(files) {
  const has = new Set();
  for (const f of files) {
    if (/^package(-lock)?\.json$/.test(f)) has.add('deps').add('server');
    else if (f === 'server.mjs' || f.startsWith('server/') || f.startsWith('lib/')) has.add('server');
    else if (f.startsWith('public/')) has.add('page');
    else if (f.startsWith('mac/') && !f.endsWith('.md')) has.add('app'); // mac/'s notes are no part of the app (2026-10-28)
  }
  return ['deps', 'server', 'page', 'app'].filter(k => has.has(k));
}
export const updateState = () => {
  const { remote, merge, ...u } = upd;
  return {
    on: autoUpdate,
    channel: channelNow(),
    running: u.checkout ? u.written : PKG.version, // the release this board's code is on: HEAD's package.json as written; else its own
    every: UPDATE_EVERY_MS,
    quiet: UPDATE_QUIET_MS,
    dir: tildePath(UPDATE_DIR),
    restart: !!restartBin,
    ...u,
    last: updateLast,
    held: updateHeld,
    build: appBuild,
  };
}; // dir: the settings' commands cd there (2026-10-15); restart: this server restarts itself, as the agent does, for `pending` (2026-11-25)
export const sayUpdate = () => broadcast('update', updateState());
/** The environment of what an update runs: the server's, minus the nesting markers and the agent's own name, with the
 *  running node first on PATH (npm and build.sh want a node, and the agent's PATH may have none), and git never asking. */
function updateEnv() {
  const env = {
    ...cleanEnv(),
    PATH: `${dirname(process.execPath)}:${process.env.PATH || '/usr/bin:/bin'}`,
    GIT_TERMINAL_PROMPT: '0',
  };
  delete env.XPC_SERVICE_NAME;
  return env;
}
export const errText = e =>
  (
    String(e?.stderr || '')
      .trim()
      .split('\n')
      .filter(Boolean)
      .pop() || (e?.killed ? 'it took too long' : String(e?.message || e).split('\n')[0])
  )
    .replace(/^(fatal|error): /, '')
    .slice(0, 300);
function gitIn(args, timeout = 30_000, env = {}) {
  const bin = findBin('git', 'the board does not update itself');
  if (!bin) return Promise.reject(new Error('git is not installed'));
  return execFileP(bin, ['--no-optional-locks', '-C', UPDATE_DIR, ...args], {
    env: { ...updateEnv(), ...env },
    timeout,
    maxBuffer: 8 << 20,
  }).then(r => r.stdout.trim());
}
/** Where the checkout stands, read locally: its branch and upstream, how far each is past the other, the tracked files
 *  changed here (`dirty` how many, `changed` the first by name) and, behind, those of them the new commits change too
 *  (`clash`: what *update now* cannot pull over, 2026-10-15). Not a checkout — the app's bundled copy, or a folder inside
 *  some other repository — is `checkout: false`. */
const CHANGED_MAX = 20; // the changed files named to the page; `dirty` counts them all
export async function readCheckout() {
  const top = await gitIn(['rev-parse', '--show-toplevel']).catch(() => '');
  // both as the disk spells them (2026-11-25): node's own realpath keeps a path's case as typed, git's toplevel has the
  // disk's, and a board run from ~/Code/peixairada with ~/code on disk was no checkout to itself
  let here = UPDATE_DIR;
  try {
    here = realpathSync.native(UPDATE_DIR);
  } catch {}
  let there = top;
  try {
    there = top && realpathSync.native(top);
  } catch {}
  if (!top || there !== here) return { checkout: false };
  const co = {
    checkout: true,
    head: await gitIn(['rev-parse', 'HEAD']),
    branch: null,
    upstream: null,
    up: null,
    ahead: 0,
    behind: 0,
    dirty: 0,
    changed: [],
    clash: [],
    remote: null,
    merge: null,
    sign: null,
    commits: [],
    rewritten: false,
    fresh: 0,
    written: null,
    tip: null,
    past: 0,
    release: null,
    notes: [],
  };
  // the board's version at that commit (2026-10-21, lib/version.mjs): counted once per HEAD
  if (co.head === upd.head && upd.version) co.version = upd.version;
  else {
    const git = args => gitIn(args).catch(() => '');
    co.version =
      (await versionFrom(
        (() => {
          try {
            return JSON.parse(readFileSync(join(UPDATE_DIR, 'package.json'), 'utf8')).version;
          } catch {
            return PKG.version;
          }
        })(),
        git,
      )) || null;
  }
  co.written = await writtenAt('HEAD');
  co.branch = await gitIn(['symbolic-ref', '--quiet', '--short', 'HEAD']).catch(() => null);
  if (!co.branch) return co;
  co.remote = await gitIn(['config', `branch.${co.branch}.remote`]).catch(() => null);
  co.merge = await gitIn(['config', `branch.${co.branch}.merge`]).catch(() => null);
  co.upstream = await gitIn(['rev-parse', '--abbrev-ref', '@{u}']).catch(() => null);
  if (!co.upstream) return co;
  co.up = co.tip = await gitIn(['rev-parse', '@{u}']);
  [co.ahead, co.behind] = (await gitIn(['rev-list', '--left-right', '--count', 'HEAD...@{u}']))
    .split(/\s+/)
    .map(Number);
  const names = async (...args) =>
    (await gitIn(['diff', '--name-only', '--no-renames', '-z', ...args])).split('\0').filter(Boolean);
  const changed = [...new Set([...(await names('HEAD')), ...(await names('--cached'))])]; // the work tree's and the index's
  co.dirty = changed.length;
  co.changed = changed.slice(0, CHANGED_MAX);
  if (co.ahead && co.behind) co.rewritten = await rewrittenHere();
  // what this board would take (2026-11-27): on `main` the tip; on `releases` the newest release past HEAD's, and the
  // commits the tip has past it are `past` — none to take, behind is none
  let to = '@{u}';
  if (co.behind) {
    const rel = await newestRelease(co);
    co.release = rel?.version || null;
    if (channelNow() === 'releases') {
      const count = async range => Number(await gitIn(['rev-list', '--count', range]).catch(() => 0)) || 0;
      if (rel) {
        to = co.up = rel.sha;
        co.past = await count(`${rel.sha}..@{u}`);
        co.behind = await count(`HEAD..${rel.sha}`);
      } else {
        [co.past, co.behind, co.up, co.rewritten] = [co.behind, 0, co.head, false];
      }
    }
  }
  if (changed.length && co.behind && (!co.ahead || co.rewritten)) {
    const theirs = new Set(await names('HEAD', to));
    co.clash = changed.filter(f => theirs.has(f));
  }
  if (co.rewritten)
    co.fresh =
      Number(
        await gitIn(['rev-list', '--count', '--cherry-pick', '--right-only', `HEAD...${to}`]).catch(() => co.behind),
      ) || 0;
  if (co.behind) {
    co.sign = await signedBy(co.up);
    // the notes of every release it brings, newest first — from the changelog as that commit has it
    co.notes = notesBetween(
      await gitIn(['show', `${to}:${CHANGELOG}`]).catch(() => ''),
      co.written,
      await writtenAt(to),
    );
    co.commits = (
      await gitIn(['log', '-n', String(COMMITS_SAID), '--format=%h%x1f%an%x1f%s', `HEAD..${to}`]).catch(() => '')
    )
      .split('\n')
      .filter(Boolean)
      .map(l => {
        const [h, a, s] = l.split('\x1f');
        return { h, a, s };
      });
  }
  return co;
}
// The upstream's history rewritten (2026-11-06): its commits made again — a name taken out of every one of them — so
// this checkout's are none of its own any more and the branch reads as diverged, which no update takes. A rewrite says
// which commits it replaces: REWRITTEN in its tip, one old commit a line. When every commit here that the upstream has
// not got is one it names — no work of this checkout's own among them —, the update follows it: `git reset --keep` to
// the tip instead of a fast-forward, as signed as any update must be (signedBy), never over a change here the new
// history changes too (`clash`). A commit of this checkout's own among them: diverged, as ever.
const REWRITTEN = '.github/rewritten';
async function rewrittenHere(ref = '@{u}') {
  const list = new Set(
    (await gitIn(['show', `${ref}:${REWRITTEN}`]).catch(() => ''))
      .split('\n')
      .map(l => l.trim())
      .filter(l => /^[0-9a-f]{40}$/.test(l)),
  );
  if (!list.size) return false;
  const mine = (await gitIn(['rev-list', '@{u}..HEAD']).catch(() => '')).split('\n').filter(Boolean);
  return mine.length > 0 && mine.every(c => list.has(c));
}
/** package.json's version as a commit has it written (`0.2.0`), or null. */
async function writtenAt(ref) {
  try {
    const v = JSON.parse(await gitIn(['show', `${ref}:package.json`])).version;
    return typeof v === 'string' ? v : null;
  } catch {
    return null;
  }
}
// A release (2026-11-27) is the commit that sets package.json's version — newer than the one HEAD is on, and another
// than its parent's: a commit that touches a line naming "version" and leaves the version be is none. Signed, as every
// commit a board takes must be (signedBy). On a rewritten history only a release that has the rewrite in it, whose
// REWRITTEN names every commit here, so that nothing here is lost moving onto it.
const RELEASES_LOOKED = 60; // the commits that touched such a line, newest first, looked at for one
async function newestRelease(co) {
  const shas = (await gitIn(['log', '--format=%H', '-G"version"', 'HEAD..@{u}', '--', 'package.json']).catch(() => ''))
    .split('\n')
    .filter(Boolean)
    .slice(0, RELEASES_LOOKED);
  for (const sha of shas) {
    const version = await writtenAt(sha);
    if (!version || verCmp(version, co.written) <= 0 || version === (await writtenAt(`${sha}^`))) continue;
    if (co.rewritten && !(await rewrittenHere(sha))) continue;
    return { sha, version };
  }
  return null;
}
/** The notes of the releases after `since` up to the one on disk (2026-11-27; `GET /api/update/notes`): What's new reads
 *  them once a board is on a release its page has not shown — whoever moved it there, the board, `make update` or a pull. */
export function releaseNotes(since) {
  const read = f => {
    try {
      return readFileSync(join(UPDATE_DIR, f), 'utf8');
    } catch {
      return '';
    }
  };
  let running = null;
  try {
    running = JSON.parse(read('package.json')).version || null;
  } catch {}
  return { running, notes: running ? notesBetween(read(CHANGELOG), since, running) : [] };
}
// Only a commit the board's keys signed is taken (2026-11-06). An update runs what it pulls — npm, the pre-flight, a
// restart, the app rebuilt and signed with the user's own identity — so push access to the upstream was code on every
// board that follows it. The keys are SIGNERS as HEAD has it, never as the new commits do: a commit that adds a key is
// taken only when one already trusted signed it, and from then on that key is trusted too. Only the tip is checked, as
// `git merge --verify-signatures` does: whoever signed it vouched for the tree it brings. No list at HEAD — a fork that
// dropped it — is nothing to trust: nothing is taken. Hardened after an outside audit (2026-11-27): the list goes to a
// file in a folder of its own (`mkdtemp`, 0700, the file `wx`) — a name made of the pid, in a /tmp with no TMPDIR, was
// another account's to plant first (the agent has one: not here) —; ssh-keygen is the system's, /usr/bin, never the
// PATH's; git is asked for full trust, and a good signature that names no signer of the list is none.
const SIGNERS = '.github/allowed_signers';
const COMMITS_SAID = 20; // the new commits named to the page, newest first
const SSH_KEYGEN = '/usr/bin/ssh-keygen';
async function signedBy(sha) {
  const git = findBin('git', 'the board does not update itself'),
    keygen = canRun(SSH_KEYGEN) ? SSH_KEYGEN : null;
  if (!git || !keygen)
    return { sha, ok: false, why: `cannot be checked: ${git ? 'ssh-keygen' : 'git'} is not installed` };
  const list = await gitIn(['show', `HEAD:${SIGNERS}`]).catch(() => '');
  if (!list.trim())
    return { sha, ok: false, why: `cannot be checked: this checkout names no key to trust (${SIGNERS})` };
  const dir = mkdtempSync(join(tmpdir(), 'peixairada-signers-')),
    file = join(dir, 'allowed_signers');
  try {
    writeFileSync(file, list + '\n', { mode: 0o600, flag: 'wx' });
    const r = await execFileP(
      git,
      [
        '--no-optional-locks',
        '-C',
        UPDATE_DIR,
        '-c',
        `gpg.ssh.allowedSignersFile=${file}`,
        '-c',
        `gpg.ssh.program=${keygen}`,
        '-c',
        'gpg.minTrustLevel=fully',
        'verify-commit',
        sha,
      ],
      { env: updateEnv(), timeout: 30_000 },
    );
    const by = /Good "git" signature for (\S+)/.exec(String(r.stderr))?.[1] || null;
    return by ? { sha, ok: true, by } : { sha, ok: false, why: 'is not signed by a key this board trusts' };
  } catch (e) {
    const err = String(e?.stderr || '');
    // git says nothing at all of a commit with no signature
    return {
      sha,
      ok: false,
      why:
        (e?.code === 1 && !err.trim()) || /no signature found/i.test(err)
          ? 'is not signed'
          : /principal|not trusted|allowed signers|could not verify|bad signature/i.test(err)
            ? 'is not signed by a key this board trusts'
            : errText(e),
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
/** HEAD's mac/ as the app is built from it: its tree, the notes (`*.md`, mac/CLAUDE.md) left out (2026-10-28) — as
 *  build.sh leaves them out of its stamp, so a note is no rebuild. The same tree as HEAD:mac while it has none. */
async function macSource() {
  const tree = await gitIn(['rev-parse', '--verify', '--quiet', 'HEAD:mac']).catch(() => '');
  const notes = tree
    ? (await gitIn(['ls-tree', '-r', '-z', '--name-only', tree])).split('\0').filter(f => f.endsWith('.md'))
    : [];
  if (!notes.length) return tree;
  const dir = mkdtempSync(join(tmpdir(), 'peixairada-mac-')), // a folder of its own, as signedBy's (2026-11-27)
    env = { GIT_INDEX_FILE: join(dir, 'index') }; // an index of its own: the checkout's is not touched
  try {
    await gitIn(['read-tree', tree], 30_000, env);
    await gitIn(['update-index', '--force-remove', '--', ...notes], 30_000, env);
    return await gitIn(['write-tree'], 30_000, env);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
/** The installed app against the checkout (2026-10-14): build.sh stamps the app with the tree of mac/ it was built from
 *  (`PeixSource` in its Info.plist), and an app whose stamp is not HEAD's mac/ (`macSource`) is `behind` — one from
 *  before the stamp too. `changes`: uncommitted work in mac/ but its notes, which a build would take in. Null: no app
 *  installed, or no mac/ here. */
export async function readApp() {
  if (!existsSync(APP_DIR)) return null;
  const source = await macSource().catch(() => '');
  if (!source) return null;
  let built = null;
  try {
    built =
      /<key>PeixSource<\/key>\s*<string>([0-9a-f]{40,64})<\/string>/.exec(
        readFileSync(join(APP_DIR, 'Contents', 'Info.plist'), 'utf8'),
      )?.[1] || null;
  } catch {}
  if (built === source) return { built, source, behind: false, changes: 0 };
  return {
    built,
    source,
    behind: true,
    changes: (await gitIn(['status', '--porcelain', '--', 'mac', ':(exclude)mac/*.md'])).split('\n').filter(Boolean)
      .length,
  };
}
const quietLeft = () => UPDATE_QUIET_MS - (Date.now() - lastTouchAt);
/** Why the checkout is not to be moved now, or null. `asked`: from the page (no waiting for quiet); `apply`: its
 *  *update now* (the switch off and a held commit do not stop it). Waiting for quiet looks again when it would be. */
function whyNot(asked, apply) {
  if (!upd.checkout) return 'none';
  if (!upd.branch) return 'detached';
  if (!upd.upstream) return 'no-upstream';
  if (!upd.behind) return 'current';
  if (upd.ahead && !upd.rewritten) return 'diverged';
  if (!upd.sign?.ok) return 'unsigned'; // not even *update now* takes it (2026-11-06)
  if (upd.dirty && (!apply || upd.clash.length)) return 'changes'; // *update now* pulls over them (2026-10-15) — a fast-forward keeps them —, never over one the commits change too
  if (!autoUpdate && !apply) return 'off';
  if (updateHeld?.to === upd.up && !apply) return 'held';
  const rest = quietLeft();
  if (!asked && rest > 0) {
    updRetry = setTimeout(checkUpdate, rest + 1000);
    return 'busy';
  }
  return null;
}
/** Why the app is not to be rebuilt now, or null (2026-10-14) — pure. `pull`: a pull taken now or once the board rests
 *  brings it along (applyUpdate). Alone: *update now* (`apply`), or the switch on and the board at rest — and by the clock
 *  never twice for one source (`tried`): a build that failed, or left the app as it was (a stamp of changes never
 *  committed), waits for a commit or the button. Never over uncommitted work in mac/ (`changes`). `manual`: this server
 *  does not rebuild it (not the login agent) — `mac/build.sh install` does. */
export function appWhyNot(asked, apply, pull) {
  const a = upd.app;
  if (!a?.behind) return 'none';
  if (!buildBin) return 'manual';
  if (upd.building) return 'building';
  if (pull) return 'pull';
  if (a.changes) return 'changes';
  if (apply) return null;
  if (!autoUpdate) return 'off';
  if (appBuild?.source === a.source) return 'tried';
  return !asked && quietLeft() > 0 ? 'busy' : null;
}
/** Look for new commits, and take them when nothing says not to. One at a time; the answer is the state after it. */
export async function checkUpdate({ asked = false, apply = false } = {}) {
  if (upd.busy) return updateState();
  clearTimeout(updRetry);
  updRetry = null;
  upd.busy = 'checking';
  upd.steps = null;
  upd.step = -1;
  sayUpdate();
  try {
    Object.assign(upd, await readCheckout(), { error: null });
    // its branch alone, and no FETCH_HEAD: a `git pull` of yours at the same moment reads its own
    if (upd.upstream && upd.remote && upd.merge) {
      await gitIn(['fetch', '--quiet', '--no-tags', '--no-write-fetch-head', upd.remote, upd.merge], 120_000);
      Object.assign(upd, await readCheckout());
    }
    upd.checkedAt = new Date().toISOString();
    upd.app = upd.checkout ? await readApp() : null;
    upd.why = whyNot(asked, apply);
    if (upd.why === 'current') upd.failed = null;
    upd.appWhy = appWhyNot(asked, apply, !upd.why || upd.why === 'busy');
    if (upd.appWhy === 'busy') updRetry = setTimeout(checkUpdate, quietLeft() + 1000);
    upd.pending = staleParts();
    if (!upd.why) {
      upd.busy = 'updating';
      upd.failed = null;
      await applyUpdate();
    } else {
      if (!upd.appWhy) {
        upd.failed = null;
        startBuild();
      } // nothing to pull, and the app behind: rebuilt alone
      if (apply && restartBin && upd.pending.length) await restartStale(); // nothing to pull, and this server older than its checkout (2026-11-25)
    }
  } catch (e) {
    upd.error = errText(e);
    if (upd.busy === 'updating') upd.failed = upd.error;
    console.error(`[peixairada] update: ${upd.error}`);
  } finally {
    upd.busy = null;
    sayUpdate();
  }
  return updateState();
}
async function applyUpdate() {
  const from = upd.head,
    to = upd.up,
    rewritten = !!upd.rewritten,
    count = rewritten ? upd.fresh : upd.behind;
  const parts = updateParts((await gitIn(['diff', '--name-only', from, to])).split('\n').filter(Boolean));
  const has = k => parts.includes(k),
    checkPage = has('page') && existsSync(join(UPDATE_DIR, 'scripts', 'check-page.mjs'));
  upd.steps = [
    'pull',
    ...(has('deps') ? ['deps'] : []),
    ...(checkPage ? ['page'] : []),
    ...(has('server') ? ['server'] : []),
    ...(buildBin && (has('app') || upd.app?.behind) ? ['build'] : []),
    ...(has('server') && restartBin ? ['restart'] : []),
  ];
  const step = k => {
    upd.step = upd.steps.indexOf(k);
    sayUpdate();
  };
  step('pull');
  if (!upd.sign?.ok || upd.sign.sha !== to)
    throw new Error(`${to.slice(0, 7)} was not taken: it ${upd.sign?.why || 'was not checked'}`); // the one checked, and no other
  if (rewritten)
    await gitIn(['reset', '--quiet', '--keep', to], 60_000).catch(e => {
      throw new Error(`not followed: ${errText(e)}`);
    }); // onto the rewritten history, the changes here kept
  else
    await gitIn(['merge', '--ff-only', '--quiet', to], 60_000).catch(e => {
      throw new Error(mergeRefused(e) || errText(e));
    });
  try {
    if (has('deps')) {
      step('deps');
      await npmInstall();
    }
    await preflight(parts, to, step);
  } catch (e) {
    // undone only while the branch is where the pull left it (2026-10-14): a commit made here meanwhile — a session's,
    // during npm install and the pre-flight — is never reset away; the checkout is then left as it is, and said
    const at = await gitIn(['rev-parse', 'HEAD']).catch(() => null),
      br = await gitIn(['symbolic-ref', '--quiet', '--short', 'HEAD']).catch(() => null);
    const stays = '; the checkout stays as it is, and a restart runs it';
    const undo =
      br !== upd.branch
        ? ` — not undone: the checkout is on another branch since${stays}`
        : at === from
          ? '' // undone already, by hand
          : at !== to
            ? ` — not undone: ${at?.slice(0, 7) || 'its HEAD'} was committed on it since${stays}`
            : await gitIn(['reset', '--quiet', '--keep', from]).then(
                () => '',
                err => ` — and undoing it failed: ${errText(err)}${stays}`,
              );
    if (!undo && parts.includes('deps')) await npmInstall().catch(() => {});
    setUpdateHeld({ to, why: e.message, at: new Date().toISOString() });
    saveState();
    Object.assign(upd, await readCheckout().catch(() => ({})));
    upd.why = 'held';
    throw new Error(`${to.slice(0, 7)} was not kept: ${e.message}${undo}`, { cause: e });
  }
  setUpdateHeld(null);
  const release = verCmp(upd.release, upd.written) > 0 ? upd.release : null; // the newest release it brought, if any (2026-11-27)
  setUpdateLast({
    at: new Date().toISOString(),
    from,
    to,
    count,
    parts,
    ...(release && { release }),
    ...(rewritten && { rewritten: true }),
  });
  saveState();
  Object.assign(upd, await readCheckout(), { why: 'current' });
  upd.app = await readApp();
  console.log(
    `[peixairada] updated ${from.slice(0, 7)} → ${to.slice(0, 7)} (${count} commit${count === 1 ? '' : 's'}${rewritten ? ', onto its rewritten history' : ''}): ${parts.join(', ') || 'nothing to start again'}`,
  );
  upd.pending = has('server') && restartBin ? [] : staleParts(); // the app's, when this server does not rebuild it, is appWhy's `manual`
  upd.appWhy = appWhyNot(true, true, false); // the commits taken: the app comes along whenever it is behind them
  if (!upd.appWhy) {
    step('build');
    startBuild();
  }
  if (has('server') && restartBin) {
    upd.restarting = true;
    step('restart');
    setTimeout(() => detach(restartBin, ['restart', '--detached']), 1000);
  } // the answer and the event go out first
}
/** *update now* with nothing to pull and this server older than its checkout (2026-11-25, `pending`): the packages
 *  installed when they moved, the server on disk tried on a spare port, then the agent restarted. */
async function restartStale() {
  const deps = upd.pending.includes('deps');
  upd.busy = 'updating';
  upd.failed = null;
  upd.steps = [...(deps ? ['deps'] : []), 'server', 'restart'];
  const step = k => {
    upd.step = upd.steps.indexOf(k);
    sayUpdate();
  };
  if (deps) {
    step('deps');
    await npmInstall();
  }
  await preflight(['server'], upd.head, step);
  upd.pending = [];
  upd.restarting = true;
  upd.restartAt = new Date().toISOString();
  step('restart');
  console.log(
    `[peixairada] update: restarting for the checkout's ${deps ? 'packages and server' : 'server'}, newer than this one`,
  );
  setTimeout(() => detach(restartBin, ['restart', '--detached']), 1000); // the answer and the event go out first
}
/** git's refusal to fast-forward over files here, said as the settings say a clash (2026-10-15): which files, and what
 *  to do about them — a change made since the look, or a file not in git that the commits add. Null for any other failure. */
function mergeRefused(e) {
  const m =
    /(local changes to the following files|untracked working tree files) would be (?:overwritten|removed) by merge:\n((?:\t.*\n?)+)/.exec(
      String(e?.stderr || ''),
    );
  if (!m) return null;
  const files = m[2]
      .split('\n')
      .map(f => f.trim())
      .filter(Boolean),
    it = files.length === 1 ? 'it' : 'them';
  const list = files.slice(0, 3).join(', ') + (files.length > 3 ? ` and ${files.length - 3} more` : '');
  return m[1].startsWith('untracked')
    ? `not pulled: ${list}, not in git here, would be written over by the new commits — move ${it} away, then check now`
    : `not pulled: ${list} changed here, and the new commits change ${it} too — commit or discard ${it}, then check now`;
}
/** The app's rebuild, followed to its end: by its exit while this server is its parent, else — after the restart that
 *  usually comes with it — by its pid every few seconds and its log's last word (build.sh says `installed →`). Kept as
 *  `appBuild` ({pid, at, source, done, ok, why}), so the settings and the status bar say how it went. */
const BUILD_LOG = join(dirname(STATE_FILE), 'app-build.log');
function startBuild() {
  const at = new Date().toISOString(),
    source = upd.app?.source || null;
  try {
    writeFileSync(BUILD_LOG, '');
  } catch {}
  const p = detach(buildBin, ['install', '--detached'], BUILD_LOG);
  if (!p?.pid) {
    setAppBuild({ at, source, done: at, ok: false, why: `${basename(buildBin)} did not start` });
    saveState();
    return;
  }
  console.log('[peixairada] update: rebuilding the app — it quits and opens again');
  setAppBuild({ pid: p.pid, at, source });
  saveState();
  upd.building = true;
  upd.appWhy = 'building';
  p.once('exit', code => buildEnded(code));
}
function buildEnded(code = null) {
  const b = appBuild;
  if (!b || b.done) return;
  let tail = '';
  try {
    tail = readFileSync(BUILD_LOG, 'utf8').trim();
  } catch {}
  const ok = code === 0 || (code === null && /installed → /.test(tail));
  setAppBuild({
    ...b,
    done: new Date().toISOString(),
    ok,
    ...(ok ? {} : { why: (tail.split('\n').pop() || `it exited ${code}`).slice(0, 200) }),
  });
  upd.building = false;
  saveState();
  sayUpdate();
  console.log(`[peixairada] update: the app ${ok ? 'rebuilt' : `was not rebuilt — ${appBuild.why}`}`);
  lookApp(); // its stamp now
}
/** The installed app held against the checkout again (every APP_LOOK_MS, and as a build ends) — a commit made here, a
 *  build of yours — and said when that changed. With the switch on, an app gone behind is rebuilt as a pull is taken:
 *  by checkUpdate, once the board rests. */
export async function lookApp() {
  if (upd.busy || !upd.checkout) return;
  const a = await readApp().catch(() => upd.app);
  // a pull by hand (2026-11-25): the checkout read again once HEAD moves, and the code a restart would take in
  const head = await gitIn(['rev-parse', 'HEAD']).catch(() => upd.head);
  const co = head !== upd.head ? await readCheckout().catch(() => null) : null;
  if (upd.busy) return;
  const was = JSON.stringify([upd.app, upd.appWhy, upd.pending, upd.head, upd.why]);
  if (co) {
    Object.assign(upd, co);
    if (!upd.behind) upd.why = whyNot(false, false);
  }
  upd.pending = staleParts();
  upd.app = a;
  upd.appWhy = appWhyNot(false, false, upd.why === 'busy');
  if (UPDATE_EVERY_MS > 0 && !updRetry && (upd.appWhy === null || upd.appWhy === 'busy')) {
    checkUpdate();
    return;
  }
  if (JSON.stringify([upd.app, upd.appWhy, upd.pending, upd.head, upd.why]) !== was) sayUpdate();
}
export function watchBuild() {
  const b = appBuild;
  if (!b || b.done) return;
  if (b.pid && pidAlive(b.pid)) {
    if (!upd.building) {
      upd.building = true;
      sayUpdate();
    }
    setTimeout(watchBuild, 3000);
  } else buildEnded();
}
/** The packages as the lockfile has them, and nothing else (2026-11-06): `npm ci`, never `install` — which could move
 *  past the lockfile and runs every package's install scripts. The scripts stay off: node-pty runs from the prebuilt
 *  binaries in its package, and the one thing a script did here, package.json's postinstall, is done by hand. */
async function npmInstall() {
  const beside = join(dirname(process.execPath), 'npm');
  const npm =
    process.env.NPM_BIN ||
    (canRun(beside) ? beside : findBin('npm', 'an update that changes the packages is not taken'));
  if (!npm) throw new Error('npm not found');
  await execFileP(npm, ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], {
    cwd: UPDATE_DIR,
    env: updateEnv(),
    timeout: 10 * 60_000,
    maxBuffer: 16 << 20,
  }).catch(e => {
    throw new Error(`npm ci failed: ${errText(e)}`);
  });
  const pre = join(UPDATE_DIR, 'node_modules', 'node-pty', 'prebuilds');
  try {
    for (const d of readdirSync(pre)) {
      const f = join(pre, d, 'spawn-helper');
      if (existsSync(f) && !(statSync(f).mode & 0o100)) chmodSync(f, 0o755);
    }
  } catch {}
}
/** The new code, tried before it is kept: the page's script compiled, the server started on a spare port with a state
 *  of its own (the tests' throwaway server, imported fresh from the checkout) and its page asked for. */
async function preflight(parts, to, step = () => {}) {
  const check = join(UPDATE_DIR, 'scripts', 'check-page.mjs');
  if (parts.includes('page') && existsSync(check)) step('page');
  if (parts.includes('page') && existsSync(check))
    await execFileP(process.execPath, [check, join(UPDATE_DIR, 'public', 'index.html')], {
      cwd: UPDATE_DIR,
      env: updateEnv(),
      timeout: 60_000,
    }).catch(e => {
      throw new Error(
        `its page does not compile (${(
          String(e.stderr || '')
            .trim()
            .split('\n')[0] || errText(e)
        )
          .replace(`${UPDATE_DIR}/`, '')
          .slice(0, 200)})`,
      );
    });
  if (!parts.includes('server')) return;
  step('server');
  const { startTestServer } = await import(`${pathToFileURL(join(UPDATE_DIR, 'lib', 'testserver.mjs')).href}?${to}`);
  let srv;
  try {
    srv = await startTestServer({ env: { UPDATE_EVERY_MS: '0' } });
  } catch (e) {
    console.error(`[peixairada] update: ${to.slice(0, 7)}'s server did not start —\n${e.message}`);
    throw new Error(
      `its server did not start (${(e.message.match(/^.*(Error|error).*$/gm) || [e.message.split('\n')[0]]).pop().trim().slice(0, 200)})`,
      { cause: e },
    );
  }
  try {
    const r = await srv.api('/');
    if (!r.ok) throw new Error(`its server answered ${r.status} for the page`);
  } finally {
    await srv.stop();
  }
}
/** Run what restarts or rebuilds, cut loose: its own process group (the agent's restart ends this process, and launchd
 *  the job's group with it), its output in a log of the state folder's. The child, or null. */
function detach(bin, args, log = join(dirname(STATE_FILE), 'update.log')) {
  try {
    mkdirSync(dirname(log), { recursive: true });
    const fd = openSync(log, 'a');
    try {
      const p = spawn(bin, args, { cwd: UPDATE_DIR, env: updateEnv(), detached: true, stdio: ['ignore', fd, fd] });
      p.on('error', e => console.error(`[peixairada] update: ${basename(bin)} did not start — ${e.message}`));
      p.unref();
      return p;
    } finally {
      closeSync(fd);
    }
  } catch (e) {
    console.error(`[peixairada] update: could not run ${basename(bin)} — ${e.message}`);
    return null;
  }
}
