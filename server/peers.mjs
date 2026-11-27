// Messages between chats (2026-10-31): who sent one, and where it went.
import { createHash } from 'node:crypto';
import { sessions } from './state.mjs';
import { pushEntry } from './transcript/fold.mjs';
import { cut, plainSnippet, textOf } from './transcript/text.mjs';

// ---- messages between chats (2026-10-31) -------------------------------------------------------------------------------
// Since Claude Code 2.1.224 a chat messages another by its name (SendMessage), over the other's socket. Each side says it
// in its transcript, and the board showed neither: the receiver's line is a meta one. Its shape is nobody's promise —
// read on this Mac (2026-10-27, 2026-10-31) and held by scripts/fixture.mjs's peerLines —, so unknown fields are let be:
// * delivered: a `user` line, `isMeta`, `origin: {kind: "peer", from, name, fromMode, msg_id, verifiedPeerPid, body}`,
//   its text the `<cross-session-message from= from-name= from-mode=>` envelope and Claude Code's framing; absorbed
//   mid-turn, a `queued_command` attachment with that origin. A peer origin with a `senderTaskId` is the chat's own
//   sub-agent reporting back (an `<agent-message>`), not another chat: left out, as before.
// * waiting (the receiver at work): a `queue-operation` `enqueue` whose content is the bare envelope, until delivered.
// * sent: the SendMessage call (`to`, a name), and its result's `msg_id` — the receiver's `origin.msg_id`; a result with
//   `routing` is a word to a teammate or a sub-agent of its own.
// Never a word of yours (2026-10-31): a message is another Claude's, so it moves no lastUserAt, last prompt, turn or
// status — the chat's own reply to it is Claude's, and counts as Claude's.
const ENVELOPE_RE = /<cross-session-message\b([^>]*)>([\s\S]*?)<\/cross-session-message>/;
const XML_ENT = { quot: '"', apos: "'", lt: '<', gt: '>', amp: '&' };

export const unXml = t =>
  String(t).replace(/&(quot|apos|lt|gt|amp|#\d{1,7}|#x[0-9a-f]{1,6});/gi, (m, n) =>
    n[0] !== '#'
      ? XML_ENT[n.toLowerCase()]
      : (c => (c <= 0x10ffff ? String.fromCodePoint(c) : m))(
          n[1] === 'x' || n[1] === 'X' ? parseInt(n.slice(2), 16) : Number(n.slice(1)),
        ),
  );
export const pstr = v => (typeof v === 'string' && v ? v : null);

/** The envelope a peer message travels in: who sent it — its address, its name, its permission mode — and the words. */
function envelopeOf(text) {
  const m = ENVELOPE_RE.exec(String(text || ''));

  if (!m) return null;

  const attr = k => {
    const a = new RegExp(`\\s${k}="([^"]*)"`).exec(m[1]);

    return a ? unXml(a[1]) || null : null;
  };

  return { from: attr('from'), name: attr('from-name'), mode: attr('from-mode'), body: m[2].replace(/^\n+|\n+$/g, '') };
}

/** The sender's pid in its socket's address, `uds:/tmp/cc-socks/<pid>.sock` — what the envelope alone says. */
const pidOfSock = from => Number(/\/cc-socks(?:-\d+)?\/(\d+)\.sock$/.exec(String(from || ''))?.[1]) || null;

/** A message another chat sent this one, delivered — or null for any other line. */
export function peerOf(line) {
  const at =
    line?.type === 'user'
      ? line
      : line?.type === 'attachment' && line.attachment?.type === 'queued_command'
        ? line.attachment
        : null;

  const o = at?.origin;

  if (!o || typeof o !== 'object' || o.kind !== 'peer' || 'senderTaskId' in o) return null;
  const env = envelopeOf(typeof at.prompt === 'string' ? at.prompt : textOf(line.message?.content));

  if (!env && !('verifiedPeerPid' in o) && !pstr(o.fromMode)) return null; // a peer of some other kind: not a chat's message
  const pid = Number.isInteger(o.verifiedPeerPid) && o.verifiedPeerPid > 0 ? o.verifiedPeerPid : null;

  return {
    name: pstr(o.name) || env?.name || null,
    from: pstr(o.from) || env?.from || null,
    mode: pstr(o.fromMode) || env?.mode || null,
    msgId: pstr(o.msg_id),
    pid,
    verified: !!pid,
    body: pstr(o.body) ?? env?.body ?? '',
  };
}

const PEER_BODY = 8000;
const PEER_QUEUE = 10;
const PEER_INDEX = 2000;

const peerSent = new Map(); // msg_id → { id, to, at }: a chat's SendMessage that reached another chat
const peerRecv = new Map(); // msg_id → the chat that got it

export const peerNames = new Map(); // a name the registry gave a live chat → its id (loadRegistry): what `to` and `from-name` say

const peerKeep = (m, k, v) => {
  m.delete(k);
  m.set(k, v);
  if (m.size > PEER_INDEX) m.delete(m.keys().next().value);
};

export function notePeer(s, p, ts) {
  if (p.msgId) {
    if ((s.peerSeen ||= new Set()).has(p.msgId)) return false;
    s.peerSeen.add(p.msgId);
    peerKeep(peerRecv, p.msgId, s.id);
  } // the attachment and the line, one message

  const q = s.peerQueue || [];
  const same = x => x.from === p.from;

  let i = q.findIndex(x => same(x) && x.body.trim() === p.body.trim());

  if (i < 0) i = q.findIndex(same);
  if (i >= 0) q.splice(i, 1); // the one that waited for it
  s.peerIn = { name: p.name, from: p.from, pid: p.pid, mode: p.mode, msgId: p.msgId, verified: p.verified, at: ts };

  pushEntry(s, {
    role: 'peer',
    kind: 'peer',
    text: cut(p.body, PEER_BODY),
    ts,
    name: p.name,
    from: p.from,
    pid: p.pid,
    mode: p.mode,
    msgId: p.msgId,
    verified: p.verified,
  });

  return true;
}

/** A message waiting for the chat to finish its turn, and taken off the queue (`remove`) before it was delivered. */
export function notePeerQueue(s, line, ts) {
  const c = typeof line.content === 'string' ? line.content : '';

  if (!c.includes('<cross-session-message')) return false;

  const key = createHash('sha1').update(c).digest('hex');
  const q = (s.peerQueue ||= []);

  if (line.operation === 'enqueue') {
    const env = envelopeOf(c);

    if (!env) return false;
    q.push({ ...env, key, at: ts });
    if (q.length > PEER_QUEUE) q.shift();
    return true;
  }

  const i = line.operation === 'remove' ? q.findIndex(x => x.key === key) : -1;

  if (i >= 0) q.splice(i, 1);
  return i >= 0;
}

/** A SendMessage call, and its result: one that names a `msg_id` and no teammate's routing reached another chat. */
export function noteSend(s, e, b) {
  e.to = pstr(b.input?.to) || pstr(b.input?.recipient);
  (s.sends ||= new Map()).set(b.id, e);
  if (s.sends.size > 50) s.sends.delete(s.sends.keys().next().value);
}

export function noteSent(s, b, r, ts) {
  const e = s.sends?.get(b.tool_use_id);

  if (!e) return;
  s.sends.delete(b.tool_use_id);
  if (b.is_error || !r || typeof r !== 'object' || r.success === false) return;

  if (r.routing) {
    e.team = true;
    return;
  }

  if (pstr(r.msg_id)) {
    e.msgId = r.msg_id;
    peerKeep(peerSent, r.msg_id, { id: s.id, to: e.to, at: ts });
  }
}

/** Which chat sent a message: by its msg_id, the one that says it sent it; by the pid Claude Code verified, the chat that
 *  process runs — only if it ran then; by its name, the chat the registry last gave that name. Kept once found. */
function peerSender(s, p) {
  if (p.fromId) return p.fromId;

  const at = Date.parse(p.at || p.ts) || Date.now();
  const pid = p.pid || (!p.verified && pidOfSock(p.from));

  let id = p.msgId && peerSent.get(p.msgId)?.id;

  if (!id && pid) {
    for (const x of sessions.values()) {
      if (x.alive && [x.live, ...x.rivals].some(l => l?.pid === pid && !(Number(l.startedAt) > at))) {
        id = x.id;
        break;
      }
    }
  }

  if (!id && p.name) id = peerNames.get(p.name);
  if (!id || id === s.id || !sessions.has(id)) return null;
  return (p.fromId = id);
}

/** Which chat a SendMessage reached: the one its msg_id arrived in, else the live chat of that name. */
function peerTarget(s, e) {
  const id = (e.msgId && peerRecv.get(e.msgId)) || peerNames.get(String(e.to || '').replace(/^@/, ''));

  return id && id !== s.id && sessions.has(id) ? id : null;
}

/** The entries a page is handed name the chats at either end, as far as the board can tell by then. */
export function resolvePeers(s, list) {
  for (const e of list) {
    if (e.kind === 'peer') {
      if (!e.fromId) peerSender(s, e);
    } else if (e.kind === 'tool_use' && e.name === 'SendMessage' && !e.toId && !e.team && e.to) {
      const id = peerTarget(s, e);

      if (id) e.toId = id;
    }
  }
}

/** The card's mark: the newest message in — one still waiting, while the chat runs — and who sent it. */
export function peerInOf(s) {
  const q = s.alive && s.peerQueue?.at(-1);
  const d = s.peerIn;

  const p = q && (!d || String(q.at) >= String(d.at)) ? q : d;

  if (!p) return null;
  return { name: p.name, id: peerSender(s, p), at: p.at, mode: p.mode, queued: p === q };
}

export const peerQueueOf = s =>
  s.alive && s.peerQueue?.length
    ? s.peerQueue
        .slice(-5)
        .map(q => ({ name: q.name, id: peerSender(s, q), at: q.at, mode: q.mode, text: plainSnippet(q.body, 300) }))
    : null;
