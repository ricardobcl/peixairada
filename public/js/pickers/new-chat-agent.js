// ---- who runs a new chat: an agent (2026-11-06, round XXVIII) -------------------------------------------------------
// `claude --agent <name>`: the whole chat is that agent — its prompt, its tools, its model. ⌥⌘N's ＋ ends its second line
// with a chip, as Claude ▾ or the agent ⏎ starts it as; a click on it, or @ in the box, lists the folder's agents under ＋
// (the folder's and yours by name, each plugin's and Claude Code's own a folded row), and ⏎ takes one, the chats back.
// It starts on the agent you last took in that project (prefs.agentFor, '' for Claude), else the folder's settings' own.
// A PR row's Chat ▾ and ⌥⌘L by an agent's name start one too. The server lists them (GET /api/agents) and checks a name.
const agentsSeen = new Map(); // cwd → { at, v }, asked again 15 s on
const agentsNow = cwd => {
  const h = agentsSeen.get(cwd);
  return h && Date.now() - h.at < 15_000 ? h.v : null;
};
async function agentsOf(cwd) {
  const now = agentsNow(cwd);
  if (now) return now;
  const v = await api('GET', `/api/agents?cwd=${encodeURIComponent(cwd)}`).catch(() => null);
  if (v) agentsSeen.set(cwd, { at: Date.now(), v });
  return v;
}
const agentShort = n => String(n || '').replace(/^[^:]*:/, ''); // a plugin's, without the plugin
const agDot = c => `<span class="asdot"${c ? ` data-c="${esc(c)}"` : ''}></span>`;
const agentModel = a => (a?.model && a.model !== 'inherit' ? a.model : '');
const agentFrom = (a, cwd) =>
  a.source === 'folder'
    ? a.at === cwd
      ? 'this folder'
      : folderName(a.at)
    : a.source === 'user'
      ? 'yours'
      : a.source === 'plugin'
        ? a.plugin
        : 'Claude Code';
/** A chat's agent where the chat is named: its card, its header, a picker's row (C1). */
const agentTag = (s, cls = 'runas') =>
  s.agent
    ? `<span class="${cls}" title="${esc(`Runs as the agent ${s.agent}: claude --agent, or its folder's setting`)}">${agDot(s.agentColor)}@${esc(agentShort(s.agent))}</span>`
    : '';
/** Where claude starts bare, so a row has the chip: the chats step's one folder (＋), or ⌥⌘N's chat in no folder
 *  (2026-11-06, its first row: the board's own folder, straight in). */
const agentCwd = () =>
  pick.mode === 'chats'
    ? pick.ctx.cwds?.length === 1 && !pick.ctx.env
      ? pick.ctx.cwds[0]
      : null
    : pick.mode === 'new'
      ? state.about.scratch || null
      : null;
/** …and what keeps the agent last taken there (prefs.agentFor): the project's key — no folder's, that folder's, as its chats' project is. */
const agentKey = () => (pick.mode === 'new' ? state.about.scratch : pick.ctx.key);
const agentsHere = () => !!(pick.ag && !pick.ag.launchers && (pick.mode === 'agent' || agentCwd()));
/** Where the box's @ is while there are agents to list: before it, the query or the branch; after it, the agent's. */
const atIn = () =>
  (pick.mode === 'chats' || pick.mode === 'new') && agentsHere() ? $('#pickq').value.indexOf('@') : -1;
const boxText = () => {
  const v = $('#pickq').value,
    i = atIn();
  return (i >= 0 ? v.slice(0, i) : v).trim();
};
function agentStart(key, v) {
  if (!v || v.launchers) return null;
  const has = n => !!n && v.agents.some(a => a.name === n),
    last = prefs.agentFor?.[key];
  if (last === '') return null;
  return has(last) ? last : has(v.setting?.name) ? v.setting.name : null;
}
function pickAgents() {
  const cwd = agentCwd();
  pick.agLoad = null;
  if (!cwd) return;
  const take = v => {
    if (!v || agentCwd() !== cwd) return false;
    pick.ag = v;
    if (!pick.agentTouched) pick.agent = agentStart(agentKey(), v);
    return true;
  };
  if (take(agentsNow(cwd))) return;
  const gen = pick.gen;
  pick.agLoad = agentsOf(cwd).then(v => {
    // ⏎ before it lands waits on it (newFromChats); an @ typed before it lists them now
    if (gen !== pick.gen || !$('#pick').open || !take(v)) return;
    pickHint();
    if (atIn() >= 0) {
      pick.typed = true;
      pickRender();
    } else pickRender(pick.mode === 'chats'); // ⌥⌘N's rows stay where they were: the chip alone is new
  });
}
/** What the new chat's command line gets: the agent, '' for Claude over a folder's own, else nothing. */
const agentArg = () => (!pick.ag || pick.ag.launchers ? undefined : pick.agent || (pick.ag.setting ? '' : undefined));
/** …and the project keeps it for next time when it was your pick (D1). */
function agentGo() {
  const a = agentArg();
  const key = agentKey();
  if (pick.agentTouched && key) {
    prefs.agentFor = { ...prefs.agentFor, [key]: pick.agent || '' };
    savePrefs();
  }
  return a;
}
const withAgent = a => (a === undefined ? null : { agent: a });
/** ⏎ or a click on an agent's row (null: Claude): the chip has it, the box loses the @, the chats are back. */
function agentTake(name) {
  pick.agent = name;
  pick.agentTouched = true;
  const q = $('#pickq'),
    i = q.value.indexOf('@');
  if (pick.mode === 'new') q.value = '';
  else if (i >= 0) q.value = q.value.slice(0, i).trimEnd();
  pick.sel = 0;
  pickHint();
  pickRender();
  brAsk();
  q.focus(); // ⌥⌘N: the box empty, no folder is the first row
}
/** The chip clicked: the list under ＋, as @ typed — or, open, shut. */
function agentList() {
  const q = $('#pickq'),
    i = q.value.indexOf('@');
  q.value =
    pick.mode === 'new'
      ? i >= 0
        ? ''
        : '@'
      : i >= 0
        ? q.value.slice(0, i).trimEnd()
        : (q.value.trim() ? q.value.trimEnd() + ' ' : '') + '@'; // ⌥⌘N's projects are no folder's agents' business
  pick.sel = 0;
  pick.typed = i < 0;
  pickHint();
  pickRender();
  q.focus();
}
function agentEscape() {
  if (atIn() < 0) return false;
  agentList();
  return true;
} // esc shuts the list, not the picker
/** The list for the query after the @ (B1): typed, every agent that matches, best first; else Claude, the folder's and
 *  yours, and a row for each plugin's and Claude Code's own, opened by ⏎, → or a click. */
function agentItems(v, aq, claude = true) {
  if (aq) {
    const hits = [];
    v.agents.forEach((a, i) => {
      const m = fuzzy([agentShort(a.name), a.name, a.description || ''], aq);
      if (m) hits.push([m.score, i, a]);
    });
    const out = hits.sort((x, y) => y[0] - x[0] || x[1] - y[1]).map(h => ({ ag: h[2] }));
    return !claude || !fuzzy(['claude'], aq)
      ? out
      : 'claude'.startsWith(aq)
        ? [{ agClaude: true }, ...out]
        : [...out, { agClaude: true }];
  }
  const out = claude ? [{ agClaude: true }] : [],
    groups = new Map();
  for (const a of v.agents) {
    if (a.source === 'folder' || a.source === 'user') {
      out.push({ ag: a });
      continue;
    }
    const k = a.source === 'plugin' ? 'p:' + a.plugin : 'own';
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(a);
  }
  for (const [k, list] of groups)
    out.push(...(pick.unfold.has(k) ? list.map(a => ({ ag: a })) : [{ agFold: k, list }]));
  return out;
}
/** Where the list opens: the first match typed; else the chip's agent, else the first agent after Claude (＋, or no folder, is row 0). */
function agentLand(items, aq) {
  if (aq) return items.length ? 1 : 0;
  const i = items.findIndex(x => x.ag && x.ag.name === pick.agent),
    f = items.findIndex(x => x.ag);
  return 1 + (i >= 0 ? i : f >= 0 ? f : 0);
}
function agentRowHtml(x, i, selc, aq, cwd, v) {
  if (x.agClaude) {
    const set = v.setting && v.agents.find(a => a.name === v.setting.name);
    return `<div class="pkrow asrow${selc}" data-i="${i}" title="${esc(set ? `No agent — claude --agent '', so not the folder's own, @${set.name}` : 'No agent — claude as it starts')}"><span class="asdot own">✳</span><span class="n">Claude<span class="cur">${set ? `no agent, not the folder’s @${esc(agentShort(set.name))}` : 'no agent: Claude Code as it starts'}</span></span><span class="num"></span><span class="src"></span></div>`;
  }
  if (x.agFold) {
    const names = x.list.map(a => agentShort(a.name));
    return `<div class="pkrow asrow fold${selc}" data-i="${i}" title="${esc(`${x.list.map(a => a.name).join(', ')} — ⏎, → or a click shows them`)}"><span class="asdot"></span><span class="n">${x.agFold === 'own' ? `${x.list.length} of Claude Code’s own` : `${x.list.length} from ${esc(x.list[0].plugin)}`}<span class="cur">${esc(names.slice(0, 3).join(', '))}${names.length > 3 ? '…' : ''} · → shows them</span></span><span class="num"></span><span class="src"></span></div>`;
  }
  const a = x.ag;
  return `<div class="pkrow asrow${selc}" data-i="${i}" title="${esc(`claude --agent ${a.name}${a.description ? `\n${a.description}` : ''}`)}">${agDot(a.color)}<span class="n">${markHits('@' + agentShort(a.name), aq)}<span class="cur">${esc(a.description || '')}</span></span><span class="num">${esc(a.model || '')}</span><span class="src">${esc(agentFrom(a, cwd))}</span></div>`;
}
/** ＋'s chip: who ⏎ starts it as, its model, and why it starts there; off where claude starts through a Taskfile. */
function agentChip() {
  if (pick.mode !== 'chats' && pick.mode !== 'new') return '';
  if (pick.mode === 'chats' && pick.ctx.env)
    return `<span class="pkag off" title="${esc(`task ${pick.ctx.env} starts claude its own way: it takes no agent`)}">as Claude</span>`;
  const v = pick.ag;
  if (!v || !agentCwd()) return '';
  if (v.launchers)
    return '<span class="pkag off" title="This folder starts claude through its Taskfile (task &lt;env&gt;), which takes no agent">as Claude</span>';
  const a = pick.agent && v.agents.find(x => x.name === pick.agent),
    open = atIn() >= 0;
  const why =
    a && !pick.agentTouched
      ? prefs.agentFor?.[agentKey()] === a.name
        ? 'the last you took here'
        : v.setting?.name === a.name
          ? 'the folder’s setting'
          : ''
      : '';
  const tip = a
    ? `claude --agent ${a.name}${a.description ? ` — ${a.description}` : ''} · a click or @ for another`
    : `Claude, no agent${v.setting ? ` (claude --agent '': not the folder's own, @${v.setting.name})` : ''} · a click or @ for an agent`;
  return `<button type="button" class="pkag${a ? ' on' : ''}${open ? ' open' : ''}" tabindex="-1" aria-haspopup="listbox" aria-expanded="${open}" title="${esc(tip)}">${a ? `${agDot(a.color)}@${esc(agentShort(a.name))}` : 'as Claude'} <i>▾</i></button>${a && agentModel(a) ? `<span class="pkas">on ${esc(agentModel(a))}</span>` : ''}${why ? `<span class="pkas">· ${why}</span>` : ''}`;
}
/** ⌥⌘L by an agent's name (E2): a new chat as it in the project in view — its one folder, else the open chat's in it. */
const launchAg = { cwd: null, v: null };
function launchAgents() {
  const p = prefs.project !== ALL ? projectStub(prefs.project) : null,
    s = state.sessions.get(state.current);
  const cwd =
    p && !p.custom
      ? p.key
      : p?.cwds?.length === 1
        ? p.cwds[0]
        : s?.cwd && (!p || inProject(s, p))
          ? projDir(s.cwd)
          : null;
  Object.assign(launchAg, { cwd, v: cwd ? agentsNow(cwd) : null });
  if (!cwd || launchAg.v) return;
  const gen = pick.gen;
  agentsOf(cwd).then(v => {
    if (gen !== pick.gen || launchAg.cwd !== cwd) return;
    launchAg.v = v;
    if ($('#pick').open && pick.mode === 'launch' && $('#pickq').value.trim()) pickRender(true);
  });
}
const agentActs = () => {
  const { cwd, v } = launchAg;
  return !v || v.launchers
    ? []
    : v.agents.map(a => ({
        kind: 'action',
        id: 'ag:' + a.name,
        agent: a,
        name: `New chat as @${agentShort(a.name)}`,
        sub: ` — in ${folderName(cwd)}${agentModel(a) ? `, on ${agentModel(a)}` : ''}`,
        fn: () => newChat(cwd, null, { agent: a.name }),
      }));
};
