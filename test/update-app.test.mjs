// The board's own update (2026-10-12), the app's half: an installed app behind its checkout with nothing to pull — said,
// rebuilt by update now or the switch, never over work in mac/, by the switch not twice for one source (2026-10-14).
// The project is test/update-project.mjs's; the pull itself is test/update.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { startTestServer, waitFor } from '../lib/testserver.mjs';
import { project } from './update-project.mjs';

test('an app behind its checkout with nothing to pull: said, rebuilt by update now — never over work in mac/, by the switch not twice for one source', { timeout: 60_000 }, async () => {
  const p = project();
  p.stamp('0'.repeat(40));   // built from an older mac/ — or before the stamp
  const srv = await startTestServer({ env: { ...p.env, UPDATE_QUIET_MS: '60000' } });
  const look = async (body = {}) => (await srv.post('api/update', body)).body;
  const now = async () => (await srv.api('api/update')).body;
  try {
    let st = await look();
    assert.deepEqual([st.why, st.app.behind, st.appWhy, p.builds()], ['current', true, 'off', 0], 'nothing to pull, the app behind: said, not rebuilt with the switch off');
    p.write(p.co, { 'mac/Sources/more.swift': '// half written\n' });
    st = await look({ apply: true });
    assert.deepEqual([st.app.changes, st.appWhy, p.builds()], [1, 'changes', 0], 'never over work in mac/, even asked');
    rmSync(join(p.co, 'mac/Sources/more.swift'));
    await look({ apply: true });
    await waitFor(() => p.builds() === 1, { what: 'update now rebuilding it' });
    st = await waitFor(async () => { const b = await now(); return !b.building && b.app?.behind === false && b; }, { what: 'the app rebuilt and stamped' });
    assert.deepEqual([st.build.ok, st.build.source, st.app.built, st.appWhy], [true, st.app.source, st.app.source, 'none']);

    // a commit made here: no pull ever brings it, and the app is behind it all the same
    const swift = readFileSync(join(p.co, 'mac/Sources/main.swift'), 'utf8');
    p.commit({ 'mac/Sources/main.swift': swift + '// mine\n' });
    st = await look();
    assert.deepEqual([st.why, st.ahead, st.app.behind, st.appWhy], ['current', 1, true, 'off']);
    // the switch on, and asked: rebuilt at once — one that fails is said, and not tried again but by the button
    p.flag('build-fails', true);
    await srv.api('api/update', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ on: true }) });
    await look();
    st = await waitFor(async () => { const b = await now(); return b.build?.done && b.appWhy !== 'building' && b; }, { what: 'the failed build\'s end' });
    assert.deepEqual([st.build.ok, st.app.behind, st.appWhy, p.builds()], [false, true, 'tried', 2]);
    st = await look();
    assert.deepEqual([st.appWhy, p.builds()], ['tried', 2], 'not twice for one source');
    p.flag('build-fails', false);
    await look({ apply: true });
    st = await waitFor(async () => { const b = await now(); return !b.building && b.app?.behind === false && b; }, { what: 'update now tries it again' });
    assert.deepEqual([st.build.ok, p.builds()], [true, 3]);

    // mac/'s notes are no part of the app (2026-10-28): a note committed, or being written, leaves it current
    p.commit({ 'mac/CLAUDE.md': '# the shell\n', 'mac/Sources/NOTES.md': 'more\n' });
    p.write(p.co, { 'mac/CLAUDE.md': '# the shell, still being written\n' });
    st = await look({ apply: true });
    assert.deepEqual([st.app.behind, st.app.changes, st.appWhy, p.builds()], [false, 0, 'none', 3], 'a note is no rebuild');
  } finally { await srv.stop(); }
});
