// The app trusts the port only once it is proved (2026-11-06, `ServerController.probe`): what answers there without the
// HMAC of the app's nonce under the key is not adopted, is never sent the key, and its page never loads in the board's
// view — the window says why instead. Here a stranger holds the port the shell is pointed at.
export const meta = { stranger: true };
export default async function (ctx) {
  const t0 = Date.now();
  while (!/answers without the board's proof/.test(ctx.appLog()) && Date.now() - t0 < 15_000) await new Promise(r => setTimeout(r, 200));
  ctx.assert.match(ctx.appLog(), /answers without the board's proof — not adopted/, 'the stranger is not adopted');
  await new Promise(r => setTimeout(r, 1500));
  const asked = ctx.stranger.asked;
  ctx.assert.ok(asked.length > 0, 'it was asked');
  ctx.assert.deepEqual(asked.filter(a => a.key), [], 'never with the key');
  ctx.assert.ok(asked.every(a => a.url.startsWith('/api/alive') && /^[0-9a-f]{32}$/.test(a.nonce || '')), 'only the probe, with a nonce');
  const text = await ctx.js(`return document.body ? document.body.innerText : ''`);
  ctx.assert.match(text, /not your board/, 'the window says so');
  ctx.assert.equal(await ctx.js(`return typeof window.PEIX_KEY`), 'undefined', 'no key in the view');
  return { asked: asked.length };
}
