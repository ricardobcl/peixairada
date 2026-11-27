// The cards are reconciled, not rebuilt (2026-09-27): every SSE update set the list's innerHTML — every card parsed
// again, six inline SVGs each, 183 of them under ALL, the one under the pointer detached — for a change on one. A
// card whose markup is what it was keeps its node; the rest are made anew; then the nodes are put in order with the
// fewest moves, a node already in place left alone. The lines between the cards are plain markup, made each time.
// …and the list moves rather than jumps (2026-09-27, night): a card that changes rank slides to its new place —
// FLIP: its rectangle read before the reconcile and after, the difference played back as a transform, the
// compositor's kind of motion like the ring —, a card that arrives fades in from a few pixels up, and a card that
// leaves (ticked done with done filtered out, a chip switched off) folds shut where it stood before it goes. Only
// what is within a screen of the list's window moves; the rest is put in place at once, as is everything on the
// first draw and under reduced motion. A leaving card keeps its node for LEAVE_MS as `.leaving` with no data-id (a
// chat that comes straight back gets a node of its own beside it): the reconcile steps over it, and everything that
// walks the cards — listGeom, markQsel, hotMove — leaves it out. Each animation carries its name in `id`, for the
// harness (list-motion.mjs) and the inspector.
const FLIP_MS = 220;
const ENTER_MS = 180;
const LEAVE_MS = 200;

// The motion tokens, read once from :root (2026-10-11) — the CSS is where a curve is written.
const cssToken = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

const EASE_OUT = cssToken('--ease-out') || 'ease-out';
const SPRING = cssToken('--spring') || 'ease-out';

const MOTION = []; // the last moves the list made, {id, kind, at} — window.peix.motion(), so a check need not catch a 200 ms slide in the act

const noteMotion = (id, kind, dy = 0) => {
  MOTION.push({ id, kind, at: Math.round(performance.now()), dy });
  if (MOTION.length > 1000) MOTION.shift();
}; // a check slices it from a length it read: kept long enough not to roll under it (64 until 2026-10-11, when the counts' rolls and the live lines came)

const slide = (el, kind, frames, opts, dy = 0) => {
  noteMotion(el.dataset.id || null, kind, dy);
  return follow(el.animate(frames, { ...opts, id: kind }));
};

// The list's frame follows a slide (2026-10-02): it was drawn once after a render, from rects read while the cards had
// only begun to move — so what is drawn from the cards' places stood where they had been until the next update,
// seconds later. While anything in the list moves the frame is drawn every frame, and once more after.
const sliding = new Set();

const follow = animation => {
  sliding.add(animation);

  const end = () => {
    sliding.delete(animation);
    listChanged();
  };

  animation.addEventListener('finish', end);
  animation.addEventListener('cancel', end);
  listChanged();
  return animation;
};

// The reply landed: a chat that goes from clauding to ready flares its card's edge once (the `landed` animation,
// LANDED_MS) — marked by the session handler, applied here with a negative delay so a rebuild mid-flare carries on.
const LANDED_MS = 1100;
const landedAt = new Map(); // chat id → when it landed (the flare and the wash: 1.1 s, 2026-10-09)

// The question answered (2026-10-11): a chat that stops asking while its claude lives gets `heard`, the same way —
// the sonar once backwards, closing in on the card, and the ring of what it does next fading in.
const HEARD_MS = 500;
const heardAt = new Map();

function flareLanded() {
  const now = performance.now();

  for (const [id, at] of heardAt) {
    const el = cardNodes.get(id)?.el;
    const gone = now - at;

    if (gone >= HEARD_MS || !el || REDUCED.matches) {
      heardAt.delete(id);
      continue;
    }

    if (el.classList.contains('heard')) continue;
    el.classList.add('heard');
    el.style.setProperty('--heard-delay', `-${Math.max(1, Math.round(gone))}ms`);

    el.addEventListener(
      'animationend',
      event => {
        if (event.animationName === 'heard') {
          el.classList.remove('heard');
          el.style.removeProperty('--heard-delay');
        }
      },
      { once: true },
    );
  }

  for (const [id, at] of landedAt) {
    const el = cardNodes.get(id)?.el;
    const gone = now - at;

    if (gone >= LANDED_MS || !el || REDUCED.matches) {
      landedAt.delete(id);
      continue;
    }

    if (el.classList.contains('landed')) continue;
    el.classList.add('landed');
    el.style.animationDelay = `-${Math.max(1, Math.round(gone))}ms`; // never -0ms, which reads back as 0ms

    el.addEventListener(
      'animationend',
      event => {
        if (event.animationName === 'landed') {
          el.classList.remove('landed');
          el.style.animationDelay = '';
        }
      },
      { once: true },
    );
  }
}

const cardNodes = new Map(); // chat id → { html, el }: the card as it stands in the list
let lineNodes = new Map(); // a line's html and its count in the list ("…#2") → its node, kept like the cards'

const html2el = html => {
  const template = document.createElement('template');

  template.innerHTML = html;
  return template.content.firstElementChild;
};

/** innerHTML, only when it is new (2026-10-03): the project cue, the chips, the hidden list, the tab strips and the
 *  rival's bar were set on every update — a button replaced between a press and its release loses the click, and
 *  the keyboard's focus with it. Whatever edits such a box in place has to forget `_drawn`. */
const setHtml = (el, html) => {
  if (el._drawn === html) return false;
  el.innerHTML = el._drawn = html;
  return true;
};

/** setHtml a child at a time (2026-10-14): `htmls` are the box's children, each one element's markup; a child whose
 *  markup is what it was keeps its node, so a line that moves on its own redraws nothing beside it. */
function setKids(el, htmls) {
  const tpl = document.createElement('template');

  htmls.forEach((html, index) => {
    const child = el.children[index];

    if (child?._drawn === html) return;
    tpl.innerHTML = html;
    const node = tpl.content.firstElementChild;

    node._drawn = html;
    if (child) child.replaceWith(node);
    else el.append(node);
  });

  while (el.children.length > htmls.length) el.lastElementChild.remove();
}

const OTHERS_SQUARES = 8;
const CUE_CHEV = '<svg class="ch" viewBox="0 0 10 10" aria-hidden="true"><path d="M1.5 3.5 5 7l3.5-3.5" /></svg>';
const notDone = session => visible(session) && bucket(session) !== 'done';

// The list's end says what the project in view hides (2026-11-04, round XXV): where the eye lands on a short list, a square
// for each of the other projects, the fullest first, and Show all; nothing when there is nothing else.
function othersHtml(project) {
  const by = new Map();
  const rest = [...state.sessions.values()].filter(session => notDone(session) && !inProject(session, project));

  if (!rest.length) return '';

  for (const session of rest) {
    const group = by.get(session.project) || { n: 0, cwd: session.cwd };

    group.n++;
    by.set(session.project, group);
  }

  const squares = [...by.values()]
    .sort((left, right) => right.n - left.n)
    .slice(0, OTHERS_SQUARES)
    .map(group => `<i style="${repoStyle(repoColor(group.cwd))}"></i>`)
    .join('');

  return `<div class="gsep others" data-others role="button" tabindex="0" title="Every project again (ALL)"><span class="sqs" aria-hidden="true">${squares}</span><span class="ln">${rest.length} more in ${by.size === 1 ? 'another project' : 'other projects'}</span><b>Show all</b></div>`;
}

// …and in focus (2026-11-24, round XXX's F2), a question from a chat not pinned
const askingElsewhere = project =>
  [...state.sessions.values()].filter(
    session =>
      visible(session) && askingLoud(session) && (!inProject(session, project) || (prioFocus() && !inPrio(session))),
  );

/** The tab atop the list: the project in view, or the pinned alone (F2) — what is hidden, and the way back. */
function cueDraw(project, here, focus = false) {
  const box = $('#stitle');
  const on = project.key !== ALL || focus;

  box.hidden = !on;
  $('#sessions').classList.toggle('scoped', on);
  box.classList.toggle('focus', focus);
  if (focus && project.key === ALL) $('#sessions').style.setProperty('--repo', 'var(--accent)');

  if (!on) {
    setHtml(box, '');
    return;
  }

  const count = here.filter(notDone).length;
  const all = [...state.sessions.values()].filter(notDone).length;
  const ask = askingElsewhere(project).length;

  const tip = focus
    ? `Only the pinned chats, in your order${project.key !== ALL ? `, in ${project.name}` : ''} — the rest is quiet but for its questions · ⌥⌘U for every chat`
    : `${project.custom ? `${project.name}: ${project.cwds.join(', ') || 'no folders yet'}` : project.key} — a click or ⌥⌘P for another`;

  const name = focus
    ? `${ICON.prio}Pinned${project.key !== ALL ? ` · ${esc(project.name)}` : ''}`
    : `${projIcon(project.name)}${esc(project.name)}`;

  setHtml(
    box,
    `${
      focus
        ? `<span class="t" title="${esc(tip)}"><span class="n">${name}</span></span>`
        : `<button type="button" class="t" title="${esc(tip)}"><span class="n">${name}</span>${CUE_CHEV}</button>`
    }<span class="cn" role="status" title="${count} of the ${all} chats not done">${rn('cue:n', count)} of ${rn('cue:all', all)}</span>` +
      `<span class="out">${ask ? `<button type="button" class="ask" title="Go to the one waiting longest"><i></i>${rn('cue:ask', ask)} asking</button>·` : ''}<button type="button" class="sx" title="${focus ? 'Every chat again (⌥⌘U)' : 'Every project again (ALL)'}">Show all</button></span>`,
  );
}

const nearList = (rect, listRect) =>
  rect.bottom > listRect.top - listRect.height && rect.top < listRect.bottom + listRect.height; // within a screen of the list's window

// The cue's row comes or goes after drawCards has read where the cards stood, so they slide by its height too
const cueNow = () => {
  const draw = drawCards.cue;

  drawCards.cue = null;
  draw?.();
};

function drawCards(items, empty) {
  const list = $('#slist');
  const want = new Set();
  const nodes = [];
  const fresh = new Set();
  const redrawn = [];
  const lines = new Map();
  const seen = new Map();

  const move = !!drawCards.drawn && !REDUCED.matches && !prefs.listHidden; // hidden, nothing to see move
  const lane = move ? drawCards.lane : null;

  drawCards.lane = null; // a lane folded or opened by its head (foldLane)
  drawCards.drawn = true;

  for (const it of items) {
    if (!it.id) {
      // a line: the node it had, by its key (else its html) and how many of the same came before it
      const base = it.key || it.html;
      const count = (seen.get(base) || 0) + 1;

      seen.set(base, count);

      const key = `${base}#${count}`;
      const was = lineNodes.get(key);
      const el = !was ? lineEl(it.html) : was._html === it.html ? was : lineMorph(was, it.html);

      lines.set(key, el);
      nodes.push(el);
      continue;
    }

    let card = cardNodes.get(it.id);

    if (!card) fresh.add(it.id);

    if (!card || card.html !== it.html) {
      const el = html2el(it.html);
      const sess = state.sessions.get(it.id);

      if (sess) agFresh(el, sess);
      if (card) redrawn.push([card.el, el]); // the card redrawn: it starts where its old node stood
      card = { html: it.html, el };
      cardNodes.set(it.id, card);
    }

    nodes.push(card.el);
    want.add(it.id);
  }

  lineNodes = lines;
  for (const id of [...cardNodes.keys()]) if (!want.has(id)) cardNodes.delete(id);

  if (!nodes.length) {
    cueNow();
    list.innerHTML = empty;
    return true;
  }

  // Nothing moved, nothing new, nothing gone — most updates (2026-10-03: every one measured every card twice and
  // made every line anew): the list is left as it is, and nothing is read.
  let index = 0;
  let same = true;

  for (const child of list.children) {
    if (child.classList.contains('leaving')) continue;

    if (child !== nodes[index++]) {
      same = false;
      break;
    }
  }

  if (same && index === nodes.length) {
    cueNow();
    flareLanded();
    followCard();
    return false;
  } // …and nothing new to phase

  const lr = move ? list.getBoundingClientRect() : null;
  const before = new Map();

  if (move) {
    for (const card of cardNodes.values()) {
      if (card.el.isConnected) before.set(card.el, card.el.getBoundingClientRect());
    }

    for (const [was, el] of redrawn) if (was.isConnected) before.set(el, was.getBoundingClientRect());
  }

  cueNow();

  const keep = new Set(nodes);
  const gone = [];
  const gap = move ? parseFloat(getComputedStyle(list).rowGap) || 0 : 0;

  if (lane?.shut) {
    foldRun(
      list,
      lane.g,
      lr,
      gap,
      node =>
        node.classList.contains('leaving') ||
        (node.classList.contains('card') ? !want.has(node.dataset.id) : !keep.has(node)),
    );
  }

  let cur = list.firstElementChild;

  // a node no longer wanted: a line, or the old node of a card redrawn, goes at once; a card that is gone from the
  // list is kept in place to fold (leaveCard); a wrapper already folding is stepped over
  const skip = () => {
    while (cur && !keep.has(cur)) {
      const next = cur.nextElementSibling;

      if (cur.classList.contains('leaving')) {
        cur = next;
        continue;
      }

      if (!cur.classList.contains('card') || want.has(cur.dataset.id)) cur.remove();
      else gone.push(cur);
      cur = next;
    }
  };

  for (const el of nodes) {
    skip();

    if (cur === el) {
      cur = cur.nextElementSibling;
      continue;
    }

    list.insertBefore(el, cur); // a new node lands; an existing one further down moves up
  }

  skip();
  for (const el of gone) leaveCard(el, lr, gap);
  flareLanded();

  if (!move) {
    followCard();
    return true;
  }

  for (const animation of [...sliding]) if (animation.id === 'flip') animation.cancel(); // the true place, not where a slide had got to
  const far = followCard() ? lr.height : Infinity; // gone to the card: the card rises from where it stood, the rest come in from a screen away at most, not from a long way up the list

  // a lane opened is uncovered once its cards are filled in (openRun, from renderSessionList: a card's age and live line
  // set after this can make it taller); what is under a lane folded or opened moves with it, by the room it makes —
  // no enter, no FLIP (a card past the window's foot was put just below it at once: a FLIP from there would leave the
  // lines it stands among behind)
  if (lane && !lane.shut) drawCards.opening = { g: lane.g, lr, gap };

  const laneHead = lane && lineNodes.get(`lane:${lane.g}#1`);
  const under = el => !!laneHead && !!(laneHead.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING);

  // every read first, then every animation: a read after an animate() is a style flush each
  const moves = [];

  for (const [id, card] of cardNodes) {
    const el = card.el;

    if (under(el)) continue;
    const rect = el.getBoundingClientRect();

    if (!nearList(rect, lr)) continue;
    const was = before.get(el);

    if (!was) {
      if (fresh.has(id)) moves.push([el, 'enter', getComputedStyle(el).opacity]);
      continue;
    } // to its own opacity: a done card is dimmed

    const dy = Math.max(-far, Math.min(far, was.top - rect.top));

    if (Math.abs(dy) > 1) moves.push([el, 'flip', dy]);
  }

  for (const [el, kind, value] of moves) {
    if (kind === 'enter') {
      slide(
        el,
        'enter',
        [
          { opacity: 0, transform: 'translateY(-6px)' },
          { opacity: value, transform: 'none' },
        ],
        { duration: ENTER_MS, easing: 'ease-out' },
      );
    } else {
      slide(
        el,
        'flip',
        [{ transform: `translateY(${value}px)` }, { transform: 'none' }],
        { duration: FLIP_MS, easing: EASE_OUT },
        Math.round(value),
      );
    }
  }

  return true;
}

// Your word takes the list to the card (2026-11-02): a word in the open chat moves its card up its lane, or up to
// Clauding from far down the list, and the list went on showing where it had been. The session handler marks it and
// the next draw goes — at once, as a located card does, only when the card is out of sight: to the list's top if the
// card is on its first screen, so the lanes over it show, else just far enough. Only your word: a reply landing or a
// PR's move leaves a list you may be reading where it is. Hidden, it waits for the list to show (applyList).
function followCard() {
  const id = followCard.id;

  if (!id || prefs.listHidden) return false;
  followCard.id = null;

  const list = $('#slist');
  const el = id === state.current ? cardNodes.get(id)?.el : null;

  if (!el?.isConnected) return false;
  const was = list.scrollTop;

  el.scrollIntoView({ block: 'nearest' });
  if (list.scrollTop !== was && el.offsetTop + el.offsetHeight <= list.clientHeight) list.scrollTop = 0;
  return list.scrollTop !== was;
}

// The card is wrapped in a `div.leaving` that folds shut around it (height, opacity and the list's gap to nothing —
// read off the list, 2026-11-01: a 7 written here pulled the sidebar's rows, 2 px apart, 5 px a card too far up, and
// they dropped back as the fold ended): the card itself keeps its look, loses its data-id, and — no longer a child of
// the list — is out of `#slist > .card`, which is how everything on the page and in the harness counts and walks the cards.
function leaveCard(el, lr, gap) {
  const rect = lr && el.getBoundingClientRect();

  if (!rect || !nearList(rect, lr)) {
    el.remove();
    return;
  }

  const height = el.offsetHeight;
  const wrap = document.createElement('div');

  wrap.className = 'leaving';
  noteMotion(el.dataset.id || null, 'leave');
  el.replaceWith(wrap);
  wrap.append(el);
  el.removeAttribute('data-id');

  const animation = follow(
    wrap.animate(
      [
        { height: `${height}px`, opacity: 1, marginBottom: '0px' },
        { height: '0px', opacity: 0, marginBottom: `${-gap}px` },
      ],
      { duration: LEAVE_MS, easing: 'ease-in', fill: 'forwards', id: 'leave' },
    ),
  );

  animation.onfinish = animation.oncancel = () => {
    wrap.remove();
    listChanged();
  }; // the cards below moved up under the fold: the ends' counts and the timeline read the list again
}

// A line's node keeps its markup, and each child its own (2026-11-01), so a keyed line drawn anew — a lane's head
// folded or opened, its count moved — is the same node: its attributes set, the children whose markup changed
// replaced. The caret turns by its transition, the keys stay on it, and drawEdges' classes stay till it next looks.
function lineEl(html) {
  const el = html2el(html);

  el._html = html;
  for (const child of el.children) child._drawn = child.outerHTML;
  return el;
}

function lineMorph(el, html) {
  const fresh = lineEl(html);

  if (fresh.tagName !== el.tagName || fresh.childNodes.length !== fresh.children.length) return fresh;
  const edge = ['covered', 'stuck', 'pushed'].filter(className => el.classList.contains(className));

  for (const attribute of [...el.attributes]) {
    if (!fresh.hasAttribute(attribute.name)) el.removeAttribute(attribute.name);
  }

  for (const attribute of fresh.attributes) {
    if (el.getAttribute(attribute.name) !== attribute.value) el.setAttribute(attribute.name, attribute.value);
  }

  el.classList.add(...edge);
  const kids = [...fresh.children];

  kids.forEach((kid, index) => {
    const child = el.children[index];

    if (child?._drawn !== kid._drawn) {
      if (child) child.replaceWith(kid);
      else el.append(kid);
    }
  });

  while (el.children.length > kids.length) el.lastElementChild.remove();
  el._html = html;
  return el;
}

// A lane folded or opened by its head is one motion (2026-11-01): the head stays put and the list under it slides —
// up over the lane's cards as they fade, or down off them as they come up — in one FLIP_MS, eased out. Each card had
// folded on its own before (drawCards' leave), the day lines gone at once, the head a new node put after the folding
// cards, which jumped up into its place while it rode up under them; and opening, the cards under the lane slid down
// across the new ones from where they had been while the lines jumped. The lane's cards stand still: a fold wraps
// them, its day lines and its `more` line, in one `div.leaving` (leaveCard's: the cards lose their data-id) whose
// height goes to nothing; an opening leaves them children of the list (`#slist > .card` sees them at once), clips
// each to what the list under the lane has uncovered so far, and slides that list down by the margin under the last
// of them. Height, margin and clip are the main thread's, so the edge and the cards it uncovers stay in step, as no
// transform on the compositor beside a clip on the main thread would; it is a click's 220 ms, a layout a frame, as
// leaveCard's always was. Only the room in the list's window moves: what is past its foot goes or comes at once.
const laneRun = head => {
  const run = [];

  for (let node = head.nextElementSibling; node && !node.matches('.gsep.lane'); node = node.nextElementSibling) {
    run.push(node);
  }

  return run;
};

const cssPx = (el, property) => parseFloat(getComputedStyle(el)[property]) || 0;
const rectOf = el => el.getBoundingClientRect(); // to the fraction: offsetTop and offsetHeight are whole pixels

function foldRun(list, lane, lr, gap, going) {
  const head = lineNodes.get(`lane:${lane}#1`);

  if (!head?.isConnected || !nearList(head.getBoundingClientRect(), lr)) return;
  const run = laneRun(head).filter(going);

  if (!run.length) return;

  const out = node => {
    if (node.classList.contains('card')) {
      noteMotion(node.dataset.id || null, 'leave');
      node.removeAttribute('data-id');
    }
  };

  for (const node of run) for (const animation of node.getAnimations()) if (animation.id === 'flip') animation.cancel(); // measured where it lies

  // the head stuck over its own lane: what is under it or above the window goes at once and the scroll comes back as
  // far — nothing in sight moves, and the fold starts where the lane does
  const st = list.scrollTop;
  const hb = rectOf(head).bottom;

  let covered = 0;

  if (st > 0) while (covered < run.length - 1 && rectOf(run[covered]).bottom <= hb) covered++;
  const at = node => rectOf(node).top - rectOf(list).top + list.scrollTop; // in the list, whatever the scroll: Chrome's anchoring may move it as they go

  if (covered) {
    const keptAt = at(run[covered]);

    for (const node of run.splice(0, covered)) {
      out(node);
      node.remove();
    }

    list.scrollTop = st - (keptAt - at(run[0]));
  }

  const first = run[0];
  const last = run[run.length - 1];
  const foot = rectOf(list).top + list.clientHeight;

  const top = rectOf(first).top - cssPx(first, 'marginTop');
  const room = rectOf(last).bottom + cssPx(last, 'marginBottom') - top; // with an opening's margin, if one was under way

  const height = Math.min(room, Math.max(0, foot - top)); // past the window's foot: folded at once

  for (const node of run) {
    for (const animation of node.getAnimations()) {
      if (animation.id === 'enter' || animation.id === 'open') animation.cancel();
    }
  }

  const wrap = document.createElement('div');

  wrap.className = 'leaving';
  first.before(wrap);

  for (const node of run) {
    out(node);
    wrap.append(node);
  }

  const fold = follow(
    wrap.animate(
      [
        { height: `${Math.max(0, height)}px`, marginBottom: `${Math.min(0, height)}px`, opacity: 1 },
        { height: '0px', marginBottom: `${-gap}px`, opacity: 0 },
      ],
      { duration: FLIP_MS, easing: EASE_OUT, fill: 'forwards', id: 'fold' },
    ),
  );

  fold.onfinish = fold.oncancel = () => {
    wrap.remove();
    listChanged();
  };
}

function openRun(list, lane, lr, gap) {
  const head = lineNodes.get(`lane:${lane}#1`);

  if (!head?.isConnected || !nearList(head.getBoundingClientRect(), lr)) return;

  const all = laneRun(head);
  const held = all.filter(node => node.classList.contains('leaving'));
  const run = all.filter(node => !held.includes(node));

  if (!run.length) return;
  // a fold of the lane still under way: the room it holds now is where the opening starts
  const from = held.reduce((sum, wrap) => sum + rectOf(wrap).height + cssPx(wrap, 'marginBottom') + gap, 0);

  for (const wrap of held) {
    for (const animation of wrap.getAnimations()) animation.cancel();
    wrap.remove();
  } // at once: a cancel's event comes a frame on

  // the room under the head, from the gap below it: with `uncovered` of it uncovered, the list under the lane starts at uncovered + gap
  const first = run[0];
  const last = run[run.length - 1];
  const mb = cssPx(last, 'marginBottom');
  const top = rectOf(first).top - cssPx(first, 'marginTop') - gap;

  const full = rectOf(last).bottom + mb - top;
  const to = Math.min(full, Math.max(from, rectOf(list).top + list.clientHeight - top));

  if (to <= from) return;

  const at = uncovered => Math.min(1, Math.max(0, (uncovered - from) / (to - from)));
  const r2 = value => Math.round(value * 100) / 100;

  const plans = run.map(node => {
    // every read first
    const rect = rectOf(node);
    const nodeTop = rect.top - top;
    const height = rect.height;
    const opacity = +getComputedStyle(node).opacity;

    const marks = [...new Set([0, at(nodeTop - gap), at(nodeTop + height - gap), 1])].sort(
      (left, right) => left - right,
    );

    return [
      node,
      marks.map(progress => {
        const uncovered = from + progress * (to - from);
        const shown = Math.min(height, Math.max(0, uncovered + gap - nodeTop));

        return {
          offset: progress,
          clipPath: `inset(0px -40px ${shown < height ? `calc(100% - ${r2(shown)}px)` : '0px'} -40px)`,
          opacity: r2(opacity * progress),
        };
      }),
    ]; // from its top: a card that grows as its live line is filled shows no more
  });

  for (const [node, frames] of plans) {
    if (node.dataset.id) noteMotion(node.dataset.id, 'enter');
    follow(node.animate(frames, { duration: FLIP_MS, easing: EASE_OUT, id: 'enter' }));
  }

  follow(
    last.animate([{ marginBottom: `${r2(mb + from - full)}px` }, { marginBottom: `${r2(mb + to - full)}px` }], {
      duration: FLIP_MS,
      easing: EASE_OUT,
      id: 'open',
    }),
  );
}

// Every render rebuilds its nodes, and a CSS animation starts over on a new node — so the clauding ring, an asking
// card's blink and the state dots' pulse jumped back to their start on every SSE update (2026-09-27; measured: a new
// card and a new start time on each of five updates). The school's fix of 2026-09-20, applied to them all: after a
// render every such animation is put at start time 0 on the document clock, so the new node is exactly where the old
// one was — and so every ring turns in step. Once at 0 it stays there. A CSSTransition (the age fading in) has no
// animationName, so it is left alone. getAnimations() is the document's running animations, a few dozen at most, and
// the style flush it forces is the one the frame was about to do. (Each card at a start of its own, hashed from the
// chat's id, was a switch from 2026-09-27 to 2026-10-14.)
const PHASED = new Set(['ring', 'sonar', 'pulse', 'pix', 'pixhop', 'shimw', 'shimi', 'spsonar', 'spspin']); // Space's pings and arcs too (2026-11-18, v11)

// Once a frame, before it paints: the list and the header both ask after a render, and getAnimations() flushes style
// each time. `now`: at once, and read at once.
// The phase is set as the current time that start would mean first, and the start after it (2026-10-11): WebKit — the
// app's — hands the transform to the compositor, and a startTime set once it has done so reads back from the script
// but never reaches the screen. Measured in a WKWebView, twelve rings made and phased at six moments (in the task that
// made them, a frame on, inside a frame…): the start alone left every running one where it began, and one pending one
// too — the switch moved no ring at all; the current time first moved every one. The start after it resolves a
// pending one (its current time leaves it unresolved) and makes a running one's exact (Chrome's was 2e-13 off).
// Chrome takes the start alone, so the harness never saw it.
// Only when something new may have started (2026-10-13): getAnimations() is a style pass, and in WebKit a walk of every
// layer, and it ran twice a render — the render's own call and renderBoardSoon's at once — whether a node was made or
// not. A run at once now clears a queued one, renderBoardSoon runs it at once only when the render queued one, and a
// render that changed no node (drawCards: false) queues none.
function phaseAnims(now = false) {
  const run = () => {
    phaseAnims.queued = false;
    const at = document.timeline.currentTime;

    for (const animation of document.getAnimations()) {
      if (PHASED.has(animation.animationName)) {
        if (animation.startTime === 0 && !animation.pending) continue;
        animation.currentTime = at;
        if (animation.startTime !== 0) animation.startTime = 0;
      }
    }
  };

  if (now) return run();
  if (phaseAnims.queued) return;
  phaseAnims.queued = true;

  requestAnimationFrame(() => {
    if (phaseAnims.queued) run();
  });
}
