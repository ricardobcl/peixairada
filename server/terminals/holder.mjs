// The holder protocol: newline-delimited JSON over a holder's socket (see lib/termhold.mjs).
import { connect as netConnect } from 'node:net';
import { join } from 'node:path';
import { broadcast, schedulePush } from '../sse.mjs';
import { sessions } from '../state.mjs';
import { TERM_LINGER_MS, terms, TERMS_DIR, termSummary } from './terms.mjs';

// ---- the holder protocol: newline-delimited JSON over the holder's socket (see lib/termhold.mjs) ----
export const holderSend = (t, m) => { if (t.sock && !t.sock.destroyed) { t.sock.write(JSON.stringify(m) + '\n'); return true; } return false; };
/** The screen as it stands, with `upto`: the seq of the last output message it already contains. Null when the holder is gone. */
export const requestSnap = t => new Promise(res => { if (!holderSend(t, { t: 'snap' })) return res(null); t.snapQ.push(res); });
const HELLO_MS = 5000;
/** The holder's socket, once it has said hello — which a stopped or wedged holder never does, though the kernel still
 *  accepts the connection: no hello in HELLO_MS is a failure (2026-10-03: one such holder held the boot, and the port
 *  with it, for good). Until the hello the socket is not the drawer's, and its close is no exit. */
export function connectHolder(t) {
  return new Promise((resolve, reject) => {
    const sock = netConnect(join(TERMS_DIR, `${t.id}.sock`));
    sock.setEncoding('utf8');   // a glyph split across two chunks decodes whole; `buf += chunk` on a Buffer decoded each alone
    let buf = '', helloed = false;
    sock.setTimeout(HELLO_MS, () => sock.destroy(new Error(`no hello in ${HELLO_MS / 1000} s`)));
    sock.on('data', chunk => {
      buf += chunk;
      let i; while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 1);
        let m; try { m = JSON.parse(line); } catch { continue; }
        if (!helloed && m.t === 'hello') { helloed = true; sock.setTimeout(0); t.sock = sock; Object.assign(t, { pid: m.pid, holderPid: m.holderPid, exited: m.exited, cols: m.cols, rows: m.rows, cwd: m.cwd, resume: !!m.resume, startedAt: m.startedAt, sessionId: t.sessionId ?? m.sessionId ?? null }); resolve(m); }
        else if (helloed) onHolderMsg(t, m);
      }
    });
    sock.on('error', e => { if (!helloed) reject(e); });
    sock.on('close', () => { if (t.sock === sock) { t.sock = null; onHolderGone(t); } if (!helloed) reject(new Error('the holder closed before saying hello')); });
  });
}
function onHolderMsg(t, m) {
  if (m.t === 'out') {
    const buf = Buffer.from(m.d, 'utf8');
    // A page still waiting for its snapshot gets what arrives meanwhile afterwards, in order and only what the
    // snapshot does not already contain (see attachTermSocket).
    for (const ws of t.clients) { if (ws.readyState !== 1) continue; if (ws.hold) ws.hold.push({ seq: m.seq, buf }); else ws.send(buf); }
  } else if (m.t === 'clear') {
    // The holder cleared its screen: every page on this drawer drops its own, in the same place in the stream.
    const msg = JSON.stringify({ t: 'clear' });
    for (const ws of t.clients) { if (ws.readyState !== 1) continue; if (ws.hold) ws.hold.push({ seq: m.seq, buf: msg }); else ws.send(msg); }
  } else if (m.t === 'snap') { const w = t.snapQ.shift(); t.lastSnap = m.d.length; if (w) w(m); }
  else if (m.t === 'exit') termExited(t, m.code);
}
function termExited(t, code) {
  if (t.exited !== null) return;
  t.exited = code ?? 0;
  const msg = JSON.stringify({ t: 'exit', code: t.exited });
  for (const ws of t.clients) if (ws.readyState === 1) ws.send(msg);
  broadcast('terminal', termSummary(t));
  const s = t.sessionId && sessions.get(t.sessionId); if (s) schedulePush(s);
  setTimeout(() => { if (terms.get(t.id) === t) { terms.delete(t.id); t.sock?.destroy(); } }, TERM_LINGER_MS).unref();
}
/** The socket closed: the holder ended (after its linger, or killed). A live PTY dies with its holder — its master closed — so 129. */
function onHolderGone(t) {
  for (const w of t.snapQ.splice(0)) w(null);
  if (t.exited === null) termExited(t, 129); else terms.delete(t.id);
}
