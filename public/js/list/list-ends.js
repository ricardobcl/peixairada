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
    const geom = listGeom(); // every read of the frame first, then the writes: a read after a write is a layout each (2026-09-27)

    drawEdges(geom);
    if (timeline) drawTimeline(geom);
    watchOpen(geom.open?.el);
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

  for (const child of list.children) {
    if (child.classList.contains('card')) cards.push({ el: child, top: child.offsetTop, h: child.offsetHeight });
  }

  const railHeight = Math.max(1, (rail ? rail.clientHeight : 0) - 2 * TL_PAD);
  const full = Math.max(list.scrollHeight, list.clientHeight, 1);

  const open = cards.find(card => card.el.classList.contains('active'));

  // the lanes' heads, sticky (2026-10-31): where each stands — which are stuck at the list's top, under its padding (the
  // notch's strip) — and how far down the stuck one reaches
  const box = list.getBoundingClientRect();
  const pad = parseFloat(getComputedStyle(list).paddingTop) || 0;

  const heads = [...list.querySelectorAll(':scope > .gsep.lane[data-lane]')];
  const rects = heads.map(head => head.getBoundingClientRect());

  const stuck = rects.map(rect => list.scrollTop > 0 && rect.top <= box.top + pad + 0.5);

  return {
    list,
    rail,
    cards,
    open,
    top: list.scrollTop,
    ch: list.clientHeight,
    sh: list.scrollHeight,
    H: railHeight,
    full,
    y: listY => TL_PAD + (listY / full) * railHeight,
    pad,
    stick: pad + (heads[0]?.offsetHeight || 0),
    heads,
    rects,
    stuck,
    tops: tl.runs.map(run => cards[run.i]?.top || 0),
    railOn: !!rail && rail.offsetParent !== null,
    box,
  };
}

function drawEdges(geom) {
  // the sticky head covers the list's top, under its padding: a card under it is out of sight, and the ends' fog and
  // the scroll's padding start below it (--stick; the padding alone with no heads — under the notch's strip)
  if (drawEdges.stick !== geom.stick) {
    drawEdges.stick = geom.stick;
    $('#sessions').style.setProperty('--stick', `${geom.stick}px`);
    $('#sessions').style.setProperty('--lpad', `${geom.pad}px`);
  }

  // the head stuck on top (.stuck), the ones stuck under it (.covered), and it while the next pushes in (.pushed)
  const last = geom.stuck.lastIndexOf(true);
  const pushed = last >= 0 && geom.rects[last + 1] && geom.rects[last + 1].top < geom.rects[last].bottom;

  geom.heads.forEach((head, index) => {
    head.classList.toggle('covered', geom.stuck[index] && index < last);
    head.classList.toggle('stuck', index === last && !pushed);
    head.classList.toggle('pushed', index === last && !!pushed);
  });

  const bottom = geom.top + geom.ch;
  const under = geom.top > 0 ? geom.stick : 0;

  const out = [
    { n: 0, ask: 0, work: 0 },
    { n: 0, ask: 0, work: 0 },
  ];

  for (const { el: card, top, h: height } of geom.cards) {
    const mid = top + height / 2;
    const tally = mid < geom.top + under ? out[0] : mid > bottom ? out[1] : null;

    if (!tally) continue;
    tally.n++;
    if (card.classList.contains('asking')) tally.ask++;
    else if (card.classList.contains('working') && !card.classList.contains('done')) tally.work++;
  }

  out.forEach((tally, down) => {
    const el = $(down ? '#sdown' : '#sup');
    const button = el.firstElementChild;
    const key = `${tally.n}/${tally.ask}/${tally.work}`;

    el.classList.toggle('on', tally.n > 0);
    if (button.dataset.key === key) return;
    button.dataset.key = key;
    if (!tally.n) return;

    const way = down ? 'below' : 'above';
    const dot = tally.ask ? 'ask' : tally.work ? 'work' : '';

    button.innerHTML = `${down ? '↓' : '↑'} <b>${tally.n}</b><span class="w"> more</span>${dot ? `<i class="${dot}"></i>` : ''}`;
    button.title = `${tally.n} chat${tally.n === 1 ? '' : 's'} ${way}${tally.ask ? ` — ${tally.ask} asking you` : ''}${tally.work ? `${tally.ask ? ',' : ' —'} ${tally.work} clauding` : ''} · click for a screenful ${down ? 'down' : 'up'}`;
  });
}

$('#slist').addEventListener('scroll', () => listChanged(true), { passive: true });

new ResizeObserver(() => {
  listChanged();
  fadeOver(true);
}).observe($('#slist'));

for (const el of document.querySelectorAll('.sedge')) {
  el.addEventListener('click', event => {
    const button = event.target.closest('button');

    if (!button) return;
    const list = $('#slist');

    list.scrollBy({ top: +button.dataset.dir * Math.max(80, list.clientHeight - 90), behavior: 'smooth' });
  });
}
