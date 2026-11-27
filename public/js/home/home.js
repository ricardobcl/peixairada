function showHome() {
  if (state.current) return;
  if (!$('#log .home')) $('#log').innerHTML = '<div class="home" id="home"></div>';
  drawHome();
  loadDay();

  if (!home.timer) {
    home.timer = setInterval(() => {
      if (!state.current && $('#home')) loadDay();
      else {
        clearInterval(home.timer);
        home.timer = 0;
      }
    }, 60_000);
  }
}

async function loadDay() {
  if (home.asking) return;
  home.asking = true;

  try {
    home.day = await api('GET', `/api/today?since=${new Date().setHours(0, 0, 0, 0)}`);
  } catch {
  } finally {
    home.asking = false;
  }

  drawHome();
}

const homeSoon = (fetch = false) => {
  if (state.current || !$('#home')) return;
  if (fetch) loadDay();

  if (!home.soon) {
    home.soon = setTimeout(() => {
      home.soon = 0;
      drawHome();
    }, 300);
  }
};

function hotHome() {
  if (state.current) leaveChat();
  else showHome();
  focusBoard();
}

function drawHome() {
  const el = $('#home');

  if (!el || state.current) return;

  const about = state.about || {};
  const all = [...state.sessions.values()].filter(visible);
  const alive = all.filter(session => session.alive);
  const today = home.day;

  const prs = allPrs();
  const open = prs.filter(pr => pr.state === 'open' || pr.state === 'draft');

  const tasks = alive.reduce((total, session) => total + (session.tasks?.length || 0), 0);
  const agents = alive.reduce((total, session) => total + (session.agents || 0), 0);
  const drawers = all.filter(termLive).length;

  const win = usage.data?.windows || [];

  const kv = (label, value) => `<div><b>${label}</b><span>${value}</span></div>`;
  const sep = '<s>·</s>';

  // a count in red or amber only when there is one (2026-10-12): "0 asking you" in red read as an alarm
  const hot = (tag, count, html) => (count ? `<${tag}>${html}</${tag}>` : html);

  // …and a count that has something behind it is a way there (2026-10-12): the chat asking you, the overview, the PRs
  const go = (key, count, html) =>
    count ? `<button class="hgo" data-go="${key}" title="${HOME_GO[key]}">${html}</button>` : html;

  const facts = [
    kv(
      'Board',
      `${esc(state.update?.version || about.version || '?')} ${sep} up ${about.since ? dur(Date.now() - about.since) : '?'}${inApp ? ` ${sep} the app` : ''}`,
    ),
    kv(
      'Chats',
      `${all.filter(session => !session.done).length} ${sep} ${go('ov', alive.length, `${alive.length} live`)} ${sep} ${go('ask', alive.filter(asking).length, hot('em', alive.filter(asking).length, `${alive.filter(asking).length} asking you`))} ${sep} ${go('ov', all.filter(session => bucket(session) === 'working').length, hot('u', all.filter(session => bucket(session) === 'working').length, `${all.filter(session => bucket(session) === 'working').length} clauding`))}`,
    ),
    kv(
      'Agents',
      `${go('ov', agents, `${agents} at work`)} ${sep} ${go('ov', tasks, `${tasks} watching`)} ${sep} ${drawers} in a drawer here`,
    ),
    kv(
      'Today',
      today
        ? `Claude worked <strong>${dur(today.totals.worked)}</strong> ${sep} waited on you ${hot('em', today.totals.waited, dur(today.totals.waited))}`
        : '…',
    ),
    kv(
      'PRs',
      `${open.length} open ${sep} ${go('prs', prs.filter(pr => pr.turn?.you).length, hot('em', prs.filter(pr => pr.turn?.you).length, `${prs.filter(pr => pr.turn?.you).length} at your move`))} ${sep} ${open.filter(pr => pr.checks === 'pending').length} CI running`,
    ),
    win.length
      ? kv(
          'Plan',
          win
            .filter(usageWindow => !usageWindow.grant)
            .slice(0, 4)
            .map(usageWindow => `${esc(uShort(usageWindow))} ${Math.round(usageWindow.percent)}%`)
            .join(` ${sep} `),
        )
      : '',
    kv(
      'Mac',
      `${bar.stats.cpu != null ? `CPU ${bar.stats.cpu}% ${sep} ` : ''}${bar.stats.mem ? `${(bar.stats.mem.used / 2 ** 30).toFixed(1)} / ${Math.round(bar.stats.mem.total / 2 ** 30)} GB ${sep} ` : ''}${state.awake.awake ? 'kept awake' : 'sleeps as set'}`,
    ),
    kv('Theme', esc(skinLabel(wornKey()) + (prefs.skinFollow ? ' · following macOS' : ''))),
  ].filter(Boolean);

  // the day: from the hour of its first span, half an hour before it (2026-10-12; from 8:00 before, which left an
  // evening's work a sliver at the right of a fourteen-hour axis), to the hour after now
  const now = Date.now();
  const mid = new Date().setHours(0, 0, 0, 0);
  const rows = (today?.chats || []).slice(0, 12);

  const first = Math.min(
    now,
    ...rows.flatMap(chat => chat.spans.map(interval => Date.parse(interval.from))).filter(time => time > 0),
  );

  const t0 = Math.max(mid, new Date(first - 1800_000).setMinutes(0, 0, 0));
  const t1 = new Date(now + 3600_000).setMinutes(0, 0, 0);
  const span = t1 - t0 || 1;

  const at = time => `${(((Math.max(t0, Math.min(t1, time)) - t0) / span) * 100).toFixed(2)}%`;
  const hours = [];

  for (let hour = t0; hour <= t1; hour += 3600_000) hours.push(hour);
  const step = Math.ceil(hours.length / 12);

  const day = !today
    ? '<div class="hnone">reading the day…</div>'
    : !rows.length
      ? '<div class="hnone">nothing yet today</div>'
      : `
      <div class="hgrid">
        <span></span><div class="haxis">${hours.map((hour, index) => (index % step ? '' : `<span style="left:${at(hour)}">${new Date(hour).getHours().toString().padStart(2, '0')}:00</span>`)).join('')}</div><span></span>
        ${rows
          .map(
            chat => `<button class="hrow" data-id="${esc(chat.id)}" style="${repoStyle(repoColor(chat.cwd))}" title="${esc(chat.project)} · ${esc(chat.title)} — open it"><b>${projIcon(chat.project)}${esc(chat.project)}</b><span>${ticks(esc(chat.title))}</span></button>
          <div class="htrack" style="${repoStyle(repoColor(chat.cwd))};--step:calc(100% / ${hours.length - 1})">${chat.spans.map(interval => `<i class="${interval.k}${interval.to ? '' : ' now'}" style="left:${at(Date.parse(interval.from))};width:calc(${interval.to ? at(Date.parse(interval.to)) : 'var(--now)'} - ${at(Date.parse(interval.from))})"></i>`).join('')}<span class="hnow" style="left:var(--now)"></span></div>
          <span class="htot">${dur(chat.worked)}${chat.waited ? ` <em>· ${dur(chat.waited)}</em>` : ''}</span>`,
          )
          .join('')}
      </div>
      <div class="hsum"><span><b>${today.totals.questions} question${today.totals.questions === 1 ? '' : 's'}</b> today${today.totals.median != null ? `, answered in <b>${dur(today.totals.median)}</b> on the median` : ''}</span>${today.totals.longest ? `<span>the longest wait: <em>${dur(today.totals.longest.ms)}</em> — ${esc(state.sessions.get(today.totals.longest.id)?.project || 'a chat')} at ${new Date(today.totals.longest.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}${today.totals.longest.open ? ', and still waiting' : ''}</span>` : ''}<span class="r">⌥⌘0 here from anywhere · a row opens its chat</span></div>`;

  // the sea's canvas outlives every draw: the facts and the day are drawn into boxes of their own (2026-10-12)
  if (!el.querySelector('.hsea')) {
    el.innerHTML =
      '<div class="hff"><canvas class="hsea" role="img" aria-label="An ASCII sunset at sea, the board\'s fish leaping in it" title="Click, and the fish leaps"></canvas><div class="hkv"></div></div><div class="hlunch"></div><div class="hday"></div>';
  }

  seaMount(el.querySelector('.hsea'));

  // each line drawn only when it changed, and now the day's --now, never a place in its markup (2026-10-14): the CPU
  // every 3 s, the clock every draw, redrew the links and the rows under a press, which then clicked nothing
  setKids(el.querySelector('.hkv'), [
    `<div class="hh">${esc(about.user || 'you')}<span>@</span>${esc(about.host || 'peixairada')}</div>`,
    '<div class="hrule"></div>',
    ...facts,
    `<div class="hblocks">${['--needs', '--working', '--idle', '--watch', '--accent', '--spend', '--you', '--ink'].map(token => `<i style="background:var(${token})"></i>`).join('')}</div>`,
    `<div class="hkeys"><kbd>⌥⌘L</kbd> anything <s>·</s> <kbd>⌥⌘K</kbd> a chat <s>·</s> <kbd>⌥⌘N</kbd> new <s>·</s> <kbd>⌥⌘A</kbd> overview <s>·</s> <kbd>?</kbd> keys <s>·</s> <button class="hgo" data-go="tour" title="The board’s main parts, one at a time — a couple of minutes">the tour</button></div>`,
  ]);

  setHtml(
    el.querySelector('.hday'),
    `<h3><b>Today</b><span>every chat, ${new Date(t0).getHours().toString().padStart(2, '0')}:00 to now</span><span class="lg"><span><i class="w"></i>clauding</span><span><i class="a"></i>waiting on you</span><span><i class="m"></i>watching</span></span></h3>${day}`,
  );

  el.querySelector('.hgrid')?.style.setProperty('--now', at(now));
  setHtml(el.querySelector('.hlunch'), lunchHomeHtml());
}

const HOME_GO = {
  ask: 'Open the chat asking you',
  ov: 'The overview — every live chat · ⌥⌘A',
  prs: 'The PRs at your move',
};

$('#log').addEventListener('click', event => {
  const row = event.target.closest('#home .hrow');

  if (row) return openSession(row.dataset.id, { locate: true });

  if (event.target.closest('#home .hsea')) {
    if (!sea.leap && sea.s && !REDUCED.matches) seaLeap(performance.now());
    return;
  }

  const go = event.target.closest('#home .hgo')?.dataset.go;

  if (go === 'ask') {
    const session = [...state.sessions.values()].filter(chat => visible(chat) && asking(chat)).sort(byWord)[0];

    if (session) openSession(session.id, { locate: true });
  } else if (go === 'ov') ovOpen();
  else if (go === 'prs') pickOpen('prs');
  else if (go === 'tour') tourStart();
});
