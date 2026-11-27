// A release's notes (2026-11-27): CHANGELOG.md at the checkout's root, newest first, a section a release — a heading
// `## 0.2 — 27 November 2026` and its markdown down to the next `## `. A release is the commit that sets package.json's
// version (lib/version.mjs counts the patch from it), so `0.2` and `0.2.0` name the same one. The updater reads the
// sections between the release a board is on and the one it would take (server/update.mjs); the page shows them as a
// reply is shown, through md() and DOMPurify; scripts/release.mjs writes a new one at the top.
//
//   node lib/changelog.mjs [since]      — prints the sections after `since` (every one, without), newest first
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const CHANGELOG = 'CHANGELOG.md';
const NOTES_MAX = 6; // sections handed to the page at once: a board a long way behind reads the newest
const NOTE_CHARS = 12_000; // a section's markdown, at most

/** "0.2", "0.2.0", "v0.2.1" → [0, 2, 1]; null for anything else. */
export function verParts(v) {
  const m = /^v?(\d+)\.(\d+)(?:\.(\d+))?$/.exec(String(v ?? '').trim());

  return m ? [Number(m[1]), Number(m[2]), Number(m[3] || 0)] : null;
}

/** -1, 0 or 1 as `a` is older than, the same as or newer than `b` — anything that is no version the oldest of all. */
export function verCmp(a, b) {
  const x = verParts(a);
  const y = verParts(b);

  if (!x || !y) return x ? 1 : y ? -1 : 0;
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  return 0;
}

/** A release's name as people say it: `0.2` for 0.2.0, the patch only when there is one. */
export const relName = v => {
  const p = verParts(v);

  return p ? (p[2] ? p.join('.') : `${p[0]}.${p[1]}`) : String(v ?? '');
};

/** The sections of a changelog, in the file's order: {version, title — the rest of the heading's line, a date as a rule —,
 *  md}. A heading of another level two or one (not a version) ends a section; deeper ones are its own. */
export function changelogSections(text) {
  const out = [];
  let cur = null;

  for (const line of String(text || '').split('\n')) {
    const m = /^## +v?(\d+\.\d+(?:\.\d+)?)(?![\w.])[ \t]*(?:[—–:-][ \t]*)?(.*)$/.exec(line);

    if (m) {
      cur = { version: m[1], title: m[2].trim(), md: '' };
      out.push(cur);
    } else if (/^#{1,2} /.test(line)) cur = null;
    else if (cur) cur.md += `${line}\n`;
  }

  for (const s of out) s.md = s.md.trim().slice(0, NOTE_CHARS);
  return out;
}

/** The sections newer than `from` and no newer than `to` (any, without), newest first, NOTES_MAX at most. */
export function notesBetween(text, from, to = null) {
  return changelogSections(text)
    .filter(s => verCmp(s.version, from) > 0 && (to == null || verCmp(s.version, to) <= 0))
    .sort((a, b) => verCmp(b.version, a.version))
    .slice(0, NOTES_MAX);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dir = join(dirname(fileURLToPath(import.meta.url)), '..');
  let text = '';

  try {
    text = readFileSync(join(dir, CHANGELOG), 'utf8');
  } catch {}

  for (const s of notesBetween(text, process.argv[2] || '0.0.0')) {
    console.log(`## ${relName(s.version)}${s.title ? ` — ${s.title}` : ''}\n\n${s.md}\n`);
  }
}
