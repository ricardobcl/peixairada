// A line over the lane (round XIX's M3, M4): news for a few seconds, and a click is Next. Under the pointer it stays.
const LANE_NEWS_MS = 9000;
function laneNews(html) {
  const lane = $('#sbSwim');
  if (!lane?.firstChild) return;
  lane.querySelector('.lnews')?.remove();
  const el = document.createElement('button'),
    go = () => {
      if (REDUCED.matches) el.remove();
      else
        el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 400, easing: EASE_OUT, fill: 'forwards' }).onfinish =
          () => el.remove();
    };
  el.type = 'button';
  el.className = 'lnews';
  el.title = 'A click, or ⌥⌘⏎, goes to the first of them';
  el.innerHTML = html;
  el.addEventListener('click', e => {
    e.stopPropagation();
    el.remove();
    hotNext();
  });
  let t = setTimeout(go, LANE_NEWS_MS);
  el.addEventListener('pointerenter', () => clearTimeout(t));
  el.addEventListener('pointerleave', () => {
    t = setTimeout(go, 2500);
  });
  lane.append(el);
  noteMotion(null, 'lane:news', el.textContent);
}
// While you were out (2026-11-01, round XIX's M3): back after OUT_MS away from the board (another app in front, a lock, a
// hidden tab), one line says what changed, counted from the board's own state with no model involved. Resuming is the
// costly moment, and this answers "what did I miss" before you go hunting. Nothing changed, nothing is said.
const OUT_MS = 10 * 60_000;
// Gone fishing (2026-11-01, round XIX's M4): a quiet you choose. A sign in the lane for FISH_MIN or till you say; questions
// still ring; replies and PR moves come in with no banner or chime, and the catch arrives as one line — what landed, the
// status bar saying nothing of moves since 2026-11-25 — and one banner if the app is behind. It is the safe way to try
// batching, the deciding being yours, and a mute that wears a sign cannot be forgotten.
const FISH_MIN = 25;
const fishing = { since: prefs.fishing?.since || 0, until: prefs.fishing?.until || 0, t: 0 };
function goFishing(min = FISH_MIN) {
  Object.assign(fishing, { since: Date.now(), until: Date.now() + min * 60_000 });
  prefs.fishing = { since: fishing.since, until: fishing.until };
  savePrefs();
  fishingBar();
  renderBar();
}
function backFromFishing() {
  if (!fishing.until) return;
  const since = fishing.since;
  clearTimeout(fishing.t);
  Object.assign(fishing, { since: 0, until: 0 });
  delete prefs.fishing;
  savePrefs();
  fishingBar();
  renderBar();
  const line = outLine(since);
  if (!line) return;
  laneNews(`<b>The catch:</b>${line}`);
  chime('reply');
  const plain = line.replace(/<i>·<\/i>/g, ' · ').replace(/<[^>]+>/g, '');
  if (inApp && state.notifications)
    post({
      type: 'alert',
      kind: 'reply',
      heading: 'The catch',
      project: '',
      title: plain,
      snippet: '',
      sessionId: '',
      hash: '',
    });
}
function fishingBar() {
  const lane = $('#sbSwim');
  if (!lane?.firstChild) return;
  let el = lane.querySelector('.fsign');
  clearTimeout(fishing.t);
  if (!fishing.until) {
    el?.remove();
    return;
  }
  if (Date.now() >= fishing.until) {
    backFromFishing();
    return;
  }
  fishing.t = setTimeout(backFromFishing, Math.min(fishing.until - Date.now(), 2 ** 31 - 1));
  const back = new Date(fishing.until).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  if (!el) {
    el = document.createElement('button');
    el.type = 'button';
    el.className = 'fsign';
    el.innerHTML = '<span class="lswing"><b>GONE FISHING</b></span>';
    el.addEventListener('click', e => {
      e.stopPropagation();
      backFromFishing();
    });
    lane.append(el);
    noteMotion(null, 'fishing:sign', 'on');
    if (!REDUCED.matches)
      el.animate([{ transform: 'translateY(-28px)' }, { transform: 'none' }], { duration: 650, easing: SPRING });
  }
  el.title = `Quiet till ${back}: questions still ring, the rest waits and arrives as one. A click comes back now`;
}
window.peixFishing = (on, min) => {
  if (on) goFishing(min);
  else backFromFishing();
}; // the harness's: a fishing of any length
const outUi = { at: 0 };
function wentOut(at = Date.now()) {
  if (!outUi.at) outUi.at = at;
}
function cameBack() {
  const since = outUi.at;
  outUi.at = 0;
  if (!since || Date.now() - since < OUT_MS) return;
  setTimeout(cueWave, 400);
  if (fishing.until) return; // fishing, the catch will say it
  setTimeout(() => {
    const line = outLine(since);
    if (line) laneNews(line);
  }, 400); // the stream's news of the moment first
}
function outLine(since) {
  const iso = new Date(since).toISOString(),
    all = [...state.sessions.values()].filter(s => visible(s) && !s.done && !s.muted && !asleep(s));
  const landed = all.filter(s => !asking(s) && s.status !== 'working' && (s.lastReplyAt || '') > iso).length;
  const asks = all.filter(asking).length;
  if (!landed && !asks) return '';
  const bits = [
    landed ? `<b>${landed} landed</b>` : '',
    asks ? `<em>${asks} asking</em>` : '<span>nothing asked</span>',
  ];
  return bits.filter(Boolean).join('<i>·</i>');
}
window.peixFront = (on, at) => {
  if (on) cameBack();
  else wentOut(at);
}; // the app's: it came forward or went behind (at: the harness's clock)
addEventListener('blur', () => {
  if (!inApp) wentOut();
});
addEventListener('focus', () => {
  if (!inApp) cameBack();
});
const NEXT_VERB = { ask: 'Answer', read: 'Read' };
const nextName = ({ s, k }) => (k === 'ask' ? s.project : s.title);
function hotNext() {
  const q = nextQueue();
  if (!q.length) {
    note($('#sbLeft .nx') || $('#sbar'), 'Caught up: nothing wants you');
    return true;
  }
  const i = q.findIndex(x => x.s.id === state.current);
  if (q.length === 1 && i === 0) {
    note($('#sbLeft .nx') || $('#sbar'), 'This is the only thing left');
    return true;
  }
  openSession(q[(i + 1) % q.length].s.id, { locate: true });
  return true;
}
/** The bar's half of it: what Next would do, and the questions' count and longest wait while any. */
function nextSeg(nx, ask, wait) {
  if (!nx) return `<span class="seg nx none" title="Nothing is asking you, nothing new to read">caught up</span>`;
  const name = nextName(nx),
    tip = `${NEXT_VERB[nx.k]}: ${nx.s.title} · ${nx.s.project}. ⌥⌘⏎ or a click goes there; again, the one after`;
  return `<button class="seg nx ${nx.k}${ask ? ' ask' : ''}" title="${esc(tip)}">${ask ? `<em>${rn('asking', ask)} asking${wait ? ` · ${wait}` : ''}</em>` : ''}<span class="nxw${name.length > 26 ? ' over' : ''}">▸ ${esc(NEXT_VERB[nx.k])} ${esc(name)}</span></button>`;
}
