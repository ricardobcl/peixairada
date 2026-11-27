/** The card's Jira tickets (2026-10-08): chips in their status category's colour, the first — the branch's, else the
 *  last one named — on top; a stack as the PRs are since 2026-10-11 (a chip and a count before). */
const ticketTip = ticket =>
  `${ticket.key} — ${ticket.summary}\n${ticket.status}${ticket.type ? ` · ${ticket.type}` : ''}${ticket.assignee ? ` · ${ticket.assignee.me ? 'yours' : ticket.assignee.name}` : ' · unassigned'}${ticket.branch ? "\nthe chat's branch" : ''}`;

function cardTickets(session) {
  const tickets = session.tickets || [];

  if (!tickets.length) return '';
  return chipStack(
    tickets,
    (ticket, style) =>
      `<a class="ctk"${style} data-cat="${esc(ticket.cat)}" data-url="${esc(ticket.url)}" title="${esc(ticketTip(ticket))}">${esc(ticket.key)}</a>`,
    ' ttks',
  );
}

function cardHtml(session, query = '', slot = null) {
  // `slot`: its place among the pinned, when drawn there (2026-11-24)
  const color = repoColor(session.cwd);
  const un = state.unread.get(session.id) || 0;

  const showReply = session.lastReply && session.status !== 'working';
  // Which of the two words is the older, for the cog's *medium* cards: Claude's reply is the last word once it came
  // after your last touch — a prompt, an answer, an Escape; before that it is the previous turn's, and yours leads.
  const replyLast = showReply && String(session.lastReplyAt || '') >= String(session.lastUserAt || '');
  const older = who => (session.lastPrompt && showReply && (who === 'you') === replyLast ? ' older' : '');

  // ⌥-click on any card's button deletes it from the board (2026-11-04, removeChat): a chat at work has no ✓, and only ⌥
  // brings its ✕, which asks once more for what it would end. A watching chat's ✓ says what Done would end, once armed by a
  // first click (tickGate, 2026-10-31)
  const ends = !session.done && canTick(session) ? watchEnds(session) : '';
  const armed = ends && armedOn(session.id);
  const delEnds = delArmedOn(session.id) && removeEnds(session);

  const act = delEnds
    ? `<button class="act armed del" data-act="del" title="${esc(`Deleting it ends ${delEnds}. Click again to delete it from the board`)}">${ICON.forget}<span class="aw">ends ${esc(delEnds)}</span></button>`
    : session.done
      ? `<button class="act" data-act="reopen" title="${session.forGood ? 'Done for good — its PRs no longer bring it back. Untick to bring it back' : 'Untick — bring it back'}. ${DEL_TIP}"><span class="tk rv">↩</span>${ICON.forget}</button>`
      : armed
        ? `<button class="act armed" data-act="done" title="${esc(`Done ends its watch — ${ends}. Click ✓ again to tick it done`)}">${ICON.tick}${ICON.forget}<span class="aw">ends ${esc(ends)}</span></button>`
        : canTick(session)
          ? `<button class="act" data-act="done" title="${ends ? esc(`Tick as done — it ends its watch: ${ends}, so it asks once more`) : session.prs?.length ? 'Tick as done — it comes back on new activity, or when one of its PRs comes round to you' : 'Tick as done (persisted; comes back on new activity)'}. ${DEL_TIP}">${ICON.tick}${ICON.forget}</button>`
          : `<button class="act del" data-act="del" title="${DEL_TIP}">${ICON.forget}</button>`;

  // The ✓ / ↩ and the PR chips end the top row — the project name's height; the F for Fable (2026-09-27) and the
  // age stand beside the title since 2026-09-28, where there is more room.
  const fable = onFable(session)
    ? `<span class="fable" title="on Fable — ${esc(session.model)}, the model Claude last answered with">${ICON.fable}</span>`
    : '';

  // Where it runs, when that is news: a drawer here is the norm and says nothing (2026-09-23); a CLI elsewhere — a
  // terminal's mark since 2026-10-12, its tooltip saying where and that ⌥⌘C takes it over; *CLI* before —, VS
  // Code running it too, still do. VS Code's own chat wore its logo here until 2026-09-28 — the chat header's ···
  // still says it (*VS Code's chat*).
  const where =
    !session.alive || inVsCode(session)
      ? ''
      : (session.terminal && session.terminal.exited === null
          ? ''
          : `<span class="chip elsewhere" title="${attachable(session) ? 'Running in the background — ⌥⌘C opens it here' : `${session.live?.entrypoint === 'cli' ? 'Running in a terminal outside the board' : 'Running outside the board'} — ⌥⌘C takes it over here`}">${ICON.term}</span>`) +
        (hasRival(session)
          ? rivalsIn(session, 'vs')
            ? `<span class="chip vsc" title="VS Code runs Claude on this chat too — open it to end it">VS Code too</span>`
            : `<span class="chip rival" title="Another claude runs on this chat too — open it to end it">a second claude</span>`
          : '');

  const moveLine = moveHtml(session) || answeredHtml(session);

  // Top priority and snooze (2026-11-24, round XXX): its number in the section (T3), ticked there it stays dimmed (D2);
  // snoozed, when it wakes (W1); back from one, till opened (H2); and the two marks under the pointer, card parts (A5, S5)
  const inSec = slot != null;
  const slept = asleep(session);

  const pn = inSec ? `<span class="pn" title="${esc(`${ordinal(slot + 1)} pinned`)}">${slot + 1}</span>` : '';

  const zz =
    (slept
      ? `<span class="snz" title="${esc(`Snoozed ${snoozeSay(session.snooze)} — a question from it or a word of yours wakes it sooner`)}">${ICON.moon}<span>${esc(snoozeSay(session.snooze))}</span></span>`
      : '') +
    (back(session)
      ? `<span class="lback" title="${esc(`Back from a snooze${session.wokeWhy ? `: ${session.wokeWhy}` : ''} — till you open it`)}">back</span>`
      : '');

  const marks =
    (prioOn()
      ? `<button type="button" class="ax pin${inPrio(session) ? ' on' : ''}" title="${inPrio(session) ? 'Unpin it' : 'Pin it — the section up top, in your order'} · ⌥⌘I">${ICON.prio}</button>`
      : '') +
    (asking(session)
      ? ''
      : `<button type="button" class="ax zz${slept ? ' on' : ''}" title="${slept ? 'Wake it now' : 'Snooze it… · ⌥⌘S'}">${ICON.moon}</button>`);

  return `<div class="card ${session.status} ${roomy(session) ? 'roomy' : ''} ${watching(session) ? 'watching' : ''} ${asking(session) ? 'asking' : ''} ${moveLine ? 'rowmove' : ''} ${session.done ? `done${session.forGood ? ' forgood' : ''}` : !session.alive ? 'gone' : ''} ${session.id === state.current ? 'active' : ''} ${color === BLACK ? 'black' : ''}${inSec ? ` inprio${session.done ? ' pdone' : ''}` : ''}${slept ? ' slept' : ''}" data-id="${esc(session.id)}" data-rank="${rankOf(session)}" style="${repoStyle(color)}">
      <div class="top"><span class="vh">${inSec ? `Pinned, ${slot + 1}: ` : ''}${esc(LANES[rankOf(session)]?.[0] || '')}${watching(session) && rankOf(session) !== 'watching' ? ', watching' : ''}${stoppedSaid(session) ? `, stopped: ${esc(stoppedSaid(session))}` : ''} — </span><span class="repo" title="${esc(session.cwd || '')}">${projIcon(session.project)}${markHits(session.project, query)}</span>${session.status === 'working' ? '<i class="wkarc" aria-hidden="true"></i>' : ''}${agentTag(session, 'chip runas')}${muteChip(session)}${session.env ? `<span class="chip env" title="started with \`task ${esc(session.env)}\` in ${esc(session.cwd || 'its folder')} — ⌥⌘O lists this chat under it">${esc(session.env)}</span>` : ''}${session.worktree ? `<span class="chip wtb" title="${esc(`in the worktree ${session.worktree.name} of ${session.project}${session.worktree.branch ? `, on ${session.worktree.branch}` : ''}`)}">${ICON.branch}${esc(session.worktree.branch || session.worktree.name)}</span>` : ''}${linkChip(session)}${peerMark(session)}<span class="grow"></span>${where}${marks}${act}${cardTickets(session)}${cardMatrix(session)}</div>
      <div class="trow">${pn}<div class="title">${ticks(markHits(session.title, query))}</div>${zz}${agOn(session) ? '<button type="button" class="chip agents" hidden></button>' : ''}${taskChip(session)}${driftMark(session)}${session.lastActivity || session.startedAt ? '<span class="time"></span>' : ''}${fable}${un ? `<span class="badge" aria-label="${un} unread">${rn(`un:${session.id}`, un)}</span>` : ''}</div>
      ${liveSlot(session)}${agOn(session) ? '<div class="agl" hidden></div>' : ''}
      ${session.lastPrompt ? `<div class="snip you${older('you')}"><b title="You">${ICON.you}</b>${ticks(esc(session.lastPrompt))}</div>` : ''}
      ${showReply ? `<div class="snip claude${older('claude')}"><b title="Claude">${ICON.claude}</b>${ticks(esc(session.lastReply))}</div>` : ''}
      ${stopHtml(session)}${asking(session) ? askHtml(session) : ''}${moveLine || MOVE_SLOT}${pipsHtml(session)}<i class="rg" aria-hidden="true"></i>
    </div>`;
}

// The card's live line (2026-10-11): what is happening now, filled after the render (fillLive) — never in the markup,
// so a new event or a new tool call keeps the card's node, and the ring on it. A turn at work: the tool it called last
// and what for (the server's `doing`), flipping to the next like a split-flap board. Else a monitor's: its newest
// event, rolled in, the watching light blipping once per event.
// A wake-up is the line's when nothing else says more — no tool at work, no event — and then at every card size, as
// the reason the chat is Watching (2026-10-31, round XIII): `wakes at 14:30 · in 52 min`.
const wakeSaid = session =>
  !!session.wake && !(session.status === 'working' && session.doing) && !(session.tasks || []).some(task => task.last);

const liveSlot = session =>
  session.alive && !session.done && (session.status === 'working' || watching(session) || session.wake)
    ? `<div class="state live${wakeSaid(session) ? ' wake' : ''}${agWhoOn(session) && !(agEven() && (moveHtml(session) || answeredHtml(session))) ? ' agwho' : ''}"></div>`
    : ''; // same height: folded, a move keeps the card's one line
