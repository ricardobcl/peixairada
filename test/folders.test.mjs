// The org's folders, and the one thing the board writes outside its own state: a clone into ORG_DIR. The clone
// itself is `gh repo clone` over the network — not a test's business — so what is checked here is everything around
// it: what the listing holds, what it refuses to be told, and a folder that is already there being handed back so
// the page can carry on into the new-chat flow with it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startTestServer } from '../lib/testserver.mjs';


test('the org folders are listed, and a clone is refused a name that is not one', { timeout: 60_000 }, async () => {
  const root = mkdtempSync(join(tmpdir(), 'peix-org-'));
  mkdirSync(join(root, 'wallet-api', '.git'), { recursive: true });
  mkdirSync(join(root, 'oracle'), { recursive: true });
  mkdirSync(join(root, '.hidden'), { recursive: true });
  writeFileSync(join(root, 'notes.txt'), 'not a folder');
  const srv = await startTestServer({ env: { ORG_DIR: root, ORG: 'acme' } });
  try {
    const list = await srv.api('api/folders');
    assert.equal(list.body.root, root);
    assert.equal(list.body.org, 'acme');
    assert.deepEqual(list.body.folders.map(f => f.name), ['oracle', 'wallet-api'], 'directories only, by name — a file and a dotfolder are not folders here');
    assert.deepEqual(list.body.folders.map(f => f.git), [false, true], 'a .git says which one is a clone already');

    for (const name of ['../escape', 'has space', '', 'a/b']) {
      const bad = await srv.post('api/clone', { name });
      assert.equal(bad.status, 400, `"${name}" is no repository name`);
    }
    const here = await srv.post('api/clone', { name: 'oracle' });
    assert.equal(here.status, 200);
    assert.deepEqual(here.body, { cwd: join(root, 'oracle'), cloned: false }, 'a folder already there is handed back, not cloned over');

    mkdirSync(join(root, 'ledger-service'), { recursive: true });   // the listing is cached by the directory's mtime
    const again = await srv.api('api/folders');
    assert.deepEqual(again.body.folders.map(f => f.name), ['ledger-service', 'oracle', 'wallet-api'], 'a folder that appeared is listed on the next ask');
  } finally {
    await srv.stop();
    rmSync(root, { recursive: true, force: true });
  }
});
