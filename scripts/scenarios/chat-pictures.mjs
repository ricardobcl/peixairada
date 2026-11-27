// Pictures in the chat (2026-11-25), on a fake GitHub (scripts/fakes/fakegithub.mjs): the admin's board, in a chat where
// ana dropped a screenshot on GitHub's page (its <img> tag, as GitHub writes it) and sent a GIF as markdown, beside a
// picture on a host the chat does not fetch from and a raw <img> naming none. What this checks: the two pictures drawn
// from the board's own bytes (blob: addresses, never their hosts — the page's policy would refuse those anyway), at their
// size; the other host's a word and the raw tag its text; a click shows one large, and the original is a button away;
// a picture pasted into the box goes up at once into the tray, ⏎ sends it with the words, GitHub's comment carries it as
// markdown, and the message is drawn from what was pasted; one dropped on the panel joins the tray; × takes one back;
// a picture of a repo nobody shared with you says so, and opens in your browser; a screenshot's size is shown large
// whole, fitted to the window; under reduced motion a GIF is still.
import { deflateSync } from 'node:zlib';
import { waitFor } from '../../lib/testserver.mjs';
import { startFakeGitHub } from '../fakes/fakegithub.mjs';

// two pictures of a few pixels: a red PNG 40 × 24 and a GIF of two frames, 30 × 30
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAACgAAAAYCAIAAAAH5iiXAAAAKElEQVR4nGO4Y2M0IIhh1OJRi0ctHrV41OJRi0ctHrV41OJRi4ePxQAWWdW9D91O3QAAAABJRU5ErkJggg==',
  'base64',
);

const GIF = Buffer.from(
  'R0lGODdhHgAeAKIAAAAAADNm///MGv///wAAAAAAAAAAAAAAACH/C05FVFNDQVBFMi4wAwEAAAAh+QQFKAAEACwAAAAAHgAeAAADHSi63P4wykmrvTjrzbv/YCiOZGmeaKqubOu+cPwmACH5BAUoAAQALAAAAAAeAB4AAAMdGLrc/jDKSau9OOvNu/9gKI5kaZ5oqq5s675w/CYAOw==',
  'base64',
);

// and a screenshot's size, 3456 × 2234 in two colours: the large view must fit it in the window, whole
const BIG = (() => {
  const w = 3456;
  const h = 2234;

  const row = Buffer.concat([
    Buffer.from([0]),
    Buffer.from(new Array(w).fill(0).flatMap((_, x) => (x < w / 2 ? [40, 120, 200] : [230, 180, 40]))),
  ]);

  const crc = b => {
    let c = ~0;

    for (const x of b) {
      c ^= x;
      for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }

    return ~c >>> 0;
  };

  const chunk = (t, d) => {
    const l = Buffer.alloc(4);
    const c = Buffer.alloc(4);
    const td = Buffer.concat([Buffer.from(t), d]);

    l.writeUInt32BE(d.length);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([l, td, c]);
  };

  const ihdr = Buffer.alloc(13);

  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(new Array(h).fill(row)))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
})();

const gh = await startFakeGitHub({
  users: ['me', 'ana'],
  orgs: { 'acme-chat': ['me'] },
  repos: {
    'acme-chat/room': { perms: { ana: 'pull' }, rooms: [{ title: 'Chat', comments: [['ana', 'look at this']] }] },
    'acme/secret': { perms: {} },
  },
});

const shot = gh.asset('acme-chat/room', PNG);
const party = gh.asset('acme-chat/room', GIF, 'image/gif');
const hidden = gh.asset('acme/secret', PNG);

gh.say('acme-chat/room', 1, 'ana', `<img width="40" height="24" alt="the error" src="${shot}">`);

gh.say(
  'acme-chat/room',
  1,
  'ana',
  `![party](${party})\n\nand ![elsewhere](https://evil.example/p.png) and <img src=x onerror="window.pwned=1">`,
);

gh.say('acme-chat/room', 1, 'ana', `![not yours](${hidden})`);
const big = gh.asset('acme-chat/room', BIG);

gh.say('acme-chat/room', 1, 'ana', `![the whole screen](${big})`);

export const meta = {
  server: true,
  fixture: 'auto',
  env: {
    GITHUB_API: gh.url,
    FAKEGH_VIEWER: 'me',
    CHAT_FAST_MS: '250',
    CHAT_SLOW_MS: '250',
    CHAT_GAP_MS: '30',
    CHAT_PICS_AGAIN_MS: '200',
  },
};

export default async function (ctx) {
  const out = {};

  try {
    const q = sel => `document.querySelector(${JSON.stringify(sel)})`;

    const rect = sel =>
      ctx.evaluate(
        `(r => ({ x: Math.max(0, r.left - 8), y: Math.max(0, r.top - 8), width: r.width + 16, height: r.height + 16 }))(${q(sel)}.getBoundingClientRect())`,
      );

    const pics = () =>
      ctx
        .evaluate(
          `JSON.stringify([...document.querySelectorAll('#rmlog .rmpic')].map(p => ({ url: p.dataset.pic, on: p.classList.contains('on'), bad: p.classList.contains('bad'),
      src: p.querySelector('img')?.getAttribute('src')?.slice(0, 5) || null, w: p.querySelector('img')?.naturalWidth || 0, h: p.querySelector('img')?.naturalHeight || 0, text: p.textContent })))`,
        )
        .then(JSON.parse);

    await ctx.server.api('api/config', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat: { repo: 'acme-chat/room' } }),
    });

    await ctx.waitFor(`!!${q('#sbChat')} && !/still being read/.test(${q('#sbChat')}.title)`, {
      what: 'the chat in the status bar',
    });

    await ctx.evaluate(`${q('#sbChat')}.click()`);
    await ctx.waitFor(`document.querySelectorAll('#rmlog .rmmsg').length === 5`, { what: "the chat's messages" });

    // the pictures drawn from the board's bytes, at their size; the other host's a word, the raw tag its text
    await ctx.waitFor(`[...document.querySelectorAll('#rmlog .rmpic')].every(p => p.classList.contains('on'))`, {
      what: 'every picture filled',
    });

    out.pics = await pics();

    ctx.assert.deepEqual(
      out.pics.map(p => [p.url, p.on, p.bad, p.src, p.w, p.h]),
      [
        [shot, true, false, 'blob:', 40, 24],
        [party, true, false, 'blob:', 30, 30],
        [hidden, true, true, null, 0, 0],
        [big, true, false, 'blob:', 3456, 2234],
      ],
    );

    ctx.assert.match(out.pics[2].text, /not yours · not shown/);

    out.text = await ctx.evaluate(
      `[...document.querySelectorAll('#rmlog .rmbody')].map(b => b.textContent).join(' | ')`,
    );

    ctx.assert.match(out.text, /\[image: elsewhere\]/);
    ctx.assert.match(out.text, /<img src=x onerror="window\.pwned=1">/, 'a raw tag naming no picture is its text');
    ctx.assert.equal(await ctx.evaluate('!!window.pwned'), false);

    ctx.assert.equal(
      await ctx.evaluate(
        `[...document.querySelectorAll('#room img')].some(i => /^https?:/.test(i.getAttribute('src') || ''))`,
      ),
      false,
      'no picture asked of its host by the page',
    );

    await ctx.settle();
    await ctx.shot('1-room', await rect('#room'));

    // one large, and back; the one nobody shared opens in the browser instead
    await ctx.evaluate(`${q('#rmlog .rmpic.on:not(.bad)')}.click()`);

    await ctx.waitFor(`${q('#rmview')}.open && ${q('#rmviewImg')}.complete && ${q('#rmviewImg')}.naturalWidth === 40`, {
      what: 'the picture large',
    });

    ctx.assert.equal(await ctx.evaluate(`${q('#rmviewAlt')}.textContent`), 'the error');
    await ctx.settle();
    await ctx.shot('2-large');
    await ctx.evaluate(`${q('#rmviewImg')}.click()`);
    await ctx.waitFor(`!${q('#rmview')}.open`, { what: 'the large picture let go' });

    // a screenshot's size: fitted to the window, whole — its box as wide as it, never the dialogs' 600 px cropping it
    await ctx.evaluate(
      `[...document.querySelectorAll('#rmlog .rmpic')].find(p => p.dataset.pic === ${JSON.stringify(big)}).click()`,
    );

    await ctx.waitFor(
      `${q('#rmview')}.open && ${q('#rmviewImg')}.complete && ${q('#rmviewImg')}.naturalWidth === 3456`,
      { what: 'the big picture large' },
    );

    await ctx.settle();

    out.large = await ctx
      .evaluate(
        `JSON.stringify((r => ({ win: [innerWidth, innerHeight], dlg: r('#rmview'), img: r('#rmviewImg') }))(s => { const b = document.querySelector(s).getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)]; }))`,
      )
      .then(JSON.parse);

    const [dx, dy, dw, dh] = out.large.dlg;
    const [ix, iy, iw, ih] = out.large.img;

    ctx.assert.ok(
      ix >= dx && iy >= dy && ix + iw <= dx + dw && iy + ih <= dy + dh,
      `the picture inside its box, uncropped: ${JSON.stringify(out.large)}`,
    );

    ctx.assert.ok(
      dx >= 0 && dy >= 0 && dx + dw <= out.large.win[0] && dy + dh <= out.large.win[1],
      'the box inside the window',
    );

    ctx.assert.ok(Math.abs(iw / ih - 3456 / 2234) < 0.01, 'its shape kept');

    ctx.assert.ok(
      iw >= dw - 2 && iw > 600,
      `as wide as its box, past the dialogs' 600 px: ${JSON.stringify(out.large)}`,
    );

    await ctx.shot('2-large-big');
    await ctx.evaluate(`${q('#rmviewImg')}.click()`);
    await ctx.waitFor(`!${q('#rmview')}.open`, { what: 'the big picture let go' });

    // a picture pasted: into the tray, up at once; ⏎ sends it with the words, as markdown on GitHub
    const file = (name, b, type) =>
      `new File([Uint8Array.from(atob(${JSON.stringify(b.toString('base64'))}), c => c.charCodeAt(0))], ${JSON.stringify(name)}, { type: ${JSON.stringify(type)} })`;

    await ctx.evaluate(
      `(() => { const dt = new DataTransfer(); dt.items.add(${file('Screenshot 2026-11-25.png', PNG, 'image/png')}); ${q('#rmbox')}.focus(); ${q('#rmbox')}.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); })()`,
    );

    await ctx.waitFor(
      `document.querySelectorAll('#rmpics .rmtp').length === 1 && !${q('#rmpics .rmtp')}.classList.contains('up')`,
      { what: 'the pasted picture up' },
    );

    ctx.assert.equal(await ctx.evaluate(`${q('#rmpics')}.hidden`), false);

    // one dropped on the panel joins it; × takes it back
    await ctx.evaluate(
      `(() => { const dt = new DataTransfer(); dt.items.add(${file('party.gif', GIF, 'image/gif')}); ${q('#rmlog')}.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true })); })()`,
    );

    await ctx.waitFor(`document.querySelectorAll('#rmpics .rmtp').length === 2`, {
      what: 'the dropped picture in the tray',
    });

    ctx.assert.equal(
      await ctx.evaluate(`${q('#chat')}.classList.contains('dropping')`),
      false,
      "not the drawer's drop",
    );

    await ctx.settle();
    await ctx.shot('3-tray', await rect('#room'));
    await ctx.evaluate(`document.querySelectorAll('#rmpics .rmtp [data-rm="unpic"]')[1].click()`);
    await ctx.waitFor(`document.querySelectorAll('#rmpics .rmtp').length === 1`, { what: 'the GIF taken back' });
    await ctx.fill('#rmbox', 'the same error here');

    await ctx.evaluate(
      `${q('#rmbox')}.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }))`,
    );

    ctx.assert.equal(await ctx.evaluate(`${q('#rmpics')}.hidden`), true, 'the tray empty once sent');

    const sent = await waitFor(
      async () => {
        const c = gh.repo('acme-chat/room').issues[0].comments.at(-1);

        return c.user.login === 'me' && c.body;
      },
      { what: 'the message on GitHub' },
    );

    ctx.assert.match(
      sent,
      /^the same error here\n\n!\[Screenshot 2026-11-25\]\(https:\/\/github\.com\/user-attachments\/assets\/[0-9a-f-]{36}\)$/,
    );

    const url = sent.match(/\((https:[^)]+)\)/)[1];

    ctx.assert.equal(gh.assets.get(url.split('/').pop()).repo, 'acme-chat/room', "the admin's against the chat itself");

    await ctx.waitFor(
      `[...document.querySelectorAll('#rmlog .rmmsg:not(.out) .rmpic.on')].some(p => p.dataset.pic === ${JSON.stringify(url)})`,
      { what: 'the message drawn with its picture' },
    );

    out.mine = await ctx.evaluate(
      `(p => ({ src: p.querySelector('img').getAttribute('src').slice(0, 5), w: p.querySelector('img').width }))([...document.querySelectorAll('#rmlog .rmpic')].find(p => p.dataset.pic === ${JSON.stringify(url)}))`,
    );

    ctx.assert.deepEqual(out.mine, { src: 'blob:', w: 40 });

    ctx.assert.equal(
      gh.calls.filter(c => c.startsWith('POST /markdown')).length,
      1,
      'yours drawn from what was pasted: GitHub asked once, for the four at first',
    );

    await ctx.settle();
    await ctx.shot('4-sent', await rect('#room'));

    // under reduced motion a GIF is its first frame, moving under the pointer — the switch followed as it is turned
    await ctx.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });

    out.still = await ctx
      .waitFor(
        `(p => p?.classList.contains('still') && JSON.stringify({ imgs: p.querySelectorAll('img').length, shown: [...p.querySelectorAll('img')].map(i => getComputedStyle(i).display) }))([...document.querySelectorAll('#rmlog .rmpic')].find(p => p.dataset.pic === ${JSON.stringify(party)}))`,
        { what: 'the GIF still' },
      )
      .then(JSON.parse);

    ctx.assert.deepEqual(out.still, { imgs: 2, shown: ['none', 'block'] }, 'the moving one hidden, its still shown');

    ctx.assert.equal(
      await ctx.evaluate(`[...document.querySelectorAll('#rmlog .rmpic.still')].length`),
      1,
      'a PNG has no still',
    );

    return out;
  } finally {
    await gh.close();
  }
}
