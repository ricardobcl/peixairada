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

export const unXml = text =>
  String(text).replace(/&(quot|apos|lt|gt|amp|#\d{1,7}|#x[0-9a-f]{1,6});/gi, (entity, ref) =>
    ref[0] !== '#'
      ? XML_ENT[ref.toLowerCase()]
      : (codePoint => (codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : entity))(
          ref[1] === 'x' || ref[1] === 'X' ? parseInt(ref.slice(2), 16) : Number(ref.slice(1)),
        ),
  );
export const pstr = value => (typeof value === 'string' && value ? value : null);

/** The envelope a peer message travels in: who sent it — its address, its name, its permission mode — and the words. */
function envelopeOf(text) {
  const match = ENVELOPE_RE.exec(String(text || ''));

  if (!match) return null;

  const attr = name => {
    const found = new RegExp(`\\s${name}="([^"]*)"`).exec(match[1]);

    return found ? unXml(found[1]) || null : null;
  };

  return {
    from: attr('from'),
    name: attr('from-name'),
    mode: attr('from-mode'),
    body: match[2].replace(/^\n+|\n+$/g, ''),
  };
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

  const origin = at?.origin;

  if (!origin || typeof origin !== 'object' || origin.kind !== 'peer' || 'senderTaskId' in origin) return null;
  const env = envelopeOf(typeof at.prompt === 'string' ? at.prompt : textOf(line.message?.content));

  if (!env && !('verifiedPeerPid' in origin) && !pstr(origin.fromMode)) return null; // a peer of some other kind: not a chat's message
  const pid = Number.isInteger(origin.verifiedPeerPid) && origin.verifiedPeerPid > 0 ? origin.verifiedPeerPid : null;

  return {
    name: pstr(origin.name) || env?.name || null,
    from: pstr(origin.from) || env?.from || null,
    mode: pstr(origin.fromMode) || env?.mode || null,
    msgId: pstr(origin.msg_id),
    pid,
    verified: !!pid,
    body: pstr(origin.body) ?? env?.body ?? '',
  };
}

const PEER_BODY = 8000;
const PEER_QUEUE = 10;
const PEER_INDEX = 2000;

const peerSent = new Map(); // msg_id → { id, to, at }: a chat's SendMessage that reached another chat
const peerRecv = new Map(); // msg_id → the chat that got it

export const peerNames = new Map(); // a name the registry gave a live chat → its id (loadRegistry): what `to` and `from-name` say

const peerKeep = (map, key, value) => {
  map.delete(key);
  map.set(key, value);
  if (map.size > PEER_INDEX) map.delete(map.keys().next().value);
};

export function notePeer(session, peer, ts) {
  if (peer.msgId) {
    if ((session.peerSeen ||= new Set()).has(peer.msgId)) return false;
    session.peerSeen.add(peer.msgId);
    peerKeep(peerRecv, peer.msgId, session.id);
  } // the attachment and the line, one message

  const queue = session.peerQueue || [];
  const same = queued => queued.from === peer.from;

  let index = queue.findIndex(queued => same(queued) && queued.body.trim() === peer.body.trim());

  if (index < 0) index = queue.findIndex(same);
  if (index >= 0) queue.splice(index, 1); // the one that waited for it

  session.peerIn = {
    name: peer.name,
    from: peer.from,
    pid: peer.pid,
    mode: peer.mode,
    msgId: peer.msgId,
    verified: peer.verified,
    at: ts,
  };

  pushEntry(session, {
    role: 'peer',
    kind: 'peer',
    text: cut(peer.body, PEER_BODY),
    ts,
    name: peer.name,
    from: peer.from,
    pid: peer.pid,
    mode: peer.mode,
    msgId: peer.msgId,
    verified: peer.verified,
  });

  return true;
}

/** A message waiting for the chat to finish its turn, and taken off the queue (`remove`) before it was delivered. */
export function notePeerQueue(session, line, ts) {
  const content = typeof line.content === 'string' ? line.content : '';

  if (!content.includes('<cross-session-message')) return false;

  const key = createHash('sha1').update(content).digest('hex');
  const queue = (session.peerQueue ||= []);

  if (line.operation === 'enqueue') {
    const env = envelopeOf(content);

    if (!env) return false;
    queue.push({ ...env, key, at: ts });
    if (queue.length > PEER_QUEUE) queue.shift();
    return true;
  }

  const index = line.operation === 'remove' ? queue.findIndex(queued => queued.key === key) : -1;

  if (index >= 0) queue.splice(index, 1);
  return index >= 0;
}

/** A SendMessage call, and its result: one that names a `msg_id` and no teammate's routing reached another chat. */
export function noteSend(session, entry, block) {
  entry.to = pstr(block.input?.to) || pstr(block.input?.recipient);
  (session.sends ||= new Map()).set(block.id, entry);
  if (session.sends.size > 50) session.sends.delete(session.sends.keys().next().value);
}

export function noteSent(session, block, result, ts) {
  const entry = session.sends?.get(block.tool_use_id);

  if (!entry) return;
  session.sends.delete(block.tool_use_id);
  if (block.is_error || !result || typeof result !== 'object' || result.success === false) return;

  if (result.routing) {
    entry.team = true;
    return;
  }

  if (pstr(result.msg_id)) {
    entry.msgId = result.msg_id;
    peerKeep(peerSent, result.msg_id, { id: session.id, to: entry.to, at: ts });
  }
}

/** Which chat sent a message: by its msg_id, the one that says it sent it; by the pid Claude Code verified, the chat that
 *  process runs — only if it ran then; by its name, the chat the registry last gave that name. Kept once found. */
function peerSender(session, message) {
  if (message.fromId) return message.fromId;

  const at = Date.parse(message.at || message.ts) || Date.now();
  const pid = message.pid || (!message.verified && pidOfSock(message.from));

  let id = message.msgId && peerSent.get(message.msgId)?.id;

  if (!id && pid) {
    for (const chat of sessions.values()) {
      if (chat.alive && [chat.live, ...chat.rivals].some(live => live?.pid === pid && !(Number(live.startedAt) > at))) {
        id = chat.id;
        break;
      }
    }
  }

  if (!id && message.name) id = peerNames.get(message.name);
  if (!id || id === session.id || !sessions.has(id)) return null;
  return (message.fromId = id);
}

/** Which chat a SendMessage reached: the one its msg_id arrived in, else the live chat of that name. */
function peerTarget(session, entry) {
  const id = (entry.msgId && peerRecv.get(entry.msgId)) || peerNames.get(String(entry.to || '').replace(/^@/, ''));

  return id && id !== session.id && sessions.has(id) ? id : null;
}

/** The entries a page is handed name the chats at either end, as far as the board can tell by then. */
export function resolvePeers(session, list) {
  for (const entry of list) {
    if (entry.kind === 'peer') {
      if (!entry.fromId) peerSender(session, entry);
    } else if (entry.kind === 'tool_use' && entry.name === 'SendMessage' && !entry.toId && !entry.team && entry.to) {
      const id = peerTarget(session, entry);

      if (id) entry.toId = id;
    }
  }
}

/** The card's mark: the newest message in — one still waiting, while the chat runs — and who sent it. */
export function peerInOf(session) {
  const queued = session.alive && session.peerQueue?.at(-1);
  const delivered = session.peerIn;

  const latest = queued && (!delivered || String(queued.at) >= String(delivered.at)) ? queued : delivered;

  if (!latest) return null;
  return {
    name: latest.name,
    id: peerSender(session, latest),
    at: latest.at,
    mode: latest.mode,
    queued: latest === queued,
  };
}

export const peerQueueOf = session =>
  session.alive && session.peerQueue?.length
    ? session.peerQueue.slice(-5).map(queued => ({
        name: queued.name,
        id: peerSender(session, queued),
        at: queued.at,
        mode: queued.mode,
        text: plainSnippet(queued.body, 300),
      }))
    : null;
