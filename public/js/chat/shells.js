// ⌥⌘← / ⌥⌘→ (2026-09-20):
// the tab beside the current one in the strip, wrapping round; the same path as a click on it. The chat alone: a note.
// Split, the two strips read as one row, left then right (2026-09-25): each lists only its own tabs now, and the
// key walks across the divider into the other half rather than round one strip.
function hotTab(dir) {
  const session = state.sessions.get(state.current);

  if (!session) return noChat();
  const keys = groupsOf(session).flatMap(group => keysIn(session, group));

  if (keys.length < 2) return note($('#shead'), 'Only the chat here — ⌥⌘T a zsh, ⌥⌘G its PR, ⌥⌘E the editor');
  openTab(session, keys[(keys.indexOf(tabOf(session)) + dir + keys.length) % keys.length]);
}

/** ⌥⌘⇧T (2026-11-25): another zsh, a tab in the half or tile the keys are in (startShell's `here`). */
function hotTabHere() {
  const session = state.sessions.get(state.current);

  if (!session) return noChat();
  focusBoard();
  startShell(session, true, 'here');
}

/** ⌃⌥⌘T (2026-11-25): the tab in front of the keys' tile out into a tile of its own, cut from that one along its
 *  longer side as a new terminal's is — any tab, its terminal or page going with it. One half: the split, by the
 *  column's shape, the rest staying where they were. */
function hotUntab() {
  const session = state.sessions.get(state.current);

  if (!session) return noChat();

  const key = tabOf(session);
  const here = keysIn(session, isSplit(session) ? focusG : 0);

  if (!key || here.length < 2) return note($('#shead'), 'Its only tab — a tile of its own already');

  const at = isSplit(session) ? focusG : 0;
  const direction = tallTile(session, at) ? 'col' : 'row';
  const rest = here.filter(other => other !== key);

  if (!roomFor(session, at, direction)) return note($('#shead'), 'No room for another tile here');

  if (!isSplit(session)) {
    // one half: the rest stay in the first, it in the second (the chat out on its own: the chat left)
    if (direction === 'col') stacked.add(session.id);
    else stacked.delete(session.id);
    splitChat(session, false);
    const mine = key === 'chat' ? 0 : 1;

    for (const tabKey of here) homes.get(session.id).set(tabKey, tabKey === key ? mine : 1 - mine);
    tabs.set(session.id, mine ? [rest[Math.min(here.indexOf(key), rest.length - 1)], key] : [key, rest[0]]); // the one beside it in front
    focusG = mine;
  } else {
    const place = placeOf(session);
    const index = here.indexOf(key);

    place[at] = here[index + 1] || here[index - 1];
    tabs.set(session.id, place);
    if (!tileTerm(session, key, direction)) return;
  }

  syncTerm(session);
  fitTerm();
  focusBoard();
  focusTerm();
}

/** ⌃⌘←→ (2026-11-25): the tab beside this one in its own strip — the half's or tile's the keys are in, round. */
function hotStripTab(dir) {
  const session = state.sessions.get(state.current);

  if (!session) return noChat();
  const keys = keysIn(session, focusG);

  if (keys.length < 2) return note($('#shead'), 'One tab here — ⌥⌘← → for the tiles beside it');
  openTab(session, keys[(keys.indexOf(tabOf(session)) + dir + keys.length) % keys.length]);
}

// ⌥⌘T: a fresh zsh in the chat's folder, inline — the pane's zsh tab, like a new tab in iTerm (2026-09-20). The
// chat's zsh: started on the first press, shown on the next ones — the one the keys are in, else the first (⌘T opens
// another, 2026-10-13); `exit` or the tab's × ends it. A failure is a note. Answers the zsh it showed, or null.
async function hotShell() {
  const session = state.sessions.get(state.current);

  if (!session) {
    noChat();
    return null;
  }

  const on = (isVimTab(session, tabOf(session)) ? null : shellOfTab(session, tabOf(session))) || zshsOf(session)[0];

  if (!on) return startShell(session, false);
  setTab(session, `shell:${on.id}`);
  syncTerm(session);
  focusBoard();
  focusTerm();
  return on;
}

/** A zsh started in the chat's folder, on a new tab: the chat's first (⌥⌘T), or `fresh` another beside the ones it has
      (⌘T); `cut` the direction ⌘D / ⇧⌘D asked its tile in, or `here`: a tab where the keys are (⌥⌘⇧T). Answers it, or null. */
async function startShell(session, fresh, cut) {
  if (!session.cwd) {
    note($('#shead'), 'No folder known for this chat', true);
    return null;
  }

  let shell;

  try {
    const result = await withCheckout(
      `shell:${session.id}`,
      () => api('POST', `/api/sessions/${session.id}/shell`, { ...termSize(), fresh }),
      clone => note($('#shead'), `Its folder is not checked out — cloning ${clone.ref} first, then the ${shName()}`),
    );

    shell = result.terminal;
    saidBack(result.back);
  } catch (error) {
    note($('#shead'), error.message, true);
    return null;
  }

  const now = state.sessions.get(session.id) || session; // the SSE update says the same a moment later — or said it already

  if (!(now.shells || []).some(known => known.id === shell.id)) now.shells = [...(now.shells || []), shell];
  if (!now.shell || now.shell.exited !== null) now.shell = shell;
  if (state.current !== session.id) return shell; // another chat by now: its tab waits on this one, not over that
  openNewTab(now, `shell:${shell.id}`, cut);
  syncTerm(now);
  focusBoard();
  focusTerm();
  return shell;
}

/** A zsh tab's name: the shell's, and its place among the chat's when it has several — zsh, zsh 2, zsh 3. */
const shLabel = (session, key) => {
  const shell = shellOfTab(session, key);
  const like = shellsOf(session).filter(candidate => !candidate.editor === !shell?.editor);
  const index = like.findIndex(candidate => `shell:${candidate.id}` === key);

  if (shell?.editor) {
    return `vim${shell.cwd && shell.cwd !== session.cwd ? ` · ${shell.cwd.split('/').pop()}` : index > 0 ? ` ${index + 1}` : ''}`;
  } // another folder's: a worktree, by its name

  return shName() + (index > 0 ? ` ${index + 1}` : '');
};

/** Vim in a folder of the chat's on a tab (2026-10-21, the in-app editor): the one it has there shown, else one
      started — in its own folder by default, or `dir`, a worktree of a PR's branch. Answers it, or null. */
async function openVim(session, dir = session.cwd, at = $('#shead')) {
  if (!dir) {
    note(at, 'No folder known for this chat', true);
    return null;
  }

  const have = shellsOf(session).find(candidate => candidate.editor && candidate.cwd === dir);

  if (have) {
    if (state.current === session.id) {
      setTab(session, `shell:${have.id}`);
      syncTerm(session);
      focusBoard();
      focusTerm();
    }

    return have;
  }

  let vim;

  try {
    const result = await withCheckout(
      `vim:${session.id}`,
      () => api('POST', `/api/sessions/${session.id}/shell`, { ...termSize(), vim: true, dir }),
      clone => note(at, `Its folder is not checked out — cloning ${clone.ref} first, then vim`),
    );

    vim = result.terminal;
    saidBack(result.back);
  } catch (error) {
    note(at, `Vim did not start: ${error.message}`, true);
    return null;
  }

  const now = state.sessions.get(session.id) || session;

  if (!(now.shells || []).some(known => known.id === vim.id)) now.shells = [...(now.shells || []), vim];
  if (state.current !== session.id) return vim;
  openNewTab(now, `shell:${vim.id}`);
  syncTerm(now);
  focusBoard();
  focusTerm();
  return vim;
}

// ⌘T (2026-10-13): a new tab of the kind the keys are in. In a terminal — claude's drawer, a zsh — or on the chat, the
// changes or an empty half, another zsh in the chat's folder, as iTerm's ⌘T; on a page — GitHub, VS Code Web, a blank
// tab — a blank tab, as a browser's (openBlank). Either opens where a new tab does (openNewTab).
function hotNewTab() {
  const session = state.sessions.get(state.current);

  if (!session) return noChat();
  const key = tabOf(session);

  if (isPaneTab(key) || isBlankTab(key)) return openBlank(session);
  focusBoard();
  startShell(session, true);
}

function hotGh() {
  const session = state.sessions.get(state.current);

  if (!session) return noChat();
  const prs = session.prs || [];

  if (!prs.length) {
    // no PR: the folder's repository on GitHub, when git names one (state.repos, from the server)
    const url = session.cwd && state.repos[session.cwd];

    return url
      ? openExternal(url)
      : note($('#shead'), 'No PR mentioned in this chat, and no GitHub remote in its folder');
  }

  if (prs.length === 1) showPr(prs[0].url);
  else pickOpen('pr'); // several: always the choice, the one showing marked current
}
