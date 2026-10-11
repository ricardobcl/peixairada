// The overview (2026-10-10). Three live chats — one asking with its answers, one clauding with a command running, one
// watching a monitor — and one long ended. What this checks: ⌥⌘A lays every live chat out in its column (Asking you ·
// Clauding · Watching), numbered in reading order; each tile shows its tail — the running command with no result yet,
// the monitor's last event — and the asking one its question and answers (not clickable: it is not in a drawer here);
// the ended chat is nowhere; a digit opens its tile's chat and the overview goes; Esc closes it, and so does a click on
// nothing (2026-10-11).
import { spawn } from 'node:child_process';
import { makeFixture, replyLines, taskNoteLine, toolLines } from '../fixture.mjs';

export const meta = { server: true, fixture: 'auto' };

export default async function (ctx) {
  const now = Date.now(), out = {}, cwd = ctx.fixture.chats[0]?.cwd || process.cwd();
  const sleeps = [0, 1, 2].map(() => spawn('sleep', ['300'], { stdio: 'ignore' }));
  const live = i => ({ pid: sleeps[i].pid, startedAt: now - 3600_000 });
  const ago = s => new Date(now - s * 1000);
  try {
    const { chats } = makeFixture(ctx.fixture.dir, [
      { cwd, title: 'Queue the webhooks', prompt: 'move webhooks off the request path', reply: 'One question first.', at: ago(300), live: live(0),
        lines: id => toolLines({ id, cwd, name: 'AskUserQuestion', at: ago(60), input: { questions: [{ question: 'Which queue should the webhooks go through?', header: 'Queue', options: [{ label: 'SQS' }, { label: 'Redis streams' }, { label: 'Postgres' }] }] } }) },
      { cwd, title: 'Retry declined payments', prompt: 'retry declined cards', reply: 'Reading the client.', at: ago(200), live: live(1),
        lines: id => [...toolLines({ id, cwd, name: 'Read', input: { file_path: `${cwd}/src/payments/client.ts` }, result: 'export class Client {}', at: ago(100) }),
          ...toolLines({ id, cwd, name: 'Bash', input: { command: 'npm test -- payments', description: 'Run the payment tests' }, at: ago(20) })] },
      { cwd, title: 'Watch the release build', prompt: 'watch the build', reply: 'Watching it.', at: ago(400), live: live(2),
        lines: id => [...toolLines({ id, cwd, name: 'Monitor', input: { command: 'gh run watch', description: 'the release build', timeout_ms: 1800_000 }, result: 'Monitor started (task mon7rel, expires in 30m unless the source ends first).', at: ago(300) }),
          taskNoteLine({ id, cwd, taskId: 'mon7rel', summary: 'Monitor event: "the release build"', event: 'android: success', at: ago(120) }),
          ...replyLines({ id, cwd, text: 'Android is green; waiting on iOS.', at: ago(118) })] },
      { cwd, title: 'An old chat', prompt: 'something long ago', reply: 'Done long ago.', at: ago(90_000) },
    ]);
    const [ask, work, watch, old] = chats;
    await ctx.waitFor(`window.peix.session('${ask.id}')?.status === 'needs-input' && window.peix.session('${work.id}')?.status === 'working' && window.peix.session('${watch.id}')?.status === 'idle' && (window.peix.session('${watch.id}')?.tasks || []).length === 1`, { what: 'the three live chats', timeout: 20000 });

    await ctx.key('KeyA');
    await ctx.waitFor(`document.querySelector('#ov').open && document.querySelectorAll('#ov .ot').length >= 3`, { what: 'the overview' });
    const cols = () => ctx.evaluate(`Object.fromEntries([...document.querySelectorAll('#ov .oc')].map(c => [[...c.classList].find(k => k !== 'oc'), [...c.querySelectorAll('.ot')].map(t => t.dataset.id)]))`);
    out.cols = await cols();
    ctx.assert.deepEqual(out.cols.ask, [ask.id]); ctx.assert.deepEqual(out.cols.work, [work.id]); ctx.assert.deepEqual(out.cols.watch, [watch.id]);
    ctx.assert.ok(!Object.values(out.cols).flat().includes(old.id), 'the ended chat is not there');
    ctx.assert.deepEqual(await ctx.evaluate(`[...document.querySelectorAll('#ov .ot kbd')].map(k => k.textContent)`), ['1', '2', '3']);
    // the tails: the command running, the monitor's last word, the question and its answers
    await ctx.waitFor(`document.querySelector('#ov .ot[data-id="${work.id}"] .tl.run')?.textContent.includes('Run the payment tests')`, { what: 'the running command in its tail' });
    ctx.assert.match(await ctx.evaluate(`document.querySelector('#ov .ot[data-id="${work.id}"] .tl.ok').textContent`), /Read.*client\.ts.*export class Client/);
    ctx.assert.match(await ctx.evaluate(`document.querySelector('#ov .ot[data-id="${watch.id}"] .tl.watch').textContent`), /the release build.*android: success/);
    ctx.assert.equal(await ctx.evaluate(`document.querySelector('#ov .ot[data-id="${ask.id}"] .q').textContent`), 'Which queue should the webhooks go through?');
    ctx.assert.deepEqual(await ctx.evaluate(`[...document.querySelectorAll('#ov .ot[data-id="${ask.id}"] .ans button')].map(b => [b.textContent, b.disabled])`), [['1SQS', true], ['2Redis streams', true], ['3Postgres', true]]);
    await ctx.settle(); await ctx.shot('overview');
    // it zoomed in from the cards (2026-10-11), every tile
    out.zoom = await ctx.evaluate(`window.peix.motion().filter(m => m.kind === 'ovzoom').map(m => m.dy)`);
    ctx.assert.ok(out.zoom.length === 1 && out.zoom[0] >= 3, `the tiles grew out of the list: ${JSON.stringify(out.zoom)}`);

    // a digit opens its tile's chat
    await ctx.evaluate(`document.querySelector('#ov').dispatchEvent(new KeyboardEvent('keydown', { key: '2', bubbles: true, cancelable: true }))`);
    await ctx.waitFor(`!document.querySelector('#ov').open && window.peix.state().current === '${work.id}'`, { what: 'tile 2 opened' });
    ctx.assert.ok(await ctx.evaluate(`window.peix.motion().some(m => m.kind === 'ovgrow' && m.id === '${work.id}')`), 'the tile grew into the chat column');
    await ctx.waitFor(`!document.querySelector('.ovghost')`, { what: 'its ghost gone', timeout: 4000 });
    // Esc closes it
    await ctx.key('KeyA');
    await ctx.waitFor(`document.querySelector('#ov').open`, { what: 'the overview again' });
    await ctx.evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }))`);
    await ctx.waitFor(`!document.querySelector('#ov').open`, { what: 'Esc closed it' });
    // a click on nothing closes it (2026-10-11): the room under a column's tiles — but not a press that began on a tile
    await ctx.key('KeyA');
    await ctx.waitFor(`document.querySelector('#ov').open`, { what: 'the overview once more' });
    await ctx.settle();
    const mouse = async (type, x, y) => ctx.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1 });
    const room = await ctx.evaluate(`(() => { const c = document.querySelector('#ov .oc.watch').getBoundingClientRect(), t = document.querySelector('#ov .oc.watch .ot').getBoundingClientRect();
      return { x: (c.left + c.right) / 2, y: (t.bottom + c.bottom) / 2, tx: (t.left + t.right) / 2, ty: t.top + 12, empty: document.elementFromPoint((c.left + c.right) / 2, (t.bottom + c.bottom) / 2)?.closest('.oc') !== null && !document.elementFromPoint((c.left + c.right) / 2, (t.bottom + c.bottom) / 2)?.closest('.ot') }; })()`);
    ctx.assert.ok(room.empty, 'there is room under the watching tile');
    await mouse('mouseMoved', room.tx, room.ty); await mouse('mousePressed', room.tx, room.ty);
    await mouse('mouseMoved', room.x, room.y); await mouse('mouseReleased', room.x, room.y);
    await ctx.sleep(300);
    ctx.assert.ok(await ctx.evaluate(`document.querySelector('#ov').open`), 'a press dragged off a tile does not close it');
    await mouse('mousePressed', room.x, room.y); await mouse('mouseReleased', room.x, room.y);
    await ctx.waitFor(`!document.querySelector('#ov').open`, { what: 'a click on nothing closed it' });
    ctx.assert.equal(await ctx.evaluate(`window.peix.state().current`), work.id, 'and opened nothing');
    return out;
  } finally { for (const s of sleeps) try { s.kill(); } catch {} }
}
