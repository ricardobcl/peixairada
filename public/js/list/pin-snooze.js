  // ---- Top priority and snooze, by hand (2026-11-24, round XXX) -------------------------------------------------------
  // The order is the server's, written whole (PUT /api/priority) and drawn at once from the copy here; a move is said to a
  // reader (#prioSay, R5), as GitHub's sortable lists do. What the section shows is the order's chats in view — the project
  // in view's, none snoozed —, so a move is among those, and lands beside them in the whole order.
  async function setPriority(ids, say = '') {
    const was = state.priority; state.priority = ids; renderBoard();
    if (say) $('#prioSay').textContent = say;
    try { state.priority = (await api('PUT', '/api/priority', { ids })).priority || ids; }
    catch (e) { state.priority = was; note($('#slist'), `Not pinned: ${e.message}`, true); }
    renderBoard();
  }
  function secList() {
    const p = prefs.project === ALL ? null : projectStub(prefs.project);
    return state.priority.map(id => state.sessions.get(id)).filter(s => s && visible(s) && !asleep(s) && (!p || inProject(s, p)));
  }
  const prioOff = anchor => (note(anchor || $('#slist'), 'The pinned section is off — Settings › Chat list switches it on', true), false);
  /** `s` into the order before the chat `before` (null: at its end), or out of it. */
  function prioPut(s, on, before = null, anchor = null) {
    if (!s) return false;
    if (!prioOn()) return prioOff(anchor);
    const ids = state.priority.filter(id => id !== s.id);
    if (on) { const i = before ? ids.indexOf(before) : -1; ids.splice(i < 0 ? ids.length : i, 0, s.id); }
    const shown = on ? secList().map(x => x.id).filter(id => id !== s.id) : [];
    if (on) { const i = before ? shown.indexOf(before) : -1; shown.splice(i < 0 ? shown.length : i, 0, s.id); }
    setPriority(ids, on ? `${s.title}, pinned, ${shown.indexOf(s.id) + 1} of ${shown.length}` : `${s.title}, unpinned`);
    return true;
  }
  /** One place up or down among the section's cards (d ±1), or to its top or bottom (d ±Infinity). */
  function prioMove(s, d, anchor = null) {
    if (!prioOn()) return prioOff(anchor);
    const list = secList(), i = list.indexOf(s);
    if (i < 0) return (note(anchor || $('#slist'), 'Not pinned — ⌥⌘I pins it', true), false);
    const j = Math.max(0, Math.min(list.length - 1, d === Infinity ? list.length - 1 : d === -Infinity ? 0 : i + d));
    if (j === i) { $('#prioSay').textContent = `${s.title}, already ${i ? 'last' : 'first'}`; return true; }
    return prioPut(s, true, d < 0 ? list[j].id : list[j + 1]?.id || null, anchor);
  }
  const clearDone = () => setPriority(state.priority.filter(id => !state.sessions.get(id)?.done), 'The ticked chats are unpinned');
  /** A snooze sent (`{until} | {on, pr}`), or `{undo: true}`: awake now. */
  async function snoozeIt(s, body, anchor = null) {
    const at = anchor?.isConnected ? anchor : cardNodes.get(s.id)?.el?.isConnected ? cardNodes.get(s.id).el : $('#shead');
    try {
      const r = await api('POST', `/api/sessions/${encodeURIComponent(s.id)}/snooze`, body), cur = state.sessions.get(s.id);
      if (cur) cur.snooze = r.snooze || null;
      renderBoard();
      const el = cardNodes.get(s.id)?.el, there = el?.isConnected ? el : at.isConnected && at.closest('#shead') ? at : $('#sessions');   // its card where it went, else the list
      note(there, body.undo ? 'Awake: it is back on its lane' : `Snoozed ${snoozeSay(r.snooze)} — in Snoozed, counted nowhere`);
    } catch (e) { note(at, `${body.undo ? 'Not woken' : 'Not snoozed'}: ${e.message}`, true); }
  }
  /** The times and the things to wait for (Z1, Z2): a menu of its own, 1 to 9 picking (S2). */
  function snoozeRows(s) {
    const now = new Date(), H = 3_600_000, m = Number(prefs.mornings ?? 9);
    const morning = new Date(now); morning.setHours(m, 0, 0, 0); const early = now < morning; if (!early) morning.setDate(morning.getDate() + 1);
    const monday = new Date(now); monday.setHours(m, 0, 0, 0); monday.setDate(monday.getDate() + ((8 - monday.getDay()) % 7 || 7));
    const until = t => ({ until: new Date(t).toISOString() }), rows = [];
    if (asleep(s)) rows.push({ t: 'Wake it now', sub: `snoozed ${snoozeSay(s.snooze)}`, fn: () => snoozeIt(s, { undo: true }) }, { hr: true });
    [['In 1 hour', +now + H], ['In 3 hours', +now + 3 * H], [early ? 'This morning' : 'Tomorrow morning', +morning], ['Next week', +monday]]
      .forEach(([t, at]) => rows.push({ t, n: whenSay(at), key: rows.filter(r => r.key).length + 1, fn: () => snoozeIt(s, until(at)) }));
    rows.push({ t: 'Pick a time…', key: 5, fn: () => zzPickOpen(s) }, { hr: true });
    const prs = (s.prs || []).filter(p => p.url && (!p.state || p.state === 'open' || p.state === 'draft')), short = p => p.label.replace(/^.*?#/, '#');
    const ev = [
      ...prs.filter(p => !p.turn?.you).slice(0, 2).map(p => ({ t: `Until ${short(p)} comes round to you`, sub: 'your move on it brings it back', fn: () => snoozeIt(s, { on: 'pr', pr: p.url }) })),
      ...prs.filter(p => p.checks === 'pending').slice(0, 1).map(p => ({ t: `Until ${short(p)}’s checks finish`, sub: 'pass or fail brings it back', fn: () => snoozeIt(s, { on: 'ci', pr: p.url }) })),
      ...(s.status === 'working' ? [{ t: 'Until Claude replies', sub: 'the end of this turn brings it back', fn: () => snoozeIt(s, { on: 'reply' }) }] : []),
      ...((s.tasks || []).length ? [{ t: 'Until its monitor ends', sub: s.tasks.map(t => t.what).filter(Boolean)[0] || 'what it watches', fn: () => snoozeIt(s, { on: 'mon' }) }] : []),
    ].slice(0, 4).map((r, i) => ({ ...r, key: 6 + i }));
    rows.push(...ev.length ? ev : [{ t: 'Until something happens', sub: 'no PR, turn or monitor to wait on in it', off: true }]);
    return rows;
  }
  /** The snooze menu at a point, or, from a key, by the chat's card — else under the header's ···. */
  function snoozeMenu(s, x, y, above = false) {
    if (!s) return;
    if (asking(s)) return note(cardNodes.get(s.id)?.el || $('#shead'), 'It is asking you — a question wakes a snooze, so answer it first', true);
    if (x == null) {
      const c = cardNodes.get(s.id)?.el, r = (c?.isConnected && c.getClientRects().length ? c : $('#moreBtn') || $('#shead')).getBoundingClientRect();
      x = r.left + 16; y = r.bottom + 4;
    }
    ctxShow(snoozeRows(s), x, y, 'snooze', above);
  }
  function zzPickOpen(s) {
    const dlg = $('#zzPick'), at = new Date(Date.now() + 3_600_000), local = d => new Date(d - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
    at.setMinutes(0, 0, 0);
    $('#zzFor').textContent = s.title; $('#zzErr').textContent = ''; dlg.dataset.id = s.id;
    $('#zzAt').min = local(new Date()); $('#zzAt').value = local(at);
    dlg.showModal(); repostPane(); $('#zzAt').focus();
  }
  function zzPickGo() {
    const dlg = $('#zzPick'), s = state.sessions.get(dlg.dataset.id), t = new Date($('#zzAt').value);
    if (!s) return dlg.close();
    if (isNaN(t) || t <= Date.now()) { $('#zzErr').textContent = 'A time to come'; return; }
    dlg.close(); snoozeIt(s, { until: t.toISOString() });
  }
  $('#zzGo').onclick = zzPickGo; $('#zzCancel').onclick = () => $('#zzPick').close();
  $('#zzAt').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); zzPickGo(); } });
  // the keys (2026-11-24, round XXX): ⌥⌘I in or out (A2), ⌥⌘⇧↑↓ a place (R3), ⌥⌘S its snooze (S2), ⌥⌘U focus (F6)
  const openChat = () => state.sessions.get(state.current) || null;
  function hotPrio() { const s = openChat(); if (!s) { note($('#shead'), 'No chat open'); return true; } prioPut(s, !inPrio(s), null, cardNodes.get(s.id)?.el || $('#shead')); return true; }
  function hotPrioMove(d) { const s = openChat(); if (!s) { note($('#shead'), 'No chat open'); return true; } prioMove(s, d, cardNodes.get(s.id)?.el || $('#shead')); return true; }
  function hotSnooze() { const s = openChat(); if (!s) { note($('#shead'), 'No chat open'); return true; } snoozeMenu(s); return true; }
  function hotFocus() { if (!prioOn()) { prioOff($('#fBtn')); return true; } setFilter(prioFocus() ? null : 'prio'); return true; }
  window.peixSnooze = id => { const s = state.sessions.get(id); if (s && !asking(s)) snoozeIt(s, { until: new Date(Date.now() + 3_600_000).toISOString() }); };   // the banner's In an hour (S3)
