// ---- a chat's agents on its card (2026-11-02, round XX) ----------------------------------------------------------------
// The summary's `agentRows`, a row each: what it was asked, what it does now, its age. Open while they work, three at most
// and then +N; a finished one ticks, then goes into a done row, whose click lists them with their one-line results; a failure
// stays until the chat is opened (seenAt), first in the list, and turns the chip red; the last one ended, a summary stays as
// long. Nothing leaves while the pointer is in the list (agHover). The chip folds a card's rows, remembered per chat
// (prefs.agentCards), and a folded card's live line says who stepped last. Filled after the render, as the live line is:
// the rows and the chip are out of the card's markup, so a step or a count keeps its node and its ring.
const AG_SHOW = 3;
const AG_TICK_MS = 1600;
const AG_QUIET_MS = 3 * 60_000;

const AG_ID = /^[\w-]{1,128}$/; // an agent's id, as the server's route takes it

const AG_SAID = {
  run: 'at work',
  wait: 'waiting',
  quiet: 'quiet',
  done: 'done',
  fail: 'failed',
  stop: 'stopped',
  joined: 'joined',
};

const agOn = session => !!session.alive && !session.done && (session.agents > 0 || session.agentRows?.length > 0);
const agEven = () => prefs.cards === 'line' || (prefs.cards === 'compact' && !!prefs.cardsEven);
const agUi = id => prefs.agentCards[id] || {};
const agFolded = session => !!agUi(session.id).fold;
const agWhoOn = session => agOn(session) && session.agents > 0 && agFolded(session);

const agDur = ms => {
  const seconds = Math.max(1, Math.round(ms / 1000));

  return seconds < 60
    ? `${seconds}s`
    : seconds < 3600
      ? `${Math.round(seconds / 60)}m`
      : `${Math.round(seconds / 3600)}h`;
};

const agQuiet = row => row.st === 'run' && !!row.lastAt && Date.now() - Date.parse(row.lastAt) > AG_QUIET_MS;

const agTick = new Map();
const agStates = new Map();
const agShown = new Map(); // chat:agent → until when it ticks; → the state it had; chat → the rows drawn

let agHover = false;

function agSwitch(id, key) {
  const ui = (prefs.agentCards[id] ||= {});

  if (ui[key]) delete ui[key];
  else ui[key] = true;
  if (!Object.keys(ui).length) delete prefs.agentCards[id];
  savePrefs();
}

/** A row's state as it stands, once: what moved from at work to ended ticks a moment; a failure is said once. */
function agNote(session) {
  for (const row of session.agentRows || []) {
    const key = `${session.id}:${row.id}`;
    const was = agStates.get(key);

    if (was === row.st) continue;
    if (agStates.size > 2000) agStates.clear();
    agStates.set(key, row.st);

    if ((was === 'run' || was === 'wait') && (row.st === 'done' || row.st === 'stop')) {
      agTick.set(key, performance.now() + AG_TICK_MS);
    }

    if (was && row.st === 'fail') {
      $('#agSay').textContent = `An agent failed on ${session.title}: ${row.asked || row.name || ''}`;
    }
  }
}

/** What a card shows of its agents, now. */
function agPlan(session, pointer) {
  const rows = session.agentRows || [];
  const seen = session.seenAt || '';
  const open = session.id === state.current;
  const ui = agUi(session.id);
  const now = performance.now();

  const round = rows.filter(row => !row.old && row.st !== 'joined');
  const fails = rows.filter(row => row.st === 'fail' && (open || String(row.end || '') > seen));

  const run = round.filter(row => row.st === 'run' || row.st === 'wait');
  const oks = round.filter(row => row.st === 'done' || row.st === 'stop');

  const ticks = oks.filter(row => agTick.get(`${session.id}:${row.id}`) > now);
  const over = !run.length && round.length > 0;

  const lastEnd = round.reduce((latest, row) => (String(row.end || '') > latest ? String(row.end) : latest), '');
  const failed = round.filter(row => row.st === 'fail').length;

  const sum =
    over && !ticks.length && (open || lastEnd > seen)
      ? { n: round.length, ms: Date.parse(lastEnd) - Math.min(...round.map(row => Date.parse(row.at))), failed }
      : null;

  let list = [...run, ...ticks, ...fails, ...rows.filter(row => row.st === 'joined')];
  let done = over ? 0 : oks.length - ticks.length;

  if (pointer) {
    for (const row of oks) {
      if (agShown.get(session.id)?.has(row.id) && !list.includes(row)) {
        list.push(row);
        if (done) done--;
      }
    }
  }

  list.sort(
    (left, right) => (right.st === 'fail') - (left.st === 'fail') || String(left.at).localeCompare(String(right.at)),
  );

  let more = 0;

  if (!ui.more && list.length > AG_SHOW) {
    more = list.length - AG_SHOW;
    list = list.slice(0, AG_SHOW);
  }

  const opened = ui.done && (done || sum) ? oks.filter(row => !list.includes(row)) : [];
  const folded = agFolded(session);

  return {
    rows: list,
    more,
    done,
    sum,
    opened,
    folded,
    run: run.length,
    total: round.length,
    oks: oks.length,
    fails: fails.length,
    key: [folded, list.map(row => row.id), more, done > 0, !!sum, opened.length].join('|'),
  };
}

const agAsked = row => (row.name ? `<b>${esc(row.name)}</b> ` : '') + esc(row.asked || (row.name ? '' : 'An agent'));

/** What it is doing, or what it came to. A Bash call's description says it: the word Bash adds nothing. */
function agNow(row, session) {
  if (row.st === 'fail') return esc(row.why || 'It ended on an error');
  if (row.st === 'wait') return 'On its own background work';
  const last = row.last;

  if (!last) return '';
  if (last.kind !== 'tool') return ticks(esc(last.text || ''));
  return (last.name === 'Bash' ? '' : `<b>${esc(toolName(last.name))}</b> `) + esc(pathTail(last.text, session.cwd));
}

function agLabel(row) {
  if (row.st === 'run') {
    return agQuiet(row)
      ? `quiet ${agDur(Date.now() - Date.parse(row.lastAt))}`
      : `<span class="vh">at work, </span>${agDur(Date.now() - Date.parse(row.at))}`;
  }

  if (row.st === 'done') return `<span class="vh">done, </span>${agDur(Date.parse(row.end) - Date.parse(row.at))}`; // frozen at how long it took
  return AG_SAID[row.st] || '';
}

// A row under the pointer (2026-11-02): one card, the PR card's place and manner — what it was asked in full, its kind, model
// and worktree, its totals, asked of the server when wanted (a transcript is read only when looked at).
const agInfo = new Map();
const AG_INFO_MS = 4000;

function agInfoSoon(session, row, anchor) {
  const key = `${session.id}:${row.id}`;
  const had = agInfo.get(key);

  if (had && performance.now() - had.at < AG_INFO_MS) return;
  agInfo.set(key, { at: performance.now(), d: had?.d || null });

  api('GET', `/api/sessions/${session.id}/agents/${encodeURIComponent(row.id)}`)
    .then(info => {
      agInfo.set(key, { at: performance.now(), d: info });
      if (mxt.a === anchor) mxtShow();
    })
    .catch(() => {});

  if (agInfo.size > 60) agInfo.delete(agInfo.keys().next().value);
}

const agTok = tokens => (tokens >= 1000 ? `${Math.round(tokens / 1000)}k` : String(tokens));

function agCardHtml(row, session) {
  const info = agInfo.get(`${session.id}:${row.id}`)?.d;
  const st = agQuiet(row) ? 'quiet' : row.st;
  const ended = !!row.end;

  const said =
    st === 'run'
      ? `at work ${agDur(Date.now() - Date.parse(row.at))}`
      : st === 'quiet'
        ? `quiet ${agDur(Date.now() - Date.parse(row.lastAt))}`
        : st === 'done'
          ? `done in ${agDur(Date.parse(row.end) - Date.parse(row.at))}`
          : AG_SAID[st] || '';

  const kv = [
    row.kind && ['Kind', row.kind],
    info?.model && ['Model', info.model],
    row.branch && ['Worktree', row.branch],
    info && [
      ended ? 'In all' : 'So far',
      `${info.tools} tool call${info.tools === 1 ? '' : 's'}${info.tokens ? ` · ${agTok(info.tokens)} tokens` : ''}`,
    ],
  ].filter(Boolean);

  return (
    `<div class="mth"><span class="mtr">${esc(row.name || (row.mate ? 'A teammate' : 'An agent'))}</span><span class="mts" data-state="${esc(st)}">${esc(said)}</span></div>` +
    `<div class="mtt">${esc(row.asked || 'What it was asked is on its way…')}</div>${
      row.st === 'fail' && row.why ? `<div class="mtm"><span>${esc(row.why)}</span></div>` : ''
    }${
      kv.length
        ? `<dl class="agi">${kv.map(([label, value]) => `<dt>${esc(label)}</dt><dd>${esc(value)}</dd>`).join('')}</dl>`
        : ''
    }${info?.prompt && info.prompt !== row.asked ? `<p class="agp">${esc(info.prompt.slice(0, 400))}</p>` : ''}`
  );
}

/** A row's menu (2026-11-02). Stopping one is asked of Claude, typed into its drawer with ⏎ left to you: the board drives a chat only through Claude. */
function agMenu(session, row, at) {
  const live = row.st === 'run' || row.st === 'wait';
  const drawer = !!drawerOf(session);

  return [
    { t: 'Open its transcript', fn: () => agOpen(session, row) },
    row.tree
      ? {
          t: 'Open its worktree',
          sub: row.branch || row.tree,
          fn: () => {
            if (state.current !== session.id) openSession(session.id);
            openEditorAt(session, row.tree, row.branch || null, at);
          },
        }
      : { t: 'Open its worktree', sub: 'it works in the chat\u2019s own folder', off: true },
    {
      t: 'Copy what it was asked',
      fn: async () => {
        let text = row.asked || '';

        try {
          text = (await api('GET', `/api/sessions/${session.id}/agents/${encodeURIComponent(row.id)}`)).prompt || text;
        } catch {}

        const ok = await copyText(text);

        note(at, ok ? 'Copied' : 'Could not copy it', !ok);
      },
    },
    { hr: true },
    !live
      ? { t: 'Ask Claude to stop it', sub: 'it has ended', off: true }
      : !drawer
        ? {
            t: 'Ask Claude to stop it',
            sub: session.alive ? 'its chat runs outside the board, out of its reach' : 'no claude runs on its chat',
            off: true,
          }
        : {
            t: 'Ask Claude to stop it',
            sub: 'typed into the chat\u2019s drawer, ⏎ is yours',
            fn: async () => {
              if (state.current !== session.id) await openSession(session.id);
              showChat(session);
              syncTerm(session);
              const no = await drawerType(session, `Stop the agent “${row.name || row.asked || row.id}”.`, false);

              if (no) note(at, `Not typed: ${no}`, true);
            },
          },
  ];
}

const AG_CARET =
  '<svg class="agcar" viewBox="0 0 10 10" aria-hidden="true"><path d="M2.200 3.700 5 6.500l2.800-2.800"/></svg>';

const agItem = (row, session, thin) => ({
  k: row.id,
  ag: row.id,
  st: agQuiet(row) ? 'quiet' : row.st,
  a: agAsked(row),
  t: agLabel(row),
  n: thin ? '' : agNow(row, session),
});

function agSumItem(plan, caret = true) {
  return {
    k: '_sum',
    cls: plan.opened.length ? ' open' : '',
    st: plan.sum.failed ? 'more' : 'done',
    a: `${plan.sum.n} agent${plan.sum.n === 1 ? '' : 's'} · ${agDur(plan.sum.ms)}${plan.sum.failed ? ` · <b class="agbad">${plan.sum.failed} failed</b>` : ''}`,
    t: caret ? AG_CARET : '',
    n: '',
  };
}

function agItems(plan, session, thin) {
  const out = plan.rows.map(row => agItem(row, session, thin));

  if (plan.more) out.push({ k: '_more', st: 'more', a: `+${plan.more} more`, t: '', n: '' });

  if (plan.done) {
    out.push({
      k: '_done',
      cls: plan.opened.length ? ' open' : '',
      st: 'done',
      a: `${plan.oks} done`,
      t: AG_CARET,
      n: '',
    });
  }

  if (plan.sum) out.push(agSumItem(plan));
  for (const row of plan.opened) out.push({ ...agItem(row, session, thin), k: `${row.id}_d` });
  return out;
}

document.addEventListener('keydown', event => {
  if ((event.key === 'Enter' || event.key === ' ') && event.target.matches?.('.agr[tabindex]')) {
    event.preventDefault();
    event.target.click();
  }
});

const agRowHtml = it =>
  `<div class="agr${it.cls || ''}" data-k="${esc(it.k)}" data-st="${esc(it.st)}"${it.ag ? ` data-ag="${esc(it.ag)}"` : ''}><i class="agd" aria-hidden="true"></i><span class="aga">${it.a}</span><span class="agt">${it.t}</span><span class="agn">${it.n || ''}</span></div>`;

/** Rows into a box, keyed: a row keeps its node, so a step changes only its words. True when one was made. */
function agDraw(box, items, soft) {
  const had = new Map([...box.children].map(child => [child.dataset.k, child]));

  let at = box.firstElementChild;
  let made = false;

  const put = (el, html, ease) => {
    if (el._h === html) return;
    const was = el._h;

    el._h = html;
    el.innerHTML = html;

    if (ease && was && !REDUCED.matches) {
      el.animate(
        [
          { opacity: 0.15, transform: 'translateY(3px)' },
          { opacity: 1, transform: 'none' },
        ],
        { duration: 240, easing: EASE_OUT, id: 'agstep' },
      );
    }
  };

  for (const it of items) {
    let el = had.get(it.k);

    if (!el) {
      el = document.createElement('div');
      el.dataset.k = it.k;
      el.tabIndex = 0;
      el.setAttribute('role', 'button');
      made = true;

      el.innerHTML =
        '<i class="agd" aria-hidden="true"></i><span class="aga"></span><span class="agt"></span><span class="agn"></span>';

      if (soft && !REDUCED.matches) {
        el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260, easing: 'ease-out', id: 'agrow' });
      }
    }

    had.delete(it.k);
    if (el !== at) box.insertBefore(el, at);
    else at = at.nextElementSibling;
    const cls = `agr${it.cls || ''}`;

    if (el.className !== cls) el.className = cls;
    if (el.dataset.st !== it.st) el.dataset.st = it.st;
    if (it.ag) el.dataset.ag = it.ag;
    put(el.children[1], it.a);
    put(el.children[2], it.t);
    put(el.children[3], it.n, soft);
  }

  for (const child of had.values()) child.remove();
  return made;
}

/** The chip, the lights and the rows of one card, as its plan says. True when a row was made. */
function agPaint(card, session, plan, soft) {
  const count = Math.min(5, session.agents || 0);
  const lights = count ? String(count) : '';

  if (card.style.getPropertyValue('--lights') !== lights) {
    if (count) card.style.setProperty('--lights', lights);
    else card.style.removeProperty('--lights');
  }

  const chip = card.querySelector('.trow .chip.agents');

  if (chip) {
    const run = Math.max(plan.run, session.agents || 0);
    const show = run > 0 || (plan.fails > 0 && !plan.sum);
    const some = plan.total > plan.run;

    const html = !show
      ? ''
      : `${some ? `${rn(`agd:${session.id}`, plan.oks)}/${plan.total}` : rn(`ag:${session.id}`, run)} agent${(some ? plan.total : run) === 1 ? '' : 's'}${plan.fails ? ` · ${plan.fails} failed` : ''}${AG_CARET}`;

    if (chip._h !== html) {
      chip._h = html;
      chip.innerHTML = html;
      rollSoon();
    }

    if (chip.hidden === show) chip.hidden = !show;
    chip.classList.toggle('bad', plan.fails > 0);
    chip.classList.toggle('on', !plan.folded);
    const tip = `Sub-agents at work: the chat stays clauding until they are done, and the card runs a light for each. Click to ${plan.folded ? 'show' : 'fold'} them`;

    if (chip.title !== tip) {
      chip.title = tip;
      chip.setAttribute('aria-expanded', String(!plan.folded));
    }
  }

  const box = card.querySelector(':scope > .agl');

  if (!box) return false;
  const items = !plan.folded ? agItems(plan, session) : plan.sum ? [agSumItem(plan, false)] : [];
  const made = agDraw(box, items, soft);

  box.hidden = !items.length;
  card.classList.toggle('agrows', !!items.length); // one line: the rows, not what the chat itself does (2026-11-03)
  card._agKey = plan.key;
  agShown.set(session.id, new Set(plan.folded ? [] : plan.rows.map(row => row.id)));
  return made;
}

/** A card made anew, before drawCards measures it: as tall as it will be. */
function agFresh(card, session) {
  if (agOn(session)) {
    agNote(session);
    agPaint(card, session, agPlan(session, agHover), false);
  }
}

function fillAgents() {
  const list = $('#slist');
  const work = [];

  for (const card of list.querySelectorAll(':scope > .card')) {
    const session = state.sessions.get(card.dataset.id);

    if (!session || !agOn(session)) continue;
    agNote(session);
    work.push([card, session, agPlan(session, agHover)]);
  }

  // what moves under a card that grew or shrank slides there: every read first, then the writes, then the slides
  const move =
    drawCards.drawn &&
    !REDUCED.matches &&
    !prefs.listHidden &&
    work.some(([card, , plan]) => card._agKey !== undefined && card._agKey !== plan.key);

  const before = move ? new Map([...list.children].map(child => [child, child.offsetTop])) : null;
  let made = false;

  for (const [card, session, plan] of work) if (agPaint(card, session, plan, card._agKey !== undefined)) made = true;

  if (before) {
    for (const animation of [...sliding]) if (animation.id === 'flip') animation.cancel();

    const top = list.scrollTop;
    const end = top + list.clientHeight;
    const slides = [];

    for (const child of list.children) {
      const was = before.get(child);
      const at = child.offsetTop;

      if (was == null || at === was || at > end || at + child.offsetHeight < top) continue;
      slides.push([child, was - at]);
    }

    for (const [child, dy] of slides) {
      slide(
        child,
        'flip',
        [{ transform: `translateY(${dy}px)` }, { transform: 'none' }],
        { duration: FLIP_MS, easing: EASE_OUT },
        Math.round(dy),
      );
    }
  }

  if (made) phaseAnims();
  // a tick's time up: the row goes into the done row
  clearTimeout(fillAgents.t);
  const soon = Math.min(...[...agTick.values()].filter(until => until > performance.now()));

  if (Number.isFinite(soon)) fillAgents.t = setTimeout(fillAgents, soon - performance.now() + 20);
  else if (agTick.size) agTick.clear();
}

$('#slist').addEventListener('pointerenter', () => {
  agHover = true;
});

$('#slist').addEventListener('pointerleave', () => {
  agHover = false;
  fillAgents();
});

const liveSeen = new Map(); // chat id → { text, n }: what its line said last, and how many events

function liveOf(session) {
  const ts = session.alive ? session.tasks || [] : [];
  const events = ts.reduce((sum, task) => sum + (task.events || 0), 0);

  if (agWhoOn(session)) {
    // folded: who stepped last, and what it does (2026-11-02)
    const latest = (session.agentRows || [])
      .filter(row => row.st === 'run')
      .sort((left, right) => String(right.lastAt).localeCompare(String(left.lastAt)))[0];

    if (latest) {
      return {
        html: `<b>${esc(latest.name || latest.asked || 'An agent')}</b><span>${agNow(latest, session)}</span>`,
        n: events,
        flap: true,
        at: latest.id,
      };
    }
  }

  if (session.status === 'working' && session.doing) {
    return {
      html: `<b>${esc(toolName(session.doing.name))}</b><span>${esc(pathTail(session.doing.text, session.cwd))}</span>`,
      n: events,
      flap: true,
      at: session.doing.ts,
    };
  }

  const ev = ts
    .filter(task => task.last)
    .sort((left, right) => String(right.lastEventAt || '').localeCompare(String(left.lastEventAt || '')))[0];

  if (!ev && session.wake) {
    return {
      html: `${ICON.wake}<span title="${esc(`Claude set itself to wake at ${hhmm(session.wake.at)}${session.wake.recurring ? ', and again after' : ''}${session.wake.what ? ` — ${session.wake.what}` : ''}`)}"><b>wakes</b> at ${hhmm(session.wake.at)} · <span data-in="${esc(session.wake.at)}"></span>${session.wake.recurring ? ' · again after' : ''}</span>`,
      n: events,
    };
  }

  return { html: ev ? `${ICON.watch}<span>${esc(ev.last)}</span>` : '', n: events };
}

function fillLive(root) {
  for (const el of root.querySelectorAll('.card .state.live')) {
    const card = el.closest('.card');
    const id = card.dataset.id;
    const session = state.sessions.get(id);

    if (!session) continue;

    const line = liveOf(session);
    const was = liveSeen.get(id);

    liveSeen.set(id, line);
    if (el._html === line.html && el._at === (line.at || '')) continue; // properties, not data-*: data-at is fillAges' (an age it writes)
    el._at = line.at || '';
    const moved = was && (was.html !== line.html || (was.at || '') !== (line.at || '')) && !REDUCED.matches;

    if (moved && !el.childElementCount && was.html) el.innerHTML = `<span class="ll">${was.html}</span>`; // a node made anew: from what the old one said
    el._html = line.html;

    if (!moved || !el.childElementCount) {
      el.innerHTML = line.html ? `<span class="ll">${line.html}</span>` : '';
      continue;
    }

    const old = el.lastElementChild;
    const nu = html2el(`<span class="ll">${line.html}</span>`);

    el.append(nu);

    // a split-flap's turn for a tool call (the old half falls away, the new one swings down), a roll for an event
    old.animate(
      line.flap
        ? [
            { transform: 'none', opacity: 1 },
            { transform: 'translateY(-40%) rotateX(80deg)', opacity: 0 },
          ]
        : [
            { transform: 'none', opacity: 1 },
            { transform: 'translateY(-100%)', opacity: 0 },
          ],
      { duration: 220, easing: EASE_OUT, fill: 'forwards', id: 'live' },
    ).onfinish = () => old.remove();

    nu.animate(
      line.flap
        ? [
            { transform: 'translateY(40%) rotateX(-80deg)', opacity: 0 },
            { transform: 'none', opacity: 1 },
          ]
        : [
            { transform: 'translateY(100%)', opacity: 0 },
            { transform: 'none', opacity: 1 },
          ],
      { duration: line.flap ? 260 : 320, easing: line.flap ? EASE_OUT : SPRING, id: 'live' },
    );

    noteMotion(id, line.flap ? 'flap' : 'event');

    if (was && line.n > was.n) {
      // an event: the watching light blips
      noteMotion(id, 'blip');
      const watch = getComputedStyle(card).getPropertyValue('--watch').trim(); // the frame's teal, which is not the root's under the dark frame

      card.animate(
        [
          { boxShadow: `0 0 0 0 transparent` },
          { boxShadow: `0 0 0 1px ${watch}, 0 0 16px ${watch}`, offset: 0.2 },
          { boxShadow: '0 0 0 0 transparent' },
        ],
        { duration: 700, easing: 'ease-out', id: 'blip' },
      );
    }
  }
}

// The project last in view stays known, for ⌥⌘P ⌥⌘P (2026-11-04, round XXV)
function scopeTo(key) {
  if (prefs.project !== ALL && key !== prefs.project) prefs.lastProject = prefs.project;
  prefs.project = key;
  savePrefs();
}

function selectProject(key) {
  const fly = tabFlight(key);

  scopeTo(key);
  renderBoard();
  const session = state.sessions.get(state.current);

  if (session) renderHead(session);
  if (key !== ALL) showList();
  fly?.();
}

// The tab flies (2026-11-04, round XXV): filtered, the open card's tab rises into the cue as the others leave; let go, the
// cue's goes back down to it — it shows once where the filter lives. A stand-in in the cue's colours, moved by transform and
// opacity alone. Its place on a card read through the slide the card has just begun (offsetTop, not the rect).
const FLY_MS = 340;

function tabFlight(key) {
  const on = key !== ALL;
  const session = state.sessions.get(state.current);
  const list = $('#slist');

  if (
    on === (prefs.project !== ALL) ||
    REDUCED.matches ||
    prefs.listHidden ||
    !session ||
    (on && !inProject(session, projectStub(key)))
  ) {
    return null;
  }

  const cardTab = () => {
    const card = list.querySelector(':scope > .card.active');
    const tab = card?.querySelector('.top .repo');

    if (!tab?.getClientRects().length) return null;

    const rect = tab.getBoundingClientRect();
    const lr = list.getBoundingClientRect();
    const top = lr.top + card.offsetTop - list.scrollTop + (rect.top - card.getBoundingClientRect().top);

    return top + rect.height > lr.top && top < lr.bottom
      ? { left: rect.left, top, width: rect.width, height: rect.height }
      : null;
  };

  if (on) {
    const from = cardTab();

    return (
      from &&
      (() => {
        const cue = $('#stitle .t');

        if (cue?.getClientRects().length) flyTab(cue, from, cue.getBoundingClientRect(), true);
      })
    );
  }

  const cueTab = $('#stitle .t');

  if (!cueTab?.getClientRects().length) return null;

  const from = cueTab.getBoundingClientRect();
  const look = flyLook(cueTab);

  return () => {
    const to = cardTab();

    if (to) flyTab(null, from, to, false, look);
  };
}

const flyLook = tab => {
  const st = getComputedStyle(tab);

  return { name: tab.textContent, ground: st.backgroundColor, ink: st.color, corners: st.borderRadius };
};

function flyTab(tab, from, to, arriving, look = flyLook(tab)) {
  const box = arriving ? to : from;
  const far = arriving ? from : to;
  const standIn = document.createElement('div');

  standIn.className = 'tabfly';
  standIn.textContent = look.name;
  standIn.style.cssText = `left:${box.left}px;top:${box.top}px;width:${box.width}px;height:${box.height}px;background:${look.ground};color:${look.ink};border-radius:${look.corners}`;
  document.body.append(standIn);
  if (tab) tab.style.visibility = 'hidden';

  const away = `translate(${far.left - box.left}px, ${far.top - box.top}px) scale(${far.width / box.width}, ${far.height / box.height})`;
  const here = 'none';

  const animation = standIn.animate(
    arriving
      ? [
          { transform: away, opacity: 0.5 },
          { transform: here, opacity: 1 },
        ]
      : [
          { transform: here, opacity: 1 },
          { transform: away, opacity: 0 },
        ],
    { duration: FLY_MS, easing: EASE_OUT },
  );

  noteMotion('cue', arriving ? 'flyup' : 'flyback');

  const end = () => {
    standIn.remove();
    if (tab) tab.style.visibility = '';
  };

  animation.addEventListener('finish', end);
  animation.addEventListener('cancel', end);
}

// A filter left on says so once (2026-11-04, round XXV): on launch and on coming back from away the cue's tab pulses, motion being
// what the eye catches from the side.
const WAVE_MS = 560;

function cueWave() {
  const cueTab = $('#stitle .t');

  if (prefs.project === ALL || REDUCED.matches || document.hidden || !cueTab?.getClientRects().length) return;
  cueTab.animate([{ scale: 1 }, { scale: 1.09 }, { scale: 1 }], { duration: WAVE_MS, easing: 'ease-in-out' });
  noteMotion('cue', 'wave');
}

// ⌥⌘P with the picker up (2026-11-04, round XXV): on a project, ALL; on ALL, the project last in view, as cd - goes back.
function projectAgain() {
  const back = prefs.project === ALL ? prefs.lastProject : ALL;

  $('#pick').close();
  if (back) selectProject(back);
} // the header's folder name is the toggle's other end
