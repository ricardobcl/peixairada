// Routes over the chats: reading them, and what is done to one from the board.
import { CLAUDE_DIR, NOTIFY } from '../env.mjs';
import { agentLog } from '../agents/rows.mjs';
import { ATTACH_MAX, readRaw, saveAttachment } from '../attach.mjs';
import { driftKey, rawDrift } from '../drift.mjs';
import { json, jsonBody, NEXT } from '../http.mjs';
import { jiraPauseUntil, queueTicket, ticketWanted } from '../jira.mjs';
import { addLink, handoffItem, handoffText, linksOf } from '../links.mjs';
import { resolvePeers } from '../peers.mjs';
import { chatsNaming, prMatch, unlinkPr } from '../prs/mentions.mjs';
import { shownPr } from '../prs/refs.mjs';
import { queueSessionPrs } from '../prs/status.mjs';
import { unwaiveTurn, waiveTurn } from '../prs/turn.mjs';
import { applyLiveness, loadRegistry } from '../registry.mjs';
import { repoUrls } from '../repos.mjs';
import { projectList, sortedSummaries, summary } from '../sessions.mjs';
import { armSnoozes, snoozeOf } from '../snooze.mjs';
import { broadcast, schedulePush } from '../sse.mjs';
import {
  doneMarks,
  driftAcks,
  favChats,
  forGoodMarks,
  forgotten,
  hiddenProjects,
  isDone,
  isRemoved,
  markRemoved,
  mutedChats,
  notificationsOn,
  pinned,
  priority,
  prLogs,
  putBackOnBoard,
  removedMarks,
  removing,
  saveState,
  seen,
  sessions,
  setPriority,
  snoozed,
  titles,
  unlinked,
  woke,
} from '../state.mjs';
import { killTerm } from '../terminals/spawn.mjs';
import { endClaude, terms } from '../terminals/terms.mjs';
import { dayOf } from '../today.mjs';
import { indexFile } from '../transcript/read.mjs';
import { cut } from '../transcript/text.mjs';

/** The chats as the pages read them: the list, a chat's entries and agents, the day, a handoff, the chats naming a
 *  PR, the tiles' tails. */
export async function chatReadRoutes(req, res, url, p) {
  let m;

  if (req.method === 'GET' && p === '/api/sessions') {
    return json(res, 200, {
      sessions: sortedSummaries(),
      projects: projectList(),
      pins: pinned,
      priority,
      hidden: hiddenProjects,
      repos: repoUrls(),
      claudeDir: CLAUDE_DIR,
      notify: NOTIFY,
      notifications: notificationsOn,
    });
  }

  if (req.method === 'GET' && (m = p.match(/^\/api\/sessions\/([\w-]+)\/messages$/))) {
    const s = sessions.get(m[1]);

    if (!s) return json(res, 404, { error: 'unknown session' });

    if (!s.loaded && s.file) {
      indexFile(s.file, { full: true });
      applyLiveness(sessions.get(m[1]));
    }

    const cur = sessions.get(m[1]);

    cur.openedAt = Date.now();
    resolvePeers(cur, cur.entries); // who sent a message, where one went (2026-10-31)
    queueSessionPrs(cur); // opening a chat refreshes its PR statuses and keeps them polled; the SSE push carries them in
    for (const t of cur.tickets) if (ticketWanted(t.key) && Date.now() >= jiraPauseUntil) queueTicket(t.key); // …and its tickets
    return json(res, 200, { session: summary(cur), entries: cur.entries, gen: cur.gen, upto: cur.entryCount }); // the entries end at upto
  }

  // one agent of a chat's (2026-11-02): the hover card's totals; `after`, its transcript's entries past that many
  if (req.method === 'GET' && (m = p.match(/^\/api\/sessions\/([\w-]+)\/agents\/([\w-]+)$/))) {
    const s = sessions.get(m[1]);
    const log = s && agentLog(s, m[2]);

    if (!log) return json(res, 404, { error: 'no such agent' });
    const after = url.searchParams.get('after');

    return json(res, 200, {
      prompt: log.prompt,
      tools: log.tools,
      tokens: log.tokens,
      model: log.model,
      upto: log.entries.length,
      ...(after === null ? {} : { entries: log.entries.slice(Number(after) || 0) }),
    });
  }

  // the home's day (2026-10-10): every chat's spans since the page's midnight
  if (req.method === 'GET' && p === '/api/today') {
    const since = Number(url.searchParams.get('since')) || new Date().setHours(0, 0, 0, 0);

    return json(
      res,
      200,
      dayOf(
        [...sessions.values()].filter(s => !isRemoved(s)),
        since,
      ),
    );
  }

  // a handoff (2026-10-31): where these chats stand, for the box a merge or a fold is read and changed in before it goes
  if (req.method === 'GET' && p === '/api/handoff') {
    const ids = [...new Set((url.searchParams.get('ids') || '').split(',').filter(Boolean))].slice(0, 12);
    const gone = ids.filter(id => !sessions.has(id));

    if (!ids.length || gone.length) {
      return json(res, 404, { error: ids.length ? `not on the board: ${gone.join(', ')}` : 'which chats? ?ids=a,b' });
    }

    const items = ids.map(id => handoffItem(sessions.get(id)));

    return json(res, 200, {
      text: handoffText(items, url.searchParams.get('kind') === 'fold' ? 'fold' : 'merge'),
      chats: items.map(c => ({ id: c.id, title: c.title, cwd: c.cwd })),
    });
  }

  // ⌥⌘K's box holding a PR's link (2026-11-03): every chat whose transcript names it
  if (req.method === 'GET' && p === '/api/named') {
    const pr = prMatch(url.searchParams.get('pr') || '');

    if (!pr) return json(res, 400, { error: "that is not a PR's link" });
    return json(res, 200, { ids: await chatsNaming(pr[1], pr[2], pr[3]) });
  }

  // the overview's tiles (2026-10-10): the last few things each of these chats did
  if (req.method === 'GET' && p === '/api/tails') {
    const ids = (url.searchParams.get('ids') || '').split(',').filter(Boolean).slice(0, 40);

    return json(res, 200, { tails: Object.fromEntries(ids.map(id => [id, sessions.get(id)?.recent || []])) });
  }

  return NEXT;
}

/** What is done to a chat from the board: a file attached, its title, done, deleted, folded, seen, its drift known,
 *  starred, muted, snoozed, a round let go, its PRs' ledgers, a PR taken off. */
export async function chatActionRoutes(req, res, url, p) {
  let m;

  if (req.method === 'PUT' && p === '/api/attach') {
    // a dropped file's bytes (browsers only — the app knows the path); ?session=<id>&name=<file>
    const sid = url.searchParams.get('session') || '';
    const name = url.searchParams.get('name') || 'file';

    let buf;

    try {
      buf = await readRaw(req, ATTACH_MAX);
    } catch (e) {
      res.setHeader('connection', 'close');
      return json(res, 413, {
        error: e.message === 'too large' ? `larger than ${ATTACH_MAX / 1048576} MB` : String(e.message || e),
      });
    }

    try {
      return json(res, 200, { ok: true, path: saveAttachment(sid, name, buf), bytes: buf.length });
    } catch (e) {
      return json(res, 500, { error: `could not save: ${e.message || e}` });
    }
  }

  if (req.method === 'PUT' && (m = p.match(/^\/api\/sessions\/([\w-]+)\/title$/))) {
    // a title typed on the board; empty clears it
    const s = sessions.get(m[1]);

    if (!s) return json(res, 404, { error: 'unknown session' });
    const body = await jsonBody(req);

    const title = cut(
      String(body.title ?? '')
        .replace(/\s+/g, ' ')
        .trim(),
      120,
    );

    if (title) titles[s.id] = title;
    else delete titles[s.id];
    for (const id of Object.keys(titles)) if (!sessions.has(id)) delete titles[id];
    saveState();
    schedulePush(s);
    return json(res, 200, { ok: true, title: summary(s).title, boardTitle: titles[s.id] || null });
  }

  if (req.method === 'POST' && (m = p.match(/^\/api\/sessions\/([\w-]+)\/done$/))) {
    const s = sessions.get(m[1]);

    if (!s) return json(res, 404, { error: 'unknown session' });
    const body = await jsonBody(req);
    const done = body.done !== false;

    if (done) {
      const at = (doneMarks[s.id] = new Date().toISOString());

      if (body.forGood === true) forGoodMarks[s.id] = at;
      else delete forGoodMarks[s.id]; // done for good (2026-10-11)

      if (snoozed[s.id]) {
        delete snoozed[s.id];
        armSnoozes();
      } // done is no snooze (2026-11-24, round XXX)

      // Done means done: the claude behind it stops too (2026-09-20) — the drawer's, and one live elsewhere (SIGTERM,
      // as closing that terminal would; a VS Code tab goes dead). Not awaited: the registry notices on its own.
      for (const t of terms.values()) if (t.sessionId === s.id && t.exited === null) killTerm(t);

      if (s.alive && s.live?.pid) {
        for (const p of [s.live, ...(s.rivals || [])]) endClaude(p).then(() => loadRegistry());
      }
    } else {
      delete doneMarks[s.id];
      delete forGoodMarks[s.id];
    }

    for (const id of Object.keys(doneMarks)) if (!sessions.has(id)) delete doneMarks[id]; // prune forgotten sessions
    for (const id of Object.keys(forGoodMarks)) if (forGoodMarks[id] !== doneMarks[id]) delete forGoodMarks[id]; // and ticks since replaced
    for (const id of Object.keys(removedMarks)) if (removedMarks[id] !== doneMarks[id]) delete removedMarks[id];
    saveState();
    schedulePush(s);
    return json(res, 200, { ok: true, done: isDone(s), forGood: forgotten(s) });
  }

  // Delete from the board (2026-11-04; ⌥-click on any card's button, its menus): whatever the chat is doing. Its claudes and
  // drawers end, as Done's do but awaited; the mark again once they have, since what an ending writes is dated before that.
  // The transcript stays, and `{undo}` is the way back. Vim is asked to quit, and with unsaved work the chat stays.
  if (req.method === 'POST' && (m = p.match(/^\/api\/sessions\/([\w-]+)\/remove$/))) {
    const s = sessions.get(m[1]);

    if (!s) return json(res, 404, { error: 'unknown session' });

    if ((await jsonBody(req)).undo === true) {
      putBackOnBoard(s);
      return json(res, 200, { ok: true, removed: false });
    }

    markRemoved(s);
    removing.add(s.id);
    saveState();
    schedulePush(s);
    const mine = [...terms.values()].filter(t => t.sessionId === s.id && t.exited === null);

    for (const t of mine) killTerm(t);
    const ended = s.alive ? await Promise.all([s.live, ...s.rivals].filter(l => l?.pid).map(endClaude)) : [];
    const vim = mine.filter(t => t.editor);

    for (let i = 0; i < 20 && vim.some(t => t.exited === null); i++) await new Promise(r => setTimeout(r, 100));
    loadRegistry();
    removing.delete(s.id);

    const stuck =
      ended.find(r => !r.ok && r.code !== 409)?.error ||
      (s.alive && `pid ${s.live?.pid} is still running`) ||
      (vim.some(t => t.exited === null) && 'vim has unsaved work: save or quit it first');

    if (stuck) {
      putBackOnBoard(s);
      return json(res, 409, { error: stuck });
    }

    markRemoved(s);

    if (snoozed[s.id]) {
      delete snoozed[s.id];
      armSnoozes();
    } // gone, it is neither put away nor at the top (2026-11-24, round XXX)

    if (priority.includes(s.id)) {
      setPriority(priority.filter(id => id !== s.id));
      broadcast('priority', { priority });
    }

    saveState();
    schedulePush(s);
    return json(res, 200, { ok: true, removed: isRemoved(s) });
  }

  if (req.method === 'POST' && (m = p.match(/^\/api\/sessions\/([\w-]+)\/fold$/))) {
    // folded into another chat (2026-10-31): the tie, said to both — the page ticks it done
    const s = sessions.get(m[1]);
    const body = await jsonBody(req);
    const into = typeof body.into === 'string' ? sessions.get(body.into) : null;

    if (!s || !into) {
      return json(res, 404, { error: !s ? 'unknown session' : 'expected {into: <the chat it went into>}' });
    }

    if (into === s) return json(res, 400, { error: 'a chat is not folded into itself' });
    addLink('fold', s.id, into.id);
    return json(res, 200, { ok: true, links: linksOf(s.id) });
  }

  if (req.method === 'POST' && (m = p.match(/^\/api\/sessions\/([\w-]+)\/seen$/))) {
    // the board showed the chat (2026-10-12)
    const s = sessions.get(m[1]);

    if (!s) return json(res, 404, { error: 'unknown session' });
    seen[s.id] = new Date().toISOString();
    for (const id of Object.keys(seen)) if (!sessions.has(id)) delete seen[id];
    saveState();
    schedulePush(s);
    return json(res, 200, { ok: true, seenAt: seen[s.id] });
  }

  if (req.method === 'POST' && (m = p.match(/^\/api\/sessions\/([\w-]+)\/drift$/))) {
    // the branch moved under it, and you know (2026-10-13)
    const s = sessions.get(m[1]);

    if (!s) return json(res, 404, { error: 'unknown session' });
    const d = rawDrift(s);

    if (!d) return json(res, 409, { error: 'its branch has not moved under it' });
    driftAcks[s.id] = driftKey(d);
    s.driftSaid = null;
    for (const id of Object.keys(driftAcks)) if (!sessions.has(id)) delete driftAcks[id];
    saveState();
    schedulePush(s);
    return json(res, 200, { ok: true, acked: driftAcks[s.id] });
  }

  if (req.method === 'POST' && (m = p.match(/^\/api\/sessions\/([\w-]+)\/favorite$/))) {
    // starred in Space, or not (2026-11-18, v11)
    const s = sessions.get(m[1]);

    if (!s) return json(res, 404, { error: 'unknown session' });
    const body = await jsonBody(req);

    if (typeof body.on !== 'boolean') return json(res, 400, { error: 'expected {on: true|false}' });
    if (body.on) favChats[s.id] = new Date().toISOString();
    else delete favChats[s.id];
    for (const id of Object.keys(favChats)) if (!sessions.has(id)) delete favChats[id];
    saveState();
    schedulePush(s);
    return json(res, 200, { ok: true, fav: !!favChats[s.id] });
  }

  if (req.method === 'POST' && (m = p.match(/^\/api\/sessions\/([\w-]+)\/mute$/))) {
    // this chat's alerts silent, or back (2026-11-02)
    const s = sessions.get(m[1]);

    if (!s) return json(res, 404, { error: 'unknown session' });
    const body = await jsonBody(req);

    if (typeof body.on !== 'boolean') return json(res, 400, { error: 'expected {on: true|false}' });
    if (body.on) mutedChats[s.id] = new Date().toISOString();
    else delete mutedChats[s.id];
    for (const id of Object.keys(mutedChats)) if (!sessions.has(id)) delete mutedChats[id];
    saveState();
    schedulePush(s);
    return json(res, 200, { ok: true, muted: !!mutedChats[s.id] });
  }

  // Snoozed (2026-11-24, round XXX): {until} a time (ISO or epoch ms), {on} an event of its own — `pr` with {pr}: that PR
  // come round to you, `ci` with {pr}: its checks done, `reply`, `mon` —, or both, whichever first; {undo} wakes it, no mark.
  if (req.method === 'POST' && (m = p.match(/^\/api\/sessions\/([\w-]+)\/snooze$/))) {
    const s = sessions.get(m[1]);

    if (!s) return json(res, 404, { error: 'unknown session' });
    const body = await jsonBody(req);

    if (body.undo === true) {
      delete snoozed[s.id];
      saveState();
      armSnoozes();
      schedulePush(s);
      return json(res, 200, { ok: true, snooze: null });
    }

    const r = snoozeOf(s, body);

    if (r.error) return json(res, r.code, { error: r.error });
    snoozed[s.id] = r.snooze;
    delete woke[s.id];
    for (const k of [snoozed, woke]) for (const id of Object.keys(k)) if (!sessions.has(id)) delete k[id];
    saveState();
    armSnoozes();
    schedulePush(s);
    return json(res, 200, { ok: true, snooze: r.snooze });
  }

  if (req.method === 'POST' && (m = p.match(/^\/api\/sessions\/([\w-]+)\/waive$/))) {
    // the chat's PRs at your move, let go this round (2026-10-12)
    const s = sessions.get(m[1]);

    if (!s) return json(res, 404, { error: 'unknown session' });

    // one PR's round alone, or taken back (2026-10-15: { url, undo }); no url, every one at your move, as ⌥-click does
    const b = await jsonBody(req);
    const one = typeof b.url === 'string' ? b.url : null;

    if (one && !s.prs.some(p => p.url === one)) return json(res, 404, { error: 'not a PR of this chat' });

    if (one && b.undo) {
      if (!unwaiveTurn(one)) return json(res, 409, { error: 'not let go' });
      saveState();
      return json(res, 200, { ok: true, back: [one] });
    }

    const urls = (one ? [one] : s.prs.filter(p => p.turn?.you).map(p => p.url)).filter(waiveTurn);

    if (!urls.length) return json(res, 409, { error: 'nothing at your move' });
    saveState();
    return json(res, 200, { ok: true, waived: urls });
  }

  if (req.method === 'GET' && (m = p.match(/^\/api\/sessions\/([\w-]+)\/prlog$/))) {
    // its PRs' ledgers (2026-10-15): the events and the rounds
    const s = sessions.get(m[1]);

    if (!s) return json(res, 404, { error: 'unknown session' });
    // every PR the chat shows, with a ledger or not (2026-10-17): `state` GitHub's spelling, `older` that it has more before
    return json(res, 200, {
      prs: s.prs.filter(shownPr).map(p => ({
        url: p.url,
        label: p.label,
        state: p.state ? p.state.toUpperCase() : null,
        ev: (prLogs[p.url]?.ev || []).map(e => (e.u && !/^https?:/.test(e.u) ? { ...e, u: p.url + e.u } : e)),
        rounds: prLogs[p.url]?.r || [],
        older: !!prLogs[p.url]?.older,
      })),
      said: s.prSaid || [],
    });
  }

  if (req.method === 'POST' && (m = p.match(/^\/api\/sessions\/([\w-]+)\/unlink$/))) {
    // a PR taken off the chat (2026-10-11): { url }
    const s = sessions.get(m[1]);

    if (!s) return json(res, 404, { error: 'unknown session' });
    const body = await jsonBody(req);

    if (!unlinkPr(s, String(body.url || ''))) return json(res, 404, { error: "not one of this chat's PRs" });
    for (const id of Object.keys(unlinked)) if (!sessions.has(id)) delete unlinked[id];
    saveState();
    schedulePush(s);
    return json(res, 200, { ok: true, prs: s.prs.filter(shownPr).length });
  }

  return NEXT;
}
