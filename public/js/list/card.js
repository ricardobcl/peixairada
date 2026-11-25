/** The card's Jira tickets (2026-10-08): chips in their status category's colour, the first — the branch's, else the
 *  last one named — on top; a stack as the PRs are since 2026-10-11 (a chip and a count before). */
const ticketTip = t =>
  `${t.key} — ${t.summary}\n${t.status}${t.type ? ` · ${t.type}` : ''}${t.assignee ? ` · ${t.assignee.me ? 'yours' : t.assignee.name}` : ' · unassigned'}${t.branch ? "\nthe chat's branch" : ''}`;
function cardTickets(s) {
  const t = s.tickets || [];
  if (!t.length) return '';
  return chipStack(
    t,
    (k, style) =>
      `<a class="ctk"${style} data-cat="${esc(k.cat)}" data-url="${esc(k.url)}" title="${esc(ticketTip(k))}">${esc(k.key)}</a>`,
    ' ttks',
  );
}
function cardHtml(s, q = '', slot = null) {
  // `slot`: its place among the pinned, when drawn there (2026-11-24)
  const color = repoColor(s.cwd),
    un = state.unread.get(s.id) || 0;
  const showReply = s.lastReply && s.status !== 'working';
  // Which of the two words is the older, for the cog's *medium* cards: Claude's reply is the last word once it came
  // after your last touch — a prompt, an answer, an Escape; before that it is the previous turn's, and yours leads.
  const replyLast = showReply && String(s.lastReplyAt || '') >= String(s.lastUserAt || '');
  const older = who => (s.lastPrompt && showReply && (who === 'you') === replyLast ? ' older' : '');
  // ⌥-click on any card's button deletes it from the board (2026-11-04, removeChat): a chat at work has no ✓, and only ⌥
  // brings its ✕, which asks once more for what it would end. A watching chat's ✓ says what Done would end, once armed by a
  // first click (tickGate, 2026-10-31)
  const ends = !s.done && canTick(s) ? watchEnds(s) : '',
    armed = ends && armedOn(s.id),
    delEnds = delArmedOn(s.id) && removeEnds(s);
  const act = delEnds
    ? `<button class="act armed del" data-act="del" title="${esc(`Deleting it ends ${delEnds}. Click again to delete it from the board`)}">${ICON.forget}<span class="aw">ends ${esc(delEnds)}</span></button>`
    : s.done
      ? `<button class="act" data-act="reopen" title="${s.forGood ? 'Done for good — its PRs no longer bring it back. Untick to bring it back' : 'Untick — bring it back'}. ${DEL_TIP}"><span class="tk rv">↩</span>${ICON.forget}</button>`
      : armed
        ? `<button class="act armed" data-act="done" title="${esc(`Done ends its watch — ${ends}. Click ✓ again to tick it done`)}">${ICON.tick}${ICON.forget}<span class="aw">ends ${esc(ends)}</span></button>`
        : canTick(s)
          ? `<button class="act" data-act="done" title="${ends ? esc(`Tick as done — it ends its watch: ${ends}, so it asks once more`) : s.prs?.length ? 'Tick as done — it comes back on new activity, or when one of its PRs comes round to you' : 'Tick as done (persisted; comes back on new activity)'}. ${DEL_TIP}">${ICON.tick}${ICON.forget}</button>`
          : `<button class="act del" data-act="del" title="${DEL_TIP}">${ICON.forget}</button>`;
  // The ✓ / ↩ and the PR chips end the top row — the project name's height; the F for Fable (2026-09-27) and the
  // age stand beside the title since 2026-09-28, where there is more room.
  const fable = onFable(s)
    ? `<span class="fable" title="on Fable — ${esc(s.model)}, the model Claude last answered with">${ICON.fable}</span>`
    : '';
  // Where it runs, when that is news: a drawer here is the norm and says nothing (2026-09-23); a CLI elsewhere — a
  // terminal's mark since 2026-10-12, its tooltip saying where and that ⌥⌘C takes it over; *CLI* before —, VS
  // Code running it too, still do. VS Code's own chat wore its logo here until 2026-09-28 — the chat header's ···
  // still says it (*VS Code's chat*).
  const where =
    !s.alive || inVsCode(s)
      ? ''
      : (s.terminal && s.terminal.exited === null
          ? ''
          : `<span class="chip elsewhere" title="${attachable(s) ? 'Running in the background — ⌥⌘C opens it here' : `${s.live?.entrypoint === 'cli' ? 'Running in a terminal outside the board' : 'Running outside the board'} — ⌥⌘C takes it over here`}">${ICON.term}</span>`) +
        (hasRival(s)
          ? rivalsIn(s, 'vs')
            ? `<span class="chip vsc" title="VS Code runs Claude on this chat too — open it to end it">VS Code too</span>`
            : `<span class="chip rival" title="Another claude runs on this chat too — open it to end it">a second claude</span>`
          : '');
  const moveLine = moveHtml(s) || answeredHtml(s);
  // Top priority and snooze (2026-11-24, round XXX): its number in the section (T3), ticked there it stays dimmed (D2);
  // snoozed, when it wakes (W1); back from one, till opened (H2); and the two marks under the pointer, card parts (A5, S5)
  const inSec = slot != null,
    slept = asleep(s);
  const pn = inSec ? `<span class="pn" title="${esc(`${ordinal(slot + 1)} pinned`)}">${slot + 1}</span>` : '';
  const zz =
    (slept
      ? `<span class="snz" title="${esc(`Snoozed ${snoozeSay(s.snooze)} — a question from it or a word of yours wakes it sooner`)}">${ICON.moon}<span>${esc(snoozeSay(s.snooze))}</span></span>`
      : '') +
    (back(s)
      ? `<span class="lback" title="${esc(`Back from a snooze${s.wokeWhy ? `: ${s.wokeWhy}` : ''} — till you open it`)}">back</span>`
      : '');
  const marks =
    (prioOn()
      ? `<button type="button" class="ax pin${inPrio(s) ? ' on' : ''}" title="${inPrio(s) ? 'Unpin it' : 'Pin it — the section up top, in your order'} · ⌥⌘I">${ICON.prio}</button>`
      : '') +
    (asking(s)
      ? ''
      : `<button type="button" class="ax zz${slept ? ' on' : ''}" title="${slept ? 'Wake it now' : 'Snooze it… · ⌥⌘S'}">${ICON.moon}</button>`);
  return `<div class="card ${s.status} ${roomy(s) ? 'roomy' : ''} ${watching(s) ? 'watching' : ''} ${asking(s) ? 'asking' : ''} ${moveLine ? 'rowmove' : ''} ${s.done ? `done${s.forGood ? ' forgood' : ''}` : !s.alive ? 'gone' : ''} ${s.id === state.current ? 'active' : ''} ${color === BLACK ? 'black' : ''}${inSec ? ` inprio${s.done ? ' pdone' : ''}` : ''}${slept ? ' slept' : ''}" data-id="${esc(s.id)}" data-rank="${rankOf(s)}" style="${repoStyle(color)}">
      <div class="top"><span class="vh">${inSec ? `Pinned, ${slot + 1}: ` : ''}${esc(LANES[rankOf(s)]?.[0] || '')}${watching(s) && rankOf(s) !== 'watching' ? ', watching' : ''}${stoppedSaid(s) ? `, stopped: ${esc(stoppedSaid(s))}` : ''} — </span><span class="repo" title="${esc(s.cwd || '')}">${projIcon(s.project)}${markHits(s.project, q)}</span>${agentTag(s, 'chip runas')}${muteChip(s)}${s.env ? `<span class="chip env" title="started with \`task ${esc(s.env)}\` in ${esc(s.cwd || 'its folder')} — ⌥⌘O lists this chat under it">${esc(s.env)}</span>` : ''}${s.worktree ? `<span class="chip wtb" title="${esc(`in the worktree ${s.worktree.name} of ${s.project}${s.worktree.branch ? `, on ${s.worktree.branch}` : ''}`)}">${ICON.branch}${esc(s.worktree.branch || s.worktree.name)}</span>` : ''}${linkChip(s)}${peerMark(s)}<span class="grow"></span>${where}${marks}${act}${cardTickets(s)}${cardMatrix(s)}</div>
      <div class="trow">${pn}<div class="title">${ticks(markHits(s.title, q))}</div>${zz}${agOn(s) ? '<button type="button" class="chip agents" hidden></button>' : ''}${taskChip(s)}${driftMark(s)}${s.lastActivity || s.startedAt ? '<span class="time"></span>' : ''}${fable}${un ? `<span class="badge" aria-label="${un} unread">${rn('un:' + s.id, un)}</span>` : ''}</div>
      ${liveSlot(s)}${agOn(s) ? '<div class="agl" hidden></div>' : ''}
      ${s.lastPrompt ? `<div class="snip you${older('you')}"><b title="You">${ICON.you}</b>${ticks(esc(s.lastPrompt))}</div>` : ''}
      ${showReply ? `<div class="snip claude${older('claude')}"><b title="Claude">${ICON.claude}</b>${ticks(esc(s.lastReply))}</div>` : ''}
      ${stopHtml(s)}${asking(s) ? askHtml(s) : ''}${moveLine || MOVE_SLOT}${pipsHtml(s)}<i class="rg" aria-hidden="true"></i>
    </div>`;
}
// The card's live line (2026-10-11): what is happening now, filled after the render (fillLive) — never in the markup,
// so a new event or a new tool call keeps the card's node, and the ring on it. A turn at work: the tool it called last
// and what for (the server's `doing`), flipping to the next like a split-flap board. Else a monitor's: its newest
// event, rolled in, the watching light blipping once per event.
// A wake-up is the line's when nothing else says more — no tool at work, no event — and then at every card size, as
// the reason the chat is Watching (2026-10-31, round XIII): `wakes at 14:30 · in 52 min`.
const wakeSaid = s => !!s.wake && !(s.status === 'working' && s.doing) && !(s.tasks || []).some(t => t.last);
const liveSlot = s =>
  s.alive && !s.done && (s.status === 'working' || watching(s) || s.wake)
    ? `<div class="state live${wakeSaid(s) ? ' wake' : ''}${agWhoOn(s) && !(agEven() && (moveHtml(s) || answeredHtml(s))) ? ' agwho' : ''}"></div>`
    : ''; // same height: folded, a move keeps the card's one line
