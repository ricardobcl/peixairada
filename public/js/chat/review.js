// ---- a review of the diff (2026-10-28) ----------------------------------------------------------------------------
// GitHub's pending review, for Claude: comments on the diff's lines, kept per chat as a draft — under their lines,
// through a re-read, a change of scope and a reload (keepTabs) — and typed into the chat's claude as one prompt by
// Submit (⌘⏎ in the bar at the tab's foot). A line's + opens a box: ⌘⏎ adds the comment, Send now (⇧⌘⏎) types it
// alone, as the note on a line did before. A comment keeps its line's words: a re-read finds it by them, at the
// nearest line that has them when the numbers moved; one the diff no longer shows waits at its top, still in the
// review. Drawn into the diff already there (drawComments), so a comment costs no re-highlighting.
// A comment may cover a range (2026-10-28), as GitHub's: a drag from a + or a ⇧-click with a box open picks the lines
// of one hunk; it sits under the last of them, and keeps them all (`quote`) to be found by and quoted to Claude.
const reviews = new Map(); // chat id → { items: [{ id, path, side: 'a' (a removed line, its old number) | 'b', line, code, pr, rows, from, quote, text }], body }
let reviewSeq = 0;
const reviewOf = id => reviews.get(id) || { items: [], body: '' };
const QUOTE_ROWS = 20; // a range's lines quoted to Claude, at most
const sideOf = line => (line.classList.contains('del') ? 'a' : 'b');

const quoteOf = run =>
  run
    .filter(line => !line.matches('.meta'))
    .map(
      line =>
        `${line.matches('.add') ? '+' : line.matches('.del') ? '-' : ' '}${line.querySelector('code').textContent}`,
    );

/** Where a comment is: `path:12`, a range `path:12–18`, one from a removed line to an added one `path:−12 to +18`;
 *  `long`, as the prompt says it. */
function cmtWhere(comment, long) {
  const at = `${comment.pr ? `PR #${comment.pr} ` : ''}${comment.path}`;
  const from = comment.from;
  const old = comment.side === 'a';

  if (from && from.side !== comment.side) {
    return long
      ? `${at}, ${from.side === 'a' ? 'old' : 'new'} line ${from.line} to ${old ? 'old' : 'new'} line ${comment.line}`
      : `${at}:${from.side === 'a' ? '−' : '+'}${from.line} to ${old ? '−' : '+'}${comment.line}`;
  }

  const span = from ? `${from.line}–${comment.line}` : comment.line;

  return !old
    ? `${at}:${span}`
    : long
      ? `${at}, old line${from ? 's' : ''} ${span} (removed)`
      : `${at}:${span} (removed)`;
}

/** A comment's place from its lines as drawn, in order: the last is where it sits, the first `from`. */
function rangeAt(run) {
  const last = run[run.length - 1];
  const first = run[0];
  const side = sideOf(last);
  const many = run.length > 1;

  // a line of a PR's diff: Claude is told which PR — the folder may have another branch out
  return {
    path: last.closest('.cfile').dataset.path,
    side,
    line: +last.dataset[side],
    code: last.querySelector('code').textContent,
    pr: changes.data?.pr?.n ?? null,
    rows: run.length,
    from: many ? { side: sideOf(first), line: +first.dataset[sideOf(first)] } : null,
    quote: many ? quoteOf(run) : null,
  };
}

/** The lines from `from` towards `to` in their order, not past a hunk's head nor out of the file: a range is one hunk's. */
function spanOf(from, to) {
  const sec = from.closest('.cfile');

  if (to.closest('.cfile') !== sec) return [from];

  const all = [...sec.querySelectorAll(':scope > .dl')];
  const fromIndex = all.indexOf(from);
  const toIndex = all.indexOf(to);
  const step = toIndex < fromIndex ? -1 : 1;
  const run = [from];

  for (let index = fromIndex + step; index !== toIndex + step && !all[index].matches('.hunk'); index += step) {
    run.push(all[index]);
  }

  while (run.length > 1 && run[run.length - 1].matches('.meta')) run.pop();
  return step < 0 ? run.reverse() : run;
}

/** The lines a comment covers, the one it sits on last: `rows` of them back from it, within its hunk. */
function runOf(at, rows = 1) {
  const run = [at];

  for (
    let line = at.previousElementSibling;
    line && run.length < rows && !line.matches('.hunk');
    line = line.previousElementSibling
  ) {
    if (line.matches('.dl')) run.unshift(line);
  }

  return run;
}

/** The line a comment sits on in a file's section: its side's number and its words, the nearest such line — for a
 *  range, the nearest whose lines before it are the range's still, before any other. */
function lineFor(sec, comment) {
  let best = null;
  let far = Infinity;

  for (const line of sec.querySelectorAll(':scope > .dl')) {
    const lineNumber = line.dataset[comment.side];

    if (!lineNumber || line.querySelector('code').textContent !== comment.code) continue;

    const distance =
      Math.abs(+lineNumber - comment.line) +
      (comment.quote && quoteOf(runOf(line, comment.rows)).join('\n') !== comment.quote.join('\n') ? 1e9 : 0);

    if (distance < far) {
      far = distance;
      best = line;
    }
  }

  return best;
}

/** ⇧-click on a line with a box open in its hunk: the box takes in the lines to it, from the range's top down or its
 *  foot up — the words typed kept. False when there is no such box: the click is a plain one. */
function stretchComment(session, line) {
  const box = changes.edit?.chat === session.id && [...$('#chg').querySelectorAll('.cdiff .dl.sel')];

  if (!box?.length) return false;

  const top = box[0];
  const down = top === line || top.compareDocumentPosition(line) & Node.DOCUMENT_POSITION_FOLLOWING;

  const run = spanOf(down ? top : box[box.length - 1], line);

  if (!run.includes(line)) return false;
  changes.edit = { ...changes.edit, ...rangeAt(run) };
  drawComments(session);
  focusComment();
  return true;
}

/** The review over the diff as drawn: each comment under its line (the box in place of the one being edited, or under
 *  its line for a new one), the rest at the top, the files' counts, and the bar. */
function drawComments(session) {
  const el = $('#chg');
  const diff = el.querySelector('.cdiff');
  const rv = reviewOf(session.id);
  const dp = changes.data?.pr?.n ?? null;

  el.querySelectorAll('.lcmt, .lnote, .cgone, .crev, .cf .rc').forEach(node => node.remove());
  el.querySelectorAll('.dl.cmted, .dl.sel, .dl.lit').forEach(node => node.classList.remove('cmted', 'sel', 'lit'));
  const ed = changes.edit?.chat === session.id ? changes.edit : null;

  const items = [...rv.items.map(comment => (comment.id === ed?.id ? ed : comment)), ...(ed && !ed.id ? [ed] : [])];
  const gone = [];

  const secs = new Map([...(diff?.querySelectorAll('.cfile') || [])].map(section => [section.dataset.path, section]));

  const html = comment =>
    comment === ed
      ? `<div class="lnote"><span class="who">${comment.id ? 'Editing the comment on' : 'A comment on'} ${esc(cmtWhere(comment))}</span><textarea rows="2" placeholder="What should Claude do about ${comment.from ? 'these lines' : 'this line'}?">${esc(comment.text)}</textarea><span class="row"><button class="cbtn" data-note="send" title="Types this comment alone into the chat's claude as a prompt · ⇧⌘⏎">Send now</button><span class="sp"></span><button class="cbtn" data-note="cancel">Cancel</button><button class="cbtn pri" data-note="add" title="${comment.id ? 'Keep the change' : 'Add it to the review — Submit sends them all at once'}">${comment.id ? 'Save' : 'Add to review'} ⌘⏎</button></span></div>`
      : `<div class="lcmt" data-cid="${comment.id}"><span class="who">${esc(cmtWhere(comment))}<button class="cbtn" data-cmt="edit">Edit</button><button class="cbtn" data-cmt="del">Delete</button></span><span class="tx">${esc(comment.text)}</span></div>`;

  for (const comment of items) {
    const sec = (comment.pr ?? null) === dp ? secs.get(comment.path) : null;
    const at = sec && lineFor(sec, comment);

    if (!at) {
      gone.push(comment);
      continue;
    }

    let ref = at;

    while (ref.nextElementSibling?.matches('.lcmt, .lnote')) ref = ref.nextElementSibling;
    ref.insertAdjacentHTML('afterend', html(comment));
    for (const line of runOf(at, comment.rows)) line.classList.add('cmted', ...(comment === ed ? ['sel'] : []));
  }

  if (gone.length && diff) {
    diff.insertAdjacentHTML(
      'afterbegin',
      `<div class="cgone"><div class="ghd">Not in this diff — still in the review</div>${gone.map(comment => html(comment).replace(/^<div class="(lcmt|lnote)"/, '<div class="$1 gone"')).join('')}</div>`,
    );
  }

  for (const fileButton of el.querySelectorAll('.cf')) {
    const fileCount = rv.items.filter(
      comment => comment.path === fileButton.dataset.path && (comment.pr ?? null) === dp,
    ).length;

    if (fileCount) {
      fileButton
        .querySelector('em')
        ?.insertAdjacentHTML(
          'beforebegin',
          `<i class="rc" title="${fileCount} comment${fileCount === 1 ? '' : 's'} in the review">${fileCount}</i>`,
        );
    }
  }

  const count = rv.items.length;
  const away = diff ? gone.filter(comment => comment !== ed).length : count;

  if (count) {
    el.insertAdjacentHTML(
      'beforeend',
      `<div class="crev"><span class="rh"><b>Review</b> · ${count} comment${count === 1 ? '' : 's'}${away ? ` · ${away} not in this diff` : ''}</span><textarea rows="1" placeholder="Anything overall? (optional)" aria-label="The review's own words">${esc(rv.body)}</textarea><button class="cbtn" data-rev="discard" title="Drop every comment of this review">Discard</button><button class="cbtn pri" data-rev="submit" title="Types the review into the chat's claude as one prompt">Submit to Claude ⌘⏎</button></div>`,
    );
  }
}

const focusComment = () => {
  const textArea = $('#chg .lnote textarea');

  if (textArea) {
    textArea.focus();
    textArea.setSelectionRange(textArea.value.length, textArea.value.length);
  }
};

function openComment(session, anchor) {
  if (changes.edit?.chat === session.id && changes.edit.text.trim()) saveComment(session); // a box being written joins the review first
  changes.edit = { chat: session.id, id: null, text: '', ...anchor };
  drawComments(session);
  focusComment();
}

function editComment(session, id) {
  const comment = reviewOf(session.id).items.find(item => item.id === id);

  if (!comment) return;
  if (changes.edit?.chat === session.id && changes.edit.id !== id && changes.edit.text.trim()) saveComment(session);
  changes.edit = { ...comment, chat: session.id };
  drawComments(session);
  focusComment();
}

/** The box's comment into the review — a new one at the end, an edited one in its place. Empty, it stays open. */
function saveComment(session) {
  const ed = changes.edit;
  const text = ed?.text.trim();

  if (!ed || ed.chat !== session.id || !text) return focusComment();
  const rv = reviews.get(session.id) || { items: [], body: '' };
  const { chat, ...comment } = ed;

  comment.text = text; // the place too: ⇧-click may have stretched it
  if (ed.id) rv.items = rv.items.map(item => (item.id === ed.id ? comment : item));
  else rv.items.push({ ...comment, id: ++reviewSeq });
  reviews.set(session.id, rv);
  changes.edit = null;
  keepTabsSoon();
  drawComments(session);
}

function closeComment(session) {
  changes.edit = null;
  drawComments(session);
}

function dropComment(session, id) {
  const rv = reviews.get(session.id);

  if (!rv) return;
  rv.items = rv.items.filter(item => item.id !== id);
  if (!rv.items.length) reviews.delete(session.id);
  if (changes.edit?.id === id) changes.edit = null;
  keepTabsSoon();
  drawComments(session);
}

/** Send now: the box's comment alone, typed as a prompt, as a note on a line was before the review. */
async function sendComment(session, at) {
  const ed = changes.edit;
  const text = ed?.text.trim();

  if (!ed || ed.chat !== session.id || !text) return;
  if (!(await sendToClaude(session, `${cmtWhere(ed)} — ${text}`, at))) return;
  changes.edit = null;
  if (ed.id) dropComment(session, ed.id);
  else drawComments(session);
}

/** The review as one prompt: the comments by file and line, each with the line it is on — a range's lines as the
 *  diff marks them, their indent in common dropped — then its own words. */
function reviewPrompt(rv) {
  const start = comment => comment.from?.line ?? comment.line;

  const sorted = [...rv.items].sort(
    (left, right) =>
      (left.pr ?? 0) - (right.pr ?? 0) ||
      left.path.localeCompare(right.path) ||
      start(left) - start(right) ||
      left.line - right.line,
  );

  const count = sorted.length;

  const cut = text => (text.length > 160 ? `${text.slice(0, 159)}…` : text);

  const quote = comment => {
    if (!comment.quote) return comment.code.trim() ? [`   > ${cut(comment.code.trim())}`] : [];

    const pad = Math.min(
      ...comment.quote
        .filter(quoteLine => quoteLine.slice(1).trim())
        .map(quoteLine => /^\s*/.exec(quoteLine.slice(1))[0].length),
    );

    const quoted = comment.quote.map(
      quoteLine => `   > ${quoteLine[0]}${cut(quoteLine.slice(1 + (isFinite(pad) ? pad : 0))).trimEnd()}`,
    );

    return quoted.length > QUOTE_ROWS
      ? [...quoted.slice(0, QUOTE_ROWS - 1), `   > … ${quoted.length - QUOTE_ROWS + 1} lines more`]
      : quoted;
  };

  return [
    `A review of the changes — ${count} comment${count === 1 ? '' : 's'}; address each:`,
    ...sorted.map((comment, index) =>
      [
        `${index + 1}. ${cmtWhere(comment, true)}`,
        ...quote(comment),
        ...comment.text.split('\n').map(line => `   ${line}`),
      ].join('\n'),
    ),
    ...(rv.body.trim() ? [`Overall: ${rv.body.trim()}`] : []),
  ].join('\n\n');
}

async function submitReview(session, at) {
  if (changes.edit?.chat === session.id && changes.edit.text.trim()) saveComment(session); // what was being written goes with it
  const rv = reviews.get(session.id);

  if (!rv?.items.length) return;
  if (!(await sendToClaude(session, reviewPrompt(rv), at))) return; // no drawer: the review stays, its prompt copied
  reviews.delete(session.id);
  changes.edit = null;
  keepTabsSoon();
  drawComments(session);
}

/** Discard asks once more on the button itself: a click arms it, a second within four seconds drops them all. */
function discardReview(session, btn) {
  const count = reviewOf(session.id).items.length;

  if (!btn.dataset.armed) {
    btn.dataset.armed = '1';
    btn.textContent = `Discard all ${count}?`;

    setTimeout(() => {
      if (btn.isConnected) {
        delete btn.dataset.armed;
        btn.textContent = 'Discard';
      }
    }, 4000);

    return;
  }

  reviews.delete(session.id);
  if (changes.edit?.chat === session.id) changes.edit = null;
  keepTabsSoon();
  drawComments(session);
}
