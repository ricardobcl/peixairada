// The board's key (2026-10-16): every route but the page wants it — a file, a ticket for a browser, a proof for the
// app.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { chmodSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { HOST, PORT, STATE_FILE } from './env.mjs';
import { broadcast, sseClients } from './sse.mjs';
import { keyEnforced, saveState, setKeyEnforced } from './state.mjs';
import { terms } from './terminals/terms.mjs';

// ---- the board's key (2026-10-16) -------------------------------------------------------------------------------------
// foreign() tells the board's own page from another site's, not from a client that writes its own headers: a container
// (Docker's host.docker.internal is this Mac's loopback), another account on the Mac, the LAN past HOST — each could read
// every transcript and type into a drawer as the user. So every route but the page itself wants the board's key: 32
// random bytes in the state folder, this user's alone (`key`, 0600), sent as `x-peix-key` (the page's api()) or `?key=`
// where no header can go (the stream, a drawer's socket), compared in constant time. Not a cookie: a cookie is per host,
// not per port, and every server on 127.0.0.1 the browser visits would be handed it. The app gives its page the key (a
// script of its own, before the page's); a browser gets it by a ticket (`#ticket=`, one use, a minute — POST
// /api/key/claim), opened in the default browser by the server itself (POST /api/key/open, open to all: the key goes to
// this Mac's screen, never to whoever asked; `scripts/launchd.sh open`). Open without it: the page, its vendored files,
// /api/alive and those two. A wrong key is refused always; **none is refused once the key is required** — at once with
// KEY_MODE `enforce` (every test server) or a HOST past loopback, else from the first keyed ask of the app's own page
// (`x-peix-app`), a boot with no app installed, or Settings' switch, kept in the state file (`keyEnforced`). So a board
// updated to this still answered its old app, which sends no key, until the rebuilt one opened with it. Since 2026-11-06
// that grace is KEY_MODE `lax`'s alone: by default the key is required from the first boot — a new install's agent
// answered every account and container on the Mac until its app first opened, and an app from before 2026-10-16 is
// behind its checkout's mac/ anyway, rebuilt by the update.
export const KEY_FILE = join(dirname(STATE_FILE), 'key');
const KEY_MODE = process.env.KEY_MODE || '';
const LOOPBACK_BIND = ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(HOST);
export const KEY_OPEN = /^\/(index\.html|vendor\/[\w.-]+|api\/alive|api\/key\/(claim|open))?$/;
export let boardKey = '', keylessSaid = false, keyOpenAt = 0;
export function setBoardKey(v) { boardKey = v; }   // for the modules that write it: an import is read-only
export function setKeyOpenAt(v) { keyOpenAt = v; }
export const tickets = new Map();   // ticket → when it expires
/** `dir`, made if need be and kept this user's alone (2026-11-06): the state folder holds the key, the tokens, every
 *  drawer's socket and screen, the lunch's logged-in Chrome — made 0755 before, readable by every account on the Mac
 *  but for ~/Library's own mode, and a TERMS_DIR set to a shorter folder outside it (/tmp) by whoever made it first.
 *  One that is not a folder of this user's is refused (a throw), never used. */
export function privateDir(dir) {
  try { mkdirSync(dir, { recursive: true, mode: 0o700 }); } catch (e) { if (e.code !== 'EEXIST') throw e; }
  const st = statSync(dir);
  if (!st.isDirectory() || st.uid !== process.getuid()) throw new Error(`${dir} is not a folder of this user's — not used`);
  if (st.mode & 0o077) chmodSync(dir, 0o700);
  return dir;
}
/** A key of 64 hex digits kept in `file`: the file's, else a new one written there, this user's alone. */
export function keyFile(file) {
  try {
    const t = readFileSync(file, 'utf8').trim();
    if (/^[0-9a-f]{64}$/.test(t)) { if (statSync(file).mode & 0o077) chmodSync(file, 0o600); return t; }
  } catch {}
  return writeKey(file);
}
export function writeKey(file) {
  const t = randomBytes(32).toString('hex'), tmp = `${file}.${process.pid}`;
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(tmp, t, { mode: 0o600 }); renameSync(tmp, file);
  return t;
}
export const keyRequired = () => KEY_MODE !== 'lax' || !LOOPBACK_BIND || keyEnforced;
export const keyState = () => ({ required: keyRequired(), mode: KEY_MODE || null, file: KEY_FILE });
export function requireKey(why) {
  if (keyEnforced) return;
  setKeyEnforced(true); saveState(); broadcast('key', keyState());
  // what came in without it while it was not required goes now: a stream, a drawer's socket
  for (const c of sseClients) if (!c.keyed) c.end();
  for (const t of terms.values()) for (const ws of t.clients) if (!ws.keyed) ws.close(4401, 'the board wants its key');
  console.log(`[peixairada] the board's key is required from now on — ${why}`);
}
const keyMatches = k => { const a = Buffer.from(String(k)), b = Buffer.from(boardKey); return !!boardKey && a.length === b.length && timingSafeEqual(a, b); };
/** Why `req` is not answered for want of the key — `missing` or `wrong` —, else null. */
export function keyWant(req, url) {
  const k = req.headers['x-peix-key'] || url.searchParams.get('key');
  if (k) {
    if (!keyMatches(k)) return 'wrong';
    if (req.headers['x-peix-app'] === '1') requireKey('the app\'s page came with it');
    return null;
  }
  if (keyRequired()) return 'missing';
  if (!keylessSaid) { keylessSaid = true; console.log(`[peixairada] answered ${req.method} ${url.pathname} with no key — not required until the app's page brings it, or Settings › Board says so`); }
  return null;
}
export function newTicket() {
  const now = Date.now(); for (const [t, at] of tickets) if (at < now) tickets.delete(t);
  const t = randomBytes(18).toString('base64url'); tickets.set(t, now + 60_000); return t;
}
// The app proves the server before it trusts it (2026-11-06): it adopted whatever answered on the port, sent it the key
// on every probe and gave its page the key and the bridge — so another account, or a container publishing the port,
// that held 7331 while this server was down (a login, a restart, a crash) had the key. Now the app's probe sends a nonce
// and no key, and this answers with an HMAC of it under the key, which only a server that can read the key file can
// write; the app checks it before anything else (`ServerController.probe` in main.swift). Open as /api/alive is: an
// HMAC tells nothing of its key.
const ALIVE_NONCE = /^[0-9a-f]{32,128}$/;
export const aliveProof = req => {
  const n = String(req.headers['x-peix-nonce'] || '');
  return boardKey && ALIVE_NONCE.test(n) ? { 'x-peix-proof': createHmac('sha256', boardKey).update(`peix-alive:${n}`).digest('hex') } : {};
};
/** The address this Mac's browser reaches the board at. */
export const boardUrl = () => `http://${LOOPBACK_BIND || HOST === '0.0.0.0' || HOST === '::' ? '127.0.0.1' : HOST.includes(':') && !HOST.startsWith('[') ? `[${HOST}]` : HOST}:${PORT}/`;
