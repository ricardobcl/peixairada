function renderSessionList(p) {
  const pc = projColor(p);
  const box = $('#sessions');

  if (pc) box.style.setProperty('--repo', pc);
  else box.style.removeProperty('--repo');
  // The magnifier matches the way ⌥⌘K does (2026-09-25): any letters
  // in order, each word within one of the chat's fields, and the best match leads — so with something typed the list
  // is in the match's order, not the board's, and the lines that say where a state or a day ends are left out.
  const q = $('#q').value.trim().toLowerCase();
  const score = new Map();

  // a filter (FILTERS) narrows the list before anything else counts it, and shows every match, folded or not
  const flt = listFilter();
  const pool = flt ? p.sessions.filter(flt.test) : p.sessions;

  // Top priority (2026-11-24, round XXX): its chats in your order, above every lane and out of them — on the list as it
  // stands and in focus (FILTERS.prio, the section alone), never under a query or another filter, which order by
  // something else. The project in view's alone (T5); a snoozed one keeps its slot out of sight (X1), in Snoozed.
  const focus = flt === FILTERS.prio;
  const sec = prioOn() && !q && (!flt || focus);
  const pIds = new Set(p.sessions.map(s => s.id));

  const secIds = new Set(sec ? state.priority.filter(id => pIds.has(id) && !asleep(state.sessions.get(id))) : []);
  const secZz = sec ? state.priority.filter(id => pIds.has(id) && asleep(state.sessions.get(id))).length : 0;
  const inView = s => !!(q || flt) || !laneShut(secIds.has(s.id) ? 'prio' : rankOf(s));
  const who = renderPeople(pool.filter(inView)) ? prefs.person : null; // may let go of a person no longer in view

  // the query and the face narrow the project's chats, not only the filter's — the funnel counts with them (2026-10-14)
  if (q) {
    for (const s of p.sessions) {
      const m = fuzzy(chatFields(s), q);

      if (m) score.set(s.id, m.score);
    }
  }

  const narrow = s => (!q || score.has(s.id)) && (!who || hasPerson(s, who));

  const list = pool.filter(narrow);
  const secCards = state.priority.map(id => secIds.has(id) && state.sessions.get(id)).filter(s => s && narrow(s));

  const rest = secIds.size ? list.filter(s => !secIds.has(s.id)) : list;
  const counts = {};

  for (const s of list) counts[bucket(s)] = (counts[bucket(s)] || 0) + 1;

  // clauding on top, then ready, done last (2026-09-20: one rule between the live cards and the ready ones, which
  // needs a group above it); inside each group your last touch, newest first. A finished job moves its card
  // into the ready group, where its last prompt puts it. That order is also how a query's ties are broken.
  // Snoozed by when each wakes, the soonest first, one waiting on something after (2026-11-24, round XXX's W1)
  const wakeOrder = (a, b) =>
    rankOf(a) !== 'snoozed' ? 0 : String(a.snooze?.until || '~').localeCompare(String(b.snooze?.until || '~'));

  const board = (a, b) => RANK[rankOf(a)] - RANK[rankOf(b)] || wakeOrder(a, b) || byWord(a, b);
  const ordered = rest.slice().sort(q ? (a, b) => score.get(b.id) - score.get(a.id) || board(a, b) : board);

  const held = {};
  const seen = {}; // a long lane's newest LANE_CAP (laneMore lets one go), not under a query or a filter

  const shown = ordered.filter(inView).filter(s => {
    // a query shows every match, folded or not, and so does a filter
    const g = rankOf(s);

    if (q || flt || !CAPPED.has(g) || laneMore.has(g)) return true;
    seen[g] = (seen[g] || 0) + 1;
    if (seen[g] <= LANE_CAP || s.id === state.current) return true;
    held[g] = (held[g] || 0) + 1;
    return false;
  });

  // No ＋ since 2026-09-28: ⌥⌘N, which opens on
  // the project in view.
  const b = shown.map(rankOf);
  const every = ordered.map(rankOf); // a lane's head over each group (laneHtml), folded or not

  // …and a day's label over every run of cards from one day in a lane (2026-10-12; under it before, where it read as
  // the next run's): the lane's first card, and every card whose day is not the one before it — but never today's
  // (2026-10-14; a lane all today had none before): a lane's cards are newest first, so the cards over its first label
  // are today's, and the line it took is a card's room.
  const days = shown.map(dayName);
  const inLane = {};

  for (const g of every) inLane[g] = (inLane[g] || 0) + 1;
  // the timeline's runs: the cards of one day *and* one state group in a row — none while a query orders the list
  tl.runs = [];
  const secOpen = sec && (focus || !laneShut('prio')) && secCards.length; // the section's cards come first in the list: one run of their own

  if (secOpen) tl.runs.push({ g: 'prio', day: '', at: wordAt(secCards[0]), i: 0, n: secCards.length });
  const k0 = secOpen ? secCards.length : 0;

  if (!q && !focus) {
    shown.forEach((s, i) => {
      const r = tl.runs[tl.runs.length - 1];

      if (r && r.g === b[i] && r.day === days[i]) r.n++;
      else tl.runs.push({ g: b[i], day: days[i], at: wordAt(s), i: i + k0, n: 1 });
    });
  }

  const dayBefore = i =>
    !q && days[i] && days[i] !== 'Today' && (i === 0 || b[i - 1] !== b[i] || days[i - 1] !== days[i])
      ? dayHtml(days[i])
      : '';

  // All caught up (2026-10-11): nothing in the project waits on you — no question and no ready chat — while the list
  // still holds something (the clauding, the idle, the done): a still head where the Ready lane goes, before the idle
  // and done lanes. Not under a filter, which is about something else.
  const zero = !q && !flt && !list.some(s => ['asking', 'ready'].includes(rankOf(s))) && list.length > 0;
  const items = [];

  // the section's head tallies what its cards do, since nothing sorts them by it (T4), and what is ticked in it (D2)
  // none pinned (2026-11-25), no section: but in focus, and while a card is held, a place to drop it (zone, cdLift's)
  if (sec && (secCards.length || secZz || focus || renderSessionList.zone)) {
    const n = secCards.length;
    const done = secCards.filter(s => s.done).length;
    const live = secCards.filter(s => !s.done);

    const ask = live.filter(asking).length;
    const work = live.filter(s => bucket(s) === 'working').length;

    const bits = [
      ask ? `<em>${ask} asking</em>` : '',
      work ? `<u>${work} clauding</u>` : '',
      secZz ? `+${secZz} snoozed` : '',
    ].filter(Boolean);

    const extra =
      (bits.length ? `<span class="tally">${bits.join(' · ')}</span>` : '') +
      (done
        ? `<span class="tally">${done} of ${n} done <button type="button" class="clr" title="Unpin the ticked chats">Clear done</button></span>`
        : '');

    const shut = !focus && laneShut('prio');

    items.push({ key: 'lane:prio', html: laneHtml('prio', n, shut, focus, extra) });

    if (!shut && !n) {
      items.push({
        key: 'prio:empty',
        html: `<div class="gsep pempty" data-pempty>${secZz ? 'Every pinned chat is snoozed: each comes back to its place' : focus ? 'Nothing pinned — Show all, then a card’s pin or ⌥⌘I' : 'Drop a card here to pin it — or click its pin'}</div>`,
      });
    }

    if (!shut) secCards.forEach((s, i) => items.push({ id: s.id, html: cardHtml(s, q, i) }));
  }

  // The project in view (2026-11-04, round XXV): its tab atop the list, its name a click on ⌥⌘P's picker, how many of
  // the chats not done are here, and Show all; a chat asking you elsewhere is counted there, a click going to the one
  // waiting longest (a line over the lanes from 2026-10-12). Drawn inside drawCards, so the cards slide by its height.
  drawCards.cue = () => cueDraw(p, focus ? secCards : ordered, focus);

  if (q) shown.forEach(s => items.push({ id: s.id, html: cardHtml(s, q) }));
  else if (!focus) {
    for (const g of new Set(every)) {
      // the lanes present, in rank order: each its head, then its cards unless folded
      if (zero && (g === 'idle' || g === 'done') && !items.some(x => x.html === ZERO_HTML)) {
        items.push({ html: ZERO_HTML });
      }

      // a lane's lines keyed by the lane (2026-11-01): its head one node, folded or not, and a day's line the lane's own
      items.push({ key: `lane:${g}`, html: laneHtml(g, inLane[g], !flt && laneShut(g), !!flt) });

      if (flt || !laneShut(g)) {
        shown.forEach((s, i) => {
          if (b[i] !== g) return;
          const a = dayBefore(i);

          if (a) items.push({ key: `day:${g}:${days[i]}`, html: a });
          items.push({ id: s.id, html: cardHtml(s, q) });
        });
      }

      if (held[g] && !laneShut(g)) items.push({ key: `more:${g}`, html: moreHtml(g, held[g]) });
    }
  }

  if (zero && !items.some(x => x.html === ZERO_HTML)) items.push({ html: ZERO_HTML });

  if (p.key !== ALL && !q && items.length) {
    const o = othersHtml(p);

    if (o) items.push({ key: 'others', html: o });
  }

  // An empty list (2026-10-11) is the home's fish, resting, over what is empty and the key that fills it — a bubble
  // now and then (the bar's own interval), nothing else moving.
  const [none, how] = q
    ? ['Nothing matches', 'another word, or Esc for every chat']
    : flt
      ? [flt.none, 'the funnel shows every chat again']
      : p.key !== ALL
        ? ['No chats in this project', 'Show all, up top, or ⌥⌘N starts one']
        : ['No chats yet', '⌥⌘N starts one'];

  const drawn = drawCards(
    items,
    `<div class="none"><span class="nfish">${REST_FISH}</span><b>${esc(none)}</b><span>${esc(how)}</span></div>`,
  );

  fillLive($('#slist'));
  fillAges($('#slist'));
  fillAgents();
  fadeSoon(); // the live line first: a wake-up's is an age to fill
  const o = drawCards.opening;

  drawCards.opening = null;
  if (o) openRun($('#slist'), o.g, o.lr, o.gap); // a lane opened, its cards filled in
  caughtUp(zero);
  drawFilter(p, narrow);
  if (drawn) phaseAnims();
  markQsel();
  listChanged();
}
