function renderSessionList(project) {
  const pc = projColor(project);
  const box = $('#sessions');

  if (pc) box.style.setProperty('--repo', pc);
  else box.style.removeProperty('--repo');
  // The magnifier matches the way ⌥⌘K does (2026-09-25): any letters
  // in order, each word within one of the chat's fields, and the best match leads — so with something typed the list
  // is in the match's order, not the board's, and the lines that say where a state or a day ends are left out.
  const query = $('#q').value.trim().toLowerCase();
  const score = new Map();

  // a filter (FILTERS) narrows the list before anything else counts it, and shows every match, folded or not
  const flt = listFilter();
  const pool = flt ? project.sessions.filter(flt.test) : project.sessions;

  // Top priority (2026-11-24, round XXX): its chats in your order, above every lane and out of them — on the list as it
  // stands and in focus (FILTERS.prio, the section alone), never under a query or another filter, which order by
  // something else. The project in view's alone (T5); a snoozed one keeps its slot out of sight (X1), in Snoozed.
  const focus = flt === FILTERS.prio;
  const sec = prioOn() && !query && (!flt || focus);
  const pIds = new Set(project.sessions.map(session => session.id));

  const secIds = new Set(sec ? state.priority.filter(id => pIds.has(id) && !asleep(state.sessions.get(id))) : []);
  const secZz = sec ? state.priority.filter(id => pIds.has(id) && asleep(state.sessions.get(id))).length : 0;
  const inView = session => !!(query || flt) || !laneShut(secIds.has(session.id) ? 'prio' : rankOf(session));
  const who = renderPeople(pool.filter(inView)) ? prefs.person : null; // may let go of a person no longer in view

  // the query and the face narrow the project's chats, not only the filter's — the funnel counts with them (2026-10-14)
  if (query) {
    for (const session of project.sessions) {
      const match = fuzzy(chatFields(session), query);

      if (match) score.set(session.id, match.score);
    }
  }

  const narrow = session => (!query || score.has(session.id)) && (!who || hasPerson(session, who));

  const list = pool.filter(narrow);

  const secCards = state.priority
    .map(id => secIds.has(id) && state.sessions.get(id))
    .filter(session => session && narrow(session));

  const rest = secIds.size ? list.filter(session => !secIds.has(session.id)) : list;
  const counts = {};

  for (const session of list) counts[bucket(session)] = (counts[bucket(session)] || 0) + 1;

  // clauding on top, then ready, done last (2026-09-20: one rule between the live cards and the ready ones, which
  // needs a group above it); inside each group your last touch, newest first. A finished job moves its card
  // into the ready group, where its last prompt puts it. That order is also how a query's ties are broken.
  // Snoozed by when each wakes, the soonest first, one waiting on something after (2026-11-24, round XXX's W1)
  const wakeOrder = (left, right) =>
    rankOf(left) !== 'snoozed'
      ? 0
      : String(left.snooze?.until || '~').localeCompare(String(right.snooze?.until || '~'));

  const board = (left, right) =>
    RANK[rankOf(left)] - RANK[rankOf(right)] || wakeOrder(left, right) || byWord(left, right);

  const ordered = rest
    .slice()
    .sort(query ? (left, right) => score.get(right.id) - score.get(left.id) || board(left, right) : board);

  const held = {};
  const seen = {}; // a long lane's newest LANE_CAP (laneMore lets one go), not under a query or a filter

  const shown = ordered.filter(inView).filter(session => {
    // a query shows every match, folded or not, and so does a filter
    const lane = rankOf(session);

    if (query || flt || !CAPPED.has(lane) || laneMore.has(lane)) return true;
    seen[lane] = (seen[lane] || 0) + 1;
    if (seen[lane] <= LANE_CAP || session.id === state.current) return true;
    held[lane] = (held[lane] || 0) + 1;
    return false;
  });

  // No ＋ since 2026-09-28: ⌥⌘N, which opens on
  // the project in view.
  const ranks = shown.map(rankOf);
  const every = ordered.map(rankOf); // a lane's head over each group (laneHtml), folded or not

  // …and a day's label over every run of cards from one day in a lane (2026-10-12; under it before, where it read as
  // the next run's): the lane's first card, and every card whose day is not the one before it — but never today's
  // (2026-10-14; a lane all today had none before): a lane's cards are newest first, so the cards over its first label
  // are today's, and the line it took is a card's room.
  const days = shown.map(dayName);
  const inLane = {};

  for (const lane of every) inLane[lane] = (inLane[lane] || 0) + 1;
  // the timeline's runs: the cards of one day *and* one state group in a row — none while a query orders the list
  tl.runs = [];
  const secOpen = sec && (focus || !laneShut('prio')) && secCards.length; // the section's cards come first in the list: one run of their own

  if (secOpen) tl.runs.push({ g: 'prio', day: '', at: wordAt(secCards[0]), i: 0, n: secCards.length });
  const k0 = secOpen ? secCards.length : 0;

  if (!query && !focus) {
    shown.forEach((session, index) => {
      const run = tl.runs[tl.runs.length - 1];

      if (run && run.g === ranks[index] && run.day === days[index]) run.n++;
      else tl.runs.push({ g: ranks[index], day: days[index], at: wordAt(session), i: index + k0, n: 1 });
    });
  }

  const dayBefore = index =>
    !query &&
    days[index] &&
    days[index] !== 'Today' &&
    (index === 0 || ranks[index - 1] !== ranks[index] || days[index - 1] !== days[index])
      ? dayHtml(days[index])
      : '';

  // All caught up (2026-10-11): nothing in the project waits on you — no question and no ready chat — while the list
  // still holds something (the clauding, the idle, the done): a still head where the Ready lane goes, before the idle
  // and done lanes. Not under a filter, which is about something else.
  const zero =
    !query && !flt && !list.some(session => ['asking', 'ready'].includes(rankOf(session))) && list.length > 0;

  const items = [];

  // the section's head tallies what its cards do, since nothing sorts them by it (T4), and what is ticked in it (D2)
  // none pinned (2026-11-25), no section: but in focus, and while a card is held, a place to drop it (zone, cdLift's)
  if (sec && (secCards.length || secZz || focus || renderSessionList.zone)) {
    const pinned = secCards.length;
    const done = secCards.filter(session => session.done).length;
    const live = secCards.filter(session => !session.done);

    const ask = live.filter(asking).length;
    const work = live.filter(session => bucket(session) === 'working').length;

    const bits = [
      ask ? `<em>${ask} asking</em>` : '',
      work ? `<u>${work} clauding</u>` : '',
      secZz ? `+${secZz} snoozed` : '',
    ].filter(Boolean);

    const extra =
      (bits.length ? `<span class="tally">${bits.join(' · ')}</span>` : '') +
      (done
        ? `<span class="tally">${done} of ${pinned} done <button type="button" class="clr" title="Unpin the ticked chats">Clear done</button></span>`
        : '');

    const shut = !focus && laneShut('prio');

    items.push({ key: 'lane:prio', html: laneHtml('prio', pinned, shut, focus, extra) });

    if (!shut && !pinned) {
      items.push({
        key: 'prio:empty',
        html: `<div class="gsep pempty" data-pempty>${secZz ? 'Every pinned chat is snoozed: each comes back to its place' : focus ? 'Nothing pinned — Show all, then a card’s pin or ⌥⌘I' : 'Drop a card here to pin it — or click its pin'}</div>`,
      });
    }

    if (!shut) {
      secCards.forEach((session, index) => items.push({ id: session.id, html: cardHtml(session, query, index) }));
    }
  }

  // The project in view (2026-11-04, round XXV): its tab atop the list, its name a click on ⌥⌘P's picker, how many of
  // the chats not done are here, and Show all; a chat asking you elsewhere is counted there, a click going to the one
  // waiting longest (a line over the lanes from 2026-10-12). Drawn inside drawCards, so the cards slide by its height.
  drawCards.cue = () => cueDraw(project, focus ? secCards : ordered, focus);

  if (query) shown.forEach(session => items.push({ id: session.id, html: cardHtml(session, query) }));
  else if (!focus) {
    for (const lane of new Set(every)) {
      // the lanes present, in rank order: each its head, then its cards unless folded
      if (zero && (lane === 'idle' || lane === 'done') && !items.some(item => item.html === ZERO_HTML)) {
        items.push({ html: ZERO_HTML });
      }

      // a lane's lines keyed by the lane (2026-11-01): its head one node, folded or not, and a day's line the lane's own
      items.push({ key: `lane:${lane}`, html: laneHtml(lane, inLane[lane], !flt && laneShut(lane), !!flt) });

      if (flt || !laneShut(lane)) {
        shown.forEach((session, index) => {
          if (ranks[index] !== lane) return;
          const dayLine = dayBefore(index);

          if (dayLine) items.push({ key: `day:${lane}:${days[index]}`, html: dayLine });
          items.push({ id: session.id, html: cardHtml(session, query) });
        });
      }

      if (held[lane] && !laneShut(lane)) items.push({ key: `more:${lane}`, html: moreHtml(lane, held[lane]) });
    }
  }

  if (zero && !items.some(item => item.html === ZERO_HTML)) items.push({ html: ZERO_HTML });

  if (project.key !== ALL && !query && items.length) {
    const othersLine = othersHtml(project);

    if (othersLine) items.push({ key: 'others', html: othersLine });
  }

  // An empty list (2026-10-11) is the home's fish, resting, over what is empty and the key that fills it — a bubble
  // now and then (the bar's own interval), nothing else moving.
  const [none, how] = query
    ? ['Nothing matches', 'another word, or Esc for every chat']
    : flt
      ? [flt.none, 'the funnel shows every chat again']
      : project.key !== ALL
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
  const opening = drawCards.opening;

  drawCards.opening = null;
  if (opening) openRun($('#slist'), opening.g, opening.lr, opening.gap); // a lane opened, its cards filled in
  caughtUp(zero);
  drawFilter(project, narrow);
  if (drawn) phaseAnims();
  markQsel();
  listChanged();
}
