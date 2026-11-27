// ---- a question answered from its node (2026-11-24; Settings › Space › Answer from the node, `prefs.spAnswer`) -------
// The line that asks reaches the transcript only with its answer, so the question is read off the drawer's own screen:
// a read-only xterm per asking chat whose claude runs in a drawer here (mountMini into a hidden host, `sp.minis`, never a
// resize), parsed for Claude Code's select — the question above, numbered answers, a description under each (`spAskOf`,
// `sp.asks`). The node's pill opens the panel (`#spaskp`); a digit or a click is that key on the same socket — the chat's
// own drawer, as ⌥⌘A's tiles type it; an answer that wants words (Type something, tell Claude…) opens the chat after.
// A screen that does not parse is shown as its text, the keys still going. A chat asking elsewhere: a pill saying where.
const SP_ENTER_MS = 120; // between an answer's number and its ⏎: the select takes the one before the other

const SP_OPT = /^(\s*)(?:([❯›>▶])\s*)?(\d{1,2})[.)]\s+(\S.*?)\s*$/;
const SP_HINT = /enter to|esc to|↑\/↓|to navigate|to select|tab to|ctrl\+/i;

const SP_RULE = /^[─━═╌┄╭╮╰╯┌┐└┘-]{4,}$/;
const SP_WORDS = /type something|tell claude|chat about/i;

/** The screen's lines, a row the terminal wrapped joined to the one before; a box's side bars off. */
const spScreen = xt => {
  const buffer = xt.buffer.active;
  const out = [];

  for (let row = 0; row < xt.rows; row++) {
    const line = buffer.getLine(buffer.viewportY + row);
    const text = (line?.translateToString(true) || '').replace(/^\s*[│┃]\s?/, '').replace(/\s*[│┃]\s*$/, '');

    if (line?.isWrapped && out.length) out[out.length - 1] += text;
    else out.push(text);
  }

  return out;
};

/** Claude Code's question as its screen has it: { q, opts: [{ k, t, d }] }, or null. The last run of answers 1, 2, 3…
 *  down the screen; a description the indented lines under one; the question the lines over the first, two paragraphs
 *  at most, a tab's ☐ header and rules left out. */
function spAskOf(lines) {
  let start = -1;

  for (let row = lines.length - 1; row >= 0; row--) {
    const match = SP_OPT.exec(lines[row]);

    if (match && match[3] === '1') {
      start = row;
      break;
    }
  }

  if (start < 0) return null;
  const opts = [];
  let cur = null;

  for (let row = start; row < lines.length; row++) {
    const line = lines[row];
    const match = SP_OPT.exec(line);

    if (match && +match[3] === opts.length + 1) {
      opts.push((cur = { k: +match[3], t: match[4], d: [], on: !!match[2] }));
      continue;
    }

    if (!line.trim()) continue;
    if (SP_HINT.test(line) || SP_RULE.test(line.trim())) break;
    if (cur && /^\s{2,}/.test(line)) cur.d.push(line.trim());
    else break;
  }

  if (opts.length < 2) return null;
  const paras = [[]]; // from the first answer up: a paragraph's lines one sentence, two paragraphs at most

  for (let row = start - 1, taken = 0; row >= 0 && taken < 10; row--) {
    const line = lines[row].trim();

    if (!line) {
      if (paras[0].length) {
        if (paras.length === 2) break;
        paras.unshift([]);
      }

      continue;
    }

    if (SP_RULE.test(line) || SP_HINT.test(line)) break;
    if (/^[☐☒✔◻■□]/.test(line)) continue;
    paras[0].unshift(line);
    taken++;
  }

  const question = paras
    .filter(paragraph => paragraph.length)
    .map(paragraph => paragraph.join(' '))
    .join('\n');

  return {
    q: question,
    opts: opts.map(option => ({ k: option.k, t: option.t, d: option.d.join(' ') })),
    sel: opts.find(option => option.on)?.k || 0,
  }; // sel: the ringed one
}

// ⏎ after an answer's number only onto that answer (2026-11-24, review): the same select still up — its question and its
// answers — with the number's answer ringed, read once xterm has parsed what came. The select gone (the number took it),
// or another prompt in its place, gets nothing: a blind ⏎ would take that one's default, Yes. Tried a few times, the
// screen being a round trip behind the key; never sent, the select waits for a hand.
const SP_ENTER_TRIES = 6;

function spEnter(xt, send, ask, key, attempt = 0) {
  xt.write('', () => {
    const now = spAskOf(spScreen(xt));

    const same =
      !!now &&
      now.q === ask.q &&
      now.opts.length === ask.opts.length &&
      now.opts.every((option, index) => option.t === ask.opts[index].t);

    if (!same) return;
    if (now.sel === key) return send();
    if (attempt < SP_ENTER_TRIES) setTimeout(() => spEnter(xt, send, ask, key, attempt + 1), SP_ENTER_MS);
  });
}

function spAskPill(session) {
  if (prefs.spAnswer === false || !asking(session)) return '';
  const term = spDrawer(session);

  if (!term) {
    return `<span class="spask off" title="${esc(`It asks in ${entryLabel(session)} — answer it there, or take it over here (⌥⌘C)`)}">? In ${esc(entryLabel(session))}</span>`;
  }

  return `<span class="spask" role="button" tabindex="-1" data-tid="${esc(term.id)}" aria-haspopup="dialog" aria-expanded="false" title="Its question (⏎ on the node)">? <span class="spakn">Answer</span></span>`;
}

// the drawer a question is read from; the harness's stand-in (`window.peixSpDrawer`, by chat) where no drawer can run
const spDrawer = session => drawerOf(session) || window.peixSpDrawer?.[session.id] || null;

const spMiniHost = () =>
  document.getElementById('spminis') ||
  document.body.appendChild(Object.assign(document.createElement('div'), { id: 'spminis', ariaHidden: 'true' }));

/** A hidden xterm for each asking chat in a drawer here; the rest let go. Read every 400 ms while any is up. */
function spMinis(list) {
  if (prefs.space && prefs.spAnswer !== false) {
    for (const session of list) {
      const term = asking(session) && spDrawer(session);

      if (term) mountMini(sp.minis, spMiniHost(), term, false);
    }
  }

  sweepMinis(sp.minis);
  if (sp.ask && !sp.minis.has(sp.ask.tid)) spAskClose();
  clearInterval(sp.askT);
  sp.askT = sp.minis.size ? setInterval(spAskRead, 400) : 0;
  spAskRead();
}

function spAskRead() {
  for (const [tid, mini] of sp.minis) {
    const lines = spScreen(mini.xt);

    sp.asks.set(tid, { lines, ask: spAskOf(lines) });
  }

  for (const tid of [...sp.asks.keys()]) if (!sp.minis.has(tid)) sp.asks.delete(tid);

  for (const pill of document.querySelectorAll('#spgrid .spask[data-tid]')) {
    const ask = sp.asks.get(pill.dataset.tid)?.ask;
    const said = ask ? `${ask.opts.length} answers` : 'Answer';

    const label = pill.querySelector('.spakn');

    if (label && label.textContent !== said) label.textContent = said;
    pill.setAttribute('aria-expanded', String(sp.ask?.tid === pill.dataset.tid));
  }

  if (sp.ask) spAskDraw();
}

function spAskDraw() {
  const el = $('#spaskp');
  const panel = sp.ask;
  const read = sp.asks.get(panel.tid);
  const ask = read?.ask;

  const late = !ask && performance.now() - panel.at > 1500;
  const rows = ask?.opts || [];

  panel.n = rows.length;

  const html = ask
    ? (ask.q ? `<p class="spaq">${esc(ask.q)}</p>` : '') +
      rows
        .map(
          (option, index) =>
            `<button type="button" class="spao${panel.sent === option.k ? ' sent' : panel.sel === index ? ' sel' : ''}" data-k="${option.k}"><span class="k">${option.k}</span><span>${esc(option.t)}${option.d ? `<small>${esc(option.d)}</small>` : ''}</span></button>`,
        )
        .join('')
    : late
      ? `<pre class="spapre">${esc((read?.lines || []).join('\n').replace(/\s+$/, '').split('\n').slice(-16).join('\n'))}</pre>`
      : '<p class="spaq">Reading its screen…</p>';

  const foot = `<div class="spaf"><button type="button" class="spaty">Type an answer…</button><span>${ask ? `<kbd>1–${rows.length}</kbd> answer · ` : late ? '<kbd>1–9</kbd> · ' : ''}<kbd>esc</kbd></span></div>`;
  const had = el.contains(document.activeElement);

  setHtml(el, `<p class="spah">Asking you</p>${html}${foot}`);
  if (had && !el.contains(document.activeElement)) el.focus({ preventScroll: true }); // a redraw keeps the keys in it
  spAskPlace();
}

function spAskPlace() {
  const el = $('#spaskp');
  const pill = sp.ask && document.querySelector(`#spgrid .spask[data-tid="${CSS.escape(sp.ask.tid)}"]`);

  if (!pill) return spAskClose();

  const rect = pill.getBoundingClientRect();
  const width = el.offsetWidth;
  const height = el.offsetHeight;

  const left = Math.max(12, Math.min(innerWidth - width - 12, rect.left + rect.width / 2 - width / 2));
  const below = rect.bottom + 6 + height <= innerHeight - 12;

  el.style.left = `${Math.round(left)}px`;
  el.style.top = `${Math.round(below ? rect.bottom + 6 : Math.max(12, rect.top - 6 - height))}px`;
}

function spAskOpen(id, tid) {
  let el = $('#spaskp');

  if (!el) {
    el = document.body.appendChild(
      Object.assign(document.createElement('div'), { id: 'spaskp', role: 'dialog', tabIndex: -1 }),
    );

    el.setAttribute('aria-label', 'Its question');

    // the keys gone elsewhere — ⌘F, ⌥⌘C, a tab — take it down (2026-11-24, review); its own pill toggles it itself
    el.addEventListener('focusout', event => {
      const to = event.relatedTarget;

      if (sp.ask && to && !el.contains(to) && !to.closest?.('.spask[data-tid]')) spAskClose();
    });
  }

  sp.ask = { id, tid, at: performance.now(), sel: 0, sent: 0, n: 0 };
  el.hidden = false;
  spAskRead();
  el.focus({ preventScroll: true });
}

function spAskClose() {
  if (!sp.ask) return;
  sp.ask = null;
  const el = $('#spaskp');

  if (el) {
    el.hidden = true;
    el._drawn = null;
  }

  for (const pill of document.querySelectorAll('#spgrid .spask[aria-expanded="true"]')) {
    pill.setAttribute('aria-expanded', 'false');
  }
}

/** The answer's key into the chat's drawer; one that wants words opens the chat with the keys in its drawer. */
function spAnswer(key) {
  const panel = sp.ask;

  if (!panel || panel.sent) return;

  const mini = sp.minis.get(panel.tid);
  const ask = sp.asks.get(panel.tid)?.ask;
  const option = ask?.opts.find(candidate => candidate.k === key);

  if (mini?.ws.readyState !== 1) return note($('#spaskp'), 'Its drawer is not answering — open the chat', true);

  // the number moves Claude Code's select onto the answer, ⏎ takes it (2026-11-24: the number alone left it waiting) —
  // once the screen shows it there (spEnter); one that wants words gets no ⏎: its box comes up, and the chat opens on it
  const words = option && SP_WORDS.test(option.t);
  const id = panel.id;

  mini.ws.send(JSON.stringify({ t: 'in', d: String(key) }));
  panel.sent = key;
  noteMotion(panel.id, 'answer');
  spAskDraw();

  if (ask && !words) {
    setTimeout(
      () =>
        spEnter(
          mini.xt,
          () => {
            if (mini.ws.readyState === 1) mini.ws.send(JSON.stringify({ t: 'in', d: '\r' }));
          },
          ask,
          key,
        ),
      SP_ENTER_MS,
    );
  }

  setTimeout(
    () => {
      if (sp.ask === panel) spAskClose();
      if (words) spAskChat(id);
    },
    REDUCED.matches ? 0 : 450,
  );
}

const spAskChat = id => {
  spAskClose();

  Promise.resolve(id === state.current ? null : openSession(id)).then(() => {
    const session = state.sessions.get(id);

    if (session) {
      showChat(session);
      focusTerm();
    }
  });
};

document.addEventListener(
  'keydown',
  event => {
    // the panel's keys only while it has them: a digit typed into ⌘F's box or a drawer is that box's (2026-11-24, review)
    if (!sp.ask || event.metaKey || event.ctrlKey || event.altKey || !$('#spaskp')?.contains(document.activeElement)) {
      return;
    }

    const panel = sp.ask;
    const count = panel.n || 9;

    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      return spAskClose();
    }

    if (/^[1-9]$/.test(event.key) && +event.key <= count) {
      event.preventDefault();
      event.stopPropagation();
      return spAnswer(+event.key);
    }

    if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && panel.n) {
      event.preventDefault();
      event.stopPropagation();
      panel.sel = (panel.sel + (event.key === 'ArrowDown' ? 1 : panel.n - 1)) % panel.n;
      return spAskDraw();
    }

    if (event.key === 'Enter' && panel.n) {
      event.preventDefault();
      event.stopPropagation();
      return spAnswer(panel.sel + 1);
    }
  },
  true,
);

document.addEventListener(
  'pointerdown',
  event => {
    if (sp.ask && !event.target.closest?.('#spaskp, .spask[data-tid]')) spAskClose();
  },
  true,
);

addEventListener('resize', () => {
  if (sp.ask) spAskPlace();
});

document.addEventListener('click', event => {
  if (!sp.ask) return;
  const option = event.target.closest?.('#spaskp .spao[data-k]');

  if (option) return spAnswer(+option.dataset.k);
  if (event.target.closest?.('#spaskp .spaty')) spAskChat(sp.ask.id);
});

/** The node's ✓ or ↩, or D: a tick as the card's — only where the card has one (canTick) —, the chat on the right left open. */
function spTick(id, mark) {
  const session = state.sessions.get(id);

  if (!session) return;
  if (session.done) return tickDone(id, false, mark);
  if (canTick(session)) return tickDone(id, true, mark, mark);

  note(
    document.querySelector(`#spgrid .spt[data-id="${CSS.escape(id)}"]`) || $('#space'),
    asking(session) ? 'It is asking you — answer it first' : 'It is at work — tick it once it is idle',
  );
}

/** One agent's lane: its span on the clock (to now while it works), how long, its last step. */
function spLane(row, session, windowMs, now) {
  const st = spSt(row);
  const from = Date.parse(row.at);
  const end = row.end ? Date.parse(row.end) : now;
  const took = end - from;
  const kind = spKind(row);
  const hue = spHue(kind, row.color);

  const barStart = Math.max(0, 1 - (now - from) / windowMs);
  const barEnd = Math.max(0, 1 - (now - end) / windowMs);

  const bar =
    !Number.isFinite(from) || now - end >= windowMs
      ? ''
      : `<span class="spbar" data-st="${st}" style="left:${(barStart * 100).toFixed(2)}%;width:${Math.max(0.8, (barEnd - barStart) * 100).toFixed(2)}%"></span>`;

  const dur = !Number.isFinite(from)
    ? SP_WORD[st]
    : st === 'run'
      ? `at work · ${agDur(now - from)}`
      : st === 'quiet'
        ? `quiet ${agDur(now - Date.parse(row.lastAt))}`
        : st === 'wait'
          ? `waiting · ${agDur(now - from)}`
          : st === 'done'
            ? `done in ${agDur(took)}`
            : st === 'fail'
              ? `failed after ${agDur(took)}`
              : st === 'stop'
                ? `stopped after ${agDur(took)}`
                : SP_WORD[st];

  const open = AG_ID.test(String(row.id)) && row.st !== 'joined';

  return `<div class="splane" data-st="${st}"${open ? ` data-ag="${esc(row.id)}" role="button" tabindex="0"` : ''}>${spAgent(row, kind, hue, session)}<span class="splt"><span class="spla">${esc(row.asked || 'An agent')}</span><span class="spll">${agNow(row, session) || (st === 'joined' ? 'In the team, nothing asked of it yet' : esc(spCap(kind)))}</span></span><span class="sptrack">${bar}<i class="spnow"></i></span><span class="spld">${esc(dur)}</span></div>`;
}

/** The open chat's agents, a strip under the nodes (2026-11-18, v3): folded to its head by `prefs.spLanes`. */
function spSide(session) {
  if (!session) return '';

  const rows = spRows(session);
  const st = spState(session);
  const mates = rows.filter(row => row.mate).length;
  const minutes = spWin();
  const windowMs = minutes * 60_000;
  const now = Date.now();
  const open = prefs.spLanes !== false;

  const lanes = [...rows]
    .sort((left, right) => (left.at ? Date.parse(left.at) : Infinity) - (right.at ? Date.parse(right.at) : Infinity))
    .map(row => spLane(row, session, windowMs, now))
    .join('');

  const who = !rows.length
    ? 'no agents'
    : mates
      ? `an agent team · ${spCount(mates, 'teammate')}${rows.length > mates ? ` · ${spCount(rows.length - mates, 'agent')}` : ''}`
      : spCount(rows.length, 'agent');

  return (
    `<div class="spsh"><button type="button" class="spfold" aria-expanded="${open}" aria-controls="spls"><svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2 3.5 5 6.5l3-3" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>Agents · ${esc(session.project)}</button>` +
    `<span class="spstate"><span class="spw" data-st="${st}">${SP_ST[st]}</span><span>· ${who}</span></span>` +
    `<span class="spwin" role="group" aria-label="The lanes' span: the last…">${SP_WINS.map(choice => `<button type="button" data-w="${choice}" aria-pressed="${choice === minutes}">${choice === 60 ? '1h' : `${choice}m`}</button>`).join('')}</span></div>${
      !open
        ? ''
        : `<div class="spls" id="spls">${rows.length ? lanes : `<p class="spnone">${session.alive ? 'No agents in its last round. They show here as they start.' : 'Not running: agents show while its claude runs.'}</p>`}</div>`
    }`
  );
}

/** The chats of the project in view, in the states picked: by state as the list's lanes go, then by the last word. Idle and Done hold back, as a long lane does. */
// Favourites (2026-11-18, v11): a chat starred — its node's ★, or F on its node; the server's `fav` — is a category of
// its own: first, a row of its own, whatever its state, in or out by the ★ chip on top. The state chips count the rest.
const spCat = session => (session.fav ? 'fav' : spState(session));
// Find (2026-11-23; ⌘F with the keys in Space, its box on top): the list's fuzzy match over the chat's fields, its agents'
// types and its folder; while typed, only the matches, best first, from every state — a done one at half its worth, as
// ⌥⌘K's —, the chips counting them. ↑↓ ring one (sp.sel), ⏎ opens it, esc clears, then leaves the box.
const spQuery = () => sp.q.trim().toLowerCase();
