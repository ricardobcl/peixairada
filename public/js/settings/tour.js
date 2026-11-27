// ---- the tour: the board's main parts, one at a time (2026-10-14) ------------------------------------------------
// A modal dialog the size of the window (#tour): a hole in a dim veil round one part of the board and a card beside
// it saying what the part is and its keys — ← → or the buttons, esc or Skip to leave. It comes up on its own once,
// after the first run's question is answered (welcomeAnswer, unless prefs.toured), and whenever asked: Settings'
// head, the launcher (⌥⌘L), home's keys line, the ? sheet and the About box. A step's part is looked for on the
// board as it stands — a chat open or not, the list hidden or not —: one that is not
// there shows the card in the middle, or is left out when the step is about it alone (`need`). Look, don't touch: the
// board under the veil is inert, and nothing is opened, folded or moved for the tour but a card brought into view.
const tour = { steps: [], i: 0, els: [], drawn: '', timer: 0, done: false };

/** An element with a box on screen, else null. */
const onScreen = el => {
  const rect = el?.getBoundingClientRect();

  return rect &&
    rect.width > 0 &&
    rect.height > 0 &&
    rect.bottom > 0 &&
    rect.top < innerHeight &&
    rect.right > 0 &&
    rect.left < innerWidth
    ? el
    : null;
};

/** The card the tour points at: one that is doing something, else the open chat's, else the top one. */
const tourCard = () => {
  const cs = [...document.querySelectorAll('#slist > .card')];

  return (
    cs.find(card => card.matches('.asking, .working, .watching')) ||
    cs.find(card => card.classList.contains('active')) ||
    cs[0] ||
    null
  );
};

/** A step's keys as rows: what you press, what it does. */
const tourKeys = rows =>
  `<div class="tkeys">${rows
    .map(
      ([press, does]) =>
        `<span>${press
          .split(' ')
          .map(key => `<kbd>${key}</kbd>`)
          .join(' ')}</span><span>${does}</span>`,
    )
    .join('')}</div>`;

const TOUR = [
  {
    id: 'hello',
    mid: true,
    logo: true,
    title: 'Every Claude Code chat on this Mac, on one board',
    text: () =>
      'The terminal’s, VS Code’s and the board’s own — read from what Claude Code already writes, and never written to. Here are the main parts, in a couple of minutes.',
    how: () =>
      '<kbd>←</kbd> <kbd>→</kbd> to move · <kbd>esc</kbd> to leave — Settings, <kbd>⌥⌘L</kbd> and home take you round again',
  },
  {
    id: 'list',
    at: () => ($('#slist > .card') ? $('#slist') : $('#sessions')),
    title: 'The one waiting for you is on top',
    text: () =>
      `${prefs.listHidden ? 'Hidden for now — <kbd>⌥⌘B</kbd>, or the first button at the foot’s left, brings it back. ' : $('#slist > .card') ? '' : 'Empty for now — <kbd>⌥⌘N</kbd> starts a chat. '}Every chat sorts into lanes by what it needs: <b>Asking you</b>, <b>Clauding</b>, <b>Ready</b>, then <b>Idle</b> and <b>Done</b>, folded. In each lane the newest word leads; a lane’s head folds it.`,
  },
  {
    id: 'card',
    need: true,
    at: tourCard,
    title: 'A card is a chat',
    text: () =>
      'Its edge says what it is doing without opening it: a light running round while Claude works, a slow one while a monitor watches, red pings while it asks you something. Its PRs sit at the top right. <b>✓</b> ticks it done; a right-click has the rest.',
  },
  {
    id: 'find',
    side: 'above',
    at: () => onScreen($('#sbFind')),
    title: 'Find a chat',
    text: () =>
      'The first button hides the list, for the room, and brings it back — <kbd>⌥⌘B</kbd>. The magnifier — <kbd>⌥⌘F</kbd> — searches the list by any letters in order: <em>chk rtr</em> finds <em>checkout retry</em>. The funnel shows only the chats with a new reply. <kbd>⌥⌘P</kbd> narrows the list to a project, <kbd>⌥⌘K</kbd> jumps to any chat.',
  },
  {
    id: 'new',
    mid: true,
    title: 'A new chat, anywhere',
    text: () =>
      '<kbd>⌥⌘N</kbd> asks where — nowhere in particular, the project in view, another, any repo in your folders, or one to clone — then offers its open chats, or a new one: in the folder, or <b>on a new branch</b>, in a worktree of its own. Claude starts in a terminal on the board, and the chat has its card at once. <kbd>⌥⌘O</kbd> goes straight to your quick project.',
    pic: () =>
      `<div class="tmock"><div class="hd"><kbd>⌥⌘N</kbd> › widgets</div><div class="r on">＋ new chat</div><div class="r">＋ new chat on a new branch<small>a worktree</small></div><div class="r"><i style="--c: var(--idle)"></i>Fix the checkout retry<small>ready</small></div><div class="r"><i style="--c: var(--working)"></i>Bump the SDK<small>clauding</small></div></div>`,
  },
  {
    id: 'chat',
    at: () => (state.current ? [$('#groups'), $('#resume')] : $('#chat')),
    title: () => (state.current ? 'The chat, live' : 'The chat you open comes up here'),
    text: () =>
      `${state.current ? 'Its transcript, as Claude writes it.' : 'With none open, this is home: your day across every chat. Click a card and its transcript comes up, live.'} When its claude runs on the board it is a real terminal to type into, and a chat whose claude has ended offers to resume it here.`,
  },
  {
    id: 'open',
    side: 'below',
    at: () => (state.current ? onScreen($('#moreBtn')) : null),
    title: 'Its terminal, GitHub, editor and diff',
    text: () =>
      `${state.current ? 'Everything the chat has' : 'Once a chat is open, everything it has'}, a key away — each on a tab beside it, and the same key again fills the column with it.${state.current ? ` Claude, the changes and ${inEdName()} are in <b>···</b> too.` : ''}${inApp ? '' : ' In a browser, GitHub and VS Code Web open in tabs of their own.'}`,
    pic: () =>
      tourKeys([
        ['⌥⌘C', 'its Claude, in a terminal here — or taken over from where it runs'],
        ['⌥⌘T', 'a shell in its folder · <kbd>⌘T</kbd> another'],
        ['⌥⌘G', 'its PR on GitHub, or the repo'],
        ['⌥⌘E', `its folder in ${inEdName()} · <kbd>⌥⌘V</kbd> in ${editor().name} itself`],
        ['⌥⌘D', 'what it changed: the last turn, the uncommitted tree, the branch, a PR'],
        ['⌥⌘J', 'its timeline: the chat and its PRs in one order'],
      ]),
  },
  {
    id: 'split',
    at: () => (state.current ? $('#groups') : null),
    title: 'Two halves, side by side or stacked',
    text: () =>
      '<kbd>⌘2</kbd> splits the chat column side by side, <kbd>⌥⌘2</kbd> one over the other: the digit is the half, the modifier the layout, so <kbd>⌘1</kbd> <kbd>⌘2</kbd> or <kbd>⌥⌘1</kbd> <kbd>⌥⌘2</kbd> move between the halves, turning the split. A new tab opens in the second half; drag a tab across to move it; <kbd>⌘0</kbd> closes the other half.',
    pic: () =>
      `<div class="tsplit"><figure><div class="w side"><i></i><i class="a">1</i><i class="b">2</i></div><figcaption><kbd>⌘1</kbd> <kbd>⌘2</kbd> side by side</figcaption></figure><figure><div class="w stack"><i></i><i class="a">1</i><i class="b">2</i></div><figcaption><kbd>⌥⌘1</kbd> <kbd>⌥⌘2</kbd> stacked</figcaption></figure></div>`,
  },
  {
    id: 'prs',
    side: () => (state.current ? 'below' : 'right'),
    at: () =>
      (state.current && onScreen($('#prToggle'))) ||
      [...document.querySelectorAll('#slist > .card .tmx')].find(onScreen) ||
      null,
    title: 'PRs and tickets link themselves',
    text: () =>
      'Every PR the chat names is put on it once GitHub finds it there — a link, <em>#12</em> or <em>widgets#12</em> in what you or Claude wrote, one Claude opened — and Jira tickets by their key or the branch’s name. A square says its state, in the header its CI too, and the pointer on one brings up the rest; the git mark beside the header’s lists them, each with its diff, the editor at its branch and a chat on it. Right-click one that doesn’t belong to take it off. The PRs need <b>gh</b>, signed in.',
    pic: () =>
      `<div class="tlink"><span class="tq">“…#12 is the base, and acme/widgets#13 depends on it”</span><span class="tto">→ <b>#12</b><span class="tchip" data-state="open"></span><span class="tchip" data-state="draft"></span><span class="tchip tk"></span></span></div>`,
  },
  {
    id: 'move',
    side: () => (onScreen($('#shead .hmove')) ? 'below' : 'above'),
    at: () => onScreen($('#shead .hmove')) || onScreen($('#slist > .card .prmove')) || onScreen($('#fBtn')),
    title: 'Your move',
    text: () =>
      'A PR you wrote or reviewed has a turn. When someone reviews, comments or pushes after your last word on it — or asks for your review again — it is <b>your move</b>: the card and the header say so, the chat comes back from Done and up the list, and a notification says why. Your review, comment or push answers it; a click on the tag opens the timeline at the move, ⌥-click lets that round go.',
    pic: () =>
      `<div class="tlink"><span class="tto"><b class="ymove">${ICON.pr}your move</b><span class="tq">#12 · changes asked by alex</span></span></div>`,
  },
  {
    id: 'timeline',
    side: () => (onScreen($('#tv .tvl')) ? 'left' : 'below'),
    at: () => onScreen($('#tv .tvl')) || (state.current && onScreen($('#moreBtn'))) || null,
    title: 'The chat and its PRs, in one order',
    text: () =>
      '<kbd>⌥⌘J</kbd> opens its timeline on a tab: your prompts, each of Claude’s turns as one line, and every PR’s reviews, comments, pushes and CI between them, a lane per PR. The chips at its head narrow it — you, Claude, each PR; ⌥-click one for it alone. A click on a <b>your move</b>, or its notification, lands on that PR’s move.',
    pic: () =>
      onScreen($('#tv .tvl'))
        ? ''
        : `<div class="tmock"><div class="hd"><kbd>⌥⌘J</kbd> › timeline</div><div class="r"><i style="--c: var(--muted)"></i>You · address joel’s two comments</div><div class="r"><i style="--c: var(--accent)"></i>Claude · worked 17m · pushed #482<small>answers joel</small></div><div class="r on"><i style="--c: var(--pr-open)"></i>#482 · mara commented<small>your move</small></div></div>`,
  },
  {
    id: 'bar',
    need: true,
    side: 'above',
    at: () => onScreen($('#sbar')),
    title: 'The machine, at the foot',
    text: () =>
      'Who is asking you and what is watching, on the left; the fish swims faster the more Claude is at work — a click shows every live chat. On the right the Mac’s CPU and memory, your plan’s limits, the cup that keeps the Mac awake while Claude works, and the clock.',
  },
  {
    id: 'keys',
    mid: true,
    title: 'Anything, from the keyboard',
    text: () =>
      '<kbd>⌥⌘L</kbd> finds anything — a chat, a project, a PR, a ticket, an action, a switch. <kbd>⌥⌘A</kbd> shows every live chat at once, <kbd>⌥⌘0</kbd> your day, and <kbd>?</kbd> every key.',
  },
  {
    id: 'bye',
    mid: true,
    title: 'That’s the board',
    text: () =>
      '<kbd>⌘,</kbd> has the settings — the themes, card sizes and where your repos live. The tour is there too, in <kbd>⌥⌘L</kbd> and on home, whenever you want it again.',
  },
];

/** A step's part as it stands: its elements on screen — one, or a few drawn round as one (the chat and its resume bar). */
const tourAt = step => {
  try {
    return [step.at?.()].flat().filter(el => {
      const rect = el?.getBoundingClientRect();

      return rect && rect.width > 0 && rect.height > 0;
    });
  } catch {
    return [];
  }
};

const tourVal = value => (typeof value === 'function' ? value() : value);

function tourStart() {
  for (const dialog of document.querySelectorAll('dialog[open]')) if (dialog.id !== 'tour') dialog.close();
  document.querySelectorAll('.note').forEach(stale => stale.remove()); // a word left from before — the last tour's, say
  const dlg = $('#tour');

  if (inApp) post({ type: 'focus' }); // from the pane's keys, the board needs the keyboard back

  if (!dlg.open) {
    tour.steps = TOUR.filter(step => !step.need || tourAt(step).length);
    tour.done = false;
    tour.drawn = '';
    dlg.classList.add('still');
    dlg.showModal();
    repostPane();
    tour.timer = setInterval(tourPlace, 400);
    addEventListener('resize', tourPlace); // the board goes on under it: a card moved, a chat opened elsewhere
  }

  tourShow(0);
  $('#tour .tcard').getBoundingClientRect();
  dlg.classList.remove('still'); // the first place taken before the glide is on
}

function tourShow(stepIndex) {
  const stepCount = tour.steps.length;

  tour.i = Math.max(0, Math.min(stepCount - 1, stepIndex));

  const step = tour.steps[tour.i];
  const last = tour.i === stepCount - 1;

  tour.els = tourAt(step);

  const el = tour.els[0];
  const list = el?.closest('#slist'); // a card out of the list's sight comes into it — the one thing moved for the tour

  if (list && el !== list) {
    const rect = el.getBoundingClientRect();
    const listRect = list.getBoundingClientRect();

    if (rect.top < listRect.top || rect.bottom > listRect.bottom) el.scrollIntoView({ block: 'nearest' });
  }

  $('#tour .tcard').classList.toggle('mid', !!step.mid);
  const logo = $('#tourLogo');

  logo.hidden = !step.logo;
  if (step.logo && !logo.firstChild) logo.innerHTML = FISH_LOGO();

  $('#tour .tdots').innerHTML = tour.steps
    .map((_, index) => `<i class="${index === tour.i ? 'on' : index < tour.i ? 'past' : ''}"></i>`)
    .join('');

  $('#tourNum').textContent = `${tour.i + 1} of ${stepCount}`;
  $('#tourTitle').textContent = tourVal(step.title);
  $('#tourText').innerHTML = tourVal(step.text);
  $('#tourPic').innerHTML = step.pic ? step.pic() : '';
  $('#tourHow').innerHTML = step.how ? step.how() : '';
  $('#tourBack').hidden = !tour.i;
  $('#tourSkip').hidden = last;
  $('#tourNext').textContent = !tour.i ? 'Show me round' : last ? 'Done' : 'Next';
  $('#tourSay').textContent = `Step ${tour.i + 1} of ${stepCount}: ${$('#tourTitle').textContent}`;
  const tin = $('#tour .tin');

  tin.classList.remove('in');
  void tin.offsetWidth;
  tin.classList.add('in');
  tour.drawn = '';
  tourPlace();
  $('#tourNext').focus({ preventScroll: true });
}

/** The hole round the step's part and the card beside it, on whichever side has the room — the step's own first —,
 *  else inside the part at its foot; a step with none, the card centred. Reads first, then writes, and only what moved. */
function tourPlace() {
  const dlg = $('#tour');

  if (!dlg.open) return;
  const step = tour.steps[tour.i];

  if (!step) return;
  if (step.at) tour.els = tourAt(step); // the board goes on under it: the part found again, wherever it is now

  const card = $('#tour .tcard');
  const WIDTH = innerWidth;
  const HEIGHT = innerHeight;
  const MARGIN = 12;
  const GAP = 14;
  const PADDING = 6;
  const top = (state.notch?.top || 0) + MARGIN;

  const cw = card.offsetWidth;
  const ch = card.offsetHeight;
  const rs = tour.els.map(el => el.getBoundingClientRect());

  const bounds = rs.length
    ? {
        left: Math.min(...rs.map(rect => rect.left)),
        top: Math.min(...rs.map(rect => rect.top)),
        right: Math.max(...rs.map(rect => rect.right)),
        bottom: Math.max(...rs.map(rect => rect.bottom)),
      }
    : null;

  let spot = null;
  let cardLeft = (WIDTH - cw) / 2;
  let cardTop = (HEIGHT - ch) / 2;

  if (bounds && bounds.right > 0 && bounds.left < WIDTH && bounds.bottom > 0 && bounds.top < HEIGHT) {
    // off the window (a card scrolled away since), none
    const left = Math.max(2, bounds.left - PADDING);
    const tp = Math.max(2, bounds.top - PADDING);
    const rt = Math.min(WIDTH - 2, bounds.right + PADDING);
    const bottom = Math.min(HEIGHT - 2, bounds.bottom + PADDING);

    spot = { x: left, y: tp, w: rt - left, h: bottom - tp };

    const room = {
      right: WIDTH - rt - GAP - MARGIN,
      left: left - GAP - MARGIN,
      below: HEIGHT - bottom - GAP - MARGIN,
      above: tp - GAP - top,
    };

    const side = [tourVal(step.side), 'right', 'left', 'below', 'above'].find(
      place => place && room[place] >= (place === 'right' || place === 'left' ? cw : ch),
    );

    const cx = (left + rt - cw) / 2;
    const cy = (tp + bottom - ch) / 2;

    [cardLeft, cardTop] =
      side === 'right'
        ? [rt + GAP, cy]
        : side === 'left'
          ? [left - GAP - cw, cy]
          : side === 'below'
            ? [cx, bottom + GAP]
            : side === 'above'
              ? [cx, tp - GAP - ch]
              : [cx, bottom - ch - 24];
  }

  cardLeft = Math.round(Math.max(MARGIN, Math.min(WIDTH - cw - MARGIN, cardLeft)));
  cardTop = Math.round(Math.max(top, Math.min(HEIGHT - ch - MARGIN, cardTop)));

  const hh = spot
    ? { x: Math.round(spot.x), y: Math.round(spot.y), w: Math.round(spot.w), h: Math.round(spot.h) }
    : { x: Math.round(WIDTH / 2), y: Math.round(HEIGHT / 2), w: 0, h: 0 };

  const key = `${hh.x},${hh.y},${hh.w},${hh.h},${cardLeft},${cardTop}`;

  if (key === tour.drawn) return;
  tour.drawn = key;
  const hole = $('#tour .thole');

  hole.classList.toggle('none', !spot);
  hole.style.translate = `${hh.x}px ${hh.y}px`;
  hole.style.width = `${hh.w}px`;
  hole.style.height = `${hh.h}px`;
  card.style.translate = `${cardLeft}px ${cardTop}px`;
}

$('#tourNext').onclick = () => {
  if (tour.i < tour.steps.length - 1) return tourShow(tour.i + 1);
  tour.done = true;
  $('#tour').close();
};

$('#tourBack').onclick = () => tourShow(tour.i - 1);
$('#tourSkip').onclick = () => $('#tour').close();

$('#tour').addEventListener('keydown', event => {
  if (event.metaKey || event.ctrlKey || event.altKey) return;

  if (event.key === 'ArrowRight' && tour.i < tour.steps.length - 1) {
    event.preventDefault();
    tourShow(tour.i + 1);
  } else if (event.key === 'ArrowLeft' && tour.i) {
    event.preventDefault();
    tourShow(tour.i - 1);
  }
});

// Left before the end — Skip, esc, a key that closes dialogs —, it says where it waits.
$('#tour').addEventListener('close', () => {
  clearInterval(tour.timer);
  tour.timer = 0;
  removeEventListener('resize', tourPlace);
  prefs.toured = true;
  savePrefs();
  $('#tourPic').innerHTML = '';
  news.hold = false; // its pictures borrow the board's own classes (.ymove): none left behind

  if (!tour.done) {
    note(
      onScreen($('#home .hgo[data-go="tour"]')) || $('#shead'),
      'The tour waits in Settings (⌘,), ⌥⌘L and home, whenever you want it',
    );
  }
});

for (const selector of ['#tourBtn', '#ksTour']) $(selector).onclick = tourStart;
$('#ksNews').onclick = () => newsOpen(0);
