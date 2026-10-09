// A root's folders, and the one thing the board writes outside its own state: a clone into a root (ORG_DIR here — the
// root the environment gives when the cog has set none; test/config.test.mjs is the cog's). The clone
// itself is `gh repo clone` over the network — not a test's business — so what is checked here is everything around
// it: what the listing holds, what it refuses to be told, and a folder that is already there being handed back so
// the page can carry on into the new-chat flow with it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { sleep, startTestServer, tmpDir, waitFor } from '../lib/testserver.mjs';

test('the org folders are listed, and a clone is refused a name that is not one', { timeout: 60_000 }, async () => {
  const root = tmpDir('peix-org-');
  mkdirSync(join(root, 'wallet-api', '.git'), { recursive: true });
  mkdirSync(join(root, 'oracle'), { recursive: true });
  mkdirSync(join(root, 'wallet-api-fix'), { recursive: true });   // `git worktree add ../wallet-api-fix`: a .git file
  writeFileSync(join(root, 'wallet-api-fix', '.git'), `gitdir: ${join(root, 'wallet-api', '.git', 'worktrees', 'wallet-api-fix')}\n`);
  mkdirSync(join(root, '.hidden'), { recursive: true });
  writeFileSync(join(root, 'notes.txt'), 'not a folder');
  const srv = await startTestServer({ env: { ORG_DIR: root, ORG: 'acme' } });
  try {
    const list = await srv.api('api/folders');
    assert.deepEqual(list.body.roots, [{ dir: root, org: 'acme' }]);
    assert.deepEqual(list.body.folders.map(f => f.name), ['oracle', 'wallet-api', 'wallet-api-fix'], 'directories only, by name — a file and a dotfolder are not folders here');
    assert.deepEqual(list.body.folders.map(f => f.git), [false, true, true], 'a .git says which one is a clone already');
    assert.deepEqual(list.body.folders.map(f => !!f.worktree), [false, false, true], 'and a .git file naming worktrees/ that it is a worktree (2026-10-09)');
    assert.deepEqual(list.body.folders.map(f => [f.root, f.org]), [[root, 'acme'], [root, 'acme'], [root, 'acme']], 'each says which root and org it is of');

    for (const name of ['../escape', 'has space', '', 'a/b']) {
      const bad = await srv.post('api/clone', { name });
      assert.equal(bad.status, 400, `"${name}" is no repository name`);
    }
    const here = await srv.post('api/clone', { name: 'oracle' });
    assert.equal(here.status, 200);
    assert.deepEqual(here.body, { cwd: join(root, 'oracle'), cloned: false }, 'a folder already there is handed back, not cloned over');

    mkdirSync(join(root, 'ledger-service'), { recursive: true });   // the listing is cached by the directory's mtime
    const again = await srv.api('api/folders');
    assert.deepEqual(again.body.folders.map(f => f.name), ['ledger-service', 'oracle', 'wallet-api', 'wallet-api-fix'], 'a folder that appeared is listed on the next ask');
  } finally {
    await srv.stop();
    rmSync(root, { recursive: true, force: true });
  }
});

// A chat's folder that is not there (2026-10-09): the spawn says which repo would bring it back — the root's org and the
// folder's first name under the root —, a clone says how far it is over `clone` events, a second ask joins the one
// under way (and a spawn in its folder waits for it), and a clone that fails leaves no folder behind. The fake gh
// clones without the network (scripts/fakegh.mjs); a repo named no-such-… is one GitHub has not got.
test('a folder not there: the repo that clones it, a clone joined, its progress, and a failure that leaves nothing', { timeout: 60_000 }, async () => {
  const root = tmpDir('peix-org-');
  mkdirSync(join(root, 'ledger', '.git'), { recursive: true });
  const srv = await startTestServer({ fake: true, env: { ORG_DIR: root, ORG: 'acme', FAKEGH_CLONE_MS: '1500' } });
  const events = [], ctl = new AbortController();
  try {
    // the stream, read as it comes: every `clone` event
    const res = await fetch(`${srv.url}events`, { signal: ctl.signal });
    (async () => { const dec = new TextDecoder(); let buf = ''; for await (const b of res.body) { buf += dec.decode(b, { stream: true }); let i; while ((i = buf.indexOf('\n\n')) >= 0) { const msg = buf.slice(0, i); buf = buf.slice(i + 2); if (/^event: clone$/m.test(msg)) events.push(JSON.parse(msg.match(/^data: (.*)$/m)[1])); } } })().catch(() => {});

    const spawn = cwd => srv.post('api/terminals', { cwd });
    const gone = await spawn(join(root, 'widgets', 'packages', 'api'));
    assert.equal(gone.status, 409);
    assert.deepEqual(gone.body.clone, { name: 'widgets', root, org: 'acme', ref: 'acme/widgets', dir: join(root, 'widgets') }, 'a folder inside the repo: the repo clones it');
    assert.match(gone.body.error, /is not checked out — acme\/widgets clones it$/);
    const inside = await spawn(join(root, 'ledger', '.claude', 'worktrees', 'gone'));
    assert.deepEqual([inside.status, inside.body.clone], [409, null], 'its repo is there: no clone brings back a worktree');
    assert.match(inside.body.error, /its repo is checked out, but not this folder in it/);
    const elsewhere = await spawn(join(tmpDir('peix-x-'), 'nowhere'));
    assert.deepEqual([elsewhere.status, elsewhere.body.clone], [409, null]);
    assert.match(elsewhere.body.error, /no folder of repos with an org holds it/);

    const [a, b] = [srv.post('api/clone', { name: 'widgets' }), (async () => { await sleep(300); return srv.post('api/clone', { name: 'widgets' }); })()];
    await sleep(500);
    const meanwhile = await spawn(join(root, 'widgets'));
    assert.deepEqual([meanwhile.status, meanwhile.body.clone?.ref], [409, 'acme/widgets'], 'the folder is there from git\'s first moment, and still not a checkout: the spawn waits on the clone');
    const [ra, rb] = await Promise.all([a, b]);
    assert.deepEqual([ra.status, ra.body, rb.status, rb.body], [200, { cwd: join(root, 'widgets'), cloned: true }, 200, { cwd: join(root, 'widgets'), cloned: true }], 'the second ask joined the first, one clone');
    assert.ok(existsSync(join(root, 'widgets', '.git', 'config')), 'cloned');
    await waitFor(() => events.some(e => e.done), { what: 'the clone\'s last event' });
    const mine = events.filter(e => e.ref === 'acme/widgets');
    assert.equal(mine.filter(e => e.done).length, 1, 'one clone, one end');
    assert.deepEqual(mine.at(-1), { ref: 'acme/widgets', dir: join(root, 'widgets'), phase: 'Resolving deltas', percent: 100, done: true });
    const pcts = mine.filter(e => !e.done).map(e => e.percent);
    assert.ok(pcts.length >= 3 && pcts.every((p, i) => !i || p >= pcts[i - 1]) && pcts.some(p => p > 0 && p < 100), `how far, as it goes: ${pcts}`);
    assert.ok(mine.some(e => e.phase === 'Receiving objects'), 'git\'s own phases');

    const no = await srv.post('api/clone', { name: 'no-such-repo' });
    assert.equal(no.status, 502);
    assert.match(no.body.error, /Could not resolve to a Repository with the name 'acme\/no-such-repo'/, 'gh\'s own words, not git\'s progress');
    assert.ok(!existsSync(join(root, 'no-such-repo')), 'nothing left behind');
    await waitFor(() => events.some(e => e.ref === 'acme/no-such-repo' && e.done && e.error), { what: 'the failure said on the stream' });
  } finally {
    ctl.abort();
    await srv.stop();
    rmSync(root, { recursive: true, force: true });
  }
});
