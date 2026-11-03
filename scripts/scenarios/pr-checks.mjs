// CI on a PR, in the chat header only (2026-10-09): GitHub's rollup of the head commit's checks — on the header's matrix since 2026-11-03: a
// failing square ringed, a running one pulsing, the number's badge (a tick, a cross, a turning ring), and a word on its row; nothing on the cards.
// GitHub is the fake gh; the fixture's two-PR chat has #12 passing and #13 failing, and then #13 running again, seen on the chat opened anew.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpDir } from '../../lib/testserver.mjs';

const file = join(tmpDir('peix-checks-'), 'prs.json');
const rollup = state => ({ commits: { nodes: [{ commit: { statusCheckRollup: { state } } }] } });
const write = s13 => writeFileSync(file, JSON.stringify({ 'acme/repo-a#12': { state: 'OPEN', title: 'The base', ...rollup('SUCCESS') }, 'acme/repo-a#13': { state: 'OPEN', title: 'The follow-up', ...rollup(s13) } }));
write('FAILURE');

export const meta = { server: true, fixture: 'auto', env: { GH_BIN: fileURLToPath(new URL('../fakegh.mjs', import.meta.url)), FAKEGH_PRS: file, PR_TTL_MS: '300' } };

export default async function (ctx) {
  const [two, plain] = ctx.fixture.chats, out = {};
  const chips = () => ctx.evaluate(`JSON.stringify([...document.querySelectorAll('#shead > .tmx .mxs')].map(c => ['#' + c.dataset.url.split('/').pop(), c.dataset.checks || null, getComputedStyle(c).outlineStyle !== 'none']))`).then(JSON.parse);
  await ctx.openChat(two.id);
  await ctx.waitFor(`document.querySelectorAll('#shead > .tmx .mxs[data-checks]').length === 2`, { timeout: 10_000, what: 'the checks on the header\'s squares' });
  out.head = await chips();
  ctx.assert.deepEqual(out.head.map(c => c.slice(0, 2)).sort(), [['#12', 'pass'], ['#13', 'fail']], `passing and failing: ${JSON.stringify(out.head)}`);
  ctx.assert.deepEqual(out.head.filter(c => c[2]).map(c => c[0]), ['#13'], 'the failing one ringed in red');
  ctx.assert.match(await ctx.evaluate(`document.querySelector('#shead > .tmx .mxs[data-url$="/13"] .vh').textContent`), /checks failing/, 'in words too');
  ctx.assert.equal(await ctx.evaluate(`document.querySelector('#shead > .tmx .mxn .ck')?.dataset.checks`), await ctx.evaluate(`document.querySelector('#shead > .tmx .mxs.lead').dataset.checks`), 'the number\'s badge says its PR\'s');
  out.rows = await ctx.evaluate(`JSON.stringify([...document.querySelectorAll('#prlist .prrow')].map(r => [r.querySelector('.num').textContent, r.querySelector('.ckw')?.textContent || null]))`).then(JSON.parse);
  ctx.assert.deepEqual(out.rows.map(r => r[1]).sort(), ['failing', 'passed'], `a word on each row: ${JSON.stringify(out.rows)}`);
  ctx.assert.equal(await ctx.evaluate(`document.querySelectorAll('#slist .card .ck, #slist .card [data-checks]').length`), 0, 'nothing on the cards');
  await ctx.evaluate(`document.querySelector('#prToggle').click()`);
  await ctx.settle();
  await ctx.shot('1-header', { x: 900, y: 0, width: 800, height: 110 });

  // the checks run again: the chat opened anew asks, and the ring turns
  write('PENDING');
  await ctx.openChat(plain.id); await ctx.sleep(400); await ctx.openChat(two.id);
  await ctx.waitFor(`!!document.querySelector('#shead > .tmx .mxs[data-checks="pending"]')`, { timeout: 10_000, what: '#13 running' });
  out.anim = await ctx.evaluate(`getComputedStyle(document.querySelector('#shead > .tmx .mxs[data-checks="pending"]')).animationName`);
  ctx.assert.equal(out.anim, 'mxrun', 'it pulses while they run');
  await ctx.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  ctx.assert.equal(await ctx.evaluate(`getComputedStyle(document.querySelector('#shead > .tmx .mxs[data-checks="pending"]')).animationName`), 'none', 'dim and still under reduced motion');
  await ctx.send('Emulation.setEmulatedMedia', { features: [] });
  await ctx.settle();
  await ctx.shot('2-running', { x: 900, y: 0, width: 800, height: 110 });
  await ctx.evaluate(`document.querySelector('#prToggle').click()`);

  // the answer coming in (2026-10-11): running → passed pops the square, and the number's badge when it is that PR's; and #12 merged pops its
  const url13 = 'https://github.com/acme/repo-a/pull/13', url12 = 'https://github.com/acme/repo-a/pull/12';
  writeFileSync(file, JSON.stringify({ 'acme/repo-a#12': { state: 'MERGED', title: 'The base', ...rollup('SUCCESS') }, 'acme/repo-a#13': { state: 'OPEN', title: 'The follow-up', ...rollup('SUCCESS') } }));
  await ctx.openChat(plain.id); await ctx.sleep(400); await ctx.openChat(two.id);
  await ctx.waitFor(`window.peix.motion().some(m => m.kind === 'ci:pass' && m.id === ${JSON.stringify(url13)})`, { timeout: 10_000, what: '#13\'s tick drawn' });
  await ctx.waitFor(`window.peix.motion().some(m => m.kind === 'merged' && m.id === ${JSON.stringify(url12)})`, { timeout: 10_000, what: '#12\'s merge, seen' });
  out.moments = await ctx.evaluate(`window.peix.motion().filter(m => m.kind.startsWith('ci:') || m.kind === 'merged').map(m => m.kind + ' ' + m.id.split('/').pop())`);
  ctx.assert.ok(!out.moments.includes('ci:pass 12'), 'a square that was not running says nothing');
  return out;
}
