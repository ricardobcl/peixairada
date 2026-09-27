// The open transcript while its chat lives (2026-09-27, night): presence at its foot — Claude's mark and "clauding…"
// while the chat works, the question while it asks, nothing once it is ready — kept the last thing in the log as
// replies come in. Two live chats in the fixture (a `sleep` each, the server only asks whether the pid is there): one
// mid tool call, one the registry says is waiting on a permission prompt; the first gets its end_turn written in.
// Then a long chat, for what comes while you read: a reply written in while the log is scrolled up fades in and
// lights the "↓ new reply" pill at the foot; a click on it scrolls to the end and puts it away; a reply that comes
// while you are at the end is simply shown, no pill.
import { spawn } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { makeFixture, replyLines, toolLines } from '../fixture.mjs';

export const meta = { server: true, fixture: 'auto' };

const presence = ctx => ctx.evaluate(`JSON.stringify((p => p ? { text: p.textContent.trim(), ask: p.classList.contains('ask'), last: !p.nextElementSibling || p.nextElementSibling.classList.contains('lognew'), pix: !!p.querySelector('.pix'), anim: p.querySelector('.pix svg') ? getComputedStyle(p.querySelector('.pix svg')).animationName : null } : null)(document.querySelector('#log > .presence')))`).then(JSON.parse);
const pill = ctx => ctx.evaluate(`JSON.stringify((p => ({ there: !!p, on: !!p && p.classList.contains('on'), text: p ? p.textContent.trim() : '', last: !!p && p === p.parentElement.lastElementChild }))(document.querySelector('#log > .lognew')))`).then(JSON.parse);
const logPos = ctx => ctx.evaluate(`JSON.stringify((l => ({ top: Math.round(l.scrollTop), gap: Math.round(l.scrollHeight - l.scrollTop - l.clientHeight), msgs: l.querySelectorAll(':scope > .msg').length, faded: l.querySelectorAll(':scope > .in').length }))(document.querySelector('#log')))`).then(JSON.parse);

export default async function (ctx) {
  const out = {}, cwd = join(tmpdir(), 'peix-tlive', 'tlive-repo'), now = Date.now();
  const sleeps = [0, 1].map(() => spawn('sleep', ['120'], { stdio: 'ignore' }));
  const live = (i, extra = {}) => ({ pid: sleeps[i].pid, startedAt: now - 3600_000, ...extra });
  try {
    const { chats } = makeFixture(ctx.fixture.dir, [
      { cwd, title: 'Clauding', prompt: 'build it', reply: 'on it', at: new Date(now - 60_000), live: live(0),
        lines: id => toolLines({ id, cwd, name: 'Bash', input: { command: 'npm run build', description: 'build' }, at: new Date(now - 10_000) }) },
      { cwd, title: 'Asking', prompt: 'may I?', reply: 'one question', at: new Date(now - 120_000), live: live(1, { status: 'waiting', waitingFor: 'permission prompt' }) },
      { cwd, title: 'Long', prompt: 'tell me everything', reply: 'here goes', at: new Date(now - 7200_000),
        lines: id => Array.from({ length: 30 }, (_, i) => replyLines({ id, cwd, text: `Paragraph ${i + 1} of a long reply, long enough to take a line or two of the transcript, so that thirty of them run well past the bottom of the window.`, at: new Date(now - 7200_000 + (i + 1) * 1000) })).flat() },
      // two days ago, then today: a date line at the top, "today" where it comes back
      { cwd, title: 'Days', prompt: 'an old question', reply: 'an old answer', at: new Date(now - 2 * 86_400_000),
        lines: id => replyLines({ id, cwd, text: 'And a new word today.', at: new Date(now - 60_000) }) },
    ]);
    const [working, asking, long, days] = chats;
    await ctx.waitFor(`document.querySelector('#slist > .card.working') && document.querySelector('#slist > .card.asking')`, { what: 'a clauding card and an asking one' });

    // clauding: the mark and the word, last in the log, in step with the divider
    await ctx.openChat(working.id);
    await ctx.waitFor(`!!document.querySelector('#log > .presence')`, { what: 'presence at the foot of the transcript' });
    out.working = await presence(ctx);
    ctx.assert.match(out.working.text, /^clauding…$/, 'the word');
    ctx.assert.ok(out.working.pix && out.working.anim === 'pix', "Claude's mark, stepping its frames");
    ctx.assert.ok(out.working.last && !out.working.ask, 'last in the log, and not a question');
    await ctx.shot('clauding');

    // the reply lands: the presence goes, the reply is the last thing
    appendFileSync(working.file, replyLines({ id: working.id, cwd, text: 'Built, all green.', at: new Date() }).map(l => JSON.stringify(l)).join('\n') + '\n');
    await ctx.waitFor(`!document.querySelector('#log > .presence') && /Built, all green/.test(document.querySelector('#log').lastElementChild?.textContent || '')`, { what: 'the presence gone and the reply last', timeout: 6000 });
    out.landed = await ctx.evaluate(`document.querySelector('#log').lastElementChild.className`);
    ctx.assert.match(out.landed, /\bmsg\b.*\bassistant\b/, 'the reply closes the log');

    // asking: the question in the card's red, from the registry's word
    await ctx.openChat(asking.id);
    await ctx.waitFor(`document.querySelector('#log > .presence.ask')`, { what: 'the question at the foot' });
    out.asking = await presence(ctx);
    ctx.assert.match(out.asking.text, /asking you — permission prompt/, 'what the registry says it waits on');
    ctx.assert.ok(out.asking.last, 'last in the log');
    await ctx.shot('asking');

    // The long chat: the first fill stands still; a reply written in while the log is scrolled up fades in and lights
    // the pill; the pill scrolls to the end and goes; a reply that comes at the end shows with no pill.
    await ctx.openChat(long.id);
    await ctx.waitFor(`document.querySelectorAll('#log > .msg').length === 32`, { what: 'the long chat drawn' });
    await ctx.waitFor(`(l => l.scrollHeight - l.scrollTop - l.clientHeight < 80)(document.querySelector('#log'))`, { what: 'the smooth scroll to the end done', timeout: 4000 });
    out.longFill = { ...(await logPos(ctx)), pill: await pill(ctx) };
    ctx.assert.equal(out.longFill.faded, 0, 'nothing fades in on the first fill');
    ctx.assert.ok(out.longFill.gap < 80 && out.longFill.top > 500, `opened at the end (${out.longFill.top} down, ${out.longFill.gap} to go)`);
    ctx.assert.equal(out.longFill.pill.there, false, 'no pill yet');
    await ctx.evaluate(`document.querySelector('#log').scrollTo({ top: 0, behavior: 'auto' })`);
    await ctx.sleep(200);
    const n0 = (await ctx.peix('motion()')).length;
    appendFileSync(long.file, replyLines({ id: long.id, cwd, text: 'And one more, while you were reading the top.', at: new Date() }).map(l => JSON.stringify(l)).join('\n') + '\n');
    await ctx.waitFor(`document.querySelector('#log > .lognew.on')`, { what: 'the new-reply pill', timeout: 6000 });
    out.scrolledUp = { ...(await logPos(ctx)), pill: await pill(ctx), moves: (await ctx.peix('motion()')).slice(n0).map(m => m.kind).filter(k => ['msg', 'pill'].includes(k)) };   // the card's own slide to the top of the list is the list's business
    ctx.assert.equal(out.scrolledUp.pill.text, '↓ new reply', 'what the pill says');
    ctx.assert.ok(out.scrolledUp.pill.last, 'the pill is the last thing in the log');
    ctx.assert.ok(out.scrolledUp.top < 40, 'and the log stayed where you were');
    ctx.assert.equal(out.scrolledUp.faded, 1, 'the reply that came fades in');
    ctx.assert.deepEqual(out.scrolledUp.moves, ['msg', 'pill'], 'a message came, the pill lit');
    await ctx.shot('pill');
    await ctx.evaluate(`document.querySelector('#log > .lognew button').click()`);
    await ctx.waitFor(`(l => l.scrollHeight - l.scrollTop - l.clientHeight < 80)(document.querySelector('#log')) && !document.querySelector('#log > .lognew.on')`, { what: 'scrolled to the end, the pill away', timeout: 3000 });
    appendFileSync(long.file, replyLines({ id: long.id, cwd, text: 'And another, with you at the end.', at: new Date() }).map(l => JSON.stringify(l)).join('\n') + '\n');
    await ctx.waitFor(`document.querySelectorAll('#log > .msg').length === 34`, { what: 'the last reply drawn', timeout: 6000 });
    await ctx.sleep(300);
    out.atEnd = { ...(await logPos(ctx)), pill: await pill(ctx) };
    ctx.assert.ok(out.atEnd.gap < 80, 'kept at the end');
    ctx.assert.equal(out.atEnd.pill.on, false, 'no pill for a reply you saw come');

    // Times: hours and minutes, no seconds; a day line where the transcript changes day, none for today at the top;
    // the card's age written after the render from data-at, not in the markup.
    out.times = await ctx.evaluate(`JSON.stringify([...document.querySelectorAll('#log > .msg .who span:last-child')].slice(0, 3).map(s => s.textContent))`).then(JSON.parse);
    for (const t of out.times) ctx.assert.match(t, /^\d{1,2}:\d{2}(?:[\s\u202f][AP]M)?$/, `a time without seconds: ${t}`);
    out.longDays = await ctx.evaluate(`document.querySelectorAll('#log > .sysline.day').length`);
    ctx.assert.equal(out.longDays, 0, 'a chat from today has no day line');
    await ctx.openChat(days.id);
    await ctx.waitFor(`document.querySelectorAll('#log > .msg').length === 3`, { what: 'the two-day chat drawn' });
    out.days = await ctx.evaluate(`JSON.stringify([...document.querySelector('#log').children].map(c => c.classList.contains('day') ? 'day:' + c.textContent : c.className.split(' ')[0]))`).then(JSON.parse);
    ctx.assert.match(out.days[0], /^day:\d\d-\d\d-\d{4}$/, 'the old day named at the top');
    ctx.assert.deepEqual(out.days.slice(1), ['msg', 'msg', 'day:today', 'msg'], 'then its messages, "today" where the transcript comes back, and the new word');
    await ctx.shot('days');
    out.age = await ctx.evaluate(`JSON.stringify((t => ({ at: t.dataset.at, text: t.textContent, tip: t.title }))(document.querySelector('#slist > .card[data-id=${JSON.stringify(days.id)}] .time')))`).then(JSON.parse);
    ctx.assert.match(out.age.at, /^\d{4}-/, 'the card carries when, not the words');
    ctx.assert.match(out.age.text, /^\d+[smhd]$/, `and fillAges wrote the age: ${out.age.text}`);
    ctx.assert.match(out.age.tip, /last activity/, 'with the tooltip');
  } finally { for (const s of sleeps) s.kill(); }
  return out;
}
