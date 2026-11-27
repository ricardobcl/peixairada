// ---- a PR's rounds (2026-10-15): the server's ledger (prLogs) — each PR's last three rounds come with it (pr.rounds):
// a move come round to you (`from`, `why`), let go (`let`), and how it ended (`end`, `how`: answered · let go · gone,
// `by` the chat whose push or reply it was). The PR rows say each one's round and the one before, the card names every
// PR in play when it has more than the one its line names, says "answered" a while after your word, and the pointer
// on those lines shows the rounds.
const PIP_OK_MS = 12 * 3600_000;
const ANSWERED_MS = 30 * 60_000;

/** A time as the who-line says it, the day before it when it is not today's. */
const when = ts => {
  if (!ts) return '';

  const time = new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const day = dayOf(ts);

  return day === 'Today' ? time : `${day} ${time}`;
};

/** Where a PR stands, as its rounds say it: you · let (let go) · ok (answered, theirs since) · them — the round now
 *  (`cur`) and the one before (`prev`); null for a PR with no turn, merged or closed. */
function roundOf(pr) {
  const turn = pr.turn;
  const rs = pr.rounds || [];
  const last = rs.at(-1);
  const open = last && !last.end ? last : null;

  if (!turn || !(pr.state === 'open' || pr.state === 'draft')) return null;
  if (turn.you || turn.waived) return { k: turn.you ? 'you' : 'let', cur: open, prev: open ? rs.at(-2) : last };
  if (last?.how === 'answered') return { k: 'ok', cur: last, prev: rs.at(-2) };
  return { k: 'them', cur: null, prev: last };
}

const BY = { push: 'pushed', review: 'reviewed', comment: 'commented', reply: 'replied' };

/** Your word that closed a round: what it was and where from — this chat, another, or GitHub alone. */
const byWords = (round, session) =>
  round.by
    ? `you ${BY[round.by.x] || 'answered'} from ${round.by.c === session.id ? 'this chat' : 'another chat'}`
    : 'you answered';

const howWords = (round, session) =>
  round.how === 'answered'
    ? byWords(round, session)
    : round.how === 'let go'
      ? 'let go'
      : round.how === 'gone'
        ? 'its reason went'
        : round.how || '';

const prevWords = (round, session) =>
  `${round.why} ${when(round.from)}${round.end ? ` → ${howWords(round, session)} ${when(round.end)}` : ''}`;

const RTAG = {
  you: '<b class="rtag move">your move</b>',
  let: '<b class="rtag let">let go</b>',
  ok: '<b class="rtag ok">answered</b>',
  them: '',
};

/** A round in words: since when and how long unanswered, let go, or how your word answered it — a row's and the timeline's. */
const roundSay = (session, pr, standing) =>
  standing.k === 'you'
    ? standing.cur
      ? `since ${when(standing.cur.from)} · unanswered <span data-at="${esc(standing.cur.from)}"></span>`
      : esc(pr.turn.why)
    : standing.k === 'let'
      ? `${esc(pr.turn.why)} · let go${standing.cur?.let ? ` ${when(standing.cur.let)}` : ''}, nothing since`
      : standing.k === 'ok'
        ? `${esc(byWords(standing.cur, session))} ${when(standing.cur.end)} · ${esc(pr.turn.why)}`
        : esc(pr.turn.why);

/** A PR row's round, under it: the tag, since when, the round before, and what can be done about it. */
function roundLine(session, pr) {
  const standing = roundOf(pr);

  if (!standing || (standing.k === 'them' && !standing.prev)) return '';
  const say = roundSay(session, pr, standing);

  const acts =
    standing.k === 'you'
      ? `<button type="button" class="pract" data-pract="letgo" data-url="${esc(pr.url)}" title="Let this PR's round go — not your move until the next one, which tells you; the chat's other PRs keep theirs">Let go</button><button type="button" class="pract" data-pract="ask" data-url="${esc(pr.url)}" title="Type it into this chat's Claude, unsent — ⏎ sends it">Ask Claude</button>`
      : standing.k === 'let'
        ? `<button type="button" class="pract" data-pract="undo" data-url="${esc(pr.url)}" title="Your move again, as it was">Undo</button>`
        : '';

  return `<div class="prround" data-k="${standing.k}" data-url="${esc(pr.url)}">${RTAG[standing.k]}<span class="say">${say}${standing.prev ? `<span class="was"> · before: ${esc(prevWords(standing.prev, session))}</span>` : ''}</span>${acts ? `<span class="practs">${acts}</span>` : ''}</div>`;
}

/** The chat's PRs in play — at your move, let go, answered within PIP_OK_MS —, the newest move first. */
function inPlay(session) {
  const now = Date.now();
  const order = { you: 0, let: 1, ok: 2 };

  return (session.prs || [])
    .map(pr => ({ pr, r: roundOf(pr) }))
    .filter(
      ({ r: standing }) =>
        standing &&
        (standing.k === 'you' ||
          standing.k === 'let' ||
          (standing.k === 'ok' && now - Date.parse(standing.cur.end) < PIP_OK_MS)),
    )
    .sort(
      (left, right) =>
        order[left.r.k] - order[right.r.k] ||
        String(right.pr.turn.movedAt || '').localeCompare(String(left.pr.turn.movedAt || '')),
    );
}

const PIP_SAY = { you: 'your move', let: 'let go', ok: 'answered' };
// A PR's own hue (2026-10-15), so its chip reads the same in the card's marks, the rounds and their events: one of the
// theme's syntax tokens, by the PR's place among its chat's numbers — a theme reaches it, and no two of a chat's PRs
// share one (green and red are the answered's and a question's, not a PR's).
const PR_HUES = ['--you', '--hl-key', '--hl-cls', '--hl-fn', '--hl-meta', '--hl-num'];
const hueAt = index => `var(${PR_HUES[Math.abs(index) % PR_HUES.length]})`;

const prHue = (session, pr) =>
  hueAt(
    [...new Set((session.prs || []).map(other => other.number || 0))]
      .sort((left, right) => left - right)
      .indexOf(pr.number || 0),
  );

const pchip = (session, pr) =>
  `<span class="pchip" style="--h:${prHue(session, pr)}">${esc(pr.label.replace(/^.*?#/, '#'))}</span>`;

/** Every PR in play, when the card has one besides the PR its move line names: its chip, a mark and a word each. */
function pipsHtml(session) {
  if (session.done) return '';

  const play = inPlay(session);
  const lead = movedPrs(session)[0]?.url;

  if (!play.some(entry => entry.pr.url !== lead)) return '';
  return `<div class="prpips">${play
    .slice(0, 3)
    .map(
      ({ pr, r: standing }) =>
        `<span class="pp" data-k="${standing.k}" data-url="${esc(pr.url)}">${pchip(session, pr)}<i></i>${PIP_SAY[standing.k]}</span>`,
    )
    .join('')}${play.length > 3 ? '<span class="pp more">…</span>' : ''}</div>`;
}

/** Your word just closed a round, and nothing is at your move: the card says so, and how long ago, for ANSWERED_MS. */
function answeredHtml(session) {
  if (session.done || movedPrs(session).length) return '';

  const now = Date.now();

  const hit = (session.prs || [])
    .map(pr => ({ pr, r: roundOf(pr) }))
    .filter(({ r: standing }) => standing?.k === 'ok' && now - Date.parse(standing.cur.end) < ANSWERED_MS)
    .sort((left, right) => right.r.cur.end.localeCompare(left.r.cur.end))[0];

  if (!hit) return '';
  return `<div class="state prans"><b class="rtag ok">answered</b><span class="q">${esc(hit.pr.label.replace(/^.*?#/, '#'))} · ${esc(byWords(hit.r.cur, session))}, <span data-at="${esc(hit.r.cur.end)}"></span> ago</span></div>`;
}

// The rounds under the pointer (2026-10-15): resting on a card's PRs — its chips, its move line, its "answered", its
// marks — shows the chat's PRs as their rows say them, the round now tinted, and the latest on them: GitHub's events,
// what this chat did, and your words that named them (GET /api/sessions/:id/prlog, kept a while). Beside the card,
// over the chat; under the line, over the list, when a page in the pane is there (a native view covers the page).
// Read-only: the pointer passes through it.
const prlogs = new Map(); // chat id → { at, v, asking }

function prlogOf(session, then) {
  const hit = prlogs.get(session.id);

  if (!hit || (!hit.asking && Date.now() - hit.at > 15_000)) {
    prlogs.set(session.id, { ...hit, asking: true, at: hit?.at || 0 });

    api('GET', `/api/sessions/${session.id}/prlog`)
      .catch(() => null)
      .then(log => {
        prlogs.set(session.id, { at: Date.now(), v: log });
        then?.();
      });
  }

  return hit?.v || null;
}

const EV_SAY = event =>
  event.k === 'opened'
    ? 'opened it'
    : event.k === 'review'
      ? ({ APPROVED: 'approved', CHANGES_REQUESTED: 'asked for changes', DISMISSED: 'dismissed a review' }[event.s] ||
          'reviewed') + (event.n > 1 ? ` ×${event.n}` : '')
      : event.k === 'comment'
        ? event.n > 1
          ? `left ${event.n} comments`
          : 'commented'
        : event.k === 'push'
          ? event.f
            ? 'force-pushed'
            : event.n > 1
              ? `pushed ${event.n} commits`
              : 'pushed'
          : event.k === 'ask'
            ? 'asked for your review'
            : event.k === 'chat'
              ? `${{ push: 'pushed', review: 'reviewed', comment: 'commented', reply: 'replied', merge: 'merged it', opened: 'opened it' }[event.x] || event.x}`
              : event.k === 'board'
                ? event.x === 'back'
                  ? 'took the let-go back'
                  : 'let this round go'
                : // what happened to the PR itself, and its CI (2026-10-17, the ledger's L2): `w` null is GitHub's, a bot's or no one's
                  event.k === 'merged'
                  ? 'merged it'
                  : event.k === 'closed'
                    ? 'closed it'
                    : event.k === 'reopened'
                      ? 'reopened it'
                      : event.k === 'ready'
                        ? 'marked it ready for review'
                        : event.k === 'asked'
                          ? event.x
                            ? `asked ${event.x} to review`
                            : 'asked a team to review'
                          : event.k === 'ci'
                            ? (event.s === 'fail' ? 'CI failed' : 'CI passed') + (event.n > 1 ? ` ×${event.n}` : '')
                            : event.k;

/** Who did it, as a small round mark: GitHub's face for a person the PR knows, else their initial; you, Claude, the board. */
function evMark(event, faces) {
  if (event.said) return `<i class="ri you">${ICON.you}</i>`;
  if (event.k === 'chat') return `<i class="ri chat">${ICON.claude}</i>`;
  if (event.k === 'board') return '<i class="ri board">–</i>';

  if (event.k === 'ci') {
    return `<i class="ri ci${event.s === 'fail' ? ' bad' : ''}">${event.s === 'fail' ? '✕' : '✓'}</i>`;
  } // a check's turn: no one's face

  if (event.w === null) return '<i class="ri board">–</i>'; // GitHub's own, a bot's
  if (event.w === '') return '<i class="ri me">you</i>';
  const face = faces.get(event.w);

  return face
    ? `<img class="ri" src="${esc(face)}" alt="">`
    : `<i class="ri" style="--h:${hueAt([...String(event.w || '?')].reduce((sum, char) => sum + char.charCodeAt(0), 0))}">${esc(String(event.w || '?')[0].toUpperCase())}</i>`;
}

const RPOP_MAX = 12; // the matrix's rows at most (2026-11-01): a chat holds up to 40 PRs, the popover one window's height

function rpopHtml(session) {
  if (!session.prs?.length) return '';

  const log = prlogOf(session, () => {
    if (rpop.sid === session.id) rpopShow();
  });

  const byUrl = new Map((session.prs || []).map(pr => [pr.url, pr]));

  const faces = new Map(
    (session.prs || []).flatMap(pr =>
      (pr.people || []).filter(person => person.avatar).map(person => [person.login, person.avatar]),
    ),
  );

  const round = (pr, standing) => ({
    sub:
      standing.k === 'you'
        ? standing.cur
          ? `${when(standing.cur.from)} · <span data-at="${esc(standing.cur.from)}"></span> ago · <b class="un">unanswered</b>`
          : esc(when(pr.turn.at))
        : standing.k === 'let'
          ? `${standing.cur ? `${when(standing.cur.from)} · ` : ''}let go${standing.cur?.let ? ` ${when(standing.cur.let)}` : ''} · nothing since`
          : standing.k === 'ok'
            ? `${when(standing.cur.end)} · <span data-at="${esc(standing.cur.end)}"></span> ago${standing.cur.by ? ` · from ${standing.cur.by.c === session.id ? 'this chat' : 'another chat'}` : ''} · ${esc(pr.turn.why)}`
            : '',
    head:
      standing.k === 'ok' ? `you ${standing.cur.by ? BY[standing.cur.by.x] || 'answered' : 'answered'}` : pr.turn.why,
  });

  // Every PR, in the matrix's order (2026-11-01) — a stack's rows joined by a line, base first —, each its square, number and
  // title, its state and CI, and a PR in play its round as the rows below say it; past RPOP_MAX the ones in play and the
  // numbered one first.
  const prs = session.prs || [];

  const mxRow = pr => {
    const standing = roundOf(pr);
    const said = standing && round(pr, standing);
    const ck = prCk(pr);

    return (
      `<div class="rpr mx" data-k="${standing?.k || ''}"><i class="rsq" data-state="${esc(pr.state || '')}"></i>${pchip(session, pr)}<span class="h${pr.title ? '' : ' pending'}">${pr.title ? esc(pr.title) : 'title on its way from gh…'}</span>` +
      `<span class="s"><span class="st" data-state="${esc(pr.state || '')}">${esc(pr.state || 'not heard from GitHub yet')}</span>${ck ? ` · ${CK_SAID[ck]}` : ''}` +
      `${standing ? `<br>${RTAG[standing.k] || ''}<b class="rh">${esc(said.head)}</b>${said.sub ? ` · ${said.sub}` : ''}${standing.prev ? `<br>round before: ${esc(prevWords(standing.prev, session))}` : ''}` : ''}</span></div>`
    );
  };

  const groups = prGroups(prs);
  const lead = mxLead(session).pr;
  const order = groups.flat();

  const keep =
    order.length > RPOP_MAX ? new Set(order.filter(pr => pr === lead || roundOf(pr)).slice(0, RPOP_MAX)) : null;

  if (keep) {
    for (const pr of order) {
      if (keep.size >= RPOP_MAX) break;
      keep.add(pr);
    }
  }

  const now =
    groups
      .map(chain => {
        const rs = chain
          .filter(pr => !keep || keep.has(pr))
          .map(mxRow)
          .join('');

        return chain.length > 1 && rs ? `<div class="rstk">${rs}</div>` : rs;
      })
      .join('') +
    (keep ? `<div class="rmore">+${order.length - keep.size} more — every one in the chat header’s PR list</div>` : '');

  // the latest: GitHub's events, the chat's own, the board's, and your words naming a PR — the newest five, in order
  // a word of yours GitHub has and this chat's own act on the same PR within two minutes are one: the chat's says where from
  const chatAt = (log?.prs || []).flatMap(prLog =>
    prLog.ev.filter(event => event.k === 'chat').map(event => [prLog.url, Date.parse(event.a)]),
  );

  const twin = (url, event) =>
    event.w === '' &&
    event.k !== 'chat' &&
    event.k !== 'board' &&
    chatAt.some(([chatUrl, at]) => chatUrl === url && Math.abs(at - Date.parse(event.a)) < 120_000);

  const evs = [
    ...(log?.prs || []).flatMap(prLog =>
      prLog.ev.filter(event => !twin(prLog.url, event)).map(event => ({ ...event, url: prLog.url })),
    ),
    ...(log?.said || []).map(word => ({ a: word.a, said: true, text: word.text, url: word.urls?.[0] })),
  ]
    .filter(event => byUrl.has(event.url))
    .sort((left, right) => left.a.localeCompare(right.a))
    .slice(-5);

  const lat = evs
    .map(event => {
      const pr = byUrl.get(event.url);
      const rs = pr.rounds || [];

      if (event.said) {
        return `<div class="rev said"><span class="t">${esc(when(event.a))}</span>${evMark(event, faces)}<div class="x"><span class="bub">${ticks(esc(event.text))}</span></div></div>`;
      }

      const opens =
        event.k !== 'chat' &&
        event.k !== 'board' &&
        event.k !== 'opened' &&
        event.w !== '' &&
        rs.find(prRound => prRound.from === event.a);

      const closes = rs.find(
        prRound =>
          prRound.how === 'answered' &&
          (prRound.by
            ? prRound.by.a === event.a && event.k === 'chat'
            : (prRound.end === event.a && event.w === '') ||
              (event.k === 'chat' && Math.abs(Date.parse(prRound.end) - Date.parse(event.a)) < 120_000)),
      );

      const live = opens && !opens.end && pr.turn?.you;

      return `<div class="rev${live ? ' live' : ''}"><span class="t">${esc(when(event.a))}</span>${evMark(event, faces)}<div class="x">${pchip(session, pr)} <b>${event.w === '' || event.k === 'chat' || event.k === 'board' ? 'you' : esc(event.w || 'someone')}</b> ${esc(EV_SAY(event))}${event.k === 'chat' ? (event.c === session.id ? ' from this chat' : ' from another chat') : ''}${opens ? `<div class="rr">${RTAG.you}</div>` : ''}${closes ? `<div class="rr ok">✓ answers ${esc(closes.why)}</div>` : ''}</div></div>`;
    })
    .join('');

  if (!now && !lat) return '';

  const named = session.prTitle && session.title === session.prTitle && prs.find(pr => pr.title === session.prTitle);
  const own = named && (session.aiTitle || session.lastPrompt); // titled by its PR: which, and the chat's own (titleTip's)

  return `${named ? `<div class="rtt">titled by ${pchip(session, named)}${own ? ` · the chat’s own: <span>${esc(own)}</span>` : ''}</div>` : ''}<div class="rph">this chat’s PRs · ${prs.length}</div><div class="rnow">${now}</div>${lat ? `<div class="rph">latest</div><div class="rlat">${lat}</div>` : ''}<div class="rpf">click a square: its PR · click “your move” or a PR’s mark: its timeline, at the move (⌥⌘J) · ⌥-click: let every round go</div>`;
}

const rpop = { el: null, sid: null, anchor: null, timer: 0 };

/** The pane's pages over the chat column, as last posted: a popover there would be under them. */
const paneRects = () => {
  try {
    return JSON.parse(postPane.last || '{}').panes || [];
  } catch {
    return [];
  }
};

function rpopShow() {
  const session = state.sessions.get(rpop.sid);
  const anchor = rpop.anchor;

  if (!session || !anchor?.isConnected) return rpopHide();
  const el = (rpop.el ||= Object.assign(document.createElement('div'), { id: 'rpop', role: 'tooltip' }));

  if (!el.isConnected) document.body.append(el);
  const html = rpopHtml(session);

  if (!html) return rpopHide();

  if (el._drawn !== html) {
    el.innerHTML = el._drawn = html;
    fillAges(el);
  }

  const card = anchor.closest('.card').getBoundingClientRect();
  const WIDTH = 390;
  const gap = 10;

  const beside = { left: card.right + gap, width: WIDTH };

  el.style.width = `${WIDTH}px`;

  const height = el.offsetHeight;
  const top = Math.max(8, Math.min(card.top - 4, innerHeight - 8 - height));

  const hit = rect =>
    paneRects().some(
      pane =>
        pane.left < rect.left + rect.width &&
        rect.left < pane.left + pane.width &&
        pane.top < rect.top + height &&
        rect.top < pane.top + pane.height,
    );

  if (beside.left + WIDTH <= innerWidth - 8 && !hit({ ...beside, top })) {
    Object.assign(el.style, { left: `${Math.round(beside.left)}px`, top: `${Math.round(top)}px` });
  } else {
    // a page of the pane, or no room, beside the card: under the line, over the list
    const rect = anchor.getBoundingClientRect();

    el.style.width = `${Math.round(card.width - 12)}px`;

    const h2 = el.offsetHeight;
    const t2 = rect.bottom + 6 + h2 <= innerHeight - 8 ? rect.bottom + 6 : Math.max(8, card.top - 6 - h2);

    Object.assign(el.style, { left: `${Math.round(card.left + 6)}px`, top: `${Math.round(t2)}px` });
  }

  el.classList.add('on');
}

function rpopHide() {
  clearTimeout(rpop.timer);
  rpop.sid = rpop.anchor = null;
  rpop.el?.classList.remove('on');
}

// The pointer at rest on a card brings them up (2026-11-01, later; on the card's PRs and its move line, 350 ms, before):
// REST_MS still — moves under REST_PX are no move — anywhere on it but a PR's square or number (its own card, #mxtip)
// and a part with a tooltip of its own, so one thing shows at a time. Up, they stay while the pointer is on that card,
// and go when it leaves, comes onto such a part, presses or scrolls the list.
const REST_MS = 600;
const REST_PX = 4;

const rest = { id: null, x: 0, y: 0, timer: 0 };

const restOff = () => {
  clearTimeout(rest.timer);
  rest.id = null;
};

$('#slist').addEventListener('pointermove', event => {
  if (event.pointerType === 'touch') return;

  const card = event.target.closest('#slist > .card');
  const own = card && (event.target.closest(MX_AT) || card.contains(event.target.closest('[title]')));

  if (!card || own) {
    restOff();
    if (rpop.sid) rpopHide();
    return;
  }

  const id = card.dataset.id;

  if (rpop.sid === id && rpop.el?.classList.contains('on')) {
    rpop.anchor = card;
    return;
  }

  if (rpop.sid && rpop.sid !== id) rpopHide();
  if (rest.id === id && Math.abs(event.clientX - rest.x) + Math.abs(event.clientY - rest.y) < REST_PX) return;
  clearTimeout(rest.timer);
  Object.assign(rest, { id, x: event.clientX, y: event.clientY });

  rest.timer = setTimeout(() => {
    const el = cardNodes.get(id)?.el;

    rest.id = null;
    if (!el?.isConnected || !el.matches(':hover')) return;
    rpop.anchor = el;
    rpop.sid = id;
    rpopShow();
  }, REST_MS);
});

$('#slist').addEventListener('pointerleave', () => {
  restOff();
  rpopHide();
  mxtHide();
});

$('#slist').addEventListener('pointerdown', () => {
  restOff();
  rpopHide();
  mxtHide();
});

$('#slist').addEventListener(
  'scroll',
  () => {
    rpopHide();
    mxtHide();
  },
  { passive: true },
);
