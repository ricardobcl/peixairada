// ⌥⌘K finds done chats once something is typed, and a PR's link finds every chat that names it (2026-11-03). What is
// checked: the box empty, no done chat; typed, done chats join and say so, at half their worth, so an open chat with a
// lesser match keeps the top and a done one leads only where it matches clearly better; a PR's number leads with the
// chat on that PR, done or not; a link finds a chip's chat at once and, on the answer, every chat whose transcript
// names it, the middle the boot did not read too — saying so, the open before the done, one the list hides for its age
// too, and it opens; another PR's link finds none, and one the server refuses says so; ⏎ before the answer waits for it
// and opens the chat, which stays done and has its chip; the box opened again has forgotten it.
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { makeFixture, replyLines } from '../fixture.mjs';

export const meta = { server: true, fixture: 'auto', env: { TAIL_BYTES: '4000', HEAD_BYTES: '200' } };

const rows = ctx => ctx.evaluate(`JSON.stringify([...document.querySelectorAll('#picklist .pkrow.chat')].map(r => ({ title: [...r.querySelector('.n').childNodes].filter(n => !n.classList?.contains('cur')).map(n => n.textContent).join(''), st: r.querySelector('.st').textContent, why: r.querySelector('.ids')?.textContent ?? null })))`).then(JSON.parse);
const said = ctx => ctx.evaluate(`document.querySelector('#picklist .none')?.textContent ?? null`);
const asked = ctx => ctx.waitFor(`!(document.querySelector('#picklist .none')?.textContent || '').startsWith('reading')`, { what: 'the transcripts\' answer' });

export default async function (ctx) {
  const out = {};
  const cwd = join(tmpdir(), 'peix-k-done', 'done-repo'), m = n => new Date(Date.now() - n * 60_000), filler = 'filler '.repeat(2000);
  // a long chat: this PR's link in the middle, then what the boot does read
  const long = (title, n, at) => ({ cwd, title, prompt: 'go', reply: 'ok', at, lines: id => [
    ...replyLines({ id, cwd, text: filler, at }),
    ...replyLines({ id, cwd, text: `Opened https://github.com/acme/widgets/pull/${n} for it.`, at }),
    ...replyLines({ id, cwd, text: filler, at }),
    { type: 'ai-title', sessionId: id, aiTitle: title },
    ...replyLines({ id, cwd, text: 'all done', at }),
  ] });
  const [, done, docs, , bump, , , longDone, old, paste] = makeFixture(ctx.fixture.dir, [
    { cwd, title: 'Tidy the wallet resolvers', prompt: 'tidy', reply: 'tidied', at: m(10) },
    { cwd, title: 'Wallet dataloader', prompt: 'load', reply: 'loaded', at: m(20) },
    { cwd, title: 'Serve the docs from Cloudflare', prompt: 'serve', reply: 'served', at: m(30) },
    { cwd, title: 'Scatter', prompt: 'can lots of useful days fill a real end', reply: 'ok', at: m(40) },
    { cwd, title: 'Bump the ledger', prompt: 'bump', reply: 'Opened https://github.com/acme/widgets/pull/650 for it.', at: m(50) },
    { cwd, title: 'A longer number', prompt: 'more', reply: 'Opened https://github.com/acme/widgets/pull/16501 for it.', at: m(60) },
    long('Long and open', 777, m(70)),
    long('Long and done', 777, m(80)),
    long('Long and old', 777, m(40 * 24 * 60)),
    long('Pasted', 888, m(90)),
  ]).chats;
  await ctx.waitFor(`window.peix.session(${JSON.stringify(paste.id)})`, { what: 'the fixture on the board' });
  for (const c of [done, docs, bump, longDone, paste]) {
    await ctx.server.post(`/api/sessions/${c.id}/done`, {});
    await ctx.waitFor(`window.peix.session(${JSON.stringify(c.id)}).done`, { what: `${c.title} ticked` });
  }
  ctx.assert.deepEqual((await ctx.peix(`session(${JSON.stringify(longDone.id)})`)).prs, [], 'its PR is in the middle: no chip');

  // ---- the box empty: open chats only ----
  await ctx.key('KeyK');
  await ctx.waitFor(`document.querySelector('#pick').open`, { what: 'the picker' });
  out.empty = await rows(ctx);
  ctx.assert.ok(out.empty.length >= 5, JSON.stringify(out.empty));
  ctx.assert.ok(!out.empty.some(r => r.st === 'done'), `no done chat with nothing typed — ${JSON.stringify(out.empty)}`);
  out.hint = await ctx.evaluate(`document.querySelector('#pickq').placeholder`);
  ctx.assert.match(out.hint, /done chats too/);
  await ctx.shot('empty', { x: 0, y: 0, width: 1200, height: 420 });

  // ---- typed: done chats join, an open chat keeping the top against a done one with a better match ----
  await ctx.fill('#pickq', 'wallet');
  out.wallet = await rows(ctx);
  ctx.assert.deepEqual(out.wallet.map(r => [r.title, r.st]), [['Tidy the wallet resolvers', 'ready'], ['Wallet dataloader', 'done']], JSON.stringify(out.wallet));
  await ctx.shot('typed', { x: 0, y: 0, width: 1200, height: 420 });
  // …and a done one leads where the open one only scatters the letters over its prompt
  await ctx.fill('#pickq', 'cloudflare');
  out.cloud = await rows(ctx);
  ctx.assert.equal(out.cloud[0]?.title, 'Serve the docs from Cloudflare', JSON.stringify(out.cloud));
  ctx.assert.ok(out.cloud.some(r => r.title === 'Scatter'), `the open chat matches too — ${JSON.stringify(out.cloud)}`);

  // ---- a PR's number: its chat, done, before an open one with those digits inside a longer number ----
  await ctx.fill('#pickq', '650');
  out.number = await rows(ctx);
  ctx.assert.deepEqual(out.number.slice(0, 2).map(r => [r.title, r.st, r.why]), [['Bump the ledger', 'done', 'widgets#650'], ['A longer number', 'ready', 'widgets#16501']], JSON.stringify(out.number));

  // ---- a link: the chip's chat, at once and after the answer ----
  await ctx.fill('#pickq', 'https://github.com/acme/widgets/pull/650/files');
  out.chip = await rows(ctx);
  ctx.assert.deepEqual(out.chip, [{ title: 'Bump the ledger', st: 'done', why: 'widgets#650' }], JSON.stringify(out.chip));
  await asked(ctx);
  ctx.assert.deepEqual(await rows(ctx), out.chip, 'the answer adds no second row of it');

  // ---- a link no chip has: said while it reads, then every chat that names it ----
  const link = 'https://github.com/acme/widgets/pull/777';
  out.reading = await ctx.evaluate(`(() => { const b = document.querySelector('#pickq'); b.value = ${JSON.stringify(link)}; b.dispatchEvent(new Event('input', { bubbles: true })); return document.querySelector('#picklist .none')?.textContent; })()`);
  ctx.assert.match(out.reading, /^reading every chat's transcript/);
  await asked(ctx);
  out.named = await rows(ctx);
  ctx.assert.deepEqual(out.named, [
    { title: 'Long and open', st: 'ready', why: 'named in its transcript' },
    { title: 'Long and old', st: 'ready', why: 'named in its transcript' },
    { title: 'Long and done', st: 'done', why: 'named in its transcript' },
  ], JSON.stringify(out.named));
  ctx.assert.equal(await said(ctx), null, 'nothing left to say');
  await ctx.shot('named', { x: 0, y: 0, width: 1200, height: 420 });

  // ---- the one the list hides for its age opens all the same ----
  await ctx.evaluate(`[...document.querySelectorAll('#picklist .pkrow.chat')].find(r => r.querySelector('.n').textContent.startsWith('Long and old')).click()`);
  await ctx.waitFor(`window.peix.state().current === ${JSON.stringify(old.id)} && document.querySelector('#log')?.dataset.sid === ${JSON.stringify(old.id)}`, { what: 'the old chat open' });
  await ctx.key('KeyK');
  await ctx.waitFor(`document.querySelector('#pick').open`, { what: 'the picker again' });

  // ---- a link nothing names, and one the server refuses (past a PR's numbers) ----
  await ctx.fill('#pickq', 'https://github.com/acme/widgets/pull/999');
  await asked(ctx);
  ctx.assert.deepEqual(await rows(ctx), []);
  ctx.assert.equal(await said(ctx), 'no chat matches');
  await ctx.fill('#pickq', 'https://github.com/acme/widgets/pull/9999999999');
  await asked(ctx);
  ctx.assert.match(await said(ctx), /^the transcripts could not be read: /);

  // ---- pasted and ⏎ at once, no row yet: the answer opens the chat, still done, its chip there now ----
  await ctx.evaluate(`(() => { const b = document.querySelector('#pickq'); b.value = 'https://github.com/acme/widgets/pull/888'; b.dispatchEvent(new Event('input', { bubbles: true })); b.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); })()`);
  await ctx.waitFor(`window.peix.state().current === ${JSON.stringify(paste.id)}`, { what: 'the chat the link names, open' });
  ctx.assert.equal(await ctx.evaluate(`document.querySelector('#pick').open`), false, 'the picker closed');
  await ctx.waitFor(`window.peix.session(${JSON.stringify(paste.id)}).prs.some(p => p.label === 'widgets#888')`, { what: 'opening read it whole: its chip' });
  ctx.assert.equal(await ctx.evaluate(`window.peix.session(${JSON.stringify(paste.id)}).done`), true, 'still done');

  // ---- opened again: as new ----
  await ctx.key('KeyK');
  await ctx.waitFor(`document.querySelector('#pick').open`, { what: 'the picker again' });
  out.again = await rows(ctx);
  ctx.assert.ok(!out.again.some(r => r.st === 'done' || r.why), JSON.stringify(out.again));
  ctx.assert.equal(await said(ctx), null);
  await ctx.evaluate(`document.querySelector('#pick').close()`);
  return out;
}
