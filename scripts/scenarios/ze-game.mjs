// ⌥⌘Z, Zé's game (2026-10-30): the title — his face in pixels, the four ways to play (← → and 1–4), the music (T: the
// funk or the vira) —, a round started by a real space (the music's context made by that press), meat eaten (score, his
// bulk up), a green that hits (his bulk down, BLEH), one kicked out of the sky, three meats in a row (the Ford Focus:
// faster, its horn on space, gone after its time), three greens in a row (the Mercedes A-Class: slower, over onto its
// roof as it leaves), five in a row (COMBO ×2), the briefcase (AGENT ZÉ), level 3 as ENTER THE DRAGON (twice his size,
// the dragon's track, a green eaten for points, back at level 4), the pause (frames and music stopped), his bulk run out
// (only bones: the K.O., that way's best kept), Again, M closing the sound and bringing it back, the K.O.'s Menu,
// HARDCORE's bag, esc closing it all (no frame, no context), ⌥⌘Z opening and closing it.
export const meta = { server: true };

export default async function (ctx) {
  const out = {};
  await ctx.waitFor(`window.peix.state().snapshots > 0`, { what: 'the board' });
  const press = async (code, key, vk) => {   // through the browser's input: a press the page may start sound on
    await ctx.send('Input.dispatchKeyEvent', { type: 'keyDown', code, key, windowsVirtualKeyCode: vk });
    await ctx.send('Input.dispatchKeyEvent', { type: 'keyUp', code, key, windowsVirtualKeyCode: vk });
  };
  const game = () => ctx.evaluate(`(() => { const z = window.peix.ze(), g = z.g; return JSON.stringify({ open: document.querySelector('#zeGame').open, raf: !!z.raf, frames: z.frames,
    music: z.music ? z.music.ac.state : null, track: z.music ? z.music.track : null, engine: !!z.music?.engine, phase: g.phase, score: g.score, mass: g.mass, streak: g.streak,
    mult: g.mult, level: g.level, dragon: g.dragon, ride: g.ride && g.ride.kind, leaving: g.leaving && g.leaving.kind, agent: g.agent, items: g.items.length,
    words: g.words.map(w => w.s), banner: g.banner && g.banner.s, diff: window.peix.prefs().zeDiff, tune: window.peix.prefs().zeMusic }); })()`).then(JSON.parse);
  // drops what it is given into the round, nothing falling on its own meanwhile; at: [dx, dy] from Zé's feet
  const drop = (kind, e, at, more = {}) => ctx.evaluate(`(() => { const g = window.peix.ze().g; g.spawn = 1e9; g.hurt = 0;
    g.items.push({ kind: ${JSON.stringify(kind)}, e: ${JSON.stringify(e)}, pts: 15, say: ${JSON.stringify(kind === 'veg' ? 'BLEH! test' : 'test')}, x: g.x + g.f * ${at[0]}, y: g.y + ${at[1]}, vx: 0, vy: 0, g: 0, rot: 0, spin: 0, ...${JSON.stringify(more)} }); })()`);
  const eat = async (kind, e, n = 1) => {   // n onto his head, one by one, each met before the next
    for (let i = 0; i < n; i++) {
      const before = await ctx.evaluate(`window.peix.ze().g.items.length`);
      await drop(kind, e, [0, -150]);
      await ctx.waitFor(`window.peix.ze().g.items.length <= ${before}`, { what: `${kind} ${i + 1} met` });
    }
  };

  // ⌥⌘Z: the title, a frame loop, no sound yet; the ways to play and the music by key
  await ctx.key('KeyZ');
  await ctx.waitFor(`document.querySelector('#zeGame').open && window.peix.ze().raf && window.peix.ze().frames > 2`, { what: 'the game' });
  out.title = await game();
  ctx.assert.equal(out.title.phase, 'title'); ctx.assert.equal(out.title.music, null, 'no sound before a round');
  ctx.assert.equal(await ctx.evaluate(`document.activeElement === document.querySelector('#zeGame')`), true, 'the keys are the game\'s');
  const box = await ctx.evaluate(`(r => [r.width, r.height])(document.querySelector('#zeCanvas').getBoundingClientRect())`);
  ctx.assert.ok(box[1] > box[0], `taller than wide: ${box}`);
  await press('ArrowRight', 'ArrowRight', 39);
  ctx.assert.equal((await game()).diff, 2, '→ from NORMAL: HARD');
  await press('Digit1', '1', 49);
  ctx.assert.equal((await game()).diff, 0, '1: EASY');
  await press('Digit2', '2', 50);
  await press('KeyT', 't', 84);
  ctx.assert.equal((await game()).tune, 'vira', 'T: the vira');
  ctx.assert.equal(await ctx.evaluate(`document.querySelector('#zeTune').textContent`), '♪ vira de Barcelos');
  await ctx.settle(); await ctx.shot('1-title');

  // space: a round, the vira playing
  await press('Space', ' ', 32);
  await ctx.waitFor(`window.peix.ze().g.phase === 'play' && window.peix.ze().music?.ac.state === 'running' && window.peix.ze().music.track === 'band'`, { what: 'the round and its music' });
  const s0 = await ctx.evaluate(`window.peix.ze().music.step`); await ctx.sleep(600);
  ctx.assert.ok(await ctx.evaluate(`window.peix.ze().music.step`) > s0, 'the vira\'s quavers planned');
  await press('KeyT', 't', 84);
  ctx.assert.equal((await game()).tune, 'funk', 'T again: the funk');
  // meat: eaten, counted, bigger; a green: smaller, BLEH
  await eat('meat', '🥩');
  out.meat = await game();
  ctx.assert.equal(out.meat.score, 15); ctx.assert.equal(out.meat.mass, 7, 'a meat: one bigger');
  await eat('veg', '🥦');
  out.hit = await game();
  ctx.assert.equal(out.hit.mass, 6, 'a green: one smaller'); ctx.assert.equal(out.hit.streak, 0); ctx.assert.ok(out.hit.words.some(w => /^BLEH!/.test(w)), 'BLEH said');
  // one in front of his foot: a kick sends it out of the sky
  await drop('veg', '🥕', [50, -70]);
  await ctx.sleep(100); ctx.assert.equal((await game()).mass, 6, 'not touching him');
  await press('Space', ' ', 32);
  await ctx.waitFor(`window.peix.ze().g.score === 20`, { what: 'the carrot kicked' });
  ctx.assert.ok((await game()).words.some(w => w === 'WATAAA!' || w === 'KRAV MAGA!'));

  // three meats in a row: the Ford Focus — faster, space its horn; its time up, it drives off
  await eat('meat', '🍗', 3);
  out.focus = await game();
  ctx.assert.equal(out.focus.ride, 'focus'); ctx.assert.equal(out.focus.banner, 'FORD FOCUS!'); ctx.assert.ok(out.focus.engine, 'its engine');
  ctx.assert.equal(out.focus.mass, 9);
  await ctx.send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'ArrowRight', key: 'ArrowRight', windowsVirtualKeyCode: 39 });
  await ctx.sleep(700);
  out.fast = await ctx.evaluate(`window.peix.ze().g.vx`);
  await ctx.send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'ArrowRight', key: 'ArrowRight', windowsVirtualKeyCode: 39 });
  ctx.assert.ok(out.fast > 600, `the Focus is quick: ${out.fast}`);
  await ctx.sleep(400);
  await press('Space', ' ', 32);
  ctx.assert.ok((await game()).words.includes('BEEP BEEP!'), 'space: its horn');
  await ctx.shot('2-focus');
  await ctx.evaluate(`window.peix.ze().g.ride.t = .05`);
  await ctx.waitFor(`!window.peix.ze().g.ride && window.peix.ze().g.leaving?.kind === 'focus' && !window.peix.ze().music.engine`, { what: 'the Focus driving off' });

  // two more in a row: COMBO ×2 (five)
  await eat('meat', '🥓', 2);
  out.combo = await game();
  ctx.assert.equal(out.combo.mult, 2); ctx.assert.ok(out.combo.words.includes('COMBO ×2!'));

  // three greens in a row: the Mercedes A-Class — slower; its time up, over onto its roof
  await eat('veg', '🥬', 3);
  out.aclass = await game();
  ctx.assert.equal(out.aclass.ride, 'aclass'); ctx.assert.equal(out.aclass.mass, 8);
  await ctx.send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'ArrowLeft', key: 'ArrowLeft', windowsVirtualKeyCode: 37 });
  await ctx.sleep(900);
  out.slow = await ctx.evaluate(`window.peix.ze().g.vx`);
  await ctx.send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'ArrowLeft', key: 'ArrowLeft', windowsVirtualKeyCode: 37 });
  ctx.assert.ok(out.slow > -250 && out.slow < -100, `the A-Class is slow: ${out.slow}`);
  await ctx.shot('3-aclass');
  await ctx.evaluate(`window.peix.ze().g.ride.t = .05`);
  await ctx.waitFor(`!window.peix.ze().g.ride && window.peix.ze().g.leaving?.kind === 'aclass'`, { what: 'the A-Class leaving' });
  ctx.assert.ok((await game()).words.includes('FAILED THE MOOSE TEST!'));
  await ctx.sleep(400); await ctx.shot('4-moose');

  // the briefcase: AGENT ZÉ
  await eat('case', '💼');
  out.agent = await game();
  ctx.assert.equal(out.agent.agent, true); ctx.assert.equal(out.agent.banner, 'AGENT ZÉ');

  // level 3: ENTER THE DRAGON — twice his size, the dragon's track, a green is food; its time up, level 4
  await ctx.evaluate(`(() => { const g = window.peix.ze().g; g.items.length = 0; g.level = 2; g.next = g.score + 1; })()`);
  await eat('meat', '🥩');
  await ctx.waitFor(`window.peix.ze().g.dragon > 0 && window.peix.ze().g.level === 3 && window.peix.ze().music.track === 'dragon'`, { what: 'the dragon' });
  await ctx.sleep(1400);   // grown
  const before = await game();
  await drop('veg', '🥦', [0, -300]);
  await ctx.waitFor(`window.peix.ze().g.score > ${before.score}`, { what: 'a green eaten as the dragon' });
  out.dragon = await game();
  ctx.assert.equal(out.dragon.mass, before.mass, 'a green takes nothing off the dragon'); ctx.assert.ok(out.dragon.words.some(w => /^\+10$/.test(w)), 'ten for it');
  await ctx.shot('5-dragon');
  await ctx.evaluate(`window.peix.ze().g.dragon = .05`);
  await ctx.waitFor(`!window.peix.ze().g.dragon && window.peix.ze().g.level === 4 && window.peix.ze().music.track === 'band'`, { what: 'back to normal, level 4' });

  // P: the frames and the music stop; P again goes on
  await press('KeyP', 'p', 80);
  await ctx.waitFor(`window.peix.ze().g.phase === 'pause' && !window.peix.ze().raf && window.peix.ze().music.ac.state === 'suspended'`, { what: 'the pause' });
  const f0 = (await game()).frames; await ctx.sleep(300);
  ctx.assert.equal((await game()).frames, f0, 'no frame drawn while paused');
  await press('KeyP', 'p', 80);
  await ctx.waitFor(`window.peix.ze().g.phase === 'play' && window.peix.ze().raf && window.peix.ze().music.ac.state === 'running'`, { what: 'the round again' });

  // his bulk run out: only bones, the K.O., NORMAL's best kept — and the agent's line
  const ko = async () => {
    await ctx.evaluate(`(() => { const g = window.peix.ze().g; g.items.length = 0; g.mass = 1; })()`);
    await ctx.evaluate(`window.peix.ze().g.mass = 2`);   // thin first: his ribs
    await ctx.sleep(150); await ctx.shot('6-thin');
    await ctx.evaluate(`window.peix.ze().g.mass = 1`);
    await drop('veg', '🍆', [0, -100]);
    await ctx.waitFor(`window.peix.ze().g.phase === 'over'`, { what: 'the K.O.' });
  };
  await ko();
  out.ko = await game();
  ctx.assert.equal(out.ko.mass, 0);
  ctx.assert.equal(await ctx.evaluate(`window.peix.ze().g.ko`), 'the Mossad has never heard of him', 'the agent\'s K.O.');
  ctx.assert.equal((await ctx.peix('prefs().zeBest')).normal, out.ko.score, 'the best is NORMAL\'s');
  await press('Space', ' ', 32);
  ctx.assert.equal((await game()).phase, 'over', 'a press at once is no new round');
  await ctx.sleep(900); await ctx.shot('7-ko');
  await press('Space', ' ', 32);   // Again
  await ctx.waitFor(`window.peix.ze().g.phase === 'play' && window.peix.ze().g.score === 0 && window.peix.ze().g.mass === 6 && !window.peix.ze().g.agent`, { what: 'another round' });

  // M: the sound closed, and back
  await press('KeyM', 'm', 77);
  await ctx.waitFor(`!window.peix.ze().music && window.peix.prefs().zeSound === false`, { what: 'the sound off' });
  ctx.assert.equal(await ctx.evaluate(`document.querySelector('#zeSnd').textContent`), 'sound off');
  await press('KeyM', 'm', 77);
  await ctx.waitFor(`window.peix.ze().music?.ac.state === 'running' && window.peix.prefs().zeSound === true`, { what: 'the sound on again' });

  // the K.O.'s Menu: → then space, the title again
  await ko(); await ctx.sleep(900);
  await press('ArrowRight', 'ArrowRight', 39); await press('Space', ' ', 32);
  await ctx.waitFor(`window.peix.ze().g.phase === 'title'`, { what: 'the menu' });

  // HARDCORE: its bag, five meats in fifty
  await press('Digit4', '4', 52); await press('Space', ' ', 32);
  await ctx.waitFor(`window.peix.ze().g.phase === 'play' && window.peix.ze().g.bag.length`, { what: 'HARDCORE\'s first deal' });
  out.bag = await ctx.evaluate(`(() => { const g = window.peix.ze().g, first = g.items[0]; return { left: g.bag.length, meat: g.bag.filter(b => !b).length + (first && first.kind !== 'veg' ? 1 : 0) }; })()`);
  ctx.assert.deepEqual(out.bag, { left: 49, meat: 5 }, 'forty-nine left after the first; five meats in all');
  await ctx.evaluate(`window.peix.ze().g.spawn = 1e9`);
  await press('Escape', 'Escape', 27);
  await ctx.waitFor(`!document.querySelector('#zeGame').open && !window.peix.ze().raf`, { what: 'esc closing it' });   // the close event: a task after the close
  out.closed = await game();
  ctx.assert.equal(out.closed.music, null, 'the context closed with it');
  await ctx.sleep(300); ctx.assert.equal((await game()).frames, out.closed.frames, 'no frame after it closed');

  // ⌥⌘Z opens it on its title, and closes it
  await ctx.key('KeyZ');
  await ctx.waitFor(`document.querySelector('#zeGame').open && window.peix.ze().g.phase === 'title'`, { what: 'the game again' });
  await ctx.key('KeyZ');
  await ctx.waitFor(`!document.querySelector('#zeGame').open && !window.peix.ze().music`, { what: '⌥⌘Z again closing it' });
  return out;
}
