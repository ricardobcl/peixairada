#!/usr/bin/env node
// Instagram as a browser sees it, for the lunch menus (2026-10-18). The server runs this as a process of its own —
// Chrome stays out of the server, and a test's server runs scripts/fakes/fakeinstagram.mjs instead (INSTAGRAM_BIN) — and
// imports only its pure parts. Its one command prints one JSON object.
//
//   node lib/instagram.mjs look <handle>...      each profile, logged out: its newest posts, its story's time
//
// Logged out, a profile page is rendered by its script — a plain fetch gets a shell — and the rendered page carries its
// 12 newest posts (caption, picture, the alt text) and when its newest story went up, never what the story says.
// Never logged in (2026-11-23, docs/DECISIONS.md): no story is read — Instagram shows one only to someone logged in,
// and logging in wants a browser window of its own. Chrome runs headless, in a throwaway profile each time.
import { pathToFileURL } from 'node:url';
import { launchChrome, sleep } from './cdp.mjs';

// A post's id is its time (2026-10-18, checked against three posts' <time>): the top bits are milliseconds since
// Instagram's epoch, and the code in its address is the id in base 64.
const IG_EPOCH = 1314220021721;
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

export const pkOfCode = code =>
  String([...String(code)].reduce((value, ch) => value * 64n + BigInt(Math.max(0, B64.indexOf(ch))), 0n));

export const timeOfPk = pk => {
  try {
    return Number(BigInt(pk) >> 23n) + IG_EPOCH;
  } catch {
    return 0;
  }
};

/** The JSON value that starts at `start` in `text` — the page embeds its data as objects inside a script's text. */
export function jsonAt(text, start) {
  let depth = 0;
  let str = false;
  let esc = false;

  for (let index = start; index < text.length; index++) {
    const char = text[index];

    if (str) {
      if (esc) esc = false;
      else if (char === '\\') esc = true;
      else if (char === '"') str = false;
      continue;
    }

    if (char === '"') str = true;
    else if (char === '{' || char === '[') depth++;
    else if ((char === '}' || char === ']') && --depth === 0) return JSON.parse(text.slice(start, index + 1));
  }

  throw new Error('unterminated');
}

/** A rendered profile page, down to what the menus want: the account's id, when its newest story went up (ms, or 0),
 *  and its posts newest first — only its own (a collaborator's pinned to its grid is not), each with its time. */
export function parseProfile(html, handle) {
  const posts = [];
  const seen = new Set();
  const me = String(handle).toLowerCase();

  for (const match of html.matchAll(/\{"node":\{"__typename":"XIGPolaris\w*Media"/g)) {
    let node;

    try {
      node = jsonAt(html, match.index).node;
    } catch {
      continue;
    }

    if (!node?.code || seen.has(node.code)) continue;
    seen.add(node.code);
    const owner = String(node.user?.username || '').toLowerCase();

    if (owner && owner !== me) continue;
    const pk = node.pk || pkOfCode(node.code);

    posts.push({
      code: node.code,
      pk: String(pk),
      at: timeOfPk(pk),
      caption: node.caption?.text || '',
      alt: node.accessibility_caption || '',
      image: node.display_uri || null,
      kind: node.product_type || null,
      video: node.media_type === 2,
      many: node.carousel_media_count || 0,
      url: `https://www.instagram.com/p/${node.code}/`,
    });
  }

  posts.sort((left, right) => right.at - left.at);

  // the account's own record carries its story's time a little after its name; a suggested account's, after theirs
  let id = null;
  let storyAt = 0;

  for (const match of html.matchAll(/"latest_reel_media":(\d+)/g)) {
    const before = [
      ...html.slice(Math.max(0, match.index - 3000), match.index).matchAll(/"username":"([^"]+)"/g),
    ].pop();

    if (before?.[1].toLowerCase() !== me) continue;
    storyAt = Number(match[1]) * 1000;
    break;
  }

  const pid = html.match(/"profile_id":"(\d+)"/);

  if (pid) id = pid[1];
  return { id, storyAt, posts };
}

/** Why a page has no profile in it: a login wall, an account that is not there, or nothing that loaded. */
export function profileTrouble(html) {
  if (/Sorry, this page isn(&#039;|')t available|Esta página não está disponível/i.test(html)) return 'no such account';
  if (!/XIGPolaris|"profile_id"/.test(html) && /accounts\/login/.test(html)) return 'a login wall';
  return 'the profile did not load';
}

const CHROME_ARGS = ['--use-mock-keychain', '--lang=pt-PT'];
const out = value => process.stdout.write(`${JSON.stringify(value)}\n`);

async function waitHtml(chrome, test, ms = 15_000) {
  const t0 = Date.now();
  let html = '';

  while (Date.now() - t0 < ms) {
    try {
      html = await chrome.evaluate('document.documentElement.outerHTML');
    } catch {}

    if (test(html)) return html;
    await sleep(600);
  }

  return html;
}

async function look(handles) {
  const chrome = await launchChrome({ harness: false, width: 1280, height: 1000, args: CHROME_ARGS });
  const places = {};

  try {
    for (const [index, handle] of handles.entries()) {
      if (index) await sleep(4000 + Math.random() * 2000); // a person's pace, give or take

      try {
        await chrome.send('Page.navigate', { url: `https://www.instagram.com/${encodeURIComponent(handle)}/` });

        const html = await waitHtml(
          chrome,
          markup => /XIGPolaris\w*Media/.test(markup) && /"latest_reel_media"/.test(markup),
        );

        const profile = parseProfile(html, handle);

        places[handle] = profile.posts.length || profile.id ? profile : { error: profileTrouble(html) };
      } catch (error) {
        places[handle] = { error: error.message };
      }
    }
  } finally {
    await chrome.close();
  }

  out({ places });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [cmd, ...names] = process.argv.slice(2);

  if (cmd !== 'look' || !names.length) {
    process.stderr.write('usage: instagram.mjs look <handle>...\n');
    process.exit(2);
  }

  look(names).catch(error => {
    out({ error: error.message });
    process.exit(1);
  });
}
