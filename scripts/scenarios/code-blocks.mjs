// Code blocks in the transcript (2026-09-27, night): each in a .codebox with a bar at its top right — the language and
// a copy button — that shows under the pointer; a long block folds as before, its summary naming the language, so the
// bar inside the fold has the button alone. What this checks: the wrapper and its bar on a short block and on a folded
// one, the bar coming out under the pointer, the button saying "copied" (or "failed", where the clipboard is not the
// page's — headless Chrome has no permission) and going back to "copy".
import { makeFixture } from '../fixture.mjs';

export const meta = { server: true, fixture: 'auto' };

export default async function (ctx) {
  const out = {}, cwd = '/Users/me/proj/blocks-repo';
  const reply = ['A short one:', '', '```js', 'const a = 1;', 'const b = a + 1;', 'console.log(b);', '```', '', 'And a long one:', '',
    '```python', ...Array.from({ length: 10 }, (_, i) => `x${i} = ${i} * 2  # line ${i + 1}`), '```'].join('\n');
  const { chats } = makeFixture(ctx.fixture.dir, [{ cwd, title: 'Blocks', prompt: 'show me code', reply, at: new Date() }]);
  await ctx.waitFor(`!!document.querySelector('#slist > .card[data-id="${chats[0].id}"]')`, { what: 'the card' });
  await ctx.openChat(chats[0].id);
  await ctx.waitFor(`document.querySelectorAll('#log .codebox').length === 2`, { what: 'two code blocks, boxed' });
  out.boxes = await ctx.evaluate(`JSON.stringify([...document.querySelectorAll('#log .codebox')].map(b => ({ lang: b.querySelector('.lang')?.textContent || null, copy: b.querySelector('.copy')?.textContent || null, folded: !!b.closest('.codefold'), summary: b.closest('.codefold')?.querySelector('summary').textContent || null, bar: getComputedStyle(b.querySelector('.cbar')).opacity, code: b.querySelector('pre code')?.className || '' })))`).then(JSON.parse);
  ctx.assert.deepEqual(out.boxes[0], { lang: 'js', copy: 'copy', folded: false, summary: null, bar: '0', code: 'language-js' }, 'the short block: its language and a copy button, hidden at rest');
  ctx.assert.deepEqual(out.boxes[1], { lang: null, copy: 'copy', folded: true, summary: 'python · 10 lines', bar: '0', code: 'language-python' }, 'the long block folded, the summary naming the language, the bar with the button alone');

  // under the pointer the bar comes out
  const r = await ctx.evaluate(`JSON.stringify((b => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 }))(document.querySelector('#log .codebox').getBoundingClientRect()))`).then(JSON.parse);
  await ctx.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r.x, y: r.y });
  await ctx.waitFor(`getComputedStyle(document.querySelector('#log .codebox .cbar')).opacity === '1'`, { what: 'the bar under the pointer', timeout: 2000 });
  await ctx.shot('hover', { x: 380, y: 40, width: 900, height: 300 });

  // the button copies the block, says so, and goes back to "copy" (the clipboard is granted over CDP: a synthetic click
  // is no user gesture, and without the grant both ways fail — which the button reports as "failed")
  await ctx.send('Browser.grantPermissions', { permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'] });
  await ctx.evaluate(`document.querySelector('#log .codebox .copy').click()`);
  await ctx.waitFor(`/^(copied|failed)$/.test(document.querySelector('#log .codebox .copy').textContent)`, { what: 'the button answering', timeout: 2000 });
  out.said = await ctx.evaluate(`document.querySelector('#log .codebox .copy').textContent`);
  ctx.assert.equal(out.said, 'copied', 'the button says copied');
  out.clip = await ctx.evaluate(`navigator.clipboard.readText()`);
  ctx.assert.equal(out.clip, 'const a = 1;\nconst b = a + 1;\nconsole.log(b);\n', 'and the clipboard holds the block');
  await ctx.waitFor(`document.querySelector('#log .codebox .copy').textContent === 'copy'`, { what: 'the word back to copy', timeout: 3000 });
  return out;
}
