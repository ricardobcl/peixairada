// The resume bar (2026-10-07): a chat whose claude has ended is its transcript, with a bar under it — what it is, and
// Resume — where the one-shot reply box was. What is checked: the bar on a stale chat and no box to type in; Resume
// starts the drawer and the bar goes; the drawer ended, the bar is back; and nothing resumes a chat by itself — opened
// anew, or opened by a reload, it waits for the button (a countdown to a resume was a switch until 2026-10-14). And a
// claude running outside the board (2026-11-04): the same bar, saying where, its one button Take over, pressed twice; a
// background session's Attach, one press, the session still running when the drawer closes.
import { execFileSync, spawn } from 'node:child_process';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
export const meta = { server: true, fake: true, fixture: 'auto' };

const sid = JSON.stringify;
const BAR = `document.querySelector('#resume')`;
const SHOWN = `!${BAR}.hidden`;

export default async function (ctx) {
  const out = {};
  const [twoPrs, plain] = ctx.fixture.chats;
  const running = id => ctx.waitFor(`window.peix.state().termSession === ${sid(id)} && !document.querySelector('#term').hidden && window.peix.session(${sid(id)})?.alive`, { what: `the drawer on ${id.slice(0, 8)}, its claude registered`, timeout: 15_000 });
  const endDrawer = async id => {
    const t = (await ctx.peix(`session(${sid(id)})`)).terminal;
    await ctx.server.api(`/api/terminals/${t.id}`, { method: 'DELETE' });
    await ctx.waitFor(`(s => s && !s.alive && !(s.terminal && s.terminal.exited === null))(window.peix.session(${sid(id)}))`, { what: `${id.slice(0, 8)}'s claude ended`, timeout: 15_000 });
  };

  // ---- the bar: a transcript, Resume, and nothing to type in ----
  await ctx.openChat(plain.id);
  await ctx.waitFor(SHOWN, { what: 'the resume bar on a stale chat' });
  out.bar = await ctx.evaluate(`({ title: ${BAR}.querySelector('.t b').textContent, go: document.querySelector('#resumeGo')?.textContent, buttons: ${BAR}.querySelectorAll('button').length,
    box: !!document.querySelector('#composer, #composeText, #resume textarea'), h: ${BAR}.getBoundingClientRect().height })`);
  ctx.assert.match(out.bar.title, /Claude isn’t running/, 'the bar says Claude is not running there (claude has ended, before 2026-10-12)');
  ctx.assert.match(out.bar.go, /^Resume⌥⌘C$/, 'one button: Resume');
  ctx.assert.equal(out.bar.buttons, 1, 'and nothing beside it');
  ctx.assert.ok(!out.bar.box, 'no reply box');
  await ctx.shot('bar');
  await ctx.evaluate(`document.querySelector('#resumeGo').click()`);
  await running(plain.id);
  await ctx.waitFor(`${BAR}.hidden`, { what: 'the bar gone under the drawer' });
  await ctx.waitPrompt();

  // ---- the drawer ended while open: the bar back ----
  await endDrawer(plain.id);
  await ctx.waitFor(SHOWN, { what: 'the bar back once its claude ended' });

  // ---- nothing resumes by itself: another stale chat opened, then a reload ----
  await ctx.openChat(twoPrs.id);
  await ctx.waitFor(SHOWN, { what: 'the bar on the other stale chat' });
  await ctx.sleep(6000);   // the countdown's 5 s, and some
  ctx.assert.ok(!(await ctx.peix(`session(${sid(twoPrs.id)})`)).alive, 'opened, the chat waits for the button');
  await ctx.reload();
  await ctx.waitFor(`window.peix.state().current === ${sid(twoPrs.id)} && ${SHOWN}`, { what: 'the chat open again, its bar' });
  await ctx.sleep(1000);
  ctx.assert.ok(!(await ctx.peix(`session(${sid(twoPrs.id)})`)).alive, 'and after a reload too');

  // ---- a claude outside the board: no Resume, where it runs, and Take over on the bar ----
  const procOf = pid => execFileSync('/bin/ps', ['-o', 'lstart=', '-p', String(pid)], { encoding: 'utf8', env: { ...process.env, LC_ALL: 'C', TZ: 'UTC' } }).trim();
  const other = spawn('sleep', ['120'], { stdio: 'ignore' }), procStart = procOf(other.pid);
  writeFileSync(join(ctx.fixture.dir, 'sessions', `${other.pid}.json`), JSON.stringify({ pid: other.pid, sessionId: twoPrs.id, cwd: twoPrs.cwd, startedAt: Date.now(), procStart, kind: 'interactive', entrypoint: 'cli', status: 'idle', statusUpdatedAt: Date.now() }));
  try {
    await ctx.waitFor(`!!document.querySelector('#takeGo')`, { what: 'Take over on the bar' });
    const said = () => ctx.evaluate(`JSON.stringify({ title: ${BAR}.querySelector('.t b').textContent, more: ${BAR}.querySelector('.t span').textContent, go: document.querySelector('#takeGo')?.textContent, arm: document.querySelector('#takeGo')?.classList.contains('arm'), resume: !!document.querySelector('#resumeGo'), buttons: ${BAR}.querySelectorAll('button').length, inRow: !!document.querySelector('#shead #termBtn') })`).then(JSON.parse);
    out.elsewhere = await said();
    ctx.assert.equal(out.elsewhere.title, 'Claude is running in a terminal outside the board');
    ctx.assert.match(out.elsewhere.more, new RegExp(`^pid ${other.pid}\\.`), 'its pid');
    ctx.assert.equal(out.elsewhere.go, 'Take over⌥⌘C');
    ctx.assert.deepEqual([out.elsewhere.resume, out.elsewhere.buttons], [false, 1], 'one button, and it is not Resume');
    await ctx.shot('elsewhere');
    await ctx.evaluate(`document.querySelector('#takeGo').click()`);
    await ctx.waitFor(`document.querySelector('#takeGo')?.classList.contains('arm')`, { what: 'the button armed' });
    out.armed = await said();
    ctx.assert.equal(out.armed.go, 'sure?⌥⌘C', 'pressed once, it asks');
    ctx.assert.equal(out.armed.inRow, false, 'on the bar, not in the header too');
    ctx.assert.equal(other.exitCode, null, 'and nothing has ended yet');
    await ctx.evaluate(`document.querySelector('#takeGo').click()`);
    await running(twoPrs.id);
    await ctx.waitFor(`${BAR}.hidden`, { what: 'the bar gone once it runs here' });
    ctx.assert.ok(other.signalCode || other.exitCode !== null, 'the claude elsewhere ended');
    // a second claude that is no VS Code's, on the chat with a drawer: said as what it is
    const second = spawn('sleep', ['120'], { stdio: 'ignore' }), regSecond = join(ctx.fixture.dir, 'sessions', `${second.pid}.json`);
    writeFileSync(regSecond, JSON.stringify({ pid: second.pid, procStart: procOf(second.pid), sessionId: twoPrs.id, cwd: twoPrs.cwd, startedAt: Date.now(), kind: 'interactive', entrypoint: 'cli', status: 'idle', statusUpdatedAt: Date.now() }));
    await ctx.waitFor(`!document.querySelector('#rival').hidden`, { what: 'the rival bar' });
    await ctx.settle();
    out.rival = await ctx.evaluate(`JSON.stringify({ bar: document.querySelector('#rival .t b').textContent, chip: document.querySelector('#slist > .card[data-id=${sid(twoPrs.id)}] .chip.rival')?.textContent, vs: !!document.querySelector('#slist > .card[data-id=${sid(twoPrs.id)}] .chip.vsc') })`).then(JSON.parse);
    ctx.assert.deepEqual(out.rival, { bar: 'Another claude runs on this chat', chip: 'a second claude', vs: false }, 'no VS Code in it');
    second.kill(); rmSync(regSecond, { force: true });
    await ctx.waitFor(`document.querySelector('#rival').hidden`, { what: 'the rival gone' });
  } finally { try { other.kill(); } catch {} }

  // ---- a background session: attached, not taken over; the drawer closed, it runs on ----
  const worker = spawn('sleep', ['120'], { stdio: 'ignore' });
  writeFileSync(join(ctx.fixture.dir, 'sessions', `${worker.pid}.json`), JSON.stringify({ pid: worker.pid, procStart: procOf(worker.pid), sessionId: plain.id, cwd: plain.cwd, startedAt: Date.now(), kind: 'bg', jobId: 'abcd1234', entrypoint: 'cli', status: 'idle', statusUpdatedAt: Date.now() }));
  try {
    await ctx.openChat(plain.id);
    await ctx.waitFor(`document.querySelector('#takeGo')?.textContent.startsWith('Attach')`, { what: 'Attach on the bar' });
    await ctx.settle();
    out.bg = await ctx.evaluate(`JSON.stringify({ title: ${BAR}.querySelector('.t b').textContent, chip: document.querySelector('#slist > .card[data-id=${sid(plain.id)}] .chip.elsewhere')?.title })`).then(JSON.parse);
    ctx.assert.equal(out.bg.title, 'Claude is running in the background');
    ctx.assert.match(out.bg.chip, /^Running in the background/);
    await ctx.shot('background');
    await ctx.evaluate(`document.querySelector('#takeGo').click()`);
    await running(plain.id);
    await ctx.waitFor(`${BAR}.hidden`, { what: 'the bar gone under the drawer' });
    ctx.assert.equal(worker.exitCode ?? worker.signalCode ?? null, null, 'one press, and nothing ended');
    ctx.assert.match(ctx.server.logText(), /claude attach abcd1234/, 'the session itself, not a second claude');
    const t = (await ctx.peix(`session(${sid(plain.id)})`)).terminal;
    await ctx.server.api(`/api/terminals/${t.id}`, { method: 'DELETE' });
    await ctx.waitFor(`document.querySelector('#takeGo')?.textContent.startsWith('Attach')`, { what: 'Attach back once the drawer closed' });
    ctx.assert.ok((await ctx.peix(`session(${sid(plain.id)})`)).alive, 'and it runs on');
  } finally { try { worker.kill(); } catch {} }
  return out;
}
