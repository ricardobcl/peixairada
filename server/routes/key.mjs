// Routes: the app's probe and the board's key.
import { execFile } from 'node:child_process';
import { findBin } from '../bins.mjs';
import { json, jsonBody, NEXT } from '../http.mjs';
import {
  aliveProof,
  boardKey,
  boardUrl,
  KEY_FILE,
  keyOpenAt,
  keyState,
  newTicket,
  requireKey,
  setBoardKey,
  setKeyOpenAt,
  tickets,
  writeKey,
} from '../key.mjs';
import { sseClients } from '../sse.mjs';
import { terms } from '../terminals/terms.mjs';

/** The app's probe, and the board's key: a ticket claimed, a tab opened with one, the key required, a new one. */
export async function keyRoutes(req, res, url, p) {
  if (req.method === 'GET' && p === '/api/alive') {
    res.writeHead(204, aliveProof(req));
    return res.end();
  } // up and booted: the app's probe, launchd.sh

  if (req.method === 'POST' && p === '/api/key/claim') {
    // a ticket for the key (see keyWant), once
    const { ticket } = await jsonBody(req);
    const at = typeof ticket === 'string' ? tickets.get(ticket) : null;

    tickets.delete(ticket);

    if (!at || at < Date.now()) {
      return json(res, 403, { error: 'that ticket was used or is old — open the board with its key again' });
    }

    return json(res, 200, { key: boardKey });
  }

  if (req.method === 'POST' && p === '/api/key/open') {
    // a tab with a ticket, in this Mac's default browser: the key goes to its screen
    if (Date.now() - keyOpenAt < 10_000) return json(res, 429, { error: 'a tab with the key was opened a moment ago' });
    // the ticket on osascript's stdin, never an argument (2026-11-06): `ps` is setuid root on macOS and shows every
    // account's arguments, so `open <url>#ticket=…` let another account read the ticket and claim the key first
    const bin = findBin('osascript', 'a tab with the key cannot be opened');

    if (!bin) return json(res, 501, { error: 'no osascript on this Mac' });
    setKeyOpenAt(Date.now());

    const child = execFile(bin, ['-'], e => {
      if (e) console.error(`[peixairada] open a tab with the key: ${e.message}`);
    });

    child.stdin.on('error', () => {});
    child.stdin.end(`open location ${JSON.stringify(`${boardUrl()}#ticket=${newTicket()}`)}\n`);
    return json(res, 202, { opening: true });
  }

  if (req.method === 'GET' && p === '/api/key') return json(res, 200, keyState());

  if (req.method === 'PUT' && p === '/api/key') {
    requireKey('asked on the board');
    return json(res, 200, keyState());
  }

  if (req.method === 'POST' && p === '/api/key/new') {
    // a new key: every other page and drawer socket asks for it again
    setBoardKey(writeKey(KEY_FILE));
    tickets.clear();
    for (const c of sseClients) c.end();
    for (const t of terms.values()) for (const ws of t.clients) ws.close(4401, 'a new key');
    console.log('[peixairada] a new key — every page asks for it again');
    return json(res, 200, { key: boardKey });
  }

  return NEXT;
}
