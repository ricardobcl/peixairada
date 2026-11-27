// ---- the timeline tab: the chat and its PRs in one order (2026-10-17) -----------------------------------------
// The story of a chat and its PRs was in three places — the transcript, each PR row's round, the card's popover —
// and read in order only by merging them in your head. One list now (VS Code's Timeline, a commit graph's lanes,
// Copilot's session line in a PR): your prompts, each of Claude's turns as one line, and the events of the chat's
// PRs between them, newest at the bottom as the transcript. At the left a lane per PR in its hue, thin while it is
// someone else's move, thick from the move that came round to you, a tick where your word closed the round, dashed
// once let go; the Now bar at the foot says where each PR stands. A tab as the changes are (⌥⌘J), one element moved
// into the half that shows it (placeTimeline). Read from the open chat's entries and its PRs' ledgers (GET …/prlog,
// asked again when one has moved); which turns are about which PR — named in it, acted on from it, the first after
// its move — is the page's own reading of the entries (tvModel).
const timelineOpen = new Set(); // chats with the tab, kept across a reload as the other tabs are (keepTabs)
const tv = { id: null, log: null, sig: '', asking: false, goto: null, lit: null, opened: new Set() }; // opened: the folds opened, the open chat's; lit: the move gone to
const TV_LANES = 5; // a lane each for the first five PRs shown, the rest one grey lane between them
const TV_EDITS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);

// what the ledgers hold has moved: a PR's `logged` (the server's count of its ledger's changes), its state, its round
const tvSig = session =>
  (session.prs || [])
    .map(
      pr =>
        `${pr.url} ${pr.logged || 0} ${pr.state} ${pr.turn?.movedAt || ''} ${(pr.rounds || []).map(round => round.from + (round.end || '') + (round.let || '')).join()}`,
    )
    .join('\n');

/** The open chat's ledgers: asked when the tab or the PR list wants them, and again once one of them has moved. */
function tvLogOf(session) {
  if (tv.id !== session.id) {
    Object.assign(tv, { id: session.id, log: null, sig: '' });
    tv.opened.clear();
  }

  const sig = tvSig(session);

  if (sig !== tv.sig && !tv.asking && session.prs?.length) {
    tv.asking = true;
    const id = session.id;

    api('GET', `/api/sessions/${encodeURIComponent(id)}/prlog`)
      .then(
        ledger => ledger,
        () => null,
      )
      .then(ledger => {
        tv.asking = false;
        if (tv.id !== id) return;
        tv.sig = sig;

        if (ledger) {
          tv.log = ledger;
          prlogs.set(id, { at: Date.now(), v: ledger });
        } // the card's popover reads the same

        const now = state.sessions.get(id);

        if (!now || state.current !== id) return;
        tvSoon();
      });
  }

  return tv.log;
}

/** A chat's turns from its entries: your prompt (none for one a task's notice woke), Claude's calls, its last words. */
function tvTurns(entries) {
  const out = [];
  let turn = null;

  const begin = (at, you = null) => {
    turn = { at, you, last: at, end: null, worked: 0, tools: [], reply: '', closed: false, cut: false };
    out.push(turn);
  };

  for (const entry of entries) {
    if (!entry.ts) continue;

    if (entry.kind === 'text' && entry.role === 'user') {
      begin(entry.ts, entry.text);
      continue;
    } // one typed mid-turn starts its own line

    if (entry.kind === 'interrupt') {
      if (turn && !turn.closed) Object.assign(turn, { end: entry.ts, closed: true, cut: true });
      continue;
    }

    if (entry.kind === 'compact') continue;
    if (!turn || turn.closed) begin(entry.ts);
    turn.last = entry.ts;

    if (entry.kind === 'tool_use') turn.tools.push(entry);
    else if (entry.kind === 'text' && entry.role === 'assistant') {
      turn.reply = entry.text;
      if (entry.turnEnd) Object.assign(turn, { end: entry.ts, worked: entry.worked || 0, closed: true });
    }
  }

  return out;
}

/** …read again only when the entries grew or are another list: the PR list's head asks on every update of the header. */
const tvTurnsMemo = { arr: null, n: -1, turns: null };

function tvTurnsOf(arr) {
  if (tvTurnsMemo.arr !== arr || tvTurnsMemo.n !== arr.length) {
    Object.assign(tvTurnsMemo, { arr, n: arr.length, turns: tvTurns(arr) });
  }

  return tvTurnsMemo.turns.map(turn => ({ ...turn })); // the model writes on its turns
}

const reLit = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The chat's PRs a piece of text names: its URL, repo#n, or #n when no other PR of the chat has that number. */
function tvNames(session, text) {
  const out = new Set();
  const prs = session.prs || [];

  if (!text) return out;

  for (const pr of prs) {
    const number = pr.number;
    const repo = pr.label.replace(/#.*$/, '');

    if (
      new RegExp(`${reLit(pr.url)}(?!\\d)`).test(text) ||
      (number && new RegExp(`\\b${reLit(repo)}\\s?#${number}\\b`, 'i').test(text)) ||
      (number &&
        prs.filter(other => other.number === number).length === 1 &&
        new RegExp(`(^|[^\\w/#])#${number}\\b`).test(text))
    ) {
      out.add(pr.url);
    }
  }

  return out;
}

/** What the timeline reads: the turns, each with the PRs it is about; every PR event, the chat's own tied to its turn. */
function tvModel(session) {
  const prs = [...(session.prs || [])].sort(
    (left, right) => (left.number || 0) - (right.number || 0) || left.label.localeCompare(right.label),
  );

  const byUrl = new Map(prs.map(pr => [pr.url, pr]));
  const log = tvLogOf(session); // by number, as their hues go

  const led = new Map((log?.prs || []).filter(pr => byUrl.has(pr.url)).map(pr => [pr.url, pr]));
  const roundsOf = url => led.get(url)?.rounds || byUrl.get(url)?.rounds || [];

  const turns = tvTurnsOf(state.entries);
  const byTool = new Map();

  for (const turn of turns) {
    for (const call of turn.tools) if (call.toolUseId) byTool.set(call.toolUseId, turn);
    Object.assign(turn, { ref: tvNames(session, turn.you), acts: [], ms: Date.parse(turn.at) });
    turn.about = new Set([...turn.ref, ...tvNames(session, turn.reply)]);
  }

  const evs = [];
  const chatAt = [];

  for (const [url, ledger] of led) {
    for (const raw of ledger.ev || []) {
      const event = { ...raw, url, ms: Date.parse(raw.a) };

      if (raw.k === 'chat') {
        chatAt.push(event);

        if (raw.c === session.id) {
          // the call it was, by its id (chat:<chat>:<tool call>:<n>), else the turn it fell in
          event.turn =
            byTool.get(/^chat:[^:]+:(.+):\d+$/.exec(raw.id)?.[1]) ||
            turns.find(turn => turn.ms <= event.ms && event.ms <= Date.parse(turn.end || turn.last) + 1000) ||
            null;

          if (event.turn) {
            event.turn.acts.push(event);
            event.turn.about.add(url);
          }
        }
      }

      evs.push(event);
    }
  }

  // a word of yours GitHub has and the chat's own act on the same PR are one, as in the card's popover: the chat's says where from
  const twin = event =>
    event.w === '' &&
    event.k !== 'chat' &&
    event.k !== 'board' &&
    chatAt.some(act => act.url === event.url && Math.abs(act.ms - event.ms) < 120_000);

  for (const [url] of led) {
    for (const round of roundsOf(url)) {
      // the first prompt after a move is about it
      const from = Date.parse(round.from);
      const until = round.end ? Date.parse(round.end) : Infinity;
      const turn = turns.find(candidate => candidate.you && candidate.ms >= from);

      if (turn && turn.ms <= until + 60_000) turn.about.add(url);
    }
  }

  const model = {
    prs,
    byUrl,
    led,
    roundsOf,
    turns,
    evs: evs.filter(event => !twin(event)).sort((left, right) => left.ms - right.ms),
  };

  for (const turn of turns) turn.closes = new Set(turn.acts.filter(act => tvMark(model, act).k === 'close')); // the acts that answered a round
  return model;
}

/** What an event did to its PR's rounds: opened one (`move`; `live` while it waits on you), closed one, let one go. */
function tvMark(model, event) {
  const rs = model.roundsOf(event.url);

  if (event.k === 'board') return event.x === 'back' ? {} : { k: 'let' };

  const opens =
    event.k !== 'chat' && event.k !== 'opened' && event.w !== '' && rs.find(round => round.from === event.a);

  if (opens) return { k: 'move', r: opens, live: !opens.end && !!model.byUrl.get(event.url)?.turn?.you };

  const closes = rs.find(
    round =>
      round.how === 'answered' &&
      (round.by
        ? event.k === 'chat' && round.by.a === event.a
        : (event.w === '' && round.end === event.a) ||
          (event.k === 'chat' && Math.abs(Date.parse(round.end) - event.ms) < 120_000)),
  );

  if (closes) return { k: 'close', r: closes };
  return event.k === 'ci' && event.s === 'fail' ? { k: 'bad' } : {};
}

/** The PRs in play: at your move, let go, answered in the last PIP_OK_MS, or acted on from this chat — else those
 *  that ever came round to you, else the open ones. */
function tvInPlay(session, model) {
  const play = new Set(inPlay(session).map(entry => entry.pr.url));

  for (const event of model.evs) if (event.k === 'chat' && event.c === session.id) play.add(event.url);
  if (!play.size) for (const pr of model.prs) if (model.roundsOf(pr.url).length) play.add(pr.url);
  if (!play.size) for (const pr of model.prs) if (pr.state === 'open' || pr.state === 'draft') play.add(pr.url);
  return play;
}

// The narrow (2026-10-17, the study's T6): which of the chat and its PRs the timeline shows — and the PR list's tracks
// — one value per chat, kept only where it differs from in play's (tvNarrow), across a reload (keepTabs) and in the
// address beside the chat's id (`#<id>/tl:p=repo.482&t=about`, tvHash). A chip per PR, one for your prompts and one
// for Claude's turns (2026-10-17, each its own): a click in or out, ⌥-click it alone, ⌥-click again everything in
// play; All turns or About these — the turns tied to a PR shown, the default once the PRs are fewer than in play;
// Folded or Everything.
const tvNarrow = new Map(); // chat id → { on: [url…], you: false, claude: false, turns, dens }, each only when not the default
const TV_WHO = { you: 'claude', claude: 'you' }; // the chat's two chips, each to the other

function tvScope(session, model) {
  const play = tvInPlay(session, model);
  const narrow = tvNarrow.get(session.id) || {};
  const urls = new Set(model.prs.map(pr => pr.url));

  const on = narrow.on ? new Set(narrow.on.filter(url => urls.has(url))) : play;
  const fewer = !!narrow.on && [...play].some(url => !on.has(url));

  return {
    play,
    on,
    you: narrow.you !== false,
    claude: narrow.claude !== false,
    turns: narrow.turns || (fewer && on.size ? 'about' : 'all'),
    dens: narrow.dens || 'fold',
    solo: on.size === 1 ? [...on][0] : null,
    n: narrow,
  };
}

const sameSet = (first, second) => first.size === second.size && [...first].every(value => second.has(value));

function tvSet(session, change) {
  const narrow = { ...tvNarrow.get(session.id), ...change };

  for (const key of Object.keys(narrow)) if (narrow[key] === undefined) delete narrow[key];
  if (Object.keys(narrow).length) tvNarrow.set(session.id, narrow);
  else tvNarrow.delete(session.id);
  tvAddress(session);
  keepTabsSoon();
  if (state.current === session.id) renderTimeline(session);
}

function tvToggle(session, url) {
  const sc = tvScope(session, tvModel(session));
  const on = new Set(sc.on);

  if (on.has(url)) on.delete(url);
  else on.add(url);
  tvSet(session, { on: sameSet(on, sc.play) ? undefined : [...on] });
}

const tvAll = { on: undefined, you: undefined, claude: undefined, turns: undefined }; // everything in play

/** ⌥-click: that PR alone — or, alone already, everything in play again. Your prompts' chip or Claude's alone is
 *  that side of the chat alone. */
function tvSolo(session, url) {
  const sc = tvScope(session, tvModel(session));
  const other = TV_WHO[url];

  if (other) {
    return tvSet(
      session,
      sc[url] && !sc[other] && !sc.on.size ? tvAll : { on: [], [url]: undefined, [other]: false, turns: undefined },
    );
  }

  tvSet(session, sc.solo === url && sc.n.on ? { on: undefined, turns: undefined } : { on: [url], turns: undefined });
}

const tvSide = (session, who) => tvSet(session, { [who]: tvScope(session, tvModel(session))[who] ? false : undefined });
const tvLabel = pr => pr.label.replace('#', '.'); // repo#482 → repo.482: a # is the address's own

/** The narrow as the address carries it after the chat's id — empty for in play's. */
function tvHash(id, narrow = tvNarrow.get(id)) {
  const session = state.sessions.get(id);

  if (!narrow || !session) return '';

  const by = new Map((session.prs || []).map(pr => [pr.url, pr]));
  const parts = [];

  if (narrow.on) {
    parts.push(
      `p=${narrow.on
        .map(url => by.get(url))
        .filter(Boolean)
        .map(tvLabel)
        .join(',')}`,
    );
  }

  for (const who in TV_WHO) if (narrow[who] === false) parts.push(`${who}=0`);
  if (narrow.turns) parts.push(`t=${narrow.turns}`);
  if (narrow.dens) parts.push(`d=${narrow.dens}`);
  return parts.length ? `/tl:${parts.join('&')}` : '';
}

function tvAddress(session) {
  if (state.current !== session.id) return;
  const hash = `#${session.id}${tvHash(session.id)}`;

  if (location.hash !== hash) history.replaceState(null, '', hash);
}

/** The narrow an address names (a link's, a reload's, an alert's), as the chat's: true when it names one. */
function tvFromHash(session) {
  const query = /\/tl:([^/]*)$/.exec(location.hash)?.[1];

  if (query == null || !session) return false;

  const params = new URLSearchParams(query);
  const by = new Map((session.prs || []).map(pr => [tvLabel(pr).toLowerCase(), pr.url]));
  const narrow = {};

  if (params.has('p')) {
    narrow.on = params
      .get('p')
      .split(',')
      .map(label => by.get(label.toLowerCase()))
      .filter(Boolean);
  }

  for (const who in TV_WHO) if (params.get(who) === '0') narrow[who] = false;
  if (['all', 'about'].includes(params.get('t'))) narrow.turns = params.get('t');
  if (params.get('d') === 'all') narrow.dens = 'all';
  if (Object.keys(narrow).length) tvNarrow.set(session.id, narrow);
  else tvNarrow.delete(session.id);
  return true;
}

/** The timeline soloed on one PR and gone to its move (N5): the header's your-move tag, a card's move line or its
 *  mark for that PR, an alert that it came round to you. */
function tvOpenOn(session, url) {
  // no PR: the timeline as its narrow stands (a card's menu with no move)
  if (!session || (url && !(session.prs || []).some(pr => pr.url === url))) return;

  if (url) {
    tvNarrow.set(session.id, { ...tvNarrow.get(session.id), on: [url] });
    delete tvNarrow.get(session.id).turns;
    tv.goto = { id: session.id, url };
  }

  if (!timelineOpen.has(session.id)) {
    timelineOpen.add(session.id);
    openNewTab(session, 'timeline');
  } else setTab(session, 'timeline');
  tvAddress(session);
  syncTerm(session);
  focusBoard();
}

const tvSoloHash = (id, url) => {
  const pr = state.sessions.get(id)?.prs?.find(candidate => candidate.url === url);

  return pr ? `${id}/tl:p=${tvLabel(pr)}` : id;
};
