  /** A PR's chip says where it stands, as its row does. */
  const tvState = pr => { const r = roundOf(pr); return r ? [r.k, { you: 'your move', let: 'let go', ok: 'answered', them: 'their move' }[r.k]] : [pr.state || 'open', pr.state || 'open']; };
  function tvChip(s, sc, p) {
    const on = sc.on.has(p.url), [k, w] = tvState(p);
    return `<button type="button" class="tvc${on ? ' on' : ''}" data-url="${esc(p.url)}" aria-pressed="${on}" style="--h:${prHue(s, p)}" title="${esc(`${p.label}${p.title ? ` — ${p.title}` : ''}\nclick: ${on ? 'out of' : 'into'} the timeline · ⌥-click: ${sc.solo === p.url && sc.n.on ? 'everything in play again' : 'it alone'} · right-click: more`)}"><i></i>${esc(p.label.replace(/^.*?#/, '#'))}<span class="st" data-k="${esc(k)}">${esc(w)}</span></button>`;
  }
  function tvBarHtml(s, m, sc) {
    // every PR a chip while they are few; past that the ones in play and those switched on, the rest behind +n
    const few = m.prs.length <= TV_LANES, shown = few ? m.prs : m.prs.filter(p => sc.play.has(p.url) || sc.on.has(p.url)), rest = m.prs.length - shown.length;
    const all = 2 + m.prs.length, nOn = sc.you + sc.claude + sc.on.size;
    const who = (w, t, tip, h) => `<button type="button" class="tvc${sc[w] ? ' on' : ''}" data-k="${w}" aria-pressed="${sc[w]}"${h ? ` style="--h:var(${h})"` : ''} title="${tip} · ⌥-click: ${sc[w] && !sc[TV_WHO[w]] && !sc.on.size ? 'everything in play again' : 'them alone'} · right-click: more"><i></i>${t}</button>`;
    const seg = (key, v, w) => `<button type="button" data-${key}="${v}" aria-pressed="${sc[key] === v}">${w}</button>`;
    return `<span class="tvchips" role="group" aria-label="What the timeline shows">${who('you', 'You', 'Your prompts')}${who('claude', 'Claude', 'Claude’s turns', '--accent')}${shown.map(p => tvChip(s, sc, p)).join('')}${rest ? `<button type="button" class="tvc more" data-k="more" aria-haspopup="menu" title="The chat's other PRs">+${rest} ▾</button>` : ''}</span>`
      + `<button type="button" class="tvscope" aria-haspopup="menu" title="What the timeline shows">Scope ▾ ${nOn} of ${all}</button><span class="tvgap"></span>`
      + `<span class="tvseg" role="group" aria-label="Which turns">${seg('turns', 'all', 'All turns')}${seg('turns', 'about', 'About these')}</span>`
      + `<span class="tvseg" role="group" aria-label="How much">${seg('dens', 'fold', 'Folded')}${seg('dens', 'all', 'Everything')}</span>`;
  }
  /** The chat's PRs as a menu of switches: in play, the others, the ones only mentioned — the chips' overflow, and all of them on a narrow tab. */
  function tvMenu(s, at, withChat) {
    const m = tvModel(s), sc = tvScope(s, m), r = at.getBoundingClientRect();
    const named = p => !m.roundsOf(p.url).length && !m.evs.some(e => e.url === p.url && (e.w === '' || e.k === 'chat'));
    const row = p => ({ t: `${p.label.replace(/^.*?#/, '#')}${p.title ? ` ${p.title}` : ''}`, sub: tvState(p)[1], on: sc.on.has(p.url), check: true, fn: () => tvToggle(s, p.url) });
    const play = m.prs.filter(p => sc.play.has(p.url)), said = m.prs.filter(p => !sc.play.has(p.url) && named(p)), other = m.prs.filter(p => !play.includes(p) && !said.includes(p));
    const group = (t, l) => l.length ? [{ t, off: true }, ...l.map(row)] : [];
    ctxShow([...withChat ? [{ t: 'You — your prompts', on: sc.you, check: true, fn: () => tvSide(s, 'you') }, { t: 'Claude — its turns', on: sc.claude, check: true, fn: () => tvSide(s, 'claude') }, { hr: true }] : [],
      ...group('In play', play), ...group('Others', other), ...group('Mentioned', said), { hr: true }, { t: 'Everything in play', fn: () => tvSet(s, tvAll) }], r.left, r.bottom + 4, 'tvscope');
  }
  /** The list: a row per prompt, per turn and per event, in the order they happened, as the narrow lets them in. */
  function tvRows(s, m, sc) {
    const rows = [], shown = new Set();
    if (sc.you || sc.claude) for (const t of m.turns) {
      if (sc.turns === 'about' && ![...t.about].some(u => sc.on.has(u))) continue;
      if (sc.you && t.you) rows.push({ k: 'you', ms: t.ms, o: 0, t });
      if (sc.claude && (t.tools.length || t.reply || !t.closed)) { shown.add(t); rows.push({ k: 'cl', ms: Date.parse(t.end || t.last), o: 2, t }); }   // Claude's line says its own acts; without it they are rows of their own
    }
    for (const e of m.evs) if (sc.on.has(e.url) && !(e.turn && shown.has(e.turn))) rows.push({ k: 'ev', ms: e.ms, o: 1, e, mk: tvMark(m, e) });
    rows.sort((a, b) => a.ms - b.ms || a.o - b.o);
    return sc.dens === 'all' ? rows : tvFold(tvRuns(rows));
  }
  // Folding (2026-10-17, the study's F1–F3), what keeps a busy PR readable; Everything undoes it, and the turns' one line.
  /** F1: one person's events of one kind on one PR in a row — no word of yours or turn between them — are one line,
   *  at the last of them (its move, when it was one), saying how many and from when. An answer or a let-go stands alone. */
  function tvRuns(rows) {
    const out = [], last = new Map();
    const alone = r => r.mk.k === 'close' || r.mk.k === 'let' || ['board', 'chat', 'opened', 'merged', 'closed', 'reopened', 'ready'].includes(r.e.k);
    for (const r of rows) {
      if (r.k !== 'ev') { last.clear(); out.push(r); continue; }
      const key = `${r.e.k} ${r.e.w} ${r.e.s || ''}`, was = last.get(r.e.url);
      if (was && was.key === key && !alone(r) && !alone(was.r)) {
        out.splice(out.lastIndexOf(was.r), 1);
        const run = { ...r, e: { ...r.e, n: (was.r.e.n || 1) + (r.e.n || 1) }, from: was.r.from ?? was.r.ms, mk: r.mk.k ? r.mk : was.r.mk };
        out.push(run); last.set(r.e.url, { key, r: run }); continue;
      }
      out.push(r); last.set(r.e.url, { key, r });
    }
    return out;
  }
  /** F2 and F3: between your words, what is neither a move nor an answer — CI passing alone, or two quiet events or
   *  more — folds to one line saying whose they were, opened by a click; a check that fails, a merge, the chat's own
   *  hand and every move stay out. */
  const tvQuiet = r => r.k === 'ev' && !r.mk.k && r.e.k !== 'chat' && r.e.k !== 'board' && !['merged', 'closed', 'reopened', 'ready'].includes(r.e.k);
  function tvFold(rows) {
    const out = [];
    for (let i = 0; i < rows.length;) {
      if (!tvQuiet(rows[i])) { out.push(rows[i++]); continue; }
      let j = i; while (j < rows.length && tvQuiet(rows[j])) j++;
      const run = rows.slice(i, j), id = 'f:' + run[0].e.id, open = tv.opened.has(id);
      if (run.length > 1 || run[0].e.k === 'ci') { out.push({ k: 'fold', ms: run[0].ms, id, items: run, open }); if (open) out.push(...run.map(r => ({ ...r, inFold: true }))); }
      else out.push(run[0]);
      i = j;
    }
    return out;
  }
  function tvFoldWords(s, m, items) {
    const by = new Map();
    for (const { e } of items) { const w = e.k === 'ci' ? 'CI' : e.w === '' ? 'you' : e.w || 'GitHub', c = by.get(e.url) || new Map(); c.set(w, (c.get(w) || 0) + 1); by.set(e.url, c); }
    return [...by].map(([u, c]) => `${pchip(s, m.byUrl.get(u))} ${esc([...c].map(([w, n]) => n > 1 ? `${w} ×${n}` : w).join(', '))}`).join(' · ');
  }
  /** A PR's lane at a moment: thick inside a round at your move, dashed once that round was let go, thin otherwise. */
  function tvStyle(rs, ms) {
    for (const r of rs) {
      const a = Date.parse(r.from), b = r.end ? Date.parse(r.end) : Infinity;
      if (ms >= a && ms < b) return r.let && ms >= Date.parse(r.let) ? 'dash' : 'thick';
    }
    return 'line';
  }
  /** What a row puts on one lane: the chat's lane its prompts and turns, a PR's its events and the turns that touch it. */
  function tvMarkOn(r, has) {
    if (r.k === 'ev') return has(r.e.url) ? (r.inFold ? 'small' : r.mk.k || 'dot') : null;
    if (r.k === 'fold') return !r.open && r.items.some(x => has(x.e.url)) ? 'small' : null;
    if (r.k === 'you') return [...r.t.ref].some(has) ? 'ref' : null;
    const a = r.t.acts.find(x => has(x.url)); return a ? (r.t.closes?.has(a) ? 'close' : 'dot') : null;
  }
  function tvLanes(s, m, sc, rows) {
    const urls = m.prs.map(p => p.url).filter(u => sc.on.has(u) && rows.some(r => tvMarkOn(r, x => x === u)));
    const L = [...(rows.some(r => r.k === 'you' || r.k === 'cl') ? [{ chat: true, c: 'var(--muted)' }] : []),
      ...urls.slice(0, TV_LANES).map(u => ({ url: u, c: prHue(s, m.byUrl.get(u)) })),
      ...(urls.length > TV_LANES ? [{ more: new Set(urls.slice(TV_LANES)), c: 'var(--muted)' }] : [])];
    const cells = rows.map(() => []);
    L.forEach((l, li) => {
      const has = l.url ? u => u === l.url : l.more ? u => l.more.has(u) : null;
      const marks = rows.map(r => l.chat ? (r.k === 'you' ? 'you' : r.k === 'cl' ? 'cl' : null) : tvMarkOn(r, has));
      const idx = marks.flatMap((x, i) => x ? [i] : []); if (!idx.length) return;
      const open = !!l.url && ['open', 'draft'].includes(m.byUrl.get(l.url)?.state), first = idx[0], last = open ? rows.length - 1 : idx.at(-1);
      const st = ms => l.url ? tvStyle(m.roundsOf(l.url), ms) : 'line';
      for (let i = first; i <= last; i++) cells[i][li] = { up: i > first ? st(rows[i].ms - 1) : null, down: i < last || open ? st(rows[i].ms) : null, m: marks[i] };
    });
    return { L, cells };
  }
  const tvLaneHtml = (L, c) => L.map((l, i) => { const x = c[i]; return `<span class="ln" style="--c:${l.c}">${x ? `${x.up ? `<b class="u ${x.up}"></b>` : ''}${x.down ? `<b class="d ${x.down}"></b>` : ''}${x.m ? `<em class="${x.m}"></em>` : ''}` : ''}</span>`; }).join('');
  const tvHm = ms => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const tvWork = ms => ms < 60_000 ? `${Math.max(1, Math.round(ms / 1000))}s` : ms < 3600_000 ? `${Math.round(ms / 60_000)}m` : `${Math.floor(ms / 3600_000)}h ${String(Math.round(ms % 3600_000 / 60_000)).padStart(2, '0')}m`;
  /** Words as a line of the timeline: one line of plain text, a GitHub PR's URL its repo#n, the chat's own its chip. */
  function tvText(s, text, max) {
    let t = String(text || '').replace(/```[\s\S]*?(```|$)/g, ' ').replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/^\s*(#+|>|[-*+]|\d+\.)\s+/gm, '').replace(/(\*\*|__)/g, '')
      .replace(/https:\/\/github\.com\/[\w.-]+\/([\w.-]+)\/(?:pull|issues)\/(\d+)(?:[/?#][^\s)]*)?/g, '$1#$2').replace(/\bhttps?:\/\//g, '').replace(/\s+/g, ' ').trim();
    if (t.length > max) t = t.slice(0, max - 1).trimEnd() + '…';
    const byLabel = new Map((s.prs || []).filter(p => p.number).map(p => [p.label.toLowerCase(), p])), nums = new Map((s.prs || []).filter(p => p.number).map(p => [String(p.number), p]));
    return ticks(esc(t)).replace(/(^|[\s(])([\w.-]+)?#(\d+)\b/g, (x, pre, repo, n) => { const p = repo ? byLabel.get(`${repo}#${n}`.toLowerCase()) : nums.get(n); return p ? pre + pchip(s, p) : x; });
  }
  const tvSentence = t => { const p = String(t || '').replace(/```[\s\S]*?(```|$)/g, ' ').replace(/\s+/g, ' ').trim(); return /^.{12,240}?[.!?](?=\s|$)/.exec(p)?.[0] || p.slice(0, 240); };
  /** A turn as one line (F4): how long it worked, what it edited, what it did to a PR and the round that answered. */
  function tvTurnSum(s, m, t) {
    const parts = [], live = !t.closed && s.status === 'working' && t === m.turns.at(-1);
    parts.push(live ? `<span class="tvat">at work <span data-at="${esc(t.at)}"></span></span>` : !t.closed ? 'stopped' : t.cut ? 'interrupted' : t.worked ? `worked ${tvWork(t.worked)}` : 'replied');
    const edits = t.tools.filter(u => TV_EDITS.has(u.name)).length;
    if (edits) parts.push(many(edits, 'edit')); else if (t.tools.length) parts.push(many(t.tools.length, 'tool call'));
    for (const a of t.acts) {
      const pr = m.byUrl.get(a.url), mk = tvMark(m, a); if (!pr) continue;
      parts.push(`${esc(EV_SAY(a).replace(/ it$/, ''))} ${pchip(s, pr)}${mk.k === 'close' ? ` <span class="ok">✓ answers ${esc(mk.r.why)}</span>` : ''}`);
    }
    return parts.join(' · ');
  }
  /** Who did it, before what they did: you (on GitHub, from this chat or another, on the board), a person, or no one. */
  const tvWho = (s, e) => e.k === 'chat' ? '<b>you</b> ' : e.k === 'board' || e.w === '' ? '<b>you</b> ' : e.w ? `<b>${esc(e.w)}</b> ` : '';
  const tvFrom = (s, e) => e.k === 'chat' ? (e.c === s.id ? ' from this chat' : ' from another chat') : '';
  function tvRowHtml(s, m, sc, r, lanes, faces) {
    const tm = `<span class="tm">${r.k === 'fold' ? '' : esc(tvHm(r.ms))}</span><span class="lns" aria-hidden="true">${lanes}</span>`;
    if (r.k === 'you') return `<div class="tvr you" data-ms="${r.ms}" data-ts="${esc(r.t.at)}">${tm}<div class="ct"><span class="who">You</span><span class="bub">${tvText(s, r.t.you, 600)}</span></div></div>`;
    if (r.k === 'cl') {   // Everything: the reply's first lines and each call, not the turn's one line (F4)
      const all = sc.dens === 'all', tools = all && r.t.tools.length ? `<span class="tools">${r.t.tools.slice(0, 12).map(u => `<span>${esc(toolName(u.name))} ${esc(pathTail(u.text || '', s.cwd))}</span>`).join('')}${r.t.tools.length > 12 ? `<span>… ${r.t.tools.length - 12} more</span>` : ''}</span>` : '';
      return `<div class="tvr cl" data-ms="${r.ms}" data-ts="${esc(r.t.at)}" data-urls="${esc(r.t.acts.map(a => a.url).join(' '))}" title="Show this turn in the transcript">${tm}<div class="ct"><span class="who">Claude</span><span class="sum">${tvTurnSum(s, m, r.t)}</span>${tools}${r.t.reply ? `<span class="rep${all ? ' all' : ''}">${tvText(s, all ? r.t.reply : tvSentence(r.t.reply), all ? 600 : 240)}</span>` : ''}</div></div>`;
    }
    if (r.k === 'fold') return `<div class="tvr fold" data-fold="${esc(r.id)}" data-ms="${r.ms}" role="button" aria-expanded="${r.open}" tabindex="0" title="${r.open ? 'Fold them again' : 'Show them'}">${tm}<div class="ct">${r.open ? '▾' : '▸'} ${r.items.length} more · ${tvFoldWords(s, m, r.items)}</div></div>`;
    const e = r.e, pr = m.byUrl.get(e.url), mk = r.mk;
    const tag = mk.k === 'move' ? RTAG.you : mk.k === 'close' ? `<span class="ok">✓ answers ${esc(mk.r.why)}</span>` : mk.k === 'let' ? RTAG.let : '';
    return `<div class="tvr ev${mk.live ? ' live' : ''}" data-ms="${r.ms}" data-id="${esc(e.id)}" data-url="${esc(e.url)}"${e.u ? ` data-u="${esc(e.u)}" title="Open it on GitHub"` : ''}>${tm}<div class="ct">${evMark(e, faces)}${pchip(s, pr)}<span class="w${mk.k === 'bad' ? ' bad' : ''}">${tvWho(s, e)}${esc(e.w === null ? EV_SAY(e).replace(/ it$/, '') : EV_SAY(e))}${tvFrom(s, e)}${r.from ? ` <span class="span">${esc(tvHm(r.from))}–${esc(tvHm(r.ms))}</span>` : ''}</span>${tag}</div></div>`;
  }
  /** The foot: where each PR shown stands — its round now, the one before, and a way to it. */
  function tvNowHtml(s, m, sc) {
    const rows = m.prs.filter(p => sc.on.has(p.url)).map(pr => ({ pr, r: roundOf(pr) })).filter(x => x.r && (x.r.k !== 'them' || x.r.prev));
    return rows.length ? `<div class="tvnow">${rows.map(({ pr, r }) => `<div class="tvnr" data-k="${r.k}" data-url="${esc(pr.url)}">${pchip(s, pr)}${RTAG[r.k] || ''}<span class="say">${roundSay(s, pr, r)}</span>${r.prev ? `<span class="was">before: ${esc(prevWords(r.prev, s))}</span>` : ''}${r.k === 'them' ? '' : `<button type="button" class="tvgo" data-go="${esc(pr.url)}">${r.k === 'you' ? 'to the move' : 'show'}</button>`}</div>`).join('')}</div>` : '';
  }
  // The tracks (2026-10-17, the study's T3; DevTools' tracks on one clock, Honeycomb's markers): the chat as a row — your
  // words as ticks, Claude's work as bars — and each PR the narrow shows as one — its rounds as bars (the accent while at
  // your move, green up to your answer, dashed once let go) and its events as dots —, on one time axis: the chat's span,
  // the last six hours at most. The pointer draws a line through every row and says what happened at that minute; a
  // click keeps it. At the head of the timeline (the PR list's head too, 2026-10-17 to 2026-10-21). The markup holds
  // times alone, placed by fillAges (fillTracks), so the clock rebuilds nothing.
  function tvTracksHtml(s, m, sc) {
    const rows = [], firsts = [];
    const sayOf = (e, pr) => `${pr.label.replace(/^.*?#/, '#')} ${e.k === 'chat' || e.k === 'board' || e.w === '' ? 'you ' : e.w ? e.w + ' ' : ''}${e.w === null ? EV_SAY(e).replace(/ it$/, '') : EV_SAY(e)}`;
    if ((sc.you || sc.claude) && m.turns.length) {
      firsts.push(m.turns[0].ms);
      rows.push(`<div class="tk3" data-row="chat"><span class="tl3">${sc.you && sc.claude ? 'Chat' : sc.you ? 'You' : 'Claude'}</span><span class="tp3">${m.turns.map(t => `${!sc.claude ? '' : `<i class="tw" data-a="${esc(t.at)}" data-b="${esc(t.end || '')}" data-say="Claude at work"></i>`}${sc.you && t.you ? `<i class="ty" data-a="${esc(t.at)}" data-say="${esc(`you: ${String(t.you).replace(/\s+/g, ' ').slice(0, 80)}`)}"></i>` : ''}`).join('')}</span></div>`);
    }
    for (const p of m.prs.filter(p => sc.on.has(p.url))) {
      const evs = m.evs.filter(e => e.url === p.url && (sc.dens === 'all' || e.k !== 'ci' || e.s === 'fail')), rs = m.roundsOf(p.url);
      firsts.push(...evs.map(e => e.ms), ...rs.map(r => Date.parse(r.from)));
      const bars = rs.map(r => {
        const end = esc(r.end || ''), k = r.how === 'answered' ? 'ok' : r.how === 'let go' ? 'let' : !r.end ? 'you' : 'gone';
        return r.let ? `<i class="tb you" data-a="${esc(r.from)}" data-b="${esc(r.let)}"></i><i class="tb let" data-a="${esc(r.let)}" data-b="${end}"></i>` : `<i class="tb ${k}" data-a="${esc(r.from)}" data-b="${end}"></i>`;
      }).join('');
      const dots = evs.map(e => { const mk = tvMark(m, e); return `<i class="td${mk.k === 'move' ? ' mv' : ''}${e.k === 'ci' ? (e.s === 'fail' ? ' bad' : ' au') : ''}" data-a="${esc(e.a)}" data-say="${esc(sayOf(e, p))}"></i>`; }).join('');
      rows.push(`<div class="tk3" data-row="${esc(p.url)}" data-name="${esc(p.label.replace(/^.*?#/, '#'))}"><span class="tl3">${pchip(s, p)}</span><span class="tp3" style="--h:${prHue(s, p)}">${bars}${dots}</span></div>`);
    }
    if (!rows.length || !firsts.length) return '';
    const from = new Date(m.turns[0]?.ms || Math.min(...firsts)).toISOString();
    return `<div class="tvtrk3" data-from="${from}" aria-hidden="true">${rows.join('')}<span class="tnf" hidden></span><span class="tax"></span><i class="txh" hidden></i></div><div class="tsay" aria-hidden="true">the pointer over the rows says what happened when · a click keeps it</div>`;
  }
  const TRACK_MS = 6 * 3600_000;
  function fillTracks(el) {
    const now = Date.now(), from = Date.parse(el.dataset.from) || now;
    const t0 = Math.min(Math.max(from, now - TRACK_MS), now - 3600_000), span = now - t0, x = ms => (ms - t0) / span * 100;   // an hour at least
    el._t0 = t0; el._span = span;
    const gone = [];
    for (const row of el.querySelectorAll('.tk3[data-row]')) {
      let any = false;
      for (const i of row.querySelectorAll('i[data-a]')) {
        const a = Date.parse(i.dataset.a), bar = 'b' in i.dataset, b = bar ? Date.parse(i.dataset.b) || now : a, off = b < t0 || a > now;
        if (i.hidden !== off) i.hidden = off; if (off) continue; any = true;
        const l = `${Math.max(0, x(a)).toFixed(2)}%`; if (i.style.left !== l) i.style.left = l;
        if (bar) { const w = `${Math.max(.5, x(b) - Math.max(0, x(a))).toFixed(2)}%`; if (i.style.width !== w) i.style.width = w; }
      }
      if (row.hidden === any) row.hidden = !any;   // a row with nothing in the window folds
      if (!any && row.dataset.name) gone.push(row.dataset.name);
    }
    const nf = el.querySelector('.tnf'), say = gone.length ? `${gone.join(' ')} — nothing in the last ${Math.round(span / 3600_000)} h` : '';
    if (nf.textContent !== say) nf.textContent = say; nf.hidden = !say;
    const step = span <= 2 * 3600_000 ? 1800_000 : span <= 4 * 3600_000 ? 3600_000 : 7200_000;
    let h = ''; for (let t = Math.ceil(t0 / step) * step; t < now - step / 3; t += step) h += `<span style="left:${x(t).toFixed(2)}%">${esc(tvHm(t))}</span>`;
    h += '<span class="nw" style="left:100%">now</span>';
    const ax = el.querySelector('.tax'); if (ax._h !== h) ax.innerHTML = ax._h = h;
  }
  /** The line through the rows at a minute, and what happened there — within a few pixels' worth of time. */
  function tvCrossAt(el, ms, kept) {
    const plot = el.querySelector('.tk3:not([hidden]) .tp3'), xh = el.querySelector('.txh'), say = el.nextElementSibling; if (!plot || !el._span) return;
    const r = plot.getBoundingClientRect(), box = el.getBoundingClientRect(), tol = el._span * 6 / r.width, words = [];
    xh.hidden = false; xh.style.left = `${r.left - box.left + (ms - el._t0) / el._span * r.width}px`;
    for (const i of el.querySelectorAll('.tk3:not([hidden]) i[data-say]:not([hidden])')) {
      const a = Date.parse(i.dataset.a), b = 'b' in i.dataset ? Date.parse(i.dataset.b) || Date.now() : a;
      if (i.classList.contains('tw') ? ms > a + tol && ms < b : Math.abs(ms - a) <= tol) words.push(i.dataset.say);
    }
    say.innerHTML = `<b>${esc(tvHm(ms))}</b>${kept ? ' · kept' : ''} · ${words.length ? esc([...new Set(words)].join(' · ')) : 'nothing within a few minutes'}`;
  }
  function tvCrossOff(el) {
    if (el._kept != null) return tvCrossAt(el, el._kept, true);
    el.querySelector('.txh').hidden = true;
    el.nextElementSibling.textContent = 'the pointer over the rows says what happened when · a click keeps it';
  }
  const tvMsAt = (el, e) => { const plot = el.querySelector('.tk3:not([hidden]) .tp3'); if (!plot || !el._span) return null; const r = plot.getBoundingClientRect(); return e.clientX < r.left || e.clientX > r.right ? null : el._t0 + (e.clientX - r.left) / r.width * el._span; };
  for (const host of ['#tv']) {
    $(host).addEventListener('pointermove', e => { const el = e.target.closest?.('.tvtrk3'); if (!el) return; const ms = tvMsAt(el, e); if (ms == null) tvCrossOff(el); else tvCrossAt(el, ms, false); });
    $(host).addEventListener('pointerout', e => { const el = e.target.closest?.('.tvtrk3'); if (el && !el.contains(e.relatedTarget)) tvCrossOff(el); });
    $(host).addEventListener('click', e => { const el = e.target.closest?.('.tvtrk3'); if (!el) return; const ms = tvMsAt(el, e); el._kept = ms == null || el._kept != null ? null : ms; if (el._kept == null) tvCrossOff(el); else tvCrossAt(el, ms, true); });
  }
  let tvFrame = 0;
  function tvSoon() { if (!tvFrame && !$('#tv').hidden) tvFrame = requestAnimationFrame(() => { tvFrame = 0; const s = state.sessions.get(state.current); if (s && !$('#tv').hidden) renderTimeline(s); }); }   // no tab on show, no frame asked for
  function renderTimeline(s) {
    const el = $('#tv'); if (el.hidden || !s) return;
    if (!el.firstElementChild) el.innerHTML = '<div class="tvbar"></div><div class="tvtrk" hidden></div><div class="tvl" aria-label="This chat and its PRs, in the order things happened"></div>';
    const m = tvModel(s), sc = tvScope(s, m), rows = tvRows(s, m, sc), { L, cells } = tvLanes(s, m, sc, rows);
    setHtml(el.querySelector('.tvbar'), tvBarHtml(s, m, sc));
    const trk = el.querySelector('.tvtrk'), th = tvTracksHtml(s, m, sc);
    setHtml(trk, th); trk.hidden = !th; fillAges(trk);
    const faces = new Map(m.prs.flatMap(p => (p.people || []).filter(x => x.avatar).map(x => [x.login, x.avatar])));
    let html = '', day = null;
    rows.forEach((r, i) => {
      const d = dayOf(r.ms); if (d !== day && (day !== null || d !== 'Today')) html += `<div class="tvday"><b>${esc(d)}</b></div>`;
      day = d; html += tvRowHtml(s, m, sc, r, tvLaneHtml(L, cells[i]), faces);
    });
    if (!rows.length) html = `<div class="tvnone">${!sc.you && !sc.claude && !sc.on.size ? 'Nothing in the narrow — ⌥-click a chip for everything in play' : m.turns.length || m.prs.length ? 'Nothing here yet' : 'No messages yet'}</div>`;
    // a ledger that let its oldest go (it keeps 150 a PR): the rest is GitHub's
    const old = m.prs.filter(p => sc.on.has(p.url) && m.led.get(p.url)?.older);
    if (old.length) html = `<div class="tvold">${old.map(p => `<button type="button" class="tvgh" data-u="${esc(p.url)}">older on ${pchip(s, p)} — on GitHub ↗</button>`).join('')}</div>` + html;
    html += tvNowHtml(s, m, sc);
    const list = el.querySelector('.tvl'), lw = `${Math.max(1, L.length) * 14}px`;
    const lit = tv.lit?.id === s.id && performance.now() - tv.lit.t < TV_LIT_MS ? tv.lit : null;   // gone to a move a moment ago: stay there
    const stick = !lit && (list._sid !== s.id || list.scrollHeight - list.scrollTop - list.clientHeight < 40);
    if (list.style.getPropertyValue('--lw') !== lw) list.style.setProperty('--lw', lw);
    if (setHtml(list, html) || list._sid !== s.id) { fillAges(list); if (stick) list.scrollTop = list.scrollHeight; else if (lit) tvLight(list, lit); }
    list._sid = s.id;
    // the move gone to once the ledgers and the chat's own entries are both in (2026-10-17): from a card, the chat's
    // transcript lands after the ledger, and its turns, drawn in, pushed the move out of sight
    if (tv.goto?.id === s.id && tv.log && logOf.id === s.id) { const g = tv.goto; tv.goto = null; tvGo(s, g.url); }
  }
  const TV_LIT_MS = 2000;
  /** The row gone to, found again in the list as it now stands, put in the middle and lit — carried on, not restarted. */
  function tvLight(list, lit) {
    const els = [...list.querySelectorAll('.tvr[data-ms]')].filter(x => x.dataset.url === lit.url || (x.dataset.urls || '').split(' ').includes(lit.url));
    const el = els.sort((a, b) => Math.abs(a.dataset.ms - lit.at) - Math.abs(b.dataset.ms - lit.at))[0]; if (!el) return null;
    el.scrollIntoView({ block: 'center', behavior: lit.smooth && !REDUCED.matches ? 'smooth' : 'auto' });
    el.style.animationDelay = `${-Math.round(performance.now() - lit.t)}ms`;
    el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
    return el;
  }
  /** To a PR's round in the list: the move that opened it, where it was let go, or what answered it — lit a moment. */
  function tvGo(s, url) {
    const pr = (s.prs || []).find(p => p.url === url), r = pr && roundOf(pr), list = $('#tv .tvl'); if (!list) return;
    const at = r?.cur ? Date.parse(r.k === 'you' ? r.cur.from : r.k === 'let' ? r.cur.let || r.cur.from : r.cur.end || r.cur.from) : Infinity;
    tv.lit = { id: s.id, url, at, t: performance.now(), smooth: true };
    if (!tvLight(list, tv.lit)) { tv.lit = null; note(seen($('#tv')), `Nothing of ${pr ? pr.label : 'that PR'} in the timeline yet`); }
    else tv.lit.smooth = false;
  }
  /** A turn clicked: the transcript beside the timeline, at that turn. Under a drawer that runs it is out of sight. */
  function tvShowTurn(s, ts, from) {
    if (termLive(s)) return note(from, 'The transcript is under Claude’s drawer while it runs here — ⌥⌘C shows Claude');
    if (!isSplit(s)) splitChat(s, true);
    else if (!placeOf(s).includes('chat')) setTab(s, 'chat');
    focusG = homeOf(s, 'timeline'); syncTerm(s);
    const log = $('#log'), msgs = [...log.querySelectorAll('.msg[data-ts]')];
    const hit = msgs.find(x => x.dataset.ts === ts) || msgs.find(x => x.dataset.ts > ts);
    if (!hit) return;
    hit.scrollIntoView({ block: 'start', behavior: REDUCED.matches ? 'auto' : 'smooth' });
    hit.classList.remove('tvhit'); void hit.offsetWidth; hit.classList.add('tvhit');
  }
  $('#tv').addEventListener('click', e => {
    const s = state.sessions.get(state.current); if (!s) return;
    const go = e.target.closest('.tvgo'); if (go) return tvGo(s, go.dataset.go);
    const c = e.target.closest('.tvc');
    if (c?.dataset.url) return e.altKey ? tvSolo(s, c.dataset.url) : tvToggle(s, c.dataset.url);
    if (TV_WHO[c?.dataset.k]) return e.altKey ? tvSolo(s, c.dataset.k) : tvSide(s, c.dataset.k);
    if (c?.dataset.k === 'more' || e.target.closest('.tvscope')) return tvMenu(s, c || e.target.closest('.tvscope'), !c);
    const sg = e.target.closest('.tvseg button');
    if (sg?.dataset.turns) return tvSet(s, { turns: sg.dataset.turns });
    if (sg?.dataset.dens) return tvSet(s, { dens: sg.dataset.dens === 'fold' ? undefined : sg.dataset.dens });
    const cl = e.target.closest('.tvr.cl'); if (cl) return tvShowTurn(s, cl.dataset.ts, cl);
    const f = e.target.closest('.tvr.fold'); if (f) { if (!tv.opened.delete(f.dataset.fold)) tv.opened.add(f.dataset.fold); return renderTimeline(s); }
    const ev = e.target.closest('.tvr.ev[data-u], .tvgh'); if (ev) return openExternal(ev.dataset.u, { s });
  });
  for (const ev of ['wheel', 'pointerdown']) $('#tv').addEventListener(ev, () => { tv.lit = null; }, { passive: true });   // a hand on the list: its place is the hand's
  $('#tv').addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.tvr.fold')) { e.preventDefault(); e.target.click(); } });   // a fold is a button
  /** The element into the half that shows the tab, its place in the list kept as it moves. */
  function placeTimeline(s, p) {
    const el = $('#tv'), g = s ? p.indexOf('timeline') : -1;
    if (g < 0) { el.hidden = true; return; }
    const host = $(GEL[g].body), list = el.querySelector('.tvl'), top = list?.scrollTop;
    if (el.parentElement !== host) { host.insertBefore(el, host.firstChild); if (list) list.scrollTop = top; }
    const was = el.hidden; el.hidden = false;
    if (!prefs.tvSeen) { prefs.tvSeen = true; savePrefs(); $('#tvHint')?.remove(); }
    if (was || el._sid !== s.id) { el._sid = s.id; renderTimeline(s); } else tvSoon();
  }
  function hotTimeline() {
    const s = state.sessions.get(state.current); if (!s) return noChat();
    if (!timelineOpen.has(s.id)) { timelineOpen.add(s.id); openNewTab(s, 'timeline'); } else setTab(s, 'timeline');
    syncTerm(s); focusBoard();
  }
  function hotTimelineKey() { return zoomAgain(k => k === 'timeline') || hotTimeline(); }

