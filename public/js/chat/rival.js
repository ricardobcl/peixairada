  // ---- a second claude on this chat --------------------------------------------------------
  // VS Code launches a claude whenever a tab opens a chat, without looking for one that already runs — so a
  // chat taken over here comes back under VS Code the moment it is opened there again (and VS Code mounts
  // some chats twice on its own). The registry shows every process; the server hands the ones beyond the
  // chat's own over as `rivals`. Only a chat driven from here or a terminal gets the bar: two of VS Code's
  // own on a VS Code chat are VS Code's business. Idle, such a process writes nothing — but a turn typed
  // into its tab forks the transcript, so the bar says close it there, and the button ends it (the take-over
  // route, which with the chat already here only ends the others).
  function hasRival(s) { return !!(s?.rivals?.length && s.live?.entrypoint !== 'claude-vscode'); }
  /** The others on a chat by what they are (2026-11-04): the chip said VS Code of any of them. */
  const rivalsIn = (s, of) => s.rivals.filter(r => of === 'vs' ? r.entrypoint === 'claude-vscode' : r.kind === 'bg').length;
  let rivalEnding = null;   // the chat whose others are being ended: the bar says so across the updates until the answer
  function renderRival(s) {
    const box = $('#rival');
    if (!hasRival(s)) { box.hidden = true; return; }
    const ending = rivalEnding === s.id;
    const vs = s.rivals.filter(r => r.entrypoint === 'claude-vscode'), other = s.rivals.length - vs.length;
    const who = vs.length ? `VS Code runs a claude on this chat too` : rivalsIn(s, 'bg') === s.rivals.length ? 'A background session runs on this chat too' : `Another claude runs on this chat`;
    const pids = s.rivals.map(r => `pid ${r.pid}${r.startedAt ? ', since ' + rel(new Date(r.startedAt).toISOString()) + ' ago' : ''}`).join('; ');
    // written by VS Code after our terminal started: the chat is forked already, not just at risk
    const wrote = termLive(s) && s.tailEntrypoint === 'claude-vscode' && s.tailEntrypointAt && s.terminal.startedAt && s.tailEntrypointAt > s.terminal.startedAt;
    box.hidden = false;
    setHtml(box, `<span class="t"><b>${who}</b> (${esc(pids)})${vs.length ? ' — it starts one whenever the chat is opened there' : ''}${other && vs.length ? `, and ${other} more elsewhere` : ''}. ${vs.length ? 'Its tab does not see what happens here, and a' : 'A'}nything typed there forks the transcript${wrote ? ' — <b>and it has written to it since the take-over</b>' : ''}. ${vs.length ? 'Close the chat in VS Code, then' : 'Then'} end ${s.rivals.length === 1 ? 'it' : 'them'} here.</span>
      <button class="btn" id="rivalEnd"${ending ? ' disabled' : ''} title="End ${esc(s.rivals.map(r => r.pid).join(', '))} — what closing that chat amounts to; it comes back only if the chat is opened there again">${ending ? 'ending…' : `end ${s.rivals.length === 1 ? 'it' : 'them'}`}</button>`);
    box.querySelector('#rivalEnd').onclick = async () => {
      rivalEnding = s.id; renderRival(s);
      try { await api('POST', `/api/sessions/${s.id}/takeover`, termSize()); rivalEnding = null; }   // the registry changes and the SSE update re-renders the head, bar included
      catch (e) { rivalEnding = null; if (state.current !== s.id) return; renderRival(state.sessions.get(s.id) || s); const b = $('#rivalEnd'); if (b) { b.textContent = 'failed'; b.title = e.message; box._drawn = null; } }   // the bar is the open chat's: a chat left keeps its failure to itself (2026-10-14)
    };
  }

