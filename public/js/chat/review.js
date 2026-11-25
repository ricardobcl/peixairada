  // ---- a review of the diff (2026-10-28) ----------------------------------------------------------------------------
  // GitHub's pending review, for Claude: comments on the diff's lines, kept per chat as a draft — under their lines,
  // through a re-read, a change of scope and a reload (keepTabs) — and typed into the chat's claude as one prompt by
  // Submit (⌘⏎ in the bar at the tab's foot). A line's + opens a box: ⌘⏎ adds the comment, Send now (⇧⌘⏎) types it
  // alone, as the note on a line did before. A comment keeps its line's words: a re-read finds it by them, at the
  // nearest line that has them when the numbers moved; one the diff no longer shows waits at its top, still in the
  // review. Drawn into the diff already there (drawComments), so a comment costs no re-highlighting.
  // A comment may cover a range (2026-10-28), as GitHub's: a drag from a + or a ⇧-click with a box open picks the lines
  // of one hunk; it sits under the last of them, and keeps them all (`quote`) to be found by and quoted to Claude.
  const reviews = new Map();   // chat id → { items: [{ id, path, side: 'a' (a removed line, its old number) | 'b', line, code, pr, rows, from, quote, text }], body }
  let reviewSeq = 0;
  const reviewOf = id => reviews.get(id) || { items: [], body: '' };
  const QUOTE_ROWS = 20;   // a range's lines quoted to Claude, at most
  const sideOf = l => l.classList.contains('del') ? 'a' : 'b';
  const quoteOf = run => run.filter(l => !l.matches('.meta')).map(l => `${l.matches('.add') ? '+' : l.matches('.del') ? '-' : ' '}${l.querySelector('code').textContent}`);
  /** Where a comment is: `path:12`, a range `path:12–18`, one from a removed line to an added one `path:−12 to +18`;
   *  `long`, as the prompt says it. */
  function cmtWhere(c, long) {
    const at = `${c.pr ? `PR #${c.pr} ` : ''}${c.path}`, f = c.from, old = c.side === 'a';
    if (f && f.side !== c.side) return long ? `${at}, ${f.side === 'a' ? 'old' : 'new'} line ${f.line} to ${old ? 'old' : 'new'} line ${c.line}` : `${at}:${f.side === 'a' ? '−' : '+'}${f.line} to ${old ? '−' : '+'}${c.line}`;
    const n = f ? `${f.line}–${c.line}` : c.line;
    return !old ? `${at}:${n}` : long ? `${at}, old line${f ? 's' : ''} ${n} (removed)` : `${at}:${n} (removed)`;
  }
  /** A comment's place from its lines as drawn, in order: the last is where it sits, the first `from`. */
  function rangeAt(run) {
    const last = run[run.length - 1], first = run[0], side = sideOf(last), many = run.length > 1;
    // a line of a PR's diff: Claude is told which PR — the folder may have another branch out
    return { path: last.closest('.cfile').dataset.path, side, line: +last.dataset[side], code: last.querySelector('code').textContent, pr: changes.data?.pr?.n ?? null,
      rows: run.length, from: many ? { side: sideOf(first), line: +first.dataset[sideOf(first)] } : null, quote: many ? quoteOf(run) : null };
  }
  /** The lines from `a` towards `b` in their order, not past a hunk's head nor out of the file: a range is one hunk's. */
  function spanOf(a, b) {
    const sec = a.closest('.cfile'); if (b.closest('.cfile') !== sec) return [a];
    const all = [...sec.querySelectorAll(':scope > .dl')], i = all.indexOf(a), j = all.indexOf(b), step = j < i ? -1 : 1, run = [a];
    for (let k = i + step; k !== j + step && !all[k].matches('.hunk'); k += step) run.push(all[k]);
    while (run.length > 1 && run[run.length - 1].matches('.meta')) run.pop();
    return step < 0 ? run.reverse() : run;
  }
  /** The lines a comment covers, the one it sits on last: `rows` of them back from it, within its hunk. */
  function runOf(at, rows = 1) {
    const run = [at];
    for (let l = at.previousElementSibling; l && run.length < rows && !l.matches('.hunk'); l = l.previousElementSibling) if (l.matches('.dl')) run.unshift(l);
    return run;
  }
  /** The line a comment sits on in a file's section: its side's number and its words, the nearest such line — for a
   *  range, the nearest whose lines before it are the range's still, before any other. */
  function lineFor(sec, c) {
    let best = null, far = Infinity;
    for (const l of sec.querySelectorAll(':scope > .dl')) {
      const n = l.dataset[c.side]; if (!n || l.querySelector('code').textContent !== c.code) continue;
      const d = Math.abs(+n - c.line) + (c.quote && quoteOf(runOf(l, c.rows)).join('\n') !== c.quote.join('\n') ? 1e9 : 0);
      if (d < far) { far = d; best = l; }
    }
    return best;
  }
  /** ⇧-click on a line with a box open in its hunk: the box takes in the lines to it, from the range's top down or its
   *  foot up — the words typed kept. False when there is no such box: the click is a plain one. */
  function stretchComment(s, l) {
    const box = changes.edit?.chat === s.id && [...$('#chg').querySelectorAll('.cdiff .dl.sel')]; if (!box?.length) return false;
    const top = box[0], down = top === l || top.compareDocumentPosition(l) & Node.DOCUMENT_POSITION_FOLLOWING;
    const run = spanOf(down ? top : box[box.length - 1], l); if (!run.includes(l)) return false;
    changes.edit = { ...changes.edit, ...rangeAt(run) };
    drawComments(s); focusComment();
    return true;
  }
  /** The review over the diff as drawn: each comment under its line (the box in place of the one being edited, or under
   *  its line for a new one), the rest at the top, the files' counts, and the bar. */
  function drawComments(s) {
    const el = $('#chg'), diff = el.querySelector('.cdiff'), rv = reviewOf(s.id), dp = changes.data?.pr?.n ?? null;
    el.querySelectorAll('.lcmt, .lnote, .cgone, .crev, .cf .rc').forEach(n => n.remove());
    el.querySelectorAll('.dl.cmted, .dl.sel, .dl.lit').forEach(n => n.classList.remove('cmted', 'sel', 'lit'));
    const ed = changes.edit?.chat === s.id ? changes.edit : null;
    const items = [...rv.items.map(c => c.id === ed?.id ? ed : c), ...(ed && !ed.id ? [ed] : [])], gone = [];
    const secs = new Map([...(diff?.querySelectorAll('.cfile') || [])].map(x => [x.dataset.path, x]));
    const html = c => c === ed
      ? `<div class="lnote"><span class="who">${c.id ? 'Editing the comment on' : 'A comment on'} ${esc(cmtWhere(c))}</span><textarea rows="2" placeholder="What should Claude do about ${c.from ? 'these lines' : 'this line'}?">${esc(c.text)}</textarea><span class="row"><button class="cbtn" data-note="send" title="Types this comment alone into the chat's claude as a prompt · ⇧⌘⏎">Send now</button><span class="sp"></span><button class="cbtn" data-note="cancel">Cancel</button><button class="cbtn pri" data-note="add" title="${c.id ? 'Keep the change' : 'Add it to the review — Submit sends them all at once'}">${c.id ? 'Save' : 'Add to review'} ⌘⏎</button></span></div>`
      : `<div class="lcmt" data-cid="${c.id}"><span class="who">${esc(cmtWhere(c))}<button class="cbtn" data-cmt="edit">Edit</button><button class="cbtn" data-cmt="del">Delete</button></span><span class="tx">${esc(c.text)}</span></div>`;
    for (const c of items) {
      const sec = (c.pr ?? null) === dp ? secs.get(c.path) : null, at = sec && lineFor(sec, c);
      if (!at) { gone.push(c); continue; }
      let ref = at; while (ref.nextElementSibling?.matches('.lcmt, .lnote')) ref = ref.nextElementSibling;
      ref.insertAdjacentHTML('afterend', html(c));
      for (const l of runOf(at, c.rows)) l.classList.add('cmted', ...c === ed ? ['sel'] : []);
    }
    if (gone.length && diff) diff.insertAdjacentHTML('afterbegin', `<div class="cgone"><div class="ghd">Not in this diff — still in the review</div>${gone.map(c => html(c).replace(/^<div class="(lcmt|lnote)"/, '<div class="$1 gone"')).join('')}</div>`);
    for (const f of el.querySelectorAll('.cf')) {
      const n = rv.items.filter(c => c.path === f.dataset.path && (c.pr ?? null) === dp).length;
      if (n) f.querySelector('em')?.insertAdjacentHTML('beforebegin', `<i class="rc" title="${n} comment${n === 1 ? '' : 's'} in the review">${n}</i>`);
    }
    const n = rv.items.length, away = diff ? gone.filter(c => c !== ed).length : n;
    if (n) el.insertAdjacentHTML('beforeend', `<div class="crev"><span class="rh"><b>Review</b> · ${n} comment${n === 1 ? '' : 's'}${away ? ` · ${away} not in this diff` : ''}</span><textarea rows="1" placeholder="Anything overall? (optional)" aria-label="The review's own words">${esc(rv.body)}</textarea><button class="cbtn" data-rev="discard" title="Drop every comment of this review">Discard</button><button class="cbtn pri" data-rev="submit" title="Types the review into the chat's claude as one prompt">Submit to Claude ⌘⏎</button></div>`);
  }
  const focusComment = () => { const t = $('#chg .lnote textarea'); if (t) { t.focus(); t.setSelectionRange(t.value.length, t.value.length); } };
  function openComment(s, anchor) {
    if (changes.edit?.chat === s.id && changes.edit.text.trim()) saveComment(s);   // a box being written joins the review first
    changes.edit = { chat: s.id, id: null, text: '', ...anchor };
    drawComments(s); focusComment();
  }
  function editComment(s, id) {
    const c = reviewOf(s.id).items.find(x => x.id === id); if (!c) return;
    if (changes.edit?.chat === s.id && changes.edit.id !== id && changes.edit.text.trim()) saveComment(s);
    changes.edit = { ...c, chat: s.id };
    drawComments(s); focusComment();
  }
  /** The box's comment into the review — a new one at the end, an edited one in its place. Empty, it stays open. */
  function saveComment(s) {
    const ed = changes.edit, text = ed?.text.trim(); if (!ed || ed.chat !== s.id || !text) return focusComment();
    const rv = reviews.get(s.id) || { items: [], body: '' };
    const { chat, ...c } = ed; c.text = text;   // the place too: ⇧-click may have stretched it
    if (ed.id) rv.items = rv.items.map(x => x.id === ed.id ? c : x);
    else rv.items.push({ ...c, id: ++reviewSeq });
    reviews.set(s.id, rv); changes.edit = null; keepTabsSoon(); drawComments(s);
  }
  function closeComment(s) { changes.edit = null; drawComments(s); }
  function dropComment(s, id) {
    const rv = reviews.get(s.id); if (!rv) return;
    rv.items = rv.items.filter(x => x.id !== id); if (!rv.items.length) reviews.delete(s.id);
    if (changes.edit?.id === id) changes.edit = null;
    keepTabsSoon(); drawComments(s);
  }
  /** Send now: the box's comment alone, typed as a prompt, as a note on a line was before the review. */
  async function sendComment(s, at) {
    const ed = changes.edit, text = ed?.text.trim(); if (!ed || ed.chat !== s.id || !text) return;
    if (!await sendToClaude(s, `${cmtWhere(ed)} — ${text}`, at)) return;
    changes.edit = null; if (ed.id) dropComment(s, ed.id); else drawComments(s);
  }
  /** The review as one prompt: the comments by file and line, each with the line it is on — a range's lines as the
   *  diff marks them, their indent in common dropped — then its own words. */
  function reviewPrompt(rv) {
    const start = c => c.from?.line ?? c.line;
    const l = [...rv.items].sort((a, b) => (a.pr ?? 0) - (b.pr ?? 0) || a.path.localeCompare(b.path) || start(a) - start(b) || a.line - b.line), n = l.length;
    const cut = t => t.length > 160 ? `${t.slice(0, 159)}…` : t;
    const quote = c => {
      if (!c.quote) return c.code.trim() ? [`   > ${cut(c.code.trim())}`] : [];
      const pad = Math.min(...c.quote.filter(q => q.slice(1).trim()).map(q => /^\s*/.exec(q.slice(1))[0].length));
      const q = c.quote.map(t => `   > ${t[0]}${cut(t.slice(1 + (isFinite(pad) ? pad : 0))).trimEnd()}`);
      return q.length > QUOTE_ROWS ? [...q.slice(0, QUOTE_ROWS - 1), `   > … ${q.length - QUOTE_ROWS + 1} lines more`] : q;
    };
    return [`A review of the changes — ${n} comment${n === 1 ? '' : 's'}; address each:`,
      ...l.map((c, i) => [`${i + 1}. ${cmtWhere(c, true)}`, ...quote(c), ...c.text.split('\n').map(t => `   ${t}`)].join('\n')),
      ...rv.body.trim() ? [`Overall: ${rv.body.trim()}`] : []].join('\n\n');
  }
  async function submitReview(s, at) {
    if (changes.edit?.chat === s.id && changes.edit.text.trim()) saveComment(s);   // what was being written goes with it
    const rv = reviews.get(s.id); if (!rv?.items.length) return;
    if (!await sendToClaude(s, reviewPrompt(rv), at)) return;   // no drawer: the review stays, its prompt copied
    reviews.delete(s.id); changes.edit = null; keepTabsSoon(); drawComments(s);
  }
  /** Discard asks once more on the button itself: a click arms it, a second within four seconds drops them all. */
  function discardReview(s, btn) {
    const n = reviewOf(s.id).items.length;
    if (!btn.dataset.armed) { btn.dataset.armed = '1'; btn.textContent = `Discard all ${n}?`; setTimeout(() => { if (btn.isConnected) { delete btn.dataset.armed; btn.textContent = 'Discard'; } }, 4000); return; }
    reviews.delete(s.id); if (changes.edit?.chat === s.id) changes.edit = null;
    keepTabsSoon(); drawComments(s);
  }

