// A page attached to a drawer over a WebSocket: the screen, then only what followed it.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { WebSocketServer } from 'ws';
import { SESSIONS_DIR } from '../env.mjs';
import { keyWant } from '../key.mjs';
import { foreign } from '../origin.mjs';
import { holderSend, requestSnap } from './holder.mjs';
import { terms } from './terms.mjs';
import { setLastTouchAt } from '../update.mjs';

// One WebSocket per attached page. Binary frames carry output — first the screen as it stands (the holder's
// headless terminal serialized: scrollback, cells, cursor, modes), then the PTY's bytes as they come; text frames
// are JSON in both directions: {t:'in', d}, {t:'type', d, send, n}, {t:'resize', cols, rows} and {t:'clear'} up,
// {t:'clear'}, {t:'typed', n, why} and {t:'exit', code} down. Output that arrives while the snapshot is on its way waits in `ws.hold` and follows it,
// minus what the snapshot already contains (`upto`), so the page sees the screen and then, in order, only what
// came after it. A clear rides in that same queue — it is numbered like output, and wipes the page in its place.
const wss = new WebSocketServer({ noServer: true, maxPayload: 8 << 20 }); // a page sends keys, a paste at most
// What the board types for you into a claude — a banner's reply, a review, a handoff, /focus — is `type`, never `in`
// (2026-11-27, the external audit's lead 5): typed, and ⏎ after it when `send`, only while that claude asks nothing,
// its registry file read at that moment, not the last poll's. A permission dialog takes keys as its answer — ⏎ the
// highlighted Yes, a digit its option — so a stale banner's *thanks* ran the tool call it was asking about. A dialog
// up (`waiting`, `dialog open` too) refuses the words; one come up between them and the ⏎ leaves them typed, unsent.
// `typed` says which, by the page's `n`. Your own keys stay `in`.
const TYPE_GAP_MS = 60;
const ASKS = 'it is asking you something — answer it first';

// No file is a claude still starting, which asks nothing; one that does not read is one being rewritten, read again,
// and taken as asking if it still does not.
function claudeWaits(term) {
  if (term.shell) return false;
  const file = join(SESSIONS_DIR, `${term.claudePid || term.pid}.json`);

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return JSON.parse(readFileSync(file, 'utf8')).status === 'waiting';
    } catch (error) {
      if (error.code === 'ENOENT') return false;
    }
  }

  return true;
}

function typeInto(term, ws, { d: text, send, n: serial }) {
  const say = why => ws.readyState === 1 && ws.send(JSON.stringify({ t: 'typed', n: serial, why }));

  if (claudeWaits(term)) return say(ASKS);
  holderSend(term, { t: 'in', d: text });
  setLastTouchAt(Date.now());
  if (!send) return say(null);

  setTimeout(() => {
    if (term.exited !== null) return say('its claude has ended — typed, not sent');
    if (claudeWaits(term)) return say(`${ASKS} — typed, not sent`);
    holderSend(term, { t: 'in', d: '\r' });
    say(null);
  }, TYPE_GAP_MS);
}

export function attachTermSocket(req, socket, head) {
  const why = foreign(req);

  if (why) {
    socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
    socket.destroy();
    return;
  }

  const url = new URL(req.url || '/', 'http://localhost');

  if (keyWant(req, url)) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }

  const match = url.pathname.match(/^\/api\/terminals\/([\w-]+)\/ws$/);
  const term = match && terms.get(match[1]);

  if (!term) {
    socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
    socket.destroy();
    return;
  }

  wss.handleUpgrade(req, socket, head, ws => {
    ws.keyed = !!(req.headers['x-peix-key'] || url.searchParams.get('key'));
    term.clients.add(ws);
    ws.hold = [];

    requestSnap(term).then(snap => {
      if (ws.readyState !== 1) return;
      if (snap?.d) ws.send(Buffer.from(snap.d, 'utf8'));
      for (const held of ws.hold) if (!snap || held.seq > snap.upto) ws.send(held.buf);
      ws.hold = null;
      if (term.exited !== null) ws.send(JSON.stringify({ t: 'exit', code: term.exited }));

      if (snap) {
        console.log(
          `[peixairada] terminal ${term.id}: a page attached — screen snapshot ${snap.d.length} chars, ${snap.cols}×${snap.rows}`,
        );
      }
    });

    ws.on('message', data => {
      if (term.exited !== null) return;
      let msg;

      try {
        msg = JSON.parse(data.toString());
      } catch {
        return;
      }

      if (msg.t === 'in' && typeof msg.d === 'string') {
        holderSend(term, { t: 'in', d: msg.d });
        setLastTouchAt(Date.now());
      } // typing: no update until it rests
      else if (msg.t === 'type' && typeof msg.d === 'string') typeInto(term, ws, msg);
      else if (msg.t === 'resize' && msg.cols > 0 && msg.rows > 0) {
        const cols = Math.min(500, msg.cols | 0);
        const rows = Math.min(200, msg.rows | 0);

        term.cols = cols;
        term.rows = rows;
        holderSend(term, { t: 'resize', cols, rows });
      } else if (msg.t === 'clear') holderSend(term, { t: 'clear' });
    });

    ws.on('close', () => term.clients.delete(ws));
    // a bad frame (unmasked, not UTF-8, over maxPayload) is an 'error' on the socket — and an 'error' nobody listens
    // for ends the server, every drawer's page and the board's stream with it (2026-10-03)
    ws.on('error', error => console.error(`[peixairada] terminal ${term.id}: a page's socket: ${error.message}`));
  });
}
