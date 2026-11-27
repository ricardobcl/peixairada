// VS Code Web: the editor `code serve-web` serves, for the pane — started, its token, kept on its newest build.
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { spawn } from 'node:child_process';
import { execFileP, STATE_FILE } from './env.mjs';
import { binCache, codeBin } from './bins.mjs';
import { keyFile } from './key.mjs';
import { drawerEnv } from './terminals/terms.mjs';

// The desktop app cannot be embedded, but the VS Code CLI can serve the same editor as a web page,
// with a server-side extension host on this Mac: real files, real terminal, real git, and the Claude
// Code extension (a workspace-side extension) running against the same ~/.claude. It is a separate
// VS Code instance: its own settings and extensions (`~/.vscode-server/extensions`, installed once
// with the server's own CLI — see README), and the folder must be trusted once per browser profile.
// Started on first use and adopted if what already answers on the port wants this board's token; the child belongs to
// this server, so it goes when the server goes. Loopback only, and behind a connection token (2026-10-16): started
// `--without-connection-token`, it served the editor — its terminal, every file — to anything that reached the port: a
// container (Docker's host.docker.internal is this Mac's loopback), another account, a web page by DNS rebinding (it
// answers any Host). The token is a file in the state folder, this user's alone (`vsweb-token`, 0600); serve-web reads
// it there, the page puts it on the address it opens (`tkn`), and serve-web trades it for its cookie (`vscode-tkn`) and
// drops it from the address with a 302 — a tab's address and its reload are the plain one.
const VSWEB_PORT = Number(process.env.VSWEB_PORT || 7332);
const VSWEB_URL = `http://127.0.0.1:${VSWEB_PORT}/`;
const VSWEB_TOKEN_FILE = join(dirname(STATE_FILE), 'vsweb-token');
let vsweb = null; // the child, while it is ours
let vswebTok = null; // the token as read

/** The token serve-web is started with: the file's, else a new one written there. */
function vswebToken() {
  return (vswebTok ||= keyFile(VSWEB_TOKEN_FILE));
}

// …and goes with it: a signal that ends this server ends the child too, instead of orphaning an
// editor server on the port for the next run to adopt without knowing whose it is (the hooks are main()'s: an
// import — the tests — installs nothing).
// `code` is a wrapper script around the real binary, so the child runs in its own process group and
// the whole group is signalled — killing the wrapper alone left the server behind on the port.
export function endVsWebWithUs() {
  process.on('exit', () => {
    if (vsweb) {
      try {
        process.kill(-vsweb.pid, 'SIGTERM');
      } catch {
        try {
          vsweb.kill();
        } catch {}
      }
    }
  });

  for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => process.exit(0));
}

// `path` is what is asked of it: the root by default — which starts the newest build's server —, a build by name for
// freshenVsWeb, which only has it fetched. With the token's cookie, unless `bare`.
const vswebAnswers = (path = '', bare = false) =>
  fetch(VSWEB_URL + path, {
    headers: bare ? {} : { cookie: `vscode-tkn=${vswebToken()}` },
    signal: AbortSignal.timeout(1500),
  }).then(
    r => {
      r.body?.cancel();
      return r.status;
    },
    () => 0,
  );

/** Who listens on `port`: the first listener's {pid, pgid, uid, comm}, or null — none, or one lsof cannot see (another
 *  account's). lsof and ps by their own paths. */
async function portListener(port) {
  try {
    const { stdout } = await execFileP('/usr/sbin/lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-Fpc'], {
      timeout: 5000,
    });

    const pid = Number(/^p(\d+)$/m.exec(stdout)?.[1]);

    if (!pid) return null;

    const [pgid, uid] = (await execFileP('/bin/ps', ['-o', 'pgid=,uid=', '-p', String(pid)], { timeout: 5000 })).stdout
      .trim()
      .split(/\s+/)
      .map(Number);

    return { pid, pgid, uid, comm: /^c(.*)$/m.exec(stdout)?.[1] || '' };
  } catch {
    return null;
  } // lsof exits 1 when nothing listens
}

/** Why what answers on the port is not this board's VS Code Web, or null. Nothing is handed the token before that is
 *  known (2026-11-06: the first look carried the cookie, so whatever held the port — another account, a container's
 *  published port — was handed it). Asked bare first: a serve-web that answers that — one started before 2026-10-16 that
 *  outlived its board, or anyone's — is not this board's. One that wants a token is, when its listener is the serve-web
 *  this server started (its process group), or this user's own VS Code CLI — a serve-web an earlier run of the board
 *  left. `status`: what the bare look answered. Asked before every look that carries the token — the route's, freshenVsWeb's
 *  (2026-11-27, the external audit's lead 3): once trusted, the port was trusted for good, and an adopted serve-web that
 *  ended left the token to whoever took the port next. */
async function vswebWhyNot(status) {
  if (status && status !== 403) {
    return `something on port ${VSWEB_PORT} serves VS Code Web with no token — not this board's; stop it (lsof -iTCP:${VSWEB_PORT} -sTCP:LISTEN), or set VSWEB_PORT`;
  }

  const l = await portListener(VSWEB_PORT);

  if (!l || l.uid !== process.getuid()) {
    return `something on port ${VSWEB_PORT} that is not yours answers — not this board's VS Code Web; set VSWEB_PORT`;
  }

  if (!(vsweb && l.pgid === vsweb.pid) && !/^code(-tunnel)?$/.test(basename(l.comm))) {
    return `${l.comm} (pid ${l.pid}) listens on port ${VSWEB_PORT}, not VS Code Web — stop it, or set VSWEB_PORT`;
  }

  return null;
}

export async function ensureVsWeb(path = '') {
  let token;

  try {
    token = vswebToken();
  } catch (e) {
    return { code: 500, error: `could not keep VS Code Web's token in ${VSWEB_TOKEN_FILE}: ${e.message}` };
  }

  const bare = await vswebAnswers(path, true);

  if (bare) {
    const why = await vswebWhyNot(bare);

    if (why) return { code: 409, error: why };
  }

  const now = bare === 0 ? 0 : await vswebAnswers(path);

  if (now) {
    return now === 403
      ? {
          code: 409,
          error: `something on port ${VSWEB_PORT} refuses this board's token — another VS Code Web; stop it, or set VSWEB_PORT`,
        }
      : { ok: true, url: VSWEB_URL, token, started: false };
  }

  const code = codeBin();

  if (!code) {
    return {
      code: 501,
      error: 'code CLI not found — run "Shell Command: Install \'code\' command in PATH" in VS Code, or set CODE_BIN',
    };
  }

  if (!vsweb) {
    try {
      vsweb = spawn(
        code,
        [
          'serve-web',
          '--host',
          '127.0.0.1',
          '--port',
          String(VSWEB_PORT),
          '--connection-token-file',
          VSWEB_TOKEN_FILE,
          '--accept-server-license-terms',
        ],
        { stdio: 'ignore', env: drawerEnv(), detached: true },
      );

      vsweb.on('exit', c => {
        console.log(`[peixairada] code serve-web exited (${c})`);
        vsweb = null;
      });

      // a spawn that fails is an 'error' and no 'exit' — and an 'error' nobody listens for ends the server
      vsweb.on('error', e => {
        console.error(`[peixairada] code serve-web: ${e.message}`);
        vsweb = null;
        binCache.delete('code');
      });
    } catch (e) {
      vsweb = null;
      return { code: 500, error: `could not start code serve-web: ${e.message}` };
    }
  }

  const t0 = Date.now();

  while (Date.now() - t0 < 60_000) {
    // the first run downloads the server build
    await new Promise(r => setTimeout(r, 500));
    const first = await vswebAnswers(path, true);

    if (first) {
      const why = await vswebWhyNot(first);

      if (why) return { code: 409, error: why };
      return { ok: true, url: VSWEB_URL, token, started: true, status: await vswebAnswers(path) };
    }

    if (!vsweb) return { code: 500, error: 'code serve-web exited before it answered' };
  }

  return { code: 504, error: `code serve-web did not answer on ${VSWEB_PORT} within 60 s` };
}

// …and kept on the newest build in the background (2026-10-11): serve-web serves VS Code's newest release and fetches it
// only when it is first asked for it, so the first open after a release waited on the download (serve-web's 202 page).
// Every VSWEB_FRESH_MS the board asks VS Code's update service which build is the newest (VSWEB_UPDATE_URL) and, when
// serve-web's cache (the CLI's data dir) has not got it, asks serve-web for that build by name — `/<quality>-<commit>/`,
// which makes it download it now, answering 202 at once. serve-web starts that build's server once it is in, and lets
// it go after an hour with no one on it. Nothing is asked of serve-web while it has the newest, and serve-web is started
// for it only when there is something to fetch. 0 turns it off (every test server).
export const VSWEB_FRESH_MS = Number(process.env.VSWEB_FRESH_MS ?? 60 * 60_000);
const VSWEB_UPDATE_URL = process.env.VSWEB_UPDATE_URL || 'https://update.code.visualstudio.com/api/latest';

const vswebCache = commit =>
  join(process.env.VSCODE_CLI_DATA_DIR || join(homedir(), '.vscode', 'cli'), 'serve-web', commit);

/** The quality the `code` CLI is of — stable, insider — from its app's product.json, beside its bin folder. */
function vswebQuality(code) {
  try {
    return (
      JSON.parse(readFileSync(join(dirname(dirname(realpathSync(code))), 'product.json'), 'utf8')).quality || 'stable'
    );
  } catch {
    return 'stable';
  }
}

let vswebFreshing = false;
let vswebAsked = null; // the build last asked for, and when: one still downloading is not asked for again

export async function freshenVsWeb() {
  const code = codeBin();

  if (!code || vswebFreshing) return;
  vswebFreshing = true;

  try {
    const quality = vswebQuality(code);
    const arch = process.arch === 'arm64' ? 'arm64' : 'x64';

    const r = await fetch(`${VSWEB_UPDATE_URL}/server-darwin-${arch}-web/${quality}`, {
      signal: AbortSignal.timeout(15_000),
    });

    if (!r.ok) throw new Error(`the update service said ${r.status}`);
    const { version: commit, name } = await r.json();

    if (!/^[0-9a-f]{40}$/.test(commit || '')) throw new Error('the update service named no build');

    if (existsSync(vswebCache(commit)) || (vswebAsked?.commit === commit && Date.now() - vswebAsked.at < 15 * 60_000)) {
      return;
    }

    vswebAsked = { commit, at: Date.now() };
    const up = await ensureVsWeb(`${quality}-${commit}/`);

    if (!up.ok) throw new Error(up.error); // serve-web started for it if need be, and asked for that build: a 202 while it fetches it

    console.log(
      `[peixairada] VS Code Web: ${name || commit.slice(0, 8)} is out — serve-web fetching it in the background${up.started ? ', started for it' : ''}`,
    );
  } catch (e) {
    console.error(`[peixairada] VS Code Web: could not keep it on the newest build — ${e.message}`);
  } finally {
    vswebFreshing = false;
  }
}
