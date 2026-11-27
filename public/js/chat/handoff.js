// ---- chats that talk (2026-10-31, round XIV): Send to… -------------------------------------------------------------
// A message of yours to a chat, from its card's menu or the launcher's picker, written in a box of its own and sent as
// its prompt: typed into its drawer when it runs here; for a chat with no process, the resume >_ makes — the words
// handed to `claude --resume` as its first prompt, which Claude Code sends once it is up (spawnTerm's `prompt`). A chat
// live in iTerm or VS Code is out of reach, as for everything else on the board; one asking you would take the words
// for its answer. Only what you typed is ever sent — nothing a chat said, nothing the board received.
const ho = { mode: null, ids: [], busy: false, gen: 0 }; // the box's: send, merge or fold, the chats, an ask under way, which opening

/** Why the board cannot send to this chat, or null. */
function sendWhy(session) {
  if (!session) return 'it is not on the board';
  if (asking(session)) return 'it is asking you something — answer it first';
  if (drawerOf(session)) return null;

  if (session.alive) {
    return `it runs in ${inVsCode(session) ? 'VS Code' : 'another terminal'}, out of the board's reach — ⌥⌘C takes it over`;
  }

  if (!session.file) return 'there is nothing in it to resume yet';
  return session.cwd ? null : 'no folder is known for it';
}

/** How the words will land, in words — under the box. */
const sendSay = session =>
  drawerOf(session)
    ? `Typed into its drawer here and sent${session.status === 'working' ? ' — it is clauding: Claude Code takes it in as it would from you' : ''}.`
    : `Its Claude isn’t running: its drawer opens here (claude --resume), with this as its first prompt${session.folderMissing && session.cloneRef ? ` — after cloning ${session.cloneRef}` : ''}.`;

/** A chat as the box lists it: its project's square, name and title. */
const hoChat = (session, extra = '') =>
  `<div class="hochat" style="${repoStyle(repoColor(session.cwd))}" data-id="${esc(session.id)}"><span class="sq"></span><b>${projIcon(session.project)}${esc(session.project)}</b><span class="ht">${ticks(esc(session.title))}</span>${extra}</div>`;

/** A card's rows for the right-click menu: what can be done with it and another chat — and the chats tied to it. */
function talkRows(session) {
  const no = sendWhy(session);
  const mno = mergeWhy(session);
  const fno = foldFromWhy(session);

  return [
    { hr: true },
    { t: 'Send to this chat…', ...(no ? { off: true, sub: no } : {}), fn: () => sendOpen(session) },
    {
      t: 'Merge with…',
      ...(mno ? { off: true, sub: mno } : { sub: 'a new chat, its first prompt where each stands' }),
      fn: () => mergePick([session.id]),
    },
    {
      t: 'Fold into…',
      ...(fno ? { off: true, sub: fno } : { sub: 'where it stands, typed into another chat — then done' }),
      fn: () => foldPick(session),
    },
    {
      t: 'Branch from here',
      ...(session.file
        ? { sub: 'a copy in a drawer of its own — this one goes on as it is' }
        : { off: true, sub: 'nothing in it to branch yet' }),
      fn: () => branchChat(session),
    },
    ...(session.links || []).map(link => ({
      t: linkSay(link),
      ...(state.sessions.has(link.id) ? {} : { off: true }),
      fn: () => openSession(link.id, { locate: true }),
    })),
  ];
}

// ---- merged, folded, branched: the chats tied to one, by your hand (2026-10-31) -----------------------------------
// The server keeps the ties (its `links`, from the merge's, the fold's or the branch's own route); a card says it has
// some by a word beside its project — `branch`, `merged`, `merge of 2` — its tooltip saying with which; the header's ···
// and the card's right-click menu list them, each a row that opens its chat.
/** A tie in words: what it is, and the chat at its other end — “Merged into ‘Queue for invoice webhooks’”. */
function linkSay(link) {
  const say = {
    'merge:out': 'Merged into',
    'merge:in': 'Merged from',
    'fold:out': 'Folded into',
    'fold:in': 'Folded in from',
    'branch:in': 'Branched from',
    'branch:out': 'Its branch',
    'continued:out': 'Went on as',
    'continued:in': 'Goes on from',
  }[`${link.k}:${link.dir}`];

  return `${say} “${state.sessions.get(link.id)?.title || 'a chat no longer on the board'}”`;
}

function linkChip(session) {
  const ls = session.links || [];

  if (!ls.length) return '';
  const countOf = kind => ls.filter(link => `${link.k}:${link.dir}` === kind).length;

  const words = [
    ['branch:in', () => 'branch'],
    ['branch:out', count => `${count} branch${count > 1 ? 'es' : ''}`],
    ['merge:in', count => `merge of ${count}`],
    ['merge:out', () => 'merged'],
    ['fold:in', count => `${count} folded in`],
    ['fold:out', () => 'folded'],
    ['continued:in', () => 'went on from a chat'],
    ['continued:out', () => 'went on'],
  ]
    .filter(([kind]) => countOf(kind))
    .map(([kind, say]) => say(countOf(kind)));

  return `<span class="chip lnk" title="${esc(ls.map(linkSay).join('\n'))}">${ls.some(link => link.k === 'branch' || link.k === 'continued') ? ICON.branch : ICON.prMerged}${esc(words.slice(0, 2).join(' · '))}</span>`;
}

function linkMenuHtml(session) {
  return (session.links || [])
    .map(
      link =>
        `<button class="hmi" data-lnk="${esc(link.id)}"${state.sessions.has(link.id) ? '' : ' disabled'} title="Open it">${link.k === 'branch' || link.k === 'continued' ? ICON.branch : ICON.prMerged}<span class="lbl">${esc(linkSay(link))}</span><span class="k"></span></button>`,
    )
    .join('');
}

// ---- Merge with…: a new chat from several, its first prompt where each stands (2026-10-31) -----------------------
// From a card's menu (that chat taken in) or the launcher: the chats picked in the picker (⏎ takes one in or out), then
// the handoff the server writes from their transcripts (GET /api/handoff) in the box, yours to change, and the folder
// the new chat starts in — the first chat's, another's, or none. Start: a new chat in a drawer, the handoff its first
// prompt (POST /api/terminals with `prompt` and `from`); the old chats stay as they are, tied to it.
const mergeWhy = session => (session?.file ? null : 'nothing in it to hand off yet');

const mergePick = (picked = [], back = null) =>
  pickOpen('chatpick', {
    ask: 'Merge into a new chat',
    many: true,
    picked: picked.filter(id => !mergeWhy(state.sessions.get(id))),
    min: 2,
    why: mergeWhy,
    go: mergeOpen,
    goSay: count =>
      count >= 2
        ? `Merge these ${count} chats into a new one →`
        : `Merge — ${count} chat${count === 1 ? '' : 's'} in so far, ⏎ on another`,
    ...(back && { back }),
  });

async function mergeOpen(ids) {
  const list = ids.map(id => state.sessions.get(id)).filter(Boolean);

  if (list.length < 2) return note($('#shead'), 'Two chats at least to merge', true);
  const gen = ++ho.gen;

  Object.assign(ho, { mode: 'merge', ids: list.map(session => session.id) });
  $('#hoTitle').textContent = `Merge ${list.length} chats into a new chat`;
  $('#hoChats').innerHTML = list.map(session => hoChat(session)).join('');
  const textArea = $('#hoText');

  textArea.value = '';
  textArea.rows = 14;
  textArea.placeholder = 'Reading where each stands…';
  textArea.disabled = true;
  const dirs = [...new Set(list.map(session => session.cwd).filter(Boolean))];

  $('#hoCwd').innerHTML =
    dirs.map(dir => `<option value="${esc(dir)}">${esc(homePath(dir))}</option>`).join('') +
    (state.about.scratch ? `<option value="${esc(state.about.scratch)}">no folder — the board’s own</option>` : '');

  $('#hoWhere').hidden = false;

  hoSay(
    'A new chat starts in a drawer, in that folder, with this as its first prompt. The chats stay as they are, each tied to it.',
  );

  $('#hoKeys').innerHTML = '<kbd>⌘⏎</kbd>start<kbd>esc</kbd>';
  $('#hoGo').textContent = 'Start';
  hoShow();
  await hoFill(gen, 'merge');
}

/** The handoff the server writes for the box's chats, into the box — unless the box was opened anew meanwhile. */
async function hoFill(gen, kind) {
  const textArea = $('#hoText');

  $('#hoGo').disabled = true; // nothing to confirm until it is there to read (2026-11-02)

  try {
    const data = await api(
      'GET',
      `/api/handoff?kind=${kind}&ids=${ho.ids
        .slice(0, kind === 'fold' ? 1 : 12)
        .map(encodeURIComponent)
        .join(',')}`,
    );

    if (gen === ho.gen) textArea.value = data.text;
  } catch (error) {
    if (gen === ho.gen) {
      hoSay(`Could not read where ${kind === 'fold' ? 'it stands' : 'they stand'}: ${error.message}`, true);
    }
  } finally {
    if (gen === ho.gen) {
      $('#hoGo').disabled = false;
      textArea.disabled = false;
      textArea.placeholder = 'The handoff';
      textArea.focus();
      textArea.setSelectionRange(0, 0);
      textArea.scrollTop = 0;
    }
  }
}

// ---- Fold into…: one chat's handoff typed into another's drawer, unsent; the first ticked done (2026-10-31) --------
// From a card's menu, or the launcher for the open chat: the chat it goes into from the picker (where Send to… could
// reach — a drawer here, or none running), the handoff in the box. Fold: that chat opened, its drawer resumed if it
// has none, the handoff typed in and not sent — yours to read and send, as a review's prompt is — then the first chat
// ticked done, tied to it. A chat at work is not folded: the tick would end it mid-turn.
const foldFromWhy = session =>
  !session?.file
    ? 'nothing in it to hand off yet'
    : !canTick(session)
      ? 'it is at work — fold it once it is idle'
      : null;

const foldPick = (session, back = null) =>
  pickOpen('chatpick', {
    ask: `Fold “${session.title}” into`,
    skip: [session.id],
    why: sendWhy,
    then: target => foldOpen(session, target),
    ...(back && { back }),
  });

async function foldOpen(source, target) {
  const no = foldFromWhy(source) || sendWhy(target);

  if (no) return note($('#shead'), `Not folded: ${no}`, true);
  const gen = ++ho.gen;

  Object.assign(ho, { mode: 'fold', ids: [source.id, target.id] });
  $('#hoTitle').textContent = 'Fold one chat into another?';

  $('#hoChats').innerHTML =
    hoChat(source, '<span class="hx">then done</span>') + hoChat(target, '<span class="hx">gets it, unsent</span>');

  const textArea = $('#hoText');

  textArea.value = '';
  textArea.rows = 12;
  textArea.placeholder = 'Reading where it stands…';
  textArea.disabled = true;
  $('#hoWhere').hidden = true;

  hoSay(
    `Typed into “${target.title}”'s drawer${drawerOf(target) ? '' : ', resumed here for it,'} and not sent: read it there, and ⏎ sends it. “${source.title}” is then ticked done, tied to it.`,
  );

  $('#hoKeys').innerHTML = '<kbd>⌘⏎</kbd>fold<kbd>esc</kbd>';
  $('#hoGo').textContent = 'Fold';
  hoShow();
  await hoFill(gen, 'fold');
}

/** The fold itself: the chat it goes into opened, its drawer up, the words typed unsent; then the tie and the tick. */
async function foldGo(a0, b0, text) {
  const source = state.sessions.get(a0.id) || a0;
  const no = foldFromWhy(source) || sendWhy(state.sessions.get(b0.id) || b0);

  if (no) throw new Error(`Not folded: ${no}`);
  await openSession(b0.id);
  const target = state.sessions.get(b0.id) || b0;

  if (!drawerOf(target)) {
    await termAction(target);

    if (!(await drawerReady(target.id))) {
      throw new Error(`“${target.title}” did not come up — nothing typed, “${source.title}” as it was`);
    }
  }

  for (let attempt = 0; attempt < 40 && !claudeTm(state.sessions.get(target.id) || target); attempt++) {
    await new Promise(resolve => setTimeout(resolve, 100));
  } // the page's own socket to it

  const unt = await drawerType(state.sessions.get(target.id) || target, text, false);

  if (unt) throw new Error(`Not typed into “${target.title}”: ${unt} — “${source.title}” as it was`);
  if (state.current === target.id) focusTerm();
  await api('POST', `/api/sessions/${source.id}/fold`, { into: target.id });
  tickDone(source.id, true, $('#shead'));
}
