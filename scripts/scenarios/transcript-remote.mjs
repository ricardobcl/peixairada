// Nothing in a transcript is fetched from elsewhere (2026-10-14): an image is loaded only from data: (md() makes any
// other a link) — and neither may anything else DOMPurify lets through on its own: a srcset, a picture's source, a
// video's poster, an audio's src, a table's background, an <input type=image>, an SVG <image>, <feImage> or <use>, a
// url() in an SVG attribute. What this checks: a reply carrying each, pointed at a probe server this scenario starts,
// opened on the board — the probe hears nothing, and the log holds none of those elements or attributes, while a data:
// image and a task list's checkbox stay.
import { createServer } from 'node:http';
import { makeFixture } from '../fixture.mjs';

// The page's policy is the wall behind md() here (2026-11-06): a <track> in DOMPurify's own parse of the reply is refused
// by it (a report, no fetch — the probe heard nothing before it too), so the run reads the reports itself, below.
export const meta = { server: true, fixture: 'auto', csp: false };

export default async function (ctx) {
  const out = {};
  const cwd = '/Users/me/proj/remote-repo';

  const hits = [];

  const probe = createServer((req, res) => {
    hits.push(req.url);
    res.writeHead(404);
    res.end();
  });

  await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));

  try {
    const PROBE = `http://127.0.0.1:${probe.address().port}`;
    const GIF = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

    const reply = [
      'The vectors, one a paragraph:',
      '',
      `![md](${PROBE}/md)`,
      '',
      `ok <img alt="srcset" src="${GIF}" srcset="${PROBE}/srcset 1x">`,
      '',
      `<picture><source srcset="${PROBE}/picture"><img alt="pic" src="${GIF}"></picture>`,
      '',
      `<video poster="${PROBE}/poster" src="${PROBE}/videosrc"><track default src="${PROBE}/track"></video>`,
      '',
      `<audio src="${PROBE}/audio"></audio>`,
      '',
      `<table background="${PROBE}/tablebg"><tr><td background="${PROBE}/tdbg">x</td></tr></table>`,
      '',
      `<input type="image" src="${PROBE}/input">`,
      '',
      `<svg width="20" height="20"><image href="${PROBE}/svgimage" width="10" height="10"/><image xlink:href="${PROBE}/svgxlink" width="10" height="10"/></svg>`,
      '',
      `<svg width="20" height="20"><filter id="f"><feImage href="${PROBE}/feimage"/></filter><rect width="5" height="5" filter="url(#f)"/></svg>`,
      '',
      `<svg width="20" height="20"><use href="${PROBE}/use.svg#a"/></svg>`,
      '',
      `<svg width="20" height="20"><rect width="9" height="9" fill="url(${PROBE}/fill.svg#p)" mask="url(${PROBE}/mask.svg#m)" clip-path="url(${PROBE}/clip.svg#c)" filter="url(${PROBE}/filter.svg#f)"/><rect width="9" height="9" fill="\\75 rl(${PROBE}/escaped.svg#p)"/></svg>`,
      '',
      `the inline one stays: <img alt="inline" src="${GIF}">`,
      '',
      '- [x] a task done',
      '- [ ] a task to do',
    ].join('\n');

    const { chats } = makeFixture(ctx.fixture.dir, [
      { cwd, title: 'Remote', prompt: 'show me', reply, at: new Date() },
    ]);

    await ctx.waitFor(`!!document.querySelector('#slist > .card[data-id="${chats[0].id}"]')`, { what: 'the card' });
    await ctx.openChat(chats[0].id);
    await ctx.waitFor(`!!document.querySelector('#log .msg.assistant')`, { what: 'the reply drawn' });
    await ctx.sleep(1500); // whatever loads on sight has asked by now
    out.hits = hits;

    out.left = await ctx
      .evaluate(
        `JSON.stringify((log => ({
      tags: [...new Set([...log.querySelectorAll('video, audio, source, track, picture, image, feImage, use, input:not([type="checkbox"])')].map(e => e.localName))],
      attrs: [...new Set([...log.querySelectorAll('*')].flatMap(e => [...e.attributes].filter(a => /^(srcset|poster|background)$/i.test(a.name) || /url\\(\\s*['"]?\\s*[^\\s'"#]|\\\\/i.test(a.value)).map(a => e.localName + '[' + a.name + ']')))],
      imgs: [...log.querySelectorAll('img')].map(i => i.alt + ':' + i.getAttribute('src').slice(0, 10)),
      boxes: log.querySelectorAll('input[type="checkbox"]').length,
      links: [...log.querySelectorAll('a')].filter(a => a.textContent.startsWith('🖼')).length,
    }))(document.querySelector('#log')))`,
      )
      .then(JSON.parse);

    ctx.assert.deepEqual(out.hits, [], 'the probe heard nothing: no part of the reply was fetched from elsewhere');
    ctx.assert.deepEqual(out.left.tags, [], 'no media, picture, SVG image or image input left in the log');
    ctx.assert.deepEqual(out.left.attrs, [], 'no srcset, poster, background or url() to elsewhere left in the log');
    ctx.assert.ok(out.left.imgs.includes('inline:data:image'), 'a data: image stays an image');
    ctx.assert.equal(out.left.boxes, 2, "a task list's checkboxes stay");
    ctx.assert.ok(out.left.links >= 1, 'the markdown image is a link to it');
    out.refused = ctx.console.filter(line => /CSP violation/.test(line));

    ctx.assert.ok(
      out.refused.every(line => line.includes(PROBE)),
      "what the page's policy refused was the probe's alone",
    );

    return out;
  } finally {
    probe.close();
  }
}
