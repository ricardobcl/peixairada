  // ---- chat header -------------------------------------------------------------------
  // Whose move a PR is at (the server's prTurn, 2026-09-28): `you` — pushed since your review, replied to, reviewed —
  // fills its chip, on the card and in the header, and its row says why; `them` only says so in the tooltip.
  const turnOf = pr => pr.turn ? (pr.turn.you ? 'you' : 'them') : '';
  const turnTip = pr => !pr.turn ? '' : pr.turn.you ? `your move — ${pr.turn.why}` : pr.turn.waived ? `your move, let go this round — ${pr.turn.why}; the next move tells you` : pr.turn.why;
  // A PR's CI on its head commit (2026-10-09, the chat header only — the cards have enough to say): GitHub's rollup of
  // its checks, a badge on the header's chip and a word on its row; none for a PR merged or closed.
  const prCk = pr => pr.checks && (pr.state === 'open' || pr.state === 'draft') ? pr.checks : null;
  const CK_TIP = { pass: 'checks passed', fail: 'checks failing', pending: 'checks running' };
  const CK_ICON = { pass: '<path d="M3.6 8.3 6.6 11.2 12.4 4.9" />', fail: '<path d="M4.8 4.8 11.2 11.2M11.2 4.8 4.8 11.2" />', pending: '<circle cx="8" cy="8" r="4.6" />' };
  const ckHtml = (pr, said = false) => { const c = prCk(pr); return c ? `<i class="ck" data-checks="${c}"><svg viewBox="0 0 16 16" aria-hidden="true">${CK_ICON[c]}</svg>${said ? '' : `<span class="vh">, CI ${c === 'pass' ? 'passed' : c === 'fail' ? 'failing' : 'running'}</span>`}</i>` : ''; };   // in words too (2026-10-12), but where the row says them (said)
  const UNLINK_TIP = '⌥-click: take it off this chat — naming it again yourself brings it back';
  // its age and the tooltip that says it are fillAges's (2026-10-14): the clock in the markup redrew the rows, and a row
  // pressed as it was redrawn opened nothing
  const COPY_LINK = `<span class="prcopy" aria-hidden="true" title="Copy its link">${ICON.copyAddr}${ICON.copied}</span>`;   // a row's (2026-10-21)
  const prTip = pr => `${pr.url}\nlast mentioned ${rel(pr.lastAt)} ago · ${pr.count} mention${pr.count === 1 ? '' : 's'}${pr.turn ? `\n${turnTip(pr)}` : ''}\n${UNLINK_TIP}`;
  const prRow = pr => `<a class="prrow" data-state="${esc(pr.state || '')}" data-turn="${turnOf(pr)}" data-url="${esc(pr.url)}" href="${/^https:\/\//.test(pr.url) ? esc(pr.url) : '#'}" target="_blank" rel="noopener"><span class="st">${esc(pr.state || 'PR')}</span><span class="num">${esc(pr.label)}</span><span class="t${pr.title ? '' : ' pending'}">${pr.title ? esc(pr.title) : 'title on its way from gh…'}</span>${COPY_LINK}${pr.turn?.you ? `<span class="why">your move · ${esc(pr.turn.why)}</span>` : pr.turn?.waived ? `<span class="why let">let go · ${esc(pr.turn.why)}</span>` : ''}${prCk(pr) ? `<span class="ckw" data-checks="${prCk(pr)}">${ckHtml(pr, true)}${{ pass: 'passed', fail: 'failing', pending: 'running' }[prCk(pr)]}</span>` : ''}<span class="meta" data-at="${esc(pr.lastAt || '')}"></span></a>`;
  // Where each of a chat's PR branches is checked out (2026-10-13): the checkout's working trees, asked when the PR rows
  // or the changes tab's picker want them and kept a while (GET /api/worktrees) — only for a chat with PRs.
  const wtData = new Map();   // cwd → { at, v, asking }
  function wtOf(cwd, then) {
    if (!cwd) return null;
    const hit = wtData.get(cwd);
    if (!hit || (!hit.asking && Date.now() - hit.at > 10_000)) {
      wtData.set(cwd, { ...hit, asking: true, at: hit?.at || 0 });
      api('GET', `/api/worktrees?cwd=${encodeURIComponent(cwd)}`).catch(e => ({ error: e.message }))
        .then(v => { const was = JSON.stringify(wtData.get(cwd)?.v ?? null); wtData.set(cwd, { at: Date.now(), v }); if (was !== JSON.stringify(v)) then?.(); });
    }
    return hit?.v || null;
  }
  /** …asked now, for a menu that acts on it: the trees as they are, node_modules and all. */
  async function wtNow(cwd) { const v = await api('GET', `/api/worktrees?cwd=${encodeURIComponent(cwd)}`).catch(e => ({ error: e.message })); wtData.set(cwd, { at: Date.now(), v }); return v; }
  /** Where a PR's head is: in this folder, another working tree of the checkout, nowhere here, or in another repo than
   *  the checkout's — by the branch's name, or for a fork's PR (whose name means nothing here) a tree detached at it. */
  function whereOf(s, pr) {
    const w = wtOf(s.cwd), r = pr.refs; if (!w || w.error || !pr.number) return null;
    if (!w.repo || !pr.url.startsWith(`https://github.com/${w.repo.toLowerCase()}/`)) return { k: 'away', t: 'not this folder’s repo' };
    if (!r) return null;
    const t = r.fork ? w.worktrees.find(x => x.detached && x.head === r.headOid) : w.worktrees.find(x => x.branch === r.head);
    if (!t) return { k: 'none', t: r.fork ? 'a fork’s, not checked out' : 'not checked out' };
    return { k: t.path === w.here ? 'here' : 'wt', t: t.path === w.here ? 'this folder' : t.path === w.main ? 'the repo’s folder' : `worktree ${t.path.split('/').pop()}`, path: t.path };
  }
  /** A PR's row and its own controls beside it (2026-10-13): where its branch lives, Diff, and — for a PR of this
   *  checkout's repo whose branch GitHub has named — the editor at that branch. */
  const prLine = (s, pr) => {
    const w = whereOf(s, pr), ed = w && w.k !== 'away' && pr.refs, round = roundLine(s, pr);
    return `<div class="prline${round ? ' withround' : ''}">${prRow(pr)}${w ? `<span class="prwhere ${w.k}"${w.path ? ` title="${esc(w.path)}"` : ''}>${ICON.branch}${esc(w.t)}</span>` : ''}${pr.number ? `<span class="practs"><button type="button" class="pract" data-pract="timeline" data-url="${esc(pr.url)}" title="Its timeline: this PR’s events and the turns about it, in one order (⌥⌘J)">Timeline</button><button type="button" class="pract" data-pract="diff" data-url="${esc(pr.url)}" title="Its diff in the changes tab, as GitHub shows it — read from origin, nothing checked out">Diff</button>${
      ed ? `<button type="button" class="pract" data-pract="editor" data-url="${esc(pr.url)}" aria-haspopup="menu" title="Its branch in the editor — the folder that has it, or a worktree of its own">Editor ▾</button><button type="button" class="pract" data-pract="chat" data-url="${esc(pr.url)}" aria-haspopup="menu" title="A new chat on its branch — in the folder that has it out, else in a worktree of its own; plain, or as an agent">Chat ▾</button>` : ''}</span>` : ''}</div>${round}`;
  };
  /** A ticket's row under the header, after the PRs' (2026-10-08): its status, key, summary, and whose it is. */
  const ticketRow = t => `<a class="prrow tk" data-cat="${esc(t.cat)}" href="${/^https?:\/\//.test(t.url) ? esc(t.url) : '#'}" target="_blank" rel="noopener" title="${esc(`${t.url}\n${ticketTip(t)}`)}"><span class="st">${esc(t.status || t.cat)}</span><span class="num">${esc(t.key)}</span><span class="t">${esc(t.summary || t.key)}</span>${COPY_LINK}<span class="who${t.assignee?.me ? ' me' : ''}">${t.assignee ? esc(t.assignee.me ? 'yours' : t.assignee.name) : 'unassigned'}</span></a>`;
  // Claude Code's own /focus — "just your prompt, summary, and response", every step in between hidden — on the
  // session running in the drawer (2026-09-20). It is the running CLI's state, not the board's: there is no key and no
  // API for it, so the button types the command into our own holder and reads the line the session prints back — what
  // it shows is what the session said, never what we asked for. No drawer, no button.
  const focusView = new Map();   // session id → what its drawer last said; page state, it dies with the process
  const focusOn = id => focusView.get(id) === true;
  const viewTip = s => focusOn(s.id)
    ? 'Focus view is on in this session — your prompt, the summary and the reply only. Click to show every step again (/focus in the terminal)'
    : 'Focus view: your prompt, the summary and the reply only, the steps hidden. Click to turn it on (/focus in the terminal)';
  const WEB_TIP = "Open this folder in VS Code Web — the editor served locally by `code serve-web`, in the pane here (a separate VS Code: trust the folder once, then Claude Code is in its sidebar) · ⌥⌘E";
  const ZED_TIP = "Open this folder in Zed — its own window, outside the board: Zed has no web version the pane could show (⌥⌘E is the in-app editor here) · ⌥⌘V";
  const VIM_TIP = "Open this folder in vim — in a terminal on a tab beside the chat; :q closes it, as does its × (which leaves it up, saying so, over unsaved work) · ⌥⌘E";
  // The header, the menu and the PR rows are set only when their markup changed (2026-09-27): every SSE update of the
  // open chat rebuilt all three — a live <dialog>, its rows detached under the pointer — and rebound nine handlers,
  // then laid the notch and the chips out again. The handlers are still bound on every call: they close over `s`,
  // the chat as it is now. A rename edits the title in place, so it forces the next draw (editTitle).
  const drawn = { head: null, menu: null, prs: null };
  function renderHead(s) {
    // The open chat's only (2026-10-03): a timer or an answer that came after the chat was left — the take-over's
    // disarm, its spawn, the focus view's wait — drew its chat's header, menu and window title over the open one's.
    if (!s || s.id !== state.current) return;
    if (state.titleEdit === s.id && $('#shead .tedit')) return;   // a rename in progress: leave the header alone until it ends
    state.titleEdit = null;   // …one whose box went with a header drawn for another chat is over
    $('#chat').classList.toggle('vsc', inVsCode(s));
    tintChat(repoColor(s.cwd));
    wantDiffStat(s);   // the +n −n chip (2026-10-10): asked a few seconds apart at most
    // One row: title · [dot+age] · buttons. No status word — the dot carries it in colour; what it cannot say is how
    // long ago. The dot and its age *are* the details button (2026-09-20 — the dot, the age and a ··· were three things
    // for one fold): a click shows path, branch and session details under the row. The chat's PRs are the card's matrix in the row
    // (headMatrix, fitHeadPrs), and a click on the git mark beside it the block under it, one per row (#prlist).
    const take = takeable(s), armed = take && drawer.arm === s.id;
    const menu = $('#hmenu'); if (menu.open && menu.dataset.id !== s.id) menu.close();   // another chat: its own menu, shut
    menu.dataset.id = s.id;
    const loud = !!drawer.err;   // >_ with something to say stays in the row, where it is seen; armed, the bar says it (renderElsewhere)
    const termBtn = cls => `<button class="${cls}${drawer.err ? ' err' : termLive(s) && termFor(s.terminal.id) ? ' on' : take ? (armed ? ' take arm' : ' take') : ''}" id="termBtn" title="${esc(termTip(s))}" aria-label="Terminal"${!termLive(s) && s.alive && !take && !attachable(s) ? ' disabled' : ''}>${ICON.term}`;
    const termWord = drawer.err ? 'failed' : take ? (armed ? sureWord(s) : 'take over') : termLive(s) ? 'Claude in its drawer' : attachable(s) ? 'attach' : 'Claude here';
    // the PRs at your move lead the rows, the newest move first — the one the move's line names (2026-10-12)
    const prs = [...(s.prs || [])].sort((a, b) => (turnOf(b) === 'you') - (turnOf(a) === 'you') || (turnOf(a) === 'you' ? String(b.turn.movedAt || '').localeCompare(String(a.turn.movedAt || '')) : 0)), tks = s.tickets || [], prsOpen = !!prefs.prsOpen;
    const said = [prs.length ? `${prs.length} PR${prs.length === 1 ? '' : 's'}` : '', tks.length ? `${tks.length} ticket${tks.length === 1 ? '' : 's'}` : ''].filter(Boolean).join(' and ');
    const hprs = !prs.length && !tks.length ? '' : `<button class="hgit${prsOpen ? ' on' : ''}" id="prToggle" aria-controls="prlist" aria-expanded="${prsOpen}" aria-label="${said}: ${prsOpen ? 'fold the list' : 'list them'}" title="${said} in this chat: click to ${prsOpen ? 'fold the list' : 'list them, one per row'}${prs.length ? ' · ⌥⌘G opens a PR' : ''}">${ICON.pr}${rn(`hgit:${s.id}`, prs.length + tks.length)}</button>`;
    const headHtml = `<h2${s.agent ? ' class="ag"' : ''} title="${esc(titleTip(s) || `${s.project} / ${s.title}`)}"><span class="repo${scopedOn(s) ? ' on' : ''}" title="${scopedOn(s) ? 'Every project again (ALL)' : 'Show this folder\'s chats — click again for every project'}">${projIcon(s.project)}${esc(s.project)}${REPO_FUN}</span><span class="sep">${s.cwd ? sqHtml({ name: s.project, cwds: [projDir(s.cwd)] }) : ''}</span><span class="t" title="Double-click to rename${s.boardTitle ? ' (renamed here)' : ''}">${ticks(esc(s.title))}</span>${agentTag(s)}</h2>
      ${driftChip(s)}${diffChip(s)}${headMove(s)}${headMatrix(s)}${hprs}${taskChip(s)}
      ${s.cwd && loud ? `${termBtn('btn icon')}<span class="lbl">${termWord}</span></button>` : ''}
      <button class="hmore" id="moreBtn" aria-haspopup="dialog" aria-expanded="false" title="This chat: Claude in its drawer, a shell, ${inEdName()}${onZed() ? ', its folder in Zed' : ''}, its changes, focus view, path and branch — and the settings">${ICON.more}</button>${prefs.space ? '<button type="button" class="hspx" id="spClose" aria-label="Close the chat — Claude keeps running" title="Close the chat — Claude keeps running (⌘W)"><svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M2.5 2.5l7 7M9.5 2.5l-7 7"/></svg></button>' : ''}
      <div class="details"${prefs.headDetails ? '' : ' hidden'}>
        <span class="path">${esc(s.cwd || '')}${s.gitBranch && s.gitBranch !== 'HEAD' ? ' @ ' + esc(s.gitBranch) : ''}</span>
        ${s.live ? `<span class="chip">${entryLabel(s)}</span>` : ''}${s.live?.name ? `<span class="chip" title="session name">${esc(s.live.name)}</span>` : ''}${
          s.model ? `<span class="chip">${esc(s.model)}</span>` : ''}${s.alive && s.live?.pid ? `<span class="chip">pid ${s.live.pid}</span>` : ''}
      </div>`;
    const headNew = headHtml !== drawn.head; if (headNew) { $('#shead').innerHTML = drawn.head = headHtml; $('#shead').dataset.sid = s.id; rollSoon(); fadeSoon(); tvHint(s); }
    fillAges($('#shead'));
    // The menu, one row per action: its mark, what it does, and its state or key on the right. The ids are the
    // buttons' own from when they sat in the row — the hotkeys and the harness reach them by those.
    const menuHtml = [
      s.cwd && !loud ? `${termBtn('hmi')}<span class="lbl">${termWord}</span><span class="k">⌥⌘C</span></button>` : '',
      termLive(s) ? `<button class="hmi${focusOn(s.id) ? ' on' : ''}" id="viewBtn" aria-pressed="${focusOn(s.id)}" title="${esc(viewTip(s))}">${ICON.view}<span>focus view</span><span class="k">${focusOn(s.id) ? 'on' : 'off'}</span></button>` : '',
      s.cwd ? `<button class="hmi" id="chgBtn" title="What this chat changed in its folder — the diff, by turn, uncommitted or the branch">${ICON.diff}<span class="lbl">changes</span><span class="k">⌥⌘D</span></button>` : '',
      `<button class="hmi" id="tvBtn" title="This chat and its PRs in one order: your prompts, Claude's turns, the PRs' events between them">${ICON.timeline}<span class="lbl">timeline</span><span class="k">⌥⌘J</span></button>`,
      s.file ? `<button class="hmi" id="branchBtn" title="A copy of this chat in a drawer of its own — claude --resume --fork-session; this one goes on as it is">${ICON.branch}<span class="lbl">branch from here</span><span class="k"></span></button>` : '',
      linkMenuHtml(s),   // the chats tied to it: merged, folded, branched (2026-10-31)
      s.cwd ? `<button class="hmi" id="webBtn" title="${onVim() ? VIM_TIP : WEB_TIP}">${onVim() ? ICON.vim : ICON.vscode}<span class="lbl">${inEdName()}</span><span class="k">⌥⌘E</span></button>` : '',
      s.cwd && onZed() ? `<button class="hmi" id="zedBtn" title="${ZED_TIP}">${ICON.zed}<span class="lbl">its folder in Zed</span><span class="k">⌥⌘V</span></button>` : '',
      // what a tab's × does, for the tabs that lose their strip alone in a half (2026-09-28) — ⌘W with the keys in it
      shellLive(s) ? `<button class="hmi" id="shellEndBtn" title="End this chat's ${shName()}${zshsOf(s).length > 1 ? ' the keys are in, else its first,' : ''} and close its tab — exit in it does the same · ⌘W with the keys in it"><span class="gl">×</span><span>end the ${shName()}</span><span class="k"></span></button>` : '',
      ideKey(s) ? `<button class="hmi" id="ideCloseBtn" title="Close VS Code Web's tab — ⌥⌘E opens it again · ⌘W in it once no editor is open, ⌥⌘W any time"><span class="gl">×</span><span>close VS Code Web</span><span class="k"></span></button>` : '',
      inVsCode(s) ? `<div class="hmi info" title="VS Code's chat — its extension ${s.alive ? 'runs' : 'ran'} the Claude behind it; ${s.alive ? 'the Claude here row takes it over' : 'continue it here or there'}">${ICON.vscode}<span>VS Code's chat</span><span></span></div>` : '',
      `<button class="hmi${s.muted ? ' on' : ''}" id="muteBtn" aria-pressed="${!!s.muted}" title="No banner, sound or count from this chat, questions too, till you unmute it — its card says so and still shows what it does">${ICON.bellOff}<span>mute notifications</span><span class="k">${s.muted ? 'on' : 'off'}</span></button>`,
      // pinned or not, and a snooze (2026-11-24, round XXX's A4, S4)
      prioOn() ? `<button class="hmi${inPrio(s) ? ' on' : ''}" id="prioBtn" aria-pressed="${inPrio(s)}" title="${inPrio(s) ? 'Unpin it' : 'Pin it — the section atop the list, in your order'}">${ICON.prio}<span>pin</span><span class="k">${inPrio(s) ? 'on' : '⌥⌘I'}</span></button>` : '',
      asking(s) ? '' : `<button class="hmi${asleep(s) ? ' on' : ''}" id="zzBtn" title="${asleep(s) ? esc(`Snoozed ${snoozeSay(s.snooze)} — click to wake it now`) : 'Put it away till a time, or till something happens — it comes back at the top of its lane'}">${ICON.moon}<span>${asleep(s) ? 'wake it now' : 'snooze…'}</span><span class="k">${asleep(s) ? 'snoozed' : '⌥⌘S'}</span></button>`,
      canTick(s) && s.prs?.length && !s.forGood ? `<button class="hmi" id="forGoodBtn" title="Tick it done and forget its PRs: a push, a review or a reply on one no longer brings it back, moves it up or alerts you — a word in it, or ↩, ends that">${ICON.tick}<span>done for good</span><span class="k"></span></button>` : '',
      s.removed ? `<button class="hmi" id="undelBtn" title="Its card back on the list">${ICON.tick}<span>put it back on the board</span><span class="k"></span></button>`
        : `<button class="hmi" id="delBtn" title="Off the list and every count, whatever it is doing: its claude ends, the transcript stays. ⌥⌘K, typed, finds it">${ICON.forget}<span>delete from the board</span><span class="k">⌥-click ✓</span></button>`,
      '<div class="sep"></div>',
      `<button class="hmi${prefs.headDetails ? ' on' : ''}" id="detailsBtn" aria-expanded="${!!prefs.headDetails}" title="${esc(statusLabel[s.status] || s.status)} · click to ${prefs.headDetails ? 'hide' : 'show'} path, branch and session details under the title"><span class="dot ${s.status}"></span><span>${esc((statusLabel[s.status] || s.status || '').split(' — ')[0])}${s.statusSince ? ` · <span data-at="${esc(s.statusSince)}"></span>` : ''}</span><span class="k">${prefs.headDetails ? 'hide' : 'show'} path</span></button>`,
      '<div class="sep"></div>',
      '<div class="sep"></div>',
      `<button class="hmi" id="settingsBtn" title="The board's settings, its setup and its keys">${ICON.cog}<span>settings</span><span class="k">⌘,</span></button>`,
    ].join('');
    if (menuHtml !== drawn.menu) { menu.innerHTML = drawn.menu = menuHtml; fillAges(menu); phaseAnims(); if (menu.open) placeMenu(); }   // the state dot's pulse, rebuilt with the menu — and its age, which the markup leaves out
    const pl = $('#prlist'); pl.hidden = (!prs.length && !tks.length) || !prsOpen;   // the rows are there folded too — ⌥⌘G and the harness read them
    if (prs.length) wtOf(s.cwd, () => renderHead(state.sessions.get(s.id)));   // where their branches are, for the rows
    // The list (2026-10-21): the timeline up top, a key away; every row in a window that scrolls, its two ends saying
    // what is out of sight past them (prEdges, as the chat list's); at the foot an arrow up that folds it as the chips do
    // (2026-10-13) — where the eye ends up, under the rows. The rows were six, the rest behind "… n more", before.
    pl.style.setProperty('--prs-h', prefs.prsHeight ? `${prefs.prsHeight}px` : '');
    const prsHtml = (prs.length ? `<div class="ptop"><button type="button" class="ptl" id="prTl" title="This chat and its PRs in one order: your prompts, Claude's turns, the PRs' events between them — on a tab (⌥⌘J)">${ICON.timeline}<span>Timeline</span><kbd>⌥⌘J</kbd></button></div>` : '')
      + `<div class="pwin"><div class="pscroll" id="prScroll">${[...prs.map(pr => prLine(s, pr)), ...tks.map(ticketRow)].join('')}</div>`
      + '<div class="pedge up"><button type="button" data-dir="-1" tabindex="-1"></button></div><div class="pedge down"><button type="button" data-dir="1" tabindex="-1"></button></div></div>'
      + `<div class="pfoot"><button class="pfold" id="prFold" aria-controls="prlist" aria-label="Fold the list" title="Fold the list — the git mark in the header does the same">${ICON.up}</button></div>`;
    if (prsHtml !== drawn.prs) {
      const was = state.prsFor === s.id ? $('#prScroll')?.scrollTop || 0 : 0;   // the same chat's list redrawn keeps its place
      pl.innerHTML = drawn.prs = prsHtml;
      if (was) $('#prScroll').scrollTop = was;
    }
    state.prsFor = s.id;
    fillAges(pl); prEdgesSoon();
    // pressed from the keyboard (no clicks counted, the button focused), the keys stay on the chips: the header they sat
    // in, or the arrow, is gone with the draw
    const showPrs = (open, e) => { const keys = !e.detail && document.activeElement === e.currentTarget; prefs.prsOpen = open; savePrefs(); renderHead(s); if (keys) $('#prToggle')?.focus(); };
    const pt = $('#prToggle'); if (pt) pt.onclick = e => showPrs(!prefs.prsOpen, e);
    // a square or the number opens its PR, as a card's does; ⌥ takes it off the chat; a ticket's dot opens the ticket
    const hm = $('#shead > .tmx'); if (hm) hm.onclick = e => {
      const c = e.target.closest('[data-url]'); if (c) return e.altKey ? unlinkPr(s, c) : showPr(c.dataset.url);
      const tk = e.target.closest('.tk[data-key]'), t = tk && (s.tickets || []).find(x => x.key === tk.dataset.key);
      if (t && /^https?:\/\//.test(t.url)) openExternal(t.url, { s });
    };
    pl.querySelector('#prFold').onclick = e => showPrs(false, e);
    const tl = pl.querySelector('#prTl'); if (tl) tl.onclick = () => hotTimeline();
    if (headNew) { if (mxt.a && !mxt.a.isConnected) mxtHide(); layoutNotch(); fitHeadPrs(); paintHeadSplit(); postChat(s); if (menu.open) { $('#moreBtn').classList.add('on'); $('#moreBtn').setAttribute('aria-expanded', 'true'); } }   // the menu's state is not the markup's: opening it redrew the whole header
    renderResume(s); renderRival(s); tvSoon();
    $('#detailsBtn').onclick = () => { prefs.headDetails = !prefs.headDetails; savePrefs(); renderHead(s); };
    const wb = $('#webBtn');
    const zb = $('#zedBtn'); if (zb) zb.onclick = () => { menu.close(); if (zedMissing()) zedNote(seen(zb)); else openExternal(fileUrl(s.cwd)); };   // Zed's own window: nothing to start, no tab
    if (wb) wb.onclick = async () => {
      if (onVim()) { menu.close(); return openVim(s, s.cwd, seen(wb)); }
      wb.disabled = true; wb.querySelector('.lbl').textContent = 'starting…';
      try {
        const d = await api('POST', '/api/vscode-web');
        wb.querySelector('.lbl').textContent = 'VS Code Web';
        menu.close(); openExternal(vswebAt(d, s.cwd), { ide: true, s });
      } catch (e) { wb.classList.add('err'); wb.title = e.message; wb.querySelector('.lbl').textContent = 'failed'; note(seen(wb), `VS Code Web: ${wb.title}`, true); }
      finally { wb.disabled = false; }
    };
    const tb = $('#termBtn'); if (tb) tb.onclick = () => { menu.close(); termAction(s); };
    const cb = $('#chgBtn'); if (cb) cb.onclick = () => { menu.close(); hotDiff(); };
    $('#tvBtn').onclick = () => { menu.close(); hotTimeline(); };
    for (const b of menu.querySelectorAll('[data-lnk]')) b.onclick = () => { menu.close(); openSession(b.dataset.lnk, { locate: true }); };
    const bb = $('#branchBtn'); if (bb) bb.onclick = () => { menu.close(); branchChat(s); };
    const sb = $('#shellEndBtn'); if (sb) sb.onclick = () => { menu.close(); const k = isShellTab(tabOf(s)) && !isVimTab(s, tabOf(s)) ? tabOf(s) : shellLive(s) && 'shell:' + zshsOf(s)[0].id; if (k) dropTab(s, k); };
    const ib = $('#ideCloseBtn'); if (ib) ib.onclick = () => { menu.close(); if (ideKey(s)) dropTab(s, ideKey(s)); };
    const fg = $('#forGoodBtn'); if (fg) fg.onclick = () => { menu.close(); tickDone(s.id, true, $('#shead'), null, true); };
    const db = $('#delBtn'); if (db) db.onclick = () => { menu.close(); removeChat(s.id, $('#shead')); };
    const ub = $('#undelBtn'); if (ub) ub.onclick = () => { menu.close(); restoreChat(s.id); };
    $('#settingsBtn').onclick = () => settingsOpen(true);
    $('#moreBtn').onclick = e => { e.stopPropagation(); if (menu.open) menu.close(); else openMenu(); };
    const spx = $('#spClose'); if (spx) spx.onclick = spCloseChat;   // Space's ×: the chat closed, Claude left running (2026-11-18)
    const vb = $('#viewBtn'); if (vb) vb.onclick = () => toggleFocusView(s);
    $('#muteBtn').onclick = () => setMuted(s.id, !state.sessions.get(s.id)?.muted);   // a toggle: the menu stays up
    const pib = $('#prioBtn'); if (pib) pib.onclick = () => { const cur = state.sessions.get(s.id) || s; prioPut(cur, !inPrio(cur), null, $('#shead')); };   // a toggle too
    const zzb = $('#zzBtn'); if (zzb) zzb.onclick = () => { const cur = state.sessions.get(s.id) || s; menu.close(); if (asleep(cur)) snoozeIt(cur, { undo: true }, $('#shead')); else snoozeMenu(cur); };
    $('#shead .repo').onclick = () => { if (s.cwd) selectProject(scopedOn(s) ? ALL : projDir(s.cwd)); };   // a toggle (2026-10-08), a named project's too (2026-11-04)
    $('#shead h2 .t').ondblclick = () => editTitle(s);
  }
  // The header's PR chips take whatever the row has (2026-09-24): all
  // of them are drawn, and the last ones fold into +n only while the row would otherwise crowd the title — its repo
  // name and TITLE_ROOM of the title itself stay clear. At least one chip always shows. Run on every header draw and
  // on every change of the header's size.
  const TITLE_ROOM = 160;
  // The app filling the screen, camera housing included (2026-09-27): the shell says where the housing is in this
  // page's px (peixFill — the strip's height, and the x range the housing covers) and the top row lays itself around
  // it. The chat list's head stays where it is while the list ends short of the housing; the chat header keeps its
  // title left of the housing and its chips and ··· right of it — the h2 given a width that ends NOTCH_PAD short of the
  // housing and a right margin that carries the next item NOTCH_PAD past it — while both sides have the room
  // (NOTCH_TITLE for the name and some title, NOTCH_TAIL for the chips and ···). What has not the room pads down by the
  // strip instead (.npad), so nothing sits under the housing; a header wholly right of it lifts as it is. Run on every
  // header draw and every change of its size, since a resize moves the hole; nothing else on the page knows about the
  // fill.
  const NOTCH_PAD = 10, NOTCH_TITLE = 220, NOTCH_TAIL = 120;
  // the housing has a tile's border round it, hugging it (tileNotch, 2026-10-11, later; the tiles' gap away before):
  // the row keeps clear of that too
  const notchPad = () => NOTCH_PAD + 2;
  // The floating header's title runs on under the housing rather than jump it (2026-10-11, late night): the header dips
  // round the housing, and under the dip there is just about a line's room. Where the glyphs would touch the dip's
  // line, the header is lowered by what they need to clear it by HEAD_CLEAR — lowered, not padded, so its row stays
  // centred — up to HEAD_DROP_MAX; past that the title jumps the housing. The glyphs' top is the
  // canvas's measure of the title in its own font, and of 'Hdl' at least, so two titles of one font lower it alike.
  const HEAD_CLEAR = 2, HEAD_DROP_MAX = 8;
  function headDrop(head, t, tr, n) {
    const cs = getComputedStyle(t), c = headDrop.c ||= document.createElement('canvas').getContext('2d');
    c.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const m = c.measureText(t.textContent), ink = Math.max(m.actualBoundingBoxAscent, c.measureText('Hdl').actualBoundingBoxAscent);
    const top = tr.top + m.fontBoundingBoxAscent - ink - (parseFloat(head.style.getPropertyValue('--hdrop')) || 0);   // the glyphs' top, the header not lowered
    const line = n.top + TILE_BW;   // the dip's line: the tile's round the housing
    const drop = Math.max(0, Math.ceil(line + HEAD_CLEAR - top));
    return drop <= HEAD_DROP_MAX ? drop : null;
  }
  function layoutNotch() {
    const n = state.notch, main = $('#main'), list = $('#sessions'), chat = $('#chat'), head = $('#shead'), h2 = head.querySelector('h2');
    if (!n && !main.classList.contains('notch')) return;   // no housing, and nothing laid around one to undo
    const NP = notchPad();
    // every read, then every write (2026-09-27): a read after a write is a layout each
    const lr = n ? list.getBoundingClientRect().right : 0, hr = n ? head.getBoundingClientRect() : null, space = $('#space'), sr = n && !space.hidden ? space.getBoundingClientRect() : null;
    const gap = n && h2 ? parseFloat(getComputedStyle(head).columnGap) || 0 : 0, x = n && h2 ? h2.getBoundingClientRect().left : 0;
    const hole = !!(n && h2) && hr.left + NOTCH_TITLE <= n.left && n.right + NOTCH_TAIL <= hr.right;
    // The title left of the housing when the whole of it fits there, else right of it (2026-09-28): its margin jumps
    // the housing, the project staying left of it. Where it would start is the separator's right edge and the h2's gap.
    const t = h2?.querySelector('.t'), sep = h2?.querySelector('.sep');
    const tx = hole && t && sep ? sep.getBoundingClientRect().right + (parseFloat(getComputedStyle(h2).columnGap) || 0) : 0;
    const tr = tx ? (r => (r.selectNodeContents(t), r.getBoundingClientRect()))(document.createRange()) : null;   // the text's own box: scrollWidth is never under the box's
    const over = hole && !!tx && tx + tr.width > n.left - NP;   // the title is longer than the room left of the housing
    const drop = over ? headDrop(head, t, tr, n) : null, under = drop != null, tright = over && !under;   // under it, or over it
    main.classList.toggle('notch', !!n);
    main.style.setProperty('--notch-top', `${n ? n.top : 0}px`);
    list.classList.toggle('npad', !!n && lr > n.left - NP);
    space.classList.toggle('npad', !!sr && sr.width > 0 && sr.left < n.right + NP && sr.right > n.left - NP);   // Space in the list's place (2026-11-24, review)
    if (hole && !over) { const w = n.left - NP - x; h2.style.flex = `0 0 ${w}px`; h2.style.marginRight = `${n.right + NP - x - w - gap}px`; }
    else if (under) { h2.style.flex = `1 0 ${n.right + NP - x}px`; h2.style.marginRight = ''; }   // past the housing at least: the chips stay right of it
    else if (h2) { h2.style.flex = ''; h2.style.marginRight = ''; }
    if (t) t.style.marginLeft = tright ? `${n.right + NP - tx}px` : '';
    const dropWas = head.style.getPropertyValue('--hdrop');
    if (drop) head.style.setProperty('--hdrop', `${drop}px`); else head.style.removeProperty('--hdrop');
    head.classList.toggle('hole', hole && !under);
    head.classList.toggle('tright', tright);
    head.classList.toggle('tunder', under);
    chat.classList.toggle('npad', !!n && !hole && hr.left < n.right + NP);
    tileNotch(); headNotch();
    if (head.style.getPropertyValue('--hdrop') !== dropWas) floatH();   // the header's foot moved, and no size did
  }
  // The floating header bends round the camera housing (2026-10-11, late morning; it ran under the housing before, the
  // housing's black over its own): where the housing reaches into it, its top edge dips round it, the header keeping
  // its place and its height. The dip is the tile's own border round the housing (2026-10-11, afternoon; it ran 4 px
  // below it before, a second line): the header's top edge bends down into that line, a HEAD_BEND curve tangent to
  // both, and follows it round — under its outer edge, the corners concentric with the housing's. Clipped as the tiles
  // are (the clip runs wide of the box, so its shadow stays, and up to the top through the dip); its border is .hcut, a
  // path in #chat over it, since the header clips what it holds (overflow, for its rounded corners) — only its two
  // bends, the tile's line drawing the rest.
  const HEAD_BEND = 10, HOUSING_R = 9, TILE_BW = 2;   // the housing's lower corners, by eye; the tiles' border
  function headNotch() {
    const head = $('#shead'), chat = $('#chat'), n = state.notch, M = 60, G = TILE_BW - 1;   // a pixel under the tile's line: no seam between them
    let svg = chat.querySelector(':scope > .hcut');
    const r = n && head.getBoundingClientRect(), cut = !!n && r.width > 0 && r.top < n.top + G && r.left < n.right + G && r.right > n.left - G;
    if (!cut) { if (svg) { svg.remove(); head.style.clipPath = ''; chat.classList.remove('hcutp'); } return; }
    // every read, then every write
    const cr = chat.getBoundingClientRect(), cs = getComputedStyle(head), bw = parseFloat(cs.borderTopWidth) || 0, color = cs.borderTopColor;
    // in the header's border box: the dip from the housing's left to its right, down to its bottom, each G wider
    const a0 = n.left - G - r.left, b0 = n.right + G - r.left, y2 = n.top + G - r.top, L = a0 > HEAD_BEND, R = b0 < r.width - HEAD_BEND;
    const a = L ? a0 : -M, b = R ? b0 : r.width + M, t = HEAD_BEND;
    const K = Math.max(0, Math.min(HOUSING_R + G, (b - a) / 2, y2)), yc = y2 - K;   // the dip's lower corners and their centres' height
    // The bend: a circle of radius t tangent to the top edge and to the dip — its straight side when that reaches t
    // down, else its corner, outside (centres K + t apart). Left: where it leaves the top edge (fx) and meets the dip
    // (px, py); the right is the mirror image.
    const sh = yc >= t ? null : Math.sqrt((K + t) ** 2 - (t - yc) ** 2);
    const fx = sh ? a + K - sh : a - t, px = sh ? a + K - sh * K / (K + t) : a, py = sh ? yc + (t - yc) * K / (K + t) : t, m = x => a + b - x;
    const hole = (L ? `M${fx} ${-M}V0A${t} ${t} 0 0 1 ${px} ${py}${sh ? '' : `V${yc}`}` : `M${a} ${-M}V${yc}`) + `A${K} ${K} 0 0 0 ${a + K} ${y2}H${b - K}`
      + (R ? `${sh ? `A${K} ${K} 0 0 0 ${m(px)} ${py}` : `A${K} ${K} 0 0 0 ${b} ${yc}V${t}`}A${t} ${t} 0 0 1 ${m(fx)} 0` : `A${K} ${K} 0 0 0 ${b} ${yc}`) + `V${-M}Z`;
    head.style.clipPath = `path(evenodd, 'M${-M} ${-M}H${r.width + M}V${r.height + M}H${-M}Z ${hole}')`;
    // the border's middle, half its width inside the header: the bends (the point on the bend's circle t - h from its
    // centre is on the dip's K + h from its own)
    const h = bw / 2, q = sh ? (t - h) / t : 0, qx = sh ? fx + (px - fx) * q : a - h, qy = sh ? t + (py - t) * q : t;
    const bendL = `M${fx} ${h}A${t - h} ${t - h} 0 0 1 ${qx} ${qy}`, bendR = `A${t - h} ${t - h} 0 0 1 ${m(fx)} ${h}`;
    const d = (L ? bendL : '') + (R ? `M${m(qx)} ${qy}${bendR}` : '');
    if (!svg) { svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('class', 'hcut'); svg.innerHTML = '<path/>'; chat.append(svg); }
    chat.classList.add('hcutp');
    Object.assign(svg.style, { left: `${r.left - cr.left - chat.clientLeft}px`, top: `${r.top - cr.top - chat.clientTop}px`, width: `${r.width}px`, height: `${y2 + bw}px` });
    const p = svg.firstChild; p.setAttribute('d', d); p.setAttribute('stroke', color); p.setAttribute('stroke-width', bw);
  }
  // The floating header's rows' height, for the chat that runs up behind them (2026-10-11, late morning): from the
  // column's top to under the last one shown — the header, the PR rows, the rival's bar. The transcript at its end
  // stays at its end.
  function floatH() {
    const chat = $('#chat'), was = chat.style.getPropertyValue('--float-h');
    const top = $('#groups').getBoundingClientRect().top, log = $('#log');
    const bottom = Math.max(top, ...['#shead', '#prlist', '#rival'].map(id => $(id)).filter(el => el.getClientRects().length)
      .map(el => el.getBoundingClientRect().bottom + (parseFloat(getComputedStyle(el).marginBottom) || 0)));
    const head = $('#shead'), sh = head.offsetHeight, drop = Math.max(0, (parseFloat(getComputedStyle(head).paddingTop) || 0) - 7), cueAt = `${sh} ${drop}`;   // the cue stands level with the toolbar, however far the notch lowered it (2026-11-04)
    if (cueAt !== floatH.cue) { floatH.cue = cueAt; const list = $('#sessions'); list.style.setProperty('--cue-h', `${sh}px`); list.style.setProperty('--cue-drop', `${drop}px`); }
    const h = `${Math.round(bottom - top)}px`; if (h === was) return;
    const end = log.scrollHeight - log.scrollTop - log.clientHeight < 4;
    chat.style.setProperty('--float-h', h);
    if (end) log.scrollTop = log.scrollHeight;
  }
  new ResizeObserver(floatH).observe($('#shead'));
  new ResizeObserver(floatH).observe($('#prlist'));
  new ResizeObserver(floatH).observe($('#rival'));
  /** Where the header's black starts (after the project's name, at the separator's right edge) and how far down it goes
   *  (the first row: the details under it keep the header's ground) — read once the row is laid out: after the notch
   *  and the chips' fold. */
  function paintHeadSplit() {
    const head = $('#shead'), sep = head.querySelector('h2 .sep');
    if (!sep) { head.style.removeProperty('--hsplit'); head.style.removeProperty('--hrow'); return; }   // no chat: no project to keep in colour
    const hr = head.getBoundingClientRect(), right = sep.getBoundingClientRect().right, d = head.querySelector('.details:not([hidden])');
    head.style.setProperty('--hsplit', `${Math.round(right - hr.left)}px`);
    head.style.setProperty('--hrow', d ? `${Math.round(d.getBoundingClientRect().top - hr.top - 3)}px` : '100%');
  }
  // A PR taken off the chat (2026-10-11): ⌥-click on its chip in the header or its row under it — one the chat only
  // mentioned in passing. The chip or row folds out where it stands, then the server is told (UNLINK_MS: its answer
  // redraws the header without it, which would take the fold with it); it keeps the PR off the chat for good, but for
  // a word of yours naming it again.
  const UNLINK_MS = 180;
