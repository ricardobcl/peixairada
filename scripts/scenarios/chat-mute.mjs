// A chat muted (2026-11-02). What this checks: the card says so in words at every size and with every part hidden, the
// open one too; a right-click, the header's menu, the launcher and the banner's action mute it, and a click on the word
// unmutes it without opening the chat; its alerts make no banner or sound while another chat's do; nothing that calls you
// counts it, a question included (the Dock's and the menu bar's numbers, the title, Next, the bar's red), while its card
// keeps its unread count and its red edge; the app hears which chats are muted; and it outlasts a reload and a restart.
import { spawn } from 'node:child_process';
import { appendFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { makeFixture, replyLines } from '../fixture.mjs';

export const meta = { server: true, fixture: 'auto' };

const SETUP = `window.__posts = []; window.__banners = []; window.webkit = { messageHandlers: { hub: { postMessage: m => window.__posts.push(m) } } };
  window.Notification = class { static permission = 'granted'; static requestPermission() { return Promise.resolve('granted'); } constructor(title) { window.__banners.push(title); } close() {} };`;

export default async function (ctx) {
  const out = {}, sleeper = spawn('sleep', ['120'], { stdio: 'ignore' });
  await ctx.send('Page.addScriptToEvaluateOnNewDocument', { source: SETUP });
  await ctx.reload();
  const [a, b] = ctx.fixture.chats;
  const card = id => `document.querySelector('#slist > .card[data-id="${id}"]')`;
  const word = id => ctx.evaluate(`${card(id)}?.querySelector('.chip.cmute')?.textContent.trim() ?? null`);
  const lastState = () => ctx.evaluate(`JSON.stringify(window.__posts.filter(m => m.type === 'state').pop())`).then(JSON.parse);
  const muted = async id => (await ctx.server.api('api/sessions')).body.sessions.find(s => s.id === id).muted;
  const landed = chat => appendFileSync(chat.file, replyLines({ id: chat.id, cwd: chat.cwd, text: 'Done, have a look.', at: new Date() }).map(l => JSON.stringify(l)).join('\n') + '\n');
  const rightClick = id => ctx.evaluate(`(c => c.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: c.getBoundingClientRect().x + 30, clientY: c.getBoundingClientRect().y + 10 })))(${card(id)})`);
  const row = re => `[...document.querySelectorAll('#ctxm button')].find(b => ${re}.test(b.textContent))`;

  try {
    await ctx.waitFor(`${card(a.id)} && ${card(b.id)}`, { what: 'the two cards' });
    ctx.assert.equal(await word(a.id), null, 'no word on a card at rest');

    // ---- a right-click mutes it, and the card says so ----
    await rightClick(a.id);
    await ctx.waitFor(row('/^Mute/'), { what: "the card's menu row" });
    await ctx.evaluate(`${row('/^Mute/')}.click()`);
    await ctx.waitFor(`${card(a.id)}.querySelector('.chip.cmute')`, { what: 'the word on the card, at once' });
    ctx.assert.equal(await word(a.id), 'muted');
    ctx.assert.equal(await word(b.id), null, 'on that card alone');
    for (let i = 0; i < 20 && !(await muted(a.id)); i++) await ctx.sleep(100);
    ctx.assert.equal(await muted(a.id), true, 'the server has it');
    await rightClick(a.id);
    await ctx.waitFor(row('/^Unmute/'), { what: 'the row now offers the way back' });
    await ctx.evaluate(`document.querySelector('#ctxm').close()`);

    // ---- at every size, every part hidden, and the word within the card ----
    const shown = () => ctx.evaluate(`(c => { const w = c.querySelector('.chip.cmute'), r = w.getBoundingClientRect(), k = c.getBoundingClientRect(), s = getComputedStyle(w);
      return { display: s.display, visibility: s.visibility, opacity: s.opacity, inside: r.left >= k.left && r.right <= k.right && r.top >= k.top && r.bottom <= k.bottom, w: Math.round(r.width), h: Math.round(r.height) }; })(${card(a.id)})`);
    const fine = (s, where) => { ctx.assert.equal(s.visibility, 'visible', where); ctx.assert.equal(s.opacity, '1', where); ctx.assert.notEqual(s.display, 'none', where); ctx.assert.ok(s.inside, `${where}: within the card`); ctx.assert.ok(s.w >= 30 && s.h >= 12, `${where}: its size ${s.w}×${s.h}`); };
    out.sizes = {};
    for (const [v, size] of ['large', 'medium', 'compact'].entries()) {
      await ctx.evaluate(`document.querySelector('#cardsSize [data-v="${v}"]').click()`); await ctx.settle();
      out.sizes[size] = await shown(); fine(out.sizes[size], size);
      await ctx.shot(`size-${size}`, { x: 0, y: 0, width: 440, height: 300 });
    }
    await ctx.evaluate(`document.querySelector('#cardsEven').click()`); await ctx.settle();
    out.sizes.even = await shown(); fine(out.sizes.even, 'same height');
    await ctx.shot('size-even', { x: 0, y: 0, width: 440, height: 300 });
    await ctx.evaluate(`document.querySelector('#sessions').dataset.hide = 'prs rounds tickets faces agents'`); await ctx.settle();
    out.sizes.bare = await shown(); fine(out.sizes.bare, 'every optional part hidden');
    await ctx.evaluate(`delete document.querySelector('#sessions').dataset.hide; document.querySelector('#cardsEven').click()`);
    await ctx.settle();

    // ---- it reads at AA in both appearances: its ink on its tint, over what is behind them ----
    const RATIO = `(w => {
      const c = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
      const rgba = v => { c.clearRect(0, 0, 1, 1); c.fillStyle = v; c.fillRect(0, 0, 1, 1); const [r, g, b, a] = c.getImageData(0, 0, 1, 1).data; return { r, g, b, a: a / 255 }; };
      const over = (t, u) => ({ r: t.r * t.a + u.r * (1 - t.a), g: t.g * t.a + u.g * (1 - t.a), b: t.b * t.a + u.b * (1 - t.a), a: 1 });
      const layers = []; for (let e = w; e; e = e.parentElement) { const l = rgba(getComputedStyle(e).backgroundColor); layers.push(l); if (l.a === 1) break; }
      const ground = layers.reduceRight((u, t) => over(t, u), { r: 255, g: 255, b: 255, a: 1 });
      const lum = x => ['r', 'g', 'b'].map(k => { const v = x[k] / 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }).reduce((s, v, i) => s + v * [.2126, .7152, .0722][i], 0);
      const a = lum(over(rgba(getComputedStyle(w).color), ground)), b = lum(ground);
      return Math.round((Math.max(a, b) + .05) / (Math.min(a, b) + .05) * 100) / 100;
    })`;
    const ratio = id => ctx.evaluate(`${RATIO}(${card(id)}.querySelector('.chip.cmute'))`);
    out.ink = {};
    for (const look of ['dark', 'light']) {
      await ctx.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: look }] });
      await ctx.waitFor(`document.documentElement.dataset.theme === '${look}'`, { what: `the ${look} look` });
      await ctx.settle();
      out.ink[look] = await ratio(a.id);
      ctx.assert.ok(out.ink[look] >= 4.5, `the word at ${out.ink[look]}:1 in ${look}`);
      await ctx.shot(`look-${look}`, { x: 0, y: 0, width: 440, height: 300 });
    }

    // …and in every theme, each light one in its dark frame too, as the inks' test goes through them
    out.inkWorst = await ctx.evaluate(`(() => {
      const root = document.documentElement, was = { ...root.dataset }, calm = document.head.appendChild(Object.assign(document.createElement('style'), { textContent: '* { transition: none !important; }' }));
      const w = ${card(a.id)}.querySelector('.chip.cmute'), seen = [];
      for (const [k, dark] of window.peix.skins()) for (const fr of dark ? ['dark'] : ['light', 'dark']) {
        Object.assign(root.dataset, { skin: k, theme: dark ? 'dark' : 'light', frame: fr });
        seen.push({ look: k + ' ' + fr, ratio: ${RATIO}(w) });
      }
      delete root.dataset.skin; Object.assign(root.dataset, was); calm.remove();
      return seen.sort((x, y) => x.ratio - y.ratio).slice(0, 3);
    })()`);
    ctx.assert.ok(out.inkWorst[0].ratio >= 4.5, `the word under 4.5:1: ${JSON.stringify(out.inkWorst)}`);

    // ---- open, the word stays, in the open card's own ink ----
    await ctx.openChat(a.id); await ctx.settle();
    fine(await shown(), 'the open card');
    out.open = await ctx.evaluate(`getComputedStyle(${card(a.id)}.querySelector('.chip.cmute')).color`);
    ctx.assert.equal(out.open, 'rgb(255, 255, 255)', "white on the open card's colour");
    await ctx.shot('open', { x: 0, y: 0, width: 440, height: 300 });

    // ---- the header's menu: a toggle, which leaves the menu up ----
    const hrow = () => ctx.evaluate(`(b => ({ pressed: b.getAttribute('aria-pressed'), k: b.querySelector('.k').textContent, on: b.classList.contains('on') }))(document.querySelector('#muteBtn'))`);
    ctx.assert.deepEqual(await hrow(), { pressed: 'true', k: 'on', on: true }, 'the row says it is on');
    await ctx.evaluate(`document.querySelector('#moreBtn').click()`);
    await ctx.waitFor(`document.querySelector('#hmenu').open`, { what: 'the menu' });
    await ctx.settle();
    await ctx.shot('menu');
    await ctx.evaluate(`document.querySelector('#muteBtn').click()`);
    await ctx.waitFor(`!${card(a.id)}.querySelector('.chip.cmute')`, { what: 'the word gone' });
    ctx.assert.deepEqual(await hrow(), { pressed: 'false', k: 'off', on: false }, 'the row follows');
    ctx.assert.equal(await ctx.evaluate(`document.querySelector('#hmenu').open`), true, 'and the menu stays up');
    await ctx.evaluate(`document.querySelector('#muteBtn').click()`);
    await ctx.waitFor(`${card(a.id)}.querySelector('.chip.cmute')`, { what: 'muted again' });
    await ctx.evaluate(`document.querySelector('#hmenu').close()`);

    // ---- its alert makes no banner or sound; another chat's does ----
    await ctx.evaluate(`window.__banners.length = 0`);
    await ctx.openChat(b.id);   // the other chat in front: the muted one has its card's count to earn
    landed(a);
    await ctx.waitFor(`window.__posts.some(m => m.type === 'alert' && m.sessionId === '${a.id}')`, { what: "the muted chat's alert heard", timeout: 15000 });
    ctx.assert.equal(await ctx.evaluate(`window.__posts.find(m => m.type === 'alert' && m.sessionId === '${a.id}').quiet`), true, 'quiet to the app');
    ctx.assert.equal(await ctx.evaluate(`window.__banners.length`), 0, 'no banner in a browser');
    await ctx.waitFor(`${card(a.id)}.querySelector('.badge')`, { what: "its card's own count" });
    out.state = await lastState();
    ctx.assert.deepEqual(out.state.mutes, [a.id], 'the app hears which chats are muted');
    ctx.assert.equal(out.state.replied.some(r => r.id === a.id), false, 'not in what the Dock counts');
    ctx.assert.doesNotMatch(await ctx.evaluate(`document.title`), /^\(/, 'nor in the title');
    // …and another chat's does, on the same stream
    await ctx.openChat(a.id);
    landed(b);
    await ctx.waitFor(`window.__banners.length === 1`, { what: "the other chat's banner", timeout: 15000 });
    ctx.assert.equal(await ctx.evaluate(`window.__posts.find(m => m.type === 'alert' && m.sessionId === '${b.id}').quiet`), false, 'loud to the app');

    // ---- its alert makes no sound, with the board in front; another chat's does ----
    const at = sel => ctx.evaluate(`(r => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 }))(document.querySelector('${sel}').getBoundingClientRect())`);
    await ctx.cmd('Comma');
    await ctx.waitFor(`document.querySelector('#settings').open`, { what: 'the settings' });
    await ctx.settle();
    const so = await at('#soundsOn');   // a hand's click, so the page may make sound
    for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await ctx.send('Input.dispatchMouseEvent', { type, x: so.x, y: so.y, button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1 });
    await ctx.waitFor(`window.peix.motion().some(m => m.kind === 'sound:reply')`, { what: 'the sounds on', timeout: 3000 });
    await ctx.cmd('Comma');
    await ctx.waitFor(`!document.querySelector('#settings').open`, { what: 'the settings closed' });
    await ctx.sleep(1400);   // past the gap between two ticks
    const heard = `window.peix.motion().filter(m => m.at >= window.__m && m.kind === 'sound:needs-input').length`;
    const ring = (id, muted) => ctx.evaluate(`window.__m = Math.round(performance.now()); window.peix.alert({ kind: 'needs-input', sessionId: '${id}', project: 'p', title: 't', snippet: '', quiet: ${muted}, muted: ${muted} })`);
    await ctx.openChat(b.id);
    await ring(a.id, true);
    await ctx.sleep(500);
    ctx.assert.equal(await ctx.evaluate(heard), 0, 'none from the muted chat');
    await ctx.openChat(a.id);
    await ring(b.id, false);
    await ctx.waitFor(`${heard} > 0`, { what: "the other chat's, heard", timeout: 3000 });

    // ---- a question: the card red, nothing else calling ----
    const cwd = realpathSync(tmpdir());
    const { chats: [asker] } = makeFixture(ctx.fixture.dir, [{ cwd, title: 'Asks and is muted', prompt: 'go', reply: 'one question', at: new Date(Date.now() - 60_000), live: { pid: sleeper.pid, startedAt: Date.now() - 600_000, status: 'waiting', waitingFor: 'input needed', statusAt: Date.now() - 300_000 } }]);
    await ctx.waitFor(`${card(asker.id)}?.classList.contains('asking')`, { what: 'the chat asking', timeout: 15000 });
    await ctx.waitFor(`document.querySelector('#sbar .seg.ask')?.textContent.includes('1 asking')`, { what: "the bar's count", timeout: 15000 });
    await ctx.evaluate(`window.peixMute(${JSON.stringify(asker.id)})`);   // the banner's action
    await ctx.waitFor(`${card(asker.id)}.querySelector('.chip.cmute')`, { what: 'the word, from the banner' });
    await ctx.waitFor(`!document.querySelector('#sbar .seg.ask')`, { what: "off the bar's count" });
    ctx.assert.equal(await ctx.evaluate(`${card(asker.id)}.classList.contains('asking')`), true, 'its card still asks');
    ctx.assert.equal(await ctx.evaluate(`getComputedStyle(${card(asker.id)}.querySelector('.state.needs-input')).display !== 'none'`), true, 'and says what');
    await ctx.settle();
    await ctx.shot('asking', { x: 0, y: 0, width: 440, height: 420 });
    out.askingInk = {};
    for (const look of ['light', 'dark']) {
      await ctx.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: look }] });
      await ctx.waitFor(`document.documentElement.dataset.theme === '${look}'`, { what: `the ${look} look` });
      await ctx.settle();
      out.askingInk[look] = await ratio(asker.id);
      ctx.assert.ok(out.askingInk[look] >= 4.5, `the word on a card asking, ${out.askingInk[look]}:1 in ${look}`);
      await ctx.shot(`asking-${look}`, { x: 0, y: 0, width: 440, height: 420 });
    }
    out.asking = await lastState();
    ctx.assert.equal(out.asking.needs.length, 0, 'not in what the Dock, the menu bar and the bounce read');
    ctx.assert.notEqual(out.asking.next?.id, asker.id, 'nor Next');

    // ---- a click on the word unmutes it, and opens nothing ----
    const current = await ctx.evaluate(`window.peix.state().current`);
    await ctx.evaluate(`${card(asker.id)}.querySelector('.chip.cmute').click()`);
    await ctx.waitFor(`!${card(asker.id)}.querySelector('.chip.cmute')`, { what: 'the word gone' });
    ctx.assert.equal(await ctx.evaluate(`window.peix.state().current`), current, 'the chat in front stays');
    await ctx.waitFor(`document.querySelector('#sbar .seg.ask')?.textContent.includes('1 asking')`, { what: 'the bar counting it again' });
    ctx.assert.equal((await lastState()).needs[0]?.id, asker.id, 'and the app');

    // ---- the launcher has it, for the open chat ----
    await ctx.openChat(b.id);
    await ctx.key('KeyL');
    await ctx.waitFor(`document.querySelector('#pick').open`, { what: 'the launcher' });
    await ctx.fill('#pickq', 'mute it');
    await ctx.waitFor(`[...document.querySelectorAll('#picklist .pkrow')].some(r => /Mute it/.test(r.textContent))`, { what: 'the row' });
    await ctx.evaluate(`[...document.querySelectorAll('#picklist .pkrow')].find(r => /Mute it/.test(r.textContent)).click()`);
    await ctx.waitFor(`${card(b.id)}.querySelector('.chip.cmute')`, { what: 'muted from the launcher' });

    // ---- kept: over a reload and a restart ----
    await ctx.reload();
    ctx.assert.equal(await word(a.id), 'muted', 'after a reload');
    await ctx.server.restart();
    await ctx.reload();
    ctx.assert.equal(await word(a.id), 'muted', 'after a restart');
    ctx.assert.equal(await word(b.id), 'muted', 'the other too');
    return out;
  } finally { sleeper.kill(); }
}
