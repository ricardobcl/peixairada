// ---- PRs: the strip under the header, and where a GitHub link goes -------------------
// github.com refuses to be framed, so inside the Mac app a PR opens in a pane beside the board —
// a second web view the shell owns, asked for over the bridge — and in a plain browser it opens
// a tab. Either way a strip under the header says what gh knows about it: state, review, checks,
// size, branches. Non-GitHub links in the app go to the system browser the same way.
const inApp = !!window.webkit?.messageHandlers?.hub;
const post = message => window.webkit?.messageHandlers?.hub?.postMessage(message);

// The whole board larger or smaller (2026-10-12, the settings' text size): the app's web view zooms (pageZoom — the
// page's CSS px stay its own, the app turns its places between the two); a browser has its own View → Zoom, which ⌘+
// and ⌘− (the chat's own size here) do not reach. Posted on every load, as the app forgets.
const zoomPick = () => {
  $('#zoomPick').value = String(prefs.pageZoom || 1);
  $('#zoomPick').hidden = !inApp;
  document.querySelector('#spLook .zhint').hidden = inApp;
};

const applyZoom = () => {
  if (inApp) post({ type: 'zoom', value: prefs.pageZoom || 1 });
  zoomPick();
};

$('#zoomPick').addEventListener('change', event => {
  prefs.pageZoom = +event.target.value || 1;
  savePrefs();
  applyZoom();
});

applyZoom();

// Which full screen ⌃⌘F is in the app (2026-10-14): the fill, up to the notch, or macOS's own in a Space of its own —
// the app keeps it too, for a launch that comes back full screen before this page has loaded.
const fsPick = () => {
  $('#fsPick').value = prefs.fullSpace ? 'space' : 'fill';
  $('#fsRow').hidden = !inApp;
};

const applyFull = () => {
  if (inApp) post({ type: 'fullscreen', space: !!prefs.fullSpace });
  fsPick();
};

$('#fsPick').addEventListener('change', event => {
  prefs.fullSpace = event.target.value === 'space';
  savePrefs();
  applyFull();
});

applyFull();
const GH_PR = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d+/;
const IN_PANE = /^https?:\/\//; // every web page (2026-09-26; GitHub and the board's own before, the rest went to the browser)

// …unless the browser is picked (2026-10-21, prefs.pagesOut, Settings › General › Links): then only the sites the board
// keeps (prefs.boardSites, github.com at first), each an address's start — a scheme or www. or none, matched whole up
// to a / ? # or : — and the rest goes to the browser. A link out of a page in the pane to another site goes the same
// way: the shell asks peixLinkOut. VS Code Web is the board's own, whatever the pick; an address typed into a blank tab
// is asked for here.
const siteOf = address =>
  String(address)
    .trim()
    .replace(/^[a-z][\w+.-]*:\/\//i, '')
    .replace(/^www\./i, '')
    .toLowerCase();

const sitesKept = () => (prefs.boardSites || []).map(siteOf).filter(Boolean);

const inBoard = url =>
  !prefs.pagesOut ||
  sitesKept().some(kept => {
    const site = siteOf(url);

    return site.startsWith(kept) && (kept.endsWith('/') || /^(?:$|[/?#:])/.test(site.slice(kept.length)));
  });

window.peixLinkOut = url => inApp && IN_PANE.test(url) && !inBoard(url);

const pagesPick = () => {
  for (const button of document.querySelectorAll('#pagesPick [data-out]')) {
    button.setAttribute('aria-checked', String(!!+button.dataset.out === !!prefs.pagesOut));
  }

  const row = $('#sitesRow');
  const say = row.querySelector('small');
  const box = $('#boardSites');

  row.classList.toggle('off', !prefs.pagesOut);
  box.disabled = !prefs.pagesOut;
  say.textContent = prefs.pagesOut ? say.dataset.d : say.dataset.off;
  if (document.activeElement !== box) box.value = (prefs.boardSites || []).join(', ');
  $('#linksRow').hidden = !inApp;
};

for (const button of document.querySelectorAll('#pagesPick [data-out]')) {
  button.addEventListener('click', () => {
    prefs.pagesOut = !!+button.dataset.out;
    savePrefs();
    pagesPick();
  });
}

$('#boardSites').addEventListener('change', event => {
  prefs.boardSites = [
    ...new Set(
      event.target.value
        .split(/[\s,]+/)
        .map(site => site.trim())
        .filter(Boolean),
    ),
  ];

  savePrefs();
  pagesPick();
});

pagesPick();
/** `ide`: the folder's editor, which only the editor's own row opens (2026-10-03; any http://127.0.0.1:<port>/ was
 *  taken for it before — a dev server's link replaced the folder's editor). `s`: the chat it is for, the open one
 *  unless said — an answer that comes after that chat was left records its tab there and shows nothing. */
// What the board hands on (2026-11-06): a web page, mail, an editor's file — nothing else. In a browser it went by a
// link's click (a javascript: one would have run here), in the app as `external`, which gives the system any scheme.
const OUT_OK = /^(?:https?:\/\/|mailto:|(?:vscode|vscode-insiders|zed):\/\/file\/)/i;

function openExternal(
  url,
  { ide = false, s: session = state.sessions.get(state.current), folder = session?.cwd } = {},
) {
  if (!OUT_OK.test(String(url || ''))) {
    note($('#shead'), 'Not opened: the board opens web pages, mail and files in the editor', true);
    return;
  }

  // in a browser an app's URL (vscode://, zed://) is followed as a link is — the browser hands it over, or asks —, not
  // in a tab of its own, which stays blank (2026-10-13)
  if (!inApp) {
    if (IN_PANE.test(url)) window.open(url, '_blank', 'noopener');
    else {
      const anchor = document.createElement('a');

      anchor.href = url;
      anchor.click();
    }

    return;
  }

  if (!IN_PANE.test(url) || !session || (!ide && !inBoard(url))) {
    post({ type: 'external', url });
    return;
  } // vscode://, zed://, mailto:… — the system's; a page off the board's sites, the browser

  // A page of the chat, on a tab of its own in the strip (2026-09-20): web pages one per URL, in the order first
  // opened — a PR, a docs page, a dev server (2026-09-26; the strip's ↗ is the way out to the browser); the folder's
  // editor, one per folder. Remembered here so they come back with the chat; the shell keeps a web view per page and
  // shows the one the tab says (syncTerm → postPane). The key's `gh:` is the name every page tab kept from when
  // GitHub's were the only ones. A page opened again is the tab it already has — while that tab is still at it: one
  // followed somewhere else leaves the page a new tab (2026-10-13, pageTab).
  let key = ide ? `ide:${url}` : pageTab(session, url);
  let fresh = !key;

  if (ide && folder !== session.cwd) {
    const urls = state.paneWt.get(session.id) || [];

    fresh = !urls.includes(url);
    if (fresh) state.paneWt.set(session.id, [...urls, url]);
  } // another tree's editor: a tab of its own (2026-10-13)
  else if (ide) {
    fresh = false;

    if (session.cwd) {
      fresh = state.paneIde.get(session.cwd) !== url;
      state.paneIde.set(session.cwd, url);
    }
  } else if (fresh) {
    key = pageKey(session, url);
    state.paneGh.set(session.id, [...(state.paneGh.get(session.id) || []), key]);
  }

  if (session.id !== state.current) return;
  if (fresh) openNewTab(session, key);
  else setTab(session, key);
  syncTerm(session);
}

// The PR in front of you, for ⌥⌘G's picker to mark *current*. There was a strip under the header with what gh said
// about it — state, review, checks, size, branches — until 2026-09-24: the page itself, on its tab, says all of that.
const shownPr = { url: null };

function hidePr() {
  shownPr.url = null;
}

function showPr(url) {
  shownPr.url = url;
  openExternal(url);
}

// Every link in the chat pane passes here: a PR chip or a PR link in a reply opens the PR (in the app, on a tab
// of the chat); any other web link inside the app goes through openExternal — a tab of the pane — because a
// web view without a UI delegate simply drops target=_blank. A vscode:// or zed:// link is left to navigate: the
// shell's navigation policy hands it to the editor (a browser asks); the board's own links are the board's.
// The copy button on a code block (2026-09-27, night): the block's text to the clipboard — the async API, else the
// selection and execCommand (a page that is not a secure context, an old engine) — and "copied" on the button for a
// second. The button itself is what says whether it worked; there is no toast.
for (const box of [$('#log'), $('#agv')]) {
  box.addEventListener('click', async event => {
    const button = event.target.closest('.codebox .copy');

    if (!button) return;

    // the text as shown (2026-11-06): innerText leaves out what is not drawn, so a block cannot copy more than it shows
    const pre = button.closest('.codebox').querySelector('pre');
    const text = (pre.querySelector('code') || pre).innerText;

    let ok = false;

    try {
      await navigator.clipboard.writeText(text);
      ok = true;
    } catch {
      try {
        const range = document.createRange();

        range.selectNodeContents(pre);
        const sel = getSelection();

        sel.removeAllRanges();
        sel.addRange(range);
        ok = document.execCommand('copy');
        sel.removeAllRanges();
      } catch {}
    }

    button.textContent = ok ? 'copied' : 'failed';
    button.classList.toggle('did', ok);
    clearTimeout(button.timer);

    button.timer = setTimeout(() => {
      button.textContent = 'copy';
      button.classList.remove('did');
    }, 1200);
  });
}

// The turn's footer (2026-10-08): copy what Claude said since your last word — every text of the turn, as written
// (markdown), a blank line between — and the same "copied" on the button.
$('#log').addEventListener('click', async event => {
  const button = event.target.closest('.turnfoot .tcopy');

  if (!button) return;

  const all = state.entries;
  const end = all.findIndex(entry => entry.turnEnd && entry.ts === button.dataset.ts);

  if (end < 0) return;
  let from = end;

  while (from > 0 && !(all[from - 1].role === 'user' && all[from - 1].kind === 'text')) from--;

  const text = all
    .slice(from, end + 1)
    .filter(entry => entry.role === 'assistant' && entry.kind === 'text')
    .map(entry => entry.text.trim())
    .join('\n\n');

  let ok = false;

  try {
    await navigator.clipboard.writeText(text);
    ok = true;
  } catch {}

  const label = button.querySelector('span');

  label.textContent = ok ? 'copied' : 'failed';
  button.classList.toggle('did', ok);
  clearTimeout(button.timer);

  button.timer = setTimeout(() => {
    label.textContent = 'copy';
    button.classList.remove('did');
  }, 1200);
});

// a message's sender, or where a SendMessage went (2026-10-31): that chat, its card located
$('#log').addEventListener('click', event => {
  // an agent's row under the transcript, as on its card, or its call in it (2026-11-02)
  const call = event.target.closest('.agcall[data-ag]');
  const cs = call && state.sessions.get(state.current);

  if (cs) {
    agOpen(cs, { id: call.dataset.ag, asked: call.dataset.asked });
    return;
  }

  const rowElement = event.target.closest('.presence .agr');
  const session = rowElement && state.sessions.get(state.current);

  if (!session) return;
  const key = rowElement.dataset.k;

  if (key === '_more' || key === '_done' || key === '_sum') {
    agSwitch(session.id, key === '_more' ? 'more' : 'done');
    fillAgents();
    renderPresence();
    return;
  }

  const row = session.agentRows?.find(candidate => candidate.id === rowElement.dataset.ag);

  if (row) agOpen(session, row);
});

$('#log').addEventListener('click', event => {
  const link = event.target.closest('.peerlink[data-sid]');

  if (!link) return;
  if (state.sessions.has(link.dataset.sid)) openSession(link.dataset.sid, { locate: true });
  else note(link, 'That chat is not on the board');
});

const sameOrigin = href => {
  try {
    return new URL(href, location.href).origin === location.origin;
  } catch {
    return false;
  }
};

$('#chat').addEventListener('click', event => {
  const anchor = event.target.closest('a[href]');

  if (!anchor) return;
  const href = anchor.getAttribute('href') || '';

  if (href.startsWith('zed:') && zedMissing()) {
    event.preventDefault();
    zedNote(anchor);
    return;
  }

  if (GH_PR.test(href) && !anchor.dataset.ext) {
    event.preventDefault();
    showPr(href.match(GH_PR)[0]);
    return;
  }

  // the board's own origin by its parts, never a prefix (2026-11-27): http://127.0.0.1:7331@elsewhere.example/ is elsewhere
  if (inApp && /^https?:/.test(href) && !sameOrigin(href)) {
    event.preventDefault();
    openExternal(href);
  }
});
