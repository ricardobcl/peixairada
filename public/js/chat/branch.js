// ---- Branch from here: a copy of the chat in a drawer of its own (2026-10-31) --------------------------------------
// A card's menu, the header's ···, the launcher: the server starts `claude --resume <id> --fork-session --session-id
// <new>` in the chat's folder, the new id its own, and the column opens on the copy, its drawer attached; the chat it
// copied goes on as it was, a branch of it listed on it.
async function branchChat(session) {
  if (!session?.file) return note($('#shead'), 'Nothing in it to branch yet', true);
  let result;

  try {
    result = await withCheckout(`branch:${session.id}`, () =>
      api('POST', `/api/sessions/${session.id}/branch`, termSize()),
    );
  } catch (error) {
    return note($('#shead'), `Could not branch it: ${error.message}`, true);
  }

  await openSession(result.sessionId);

  if (state.current === result.sessionId) {
    note($('#shead'), `A branch of “${session.title}” — that one goes on as it was`);
  }
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

function sendOpen(session) {
  const why = sendWhy(session);

  if (why) return note($('#shead'), `Not to ${session.title}: ${why}`, true);
  ho.gen++;
  Object.assign(ho, { mode: 'send', ids: [session.id] });
  $('#hoText').disabled = false;
  $('#hoGo').disabled = false;
  $('#hoTitle').textContent = 'Send to';
  $('#hoChats').innerHTML = hoChat(session);
  const textArea = $('#hoText');

  textArea.value = '';
  textArea.rows = 4;
  textArea.placeholder = 'For its Claude — what you would type in its drawer';
  $('#hoWhere').hidden = true;
  hoSay(sendSay(session));
  $('#hoKeys').innerHTML = '<kbd>⏎</kbd>send<kbd>⇧⏎</kbd>a new line<kbd>esc</kbd>';
  $('#hoGo').textContent = 'Send';
  hoShow();
}

const hoSay = (text, err = false) => {
  const line = $('#hoSay');

  line.textContent = text;
  line.classList.toggle('err', err);
};

/** A chat's drawer, come up with its Claude ready for words — the registry says idle — or null after `ms`. */
async function drawerReady(id, ms = 20_000) {
  for (const t0 = Date.now(); Date.now() - t0 < ms; await new Promise(resolve => setTimeout(resolve, 150))) {
    const session = state.sessions.get(id);

    if (session && drawerOf(session) && session.alive && session.live?.status === 'idle') return session;
  }

  return null;
}

/** The words sent to the chat: typed into its drawer, or the resume's first prompt. Throws why not. */
async function sendTo(s0, text) {
  const session = state.sessions.get(s0.id) || s0;
  const why = sendWhy(session);

  if (why) throw new Error(`Not sent: ${why}`);

  if (drawerOf(session)) {
    const no = await drawerType(session, text, true);

    if (no) throw new Error(`Not sent: ${no}`);
    return;
  }

  const result = await withCheckout(session.id, () =>
    api('POST', `/api/sessions/${session.id}/terminal`, { ...termSize(), prompt: text }),
  );

  showTerminal(session, result.terminal);
  saidBack(result.back);
  if (result.prompted) return;
  const up = await drawerReady(session.id); // a drawer another ask had started: the words go in once its Claude is up

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
    const [source, target] = ho.ids.map(id => state.sessions.get(id));

    if (!source || !target) return hoSay('A chat of the two is gone from the board', true);
    $('#handoff').close();
    return foldGo(source, target, text).catch(error => note($('#shead'), error.message, true));
  }

  const session = state.sessions.get(ho.ids[0]);

  if (!session) return hoSay('That chat is gone from the board', true);
  ho.busy = true;
  $('#hoGo').disabled = true;
  hoSay(drawerOf(session) ? 'Sending…' : 'Opening its drawer…');

  try {
    await sendTo(session, text);
    $('#handoff').close();

    note(
      document.querySelector(`#slist > .card[data-id="${CSS.escape(session.id)}"]`) || $('#shead'),
      `Sent to ${session.title}`,
    );
  } catch (error) {
    hoSay(error.message, true);
  } finally {
    ho.busy = false;
    $('#hoGo').disabled = false;
  }
}

$('#hoGo').onclick = hoGo;
$('#hoCancel').onclick = () => $('#handoff').close();

$('#hoText').addEventListener('keydown', event => {
  // Send: ⏎ sends, ⇧⏎ a new line
  if (event.key !== 'Enter' || event.isComposing) return;

  if (ho.mode === 'send' ? !event.shiftKey && !event.altKey : event.metaKey) {
    event.preventDefault();
    hoGo();
  }
});

window.peixDragging = on => {
  const room = !!on && $('#room').open && $('#room').contains(document.activeElement);

  $('#room').classList.toggle('dropping', room);
  setDropping(!!on && !room);
}; // the chat's panel with the keys takes the drop (chatTakesDrop)

const pastedFiles = event => [...(event.clipboardData?.files || [])];

onGroup(tm =>
  $(tm.el.tbody).addEventListener(
    'paste',
    event => {
      // capture, so xterm's own paste (the text, a file's name) does not run
      const files = pastedFiles(event);

      if (!files.length) return;
      event.preventDefault();
      event.stopPropagation();
      if (inApp) termSend(tm, '\x16');
      else uploadFiles(files).then(attachPaths);
    },
    true,
  ),
);
