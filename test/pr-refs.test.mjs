// A PR named short (2026-10-06): `#12` is the chat's own repo's, `widgets#12` the setup's org's, `acme/widgets#12` as
// written, `widgets #12` when widgets is a checkout under a root — and none of them is on the chat until GitHub has
// found a PR there. Pure functions of server.mjs over a made-up root of checkouts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpDir } from '../lib/testserver.mjs';

const tmp = tmpDir('peix-test-'), code = join(tmp, 'code');
function checkout(name, origin) {
  mkdirSync(join(code, name, '.git'), { recursive: true });
  writeFileSync(join(code, name, '.git', 'config'), `[core]\n\tbare = false\n[remote "origin"]\n\turl = ${origin}\n\tfetch = +refs/heads/*:refs/remotes/origin/*\n`);
}
checkout('widgets', 'git@github.com:acme/widgets.git');
checkout('gadgets', 'https://github.com/acme/gadgets.git');
checkout('mine', 'git@github.com:me/mine.git');   // a repo of your own among the org's
mkdirSync(join(code, 'notes'));                    // a folder that is no checkout
// a worktree of widgets outside the root: its .git a file naming its git dir, whose commondir is the repo's
const wt = join(code, 'widgets', '.git', 'worktrees', 'wt');
mkdirSync(wt, { recursive: true }); writeFileSync(join(wt, 'commondir'), '../..\n');
mkdirSync(join(tmp, 'widgets-wt')); writeFileSync(join(tmp, 'widgets-wt', '.git'), `gitdir: ${wt}\n`);

process.env.STATE_FILE = join(tmp, 'state.json'); process.env.CLAUDE_DIR = join(tmp, 'claude'); process.env.USAGE = 'off'; process.env.NOTIFY = 'off';
process.env.ORG_DIR = code; process.env.ORG = 'acme';
const { newSession, notePrs, summary, prTitle, setPrInfo, forgetRef, ghRepoOf, sessions } = await import('../server.mjs');

const t = (d = 0) => new Date(Date.UTC(2026, 9, 6, 12) + d * 86_400_000).toISOString();
const pull = (repo, n) => `https://github.com/${repo}/pull/${n}`;
let ids = 0;
function chat(cwd) { const s = newSession(`refs-${++ids}`, `/x/refs-${ids}.jsonl`); s.cwd = cwd; sessions.set(s.id, s); return s; }
const said = (s, text, d = 0) => { notePrs(s, text, t(d), 'user'); return s.prs.map(p => `${p.url.replace('https://github.com/', '').replace('/pull/', '#')} ${p.ref || 'url'}`); };

test('the chat\'s repo is read from its checkout: the folder, one under it, a worktree elsewhere; none outside one', () => {
  assert.deepEqual(ghRepoOf(join(code, 'widgets')), { owner: 'acme', name: 'widgets' });
  mkdirSync(join(code, 'gadgets', 'src', 'lib'), { recursive: true });
  assert.deepEqual(ghRepoOf(join(code, 'gadgets', 'src', 'lib')), { owner: 'acme', name: 'gadgets' });
  assert.deepEqual(ghRepoOf(join(tmp, 'widgets-wt')), { owner: 'acme', name: 'widgets' });
  assert.equal(ghRepoOf(join(code, 'notes')), null);
});

test('#12 is the chat\'s repo, widgets#12 the org\'s, owner/repo#12 as written', () => {
  const s = chat(join(code, 'widgets'));
  assert.deepEqual(said(s, 'Fixes #12; see gadgets#3 and other/thing#4.'),
    ['other/thing#4 repo', 'acme/gadgets#3 repo', 'acme/widgets#12 bare']);
  assert.deepEqual(said(chat(join(code, 'widgets')), 'PR#10, and pr #11'), ['acme/widgets#11 bare', 'acme/widgets#10 bare'], 'PR# is no repo');
  assert.equal(said(chat(join(code, 'widgets')), 'gadgets#3 and Gadgets#3').length, 1, 'one PR whatever the case');
  assert.deepEqual(said(chat(join(code, 'widgets')), `#12, then ${pull('acme/widgets', 12)} and #14`), ['acme/widgets#14 bare', 'acme/widgets#12 url'],
    'said twice in a message: where first said, as the fullest way it was said');
});

test('widgets #12 when widgets is a checkout under a root, and a list after it is its too — on one line', () => {
  const s = chat(join(code, 'widgets'));
  assert.deepEqual(said(s, 'gadgets #5, #6 and #7, then #8. **gadgets** PR #9\n#13'), [
    'acme/widgets#13 bare', 'acme/gadgets#9 repo', 'acme/widgets#8 bare', 'acme/gadgets#7 repo', 'acme/gadgets#6 repo', 'acme/gadgets#5 repo']);
  assert.deepEqual(said(chat(join(code, 'widgets')), 'notes #4 and the #5'), ['acme/widgets#5 bare', 'acme/widgets#4 bare'], 'a folder that is no checkout names nothing');
});

test('code, a link\'s text, a URL\'s fragment, an entity and a colour are no references', () => {
  const s = chat(join(code, 'widgets'));
  assert.deepEqual(said(s, 'a `#20` and\n```\n# 1\n#21\n```\n[#22](https://github.com/acme/gadgets/pull/22) https://example.com/page#23 &#24; #000 #0a0 x#y C#'),
    ['acme/gadgets#22 url']);
  assert.deepEqual(said(chat(join(code, 'widgets')), '`widgets` #25'), ['acme/widgets#25 repo'], 'a name in code still names the repo after it');
});

test('a repo of your own under the org\'s root: its name is yours, any other the org\'s', () => {
  const s = chat(join(code, 'mine'));
  assert.deepEqual(said(s, '#5, mine#3 and widgets#4'), ['acme/widgets#4 repo', 'me/mine#3 repo', 'me/mine#5 bare']);
});

test('outside a checkout a bare #n names nothing, and a repo\'s name is the one root\'s org\'s', () => {
  assert.deepEqual(said(chat(join(code, 'notes')), '#7 and gadgets#7'), ['acme/gadgets#7 repo']);
  assert.deepEqual(said(chat(join(tmp, 'widgets-wt')), '#6'), ['acme/widgets#6 bare'], 'a worktree\'s is its repo\'s');
});

test('a short reference is on the chat once GitHub finds a PR there; a bare one to an old PR long closed is not', () => {
  const s = chat(join(code, 'widgets'));
  said(s, `#40, gadgets#41. Then #42 and ${pull('acme/widgets', 43)}`, 0);
  const shown = () => summary(s).prs.map(p => p.label);
  assert.deepEqual(shown(), ['widgets#43'], 'a URL at once; the short ones once GitHub says');
  setPrInfo(pull('acme/widgets', 40), 'open', 'Forty', null, Date.now(), undefined, false, '2015-01-01T00:00:00Z');
  setPrInfo(pull('acme/gadgets', 41), 'merged', 'Forty-one', null, Date.now(), undefined, false, '2015-01-01T00:00:00Z');
  setPrInfo(pull('acme/widgets', 42), 'merged', 'Forty-two', null, Date.now(), undefined, false, '2015-01-01T00:00:00Z');
  assert.deepEqual(shown(), ['widgets#43', 'gadgets#41', 'widgets#40'], 'open, or named with its repo — an old merged #42 is a numbered point');
  assert.equal(prTitle(s), 'Forty', 'nor does it title the card');
  setPrInfo(pull('acme/widgets', 42), 'merged', 'Forty-two', null, Date.now(), undefined, false, t(-30));
  assert.deepEqual(shown(), ['widgets#43', 'widgets#42', 'gadgets#41', 'widgets#40'], 'merged a month before it was said: the chat\'s');
  said(s, 'widgets#44 then #44', 1);
  setPrInfo(pull('acme/widgets', 44), 'closed', 'Forty-four', null, Date.now(), undefined, false, '2015-01-01T00:00:00Z');
  assert.ok(shown().includes('widgets#44'), 'once named with its repo, a later bare #44 does not hide it');
  const old = chat(join(code, 'widgets'));
  said(old, 'like gadgets#61 did');
  setPrInfo(pull('acme/gadgets', 61), 'merged', 'Sixty-one', null, Date.now(), undefined, false, '2015-01-01T00:00:00Z');
  assert.deepEqual([summary(old).prs.map(p => p.label), prTitle(old)], [['gadgets#61'], null], 'an old one named with its repo is shown, and titles nothing');
});

test('where GitHub has no PR, a chat that had it from a short reference lets it go, and does not take it up again', () => {
  const a = chat(join(code, 'widgets')), b = chat(join(code, 'gadgets'));
  said(a, '#50 and #51'); said(b, `see ${pull('acme/widgets', 50)}`);
  forgetRef(pull('acme/widgets', 50));
  assert.deepEqual(a.prs.map(p => p.number), [51]);
  assert.deepEqual(b.prs.map(p => p.number), [50], 'a URL said is the chat\'s whatever GitHub says');
  said(a, 'about #50 again');
  assert.deepEqual(a.prs.map(p => p.number), [51], 'not taken up again');
  said(a, pull('acme/widgets', 50));
  assert.deepEqual(a.prs.map(p => [p.number, p.ref]), [[50, null], [51, 'bare']], 'unless said in full');
});
