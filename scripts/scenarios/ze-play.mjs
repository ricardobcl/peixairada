// Zé's game, the next round (2026-10-30, the ideas sheet's picks): what plays. The title — a demo round behind it (no
// sound, no trophy), its rules on cards a click turns, MOSSAD typed (sunglasses, the walkie-talkie; the title's own keys
// left as they were), G for player two. In a round: his body in pixels, squash and a bone from a bite, MONSTRO at full
// bulk, the music hearing the cars (the Focus a tone up, the A-Class behind glass) and leaving afterimages and smoke, a
// sky for level 2, fish (+5, nothing else), the board's fish let go, the galo's miracle, the three power-ups, the
// nunchaku's sweep, the awning and the sign stood on (and a trophy), the double jump, a dash through a green, the
// trackpad's bump on a kick, the Avó da Horta beaten, the dossier on pause, the K.O.'s Bruce Lee and today's best, the
// day's round the same twice, and the galo as player two — run by A D, stealing his meat in VERSUS.
export const meta = { server: true };

export default async function (ctx) {
  const out = {};
  await ctx.waitFor(`window.peix.state().snapshots > 0`, { what: 'the board' });
  const press = async (code, key, vk) => {
    await ctx.send('Input.dispatchKeyEvent', { type: 'keyDown', code, key, windowsVirtualKeyCode: vk });
    await ctx.send('Input.dispatchKeyEvent', { type: 'keyUp', code, key, windowsVirtualKeyCode: vk });
  };
  const down = (code, key, vk) => ctx.send('Input.dispatchKeyEvent', { type: 'keyDown', code, key, windowsVirtualKeyCode: vk });
  const up = (code, key, vk) => ctx.send('Input.dispatchKeyEvent', { type: 'keyUp', code, key, windowsVirtualKeyCode: vk });
  const g = body => ctx.evaluate(`(() => { const g = window.peix.ze().g; ${body} })()`);
  const push = (it, at = null) => g(`g.items.push({ vx: 0, vy: 0, g: 0, rot: 0, spin: 0, pts: 15, say: 'test', ...${JSON.stringify(it)}${at ? `, x: g.x + g.f * ${at[0]}, y: g.y + ${at[1]}` : ''} })`);
  const eat = async (it, n = 1) => {   // onto his head, one by one, each met before the next
    for (let i = 0; i < n; i++) {
      const before = await g(`return g.items.length`);
      await g(`g.hurt = 0`); await push(it, [0, -150]);
      await ctx.waitFor(`window.peix.ze().g.items.length <= ${before}`, { what: `${it.kind} ${i + 1} met` });
    }
  };
  const trophies = () => ctx.evaluate(`Object.keys(window.peix.prefs().zeTrophies?.won || {}).sort()`);
  const canvas = () => ctx.evaluate(`(r => ({ x: r.x, y: r.y, width: r.width, height: r.height }))(document.querySelector('#zeCanvas').getBoundingClientRect())`);

  // ---- the title: the demo plays behind it, silent; a click on the rules turns them; MOSSAD; G
  await ctx.key('KeyZ');
  await ctx.waitFor(`document.querySelector('#zeGame').open && window.peix.ze().frames > 2`, { what: 'the game' });
  await ctx.sleep(2500);
  out.demo = await g(`return { demo: g.demo, phase: g.phase, items: g.items.length, x: Math.round(g.x) }`);
  ctx.assert.equal(out.demo.demo, true, 'the title runs a demo round'); ctx.assert.equal(out.demo.phase, 'title');
  ctx.assert.ok(out.demo.items > 0, 'food falls behind the title');
  ctx.assert.equal(await ctx.evaluate(`window.peix.ze().music`), null, 'the demo makes no sound');
  ctx.assert.deepEqual(await trophies(), [], 'nor wins a trophy');
  const card = await g(`return g.card`), box = await canvas();
  for (const type of ['mousePressed', 'mouseReleased']) await ctx.send('Input.dispatchMouseEvent', { type, x: box.x + box.width / 2, y: box.y + box.height * 300 / 900, button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1 });
  ctx.assert.equal(await g(`return g.card`), card + 1, 'a click on the rules turns them');
  ctx.assert.equal(await g(`return g.phase`), 'title', '…and starts nothing');
  const before = await ctx.evaluate(`({ diff: window.peix.prefs().zeDiff, sound: window.peix.prefs().zeSound })`);
  for (const [code, key, vk] of [['KeyM', 'm', 77], ['KeyO', 'o', 79], ['KeyS', 's', 83], ['KeyS', 's', 83], ['KeyA', 'a', 65], ['KeyD', 'd', 68]]) await press(code, key, vk);
  ctx.assert.equal(await ctx.evaluate(`window.peix.ze().mossad`), true, 'MOSSAD typed');
  ctx.assert.deepEqual(await ctx.evaluate(`({ diff: window.peix.prefs().zeDiff, sound: window.peix.prefs().zeSound })`), before, 'the title\'s own keys as they were');
  await ctx.sleep(300); await ctx.shot('1-title', await canvas());
  for (const want of ['coop', 'versus', null]) { await press('KeyG', 'g', 71); ctx.assert.equal(await ctx.evaluate(`window.peix.prefs().zeTwo`), want, `G: ${want}`); }

  // ---- a round: his body in pixels, sunglasses on; the walkie-talkie
  await press('Space', ' ', 32);
  await ctx.waitFor(`window.peix.ze().g.phase === 'play' && window.peix.ze().music?.ac.state === 'running'`, { what: 'a round' });
  await g(`g.spawn = 1e9; g.items.length = 0;`);
  await ctx.sleep(200);
  ctx.assert.ok(await ctx.evaluate(`[...window.peix.ze().sprites.keys()].some(k => /^6\\|stand\\|.*\\|1$/.test(k))`), 'him in pixels, at his bulk, his sunglasses on');
  await ctx.waitFor(`window.peix.ze().music.hp.frequency.value > 300 && !!window.peix.ze().music.crush.curve`, { what: 'the band through a walkie-talkie' });
  for (const [code, key, vk] of [['KeyM', 'm', 77], ['KeyO', 'o', 79], ['KeyS', 's', 83], ['KeyS', 's', 83], ['KeyA', 'a', 65], ['KeyD', 'd', 68]]) await press(code, key, vk);
  ctx.assert.equal(await ctx.evaluate(`window.peix.ze().mossad`), true, 'MOSSAD is the title\'s word alone');
  await press('KeyM', 'm', 77);   // its M, in a round, was the sound's: back on
  await ctx.waitFor(`window.peix.ze().music?.ac.state === 'running'`, { what: 'the sound on again' });
  await ctx.evaluate(`window.peix.ze().mossad = false`);
  await g(`g.mass = 6; g.items.length = 0;`);

  // ---- a bite: squashed as he chews, a bone among the bits; MONSTRO at his full bulk
  await eat({ kind: 'meat', e: '🥩' });
  out.bite = await g(`return { sq: g.sq?.k, bone: g.bits.some(b => b.bone) }`);
  ctx.assert.deepEqual(out.bite, { sq: 'chew', bone: true }, 'a bite: squashed, a bone flying');
  await g(`g.mass = 11`); await eat({ kind: 'meat', e: '🥩' });
  out.monstro = await g(`return { mass: g.mass, flex: g.flex > 0, banner: g.banner?.s }`);
  ctx.assert.deepEqual(out.monstro, { mass: 12, flex: true, banner: 'MONSTRO!' });
  ctx.assert.ok((await trophies()).includes('monstro'), 'a trophy for it');
  await ctx.sleep(1500);

  // ---- the cars: the Focus a tone up and quicker, afterimages; the A-Class behind glass, black smoke
  await g(`g.mass = 6; g.streak = 3;`); await eat({ kind: 'meat', e: '🍗' }, 3);
  await ctx.waitFor(`window.peix.ze().g.ride?.kind === 'focus'`, { what: 'the Focus' });
  ctx.assert.equal(await ctx.evaluate(`window.peix.ze().music.mode`), 'focus', 'the band hears the Focus');
  await down('ArrowRight', 'ArrowRight', 39); await ctx.sleep(500);
  ctx.assert.ok(await g(`return g.trail.length > 1`), 'afterimages at speed');
  await up('ArrowRight', 'ArrowRight', 39);
  await g(`g.ride.t = .05`); await ctx.waitFor(`!window.peix.ze().g.ride && window.peix.ze().music.mode === 'walk'`, { what: 'the Focus gone, the band as it was' });
  await eat({ kind: 'veg', e: '🥬' }, 3);
  await ctx.waitFor(`window.peix.ze().g.ride?.kind === 'aclass'`, { what: 'the A-Class' });
  await ctx.sleep(600);
  out.aclass = await ctx.evaluate(`({ mode: window.peix.ze().music.mode, lp: Math.round(window.peix.ze().music.lp.frequency.value), smoke: window.peix.ze().g.smoke.length })`);
  ctx.assert.equal(out.aclass.mode, 'aclass'); ctx.assert.ok(out.aclass.lp < 1500, `behind glass: ${out.aclass.lp} Hz`); ctx.assert.ok(out.aclass.smoke > 0, 'black smoke');
  await g(`g.ride.t = .05`); await ctx.waitFor(`!window.peix.ze().g.ride`, { what: 'the A-Class gone' });

  // ---- the next sky
  await g(`g.level = 4`);
  await ctx.waitFor(`window.peix.ze().scene?.i === 1`, { what: 'the blue hour' });
  await ctx.sleep(1500); await ctx.shot('2-blue-hour', await canvas());
  await g(`g.level = 1; g.next = 1e9; g.items.length = 0; g.mass = 6; g.hurt = 0; g.streak = 0;`);   // no level comes by itself from here: no dragon

  // ---- fish: five, nothing else; the board's fish, let go
  let s0 = await g(`g.streak = 2; return g.score`);
  await eat({ kind: 'fish', e: '🐟', say: 'sardinha', pts: 5 });
  ctx.assert.deepEqual(await g(`return [g.score, g.mass, g.streak]`), [s0 + 5, 6, 2], 'a fish: five, no bulk, the streak kept');
  s0 = await g(`return g.score`);
  await push({ kind: 'peixe', e: '', pts: 100 }, [0, -150]);
  await ctx.waitFor(`window.peix.ze().g.items.some(i => i.kind === 'peixe' && i.out)`, { what: 'the board\'s fish let go' });
  ctx.assert.equal(await g(`return g.score`), s0 + 100);
  ctx.assert.ok((await trophies()).includes('peixe'));

  // ---- the miracle: a chicken stands up, crows, is the golden galo
  await g(`g.items.length = 0; g.x = 150; g.vx = 0;`);
  await push({ kind: 'meat', e: '🍗', pts: 10, say: 'frango', miracle: 300 }); await g(`Object.assign(g.items[0], { x: 600, y: 200, vy: 300 })`);
  await ctx.waitFor(`window.peix.ze().g.items[0]?.stood > 0`, { what: 'the chicken standing up' });
  await ctx.waitFor(`window.peix.ze().g.items[0]?.kind === 'gold'`, { what: 'the golden galo' });
  s0 = await g(`return g.score`);
  await g(`Object.assign(g.items[0], { x: g.x, y: g.y - 150 })`);
  await ctx.waitFor(`window.peix.ze().g.banner?.s === 'O MILAGRE DO GALO!'`, { what: 'the miracle eaten' });
  ctx.assert.equal(await g(`return g.score - ${s0}`), 100);

  // ---- the power-ups
  await g(`g.mass = 4; g.items.length = 0;`);
  await eat({ kind: 'power', p: 'francesinha', e: '', pts: 25 });
  ctx.assert.deepEqual(await g(`return [g.power?.kind, g.mass, g.gape]`), ['francesinha', 12, true], 'the francesinha: full bulk, a wide mouth');
  await g(`g.power = null`); await eat({ kind: 'power', p: 'bifana', e: '', pts: 25 });
  await push({ kind: 'meat', e: '🥩', say: 'posta' }); await g(`Object.assign(g.items.at(-1), { x: g.x + 220, y: g.y - 300, vy: 40, g: 40 })`);
  await ctx.waitFor(`window.peix.ze().g.items.at(-1)?.vx < -50`, { timeout: 3000, what: 'the bifana: meat curving to him' });   // by frames, not the clock
  await g(`g.power = null; g.items.length = 0;`); await eat({ kind: 'power', p: 'vinho', e: '', pts: 25 });
  ctx.assert.equal(await g(`return g.power?.kind`), 'vinho');
  await g(`g.power = null; g.mass = 6;`);

  // ---- a kick that lands: the trackpad's bump; the nunchaku's sweep
  const m0 = await ctx.evaluate(`window.peix.motion().length`);
  await push({ kind: 'veg', e: '🥕', say: 'BLEH!' }, [50, -70]); await g(`g.cool = 0`); await press('Space', ' ', 32);
  await ctx.waitFor(`window.peix.ze().g.items.every(i => i.out)`, { what: 'the carrot kicked' });
  ctx.assert.ok((await ctx.evaluate(`window.peix.motion().slice(${m0}).map(m => m.kind)`)).includes('haptic:alignment'), 'a bump on the kick');
  await g(`g.items.length = 0; g.nun = 8; for (const [x, y] of [[120, 300], [520, 420], [620, 200]]) g.items.push({ kind: 'veg', e: '🥦', say: 'BLEH!', x, y, vx: 0, vy: 0, g: 0, rot: 0, spin: 0 })`);
  await g(`g.cool = 0`); await down('Space', ' ', 32); await ctx.sleep(450); await up('Space', ' ', 32);
  ctx.assert.deepEqual(await g(`return [g.items.filter(i => i.out).length, g.nun, g.banner?.s]`), [3, 0, 'NUNCHAKU!'], 'every green swept');
  await g(`g.items.length = 0`);

  // ---- controls that forgive: a jump just before he lands fires as he lands, a jump just off the awning still works, a kick in its cooldown comes when it is over
  await g(`g.items.length = 0; g.spawn = 1e9; g.x = 300; g.vx = 0; g.y = 842 - 40; g.vy = 500; g.gy = 842; g.coyote = 0; g.jumps = 1;`);
  await press('ArrowUp', 'ArrowUp', 38); await ctx.waitFor(`window.peix.ze().g.vy < -300`, { timeout: 3000, what: 'the jump pressed in the air, fired on landing' });
  await ctx.waitFor(`window.peix.ze().g.y === 842`, { what: 'down again' });
  await g(`g.kick = 0; g.cool = .05;`); await press('Space', ' ', 32); await ctx.waitFor(`window.peix.ze().g.kick > 0`, { timeout: 3000, what: 'the kick pressed in its cooldown' });
  await ctx.waitFor(`window.peix.ze().g.cool === 0`, { what: 'the kick over' });
  ctx.assert.equal(await g(`g.y = 700; g.vy = 40; g.gy = 842; g.coyote = .1; g.jumps = 0; window.__j = 0; return g.coyote > 0`), true);
  await press('ArrowUp', 'ArrowUp', 38); await ctx.waitFor(`window.peix.ze().g.vy < -300`, { timeout: 3000, what: 'the jump just off an edge' });
  await ctx.waitFor(`window.peix.ze().g.y === 842`, { what: 'down again' });

  // ---- the height: the awning, the sign (a trophy), down again; the double jump; a dash through a green
  await g(`g.x = 560; g.vx = 0; g.mass = 6;`);
  await press('ArrowUp', 'ArrowUp', 38); await ctx.waitFor(`window.peix.ze().g.y === 728 && window.peix.ze().g.vy === 0`, { what: 'on the awning' });
  await press('ArrowUp', 'ArrowUp', 38); await ctx.waitFor(`window.peix.ze().g.y === 645 && window.peix.ze().g.vy === 0`, { what: 'on the sign' });
  ctx.assert.ok((await trophies()).includes('telhado'));
  await press('ArrowDown', 'ArrowDown', 40); await ctx.waitFor(`window.peix.ze().g.y === 728`, { what: 'dropped to the awning' });
  await press('ArrowDown', 'ArrowDown', 40); await ctx.waitFor(`window.peix.ze().g.y === 842`, { what: 'dropped to the floor' });
  await g(`g.mass = 12; g.x = 200;`); await press('ArrowUp', 'ArrowUp', 38); await ctx.sleep(200); await press('ArrowUp', 'ArrowUp', 38);
  ctx.assert.equal(await g(`return g.jumps`), 2, 'full bulk: a second jump in the air');
  await ctx.waitFor(`window.peix.ze().g.y === 842`, { what: 'landed' });
  await g(`g.mass = 6; g.x = 150; g.items.length = 0; g.items.push({ kind: 'veg', e: '🥦', say: 'BLEH!', x: 330, y: 760, vx: 0, vy: 0, g: 0, rot: 0, spin: 0 })`);
  await press('ArrowRight', 'ArrowRight', 39); await down('ArrowRight', 'ArrowRight', 39); await ctx.sleep(400); await up('ArrowRight', 'ArrowRight', 39);
  ctx.assert.deepEqual(await g(`return [g.x > 400, g.mass]`), [true, 6], 'the dash: past the green, unharmed');
  await g(`g.items.length = 0`);

  // ---- the Avó da Horta at level 5: three of her couves kicked back
  await g(`g.level = 4; g.next = g.score + 1; g.x = 300; g.f = 1;`); await eat({ kind: 'meat', e: '🥩' });
  await ctx.waitFor(`window.peix.ze().g.avo?.rise === 1`, { what: 'the avó at her window' });
  await ctx.shot('3-avo', await canvas());
  s0 = await g(`return g.score`);
  for (let i = 0; i < 3; i++) {
    await g(`g.items = g.items.filter(it => it.out); g.avo.next = 99; g.hurt = 0; g.cool = 0; g.items.push({ kind: 'veg', e: '🥬', say: 'COME A SOPA!', from: 'avo', x: g.x + g.f * 50, y: g.y - 70, vx: 0, vy: 0, g: 0, rot: 0, spin: 0 })`);
    await press('Space', ' ', 32);
    await ctx.waitFor(`window.peix.ze().g.avo?.hp === ${2 - i} || ${i === 2} && window.peix.ze().g.avo?.won`, { what: `her couve ${i + 1} back at her` });
  }
  ctx.assert.equal(await g(`return g.banner?.s`), 'A AVÓ DESISTE!');
  ctx.assert.ok(await g(`return g.score - ${s0} >= 300`), 'three hundred for it');
  ctx.assert.equal(await g(`return g.ride`), null, 'no car came while she was out');
  ctx.assert.ok((await trophies()).includes('avo'));
  await ctx.waitFor(`!window.peix.ze().g.avo`, { what: 'the avó gone in' });

  // ---- the agent's pause: his file
  await g(`g.items.length = 0; g.level = 2; g.next = 1e9;`); await eat({ kind: 'case', e: '💼', pts: 100 });
  await press('KeyP', 'p', 80);
  await ctx.waitFor(`window.peix.ze().g.phase === 'pause' && window.peix.ze().g.agent`, { what: 'the dossier' });
  await ctx.shot('4-dossier', await canvas());
  await press('KeyP', 'p', 80); await ctx.waitFor(`window.peix.ze().g.phase === 'play'`, { what: 'on again' });

  // ---- the K.O.: Bruce Lee, today's best beside the best ever
  await g(`g.items.length = 0; g.mass = 1;`); await push({ kind: 'veg', e: '🍆', say: 'BLEH!' }, [0, -100]);
  await ctx.waitFor(`window.peix.ze().g.phase === 'over'`, { what: 'the K.O.' });
  out.ko = await g(`return { quote: g.quote, score: g.score }`);
  ctx.assert.ok(out.ko.quote, 'a line of Bruce Lee\'s');
  out.day = await ctx.evaluate(`window.peix.prefs().zeDay`);
  ctx.assert.equal(out.day.best.normal, out.ko.score, 'today\'s best kept');
  await ctx.waitFor(`window.peix.ze().g.overT > .8`, { what: 'the K.O.\'s buttons' }); await ctx.shot('5-ko', await canvas());

  // ---- the day's round: the same numbers again
  await press('Space', ' ', 32); await ctx.waitFor(`window.peix.ze().g.phase === 'play' && window.peix.ze().g.score === 0`, { what: 'another round' });
  const a = await g(`return [g.rnd(), g.rnd()]`);
  await g(`g.mass = 1; g.items.length = 0; g.spawn = 1e9;`); await push({ kind: 'veg', e: '🍆', say: 'BLEH!' }, [0, -100]);
  await ctx.waitFor(`window.peix.ze().g.phase === 'over'`, { what: 'the K.O. again' }); await ctx.waitFor(`window.peix.ze().g.overT > .8`, { what: 'the K.O.\'s buttons' });
  await press('Space', ' ', 32); await ctx.waitFor(`window.peix.ze().g.phase === 'play' && window.peix.ze().g.score === 0`, { what: 'a third round' });
  ctx.assert.deepEqual(await g(`return [g.rnd(), g.rnd()]`), a, 'the same falls, round after round, today');

  // ---- player two: the galo on A D, Zé on the arrows; VERSUS, his meat stolen
  await g(`g.mass = 1; g.items.length = 0; g.spawn = 1e9;`); await push({ kind: 'veg', e: '🍆', say: 'BLEH!' }, [0, -100]);
  await ctx.waitFor(`window.peix.ze().g.phase === 'over'`, { what: 'the K.O., for the menu' }); await ctx.waitFor(`window.peix.ze().g.overT > .8`, { what: 'the K.O.\'s buttons' });
  await press('ArrowRight', 'ArrowRight', 39); await press('Space', ' ', 32);
  await ctx.waitFor(`window.peix.ze().g.phase === 'title'`, { what: 'the title' });
  await press('KeyG', 'g', 71); await press('KeyG', 'g', 71);
  await press('Space', ' ', 32); await ctx.waitFor(`window.peix.ze().g.phase === 'play' && window.peix.ze().g.galo?.mode === 'versus'`, { what: 'a round with the galo' });
  await g(`g.spawn = 1e9; g.items.length = 0;`);
  const x0 = await g(`return [g.x, g.galo.x]`);
  await down('KeyD', 'd', 68); await ctx.sleep(300); await up('KeyD', 'd', 68);
  const x1 = await g(`return [g.x, g.galo.x]`);
  ctx.assert.equal(x1[0], x0[0], 'D is the galo\'s, not his'); ctx.assert.ok(x1[1] > x0[1] + 40, 'the galo ran right');
  await g(`g.items.push({ kind: 'meat', e: '🥩', pts: 15, say: 'posta', x: g.galo.x + 20, y: 812, vx: 0, vy: 0, g: 0, rot: 0, spin: 0 })`);
  await ctx.waitFor(`window.peix.ze().g.galo.score === 15`, { what: 'his meat stolen' });
  ctx.assert.ok(await g(`return g.words.some(w => w.s === 'ROUBADO!')`));
  await ctx.shot('6-galo', await canvas());
  await ctx.evaluate(`window.peix.prefs().zeTwo = null`);

  out.trophies = await trophies();
  await press('Escape', 'Escape', 27);
  await ctx.waitFor(`!document.querySelector('#zeGame').open && !window.peix.ze().music`, { what: 'closed, its sound with it' });
  return out;
}
