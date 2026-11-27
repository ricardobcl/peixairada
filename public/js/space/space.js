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

const SP_BUSY = ['run', 'wait', 'joined'];
const SP_OPEN_MS = 20_000;

const SP_WINS = [15, 30, 60];
const SP_ORDER = ['run', 'quiet', 'wait', 'fail', 'done', 'stop', 'joined'];
const SP_POD = 6;
const SP_PODS = 4;
const SP_CAP = 30;

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
const spSt = agent => (agQuiet(agent) ? 'quiet' : agent.st);
const spState = session => SP_OF[session.done ? 'done' : rankOf(session)] || 'ready';
// every agent the chat has run, not the last round alone (2026-11-18, v9) — nor its claude's alone: a resume's claude starts
// its rows over, its past agents stay in the pods, and a chat with no claude has them too (2026-11-24, `past`)
const spRows = session => (session?.alive ? session.agentAll || session.agentRows || [] : session?.agentAll || []);
const spCount = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

const spCut = text => {
  text = String(text || '');
  return text.length > 60 ? `${text.slice(0, 60).trimEnd()}…` : text;
};

// an agent by its type, a teammate by the category it was spawned as (the server's mateType) — never "teammate": its name is
// its card's, never Space's (2026-11-18, later; v6); capitalised where it is a word
const spKind = agent => agent.type || (agent.mate ? 'general-purpose' : 'agent');
const spCap = text => String(text).charAt(0).toUpperCase() + String(text).slice(1);

const spHue = (name, color) =>
  SP_HUE[color] ?? [...String(name)].reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) % 360, 7);

const spTwo = name => {
  const parts = String(name)
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);

  return parts.length
    ? (parts.length > 1 ? parts.map(part => part[0]).join('') : parts[0].slice(0, 2)).toUpperCase().slice(0, 2)
    : '·';
};

const spTally = rows =>
  SP_ORDER.map(status => [status, rows.filter(agent => spSt(agent) === status).length])
    .filter(([, count]) => count)
    .map(([status, count]) => `${count} ${SP_WORD[status]}`)
    .join(' · ');

const spFolder = session =>
  !session.cwd || session.cwd === state.about?.scratch ? '' : session.cwd.replace(/\/+$/, '').split('/').pop() || '/'; // its last name only (2026-11-18, v7); the whole path its tooltip

/** An agent's mark: its type's letters and colour, its state for a screen reader too. */
const spAgent = (agent, kind, hue, session) => {
  const st = spSt(agent);

  return `<span class="spa${agent.past ? ' past' : ''}" data-st="${st}" data-ag="${esc(agent.id)}" data-sid="${esc(session.id)}" style="--h:${hue}" role="img" aria-label="${esc(`${spCap(kind)}${agent.mate ? ' teammate' : ''}: ${SP_WORD[st]}${agent.past ? ', an earlier run' : ''}`)}">${esc(spTwo(kind))}${['done', 'fail', 'wait', 'stop'].includes(st) ? '<i></i>' : ''}</span>`;
};

/** An agent pointed at in Space (2026-11-18, later): #mxtip's card in Space's words — its type in its colour and letters
 *  ("teammate" when one), its state and time, what it was asked (the first line, the rest under it), what it does now (or
 *  did last, or the error), then what is read when pointed at — model, tool calls and tokens, its worktree. Its name is
 *  here and nowhere else in Space. */
/** A chat's card, its node's title pointed at (2026-11-24): its state and the age of its last word, its folder and
 *  branch, the whole title, then your last word, Claude's, what it does now, its open PRs where their review stands,
 *  its tickets. Read from the summary alone. */
function spChatHtml(session) {
  const st = spState(session);
  const at = wordAt(session);
  const branch = session.worktree || session.headNow || session.gitBranch || '';
  const live = liveOf(session).html;

  const prs = spOpenPrs(session)
    .map(
      pr => `${esc((prRepo(pr).split('/')[1] || '') + prNum(pr))}${spStageText(pr) ? ` ${esc(spStageText(pr))}` : ''}`,
    )
    .join(' · ');

  const kv = [
    ['You', session.lastPrompt && esc(session.lastPrompt)],
    ['Claude', session.lastReply && ticks(esc(session.lastReply))],
    ['Now', live],
    ['PRs', prs],
    ['Ticket', (session.tickets || []).map(ticket => `${esc(ticket.key)} · ${esc(ticket.status || '')}`).join(' — ')],
  ].filter(([, value]) => value);

  const ink = {
    ask: '--needs',
    work: '--working-ink',
    watch: '--watch',
    ready: '--idle',
    idle: '--muted',
    done: '--ended',
  }[st];

  return (
    `<div class="spcs" style="--c:var(${ink})"><b>${SP_ST[st]}${at ? ` · <span data-at="${esc(at)}"></span>` : ''}</b><span>${esc(spFolder(session) || 'no folder')}${branch ? ` · <code>${esc(branch)}</code>` : ''}</span></div>` +
    `<div class="mtt">${ticks(esc(session.title || ''))}</div>${
      kv.length
        ? `<dl class="spcc">${kv.map(([label, value]) => `<dt>${label}</dt><dd>${value}</dd>`).join('')}</dl>`
        : ''
    }`
  );
}

function spCardHtml(agent, session) {
  const detail = agInfo.get(`${session.id}:${agent.id}`)?.d;
  const st = spSt(agent);
  const kind = spKind(agent);
  const hue = spHue(kind, agent.color);
  const ended = !!agent.end;

  const since = time => agDur(Date.now() - Date.parse(time));

  const said =
    st === 'run'
      ? `at work ${since(agent.at)}`
      : st === 'quiet'
        ? `quiet ${since(agent.lastAt)}`
        : st === 'wait'
          ? `waiting ${since(agent.at)}`
          : st === 'done'
            ? `done in ${agDur(Date.parse(agent.end) - Date.parse(agent.at))}`
            : st === 'stop'
              ? `stopped after ${agDur(Date.parse(agent.end) - Date.parse(agent.at))}`
              : AG_SAID[st] || '';

  const asked = String(detail?.prompt || agent.asked || '').trim();
  const nl = asked.indexOf('\n');
  const first = nl < 0 ? asked : asked.slice(0, nl);
  const rest = nl < 0 ? '' : asked.slice(nl + 1).trim();

  const now =
    st === 'fail'
      ? ['Error', `<span class="spce">${esc(agent.why || 'It ended on an error')}</span>`]
      : st === 'joined'
        ? null
        : [ended ? 'Last' : 'Now', agNow(agent, session)];

  const reading = '<span class="spcr">reading…</span>';
  const tree = agent.branch || agent.tree;

  const kv = [
    ['Model', detail ? esc(detail.model || '—') : reading],
    [
      ended ? 'In all' : 'So far',
      detail
        ? detail.tools || detail.tokens
          ? esc(
              `${detail.tools} tool call${detail.tools === 1 ? '' : 's'}${detail.tokens ? ` · ${agTok(detail.tokens)} tokens` : ''}`,
            )
          : 'nothing yet'
        : reading,
    ],
    tree && ['Worktree', esc(tree)],
  ].filter(Boolean);

  return `<div class="mth spch" style="--h:${hue}"><span class="spct">${esc(spTwo(kind))}</span><b class="spck">${esc(spCap(kind))}</b>${agent.mate ? '<span class="spcm">teammate</span>' : ''}<span class="mts" data-state="${esc(st)}">${esc(said)}</span></div>${
    agent.name && agent.name !== kind ? `<div class="spcn">${esc(agent.name)}</div>` : ''
  }<div class="mtt">${first ? esc(first) : '<i>What it was asked is on its way…</i>'}</div>${
    rest ? `<p class="agp spcp">${esc(rest.slice(0, 400))}</p>` : ''
  }${
    now?.[1] ? `<dl class="agi spcw"><dt>${now[0]}</dt><dd>${now[1]}</dd></dl>` : ''
  }<dl class="agi spcv">${kv.map(([label, value]) => `<dt>${label}</dt><dd>${value}</dd>`).join('')}</dl>`;
}

// a node's box in its tile (#space's --spw × --sph, .spbox's place): its centre and half sizes, a pod's thickness, a wire's length (2026-11-18, v9)
const SP_GEO = { cx: 152, cy: 108, hw: 80, hh: 50, pt: 34, w: 8 };
const SP_TILE = [304, 216];

/** A chat's agents by type, the most first, each docked to its node on a side of its own: top, bottom, right, left. */
function spPods(session) {
  const groups = [];

  for (const agent of spRows(session)) {
    if (prefs.spBusy && !SP_BUSY.includes(agent.st)) continue;
    const kind = spKind(agent);
    let group = groups.find(other => other.k === kind);

    if (!group) groups.push((group = { k: kind, rows: [], color: agent.color }));
    group.rows.push(agent);
    group.color ||= agent.color;
  }

  groups.sort((first, second) => second.rows.length - first.rows.length);

  const shown = groups.slice(0, SP_PODS);
  const left = groups.slice(SP_PODS).reduce((total, group) => total + group.rows.length, 0);

  return shown
    .map((group, index) => {
      // folded, a pod is its agents at work, else its newest; +N the rest, opened for SP_OPEN_MS (2026-11-18, v10)
      const busy = group.rows.filter(agent => SP_BUSY.includes(agent.st));

      const last = group.rows.reduce(
        (latest, agent) => ((agent.lastAt || agent.at || 0) > (latest.lastAt || latest.at || 0) ? agent : latest),
        group.rows[0],
      );

      const key = `${session.id}:${group.k}`;
      const base = busy.length ? busy : [last];
      const hid = group.rows.length - base.length;
      const open = hid > 0 && sp.open.has(key);
      const all = open ? group.rows : base;

      const hue = spHue(group.k, group.color);
      const more = all.length > SP_POD ? all.length - (SP_POD - 1) : 0;
      const rows = more ? all.slice(0, SP_POD - 1) : all;

      const tog =
        hid > 0
          ? `<span class="spx" role="button" tabindex="-1" data-pod="${esc(group.k)}" aria-expanded="${open}" aria-label="${open ? `Fold ${esc(spCap(group.k))}` : `${hid} more ${esc(spCap(group.k))}, done or idle`}">${open ? '−' : `+${hid}`}</span>`
          : '';

      // top and bottom a row, the sides a column: x, y, width, height of the pod; of its wire; where its label is
      const count = rows.length + (more ? 1 : 0) + (tog ? 1 : 0);
      const len = count * 26 + (count - 1) * 5 + 12;
      const side = ['top', 'bottom', 'right', 'left'][index];

      const { cx, cy, hw, hh, pt, w: wire } = SP_GEO;
      const top = cy - hh - wire - pt;
      const bot = cy + hh + wire;
      const lft = cx - hw - wire - pt;
      const rgt = cx + hw + wire;

      const at = {
        top: [cx - len / 2, top, len, pt, cx - 1, cy - hh - wire, 2, wire, cx, top - 14],
        bottom: [cx - len / 2, bot, len, pt, cx - 1, cy + hh, 2, wire, cx, bot + pt + 2],
        right: [rgt, cy - len / 2, pt, len, cx + hw, cy - 1, wire, 2, rgt + pt / 2, cy + len / 2 + 3],
        left: [lft, cy - len / 2, pt, len, lft + pt, cy - 1, wire, 2, lft + pt / 2, cy + len / 2 + 3],
      }[side];

      const label = `${spCap(group.k)}${index === SP_PODS - 1 && left ? ` · +${left} more` : ''}`;

      return (
        `<span class="spwire" style="--h:${hue};left:${at[4]}px;top:${at[5]}px;width:${at[6]}px;height:${at[7]}px"></span>` +
        `<span class="sppod${side === 'right' || side === 'left' ? ' col' : ''}" style="--h:${hue};left:${at[0]}px;top:${at[1]}px;width:${at[2]}px;height:${at[3]}px">${rows.map(agent => spAgent(agent, group.k, hue, session)).join('')}${more ? `<span class="spmore">+${more}</span>` : ''}${tog}</span>` +
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
  const review = pr.review;

  if (!review || pr.state === 'draft') return '';
  const decision = review.decision === 'required' || (!review.decision && review.asked) ? 'required' : review.decision;

  return [
    SP_STAGE[decision] && !(decision === 'required' && review.open) ? SP_STAGE[decision][0] : '',
    review.open ? `${review.open} unresolved` : '',
  ]
    .filter(Boolean)
    .join(', ');
};

function spStage(pr) {
  const review = pr.review;

  if (!review || pr.state === 'draft') return '';

  const decision = review.decision === 'required' || (!review.decision && review.asked) ? 'required' : review.decision;
  const stage = SP_STAGE[decision];

  const open = review.open ? `<span class="rv" data-rv="open">${review.open} unresolved</span>` : '';

  return (
    (stage && !(decision === 'required' && review.open)
      ? `<span class="rv" data-rv="${stage[1]}">${stage[0]}</span>`
      : '') + open
  );
}

const spOpenPrs = session => (session.prs || []).filter(pr => pr.state === 'open' || pr.state === 'draft');

const spPrRow = pr =>
  `<span class="spprr" role="link" data-url="${esc(pr.url)}" data-state="${esc(pr.state)}" title="${esc(`${pr.title || ''}\nOpens on a tab beside the chat`)}"><i class="sq"></i>` +
  `<span class="no">${esc((prRepo(pr).split('/')[1] || '') + prNum(pr))}</span><span class="ti">${esc(pr.title ? (pr.title.length > 72 ? `${pr.title.slice(0, 72).trimEnd()}…` : pr.title) : 'its title on its way…')}</span>` +
  `<span class="tg">${spStage(pr)}${pr.turn?.you ? '<span class="ym">your move</span>' : ''}${prCk(pr) ? `<span class="ck" data-ck="${prCk(pr)}" title="${CK_SAID[prCk(pr)]}">${SP_CK[prCk(pr)]}</span>` : ''}</span></span>`;

// its Jira tickets (2026-11-24): a pill beside the PRs', in the first one's status colour; a click its page beside the chat
const SP_TK = '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M5 .8 9.2 5 5 9.2.8 5z"/></svg>';

function spTkPill(session) {
  const tks = session.tickets || [];

  if (!tks.length) return '';
  return `<span class="sptk" role="link" data-cat="${esc(tks[0].cat || '')}" data-url="${esc(tks[0].url || '')}" title="${esc(tks.map(ticketTip).join('\n\n'))}">${SP_TK}${tks.length}<span class="vh"> Jira ticket${tks.length === 1 ? '' : 's'}</span></span>`;
}

const spPills = session => {
  const html = spTkPill(session) + spPrPill(session);

  return html ? `<span class="sppills">${html}</span>` : '';
};

function spPrPill(session) {
  const open = spOpenPrs(session).sort((left, right) => !!right.turn?.you - !!left.turn?.you);
  const count = open.length;

  if (!count) return ''; // your move's first, else the chat's order

  const gone = (session.prs || []).length - count;
  const you = open.some(pr => pr.turn?.you);
  const fail = open.some(pr => prCk(pr) === 'fail');

  return (
    `<span class="sppr${you ? ' you' : ''}"><span class="sppn">${SP_PR}${count}${fail ? '<i></i>' : ''}<span class="vh"> open PR${count === 1 ? '' : 's'}${you ? ', one at your move' : ''}</span></span>` +
    `<span class="sppop"><span class="sppl"><span class="spph">${count} open PR${count === 1 ? '' : 's'}${gone ? ` · ${gone} merged or closed` : ''}</span>${open.map(spPrRow).join('')}</span></span></span>`
  );
}

/** A chat's node — what is open is a class set after, so opening a chat redraws no node and stops no arc turning. */
function spNode(session) {
  const st = spState(session);
  const rows = spRows(session);
  const color = repoColor(session.cwd);
  const folder = spFolder(session);
  const query = spQuery();
  const armed = st !== 'done' && armedOn(session.id);

  const said = `${session.fav ? 'Starred: ' : ''}${session.title}${session.agent ? `, as @${agentShort(session.agent)}` : ''} — ${folder || 'no folder'}, ${SP_ST[st]}${rows.length ? `, ${spTally(rows)}` : ''}`;

  // quiet for days (2026-11-24): faded by its days since the last word, a ready, idle or done one — never one at work or asking
  const quiet = ['ready', 'idle', 'done'].includes(st);
  const days = quiet ? (Date.now() - Date.parse(wordAt(session))) / 86_400_000 : 0;
  const age = quiet && prefs.spFade !== false && days >= 1 ? wordAt(session) : '';

  const fade = age ? Math.max(0.5, Math.round((1 - 0.06 * Math.min(days, 9)) * 20) / 20) : 1;

  // a ✓ only where the card has one (canTick): never on a chat at work or asking you, whose claude Done would end
  const tick =
    st === 'done'
      ? ['Back to its lane (D)', SP_BACK]
      : !canTick(session)
        ? null
        : armed
          ? [`Done ends its watch — ${watchEnds(session)}. Tick it again to end it`, SP_TICK]
          : ['Mark as done (D)', SP_TICK];

  const lit = st === 'work' || st === 'watch'; // a light that turns round it (2026-11-24): its bloom under the box, its arc on the edge

  return (
    `<button type="button" class="spt" data-id="${esc(session.id)}" aria-label="${esc(said)}" style="${color ? `--repo:${color};` : ''}${fade < 1 ? `--fade:${fade}` : ''}"><span class="spo">${spPods(session)}` +
    `${lit ? `<i class="sphl" data-st="${st}" aria-hidden="true"></i>` : ''}<span class="spbox" data-st="${st}">${lit ? '<i class="sprg" aria-hidden="true"></i>' : ''}<span class="spstar" role="button" tabindex="-1" aria-pressed="${!!session.fav}" aria-label="${session.fav ? 'Unstar it' : 'Star it'} (F)" title="${session.fav ? 'Unstar' : 'Star'} (F)">${SP_STAR}</span>${
      tick
        ? `<span class="spdone${armed ? ' armed' : ''}" role="button" tabindex="-1" aria-label="${esc(tick[0])}" title="${esc(tick[0])}">${tick[1]}</span>`
        : ''
    }${session.agent ? `<span class="spra" title="${esc(`Runs as the agent ${session.agent}`)}" style="--h:${spHue(agentShort(session.agent), session.agentColor)}">@${esc(agentShort(session.agent))}</span>` : ''}<span class="spbt">${query ? markHits(spCut(session.title), query) : ticks(esc(spCut(session.title)))}</span>${folder || age ? `<span class="spbf" title="${esc(session.cwd || '')}">${folder ? `<i></i>${query ? markHits(folder, query) : esc(folder)}` : ''}${age ? `<span class="spag">${folder ? ' · ' : ''}<span data-at="${esc(age)}"></span></span>` : ''}</span>` : ''}${spAskPill(session)}${spPills(session)}</span></span></button>`
  );
}
