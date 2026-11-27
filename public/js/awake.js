// ---- keeping the Mac awake (2026-10-08) ----------------------------------------------------------------------------
// Two switches of the status bar's (renderBar: #sbAwake, #sbLid; the header's cup and a row of ··· while the bar could
// be off, until 2026-10-14): a muted cup while the Mac may sleep, the cup in amber saying *awake* while the server
// holds idle sleep off; the lid's setting takes a password, and while it holds — the system's, whoever set it — the
// laptop is red.
/** The cup with nothing to hold off (2026-10-09): the Mac set never to sleep on its own on the power it draws from now
 *  (pmset's `sleep` 0 — on a charger, as System Settings › Battery › Options has it), or the lid's setting keeping it
 *  from sleeping at all. Then it is muted, on or off — on, it still holds idle sleep off the moment that changes. */
function cupMoot(a) {
  return a.lid ? 'lid' : a.idleSleep === 0 ? 'set' : '';
}

function cupTip(a, more = '') {
  const moot = cupMoot(a);
  const ac = a.power === 'ac';

  if (!moot) {
    return a.awake
      ? 'Keeping this Mac awake while the board runs: idle sleep is held off (the display may still sleep, and closing the lid still sleeps it). Click to let it sleep'
      : `Keep this Mac awake while the board runs — idle sleep held off; the display may still sleep${more}`;
  }

  const why =
    moot === 'lid'
      ? "The lid's setting keeps this Mac from sleeping at all, so there is nothing for this to hold off"
      : `${ac ? 'On power, this Mac' : 'This Mac'} is set never to sleep on its own${ac ? ' (System Settings › Battery › Options; Energy on a desktop)' : ''}, so there is nothing to hold off now — closing the lid still sleeps it`;

  const when = moot === 'lid' ? "once the lid's setting lets go" : ac ? 'on battery' : 'should that change';

  return `${why}. ${a.awake ? `On: it holds idle sleep off ${when}. Click to turn it off` : `Switch it on to hold idle sleep off ${when}`}`;
}

const awakeOf = d => ({ awake: !!d.awake, lid: !!d.lid, idleSleep: d.idleSleep ?? null, power: d.power ?? null });
const awakeChanged = () => renderBar();

async function setAwake(body, at) {
  if ('lid' in body) {
    state.lidAsking = true;
    awakeChanged();
  }

  try {
    state.awake = awakeOf(await api('PUT', '/api/awake', body));
  } catch (e) {
    if (e.body && 'awake' in e.body) state.awake = awakeOf(e.body);

    if (e.message !== 'cancelled') {
      note(
        at || $('#shead'),
        `Could not ${'lid' in body ? "change the lid's setting" : 'keep the Mac awake'}: ${e.message}`,
        true,
      );
    }
  } finally {
    state.lidAsking = false;
    awakeChanged();
  }
}

// A chat whose claude ended before a first word (2026-11-04: a branch, a new one): no line of it was written, so it has
// no card and nothing to resume. The column does not stay on it: back to the chat a branch copied, else home.
const noneLeft = s => !s.alive && !s.file && !termLive(s) && !visible(s);

const leaveEmpty = s => {
  const from = s.links?.find(l => l.k === 'branch' && l.dir === 'in' && state.sessions.has(l.id))?.id;

  if (from) openSession(from);
  else leaveChat();
};

function leaveChat(head = NO_CHAT.head, log = NO_CHAT.log, color = null) {
  state.current = null;
  state.entries = [];
  Object.assign(logOf, { id: null, gen: null, upto: null, waiting: false, pending: [] });
  history.replaceState(null, '', location.pathname);
  hidePr();
  syncTerm(null);
  const menu = $('#hmenu');

  if (menu.open) menu.close();
  $('#prlist').hidden = true;
  $('#chat').classList.remove('vsc');
  tintChat(color);
  $('#shead').innerHTML = head;
  delete $('#shead').dataset.sid;
  $('#log').innerHTML = log;
  drawn.head = drawn.menu = drawn.prs = null;
  postChat(null);
  layoutNotch();
  paintHeadSplit();
  renderResume(null);
  if (log === NO_CHAT.log) showHome(); // nothing open: the home (2026-10-10)
}

// A new chat has no session until claude registers; the server ties the two by pid and says so
// over SSE, at which point the pane switches to it. `task` names a launcher of the folder's Taskfile (newChatIn).
// `more` (2026-10-31, a merge): `{prompt, from}` — the handoff you started, and the chats it merges — the server picks
// the new chat's id and says it, so the column opens on it at once.
async function newChat(cwd, task = null, more = null) {
  if (isHidden(cwd)) showProject(cwd); // working in a folder again is the plainest way of saying it belongs on the board

  let d;
  let box = null; // box: the column saying a clone is under way, while it is still on show

  try {
    d = await withCheckout(
      `new:${cwd}`,
      () => api('POST', '/api/terminals', { cwd, task, ...more, ...termSize() }),
      c => {
        leaveChat(
          `<h2><span class="repo">${esc(folderName(cwd))}</span><span class="sep"></span><span class="t">cloning ${esc(c.ref)}…</span></h2>`,
          `<div class="empty clonebox" data-dir="${esc(c.dir)}"><b>Cloning ${esc(c.ref)}</b> into ${esc(homePath(c.dir))}: the folder is not checked out yet, and the chat starts once it is.<span class="cp"></span><i class="cbar"></i></div>`,
          repoColor(cwd),
        );

        box = $('#log .clonebox');
      },
    );
  } catch (e) {
    if (!box || box.isConnected) {
      $('#log').innerHTML = `<div class="empty">Could not start a chat: ${esc(e.message)}</div>`;
    } else note($('#shead'), `Could not start a chat in ${folderName(cwd)}: ${e.message}`, true);
    return;
  }

  // cloned while another chat was opened: the new one is on the list, and the open chat keeps its column and its drawer
  if (box && !box.isConnected) {
    note($('#shead'), `Cloned — the new chat in ${folderName(cwd)} is on the list`);
    renderBoard();
    return;
  }

  leaveChat(
    `<h2><span class="repo">${esc(folderName(cwd))}</span><span class="sep"></span><span class="t">${more?.from?.length ? `merged from ${more.from.length} chats` : 'new chat'}${task ? ` · task ${esc(task)}` : ''}${more?.agent ? ` as @${esc(agentShort(more.agent))}` : ''}</span></h2>`,
    '<div class="empty">Say something in the terminal below — the transcript shows up here once Claude has written it.</div>',
    repoColor(cwd),
  );

  if (!inProject({ cwd }, projectStub(prefs.project))) scopeTo(ALL); // so the new chat lands in view (2026-11-04, a filter never takes a value you did not give it)
  savePrefs();
  renderBoard();
  attachTerm(curTerm(), d.terminal);
  if (d.sessionId) openSession(d.sessionId); // an id the board picked: no registry to wait on
}
