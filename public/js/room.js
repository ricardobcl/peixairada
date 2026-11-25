  // ---- the chat: a GitHub repo's issue, with the people the board is shared with (2026-10-17) -----------------------
  // The server reads the repo (chatTick in server.mjs); every page gets what it knows — `chat`: its issue and what you
  // have not read there, who you are, the invitations waiting for you — and what changed (`chatmsgs`). One chat, with no
  // name and no rooms (2026-10-18): the panel (#room, a non-modal dialog over the status bar's left end, where its
  // segment is) is its messages and a box. A poll is a message (2026-10-20): its answers are buttons, a vote GitHub's
  // reaction on it (the server's chatVotes); the box's ▤ asks one, and lunch's dialog one about lunch. The repo's admin also gets the people — invite (the people of the chats' PRs
  // suggested), cancel, remove. Settings › Chat makes a repo, joins one, or leaves.
  // What comes in is someone else's words, drawn by chatMd alone — markdown with no raw HTML, no images, no attribute
  // but a link's address, https or mailto, opened in the system's browser —, never by md() (whose links open a chat's
  // files and pages); and nothing here hands a word of it on: no drawer, no claude, no Reply… (test/chat.test.mjs).
  const chatUi = { n: null, msgs: [], gone: new Set(), loading: false, view: 'log', people: null, peopleErr: null, sure: null, sending: false, watch: 0, seenSent: 0, err: null, setSure: false,
    places: null, placesErr: null, placesAsk: false, newRepo: null, useRepo: null, poll: null, voting: new Set(), out: [], outSeq: 0, sendQ: Promise.resolve() };
  $('#rmPollBtn').innerHTML = ICON.poll; $('#rmPeople').innerHTML = ICON.people; $('#rmMore').innerHTML = ICON.more; $('#rmClose').innerHTML = ICON.close;
  const chatMarked = hasMd ? new marked.Marked({ gfm: true, breaks: true, renderer: { html: t => esc(t.text ?? ''), image: t => esc(`[image: ${t.text || t.href || ''}]`) } }) : null;
  const CHAT_TAGS = ['p', 'br', 'strong', 'em', 'del', 's', 'code', 'pre', 'blockquote', 'ul', 'ol', 'li', 'a', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'table', 'thead', 'tbody', 'tr', 'th', 'td'];
  const chatHtml = new Map();
  /** A message's words as the panel draws them: raw HTML escaped by the parser, then only CHAT_TAGS, and no attribute but a
   *  link's address — https or mailto —, which it says on hover. */
  function chatMd(text) {
    const t = String(text ?? ''); if (chatHtml.has(t)) return chatHtml.get(t);
    let html = !chatMarked ? esc(t).replace(/\n/g, '<br>') : DOMPurify.sanitize(chatMarked.parse(t), { ALLOWED_TAGS: CHAT_TAGS, ALLOWED_ATTR: ['href'], ALLOWED_URI_REGEXP: /^(?:https:\/\/|mailto:)/i });
    const tpl = document.createElement('template'); tpl.innerHTML = html;
    for (const a of tpl.content.querySelectorAll('a')) { const h = a.getAttribute('href'); if (!h) { a.replaceWith(...a.childNodes); continue; } a.title = h; a.rel = 'noopener noreferrer'; }
    html = tpl.innerHTML;
    if (chatHtml.size > 2000) chatHtml.clear();
    chatHtml.set(t, html); return html;
  }
  const chatClock = ts => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const chatFace = (url, cls = 'face') => /^(https:\/\/avatars\.githubusercontent\.com\/|data:image\/)/.test(url || '') ? `<img class="${cls}" src="${esc(url)}" alt="" loading="lazy">` : `<span class="${cls}"></span>`;
  /** The status bar's word on the chat (renderBar): its unread count, an invitation waiting, what went wrong — nothing
   *  while there is no chat and no invitation. Reads state alone: the bar is drawn before this section has run. */
  function chatSeg() {
    const c = state.chat;
    if (!c.on) return c.invites?.length ? `<button class="seg chatseg inv" id="sbChat" title="${esc(`${c.invites[0].by || 'Someone'} invited you to the chat in ${c.invites[0].repo} — click to join it`)}">${ICON.chat}invited</button>` : '';
    const n = c.unread || 0;
    return `<button class="seg chatseg${c.error ? ' err' : ''}" id="sbChat" title="${esc(c.error ? `The chat: ${c.error}` : `The chat in ${c.repo}${n ? ` — ${n} new` : ''} · click to open it`)}">${ICON.chat}chat${n ? `<b>${rn('chat', n)}</b>` : ''}</button>`;
  }
  function chatSegClick() { if (state.chat.on && !state.chat.missing) { if ($('#room').open) $('#room').close(); else chatOpen(); } else settingsAt('chat', '#chatSet'); }
  /** The panel, on the messages — or on the people. */
  function chatOpen(view = 'log') {
    const c = state.chat; if (!c.on || c.missing) return settingsAt('chat', '#chatSet');
    const dlg = $('#room'); chatUi.view = view; chatUi.sure = null;
    if (!dlg.open) { if ($('#hmenu').open) $('#hmenu').close(); dlg.show(); repostPane(); if (inApp) post({ type: 'focus' }); chatWatch(); }
    if (view === 'people') chatPeopleLoad();
    chatLoad(); chatDraw(true); renderBar(); chatSeenNow();   // what came while it was shut is read now
    if (view !== 'log') $('#rmfind').focus(); else (chatUi.poll ? $('#rmform input') : $('#rmbox')).focus();
  }
  /** The chat's messages, read as the panel first shows them — and again for another issue (the repo's, or its first
   *  closed on GitHub). */
  async function chatLoad() {
    const n = state.chat.room;
    if (n === chatUi.n && (chatUi.msgs.length || chatUi.loading)) return;
    Object.assign(chatUi, { n, msgs: [], gone: new Set(), loading: n != null, err: null, sure: null, seenSent: 0 });
    chatDraw(true); if (n == null) return;
    try { const d = await api('GET', '/api/chat/messages'); if (chatUi.n !== n) return; if (d.room === n) chatTake(d.msgs.filter(m => !chatUi.gone.has(m.id)), []); }
    catch (e) { if (chatUi.n === n) chatUi.err = e.message; }
    if (chatUi.n !== n) return;
    chatUi.loading = false; chatDraw(true); chatSeenNow();
  }
  /** Messages into the panel, by their ids: an edit in place, a delete out (and kept out of a fetch still on its way). */
  function chatTake(add, gone) {
    const by = new Map(chatUi.msgs.map(m => [m.id, m]));
    for (const m of add) by.set(m.id, m);
    for (const id of gone) { by.delete(id); chatUi.gone.add(id); }
    chatUi.msgs = [...by.values()].sort((a, b) => a.id - b.id);
  }
  function chatLogHtml() {
    const c = state.chat, me = c.me?.login, admin = c.role === 'admin';
    const sure = !chatUi.sure ? '' : `<div class="rmsure" role="group"><span>${admin ? 'Stop the chat on this board? It stays on GitHub, and you its admin.' : 'Leave the chat? Coming back takes a new invitation.'}</span><button type="button" class="btn" data-rm="unsure">Cancel</button><button type="button" class="btn danger" data-rm="leave">${admin ? 'Stop' : 'Leave'}</button></div>`;
    if (!c.ready) return sure + `<div class="rmnone">${esc(c.error || 'Reading the chat…')}</div>`;
    if (c.room == null) return sure + `<div class="rmnone">No chat in ${esc(c.repo)} yet — its admin's board starts it.</div>`;
    // yours on their way (chatSend) after everything said, as you see them: faded while they go, and one that did not go
    // says so under its words — Try again, or Edit (its words back in the box)
    const outs = chatUi.out.filter(o => o.n === chatUi.n).map(o => ({ who: me || 'you', face: c.me?.face, at: o.at, body: o.body, out: o }));
    if (!chatUi.msgs.length && !outs.length) return sure + `<div class="rmnone">${esc(chatUi.err || (chatUi.loading ? 'Reading…' : 'Nothing said yet.'))}</div>`;
    let out = sure, prev = null;
    for (const m of [...chatUi.msgs, ...outs]) {
      if (!prev || dayOf(prev.at) !== dayOf(m.at)) { out += `<div class="rmday">${esc(dayOf(m.at))}</div>`; prev = null; }
      const cont = prev?.who === m.who && new Date(m.at) - new Date(prev.at) < 5 * 60_000, mine = m.who === me || !!m.out, o = m.out;
      out += `<div class="rmmsg${cont ? ' cont' : ''}${mine ? ' mine' : ''}${o ? ` out${o.err ? ' fail' : ''}` : ''}" ${o ? `data-out="${o.key}"` : `data-id="${m.id}"`}>${chatFace(m.face)}`
        + `<div class="rmwho"><b>${esc(m.who)}</b><time datetime="${esc(m.at)}" title="${esc(new Date(m.at).toLocaleString())}">${esc(chatClock(m.at))}</time>${m.edited ? `<span class="edited" title="Edited ${esc(new Date(m.edited).toLocaleString())}">edited</span>` : ''}${o && !o.err ? '<span class="vh">sending</span>' : ''}</div>`
        + `<div class="rmbody">${m.poll ? chatPollHtml(m) : chatMd(m.body)}</div>`
        + (o?.err ? `<div class="rmfail" role="status"><span>Not sent: ${esc(o.err)}</span><button type="button" class="btn" data-rm="retry">Try again</button><button type="button" class="btn" data-rm="edit" title="Its words back in the box">Edit</button></div>`
          : !o && (mine || admin) ? `<button type="button" class="rmbtn rmdel" data-rm="del" title="${mine ? 'Delete your message' : 'Delete this message — as the chat\'s admin'}" aria-label="Delete">${ICON.close}</button>` : '') + '</div>';
      prev = m;
    }
    return out;
  }
  /** A poll as the panel draws it: the question, an answer a row — a click votes for it, again takes it back —, its share
   *  of the people who answered, and who, you first. */
  function chatPollHtml(m) {
    const p = m.poll, me = state.chat.me?.login, votes = m.votes || [], people = new Set(votes.map(v => v.who)).size;
    const rows = p.opts.map(o => {
      const vs = votes.filter(v => v.r === o.r).sort((a, b) => (b.who === me) - (a.who === me)), mine = vs.some(v => v.who === me);
      return `<button type="button" class="rmopt${mine ? ' mine' : ''}" data-rm="vote" data-r="${esc(o.r)}" aria-pressed="${mine}" style="--p:${people ? Math.round(vs.length / people * 100) : 0}%">`
        + `<span class="rmol">${esc(o.label)}</span><b>${vs.length}</b>`
        + (vs.length ? `<span class="rmvs">${vs.slice(0, 6).map(v => chatFace(v.face, 'vf')).join('')}<span>${esc(vs.map(v => v.who === me ? 'you' : v.who).join(', '))}</span></span>` : '') + '</button>';
    }).join('');
    return `<div class="rmpoll"><div class="rmq">${ICON.poll}<span>${esc(p.q)}</span></div>${rows}`
      + `<div class="rmpf">${people ? `${people} answered` : 'Nobody has answered yet'} · ${p.many ? 'as many answers as you like' : 'one answer each'}</div></div>`;
  }
  /** Your answer, drawn at once and then as GitHub took it; on a poll of one answer each it moves yours. */
  async function chatVote(id, r) {
    const m = chatUi.msgs.find(x => x.id === id), me = state.chat.me;
    if (!m?.poll || !me || chatUi.voting.has(id)) return;
    const before = m.votes || [], had = before.some(v => v.who === me.login && v.r === r);
    chatUi.voting.add(id);
    chatTake([{ ...m, votes: had ? before.filter(v => !(v.who === me.login && v.r === r)) : [...before.filter(v => m.poll.many || v.who !== me.login), { r, who: me.login, face: me.face, at: new Date().toISOString() }] }], []); chatDraw();
    try { const d = await api('POST', '/api/chat/vote', { id, r }); if (d.msg.n === chatUi.n) chatTake([d.msg], []); }
    catch (e) { const now = chatUi.msgs.find(x => x.id === id); if (now) chatTake([{ ...now, votes: before }], []); chatDraw(); note($(`#rmlog .rmmsg[data-id="${id}"] .rmq`) || $('#rmlog'), `Not voted: ${e.message}`, true); }
    finally { chatUi.voting.delete(id); }
    chatDraw();
  }
  // the poll's form, in the box's place: the question, two answers or more — eight at most, one for each reaction GitHub
  // has —, one answer each or several. What is typed is chatUi.poll's; the form is drawn again only when its rows change.
  function chatPollForm(fill = null) {
    chatUi.poll = fill === false ? null : { q: '', answers: ['', ''], many: false, ...fill };
    if (chatUi.poll && chatUi.poll.answers.length < 2) chatUi.poll.answers.push(...Array(2 - chatUi.poll.answers.length).fill(''));
    chatPollDraw();
    if (chatUi.poll) $(`#rmform [data-pf="${fill?.q ? 'post' : 'q'}"]`).focus(); else $('#rmbox').focus();
  }
  function chatPollDraw() {
    const p = chatUi.poll, form = $('#rmform'), text = 'type="text" spellcheck="false" autocomplete="off"';
    form.hidden = !p; $('#rmrow').hidden = !!p; if (!p) return;
    const lunch = state.lunch?.set;
    form.innerHTML = `<input ${text} data-pf="q" maxlength="200" placeholder="Ask the chat — Lunch at 12:30?" aria-label="The question" value="${esc(p.q)}">`
      + p.answers.map((a, i) => `<div class="rma"><input ${text} data-pf="a" data-i="${i}" maxlength="80" placeholder="Answer ${i + 1}" aria-label="Answer ${i + 1}" value="${esc(a)}">`
        + (p.answers.length > 2 ? `<button type="button" class="rmbtn" data-pf="drop" data-i="${i}" title="Drop this answer" aria-label="Drop answer ${i + 1}">${ICON.close}</button>` : '') + '</div>').join('')
      + `<div class="rmpfoot"><button type="button" class="btn" data-pf="add"${p.answers.length >= 8 ? ' disabled title="Eight at most — one for each reaction GitHub has"' : ''}>Add an answer</button>`
      + `<label><input type="checkbox" data-pf="many"${p.many ? ' checked' : ''}>Several each</label><span class="spacer"></span>`
      + (lunch ? '<button type="button" class="btn" data-pf="lunch" title="Who is going to lunch, and where — lunch\'s places">Lunch</button>' : '')
      + '<button type="button" class="btn" data-pf="cancel">Cancel</button><button type="button" class="btn go" data-pf="post">Ask</button></div>';
  }
  /** Lunch's poll: who is going and where — the day's places not closed, and Not today. */
  function lunchPoll() {
    const l = state.lunch || {}, places = (l.places || []).filter(p => p.state !== 'closed').map(p => p.name).slice(0, 7);
    return { q: l.at ? `Lunch at ${l.at}?` : 'Lunch?', answers: [...places.length ? places : ['Going'], 'Not today'], many: false };
  }
  async function chatPollPost(btn) {
    const p = chatUi.poll; if (!p || chatUi.sending) return;
    chatUi.sending = true; btn.disabled = true;
    try { const d = await api('POST', '/api/chat/poll', { q: p.q, answers: p.answers.filter(a => a.trim()), many: p.many }); if (d.msg.n === chatUi.n) chatTake([d.msg], []); chatPollForm(false); chatDraw(true); }
    catch (e) { btn.disabled = false; note(btn, `Not asked: ${e.message}`, true); }
    finally { chatUi.sending = false; }
  }
  $('#rmform').addEventListener('input', e => {
    const p = chatUi.poll, f = e.target.dataset.pf; if (!p) return;
    if (f === 'q') p.q = e.target.value; else if (f === 'a') p.answers[Number(e.target.dataset.i)] = e.target.value; else if (f === 'many') p.many = e.target.checked;
  });
  $('#rmform').addEventListener('click', e => {
    const b = e.target.closest('button[data-pf]'), p = chatUi.poll; if (!b || !p) return;
    const f = b.dataset.pf;
    if (f === 'add' && p.answers.length < 8) { p.answers.push(''); chatPollDraw(); $(`#rmform [data-pf="a"][data-i="${p.answers.length - 1}"]`).focus(); }
    else if (f === 'drop') { p.answers.splice(Number(b.dataset.i), 1); chatPollDraw(); $('#rmform [data-pf="a"]').focus(); }
    else if (f === 'lunch') chatPollForm(lunchPoll());
    else if (f === 'cancel') chatPollForm(false);
    else if (f === 'post') chatPollPost(b);
  });
  // ⏎ walks down the form, a new answer past the last; ⌘⏎ asks
  $('#rmform').addEventListener('keydown', e => {
    if (e.key !== 'Enter' || e.isComposing || e.target.type === 'checkbox') return;
    e.preventDefault();
    const p = chatUi.poll, f = e.target.dataset.pf, i = f === 'q' ? -1 : Number(e.target.dataset.i);
    if (e.metaKey || e.ctrlKey) return chatPollPost($('#rmform [data-pf="post"]'));
    if (f !== 'q' && f !== 'a') return;
    if (i + 1 < p.answers.length) return $(`#rmform [data-pf="a"][data-i="${i + 1}"]`).focus();
    if (e.target.value.trim() && p.answers.length < 8) { p.answers.push(''); chatPollDraw(); $(`#rmform [data-pf="a"][data-i="${p.answers.length - 1}"]`).focus(); }
    else $('#rmform [data-pf="post"]').focus();
  });
  function chatDraw(toEnd = false) {
    const dlg = $('#room'); if (!dlg.open) return;
    const c = state.chat, admin = c.role === 'admin', people = chatUi.view === 'people', r = c.room;
    $('#rmTitle').textContent = people ? 'People' : 'Chat'; $('#rmPeople').hidden = !admin;
    $('#rmPeople').classList.toggle('on', people); $('#rmPeople').setAttribute('aria-pressed', String(people));
    $('#rmlog').hidden = people; $('#rmpeople').hidden = !people; $('#rmfoot').hidden = people || r == null;
    if (people) return chatPeopleDraw();
    const log = $('#rmlog'), atEnd = toEnd || log.scrollHeight - log.scrollTop - log.clientHeight < 48;
    setHtml(log, chatLogHtml());
    if (atEnd) log.scrollTop = log.scrollHeight;
    $('#rmbox').placeholder = 'Message — ⏎ sends, ⇧⏎ a new line';
    setHtml($('#rmsay'), c.repo ? `<span>${esc(c.me?.login ? `as ${c.me.login}` : '')}</span><a href="https://github.com/${esc(c.repo)}${r != null ? `/issues/${r}` : ''}" data-rm="gh" title="The chat on GitHub — its messages are this issue's comments">${esc(c.repo)}</a>` : '');
  }
  function chatGrow() { const b = $('#rmbox'); b.style.height = 'auto'; b.style.height = `${Math.min(140, b.scrollHeight + 2)}px`; }
  /** Your message, in the log as ⏎ is pressed (2026-10-27; the box waited on GitHub before): drawn on its way, then as
   *  GitHub's comment once the server has it. One that did not go stays where it was said, saying so — on this page
   *  alone, since nobody else has it. Sent one after another, in the order typed (the server writes them so anyway). */
  function chatSend() {
    const box = $('#rmbox'), body = box.value; if (!body.trim() || chatUi.n == null) return;
    box.value = ''; chatGrow();
    const o = { key: ++chatUi.outSeq, n: chatUi.n, body, at: new Date().toISOString(), err: null };
    chatUi.out.push(o); chatDraw(true); chatPost(o);
  }
  function chatPost(o) {
    chatUi.sendQ = chatUi.sendQ.then(async () => {
      try { const d = await api('POST', '/api/chat/send', { body: o.body }); chatUi.out = chatUi.out.filter(x => x !== o); if (d.msg.n === chatUi.n) chatTake([d.msg], []); }
      catch (e) { o.err = e.message; }
      chatDraw();
    });
  }
  /** A message that did not go: sent again, as the newest — or its words back in the box, before what is typed there. */
  function chatRetry(key, edit) {
    const o = chatUi.out.find(x => x.key === key); if (!o) return;
    chatUi.out = chatUi.out.filter(x => x !== o);
    if (edit) { const box = $('#rmbox'); box.value = o.body + (box.value.trim() ? '\n' + box.value : ''); chatGrow(); chatDraw(); box.focus(); return; }
    Object.assign(o, { at: new Date().toISOString(), err: null }); chatUi.out.push(o); chatDraw(true); chatPost(o);
  }
  /** While the panel is up the server looks often (POST /api/chat/watch, every 15 s), else every 20 s. */
  function chatWatch() {
    clearInterval(chatUi.watch);
    const ping = () => { if ($('#room').open && !document.hidden) api('POST', '/api/chat/watch', {}).catch(() => {}); };
    ping(); chatUi.watch = setInterval(ping, 15_000);
  }
  /** The chat, read to its newest message — only while it is truly in front of you. */
  function chatSeenNow() {
    if (!$('#room').open || chatUi.view !== 'log' || chatUi.n == null || document.hidden || !document.hasFocus()) return;
    const top = chatUi.msgs.at(-1)?.id;
    if (!top || (!state.chat.unread && chatUi.seenSent >= top)) return;
    chatUi.seenSent = top; api('POST', '/api/chat/seen', { id: top }).catch(() => {});
  }
  // the people (the admin's): who is in, who is invited, whom to invite — the box narrows all three, and invites a login
  // none of them has
  async function chatPeopleLoad() {
    try { chatUi.people = await api('GET', '/api/chat/people'); chatUi.peopleErr = null; } catch (e) { chatUi.peopleErr = e.message; }
    chatDraw();
  }
  function chatPeopleDraw() {
    const p = chatUi.people, q = $('#rmfind').value.trim().replace(/^@/, '').toLowerCase(), c = state.chat;
    if (!p) return setHtml($('#rmplist'), `<div class="rmnone">${esc(chatUi.peopleErr || 'Asking GitHub…')}</div>`);
    const hit = l => !q || l.toLowerCase().includes(q), ago = ts => ts ? `${rel(ts)} ago` : '';
    const row = (login, face, small, btns, sure = '') => `<div class="rmp" data-login="${esc(login)}">${chatFace(face)}<span><b>${esc(login)}</b>${small ? `<small>${esc(small)}</small>` : ''}</span><span>${btns}</span>${sure}</div>`;
    const known = new Set([c.me?.login, ...p.members.map(m => m.login), ...p.invites.map(i => i.login), ...p.suggest.map(s => s.login)].filter(Boolean).map(l => l.toLowerCase()));
    const typed = q && /^[a-z0-9][a-z0-9-]{0,38}$/i.test(q) && !known.has(q) ? row($('#rmfind').value.trim().replace(/^@/, ''), null, 'a GitHub login', '<button type="button" class="btn" data-rm="invite">Invite</button>') : '';
    const sug = p.suggest.filter(s => hit(s.login)).map(s => row(s.login, s.face, `${s.prs} PR${s.prs === 1 ? '' : 's'} in your chats`, '<button type="button" class="btn" data-rm="invite">Invite</button>')).join('');
    const inv = p.invites.filter(i => hit(i.login)).map(i => row(i.login, i.face, i.expired ? 'expired' : `invited ${ago(i.at)}`, `${i.expired ? '<button type="button" class="btn" data-rm="invite">Again</button>' : ''}<button type="button" class="btn" data-rm="cancel" data-id="${i.id}">Cancel</button>`)).join('');
    const mem = p.members.filter(m => hit(m.login)).map(m => row(m.login, m.face, m.role || '', '<button type="button" class="btn danger" data-rm="sureRemove">Remove…</button>',
      chatUi.sure === `remove:${m.login}` ? `<div class="rmsure" role="group"><span>Remove ${esc(m.login)}? They lose the chat and its history.</span><button type="button" class="btn" data-rm="unsure">Cancel</button><button type="button" class="btn danger" data-rm="remove">Remove</button></div>` : '')).join('');
    const you = c.me ? row(c.me.login, c.me.face, 'you · its admin', '') : '';
    setHtml($('#rmplist'), (typed ? `<h6>Invite</h6>${typed}` : '') + (sug ? `<h6>From your chats’ PRs</h6>${sug}` : '') + (inv ? `<h6>Invited</h6>${inv}` : '')
      + `<h6>In the chat</h6>${you}${mem || (q ? '' : '<div class="rmnone">Nobody else yet — invite someone above.</div>')}`
      + '<p class="rmnone" style="padding: 12px 0 0">An invitation is GitHub’s: they join from Settings › Chat on their board, or from GitHub’s email.</p>');
  }
  async function chatAct(what, body, anchor, done) {
    try { const d = await api('POST', `/api/chat/${what}`, body); done?.(d); }
    catch (e) { note(anchor, e.message, true); }
  }
  $('#room').addEventListener('click', e => {
    if (e.target.closest('#rmClose')) return $('#room').close();
    if (e.target.closest('#rmPollBtn')) return chatPollForm(chatUi.poll ? false : {});
    if (e.target.closest('#rmPeople')) { chatUi.view = chatUi.view === 'people' ? 'log' : 'people'; chatUi.sure = null; if (chatUi.view === 'people') { chatPeopleLoad(); $('#rmfind').focus(); } chatDraw(true); return; }
    const more = e.target.closest('#rmMore');
    if (more) {
      const c = state.chat, b = more.getBoundingClientRect();
      return ctxShow([...(c.room != null ? [{ t: 'The chat on GitHub', fn: () => openExternal(`https://github.com/${c.repo}/issues/${c.room}`, { s: null }) }, { hr: true }] : []), { t: 'Chat settings…', fn: () => settingsAt('chat', '#chatSet') },
        { t: c.role === 'admin' ? 'Stop the chat on this board…' : 'Leave the chat…', warn: true, fn: () => { chatUi.view = 'log'; chatUi.sure = 'leave'; chatDraw(); } }], b.left, b.bottom + 4, 'chat');
    }
    const a = e.target.closest('#rmlog a[href], #rmsay a[href]');
    if (a) { e.preventDefault(); openExternal(a.href, { s: null }); return; }   // the system's browser: never a chat's pane
    const act = e.target.closest('[data-rm]')?.dataset.rm, b = e.target.closest('[data-rm]'); if (!act) return;
    const login = b.closest('.rmp')?.dataset.login, id = Number(b.closest('.rmmsg')?.dataset.id);
    if (act === 'unsure') { chatUi.sure = null; chatDraw(); }
    else if (act === 'vote') chatVote(id, b.dataset.r);
    else if (act === 'retry' || act === 'edit') chatRetry(Number(b.closest('.rmmsg')?.dataset.out), act === 'edit');
    else if (act === 'del') { b.closest('.rmmsg').classList.add('going'); chatAct('delete', { id }, b, () => { chatTake([], [id]); chatDraw(); }); }
    else if (act === 'leave') chatAct('leave', {}, b, d => { state.chat = d; $('#room').close(); chatChanged(); });
    else if (act === 'invite') chatAct('invite', { login }, b, d => { chatUi.people = d; $('#rmfind').value = ''; chatDraw(); note($('#rmfind'), d.invited ? `Invited ${d.login} — they join from their board, or GitHub's email` : `${d.login} is in already`); });
    else if (act === 'cancel') chatAct('cancel', { id: Number(b.dataset.id) }, b, d => { chatUi.people = d; chatDraw(); });
    else if (act === 'sureRemove') { chatUi.sure = `remove:${login}`; chatDraw(); }
    else if (act === 'remove') chatAct('remove', { login }, b, d => { chatUi.people = d; chatUi.sure = null; chatDraw(); });
  });
  $('#rmbox').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); chatSend(); } });
  $('#rmbox').addEventListener('input', chatGrow);
  $('#rmfind').addEventListener('input', () => chatPeopleDraw());
  $('#rmfind').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('#rmplist').querySelector('[data-rm="invite"]')?.click(); } });
  /** Esc in the panel lets go of one thing at a time — a question, the people — before the panel. */
  function chatEscape() {
    if (chatUi.sure) { chatUi.sure = null; chatDraw(); return true; }
    if (chatUi.poll && chatUi.view === 'log') { chatPollForm(false); return true; }
    if (chatUi.view === 'people') { chatUi.view = 'log'; chatDraw(true); $('#rmbox').focus(); return true; }
    return false;
  }
  $('#room').addEventListener('close', () => { clearInterval(chatUi.watch); chatUi.watch = 0; chatUi.sure = null; renderBar(); });
  for (const ev of ['focus', 'visibilitychange']) window.addEventListener(ev, chatSeenNow);
  /** What the server knows changed: the bar, the panel, Settings' pane. */
  function chatChanged() {
    if (state.chat.repo !== chatUi.repo) { Object.assign(chatUi, { repo: state.chat.repo, n: null, msgs: [], gone: new Set(), people: null, view: 'log', sure: null, poll: null, out: [] }); chatPollDraw(); }   // another repo: nothing of the last one's
    renderBar(); renderChatSet();
    if (state.chat.missing && !chatUi.places && $('#settings').open) chatPlacesLoad();
    if (!$('#room').open) return;
    if (!state.chat.on || state.chat.missing) return $('#room').close();
    if (state.chat.ready && state.chat.room !== chatUi.n) chatLoad();
    chatDraw(); chatSeenNow();
  }
  function chatMsgs(d) {
    if (d.n !== chatUi.n) return;
    // a new one of yours takes the place of the first on its way with its words (chatSend): the stream can bring it
    // before the send's own answer
    const me = state.chat.me?.login, held = new Set(chatUi.msgs.map(m => m.id));
    for (const m of d.add || []) {
      const o = !held.has(m.id) && m.who === me && chatUi.out.find(x => !x.err && x.n === m.n && x.body.replace(/\r\n?/g, '\n').trim() === String(m.body ?? '').trim());
      if (o) chatUi.out = chatUi.out.filter(x => x !== o);
    }
    chatTake(d.add || [], d.gone || []); chatDraw(); chatSeenNow();
  }
  /** A message from someone else, while the room is not in front of you: a chime in front, else the app's banner or the
   *  browser's — never with a Reply… (no session), and a click opens the room. */
  function chatAlert(a) {
    if ($('#room').open && chatUi.view === 'log' && document.visibilityState === 'visible' && document.hasFocus()) return;
    if (document.visibilityState === 'visible' && document.hasFocus()) chime('reply');
    if (inApp) post({ type: 'alert', kind: 'chat', heading: a.heading || 'Chat', project: '', title: a.title || '', snippet: a.snippet || '', sessionId: '', hash: '', serverNotify: !!state.serverNotify, quiet: !!a.quiet, drawer: false });
    if (a.quiet || !('Notification' in window) || Notification.permission !== 'granted') return;
    const n = new Notification(a.heading || 'Chat', { body: `${a.title}\n${a.snippet || ''}`, tag: 'chat' });
    n.onclick = () => { window.focus(); chatOpen(); n.close(); };
  }
  // Settings › Chat: off — the invitations waiting, the chats you can read already, a new one (its box filled with the
  // newest organization you own, 2026-10-18), a repo by name; the same under a setup's repo GitHub does not show you
  // (`missing`), with Forget it; on — the repo, who you are in it, the people (the admin's), and leaving. What is typed
  // is chatUi's, so a redraw keeps it.
  function chatSetHtml() {
    const c = state.chat, text = 'type="text" spellcheck="false" autocomplete="off"';
    const group = (title, kw, rows, foot) => `<section class="sgrp" data-kw="${kw}">${title ? `<h6 class="sgh">${title}</h6>` : ''}<div class="slist">${rows}</div>${foot ? `<p class="sgf">${foot}</p>` : ''}</section>`;
    const row = (b, small, ctl) => `<div class="srow set"><span class="sl"><b>${b}</b><small>${small}</small></span>${ctl}</div>`;
    const invites = (c.invites || []).map(i => row(`${chatFace(i.face)} ${esc(i.by || 'Someone')} invited you`, `to the chat in ${esc(i.repo)}${i.expired ? ' — expired: ask for another' : ''}`, `<button type="button" class="btn" data-chat="join" data-id="${i.id}"${i.expired ? ' disabled' : ''}>Join</button>`)).join('');
    if (!c.on || c.missing) {
      const p = chatUi.places, owner = p ? p.orgs[0]?.login || p.me.login : null, others = p ? p.orgs.slice(1).map(o => o.login) : [];
      let name = 'chat'; for (let i = 2; p?.chats.some(x => x.repo.toLowerCase() === `${owner}/${name}`.toLowerCase()); i++) name = `chat-${i}`;
      const where = chatUi.placesErr ? `<span class="serr">${esc(chatUi.placesErr)}</span>` : !p ? 'A private repo, in an organization you own or your account'
        : p.orgs.length ? `A private repo in ${esc(owner)}, ${others.length ? `the newest organization you own (or ${esc(others.join(', '))})` : 'the organization you own'} — then invite people from the chat`
        : 'A private repo in your account — in an organization of yours, people could join with Read alone';
      const found = (p?.chats || []).map(x => row(esc(x.repo), x.admin ? 'A chat you made — you are its admin' : 'A chat you are in', `<button type="button" class="btn" data-chat="use" data-repo="${esc(x.repo)}">Use</button>`)).join('');
      const gone = c.missing ? group('', 'chat repo github', row(esc(c.repo), `<span class="serr">${esc(c.error || 'not a repo you can read')}</span>`, '<button type="button" class="btn" data-chat="leave">Forget it</button>')) : '';
      return gone + (invites ? group('Invitations', 'chat invitation join invite', invites) : '')
        + (found ? group('Your chats', 'chat repo github use', found) : '')
        + group(invites || found || gone ? 'Or' : '', 'chat repo github room make new join use',
          row('A new chat', where, `<span class="schat"><input ${text} class="schatnew" value="${esc(chatUi.newRepo ?? (owner ? `${owner}/${name}` : ''))}" placeholder="your-org/chat" aria-label="The new chat's repo"><button type="button" class="btn" data-chat="make">Make it</button></span>`)
          + row(found ? 'Another chat you are in' : 'A chat you are in', 'Its repo, owner/name — one GitHub lets you read', `<span class="schat"><input ${text} class="schatrepo" value="${esc(chatUi.useRepo ?? '')}" placeholder="acme-chat/room" aria-label="The chat's repo"><button type="button" class="btn" data-chat="use">Use</button></span>`),
          `${c.missing ? 'Off until the repo can be read.' : 'Off until a repo is set.'} A private GitHub repo is the chat: its issues labelled <code>room</code> the rooms, their comments the messages — read with your <code>gh</code> login. Only its admin invites and removes people.`);
    }
    const admin = c.role === 'admin', member = !!c.role && !admin, state_ = c.error ? `<span class="serr">${esc(c.error)}</span>` : !c.ready ? 'Reading it…' : `${admin ? 'You are its admin' : 'You are a member'}${c.me ? ` · as ${esc(c.me.login)}` : ''}${c.room == null ? ' · no chat in it yet' : ''}`;
    return group('', 'chat repo github room people invite leave',
      row(esc(c.repo), state_, '<button type="button" class="btn" data-chat="open">Open</button>')
      + (admin ? row('People', 'Invite, cancel an invitation, remove — only you can', '<button type="button" class="btn" data-chat="people">Manage…</button>') : '')
      + `<div class="srow set"><span class="sl"><b>${!member ? 'Stop the chat here' : 'Leave the chat'}</b><small>${!member ? 'The repo and its rooms stay on GitHub' : 'You leave the repo'}</small></span><button type="button" class="btn danger" data-chat="sure" aria-expanded="${chatUi.setSure}" aria-controls="chatSure">${!member ? 'Stop…' : 'Leave…'}</button>`
      + `<div class="ssure" id="chatSure" role="group" aria-labelledby="chatSureSay"${chatUi.setSure ? '' : ' hidden'}><span id="chatSureSay">${!member ? 'The chat goes from this board; the repo, its rooms and its people stay on GitHub.' : 'You leave the repo and its history; coming back takes a new invitation.'}</span><button type="button" class="btn" data-chat="unsure">Cancel</button><button type="button" class="btn danger" data-chat="leave">${!member ? 'Stop the chat' : 'Leave the chat'}</button></div></div>`,
      'Messages are the repo’s issue comments, on GitHub; GitHub’s own emails about it are turned off for you.');
  }
  function renderChatSet(force = false) { drawSetup($('#chatSet'), chatSetHtml(), force); }
  /** Settings › Chat in front: the invitations asked now, not in ten minutes — and with no chat, where one could be. */
  function loadChatSet() { api('GET', '/api/chat?invites=1').then(d => { state.chat = d; chatChanged(); if (!d.on || d.missing) chatPlacesLoad(); }, () => {}); }
  function chatPlacesLoad() {
    if (chatUi.placesAsk) return;
    chatUi.placesAsk = true;
    api('GET', '/api/chat/places').then(d => { chatUi.places = d; chatUi.placesErr = null; }, e => { chatUi.placesErr = e.message; })
      .finally(() => { chatUi.placesAsk = false; renderChatSet(); });
  }
  $('#chatSet').addEventListener('input', e => { if (e.target.matches('.schatnew')) chatUi.newRepo = e.target.value; else if (e.target.matches('.schatrepo')) chatUi.useRepo = e.target.value; });
  $('#chatSet').addEventListener('focusout', e => { if ($('#chatSet')._stale && !$('#chatSet').contains(e.relatedTarget)) renderChatSet(); });
  $('#chatSet').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('.schatrepo, .schatnew')) { e.preventDefault(); e.target.nextElementSibling.click(); } });
  $('#chatSet').addEventListener('click', e => {
    const b = e.target.closest('[data-chat]'); if (!b) return;
    const set = d => { state.chat = d; chatChanged(); };
    const act = b.dataset.chat, box = b.previousElementSibling;
    if (act === 'open') { settingsOpen(false); chatOpen(); }
    else if (act === 'people') { settingsOpen(false); chatOpen('people'); }
    else if (act === 'join') { b.disabled = true; api('POST', '/api/chat/join', { id: Number(b.dataset.id) }).then(d => { set(d); note($('#chatSet'), 'Joined — the chat is in the status bar'); }, err => { b.disabled = false; note(b, err.message, true); }); }
    else if (act === 'use') { const repo = b.dataset.repo || box.value.trim(); if (repo) api('POST', '/api/chat/use', { repo }).then(d => { chatUi.useRepo = null; set(d); }, err => note(b.dataset.repo ? b : box, err.message, true)); }
    else if (act === 'make') { const repo = box.value.trim(); if (!repo) return; b.disabled = true; b.textContent = 'Making it…'; api('POST', '/api/chat/make', { repo }).then(d => { chatUi.newRepo = chatUi.places = null; set(d); note($('#chatSet'), `Made ${d.repo} — invite people from the chat`); }, err => { b.disabled = false; b.textContent = 'Make it'; note(b, err.message, true); }); }
    else if (act === 'sure' || act === 'unsure') { chatUi.setSure = act === 'sure'; renderChatSet(true); $('#chatSet').querySelector(act === 'sure' ? '#chatSure .btn' : '[data-chat="sure"]')?.focus(); }
    else if (act === 'leave') api('POST', '/api/chat/leave', {}).then(d => { chatUi.setSure = false; chatUi.places = null; set(d); chatPlacesLoad(); }, err => note(b, err.message, true));
  });

