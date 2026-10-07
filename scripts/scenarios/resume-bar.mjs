// The resume bar (2026-10-07): a chat whose claude has ended is its transcript, with a bar under it — what it is, and
// Resume — where the one-shot reply box was. What is checked: the bar on a stale chat and no box to type in; Resume
// starts the drawer and the bar goes (the harness keeps auto-resume off); the drawer ended, the bar is back and does not
// count down, the switch on or not; with the settings' switch on, opening a stale chat counts down — the line along the
// top, the seconds on the button — and resumes it about 5 s later, on the tab it was on; Not now, Esc, another chat and
// the switch stop the countdown, and so does ticking the chat done; a done chat, and the one a reload opens, wait for
// the button.
export const meta = { server: true, fake: true, fixture: 'auto' };

const sid = JSON.stringify;
const BAR = `document.querySelector('#resume')`;
const SHOWN = `!${BAR}.hidden`;
const COUNTING = id => `${BAR}.classList.contains('counting') && window.peix.state().resume?.id === ${sid(id)}`;

export default async function (ctx) {
  const out = {};
  const [twoPrs, plain] = ctx.fixture.chats;
  const resume = () => ctx.peix('state().resume');
  const setSwitch = on => ctx.evaluate(`(b => { b.checked = ${on}; b.dispatchEvent(new Event('change')); })(document.querySelector('#autoResume'))`);
  const running = id => ctx.waitFor(`window.peix.state().termSession === ${sid(id)} && !document.querySelector('#term').hidden && window.peix.session(${sid(id)})?.alive`, { what: `the drawer on ${id.slice(0, 8)}, its claude registered`, timeout: 15_000 });
  const endDrawer = async id => {
    const t = (await ctx.peix(`session(${sid(id)})`)).terminal;
    await ctx.server.api(`/api/terminals/${t.id}`, { method: 'DELETE' });
    await ctx.waitFor(`(s => s && !s.alive && !(s.terminal && s.terminal.exited === null))(window.peix.session(${sid(id)}))`, { what: `${id.slice(0, 8)}'s claude ended`, timeout: 15_000 });
  };

  // ---- the bar, the switch off (the harness's default): a transcript, Resume, and nothing to type in ----
  ctx.assert.equal((await ctx.peix('prefs()')).autoResume, false, 'the harness keeps auto-resume off');
  await ctx.openChat(plain.id);
  await ctx.waitFor(SHOWN, { what: 'the resume bar on a stale chat' });
  out.bar = await ctx.evaluate(`({ title: ${BAR}.querySelector('.t b').textContent, go: document.querySelector('#resumeGo')?.textContent, no: !!document.querySelector('#resumeNo'),
    counting: ${BAR}.classList.contains('counting'), box: !!document.querySelector('#composer, #composeText, #resume textarea'), h: ${BAR}.getBoundingClientRect().height })`);
  ctx.assert.match(out.bar.title, /claude has ended/, 'the bar says the session ended');
  ctx.assert.match(out.bar.go, /^Resume⌥⌘C$/, 'one button: Resume');
  ctx.assert.ok(!out.bar.no && !out.bar.counting, 'no countdown with the switch off');
  ctx.assert.ok(!out.bar.box, 'no reply box');
  ctx.assert.equal(await resume(), null);
  await ctx.shot('bar');
  await ctx.evaluate(`document.querySelector('#resumeGo').click()`);
  await running(plain.id);
  await ctx.waitFor(`${BAR}.hidden`, { what: 'the bar gone under the drawer' });
  await ctx.waitPrompt();

  // ---- the drawer ended while open: the bar back, no countdown even with the switch on ----
  await setSwitch(true);
  ctx.assert.equal((await ctx.peix('prefs()')).autoResume, true, 'the switch sets the pref');
  await endDrawer(plain.id);
  await ctx.waitFor(SHOWN, { what: 'the bar back once its claude ended' });
  await ctx.sleep(300);
  ctx.assert.equal(await resume(), null, 'a claude that ended while its chat was open is not resumed by itself');

  // ---- the switch on: opening a stale chat counts down, then resumes it ----
  await ctx.openChat(twoPrs.id);
  const t0 = Date.now();
  await ctx.waitFor(COUNTING(twoPrs.id), { what: 'the countdown' });
  await ctx.sleep(1200);
  out.counting = await ctx.evaluate(`({ go: document.querySelector('#resumeGo').textContent, no: !!document.querySelector('#resumeNo'), left: window.peix.state().resume.left,
    line: getComputedStyle(${BAR}, '::before').transform, tab: window.peix.state().tab })`);
  ctx.assert.match(out.counting.go, /^Resume in [1-4]⌥⌘C$/, 'the button counts the seconds');
  ctx.assert.ok(out.counting.no, 'Not now beside it');
  ctx.assert.ok(out.counting.left > 2000 && out.counting.left < 4000, `about 4 s left (${out.counting.left})`);
  ctx.assert.match(out.counting.line, /^matrix\(0\.[1-4]/, `the line along the top a fifth or so across (${out.counting.line})`);
  await ctx.shot('counting');
  await running(twoPrs.id);
  out.resumedAfterMs = Date.now() - t0;
  ctx.assert.ok(out.resumedAfterMs > 4500 && out.resumedAfterMs < 9000, `resumed about 5 s after it opened (${out.resumedAfterMs} ms)`);
  ctx.assert.equal(await ctx.peix('state().tab'), 'chat', 'on the chat tab, where it was');
  ctx.assert.equal(await resume(), null);
  await ctx.waitFor(`${BAR}.hidden`, { what: 'no bar on the resumed chat' });

  // ---- Not now: the countdown stops, the button stays ----
  await ctx.openChat(plain.id);
  await ctx.waitFor(COUNTING(plain.id), { what: 'the countdown on the first chat again' });
  await ctx.evaluate(`document.querySelector('#resumeNo').click()`);
  ctx.assert.equal(await resume(), null, 'Not now stops it');
  out.notNow = await ctx.evaluate(`({ shown: ${SHOWN}, counting: ${BAR}.classList.contains('counting'), no: !!document.querySelector('#resumeNo'), go: document.querySelector('#resumeGo')?.textContent })`);
  ctx.assert.deepEqual(out.notNow, { shown: true, counting: false, no: false, go: 'Resume⌥⌘C' }, 'the bar stays, the button waiting');

  // ---- Esc stops it ----
  await ctx.openChat(twoPrs.id);
  await ctx.openChat(plain.id);
  await ctx.waitFor(COUNTING(plain.id), { what: 'the countdown, opened anew' });
  await ctx.evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }))`);
  ctx.assert.equal(await resume(), null, 'Esc stops it');

  // ---- another chat opened meanwhile stops it ----
  await ctx.openChat(twoPrs.id);
  await ctx.openChat(plain.id);
  await ctx.waitFor(COUNTING(plain.id), { what: 'the countdown, opened anew' });
  await ctx.openChat(twoPrs.id);
  ctx.assert.equal(await resume(), null, 'leaving the chat stops it');
  await ctx.sleep(5500);
  ctx.assert.ok(!(await ctx.peix(`session(${sid(plain.id)})`)).alive, 'Not now, Esc and leaving: the chat was never resumed');

  // ---- the switch off stops it ----
  await ctx.openChat(plain.id);
  await ctx.waitFor(COUNTING(plain.id), { what: 'the countdown, opened anew' });
  await setSwitch(false);
  ctx.assert.equal(await resume(), null, 'the switch off stops it');
  await setSwitch(true);

  // ---- a chat ticked done waits for the button: ticked while it counts, the countdown stops; opened done, none ----
  await ctx.openChat(twoPrs.id);
  await ctx.openChat(plain.id);
  await ctx.waitFor(COUNTING(plain.id), { what: 'the countdown, opened anew' });
  await ctx.server.post(`/api/sessions/${plain.id}/done`, { done: true });
  await ctx.waitFor(`window.peix.session(${sid(plain.id)}).done && !window.peix.state().resume && !${BAR}.classList.contains('counting')`, { what: 'ticked done, the countdown stopped' });
  await ctx.openChat(twoPrs.id);
  await ctx.openChat(plain.id);
  await ctx.waitFor(SHOWN, { what: 'the bar on the done chat' });
  await ctx.sleep(300);
  ctx.assert.equal(await resume(), null, 'a done chat does not count down');
  await ctx.server.post(`/api/sessions/${plain.id}/done`, { done: false });
  await ctx.waitFor(`!window.peix.session(${sid(plain.id)}).done`, { what: 'the first chat back' });

  // ---- a reload opens the chat without a countdown ----
  await ctx.openChat(twoPrs.id);
  await ctx.openChat(plain.id);
  await ctx.waitFor(COUNTING(plain.id), { what: 'the countdown before the reload' });
  await ctx.reload();
  await ctx.waitFor(`window.peix.state().current === ${sid(plain.id)} && ${SHOWN}`, { what: 'the chat open again, its bar' });
  ctx.assert.equal((await ctx.peix('prefs()')).autoResume, true, 'the switch kept by the reload');
  await ctx.sleep(300);
  ctx.assert.equal(await resume(), null, 'the chat a load opens does not count down');

  return out;
}
