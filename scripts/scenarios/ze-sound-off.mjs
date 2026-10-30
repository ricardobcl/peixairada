// No sound outlives Zé's game (2026-10-30): every AudioContext the page makes is counted from before it loads, and every
// node made on one. The board makes none, nor the game's title; a round makes one — and every way out closes it, whatever
// is playing: esc in a car (its engine humming), ⌥⌘Z as the dragon, the backdrop at the K.O.'s trombone (its timer to
// rest gone with it), esc while paused, M in a round (the round goes on, silent). After each, no node is made and no
// frame drawn. The window losing the keys mid-round suspends it. The OS's view is logged: coreaudiod's assertions.
import { execFileSync } from 'node:child_process';

export const meta = { server: true };

const COUNT = `window.__acs = []; window.__made = 0;
  const AC = window.AudioContext;
  window.AudioContext = class extends AC { constructor(...a) { super(...a); window.__acs.push(this); } };
  for (const k of ['createOscillator', 'createBufferSource', 'createGain', 'createBiquadFilter']) { const f = AC.prototype[k]; AC.prototype[k] = function (...a) { window.__made++; return f.apply(this, a); }; }`;

export default async function (ctx) {
  const out = {};
  await ctx.send('Page.addScriptToEvaluateOnNewDocument', { source: COUNT });
  await ctx.reload();
  await ctx.waitFor(`window.peix.state().snapshots > 0 && Array.isArray(window.__acs)`, { what: 'the board, counted' });
  const press = async (code, key, vk) => {
    await ctx.send('Input.dispatchKeyEvent', { type: 'keyDown', code, key, windowsVirtualKeyCode: vk });
    await ctx.send('Input.dispatchKeyEvent', { type: 'keyUp', code, key, windowsVirtualKeyCode: vk });
  };
  const audio = () => ctx.evaluate(`JSON.stringify({ contexts: window.__acs.map(a => a.state), made: window.__made, music: !!window.peix.ze().music, raf: !!window.peix.ze().raf, open: document.querySelector('#zeGame').open })`).then(JSON.parse);
  const os = () => { try { return execFileSync('pmset', ['-g', 'assertions'], { encoding: 'utf8' }).split('\n').filter(l => /audio/i.test(l)).map(l => l.trim()); } catch (e) { return [`pmset: ${e.message}`]; } };
  const drop = (kind, e, dy = -150) => ctx.evaluate(`(() => { const g = window.peix.ze().g; g.spawn = 1e9; g.hurt = 0;
    g.items.push({ kind: '${kind}', e: '${e}', pts: 15, say: 'test', x: g.x, y: g.y + ${dy}, vx: 0, vy: 0, g: 0, rot: 0, spin: 0 }); })()`);
  const round = async () => {   // ⌥⌘Z, a real space: a round, its band running
    await ctx.key('KeyZ');
    await ctx.waitFor(`document.querySelector('#zeGame').open && window.peix.ze().g.phase === 'title'`, { what: 'the title' });
    ctx.assert.equal((await audio()).music, false, 'the title makes no sound');
    await press('Space', ' ', 32);
    await ctx.waitFor(`window.peix.ze().music?.ac.state === 'running'`, { what: 'the band running' });
  };
  /** Closed: every context the page ever made is closed, and over a while after nothing is made and nothing drawn. */
  const silent = async (what, wait = 1500) => {
    await ctx.waitFor(`!document.querySelector('#zeGame').open && !window.peix.ze().music && window.__acs.every(a => a.state === 'closed')`, { what: `${what}: every context closed` });
    const a = await audio(), f = await ctx.evaluate(`window.peix.ze().frames`);
    await ctx.sleep(wait);
    const b = await audio();
    ctx.assert.equal(b.made, a.made, `${what}: no node made after it closed`);
    ctx.assert.equal(await ctx.evaluate(`window.peix.ze().frames`), f, `${what}: no frame drawn after it closed`);
    ctx.assert.ok(b.contexts.every(s => s === 'closed'), `${what}: ${b.contexts}`);
    return b;
  };

  // the board alone, and the game's title: nothing
  out.board = await audio();
  ctx.assert.deepEqual(out.board.contexts, [], 'the board makes no context of its own (the alerts\' sounds are off)');

  // esc in the Focus: the band and the engine
  await round();
  out.osPlaying = os();
  for (let i = 0; i < 3; i++) { await drop('meat', '🥩'); await ctx.sleep(120); }
  await ctx.waitFor(`window.peix.ze().music.engine && window.peix.ze().g.ride?.kind === 'focus'`, { what: 'the Focus, its engine' });
  await press('Escape', 'Escape', 27);
  out.esc = await silent('esc in the Focus');
  await ctx.sleep(1500); out.osAfter = os();

  // ⌥⌘Z as the dragon: its theme
  await round();
  await ctx.evaluate(`(() => { const g = window.peix.ze().g; g.level = 2; g.next = g.score + 1; })()`); await drop('meat', '🥩');
  await ctx.waitFor(`window.peix.ze().music.track === 'dragon'`, { what: 'the dragon\'s theme' });
  await ctx.key('KeyZ');
  out.dragon = await silent('⌥⌘Z as the dragon');

  // the backdrop at the K.O.: its trombone, and the timer that would have rested it — past that timer's time
  await round();
  await ctx.evaluate(`window.peix.ze().g.mass = 1`); await drop('veg', '🥦', -100);
  await ctx.waitFor(`window.peix.ze().g.phase === 'over'`, { what: 'the K.O.' });
  for (const type of ['mousePressed', 'mouseReleased']) await ctx.send('Input.dispatchMouseEvent', { type, x: 4, y: 4, button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1 });
  out.ko = await silent('the backdrop at the K.O.', 3200);

  // esc while paused
  await round();
  await press('KeyP', 'p', 80);
  await ctx.waitFor(`window.peix.ze().music.ac.state === 'suspended'`, { what: 'the pause, suspended' });
  await press('Escape', 'Escape', 27);
  out.paused = await silent('esc while paused');

  // M in a round: the context closed at once, the round going on without it
  await round();
  await press('KeyM', 'm', 77);
  await ctx.waitFor(`!window.peix.ze().music && window.__acs.every(a => a.state === 'closed')`, { what: 'M: every context closed' });
  const m0 = await audio(), f0 = await ctx.evaluate(`window.peix.ze().frames`);
  await drop('meat', '🥩'); await ctx.sleep(1000);
  ctx.assert.equal((await audio()).made, m0.made, 'M: the round goes on, silent');
  ctx.assert.ok(await ctx.evaluate(`window.peix.ze().frames`) > f0, 'M: the round goes on');
  await press('KeyM', 'm', 77);   // back on, for the next ones
  await ctx.waitFor(`window.peix.ze().music?.ac.state === 'running'`, { what: 'M again: the band back' });

  // the window losing the keys mid-round: paused, suspended — then esc
  await ctx.evaluate(`window.dispatchEvent(new Event('blur'))`);
  await ctx.waitFor(`window.peix.ze().g.phase === 'pause' && window.peix.ze().music.ac.state === 'suspended'`, { what: 'away: paused, suspended' });
  await press('Escape', 'Escape', 27);
  out.away = await silent('esc after going away');

  out.contexts = (await audio()).contexts.length;
  ctx.log(`contexts made ${out.contexts}, all closed · coreaudiod while playing: ${out.osPlaying.length ? out.osPlaying.join(' | ') : 'none'} · after: ${out.osAfter.length ? out.osAfter.join(' | ') : 'none'}`);
  return out;
}
