// A drawer through every change of the column's shape (2026-11-05): a TUI's drawing is for one size, so a frame showing it
// on another grid is the flicker, and so is a frame landing in its repaint. The fake answers a resize as the real CLI does
// (FAKE_ANSWER=real) in chunks far apart, and says on the screen the size it drew for (FAKE_SIZE_MARK), so what is checked,
// every frame of every change, is a fact: the drawing is whole and is for the grid it is on. And each change costs the PTY
// one resize, a drag too, and is over quickly; and a zsh at its prompt, whose screen is xterm's to reflow, still follows a drag live.
// REPAINT_DEBUG=1 logs the rows that changed between one look and the next.
import { frameTrouble, looks } from '../../lib/framewatch.mjs';

export const meta = { server: true, fake: true, fixture: 'auto', env: { FAKE_TUI: 'fullscreen', FAKE_SIZE_MARK: '1', FAKE_ANSWER: 'real', FAKE_ANSWER_GAP_MS: '2' } };

const vp = (ctx, width, height = 1000) => ctx.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 0, mobile: false });
/** The pointer's own drag, a move a frame: a bar held by the hand, which ctx.drag's eight moves at once are not. */
async function holdBar(ctx, sel, dx, dy, steps = 20) {
  const a = await ctx.evaluate(`(r => ({ x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }))(document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect())`);
  const mouse = (type, x, y, buttons) => ctx.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons, clickCount: 1 });
  await ctx.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: a.x, y: a.y });
  await mouse('mousePressed', a.x, a.y, 1);
  for (let i = 1; i <= steps; i++) { await mouse('mouseMoved', Math.round(a.x + dx * i / steps), Math.round(a.y + dy * i / steps), 1); await ctx.sleep(16); }
  await mouse('mouseReleased', a.x + dx, a.y + dy, 0);
}

export default async function (ctx) {
  const { assert } = ctx, chat = ctx.fixture.chats[1], out = {}, fails = [];
  const check = (ok, msg) => { if (!ok) fails.push(msg); };   // all of them run, whichever fails: the table is the point
  await ctx.openChat(chat.id);
  await ctx.key('KeyC'); await ctx.waitPrompt();
  for (let i = 0; i < 4; i++) { await ctx.type(`line ${i} that runs on long enough to wrap in half the column ${'and on '.repeat(16)}`); await ctx.sleep(300); }
  await ctx.sleep(800); await ctx.settle();
  const quiet = g => ctx.waitFor(`(g => !g.hold && !g.refits)(window.peix.grid(${g}))`, { timeout: 3000, what: 'the drawer settled' });

  /** One change, watched in half `g`: nothing wrong in any frame, `pty` resizes at most, over within `ms`. */
  // `ms` is a ceiling a loaded Mac stays under, not a speed: a wait that ran to REPAINT_MAX_MS would still be inside it — the frames are the check
  const change = async (label, act, { g = 0, pty = 1, ms = 500 } = {}) => {
    await ctx.watchFrames(g); await ctx.sleep(120);
    const at = await ctx.evaluate('window.__frames ? performance.now() : 0');
    await act();
    await ctx.sleep(200); await quiet(g); await ctx.sleep(350);
    const end = await ctx.evaluate('performance.now()');
    const { frames, sends } = await ctx.frames(), t0 = end - (frames.at(-1)?.t ?? 0);   // the watch's clock, near enough for the time taken
    const { stale, torn, blank } = frameTrouble(frames), said = looks(frames), last = said.at(-1);
    out[label] = { frames: frames.length, stale: stale.length, torn: torn.length, blank: blank.length, looks: said.length - 1, pty: sends.length, tookMs: Math.round(last.t + t0 - at), seq: said.map(f => `${Math.round(f.t + t0 - at)}ms ${f.cols}x${f.rows} ${f.top} n${f.n}${f.hold ? " hold" : ""}`).join(" | "), sends: sends.map(x => `${Math.round(x.t + t0 - at)}ms ${x.cols}x${x.rows}`).join(" ") };
    ctx.log(label, JSON.stringify(out[label]));
    if (process.env.REPAINT_DEBUG) for (let i = 1; i < said.length; i++) { const p = said[i - 1].text || [], q = said[i].text || []; ctx.log('  look', i, q.map((r, y) => r === p[y] ? null : y + ': ' + JSON.stringify(p[y]) + ' → ' + JSON.stringify(r)).filter(Boolean).slice(0, 4).join(' ‖ ')); }
    check(!stale.length && !torn.length && !blank.length, `${label}: every frame whole, and drawn for its grid: ${JSON.stringify({ stale: stale.slice(0, 1), torn: torn.slice(0, 1), blank: blank.slice(0, 1) })}`);
    check(sends.length <= pty, `${label}: at most ${pty} resize(s) of the PTY: ${JSON.stringify(sends)}`);
    const d = await ctx.peix(`term(${g})`);
    check(d.cols === d.propose.cols && d.rows === d.propose.rows, `${label}: the grid (${d.cols}x${d.rows}) is what the body holds (${d.propose.cols}x${d.propose.rows})`);
    check((await ctx.screen(g)).some(r => r.includes(`<<${d.cols}x${d.rows}>>`)), `${label}: the screen is drawn for that grid`);
    if (ms) check(out[label].tookMs <= ms, `${label}: over in ${ms} ms, took ${out[label].tookMs}`);
  };

  await change('split ⌘2', () => ctx.cmd('Digit2'));
  // a drag: one resize, or one more for a pause past FIT_STILL_MS a loaded machine makes in it
  await change('the halves’ divider, dragged', () => holdBar(ctx, '#gsplit', -200, 0), { ms: 0, pty: 3 });
  await change('turned ⌥⌘1', () => ctx.key('Digit1'));
  await change('the divider, dragged, one over the other', () => holdBar(ctx, '#gsplit', 0, 120), { ms: 0, pty: 3 });
  await change('turned back ⌘1', () => ctx.cmd('Digit1'));
  await ctx.cmd('Digit2');
  await change('the half closed ⌘W', () => ctx.cmd('KeyW'));
  await change('list hidden ⌥⌘B', () => ctx.key('KeyB'));
  await change('list shown ⌥⌘B', () => ctx.key('KeyB'));
  await change('list’s splitter, dragged', () => holdBar(ctx, '#splitter', 160, 0), { ms: 0, pty: 3 });
  await change('chat’s size ⌘+', () => ctx.evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: '=', metaKey: true, bubbles: true, cancelable: true }))`));
  await change('chat’s size back ⌘0', () => ctx.evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: '0', metaKey: true, bubbles: true, cancelable: true }))`));
  await change('window a step', () => vp(ctx, 1500), { ms: 800 });
  await change('window dragged', async () => { for (let i = 1; i <= 24; i++) { await vp(ctx, 1500 + i * 8); await ctx.sleep(16); } }, { ms: 0, pty: 3 });
  await change('a zsh ⌥⌘T', async () => { await ctx.key('KeyT'); await ctx.waitFor(`window.peix.session()?.shell`, { what: 'the zsh' }); }, { pty: 4, ms: 0 });
  await ctx.sleep(600);

  // a zsh at its prompt: xterm's to reflow, live under the drag, the PTY told once it stops. Both halves' resizes count here.
  await ctx.watchFrames(1); await ctx.sleep(120);
  await holdBar(ctx, '#gsplit', 160, 0);
  await ctx.sleep(500);
  const z = await ctx.frames(), widths = new Set(z.frames.map(f => f.cols));
  out['zsh, dragged'] = { widths: widths.size, pty: z.sends.length };
  ctx.log('zsh, dragged', JSON.stringify(out['zsh, dragged']));
  check(widths.size >= 5, `the zsh reflowed under the drag: ${[...widths]}`);
  check(z.sends.length <= 4, `a resize or two a half for the whole drag, not one a column: ${JSON.stringify(z.sends)}`);

  await change('the zsh closed ⌥⌘W', () => ctx.key('KeyW'), { ms: 700 });   // the server ends the zsh first
  assert.deepEqual(fails, [], `${fails.length} wrong`);
  return out;
}
