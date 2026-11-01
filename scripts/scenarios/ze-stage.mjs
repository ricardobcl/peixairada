// ⌥⌘Z on the GPU (2026-11-01): the stage comes with the dialog and goes with it, the picture is drawn on it and the HUD stays
// on the top canvas, a lost context is the 2D canvas. Headless Chrome's WebGL is a software one (meta.gl).
export const meta = { server: true, gl: true, prefs: { zeSound: false } };
export default async function (ctx) {
  const { assert } = ctx, out = {};
  await ctx.waitFor(`window.peix.state().snapshots > 0`, { what: 'the board' });
  assert.equal(await ctx.evaluate(`document.querySelector('#zeGL')`), null, 'no stage before the game is opened');
  await ctx.key('KeyZ');
  await ctx.waitFor(`document.querySelector('#zeGame').open && window.peix.ze().stage.frames > 3`, { what: 'the stage drawing' });
  await ctx.settle();
  // what the glass shows, read in the frame that drew it
  const px = (x, y) => ctx.evaluate(`(() => { const z = window.peix.ze(), gl = z.stage.gl, k = gl.canvas.width / 720; z.lab.draw(); const p = new Uint8Array(4); gl.readPixels(Math.round(${x} * k), gl.canvas.height - Math.round(${y} * k), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, p); return [...p]; })()`);
  const sky = await px(360, 300);
  assert.ok(sky[0] + sky[1] + sky[2] > 40, `the sky on the glass, not black: ${sky}`);
  const box = await ctx.evaluate(`(() => { const r = e => { const b = document.querySelector(e).getBoundingClientRect(); return [b.x, b.y, b.width, b.height]; }; return JSON.stringify([r('#zeGL'), r('#zeCanvas')]); })()`);
  const [a, b] = JSON.parse(box); assert.deepEqual(a, b, 'the stage exactly under the top canvas');
  // the HUD on the top canvas, the picture not
  const top = (x, y) => ctx.evaluate(`(() => { const c = document.querySelector('#zeCanvas'), k = c.width / 720; return [...c.getContext('2d').getImageData(Math.round(${x} * k), Math.round(${y} * k), 1, 1).data]; })()`);
  await ctx.evaluate(`window.peix.ze().lab.demo().score = 0`); await ctx.waitFor(`window.peix.ze().g.demo && window.peix.ze().g.phase === 'play'`, { what: 'a demo round' }); await ctx.sleep(100);
  assert.equal((await top(360, 300))[3], 0, 'the top canvas is clear over the sky');
  const hud = await ctx.evaluate(`(() => { const c = document.querySelector('#zeCanvas'), k = c.width / 720, d = c.getContext('2d').getImageData(0, 0, Math.round(200 * k), Math.round(48 * k)).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 200) n++; return n; })()`);
  assert.ok(hud > 200, `the score on the top canvas: ${hud} px`);
  await ctx.shot('round', await ctx.evaluate(`(r => ({ x: r.x, y: r.y, width: r.width, height: r.height }))(document.querySelector('#zeStack').getBoundingClientRect())`));
  // the moments through the batcher: nothing thrown
  for (const m of [`z.lab.zeRide(g, 'focus')`, `z.lab.zeRide(g, 'aclass')`, `z.lab.zeDragon(g, true)`, `z.lab.zeAvo(g)`, `g.power = { kind: 'vinho', t: 2 }`, `g.flex = 1`, `g.nun = 8; g.holdAt = g.t - 1`, `g.galo = { mode: 'coop', x: 200, y: 842, vx: 0, vy: 0, f: 1, peck: 0, flaps: 0, score: 0, t: 0 }`, `g.agent = true`,
    `for (const it of [{ kind: 'peixe', e: '' }, { kind: 'power', p: 'bifana', e: '' }, { kind: 'gold', e: '🐓' }, { kind: 'case', e: '💼' }, { kind: 'meat', e: '🍗', special: true, dish: 'Rojões' }, { kind: 'meat', e: '🍗', stood: .5 }]) g.items.push({ x: 120 + g.items.length * 90, y: 300, vx: 0, vy: 0, g: 0, rot: 0, spin: 0, pts: 5, say: '', ...it })`,
    `g.demo = false; g.mass = 1; g.hurt = 0; g.items.push({ kind: 'veg', e: '🥦', say: 'x', x: g.x, y: g.y - 110, vx: 0, vy: 0, g: 0, rot: 0, spin: 0 })`]) {
    await ctx.evaluate(`(() => { const z = window.peix.ze(), g = z.lab.demo(); ${m}; })()`); const f0 = await ctx.evaluate(`window.peix.ze().stage.frames`); await ctx.waitFor(`window.peix.ze().stage.frames > ${f0 + 3}`, { what: m });
  }
  // a level-up: fireworks over the river
  await ctx.evaluate(`(() => { const z = window.peix.ze(), g = z.lab.demo(); g.demo = false; g.spawn = 1e9; g.next = g.score + 1; g.items.push({ kind: 'meat', e: '🥩', pts: 15, say: 'x', x: g.x, y: g.y - 120, vx: 0, vy: 0, g: 0, rot: 0, spin: 0 }); })()`);
  await ctx.waitFor(`window.peix.ze().g.level === 2 && window.peix.ze().g.fw.length === 3`, { what: 'the fireworks' });
  { const f0 = await ctx.evaluate(`window.peix.ze().stage.frames`); await ctx.waitFor(`window.peix.ze().stage.frames > ${f0 + 3}`, { what: 'the fireworks drawn' }); }
  // under reduced motion: nothing drifts, no fireworks, the K.O. at once
  await ctx.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  const calm = JSON.parse(await ctx.evaluate(`(async () => { const z = window.peix.ze(), g = z.lab.demo(), T0 = z.stage.T, f0 = z.stage.frames; while (z.stage.frames < f0 + 4) await new Promise(r => setTimeout(r, 30)); return JSON.stringify({ still: z.stage.T === T0 }); })()`));
  assert.ok(calm.still, 'the water and the air hold still');
  await ctx.evaluate(`(() => { const z = window.peix.ze(), g = z.lab.demo(); g.demo = false; g.spawn = 1e9; g.mass = 1; g.hurt = 0; g.items.push({ kind: 'veg', e: '🥦', say: 'x', x: g.x, y: g.y - 110, vx: 0, vy: 0, g: 0, rot: 0, spin: 0 }); })()`);
  await ctx.waitFor(`window.peix.ze().g.phase === 'over'`, { what: 'the K.O.' });
  assert.ok(await ctx.evaluate(`window.peix.ze().g.koT >= .9`), 'the K.O. at once');
  await ctx.send('Emulation.setEmulatedMedia', { features: [] });
  await ctx.evaluate(`window.peix.ze().lab.demo()`);
  // a context lost: the same game on its 2D canvas, the same dialog
  await ctx.evaluate(`window.peix.ze().stage.gl.getExtension('WEBGL_lose_context').loseContext()`);
  await ctx.waitFor(`window.peix.ze().stage.off && !window.peix.ze().stage.gl && !document.querySelector('#zeGL')`, { what: 'the stage let go' });
  const f1 = await ctx.evaluate(`window.peix.ze().frames`); await ctx.waitFor(`window.peix.ze().frames > ${f1 + 3}`, { what: 'the game going on' });
  assert.ok((await top(360, 300))[3] === 255, 'the 2D canvas paints the sky again');
  // closed, all of it goes; opened again, the stage is back
  await ctx.evaluate(`document.querySelector('#zeGame').close()`);
  await ctx.waitFor(`!document.querySelector('#zeGame').open && !window.peix.ze().stage.gl && !document.querySelector('#zeGL') && !window.peix.ze().stage.off`, { what: 'the stage gone with the dialog' });
  await ctx.key('KeyZ');
  await ctx.waitFor(`window.peix.ze().stage.frames > 3 && document.querySelector('#zeGL')`, { what: 'the stage back' });
  await ctx.evaluate(`document.querySelector('#zeGame').close()`);
  return out;
}
