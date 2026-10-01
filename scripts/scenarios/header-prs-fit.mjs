// The header's PR chips use the row (2026-09-24). A chat mentioning ten
// PRs: with the chat column wide, every chip shows and there is no +n; narrowed, the last ones fold into +n — the
// count right, the row still one line, and the repo name plus TITLE_ROOM of the title clear; wide again, all back.
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
    const t = document.querySelector('#prToggle'), h2 = document.querySelector('#shead h2'), more = t.querySelector('.hpr.more');
    return { shown: [...t.querySelectorAll('.hpr:not(.more)')].filter(c => !c.hidden).length, more: more.hidden ? null : more.textContent,
      oneLine: Math.abs(t.getBoundingClientRect().top - h2.getBoundingClientRect().top) < 12,
      titleRoom: Math.round(h2.getBoundingClientRect().width - h2.querySelector('.repo').offsetWidth) };
  })())`).then(JSON.parse);
  const listWidth = w => ctx.evaluate(`document.querySelector('#sessions').style.width = '${w}px'`).then(() => ctx.sleep(250));

  out.wide = await fit();
  ctx.assert.deepEqual([out.wide.shown, out.wide.more, out.wide.oneLine], [10, null, true], 'wide: all ten, no +n, one line');
  await ctx.shot('1-wide', { x: 380, y: 0, width: 1320, height: 60 });

  await listWidth(1100);   // the chat column ~600 px: ten chips cannot fit beside the title
  out.narrow = await fit();
  ctx.assert.ok(out.narrow.shown >= 1 && out.narrow.shown < 10, `narrowed: some fold (${out.narrow.shown} shown)`);
  ctx.assert.equal(out.narrow.more, `+${10 - out.narrow.shown}`, '…and +n counts them');
  ctx.assert.equal(out.narrow.oneLine, true, '…the row still one line');
  ctx.assert.ok(out.narrow.titleRoom >= 150, `…and the title keeps its room (${out.narrow.titleRoom} px past the repo)`);
  await ctx.shot('2-narrow', { x: 900, y: 0, width: 800, height: 60 });

  await listWidth(380);
  out.back = await fit();
  ctx.assert.deepEqual([out.back.shown, out.back.more], [10, null], 'wide again: all back');
  return out;
}
