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
    const n = ++folders.asked;   // only the newest question's answer: an older one held the roots just removed
    try {
      const d = await api('GET', '/api/folders');
      if (n !== folders.asked) return;
      Object.assign(folders, { roots: d.roots || [], list: d.folders || [] });
      if ($('#pick').open && pick.mode === 'new') { pickHint(); pickRender(); }   // the box named no directory until now
    } catch {}
  }
  /** The folders that are not already a project on the board — matched by the exact folder, so a repo whose chats all
   *  live in a subfolder of it is still offered at its root, which is a different place to start. Not a worktree
   *  (2026-10-09): one with a chat is a project already, and the rest are offered only by their whole name (cloneRows). */
  const freeFolders = () => {
    const taken = new Set(projectList().flatMap(p => p.cwds));
    return folders.list.filter(f => !f.worktree && !taken.has(f.cwd) && !isHidden(f.cwd)).map(f => ({ key: f.cwd, name: f.name, cwd: f.cwd, cwds: [f.cwd], folder: true }));
  };
  const CLONE_NAME = /^[A-Za-z0-9][\w.-]*$/;   // the server's own rule for a name it will clone — no row it would refuse
  /** ＋ clone, last and never filtered out: a name that is no folder here is a repo of an org you have not cloned — a
   *  row per root that has an org. The query as typed, not lowercased — a repository has a name, not a spelling. */
  function cloneRows(items) {
    const name = $('#pickq').value.trim();
    if (!name || !CLONE_NAME.test(name)) return [];
    if (items.some(x => x.name.toLowerCase() === name.toLowerCase())) return [];
    // a folder of that name that is here but hidden (✕) is offered as itself — starting a chat there puts it back — not
    // as a clone gh would refuse: "destination already exists" (2026-10-03)
    const here = folders.list.filter(f => f.name.toLowerCase() === name.toLowerCase());
    if (here.length) return here.map(f => ({ key: f.cwd, name: f.name, cwd: f.cwd, cwds: [f.cwd], folder: true }));
    return folders.roots.filter(r => r.org).map(r => ({ clone: true, name, root: r.dir, org: r.org }));
  }
  // The clone itself, then the same flow as any folder: its chats (none, freshly cloned) and ＋ a new one, so the
  // chat starts without another keystroke. The server answers only when git is done — a big repo takes a while — so
  // the box says what is happening, and the list holds the answer when it goes wrong.
  // The answer acts on the picker only while it is still that clone's (2026-10-03: closed meanwhile, the next picker
  // opened with a box that would not type, and the clone's chats step popped up over whatever was there minutes later).
  async function cloneAndStart({ name, root, org }) {
    const q = $('#pickq'), was = q.placeholder, run = ++pick.gen;
    q.value = ''; q.placeholder = `cloning ${org}/${name}…`; q.disabled = true; pick.cloning = true;
    const dir = `${root}/${name}`; if (!state.clones.has(dir)) state.clones.set(dir, { ref: `${org}/${name}`, dir, phase: null, percent: 0 });
    $('#picklist').innerHTML = `<div class="none clonebox" data-dir="${esc(dir)}">cloning ${esc(org)}/${esc(name)} into ${esc(homePath(root))} — a big repo takes a while…<span class="cp"></span><i class="cbar"></i></div>`;
    cloneShown();
    let d;
    try { d = await api('POST', '/api/clone', { name, root }); } catch (e) { d = { error: e.message }; }
    if (d.cwd) loadFolders();
    if (run !== pick.gen || !$('#pick').open) { note($('#shead'), d.cwd ? `Cloned ${org}/${name} — ⌥⌘N starts a chat there` : `Could not clone ${org}/${name}: ${d.error || 'the server said no'}`, !d.cwd); return; }
    pick.cloning = false; q.disabled = false; q.placeholder = was; q.focus();
    if (!d.cwd) { $('#picklist').innerHTML = `<div class="none">could not clone ${esc(org)}/${esc(name)} — ${esc(d.error || 'the server said no')}</div>`; return; }
    chatsStep({ key: d.cwd, name, cwds: [d.cwd] });
  }
  // A box says what it searches (2026-10-12): the scope in the placeholder, and the launcher's prefixes in a line under
  // its list, which a placeholder cut off at "@ proje".
  const PICK_FOOT = {
    launch: '<kbd>&gt;</kbd> actions and switches <kbd>#</kbd> PRs <kbd>@</kbd> projects <kbd>!</kbd> tickets <s>·</s> <kbd>→</kbd> into a menu',
    chats: () => atIn() >= 0 ? '<kbd>⏎</kbd> takes the agent, the chats come back <s>·</s> <kbd>⌫</kbd> on the <kbd>@</kbd> goes back without one'
      : [pick.git && (agentsHere() ? '<kbd>←</kbd><kbd>→</kbd> this folder or a new worktree' : '<kbd>←</kbd><kbd>→</kbd> ＋ new chat in this folder, or in a new worktree on a branch of its own'), agentsHere() && '<kbd>@</kbd> an agent to run it'].filter(Boolean).join(' <s>·</s> '),
    base: '<kbd>⏎</kbd> a worktree from the branch selected <s>·</s> <kbd>←</kbd> back to its name',
    new: () => atIn() >= 0 ? '<kbd>⏎</kbd> takes the agent for a chat in no folder <s>·</s> <kbd>⌫</kbd> on the <kbd>@</kbd> goes back without one' : '',
  };
  const pickHint = () => {
    const h = PICK_HINT[pick.mode], t = typeof h === 'function' ? h(pick.ctx) : h; $('#pickq').placeholder = pick.ctx.back && !/← back/.test(t) ? t.replace(/ · esc$/, ' · ← back · esc') : t;
    const g = PICK_FOOT[pick.mode], f = (typeof g === 'function' ? g() : g) || '';
    $('#pickfoot').hidden = !f; if (f && $('#pickfoot').innerHTML !== f) $('#pickfoot').innerHTML = f;
  };
  function pickOpen(mode = 'project', ctx = {}) {
    const dlg = $('#pick');
    if (!dlg.open) {   // a step of the new-chat flow re-fills the open dialog; a hotkey never gets here with one up
      if (inApp) post({ type: 'focus' });   // the key may have come from the pane: the box needs the board's keyboard
      dlg.showModal(); repostPane();        // the pane goes down while it is up, so the dialog is centred and on top
    }
    pick.mode = mode; pick.ctx = ctx; pick.sel = 0; pick.gen++; pick.cloning = false; pick.git = null; pick.wt = false; pick.br = null; pick.named = null; $('#pickq').disabled = false;
    pick.ag = mode === 'agent' ? ctx.ag : null; pick.agent = null; pick.agentTouched = false; pick.unfold = new Set();
    if (mode === 'new') loadFolders();   // the org's folders, fresh: the rows join the list when the answer lands
    if (mode === 'chats' || mode === 'new') pickAgents(); else if (mode === 'launch') launchAgents();
    $('#pickq').value = ''; pickHint();
    pickRender(); $('#pickq').focus();
    // ⌥⌘N starts on the project in view (2026-09-28, with ＋ gone): ⏎ takes it, a second ⏎ is a new chat there
    if (mode === 'new' && prefs.project !== ALL) { const i = pick.list.findIndex(x => x?.key === prefs.project); if (i > 0) { pick.sel = i; pickRender(); } }
    // ⌥⌘G from a PR's page (2026-10-16): the one after it selected, so ⌥⌘G ⏎ walks the chat's PRs, the last back to the first
    if (mode === 'pr' && ctx.at) { const i = pick.list.findIndex(pr => pr.url === ctx.at); if (i >= 0) { pick.sel = (i + 1) % pick.list.length; pickRender(); } }
  }
  /** `keep`: a redraw the server caused, not the keys — the selection stays on the chat it was on, wherever the list
   *  moved it; a chat that left gives its place to the one that slid up into it. */
  function pickRender(keep = false) {
    if (pick.cloning) return;   // the box says what is happening until the clone answers
    const was = keep ? pick.list[pick.sel] : null;
    const q = $('#pickq').value.trim().toLowerCase();
    const mark = text => markHits(text, q);
    // With something typed the best match leads; with the box empty each list keeps its own order (the board's for
    // chats, mention order for PRs, the Taskfile's for environments). Ties go to whichever came first in that order.
    const hunt = (items, fields, worth = () => 1) => { if (!q) return items; const hits = []; items.forEach((x, i) => { const m = fuzzy(fields(x), q); if (m) hits.push([m.score * worth(x), i, x]); }); return hits.sort((a, b) => b[0] - a[0] || a[1] - b[1]).map(h => h[2]); };
    const sel = i => i === pick.sel ? ' sel' : '';
    let row;   // each mode fills pick.list and says how a row of it is drawn; the selection is clamped once, below
    if (pick.mode === 'launch' || pick.mode === 'toggle' || pick.mode === 'prs') {   // ⌥⌘L (2026-10-10): the launcher, its switches, every chat's PRs
      const raw = $('#pickq').value, lq = raw.replace(/^[>#@!]/, '').trim().toLowerCase();
      pick.list = pick.mode === 'launch' ? launchRows(raw) : pick.mode === 'toggle' ? hunt(toggleRows(), t => [t.name]) : hunt(allPrs(), pr => [pr.label, pr.title || '', pr.chat || '']).map(pr => ({ kind: 'pr', id: 'pr:' + pr.url, pr }));
      row = (x, i) => launchRow(x, i, sel, text => markHits(text, lq));
    } else if (pick.mode === 'pr') {
      pick.list = hunt(state.sessions.get(state.current)?.prs || [], pr => [pr.label, pr.title || '']);
      row = (pr, i) => `<div class="pkrow pr${sel(i)}" data-i="${i}" data-state="${esc(pr.state || '')}" title="${esc(pr.url)}"><span class="st">${esc(pr.state || 'PR')}</span><span class="num">${mark(pr.label)}</span><span class="n${pr.title ? '' : ' pending'}">${pr.title ? mark(pr.title) : 'title on its way from gh…'}${pr.url === (pick.ctx.at || shownPr.url) ? '<span class="cur">current</span>' : ''}</span><span class="t" data-at="${esc(pr.lastAt || '')}"></span></div>`;
    } else if (pick.mode === 'chat') {
      const order = (a, b) => (RANK[rankOf(a)] - RANK[rankOf(b)]) || byWord(a, b);
      const found = hunt([...state.sessions.values()].filter(s => (visible(s) && (q || bucket(s) !== 'done')) || (q && s.removed)).sort(order), chatFields, s => doneWorth(s, q));
      const named = (pick.named?.ids || []).map(id => state.sessions.get(id)).filter(s => s && !found.includes(s)).sort(order);   // what the chips did not know
      pick.list = [...found, ...named];
      row = (s, i) => `<div class="pkrow chat${sel(i)}" data-i="${i}" data-state="${chatState(s)}" style="${repoStyle(repoColor(s.cwd))}" title="${esc(s.cwd || '')}"><span class="sq"></span><span class="n">${ticks(mark(s.title))}${agentTag(s, 'cur runas')}${idsHit(s, q)}${named.includes(s) ? '<span class="cur ids">named in its transcript</span>' : ''}${asleep(s) ? `<span class="cur zzt">${ICON.moon}snoozed ${esc(snoozeSay(s.snooze))}</span>` : ''}${s.removed ? '<span class="cur">deleted from the board</span>' : ''}${s.id === state.current ? '<span class="cur">current</span>' : ''}</span><span class="num">${projIcon(s.project)}${mark(s.project)}</span><span class="st">${chatState(s)}</span><span class="t" data-at="${esc(wordAt(s))}"></span></div>`;
    } else if (pick.mode === 'chatpick') {   // a chat to send to (2026-10-31): ⌥⌘K's rows, one it cannot go to dimmed and saying why
      // …or several to merge (`many`): ⏎ takes one in or out, ✓ before it; the first row goes on with those taken in
      const c = pick.ctx;
      const chats = hunt([...state.sessions.values()].filter(s => visible(s) && bucket(s) !== 'done' && !c.skip?.includes(s.id)).sort((a, b) => (RANK[rankOf(a)] - RANK[rankOf(b)]) || byWord(a, b)), chatFields);
      pick.list = c.many ? [{ isGo: true }, ...chats] : chats;
      if (pick.typed) { if (c.many) pick.sel = chats.length ? 1 : 0; pick.typed = false; }   // typing lands on the first match, as the chats step's
      const go = i => { const n = c.picked.length, ok = n >= (c.min || 1); return `<div class="pkrow chat new go${ok ? '' : ' off'}${sel(i)}" data-i="${i}" title="${esc(ok ? c.goSay(n) : `Take ${c.min} chats in at least — ⏎ on one`)}"><span class="sq"></span><span class="n">${esc(c.goSay(n))}</span><span class="num"></span><span class="st"></span><span class="t"></span></div>`; };
      row = (s, i) => { if (s.isGo) return go(i); const why = c.why?.(s), on = c.many && c.picked.includes(s.id); return `<div class="pkrow chat${why ? ' off' : ''}${on ? ' on' : ''}${sel(i)}" data-i="${i}" data-state="${chatState(s)}" style="${repoStyle(repoColor(s.cwd))}" title="${esc(why ? `Not this one: ${why}` : s.cwd || '')}"><span class="sq"></span><span class="n">${c.many ? `<span class="pkon" aria-hidden="true">${on ? '✓' : ''}</span>${on ? '<span class="vh">taken in: </span>' : ''}` : ''}${ticks(mark(s.title))}${idsHit(s, q)}${why ? `<span class="cur">${esc(why)}</span>` : s.id === state.current ? '<span class="cur">current</span>' : ''}</span><span class="num">${projIcon(s.project)}${mark(s.project)}</span><span class="st">${chatState(s)}</span><span class="t" data-at="${esc(wordAt(s))}"></span></div>`; };
    } else if (pick.mode === 'chats') {   // the scope's open chats, ＋ a new one — the row that carries on with the flow
      // A folder that is one git checkout gives ＋ a switch (2026-10-13; ←→ or a click): the new chat in this folder, or in
      // a new worktree on a branch of its own (newChatOnBranch) — the name typed is then the branch's, not a query, so
      // the chats stay as they are, unmarked. ＋ is never filtered out: it is the fallback for a query that matches nothing
      const one = pick.ctx.cwds?.length === 1 && !pick.ctx.env ? pick.ctx.cwds[0] : null, git = one && wtOf(one, () => $('#pick').open && pick.mode === 'chats' && pickRender(true));
      const had = !!pick.git; pick.git = git?.main ? git : null; if (had !== !!pick.git) pickHint();   // the foot names the switch
      // @ in the box (or the chip's click) lists the agents under ＋ in the chats' place (2026-11-06): what is before it is
      // still the branch on "new worktree"
      const at = atIn(), wt = pick.wt && !!pick.git, typed = boxText(), aq = at >= 0 ? $('#pickq').value.slice(at + 1).trim().toLowerCase() : '';
      const ags = at >= 0 ? agentItems(pick.ag, aq) : [];
      const chats = at >= 0 ? [] : wt ? scopeChats(pick.ctx) : hunt(scopeChats(pick.ctx), chatFields), mk = wt ? t => markHits(t, '') : mark;
      pick.list = [{ isNew: true }, ...ags, ...chats];
      if (pick.typed) { pick.sel = at >= 0 ? agentLand(ags, aq) : chats.length && !wt ? 1 : 0; pick.typed = false; }   // typing lands on the first match, else on ＋
      const how = pick.ctx.env ? `task ${pick.ctx.env}` : pick.ctx.cwds.length === 1 ? `in ${folderName(pick.ctx.cwds[0])}` : 'pick a folder…';   // reads under the chats' own environment column, so say it is a folder
      // ✓ ticks the chat done from here (2026-09-28): the card's rule and route, and the row goes when the server says
      // so. Every row keeps the column.
      const tick = x => x.isNew || !canTick(x) ? '<span class="pkdone"></span>' : (e => `<button class="pkdone${e && armedOn(x.id) ? ' armed' : ''}" data-id="${esc(x.id)}" title="${e ? esc(`Tick as done — it ends its watch: ${e}, so it asks once more`) : 'Tick as done — it leaves this list and the board\'s (persisted; comes back on new activity)'}">✓</button>`)(watchEnds(x));
      const chip = agentChip();   // who runs it (2026-11-06): the chip that ends ＋'s second line
      const plus = (x, i) => {
        if (!pick.git) return `<div class="pkrow chat ticks new${chip ? ' pk2' : ''}${sel(i)}" data-i="${i}" style="${repoStyle(repoColor(pick.ctx.cwds))}" title="Start a new chat in ${esc(pick.ctx.name)}"><span class="sq"></span><span class="n">＋ new chat</span><span class="num">${esc(how)}</span><span class="st"></span><span class="t"></span>${tick(x)}${chip ? `<span class="pkline">${chip}</span>` : ''}</div>`;
        const on = pick.git.worktrees?.find(t => t.path === pick.git.here)?.branch;
        const [n, say, tone] = wt ? wtSay(typed) : ['＋ new chat', `${how} as it stands${on ? ` — on ${on}` : ''}`, ''];
        const sw = `<span class="pkmode" role="radiogroup" aria-label="Where the new chat works"><button type="button" role="radio" tabindex="-1" data-wt="0" aria-checked="${!wt}">this folder</button><button type="button" role="radio" tabindex="-1" data-wt="1" aria-checked="${wt}">new worktree</button></span>`;
        const tip = `${say ? `${say}\n` : ''}This folder, or a new worktree inside the repo (.claude/worktrees/<branch>) on a branch of its own — a new one from the branch picked next, ${pick.git.dflt || 'main'} first — so the chat shares no files with another · ←→ or a click switches`;
        return `<div class="pkrow chat ticks new sw${wt ? ' wt' : ''}${sel(i)}" data-i="${i}" style="${repoStyle(repoColor(pick.ctx.cwds))}" title="${esc(tip)}"><span class="sq"></span><span class="n">${n}</span><span class="num">${sw}</span><span class="st"></span><span class="t"></span>${tick(x)}<span class="pkline"><span class="cur${tone ? ` ${tone}` : ''}">${esc(say)}</span>${chip && say ? '<span class="pkas">·</span>' : ''}${chip}</span></div>`;
      };
      row = (x, i) => x.isNew ? plus(x, i) : x.ag || x.agClaude || x.agFold ? agentRowHtml(x, i, sel(i), aq, agentCwd(), pick.ag)
        : `<div class="pkrow chat ticks${sel(i)}" data-i="${i}" data-state="${chatState(x)}" style="${repoStyle(repoColor(x.cwd))}" title="${esc(x.cwd || '')}"><span class="sq"></span><span class="n">${ticks(mk(x.title))}${wt ? '' : idsHit(x, q)}${x.id === state.current ? '<span class="cur">current</span>' : ''}</span><span class="num">${x.env ? esc(x.env) : agentTag(x)}</span><span class="st">${chatState(x)}</span><span class="t" data-at="${esc(wordAt(x))}"></span>${tick(x)}</div>`;
    } else if (pick.mode === 'agent') {   // a PR's chat as an agent (2026-11-06): every agent of the folder, the chats step's rows
      const aq = $('#pickq').value.trim().toLowerCase().replace(/^@/, '');
      pick.list = agentItems(pick.ctx.ag, aq, false);
      row = (x, i) => agentRowHtml(x, i, sel(i), aq, pick.ctx.cwd, pick.ctx.ag);
    } else if (pick.mode === 'base') {   // what a new worktree's new branch starts from (2026-10-28): the default branch first
      pick.list = hunt(pick.ctx.bases || [], b => [b.name]);
      if (!pick.ctx.bases) { $('#picklist').innerHTML = `<div class="none">${esc(pick.ctx.err || 'reading the branches…')}</div>`; return; }
      row = (b, i) => `<div class="pkrow base${sel(i)}" data-i="${i}" style="${repoStyle(repoColor(pick.ctx.cwd))}" title="${esc(b.ref)}"><span class="sq"></span><span class="n">${mark(b.name)}${b.name.replace(/^origin\//, '') === pick.ctx.dflt ? '<span class="cur">default</span>' : ''}</span><span class="num">${b.where === 'origin' ? 'origin' : 'here'}</span><span class="t" data-at="${esc(b.at || '')}"></span></div>`;
    } else if (pick.mode === 'folder') {   // the new chat's folder, from a project that spans several
      pick.list = hunt(pick.ctx.cwds.map(f => ({ cwd: f })), x => [folderName(x.cwd), x.cwd]);
      row = (x, i) => `<div class="pkrow${sel(i)}" data-i="${i}" style="${repoStyle(repoColor(x.cwd))}" title="${esc(x.cwd)}"><span class="sq"></span><span class="n">${mark(folderName(x.cwd))}<span class="cur">${esc(homePath(x.cwd))}</span></span><span class="pills"></span><span class="t"></span></div>`;
    } else if (pick.mode === 'env') {   // the new chat's environment: a launcher of the folder's Taskfile (task <name>)
      pick.list = hunt(pick.ctx.launchers, l => [l.name, l.desc]);
      // …each with what the next step would show under it: the board's own pills, clauding first, then ready — the
      // count of this environment's chats that are not ticked done, so an environment already busy says so here.
      row = (l, i) => `<div class="pkrow env${sel(i)}" data-i="${i}" style="${repoStyle(repoColor(pick.ctx.cwd))}" title="task ${esc(l.name)} in ${esc(pick.ctx.cwd)}"><span class="sq"></span><span class="n">${mark(l.name)}</span><span class="num">${mark(l.desc)}</span><span class="pills">${pillsHtml(envCounts(pick.ctx.cwd, l.name))}</span></div>`;
    } else {   // project — and new, the same rows without ALL and without a named project that has no folder yet,
               // then the org's folders that are on no project, then ＋ clone for a name that is neither
      const board = projectList().filter(p => pick.mode === 'project' || (p.key !== ALL && p.cwds.length));
      const items = pick.mode === 'new' ? [...board, ...freeFolders()] : board;
      const none = pick.mode === 'new' && state.about.scratch ? [{ noFolder: true, name: NO_FOLDER, cwd: state.about.scratch }] : [];   // ＋ a chat in no folder, first (2026-10-14)
      // …as Claude or an agent (2026-11-06): its chip, as ＋'s in the chats step — a click or @ lists them under it, alone
      const at = atIn(), aq = at >= 0 ? $('#pickq').value.slice(at + 1).trim().toLowerCase() : '', ags = at >= 0 ? agentItems(pick.ag, aq) : null;
      pick.list = ags ? [...none, ...ags] : hunt([...none, ...items], p => p.folder ? [p.name, homePath(p.cwd)] : [p.name]);
      if (ags && pick.typed) { pick.sel = agentLand(ags, aq); pick.typed = false; }
      if (pick.mode === 'new' && !ags) pick.list = [...pick.list, ...cloneRows(items)];
      const chip = none.length ? agentChip() : '';
      if (pick.mode === 'project') pick.list = [...pick.list, { newProject: true }];   // ＋ new project, last and never filtered out
      // ✕ on every row of ⌥⌘N that names a project or a folder — never on ＋ clone, which is not on the board yet.
      const hx = p => pick.mode !== 'new' ? '' : `<button class="pkx" data-key="${esc(p.key)}" title="Take ${esc(p.name)} off the board — every picker stops listing it; its chats stay under ALL and the settings (⌘,) put it back">✕</button>`;
      const ed = p => pick.mode === 'project' && p.custom ? `<button class="pked" data-id="${esc(p.id)}" title="Edit ${esc(p.name)} — its name and folders">✎</button>` : '';
      row = (p, i) => p.ag || p.agClaude || p.agFold ? agentRowHtml(p, i, sel(i), aq, agentCwd(), pick.ag) : p.noFolder
        ? `<div class="pkrow nofolder pk2${sel(i)}" data-i="${i}" title="A chat that belongs to no folder — claude starts at once in the board's own, ${esc(homePath(p.cwd))}${chip ? ' · the chip, or @, for an agent to run it' : ''}"><span class="sq"></span><span class="n">${ags ? esc(p.name) : mark(p.name)}</span><span class="pills"></span><span class="t"></span><span class="pkline"><span class="cur">${esc(homePath(p.cwd))}</span>${chip ? `<span class="pkas">·</span>${chip}` : ''}</span></div>`
        : p.newProject
        ? `<div class="pkrow newproj${sel(i)}" data-i="${i}" title="A name over one or more folders — multi-repo work, an investigation"><span class="sq"></span><span class="n">＋ new project<span class="cur">a name over several folders</span></span><span class="pills"></span><span class="t"></span></div>`
        : p.clone
        ? `<div class="pkrow clone${sel(i)}" data-i="${i}" title="gh repo clone ${esc(p.org)}/${esc(p.name)} into ${esc(homePath(p.root))}"><span class="sq"></span><span class="n">＋ clone ${esc(p.org)}/${esc(p.name)}<span class="cur">into ${esc(homePath(p.root))}</span></span><span class="pills"></span><span class="t"></span></div>`
        : p.folder
          ? `<div class="pkrow folder${pick.mode === 'new' ? ' hides' : ''}${sel(i)}" data-i="${i}" style="${repoStyle(repoColor(p.cwd))}" title="${esc(p.cwd)}"><span class="sq"></span><span class="n">${projIcon(p.name)}${mark(p.name)}<span class="cur">${esc(homePath(p.cwd))}</span></span><span class="pills"></span><span class="t"></span>${hx(p)}</div>`
          : `<div class="pkrow${pick.mode === 'new' ? ' hides' : ''}${ed(p) ? ' named' : ''}${sel(i)}" data-i="${i}" style="${repoStyle(projColor(p))}"><span class="sq"></span><span class="n">${projIcon(p.name)}${mark(p.name)}${p.key === prefs.project ? '<span class="cur">current</span>' : ''}</span><span class="pills">${pillsHtml(p)}</span><span class="t"${p.last ? ` data-at="${esc(p.last)}"` : ''}></span>${hx(p)}${ed(p)}</div>`;
    }
    const same = (x, w) => x.isNew ? w.isNew : x.ag || x.agFold || x.agClaude ? (x.ag && x.ag === w.ag) || (x.agFold && x.agFold === w.agFold) || (x.agClaude && w.agClaude)
      : pick.mode !== 'new' && pick.mode !== 'project' ? x.id === w.id   // ⌥⌘N's and ⌥⌘P's rows: a project by its key (a folder's has no id), no folder and a clone as themselves
      : x.noFolder || w.noFolder ? !!(x.noFolder && w.noFolder) : x.clone || w.clone ? !!(x.clone && w.clone) && x.root === w.root : x.newProject || w.newProject ? !!(x.newProject && w.newProject) : x.key === w.key;
    if (was) { const i = pick.list.findIndex(x => same(x, was)); if (i >= 0) pick.sel = i; }
    pick.sel = Math.max(0, Math.min(pick.sel, pick.list.length - 1));
    const rows = pick.list.map(row);
    const asked = pick.mode === 'chat' && pick.named, reading = !asked ? '' : !asked.ids ? 'reading every chat\'s transcript for this PR…' : asked.err ? `the transcripts could not be read: ${asked.err}` : '';
    $('#picklist').innerHTML = rows.join('') + (reading && `<div class="none">${esc(reading)}</div>`) || `<div class="none">no ${PICK_NOUN[pick.mode] || 'project'} matches</div>`;
    fillAges($('#picklist'));
    $('#picklist .pkrow.sel')?.scrollIntoView({ block: 'nearest' });
  }
  function pickChoose(i) {
    if (pick.cloning) return;   // a step under way (2026-11-04): a press meanwhile is the same press — each was a chat of its own
    const x = pick.list[i], dlg = $('#pick');
    if (['launch', 'toggle', 'prs'].includes(pick.mode)) return launchChoose(x);
    if (pick.mode === 'base') {   // nothing matched: the step stays; ⏎ before the branches are read takes the default once they are
      if (!pick.ctx.bases) pick.ctx.go = !$('#pickq').value.trim(); else if (x) newChatOnBranch(pick.ctx.cwd, pick.ctx.branch, { base: x.ref, agent: pick.ctx.agent });
      return;
    }
    if (!x && pick.mode === 'chat' && pick.named && !pick.named.ids) { pick.named.go = true; return; }   // the answer opens the first it names
    if (!x) { dlg.close(); return; }
    if (pick.mode === 'pr') { dlg.close(); showPr(x.url); }
    else if (pick.mode === 'chat') { dlg.close(); openSession(x.id, { locate: true }); }
    else if (pick.mode === 'chatpick') {
      const c = pick.ctx;
      if (x.isGo) { if (c.picked.length < (c.min || 1)) return note($('#pickq'), `Take ${c.min} chats in at least — ⏎ on a chat takes it in`, true); dlg.close(); return c.go(c.picked.slice()); }
      const no = c.why?.(x); if (no) return note($('#pickq'), `Not this one: ${no}`, true);
      if (c.many) { const k = c.picked.indexOf(x.id); if (k < 0) c.picked.push(x.id); else c.picked.splice(k, 1); $('#pickq').value = ''; pickHint(); return pickRender(true); }
      dlg.close(); c.then(x);
    }
    else if (pick.mode === 'new') {   // a project's, or a folder's, open chats with ＋ a new one — or the clone first
      if (x.ag || x.agClaude) return agentTake(x.ag ? x.ag.name : null);   // no folder's chip's (2026-11-06)
      if (x.agFold) { pick.unfold.add(x.agFold); return pickRender(); }
      if (x.noFolder) noFolderChat(x.cwd);   // straight in: no chats step, and no Taskfile to ask
      else if (x.clone) cloneAndStart(x); else chatsStep({ key: x.key, name: x.name, cwds: x.cwds });
    }
    else if (pick.mode === 'chats') {
      if (x.ag || x.agClaude) return agentTake(x.ag ? x.ag.name : null);   // the chip's, and the chats back (2026-11-06)
      if (x.agFold) { pick.unfold.add(x.agFold); return pickRender(); }
      if (x.isNew && pick.wt && pick.git) wtEnter(pick.ctx.cwds[0], boxText());
      else if (x.isNew) newFromChats(pick.ctx); else { dlg.close(); openSession(x.id, { locate: true }); }
    }
    else if (pick.mode === 'agent') { if (x.agFold) { pick.unfold.add(x.agFold); pickRender(); } else { dlg.close(); pick.ctx.then(x.ag.name); } }
    else if (pick.mode === 'folder') newChatIn(x.cwd, pick.ctx.then);
    else if (pick.mode === 'env') {   // from ⌥⌘O the environment scopes the chats step; from ⌥⌘N it was the last thing asked
      if (pick.ctx.then === 'chats') chatsStep({ key: pick.ctx.cwd, name: folderName(pick.ctx.cwd), cwds: [pick.ctx.cwd], env: x.name });
      else { dlg.close(); newChat(pick.ctx.cwd, x.name); }
    }
    else if (x.newProject) { dlg.close(); openProjectEditor(null); }
    else { dlg.close(); selectProject(x.key); }
  }
  // The open chats of a step's scope — a project (its own rule: a folder is its exact cwd, a named project its
  // folders) narrowed to one environment when ⌥⌘O picked one — by your last touch, newest first. Done chats stay out.
  const scopeChats = ctx => { const p = projectStub(ctx.key); return [...state.sessions.values()].filter(s => visible(s) && bucket(s) !== 'done' && inProject(s, p) && (!ctx.env || s.env === ctx.env)).sort(byWord); };
  const chatsStep = ctx => pickOpen('chats', ctx);   // even with nothing to choose between: ＋ new chat alone, and esc
  // What the chats step would show under one environment, split the way the column's pills split a project.
  const envCounts = (cwd, env) => { const l = scopeChats({ key: cwd, env }); return { working: l.filter(s => bucket(s) === 'working').length, ready: l.filter(s => bucket(s) === 'ready').length }; };
  /** ⌥⌘N's chat in no folder, as its chip says (2026-11-06) — the agents waited on for a quick ⏎, as newFromChats does. */
  async function noFolderChat(cwd) {
    if (!pick.ag && pick.agLoad) {
      const gen = pick.gen; pick.cloning = true;
      await pick.agLoad; if (gen !== pick.gen || !$('#pick').open) return; pick.cloning = false;
    }
    const a = agentGo(); $('#pick').close(); newChat(cwd, null, withAgent(a));
  }
  // ＋ new chat, from wherever the flow had got to: the environment is already answered, or the folder is, or neither.
  async function newFromChats(ctx) {
    if (ctx.env) { $('#pick').close(); newChat(ctx.cwds[0], ctx.env); }
    else if (ctx.cwds.length === 1) {
      if (!pick.ag && pick.agLoad) {   // the chip's agent, not none for a quick ⏎ — and a second ⏎ meanwhile is this one (pick.cloning)
        const gen = pick.gen; pick.cloning = true;
        await pick.agLoad; if (gen !== pick.gen || !$('#pick').open) return; pick.cloning = false;
      }
      newChatIn(ctx.cwds[0], 'new', agentGo());
    }
    else pickOpen('folder', { cwds: ctx.cwds });
  }
  // Typing filters the chats, not ＋, so the selection moves off it and onto the first match — and falls back to
  // ＋ (the clamp below) when nothing matches, which is the thing to do with a name no chat has yet. On "new worktree"
  // it names the branch: ＋ stays selected, and where that branch is already is asked (brAsk).
  $('#pickq').addEventListener('input', () => { pick.sel = 0; pick.typed = (pick.mode === 'chats' || pick.mode === 'chatpick' || pick.mode === 'new' && atIn() >= 0) && !!$('#pickq').value.trim(); namedAsk(); if (pick.mode === 'chats' || pick.mode === 'new') pickHint(); pickRender(); brAsk(); });
  // ＋'s switch takes ← and → past the box's ends (2026-10-13): → with the caret at the end goes to "new worktree" (and
  // onto ＋, from any row), ← with it at the start back to "this folder"; inside the text they move the caret.
  const caretAt = end => { const q = $('#pickq'); return q.selectionStart === q.selectionEnd && q.selectionStart === (end ? q.value.length : 0); };
  $('#pickq').addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); pick.sel++; pickRender(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); pick.sel--; pickRender(); }
    else if (e.key === 'ArrowRight' && pick.list[pick.sel]?.agFold && caretAt(true)) { e.preventDefault(); pickChoose(pick.sel); }   // → opens a folded row of agents (2026-11-06)
    else if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && pick.mode === 'chats' && pick.git && atIn() < 0 && !(e.altKey || e.metaKey || e.ctrlKey || e.shiftKey) && caretAt(e.key === 'ArrowRight')) { if (pickWt(e.key === 'ArrowRight')) e.preventDefault(); }
    else if (e.key === 'Enter' && e.altKey && pick.list[pick.sel]?.kind === 'pr' && pick.list[pick.sel].pr.refs) { e.preventDefault(); const x = pick.list[pick.sel].pr, s = state.sessions.get(x.chatId); if (s) chatOnPr(s, x.url, $('#pickq')); }   // ⌥⏎ on a PR: a chat on its branch
    else if (e.key === 'Enter') { e.preventDefault(); pickChoose(pick.sel); }
    // the launcher's menus (2026-10-10): → into a row with ›, ← or ⌫ on an empty box back out to where it came from
    else if (e.key === 'ArrowRight' && pick.mode === 'launch' && !$('#pickq').value && pick.list[pick.sel]?.kind === 'menu' && !pick.list[pick.sel].leaf) { e.preventDefault(); pickChoose(pick.sel); }
    else if ((e.key === 'ArrowLeft' || e.key === 'Backspace') && !$('#pickq').value && pick.ctx.back) { e.preventDefault(); typeof pick.ctx.back === 'function' ? pick.ctx.back() : pickOpen(pick.ctx.back); }
  });
  $('#picklist').addEventListener('click', e => {
    if (pick.cloning) return;   // as pickChoose: the rows are dimmed, and take nothing until it answers
    const x = e.target.closest('.pkx');   // ✕: the row goes off the board, the picker stays where it is
    if (x) { e.stopPropagation(); hideProject(x.dataset.key); pickRender(); return; }
    const md = e.target.closest('.pkmode button');   // ＋'s switch: this folder or a new worktree, the box keeping the keys
    if (md) { e.stopPropagation(); pickWt(md.dataset.wt === '1'); $('#pickq').focus(); return; }
    const ag = e.target.closest('.pkag');   // ＋'s chip (2026-11-06): the agents under it, or shut again
    if (ag) { e.stopPropagation(); if (!ag.classList.contains('off')) agentList(); $('#pickq').focus(); return; }
    // ✓: the chat is ticked done and the picker stays up — the row leaves on the server's `session` event. A double
    // click's second press would land on the row that slid up under the pointer, so only a single one counts.
    const pc = e.target.closest('button.pkchat');   // a PR's Chat (2026-10-13): a new chat on its branch
    if (pc) { e.stopPropagation(); const s = state.sessions.get(pc.dataset.chat); if (s) chatOnPr(s, pc.dataset.url, pc); return; }
    const dn = e.target.closest('button.pkdone');
    if (dn) { e.stopPropagation(); $('#pickq').focus(); if (e.detail <= 1) tickDone(dn.dataset.id, true, dn); return; }
    const ed = e.target.closest('.pked');   // ✎: the picker gives way to the project's editor
    if (ed) { e.stopPropagation(); $('#pick').close(); openProjectEditor(ed.dataset.id); return; }
    const r = e.target.closest('.pkrow'); if (r) pickChoose(+r.dataset.i);
  });
  $('#pick').addEventListener('click', e => { if (e.target === e.currentTarget) e.currentTarget.close(); });   // a click on the backdrop
  $('#pick').addEventListener('close', () => { pick.gen++; pick.cloning = false; $('#pickq').disabled = false; });   // a clone under way answers to a note
