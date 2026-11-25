  // ---- the two halves: ⌘1 and ⌘2 -----------------------------------------------------
  // ⌘2 splits the chat column and puts the keys in the right half; ⌘1 brings them back to the left (2026-09-22). Both
  // halves pick from the one chat's tabs, and a tab is only ever in one of them (setTab trades places). ⨯ on the right
  // half's strip closes the split: whatever the keys were in stays, the other half's tab goes back to being one the
  // strip offers. ⌥⌘1 and ⌥⌘2 are the same two panes one over the other (2026-09-27): the digit
  // is the pane, the modifier the layout, and a key pressed on the other layout turns it. ⌘0 and ⌘W carry no layout.
  function applySplit() {
    const on = splitNow(), stack = stackNow();
    if (!on) focusG = 0;
    if (zoomed.has(state.current) && (!on || zoomed.get(state.current) !== focusG)) zoomed.delete(state.current);   // the keys left the half that filled the column
    const z = zoomed.get(state.current) ?? null;
    $('#main').classList.toggle('split', on);
    $('#groups').classList.toggle('stack', stack && z === null);   // one half showing is laid out as a column, whichever it is
    $('#groups').classList.toggle('zoomed', z !== null);
    $('#grp').hidden = z === 1; $('#grpB').hidden = !on || z === 0; $('#gsplit').hidden = !on || z !== null;
    const at = Math.max(.15, Math.min(.85, (stack ? prefs.stackAt : prefs.splitAt) || .5));
    $('#grp').style.flex = on && z === null ? `${at} 1 0` : '1 1 0';
    $('#grpB').style.flex = z === 1 ? '1 1 0' : `${1 - at} 1 0`;
  }
  /** The half the keys are in fills the column, or the two come back. False with nothing split. */
  function toggleZoom(s) {
    if (!isSplit(s)) return false;
    if (zoomed.get(s.id) === focusG) zoomed.delete(s.id); else zoomed.set(s.id, focusG);
    syncTerm(s);
    if (!isPaneTab(tabOf(s))) { focusBoard(); focusTerm(); }   // a page keeps the keys: the shell gives them to it again
    return true;
  }
  /** Which half the keys are in. Re-renders the strips (the rule moves) and tells the shell which page to focus. */
  function focusGroup(g) {
    const to = splitNow() ? g : 0;
    if (to === focusG) return;
    focusG = to;
    if (zoomed.has(state.current)) applySplit();   // into the half behind the one filling the column: both come back
    const s = state.sessions.get(state.current);
    renderTabs(s || null); postPane(s || null);
    if (s) renderHead(s);
  }
  function splitOn(stack = false) {
    const s = state.sessions.get(state.current); if (!s) return noChat();
    splitChat(s, false);                 // asked for by hand: it keeps its empty half
    if (stack) stacked.add(s.id); else stacked.delete(s.id);
    applySplit();
    focusG = 1;
    syncTerm(s); renderHead(s);
    focusBoard(); focusTerm();
  }
  /** One half closed — ⌘W on the one the keys are in, or the ⨯ in a half's own strip. The other half's tab is
      what the column keeps; a half that was showing nothing leaves the closer's tab behind rather than none. */
  function closeHalf(g) {
    const s = state.sessions.get(state.current) || null;
    if (s) { const p = placeOf(s); unsplit(s, p[g ? 0 : 1] || p[g]); }
    focusG = 0; applySplit();
    syncTerm(s); if (s) renderHead(s);
    focusBoard(); focusTerm();
  }
  // ⌘W (2026-10-13): the tab the keys are in, as a browser's or iTerm's ⌘W — a zsh ended, a page or the editor let go,
  // the changes closed (dropTab, ⌥⌘W's). The chat's own tab is never closed: on it, or on a half with nothing, ⌘W
  // closes the half (its whole job from 2026-09-22), and with one half there is nothing of the board's to close, so the
  // key is handed back and the window takes it. A dialog goes first — with the picker up ⌘W is how you get rid of it.
  function hotClose() {
    const dlg = document.querySelector('dialog[open]'); if (dlg) { dlg.close(); return true; }
    const s = state.sessions.get(state.current), k = s && tabOf(s);
    if (k && k !== 'chat') { dropTab(s, k); return true; }
    if (!splitNow()) { if (prefs.space && s) { spCloseChat(); return true; } return false; }   // Space: ⌘W on the chat closes its panel
    closeHalf(focusG);
    return true;
  }
  /** ⌘0: only this half. The *other* one closes, so the tab under the keys is what the column keeps — the opposite
      end of ⌘2, and ⌘W's mirror (that one closes the half you are in). Nothing split: ⌘0 is the zoom's again. */
  function hotOnlyHalf() {
    if (!splitNow()) { prefs.chatZoom = 1; applyChatZoom(); savePrefs(); return true; }
    closeHalf(focusG ? 0 : 1);
    return true;
  }
  /** ⌘1 / ⌘2 (side by side) and ⌥⌘1 / ⌥⌘2 (one over the other): the keys to that pane, the split made or turned first. */
  function hotGroup(g, stack = false) {
    if (g === 1 && !splitNow()) return splitOn(stack);
    if (!splitNow()) return;   // ⌘1 / ⌥⌘1 with one half is where you already are
    const s = state.sessions.get(state.current);
    if (s && stacked.has(s.id) !== stack) stackSplit(s, stack);
    focusGroup(g); focusBoard(); focusTerm();
  }
  /** This chat's halves the other way round — one over the other, or side by side again. syncTerm re-attaches
      nothing (the same terminals in the same halves) and reposts the pane; the terminals refit to their new bodies. */
  function stackSplit(s, on) {
    if (on) stacked.add(s.id); else stacked.delete(s.id);
    syncTerm(s); fitTerm();
  }
  applySplit();
  {
    const bar = $('#gsplit'); let dragging = false;
    bar.addEventListener('mousedown', e => { dragging = true; bar.classList.add('drag'); document.body.style.userSelect = 'none'; e.preventDefault(); });
    window.addEventListener('mousemove', e => {
      if (!dragging) return;
      const r = $('#groups').getBoundingClientRect(), stack = stackNow();
      const raw = Math.max(.15, Math.min(.85, stack ? (e.clientY - r.top) / r.height : (e.clientX - r.left) / r.width));
      const near = Math.abs(raw - .5) * (stack ? r.height : r.width) <= SNAP_PX, at = near ? .5 : raw;   // even halves pull (2026-10-11)
      if (near && !bar.snapped) haptic('alignment');
      bar.snapped = near;
      if (stack) prefs.stackAt = at; else prefs.splitAt = at;
      applySplit();
    });
    window.addEventListener('mouseup', () => { if (!dragging) return; dragging = false; bar.classList.remove('drag'); document.body.style.userSelect = ''; savePrefs(); fitTerm(); });
  }
  // × on a tab: the zsh ends (the server says so, and the tab goes with it); a page is forgotten here — its view
  // lingers in the shell until it needs the room. The tab in front closed, the one beside it comes forward, as in a
  // browser (2026-10-13; the half's first did before): the one to its right, else its left — a zsh's at once, while the
  // server is still ending it.
  function closeTab(s, k) {
    // vim is asked to quit (2026-10-21): its tab goes when it does — and stays in front, saying why, over unsaved work
    if (isVimTab(s, k)) { api('DELETE', `/api/terminals/${shellOfTab(s, k).id}`).catch(e => note(seen($('#ptabs')), `Could not quit vim: ${e.message}`, true)); return false; }
    const p = placeOf(s), g = p.indexOf(k);
    if (g >= 0) { const ks = keysIn(s, g), i = ks.indexOf(k); p[g] = ks[i + 1] || ks[i - 1] || null; tabs.set(s.id, p); }
    if (isShellTab(k)) { const t = shellOfTab(s, k); if (t) api('DELETE', `/api/terminals/${t.id}`).catch(e => note(seen($('#ptabs')), `Could not end the zsh: ${e.message}`, true)); syncTerm(s); return; }
    if (k === 'changes') changesOpen.delete(s.id);
    else if (k === 'timeline') timelineOpen.delete(s.id);
    else if (isAgentTab(k)) { const l = (agentTabs.get(s.id) || []).filter(a => 'agent:' + a.id !== k); if (l.length) agentTabs.set(s.id, l); else agentTabs.delete(s.id); }
    else if (isPageTab(k)) state.paneGh.set(s.id, (state.paneGh.get(s.id) || []).filter(x => x !== k));
    else if (isBlankTab(k)) blanks.set(s.id, (blanks.get(s.id) || []).filter(b => 'new:' + b.n !== k));
    else if ((state.paneWt.get(s.id) || []).includes(pageUrl(k))) state.paneWt.set(s.id, state.paneWt.get(s.id).filter(u => u !== pageUrl(k)));
    else if (s.cwd) state.paneIde.delete(s.cwd);
    homes.get(s.id)?.delete(k);
    syncTerm(s);
  }
  /** A tab closed from anywhere but its own × — ⌥⌘W, the ··· menu (2026-09-28): the × is gone from a half the tab
      has to itself, which is exactly the half that empties. When the keys are in that half they go back to the chat,
      rather than stay in an empty half or on a zsh on its way out (a zsh ends when the server says so, a moment on). */
  function dropTab(s, k) {
    const g = isSplit(s) ? homeOf(s, k) : 0, last = keysIn(s, g).length === 1;
    if (closeTab(s, k) === false) return;   // vim, asked to quit
    if (last && g === focusG) { showChat(s); syncTerm(s); }
    focusBoard(); focusTerm();
  }
  // ⌥⌘W: the tab the keys are in, closed — the zsh ended, a page or the editor let go. The split the board made for it
  // folds with it; one asked for by hand keeps its half, empty. The chat's own tab has no ×, and no ⌥⌘W either.
  function hotCloseTab() {
    const s = state.sessions.get(state.current); if (!s) return noChat();
    const k = tabOf(s);
    if (!k || k === 'chat') return note($('#shead'), 'The chat tab stays — ⌘W closes a half, ✓ ends the chat');
    dropTab(s, k);
  }
  // The take-over tooltip is the warning: for a VS Code chat it spells out what the tab there loses.
  const VSC_COST = ' Its tab in VS Code goes dead and will not follow the chat — close it there; opening the chat in VS Code again starts another claude on it, and a bar here will say so.';
  const takeTip = s => {
    const vs = inVsCode(s), what = vs ? `the claude VS Code runs on this chat (pid ${s.live.pid})` : `claude (pid ${s.live.pid}) in its terminal`;
    return (drawer.arm === s.id
      ? `Click again to end ${what} and resume the chat here${s.status === 'working' ? ' — Claude is mid-reply, and that reply will be lost' : ''}.`
      : `Take over: end ${what} and resume the chat here.`) + (vs ? VSC_COST : '');
  };
  const sureWord = s => s.status === 'working' ? 'sure? mid-reply' : inVsCode(s) ? 'sure? ends VS Code’s' : 'sure?';
  const KEY_C = ' · ⌥⌘C';   // on every tip the button acts on; the disabled and failed ones say why instead
  const termTip = s => drawer.err ? drawer.err
    : termLive(s) ? (termFor(s.terminal.id) ? 'This chat runs here — the terminal is the pane' : "Show this chat's claude session") + KEY_C
    : takeable(s) ? takeTip(s) + KEY_C
    : attachable(s) ? ATTACH_TIP + KEY_C
    : s.alive ? `Live in ${entryLabel(s)} — it cannot be attached from here`
    : inVsCode(s) ? 'Open a terminal on this chat (claude --resume). It was last continued in VS Code: from here on it is a CLI chat, and the tab there, if still open, will not follow it' + KEY_C
    : 'Open a terminal on this chat (claude --resume)' + KEY_C;
  // Live somewhere that is not our drawer — iTerm, VS Code. Nothing respawns a CLI claude, and VS Code's
  // extension does not respawn its own either (it launches one when a tab opens a chat, never after a
  // death — measured 2026-09-20), so ending it and resuming here leaves one writer.
  // A background session is not: `claude attach` opens it in a drawer, the one running, and closing the drawer leaves it so (2026-11-04).
  const attachable = s => !!(s?.alive && inBackground(s) && s.live?.jobId && !termLive(s));
  const takeable = s => !!(s?.alive && s.live?.pid && !termLive(s) && !attachable(s));
  const ATTACH_TIP = 'Open this background session here (claude attach): it keeps running when the drawer closes';
  // Two clicks, six seconds apart at most: the first arms the button (it turns red and says so), the
  // second ends the other claude. renderHead re-runs on every update and reads the armed state back.
  function armTakeOver(s) {
    drawer.arm = s.id; clearTimeout(drawer.armTimer);
    drawer.armTimer = setTimeout(() => { if (drawer.arm === s.id) { drawer.arm = null; renderHead(state.sessions.get(s.id) || s); } }, 6000);
    renderHead(s);
  }
  async function takeOver(s) {
    drawer.arm = null; clearTimeout(drawer.armTimer); renderResume(s);
    const tb = $('#termBtn'); if (tb) { tb.disabled = true; const l = tb.querySelector('.lbl'); if (l) l.textContent = 'ending…'; }
    let d = null;
    try { d = await api('POST', `/api/sessions/${s.id}/takeover`, termSize()); } catch (e) { drawer.err = e.message; }
    if (d) showTerminal(s, d.terminal);
    renderHead(state.sessions.get(s.id) || s);
  }
