  // ---- an agent's tab (2026-11-02, round XX): its transcript, read-only, beside the chat -----------------------------------
  // A row of a card's, clicked. Claude's own view of what it did, drawn as the chat's is (entryHtml, the tool rows), read a piece
  // at a time from GET …/agents/:id?after=n while the tab shows and the agent works. One element, moved into its half, as the
  // timeline's is. Nothing is typed from here: an agent reports to its chat, and the board drives a chat only through Claude.
  const agentTabs = new Map();   // chat id → [{ id, asked }]: the tabs, kept across a reload (keepTabs)
  const AGV_POLL_MS = 2500;
  const agv = { key: null, sid: null, id: null, n: 0, run: [], group: null, drawnRun: 0, timer: 0, gen: 0, asking: 0 };
  const isAgentTab = k => /^agent:/.test(k || '');
  const agTabName = (s, k, whole) => { const t = agentTabs.get(s.id)?.find(a => 'agent:' + a.id === k)?.asked || 'An agent'; return whole || t.length <= 28 ? t : t.slice(0, 27).trimEnd() + '…'; };
  function agOpen(s, r) {
    if (!AG_ID.test(String(r?.id || ''))) return;   // an id goes into a route's path (2026-11-06): an agent's, never `../`
    if (state.current !== s.id) openSession(s.id);
    const k = 'agent:' + r.id, l = agentTabs.get(s.id) || [];
    if (l.some(a => a.id === r.id)) setTab(s, k);
    else { l.push({ id: r.id, asked: r.name || r.asked || 'An agent' }); agentTabs.set(s.id, l); openNewTab(s, k); }
    syncTerm(s);
  }
  function agvHead(s) {
    const el = $('#agv'), is = x => x.id === agv.id, r = s.agentRows?.find(is) || s.agentAll?.find(is), name = agTabName(s, 'agent:' + agv.id, true);   // one from a round before, or a claude before: Space's pods open those too
    const st = r ? (agQuiet(r) ? 'quiet' : r.st) : 'done', at = st === 'run' || st === 'quiet' || st === 'wait';
    el.classList.toggle('working', at);
    const html = `${ICON.lock}<b>${esc(name)}</b><span class="say${st === 'fail' ? ' fail' : ''}">${at ? `${esc(AG_SAID[st])} · read-only, it reports to the chat when it ends` : st === 'fail' ? esc(r?.why || 'It ended on an error') : `${esc(AG_SAID[st] || 'done')} · read-only`}</span><button type="button" class="agvx" title="Close this tab — the agent carries on · ⌘W">${ICON.close}</button>`;
    const h = el.querySelector('.agvh'); if (h && h._h !== html) { h._h = html; h.innerHTML = html; }
    return at;
  }
  function agvAdd(entries, s) {
    const log = $('#agv .agvlog'), stick = log.scrollHeight - log.scrollTop - log.clientHeight < 80, cwd = s.cwd;
    for (const e of entries) if (e.kind === 'tool_result' && e.toolUseId) {
      toolRes.set(e.toolUseId, !!e.isError);
      const m = log.querySelector(`.tst[data-tu="${CSS.escape(e.toolUseId)}"]`); if (m) m.className = 'tst ' + toolMark(e.toolUseId);
    }
    const group = () => {
      if (!agv.run.length || agv.drawnRun === agv.run.length) return;
      if (!agv.group) { const f = htmlNodes(toolGroupHtml(agv.run), cwd); agv.group = f.firstElementChild; agv.group.open = true; log.append(f); }   // nearly all it does: open, unlike the chat's
      else { agv.group.append(htmlNodes(agv.run.slice(agv.drawnRun).map(entryHtml).join(''), cwd)); agv.group.querySelector(':scope > summary').innerHTML = toolSummaryHtml(agv.run); }
      agv.drawnRun = agv.run.length;
    };
    for (const e of entries) {
      if (e.kind === 'tool_use' || e.kind === 'tool_result') { agv.run.push(e); continue; }
      group(); agv.run = []; agv.group = null; agv.drawnRun = 0;
      const f = htmlNodes(entryHtml(e), cwd);
      if (e.role === 'user') { const w = f.querySelector('.who span'); if (w) w.textContent = 'The chat asked'; }   // not your words: Claude's, to its agent
      log.append(f);
    }
    group();
    agv.n += entries.length;
    if (stick) log.scrollTop = log.scrollHeight;
  }
  async function agvPoll() {
    clearTimeout(agv.timer); agv.timer = 0;
    const { sid, id, gen, n } = agv, s = state.sessions.get(sid); if (!s || $('#agv').hidden || agv.asking === gen) return;   // one ask at a time: two would draw it twice
    let at = agvHead(s);
    if (!document.hidden) {
      agv.asking = gen;
      try {
        const d = await api('GET', `/api/sessions/${sid}/agents/${encodeURIComponent(id)}?after=${n}`);
        if (gen !== agv.gen) return;   // another agent's by now
        if (d.entries?.length) agvAdd(d.entries, s);
      } catch (e) { if (gen === agv.gen && e.status === 404) { $('#agv .agvlog').textContent = 'Its transcript is gone.'; return; } }
      finally { if (agv.asking === gen) agv.asking = 0; }
    }
    if (gen !== agv.gen) return;
    at = agvHead(state.sessions.get(sid) || s);
    if (at || !agv.n) agv.timer = setTimeout(agvPoll, AGV_POLL_MS);
  }
  function placeAgent(s, p) {
    const el = $('#agv'), g = s ? p.findIndex(isAgentTab) : -1;
    if (g < 0) { el.hidden = true; clearTimeout(agv.timer); return; }
    const host = $(GEL[g].body); if (el.parentElement !== host) { const top = el.querySelector('.agvlog')?.scrollTop; host.insertBefore(el, host.firstChild); if (top != null) el.querySelector('.agvlog').scrollTop = top; }
    const was = el.hidden; el.hidden = false;
    const id = p[g].slice('agent:'.length), key = `${s.id}:${id}`;
    if (agv.key !== key) {
      Object.assign(agv, { key, sid: s.id, id, n: 0, run: [], group: null, drawnRun: 0, gen: agv.gen + 1 });
      el.innerHTML = '<div class="agvh"></div><div class="agvlog"></div>';
      agvPoll();
    } else if (was) agvPoll();
    else { agvHead(s); if (el.classList.contains('working') && !agv.timer) agvPoll(); }
  }

  $('#agv').addEventListener('click', e => { if (e.target.closest('.agvx')) { const s = state.sessions.get(agv.sid); if (s) closeTab(s, 'agent:' + agv.id); } });   // alone in its half it has no strip

