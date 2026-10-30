// ⌥⌘Z, Zé's game (2026-10-30): the title with the face from beside the setup file and its four ways to play (← → and
// 1–4, Trota's), a round started by a real space (the music's context made by that press), meat eaten (score, streak), a
// vegetable that hits (a life), one kicked out of the sky (WATAAA), five in a row (COMBO ×2), level 3 as ENTER THE DRAGON
// (twice his size, the dragon's track, a green eaten for points, back at level 4), the pause (frames and music stopped),
// the K.O. keeping that way's best, Again, M closing the sound and bringing it back, the K.O.'s Menu, HARDCORE's bag of
// five meats in fifty, esc closing it all (no frame, no context), the face drawn when ze.png is gone, ⌥⌘Z closing it.
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const meta = { server: true };

// a 1×1 picture, warm: what the test server's setup folder holds instead of anyone's face
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGO4OSvnPwAHDgLfOXSIZgAAAABJRU5ErkJggg==', 'base64');

export default async function (ctx) {
  const out = {}, face = join(ctx.server.dir, 'ze.png');
  writeFileSync(face, PNG);
  await ctx.waitFor(`window.peix.state().snapshots > 0`, { what: 'the board' });
  const press = async (code, key, vk) => {   // through the browser's input: a press the page may start sound on
    await ctx.send('Input.dispatchKeyEvent', { type: 'keyDown', code, key, windowsVirtualKeyCode: vk });
    await ctx.send('Input.dispatchKeyEvent', { type: 'keyUp', code, key, windowsVirtualKeyCode: vk });
  };
  const game = () => ctx.evaluate(`(() => { const z = window.peix.ze(), g = z.g; return JSON.stringify({ open: document.querySelector('#zeGame').open, raf: !!z.raf, frames: z.frames, face: !!z.face,
    music: z.music ? z.music.ac.state : null, track: z.music ? z.music.track : null, phase: g.phase, score: g.score, lives: g.lives, streak: g.streak, mult: g.mult, level: g.level,
    dragon: g.dragon, items: g.items.length, words: g.words.map(w => w.s), diff: window.peix.prefs().zeDiff }); })()`).then(JSON.parse);
  // drops what it is given into the round, nothing falling on its own meanwhile; at: [dx, dy] from Zé's feet
  const drop = (kind, e, at, more = {}) => ctx.evaluate(`(() => { const g = window.peix.ze().g; g.spawn = 1e9; g.hurt = 0;
    g.items.push({ kind: ${JSON.stringify(kind)}, e: ${JSON.stringify(e)}, pts: 15, say: ${JSON.stringify(kind === 'veg' ? 'BLEH! test' : 'test')}, x: g.x + g.f * ${at[0]}, y: g.y + ${at[1]}, vx: 0, vy: 0, g: 0, rot: 0, spin: 0, ...${JSON.stringify(more)} }); })()`);

  // ⌥⌘Z: the title, a frame loop, the face from ze.png, no sound yet
  await ctx.key('KeyZ');
  await ctx.waitFor(`document.querySelector('#zeGame').open && window.peix.ze().raf && window.peix.ze().face`, { what: 'the game, its face' });
  out.title = await game();
  ctx.assert.equal(out.title.phase, 'title'); ctx.assert.equal(out.title.music, null, 'no sound before a round');
  ctx.assert.equal(await ctx.evaluate(`document.activeElement === document.querySelector('#zeGame')`), true, 'the keys are the game\'s');
  // the ways to play: → is the next, 1–4 one of them, kept
  await press('ArrowRight', 'ArrowRight', 39);
  ctx.assert.equal((await game()).diff, 2, '→ from NORMAL: HARD');
  await press('Digit1', '1', 49);
  ctx.assert.equal((await game()).diff, 0, '1: EASY');
  await ctx.settle(); await ctx.shot('1-title');
  await press('Digit2', '2', 50);
  ctx.assert.equal((await game()).diff, 1, '2: NORMAL');

  // space: a round, and the band made by that press
  await press('Space', ' ', 32);
  await ctx.waitFor(`window.peix.ze().g.phase === 'play' && window.peix.ze().music?.ac.state === 'running' && window.peix.ze().music.track === 'funk'`, { what: 'the round and its music' });
  // meat on his head: eaten, counted
  await drop('meat', '🥩', [0, -140]);
  await ctx.waitFor(`window.peix.ze().g.score === 15`, { what: 'the meat eaten' });
  ctx.assert.equal((await game()).streak, 1);
  // a vegetable on him: a life, and BLEH
  await drop('veg', '🥦', [0, -100]);
  await ctx.waitFor(`window.peix.ze().g.lives === 2`, { what: 'the broccoli hitting' });
  out.hit = await game();
  ctx.assert.equal(out.hit.streak, 0); ctx.assert.ok(out.hit.words.some(w => /^BLEH!/.test(w)), 'BLEH said');
  // one in front of his foot: a kick sends it out of the sky
  await drop('veg', '🥕', [50, -70]);
  await ctx.sleep(100); ctx.assert.equal((await game()).lives, 2, 'not touching him');
  await press('Space', ' ', 32);
  await ctx.waitFor(`window.peix.ze().g.score === 20`, { what: 'the carrot kicked' });
  out.kick = await game();
  ctx.assert.ok(out.kick.words.includes('WATAAA!')); ctx.assert.equal(out.kick.lives, 2);
  // five in a row: COMBO ×2, the fifth counted twice — 4 × 15 + 30
  for (let i = 1; i <= 5; i++) { await drop('meat', '🍗', [0, -140]); await ctx.waitFor(`window.peix.ze().g.streak === ${i}`, { what: `meat ${i} in a row` }); }
  out.combo = await game();
  ctx.assert.equal(out.combo.mult, 2); ctx.assert.equal(out.combo.score, 20 + 60 + 30); ctx.assert.ok(out.combo.words.includes('COMBO ×2!'));
  // a picture of a round in play: things in the air, the HUD
  for (const [k, e, at] of [['meat', '🍗', [-200, -260]], ['veg', '🍔', [120, -300]], ['galo', '🐓', [260, -200]], ['meat', '🌭', [-60, -330]]]) await drop(k, e, at);
  await ctx.sleep(150); await ctx.shot('2-play');

  // level 3: ENTER THE DRAGON — twice his size, the dragon's track, a green is food; its time up, level 4
  await ctx.evaluate(`(() => { const g = window.peix.ze().g; g.items.length = 0; g.level = 2; g.next = g.score + 1; })()`);
  await drop('meat', '🥩', [0, -140]);
  await ctx.waitFor(`window.peix.ze().g.dragon > 0 && window.peix.ze().g.level === 3 && window.peix.ze().music.track === 'dragon'`, { what: 'the dragon' });
  await ctx.sleep(1400);   // grown
  const before = await game();
  await drop('veg', '🥦', [0, -280]);
  await ctx.waitFor(`window.peix.ze().g.score > ${before.score}`, { what: 'a green eaten as the dragon' });
  out.dragon = await game();
  ctx.assert.equal(out.dragon.lives, before.lives, 'a green costs no life'); ctx.assert.ok(out.dragon.words.some(w => /^\+10$/.test(w)), 'ten for it');
  ctx.assert.ok(await ctx.evaluate(`window.peix.ze().g.flames.length > 0`), 'on fire');
  await ctx.shot('3-dragon');
  await ctx.evaluate(`window.peix.ze().g.dragon = .05`);
  await ctx.waitFor(`!window.peix.ze().g.dragon && window.peix.ze().g.level === 4 && window.peix.ze().music.track === 'funk'`, { what: 'back to normal, level 4' });
  ctx.assert.equal(await ctx.evaluate(`window.peix.ze().g.banner?.s`), 'LEVEL 4!');

  // P: the frames and the music stop; P again goes on
  await press('KeyP', 'p', 80);
  await ctx.waitFor(`window.peix.ze().g.phase === 'pause' && !window.peix.ze().raf && window.peix.ze().music.ac.state === 'suspended'`, { what: 'the pause' });
  const f0 = (await game()).frames; await ctx.sleep(300);
  ctx.assert.equal((await game()).frames, f0, 'no frame drawn while paused');
  await press('KeyP', 'p', 80);
  await ctx.waitFor(`window.peix.ze().g.phase === 'play' && window.peix.ze().raf && window.peix.ze().music.ac.state === 'running'`, { what: 'the round again' });

  // the last life: K.O., NORMAL's best kept
  const ko = async () => {
    await ctx.evaluate(`(() => { const g = window.peix.ze().g; g.items.length = 0; g.lives = 1; })()`);
    await drop('veg', '🍆', [0, -100]);
    await ctx.waitFor(`window.peix.ze().g.phase === 'over'`, { what: 'the K.O.' });
  };
  await ko();
  out.ko = await game();
  ctx.assert.equal((await ctx.peix('prefs().zeBest')).normal, out.ko.score, 'the best is NORMAL\'s');
  await press('Space', ' ', 32);
  ctx.assert.equal((await game()).phase, 'over', 'a press at once is no new round');
  await ctx.sleep(900); await ctx.shot('4-ko');
  await press('Space', ' ', 32);   // Again
  await ctx.waitFor(`window.peix.ze().g.phase === 'play' && window.peix.ze().g.score === 0 && window.peix.ze().g.lives === 3`, { what: 'another round' });

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

  // ze.png gone: the drawn face; ⌥⌘Z again closes it
  rmSync(face);
  await ctx.key('KeyZ');
  await ctx.waitFor(`document.querySelector('#zeGame').open && window.peix.ze().g.phase === 'title'`, { what: 'the game again' });
  await ctx.waitFor(`!window.peix.ze().face`, { what: 'no face: the drawn one' });
  await press('Digit2', '2', 50); await press('Space', ' ', 32);
  await ctx.waitFor(`window.peix.ze().g.phase === 'play'`, { what: 'a round' });
  await ctx.evaluate(`window.peix.ze().g.spawn = 1e9`);
  await ctx.sleep(200); await ctx.shot('5-drawn-face');
  await ctx.key('KeyZ');
  await ctx.waitFor(`!document.querySelector('#zeGame').open && !window.peix.ze().music`, { what: '⌥⌘Z again closing it' });
  return out;
}
