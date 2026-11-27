// ---- an agent's tab (2026-11-02, round XX): its transcript, read-only, beside the chat -----------------------------------
// A row of a card's, clicked. Claude's own view of what it did, drawn as the chat's is (entryHtml, the tool rows), read a piece
// at a time from GET …/agents/:id?after=n while the tab shows and the agent works. One element, moved into its half, as the
// timeline's is. Nothing is typed from here: an agent reports to its chat, and the board drives a chat only through Claude.
const agentTabs = new Map(); // chat id → [{ id, asked }]: the tabs, kept across a reload (keepTabs)
const AGV_POLL_MS = 2500;
const agv = { key: null, sid: null, id: null, n: 0, run: [], group: null, drawnRun: 0, timer: 0, gen: 0, asking: 0 };
const isAgentTab = key => /^agent:/.test(key || '');

const agTabName = (session, key, whole) => {
  const name = agentTabs.get(session.id)?.find(tab => `agent:${tab.id}` === key)?.asked || 'An agent';

  return whole || name.length <= 28 ? name : `${name.slice(0, 27).trimEnd()}…`;
};

function agOpen(session, row) {
  if (!AG_ID.test(String(row?.id || ''))) return; // an id goes into a route's path (2026-11-06): an agent's, never `../`
  if (state.current !== session.id) openSession(session.id);

  const key = `agent:${row.id}`;
  const list = agentTabs.get(session.id) || [];

  if (list.some(tab => tab.id === row.id)) setTab(session, key);
  else {
    list.push({ id: row.id, asked: row.name || row.asked || 'An agent' });
    agentTabs.set(session.id, list);
    openNewTab(session, key);
  }

  syncTerm(session);
}

function agvHead(session) {
  const el = $('#agv');
  const is = candidate => candidate.id === agv.id;
  const row = session.agentRows?.find(is) || session.agentAll?.find(is);
  const name = agTabName(session, `agent:${agv.id}`, true); // one from a round before, or a claude before: Space's pods open those too

  const st = row ? (agQuiet(row) ? 'quiet' : row.st) : 'done';
  const at = st === 'run' || st === 'quiet' || st === 'wait';

  el.classList.toggle('working', at);
  const html = `${ICON.lock}<b>${esc(name)}</b><span class="say${st === 'fail' ? ' fail' : ''}">${at ? `${esc(AG_SAID[st])} · read-only, it reports to the chat when it ends` : st === 'fail' ? esc(row?.why || 'It ended on an error') : `${esc(AG_SAID[st] || 'done')} · read-only`}</span><button type="button" class="agvx" title="Close this tab — the agent carries on · ⌘W">${ICON.close}</button>`;
  const head = el.querySelector('.agvh');

  if (head && head._h !== html) {
    head._h = html;
    head.innerHTML = html;
  }

  return at;
}

function agvAdd(entries, session) {
  const log = $('#agv .agvlog');
  const stick = log.scrollHeight - log.scrollTop - log.clientHeight < 80;
  const cwd = session.cwd;

  for (const entry of entries) {
    if (entry.kind === 'tool_result' && entry.toolUseId) {
      toolRes.set(entry.toolUseId, !!entry.isError);
      const mark = log.querySelector(`.tst[data-tu="${CSS.escape(entry.toolUseId)}"]`);

      if (mark) mark.className = `tst ${toolMark(entry.toolUseId)}`;
    }
  }

  const group = () => {
    if (!agv.run.length || agv.drawnRun === agv.run.length) return;

    if (!agv.group) {
      const fragment = htmlNodes(toolGroupHtml(agv.run), cwd);

      agv.group = fragment.firstElementChild;
      agv.group.open = true;
      log.append(fragment);
    } // nearly all it does: open, unlike the chat's
    else {
      agv.group.append(htmlNodes(agv.run.slice(agv.drawnRun).map(entryHtml).join(''), cwd));
      agv.group.querySelector(':scope > summary').innerHTML = toolSummaryHtml(agv.run);
    }

    agv.drawnRun = agv.run.length;
  };

  for (const entry of entries) {
    if (entry.kind === 'tool_use' || entry.kind === 'tool_result') {
      agv.run.push(entry);
      continue;
    }

    group();
    agv.run = [];
    agv.group = null;
    agv.drawnRun = 0;
    const fragment = htmlNodes(entryHtml(entry), cwd);

    if (entry.role === 'user') {
      const who = fragment.querySelector('.who span');

      if (who) who.textContent = 'The chat asked';
    } // not your words: Claude's, to its agent

    log.append(fragment);
  }

  group();
  agv.n += entries.length;
  if (stick) log.scrollTop = log.scrollHeight;
}

async function agvPoll() {
  clearTimeout(agv.timer);
  agv.timer = 0;

  const { sid, id, gen, n: count } = agv;
  const session = state.sessions.get(sid);

  if (!session || $('#agv').hidden || agv.asking === gen) return; // one ask at a time: two would draw it twice
  agvHead(session);

  if (!document.hidden) {
    agv.asking = gen;

    try {
      const data = await api('GET', `/api/sessions/${sid}/agents/${encodeURIComponent(id)}?after=${count}`);

      if (gen !== agv.gen) return; // another agent's by now
      if (data.entries?.length) agvAdd(data.entries, session);
    } catch (error) {
      if (gen === agv.gen && error.status === 404) {
        $('#agv .agvlog').textContent = 'Its transcript is gone.';
        return;
      }
    } finally {
      if (agv.asking === gen) agv.asking = 0;
    }
  }

  if (gen !== agv.gen) return;
  const at = agvHead(state.sessions.get(sid) || session);

  if (at || !agv.n) agv.timer = setTimeout(agvPoll, AGV_POLL_MS);
}

function placeAgent(session, place) {
  const el = $('#agv');
  const half = session ? place.findIndex(isAgentTab) : -1;

  if (half < 0) {
    el.hidden = true;
    clearTimeout(agv.timer);
    return;
  }

  const host = $(GEL[half].body);

  if (el.parentElement !== host) {
    const top = el.querySelector('.agvlog')?.scrollTop;

    host.insertBefore(el, host.firstChild);
    if (top != null) el.querySelector('.agvlog').scrollTop = top;
  }

  const was = el.hidden;

  el.hidden = false;

  const id = place[half].slice('agent:'.length);
  const key = `${session.id}:${id}`;

  if (agv.key !== key) {
    Object.assign(agv, { key, sid: session.id, id, n: 0, run: [], group: null, drawnRun: 0, gen: agv.gen + 1 });
    el.innerHTML = '<div class="agvh"></div><div class="agvlog"></div>';
    agvPoll();
  } else if (was) agvPoll();
  else {
    agvHead(session);
    if (el.classList.contains('working') && !agv.timer) agvPoll();
  }
}

$('#agv').addEventListener('click', event => {
  if (event.target.closest('.agvx')) {
    const session = state.sessions.get(agv.sid);

    if (session) closeTab(session, `agent:${agv.id}`);
  }
}); // alone in its half it has no strip
