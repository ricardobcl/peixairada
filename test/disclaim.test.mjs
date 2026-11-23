// A drawer's claude answers to macOS for itself (2026-11-23): lib/disclaim.c execs a program in the same pid with its
// responsibility disclaimed, and the server runs a drawer's claude through it — never a zsh. Read off the kernel's own
// answer (responsibility_get_pid_responsible_for_pid, by a probe built here): a TCC check asks the same of it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startTestServer, tmpDir, waitFor } from '../lib/testserver.mjs';
import { defaultFixture } from '../scripts/fixture.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const tools = (() => { try { return process.platform === 'darwin' && existsSync(execFileSync('/usr/bin/xcode-select', ['-p'], { encoding: 'utf8' }).trim()); } catch { return false; } })();
const skip = !tools && 'needs macOS and its developer tools (cc)';

const PROBE = `#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
pid_t responsibility_get_pid_responsible_for_pid(pid_t) __attribute__((weak_import));
int main(int argc, char **argv) { pid_t p = argc > 1 ? atoi(argv[1]) : getpid();
  printf("%d %d\\n", p, responsibility_get_pid_responsible_for_pid ? responsibility_get_pid_responsible_for_pid(p) : -1); return 0; }
`;
let built = null;
function build() {
  if (built) return built;
  const dir = tmpDir('peix-disclaim-');
  writeFileSync(join(dir, 'probe.c'), PROBE);
  execFileSync('/usr/bin/cc', ['-o', join(dir, 'probe'), join(dir, 'probe.c')]);
  execFileSync('/usr/bin/cc', ['-O2', '-Wall', '-Werror', '-o', join(dir, 'disclaim'), join(ROOT, 'lib', 'disclaim.c')]);
  return built = { probe: join(dir, 'probe'), disclaim: join(dir, 'disclaim') };
}
const responsible = (probe, pid) => Number(execFileSync(probe, [String(pid)], { encoding: 'utf8' }).trim().split(' ')[1]);

test('disclaim runs a program in its own pid, responsible for itself; a program not there is 127', { skip }, () => {
  const { probe, disclaim } = build();
  const [own, resp] = execFileSync(probe, { encoding: 'utf8' }).trim().split(' ').map(Number);
  assert.notEqual(resp, own, 'a program started here answers to whoever started this test');
  const [own2, resp2] = execFileSync(disclaim, [probe], { encoding: 'utf8' }).trim().split(' ').map(Number);
  assert.equal(resp2, own2, 'through disclaim, to itself');
  // an exec, not a child: the pid the shell had is the program's
  const pids = execFileSync('/bin/sh', ['-c', 'echo $$; exec "$0" /bin/sh -c \'echo $$\'', disclaim], { encoding: 'utf8' }).trim().split('\n');
  assert.equal(pids.length, 2); assert.equal(pids[0], pids[1], `the same pid before and after: ${pids}`);
  const gone = spawnSync(disclaim, ['peix-no-such-program'], { encoding: 'utf8' });
  assert.equal(gone.status, 127); assert.match(gone.stderr, /disclaim: peix-no-such-program: No such file/);
});

test('a drawer\'s claude is its own responsible process, a zsh tab is not (2026-11-23)', { skip, timeout: 60_000 }, async () => {
  const { probe } = build();
  const fx = defaultFixture(tmpDir('peix-fx-'), { cwdA: process.cwd(), cwdB: tmpdir() });
  const chat = fx.chats[1];
  const srv = await startTestServer({ claudeDir: fx.dir, fake: true });
  try {
    const r = await srv.post(`api/sessions/${chat.id}/terminal`, { cols: 100, rows: 30 });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const t = r.body.terminal;
    const spec = JSON.parse(readFileSync(join(srv.dir, 'terms', `${t.id}.json`), 'utf8'));
    assert.ok(spec.disclaim?.startsWith(join(srv.dir, 'bin', 'disclaim-')), `the spec runs claude through the state folder's build: ${spec.disclaim}`);
    // the registry's pid is still the PTY's: the fake registers it, and the chat is alive on it
    await waitFor(async () => { const s = (await srv.api('api/sessions')).body.sessions.find(s => s.id === chat.id); return s.alive && s.live?.pid === t.pid; }, { what: 'the chat alive on the drawer\'s pid' });
    assert.equal(responsible(probe, t.pid), t.pid, 'claude answers to macOS for itself');
    const z = await srv.post(`api/sessions/${chat.id}/shell`, { cols: 100, rows: 30 });
    assert.equal(z.status, 201, JSON.stringify(z.body));
    const zs = JSON.parse(readFileSync(join(srv.dir, 'terms', `${z.body.terminal.id}.json`), 'utf8'));
    assert.equal(zs.disclaim, undefined, 'a zsh runs as it did');
    assert.notEqual(responsible(probe, z.body.terminal.pid), z.body.terminal.pid, 'and answers to the board');
  } finally { await srv.stop(); }
});
