// Chats tied by your hand (2026-10-31): merged, folded, branched, gone on — and the words a handoff carries.
import { newSession, summary } from './sessions.mjs';
import { tildePath } from './setup.mjs';
import { schedulePush } from './sse.mjs';
import { chatLinks, doneMarks, indexing, isDone, saveState, sessions, setChatLinks, titles } from './state.mjs';
import { termOf } from './terminals/terms.mjs';

// ---- chats tied by your hand: merged, folded, branched (2026-10-31) -------------------------------------------------
export const LINK_KINDS = new Set(['merge', 'fold', 'branch', 'continued']), LINKS_MAX = 2000;
export let linkIdx = null;   // chat id → its links as the summary says them, rebuilt after a change
export function setLinkIdx(v) { linkIdx = v; }   // for the modules that write it: an import is read-only
/** `from` tied to `to`: kept, said to both chats' pages. The ones neither of whose chats the board knows go. */
export function addLink(k, from, to) {
  if (!LINK_KINDS.has(k) || !from || !to || from === to) return;
  setChatLinks(chatLinks.filter(l => !(l.k === k && l.from === from && l.to === to)));
  chatLinks.push({ k, from, to, at: new Date().toISOString() });
  if (!indexing) setChatLinks(chatLinks.filter(l => sessions.has(l.from) || sessions.has(l.to)));
  if (chatLinks.length > LINKS_MAX) setChatLinks(chatLinks.slice(-LINKS_MAX));
  linkIdx = null; saveState();
  for (const id of [from, to]) { const s = sessions.get(id); if (s) schedulePush(s); }
}
/** Whether two chats are tied already, whichever way and by what. */
const tied = (a, b) => chatLinks.some(l => (l.from === a && l.to === b) || (l.from === b && l.to === a));
/** A copy Claude Code made is told by its first line (2026-11-04): `/branch`, `/fork`, `--fork-session` and a word in what `/bg`
 *  left all keep the chat's uuids under a new id, and name no origin in a shape they share. The oldest file is the chat, each
 *  other its branch, tied once; its copied past is no news (forkAt, as the board's own branch). */
const firstLines = new Map();   // uuid of a chat's first user line -> the ids of the chats that begin with it
export function noteFirstLine(s, line) {
  if (s.firstUuid || line.type !== 'user' || line.isSidechain || !line.uuid) return;
  s.firstUuid = line.uuid;
  let ids = firstLines.get(line.uuid); if (!ids) firstLines.set(line.uuid, ids = new Set());
  ids.add(s.id);
  if (ids.size < 2) return;
  const others = [...ids].filter(id => id !== s.id).map(id => sessions.get(id)).filter(Boolean);
  if (others.some(o => (o.bornAt ?? Infinity) < (s.bornAt ?? Infinity))) s.forkAt ||= new Date().toISOString();
  setImmediate(tieCopies, line.uuid);   // the read under way holds this chat's object back from `sessions` (indexFile)
}
function tieCopies(uuid) {
  const chats = [...firstLines.get(uuid) || []].map(id => sessions.get(id)).filter(Boolean).sort((a, b) => (a.bornAt ?? Infinity) - (b.bornAt ?? Infinity));
  for (const c of chats.slice(1)) if (!tied(chats[0].id, c.id)) addLink('branch', chats[0].id, c.id);
}
/** `/bg` (2026-11-04): the chat went on under a new id in a process of its own, and its transcript's last word says which:
 *  `{type: continued-in, continuedInSessionId}`. Tied, and ticked done as a /clear's is: resuming it would be a second line
 *  from there. Once, by the tie: a later boot reads the line again, and the tick may have been undone since. */
export function noteContinued(s, to, ts) {
  setImmediate(() => {
    if (chatLinks.some(l => l.k === 'continued' && l.from === s.id && l.to === to)) return;
    addLink('continued', s.id, to);
    const was = sessions.get(s.id);
    if (!was || !ts || isDone(was) || String(was.lastActivity || '') > ts) return;
    doneMarks[was.id] = ts; saveState(); schedulePush(was);
  });
}
/** A chat's links, each `{k, dir, id, at}` — `out` from it (merged into, folded into, its branch), `in` to it (merged
 *  from, folded in, branched from) — or null. */
export function linksOf(id) {
  if (!linkIdx) {
    linkIdx = new Map();
    for (const l of chatLinks) for (const [me, id2, dir] of [[l.from, l.to, 'out'], [l.to, l.from, 'in']]) {
      if (!linkIdx.has(me)) linkIdx.set(me, []);
      linkIdx.get(me).push({ k: l.k, dir, id: id2, at: l.at });
    }
  }
  return linkIdx.get(id) || null;
}
/** What a card says of its branches (2026-11-04): one that ended before its first word never wrote a line, and there is no
 *  chat at that end to open. Claude Code writes a fork's copy with that word. */
export function linksShown(id) {
  const ls = linksOf(id)?.filter(l => { if (l.k !== 'branch' || l.dir !== 'out') return true; const o = sessions.get(l.id); return !!o && (!!o.file || o.alive || termOf(o)?.exited === null); });
  return ls?.length ? ls : null;
}
// A handoff (2026-10-31): where chats stand, written from their transcripts as the board reads them — for a new chat that
// merges them, or one another is folded into. Claude Code's own recap first where it wrote one (away_summary), its last
// reply where that came after; no `claude -p` asked to sum anything up. You read it, and may change it, before it goes.
export const HANDOFF_TEXT = 1500;
export function handoffItem(s) {
  const sum = summary(s);
  return { id: s.id, title: sum.title, cwd: sum.cwd ? tildePath(sum.cwd) : null, branch: s.gitBranch && s.gitBranch !== 'HEAD' ? s.gitBranch : null,
    prs: sum.prs.map(p => ({ url: p.url, state: p.state || null, title: p.title || null })),
    first: s.truncatedHead ? null : s.firstPrompt, last: s.lastPrompt, away: s.away, reply: s.replyText ? { text: s.replyText, at: s.lastReplyAt } : null,
    file: s.file ? tildePath(s.file) : null };
}
const handoffWhen = ts => { const d = new Date(ts), p = n => String(n).padStart(2, '0'); return isNaN(d) ? '' : `, ${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`; };
const quoted = t => String(t).trim().split('\n').map(l => `> ${l}`.trimEnd()).join('\n');
/** The handoff's words for `items` (handoffItem's): `merge`, the first prompt of a new chat; `fold`, typed into another. Pure. */
export function handoffText(items, kind = 'merge') {
  const n = items.length;
  const head = kind === 'fold' ? `Another chat of mine, folded into this one — where it stands, so its work goes on here.`
    : `A handoff: ${n === 1 ? 'a chat' : `${n} chats`} of mine, merged into this one — where each stands, so we carry ${n === 1 ? 'it' : 'them'} on from here.`;
  const parts = items.map((c, i) => [
    `## ${n > 1 ? `${i + 1}. ` : ''}${c.title}`,
    ...c.cwd ? [`Folder: ${c.cwd}${c.branch ? ` · branch ${c.branch}` : ''}`] : [],
    ...c.prs?.length ? [`PRs: ${c.prs.map(p => `${p.url}${p.state ? ` (${p.state})` : ''}${p.title ? ` — ${p.title}` : ''}`).join(' · ')}`] : [],
    ...c.first && c.first !== c.last ? [`First asked: ${c.first}`] : [],
    ...c.last ? [`Last asked: ${c.last}`] : [],
    ...c.away ? [`Where it stands — Claude Code's recap${handoffWhen(c.away.at)}:\n${quoted(c.away.text)}`] : [],
    ...c.reply && (!c.away || String(c.reply.at || '') > String(c.away.at || '')) ? [`${c.away ? 'After it, ' : ''}Claude's last reply${handoffWhen(c.reply.at)}:\n${quoted(c.reply.text)}`] : [],
    ...c.file ? [`Its transcript, to read for more: ${c.file}`] : [],
  ].join('\n'));
  const tail = kind === 'fold' ? 'Take it in, then wait for what I ask next.' : 'Read these, say in a few lines where you understand things stand, then wait for what I ask next.';
  return [head, ...parts, tail].join('\n\n');
}
/** A chat started with an id the board picked (2026-10-31: a merge's new chat, a branch): on the board from its start, so
 *  a page can open it and its links hold before claude has registered or written a line. `forkOf`, a branch's: until a
 *  line comes it goes by the title of the chat it copied, and the past it copies — lines from before `forkAt`, carried
 *  across its reads — is no news (queueNotify). */
export function placeholder(id, cwd, forkOf = null) {
  const s = newSession(id, null); s.cwd = cwd; s.startedAt = new Date().toISOString(); s.forkOf = forkOf;
  if (forkOf) s.forkAt = s.startedAt;
  sessions.set(id, s); return s;
}
export const forkTitle = s => { const o = !s.lastActivity && s.forkOf && sessions.get(s.forkOf); return o ? titles[o.id] || o.customTitle || o.title || o.lastPrompt || null : null; };
