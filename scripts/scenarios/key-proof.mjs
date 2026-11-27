// The page proves the server before its key goes out (2026-11-27, the external audit's lead 2): the server ends, a
// listener of someone else's takes the port — writing down every ask —, and the page sends it nothing keyed: its stream
// is not retried at it, no ask carries the key, and the lock says what answers holds no key. The board back on the
// port, the page proves it and is the board again.
export const meta = { server: true, fixture: 'auto' };

export default async ctx => {
  const { createServer } = await import('node:http');
  const out = {},
    port = ctx.server.port,
    key = ctx.server.key,
    seen = [];
  await ctx.waitFor(`peix.state().snapshots > 0`, 10_000);
  const snapshots = await ctx.evaluate(`peix.state().snapshots`);
  const proc = ctx.server.proc;
  proc.kill('SIGTERM');
  for (let i = 0; i < 50 && proc.exitCode === null; i++) await ctx.sleep(100);
  const note = req => seen.push({ url: req.url, key: req.headers['x-peix-key'] || '' });
  const squat = createServer((req, res) => {
    note(req);
    if (req.url.startsWith('/api/alive')) {
      res.writeHead(204, { 'x-peix-proof': '0'.repeat(64) }); // a proof, of nothing
      return res.end();
    }
    res.writeHead(503);
    res.end();
  });
  squat.on('upgrade', (req, socket) => {
    note(req);
    socket.destroy();
  });
  await new Promise((res, rej) => squat.once('error', rej).listen(port, '127.0.0.1', res));
  try {
    await ctx.waitFor(`document.querySelector('#lock').open`, 15_000);
    out.lock = await ctx.evaluate(`document.querySelector('#lockWhy').textContent`);
    ctx.assert.match(out.lock, /cannot show it holds this page's key/);
    await ctx.evaluate(`fetch('/api/sessions').catch(() => {}), true`); // a bare look of the page's own, for the count
    await ctx.sleep(4000); // the stream's retries, the page's polls
  } finally {
    squat.close();
    squat.closeAllConnections?.();
  }
  out.asked = [...new Set(seen.map(r => r.url.replace(/\?.*/, '')))].sort();
  ctx.assert.ok(
    seen.some(r => r.url.startsWith('/api/alive')),
    'the page asked what answers to prove itself',
  );
  const leaked = seen.filter(r => r.key || r.url.includes(key));
  ctx.assert.deepEqual(leaked, [], 'nothing it was sent carried the key');
  await ctx.server.restart(); // the board back on its port
  await ctx.waitFor(`peix.state().snapshots > ${snapshots} && !document.querySelector('#lock').open`, 20_000);
  out.back = await ctx.evaluate(
    `({ conn: !document.querySelector('#sbLeft .seg.conn').classList.contains('off'), cards: document.querySelectorAll('#slist > .card').length })`,
  );
  ctx.assert.deepEqual(out.back, { conn: true, cards: 2 }, 'proven, the board again');
  return out;
};
