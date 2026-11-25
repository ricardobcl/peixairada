  // ---- the board's key (2026-10-16) -----------------------------------------------------------------------------------
  // Every ask of the server carries it (the server's keyWant): `x-peix-key` from api(), `?key=` on the stream and a
  // drawer's socket (keyed). The app hands it to the page before this script runs (PEIX_KEY, `x-peix-app` with it: the
  // server requires the key from then on); a browser keeps it in this origin's storage, got by a ticket on the tab the
  // server opened (`#ticket=`, keyTicket) — never a cookie, which every server on 127.0.0.1 would be sent. Turned away
  // for want of it, the page is the lock (keyLock), and another tab of this browser taking the key opens it (`storage`).
  const KEY_STORE = 'peixairada-key', IN_APP = !!window.webkit?.messageHandlers?.hub;
  let boardKey = window.PEIX_KEY || (() => { try { return localStorage.getItem(KEY_STORE) || ''; } catch { return ''; } })();
  const keyed = url => boardKey ? `${url}${url.includes('?') ? '&' : '?'}key=${encodeURIComponent(boardKey)}` : url;
  const keyHeaders = () => boardKey ? { 'x-peix-key': boardKey, ...IN_APP && window.PEIX_KEY && { 'x-peix-app': '1' } } : {};
  function takeKey(k) { boardKey = k; try { localStorage.setItem(KEY_STORE, k); } catch {} }
  /** A ticket in the address — the tab the server opened — traded for the key, the address left plain. Every ask of the
   *  page's waits for it (keyReady): one sent before would go without the key. */
  async function keyTicket() {
    const t = /^#ticket=([\w-]+)$/.exec(location.hash)?.[1]; if (!t) return;
    history.replaceState(null, '', location.pathname + location.search);
    try {
      const r = await fetch('/api/key/claim', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ticket: t }) });
      const d = await r.json(); if (r.ok && d.key) takeKey(d.key);
    } catch {}
  }
  /** Turned away for want of the key (`missing`) or with one no longer the board's (`wrong`: a new one was made). */
  function keyLock(why) {
    if (why === 'wrong' && !window.PEIX_KEY) try { localStorage.removeItem(KEY_STORE); } catch {}
    const dlg = $('#lock'); if (dlg.open) return;
    $('#lock .wlogo').innerHTML = FISH_LOGO();
    $('#lockWhy').textContent = why === 'wrong' ? 'The one this page held is not the board\'s any more: a new key was made.' : '';
    $('#lockGo').hidden = IN_APP; $('#lockApp').hidden = !IN_APP; $('#lockHow').hidden = IN_APP; $('#lockSay').textContent = '';
    dlg.showModal(); repostPane();
  }
  addEventListener('storage', e => { if (e.key === KEY_STORE && e.newValue && e.newValue !== boardKey) location.reload(); });
  addEventListener('hashchange', () => { if (/^#ticket=/.test(location.hash)) keyTicket().then(() => location.reload()); });   // a ticket into this very tab
  /** One way to ask the server (2026-09-27; thirteen copies of the fetch, the header and the JSON.stringify before):
   *  JSON in, JSON out, and a throw with the server's own words — its `error`, else the status — when it says no. The
   *  board's key rides along (2026-10-16); a 401 for want of it is the lock. */
  const keyReady = keyTicket();
  async function api(method, url, body) {
    await keyReady;
    const headers = { ...keyHeaders(), ...body !== undefined && { 'content-type': 'application/json' } };
    const r = await fetch(url, body === undefined ? { method, headers } : { method, headers, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    if (r.status === 401 && d.key) keyLock(d.key);
    // a route the server does not have (its router's own `not found`): this page is newer than the server serving it — a
    // pull by hand, not restarted (2026-11-25: every pin, the day Pinned came) — and said so, with the way out (`old`)
    if (r.status === 404 && d.error === 'not found') throw Object.assign(new Error(`the server running is older than this page — ${state.update?.restart ? 'Settings › Updates restarts it' : 'scripts/launchd.sh restart restarts it'}`), { status: 404, body: d, old: true });
    if (!r.ok) throw Object.assign(new Error(d.error || `HTTP ${r.status}`), { status: r.status, body: d });
    return d;
  }

