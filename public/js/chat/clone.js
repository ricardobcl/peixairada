  // ---- a chat's folder not checked out: cloned first (2026-10-09) ----------------------------------------------------
  // A spawn the server refuses for a folder that is not there names the repo that would bring it back (`clone`: under
  // one of the setup's roots with an org, `<root>/<name>` is `<org>/<name>`), and the page clones it — /api/clone, gh —
  // then asks again. The server's `clone` events carry git's own progress (state.clones, by the folder cloned into):
  // the resume bar, a new chat's column, the picker's line and the status bar draw it. `cloneWaits` says who waits on
  // which: a chat's id for its resume, `shell:<id>` for its ⌥⌘T, `new:<cwd>` for a new chat.
  const cloneWaits = new Map();   // key → the server's `clone`: { name, root, org, ref, dir }
  const cloneSays = c => c.phase ? `${c.phase.toLowerCase()} · ${c.percent || 0}%` : 'asking GitHub…';
  async function withCheckout(key, spawn, onClone) {
    try { return await spawn(); }
    catch (e) {
      const c = e.body?.clone; if (!c) throw e;
      cloneWaits.set(key, c);
      if (!state.clones.has(c.dir)) state.clones.set(c.dir, { ref: c.ref, dir: c.dir, phase: null, percent: 0 });
      onClone?.(c); cloneShown();
      try { await api('POST', '/api/clone', { name: c.name, root: c.root }); }
      catch (ce) { throw new Error(`Could not clone ${c.ref}: ${ce.message}`, { cause: ce }); }
      finally { cloneWaits.delete(key); cloneShown(); }
      return spawn();
    }
  }
  /** Every place a clone under way is drawn, drawn again: the open chat's resume bar, the boxes naming a folder being
   *  cloned (a new chat's column, the picker's line), the status bar. */
  function cloneShown() {
    renderResume(state.sessions.get(state.current) || null);
    for (const el of document.querySelectorAll('.clonebox[data-dir]')) {
      const c = state.clones.get(el.dataset.dir); if (!c) continue;
      el.style.setProperty('--p', (c.percent || 0) / 100);
      const t = el.querySelector('.cp'); if (t) t.textContent = cloneSays(c);
    }
    renderBar();
  }
  function cloneEvent(c) {
    if (!c.done) { state.clones.set(c.dir, c); return cloneShown(); }
    state.clones.delete(c.dir);
    if (!c.error) for (const s of state.sessions.values()) if (s.folderMissing && s.cwd && (s.cwd === c.dir || s.cwd.startsWith(c.dir + '/'))) { delete s.folderMissing; delete s.cloneRef; }   // there now
    cloneShown();
  }
  async function openTerminalFor(s) {
    if (termLive(s)) { syncTerm(s); renderHead(s); return; }
    try { const r = await withCheckout(s.id, () => api('POST', `/api/sessions/${s.id}/terminal`, termSize())); showTerminal(s, r.terminal); saidBack(r.back); } catch (e) { drawer.err = e.message; }
    renderHead(s);
  }
  /** Where a chat whose folder was gone started (2026-10-19; the server's `back`): its worktree made again, the tree
   *  its branch is out in, or the nearest folder left and why — said once, by the header. */
  const saidBack = b => b && note($('#shead'), b.made ? `Its worktree is back: ${homePath(b.tree)}${b.branch ? ` on ${b.branch}` : ', detached'}`
    : b.tree ? `${b.branch} is out in ${homePath(b.tree)} — started there` : `Its folder is gone — started in ${homePath(b.cwd)}${b.why ? ` (${b.why})` : ''}`, !!b.why);
  /** A drawer the server just started for `s`, attached in the half that holds its chat tab — if `s` is still the open
   *  chat (2026-10-03: attached into whatever half had the keys, under whichever chat was open by then). Otherwise the
   *  chat's summary carries it, and opening the chat again shows it. */
  function showTerminal(s, t) {
    const cur = state.sessions.get(s.id) || s; cur.terminal = t;
    if (state.current === s.id) syncTerm(cur);
  }
  // The >_ button and ⌥⌘C: the chat's claude session — the drawer it runs in, started if need be, or — live
  // elsewhere — arm and, pressed again, take over. The terminal takes the keyboard at the end: attachTerm does that
  // when its socket opens, this covers one that was already showing (⌥⌘C as "put me in the terminal").
  const termAsking = new Set();   // the chats whose drawer is being asked for: a second press meanwhile is the same press
  async function termAction(s) {
    if (termAsking.has(s.id)) return;
    drawer.err = null; showChat(s);
    termAsking.add(s.id); renderResume(s);
    try {
      if (takeable(s)) await (drawer.arm === s.id ? takeOver(s) : armTakeOver(s));
      else await openTerminalFor(s);
    } finally { termAsking.delete(s.id); }
    renderResume(state.sessions.get(s.id) || s);
    focusTerm();
  }
  // A new chat in a folder: `claude` there — unless the folder's Taskfile launches claude itself (oracle's `task
  // production-workload` and friends set a cluster's environment first, 2026-09-20), in which case the environment is
  // asked for in the picker, every time; the server says whether the folder has such launchers (GET /api/launchers).
  // The + button, the folder pick-list and ⌥⌘N's ＋ all come through here and start a chat at the end of it.
  // `then` is ⌥⌘O's way through (2026-09-21): the environment scopes a chats step instead of starting anything.
  async function newChatIn(cwd, then = 'new', agent) {   // `agent` (2026-11-06): ＋'s chip's — none where a Taskfile starts claude
    let launchers = [];
    if ($('#pick').open) { const q = $('#pickq'); q.placeholder = 'asking the folder how it starts claude…'; q.disabled = true; pick.cloning = true; }   // a step under way: pickChoose (2026-11-04)
    try { launchers = (await api('GET', `/api/launchers?cwd=${encodeURIComponent(cwd)}`)).launchers || []; } catch {}
    if (launchers.length) return pickOpen('env', { cwd, launchers, then });
    if (then === 'chats') return chatsStep({ key: cwd, name: folderName(cwd), cwds: [cwd] });   // no launchers: the folder's own chats, ＋ a new one
    $('#pick').close(); newChat(cwd, null, withAgent(agent));
  }
  // No chat in the column: the page as a load without a #id draws it, or, from newChat, a header and a word of its own.
  // Also the way off an open chat that has left the board — an empty one ticked done (visible()): nothing in it to
  // read or resume. The header is written here, so `drawn` starts over.
  const NO_CHAT = { head: $('#shead').innerHTML, log: $('#log').innerHTML };
