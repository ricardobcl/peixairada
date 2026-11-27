// ---- the board's key (2026-10-16) -----------------------------------------------------------------------------------
// Every ask of the server carries it (the server's keyWant): `x-peix-key` from api(), `?key=` on the stream and a
// drawer's socket (keyed). The app hands it to the page before this script runs (PEIX_KEY, `x-peix-app` with it: the
// server requires the key from then on); a browser keeps it in this origin's storage, got by a ticket on the tab the
// server opened (`#ticket=`, keyTicket) — never a cookie, which every server on 127.0.0.1 would be sent. Turned away
// for want of it, the page is the lock (keyLock), and another tab of this browser taking the key opens it (`storage`).
const KEY_STORE = 'peixairada-key';
const IN_APP = !!window.webkit?.messageHandlers?.hub;

let boardKey =
  window.PEIX_KEY ||
  (() => {
    try {
      return localStorage.getItem(KEY_STORE) || '';
    } catch {
      return '';
    }
  })();

// The server proves itself before the key goes to it (2026-11-27, the external audit's lead 2), as the app does before
// it loads the page: `/api/alive` asked with a nonce and no key answers the nonce's HMAC under the board's key
// (aliveProof), checked here by WebCrypto. A server that restarts leaves the port free a moment, and another account's
// process could take it: the stream's own retry (EventSource's) and every ask sent the key to whatever answered. So
// nothing keyed goes out until a proof holds, and every drop of the stream, a drawer's socket or an ask doubts it again
// (doubtServer). Something that answers with no proof is the lock (`unproven`), and nothing is sent it. Without
// WebCrypto (a board bound past loopback, over plain http: no secure context) there is nothing to check it with. One
// proof at a time: a doubt while one is under way leaves it to finish, which every ask then waits on.
let proven = null; // the proof under way, as a promise; null: none
let keyTrusted = !boardKey; // a proof holds now: keyed() and keyHeaders() carry the key only then

const keyHex = bytes => [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');

/** Whether what answers on the port holds the board's key: true, false (something answers without the proof), or null
 *  (nothing answers). */
async function aliveProven() {
  const nonce = keyHex(crypto.getRandomValues(new Uint8Array(16)));
  let response;

  try {
    response = await fetch('/api/alive', { headers: { 'x-peix-nonce': nonce }, cache: 'no-store' });
  } catch {
    return null;
  }

  const enc = new TextEncoder();

  const hmacKey = await crypto.subtle.importKey('raw', enc.encode(boardKey), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);

  return (
    response.headers.get('x-peix-proof') ===
    keyHex(await crypto.subtle.sign('HMAC', hmacKey, enc.encode(`peix-alive:${nonce}`)))
  );
}

function serverProven() {
  if (keyTrusted) return Promise.resolve();

  if (!crypto.subtle) {
    keyTrusted = true;
    return Promise.resolve();
  }

  return (proven ||= (async () => {
    for (let wait = 250; ; wait = Math.min(5000, wait * 2)) {
      const ok = await aliveProven().catch(() => null);

      if (ok) {
        keyTrusted = true;
        proven = null;
        return;
      }

      if (ok === false) keyLock('unproven');
      await new Promise(resolve => setTimeout(resolve, wait));
    }
  })());
}

function doubtServer() {
  if (boardKey) keyTrusted = false;
}

const keyed = url => {
  if (!keyTrusted) serverProven(); // unkeyed meanwhile: a drawer's socket turned away tries again
  return boardKey && keyTrusted ? `${url}${url.includes('?') ? '&' : '?'}key=${encodeURIComponent(boardKey)}` : url;
};

const keyHeaders = () =>
  boardKey && keyTrusted ? { 'x-peix-key': boardKey, ...(IN_APP && window.PEIX_KEY && { 'x-peix-app': '1' }) } : {};

function takeKey(key) {
  boardKey = key;
  doubtServer();

  try {
    localStorage.setItem(KEY_STORE, key);
  } catch {}
}

/** A ticket in the address — the tab the server opened — traded for the key, the address left plain. Every ask of the
 *  page's waits for it (keyReady): one sent before would go without the key. */
async function keyTicket() {
  const ticket = /^#ticket=([\w-]+)$/.exec(location.hash)?.[1];

  if (!ticket) return;
  history.replaceState(null, '', location.pathname + location.search);

  try {
    const response = await fetch('/api/key/claim', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ticket }),
    });

    const data = await response.json();

    if (response.ok && data.key) takeKey(data.key);
  } catch {}
}

/** Turned away for want of the key (`missing`) or with one no longer the board's (`wrong`: a new one was made). */
function keyLock(why) {
  if (why === 'wrong' && !window.PEIX_KEY) {
    try {
      localStorage.removeItem(KEY_STORE);
    } catch {}
  }

  const dlg = $('#lock');

  if (dlg.open) return;
  $('#lock .wlogo').innerHTML = FISH_LOGO();

  $('#lockWhy').textContent =
    why === 'wrong'
      ? "The one this page held is not the board's any more: a new key was made."
      : why === 'unproven'
        ? "What answers on the board's port cannot show it holds this page's key — a new key was made, or it is not the board. Nothing was sent to it."
        : '';

  $('#lockGo').hidden = IN_APP;
  $('#lockApp').hidden = !IN_APP;
  $('#lockHow').hidden = IN_APP;
  $('#lockSay').textContent = '';
  dlg.showModal();
  repostPane();
}

addEventListener('storage', event => {
  if (event.key === KEY_STORE && event.newValue && event.newValue !== boardKey) location.reload();
});

addEventListener('hashchange', () => {
  if (/^#ticket=/.test(location.hash)) keyTicket().then(() => location.reload());
}); // a ticket into this very tab

/** One way to ask the server (2026-09-27; thirteen copies of the fetch, the header and the JSON.stringify before):
 *  JSON in, JSON out, and a throw with the server's own words — its `error`, else the status — when it says no. The
 *  board's key rides along (2026-10-16); a 401 for want of it is the lock. */
const keyReady = keyTicket();
/** Before anything keyed: the ticket traded, then the server proven. */
const keySafe = () => keyReady.then(serverProven);
const KEYLESS = /^\/api\/key\/(open|claim)$/; // the lock's own asks: no key, so no proof to wait for

async function api(method, url, body) {
  const bare = KEYLESS.test(url);

  await (bare ? keyReady : keySafe());
  const headers = { ...(!bare && keyHeaders()), ...(body !== undefined && { 'content-type': 'application/json' }) };
  let response;

  try {
    response = await fetch(
      url,
      body === undefined ? { method, headers } : { method, headers, body: JSON.stringify(body) },
    );
  } catch (error) {
    doubtServer(); // nothing answered: whatever answers next proves itself first
    throw error;
  }

  const data = await response.json().catch(() => ({}));

  if (response.status === 401 && data.key) keyLock(data.key);

  // a route the server does not have (its router's own `not found`): this page is newer than the server serving it — a
  // pull by hand, not restarted (2026-11-25: every pin, the day Pinned came) — and said so, with the way out (`old`)
  if (response.status === 404 && data.error === 'not found') {
    throw Object.assign(
      new Error(
        `the server running is older than this page — ${state.update?.restart ? 'Settings › Updates restarts it' : 'scripts/launchd.sh restart restarts it'}`,
      ),
      { status: 404, body: data, old: true },
    );
  }

  if (!response.ok) {
    throw Object.assign(new Error(data.error || `HTTP ${response.status}`), { status: response.status, body: data });
  }

  return data;
}
