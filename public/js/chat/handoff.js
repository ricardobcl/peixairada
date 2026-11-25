  // ---- chats that talk (2026-10-31, round XIV): Send to… -------------------------------------------------------------
  // A message of yours to a chat, from its card's menu or the launcher's picker, written in a box of its own and sent as
  // its prompt: typed into its drawer when it runs here; for a chat with no process, the resume >_ makes — the words
  // handed to `claude --resume` as its first prompt, which Claude Code sends once it is up (spawnTerm's `prompt`). A chat
  // live in iTerm or VS Code is out of reach, as for everything else on the board; one asking you would take the words
  // for its answer. Only what you typed is ever sent — nothing a chat said, nothing the board received.
  const ho = { mode: null, ids: [], busy: false, gen: 0 };   // the box's: send, merge or fold, the chats, an ask under way, which opening
  /** Why the board cannot send to this chat, or null. */
  function sendWhy(s) {
    if (!s) return 'it is not on the board';
    if (asking(s)) return 'it is asking you something — answer it first';
    if (drawerOf(s)) return null;
    if (s.alive) return `it runs in ${inVsCode(s) ? 'VS Code' : 'another terminal'}, out of the board's reach — ⌥⌘C takes it over`;
    if (!s.file) return 'there is nothing in it to resume yet';
    return s.cwd ? null : 'no folder is known for it';
  }
  /** How the words will land, in words — under the box. */
  const sendSay = s => drawerOf(s) ? `Typed into its drawer here and sent${s.status === 'working' ? ' — it is clauding: Claude Code takes it in as it would from you' : ''}.`
    : `Its Claude isn’t running: its drawer opens here (claude --resume), with this as its first prompt${s.folderMissing && s.cloneRef ? ` — after cloning ${s.cloneRef}` : ''}.`;
  /** A chat as the box lists it: its project's square, name and title. */
  const hoChat = (s, extra = '') => `<div class="hochat" style="${repoStyle(repoColor(s.cwd))}" data-id="${esc(s.id)}"><span class="sq"></span><b>${projIcon(s.project)}${esc(s.project)}</b><span class="ht">${ticks(esc(s.title))}</span>${extra}</div>`;
  /** A card's rows for the right-click menu: what can be done with it and another chat — and the chats tied to it. */
  function talkRows(s) {
    const no = sendWhy(s), mno = mergeWhy(s), fno = foldFromWhy(s);
    return [{ hr: true }, { t: 'Send to this chat…', ...no ? { off: true, sub: no } : {}, fn: () => sendOpen(s) },
      { t: 'Merge with…', ...mno ? { off: true, sub: mno } : { sub: 'a new chat, its first prompt where each stands' }, fn: () => mergePick([s.id]) },
      { t: 'Fold into…', ...fno ? { off: true, sub: fno } : { sub: 'where it stands, typed into another chat — then done' }, fn: () => foldPick(s) },
      { t: 'Branch from here', ...s.file ? { sub: 'a copy in a drawer of its own — this one goes on as it is' } : { off: true, sub: 'nothing in it to branch yet' }, fn: () => branchChat(s) },
      ...(s.links || []).map(l => ({ t: linkSay(l), ...state.sessions.has(l.id) ? {} : { off: true }, fn: () => openSession(l.id, { locate: true }) }))];
  }
  // ---- merged, folded, branched: the chats tied to one, by your hand (2026-10-31) -----------------------------------
  // The server keeps the ties (its `links`, from the merge's, the fold's or the branch's own route); a card says it has
  // some by a word beside its project — `branch`, `merged`, `merge of 2` — its tooltip saying with which; the header's ···
  // and the card's right-click menu list them, each a row that opens its chat.
  /** A tie in words: what it is, and the chat at its other end — “Merged into ‘Queue for invoice webhooks’”. */
  function linkSay(l) {
    const say = { 'merge:out': 'Merged into', 'merge:in': 'Merged from', 'fold:out': 'Folded into', 'fold:in': 'Folded in from', 'branch:in': 'Branched from', 'branch:out': 'Its branch', 'continued:out': 'Went on as', 'continued:in': 'Goes on from' }[`${l.k}:${l.dir}`];
    return `${say} “${state.sessions.get(l.id)?.title || 'a chat no longer on the board'}”`;
  }
  function linkChip(s) {
    const ls = s.links || []; if (!ls.length) return '';
    const n = k => ls.filter(l => `${l.k}:${l.dir}` === k).length;
    const words = [['branch:in', () => 'branch'], ['branch:out', c => `${c} branch${c > 1 ? 'es' : ''}`], ['merge:in', c => `merge of ${c}`], ['merge:out', () => 'merged'], ['fold:in', c => `${c} folded in`], ['fold:out', () => 'folded'], ['continued:in', () => 'went on from a chat'], ['continued:out', () => 'went on']]
      .filter(([k]) => n(k)).map(([k, say]) => say(n(k)));
    return `<span class="chip lnk" title="${esc(ls.map(linkSay).join('\n'))}">${ls.some(l => l.k === 'branch' || l.k === 'continued') ? ICON.branch : ICON.prMerged}${esc(words.slice(0, 2).join(' · '))}</span>`;
  }
  function linkMenuHtml(s) {
    return (s.links || []).map(l => `<button class="hmi" data-lnk="${esc(l.id)}"${state.sessions.has(l.id) ? '' : ' disabled'} title="Open it">${l.k === 'branch' || l.k === 'continued' ? ICON.branch : ICON.prMerged}<span class="lbl">${esc(linkSay(l))}</span><span class="k"></span></button>`).join('');
  }
  // ---- Merge with…: a new chat from several, its first prompt where each stands (2026-10-31) -----------------------
  // From a card's menu (that chat taken in) or the launcher: the chats picked in the picker (⏎ takes one in or out), then
  // the handoff the server writes from their transcripts (GET /api/handoff) in the box, yours to change, and the folder
  // the new chat starts in — the first chat's, another's, or none. Start: a new chat in a drawer, the handoff its first
  // prompt (POST /api/terminals with `prompt` and `from`); the old chats stay as they are, tied to it.
  const mergeWhy = s => s?.file ? null : 'nothing in it to hand off yet';
  const mergePick = (picked = [], back = null) => pickOpen('chatpick', { ask: 'Merge into a new chat', many: true, picked: picked.filter(id => !mergeWhy(state.sessions.get(id))), min: 2, why: mergeWhy, go: mergeOpen,
    goSay: n => n >= 2 ? `Merge these ${n} chats into a new one →` : `Merge — ${n} chat${n === 1 ? '' : 's'} in so far, ⏎ on another`, ...back && { back } });
  async function mergeOpen(ids) {
    const list = ids.map(id => state.sessions.get(id)).filter(Boolean);
    if (list.length < 2) return note($('#shead'), 'Two chats at least to merge', true);
    const gen = ++ho.gen; Object.assign(ho, { mode: 'merge', ids: list.map(s => s.id) });
    $('#hoTitle').textContent = `Merge ${list.length} chats into a new chat`;
    $('#hoChats').innerHTML = list.map(s => hoChat(s)).join('');
    const t = $('#hoText'); t.value = ''; t.rows = 14; t.placeholder = 'Reading where each stands…'; t.disabled = true;
    const dirs = [...new Set(list.map(s => s.cwd).filter(Boolean))];
    $('#hoCwd').innerHTML = dirs.map(d => `<option value="${esc(d)}">${esc(homePath(d))}</option>`).join('') + (state.about.scratch ? `<option value="${esc(state.about.scratch)}">no folder — the board’s own</option>` : '');
    $('#hoWhere').hidden = false;
    hoSay('A new chat starts in a drawer, in that folder, with this as its first prompt. The chats stay as they are, each tied to it.');
    $('#hoKeys').innerHTML = '<kbd>⌘⏎</kbd>start<kbd>esc</kbd>'; $('#hoGo').textContent = 'Start';
    hoShow();
    await hoFill(gen, 'merge');
  }
  /** The handoff the server writes for the box's chats, into the box — unless the box was opened anew meanwhile. */
  async function hoFill(gen, kind) {
    const t = $('#hoText'); $('#hoGo').disabled = true;   // nothing to confirm until it is there to read (2026-11-02)
    try { const d = await api('GET', `/api/handoff?kind=${kind}&ids=${ho.ids.slice(0, kind === 'fold' ? 1 : 12).map(encodeURIComponent).join(',')}`); if (gen === ho.gen) t.value = d.text; }
    catch (e) { if (gen === ho.gen) hoSay(`Could not read where ${kind === 'fold' ? 'it stands' : 'they stand'}: ${e.message}`, true); }
    finally { if (gen === ho.gen) { $('#hoGo').disabled = false; t.disabled = false; t.placeholder = 'The handoff'; t.focus(); t.setSelectionRange(0, 0); t.scrollTop = 0; } }
  }
  // ---- Fold into…: one chat's handoff typed into another's drawer, unsent; the first ticked done (2026-10-31) --------
  // From a card's menu, or the launcher for the open chat: the chat it goes into from the picker (where Send to… could
  // reach — a drawer here, or none running), the handoff in the box. Fold: that chat opened, its drawer resumed if it
  // has none, the handoff typed in and not sent — yours to read and send, as a review's prompt is — then the first chat
  // ticked done, tied to it. A chat at work is not folded: the tick would end it mid-turn.
  const foldFromWhy = s => !s?.file ? 'nothing in it to hand off yet' : !canTick(s) ? 'it is at work — fold it once it is idle' : null;
  const foldPick = (s, back = null) => pickOpen('chatpick', { ask: `Fold “${s.title}” into`, skip: [s.id], why: sendWhy, then: b => foldOpen(s, b), ...back && { back } });
  async function foldOpen(a, b) {
    const no = foldFromWhy(a) || sendWhy(b); if (no) return note($('#shead'), `Not folded: ${no}`, true);
    const gen = ++ho.gen; Object.assign(ho, { mode: 'fold', ids: [a.id, b.id] });
    $('#hoTitle').textContent = 'Fold one chat into another?';
    $('#hoChats').innerHTML = hoChat(a, '<span class="hx">then done</span>') + hoChat(b, '<span class="hx">gets it, unsent</span>');
    const t = $('#hoText'); t.value = ''; t.rows = 12; t.placeholder = 'Reading where it stands…'; t.disabled = true;
    $('#hoWhere').hidden = true;
    hoSay(`Typed into “${b.title}”'s drawer${drawerOf(b) ? '' : ', resumed here for it,'} and not sent: read it there, and ⏎ sends it. “${a.title}” is then ticked done, tied to it.`);
    $('#hoKeys').innerHTML = '<kbd>⌘⏎</kbd>fold<kbd>esc</kbd>'; $('#hoGo').textContent = 'Fold';
    hoShow();
    await hoFill(gen, 'fold');
  }
  /** The fold itself: the chat it goes into opened, its drawer up, the words typed unsent; then the tie and the tick. */
  async function foldGo(a0, b0, text) {
    const a = state.sessions.get(a0.id) || a0, no = foldFromWhy(a) || sendWhy(state.sessions.get(b0.id) || b0); if (no) throw new Error(`Not folded: ${no}`);
    await openSession(b0.id);
    const b = state.sessions.get(b0.id) || b0;
    if (!drawerOf(b)) { await termAction(b); if (!await drawerReady(b.id)) throw new Error(`“${b.title}” did not come up — nothing typed, “${a.title}” as it was`); }
    for (let i = 0; i < 40 && !claudeTm(state.sessions.get(b.id) || b); i++) await new Promise(r => setTimeout(r, 100));   // the page's own socket to it
    if (!await drawerType(state.sessions.get(b.id) || b, text, false)) throw new Error(`“${b.title}”'s drawer did not answer — nothing typed, “${a.title}” as it was`);
    if (state.current === b.id) focusTerm();
    await api('POST', `/api/sessions/${a.id}/fold`, { into: b.id });
    tickDone(a.id, true, $('#shead'));
  }
