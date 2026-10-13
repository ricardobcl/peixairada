// The header's PR chips use the row (2026-09-24) — and since 2026-10-12, two at most, the rest behind the whole count
// (*10 PRs ▾*, which opens the list), with the title keeping 40 % of the row: eleven chips had taken a title down to
// fifteen letters. A chat mentioning ten PRs: wide, two chips and the count; narrowed to where two do not fit, one and
// +n — the whole count too wide there — the row still one line, the title's room clear; wide again, two. The count's ▾
// is ▴ while the list is open (2026-10-13).
import { makeFixture } from '../fixture.mjs';

export const meta = { server: true, fixture: 'auto' };

export default async function (ctx) {
  const out = {};
  const urls = Array.from({ length: 10 }, (_, i) => `https://github.com/acme/repo-a/pull/${101 + i}`);
  const [ten] = makeFixture(ctx.fixture.dir, [{ cwd: '/Users/test/repo-a', title: 'Ten PRs', prompt: `The stack: ${urls.join(' ')}`, reply: 'All ten.' }]).chats;
  await ctx.waitFor(`!!window.peix.session(${JSON.stringify(ten.id)})`, { what: 'the ten-PR chat on the board' });
  await ctx.openChat(ten.id);
  await ctx.waitFor(`document.querySelectorAll('#prToggle .hpr:not(.more)').length === 10`, { what: 'ten chips drawn' });
  const fit = () => ctx.evaluate(`JSON.stringify((() => {
    const t = document.querySelector('#prToggle'), h2 = document.querySelector('#shead h2'), more = [...t.querySelectorAll('.hpr.more')].find(m => !m.hidden) || { hidden: true };
    return { shown: [...t.querySelectorAll('.hpr:not(.more)')].filter(c => !c.hidden).length, more: more.hidden ? null : more.textContent,
      oneLine: Math.abs(t.getBoundingClientRect().top - h2.getBoundingClientRect().top) < 12,
      titleRoom: Math.round(h2.getBoundingClientRect().width - h2.querySelector('.repo').offsetWidth) };
  })())`).then(JSON.parse);

  out.wide = await fit();
  ctx.assert.deepEqual([out.wide.shown, out.wide.more, out.wide.oneLine], [2, '10 PRs ▾', true], 'wide: two chips and the whole count, one line');
  await ctx.shot('1-wide', { x: 380, y: 0, width: 1320, height: 60 });

  // the window at 760 px (the list's widest is short of what would leave the column that narrow): a column of ~380 px,
  // where two chips cannot fit beside the title's room
  await ctx.send('Emulation.setDeviceMetricsOverride', { width: 760, height: 900, deviceScaleFactor: 1, mobile: false }); await ctx.sleep(300);
  out.narrow = await fit();
  ctx.assert.equal(out.narrow.shown, 1, `narrowed: one chip (${out.narrow.shown} shown)`);
  ctx.assert.equal(out.narrow.more, '+9 ▾', '…and, the whole count too wide beside one chip and the title\'s room, +n');
  ctx.assert.equal(out.narrow.oneLine, true, '…the row still one line');
  ctx.assert.ok(out.narrow.titleRoom >= 150, `…and the title keeps its room (${out.narrow.titleRoom} px past the repo)`);
  await ctx.shot('2-narrow', { x: 380, y: 0, width: 380, height: 60 });

  await ctx.send('Emulation.clearDeviceMetricsOverride'); await ctx.sleep(300);
  out.back = await fit();
  ctx.assert.deepEqual([out.back.shown, out.back.more], [2, '10 PRs ▾'], 'wide again: two');

  // the count's arrow is the way the list goes (2026-10-13): up while it is open, down again once its foot folds it
  await ctx.evaluate(`document.querySelector('#prToggle').click()`);
  out.open = await fit();
  ctx.assert.deepEqual([out.open.shown, out.open.more], [2, '10 PRs ▴'], 'open: the count points up');
  await ctx.evaluate(`document.querySelector('#prFold').click()`);
  out.folded = await fit();
  ctx.assert.deepEqual([out.folded.more, await ctx.evaluate(`window.peix.prefs().prsOpen`)], ['10 PRs ▾', false], 'folded from the list\'s foot: down again');
  return out;
}
