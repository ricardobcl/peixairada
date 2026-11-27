/** A PR's chip says where it stands, as its row does. */
const tvState = pr => {
  const round = roundOf(pr);

  return round
    ? [round.k, { you: 'your move', let: 'let go', ok: 'answered', them: 'their move' }[round.k]]
    : [pr.state || 'open', pr.state || 'open'];
};

function tvChip(session, sc, pr) {
  const on = sc.on.has(pr.url);
  const [kind, say] = tvState(pr);

  return `<button type="button" class="tvc${on ? ' on' : ''}" data-url="${esc(pr.url)}" aria-pressed="${on}" style="--h:${prHue(session, pr)}" title="${esc(`${pr.label}${pr.title ? ` — ${pr.title}` : ''}\nclick: ${on ? 'out of' : 'into'} the timeline · ⌥-click: ${sc.solo === pr.url && sc.n.on ? 'everything in play again' : 'it alone'} · right-click: more`)}"><i></i>${esc(pr.label.replace(/^.*?#/, '#'))}<span class="st" data-k="${esc(kind)}">${esc(say)}</span></button>`;
}

function tvBarHtml(session, model, sc) {
  // every PR a chip while they are few; past that the ones in play and those switched on, the rest behind +n
  const few = model.prs.length <= TV_LANES;
  const shown = few ? model.prs : model.prs.filter(pr => sc.play.has(pr.url) || sc.on.has(pr.url));
  const rest = model.prs.length - shown.length;

  const all = 2 + model.prs.length;
  const nOn = sc.you + sc.claude + sc.on.size;

  const who = (side, label, tip, hue) =>
    `<button type="button" class="tvc${sc[side] ? ' on' : ''}" data-k="${side}" aria-pressed="${sc[side]}"${hue ? ` style="--h:var(${hue})"` : ''} title="${tip} · ⌥-click: ${sc[side] && !sc[TV_WHO[side]] && !sc.on.size ? 'everything in play again' : 'them alone'} · right-click: more"><i></i>${label}</button>`;

  const seg = (key, value, label) =>
    `<button type="button" data-${key}="${value}" aria-pressed="${sc[key] === value}">${label}</button>`;

  return (
    `<span class="tvchips" role="group" aria-label="What the timeline shows">${who('you', 'You', 'Your prompts')}${who('claude', 'Claude', 'Claude’s turns', '--accent')}${shown.map(pr => tvChip(session, sc, pr)).join('')}${rest ? `<button type="button" class="tvc more" data-k="more" aria-haspopup="menu" title="The chat's other PRs">+${rest} ▾</button>` : ''}</span>` +
    `<button type="button" class="tvscope" aria-haspopup="menu" title="What the timeline shows">Scope ▾ ${nOn} of ${all}</button><span class="tvgap"></span>` +
    `<span class="tvseg" role="group" aria-label="Which turns">${seg('turns', 'all', 'All turns')}${seg('turns', 'about', 'About these')}</span>` +
    `<span class="tvseg" role="group" aria-label="How much">${seg('dens', 'fold', 'Folded')}${seg('dens', 'all', 'Everything')}</span>`
  );
}

/** The chat's PRs as a menu of switches: in play, the others, the ones only mentioned — the chips' overflow, and all of them on a narrow tab. */
function tvMenu(session, at, withChat) {
  const model = tvModel(session);
  const sc = tvScope(session, model);
  const rect = at.getBoundingClientRect();

  const named = pr =>
    !model.roundsOf(pr.url).length &&
    !model.evs.some(event => event.url === pr.url && (event.w === '' || event.k === 'chat'));

  const row = pr => ({
    t: `${pr.label.replace(/^.*?#/, '#')}${pr.title ? ` ${pr.title}` : ''}`,
    sub: tvState(pr)[1],
    on: sc.on.has(pr.url),
    check: true,
    fn: () => tvToggle(session, pr.url),
  });

  const play = model.prs.filter(pr => sc.play.has(pr.url));
  const said = model.prs.filter(pr => !sc.play.has(pr.url) && named(pr));
  const other = model.prs.filter(pr => !play.includes(pr) && !said.includes(pr));

  const group = (title, prs) => (prs.length ? [{ t: title, off: true }, ...prs.map(row)] : []);

  ctxShow(
    [
      ...(withChat
        ? [
            { t: 'You — your prompts', on: sc.you, check: true, fn: () => tvSide(session, 'you') },
            { t: 'Claude — its turns', on: sc.claude, check: true, fn: () => tvSide(session, 'claude') },
            { hr: true },
          ]
        : []),
      ...group('In play', play),
      ...group('Others', other),
      ...group('Mentioned', said),
      { hr: true },
      { t: 'Everything in play', fn: () => tvSet(session, tvAll) },
    ],
    rect.left,
    rect.bottom + 4,
    'tvscope',
  );
}

/** The list: a row per prompt, per turn and per event, in the order they happened, as the narrow lets them in. */
function tvRows(session, model, sc) {
  const rows = [];
  const shown = new Set();

  if (sc.you || sc.claude) {
    for (const turn of model.turns) {
      if (sc.turns === 'about' && ![...turn.about].some(url => sc.on.has(url))) continue;
      if (sc.you && turn.you) rows.push({ k: 'you', ms: turn.ms, o: 0, t: turn });

      if (sc.claude && (turn.tools.length || turn.reply || !turn.closed)) {
        shown.add(turn);
        rows.push({ k: 'cl', ms: Date.parse(turn.end || turn.last), o: 2, t: turn });
      } // Claude's line says its own acts; without it they are rows of their own
    }
  }

  for (const event of model.evs) {
    if (sc.on.has(event.url) && !(event.turn && shown.has(event.turn))) {
      rows.push({ k: 'ev', ms: event.ms, o: 1, e: event, mk: tvMark(model, event) });
    }
  }

  rows.sort((left, right) => left.ms - right.ms || left.o - right.o);
  return sc.dens === 'all' ? rows : tvFold(tvRuns(rows));
}

// Folding (2026-10-17, the study's F1–F3), what keeps a busy PR readable; Everything undoes it, and the turns' one line.
/** F1: one person's events of one kind on one PR in a row — no word of yours or turn between them — are one line,
 *  at the last of them (its move, when it was one), saying how many and from when. An answer or a let-go stands alone. */
function tvRuns(rows) {
  const out = [];
  const last = new Map();

  const alone = row =>
    row.mk.k === 'close' ||
    row.mk.k === 'let' ||
    ['board', 'chat', 'opened', 'merged', 'closed', 'reopened', 'ready'].includes(row.e.k);

  for (const row of rows) {
    if (row.k !== 'ev') {
      last.clear();
      out.push(row);
      continue;
    }

    const key = `${row.e.k} ${row.e.w} ${row.e.s || ''}`;
    const was = last.get(row.e.url);

    if (was && was.key === key && !alone(row) && !alone(was.r)) {
      out.splice(out.lastIndexOf(was.r), 1);

      const run = {
        ...row,
        e: { ...row.e, n: (was.r.e.n || 1) + (row.e.n || 1) },
        from: was.r.from ?? was.r.ms,
        mk: row.mk.k ? row.mk : was.r.mk,
      };

      out.push(run);
      last.set(row.e.url, { key, r: run });
      continue;
    }

    out.push(row);
    last.set(row.e.url, { key, r: row });
  }

  return out;
}

/** F2 and F3: between your words, what is neither a move nor an answer — CI passing alone, or two quiet events or
 *  more — folds to one line saying whose they were, opened by a click; a check that fails, a merge, the chat's own
 *  hand and every move stay out. */
const tvQuiet = row =>
  row.k === 'ev' &&
  !row.mk.k &&
  row.e.k !== 'chat' &&
  row.e.k !== 'board' &&
  !['merged', 'closed', 'reopened', 'ready'].includes(row.e.k);

function tvFold(rows) {
  const out = [];

  for (let index = 0; index < rows.length;) {
    if (!tvQuiet(rows[index])) {
      out.push(rows[index++]);
      continue;
    }

    let end = index;

    while (end < rows.length && tvQuiet(rows[end])) end++;

    const run = rows.slice(index, end);
    const id = `f:${run[0].e.id}`;
    const open = tv.opened.has(id);

    if (run.length > 1 || run[0].e.k === 'ci') {
      out.push({ k: 'fold', ms: run[0].ms, id, items: run, open });
      if (open) out.push(...run.map(row => ({ ...row, inFold: true })));
    } else out.push(run[0]);
    index = end;
  }

  return out;
}

function tvFoldWords(session, model, items) {
  const by = new Map();

  for (const { e: event } of items) {
    const who = event.k === 'ci' ? 'CI' : event.w === '' ? 'you' : event.w || 'GitHub';
    const counts = by.get(event.url) || new Map();

    counts.set(who, (counts.get(who) || 0) + 1);
    by.set(event.url, counts);
  }

  return [...by]
    .map(
      ([url, counts]) =>
        `${pchip(session, model.byUrl.get(url))} ${esc([...counts].map(([who, count]) => (count > 1 ? `${who} ×${count}` : who)).join(', '))}`,
    )
    .join(' · ');
}

/** A PR's lane at a moment: thick inside a round at your move, dashed once that round was let go, thin otherwise. */
function tvStyle(rs, ms) {
  for (const round of rs) {
    const from = Date.parse(round.from);
    const until = round.end ? Date.parse(round.end) : Infinity;

    if (ms >= from && ms < until) return round.let && ms >= Date.parse(round.let) ? 'dash' : 'thick';
  }

  return 'line';
}

/** What a row puts on one lane: the chat's lane its prompts and turns, a PR's its events and the turns that touch it. */
function tvMarkOn(row, has) {
  if (row.k === 'ev') return has(row.e.url) ? (row.inFold ? 'small' : row.mk.k || 'dot') : null;
  if (row.k === 'fold') return !row.open && row.items.some(folded => has(folded.e.url)) ? 'small' : null;
  if (row.k === 'you') return [...row.t.ref].some(has) ? 'ref' : null;
  const act = row.t.acts.find(candidate => has(candidate.url));

  return act ? (row.t.closes?.has(act) ? 'close' : 'dot') : null;
}

function tvLanes(session, model, sc, rows) {
  const urls = model.prs
    .map(pr => pr.url)
    .filter(url => sc.on.has(url) && rows.some(row => tvMarkOn(row, other => other === url)));

  const lanes = [
    ...(rows.some(row => row.k === 'you' || row.k === 'cl') ? [{ chat: true, c: 'var(--muted)' }] : []),
    ...urls.slice(0, TV_LANES).map(url => ({ url, c: prHue(session, model.byUrl.get(url)) })),
    ...(urls.length > TV_LANES ? [{ more: new Set(urls.slice(TV_LANES)), c: 'var(--muted)' }] : []),
  ];

  const cells = rows.map(() => []);

  lanes.forEach((lane, li) => {
    const has = lane.url ? url => url === lane.url : lane.more ? url => lane.more.has(url) : null;

    const marks = rows.map(row =>
      lane.chat ? (row.k === 'you' ? 'you' : row.k === 'cl' ? 'cl' : null) : tvMarkOn(row, has),
    );

    const idx = marks.flatMap((mark, index) => (mark ? [index] : []));

    if (!idx.length) return;

    const open = !!lane.url && ['open', 'draft'].includes(model.byUrl.get(lane.url)?.state);
    const first = idx[0];
    const last = open ? rows.length - 1 : idx.at(-1);

    const st = ms => (lane.url ? tvStyle(model.roundsOf(lane.url), ms) : 'line');

    for (let index = first; index <= last; index++) {
      cells[index][li] = {
        up: index > first ? st(rows[index].ms - 1) : null,
        down: index < last || open ? st(rows[index].ms) : null,
        m: marks[index],
      };
    }
  });

  return { L: lanes, cells };
}

const tvLaneHtml = (lanes, cells) =>
  lanes
    .map((lane, index) => {
      const cell = cells[index];

      return `<span class="ln" style="--c:${lane.c}">${cell ? `${cell.up ? `<b class="u ${cell.up}"></b>` : ''}${cell.down ? `<b class="d ${cell.down}"></b>` : ''}${cell.m ? `<em class="${cell.m}"></em>` : ''}` : ''}</span>`;
    })
    .join('');

const tvHm = ms => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

const tvWork = ms =>
  ms < 60_000
    ? `${Math.max(1, Math.round(ms / 1000))}s`
    : ms < 3600_000
      ? `${Math.round(ms / 60_000)}m`
      : `${Math.floor(ms / 3600_000)}h ${String(Math.round((ms % 3600_000) / 60_000)).padStart(2, '0')}m`;

/** Words as a line of the timeline: one line of plain text, a GitHub PR's URL its repo#n, the chat's own its chip. */
function tvText(session, text, max) {
  let line = String(text || '')
    .replace(/```[\s\S]*?(```|$)/g, ' ')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s*(#+|>|[-*+]|\d+\.)\s+/gm, '')
    .replace(/(\*\*|__)/g, '')
    .replace(/https:\/\/github\.com\/[\w.-]+\/([\w.-]+)\/(?:pull|issues)\/(\d+)(?:[/?#][^\s)]*)?/g, '$1#$2')
    .replace(/\bhttps?:\/\//g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (line.length > max) line = `${line.slice(0, max - 1).trimEnd()}…`;

  const byLabel = new Map((session.prs || []).filter(pr => pr.number).map(pr => [pr.label.toLowerCase(), pr]));
  const nums = new Map((session.prs || []).filter(pr => pr.number).map(pr => [String(pr.number), pr]));

  return ticks(esc(line)).replace(/(^|[\s(])([\w.-]+)?#(\d+)\b/g, (whole, pre, repo, number) => {
    const pr = repo ? byLabel.get(`${repo}#${number}`.toLowerCase()) : nums.get(number);

    return pr ? pre + pchip(session, pr) : whole;
  });
}

const tvSentence = text => {
  const plain = String(text || '')
    .replace(/```[\s\S]*?(```|$)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return /^.{12,240}?[.!?](?=\s|$)/.exec(plain)?.[0] || plain.slice(0, 240);
};

/** A turn as one line (F4): how long it worked, what it edited, what it did to a PR and the round that answered. */
function tvTurnSum(session, model, turn) {
  const parts = [];
  const live = !turn.closed && session.status === 'working' && turn === model.turns.at(-1);

  parts.push(
    live
      ? `<span class="tvat">at work <span data-at="${esc(turn.at)}"></span></span>`
      : !turn.closed
        ? 'stopped'
        : turn.cut
          ? 'interrupted'
          : turn.worked
            ? `worked ${tvWork(turn.worked)}`
            : 'replied',
  );

  const edits = turn.tools.filter(call => TV_EDITS.has(call.name)).length;

  if (edits) parts.push(many(edits, 'edit'));
  else if (turn.tools.length) parts.push(many(turn.tools.length, 'tool call'));

  for (const act of turn.acts) {
    const pr = model.byUrl.get(act.url);
    const mk = tvMark(model, act);

    if (!pr) continue;

    parts.push(
      `${esc(EV_SAY(act).replace(/ it$/, ''))} ${pchip(session, pr)}${mk.k === 'close' ? ` <span class="ok">✓ answers ${esc(mk.r.why)}</span>` : ''}`,
    );
  }

  return parts.join(' · ');
}

/** Who did it, before what they did: you (on GitHub, from this chat or another, on the board), a person, or no one. */
const tvWho = (session, event) =>
  event.k === 'chat'
    ? '<b>you</b> '
    : event.k === 'board' || event.w === ''
      ? '<b>you</b> '
      : event.w
        ? `<b>${esc(event.w)}</b> `
        : '';

const tvFrom = (session, event) =>
  event.k === 'chat' ? (event.c === session.id ? ' from this chat' : ' from another chat') : '';

function tvRowHtml(session, model, sc, row, lanes, faces) {
  const tm = `<span class="tm">${row.k === 'fold' ? '' : esc(tvHm(row.ms))}</span><span class="lns" aria-hidden="true">${lanes}</span>`;

  if (row.k === 'you') {
    return `<div class="tvr you" data-ms="${row.ms}" data-ts="${esc(row.t.at)}">${tm}<div class="ct"><span class="who">You</span><span class="bub">${tvText(session, row.t.you, 600)}</span></div></div>`;
  }

  if (row.k === 'cl') {
    // Everything: the reply's first lines and each call, not the turn's one line (F4)
    const all = sc.dens === 'all';

    const tools =
      all && row.t.tools.length
        ? `<span class="tools">${row.t.tools
            .slice(0, 12)
            .map(call => `<span>${esc(toolName(call.name))} ${esc(pathTail(call.text || '', session.cwd))}</span>`)
            .join('')}${row.t.tools.length > 12 ? `<span>… ${row.t.tools.length - 12} more</span>` : ''}</span>`
        : '';

    return `<div class="tvr cl" data-ms="${row.ms}" data-ts="${esc(row.t.at)}" data-urls="${esc(row.t.acts.map(act => act.url).join(' '))}" title="Show this turn in the transcript">${tm}<div class="ct"><span class="who">Claude</span><span class="sum">${tvTurnSum(session, model, row.t)}</span>${tools}${row.t.reply ? `<span class="rep${all ? ' all' : ''}">${tvText(session, all ? row.t.reply : tvSentence(row.t.reply), all ? 600 : 240)}</span>` : ''}</div></div>`;
  }

  if (row.k === 'fold') {
    return `<div class="tvr fold" data-fold="${esc(row.id)}" data-ms="${row.ms}" role="button" aria-expanded="${row.open}" tabindex="0" title="${row.open ? 'Fold them again' : 'Show them'}">${tm}<div class="ct">${row.open ? '▾' : '▸'} ${row.items.length} more · ${tvFoldWords(session, model, row.items)}</div></div>`;
  }

  const event = row.e;
  const pr = model.byUrl.get(event.url);
  const mk = row.mk;

  const tag =
    mk.k === 'move'
      ? RTAG.you
      : mk.k === 'close'
        ? `<span class="ok">✓ answers ${esc(mk.r.why)}</span>`
        : mk.k === 'let'
          ? RTAG.let
          : '';

  return `<div class="tvr ev${mk.live ? ' live' : ''}" data-ms="${row.ms}" data-id="${esc(event.id)}" data-url="${esc(event.url)}"${event.u ? ` data-u="${esc(event.u)}" title="Open it on GitHub"` : ''}>${tm}<div class="ct">${evMark(event, faces)}${pchip(session, pr)}<span class="w${mk.k === 'bad' ? ' bad' : ''}">${tvWho(session, event)}${esc(event.w === null ? EV_SAY(event).replace(/ it$/, '') : EV_SAY(event))}${tvFrom(session, event)}${row.from ? ` <span class="span">${esc(tvHm(row.from))}–${esc(tvHm(row.ms))}</span>` : ''}</span>${tag}</div></div>`;
}

/** The foot: where each PR shown stands — its round now, the one before, and a way to it. */
function tvNowHtml(session, model, sc) {
  const rows = model.prs
    .filter(pr => sc.on.has(pr.url))
    .map(pr => ({ pr, r: roundOf(pr) }))
    .filter(entry => entry.r && (entry.r.k !== 'them' || entry.r.prev));

  return rows.length
    ? `<div class="tvnow">${rows.map(({ pr, r: round }) => `<div class="tvnr" data-k="${round.k}" data-url="${esc(pr.url)}">${pchip(session, pr)}${RTAG[round.k] || ''}<span class="say">${roundSay(session, pr, round)}</span>${round.prev ? `<span class="was">before: ${esc(prevWords(round.prev, session))}</span>` : ''}${round.k === 'them' ? '' : `<button type="button" class="tvgo" data-go="${esc(pr.url)}">${round.k === 'you' ? 'to the move' : 'show'}</button>`}</div>`).join('')}</div>`
    : '';
}

// The tracks (2026-10-17, the study's T3; DevTools' tracks on one clock, Honeycomb's markers): the chat as a row — your
// words as ticks, Claude's work as bars — and each PR the narrow shows as one — its rounds as bars (the accent while at
// your move, green up to your answer, dashed once let go) and its events as dots —, on one time axis: the chat's span,
// the last six hours at most. The pointer draws a line through every row and says what happened at that minute; a
// click keeps it. At the head of the timeline (the PR list's head too, 2026-10-17 to 2026-10-21). The markup holds
// times alone, placed by fillAges (fillTracks), so the clock rebuilds nothing.
function tvTracksHtml(session, model, sc) {
  const rows = [];
  const firsts = [];

  const sayOf = (event, pr) =>
    `${pr.label.replace(/^.*?#/, '#')} ${event.k === 'chat' || event.k === 'board' || event.w === '' ? 'you ' : event.w ? `${event.w} ` : ''}${event.w === null ? EV_SAY(event).replace(/ it$/, '') : EV_SAY(event)}`;

  if ((sc.you || sc.claude) && model.turns.length) {
    firsts.push(model.turns[0].ms);

    rows.push(
      `<div class="tk3" data-row="chat"><span class="tl3">${sc.you && sc.claude ? 'Chat' : sc.you ? 'You' : 'Claude'}</span><span class="tp3">${model.turns.map(turn => `${!sc.claude ? '' : `<i class="tw" data-a="${esc(turn.at)}" data-b="${esc(turn.end || '')}" data-say="Claude at work"></i>`}${sc.you && turn.you ? `<i class="ty" data-a="${esc(turn.at)}" data-say="${esc(`you: ${String(turn.you).replace(/\s+/g, ' ').slice(0, 80)}`)}"></i>` : ''}`).join('')}</span></div>`,
    );
  }

  for (const pr of model.prs.filter(candidate => sc.on.has(candidate.url))) {
    const evs = model.evs.filter(
      event => event.url === pr.url && (sc.dens === 'all' || event.k !== 'ci' || event.s === 'fail'),
    );

    const rs = model.roundsOf(pr.url);

    firsts.push(...evs.map(event => event.ms), ...rs.map(round => Date.parse(round.from)));

    const bars = rs
      .map(round => {
        const end = esc(round.end || '');
        const kind = round.how === 'answered' ? 'ok' : round.how === 'let go' ? 'let' : !round.end ? 'you' : 'gone';

        return round.let
          ? `<i class="tb you" data-a="${esc(round.from)}" data-b="${esc(round.let)}"></i><i class="tb let" data-a="${esc(round.let)}" data-b="${end}"></i>`
          : `<i class="tb ${kind}" data-a="${esc(round.from)}" data-b="${end}"></i>`;
      })
      .join('');

    const dots = evs
      .map(event => {
        const mk = tvMark(model, event);

        return `<i class="td${mk.k === 'move' ? ' mv' : ''}${event.k === 'ci' ? (event.s === 'fail' ? ' bad' : ' au') : ''}" data-a="${esc(event.a)}" data-say="${esc(sayOf(event, pr))}"></i>`;
      })
      .join('');

    rows.push(
      `<div class="tk3" data-row="${esc(pr.url)}" data-name="${esc(pr.label.replace(/^.*?#/, '#'))}"><span class="tl3">${pchip(session, pr)}</span><span class="tp3" style="--h:${prHue(session, pr)}">${bars}${dots}</span></div>`,
    );
  }

  if (!rows.length || !firsts.length) return '';
  const from = new Date(model.turns[0]?.ms || Math.min(...firsts)).toISOString();

  return `<div class="tvtrk3" data-from="${from}" aria-hidden="true">${rows.join('')}<span class="tnf" hidden></span><span class="tax"></span><i class="txh" hidden></i></div><div class="tsay" aria-hidden="true">the pointer over the rows says what happened when · a click keeps it</div>`;
}

const TRACK_MS = 6 * 3600_000;

function fillTracks(el) {
  const now = Date.now();
  const from = Date.parse(el.dataset.from) || now;

  const t0 = Math.min(Math.max(from, now - TRACK_MS), now - 3600_000);
  const span = now - t0;
  const percentAt = ms => ((ms - t0) / span) * 100; // an hour at least

  el._t0 = t0;
  el._span = span;
  const gone = [];

  for (const row of el.querySelectorAll('.tk3[data-row]')) {
    let any = false;

    for (const mark of row.querySelectorAll('i[data-a]')) {
      const start = Date.parse(mark.dataset.a);
      const bar = 'b' in mark.dataset;
      const end = bar ? Date.parse(mark.dataset.b) || now : start;
      const off = end < t0 || start > now;

      if (mark.hidden !== off) mark.hidden = off;
      if (off) continue;
      any = true;
      const left = `${Math.max(0, percentAt(start)).toFixed(2)}%`;

      if (mark.style.left !== left) mark.style.left = left;

      if (bar) {
        const width = `${Math.max(0.5, percentAt(end) - Math.max(0, percentAt(start))).toFixed(2)}%`;

        if (mark.style.width !== width) mark.style.width = width;
      }
    }

    if (row.hidden === any) row.hidden = !any; // a row with nothing in the window folds
    if (!any && row.dataset.name) gone.push(row.dataset.name);
  }

  const nf = el.querySelector('.tnf');
  const say = gone.length ? `${gone.join(' ')} — nothing in the last ${Math.round(span / 3600_000)} h` : '';

  if (nf.textContent !== say) nf.textContent = say;
  nf.hidden = !say;
  const step = span <= 2 * 3600_000 ? 1800_000 : span <= 4 * 3600_000 ? 3600_000 : 7200_000;
  let html = '';

  for (let time = Math.ceil(t0 / step) * step; time < now - step / 3; time += step) {
    html += `<span style="left:${percentAt(time).toFixed(2)}%">${esc(tvHm(time))}</span>`;
  }

  html += '<span class="nw" style="left:100%">now</span>';
  const ax = el.querySelector('.tax');

  if (ax._h !== html) ax.innerHTML = ax._h = html;
}

/** The line through the rows at a minute, and what happened there — within a few pixels' worth of time. */
function tvCrossAt(el, ms, kept) {
  const plot = el.querySelector('.tk3:not([hidden]) .tp3');
  const xh = el.querySelector('.txh');
  const say = el.nextElementSibling;

  if (!plot || !el._span) return;

  const rect = plot.getBoundingClientRect();
  const box = el.getBoundingClientRect();
  const tol = (el._span * 6) / rect.width;
  const words = [];

  xh.hidden = false;
  xh.style.left = `${rect.left - box.left + ((ms - el._t0) / el._span) * rect.width}px`;

  for (const mark of el.querySelectorAll('.tk3:not([hidden]) i[data-say]:not([hidden])')) {
    const start = Date.parse(mark.dataset.a);
    const end = 'b' in mark.dataset ? Date.parse(mark.dataset.b) || Date.now() : start;

    if (mark.classList.contains('tw') ? ms > start + tol && ms < end : Math.abs(ms - start) <= tol) {
      words.push(mark.dataset.say);
    }
  }

  say.innerHTML = `<b>${esc(tvHm(ms))}</b>${kept ? ' · kept' : ''} · ${words.length ? esc([...new Set(words)].join(' · ')) : 'nothing within a few minutes'}`;
}

function tvCrossOff(el) {
  if (el._kept != null) return tvCrossAt(el, el._kept, true);
  el.querySelector('.txh').hidden = true;
  el.nextElementSibling.textContent = 'the pointer over the rows says what happened when · a click keeps it';
}

const tvMsAt = (el, event) => {
  const plot = el.querySelector('.tk3:not([hidden]) .tp3');

  if (!plot || !el._span) return null;
  const rect = plot.getBoundingClientRect();

  return event.clientX < rect.left || event.clientX > rect.right
    ? null
    : el._t0 + ((event.clientX - rect.left) / rect.width) * el._span;
};

for (const host of ['#tv']) {
  $(host).addEventListener('pointermove', event => {
    const el = event.target.closest?.('.tvtrk3');

    if (!el) return;
    const ms = tvMsAt(el, event);

    if (ms == null) tvCrossOff(el);
    else tvCrossAt(el, ms, false);
  });

  $(host).addEventListener('pointerout', event => {
    const el = event.target.closest?.('.tvtrk3');

    if (el && !el.contains(event.relatedTarget)) tvCrossOff(el);
  });

  $(host).addEventListener('click', event => {
    const el = event.target.closest?.('.tvtrk3');

    if (!el) return;
    const ms = tvMsAt(el, event);

    el._kept = ms == null || el._kept != null ? null : ms;
    if (el._kept == null) tvCrossOff(el);
    else tvCrossAt(el, ms, true);
  });
}

let tvFrame = 0;

function tvSoon() {
  if (!tvFrame && !$('#tv').hidden) {
    tvFrame = requestAnimationFrame(() => {
      tvFrame = 0;
      const session = state.sessions.get(state.current);

      if (session && !$('#tv').hidden) renderTimeline(session);
    });
  }
} // no tab on show, no frame asked for

function renderTimeline(session) {
  const el = $('#tv');

  if (el.hidden || !session) return;

  if (!el.firstElementChild) {
    el.innerHTML =
      '<div class="tvbar"></div><div class="tvtrk" hidden></div><div class="tvl" aria-label="This chat and its PRs, in the order things happened"></div>';
  }

  const model = tvModel(session);
  const sc = tvScope(session, model);
  const rows = tvRows(session, model, sc);
  const { L: lanes, cells } = tvLanes(session, model, sc, rows);

  setHtml(el.querySelector('.tvbar'), tvBarHtml(session, model, sc));

  const trk = el.querySelector('.tvtrk');
  const th = tvTracksHtml(session, model, sc);

  setHtml(trk, th);
  trk.hidden = !th;
  fillAges(trk);

  const faces = new Map(
    model.prs.flatMap(pr =>
      (pr.people || []).filter(person => person.avatar).map(person => [person.login, person.avatar]),
    ),
  );

  let html = '';
  let day = null;

  rows.forEach((row, index) => {
    const rowDay = dayOf(row.ms);

    if (rowDay !== day && (day !== null || rowDay !== 'Today')) {
      html += `<div class="tvday"><b>${esc(rowDay)}</b></div>`;
    }

    day = rowDay;
    html += tvRowHtml(session, model, sc, row, tvLaneHtml(lanes, cells[index]), faces);
  });

  if (!rows.length) {
    html = `<div class="tvnone">${!sc.you && !sc.claude && !sc.on.size ? 'Nothing in the narrow — ⌥-click a chip for everything in play' : model.turns.length || model.prs.length ? 'Nothing here yet' : 'No messages yet'}</div>`;
  }

  // a ledger that let its oldest go (it keeps 150 a PR): the rest is GitHub's
  const old = model.prs.filter(pr => sc.on.has(pr.url) && model.led.get(pr.url)?.older);

  if (old.length) {
    html = `<div class="tvold">${old.map(pr => `<button type="button" class="tvgh" data-u="${esc(pr.url)}">older on ${pchip(session, pr)} — on GitHub ↗</button>`).join('')}</div>${
      html
    }`;
  }

  html += tvNowHtml(session, model, sc);

  const list = el.querySelector('.tvl');
  const lw = `${Math.max(1, lanes.length) * 14}px`;

  const lit = tv.lit?.id === session.id && performance.now() - tv.lit.t < TV_LIT_MS ? tv.lit : null; // gone to a move a moment ago: stay there
  const stick = !lit && (list._sid !== session.id || list.scrollHeight - list.scrollTop - list.clientHeight < 40);

  if (list.style.getPropertyValue('--lw') !== lw) list.style.setProperty('--lw', lw);

  if (setHtml(list, html) || list._sid !== session.id) {
    fillAges(list);
    if (stick) list.scrollTop = list.scrollHeight;
    else if (lit) tvLight(list, lit);
  }

  list._sid = session.id;

  // the move gone to once the ledgers and the chat's own entries are both in (2026-10-17): from a card, the chat's
  // transcript lands after the ledger, and its turns, drawn in, pushed the move out of sight
  if (tv.goto?.id === session.id && tv.log && logOf.id === session.id) {
    const target = tv.goto;

    tv.goto = null;
    tvGo(session, target.url);
  }
}

const TV_LIT_MS = 2000;

/** The row gone to, found again in the list as it now stands, put in the middle and lit — carried on, not restarted. */
function tvLight(list, lit) {
  const els = [...list.querySelectorAll('.tvr[data-ms]')].filter(
    row => row.dataset.url === lit.url || (row.dataset.urls || '').split(' ').includes(lit.url),
  );

  const el = els.sort((left, right) => Math.abs(left.dataset.ms - lit.at) - Math.abs(right.dataset.ms - lit.at))[0];

  if (!el) return null;
  el.scrollIntoView({ block: 'center', behavior: lit.smooth && !REDUCED.matches ? 'smooth' : 'auto' });
  el.style.animationDelay = `${-Math.round(performance.now() - lit.t)}ms`;
  el.classList.remove('flash');
  void el.offsetWidth;
  el.classList.add('flash');
  return el;
}

/** To a PR's round in the list: the move that opened it, where it was let go, or what answered it — lit a moment. */
function tvGo(session, url) {
  const pr = (session.prs || []).find(candidate => candidate.url === url);
  const round = pr && roundOf(pr);
  const list = $('#tv .tvl');

  if (!list) return;

  const at = round?.cur
    ? Date.parse(
        round.k === 'you'
          ? round.cur.from
          : round.k === 'let'
            ? round.cur.let || round.cur.from
            : round.cur.end || round.cur.from,
      )
    : Infinity;

  tv.lit = { id: session.id, url, at, t: performance.now(), smooth: true };
  if (!tvLight(list, tv.lit)) {
    tv.lit = null;
    note(seen($('#tv')), `Nothing of ${pr ? pr.label : 'that PR'} in the timeline yet`);
  } else tv.lit.smooth = false;
}

/** A turn clicked: the transcript beside the timeline, at that turn. Under a drawer that runs it is out of sight. */
function tvShowTurn(session, ts, from) {
  if (termLive(session)) {
    return note(from, 'The transcript is under Claude’s drawer while it runs here — ⌥⌘C shows Claude');
  }

  if (!isSplit(session)) splitChat(session, true);
  else if (!placeOf(session).includes('chat')) setTab(session, 'chat');
  focusG = homeOf(session, 'timeline');
  syncTerm(session);

  const log = $('#log');
  const msgs = [...log.querySelectorAll('.msg[data-ts]')];

  const hit = msgs.find(message => message.dataset.ts === ts) || msgs.find(message => message.dataset.ts > ts);

  if (!hit) return;
  hit.scrollIntoView({ block: 'start', behavior: REDUCED.matches ? 'auto' : 'smooth' });
  hit.classList.remove('tvhit');
  void hit.offsetWidth;
  hit.classList.add('tvhit');
}

$('#tv').addEventListener('click', event => {
  const session = state.sessions.get(state.current);

  if (!session) return;
  const go = event.target.closest('.tvgo');

  if (go) return tvGo(session, go.dataset.go);
  const chip = event.target.closest('.tvc');

  if (chip?.dataset.url) return event.altKey ? tvSolo(session, chip.dataset.url) : tvToggle(session, chip.dataset.url);
  if (TV_WHO[chip?.dataset.k]) return event.altKey ? tvSolo(session, chip.dataset.k) : tvSide(session, chip.dataset.k);

  if (chip?.dataset.k === 'more' || event.target.closest('.tvscope')) {
    return tvMenu(session, chip || event.target.closest('.tvscope'), !chip);
  }

  const sg = event.target.closest('.tvseg button');

  if (sg?.dataset.turns) return tvSet(session, { turns: sg.dataset.turns });
  if (sg?.dataset.dens) return tvSet(session, { dens: sg.dataset.dens === 'fold' ? undefined : sg.dataset.dens });
  const cl = event.target.closest('.tvr.cl');

  if (cl) return tvShowTurn(session, cl.dataset.ts, cl);
  const fold = event.target.closest('.tvr.fold');

  if (fold) {
    if (!tv.opened.delete(fold.dataset.fold)) tv.opened.add(fold.dataset.fold);
    return renderTimeline(session);
  }

  const ev = event.target.closest('.tvr.ev[data-u], .tvgh');

  if (ev) return openExternal(ev.dataset.u, { s: session });
});

for (const ev of ['wheel', 'pointerdown']) {
  $('#tv').addEventListener(
    ev,
    () => {
      tv.lit = null;
    },
    { passive: true },
  );
} // a hand on the list: its place is the hand's

$('#tv').addEventListener('keydown', event => {
  if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('.tvr.fold')) {
    event.preventDefault();
    event.target.click();
  }
}); // a fold is a button

/** The element into the half that shows the tab, its place in the list kept as it moves. */
function placeTimeline(session, place) {
  const el = $('#tv');
  const half = session ? place.indexOf('timeline') : -1;

  if (half < 0) {
    el.hidden = true;
    return;
  }

  const host = $(GEL[half].body);
  const list = el.querySelector('.tvl');
  const top = list?.scrollTop;

  if (el.parentElement !== host) {
    host.insertBefore(el, host.firstChild);
    if (list) list.scrollTop = top;
  }

  const was = el.hidden;

  el.hidden = false;

  if (!prefs.tvSeen) {
    prefs.tvSeen = true;
    savePrefs();
    $('#tvHint')?.remove();
  }

  if (was || el._sid !== session.id) {
    el._sid = session.id;
    renderTimeline(session);
  } else tvSoon();
}

function hotTimeline() {
  const session = state.sessions.get(state.current);

  if (!session) return noChat();
  if (!timelineOpen.has(session.id)) {
    timelineOpen.add(session.id);
    openNewTab(session, 'timeline');
  } else setTab(session, 'timeline');
  syncTerm(session);
  focusBoard();
}

function hotTimelineKey() {
  return zoomAgain(key => key === 'timeline') || hotTimeline();
}
