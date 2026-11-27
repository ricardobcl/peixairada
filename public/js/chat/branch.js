// ---- Branch from here: a copy of the chat in a drawer of its own (2026-10-31) --------------------------------------
// A card's menu, the header's ···, the launcher: the server starts `claude --resume <id> --fork-session --session-id
// <new>` in the chat's folder, the new id its own, and the column opens on the copy, its drawer attached; the chat it
// copied goes on as it was, a branch of it listed on it.
async function branchChat(s) {
  if (!s?.file) return note($('#shead'), 'Nothing in it to branch yet', true);
  let r;

  try {
    r = await withCheckout(`branch:${s.id}`, () => api('POST', `/api/sessions/${s.id}/branch`, termSize()));
  } catch (e) {
    return note($('#shead'), `Could not branch it: ${e.message}`, true);
  }

  await openSession(r.sessionId);
  if (state.current === r.sessionId) note($('#shead'), `A branch of “${s.title}” — that one goes on as it was`);
}

const sendPick = () => pickOpen('chatpick', { ask: 'Send to a chat', back: 'launch', why: sendWhy, then: sendOpen });

function hoShow() {
  const dlg = $('#handoff');

  if (!dlg.open) {
    if (inApp) post({ type: 'focus' });
    dlg.showModal();
    repostPane();
  }

  $('#hoText').focus();
}

function sendOpen(s) {
  const why = sendWhy(s);

  if (why) return note($('#shead'), `Not to ${s.title}: ${why}`, true);
  ho.gen++;
  Object.assign(ho, { mode: 'send', ids: [s.id] });
  $('#hoText').disabled = false;
  $('#hoGo').disabled = false;
  $('#hoTitle').textContent = 'Send to';
  $('#hoChats').innerHTML = hoChat(s);
  const t = $('#hoText');

  t.value = '';
  t.rows = 4;
  t.placeholder = 'For its Claude — what you would type in its drawer';
  $('#hoWhere').hidden = true;
  hoSay(sendSay(s));
  $('#hoKeys').innerHTML = '<kbd>⏎</kbd>send<kbd>⇧⏎</kbd>a new line<kbd>esc</kbd>';
  $('#hoGo').textContent = 'Send';
  hoShow();
}

const hoSay = (text, err = false) => {
  const p = $('#hoSay');

  p.textContent = text;
  p.classList.toggle('err', err);
};

/** A chat's drawer, come up with its Claude ready for words — the registry says idle — or null after `ms`. */
async function drawerReady(id, ms = 20_000) {
  for (const t0 = Date.now(); Date.now() - t0 < ms; await new Promise(r => setTimeout(r, 150))) {
    const s = state.sessions.get(id);

    if (s && drawerOf(s) && s.alive && s.live?.status === 'idle') return s;
  }

  return null;
}

/** The words sent to the chat: typed into its drawer, or the resume's first prompt. Throws why not. */
async function sendTo(s0, text) {
  const s = state.sessions.get(s0.id) || s0;
  const why = sendWhy(s);

  if (why) throw new Error(`Not sent: ${why}`);

  if (drawerOf(s)) {
    const no = await drawerType(s, text, true);

    if (no) throw new Error(`Not sent: ${no}`);
    return;
  }

  const r = await withCheckout(s.id, () =>
    api('POST', `/api/sessions/${s.id}/terminal`, { ...termSize(), prompt: text }),
  );

  showTerminal(s, r.terminal);
  saidBack(r.back);
  if (r.prompted) return;
  const up = await drawerReady(s.id); // a drawer another ask had started: the words go in once its Claude is up

  if (!up) throw new Error('Its drawer did not come up — not sent');
  const no = await drawerType(up, text, true);

  if (no) throw new Error(`Not sent: ${no}`);
}

async function hoGo() {
  if (ho.busy || $('#hoText').disabled) return;
  const text = $('#hoText').value;

  if (!text.trim()) return $('#hoText').focus();

  if (ho.mode === 'merge') {
    const cwd = $('#hoCwd').value;
    const from = ho.ids.slice();

    $('#handoff').close();
    return newChat(cwd, null, { prompt: text, from });
  }

  if (ho.mode === 'fold') {
    const [a, b] = ho.ids.map(id => state.sessions.get(id));

    if (!a || !b) return hoSay('A chat of the two is gone from the board', true);
    $('#handoff').close();
    return foldGo(a, b, text).catch(e => note($('#shead'), e.message, true));
  }

  const s = state.sessions.get(ho.ids[0]);

  if (!s) return hoSay('That chat is gone from the board', true);
  ho.busy = true;
  $('#hoGo').disabled = true;
  hoSay(drawerOf(s) ? 'Sending…' : 'Opening its drawer…');

  try {
    await sendTo(s, text);
    $('#handoff').close();
    note(document.querySelector(`#slist > .card[data-id="${CSS.escape(s.id)}"]`) || $('#shead'), `Sent to ${s.title}`);
  } catch (e) {
    hoSay(e.message, true);
  } finally {
    ho.busy = false;
    $('#hoGo').disabled = false;
  }
}

$('#hoGo').onclick = hoGo;
$('#hoCancel').onclick = () => $('#handoff').close();

$('#hoText').addEventListener('keydown', e => {
  // Send: ⏎ sends, ⇧⏎ a new line
  if (e.key !== 'Enter' || e.isComposing) return;

  if (ho.mode === 'send' ? !e.shiftKey && !e.altKey : e.metaKey) {
    e.preventDefault();
    hoGo();
  }
});

window.peixDragging = on => {
  const room = !!on && $('#room').open && $('#room').contains(document.activeElement);

  $('#room').classList.toggle('dropping', room);
  setDropping(!!on && !room);
}; // the chat's panel with the keys takes the drop (chatTakesDrop)

const pastedFiles = e => [...(e.clipboardData?.files || [])];

onGroup(tm =>
  $(tm.el.tbody).addEventListener(
    'paste',
    e => {
      // capture, so xterm's own paste (the text, a file's name) does not run
      const files = pastedFiles(e);

      if (!files.length) return;
      e.preventDefault();
      e.stopPropagation();
      if (inApp) termSend(tm, '\x16');
      else uploadFiles(files).then(attachPaths);
    },
    true,
  ),
);
