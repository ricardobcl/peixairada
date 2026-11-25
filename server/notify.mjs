// Alerts: a system notification, and the alert said to every page — quiet when muted or switched off.
import { execFile } from 'node:child_process';
import { NOTIFY } from './env.mjs';
import { driftOf } from './drift.mjs';
import { statusOf, summary } from './sessions.mjs';
import { broadcast } from './sse.mjs';
import { indexing, isRemoved, mutedChats, notificationsOn, snoozed } from './state.mjs';

export function nativeNotify(title, subtitle, body) {
  if (NOTIFY !== 'native' || process.platform !== 'darwin') return;
  execFile('osascript', [
    '-e', 'on run argv',
    '-e', 'display notification (item 3 of argv) with title (item 1 of argv) subtitle (item 2 of argv) sound name "Glass"',
    '-e', 'end run',
    '--', title, subtitle, body   // never an option (2026-11-06): a heading that began with -e would be a line of script
  ], () => {});
}

/** What an alert of this chat says of itself (2026-11-02): off for every chat (the cog), or this chat muted — or snoozed
 *  (2026-11-24, round XXX): what does not wake it calls you on nothing. */
export const hushOf = s => ({ quiet: !notificationsOn || !!mutedChats[s.id] || !!snoozed[s.id], muted: !!mutedChats[s.id], ...snoozed[s.id] && { snoozed: true } });

export function queueNotify(s, kind) {
  if (indexing || s.silent || isRemoved(s)) return;   // the boot's scan, or a chat being re-read (indexFile): nothing in it is news; one deleted from the board calls nobody
  if (s.forkAt && String(s.lastActivity || '') < s.forkAt) return;   // a branch's copied past, however its lines come in (2026-10-31)
  (s.pendingNotify ||= new Set()).add(kind);   // one of each kind (2026-10-14): a branch's move and a reply in one window were one alert, the other lost — and a move is said once
  clearTimeout(s.notifyTimer);
  // Debounce: the thinking block and the text block of one reply land as separate lines.
  s.notifyTimer = setTimeout(() => fireNotify(s), 400);
}

function fireNotify(s) {
  const kinds = s.pendingNotify; s.pendingNotify = null;
  for (const kind of kinds || []) alertOf(s, kind);
}
function alertOf(s, kind) {
  if (kind === 'needs-input' && statusOf(s) !== 'needs-input') return;   // answered within the debounce: nothing to say
  if (kind === 'drift') return driftNotify(s);
  if (kind === 'agent-failed') return agentFailNotify(s);
  const sum = summary(s);
  const asked = sum.ask?.text || (sum.ask?.waitingFor ? `Waiting on you: ${sum.ask.waitingFor}` : 'Waiting for your input');
  const evt = { kind, sessionId: s.id, project: sum.project, title: sum.title, name: s.live?.name || null, cwd: s.cwd, snippet: kind === 'reply' ? sum.lastReply : asked, ts: new Date().toISOString(), ...hushOf(s) };
  broadcast('alert', evt);
  if (!evt.quiet) nativeNotify(kind === 'reply' ? `Claude replied · ${sum.project}` : `Claude is asking you · ${sum.project}`, sum.title, evt.snippet || '');
}

/** The branch moved under a chat at work (2026-10-13): said with a heading of its own, as a PR's turn is. */
function driftNotify(s) {
  const d = driftOf(s); if (!d) return;   // gone, or said you know, within the debounce
  const sum = summary(s), heading = `Branch moved · ${sum.project}`, n = (s.peers || []).length;
  const snippet = `${d.to} now · was ${d.from}${n ? ` — ${n} other chat${n === 1 ? ' runs' : 's run'} in this checkout` : ''}`;
  const evt = { kind: 'drift', sessionId: s.id, project: sum.project, title: sum.title, heading, name: s.live?.name || null, cwd: s.cwd, snippet, ts: new Date().toISOString(), ...hushOf(s) };
  broadcast('alert', evt);
  if (!evt.quiet) nativeNotify(heading, sum.title, snippet);
}

/** An agent of a chat's failed (2026-11-02): said with a heading of its own, as a moved branch is. */
function agentFailNotify(s) {
  const f = s.agentFail; if (!f) return; s.agentFail = null;
  const sum = summary(s), heading = `An agent failed · ${sum.project}`, text = f.why ? `${f.what}: ${f.why}` : f.what;
  const evt = { kind: 'agent-failed', sessionId: s.id, project: sum.project, title: sum.title, heading, name: s.live?.name || null, cwd: s.cwd, snippet: text, ts: new Date().toISOString(), ...hushOf(s) };
  broadcast('alert', evt);
  if (!evt.quiet) nativeNotify(heading, sum.title, text);
}
