// Alerts: a system notification, and the alert said to every page — quiet when muted or switched off.
import { execFile } from 'node:child_process';
import { NOTIFY } from './env.mjs';
import { driftOf } from './drift.mjs';
import { statusOf, summary } from './sessions.mjs';
import { broadcast } from './sse.mjs';
import { indexing, isRemoved, mutedChats, notificationsOn, snoozed } from './state.mjs';

export function nativeNotify(title, subtitle, body) {
  if (NOTIFY !== 'native' || process.platform !== 'darwin') return;

  execFile(
    'osascript',
    [
      '-e',
      'on run argv',
      '-e',
      'display notification (item 3 of argv) with title (item 1 of argv) subtitle (item 2 of argv) sound name "Glass"',
      '-e',
      'end run',
      '--',
      title,
      subtitle,
      body, // never an option (2026-11-06): a heading that began with -e would be a line of script
    ],
    () => {},
  );
}

/** What an alert of this chat says of itself (2026-11-02): off for every chat (the cog), or this chat muted — or snoozed
 *  (2026-11-24, round XXX): what does not wake it calls you on nothing. */
export const hushOf = session => ({
  quiet: !notificationsOn || !!mutedChats[session.id] || !!snoozed[session.id],
  muted: !!mutedChats[session.id],
  ...(snoozed[session.id] && { snoozed: true }),
});

export function queueNotify(session, kind) {
  if (indexing || session.silent || isRemoved(session)) return; // the boot's scan, or a chat being re-read (indexFile): nothing in it is news; one deleted from the board calls nobody
  if (session.forkAt && String(session.lastActivity || '') < session.forkAt) return; // a branch's copied past, however its lines come in (2026-10-31)
  (session.pendingNotify ||= new Set()).add(kind); // one of each kind (2026-10-14): a branch's move and a reply in one window were one alert, the other lost — and a move is said once
  clearTimeout(session.notifyTimer);
  // Debounce: the thinking block and the text block of one reply land as separate lines.
  session.notifyTimer = setTimeout(() => fireNotify(session), 400);
}

function fireNotify(session) {
  const kinds = session.pendingNotify;

  session.pendingNotify = null;
  for (const kind of kinds || []) alertOf(session, kind);
}

function alertOf(session, kind) {
  if (kind === 'needs-input' && statusOf(session) !== 'needs-input') return; // answered within the debounce: nothing to say
  if (kind === 'drift') return driftNotify(session);
  if (kind === 'agent-failed') return agentFailNotify(session);
  const sum = summary(session);

  const asked =
    sum.ask?.text || (sum.ask?.waitingFor ? `Waiting on you: ${sum.ask.waitingFor}` : 'Waiting for your input');

  const evt = {
    kind,
    sessionId: session.id,
    project: sum.project,
    title: sum.title,
    name: session.live?.name || null,
    cwd: session.cwd,
    snippet: kind === 'reply' ? sum.lastReply : asked,
    ts: new Date().toISOString(),
    ...hushOf(session),
  };

  broadcast('alert', evt);

  if (!evt.quiet) {
    nativeNotify(
      kind === 'reply' ? `Claude replied · ${sum.project}` : `Claude is asking you · ${sum.project}`,
      sum.title,
      evt.snippet || '',
    );
  }
}

/** The branch moved under a chat at work (2026-10-13): said with a heading of its own, as a PR's turn is. */
function driftNotify(session) {
  const drift = driftOf(session);

  if (!drift) return; // gone, or said you know, within the debounce

  const sum = summary(session);
  const heading = `Branch moved · ${sum.project}`;
  const peerCount = (session.peers || []).length;

  const snippet = `${drift.to} now · was ${drift.from}${peerCount ? ` — ${peerCount} other chat${peerCount === 1 ? ' runs' : 's run'} in this checkout` : ''}`;

  const evt = {
    kind: 'drift',
    sessionId: session.id,
    project: sum.project,
    title: sum.title,
    heading,
    name: session.live?.name || null,
    cwd: session.cwd,
    snippet,
    ts: new Date().toISOString(),
    ...hushOf(session),
  };

  broadcast('alert', evt);
  if (!evt.quiet) nativeNotify(heading, sum.title, snippet);
}

/** An agent of a chat's failed (2026-11-02): said with a heading of its own, as a moved branch is. */
function agentFailNotify(session) {
  const failure = session.agentFail;

  if (!failure) return;
  session.agentFail = null;

  const sum = summary(session);
  const heading = `An agent failed · ${sum.project}`;
  const text = failure.why ? `${failure.what}: ${failure.why}` : failure.what;

  const evt = {
    kind: 'agent-failed',
    sessionId: session.id,
    project: sum.project,
    title: sum.title,
    heading,
    name: session.live?.name || null,
    cwd: session.cwd,
    snippet: text,
    ts: new Date().toISOString(),
    ...hushOf(session),
  };

  broadcast('alert', evt);
  if (!evt.quiet) nativeNotify(heading, sum.title, text);
}
