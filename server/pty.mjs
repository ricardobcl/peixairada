// node-pty, the one native module: its spawn-helper made executable, then loaded. Without it the server still runs,
// and terminals answer 501.
import { chmodSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './env.mjs';

// node-pty is the one native module here. Its prebuilt spawn-helper arrives from npm without the
// executable bit, which surfaces as "posix_spawnp failed" on the first terminal — fix it before the
// import rather than documenting it. Without the module the server still runs; terminals answer 501.
// Only when the bit is missing: a chmod to the same mode is still a write, and from the app in
// /Applications every start tripped App Management ("prevented from modifying apps on your Mac").
try {
  const h = join(ROOT, 'node_modules', 'node-pty', 'prebuilds', `${process.platform}-${process.arch}`, 'spawn-helper');

  if (existsSync(h) && (statSync(h).mode & 0o111) !== 0o111) chmodSync(h, 0o755);
} catch {}

export const nodePty = await import('node-pty')
  .then(m => m.default ?? m)
  .catch(e => {
    console.error('[peixairada] node-pty unavailable — terminals are disabled:', e.message);
    return null;
  });
