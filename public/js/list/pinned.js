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
const inPrio = s => !!s && prioOn() && state.priority.includes(s.id);
const asleep = s => !!s?.snooze && !s.done;
const back = s => !!s.wokeAt && !s.snooze && s.wokeAt > (s.seenAt || '');
const prioFocus = () => prioOn() && prefs.listFilter === 'prio';
// The model Claude last answered with is the one the chat runs on: `claude-fable-5-1`, `claude-fable-5[1m]`… mark
// the card (2026-09-27).
const onFable = s => /fable/i.test(s.model || '');
const watching = s => !s.done && (s.tasks?.length || 0) > 0;
// The ✓ is offered once nothing runs — an idle claude or none — on a chat the board has a time for: the card's
// and the chats step's (2026-09-28), one rule, since ticking one that runs would end it mid-turn.
const canTick = s => (!s.alive || s.status === 'idle') && !!(s.lastActivity || s.startedAt);
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

const yourMove = s =>
  !s.forGood && (s.prs || []).some(p => p.turn?.you && (p.state === 'open' || p.state === 'draft' || !p.state));

// a reply after the board last showed the chat (`seenAt`, the server's, kept in its state file)
// …or back from a snooze since (2026-11-24, round XXX's H2): marked back, and counted as one, till you open it
const replied = s =>
  back(s) || (!!s.seenAt && !!s.lastReplyAt && s.lastReplyAt >= (s.lastUserAt || '') && s.lastReplyAt > s.seenAt);

const idleSince = () => {
  const d = new Date();

  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - IDLE_DAYS);
  return d.toISOString();
};

// Watching, whatever its age: a live claude with work out behind the turn, nothing more pressing — a question beats a
// watch, work beats it too, as the ring ranks them; but a turn the chat's own task notice woke (the server's `woken`)
// stays, so a chatty monitor does not bounce the card a lane on every event. Your word or the last task ending moves it.
// A wake-up it set itself is a watch too (2026-10-31, later: ScheduleWakeup, CronCreate — the server's `wake`, gone once
// its turn comes or its time is well past).
const inWatch = s =>
  !s.done && s.alive && ((s.tasks?.length || 0) > 0 || !!s.wake) && (s.status !== 'working' || (s.woken && !s.agents));

const rankOf = s => {
  const b = bucket(s);

  return asking(s)
    ? 'asking'
    : asleep(s)
      ? 'snoozed'
      : inWatch(s)
        ? 'watching'
        : b !== 'ready'
          ? b
          : wordAt(s) < idleSince()
            ? 'idle'
            : 'ready';
};

// What Done would end on a watching chat — the ✓ names it and asks once more (tickGate) —, or ''.
const watchEnds = s =>
  !inWatch(s)
    ? ''
    : [
        ...(s.tasks || []).map(t => `${t.kind === 'monitor' ? 'monitor' : 'running'}${t.what ? ` · ${t.what}` : ''}`),
        ...(s.wake ? [`the wake-up at ${hhmm(s.wake.at)}`] : []),
      ].join(' and ');

// a time of day as the board writes one, and how far off it is (a wake-up's: `data-in`, written by fillAges)
const hhmm = ts => {
  const d = new Date(ts);

  return isNaN(d) ? '' : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

// when a snooze ends, as the card and the menu say it (2026-11-24, round XXX): `14:30`, `tomorrow 09:00`, `Tue 09:00`, a date
const WD3 = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const whenSay = ts => {
  const d = new Date(ts);

  if (isNaN(d)) return '';
  const n = Math.round((new Date(d).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86_400_000);

  return n === 0
    ? hhmm(d)
    : n === 1
      ? `tomorrow ${hhmm(d)}`
      : n > 1 && n < 7
        ? `${WD3[d.getDay()]} ${hhmm(d)}`
        : `${fmtDate(d)} ${hhmm(d)}`;
};

const prLabelOf = url => {
  for (const s of state.sessions.values()) {
    const p = (s.prs || []).find(x => x.url === url);

    if (p) return p.label.replace(/^.*?#/, '#');
  }

  return 'its PR';
};

const ZZ_ON = {
  pr: z => `when ${prLabelOf(z.pr)} comes round`,
  ci: () => 'when its checks finish',
  reply: () => 'when Claude replies',
  mon: () => 'when its monitor ends',
};

const snoozeSay = z =>
  !z
    ? ''
    : [z.until ? `till ${whenSay(z.until)}` : '', z.on ? ZZ_ON[z.on]?.(z) || '' : ''].filter(Boolean).join(' or ');

const ordinal = n =>
  n +
  (n % 10 === 1 && n % 100 !== 11
    ? 'st'
    : n % 10 === 2 && n % 100 !== 12
      ? 'nd'
      : n % 10 === 3 && n % 100 !== 13
        ? 'rd'
        : 'th');

const relIn = ts => {
  const m = Math.round((new Date(ts) - Date.now()) / 60000);

  return !(m > 0) ? 'due now' : m < 60 ? `in ${m} min` : `in ${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`;
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
    test: s => bucket(s) === 'ready' && !asleep(s) && replied(s),
  },
  prio: {
    name: 'Pinned only',
    none: 'Nothing pinned',
    tip: 'the chats you pinned, in your order',
    on: prioOn,
    test: s => inPrio(s) && !asleep(s),
  },
};

const filterList = () => Object.entries(FILTERS).filter(([, f]) => !f.on || f.on());

const listFilter = () => {
  const f = FILTERS[prefs.listFilter];

  return f && (!f.on || f.on()) ? f : null;
};

// the cards large with cards by lane on: a chat asking you, clauding, at your move or with a new reply
const roomy = s =>
  asking(s) ||
  bucket(s) === 'working' ||
  (bucket(s) !== 'done' && !asleep(s) && yourMove(s)) ||
  FILTERS.replied.test(s);

// What the filters and the pickers search, as separate fields: the picker's matcher hunts each word *within* one
// of them, so `wapi` has to be somewhere in the project or the branch and cannot be spelled out of letters
// borrowed from a title and a prompt (2026-09-21). Short and identifying first — ties go to the earlier field.
// A chat's PRs and tickets are one, as their chips name them (2026-10-14): `650` finds the chat on `widgets#650`
// however long ago it was mentioned — the last prompt holds it only while it is the last.
const chatIds = s => [...(s.prs || []).map(p => p.label), ...(s.tickets || []).map(t => t.key)];

const chatFields = s => [
  s.title,
  s.project,
  s.gitBranch || '',
  chatIds(s).join(' '),
  s.aiTitle || '',
  s.lastPrompt || '',
  s.live?.name || '',
  s.agent ? `@${agentShort(s.agent)} ${s.agent}` : '',
];

/** A picker row's word on why it matched: the PRs and tickets that hold a word of the query as typed (a web address
 *  as wordIn finds it), its letters bolded — the title alone does not say why `650` found it. Two at most, then a count. */
function idsHit(s, q) {
  const holds = (id, w) => (URL_WORD.test(w) ? !!wordIn(id, w) : id.includes(w));

  const words = q.split(/\s+/).filter(Boolean);
  const hit = words.length ? chatIds(s).filter(id => words.some(w => holds(id.toLowerCase(), w))) : [];

  return hit.length
    ? `<span class="cur ids">${hit
        .slice(0, 2)
        .map(id => markHits(id, q))
        .join(' · ')}${hit.length > 2 ? ` +${hit.length - 2}` : ''}</span>`
    : '';
}

// What a done chat's match is worth in ⌥⌘K (2026-11-03): half, so the chats you jump between keep the top and a done
// one leads only where it matches clearly better (on the real board: `wallet` the open chats first, `cloudflare` the
// done chat of that name, over open ones that only scatter its letters). Not when the box is its PR's number or name, or
// its ticket's key: `650` wants widgets#650, done or not, before an open chat on widgets#16501.
const DONE_WORTH = 0.5;

const doneWorth = (s, q) =>
  !s.done ||
  chatIds(s).some(id => {
    id = id.toLowerCase();
    return id === q || id.endsWith(`#${q}`);
  })
    ? 1
    : DONE_WORTH;

// Pinned projects first, in your order (state.pins — server state, so every browser and the app agree),
// then the named ones, then folders by their newest chat. A pinned folder shows even with no chat in view.
function projectList() {
  const all = { key: ALL, name: 'ALL', cwds: [], sessions: [] };
  const folders = new Map();

  const customs = state.projects.map(p => ({
    key: `c:${p.id}`,
    id: p.id,
    name: p.name,
    cwds: p.cwds,
    custom: true,
    sessions: [],
  }));

  for (const s of state.sessions.values()) {
    if (!visible(s)) continue;
    all.sessions.push(s);
    const k = projDir(s.cwd) || '?';

    if (!folders.has(k)) {
      folders.set(k, { key: k, name: folderName(projDir(s.cwd)), cwds: s.cwd ? [k] : [], sessions: [] });
    }

    folders.get(k).sessions.push(s);
    for (const c of customs) if (inProject(s, c)) c.sessions.push(s);
  }

  for (const k of state.pins) {
    if (k.startsWith('/') && !folders.has(k)) folders.set(k, { key: k, name: folderName(k), cwds: [k], sessions: [] });
  }

  const stat = p => {
    const undone = p.sessions.filter(s => !s.done && !asleep(s)); // the same rule as the chips: not ticked is working or ready

    p.working = undone.filter(s => s.status === 'working').length;
    p.ready = undone.length - p.working; // a pending question is ready-for-you too, and so is a stale chat
    p.unread = p.sessions.reduce((n, s) => n + (state.unread.get(s.id) || 0), 0);
    p.last = p.sessions.reduce((m, s) => (wordAt(s) > m ? wordAt(s) : m), '');
    return p;
  };

  const every = [...customs, ...folders.values()].map(stat).filter(p => !isHidden(p.key)); // ✕ in ⌥⌘N: off every list, pins included
  const pins = state.pins.map(k => every.find(p => p.key === k)).filter(Boolean);

  for (const p of pins) p.pinned = true;
  const rest = every.filter(p => !p.pinned);

  return [
    stat(all),
    ...pins,
    ...rest.filter(p => p.custom),
    ...rest.filter(p => !p.custom).sort((a, b) => b.last.localeCompare(a.last)),
  ];
}

const pillsHtml = p =>
  `${p.working ? `<span class="pc working" title="clauding">${p.working}</span>` : ''}${p.ready ? `<span class="pc ready" title="ready for you">${p.ready}</span>` : ''}${p.unread ? `<span class="badge">${p.unread}</span>` : ''}`; // the column's counts, and the picker's

// The colour square — and where it stands for one folder (the chat header's) the picker: the setup's colour for it.
const sqHtml = (p, style = '') =>
  p.cwds?.length === 1
    ? `<span class="sq pick"${style ? ` style="${style}"` : ''} data-name="${esc(colorKey(p.cwds[0]))}" title="Colour of ${esc(p.name)} — click to pick; kept in the setup (Settings › Projects › Projects); ⌥-click takes it off"></span>`
    : `<span class="sq"${style ? ` style="${style}"` : ''}></span>`;
