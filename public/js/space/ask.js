// ---- a question answered from its node (2026-11-24; Settings › Space › Answer from the node, `prefs.spAnswer`) -------
// The line that asks reaches the transcript only with its answer, so the question is read off the drawer's own screen:
// a read-only xterm per asking chat whose claude runs in a drawer here (mountMini into a hidden host, `sp.minis`, never a
// resize), parsed for Claude Code's select — the question above, numbered answers, a description under each (`spAskOf`,
// `sp.asks`). The node's pill opens the panel (`#spaskp`); a digit or a click is that key on the same socket — the chat's
// own drawer, as ⌥⌘A's tiles type it; an answer that wants words (Type something, tell Claude…) opens the chat after.
// A screen that does not parse is shown as its text, the keys still going. A chat asking elsewhere: a pill saying where.
const SP_ENTER_MS = 120; // between an answer's number and its ⏎: the select takes the one before the other
const SP_OPT = /^(\s*)(?:([❯›>▶])\s*)?(\d{1,2})[.)]\s+(\S.*?)\s*$/,
  SP_HINT = /enter to|esc to|↑\/↓|to navigate|to select|tab to|ctrl\+/i;
const SP_RULE = /^[─━═╌┄╭╮╰╯┌┐└┘-]{4,}$/,
  SP_WORDS = /type something|tell claude|chat about/i;
/** The screen's lines, a row the terminal wrapped joined to the one before; a box's side bars off. */
const spScreen = xt => {
  const b = xt.buffer.active,
    out = [];
  for (let y = 0; y < xt.rows; y++) {
    const line = b.getLine(b.viewportY + y),
      t = (line?.translateToString(true) || '').replace(/^\s*[│┃]\s?/, '').replace(/\s*[│┃]\s*$/, '');
    if (line?.isWrapped && out.length) out[out.length - 1] += t;
    else out.push(t);
  }
  return out;
};
/** Claude Code's question as its screen has it: { q, opts: [{ k, t, d }] }, or null. The last run of answers 1, 2, 3…
 *  down the screen; a description the indented lines under one; the question the lines over the first, two paragraphs
 *  at most, a tab's ☐ header and rules left out. */
function spAskOf(lines) {
  let start = -1;
  for (let y = lines.length - 1; y >= 0; y--) {
    const m = SP_OPT.exec(lines[y]);
    if (m && m[3] === '1') {
      start = y;
      break;
    }
  }
  if (start < 0) return null;
  const opts = [];
  let cur = null;
  for (let y = start; y < lines.length; y++) {
    const l = lines[y],
      m = SP_OPT.exec(l);
    if (m && +m[3] === opts.length + 1) {
      opts.push((cur = { k: +m[3], t: m[4], d: [], on: !!m[2] }));
      continue;
    }
    if (!l.trim()) continue;
    if (SP_HINT.test(l) || SP_RULE.test(l.trim())) break;
    if (cur && /^\s{2,}/.test(l)) cur.d.push(l.trim());
    else break;
  }
  if (opts.length < 2) return null;
  const paras = [[]]; // from the first answer up: a paragraph's lines one sentence, two paragraphs at most
  for (let y = start - 1, n = 0; y >= 0 && n < 10; y--) {
    const l = lines[y].trim();
    if (!l) {
      if (paras[0].length) {
        if (paras.length === 2) break;
        paras.unshift([]);
      }
      continue;
    }
    if (SP_RULE.test(l) || SP_HINT.test(l)) break;
    if (/^[☐☒✔◻■□]/.test(l)) continue;
    paras[0].unshift(l);
    n++;
  }
  const q = paras
    .filter(p => p.length)
    .map(p => p.join(' '))
    .join('\n');
  return { q, opts: opts.map(o => ({ k: o.k, t: o.t, d: o.d.join(' ') })), sel: opts.find(o => o.on)?.k || 0 }; // sel: the ringed one
}
// ⏎ after an answer's number only onto that answer (2026-11-24, review): the same select still up — its question and its
// answers — with the number's answer ringed, read once xterm has parsed what came. The select gone (the number took it),
// or another prompt in its place, gets nothing: a blind ⏎ would take that one's default, Yes. Tried a few times, the
// screen being a round trip behind the key; never sent, the select waits for a hand.
const SP_ENTER_TRIES = 6;
function spEnter(xt, send, ask, k, n = 0) {
  xt.write('', () => {
    const now = spAskOf(spScreen(xt)),
      same =
        !!now &&
        now.q === ask.q &&
        now.opts.length === ask.opts.length &&
        now.opts.every((o, i) => o.t === ask.opts[i].t);
    if (!same) return;
    if (now.sel === k) return send();
    if (n < SP_ENTER_TRIES) setTimeout(() => spEnter(xt, send, ask, k, n + 1), SP_ENTER_MS);
  });
}
function spAskPill(s) {
  if (prefs.spAnswer === false || !asking(s)) return '';
  const t = spDrawer(s);
  if (!t)
    return `<span class="spask off" title="${esc(`It asks in ${entryLabel(s)} — answer it there, or take it over here (⌥⌘C)`)}">? In ${esc(entryLabel(s))}</span>`;
  return `<span class="spask" role="button" tabindex="-1" data-tid="${esc(t.id)}" aria-haspopup="dialog" aria-expanded="false" title="Its question (⏎ on the node)">? <span class="spakn">Answer</span></span>`;
}
// the drawer a question is read from; the harness's stand-in (`window.peixSpDrawer`, by chat) where no drawer can run
const spDrawer = s => drawerOf(s) || window.peixSpDrawer?.[s.id] || null;
const spMiniHost = () =>
  document.getElementById('spminis') ||
  document.body.appendChild(Object.assign(document.createElement('div'), { id: 'spminis', ariaHidden: 'true' }));
/** A hidden xterm for each asking chat in a drawer here; the rest let go. Read every 400 ms while any is up. */
function spMinis(list) {
  if (prefs.space && prefs.spAnswer !== false)
    for (const s of list) {
      const t = asking(s) && spDrawer(s);
      if (t) mountMini(sp.minis, spMiniHost(), t, false);
    }
  sweepMinis(sp.minis);
  if (sp.ask && !sp.minis.has(sp.ask.tid)) spAskClose();
  clearInterval(sp.askT);
  sp.askT = sp.minis.size ? setInterval(spAskRead, 400) : 0;
  spAskRead();
}
function spAskRead() {
  for (const [tid, m] of sp.minis) {
    const lines = spScreen(m.xt);
    sp.asks.set(tid, { lines, ask: spAskOf(lines) });
  }
  for (const tid of [...sp.asks.keys()]) if (!sp.minis.has(tid)) sp.asks.delete(tid);
  for (const p of document.querySelectorAll('#spgrid .spask[data-tid]')) {
    const a = sp.asks.get(p.dataset.tid)?.ask,
      said = a ? `${a.opts.length} answers` : 'Answer';
    const n = p.querySelector('.spakn');
    if (n && n.textContent !== said) n.textContent = said;
    p.setAttribute('aria-expanded', String(sp.ask?.tid === p.dataset.tid));
  }
  if (sp.ask) spAskDraw();
}
function spAskDraw() {
  const el = $('#spaskp'),
    a = sp.ask,
    read = sp.asks.get(a.tid),
    ask = read?.ask;
  const late = !ask && performance.now() - a.at > 1500,
    rows = ask?.opts || [];
  a.n = rows.length;
  const html = ask
    ? (ask.q ? `<p class="spaq">${esc(ask.q)}</p>` : '') +
      rows
        .map(
          (o, i) =>
            `<button type="button" class="spao${a.sent === o.k ? ' sent' : a.sel === i ? ' sel' : ''}" data-k="${o.k}"><span class="k">${o.k}</span><span>${esc(o.t)}${o.d ? `<small>${esc(o.d)}</small>` : ''}</span></button>`,
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
  const el = $('#spaskp'),
    p = sp.ask && document.querySelector(`#spgrid .spask[data-tid="${CSS.escape(sp.ask.tid)}"]`);
  if (!p) return spAskClose();
  const r = p.getBoundingClientRect(),
    w = el.offsetWidth,
    h = el.offsetHeight;
  const left = Math.max(12, Math.min(innerWidth - w - 12, r.left + r.width / 2 - w / 2)),
    below = r.bottom + 6 + h <= innerHeight - 12;
  el.style.left = `${Math.round(left)}px`;
  el.style.top = `${Math.round(below ? r.bottom + 6 : Math.max(12, r.top - 6 - h))}px`;
}
function spAskOpen(id, tid) {
  let el = $('#spaskp');
  if (!el) {
    el = document.body.appendChild(
      Object.assign(document.createElement('div'), { id: 'spaskp', role: 'dialog', tabIndex: -1 }),
    );
    el.setAttribute('aria-label', 'Its question');
    // the keys gone elsewhere — ⌘F, ⌥⌘C, a tab — take it down (2026-11-24, review); its own pill toggles it itself
    el.addEventListener('focusout', e => {
      const to = e.relatedTarget;
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
  for (const p of document.querySelectorAll('#spgrid .spask[aria-expanded="true"]'))
    p.setAttribute('aria-expanded', 'false');
}
/** The answer's key into the chat's drawer; one that wants words opens the chat with the keys in its drawer. */
function spAnswer(k) {
  const a = sp.ask;
  if (!a || a.sent) return;
  const m = sp.minis.get(a.tid),
    ask = sp.asks.get(a.tid)?.ask,
    o = ask?.opts.find(x => x.k === k);
  if (m?.ws.readyState !== 1) return note($('#spaskp'), 'Its drawer is not answering — open the chat', true);
  // the number moves Claude Code's select onto the answer, ⏎ takes it (2026-11-24: the number alone left it waiting) —
  // once the screen shows it there (spEnter); one that wants words gets no ⏎: its box comes up, and the chat opens on it
  const words = o && SP_WORDS.test(o.t),
    id = a.id;
  m.ws.send(JSON.stringify({ t: 'in', d: String(k) }));
  a.sent = k;
  noteMotion(a.id, 'answer');
  spAskDraw();
  if (ask && !words)
    setTimeout(
      () =>
        spEnter(
          m.xt,
          () => {
            if (m.ws.readyState === 1) m.ws.send(JSON.stringify({ t: 'in', d: '\r' }));
          },
          ask,
          k,
        ),
      SP_ENTER_MS,
    );
  setTimeout(
    () => {
      if (sp.ask === a) spAskClose();
      if (words) spAskChat(id);
    },
    REDUCED.matches ? 0 : 450,
  );
}
const spAskChat = id => {
  spAskClose();
  Promise.resolve(id === state.current ? null : openSession(id)).then(() => {
    const s = state.sessions.get(id);
    if (s) {
      showChat(s);
      focusTerm();
    }
  });
};
document.addEventListener(
  'keydown',
  e => {
    // the panel's keys only while it has them: a digit typed into ⌘F's box or a drawer is that box's (2026-11-24, review)
    if (!sp.ask || e.metaKey || e.ctrlKey || e.altKey || !$('#spaskp')?.contains(document.activeElement)) return;
    const a = sp.ask,
      n = a.n || 9;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      return spAskClose();
    }
    if (/^[1-9]$/.test(e.key) && +e.key <= n) {
      e.preventDefault();
      e.stopPropagation();
      return spAnswer(+e.key);
    }
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && a.n) {
      e.preventDefault();
      e.stopPropagation();
      a.sel = (a.sel + (e.key === 'ArrowDown' ? 1 : a.n - 1)) % a.n;
      return spAskDraw();
    }
    if (e.key === 'Enter' && a.n) {
      e.preventDefault();
      e.stopPropagation();
      return spAnswer(a.sel + 1);
    }
  },
  true,
);
document.addEventListener(
  'pointerdown',
  e => {
    if (sp.ask && !e.target.closest?.('#spaskp, .spask[data-tid]')) spAskClose();
  },
  true,
);
addEventListener('resize', () => {
  if (sp.ask) spAskPlace();
});
document.addEventListener('click', e => {
  if (!sp.ask) return;
  const o = e.target.closest?.('#spaskp .spao[data-k]');
  if (o) return spAnswer(+o.dataset.k);
  if (e.target.closest?.('#spaskp .spaty')) spAskChat(sp.ask.id);
});
/** The node's ✓ or ↩, or D: a tick as the card's — only where the card has one (canTick) —, the chat on the right left open. */
function spTick(id, mark) {
  const s = state.sessions.get(id);
  if (!s) return;
  if (s.done) return tickDone(id, false, mark);
  if (canTick(s)) return tickDone(id, true, mark, mark);
  note(
    document.querySelector(`#spgrid .spt[data-id="${CSS.escape(id)}"]`) || $('#space'),
    asking(s) ? 'It is asking you — answer it first' : 'It is at work — tick it once it is idle',
  );
}
/** One agent's lane: its span on the clock (to now while it works), how long, its last step. */
function spLane(r, s, W, now) {
  const st = spSt(r),
    from = Date.parse(r.at),
    end = r.end ? Date.parse(r.end) : now,
    took = end - from,
    kind = spKind(r),
    hue = spHue(kind, r.color);
  const a = Math.max(0, 1 - (now - from) / W),
    b = Math.max(0, 1 - (now - end) / W);
  const bar =
    !Number.isFinite(from) || now - end >= W
      ? ''
      : `<span class="spbar" data-st="${st}" style="left:${(a * 100).toFixed(2)}%;width:${Math.max(0.8, (b - a) * 100).toFixed(2)}%"></span>`;
  const dur = !Number.isFinite(from)
    ? SP_WORD[st]
    : st === 'run'
      ? `at work · ${agDur(now - from)}`
      : st === 'quiet'
        ? `quiet ${agDur(now - Date.parse(r.lastAt))}`
        : st === 'wait'
          ? `waiting · ${agDur(now - from)}`
          : st === 'done'
            ? `done in ${agDur(took)}`
            : st === 'fail'
              ? `failed after ${agDur(took)}`
              : st === 'stop'
                ? `stopped after ${agDur(took)}`
                : SP_WORD[st];
  const open = AG_ID.test(String(r.id)) && r.st !== 'joined';
  return `<div class="splane" data-st="${st}"${open ? ` data-ag="${esc(r.id)}" role="button" tabindex="0"` : ''}>${spAgent(r, kind, hue, s)}<span class="splt"><span class="spla">${esc(r.asked || 'An agent')}</span><span class="spll">${agNow(r, s) || (st === 'joined' ? 'In the team, nothing asked of it yet' : esc(spCap(kind)))}</span></span><span class="sptrack">${bar}<i class="spnow"></i></span><span class="spld">${esc(dur)}</span></div>`;
}
/** The open chat's agents, a strip under the nodes (2026-11-18, v3): folded to its head by `prefs.spLanes`. */
function spSide(s) {
  if (!s) return '';
  const rows = spRows(s),
    st = spState(s),
    mates = rows.filter(r => r.mate).length,
    w = spWin(),
    W = w * 60_000,
    now = Date.now(),
    open = prefs.spLanes !== false;
  const lanes = [...rows]
    .sort((a, b) => (a.at ? Date.parse(a.at) : Infinity) - (b.at ? Date.parse(b.at) : Infinity))
    .map(r => spLane(r, s, W, now))
    .join('');
  const who = !rows.length
    ? 'no agents'
    : mates
      ? `an agent team · ${spCount(mates, 'teammate')}${rows.length > mates ? ` · ${spCount(rows.length - mates, 'agent')}` : ''}`
      : spCount(rows.length, 'agent');
  return (
    `<div class="spsh"><button type="button" class="spfold" aria-expanded="${open}" aria-controls="spls"><svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2 3.5 5 6.5l3-3" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>Agents · ${esc(s.project)}</button>` +
    `<span class="spstate"><span class="spw" data-st="${st}">${SP_ST[st]}</span><span>· ${who}</span></span>` +
    `<span class="spwin" role="group" aria-label="The lanes' span: the last…">${SP_WINS.map(x => `<button type="button" data-w="${x}" aria-pressed="${x === w}">${x === 60 ? '1h' : `${x}m`}</button>`).join('')}</span></div>` +
    (!open
      ? ''
      : `<div class="spls" id="spls">${rows.length ? lanes : `<p class="spnone">${s.alive ? 'No agents in its last round. They show here as they start.' : 'Not running: agents show while its claude runs.'}</p>`}</div>`)
  );
}
/** The chats of the project in view, in the states picked: by state as the list's lanes go, then by the last word. Idle and Done hold back, as a long lane does. */
// Favourites (2026-11-18, v11): a chat starred — its node's ★, or F on its node; the server's `fav` — is a category of
// its own: first, a row of its own, whatever its state, in or out by the ★ chip on top. The state chips count the rest.
const spCat = s => (s.fav ? 'fav' : spState(s));
// Find (2026-11-23; ⌘F with the keys in Space, its box on top): the list's fuzzy match over the chat's fields, its agents'
// types and its folder; while typed, only the matches, best first, from every state — a done one at half its worth, as
// ⌥⌘K's —, the chips counting them. ↑↓ ring one (sp.sel), ⏎ opens it, esc clears, then leaves the box.
const spQuery = () => sp.q.trim().toLowerCase();
