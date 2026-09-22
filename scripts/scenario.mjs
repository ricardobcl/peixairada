#!/usr/bin/env node
// Run a multi-step browser scenario against the board — the harness for everything verify.mjs's one expression
// cannot do: attach a drawer, wait, act, measure, screenshot each step, restart the server under it.
//   node scripts/scenario.mjs scripts/scenarios/<name>.mjs [--url URL | --server] [--fake] [--fixture auto|<dir>]
//                              [--hash <id>] [--shots <dir>] [--keep] [--timeout <ms>] [-- <args for the scenario>]
// A scenario is an ES module: `export const meta = { server: true, fake: true, fixture: 'auto', env: {…} }` (its
// needs, so no flags are required — `env` goes to the throwaway server, for the ones it reads from its environment)
// and `export default async function (ctx) { … return result }`. `ctx` carries the page
// (evaluate, waitFor, send, sleep, shot(name), key(code), openChat(id), screen()), the throwaway server when there
// is one (api, terminals, restart, holders, logText), the fixture's chats, `args`, `log` and node:assert as `assert`.
// Everything is cleaned up on exit — Chrome, the server, its terminals and holders, the temp dirs — unless --keep.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { launchChrome, openBoard, openChat, sleep } from '../lib/cdp.mjs';
import { startTestServer } from '../lib/testserver.mjs';
import { defaultFixture } from './fixture.mjs';

const argv = process.argv.slice(2);
const dd = argv.indexOf('--'); const scenarioArgs = dd >= 0 ? argv.splice(dd).slice(1) : [];
const opt = (name, dflt = null) => { const i = argv.indexOf(name); if (i < 0) return dflt; const v = argv[i + 1]; argv.splice(i, 2); return v; };
const flag = name => { const i = argv.indexOf(name); if (i < 0) return false; argv.splice(i, 1); return true; };
const url = opt('--url'), wantServer = flag('--server'), fake = flag('--fake'), fixtureOpt = opt('--fixture'), hash = opt('--hash');
const shotsDir = opt('--shots'), keep = flag('--keep'), timeout = Number(opt('--timeout', 120_000));
const file = argv.find(a => !a.startsWith('--'));
if (!file) { console.error('usage: node scripts/scenario.mjs <scenario.mjs> [--server] [--fake] [--fixture auto|dir] [--url URL] [--hash id] [--shots dir] [--keep] [--timeout ms] [-- args]'); process.exit(2); }
const mod = await import(pathToFileURL(resolve(file)).href);
const meta = { server: wantServer, fake, fixture: fixtureOpt, ...(mod.meta || {}) };
if (fixtureOpt) meta.fixture = fixtureOpt; if (wantServer) meta.server = true; if (fake) meta.fake = true;
const name = basename(file, '.mjs');
const shots = shotsDir || join(tmpdir(), 'peixairada-shots'); mkdirSync(shots, { recursive: true });
const log = (...a) => console.error(`[${name}]`, ...a);

const cleanups = [];
let done = false;
async function cleanup() { if (done) return; done = true; for (const c of cleanups.reverse()) { try { await c(); } catch (e) { log('cleanup:', e.message); } } }
process.on('SIGINT', () => cleanup().then(() => process.exit(130)));
const bail = setTimeout(async () => { log(`timed out after ${timeout} ms`); await cleanup(); process.exit(1); }, timeout);

let fixture = null, server = null, boardUrl = url;
if (meta.fixture) {
  const dir = meta.fixture === 'auto' ? mkdtempSync(join(tmpdir(), 'peix-fixture-')) : resolve(meta.fixture);
  fixture = meta.fixture === 'auto' ? defaultFixture(dir, { cwdA: process.cwd(), cwdB: tmpdir() }) : { dir, chats: [] };
  log(`fixture ${dir}${fixture.chats.length ? ' — chats ' + fixture.chats.map(c => c.id.slice(0, 8)).join(', ') : ''}`);
}
if (meta.server || !boardUrl) {
  server = await startTestServer({ claudeDir: fixture?.dir || null, fake: !!meta.fake, env: meta.env || {}, keep });
  cleanups.push(() => server.stop());
  boardUrl = server.url;
  log(`server ${server.url} (state ${server.dir}${meta.fake ? ', fake claude' : ''})`);
}
const cdp = await launchChrome({ dark: !!process.env.DARK });
cleanups.push(() => cdp.close());
await openBoard(cdp, boardUrl, { hash: hash || null });

const ctx = {
  url: boardUrl, server, fixture, args: scenarioArgs, log, assert, sleep,
  evaluate: cdp.evaluate, waitFor: cdp.waitFor, send: cdp.send, exceptions: cdp.exceptions, console: cdp.console,
  shot: async (label, clip) => { const f = join(shots, `${name}-${label}.png`); await cdp.shot(f, clip); log(`screenshot → ${f}`); return f; },
  openChat: id => openChat(cdp, id),
  /** ⌥⌘ + a letter, as the page's hotkeys expect it (e.code; e.key is a symbol with ⌥ held on a Mac). */
  key: code => cdp.evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { code: ${JSON.stringify(code)}, key: 'π', metaKey: true, altKey: true, bubbles: true, cancelable: true }))`),
  /** ⌘ + a key on its own — the board's layout keys (CMDKEYS: ⌘B, ⌘1, ⌘2). */
  cmd: code => cdp.evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { code: ${JSON.stringify(code)}, key: 'x', metaKey: true, bubbles: true, cancelable: true }))`),
  /** The drawer's rows as text, trailing blanks trimmed, empty rows dropped. */
  screen: () => cdp.evaluate(`[...document.querySelectorAll('#termBody .xterm-rows > div')].map(r => r.textContent.replace(/\\s+$/, '')).filter(Boolean)`),
  /** Wait for the drawer to show a prompt line (the fake's or Claude's ❯). */
  waitPrompt: (timeout = 30_000) => cdp.waitFor(`[...document.querySelectorAll('#termBody .xterm-rows > div')].some(r => r.textContent.includes('❯'))`, { timeout, every: 250, what: 'the ❯ prompt in the drawer' }),
  /** A read-only look into the page's closure (window.peix). */
  peix: what => cdp.evaluate(`JSON.stringify(window.peix.${what})`).then(v => JSON.parse(v)),
};
let code = 0;
try {
  const result = await mod.default(ctx);
  if (cdp.exceptions.length) { log('page JS exceptions:', cdp.exceptions); code = 1; }
  console.log(JSON.stringify(result ?? { ok: true }, null, 1));
} catch (e) {
  code = 1; console.error(`[${name}] FAILED: ${e.stack || e}`);
  if (server) console.error(`[${name}] server log tail:\n${server.logText().slice(-1500)}`);
  try { await ctx.shot('failed'); } catch {}
}
clearTimeout(bail);
await cleanup();
process.exit(code);
