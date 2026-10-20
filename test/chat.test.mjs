// The chat (2026-10-17): a private GitHub repo whose oldest open issue labelled `room` is the chat — one, with no name
// (2026-10-18) — and whose comments are the messages. The setup's key (cleanSetup), and end to end against a fake GitHub: the owner's board reads the repo, turns
// GitHub's mails off, counts unread, takes what another board said, edited and deleted, sends one write at a time, and
// manages the people — the suggestions from its chats' PRs, an invitation, a cancel, a removal; a member's board
// finds the invitation, joins as a reader, may not manage, and leaves; the look that finds nothing new is a 304; a
// repo made from the board, and where one could be (the organizations you own, the chats you can read); a poll, its votes
// GitHub's reactions (2026-10-20). The page's chat module is held to drawing words only: it reaches no drawer.
import './env.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { startTestServer, tmpDir, waitFor } from '../lib/testserver.mjs';
import { makeFixture } from '../scripts/fixture.mjs';
import { startFakeGitHub } from '../scripts/fakegithub.mjs';
import { cleanSetup, pollBody, pollOf } from '../server.mjs';

test('cleanSetup: the chat\'s repo as owner/name, from its address too; null or an empty one is none', () => {
  for (const v of ['acme-chat/room', ' https://github.com/acme-chat/room.git ', 'github.com/acme-chat/room/']) assert.deepEqual(cleanSetup({ chat: { repo: v } }, true).setup.chat, { repo: 'acme-chat/room' }, v);
  assert.equal(cleanSetup({ chat: null }, true).setup.chat, null);
  assert.equal(cleanSetup({ chat: { repo: '' } }, true).setup.chat, null);
  assert.match(cleanSetup({ chat: { repo: 'acme-chat' } }, true).error, /not a GitHub repo/);
  assert.equal('chat' in cleanSetup({ chat: { repo: 'no way/x' } }).setup, false, 'the file\'s own: shaped, a bad one dropped');
});

const face = (login, fill) => ({ login, __typename: 'User', avatarUrl: 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" fill="${fill}"/></svg>`) });
const ago = min => new Date(Date.now() - min * 60_000).toISOString().replace(/\.\d+Z$/, 'Z');
const FAST = { CHAT_FAST_MS: '250', CHAT_SLOW_MS: '250', CHAT_GAP_MS: '30' };
/** The board's event stream, as text: what it said since `mark()`. */
async function stream(srv) {
  const r = await fetch(`${srv.url}events?key=${srv.key}`), dec = new TextDecoder(), reader = r.body.getReader();
  const s = { text: '', from: 0, mark() { s.from = s.text.length; }, since: () => s.text.slice(s.from), close: () => reader.cancel().catch(() => {}) };
  (async () => { for (;;) { const { value, done } = await reader.read().catch(() => ({ done: true })); if (done) return; s.text += dec.decode(value, { stream: true }); } })();
  return s;
}

test('end to end: the owner\'s board and a member\'s, over a fake GitHub', { timeout: 90_000 }, async () => {
  const gh = await startFakeGitHub({ users: ['me', 'ana', 'rui', 'eva'], orgs: { 'acme-chat': ['me'] }, repos: {
    'acme-chat/room': { perms: { ana: 'pull' }, rooms: [
      { title: 'General', comments: [['ana', 'hello'], ['me', 'hi ana']] },
      { title: 'Random', comments: [['ana', 'elsewhere']] },
      { title: 'a bug, not a room', labels: [], comments: [['ana', 'not chat']] },
    ] },
    'acme/other': { perms: { me: 'pull' }, description: 'some other repo' },
  } });
  // a PR in one of the owner's chats, eva its author and ana its reviewer: whom the board suggests
  const dir = tmpDir('peix-chat-'), prs = join(dir, 'prs.json');
  writeFileSync(prs, JSON.stringify({ 'acme/app#1': { state: 'OPEN', title: 'One', createdAt: ago(300), headRefOid: 'A', author: face('eva', '#d9a82a'),
    reviews: { nodes: [{ author: face('ana', '#2f9e5b'), state: 'APPROVED', submittedAt: ago(30) }] }, comments: { nodes: [] }, pushes: { nodes: [] }, asks: { nodes: [] }, reviewRequests: { nodes: [] } } }));
  const fx = makeFixture(join(dir, 'claude'), [{ cwd: process.cwd(), prompt: 'look at https://github.com/acme/app/pull/1', reply: 'looked' }]);
  const owner = await startTestServer({ claudeDir: fx.dir, env: { GITHUB_API: gh.url, FAKEGH_PRS: prs, FAKEGH_VIEWER: 'me', ...FAST } });
  let member = null, sse = null;
  try {
    const chat = async (srv = owner) => (await srv.api('api/chat')).body;
    const msgs = async (srv = owner) => (await srv.api('api/chat/messages')).body.msgs;
    assert.equal((await chat()).on, false, 'no repo in the setup: no chat');
    const put = await owner.api('api/config', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat: { repo: 'acme-chat/room' } }) });
    assert.equal(put.status, 200, JSON.stringify(put.body));
    const c = await waitFor(async () => { const x = await chat(); return x.ready && x; }, { what: 'the chat read' });
    assert.deepEqual([c.repo, c.role, c.me.login], ['acme-chat/room', 'admin', 'me']);
    assert.deepEqual([c.room, c.unread, c.last.who], [1, 0, 'me'], 'the oldest open issue labelled room is the chat; what was said before the board first read it is not unread');
    assert.ok(!('rooms' in c), 'one chat: no rooms');
    assert.deepEqual((await msgs()).map(m => [m.who, m.body]), [['ana', 'hello'], ['me', 'hi ana']], 'its comments alone: not another room\'s, not a bug\'s');
    assert.deepEqual(gh.repo('acme-chat/room').subs.me, { subscribed: false, ignored: true }, 'GitHub\'s mails about the repo off');

    // another board speaks: it arrives, unread, and is said as an alert; nothing new is a 304
    sse = await stream(owner); await waitFor(() => sse.text.includes('event: snapshot'), { what: 'the stream' }); sse.mark();
    const said = gh.say('acme-chat/room', 1, 'ana', 'are you **there**?');
    gh.say('acme-chat/room', 2, 'ana', 'in another room');
    await waitFor(async () => (await chat()).unread === 1, { what: 'ana\'s message, unread' });
    await waitFor(() => sse.since().includes('"kind":"chat"'), { what: 'its alert' });
    const alert = JSON.parse(sse.since().match(/event: alert\ndata: (.+)/)[1]);
    assert.deepEqual([alert.heading, alert.title, alert.snippet, alert.sessionId], ['Chat', 'ana', 'are you there?', null]);
    assert.ok(!(await msgs()).some(m => m.body === 'in another room'), 'another labelled issue is not the chat');
    await waitFor(() => gh.calls.some(l => /^GET \/repos\/acme-chat\/room\/issues\/comments\?sort=created.* 304$/.test(l)), { what: 'a look that found nothing new, a 304' });

    // sent from the board: one write, the message back, no alert for your own words
    sse.mark();
    const sent = await owner.post('api/chat/send', { body: '  yes\r\nI am  ' });
    assert.equal(sent.status, 200, JSON.stringify(sent.body));
    assert.deepEqual([sent.body.msg.who, sent.body.msg.body], ['me', 'yes\nI am']);
    assert.equal(gh.repo('acme-chat/room').issues[0].comments.at(-1).body, 'yes\nI am');
    assert.equal((await owner.post('api/chat/send', { body: '   ' })).status, 400, 'nothing to send');
    await owner.post('api/chat/seen', { id: said });
    assert.equal((await chat()).unread, 0);
    assert.ok(!/"kind":"chat"/.test(sse.since()), 'no alert for a message of yours');

    // edited and deleted elsewhere
    gh.edit(said, 'are you there? (edited)');
    await waitFor(async () => (await msgs()).find(m => m.id === said)?.edited, { what: 'the edit' });
    gh.drop(said);
    await waitFor(async () => !(await msgs()).some(m => m.id === said), { what: 'the delete' });
    assert.ok((await msgs()).some(m => m.id === sent.body.msg.id), 'a message newer than the look is not judged gone');
    assert.equal((await owner.post('api/chat/delete', { id: sent.body.msg.id })).status, 200);
    assert.ok(!gh.repo('acme-chat/room').issues[0].comments.some(x => x.id === sent.body.msg.id));

    // the people: ana a member, eva suggested (her PR is in a chat), an invitation, a cancel, a removal
    const people = await waitFor(async () => { const p = (await owner.api('api/chat/people')).body; return p.suggest?.length && p; }, { what: 'the suggestions, once the PR is known' });
    assert.deepEqual(people.members.map(m => [m.login, m.role]), [['ana', 'read']]);
    assert.deepEqual(people.suggest.map(s => s.login), ['eva'], 'ana is in already; you are left out');
    assert.match(people.suggest[0].face, /^data:/);
    const inv = await owner.post('api/chat/invite', { login: '@rui' });
    assert.equal(inv.status, 200, JSON.stringify(inv.body));
    assert.deepEqual([inv.body.invited, inv.body.invites.map(i => i.login)], [true, ['rui']]);
    assert.equal(gh.repo('acme-chat/room').invitations[0].permission, 'pull', 'Read, on an organization\'s repo');
    assert.equal((await owner.post('api/chat/invite', { login: 'nobody' })).status, 404);
    assert.equal((await owner.post('api/chat/invite', { login: 'a b' })).status, 400);
    const eva = (await owner.post('api/chat/invite', { login: 'eva' })).body.invites.find(i => i.login === 'eva');
    assert.deepEqual((await owner.post('api/chat/cancel', { id: eva.id })).body.invites.map(i => i.login), ['rui']);
    assert.deepEqual((await owner.post('api/chat/remove', { login: 'ana' })).body.members, []);
    assert.equal(gh.repo('acme-chat/room').perms.ana, undefined);

    // no rooms to make or close
    for (const what of ['room', 'close']) assert.equal((await owner.post(`api/chat/${what}`, { title: 'Design', room: 1 })).status, 404, what);

    // rui's board: no chat yet, the invitation found (not another repo's), joined as a reader
    gh.invite('acme/other', 'rui', 'me');
    member = await startTestServer({ env: { GITHUB_API: gh.url, FAKEGH_VIEWER: 'rui', ...FAST } });
    assert.deepEqual((await chat(member)).invites, [], 'no look for an invitation at boot: no gh for a board with no chat');
    const found = await waitFor(async () => { const x = (await member.api('api/chat?invites=1')).body; return x.invites?.length && x; }, { what: 'rui\'s invitation, asked as Settings › Chat opens' });
    assert.deepEqual(found.invites.map(i => [i.repo, i.by]), [['acme-chat/room', 'me']], 'an invitation to a repo that is no chat is not offered');
    assert.equal((await chat(member)).on, false);
    const joined = await member.post('api/chat/join', { id: found.invites[0].id });
    assert.equal(joined.status, 200, JSON.stringify(joined.body));
    const mc = await waitFor(async () => { const x = await chat(member); return x.ready && x; }, { what: 'rui\'s chat read' });
    assert.deepEqual([mc.role, mc.me.login], ['read', 'rui']);
    assert.equal(JSON.parse(readFileSync(join(member.dir, 'config.json'), 'utf8')).chat.repo, 'acme-chat/room', 'into the setup file');
    assert.equal((await member.api('api/chat/people')).status, 403, 'a member manages nobody');
    assert.equal((await member.post('api/chat/invite', { login: 'eva' })).status, 403);
    const hers = (await msgs(member)).find(m => m.who === 'ana');
    assert.equal((await member.post('api/chat/delete', { id: hers.id })).status, 403, 'nor deletes someone else\'s words');
    assert.equal((await member.post('api/chat/send', { body: 'thanks for having me' })).status, 200, 'a reader posts');
    await waitFor(async () => (await chat()).unread === 1, { what: 'rui\'s message on the owner\'s board' });
    assert.equal((await member.post('api/chat/leave', {})).status, 200);
    assert.equal(gh.repo('acme-chat/room').perms.rui, undefined, 'a member leaving leaves the repo');
    assert.equal((await chat(member)).on, false);
  } finally { sse?.close(); await member?.stop(); await owner.stop(); await gh.close(); }
});

test('a repo made from the board: private, marked, its label and its chat, and the setup naming it', { timeout: 40_000 }, async () => {
  const gh = await startFakeGitHub({ users: ['me'], orgs: { 'acme-chat': ['me'], elsewhere: ['someone'] } });
  const srv = await startTestServer({ env: { GITHUB_API: gh.url, FAKEGH_VIEWER: 'me', ...FAST } });
  try {
    assert.match((await srv.post('api/chat/make', { repo: 'elsewhere/talk' })).body.error, /admin access to the organization/);
    assert.equal((await srv.post('api/chat/make', { repo: 'no-slash' })).status, 400);
    const r = await srv.post('api/chat/make', { repo: 'acme-chat/talk' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const made = gh.repo('acme-chat/talk');
    assert.equal(made.private, true);
    assert.match(made.description, /^peixAIrada chat/);
    assert.deepEqual(made.issues.map(i => [i.title, i.labels]), [['Chat', ['room']]]);
    assert.deepEqual(made.subs.me, { subscribed: false, ignored: true });
    const c = await waitFor(async () => { const x = (await srv.api('api/chat')).body; return x.ready && x; }, { what: 'the new chat read' });
    assert.deepEqual([c.repo, c.role, c.room], ['acme-chat/talk', 'admin', 1]);
    assert.equal((await srv.post('api/chat/make', { repo: 'acme-chat/talk' })).status, 400, 'a name taken');
  } finally { await srv.stop(); await gh.close(); }
});

test('where a chat could be: the organizations you own, newest first, your account, and the chats you can read', { timeout: 40_000 }, async () => {
  const gh = await startFakeGitHub({ users: ['me', 'ana'], orgs: { 'old-org': ['me'], 'acme-chat': ['me'], elsewhere: ['ana'] }, members: { acme: ['me'] }, repos: {
    'acme-chat/room': { rooms: [{ title: 'General' }] },
    'acme-chat/site': { description: 'a site' },
    'ana/talk': { perms: { me: 'pull' } },
    'elsewhere/hush': { perms: {} },
    'acme/app': { description: 'peixAIrada chat — but an employer\'s org: never listed' },
  } });
  const srv = await startTestServer({ env: { GITHUB_API: gh.url, FAKEGH_VIEWER: 'me', ...FAST } });
  try {
    const p = (await srv.api('api/chat/places')).body;
    assert.deepEqual(p.me.login, 'me');
    assert.deepEqual(p.orgs.map(o => o.login), ['acme-chat', 'old-org'], 'owned only, the newest first');
    assert.deepEqual(p.chats.map(c => [c.repo, c.admin]).sort(), [['acme-chat/room', true], ['ana/talk', false]]);
    assert.ok(!gh.calls.some(c => /\/orgs\/acme[/?\s]/.test(c)), 'nothing asked of an organization you are only a member of');
    const asked = gh.calls.length;
    await srv.api('api/chat/places');
    assert.equal(gh.calls.length, asked, 'kept a minute');
    assert.equal((await srv.post('api/chat/make', { repo: 'acme-chat/chat' })).status, 200);
    assert.ok((await srv.api('api/chat/places')).body.chats.some(c => c.repo === 'acme-chat/chat'), 'a make forgets it');
  } finally { await srv.stop(); await gh.close(); }
});

test('a poll\'s body: GitHub reads it as words, the board as a poll — a no wears 👎, eight answers at most', () => {
  const body = pollBody('Lunch at 12:30?', ['Ramen Break', 'Casa do Professor', 'Not today'], false);
  assert.equal(body, '<!-- peixAIrada poll -->\n📊 **Lunch at 12:30?**\n\n👍 Ramen Break\n🎉 Casa do Professor\n👎 Not today\n\n<sub>A poll: vote with the reaction beside your answer — one each.</sub>');
  assert.deepEqual(pollOf(body), { q: 'Lunch at 12:30?', many: false, opts: [{ r: '+1', label: 'Ramen Break' }, { r: 'hooray', label: 'Casa do Professor' }, { r: '-1', label: 'Not today' }] });
  const eight = pollOf(pollBody('Which?', ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'], true));
  assert.deepEqual([eight.many, eight.opts.map(o => o.r).join(' ')], [true, '+1 hooray rocket heart eyes laugh confused -1']);
  assert.equal(eight.opts[3].label, 'd', '❤️ with its variation selector, and without');
  assert.equal(pollOf('<!-- peixAIrada poll -->\n❤ **x**\n📊 Where?\n❤ here\n👀 there').opts[0].label, 'here');
  for (const not of ['📊 **Lunch?**\n👍 yes\n👎 no', '<!-- peixAIrada poll -->\n📊 **Lunch?**\n👍 yes', '<!-- peixAIrada poll -->\n👍 yes\n👎 no'])
    assert.equal(pollOf(not), null, JSON.stringify(not));
});

test('a poll end to end: votes are reactions — yours moved on one answer each, kept on several; one given on GitHub counts', { timeout: 40_000 }, async () => {
  const gh = await startFakeGitHub({ users: ['me', 'ana', 'rui'], orgs: { 'acme-chat': ['me'] }, repos: { 'acme-chat/room': { perms: { ana: 'pull', rui: 'pull' }, rooms: [{ title: 'General', comments: [['ana', 'hi']] }] } } });
  const srv = await startTestServer({ env: { GITHUB_API: gh.url, FAKEGH_VIEWER: 'me', ...FAST } });
  let sse = null;
  try {
    await srv.api('api/config', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat: { repo: 'acme-chat/room' } }) });
    await waitFor(async () => (await srv.api('api/chat')).body.ready, { what: 'the chat read' });
    for (const [body, why] of [[{ q: '', answers: ['a', 'b'] }, /asks something/], [{ q: 'x', answers: ['a', ' '] }, /two answers at least/], [{ q: 'x', answers: ['a', 'A'] }, /say the same/],
      [{ q: 'x', answers: 'abcdefghi'.split('') }, /8 answers at most/]]) {
      const r = await srv.post('api/chat/poll', body); assert.equal(r.status, 400); assert.match(r.body.error, why);
    }
    const r = await srv.post('api/chat/poll', { q: '  Lunch\nat 12:30? ', answers: ['Going', 'Not today'] });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const id = r.body.msg.id;
    assert.deepEqual([r.body.msg.poll.q, r.body.msg.poll.opts.map(o => o.r), r.body.msg.votes], ['Lunch at 12:30?', ['+1', '-1'], []]);
    assert.match(gh.repo('acme-chat/room').issues[0].comments.at(-1).body, /^<!-- peixAIrada poll -->\n📊 \*\*Lunch at 12:30\?\*\*\n\n👍 Going\n👎 Not today\n/);
    const vote = async (r, want) => { const x = await srv.post('api/chat/vote', { id, r }); assert.equal(x.status, 200, JSON.stringify(x.body)); assert.deepEqual(x.body.msg.votes.map(v => `${v.who}:${v.r}`).sort(), want); };
    await vote('+1', ['me:+1']);
    await vote('-1', ['me:-1']);   // one answer each: the one before taken back, on GitHub too
    assert.deepEqual(gh.repo('acme-chat/room').issues[0].comments.at(-1).reactions.map(x => `${x.user.login}:${x.content}`), ['me:-1']);
    await vote('-1', []);   // yours again: taken back
    assert.equal((await srv.post('api/chat/vote', { id, r: 'rocket' })).status, 400, 'not one of its answers');
    assert.equal((await srv.post('api/chat/vote', { id: 1, r: '+1' })).status, 404, 'no poll');
    // ana votes on GitHub, twice on a poll of one answer each: her newest counts; and rui with a reaction no answer has
    sse = await stream(srv); sse.mark();
    gh.react(id, 'ana', '-1'); gh.react(id, 'ana', '+1'); gh.react(id, 'rui', 'heart');
    const poll = async () => (await srv.api('api/chat/messages')).body.msgs.find(m => m.id === id);
    await waitFor(async () => (await poll()).votes.length === 1, { what: 'ana\'s vote, read' });
    assert.deepEqual((await poll()).votes.map(v => `${v.who}:${v.r}`), ['ana:+1']);
    await waitFor(() => /event: chatmsgs\ndata: .*"who":"ana","face":[^}]*"r":"\+1"/.test(sse.since()) || sse.since().includes('"r":"+1","who":"ana"'), { what: 'the votes, to every page' });
    const asked = gh.calls.filter(l => l.includes(`/comments/${id}/reactions?`) && l.startsWith('GET')).length;
    await new Promise(ok => setTimeout(ok, 1200));
    assert.equal(gh.calls.filter(l => l.includes(`/comments/${id}/reactions?`) && l.startsWith('GET')).length, asked, 'votes not asked again while the counts stand');
    // several answers each: a second vote keeps the first; ana's, said on GitHub, alerts nobody but reads as a poll
    sse.mark();
    gh.say('acme-chat/room', 1, 'ana', pollBody('Where?', ['Ramen Break', 'Casa do Professor'], true));
    await waitFor(() => sse.since().includes('📊 Where?'), { what: 'the alert, the question as its words' });
    const where = (await srv.api('api/chat/messages')).body.msgs.at(-1);
    assert.equal(where.poll.many, true);
    for (const [r, want] of [['+1', ['me:+1']], ['hooray', ['me:+1', 'me:hooray']]]) {
      const x = await srv.post('api/chat/vote', { id: where.id, r }); assert.deepEqual(x.body.msg.votes.map(v => `${v.who}:${v.r}`).sort(), want);
    }
  } finally { sse?.close(); await srv.stop(); await gh.close(); }
});

test('a repo GitHub does not show you: never taken by Use, and one in the setup said missing until it is forgotten', { timeout: 40_000 }, async () => {
  const gh = await startFakeGitHub({ users: ['me', 'ana'], orgs: { 'acme-chat': ['me'] }, repos: { 'acme-chat/room': { rooms: [{ title: 'General' }] }, 'ana/hush': { perms: {} } } });
  const srv = await startTestServer({ env: { GITHUB_API: gh.url, FAKEGH_VIEWER: 'me', ...FAST } });
  try {
    for (const repo of ['acme-chat/acme-chat', 'ana/hush']) {
      const r = await srv.post('api/chat/use', { repo });
      assert.equal(r.status, 404, repo); assert.match(r.body.error, /not a repo you can read/);
    }
    assert.equal((await srv.post('api/chat/use', { repo: 'acme-chat' })).status, 400, 'an owner alone is no repo');
    assert.equal((await srv.api('api/config')).body.chat, null, 'nothing saved');
    const r = await srv.post('api/chat/use', { repo: 'https://github.com/ACME-chat/room' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal((await srv.api('api/config')).body.chat.repo, 'acme-chat/room', 'GitHub\'s own spelling');
    // a hand edit naming one that is not there: missing, which Settings › Chat shows as off with the repo to forget
    await srv.api('api/config', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat: { repo: 'acme-chat/acme-chat' } }) });
    const c = await waitFor(async () => { const x = (await srv.api('api/chat')).body; return x.missing && x; }, { what: 'the repo said missing' });
    assert.deepEqual([c.on, c.ready, c.repo], [true, false, 'acme-chat/acme-chat']);
    assert.match(c.error, /not a repo you can read/);
    assert.equal((await srv.post('api/chat/leave', {})).status, 200);
    assert.deepEqual([(await srv.api('api/chat')).body.on, (await srv.api('api/config')).body.chat], [false, null]);
  } finally { await srv.stop(); await gh.close(); }
});

test('a repo with no chat in it: its admin\'s board starts one, a member\'s waits', { timeout: 40_000 }, async () => {
  const gh = await startFakeGitHub({ users: ['me', 'ana'], orgs: { 'acme-chat': ['me'] }, repos: {
    'acme-chat/bare': { perms: { ana: 'pull' }, rooms: [{ title: 'closed long ago', state: 'closed' }, { title: 'a bug', labels: [] }] } } });
  const member = await startTestServer({ env: { GITHUB_API: gh.url, FAKEGH_VIEWER: 'ana', ...FAST } });
  const owner = await startTestServer({ env: { GITHUB_API: gh.url, FAKEGH_VIEWER: 'me', ...FAST } });
  const use = srv => srv.api('api/config', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat: { repo: 'acme-chat/bare' } }) });
  const ready = srv => waitFor(async () => { const x = (await srv.api('api/chat')).body; return x.ready && x; }, { what: 'the chat read' });
  try {
    await use(member);
    const m = await ready(member);
    assert.deepEqual([m.role, m.room], ['read', null]);
    assert.equal((await member.post('api/chat/send', { body: 'hello?' })).status, 409, 'nothing to post to yet');
    assert.equal(gh.repo('acme-chat/bare').issues.length, 2, 'a member\'s board makes nothing');
    await use(owner);
    const o = await ready(owner);
    assert.equal(o.room, 3);
    assert.deepEqual(gh.repo('acme-chat/bare').issues.map(i => [i.number, i.title, i.state, i.labels]).at(-1), [3, 'Chat', 'open', ['room']]);
  } finally { await owner.stop(); await member.stop(); await gh.close(); }
});

test('the page\'s chat module draws words only: no drawer, no claude, no Reply…, its own sanitizer', () => {
  const page = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  const at = page.indexOf('  // ---- the chat: '), end = page.indexOf('\n  // ---- ', at + 10);
  assert.ok(at > 0 && end > at, 'the chat\'s section, by its banner');
  const code = page.slice(at, end);
  for (const name of ['sendToClaude', 'typeInShell', 'answerInDrawer', 'peixReply', 'termSend', 'clearTerm', 'openTerminalFor', 'linkify', 'chatLinks', 'innerHTML = m.body', 'eval(', 'new Function'])
    assert.ok(!code.includes(name), `the chat's module names ${name}`);
  assert.ok(!/(?<![\w.])md\((?!\))/.test(code), 'the transcript\'s md() draws no chat message: its links open files and a chat\'s pages');
  assert.match(code, /function chatMd\(/, 'its own renderer');
  assert.match(code, /ALLOWED_URI_REGEXP/, 'links: https and mailto alone');
});
