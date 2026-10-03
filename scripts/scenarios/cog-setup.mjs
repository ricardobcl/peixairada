// The cog's setup (2026-09-28): what had been written into the page and the server for one Mac, set from the
// popover — a folder of repos and its org, ⌥⌘O's project, a short name and a colour per project — and the switch
// that is this browser's (⌥ as Meta; fold code and how a date is written were beside it for a day, 2026-09-28). Each is set the way a hand would, a
// box and its change, and read back from the server's word and from what it paints: the folders ⌥⌘N offers, the
// crystal ball, the rail's short name, a card's colour, the day lines. A folder that is not there is refused, beside
// the box, and the row stays as the server has it.
import { mkdirSync, realpathSync } from 'node:fs';
import { basename, join } from 'node:path';
import { tmpDir, waitFor as until } from '../../lib/testserver.mjs';

const ROOT = realpathSync(tmpDir('peix-repos-'));
for (const f of ['alpha', 'beta']) mkdirSync(join(ROOT, f), { recursive: true });
export const meta = { server: true, fixture: 'auto' };

export default async function (ctx) {
  const out = {};
  const [two, plain] = ctx.fixture.chats, repo = basename(two.cwd), tmp = basename(plain.cwd);
  const cfg = () => ctx.server.api('api/config').then(r => r.body);
  /** A box in the setup, set and changed as typing and leaving it would. */
  const set = (sel, value) => ctx.evaluate(`(() => { const x = document.querySelector('#setup ${sel}'); x.value = ${JSON.stringify(value)}; x.dispatchEvent(new Event('input', { bubbles: true })); x.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  const cardOf = id => `document.querySelector('#slist > .card[data-id="${id}"]')`;

  // the settings: a modal dialog since 2026-09-28 (⌘, or the chat header's ···), the setup on a tab of its own
  const openSetup = async () => {
    await ctx.cmd('Comma');
    await ctx.waitFor(`document.querySelector('#settings').open`, { what: 'the settings' });
    await ctx.evaluate(`document.querySelector('#settings .stabs [data-tab="setup"]').click()`);
    await ctx.settle();
  };
  await openSetup();
  out.popover = await ctx.evaluate(`(r => ({ modal: document.querySelector('#settings').matches(':modal'), tabs: [...document.querySelectorAll('#settings .stabs button')].map(b => b.textContent),
    shown: [...document.querySelectorAll('#settings .spane')].filter(p => !p.hidden).map(p => p.dataset.tab),
    centred: Math.abs(r.left + r.width / 2 - innerWidth / 2) < 2 && Math.abs(r.top + r.height / 2 - innerHeight / 2) < 2, fits: r.bottom <= innerHeight && r.right <= innerWidth }))(document.querySelector('#settings').getBoundingClientRect())`);
  ctx.assert.deepEqual([out.popover.modal, out.popover.tabs, out.popover.shown], [true, ['Board', 'Setup', 'Keys'], ['setup']], 'a modal of three tabs, the setup in front');
  ctx.assert.ok(out.popover.centred && out.popover.fits, `centred, and inside the window: ${JSON.stringify(out.popover)}`);
  await ctx.shot('popover');

  // ---- a folder of repos, then its org: ⌥⌘N offers its folders, and ＋ clone names the org ----
  ctx.assert.equal(await ctx.evaluate(`document.querySelectorAll('#setup .srow.root:not(.add)').length`), 1, "the test server's own root, from the environment");
  await set('.srow.root.add .sdir', ROOT);
  await ctx.waitFor(`document.querySelectorAll('#setup .srow.root:not(.add)').length === 2`, { what: 'the new root, saved and drawn' });
  await set('.srow.root[data-i="1"] .sorg', 'acme');
  await until(async () => (await cfg()).roots[1]?.org === 'acme', { what: 'its org saved' });
  out.roots = (await cfg()).roots;
  ctx.assert.deepEqual(out.roots[1], { dir: ROOT, org: 'acme' });
  await ctx.cmd('Comma');   // a modal takes the keys: close it for ⌥⌘N
  await ctx.key('KeyN');
  await ctx.waitFor(`[...document.querySelectorAll('#picklist .pkrow.folder .n')].map(n => n.firstChild.textContent).join() === 'alpha,beta'`, { what: "the root's two folders in ⌥⌘N" });
  await ctx.fill('#pickq', 'gamma');
  out.clone = await ctx.evaluate(`[...document.querySelectorAll('#picklist .pkrow.clone .n')].map(n => n.textContent)`);
  ctx.assert.deepEqual(out.clone, [`＋ clone acme/gammainto ${ROOT.replace(/^\/Users\/[^/]+/, '~')}`], 'one clone row, for the one root with an org');
  await ctx.evaluate(`document.querySelector('#pick').close()`);

  // ---- a folder that is not there: refused beside the box, and the rows are the server's ----
  await openSetup();
  await set('.srow.root.add .sdir', join(ROOT, 'nope'));
  await ctx.waitFor(`document.querySelector('.note.err')?.textContent.includes('not a folder here')`, { what: 'the refusal, said' });
  ctx.assert.equal((await cfg()).roots.length, 2, 'nothing saved');
  await ctx.evaluate(`document.activeElement?.blur()`);
  await ctx.waitFor(`!document.querySelector('#setup .srow.root.add .sdir').value`, { what: 'the add row emptied again' });

  // ---- ⌥⌘O: the project named wears the crystal ball, and the key says where it goes ----
  await set('#quickSel', repo);
  await until(async () => (await cfg()).quick === repo, { what: '⌥⌘O saved' });
  await ctx.waitFor(`!!${cardOf(two.id)}?.querySelector('.repo svg')`, { what: 'the crystal ball on its card' });
  ctx.assert.ok((await ctx.evaluate(`document.querySelector('#quickKey').textContent`)).startsWith(`${repo} — `));

  // ---- a short name for the rail, a colour where Peacock gives none, and ⌥-click to take it off ----
  await set('.sadd', repo);
  await ctx.waitFor(`document.activeElement?.matches('#setup .srow.proj[data-name="${repo}"] .sab')`, { what: 'the new row, its short name box with the keyboard' });
  await set(`.srow.proj[data-name="${repo}"] .sab`, 'PX');
  await until(async () => (await cfg()).projects[repo]?.abbr === 'PX', { what: 'the short name saved' });
  await ctx.cmd('Comma');   // the modal takes the keys: closed for ⌥⌘B
  await ctx.key('KeyB'); await ctx.settle();
  out.abbr = await ctx.evaluate(`${cardOf(two.id)}.querySelector('.abbr').textContent`);
  ctx.assert.equal(out.abbr, 'PX', "the rail's square says it");
  await ctx.key('KeyB'); await ctx.settle();
  await openSetup();
  await set('.sadd', tmp);
  await set(`.srow.proj[data-name="${tmp}"] input[type=color]`, '#cc3366');
  await until(async () => (await cfg()).projects[tmp]?.color === '#cc3366', { what: 'the colour saved' });
  await ctx.waitFor(`${cardOf(plain.id)}.style.getPropertyValue('--repo') === '#cc3366'`, { what: 'the card in it' });
  await ctx.shot('popover-set');
  await ctx.evaluate(`document.querySelector('#setup .srow.proj[data-name="${tmp}"] .ssw').dispatchEvent(new MouseEvent('click', { altKey: true, bubbles: true, cancelable: true }))`);
  await until(async () => !(await cfg()).projects[tmp], { what: 'the colour taken off — and the row with it, nothing left on it' });
  await ctx.waitFor(`${cardOf(plain.id)}.style.getPropertyValue('--repo') !== '#cc3366'`, { what: 'the card back to what Peacock says' });

  // ---- this browser's: ⌥ in the terminal (the code's fold, always on, and the dates, day first, went on 2026-09-28) ----
  out.days = await ctx.evaluate(`[...document.querySelectorAll('#slist .gsep.day b')].map(b => b.textContent).filter(t => t !== 'today')`);
  ctx.assert.ok(out.days.length && out.days.every(d => /^\d\d-\d\d-\d{4}$/.test(d)), `the day lines day first: ${out.days}`);
  ctx.assert.equal(await ctx.evaluate(`!!document.querySelector('#datesStops')`), false, 'no choice of how a date is written');
  await ctx.evaluate(`document.querySelector('#optMeta').click()`);
  out.prefs = await ctx.peix('prefs()').then(p => ({ foldCode: p.foldCode, foldBy: p.foldBy, optMeta: p.optMeta, dates: p.dates }));
  ctx.assert.deepEqual(out.prefs, { foldCode: undefined, foldBy: undefined, optMeta: false, dates: undefined });
  ctx.assert.equal(await ctx.evaluate(`!!document.querySelector('#foldCode')`), false, 'no switch for the code\'s fold');
  return out;
}
