// The branch moved under a chat (2026-10-13): a change of the transcript's gitBranch that no git command of the chat's
// own explains is drift — its own switch, a sub-agent's, a `!` command of yours, or one Claude Code's lagging branch
// only shows hours later are not; a move through HEAD and back is not; a word of yours clears it. And the disk's half:
// the checkout's HEAD read as a file, a worktree's its own, against the branch the chat's lines last said.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { driftOf, fold, headOf, newSession, noteHead, settleDrift } from '../server.mjs';

const CWD = '/Users/test/widgets';
const T0 = Date.parse('2026-10-13T09:00:00Z'), at = s => new Date(T0 + s * 1000).toISOString();
const base = (t, branch, cwd = CWD) => ({ timestamp: at(t), gitBranch: branch, cwd });
const user = (t, branch, text) => ({ ...base(t, branch), type: 'user', message: { role: 'user', content: text } });
const bash = (t, branch, command, id = randomUUID()) => ({ ...base(t, branch), type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id, name: 'Bash', input: { command } }], stop_reason: 'tool_use' } });
const result = (t, branch, id = 'x') => ({ ...base(t, branch), type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: 'ok' }] } });
const say = (t, branch, text = 'working on it') => ({ ...base(t, branch), type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text }], stop_reason: 'tool_use' } });
const chat = (...lines) => { const s = newSession(randomUUID(), null); s.alive = true; for (const l of lines) fold(s, l); settleDrift(s); return s; };
const moved = s => { const d = driftOf(s); return d && `${d.from} → ${d.to}`; };

test('a change no git of the chat\'s own explains is drift; a word of yours clears it', () => {
  const s = chat(user(0, 'feat/tax-rounding', 'round the tax'), say(5, 'feat/tax-rounding'), result(10, 'feat/tax-rounding'), say(20, 'main'));
  assert.equal(moved(s), 'feat/tax-rounding → main', 'from the branch the chat was on, to the one its lines carry now');
  assert.equal(s.drift.at, at(20));
  assert.deepEqual(s.branches.map(b => b.name), ['feat/tax-rounding', 'main'], 'the branches it was on, last few');
  fold(s, say(25, 'main'));
  assert.equal(moved(s), 'feat/tax-rounding → main', 'it stands while Claude goes on');
  fold(s, user(30, 'main', 'ok, carry on on main'));
  assert.equal(moved(s), null, 'your word clears it');
  s.alive = false; fold(s, say(40, 'feat/other')); settleDrift(s);
  assert.ok(s.drift, 'the transcript still says it…');
  assert.equal(driftOf(s), null, '…but only a chat whose claude runs shows it');
});

test('the chat\'s own switch, a `!` command of yours and one a sub-agent ran are no drift', () => {
  const own = chat(user(0, 'main', 'start the branch'), bash(5, 'main', 'git switch -c feat/tax-rounding'), result(6, 'main'), say(8, 'feat/tax-rounding'));
  assert.equal(moved(own), null, 'its own git switch');
  const opts = chat(user(0, 'main', 'go'), bash(5, 'main', 'git -C "/Users/test/widgets" --no-pager checkout feat/x'), say(8, 'feat/x'));
  assert.equal(moved(opts), null, 'git\'s own options before the subcommand');
  const mine = chat(user(0, 'main', 'look'), user(5, 'main', '<bash-input>git checkout feat/x</bash-input>'), user(6, 'main', '<bash-stdout>Switched to branch \'feat/x\'</bash-stdout><bash-stderr></bash-stderr>'), say(9, 'feat/x'));
  assert.equal(moved(mine), null, 'a ! command typed into the chat');
  const msg = chat(user(0, 'main', 'commit it'), bash(5, 'main', 'git commit -m "merge the rounding fix"'), say(9, 'feat/x'));
  assert.equal(moved(msg), 'main → feat/x', 'a commit whose message says merge moves nothing');
  const side = newSession(randomUUID(), null); side.alive = true;
  for (const l of [user(0, 'main', 'go'), { ...bash(4, 'main', 'git checkout feat/side'), isSidechain: true }, say(9, 'feat/side')]) fold(side, l);
  settleDrift(side);
  assert.equal(moved(side), null, 'a sub-agent\'s line in the chat\'s own transcript');
});

test('a sub-agent\'s own transcript explains a move, read only when nothing else does', () => {
  const dir = mkdtempSync(join(tmpdir(), 'peix-drift-')), id = randomUUID();
  try {
    const file = join(dir, `${id}.jsonl`), agents = join(dir, id, 'subagents');
    mkdirSync(agents, { recursive: true }); writeFileSync(file, '');
    const s = newSession(id, file); s.alive = true;
    for (const l of [user(0, 'main', 'have an agent do it'), say(5, 'main'), say(60, 'feat/agent')]) fold(s, l);
    assert.ok(s.drift, 'unexplained as the lines are folded');
    writeFileSync(join(agents, 'agent-a1.jsonl'), [say(1, 'main', 'on it'), bash(30, 'main', 'git checkout -b feat/agent')].map(l => JSON.stringify({ ...l, isSidechain: true })).join('\n') + '\n');
    settleDrift(s);
    assert.equal(moved(s), null, 'the agent\'s checkout, found once the batch is folded');
    fold(s, say(4000, 'feat/elsewhere')); settleDrift(s);
    assert.equal(moved(s), 'feat/agent → feat/elsewhere', 'an agent\'s command over an hour old and not naming it explains nothing');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('Claude Code\'s branch lags the chat\'s own checkout — by hours, the command still names it', () => {
  const s = chat(user(0, 'main', 'start'), bash(5, 'main', 'git checkout -b feat/slow'), result(6, 'main'), say(7, 'main'), say(3 * 3600, 'feat/slow'));
  assert.equal(moved(s), null, 'three hours later, the checkout named the branch');
  const t = chat(user(0, 'main', 'tidy up'), bash(5, 'main', 'git stash'), say(6, 'main'), say(2 * 3600, 'feat/other'));
  assert.equal(moved(t), 'main → feat/other', 'a stash two hours before explains nothing');
});

test('through HEAD and back is no drift; through HEAD elsewhere is', () => {
  const s = chat(user(0, 'feat/x', 'go'), say(5, 'feat/x'), say(10, 'HEAD'), say(15, 'HEAD'), say(20, 'feat/x'));
  assert.equal(moved(s), null, 'a rebase by someone else, and back');
  assert.deepEqual(s.branches.map(b => b.name), ['feat/x', 'HEAD', 'feat/x']);
  const t = chat(user(0, 'feat/x', 'go'), say(5, 'feat/x'), say(10, 'HEAD'), say(20, 'feat/y'));
  assert.equal(moved(t), 'feat/x → feat/y', 'detached, then landed elsewhere');
  const u = chat(user(0, 'feat/x', 'go'), say(5, 'main'), say(10, 'feat/y'));
  assert.equal(moved(u), 'feat/x → feat/y', 'moved twice: from where the chat was before anything moved');
  const v = chat(user(0, 'feat/x', 'go'), say(5, 'main'), say(10, 'feat/x'));
  assert.equal(moved(v), null, 'moved back where the chat was');
  const w = chat(user(0, 'feat/x', 'go'), { ...say(5, 'main'), cwd: '/Users/test/other' });
  assert.equal(moved(w), null, 'another folder is another branch');
});

test('the head is read from the checkout\'s HEAD file — a worktree\'s its own — and judged against the lines', () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'peix-head-'))), repo = join(dir, 'widgets'), wt = join(dir, 'widgets-wt');
  const git = (cwd, ...a) => execFileSync('git', ['-C', cwd, ...a], { stdio: 'pipe', env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' } });
  try {
    mkdirSync(join(repo, 'src'), { recursive: true });
    git(repo, 'init', '-q', '-b', 'main');
    writeFileSync(join(repo, 'a.txt'), 'a\n'); git(repo, 'add', '.'); git(repo, '-c', 'user.name=t', '-c', 'user.email=t@example.com', 'commit', '-qm', 'one');
    assert.equal(headOf(repo), 'main');
    assert.equal(headOf(join(repo, 'src')), 'main', 'from a folder inside it');
    git(repo, 'worktree', 'add', '-q', '-b', 'feat/wt', wt);
    assert.deepEqual([headOf(wt), headOf(repo)], ['feat/wt', 'main'], 'a worktree has a HEAD of its own');
    git(repo, 'checkout', '-q', '--detach');
    assert.equal(headOf(repo), 'HEAD', 'detached, as Claude Code writes it');
    assert.equal(headOf(dir), null, 'no checkout');
    git(repo, 'checkout', '-q', 'main');

    const s = chat({ ...user(0, 'feat/tax-rounding', 'round it'), cwd: repo });
    const now = T0 + 60_000;
    assert.equal(noteHead(s, headOf(repo), now), true);
    assert.equal(s.headNow, 'main');
    assert.equal(moved(s), 'feat/tax-rounding → main', 'the folder is on main, the chat\'s lines on feat/tax-rounding');
    assert.equal(noteHead(s, 'main', now + 10_000), false, 'the same move, judged once');
    noteHead(s, 'feat/tax-rounding', now + 20_000);
    assert.equal(moved(s), null, 'back on the chat\'s branch');
    noteHead(s, 'HEAD', now + 30_000);
    assert.equal(moved(s), null, 'detached says nothing yet');

    const own = chat({ ...user(0, 'feat/a', 'switch'), cwd: repo }, { ...bash(5, 'feat/a', 'git checkout main'), cwd: repo });
    noteHead(own, 'main', T0 + 2 * 3600_000);
    assert.equal(moved(own), null, 'its own checkout, its lines not caught up yet — however long that takes');

    const heard = chat({ ...user(0, 'feat/a', 'go'), cwd: repo });
    noteHead(heard, 'main', now);
    assert.equal(moved(heard), 'feat/a → main');
    fold(heard, { ...user(100, 'feat/a', 'fine, stay on main'), cwd: repo });
    noteHead(heard, 'main', now + 120_000);
    assert.equal(moved(heard), null, 'your word took the head as it stood, the line still saying feat/a');
    fold(heard, { ...say(130, 'main'), cwd: repo }); settleDrift(heard);
    assert.equal(moved(heard), null, '…and the lines catching up later are no move either');

    const twice = chat({ ...user(0, 'feat/a', 'go'), cwd: repo }, { ...say(10, 'main'), cwd: repo });
    noteHead(twice, 'feat/b', now);
    assert.equal(moved(twice), 'feat/a → feat/b', 'the disk\'s newer word, from where the chat was before anything moved');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
