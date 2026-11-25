  // ---- SSE ----------------------------------------------------------------------------
  // The fish is the SSE light and, clicked, the About box (2026-09-27): what the board is, its version and process,
  // where it reads and writes, and the chats it holds. A modal <dialog>, so the pane goes down under it and Esc closes
  // it like any other.
  function aboutOpen() {
    const a = state.about || {}, all = projectList()[0] || {};
    const facts = [
      ['version', esc(state.update?.version || a.version || '?')],
      ['code', (u => !u?.checkout ? (u?.checkout === false ? 'not a git checkout' : '?') : `<code>${shortSha(u.head)}</code>${u.branch ? ` on ${esc(u.branch)}` : ''}${u.last ? ` · updated ${rel(u.last.at)} ago` : ''}${u.on ? ' · updates itself' : ''}`)(state.update)],
      ['server', `http://127.0.0.1:${a.port || location.port}${a.node ? ` · node ${esc(a.node)}` : ''}${a.pid ? ` · pid ${a.pid}` : ''}${a.since ? ` · up ${rel(a.since)}` : ''}`],
      ['reads', `${esc(homePath(a.claudeDir || '~/.claude'))} — and writes nothing there`],
      ['setup', esc(homePath(a.configFile || '?'))],
      ['state', esc(homePath(a.stateFile || '?'))],
      ['chats', `${[...state.sessions.values()].filter(s => s.alive).length} live · ${all.ready ?? 0} ready · ${all.working ?? 0} clauding`],
    ];
    $('#about').innerHTML = `${FISH_LOGO()}<h3>peix<em>AI</em>rada</h3><p class="tag">One board for every Claude Code chat on this Mac.</p><div class="facts">${facts.map(([k, v]) => `<b>${k}</b><span>${v}</span>`).join('')}</div><p class="help">The keys and the switches are in the settings — ⌘, or the chat header's ···.</p><p class="help"><button class="btn" id="aboutTour" title="The board's main parts, one at a time — a couple of minutes">Take the tour</button> <button class="btn" id="aboutCopy" title="The version, macOS and the shape of the window, for a report of something wrong — no chat, path or address">Copy details</button></p><pre id="aboutDetails" hidden></pre>`;
    if (inApp) post({ type: 'details' });   // asked now: by the click the clipboard wants its text at once
    $('#about').showModal(); repostPane();
  }
  $('#about').addEventListener('click', e => { if (e.target === $('#about')) $('#about').close(); else if (e.target.closest('#aboutTour')) tourStart(); else if (e.target.closest('#aboutCopy')) copyDetails(); });   // the backdrop; the tour (2026-10-14)
  // What a report wants (2026-11-04): which board it is and what shape its window is, since a bug of one shape never reaches
  // the Mac that lives in another. No chat, path or address: a page's tab is its kind, a view its place. The shell's part
  // comes when About opens (`details` → peixDetails: the view as placed, in the window's terms); an app older than this
  // says nothing, which says that much.
  let shellDetails = null;
  window.peixDetails = d => { shellDetails = d; };
  function detailsText() {
    const a = state.about || {}, u = state.update || {}, d = shellDetails, s = state.sessions.get(state.current);
    const code = !u.checkout ? (u.checkout === false ? 'not a git checkout' : '?') : `commit ${shortSha(u.head)}${u.branch ? ` on ${u.branch}` : ''}`;
    const lines = [`peixAIrada ${u.version || a.version || '?'} · ${code}`];
    if (!inApp) lines.push(`a browser: ${navigator.userAgent}`, `window: ${innerWidth}×${innerHeight}`);
    else if (!d) lines.push(`the app: says nothing of its window, so older than this page${u.app?.behind ? ' (behind this checkout)' : ''}`);
    else lines.push(
      `the app: ${d.app || 'not a bundle'}${u.app ? (u.app.behind ? ', behind this checkout' : ', built from this checkout') : ''}`,
      `macOS: ${d.macos}`,
      `window: ${{ fill: 'the fill', full: 'macOS\'s full screen', window: 'a normal window' }[d.mode] || d.mode}, ${d.w}×${d.h}, the page ${d.inset} pt down, zoom ${d.zoom}`,
      `screen: ${d.screen ? `${d.screen[0]}×${d.screen[1]} @${d.screen[2]}×${d.housing ? ', a camera housing' : ''}` : 'none'}, ${d.screens} in all`);
    if (s) {
      const p = placeOf(s), r = (sel, q) => { const b = $(sel).getBoundingClientRect(); return Math.round(b[q]); };
      lines.push(`column: ${splitNow() ? (stackNow() ? 'one half over the other' : 'side by side') : 'one half'} · tabs ${p.map(k => (k || 'none').split(':')[0]).join(' | ')} · the keys in half ${focusG + 1}`);
      p.forEach((k, g) => { if (k && isPaneTab(k)) lines.push(`half ${g + 1} in the page's px: strip ${r(GEL[g].tabs, 'top')}–${r(GEL[g].tabs, 'bottom')}, body ${r(GEL[g].body, 'top')}–${r(GEL[g].body, 'bottom')}, from x ${r(GEL[g].body, 'left')}`); });
      if (d?.views?.length) lines.push(`pages' views in the window's pt: ${d.views.map(v => `${v[2]}×${v[3]} at ${v[0]},${v[1]}`).join(' · ')}`);
    }
    if (inApp) lines.push(`settings: ⌃⌘F ${prefs.fullSpace ? 'its own Space' : 'the fill'} · ${prefs.pagesOut ? 'some pages' : 'every page'} in the board · the in-app editor ${prefs.inEditor || 'code'} · text size ${prefs.pageZoom || 1}`);
    return lines.join('\n');
  }
  async function copyDetails() {
    const b = $('#aboutCopy'), box = $('#aboutDetails'), text = detailsText();
    box.textContent = text; box.hidden = false;   // what goes, in sight — and there to select by hand if the clipboard says no
    let ok = await copyText(text);
    if (!ok) { const r = document.createRange(); r.selectNodeContents(box); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); try { ok = document.execCommand('copy'); } catch {} }
    b.textContent = ok ? 'Copied' : 'Select it and ⌘C';
    clearTimeout(b.timer); b.timer = setTimeout(() => { b.textContent = 'Copy details'; }, 1600);
  }
  // The open chat's transcript as the page holds it (2026-10-03): which reading of the file (`gen` — a re-read numbers
  // its entries afresh), how many of them it has (`upto`), and what the stream said while a fetch was on its way
  // (`pending`). The fetch and the stream raced: an entry pushed before the answer landed went into the last chat's
  // array, one in both was drawn twice, one pushed while a long chat was read was lost.
  // Each ask is numbered and only the newest answer is taken (2026-10-14): two for one chat (a double click on its card,
  // A → B → A) took both, and the second, read before what the stream had brought since the first, put the log back.
  const logOf = { id: null, gen: null, upto: null, waiting: false, pending: [], ask: 0 };
  /** A fetch on its way for chat `id`: the stream's entries wait for it. Its number, for `newest()`. */
  const awaitEntries = id => Object.assign(logOf, { id, waiting: true, ask: logOf.ask + 1, pending: logOf.id === id ? logOf.pending : [] }).ask;
  const newest = ask => logOf.ask === ask;
  /** A fetch's answer — its entries and its count (none: whatever comes is taken whole) — then what the stream said
   *  meanwhile. */
  function takeEntries(id, data) {
    const pending = logOf.id === id ? logOf.pending : [];
    state.entries = data.entries; Object.assign(logOf, { id, gen: data.gen ?? null, upto: data.upto ?? null, waiting: false, pending: [] });
    for (const d of pending) mergeEntries(d);
  }
  /** The stream's entries for the open chat: only those past what the page has; another reading or a gap is a fetch. */
  function mergeEntries(d) {
    if (logOf.id !== d.sessionId) return;
    if (logOf.waiting) { logOf.pending.push(d); return; }   // the fetch is on its way: after it
    if (d.upto == null || logOf.upto == null) { state.entries.push(...d.entries); return; }   // a server from before the numbers, or a fetch that failed
    if (d.gen !== logOf.gen) { refetchCurrent(); return; }
    const from = d.upto - d.entries.length;
    if (d.upto <= logOf.upto) return;                               // had them all
    if (from > logOf.upto) { refetchCurrent(); return; }            // some went missing between
    state.entries.push(...d.entries.slice(logOf.upto - from)); logOf.upto = d.upto;
  }
  // …and the summary: an answer older than a `session` event that came while it was on its way does not undo it
  const sessionSeen = new Map();   // chat id → how many session events have come for it
  function takeSession(id, data, seen) { if ((sessionSeen.get(id) || 0) === seen) state.sessions.set(id, data.session); return state.sessions.get(id) || data.session; }
  /** The open chat again — its summary, its entries, its tabs — without moving anything else on the page. */
  async function refetchCurrent() {
    const id = state.current; if (!id) return;
    const was = { entries: state.entries, gen: logOf.gen, upto: logOf.upto }, seen = sessionSeen.get(id) || 0;
    const ask = awaitEntries(id);
    const data = await api('GET', `/api/sessions/${id}/messages`).catch(() => null);
    if (state.current !== id || !newest(ask)) return;
    if (!data) { takeEntries(id, was); renderLog(); return; }   // what it had stands, and what came meanwhile is added
    const s = takeSession(id, data, seen); takeEntries(id, data); renderHead(s); renderLog(); syncTerm(s);
  }
  function connect() {
    const es = new EventSource(keyed('/events'));
    es.onopen = () => {
      const was = !bar.conn;
      bar.conn = true; bar.lost = false; bar.back = was; renderBar();
      if (was) { noteMotion(null, 'fishback'); clearTimeout(bar.backT); bar.backT = setTimeout(() => { bar.back = false; renderBar(); }, 900); }
    };
    es.onerror = () => { bar.conn = false; bar.back = false; bar.lost = es.readyState === EventSource.CLOSED; renderBar(); if (bar.lost) api('GET', '/api/key').catch(() => {}); };   // a stream turned away: for want of the key, the lock
    es.addEventListener('snapshot', e => {
      const d = JSON.parse(e.data); state.snapshots++; if (state.snapshots === 1) setTimeout(cueWave, 600);   // the harness waits on the count: a reloaded page has its board
      if ($('#lock').open) $('#lock').close();   // the stream let in: the key holds
      state.sessions = new Map(d.sessions.map(s => [s.id, s])); state.projects = d.projects || []; state.pins = d.pins || []; state.priority = d.priority || []; state.hidden = d.hidden || []; state.repos = d.repos || {};
      for (const m of [tabs, homes, splits, autoSplit, stacked, zoomed, focusView, state.unread, state.paneGh, state.paneWt, changesOpen, timelineOpen, tvNarrow, blanks, diffStats, reviews, agentTabs]) for (const id of [...m.keys()]) if (!state.sessions.has(id)) m.delete(id);
      for (const id of Object.keys(prefs.agentCards)) if (!state.sessions.has(id)) delete prefs.agentCards[id];   // a chat gone from the board takes its page state with it
      state.about = d.about || {};
      if (d.config) state.config = d.config;
      renderSetup();
      state.notifications = d.notifications !== false; showNotify();
      takeUpdate(d.update); pageFollows(d);
      if (d.awake) state.awake = awakeOf(d.awake);
      if (d.chat) { state.chat = d.chat; chatChanged(); }
      if (d.lunch) { state.lunch = d.lunch; lunchChanged(); }
      state.clones = new Map((d.clones || []).map(c => [c.dir, c]));   // the clones under way, a reload in the middle of one
      state.editors = d.editors || null; edSay();   // whether Zed is on this Mac, and its install
      state.key = d.key || null; showKey();
      state.serverNotify = d.notify === 'native';   // the server posts its own banners: the app must not double them
      renderBoard(); welcomeSync();
      const want = hashId();
      if (want && !state.current && state.sessions.has(want) && noneLeft(state.sessions.get(want))) leaveEmpty(state.sessions.get(want));
      else if (want && !state.current && state.sessions.has(want)) { tvFromHash(state.sessions.get(want)); openSession(want); }
      else if (!state.current) showHome();   // nothing to open: the home (2026-10-10)
      // A snapshot with a chat already open is a reconnect — the server restarted, the stream dropped — and the entries
      // pushed while the stream was down never came (2026-09-27): fetch the open chat again, in place. Not openSession,
      // which would close the PR in the pane and scroll the list.
      else if (state.current && state.sessions.has(state.current)) refetchCurrent();
    });
    es.addEventListener('session', e => {
      const s = JSON.parse(e.data), was = state.sessions.get(s.id); state.sessions.set(s.id, s); sessionSeen.set(s.id, (sessionSeen.get(s.id) || 0) + 1);
      const landed = was?.status === 'working' && s.status === 'idle' && !s.done;
      if (landed) { landedAt.set(s.id, performance.now()); noteMotion(s.id, 'landed'); }   // the reply landed: the card flares once (flareLanded)
      const woke = !!was && !!s.wokeAt && s.wokeAt !== was.wokeAt;   // back from a snooze: its card flares once as it arrives (2026-11-24, round XXX's H4)
      if (woke) { landedAt.set(s.id, performance.now()); noteMotion(s.id, 'woke'); }
      const heard = was && asking(was) && !asking(s) && s.alive && !s.done;
      if (heard) { heardAt.set(s.id, performance.now()); noteMotion(s.id, 'heard'); }   // the question answered: its card hears it (flareLanded)
      if (s.id === state.current && s.removed) { if (!was?.removed) { moveOn(s.id); if (state.current === s.id) leaveChat(); } }   // deleted from another page; found by ⌥⌘K, it stays open
      else if (s.id === state.current && !visible(s) && s.done) leaveChat();   // an empty chat ticked done: its card is gone, and so is the chat
      else if (s.id === state.current && noneLeft(s)) leaveEmpty(s);
      if (s.id === state.current && String(s.lastUserAt || '') > String(was?.lastUserAt || '')) followCard.id = s.id;   // your word: the next draw takes the list to its card
      if (landed || heard || woke) renderBoard(); else renderBoardSoon();   // a landing is drawn as it is said, flare and all
      zeHeard(s, was, landed);   // Zé's game, if it is up: a question pauses it
      ovSoon();   // the overview (⌥⌘A, 2026-10-10) follows its chats while it is up
      homeSoon(landed);   // …and the home its facts, the day again when a turn lands
      if (s.id === state.current) { renderHead(s); syncTerm(s); renderPresence(); }
      else if (state.sessions.get(state.current)?.links?.some(l => l.id === s.id)) renderResume(state.sessions.get(state.current));   // where it went on may have only just come up (2026-11-04)
      // The chats step follows its chats — one ticked there leaves, one that stopped clauding says ready.
      if ($('#pick').open && pick.mode === 'chats' && (pick.list.some(x => x.id === s.id) || scopeChats(pick.ctx).some(x => x.id === s.id))) pickRender(true);
    });
    es.addEventListener('entries', e => { const d = JSON.parse(e.data); if (d.sessionId === state.current) { mergeEntries(d); renderLog(); } });
    es.addEventListener('projects', e => { state.projects = JSON.parse(e.data).projects || []; renderBoardSoon(); });
    es.addEventListener('repos', e => { state.repos = JSON.parse(e.data).repos || {}; });
    es.addEventListener('pins', e => { state.pins = JSON.parse(e.data).pins || []; renderBoardSoon(); });
    es.addEventListener('priority', e => { state.priority = JSON.parse(e.data).priority || []; renderBoardSoon(); });   // Top priority's order (2026-11-24), another page's or a /clear's
    es.addEventListener('hidden', e => { state.hidden = JSON.parse(e.data).hidden || []; renderBoard(); if ($('#pick').open) pickRender(); });
    es.addEventListener('notifications', e => { state.notifications = JSON.parse(e.data).on !== false; showNotify(); });
    es.addEventListener('update', e => takeUpdate(JSON.parse(e.data)));
    es.addEventListener('awake', e => { state.awake = awakeOf(JSON.parse(e.data)); awakeChanged(); });
    es.addEventListener('clone', e => cloneEvent(JSON.parse(e.data)));
    es.addEventListener('editor', e => { state.editors = JSON.parse(e.data); edSay(); });
    es.addEventListener('key', e => { state.key = JSON.parse(e.data); showKey(); });
    es.addEventListener('config', e => { const c = JSON.parse(e.data); if (JSON.stringify(c) === JSON.stringify(state.config)) return; state.config = c; configChanged(); });   // the echo of a save made here is no news
    es.addEventListener('terminal', e => {
      const t = JSON.parse(e.data);
      const term = termFor(t.id); if (!term) return;
      // The holder's chat changed: a new chat just registered, or /clear (or /resume) in the drawer gave the same
      // process a new session id and the server re-linked the holder (2026-09-20). Follow it — the drawer stays
      // attached, the pane shows the chat it now runs; the old card is a stale chat now, and opening it again would
      // resume the old context in a second process.
      if (t.sessionId && t.sessionId !== term.sessionId) { const was = term.sessionId; term.sessionId = t.sessionId; if (was) carryChat(was, t.sessionId); if (state.current !== t.sessionId) openSession(t.sessionId); }
      if (t.exited !== null) termEnded(term, t.exited);
    });
    // The process's column goes on with it (2026-10-14): its tabs, its split and how it stands, its pages, its changes
    // tab, its /focus — the per-chat page state, keyed by the chat it left, moved to the one it runs now; not onto a
    // chat that has a layout of its own (a /resume into a chat the board has shown), and never its unread count.
    function carryChat(from, to) {
      const maps = [tabs, homes, zoomed, focusView, state.paneGh, state.paneWt, blanks, changes.pr, tvNarrow, reviews, agentTabs], sets = [splits, autoSplit, stacked, changesOpen, timelineOpen];
      if (![...maps, ...sets].some(m => m.has(from)) || [...maps, ...sets].some(m => m.has(to))) return;
      for (const m of maps) if (m.has(from)) { m.set(to, m.get(from)); m.delete(from); }
      for (const m of sets) if (m.has(from)) { m.add(to); m.delete(from); }
    }
    es.addEventListener('alert', e => onAlert(JSON.parse(e.data)));
    es.addEventListener('chat', e => { state.chat = JSON.parse(e.data); chatChanged(); });
    es.addEventListener('lunch', e => { state.lunch = JSON.parse(e.data); lunchChanged(); });
    es.addEventListener('chatmsgs', e => chatMsgs(JSON.parse(e.data)));
  }
  keyReady.then(connect);   // a ticket in the address first: the stream wants the key it is traded for
