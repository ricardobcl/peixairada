// ---- ⌥⌘L: the launcher, and the sheet of every key (2026-10-10) -------------------------------------------
// Walker and the Omarchy menu: one box for every chat, project, PR, ticket, action and switch, fuzzy, in sections —
// `>` narrows it to the actions and switches, `#` to the PRs, `@` to the projects, `!` to the tickets. Empty, it is a
// menu: → or ⏎ goes into a row with ›, ← (or ⌫ on an empty box) comes back out of one opened from here (ctx.back).
// Toggle holds every switch of the settings, ⏎ flips one and the menu stays. The rows are the pickers' own (#pick).
const SWITCHES = [
  ['notifyOn', 'Notifications'],
  ['autoUpdate', 'Update itself'],
  ['soundsOn', 'Sounds'],
  ['optMeta', '⌥ is Meta in the terminal'],
  ['autoTile', 'Auto-tiling — every new terminal a tile, as i3'], // 2026-11-26
  ['darkFrame', 'Dark frame round a light chat'],
  ['cardsSnipOne', 'A card’s words on one line'],
  ['prioOn', 'Pinned section'],
  ['laneSchool', 'A fish per chat in the status bar'],
  ['laneBed', 'The seabed in the status bar'],
  ['skyOn', 'Space’s night sky'],
  ['agCardOn', 'Space’s agent card'],
];
const toggleRows = () => [
  {
    kind: 'toggle',
    id: 'tg:awake',
    name: 'Keep the Mac awake',
    hint: 'idle sleep held off',
    on: () => state.awake.awake,
    flip: () => setAwake({ awake: !state.awake.awake }),
  },
  {
    kind: 'toggle',
    id: 'tg:lid',
    name: '…with the lid closed',
    hint: 'Touch ID or your password',
    on: () => state.awake.lid,
    flip: () => state.lidAsking || setAwake({ lid: !state.awake.lid }),
  },
  ...SWITCHES.map(([el, name]) => ({
    kind: 'toggle',
    id: 'tg:' + el,
    name,
    on: () => $('#' + el).checked,
    flip: () => $('#' + el).click(),
  })),
  {
    kind: 'toggle',
    id: 'tg:skinFollow',
    name: 'Theme follows macOS',
    hint: 'Settings › Appearance › Auto',
    on: () => !!prefs.skinFollow,
    flip: () => setLook(prefs.skinFollow ? (sysDark() ? 'dark' : 'light') : 'auto'),
  },
];
/** What ⏎ does with the dialog: `stay` re-fills it (another picker), else it closes first and the action runs. */
const actionRows = () => {
  const s = state.sessions.get(state.current),
    of = s ? ` — ${s.title}` : '';
  return [
    fishing.until
      ? { name: 'Come back from fishing', fn: backFromFishing }
      : { name: `Go fishing, ${FISH_MIN} min`, sub: ' — questions still ring, the rest waits', fn: () => goFishing() },
    { name: 'New chat', hint: '⌥⌘N', fn: () => pickOpen('new'), stay: true },
    { name: 'Send to a chat…', sub: ' — a message of yours, as its prompt', fn: sendPick, stay: true }, // chats that talk (2026-10-31)
    {
      name: 'Merge chats into a new one…',
      sub: ' — where each stands, its first prompt',
      fn: () => mergePick(state.current ? [state.current] : [], 'launch'),
      stay: true,
    },
    { name: 'Search the chat list', hint: '⌥⌘F', fn: hotFind },
    ...filterList()
      .filter(([k]) => prefs.listFilter !== k)
      .map(([k, f]) => ({ name: `Show only: ${f.name.toLowerCase()}`, sub: ` — ${f.tip}`, fn: () => setFilter(k) })),
    ...(prefs.listFilter
      ? [
          {
            name: 'Show every chat again',
            sub: ` — no ${listFilter().name.toLowerCase()} filter`,
            fn: () => setFilter(null),
          },
        ]
      : []),
    { name: prefs.listHidden ? 'Show the chat list' : 'Hide the chat list', hint: '⌥⌘B', fn: toggleList },
    { name: 'Choose a theme', hint: '⌥⌘Y', fn: themesOpen },
    { name: 'Settings', hint: '⌘,', fn: () => settingsOpen(true) },
    { name: 'Every key', hint: '?', fn: keysOpen },
    { name: 'Take the tour', sub: ' — the board’s main parts, one at a time', fn: tourStart },
    { name: 'What’s new', sub: ` — ${NEWS.name}, four examples`, fn: () => newsOpen(0) },
    { name: 'The overview — every live chat', hint: '⌥⌘A', fn: ovOpen },
    { name: prefs.space ? 'Leave Space' : 'Space — every chat as a node of its agents', hint: '⌥⌘X', fn: spToggle },
    { name: 'Home — the day', hint: '⌥⌘0', fn: hotHome },
    { name: 'About peixAIrada', fn: aboutOpen },
    { name: 'Zé, the Bruce Lee of Barcelos — a game', hint: '⌥⌘Z', fn: zeOpen },
    ...(state.chat.on ? [{ name: 'The chat', sub: ` — ${state.chat.repo}`, fn: () => chatOpen() }] : []),
    ...(!s
      ? []
      : [
          { name: 'Its Claude, in its drawer', sub: of, hint: '⌥⌘C', fn: hotClaude },
          { name: `A ${shName()} in its folder`, sub: of, hint: '⌥⌘T', fn: hotShell },
          ...(shellLive(s)
            ? [{ name: `Another ${shName()} beside it`, sub: of, hint: '⌘T', fn: () => startShell(s, true) }]
            : []),
          ...(s.prs?.length ? [{ name: 'Its PR on GitHub', sub: of, hint: '⌥⌘G', fn: hotGh }] : []),
          ...(prefs.autoTile && isSplit(s)
            ? [{ name: 'Tidy the tiles', sub: ' — Claude’s on the left, the bigger ones left and up', fn: hotTidy }]
            : []),
          { name: 'Its timeline — the chat and its PRs in one order', sub: of, hint: '⌥⌘J', fn: hotTimeline },
          ...(inApp || onVim() ? [{ name: `Its folder in ${inEdName()}`, sub: of, hint: '⌥⌘E', fn: hotVsCode }] : []),
          ...(s.cwd
            ? [{ name: `Its folder in ${editor().name} — its own window`, sub: of, hint: '⌥⌘V', fn: hotEditorApp }]
            : []),
          ...(canTick(s)
            ? [
                {
                  name: watchEnds(s) ? `Tick it done — ends its watch: ${watchEnds(s)}` : 'Tick it done',
                  sub: of,
                  fn: () => tickDone(s.id, true, $('#shead')),
                },
              ]
            : []),
          ...(canTick(s) && s.prs?.length && !s.forGood
            ? [
                {
                  name: 'Done for good — its PRs forgotten',
                  sub: of,
                  fn: () => tickDone(s.id, true, $('#shead'), null, true),
                },
              ]
            : []),
          s.removed
            ? { name: 'Put it back on the board', sub: of, fn: () => restoreChat(s.id) }
            : {
                name: 'Delete it from the board — its claude ends, the transcript stays',
                sub: of,
                fn: () => removeChat(s.id, $('#shead')),
              },
          {
            name: s.muted ? 'Unmute it' : 'Mute it — no banner, sound or count, questions too',
            sub: of,
            fn: () => setMuted(s.id, !s.muted),
          },
          ...(prioOn()
            ? [
                {
                  name: inPrio(s) ? 'Unpin it' : 'Pin it — the section up top, in your order',
                  sub: of,
                  hint: '⌥⌘I',
                  fn: () => prioPut(s, !inPrio(s), null, $('#shead')),
                },
              ]
            : []), // 2026-11-24, round XXX's A4
          ...(asking(s)
            ? []
            : [
                asleep(s)
                  ? {
                      name: 'Wake it now',
                      sub: ` — snoozed ${snoozeSay(s.snooze)}`,
                      fn: () => snoozeIt(s, { undo: true }, $('#shead')),
                    }
                  : {
                      name: 'Snooze it…',
                      sub: ' — till a time, or till something happens',
                      hint: '⌥⌘S',
                      fn: () => setTimeout(() => snoozeMenu(s), 0),
                    },
              ]),
          // what was the pointer's alone (2026-10-12): a rename, a PR taken off, a tab moved across, a colour let go
          { name: 'Rename it', sub: of, fn: () => editTitle(s) },
          ...(!foldFromWhy(s)
            ? [{ name: 'Fold it into another chat…', sub: of, fn: () => foldPick(s, 'launch'), stay: true }]
            : []), // 2026-10-31
          ...(s.file ? [{ name: 'Branch it — a copy in a drawer of its own', sub: of, fn: () => branchChat(s) }] : []),
          ...(s.prs || []).filter(shownHere).map(pr => ({
            name: `Take ${pr.label.replace(/^.*?#/, '#')} off it`,
            sub: ` — ${pr.title || pr.label}`,
            fn: () => unlinkUrl(s, pr.url),
          })),
          ...(isSplit(s) ? [{ name: 'Move this tab to the other half', sub: of, fn: () => moveFocused(s) }] : []),
          ...(s.cwd && ownColor(s.cwd)
            ? [
                {
                  name: 'Let go of its project’s colour',
                  sub: ` — ${s.project}`,
                  fn: () => clearColor(colorKey(s.cwd)),
                },
              ]
            : []),
          ...(s.cwd
            ? [
                {
                  name: 'Copy its folder’s path',
                  sub: ` — ${homePath(s.cwd)}`,
                  fn: () =>
                    navigator.clipboard?.writeText(s.cwd).then(
                      () => note($('#shead'), 'Path copied'),
                      () => {},
                    ),
                },
              ]
            : []),
        ]),
  ].map(a => ({ kind: 'action', id: 'ac:' + a.name, ...a }));
};
const LAUNCH_MENU = () => {
  const yours = allPrs().filter(pr => pr.turn?.you).length;
  return [
    { name: 'Chats', hint: '⌥⌘K', icon: ICON.ask, go: () => pickOpen('chat', { back: 'launch' }) },
    { name: 'Projects', hint: '⌥⌘P', icon: ICON.folder, go: () => pickOpen('project', { back: 'launch' }) },
    { name: 'New chat', hint: '⌥⌘N', icon: '＋', go: () => pickOpen('new', { back: 'launch' }) },
    {
      name: 'Pull requests',
      hint: yours ? `${yours} at your move` : 'every chat’s',
      icon: ICON.pr,
      go: () => pickOpen('prs', { back: 'launch' }),
    },
    { name: 'Toggle', hint: 'every switch', icon: '⏻', go: () => pickOpen('toggle', { back: 'launch' }) },
    { name: 'Theme', hint: '⌥⌘Y', icon: '◐', go: themesOpen, leaf: true },
    { name: 'Settings', hint: '⌘,', icon: ICON.cog, go: () => settingsOpen(true), leaf: true },
    { name: 'Keys', hint: '?', icon: ICON.key, go: keysOpen, leaf: true },
    { name: 'Tour', hint: 'the main parts', icon: '⇢', go: tourStart, leaf: true },
    { name: 'What’s new', hint: NEWS.name, icon: '✦', go: () => newsOpen(0), leaf: true },
    { name: 'Home', hint: '⌥⌘0', icon: '⌂', go: hotHome, leaf: true },
    { name: 'Overview', hint: '⌥⌘A', icon: '▦', go: ovOpen, leaf: true },
    { name: 'Space', hint: '⌥⌘X', icon: '◎', go: spToggle, leaf: true },
    { name: 'About peixAIrada', icon: '·', go: aboutOpen, leaf: true },
  ].map(m => ({ kind: 'menu', id: 'mn:' + m.name, ...m }));
};
/** Every chat's PRs, one row each — the most recent chat to mention it is where it opens. */
function allPrs() {
  const seen = new Map();
  for (const s of [...state.sessions.values()].filter(visible).sort(byWord))
    for (const pr of s.prs || []) if (!seen.has(pr.url)) seen.set(pr.url, { ...pr, chatId: s.id, chat: s.title });
  return [...seen.values()];
}
function allTickets() {
  const seen = new Map();
  for (const s of [...state.sessions.values()].filter(visible).sort(byWord))
    for (const t of s.tickets || []) if (!seen.has(t.key)) seen.set(t.key, { ...t, chatId: s.id, chat: s.title });
  return [...seen.values()];
}
/** A new tab's address, typed into (⌘T on a page): an address as given, a bare host over https (localhost and the loopback over http), and
 *  anything else a search — a browser's address bar. */
function typedPage(raw) {
  const url = /^[a-z][\w+.-]*:\/\//i.test(raw)
    ? raw
    : /^(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)(:\d+)?([/?#]\S*)?$/i.test(raw)
      ? 'http://' + raw
      : /^[\w-]+(\.[\w-]+)+(:\d+)?([/?#]\S*)?$/.test(raw)
        ? 'https://' + raw
        : null;
  return url
    ? { kind: 'url', id: 'url:typed', url, name: `Open ${bareUrl(url)}` }
    : {
        kind: 'url',
        id: 'url:typed',
        url: 'https://www.google.com/search?q=' + encodeURIComponent(raw),
        name: `Search the web for “${raw}”`,
      };
}
/** The open chat's own pages that are not on a tab of it: its PRs, its tickets, its repository on GitHub. */
function chatPages(s) {
  if (!s) return [];
  const open = u => !!pageTab(s, u),
    repo = s.cwd && state.repos[s.cwd]; // on a tab: a tab still at it
  return [
    ...(s.prs || []).filter(pr => !open(pr.url)).map(pr => ({ kind: 'pr', id: 'pr:' + pr.url, pr })),
    ...(s.tickets || []).filter(t => t.url && !open(t.url)).map(t => ({ kind: 'ticket', id: 'tk:' + t.key, t })),
    ...(repo && !open(repo)
      ? [
          {
            kind: 'url',
            id: 'url:' + repo,
            url: repo,
            name: `${bareUrl(repo).replace(/^github\.com\//, '')} on GitHub`,
          },
        ]
      : []),
  ];
}
const LAUNCH_SECTIONS = {
  chat: 'Chats',
  project: 'Projects',
  pr: 'Pull requests',
  ticket: 'Tickets',
  action: 'Actions',
  toggle: 'Switches',
  menu: '',
};
/** The launcher's rows for a query (none: the menu): each section's best matches, best first, at most six — all of
 *  them under a prefix. */
function launchRows(raw) {
  const pre = /^[>#@!]/.exec(raw)?.[0] || '',
    q = raw.slice(pre.length).trim().toLowerCase();
  if (!raw.trim()) return LAUNCH_MENU();
  const best = (items, fields) => {
    const hits = [];
    items.forEach((x, i) => {
      const m = q ? fuzzy(fields(x), q) : { score: 0 };
      if (m) hits.push([m.score, i, x]);
    });
    return hits
      .sort((a, b) => b[0] - a[0] || a[1] - b[1])
      .map(h => h[2])
      .slice(0, pre ? 400 : 6);
  };
  const want = k =>
    !pre || { '>': ['action', 'toggle'], '#': ['pr'], '@': ['project'], '!': ['ticket'] }[pre].includes(k);
  const chats = !want('chat')
    ? []
    : best(
        [...state.sessions.values()].filter(visible).sort((a, b) => RANK[rankOf(a)] - RANK[rankOf(b)] || byWord(a, b)),
        chatFields,
      ).map(s => ({ kind: 'chat', id: s.id, s }));
  const projects = !want('project')
    ? []
    : best(projectList(), p => [p.name]).map(p => ({ kind: 'project', id: 'pj:' + p.key, p }));
  const prs = !want('pr')
    ? []
    : best(allPrs(), pr => [pr.label, pr.title || '', pr.chat || '']).map(pr => ({
        kind: 'pr',
        id: 'pr:' + pr.url,
        pr,
      }));
  const tickets = !want('ticket')
    ? []
    : best(allTickets(), t => [t.key, t.summary || '', t.chat || '']).map(t => ({
        kind: 'ticket',
        id: 'tk:' + t.key,
        t,
      }));
  const agents = !want('action') || !q ? [] : best(agentActs(), a => [agentShort(a.agent.name), a.agent.name]); // by an agent's name (2026-11-06)
  const actions = !want('action') ? [] : best(actionRows(), a => [a.name, a.sub || '']);
  const toggles = !want('toggle') ? [] : best(toggleRows(), t => [t.name]);
  return [...chats, ...projects, ...prs, ...tickets, ...agents, ...actions, ...toggles];
}
const swHtml = on => `<span class="lsw${on ? ' on' : ''}"><i></i></span>`;
/** One launcher row; a section's first carries its head — the launcher's, not a new tab's list of pages. */
function launchRow(x, i, sel, mark, heads = pick.mode === 'launch') {
  const head =
    heads && LAUNCH_SECTIONS[x.kind] && pick.list[i - 1]?.kind !== x.kind
      ? `<div class="pkhd">${LAUNCH_SECTIONS[x.kind]}</div>`
      : '';
  const r = (cls, g, n, num, t, style = '') =>
    `${head}<div class="pkrow lx ${cls}${sel(i)}" data-i="${i}"${style}><span class="g">${g}</span><span class="n">${n}</span><span class="num">${num}</span><span class="t">${t}</span></div>`;
  if (x.kind === 'chat') {
    const s = x.s;
    return r(
      'chat',
      '<span class="sq"></span>',
      `${ticks(mark(s.title))}${s.id === state.current ? '<span class="cur">current</span>' : ''}`,
      `${projIcon(s.project)}${mark(s.project)}`,
      `<span class="st" data-state="${chatState(s)}">${chatState(s)}</span>`,
      ` style="${repoStyle(repoColor(s.cwd))}" title="${esc(s.cwd || '')}"`,
    );
  }
  if (x.kind === 'project')
    return r(
      'project',
      '<span class="sq"></span>',
      `${projIcon(x.p.name)}${mark(x.p.name)}${x.p.key === prefs.project ? '<span class="cur">current</span>' : ''}`,
      '',
      '',
      ` style="${repoStyle(projColor(x.p))}"`,
    );
  if (x.kind === 'pr') {
    const pr = x.pr;
    return r(
      'pr',
      `<span class="lpr" data-state="${esc(pr.state || '')}">${esc(pr.label.replace(/^.*?#/, '#'))}</span>`,
      `${pr.title ? mark(pr.title) : esc(pr.label)}<span class="cur">${esc(pr.label.replace(/#\d+$/, ''))}</span>`,
      pr.turn?.you ? '<b class="ymove">your move</b>' : esc(pr.chat || ''),
      `<span class="st">${esc((pr.state || '').toLowerCase())}</span>${pr.refs ? `<button type="button" class="pkchat" data-url="${esc(pr.url)}" data-chat="${esc(pr.chatId)}" title="A new chat on its branch — in the folder that has it out, else a worktree of its own · ⌥⏎">Chat</button>` : ''}`,
      ` title="${esc(pr.url)}"`,
    );
  }
  if (x.kind === 'ticket') {
    const t = x.t;
    return r(
      'ticket',
      `<span class="ltk" data-cat="${esc(t.cat)}">${esc(t.key)}</span>`,
      mark(t.summary || t.key),
      esc(t.chat || ''),
      `<span class="st">${esc((t.status || '').toLowerCase())}</span>`,
      ` title="${esc(t.url)}"`,
    );
  }
  if (x.kind === 'action')
    return r(
      'action',
      '<span class="ac">&gt;</span>',
      `${mark(x.name)}${x.sub ? `<span class="cur">${esc(x.sub)}</span>` : ''}`,
      x.hint ? `<kbd>${esc(x.hint)}</kbd>` : '',
      '',
    );
  if (x.kind === 'toggle')
    return r('toggle', '<span class="ac">⏻</span>', mark(x.name), x.hint ? esc(x.hint) : '', swHtml(x.on()));
  if (x.kind === 'url')
    return r('url', ICON.globe, x.id === 'url:typed' ? esc(x.name) : mark(x.name), '', '', ` title="${esc(x.url)}"`); // a new tab's: a page
  return r('menu', x.icon || '', mark(x.name), x.hint ? `<kbd>${esc(x.hint)}</kbd>` : '', x.leaf ? '' : '›'); // a menu row
}
function launchChoose(x) {
  const dlg = $('#pick');
  if (!x) return dlg.close();
  if (x.kind === 'toggle')
    return void Promise.resolve(x.flip()).finally(() => {
      if (dlg.open) pickRender(true);
    });
  if (x.kind === 'menu') {
    if (x.leaf) dlg.close();
    return x.go();
  }
  if (x.kind === 'action' && x.stay) return x.fn();
  dlg.close();
  if (x.kind === 'chat') return openSession(x.id, { locate: true });
  if (x.kind === 'project') return selectProject(x.p.key);
  // the page once its chat is in, and only if that chat is still the one open (2026-10-14): a late answer opened it
  // over whichever chat was open by then
  if (x.kind === 'pr')
    return openSession(x.pr.chatId, { locate: true }).then(() => {
      if (state.current === x.pr.chatId) showPr(x.pr.url);
    });
  if (x.kind === 'ticket')
    return openSession(x.t.chatId, { locate: true }).then(() => {
      if (state.current === x.t.chatId) openExternal(x.t.url, { s: state.sessions.get(x.t.chatId) });
    });
  if (x.kind === 'action') return x.fn();
}
// ?: the sheet of every key — Omarchy's Super+K — from anywhere but a box or a terminal, or the launcher's Keys. The
// settings' Keys pane is its source, so the list is kept in one place; the box narrows it.
// Every key in one table (2026-10-12; typed by hand into the Keys pane before, beside HOTKEYS and Keys.swift's
// boardKeys): [what you press, its group, what it does in a line, the rest for its tooltip, the codes it is in
// HOTKEYS (alt:) or CMDKEYS (cmd:)]. The Keys pane and the ? sheet are drawn from it, grouped, and `npm run check`
// holds HOTKEYS, CMDKEYS and the app's forwarder to it (scripts/check-page.mjs). A row with an id is one the setup
// rewrites (⌥⌘O's project, ⌥⌘N's folders).
// A table, a row a line: left as written (2026-11-25)
// prettier-ignore
const KEYS = [
  ['⌥⌘K', 'Go to', 'a chat — every project, fuzzy: <em>chk rtr</em> finds <em>checkout retry</em>', 'asking, clauding or ready, in the list\'s order · typed, done chats too · a PR\'s number, its link or a ticket\'s key finds the chat that has it, a PR\'s link every chat whose transcript names it', ['alt:KeyK']],
  ['⌥⌘L', 'Go to', 'anything — chats, projects, PRs, tickets, actions and switches', '> actions and switches, # PRs, @ projects, ! tickets · empty, a menu: → into a row, ← back', ['alt:KeyL']],
  ['⌥⌘P', 'Go to', 'a project — or a click on the project\'s name atop the list', 'pressed twice: every project, and from there back · ✎ edits a named one, ＋ makes one', ['alt:KeyP']],
  ['⌥⌘F', 'Go to', 'the list\'s own search, fuzzy', 'the best match leads · ↑↓ walk the cards · ⏎ opens one · esc clears it', ['alt:KeyF']],
  ['⌥⌘N', 'Go to', 'a new chat — the project in view first', 'or one in no folder (the first row), a project, a folder of your repos, or ＋ clone one · then its open chats or ＋ a new one — in the folder, or (←→) in a new worktree on a branch of its own · @ or ＋’s chip: an agent to run it (claude --agent) · ✕ takes a row off the board', ['alt:KeyN'], 'newKey'],
  ['⌥⌘O', 'Go to', 'a new chat in the setup\'s quick project', 'its environments first, when its Taskfile has some', ['alt:KeyO'], 'quickKey'],
  ['⌥⌘↑↓', 'Go to', 'the chat above / below in the list', 'tiles on and the column split: the tile above / below', ['alt:ArrowUp', 'alt:ArrowDown']],
  ['⌥⌘U', 'Go to', 'the pinned only, and every chat again', 'the list is the pinned alone, its tab atop it says what is hidden · the rest is quiet as when fishing, its questions still ring · the funnel\'s second row · with the section on', ['alt:KeyU']],
  ['⌥⌘A', 'Go to', 'the overview: every live chat at once', 'Asking you · Clauding · Watching · New replies, each with what it is doing now · 1–9 opens one · a question\'s answer types its digit into the chat\'s drawer', ['alt:KeyA']],
  ['⌥⌘X', 'Go to', 'Space: the board\'s other layout, every chat as a node of its agents', 'in the chat list\'s place, the chats by state, each with a pod per agent type · a click opens the chat on its right, every key as ever, its × or ⌘W closes it · ⌘+ ⌘− zoom the nodes · its agents as lanes under them · again, or ⌥⌘B, back to the list · the status bar\'s Space too', ['alt:KeyX']],
  ['⌥⌘0', 'Go to', 'home — the board\'s facts and your day', 'no chat open · a row opens its chat', ['alt:Digit0']],
  ['⌥⌘M', 'Go to', 'lunch — today\'s menus, on a chalkboard', 'the places you go, read each morning · Going and In 15 min at lunch time · again closes it · Settings › Lunch sets it up', ['alt:KeyM']],
  ['⌥⌘Z', 'Go to', 'Zé, the Bruce Lee of Barcelos — a game', 'meat makes him buff, greens thin — down to his bones · three meats in a row bring a Ford Focus, three greens a Mercedes A-Class · four ways to play, ← → on the title, G a second player (the galo, on A D W) · level 3 is ENTER THE DRAGON, every fifth the Avó da Horta · ← → run (twice: a dash), ↑ jumps, ↓ drops, space kicks (held: the nunchaku), P pauses, M the sound, T the music · a chat asking you stops it: ⏎ goes to it · again closes it', ['alt:KeyZ']],
  ['?', 'Go to', 'this list, on a sheet of its own', 'outside a box or a terminal', []],
  ['⌥⌘C', 'This chat', 'its Claude, in its drawer', 'starts it, or takes over one running elsewhere · again from it: its half fills the column, and back', ['alt:KeyC']],
  ['⌘T', 'This chat', 'a new tab — another shell, or from a web page a blank one', 'from claude\'s drawer, a shell, the transcript or the changes, a shell in its folder · from a GitHub page or VS Code Web, a blank tab with the keys in its address — type one, or words to search · it opens beside the chat', ['cmd:KeyT']],
  ['⌥⌘⇧T', 'This chat', 'a new shell on a tab where the keys are', 'in the half or tile you are in, beside its tabs — never a new tile, never a split · ⌃⌘←→ go round them', ['shift:KeyT']],
  ['⌥⌘T', 'This chat', 'a shell in its folder, on a tab', 'shown if it has one — ⌘T opens another · again from it: its half fills the column, and back', ['alt:KeyT']],
  ['⌥⌘E', 'This chat', 'its folder in the in-app editor, on a tab', 'VS Code Web, or vim in a terminal — Settings › General › In-app editor · again from it: its half fills the column, and back', ['alt:KeyE']],
  ['⌥⌘V', 'This chat', 'its folder in the external editor, its own window', 'VS Code, or Zed — Settings › General › External editor · outside the board: ⌥⌘E is VS Code Web on a tab · with no chat open, the project in view when it is a folder', ['alt:KeyV']],
  ['⌥⌘G', 'This chat', 'its PR on GitHub, on a tab', 'the repo when it has none · a picker with several — from one of them, the next selected, and ⌥⌘G once more fills the column · a tab followed elsewhere leaves it a new one · again from its page: its half fills the column, and back', ['alt:KeyG']],
  ['⌥⌘J', 'This chat', 'its timeline, on a tab — the chat and its PRs in one order', 'your prompts, each of Claude\'s turns as a line, the PRs\' events between them, a lane per PR · the Now bar says each one\'s round · a turn clicked shows it in the transcript · again from it: its half fills the column, and back', ['alt:KeyJ']],
  ['⌥⌘D', 'This chat', 'what it changed, on a tab', 'its last turn\'s edits, the uncommitted tree or the branch against its base · Commit… and Push type into its shell · + on a line sends Claude a note · again from it: its half fills the column, and back', ['alt:KeyD']],
  ['⌥⌘I', 'This chat', 'pin it, or unpin it', 'the section atop the list, in your order, that nothing moves but you · a card\'s pin, its right-click and the header\'s ··· too · Settings › Chat list can take the section off', ['alt:KeyI']],
  ['⌥⌘⇧↑↓', 'This chat', 'its card a place up / down among the pinned', 'a card\'s right-click: to the top, to the bottom · or drag it between two pinned cards · tiles on and the column split: the tile moved up / down', ['shift:ArrowUp', 'shift:ArrowDown']],
  ['⌥⌘S', 'This chat', 'snooze it — till a time, or till something happens', '1–9 pick · it waits in Snoozed, counted nowhere, and comes back at the top of its lane, marked back · a question from it or a word of yours wakes it · Settings › Chat list says when mornings start', ['alt:KeyS']],
  ['⌘W', 'This chat', 'close the tab the keys are in', 'the shell ends, a page goes, VS Code Web once no editor is open in it (its ⌘W closes them first) · on the chat\'s own tab, its half closes — with one half, the window\'s own key · a dialog up closes first', ['cmd:KeyW']],
  ['⌥⌘W', 'This chat', 'close the tab the keys are in, never more', 'as ⌘W, but on the chat\'s tab it says so, and never closes a half or the window', ['alt:KeyW']],
  ['⌘1 ⌘2', 'Layout', 'the left half, the right one', '⌘2 splits the chat in two the first time; one over the other, either turns it back · the digit is the half, the modifier the layout', ['cmd:Digit1', 'cmd:Digit2']],
  ['⌥⌘1 ⌥⌘2', 'Layout', 'the top half, the bottom one', '⌥⌘2 splits the chat that way the first time; side by side, either turns it', ['alt:Digit1', 'alt:Digit2']],
  ['⌥⌘←→', 'Layout', 'the tab to the left / right', 'across both halves\' strips · drag a tab onto the other half to move it there · tiles on and the column split: the tile to the left / right, by where it stands', ['alt:ArrowLeft', 'alt:ArrowRight']],
  ['⌥⌘⇧←→', 'Layout', 'tiles: the tile the keys are in moved left / right', 'Settings › Terminal › Auto-tiling, the column split · the rest close over the room it left · two side by side trade places · ↑↓ the same up and down', ['shift:ArrowLeft', 'shift:ArrowRight']],
  ['⌘D ⇧⌘D', 'Layout', 'tiles: a new zsh beside this tile, or under it', 'Settings › Terminal › Auto-tiling · ⌘D cuts it side by side, ⇧⌘D one over the other, whatever its shape', ['cmd:KeyD', 'cmdshift:KeyD']],
  ['⌥⌘⇧ + drag', 'Layout', 'tiles: a whole tile moved by the mouse', 'with Auto-tiling on, the column split: held, the pointer the move cursor (four arrows) · press anywhere on a tile and drag — onto another\'s middle or tabs its tabs join them, onto its outer quarter it goes to that side', []],
  ['⌃⌥⌘T', 'Layout', 'the tab in front out into a tile of its own', 'with Auto-tiling on: cut from its tile along the longer side, as a new terminal is — a zsh, a page, the chat · ⌥⌘⇧T the other way, a zsh onto this tile', ['ctrlalt:KeyT']],
  ['⌃⌘←→', 'Layout', 'the tab to the left / right in this half or tile', 'its own strip alone, round from the end to the start · drag a tab onto another to move it there', ['ctrl:ArrowLeft', 'ctrl:ArrowRight']],
  ['⌘0', 'Layout', 'only this half — the other closes', 'with one half, the chat\'s size back to normal', ['cmd:Digit0']],
  ['⌥⌘B', 'Layout', 'hide the chat list, and show it again', 'the chat takes the whole width · the status bar\'s first button too', ['alt:KeyB']],
  ['⌃⌘F', 'Layout', 'full screen, in the app — up to the notch, or in a Space of its own', 'Settings › General picks which · the green button too · up to the notch, ⌥-click zooms, and the lights come down with the menu bar after a hold at the top edge · remembered across launches', []],
  ['⌥⌘R', 'Look', 'reload the board', 'the chat you are on kept · ⇧⌘R restarts the server too, in the app · ⌘R is the page\'s in the pane', ['alt:KeyR']],
  ['⌥⌘Y', 'Look', 'the theme', 'the board behind follows the arrows · ⏎ wears it · esc puts back what was worn', ['alt:KeyY']],
  ['⌘,', 'Look', 'the settings', 'the chat header\'s ··· has them too', ['cmd:Comma']],
  ['⌘+ ⌘−', 'In the drawer', 'the chat\'s and the drawer\'s size', '', []],
  ['⌘K', 'In the drawer', 'clear the drawer', 'on the server\'s copy of its screen too, so it stays clear', []],
  ['⇧⏎', 'In the drawer', 'a newline in the prompt', '', []],
  ['⌘← ⌘→', 'In the drawer', 'the line\'s start / end, as in iTerm', '⌥← ⌥→ a word · ⌘⌫ ⌘⌦ delete to the start / end · ⌥⌫ ⌥⌦ a word', []],
  ['esc', 'In a page', 'back to the chat from a page\'s tab', 'closes a picker or a popover first', []],
  ['⌘R', 'In a page', 'reload the page in the pane', 'VS Code Web hears its own ⌘R · ⌥⌘R reloads the board', []],
  ['⌘F · ⌘G', 'In a page', 'find on the page in the pane', '⏎ ⇧⏎ or ⌘G ⇧⌘G step the matches · esc closes the bar · in the app', []],
  ['pinch', 'In a page', 'zoom a page in the pane, as in Safari', 'its address sits in the strip, a click copies it', []],
];
const keysHtml = (rows, row) =>
  [...new Set(rows.map(k => k[1]))]
    .map(
      g =>
        `<span class="kh">${esc(g)}</span>${rows
          .filter(k => k[1] === g)
          .map(row)
          .join('')}`,
    )
    .join('');
// what the setup says of a key (⌥⌘O's project, ⌥⌘N's folders), by the row's id — renderSetup writes it
const keyNotes = {};
function keysOpen() {
  const dlg = $('#keysheet');
  if (dlg.open) return;
  if (inApp) post({ type: 'focus' });
  $('#ksbody').innerHTML = keysHtml(KEYS, ([k, , d, more, , id]) => {
    const n = keyNotes[id] || {},
      tip = n.title || more;
    return `<div class="kr"><kbd>${k}</kbd><span>${n.html || d}${tip ? `<i>${esc(tip)}</i>` : ''}</span></div>`;
  }).replace(/<span class="kh">/g, '<span class="kh ksh">');
  $('#ksq').value = '';
  ksFilter();
  dlg.showModal();
  repostPane();
  $('#ksq').focus();
}
function ksFilter() {
  const words = $('#ksq').value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  let n = 0; // every word somewhere in the row: a sheet this long matches anything fuzzily
  let head = null,
    any = false; // a group's head stands while any of its rows does (2026-10-12)
  for (const r of $('#ksbody').children) {
    if (r.classList.contains('ksh')) {
      if (head) head.hidden = !any;
      head = r;
      any = false;
      continue;
    }
    const t = r.textContent.toLowerCase(),
      on = words.every(w => t.includes(w));
    r.hidden = !on;
    n += on;
    any ||= on;
  }
  if (head) head.hidden = !any;
  $('#ksnone').hidden = !!n;
}
$('#ksq').addEventListener('input', ksFilter);
$('#keysheet').addEventListener('click', e => {
  if (e.target === e.currentTarget) e.currentTarget.close();
});
document.addEventListener('keydown', e => {
  if (e.key !== '?' || e.metaKey || e.ctrlKey || e.altKey || document.querySelector('dialog[open]')) return;
  if (e.target.closest?.('input, textarea, select, [contenteditable], .tbody')) return;
  e.preventDefault();
  keysOpen();
});
// ⌥⌘ + a letter, from anywhere — the drawer included: capture phase, so its xterm never sees them; e.code,
// because with ⌥ held e.key is a symbol ('ø' for O) on a Mac. One letter per place the open chat lives: T a
// fresh zsh in its folder (the pane's zsh tab — a holder like claude's), E the editor — VS Code Web in the pane, the
// web button's route —, V the folder in VS Code's own window (2026-10-14), G the chat's PR on GitHub — straight to it
// with one, the picker with several — every time, a tab open or not, the one showing marked (2026-09-20); each PR is
// its own tab, so nothing reloads —, C the claude session: the >_ button's path (the drawer shown or started,
// arm-and-take-over included, so a chat live elsewhere takes two presses). W closes the tab the keys are in
// (hotCloseTab, 2026-09-28) — a half with one tab has no strip, so no ×. O is a new oracle chat, opening on its
// environments (hotOracle), P the project picker, K the chat picker (every ready or clauding chat, searched), F the
// chat list's own filter box (hotFind), N a new chat anywhere (the project, then the folder, then the environment
// when the folder's Taskfile launches claude); ↑ and ↓ open the chat above or below in the list; ← and → the tab to
// the left or right in the strip (chat | zsh | GitHub pages | VS Code, wrapping); 1 and 2 the halves of the chat
// column stood one over the other (2026-09-27) — ⌘1 / ⌘2 are the same halves side by side: the digit is the pane, the
// modifier the layout, and a key pressed on the other layout turns it (hotGroup). A modal up (the picker, the project
// editor) swallows them all. In the app the pane is a native view with its own web views, so a key pressed there
// never reaches this page: the shell forwards ⌥⌘ + these keys through peixKey (the same list, kept by hand there).
const HOTKEYS = {
  KeyZ: zeToggle,
  KeyM: lunchToggle,
  KeyJ: hotTimelineKey,
  KeyT: hotShellKey,
  KeyE: hotVsCodeKey,
  KeyV: hotEditorApp,
  KeyG: hotGhKey,
  KeyC: hotClaudeKey,
  KeyW: hotCloseTab,
  KeyR: hotReload,
  KeyO: hotOracle,
  KeyP: () => pickOpen('project'),
  KeyK: () => pickOpen('chat'),
  KeyF: hotFind,
  KeyN: () => pickOpen('new'),
  KeyB: toggleList,
  KeyY: themesOpen,
  KeyL: () => pickOpen('launch'),
  KeyD: hotDiffKey,
  KeyA: ovOpen,
  KeyX: spToggle,
  Digit0: hotHome,
  KeyI: hotPrio,
  KeyS: hotSnooze,
  KeyU: hotFocus,
  ArrowUp: () => (tileKeysOn() ? hotTileGo('ArrowUp') : hotMove(-1)),
  ArrowDown: () => (tileKeysOn() ? hotTileGo('ArrowDown') : hotMove(1)),
  ArrowLeft: () => (tileKeysOn() ? hotTileGo('ArrowLeft') : hotTab(-1)),
  ArrowRight: () => (tileKeysOn() ? hotTileGo('ArrowRight') : hotTab(1)),
  Digit1: () => hotGroup(0, true),
  Digit2: () => hotGroup(1, true),
};
// Plain ⌘ + a key, the board's own layout keys: ⌘1 / ⌘2 the halves. They are a separate map because the
// modifier is: ⌥⌘ is "this chat, over there", ⌘ alone is "this window, this shape". ⌘K is not here — the drawer
// takes it for the terminal's clear — and neither are ⌘+ and ⌘−, which are chatZoomKey's. ⌘0 is both: the other
// half goes and the one the keys are in becomes the column (2026-09-22), and with one half there is nothing to close,
// so it is still what it always was — the chat's size back to normal.
// ⌘T and ⌘W are the tabs' (2026-10-13), a browser's and iTerm's: a new one of the kind the keys are in, and that one closed.
const CMDKEYS = {
  Digit1: () => hotGroup(0),
  Digit2: () => hotGroup(1),
  Digit0: hotOnlyHalf,
  KeyT: hotNewTab,
  KeyW: hotClose,
  KeyD: () => hotSplitTile('row'),
  Comma: settingsToggle,
};
// ⇧⌘ (2026-11-25): ⇧⌘D, ⌘D's other way — one over the other.
const CMDSHIFTKEYS = { KeyD: () => hotSplitTile('col') };
// ⌥⌘⇧ (2026-11-24, round XXX's R3): the open chat's card a place up or down in Top priority — ⌥⌘↑↓ walk the cards.
// Tiled (2026-11-25, tileKeysOn): the tile the keys are in moved that way, ←→ too. ⌥⌘⇧T: a zsh on a tab in the half or
// tile the keys are in — never a new tile, never a split.
// ⌃⌘ (2026-11-25): the tabs of the half or tile the keys are in, its strip alone — ⌥⌘←→ walk the tiles once tiled.
const CTRLKEYS = { ArrowLeft: () => hotStripTab(-1), ArrowRight: () => hotStripTab(1) };
// ⌃⌥⌘ (2026-11-25): ⌃⌥⌘T, the tab in front out into a tile of its own — with Auto-tiling on.
const CTRLALTKEYS = { KeyT: hotUntab };
// The tiles' own keys are no keys while they have nothing to do (2026-11-25): ⌘D ⇧⌘D with the setting off, ⌥⌘⇧←→ but
// tiled — the key goes on, to a page or the browser, and the app forwards none of them (`tiles`, Keys.swift's tileKeys).
const keyLive = (code, mods) =>
  mods === 'ctrlalt'
    ? !!prefs.autoTile
    : code === 'KeyD' && (mods === 'cmd' || mods === 'cmdshift')
      ? !!prefs.autoTile
      : mods === 'shift' && (code === 'ArrowLeft' || code === 'ArrowRight')
        ? tileKeysOn()
        : true;
// …and the app's forwarder knows which (`tiles`, Keys.swift): `on` the setting, `arrows` ⌥⌘⇧←→ while they move a
// tile (2026-11-26: tileKeysOn — the column split too, else a pane page keeps them). Posted on a change of either,
// from applySplit — every change of split or chat goes through it — and the switch.
const postTiles = () => {
  const on = !!prefs.autoTile,
    arrows = tileKeysOn();
  if (!inApp || (postTiles.on === on && postTiles.arrows === arrows)) return;
  Object.assign(postTiles, { on, arrows });
  post({ type: 'tiles', on, arrows });
};
const SHIFTKEYS = {
  KeyT: hotTabHere,
  ArrowUp: () => (tileKeysOn() ? hotTileMove('ArrowUp') : hotPrioMove(-1)),
  ArrowDown: () => (tileKeysOn() ? hotTileMove('ArrowDown') : hotPrioMove(1)),
  ArrowLeft: () => (tileKeysOn() ? hotTileMove('ArrowLeft') : false),
  ArrowRight: () => (tileKeysOn() ? hotTileMove('ArrowRight') : false),
};
// Every hotkey says whether it took the key, and ⌘W is the one that is asked: in the app it arrives as the
// Window menu's own ⌘W, which closes the window when the board has nothing to close instead (see Menus.swift).
// A dialog up swallows the rest, as it always did — but not ⌘W, which is how you close the dialog.
const KEYMAPS = {
  altcmd: HOTKEYS,
  cmd: CMDKEYS,
  cmdshift: CMDSHIFTKEYS,
  shift: SHIFTKEYS,
  ctrlcmd: CTRLKEYS,
  ctrlalt: CTRLALTKEYS,
}; // by peixKey's mods
const runHotkey = (code, mods = 'altcmd') => {
  if (code === 'Escape') return hotEscape();
  const fn = KEYMAPS[mods]?.[code];
  if (!fn || !keyLive(code, mods)) return false;
  if ($('#hmenu').open) {
    $('#hmenu').close();
    if (fn === hotClose) return true;
  } // the header's menu is a dialog, but not one that should swallow a key — ⌘W's aside, which closes it alone, as any dialog
  if ($('#room').open) {
    $('#room').close();
    if (fn === hotClose) return true;
  } // …nor is the chat's panel (2026-10-17): a key is back to work
  if (code === 'KeyP' && mods === 'altcmd' && $('#pick').open && pick.mode === 'project') {
    projectAgain();
    return true;
  }
  if (fn === hotGhKey && $('#pick').open && pick.mode === 'pr' && pick.ctx.sid) {
    prPickAgain();
    return true;
  } // the PRs' picker from one of them: ⌥⌘G again is the column's
  if (
    fn !== hotClose &&
    !(fn === settingsToggle && $('#settings').open) &&
    !(fn === lunchToggle && $('#lunchd').open) &&
    !(fn === zeToggle && $('#zeGame').open) &&
    document.querySelector('dialog[open]')
  )
    return false;
  return fn() !== false;
};
document.addEventListener(
  'keydown',
  e => {
    if (!e.metaKey || (e.ctrlKey && e.shiftKey)) return;
    const mods = e.ctrlKey
      ? e.altKey
        ? 'ctrlalt'
        : 'ctrlcmd'
      : e.shiftKey
        ? e.altKey
          ? 'shift'
          : 'cmdshift'
        : e.altKey
          ? 'altcmd'
          : 'cmd';
    if (!KEYMAPS[mods][e.code] || !keyLive(e.code, mods)) return;
    e.stopPropagation();
    if (e.repeat && !e.code.startsWith('Arrow')) return e.preventDefault(); // a key held down is one press — the arrows walk on
    // ⌘W the board did not take — one half, on the chat's tab, nothing up — is left alone (2026-10-14): in the app the
    // web view hands an unprevented key equivalent on to the Window menu, whose Close asks again and closes the window
    // (closeHalfOrWindow); prevented, it was spent and the window stayed
    if (runHotkey(e.code, mods) !== false || mods !== 'cmd' || e.code !== 'KeyW') e.preventDefault();
  },
  true,
);
window.peixKey = runHotkey;
// …and tells the page whether the pane is up and where its edge is (points = this view's CSS px) — the board
// cannot see a native view over it, and window.peix reports it so the harness can.
window.peixPane = (visible, left) => {
  state.paneVisible = !!visible;
  state.paneLeft = Number(left) || 0;
};
// …and whether the window fills the screen (⌃⌘F in the app) and, on a screen with a camera housing, where that is —
// the strip's height and the x range the housing covers, in this page's px — or null on a screen without one (layoutNotch).
window.peixFill = (on, notch) => {
  const was = state.fill,
    heard = state.fillHeard;
  state.fillHeard = true;
  state.fill = !!on;
  state.notch = on && notch && notch.top > 0 ? notch : null;
  layoutNotch();
  fitHeadPrs();
  paintHeadSplit(); // renderHead's order: the chips fold for the new geometry
  if (on && !was && heard) fillHint();
  else if (!on) $('#fillHint')?.remove();
};
// ⌃⌘F's word on the way in (2026-10-13): the fill gone on while this page heard it off — ⌃⌘F, the green button, the
// fish's menu — never on a load or a launch that finds it on (the first word a page hears), and the first FILL_HINTS
// times in all (prefs.fillHints). Under the head row, centred on the housing; a status, so a reader says it too.
const FILL_HINTS = 3,
  FILL_HINT_MS = 3200;
function fillHint() {
  if ((prefs.fillHints || 0) >= FILL_HINTS) return;
  prefs.fillHints = (prefs.fillHints || 0) + 1;
  savePrefs();
  $('#fillHint')?.remove();
  const n = state.notch,
    head = $('#shead').getBoundingClientRect(),
    el = document.createElement('div');
  el.id = 'fillHint';
  el.setAttribute('role', 'status');
  el.innerHTML = `<b>Full screen</b>${n ? ', up to the notch' : ''} · <kbd>⌃⌘F</kbd> leaves it, or the green light after a hold at the top edge`; // beside a housing too (2026-11-01)
  el.style.left = `${n ? (n.left + n.right) / 2 : innerWidth / 2}px`;
  el.style.top = `${Math.round(Math.max(head.bottom, n?.top || 0) + 10)}px`;
  document.body.append(el);
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 300);
  }, FILL_HINT_MS);
}
// The timeline's word (2026-10-17): a chat with PRs opened while its timeline was never seen says it is there, under
// the head row — once a page load, TV_HINTS times in all, never again once the tab has shown (prefs.tvSeen).
const TV_HINTS = 3,
  TV_HINT_MS = 6000;
function tvHint(s) {
  if (
    prefs.tvSeen ||
    (prefs.tvHints || 0) >= TV_HINTS ||
    tvHint.done ||
    !(s.prs || []).length ||
    timelineOpen.has(s.id)
  )
    return;
  tvHint.done = true;
  setTimeout(() => {
    if (state.current !== s.id || prefs.tvSeen || document.querySelector('dialog[open]')) {
      tvHint.done = false;
      return;
    }
    prefs.tvHints = (prefs.tvHints || 0) + 1;
    savePrefs();
    const head = $('#shead').getBoundingClientRect(),
      el = document.createElement('div');
    el.id = 'tvHint';
    el.setAttribute('role', 'status');
    el.innerHTML = `<b>New</b> · <kbd>⌥⌘J</kbd> shows this chat and its PRs in one order — or click a <b>your move</b>`;
    el.style.left = `${Math.round(head.left + head.width / 2)}px`;
    el.style.top = `${Math.round(head.bottom + 10)}px`;
    document.body.append(el);
    setTimeout(() => {
      el.classList.add('out');
      setTimeout(() => el.remove(), 300);
    }, TV_HINT_MS);
  }, 800);
}
const noChat = () => note($('#shead'), 'Open a chat first');
// A chat's own key pressed again from the tab it brings up, the keys in it (2026-10-13): that half fills the column,
// the other kept behind it, and again the two come back — a ⌘0 that undoes itself (toggleZoom). ⌥⌘C on a claude that
// runs here, ⌥⌘T on a zsh, ⌥⌘G on a page at the chat's PR (its repo with none: a page followed elsewhere is not what ⌥⌘G
// brings up), ⌥⌘E on the editor, ⌥⌘D on the changes; with one half, what it always did.
function zoomAgain(on) {
  const s = state.sessions.get(state.current);
  return !!(s && on(tabOf(s), s) && toggleZoom(s));
}
function hotClaudeKey() {
  return zoomAgain((k, s) => k === 'chat' && termLive(s)) || hotClaude();
}
function hotShellKey() {
  return zoomAgain((k, s) => isShellTab(k) && !isVimTab(s, k)) || hotShell();
}
const ghPages = s =>
  s.prs?.length ? s.prs.map(pr => pr.url) : s.cwd && state.repos[s.cwd] ? [state.repos[s.cwd]] : []; // what ⌥⌘G opens
// With several PRs (2026-10-16), ⌥⌘G again from one of them is their picker, the next one selected — ⏎ goes there, and
// ⌥⌘G once more (prPickAgain) fills the column: the other PRs were a mouse's two clicks away while it zoomed at once.
const atPrOf = (s, k) => (isPageTab(k) ? (s.prs || []).find(pr => atPage(paneUrl(k), pr.url)) || null : null);
function hotGhKey() {
  const s = state.sessions.get(state.current),
    at = s && s.prs?.length > 1 && atPrOf(s, tabOf(s));
  if (at)
    return pickOpen('pr', {
      at: at.url,
      sid: s.id,
      zoom: isSplit(s) ? (zoomed.get(s.id) === focusG ? 'back' : 'fill') : null,
    });
  return zoomAgain((k, s) => isPageTab(k) && ghPages(s).some(u => atPage(paneUrl(k), u))) || hotGh();
}
/** ⌥⌘G with its picker up, opened from a PR's page: the picker goes, and that page's half fills the column — or gives it back. */
function prPickAgain() {
  const s = state.sessions.get(pick.ctx.sid);
  $('#pick').close();
  if (s && s.id === state.current) toggleZoom(s);
}
function hotVsCodeKey() {
  return zoomAgain((k, s) => /^ide:/.test(k || '') || isVimTab(s, k)) || hotVsCode();
}
function hotDiffKey() {
  return zoomAgain(k => k === 'changes') || hotDiff();
}
/** ⌥⌘R (2026-10-13; ⌘R's before, which is the page's in the pane now): the board, reloaded where it is. */
function hotReload() {
  location.reload();
}
const focusBoard = () => {
  if (inApp) post({ type: 'focus' });
}; // the key may have come from the pane: the board needs the keyboard back
function hotClaude() {
  const s = state.sessions.get(state.current);
  if (!s) return noChat();
  const tb = $('#termBtn');
  if (!tb) return;
  if (tb.disabled) return note(seen(tb), tb.title, true); // live somewhere it cannot be attached from — the tooltip says where
  focusBoard();
  termAction(s);
}
// ⌥⌘O (2026-09-20):
// ⌥⌘N with its project answered and the environment brought forward — oracle's environments first, then that
// environment's open chats with ＋ new chat among them (2026-09-21). The folder is the project the cog names for ⌥⌘O
// (state.config.quick — oracle here, written into this file until 2026-09-28): a folder of its own, a pin or a named
// set of folders. None named, or nothing has run there in 30 days and it is off the board — a note then, and ⌥⌘N is
// the way in.
function hotOracle() {
  const name = state.config.quick;
  if (!name)
    return note(
      $('#shead'),
      'No project for ⌥⌘O yet — Settings › Projects names one (⌘,) · ⌥⌘N starts a chat anywhere',
    );
  const p = projectList().find(x => x.name === name && x.cwds.length);
  if (!p) return note($('#shead'), `No ${name} folder on the board — ⌥⌘N starts a chat anywhere`);
  focusBoard();
  if (p.cwds.length === 1) newChatIn(p.cwds[0], 'chats');
  else pickOpen('folder', { cwds: p.cwds, then: 'chats' }); // one folder: straight to the environments
}
// Esc with a page's tab on (2026-09-20): the chat tab, and the pane
// goes. Reaches here from the shell (peixKey('Escape'), pressed on a page in the pane, which the shell swallows) and
// from the page's own Esc with the pane up, outside a terminal or a box (2026-10-14) — a dialog (the settings are one)
// closes first.
// Split, the chat is in the left half and the keys go there; the page beside it stays up (showChat).
function hotEscape() {
  if (renderBoard.held) {
    cdEnd(false);
    return true;
  } // a card in the hand goes back first (2026-11-02)
  const dlg = document.querySelector('dialog[open]');
  if (dlg) {
    dlg.close();
    return true;
  }
  const s = state.sessions.get(state.current);
  if (s && isBlankTab(tabOf(s))) {
    blankEscape(s, tabOf(s));
    return true;
  } // the keys on the board but not in its box, which has its own esc
  if (!s || !isPaneTab(tabOf(s))) return false;
  showChat(s);
  syncTerm(s);
  focusBoard();
  return true;
}
function hotVsCode() {
  const b = $('#webBtn');
  if (b) b.click();
  else noChat();
}
// ⌥⌘V (2026-10-14): the folder in the external editor — VS Code, or Zed when that is picked (2026-10-21; VS Code
// whatever the pick before) —, its own window, outside the board; ⌥⌘E is the board's own, on a tab. The open chat's
// folder, else the project in view when that is a folder.
function hotEditorApp() {
  const dir = state.sessions.get(state.current)?.cwd || (prefs.project?.startsWith('/') ? prefs.project : null);
  if (!dir) return note($('#shead'), 'Open a chat first — or pick a project that is a folder');
  if (zedMissing()) return zedNote($('#shead'));
  openExternal(fileUrl(dir));
}
// ⌥⌘↑ / ⌥⌘↓ (2026-09-20): the chat above or below in the list as it stands — filters and order included; from no
// chat, or one the list does not show, the top or the bottom; the ends stop.
// ⌥⌘F (2026-09-25): the chat list's magnifier, from anywhere, and it
// matches as K does — what K has that the list did not was the matcher, not the dialog. The list keeps what the
// picker hides: the done chats, the project in view, the state chips. Hidden, the list shows for it (qShow).
function hotFind() {
  focusBoard();
  qShow(true);
}
function hotMove(dir) {
  const cards = [...document.querySelectorAll('#slist > .card')];
  if (!cards.length) return note($('#shead'), 'No chats in this list');
  const i = cards.findIndex(c => c.dataset.id === state.current);
  const next = cards[i < 0 ? (dir > 0 ? 0 : cards.length - 1) : Math.max(0, Math.min(cards.length - 1, i + dir))];
  if (next.dataset.id !== state.current) openSession(next.dataset.id);
}
// ✓ and ↩ — the card's, and the chats step's ✓. Ticking the open chat moves on (2026-09-30): to the card below it in
// the list as shown, the one that slides into its place, else the one above; done cards are skipped, and a chat
// ticked while another is open moves nothing. The move is made at the click, not on the answer: an empty chat's
// `session` event would leave it first.
// A tick is felt (2026-10-11, Things' checkbox): the ✓ fills and draws its stroke where it was clicked, and the
// server is told once it has (TICK_MS) — its answer redraws the card, as done or gone, which would take the mark with it.
const TICK_MS = 230;
// Done for good (2026-10-11; ··· , a card's menu and the launcher): the server forgets the chat's PRs while the tick stands.
// A watching chat's ✓ asks once more (2026-10-31, round XIII): Done ends the chat's processes, its monitor or command
// with them, so a first tick of one arms it — the card's ✓ says what it ends, elsewhere a note — and only a second
// within ARM_MS ticks. Every way to tick comes through here: the card's ✓, the chats step's, the menus', the
// notification's Done. It ends nothing itself.
const ARM_MS = 5000;
function tickGate(id, anchor) {
  const s = state.sessions.get(id),
    ends = s && watchEnds(s);
  if (!ends) return true;
  if (armedOn(id)) {
    tickArmed.delete(id);
    return true;
  }
  tickArmed.set(id, performance.now() + ARM_MS);
  noteMotion(id, 'arm');
  if (!anchor?.closest?.('#slist .card'))
    note(
      anchor?.isConnected
        ? anchor
        : document.querySelector(`#slist > .card[data-id="${CSS.escape(id)}"]`) || $('#shead'),
      `Done ends its watch — ${ends}. Tick it again to end it`,
    );
  const redraw = () => {
    renderBoard();
    if ($('#pick').open) pickRender(true);
  };
  setTimeout(() => {
    if (tickArmed.has(id) && !armedOn(id)) {
      tickArmed.delete(id);
      redraw();
    }
  }, ARM_MS + 30);
  redraw();
  return false;
}
