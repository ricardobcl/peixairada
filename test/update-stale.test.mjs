// The server against its own checkout (2026-11-25): a checkout reached by a path spelled in another case is still one.
// The checkout is the update tests' throwaway one (test/update-project.mjs).
import './env.mjs';   // first: server.mjs reads where its state lives as it is imported
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { startTestServer } from '../lib/testserver.mjs';
import { project } from './update-project.mjs';

test('a checkout reached by a path in another case is a checkout (a case-insensitive disk)', { timeout: 30_000 }, async t => {
  const p = project(), name = basename(p.co), other = join(dirname(p.co), name === name.toUpperCase() ? name.toLowerCase() : name.toUpperCase());
  if (!existsSync(other)) return t.skip('this disk tells case apart');
  const srv = await startTestServer({ env: { ...p.env, UPDATE_DIR: other } });
  try {
    const st = (await srv.post('api/update', {})).body;
    assert.deepEqual([st.checkout, st.why, st.branch], [true, 'current', 'main'], `${other} is the checkout ${p.co}`);
  } finally { await srv.stop(); }
});
