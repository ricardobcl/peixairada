// ⌥⌘← / ⌥⌘→ (2026-09-20):
// the tab beside the current one in the strip, wrapping round; the same path as a click on it. The chat alone: a note.
// Split, the two strips read as one row, left then right (2026-09-25): each lists only its own tabs now, and the
// key walks across the divider into the other half rather than round one strip.
function hotTab(dir) {
  const s = state.sessions.get(state.current);
  if (!s) return noChat();
  const keys = groupsOf(s).flatMap(g => keysIn(s, g));
  if (keys.length < 2) return note($('#shead'), 'Only the chat here — ⌥⌘T a zsh, ⌥⌘G its PR, ⌥⌘E the editor');
  openTab(s, keys[(keys.indexOf(tabOf(s)) + dir + keys.length) % keys.length]);
}
/** ⌥⌘⇧T (2026-11-25): another zsh, a tab in the half or tile the keys are in (startShell's `here`). */
function hotTabHere() {
  const s = state.sessions.get(state.current);
  if (!s) return noChat();
  focusBoard();
  startShell(s, true, 'here');
}
/** ⌃⌘←→ (2026-11-25): the tab beside this one in its own strip — the half's or tile's the keys are in, round. */
function hotStripTab(dir) {
  const s = state.sessions.get(state.current);
  if (!s) return noChat();
  const keys = keysIn(s, focusG);
  if (keys.length < 2) return note($('#shead'), 'One tab here — ⌥⌘← → for the tiles beside it');
  openTab(s, keys[(keys.indexOf(tabOf(s)) + dir + keys.length) % keys.length]);
}
// ⌥⌘T: a fresh zsh in the chat's folder, inline — the pane's zsh tab, like a new tab in iTerm (2026-09-20). The
// chat's zsh: started on the first press, shown on the next ones — the one the keys are in, else the first (⌘T opens
// another, 2026-10-13); `exit` or the tab's × ends it. A failure is a note. Answers the zsh it showed, or null.
async function hotShell() {
  const s = state.sessions.get(state.current);
  if (!s) {
    noChat();
    return null;
  }
  const on = (isVimTab(s, tabOf(s)) ? null : shellOfTab(s, tabOf(s))) || zshsOf(s)[0];
  if (!on) return startShell(s, false);
  setTab(s, 'shell:' + on.id);
  syncTerm(s);
  focusBoard();
  focusTerm();
  return on;
}
/** A zsh started in the chat's folder, on a new tab: the chat's first (⌥⌘T), or `fresh` another beside the ones it has
      (⌘T); `cut` the direction ⌘D / ⇧⌘D asked its tile in, or `here`: a tab where the keys are (⌥⌘⇧T). Answers it, or null. */
async function startShell(s, fresh, cut) {
  if (!s.cwd) {
    note($('#shead'), 'No folder known for this chat', true);
    return null;
  }
  let t;
  try {
    const r = await withCheckout(
      `shell:${s.id}`,
      () => api('POST', `/api/sessions/${s.id}/shell`, { ...termSize(), fresh }),
      c => note($('#shead'), `Its folder is not checked out — cloning ${c.ref} first, then the ${shName()}`),
    );
    t = r.terminal;
    saidBack(r.back);
  } catch (e) {
    note($('#shead'), e.message, true);
    return null;
  }
  const now = state.sessions.get(s.id) || s; // the SSE update says the same a moment later — or said it already
  if (!(now.shells || []).some(x => x.id === t.id)) now.shells = [...(now.shells || []), t];
  if (!now.shell || now.shell.exited !== null) now.shell = t;
  if (state.current !== s.id) return t; // another chat by now: its tab waits on this one, not over that
  openNewTab(now, 'shell:' + t.id, cut);
  syncTerm(now);
  focusBoard();
  focusTerm();
  return t;
}
/** A zsh tab's name: the shell's, and its place among the chat's when it has several — zsh, zsh 2, zsh 3. */
const shLabel = (s, k) => {
  const t = shellOfTab(s, k),
    like = shellsOf(s).filter(x => !x.editor === !t?.editor),
    i = like.findIndex(x => 'shell:' + x.id === k);
  if (t?.editor) return 'vim' + (t.cwd && t.cwd !== s.cwd ? ` · ${t.cwd.split('/').pop()}` : i > 0 ? ` ${i + 1}` : ''); // another folder's: a worktree, by its name
  return shName() + (i > 0 ? ` ${i + 1}` : '');
};
/** Vim in a folder of the chat's on a tab (2026-10-21, the in-app editor): the one it has there shown, else one
      started — in its own folder by default, or `dir`, a worktree of a PR's branch. Answers it, or null. */
async function openVim(s, dir = s.cwd, at = $('#shead')) {
  if (!dir) {
    note(at, 'No folder known for this chat', true);
    return null;
  }
  const have = shellsOf(s).find(t => t.editor && t.cwd === dir);
  if (have) {
    if (state.current === s.id) {
      setTab(s, 'shell:' + have.id);
      syncTerm(s);
      focusBoard();
      focusTerm();
    }
    return have;
  }
  let t;
  try {
    const r = await withCheckout(
      `vim:${s.id}`,
      () => api('POST', `/api/sessions/${s.id}/shell`, { ...termSize(), vim: true, dir }),
      c => note(at, `Its folder is not checked out — cloning ${c.ref} first, then vim`),
    );
    t = r.terminal;
    saidBack(r.back);
  } catch (e) {
    note(at, `Vim did not start: ${e.message}`, true);
    return null;
  }
  const now = state.sessions.get(s.id) || s;
  if (!(now.shells || []).some(x => x.id === t.id)) now.shells = [...(now.shells || []), t];
  if (state.current !== s.id) return t;
  openNewTab(now, 'shell:' + t.id);
  syncTerm(now);
  focusBoard();
  focusTerm();
  return t;
}
// ⌘T (2026-10-13): a new tab of the kind the keys are in. In a terminal — claude's drawer, a zsh — or on the chat, the
// changes or an empty half, another zsh in the chat's folder, as iTerm's ⌘T; on a page — GitHub, VS Code Web, a blank
// tab — a blank tab, as a browser's (openBlank). Either opens where a new tab does (openNewTab).
function hotNewTab() {
  const s = state.sessions.get(state.current);
  if (!s) return noChat();
  const k = tabOf(s);
  if (isPaneTab(k) || isBlankTab(k)) return openBlank(s);
  focusBoard();
  startShell(s, true);
}
function hotGh() {
  const s = state.sessions.get(state.current);
  if (!s) return noChat();
  const prs = s.prs || [];
  if (!prs.length) {
    // no PR: the folder's repository on GitHub, when git names one (state.repos, from the server)
    const url = s.cwd && state.repos[s.cwd];
    return url
      ? openExternal(url)
      : note($('#shead'), 'No PR mentioned in this chat, and no GitHub remote in its folder');
  }
  if (prs.length === 1) showPr(prs[0].url);
  else pickOpen('pr'); // several: always the choice, the one showing marked current
}
