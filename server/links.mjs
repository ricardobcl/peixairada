// Chats tied by your hand (2026-10-31): merged, folded, branched, gone on — and the words a handoff carries.
import { newSession, summary } from './sessions.mjs';
import { tildePath } from './setup.mjs';
import { schedulePush } from './sse.mjs';
import { chatLinks, doneMarks, indexing, isDone, saveState, sessions, setChatLinks, titles } from './state.mjs';
import { termOf } from './terminals/terms.mjs';

// ---- chats tied by your hand: merged, folded, branched (2026-10-31) -------------------------------------------------
export const LINK_KINDS = new Set(['merge', 'fold', 'branch', 'continued']);
export const LINKS_MAX = 2000;
export let linkIdx = null; // chat id → its links as the summary says them, rebuilt after a change

export function setLinkIdx(value) {
  linkIdx = value;
} // for the modules that write it: an import is read-only

/** `from` tied to `to`: kept, said to both chats' pages. The ones neither of whose chats the board knows go. */
export function addLink(kind, from, to) {
  if (!LINK_KINDS.has(kind) || !from || !to || from === to) return;
  setChatLinks(chatLinks.filter(link => !(link.k === kind && link.from === from && link.to === to)));
  chatLinks.push({ k: kind, from, to, at: new Date().toISOString() });
  if (!indexing) setChatLinks(chatLinks.filter(link => sessions.has(link.from) || sessions.has(link.to)));
  if (chatLinks.length > LINKS_MAX) setChatLinks(chatLinks.slice(-LINKS_MAX));
  linkIdx = null;
  saveState();

  for (const id of [from, to]) {
    const session = sessions.get(id);

    if (session) schedulePush(session);
  }
}

/** Whether two chats are tied already, whichever way and by what. */
const tied = (idA, idB) =>
  chatLinks.some(link => (link.from === idA && link.to === idB) || (link.from === idB && link.to === idA));

/** A copy Claude Code made is told by its first line (2026-11-04): `/branch`, `/fork`, `--fork-session` and a word in what `/bg`
 *  left all keep the chat's uuids under a new id, and name no origin in a shape they share. The oldest file is the chat, each
 *  other its branch, tied once; its copied past is no news (forkAt, as the board's own branch). */
const firstLines = new Map(); // uuid of a chat's first user line -> the ids of the chats that begin with it

export function noteFirstLine(session, line) {
  if (session.firstUuid || line.type !== 'user' || line.isSidechain || !line.uuid) return;
  session.firstUuid = line.uuid;
  let ids = firstLines.get(line.uuid);

  if (!ids) firstLines.set(line.uuid, (ids = new Set()));
  ids.add(session.id);
  if (ids.size < 2) return;

  const others = [...ids]
    .filter(id => id !== session.id)
    .map(id => sessions.get(id))
    .filter(Boolean);

  if (others.some(other => (other.bornAt ?? Infinity) < (session.bornAt ?? Infinity))) {
    session.forkAt ||= new Date().toISOString();
  }

  setImmediate(tieCopies, line.uuid); // the read under way holds this chat's object back from `sessions` (indexFile)
}

function tieCopies(uuid) {
  const chats = [...(firstLines.get(uuid) || [])]
    .map(id => sessions.get(id))
    .filter(Boolean)
    .sort((left, right) => (left.bornAt ?? Infinity) - (right.bornAt ?? Infinity));

  for (const chat of chats.slice(1)) if (!tied(chats[0].id, chat.id)) addLink('branch', chats[0].id, chat.id);
}

/** `/bg` (2026-11-04): the chat went on under a new id in a process of its own, and its transcript's last word says which:
 *  `{type: continued-in, continuedInSessionId}`. Tied, and ticked done as a /clear's is: resuming it would be a second line
 *  from there. Once, by the tie: a later boot reads the line again, and the tick may have been undone since. */
export function noteContinued(session, to, ts) {
  setImmediate(() => {
    if (chatLinks.some(link => link.k === 'continued' && link.from === session.id && link.to === to)) return;
    addLink('continued', session.id, to);
    const was = sessions.get(session.id);

    if (!was || !ts || isDone(was) || String(was.lastActivity || '') > ts) return;
    doneMarks[was.id] = ts;
    saveState();
    schedulePush(was);
  });
}

/** A chat's links, each `{k, dir, id, at}` — `out` from it (merged into, folded into, its branch), `in` to it (merged
 *  from, folded in, branched from) — or null. */
export function linksOf(id) {
  if (!linkIdx) {
    linkIdx = new Map();

    for (const link of chatLinks) {
      for (const [me, id2, dir] of [
        [link.from, link.to, 'out'],
        [link.to, link.from, 'in'],
      ]) {
        if (!linkIdx.has(me)) linkIdx.set(me, []);
        linkIdx.get(me).push({ k: link.k, dir, id: id2, at: link.at });
      }
    }
  }

  return linkIdx.get(id) || null;
}

/** What a card says of its branches (2026-11-04): one that ended before its first word never wrote a line, and there is no
 *  chat at that end to open. Claude Code writes a fork's copy with that word. */
export function linksShown(id) {
  const ls = linksOf(id)?.filter(link => {
    if (link.k !== 'branch' || link.dir !== 'out') return true;
    const target = sessions.get(link.id);

    return !!target && (!!target.file || target.alive || termOf(target)?.exited === null);
  });

  return ls?.length ? ls : null;
}

// A handoff (2026-10-31): where chats stand, written from their transcripts as the board reads them — for a new chat that
// merges them, or one another is folded into. Claude Code's own recap first where it wrote one (away_summary), its last
// reply where that came after; no `claude -p` asked to sum anything up. You read it, and may change it, before it goes.
export const HANDOFF_TEXT = 1500;

export function handoffItem(session) {
  const sum = summary(session);

  return {
    id: session.id,
    title: sum.title,
    cwd: sum.cwd ? tildePath(sum.cwd) : null,
    branch: session.gitBranch && session.gitBranch !== 'HEAD' ? session.gitBranch : null,
    prs: sum.prs.map(pr => ({ url: pr.url, state: pr.state || null, title: pr.title || null })),
    first: session.truncatedHead ? null : session.firstPrompt,
    last: session.lastPrompt,
    away: session.away,
    reply: session.replyText ? { text: session.replyText, at: session.lastReplyAt } : null,
    file: session.file ? tildePath(session.file) : null,
  };
}

const handoffWhen = ts => {
  const date = new Date(ts);
  const pad = value => String(value).padStart(2, '0');

  return isNaN(date)
    ? ''
    : `, ${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const quoted = text =>
  String(text)
    .trim()
    .split('\n')
    .map(line => `> ${line}`.trimEnd())
    .join('\n');

/** The handoff's words for `items` (handoffItem's): `merge`, the first prompt of a new chat; `fold`, typed into another. Pure. */
export function handoffText(items, kind = 'merge') {
  const count = items.length;

  const head =
    kind === 'fold'
      ? `Another chat of mine, folded into this one — where it stands, so its work goes on here.`
      : `A handoff: ${count === 1 ? 'a chat' : `${count} chats`} of mine, merged into this one — where each stands, so we carry ${count === 1 ? 'it' : 'them'} on from here.`;

  const parts = items.map((item, index) =>
    [
      `## ${count > 1 ? `${index + 1}. ` : ''}${item.title}`,
      ...(item.cwd ? [`Folder: ${item.cwd}${item.branch ? ` · branch ${item.branch}` : ''}`] : []),
      ...(item.prs?.length
        ? [
            `PRs: ${item.prs.map(pr => `${pr.url}${pr.state ? ` (${pr.state})` : ''}${pr.title ? ` — ${pr.title}` : ''}`).join(' · ')}`,
          ]
        : []),
      ...(item.first && item.first !== item.last ? [`First asked: ${item.first}`] : []),
      ...(item.last ? [`Last asked: ${item.last}`] : []),
      ...(item.away
        ? [`Where it stands — Claude Code's recap${handoffWhen(item.away.at)}:\n${quoted(item.away.text)}`]
        : []),
      ...(item.reply && (!item.away || String(item.reply.at || '') > String(item.away.at || ''))
        ? [
            `${item.away ? 'After it, ' : ''}Claude's last reply${handoffWhen(item.reply.at)}:\n${quoted(item.reply.text)}`,
          ]
        : []),
      ...(item.file ? [`Its transcript, to read for more: ${item.file}`] : []),
    ].join('\n'),
  );

  const tail =
    kind === 'fold'
      ? 'Take it in, then wait for what I ask next.'
      : 'Read these, say in a few lines where you understand things stand, then wait for what I ask next.';

  return [head, ...parts, tail].join('\n\n');
}

/** A chat started with an id the board picked (2026-10-31: a merge's new chat, a branch): on the board from its start, so
 *  a page can open it and its links hold before claude has registered or written a line. `forkOf`, a branch's: until a
 *  line comes it goes by the title of the chat it copied, and the past it copies — lines from before `forkAt`, carried
 *  across its reads — is no news (queueNotify). */
export function placeholder(id, cwd, forkOf = null) {
  const session = newSession(id, null);

  session.cwd = cwd;
  session.startedAt = new Date().toISOString();
  session.forkOf = forkOf;
  if (forkOf) session.forkAt = session.startedAt;
  sessions.set(id, session);
  return session;
}

export const forkTitle = session => {
  const source = !session.lastActivity && session.forkOf && sessions.get(session.forkOf);

  return source ? titles[source.id] || source.customTitle || source.title || source.lastPrompt || null : null;
};
