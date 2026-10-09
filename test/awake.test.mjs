// Keeping the Mac awake (2026-10-08): the switch holds a caffeinate of the server's own while it is on — and again after
// a restart —, and the lid's setting is pmset's, set through it and read back from it; so are the idle sleep in use and
// the power drawn from (2026-10-09). A throwaway server with the fakes every test server gets (scripts/fakecaffeinate.mjs,
// scripts/fakepmset.mjs, AWAKE_ADMIN=none).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { alive, startTestServer, waitFor } from '../lib/testserver.mjs';

const put = (srv, body) => srv.api('api/awake', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

test('awake: a caffeinate while the switch is on, on again after a restart, gone when it is off', { timeout: 40_000 }, async () => {
  const srv = await startTestServer({ env: { FAKE_CAFFEINATE_PIDS: '' } });
  const pids = join(srv.dir, 'caffeinate.pids'); srv.env.FAKE_CAFFEINATE_PIDS = pids;   // read by the next launch: restart() below
  try {
    assert.deepEqual((await srv.api('api/awake')).body, { awake: false, lid: false, idleSleep: 1, power: 'battery' }, 'off to begin with, on the fake\'s battery');
    await srv.restart();   // now with FAKE_CAFFEINATE_PIDS set
    const on = await put(srv, { awake: true });
    assert.deepEqual([on.status, on.body.awake], [200, true]);
    const lines = () => existsSync(pids) ? readFileSync(pids, 'utf8').trim().split('\n') : [];
    const last = () => lines().at(-1).split(' ');
    await waitFor(() => lines().length === 1, { what: 'caffeinate started' });
    const [pid, ...args] = last();
    assert.deepEqual(args.slice(0, 2), ['-i', '-w'], 'caffeinate -i, waiting on the server');
    assert.equal(Number(args[2]), srv.proc.pid);
    assert.ok(alive(Number(pid)), 'holding');
    assert.equal(JSON.parse(readFileSync(join(srv.dir, 'state.json'), 'utf8')).awake, true, 'the switch is in the state file');

    await srv.restart();
    await waitFor(async () => (await srv.api('api/awake')).body.awake === true && lines().length === 2, { what: 'awake again after the restart' });
    const [pid2] = last();
    assert.notEqual(pid2, pid, 'a caffeinate of the new server\'s own');
    await waitFor(() => !alive(Number(pid)), { what: 'the old server\'s caffeinate gone with it (-w)' });

    const off = await put(srv, { awake: false });
    assert.deepEqual([off.status, off.body.awake], [200, false]);
    await waitFor(() => !alive(Number(pid2)), { what: 'caffeinate ended with the switch' });
    assert.equal(JSON.parse(readFileSync(join(srv.dir, 'state.json'), 'utf8')).awake, false);
    assert.equal((await put(srv, {})).status, 400, 'a body that says neither is refused');
  } finally { await srv.stop(); }
});

test('lid: pmset disablesleep, read back — whoever set it — and a failure said', { timeout: 30_000 }, async () => {
  const srv = await startTestServer();
  try {
    const on = await put(srv, { lid: true });
    assert.deepEqual([on.status, on.body.lid], [200, true]);
    assert.equal(readFileSync(join(srv.dir, 'pmset'), 'utf8'), '1', 'pmset -a disablesleep 1');
    assert.ok(!existsSync(join(srv.dir, 'state.json')) || !('lid' in JSON.parse(readFileSync(join(srv.dir, 'state.json'), 'utf8'))), 'the system\'s setting, not the board\'s');
    writeFileSync(join(srv.dir, 'pmset'), '0');   // set back elsewhere: the poll follows
    await waitFor(async () => (await srv.api('api/awake')).body.lid === false, { what: 'the lid read back from pmset' });
    srv.env.FAKE_PMSET_FAIL = 'pmset: must be run as root';
    await srv.restart();
    const fail = await put(srv, { lid: true });
    assert.deepEqual([fail.status, fail.body.error, fail.body.lid], [500, 'pmset: must be run as root', false]);
  } finally { await srv.stop(); }
});

test('power: the idle sleep the Mac is set to on the power it draws from, and that power, as pmset says', { timeout: 20_000 }, async () => {
  const srv = await startTestServer();
  const power = async () => (({ idleSleep, power }) => ({ idleSleep, power }))((await srv.api('api/awake')).body);
  try {
    assert.deepEqual(await power(), { idleSleep: 1, power: 'battery' }, 'on battery, asleep a minute after the display');
    writeFileSync(join(srv.dir, 'pmset-power'), 'ac 0');   // the charger in, set never to sleep on it
    assert.deepEqual(await power(), { idleSleep: 0, power: 'ac' });
    writeFileSync(join(srv.dir, 'pmset-power'), 'ac 10');
    assert.deepEqual(await power(), { idleSleep: 10, power: 'ac' }, 'a charger that still sleeps');
  } finally { await srv.stop(); }
});

test('stats: CPU, memory and the claudes\' memory, each only when asked (2026-10-09, the status bar)', { timeout: 20_000 }, async () => {
  const srv = await startTestServer();
  try {
    assert.deepEqual((await srv.api('api/stats')).body, {}, 'nothing asked, nothing said');
    const all = (await srv.api('api/stats?want=cpu,mem,claude')).body;
    assert.ok(Number.isInteger(all.cpu) && all.cpu >= 0 && all.cpu <= 100, `a share of the cores: ${all.cpu}`);
    assert.ok(all.mem.used > 0 && all.mem.used <= all.mem.total, `used of total: ${JSON.stringify(all.mem)}`);
    assert.deepEqual(all.claude, { rss: 0, n: 0 }, 'no live claude in an empty ~/.claude');
    assert.deepEqual(Object.keys((await srv.api('api/stats?want=mem')).body), ['mem']);
  } finally { await srv.stop(); }
});
