// ---- what's new (2026-11-24) -------------------------------------------------------------
// Once per news (`NEWS.id` into prefs.newsSeen): a page per example, its picture that example at work, the last page's
// button the thing itself. It waits for a quiet board — the welcome and the tour first, no dialog up, no chat asking
// you, the window in sight —, and Later brings it back once, the next day (prefs.newsLater). ⌥⌘L and the keys' sheet
// open it again whenever. A release's notes come the same way (2026-11-27, `relItem`): once the board's code is on a
// release this page has not shown (`prefs.releaseSeen`; 0.1, the last before any, until then), a page a release since,
// newest first, as CHANGELOG.md has them (GET /api/update/notes) — whatever moved it there, the board, make update or a
// pull. A tour that names its release (`NEWS.release`) comes first, in the same dialog.
const NEWS_STARS = [
  [40, 30],
  [120, 176],
  [300, 22],
  [420, 58],
  [440, 170],
  [230, 196],
  [70, 120],
]
  .map(([x, y]) => `<i class="st" style="left:${x}px;top:${y}px"></i>`)
  .join('');
const NEWS = {
  id: 'space',
  name: 'Space',
  go: () => {
    if (!prefs.space) spToggle();
  },
  goSay: 'Open Space',
  pages: [
    {
      title: 'Answer without opening the chat',
      text: '<b>Space</b> (<kbd>⌥⌘X</kbd>) lays every chat out as a node, its agents round it. A node asking you rings red: click its pill and press a number — the answer reaches the chat, and you stay where you were.',
      pic: () =>
        `<div class="nn" data-st="ask" style="left:28px;top:64px"><b>Queue for invoice webhooks</b><small>billing-api</small></div><span class="npill q" style="left:46px;top:152px">? 3 answers</span>` +
        `<div class="nbox" style="left:196px;top:44px;width:244px"><p class="q">Which queue should the invoice webhooks go on?</p><div class="o"><kbd>1</kbd>SQS</div><div class="o on"><kbd>2</kbd>Kafka topic — billing reads it</div><div class="o"><kbd>3</kbd>Postgres and a worker</div></div>`,
    },
    {
      title: 'Find what needs a look',
      text: '<kbd>⌘F</kbd> in Space finds a chat by its words, and a word with a colon is a filter: <code>is:asking</code>, <code>pr:changes</code>, <code>@security</code> an agent’s type, <code>#storefront</code> a project.',
      pic: () =>
        `<div class="nfind"><code>is:asking</code><code>pr:changes</code><span>retry</span><span class="n">1 of 14</span></div><div class="nn" data-st="ask" style="left:170px;top:112px"><b>Retry declined card payments</b><small>storefront</small></div>`,
    },
    {
      title: 'See where each PR stands',
      text: 'A node’s PR pill counts its PRs still open. Point at it: each one’s review — <b>changes requested</b>, <b>approved</b>, threads left open — and which are at your move. A row opens the PR beside the chat.',
      pic: () =>
        `<div class="nn" data-st="work" style="left:28px;top:66px"><b>Retry declined card payments</b><small>storefront</small></div><span class="npill" style="left:52px;top:154px">⎇ 2 PRs</span>` +
        `<div class="nbox" style="left:190px;top:60px;width:256px"><div class="pr"><i></i><span><b>store#11</b> Retry declined cards</span><em class="chg">changes</em></div><div class="pr"><i></i><span><b>store#13</b> Backoff on 429s</span><em class="ok">approved</em></div></div>`,
    },
    {
      title: 'Tidy up in one go',
      text: '<kbd>⇧</kbd>-click the chats you are finished with — or <kbd>⇧</kbd> and the arrows — and the bar marks them <b>Done</b>, stars or mutes them all at once. <kbd>D</kbd> on one node does the same for it.',
      pic: () =>
        `<div class="nn on" data-st="ready" style="left:48px;top:44px"><b>Product grid theme</b><small>storefront</small></div><div class="nn on" data-st="ready" style="left:206px;top:44px"><b>Write the retry docs</b><small>docs</small></div>` +
        `<div class="nbar" style="left:104px;top:146px"><b style="padding:0 4px">2 chosen</b><span class="go">✓ Done</span><span>★</span><span>Mute</span></div>`,
    },
  ],
};
const news = { i: 0, hold: false, timer: 0, later: false, item: NEWS };
const seenNews = id => (prefs.newsSeen || []).includes(id);
function newsDone() {
  return seenNews(NEWS.id);
}
/** -1, 0, 1 as release `a` is older than, the same as, newer than `b` (lib/changelog.mjs' verCmp). */
const relCmp = (a, b) => {
  const p = v => (/^v?(\d+)\.(\d+)(?:\.(\d+))?$/.exec(String(v || '')) || []).slice(1).map(Number);
  const x = p(a),
    y = p(b);
  for (let k = 0; k < 3; k++) if ((x[k] || 0) !== (y[k] || 0)) return (x[k] || 0) < (y[k] || 0) ? -1 : 1;
  return 0;
};
/** What's new for a release's notes: a page a release, the tour of the newest first when it names it (`tour`). */
function relItem(notes, running, withTour = true) {
  const pages = notes.map(n => ({
    title: `What’s new in ${relName(n.version)}`,
    tag: `Release ${relName(n.version)}${n.title ? ` · ${n.title}` : ''}`,
    md: n.md,
  }));
  const tour = withTour && NEWS.release && !newsDone() && relCmp(NEWS.release, notes[0]?.version) === 0;
  return {
    id: `release:${running}`,
    running,
    name: relName(running),
    pages: tour ? [...NEWS.pages, ...pages] : pages,
    go: tour ? NEWS.go : () => {},
    goSay: tour ? NEWS.goSay : 'Done',
    also: tour ? NEWS.id : null,
  };
}
// the notes asked once per release the board is on, and nothing asked while the server has nothing newer to say
const relNews = { for: null, item: null, asking: false, failedAt: 0 };
function relPending() {
  const run = state.update?.running,
    seen = prefs.releaseSeen || '0.1.0';
  if (!run || relCmp(run, seen) <= 0) return null;
  if (relNews.for === run) return relNews.item;
  if (relNews.asking || Date.now() - relNews.failedAt < 60_000) return null;
  relNews.asking = true;
  api('GET', `/api/update/notes?since=${encodeURIComponent(seen)}`)
    .then(r => {
      relNews.for = run;
      relNews.item = r.notes?.length ? relItem(r.notes, run) : null;
      if (relNews.item) return newsSoon();
      prefs.releaseSeen = run; // a release with no notes: nothing to show, seen
      savePrefs();
    })
    .catch(() => {
      relNews.failedAt = Date.now();
    })
    .finally(() => {
      relNews.asking = false;
    });
  return null;
}
/** What comes next by itself: a release's notes (with its tour), else the tour not seen yet. */
const newsNext = () => relPending() || (newsDone() ? null : NEWS);
/** self: opened by itself — the app not brought forward, the keys on the dialog, not on Next, so a ⏎ or a space meant
 *  for where they were presses nothing (2026-11-24, review). `item`: the tour (NEWS) or a release's notes (relItem). */
function newsOpen(i = 0, self = false, item = NEWS) {
  const dlg = $('#news');
  if (!dlg.open) {
    for (const d of document.querySelectorAll('dialog[open]')) d.close();
    news.later = false;
    news.item = item;
    dlg.showModal();
    repostPane();
    if (inApp && !self) post({ type: 'focus' });
  }
  newsShow(i, !self);
  if (self) {
    dlg.tabIndex = -1;
    dlg.focus({ preventScroll: true });
  }
}
/** The newest releases' notes on demand (⌥⌘L › Release notes): every one the checkout has, newest first. */
function relNotesOpen() {
  api('GET', '/api/update/notes?since=0.0.0')
    .then(r => {
      if (!r.notes?.length) return note($('#sbar'), 'No release notes here yet — CHANGELOG.md has none', true);
      newsOpen(0, false, relItem(r.notes.slice(0, 3), r.running, false));
    })
    .catch(err => note($('#sbar'), `Could not read the release notes: ${err.message}`, true));
}
function newsShow(i, keys = true) {
  const it = news.item,
    n = it.pages.length;
  news.i = Math.max(0, Math.min(n - 1, i));
  const pg = it.pages[news.i],
    last = news.i === n - 1,
    notes = pg.md != null;
  $('#news').classList.toggle('notes', notes);
  $('#newsPic').innerHTML = notes ? '' : NEWS_STARS + pg.pic();
  $('#newsTag').textContent = notes
    ? `${pg.tag}${n > 1 ? ` · ${news.i + 1} of ${n}` : ''}`
    : `New in ${NEWS.name} · ${news.i + 1} of ${n}`;
  $('#newsTitle').textContent = pg.title;
  $('#newsText').innerHTML = notes ? '' : pg.text;
  $('#newsText').hidden = notes;
  setHtml($('#newsMd'), notes ? md(pg.md).html : '');
  $('#newsMd').hidden = !notes;
  $('#newsMd').scrollTop = 0;
  $('#newsDots').innerHTML =
    n > 1
      ? it.pages
          .map(
            (p, k) =>
              `<button type="button" class="${k === news.i ? 'on' : ''}" data-i="${k}" tabindex="-1" aria-label="${k + 1}: ${esc(p.title)}"></button>`,
          )
          .join('')
      : '';
  $('#newsBack').hidden = !news.i;
  $('#newsLater').hidden = last;
  $('#newsNext').textContent = last ? it.goSay : 'Next';
  $('#newsNext').title = last ? `${it.goSay} · ⏎` : 'The next page · →';
  $('#newsSay').textContent = `Page ${news.i + 1} of ${n}: ${pg.title}`;
  const b = $('#newsBody');
  b.classList.remove('in');
  void b.offsetWidth;
  b.classList.add('in');
  if (keys) $('#newsNext').focus({ preventScroll: true });
}
/** Shown once it is quiet; called on every board draw, so it only looks. */
function newsSoon() {
  if (news.timer || news.hold || !newsNext()) return;
  news.timer = setTimeout(() => {
    news.timer = 0;
    const item = newsNext();
    if (
      !item ||
      news.hold ||
      document.hidden ||
      Date.now() < (prefs.newsLater || 0) ||
      document.querySelector('dialog[open]')
    )
      return;
    if ([...state.sessions.values()].some(askingLoud)) return; // a question first: it comes back on the next draw
    // nor under your hands: the window not in front (a pane page has the keys), a terminal or a box with them (review) —
    // looked at again in a moment, not on the next draw, which a board at rest may not have
    if (!document.hasFocus() || document.activeElement?.closest?.('input, textarea, select, [contenteditable], .xterm'))
      return newsSoon();
    newsOpen(0, true, item);
  }, 1500);
}
$('#newsNext').onclick = () => {
  if (news.i < news.item.pages.length - 1) return newsShow(news.i + 1);
  $('#news').close();
  news.item.go();
};
$('#newsBack').onclick = () => newsShow(news.i - 1);
$('#newsX').onclick = () => $('#news').close();
$('#newsLater').onclick = () => {
  news.later = true;
  $('#news').close();
};
$('#newsDots').addEventListener('click', e => {
  const d = e.target.closest('button[data-i]');
  if (d) newsShow(+d.dataset.i);
});
$('#news').addEventListener('keydown', e => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === 'ArrowRight' && news.i < news.item.pages.length - 1) {
    e.preventDefault();
    newsShow(news.i + 1);
  } else if (e.key === 'ArrowLeft' && news.i) {
    e.preventDefault();
    newsShow(news.i - 1);
  }
});
// closed any way but Later — ×, esc, a key that closes dialogs, the last page's button — it is seen; Later once, then seen.
// A release's notes are seen by the release (prefs.releaseSeen), and the tour that came with them by its id.
$('#news').addEventListener('close', () => {
  const it = news.item;
  $('#newsPic').innerHTML = '';
  setHtml($('#newsMd'), '');
  const done = it.running ? relCmp(it.running, prefs.releaseSeen || '0.1.0') <= 0 : seenNews(it.id);
  if (done) return;
  if (news.later && !prefs.newsLater) {
    const d = new Date();
    d.setHours(24, 0, 0, 0);
    prefs.newsLater = d.getTime();
  } else {
    if (it.running) {
      prefs.releaseSeen = it.running;
      relNews.item = null;
    }
    const ids = [it.running ? it.also : it.id].filter(Boolean);
    if (ids.length) prefs.newsSeen = [...new Set([...(prefs.newsSeen || []), ...ids])];
  }
  savePrefs();
});
