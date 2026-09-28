// The cog's setup (2026-09-28): the folders of repos and their orgs, ⌥⌘O's project, a short name and a colour per
// project — what had been written into the server and the page for one Mac. Checked here: the defaults, what a PUT is
// refused, that a PUT replaces only the keys it gives, that the roots feed the folder listing and the clone, and that
// it all survives a restart in the state file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startTestServer } from '../lib/testserver.mjs';

const put = (srv, body) => srv.api('api/config', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

test('the setup: defaults, refusals, partial PUTs, the roots behind the folders and the clone, a restart', { timeout: 60_000 }, async () => {
  // A home of its own, so `~/…` can be checked without touching the real one.
  const home = realpathSync(mkdtempSync(join(tmpdir(), 'peix-home-')));
  for (const f of ['code/acme/api', 'code/acme/web', 'code/other/tool', 'loose']) mkdirSync(join(home, f), { recursive: true });
  const srv = await startTestServer({ env: { HOME: home } });
  try {
    const first = await srv.api('api/config');
    assert.deepEqual(first.body, { roots: [{ dir: join(srv.dir, 'org'), org: '' }], quick: null, projects: {} }, 'nothing set: the environment\'s root (the test server\'s ORG_DIR), no org, no ⌥⌘O, no names');

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
    assert.deepEqual(set.body.config, {
      roots: [{ dir: join(home, 'code', 'acme'), org: 'acme' }, { dir: join(home, 'code', 'other'), org: '' }],
      quick: 'api', projects: { api: { abbr: 'API', color: '#aabbcc' } },
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

    const saved = JSON.parse(readFileSync(join(srv.dir, 'state.json'), 'utf8')).config;
    assert.deepEqual(saved.projects, { api: { abbr: 'API', color: '#aabbcc' } }, 'kept in the state file');
    await srv.restart();
    const after = await srv.api('api/config');
    assert.deepEqual(after.body.roots.map(r => r.org), ['acme', 'other'], 'and read back after a restart');
    assert.equal(after.body.projects.api.abbr, 'API');
  } finally {
    await srv.stop();
    rmSync(home, { recursive: true, force: true });
  }
});
