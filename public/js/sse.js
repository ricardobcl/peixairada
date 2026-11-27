// ---- SSE ----------------------------------------------------------------------------
// The fish is the SSE light and, clicked, the About box (2026-09-27): what the board is, its version and process,
// where it reads and writes, and the chats it holds. A modal <dialog>, so the pane goes down under it and Esc closes
// it like any other.
function aboutOpen() {
  const about = state.about || {};
  const all = projectList()[0] || {};

  const facts = [
    ['version', esc(state.update?.version || about.version || '?')],
    [
      'code',
      (update =>
        !update?.checkout
          ? update?.checkout === false
            ? 'not a git checkout'
            : '?'
          : `<code>${shortSha(update.head)}</code>${update.branch ? ` on ${esc(update.branch)}` : ''}${update.last ? ` · updated ${rel(update.last.at)} ago` : ''}${update.on ? ' · updates itself' : ''}`)(
        state.update,
      ),
    ],
    [
      'server',
      `http://127.0.0.1:${about.port || location.port}${about.node ? ` · node ${esc(about.node)}` : ''}${about.pid ? ` · pid ${about.pid}` : ''}${about.since ? ` · up ${rel(about.since)}` : ''}`,
    ],
    ['reads', `${esc(homePath(about.claudeDir || '~/.claude'))} — and writes nothing there`],
    ['setup', esc(homePath(about.configFile || '?'))],
    ['state', esc(homePath(about.stateFile || '?'))],
    [
      'chats',
      `${[...state.sessions.values()].filter(session => session.alive).length} live · ${all.ready ?? 0} ready · ${all.working ?? 0} clauding`,
    ],
  ];

  $('#about').innerHTML =
    `${FISH_LOGO()}<h3>peix<em>AI</em>rada</h3><p class="tag">One board for every Claude Code chat on this Mac.</p><div class="facts">${facts.map(([label, value]) => `<b>${label}</b><span>${value}</span>`).join('')}</div><p class="help">The keys and the switches are in the settings — ⌘, or the chat header's ···.</p><p class="help"><button class="btn" id="aboutTour" title="The board's main parts, one at a time — a couple of minutes">Take the tour</button> <button class="btn" id="aboutCopy" title="The version, macOS and the shape of the window, for a report of something wrong — no chat, path or address">Copy details</button></p><pre id="aboutDetails" hidden></pre>`;

  if (inApp) post({ type: 'details' }); // asked now: by the click the clipboard wants its text at once
  $('#about').showModal();
  repostPane();
}

$('#about').addEventListener('click', event => {
  if (event.target === $('#about')) $('#about').close();
  else if (event.target.closest('#aboutTour')) tourStart();
  else if (event.target.closest('#aboutCopy')) copyDetails();
}); // the backdrop; the tour (2026-10-14)

// What a report wants (2026-11-04): which board it is and what shape its window is, since a bug of one shape never reaches
// the Mac that lives in another. No chat, path or address: a page's tab is its kind, a view its place. The shell's part
// comes when About opens (`details` → peixDetails: the view as placed, in the window's terms); an app older than this
// says nothing, which says that much.
let shellDetails = null;

window.peixDetails = details => {
  shellDetails = details;
};

function detailsText() {
  const about = state.about || {};
  const update = state.update || {};
  const details = shellDetails;
  const session = state.sessions.get(state.current);

  const code = !update.checkout
    ? update.checkout === false
      ? 'not a git checkout'
      : '?'
    : `commit ${shortSha(update.head)}${update.branch ? ` on ${update.branch}` : ''}`;

  const lines = [`peixAIrada ${update.version || about.version || '?'} · ${code}`];

  if (!inApp) lines.push(`a browser: ${navigator.userAgent}`, `window: ${innerWidth}×${innerHeight}`);
  else if (!details) {
    lines.push(
      `the app: says nothing of its window, so older than this page${update.app?.behind ? ' (behind this checkout)' : ''}`,
    );
  } else {
    lines.push(
      `the app: ${details.app || 'not a bundle'}${update.app ? (update.app.behind ? ', behind this checkout' : ', built from this checkout') : ''}`,
      `macOS: ${details.macos}`,
      `window: ${{ fill: 'the fill', full: "macOS's full screen", window: 'a normal window' }[details.mode] || details.mode}, ${details.w}×${details.h}, the page ${details.inset} pt down, zoom ${details.zoom}`,
      `screen: ${details.screen ? `${details.screen[0]}×${details.screen[1]} @${details.screen[2]}×${details.housing ? ', a camera housing' : ''}` : 'none'}, ${details.screens} in all`,
    );
  }

  if (session) {
    const place = placeOf(session);

    const edgeOf = (sel, side) => {
      const rect = $(sel).getBoundingClientRect();

      return Math.round(rect[side]);
    };

    lines.push(
      `column: ${splitNow() ? (stackNow() ? 'one half over the other' : 'side by side') : 'one half'} · tabs ${place.map(key => (key || 'none').split(':')[0]).join(' | ')} · the keys in half ${focusG + 1}`,
    );

    place.forEach((key, half) => {
      if (key && isPaneTab(key)) {
        lines.push(
          `half ${half + 1} in the page's px: strip ${edgeOf(GEL[half].tabs, 'top')}–${edgeOf(GEL[half].tabs, 'bottom')}, body ${edgeOf(GEL[half].body, 'top')}–${edgeOf(GEL[half].body, 'bottom')}, from x ${edgeOf(GEL[half].body, 'left')}`,
        );
      }
    });

    if (details?.views?.length) {
      lines.push(
        `pages' views in the window's pt: ${details.views.map(view => `${view[2]}×${view[3]} at ${view[0]},${view[1]}`).join(' · ')}`,
      );
    }
  }

  if (inApp) {
    lines.push(
      `settings: ⌃⌘F ${prefs.fullSpace ? 'its own Space' : 'the fill'} · ${prefs.pagesOut ? 'some pages' : 'every page'} in the board · the in-app editor ${prefs.inEditor || 'code'} · text size ${prefs.pageZoom || 1}`,
    );
  }

  return lines.join('\n');
}

async function copyDetails() {
  const button = $('#aboutCopy');
  const box = $('#aboutDetails');
  const text = detailsText();

  box.textContent = text;
  box.hidden = false; // what goes, in sight — and there to select by hand if the clipboard says no
  let ok = await copyText(text);

  if (!ok) {
    const range = document.createRange();

    range.selectNodeContents(box);
    const sel = getSelection();

    sel.removeAllRanges();
    sel.addRange(range);

    try {
      ok = document.execCommand('copy');
    } catch {}
  }

  button.textContent = ok ? 'Copied' : 'Select it and ⌘C';
  clearTimeout(button.timer);

  button.timer = setTimeout(() => {
    button.textContent = 'Copy details';
  }, 1600);
}

// The open chat's transcript as the page holds it (2026-10-03): which reading of the file (`gen` — a re-read numbers
// its entries afresh), how many of them it has (`upto`), and what the stream said while a fetch was on its way
// (`pending`). The fetch and the stream raced: an entry pushed before the answer landed went into the last chat's
// array, one in both was drawn twice, one pushed while a long chat was read was lost.
// Each ask is numbered and only the newest answer is taken (2026-10-14): two for one chat (a double click on its card,
// A → B → A) took both, and the second, read before what the stream had brought since the first, put the log back.
const logOf = { id: null, gen: null, upto: null, waiting: false, pending: [], ask: 0 };

/** A fetch on its way for chat `id`: the stream's entries wait for it. Its number, for `newest()`. */
const awaitEntries = id =>
  Object.assign(logOf, { id, waiting: true, ask: logOf.ask + 1, pending: logOf.id === id ? logOf.pending : [] }).ask;

const newest = ask => logOf.ask === ask;

/** A fetch's answer — its entries and its count (none: whatever comes is taken whole) — then what the stream said
 *  meanwhile. */
function takeEntries(id, data) {
  const pending = logOf.id === id ? logOf.pending : [];

  state.entries = data.entries;
  Object.assign(logOf, { id, gen: data.gen ?? null, upto: data.upto ?? null, waiting: false, pending: [] });
  for (const batch of pending) mergeEntries(batch);
}

/** The stream's entries for the open chat: only those past what the page has; another reading or a gap is a fetch. */
function mergeEntries(batch) {
  if (logOf.id !== batch.sessionId) return;

  if (logOf.waiting) {
    logOf.pending.push(batch);
    return;
  } // the fetch is on its way: after it

  if (batch.upto == null || logOf.upto == null) {
    state.entries.push(...batch.entries);
    return;
  } // a server from before the numbers, or a fetch that failed

  if (batch.gen !== logOf.gen) {
    refetchCurrent();
    return;
  }

  const from = batch.upto - batch.entries.length;

  if (batch.upto <= logOf.upto) return; // had them all

  if (from > logOf.upto) {
    refetchCurrent();
    return;
  } // some went missing between

  state.entries.push(...batch.entries.slice(logOf.upto - from));
  logOf.upto = batch.upto;
}

// …and the summary: an answer older than a `session` event that came while it was on its way does not undo it
const sessionSeen = new Map(); // chat id → how many session events have come for it

function takeSession(id, data, seen) {
  if ((sessionSeen.get(id) || 0) === seen) state.sessions.set(id, data.session);
  return state.sessions.get(id) || data.session;
}

/** The open chat again — its summary, its entries, its tabs — without moving anything else on the page. */
async function refetchCurrent() {
  const id = state.current;

  if (!id) return;

  const was = { entries: state.entries, gen: logOf.gen, upto: logOf.upto };
  const seen = sessionSeen.get(id) || 0;

  const ask = awaitEntries(id);
  const data = await api('GET', `/api/sessions/${id}/messages`).catch(() => null);

  if (state.current !== id || !newest(ask)) return;

  if (!data) {
    takeEntries(id, was);
    renderLog();
    return;
  } // what it had stands, and what came meanwhile is added

  const session = takeSession(id, data, seen);

  takeEntries(id, data);
  renderHead(session);
  renderLog();
  syncTerm(session);
}

// The stream is opened again by hand, never by the browser's own retry (2026-11-27): that sends its keyed address to
// whatever answers next on the port. A drop doubts the server, and the next stream waits for its proof (keySafe).
let stream = null;
let streamTries = 0;

const connectSoon = () => setTimeout(connect, Math.min(5000, 250 * 2 ** streamTries++)); // a stream that keeps failing waits longer

async function connect() {
  await keySafe();
  const es = (stream = new EventSource(keyed('/events')));

  es.onopen = () => {
    streamTries = 0;
    const was = !bar.conn;

    bar.conn = true;
    bar.lost = false;
    bar.back = was;
    renderBar();

    if (was) {
      noteMotion(null, 'fishback');
      clearTimeout(bar.backT);

      bar.backT = setTimeout(() => {
        bar.back = false;
        renderBar();
      }, 900);
    }
  };

  es.onerror = () => {
    if (stream !== es) return;
    bar.conn = false;
    bar.back = false;
    bar.lost = es.readyState === EventSource.CLOSED;
    renderBar();
    es.close();
    stream = null;
    doubtServer();
    if (bar.lost) {
      api('GET', '/api/key').then(connectSoon, () => {});
    } // turned away: for want of the key, the lock; else again
    else connectSoon();
  };

  es.addEventListener('snapshot', event => {
    const snapshot = JSON.parse(event.data);

    state.snapshots++;
    if (state.snapshots === 1) setTimeout(cueWave, 600); // the harness waits on the count: a reloaded page has its board
    if ($('#lock').open) $('#lock').close(); // the stream let in: the key holds
    state.sessions = new Map(snapshot.sessions.map(session => [session.id, session]));
    state.projects = snapshot.projects || [];
    state.pins = snapshot.pins || [];
    state.priority = snapshot.priority || [];
    state.hidden = snapshot.hidden || [];
    state.repos = snapshot.repos || {};

    for (const map of [
      tabs,
      homes,
      splits,
      autoSplit,
      stacked,
      zoomed,
      trees,
      tileSeen,
      focusView,
      state.unread,
      state.paneGh,
      state.paneWt,
      changesOpen,
      timelineOpen,
      tvNarrow,
      blanks,
      diffStats,
      reviews,
      agentTabs,
    ]) {
      for (const id of [...map.keys()]) if (!state.sessions.has(id)) map.delete(id);
    }

    for (const id of Object.keys(prefs.agentCards)) if (!state.sessions.has(id)) delete prefs.agentCards[id]; // a chat gone from the board takes its page state with it
    state.about = snapshot.about || {};
    if (snapshot.config) state.config = snapshot.config;
    renderSetup();
    state.notifications = snapshot.notifications !== false;
    showNotify();
    takeUpdate(snapshot.update);
    pageFollows(snapshot);
    if (snapshot.awake) state.awake = awakeOf(snapshot.awake);

    if (snapshot.chat) {
      state.chat = snapshot.chat;
      chatChanged();
    }

    if (snapshot.lunch) {
      state.lunch = snapshot.lunch;
      lunchChanged();
    }

    state.clones = new Map((snapshot.clones || []).map(clone => [clone.dir, clone])); // the clones under way, a reload in the middle of one
    state.editors = snapshot.editors || null;
    edSay(); // whether Zed is on this Mac, and its install
    state.key = snapshot.key || null;
    showKey();
    state.serverNotify = snapshot.notify === 'native'; // the server posts its own banners: the app must not double them
    renderBoard();
    welcomeSync();
    const want = hashId();

    if (want && !state.current && state.sessions.has(want) && noneLeft(state.sessions.get(want))) {
      leaveEmpty(state.sessions.get(want));
    } else if (want && !state.current && state.sessions.has(want)) {
      tvFromHash(state.sessions.get(want));
      openSession(want);
    } else if (!state.current) {
      showHome();
    } // nothing to open: the home (2026-10-10)
    // A snapshot with a chat already open is a reconnect — the server restarted, the stream dropped — and the entries
    // pushed while the stream was down never came (2026-09-27): fetch the open chat again, in place. Not openSession,
    // which would close the PR in the pane and scroll the list.
    else if (state.current && state.sessions.has(state.current)) refetchCurrent();
  });

  es.addEventListener('session', event => {
    const session = JSON.parse(event.data);
    const was = state.sessions.get(session.id);

    state.sessions.set(session.id, session);
    sessionSeen.set(session.id, (sessionSeen.get(session.id) || 0) + 1);
    const landed = was?.status === 'working' && session.status === 'idle' && !session.done;

    if (landed) {
      landedAt.set(session.id, performance.now());
      noteMotion(session.id, 'landed');
    } // the reply landed: the card flares once (flareLanded)

    const woke = !!was && !!session.wokeAt && session.wokeAt !== was.wokeAt; // back from a snooze: its card flares once as it arrives (2026-11-24, round XXX's H4)

    if (woke) {
      landedAt.set(session.id, performance.now());
      noteMotion(session.id, 'woke');
    }

    const heard = was && asking(was) && !asking(session) && session.alive && !session.done;

    if (heard) {
      heardAt.set(session.id, performance.now());
      noteMotion(session.id, 'heard');
    } // the question answered: its card hears it (flareLanded)

    if (session.id === state.current && session.removed) {
      if (!was?.removed) {
        moveOn(session.id);
        if (state.current === session.id) leaveChat();
      }
    } // deleted from another page; found by ⌥⌘K, it stays open
    else if (session.id === state.current && !visible(session) && session.done) {
      leaveChat();
    } // an empty chat ticked done: its card is gone, and so is the chat
    else if (session.id === state.current && noneLeft(session)) leaveEmpty(session);

    if (session.id === state.current && String(session.lastUserAt || '') > String(was?.lastUserAt || '')) {
      followCard.id = session.id;
    } // your word: the next draw takes the list to its card

    if (landed || heard || woke) renderBoard();
    else renderBoardSoon(); // a landing is drawn as it is said, flare and all
    zeHeard(session, was, landed); // Zé's game, if it is up: a question pauses it
    ovSoon(); // the overview (⌥⌘A, 2026-10-10) follows its chats while it is up
    homeSoon(landed); // …and the home its facts, the day again when a turn lands

    if (session.id === state.current) {
      renderHead(session);
      syncTerm(session);
      renderPresence();
    } else if (state.sessions.get(state.current)?.links?.some(link => link.id === session.id)) {
      renderResume(state.sessions.get(state.current));
    } // where it went on may have only just come up (2026-11-04)

    // The chats step follows its chats — one ticked there leaves, one that stopped clauding says ready.
    if (
      $('#pick').open &&
      pick.mode === 'chats' &&
      (pick.list.some(chat => chat.id === session.id) || scopeChats(pick.ctx).some(chat => chat.id === session.id))
    ) {
      pickRender(true);
    }
  });

  es.addEventListener('entries', event => {
    const batch = JSON.parse(event.data);

    if (batch.sessionId === state.current) {
      mergeEntries(batch);
      renderLog();
    }
  });

  es.addEventListener('projects', event => {
    state.projects = JSON.parse(event.data).projects || [];
    renderBoardSoon();
  });

  es.addEventListener('repos', event => {
    state.repos = JSON.parse(event.data).repos || {};
  });

  es.addEventListener('pins', event => {
    state.pins = JSON.parse(event.data).pins || [];
    renderBoardSoon();
  });

  es.addEventListener('priority', event => {
    state.priority = JSON.parse(event.data).priority || [];
    renderBoardSoon();
  }); // Top priority's order (2026-11-24), another page's or a /clear's

  es.addEventListener('hidden', event => {
    state.hidden = JSON.parse(event.data).hidden || [];
    renderBoard();
    if ($('#pick').open) pickRender();
  });

  es.addEventListener('notifications', event => {
    state.notifications = JSON.parse(event.data).on !== false;
    showNotify();
  });

  es.addEventListener('update', event => takeUpdate(JSON.parse(event.data)));

  es.addEventListener('awake', event => {
    state.awake = awakeOf(JSON.parse(event.data));
    awakeChanged();
  });

  es.addEventListener('clone', event => cloneEvent(JSON.parse(event.data)));

  es.addEventListener('editor', event => {
    state.editors = JSON.parse(event.data);
    edSay();
  });

  es.addEventListener('key', event => {
    state.key = JSON.parse(event.data);
    showKey();
  });

  es.addEventListener('config', event => {
    const config = JSON.parse(event.data);

    if (JSON.stringify(config) === JSON.stringify(state.config)) return;
    state.config = config;
    configChanged();
  }); // the echo of a save made here is no news

  es.addEventListener('terminal', event => {
    const termNews = JSON.parse(event.data);
    const term = termFor(termNews.id);

    if (!term) return;

    // The holder's chat changed: a new chat just registered, or /clear (or /resume) in the drawer gave the same
    // process a new session id and the server re-linked the holder (2026-09-20). Follow it — the drawer stays
    // attached, the pane shows the chat it now runs; the old card is a stale chat now, and opening it again would
    // resume the old context in a second process.
    if (termNews.sessionId && termNews.sessionId !== term.sessionId) {
      const was = term.sessionId;

      term.sessionId = termNews.sessionId;
      if (was) carryChat(was, termNews.sessionId);
      if (state.current !== termNews.sessionId) openSession(termNews.sessionId);
    }

    if (termNews.exited !== null) termEnded(term, termNews.exited);
  });

  // The process's column goes on with it (2026-10-14): its tabs, its split and how it stands, its pages, its changes
  // tab, its /focus — the per-chat page state, keyed by the chat it left, moved to the one it runs now; not onto a
  // chat that has a layout of its own (a /resume into a chat the board has shown), and never its unread count.
  function carryChat(from, to) {
    const maps = [
      tabs,
      homes,
      zoomed,
      trees,
      tileSeen,
      focusView,
      state.paneGh,
      state.paneWt,
      blanks,
      changes.pr,
      tvNarrow,
      reviews,
      agentTabs,
    ];

    const sets = [splits, autoSplit, stacked, changesOpen, timelineOpen];

    if (![...maps, ...sets].some(store => store.has(from)) || [...maps, ...sets].some(store => store.has(to))) return;

    for (const map of maps) {
      if (map.has(from)) {
        map.set(to, map.get(from));
        map.delete(from);
      }
    }

    for (const set of sets) {
      if (set.has(from)) {
        set.add(to);
        set.delete(from);
      }
    }
  }

  es.addEventListener('alert', event => onAlert(JSON.parse(event.data)));

  es.addEventListener('chat', event => {
    state.chat = JSON.parse(event.data);
    chatChanged();
  });

  es.addEventListener('lunch', event => {
    state.lunch = JSON.parse(event.data);
    lunchChanged();
  });

  es.addEventListener('chatmsgs', event => chatMsgs(JSON.parse(event.data)));
}

connect(); // a ticket in the address first, and the server proven: the stream wants the key
