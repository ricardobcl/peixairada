// ⌥⌘Z, Zé's game (2026-10-30): the title with the face from beside the setup file, a round started by a real space
// (the music's context made by that press), meat eaten (score, combo), a vegetable that hits (a life), one kicked out of
// the sky (WATAAA), the pause (frames and music stopped), the K.O. keeping the best, M closing the sound and bringing it
// back, esc closing it all (no frame, no context), ⌥⌘Z again closing it, and the face drawn when ze.png is gone.
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
  const game = () => ctx.evaluate(`(() => { const z = window.peix.ze(), g = z.g; return JSON.stringify({ open: document.querySelector('#zeGame').open, raf: !!z.raf, frames: z.frames, face: !!z.face, music: z.music ? z.music.ac.state : null,
    phase: g.phase, score: g.score, lives: g.lives, combo: g.combo, items: g.items.length, out: g.items.filter(i => i.out).length, words: g.words.map(w => w.s) }); })()`).then(JSON.parse);
  // drops what it is given into the round, nothing falling on its own meanwhile; at: [dx, dy] from Zé's feet
  const drop = (kind, e, at, more = {}) => ctx.evaluate(`(() => { const g = window.peix.ze().g; g.spawn = 1e9; g.hurt = 0;
    g.items.push({ kind: ${JSON.stringify(kind)}, e: ${JSON.stringify(e)}, pts: 15, name: 'test', x: g.x + g.f * ${at[0]}, y: g.y + ${at[1]}, vx: 0, vy: 0, g: 0, rot: 0, spin: 0, ...${JSON.stringify(more)} }); })()`);

  // ⌥⌘Z: the title, a frame loop, the face from ze.png, no sound yet
  await ctx.key('KeyZ');
  await ctx.waitFor(`document.querySelector('#zeGame').open && window.peix.ze().raf && window.peix.ze().face`, { what: 'the game, its face' });
  out.title = await game();
  ctx.assert.equal(out.title.phase, 'title'); ctx.assert.equal(out.title.music, null, 'no sound before a round');
  ctx.assert.equal(await ctx.evaluate(`document.activeElement === document.querySelector('#zeGame')`), true, 'the keys are the game\'s');
  await ctx.settle(); await ctx.shot('1-title');

  // space: a round, and the band made by that press
  await press('Space', ' ', 32);
  await ctx.waitFor(`window.peix.ze().g.phase === 'play' && window.peix.ze().music?.ac.state === 'running'`, { what: 'the round and its music' });
  // meat on his head: eaten, counted
  await drop('meat', '🥩', [0, -140]);
  await ctx.waitFor(`window.peix.ze().g.score === 15`, { what: 'the meat eaten' });
  ctx.assert.equal((await game()).combo, 1);
  // a vegetable on him: a life, and BLEH
  await drop('veg', '🥦', [0, -100]);
  await ctx.waitFor(`window.peix.ze().g.lives === 2`, { what: 'the broccoli hitting' });
  out.hit = await game();
  ctx.assert.equal(out.hit.combo, 0); ctx.assert.ok(out.hit.words.some(w => /^BLEH!/.test(w)), 'BLEH said');
  // one in front of his foot: a kick sends it out of the sky
  await drop('veg', '🥕', [50, -70]);
  await ctx.sleep(100); ctx.assert.equal((await game()).lives, 2, 'not touching him');
  await press('Space', ' ', 32);
  await ctx.waitFor(`window.peix.ze().g.score === 20`, { what: 'the carrot kicked' });
  out.kick = await game();
  ctx.assert.ok(out.kick.words.includes('WATAAA!')); ctx.assert.equal(out.kick.lives, 2);
  // a picture of a round in play: things in the air, the HUD
  for (const [k, e, at] of [['meat', '🍗', [-200, -260]], ['veg', '🌽', [120, -300]], ['galo', '🐓', [260, -200]], ['meat', '🌭', [-60, -330]]]) await drop(k, e, at);
  await ctx.sleep(150); await ctx.shot('2-play');

  // P: the frames and the music stop; P again goes on
  await press('KeyP', 'p', 80);
  await ctx.waitFor(`window.peix.ze().g.phase === 'pause' && !window.peix.ze().raf && window.peix.ze().music.ac.state === 'suspended'`, { what: 'the pause' });
  const f0 = (await game()).frames; await ctx.sleep(300);
  ctx.assert.equal((await game()).frames, f0, 'no frame drawn while paused');
  await ctx.shot('3-pause');
  await press('KeyP', 'p', 80);
  await ctx.waitFor(`window.peix.ze().g.phase === 'play' && window.peix.ze().raf && window.peix.ze().music.ac.state === 'running'`, { what: 'the round again' });

  // the last life: K.O., the best kept
  await ctx.evaluate(`(() => { const g = window.peix.ze().g; g.items.length = 0; g.lives = 1; })()`);
  await drop('veg', '🍆', [0, -100]);
  await ctx.waitFor(`window.peix.ze().g.phase === 'over'`, { what: 'the K.O.' });
  out.ko = await game();
  ctx.assert.equal(await ctx.peix('prefs().zeBest'), out.ko.score, 'the best is the round\'s');
  await ctx.sleep(400); await ctx.shot('4-ko');
  // space: another round from nothing
  await press('Space', ' ', 32);
  await ctx.waitFor(`window.peix.ze().g.phase === 'play' && window.peix.ze().g.score === 0 && window.peix.ze().g.lives === 3`, { what: 'another round' });

  // M: the sound closed, and back
  await press('KeyM', 'm', 77);
  await ctx.waitFor(`!window.peix.ze().music && window.peix.prefs().zeSound === false`, { what: 'the sound off' });
  ctx.assert.equal(await ctx.evaluate(`document.querySelector('#zeSnd').textContent`), 'sound off');
  await press('KeyM', 'm', 77);
  await ctx.waitFor(`window.peix.ze().music?.ac.state === 'running' && window.peix.prefs().zeSound === true`, { what: 'the sound on again' });

  // esc: closed, nothing left running
  await press('Escape', 'Escape', 27);
  await ctx.waitFor(`!document.querySelector('#zeGame').open && !window.peix.ze().raf`, { what: 'esc closing it' });   // the close event: a task after the close
  out.closed = await game();
  ctx.assert.equal(out.closed.raf, false); ctx.assert.equal(out.closed.music, null, 'the context closed with it');
  await ctx.sleep(300); ctx.assert.equal((await game()).frames, out.closed.frames, 'no frame after it closed');

  // ze.png gone: the drawn face; ⌥⌘Z again closes it
  rmSync(face);
  await ctx.key('KeyZ');
  await ctx.waitFor(`document.querySelector('#zeGame').open && window.peix.ze().g.phase === 'title'`, { what: 'the game again' });
  await ctx.waitFor(`!window.peix.ze().face`, { what: 'no face: the drawn one' });
  await press('Space', ' ', 32);
  await ctx.waitFor(`window.peix.ze().g.phase === 'play'`, { what: 'a round' });
  await ctx.evaluate(`window.peix.ze().g.spawn = 1e9`);
  await ctx.sleep(200); await ctx.shot('5-drawn-face');
  await ctx.key('KeyZ');
  await ctx.waitFor(`!document.querySelector('#zeGame').open && !window.peix.ze().music`, { what: '⌥⌘Z again closing it' });
  return out;
}
