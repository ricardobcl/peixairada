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
const tvSig = s =>
  (s.prs || [])
    .map(
      p =>
        `${p.url} ${p.logged || 0} ${p.state} ${p.turn?.movedAt || ''} ${(p.rounds || []).map(r => r.from + (r.end || '') + (r.let || '')).join()}`,
    )
    .join('\n');
/** The open chat's ledgers: asked when the tab or the PR list wants them, and again once one of them has moved. */
function tvLogOf(s) {
  if (tv.id !== s.id) {
    Object.assign(tv, { id: s.id, log: null, sig: '' });
    tv.opened.clear();
  }
  const sig = tvSig(s);
  if (sig !== tv.sig && !tv.asking && s.prs?.length) {
    tv.asking = true;
    const id = s.id;
    api('GET', `/api/sessions/${encodeURIComponent(id)}/prlog`)
      .then(
        v => v,
        () => null,
      )
      .then(v => {
        tv.asking = false;
        if (tv.id !== id) return;
        tv.sig = sig;
        if (v) {
          tv.log = v;
          prlogs.set(id, { at: Date.now(), v });
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
  let t = null;
  const begin = (at, you = null) => {
    t = { at, you, last: at, end: null, worked: 0, tools: [], reply: '', closed: false, cut: false };
    out.push(t);
  };
  for (const e of entries) {
    if (!e.ts) continue;
    if (e.kind === 'text' && e.role === 'user') {
      begin(e.ts, e.text);
      continue;
    } // one typed mid-turn starts its own line
    if (e.kind === 'interrupt') {
      if (t && !t.closed) Object.assign(t, { end: e.ts, closed: true, cut: true });
      continue;
    }
    if (e.kind === 'compact') continue;
    if (!t || t.closed) begin(e.ts);
    t.last = e.ts;
    if (e.kind === 'tool_use') t.tools.push(e);
    else if (e.kind === 'text' && e.role === 'assistant') {
      t.reply = e.text;
      if (e.turnEnd) Object.assign(t, { end: e.ts, worked: e.worked || 0, closed: true });
    }
  }
  return out;
}
/** …read again only when the entries grew or are another list: the PR list's head asks on every update of the header. */
const tvTurnsMemo = { arr: null, n: -1, turns: null };
function tvTurnsOf(arr) {
  if (tvTurnsMemo.arr !== arr || tvTurnsMemo.n !== arr.length)
    Object.assign(tvTurnsMemo, { arr, n: arr.length, turns: tvTurns(arr) });
  return tvTurnsMemo.turns.map(t => ({ ...t })); // the model writes on its turns
}
const reLit = t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** The chat's PRs a piece of text names: its URL, repo#n, or #n when no other PR of the chat has that number. */
function tvNames(s, text) {
  const out = new Set(),
    prs = s.prs || [];
  if (!text) return out;
  for (const p of prs) {
    const n = p.number,
      repo = p.label.replace(/#.*$/, '');
    if (
      new RegExp(`${reLit(p.url)}(?!\\d)`).test(text) ||
      (n && new RegExp(`\\b${reLit(repo)}\\s?#${n}\\b`, 'i').test(text)) ||
      (n && prs.filter(x => x.number === n).length === 1 && new RegExp(`(^|[^\\w/#])#${n}\\b`).test(text))
    )
      out.add(p.url);
  }
  return out;
}
/** What the timeline reads: the turns, each with the PRs it is about; every PR event, the chat's own tied to its turn. */
function tvModel(s) {
  const prs = [...(s.prs || [])].sort((a, b) => (a.number || 0) - (b.number || 0) || a.label.localeCompare(b.label)),
    byUrl = new Map(prs.map(p => [p.url, p])),
    log = tvLogOf(s); // by number, as their hues go
  const led = new Map((log?.prs || []).filter(p => byUrl.has(p.url)).map(p => [p.url, p]));
  const roundsOf = url => led.get(url)?.rounds || byUrl.get(url)?.rounds || [];
  const turns = tvTurnsOf(state.entries),
    byTool = new Map();
  for (const t of turns) {
    for (const u of t.tools) if (u.toolUseId) byTool.set(u.toolUseId, t);
    Object.assign(t, { ref: tvNames(s, t.you), acts: [], ms: Date.parse(t.at) });
    t.about = new Set([...t.ref, ...tvNames(s, t.reply)]);
  }
  const evs = [],
    chatAt = [];
  for (const [url, l] of led)
    for (const e of l.ev || []) {
      const x = { ...e, url, ms: Date.parse(e.a) };
      if (e.k === 'chat') {
        chatAt.push(x);
        if (e.c === s.id) {
          // the call it was, by its id (chat:<chat>:<tool call>:<n>), else the turn it fell in
          x.turn =
            byTool.get(/^chat:[^:]+:(.+):\d+$/.exec(e.id)?.[1]) ||
            turns.find(t => t.ms <= x.ms && x.ms <= Date.parse(t.end || t.last) + 1000) ||
            null;
          if (x.turn) {
            x.turn.acts.push(x);
            x.turn.about.add(url);
          }
        }
      }
      evs.push(x);
    }
  // a word of yours GitHub has and the chat's own act on the same PR are one, as in the card's popover: the chat's says where from
  const twin = e =>
    e.w === '' &&
    e.k !== 'chat' &&
    e.k !== 'board' &&
    chatAt.some(c => c.url === e.url && Math.abs(c.ms - e.ms) < 120_000);
  for (const [url] of led)
    for (const r of roundsOf(url)) {
      // the first prompt after a move is about it
      const a = Date.parse(r.from),
        b = r.end ? Date.parse(r.end) : Infinity,
        t = turns.find(t => t.you && t.ms >= a);
      if (t && t.ms <= b + 60_000) t.about.add(url);
    }
  const m = { prs, byUrl, led, roundsOf, turns, evs: evs.filter(e => !twin(e)).sort((a, b) => a.ms - b.ms) };
  for (const t of turns) t.closes = new Set(t.acts.filter(a => tvMark(m, a).k === 'close')); // the acts that answered a round
  return m;
}
/** What an event did to its PR's rounds: opened one (`move`; `live` while it waits on you), closed one, let one go. */
function tvMark(m, e) {
  const rs = m.roundsOf(e.url);
  if (e.k === 'board') return e.x === 'back' ? {} : { k: 'let' };
  const opens = e.k !== 'chat' && e.k !== 'opened' && e.w !== '' && rs.find(r => r.from === e.a);
  if (opens) return { k: 'move', r: opens, live: !opens.end && !!m.byUrl.get(e.url)?.turn?.you };
  const closes = rs.find(
    r =>
      r.how === 'answered' &&
      (r.by
        ? e.k === 'chat' && r.by.a === e.a
        : (e.w === '' && r.end === e.a) || (e.k === 'chat' && Math.abs(Date.parse(r.end) - e.ms) < 120_000)),
  );
  if (closes) return { k: 'close', r: closes };
  return e.k === 'ci' && e.s === 'fail' ? { k: 'bad' } : {};
}
/** The PRs in play: at your move, let go, answered in the last PIP_OK_MS, or acted on from this chat — else those
 *  that ever came round to you, else the open ones. */
function tvInPlay(s, m) {
  const play = new Set(inPlay(s).map(x => x.pr.url));
  for (const e of m.evs) if (e.k === 'chat' && e.c === s.id) play.add(e.url);
  if (!play.size) for (const p of m.prs) if (m.roundsOf(p.url).length) play.add(p.url);
  if (!play.size) for (const p of m.prs) if (p.state === 'open' || p.state === 'draft') play.add(p.url);
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
function tvScope(s, m) {
  const play = tvInPlay(s, m),
    n = tvNarrow.get(s.id) || {},
    urls = new Set(m.prs.map(p => p.url));
  const on = n.on ? new Set(n.on.filter(u => urls.has(u))) : play,
    fewer = !!n.on && [...play].some(u => !on.has(u));
  return {
    play,
    on,
    you: n.you !== false,
    claude: n.claude !== false,
    turns: n.turns || (fewer && on.size ? 'about' : 'all'),
    dens: n.dens || 'fold',
    solo: on.size === 1 ? [...on][0] : null,
    n,
  };
}
const sameSet = (a, b) => a.size === b.size && [...a].every(x => b.has(x));
function tvSet(s, change) {
  const n = { ...tvNarrow.get(s.id), ...change };
  for (const k of Object.keys(n)) if (n[k] === undefined) delete n[k];
  if (Object.keys(n).length) tvNarrow.set(s.id, n);
  else tvNarrow.delete(s.id);
  tvAddress(s);
  keepTabsSoon();
  if (state.current === s.id) renderTimeline(s);
}
function tvToggle(s, url) {
  const sc = tvScope(s, tvModel(s)),
    on = new Set(sc.on);
  if (on.has(url)) on.delete(url);
  else on.add(url);
  tvSet(s, { on: sameSet(on, sc.play) ? undefined : [...on] });
}
const tvAll = { on: undefined, you: undefined, claude: undefined, turns: undefined }; // everything in play
/** ⌥-click: that PR alone — or, alone already, everything in play again. Your prompts' chip or Claude's alone is
 *  that side of the chat alone. */
function tvSolo(s, url) {
  const sc = tvScope(s, tvModel(s)),
    o = TV_WHO[url];
  if (o)
    return tvSet(
      s,
      sc[url] && !sc[o] && !sc.on.size ? tvAll : { on: [], [url]: undefined, [o]: false, turns: undefined },
    );
  tvSet(s, sc.solo === url && sc.n.on ? { on: undefined, turns: undefined } : { on: [url], turns: undefined });
}
const tvSide = (s, who) => tvSet(s, { [who]: tvScope(s, tvModel(s))[who] ? false : undefined });
const tvLabel = p => p.label.replace('#', '.'); // repo#482 → repo.482: a # is the address's own
/** The narrow as the address carries it after the chat's id — empty for in play's. */
function tvHash(id, n = tvNarrow.get(id)) {
  const s = state.sessions.get(id);
  if (!n || !s) return '';
  const by = new Map((s.prs || []).map(p => [p.url, p])),
    q = [];
  if (n.on)
    q.push(
      'p=' +
        n.on
          .map(u => by.get(u))
          .filter(Boolean)
          .map(tvLabel)
          .join(','),
    );
  for (const w in TV_WHO) if (n[w] === false) q.push(w + '=0');
  if (n.turns) q.push('t=' + n.turns);
  if (n.dens) q.push('d=' + n.dens);
  return q.length ? '/tl:' + q.join('&') : '';
}
function tvAddress(s) {
  if (state.current !== s.id) return;
  const h = '#' + s.id + tvHash(s.id);
  if (location.hash !== h) history.replaceState(null, '', h);
}
/** The narrow an address names (a link's, a reload's, an alert's), as the chat's: true when it names one. */
function tvFromHash(s) {
  const t = /\/tl:([^/]*)$/.exec(location.hash)?.[1];
  if (t == null || !s) return false;
  const q = new URLSearchParams(t),
    by = new Map((s.prs || []).map(p => [tvLabel(p).toLowerCase(), p.url])),
    n = {};
  if (q.has('p'))
    n.on = q
      .get('p')
      .split(',')
      .map(l => by.get(l.toLowerCase()))
      .filter(Boolean);
  for (const w in TV_WHO) if (q.get(w) === '0') n[w] = false;
  if (['all', 'about'].includes(q.get('t'))) n.turns = q.get('t');
  if (q.get('d') === 'all') n.dens = 'all';
  if (Object.keys(n).length) tvNarrow.set(s.id, n);
  else tvNarrow.delete(s.id);
  return true;
}
/** The timeline soloed on one PR and gone to its move (N5): the header's your-move tag, a card's move line or its
 *  mark for that PR, an alert that it came round to you. */
function tvOpenOn(s, url) {
  // no PR: the timeline as its narrow stands (a card's menu with no move)
  if (!s || (url && !(s.prs || []).some(p => p.url === url))) return;
  if (url) {
    tvNarrow.set(s.id, { ...tvNarrow.get(s.id), on: [url] });
    delete tvNarrow.get(s.id).turns;
    tv.goto = { id: s.id, url };
  }
  if (!timelineOpen.has(s.id)) {
    timelineOpen.add(s.id);
    openNewTab(s, 'timeline');
  } else setTab(s, 'timeline');
  tvAddress(s);
  syncTerm(s);
  focusBoard();
}
const tvSoloHash = (id, url) => {
  const p = state.sessions.get(id)?.prs?.find(x => x.url === url);
  return p ? `${id}/tl:p=${tvLabel(p)}` : id;
};
