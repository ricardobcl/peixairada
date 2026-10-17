// The right-click menu (2026-10-12): what ⌥-click, a double-click and a drag did alone. On a card: open, rename, tick,
// take one of its PRs off, copy its link; on a PR chip: open it, take it off the chat — and the launcher has the same
// rows, for the keyboard. What this checks: the card's menu and its Rename… (the header's title box), a PR taken off
// from its chip's menu, and the launcher's rows for the open chat.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpDir } from '../../lib/testserver.mjs';

const dir = tmpDir('peix-ctx-gh-'), file = join(dir, 'prs.json');
writeFileSync(file, JSON.stringify({ 'acme/repo-a#12': { state: 'OPEN', title: 'Base of the follow-up' }, 'acme/repo-a#13': { state: 'OPEN', title: 'The follow-up' } }));
export const meta = { server: true, fixture: 'auto', env: { GH_BIN: fileURLToPath(new URL('../fakegh.mjs', import.meta.url)), FAKEGH_PRS: file } };

export default async function (ctx) {
  const out = {}, [two] = ctx.fixture.chats;   // the fixture's first: the one naming repo-a#12 and #13
  const card = `document.querySelector('#slist > .card[data-id="${two.id}"]')`;
  await ctx.waitFor(`${card}?.querySelectorAll('.cpr[data-url]').length === 2`, { timeout: 10_000, what: 'the card with its two PRs' });
  const right = sel => ctx.evaluate(`(el => { const r = el.getBoundingClientRect(); el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 8, clientY: r.top + 8 })); })(${sel})`);
  const rows = () => ctx.evaluate(`[...document.querySelectorAll('#ctxm button')].map(b => b.textContent)`);
  await right(`${card}.querySelector('.title')`);
  out.card = await rows();
  ctx.assert.equal(await ctx.evaluate(`document.querySelector('#ctxm').open`), true, 'the menu up');
  ctx.assert.deepEqual(out.card.slice(0, 3), ['Open', 'Open its timelinethe chat and its PRs in one order · ⌥⌘J', 'Rename…'], JSON.stringify(out.card));   // a chat with PRs: its timeline (2026-10-17)
  ctx.assert.ok(out.card.includes('Take #12 off this chat') && out.card.includes('Copy its link'), JSON.stringify(out.card));
  await ctx.evaluate(`[...document.querySelectorAll('#ctxm button')].find(b => b.textContent === 'Rename…').click()`);
  await ctx.waitFor(`!!document.querySelector('#shead h2 input.tedit')`, { what: 'the title box, from Rename…' });
  ctx.assert.equal(await ctx.evaluate(`window.peix.state().current`), two.id, '…on the chat it was asked of');
  await ctx.evaluate(`document.querySelector('#shead h2 input.tedit').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
  // the box left as it came, by a click elsewhere, names nothing (2026-10-14): the title it showed, made the board's
  // own, stopped following Claude's and the PR's
  ctx.assert.equal(await ctx.evaluate(`window.peix.session(${JSON.stringify(two.id)}).boardTitle ?? null`), null, 'no title of the board’s to begin with');
  await ctx.evaluate(`document.querySelector('#shead h2 .t').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))`);
  await ctx.waitFor(`document.activeElement?.matches('#shead h2 input.tedit')`, { what: 'the title box, from a double click' });
  await ctx.evaluate(`document.querySelector('#shead h2 input.tedit').blur()`);
  await ctx.waitFor(`!document.querySelector('#shead h2 input.tedit')`, { what: 'the box gone on blur' });
  await ctx.sleep(400);
  out.blurred = await ctx.evaluate(`JSON.stringify((s => ({ board: s.boardTitle ?? null, title: s.title }))(window.peix.session(${JSON.stringify(two.id)})))`).then(JSON.parse);
  ctx.assert.equal(out.blurred.board, null, `a blur with nothing changed saved nothing: ${JSON.stringify(out.blurred)}`);
  // a PR chip's own menu
  await right(`${card}.querySelector('.cpr[data-url$="/pull/13"]')`);
  out.chip = await rows();
  ctx.assert.deepEqual(out.chip, ['Open the PR', 'Its timelineits events and the turns about it · ⌥⌘J', 'Take it off this chat']);
  await ctx.evaluate(`[...document.querySelectorAll('#ctxm button')].find(b => b.textContent === 'Take it off this chat').click()`);
  await ctx.waitFor(`window.peix.session(${JSON.stringify(two.id)}).prs.length === 1`, { timeout: 10_000, what: '#13 off the chat' });
  // the launcher has the rows for the open chat
  await ctx.key('KeyL');
  await ctx.fill('#pickq', '>rename');
  out.launcher = await ctx.evaluate(`[...document.querySelectorAll('#picklist .pkrow')].map(r => r.textContent.trim()).slice(0, 3)`);
  ctx.assert.ok(out.launcher.some(t => /Rename it/.test(t)), JSON.stringify(out.launcher));
  return out;
}
