// ---- the list's ends: how many cards are out of sight ---------------------------------
// (2026-09-25): a pill at each end, counting the cards more than half out of view that way — a card cut in two is
// still being shown. A dot on it when one of them is asking you (red) or clauding: the two states a card should not
// be able to hide. A click scrolls a screenful that way. Drawn at most once a frame: on scroll, after every render,
// when the list's box changes size (a fold, the splitter, the window) and when the cards do (the cog's slider).
// A frame asked for by a scroll alone leaves the timeline be while it is out of sight (2026-10-13): every scroll frame
// wrote its thumb's and labels' places, hidden — show() draws it as it comes out, and anything else asking draws it.
function listChanged(scrolled = false) {
  // called from applyCards before this line has run, hence the flag on the function
  listChanged.other ||= !scrolled;
  if (listChanged.queued) return;
  listChanged.queued = true;

  requestAnimationFrame(() => {
    const timeline = listChanged.other || tl.K > 0 || !!tl.press || $('#sessions').classList.contains('tlshow');

    listChanged.queued = false;
    listChanged.other = false;
    const g = listGeom(); // every read of the frame first, then the writes: a read after a write is a layout each (2026-09-27)

    drawEdges(g);
    if (timeline) drawTimeline(g);
    watchOpen(g.open?.el);
    if (sliding.size) listChanged(); // a card is still on its way: the next frame too
  });
}

// …and when the open card changes size with no render of the list (an age a digit longer, the title beside it wrapping
// to another line): the ends count from it
const openSize = new ResizeObserver(() => listChanged());
let sized = null;

const watchOpen = el => {
  if (el === sized) return;
  if (sized) openSize.unobserve(sized);
  sized = el || null;
  if (sized) openSize.observe(sized);
};

// Scroll timelines (the header's shadow on the transcript): where there are none, the log's scroll listener writes it.
const SCROLL_TIMELINES = CSS.supports('timeline-scope: --a') && CSS.supports('animation-timeline: scroll()');

/** The list's geometry, read once a frame: its window, each card's place, the rail's height and each run's top. */
function listGeom() {
  const list = $('#slist');
  const rail = $('#tline');
  const cards = [];

  for (const c of list.children) {
    if (c.classList.contains('card')) cards.push({ el: c, top: c.offsetTop, h: c.offsetHeight });
  }

  const H = Math.max(1, (rail ? rail.clientHeight : 0) - 2 * TL_PAD);
  const full = Math.max(list.scrollHeight, list.clientHeight, 1);

  const open = cards.find(c => c.el.classList.contains('active'));

  // the lanes' heads, sticky (2026-10-31): where each stands — which are stuck at the list's top, under its padding (the
  // notch's strip) — and how far down the stuck one reaches
  const box = list.getBoundingClientRect();
  const pad = parseFloat(getComputedStyle(list).paddingTop) || 0;

  const heads = [...list.querySelectorAll(':scope > .gsep.lane[data-lane]')];
  const rects = heads.map(h => h.getBoundingClientRect());

  const stuck = rects.map(r => list.scrollTop > 0 && r.top <= box.top + pad + 0.5);

  return {
    list,
    rail,
    cards,
    open,
    top: list.scrollTop,
    ch: list.clientHeight,
    sh: list.scrollHeight,
    H,
    full,
    y: v => TL_PAD + (v / full) * H,
    pad,
    stick: pad + (heads[0]?.offsetHeight || 0),
    heads,
    rects,
    stuck,
    tops: tl.runs.map(r => cards[r.i]?.top || 0),
    railOn: !!rail && rail.offsetParent !== null,
    box,
  };
}

function drawEdges(g) {
  // the sticky head covers the list's top, under its padding: a card under it is out of sight, and the ends' fog and
  // the scroll's padding start below it (--stick; the padding alone with no heads — under the notch's strip)
  if (drawEdges.stick !== g.stick) {
    drawEdges.stick = g.stick;
    $('#sessions').style.setProperty('--stick', `${g.stick}px`);
    $('#sessions').style.setProperty('--lpad', `${g.pad}px`);
  }

  // the head stuck on top (.stuck), the ones stuck under it (.covered), and it while the next pushes in (.pushed)
  const last = g.stuck.lastIndexOf(true);
  const pushed = last >= 0 && g.rects[last + 1] && g.rects[last + 1].top < g.rects[last].bottom;

  g.heads.forEach((h, i) => {
    h.classList.toggle('covered', g.stuck[i] && i < last);
    h.classList.toggle('stuck', i === last && !pushed);
    h.classList.toggle('pushed', i === last && !!pushed);
  });

  const bottom = g.top + g.ch;
  const under = g.top > 0 ? g.stick : 0;

  const out = [
    { n: 0, ask: 0, work: 0 },
    { n: 0, ask: 0, work: 0 },
  ];

  for (const { el: c, top, h } of g.cards) {
    const mid = top + h / 2;
    const o = mid < g.top + under ? out[0] : mid > bottom ? out[1] : null;

    if (!o) continue;
    o.n++;
    if (c.classList.contains('asking')) o.ask++;
    else if (c.classList.contains('working') && !c.classList.contains('done')) o.work++;
  }

  out.forEach((o, i) => {
    const el = $(i ? '#sdown' : '#sup');
    const b = el.firstElementChild;
    const key = `${o.n}/${o.ask}/${o.work}`;

    el.classList.toggle('on', o.n > 0);
    if (b.dataset.key === key) return;
    b.dataset.key = key;
    if (!o.n) return;

    const way = i ? 'below' : 'above';
    const dot = o.ask ? 'ask' : o.work ? 'work' : '';

    b.innerHTML = `${i ? '↓' : '↑'} <b>${o.n}</b><span class="w"> more</span>${dot ? `<i class="${dot}"></i>` : ''}`;
    b.title = `${o.n} chat${o.n === 1 ? '' : 's'} ${way}${o.ask ? ` — ${o.ask} asking you` : ''}${o.work ? `${o.ask ? ',' : ' —'} ${o.work} clauding` : ''} · click for a screenful ${i ? 'down' : 'up'}`;
  });
}

$('#slist').addEventListener('scroll', () => listChanged(true), { passive: true });

new ResizeObserver(() => {
  listChanged();
  fadeOver(true);
}).observe($('#slist'));

for (const el of document.querySelectorAll('.sedge')) {
  el.addEventListener('click', e => {
    const b = e.target.closest('button');

    if (!b) return;
    const list = $('#slist');

    list.scrollBy({ top: +b.dataset.dir * Math.max(80, list.clientHeight - 90), behavior: 'smooth' });
  });
}
