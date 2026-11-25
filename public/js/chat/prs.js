  // ---- PRs: the strip under the header, and where a GitHub link goes -------------------
  // github.com refuses to be framed, so inside the Mac app a PR opens in a pane beside the board —
  // a second web view the shell owns, asked for over the bridge — and in a plain browser it opens
  // a tab. Either way a strip under the header says what gh knows about it: state, review, checks,
  // size, branches. Non-GitHub links in the app go to the system browser the same way.
  const inApp = !!window.webkit?.messageHandlers?.hub;
  const post = m => window.webkit?.messageHandlers?.hub?.postMessage(m);
  // The fish's menu from anywhere (2026-11-01, round XIX's M2): a global key of your choosing, none by default (a default-on
  // one drew complaints elsewhere), registered by the app. It reaches the menu with the menu bar hidden, which is the fill.
  // A key needs two modifiers, or to be an F key, so it cannot take ⌘C from every other app; the board's own are refused.
  const summonName = k => `${k.mods.includes('ctrl') ? '⌃' : ''}${k.mods.includes('alt') ? '⌥' : ''}${k.mods.includes('shift') ? '⇧' : ''}${k.mods.includes('cmd') ? '⌘' : ''}${k.name}`;
  function summonDraw(asking) {
    $('#summonSet').textContent = asking ? 'Press the keys…' : prefs.fishKey ? summonName(prefs.fishKey) : 'Set a key…';
    $('#summonClear').hidden = asking || !prefs.fishKey;
  }
  const summonPost = () => post({ type: 'summon', code: prefs.fishKey?.code || '', mods: prefs.fishKey?.mods || [] });
  function summonRecord() {
    summonDraw(true);
    const stop = () => { removeEventListener('keydown', key, true); summonDraw(false); };
    const key = e => {
      e.preventDefault(); e.stopImmediatePropagation();
      if (['Alt', 'Control', 'Meta', 'Shift'].includes(e.key)) return;
      if (e.key === 'Escape') { stop(); return; }
      const mods = [e.ctrlKey && 'ctrl', e.altKey && 'alt', e.shiftKey && 'shift', e.metaKey && 'cmd'].filter(Boolean), fn = /^F\d+$/.test(e.code);
      if (!fn && mods.length < 2) { note($('#summonSet'), 'Two modifiers, or an F key: it works in every app'); return; }
      if (mods.length === 2 && mods.includes('alt') && mods.includes('cmd') && HOTKEYS[e.code]) { note($('#summonSet'), 'That one is the board\'s'); return; }
      prefs.fishKey = { code: e.code, mods, name: fn ? e.code : e.code.replace(/^(Key|Digit)/, '').replace(/^Enter$/, '⏎').replace(/^Space$/, '␣') };
      savePrefs(); summonPost(); stop();
    };
    addEventListener('keydown', key, true);
  }
  $('#fishRow').hidden = !inApp;
  $('#summonSet').addEventListener('click', summonRecord);
  $('#summonClear').addEventListener('click', () => { delete prefs.fishKey; savePrefs(); summonPost(); summonDraw(false); });
  summonDraw(false);
  if (inApp) summonPost();
  // The whole board larger or smaller (2026-10-12, the settings' text size): the app's web view zooms (pageZoom — the
  // page's CSS px stay its own, the app turns its places between the two); a browser has its own View → Zoom, which ⌘+
  // and ⌘− (the chat's own size here) do not reach. Posted on every load, as the app forgets.
  const zoomPick = () => { $('#zoomPick').value = String(prefs.pageZoom || 1); $('#zoomPick').hidden = !inApp; document.querySelector('#spLook .zhint').hidden = inApp; };
  const applyZoom = () => { if (inApp) post({ type: 'zoom', value: prefs.pageZoom || 1 }); zoomPick(); };
  $('#zoomPick').addEventListener('change', e => { prefs.pageZoom = +e.target.value || 1; savePrefs(); applyZoom(); });
  applyZoom();
  // Which full screen ⌃⌘F is in the app (2026-10-14): the fill, up to the notch, or macOS's own in a Space of its own —
  // the app keeps it too, for a launch that comes back full screen before this page has loaded.
  const fsPick = () => { $('#fsPick').value = prefs.fullSpace ? 'space' : 'fill'; $('#fsRow').hidden = !inApp; };
  const applyFull = () => { if (inApp) post({ type: 'fullscreen', space: !!prefs.fullSpace }); fsPick(); };
  $('#fsPick').addEventListener('change', e => { prefs.fullSpace = e.target.value === 'space'; savePrefs(); applyFull(); });
  applyFull();
  const GH_PR = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d+/;
  const IN_PANE = /^https?:\/\//;   // every web page (2026-09-26; GitHub and the board's own before, the rest went to the browser)
  // …unless the browser is picked (2026-10-21, prefs.pagesOut, Settings › General › Links): then only the sites the board
  // keeps (prefs.boardSites, github.com at first), each an address's start — a scheme or www. or none, matched whole up
  // to a / ? # or : — and the rest goes to the browser. A link out of a page in the pane to another site goes the same
  // way: the shell asks peixLinkOut. VS Code Web is the board's own, whatever the pick; an address typed into a blank tab
  // is asked for here.
  const siteOf = p => String(p).trim().replace(/^[a-z][\w+.-]*:\/\//i, '').replace(/^www\./i, '').toLowerCase();
  const sitesKept = () => (prefs.boardSites || []).map(siteOf).filter(Boolean);
  const inBoard = url => !prefs.pagesOut || sitesKept().some(p => { const u = siteOf(url); return u.startsWith(p) && (p.endsWith('/') || /^(?:$|[/?#:])/.test(u.slice(p.length))); });
  window.peixLinkOut = url => inApp && IN_PANE.test(url) && !inBoard(url);
  const pagesPick = () => {
    for (const b of document.querySelectorAll('#pagesPick [data-out]')) b.setAttribute('aria-checked', String(!!+b.dataset.out === !!prefs.pagesOut));
    const r = $('#sitesRow'), say = r.querySelector('small'), box = $('#boardSites');
    r.classList.toggle('off', !prefs.pagesOut); box.disabled = !prefs.pagesOut; say.textContent = prefs.pagesOut ? say.dataset.d : say.dataset.off;
    if (document.activeElement !== box) box.value = (prefs.boardSites || []).join(', ');
    $('#linksRow').hidden = !inApp;
  };
  for (const b of document.querySelectorAll('#pagesPick [data-out]')) b.addEventListener('click', () => { prefs.pagesOut = !!+b.dataset.out; savePrefs(); pagesPick(); });
  $('#boardSites').addEventListener('change', e => { prefs.boardSites = [...new Set(e.target.value.split(/[\s,]+/).map(x => x.trim()).filter(Boolean))]; savePrefs(); pagesPick(); });
  pagesPick();
  /** `ide`: the folder's editor, which only the editor's own row opens (2026-10-03; any http://127.0.0.1:<port>/ was
   *  taken for it before — a dev server's link replaced the folder's editor). `s`: the chat it is for, the open one
   *  unless said — an answer that comes after that chat was left records its tab there and shows nothing. */
  // What the board hands on (2026-11-06): a web page, mail, an editor's file — nothing else. In a browser it went by a
  // link's click (a javascript: one would have run here), in the app as `external`, which gives the system any scheme.
  const OUT_OK = /^(?:https?:\/\/|mailto:|(?:vscode|vscode-insiders|zed):\/\/file\/)/i;
  function openExternal(url, { ide = false, s = state.sessions.get(state.current), folder = s?.cwd } = {}) {
    if (!OUT_OK.test(String(url || ''))) { note($('#shead'), 'Not opened: the board opens web pages, mail and files in the editor', true); return; }
    // in a browser an app's URL (vscode://, zed://) is followed as a link is — the browser hands it over, or asks —, not
    // in a tab of its own, which stays blank (2026-10-13)
    if (!inApp) { if (IN_PANE.test(url)) window.open(url, '_blank', 'noopener'); else { const a = document.createElement('a'); a.href = url; a.click(); } return; }
    if (!IN_PANE.test(url) || !s || (!ide && !inBoard(url))) { post({ type: 'external', url }); return; }   // vscode://, zed://, mailto:… — the system's; a page off the board's sites, the browser
    // A page of the chat, on a tab of its own in the strip (2026-09-20): web pages one per URL, in the order first
    // opened — a PR, a docs page, a dev server (2026-09-26; the strip's ↗ is the way out to the browser); the folder's
    // editor, one per folder. Remembered here so they come back with the chat; the shell keeps a web view per page and
    // shows the one the tab says (syncTerm → postPane). The key's `gh:` is the name every page tab kept from when
    // GitHub's were the only ones. A page opened again is the tab it already has — while that tab is still at it: one
    // followed somewhere else leaves the page a new tab (2026-10-13, pageTab).
    let k = ide ? 'ide:' + url : pageTab(s, url), fresh = !k;
    if (ide && folder !== s.cwd) { const l = state.paneWt.get(s.id) || []; fresh = !l.includes(url); if (fresh) state.paneWt.set(s.id, [...l, url]); }   // another tree's editor: a tab of its own (2026-10-13)
    else if (ide) { fresh = false; if (s.cwd) { fresh = state.paneIde.get(s.cwd) !== url; state.paneIde.set(s.cwd, url); } }
    else if (fresh) { k = pageKey(s, url); state.paneGh.set(s.id, [...(state.paneGh.get(s.id) || []), k]); }
    if (s.id !== state.current) return;
    if (fresh) openNewTab(s, k); else setTab(s, k);
    syncTerm(s);
  }
  // The PR in front of you, for ⌥⌘G's picker to mark *current*. There was a strip under the header with what gh said
  // about it — state, review, checks, size, branches — until 2026-09-24: the page itself, on its tab, says all of that.
  const shownPr = { url: null };
  function hidePr() { shownPr.url = null; }
  function showPr(url) { shownPr.url = url; openExternal(url); }
  // Every link in the chat pane passes here: a PR chip or a PR link in a reply opens the PR (in the app, on a tab
  // of the chat); any other web link inside the app goes through openExternal — a tab of the pane — because a
  // web view without a UI delegate simply drops target=_blank. A vscode:// or zed:// link is left to navigate: the
  // shell's navigation policy hands it to the editor (a browser asks); the board's own links are the board's.
  // The copy button on a code block (2026-09-27, night): the block's text to the clipboard — the async API, else the
  // selection and execCommand (a page that is not a secure context, an old engine) — and "copied" on the button for a
  // second. The button itself is what says whether it worked; there is no toast.
  for (const box of [$('#log'), $('#agv')]) box.addEventListener('click', async e => {
    const b = e.target.closest('.codebox .copy'); if (!b) return;
    // the text as shown (2026-11-06): innerText leaves out what is not drawn, so a block cannot copy more than it shows
    const pre = b.closest('.codebox').querySelector('pre'), text = (pre.querySelector('code') || pre).innerText;
    let ok = false;
    try { await navigator.clipboard.writeText(text); ok = true; }
    catch { try { const r = document.createRange(); r.selectNodeContents(pre); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); ok = document.execCommand('copy'); sel.removeAllRanges(); } catch {} }
    b.textContent = ok ? 'copied' : 'failed'; b.classList.toggle('did', ok);
    clearTimeout(b.timer); b.timer = setTimeout(() => { b.textContent = 'copy'; b.classList.remove('did'); }, 1200);
  });
  // The turn's footer (2026-10-08): copy what Claude said since your last word — every text of the turn, as written
  // (markdown), a blank line between — and the same "copied" on the button.
  $('#log').addEventListener('click', async e => {
    const b = e.target.closest('.turnfoot .tcopy'); if (!b) return;
    const all = state.entries, end = all.findIndex(x => x.turnEnd && x.ts === b.dataset.ts); if (end < 0) return;
    let from = end; while (from > 0 && !(all[from - 1].role === 'user' && all[from - 1].kind === 'text')) from--;
    const text = all.slice(from, end + 1).filter(x => x.role === 'assistant' && x.kind === 'text').map(x => x.text.trim()).join('\n\n');
    let ok = false; try { await navigator.clipboard.writeText(text); ok = true; } catch {}
    const w = b.querySelector('span'); w.textContent = ok ? 'copied' : 'failed'; b.classList.toggle('did', ok);
    clearTimeout(b.timer); b.timer = setTimeout(() => { w.textContent = 'copy'; b.classList.remove('did'); }, 1200);
  });
  // a message's sender, or where a SendMessage went (2026-10-31): that chat, its card located
  $('#log').addEventListener('click', e => {   // an agent's row under the transcript, as on its card, or its call in it (2026-11-02)
    const c = e.target.closest('.agcall[data-ag]'), cs = c && state.sessions.get(state.current);
    if (cs) { agOpen(cs, { id: c.dataset.ag, asked: c.dataset.asked }); return; }
    const b = e.target.closest('.presence .agr'), s = b && state.sessions.get(state.current); if (!s) return;
    const k = b.dataset.k;
    if (k === '_more' || k === '_done' || k === '_sum') { agSwitch(s.id, k === '_more' ? 'more' : 'done'); fillAgents(); renderPresence(); return; }
    const r = s.agentRows?.find(x => x.id === b.dataset.ag); if (r) agOpen(s, r);
  });
  $('#log').addEventListener('click', e => {
    const b = e.target.closest('.peerlink[data-sid]'); if (!b) return;
    if (state.sessions.has(b.dataset.sid)) openSession(b.dataset.sid, { locate: true }); else note(b, 'That chat is not on the board');
  });
  $('#chat').addEventListener('click', e => {
    const a = e.target.closest('a[href]'); if (!a) return;
    const href = a.getAttribute('href') || '';
    if (href.startsWith('zed:') && zedMissing()) { e.preventDefault(); zedNote(a); return; }
    if (GH_PR.test(href) && !a.dataset.ext) { e.preventDefault(); showPr(href.match(GH_PR)[0]); return; }
    if (inApp && /^https?:/.test(href) && !href.startsWith(location.origin)) { e.preventDefault(); openExternal(href); }
  });

