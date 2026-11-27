// How much a card carries (2026-09-25): large is the card as it always was, your last prompt and Claude's last reply;
// medium keeps only the last word of the two, whoever said it; compact keeps neither — the title, its chips, its PRs.
// A pref, not the server's word: it is how this window looks, like the widths and the folds. cardHtml marks the older
// word and CSS hides by the list's data-cards, so the slider re-renders nothing. A pending question is not a word of
// either: it stays at every size, the one line on a card that asks you to act.
// One line (2026-11-03, round XXII): compact at one height, its third row saying what there is to say. Listed last, for
// the control's data-v is its place here.
const CARD_SIZES = ['large', 'medium', 'compact', 'line'];

// Every part of a card (2026-11-03, round XXII): shown, or left out by CSS through data-hide; the age and the ✓ at rest, which come only
// under the pointer when left out. On this list, what the card in Settings › Chat list says of each: where it is, its name, what off means.
const CARD_PART = {
  tab: ['.top .repo', 'The project'],
  branch: ['.top .chip.wtb', 'Its branch'],
  where: ['.top .chip.elsewhere', 'Running elsewhere'],
  tick: ['.top .act', '✓', 'only under the pointer'],
  tickets: ['.top .ttks', 'Tickets'],
  prs: ['.top .tmx', 'PRs'],
  watch: ['.trow .chip.watch', 'What it watches'],
  age: ['.trow .time', 'Its age', 'only under the pointer'],
  fable: ['.trow .fable', 'The F for Fable'],
  unread: ['.trow .badge', 'Unread count'],
  agents: [':is(.trow .chip.agents, .agl)', 'Agents'],
  live: ['.state.live', 'What it is doing'],
  move: ['.state.prmove', 'Your move'],
  rounds: ['.prpips', 'Rounds'],
  pin: ['.top .ax.pin', 'The pin'],
  nap: ['.top .ax.zz', 'The snooze'],
}; // 2026-11-24, round XXX's A5 and S5: on since 2026-11-25, under the pointer as the ✓

const CARD_PARTS = [
  'prs',
  'rounds',
  'tickets',
  'agents',
  'tab',
  'branch',
  'where',
  'watch',
  'fable',
  'unread',
  'move',
  'live',
  'age',
  'tick',
  'pin',
  'nap',
];

const clab = { on: false, made: false };

const CLAUDING = {
  ring: 'A lap every 4 s, one light per agent',
  arc: 'Turning beside the project’s name, nothing round the card',
  still: 'Nothing moves: the edge in the project’s colour',
};

function applyCards() {
  if (!CARD_SIZES.includes(prefs.cards)) prefs.cards = 'compact';

  const sizeIndex = CARD_SIZES.indexOf(prefs.cards);
  const line = prefs.cards === 'line';

  $('#sessions').dataset.cards = line ? 'compact' : prefs.cards;
  $('#sessions').toggleAttribute('data-line', line);
  $('#sessions').toggleAttribute('data-bylane', !!prefs.cardsByLane && !line);
  $('#cardsByLane').checked = !!prefs.cardsByLane;
  $('#sessions').toggleAttribute('data-even', line || (prefs.cards === 'compact' && !!prefs.cardsEven)); // compact's own switch, and one line's rule

  // what a card shows besides its words (2026-10-21, prefs.cardParts): what is left out is hidden by CSS, the markup
  // the same, so a change redraws no card
  const parts = Array.isArray(prefs.cardParts)
    ? prefs.cardParts
    : CARD_PARTS.filter(part => !['age', 'tick'].includes(part));

  $('#sessions').dataset.hide = CARD_PARTS.filter(part => !parts.includes(part)).join(' ');
  $('#cardsEven').checked = !!prefs.cardsEven;
  $('#sessions').toggleAttribute('data-snipone', !!prefs.cardsSnipOne);
  $('#cardsSnipOne').checked = !!prefs.cardsSnipOne;
  // While Claude works (2026-11-25, round XXVI's R1, M1 and S1): the ring, an arc beside the project or a still edge —
  // CSS alone, by the list's data-clauding, a working card's markup carrying the arc whichever is picked
  if (!CLAUDING[prefs.clauding]) prefs.clauding = 'ring';
  $('#sessions').dataset.clauding = prefs.clauding;
  $('#claudingLook').value = prefs.clauding;
  $('#claudingSay').textContent = CLAUDING[prefs.clauding];

  // the settings: the size picked and what it carries, and its two switches under it — off, with why, where they do nothing
  for (const button of document.querySelectorAll('#cardsSize [data-v]')) {
    button.setAttribute('aria-checked', String(+button.dataset.v === sizeIndex));
  }

  $('#cardsSay').textContent = [
    'Your last prompt and Claude’s last reply',
    'The last word, yours or Claude’s',
    'The title, its chips and its PRs',
    'One height, and a line for the question, your move, what it is doing or the last word',
  ][sizeIndex];

  for (const [row, off, why] of [
    ['#laneRow', prefs.cards === 'large' || line, line ? 'One line keeps every card one height' : ''],
    ['#evenRow', prefs.cards !== 'compact'],
    ['#snipRow', line || (prefs.cards === 'compact' && !prefs.cardsByLane)],
  ]) {
    const element = $(row);
    const say = element.querySelector('small');

    element.classList.toggle('off', off);
    element.querySelector('input').disabled = off;
    say.textContent = off ? why || say.dataset.off : say.dataset.d;
  }

  if (clab.on) cardLabDraw();
  listChanged();
  fadeSoon(); // the cards changed height under the same scroll position; a PR matrix shown again is read (fadeOver)
}

const setCards = sizeIndex => {
  prefs.cards = CARD_SIZES[sizeIndex] || 'compact';
  savePrefs();
  applyCards();
  renderBoard();
}; // a folded card's line is in its markup (liveSlot); only what changed is redrawn

// ---- a card you click (2026-11-03, round XXII's T2): Settings › Chat list holds one real card, cardHtml's on a chat of words about itself, with
// every part on it at once, which no real card has. A click on a part leaves it out of every card, and a click on it here, faint, brings it back.
// The board's rules for the list reach it through a copy of them that lives while the pane shows: every rule naming #slist or #sessions,
// those two standing for .clab and .clabs at the same weight (:is() with an id that never matches), any other id in it never matching.
function clabCss() {
  const named = /#(slist|sessions)\b/;

  const swap = sel =>
    sel.replace(/#[A-Za-z_][\w-]*/g, match =>
      match === '#slist' ? ':is(#_, .clab)' : match === '#sessions' ? ':is(#_, .clabs)' : '#_',
    );

  const tops = sel => {
    const out = [];

    let cur = '';
    let depth = 0;

    for (const char of sel) {
      if (char === '(' || char === '[') depth++;
      if (char === ')' || char === ']') depth--;
      if (char === ',' && !depth) {
        out.push(cur);
        cur = '';
      } else cur += char;
    }

    return [...out, cur];
  };

  const walk = rules => {
    let css = '';

    for (const rule of rules) {
      if (rule.selectorText != null) {
        const keep = tops(rule.selectorText).filter(selector => named.test(selector));

        if (keep.length) css += `${keep.map(swap).join(',')}{${rule.style.cssText}}\n`;
      } else if (rule.cssRules && !(rule instanceof CSSKeyframesRule)) {
        const inner = walk(rule.cssRules);

        if (inner) css += `${rule.cssText.slice(0, rule.cssText.indexOf('{'))}{${inner}}\n`;
      }
    }

    return css;
  };

  let text = '';

  for (const sheet of document.styleSheets) {
    try {
      text += walk(sheet.cssRules);
    } catch {}
  }

  return text;
}

function cardLabMake() {
  const at = new Date().toISOString();
  const who = login => ({ login, at, did: ['reviewed'] });
  const turn = why => ({ you: true, why, movedAt: at, at });

  const pr = (number, why) => ({
    url: `https://github.com/acme/project/pull/${number}`,
    label: `project#${number}`,
    number,
    state: 'open',
    title: 'A pull request',
    updated: at,
    people: [who('ana'), who('rui')],
    turn: turn(why),
  });

  const session = {
    id: 'cardlab',
    title: 'What the chat is about',
    project: 'project',
    cwd: state.sessions.get(state.current)?.cwd || '',
    status: 'idle',
    alive: true,
    model: 'fable',
    startedAt: at,
    lastActivity: at,
    agents: 1,
    lastReply: 'The last word, as much of it as the size lets through',
    lastReplyAt: at,
    worktree: { name: 'branch', branch: 'branch' },
    tasks: [{ kind: 'monitor', what: 'what it watches' }],
    tickets: [{ key: 'KEY-1', cat: 'doing', url: 'https://example.invalid/' }],
    prs: [pr(1, 'why it is your move'), pr(2, 'and this one')],
  };

  const card = html2el(cardHtml(session));

  card.className = 'card idle';
  card.removeAttribute('data-id');
  const inCard = sel => card.querySelector(sel);

  inCard('.trow .time').textContent = '3m';
  inCard('.trow .fable')?.insertAdjacentHTML('afterend', '<span class="badge">2</span>');
  inCard('.state.live').innerHTML = '<span class="ll"><b>A tool</b><span>what it is doing</span></span>';
  const chip = inCard('.trow .chip.agents');

  chip.hidden = false;
  chip.textContent = '1 agent';
  const rows = inCard('.agl');

  rows.hidden = false;

  rows.innerHTML =
    '<div class="agr" data-st="run"><span class="agd"></span><span class="aga">What an agent was asked</span><span class="agt">2m</span><span class="agn">what it does now</span></div>';

  for (const el of card.querySelectorAll('a, button')) el.tabIndex = -1;

  for (const [part, [sel, name]] of Object.entries(CARD_PART)) {
    for (const el of card.querySelectorAll(sel)) {
      el.dataset.part = part;
      el.tabIndex = 0;
      el.setAttribute('role', 'switch');
      el.setAttribute('aria-label', name);
    }
  }

  return card;
}

function cardLabDraw() {
  const box = $('#cardLab');
  const on = Array.isArray(prefs.cardParts) ? prefs.cardParts : [];

  box.toggleAttribute('data-snipone', !!prefs.cardsSnipOne);

  if (!clab.made) {
    clab.made = true;
    box.firstElementChild.replaceChildren(cardLabMake());
  }

  for (const el of box.querySelectorAll('[data-part]')) {
    const part = el.dataset.part;
    const [, name, off] = CARD_PART[part];
    const here = on.includes(part);

    el.classList.toggle('cpoff', !here);
    el.setAttribute('aria-checked', String(here));

    el.title = here
      ? `${name}: click to ${off ? 'keep it to the pointer' : 'hide it on every card'}`
      : `${name}: ${off || 'hidden'}. Click to ${off ? 'keep it at rest' : 'bring it back'}`;
  }

  const gone = CARD_PARTS.filter(part => !on.includes(part) && !CARD_PART[part][2]).map(part => CARD_PART[part][1]);

  $('#cardLabSay').textContent =
    `Click a part to hide it or bring it back. This card has them all at once, which no real one does.${gone.length ? ` Hidden: ${gone.join(', ')}.` : ''}`;
}

function cardLabShow(on) {
  if (on === clab.on) return;
  clab.on = on;
  clab.made = false;
  $('#clabCss')?.remove();

  if (!on) {
    $('#cardLab').firstElementChild.replaceChildren();
    return;
  }

  document.head.append(Object.assign(document.createElement('style'), { id: 'clabCss', textContent: clabCss() }));
  cardLabDraw();
}

function cardLabFlip(el) {
  const part = el.dataset.part;
  const on = Array.isArray(prefs.cardParts) ? prefs.cardParts : [];

  prefs.cardParts = on.includes(part) ? on.filter(other => other !== part) : [...on, part];
  savePrefs();
  applyCards();
}

$('#cardLab').addEventListener(
  'click',
  event => {
    event.preventDefault();
    event.stopPropagation();
    const el = event.target.closest('[data-part]');

    if (el) cardLabFlip(el);
  },
  true,
);

$('#cardLab').addEventListener('contextmenu', event => {
  event.preventDefault();
  event.stopPropagation();
});

$('#cardLab').addEventListener('keydown', event => {
  const el = event.target.closest('[data-part]');

  if (el && (event.key === ' ' || event.key === 'Enter')) {
    event.preventDefault();
    event.stopPropagation();
    cardLabFlip(el);
  }
});

// …and by lane (2026-10-12, a switch, off): the lanes that want you — a question, a PR at your move, Claude at work, a
// new reply — large whatever the slider says, the rest at its size. cardHtml marks those cards .roomy; the list's
// data-bylane lets the mark count, so the switch, like the slider, re-renders nothing.
$('#cardsByLane').addEventListener('change', event => {
  prefs.cardsByLane = event.target.checked;
  savePrefs();
  applyCards();
});

$('#cardsSize').addEventListener('click', event => {
  const button = event.target.closest('[data-v]');

  if (button) setCards(+button.dataset.v);
});

$('#cardsEven').addEventListener('change', event => {
  prefs.cardsEven = event.target.checked;
  savePrefs();
  applyCards();
  renderBoard();
});

$('#cardsSnipOne').addEventListener('change', event => {
  prefs.cardsSnipOne = event.target.checked;
  savePrefs();
  applyCards();
});

$('#claudingLook').addEventListener('change', event => {
  prefs.clauding = event.target.value;
  savePrefs();
  applyCards();
  phaseAnims(true); // an arc shown now turns with every other ring
});

// The pinned section's switch (2026-11-24, round XXX's T7; on since 2026-11-25): the order is the server's and stays,
// so on again it is as it was; off in focus, the catch is said. When mornings start, for a snooze's Tomorrow morning and Next week (Z3).
$('#prioOn').checked = !!prefs.prio;
$('#mornings').value = String(prefs.mornings ?? 9);

$('#prioOn').addEventListener('change', event => {
  const was = prioFocus();

  prefs.prio = event.target.checked;
  savePrefs();
  renderBoard();
  if (was && !prioFocus()) focusCatch();
  const cs = state.sessions.get(state.current);

  if (cs) renderHead(cs);
});

$('#mornings').addEventListener('change', event => {
  prefs.mornings = Number(event.target.value) || 9;
  savePrefs();
});

applyCards();

// A theme's colours are drawn again on the list and the open chat's header.
const redrawColors = () => {
  renderBoard();
  const session = state.sessions.get(state.current);

  if (session) renderHead(session);
};
