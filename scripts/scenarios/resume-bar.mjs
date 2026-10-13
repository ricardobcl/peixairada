// The resume bar (2026-10-07): a chat whose claude has ended is its transcript, with a bar under it — what it is, and
// Resume — where the one-shot reply box was. What is checked: the bar on a stale chat and no box to type in; Resume
// starts the drawer and the bar goes; the drawer ended, the bar is back; and nothing resumes a chat by itself — opened
// anew, or opened by a reload, it waits for the button (a countdown to a resume was a switch until 2026-10-14).
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
  return out;
}
