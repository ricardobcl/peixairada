// The board's own code kept up to date (2026-10-12): the server fetches its checkout's upstream and fast-forwards to it,
// then starts again what the commits touched — the packages, the server, the page, the app. Here the checkout is a
// throwaway one (test/update-project.mjs). The app behind its checkout is test/update-app.test.mjs, the update by the
// clock test/update-clock.test.mjs (2026-10-14: one file of them took half of `npm test`'s time, run one after another).
import './env.mjs';   // first: server.mjs reads where its state lives as it is imported
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { startTestServer, tmpDir, waitFor } from '../lib/testserver.mjs';
import { updateParts } from '../server.mjs';
import { PAGE, ROOT, TINY, project } from './update-project.mjs';

test('what a change asks for: packages, the server, the page, the app — and nothing for the rest', () => {
  assert.deepEqual(updateParts(['public/index.html']), ['page']);
  assert.deepEqual(updateParts(['server.mjs', 'mac/Sources/main.swift', 'README.md']), ['server', 'app']);
  assert.deepEqual(updateParts(['lib/termhold.mjs']), ['server']);
  assert.deepEqual(updateParts(['package-lock.json', 'public/vendor/xterm.js']), ['deps', 'server', 'page']);
  assert.deepEqual(updateParts(['docs/DECISIONS.md', 'test/update.test.mjs', 'scripts/scenarios/x.mjs', 'CLAUDE.md', 'mac/CLAUDE.md']), []);
});

test('a pull, asked for: fast-forwarded, what it touched started again, a commit that does not start held back, and over a change here only when asked', { timeout: 60_000 }, async () => {
  const p = project(), dir = tmpDir('peix-');
  writeFileSync(join(dir, 'state.json'), JSON.stringify({ autoUpdate: true }));   // as every save wrote it on 2026-10-12, when on was the default
  const srv = await startTestServer({ dir, env: { ...p.env, UPDATE_QUIET_MS: '60000' } });
  const look = async (body = {}) => (await srv.post('api/update', body)).body;
  const turn = async on => (await srv.api('api/update', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ on }) })).body.on;
  try {
    const st0 = await waitFor(async () => { const b = (await srv.api('api/update')).body; return b.checkout && b; }, { what: 'the checkout read at boot' });
    assert.deepEqual([st0.on, st0.every, st0.branch, st0.upstream, st0.behind], [false, 0, 'main', 'origin/main', 0], 'off by default, the old key notwithstanding; a server run by hand looks only when asked');
    assert.equal((await look()).why, 'current', 'nothing new');

    // off (2026-10-13): a new commit said — the status bar's alert — and not taken
    const first = p.head(), a = p.push({ 'public/index.html': PAGE + '<!-- a -->\n' }, 'the page');
    let st = await look();
    assert.deepEqual([st.why, st.behind, st.up, p.head()], ['off', 1, a, first], 'seen, not pulled');
    assert.equal(await turn(true), true);

    // the page: fast-forwarded, nothing restarted (the page reloads itself)
    st = await look();
    assert.equal(p.head(), a, 'fast-forwarded');
    assert.deepEqual([st.why, st.error, st.behind, st.last.count, st.last.parts, st.last.to], ['current', null, 0, 1, ['page'], a]);
    assert.deepEqual(p.asked(), [], 'nothing restarted for a page');

    // the server and the app: the agent restarted, the app rebuilt — each a step the status bar says
    const swift = readFileSync(join(ROOT, 'mac/Sources/main.swift'), 'utf8');
    const b = p.push({ 'server.mjs': TINY + '// b\n', 'mac/Sources/main.swift': swift + '// b\n' }, 'the server and the app');
    st = await look();
    assert.deepEqual([p.head(), st.last.parts, st.restarting], [b, ['server', 'app'], true]);
    assert.deepEqual([st.steps, st.step], [['pull', 'server', 'build', 'restart'], 3], 'the steps, and the last one reached');
    await waitFor(() => p.asked().length === 2, { what: 'the restart and the build' });
    assert.deepEqual(p.asked().sort(), ['build install --detached', 'restart restart --detached']);
    st = await waitFor(async () => { const b = (await srv.api('api/update')).body; return b.build?.done && b; }, { what: 'the build\'s end' });
    assert.deepEqual([st.building, st.build.ok], [false, true]);
    st = await waitFor(async () => { const b = (await srv.api('api/update')).body; return b.app?.behind === false && b; }, { what: 'the app stamped as built' });

    // a rebuild that outlives the server's restart: followed by the new server, and one that fails is said
    p.flag('build-slow', true); p.flag('build-fails', true);
    p.push({ 'mac/Sources/main.swift': swift + '// b2\n' }, 'the app again');
    st = await look();
    assert.equal(st.building, true, 'building');
    await srv.restart();
    st = (await srv.api('api/update')).body;
    assert.deepEqual([st.building, st.build.done], [true, undefined], 'the new server knows the build still runs');
    st = await waitFor(async () => { const b = (await srv.api('api/update')).body; return b.build?.done && b; }, { what: 'the build\'s end, seen from the new server' });
    assert.deepEqual([st.building, st.build.ok, st.build.why], [false, false, "swiftc: error: no such module 'Cocoa'"]);
    p.flag('build-slow', false); p.flag('build-fails', false);

    // a server that does not start: undone, and held back until a newer commit comes
    const kept = p.head(), c = p.push({ 'server.mjs': "throw new Error('boom: this server does not start');\n" }, 'a broken server');
    st = await look();
    assert.equal(p.head(), kept, 'undone');
    assert.match(st.error, new RegExp(`^${c.slice(0, 7)} was not kept: its server did not start \\(.*boom: this server does not start`));
    assert.deepEqual([st.why, st.held.to, st.behind, st.failed], ['held', c, 1, st.error], 'the update itself failed: the status bar says so');
    assert.equal(p.git(p.co, 'status', '--porcelain'), '', 'the checkout as it was');
    st = await look();
    assert.deepEqual([st.why, st.error, p.head()], ['held', null, kept], 'asked again: still held, and said without an error');
    const d = p.push({ 'server.mjs': TINY + '// d\n' }, 'the fix');
    st = await look();
    assert.deepEqual([p.head(), st.held, st.failed, st.last.count], [d, null, null, 2], 'the next commit taken, the held one with it');

    // a page whose script does not compile: held back the same way
    const e = p.push({ 'public/index.html': PAGE.replace('</body>', '<script>let x = ;</script></body>') }, 'a broken page');
    st = await look();
    assert.match(st.error, /was not kept: its page does not compile \(public\/index\.html: Unexpected token/);
    assert.deepEqual([p.head(), st.held.to], [d, e]);
    p.push({ 'public/index.html': PAGE }, 'the page fixed');
    st = await look();
    assert.deepEqual([st.why, st.held], ['current', null]);

    // the packages: npm install, then the server
    p.push({ 'package.json': '{ "name": "tiny", "version": "2.0.0" }\n' }, 'a package');
    st = await look();
    assert.deepEqual(st.last.parts, ['deps', 'server']);
    assert.ok(p.asked().includes('npm ci --ignore-scripts --no-audit --no-fund'), p.asked().join('\n'));

    // a tracked file changed here: said by name, and never pulled over by itself — update now pulls over it, and keeps
    // it (2026-10-15: a package-lock.json npm rewrote left a board with no way to its updates)
    p.write(p.co, { 'README.md': 'mine\n' });
    const f0 = p.push({ 'public/index.html': PAGE + '<!-- f -->\n' });
    let before = p.head();
    st = await look();
    assert.deepEqual([st.why, st.dirty, st.changed, st.clash, st.behind, p.head()], ['changes', 1, ['README.md'], [], 1, before]);
    st = await look({ apply: true });
    assert.deepEqual([st.why, st.error, p.head(), readFileSync(join(p.co, 'README.md'), 'utf8')], ['current', null, f0, 'mine\n'], 'pulled, the change kept');

    // ...but not over a file the new commits change too: said by name, update now or not
    before = p.head();
    p.push({ 'README.md': 'theirs\n' }, 'the readme');
    st = await look({ apply: true });
    assert.deepEqual([st.why, st.clash, st.behind, st.error, p.head()], ['changes', ['README.md'], 1, null, before]);
    p.git(p.co, 'checkout', 'HEAD', '--', 'README.md');

    // a file not in git here that the commits add: git refuses the fast-forward, and the refusal is said in words
    p.write(p.co, { 'new.txt': 'mine\n' });
    const f1 = p.push({ 'new.txt': 'theirs\n' }, 'a new file');
    st = await look({ apply: true });
    assert.deepEqual([st.error, st.failed, p.head()], ['not pulled: new.txt, not in git here, would be written over by the new commits — move it away, then check now', st.error, before]);
    rmSync(join(p.co, 'new.txt'));
    st = await look({ apply: true });
    assert.deepEqual([st.why, st.failed, p.head()], ['current', null, f1]);

    // the switch off: said, not taken — unless asked to (update now)
    before = p.head();
    const f = p.push({ 'public/index.html': PAGE + '<!-- f2 -->\n' });
    assert.equal(await turn(false), false);
    st = await look();
    assert.deepEqual([st.why, st.behind, p.head()], ['off', 1, before]);
    st = await look({ apply: true });
    assert.deepEqual([st.why, p.head()], ['current', f]);
    const saved = JSON.parse(readFileSync(join(srv.dir, 'state.json'), 'utf8'));
    assert.deepEqual([saved.selfUpdate, saved.autoUpdate], [false, undefined], 'the switch is the state file\'s, the old key gone');

    // a branch that moved on its own: never merged, never rebased
    p.write(p.co, { 'mine.txt': 'a commit of mine\n' }); p.git(p.co, 'add', 'mine.txt'); p.git(p.co, 'commit', '-q', '-m', 'mine');
    const mine = p.head();
    p.push({ 'public/index.html': PAGE + '<!-- g -->\n' });
    st = await look({ apply: true });
    assert.deepEqual([st.why, st.ahead, st.behind, p.head()], ['diverged', 1, 1, mine]);
  } finally { await srv.stop(); }
});

test('not a checkout — the app\'s bundled copy — says so, and pulls nothing', { timeout: 20_000 }, async () => {
  const srv = await startTestServer({ env: { UPDATE_DIR: tmpDir('peix-nogit-') } });
  try {
    const st = (await srv.post('api/update', { apply: true })).body;
    assert.deepEqual([st.checkout, st.why, st.error], [false, 'none', null]);
  } finally { await srv.stop(); }
});

test('the page follows a restart: served with a stamp of itself and the boot that served it, every snapshot names the page on disk', { timeout: 40_000 }, async () => {
  const srv = await startTestServer();
  /** the stream's snapshot, and the stream let go */
  const snapshot = async () => {
    const res = await fetch(`${srv.url}events?key=${srv.key}`), reader = res.body.getReader(), dec = new TextDecoder();
    let buf = '';
    try {
      for (;;) {
        const { value, done } = await reader.read(); if (done) throw new Error('the stream ended before its snapshot');
        buf += dec.decode(value, { stream: true });
        const m = /^event: snapshot\ndata: (.*?)\n\n/s.exec(buf); if (m) return JSON.parse(m[1]);
      }
    } finally { reader.cancel().catch(() => {}); }
  };
  try {
    const html = await (await fetch(srv.url)).text();
    const m = /<meta name="peix-page" content="([0-9a-f]{12})" data-since="(\d+)">/.exec(html);
    assert.ok(m, 'the head carries the stamp and the boot');
    assert.equal(m[1], createHash('sha1').update(readFileSync(join(ROOT, 'public', 'index.html'))).digest('hex').slice(0, 12), 'the stamp is the file\'s, not the page as served');
    const a = await snapshot();
    assert.deepEqual([a.page, a.about.since], [m[1], Number(m[2])], 'the server that served it: the same page, the same boot');
    await srv.restart();
    const b = await snapshot();
    assert.equal(b.page, m[1], 'the same page on disk');
    assert.notEqual(b.about.since, Number(m[2]), 'another boot');
  } finally { await srv.stop(); }
});

test('a commit made here while the pre-flight runs is never undone with the commit that failed it (2026-10-14)', { timeout: 60_000 }, async () => {
  const p = project();
  // npm install, as the update runs it: meanwhile a session commits in the checkout (once — the undo would install again)
  const npm = join(p.root, 'npm-commits');
  writeFileSync(npm, `#!/bin/sh\n[ -f "${p.root}/committed" ] && exit 0\ntouch "${p.root}/committed"\necho mine > "${p.co}/mine.txt"\ngit -c commit.gpgsign=false -c core.hooksPath=/dev/null -c user.name=t -c user.email=t@t -C "${p.co}" add mine.txt\ngit -c commit.gpgsign=false -c core.hooksPath=/dev/null -c user.name=t -c user.email=t@t -C "${p.co}" commit -q -m 'mine, mid-update'\n`);
  chmodSync(npm, 0o755);
  const srv = await startTestServer({ env: { ...p.env, NPM_BIN: npm, UPDATE_QUIET_MS: '60000' } });
  try {
    const c = p.push({ 'package.json': '{ "name": "tiny", "version": "2.0.0" }\n', 'server.mjs': "throw new Error('boom: this server does not start');\n" }, 'a broken server and a package');
    const st = (await srv.post('api/update', { apply: true })).body;
    assert.match(st.error, new RegExp(`^${c.slice(0, 7)} was not kept: its server did not start .* — not undone: [0-9a-f]{7} was committed on it since; the checkout stays as it is`));
    assert.equal(p.git(p.co, 'log', '-1', '--format=%s'), 'mine, mid-update', 'the commit made meanwhile is still the branch\'s');
    assert.equal(p.git(p.co, 'rev-parse', 'HEAD~1'), c);
    assert.deepEqual([st.why, st.held.to], ['held', c]);
  } finally { await srv.stop(); }
});

test('only a signed commit is taken (2026-11-06): not one unsigned, nor one a key off the list signed — not even by update now; a key the list gains is trusted once a trusted one signed it', { timeout: 60_000 }, async () => {
  const p = project();
  const srv = await startTestServer({ env: { ...p.env, UPDATE_QUIET_MS: '60000' } });
  const look = async (body = {}) => (await srv.post('api/update', body)).body;
  try {
    await waitFor(async () => (await srv.api('api/update')).body.checkout, { what: 'the checkout read at boot' });
    const first = p.head();
    const a = p.push({ 'public/index.html': PAGE + '<!-- unsigned -->\n' }, 'unsigned', { sign: false });
    let st = await look({ apply: true });
    assert.deepEqual([st.why, st.sign.ok, st.sign.why, st.behind, p.head()], ['unsigned', false, 'is not signed', 1, first], 'unsigned: said, not taken');
    assert.deepEqual(st.commits.map(c => [c.h, c.s]), [[a.slice(0, 7), 'unsigned']], 'the commits it would take, named');
    const stranger = p.keygen('stranger');
    p.push({ 'public/index.html': PAGE + '<!-- a stranger -->\n' }, 'a stranger\'s', { sign: stranger });
    st = await look({ apply: true });
    assert.deepEqual([st.why, st.sign.why, p.head()], ['unsigned', 'is not signed by a key this board trusts', first]);
    // a stranger's commit that names its own key: the list at HEAD decides, not the one it brings
    p.push({ '.github/allowed_signers': p.signers(p.signer, stranger) }, 'trust me', { sign: stranger });
    st = await look({ apply: true });
    assert.deepEqual([st.why, p.head()], ['unsigned', first]);
    // the same list signed by the trusted key: taken, and then the new key is trusted too
    const b = p.push({ '.github/allowed_signers': p.signers(p.signer, stranger), 'README.md': 'a second key\n' }, 'a second key');
    st = await look({ apply: true });
    assert.deepEqual([st.why, st.sign, p.head()], ['current', null, b], 'the tip signed by a trusted key brings the commits under it');
    const c = p.push({ 'public/index.html': PAGE + '<!-- the second key -->\n' }, 'by the second key', { sign: stranger });
    st = await look({ apply: true });
    assert.deepEqual([st.why, p.head()], ['current', c]);
  } finally { await srv.stop(); }
});

test('a rewritten history (2026-11-06) is followed when every commit here is one its tip names as rewritten, and signed — not unsigned, not over a commit of this checkout\'s own', { timeout: 90_000 }, async () => {
  const p = project(), dev = join(p.root, 'dev');
  const srv = await startTestServer({ env: { ...p.env, UPDATE_QUIET_MS: '60000' } });
  const look = async (body = {}) => (await srv.post('api/update', body)).body;
  // every commit made again, a name taken out of the README, the rewrite signed throughout; its tip names the old ones
  const rewrite = (sign = true) => {
    const named = existsSync(join(dev, '.github/rewritten')) ? readFileSync(join(dev, '.github/rewritten'), 'utf8').split('\n').filter(l => /^[0-9a-f]{40}$/.test(l)) : [];
    const old = [...named, ...p.git(dev, 'rev-list', 'HEAD').split('\n')];   // a rewrite of a rewrite names both
    for (const [k, v] of [['gpg.format', 'ssh'], ['user.signingkey', p.signer], ['commit.gpgsign', 'true']]) p.git(dev, 'config', k, v);
    p.git(dev, 'rebase', '-q', '--root', '--force-rebase', '--exec', "sed -i '' 's/the old name/a name/' README.md; git add -A && git commit -q --amend --no-edit --allow-empty");
    p.write(dev, { '.github/rewritten': `# the commits this history replaces\n${old.join('\n')}\n` });
    p.git(dev, 'add', '-A'); p.git(dev, '-c', `commit.gpgsign=${sign}`, 'commit', '-q', '-m', 'the commits it replaces');
    p.git(dev, 'push', '-q', '--force');
    return p.git(dev, 'rev-parse', 'HEAD');
  };
  try {
    await waitFor(async () => (await srv.api('api/update')).body.checkout, { what: 'the checkout read at boot' });
    p.push({ 'README.md': 'tiny, with the old name\n' }, 'a line that names it');
    p.push({ 'public/index.html': PAGE + '<!-- b -->\n' }, 'the page');
    let st = await look({ apply: true });
    assert.equal(st.why, 'current');
    const was = p.head();

    const a = rewrite(false);   // its tip unsigned: never followed
    st = await look({ apply: true });
    assert.deepEqual([st.why, st.rewritten, p.head()], ['unsigned', true, was]);

    const b = rewrite();
    st = await look();
    assert.deepEqual([st.why, st.rewritten, st.ahead > 0, st.fresh], ['off', true, true, 3], 'said, as news: what is new is the line changed and the two lists (the unsigned rewrite\'s, rewritten in its turn)');
    st = await look({ apply: true });
    assert.deepEqual([st.why, p.head(), readFileSync(join(p.co, 'README.md'), 'utf8'), st.last.rewritten, st.last.count], ['current', b, 'tiny, with a name\n', true, 3], 'onto the rewritten history');
    assert.notEqual(a, b);

    // a commit of this checkout's own, then another rewrite: diverged, as ever — never reset away
    const mine = p.commit({ 'mine.txt': 'mine\n' });
    rewrite();
    st = await look({ apply: true });
    assert.deepEqual([st.why, st.rewritten, p.head()], ['diverged', false, mine]);
  } finally { await srv.stop(); }
});

