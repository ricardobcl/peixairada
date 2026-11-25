// ---- a chat's agents on its card (2026-11-02, round XX) ----------------------------------------------------------------
// The summary's `agentRows`, a row each: what it was asked, what it does now, its age. Open while they work, three at most
// and then +N; a finished one ticks, then goes into a done row, whose click lists them with their one-line results; a failure
// stays until the chat is opened (seenAt), first in the list, and turns the chip red; the last one ended, a summary stays as
// long. Nothing leaves while the pointer is in the list (agHover). The chip folds a card's rows, remembered per chat
// (prefs.agentCards), and a folded card's live line says who stepped last. Filled after the render, as the live line is:
// the rows and the chip are out of the card's markup, so a step or a count keeps its node and its ring.
const AG_SHOW = 3,
  AG_TICK_MS = 1600,
  AG_QUIET_MS = 3 * 60_000;
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
const agOn = s => !!s.alive && !s.done && (s.agents > 0 || s.agentRows?.length > 0);
const agEven = () => prefs.cards === 'line' || (prefs.cards === 'compact' && !!prefs.cardsEven);
const agUi = id => prefs.agentCards[id] || {};
const agFolded = s => !!agUi(s.id).fold;
const agWhoOn = s => agOn(s) && s.agents > 0 && agFolded(s);
const agDur = ms => {
  const t = Math.max(1, Math.round(ms / 1000));
  return t < 60 ? `${t}s` : t < 3600 ? `${Math.round(t / 60)}m` : `${Math.round(t / 3600)}h`;
};
const agQuiet = r => r.st === 'run' && !!r.lastAt && Date.now() - Date.parse(r.lastAt) > AG_QUIET_MS;
const agTick = new Map(),
  agStates = new Map(),
  agShown = new Map(); // chat:agent → until when it ticks; → the state it had; chat → the rows drawn
let agHover = false;
function agSwitch(id, k) {
  const u = (prefs.agentCards[id] ||= {});
  if (u[k]) delete u[k];
  else u[k] = true;
  if (!Object.keys(u).length) delete prefs.agentCards[id];
  savePrefs();
}
/** A row's state as it stands, once: what moved from at work to ended ticks a moment; a failure is said once. */
function agNote(s) {
  for (const r of s.agentRows || []) {
    const k = `${s.id}:${r.id}`,
      was = agStates.get(k);
    if (was === r.st) continue;
    if (agStates.size > 2000) agStates.clear();
    agStates.set(k, r.st);
    if ((was === 'run' || was === 'wait') && (r.st === 'done' || r.st === 'stop'))
      agTick.set(k, performance.now() + AG_TICK_MS);
    if (was && r.st === 'fail') $('#agSay').textContent = `An agent failed on ${s.title}: ${r.asked || r.name || ''}`;
  }
}
/** What a card shows of its agents, now. */
function agPlan(s, pointer) {
  const rows = s.agentRows || [],
    seen = s.seenAt || '',
    open = s.id === state.current,
    ui = agUi(s.id),
    now = performance.now();
  const round = rows.filter(r => !r.old && r.st !== 'joined'),
    fails = rows.filter(r => r.st === 'fail' && (open || String(r.end || '') > seen));
  const run = round.filter(r => r.st === 'run' || r.st === 'wait'),
    oks = round.filter(r => r.st === 'done' || r.st === 'stop');
  const ticks = oks.filter(r => agTick.get(`${s.id}:${r.id}`) > now),
    over = !run.length && round.length > 0;
  const lastEnd = round.reduce((m, r) => (String(r.end || '') > m ? String(r.end) : m), ''),
    failed = round.filter(r => r.st === 'fail').length;
  const sum =
    over && !ticks.length && (open || lastEnd > seen)
      ? { n: round.length, ms: Date.parse(lastEnd) - Math.min(...round.map(r => Date.parse(r.at))), failed }
      : null;
  let list = [...run, ...ticks, ...fails, ...rows.filter(r => r.st === 'joined')],
    done = over ? 0 : oks.length - ticks.length;
  if (pointer)
    for (const r of oks)
      if (agShown.get(s.id)?.has(r.id) && !list.includes(r)) {
        list.push(r);
        if (done) done--;
      }
  list.sort((a, b) => (b.st === 'fail') - (a.st === 'fail') || String(a.at).localeCompare(String(b.at)));
  let more = 0;
  if (!ui.more && list.length > AG_SHOW) {
    more = list.length - AG_SHOW;
    list = list.slice(0, AG_SHOW);
  }
  const opened = ui.done && (done || sum) ? oks.filter(r => !list.includes(r)) : [],
    folded = agFolded(s);
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
    key: [folded, list.map(r => r.id), more, done > 0, !!sum, opened.length].join('|'),
  };
}
const agAsked = r => (r.name ? `<b>${esc(r.name)}</b> ` : '') + esc(r.asked || (r.name ? '' : 'An agent'));
/** What it is doing, or what it came to. A Bash call's description says it: the word Bash adds nothing. */
function agNow(r, s) {
  if (r.st === 'fail') return esc(r.why || 'It ended on an error');
  if (r.st === 'wait') return 'On its own background work';
  const l = r.last;
  if (!l) return '';
  if (l.kind !== 'tool') return ticks(esc(l.text || ''));
  return (l.name === 'Bash' ? '' : `<b>${esc(toolName(l.name))}</b> `) + esc(pathTail(l.text, s.cwd));
}
function agLabel(r) {
  if (r.st === 'run')
    return agQuiet(r)
      ? `quiet ${agDur(Date.now() - Date.parse(r.lastAt))}`
      : `<span class="vh">at work, </span>${agDur(Date.now() - Date.parse(r.at))}`;
  if (r.st === 'done') return `<span class="vh">done, </span>${agDur(Date.parse(r.end) - Date.parse(r.at))}`; // frozen at how long it took
  return AG_SAID[r.st] || '';
}
// A row under the pointer (2026-11-02): one card, the PR card's place and manner — what it was asked in full, its kind, model
// and worktree, its totals, asked of the server when wanted (a transcript is read only when looked at).
const agInfo = new Map(),
  AG_INFO_MS = 4000;
function agInfoSoon(s, r, a) {
  const k = `${s.id}:${r.id}`,
    had = agInfo.get(k);
  if (had && performance.now() - had.at < AG_INFO_MS) return;
  agInfo.set(k, { at: performance.now(), d: had?.d || null });
  api('GET', `/api/sessions/${s.id}/agents/${encodeURIComponent(r.id)}`)
    .then(d => {
      agInfo.set(k, { at: performance.now(), d });
      if (mxt.a === a) mxtShow();
    })
    .catch(() => {});
  if (agInfo.size > 60) agInfo.delete(agInfo.keys().next().value);
}
const agTok = n => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));
function agCardHtml(r, s) {
  const d = agInfo.get(`${s.id}:${r.id}`)?.d,
    st = agQuiet(r) ? 'quiet' : r.st,
    ended = !!r.end;
  const said =
    st === 'run'
      ? `at work ${agDur(Date.now() - Date.parse(r.at))}`
      : st === 'quiet'
        ? `quiet ${agDur(Date.now() - Date.parse(r.lastAt))}`
        : st === 'done'
          ? `done in ${agDur(Date.parse(r.end) - Date.parse(r.at))}`
          : AG_SAID[st] || '';
  const kv = [
    r.kind && ['Kind', r.kind],
    d?.model && ['Model', d.model],
    r.branch && ['Worktree', r.branch],
    d && [
      ended ? 'In all' : 'So far',
      `${d.tools} tool call${d.tools === 1 ? '' : 's'}${d.tokens ? ` · ${agTok(d.tokens)} tokens` : ''}`,
    ],
  ].filter(Boolean);
  return (
    `<div class="mth"><span class="mtr">${esc(r.name || (r.mate ? 'A teammate' : 'An agent'))}</span><span class="mts" data-state="${esc(st)}">${esc(said)}</span></div>` +
    `<div class="mtt">${esc(r.asked || 'What it was asked is on its way…')}</div>` +
    (r.st === 'fail' && r.why ? `<div class="mtm"><span>${esc(r.why)}</span></div>` : '') +
    (kv.length ? `<dl class="agi">${kv.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>` : '') +
    (d?.prompt && d.prompt !== r.asked ? `<p class="agp">${esc(d.prompt.slice(0, 400))}</p>` : '')
  );
}
/** A row's menu (2026-11-02). Stopping one is asked of Claude, typed into its drawer with ⏎ left to you: the board drives a chat only through Claude. */
function agMenu(s, r, at) {
  const live = r.st === 'run' || r.st === 'wait',
    drawer = !!drawerOf(s);
  return [
    { t: 'Open its transcript', fn: () => agOpen(s, r) },
    r.tree
      ? {
          t: 'Open its worktree',
          sub: r.branch || r.tree,
          fn: () => {
            if (state.current !== s.id) openSession(s.id);
            openEditorAt(s, r.tree, r.branch || null, at);
          },
        }
      : { t: 'Open its worktree', sub: 'it works in the chat\u2019s own folder', off: true },
    {
      t: 'Copy what it was asked',
      fn: async () => {
        let text = r.asked || '';
        try {
          text = (await api('GET', `/api/sessions/${s.id}/agents/${encodeURIComponent(r.id)}`)).prompt || text;
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
            sub: s.alive ? 'its chat runs outside the board, out of its reach' : 'no claude runs on its chat',
            off: true,
          }
        : {
            t: 'Ask Claude to stop it',
            sub: 'typed into the chat\u2019s drawer, ⏎ is yours',
            fn: async () => {
              if (state.current !== s.id) await openSession(s.id);
              showChat(s);
              syncTerm(s);
              const ok = await drawerType(s, `Stop the agent “${r.name || r.asked || r.id}”.`, false);
              if (!ok) note(at, 'Its drawer did not answer', true);
            },
          },
  ];
}
const AG_CARET =
  '<svg class="agcar" viewBox="0 0 10 10" aria-hidden="true"><path d="M2.200 3.700 5 6.500l2.800-2.800"/></svg>';
const agItem = (r, s, thin) => ({
  k: r.id,
  ag: r.id,
  st: agQuiet(r) ? 'quiet' : r.st,
  a: agAsked(r),
  t: agLabel(r),
  n: thin ? '' : agNow(r, s),
});
function agSumItem(p, caret = true) {
  return {
    k: '_sum',
    cls: p.opened.length ? ' open' : '',
    st: p.sum.failed ? 'more' : 'done',
    a: `${p.sum.n} agent${p.sum.n === 1 ? '' : 's'} · ${agDur(p.sum.ms)}${p.sum.failed ? ` · <b class="agbad">${p.sum.failed} failed</b>` : ''}`,
    t: caret ? AG_CARET : '',
    n: '',
  };
}
function agItems(p, s, thin) {
  const out = p.rows.map(r => agItem(r, s, thin));
  if (p.more) out.push({ k: '_more', st: 'more', a: `+${p.more} more`, t: '', n: '' });
  if (p.done)
    out.push({ k: '_done', cls: p.opened.length ? ' open' : '', st: 'done', a: `${p.oks} done`, t: AG_CARET, n: '' });
  if (p.sum) out.push(agSumItem(p));
  for (const r of p.opened) out.push({ ...agItem(r, s, thin), k: `${r.id}_d` });
  return out;
}
document.addEventListener('keydown', e => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('.agr[tabindex]')) {
    e.preventDefault();
    e.target.click();
  }
});
const agRowHtml = it =>
  `<div class="agr${it.cls || ''}" data-k="${esc(it.k)}" data-st="${esc(it.st)}"${it.ag ? ` data-ag="${esc(it.ag)}"` : ''}><i class="agd" aria-hidden="true"></i><span class="aga">${it.a}</span><span class="agt">${it.t}</span><span class="agn">${it.n || ''}</span></div>`;
/** Rows into a box, keyed: a row keeps its node, so a step changes only its words. True when one was made. */
function agDraw(box, items, soft) {
  const had = new Map([...box.children].map(e => [e.dataset.k, e]));
  let at = box.firstElementChild,
    made = false;
  const put = (el, html, ease) => {
    if (el._h === html) return;
    const was = el._h;
    el._h = html;
    el.innerHTML = html;
    if (ease && was && !REDUCED.matches)
      el.animate(
        [
          { opacity: 0.15, transform: 'translateY(3px)' },
          { opacity: 1, transform: 'none' },
        ],
        { duration: 240, easing: EASE_OUT, id: 'agstep' },
      );
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
      if (soft && !REDUCED.matches)
        el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260, easing: 'ease-out', id: 'agrow' });
    }
    had.delete(it.k);
    if (el !== at) box.insertBefore(el, at);
    else at = at.nextElementSibling;
    const cls = 'agr' + (it.cls || '');
    if (el.className !== cls) el.className = cls;
    if (el.dataset.st !== it.st) el.dataset.st = it.st;
    if (it.ag) el.dataset.ag = it.ag;
    put(el.children[1], it.a);
    put(el.children[2], it.t);
    put(el.children[3], it.n, soft);
  }
  for (const e of had.values()) e.remove();
  return made;
}
/** The chip, the lights and the rows of one card, as its plan says. True when a row was made. */
function agPaint(card, s, p, soft) {
  const n = Math.min(5, s.agents || 0),
    lights = n ? String(n) : '';
  if (card.style.getPropertyValue('--lights') !== lights) {
    if (n) card.style.setProperty('--lights', lights);
    else card.style.removeProperty('--lights');
  }
  const chip = card.querySelector('.trow .chip.agents');
  if (chip) {
    const run = Math.max(p.run, s.agents || 0),
      show = run > 0 || (p.fails > 0 && !p.sum),
      some = p.total > p.run,
      html = !show
        ? ''
        : `${some ? `${rn('agd:' + s.id, p.oks)}/${p.total}` : rn('ag:' + s.id, run)} agent${(some ? p.total : run) === 1 ? '' : 's'}${p.fails ? ` · ${p.fails} failed` : ''}${AG_CARET}`;
    if (chip._h !== html) {
      chip._h = html;
      chip.innerHTML = html;
      rollSoon();
    }
    if (chip.hidden === show) chip.hidden = !show;
    chip.classList.toggle('bad', p.fails > 0);
    chip.classList.toggle('on', !p.folded);
    const tip = `Sub-agents at work: the chat stays clauding until they are done, and the card runs a light for each. Click to ${p.folded ? 'show' : 'fold'} them`;
    if (chip.title !== tip) {
      chip.title = tip;
      chip.setAttribute('aria-expanded', String(!p.folded));
    }
  }
  const box = card.querySelector(':scope > .agl');
  if (!box) return false;
  const items = !p.folded ? agItems(p, s) : p.sum ? [agSumItem(p, false)] : [];
  const made = agDraw(box, items, soft);
  box.hidden = !items.length;
  card.classList.toggle('agrows', !!items.length); // one line: the rows, not what the chat itself does (2026-11-03)
  card._agKey = p.key;
  agShown.set(s.id, new Set(p.folded ? [] : p.rows.map(r => r.id)));
  return made;
}
/** A card made anew, before drawCards measures it: as tall as it will be. */
function agFresh(card, s) {
  if (agOn(s)) {
    agNote(s);
    agPaint(card, s, agPlan(s, agHover), false);
  }
}
function fillAgents() {
  const list = $('#slist'),
    work = [];
  for (const card of list.querySelectorAll(':scope > .card')) {
    const s = state.sessions.get(card.dataset.id);
    if (!s || !agOn(s)) continue;
    agNote(s);
    work.push([card, s, agPlan(s, agHover)]);
  }
  // what moves under a card that grew or shrank slides there: every read first, then the writes, then the slides
  const move =
    drawCards.drawn &&
    !REDUCED.matches &&
    !prefs.listHidden &&
    work.some(([c, , p]) => c._agKey !== undefined && c._agKey !== p.key);
  const before = move ? new Map([...list.children].map(e => [e, e.offsetTop])) : null;
  let made = false;
  for (const [c, s, p] of work) if (agPaint(c, s, p, c._agKey !== undefined)) made = true;
  if (before) {
    for (const a of [...sliding]) if (a.id === 'flip') a.cancel();
    const top = list.scrollTop,
      end = top + list.clientHeight,
      slides = [];
    for (const e of list.children) {
      const was = before.get(e),
        at = e.offsetTop;
      if (was == null || at === was || at > end || at + e.offsetHeight < top) continue;
      slides.push([e, was - at]);
    }
    for (const [e, dy] of slides)
      slide(
        e,
        'flip',
        [{ transform: `translateY(${dy}px)` }, { transform: 'none' }],
        { duration: FLIP_MS, easing: EASE_OUT },
        Math.round(dy),
      );
  }
  if (made) phaseAnims();
  // a tick's time up: the row goes into the done row
  clearTimeout(fillAgents.t);
  const soon = Math.min(...[...agTick.values()].filter(t => t > performance.now()));
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
function liveOf(s) {
  const ts = s.alive ? s.tasks || [] : [],
    n = ts.reduce((a, t) => a + (t.events || 0), 0);
  if (agWhoOn(s)) {
    // folded: who stepped last, and what it does (2026-11-02)
    const r = (s.agentRows || [])
      .filter(x => x.st === 'run')
      .sort((a, b) => String(b.lastAt).localeCompare(String(a.lastAt)))[0];
    if (r)
      return {
        html: `<b>${esc(r.name || r.asked || 'An agent')}</b><span>${agNow(r, s)}</span>`,
        n,
        flap: true,
        at: r.id,
      };
  }
  if (s.status === 'working' && s.doing)
    return {
      html: `<b>${esc(toolName(s.doing.name))}</b><span>${esc(pathTail(s.doing.text, s.cwd))}</span>`,
      n,
      flap: true,
      at: s.doing.ts,
    };
  const ev = ts
    .filter(t => t.last)
    .sort((a, b) => String(b.lastEventAt || '').localeCompare(String(a.lastEventAt || '')))[0];
  if (!ev && s.wake)
    return {
      html: `${ICON.wake}<span title="${esc(`Claude set itself to wake at ${hhmm(s.wake.at)}${s.wake.recurring ? ', and again after' : ''}${s.wake.what ? ` — ${s.wake.what}` : ''}`)}"><b>wakes</b> at ${hhmm(s.wake.at)} · <span data-in="${esc(s.wake.at)}"></span>${s.wake.recurring ? ' · again after' : ''}</span>`,
      n,
    };
  return { html: ev ? `${ICON.watch}<span>${esc(ev.last)}</span>` : '', n };
}
function fillLive(root) {
  for (const el of root.querySelectorAll('.card .state.live')) {
    const card = el.closest('.card'),
      id = card.dataset.id,
      s = state.sessions.get(id);
    if (!s) continue;
    const v = liveOf(s),
      was = liveSeen.get(id);
    liveSeen.set(id, v);
    if (el._html === v.html && el._at === (v.at || '')) continue; // properties, not data-*: data-at is fillAges' (an age it writes)
    el._at = v.at || '';
    const moved = was && (was.html !== v.html || (was.at || '') !== (v.at || '')) && !REDUCED.matches;
    if (moved && !el.childElementCount && was.html) el.innerHTML = `<span class="ll">${was.html}</span>`; // a node made anew: from what the old one said
    el._html = v.html;
    if (!moved || !el.childElementCount) {
      el.innerHTML = v.html ? `<span class="ll">${v.html}</span>` : '';
      continue;
    }
    const old = el.lastElementChild,
      nu = html2el(`<span class="ll">${v.html}</span>`);
    el.append(nu);
    // a split-flap's turn for a tool call (the old half falls away, the new one swings down), a roll for an event
    old.animate(
      v.flap
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
      v.flap
        ? [
            { transform: 'translateY(40%) rotateX(-80deg)', opacity: 0 },
            { transform: 'none', opacity: 1 },
          ]
        : [
            { transform: 'translateY(100%)', opacity: 0 },
            { transform: 'none', opacity: 1 },
          ],
      { duration: v.flap ? 260 : 320, easing: v.flap ? EASE_OUT : SPRING, id: 'live' },
    );
    noteMotion(id, v.flap ? 'flap' : 'event');
    if (was && v.n > was.n) {
      // an event: the watching light blips
      noteMotion(id, 'blip');
      const w = getComputedStyle(card).getPropertyValue('--watch').trim(); // the frame's teal, which is not the root's under the dark frame
      card.animate(
        [
          { boxShadow: `0 0 0 0 transparent` },
          { boxShadow: `0 0 0 1px ${w}, 0 0 16px ${w}`, offset: 0.2 },
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
  const s = state.sessions.get(state.current);
  if (s) renderHead(s);
  if (key !== ALL) showList();
  fly?.();
}
// The tab flies (2026-11-04, round XXV): filtered, the open card's tab rises into the cue as the others leave; let go, the
// cue's goes back down to it — it shows once where the filter lives. A stand-in in the cue's colours, moved by transform and
// opacity alone. Its place on a card read through the slide the card has just begun (offsetTop, not the rect).
const FLY_MS = 340;
function tabFlight(key) {
  const on = key !== ALL,
    s = state.sessions.get(state.current),
    list = $('#slist');
  if (
    on === (prefs.project !== ALL) ||
    REDUCED.matches ||
    prefs.listHidden ||
    !s ||
    (on && !inProject(s, projectStub(key)))
  )
    return null;
  const cardTab = () => {
    const c = list.querySelector(':scope > .card.active'),
      t = c?.querySelector('.top .repo');
    if (!t?.getClientRects().length) return null;
    const r = t.getBoundingClientRect(),
      lr = list.getBoundingClientRect(),
      top = lr.top + c.offsetTop - list.scrollTop + (r.top - c.getBoundingClientRect().top);
    return top + r.height > lr.top && top < lr.bottom ? { left: r.left, top, width: r.width, height: r.height } : null;
  };
  if (on) {
    const from = cardTab();
    return (
      from &&
      (() => {
        const t = $('#stitle .t');
        if (t?.getClientRects().length) flyTab(t, from, t.getBoundingClientRect(), true);
      })
    );
  }
  const t = $('#stitle .t');
  if (!t?.getClientRects().length) return null;
  const from = t.getBoundingClientRect(),
    look = flyLook(t);
  return () => {
    const to = cardTab();
    if (to) flyTab(null, from, to, false, look);
  };
}
const flyLook = t => {
  const st = getComputedStyle(t);
  return { name: t.textContent, ground: st.backgroundColor, ink: st.color, corners: st.borderRadius };
};
function flyTab(t, from, to, arriving, look = flyLook(t)) {
  const box = arriving ? to : from,
    far = arriving ? from : to,
    f = document.createElement('div');
  f.className = 'tabfly';
  f.textContent = look.name;
  f.style.cssText = `left:${box.left}px;top:${box.top}px;width:${box.width}px;height:${box.height}px;background:${look.ground};color:${look.ink};border-radius:${look.corners}`;
  document.body.append(f);
  if (t) t.style.visibility = 'hidden';
  const away = `translate(${far.left - box.left}px, ${far.top - box.top}px) scale(${far.width / box.width}, ${far.height / box.height})`,
    here = 'none';
  const a = f.animate(
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
    f.remove();
    if (t) t.style.visibility = '';
  };
  a.addEventListener('finish', end);
  a.addEventListener('cancel', end);
}
// A filter left on says so once (2026-11-04, round XXV): on launch and on coming back from away the cue's tab pulses, motion being
// what the eye catches from the side.
const WAVE_MS = 560;
function cueWave() {
  const t = $('#stitle .t');
  if (prefs.project === ALL || REDUCED.matches || document.hidden || !t?.getClientRects().length) return;
  t.animate([{ scale: 1 }, { scale: 1.09 }, { scale: 1 }], { duration: WAVE_MS, easing: 'ease-in-out' });
  noteMotion('cue', 'wave');
}
// ⌥⌘P with the picker up (2026-11-04, round XXV): on a project, ALL; on ALL, the project last in view, as cd - goes back.
function projectAgain() {
  const back = prefs.project === ALL ? prefs.lastProject : ALL;
  $('#pick').close();
  if (back) selectProject(back);
} // the header's folder name is the toggle's other end
