// ---- Pinned and snooze (2026-11-24, round XXX) -----------------------------------------------------------------------
// Pinned (Top priority till 2026-11-25; `prio` in the code): a section above every lane holding the chats you pin, in
// your order — the one order on the board nothing changes by itself. A word, a reply, a PR come round leave a card in its slot; its edge says what it does. One
// order for the board, the server's (state.priority, PUT /api/priority, carried to the new id over a /clear), shown for
// the project in view; the section's switch is this page's (prefs.prio, Settings › Chat list), on since 2026-11-25,
// none pinned no section. Focus is the funnel's second row (FILTERS.prio, ⌥⌘U): the section alone, the project tab
// saying so, the rest quiet as when fishing but for questions.
// Snooze: a chat put away till a time or till something happens (the server's `snooze`, which it ends): in the Snoozed
// lane, folded, counted nowhere; a question from it or a word of yours wakes it. Back by itself it is at the top of its
// lane (wordAt takes `wokeAt`), marked back and counted a new reply till you open it, with one banner.
const prioOn = () => !!prefs.prio;
const inPrio = session => !!session && prioOn() && state.priority.includes(session.id);
const asleep = session => !!session?.snooze && !session.done;
const back = session => !!session.wokeAt && !session.snooze && session.wokeAt > (session.seenAt || '');
const prioFocus = () => prioOn() && prefs.listFilter === 'prio';
// The model Claude last answered with is the one the chat runs on: `claude-fable-5-1`, `claude-fable-5[1m]`… mark
// the card (2026-09-27).
const onFable = session => /fable/i.test(session.model || '');
const watching = session => !session.done && (session.tasks?.length || 0) > 0;

// The ✓ is offered once nothing runs — an idle claude or none — on a chat the board has a time for: the card's
// and the chats step's (2026-09-28), one rule, since ticking one that runs would end it mid-turn.
const canTick = session =>
  (!session.alive || session.status === 'idle') && !!(session.lastActivity || session.startedAt);

// The list's order, and the ⌥⌘K picker's (2026-09-21): a chat waiting on *your* answer first — it costs you a
// second and unblocks a whole turn — then clauding, then ready, done last. The filters and the counts still go by
// `bucket`, so an asking chat is a ready one everywhere it is counted; only the order knows the difference.
// Ready while you were in it within the last four days (today and the three before), Idle past that, folded to
// begin with (2026-10-12: the board had 106 ready chats, 77 of them untouched for a week). A PR at your move and a
// reply the board has not shown you were lanes of their own above Clauding that morning, and are a filter of the
// list since (FILTERS): the main view is the clauding chats first and the rest by their last word.
// Watching after Clauding (2026-10-31, round XIII): a chat with work out behind the turn — a monitor, a command left
// running — is a rank of its own, the counts still `bucket()`'s.
// Snoozed last (2026-11-24, round XXX's W1): put away till a time or something happens, folded, counted nowhere.
const RANK = { asking: 0, working: 1, watching: 2, ready: 3, idle: 4, done: 5, snoozed: 6 };
const IDLE_DAYS = 3; // the days before today a chat stays Ready

const yourMove = session =>
  !session.forGood &&
  (session.prs || []).some(pr => pr.turn?.you && (pr.state === 'open' || pr.state === 'draft' || !pr.state));

// a reply after the board last showed the chat (`seenAt`, the server's, kept in its state file)
// …or back from a snooze since (2026-11-24, round XXX's H2): marked back, and counted as one, till you open it
const replied = session =>
  back(session) ||
  (!!session.seenAt &&
    !!session.lastReplyAt &&
    session.lastReplyAt >= (session.lastUserAt || '') &&
    session.lastReplyAt > session.seenAt);

const idleSince = () => {
  const date = new Date();

  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - IDLE_DAYS);
  return date.toISOString();
};

// Watching, whatever its age: a live claude with work out behind the turn, nothing more pressing — a question beats a
// watch, work beats it too, as the ring ranks them; but a turn the chat's own task notice woke (the server's `woken`)
// stays, so a chatty monitor does not bounce the card a lane on every event. Your word or the last task ending moves it.
// A wake-up it set itself is a watch too (2026-10-31, later: ScheduleWakeup, CronCreate — the server's `wake`, gone once
// its turn comes or its time is well past).
const inWatch = session =>
  !session.done &&
  session.alive &&
  ((session.tasks?.length || 0) > 0 || !!session.wake) &&
  (session.status !== 'working' || (session.woken && !session.agents));

const rankOf = session => {
  const group = bucket(session);

  return asking(session)
    ? 'asking'
    : asleep(session)
      ? 'snoozed'
      : inWatch(session)
        ? 'watching'
        : group !== 'ready'
          ? group
          : wordAt(session) < idleSince()
            ? 'idle'
            : 'ready';
};

// What Done would end on a watching chat — the ✓ names it and asks once more (tickGate) —, or ''.
const watchEnds = session =>
  !inWatch(session)
    ? ''
    : [
        ...(session.tasks || []).map(
          task => `${task.kind === 'monitor' ? 'monitor' : 'running'}${task.what ? ` · ${task.what}` : ''}`,
        ),
        ...(session.wake ? [`the wake-up at ${hhmm(session.wake.at)}`] : []),
      ].join(' and ');

// a time of day as the board writes one, and how far off it is (a wake-up's: `data-in`, written by fillAges)
const hhmm = ts => {
  const date = new Date(ts);

  return isNaN(date) ? '' : `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};

// when a snooze ends, as the card and the menu say it (2026-11-24, round XXX): `14:30`, `tomorrow 09:00`, `Tue 09:00`, a date
const WD3 = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const whenSay = ts => {
  const date = new Date(ts);

  if (isNaN(date)) return '';
  const days = Math.round((new Date(date).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86_400_000);

  return days === 0
    ? hhmm(date)
    : days === 1
      ? `tomorrow ${hhmm(date)}`
      : days > 1 && days < 7
        ? `${WD3[date.getDay()]} ${hhmm(date)}`
        : `${fmtDate(date)} ${hhmm(date)}`;
};

const prLabelOf = url => {
  for (const session of state.sessions.values()) {
    const pr = (session.prs || []).find(chatPr => chatPr.url === url);

    if (pr) return pr.label.replace(/^.*?#/, '#');
  }

  return 'its PR';
};

const ZZ_ON = {
  pr: snooze => `when ${prLabelOf(snooze.pr)} comes round`,
  ci: () => 'when its checks finish',
  reply: () => 'when Claude replies',
  mon: () => 'when its monitor ends',
};

const snoozeSay = snooze =>
  !snooze
    ? ''
    : [snooze.until ? `till ${whenSay(snooze.until)}` : '', snooze.on ? ZZ_ON[snooze.on]?.(snooze) || '' : '']
        .filter(Boolean)
        .join(' or ');

const ordinal = number =>
  number +
  (number % 10 === 1 && number % 100 !== 11
    ? 'st'
    : number % 10 === 2 && number % 100 !== 12
      ? 'nd'
      : number % 10 === 3 && number % 100 !== 13
        ? 'rd'
        : 'th');

const relIn = ts => {
  const minutes = Math.round((new Date(ts) - Date.now()) / 60000);

  return !(minutes > 0)
    ? 'due now'
    : minutes < 60
      ? `in ${minutes} min`
      : `in ${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${minutes % 60} min` : ''}`;
};

const tickArmed = new Map();
const armedOn = id => (tickArmed.get(id) || 0) > performance.now(); // chat id → until when its ✓ is armed

const delArmed = new Map();
const delArmedOn = id => (delArmed.get(id) || 0) > performance.now(); // …and its ✕ (2026-11-04)

const DEL_TIP = '⌥-click: delete from the board — its claude ends, the transcript stays';

// The list's filters (2026-10-12, prefs.listFilter, the funnel beside the magnifier): the ready chats with a new reply.
// Done chats never. A PR at your move was one till 2026-11-25. …and Top priority only (2026-11-24, round XXX's F1), while
// the section is on (`on`): the list is the section alone. A snoozed chat is in none of them (W4).
const FILTERS = {
  replied: {
    name: 'New replies',
    none: 'No new replies',
    tip: 'chats Claude answered since you last looked',
    test: session => bucket(session) === 'ready' && !asleep(session) && replied(session),
  },
  prio: {
    name: 'Pinned only',
    none: 'Nothing pinned',
    tip: 'the chats you pinned, in your order',
    on: prioOn,
    test: session => inPrio(session) && !asleep(session),
  },
};

const filterList = () => Object.entries(FILTERS).filter(([, filter]) => !filter.on || filter.on());

const listFilter = () => {
  const filter = FILTERS[prefs.listFilter];

  return filter && (!filter.on || filter.on()) ? filter : null;
};

// the cards large with cards by lane on: a chat asking you, clauding, at your move or with a new reply
const roomy = session =>
  asking(session) ||
  bucket(session) === 'working' ||
  (bucket(session) !== 'done' && !asleep(session) && yourMove(session)) ||
  FILTERS.replied.test(session);

// What the filters and the pickers search, as separate fields: the picker's matcher hunts each word *within* one
// of them, so `wapi` has to be somewhere in the project or the branch and cannot be spelled out of letters
// borrowed from a title and a prompt (2026-09-21). Short and identifying first — ties go to the earlier field.
// A chat's PRs and tickets are one, as their chips name them (2026-10-14): `650` finds the chat on `widgets#650`
// however long ago it was mentioned — the last prompt holds it only while it is the last.
const chatIds = session => [
  ...(session.prs || []).map(pr => pr.label),
  ...(session.tickets || []).map(ticket => ticket.key),
];

const chatFields = session => [
  session.title,
  session.project,
  session.gitBranch || '',
  chatIds(session).join(' '),
  session.aiTitle || '',
  session.lastPrompt || '',
  session.live?.name || '',
  session.agent ? `@${agentShort(session.agent)} ${session.agent}` : '',
];

/** A picker row's word on why it matched: the PRs and tickets that hold a word of the query as typed (a web address
 *  as wordIn finds it), its letters bolded — the title alone does not say why `650` found it. Two at most, then a count. */
function idsHit(session, query) {
  const holds = (id, word) => (URL_WORD.test(word) ? !!wordIn(id, word) : id.includes(word));

  const words = query.split(/\s+/).filter(Boolean);
  const hit = words.length ? chatIds(session).filter(id => words.some(word => holds(id.toLowerCase(), word))) : [];

  return hit.length
    ? `<span class="cur ids">${hit
        .slice(0, 2)
        .map(id => markHits(id, query))
        .join(' · ')}${hit.length > 2 ? ` +${hit.length - 2}` : ''}</span>`
    : '';
}

// What a done chat's match is worth in ⌥⌘K (2026-11-03): half, so the chats you jump between keep the top and a done
// one leads only where it matches clearly better (on the real board: `wallet` the open chats first, `cloudflare` the
// done chat of that name, over open ones that only scatter its letters). Not when the box is its PR's number or name, or
// its ticket's key: `650` wants widgets#650, done or not, before an open chat on widgets#16501.
const DONE_WORTH = 0.5;

const doneWorth = (session, query) =>
  !session.done ||
  chatIds(session).some(id => {
    id = id.toLowerCase();
    return id === query || id.endsWith(`#${query}`);
  })
    ? 1
    : DONE_WORTH;

// Pinned projects first, in your order (state.pins — server state, so every browser and the app agree),
// then the named ones, then folders by their newest chat. A pinned folder shows even with no chat in view.
function projectList() {
  const all = { key: ALL, name: 'ALL', cwds: [], sessions: [] };
  const folders = new Map();

  const customs = state.projects.map(project => ({
    key: `c:${project.id}`,
    id: project.id,
    name: project.name,
    cwds: project.cwds,
    custom: true,
    sessions: [],
  }));

  for (const session of state.sessions.values()) {
    if (!visible(session)) continue;
    all.sessions.push(session);
    const key = projDir(session.cwd) || '?';

    if (!folders.has(key)) {
      folders.set(key, {
        key,
        name: folderName(projDir(session.cwd)),
        cwds: session.cwd ? [key] : [],
        sessions: [],
      });
    }

    folders.get(key).sessions.push(session);
    for (const custom of customs) if (inProject(session, custom)) custom.sessions.push(session);
  }

  for (const key of state.pins) {
    if (key.startsWith('/') && !folders.has(key)) {
      folders.set(key, { key, name: folderName(key), cwds: [key], sessions: [] });
    }
  }

  const stat = project => {
    const undone = project.sessions.filter(session => !session.done && !asleep(session)); // the same rule as the chips: not ticked is working or ready

    project.working = undone.filter(session => session.status === 'working').length;
    project.ready = undone.length - project.working; // a pending question is ready-for-you too, and so is a stale chat
    project.unread = project.sessions.reduce((sum, session) => sum + (state.unread.get(session.id) || 0), 0);

    project.last = project.sessions.reduce(
      (latest, session) => (wordAt(session) > latest ? wordAt(session) : latest),
      '',
    );

    return project;
  };

  const every = [...customs, ...folders.values()].map(stat).filter(project => !isHidden(project.key)); // ✕ in ⌥⌘N: off every list, pins included
  const pins = state.pins.map(key => every.find(project => project.key === key)).filter(Boolean);

  for (const project of pins) project.pinned = true;
  const rest = every.filter(project => !project.pinned);

  return [
    stat(all),
    ...pins,
    ...rest.filter(project => project.custom),
    ...rest.filter(project => !project.custom).sort((left, right) => right.last.localeCompare(left.last)),
  ];
}

const pillsHtml = project =>
  `${project.working ? `<span class="pc working" title="clauding">${project.working}</span>` : ''}${project.ready ? `<span class="pc ready" title="ready for you">${project.ready}</span>` : ''}${project.unread ? `<span class="badge">${project.unread}</span>` : ''}`; // the column's counts, and the picker's

// The colour square — and where it stands for one folder (the chat header's) the picker: the setup's colour for it.
const sqHtml = (project, style = '') =>
  project.cwds?.length === 1
    ? `<span class="sq pick"${style ? ` style="${style}"` : ''} data-name="${esc(colorKey(project.cwds[0]))}" title="Colour of ${esc(project.name)} — click to pick; kept in the setup (Settings › Projects › Projects); ⌥-click takes it off"></span>`
    : `<span class="sq"${style ? ` style="${style}"` : ''}></span>`;
