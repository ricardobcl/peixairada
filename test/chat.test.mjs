// The chat (2026-10-17): a private GitHub repo whose oldest open issue labelled `room` is the chat — one, with no name
// (2026-10-18) — and whose comments are the messages. The setup's key (cleanSetup), and end to end against a fake GitHub: the owner's board reads the repo, turns
// GitHub's mails off, counts unread, takes what another board said, edited and deleted, sends one write at a time, and
// manages the people — the suggestions from its chats' PRs, an invitation, a cancel, a removal; a member's board
// finds the invitation, joins as a reader, may not manage, and leaves; the look that finds nothing new is a 304; a
// repo made from the board, and where one could be (the organizations you own, the chats you can read); a poll, its votes
// GitHub's reactions (2026-10-20); pictures (2026-11-25) — which addresses are pictures and what bytes are, a member's
// through the files repo the admin's board makes and keeps, uploaded and fetched, one dropped on GitHub's page, one
// nobody shared with you. The page's chat module is held to drawing words only: it reaches no drawer.
import './env.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { startTestServer, tmpDir, waitFor } from '../lib/testserver.mjs';
import { makeFixture } from '../scripts/fixture.mjs';
import { startFakeGitHub } from '../scripts/fakes/fakegithub.mjs';
import { cleanSetup, emojiChar, picSnippet, picType, picUrl, pollBody, pollOf, REACTIONS } from '../server.mjs';

test("cleanSetup: the chat's repo as owner/name, from its address too; null or an empty one is none", () => {
  for (const given of ['acme-chat/room', ' https://github.com/acme-chat/room.git ', 'github.com/acme-chat/room/']) {
    assert.deepEqual(cleanSetup({ chat: { repo: given } }, true).setup.chat, { repo: 'acme-chat/room' }, given);
  }

  assert.equal(cleanSetup({ chat: null }, true).setup.chat, null);
  assert.equal(cleanSetup({ chat: { repo: '' } }, true).setup.chat, null);
  assert.match(cleanSetup({ chat: { repo: 'acme-chat' } }, true).error, /not a GitHub repo/);

  assert.equal(
    'chat' in cleanSetup({ chat: { repo: 'no way/x' } }).setup,
    false,
    "the file's own: shaped, a bad one dropped",
  );
});

const face = (login, fill) => ({
  login,
  __typename: 'User',
  avatarUrl: `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" fill="${fill}"/></svg>`,
  )}`,
});

const ago = min => new Date(Date.now() - min * 60_000).toISOString().replace(/\.\d+Z$/, 'Z');
const FAST = { CHAT_FAST_MS: '250', CHAT_SLOW_MS: '250', CHAT_GAP_MS: '30', CHAT_PICS_AGAIN_MS: '200' };

/** The board's event stream, as text: what it said since `mark()`. */
async function stream(srv) {
  const response = await fetch(`${srv.url}events?key=${srv.key}`);
  const dec = new TextDecoder();
  const reader = response.body.getReader();

  const feed = {
    text: '',
    from: 0,
    mark() {
      feed.from = feed.text.length;
    },
    since: () => feed.text.slice(feed.from),
    close: () => reader.cancel().catch(() => {}),
  };

  (async () => {
    for (;;) {
      const { value, done } = await reader.read().catch(() => ({ done: true }));

      if (done) return;
      feed.text += dec.decode(value, { stream: true });
    }
  })();

  return feed;
}

test("end to end: the owner's board and a member's, over a fake GitHub", { timeout: 90_000 }, async () => {
  const gh = await startFakeGitHub({
    users: ['me', 'ana', 'rui', 'eva'],
    orgs: { 'acme-chat': ['me'] },
    repos: {
      'acme-chat/room': {
        perms: { ana: 'pull' },
        rooms: [
          {
            title: 'General',
            comments: [
              ['ana', 'hello'],
              ['me', 'hi ana'],
            ],
          },
          { title: 'Random', comments: [['ana', 'elsewhere']] },
          { title: 'a bug, not a room', labels: [], comments: [['ana', 'not chat']] },
        ],
      },
      'acme/other': { perms: { me: 'pull' }, description: 'some other repo' },
    },
  });

  // a PR in one of the owner's chats, eva its author and ana its reviewer: whom the board suggests
  const dir = tmpDir('peix-chat-');
  const prs = join(dir, 'prs.json');

  writeFileSync(
    prs,
    JSON.stringify({
      'acme/app#1': {
        state: 'OPEN',
        title: 'One',
        createdAt: ago(300),
        headRefOid: 'A',
        author: face('eva', '#d9a82a'),
        reviews: { nodes: [{ author: face('ana', '#2f9e5b'), state: 'APPROVED', submittedAt: ago(30) }] },
        comments: { nodes: [] },
        pushes: { nodes: [] },
        asks: { nodes: [] },
        reviewRequests: { nodes: [] },
      },
    }),
  );

  const fx = makeFixture(join(dir, 'claude'), [
    { cwd: process.cwd(), prompt: 'look at https://github.com/acme/app/pull/1', reply: 'looked' },
  ]);

  const owner = await startTestServer({
    claudeDir: fx.dir,
    env: { GITHUB_API: gh.url, FAKEGH_PRS: prs, FAKEGH_VIEWER: 'me', ...FAST },
  });

  let member = null;
  let sse = null;

  try {
    const chat = async (srv = owner) => (await srv.api('api/chat')).body;
    const msgs = async (srv = owner) => (await srv.api('api/chat/messages')).body.msgs;

    assert.equal((await chat()).on, false, 'no repo in the setup: no chat');

    const put = await owner.api('api/config', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat: { repo: 'acme-chat/room' } }),
    });

    assert.equal(put.status, 200, JSON.stringify(put.body));

    const state = await waitFor(
      async () => {
        const current = await chat();

        return current.ready && current;
      },
      { what: 'the chat read' },
    );

    assert.deepEqual([state.repo, state.role, state.me.login], ['acme-chat/room', 'admin', 'me']);

    assert.deepEqual(
      [state.room, state.unread, state.last.who],
      [1, 0, 'me'],
      'the oldest open issue labelled room is the chat; what was said before the board first read it is not unread',
    );

    assert.ok(!('rooms' in state), 'one chat: no rooms');

    assert.deepEqual(
      (await msgs()).map(message => [message.who, message.body]),
      [
        ['ana', 'hello'],
        ['me', 'hi ana'],
      ],
      "its comments alone: not another room's, not a bug's",
    );

    assert.deepEqual(
      gh.repo('acme-chat/room').subs.me,
      { subscribed: false, ignored: true },
      "GitHub's mails about the repo off",
    );

    // another board speaks: it arrives, unread, and is said as an alert; nothing new is a 304
    sse = await stream(owner);
    await waitFor(() => sse.text.includes('event: snapshot'), { what: 'the stream' });
    sse.mark();
    const said = gh.say('acme-chat/room', 1, 'ana', 'are you **there**?');

    gh.say('acme-chat/room', 2, 'ana', 'in another room');
    await waitFor(async () => (await chat()).unread === 1, { what: "ana's message, unread" });
    await waitFor(() => sse.since().includes('"kind":"chat"'), { what: 'its alert' });
    const alert = JSON.parse(sse.since().match(/event: alert\ndata: (.+)/)[1]);

    assert.deepEqual(
      [alert.heading, alert.title, alert.snippet, alert.sessionId],
      ['Chat', 'ana', 'are you there?', null],
    );

    assert.ok(
      !(await msgs()).some(message => message.body === 'in another room'),
      'another labelled issue is not the chat',
    );

    await waitFor(
      () => gh.calls.some(call => /^GET \/repos\/acme-chat\/room\/issues\/comments\?sort=created.* 304$/.test(call)),
      { what: 'a look that found nothing new, a 304' },
    );

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
    await waitFor(async () => (await msgs()).find(message => message.id === said)?.edited, { what: 'the edit' });
    gh.drop(said);
    await waitFor(async () => !(await msgs()).some(message => message.id === said), { what: 'the delete' });

    assert.ok(
      (await msgs()).some(message => message.id === sent.body.msg.id),
      'a message newer than the look is not judged gone',
    );

    assert.equal((await owner.post('api/chat/delete', { id: sent.body.msg.id })).status, 200);
    assert.ok(!gh.repo('acme-chat/room').issues[0].comments.some(comment => comment.id === sent.body.msg.id));

    // the people: ana a member, eva suggested (her PR is in a chat), an invitation, a cancel, a removal
    const people = await waitFor(
      async () => {
        const answer = (await owner.api('api/chat/people')).body;

        return answer.suggest?.length && answer;
      },
      { what: 'the suggestions, once the PR is known' },
    );

    assert.deepEqual(
      people.members.map(person => [person.login, person.role]),
      [['ana', 'read']],
    );

    assert.deepEqual(
      people.suggest.map(person => person.login),
      ['eva'],
      'ana is in already; you are left out',
    );

    assert.match(people.suggest[0].face, /^data:/);
    const inv = await owner.post('api/chat/invite', { login: '@rui' });

    assert.equal(inv.status, 200, JSON.stringify(inv.body));
    assert.deepEqual([inv.body.invited, inv.body.invites.map(invite => invite.login)], [true, ['rui']]);
    assert.equal(gh.repo('acme-chat/room').invitations[0].permission, 'pull', "Read, on an organization's repo");
    assert.equal((await owner.post('api/chat/invite', { login: 'nobody' })).status, 404);
    assert.equal((await owner.post('api/chat/invite', { login: 'a b' })).status, 400);

    const eva = (await owner.post('api/chat/invite', { login: 'eva' })).body.invites.find(
      invite => invite.login === 'eva',
    );

    assert.deepEqual(
      (await owner.post('api/chat/cancel', { id: eva.id })).body.invites.map(invite => invite.login),
      ['rui'],
    );

    assert.deepEqual((await owner.post('api/chat/remove', { login: 'ana' })).body.members, []);
    assert.equal(gh.repo('acme-chat/room').perms.ana, undefined);

    // no rooms to make or close
    for (const what of ['room', 'close']) {
      assert.equal((await owner.post(`api/chat/${what}`, { title: 'Design', room: 1 })).status, 404, what);
    }

    // rui's board: no chat yet, the invitation found (not another repo's), joined as a reader
    gh.invite('acme/other', 'rui', 'me');
    member = await startTestServer({ env: { GITHUB_API: gh.url, FAKEGH_VIEWER: 'rui', ...FAST } });

    assert.deepEqual(
      (await chat(member)).invites,
      [],
      'no look for an invitation at boot: no gh for a board with no chat',
    );

    const found = await waitFor(
      async () => {
        const current = (await member.api('api/chat?invites=1')).body;

        return current.invites?.length && current;
      },
      { what: "rui's invitation, asked as Settings › Chat opens" },
    );

    assert.deepEqual(
      found.invites.map(invite => [invite.repo, invite.by]),
      [['acme-chat/room', 'me']],
      'an invitation to a repo that is no chat is not offered',
    );

    assert.equal((await chat(member)).on, false);
    const joined = await member.post('api/chat/join', { id: found.invites[0].id });

    assert.equal(joined.status, 200, JSON.stringify(joined.body));

    const mc = await waitFor(
      async () => {
        const current = await chat(member);

        return current.ready && current;
      },
      { what: "rui's chat read" },
    );

    assert.deepEqual([mc.role, mc.me.login], ['read', 'rui']);

    assert.equal(
      JSON.parse(readFileSync(join(member.dir, 'config.json'), 'utf8')).chat.repo,
      'acme-chat/room',
      'into the setup file',
    );

    assert.equal((await member.api('api/chat/people')).status, 403, 'a member manages nobody');
    assert.equal((await member.post('api/chat/invite', { login: 'eva' })).status, 403);
    const hers = (await msgs(member)).find(message => message.who === 'ana');

    assert.equal(
      (await member.post('api/chat/delete', { id: hers.id })).status,
      403,
      "nor deletes someone else's words",
    );

    assert.equal((await member.post('api/chat/send', { body: 'thanks for having me' })).status, 200, 'a reader posts');
    await waitFor(async () => (await chat()).unread === 1, { what: "rui's message on the owner's board" });
    assert.equal((await member.post('api/chat/leave', {})).status, 200);
    assert.equal(gh.repo('acme-chat/room').perms.rui, undefined, 'a member leaving leaves the repo');
    assert.equal((await chat(member)).on, false);
  } finally {
    sse?.close();
    await member?.stop();
    await owner.stop();
    await gh.close();
  }
});

test(
  'a repo made from the board: private, marked, its label and its chat, and the setup naming it',
  { timeout: 40_000 },
  async () => {
    const gh = await startFakeGitHub({ users: ['me'], orgs: { 'acme-chat': ['me'], elsewhere: ['someone'] } });
    const srv = await startTestServer({ env: { GITHUB_API: gh.url, FAKEGH_VIEWER: 'me', ...FAST } });

    try {
      assert.match(
        (await srv.post('api/chat/make', { repo: 'elsewhere/talk' })).body.error,
        /admin access to the organization/,
      );

      assert.equal((await srv.post('api/chat/make', { repo: 'no-slash' })).status, 400);
      const response = await srv.post('api/chat/make', { repo: 'acme-chat/talk' });

      assert.equal(response.status, 200, JSON.stringify(response.body));
      const made = gh.repo('acme-chat/talk');

      assert.equal(made.private, true);
      assert.match(made.description, /^peixAIrada chat/);

      assert.deepEqual(
        made.issues.map(issue => [issue.title, issue.labels]),
        [['Chat', ['room']]],
      );

      assert.deepEqual(made.subs.me, { subscribed: false, ignored: true });

      const state = await waitFor(
        async () => {
          const current = (await srv.api('api/chat')).body;

          return current.ready && current;
        },
        { what: 'the new chat read' },
      );

      assert.deepEqual([state.repo, state.role, state.room], ['acme-chat/talk', 'admin', 1]);
      assert.equal((await srv.post('api/chat/make', { repo: 'acme-chat/talk' })).status, 400, 'a name taken');
    } finally {
      await srv.stop();
      await gh.close();
    }
  },
);

test(
  'where a chat could be: the organizations you own, newest first, your account, and the chats you can read',
  { timeout: 40_000 },
  async () => {
    const gh = await startFakeGitHub({
      users: ['me', 'ana'],
      orgs: { 'old-org': ['me'], 'acme-chat': ['me'], elsewhere: ['ana'] },
      members: { acme: ['me'] },
      repos: {
        'acme-chat/room': { rooms: [{ title: 'General' }] },
        'acme-chat/site': { description: 'a site' },
        'ana/talk': { perms: { me: 'pull' } },
        'elsewhere/hush': { perms: {} },
        'acme/app': { description: "peixAIrada chat — but an employer's org: never listed" },
      },
    });

    const srv = await startTestServer({ env: { GITHUB_API: gh.url, FAKEGH_VIEWER: 'me', ...FAST } });

    try {
      const places = (await srv.api('api/chat/places')).body;

      assert.deepEqual(places.me.login, 'me');

      assert.deepEqual(
        places.orgs.map(org => org.login),
        ['acme-chat', 'old-org'],
        'owned only, the newest first',
      );

      assert.deepEqual(places.chats.map(chat => [chat.repo, chat.admin]).sort(), [
        ['acme-chat/room', true],
        ['ana/talk', false],
      ]);

      assert.ok(
        !gh.calls.some(call => /\/orgs\/acme[/?\s]/.test(call)),
        'nothing asked of an organization you are only a member of',
      );

      const asked = gh.calls.length;

      await srv.api('api/chat/places');
      assert.equal(gh.calls.length, asked, 'kept a minute');
      assert.equal((await srv.post('api/chat/make', { repo: 'acme-chat/chat' })).status, 200);

      assert.ok(
        (await srv.api('api/chat/places')).body.chats.some(chat => chat.repo === 'acme-chat/chat'),
        'a make forgets it',
      );
    } finally {
      await srv.stop();
      await gh.close();
    }
  },
);

test("a poll's body: GitHub and a board without polls read it as words, the board as a poll — a no wears 👎, eight answers at most", () => {
  const body = pollBody('Lunch at 12:30?', ['Ramen Break', 'Casa do Professor', 'Not today'], false);

  assert.equal(
    body,
    '[//]: # (peixAIrada poll)\n📊 **Lunch at 12:30?**\n\n👍 Ramen Break\n🎉 Casa do Professor\n👎 Not today\n\n*A poll: vote with the reaction beside your answer — one each.*',
  );

  assert.doesNotMatch(pollBody('x', ['a', 'b'], true), /</, 'no raw HTML: a board from before polls shows it as text');

  assert.deepEqual(pollOf(body), {
    q: 'Lunch at 12:30?',
    many: false,
    opts: [
      { r: '+1', label: 'Ramen Break' },
      { r: 'hooray', label: 'Casa do Professor' },
      { r: '-1', label: 'Not today' },
    ],
  });

  const eight = pollOf(pollBody('Which?', ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'], true));

  assert.deepEqual(
    [eight.many, eight.opts.map(option => option.r).join(' ')],
    [true, '+1 hooray rocket heart eyes laugh confused -1'],
  );

  assert.equal(eight.opts[3].label, 'd', '❤️ with its variation selector, and without');
  assert.equal(pollOf('[//]: # (peixAIrada poll)\n❤ **x**\n📊 Where?\n❤ here\n👀 there').opts[0].label, 'here');

  assert.deepEqual(
    pollOf('<!-- peixAIrada poll: several -->\r\n📊 **Lunch?**\r\n\r\n👍 yes\r\n👎 no\r\n\r\n<sub>A poll</sub>'),
    {
      q: 'Lunch?',
      many: true,
      opts: [
        { r: '+1', label: 'yes' },
        { r: '-1', label: 'no' },
      ],
    },
    "the first poll's mark, edited on GitHub",
  );

  for (const not of [
    '📊 **Lunch?**\n👍 yes\n👎 no',
    '[//]: # (peixAIrada poll)\n📊 **Lunch?**\n👍 yes',
    '[//]: # (peixAIrada poll)\n👍 yes\n👎 no',
  ]) {
    assert.equal(pollOf(not), null, JSON.stringify(not));
  }
});

test(
  'a poll end to end: votes are reactions — yours moved on one answer each, kept on several; one given on GitHub counts',
  { timeout: 40_000 },
  async () => {
    const gh = await startFakeGitHub({
      users: ['me', 'ana', 'rui'],
      orgs: { 'acme-chat': ['me'] },
      repos: {
        'acme-chat/room': {
          perms: { ana: 'pull', rui: 'pull' },
          rooms: [{ title: 'General', comments: [['ana', 'hi']] }],
        },
      },
    });

    const srv = await startTestServer({ env: { GITHUB_API: gh.url, FAKEGH_VIEWER: 'me', ...FAST } });
    let sse = null;

    try {
      await srv.api('api/config', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat: { repo: 'acme-chat/room' } }),
      });

      await waitFor(async () => (await srv.api('api/chat')).body.ready, { what: 'the chat read' });

      for (const [body, why] of [
        [{ q: '', answers: ['a', 'b'] }, /asks something/],
        [{ q: 'x', answers: ['a', ' '] }, /two answers at least/],
        [{ q: 'x', answers: ['a', 'A'] }, /say the same/],
        [{ q: 'x', answers: 'abcdefghi'.split('') }, /8 answers at most/],
      ]) {
        const refused = await srv.post('api/chat/poll', body);

        assert.equal(refused.status, 400);
        assert.match(refused.body.error, why);
      }

      const response = await srv.post('api/chat/poll', { q: '  Lunch\nat 12:30? ', answers: ['Going', 'Not today'] });

      assert.equal(response.status, 200, JSON.stringify(response.body));
      const id = response.body.msg.id;

      assert.deepEqual(
        [response.body.msg.poll.q, response.body.msg.poll.opts.map(option => option.r), response.body.msg.votes],
        ['Lunch at 12:30?', ['+1', '-1'], []],
      );

      assert.match(
        gh.repo('acme-chat/room').issues[0].comments.at(-1).body,
        /^\[\/\/\]: # \(peixAIrada poll\)\n📊 \*\*Lunch at 12:30\?\*\*\n\n👍 Going\n👎 Not today\n/,
      );

      const vote = async (reaction, want) => {
        const answer = await srv.post('api/chat/vote', { id, r: reaction });

        assert.equal(answer.status, 200, JSON.stringify(answer.body));
        assert.deepEqual(answer.body.msg.votes.map(ballot => `${ballot.who}:${ballot.r}`).sort(), want);
      };

      await vote('+1', ['me:+1']);
      await vote('-1', ['me:-1']); // one answer each: the one before taken back, on GitHub too

      assert.deepEqual(
        gh
          .repo('acme-chat/room')
          .issues[0].comments.at(-1)
          .reactions.map(reaction => `${reaction.user.login}:${reaction.content}`),
        ['me:-1'],
      );

      await vote('-1', []); // yours again: taken back
      assert.equal((await srv.post('api/chat/vote', { id, r: 'rocket' })).status, 400, 'not one of its answers');
      assert.equal((await srv.post('api/chat/vote', { id: 1, r: '+1' })).status, 404, 'no poll');
      // ana votes on GitHub, twice on a poll of one answer each: her newest counts; and rui with a reaction no answer has
      sse = await stream(srv);
      sse.mark();
      gh.react(id, 'ana', '-1');
      gh.react(id, 'ana', '+1');
      gh.react(id, 'rui', 'heart');
      const poll = async () => (await srv.api('api/chat/messages')).body.msgs.find(message => message.id === id);

      await waitFor(async () => (await poll()).votes.length === 1, { what: "ana's vote, read" });

      assert.deepEqual(
        (await poll()).votes.map(ballot => `${ballot.who}:${ballot.r}`),
        ['ana:+1'],
      );

      await waitFor(
        () =>
          /event: chatmsgs\ndata: .*"who":"ana","face":[^}]*"r":"\+1"/.test(sse.since()) ||
          sse.since().includes('"r":"+1","who":"ana"'),
        { what: 'the votes, to every page' },
      );

      const asked = gh.calls.filter(
        call => call.includes(`/comments/${id}/reactions?`) && call.startsWith('GET'),
      ).length;

      await new Promise(ok => setTimeout(ok, 1200));

      assert.equal(
        gh.calls.filter(call => call.includes(`/comments/${id}/reactions?`) && call.startsWith('GET')).length,
        asked,
        'votes not asked again while the counts stand',
      );

      // several answers each: a second vote keeps the first; ana's, said on GitHub, alerts nobody but reads as a poll
      sse.mark();
      gh.say('acme-chat/room', 1, 'ana', pollBody('Where?', ['Ramen Break', 'Casa do Professor'], true));
      await waitFor(() => sse.since().includes('📊 Where?'), { what: 'the alert, the question as its words' });
      const where = (await srv.api('api/chat/messages')).body.msgs.at(-1);

      assert.equal(where.poll.many, true);

      for (const [reaction, want] of [
        ['+1', ['me:+1']],
        ['hooray', ['me:+1', 'me:hooray']],
      ]) {
        const answer = await srv.post('api/chat/vote', { id: where.id, r: reaction });

        assert.deepEqual(answer.body.msg.votes.map(ballot => `${ballot.who}:${ballot.r}`).sort(), want);
      }
    } finally {
      sse?.close();
      await srv.stop();
      await gh.close();
    }
  },
);

test(
  'a repo GitHub does not show you: never taken by Use, and one in the setup said missing until it is forgotten',
  { timeout: 40_000 },
  async () => {
    const gh = await startFakeGitHub({
      users: ['me', 'ana'],
      orgs: { 'acme-chat': ['me'] },
      repos: { 'acme-chat/room': { rooms: [{ title: 'General' }] }, 'ana/hush': { perms: {} } },
    });

    const srv = await startTestServer({ env: { GITHUB_API: gh.url, FAKEGH_VIEWER: 'me', ...FAST } });

    try {
      for (const repo of ['acme-chat/acme-chat', 'ana/hush']) {
        const refused = await srv.post('api/chat/use', { repo });

        assert.equal(refused.status, 404, repo);
        assert.match(refused.body.error, /not a repo you can read/);
      }

      assert.equal((await srv.post('api/chat/use', { repo: 'acme-chat' })).status, 400, 'an owner alone is no repo');
      assert.equal((await srv.api('api/config')).body.chat, null, 'nothing saved');
      const response = await srv.post('api/chat/use', { repo: 'https://github.com/ACME-chat/room' });

      assert.equal(response.status, 200, JSON.stringify(response.body));
      assert.equal((await srv.api('api/config')).body.chat.repo, 'acme-chat/room', "GitHub's own spelling");

      // a hand edit naming one that is not there: missing, which Settings › Chat shows as off with the repo to forget
      await srv.api('api/config', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat: { repo: 'acme-chat/acme-chat' } }),
      });

      const state = await waitFor(
        async () => {
          const current = (await srv.api('api/chat')).body;

          return current.missing && current;
        },
        { what: 'the repo said missing' },
      );

      assert.deepEqual([state.on, state.ready, state.repo], [true, false, 'acme-chat/acme-chat']);
      assert.match(state.error, /not a repo you can read/);
      assert.equal((await srv.post('api/chat/leave', {})).status, 200);
      assert.deepEqual([(await srv.api('api/chat')).body.on, (await srv.api('api/config')).body.chat], [false, null]);
    } finally {
      await srv.stop();
      await gh.close();
    }
  },
);

test("a repo with no chat in it: its admin's board starts one, a member's waits", { timeout: 40_000 }, async () => {
  const gh = await startFakeGitHub({
    users: ['me', 'ana'],
    orgs: { 'acme-chat': ['me'] },
    repos: {
      'acme-chat/bare': {
        perms: { ana: 'pull' },
        rooms: [
          { title: 'closed long ago', state: 'closed' },
          { title: 'a bug', labels: [] },
        ],
      },
    },
  });

  const member = await startTestServer({ env: { GITHUB_API: gh.url, FAKEGH_VIEWER: 'ana', ...FAST } });
  const owner = await startTestServer({ env: { GITHUB_API: gh.url, FAKEGH_VIEWER: 'me', ...FAST } });

  const use = srv =>
    srv.api('api/config', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat: { repo: 'acme-chat/bare' } }),
    });

  const ready = srv =>
    waitFor(
      async () => {
        const current = (await srv.api('api/chat')).body;

        return current.ready && current;
      },
      { what: 'the chat read' },
    );

  try {
    await use(member);
    const memberChat = await ready(member);

    assert.deepEqual([memberChat.role, memberChat.room], ['read', null]);
    assert.equal((await member.post('api/chat/send', { body: 'hello?' })).status, 409, 'nothing to post to yet');
    assert.equal(gh.repo('acme-chat/bare').issues.length, 2, "a member's board makes nothing");
    await use(owner);
    const ownerChat = await ready(owner);

    assert.equal(ownerChat.room, 3);

    assert.deepEqual(
      gh
        .repo('acme-chat/bare')
        .issues.map(issue => [issue.number, issue.title, issue.state, issue.labels])
        .at(-1),
      [3, 'Chat', 'open', ['room']],
    );
  } finally {
    await owner.stop();
    await member.stop();
    await gh.close();
  }
});

test("the page's chat module draws words only: no drawer, no claude, no Reply…, its own sanitizer", () => {
  const code = readFileSync(new URL('../public/js/room.js', import.meta.url), 'utf8'); // the page's part (2026-11-25)

  assert.ok(code.startsWith('// ---- the chat: '), "the chat's section, by its banner");

  for (const name of [
    'sendToClaude',
    'typeInShell',
    'answerInDrawer',
    'peixReply',
    'termSend',
    'clearTerm',
    'openTerminalFor',
    'linkify',
    'chatLinks',
    'eval(',
    'new Function',
  ]) {
    assert.ok(!code.includes(name), `the chat's module names ${name}`);
  }

  assert.ok(!/innerHTML = \w+\.body\b/.test(code), "a message's body is never markup as it came");

  assert.ok(
    !/(?<![\w.])md\((?!\))/.test(code),
    "the transcript's md() draws no chat message: its links open files and a chat's pages",
  );

  assert.match(code, /function chatMd\(/, 'its own renderer');
  assert.match(code, /ALLOWED_URI_REGEXP/, 'links: https and mailto alone');
});

// a picture of each kind, as small as each comes
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

const GIF = Buffer.from('R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==', 'base64');
const ASSET = 'https://github.com/user-attachments/assets/0b7f1e2a-3c4d-4e5f-8a9b-0c1d2e3f4a5b';

test("a picture's address and its bytes: GitHub's attachments and a few GIF hosts, a Giphy page its GIF; PNG, JPEG, GIF, WebP by their first bytes", () => {
  for (const url of [
    ASSET,
    'https://github.com/acme/app/assets/123/0b7f1e2a-3c4d-4e5f-8a9b-0c1d2e3f4a5b',
    'https://media.giphy.com/media/abc123XYZ/giphy.gif',
    'https://media2.giphy.com/media/v1.Y2lk/abc/200.gif?cid=x&rid=200.gif',
    'https://i.giphy.com/abc123XYZ.gif',
    'https://media.tenor.com/AbC/dancing.gif',
    'https://i.imgur.com/AbC123.png',
    'https://user-images.githubusercontent.com/1/2-x.png',
  ]) {
    assert.equal(picUrl(url), url, url);
  }

  assert.equal(
    picUrl('https://giphy.com/gifs/cat-funny-JIX9t2j0ZTN9S'),
    'https://media.giphy.com/media/JIX9t2j0ZTN9S/giphy.gif',
    'a Giphy page: its GIF',
  );

  assert.equal(
    picUrl('https://giphy.com/gifs/JIX9t2j0ZTN9S/'),
    'https://media.giphy.com/media/JIX9t2j0ZTN9S/giphy.gif',
  );

  for (const url of [
    'http://media.giphy.com/media/a/giphy.gif',
    'https://evil.example/p.png',
    'https://github.com/user-attachments/assets/not-a-uuid',
    'https://media.giphy.com.evil.example/x.gif',
    'https://i.imgur.com/a b.png',
    'https://github.com/acme/app/blob/main/x.png',
    'javascript:alert(1)',
    'data:image/png;base64,AAAA',
    '',
    null,
  ]) {
    assert.equal(picUrl(url), null, String(url));
  }

  assert.equal(picType(PNG), 'image/png');
  assert.equal(picType(GIF), 'image/gif');
  assert.equal(picType(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1])), 'image/jpeg');
  assert.equal(picType(Buffer.from('RIFF\x10\x00\x00\x00WEBPVP8 ', 'latin1')), 'image/webp');

  for (const bytes of [
    Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
    Buffer.from('<!doctype html><html>'),
    Buffer.from('GIF8'),
    Buffer.alloc(0),
  ]) {
    assert.equal(picType(bytes), null);
  }

  assert.equal(picSnippet(`![a cat](${ASSET})`), '📷 a picture');
  assert.equal(picSnippet(`![a](${ASSET})\n\n<img width="300" alt="b" src="${ASSET}">`), '📷 2 pictures');
  assert.equal(picSnippet(`look ![a](${ASSET})`), null, 'words too: said as they are');
});

test(
  "pictures end to end: the files repo made and kept the chat's, a member's picture up and back, one from GitHub's page, one shared with nobody",
  { timeout: 90_000 },
  async () => {
    const gh = await startFakeGitHub({
      users: ['me', 'ana', 'rui'],
      orgs: { 'acme-chat': ['me'] },
      repos: {
        'acme-chat/room': { perms: { ana: 'pull' }, rooms: [{ title: 'Chat', comments: [['ana', 'hi']] }] },
        'acme/secret': { perms: {} },
      },
    });

    const ana = await startTestServer({ env: { GITHUB_API: gh.url, FAKEGH_VIEWER: 'ana', ...FAST } });
    let owner = null;

    const use = srv =>
      srv.api('api/config', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat: { repo: 'acme-chat/room' } }),
      });

    const ready = srv =>
      waitFor(
        async () => {
          const current = (await srv.api('api/chat')).body;

          return current.ready && current;
        },
        { what: 'the chat read' },
      );

    const pic = async (srv, url) => {
      const response = await fetch(new URL(`api/chat/pic?u=${encodeURIComponent(url)}`, srv.url), {
        headers: { 'x-peix-key': srv.key },
      });

      return {
        status: response.status,
        type: response.headers.get('content-type'),
        csp: response.headers.get('content-security-policy'),
        bytes: Buffer.from(await response.arrayBuffer()),
      };
    };

    const upload = (srv, bytes, name) =>
      srv.api(`api/chat/upload?name=${encodeURIComponent(name)}`, { method: 'POST', body: bytes });

    try {
      // ana's board first: a member, and no files repo yet — her pictures have no place, and she is told why
      await use(ana);
      const before = await ready(ana);

      assert.deepEqual([before.role, before.pics.can], ['read', false]);
      assert.match(before.pics.why, /acme-chat\/room-files, which the chat's admin has not shared with you yet/);
      assert.equal((await upload(ana, PNG, 'shot.png')).status, 409);

      // the admin's board: the files repo made — private, empty, not a chat by its description — and ana a writer there
      owner = await startTestServer({ env: { GITHUB_API: gh.url, FAKEGH_VIEWER: 'me', ...FAST } });
      await use(owner);
      const ownerChat = await ready(owner);

      assert.deepEqual(ownerChat.pics, { can: true, why: null }, 'the admin writes to the chat itself');
      const files = gh.repo('acme-chat/room-files');

      assert.ok(files, 'the files repo made');
      assert.equal(files.private, true);
      assert.doesNotMatch(files.description, /^peixAIrada chat/, 'never listed as a chat');
      assert.deepEqual(files.subs.me, { subscribed: false, ignored: true });

      assert.deepEqual(
        files.invitations.map(invitation => [invitation.login, invitation.permission]),
        [['ana', 'push']],
      );

      assert.ok(
        !(await owner.api('api/chat/places')).body.chats.some(chat => /files/.test(chat.repo)),
        'not one of the places a chat is',
      );

      // ana's board takes the invitation by itself (asked again as the panel opens), and her picture goes up there
      const can = await waitFor(
        async () => {
          const current = (await ana.api('api/chat?pics=1')).body;

          return current.pics?.can && current;
        },
        { what: "ana's pictures' place, the invitation taken" },
      );

      assert.equal(can.pics.why, null);
      assert.equal(files.perms.ana, 'push');

      assert.equal(
        (await upload(ana, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'x.svg')).status,
        415,
        'no SVG, nothing but a picture',
      );

      const up = await upload(ana, GIF, 'party time.gif');

      assert.equal(up.status, 200, JSON.stringify(up.body));
      assert.match(up.body.url, /^https:\/\/github\.com\/user-attachments\/assets\/[0-9a-f-]{36}$/);
      assert.deepEqual([up.body.type, up.body.name], ['image/gif', 'party time']);

      assert.equal(
        gh.assets.get(up.body.url.split('/').pop()).repo,
        'acme-chat/room-files',
        'against the files repo: she only reads the chat',
      );

      assert.equal((await ana.post('api/chat/send', { body: `![party time](${up.body.url})` })).status, 200);

      // the owner's board fetches it — through GitHub's signed address — and keeps it; ana's had it kept from the upload
      const calls = () => gh.calls.filter(call => call.startsWith('POST /markdown')).length;
      const got = await pic(owner, up.body.url);

      assert.deepEqual([got.status, got.type, got.bytes.equals(GIF)], [200, 'image/gif', true]);
      assert.match(got.csp, /sandbox/);
      assert.equal(calls(), 1);
      assert.deepEqual([(await pic(owner, up.body.url)).status, calls()], [200, 1], 'kept: GitHub not asked again');
      assert.equal((await pic(ana, up.body.url)).bytes.equals(GIF), true);
      assert.equal(calls(), 1, "the uploader's own, kept from the upload");

      // a picture dropped on GitHub's page of the chat, against the chat's repo; one of a repo nobody shared with you; a
      // picture by its path (the app's drop); an address that is no picture's
      const web = gh.asset('acme-chat/room', PNG);
      const [anaPic, ownerPic] = await Promise.all([pic(ana, web), pic(owner, web)]);

      assert.deepEqual([anaPic.status, anaPic.bytes.equals(PNG), ownerPic.status], [200, true, 200]);
      assert.equal((await pic(ana, gh.asset('acme/secret', PNG))).status, 404, 'GitHub signs none for you');
      assert.equal((await pic(ana, 'https://evil.example/p.png')).status, 400);
      const shot = join(tmpDir('peix-pic-'), 'shot.png');

      writeFileSync(shot, PNG);
      const byPath = await ana.api(`api/chat/upload?path=${encodeURIComponent(shot)}`, { method: 'POST' });

      assert.equal(byPath.status, 200, JSON.stringify(byPath.body));
      assert.equal(byPath.body.name, 'shot');

      assert.equal(
        (await ana.api(`api/chat/upload?path=${encodeURIComponent('/etc/hosts')}`, { method: 'POST' })).status,
        400,
        "a path that is no picture's",
      );

      // the people follow: rui invited to the chat is invited to its files too; ana removed goes from both
      await owner.post('api/chat/invite', { login: 'rui' });

      assert.deepEqual(
        files.invitations.map(invitation => invitation.login),
        ['rui'],
      );

      await owner.post('api/chat/remove', { login: 'ana' });
      assert.deepEqual([gh.repo('acme-chat/room').perms.ana, files.perms.ana], [undefined, undefined]);

      const rui = files.invitations[0];
      const ruiChat = gh.repo('acme-chat/room').invitations.find(invitation => invitation.login === 'rui');

      await owner.post('api/chat/cancel', { id: ruiChat.id });
      assert.ok(!files.invitations.includes(rui), 'an invitation cancelled: its files one too');
    } finally {
      await owner?.stop();
      await ana.stop();
      await gh.close();
    }
  },
);

test(
  "the files repo's invitation that expired unanswered is made again by the admin's board",
  { timeout: 40_000 },
  async () => {
    const gh = await startFakeGitHub({
      users: ['me', 'ana'],
      orgs: { 'acme-chat': ['me'] },
      repos: {
        'acme-chat/room': { perms: { ana: 'pull' }, rooms: [{ title: 'Chat' }] },
        'acme-chat/room-files': { description: 'pictures' },
      },
    });

    gh.invite('acme-chat/room-files', 'ana', 'me');
    const old = gh.repo('acme-chat/room-files').invitations[0];

    old.expired = true;
    const owner = await startTestServer({ env: { GITHUB_API: gh.url, FAKEGH_VIEWER: 'me', ...FAST } });

    try {
      await owner.api('api/config', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat: { repo: 'acme-chat/room' } }),
      });

      await waitFor(async () => (await owner.api('api/chat')).body.ready, { what: 'the chat read' });
      const now = gh.repo('acme-chat/room-files').invitations;

      assert.deepEqual(
        now.map(invitation => [invitation.login, !!invitation.expired]),
        [['ana', false]],
        'a fresh one in its place',
      );

      assert.notEqual(now[0].id, old.id);
    } finally {
      await owner.stop();
      await gh.close();
    }
  },
);

test('a member leaving leaves the files repo too', { timeout: 40_000 }, async () => {
  const gh = await startFakeGitHub({
    users: ['me', 'ana'],
    orgs: { 'acme-chat': ['me'] },
    repos: {
      'acme-chat/room': { perms: { ana: 'pull' }, rooms: [{ title: 'Chat' }] },
      'acme-chat/room-files': { perms: { ana: 'push' }, description: 'pictures' },
    },
  });

  const ana = await startTestServer({ env: { GITHUB_API: gh.url, FAKEGH_VIEWER: 'ana', ...FAST } });

  try {
    await ana.api('api/config', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat: { repo: 'acme-chat/room' } }),
    });

    const state = await waitFor(
      async () => {
        const current = (await ana.api('api/chat')).body;

        return current.ready && current;
      },
      { what: 'the chat read' },
    );

    assert.equal(state.pics.can, true, 'already a writer there');
    assert.equal((await ana.post('api/chat/leave', {})).status, 200);

    assert.deepEqual(
      [gh.repo('acme-chat/room').perms.ana, gh.repo('acme-chat/room-files').perms.ana],
      [undefined, undefined],
    );
  } finally {
    await ana.stop();
    await gh.close();
  }
});

test("an emoji's character from GitHub's address for it: its code points, a lone old symbol as an emoji", () => {
  const emojiUrl = cp => `https://github.githubassets.com/images/icons/emoji/unicode/${cp}.png?v8`;

  assert.equal(emojiChar(emojiUrl('1f44d')), '👍');
  assert.equal(emojiChar(emojiUrl('2764')), '❤️', 'the presentation selector: ❤ alone is text');
  assert.equal(emojiChar(emojiUrl('0023-20e3')), '#️⃣', "a keycap's selector before its cap");
  assert.equal(emojiChar(emojiUrl('1f3f3-fe0f-200d-1f308')), '🏳️‍🌈');

  assert.equal(
    emojiChar('https://github.githubassets.com/images/icons/emoji/octocat.png?v8'),
    null,
    "GitHub's own picture",
  );

  assert.deepEqual(REACTIONS, ['+1', '-1', 'laugh', 'hooray', 'confused', 'heart', 'rocket', 'eyes']);
});

test(
  "edits, reactions and emoji end to end: your own words edited, a reaction given and taken back, GitHub's emoji names",
  { timeout: 60_000 },
  async () => {
    const gh = await startFakeGitHub({
      users: ['me', 'ana'],
      orgs: { 'acme-chat': ['me'] },
      repos: {
        'acme-chat/room': { perms: { ana: 'pull' }, rooms: [{ title: 'Chat', comments: [['ana', 'hello']] }] },
      },
    });

    const srv = await startTestServer({ env: { GITHUB_API: gh.url, FAKEGH_VIEWER: 'me', ...FAST } });
    let sse = null;

    try {
      await srv.api('api/config', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat: { repo: 'acme-chat/room' } }),
      });

      await waitFor(async () => (await srv.api('api/chat')).body.ready, { what: 'the chat read' });
      const msgs = async () => (await srv.api('api/chat/messages')).body.msgs;
      const hers = (await msgs()).find(message => message.who === 'ana');

      assert.deepEqual([hers.rc, hers.rx, hers.reacts], [{}, '', []], 'no reactions: none asked');

      // an edit: yours alone, never a poll, never to nothing; GitHub's comment carries it, and nobody is alerted
      const sent = (await srv.post('api/chat/send', { body: 'helo' })).body.msg;

      sse = await stream(srv);
      await waitFor(() => sse.text.includes('event: snapshot'), { what: 'the stream' });
      sse.mark();
      const ed = await srv.post('api/chat/edit', { id: sent.id, body: ' hello\r\nall ' });

      assert.equal(ed.status, 200, JSON.stringify(ed.body));
      assert.deepEqual([ed.body.msg.body, !!ed.body.msg.edited], ['hello\nall', true]);

      assert.equal(
        gh.repo('acme-chat/room').issues[0].comments.find(comment => comment.id === sent.id).body,
        'hello\nall',
      );

      await waitFor(() => /event: chatmsgs\ndata: .*hello\\nall/.test(sse.since()), {
        what: 'the edit, to every page',
      });

      assert.ok(!sse.since().includes('event: alert'), 'an edit alerts nobody');

      for (const [body, code, why] of [
        [{ id: hers.id, body: 'mine now' }, 403, /only your own/],
        [{ id: sent.id, body: '  ' }, 400, /delete it instead/],
        [{ id: sent.id, body: pollBody('x?', ['a', 'b'], false) }, 400, /poll/],
        [{ id: 1, body: 'x' }, 404, /no such message/],
      ]) {
        const refused = await srv.post('api/chat/edit', body);

        assert.equal(refused.status, code, JSON.stringify(body));
        assert.match(refused.body.error, why);
      }

      const poll = (await srv.post('api/chat/poll', { q: 'Lunch?', answers: ['yes', 'no'] })).body.msg;

      assert.equal(
        (await srv.post('api/chat/edit', { id: poll.id, body: 'no poll' })).status,
        400,
        'a poll is not edited',
      );

      // ana edits hers on GitHub: taken in place
      gh.edit(hers.id, 'hello (edited)');

      await waitFor(async () => (await msgs()).find(message => message.id === hers.id).body === 'hello (edited)', {
        what: 'her edit',
      });

      // reactions: hers given on GitHub, read with who; yours given and taken back; a poll's are its votes
      gh.react(hers.id, 'ana', 'heart');

      const reacted = await waitFor(
        async () => {
          const found = (await msgs()).find(message => message.id === hers.id);

          return found.reacts?.length && found;
        },
        { what: 'her reaction, read' },
      );

      assert.deepEqual(
        [reacted.rc, reacted.rx, reacted.reacts.map(reaction => `${reaction.who}:${reaction.r}`)],
        [{ heart: 1 }, 'heart:1', ['ana:heart']],
      );

      let response = await srv.post('api/chat/react', { id: hers.id, r: 'heart' });

      assert.equal(response.status, 200, JSON.stringify(response.body));

      assert.deepEqual(
        [response.body.msg.rc, response.body.msg.reacts.map(reaction => `${reaction.who}:${reaction.r}`).sort()],
        [{ heart: 2 }, ['ana:heart', 'me:heart']],
      );

      response = await srv.post('api/chat/react', { id: hers.id, r: 'rocket' });
      assert.deepEqual(response.body.msg.rc, { heart: 2, rocket: 1 });
      response = await srv.post('api/chat/react', { id: hers.id, r: 'heart' });

      assert.deepEqual(
        [response.body.msg.rc, response.body.msg.rx],
        [{ heart: 1, rocket: 1 }, 'heart:1 rocket:1'],
        'yours again: taken back',
      );

      assert.deepEqual(
        gh
          .repo('acme-chat/room')
          .issues[0].comments.find(comment => comment.id === hers.id)
          .reactions.map(reaction => `${reaction.user.login}:${reaction.content}`)
          .sort(),
        ['ana:heart', 'me:rocket'],
      );

      assert.equal((await srv.post('api/chat/react', { id: hers.id, r: 'thumbsup' })).status, 400);

      assert.equal(
        (await srv.post('api/chat/react', { id: poll.id, r: '+1' })).status,
        400,
        "a poll's reactions are its votes",
      );

      // GitHub's emoji names: Unicode ones as characters, its own pictures left out; kept, not asked again
      const emojis = await srv.api('api/chat/emojis');

      assert.equal(emojis.status, 200, JSON.stringify(emojis.body));

      assert.deepEqual(
        [emojis.body.emojis['+1'], emojis.body.emojis.heart, emojis.body.emojis.hash, emojis.body.emojis.octocat],
        ['👍', '❤️', '#️⃣', undefined],
      );

      await srv.api('api/chat/emojis');
      assert.equal(gh.calls.filter(call => call.startsWith('GET /emojis')).length, 1, 'kept');
      // and an alert says a shortcode as its emoji
      sse.mark();
      gh.say('acme-chat/room', 1, 'ana', ':tada: shipped :octocat:');
      await waitFor(() => sse.since().includes('event: alert'), { what: 'her alert' });
      assert.match(sse.since(), /"snippet":"🎉 shipped :octocat:"/);
    } finally {
      sse?.close();
      await srv.stop();
      await gh.close();
    }
  },
);
