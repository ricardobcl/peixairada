// ---- the chat list's timeline: its days, down the left edge -------------------------
// (2026-09-25). The list in miniature,
// to scale: the whole rail is the whole list, so a run of cards sits on it where it sits in the list, the thumb is
// the window, and the rail is the list's scrollbar (the native one is hidden). A run is a day *and* a state group,
// since the list is grouped first — today comes back under the done cards — and each is its own place to go.
// The Dock's magnification is a fisheye around the pointer (Sarkar and Brown's: within R of it, a distance x·R
// becomes R·(D+1)x/(Dx+1)), applied to everything drawn on the rail, so nothing crosses and the point under the
// pointer stays put — which is why a drag can read the list's position straight off the pointer. Every day comes out
// as a label, as every app is on the Dock; the ones near the pointer swell (TL_MAX at it, a cosine down to their own
// size at R), and one that would overlap a nearer one is left out — so a crowded stretch reads where it is pointed
// at and thins out away from it. `tl.k` is how far the swell is in, by the clock (TL_IN / TL_OUT ms end to end), `tl.K` the same eased;
// `tl.py` is the pointer, in the rail's pixels. At rest the rail is the thumb alone (2026-09-26): the state track and
// the tick per day it had went — the divider and the day lines in the list say the same, the labels say it in words.
// TL_W is the rail's width, TL_LX where a label starts and TL_CATCH the rail's reach at rest, each the CSS's number;
// TL_MIN is the thumb's least height, so a long list's is still there to find and to grab.
const tl = { runs: [], sig: '', k: 0, K: 0, want: 0, py: 0, press: null, raf: 0, reach: 0 };
const TL_PAD = 6,
  TL_R = 150,
  TL_D = 3,
  TL_MAX = 1.4,
  TL_LH = 17,
  TL_IN = 140,
  TL_OUT = 220,
  TL_W = 12,
  TL_LX = 16,
  TL_CATCH = 24,
  TL_MIN = 24;
// Out of sight until called (2026-09-28): the pointer on the list's coloured edge — x under TL_EDGE, the window's own
// edge when filled — for TL_DWELL_MS brings it out, as the menu bar comes out when filled; it goes TL_HIDE_MS after
// the pointer has left it.
const TL_EDGE = 4,
  TL_DWELL_MS = 1000,
  TL_HIDE_MS = 500;
const TL_WORD = {
  asking: 'asking',
  working: 'clauding',
  ready: 'ready',
  done: 'done',
  snoozed: 'snoozed',
  prio: 'pinned',
};
/** A run's day, short: today, yesterday, the weekday in the last week, else the date — the year only when not this one's. */
function tlDay(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return '';
  const n = Math.round((new Date().setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / 864e5),
    dm = fmtDate(d, true);
  return n <= 0
    ? 'today'
    : n === 1
      ? 'yesterday'
      : n < 7
        ? `${d.toLocaleDateString('en', { weekday: 'short' })} ${dm}`
        : d.getFullYear() === new Date().getFullYear()
          ? dm
          : fmtDate(d);
}
const tlText = r => `${esc(tlDay(r.at))} <i>· ${r.n} ${TL_WORD[r.g] || r.g}</i>`;
/** The rail's geometry now — listGeom, read off the cards, so it is the layout as drawn (the card sizes, the width,
      the divider and the day lines all count); the pointer handlers read it themselves, the frame's drawing is handed it. */
const tlGeom = listGeom;
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)');
const tlBump = u => (u >= 1 ? 0 : (1 + Math.cos(Math.PI * u)) / 2);
const tlWarp = y => {
  if (!tl.K) return y;
  const d = y - tl.py,
    x = Math.abs(d) / TL_R;
  return x >= 1 ? y : y + tl.K * ((Math.sign(d) * TL_R * (TL_D + 1) * x) / (TL_D * x + 1) - d);
};
function drawTimeline(g = listGeom()) {
  if (!g.railOn) return; // the list hidden: nothing drawn
  const rail = g.rail,
    runs = tl.runs;
  // the runs' markup, only when the runs themselves change (an SSE update re-renders the list every few seconds)
  const sig = runs.map(r => `${r.g}${r.day}${r.n}${r.i}${tlText(r)}`).join('|'); // the words too: "yesterday" moves on at midnight with no run changing
  if (sig !== tl.sig) {
    tl.sig = sig;
    rail.querySelector('.tl-labs').innerHTML = runs
      .map((r, i) => `<div class="tl-lab ${r.g}" data-run="${i}">${tlText(r)}</div>`)
      .join('');
    tl.widths = null; // measured when first needed, once — the text only changes with the markup
  }
  const labs = [...rail.querySelectorAll('.tl-labs .tl-lab')];
  if (tl.K > 0 && !tl.widths) tl.widths = labs.map(el => el.offsetWidth); // the one read left, before the writes below
  // the window: never under TL_MIN tall, and kept off the foot when that makes it taller than the window is
  const th = rail.querySelector('.tl-thumb'),
    over = g.sh > g.ch + 1;
  th.hidden = !over;
  if (over) {
    const t = tlWarp(g.y(g.top)),
      u = tlWarp(g.y(g.top + g.ch)),
      h = Math.max(TL_MIN, u - t);
    th.style.top = Math.max(0, Math.min(t, g.H + 2 * TL_PAD - h)) + 'px';
    th.style.height = h + 'px';
  }
  // a label per run — out over the cards while the rail is pointed at, the nearest ones largest
  const at = runs.map((r, i) => tlWarp(g.y(g.tops[i])));
  const grow = at.map(y => tl.K * tlBump(Math.abs(y - tl.py) / TL_R));
  const taken = [],
    order = at.map((y, i) => i).sort((a, b) => Math.abs(at[a] - tl.py) - Math.abs(at[b] - tl.py));
  let near = -1,
    right = 0;
  for (const i of order) {
    const el = labs[i];
    if (!el) continue;
    const s = 1 + (TL_MAX - 1) * grow[i],
      h = (TL_LH * s) / 2 + 1,
      y = Math.max(h, Math.min(g.H + 2 * TL_PAD - h, at[i])); // kept inside the rail, off the head and the foot
    const show = tl.K > 0.02 && !taken.some(([a, b]) => y + h > a && y - h < b);
    if (show) {
      taken.push([y - h, y + h]);
      if (near < 0) near = i;
      right = Math.max(right, TL_LX + tl.widths[i] * s);
    }
    el.classList.toggle('on', show);
    el.style.opacity = show ? Math.min(1, tl.K * 1.5) : 0;
    el.style.transform = `translateY(${y - TL_LH / 2}px) translateX(${-10 * (1 - tl.K)}px) scale(${s})`;
  }
  labs.forEach((el, i) => el.classList.toggle('near', i === near));
  // the reach: the furthest right a label has come this time out, and a margin — it only grows while the days are
  // out, so a label shrinking as the pointer moves on never pulls the rail out from under it
  tl.reach = tl.K > 0 ? Math.max(tl.reach, right + 28) : 0;
  rail.querySelector('.tl-catch').style.width = Math.max(TL_CATCH, tl.reach + 4) + 'px';
}
/** The swell towards `tl.want` by the clock, not by the frame — a slow frame rate stretches nothing; reduced
      motion jumps. What is drawn is it eased (smoothstep). */
function tlAnimate() {
  if (tl.raf) return;
  let last = performance.now();
  const step = now => {
    const dt = Math.max(0, Math.min(80, now - last));
    last = now;
    const by = dt / (tl.want > tl.k ? TL_IN : TL_OUT);
    tl.k = REDUCED.matches ? tl.want : tl.want > tl.k ? Math.min(tl.want, tl.k + by) : Math.max(tl.want, tl.k - by);
    tl.K = tl.k * tl.k * (3 - 2 * tl.k);
    drawTimeline();
    tl.raf = tl.k === tl.want ? 0 : requestAnimationFrame(step);
  };
  tl.raf = requestAnimationFrame(step);
}
/** The list scrolled so the pointer's place on the rail is under the thumb where it was grabbed. */
function tlScrub(py, grab) {
  const g = tlGeom();
  g.list.scrollTop = ((py - TL_PAD) / g.H) * g.full - grab * g.list.clientHeight;
  // a run of days crossed under the thumb is a level passed (2026-10-11): which run the window's top is in
  const top = g.list.scrollTop,
    cards = [...g.list.querySelectorAll(':scope > .card')],
    first = cards.find(c => c.offsetTop + c.offsetHeight > top);
  const i = first ? cards.indexOf(first) : -1,
    run = tl.runs.findIndex(r => i >= r.i && i < r.i + r.n);
  if (run >= 0 && tl.hapticRun != null && run !== tl.hapticRun) haptic('levelChange');
  tl.hapticRun = run;
}
{
  const rail = $('#tline'),
    railY = e => e.clientY - rail.getBoundingClientRect().top;
  const swell = on => {
    tl.want = on ? 1 : 0;
    tlAnimate();
    $('#sessions').classList.toggle('tlon', on);
  };
  rail.addEventListener('pointerenter', () => swell(true));
  rail.addEventListener('pointerleave', () => {
    if (!tl.press) swell(false);
  });
  rail.addEventListener('pointermove', e => {
    tl.py = railY(e);
    const p = tl.press;
    if (p && (p.moved || Math.abs(e.clientY - p.y0) > 3)) {
      p.moved = true;
      rail.classList.add('drag');
      tlScrub(tl.py, p.grab);
    }
    if (!tl.raf) drawTimeline();
  });
  rail.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    e.preventDefault();
    const g = tlGeom(),
      y = railY(e),
      top = g.y(g.list.scrollTop),
      bottom = g.y(g.list.scrollTop + g.list.clientHeight);
    const lab = e.target.closest('.tl-lab.on');
    // out among the labels but on none of them: the nearest day, the one ringed — a click there goes to it
    const gap = !lab && e.clientX - rail.getBoundingClientRect().left > TL_W;
    const run = lab
      ? +lab.dataset.run
      : gap && rail.querySelector('.tl-labs .tl-lab.near')
        ? +rail.querySelector('.tl-labs .tl-lab.near').dataset.run
        : null;
    // on the thumb as drawn — TL_MIN tall at least, and swollen round the pointer — it is held where it was grabbed,
    // as a fraction of the true window (past 1 on a thumb drawn taller than it: the scrub then leaves the list where
    // it is, since the pointer is the warp's fixed point); on the track the thumb comes to the pointer, centred
    const th = rail.querySelector('.tl-thumb'),
      onThumb = !th.hidden && y >= th.offsetTop && y <= th.offsetTop + th.offsetHeight;
    const grab = onThumb ? (y - top) / Math.max(1, bottom - top) : 0.5;
    tl.press = { y0: e.clientY, grab, run, moved: false };
    tl.hapticRun = null;
    rail.setPointerCapture(e.pointerId);
    if (!lab && !gap && grab === 0.5) tlScrub(y, grab);
  });
  const release = e => {
    const p = tl.press;
    if (!p) return;
    tl.press = null;
    rail.classList.remove('drag');
    if (!p.moved && p.run !== null) {
      // a day clicked: its first card to the top, under the top pill
      const g = tlGeom();
      g.list.scrollTo({ top: Math.max(0, g.tops[p.run] - 30), behavior: REDUCED.matches ? 'auto' : 'smooth' });
    }
    if (e.type === 'pointercancel' || !rail.matches(':hover')) swell(false);
  };
  rail.addEventListener('pointerup', release);
  rail.addEventListener('pointercancel', release);
  rail.addEventListener(
    'wheel',
    e => {
      e.preventDefault();
      $('#slist').scrollBy({ top: e.deltaY });
    },
    { passive: false },
  );
  new ResizeObserver(() => listChanged()).observe(rail);
  // Called out like the Dock: the pointer held on the list's coloured edge, within the list's row, for TL_DWELL_MS
  // brings the rail out with its days round the pointer; once the pointer is off it (and not dragging), it goes
  // TL_HIDE_MS later. The rail itself cannot be pointed at while hidden, so its own enter never fires first.
  let dwell = 0,
    away = 0;
  const show = on => {
    const list = $('#sessions');
    if (list.classList.contains('tlshow') === on) return;
    list.classList.toggle('tlshow', on);
    swell(on);
    if (on) drawTimeline();
  };
  document.addEventListener(
    'pointermove',
    e => {
      if (renderBoard.held) return; // a card in the hand, along the window's edge (2026-11-02)
      if ($('#sessions').classList.contains('tlshow')) {
        if (tl.press || e.target.closest?.('#tline')) {
          clearTimeout(away);
          away = 0;
        } else if (!away)
          away = setTimeout(() => {
            away = 0;
            if (!tl.press) show(false);
          }, TL_HIDE_MS);
        return;
      }
      if (e.clientX >= TL_EDGE) {
        clearTimeout(dwell);
        dwell = 0;
        return;
      } // before any rect: this runs on every move anywhere on the board
      const r = rail.getBoundingClientRect();
      if (!(e.clientY >= r.top && e.clientY <= r.bottom && rail.offsetParent)) {
        clearTimeout(dwell);
        dwell = 0;
        return;
      }
      tl.py = e.clientY - r.top;
      dwell ||= setTimeout(() => {
        dwell = 0;
        show(true);
      }, TL_DWELL_MS);
    },
    { passive: true },
  );
}
// Work that outlives the turn, and the one state that is waiting on you — the card's four readings (2026-09-21).
// A monitor or a background command runs on after the reply, so a *ready* card can still have something running;
// a question is the opposite, nothing runs and nothing will until you answer. Both are the server's word
// (`tasks`, `ask`), and both are gone the moment the claude that owned them is (the server clears them).
const minsLeft = iso => {
  const m = Math.round((new Date(iso) - Date.now()) / 60000);
  return m <= 0 ? 'expiring' : m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m left` : `${m}m left`;
};
const taskLine = t =>
  `${t.kind === 'monitor' ? 'monitor' : 'background'}: ${t.what || '(no description)'}${t.until ? ` · ${minsLeft(t.until)}` : ''}${t.events ? ` · ${t.events} event${t.events === 1 ? '' : 's'}` : ''}`;
/** One chip for everything still running behind the turn. With one task it says *what* — the description the
 *  call gave it, which is the answer to "something is running here, but what?" and was a tooltip before
 *  (2026-09-21). With
 *  more, it counts them by kind. The tooltip is the full list either way, with the time left and the events — written
 *  by fillAges after the draw (2026-10-14): in the markup, every event and every minute drew the card anew. */
function taskChip(s) {
  const t = s.tasks || [];
  if (!t.length) return '';
  const mon = t.filter(x => x.kind === 'monitor').length,
    bg = t.length - mon;
  const label =
    t.length === 1
      ? `${t[0].kind === 'monitor' ? 'monitor' : 'running'}${t[0].what ? ` · ${t[0].what}` : ''}`
      : [mon ? (mon > 1 ? `${mon} monitors` : 'monitor') : '', bg ? (bg > 1 ? `${bg} running` : 'running') : '']
          .filter(Boolean)
          .join(' · ');
  return `<span class="chip watch">${ICON.watch}${esc(label)}</span>`;
}
/** The question itself on the card — which tool asked, what it asked, how many answers it is offering; or, when
 *  only the registry knows (the question's line is written with its answer), what Claude Code says it waits on. */
const askWhat = (s, a = s.ask || {}) =>
  a.tool === 'ExitPlanMode'
    ? 'asking you to approve its plan'
    : a.tool === 'PermissionRequest'
      ? 'asking for permission'
      : a.text
        ? `asking you: ${a.text}`
        : a.waitingFor
          ? `asking you — ${a.waitingFor}`
          : 'asking you';
function askHtml(s) {
  const a = s.ask || {},
    what = askWhat(s);
  return `<div class="state needs-input" title="${esc(what)}">${ICON.ask}<span class="q">${esc(what)}</span>${a.options ? `<span class="opts">${a.options} answers</span>` : ''}</div>`;
}
/** A turn that stopped short (2026-10-31, round XIII's S4): the server's `stopped` — an API error after its retries, the
 *  token limit, a refusal — on a ready card, why in words and in the attention colour, at every card size; no lane of
 *  its own. Your next word clears it. */
const STOP_SAID = { max_tokens: 'cut short at the token limit', refusal: 'declined to answer' };
const stoppedSaid = s =>
  !s.done && !asking(s) && s.status !== 'working' && s.stopped
    ? s.stopped.why === 'api'
      ? `API error${s.stopped.text ? ` · ${s.stopped.text}` : ''}`
      : STOP_SAID[s.stopped.why] || 'no answer'
    : '';
function stopHtml(s) {
  const w = stoppedSaid(s);
  if (!w) return '';
  return `<div class="state stopped" title="${esc(`Its last turn stopped short, with no answer — ${w}. A word from you carries on`)}">${ICON.stop}<b>stopped</b><span class="q">${esc(w)}</span></div>`;
}
/** The chat's PRs come round to you, the newest move first. */
const movedPrs = s =>
  (s.prs || []).filter(p => p.turn?.you).sort((a, b) => String(b.turn.movedAt).localeCompare(String(a.turn.movedAt)));
const moveTip = prs =>
  prs.map(p => `${p.label} — your move: ${p.turn.why}`).join('\n') +
  '\nclick: its timeline, at the move (⌥⌘J) · ⌥-click: let this round go — the next move tells you';
/** The card's line for them, after the question's, at every card size: the tag, then the newest move's #n and its
 *  reason, the others counted; none on a ticked card (the tick after the move is "seen"). Under the pointer, how long
 *  ago that move came (2026-10-14, `.mt`): GitHub's time of its newest reason — the push, the word, the ask again —,
 *  else when the board saw it; a `data-at` that fillAges fills, so the clock rebuilds no card. */
function moveHtml(s) {
  const prs = movedPrs(s);
  if (!prs.length || s.done) return '';
  const t = prs[0].turn,
    at = t.at || t.movedAt || '';
  return `<div class="state prmove"><b class="ymove">${ICON.pr}your move</b><span class="q">${esc(prs[0].label.replace(/^.*?#/, '#'))} · ${esc(t.why)}</span>${at ? `<span class="mt"><span data-at="${esc(at)}"></span> ago</span>` : ''}</div>`; // the others in its tooltip: a card counts nothing (2026-10-11)
}
/** A card with no move holds the line's place when compact's same height is on (.moveslot, hidden everywhere else). */
const MOVE_SLOT = `<div class="state moveslot" aria-hidden="true"><b class="ymove">${ICON.pr}your move</b><span class="q">#0</span></div>`; // the tag and a word: the real line's metrics
