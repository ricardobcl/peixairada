// A chat switched to with its drawer open (2026-10-11, late afternoon): the drawer comes up where it stays. The
// re-attach's nudge — the PTY a row short, then its size again, so Claude Code repaints over the snapshot — drew the
// screen a row high for 150 ms before it dropped into place (its prompt is pinned to the bottom of the size it is
// told). What is checked, frame by frame from the click: the screen's last line, once there is one, is on the row it
// ends on, every frame — and the screen is whole after.
export const meta = { server: true, fixture: 'auto', fake: true };

export default async function (ctx) {
  const [two, plain] = ctx.fixture.chats;
  const out = {};

  for (const id of [plain.id, two.id]) {
    await ctx.openChat(id);
    await ctx.key('KeyC'); // ⌥⌘C: its claude in the drawer
    await ctx.waitPrompt(15000);

    for (let index = 0; index < 3; index++) {
      await ctx.type(`line ${index} of ${id.slice(0, 4)}\r`);
      await ctx.sleep(400);
    }
  }

  await ctx.sleep(1200);
  await ctx.settle();

  // per frame: which row holds the screen's last words, for 1.5 s from the click
  const frames = () =>
    ctx
      .evaluate(
        `new Promise(done => { const s = [], t0 = performance.now();
    (function f() { const rows = [...document.querySelectorAll('#termBody .xterm-rows > div')];
      s.push({ t: Math.round(performance.now() - t0), sid: window.peix.state().current, last: rows.map(r => r.textContent.trim()).findLastIndex(x => x) });
      if (performance.now() - t0 < 1500) requestAnimationFrame(f); else done(JSON.stringify(s)); })(); })`,
      )
      .then(JSON.parse);

  for (const [label, to] of [
    ['plain', plain],
    ['two', two],
    ['plain again', plain],
  ]) {
    const seen = frames();

    await ctx.evaluate(`document.querySelector('#slist > .card[data-id="${to.id}"] .title').click()`);
    const drawn = (await seen).filter(frame => frame.sid === to.id && frame.last >= 0);

    ctx.assert.ok(drawn.length > 10, `${label}: the drawer drew (${drawn.length} frames)`);

    const end = drawn.at(-1).last;
    const off = drawn.filter(frame => frame.last !== end);

    (out.switches ||= []).push({ label, end, rows: [...new Set(drawn.map(frame => frame.last))] });

    ctx.assert.deepEqual(
      off,
      [],
      `${label}: every frame on the row it ends on (${end}) — ${JSON.stringify(off.slice(0, 4))}`,
    );
  }

  const screen = await ctx.screen();

  ctx.assert.ok(
    screen.some(row => /^❯/.test(row)) && screen.some(row => /fake mode on/.test(row)),
    'the prompt and the status bar, whole',
  );

  return out;
}
