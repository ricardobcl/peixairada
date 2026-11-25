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
const scopePrs = s => (s?.prs || []).filter(p => p.number); // a GitHub PR: a pr-link elsewhere has no number
const prOfScope = s => {
  const l = scopePrs(s),
    u = changes.pr.get(s.id);
  return l.find(p => p.url === u) || l.find(p => p.state === 'open' || p.state === 'draft') || l[0] || null;
};
const scopeOf = s => (changes.scope === 'pr' && !prOfScope(s) ? 'uncommitted' : changes.scope);
/** The PR scope on this PR — the tab opened or brought forward. */
function openPrDiff(s, url) {
  changes.pr.set(s.id, url);
  changes.scope = prefs.changesScope = 'pr';
  savePrefs();
  changes.sel = null;
  hotDiff();
}
/** The PR scope's picker: the chat's PRs, each with its branch and where it is checked out. */
function prScopeMenu(s, at) {
  const r = at.getBoundingClientRect(),
    cur = changes.scope === 'pr' && prOfScope(s);
  ctxShow(
    scopePrs(s).map(p => ({
      t: `#${p.number} ${p.title || p.label}`,
      n: p.refs?.head || '',
      sub: whereOf(s, p)?.t || (p.refs ? '' : 'its branch not known yet'),
      on: p === cur,
      fn: () => {
        changes.pr.set(s.id, p.url);
        changes.scope = prefs.changesScope = 'pr';
        savePrefs();
        changes.sel = null;
        loadChanges(s);
      },
    })),
    r.left,
    r.bottom + 4,
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
function wantDiffStat(s) {
  const d = diffStats.get(s.id);
  if (!s.cwd || (d && (d.asking || Date.now() - d.at < 5000))) return;
  diffStats.set(s.id, { ...d, asking: true, at: d?.at || 0 });
  api('GET', `/api/sessions/${s.id}/changes?stat=1`)
    .then(
      r => ({ add: r.add, del: r.del, files: r.files }),
      () => ({ add: 0, del: 0, files: 0 }),
    )
    .then(v => {
      const was = diffStats.get(s.id);
      diffStats.set(s.id, { ...v, at: Date.now() });
      if (was?.add !== v.add || was?.del !== v.del) {
        renderHead(state.sessions.get(s.id));
        ovSoon();
      }
    });
}
const diffChip = s => {
  const d = diffStats.get(s.id);
  return d && (d.add || d.del)
    ? `<button class="hdiff" id="diffBtn" title="${d.files} file${d.files === 1 ? '' : 's'} changed in its folder, not committed — click or ⌥⌘D for the diff"><span class="a">+${rn('add:' + s.id, d.add)}</span><span class="d">−${rn('del:' + s.id, d.del)}</span></button>`
    : '';
};
$('#shead').addEventListener('click', e => {
  if (e.target.closest('#diffBtn')) hotDiff();
});
function hotDiff() {
  const s = state.sessions.get(state.current);
  if (!s) return noChat();
  if (!s.cwd) return note($('#shead'), 'No folder known for this chat', true);
  if (!changesOpen.has(s.id)) {
    changesOpen.add(s.id);
    openNewTab(s, 'changes');
  } else setTab(s, 'changes');
  changes.at = 0;
  syncTerm(s);
  focusBoard();
}
/** The element into the half that shows the tab, and fresh when the chat has moved on since it was read. */
function placeChanges(s, p) {
  const el = $('#chg'),
    g = s ? p.indexOf('changes') : -1;
  if (g < 0) {
    el.hidden = true;
    return;
  }
  const host = $(GEL[g].body);
  if (el.parentElement !== host) host.insertBefore(el, host.firstChild);
  el.hidden = false;
  if (changes.id !== s.id || !changes.at || (changes.upto !== s.lastActivity && Date.now() - changes.at > 1500))
    loadChanges(s);
}
async function loadChanges(s) {
  const n = ++changes.asking,
    scope = scopeOf(s),
    q = scope === 'pr' ? `pr&pr=${encodeURIComponent(prOfScope(s).url)}` : scope;
  if (changes.id !== s.id) {
    changes.id = s.id;
    changes.data = null;
    changes.note = null;
    renderChanges(s);
  }
  changes.at = Date.now();
  changes.upto = s.lastActivity;
  if (scope === 'pr') wtOf(s.cwd, () => state.current === s.id && renderChanges(s)); // the picker's "where"
  let d;
  try {
    d = await api('GET', `/api/sessions/${s.id}/changes?scope=${q}`);
  } catch (e) {
    d = { error: e.message };
  }
  if (n !== changes.asking || state.current !== s.id) return;
  changes.data = d;
  if (!d.error && scope === 'uncommitted') {
    diffStats.set(s.id, { add: d.add, del: d.del, files: d.files.length, at: Date.now() });
    renderHead(s);
  }
  renderChanges(s);
}
/** A patch's lines with their numbers on both sides, from its hunks' heads. */
function diffLines(text) {
  const out = [];
  let a = 0,
    b = 0,
    inHunk = false;
  for (const l of text.replace(/\n$/, '').split('\n')) {
    const h = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/.exec(l);
    if (h) {
      a = +h[1];
      b = +h[2];
      inHunk = true;
      out.push({ t: 'hunk', text: l });
      continue;
    }
    if (!inHunk) continue; // the file's own head: diff --git, index, ---, +++
    if (l.startsWith('+')) out.push({ t: 'add', b: b++, text: l.slice(1) });
    else if (l.startsWith('-')) out.push({ t: 'del', a: a++, text: l.slice(1) });
    else if (l.startsWith('\\')) out.push({ t: 'meta', text: l.slice(2) });
    else out.push({ t: 'ctx', a: a++, b: b++, text: l.slice(1) });
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
function renderChanges(s) {
  const el = $('#chg'),
    d = changes.data,
    sc = scopeOf(s),
    spr = prOfScope(s);
  // the same diff read again (a turn's end, ↻): its place and a box being typed in are kept (2026-10-28)
  const drawn = `${s.id} ${sc} ${spr?.url || ''}`,
    top = changes.drawn === drawn ? el.querySelector('.cdiff')?.scrollTop : null;
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
    .map(([k, w]) => `<button data-scope="${k}" class="${sc === k ? 'on' : ''}">${w}</button>`)
    .join('')}${
    spr
      ? `<button data-scope="pr" class="prsc${sc === 'pr' ? ' on' : ''}" aria-haspopup="${scopePrs(s).length > 1 ? 'menu' : 'false'}" title="A PR's diff as GitHub shows it, read from origin — nothing checked out${scopePrs(s).length > 1 ? ' · click for the chat’s other PRs' : ''}">PR #${spr.number}${scopePrs(s).length > 1 ? ' ▾' : ''}</button>`
      : ''
  }</span>`;
  if (!d || d.error) {
    el.innerHTML = `<div class="cbar"><div class="r2">${seg}<button class="cbtn" data-act="reload" title="Read it again">↻</button></div></div><div class="cempty">${d ? esc(d.error) : 'reading git…'}</div>`;
    drawComments(s);
    return;
  }
  const up = d.upstream
    ? `${d.upstream.ahead ? `↑${d.upstream.ahead}` : ''}${d.upstream.behind ? ` ↓${d.upstream.behind}` : ''}${!d.upstream.ahead && !d.upstream.behind ? 'up to date' : ''} · ${esc(d.upstream.name)}`
    : 'no upstream';
  const pr = (s.prs || []).find(p => p.state === 'open' || p.state === 'draft') || null,
    dp = d.pr;
  const chunks = new Map(splitDiff(d.patch).map(c => [c.path, c.text]));
  const files = d.files
    .map(
      f =>
        `<button class="cf${f.path === changes.sel ? ' on' : ''}" data-path="${esc(f.path)}" title="${esc(f.path)}"><b class="${f.status === 'A' ? 'a' : f.status === 'D' ? 'd' : ''}">${esc(f.status)}</b><span class="nm"><span class="dir">${esc(f.path.replace(/[^/]*$/, ''))}</span>${esc(f.path.split('/').pop())}</span><em>${f.binary ? 'bin' : `<span class="a">+${f.add}</span> <span class="d">−${f.del}</span>`}</em></button>`,
    )
    .join('');
  const body = d.files
    .map(f => {
      const lang = DIFF_LANG[(f.path.split('.').pop() || '').toLowerCase()];
      const ls = diffLines(chunks.get(f.path) || '');
      return `<section class="cfile" data-path="${esc(f.path)}"><div class="fh">${esc(f.path)}<em><span class="a">+${f.add}</span> <span class="d">−${f.del}</span></em></div>${
        d.left?.includes(f.path)
          ? '<div class="cempty sm">too long to show here</div>'
          : f.binary
            ? '<div class="cempty sm">a binary file</div>'
            : !ls.length
              ? '<div class="cempty sm">no lines to show</div>'
              : ls
                  .map(x =>
                    x.t === 'hunk'
                      ? `<div class="dl hunk"><span class="na"></span><span class="nb"></span><span class="sg"></span><code>${esc(x.text)}</code></div>`
                      : `<div class="dl ${x.t}" data-line="${x.b ?? x.a ?? ''}" data-a="${x.a ?? ''}" data-b="${x.b ?? ''}"><span class="na">${x.a ?? ''}</span><span class="nb">${x.b ?? ''}</span><span class="sg">${x.t === 'add' ? '+' : x.t === 'del' ? '−' : ''}${x.t !== 'meta' ? '<button class="dlp" title="A comment on this line — for the review that goes to Claude, or sent alone · drag to more lines, or ⇧-click one with a box open, for a range">+</button>' : ''}</span><code>${x.t === 'meta' ? esc(x.text) : hlLine(x.text, lang)}</code></div>`,
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
      <div class="r1"><span class="br">${ICON.branch}${esc(dp.headName || `#${dp.n}`)}</span>${d.base ? `<span class="arrow">→</span><span class="br base">${esc(d.base)}</span>` : ''}
        <span class="acts"><button class="cbtn pr" data-act="pr" title="${esc(dp.url || '')}">#${dp.n} ↗</button></span></div>
      <div class="r2">${seg}<span class="sum"><span class="a">+${d.add}</span> <span class="d">−${d.del}</span> in ${d.files.length} file${d.files.length === 1 ? '' : 's'}</span><button class="cbtn" data-act="reload" title="Read it again">↻</button></div>
      <div class="r3 csrc" title="${esc(src.replace(/<[^>]+>/g, ''))}">${src}</div></div>
      ${
        d.files.length
          ? `<div class="cbody"><div class="cfiles">${files}</div><div class="cdiff">${body}${d.truncated ? '<div class="cempty sm">…the rest is too long to show here</div>' : ''}</div></div>`
          : '<div class="cempty">nothing different from its base</div>'
      }`
    : `<div class="cbar">
      <div class="r1"><span class="br">${ICON.branch}${esc(d.branch)}</span>${d.base ? `<span class="arrow">→</span><span class="br base">${esc(d.base)}</span>` : ''}<span class="up">${up}</span>
        <span class="acts"><button class="cbtn" data-act="commit" title="Types git commit -v into this chat's ${shName()}, not run — ⏎ there runs it">Commit…</button><button class="cbtn" data-act="push" title="Types git push into this chat's ${shName()}, not run">Push</button>${pr ? `<button class="cbtn pr" data-act="pr" title="${esc(pr.url)}">${esc(pr.label.replace(/^.*?#/, '#'))} ↗</button>` : `<button class="cbtn" data-act="newpr" title="Types gh pr create --fill into this chat's ${shName()}, not run">PR…</button>`}</span></div>
      <div class="r2">${seg}<span class="sum"><span class="a">+${d.add}</span> <span class="d">−${d.del}</span> in ${d.files.length} file${d.files.length === 1 ? '' : 's'}</span><button class="cbtn" data-act="reload" title="Read it again">↻</button></div></div>
      ${
        d.files.length
          ? `<div class="cbody"><div class="cfiles">${files}</div><div class="cdiff">${body}${d.truncated ? '<div class="cempty sm">…the rest is too long to show here — the zsh has it whole</div>' : ''}</div></div>`
          : `<div class="cempty">${esc(d.note || (sc === 'branch' ? 'nothing different from its base' : 'nothing changed — the tree is clean'))}</div>`
      }`;
  drawComments(s);
  if (top != null) {
    const cd = el.querySelector('.cdiff');
    if (cd) cd.scrollTop = top;
  } else if (changes.sel)
    el.querySelector(`.cfile[data-path="${CSS.escape(changes.sel)}"]`)?.scrollIntoView({ block: 'start' });
  const box = typing && el.querySelector(typing.box);
  if (box) {
    box.focus({ preventScroll: true });
    box.setSelectionRange(typing.from, typing.to);
  }
}
/** git's patch cut at each file: [{path, text}] — the server's splitPatch, diffPath and unquoteGit, kept by hand: a
 *  name git quoted read back, `a/P b/P` by its length (2026-10-14). */
function unquoteGit(s, i = 0) {
  const bytes = [],
    esc = { a: 7, b: 8, t: 9, n: 10, v: 11, f: 12, r: 13 },
    enc = new TextEncoder();
  for (i++; i < s.length && s[i] !== '"';) {
    if (s[i] !== '\\') {
      const ch = String.fromCodePoint(s.codePointAt(i));
      bytes.push(...enc.encode(ch));
      i += ch.length;
    } else if (/[0-7]/.test(s[i + 1])) {
      bytes.push(parseInt(s.slice(i + 1, i + 4), 8));
      i += 4;
    } else {
      bytes.push(esc[s[i + 1]] ?? s.charCodeAt(i + 1));
      i += 2;
    }
  }
  return [new TextDecoder().decode(new Uint8Array(bytes)), i + 1];
}
function diffPath(line) {
  const rest = line.slice(11),
    n = (rest.length - 5) / 2;
  if (
    rest[0] !== '"' &&
    Number.isInteger(n) &&
    rest.startsWith('a/') &&
    rest.slice(n + 2, n + 5) === ' b/' &&
    rest.slice(2, n + 2) === rest.slice(n + 5)
  )
    return rest.slice(n + 5);
  let b =
    rest[0] === '"'
      ? rest.slice(unquoteGit(rest)[1] + 1)
      : rest.slice((rest.indexOf(' "b/') >= 0 ? rest.indexOf(' "b/') : rest.indexOf(' b/')) + 1);
  if (b[0] === '"') b = unquoteGit(b)[0];
  return b.startsWith('b/') ? b.slice(2) : null;
}
const splitDiff = text =>
  String(text || '')
    .split(/^(?=diff --git )/m)
    .map(t => ({ path: t.startsWith('diff --git ') && diffPath(t.split('\n', 1)[0]), text: t }))
    .filter(c => c.path);
/** What the claude drawer of this chat is, attached on this page — or null. */
const claudeTm = s => {
  const tm = termLive(s) ? termFor(s.terminal.id) : null;
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
/** A prompt into the chat's claude, as typed: newlines as Claude Code's own (ESC CR), then ⏎. */
async function sendToClaude(s, text, at) {
  const tm = claudeTm(s);
  if (!tm) {
    const ok = await copyText(text);
    note(at, `No claude of this chat in a drawer here${ok ? ' — the text is copied' : ''} · ⌥⌘C starts one`, true);
    return false;
  }
  termSend(tm, forClaude(text));
  setTimeout(() => termSend(tm, '\r'), 60);
  note(at, 'Sent to Claude');
  return true;
}
/** A command typed into the chat's zsh, unrun: the tab opened or shown, then the text once its socket is up. */
async function typeInShell(s, cmd, at) {
  const sh = await hotShell();
  if (!sh) return;
  for (let i = 0; i < 60; i++) {
    const tm = termFor(sh.id);
    if (tm?.ws?.readyState === 1) {
      await new Promise(r => setTimeout(r, 350));
      termSend(tm, forShell(cmd));
      focusTerm();
      return;
    }
    await new Promise(r => setTimeout(r, 100));
  }
  note(at, `The ${shName()} did not come up — ⌥⌘T`, true);
}
$('#chg').addEventListener('click', e => {
  const s = state.sessions.get(state.current);
  if (!s) return;
  const sc = e.target.closest('[data-scope]');
  if (sc?.dataset.scope === 'pr' && scopePrs(s).length > 1) return prScopeMenu(s, sc); // which PR: the picker
  if (sc) {
    changes.scope = prefs.changesScope = sc.dataset.scope;
    savePrefs();
    changes.sel = null;
    return loadChanges(s);
  }
  const act = e.target.closest('[data-act]')?.dataset.act;
  if (act === 'reload') return loadChanges(s);
  if (act === 'pr' && changes.data?.pr?.url) return showPr(changes.data.pr.url);
  if (act === 'commit') return typeInShell(s, 'git commit -v', e.target);
  if (act === 'push') return typeInShell(s, 'git push', e.target);
  if (act === 'newpr') return typeInShell(s, 'gh pr create --fill', e.target);
  if (act === 'pr') {
    const pr = (s.prs || []).find(p => p.state === 'open' || p.state === 'draft');
    if (pr) showPr(pr.url);
    return;
  }
  const f = e.target.closest('.cf');
  if (f) {
    changes.sel = f.dataset.path;
    $('#chg')
      .querySelectorAll('.cf')
      .forEach(b => b.classList.toggle('on', b === f));
    $('#chg')
      .querySelector(`.cfile[data-path="${CSS.escape(f.dataset.path)}"]`)
      ?.scrollIntoView({ block: 'start', behavior: 'instant' });
    return;
  }
  const plus = e.target.closest('.dlp'),
    num = e.shiftKey && e.target.closest('.dl:not(.hunk, .meta) :is(.na, .nb)');
  if ((plus || num) && e.shiftKey && stretchComment(s, (plus || num).closest('.dl'))) return; // ⇧: the open box takes in the lines to here
  if (plus) return openComment(s, rangeAt([plus.closest('.dl')])); // a comment on this line: a box under it
  const nb = e.target.closest('[data-note]');
  if (nb)
    return nb.dataset.note === 'add'
      ? saveComment(s)
      : nb.dataset.note === 'send'
        ? sendComment(s, nb)
        : closeComment(s);
  const cm = e.target.closest('[data-cmt]');
  if (cm) {
    const id = +cm.closest('.lcmt').dataset.cid;
    return cm.dataset.cmt === 'edit' ? editComment(s, id) : dropComment(s, id);
  }
  const rb = e.target.closest('[data-rev]');
  if (rb) return rb.dataset.rev === 'submit' ? submitReview(s, rb) : discardReview(s, rb);
});
// a press on a line's + and a drag over others picks a range, as GitHub's (2026-10-28): the lines tinted as it goes,
// one hunk's at most; let go over another line, the box opens on them all — over the same one, the click opens it
let lineDrag = null;
$('#chg').addEventListener('mousedown', e => {
  const plus = e.button === 0 && e.target.closest('.dlp, .dl:not(.hunk, .meta) :is(.na, .nb)');
  if (!plus) return;
  e.preventDefault(); // no text selected on the way, the keys left where they were
  if (e.shiftKey || !plus.matches('.dlp')) return;
  const from = plus.closest('.dl');
  lineDrag = { from, run: [from] };
  from.classList.add('held');
  window.addEventListener(
    'mouseup',
    () => {
      const d = lineDrag,
        s = state.sessions.get(state.current);
      lineDrag = null;
      d.from.classList.remove('held');
      if (!s || !d.from.isConnected) return;
      if (d.run.length > 1) openComment(s, rangeAt(d.run));
      else if (d.moved) drawComments(s); // one line: the click that follows opens it
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
    .forEach(n => n.classList.remove('lit'));
  const c = box && reviewOf(state.current).items.find(x => x.id === +box.dataset.cid);
  let at = box;
  while (at && !at.matches('.dl')) at = at.previousElementSibling;
  if (c && at) for (const l of runOf(at, c.rows)) l.classList.add('lit');
};
$('#chg').addEventListener('mouseleave', () => lightLines(null));
$('#chg').addEventListener('mouseover', e => {
  lightLines((!lineDrag && e.target.closest('.cdiff .lcmt:not(.gone)')) || null);
  const l = lineDrag && e.target.closest('.dl:not(.hunk, .meta)');
  if (!l) return;
  const run = spanOf(lineDrag.from, l);
  if (run.length === lineDrag.run.length && run[0] === lineDrag.run[0]) return;
  lineDrag.run = run;
  lineDrag.moved = true;
  $('#chg')
    .querySelectorAll('.dl.sel')
    .forEach(n => n.classList.remove('sel'));
  for (const n of run) n.classList.add('sel');
});
$('#chg').addEventListener('keydown', e => {
  const s = state.sessions.get(state.current);
  if (!s) return;
  if (e.target.closest('.lnote')) {
    // ⌘⏎ into the review, ⇧⌘⏎ sent alone, esc lets the box go
    if (e.key === 'Enter' && e.metaKey) {
      e.preventDefault();
      if (e.shiftKey) sendComment(s, e.target);
      else saveComment(s);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      closeComment(s);
    }
  } else if (e.target.closest('.crev') && e.key === 'Enter' && e.metaKey) {
    e.preventDefault();
    submitReview(s, e.target);
  }
});
$('#chg').addEventListener('input', e => {
  const s = state.sessions.get(state.current);
  if (!s) return;
  if (e.target.matches('.lnote textarea') && changes.edit?.chat === s.id) changes.edit.text = e.target.value;
  else if (e.target.matches('.crev textarea') && reviews.has(s.id)) {
    reviews.get(s.id).body = e.target.value;
    keepTabsSoon();
  }
});
