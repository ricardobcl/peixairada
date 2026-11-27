// Attachments: a file dropped on the board from a browser — and a request's body, read whole (readRaw).
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { STATE_FILE } from './env.mjs';

// ---- attachments: a file dropped on the board from a browser ---------------------------------
// The Mac app hands a dropped file's *path* to the page (the shell sees the pasteboard); a plain browser
// only ever gets the bytes, so the page uploads them here and gets a path back to hand to claude as an
// @-mention. Saved beside the state file, per chat, the name kept (deduplicated); never cleaned up.
const ATTACH_DIR = join(dirname(STATE_FILE), 'attachments');

export const ATTACH_MAX = 50 * 1024 * 1024;

/** The body's bytes, up to `max`. Past it the rest is drained, not read, and the promise rejects — the request is
 *  left alive, so the refusal reaches the page (2026-10-03: a destroyed request took its socket with it, and the 413
 *  was written nowhere). A route that refuses this way closes the connection after its answer. */
export function readRaw(req, max) {
  return new Promise((resolve, reject) => {
    // a body declared too large is read to its end too, kept nowhere, and refused only then (2026-10-14): refused at
    // once, the close after the 413 met a body still coming, and the reset could reach the page before the answer
    const chunks = [];
    let received = Number(req.headers['content-length']) > max ? max + 1 : 0;

    req.on('data', chunk => {
      received += chunk.length;
      if (received <= max) chunks.push(chunk);
      else chunks.length = 0;
    });

    req.on('end', () => (received <= max ? resolve(Buffer.concat(chunks)) : reject(new Error('too large'))));
    req.on('error', reject);
  });
}

export function saveAttachment(sid, name, buf) {
  const dir = join(ATTACH_DIR, /^[\w-]{1,80}$/.test(sid) ? sid : 'inbox');

  mkdirSync(dir, { recursive: true });

  const clean = (
    basename(name || 'file')
      .replace(/[^\w.() -]+/g, '_')
      .replace(/^\.+/, '') || 'file'
  ).slice(0, 120);

  const dot = clean.lastIndexOf('.');
  const stem = dot > 0 ? clean.slice(0, dot) : clean;
  const ext = dot > 0 ? clean.slice(dot) : '';

  let file = join(dir, clean);

  for (let suffix = 2; existsSync(file); suffix++) file = join(dir, `${stem}-${suffix}${ext}`);
  writeFileSync(file, buf);
  return file;
}
