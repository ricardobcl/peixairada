// The setup (2026-09-28): the folders of repos and their orgs, ⌥⌘O's project, a short name and a colour per project —
// what had been written into the server and the page for one Mac. Checked here: the defaults, what a PUT is refused,
// that a PUT replaces only the keys it gives, that the roots feed the folder listing and the clone, and that it all
// survives a restart — in a file of its own since 2026-10-01 (CONFIG_FILE): moved there from the state file, read back
// after a hand edit, never written over while it does not parse; and the first run, which asks where the repos live.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeFixture } from '../scripts/fixture.mjs';
import { startTestServer, waitFor } from '../lib/testserver.mjs';

const put = (srv, body) => srv.api('api/config', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

test('the setup: defaults, refusals, partial PUTs, the roots behind the folders and the clone, a restart', { timeout: 60_000 }, async () => {
  // A home of its own, so `~/…` can be checked without touching the real one.
  const home = realpathSync(mkdtempSync(join(tmpdir(), 'peix-home-')));
  for (const f of ['code/acme/api', 'code/acme/web', 'code/other/tool', 'loose']) mkdirSync(join(home, f), { recursive: true });
  const srv = await startTestServer({ env: { HOME: home } });
  try {
    const first = await srv.api('api/config');
    assert.deepEqual(first.body, { roots: [{ dir: join(srv.dir, 'org'), org: '' }], quick: null, projects: {}, file: join(srv.dir, 'config.json'), error: null, ask: false },
      'nothing set: the environment\'s root (the test server\'s ORG_DIR), no org, no ⌥⌘O, no names — beside the test\'s own state file, and nothing to ask');

    for (const [body, why] of [
      [{ roots: [{ dir: 'relative/path', org: '' }] }, 'a path that is not one'],
      [{ roots: [{ dir: join(home, 'nope'), org: '' }] }, 'a folder that is not there'],
      [{ roots: [{ dir: '~/code/acme', org: 'not an org!' }] }, 'an org GitHub would not have'],
      [{ roots: 'x' }, 'roots that are not a list'],
      [{ quick: 'a/b' }, 'a path for ⌥⌘O'],
      [{ projects: { api: { abbr: 'TOOLONG' } } }, 'a short name over six letters'],
      [{ projects: { api: { color: 'red' } } }, 'a colour that is not #rrggbb'],
    ]) assert.equal((await put(srv, body)).status, 400, `refused: ${why}`);

    const set = await put(srv, { roots: [{ dir: '~/code/acme/', org: 'acme' }, { dir: join(home, 'code', 'other'), org: '' }, { dir: '~/code/acme', org: 'dup' }], quick: 'api', projects: { api: { abbr: 'API', color: '#AABBCC' }, web: { abbr: '', color: '' } } });
    assert.equal(set.status, 200);
    assert.deepEqual({ ...set.body.config, file: undefined, error: undefined, ask: undefined }, {
      roots: [{ dir: join(home, 'code', 'acme'), org: 'acme' }, { dir: join(home, 'code', 'other'), org: '' }],
      quick: 'api', projects: { api: { abbr: 'API', color: '#aabbcc' } }, file: undefined, error: undefined, ask: undefined,
    }, '~ expanded, the trailing slash and the second spelling of a root gone, a colour lowercased, an empty project dropped');

    const partial = await put(srv, { quick: null });
    assert.equal(partial.body.config.quick, null);
    assert.equal(partial.body.config.roots.length, 2, 'a PUT of one key leaves the others');

    const folders = await srv.api('api/folders');
    assert.deepEqual(folders.body.folders.map(f => [f.name, f.org]), [['api', 'acme'], ['web', 'acme'], ['tool', '']], "every root's folders, a root at a time, each with its root's org");

    const here = await srv.post('api/clone', { name: 'api' });
    assert.deepEqual(here.body, { cwd: join(home, 'code', 'acme', 'api'), cloned: false }, 'one root has an org: the clone needs no root named');
    assert.equal((await srv.post('api/clone', { name: 'api', root: join(home, 'code', 'other') })).status, 400, 'a root without an org clones nothing');

    await put(srv, { roots: [{ dir: '~/code/acme', org: 'acme' }, { dir: '~/code/other', org: 'other' }] });
    assert.equal((await srv.post('api/clone', { name: 'tool' })).status, 400, 'two roots with an org: which one has to be said');
    assert.deepEqual((await srv.post('api/clone', { name: 'tool', root: join(home, 'code', 'other') })).body, { cwd: join(home, 'code', 'other', 'tool'), cloned: false });

    const saved = JSON.parse(readFileSync(join(srv.dir, 'config.json'), 'utf8'));
    assert.deepEqual(saved, { roots: [{ dir: '~/code/acme', org: 'acme' }, { dir: '~/code/other', org: 'other' }], quick: null, projects: { api: { abbr: 'API', color: '#aabbcc' } } },
      'kept in the config file, a folder under the home as ~/…');
    assert.ok(!existsSync(join(srv.dir, 'state.json')) || !('config' in JSON.parse(readFileSync(join(srv.dir, 'state.json'), 'utf8'))), 'and not in the state file');
    await srv.restart();
    const after = await srv.api('api/config');
    assert.deepEqual(after.body.roots.map(r => r.org), ['acme', 'other'], 'and read back after a restart');
    assert.equal(after.body.projects.api.abbr, 'API');
  } finally {
    await srv.stop();
    rmSync(home, { recursive: true, force: true });
  }
});

test('the config file: moved out of the state file, read back after a hand edit, never written over while it does not parse', { timeout: 60_000 }, async () => {
  const home = realpathSync(mkdtempSync(join(tmpdir(), 'peix-home-')));
  for (const f of ['code/acme/api', 'code/beta']) mkdirSync(join(home, f), { recursive: true });
  const dir = mkdtempSync(join(tmpdir(), 'peix-'));
  // a state file from before 2026-10-01, the setup in it
  writeFileSync(join(dir, 'state.json'), JSON.stringify({ done: { x: '2026-09-30T00:00:00.000Z' }, config: { roots: [{ dir: join(home, 'code', 'acme'), org: 'acme' }], quick: 'api' } }));
  const srv = await startTestServer({ dir, env: { HOME: home } });
  const file = join(dir, 'config.json');
  try {
    assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), { roots: [{ dir: '~/code/acme', org: 'acme' }], quick: 'api' }, 'the state file\'s setup, moved to the config file at boot');
    const st = JSON.parse(readFileSync(join(dir, 'state.json'), 'utf8'));
    assert.equal(st.config, undefined, 'and gone from the state file');
    assert.deepEqual(st.done, { x: '2026-09-30T00:00:00.000Z' }, 'the rest of the state as it was');
    assert.equal((await srv.api('api/config')).body.quick, 'api');

    // a hand edit reaches the board without a restart
    writeFileSync(file, JSON.stringify({ roots: [{ dir: '~/code/beta', org: '' }], quick: 'beta' }, null, 2));
    const edited = await waitFor(async () => { const c = (await srv.api('api/config')).body; return c.quick === 'beta' && c; }, { what: 'the hand edit, read back', timeout: 8000 });
    assert.deepEqual(edited.roots, [{ dir: join(home, 'code', 'beta'), org: '' }], '~ read as the home');

    // a file that does not parse: said, the board keeps what it had, and a PUT does not write over it
    writeFileSync(file, '{ "roots": [ oops');
    const broken = await waitFor(async () => { const c = (await srv.api('api/config')).body; return c.error && c; }, { what: 'the parse error, said', timeout: 8000 });
    assert.match(broken.error, /does not parse/);
    assert.equal(broken.quick, 'beta', 'the setup as it was before the file broke');
    assert.equal(broken.ask, false, 'and no welcome over a file that is there');
    assert.equal((await put(srv, { quick: 'api' })).status, 409, 'refused while the file does not read');
    assert.equal(readFileSync(file, 'utf8'), '{ "roots": [ oops', 'the file untouched');
    writeFileSync(file, JSON.stringify({ quick: 'api' }));
    await waitFor(async () => { const c = (await srv.api('api/config')).body; return c.error === null && c.quick === 'api'; }, { what: 'the fixed file, read', timeout: 8000 });
  } finally {
    await srv.stop();
    rmSync(home, { recursive: true, force: true });
  }
});

test('the first run: asked until answered, the guesses from the chats, a folder made on request', { timeout: 60_000 }, async () => {
  const home = realpathSync(mkdtempSync(join(tmpdir(), 'peix-home-')));
  const repo = (path, origin) => { mkdirSync(join(home, path, '.git'), { recursive: true }); if (origin) writeFileSync(join(home, path, '.git', 'config'), `[core]\n\tbare = false\n[remote "origin"]\n\turl = ${origin}\n\tfetch = +refs/heads/*:refs/remotes/origin/*\n`); };
  repo('work/api', 'git@github.com:acme/api.git'); repo('work/web', 'https://github.com/acme/web'); repo('work/fork', 'git@github.com-personal:someone/fork.git'); repo('work/plain');
  repo('code/toy', 'git@github.com:me/toy.git'); repo('code/game', 'git@github.com:me/game.git'); repo('Downloads/once/thing');
  mkdirSync(join(home, 'work', 'api', 'apps', 'server'), { recursive: true });
  mkdirSync(join(home, 'work', 'api', '.claude', 'worktrees', 'wt'), { recursive: true }); writeFileSync(join(home, 'work', 'api', '.claude', 'worktrees', 'wt', '.git'), 'gitdir: ../../../.git/worktrees/wt\n');
  const fx = makeFixture(join(home, '.claude'), [
    { cwd: join(home, 'work', 'api', 'apps', 'server'), prompt: 'a', reply: 'b' },
    { cwd: join(home, 'work', 'api', '.claude', 'worktrees', 'wt'), prompt: 'c', reply: 'd' },
    { cwd: join(home, 'work', 'web'), prompt: 'e', reply: 'f' },
    { cwd: home, prompt: 'g', reply: 'h' },
    { cwd: join(home, 'Downloads', 'once', 'thing'), prompt: 'i', reply: 'j' },
  ]);
  const srv = await startTestServer({ claudeDir: fx.dir, env: { HOME: home, ORG_DIR: '', ORG: '' } });
  try {
    const fresh = (await srv.api('api/config')).body;
    assert.deepEqual([fresh.roots, fresh.ask], [[], true], 'no roots set and none in the environment: ask');
    assert.equal(existsSync(join(srv.dir, 'config.json')), false, 'nothing written before an answer');

    const sug = (await srv.api('api/config/suggest')).body.roots;
    assert.deepEqual(sug.map(r => [r.dir, r.org, r.chats, r.repos]), [[join(home, 'work'), 'acme', 2, 4], [join(home, 'code'), 'me', 0, 2]],
      'the folder the chats ran in first — a subfolder and a worktree count as their repo, the home never — then a usual name that holds checkouts; each with its commonest origin\'s account; one chat in a lone checkout is no folder of repos');

    assert.equal((await put(srv, { roots: [{ dir: '~/fresh/place', org: '' }] })).status, 400, 'a folder not there is refused');
    assert.equal((await put(srv, { roots: [{ dir: '/elsewhere/place', org: '' }], create: true })).status, 400, 'and made only under the home');
    const made = await put(srv, { roots: [{ dir: '~/fresh/place', org: 'acme' }], create: true });
    assert.equal(made.status, 200);
    assert.deepEqual([made.body.config.roots, made.body.config.ask], [[{ dir: join(home, 'fresh', 'place'), org: 'acme' }], false], 'made, set, and asked no more');

    const skipped = await put(srv, { roots: [] });
    assert.deepEqual([skipped.body.config.roots, skipped.body.config.ask], [[], false], 'no folder at all is an answer too');
    await srv.restart();
    assert.equal((await srv.api('api/config')).body.ask, false, 'and it lasts');
  } finally {
    await srv.stop();
    rmSync(home, { recursive: true, force: true });
  }
});

test('an import of the server moves nothing: the setup leaves the state file at boot only', () => {
  // test/agents.test.mjs imports server.mjs with no STATE_FILE of its own, so its state file is the real one — and the
  // move, at the module's top level when first written, ran against this Mac's files from `npm test`.
  const home = realpathSync(mkdtempSync(join(tmpdir(), 'peix-home-')));
  const state = join(home, 'Library', 'Application Support', 'peixAIrada', 'state.json');
  mkdirSync(join(state, '..'), { recursive: true });
  writeFileSync(state, JSON.stringify({ config: { quick: 'api' } }));
  const env = { ...process.env, HOME: home, CLAUDE_DIR: join(home, '.claude'), USAGE: 'off', NOTIFY: 'off' };
  for (const k of ['STATE_FILE', 'CONFIG_FILE', 'XDG_CONFIG_HOME', 'XDG_STATE_HOME']) delete env[k];
  try {
    execFileSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(fileURLToPath(new URL('../server.mjs', import.meta.url)))})`], { env, timeout: 20_000 });
    assert.equal(existsSync(join(home, '.config', 'peixairada', 'config.json')), false, 'no config file written');
    assert.deepEqual(JSON.parse(readFileSync(state, 'utf8')), { config: { quick: 'api' } }, 'the state file as it was');
  } finally { rmSync(home, { recursive: true, force: true }); }
});
