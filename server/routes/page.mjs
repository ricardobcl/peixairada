// Routes: the page — put together from its parts (lib/page.mjs), stamped, served under its policy — and the vendored
// libraries.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readPage } from '../../lib/page.mjs';
import { ROOT, SINCE } from '../env.mjs';
import { json, NEXT } from '../http.mjs';

// The page follows a restart (2026-10-13): it is served with a stamp of itself and the boot of the server serving it
// (`SINCE`) in its head's meta, and every snapshot says which page is on disk now (`page`) — so a page that hears a
// server started since it was served, with another page on disk, reloads itself as an update's does (`pageFollows` in
// index.html): a restart by hand after a pull brings the page along. Put together from its parts each time, as it is
// served (lib/page.mjs): the agent serves the working tree's.
export const pageStamp = html => createHash('sha1').update(html).digest('hex').slice(0, 12);
// The page's policy (2026-11-06): its script is its own two inline blocks — by their hashes, worked out from the page as
// it is served, so an edit needs nothing here — and the vendored files; its connections this server alone, its pictures
// its own, data: and GitHub's faces; no plugin, frame, form target or <base>. It stands behind the sanitiser (md()): a
// script a reply's markup slipped past it, or an inline handler, would not run. Styles stay open — the page sets custom
// properties in style="" everywhere — and the app's own scripts (the key, the bridge's calls) are the shell's, outside it.
const PAGE_SCRIPTS = /<script>([\s\S]*?)<\/script>/g;
const SAFE_HOST = /^[\w.-]+(:\d+)?$|^\[[0-9a-f:.]+\](:\d+)?$/i;

export function pageCsp(html, host) {
  const hashes = [...html.matchAll(PAGE_SCRIPTS)].map(
    match => `'sha256-${createHash('sha256').update(match[1]).digest('base64')}'`,
  );

  const ws = SAFE_HOST.test(host || '') ? ` ws://${host}` : ''; // 'self' covers ws: in CSP 3; an older WebKit wants it named

  return [
    `default-src 'self'`,
    `script-src 'self' ${hashes.join(' ')}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob: https://avatars.githubusercontent.com`,
    `connect-src 'self'${ws}`,
    `font-src 'self' data:`,
    `media-src 'self' data: blob:`,
    `worker-src 'self' blob:`,
    `object-src 'none'`,
    `frame-src 'none'`,
    `base-uri 'none'`,
    `form-action 'none'`,
    `frame-ancestors 'none'`,
  ].join('; ');
}

/** The page, put together and stamped, under its policy. */
export async function pageRoute(req, res, url, path) {
  if (req.method === 'GET' && (path === '/' || path === '/index.html')) {
    const html = readPage();

    const body = html.replace(
      '<meta name="peix-page" content="">',
      `<meta name="peix-page" content="${pageStamp(html)}" data-since="${SINCE}">`,
    );

    res.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'content-security-policy': pageCsp(body, req.headers.host),
      'x-frame-options': 'DENY',
    }); // nobody's frame (foreignTo)

    return res.end(body);
  }

  return NEXT;
}

/** The vendored libraries, from public/vendor/. */
export async function vendorRoute(req, res, url, path) {
  let match;

  if (req.method === 'GET' && (match = path.match(/^\/vendor\/([\w.-]+\.(js|css))$/))) {
    const file = join(ROOT, 'public', 'vendor', match[1]);

    if (!existsSync(file)) return json(res, 404, { error: 'not found' });
    const body = readFileSync(file);

    res.writeHead(200, {
      'content-type': match[2] === 'css' ? 'text/css; charset=utf-8' : 'application/javascript; charset=utf-8',
      'cache-control': 'public, max-age=86400',
    });

    return res.end(body);
  }

  return NEXT;
}
