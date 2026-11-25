// The pages' stream: a chat's change pushed once it settles, every event to every page.
import { resolvePeers } from './peers.mjs';
import { summary } from './sessions.mjs';
import { backNotify, wakeCheck } from './snooze.mjs';

export const sseClients = new Set();

export function schedulePush(s) {
  clearTimeout(s.pushTimer);
  s.pushTimer = setTimeout(() => {
    wakeCheck(s);   // a snooze its own news ended (2026-11-24, round XXX): the summary says so, and the alert follows it
    broadcast('session', summary(s));
    // `upto`: the entries folded so far — these are the last of them, so the page can tell what it already has
    if (s.newEntries.length) { resolvePeers(s, s.newEntries); broadcast('entries', { sessionId: s.id, gen: s.gen, upto: s.entryCount, entries: s.newEntries }); s.newEntries = []; }
    if (s.backOwed) { const why = s.backOwed; s.backOwed = null; backNotify(s, why); }
  }, 80);
}

export function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of sseClients) res.write(payload);
}
