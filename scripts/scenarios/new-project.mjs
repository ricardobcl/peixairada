// ⌥⌘N's project step since 2026-09-21: the board's own projects, then every folder under the org's directory that
// is on none of them, then ＋ clone <org>/<name> for a name that is neither — the way a repo you have never opened
// here becomes a chat. The clone itself is `gh repo clone` over the network, so the POST is stubbed; what this
// checks is the rows that are offered, and that choosing either of the new ones carries on into the new-chat flow
// in the right folder.
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// meta is read when this module is imported, and the server starts with it — so the folders are made here, not in
// the scenario body, and the server sees them from its first answer.
const ORG_DIR = mkdtempSync(join(tmpdir(), 'peix-org-'));
for (const f of ['alpha-service', 'ledger-service', 'wallet-api']) mkdirSync(join(ORG_DIR, f, '.git'), { recursive: true });
export const meta = { server: true, fixture: 'auto', env: { ORG_DIR, ORG: 'acme' } };

const type = (ctx, text) => ctx.evaluate(`(() => { const q = document.querySelector('#pickq'); q.value = ${JSON.stringify(text)}; q.dispatchEvent(new Event('input', { bubbles: true })); })()`);
const enter = ctx => ctx.evaluate(`document.querySelector('#pickq').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))`);
// Each row as it reads: the name without the path badge, what the badge says, the tail column, and its kind.
const rows = ctx => ctx.evaluate(`[...document.querySelectorAll('#picklist .pkrow')].map(r => { const n = r.querySelector('.n').cloneNode(true); const cur = n.querySelector('.cur'); const path = cur?.textContent || ''; cur?.remove(); return { name: n.textContent, path, tail: r.querySelector('.t')?.textContent || '', kind: r.classList.contains('clone') ? 'clone' : r.classList.contains('folder') ? 'folder' : 'project', sel: r.classList.contains('sel') }; })`);

export default async function (ctx) {
  const out = {};
  await ctx.waitFor(`window.peix.sessions().length > 0`, { what: 'the fixture chats on the board' });
  // Nothing may be spawned or cloned for real: the launchers are answered empty, the clone hands back the folder it
  // would have made, and a new chat is recorded and refused.
  await ctx.evaluate(`window.__posts = []; window.__cloned = []; const real = window.fetch; window.fetch = (u, o) => {
    const s = String(u);
    if (s.startsWith('/api/launchers')) return Promise.resolve({ ok: true, status: 200, json: async () => ({ launchers: [] }) });
    if (s === '/api/clone' && o?.method === 'POST') { const b = JSON.parse(o.body); window.__cloned.push(b.name); return Promise.resolve({ ok: true, status: 200, json: async () => ({ cwd: ${JSON.stringify(ORG_DIR)} + '/' + b.name, cloned: true }) }); }
    if (s === '/api/terminals' && o?.method === 'POST') { window.__posts.push(JSON.parse(o.body)); return Promise.resolve({ ok: false, status: 500, json: async () => ({ error: 'stubbed' }) }); }
    return real(u, o); }`);

  // ---- the step holds the board's projects and the org's folders ----
  await ctx.key('KeyN');
  await ctx.waitFor(`document.querySelector('#pickq').placeholder.startsWith('New chat —')`, { what: '⌥⌘N on the projects' });
  await ctx.waitFor(`[...document.querySelectorAll('#picklist .pkrow.folder')].length === 3`, { what: "the org's three folders, once the server has answered" });
  out.hint = await ctx.evaluate(`document.querySelector('#pickq').placeholder`);
  out.rows = await rows(ctx);
  await ctx.shot('new-chat-projects-and-folders');
  ctx.assert.ok(out.hint.includes(`a folder in ${ORG_DIR}`) && out.hint.includes('clone from acme'), `the box says what the step now takes, the directory named: ${out.hint}`);
  const kinds = out.rows.map(r => r.kind);
  ctx.assert.deepEqual([...new Set(kinds)], ['project', 'folder'], "the board's projects first, the org's folders after them");
  ctx.assert.deepEqual(out.rows.filter(r => r.kind === 'folder').map(r => r.name), ['alpha-service', 'ledger-service', 'wallet-api']);
  ctx.assert.ok(out.rows.find(r => r.name === 'alpha-service').path.startsWith('/'), 'a folder row shows where it is');

  // ---- typing ranks them with everything else, and a name that is none of them offers the clone ----
  await type(ctx, 'ledger');
  out.ledger = await rows(ctx);
  ctx.assert.equal(out.ledger[0].name, 'ledger-service', 'the folder the query matches leads');
  ctx.assert.ok(out.ledger[0].sel, '…and is the selection');
  await type(ctx, 'alpha-service');
  ctx.assert.equal((await rows(ctx)).filter(r => r.kind === 'clone').length, 0, 'a name that is a folder here is not offered as a clone');

  await type(ctx, 'brand-new-thing');
  out.clone = await rows(ctx);
  await ctx.shot('new-chat-clone-row');
  ctx.assert.deepEqual(out.clone.map(r => r.kind), ['clone'], 'nothing matches: the clone row is the whole list');
  ctx.assert.ok(out.clone[0].name.includes('acme/brand-new-thing'), `the row names the repo it would clone: ${out.clone[0].name}`);
  ctx.assert.equal(out.clone[0].path, `into ${ORG_DIR}`, 'and the directory it would land in');
  ctx.assert.ok(out.clone[0].sel, 'the clone row is what ⏎ takes');

  // ---- ⏎ on it: the clone, then the new chat in what it cloned ----
  await enter(ctx);
  await ctx.waitFor(`window.__posts.length === 1`, { what: 'the new chat in the cloned folder' });
  out.cloned = await ctx.evaluate(`window.__cloned`);
  out.afterClone = await ctx.evaluate(`window.__posts[0]`);
  ctx.assert.deepEqual(out.cloned, ['brand-new-thing'], 'the clone was asked for by name');
  ctx.assert.equal(out.afterClone.cwd, join(ORG_DIR, 'brand-new-thing'), 'and the chat starts in what came back');

  // ---- a folder that is already there: the same flow, no clone ----
  await ctx.key('KeyN');
  await ctx.waitFor(`document.querySelector('#pick').open && document.querySelector('#pickq').placeholder.startsWith('New chat —')`, { what: '⌥⌘N again' });
  await type(ctx, 'alpha-service');
  await enter(ctx);
  await ctx.waitFor(`window.__posts.length === 2`, { what: 'the new chat in the folder' });
  out.afterFolder = await ctx.evaluate(`window.__posts[1]`);
  ctx.assert.equal(out.afterFolder.cwd, join(ORG_DIR, 'alpha-service'), 'a folder with no chats goes straight to a new one in it');
  ctx.assert.deepEqual(await ctx.evaluate(`window.__cloned`), ['brand-new-thing'], 'and nothing else was cloned');
  return out;
}
