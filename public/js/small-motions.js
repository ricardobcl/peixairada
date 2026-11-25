// Numbers that roll (2026-10-11, NumberFlow's): a count written as rn(key, n) is plain text in the markup — so
// setHtml and the reconciles compare what they always did — and, once the box holding it is drawn (rollSoon, from
// the board's, the bar's, the usage's and the header's draws), slides digit by digit from what that key showed last
// (rolled) to this, on the spring. The strips' digits are CSS's (a ::before), and the number itself stays as text
// beside them, hidden from sight, so whatever reads a count reads the number, mid-roll too; plain text again when it
// has landed. A key's first value, a value that is not digits, and reduced motion just show the number.
const rolled = new Map(),
  ROLL_MS = 550;
const rn = (key, v) => `<span class="rn" data-rk="${esc(key)}">${v}</span>`;
// Fade, not … (2026-10-11, Arc's tabs): a name too long for its box fades out at its edge — the header's title and a
// page's address on one line, a card's title on its last line — rather than end in an ellipsis. `.over` where it
// does overflow (a mask on one that fits would fade its last letters): read for the boxes not read yet, or all of
// them when the list's width moved; every read, then every write.
function fadeSoon() {
  if (!fadeSoon.f)
    fadeSoon.f = requestAnimationFrame(() => {
      fadeSoon.f = 0;
      fadeOver();
    });
}
// …and a card's PR matrix (2026-11-01): `.over` where its squares run past their box, the end with more past it faded
// (.ofl .ofr, mxEdges — again on a scroll of it); a box drawn anew is scrolled the least that brings its numbered
// square clear of the fade (MX_FADE, the CSS's --fl), its lift's room (MX_LIFT) with it. A box read before keeps its scroll.
const MX_FADE = 12,
  MX_LIFT = 3;
function fadeOver(all = false) {
  const els = [
    ...document.querySelectorAll(`#shead h2 .t, .ptabs .purl, #slist > .card .title${all ? '' : ':not(.ovr)'}`),
  ]; // the header's and the strip's are few: read every time
  const mxs = [...document.querySelectorAll(`#shead > .tmx .mxg, #slist > .card .tmx .mxg${all ? '' : ':not(.ovr)'}`)]; // the header's is one, and fitHeadPrs moves its box
  const over = els.map(e =>
    e.classList.contains('title') ? e.scrollHeight > e.clientHeight + 1 : e.scrollWidth > e.clientWidth + 1,
  );
  const mx = mxs.map(g => {
    const r = !g.classList.contains('ovr') && g.querySelector('.mxs.lead');
    return {
      x: g.scrollLeft,
      w: g.clientWidth,
      sw: g.scrollWidth,
      l: r ? r.offsetLeft : -1,
      rw: r ? r.offsetWidth : 0,
    };
  });
  els.forEach((e, i) => {
    e.classList.toggle('over', over[i]);
    e.classList.add('ovr');
  });
  mxs.forEach((g, i) => {
    const m = mx[i];
    let x = m.x;
    if (!m.w) return; // not laid out (the PRs left off the cards, the list hidden): read once it is
    if (m.l >= 0 && m.sw > m.w) {
      const lo = m.l - MX_LIFT - MX_FADE,
        hi = m.l + m.rw + MX_LIFT + MX_FADE;
      x = Math.max(0, Math.min(m.sw - m.w, lo < x ? lo : hi > x + m.w ? hi - m.w : x));
      if (x !== m.x) g.scrollLeft = x;
    }
    g.classList.add('ovr');
    mxEdges(g, x, m.w, m.sw);
  });
}
function mxEdges(g, x = g.scrollLeft, w = g.clientWidth, sw = g.scrollWidth) {
  const l = x > 1,
    r = x + w < sw - 1;
  g.classList.toggle('over', l || r);
  g.classList.toggle('ofl', l);
  g.classList.toggle('ofr', r);
}
function rollSoon() {
  if (!rollSoon.f)
    rollSoon.f = requestAnimationFrame(() => {
      rollSoon.f = 0;
      rollIn();
      prMoments();
    });
}
// A PR's change, seen (2026-10-11), in the same pass: a chip whose CI went from running to an answer draws it — the
// tick or the cross stroked in, the badge popping, and a failure shaking its chip as a wrong password does — and a
// square gone from open to merged pops as it turns purple. Each square is keyed by its PR and where it
// stands (the header, a card), against what that key showed last; a first sight plays nothing.
const prShown = new Map();
// …and a PR come round to you (2026-10-11): the *your move* tag on a card, or the header's, that was not there the
// last pass slides in on the spring and nudges once. A card or a header seen for the first time plays nothing.
let moveSeen = new Set(),
  placeSeen = new Set();
function moveMoments() {
  const moves = new Set(),
    places = new Set();
  for (const el of document.querySelectorAll('#slist > .card[data-id], .shead[data-sid]'))
    places.add(el.dataset.id || 'h:' + el.dataset.sid);
  for (const el of document.querySelectorAll('#slist > .card .prmove .ymove, .shead .hmove .ymove')) {
    const place = el.closest('.card')?.dataset.id || 'h:' + el.closest('.shead')?.dataset.sid,
      key = place;
    moves.add(key);
    if (moveSeen.has(key) || !placeSeen.has(place) || REDUCED.matches || el.classList.contains('pm')) continue;
    el.classList.add('pm');
    noteMotion(place, 'move');
    el.animate(
      [
        { translate: '-14px', opacity: 0 },
        { translate: '0', opacity: 1 },
      ],
      { duration: 460, easing: SPRING, id: 'move' },
    );
    el.animate(
      [{ translate: '0' }, { translate: '3px' }, { translate: '-2px' }, { translate: '1px' }, { translate: '0' }],
      { duration: 420, delay: 520, easing: 'ease-in-out', composite: 'add', id: 'move' },
    );
  }
  moveSeen = moves;
  placeSeen = places;
}
function prMoments() {
  moveMoments();
  for (const el of document.querySelectorAll('.shead .tmx .mxs[data-url]:not(.pm)')) {
    el.classList.add('pm');
    const key = `${el.closest('.card')?.dataset.id || 'head'}|${el.dataset.url}`,
      now = { st: el.dataset.state || '', ck: el.dataset.checks || '' },
      was = prShown.get(key);
    prShown.set(key, now);
    if (!was || REDUCED.matches) continue;
    if (was.ck === 'pending' && (now.ck === 'pass' || now.ck === 'fail')) {
      const ck = el.closest('.tmx').querySelector(`.mxn[data-url="${CSS.escape(el.dataset.url)}"] .ck`);
      ck?.classList.add('now'); // the number's badge, when it is this PR's
      ck?.animate([{ scale: 0.6 }, { scale: 1 }], { duration: 420, easing: SPRING, id: 'ci' });
      el.animate([{ scale: 1.8 }, { scale: 1 }], { duration: 420, easing: SPRING, id: 'ci' });
      if (now.ck === 'fail')
        el.animate(
          [
            { translate: '0' },
            { translate: '-3px' },
            { translate: '3px' },
            { translate: '-2px' },
            { translate: '1px' },
            { translate: '0' },
          ],
          { duration: 340, delay: 160, easing: 'ease-out', id: 'ci' },
        );
      noteMotion(el.dataset.url, 'ci:' + now.ck);
    }
    if (was.st !== 'merged' && now.st === 'merged') {
      el.animate(
        [
          { scale: 1.9, filter: 'brightness(1.5)' },
          { scale: 1, filter: 'none' },
        ],
        { duration: 560, easing: SPRING, id: 'merged' },
      );
      noteMotion(el.dataset.url, 'merged');
    }
  }
}
function rollIn() {
  const go = [];
  for (const el of document.querySelectorAll('.rn[data-rk]:not(.rk)')) {
    el.classList.add('rk');
    const now = el.textContent,
      key = el.dataset.rk,
      was = rolled.get(key);
    rolled.set(key, now);
    if (was == null || was === now || !/^\d+$/.test(now) || !/^\d+$/.test(was) || REDUCED.matches) continue;
    const from = was.padStart(now.length, ' ').slice(-now.length); // right-aligned: a new place rolls in from empty
    el.classList.add('rolling');
    el.innerHTML =
      `<span class="rv">${now}</span>` +
      [...now]
        .map(
          (d, i) =>
            `<span class="rcol" aria-hidden="true"><span style="transform: translateY(${from[i] === ' ' ? 10 : -from[i] * 10}%)" data-to="${d}"></span></span>`,
        )
        .join('');
    go.push([el, now]);
  }
  if (!go.length) return;
  // each strip rolls by an animation of its own from the old digit (2026-10-13): a transition needed the old digit laid
  // out first — `void document.body.offsetWidth`, a whole style pass and layout, and in WebKit a layer walk, at every
  // count that moved (the bar's CPU and memory every 3 s)
  for (const [el, now] of go) {
    for (const strip of el.querySelectorAll('.rcol > span')) {
      const to = `translateY(${-strip.dataset.to * 10}%)`;
      strip.animate([{ transform: strip.style.transform }, { transform: to }], { duration: ROLL_MS, easing: SPRING });
      strip.style.transform = to;
    }
    noteMotion(el.dataset.rk, 'roll');
    setTimeout(() => {
      if (el.isConnected) {
        el.textContent = now;
        el.classList.remove('rolling');
      }
    }, ROLL_MS + 80);
  }
}
