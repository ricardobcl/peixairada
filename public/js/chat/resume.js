// ---- resume: a chat whose claude has ended ----------------------------------------------
// A chat with no process is its transcript and nothing more (2026-10-07; a box under it sent a one-shot
// `claude --resume -p` reply before, and read as if the chat were still there). The bar under the column says so,
// and its button is >_'s: `claude --resume` in a drawer here. Not under a terminal on the same chat — that drawer is
// the chat. It waits for the button (a countdown to a resume by itself was a switch until 2026-10-14).
const inDrawer = session =>
  termLive(session) || terms.some(tm => tm.id && tm.sessionId === session.id && tm.exited === null);

const resumable = session => !!(session && !session.alive && session.file && !inDrawer(session));
// A claude running outside the board has the same bar (2026-11-04): where it runs and what to do about it. Its transcript
// alone, with Take over one row of ···, read as a chat with no claude and no way back to it.
const elsewhereBar = session => !!(session && (takeable(session) || attachable(session)) && !inDrawer(session));

function renderElsewhere(session, box) {
  const armed = drawer.arm === session.id;
  const err = drawer.err;
  const going = termAsking.has(session.id) && !armed;

  if (attachable(session)) {
    box.hidden = false;
    box.classList.toggle('err', !!err);
    box.classList.remove('cloning');

    setHtml(
      box,
      `<span class="ric">${ICON.term}</span>
        <span class="t"><b>${err ? 'Could not open it' : 'Claude is running in the background'}</b><span>${err ? esc(err) : `${!session.lastActivity && session.links?.some(link => link.k === 'continued' && link.dir === 'in') ? 'What it remembers shows here after its next word. ' : ''}pid ${session.live.pid}. Attach opens it here; it keeps running when the drawer closes.`}</span></span>
        <button class="btn rgo" id="takeGo"${going ? ' disabled' : ''} title="${esc(ATTACH_TIP + KEY_C)}">${ICON.term}${going ? 'opening…' : 'Attach'}<span class="k">⌥⌘C</span></button>`,
    );

    box.querySelector('#takeGo').onclick = () => termAction(state.sessions.get(session.id) || session);
    return;
  }

  const where = inVsCode(session)
    ? 'VS Code'
    : session.live.entrypoint === 'cli'
      ? 'a terminal outside the board'
      : 'a process outside the board';

  box.hidden = false;
  box.classList.toggle('err', !!err);
  box.classList.remove('cloning');

  setHtml(
    box,
    `<span class="ric">${ICON.term}</span>
      <span class="t"><b>${err ? 'Could not take it over' : `Claude is running in ${where}`}</b><span>${err ? esc(err) : `pid ${session.live.pid}. Take over ends it there and resumes the chat here${inVsCode(session) ? '; the tab there will not follow' : ''}.`}</span></span>
      <button class="btn rgo${armed ? ' arm' : ''}" id="takeGo"${going ? ' disabled' : ''} title="${esc(takeTip(session) + KEY_C)}">${ICON.term}${going ? 'ending…' : armed ? sureWord(session) : 'Take over'}<span class="k">⌥⌘C</span></button>`,
  );

  box.querySelector('#takeGo').onclick = () => termAction(state.sessions.get(session.id) || session);
}

function renderResume(session) {
  if (session && session.id !== state.current) return; // the open chat's only, as its header
  const box = $('#resume');

  if (elsewhereBar(session)) return renderElsewhere(session, box);

  if (!resumable(session)) {
    box.hidden = true;
    return;
  }

  const going = termAsking.has(session.id);
  const err = drawer.err;

  // cloning its folder first (2026-10-09), or about to: `folderMissing` and `cloneRef` are the server's, on the summary
  const clone = cloneWaits.get(session.id);
  const cl = clone && (state.clones.get(clone.dir) || { phase: null, percent: 0 });

  const where = `<code>${esc(homePath(session.cwd || ''))}</code>`;

  const label =
    session.folderMissing && session.cloneRef
      ? 'Clone and resume'
      : session.agent
        ? `Resume as @${esc(agentShort(session.agent))}`
        : 'Resume'; // Claude Code puts the agent back itself (2026-11-06, E3)

  box.hidden = false;
  box.classList.toggle('err', !!err);
  box.classList.toggle('cloning', !!clone);
  if (clone) box.style.setProperty('--clone-p', (cl.percent || 0) / 100);

  if (clone) {
    setHtml(
      box,
      `<span class="ric">${ICON.download}</span>
        <span class="t"><b>Cloning ${esc(clone.ref)}</b><span>This chat’s folder, ${where}, is not checked out: cloning it into <code>${esc(homePath(clone.dir))}</code>, then resuming. <span class="cp">${esc(cloneSays(cl))}</span></span></span>
        <button class="btn rgo" id="resumeGo" disabled>${ICON.download}cloning… ${cl.percent || 0}%</button>`,
    );

    return;
  }

  // A chat last continued in VS Code is resumed here as any other (2026-09-20): the one thing to know is that the
  // tab there, if it is still open, will not follow it. The words are what you need to act and nothing else
  // (2026-10-12; "What you see is its transcript … Resume runs claude --resume on it, in a terminal here" before):
  // one line, and a second only when there is something to know — the button's tooltip says what it runs.
  const more = err
    ? esc(err)
    : !session.cwd
      ? 'No folder is known for it, so it cannot be resumed from here.'
      : session.folderMissing && session.cloneRef
        ? `Its folder, ${where}, is not checked out — resuming clones <b>${esc(session.cloneRef)}</b> there first.`
        : // a worktree gone from a repo that is there is made again; a folder gone inside a checkout starts in what is left (2026-10-19)
          session.folderMissing && session.back?.tree
          ? `Its worktree, ${where}, is gone — resuming makes it again${session.gitBranch && session.gitBranch !== 'HEAD' ? `, on <code>${esc(session.gitBranch)}</code>` : ''}.`
          : session.folderMissing && session.back?.near
            ? `Its folder, ${where}, is gone — resuming starts it in <code>${esc(homePath(session.back.near))}</code>, the nearest folder left.`
            : session.folderMissing
              ? `Its folder, ${where}, is not there, and no folder of repos with an org holds it to clone from. Put it back, then resume.`
              : inVsCode(session)
                ? 'Last used in VS Code. Resuming moves it here; the tab there will not follow.'
                : '';

  const off = session.removed && !err; // found by ⌥⌘K, deleted from the board (2026-11-04): either button brings its card back

  // it went on as another chat (2026-11-04, /bg): that one is the way on, and a resume here a second line from this point
  const on =
    !err &&
    (id => state.sessions.has(id) && visible(state.sessions.get(id)) && id)(
      session.links?.find(link => link.k === 'continued' && link.dir === 'out')?.id,
    );

  setHtml(
    box,
    `<span class="ric">${ICON.term}</span>
      <span class="t"><b>${err ? 'Could not resume this chat' : off ? 'Deleted from the board' : on ? 'It went on in another chat' : 'Claude isn’t running in this chat'}</b>${off ? '<span>Its transcript stays. Put it back, or resume it, and its card comes back.</span>' : on ? '<span>Resuming this one starts a second line from here.</span>' : more ? `<span>${more}</span>` : ''}</span>
      ${off ? '<button class="btn" id="undelGo">Put it back</button>' : ''}${on ? '<button class="btn rgo" id="onGo">Open it</button>' : ''}${session.cwd ? `<button class="btn${on ? '' : ' rgo'}" id="resumeGo"${going ? ' disabled' : ''} title="${session.folderMissing && session.cloneRef ? `gh repo clone ${esc(session.cloneRef)}, then ` : session.folderMissing && session.back?.tree ? 'git worktree add, then ' : ''}claude --resume on this chat, in a terminal here${session.agent ? ` — as @${esc(session.agent)} again, Claude Code's own doing` : ''} · ⌥⌘C">${session.folderMissing && session.cloneRef ? ICON.download : ICON.play}${going ? 'resuming…' : label}<span class="k">⌥⌘C</span></button>` : ''}`,
  );

  const go = box.querySelector('#resumeGo');

  if (go) go.onclick = () => termAction(state.sessions.get(session.id) || session);
  const back = box.querySelector('#undelGo');

  if (back) back.onclick = () => restoreChat(session.id);
  const ahead = box.querySelector('#onGo');

  if (ahead) ahead.onclick = () => openSession(on);
}
