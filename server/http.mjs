// HTTP: the server, who may ask and with what key, and the routes (server/routes/), tried in order; a WebSocket's
// upgrade to a drawer.
import { createServer } from 'node:http';
import { readRaw } from './attach.mjs';
import { KEY_OPEN, keyWant } from './key.mjs';
import { foreign } from './origin.mjs';
import { boardRoutes, projectRoutes } from './routes/board.mjs';
import { chatActionRoutes, chatReadRoutes } from './routes/chats.mjs';
import { editorRoutes } from './routes/editors.mjs';
import { eventRoutes } from './routes/events.mjs';
import { changeRoutes } from './routes/git.mjs';
import { keyRoutes } from './routes/key.mjs';
import { machineRoutes, usageRoute } from './routes/machine.mjs';
import { pageRoute, vendorRoute } from './routes/page.mjs';
import { setupRoutes } from './routes/setup.mjs';
import { shellRoute, startRoutes, terminalRoutes } from './routes/terminals.mjs';
import { attachTermSocket } from './terminals/socket.mjs';
import { setLastTouchAt } from './update.mjs';

export function json(res, code, body) {
  res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

const BODY_MAX = 1e6;
/** The JSON object in the body, or {} — none, unparseable, not an object, or too large all read as empty. Decoded
 *  whole (2026-10-03: a chunk at a time before, so a character split across two chunks came out as two U+FFFD). */
export const jsonBody = req =>
  readRaw(req, BODY_MAX)
    .then(b => {
      const v = JSON.parse(b.toString('utf8') || '{}');
      return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
    })
    .catch(() => ({}));

// What answers a request, tried in this order — the order the routes were written in, so a path two could answer is the
// first's. A route group returns NEXT when the request is none of its own.
export const NEXT = Symbol('not this route');
const ROUTES = [
  pageRoute,
  keyRoutes,
  vendorRoute,
  chatReadRoutes,
  changeRoutes,
  shellRoute,
  boardRoutes,
  machineRoutes,
  chatActionRoutes,
  projectRoutes,
  usageRoute,
  startRoutes,
  setupRoutes,
  terminalRoutes,
  editorRoutes,
  eventRoutes,
];

// Requests wait for the boot, which starts once the port is ours (main()). Everything a route does is inside the try,
// and every answer's head is written only once its body is in hand: a throw after a writeHead used to throw again in
// the catch's own writeHead, and the rejection nobody handled ended the server (2026-10-03).
export const booted = Promise.withResolvers();
export const server = createServer(async (req, res) => {
  try {
    await booted.promise;
    const why = foreign(req);
    if (why) return json(res, 403, { error: `not the board's own page (${why})` });
    const url = new URL(req.url, 'http://localhost'); // the path and the query: the Host was foreign()'s to judge
    const p = url.pathname;
    const want = !KEY_OPEN.test(p) && keyWant(req, url);
    if (want) {
      res.setHeader('connection', 'close');
      return json(res, 401, {
        error: want === 'wrong' ? "not this board's key" : 'this board wants its key',
        key: want,
      });
    } // its body unread: the socket goes
    if (req.method !== 'GET' && p !== '/api/update' && p !== '/api/chat/watch' && !p.endsWith('/seen'))
      setLastTouchAt(Date.now()); // something done on the board (a reply shown is the page's own doing): no update until it rests
    for (const route of ROUTES) if ((await route(req, res, url, p)) !== NEXT) return;
    json(res, 404, { error: 'not found' });
  } catch (e) {
    console.error(
      `[peixairada] ${req.method} ${String(req.url).replace(/([?&](?:key|tkn|ticket)=)[^&#]*/gi, '$1…')}:`,
      e,
    ); // the key never in the log (2026-11-06)
    if (res.headersSent) res.destroy();
    else json(res, 500, { error: String(e?.stack || e) });
  }
});

// Node takes its own 'error' listener off a socket it hands to 'upgrade', and the WebSocket server adds one only in
// handleUpgrade, after the boot: a reset in between — a holder that never says hello holds the boot HELLO_MS — was an
// unheard 'error' that ended the server (2026-10-14). So one goes on first, and ends the socket alone.
server.on('upgrade', (req, socket, head) => {
  socket.on('error', () => socket.destroy());
  booted.promise
    .then(() => attachTermSocket(req, socket, head))
    .catch(e => {
      console.error('[peixairada] upgrade:', e);
      socket.destroy();
    });
});
