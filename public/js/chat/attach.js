// ---- attachments: files dropped on the board, images pasted --------------------------------
// What claude wants is a path: an @-mention (`@dir/file`, a space escaped as `\ ` — how the CLI itself writes
// one) typed into the drawer's prompt. In the Mac app the shell sees the
// pasteboard and calls peixDrop with the real paths (WebKit never sees the drag); a plain browser only gets the
// bytes, so the page uploads them (PUT /api/attach) and gets a path back. Images pasted with ⌘V: in the app
// the drawer's claude reads the Mac clipboard itself on ⌃V (verified: `[Image #1]` on the prompt line), so
// that key is sent for it; in a browser elsewhere the clipboard is that machine's, so the image is uploaded.
const atMention = p => '@' + p.replace(/ /g, '\\ ');
const shellWord = p => `'${p.replace(/'/g, `'\\''`)}'`;
/** A word as a shell reads it: as it is when nothing in it is the shell's, else quoted (2026-11-06: a branch's name). */
const shArg = p => (/^[\w./@%+=:,-]+$/.test(p) ? p : shellWord(p));
function attachPaths(paths) {
  if (!paths.length) return false;
  // a name with a control character in it would be keys, not a name (2026-11-06): refused whole, said where the drop went
  if (paths.some(p => hasCtl(String(p)))) {
    note($('#shead'), 'Not typed: a dropped file\u2019s name has a control character or a bidi mark in it', true);
    return false;
  }
  const text = paths.map(atMention).join(' ') + ' ';
  const s = state.sessions.get(state.current);
  // the drawer in the half with the keys, else the claude one: a zsh holder carries the chat's id too, and a drop
  // on the zsh tab typed an @-mention into the shell (2026-10-03) — a shell gets the path quoted as a shell word
  const live = terms.filter(t => t.id && t.xt && t.exited === null && t.sessionId === state.current);
  const tm = live.find(t => t.g === focusG) || live.find(t => t.kind === 'claude') || live[0];
  if (tm) {
    focusGroup(tm.g);
    termSend(tm, tm.kind === 'shell' ? paths.map(shellWord).join(' ') + ' ' : text);
    tm.xt.focus();
    return true;
  }
  note(
    $('#shead'),
    !s
      ? 'Pick a chat first, then drop the file'
      : s.alive
        ? 'Nowhere to put it: open the terminal on this chat (>_) first, then drop again'
        : resumable(s)
          ? 'Nowhere to put it: resume the chat first, then drop again'
          : 'Nowhere to put it on this chat',
    true,
  );
  return false;
}
async function uploadFiles(files) {
  const paths = [];
  await keySafe();
  for (const f of files) {
    const r = await fetch(
      `/api/attach?session=${encodeURIComponent(state.current || 'new')}&name=${encodeURIComponent(f.name || 'pasted.png')}`,
      { method: 'PUT', body: f, headers: keyHeaders() },
    );
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      note(
        $('#shead'),
        r.status === 404
          ? `Could not save ${f.name || 'the file'}: the running server predates this page and has no route for it — scripts/launchd.sh restart`
          : `Could not save ${f.name || 'the file'}: ${d.error || `HTTP ${r.status}`}`,
        true,
      );
      continue;
    }
    paths.push(d.path);
  }
  return paths;
}
const setDropping = on => $('#chat').classList.toggle('dropping', on);
const hasFiles = e => [...(e.dataTransfer?.types || [])].includes('Files');
document.addEventListener('dragover', e => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'copy';
  setDropping(true);
});
document.addEventListener('dragleave', e => {
  if (hasFiles(e) && !e.relatedTarget) setDropping(false);
});
document.addEventListener('drop', async e => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  setDropping(false);
  attachPaths(await uploadFiles([...e.dataTransfer.files]));
});
window.peixDrop = paths => {
  const list = Array.isArray(paths) ? paths : [];
  return chatTakesDrop(list) || attachPaths(list);
}; // the Mac app, with real paths — the chat's panel's when it has the keys (room.js)
// A notification answered where it shows (the app's, 2026-10-12): Done is the card's ✓ (offered only where the card
// offers it), a reply is typed into the chat's Claude in its drawer here — over the page's own socket to it when the
// chat is open, else one opened for the reply and closed after it, which sends no size, so the drawer is not resized.
// A chat muted, or back (2026-11-02): the server's word, for every page and poster, shown at once and taken back if refused.
function setMuted(id, on) {
  const show = v => {
    const s = state.sessions.get(id);
    if (!s) return;
    s.muted = v;
    renderBoard();
    if (id === state.current) renderHead(s);
  };
  show(on);
  api('POST', `/api/sessions/${id}/mute`, { on }).catch(e => {
    show(!on);
    note($('#shead'), `Could not ${on ? 'mute' : 'unmute'} it: ${e.message}`, true);
  });
}
window.peixMute = id => setMuted(id, true); // the banner's *Mute this chat*
window.peixDone = id => {
  const s = state.sessions.get(id);
  if (!s || s.done || !canTick(s)) return;
  if (watchEnds(s) && !armedOn(id)) openSession(id, { locate: true });
  tickDone(id, true, $('#shead'));
}; // a watching chat's: shown, and asked once more
// A banner's reply is for the turn it was about (2026-11-27, the external audit's lead 5): `at` is its alert's time, and a
// chat that has moved on since — a word of yours, another reply — or that is asking takes none. Refused, it says so:
// a banner of its own with the app behind (`unsent`), a note on the board.
window.peixReply = async (id, text, at) => {
  const s = state.sessions.get(id),
    since = w => w && at && String(w) > String(at);
  const no = !s
    ? 'it is not on the board'
    : asking(s)
      ? ASKS_FIRST
      : since(s.lastUserAt) || since(s.lastReplyAt)
        ? 'the chat has moved on since that banner — read it first'
        : await drawerType(s, text, true);
  if (!no) return true;
  note($('#shead'), `Reply not sent${s ? ` to “${s.title}”` : ''}: ${no}`, true);
  if (inApp && s)
    post({
      type: 'alert',
      kind: 'unsent',
      heading: `Reply not sent · ${s.project || ''}`,
      project: s.project || '',
      title: s.title || '',
      snippet: no,
      sessionId: id,
    });
  return false;
};
/** Words typed into the chat's Claude in its drawer here, as you would type them — newlines as Claude Code's own
 *  (ESC CR), then ⏎ when `send` (unsent: there for you to read and send): over the page's own socket to it when it is
 *  attached, else one opened for the words and closed after them, which sends no size, so the drawer is not resized.
 *  Never while it asks (typeIn): null once typed, else why not. */
async function drawerType(s, text, send) {
  const d = drawerOf(s),
    body = forClaude(text);
  if (!d) return 'it has no drawer here';
  if (!body) return 'there are no words to type';
  if (asking(s)) return ASKS_FIRST;
  const tm = claudeTm(s);
  if (tm) return typeIn(tm.ws, body, send);
  await keySafe();
  const ws = new WebSocket(keyed(`${location.origin.replace(/^http/, 'ws')}/api/terminals/${d.id}/ws`));
  return new Promise(res => {
    ws.onopen = async () => {
      const no = await typeIn(ws, body, send);
      setTimeout(() => ws.close(), 200);
      res(no);
    };
    ws.onerror = () => res('its drawer did not answer');
  });
}
