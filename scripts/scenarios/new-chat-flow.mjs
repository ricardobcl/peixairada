// The chats step (2026-09-21): ⌥⌘N and ⌥⌘O both end on a list of open chats with ＋ new chat at its head.
// ⌥⌘O asks the environment first and shows only the chats the server recorded under it (state.json's `envs`,
// seeded here and read back after a restart); ⌥⌘N shows the project's chats whatever their environment, newest
// by your last touch. Typing moves the selection off ＋ onto the first match, and back onto it when nothing
// matches — which is how a name no chat has yet starts one. The environment step counts what each one holds, and
// the cards in the chat column wear the environment they were started in.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { makeFixture } from '../fixture.mjs';

// ⌥⌘N's project step also lists the folders under the org's directory — an empty one of the test server's own,
// so this stays about the board's projects and off whatever ~/acme holds (lib/testserver.mjs sets ORG_DIR).
export const meta = { server: true, fixture: 'auto' };

const enter = ctx => ctx.evaluate(`document.querySelector('#pickq').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))`);
// In an IIFE: every evaluate lands in the same global scope, and a bare `const q` can only be declared once.
const type = (ctx, text) => ctx.evaluate(`(() => { const q = document.querySelector('#pickq'); q.value = ${JSON.stringify(text)}; q.dispatchEvent(new Event('input', { bubbles: true })); })()`);
// The rows as they read: the title without the "current" tag the open chat wears, what the .num column says, and
// whether the row is selected / is the new-chat row.
const rows = ctx => ctx.evaluate(`[...document.querySelectorAll('#picklist .pkrow')].map(r => { const n = r.querySelector('.n').cloneNode(true); n.querySelector('.cur')?.remove(); return { name: n.textContent, env: r.querySelector('.num')?.textContent || '', pills: r.querySelector('.pills')?.textContent || '', sel: r.classList.contains('sel'), isNew: r.classList.contains('new') }; })`);
const closePick = ctx => ctx.evaluate(`document.querySelector('#pick').close()`);

export default async function (ctx) {
  const out = {};
  const oracleCwd = join(tmpdir(), 'peix-oracle-flow', 'oracle');
  const h = n => new Date(Date.now() - n * 3600e3);
  // Three oracle chats in one folder, oldest first — two started through a launcher, one bare `claude`.
  const [prod, sand] = makeFixture(ctx.fixture.dir, [
    { cwd: oracleCwd, title: 'ledger sweep', prompt: 'sweep the production ledger', reply: 'swept', at: h(3) },
    { cwd: oracleCwd, title: 'replay a batch', prompt: 'replay yesterday\'s batch', reply: 'replayed', at: h(2) },
    { cwd: oracleCwd, title: 'read the Taskfile', prompt: 'what does this folder do?', reply: 'it launches claude', at: h(1) },
  ]).chats;
  // The environments the server would have recorded when those drawers were tied to their chats. Only a restart
  // reads state.json, so seed it and bounce the server; the page loses its SSE with it and reloads, as the app does.
  writeFileSync(join(ctx.server.dir, 'state.json'), JSON.stringify({ envs: { [prod.id]: 'production-workload', [sand.id]: 'sandbox-workload' } }));
  await ctx.server.restart();
  await ctx.send('Page.reload'); await ctx.sleep(1500);
  await ctx.waitFor(`window.peix.sessions().filter(s => s.cwd === ${JSON.stringify(oracleCwd)}).length === 3`, { what: 'the three oracle chats on the board' });
  out.envs = await ctx.peix(`sessions().filter(s => s.cwd === ${JSON.stringify(oracleCwd)}).map(s => [s.title, s.env])`);
  ctx.assert.deepEqual(Object.fromEntries(out.envs), { 'ledger sweep': 'production-workload', 'replay a batch': 'sandbox-workload', 'read the Taskfile': null }, 'the server remembers each chat\'s environment across a restart');

  // The launchers oracle's Taskfile would report, and a POST that spawns nothing.
  await ctx.evaluate(`window.__posts = []; const real = window.fetch; window.fetch = (u, o) => { const s = String(u); if (s.startsWith('/api/launchers')) return Promise.resolve({ ok: true, status: 200, json: async () => ({ launchers: [{ name: 'production-workload', desc: 'Launch Claude Code against the production workload cluster' }, { name: 'sandbox-workload', desc: 'Launch Claude Code against the sandbox workload cluster' }] }) }); if (s === '/api/terminals' && o?.method === 'POST') { window.__posts.push(JSON.parse(o.body)); return Promise.resolve({ ok: false, status: 500, json: async () => ({ error: 'stubbed' }) }); } return real(u, o); }`);

  // ---- ⌥⌘O: the environments, then the chosen one's chats ----
  await ctx.key('KeyO');
  await ctx.waitFor(`document.querySelector('#pickq').placeholder.startsWith('oracle — which environment')`, { what: '⌥⌘O on the environments' });
  out.oracleEnvs = await rows(ctx);
  await ctx.shot('oracle-environments');
  ctx.assert.deepEqual(out.oracleEnvs.map(r => r.name), ['production-workload', 'sandbox-workload']);
  ctx.assert.deepEqual(out.oracleEnvs.map(r => r.pills), ['1', '1'], 'each environment counts the chats it holds — one ready apiece, none clauding');
  await enter(ctx);   // production-workload
  await ctx.waitFor(`document.querySelector('#pickq').placeholder.includes('task production-workload')`, { what: 'that environment\'s chats' });
  out.prodChats = await rows(ctx);
  await ctx.shot('oracle-prod-chats');
  ctx.assert.deepEqual(out.prodChats.map(r => r.name), ['＋ new chat', 'ledger sweep'], 'only the chat recorded under production-workload, ＋ new chat at its head');
  ctx.assert.equal(out.prodChats[0].env, 'task production-workload', 'the ＋ row says what it would start');
  ctx.assert.ok(out.prodChats[0].sel && out.prodChats[0].isNew, '⏎ with nothing typed starts a new chat');
  // ↓ ⏎ opens the chat instead
  await ctx.evaluate(`document.querySelector('#pickq').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }))`);
  await enter(ctx);
  await ctx.waitFor(`window.peix.state().current === ${JSON.stringify(prod.id)}`, { what: 'the production chat opened' });
  out.opened = { current: (await ctx.peix('state()')).current, picker: await ctx.evaluate(`document.querySelector('#pick').open`) };
  ctx.assert.equal(out.opened.picker, false, 'the picker closed on the chat');

  // The cards say it too: in the project column a card has no folder row of its own, so the environment is what
  // brings one into being — and a bare `claude` in the same folder wears nothing.
  await ctx.key('KeyP');
  await ctx.waitFor(`document.querySelector('#pickq').placeholder.startsWith('Project')`, { what: 'the project picker' });
  await type(ctx, 'oracle'); await enter(ctx);
  await ctx.waitFor(`document.querySelectorAll('#slist .card').length === 3`, { what: "oracle's three cards" });
  out.cards = await ctx.evaluate(`[...document.querySelectorAll('#slist .card')].map(c => [c.querySelector('.title').textContent, c.querySelector('.chip.env')?.textContent || null])`);
  await ctx.shot('oracle-cards');
  ctx.assert.deepEqual(out.cards, [['read the Taskfile', null], ['replay a batch', 'sandbox-workload'], ['ledger sweep', 'production-workload']], 'each launcher-started card says its environment, the bare one nothing');

  // The other environment lists the other chat, and nothing of the bare one.
  await ctx.key('KeyO');
  await ctx.waitFor(`document.querySelector('#pickq').placeholder.startsWith('oracle — which environment')`, { what: '⌥⌘O again' });
  await type(ctx, 'sandbox'); await enter(ctx);
  await ctx.waitFor(`document.querySelector('#pickq').placeholder.includes('task sandbox-workload')`, { what: 'the sandbox chats' });
  out.sandChats = (await rows(ctx)).map(r => r.name);
  ctx.assert.deepEqual(out.sandChats, ['＋ new chat', 'replay a batch'], 'each environment sees only its own chats');
  await closePick(ctx);

  // ---- ⌥⌘N: the project's chats, whatever their environment, newest by your last touch ----
  await ctx.key('KeyN');
  await ctx.waitFor(`document.querySelector('#pickq').placeholder.startsWith('New chat — a project')`, { what: 'the project step' });
  await type(ctx, 'oracle'); await enter(ctx);
  await ctx.waitFor(`document.querySelector('#pickq').placeholder.startsWith('oracle — an open chat')`, { what: 'the project\'s chats step' });
  out.allChats = await rows(ctx);
  await ctx.shot('project-chats');
  ctx.assert.deepEqual(out.allChats.map(r => r.name), ['＋ new chat', 'read the Taskfile', 'replay a batch', 'ledger sweep'], 'every open chat of the project, newest by your last touch');
  ctx.assert.deepEqual(out.allChats.map(r => r.env), ['in oracle', '', 'sandbox-workload', 'production-workload'], 'each row says the environment it was started in, blank for a bare claude; the ＋ row says the folder');
  // typing moves the selection off ＋ onto the first match; ⏎ opens it
  await type(ctx, 'replay');
  out.filtered = await rows(ctx);
  ctx.assert.deepEqual(out.filtered.map(r => r.name), ['＋ new chat', 'replay a batch'], '＋ stays, the chats are filtered');
  ctx.assert.ok(out.filtered[1].sel, 'the selection moved onto the first match');
  await enter(ctx);
  await ctx.waitFor(`window.peix.state().current === ${JSON.stringify(sand.id)}`, { what: 'the sandbox chat opened by name' });

  // A name no chat has: only ＋ is left, selected — ⏎ starts a chat, and the environment is asked on the way
  await ctx.key('KeyN');
  await ctx.waitFor(`document.querySelector('#pickq').placeholder.startsWith('New chat — a project')`, { what: 'the project step again' });
  await type(ctx, 'oracle'); await enter(ctx);
  await ctx.waitFor(`document.querySelector('#pickq').placeholder.startsWith('oracle — an open chat')`, { what: 'the chats step again' });
  await type(ctx, 'a thing nobody has asked yet');
  out.noMatch = await rows(ctx);
  ctx.assert.deepEqual(out.noMatch.map(r => r.name), ['＋ new chat'], 'nothing matches: ＋ is the whole list');
  ctx.assert.ok(out.noMatch[0].sel, '…and it is selected');
  await enter(ctx);
  await ctx.waitFor(`document.querySelector('#pickq').placeholder.startsWith('New chat in oracle — which environment')`, { what: '＋ carries on into the environment step' });
  await enter(ctx);
  await ctx.waitFor(`window.__posts.length === 1`, { what: 'the new chat posted' });
  out.posted = (await ctx.evaluate(`JSON.stringify(window.__posts)`).then(JSON.parse))[0];
  ctx.assert.deepEqual({ cwd: out.posted.cwd, task: out.posted.task }, { cwd: oracleCwd, task: 'production-workload' }, '⏎ starts task production-workload in oracle');
  ctx.assert.equal(await ctx.evaluate(`document.querySelector('#pick').open`), false, 'the picker closed on the last step');
  return out;
}
