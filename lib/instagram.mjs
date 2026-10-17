#!/usr/bin/env node
// Instagram as a browser sees it, for the lunch menus (2026-10-18). The server runs this as a process of its own —
// Chrome stays out of the server, and a test's server runs scripts/fakeinstagram.mjs instead (INSTAGRAM_BIN) — and
// imports only its pure parts. Each command prints one JSON object.
//
//   node lib/instagram.mjs look <handle>...                    each profile, logged out: its newest posts, its story's time
//   node lib/instagram.mjs stories --profile <dir> <id>...     those accounts' stories, logged in with the board's profile
//   node lib/instagram.mjs login --profile <dir>               a window to log in with; ends once logged in, or closed
//   node lib/instagram.mjs check --profile <dir>               whether that profile is logged in, and as whom
//
// Logged out, a profile page is rendered by its script — a plain fetch gets a shell — and the rendered page carries its
// 12 newest posts (caption, picture, the alt text) and when its newest story went up, never what the story says. A
// story is read only through a login: the web client's own endpoint, from a page of instagram.com in a profile that is
// logged in. That profile is the board's, in its state folder, with Chrome's mock keychain, so the window the login
// is typed into and the headless runs after it read the same cookies.
import { pathToFileURL } from 'node:url';
import { launchChrome, sleep } from './cdp.mjs';

// A post's id is its time (2026-10-18, checked against three posts' <time>): the top bits are milliseconds since
// Instagram's epoch, and the code in its address is the id in base 64.
const IG_EPOCH = 1314220021721;
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
export const pkOfCode = code => String([...String(code)].reduce((n, ch) => n * 64n + BigInt(Math.max(0, B64.indexOf(ch))), 0n));
export const timeOfPk = pk => { try { return Number(BigInt(pk) >> 23n) + IG_EPOCH; } catch { return 0; } };
export const APP_ID = '936619743392459';   // the web client's, sent with its own calls

/** The JSON value that starts at `i` in `text` — the page embeds its data as objects inside a script's text. */
export function jsonAt(text, i) {
  let depth = 0, str = false, esc = false;
  for (let j = i; j < text.length; j++) {
    const c = text[j];
    if (str) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') str = false; continue; }
    if (c === '"') str = true;
    else if (c === '{' || c === '[') depth++;
    else if ((c === '}' || c === ']') && --depth === 0) return JSON.parse(text.slice(i, j + 1));
  }
  throw new Error('unterminated');
}
/** A rendered profile page, down to what the menus want: the account's id, when its newest story went up (ms, or 0),
 *  and its posts newest first — only its own (a collaborator's pinned to its grid is not), each with its time. */
export function parseProfile(html, handle) {
  const posts = [], seen = new Set(), me = String(handle).toLowerCase();
  for (const m of html.matchAll(/\{"node":\{"__typename":"XIGPolaris\w*Media"/g)) {
    let n; try { n = jsonAt(html, m.index).node; } catch { continue; }
    if (!n?.code || seen.has(n.code)) continue;
    seen.add(n.code);
    const owner = String(n.user?.username || '').toLowerCase();
    if (owner && owner !== me) continue;
    const pk = n.pk || pkOfCode(n.code);
    posts.push({ code: n.code, pk: String(pk), at: timeOfPk(pk), caption: n.caption?.text || '', alt: n.accessibility_caption || '', image: n.display_uri || null,
      kind: n.product_type || null, video: n.media_type === 2, many: n.carousel_media_count || 0, url: `https://www.instagram.com/p/${n.code}/` });
  }
  posts.sort((a, b) => b.at - a.at);
  // the account's own record carries its story's time a little after its name; a suggested account's, after theirs
  let id = null, storyAt = 0;
  for (const m of html.matchAll(/"latest_reel_media":(\d+)/g)) {
    const before = [...html.slice(Math.max(0, m.index - 3000), m.index).matchAll(/"username":"([^"]+)"/g)].pop();
    if (before?.[1].toLowerCase() !== me) continue;
    storyAt = Number(m[1]) * 1000; break;
  }
  const pid = html.match(/"profile_id":"(\d+)"/); if (pid) id = pid[1];
  return { id, storyAt, posts };
}
/** Why a page has no profile in it: a login wall, an account that is not there, or nothing that loaded. */
export function profileTrouble(html) {
  if (/Sorry, this page isn(&#039;|')t available|Esta página não está disponível/i.test(html)) return 'no such account';
  if (!/XIGPolaris|"profile_id"/.test(html) && /accounts\/login/.test(html)) return 'a login wall';
  return 'the profile did not load';
}
/** A story as the endpoint gives it: its id, when, the biggest picture it has (a video's still), and the address. */
export function storyItems(reel, handle) {
  return (reel?.items || []).map(it => {
    const c = [...(it.image_versions2?.candidates || [])].sort((a, b) => (b.width || 0) - (a.width || 0));
    return { pk: String(it.pk || it.id || '').split('_')[0], at: (Number(it.taken_at) || 0) * 1000, image: c[0]?.url || null, video: !!it.video_versions?.length,
      url: `https://www.instagram.com/stories/${handle}/${String(it.pk || it.id || '').split('_')[0]}/` };
  }).filter(s => s.pk && s.image).sort((a, b) => b.at - a.at);
}

const CHROME_ARGS = ['--use-mock-keychain', '--lang=pt-PT'];
const out = o => process.stdout.write(JSON.stringify(o) + '\n');
async function waitHtml(c, test, ms = 15_000) {
  const t0 = Date.now(); let html = '';
  while (Date.now() - t0 < ms) {
    try { html = await c.evaluate('document.documentElement.outerHTML'); } catch {}
    if (test(html)) return html;
    await sleep(600);
  }
  return html;
}
async function cookies(c) {
  const r = await c.send('Network.getCookies', { urls: ['https://www.instagram.com/'] });
  const all = r.result?.cookies || [];
  return { session: all.some(k => k.name === 'sessionid' && k.value), user: all.find(k => k.name === 'ds_user_id')?.value || null };
}

async function look(handles) {
  const c = await launchChrome({ harness: false, width: 1280, height: 1000, args: CHROME_ARGS });
  const places = {};
  try {
    for (const [i, h] of handles.entries()) {
      if (i) await sleep(4000 + Math.random() * 2000);   // a person's pace, give or take
      try {
        await c.send('Page.navigate', { url: `https://www.instagram.com/${encodeURIComponent(h)}/` });
        const html = await waitHtml(c, t => /XIGPolaris\w*Media/.test(t) && /"latest_reel_media"/.test(t));
        const p = parseProfile(html, h);
        places[h] = p.posts.length || p.id ? p : { error: profileTrouble(html) };
      } catch (e) { places[h] = { error: e.message }; }
    }
  } finally { await c.close(); }
  out({ places });
}
async function stories(dir, ids) {
  const c = await launchChrome({ harness: false, profile: dir, width: 1280, height: 1000, args: CHROME_ARGS });
  try {
    await c.send('Network.enable');
    await c.send('Page.navigate', { url: 'https://www.instagram.com/' });
    await waitHtml(c, t => t.length > 50_000, 12_000);
    const who = await cookies(c);
    if (!who.session) return out({ loggedIn: false, stories: {} });
    const q = ids.map(id => `reel_ids=${encodeURIComponent(id)}`).join('&');
    const r = await c.evaluate(`fetch('/api/v1/feed/reels_media/?${q}', { headers: { 'x-ig-app-id': '${APP_ID}', 'x-requested-with': 'XMLHttpRequest' } })
      .then(async r => ({ status: r.status, body: r.ok ? await r.json() : null })).catch(e => ({ status: 0, error: String(e) }))`);
    if (!r?.body) return out({ loggedIn: true, user: who.user, stories: {}, error: `Instagram answered ${r?.status || r?.error || 'nothing'}` });
    const reels = r.body.reels_media || Object.values(r.body.reels || {}), found = {};
    for (const reel of reels) { const h = reel?.user?.username; if (h) found[h] = storyItems(reel, h); }
    out({ loggedIn: true, user: who.user, stories: found });
  } finally { await c.close(); }
}
async function login(dir) {
  const c = await launchChrome({ harness: false, headless: false, profile: dir, width: 520, height: 820, url: 'https://www.instagram.com/accounts/login/', args: CHROME_ARGS });
  let who = { session: false, user: null };
  try {
    await c.send('Network.enable');
    for (const t0 = Date.now(); Date.now() - t0 < 15 * 60_000;) {
      await sleep(1500);
      try { who = await cookies(c); } catch { break; }   // the window closed, and Chrome with it, or its page
      if (who.session) { await sleep(2500); break; }   // logged in: a moment for what the page saves after
    }
  } finally { await c.close(); }
  out({ loggedIn: who.session, user: who.user });
}
async function check(dir) {
  const c = await launchChrome({ harness: false, profile: dir, width: 800, height: 600, args: CHROME_ARGS });
  try { await c.send('Network.enable'); const who = await cookies(c); out({ loggedIn: who.session, user: who.user }); }
  finally { await c.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [cmd, ...rest] = process.argv.slice(2), at = rest.indexOf('--profile'), dir = at >= 0 ? rest[at + 1] : null;
  const names = at < 0 ? rest : rest.filter((x, i) => i !== at && i !== at + 1);
  const run = { look: () => look(names), stories: () => stories(dir, names), login: () => login(dir), check: () => check(dir) }[cmd];
  if (!run || (cmd !== 'look' && !dir)) { process.stderr.write('usage: instagram.mjs look <handle>... | stories|login|check --profile <dir> [id...]\n'); process.exit(2); }
  run().catch(e => { out({ error: e.message }); process.exit(1); });
}
