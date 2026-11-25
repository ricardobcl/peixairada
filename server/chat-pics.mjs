// Pictures in the chat (2026-11-25): a picture a message names, fetched for the page and kept; one of yours, uploaded.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, renameSync, statSync, unlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join } from 'node:path';
import { readRaw } from './attach.mjs';
import { chat, chatErr, chatPicsAgain, ghRest, ghToken } from './chat.mjs';
import { STATE_FILE } from './env.mjs';
import { json } from './http.mjs';
import { privateDir } from './key.mjs';
import { setup } from './setup.mjs';

// A message's pictures are drawn by the page from here, never from their hosts: the page's policy lets in no picture
// but its own (pageCsp — it stands behind the transcript's sanitiser, which keeps a reply from calling a host), and a
// private repo's attachment is no address a page could load anyway. Which addresses are pictures (picUrl):
//   * GitHub's attachments — github.com/user-attachments/assets/<id> (and the older <owner>/<repo>/assets/<n>/<id>) —
//     what the board uploads and what GitHub's own page makes of a picture dropped there. A private repo's is shown
//     only through a signed address that lives five minutes, which GitHub writes into the HTML it renders for you:
//     POST /markdown renders them, a batch at a time (assetSrcs), and its answer is fetched at once. GitHub signs one
//     for whoever can read the repo it was uploaded against, whatever repo the markdown is rendered in.
//   * GIFs and pictures on a few hosts, linked or written as markdown pictures: Giphy (a page's address is its GIF's),
//     Tenor's media, Imgur's, GitHub's old user-images.
// Fetched once, through redirects that stay on those hosts, 10 MB at most, read as PNG, JPEG, GIF or WebP by their
// first bytes or refused (never SVG: a script in a picture), and kept in the state folder's chat-pics/ by the
// address's hash — an attachment never changes —, the oldest let go past PIC_KEEP_MAX. GITHUB_API's own origin counts as
// GitHub's (the tests' fake serves its signed pictures there).
// An upload is GitHub's attachment endpoint (uploads.github.com/user-attachments/assets, gh's --attach), against the
// repo chat.pics names (server/chat.mjs: the chat's, or its files repo for a member who only reads it); its address
// goes into the message as a markdown picture, as GitHub's own uploader writes it, and its bytes straight into the keep.
export const PIC_MAX = 10 * 1024 * 1024;
const PIC_KEEP_MAX = Number(process.env.PIC_KEEP_MAX || 256 * 1024 * 1024),
  PIC_DIR = join(dirname(STATE_FILE), 'chat-pics');
// read from the environment here, not from chat.mjs: a module reads none of another's bindings as it loads (a cycle)
const GITHUB_UPLOADS = (process.env.GITHUB_UPLOADS || process.env.GITHUB_API || 'https://uploads.github.com').replace(
  /\/+$/,
  '',
);
const API_ORIGIN = process.env.GITHUB_API ? new URL(process.env.GITHUB_API).origin : null;
const ASSET =
  /^https:\/\/github\.com\/(?:user-attachments\/assets\/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}|[\w.-]+\/[\w.-]+\/assets\/\d+\/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})$/i;
const DIRECT =
  /^https:\/\/(?:user-images\.githubusercontent\.com|media[0-4]?\.giphy\.com|i\.giphy\.com|media\.tenor\.com|i\.imgur\.com)\/[\w./%~+-]+(?:\?[\w.=&%~+-]*)?$/i;
const GIPHY = /^https:\/\/(?:www\.)?giphy\.com\/(?:gifs|embed)\/(?:[\w-]*-)?([A-Za-z0-9]{6,40})\/?$/;
// where a fetch may go on to (a redirect): those hosts and GitHub's storage
const HOPS =
  /^(?:(?:[\w-]+\.)*(?:githubusercontent\.com|giphy\.com|tenor\.com|imgur\.com)|github\.com|github-production-user-asset-[\w-]+\.s3\.amazonaws\.com)$/i;
const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' };

/** A picture's address as the board fetches it — a Giphy page's is its GIF's —, or null for one it does not show.
 *  The page holds the same list (picOf in public/js/room.js). */
export function picUrl(u) {
  const s = String(u ?? '').trim(),
    g = GIPHY.exec(s);
  if (g) return `https://media.giphy.com/media/${g[1]}/giphy.gif`;
  return ASSET.test(s) || DIRECT.test(s) ? s : null;
}
/** What the bytes are, by their first few: one of EXT's types, or null. */
export function picType(b) {
  if (!b || b.length < 12) return null;
  if (b[0] === 0x89 && b.toString('latin1', 1, 4) === 'PNG') return 'image/png';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (/^GIF8[79]a$/.test(b.toString('latin1', 0, 6))) return 'image/gif';
  if (b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}
const hopOk = u => {
  try {
    const x = new URL(u);
    return (x.protocol === 'https:' && HOPS.test(x.hostname)) || (!!API_ORIGIN && x.origin === API_ORIGIN);
  } catch {
    return false;
  }
};

// ---- the keep: chat-pics/<hash of the address>, the bytes alone --------------------------------------------------------
const keepFile = url => join(privateDir(PIC_DIR), createHash('sha256').update(url).digest('hex').slice(0, 40));
function kept(url) {
  try {
    const f = keepFile(url),
      b = readFileSync(f);
    if (!picType(b)) return null;
    const now = new Date();
    utimesSync(f, now, now);
    return b;
  } catch {
    return null;
  }
}
function keep(url, b) {
  try {
    const f = keepFile(url),
      tmp = `${f}.${process.pid}`;
    writeFileSync(tmp, b, { mode: 0o600 });
    renameSync(tmp, f);
    const all = readdirSync(PIC_DIR)
      .filter(n => /^[0-9a-f]{40}$/.test(n))
      .map(n => {
        const p = join(PIC_DIR, n),
          st = statSync(p);
        return { p, size: st.size, at: st.mtimeMs };
      });
    let total = all.reduce((a, x) => a + x.size, 0);
    if (total > PIC_KEEP_MAX)
      for (const x of all.sort((a, b) => a.at - b.at)) {
        if (total <= PIC_KEEP_MAX * 0.75) break;
        try {
          unlinkSync(x.p);
          total -= x.size;
        } catch {}
      }
  } catch (e) {
    console.error('[peixairada] chat: a picture not kept:', e.message);
  }
}

// ---- fetching -------------------------------------------------------------------------------------------------------
/** The bytes at `url`, through redirects that stay on the picture hosts, PIC_MAX at most. */
async function fetchPic(url) {
  for (let hop = 0; hop < 5; hop++) {
    if (!hopOk(url)) throw chatErr(403, 'a picture somewhere the chat does not fetch from');
    const r = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(30_000),
      headers: { 'user-agent': 'peixAIrada', accept: 'image/*' },
    });
    const to = r.status >= 300 && r.status < 400 && r.headers.get('location');
    if (to) {
      await r.body?.cancel().catch(() => {});
      url = new URL(to, url).href;
      continue;
    }
    if (!r.ok) {
      await r.body?.cancel().catch(() => {});
      throw chatErr(r.status === 404 || r.status === 403 ? 404 : 502, `its host answered ${r.status}`);
    }
    if (Number(r.headers.get('content-length')) > PIC_MAX) {
      await r.body?.cancel().catch(() => {});
      throw chatErr(413, 'larger than 10 MB');
    }
    const parts = [];
    let n = 0;
    for await (const c of r.body) {
      n += c.length;
      if (n > PIC_MAX) throw chatErr(413, 'larger than 10 MB');
      parts.push(c);
    }
    return Buffer.concat(parts);
  }
  throw chatErr(502, 'redirected too many times');
}
// GitHub's attachments, asked of POST /markdown a batch at a time: the asks of one moment go together, 20 to a call
const srcAsks = [];
let srcTimer = null;
function assetSrc(url) {
  return new Promise((ok, no) => {
    srcAsks.push({ url, ok, no });
    srcTimer ??= setTimeout(assetSrcs, 20);
  });
}
async function assetSrcs() {
  srcTimer = null;
  const batch = srcAsks.splice(0, 20);
  if (srcAsks.length) srcTimer = setTimeout(assetSrcs, 0);
  try {
    if (!chat.ready || !chat.repo) throw chatErr(409, 'the chat is still being read');
    const html =
      (
        await ghRest(
          'POST',
          '/markdown',
          { text: batch.map(a => `![](${a.url})`).join('\n\n'), mode: 'gfm', context: chat.repo },
          undefined,
          { text: true },
        )
      ).data || '';
    const srcs = [...html.matchAll(/<img\b[^>]*?\ssrc="([^"]+)"/g)].map(m => m[1].replace(/&amp;/g, '&'));
    batch.forEach((a, i) => {
      const id = a.url.split('/').pop(),
        src =
          srcs.find(x => x.includes(id) && x !== a.url) ||
          (srcs.length === batch.length && srcs[i] !== a.url ? srcs[i] : null);
      if (src) a.ok(src);
      else a.no(chatErr(404, 'GitHub shows you no picture there — not one shared with you'));
    });
  } catch (e) {
    for (const a of batch) a.no(e);
  }
}
const asking = new Map();
/** A picture's bytes, kept or fetched (once, however many ask at a time): {bytes, type}. */
export async function chatPic(raw) {
  const url = picUrl(raw);
  if (!url) throw chatErr(400, 'not a picture the chat shows');
  const hit = kept(url);
  if (hit) return { bytes: hit, type: picType(hit) };
  if (!asking.has(url))
    asking.set(
      url,
      (async () => {
        const b = await fetchPic(ASSET.test(url) ? await assetSrc(url) : url);
        if (!picType(b)) throw chatErr(415, 'not a picture — a PNG, JPEG, GIF or WebP');
        keep(url, b);
        return b;
      })().finally(() => asking.delete(url)),
    );
  const b = await asking.get(url);
  return { bytes: b, type: picType(b) };
}

// ---- uploading ------------------------------------------------------------------------------------------------------
/** Your picture up to GitHub, against the repo chat.pics names: {url, type, name}. */
export async function chatUpload(b, name) {
  if (!setup.chat || !chat.ready) throw chatErr(409, chat.error || 'the chat is still being read');
  const type = picType(b);
  if (!type) throw chatErr(415, 'not a picture — a PNG, JPEG, GIF or WebP');
  if (b.length > PIC_MAX) throw chatErr(413, 'larger than 10 MB');
  await chatPicsAgain();
  const to = chat.pics;
  if (!to?.id) throw chatErr(409, to?.why || 'no place for pictures yet');
  const stem =
      basename(String(name || ''))
        .replace(/\.[\w]{1,5}$/, '')
        .replace(/[^\w() .-]+/g, '_')
        .replace(/^[.\s]+/, '')
        .slice(0, 80) || 'picture',
    file = `${stem}.${EXT[type]}`;
  const u = `${GITHUB_UPLOADS}/user-attachments/assets?${new URLSearchParams({ name: file, content_type: type, repository_id: String(to.id) })}`;
  for (let again = 0; ; again++) {
    const token = await ghToken(again > 0);
    if (!token) throw chatErr(401, 'gh is not signed in here — gh auth login');
    const r = await fetch(u, {
      method: 'POST',
      body: b,
      signal: AbortSignal.timeout(120_000),
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/vnd.github+json',
        'content-type': 'application/octet-stream',
        'user-agent': 'peixAIrada',
      },
    });
    if (r.status === 401 && !again) continue;
    const d = await r.json().catch(() => null);
    // 404 is the endpoint's word for "you cannot write there" (gh's own reading of it)
    if (r.status === 404) throw chatErr(403, `GitHub takes pictures only from someone who can write to ${to.repo}`);
    if (!r.ok || typeof d?.url !== 'string')
      throw chatErr(
        r.status === 422 || r.status === 413 ? 400 : 502,
        `GitHub: ${d?.errors?.[0]?.message || d?.message || `HTTP ${r.status}`}`,
      );
    if (!picUrl(d.url)) throw chatErr(502, `GitHub gave back an address the chat does not show: ${d.url}`);
    keep(d.url, b);
    return { url: d.url, type, name: stem };
  }
}

/** GET /api/chat/pic?u=<address>: the picture's bytes, under a policy that runs nothing. POST /api/chat/upload?name= with
 *  the picture as the body (a browser's paste or drop), or ?path= a picture on this Mac (the app's drop: a path). */
export async function chatPicRoute(req, res, url, p) {
  try {
    if (req.method === 'GET' && p === '/api/chat/pic') {
      const { bytes, type } = await chatPic(url.searchParams.get('u'));
      res.writeHead(200, {
        'content-type': type,
        'content-length': bytes.length,
        'cache-control': 'private, max-age=31536000, immutable',
        'x-content-type-options': 'nosniff',
        'content-security-policy': "default-src 'none'; sandbox",
      });
      return res.end(bytes);
    }
    if (req.method === 'POST' && p === '/api/chat/upload') {
      const path = url.searchParams.get('path');
      let b,
        name = url.searchParams.get('name');
      if (path) {
        if (!isAbsolute(path) || !/\.(png|jpe?g|gif|webp)$/i.test(path))
          throw chatErr(400, 'a picture by its path: a PNG, JPEG, GIF or WebP');
        const st = statSync(path, { throwIfNoEntry: false });
        if (!st?.isFile()) throw chatErr(404, `no file at ${path}`);
        if (st.size > PIC_MAX) throw chatErr(413, 'larger than 10 MB');
        b = readFileSync(path);
        name ||= basename(path);
      } else {
        try {
          b = await readRaw(req, PIC_MAX);
        } catch (e) {
          res.setHeader('connection', 'close');
          throw chatErr(413, e.message === 'too large' ? 'larger than 10 MB' : String(e.message || e));
        }
      }
      return json(res, 200, await chatUpload(b, name));
    }
  } catch (e) {
    return json(res, [400, 401, 403, 404, 409, 413, 415].includes(e.status) ? e.status : 502, { error: e.message });
  }
  return json(res, 405, { error: `${req.method} ${p}: GET /api/chat/pic or POST /api/chat/upload` });
}
