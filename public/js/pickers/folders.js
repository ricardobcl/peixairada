// ---- the roots' folders, and cloning one that is not here yet (2026-09-21) --------------------
// Adding a project was the longest thing the board asked of you. A project on the board is a folder a chat ran in, so
// ⌥⌘N's project step could only ever offer a folder that already had one — the repos you had not touched today were
// not there, and the ones you had not cloned were nowhere at all. The step now carries every folder under the org's
// directory after the board's own projects, and a name that is none of them is offered as ＋ clone. The server answers
// `GET /api/folders` (cached by the directory's mtime), so this is asked on every opening and the rows appear when it
// lands. Since 2026-09-28 the directories are the cog's — any number of roots, each with the GitHub org its clone
// asks for, or none (then it lists its folders only).
const folders = { roots: [], list: [], asked: 0 };

async function loadFolders() {
  const asked = ++folders.asked; // only the newest question's answer: an older one held the roots just removed

  try {
    const response = await api('GET', '/api/folders');

    if (asked !== folders.asked) return;
    Object.assign(folders, { roots: response.roots || [], list: response.folders || [] });

    if ($('#pick').open && pick.mode === 'new') {
      pickHint();
      pickRender();
    } // the box named no directory until now
  } catch {}
}

/** The folders that are not already a project on the board — matched by the exact folder, so a repo whose chats all
 *  live in a subfolder of it is still offered at its root, which is a different place to start. Not a worktree
 *  (2026-10-09): one with a chat is a project already, and the rest are offered only by their whole name (cloneRows). */
const freeFolders = () => {
  const taken = new Set(projectList().flatMap(project => project.cwds));

  return folders.list
    .filter(folder => !folder.worktree && !taken.has(folder.cwd) && !isHidden(folder.cwd))
    .map(folder => ({ key: folder.cwd, name: folder.name, cwd: folder.cwd, cwds: [folder.cwd], folder: true }));
};

const CLONE_NAME = /^[A-Za-z0-9][\w.-]*$/; // the server's own rule for a name it will clone — no row it would refuse

/** ＋ clone, last and never filtered out: a name that is no folder here is a repo of an org you have not cloned — a
 *  row per root that has an org. The query as typed, not lowercased — a repository has a name, not a spelling. */
function cloneRows(items) {
  const name = $('#pickq').value.trim();

  if (!name || !CLONE_NAME.test(name)) return [];
  if (items.some(item => item.name.toLowerCase() === name.toLowerCase())) return [];
  // a folder of that name that is here but hidden (✕) is offered as itself — starting a chat there puts it back — not
  // as a clone gh would refuse: "destination already exists" (2026-10-03)
  const here = folders.list.filter(folder => folder.name.toLowerCase() === name.toLowerCase());

  if (here.length) {
    return here.map(folder => ({
      key: folder.cwd,
      name: folder.name,
      cwd: folder.cwd,
      cwds: [folder.cwd],
      folder: true,
    }));
  }

  return folders.roots.filter(root => root.org).map(root => ({ clone: true, name, root: root.dir, org: root.org }));
}

// The clone itself, then the same flow as any folder: its chats (none, freshly cloned) and ＋ a new one, so the
// chat starts without another keystroke. The server answers only when git is done — a big repo takes a while — so
// the box says what is happening, and the list holds the answer when it goes wrong.
// The answer acts on the picker only while it is still that clone's (2026-10-03: closed meanwhile, the next picker
// opened with a box that would not type, and the clone's chats step popped up over whatever was there minutes later).
async function cloneAndStart({ name, root, org }) {
  const box = $('#pickq');
  const was = box.placeholder;
  const run = ++pick.gen;

  box.value = '';
  box.placeholder = `cloning ${org}/${name}…`;
  box.disabled = true;
  pick.cloning = true;
  const dir = `${root}/${name}`;

  if (!state.clones.has(dir)) state.clones.set(dir, { ref: `${org}/${name}`, dir, phase: null, percent: 0 });

  $('#picklist').innerHTML =
    `<div class="none clonebox" data-dir="${esc(dir)}">cloning ${esc(org)}/${esc(name)} into ${esc(homePath(root))} — a big repo takes a while…<span class="cp"></span><i class="cbar"></i></div>`;

  cloneShown();
  let result;

  try {
    result = await api('POST', '/api/clone', { name, root });
  } catch (error) {
    result = { error: error.message };
  }

  if (result.cwd) loadFolders();

  if (run !== pick.gen || !$('#pick').open) {
    note(
      $('#shead'),
      result.cwd
        ? `Cloned ${org}/${name} — ⌥⌘N starts a chat there`
        : `Could not clone ${org}/${name}: ${result.error || 'the server said no'}`,
      !result.cwd,
    );

    return;
  }

  pick.cloning = false;
  box.disabled = false;
  box.placeholder = was;
  box.focus();

  if (!result.cwd) {
    $('#picklist').innerHTML =
      `<div class="none">could not clone ${esc(org)}/${esc(name)} — ${esc(result.error || 'the server said no')}</div>`;

    return;
  }

  chatsStep({ key: result.cwd, name, cwds: [result.cwd] });
}

// A box says what it searches (2026-10-12): the scope in the placeholder, and the launcher's prefixes in a line under
// its list, which a placeholder cut off at "@ proje".
const PICK_FOOT = {
  launch:
    '<kbd>&gt;</kbd> actions and switches <kbd>#</kbd> PRs <kbd>@</kbd> projects <kbd>!</kbd> tickets <s>·</s> <kbd>→</kbd> into a menu',
  chats: () =>
    atIn() >= 0
      ? '<kbd>⏎</kbd> takes the agent, the chats come back <s>·</s> <kbd>⌫</kbd> on the <kbd>@</kbd> goes back without one'
      : [
          pick.git &&
            (agentsHere()
              ? '<kbd>←</kbd><kbd>→</kbd> this folder or a new worktree'
              : '<kbd>←</kbd><kbd>→</kbd> ＋ new chat in this folder, or in a new worktree on a branch of its own'),
          agentsHere() && '<kbd>@</kbd> an agent to run it',
        ]
          .filter(Boolean)
          .join(' <s>·</s> '),
  base: '<kbd>⏎</kbd> a worktree from the branch selected <s>·</s> <kbd>←</kbd> back to its name',
  new: () =>
    atIn() >= 0
      ? '<kbd>⏎</kbd> takes the agent for a chat in no folder <s>·</s> <kbd>⌫</kbd> on the <kbd>@</kbd> goes back without one'
      : '',
};

const pickHint = () => {
  const hint = PICK_HINT[pick.mode];
  const text = typeof hint === 'function' ? hint(pick.ctx) : hint;

  $('#pickq').placeholder = pick.ctx.back && !/← back/.test(text) ? text.replace(/ · esc$/, ' · ← back · esc') : text;

  const foot = PICK_FOOT[pick.mode];
  const html = (typeof foot === 'function' ? foot() : foot) || '';

  $('#pickfoot').hidden = !html;
  if (html && $('#pickfoot').innerHTML !== html) $('#pickfoot').innerHTML = html;
};

function pickOpen(mode = 'project', ctx = {}) {
  const dlg = $('#pick');

  if (!dlg.open) {
    // a step of the new-chat flow re-fills the open dialog; a hotkey never gets here with one up
    if (inApp) post({ type: 'focus' }); // the key may have come from the pane: the box needs the board's keyboard
    dlg.showModal();
    repostPane(); // the pane goes down while it is up, so the dialog is centred and on top
  }

  pick.mode = mode;
  pick.ctx = ctx;
  pick.sel = 0;
  pick.gen++;
  pick.cloning = false;
  pick.git = null;
  pick.wt = false;
  pick.br = null;
  pick.named = null;
  $('#pickq').disabled = false;
  pick.ag = mode === 'agent' ? ctx.ag : null;
  pick.agent = null;
  pick.agentTouched = false;
  pick.unfold = new Set();
  if (mode === 'new') loadFolders(); // the org's folders, fresh: the rows join the list when the answer lands
  if (mode === 'chats' || mode === 'new') pickAgents();
  else if (mode === 'launch') launchAgents();
  $('#pickq').value = '';
  pickHint();
  pickRender();
  $('#pickq').focus();

  // ⌥⌘N starts on the project in view (2026-09-28, with ＋ gone): ⏎ takes it, a second ⏎ is a new chat there
  if (mode === 'new' && prefs.project !== ALL) {
    const index = pick.list.findIndex(item => item?.key === prefs.project);

    if (index > 0) {
      pick.sel = index;
      pickRender();
    }
  }

  // ⌥⌘G from a PR's page (2026-10-16): the one after it selected, so ⌥⌘G ⏎ walks the chat's PRs, the last back to the first
  if (mode === 'pr' && ctx.at) {
    const index = pick.list.findIndex(pr => pr.url === ctx.at);

    if (index >= 0) {
      pick.sel = (index + 1) % pick.list.length;
      pickRender();
    }
  }
}

/** `keep`: a redraw the server caused, not the keys — the selection stays on the chat it was on, wherever the list
 *  moved it; a chat that left gives its place to the one that slid up into it. */
function pickRender(keep = false) {
  if (pick.cloning) return; // the box says what is happening until the clone answers
  const was = keep ? pick.list[pick.sel] : null;
  const query = $('#pickq').value.trim().toLowerCase();
  const mark = text => markHits(text, query);

  // With something typed the best match leads; with the box empty each list keeps its own order (the board's for
  // chats, mention order for PRs, the Taskfile's for environments). Ties go to whichever came first in that order.
  const hunt = (items, fields, worth = () => 1) => {
    if (!query) return items;
    const hits = [];

    items.forEach((item, index) => {
      const match = fuzzy(fields(item), query);

      if (match) hits.push([match.score * worth(item), index, item]);
    });

    return hits.sort((left, right) => right[0] - left[0] || left[1] - right[1]).map(hit => hit[2]);
  };

  const sel = index => (index === pick.sel ? ' sel' : '');
  let row; // each mode fills pick.list and says how a row of it is drawn; the selection is clamped once, below

  if (pick.mode === 'launch' || pick.mode === 'toggle' || pick.mode === 'prs') {
    // ⌥⌘L (2026-10-10): the launcher, its switches, every chat's PRs
    const raw = $('#pickq').value;

    const lq = raw
      .replace(/^[>#@!]/, '')
      .trim()
      .toLowerCase();

    pick.list =
      pick.mode === 'launch'
        ? launchRows(raw)
        : pick.mode === 'toggle'
          ? hunt(toggleRows(), toggle => [toggle.name])
          : hunt(allPrs(), pr => [pr.label, pr.title || '', pr.chat || '']).map(pr => ({
              kind: 'pr',
              id: `pr:${pr.url}`,
              pr,
            }));

    row = (item, index) => launchRow(item, index, sel, text => markHits(text, lq));
  } else if (pick.mode === 'pr') {
    pick.list = hunt(state.sessions.get(state.current)?.prs || [], pr => [pr.label, pr.title || '']);

    row = (pr, index) =>
      `<div class="pkrow pr${sel(index)}" data-i="${index}" data-state="${esc(pr.state || '')}" title="${esc(pr.url)}"><span class="st">${esc(pr.state || 'PR')}</span><span class="num">${mark(pr.label)}</span><span class="n${pr.title ? '' : ' pending'}">${pr.title ? mark(pr.title) : 'title on its way from gh…'}${pr.url === (pick.ctx.at || shownPr.url) ? '<span class="cur">current</span>' : ''}</span><span class="t" data-at="${esc(pr.lastAt || '')}"></span></div>`;
  } else if (pick.mode === 'chat') {
    const order = (left, right) => RANK[rankOf(left)] - RANK[rankOf(right)] || byWord(left, right);

    const found = hunt(
      [...state.sessions.values()]
        .filter(session => (visible(session) && (query || bucket(session) !== 'done')) || (query && session.removed))
        .sort(order),
      chatFields,
      session => doneWorth(session, query),
    );

    const named = (pick.named?.ids || [])
      .map(id => state.sessions.get(id))
      .filter(session => session && !found.includes(session))
      .sort(order); // what the chips did not know

    pick.list = [...found, ...named];

    row = (session, index) =>
      `<div class="pkrow chat${sel(index)}" data-i="${index}" data-state="${chatState(session)}" style="${repoStyle(repoColor(session.cwd))}" title="${esc(session.cwd || '')}"><span class="sq"></span><span class="n">${ticks(mark(session.title))}${agentTag(session, 'cur runas')}${idsHit(session, query)}${named.includes(session) ? '<span class="cur ids">named in its transcript</span>' : ''}${asleep(session) ? `<span class="cur zzt">${ICON.moon}snoozed ${esc(snoozeSay(session.snooze))}</span>` : ''}${session.removed ? '<span class="cur">deleted from the board</span>' : ''}${session.id === state.current ? '<span class="cur">current</span>' : ''}</span><span class="num">${projIcon(session.project)}${mark(session.project)}</span><span class="st">${chatState(session)}</span><span class="t" data-at="${esc(wordAt(session))}"></span></div>`;
  } else if (pick.mode === 'chatpick') {
    // a chat to send to (2026-10-31): ⌥⌘K's rows, one it cannot go to dimmed and saying why
    // …or several to merge (`many`): ⏎ takes one in or out, ✓ before it; the first row goes on with those taken in
    const ctx = pick.ctx;

    const chats = hunt(
      [...state.sessions.values()]
        .filter(session => visible(session) && bucket(session) !== 'done' && !ctx.skip?.includes(session.id))
        .sort((left, right) => RANK[rankOf(left)] - RANK[rankOf(right)] || byWord(left, right)),
      chatFields,
    );

    pick.list = ctx.many ? [{ isGo: true }, ...chats] : chats;

    if (pick.typed) {
      if (ctx.many) pick.sel = chats.length ? 1 : 0;
      pick.typed = false;
    } // typing lands on the first match, as the chats step's

    const go = index => {
      const count = ctx.picked.length;
      const ok = count >= (ctx.min || 1);

      return `<div class="pkrow chat new go${ok ? '' : ' off'}${sel(index)}" data-i="${index}" title="${esc(ok ? ctx.goSay(count) : `Take ${ctx.min} chats in at least — ⏎ on one`)}"><span class="sq"></span><span class="n">${esc(ctx.goSay(count))}</span><span class="num"></span><span class="st"></span><span class="t"></span></div>`;
    };

    row = (session, index) => {
      if (session.isGo) return go(index);

      const why = ctx.why?.(session);
      const on = ctx.many && ctx.picked.includes(session.id);

      return `<div class="pkrow chat${why ? ' off' : ''}${on ? ' on' : ''}${sel(index)}" data-i="${index}" data-state="${chatState(session)}" style="${repoStyle(repoColor(session.cwd))}" title="${esc(why ? `Not this one: ${why}` : session.cwd || '')}"><span class="sq"></span><span class="n">${ctx.many ? `<span class="pkon" aria-hidden="true">${on ? '✓' : ''}</span>${on ? '<span class="vh">taken in: </span>' : ''}` : ''}${ticks(mark(session.title))}${idsHit(session, query)}${why ? `<span class="cur">${esc(why)}</span>` : session.id === state.current ? '<span class="cur">current</span>' : ''}</span><span class="num">${projIcon(session.project)}${mark(session.project)}</span><span class="st">${chatState(session)}</span><span class="t" data-at="${esc(wordAt(session))}"></span></div>`;
    };
  } else if (pick.mode === 'chats') {
    // the scope's open chats, ＋ a new one — the row that carries on with the flow
    // A folder that is one git checkout gives ＋ a switch (2026-10-13; ←→ or a click): the new chat in this folder, or in
    // a new worktree on a branch of its own (newChatOnBranch) — the name typed is then the branch's, not a query, so
    // the chats stay as they are, unmarked. ＋ is never filtered out: it is the fallback for a query that matches nothing
    const one = pick.ctx.cwds?.length === 1 && !pick.ctx.env ? pick.ctx.cwds[0] : null;
    const git = one && wtOf(one, () => $('#pick').open && pick.mode === 'chats' && pickRender(true));

    const had = !!pick.git;

    pick.git = git?.main ? git : null;
    if (had !== !!pick.git) pickHint(); // the foot names the switch

    // @ in the box (or the chip's click) lists the agents under ＋ in the chats' place (2026-11-06): what is before it is
    // still the branch on "new worktree"
    const at = atIn();
    const wt = pick.wt && !!pick.git;
    const typed = boxText();

    const aq =
      at >= 0
        ? $('#pickq')
            .value.slice(at + 1)
            .trim()
            .toLowerCase()
        : '';

    const ags = at >= 0 ? agentItems(pick.ag, aq) : [];

    const chats = at >= 0 ? [] : wt ? scopeChats(pick.ctx) : hunt(scopeChats(pick.ctx), chatFields);
    const mk = wt ? text => markHits(text, '') : mark;

    pick.list = [{ isNew: true }, ...ags, ...chats];

    if (pick.typed) {
      pick.sel = at >= 0 ? agentLand(ags, aq) : chats.length && !wt ? 1 : 0;
      pick.typed = false;
    } // typing lands on the first match, else on ＋

    const how = pick.ctx.env
      ? `task ${pick.ctx.env}`
      : pick.ctx.cwds.length === 1
        ? `in ${folderName(pick.ctx.cwds[0])}`
        : 'pick a folder…'; // reads under the chats' own environment column, so say it is a folder

    // ✓ ticks the chat done from here (2026-09-28): the card's rule and route, and the row goes when the server says
    // so. Every row keeps the column.
    const tick = item =>
      item.isNew || !canTick(item)
        ? '<span class="pkdone"></span>'
        : (ends =>
            `<button class="pkdone${ends && armedOn(item.id) ? ' armed' : ''}" data-id="${esc(item.id)}" title="${ends ? esc(`Tick as done — it ends its watch: ${ends}, so it asks once more`) : "Tick as done — it leaves this list and the board's (persisted; comes back on new activity)"}">✓</button>`)(
            watchEnds(item),
          );

    const chip = agentChip(); // who runs it (2026-11-06): the chip that ends ＋'s second line

    const plus = (item, index) => {
      if (!pick.git) {
        return `<div class="pkrow chat ticks new${chip ? ' pk2' : ''}${sel(index)}" data-i="${index}" style="${repoStyle(repoColor(pick.ctx.cwds))}" title="Start a new chat in ${esc(pick.ctx.name)}"><span class="sq"></span><span class="n">＋ new chat</span><span class="num">${esc(how)}</span><span class="st"></span><span class="t"></span>${tick(item)}${chip ? `<span class="pkline">${chip}</span>` : ''}</div>`;
      }

      const on = pick.git.worktrees?.find(tree => tree.path === pick.git.here)?.branch;

      const [label, say, tone] = wt
        ? wtSay(typed)
        : ['＋ new chat', `${how} as it stands${on ? ` — on ${on}` : ''}`, ''];

      const sw = `<span class="pkmode" role="radiogroup" aria-label="Where the new chat works"><button type="button" role="radio" tabindex="-1" data-wt="0" aria-checked="${!wt}">this folder</button><button type="button" role="radio" tabindex="-1" data-wt="1" aria-checked="${wt}">new worktree</button></span>`;
      const tip = `${say ? `${say}\n` : ''}This folder, or a new worktree inside the repo (.claude/worktrees/<branch>) on a branch of its own — a new one from the branch picked next, ${pick.git.dflt || 'main'} first — so the chat shares no files with another · ←→ or a click switches`;

      return `<div class="pkrow chat ticks new sw${wt ? ' wt' : ''}${sel(index)}" data-i="${index}" style="${repoStyle(repoColor(pick.ctx.cwds))}" title="${esc(tip)}"><span class="sq"></span><span class="n">${label}</span><span class="num">${sw}</span><span class="st"></span><span class="t"></span>${tick(item)}<span class="pkline"><span class="cur${tone ? ` ${tone}` : ''}">${esc(say)}</span>${chip && say ? '<span class="pkas">·</span>' : ''}${chip}</span></div>`;
    };

    row = (item, index) =>
      item.isNew
        ? plus(item, index)
        : item.ag || item.agClaude || item.agFold
          ? agentRowHtml(item, index, sel(index), aq, agentCwd(), pick.ag)
          : `<div class="pkrow chat ticks${sel(index)}" data-i="${index}" data-state="${chatState(item)}" style="${repoStyle(repoColor(item.cwd))}" title="${esc(item.cwd || '')}"><span class="sq"></span><span class="n">${ticks(mk(item.title))}${wt ? '' : idsHit(item, query)}${item.id === state.current ? '<span class="cur">current</span>' : ''}</span><span class="num">${item.env ? esc(item.env) : agentTag(item)}</span><span class="st">${chatState(item)}</span><span class="t" data-at="${esc(wordAt(item))}"></span>${tick(item)}</div>`;
  } else if (pick.mode === 'agent') {
    // a PR's chat as an agent (2026-11-06): every agent of the folder, the chats step's rows
    const aq = $('#pickq').value.trim().toLowerCase().replace(/^@/, '');

    pick.list = agentItems(pick.ctx.ag, aq, false);
    row = (item, index) => agentRowHtml(item, index, sel(index), aq, pick.ctx.cwd, pick.ctx.ag);
  } else if (pick.mode === 'base') {
    // what a new worktree's new branch starts from (2026-10-28): the default branch first
    pick.list = hunt(pick.ctx.bases || [], base => [base.name]);

    if (!pick.ctx.bases) {
      $('#picklist').innerHTML = `<div class="none">${esc(pick.ctx.err || 'reading the branches…')}</div>`;
      return;
    }

    row = (base, index) =>
      `<div class="pkrow base${sel(index)}" data-i="${index}" style="${repoStyle(repoColor(pick.ctx.cwd))}" title="${esc(base.ref)}"><span class="sq"></span><span class="n">${mark(base.name)}${base.name.replace(/^origin\//, '') === pick.ctx.dflt ? '<span class="cur">default</span>' : ''}</span><span class="num">${base.where === 'origin' ? 'origin' : 'here'}</span><span class="t" data-at="${esc(base.at || '')}"></span></div>`;
  } else if (pick.mode === 'folder') {
    // the new chat's folder, from a project that spans several
    pick.list = hunt(
      pick.ctx.cwds.map(cwd => ({ cwd })),
      item => [folderName(item.cwd), item.cwd],
    );

    row = (item, index) =>
      `<div class="pkrow${sel(index)}" data-i="${index}" style="${repoStyle(repoColor(item.cwd))}" title="${esc(item.cwd)}"><span class="sq"></span><span class="n">${mark(folderName(item.cwd))}<span class="cur">${esc(homePath(item.cwd))}</span></span><span class="pills"></span><span class="t"></span></div>`;
  } else if (pick.mode === 'env') {
    // the new chat's environment: a launcher of the folder's Taskfile (task <name>)
    pick.list = hunt(pick.ctx.launchers, launcher => [launcher.name, launcher.desc]);

    // …each with what the next step would show under it: the board's own pills, clauding first, then ready — the
    // count of this environment's chats that are not ticked done, so an environment already busy says so here.
    row = (launcher, index) =>
      `<div class="pkrow env${sel(index)}" data-i="${index}" style="${repoStyle(repoColor(pick.ctx.cwd))}" title="task ${esc(launcher.name)} in ${esc(pick.ctx.cwd)}"><span class="sq"></span><span class="n">${mark(launcher.name)}</span><span class="num">${mark(launcher.desc)}</span><span class="pills">${pillsHtml(envCounts(pick.ctx.cwd, launcher.name))}</span></div>`;
  } else {
    // project — and new, the same rows without ALL and without a named project that has no folder yet,
    // then the org's folders that are on no project, then ＋ clone for a name that is neither
    const board = projectList().filter(
      project => pick.mode === 'project' || (project.key !== ALL && project.cwds.length),
    );

    const items = pick.mode === 'new' ? [...board, ...freeFolders()] : board;

    const none =
      pick.mode === 'new' && state.about.scratch ? [{ noFolder: true, name: NO_FOLDER, cwd: state.about.scratch }] : []; // ＋ a chat in no folder, first (2026-10-14)

    // …as Claude or an agent (2026-11-06): its chip, as ＋'s in the chats step — a click or @ lists them under it, alone
    const at = atIn();

    const aq =
      at >= 0
        ? $('#pickq')
            .value.slice(at + 1)
            .trim()
            .toLowerCase()
        : '';

    const ags = at >= 0 ? agentItems(pick.ag, aq) : null;

    pick.list = ags
      ? [...none, ...ags]
      : hunt([...none, ...items], project => (project.folder ? [project.name, homePath(project.cwd)] : [project.name]));

    if (ags && pick.typed) {
      pick.sel = agentLand(ags, aq);
      pick.typed = false;
    }

    if (pick.mode === 'new' && !ags) pick.list = [...pick.list, ...cloneRows(items)];
    const chip = none.length ? agentChip() : '';

    if (pick.mode === 'project') pick.list = [...pick.list, { newProject: true }]; // ＋ new project, last and never filtered out

    // ✕ on every row of ⌥⌘N that names a project or a folder — never on ＋ clone, which is not on the board yet.
    const hx = project =>
      pick.mode !== 'new'
        ? ''
        : `<button class="pkx" data-key="${esc(project.key)}" title="Take ${esc(project.name)} off the board — every picker stops listing it; its chats stay under ALL and the settings (⌘,) put it back">✕</button>`;

    const ed = project =>
      pick.mode === 'project' && project.custom
        ? `<button class="pked" data-id="${esc(project.id)}" title="Edit ${esc(project.name)} — its name and folders">✎</button>`
        : '';

    row = (item, index) =>
      item.ag || item.agClaude || item.agFold
        ? agentRowHtml(item, index, sel(index), aq, agentCwd(), pick.ag)
        : item.noFolder
          ? `<div class="pkrow nofolder pk2${sel(index)}" data-i="${index}" title="A chat that belongs to no folder — claude starts at once in the board's own, ${esc(homePath(item.cwd))}${chip ? ' · the chip, or @, for an agent to run it' : ''}"><span class="sq"></span><span class="n">${ags ? esc(item.name) : mark(item.name)}</span><span class="pills"></span><span class="t"></span><span class="pkline"><span class="cur">${esc(homePath(item.cwd))}</span>${chip ? `<span class="pkas">·</span>${chip}` : ''}</span></div>`
          : item.newProject
            ? `<div class="pkrow newproj${sel(index)}" data-i="${index}" title="A name over one or more folders — multi-repo work, an investigation"><span class="sq"></span><span class="n">＋ new project<span class="cur">a name over several folders</span></span><span class="pills"></span><span class="t"></span></div>`
            : item.clone
              ? `<div class="pkrow clone${sel(index)}" data-i="${index}" title="gh repo clone ${esc(item.org)}/${esc(item.name)} into ${esc(homePath(item.root))}"><span class="sq"></span><span class="n">＋ clone ${esc(item.org)}/${esc(item.name)}<span class="cur">into ${esc(homePath(item.root))}</span></span><span class="pills"></span><span class="t"></span></div>`
              : item.folder
                ? `<div class="pkrow folder${pick.mode === 'new' ? ' hides' : ''}${sel(index)}" data-i="${index}" style="${repoStyle(repoColor(item.cwd))}" title="${esc(item.cwd)}"><span class="sq"></span><span class="n">${projIcon(item.name)}${mark(item.name)}<span class="cur">${esc(homePath(item.cwd))}</span></span><span class="pills"></span><span class="t"></span>${hx(item)}</div>`
                : `<div class="pkrow${pick.mode === 'new' ? ' hides' : ''}${ed(item) ? ' named' : ''}${sel(index)}" data-i="${index}" style="${repoStyle(projColor(item))}"><span class="sq"></span><span class="n">${projIcon(item.name)}${mark(item.name)}${item.key === prefs.project ? '<span class="cur">current</span>' : ''}</span><span class="pills">${pillsHtml(item)}</span><span class="t"${item.last ? ` data-at="${esc(item.last)}"` : ''}></span>${hx(item)}${ed(item)}</div>`;
  }

  const same = (item, other) =>
    item.isNew
      ? other.isNew
      : item.ag || item.agFold || item.agClaude
        ? (item.ag && item.ag === other.ag) ||
          (item.agFold && item.agFold === other.agFold) ||
          (item.agClaude && other.agClaude)
        : pick.mode !== 'new' && pick.mode !== 'project'
          ? item.id === other.id // ⌥⌘N's and ⌥⌘P's rows: a project by its key (a folder's has no id), no folder and a clone as themselves
          : item.noFolder || other.noFolder
            ? !!(item.noFolder && other.noFolder)
            : item.clone || other.clone
              ? !!(item.clone && other.clone) && item.root === other.root
              : item.newProject || other.newProject
                ? !!(item.newProject && other.newProject)
                : item.key === other.key;

  if (was) {
    const index = pick.list.findIndex(item => same(item, was));

    if (index >= 0) pick.sel = index;
  }

  pick.sel = Math.max(0, Math.min(pick.sel, pick.list.length - 1));
  const rows = pick.list.map(row);

  const asked = pick.mode === 'chat' && pick.named;

  const reading = !asked
    ? ''
    : !asked.ids
      ? "reading every chat's transcript for this PR…"
      : asked.err
        ? `the transcripts could not be read: ${asked.err}`
        : '';

  $('#picklist').innerHTML =
    rows.join('') + (reading && `<div class="none">${esc(reading)}</div>`) ||
    `<div class="none">no ${PICK_NOUN[pick.mode] || 'project'} matches</div>`;

  fillAges($('#picklist'));
  $('#picklist .pkrow.sel')?.scrollIntoView({ block: 'nearest' });
}

function pickChoose(index) {
  if (pick.cloning) return; // a step under way (2026-11-04): a press meanwhile is the same press — each was a chat of its own

  const item = pick.list[index];
  const dlg = $('#pick');

  if (['launch', 'toggle', 'prs'].includes(pick.mode)) return launchChoose(item);

  if (pick.mode === 'base') {
    // nothing matched: the step stays; ⏎ before the branches are read takes the default once they are
    if (!pick.ctx.bases) pick.ctx.go = !$('#pickq').value.trim();
    else if (item) newChatOnBranch(pick.ctx.cwd, pick.ctx.branch, { base: item.ref, agent: pick.ctx.agent });
    return;
  }

  if (!item && pick.mode === 'chat' && pick.named && !pick.named.ids) {
    pick.named.go = true;
    return;
  } // the answer opens the first it names

  if (!item) {
    dlg.close();
    return;
  }

  if (pick.mode === 'pr') {
    dlg.close();
    showPr(item.url);
  } else if (pick.mode === 'chat') {
    dlg.close();
    openSession(item.id, { locate: true });
  } else if (pick.mode === 'chatpick') {
    const ctx = pick.ctx;

    if (item.isGo) {
      if (ctx.picked.length < (ctx.min || 1)) {
        return note($('#pickq'), `Take ${ctx.min} chats in at least — ⏎ on a chat takes it in`, true);
      }

      dlg.close();
      return ctx.go(ctx.picked.slice());
    }

    const no = ctx.why?.(item);

    if (no) return note($('#pickq'), `Not this one: ${no}`, true);

    if (ctx.many) {
      const pickedAt = ctx.picked.indexOf(item.id);

      if (pickedAt < 0) ctx.picked.push(item.id);
      else ctx.picked.splice(pickedAt, 1);
      $('#pickq').value = '';
      pickHint();
      return pickRender(true);
    }

    dlg.close();
    ctx.then(item);
  } else if (pick.mode === 'new') {
    // a project's, or a folder's, open chats with ＋ a new one — or the clone first
    if (item.ag || item.agClaude) return agentTake(item.ag ? item.ag.name : null); // no folder's chip's (2026-11-06)

    if (item.agFold) {
      pick.unfold.add(item.agFold);
      return pickRender();
    }

    if (item.noFolder) {
      noFolderChat(item.cwd);
    } // straight in: no chats step, and no Taskfile to ask
    else if (item.clone) cloneAndStart(item);
    else chatsStep({ key: item.key, name: item.name, cwds: item.cwds });
  } else if (pick.mode === 'chats') {
    if (item.ag || item.agClaude) return agentTake(item.ag ? item.ag.name : null); // the chip's, and the chats back (2026-11-06)

    if (item.agFold) {
      pick.unfold.add(item.agFold);
      return pickRender();
    }

    if (item.isNew && pick.wt && pick.git) wtEnter(pick.ctx.cwds[0], boxText());
    else if (item.isNew) newFromChats(pick.ctx);
    else {
      dlg.close();
      openSession(item.id, { locate: true });
    }
  } else if (pick.mode === 'agent') {
    if (item.agFold) {
      pick.unfold.add(item.agFold);
      pickRender();
    } else {
      dlg.close();
      pick.ctx.then(item.ag.name);
    }
  } else if (pick.mode === 'folder') newChatIn(item.cwd, pick.ctx.then);
  else if (pick.mode === 'env') {
    // from ⌥⌘O the environment scopes the chats step; from ⌥⌘N it was the last thing asked
    if (pick.ctx.then === 'chats') {
      chatsStep({ key: pick.ctx.cwd, name: folderName(pick.ctx.cwd), cwds: [pick.ctx.cwd], env: item.name });
    } else {
      dlg.close();
      newChat(pick.ctx.cwd, item.name);
    }
  } else if (item.newProject) {
    dlg.close();
    openProjectEditor(null);
  } else {
    dlg.close();
    selectProject(item.key);
  }
}

// The open chats of a step's scope — a project (its own rule: a folder is its exact cwd, a named project its
// folders) narrowed to one environment when ⌥⌘O picked one — by your last touch, newest first. Done chats stay out.
const scopeChats = ctx => {
  const project = projectStub(ctx.key);

  return [...state.sessions.values()]
    .filter(
      session =>
        visible(session) &&
        bucket(session) !== 'done' &&
        inProject(session, project) &&
        (!ctx.env || session.env === ctx.env),
    )
    .sort(byWord);
};

const chatsStep = ctx => pickOpen('chats', ctx); // even with nothing to choose between: ＋ new chat alone, and esc

// What the chats step would show under one environment, split the way the column's pills split a project.
const envCounts = (cwd, env) => {
  const chats = scopeChats({ key: cwd, env });

  return {
    working: chats.filter(session => bucket(session) === 'working').length,
    ready: chats.filter(session => bucket(session) === 'ready').length,
  };
};

/** ⌥⌘N's chat in no folder, as its chip says (2026-11-06) — the agents waited on for a quick ⏎, as newFromChats does. */
async function noFolderChat(cwd) {
  if (!pick.ag && pick.agLoad) {
    const gen = pick.gen;

    pick.cloning = true;
    await pick.agLoad;
    if (gen !== pick.gen || !$('#pick').open) return;
    pick.cloning = false;
  }

  const agent = agentGo();

  $('#pick').close();
  newChat(cwd, null, withAgent(agent));
}

// ＋ new chat, from wherever the flow had got to: the environment is already answered, or the folder is, or neither.
async function newFromChats(ctx) {
  if (ctx.env) {
    $('#pick').close();
    newChat(ctx.cwds[0], ctx.env);
  } else if (ctx.cwds.length === 1) {
    if (!pick.ag && pick.agLoad) {
      // the chip's agent, not none for a quick ⏎ — and a second ⏎ meanwhile is this one (pick.cloning)
      const gen = pick.gen;

      pick.cloning = true;
      await pick.agLoad;
      if (gen !== pick.gen || !$('#pick').open) return;
      pick.cloning = false;
    }

    newChatIn(ctx.cwds[0], 'new', agentGo());
  } else pickOpen('folder', { cwds: ctx.cwds });
}

// Typing filters the chats, not ＋, so the selection moves off it and onto the first match — and falls back to
// ＋ (the clamp below) when nothing matches, which is the thing to do with a name no chat has yet. On "new worktree"
// it names the branch: ＋ stays selected, and where that branch is already is asked (brAsk).
$('#pickq').addEventListener('input', () => {
  pick.sel = 0;

  pick.typed =
    (pick.mode === 'chats' || pick.mode === 'chatpick' || (pick.mode === 'new' && atIn() >= 0)) &&
    !!$('#pickq').value.trim();

  namedAsk();
  if (pick.mode === 'chats' || pick.mode === 'new') pickHint();
  pickRender();
  brAsk();
});

// ＋'s switch takes ← and → past the box's ends (2026-10-13): → with the caret at the end goes to "new worktree" (and
// onto ＋, from any row), ← with it at the start back to "this folder"; inside the text they move the caret.
const caretAt = end => {
  const box = $('#pickq');

  return box.selectionStart === box.selectionEnd && box.selectionStart === (end ? box.value.length : 0);
};

$('#pickq').addEventListener('keydown', event => {
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    pick.sel++;
    pickRender();
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    pick.sel--;
    pickRender();
  } else if (event.key === 'ArrowRight' && pick.list[pick.sel]?.agFold && caretAt(true)) {
    event.preventDefault();
    pickChoose(pick.sel);
  } // → opens a folded row of agents (2026-11-06)
  else if (
    (event.key === 'ArrowRight' || event.key === 'ArrowLeft') &&
    pick.mode === 'chats' &&
    pick.git &&
    atIn() < 0 &&
    !(event.altKey || event.metaKey || event.ctrlKey || event.shiftKey) &&
    caretAt(event.key === 'ArrowRight')
  ) {
    if (pickWt(event.key === 'ArrowRight')) event.preventDefault();
  } else if (
    event.key === 'Enter' &&
    event.altKey &&
    pick.list[pick.sel]?.kind === 'pr' &&
    pick.list[pick.sel].pr.refs
  ) {
    event.preventDefault();

    const pr = pick.list[pick.sel].pr;
    const session = state.sessions.get(pr.chatId);

    if (session) chatOnPr(session, pr.url, $('#pickq'));
  } // ⌥⏎ on a PR: a chat on its branch
  else if (event.key === 'Enter') {
    event.preventDefault();
    pickChoose(pick.sel);
  }
  // the launcher's menus (2026-10-10): → into a row with ›, ← or ⌫ on an empty box back out to where it came from
  else if (
    event.key === 'ArrowRight' &&
    pick.mode === 'launch' &&
    !$('#pickq').value &&
    pick.list[pick.sel]?.kind === 'menu' &&
    !pick.list[pick.sel].leaf
  ) {
    event.preventDefault();
    pickChoose(pick.sel);
  } else if ((event.key === 'ArrowLeft' || event.key === 'Backspace') && !$('#pickq').value && pick.ctx.back) {
    event.preventDefault();
    typeof pick.ctx.back === 'function' ? pick.ctx.back() : pickOpen(pick.ctx.back);
  }
});

$('#picklist').addEventListener('click', event => {
  if (pick.cloning) return; // as pickChoose: the rows are dimmed, and take nothing until it answers
  const hide = event.target.closest('.pkx'); // ✕: the row goes off the board, the picker stays where it is

  if (hide) {
    event.stopPropagation();
    hideProject(hide.dataset.key);
    pickRender();
    return;
  }

  const md = event.target.closest('.pkmode button'); // ＋'s switch: this folder or a new worktree, the box keeping the keys

  if (md) {
    event.stopPropagation();
    pickWt(md.dataset.wt === '1');
    $('#pickq').focus();
    return;
  }

  const ag = event.target.closest('.pkag'); // ＋'s chip (2026-11-06): the agents under it, or shut again

  if (ag) {
    event.stopPropagation();
    if (!ag.classList.contains('off')) agentList();
    $('#pickq').focus();
    return;
  }

  // ✓: the chat is ticked done and the picker stays up — the row leaves on the server's `session` event. A double
  // click's second press would land on the row that slid up under the pointer, so only a single one counts.
  const pc = event.target.closest('button.pkchat'); // a PR's Chat (2026-10-13): a new chat on its branch

  if (pc) {
    event.stopPropagation();
    const session = state.sessions.get(pc.dataset.chat);

    if (session) chatOnPr(session, pc.dataset.url, pc);
    return;
  }

  const dn = event.target.closest('button.pkdone');

  if (dn) {
    event.stopPropagation();
    $('#pickq').focus();
    if (event.detail <= 1) tickDone(dn.dataset.id, true, dn);
    return;
  }

  const ed = event.target.closest('.pked'); // ✎: the picker gives way to the project's editor

  if (ed) {
    event.stopPropagation();
    $('#pick').close();
    openProjectEditor(ed.dataset.id);
    return;
  }

  const row = event.target.closest('.pkrow');

  if (row) pickChoose(+row.dataset.i);
});

$('#pick').addEventListener('click', event => {
  if (event.target === event.currentTarget) event.currentTarget.close();
}); // a click on the backdrop

$('#pick').addEventListener('close', () => {
  pick.gen++;
  pick.cloning = false;
  $('#pickq').disabled = false;
}); // a clone under way answers to a note
