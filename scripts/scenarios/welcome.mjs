// The first run (2026-10-01): a board whose setup never named a folder of repos asks for one, once, over everything —
// the folder the chats' checkouts sit in and its GitHub org, guessed by the server, already in the boxes. Checked: the
// guess and its row; a folder that is not there offered to be made, and made; the answer written to the config file
// as ~/…, and the dialog gone; deleting that file brings the question back (the watch, the `config` event); a double
// click on a guess is an answer, and ⌥⌘N lists its repo with no chat yet; Skip is an answer that lasts a reload.
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeFixture } from '../fixture.mjs';
import { waitFor as until } from '../../lib/testserver.mjs';

// A home of its own: the server's guesses look under it, and "make it" only makes a folder there.
const HOME = realpathSync(mkdtempSync(join(tmpdir(), 'peix-home-')));
const WORK = join(HOME, 'work');
for (const [name, url] of [['api', 'git@github.com:acme/api.git'], ['web', 'https://github.com/acme/web'], ['docs', 'git@github.com:acme/docs.git']]) {
  mkdirSync(join(WORK, name, '.git'), { recursive: true });
  writeFileSync(join(WORK, name, '.git', 'config'), `[remote "origin"]\n\turl = ${url}\n`);
}
makeFixture(join(HOME, '.claude'), [
  { cwd: join(WORK, 'api'), title: 'An api chat', prompt: 'hello', reply: 'hi' },
  { cwd: join(WORK, 'web'), title: 'A web chat', prompt: 'hello', reply: 'hi' },
]);
export const meta = { server: true, fixture: join(HOME, '.claude'), env: { HOME, ORG_DIR: '', ORG: '' } };

export default async function (ctx) {
  const out = {};
  const cfg = () => ctx.server.api('api/config').then(r => r.body);
  const file = () => (cfg()).then(c => c.file);
  const shown = () => ctx.evaluate(`document.querySelector('#welcome').open`);
  const dialog = () => ctx.evaluate(`({ open: document.querySelector('#welcome').open, modal: document.querySelector('#welcome').matches(':modal'),
    dir: document.querySelector('#wdir').value, org: document.querySelector('#worg').value, err: document.querySelector('#werr').textContent, ok: document.querySelector('#wok').textContent,
    rows: [...document.querySelectorAll('#wsugs .wsug')].map(b => ({ text: b.textContent, on: b.classList.contains('on') })), where: document.querySelector('#wwhere').textContent })`);
  const set = (sel, value) => ctx.evaluate(`(() => { const x = document.querySelector(${JSON.stringify(sel)}); x.value = ${JSON.stringify(value)}; x.dispatchEvent(new Event('input', { bubbles: true })); })()`);

  // ---- asked at once, the guess in the boxes ----
  await ctx.waitFor(`document.querySelector('#welcome').open && document.querySelectorAll('#wsugs .wsug').length > 0`, { what: 'the welcome, with its guesses' });
  await ctx.settle();
  out.first = await dialog();
  await ctx.shot('welcome');
  ctx.assert.ok(out.first.modal, 'a modal dialog');
  ctx.assert.deepEqual([out.first.dir, out.first.org], [WORK, 'acme'], 'the folder the chats ran in, and the org its checkouts come from');
  ctx.assert.ok(out.first.rows[0].on && out.first.rows[0].text.includes('3 repos') && out.first.rows[0].text.includes('2 with chats') && out.first.rows[0].text.includes('github.com/acme'), `its row lit, with what it holds: ${JSON.stringify(out.first.rows[0])}`);
  ctx.assert.ok(out.first.where.endsWith('config.json'), `says where the answer goes: ${out.first.where}`);

  // ---- a folder that is not there: offered to be made, then made ----
  await set('#wdir', '~/fresh');
  await ctx.evaluate(`document.querySelector('#wok').click()`);
  await ctx.waitFor(`document.querySelector('#werr').textContent.includes("isn't there yet")`, { what: 'the folder said to be missing' });
  out.missing = await dialog();
  ctx.assert.equal(out.missing.ok, 'Make it and use it');
  ctx.assert.ok(!out.missing.rows.some(r => r.on), 'no guess lit for a folder typed by hand');
  await ctx.evaluate(`document.querySelector('#wok').click()`);
  await ctx.waitFor(`!document.querySelector('#welcome').open`, { what: 'the dialog gone once answered' });
  out.made = await cfg();
  ctx.assert.deepEqual([out.made.roots, out.made.ask], [[{ dir: join(HOME, 'fresh'), org: 'acme' }], false], 'made, and set with the org in the box');
  ctx.assert.deepEqual(JSON.parse(readFileSync(out.made.file, 'utf8')).roots, [{ dir: '~/fresh', org: 'acme' }], 'written as ~/… in the config file');

  // ---- the file deleted by hand: the question comes back, and a double click on a guess answers it ----
  rmSync(await file());
  await ctx.waitFor(`document.querySelector('#welcome').open`, { what: 'the welcome back after the file went', timeout: 10_000 });
  await ctx.waitFor(`document.querySelectorAll('#wsugs .wsug').length > 0`, { what: 'the guesses again' });
  await set('#wdir', '');
  await ctx.settle();
  await ctx.evaluate(`(() => { const b = document.querySelector('#wsugs .wsug'); b.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 })); b.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 2 })); })()`);
  await ctx.waitFor(`!document.querySelector('#welcome').open`, { what: 'answered by the double click' });
  ctx.assert.deepEqual((await cfg()).roots, [{ dir: WORK, org: 'acme' }], 'the guess, as offered');
  await ctx.key('KeyN');
  await ctx.waitFor(`document.querySelector('#pick').open`, { what: '⌥⌘N' });
  out.folders = await ctx.waitFor(`(f => f.length && f)([...document.querySelectorAll('#picklist .pkrow.folder .n')].map(n => n.firstChild.textContent))`, { what: "⌥⌘N on the folder's repos" });
  ctx.assert.deepEqual(out.folders, ['docs'], 'the repo no chat ran in, offered as a folder (the other two are projects already)');
  await ctx.evaluate(`document.querySelector('#pick').close()`);

  // ---- Skip: no folder, and not asked again ----
  rmSync(await file());
  await ctx.waitFor(`document.querySelector('#welcome').open`, { what: 'the welcome once more', timeout: 10_000 });
  await ctx.evaluate(`document.querySelector('#wskip').click()`);
  await ctx.waitFor(`!document.querySelector('#welcome').open`, { what: 'gone on Skip' });
  out.skipped = await cfg();
  ctx.assert.deepEqual([out.skipped.roots, out.skipped.ask], [[], false], 'no folder, and nothing to ask');
  await ctx.evaluate(`location.reload()`);
  await ctx.waitFor(`window.peix && window.peix.sessions().length > 0`, { what: 'the board again' });
  await ctx.sleep(600);
  ctx.assert.equal(await shown(), false, 'not asked after a reload');
  await until(async () => !(await cfg()).ask, { what: 'still answered' });
  return out;
}
