// Pictures in the chat (2026-11-25), on a fake GitHub (scripts/fakes/fakegithub.mjs): the admin's board, in a chat where
// ana dropped a screenshot on GitHub's page (its <img> tag, as GitHub writes it) and sent a GIF as markdown, beside a
// picture on a host the chat does not fetch from and a raw <img> naming none. What this checks: the two pictures drawn
// from the board's own bytes (blob: addresses, never their hosts — the page's policy would refuse those anyway), at their
// size; the other host's a word and the raw tag its text; a click shows one large, and the original is a button away;
// a picture pasted into the box goes up at once into the tray, ⏎ sends it with the words, GitHub's comment carries it as
// markdown, and the message is drawn from what was pasted; one dropped on the panel joins the tray; × takes one back;
// a picture of a repo nobody shared with you says so, and opens in your browser; under reduced motion a GIF is still.
import { waitFor } from '../../lib/testserver.mjs';
import { startFakeGitHub } from '../fakes/fakegithub.mjs';

// two pictures of a few pixels: a red PNG 40 × 24 and a GIF of two frames, 30 × 30
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAACgAAAAYCAIAAAAH5iiXAAAAKElEQVR4nGO4Y2M0IIhh1OJRi0ctHrV41OJRi0ctHrV41OJRi4ePxQAWWdW9D91O3QAAAABJRU5ErkJggg==', 'base64');
const GIF = Buffer.from('R0lGODdhHgAeAKIAAAAAADNm///MGv///wAAAAAAAAAAAAAAACH/C05FVFNDQVBFMi4wAwEAAAAh+QQFKAAEACwAAAAAHgAeAAADHSi63P4wykmrvTjrzbv/YCiOZGmeaKqubOu+cPwmACH5BAUoAAQALAAAAAAeAB4AAAMdGLrc/jDKSau9OOvNu/9gKI5kaZ5oqq5s675w/CYAOw==', 'base64');
const gh = await startFakeGitHub({ users: ['me', 'ana'], orgs: { 'acme-chat': ['me'] }, repos: {
  'acme-chat/room': { perms: { ana: 'pull' }, rooms: [{ title: 'Chat', comments: [['ana', 'look at this']] }] }, 'acme/secret': { perms: {} } } });
const shot = gh.asset('acme-chat/room', PNG), party = gh.asset('acme-chat/room', GIF, 'image/gif'), hidden = gh.asset('acme/secret', PNG);
gh.say('acme-chat/room', 1, 'ana', `<img width="40" height="24" alt="the error" src="${shot}">`);
gh.say('acme-chat/room', 1, 'ana', `![party](${party})\n\nand ![elsewhere](https://evil.example/p.png) and <img src=x onerror="window.pwned=1">`);
gh.say('acme-chat/room', 1, 'ana', `![not yours](${hidden})`);

export const meta = { server: true, fixture: 'auto', env: { GITHUB_API: gh.url, FAKEGH_VIEWER: 'me', CHAT_FAST_MS: '250', CHAT_SLOW_MS: '250', CHAT_GAP_MS: '30', CHAT_PICS_AGAIN_MS: '200' } };

export default async function (ctx) {
  const out = {};
  try {
    const q = sel => `document.querySelector(${JSON.stringify(sel)})`;
    const rect = sel => ctx.evaluate(`(r => ({ x: Math.max(0, r.left - 8), y: Math.max(0, r.top - 8), width: r.width + 16, height: r.height + 16 }))(${q(sel)}.getBoundingClientRect())`);
    const pics = () => ctx.evaluate(`JSON.stringify([...document.querySelectorAll('#rmlog .rmpic')].map(p => ({ url: p.dataset.pic, on: p.classList.contains('on'), bad: p.classList.contains('bad'),
      src: p.querySelector('img')?.getAttribute('src')?.slice(0, 5) || null, w: p.querySelector('img')?.width || 0, h: p.querySelector('img')?.height || 0, text: p.textContent })))`).then(JSON.parse);
    await ctx.server.api('api/config', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat: { repo: 'acme-chat/room' } }) });
    await ctx.waitFor(`!!${q('#sbChat')} && !/still being read/.test(${q('#sbChat')}.title)`, { what: 'the chat in the status bar' });
    await ctx.evaluate(`${q('#sbChat')}.click()`);
    await ctx.waitFor(`document.querySelectorAll('#rmlog .rmmsg').length === 4`, { what: 'the chat\'s messages' });

    // the pictures drawn from the board's bytes, at their size; the other host's a word, the raw tag its text
    await ctx.waitFor(`[...document.querySelectorAll('#rmlog .rmpic')].every(p => p.classList.contains('on'))`, { what: 'every picture filled' });
    out.pics = await pics();
    ctx.assert.deepEqual(out.pics.map(p => [p.url, p.on, p.bad, p.src, p.w, p.h]), [[shot, true, false, 'blob:', 40, 24], [party, true, false, 'blob:', 30, 30], [hidden, true, true, null, 0, 0]]);
    ctx.assert.match(out.pics[2].text, /not yours · not shown/);
    out.text = await ctx.evaluate(`[...document.querySelectorAll('#rmlog .rmbody')].map(b => b.textContent).join(' | ')`);
    ctx.assert.match(out.text, /\[image: elsewhere\]/);
    ctx.assert.match(out.text, /<img src=x onerror="window\.pwned=1">/, 'a raw tag naming no picture is its text');
    ctx.assert.equal(await ctx.evaluate('!!window.pwned'), false);
    ctx.assert.equal(await ctx.evaluate(`[...document.querySelectorAll('#room img')].some(i => /^https?:/.test(i.getAttribute('src') || ''))`), false, 'no picture asked of its host by the page');
    await ctx.settle(); await ctx.shot('1-room', await rect('#room'));

    // one large, and back; the one nobody shared opens in the browser instead
    await ctx.evaluate(`${q('#rmlog .rmpic.on:not(.bad)')}.click()`);
    await ctx.waitFor(`${q('#rmview')}.open && ${q('#rmviewImg')}.complete && ${q('#rmviewImg')}.naturalWidth === 40`, { what: 'the picture large' });
    ctx.assert.equal(await ctx.evaluate(`${q('#rmviewAlt')}.textContent`), 'the error');
    await ctx.settle(); await ctx.shot('2-large');
    await ctx.evaluate(`${q('#rmviewImg')}.click()`);
    await ctx.waitFor(`!${q('#rmview')}.open`, { what: 'the large picture let go' });

    // a picture pasted: into the tray, up at once; ⏎ sends it with the words, as markdown on GitHub
    const file = (name, b, type) => `new File([Uint8Array.from(atob(${JSON.stringify(b.toString('base64'))}), c => c.charCodeAt(0))], ${JSON.stringify(name)}, { type: ${JSON.stringify(type)} })`;
    await ctx.evaluate(`(() => { const dt = new DataTransfer(); dt.items.add(${file('Screenshot 2026-11-25.png', PNG, 'image/png')}); ${q('#rmbox')}.focus(); ${q('#rmbox')}.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); })()`);
    await ctx.waitFor(`document.querySelectorAll('#rmpics .rmtp').length === 1 && !${q('#rmpics .rmtp')}.classList.contains('up')`, { what: 'the pasted picture up' });
    ctx.assert.equal(await ctx.evaluate(`${q('#rmpics')}.hidden`), false);
    // one dropped on the panel joins it; × takes it back
    await ctx.evaluate(`(() => { const dt = new DataTransfer(); dt.items.add(${file('party.gif', GIF, 'image/gif')}); ${q('#rmlog')}.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true })); })()`);
    await ctx.waitFor(`document.querySelectorAll('#rmpics .rmtp').length === 2`, { what: 'the dropped picture in the tray' });
    ctx.assert.equal(await ctx.evaluate(`${q('#chat')}.classList.contains('dropping')`), false, 'not the drawer\'s drop');
    await ctx.settle(); await ctx.shot('3-tray', await rect('#room'));
    await ctx.evaluate(`document.querySelectorAll('#rmpics .rmtp [data-rm="unpic"]')[1].click()`);
    await ctx.waitFor(`document.querySelectorAll('#rmpics .rmtp').length === 1`, { what: 'the GIF taken back' });
    await ctx.fill('#rmbox', 'the same error here');
    await ctx.evaluate(`${q('#rmbox')}.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }))`);
    ctx.assert.equal(await ctx.evaluate(`${q('#rmpics')}.hidden`), true, 'the tray empty once sent');
    const sent = await waitFor(async () => { const c = gh.repo('acme-chat/room').issues[0].comments.at(-1); return c.user.login === 'me' && c.body; }, { what: 'the message on GitHub' });
    ctx.assert.match(sent, /^the same error here\n\n!\[Screenshot 2026-11-25\]\(https:\/\/github\.com\/user-attachments\/assets\/[0-9a-f-]{36}\)$/);
    const url = sent.match(/\((https:[^)]+)\)/)[1];
    ctx.assert.equal(gh.assets.get(url.split('/').pop()).repo, 'acme-chat/room', 'the admin\'s against the chat itself');
    await ctx.waitFor(`[...document.querySelectorAll('#rmlog .rmmsg:not(.out) .rmpic.on')].some(p => p.dataset.pic === ${JSON.stringify(url)})`, { what: 'the message drawn with its picture' });
    out.mine = await ctx.evaluate(`(p => ({ src: p.querySelector('img').getAttribute('src').slice(0, 5), w: p.querySelector('img').width }))([...document.querySelectorAll('#rmlog .rmpic')].find(p => p.dataset.pic === ${JSON.stringify(url)}))`);
    ctx.assert.deepEqual(out.mine, { src: 'blob:', w: 40 });
    ctx.assert.equal(gh.calls.filter(c => c.startsWith('POST /markdown')).length, 1, 'yours drawn from what was pasted: GitHub asked once, for the three at first');
    await ctx.settle(); await ctx.shot('4-sent', await rect('#room'));

    // under reduced motion a GIF is its first frame, moving under the pointer — the switch followed as it is turned
    await ctx.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    out.still = await ctx.waitFor(`(p => p?.classList.contains('still') && JSON.stringify({ imgs: p.querySelectorAll('img').length, shown: [...p.querySelectorAll('img')].map(i => getComputedStyle(i).display) }))([...document.querySelectorAll('#rmlog .rmpic')].find(p => p.dataset.pic === ${JSON.stringify(party)}))`, { what: 'the GIF still' }).then(JSON.parse);
    ctx.assert.deepEqual(out.still, { imgs: 2, shown: ['none', 'block'] }, 'the moving one hidden, its still shown');
    ctx.assert.equal(await ctx.evaluate(`[...document.querySelectorAll('#rmlog .rmpic.still')].length`), 1, 'a PNG has no still');
    return out;
  } finally { await gh.close(); }
}
