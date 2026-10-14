// The environment every test process starts from (2026-10-14): server.mjs reads where its state lives as it is imported
// — the state file, ~/.claude, the config, the holders' folder — and a test file that imported it with none of them set
// read the user's own state file, and could have moved the legacy one into place. Each test process gets a folder of its
// own for them, gone when it ends; notifications and the usage call off. `npm test` preloads this (node --import), and a
// file that imports server.mjs imports it first too, so a file run alone is the same (scripts/check-tests.mjs holds both).
// A test that wants another state file sets its own after this. Not inherited: a child process of a test runs its own.
import { join } from 'node:path';
import { tmpDir } from '../lib/testserver.mjs';

if (process.env.PEIX_TEST_PID !== String(process.pid)) {
  const dir = tmpDir('peix-test-');
  Object.assign(process.env, {
    PEIX_TEST_PID: String(process.pid), STATE_FILE: join(dir, 'state.json'), CLAUDE_DIR: join(dir, 'claude'),
    CONFIG_FILE: join(dir, 'config.json'), TERMS_DIR: join(dir, 'terms'), USAGE: 'off', NOTIFY: 'off',
  });
}
