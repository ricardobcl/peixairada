// Which PRs the registry poll asks GitHub about: by how recently their chat was touched — a word in it, or a page
// opening it — every minute, five, thirty, then not at all; never twice once merged or closed. Pure: duePrs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'peix-test-'));
process.env.STATE_FILE = join(tmp, 'state.json'); process.env.CLAUDE_DIR = join(tmp, 'claude'); process.env.USAGE = 'off'; process.env.NOTIFY = 'off';
const { newSession, notePr, duePrs, prStatus } = await import('../server.mjs');

const NOW = Date.UTC(2026, 8, 28, 12);
const MIN = 60_000, HOUR = 60 * MIN, DAY = 24 * HOUR;
const url = n => `https://github.com/acme/r/pull/${n}`;
function chat(id, touched, ...prs) {
  const s = newSession(id, `/x/${id}.jsonl`);
  s.lastActivity = new Date(NOW - touched).toISOString();
  for (const n of prs) notePr(s, url(n), s.lastActivity, 'user');
  return s;
}
const checked = (n, ago, state = 'open') => prStatus.set(url(n), { state, title: 'PR ' + n, checkedAt: NOW - ago });
const due = list => duePrs(list, NOW).map(u => Number(u.split('/').pop()));

test('never asked about is due whatever the chat\'s age, the most recently touched chat\'s first', () => {
  prStatus.clear();
  assert.deepEqual(due([chat('a', 10 * DAY, 1), chat('b', 2 * MIN, 2), chat('c', 2 * DAY, 3)]), [2, 3, 1]);
});

test('the older the chat, the less often: a minute, five minutes, half an hour, then never', () => {
  prStatus.clear();
  const list = [chat('h', 10 * MIN, 1), chat('d', 5 * HOUR, 2), chat('w', 2 * DAY, 3), chat('o', 4 * DAY, 4)];
  for (const n of [1, 2, 3, 4]) checked(n, 90_000);
  assert.deepEqual(due(list), [1]);
  for (const n of [1, 2, 3, 4]) checked(n, 6 * MIN);
  assert.deepEqual(due(list), [1, 2]);
  for (const n of [1, 2, 3, 4]) checked(n, 31 * MIN);
  assert.deepEqual(due(list), [1, 2, 3]);
  for (const n of [1, 2, 3, 4]) checked(n, 30 * DAY);
  assert.deepEqual(due(list), [1, 2, 3]);   // four days old: asked once at boot, then left alone
});

test('opening a chat makes its PRs recent again', () => {
  prStatus.clear();
  const s = chat('o', 5 * DAY, 1);
  checked(1, 2 * MIN);
  assert.deepEqual(due([s]), []);
  s.openedAt = NOW - 30 * MIN;
  assert.deepEqual(due([s]), [1]);
});

test('a PR in two chats goes by the more recent one', () => {
  prStatus.clear();
  checked(1, 2 * MIN);
  assert.deepEqual(due([chat('old', 5 * DAY, 1)]), []);
  assert.deepEqual(due([chat('old', 5 * DAY, 1), chat('new', 5 * MIN, 1)]), [1]);
});

test('merged and closed are never asked twice; one we cannot see backs off an hour', () => {
  prStatus.clear();
  const s = chat('h', MIN, 1, 2, 3);
  checked(1, DAY, 'merged'); checked(2, DAY, 'closed'); checked(3, 30 * MIN, null);
  assert.deepEqual(due([s]), []);
  checked(3, 61 * MIN, null);
  assert.deepEqual(due([s]), [3]);
});
