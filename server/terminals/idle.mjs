// Idle drawers: ended after DRAWER_IDLE_MS with no page on them.
import { statusOf } from '../sessions.mjs';
import { sessions } from '../state.mjs';
import { killTerm } from './spawn.mjs';
import { terms } from './terms.mjs';

// ---- idle drawers: ended after DRAWER_IDLE_MS with no page on them -------------------------------------------------
// Nothing ended a drawer but Done or its ×, and a week of chats had left 72 claudes idle at 13 GB, one of them with a
// page on it (2026-09-27). A drawer whose claude has been idle — the registry's word: not busy, not
// waiting — with no sub-agent or background task at work, no page attached, and no word in the chat nor the drawer's
// own start within DRAWER_IDLE_MS, is ended as Done ends it. The chat loses nothing: the transcript is on disk, the
// card goes stale, and its >_ resumes it. A chat waiting on a question is left standing, and so is every zsh. 0 disables.
const DRAWER_IDLE_MS = Number(process.env.DRAWER_IDLE_MS ?? 24 * 60 * 60_000);

export function sweepDrawers() {
  if (!(DRAWER_IDLE_MS > 0)) return;
  const now = Date.now();

  for (const term of terms.values()) {
    if (term.shell || term.exited !== null || term.clients.size) continue;
    const session = term.sessionId ? sessions.get(term.sessionId) : null;

    if (session) {
      const st = statusOf(session);

      if (
        session.agentsRunning ||
        session.tasks?.size ||
        (session.live?.status ? session.live.status !== 'idle' : st === 'working' || st === 'needs-input')
      ) {
        continue;
      }
    }

    const last = Math.max(
      Date.parse(term.startedAt) || 0,
      Date.parse(session?.lastActivity) || 0,
      Date.parse(session?.startedAt) || 0,
    );

    if (now - last < DRAWER_IDLE_MS) continue;

    console.log(
      `[peixairada] terminal ${term.id}: idle ${Math.round((now - last) / 3600_000)} h with no page on it — ending it${session ? ` (chat ${session.id})` : ''}`,
    );

    killTerm(term);
  }
}
