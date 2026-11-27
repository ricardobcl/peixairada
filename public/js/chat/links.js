// ---- links in the chat: files and pages -------------------------------------------
// (2026-09-26) A file
// path in the transcript or the drawer — /absolute, ./relative, folder/file.ext, ~/…, a bare name.ext:12 — is a
// link that opens it in the editor at that line, the href md() already gives the [file:42](src/file.ts#L42) links
// Claude writes, resolved against the chat's folder; a web URL is a link that opens the page in the pane, on a tab
// of the chat (openExternal). The transcript is linkified after every render (linkify — each text node the
// markdown and the tool rows left, anchors and summaries skipped); the drawer has a link provider beside the
// web-links addon (termLinks). What looks like a path but is not stays text: and/or, a date, a version, a route
// like /api/sessions (an absolute path is linked only under a root a file lives under, or with an extension).
const URL_RE = /https?:\/\/[^\s<>"'`]+/g;
const PATH_ROOTS = /^\/(?:Users|home|private|tmp|var|opt|etc|usr|Library|Applications|Volumes)\//;

// /absolute, ~/ or ./ with any segments (an @ before one is Claude Code's attachment mark, not part of it) ·
// folder/file.ext, the first segment dotless and not an npm scope (a domain is not a folder), an extension on the
// last · name.ext right before :line — and :line[:col] on any of them
// Not after a + or an @ inside a word (2026-10-03): every such place was a start that scanned to the run's end, and
// a 40 000-character line of them took 800 ms on the main thread; an @ that begins a word (Claude Code's) still may.
const PATH_RE =
  /(?<![\w./~+-])(?<![\w./~+@-]@)(?:(?:~|\.{1,2})?\/[\w.@+-]+(?:\/[\w.@+-]+)*|\.?[\w+-][\w@+-]*(?:\/[\w.@+-]+)*\/[\w@+-][\w.@+-]*\.[A-Za-z0-9]{1,8}|[\w@+-][\w.@+-]*\.[A-Za-z0-9]{1,8}(?=:\d))(?::\d+(?::\d+)?)?/g;

const EXT_RE = /\.[A-Za-z0-9]{1,8}$/;
// The external editor (2026-10-13, prefs.editor, Settings › General): VS Code or Zed. Each opens a file at a
// line from a URL of the same shape — <scheme>://file/<absolute path>:<line>:<col>, the path percent-decoded —, which
// the app hands to the system and a browser asks about. ⌥⌘E is VS Code Web on a tab of the pane whichever is picked
// (2026-10-13, later): Zed has no web build to frame, and its own window is ··· 's *the folder in Zed*. A switch
// draws the transcript again, so its links follow.
const EDITORS = { vscode: { name: 'VS Code', file: 'vscode://file' }, zed: { name: 'Zed', file: 'zed://file' } };
const editor = () => EDITORS[prefs.editor] || EDITORS.vscode;
const onZed = () => editor() === EDITORS.zed;

const fileUrl = (abs, line, col) =>
  `${editor().file}${encodeURI(abs)}${line ? `:${line}` : ''}${line && col ? `:${col}` : ''}`;

const unURI = uri => {
  try {
    return decodeURI(uri);
  } catch {
    return uri;
  }
};

const filePath = href => unURI(href.replace(/^(?:vscode|zed):\/\/file/, '')); // the tooltip's

const edPick = () => {
  for (const button of document.querySelectorAll('#edPick [data-ed]')) {
    button.setAttribute('aria-checked', String(EDITORS[button.dataset.ed] === editor()));
  }
};

for (const button of document.querySelectorAll('#edPick [data-ed]')) {
  button.addEventListener('click', () => {
    if (EDITORS[button.dataset.ed] === editor()) return;
    prefs.editor = button.dataset.ed;
    savePrefs();
    edPick();
    edSay();
    if (onZed()) wantZed();
    const session = state.sessions.get(state.current);

    if (!session) return;
    logView.arr = null;
    renderLog();
    renderHead(session); // the transcript's links and ··· name the editor
  });
}

edPick();
// The in-app editor (2026-10-21, prefs.inEditor, Settings › General): what ⌥⌘E opens on a tab beside the chat — VS Code
// Web, or vim in a terminal in the chat's folder (openVim: the server's holder, a tab as a zsh is, `shell:<id>` with
// its `editor`). ··· 's row, the launcher and a PR row's Editor ▾ name it.
const IN_EDITORS = { vscode: 'VS Code Web', vim: 'Vim' };
const onVim = () => prefs.inEditor === 'vim';
const inEdName = () => IN_EDITORS[onVim() ? 'vim' : 'vscode'];

const inEdPick = () => {
  for (const button of document.querySelectorAll('#inEdPick [data-ined]')) {
    button.setAttribute('aria-checked', String(button.dataset.ined === (onVim() ? 'vim' : 'vscode')));
  }
};

for (const button of document.querySelectorAll('#inEdPick [data-ined]')) {
  button.addEventListener('click', () => {
    if (button.getAttribute('aria-checked') === 'true') return;
    prefs.inEditor = button.dataset.ined;
    savePrefs();
    inEdPick();
    edSay();
    const session = state.sessions.get(state.current);

    if (session) renderHead(session); // ··· names it
  });
}

inEdPick();
// Zed picked and not on this Mac is Zed installed (2026-10-13): the server's `brew install --cask zed`, the line under
// the pick saying how far it is (edSay, from the `editor` events), failed and why, or — no Homebrew — where to get it.
// Until it is there, ··· 's folder in Zed and a file link say so where they were clicked (zedNote) rather than hand the
// system a URL nothing answers. Under the pick, whenever Zed is picked, what it is not: in the pane (ZED_NOT).
const ZED_GET = 'https://zed.dev/download';

const ZED_NOT =
  "Zed opens in its own window, outside the board — it has no web version the pane could show. ⌥⌘E is the in-app editor, on a tab here; ⌥⌘V and ··· open the chat's folder in Zed.";

const zedMissing = () => onZed() && !!state.editors?.zed && !state.editors.zed.app;

const zedWhy = () =>
  state.editors?.zed?.installing
    ? 'Zed is still being installed — a moment'
    : "Zed isn't installed — Settings › General › External editor installs it";

function zedNote(at) {
  note(at, zedWhy(), true);
}

async function loadEditors() {
  try {
    state.editors = await api('GET', '/api/editors');
  } catch {}

  edSay();
}

async function installZed() {
  try {
    state.editors = await api('POST', '/api/editors/zed/install');
  } catch (error) {
    state.editors = { ...state.editors, zed: { ...state.editors?.zed, installing: false, error: error.message } };
  }

  edSay();
}

async function wantZed() {
  await loadEditors();
  const zed = state.editors?.zed;

  if (zed && !zed.app && !zed.installing && zed.brew) await installZed();
}

function edSay() {
  const box = $('#edSay');
  const zed = state.editors?.zed;

  if (!box) return;

  const said =
    !onZed() || !zed || zed.app
      ? ''
      : zed.installing
        ? `<span>installing Zed with Homebrew…</span><span>${esc(zed.line || '')}</span>`
        : zed.error
          ? `<span class="err">Zed's install failed — ${esc(zed.error)}</span><button type="button" class="btn" data-zed="install">try again</button>`
          : zed.brew
            ? `<span>Zed isn't on this Mac</span><button type="button" class="btn" data-zed="install">install it</button><span>with Homebrew</span>`
            : `<span>Zed isn't on this Mac, and there is no Homebrew to install it with</span><button type="button" class="btn" data-zed="get">get it from zed.dev</button>`;

  const html = onZed() ? `${said}<span class="edwhy">${ZED_NOT}</span>` : '';

  box.hidden = !html;
  setHtml(box, html);
}

$('#edSay').addEventListener('click', event => {
  const button = event.target.closest('[data-zed]');

  if (!button) return;
  if (button.dataset.zed === 'install') installZed();
  else if (inApp) post({ type: 'external', url: ZED_GET });
  else window.open(ZED_GET, '_blank', 'noopener');
});

/** A path's file URL in the editor against the chat's folder, or null for one that is no file of ours: ~ needs a home
      (read off the folder), a relative path needs the folder, an absolute one a known root or an extension. */
function pathHref(path, cwd) {
  const match = /^(.*?)(?::(\d+)(?::(\d+))?)?$/.exec(path);
  let file = match[1];

  if (file.startsWith('~/')) {
    const home = /^\/(?:Users|home)\/[^/]+/.exec(cwd || '')?.[0];

    if (!home) return null;
    file = home + file.slice(1);
  } else if (file.startsWith('/')) {
    if (!PATH_ROOTS.test(file) && !EXT_RE.test(file)) return null;
  } else {
    if (!cwd) return null;
    file = `${cwd}/${file}`;
  }

  return fileUrl(normPath(file), match[2], match[3]);
}

/** `/a/b/../c/./d` → `/a/c/d`: a path with its dots resolved — a drawer's (pathHref) and a reply's relative link (md). */
function normPath(path) {
  const out = [];

  for (const seg of path.split('/')) {
    if (seg === '.' || seg === '') continue;
    if (seg === '..') out.pop();
    else out.push(seg);
  }

  return `/${out.join('/')}`;
}

/** Where the links are in a run of text: [{ start, end, href, web }], the pages first and no path inside one. */
function chatLinks(text, cwd) {
  const out = [];

  for (const match of text.matchAll(URL_RE)) {
    // a closing parenthesis is the URL's while it closes one of the URL's own: (see https://x/wiki/Foo_(bar)) keeps one
    let url = match[0].replace(/[.,;:!?'"]+$/, '');

    while (url.endsWith(')') && url.split(')').length > url.split('(').length) {
      url = url.slice(0, -1).replace(/[.,;:!?'"]+$/, '');
    }

    out.push({ start: match.index, end: match.index + url.length, href: url, web: true });
  }

  for (const match of text.matchAll(PATH_RE)) {
    const path = match[0].replace(/[.,;:]+$/, '');
    const start = match.index;
    const end = start + path.length;

    if (out.some(link => start < link.end && end > link.start)) continue;
    const href = pathHref(path, cwd);

    if (href) out.push({ start, end, href, web: false });
  }

  return out.sort((left, right) => left.start - right.start);
}

/** Anchors for the paths and pages in the text of a rendered transcript — the text nodes outside anchors. */
function linkify(root, cwd) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];

  for (let node; (node = walker.nextNode());) {
    if (/[/:]/.test(node.data) && !node.parentElement.closest('a, summary, .who, .agcall')) nodes.push(node);
  }

  for (const node of nodes) {
    const text = node.data;
    const links = chatLinks(text, cwd);

    if (!links.length) continue;
    const frag = document.createDocumentFragment();
    let at = 0;

    for (const link of links) {
      frag.append(text.slice(at, link.start));
      const anchor = document.createElement('a');

      anchor.href = link.href;
      anchor.textContent = text.slice(link.start, link.end);
      if (link.web) {
        anchor.target = '_blank';
        anchor.rel = 'noopener';
      } else anchor.title = `Open ${filePath(link.href)} in ${editor().name}`;
      frag.append(anchor);
      at = link.end;
    }

    frag.append(text.slice(at));
    node.replaceWith(frag);
  }
}

/** The paths on one line of a drawer, as xterm links: the line read back to its cells (a wide cell holds one
      character and takes two cells), each path a range that opens the way the transcript's does. */
function termLinks(tm, row) {
  const line = tm?.xt?.buffer.active.getLine(row - 1);

  if (!line) return undefined;
  let text = '';
  const cell = [];

  for (let col = 0; col < line.length; col++) {
    const bufferCell = line.getCell(col);

    if (!bufferCell || bufferCell.getWidth() === 0) continue;
    const ch = bufferCell.getChars() || ' ';

    for (let index = 0; index < ch.length; index++) cell.push(col);
    text += ch;
  }

  const links = chatLinks(text, tm.cwd || state.sessions.get(state.current)?.cwd)
    .filter(link => !link.web) // the drawer's folder: a new chat's has no chat yet
    .map(link => ({
      text: text.slice(link.start, link.end),
      href: link.href,
      range: { start: { x: cell[link.start] + 1, y: row }, end: { x: cell[link.end - 1] + 1, y: row } },
      activate: ev =>
        zedMissing()
          ? zedNote({ getBoundingClientRect: () => new DOMRect(ev?.clientX || 0, ev?.clientY || 0, 0, 0) })
          : openExternal(link.href),
    }));

  return links.length ? links : undefined;
}
