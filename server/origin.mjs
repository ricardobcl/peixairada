// Who may ask: the board's own pages, and nothing a browser lets another site send (2026-09-27).
import { hostname, networkInterfaces } from 'node:os';
import { HOST, PORT } from './env.mjs';

// ---- who may ask: the board's own pages, and nothing a browser lets another site send ----------------------------
// Loopback is no trust boundary a browser keeps: any page open in one can POST here — start a claude in a folder the
// board knows, change its setup — and open a WebSocket to a drawer and type into it, since WebSockets have no
// same-origin rule at all (2026-09-27). So a request has to be the board's own page (its Origin is this server) or
// come from no browser at all (curl, the app's fetches and the tests send no Origin), and its Host has to be a
// loopback name: a DNS name pointed at 127.0.0.1 (rebinding) would be the same page from an origin that is not ours.
// A `null` Origin — a file:// page, a sandboxed frame — is nobody's. And a browser sends no Origin at all on a GET it
// makes for an <img>, a <script> or a navigation, so its Sec-Fetch-Site says whose page asked (2026-10-03): only this
// server's own, or the user typing the address; another site may at most navigate to the board itself — a tab, never
// a frame of its own (2026-10-14: an <iframe> of the board was a navigation too, and the page sent no word against
// being framed — clickjacking; it says frame-ancestors 'none' and X-Frame-Options DENY now, for a browser that sends no
// Sec-Fetch-Dest).
// Bound past loopback — every interface (HOST 0.0.0.0) or one address of the LAN's —, the Host is whichever address was
// used: it has to be an address, a loopback name or this Mac's own name (2026-10-14: any name passed, so a name rebound
// to the Mac's address was the board's own page again), the Origin must name that same host, and no Origin is only for
// a client on this Mac (2026-10-14: under HOST 0.0.0.0 alone before) — the LAN reached every route before. A client on
// the LAN that sends an Origin naming the Host is a browser there, and passes: nothing here tells it from a curl. The
// Host's port is the server's and an Origin's scheme http (2026-11-27, an outside audit's notes): neither could differ
// through a browser today, and the gate holds by itself.
/** Why a request to a server bound to `bind` on `port` is not the board's own page's asking, or null. Pure but for
 *  this Mac's name and addresses — exported for the tests, which ask it from the LAN. */
export function foreignTo(bind, port) {
  const loopback = new Set(['127.0.0.1', 'localhost', '[::1]', '::1', bind]);
  const open = !['127.0.0.1', 'localhost', '::1', '[::1]'].includes(bind);

  return req => {
    const hostPort = String(req.headers.host || '').toLowerCase();
    const host = hostPort.replace(/:\d+$/, '');

    if (host && !loopback.has(host) && !(open && (IP_HOST.test(host) || ownName(host)))) return `host ${host}`;
    if (host && (/:(\d+)$/.exec(hostPort)?.[1] || '80') !== String(port)) return `host ${hostPort}`;
    const site = req.headers['sec-fetch-site'];
    const dest = req.headers['sec-fetch-dest']; // a navigation of a tab, not of another site's frame (2026-10-14)

    if (
      site &&
      site !== 'same-origin' &&
      site !== 'none' &&
      !(
        req.headers['sec-fetch-mode'] === 'navigate' &&
        (!dest || dest === 'document') &&
        /^\/(index\.html)?(\?|#|$)/.test(req.url || '')
      )
    ) {
      return `site ${site}`;
    }

    const origin = req.headers.origin;

    if (origin === undefined) {
      return open && !thisMac(req.socket?.remoteAddress) ? `no origin, from ${req.socket?.remoteAddress}` : null;
    }

    let originUrl;

    try {
      originUrl = new URL(origin);
    } catch {
      return `origin ${origin}`;
    }

    const originPort = originUrl.port || '80';

    if (
      originUrl.protocol !== 'http:' ||
      (open ? originUrl.host !== hostPort : !loopback.has(originUrl.hostname)) ||
      originPort !== String(port)
    ) {
      return `origin ${origin}`;
    }

    return null;
  };
}

const IP_HOST = /^(\d{1,3}(\.\d{1,3}){3}|\[[0-9a-f:.]+\])$/; // an address cannot be rebound: a page from it is that machine's

const ownName = host => {
  const me = hostname()
    .toLowerCase()
    .replace(/\.local$/, '');

  return host === me || host === `${me}.local`;
};

const LOCAL_ADDR = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

const thisMac = address =>
  !!address &&
  (LOCAL_ADDR.has(address) ||
    Object.values(networkInterfaces())
      .flat()
      .some(entry => entry.address === address.replace(/^::ffff:/, '')));

export const foreign = foreignTo(HOST, PORT);
