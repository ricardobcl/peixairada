// The holder protocol: newline-delimited JSON over a holder's socket (see lib/termhold.mjs).
import { connect as netConnect } from 'node:net';
import { join } from 'node:path';
import { broadcast, schedulePush } from '../sse.mjs';
import { sessions } from '../state.mjs';
import { TERM_LINGER_MS, terms, TERMS_DIR, termSummary } from './terms.mjs';

// ---- the holder protocol: newline-delimited JSON over the holder's socket (see lib/termhold.mjs) ----
export const holderSend = (term, message) => {
  if (term.sock && !term.sock.destroyed) {
    term.sock.write(`${JSON.stringify(message)}\n`);
    return true;
  }

  return false;
};

/** The screen as it stands, with `upto`: the seq of the last output message it already contains. Null when the holder is gone. */
export const requestSnap = term =>
  new Promise(res => {
    if (!holderSend(term, { t: 'snap' })) return res(null);
    term.snapQ.push(res);
  });
const HELLO_MS = 5000;

/** The holder's socket, once it has said hello — which a stopped or wedged holder never does, though the kernel still
 *  accepts the connection: no hello in HELLO_MS is a failure (2026-10-03: one such holder held the boot, and the port
 *  with it, for good). Until the hello the socket is not the drawer's, and its close is no exit. */
export function connectHolder(term) {
  return new Promise((resolve, reject) => {
    const sock = netConnect(join(TERMS_DIR, `${term.id}.sock`));

    sock.setEncoding('utf8'); // a glyph split across two chunks decodes whole; `buf += chunk` on a Buffer decoded each alone

    let buf = '';
    let helloed = false;

    sock.setTimeout(HELLO_MS, () => sock.destroy(new Error(`no hello in ${HELLO_MS / 1000} s`)));

    sock.on('data', chunk => {
      buf += chunk;
      let index;

      while ((index = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, index);

        buf = buf.slice(index + 1);
        let message;

        try {
          message = JSON.parse(line);
        } catch {
          continue;
        }

        if (!helloed && message.t === 'hello') {
          helloed = true;
          sock.setTimeout(0);
          term.sock = sock;

          Object.assign(term, {
            pid: message.pid,
            holderPid: message.holderPid,
            exited: message.exited,
            cols: message.cols,
            rows: message.rows,
            cwd: message.cwd,
            resume: !!message.resume,
            startedAt: message.startedAt,
            sessionId: term.sessionId ?? message.sessionId ?? null,
          });

          resolve(message);
        } else if (helloed) onHolderMsg(term, message);
      }
    });

    sock.on('error', error => {
      if (!helloed) reject(error);
    });

    sock.on('close', () => {
      if (term.sock === sock) {
        term.sock = null;
        onHolderGone(term);
      }

      if (!helloed) reject(new Error('the holder closed before saying hello'));
    });
  });
}

function onHolderMsg(term, message) {
  if (message.t === 'out') {
    const buf = Buffer.from(message.d, 'utf8');

    // A page still waiting for its snapshot gets what arrives meanwhile afterwards, in order and only what the
    // snapshot does not already contain (see attachTermSocket).
    for (const ws of term.clients) {
      if (ws.readyState !== 1) continue;
      if (ws.hold) ws.hold.push({ seq: message.seq, buf });
      else ws.send(buf);
    }
  } else if (message.t === 'clear') {
    // The holder cleared its screen: every page on this drawer drops its own, in the same place in the stream.
    const msg = JSON.stringify({ t: 'clear' });

    for (const ws of term.clients) {
      if (ws.readyState !== 1) continue;
      if (ws.hold) ws.hold.push({ seq: message.seq, buf: msg });
      else ws.send(msg);
    }
  } else if (message.t === 'snap') {
    const waiter = term.snapQ.shift();

    term.lastSnap = message.d.length;
    if (waiter) waiter(message);
  } else if (message.t === 'exit') termExited(term, message.code);
}

function termExited(term, code) {
  if (term.exited !== null) return;
  term.exited = code ?? 0;
  const msg = JSON.stringify({ t: 'exit', code: term.exited });

  for (const ws of term.clients) if (ws.readyState === 1) ws.send(msg);
  broadcast('terminal', termSummary(term));
  const session = term.sessionId && sessions.get(term.sessionId);

  if (session) schedulePush(session);

  setTimeout(() => {
    if (terms.get(term.id) === term) {
      terms.delete(term.id);
      term.sock?.destroy();
    }
  }, TERM_LINGER_MS).unref();
}

/** The socket closed: the holder ended (after its linger, or killed). A live PTY dies with its holder — its master closed — so 129. */
function onHolderGone(term) {
  for (const waiter of term.snapQ.splice(0)) waiter(null);
  if (term.exited === null) termExited(term, 129);
  else terms.delete(term.id);
}
