// ---- who runs a new chat: an agent (2026-11-06, round XXVIII) -------------------------------------------------------
// `claude --agent <name>`: the whole chat is that agent — its prompt, its tools, its model. ⌥⌘N's ＋ ends its second line
// with a chip, as Claude ▾ or the agent ⏎ starts it as; a click on it, or @ in the box, lists the folder's agents under ＋
// (the folder's and yours by name, each plugin's and Claude Code's own a folded row), and ⏎ takes one, the chats back.
// It starts on the agent you last took in that project (prefs.agentFor, '' for Claude), else the folder's settings' own.
// A PR row's Chat ▾ and ⌥⌘L by an agent's name start one too. The server lists them (GET /api/agents) and checks a name.
const agentsSeen = new Map(); // cwd → { at, v }, asked again 15 s on

const agentsNow = cwd => {
  const cached = agentsSeen.get(cwd);

  return cached && Date.now() - cached.at < 15_000 ? cached.v : null;
};

async function agentsOf(cwd) {
  const now = agentsNow(cwd);

  if (now) return now;
  const listing = await api('GET', `/api/agents?cwd=${encodeURIComponent(cwd)}`).catch(() => null);

  if (listing) agentsSeen.set(cwd, { at: Date.now(), v: listing });
  return listing;
}

const agentShort = name => String(name || '').replace(/^[^:]*:/, ''); // a plugin's, without the plugin
const agDot = color => `<span class="asdot"${color ? ` data-c="${esc(color)}"` : ''}></span>`;
const agentModel = agent => (agent?.model && agent.model !== 'inherit' ? agent.model : '');

const agentFrom = (agent, cwd) =>
  agent.source === 'folder'
    ? agent.at === cwd
      ? 'this folder'
      : folderName(agent.at)
    : agent.source === 'user'
      ? 'yours'
      : agent.source === 'plugin'
        ? agent.plugin
        : 'Claude Code';

/** A chat's agent where the chat is named: its card, its header, a picker's row (C1). */
const agentTag = (session, cls = 'runas') =>
  session.agent
    ? `<span class="${cls}" title="${esc(`Runs as the agent ${session.agent}: claude --agent, or its folder's setting`)}">${agDot(session.agentColor)}@${esc(agentShort(session.agent))}</span>`
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
  const value = $('#pickq').value;
  const atIndex = atIn();

  return (atIndex >= 0 ? value.slice(0, atIndex) : value).trim();
};

function agentStart(key, listing) {
  if (!listing || listing.launchers) return null;

  const has = name => !!name && listing.agents.some(agent => agent.name === name);
  const last = prefs.agentFor?.[key];

  if (last === '') return null;
  return has(last) ? last : has(listing.setting?.name) ? listing.setting.name : null;
}

function pickAgents() {
  const cwd = agentCwd();

  pick.agLoad = null;
  if (!cwd) return;

  const take = listing => {
    if (!listing || agentCwd() !== cwd) return false;
    pick.ag = listing;
    if (!pick.agentTouched) pick.agent = agentStart(agentKey(), listing);
    return true;
  };

  if (take(agentsNow(cwd))) return;
  const gen = pick.gen;

  pick.agLoad = agentsOf(cwd).then(listing => {
    // ⏎ before it lands waits on it (newFromChats); an @ typed before it lists them now
    if (gen !== pick.gen || !$('#pick').open || !take(listing)) return;
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
  const agent = agentArg();
  const key = agentKey();

  if (pick.agentTouched && key) {
    prefs.agentFor = { ...prefs.agentFor, [key]: pick.agent || '' };
    savePrefs();
  }

  return agent;
}

const withAgent = agent => (agent === undefined ? null : { agent });

/** ⏎ or a click on an agent's row (null: Claude): the chip has it, the box loses the @, the chats are back. */
function agentTake(name) {
  pick.agent = name;
  pick.agentTouched = true;

  const box = $('#pickq');
  const atIndex = box.value.indexOf('@');

  if (pick.mode === 'new') box.value = '';
  else if (atIndex >= 0) box.value = box.value.slice(0, atIndex).trimEnd();
  pick.sel = 0;
  pickHint();
  pickRender();
  brAsk();
  box.focus(); // ⌥⌘N: the box empty, no folder is the first row
}

/** The chip clicked: the list under ＋, as @ typed — or, open, shut. */
function agentList() {
  const box = $('#pickq');
  const atIndex = box.value.indexOf('@');

  box.value =
    pick.mode === 'new'
      ? atIndex >= 0
        ? ''
        : '@'
      : atIndex >= 0
        ? box.value.slice(0, atIndex).trimEnd()
        : `${box.value.trim() ? `${box.value.trimEnd()} ` : ''}@`; // ⌥⌘N's projects are no folder's agents' business

  pick.sel = 0;
  pick.typed = atIndex < 0;
  pickHint();
  pickRender();
  box.focus();
}

function agentEscape() {
  if (atIn() < 0) return false;
  agentList();
  return true;
} // esc shuts the list, not the picker

/** The list for the query after the @ (B1): typed, every agent that matches, best first; else Claude, the folder's and
 *  yours, and a row for each plugin's and Claude Code's own, opened by ⏎, → or a click. */
function agentItems(listing, aq, claude = true) {
  if (aq) {
    const hits = [];

    listing.agents.forEach((agent, index) => {
      const match = fuzzy([agentShort(agent.name), agent.name, agent.description || ''], aq);

      if (match) hits.push([match.score, index, agent]);
    });

    const out = hits.sort((left, right) => right[0] - left[0] || left[1] - right[1]).map(hit => ({ ag: hit[2] }));

    return !claude || !fuzzy(['claude'], aq)
      ? out
      : 'claude'.startsWith(aq)
        ? [{ agClaude: true }, ...out]
        : [...out, { agClaude: true }];
  }

  const out = claude ? [{ agClaude: true }] : [];
  const groups = new Map();

  for (const agent of listing.agents) {
    if (agent.source === 'folder' || agent.source === 'user') {
      out.push({ ag: agent });
      continue;
    }

    const groupKey = agent.source === 'plugin' ? `p:${agent.plugin}` : 'own';

    if (!groups.has(groupKey)) groups.set(groupKey, []);
    groups.get(groupKey).push(agent);
  }

  for (const [groupKey, list] of groups) {
    out.push(...(pick.unfold.has(groupKey) ? list.map(agent => ({ ag: agent })) : [{ agFold: groupKey, list }]));
  }

  return out;
}

/** Where the list opens: the first match typed; else the chip's agent, else the first agent after Claude (＋, or no folder, is row 0). */
function agentLand(items, aq) {
  if (aq) return items.length ? 1 : 0;

  const chosen = items.findIndex(item => item.ag && item.ag.name === pick.agent);
  const first = items.findIndex(item => item.ag);

  return 1 + (chosen >= 0 ? chosen : first >= 0 ? first : 0);
}

function agentRowHtml(item, index, selc, aq, cwd, listing) {
  if (item.agClaude) {
    const set = listing.setting && listing.agents.find(listed => listed.name === listing.setting.name);

    return `<div class="pkrow asrow${selc}" data-i="${index}" title="${esc(set ? `No agent — claude --agent '', so not the folder's own, @${set.name}` : 'No agent — claude as it starts')}"><span class="asdot own">✳</span><span class="n">Claude<span class="cur">${set ? `no agent, not the folder’s @${esc(agentShort(set.name))}` : 'no agent: Claude Code as it starts'}</span></span><span class="num"></span><span class="src"></span></div>`;
  }

  if (item.agFold) {
    const names = item.list.map(member => agentShort(member.name));

    return `<div class="pkrow asrow fold${selc}" data-i="${index}" title="${esc(`${item.list.map(member => member.name).join(', ')} — ⏎, → or a click shows them`)}"><span class="asdot"></span><span class="n">${item.agFold === 'own' ? `${item.list.length} of Claude Code’s own` : `${item.list.length} from ${esc(item.list[0].plugin)}`}<span class="cur">${esc(names.slice(0, 3).join(', '))}${names.length > 3 ? '…' : ''} · → shows them</span></span><span class="num"></span><span class="src"></span></div>`;
  }

  const agent = item.ag;

  return `<div class="pkrow asrow${selc}" data-i="${index}" title="${esc(`claude --agent ${agent.name}${agent.description ? `\n${agent.description}` : ''}`)}">${agDot(agent.color)}<span class="n">${markHits(`@${agentShort(agent.name)}`, aq)}<span class="cur">${esc(agent.description || '')}</span></span><span class="num">${esc(agent.model || '')}</span><span class="src">${esc(agentFrom(agent, cwd))}</span></div>`;
}

/** ＋'s chip: who ⏎ starts it as, its model, and why it starts there; off where claude starts through a Taskfile. */
function agentChip() {
  if (pick.mode !== 'chats' && pick.mode !== 'new') return '';

  if (pick.mode === 'chats' && pick.ctx.env) {
    return `<span class="pkag off" title="${esc(`task ${pick.ctx.env} starts claude its own way: it takes no agent`)}">as Claude</span>`;
  }

  const listing = pick.ag;

  if (!listing || !agentCwd()) return '';

  if (listing.launchers) {
    return '<span class="pkag off" title="This folder starts claude through its Taskfile (task &lt;env&gt;), which takes no agent">as Claude</span>';
  }

  const agent = pick.agent && listing.agents.find(listed => listed.name === pick.agent);
  const open = atIn() >= 0;

  const why =
    agent && !pick.agentTouched
      ? prefs.agentFor?.[agentKey()] === agent.name
        ? 'the last you took here'
        : listing.setting?.name === agent.name
          ? 'the folder’s setting'
          : ''
      : '';

  const tip = agent
    ? `claude --agent ${agent.name}${agent.description ? ` — ${agent.description}` : ''} · a click or @ for another`
    : `Claude, no agent${listing.setting ? ` (claude --agent '': not the folder's own, @${listing.setting.name})` : ''} · a click or @ for an agent`;

  return `<button type="button" class="pkag${agent ? ' on' : ''}${open ? ' open' : ''}" tabindex="-1" aria-haspopup="listbox" aria-expanded="${open}" title="${esc(tip)}">${agent ? `${agDot(agent.color)}@${esc(agentShort(agent.name))}` : 'as Claude'} <i>▾</i></button>${agent && agentModel(agent) ? `<span class="pkas">on ${esc(agentModel(agent))}</span>` : ''}${why ? `<span class="pkas">· ${why}</span>` : ''}`;
}

/** ⌥⌘L by an agent's name (E2): a new chat as it in the project in view — its one folder, else the open chat's in it. */
const launchAg = { cwd: null, v: null };

function launchAgents() {
  const project = prefs.project !== ALL ? projectStub(prefs.project) : null;
  const session = state.sessions.get(state.current);

  const cwd =
    project && !project.custom
      ? project.key
      : project?.cwds?.length === 1
        ? project.cwds[0]
        : session?.cwd && (!project || inProject(session, project))
          ? projDir(session.cwd)
          : null;

  Object.assign(launchAg, { cwd, v: cwd ? agentsNow(cwd) : null });
  if (!cwd || launchAg.v) return;
  const gen = pick.gen;

  agentsOf(cwd).then(listing => {
    if (gen !== pick.gen || launchAg.cwd !== cwd) return;
    launchAg.v = listing;
    if ($('#pick').open && pick.mode === 'launch' && $('#pickq').value.trim()) pickRender(true);
  });
}

const agentActs = () => {
  const { cwd, v: listing } = launchAg;

  return !listing || listing.launchers
    ? []
    : listing.agents.map(agent => ({
        kind: 'action',
        id: `ag:${agent.name}`,
        agent,
        name: `New chat as @${agentShort(agent.name)}`,
        sub: ` — in ${folderName(cwd)}${agentModel(agent) ? `, on ${agentModel(agent)}` : ''}`,
        fn: () => newChat(cwd, null, { agent: agent.name }),
      }));
};
