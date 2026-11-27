// The pages' stream: a chat's change pushed once it settles, every event to every page.
import { resolvePeers } from './peers.mjs';
import { summary } from './sessions.mjs';
import { backNotify, wakeCheck } from './snooze.mjs';

export const sseClients = new Set();

export function schedulePush(session) {
  clearTimeout(session.pushTimer);

  session.pushTimer = setTimeout(() => {
    wakeCheck(session); // a snooze its own news ended (2026-11-24, round XXX): the summary says so, and the alert follows it
    broadcast('session', summary(session));

    // `upto`: the entries folded so far — these are the last of them, so the page can tell what it already has
    if (session.newEntries.length) {
      resolvePeers(session, session.newEntries);

      broadcast('entries', {
        sessionId: session.id,
        gen: session.gen,
        upto: session.entryCount,
        entries: session.newEntries,
      });

      session.newEntries = [];
    }

    if (session.backOwed) {
      const why = session.backOwed;

      session.backOwed = null;
      backNotify(session, why);
    }
  }, 80);
}

export function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

  for (const res of sseClients) res.write(payload);
}
