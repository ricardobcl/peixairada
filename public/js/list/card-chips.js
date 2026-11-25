/** The chat header's: the tag, then the newest move's PR and reason, the others counted — right of the title. */
function headMove(s) {
  const prs = movedPrs(s);
  if (!prs.length) return '';
  return `<span class="hmove" title="${esc(moveTip(prs))}"><b class="ymove">${ICON.pr}your move</b><span class="q">${esc(prs[0].label)} · ${esc(prs[0].turn.why)}</span>${prs.length > 1 ? `<span class="n">+${prs.length - 1}</span>` : ''}</span>`;
}
/** The branch moved under the chat (2026-10-13; the server's `drift`): the header's chip says what its checkout is on
 *  now and what the chat was on, its tooltip who else runs in that checkout; the card wears a red branch beside its
 *  title — the move alone in its markup, so the others coming and going rebuild no card. A click on the chip says you
 *  know, until the branch moves again. */
function driftTip(s) {
  const d = s.drift,
    peers = (d.peers || []).map(id => state.sessions.get(id)).filter(Boolean);
  return (
    `${d.to} is checked out in ${s.project} now — this chat was on ${d.from}.\n` +
    (peers.length
      ? `Also running in this checkout: ${peers.map(p => `${p.title}${p.status === 'working' ? ' (clauding)' : ''}`).join(' · ')}`
      : 'No other chat on the board runs in this checkout.') +
    '\nClick once you know — it shows again when the branch moves again.'
  );
}
const driftChip = s =>
  s.drift
    ? `<button class="hdrift" id="driftBtn" title="${esc(driftTip(s))}"><span class="vh">The branch moved under this chat: </span>${ICON.branch}<span class="n"><b>${esc(s.drift.to)}</b> now</span><span class="q">· was ${esc(s.drift.from)}</span></button>`
    : '';
const muteChip = s =>
  s.muted
    ? `<button type="button" class="chip cmute" title="Muted: no banner, sound or count from this chat, questions too. It still shows here. Click to unmute">${ICON.bellOff}muted</button>`
    : ''; // 2026-11-02
const driftMark = s =>
  s.drift
    ? `<span class="drift" title="${esc(`The branch moved under it: ${s.drift.to} now, was ${s.drift.from}`)}">${ICON.branch}<span class="vh">, its branch moved</span></span>`
    : '';
/** Another chat messaged this one (2026-10-31): ← from <that chat>, while one waits for its turn to end, or for
 *  PEER_MARK_MS after one came and before your next word in it; a click opens the chat that sent it. */
const PEER_MARK_MS = 60 * 60_000;
const peerWho = (id, name) => state.sessions.get(id)?.title || name || 'another chat'; // the chat by its title, else the name it sent under
function peerMark(s) {
  const p = s.peerIn;
  if (!p || !(p.queued || (Date.now() - Date.parse(p.at) < PEER_MARK_MS && String(p.at) > String(s.lastUserAt || ''))))
    return '';
  const who = peerWho(p.id, p.name);
  return `<span class="chip peerin"${p.id ? ` data-sid="${esc(p.id)}"` : ''} title="${esc(`${p.queued ? 'A message waiting for this chat, from' : 'A message came from'} ${who}${p.mode ? ` (${p.mode})` : ''}${p.id ? ' — click: open that chat' : ''}`)}"><span class="vh">, a message </span><span aria-hidden="true">←</span><span class="pn">from ${esc(who)}</span>${p.queued ? '<span class="vh">, queued</span>' : ''}</span>`;
}
/** The card's PR chips, last in its top row — the F's place, the F left of them (2026-09-28) —: every PR the chat
 *  mentions, a stack since 2026-10-04 (the CSS). The top one and the three slivers under it are the first four in the
 *  chat's order, every one at your move among them, and the rest follow in that order under the third; the pointer
 *  on the stack fans them all out. `--i` is a chip's place in the fan, `--d` its depth in the stack, `--under` the
 *  slivers, `--span` how many chips' width each sliver's column is fanned. */
const STACK_SLIVERS = 3;
/** A stack of the card's chips — its PRs, and since 2026-10-11 its Jira tickets, each a stack of its own: the first
 *  on top, the others under it, `chip(item, style)` drawing one. */
function chipStack(items, chip, cls = '') {
  const under = Math.min(items.length - 1, STACK_SLIVERS);
  return `<span class="tprs${cls}"${under ? ` style="--under:${under};--span:${+((items.length - 1) / under).toFixed(3)}fr"` : ''}>${items.map((x, i) => chip(x, i ? ` style="--i:${i};--d:${Math.min(i, under)}"` : '')).join('')}</span>`;
}
/** A person's GitHub face — their avatar, or their initial when GitHub gave none. */
const faceHtml = (p, tip = '', attrs = '') =>
  p.avatar
    ? `<img src="${esc(p.avatar)}" alt="${esc(p.login)}"${tip ? ` title="${esc(tip)}"` : ''}${attrs} loading="lazy" decoding="async" referrerpolicy="no-referrer">`
    : `<span class="face"${tip ? ` title="${esc(tip)}"` : ''}${attrs}>${esc(p.login[0])}</span>`;
