/** The card's PRs as a matrix (2026-11-01, round XVI's M5; the one way since 2026-11-03): a square a PR in its state's colour, in stack order — the PRs that chain base to head in
 *  one repo (GitHub's stacks, read off each PR's refs) together, base first, joined by a line; a PR on its own apart.
 *  Before them one number: the newest move's PR, in the accent, when one waits on you — else the one GitHub updated
 *  last, in ink. One size however many (2026-11-01, later); past the row's room they scroll in their box, the number
 *  put, its square brought into sight (fadeOver). Each square is a link to its PR, as a chip is (its click, its
 *  right-click menu); under the pointer it springs up and its PR's card comes (#mxtip) — no tooltip of the system's
 *  besides —, the number's the PR it names. The pointer at rest on the card shows every PR (#rpop). */
const MX_PX = { q: 9, c: 4, g: 4 }; // a square, a stack's line, the gap: the CSS's --q --c --g
const MX_PAD = 3; // the box's padding, a square's lift's room
const CK_SAID = { pass: 'checks passed', fail: 'checks failing', pending: 'checks running' };
const prRepo = pr => (pr.url || '').match(/github\.com\/([^/]+\/[^/]+)\/pull\//)?.[1] || '';
/** A PR's stack among the chat's PRs, base first: each the one whose head is the next one's base, in one repo, no fork's. */
function prChain(prs, pr) {
  const ok = p => p.refs?.head && p.refs.base && !p.refs.fork && prRepo(p) === prRepo(pr);
  if (!ok(pr)) return [pr];
  const same = prs.filter(ok),
    chain = [pr],
    seen = new Set(chain);
  for (let p = pr, q; (q = same.find(x => !seen.has(x) && x.refs.head === p.refs.base)); p = q) {
    chain.unshift(q);
    seen.add(q);
  }
  for (let p = pr, q; (q = same.find(x => !seen.has(x) && x.refs.base === p.refs.head)); p = q) {
    chain.push(q);
    seen.add(q);
  }
  return chain;
}
/** The chat's PRs in the matrix's order: by repo and number, each stack whole where its first PR comes, base first. */
function prGroups(prs) {
  const sorted = [...prs].sort((a, b) => prRepo(a).localeCompare(prRepo(b)) || (a.number || 0) - (b.number || 0)),
    placed = new Set(),
    out = [];
  for (const p of sorted) {
    if (placed.has(p)) continue;
    const g = prChain(
      sorted.filter(x => !placed.has(x)),
      p,
    );
    for (const x of g) placed.add(x);
    out.push(g);
  }
  return out;
}
/** When GitHub last updated a PR (its updatedAt), else the newest time the board knows of it — before GitHub has
 *  answered, when the chat last named it. */
const prUpdatedAt = pr =>
  pr.updated
    ? Date.parse(pr.updated) || 0
    : Math.max(
        0,
        ...[
          pr.turn?.at,
          pr.turn?.movedAt,
          pr.lastAt,
          ...(pr.people || []).map(p => p.at),
          ...(pr.rounds || []).flatMap(r => [r.from, r.end]),
        ].map(t => Date.parse(t) || 0),
      );
/** The PR the matrix numbers: the newest move's, else the one updated last (the chat's first of a tie). */
function mxLead(s) {
  const move = !s.done && movedPrs(s)[0];
  if (move) return { pr: move, you: true };
  const prs = s.prs || [];
  let pr = prs[0],
    at = pr ? prUpdatedAt(pr) : 0;
  for (const p of prs) {
    const t = prUpdatedAt(p);
    if (t > at) {
      pr = p;
      at = t;
    }
  }
  return { pr, you: false };
}
const prNum = pr => (pr.number != null ? `#${pr.number}` : pr.label);
const mxSquare = (pr, lead, cls = '', attrs = '') =>
  `<a class="mxs${pr === lead.pr ? ' lead' : ''}${cls}" data-state="${esc(pr.state || '')}" data-turn="${turnOf(pr)}" data-url="${esc(pr.url)}"${attrs}><span class="vh">${esc(prNum(pr))}${pr.title ? ` ${esc(pr.title)}` : ''}, ${esc(pr.state || 'not known yet')}${prCk(pr) ? `, ${CK_SAID[prCk(pr)]}` : ''}${pr.turn?.you ? ', your move' : ''}</span></a>`;
const mxNumber = (lead, n, ck = '') =>
  `<a class="mxn${lead.you ? ' you' : ''}" data-url="${esc(lead.pr.url)}">${esc(prNum(lead.pr))}${ck}<span class="vh">${lead.you ? ', your move' : ', updated last'} — ${n} PR${n === 1 ? '' : 's'}: </span></a>`;
function cardMatrix(s) {
  const prs = s.prs || [];
  if (!prs.length) return '';
  const groups = prGroups(prs),
    lead = mxLead(s),
    px = MX_PX;
  const wide = groups.reduce((w, g) => w + g.length * px.q + (g.length - 1) * px.c, 0) + (groups.length - 1) * px.g; // the squares' own width
  const least = Math.min(wide, 3 * px.q + 2 * px.g) + 2 * MX_PAD,
    num = prNum(lead.pr);
  return (
    `<span class="tmx" style="--nw:${Math.min(num.length, 9)}ch;--mn:${least}px">${mxNumber(lead, prs.length)}` +
    `<span class="mxg">${groups.map(g => `<span class="mxc">${g.map(pr => mxSquare(pr, lead)).join('<s></s>')}</span>`).join('')}</span></span>`
  );
}
/** The chat header's PRs (2026-11-03): the card's matrix, its squares, order and number, in as many rows as fitHeadPrs finds room for; what only
 *  the header says, each PR's CI — the number's badge, data-checks on its square — and the chat's tickets, dots after the squares. A click on
 *  a square opens its PR, its card comes under the pointer, as on a card; the git mark beside it (#prToggle) lists them. */
function headMatrix(s) {
  const prs = s.prs || [],
    tks = s.tickets || [];
  if (!prs.length && !tks.length) return '';
  const lead = prs.length ? mxLead(s) : null;
  const dots = tks
    .map(
      t =>
        `<a class="mxs tk" data-cat="${esc(t.cat)}" data-key="${esc(t.key)}" title="${esc(`${ticketTip(t)}\nClick: open it`)}"><span class="vh">${esc(t.key)}</span></a>`,
    )
    .join('');
  return `<span class="tmx">${lead ? mxNumber(lead, prs.length, ckHtml(lead.pr)) : ''}<span class="mxg">${prGroups(prs)
    .map(
      g =>
        `<span class="mxc">${g.map((pr, i) => mxSquare(pr, lead, i ? ' j' : '', prCk(pr) ? ` data-checks="${prCk(pr)}"` : '')).join('')}</span>`,
    )
    .join('')}${dots}</span></span>`;
}
/** A PR's card (2026-11-01, later; #mxtip): what a square's tooltip said, drawn — the repo and its state, the number
 *  and title, its CI and its place in a stack (the stack's squares, its own lit), whose move and why, who had a hand
 *  in it (its faces, the newest first) and when GitHub last updated it. */
const MX_STATE = { open: 'Open', draft: 'Draft', merged: 'Merged', closed: 'Closed' };
function mxCardHtml(pr, g) {
  const ck = prCk(pr),
    t = pr.turn,
    people = (pr.people || []).slice(0, 4),
    at = pr.updated || '';
  const move = t?.you
    ? `<div class="mtm you">${RTAG.you}<span>${esc(t.why)}</span></div>`
    : t?.waived
      ? `<div class="mtm">${RTAG.let}<span>${esc(t.why)}</span></div>`
      : t?.why
        ? `<div class="mtm"><span>${esc(t.why)}</span></div>`
        : '';
  const stack =
    g.length > 1
      ? `<span class="mtk"><span class="mtc">${g.map(p => `<i class="rsq${p === pr ? ' on' : ''}" data-state="${esc(p.state || '')}"></i>`).join('<s></s>')}</span>${g.indexOf(pr) + 1} of ${g.length} in a stack</span>`
      : '';
  const who = people.length
    ? `<span class="mtp">${people.map(p => faceHtml(p)).join('')}</span><span class="mtw">${esc(people.map(p => p.login).join(', '))}</span>`
    : '';
  return (
    `<div class="mth"><span class="mtr">${esc(prRepo(pr) || pr.label)}</span><span class="mts" data-state="${esc(pr.state || '')}">${esc(MX_STATE[pr.state] || 'Not heard from GitHub')}</span></div>` +
    `<div class="mtt"><b>${esc(prNum(pr))}</b>${pr.title ? esc(pr.title) : '<i>its title on its way from GitHub…</i>'}</div>` +
    (ck || stack
      ? `<div class="mtx">${ck ? `<span class="mtck" data-ck="${ck}"><i></i>${CK_SAID[ck]}</span>` : ''}${stack}</div>`
      : '') +
    move +
    (who || at
      ? `<div class="mtf">${who}${at ? `<span class="mtu">updated <span data-at="${esc(at)}"></span> ago</span>` : ''}</div>`
      : '')
  );
}
// The pointer on a square or the number (2026-11-01, later): its PR's card after MXT_IN, at once from one square to
// the next while a card is up; off them MXT_OUT, it goes. The square it is for is lifted (.hot) — the number's too.
const MX_AT = '.tmx [data-url], .card .agr[data-ag], #space .spa[data-ag], #space .spbt',
  MXT_IN = 120,
  MXT_CHAT = 450,
  MXT_OUT = 140,
  MXT_W = 290;
const mxt = { el: null, a: null, sq: null, timer: 0, out: 0 };
function mxtShow() {
  const a = mxt.a,
    c = a?.isConnected && a.closest('#slist > .card'),
    head = a?.isConnected && a.closest('#shead'),
    inSpace = a?.isConnected && a.closest('#space'); // Space's marks name their chat (2026-11-18)
  const chat = inSpace && a.matches('.spbt') ? state.sessions.get(a.closest('.spt')?.dataset.id) : null; // a node's title: its chat's card (2026-11-24)
  const s =
    chat ||
    (c
      ? state.sessions.get(c.dataset.id)
      : inSpace
        ? state.sessions.get(a.dataset.sid)
        : head && state.sessions.get(state.current));
  const ag = !chat && a?.dataset.ag && (inSpace ? spRows(s) : s?.agentRows || []).find(r => r.id === a.dataset.ag); // a row of its agents': that one's card (2026-11-02); Space's, any round's
  const pr = !ag && !chat && s?.prs?.find(p => p.url === a.dataset.url);
  if (!pr && !ag && !chat) return mxtHide();
  rpopHide();
  restOff();
  const el = (mxt.el ||= Object.assign(document.createElement('div'), { id: 'mxtip', role: 'tooltip' }));
  if (!el.isConnected) document.body.append(el);
  if (ag) agInfoSoon(s, ag, a);
  if (inSpace && prefs.spCard === false) return mxtHide(); // Settings › Space: no card
  const html = chat
    ? spChatHtml(chat)
    : ag
      ? inSpace
        ? spCardHtml(ag, s)
        : agCardHtml(ag, s)
      : mxCardHtml(pr, prGroups(s.prs).find(g => g.includes(pr)) || [pr]);
  if (el._drawn !== html) {
    el.innerHTML = el._drawn = html;
    fillAges(el);
  }
  const sq = ag || chat ? null : a.classList.contains('mxs') ? a : a.closest('.tmx')?.querySelector('.mxs.lead');
  if (mxt.sq !== sq) {
    mxt.sq?.classList.remove('hot');
    sq?.classList.add('hot');
    mxt.sq = sq;
  }
  const r = a.getBoundingClientRect(),
    list = (head || (inSpace ? $('#space') : $('#sessions'))).getBoundingClientRect(),
    w = Math.min(inSpace ? SP_CARD_W : MXT_W, list.width - 12);
  el.style.setProperty('--w', `${w}px`);
  const h = el.offsetHeight,
    cx = r.left + r.width / 2,
    left = Math.max(list.left + 6, Math.min(cx - w / 2, list.right - 6 - w));
  const above = r.top - 10 - h >= 8,
    y = above ? r.top - 10 - h : r.bottom + 10;
  // from the header, in the app: a pane page under it would cover the card, so over the list, beside the column
  const far =
    !!head &&
    list.left - w - 8 >= 8 &&
    paneRects().some(p => p.left < left + w && left < p.left + p.width && p.top < y + h && y < p.top + p.height);
  el.classList.toggle('below', !above);
  el.classList.toggle('far', far);
  el.style.setProperty('--ax', `${Math.round(Math.max(14, Math.min(w - 14, cx - left)))}px`);
  Object.assign(el.style, { left: `${Math.round(far ? list.left - w - 8 : left)}px`, top: `${Math.round(y)}px` });
  if (!el.classList.contains('on')) {
    void el.offsetWidth;
    el.classList.add('on');
  } // where it stands first, then the spring
}
function mxtHide() {
  clearTimeout(mxt.timer);
  clearTimeout(mxt.out);
  mxt.a = null;
  mxt.sq?.classList.remove('hot');
  mxt.sq = null;
  mxt.el?.classList.remove('on');
}
const mxtOver = e => {
  const a = e.target.closest?.(MX_AT);
  if (!a || e.pointerType === 'touch') return;
  clearTimeout(mxt.out);
  if (a === mxt.a) return;
  mxt.a = a;
  clearTimeout(mxt.timer);
  if (mxt.el?.classList.contains('on')) mxtShow();
  else mxt.timer = setTimeout(mxtShow, a.matches('.spbt') ? MXT_CHAT : MXT_IN); // a node's title: a moment's rest first
};
const mxtOut = e => {
  const a = e.target.closest?.(MX_AT);
  if (!a || a.contains(e.relatedTarget) || e.relatedTarget?.closest?.(MX_AT)) return;
  clearTimeout(mxt.timer);
  mxt.out = setTimeout(mxtHide, MXT_OUT);
};
for (const box of [$('#slist'), $('#shead'), $('#space')]) {
  box.addEventListener('pointerover', mxtOver);
  box.addEventListener('pointerout', mxtOut);
}
const SP_CARD_W = 320; // Space's agent card: what it was asked wants the room
