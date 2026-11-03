// A card's words on one line (2026-11-03; a switch to try, Settings › Chat list): the last interaction took up to three rows at Medium, and two
// more at Large. What this checks: off by default, the words wrap as they did; on, Medium's last word is one line, and Large's prompt and reply one
// each, ended by an ellipsis; no card redrawn, every card shorter; the row off, with why, where a card shows no words, and on again with by-lane at
// compact, whose larger cards it reaches; the card in Settings wears it; kept across a reload. Shots at Medium and Large, off and on.
import { makeFixture } from '../fixture.mjs';

const LONG = 'A last word long enough to run past three lines of a card in the list, because it goes on about what was found, what was changed and what is left to do, the way the real ones do almost every time, and then some more words after that for good measure.';

export const meta = { server: true, fixture: 'auto', prefs: { cards: 'medium', sessionsWidth: 420 } };

export default async function (ctx) {
  const a = ctx.assert, out = {}, cwd = '/Users/test/words-repo', at = new Date(Date.now() - 3600_000);
  const { chats: [long] } = makeFixture(ctx.fixture.dir, [{ cwd, title: 'Long words', prompt: `Please look at this: ${LONG}`, reply: LONG, at }]);
  const card = `document.querySelector('#slist > .card[data-id="${long.id}"]')`;
  await ctx.waitFor(`${card}?.querySelector('.snip')`, { what: 'the card with its words' });
  await ctx.settle();
  const look = () => ctx.evaluate(`JSON.stringify((c => { const shown = [...c.querySelectorAll('.snip')].filter(s => getComputedStyle(s).display !== 'none');
    return { h: Math.round(c.getBoundingClientRect().height), shown: shown.length, lines: shown.map(s => Math.round(s.getBoundingClientRect().height / parseFloat(getComputedStyle(s).lineHeight))), cut: shown.every(s => s.scrollHeight > s.clientHeight), kept: c === window.__card, attr: document.querySelector('#sessions').hasAttribute('data-snipone') }; })(${card}))`).then(JSON.parse);
  const crop = name => ctx.evaluate(`(r => ({ x: 0, y: Math.max(0, r.top - 8), width: r.right + 8, height: r.height + 16 }))(${card}.getBoundingClientRect())`).then(r => ctx.shot(name, r));
  await ctx.evaluate(`window.__card = ${card}`);

  // off: as they were
  out.mediumOff = await look();
  a.deepEqual([out.mediumOff.attr, out.mediumOff.shown], [false, 1], `off by default, Medium's one word: ${JSON.stringify(out.mediumOff)}`);
  a.ok(out.mediumOff.lines[0] >= 3, `three lines of it: ${JSON.stringify(out.mediumOff)}`);
  await crop('1-medium-off');

  // on, from the pane
  await ctx.openChat(long.id);
  await ctx.evaluate(`document.querySelector('#settingsBtn').click()`);
  await ctx.waitFor(`document.querySelector('#settings').open`, { what: 'the settings' });
  await ctx.evaluate(`document.querySelector('#settings .stabs [data-tab="list"]').click()`);
  await ctx.waitFor(`document.querySelectorAll('#cardLab .card').length === 1`, { what: 'the card in the pane' });
  const row = () => ctx.evaluate(`JSON.stringify((r => ({ off: r.classList.contains('off'), disabled: r.querySelector('input').disabled, say: r.querySelector('small').textContent }))(document.querySelector('#snipRow')))`).then(JSON.parse);
  a.deepEqual(await row(), { off: false, disabled: false, say: 'The last word, or the prompt and the reply, a line each' }, 'the row, on at Medium');
  await ctx.evaluate(`window.__card = ${card}`);
  await ctx.evaluate(`document.querySelector('#cardsSnipOne').click()`); await ctx.settle();
  a.equal(await ctx.evaluate(`document.querySelector('#cardLab').hasAttribute('data-snipone') && getComputedStyle(document.querySelector('#cardLab .snip')).webkitLineClamp`), '1', 'the card in the pane wears it');
  await ctx.evaluate(`document.querySelector('#cardsSize [data-v="1"]').click()`); await ctx.settle();
  out.mediumOn = await look();
  a.deepEqual([out.mediumOn.attr, out.mediumOn.shown, out.mediumOn.lines, out.mediumOn.cut, out.mediumOn.kept], [true, 1, [1], true, true], `Medium: one line, cut, no card redrawn: ${JSON.stringify(out.mediumOn)}`);
  a.ok(out.mediumOn.h < out.mediumOff.h, 'a shorter card');

  // Large: the prompt and the reply, a line each
  await ctx.evaluate(`document.querySelector('#cardsSize [data-v="0"]').click()`); await ctx.settle();
  out.largeOn = await look();
  a.deepEqual([out.largeOn.shown, out.largeOn.lines], [2, [1, 1]], `Large: two words, a line each: ${JSON.stringify(out.largeOn)}`);
  // compact shows no words: off and why, unless by lane brings some back; one line has its own line
  await ctx.evaluate(`document.querySelector('#cardsSize [data-v="2"]').click()`); await ctx.settle();
  a.deepEqual(await row(), { off: true, disabled: true, say: 'Only where a card shows its words' }, 'compact: off, and why');
  await ctx.evaluate(`document.querySelector('#cardsByLane').click()`); await ctx.settle();
  a.equal((await row()).off, false, 'by lane brings words back at compact');
  await ctx.evaluate(`document.querySelector('#cardsByLane').click()`); await ctx.settle();
  await ctx.evaluate(`document.querySelector('#cardsSize [data-v="3"]').click()`); await ctx.settle();
  a.equal((await row()).off, true, 'one line: off');
  await ctx.evaluate(`document.querySelector('#cardsSize [data-v="0"]').click()`); await ctx.settle();
  await ctx.evaluate(`document.querySelector('#settings').close()`); await ctx.settle();
  await crop('3-large-on');

  // kept; and off, as it was
  await ctx.reload();
  await ctx.waitFor(`${card}?.querySelector('.snip')`, { what: 'the card again' }); await ctx.settle();
  await ctx.evaluate(`window.__card = ${card}`);
  a.deepEqual((await look()).lines, [1, 1], 'kept across a reload');
  await ctx.evaluate(`document.querySelector('#cardsSnipOne').click()`); await ctx.settle();
  out.largeOff = await look();
  a.ok(out.largeOff.lines[0] >= 2 && out.largeOff.lines[1] >= 3 && out.largeOff.h > out.largeOn.h, `off: as they were, on the same card: ${JSON.stringify(out.largeOff)}`);
  a.equal(out.largeOff.kept, true, 'no card redrawn');
  await crop('2-large-off');
  return out;
}
