// ---- lunch: the reminder, and the menus of the places you go (2026-10-18) ------------------------------------------
// The server reads the menus (setup.lunch; its lunch section) and says where the day stands — state.lunch.phase: off,
// before, lunch, snoozed (In 15 min), went (Going), back, over. Here: the sign in the fish's lane (LUNCH; ENJOY once
// you go, and the fish swims off the bar; BACK SOON while the screen is locked; FED · n MIN as it swims back in), the
// day's dishes scrolling through the lane at lunch time, ⌥⌘M's chalkboard (home's too, while the morning's menus
// stand), the alert and its buttons in the app (peixLunch), and Settings › Lunch. Away is the app's lock — the screen
// locked or asleep (peixAway) —, a browser's tab hidden; back from lunch is the first sign of you LUNCH_AWAY_MS on.
const LUNCH_AWAY_MS = 10 * 60_000;

const lunchUi = {
  away: false,
  awayAt: 0,
  awayIn: false,
  fed: null,
  returning: false,
  sign: null,
  tick: null,
  hooked: false,
};

const lunchMain = place =>
  place.dishes.find(dish => !/^(sopa|creme|caldo|entrada|p[aã]o\b)/i.test(dish)) || place.dishes[0];

const lunchTime = time =>
  new Date(time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

const LUNCH_HUES = ['--accent', '--watch', '--working', '--idle', '--you', '--pr-merged', '--tk-doing', '--spend'];
const lunchColor = (place, index) => place.color || `var(${LUNCH_HUES[index % LUNCH_HUES.length]})`;

/** Out to lunch: Going said and no back yet, today — or the screen locked at lunch time. Not while it swims back. */
const lunchOut = () => {
  const lunch = state.lunch;

  return !!lunch?.on && !lunchUi.returning && ((!!lunch.went && !lunch.back) || (lunchUi.away && lunchUi.awayIn));
};

function lunchSignWord() {
  const lunch = state.lunch;

  if (!lunch?.on) return null;
  if (lunchUi.fed) return lunchUi.fed;
  if (lunchOut()) return lunchUi.away ? 'BACK SOON' : 'ENJOY';
  return lunch.phase === 'lunch' ? 'LUNCH' : null;
}

/** The lane as the day has it: the fish in or out, the sign's word, the dishes — each changed only when it changes. */
function lunchBar() {
  const lane = $('#sbSwim');

  if (!lane?.firstChild) return;

  if (!lunchUi.hooked) {
    // the sign and the dishes are the menus', not the overview's the lane opens
    lunchUi.hooked = true;

    lane.addEventListener(
      'click',
      event => {
        if (event.target.closest('.lsign, .ltick')) {
          event.stopPropagation();
          lunchOpen();
        }
      },
      true,
    );
  }

  const lunch = state.lunch;
  const out = lunchOut();

  if (out && !swim.out) swimOff(!document.hidden && !lunchUi.away);
  else if (!out && swim.out && !lunchUi.returning) swimBack(false); // no fanfare: a lock that was short, a lunch over
  const word = lunchSignWord();

  if (word !== lunchUi.sign) {
    lunchSign(lane, word);
    lunchUi.sign = word;
  }

  const have =
    lunch?.on && lunch.phase === 'lunch' && !out ? (lunch.places || []).filter(place => place.dishes.length) : [];

  const key = have
    .map(place => `${place.name}|${lunchMain(place)}|${place.price || ''}|${place.color || ''}`)
    .join('¦');

  if (key !== lunchUi.tick) {
    lunchUi.tick = key;
    lunchTicker(lane, have);
  }
}

function lunchSign(lane, word) {
  let el = lane.querySelector('.lsign:not(.going)');

  if (!word) {
    if (!el) return;
    el.classList.add('going');

    if (REDUCED.matches) el.remove();
    else {
      el.animate([{ transform: 'none' }, { transform: 'translateY(-28px)' }], {
        duration: 380,
        easing: 'ease-in',
        fill: 'forwards',
      }).onfinish = () => el.remove();
    }

    return;
  }

  noteMotion(null, 'lunch:sign', word);

  if (!el) {
    el = document.createElement('button');
    el.type = 'button';
    el.className = 'lsign';
    el.title = 'Lunch — the menus · ⌥⌘M';
    el.innerHTML = '<span class="lswing"><b></b></span>';
    el.querySelector('b').textContent = word;
    lane.append(el);
    if (REDUCED.matches) return;
    el.animate([{ transform: 'translateY(-28px)' }, { transform: 'none' }], { duration: 650, easing: SPRING });

    el.querySelector('.lswing').animate(
      [
        { transform: 'rotate(0)' },
        { transform: 'rotate(9deg)' },
        { transform: 'rotate(-6deg)' },
        { transform: 'rotate(3deg)' },
        { transform: 'rotate(0)' },
      ],
      { duration: 1600, delay: 450, easing: 'ease-out' },
    );

    return;
  }

  const label = el.querySelector('b');

  if (REDUCED.matches) {
    label.textContent = word;
    return;
  }

  label.animate([{ transform: 'none' }, { transform: 'scaleX(0)' }], { duration: 140, easing: 'ease-in' }).onfinish =
    () => {
      label.textContent = word;
      label.animate([{ transform: 'scaleX(0)' }, { transform: 'none' }], { duration: 220, easing: EASE_OUT });
    };
}

function lunchTicker(lane, have) {
  lane.querySelector('.ltick')?.remove();
  if (!have.length) return;

  const items = have
    .map(
      (place, index) =>
        `<span><i style="--c:${lunchColor(place, (state.lunch.places || []).indexOf(place) >= 0 ? state.lunch.places.indexOf(place) : index)}"></i><b>${esc(place.name)}</b>${esc(lunchMain(place))}${place.price ? ` · ${esc(place.price)}` : ''}</span>`,
    )
    .join('');

  const el = document.createElement('span');

  el.className = 'ltick';
  el.title = "Today's dishes — click for the menus · ⌥⌘M";
  el.innerHTML = items + items;
  lane.append(el);
  el.style.setProperty('--dur', `${Math.max(12, el.scrollWidth / 2 / 28).toFixed(1)}s`); // 28 px a second, whatever the words
  noteMotion(null, 'lunch:dishes', have.length);
}

/** Back from lunch: the sign says how long, the fish swims in fed, and the server hears it (every page then knows). */
function lunchFed(from) {
  lunchUi.fed = `FED · ${Math.max(1, Math.round((Date.now() - from) / 60_000))} MIN`;
  lunchUi.returning = true;

  api('POST', '/api/lunch', { act: 'back' }).then(
    lunch => {
      state.lunch = lunch;
    },
    () => {},
  );

  lunchBar();
  setTimeout(() => swimBack(true), 450);

  setTimeout(() => {
    lunchUi.fed = null;
    lunchUi.returning = false;
    lunchBar();
  }, 7000);
}

/** The screen locked, or back: at lunch time, a lock is lunch — the fish goes; back after LUNCH_AWAY_MS, it comes back fed. */
function lunchAway(away) {
  if (away === lunchUi.away) return;
  const lunch = state.lunch;

  if (away) {
    Object.assign(lunchUi, {
      away: true,
      awayAt: Date.now(),
      awayIn: !!lunch?.on && ['lunch', 'snoozed', 'went'].includes(lunch.phase),
    });

    lunchBar();
    return;
  }

  const since = lunchUi.awayAt;
  const at = lunchUi.awayIn;

  Object.assign(lunchUi, { away: false, awayAt: 0, awayIn: false });
  if (
    lunch?.on &&
    ((lunch.went && !lunch.back && Date.now() - lunch.went >= LUNCH_AWAY_MS) ||
      (at && Date.now() - since >= LUNCH_AWAY_MS))
  ) {
    lunchFed(Math.min(lunch.went || Infinity, since || Infinity));
  } else lunchBar();
}

window.peixAway = away => {
  lunchAway(!!away);
  if (away) wentOut();
  else cameBack();
}; // the app's: the screen locked or asleep, the screen saver, the session switched away

document.addEventListener('visibilitychange', () => {
  if (inApp) return;
  lunchAway(document.hidden);
  if (document.hidden) wentOut();
  else cameBack();
});

// Going, and you never locked it: the first move of yours LUNCH_AWAY_MS on is you back
const lunchStir = () => {
  const lunch = state.lunch;

  if (
    lunch?.on &&
    lunch.went &&
    !lunch.back &&
    !lunchUi.away &&
    !lunchUi.returning &&
    Date.now() - lunch.went >= LUNCH_AWAY_MS
  ) {
    lunchFed(lunch.went);
  }
};

document.addEventListener('pointermove', lunchStir, { passive: true });
document.addEventListener('keydown', lunchStir, true);

// ⌥⌘M: the chalkboard
// your browser's: where you are logged in — an https page and nothing else (2026-11-06: the app hands `external` to the system)
const lunchUrl = url => {
  if (!/^https:\/\/[^\s]+$/i.test(url || '')) return;
  if (inApp) post({ type: 'external', url });
  else window.open(url, '_blank', 'noopener');
};

function lunchOpen() {
  const dlg = $('#lunchd');

  if (dlg.open) return;
  if (inApp) post({ type: 'focus' });
  drawLunch(true);
  dlg.showModal();
  repostPane();
  dlg.focus();
}

function lunchToggle() {
  if ($('#lunchd').open) $('#lunchd').close();
  else lunchOpen();
} // a declaration: HOTKEYS names it before this line runs

$('#lunchd').addEventListener('close', () => repostPane());

const fmtDay = dayKey =>
  new Date(`${dayKey}T12:00`).toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' });

/** How a place's menu reached the board, or why there is none — a line under it. */
function lunchWhy(place, lunch) {
  if (place.dishes.length) {
    const when = place.at
      ? dayKeyOf(place.at) === lunch.day
        ? lunchTime(place.at)
        : new Date(place.at).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })
      : '';

    return `${place.month ? "this month's dishes · " : ''}from ${place.src === 'story' ? 'its story' : place.src === 'slack' ? lunch.slack || 'Slack' : 'its post'}${when ? ` · ${when}` : ''}`;
  }

  if (place.state === 'closed') return `closed${place.closed?.to ? ` until ${fmtDay(place.closed.to)}` : ' today'}`;

  if (place.state === 'story') {
    return `its story went up at ${lunchTime(place.storyAt)} — not read here: its name opens it`;
  }

  if (place.state === 'none') return 'nothing online — ask at the table';
  return place.error ? `not read — ${place.error}` : 'not up yet';
}

const dayKeyOf = time => {
  const date = new Date(time);

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

function chalkHtml(lunch, home = false) {
  if (!lunch?.set) {
    return `<div class="chd"><h3 id="lunchTitle">Lunch</h3><p class="chsub">Not set up yet</p></div><div class="chnone">The places you go and when you go, in Settings › Lunch: their menus are read here each morning.<br><button type="button" class="btn" data-lunch="settings">Set it up</button></div>`;
  }

  const sub = !lunch.on
    ? 'switched off'
    : lunch.phase === 'off'
      ? 'no lunch reminder today'
      : lunch.phase === 'before'
        ? `lunch at ${lunch.at}`
        : lunch.phase === 'lunch'
          ? `lunch time · ${lunch.at}`
          : lunch.phase === 'snoozed'
            ? `again at ${lunchTime(lunch.snooze)}`
            : lunch.phase === 'went'
              ? 'enjoy'
              : lunch.phase === 'back'
                ? 'fed'
                : 'lunch is over';

  const place = (venue, index) =>
    `<section class="lp ${venue.state}" style="--c:${lunchColor(venue, index)}"><h4><i></i><button type="button" class="lgo" data-url="${esc(venue.url || '')}"${venue.url ? ` title="${esc(venue.state === 'story' || venue.src === 'story' ? 'Its stories' : 'Its Instagram')} — in your browser"` : ' disabled'}>${esc(venue.name)}</button></h4>${
      venue.dishes.length
        ? `${venue.dishes
            .map(
              (dish, dishIndex) =>
                `<p class="cdish"><span>${esc(dish)}</span><i></i><span class="cprice">${dishIndex === 0 && venue.price ? esc(venue.price) : ''}</span></p>`,
            )
            .join('')}<p class="cfrom">${esc(lunchWhy(venue, lunch))}</p>`
        : `<p class="cwhy">${esc(lunchWhy(venue, lunch))}</p>`
    }</section>`;

  return (
    `<div class="chd"><h3${home ? '' : ' id="lunchTitle"'}>Lunch today</h3><p class="chsub">${esc(fmtDay(lunch.day))} · ${esc(sub)}</p></div>` +
    `<div class="ccols">${lunch.places.map(place).join('') || '<p class="chnone">No places yet — Settings › Lunch.</p>'}</div>${home ? '' : REST_FISH.replace('class="restfish"', 'class="cfish"')}`
  );
}

function lunchFootHtml(lunch) {
  if (!lunch?.set) return '';
  const from = ['Instagram', lunch.slack].filter(Boolean).join(', ');

  const st = lunch.busy
    ? `Reading the menus — ${lunch.busy}…`
    : lunch.readAt
      ? `Read at ${lunchTime(lunch.readAt)}, from ${from}`
      : `Not read yet today — from ${from}`;

  const now = ['before', 'lunch', 'snoozed'].includes(lunch.phase) && lunch.on;

  return (
    `<span class="lstat">${esc(st)}${lunch.error ? ` · <span class="serr">${esc(lunch.error)}</span>` : ''}</span>` +
    `<button type="button" class="btn" data-lunch="read"${lunch.busy ? ' disabled' : ''}>Read again</button>${
      now
        ? `<button type="button" class="btn" data-lunch="snooze"${lunch.phase === 'before' ? ' disabled title="At lunch time"' : ''}>In 15 min</button><button type="button" class="btn go" data-lunch="going">Going</button>`
        : ''
    }${
      state.chat.ready && state.chat.room != null
        ? '<button type="button" class="btn" data-lunch="poll" title="A poll in the chat: who is going, and where">Ask the chat</button>'
        : ''
    }<button type="button" class="btn" data-lunch="settings">Settings…</button><span><kbd>esc</kbd></span>`
  );
}

function drawLunch(force = false) {
  if (!force && !$('#lunchd').open) return;
  setHtml($('#lunchBoard'), chalkHtml(state.lunch));
  setHtml($('#lunchFoot'), lunchFootHtml(state.lunch));
}

async function lunchAct(act, anchor) {
  if (act === 'settings') {
    if ($('#lunchd').open) $('#lunchd').close();
    return settingsAt('lunch', '#lunchOnRow');
  }

  if (act === 'poll') {
    if ($('#lunchd').open) $('#lunchd').close();
    chatOpen();
    return chatPollForm(lunchPoll());
  } // the chat's poll, filled (2026-10-20)

  try {
    state.lunch = await api('POST', '/api/lunch', { act });
    lunchChanged();
  } catch (error) {
    if (anchor) note(anchor, `Not done: ${error.message}`, true);
  }
}

window.peixLunch = act => (act === 'menus' ? lunchOpen() : lunchAct(act)); // the app's notification: Menus · Going · In 15 minutes

// the harness's: the lane's lunch as drawn, and a lock that began `ago` ms back (a lunch can't be waited out in a scenario)
Object.assign(window.peix, {
  lunch: () => ({
    sign: lunchUi.sign,
    out: swim.out,
    away: lunchUi.away,
    dishes: [...document.querySelectorAll('#sbSwim .ltick > span')].length / 2,
  }),
  lunchAway: (away, ago = 0) => {
    lunchAway(away);
    if (away) lunchUi.awayAt = Date.now() - ago;
  },
});

for (const box of [$('#lunchd'), $('#log')]) {
  box.addEventListener('click', event => {
    // the board's own chalk only — the dialog's and the home's (2026-11-06): a transcript in #log is nobody's lunch
    const go = event.target.closest('#lunchd .chalk .lgo, #home .chalk .lgo');

    if (go) return lunchUrl(go.dataset.url);
    const button = event.target.closest('#lunchd [data-lunch], #home .hlunch [data-lunch]');

    if (button) return lunchAct(button.dataset.lunch, button);
    if (event.target === $('#lunchd')) $('#lunchd').close(); // the backdrop
  });
}

/** A lunch alert: in front, a chime; the app's banner carries Menus · Going · In 15 minutes; a browser's opens the board. */
function lunchAlert(alert) {
  if (document.visibilityState === 'visible' && document.hasFocus()) chime('reply');

  if (inApp) {
    post({
      type: 'alert',
      kind: 'lunch',
      heading: alert.heading || 'Lunch',
      project: '',
      title: alert.title || '',
      snippet: alert.snippet || '',
      sessionId: '',
      hash: '',
      serverNotify: !!state.serverNotify,
      quiet: !!alert.quiet,
      drawer: false,
    });
  }

  if (alert.quiet || !('Notification' in window) || Notification.permission !== 'granted') return;

  const notification = new Notification(alert.heading || 'Lunch', {
    body: `${alert.title}\n${alert.snippet || ''}`,
    tag: 'lunch',
  });

  notification.onclick = () => {
    window.focus();
    lunchOpen();
    notification.close();
  };
}

/** Home's chalkboard: the morning's menus, from the first one in until lunch is over. */
function lunchHomeHtml() {
  const lunch = state.lunch;

  if (
    !lunch?.on ||
    !['before', 'lunch', 'snoozed'].includes(lunch.phase) ||
    !lunch.places.some(place => place.state !== 'waiting')
  ) {
    return '';
  }

  return `<div class="chalk">${chalkHtml(lunch, true)}</div>`;
}

/** What the server said changed: the lane, the chalkboard, home, Settings › Lunch. */
function lunchChanged() {
  lunchBar();
  drawLunch();
  homeSoon();
  renderLunchSet();
}

// Settings › Lunch: on, the time and the days; the places; where the menus come from — their posts, a Slack channel —,
// which model reads them, and how the last round went
function lunchSetHtml() {
  const lunch = state.lunch || {};
  const config = state.config.lunch;
  const text = 'type="text" spellcheck="false" autocomplete="off"';

  const group = (title, kw, rows, foot) =>
    `<section class="sgrp" data-kw="${kw}">${title ? `<h6 class="sgh">${title}</h6>` : ''}<div class="slist">${rows}</div>${foot ? `<p class="sgf">${foot}</p>` : ''}</section>`;

  const on = `<div class="srow set" id="lunchOnRow" data-kw="lunch reminder menu food restaurant"><label class="sl" for="lunchOn"><b>Lunch</b><small>A sign in the status bar and a notification at lunch time, and the menus of the places you go — ⌥⌘M</small></label><input type="checkbox" class="sw" role="switch" id="lunchOn"${config?.on ? ' checked' : ''}></div>`;

  if (!config) return group('', 'lunch', on);

  const days = [
    [1, 'Mon'],
    [2, 'Tue'],
    [3, 'Wed'],
    [4, 'Thu'],
    [5, 'Fri'],
    [6, 'Sat'],
    [0, 'Sun'],
  ]
    .map(
      ([day, label]) =>
        `<button type="button" data-day="${day}" aria-pressed="${config.days.includes(day)}">${label}</button>`,
    )
    .join('');

  const place = (venue, index) =>
    `<div class="srow lplace" data-i="${index}"><i class="lsq" style="--c:${lunchColor(venue, index)}"></i><input ${text} class="lname" value="${esc(venue.name)}" aria-label="The place's name"><label class="ligw" title="Its Instagram account — where its menus are read">@<input ${text} class="lig" value="${esc(venue.instagram || '')}" placeholder="its Instagram" aria-label="${esc(venue.name)}'s Instagram account"></label><button type="button" class="sdel" title="Forget ${esc(venue.name)}" aria-label="Forget ${esc(venue.name)}">×</button></div>`;

  const models = [...new Set(['haiku', 'sonnet', config.model || 'haiku'])]
    .map(
      model =>
        `<option value="${esc(model)}"${(config.model || 'haiku') === model ? ' selected' : ''}>${esc(model[0].toUpperCase() + model.slice(1))}</option>`,
    )
    .join('');

  const stat = lunch.busy
    ? `Reading — ${esc(lunch.busy)}…`
    : lunch.readAt
      ? `Read at ${lunchTime(lunch.readAt)} · ${lunch.places?.filter(venue => venue.dishes.length).length || 0} of ${lunch.places?.length || 0} menus in`
      : 'Not read yet today';

  return (
    group(
      '',
      'lunch',
      `${
        on
      }<div class="srow set sub" data-kw="lunch time hour reminder"><label class="sl" for="lunchAt"><b>Lunch time</b><small>The sign and the notification then; the menus are read in the hour and a quarter before</small></label><input type="time" id="lunchAt" value="${esc(config.at)}"></div>` +
        `<div class="srow set sub" data-kw="days weekdays week"><span class="sl" id="slLunchDays"><b>Days</b><small>No reminder, nothing read, on the others</small></span><span class="sseg ldays" role="group" aria-labelledby="slLunchDays">${days}</span></div>`,
    ) +
    group(
      'Places',
      'lunch places restaurants instagram account',
      `${config.places
        .map(place)
        .join(
          '',
        )}<div class="srow lplace add"><i class="lsq">＋</i><input ${text} class="lname" placeholder="A place you go" aria-label="A new place's name"><label class="ligw">@<input ${text} class="lig" placeholder="its Instagram" aria-label="Its Instagram account"></label><span></span></div>`,
      "Each one's menu is read off its Instagram posts, as anyone sees them. Not its stories, which Instagram shows only to someone logged in: the Slack channel below has those.",
    ) +
    group(
      'Where the menus come from',
      'lunch stories slack channel model claude read',
      `<div class="srow set" data-kw="slack channel colleagues screenshots"><label class="sl" for="lunchSlack"><b>Slack channel</b><small>Where colleagues post the menus — read by Claude's Slack connector, nothing written</small></label><input ${text} class="lslack" id="lunchSlack" value="${esc(config.slack || '')}" placeholder="#lunch"></div>` +
        `<div class="srow set" data-kw="model claude reader haiku sonnet"><label class="sl" for="lunchModel"><b>Read by</b><small>The Claude model that reads each picture once, on your plan</small></label><span class="ssel"><select id="lunchModel">${models}</select></span></div>` +
        `<div class="srow set stat" data-kw="read now menus status" id="lunchStatRow"><span class="sl"><b>${stat}</b><small>${lunch.error ? `<span class="serr">${esc(lunch.error)}</span>` : 'Read again any time; on its own each lunch day'}</small></span><button type="button" class="btn" data-lunch="read"${lunch.busy ? ' disabled' : ''}>Read now</button></div>`,
    )
  );
}

function renderLunchSet(force = false) {
  drawSetup($('#lunchSet'), lunchSetHtml(), force);
}

function loadLunchSet() {
  api('GET', '/api/lunch').then(
    lunch => {
      state.lunch = lunch;
      lunchChanged();
    },
    () => {},
  );
}

/** The setup's lunch as it would be with `patch`: the whole of it, as a PUT replaces it. */
const lunchPut = (patch, anchor) =>
  putConfig(
    {
      lunch:
        patch === null
          ? null
          : { ...(state.config.lunch || { at: '12:00', days: [1, 2, 3, 4, 5], places: [] }), ...patch },
    },
    anchor,
  );

const lunchPlacesInBox = () =>
  [...$('#lunchSet').querySelectorAll('.srow.lplace')]
    .map(row => ({
      name: row.querySelector('.lname').value.trim(),
      instagram: row.querySelector('.lig').value.trim(),
      color: state.config.lunch?.places?.[Number(row.dataset.i)]?.color,
    }))
    .filter(place => place.name)
    .map(place => ({
      name: place.name,
      ...(place.instagram && { instagram: place.instagram }),
      ...(place.color && { color: place.color }),
    }));

$('#lunchSet').addEventListener('focusout', event => {
  if ($('#lunchSet')._stale && !$('#lunchSet').contains(event.relatedTarget)) renderLunchSet();
});

$('#lunchSet').addEventListener('keydown', event => {
  if (event.key === 'Enter' && event.target.matches('input[type=text]')) event.target.blur();
});

$('#lunchSet').addEventListener('change', event => {
  const field = event.target;

  if (field.id === 'lunchOn') return lunchPut({ on: field.checked }, field);
  if (field.id === 'lunchAt') return field.value && lunchPut({ at: field.value }, field);
  if (field.id === 'lunchSlack') return lunchPut({ slack: field.value.trim() || null }, field);
  if (field.id === 'lunchModel') return lunchPut({ model: field.value }, field);

  if (field.closest('.srow.lplace')) {
    if (field.closest('.add') && !field.closest('.add').querySelector('.lname').value.trim()) return;
    return lunchPut({ places: lunchPlacesInBox() }, field);
  }
});

$('#lunchSet').addEventListener('click', event => {
  const dayButton = event.target.closest('[data-day]');

  if (dayButton) {
    const days = new Set(state.config.lunch?.days || []);
    const day = Number(dayButton.dataset.day);

    if (days.has(day)) days.delete(day);
    else days.add(day);
    return lunchPut({ days: [...days] }, dayButton);
  }

  const forget = event.target.closest('.srow.lplace .sdel');

  if (forget) {
    forget.closest('.srow').remove();
    return lunchPut({ places: lunchPlacesInBox() }, forget);
  }

  const button = event.target.closest('[data-lunch]');

  if (button) lunchAct(button.dataset.lunch, button);
});
