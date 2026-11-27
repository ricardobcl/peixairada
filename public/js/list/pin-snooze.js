// ---- Top priority and snooze, by hand (2026-11-24, round XXX) -------------------------------------------------------
// The order is the server's, written whole (PUT /api/priority) and drawn at once from the copy here; a move is said to a
// reader (#prioSay, R5), as GitHub's sortable lists do. What the section shows is the order's chats in view — the project
// in view's, none snoozed —, so a move is among those, and lands beside them in the whole order.
async function setPriority(ids, say = '') {
  const was = state.priority;

  state.priority = ids;
  renderBoard();
  if (say) $('#prioSay').textContent = say;

  try {
    state.priority = (await api('PUT', '/api/priority', { ids })).priority || ids;
  } catch (error) {
    state.priority = was;
    note($('#slist'), `Not pinned: ${error.message}`, true);
  }

  renderBoard();
}

function secList() {
  const project = prefs.project === ALL ? null : projectStub(prefs.project);

  return state.priority
    .map(id => state.sessions.get(id))
    .filter(session => session && visible(session) && !asleep(session) && (!project || inProject(session, project)));
}

const prioOff = anchor => (
  note(anchor || $('#slist'), 'The pinned section is off — Settings › Chat list switches it on', true),
  false
);

/** `session` into the order before the chat `before` (null: at its end), or out of it. */
function prioPut(session, on, before = null, anchor = null) {
  if (!session) return false;
  if (!prioOn()) return prioOff(anchor);
  const ids = state.priority.filter(id => id !== session.id);

  if (on) {
    const index = before ? ids.indexOf(before) : -1;

    ids.splice(index < 0 ? ids.length : index, 0, session.id);
  }

  const shown = on
    ? secList()
        .map(pinned => pinned.id)
        .filter(id => id !== session.id)
    : [];

  if (on) {
    const index = before ? shown.indexOf(before) : -1;

    shown.splice(index < 0 ? shown.length : index, 0, session.id);
  }

  setPriority(
    ids,
    on ? `${session.title}, pinned, ${shown.indexOf(session.id) + 1} of ${shown.length}` : `${session.title}, unpinned`,
  );

  return true;
}

/** One place up or down among the section's cards (step ±1), or to its top or bottom (step ±Infinity). */
function prioMove(session, step, anchor = null) {
  if (!prioOn()) return prioOff(anchor);

  const list = secList();
  const index = list.indexOf(session);

  if (index < 0) return (note(anchor || $('#slist'), 'Not pinned — ⌥⌘I pins it', true), false);

  const target = Math.max(
    0,
    Math.min(list.length - 1, step === Infinity ? list.length - 1 : step === -Infinity ? 0 : index + step),
  );

  if (target === index) {
    $('#prioSay').textContent = `${session.title}, already ${index ? 'last' : 'first'}`;
    return true;
  }

  return prioPut(session, true, step < 0 ? list[target].id : list[target + 1]?.id || null, anchor);
}

const clearDone = () =>
  setPriority(
    state.priority.filter(id => !state.sessions.get(id)?.done),
    'The ticked chats are unpinned',
  );

/** A snooze sent (`{until} | {on, pr}`), or `{undo: true}`: awake now. */
async function snoozeIt(session, body, anchor = null) {
  const at = anchor?.isConnected
    ? anchor
    : cardNodes.get(session.id)?.el?.isConnected
      ? cardNodes.get(session.id).el
      : $('#shead');

  try {
    const response = await api('POST', `/api/sessions/${encodeURIComponent(session.id)}/snooze`, body);
    const cur = state.sessions.get(session.id);

    if (cur) cur.snooze = response.snooze || null;
    renderBoard();

    const el = cardNodes.get(session.id)?.el;
    const there = el?.isConnected ? el : at.isConnected && at.closest('#shead') ? at : $('#sessions'); // its card where it went, else the list

    note(
      there,
      body.undo
        ? 'Awake: it is back on its lane'
        : `Snoozed ${snoozeSay(response.snooze)} — in Snoozed, counted nowhere`,
    );
  } catch (error) {
    note(at, `${body.undo ? 'Not woken' : 'Not snoozed'}: ${error.message}`, true);
  }
}

/** The times and the things to wait for (Z1, Z2): a menu of its own, 1 to 9 picking (S2). */
function snoozeRows(session) {
  const now = new Date();
  const HOUR_MS = 3_600_000;
  const hour = Number(prefs.mornings ?? 9);

  const morning = new Date(now);

  morning.setHours(hour, 0, 0, 0);
  const early = now < morning;

  if (!early) morning.setDate(morning.getDate() + 1);
  const monday = new Date(now);

  monday.setHours(hour, 0, 0, 0);
  monday.setDate(monday.getDate() + ((8 - monday.getDay()) % 7 || 7));

  const until = time => ({ until: new Date(time).toISOString() });
  const rows = [];

  if (asleep(session)) {
    rows.push(
      { t: 'Wake it now', sub: `snoozed ${snoozeSay(session.snooze)}`, fn: () => snoozeIt(session, { undo: true }) },
      { hr: true },
    );
  }

  [
    ['In 1 hour', +now + HOUR_MS],
    ['In 3 hours', +now + 3 * HOUR_MS],
    [early ? 'This morning' : 'Tomorrow morning', +morning],
    ['Next week', +monday],
  ].forEach(([label, at]) =>
    rows.push({
      t: label,
      n: whenSay(at),
      key: rows.filter(row => row.key).length + 1,
      fn: () => snoozeIt(session, until(at)),
    }),
  );

  rows.push({ t: 'Pick a time…', key: 5, fn: () => zzPickOpen(session) }, { hr: true });

  const prs = (session.prs || []).filter(pr => pr.url && (!pr.state || pr.state === 'open' || pr.state === 'draft'));
  const short = pr => pr.label.replace(/^.*?#/, '#');

  const ev = [
    ...prs
      .filter(pr => !pr.turn?.you)
      .slice(0, 2)
      .map(pr => ({
        t: `Until ${short(pr)} comes round to you`,
        sub: 'your move on it brings it back',
        fn: () => snoozeIt(session, { on: 'pr', pr: pr.url }),
      })),
    ...prs
      .filter(pr => pr.checks === 'pending')
      .slice(0, 1)
      .map(pr => ({
        t: `Until ${short(pr)}’s checks finish`,
        sub: 'pass or fail brings it back',
        fn: () => snoozeIt(session, { on: 'ci', pr: pr.url }),
      })),
    ...(session.status === 'working'
      ? [
          {
            t: 'Until Claude replies',
            sub: 'the end of this turn brings it back',
            fn: () => snoozeIt(session, { on: 'reply' }),
          },
        ]
      : []),
    ...((session.tasks || []).length
      ? [
          {
            t: 'Until its monitor ends',
            sub: session.tasks.map(task => task.what).filter(Boolean)[0] || 'what it watches',
            fn: () => snoozeIt(session, { on: 'mon' }),
          },
        ]
      : []),
  ]
    .slice(0, 4)
    .map((row, index) => ({ ...row, key: 6 + index }));

  rows.push(
    ...(ev.length ? ev : [{ t: 'Until something happens', sub: 'no PR, turn or monitor to wait on in it', off: true }]),
  );

  return rows;
}

/** The snooze menu at a point, or, from a key, by the chat's card — else under the header's ···. */
function snoozeMenu(session, left, top, above = false) {
  if (!session) return;

  if (asking(session)) {
    return note(
      cardNodes.get(session.id)?.el || $('#shead'),
      'It is asking you — a question wakes a snooze, so answer it first',
      true,
    );
  }

  if (left == null) {
    const card = cardNodes.get(session.id)?.el;

    const rect = (
      card?.isConnected && card.getClientRects().length ? card : $('#moreBtn') || $('#shead')
    ).getBoundingClientRect();

    left = rect.left + 16;
    top = rect.bottom + 4;
  }

  ctxShow(snoozeRows(session), left, top, 'snooze', above);
}

function zzPickOpen(session) {
  const dlg = $('#zzPick');
  const at = new Date(Date.now() + 3_600_000);
  const local = date => new Date(date - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);

  at.setMinutes(0, 0, 0);
  $('#zzFor').textContent = session.title;
  $('#zzErr').textContent = '';
  dlg.dataset.id = session.id;
  $('#zzAt').min = local(new Date());
  $('#zzAt').value = local(at);
  dlg.showModal();
  repostPane();
  $('#zzAt').focus();
}

function zzPickGo() {
  const dlg = $('#zzPick');
  const session = state.sessions.get(dlg.dataset.id);
  const time = new Date($('#zzAt').value);

  if (!session) return dlg.close();

  if (isNaN(time) || time <= Date.now()) {
    $('#zzErr').textContent = 'A time to come';
    return;
  }

  dlg.close();
  snoozeIt(session, { until: time.toISOString() });
}

$('#zzGo').onclick = zzPickGo;
$('#zzCancel').onclick = () => $('#zzPick').close();

$('#zzAt').addEventListener('keydown', event => {
  if (event.key === 'Enter') {
    event.preventDefault();
    zzPickGo();
  }
});

// the keys (2026-11-24, round XXX): ⌥⌘I in or out (A2), ⌥⌘⇧↑↓ a place (R3), ⌥⌘S its snooze (S2), ⌥⌘U focus (F6)
const openChat = () => state.sessions.get(state.current) || null;

function hotPrio() {
  const session = openChat();

  if (!session) {
    note($('#shead'), 'No chat open');
    return true;
  }

  prioPut(session, !inPrio(session), null, cardNodes.get(session.id)?.el || $('#shead'));
  return true;
}

function hotPrioMove(step) {
  const session = openChat();

  if (!session) {
    note($('#shead'), 'No chat open');
    return true;
  }

  prioMove(session, step, cardNodes.get(session.id)?.el || $('#shead'));
  return true;
}

function hotSnooze() {
  const session = openChat();

  if (!session) {
    note($('#shead'), 'No chat open');
    return true;
  }

  snoozeMenu(session);
  return true;
}

function hotFocus() {
  if (!prioOn()) {
    prioOff($('#fBtn'));
    return true;
  }

  setFilter(prioFocus() ? null : 'prio');
  return true;
}

window.peixSnooze = id => {
  const session = state.sessions.get(id);

  if (session && !asking(session)) snoozeIt(session, { until: new Date(Date.now() + 3_600_000).toISOString() });
}; // the banner's In an hour (S3)
