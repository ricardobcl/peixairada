// ---- ⌥⌘X: Space, the board's other layout (2026-11-18) ----------------------------------------------------------------
// The list's and the chat's place, split: Space on the left, the chat itself on the right (v3) — the board's own #chat, so every key,
// tab, drawer and picker is the same (main.space, a grid). Space or the list, never both: ⌥⌘B, the list's button, the
// magnifier or the funnel leave Space for the list; Space hides it, and its own hidden-or-not is kept for after. Space: a node per chat of the
// project in view — its name (60 characters at most, wrapped) and its folder, its edge the chat's state — with a pod
// per agent type docked to it, each agent its type's two letters in its type's colour (the definition's, else one from
// its name), its state a badge on the corner, an arc that turns while it works. Filters by state on top (`prefs.spOff`);
// the open chat's agents as lanes on one clock under the nodes (15 m · 30 m · 1 h, `prefs.spWin`), a lane its agent's tab
// (agOpen). A click on a node opens the chat on the right, its header's × closes it; none open, Space takes the width. Read from the summaries alone,
// drawn with the board (renderBoard → spSoon) and every 5 s for the clock while on (`prefs.space`, the status bar's
// #sbSpace, ⌥⌘X); the divider's place `prefs.spaceAt`.
const sp = {
  raf: 0,
  timer: 0,
  fall: 0,
  visit: 0,
  list: [],
  open: new Map(),
  q: '',
  sel: 0,
  minis: new Map(),
  asks: new Map(),
  ask: null,
  askT: 0,
  lraf: 0,
  over: null,
  toks: [],
  dsel: 0,
  dshut: '',
  chosen: new Set(),
}; // open: a pod's `<chat>:<type>` → its fold timer
const SP_BUSY = ['run', 'wait', 'joined'],
  SP_OPEN_MS = 20_000;
const SP_WINS = [15, 30, 60],
  SP_ORDER = ['run', 'quiet', 'wait', 'fail', 'done', 'stop', 'joined'],
  SP_POD = 6,
  SP_PODS = 4,
  SP_CAP = 30;
const SP_WORD = {
  run: 'running',
  quiet: 'quiet',
  wait: 'waiting',
  fail: 'failed',
  done: 'done',
  stop: 'stopped',
  joined: 'joined',
};
const SP_ST = { ask: 'Asking you', work: 'Clauding', watch: 'Watching', ready: 'Ready', idle: 'Idle', done: 'Done' };
const SP_OF = { asking: 'ask', working: 'work', watching: 'watch', ready: 'ready', idle: 'idle', done: 'done' };
const SP_HUE = { red: 25, orange: 55, yellow: 95, green: 150, cyan: 200, blue: 255, purple: 300, pink: 350 }; // Claude Code's names, as .asdot's
const spWin = () => (SP_WINS.includes(prefs.spWin) ? prefs.spWin : 30);
const spOff = () => (Array.isArray(prefs.spOff) ? prefs.spOff : ['idle', 'done']);
const spSt = r => (agQuiet(r) ? 'quiet' : r.st);
const spState = s => SP_OF[s.done ? 'done' : rankOf(s)] || 'ready';
// every agent the chat has run, not the last round alone (2026-11-18, v9) — nor its claude's alone: a resume's claude starts
// its rows over, its past agents stay in the pods, and a chat with no claude has them too (2026-11-24, `past`)
const spRows = s => (s?.alive ? s.agentAll || s.agentRows || [] : s?.agentAll || []);
const spCount = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const spCut = t => {
  t = String(t || '');
  return t.length > 60 ? t.slice(0, 60).trimEnd() + '…' : t;
};
// an agent by its type, a teammate by the category it was spawned as (the server's mateType) — never "teammate": its name is
// its card's, never Space's (2026-11-18, later; v6); capitalised where it is a word
const spKind = r => r.type || (r.mate ? 'general-purpose' : 'agent');
const spCap = t => String(t).charAt(0).toUpperCase() + String(t).slice(1);
const spHue = (name, color) => SP_HUE[color] ?? [...String(name)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
const spTwo = name => {
  const p = String(name)
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
  return p.length ? (p.length > 1 ? p.map(x => x[0]).join('') : p[0].slice(0, 2)).toUpperCase().slice(0, 2) : '·';
};
const spTally = rows =>
  SP_ORDER.map(k => [k, rows.filter(r => spSt(r) === k).length])
    .filter(([, n]) => n)
    .map(([k, n]) => `${n} ${SP_WORD[k]}`)
    .join(' · ');
const spFolder = s =>
  !s.cwd || s.cwd === state.about?.scratch ? '' : s.cwd.replace(/\/+$/, '').split('/').pop() || '/'; // its last name only (2026-11-18, v7); the whole path its tooltip
/** An agent's mark: its type's letters and colour, its state for a screen reader too. */
const spAgent = (r, kind, hue, s) => {
  const st = spSt(r);
  return `<span class="spa${r.past ? ' past' : ''}" data-st="${st}" data-ag="${esc(r.id)}" data-sid="${esc(s.id)}" style="--h:${hue}" role="img" aria-label="${esc(`${spCap(kind)}${r.mate ? ' teammate' : ''}: ${SP_WORD[st]}${r.past ? ', an earlier run' : ''}`)}">${esc(spTwo(kind))}${['done', 'fail', 'wait', 'stop'].includes(st) ? '<i></i>' : ''}</span>`;
};
/** An agent pointed at in Space (2026-11-18, later): #mxtip's card in Space's words — its type in its colour and letters
 *  ("teammate" when one), its state and time, what it was asked (the first line, the rest under it), what it does now (or
 *  did last, or the error), then what is read when pointed at — model, tool calls and tokens, its worktree. Its name is
 *  here and nowhere else in Space. */
/** A chat's card, its node's title pointed at (2026-11-24): its state and the age of its last word, its folder and
 *  branch, the whole title, then your last word, Claude's, what it does now, its open PRs where their review stands,
 *  its tickets. Read from the summary alone. */
function spChatHtml(s) {
  const st = spState(s),
    at = wordAt(s),
    branch = s.worktree || s.headNow || s.gitBranch || '',
    live = liveOf(s).html;
  const prs = spOpenPrs(s)
    .map(p => `${esc((prRepo(p).split('/')[1] || '') + prNum(p))}${spStageText(p) ? ` ${esc(spStageText(p))}` : ''}`)
    .join(' · ');
  const kv = [
    ['You', s.lastPrompt && esc(s.lastPrompt)],
    ['Claude', s.lastReply && ticks(esc(s.lastReply))],
    ['Now', live],
    ['PRs', prs],
    ['Ticket', (s.tickets || []).map(t => `${esc(t.key)} · ${esc(t.status || '')}`).join(' — ')],
  ].filter(([, v]) => v);
  const ink = {
    ask: '--needs',
    work: '--working-ink',
    watch: '--watch',
    ready: '--idle',
    idle: '--muted',
    done: '--ended',
  }[st];
  return (
    `<div class="spcs" style="--c:var(${ink})"><b>${SP_ST[st]}${at ? ` · <span data-at="${esc(at)}"></span>` : ''}</b><span>${esc(spFolder(s) || 'no folder')}${branch ? ` · <code>${esc(branch)}</code>` : ''}</span></div>` +
    `<div class="mtt">${ticks(esc(s.title || ''))}</div>` +
    (kv.length ? `<dl class="spcc">${kv.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>` : '')
  );
}
function spCardHtml(r, s) {
  const d = agInfo.get(`${s.id}:${r.id}`)?.d,
    st = spSt(r),
    kind = spKind(r),
    hue = spHue(kind, r.color),
    ended = !!r.end;
  const since = t => agDur(Date.now() - Date.parse(t));
  const said =
    st === 'run'
      ? `at work ${since(r.at)}`
      : st === 'quiet'
        ? `quiet ${since(r.lastAt)}`
        : st === 'wait'
          ? `waiting ${since(r.at)}`
          : st === 'done'
            ? `done in ${agDur(Date.parse(r.end) - Date.parse(r.at))}`
            : st === 'stop'
              ? `stopped after ${agDur(Date.parse(r.end) - Date.parse(r.at))}`
              : AG_SAID[st] || '';
  const asked = String(d?.prompt || r.asked || '').trim(),
    nl = asked.indexOf('\n'),
    first = nl < 0 ? asked : asked.slice(0, nl),
    rest = nl < 0 ? '' : asked.slice(nl + 1).trim();
  const now =
    st === 'fail'
      ? ['Error', `<span class="spce">${esc(r.why || 'It ended on an error')}</span>`]
      : st === 'joined'
        ? null
        : [ended ? 'Last' : 'Now', agNow(r, s)];
  const reading = '<span class="spcr">reading…</span>',
    tree = r.branch || r.tree;
  const kv = [
    ['Model', d ? esc(d.model || '—') : reading],
    [
      ended ? 'In all' : 'So far',
      d
        ? d.tools || d.tokens
          ? esc(`${d.tools} tool call${d.tools === 1 ? '' : 's'}${d.tokens ? ` · ${agTok(d.tokens)} tokens` : ''}`)
          : 'nothing yet'
        : reading,
    ],
    tree && ['Worktree', esc(tree)],
  ].filter(Boolean);
  return (
    `<div class="mth spch" style="--h:${hue}"><span class="spct">${esc(spTwo(kind))}</span><b class="spck">${esc(spCap(kind))}</b>${r.mate ? '<span class="spcm">teammate</span>' : ''}<span class="mts" data-state="${esc(st)}">${esc(said)}</span></div>` +
    (r.name && r.name !== kind ? `<div class="spcn">${esc(r.name)}</div>` : '') +
    `<div class="mtt">${first ? esc(first) : '<i>What it was asked is on its way…</i>'}</div>` +
    (rest ? `<p class="agp spcp">${esc(rest.slice(0, 400))}</p>` : '') +
    (now?.[1] ? `<dl class="agi spcw"><dt>${now[0]}</dt><dd>${now[1]}</dd></dl>` : '') +
    `<dl class="agi spcv">${kv.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>`
  );
}
// a node's box in its tile (#space's --spw × --sph, .spbox's place): its centre and half sizes, a pod's thickness, a wire's length (2026-11-18, v9)
const SP_GEO = { cx: 152, cy: 108, hw: 80, hh: 50, pt: 34, w: 8 },
  SP_TILE = [304, 216];
/** A chat's agents by type, the most first, each docked to its node on a side of its own: top, bottom, right, left. */
function spPods(s) {
  const groups = [];
  for (const r of spRows(s)) {
    if (prefs.spBusy && !SP_BUSY.includes(r.st)) continue;
    const k = spKind(r);
    let g = groups.find(x => x.k === k);
    if (!g) groups.push((g = { k, rows: [], color: r.color }));
    g.rows.push(r);
    g.color ||= r.color;
  }
  groups.sort((a, b) => b.rows.length - a.rows.length);
  const shown = groups.slice(0, SP_PODS),
    left = groups.slice(SP_PODS).reduce((n, g) => n + g.rows.length, 0);
  return shown
    .map((g, i) => {
      // folded, a pod is its agents at work, else its newest; +N the rest, opened for SP_OPEN_MS (2026-11-18, v10)
      const busy = g.rows.filter(r => SP_BUSY.includes(r.st)),
        last = g.rows.reduce((a, r) => ((r.lastAt || r.at || 0) > (a.lastAt || a.at || 0) ? r : a), g.rows[0]);
      const key = `${s.id}:${g.k}`,
        base = busy.length ? busy : [last],
        hid = g.rows.length - base.length,
        open = hid > 0 && sp.open.has(key),
        all = open ? g.rows : base;
      const hue = spHue(g.k, g.color),
        more = all.length > SP_POD ? all.length - (SP_POD - 1) : 0,
        rows = more ? all.slice(0, SP_POD - 1) : all;
      const tog =
        hid > 0
          ? `<span class="spx" role="button" tabindex="-1" data-pod="${esc(g.k)}" aria-expanded="${open}" aria-label="${open ? `Fold ${esc(spCap(g.k))}` : `${hid} more ${esc(spCap(g.k))}, done or idle`}">${open ? '−' : `+${hid}`}</span>`
          : '';
      // top and bottom a row, the sides a column: x, y, width, height of the pod; of its wire; where its label is
      const n = rows.length + (more ? 1 : 0) + (tog ? 1 : 0),
        len = n * 26 + (n - 1) * 5 + 12,
        side = ['top', 'bottom', 'right', 'left'][i];
      const { cx, cy, hw, hh, pt, w } = SP_GEO,
        top = cy - hh - w - pt,
        bot = cy + hh + w,
        lft = cx - hw - w - pt,
        rgt = cx + hw + w;
      const at = {
        top: [cx - len / 2, top, len, pt, cx - 1, cy - hh - w, 2, w, cx, top - 14],
        bottom: [cx - len / 2, bot, len, pt, cx - 1, cy + hh, 2, w, cx, bot + pt + 2],
        right: [rgt, cy - len / 2, pt, len, cx + hw, cy - 1, w, 2, rgt + pt / 2, cy + len / 2 + 3],
        left: [lft, cy - len / 2, pt, len, lft + pt, cy - 1, w, 2, lft + pt / 2, cy + len / 2 + 3],
      }[side];
      const label = `${spCap(g.k)}${i === SP_PODS - 1 && left ? ` · +${left} more` : ''}`;
      return (
        `<span class="spwire" style="--h:${hue};left:${at[4]}px;top:${at[5]}px;width:${at[6]}px;height:${at[7]}px"></span>` +
        `<span class="sppod${side === 'right' || side === 'left' ? ' col' : ''}" style="--h:${hue};left:${at[0]}px;top:${at[1]}px;width:${at[2]}px;height:${at[3]}px">${rows.map(r => spAgent(r, g.k, hue, s)).join('')}${more ? `<span class="spmore">+${more}</span>` : ''}${tog}</span>` +
        `<span class="spl" style="--h:${hue};left:${at[8]}px;top:${at[9]}px">${esc(label)}</span>`
      );
    })
    .join('');
}
// The node's ✓ (2026-11-23): the card's tick — tickDone, a watching chat's armed first (tickGate) —, D on its node; a done
// chat's ↩ back to its lane. Its PRs still open or in draft, a pill on the box's edge: amber when one is at your move, a red
// dot when one's CI fails; pointed at, their list, a row its PR on a tab beside the chat (spPrRow).
const SP_TICK = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.6 8.3 6.6 11.2 12.4 4.9"/></svg>';
const SP_BACK =
  '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 4 3 7l3 3M3 7h6.5a3.5 3.5 0 0 1 0 7H8"/></svg>';
const SP_PR =
  '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="4" cy="3.5" r="1.6"/><circle cx="4" cy="12.5" r="1.6"/><circle cx="12" cy="12.5" r="1.6"/><path d="M4 5.1v5.8M12 10.9V7a2.5 2.5 0 0 0-2.5-2.5H7.5M9 3 7.5 4.5 9 6"/></svg>';
const SP_CK = { pass: '✓', fail: '✕', pending: '◌' };
// where its review stands (2026-11-23; the server's pr.review): changes asked for, threads left open, approved, or a review
// still awaited — one word, the open threads beside a decision
const SP_STAGE = {
  changes: ['changes requested', 'chg'],
  approved: ['approved', 'ok'],
  required: ['awaiting review', 'wait'],
};
const spStageText = pr => {
  const r = pr.review;
  if (!r || pr.state === 'draft') return '';
  const d = r.decision === 'required' || (!r.decision && r.asked) ? 'required' : r.decision;
  return [SP_STAGE[d] && !(d === 'required' && r.open) ? SP_STAGE[d][0] : '', r.open ? `${r.open} unresolved` : '']
    .filter(Boolean)
    .join(', ');
};
function spStage(pr) {
  const r = pr.review;
  if (!r || pr.state === 'draft') return '';
  const d = r.decision === 'required' || (!r.decision && r.asked) ? 'required' : r.decision,
    w = SP_STAGE[d];
  const open = r.open ? `<span class="rv" data-rv="open">${r.open} unresolved</span>` : '';
  return (w && !(d === 'required' && r.open) ? `<span class="rv" data-rv="${w[1]}">${w[0]}</span>` : '') + open;
}
const spOpenPrs = s => (s.prs || []).filter(p => p.state === 'open' || p.state === 'draft');
const spPrRow = pr =>
  `<span class="spprr" role="link" data-url="${esc(pr.url)}" data-state="${esc(pr.state)}" title="${esc(`${pr.title || ''}\nOpens on a tab beside the chat`)}"><i class="sq"></i>` +
  `<span class="no">${esc((prRepo(pr).split('/')[1] || '') + prNum(pr))}</span><span class="ti">${esc(pr.title ? (pr.title.length > 72 ? pr.title.slice(0, 72).trimEnd() + '…' : pr.title) : 'its title on its way…')}</span>` +
  `<span class="tg">${spStage(pr)}${pr.turn?.you ? '<span class="ym">your move</span>' : ''}${prCk(pr) ? `<span class="ck" data-ck="${prCk(pr)}" title="${CK_SAID[prCk(pr)]}">${SP_CK[prCk(pr)]}</span>` : ''}</span></span>`;
// its Jira tickets (2026-11-24): a pill beside the PRs', in the first one's status colour; a click its page beside the chat
const SP_TK = '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M5 .8 9.2 5 5 9.2.8 5z"/></svg>';
function spTkPill(s) {
  const tks = s.tickets || [];
  if (!tks.length) return '';
  return `<span class="sptk" role="link" data-cat="${esc(tks[0].cat || '')}" data-url="${esc(tks[0].url || '')}" title="${esc(tks.map(ticketTip).join('\n\n'))}">${SP_TK}${tks.length}<span class="vh"> Jira ticket${tks.length === 1 ? '' : 's'}</span></span>`;
}
const spPills = s => {
  const h = spTkPill(s) + spPrPill(s);
  return h ? `<span class="sppills">${h}</span>` : '';
};
function spPrPill(s) {
  const open = spOpenPrs(s).sort((a, b) => !!b.turn?.you - !!a.turn?.you),
    n = open.length;
  if (!n) return ''; // your move's first, else the chat's order
  const gone = (s.prs || []).length - n,
    you = open.some(p => p.turn?.you),
    fail = open.some(p => prCk(p) === 'fail');
  return (
    `<span class="sppr${you ? ' you' : ''}"><span class="sppn">${SP_PR}${n}${fail ? '<i></i>' : ''}<span class="vh"> open PR${n === 1 ? '' : 's'}${you ? ', one at your move' : ''}</span></span>` +
    `<span class="sppop"><span class="sppl"><span class="spph">${n} open PR${n === 1 ? '' : 's'}${gone ? ` · ${gone} merged or closed` : ''}</span>${open.map(spPrRow).join('')}</span></span></span>`
  );
}
/** A chat's node — what is open is a class set after, so opening a chat redraws no node and stops no arc turning. */
function spNode(s) {
  const st = spState(s),
    rows = spRows(s),
    color = repoColor(s.cwd),
    folder = spFolder(s),
    q = spQuery(),
    armed = st !== 'done' && armedOn(s.id);
  const said = `${s.fav ? 'Starred: ' : ''}${s.title}${s.agent ? `, as @${agentShort(s.agent)}` : ''} — ${folder || 'no folder'}, ${SP_ST[st]}${rows.length ? `, ${spTally(rows)}` : ''}`;
  // quiet for days (2026-11-24): faded by its days since the last word, a ready, idle or done one — never one at work or asking
  const quiet = ['ready', 'idle', 'done'].includes(st),
    days = quiet ? (Date.now() - Date.parse(wordAt(s))) / 86_400_000 : 0,
    age = quiet && prefs.spFade !== false && days >= 1 ? wordAt(s) : '';
  const fade = age ? Math.max(0.5, Math.round((1 - 0.06 * Math.min(days, 9)) * 20) / 20) : 1;
  // a ✓ only where the card has one (canTick): never on a chat at work or asking you, whose claude Done would end
  const tick =
    st === 'done'
      ? ['Back to its lane (D)', SP_BACK]
      : !canTick(s)
        ? null
        : armed
          ? [`Done ends its watch — ${watchEnds(s)}. Tick it again to end it`, SP_TICK]
          : ['Mark as done (D)', SP_TICK];
  const lit = st === 'work' || st === 'watch'; // a light that turns round it (2026-11-24): its bloom under the box, its arc on the edge
  return (
    `<button type="button" class="spt" data-id="${esc(s.id)}" aria-label="${esc(said)}" style="${color ? `--repo:${color};` : ''}${fade < 1 ? `--fade:${fade}` : ''}"><span class="spo">${spPods(s)}` +
    `${lit ? `<i class="sphl" data-st="${st}" aria-hidden="true"></i>` : ''}<span class="spbox" data-st="${st}">${lit ? '<i class="sprg" aria-hidden="true"></i>' : ''}<span class="spstar" role="button" tabindex="-1" aria-pressed="${!!s.fav}" aria-label="${s.fav ? 'Unstar it' : 'Star it'} (F)" title="${s.fav ? 'Unstar' : 'Star'} (F)">${SP_STAR}</span>` +
    (tick
      ? `<span class="spdone${armed ? ' armed' : ''}" role="button" tabindex="-1" aria-label="${esc(tick[0])}" title="${esc(tick[0])}">${tick[1]}</span>`
      : '') +
    `${s.agent ? `<span class="spra" title="${esc(`Runs as the agent ${s.agent}`)}" style="--h:${spHue(agentShort(s.agent), s.agentColor)}">@${esc(agentShort(s.agent))}</span>` : ''}<span class="spbt">${q ? markHits(spCut(s.title), q) : ticks(esc(spCut(s.title)))}</span>${folder || age ? `<span class="spbf" title="${esc(s.cwd || '')}">${folder ? `<i></i>${q ? markHits(folder, q) : esc(folder)}` : ''}${age ? `<span class="spag">${folder ? ' · ' : ''}<span data-at="${esc(age)}"></span></span>` : ''}</span>` : ''}${spAskPill(s)}${spPills(s)}</span></span></button>`
  );
}
