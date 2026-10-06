// A PR named short (2026-10-06). GitHub is the fake gh; the chat's folder is a checkout of acme/app under the setup's
// root (ORG_DIR, its org acme), beside one of acme/lib. The prompt asks about `#12`; the reply names `lib#7`,
// `lib #8 and #9`, `other/thing#3`, `#404` (no PR there), `#5` (merged in 2015: a review's numbered point) and, in code,
// `#13`. What this checks: the card's stack and the header's rows hold exactly what GitHub found and the chat meant —
// app#12, lib#7, lib#8 (old, but named with its repo), lib#9, thing#3 —, each in its state's colour, and the card is
// titled by the open #12, said first; a `#20` said live comes onto the card once GitHub answers for it.
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpDir } from '../../lib/testserver.mjs';
import { makeFixture, replyLines } from '../fixture.mjs';

const dir = tmpDir('peix-refs-'), code = join(dir, 'code'), file = join(dir, 'prs.json');
for (const name of ['app', 'lib']) {
  mkdirSync(join(code, name, '.git'), { recursive: true });
  writeFileSync(join(code, name, '.git', 'config'), `[remote "origin"]\n\turl = git@github.com:acme/${name}.git\n`);
}
const recent = new Date(Date.now() - 5 * 86_400_000).toISOString(), ancient = '2015-03-01T00:00:00Z';
writeFileSync(file, JSON.stringify({
  'acme/app#12': { state: 'OPEN', title: 'The twelfth', createdAt: recent },
  'acme/lib#7': { state: 'OPEN', title: 'Lib seven', createdAt: recent },
  'acme/lib#8': { state: 'MERGED', title: 'Lib eight', createdAt: ancient },
  'acme/lib#9': { state: 'CLOSED', title: 'Lib nine', createdAt: recent },
  'other/thing#3': { state: 'OPEN', isDraft: true, title: 'A thing', createdAt: recent },
  'acme/app#5': { state: 'MERGED', title: 'Ancient', createdAt: ancient },
  'acme/app#13': { state: 'OPEN', title: 'In code', createdAt: recent },
  'acme/app#20': { state: 'OPEN', title: 'Said live', createdAt: recent },
}));

export const meta = { server: true, fixture: 'auto', env: { GH_BIN: fileURLToPath(new URL('../fakegh.mjs', import.meta.url)), FAKEGH_PRS: file, ORG_DIR: code, ORG: 'acme' } };

const pull = (repo, n) => `https://github.com/${repo}/pull/${n}`;

export default async function (ctx) {
  const out = {}, cwd = join(code, 'app'), now = Date.now();
  const { chats: [c] } = makeFixture(ctx.fixture.dir, [{ cwd, prompt: 'Is #12 ready to merge?', at: new Date(now - 60_000),
    reply: 'Almost. It needs lib#7, lib #8 and #9, and other/thing#3. Also #404. Point #5 is a nit; `#13` is in code.' }]);
  const card = `document.querySelector('#slist > .card[data-id="${c.id}"]')`;
  const chips = () => ctx.evaluate(`JSON.stringify([...(${card}?.querySelectorAll('.tprs > .cpr') || [])].map(e => [e.dataset.url, e.dataset.state, e.textContent]))`).then(JSON.parse);
  const want = [[pull('acme/app', 12), 'open'], [pull('acme/lib', 7), 'open'], [pull('acme/lib', 8), 'merged'], [pull('acme/lib', 9), 'closed'], [pull('other/thing', 3), 'draft']];
  const sorted = list => list.map(([u, st]) => `${u} ${st}`).sort();

  await ctx.waitFor(`${card}?.querySelectorAll('.tprs > .cpr').length === ${want.length}`, { timeout: 20_000, what: 'the short references GitHub found, on the card' });
  await ctx.sleep(1500);   // and nothing more after: #404, #5 and #13 have been asked about (or never were) by now
  out.card = await chips();
  ctx.assert.deepEqual(sorted(out.card), sorted(want), `exactly the PRs meant, each in its state: ${JSON.stringify(out.card)}`);
  out.title = await ctx.evaluate(`${card}.querySelector('.title').textContent`);
  ctx.assert.equal(out.title, 'The twelfth', 'titled by the open PR said first');
  await ctx.settle();
  await ctx.shot('card', await ctx.evaluate(`JSON.stringify((r => ({ x: r.left, y: r.top, width: r.width, height: r.height }))(${card}.getBoundingClientRect()))`).then(JSON.parse));

  await ctx.openChat(c.id);
  await ctx.waitFor(`document.querySelectorAll('#prlist .prrow').length === ${want.length}`, { what: 'the header\'s rows' });
  out.rows = await ctx.evaluate(`JSON.stringify([...document.querySelectorAll('#prlist .prrow')].map(e => [e.querySelector('.num').textContent, e.dataset.state, e.querySelector('.t').textContent]))`).then(JSON.parse);
  ctx.assert.deepEqual(out.rows.map(r => r[0]).sort(), ['app#12', 'lib#7', 'lib#8', 'lib#9', 'thing#3'], `the rows' labels: ${JSON.stringify(out.rows)}`);
  ctx.assert.ok(out.rows.every(r => r[1] && r[2] && !/on its way/.test(r[2])), 'each with its state and title');

  appendFileSync(c.file, replyLines({ id: c.id, cwd, text: 'And #20 landed meanwhile.', at: new Date() }).map(l => JSON.stringify(l)).join('\n') + '\n');
  await ctx.waitFor(`!!${card}?.querySelector('.tprs > .cpr[data-url="${pull('acme/app', 20)}"][data-state="open"]')`, { timeout: 15_000, what: '#20, said live, on the card' });
  out.live = await chips();
  ctx.assert.equal(out.live.length, want.length + 1, 'one more');
  ctx.assert.equal(out.live[0][0], pull('acme/app', 20), 'and first: the most recently said');
  await ctx.settle();
  await ctx.shot('header', { x: 380, y: 0, width: 1300, height: 140 });
  return out;
}
