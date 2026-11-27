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
  const ok = other => other.refs?.head && other.refs.base && !other.refs.fork && prRepo(other) === prRepo(pr);

  if (!ok(pr)) return [pr];

  const same = prs.filter(ok);
  const chain = [pr];
  const seen = new Set(chain);

  for (
    let current = pr, next;
    (next = same.find(other => !seen.has(other) && other.refs.head === current.refs.base));
    current = next
  ) {
    chain.unshift(next);
    seen.add(next);
  }

  for (
    let current = pr, next;
    (next = same.find(other => !seen.has(other) && other.refs.base === current.refs.head));
    current = next
  ) {
    chain.push(next);
    seen.add(next);
  }

  return chain;
}

/** The chat's PRs in the matrix's order: by repo and number, each stack whole where its first PR comes, base first. */
function prGroups(prs) {
  const sorted = [...prs].sort(
    (left, right) => prRepo(left).localeCompare(prRepo(right)) || (left.number || 0) - (right.number || 0),
  );

  const placed = new Set();
  const out = [];

  for (const pr of sorted) {
    if (placed.has(pr)) continue;

    const chain = prChain(
      sorted.filter(other => !placed.has(other)),
      pr,
    );

    for (const member of chain) placed.add(member);
    out.push(chain);
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
          ...(pr.people || []).map(person => person.at),
          ...(pr.rounds || []).flatMap(round => [round.from, round.end]),
        ].map(time => Date.parse(time) || 0),
      );

/** The PR the matrix numbers: the newest move's, else the one updated last (the chat's first of a tie). */
function mxLead(session) {
  const move = !session.done && movedPrs(session)[0];

  if (move) return { pr: move, you: true };
  const prs = session.prs || [];

  let pr = prs[0];
  let at = pr ? prUpdatedAt(pr) : 0;

  for (const candidate of prs) {
    const updated = prUpdatedAt(candidate);

    if (updated > at) {
      pr = candidate;
      at = updated;
    }
  }

  return { pr, you: false };
}

const prNum = pr => (pr.number != null ? `#${pr.number}` : pr.label);

const mxSquare = (pr, lead, cls = '', attrs = '') =>
  `<a class="mxs${pr === lead.pr ? ' lead' : ''}${cls}" data-state="${esc(pr.state || '')}" data-turn="${turnOf(pr)}" data-url="${esc(pr.url)}"${attrs}><span class="vh">${esc(prNum(pr))}${pr.title ? ` ${esc(pr.title)}` : ''}, ${esc(pr.state || 'not known yet')}${prCk(pr) ? `, ${CK_SAID[prCk(pr)]}` : ''}${pr.turn?.you ? ', your move' : ''}</span></a>`;

const mxNumber = (lead, count, ck = '') =>
  `<a class="mxn${lead.you ? ' you' : ''}" data-url="${esc(lead.pr.url)}">${esc(prNum(lead.pr))}${ck}<span class="vh">${lead.you ? ', your move' : ', updated last'} — ${count} PR${count === 1 ? '' : 's'}: </span></a>`;

function cardMatrix(session) {
  const prs = session.prs || [];

  if (!prs.length) return '';

  const groups = prGroups(prs);
  const lead = mxLead(session);
  const px = MX_PX;

  const wide =
    groups.reduce((sum, chain) => sum + chain.length * px.q + (chain.length - 1) * px.c, 0) +
    (groups.length - 1) * px.g; // the squares' own width

  const least = Math.min(wide, 3 * px.q + 2 * px.g) + 2 * MX_PAD;
  const num = prNum(lead.pr);

  return (
    `<span class="tmx" style="--nw:${Math.min(num.length, 9)}ch;--mn:${least}px">${mxNumber(lead, prs.length)}` +
    `<span class="mxg">${groups.map(chain => `<span class="mxc">${chain.map(pr => mxSquare(pr, lead)).join('<s></s>')}</span>`).join('')}</span></span>`
  );
}

/** The chat header's PRs (2026-11-03): the card's matrix, its squares, order and number, in as many rows as fitHeadPrs finds room for; what only
 *  the header says, each PR's CI — the number's badge, data-checks on its square — and the chat's tickets, dots after the squares. A click on
 *  a square opens its PR, its card comes under the pointer, as on a card; the git mark beside it (#prToggle) lists them. */
function headMatrix(session) {
  const prs = session.prs || [];
  const tks = session.tickets || [];

  if (!prs.length && !tks.length) return '';
  const lead = prs.length ? mxLead(session) : null;

  const dots = tks
    .map(
      ticket =>
        `<a class="mxs tk" data-cat="${esc(ticket.cat)}" data-key="${esc(ticket.key)}" title="${esc(`${ticketTip(ticket)}\nClick: open it`)}"><span class="vh">${esc(ticket.key)}</span></a>`,
    )
    .join('');

  return `<span class="tmx">${lead ? mxNumber(lead, prs.length, ckHtml(lead.pr)) : ''}<span class="mxg">${prGroups(prs)
    .map(
      chain =>
        `<span class="mxc">${chain.map((pr, index) => mxSquare(pr, lead, index ? ' j' : '', prCk(pr) ? ` data-checks="${prCk(pr)}"` : '')).join('')}</span>`,
    )
    .join('')}${dots}</span></span>`;
}

/** A PR's card (2026-11-01, later; #mxtip): what a square's tooltip said, drawn — the repo and its state, the number
 *  and title, its CI and its place in a stack (the stack's squares, its own lit), whose move and why, who had a hand
 *  in it (its faces, the newest first) and when GitHub last updated it. */
const MX_STATE = { open: 'Open', draft: 'Draft', merged: 'Merged', closed: 'Closed' };

function mxCardHtml(pr, chain) {
  const ck = prCk(pr);
  const turn = pr.turn;
  const people = (pr.people || []).slice(0, 4);
  const at = pr.updated || '';

  const move = turn?.you
    ? `<div class="mtm you">${RTAG.you}<span>${esc(turn.why)}</span></div>`
    : turn?.waived
      ? `<div class="mtm">${RTAG.let}<span>${esc(turn.why)}</span></div>`
      : turn?.why
        ? `<div class="mtm"><span>${esc(turn.why)}</span></div>`
        : '';

  const stack =
    chain.length > 1
      ? `<span class="mtk"><span class="mtc">${chain.map(member => `<i class="rsq${member === pr ? ' on' : ''}" data-state="${esc(member.state || '')}"></i>`).join('<s></s>')}</span>${chain.indexOf(pr) + 1} of ${chain.length} in a stack</span>`
      : '';

  const who = people.length
    ? `<span class="mtp">${people.map(person => faceHtml(person)).join('')}</span><span class="mtw">${esc(people.map(person => person.login).join(', '))}</span>`
    : '';

  return (
    `<div class="mth"><span class="mtr">${esc(prRepo(pr) || pr.label)}</span><span class="mts" data-state="${esc(pr.state || '')}">${esc(MX_STATE[pr.state] || 'Not heard from GitHub')}</span></div>` +
    `<div class="mtt"><b>${esc(prNum(pr))}</b>${pr.title ? esc(pr.title) : '<i>its title on its way from GitHub…</i>'}</div>${
      ck || stack
        ? `<div class="mtx">${ck ? `<span class="mtck" data-ck="${ck}"><i></i>${CK_SAID[ck]}</span>` : ''}${stack}</div>`
        : ''
    }${move}${
      who || at
        ? `<div class="mtf">${who}${at ? `<span class="mtu">updated <span data-at="${esc(at)}"></span> ago</span>` : ''}</div>`
        : ''
    }`
  );
}

// The pointer on a square or the number (2026-11-01, later): its PR's card after MXT_IN, at once from one square to
// the next while a card is up; off them MXT_OUT, it goes. The square it is for is lifted (.hot) — the number's too.
const MX_AT = '.tmx [data-url], .card .agr[data-ag], #space .spa[data-ag], #space .spbt';
const MXT_IN = 120;
const MXT_CHAT = 450;
const MXT_OUT = 140;
const MXT_W = 290;

const mxt = { el: null, a: null, sq: null, timer: 0, out: 0 };

function mxtShow() {
  const anchor = mxt.a;
  const card = anchor?.isConnected && anchor.closest('#slist > .card');
  const head = anchor?.isConnected && anchor.closest('#shead');
  const inSpace = anchor?.isConnected && anchor.closest('#space'); // Space's marks name their chat (2026-11-18)

  const chat = inSpace && anchor.matches('.spbt') ? state.sessions.get(anchor.closest('.spt')?.dataset.id) : null; // a node's title: its chat's card (2026-11-24)

  const session =
    chat ||
    (card
      ? state.sessions.get(card.dataset.id)
      : inSpace
        ? state.sessions.get(anchor.dataset.sid)
        : head && state.sessions.get(state.current));

  const ag =
    !chat &&
    anchor?.dataset.ag &&
    (inSpace ? spRows(session) : session?.agentRows || []).find(row => row.id === anchor.dataset.ag); // a row of its agents': that one's card (2026-11-02); Space's, any round's

  const pr = !ag && !chat && session?.prs?.find(chatPr => chatPr.url === anchor.dataset.url);

  if (!pr && !ag && !chat) return mxtHide();
  rpopHide();
  restOff();
  const el = (mxt.el ||= Object.assign(document.createElement('div'), { id: 'mxtip', role: 'tooltip' }));

  if (!el.isConnected) document.body.append(el);
  if (ag) agInfoSoon(session, ag, anchor);
  if (inSpace && prefs.spCard === false) return mxtHide(); // Settings › Space: no card

  const html = chat
    ? spChatHtml(chat)
    : ag
      ? inSpace
        ? spCardHtml(ag, session)
        : agCardHtml(ag, session)
      : mxCardHtml(pr, prGroups(session.prs).find(chain => chain.includes(pr)) || [pr]);

  if (el._drawn !== html) {
    el.innerHTML = el._drawn = html;
    fillAges(el);
  }

  const sq =
    ag || chat ? null : anchor.classList.contains('mxs') ? anchor : anchor.closest('.tmx')?.querySelector('.mxs.lead');

  if (mxt.sq !== sq) {
    mxt.sq?.classList.remove('hot');
    sq?.classList.add('hot');
    mxt.sq = sq;
  }

  const rect = anchor.getBoundingClientRect();
  const list = (head || (inSpace ? $('#space') : $('#sessions'))).getBoundingClientRect();
  const width = Math.min(inSpace ? SP_CARD_W : MXT_W, list.width - 12);

  el.style.setProperty('--w', `${width}px`);

  const height = el.offsetHeight;
  const cx = rect.left + rect.width / 2;
  const left = Math.max(list.left + 6, Math.min(cx - width / 2, list.right - 6 - width));

  const above = rect.top - 10 - height >= 8;
  const top = above ? rect.top - 10 - height : rect.bottom + 10;

  // from the header, in the app: a pane page under it would cover the card, so over the list, beside the column
  const far =
    !!head &&
    list.left - width - 8 >= 8 &&
    paneRects().some(
      pane =>
        pane.left < left + width &&
        left < pane.left + pane.width &&
        pane.top < top + height &&
        top < pane.top + pane.height,
    );

  el.classList.toggle('below', !above);
  el.classList.toggle('far', far);
  el.style.setProperty('--ax', `${Math.round(Math.max(14, Math.min(width - 14, cx - left)))}px`);
  Object.assign(el.style, { left: `${Math.round(far ? list.left - width - 8 : left)}px`, top: `${Math.round(top)}px` });

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

const mxtOver = event => {
  const anchor = event.target.closest?.(MX_AT);

  if (!anchor || event.pointerType === 'touch') return;
  clearTimeout(mxt.out);
  if (anchor === mxt.a) return;
  mxt.a = anchor;
  clearTimeout(mxt.timer);
  if (mxt.el?.classList.contains('on')) mxtShow();
  else mxt.timer = setTimeout(mxtShow, anchor.matches('.spbt') ? MXT_CHAT : MXT_IN); // a node's title: a moment's rest first
};

const mxtOut = event => {
  const anchor = event.target.closest?.(MX_AT);

  if (!anchor || anchor.contains(event.relatedTarget) || event.relatedTarget?.closest?.(MX_AT)) return;
  clearTimeout(mxt.timer);
  mxt.out = setTimeout(mxtHide, MXT_OUT);
};

for (const box of [$('#slist'), $('#shead'), $('#space')]) {
  box.addEventListener('pointerover', mxtOver);
  box.addEventListener('pointerout', mxtOut);
}

const SP_CARD_W = 320; // Space's agent card: what it was asked wants the room
