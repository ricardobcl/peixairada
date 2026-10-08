// CI on a PR, in the chat header only (2026-10-09): GitHub's rollup of the head commit's checks — a badge on the header's
// chip (a tick, a cross, a turning ring) and a word on its row; nothing on the cards. GitHub is the fake gh; the fixture's
// two-PR chat has #12 passing and #13 failing, and then #13 running again, seen on the chat opened anew.
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
  const chips = () => ctx.evaluate(`JSON.stringify([...document.querySelectorAll('#shead .hpr:not(.more)')].map(c => [c.firstChild.textContent, c.querySelector('.ck')?.dataset.checks || null, getComputedStyle(c).boxShadow !== 'none']))`).then(JSON.parse);
  await ctx.openChat(two.id);
  await ctx.waitFor(`document.querySelectorAll('#shead .hpr .ck').length === 2`, { timeout: 10_000, what: 'the checks on the header\'s chips' });
  out.head = await chips();
  ctx.assert.deepEqual(out.head.map(c => c.slice(0, 2)).sort(), [['#12', 'pass'], ['#13', 'fail']], `a tick and a cross: ${JSON.stringify(out.head)}`);
  ctx.assert.deepEqual(out.head.filter(c => c[2]).map(c => c[0]), ['#13'], 'the failing one ringed in red');
  ctx.assert.match(await ctx.evaluate(`[...document.querySelectorAll('#shead .hpr')].find(c => c.firstChild.textContent === '#13').title`), /checks failing/);
  out.rows = await ctx.evaluate(`JSON.stringify([...document.querySelectorAll('#prlist .prrow')].map(r => [r.querySelector('.num').textContent, r.querySelector('.ckw')?.textContent || null]))`).then(JSON.parse);
  ctx.assert.deepEqual(out.rows.map(r => r[1]).sort(), ['failing', 'passed'], `a word on each row: ${JSON.stringify(out.rows)}`);
  ctx.assert.equal(await ctx.evaluate(`document.querySelectorAll('#slist .card .ck, #slist .card [data-checks]').length`), 0, 'nothing on the cards');
  await ctx.evaluate(`document.querySelector('#prToggle').click()`);
  await ctx.settle();
  await ctx.shot('1-header', { x: 900, y: 0, width: 800, height: 110 });

  // the checks run again: the chat opened anew asks, and the ring turns
  write('PENDING');
  await ctx.openChat(plain.id); await ctx.sleep(400); await ctx.openChat(two.id);
  await ctx.waitFor(`!!document.querySelector('#shead .hpr .ck[data-checks="pending"]')`, { timeout: 10_000, what: '#13 running' });
  out.anim = await ctx.evaluate(`getComputedStyle(document.querySelector('#shead .hpr .ck[data-checks="pending"] svg')).animationName`);
  ctx.assert.equal(out.anim, 'ring', 'the ring turns while they run');
  await ctx.settle();
  await ctx.shot('2-running', { x: 900, y: 0, width: 800, height: 110 });
  await ctx.evaluate(`document.querySelector('#prToggle').click()`);
  return out;
}
