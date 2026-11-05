// A drawer's wait for its repaint, where it can go wrong (2026-11-05): a claude that never answers a resize, one that answers
// late, one whose output never stops, keys typed while the screen waits, and the wait cut short — another chat, the drawer
// ending, the server going. Each must end with the grid the body holds, nothing left holding the screen, nothing typed lost.
import { frameTrouble, holderRows } from '../../lib/framewatch.mjs';

export const meta = { server: true, fake: true, fixture: 'auto', env: { FAKE_TUI: 'fullscreen', FAKE_SIZE_MARK: '1', FAKE_ANSWER: 'real', FAKE_ANSWER_GAP_MS: '2' } };

export default async function (ctx) {
  const { assert } = ctx, [other, chat] = ctx.fixture.chats, out = {};
  const grid = (g = 0) => ctx.peix(`grid(${g})`), term = (g = 0) => ctx.peix(`term(${g})`);
  const fits = async (g = 0) => { const d = await term(g); return d.cols === d.propose.cols && d.rows === d.propose.rows; };
  /** Let go and fitted within `ms` of now: the time it took. */
  const letGo = async (what, ms, g = 0) => {
    const t0 = Date.now();
    await ctx.sleep(50);   // the body's observer first: the change is the next frame's
    await ctx.waitFor(`((x, d) => !x.hold && !x.refits && d.cols === d.propose.cols && d.rows === d.propose.rows)(window.peix.grid(${g}), window.peix.term(${g}))`, { timeout: ms, what: `${what}: the screen let go, at the body's size, within ${ms} ms` }).catch(() => {});
    if (!(await fits(g))) ctx.log(`FITS ${what} ${JSON.stringify(await term(g))} ${JSON.stringify(await ctx.peix(`fits(${g})`))}`);
    assert.ok(await fits(g), `${what}: the grid is what the body holds`);
    return Date.now() - t0;
  };
  // a word to the fake, once its turn is over: the transcript says so (the screen may show the same words from before)
  const said = k => ctx.evaluate(`(async () => { const r = await window.fetch('api/sessions/' + window.peix.state().current + '/messages', { headers: { 'x-peix-key': window.PEIX_KEY } }); return (JSON.stringify(await r.json()).match(/You said: fake ${k}/g) || []).length; })()`);
  const knob = async k => {
    await ctx.waitFor(`(r => r.findLastIndex(x => /Done in/.test(x)) >= r.findLastIndex(x => /You said/.test(x)))(window.peix.screen(0))`, { what: 'the turn before over' });   // a word typed mid-turn is dropped
    const n = await said(k);
    await ctx.type(`fake ${k}`);
    await ctx.waitFor(`(async () => (JSON.stringify(await (await window.fetch('api/sessions/' + window.peix.state().current + '/messages', { headers: { 'x-peix-key': window.PEIX_KEY } })).json()).match(/You said: fake ${k}/g) || []).length > ${n})()`, { what: `the fake told ${k}` });
    await ctx.waitFor(`window.peix.session().status !== 'working'`, { what: 'its turn over' }); await ctx.sleep(400);
  };
  // the screen drawn for the grid it is on, once xterm has drawn what it was given (a frame or two)
  const claims = (g = 0) => ctx.waitFor(`(d => window.peix.screen(${g}).some(r => r.includes('<<' + d.cols + 'x' + d.rows + '>>')))(window.peix.grid(${g}))`, { timeout: 1500, what: 'the screen drawn for its grid' }).then(() => true, () => false);

  await ctx.openChat(other.id); await ctx.key('KeyC'); await ctx.waitPrompt();
  await ctx.openChat(chat.id); await ctx.key('KeyC'); await ctx.waitPrompt();
  await ctx.sleep(600);

  // 1. a claude that never answers: the grid follows as before, only later
  await knob('silent');
  await ctx.cmd('Digit2');
  out.silent = await letGo('no answer', 1000);
  assert.ok(out.silent < 600, `no answer: let go in ${out.silent} ms`);
  await ctx.cmd('KeyW'); await letGo('no answer, closed', 1000);
  await knob('real');

  // 2. one that answers late: the grid goes ahead, and the repaint, when it comes, is drawn for it
  await knob('slow 700');
  await ctx.cmd('Digit2');
  out.late = await letGo('a late answer', 1000);
  await ctx.waitFor(`(async () => (d => window.peix.screen(0).some(r => r.includes('<<' + d.cols + 'x' + d.rows + '>>')))(window.peix.grid(0)))()`, { timeout: 3000, what: 'the late repaint' });
  await ctx.cmd('KeyW'); await letGo('a late answer, closed', 1500); await ctx.sleep(900);
  await knob('real');

  // 3. output that never stops, a line every 20 ms: the repaint is told from it by its size, and the line goes on after
  await knob('stream 20');
  await ctx.watchFrames(0); await ctx.sleep(150);
  await ctx.cmd('Digit2');
  out.stream20 = await letGo('a stream', 1000);
  await ctx.sleep(500);
  let f = await ctx.frames(), bad = frameTrouble(f.frames);
  out.stream20 = { ms: out.stream20, stale: bad.stale.length, torn: bad.torn.length };
  assert.deepEqual([bad.stale.length, bad.torn.length], [0, 0], `a stream every 20 ms: every frame whole and for its grid: ${JSON.stringify(out.stream20)}`);
  const n1 = await ctx.evaluate(`+(window.peix.screen(0).join(' ').match(/stream (\\d+)/) || [])[1]`); await ctx.sleep(300);
  assert.ok(await ctx.evaluate(`+(window.peix.screen(0).join(' ').match(/stream (\\d+)/) || [])[1]`) > n1, 'the stream goes on');
  await ctx.cmd('KeyW'); await letGo('a stream, closed', 1000);
  // …and every 4 ms, past any quiet: the wait gives up at its longest, and nothing is lost
  await knob('stream 4');
  await ctx.cmd('Digit2');
  out.stream4 = await letGo('a stream with no gap', 1000);
  assert.ok(await claims(), 'a stream with no gap: the screen is drawn for its grid');
  await ctx.cmd('KeyW'); await letGo('a stream with no gap, closed', 1000);
  await knob('stream 0');

  // 4. keys typed while the screen waits: all of them, in order
  await knob('slow 120');
  await ctx.cmd('Digit2');
  for (const k of 'held keys') await ctx.evaluate(`document.querySelector('#termBody textarea').dispatchEvent(new InputEvent('input', { data: ${JSON.stringify(k)}, inputType: 'insertText', bubbles: true }))`);
  await letGo('keys typed', 1000);
  await ctx.waitFor(`window.peix.screen(0).some(r => /❯ held keys$/.test(r))`, { what: 'the keys typed, in order' });
  await ctx.evaluate(`document.querySelector('#termBody textarea').dispatchEvent(new InputEvent('input', { data: '\\x15', inputType: 'insertText', bubbles: true }))`);   // ⌃U: the prompt empty again
  await ctx.cmd('KeyW'); await letGo('keys typed, closed', 1000);

  // 5. another chat while the screen waits: none of this one's wait reaches that one
  await knob('slow 300');
  await ctx.cmd('Digit2'); await ctx.sleep(40);
  await ctx.evaluate(`document.querySelector('#slist > .card[data-id="${other.id}"] .title').click()`);
  await ctx.waitFor(`window.peix.state().current === '${other.id}' && window.peix.state().termId === window.peix.session().terminal?.id`, { what: 'the other chat in the drawer' });
  await letGo('another chat', 2000); await ctx.sleep(500);
  assert.ok(await claims(), 'another chat: its screen is drawn for its grid');
  await ctx.evaluate(`document.querySelector('#slist > .card[data-id="${chat.id}"] .title').click()`);
  await ctx.waitFor(`window.peix.state().current === '${chat.id}' && window.peix.state().termId === window.peix.session().terminal?.id`, { what: 'back' });
  await letGo('back', 2000); await ctx.sleep(900);
  assert.ok(await claims(), 'back: the screen is drawn for its grid');
  const d = await grid(0), held = await holderRows(ctx.server, d.id), mine = await ctx.peix('screen(0)');
  assert.deepEqual(mine.map(r => r.replace(/elapsed\s+\S+\s+\S+/, '')), held.rows.map(r => r.replace(/elapsed\s+\S+\s+\S+/, '')), 'back: the page\'s screen is the holder\'s');
  if (await ctx.peix('state().split')) await ctx.cmd('KeyW');

  // 6. the server goes while the screen waits: the drawer comes back, at the size the body holds
  await ctx.sleep(400);
  await ctx.cmd('Digit2'); await ctx.sleep(30);
  await ctx.server.restart();
  await ctx.waitFor(`window.peix.grid(0).id && window.peix.screen(0).some(r => r.includes('❯'))`, { timeout: 20000, what: 'the drawer back after the restart' });
  await letGo('the restart', 3000); await ctx.sleep(1200);
  assert.ok(await claims(), 'after the restart: the screen is drawn for its grid');
  await ctx.type('after the restart');
  await ctx.waitFor(`window.peix.screen(0).some(r => r.includes('You said: after the restart'))`, { what: 'a word typed after the restart' });

  // 7. the drawer ends while the screen waits: nothing left waiting
  await knob('slow 500');
  await ctx.cmd('KeyW'); await ctx.sleep(20);
  const id = (await grid(0)).id;
  await ctx.server.api(`api/terminals/${id}`, { method: 'DELETE' });
  await ctx.waitFor(`!window.peix.grid(0).id`, { what: 'the drawer gone' });
  await ctx.waitFor(`(x => !x.hold && !x.refits)(window.peix.grid(0))`, { what: 'nothing waiting' });
  return out;
}
