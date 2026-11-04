// A chat twice (2026-11-04), as the list and the column say it. What /bg leaves — the chat ended, a `continued-in` line in its
// transcript, a new id in a process of kind bg with nothing but a title in its file — and a copy of another chat under a new id
// with the same uuids. What is checked: the first chat ticked done, each card's word for the tie; opened, it says where it went on,
// and that is its first button; the second has Attach; and a copy wears `branch`, its chat `1 branch`.
import { execFileSync, spawn } from 'node:child_process';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';

export const meta = { server: true, fake: true, fixture: 'auto', prefs: { cards: 'compact', cardsEven: true, lanesShut: [] } };
const sid = JSON.stringify;

export default async function (ctx) {
  const out = {}, [other, chat] = ctx.fixture.chats, to = randomUUID();
  const card = id => `document.querySelector('#slist > .card[data-id=${sid(id)}]')`;
  await ctx.waitFor(`!!${card(chat.id)}`, { what: 'the cards' });

  // ---- /bg, as it leaves things ----
  await ctx.openChat(chat.id);
  appendFileSync(chat.file, JSON.stringify({ type: 'continued-in', timestamp: new Date().toISOString(), sessionId: chat.id, continuedInSessionId: to }) + '\n');   // said before the process is up, as it is
  await ctx.waitFor(`window.peix.session(${sid(chat.id)})?.done === true`, { what: 'the chat ticked done' });
  writeFileSync(join(dirname(chat.file), `${to}.jsonl`), JSON.stringify({ type: 'ai-title', sessionId: to, aiTitle: 'Plain chat' }) + '\n');
  const worker = spawn('sleep', ['120'], { stdio: 'ignore' });
  const procStart = execFileSync('/bin/ps', ['-o', 'lstart=', '-p', String(worker.pid)], { encoding: 'utf8', env: { ...process.env, LC_ALL: 'C', TZ: 'UTC' } }).trim();
  writeFileSync(join(ctx.fixture.dir, 'sessions', `${worker.pid}.json`), JSON.stringify({ pid: worker.pid, procStart, sessionId: to, cwd: chat.cwd, startedAt: Date.now(), kind: 'bg', jobId: to.slice(0, 8), entrypoint: 'cli', status: 'idle', statusUpdatedAt: Date.now() }));
  try {
    await ctx.waitFor(`window.peix.session(${sid(chat.id)})?.done === true && window.peix.session(${sid(to)})?.alive === true && !!${card(to)}`, { what: 'the chat done, what it went on as live' });
    await ctx.settle();
    out.cards = await ctx.evaluate(`JSON.stringify([${sid(chat.id)}, ${sid(to)}].map(id => { const c = document.querySelector('#slist > .card[data-id="' + id + '"]'); return { title: c.querySelector('.title').textContent, chip: c.querySelector('.chip.lnk')?.textContent, done: c.classList.contains('done') }; }))`).then(JSON.parse);
    ctx.assert.deepEqual(out.cards, [{ title: 'Plain chat', chip: 'went on', done: true }, { title: 'Plain chat', chip: 'went on from a chat', done: false }]);
    await ctx.shot('1-cards');

    await ctx.waitFor(`!!document.querySelector('#onGo')`, { what: 'where it went on, on its bar, once that is up' });
    out.bar = await ctx.evaluate(`JSON.stringify({ title: document.querySelector('#resume .t b').textContent, buttons: [...document.querySelectorAll('#resume button')].map(b => [b.id, b.classList.contains('rgo')]) })`).then(JSON.parse);
    ctx.assert.equal(out.bar.title, 'It went on in another chat');
    ctx.assert.deepEqual(out.bar.buttons, [['onGo', true], ['resumeGo', false]], 'that the way on, Resume beside it');
    await ctx.settle(); await ctx.shot('2-bar');
    await ctx.evaluate(`document.querySelector('#onGo').click()`);
    await ctx.waitFor(`window.peix.state().current === ${sid(to)} && document.querySelector('#takeGo')?.textContent.startsWith('Attach')`, { what: 'the column on it, Attach on its bar' });
    await ctx.settle(); await ctx.shot('3-went-on');
  } finally { try { worker.kill(); } catch {} }

  // ---- a copy under a new id ----
  const copy = randomUUID();
  writeFileSync(join(dirname(other.file), `${copy}.jsonl`), readFileSync(other.file, 'utf8').split('\n').filter(Boolean).map(l => { const j = JSON.parse(l); if ('sessionId' in j) j.sessionId = copy; return JSON.stringify(j) + '\n'; }).join(''));
  await ctx.waitFor(`document.querySelector('#slist > .card[data-id=${sid(copy)}] .chip.lnk')?.textContent === 'branch'`, { what: 'the copy wearing its word' });
  ctx.assert.equal(await ctx.evaluate(`document.querySelector('#slist > .card[data-id=${sid(other.id)}] .chip.lnk')?.textContent`), '1 branch');
  return out;
}
