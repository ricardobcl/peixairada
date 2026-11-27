// ---- the changes tab: what this chat changed in its folder (2026-10-10) -------------------------------------------
// Conductor's review pane, as a tab beside claude and the zsh (⌥⌘D, the header's +n −n): the branch, how far from its
// upstream, the files with their counts and the diff, in the theme's syntax colours — scoped to the last turn's edits,
// the uncommitted tree or the branch against its base (GET …/changes, git on the server when asked; nothing polled).
// Commit… and Push type the command into the chat's zsh, unrun; a note on a line is a prompt typed into its claude.
// One element, moved into the half that shows the tab as the transcript is (placeChanges).
const changesOpen = new Set(); // chats with the tab, while the page lives

const changes = {
  id: null,
  scope: prefs.changesScope || 'turn',
  data: null,
  at: 0,
  upto: null,
  asking: 0,
  note: null,
  pr: new Map(),
  edit: null,
  drawn: null,
}; // pr: chat → the PR its PR scope shows; edit: a review's open box (2026-10-28); drawn: what renderChanges drew last

// The PR scope (2026-10-13): one of the chat's PRs as GitHub shows it — read from origin's refs into the object store,
// or GitHub's own diff when the folder is not that repo's checkout — whatever branch the folder has out.
const scopePrs = session => (session?.prs || []).filter(pr => pr.number); // a GitHub PR: a pr-link elsewhere has no number

const prOfScope = session => {
  const prs = scopePrs(session);
  const url = changes.pr.get(session.id);

  return (
    prs.find(pr => pr.url === url) || prs.find(pr => pr.state === 'open' || pr.state === 'draft') || prs[0] || null
  );
};

const scopeOf = session => (changes.scope === 'pr' && !prOfScope(session) ? 'uncommitted' : changes.scope);

/** The PR scope on this PR — the tab opened or brought forward. */
function openPrDiff(session, url) {
  changes.pr.set(session.id, url);
  changes.scope = prefs.changesScope = 'pr';
  savePrefs();
  changes.sel = null;
  hotDiff();
}

/** The PR scope's picker: the chat's PRs, each with its branch and where it is checked out. */
function prScopeMenu(session, at) {
  const rect = at.getBoundingClientRect();
  const cur = changes.scope === 'pr' && prOfScope(session);

  ctxShow(
    scopePrs(session).map(pr => ({
      t: `#${pr.number} ${pr.title || pr.label}`,
      n: pr.refs?.head || '',
      sub: whereOf(session, pr)?.t || (pr.refs ? '' : 'its branch not known yet'),
      on: pr === cur,
      fn: () => {
        changes.pr.set(session.id, pr.url);
        changes.scope = prefs.changesScope = 'pr';
        savePrefs();
        changes.sel = null;
        loadChanges(session);
      },
    })),
    rect.left,
    rect.bottom + 4,
    'prscope',
  );
}

const diffStats = new Map(); // chat id → { add, del, files, at } — the header's chip; asked every few seconds at most

const DIFF_LANG = {
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  css: 'css',
  scss: 'scss',
  html: 'xml',
  xml: 'xml',
  svg: 'xml',
  md: 'markdown',
  json: 'json',
  py: 'python',
  go: 'go',
  rb: 'ruby',
  rs: 'rust',
  swift: 'swift',
  sh: 'bash',
  zsh: 'bash',
  yml: 'yaml',
  yaml: 'yaml',
  sql: 'sql',
  java: 'java',
  kt: 'kotlin',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  php: 'php',
};

function wantDiffStat(session) {
  const cached = diffStats.get(session.id);

  if (!session.cwd || (cached && (cached.asking || Date.now() - cached.at < 5000))) return;
  diffStats.set(session.id, { ...cached, asking: true, at: cached?.at || 0 });

  api('GET', `/api/sessions/${session.id}/changes?stat=1`)
    .then(
      data => ({ add: data.add, del: data.del, files: data.files }),
      () => ({ add: 0, del: 0, files: 0 }),
    )
    .then(stat => {
      const was = diffStats.get(session.id);

      diffStats.set(session.id, { ...stat, at: Date.now() });

      if (was?.add !== stat.add || was?.del !== stat.del) {
        renderHead(state.sessions.get(session.id));
        ovSoon();
      }
    });
}

const diffChip = session => {
  const stat = diffStats.get(session.id);

  return stat && (stat.add || stat.del)
    ? `<button class="hdiff" id="diffBtn" title="${stat.files} file${stat.files === 1 ? '' : 's'} changed in its folder, not committed — click or ⌥⌘D for the diff"><span class="a">+${rn(`add:${session.id}`, stat.add)}</span><span class="d">−${rn(`del:${session.id}`, stat.del)}</span></button>`
    : '';
};

$('#shead').addEventListener('click', event => {
  if (event.target.closest('#diffBtn')) hotDiff();
});

function hotDiff() {
  const session = state.sessions.get(state.current);

  if (!session) return noChat();
  if (!session.cwd) return note($('#shead'), 'No folder known for this chat', true);
  if (!changesOpen.has(session.id)) {
    changesOpen.add(session.id);
    openNewTab(session, 'changes');
  } else setTab(session, 'changes');
  changes.at = 0;
  syncTerm(session);
  focusBoard();
}

/** The element into the half that shows the tab, and fresh when the chat has moved on since it was read. */
function placeChanges(session, place) {
  const el = $('#chg');
  const half = session ? place.indexOf('changes') : -1;

  if (half < 0) {
    el.hidden = true;
    return;
  }

  const host = $(GEL[half].body);

  if (el.parentElement !== host) host.insertBefore(el, host.firstChild);
  el.hidden = false;

  if (
    changes.id !== session.id ||
    !changes.at ||
    (changes.upto !== session.lastActivity && Date.now() - changes.at > 1500)
  ) {
    loadChanges(session);
  }
}

async function loadChanges(session) {
  const requestId = ++changes.asking;
  const scope = scopeOf(session);
  const query = scope === 'pr' ? `pr&pr=${encodeURIComponent(prOfScope(session).url)}` : scope;

  if (changes.id !== session.id) {
    changes.id = session.id;
    changes.data = null;
    changes.note = null;
    renderChanges(session);
  }

  changes.at = Date.now();
  changes.upto = session.lastActivity;
  if (scope === 'pr') wtOf(session.cwd, () => state.current === session.id && renderChanges(session)); // the picker's "where"
  let data;

  try {
    data = await api('GET', `/api/sessions/${session.id}/changes?scope=${query}`);
  } catch (error) {
    data = { error: error.message };
  }

  if (requestId !== changes.asking || state.current !== session.id) return;
  changes.data = data;

  if (!data.error && scope === 'uncommitted') {
    diffStats.set(session.id, { add: data.add, del: data.del, files: data.files.length, at: Date.now() });
    renderHead(session);
  }

  renderChanges(session);
}

/** A patch's lines with their numbers on both sides, from its hunks' heads. */
function diffLines(text) {
  const out = [];

  let oldLine = 0;
  let newLine = 0;
  let inHunk = false;

  for (const line of text.replace(/\n$/, '').split('\n')) {
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/.exec(line);

    if (hunk) {
      oldLine = +hunk[1];
      newLine = +hunk[2];
      inHunk = true;
      out.push({ t: 'hunk', text: line });
      continue;
    }

    if (!inHunk) continue; // the file's own head: diff --git, index, ---, +++
    if (line.startsWith('+')) out.push({ t: 'add', b: newLine++, text: line.slice(1) });
    else if (line.startsWith('-')) out.push({ t: 'del', a: oldLine++, text: line.slice(1) });
    else if (line.startsWith('\\')) out.push({ t: 'meta', text: line.slice(2) });
    else out.push({ t: 'ctx', a: oldLine++, b: newLine++, text: line.slice(1) });
  }

  return out;
}

const hlLine = (text, lang) => {
  try {
    return lang ? hljs.highlight(text, { language: lang, ignoreIllegals: true }).value : esc(text);
  } catch {
    return esc(text);
  }
};

function renderChanges(session) {
  const el = $('#chg');
  const data = changes.data;
  const sc = scopeOf(session);
  const spr = prOfScope(session);

  // the same diff read again (a turn's end, ↻): its place and a box being typed in are kept (2026-10-28)
  const drawn = `${session.id} ${sc} ${spr?.url || ''}`;
  const top = changes.drawn === drawn ? el.querySelector('.cdiff')?.scrollTop : null;

  const act =
    el.contains(document.activeElement) && document.activeElement.matches('textarea') ? document.activeElement : null;

  const typing = act && {
    box: act.closest('.lnote') ? '.lnote textarea' : '.crev textarea',
    from: act.selectionStart,
    to: act.selectionEnd,
  };

  changes.drawn = drawn;

  const seg = `<span class="cseg">${[
    ['turn', 'this turn'],
    ['uncommitted', 'uncommitted'],
    ['branch', 'branch vs base'],
  ]
    .map(([key, label]) => `<button data-scope="${key}" class="${sc === key ? 'on' : ''}">${label}</button>`)
    .join('')}${
    spr
      ? `<button data-scope="pr" class="prsc${sc === 'pr' ? ' on' : ''}" aria-haspopup="${scopePrs(session).length > 1 ? 'menu' : 'false'}" title="A PR's diff as GitHub shows it, read from origin — nothing checked out${scopePrs(session).length > 1 ? ' · click for the chat’s other PRs' : ''}">PR #${spr.number}${scopePrs(session).length > 1 ? ' ▾' : ''}</button>`
      : ''
  }</span>`;

  if (!data || data.error) {
    el.innerHTML = `<div class="cbar"><div class="r2">${seg}<button class="cbtn" data-act="reload" title="Read it again">↻</button></div></div><div class="cempty">${data ? esc(data.error) : 'reading git…'}</div>`;
    drawComments(session);
    return;
  }

  const up = data.upstream
    ? `${data.upstream.ahead ? `↑${data.upstream.ahead}` : ''}${data.upstream.behind ? ` ↓${data.upstream.behind}` : ''}${!data.upstream.ahead && !data.upstream.behind ? 'up to date' : ''} · ${esc(data.upstream.name)}`
    : 'no upstream';

  const pr = (session.prs || []).find(candidate => candidate.state === 'open' || candidate.state === 'draft') || null;
  const dp = data.pr;

  const chunks = new Map(splitDiff(data.patch).map(chunk => [chunk.path, chunk.text]));

  const files = data.files
    .map(
      file =>
        `<button class="cf${file.path === changes.sel ? ' on' : ''}" data-path="${esc(file.path)}" title="${esc(file.path)}"><b class="${file.status === 'A' ? 'a' : file.status === 'D' ? 'd' : ''}">${esc(file.status)}</b><span class="nm"><span class="dir">${esc(file.path.replace(/[^/]*$/, ''))}</span>${esc(file.path.split('/').pop())}</span><em>${file.binary ? 'bin' : `<span class="a">+${file.add}</span> <span class="d">−${file.del}</span>`}</em></button>`,
    )
    .join('');

  const body = data.files
    .map(file => {
      const lang = DIFF_LANG[(file.path.split('.').pop() || '').toLowerCase()];
      const ls = diffLines(chunks.get(file.path) || '');

      return `<section class="cfile" data-path="${esc(file.path)}"><div class="fh">${esc(file.path)}<em><span class="a">+${file.add}</span> <span class="d">−${file.del}</span></em></div>${
        data.left?.includes(file.path)
          ? '<div class="cempty sm">too long to show here</div>'
          : file.binary
            ? '<div class="cempty sm">a binary file</div>'
            : !ls.length
              ? '<div class="cempty sm">no lines to show</div>'
              : ls
                  .map(line =>
                    line.t === 'hunk'
                      ? `<div class="dl hunk"><span class="na"></span><span class="nb"></span><span class="sg"></span><code>${esc(line.text)}</code></div>`
                      : `<div class="dl ${line.t}" data-line="${line.b ?? line.a ?? ''}" data-a="${line.a ?? ''}" data-b="${line.b ?? ''}"><span class="na">${line.a ?? ''}</span><span class="nb">${line.b ?? ''}</span><span class="sg">${line.t === 'add' ? '+' : line.t === 'del' ? '−' : ''}${line.t !== 'meta' ? '<button class="dlp" title="A comment on this line — for the review that goes to Claude, or sent alone · drag to more lines, or ⇧-click one with a box open, for a range">+</button>' : ''}</span><code>${line.t === 'meta' ? esc(line.text) : hlLine(line.text, lang)}</code></div>`,
                  )
                  .join('')
      }</section>`;
    })
    .join('');

  // a PR's: its head → its base, where it was read from, and the PR itself — the folder's Commit… and Push are not its
  const src = !dp
    ? ''
    : dp.source === 'gh'
      ? `from GitHub (gh pr diff) — ${esc(dp.why)}`
      : `as pushed, at <b>${esc(String(dp.head).slice(0, 7))}</b> · read from origin, nothing checked out`;

  el.innerHTML = dp
    ? `<div class="cbar">
      <div class="r1"><span class="br">${ICON.branch}${esc(dp.headName || `#${dp.n}`)}</span>${data.base ? `<span class="arrow">→</span><span class="br base">${esc(data.base)}</span>` : ''}
        <span class="acts"><button class="cbtn pr" data-act="pr" title="${esc(dp.url || '')}">#${dp.n} ↗</button></span></div>
      <div class="r2">${seg}<span class="sum"><span class="a">+${data.add}</span> <span class="d">−${data.del}</span> in ${data.files.length} file${data.files.length === 1 ? '' : 's'}</span><button class="cbtn" data-act="reload" title="Read it again">↻</button></div>
      <div class="r3 csrc" title="${esc(unesc(src.replace(/<[^>]+>/g, '')))}">${src}</div></div>
      ${
        data.files.length
          ? `<div class="cbody"><div class="cfiles">${files}</div><div class="cdiff">${body}${data.truncated ? '<div class="cempty sm">…the rest is too long to show here</div>' : ''}</div></div>`
          : '<div class="cempty">nothing different from its base</div>'
      }`
    : `<div class="cbar">
      <div class="r1"><span class="br">${ICON.branch}${esc(data.branch)}</span>${data.base ? `<span class="arrow">→</span><span class="br base">${esc(data.base)}</span>` : ''}<span class="up">${up}</span>
        <span class="acts"><button class="cbtn" data-act="commit" title="Types git commit -v into this chat's ${shName()}, not run — ⏎ there runs it">Commit…</button><button class="cbtn" data-act="push" title="Types git push into this chat's ${shName()}, not run">Push</button>${pr ? `<button class="cbtn pr" data-act="pr" title="${esc(pr.url)}">${esc(pr.label.replace(/^.*?#/, '#'))} ↗</button>` : `<button class="cbtn" data-act="newpr" title="Types gh pr create --fill into this chat's ${shName()}, not run">PR…</button>`}</span></div>
      <div class="r2">${seg}<span class="sum"><span class="a">+${data.add}</span> <span class="d">−${data.del}</span> in ${data.files.length} file${data.files.length === 1 ? '' : 's'}</span><button class="cbtn" data-act="reload" title="Read it again">↻</button></div></div>
      ${
        data.files.length
          ? `<div class="cbody"><div class="cfiles">${files}</div><div class="cdiff">${body}${data.truncated ? '<div class="cempty sm">…the rest is too long to show here — the zsh has it whole</div>' : ''}</div></div>`
          : `<div class="cempty">${esc(data.note || (sc === 'branch' ? 'nothing different from its base' : 'nothing changed — the tree is clean'))}</div>`
      }`;

  drawComments(session);

  if (top != null) {
    const cd = el.querySelector('.cdiff');

    if (cd) cd.scrollTop = top;
  } else if (changes.sel) {
    el.querySelector(`.cfile[data-path="${CSS.escape(changes.sel)}"]`)?.scrollIntoView({ block: 'start' });
  }

  const box = typing && el.querySelector(typing.box);

  if (box) {
    box.focus({ preventScroll: true });
    box.setSelectionRange(typing.from, typing.to);
  }
}

/** git's patch cut at each file: [{path, text}] — the server's splitPatch, diffPath and unquoteGit, kept by hand: a
 *  name git quoted read back, `a/P b/P` by its length (2026-10-14). */
function unquoteGit(text, index = 0) {
  const bytes = [];
  const esc = { a: 7, b: 8, t: 9, n: 10, v: 11, f: 12, r: 13 };
  const enc = new TextEncoder();

  for (index++; index < text.length && text[index] !== '"';) {
    if (text[index] !== '\\') {
      const ch = String.fromCodePoint(text.codePointAt(index));

      bytes.push(...enc.encode(ch));
      index += ch.length;
    } else if (/[0-7]/.test(text[index + 1])) {
      bytes.push(parseInt(text.slice(index + 1, index + 4), 8));
      index += 4;
    } else {
      bytes.push(esc[text[index + 1]] ?? text.charCodeAt(index + 1));
      index += 2;
    }
  }

  return [new TextDecoder().decode(new Uint8Array(bytes)), index + 1];
}

function diffPath(line) {
  const rest = line.slice(11);
  const nameLength = (rest.length - 5) / 2;

  if (
    rest[0] !== '"' &&
    Number.isInteger(nameLength) &&
    rest.startsWith('a/') &&
    rest.slice(nameLength + 2, nameLength + 5) === ' b/' &&
    rest.slice(2, nameLength + 2) === rest.slice(nameLength + 5)
  ) {
    return rest.slice(nameLength + 5);
  }

  let newPath =
    rest[0] === '"'
      ? rest.slice(unquoteGit(rest)[1] + 1)
      : rest.slice((rest.indexOf(' "b/') >= 0 ? rest.indexOf(' "b/') : rest.indexOf(' b/')) + 1);

  if (newPath[0] === '"') newPath = unquoteGit(newPath)[0];
  return newPath.startsWith('b/') ? newPath.slice(2) : null;
}

const splitDiff = text =>
  String(text || '')
    .split(/^(?=diff --git )/m)
    .map(part => ({ path: part.startsWith('diff --git ') && diffPath(part.split('\n', 1)[0]), text: part }))
    .filter(chunk => chunk.path);

/** What the claude drawer of this chat is, attached on this page — or null. */
const claudeTm = session => {
  const tm = termLive(session) ? termFor(session.terminal.id) : null;

  return tm?.ws?.readyState === 1 ? tm : null;
};

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** A prompt into the chat's claude, as typed: newlines as Claude Code's own (ESC CR), then ⏎ — never while it asks
 *  (typeIn, 2026-11-27). Not sent, the text is copied. */
async function sendToClaude(session, text, at) {
  const tm = claudeTm(session);

  const no = !tm
    ? `no claude of this chat in a drawer here · ⌥⌘C starts one`
    : asking(session)
      ? ASKS_FIRST
      : await typeIn(tm.ws, forClaude(text), true);

  if (no) {
    const ok = await copyText(text);

    note(at, `Not sent: ${no}${ok ? ' — the text is copied' : ''}`, true);
    return false;
  }

  note(at, 'Sent to Claude');
  return true;
}

/** A command typed into the chat's zsh, unrun: the tab opened or shown, then the text once its socket is up. */
async function typeInShell(session, cmd, at) {
  const sh = await hotShell();

  if (!sh) return;

  for (let attempt = 0; attempt < 60; attempt++) {
    const tm = termFor(sh.id);

    if (tm?.ws?.readyState === 1) {
      await new Promise(resolve => setTimeout(resolve, 350));
      termSend(tm, forShell(cmd));
      focusTerm();
      return;
    }

    await new Promise(resolve => setTimeout(resolve, 100));
  }

  note(at, `The ${shName()} did not come up — ⌥⌘T`, true);
}

$('#chg').addEventListener('click', event => {
  const session = state.sessions.get(state.current);

  if (!session) return;
  const sc = event.target.closest('[data-scope]');

  if (sc?.dataset.scope === 'pr' && scopePrs(session).length > 1) return prScopeMenu(session, sc); // which PR: the picker

  if (sc) {
    changes.scope = prefs.changesScope = sc.dataset.scope;
    savePrefs();
    changes.sel = null;
    return loadChanges(session);
  }

  const act = event.target.closest('[data-act]')?.dataset.act;

  if (act === 'reload') return loadChanges(session);
  if (act === 'pr' && changes.data?.pr?.url) return showPr(changes.data.pr.url);
  if (act === 'commit') return typeInShell(session, 'git commit -v', event.target);
  if (act === 'push') return typeInShell(session, 'git push', event.target);
  if (act === 'newpr') return typeInShell(session, 'gh pr create --fill', event.target);

  if (act === 'pr') {
    const pr = (session.prs || []).find(candidate => candidate.state === 'open' || candidate.state === 'draft');

    if (pr) showPr(pr.url);
    return;
  }

  const fileButton = event.target.closest('.cf');

  if (fileButton) {
    changes.sel = fileButton.dataset.path;

    $('#chg')
      .querySelectorAll('.cf')
      .forEach(button => button.classList.toggle('on', button === fileButton));

    $('#chg')
      .querySelector(`.cfile[data-path="${CSS.escape(fileButton.dataset.path)}"]`)
      ?.scrollIntoView({ block: 'start', behavior: 'instant' });

    return;
  }

  const plus = event.target.closest('.dlp');
  const num = event.shiftKey && event.target.closest('.dl:not(.hunk, .meta) :is(.na, .nb)');

  if ((plus || num) && event.shiftKey && stretchComment(session, (plus || num).closest('.dl'))) return; // ⇧: the open box takes in the lines to here
  if (plus) return openComment(session, rangeAt([plus.closest('.dl')])); // a comment on this line: a box under it
  const nb = event.target.closest('[data-note]');

  if (nb) {
    return nb.dataset.note === 'add'
      ? saveComment(session)
      : nb.dataset.note === 'send'
        ? sendComment(session, nb)
        : closeComment(session);
  }

  const cm = event.target.closest('[data-cmt]');

  if (cm) {
    const id = +cm.closest('.lcmt').dataset.cid;

    return cm.dataset.cmt === 'edit' ? editComment(session, id) : dropComment(session, id);
  }

  const rb = event.target.closest('[data-rev]');

  if (rb) return rb.dataset.rev === 'submit' ? submitReview(session, rb) : discardReview(session, rb);
});

// a press on a line's + and a drag over others picks a range, as GitHub's (2026-10-28): the lines tinted as it goes,
// one hunk's at most; let go over another line, the box opens on them all — over the same one, the click opens it
let lineDrag = null;

$('#chg').addEventListener('mousedown', event => {
  const plus = event.button === 0 && event.target.closest('.dlp, .dl:not(.hunk, .meta) :is(.na, .nb)');

  if (!plus) return;
  event.preventDefault(); // no text selected on the way, the keys left where they were
  if (event.shiftKey || !plus.matches('.dlp')) return;
  const from = plus.closest('.dl');

  lineDrag = { from, run: [from] };
  from.classList.add('held');

  window.addEventListener(
    'mouseup',
    () => {
      const drag = lineDrag;
      const session = state.sessions.get(state.current);

      lineDrag = null;
      drag.from.classList.remove('held');
      if (!session || !drag.from.isConnected) return;
      if (drag.run.length > 1) openComment(session, rangeAt(drag.run));
      else if (drag.moved) drawComments(session); // one line: the click that follows opens it
    },
    { once: true },
  );
});

// a saved comment under the pointer lights the lines it is on
let litBox = null;

const lightLines = box => {
  if (box === litBox) return;
  litBox = box;

  $('#chg')
    .querySelectorAll('.dl.lit')
    .forEach(node => node.classList.remove('lit'));

  const comment = box && reviewOf(state.current).items.find(item => item.id === +box.dataset.cid);
  let at = box;

  while (at && !at.matches('.dl')) at = at.previousElementSibling;
  if (comment && at) for (const line of runOf(at, comment.rows)) line.classList.add('lit');
};

$('#chg').addEventListener('mouseleave', () => lightLines(null));

$('#chg').addEventListener('mouseover', event => {
  lightLines((!lineDrag && event.target.closest('.cdiff .lcmt:not(.gone)')) || null);
  const line = lineDrag && event.target.closest('.dl:not(.hunk, .meta)');

  if (!line) return;
  const run = spanOf(lineDrag.from, line);

  if (run.length === lineDrag.run.length && run[0] === lineDrag.run[0]) return;
  lineDrag.run = run;
  lineDrag.moved = true;

  $('#chg')
    .querySelectorAll('.dl.sel')
    .forEach(node => node.classList.remove('sel'));

  for (const node of run) node.classList.add('sel');
});

$('#chg').addEventListener('keydown', event => {
  const session = state.sessions.get(state.current);

  if (!session) return;

  if (event.target.closest('.lnote')) {
    // ⌘⏎ into the review, ⇧⌘⏎ sent alone, esc lets the box go
    if (event.key === 'Enter' && event.metaKey) {
      event.preventDefault();
      if (event.shiftKey) sendComment(session, event.target);
      else saveComment(session);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeComment(session);
    }
  } else if (event.target.closest('.crev') && event.key === 'Enter' && event.metaKey) {
    event.preventDefault();
    submitReview(session, event.target);
  }
});

$('#chg').addEventListener('input', event => {
  const session = state.sessions.get(state.current);

  if (!session) return;

  if (event.target.matches('.lnote textarea') && changes.edit?.chat === session.id) {
    changes.edit.text = event.target.value;
  } else if (event.target.matches('.crev textarea') && reviews.has(session.id)) {
    reviews.get(session.id).body = event.target.value;
    keepTabsSoon();
  }
});
