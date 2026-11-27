// The CLIs the server runs, found on a bare PATH too (findBin): git, gh, claude, code, …
import { accessSync, constants as fsc, statSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

// launchd and the Mac app hand the server almost no PATH, so the CLIs we shell out to are resolved
// the way the app resolves node: PATH first, then the layouts the installers actually use.
const BIN_FALLBACKS = {
  claude: [join(homedir(), '.local', 'bin', 'claude'), '/opt/homebrew/bin/claude', '/usr/local/bin/claude'],
  gh: ['/opt/homebrew/bin/gh', '/usr/local/bin/gh', join(homedir(), '.local', 'bin', 'gh')],
  // who still holds a background command's output file open — the one honest answer to "is it still running"
  lsof: ['/usr/sbin/lsof', '/usr/bin/lsof'],
  // brew's or the Command Line Tools' — /usr/bin/git is only a shim that asks to install them when they are not there
  git: [
    '/opt/homebrew/bin/git',
    '/usr/local/bin/git',
    '/Library/Developer/CommandLineTools/usr/bin/git',
    '/usr/bin/git',
  ],
  // go-task, for the folders whose Taskfile launches claude (see launchersFor): mise's shim first, then brew and go
  task: [
    join(homedir(), '.local', 'share', 'mise', 'shims', 'task'),
    '/opt/homebrew/bin/task',
    '/usr/local/bin/task',
    join(homedir(), 'go', 'bin', 'task'),
  ],
  // Zed, installed when it is picked as the editor (see installZed): Homebrew, and Launch Services' own tool
  brew: ['/opt/homebrew/bin/brew', '/usr/local/bin/brew'],
  lsregister: [
    '/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister',
  ],
  // "Shell Command: Install 'code' command in PATH" symlinks /usr/local/bin/code; the last two
  // entries are the binaries inside the app bundles, for when it was never run.
  code: [
    '/usr/local/bin/code',
    '/opt/homebrew/bin/code',
    '/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code',
    '/Applications/Cursor.app/Contents/Resources/app/bin/code',
  ],
};

export const binCache = new Map();

/** `<NAME>_BIN` in the environment (CLAUDE_BIN, GH_BIN) overrides the search. A file that can be run, not just a path
 *  that exists (a directory, a file without the bit: a spawn of it is an 'error' event); and none found is asked again
 *  a minute later rather than never — a gh installed while the board runs is found (2026-10-03). */
const BIN_RETRY_MS = 60_000;

export const canRun = f => {
  try {
    accessSync(f, fsc.X_OK);
    return statSync(f).isFile();
  } catch {
    return false;
  }
};

export function findBin(name, missingNote) {
  const hit = binCache.get(name);

  if (hit && (hit.path || Date.now() - hit.at < BIN_RETRY_MS)) return hit.path;
  const env = process.env[`${name.toUpperCase()}_BIN`];

  const path =
    [
      ...(env ? [env] : []),
      ...(process.env.PATH || '')
        .split(':')
        .filter(Boolean)
        .map(d => join(d, name)),
      ...(BIN_FALLBACKS[name] || []),
    ].find(canRun) || null;

  if (!path && !hit) console.error(`[peixairada] ${name} not found — ${missingNote}`);
  binCache.set(name, { path, at: Date.now() });
  return path;
}

// Declarations, not arrows: the PR-status code above calls ghBin().
export function claudeBin() {
  return findBin('claude', 'replies to stale chats are disabled');
}

export function ghBin() {
  return findBin('gh', 'PR status colours are disabled');
}

export function codeBin() {
  return findBin('code', 'VS Code Web is disabled');
}
