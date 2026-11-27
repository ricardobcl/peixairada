// Whether a page in the pane sits where it belongs, from the window's own pixels (2026-11-04), for the real shell's checks
// (scripts/shell.mjs): `pagePlaced` is the verdict, which `npm test` holds with no window. Each half's strip is painted
// one solid colour and the page served in another; `down` is the column through the half's middle as runs of one colour,
// in points from the window's top, `across` the row through the page's. The page says in its own CSS px where its strip
// and the half's body are; `zoom` is what a CSS px is in points.
export const STRIP_INK = [0, 255, 255];
const SLACK = 1.5; // points: a rect from the page is rounded, a run ends on a pixel

export const near = (color, target) => color.every((channel, index) => Math.abs(channel - target[index]) <= 24);

const longest = (runs, ink) =>
  runs.filter(run => near(run.c, ink)).sort((left, right) => right.len - left.len)[0] || null;

export const inkOf = hex => [0, 2, 4].map(offset => parseInt(hex.slice(offset, offset + 2), 16));
const pt = value => +value.toFixed(1);

/** { ok, problems, seen } — every way the page is out of place, in words, and what was measured. */
export function pagePlaced({ down, across, strip, body, zoom, ink, stripInk = STRIP_INK }) {
  const page = longest(down, ink);

  const bar =
    page && down.filter(run => near(run.c, stripInk) && run.at < page.at).sort((left, right) => right.at - left.at)[0];

  const row = longest(across, ink);
  const problems = [];

  if (!page) {
    return { ok: false, problems: ['the page is nowhere in the half: none of its colour down the column'], seen: {} };
  }

  const want = {
    strip: strip.height * zoom,
    pageH: body.height * zoom,
    pageW: body.width * zoom,
    left: body.left * zoom,
  };

  const seen = {
    stripH: pt(bar?.len || 0),
    pageTop: pt(page.at),
    pageH: pt(page.len),
    pageLeft: pt(row?.at ?? -1),
    pageW: pt(row?.len ?? 0),
  };

  if (!bar) problems.push(`no strip above the page: ${pt(want.strip)} pt of it should show`);
  else {
    seen.pageStarts = pt(bar.at - strip.top * zoom); // where WebKit put the page's y = 0, down the window

    if (bar.len < want.strip - SLACK) {
      problems.push(`the strip shows ${pt(bar.len)} of its ${pt(want.strip)} pt: the page is over it`);
    }

    const gap = page.at - (bar.at + bar.len);

    if (Math.abs(gap) > SLACK) problems.push(`${pt(gap)} pt between the strip's foot and the page`);
  }

  if (Math.abs(page.len - want.pageH) > SLACK) {
    problems.push(`the page is ${pt(page.len)} pt tall, its half's body ${pt(want.pageH)}`);
  }

  if (!row) problems.push("none of the page's colour across its middle");
  else {
    if (Math.abs(row.at - want.left) > SLACK) {
      problems.push(`the page starts ${pt(row.at)} pt in, its half's body ${pt(want.left)}`);
    }

    if (Math.abs(row.len - want.pageW) > SLACK) {
      problems.push(`the page is ${pt(row.len)} pt wide, its half's body ${pt(want.pageW)}`);
    }
  }

  return { ok: !problems.length, problems, seen };
}

/** The strip one solid colour, its controls out of sight but in their places, so a column of pixels reads the whole of it. */
export const paintStrips = ctx =>
  ctx.js(
    `const s = document.createElement('style'); s.textContent = '.ptabs { background: rgb(${STRIP_INK}) !important; border-color: rgb(${STRIP_INK}) !important; box-shadow: none !important; backdrop-filter: none !important; } .ptabs::before, .ptabs::after { display: none !important; } .ptabs * { visibility: hidden !important; }'; document.head.append(s); return true`,
  );

/** `placed(label, url, hex)`: the page at `url`, of that colour, where it belongs, or an error with a word for each way it
 *  is not. Polled, since a page is drawn a frame or more after its view moved, and a window is seen a moment after it
 *  changes; the last look is what a failure says. Every look is saved, and a shell set aside must never have come forward. */
export const placer =
  ctx =>
  async (label, url, hex, timeout = 8000) => {
    const { g: half } = await ctx.halfOf(url);
    const ink = inkOf(hex);
    const slug = label.replace(/[^\w]+/g, '-');
    const t0 = Date.now();

    let verdict;
    let win;

    for (;;) {
      win = await ctx.win();

      const layout = await ctx.js(
        `const q = s => { const r = document.querySelector(s).getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height }; }; return { strip: q(${JSON.stringify(half ? '#ptabsB' : '#ptabs')}), body: q(${JSON.stringify(half ? '#gbodyB' : '#gbody')}), hidden: document.visibilityState === 'hidden' }`,
      );

      await ctx.ask('shot');
      const down = await ctx.ask('runs', { down: true, at: (layout.body.left + layout.body.width / 2) * win.zoom });
      const mid = down.filter(run => near(run.c, ink)).sort((left, right) => right.len - left.len)[0];
      const across = mid ? await ctx.ask('runs', { down: false, at: mid.at + mid.len / 2 }) : [];

      verdict = pagePlaced({ down, across, strip: layout.strip, body: layout.body, zoom: win.zoom, ink });

      if (layout.hidden) {
        verdict = {
          ...verdict,
          ok: false,
          problems: [
            `the board's page is hidden: ${win.unseen || 'the window not seen on the screen'}, so WebKit runs no frames`,
            ...verdict.problems,
          ],
        };
      }

      if (verdict.ok || Date.now() - t0 > timeout) break;
      await new Promise(res => setTimeout(res, 150));
    }

    const path = await ctx.shot(slug);

    if (ctx.aside && win.active) {
      verdict = {
        ...verdict,
        ok: false,
        problems: [...verdict.problems, 'the shell came forward: it took the keys from whoever was typing'],
      };
    }

    if (!verdict.ok) {
      throw new Error(
        `${label}: ${verdict.problems.join('; ')}\n  saw ${JSON.stringify(verdict.seen)}, the overlay ${win.inset} pt down, ${win.titled ? 'titled' : 'borderless'} ${win.w}×${win.h}, zoom ${win.zoom}\n  picture: ${path}`,
      );
    }

    ctx.log(
      `✓ ${label} — the strip ${verdict.seen.stripH} pt, the page from ${verdict.seen.pageTop} pt, ${verdict.seen.pageW}×${verdict.seen.pageH} (y = 0 ${verdict.seen.pageStarts} pt down)`,
    );

    return verdict.seen;
  };
