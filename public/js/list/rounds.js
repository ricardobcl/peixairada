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

  const t = new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const d = dayOf(ts);

  return d === 'Today' ? t : `${d} ${t}`;
};

/** Where a PR stands, as its rounds say it: you · let (let go) · ok (answered, theirs since) · them — the round now
 *  (`cur`) and the one before (`prev`); null for a PR with no turn, merged or closed. */
function roundOf(pr) {
  const t = pr.turn;
  const rs = pr.rounds || [];
  const last = rs.at(-1);
  const open = last && !last.end ? last : null;

  if (!t || !(pr.state === 'open' || pr.state === 'draft')) return null;
  if (t.you || t.waived) return { k: t.you ? 'you' : 'let', cur: open, prev: open ? rs.at(-2) : last };
  if (last?.how === 'answered') return { k: 'ok', cur: last, prev: rs.at(-2) };
  return { k: 'them', cur: null, prev: last };
}

const BY = { push: 'pushed', review: 'reviewed', comment: 'commented', reply: 'replied' };

/** Your word that closed a round: what it was and where from — this chat, another, or GitHub alone. */
const byWords = (r, s) =>
  r.by ? `you ${BY[r.by.x] || 'answered'} from ${r.by.c === s.id ? 'this chat' : 'another chat'}` : 'you answered';

const howWords = (r, s) =>
  r.how === 'answered'
    ? byWords(r, s)
    : r.how === 'let go'
      ? 'let go'
      : r.how === 'gone'
        ? 'its reason went'
        : r.how || '';

const prevWords = (r, s) => `${r.why} ${when(r.from)}${r.end ? ` → ${howWords(r, s)} ${when(r.end)}` : ''}`;

const RTAG = {
  you: '<b class="rtag move">your move</b>',
  let: '<b class="rtag let">let go</b>',
  ok: '<b class="rtag ok">answered</b>',
  them: '',
};

/** A round in words: since when and how long unanswered, let go, or how your word answered it — a row's and the timeline's. */
const roundSay = (s, pr, r) =>
  r.k === 'you'
    ? r.cur
      ? `since ${when(r.cur.from)} · unanswered <span data-at="${esc(r.cur.from)}"></span>`
      : esc(pr.turn.why)
    : r.k === 'let'
      ? `${esc(pr.turn.why)} · let go${r.cur?.let ? ` ${when(r.cur.let)}` : ''}, nothing since`
      : r.k === 'ok'
        ? `${esc(byWords(r.cur, s))} ${when(r.cur.end)} · ${esc(pr.turn.why)}`
        : esc(pr.turn.why);

/** A PR row's round, under it: the tag, since when, the round before, and what can be done about it. */
function roundLine(s, pr) {
  const r = roundOf(pr);

  if (!r || (r.k === 'them' && !r.prev)) return '';
  const say = roundSay(s, pr, r);

  const acts =
    r.k === 'you'
      ? `<button type="button" class="pract" data-pract="letgo" data-url="${esc(pr.url)}" title="Let this PR's round go — not your move until the next one, which tells you; the chat's other PRs keep theirs">Let go</button><button type="button" class="pract" data-pract="ask" data-url="${esc(pr.url)}" title="Type it into this chat's Claude, unsent — ⏎ sends it">Ask Claude</button>`
      : r.k === 'let'
        ? `<button type="button" class="pract" data-pract="undo" data-url="${esc(pr.url)}" title="Your move again, as it was">Undo</button>`
        : '';

  return `<div class="prround" data-k="${r.k}" data-url="${esc(pr.url)}">${RTAG[r.k]}<span class="say">${say}${r.prev ? `<span class="was"> · before: ${esc(prevWords(r.prev, s))}</span>` : ''}</span>${acts ? `<span class="practs">${acts}</span>` : ''}</div>`;
}

/** The chat's PRs in play — at your move, let go, answered within PIP_OK_MS —, the newest move first. */
function inPlay(s) {
  const now = Date.now();
  const order = { you: 0, let: 1, ok: 2 };

  return (s.prs || [])
    .map(pr => ({ pr, r: roundOf(pr) }))
    .filter(
      ({ r }) => r && (r.k === 'you' || r.k === 'let' || (r.k === 'ok' && now - Date.parse(r.cur.end) < PIP_OK_MS)),
    )
    .sort(
      (a, b) =>
        order[a.r.k] - order[b.r.k] || String(b.pr.turn.movedAt || '').localeCompare(String(a.pr.turn.movedAt || '')),
    );
}

const PIP_SAY = { you: 'your move', let: 'let go', ok: 'answered' };
// A PR's own hue (2026-10-15), so its chip reads the same in the card's marks, the rounds and their events: one of the
// theme's syntax tokens, by the PR's place among its chat's numbers — a theme reaches it, and no two of a chat's PRs
// share one (green and red are the answered's and a question's, not a PR's).
const PR_HUES = ['--you', '--hl-key', '--hl-cls', '--hl-fn', '--hl-meta', '--hl-num'];
const hueAt = i => `var(${PR_HUES[Math.abs(i) % PR_HUES.length]})`;

const prHue = (s, pr) =>
  hueAt([...new Set((s.prs || []).map(p => p.number || 0))].sort((a, b) => a - b).indexOf(pr.number || 0));

const pchip = (s, pr) =>
  `<span class="pchip" style="--h:${prHue(s, pr)}">${esc(pr.label.replace(/^.*?#/, '#'))}</span>`;

/** Every PR in play, when the card has one besides the PR its move line names: its chip, a mark and a word each. */
function pipsHtml(s) {
  if (s.done) return '';

  const play = inPlay(s);
  const lead = movedPrs(s)[0]?.url;

  if (!play.some(x => x.pr.url !== lead)) return '';
  return `<div class="prpips">${play
    .slice(0, 3)
    .map(
      ({ pr, r }) =>
        `<span class="pp" data-k="${r.k}" data-url="${esc(pr.url)}">${pchip(s, pr)}<i></i>${PIP_SAY[r.k]}</span>`,
    )
    .join('')}${play.length > 3 ? '<span class="pp more">…</span>' : ''}</div>`;
}

/** Your word just closed a round, and nothing is at your move: the card says so, and how long ago, for ANSWERED_MS. */
function answeredHtml(s) {
  if (s.done || movedPrs(s).length) return '';

  const now = Date.now();

  const hit = (s.prs || [])
    .map(pr => ({ pr, r: roundOf(pr) }))
    .filter(({ r }) => r?.k === 'ok' && now - Date.parse(r.cur.end) < ANSWERED_MS)
    .sort((a, b) => b.r.cur.end.localeCompare(a.r.cur.end))[0];

  if (!hit) return '';
  return `<div class="state prans"><b class="rtag ok">answered</b><span class="q">${esc(hit.pr.label.replace(/^.*?#/, '#'))} · ${esc(byWords(hit.r.cur, s))}, <span data-at="${esc(hit.r.cur.end)}"></span> ago</span></div>`;
}

// The rounds under the pointer (2026-10-15): resting on a card's PRs — its chips, its move line, its "answered", its
// marks — shows the chat's PRs as their rows say them, the round now tinted, and the latest on them: GitHub's events,
// what this chat did, and your words that named them (GET /api/sessions/:id/prlog, kept a while). Beside the card,
// over the chat; under the line, over the list, when a page in the pane is there (a native view covers the page).
// Read-only: the pointer passes through it.
const prlogs = new Map(); // chat id → { at, v, asking }

function prlogOf(s, then) {
  const hit = prlogs.get(s.id);

  if (!hit || (!hit.asking && Date.now() - hit.at > 15_000)) {
    prlogs.set(s.id, { ...hit, asking: true, at: hit?.at || 0 });

    api('GET', `/api/sessions/${s.id}/prlog`)
      .catch(() => null)
      .then(v => {
        prlogs.set(s.id, { at: Date.now(), v });
        then?.();
      });
  }

  return hit?.v || null;
}

const EV_SAY = e =>
  e.k === 'opened'
    ? 'opened it'
    : e.k === 'review'
      ? ({ APPROVED: 'approved', CHANGES_REQUESTED: 'asked for changes', DISMISSED: 'dismissed a review' }[e.s] ||
          'reviewed') + (e.n > 1 ? ` ×${e.n}` : '')
      : e.k === 'comment'
        ? e.n > 1
          ? `left ${e.n} comments`
          : 'commented'
        : e.k === 'push'
          ? e.f
            ? 'force-pushed'
            : e.n > 1
              ? `pushed ${e.n} commits`
              : 'pushed'
          : e.k === 'ask'
            ? 'asked for your review'
            : e.k === 'chat'
              ? `${{ push: 'pushed', review: 'reviewed', comment: 'commented', reply: 'replied', merge: 'merged it', opened: 'opened it' }[e.x] || e.x}`
              : e.k === 'board'
                ? e.x === 'back'
                  ? 'took the let-go back'
                  : 'let this round go'
                : // what happened to the PR itself, and its CI (2026-10-17, the ledger's L2): `w` null is GitHub's, a bot's or no one's
                  e.k === 'merged'
                  ? 'merged it'
                  : e.k === 'closed'
                    ? 'closed it'
                    : e.k === 'reopened'
                      ? 'reopened it'
                      : e.k === 'ready'
                        ? 'marked it ready for review'
                        : e.k === 'asked'
                          ? e.x
                            ? `asked ${e.x} to review`
                            : 'asked a team to review'
                          : e.k === 'ci'
                            ? (e.s === 'fail' ? 'CI failed' : 'CI passed') + (e.n > 1 ? ` ×${e.n}` : '')
                            : e.k;

/** Who did it, as a small round mark: GitHub's face for a person the PR knows, else their initial; you, Claude, the board. */
function evMark(e, faces) {
  if (e.said) return `<i class="ri you">${ICON.you}</i>`;
  if (e.k === 'chat') return `<i class="ri chat">${ICON.claude}</i>`;
  if (e.k === 'board') return '<i class="ri board">–</i>';
  if (e.k === 'ci') return `<i class="ri ci${e.s === 'fail' ? ' bad' : ''}">${e.s === 'fail' ? '✕' : '✓'}</i>`; // a check's turn: no one's face
  if (e.w === null) return '<i class="ri board">–</i>'; // GitHub's own, a bot's
  if (e.w === '') return '<i class="ri me">you</i>';
  const f = faces.get(e.w);

  return f
    ? `<img class="ri" src="${esc(f)}" alt="">`
    : `<i class="ri" style="--h:${hueAt([...String(e.w || '?')].reduce((a, c) => a + c.charCodeAt(0), 0))}">${esc(String(e.w || '?')[0].toUpperCase())}</i>`;
}

const RPOP_MAX = 12; // the matrix's rows at most (2026-11-01): a chat holds up to 40 PRs, the popover one window's height

function rpopHtml(s) {
  if (!s.prs?.length) return '';

  const log = prlogOf(s, () => {
    if (rpop.sid === s.id) rpopShow();
  });

  const byUrl = new Map((s.prs || []).map(p => [p.url, p]));

  const faces = new Map(
    (s.prs || []).flatMap(p => (p.people || []).filter(x => x.avatar).map(x => [x.login, x.avatar])),
  );

  const round = (pr, r) => ({
    sub:
      r.k === 'you'
        ? r.cur
          ? `${when(r.cur.from)} · <span data-at="${esc(r.cur.from)}"></span> ago · <b class="un">unanswered</b>`
          : esc(when(pr.turn.at))
        : r.k === 'let'
          ? `${r.cur ? `${when(r.cur.from)} · ` : ''}let go${r.cur?.let ? ` ${when(r.cur.let)}` : ''} · nothing since`
          : r.k === 'ok'
            ? `${when(r.cur.end)} · <span data-at="${esc(r.cur.end)}"></span> ago${r.cur.by ? ` · from ${r.cur.by.c === s.id ? 'this chat' : 'another chat'}` : ''} · ${esc(pr.turn.why)}`
            : '',
    head: r.k === 'ok' ? `you ${r.cur.by ? BY[r.cur.by.x] || 'answered' : 'answered'}` : pr.turn.why,
  });

  // Every PR, in the matrix's order (2026-11-01) — a stack's rows joined by a line, base first —, each its square, number and
  // title, its state and CI, and a PR in play its round as the rows below say it; past RPOP_MAX the ones in play and the
  // numbered one first.
  const prs = s.prs || [];

  const mxRow = pr => {
    const r = roundOf(pr);
    const b = r && round(pr, r);
    const ck = prCk(pr);

    return (
      `<div class="rpr mx" data-k="${r?.k || ''}"><i class="rsq" data-state="${esc(pr.state || '')}"></i>${pchip(s, pr)}<span class="h${pr.title ? '' : ' pending'}">${pr.title ? esc(pr.title) : 'title on its way from gh…'}</span>` +
      `<span class="s"><span class="st" data-state="${esc(pr.state || '')}">${esc(pr.state || 'not heard from GitHub yet')}</span>${ck ? ` · ${CK_SAID[ck]}` : ''}` +
      `${r ? `<br>${RTAG[r.k] || ''}<b class="rh">${esc(b.head)}</b>${b.sub ? ` · ${b.sub}` : ''}${r.prev ? `<br>round before: ${esc(prevWords(r.prev, s))}` : ''}` : ''}</span></div>`
    );
  };

  const groups = prGroups(prs);
  const lead = mxLead(s).pr;
  const order = groups.flat();

  const keep = order.length > RPOP_MAX ? new Set(order.filter(p => p === lead || roundOf(p)).slice(0, RPOP_MAX)) : null;

  if (keep) {
    for (const p of order) {
      if (keep.size >= RPOP_MAX) break;
      keep.add(p);
    }
  }

  const now =
    groups
      .map(g => {
        const rs = g
          .filter(p => !keep || keep.has(p))
          .map(mxRow)
          .join('');

        return g.length > 1 && rs ? `<div class="rstk">${rs}</div>` : rs;
      })
      .join('') +
    (keep ? `<div class="rmore">+${order.length - keep.size} more — every one in the chat header’s PR list</div>` : '');

  // the latest: GitHub's events, the chat's own, the board's, and your words naming a PR — the newest five, in order
  // a word of yours GitHub has and this chat's own act on the same PR within two minutes are one: the chat's says where from
  const chatAt = (log?.prs || []).flatMap(p => p.ev.filter(e => e.k === 'chat').map(e => [p.url, Date.parse(e.a)]));

  const twin = (url, e) =>
    e.w === '' &&
    e.k !== 'chat' &&
    e.k !== 'board' &&
    chatAt.some(([u, t]) => u === url && Math.abs(t - Date.parse(e.a)) < 120_000);

  const evs = [
    ...(log?.prs || []).flatMap(p => p.ev.filter(e => !twin(p.url, e)).map(e => ({ ...e, url: p.url }))),
    ...(log?.said || []).map(x => ({ a: x.a, said: true, text: x.text, url: x.urls?.[0] })),
  ]
    .filter(e => byUrl.has(e.url))
    .sort((a, b) => a.a.localeCompare(b.a))
    .slice(-5);

  const lat = evs
    .map(e => {
      const pr = byUrl.get(e.url);
      const rs = pr.rounds || [];

      if (e.said) {
        return `<div class="rev said"><span class="t">${esc(when(e.a))}</span>${evMark(e, faces)}<div class="x"><span class="bub">${ticks(esc(e.text))}</span></div></div>`;
      }

      const opens = e.k !== 'chat' && e.k !== 'board' && e.k !== 'opened' && e.w !== '' && rs.find(r => r.from === e.a);

      const closes = rs.find(
        r =>
          r.how === 'answered' &&
          (r.by
            ? r.by.a === e.a && e.k === 'chat'
            : (r.end === e.a && e.w === '') ||
              (e.k === 'chat' && Math.abs(Date.parse(r.end) - Date.parse(e.a)) < 120_000)),
      );

      const live = opens && !opens.end && pr.turn?.you;

      return `<div class="rev${live ? ' live' : ''}"><span class="t">${esc(when(e.a))}</span>${evMark(e, faces)}<div class="x">${pchip(s, pr)} <b>${e.w === '' || e.k === 'chat' || e.k === 'board' ? 'you' : esc(e.w || 'someone')}</b> ${esc(EV_SAY(e))}${e.k === 'chat' ? (e.c === s.id ? ' from this chat' : ' from another chat') : ''}${opens ? `<div class="rr">${RTAG.you}</div>` : ''}${closes ? `<div class="rr ok">✓ answers ${esc(closes.why)}</div>` : ''}</div></div>`;
    })
    .join('');

  if (!now && !lat) return '';

  const named = s.prTitle && s.title === s.prTitle && prs.find(p => p.title === s.prTitle);
  const own = named && (s.aiTitle || s.lastPrompt); // titled by its PR: which, and the chat's own (titleTip's)

  return `${named ? `<div class="rtt">titled by ${pchip(s, named)}${own ? ` · the chat’s own: <span>${esc(own)}</span>` : ''}</div>` : ''}<div class="rph">this chat’s PRs · ${prs.length}</div><div class="rnow">${now}</div>${lat ? `<div class="rph">latest</div><div class="rlat">${lat}</div>` : ''}<div class="rpf">click a square: its PR · click “your move” or a PR’s mark: its timeline, at the move (⌥⌘J) · ⌥-click: let every round go</div>`;
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
  const s = state.sessions.get(rpop.sid);
  const a = rpop.anchor;

  if (!s || !a?.isConnected) return rpopHide();
  const el = (rpop.el ||= Object.assign(document.createElement('div'), { id: 'rpop', role: 'tooltip' }));

  if (!el.isConnected) document.body.append(el);
  const html = rpopHtml(s);

  if (!html) return rpopHide();

  if (el._drawn !== html) {
    el.innerHTML = el._drawn = html;
    fillAges(el);
  }

  const card = a.closest('.card').getBoundingClientRect();
  const W = 390;
  const gap = 10;

  const beside = { left: card.right + gap, width: W };

  el.style.width = `${W}px`;

  const h = el.offsetHeight;
  const top = Math.max(8, Math.min(card.top - 4, innerHeight - 8 - h));

  const hit = r =>
    paneRects().some(
      p => p.left < r.left + r.width && r.left < p.left + p.width && p.top < r.top + h && r.top < p.top + p.height,
    );

  if (beside.left + W <= innerWidth - 8 && !hit({ ...beside, top })) {
    Object.assign(el.style, { left: `${Math.round(beside.left)}px`, top: `${Math.round(top)}px` });
  } else {
    // a page of the pane, or no room, beside the card: under the line, over the list
    const r = a.getBoundingClientRect();

    el.style.width = `${Math.round(card.width - 12)}px`;

    const h2 = el.offsetHeight;
    const t2 = r.bottom + 6 + h2 <= innerHeight - 8 ? r.bottom + 6 : Math.max(8, card.top - 6 - h2);

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

$('#slist').addEventListener('pointermove', e => {
  if (e.pointerType === 'touch') return;

  const c = e.target.closest('#slist > .card');
  const own = c && (e.target.closest(MX_AT) || c.contains(e.target.closest('[title]')));

  if (!c || own) {
    restOff();
    if (rpop.sid) rpopHide();
    return;
  }

  const id = c.dataset.id;

  if (rpop.sid === id && rpop.el?.classList.contains('on')) {
    rpop.anchor = c;
    return;
  }

  if (rpop.sid && rpop.sid !== id) rpopHide();
  if (rest.id === id && Math.abs(e.clientX - rest.x) + Math.abs(e.clientY - rest.y) < REST_PX) return;
  clearTimeout(rest.timer);
  Object.assign(rest, { id, x: e.clientX, y: e.clientY });

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
