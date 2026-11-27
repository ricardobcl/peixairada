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
export async function chatReadRoutes(req, res, url, path) {
  let match;

  if (req.method === 'GET' && path === '/api/sessions') {
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

  if (req.method === 'GET' && (match = path.match(/^\/api\/sessions\/([\w-]+)\/messages$/))) {
    const session = sessions.get(match[1]);

    if (!session) return json(res, 404, { error: 'unknown session' });

    if (!session.loaded && session.file) {
      indexFile(session.file, { full: true });
      applyLiveness(sessions.get(match[1]));
    }

    const cur = sessions.get(match[1]);

    cur.openedAt = Date.now();
    resolvePeers(cur, cur.entries); // who sent a message, where one went (2026-10-31)
    queueSessionPrs(cur); // opening a chat refreshes its PR statuses and keeps them polled; the SSE push carries them in

    for (const ticket of cur.tickets) {
      if (ticketWanted(ticket.key) && Date.now() >= jiraPauseUntil) queueTicket(ticket.key);
    } // …and its tickets

    return json(res, 200, { session: summary(cur), entries: cur.entries, gen: cur.gen, upto: cur.entryCount }); // the entries end at upto
  }

  // one agent of a chat's (2026-11-02): the hover card's totals; `after`, its transcript's entries past that many
  if (req.method === 'GET' && (match = path.match(/^\/api\/sessions\/([\w-]+)\/agents\/([\w-]+)$/))) {
    const session = sessions.get(match[1]);
    const log = session && agentLog(session, match[2]);

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
  if (req.method === 'GET' && path === '/api/today') {
    const since = Number(url.searchParams.get('since')) || new Date().setHours(0, 0, 0, 0);

    return json(
      res,
      200,
      dayOf(
        [...sessions.values()].filter(session => !isRemoved(session)),
        since,
      ),
    );
  }

  // a handoff (2026-10-31): where these chats stand, for the box a merge or a fold is read and changed in before it goes
  if (req.method === 'GET' && path === '/api/handoff') {
    const ids = [...new Set((url.searchParams.get('ids') || '').split(',').filter(Boolean))].slice(0, 12);
    const gone = ids.filter(id => !sessions.has(id));

    if (!ids.length || gone.length) {
      return json(res, 404, { error: ids.length ? `not on the board: ${gone.join(', ')}` : 'which chats? ?ids=a,b' });
    }

    const items = ids.map(id => handoffItem(sessions.get(id)));

    return json(res, 200, {
      text: handoffText(items, url.searchParams.get('kind') === 'fold' ? 'fold' : 'merge'),
      chats: items.map(item => ({ id: item.id, title: item.title, cwd: item.cwd })),
    });
  }

  // ⌥⌘K's box holding a PR's link (2026-11-03): every chat whose transcript names it
  if (req.method === 'GET' && path === '/api/named') {
    const pr = prMatch(url.searchParams.get('pr') || '');

    if (!pr) return json(res, 400, { error: "that is not a PR's link" });
    return json(res, 200, { ids: await chatsNaming(pr[1], pr[2], pr[3]) });
  }

  // the overview's tiles (2026-10-10): the last few things each of these chats did
  if (req.method === 'GET' && path === '/api/tails') {
    const ids = (url.searchParams.get('ids') || '').split(',').filter(Boolean).slice(0, 40);

    return json(res, 200, { tails: Object.fromEntries(ids.map(id => [id, sessions.get(id)?.recent || []])) });
  }

  return NEXT;
}

/** What is done to a chat from the board: a file attached, its title, done, deleted, folded, seen, its drift known,
 *  starred, muted, snoozed, a round let go, its PRs' ledgers, a PR taken off. */
export async function chatActionRoutes(req, res, url, path) {
  let match;

  if (req.method === 'PUT' && path === '/api/attach') {
    // a dropped file's bytes (browsers only — the app knows the path); ?session=<id>&name=<file>
    const sid = url.searchParams.get('session') || '';
    const name = url.searchParams.get('name') || 'file';

    let buf;

    try {
      buf = await readRaw(req, ATTACH_MAX);
    } catch (error) {
      res.setHeader('connection', 'close');
      return json(res, 413, {
        error:
          error.message === 'too large' ? `larger than ${ATTACH_MAX / 1048576} MB` : String(error.message || error),
      });
    }

    try {
      return json(res, 200, { ok: true, path: saveAttachment(sid, name, buf), bytes: buf.length });
    } catch (error) {
      return json(res, 500, { error: `could not save: ${error.message || error}` });
    }
  }

  if (req.method === 'PUT' && (match = path.match(/^\/api\/sessions\/([\w-]+)\/title$/))) {
    // a title typed on the board; empty clears it
    const session = sessions.get(match[1]);

    if (!session) return json(res, 404, { error: 'unknown session' });
    const body = await jsonBody(req);

    const title = cut(
      String(body.title ?? '')
        .replace(/\s+/g, ' ')
        .trim(),
      120,
    );

    if (title) titles[session.id] = title;
    else delete titles[session.id];
    for (const id of Object.keys(titles)) if (!sessions.has(id)) delete titles[id];
    saveState();
    schedulePush(session);
    return json(res, 200, { ok: true, title: summary(session).title, boardTitle: titles[session.id] || null });
  }

  if (req.method === 'POST' && (match = path.match(/^\/api\/sessions\/([\w-]+)\/done$/))) {
    const session = sessions.get(match[1]);

    if (!session) return json(res, 404, { error: 'unknown session' });
    const body = await jsonBody(req);
    const done = body.done !== false;

    if (done) {
      const at = (doneMarks[session.id] = new Date().toISOString());

      if (body.forGood === true) forGoodMarks[session.id] = at;
      else delete forGoodMarks[session.id]; // done for good (2026-10-11)

      if (snoozed[session.id]) {
        delete snoozed[session.id];
        armSnoozes();
      } // done is no snooze (2026-11-24, round XXX)

      // Done means done: the claude behind it stops too (2026-09-20) — the drawer's, and one live elsewhere (SIGTERM,
      // as closing that terminal would; a VS Code tab goes dead). Not awaited: the registry notices on its own.
      for (const term of terms.values()) if (term.sessionId === session.id && term.exited === null) killTerm(term);

      if (session.alive && session.live?.pid) {
        for (const entry of [session.live, ...(session.rivals || [])]) endClaude(entry).then(() => loadRegistry());
      }
    } else {
      delete doneMarks[session.id];
      delete forGoodMarks[session.id];
    }

    for (const id of Object.keys(doneMarks)) if (!sessions.has(id)) delete doneMarks[id]; // prune forgotten sessions
    for (const id of Object.keys(forGoodMarks)) if (forGoodMarks[id] !== doneMarks[id]) delete forGoodMarks[id]; // and ticks since replaced
    for (const id of Object.keys(removedMarks)) if (removedMarks[id] !== doneMarks[id]) delete removedMarks[id];
    saveState();
    schedulePush(session);
    return json(res, 200, { ok: true, done: isDone(session), forGood: forgotten(session) });
  }

  // Delete from the board (2026-11-04; ⌥-click on any card's button, its menus): whatever the chat is doing. Its claudes and
  // drawers end, as Done's do but awaited; the mark again once they have, since what an ending writes is dated before that.
  // The transcript stays, and `{undo}` is the way back. Vim is asked to quit, and with unsaved work the chat stays.
  if (req.method === 'POST' && (match = path.match(/^\/api\/sessions\/([\w-]+)\/remove$/))) {
    const session = sessions.get(match[1]);

    if (!session) return json(res, 404, { error: 'unknown session' });

    if ((await jsonBody(req)).undo === true) {
      putBackOnBoard(session);
      return json(res, 200, { ok: true, removed: false });
    }

    markRemoved(session);
    removing.add(session.id);
    saveState();
    schedulePush(session);
    const mine = [...terms.values()].filter(term => term.sessionId === session.id && term.exited === null);

    for (const term of mine) killTerm(term);

    const ended = session.alive
      ? await Promise.all([session.live, ...session.rivals].filter(entry => entry?.pid).map(endClaude))
      : [];

    const vim = mine.filter(term => term.editor);

    for (let attempt = 0; attempt < 20 && vim.some(term => term.exited === null); attempt++) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    loadRegistry();
    removing.delete(session.id);

    const stuck =
      ended.find(result => !result.ok && result.code !== 409)?.error ||
      (session.alive && `pid ${session.live?.pid} is still running`) ||
      (vim.some(term => term.exited === null) && 'vim has unsaved work: save or quit it first');

    if (stuck) {
      putBackOnBoard(session);
      return json(res, 409, { error: stuck });
    }

    markRemoved(session);

    if (snoozed[session.id]) {
      delete snoozed[session.id];
      armSnoozes();
    } // gone, it is neither put away nor at the top (2026-11-24, round XXX)

    if (priority.includes(session.id)) {
      setPriority(priority.filter(id => id !== session.id));
      broadcast('priority', { priority });
    }

    saveState();
    schedulePush(session);
    return json(res, 200, { ok: true, removed: isRemoved(session) });
  }

  if (req.method === 'POST' && (match = path.match(/^\/api\/sessions\/([\w-]+)\/fold$/))) {
    // folded into another chat (2026-10-31): the tie, said to both — the page ticks it done
    const session = sessions.get(match[1]);
    const body = await jsonBody(req);
    const into = typeof body.into === 'string' ? sessions.get(body.into) : null;

    if (!session || !into) {
      return json(res, 404, { error: !session ? 'unknown session' : 'expected {into: <the chat it went into>}' });
    }

    if (into === session) return json(res, 400, { error: 'a chat is not folded into itself' });
    addLink('fold', session.id, into.id);
    return json(res, 200, { ok: true, links: linksOf(session.id) });
  }

  if (req.method === 'POST' && (match = path.match(/^\/api\/sessions\/([\w-]+)\/seen$/))) {
    // the board showed the chat (2026-10-12)
    const session = sessions.get(match[1]);

    if (!session) return json(res, 404, { error: 'unknown session' });
    seen[session.id] = new Date().toISOString();
    for (const id of Object.keys(seen)) if (!sessions.has(id)) delete seen[id];
    saveState();
    schedulePush(session);
    return json(res, 200, { ok: true, seenAt: seen[session.id] });
  }

  if (req.method === 'POST' && (match = path.match(/^\/api\/sessions\/([\w-]+)\/drift$/))) {
    // the branch moved under it, and you know (2026-10-13)
    const session = sessions.get(match[1]);

    if (!session) return json(res, 404, { error: 'unknown session' });
    const drift = rawDrift(session);

    if (!drift) return json(res, 409, { error: 'its branch has not moved under it' });
    driftAcks[session.id] = driftKey(drift);
    session.driftSaid = null;
    for (const id of Object.keys(driftAcks)) if (!sessions.has(id)) delete driftAcks[id];
    saveState();
    schedulePush(session);
    return json(res, 200, { ok: true, acked: driftAcks[session.id] });
  }

  if (req.method === 'POST' && (match = path.match(/^\/api\/sessions\/([\w-]+)\/favorite$/))) {
    // starred in Space, or not (2026-11-18, v11)
    const session = sessions.get(match[1]);

    if (!session) return json(res, 404, { error: 'unknown session' });
    const body = await jsonBody(req);

    if (typeof body.on !== 'boolean') return json(res, 400, { error: 'expected {on: true|false}' });
    if (body.on) favChats[session.id] = new Date().toISOString();
    else delete favChats[session.id];
    for (const id of Object.keys(favChats)) if (!sessions.has(id)) delete favChats[id];
    saveState();
    schedulePush(session);
    return json(res, 200, { ok: true, fav: !!favChats[session.id] });
  }

  if (req.method === 'POST' && (match = path.match(/^\/api\/sessions\/([\w-]+)\/mute$/))) {
    // this chat's alerts silent, or back (2026-11-02)
    const session = sessions.get(match[1]);

    if (!session) return json(res, 404, { error: 'unknown session' });
    const body = await jsonBody(req);

    if (typeof body.on !== 'boolean') return json(res, 400, { error: 'expected {on: true|false}' });
    if (body.on) mutedChats[session.id] = new Date().toISOString();
    else delete mutedChats[session.id];
    for (const id of Object.keys(mutedChats)) if (!sessions.has(id)) delete mutedChats[id];
    saveState();
    schedulePush(session);
    return json(res, 200, { ok: true, muted: !!mutedChats[session.id] });
  }

  // Snoozed (2026-11-24, round XXX): {until} a time (ISO or epoch ms), {on} an event of its own — `pr` with {pr}: that PR
  // come round to you, `ci` with {pr}: its checks done, `reply`, `mon` —, or both, whichever first; {undo} wakes it, no mark.
  if (req.method === 'POST' && (match = path.match(/^\/api\/sessions\/([\w-]+)\/snooze$/))) {
    const session = sessions.get(match[1]);

    if (!session) return json(res, 404, { error: 'unknown session' });
    const body = await jsonBody(req);

    if (body.undo === true) {
      delete snoozed[session.id];
      saveState();
      armSnoozes();
      schedulePush(session);
      return json(res, 200, { ok: true, snooze: null });
    }

    const result = snoozeOf(session, body);

    if (result.error) return json(res, result.code, { error: result.error });
    snoozed[session.id] = result.snooze;
    delete woke[session.id];
    for (const marks of [snoozed, woke]) for (const id of Object.keys(marks)) if (!sessions.has(id)) delete marks[id];
    saveState();
    armSnoozes();
    schedulePush(session);
    return json(res, 200, { ok: true, snooze: result.snooze });
  }

  if (req.method === 'POST' && (match = path.match(/^\/api\/sessions\/([\w-]+)\/waive$/))) {
    // the chat's PRs at your move, let go this round (2026-10-12)
    const session = sessions.get(match[1]);

    if (!session) return json(res, 404, { error: 'unknown session' });

    // one PR's round alone, or taken back (2026-10-15: { url, undo }); no url, every one at your move, as ⌥-click does
    const body = await jsonBody(req);
    const one = typeof body.url === 'string' ? body.url : null;

    if (one && !session.prs.some(pr => pr.url === one)) return json(res, 404, { error: 'not a PR of this chat' });

    if (one && body.undo) {
      if (!unwaiveTurn(one)) return json(res, 409, { error: 'not let go' });
      saveState();
      return json(res, 200, { ok: true, back: [one] });
    }

    const urls = (one ? [one] : session.prs.filter(pr => pr.turn?.you).map(pr => pr.url)).filter(waiveTurn);

    if (!urls.length) return json(res, 409, { error: 'nothing at your move' });
    saveState();
    return json(res, 200, { ok: true, waived: urls });
  }

  if (req.method === 'GET' && (match = path.match(/^\/api\/sessions\/([\w-]+)\/prlog$/))) {
    // its PRs' ledgers (2026-10-15): the events and the rounds
    const session = sessions.get(match[1]);

    if (!session) return json(res, 404, { error: 'unknown session' });
    // every PR the chat shows, with a ledger or not (2026-10-17): `state` GitHub's spelling, `older` that it has more before
    return json(res, 200, {
      prs: session.prs.filter(shownPr).map(pr => ({
        url: pr.url,
        label: pr.label,
        state: pr.state ? pr.state.toUpperCase() : null,
        ev: (prLogs[pr.url]?.ev || []).map(event =>
          event.u && !/^https?:/.test(event.u) ? { ...event, u: pr.url + event.u } : event,
        ),
        rounds: prLogs[pr.url]?.r || [],
        older: !!prLogs[pr.url]?.older,
      })),
      said: session.prSaid || [],
    });
  }

  if (req.method === 'POST' && (match = path.match(/^\/api\/sessions\/([\w-]+)\/unlink$/))) {
    // a PR taken off the chat (2026-10-11): { url }
    const session = sessions.get(match[1]);

    if (!session) return json(res, 404, { error: 'unknown session' });
    const body = await jsonBody(req);

    if (!unlinkPr(session, String(body.url || ''))) return json(res, 404, { error: "not one of this chat's PRs" });
    for (const id of Object.keys(unlinked)) if (!sessions.has(id)) delete unlinked[id];
    saveState();
    schedulePush(session);
    return json(res, 200, { ok: true, prs: session.prs.filter(shownPr).length });
  }

  return NEXT;
}
