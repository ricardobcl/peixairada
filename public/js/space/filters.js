  // ---- the box's filters (2026-11-24): a word with a colon, an @ or a # is a filter — a chip once a space follows it —,
  // the rest the fuzzy match; every filter must hold. is: a state or starred; pr: where its open PRs stand; @ an agent's
  // type its claude ran; # its project. A prefix typed lists what it can be, each with how many chats it would keep.
  const SP_IS = { asking: s => spState(s) === 'ask', working: s => spState(s) === 'work', watching: s => spState(s) === 'watch', ready: s => spState(s) === 'ready', idle: s => spState(s) === 'idle', done: s => spState(s) === 'done', star: s => !!s.fav };
  const SP_IS_SAY = { asking: 'asking you', working: 'clauding', watching: 'watching', ready: 'ready', idle: 'idle', done: 'done', star: 'starred' };
  const SP_PRS = { mine: s => spOpenPrs(s).some(p => p.turn?.you), open: s => spOpenPrs(s).length > 0, changes: s => spOpenPrs(s).some(p => p.review?.decision === 'changes'),
    unresolved: s => spOpenPrs(s).some(p => p.review?.open > 0), approved: s => spOpenPrs(s).some(p => p.review?.decision === 'approved'), review: s => spOpenPrs(s).some(p => p.review && (p.review.decision === 'required' || (!p.review.decision && p.review.asked))) };
  const SP_PRS_SAY = { mine: 'a PR at your move', open: 'a PR open', changes: 'changes requested', unresolved: 'threads left open', approved: 'approved', review: 'awaiting review' };
  const spTypes = s => [...new Set(spRows(s).map(r => spKind(r).toLowerCase()))];
  function spTokTest(t) {
    const m = /^(is|pr):(\w+)$/.exec(t); if (m) return (m[1] === 'is' ? SP_IS : SP_PRS)[m[2]] || null;
    if (/^@\S+$/.test(t)) { const w = t.slice(1).toLowerCase(); return s => spTypes(s).some(k => k.startsWith(w)); }
    if (/^#\S+$/.test(t)) { const w = t.slice(1).toLowerCase(); return s => String(s.project || '').toLowerCase().includes(w); }
    return null;
  }
  const spOn = () => !!(spQuery() || sp.toks.length);
  const spTokOk = s => sp.toks.every(t => spTokTest(t)?.(s) ?? true);
  const spFields = s => [...chatFields(s), spFolder(s), [...new Set(spRows(s).map(spKind))].join(' ')];
  function spChats() {
    const p = projectList().find(x => x.key === prefs.project), off = spOff(), rank = ['fav', ...Object.keys(SP_ST)], by = {}, q = spQuery();
    if (q) return (p?.sessions || []).filter(spTokOk).map(s => [s, fuzzy(spFields(s), q)]).filter(([, m]) => m).map(([s, m]) => [s, m.score * (s.done ? .5 : 1)])
      .sort((a, b) => b[1] - a[1] || byWord(a[0], b[0])).map(([s]) => s);
    if (sp.toks.length) { const at = Object.keys(SP_ST); return (p?.sessions || []).filter(spTokOk).sort((a, b) => at.indexOf(spState(a)) - at.indexOf(spState(b)) || byWord(a, b)); }   // filters alone: every state, by state
    for (const s of p?.sessions || []) { const k = spCat(s); if (!off.includes(k)) (by[k] ||= []).push(s); }
    const shown = rank.flatMap(k => (by[k] || []).sort(byWord).slice(0, k === 'idle' || k === 'done' ? SP_CAP : Infinity));
    // laid out (2026-11-24, `prefs.spArrange`): by state as above; by the last word, the favourites still first; by project,
    // a run per project — the one with the newest word first —, by state inside it
    if (spArr() === 'word') return [...shown.filter(s => s.fav), ...shown.filter(s => !s.fav).sort(byWord)];
    if (spArr() === 'project') {
      const runs = new Map(); for (const s of shown) { const k = s.project || '—'; if (!runs.has(k)) runs.set(k, []); runs.get(k).push(s); }
      const newest = r => r.reduce((a, s) => (wordAt(s) > a ? wordAt(s) : a), '');
      return [...runs.values()].sort((a, b) => newest(b).localeCompare(newest(a))).flat();
    }
    return shown;
  }
  const spArr = () => ['state', 'project', 'word'].includes(prefs.spArrange) && !spOn() ? prefs.spArrange : 'state';
  const SP_STAR = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.6l1.95 3.95 4.36.63-3.16 3.08.75 4.34L8 11.55l-3.9 2.05.75-4.34L1.69 6.18l4.36-.63z"/></svg>';
  function setFav(id, on) {
    const show = v => { const s = state.sessions.get(id); if (s) { s.fav = v; renderSpace(); } };
    if (on && spOff().includes('fav')) { prefs.spOff = spOff().filter(k => k !== 'fav'); savePrefs(); }   // a star just given never hides its node
    show(on);
    api('POST', `/api/sessions/${id}/favorite`, { on }).catch(e => {
      show(!on);
      note($('#space'), `Could not ${on ? 'star' : 'unstar'} it: ${e.message}`, true);   // a server started before this has no such route: api() says so (e.old)
    });
  }
  function spShut(key) { clearTimeout(sp.open.get(key)); sp.open.delete(key); }
  function spOpen(key) {
    clearTimeout(sp.open.get(key));
    sp.open.set(key, setTimeout(function fold() {
      const id = key.slice(0, key.indexOf(':')), tile = [...document.querySelectorAll('#spgrid .spt')].find(t => t.dataset.id === id);
      if (tile?.matches(':hover')) return sp.open.set(key, setTimeout(fold, 3000));
      sp.open.delete(key); renderSpace();
    }, window.peixSpOpenMs ?? SP_OPEN_MS));
  }
  function renderSpace() {
    sp.raf = 0;
    if (!prefs.space) return;
    const p = projectList().find(x => x.key === prefs.project), pool = p?.sessions || [], list = sp.list = spChats(), off = spOff();
    $('#main').classList.toggle('spfull', !state.current);
    const favs = pool.filter(s => s.fav).length, q = spOn(), sel = sp.sel = Math.max(0, Math.min(sp.sel, list.length - 1));
    // while a search is typed the chips count its matches, every state in: they filter again once it is cleared
    setHtml($('#spfs'), (favs && !q ? `<button type="button" class="spf fav" data-k="fav" aria-pressed="${!off.includes('fav')}" title="Your starred chats, first, whatever their state">${SP_STAR}Favorites<b>${favs}</b></button>` : '')
      + Object.keys(SP_ST).map(k => `<button type="button" class="spf" data-k="${k}" data-st="${k}" aria-pressed="${q ? true : !off.includes(k)}"${q ? ' disabled title="Every state, while a search is typed"' : ''}><i></i>${SP_ST[k]}<b>${(q ? list : pool.filter(s => !s.fav)).filter(s => spState(s) === k).length}</b></button>`).join(''));
    $('#spqn').textContent = !q ? '' : list.length ? `${sel + 1} of ${list.length}` : 'none';
    setHtml($('#spsub'), `${spCount(list.length, 'chat')} · ${spCount(list.reduce((n, s) => n + spRows(s).length, 0), 'agent')}`);
    // a node keeps its element while its markup is the same, so its arcs turn on through every redraw
    const grid = $('#spgrid'), had = new Map([...grid.children].map(e => [e.dataset.id, e])), tpl = document.createElement('template'), keys = document.activeElement?.closest?.('#spgrid .spt')?.dataset.id;
    let prev = null, made = false, i = 0;
    const byProj = spArr() === 'project', items = [];
    for (const s of list) {
      if (byProj && (!items.length || items.at(-1).s?.project !== s.project)) { const n = list.filter(c => c.project === s.project).length, color = repoColor(s.cwd);
        items.push({ id: `h:${s.project}`, html: `<div class="sphead" data-id="h:${esc(s.project || '')}" role="heading" aria-level="3" style="${color ? `--repo:${color}` : ''}"><i></i>${esc(s.project || 'no folder')}<b>${n}</b></div>` }); }
      items.push({ id: s.id, s });
    }
    $('#spar').querySelectorAll('[data-arr]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.arr === spArr())));
    for (const it of items) {
      if (!it.s) { let el = had.get(it.id); had.delete(it.id); if (el?._drawn !== it.html) { tpl.innerHTML = it.html; const ne = tpl.content.firstElementChild; ne._drawn = it.html; if (el) el.replaceWith(ne); el = ne; } if ((prev ? prev.nextElementSibling : grid.firstElementChild) !== el) { if (prev) prev.after(el); else grid.prepend(el); } prev = el; continue; }
      const s = it.s;
      const hit = !!q && i++ === sel;
      const html = spNode(s); let el = had.get(s.id); had.delete(s.id);
      if (el?._drawn !== html) { tpl.innerHTML = html; const ne = tpl.content.firstElementChild; ne._drawn = html; if (el) el.replaceWith(ne); el = ne; made = true; }
      if ((prev ? prev.nextElementSibling : grid.firstElementChild) !== el) { if (prev) prev.after(el); else grid.prepend(el); }
      if (el.classList.contains('on') !== (s.id === state.current)) { el.classList.toggle('on', s.id === state.current); el.setAttribute('aria-current', String(s.id === state.current)); }
      if (el.classList.contains('hit') !== hit) el.classList.toggle('hit', hit);
      if (el.classList.contains('chosen') !== sp.chosen.has(s.id)) el.classList.toggle('chosen', sp.chosen.has(s.id));
      const first = !q && !byProj && !s.fav && !!prev?._fav;   // the first after the favourites starts a row; a search ranks them as the rest
      if (el.classList.contains('spfirst') !== first) el.classList.toggle('spfirst', first);
      el._fav = !!s.fav; prev = el;
    }
    for (const e of had.values()) e.remove();
    if (keys && document.activeElement === document.body) grid.querySelector(`.spt[data-id="${CSS.escape(keys)}"]`)?.focus();
    $('#spempty').hidden = !!list.length;
    $('#spempty').textContent = q ? `No chat matches “${[...sp.toks, sp.q.trim()].filter(Boolean).join(' ')}”. Esc clears it.` : 'No chat in the states picked above.';
    const lane = document.activeElement?.closest?.('#spside .splane')?.dataset.ag, side = $('#spside'), cur = state.sessions.get(state.current);
    side.hidden = !cur;
    const lanes = setHtml(side, spSide(cur)); if (lanes && lane) $(`#spside .splane[data-ag="${CSS.escape(lane)}"]`)?.focus();
    if (made || lanes) phaseAnims();   // a node or the lanes made anew: their pings and arcs onto the clock the old ones kept, no jump
    spZoomShow();
    spMinis(list);
    fillAges(grid);
    spTokDraw(); spBarDraw(list);
    spLinksSoon();
  }
