// A PR's link asks every transcript which chats name it (2026-11-03, GET /api/named): the boot reads a long chat's two
// ends, so its chips miss what the middle said. What is checked: the middle is found though the chip is not there, a done
// chat as any other, in any case, the link's /files too; another number, repo or org is not; a link cut by a read's chunk
// is found, and a number whose last digit is past the chunk's end is not taken for a shorter one; no link is a 400.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { startTestServer, tmpDir, waitFor } from '../lib/testserver.mjs';
import { makeFixture, replyLines } from '../scripts/fixture.mjs';

const ENV = { TAIL_BYTES: '4000', HEAD_BYTES: '200' };
const LINK = 'https://github.com/acme/widgets/pull/650';

test('GET /api/named: the chats whose transcript names the PR, the middle the boot did not read too', { timeout: 40_000 }, async () => {
  const dir = tmpDir('peix-fx-'), cwd = join(dir, 'named-repo'), at = new Date(Date.now() - 3600_000), filler = 'filler '.repeat(2000);
  const [mid, plain, chip] = makeFixture(dir, [
    { cwd, title: 'Long, its PR in the middle', prompt: 'go', reply: 'ok', at, lines: id => [
      ...replyLines({ id, cwd, text: filler, at }),
      ...replyLines({ id, cwd, text: 'See https://github.com/Acme/Widgets/pull/650/files for it.', at }),
      ...replyLines({ id, cwd, text: filler, at }),
      ...replyLines({ id, cwd, text: 'all done', at }),
    ] },
    { cwd, title: 'In words alone', prompt: 'go', reply: 'see acme/widgets#650', at },
    { cwd, title: 'Its chip', prompt: 'go', reply: 'Opened https://github.com/acme/widgets/pull/651 for it.', at },
  ]).chats;
  const srv = await startTestServer({ claudeDir: dir, env: ENV });
  const named = async link => { const r = await srv.api(`api/named?pr=${encodeURIComponent(link)}`); assert.equal(r.status, 200, JSON.stringify(r.body)); return r.body.ids; };
  try {
    const chat = async id => (await srv.api('api/sessions')).body.sessions.find(s => s.id === id);
    await waitFor(async () => !!(await chat(chip.id)) && !!(await chat(plain.id)), { what: 'the fixture indexed' });
    assert.deepEqual((await chat(mid.id)).prs.map(p => p.label), [], 'the boot did not read it: no chip');
    assert.deepEqual(await named(LINK), [mid.id], 'its files page, another case: found; no link in the other chat\'s words');
    assert.deepEqual(await named('https://github.com/acme/widgets/pull/651'), [chip.id], 'a chip\'s too, in the part the boot read');
    assert.deepEqual(await named('https://github.com/acme/widgets/pull/65'), [], 'another number is no match');
    assert.deepEqual(await named('https://github.com/acme/gadgets/pull/650'), [], 'nor another repo');
    assert.deepEqual(await named('https://github.com/other/widgets/pull/650'), [], 'nor another org');

    assert.equal((await srv.post(`api/sessions/${mid.id}/done`, {})).status, 200);
    await waitFor(async () => (await chat(mid.id)).done, { what: 'ticked' });
    assert.deepEqual(await named(LINK), [mid.id], 'a done chat as any other');
    assert.deepEqual((await chat(mid.id)).prs.map(p => p.label), [], 'asking puts nothing on the chat');

    for (const q of ['nonsense', 'https://github.com/acme/widgets/issues/650', 'https://github.com/acme/widgets/pull/99999999999']) assert.equal((await srv.api(`api/named?pr=${encodeURIComponent(q)}`)).status, 400, q);
    assert.equal((await srv.api('api/named')).status, 400, 'none asked');
  } finally { await srv.stop(); }
});

test('GET /api/named: a link cut by the read\'s chunk', { timeout: 40_000 }, async () => {
  const CHUNK = 1 << 20, dir = tmpDir('peix-fx-'), cwd = join(dir, 'chunk-repo'), at = new Date(Date.now() - 3600_000);
  const [org, num, end, last] = makeFixture(dir, ['The org cut', 'The number cut', 'Its end at the chunk\'s', 'A digit past the end'].map(title => ({ cwd, title, prompt: 'go', reply: 'ok', at }))).chats;
  /** A line in the file putting `text`'s first `cut` bytes before the chunk's end and the rest after it. */
  const across = (c, text, cut) => { const head = '{"type":"file-history-snapshot","note":"'; appendFileSync(c.file, `${head}${'x'.repeat(CHUNK - statSync(c.file).size - head.length - cut)}${text}"}\n`); };
  across(org, LINK, 'https://github.com/ac'.length);
  across(num, LINK, 'https://github.com/acme/widgets/pu'.length);
  across(end, LINK, LINK.length);   // …/pull/650 to the very end of the chunk, what follows it past it
  across(last, `${LINK}7`, LINK.length);   // …and a 7 past it
  const srv = await startTestServer({ claudeDir: dir, env: ENV });
  try {
    await waitFor(async () => (await srv.api('api/sessions')).body.sessions.length >= 4, { what: 'the fixture indexed' });
    assert.deepEqual((await srv.api(`api/named?pr=${encodeURIComponent(LINK)}`)).body.ids.sort(), [org.id, num.id, end.id].sort(), 'the cut links found, and 6507 is not 650');
    assert.deepEqual((await srv.api(`api/named?pr=${encodeURIComponent(`${LINK}7`)}`)).body.ids, [last.id], 'the longer number is that one');
  } finally { await srv.stop(); }
});
