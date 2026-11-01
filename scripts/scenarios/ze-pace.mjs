// A round of Zé's game has an end (2026-11-01): his speed stops growing, a level costs more than the last, a green bites
// harder every five levels, a sky lasts three — and a bot with a person's limits (it looks four times a second, and does
// nothing on one look in six) ends its rounds on Normal in a few minutes. It played on for more than ten before. A bot is not a person: the
// bounds are wide, and they hold the shape, not the number.
export const meta = { server: true };
export default async function (ctx) {
  const { assert } = ctx;
  await ctx.waitFor(`window.peix.state().snapshots > 0`, { what: 'the board' });
  const rules = JSON.parse(await ctx.evaluate(`(() => {
    const z = window.peix.ze(), L = z.lab, g = L.round(); g.lunch = []; g.spawn = 1e9; z.g = g; z.keys = { l: 0, r: 1 }; z.aim = null; const speed = lv => { g.level = lv; g.x = 40; g.vx = 0; for (let i = 0; i < 60; i++) { L.zeStep(1 / 60); g.x = 40; g.spawn = 1e9; g.items.length = 0; } return Math.round(g.vx); };
    const out = { v1: speed(1), v5: speed(5), v11: speed(11), v40: speed(40) }; z.keys = { l: 0, r: 0 };
    const eat = lv => { g.level = lv; g.mass = 10; g.hurt = 0; g.items = [{ kind: 'veg', e: '🥦', say: 'x', x: g.x, y: g.y - 100, vx: 0, vy: 0, g: 0, rot: 0, spin: 0 }]; L.zeStep(1 / 60); return 10 - g.mass; };
    out.bite1 = eat(1); out.bite5 = eat(5); out.bite6 = eat(6); out.bite11 = eat(11);
    return JSON.stringify(out); })()`));
  assert.ok(rules.v5 > rules.v1, 'quicker with the levels at first'); assert.equal(rules.v40, rules.v11, `his speed capped: ${JSON.stringify(rules)}`);
  assert.deepEqual([rules.bite1, rules.bite5, rules.bite6, rules.bite11], [1, 1, 2, 3], 'a green bites harder every five levels');
  await ctx.evaluate(`(() => { window.__res = null; (async () => {
    const z = window.peix.ze(), L = z.lab, R = [];
    for (let i = 0; i < 8; i++) {
      const g = L.round(); g.rnd = Math.random; g.bagRnd = Math.random; g.lunch = []; z.g = g; z.keys = { l: 0, r: 0 };
      let t = 0, foc = 0, hold = 0, wait = 0, last = performance.now();
      while (g.phase === 'play' && t < 900) {
        if ((wait -= 1 / 60) <= 0) { wait = .25; hold = Math.random() < 1 / 6 ? 0 : L.zeBot(g); }
        z.keys.l = hold < 0 ? 1 : 0; z.keys.r = hold > 0 ? 1 : 0; L.zeStep(1 / 60); t += 1 / 60; if (g.ride?.kind === 'focus') foc += 1 / 60;
        if (performance.now() - last > 100) { await new Promise(r => setTimeout(r)); last = performance.now(); }
      }
      R.push({ t, level: g.level, foc, over: g.phase === 'over' });
    }
    window.__res = JSON.stringify(R);
  })().catch(e => { window.__res = JSON.stringify({ error: e.stack }); }); })()`);
  await ctx.waitFor(`window.__res`, { timeout: 100000, every: 500, what: 'the rounds' });
  const R = JSON.parse(await ctx.evaluate(`window.__res`)); assert.ok(!R.error, R.error);
  const t = R.map(r => r.t).sort((a, b) => a - b), med = t[t.length >> 1], foc = R.reduce((s, r) => s + r.foc, 0) / R.reduce((s, r) => s + r.t, 0);
  ctx.log('median round', Math.round(med), 's, levels', R.map(r => r.level).join(' '), 'Focus', (foc * 100).toFixed(0) + ' %');
  assert.ok(R.every(r => r.over), 'every round ends'); assert.ok(med > 120 && med < 480, `rounds of a few minutes: ${Math.round(med)} s`); assert.ok(foc < .15, `the Focus an event: ${foc}`);
  return { med: Math.round(med), levels: R.map(r => r.level), rules };
}
