// The page as it is served (2026-11-25): public/index.html is its skeleton — the head, the markup, and a line
// `<!--#include file="…" -->` for each part of its stylesheet (public/css/) and of its script (public/js/), in order.
// The script is one IIFE across its parts, so a part is a run of that function's statements, not a module of its own:
// the order of the lines is the order they run in. No build step: the parts are put in as the page is asked for, so an
// edit is live on a reload, and what goes out is one document as before — the same inline scripts, hashed for the
// page's policy as it is served (pageCsp). Put together again only when a file of it changed (readPage): a look at each
// is a tenth of a millisecond, reading them all several.
import { readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PAGE_FILE = fileURLToPath(new URL('../public/index.html', import.meta.url));
const INCLUDE = /^<!--#include file="([\w./-]+)" -->$/;

/** The page put together from `file` (a page with no includes is itself), the parts it took in, and `where(n)`: the
 *  file and line that line `n` of the page came from — for a check that points at a line. A part must end its last
 *  line, or it would run on into the next one: said as an error. */
export function assemblePage(file = PAGE_FILE) {
  const dir = dirname(file);
  const out = [];
  const spans = [];
  const parts = [];

  const files = [file];
  const seen = [stamp(file)];

  const lines = readFileSync(file, 'utf8').split('\n');

  lines.forEach((l, i) => {
    const m = INCLUDE.exec(l);

    if (!m) {
      spans.push({ at: out.length + 1, file, line: i + 1, n: 1 });
      out.push(l);
      return;
    }

    const part = join(dir, m[1]);

    files.push(part);
    seen.push(stamp(part)); // looked at before it is read: a change after is a change next time
    const text = readFileSync(part, 'utf8');

    if (!text.endsWith('\n')) {
      throw new Error(`${relative(process.cwd(), part)}: a part of the page must end with a newline`);
    }

    const own = text.slice(0, -1).split('\n');

    spans.push({ at: out.length + 1, file: part, line: 1, n: own.length });
    parts.push(part);
    out.push(...own);
  });

  const where = n => {
    const s = spans.findLast(x => x.at <= n) || spans[0];

    return { file: s.file, line: s.line + Math.min(n - s.at, s.n - 1) };
  };

  return { html: out.join('\n'), parts, where, files, key: seen.join(';') };
}

const stamp = f => {
  const s = statSync(f);

  return `${s.ino}:${s.size}:${s.mtimeMs}`;
};

let last = null; // the page put together last: its files and how they stood

/** The page as it is served: put together from its parts, again only when one of its files changed. */
export function readPage(file = PAGE_FILE) {
  try {
    if (last?.file === file && last.files.map(stamp).join(';') === last.key) return last.html;
  } catch {}

  const { html, files, key } = assemblePage(file);

  last = { file, files, key, html };
  return html;
}
