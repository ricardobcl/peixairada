// The transcript as a conversation (2026-10-08, ideas from two agent apps): your words a bubble on the right, as wide
// as they are; Claude's under one who-line a turn; the reply that ends a turn closed by a footer — copy the turn's
// words, and how long it worked; and a mark on every tab. A chat of two turns: a prompt and its reply a minute later,
// then a prompt, a word of Claude's before a tool call, the call, and the reply four minutes after the prompt.
import { appendFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { makeFixture, toolLines } from '../fixture.mjs';

export const meta = { server: true, fixture: 'auto', fake: true };

export default async function (ctx) {
  const out = {}, now = Date.now(), cwd = process.cwd();
  const { chats: [c] } = makeFixture(ctx.fixture.dir, [{ cwd, at: new Date(now - 20 * 60_000), title: 'Two turns',
    prompt: 'Why is the fee table slow?', reply: 'It re-sorts every row on each keystroke.' }]);
  const base = { isSidechain: false, userType: 'external', entrypoint: 'cli', cwd, sessionId: c.id, version: 'fixture', gitBranch: 'main' };
  const at = m => new Date(now - m * 60_000).toISOString();
  const say = (m, text, stop, more = []) => ({ ...base, parentUuid: null, type: 'assistant', uuid: randomUUID(), timestamp: at(m),
    message: { model: 'fixture-1', id: 'msg_' + randomUUID().slice(0, 8), type: 'message', role: 'assistant', content: [{ type: 'text', text }, ...more], stop_reason: stop } });
  const lines = [
    { ...base, parentUuid: null, type: 'user', uuid: randomUUID(), timestamp: at(10), message: { role: 'user', content: [{ type: 'text', text: 'Then make it fast, please — and keep the old sort for the small markets.' }] } },
    say(9, 'Memoising the sort first.', 'tool_use', [{ type: 'tool_use', id: 'toolu_x1', name: 'Bash', input: { command: 'npm test' } }]),
    ...toolLines({ id: c.id, cwd, name: 'Read', input: { file_path: '/src/fees.ts' }, result: 'ok', at: new Date(now - 8 * 60_000) }),
    say(6, 'Done: the big markets render in **180 ms**, the small ones as before.', 'end_turn'),
  ];
  appendFileSync(c.file, lines.map(l => JSON.stringify(l)).join('\n') + '\n');
  await ctx.waitFor(`window.peix.session(${JSON.stringify(c.id)})?.lastReply?.startsWith('Done')`, { what: 'the second turn read' });
  await ctx.openChat(c.id);
  await ctx.waitFor(`document.querySelectorAll('#log .turnfoot').length === 2`, { what: 'two turns closed' });
  await ctx.settle();

  out.msgs = await ctx.evaluate(`JSON.stringify([...document.querySelectorAll('#log > .msg')].map(m => ({ role: m.classList.contains('user') ? 'you' : 'claude', cont: m.classList.contains('cont'),
    who: getComputedStyle(m.querySelector('.who')).display !== 'none', foot: m.querySelector('.turnfoot')?.textContent || null })))`).then(JSON.parse);
  ctx.assert.deepEqual(out.msgs, [
    { role: 'you', cont: false, who: true, foot: null },
    { role: 'claude', cont: false, who: true, foot: 'copyworked for 1m 0s' },
    { role: 'you', cont: false, who: true, foot: null },
    { role: 'claude', cont: false, who: true, foot: null },
    { role: 'claude', cont: true, who: false, foot: 'copyworked for 4m 0s' },
  ], `one who-line a turn, and each turn's end its footer: ${JSON.stringify(out.msgs)}`);

  // your words on the right, as wide as they are
  out.bubble = await ctx.evaluate(`JSON.stringify((() => { const log = document.querySelector('#log').getBoundingClientRect(), b = document.querySelector('#log .msg.user .bubble').getBoundingClientRect(), r = document.querySelector('#log .msg.assistant .bubble').getBoundingClientRect();
    return { right: Math.round(log.right - b.right), narrow: b.width < log.width * 0.6, leftOfClaude: Math.round(b.left - r.left) }; })())`).then(JSON.parse);
  ctx.assert.ok(out.bubble.right < 40 && out.bubble.narrow && out.bubble.leftOfClaude > 200, `a bubble on the right: ${JSON.stringify(out.bubble)}`);

  // copy: the turn's words, as written
  await ctx.evaluate(`navigator.clipboard.writeText = t => { window.__copied = t; return Promise.resolve(); }`);
  await ctx.evaluate(`[...document.querySelectorAll('#log .tcopy')].at(-1).click()`);
  await ctx.waitFor(`window.__copied !== undefined`, { what: 'the copy' });
  ctx.assert.equal(await ctx.evaluate(`window.__copied`), 'Memoising the sort first.\n\nDone: the big markets render in **180 ms**, the small ones as before.', 'every word of the turn, as markdown');
  ctx.assert.equal(await ctx.evaluate(`[...document.querySelectorAll('#log .tcopy')].at(-1).textContent`), 'copied');
  await ctx.shot('1-turns', { x: 380, y: 0, width: 1320, height: 640 });

  // the tabs wear their marks: Claude's burst on the chat's, the prompt on the shell's
  await ctx.key('KeyT');
  await ctx.waitFor(`!!window.peix.session(${JSON.stringify(c.id)})?.shell`, { timeout: 15_000, what: 'the shell' });
  await ctx.cmd('Digit1'); await ctx.cmd('Digit0');
  await ctx.waitFor(`document.querySelectorAll('#ptabs .ptab').length === 2`, { timeout: 10_000, what: 'both tabs in one strip' });
  out.tabs = await ctx.evaluate(`JSON.stringify([...document.querySelectorAll('#ptabs .ptab')].map(t => [t.dataset.tab, !!t.querySelector('svg.ic'), !!t.querySelector('svg.burst')]))`).then(JSON.parse);
  ctx.assert.deepEqual(out.tabs, [['chat', true, true], ['shell', true, false]], 'a mark on each tab');
  await ctx.settle();
  await ctx.shot('2-tabs', { x: 380, y: 0, width: 700, height: 90 });
  return out;
}
