// ⌥⌘Z in WebKit, the app's engine (2026-11-01): what Chrome does not show. The stage again at every opening — WebKit tells of
// the close's own lost context late — and nothing kept after a close: a lost context there holds its textures until a
// collection. Real frames need a screen: under a lock it says so and passes.
import { spawnSync } from 'node:child_process';

export const meta = { server: true };

export default async function (ctx) {
  const { assert } = ctx;
  const body = `
    const mb = async () => Math.round((await footprint()).now), z = window.peix.ze(), st = z.stage, out = { closed: [], opened: [], muted: await muted() };
    await sleep(1500); out.board = await mb();
    for (let i = 0; i < 3; i++) {
      peixKey('KeyZ'); await until(() => st.frames > 3, 6000, 'the stage at opening ' + (i + 1));
      await sleep(2000); out.opened.push({ gl: !!st.gl, off: st.off, baked: st.baked, err: st.gl?.getError(), mb: await mb() });
      z.lab.demo(); await sleep(1500);
      out.err = st.gl?.getError();
      document.querySelector('#zeGame').close(); await sleep(3500); out.closed.push(await mb());
      if (st.gl || st.off || document.querySelector('#zeGL')) throw new Error('the stage is still here, or off');
    }
    return JSON.stringify(out);`;
  const r = spawnSync('node', ['scripts/webkit.mjs', body], { encoding: 'utf8', timeout: 60000, env: { ...process.env, URL: ctx.server.url, KEY: ctx.server.key, SIZE: '1500x1100', PREFS: JSON.stringify({ toured: true, zeSound: false }), TIMEOUT: '55' } });
  if (/the page is hidden/.test(r.stderr + r.stdout)) { ctx.log('the screen is locked: WebKit runs no frames, nothing checked'); return { skipped: 'the screen is locked' }; }
  const line = r.stdout.split('\n').find(l => l.startsWith('"{'));
  assert.ok(line, `an answer from WebKit: ${(r.stderr + r.stdout).slice(-600)}`);
  const out = JSON.parse(JSON.parse(line));
  assert.equal(out.muted, true, 'the harness makes no sound');
  for (const [i, o] of out.opened.entries()) {
    assert.ok(o.gl && !o.off, `the stage at opening ${i + 1}: ${JSON.stringify(o)}`);
    assert.ok(o.baked, `every sky baked ahead at opening ${i + 1}`);
    assert.equal(o.err, 0, `no GL error at opening ${i + 1}`);
  }
  assert.equal(out.err, 0, 'no GL error in a round');
  assert.ok(out.closed[2] < out.board + 150, `closed, the board's memory again: ${JSON.stringify(out)}`);
  return out;
}
