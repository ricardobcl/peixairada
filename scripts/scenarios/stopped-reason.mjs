// A turn that stopped short (2026-10-31, round XIII's S4): an API error Claude Code wrote after its retries, a reply the
// token limit cut, a refusal — a Ready card that says why, in words and the attention colour, at every card size, and no
// lane of its own. Your next word clears it; at one height the words are the card's spoken ones alone.
import { appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { apiErrorLines, makeFixture, replyLines } from '../fixture.mjs';

export const meta = { server: true, fixture: 'auto' };

export default async function (ctx) {
  const out = {}, cwd = join(tmpdir(), 'peix-stopped', 'ledger-repo'), now = Date.now(), at = ms => new Date(now - ms);
  const { chats } = makeFixture(ctx.fixture.dir, [
    { cwd, title: 'Migrate the ledger tables', prompt: 'copy the ledger rows in batches', reply: '3 of 12 done', at: at(300_000),
      lines: id => apiErrorLines({ id, cwd, text: 'API Error: 529 {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}', error: 'server_error', at: at(240_000) }) },
    { cwd, title: 'A long answer', prompt: 'write the whole spec', reply: 'start', at: at(200_000),
      lines: id => [{ ...replyLines({ id, cwd, text: 'The spec, part one', at: at(190_000) })[0], message: { model: 'fixture-1', id: 'msg_cut1', type: 'message', role: 'assistant', content: [{ type: 'text', text: 'The spec, part one' }], stop_reason: 'max_tokens' } }] },
    { cwd, title: 'An answered one', prompt: 'what day is it?', reply: 'Saturday.', at: at(100_000) },
  ]);
  const chat = t => chats.find(c => c.title === t), card = id => `document.querySelector('#slist > .card[data-id="${id}"]')`;
  const [mig, cut, ok] = ['Migrate the ledger tables', 'A long answer', 'An answered one'].map(chat);
  await ctx.waitFor(`${card(mig.id)}?.querySelector('.state.stopped') && ${card(cut.id)}?.querySelector('.state.stopped')`, { what: 'the stopped cards' });
  await ctx.settle();
  const read = id => ctx.evaluate(`(c => ({ rank: c.dataset.rank, said: c.querySelector('.state.stopped')?.textContent || null, vh: c.querySelector('.top .vh').textContent,
    color: c.querySelector('.state.stopped') && getComputedStyle(c.querySelector('.state.stopped')).color, needs: getComputedStyle(document.documentElement).getPropertyValue('--needs').trim(),
    shown: c.querySelector('.state.stopped') && getComputedStyle(c.querySelector('.state.stopped')).display }))(${card(id)})`);
  out.api = await read(mig.id); out.cut = await read(cut.id); out.ok = await read(ok.id);
  ctx.assert.deepEqual([out.api.rank, out.api.said], ['ready', 'stoppedAPI error · 529 · Overloaded'], `Ready, and why: ${JSON.stringify(out.api)}`);
  ctx.assert.equal(out.api.vh, 'Ready, stopped: API error · 529 · Overloaded — ', 'said to a screen reader too');
  ctx.assert.equal(out.cut.said, 'stoppedcut short at the token limit');
  ctx.assert.equal(out.ok.said, null, 'an answer says nothing');
  ctx.assert.equal(await ctx.evaluate(`!!document.querySelector('#slist > .gsep.lane[data-lane="stopped"]')`), false, 'no lane of its own');
  // compact, the default: still there; at one height, the card's spoken words alone
  out.compact = await ctx.evaluate(`(document.querySelector('#sessions').dataset.cards = 'compact', getComputedStyle(${card(mig.id)}.querySelector('.state.stopped')).display)`);
  await ctx.settle();
  await ctx.shot('stopped', await ctx.evaluate(`(r => ({ x: r.left - 4, y: r.top - 4, width: r.width + 8, height: r.height + 8, scale: 2 }))(${card(mig.id)}.getBoundingClientRect())`));
  out.even = await ctx.evaluate(`(document.querySelector('#sessions').dataset.even = '', getComputedStyle(${card(mig.id)}.querySelector('.state.stopped')).display)`);
  await ctx.evaluate(`delete document.querySelector('#sessions').dataset.even; document.querySelector('#sessions').dataset.cards = window.peix.prefs().cards`);
  ctx.assert.deepEqual([out.compact, out.even], ['flex', 'none']);
  // light, and the colour is the theme's own --needs (AA at small sizes in both)
  await ctx.evaluate(`document.documentElement.dataset.theme = 'light'`); await ctx.sleep(200);
  out.light = await read(mig.id);
  await ctx.shot('stopped-light', await ctx.evaluate(`(r => ({ x: r.left - 4, y: r.top - 4, width: r.width + 8, height: r.height + 8, scale: 2 }))(${card(mig.id)}.getBoundingClientRect())`));
  await ctx.evaluate(`document.documentElement.dataset.theme = 'dark'`);
  // your word: it is behind you
  appendFileSync(mig.file, JSON.stringify({ isSidechain: false, userType: 'external', entrypoint: 'cli', cwd, sessionId: mig.id, version: 'fixture', gitBranch: 'main', parentUuid: null, type: 'user', uuid: 'u-go-on', timestamp: new Date().toISOString(),
    message: { role: 'user', content: [{ type: 'text', text: 'go on' }] } }) + '\n');
  appendFileSync(mig.file, JSON.stringify(replyLines({ id: mig.id, cwd, text: 'All 12 copied.' })[0]) + '\n');
  await ctx.waitFor(`!${card(mig.id)}?.querySelector('.state.stopped') && window.peix.session('${mig.id}').lastReply === 'All 12 copied.'`, { what: 'cleared by your word' });
  return out;
}
