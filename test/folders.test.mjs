// A root's folders, and the one thing the board writes outside its own state: a clone into a root (ORG_DIR here — the
// root the environment gives when the cog has set none; test/config.test.mjs is the cog's). The clone
// itself is `gh repo clone` over the network — not a test's business — so what is checked here is everything around
// it: what the listing holds, what it refuses to be told, and a folder that is already there being handed back so
// the page can carry on into the new-chat flow with it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { sleep, startTestServer, tmpDir, waitFor } from '../lib/testserver.mjs';
import { makeFixture, slugOf } from '../scripts/fixture.mjs';

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
    const res = await fetch(`${srv.url}events?key=${srv.key}`, { signal: ctl.signal });
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

// A chat's worktree removed with its repo there (2026-10-19; "Could not resume this chat … a worktree since removed?"
// before): the resume makes the tree again at its path, on the chat's branch, and the chat runs there; a folder gone
// inside a checkout resumes in the nearest folder left, writing on in the transcript it has. The fake claude finds a
// transcript by its id in any project folder, as Claude Code does.
test('a chat\'s worktree gone: resumed where it was, its tree made again; a folder gone in a checkout: resumed in what is left', { timeout: 60_000 }, async () => {
  const root = realpathSync(tmpDir('peix-org-')), repo = join(root, 'widgets'), tree = join(repo, '.claude', 'worktrees', 'lunch');
  const env = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t', GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };
  const git = (cwd, ...a) => execFileSync('git', ['-C', cwd, ...a], { stdio: 'pipe', env }).toString().trim();
  execFileSync('git', ['init', '-q', '-b', 'main', repo], { env }); writeFileSync(join(repo, 'a.js'), 'a\n'); git(repo, 'add', '.'); git(repo, 'commit', '-qm', 'base');
  git(repo, 'worktree', 'add', '-q', '-b', 'lunch', tree); git(repo, 'worktree', 'remove', tree);
  const fx = makeFixture(tmpDir('peix-fx-'), [
    { cwd: tree, branch: 'lunch', title: 'In a worktree', prompt: 'the lunch menus', reply: 'Done, on lunch.' },
    { cwd: join(repo, 'packages', 'gone'), title: 'In a folder since deleted', prompt: 'and here?', reply: 'Here too.' },
  ]);
  const [inTree, inGone] = fx.chats;
  const srv = await startTestServer({ claudeDir: fx.dir, fake: true, env: { ORG_DIR: root, ORG: 'acme' } });
  const made = [];
  try {
    const sum = async id => (await srv.api('api/sessions')).body.sessions.find(s => s.id === id);
    assert.deepEqual([(await sum(inTree.id)).folderMissing, (await sum(inTree.id)).cloneRef, (await sum(inTree.id)).back], [true, null, { tree, repo }], 'the bar can say the resume makes it again');
    assert.deepEqual((await sum(inGone.id)).back, { near: repo });
    const r = await srv.post(`api/sessions/${inTree.id}/terminal`, { cols: 100, rows: 30 });
    assert.equal(r.status, 201, JSON.stringify(r.body)); made.push(r.body.terminal.id);
    assert.deepEqual(r.body.back, { from: tree, cwd: tree, tree, branch: 'lunch', made: true });
    assert.equal(git(tree, 'branch', '--show-current'), 'lunch', 'the tree again, on the chat’s branch');
    await waitFor(async () => { const s = await sum(inTree.id); return s.alive && s.live?.cwd === tree; }, { what: 'the chat resumed in its tree' });
    assert.match(srv.logText(), /worktrees\/lunch is gone — its worktree made again, on lunch/);
    const g = await srv.post(`api/sessions/${inGone.id}/terminal`, { cols: 100, rows: 30 });
    assert.equal(g.status, 201, JSON.stringify(g.body)); made.push(g.body.terminal.id);
    assert.deepEqual(g.body.back, { from: join(repo, 'packages', 'gone'), cwd: repo });
    await waitFor(async () => { const s = await sum(inGone.id); return s.alive && s.live?.cwd === repo; }, { what: 'the other chat resumed in the repo' });
    // the screen's first frame: the fake printed the chat's history back, read from the transcript it found by its id
    const screen = () => new Promise(res => {
      const ws = new WebSocket(srv.ws(`api/terminals/${g.body.terminal.id}/ws`)); ws.binaryType = 'arraybuffer';
      const done = v => { clearTimeout(t); try { ws.close(); } catch {} res(v); }, t = setTimeout(() => done(''), 1500);
      ws.onmessage = e => { if (typeof e.data !== 'string') done(Buffer.from(e.data).toString('utf8')); }; ws.onerror = () => done('');
    });
    await waitFor(async () => (await screen()).includes('and here?'), { what: 'the resumed chat’s history on its screen' });
    assert.ok(!readdirSync(join(fx.dir, 'projects', slugOf(repo))).includes(`${inGone.id}.jsonl`), 'no second transcript: it writes on in its own');
    assert.ok(!existsSync(join(repo, 'packages')), 'nothing made for a plain folder');
  } finally {
    for (const id of made) await srv.api(`api/terminals/${id}`, { method: 'DELETE' }).catch(() => {});
    await srv.stop();
    rmSync(root, { recursive: true, force: true });
  }
});
