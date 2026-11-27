// ---- a chat's folder not checked out: cloned first (2026-10-09) ----------------------------------------------------
// A spawn the server refuses for a folder that is not there names the repo that would bring it back (`clone`: under
// one of the setup's roots with an org, `<root>/<name>` is `<org>/<name>`), and the page clones it — /api/clone, gh —
// then asks again. The server's `clone` events carry git's own progress (state.clones, by the folder cloned into):
// the resume bar, a new chat's column, the picker's line and the status bar draw it. `cloneWaits` says who waits on
// which: a chat's id for its resume, `shell:<id>` for its ⌥⌘T, `new:<cwd>` for a new chat.
const cloneWaits = new Map(); // key → the server's `clone`: { name, root, org, ref, dir }
const cloneSays = clone => (clone.phase ? `${clone.phase.toLowerCase()} · ${clone.percent || 0}%` : 'asking GitHub…');

async function withCheckout(key, spawn, onClone) {
  try {
    return await spawn();
  } catch (error) {
    const clone = error.body?.clone;

    if (!clone) throw error;
    cloneWaits.set(key, clone);

    if (!state.clones.has(clone.dir)) {
      state.clones.set(clone.dir, { ref: clone.ref, dir: clone.dir, phase: null, percent: 0 });
    }

    onClone?.(clone);
    cloneShown();

    try {
      await api('POST', '/api/clone', { name: clone.name, root: clone.root });
    } catch (ce) {
      throw new Error(`Could not clone ${clone.ref}: ${ce.message}`, { cause: ce });
    } finally {
      cloneWaits.delete(key);
      cloneShown();
    }

    return spawn();
  }
}

/** Every place a clone under way is drawn, drawn again: the open chat's resume bar, the boxes naming a folder being
 *  cloned (a new chat's column, the picker's line), the status bar. */
function cloneShown() {
  renderResume(state.sessions.get(state.current) || null);

  for (const el of document.querySelectorAll('.clonebox[data-dir]')) {
    const clone = state.clones.get(el.dataset.dir);

    if (!clone) continue;
    el.style.setProperty('--p', (clone.percent || 0) / 100);
    const label = el.querySelector('.cp');

    if (label) label.textContent = cloneSays(clone);
  }

  renderBar();
}

function cloneEvent(clone) {
  if (!clone.done) {
    state.clones.set(clone.dir, clone);
    return cloneShown();
  }

  state.clones.delete(clone.dir);

  if (!clone.error) {
    for (const session of state.sessions.values()) {
      if (
        session.folderMissing &&
        session.cwd &&
        (session.cwd === clone.dir || session.cwd.startsWith(`${clone.dir}/`))
      ) {
        delete session.folderMissing;
        delete session.cloneRef;
      }
    }
  } // there now

  cloneShown();
}

async function openTerminalFor(session) {
  if (termLive(session)) {
    syncTerm(session);
    renderHead(session);
    return;
  }

  try {
    const result = await withCheckout(session.id, () =>
      api('POST', `/api/sessions/${session.id}/terminal`, termSize()),
    );

    showTerminal(session, result.terminal);
    saidBack(result.back);
  } catch (error) {
    drawer.err = error.message;
  }

  renderHead(session);
}

/** Where a chat whose folder was gone started (2026-10-19; the server's `back`): its worktree made again, the tree
 *  its branch is out in, or the nearest folder left and why — said once, by the header. */
const saidBack = restored =>
  restored &&
  note(
    $('#shead'),
    restored.made
      ? `Its worktree is back: ${homePath(restored.tree)}${restored.branch ? ` on ${restored.branch}` : ', detached'}`
      : restored.tree
        ? `${restored.branch} is out in ${homePath(restored.tree)} — started there`
        : `Its folder is gone — started in ${homePath(restored.cwd)}${restored.why ? ` (${restored.why})` : ''}`,
    !!restored.why,
  );

/** A drawer the server just started for `session`, attached in the half that holds its chat tab — if `session` is still the open
 *  chat (2026-10-03: attached into whatever half had the keys, under whichever chat was open by then). Otherwise the
 *  chat's summary carries it, and opening the chat again shows it. */
function showTerminal(session, terminal) {
  const cur = state.sessions.get(session.id) || session;

  cur.terminal = terminal;
  if (state.current === session.id) syncTerm(cur);
}

// The >_ button and ⌥⌘C: the chat's claude session — the drawer it runs in, started if need be, or — live
// elsewhere — arm and, pressed again, take over. The terminal takes the keyboard at the end: attachTerm does that
// when its socket opens, this covers one that was already showing (⌥⌘C as "put me in the terminal").
const termAsking = new Set(); // the chats whose drawer is being asked for: a second press meanwhile is the same press

async function termAction(session) {
  if (termAsking.has(session.id)) return;
  drawer.err = null;
  showChat(session);
  termAsking.add(session.id);
  renderResume(session);

  try {
    if (takeable(session)) await (drawer.arm === session.id ? takeOver(session) : armTakeOver(session));
    else await openTerminalFor(session);
  } finally {
    termAsking.delete(session.id);
  }

  renderResume(state.sessions.get(session.id) || session);
  focusTerm();
}

// A new chat in a folder: `claude` there — unless the folder's Taskfile launches claude itself (oracle's `task
// production-workload` and friends set a cluster's environment first, 2026-09-20), in which case the environment is
// asked for in the picker, every time; the server says whether the folder has such launchers (GET /api/launchers).
// The + button, the folder pick-list and ⌥⌘N's ＋ all come through here and start a chat at the end of it.
// `then` is ⌥⌘O's way through (2026-09-21): the environment scopes a chats step instead of starting anything.
async function newChatIn(cwd, then = 'new', agent) {
  // `agent` (2026-11-06): ＋'s chip's — none where a Taskfile starts claude
  let launchers = [];

  if ($('#pick').open) {
    const input = $('#pickq');

    input.placeholder = 'asking the folder how it starts claude…';
    input.disabled = true;
    pick.cloning = true;
  } // a step under way: pickChoose (2026-11-04)

  try {
    launchers = (await api('GET', `/api/launchers?cwd=${encodeURIComponent(cwd)}`)).launchers || [];
  } catch {}

  if (launchers.length) return pickOpen('env', { cwd, launchers, then });
  if (then === 'chats') return chatsStep({ key: cwd, name: folderName(cwd), cwds: [cwd] }); // no launchers: the folder's own chats, ＋ a new one
  $('#pick').close();
  newChat(cwd, null, withAgent(agent));
}

// No chat in the column: the page as a load without a #id draws it, or, from newChat, a header and a word of its own.
// Also the way off an open chat that has left the board — an empty one ticked done (visible()): nothing in it to
// read or resume. The header is written here, so `drawn` starts over.
const NO_CHAT = { head: $('#shead').innerHTML, log: $('#log').innerHTML };
