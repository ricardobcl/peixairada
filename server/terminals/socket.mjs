// A page attached to a drawer over a WebSocket: the screen, then only what followed it.
import { WebSocketServer } from 'ws';
import { keyWant } from '../key.mjs';
import { foreign } from '../origin.mjs';
import { holderSend, requestSnap } from './holder.mjs';
import { terms } from './terms.mjs';
import { setLastTouchAt } from '../update.mjs';

// One WebSocket per attached page. Binary frames carry output — first the screen as it stands (the holder's
// headless terminal serialized: scrollback, cells, cursor, modes), then the PTY's bytes as they come; text frames
// are JSON in both directions: {t:'in', d}, {t:'resize', cols, rows} and {t:'clear'} up, {t:'clear'} and
// {t:'exit', code} down. Output that arrives while the snapshot is on its way waits in `ws.hold` and follows it,
// minus what the snapshot already contains (`upto`), so the page sees the screen and then, in order, only what
// came after it. A clear rides in that same queue — it is numbered like output, and wipes the page in its place.
const wss = new WebSocketServer({ noServer: true, maxPayload: 8 << 20 });   // a page sends keys, a paste at most
export function attachTermSocket(req, socket, head) {
  const why = foreign(req);
  if (why) { socket.write('HTTP/1.1 403 Forbidden\r\n\r\n'); socket.destroy(); return; }
  const url = new URL(req.url || '/', 'http://localhost');
  if (keyWant(req, url)) { socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n'); socket.destroy(); return; }
  const m = url.pathname.match(/^\/api\/terminals\/([\w-]+)\/ws$/);
  const t = m && terms.get(m[1]);
  if (!t) { socket.write('HTTP/1.1 404 Not Found\r\n\r\n'); socket.destroy(); return; }
  wss.handleUpgrade(req, socket, head, ws => {
    ws.keyed = !!(req.headers['x-peix-key'] || url.searchParams.get('key'));
    t.clients.add(ws);
    ws.hold = [];
    requestSnap(t).then(snap => {
      if (ws.readyState !== 1) return;
      if (snap?.d) ws.send(Buffer.from(snap.d, 'utf8'));
      for (const h of ws.hold) if (!snap || h.seq > snap.upto) ws.send(h.buf);
      ws.hold = null;
      if (t.exited !== null) ws.send(JSON.stringify({ t: 'exit', code: t.exited }));
      if (snap) console.log(`[peixairada] terminal ${t.id}: a page attached — screen snapshot ${snap.d.length} chars, ${snap.cols}×${snap.rows}`);
    });
    ws.on('message', data => {
      if (t.exited !== null) return;
      let msg; try { msg = JSON.parse(data.toString()); } catch { return; }
      if (msg.t === 'in' && typeof msg.d === 'string') { holderSend(t, { t: 'in', d: msg.d }); setLastTouchAt(Date.now()); }   // typing: no update until it rests
      else if (msg.t === 'resize' && msg.cols > 0 && msg.rows > 0) {
        const cols = Math.min(500, msg.cols | 0), rows = Math.min(200, msg.rows | 0);
        t.cols = cols; t.rows = rows; holderSend(t, { t: 'resize', cols, rows });
      }
      else if (msg.t === 'clear') holderSend(t, { t: 'clear' });
    });
    ws.on('close', () => t.clients.delete(ws));
    // a bad frame (unmasked, not UTF-8, over maxPayload) is an 'error' on the socket — and an 'error' nobody listens
    // for ends the server, every drawer's page and the board's stream with it (2026-10-03)
    ws.on('error', e => console.error(`[peixairada] terminal ${t.id}: a page's socket: ${e.message}`));
  });
}
