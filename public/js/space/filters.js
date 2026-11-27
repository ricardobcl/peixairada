// ---- the box's filters (2026-11-24): a word with a colon, an @ or a # is a filter — a chip once a space follows it —,
// the rest the fuzzy match; every filter must hold. is: a state or starred; pr: where its open PRs stand; @ an agent's
// type its claude ran; # its project. A prefix typed lists what it can be, each with how many chats it would keep.
const SP_IS = {
  asking: session => spState(session) === 'ask',
  working: session => spState(session) === 'work',
  watching: session => spState(session) === 'watch',
  ready: session => spState(session) === 'ready',
  idle: session => spState(session) === 'idle',
  done: session => spState(session) === 'done',
  star: session => !!session.fav,
};

const SP_IS_SAY = {
  asking: 'asking you',
  working: 'clauding',
  watching: 'watching',
  ready: 'ready',
  idle: 'idle',
  done: 'done',
  star: 'starred',
};

const SP_PRS = {
  mine: session => spOpenPrs(session).some(pr => pr.turn?.you),
  open: session => spOpenPrs(session).length > 0,
  changes: session => spOpenPrs(session).some(pr => pr.review?.decision === 'changes'),
  unresolved: session => spOpenPrs(session).some(pr => pr.review?.open > 0),
  approved: session => spOpenPrs(session).some(pr => pr.review?.decision === 'approved'),
  review: session =>
    spOpenPrs(session).some(
      pr => pr.review && (pr.review.decision === 'required' || (!pr.review.decision && pr.review.asked)),
    ),
};

const SP_PRS_SAY = {
  mine: 'a PR at your move',
  open: 'a PR open',
  changes: 'changes requested',
  unresolved: 'threads left open',
  approved: 'approved',
  review: 'awaiting review',
};

const spTypes = session => [...new Set(spRows(session).map(row => spKind(row).toLowerCase()))];

function spTokTest(token) {
  const match = /^(is|pr):(\w+)$/.exec(token);

  if (match) return (match[1] === 'is' ? SP_IS : SP_PRS)[match[2]] || null;

  if (/^@\S+$/.test(token)) {
    const prefix = token.slice(1).toLowerCase();

    return session => spTypes(session).some(kind => kind.startsWith(prefix));
  }

  if (/^#\S+$/.test(token)) {
    const prefix = token.slice(1).toLowerCase();

    return session =>
      String(session.project || '')
        .toLowerCase()
        .includes(prefix);
  }

  return null;
}

const spOn = () => !!(spQuery() || sp.toks.length);
const spTokOk = session => sp.toks.every(token => spTokTest(token)?.(session) ?? true);

const spFields = session => [
  ...chatFields(session),
  spFolder(session),
  [...new Set(spRows(session).map(spKind))].join(' '),
];

function spChats() {
  const project = projectList().find(candidate => candidate.key === prefs.project);
  const off = spOff();
  const rank = ['fav', ...Object.keys(SP_ST)];
  const by = {};
  const query = spQuery();

  if (query) {
    return (project?.sessions || [])
      .filter(spTokOk)
      .map(session => [session, fuzzy(spFields(session), query)])
      .filter(([, match]) => match)
      .map(([session, match]) => [session, match.score * (session.done ? 0.5 : 1)])
      .sort((left, right) => right[1] - left[1] || byWord(left[0], right[0]))
      .map(([session]) => session);
  }

  if (sp.toks.length) {
    const at = Object.keys(SP_ST);

    return (project?.sessions || [])
      .filter(spTokOk)
      .sort((left, right) => at.indexOf(spState(left)) - at.indexOf(spState(right)) || byWord(left, right));
  } // filters alone: every state, by state

  for (const session of project?.sessions || []) {
    const category = spCat(session);

    if (!off.includes(category)) (by[category] ||= []).push(session);
  }

  const shown = rank.flatMap(category =>
    (by[category] || []).sort(byWord).slice(0, category === 'idle' || category === 'done' ? SP_CAP : Infinity),
  );

  // laid out (2026-11-24, `prefs.spArrange`): by state as above; by the last word, the favourites still first; by project,
  // a run per project — the one with the newest word first —, by state inside it
  if (spArr() === 'word') {
    return [...shown.filter(session => session.fav), ...shown.filter(session => !session.fav).sort(byWord)];
  }

  if (spArr() === 'project') {
    const runs = new Map();

    for (const session of shown) {
      const name = session.project || '—';

      if (!runs.has(name)) runs.set(name, []);
      runs.get(name).push(session);
    }

    const newest = run => run.reduce((latest, session) => (wordAt(session) > latest ? wordAt(session) : latest), '');

    return [...runs.values()].sort((left, right) => newest(right).localeCompare(newest(left))).flat();
  }

  return shown;
}

const spArr = () => (['state', 'project', 'word'].includes(prefs.spArrange) && !spOn() ? prefs.spArrange : 'state');

const SP_STAR =
  '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.6l1.95 3.95 4.36.63-3.16 3.08.75 4.34L8 11.55l-3.9 2.05.75-4.34L1.69 6.18l4.36-.63z"/></svg>';

function setFav(id, on) {
  const show = starred => {
    const session = state.sessions.get(id);

    if (session) {
      session.fav = starred;
      renderSpace();
    }
  };

  if (on && spOff().includes('fav')) {
    prefs.spOff = spOff().filter(category => category !== 'fav');
    savePrefs();
  } // a star just given never hides its node

  show(on);

  api('POST', `/api/sessions/${id}/favorite`, { on }).catch(error => {
    show(!on);
    note($('#space'), `Could not ${on ? 'star' : 'unstar'} it: ${error.message}`, true); // a server started before this has no such route: api() says so (e.old)
  });
}

function spShut(key) {
  clearTimeout(sp.open.get(key));
  sp.open.delete(key);
}

function spOpen(key) {
  clearTimeout(sp.open.get(key));

  sp.open.set(
    key,
    setTimeout(function fold() {
      const id = key.slice(0, key.indexOf(':'));
      const tile = [...document.querySelectorAll('#spgrid .spt')].find(node => node.dataset.id === id);

      if (tile?.matches(':hover')) return sp.open.set(key, setTimeout(fold, 3000));
      sp.open.delete(key);
      renderSpace();
    }, window.peixSpOpenMs ?? SP_OPEN_MS),
  );
}

function renderSpace() {
  sp.raf = 0;
  if (!prefs.space) return;

  const project = projectList().find(candidate => candidate.key === prefs.project);
  const pool = project?.sessions || [];
  const list = (sp.list = spChats());
  const off = spOff();

  $('#main').classList.toggle('spfull', !state.current);

  const favs = pool.filter(session => session.fav).length;
  const searching = spOn();
  const sel = (sp.sel = Math.max(0, Math.min(sp.sel, list.length - 1)));

  // while a search is typed the chips count its matches, every state in: they filter again once it is cleared
  setHtml(
    $('#spfs'),
    (favs && !searching
      ? `<button type="button" class="spf fav" data-k="fav" aria-pressed="${!off.includes('fav')}" title="Your starred chats, first, whatever their state">${SP_STAR}Favorites<b>${favs}</b></button>`
      : '') +
      Object.keys(SP_ST)
        .map(
          stateKey =>
            `<button type="button" class="spf" data-k="${stateKey}" data-st="${stateKey}" aria-pressed="${searching ? true : !off.includes(stateKey)}"${searching ? ' disabled title="Every state, while a search is typed"' : ''}><i></i>${SP_ST[stateKey]}<b>${(searching ? list : pool.filter(session => !session.fav)).filter(session => spState(session) === stateKey).length}</b></button>`,
        )
        .join(''),
  );

  $('#spqn').textContent = !searching ? '' : list.length ? `${sel + 1} of ${list.length}` : 'none';

  setHtml(
    $('#spsub'),
    `${spCount(list.length, 'chat')} · ${spCount(
      list.reduce((total, session) => total + spRows(session).length, 0),
      'agent',
    )}`,
  );

  // a node keeps its element while its markup is the same, so its arcs turn on through every redraw
  const grid = $('#spgrid');
  const had = new Map([...grid.children].map(child => [child.dataset.id, child]));
  const tpl = document.createElement('template');
  const keys = document.activeElement?.closest?.('#spgrid .spt')?.dataset.id;

  let prev = null;
  let made = false;
  let index = 0;

  const byProj = spArr() === 'project';
  const items = [];

  for (const session of list) {
    if (byProj && (!items.length || items.at(-1).s?.project !== session.project)) {
      const count = list.filter(other => other.project === session.project).length;
      const color = repoColor(session.cwd);

      items.push({
        id: `h:${session.project}`,
        html: `<div class="sphead" data-id="h:${esc(session.project || '')}" role="heading" aria-level="3" style="${color ? `--repo:${color}` : ''}"><i></i>${esc(session.project || 'no folder')}<b>${count}</b></div>`,
      });
    }

    items.push({ id: session.id, s: session });
  }

  $('#spar')
    .querySelectorAll('[data-arr]')
    .forEach(button => button.setAttribute('aria-pressed', String(button.dataset.arr === spArr())));

  for (const it of items) {
    if (!it.s) {
      let el = had.get(it.id);

      had.delete(it.id);

      if (el?._drawn !== it.html) {
        tpl.innerHTML = it.html;
        const ne = tpl.content.firstElementChild;

        ne._drawn = it.html;
        if (el) el.replaceWith(ne);
        el = ne;
      }

      if ((prev ? prev.nextElementSibling : grid.firstElementChild) !== el) {
        if (prev) prev.after(el);
        else grid.prepend(el);
      }

      prev = el;
      continue;
    }

    const session = it.s;
    const hit = !!searching && index++ === sel;
    const html = spNode(session);
    let el = had.get(session.id);

    had.delete(session.id);

    if (el?._drawn !== html) {
      tpl.innerHTML = html;
      const ne = tpl.content.firstElementChild;

      ne._drawn = html;
      if (el) el.replaceWith(ne);
      el = ne;
      made = true;
    }

    if ((prev ? prev.nextElementSibling : grid.firstElementChild) !== el) {
      if (prev) prev.after(el);
      else grid.prepend(el);
    }

    if (el.classList.contains('on') !== (session.id === state.current)) {
      el.classList.toggle('on', session.id === state.current);
      el.setAttribute('aria-current', String(session.id === state.current));
    }

    if (el.classList.contains('hit') !== hit) el.classList.toggle('hit', hit);

    if (el.classList.contains('chosen') !== sp.chosen.has(session.id)) {
      el.classList.toggle('chosen', sp.chosen.has(session.id));
    }

    const first = !searching && !byProj && !session.fav && !!prev?._fav; // the first after the favourites starts a row; a search ranks them as the rest

    if (el.classList.contains('spfirst') !== first) el.classList.toggle('spfirst', first);
    el._fav = !!session.fav;
    prev = el;
  }

  for (const stale of had.values()) stale.remove();

  if (keys && document.activeElement === document.body) {
    grid.querySelector(`.spt[data-id="${CSS.escape(keys)}"]`)?.focus();
  }

  $('#spempty').hidden = !!list.length;

  $('#spempty').textContent = searching
    ? `No chat matches “${[...sp.toks, sp.q.trim()].filter(Boolean).join(' ')}”. Esc clears it.`
    : 'No chat in the states picked above.';

  const lane = document.activeElement?.closest?.('#spside .splane')?.dataset.ag;
  const side = $('#spside');
  const cur = state.sessions.get(state.current);

  side.hidden = !cur;
  const lanes = setHtml(side, spSide(cur));

  if (lanes && lane) $(`#spside .splane[data-ag="${CSS.escape(lane)}"]`)?.focus();
  if (made || lanes) phaseAnims(); // a node or the lanes made anew: their pings and arcs onto the clock the old ones kept, no jump
  spZoomShow();
  spMinis(list);
  fillAges(grid);
  spTokDraw();
  spBarDraw(list);
  spLinksSoon();
}
