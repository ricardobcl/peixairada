// ---- the editor at a PR's branch (2026-10-13) ------------------------------------------------------------------------
// The folder that has the branch, else a worktree of its own inside the repo (POST /api/worktrees: found, or made),
// or the PR's head detached for review only — opened in the in-app editor (2026-10-21; Zed's window when it was the
// pick, before): VS Code Web on a tab of the chat named `<repo> @ <branch>`, or vim there; the external editor a row
// of its own. Switching the chat's own folder is offered last, typed into its zsh unrun, and
// only when nothing else works there (GET …/switch says why not).
const repoName = w => (w?.main || '').split('/').pop();
async function editorMenu(s, url, at) {
  const pr = (s.prs || []).find(p => p.url === url),
    r = pr?.refs;
  if (!pr || !r) return;
  const w = await wtNow(s.cwd),
    where = whereOf(s, pr),
    name = repoName(w),
    b = r.head;
  const guard =
    r.fork || where?.k === 'here'
      ? null
      : await api('GET', `/api/sessions/${s.id}/switch?branch=${encodeURIComponent(b)}`).catch(e => ({
          ok: false,
          why: [e.message],
        }));
  const inEd = `in ${inEdName()}`,
    tree = where?.path && w?.worktrees.find(t => t.path === where.path);
  const rows = [];
  if (where?.k === 'here')
    rows.push({ t: `Open this folder ${inEd}`, sub: `it is on ${b}`, fn: () => openEditorAt(s, where.path, null, at) });
  else if (where?.k === 'wt')
    rows.push({
      t: `Open ${where.t} ${inEd}`,
      sub: `${treeName(w, where.path)} · on ${b}`,
      fn: () => openEditorAt(s, where.path, `${name} @ ${b}`, at),
    });
  else if (!r.fork)
    rows.push({
      t: `A worktree for it, ${inEd}`,
      sub: `${name}/.claude/worktrees/${b.replace(/[^\w.-]+/g, '-')} · on ${b}, tracking origin`,
      fn: () => worktreeFor(s, { pr: url }, `${name} @ ${b}`, at),
    });
  if (where?.path)
    rows.push({
      t: `…or in ${editor().name}, its own window`,
      sub: 'the external editor — outside the board',
      fn: () => (zedMissing() ? zedNote(at) : openExternal(fileUrl(where.path))),
    }); // 2026-10-21: Zed picked was Editor ▾'s before
  rows.push({
    t: r.fork ? `Review it, detached, ${inEd}` : 'Review only, detached',
    sub: `at ${r.headOid ? r.headOid.slice(0, 7) : 'its head'} — nothing to commit to; removed once the PR is merged or closed and nothing is in it`,
    fn: () => worktreeFor(s, { pr: url, detach: true }, `${name} @ #${pr.number}`, at),
  });
  if (tree?.modules === 'same')
    rows.push({
      t: `Link node_modules from ${name}`,
      sub: 'its lockfile is the same — nothing installed',
      fn: () =>
        api('POST', '/api/worktrees/modules', { path: tree.path }).then(
          () => {
            wtData.delete(s.cwd);
            note(at, 'node_modules linked');
          },
          e => note(at, e.message, true),
        ),
    });
  else if (tree?.modules === 'differ')
    rows.push({
      t: 'npm ci there…',
      sub: `its lockfile differs — typed into the ${shName()}, not run`,
      fn: () => typeInShell(s, `cd ${shellWord(tree.path)} && npm ci`, at),
    });
  if (guard)
    rows.push(
      { hr: true },
      {
        t: `Switch this folder to ${b}…`,
        off: !guard.ok,
        sub: guard.ok
          ? `git switch ${shArg(b)} typed into its ${shName()}, not run`
          : `not offered: ${guard.why.join(' · ')}`,
        fn: () => typeInShell(s, `git switch ${shArg(b)}`, at),
      },
    );
  else if (r.fork)
    rows.push({ hr: true }, { t: 'Switch this folder…', off: true, sub: 'not offered: a fork’s branch' });
  const rc = at.getBoundingClientRect();
  ctxShow(rows, rc.right - 360, rc.bottom + 4, 'editor');
}
/** A tree's path said from its repo — widgets/.claude/worktrees/x —, else its last two folders. */
const treeName = (w, p) =>
  w?.main && p.startsWith(w.main + '/') ? repoName(w) + p.slice(w.main.length) : p.split('/').slice(-2).join('/');
async function worktreeFor(s, ask, label, at) {
  note(at, 'Finding its tree…');
  let t;
  try {
    t = await api('POST', '/api/worktrees', { cwd: s.cwd, ...ask });
  } catch (e) {
    return note(at, e.message, true);
  }
  document.querySelectorAll('.note').forEach(n => n.remove()); // found: "finding" is over
  wtData.delete(s.cwd);
  renderHead(state.sessions.get(s.id)); // where its branch lives, again
  openEditorAt(s, t.path, t.here ? null : label, at);
}
/** A folder in the in-app editor: vim on a tab of the chat, or VS Code Web on one — the chat's own folder its usual
 *  tab, any other one of its own, named by `label`. */
async function openEditorAt(s, path, label, at) {
  if (onVim()) return openVim(s, path, at);
  let d;
  try {
    d = await api('POST', '/api/vscode-web');
  } catch (e) {
    return note(at, `VS Code Web did not start: ${e.message}`, true);
  }
  const u = vswebAt(d, path);
  if (label && path !== s.cwd) ideLabels.set(u, label);
  openExternal(u, { ide: true, s, folder: path });
}
// VS Code Web's address for a folder, with its connection token (2026-10-16): serve-web trades `tkn` for its cookie and
// answers with the address without it, so the tab's address, its reload and a copy of it are the plain one
const vswebAt = (d, folder) =>
  `${d.url}?folder=${encodeURIComponent(folder)}${d.token ? `&tkn=${encodeURIComponent(d.token)}` : ''}`;
const TITLE_MIN = 170; // the title's own flex-basis (.shead h2), below which the row wraps
const TITLE_SHARE = 0.4; // the title keeps 40 % of the row at least (2026-10-12)
// The matrix (2026-11-03): one row while it is short and the row has room, then two, then three; a row of HEAD_COLS squares at most, or a chat on
// thirty PRs takes the title's place, until three rows ask for more. Past the row's room the box scrolls, with the number and three columns kept.
const HEAD_COLS = 12,
  HEAD_ROWS = 3;
function fitHeadPrs() {
  // no PRs, the row still folds (2026-10-13): the changes' count and the branch's move have no matrix to give way first
  const head = $('#shead'),
    m = head.querySelector(':scope > .tmx');
  if (!m && !head.querySelector(':scope > :is(#diffBtn, .hdrift)')) return;
  for (const el of head.querySelectorAll(':scope > .hfold')) el.classList.remove('hfold'); // what the last fit put away
  // Every width in one layout, then the arithmetic (2026-09-27)
  const cs = getComputedStyle(head),
    gap = parseFloat(cs.columnGap) || 0,
    h2 = head.querySelector('h2'),
    h2pad = h2 ? parseFloat(getComputedStyle(h2).paddingLeft) || 0 : 0; // the padding the h2 reaches the toolbar's edge by (the tab): its margin takes it back
  const row = [...head.children].filter(
    el => el.tagName !== 'H2' && el !== m && !el.classList.contains('details') && el.getClientRects().length,
  );
  // what grows (the move's line, the branch's move, a task's chip: flex 1 1 0) counts at its least — it gives way
  // before the matrix asks for a row more; the first two at their marks alone, their words (.q) going first
  const shrunk = el => {
    const kids = [...el.children].filter(c => !c.classList.contains('vh')),
      st = getComputedStyle(el);
    return (
      kids.reduce((w, c) => w + (c.classList.contains('q') ? 0 : c.getBoundingClientRect().width), 0) +
      (parseFloat(st.columnGap) || 0) * (kids.length - 1) +
      parseFloat(st.paddingLeft) +
      parseFloat(st.paddingRight) +
      parseFloat(st.borderLeftWidth) +
      parseFloat(st.borderRightWidth)
    );
  };
  const mv = head.querySelector('.hmove'),
    dr = head.querySelector('.hdrift'),
    mins = new Map([mv, dr].filter(Boolean).map(el => [el, shrunk(el)]));
  const least = el =>
    mins.has(el)
      ? mins.get(el)
      : getComputedStyle(el).flexGrow !== '0'
        ? parseFloat(getComputedStyle(el).minWidth) || 0
        : el.getBoundingClientRect().width;
  const title =
    head.classList.contains('tright') && state.notch
      ? state.notch.right + notchPad() - h2.getBoundingClientRect().left - h2pad + TITLE_ROOM // the title past the housing: the jump, then its room
      : head.classList.contains('tunder') && state.notch
        ? Math.max(
            state.notch.right + notchPad() - h2.getBoundingClientRect().left - h2pad,
            (head.querySelector('h2 .repo')?.offsetWidth || 0) - h2pad + TITLE_ROOM,
          ) // under it: on to its far side, the title shown left of it and under it
        : head.classList.contains('hole')
          ? h2.getBoundingClientRect().width - h2pad + (parseFloat(h2.style.marginRight) || 0) // the hole: the title's width is set, and the housing beside it is spent
          : Math.max(
              TITLE_MIN,
              (head.querySelector('h2 .repo')?.offsetWidth || 0) - h2pad + TITLE_ROOM,
              (head.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)) * TITLE_SHARE,
            );
  let room =
    head.clientWidth -
    parseFloat(cs.paddingLeft) -
    parseFloat(cs.paddingRight) -
    title -
    row.reduce((w, el) => w + least(el), 0) -
    gap * row.length;
  // the matrix: its number, and a width for so many columns, its box's padding in
  const box = m?.querySelector('.mxg'),
    squares = m ? [...m.querySelectorAll('.mxs')] : [],
    n = squares.length,
    num = m?.querySelector('.mxn');
  const before = m
    ? (num ? num.getBoundingClientRect().width + (parseFloat(getComputedStyle(m).columnGap) || 0) : 0) -
      (parseFloat(getComputedStyle(m).marginRight) || 0)
    : 0;
  const across = c => c * MX_PX.q + (c - 1) * MX_PX.g + 2 * MX_PAD;
  if (m) room -= gap;
  // Too full for the number and three columns (2026-10-11): the move's line goes, then the changes' count — the card says the one, ··· has the
  // other — and last the branch's move, which the card's red branch still says (2026-10-13), so the row stays one line, ··· on it, whatever its width.
  const needed = m ? before + across(Math.min(3, Math.ceil(n / HEAD_ROWS))) : 0,
    off = [];
  for (const el of [mv, head.querySelector('#diffBtn'), dr])
    if (el && row.includes(el) && needed > room) {
      room += least(el) + gap;
      off.push(el);
    }
  for (const el of off) el.classList.add('hfold');
  for (const [el, w] of mins) el.style.setProperty('--hmin', `${Math.ceil(w)}px`);
  if (!m) return;
  let rows = HEAD_ROWS,
    cols = Math.ceil(n / HEAD_ROWS);
  for (let r = 1; r <= HEAD_ROWS; r++) {
    const c = Math.ceil(n / r);
    if (c <= HEAD_COLS && before + across(c) <= room) {
      rows = r;
      cols = c;
      break;
    }
  }
  m.dataset.rows = rows;
  m.style.setProperty('--cols', cols);
  if (before + across(cols) > room) m.style.setProperty('--mxw', `${Math.max(needed, Math.floor(room)) - before}px`);
  else m.style.removeProperty('--mxw');
  squares.forEach((el, i) => el.classList.toggle('jw', i % cols === 0)); // a stack's line reaches back along its row, none at a row's start
  box.classList.remove('ovr');
  fadeSoon();
}
// The header's size changed: its width moves the fold (a height alone — a chip fold, the details — does not, and a
// fold that changes the height would otherwise run this again); under the housing every change moves the hole.
new ResizeObserver(() => {
  const w = $('#shead').clientWidth;
  if (w === fitHeadPrs.w && !state.notch) return;
  fitHeadPrs.w = w;
  if (state.notch) layoutNotch();
  fitHeadPrs();
  paintHeadSplit();
  fadeOver();
}).observe($('#shead'));
// ··· and its menu. Placed under the button, right-aligned, each time it opens and each time the header is drawn
// while it is up; closed by a click anywhere else, Esc (every dialog's), a hotkey (runHotkey), or an action that
// goes somewhere — the toggles leave it up, so their new state is read where they were clicked.
function placeMenu() {
  const b = $('#moreBtn'),
    m = $('#hmenu');
  if (!b) return;
  const r = b.getBoundingClientRect();
  m.style.top = Math.round(r.bottom + 4) + 'px';
  m.style.right = Math.max(8, Math.round(innerWidth - r.right)) + 'px';
  m.style.left = 'auto';
}
function openMenu() {
  const s = state.sessions.get(state.current);
  if (s) renderHead(s); // the rows read page state too (the editor's tab), which no SSE update redraws
  const m = $('#hmenu');
  m.show();
  fillAges(m);
  placeMenu();
  repostPane(); // the state dot's age: written here, not left to the 30 s tick
  // show() focuses the first row: kept (2026-10-12; blurred before, which left a keyboard nowhere) — :focus-visible
  // draws no ring for a pointer's open
  $('#moreBtn')?.classList.add('on');
  $('#moreBtn')?.setAttribute('aria-expanded', 'true');
}
$('#hmenu').addEventListener('close', () => {
  $('#moreBtn')?.classList.remove('on');
  $('#moreBtn')?.setAttribute('aria-expanded', 'false');
  if (!document.activeElement || document.activeElement === document.body) focusTerm(); // the keys back where they were
});
// The path, not the target: a toggle redraws the menu under the click, and the button it landed on is detached by
// the time the click gets here — closest() from it finds no menu, and the menu would shut on every toggle.
document.addEventListener('click', e => {
  if ($('#hmenu').open && !e.composedPath().some(n => n.id === 'hmenu' || n.id === 'moreBtn')) $('#hmenu').close();
});
window.addEventListener('resize', () => {
  if ($('#hmenu').open) placeMenu();
});
/** Where a note about a button belongs: the button while it is on screen, else the ··· it is folded under. */
const seen = el => (el && el.getClientRects().length ? el : $('#moreBtn') || $('#shead'));
// Rename on the board: kept in the server's state file, never in the transcript. Enter saves, Esc
// cancels, blur saves; an empty name goes back to what the chat calls itself.
function editTitle(s) {
  const t = $('#shead h2 .t');
  if (!t) return;
  state.titleEdit = s.id;
  const inp = document.createElement('input');
  inp.className = 'tedit';
  inp.value = s.boardTitle || s.title;
  inp.placeholder = s.aiTitle || s.prTitle || 'title';
  t.replaceWith(inp);
  inp.focus();
  inp.select();
  let done = false;
  const was = inp.value.trim();
  const end = async save => {
    if (done) return;
    done = true;
    state.titleEdit = null;
    // the box left as it came saves nothing (2026-10-14): a blur PUT the title it showed — Claude's, a PR's — as the
    // board's own, and the chat's title stopped following them
    if (save && inp.value.trim() !== was) {
      try {
        const d = await api('PUT', `/api/sessions/${s.id}/title`, { title: inp.value });
        const cur = state.sessions.get(s.id);
        if (cur) {
          cur.title = d.title;
          cur.boardTitle = d.boardTitle;
        }
      } catch (e) {
        note($('#shead'), `Could not rename: ${e.message}`, true);
      }
    }
    const cur = state.sessions.get(s.id) || s;
    drawn.head = null;
    renderHead(cur);
    renderBoard(); // the title was edited in place: draw the header again whatever it says
  };
  inp.onkeydown = e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      end(true);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      end(false);
    }
  };
  inp.onblur = () => end(true);
}
