// The chat (2026-10-17): a private repo of a fake GitHub (scripts/fakegithub.mjs) — its chat (the oldest issue labelled
// room; one, with no name, 2026-10-18), another labelled issue the board leaves be, ana a member, and in the chat a
// message that tries HTML, an image and a link. What this checks: Settings › Chat lists the chats you can read and
// fills a new one's box with the organization you own, shows a setup's repo GitHub does not show you as one to forget,
// refuses one by name you cannot read, and takes one of the chats; the status bar has the chat, and its click the
// panel — no tabs, the messages with their faces, markdown drawn but no HTML, no image and no link but https; another
// board's message comes in; one typed is sent; one said while the panel is shut counts unread in the bar, and is read
// once shown, and one in the other issue is nobody's; the admin's people view suggests eva (her PR is in a chat),
// invites rui by his login, removes ana after asking; your own message deleted; Esc lets go of the people view, then
// of the panel. In a repo where you are only a member the people are not there, nor a delete on someone else's words;
// and an invitation is the bar's word and Settings' Join.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpDir, waitFor } from '../../lib/testserver.mjs';
import { startFakeGitHub } from '../fakegithub.mjs';
import { makeFixture } from '../fixture.mjs';

const gh = await startFakeGitHub({ users: ['me', 'ana', 'rui', 'eva'], orgs: { 'acme-chat': ['me'], 'ana-chat': ['ana'] }, repos: {
  'acme-chat/room': { perms: { ana: 'pull' }, rooms: [
    { title: 'General', comments: [['ana', 'hello **there**'], ['me', 'hi ana'], ['ana', 'see https://example.com/notes and <img src=x onerror="window.pwned=1"> and ![pic](https://evil.example/p.png) and [a file](vscode://file/etc/hosts)']] },
    { title: 'Random', comments: [['ana', 'random thoughts']] },
  ] },
  'ana/talk': { perms: { me: 'pull' }, rooms: [{ title: 'Lobby', comments: [['ana', 'welcome']] }] },
  'ana/hush': { perms: {} },
  'ana-chat/later': { perms: {}, rooms: [{ title: 'General' }] },
} });
const dir = tmpDir('peix-chatroom-'), prs = join(dir, 'prs.json');
const face = login => ({ login, __typename: 'User', avatarUrl: gh.user(login).avatar_url });
writeFileSync(prs, JSON.stringify({ 'acme/app#1': { state: 'OPEN', title: 'One', createdAt: new Date(Date.now() - 3 * 3600_000).toISOString(), headRefOid: 'A', author: face('eva'),
  reviews: { nodes: [] }, comments: { nodes: [] }, pushes: { nodes: [] }, asks: { nodes: [] }, reviewRequests: { nodes: [] } } }));

export const meta = { server: true, fixture: 'auto', env: { GITHUB_API: gh.url, FAKEGH_PRS: prs, FAKEGH_VIEWER: 'me', CHAT_FAST_MS: '250', CHAT_SLOW_MS: '250', CHAT_GAP_MS: '30' } };

export default async function (ctx) {
  const out = {};
  try {
    makeFixture(ctx.fixture.dir, [{ cwd: process.cwd(), at: new Date(Date.now() - 60_000), title: 'On the app', prompt: 'look at https://github.com/acme/app/pull/1', reply: 'looked' }]);
    const q = sel => `document.querySelector(${JSON.stringify(sel)})`;
    const panel = () => ctx.evaluate(`JSON.stringify({ open: ${q('#room')}.open, title: ${q('#rmTitle')}.textContent, tabs: document.querySelectorAll('#room [role=tab], #rmtabs').length,
      msgs: [...document.querySelectorAll('#rmlog .rmmsg')].map(m => (m.classList.contains('cont') ? '+' : '') + (m.querySelector('.rmwho b')?.textContent || '') + ': ' + m.querySelector('.rmbody').textContent.trim()),
      people: !${q('#rmPeople')}.hidden, dels: document.querySelectorAll('#rmlog .rmdel').length, bar: ${q('#sbChat')}?.textContent || null })`).then(JSON.parse);
    const enter = sel => ctx.evaluate(`${q(sel)}.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }))`);
    const esc = () => ctx.evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }))`);
    const rect = sel => ctx.evaluate(`(r => ({ x: Math.max(0, r.left - 8), y: Math.max(0, r.top - 8), width: r.width + 16, height: r.height + 16 }))(${q(sel)}.getBoundingClientRect())`);

    ctx.assert.equal(await ctx.evaluate(`!!${q('#sbChat')}`), false, 'no chat, no invitation: nothing in the bar');
    // a setup naming a repo GitHub does not show you; Settings › Chat: that repo to forget, the chats you can read, and a
    // new one's box filled with the organization you own
    await ctx.server.api('api/config', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat: { repo: 'acme-chat/acme-chat' } }) });
    await waitFor(async () => (await ctx.server.api('api/chat')).body.missing, { what: 'the repo said missing' });
    await ctx.cmd('Comma');
    await ctx.waitFor(`${q('#settings')}.open`, { what: 'the settings' });
    await ctx.evaluate(`${q('#settings .stabs [data-tab="chat"]')}.click()`);
    await ctx.waitFor(`!!${q('#chatSet [data-repo]')}`, { what: 'Settings › Chat, with the chats found' });
    out.off = await ctx.evaluate(`JSON.stringify({ found: [...document.querySelectorAll('#chatSet [data-repo]')].map(b => b.dataset.repo).sort(), fresh: ${q('#chatSet .schatnew')}.value,
      where: ${q('#chatSet .schatnew')}.closest('.srow').querySelector('small').textContent, gone: ${q('#chatSet .serr')}?.textContent, forget: ${q('#chatSet [data-chat="leave"]')}?.textContent })`).then(JSON.parse);
    ctx.assert.match(out.off.gone, /acme-chat\/acme-chat is not a repo you can read/);
    ctx.assert.equal(out.off.forget, 'Forget it');
    ctx.assert.deepEqual(out.off.found, ['acme-chat/room', 'ana/talk'], 'yours and the one you were let into; not one you cannot read');
    ctx.assert.equal(out.off.fresh, 'acme-chat/chat');
    ctx.assert.match(out.off.where, /in acme-chat, the organization you own/);
    await ctx.settle(); await ctx.shot('1-settings-off', await rect('#settings'));
    // what is typed outlives a redraw: away to another pane and back draws the pane again
    await ctx.fill('#chatSet .schatnew', 'acme-chat/typed');
    await ctx.evaluate(`document.activeElement.blur(); ${q('#settings .stabs [data-tab="general"]')}.click(); ${q('#settings .stabs [data-tab="chat"]')}.click()`);
    await ctx.waitFor(`${q('#chatSet .schatnew')}?.value === 'acme-chat/typed' && ${q('#chatSet')}._drawn.includes('acme-chat/typed')`, { what: 'the typed repo kept through a redraw' });
    await ctx.fill('#chatSet .schatrepo', 'ana/hush');
    await ctx.evaluate(`${q('#chatSet .schatrepo + [data-chat="use"]')}.click()`);
    await ctx.waitFor(`/ana\\/hush is not a repo you can read/.test(document.querySelector('.note')?.textContent)`, { what: 'Use refusing a repo you cannot read' });
    ctx.assert.equal((await ctx.server.api('api/config')).body.chat.repo, 'acme-chat/acme-chat', 'nothing saved');
    await ctx.evaluate(`${q('#chatSet [data-repo="acme-chat/room"]')}.click()`);
    await ctx.waitFor(`/You are its admin/.test(${q('#chatSet')}.textContent)`, { what: 'the chat read, said in Settings' });
    ctx.assert.equal((await ctx.server.api('api/config')).body.chat.repo, 'acme-chat/room');
    await ctx.evaluate(`${q('#settingsClose')}.click()`);

    // the bar's chat opens the panel: the chat, no rooms
    await ctx.waitFor(`!!${q('#sbChat')}`, { what: 'the chat in the status bar' });
    await ctx.evaluate(`${q('#sbChat')}.click()`);
    await ctx.waitFor(`document.querySelectorAll('#rmlog .rmmsg').length === 3`, { what: 'the chat\'s messages' });
    out.open = await panel();
    ctx.assert.deepEqual([out.open.title, out.open.tabs], ['Chat', 0], 'one chat: no tabs, no name');
    ctx.assert.equal(out.open.msgs[0], 'ana: hello there');
    ctx.assert.equal(out.open.people, true, 'the admin\'s people');
    ctx.assert.equal(await ctx.evaluate(`document.activeElement === ${q('#rmbox')}`), true, 'the box has the keys');
    // someone else's words: markdown, but no HTML, no image, no link but https
    out.safe = await ctx.evaluate(`JSON.stringify({ strong: !!document.querySelector('#rmlog .rmbody strong'), imgs: [...document.querySelectorAll('#rmlog img')].filter(i => !i.classList.contains('face')).length,
      pwned: !!window.pwned, links: [...document.querySelectorAll('#rmlog .rmbody a')].map(a => [a.getAttribute('href'), a.title]), attrs: [...document.querySelectorAll('#rmlog .rmbody *')].flatMap(e => [...e.attributes].map(a => a.name)).filter(n => !['href', 'title', 'rel'].includes(n)) })`).then(JSON.parse);
    ctx.assert.deepEqual(out.safe, { strong: true, imgs: 0, pwned: false, links: [['https://example.com/notes', 'https://example.com/notes']], attrs: [] });
    ctx.assert.match(out.open.msgs[2], /<img src=x onerror="window.pwned=1">/, 'raw HTML shown as the text it is');
    ctx.assert.match(out.open.msgs[2], /\[image: pic\]/);
    await ctx.settle(); await ctx.shot('2-room', await rect('#room')); await ctx.shot('2-board');

    // another board's message comes in; one typed here goes out
    gh.say('acme-chat/room', 1, 'ana', 'are you around?');
    await ctx.waitFor(`/are you around/.test(${q('#rmlog')}.textContent)`, { what: 'ana\'s new message' });
    // …in the log as ⏎ is pressed (2026-10-27): the send held here, it is drawn on its way, the box empty, and takes its
    // place as GitHub's comment once let go
    await ctx.evaluate(`window.__send = []; window.__hold = true; window.__fail = null; (real => { window.fetch = (u, o) => !String(u).includes('/api/chat/send') ? real(u, o)
      : window.__fail ? Promise.resolve(new Response(JSON.stringify({ error: window.__fail }), { status: 502, headers: { 'content-type': 'application/json' } }))
      : window.__hold ? new Promise(go => window.__send.push(() => go(real(u, o)))) : real(u, o); })(window.fetch)`);
    const outs = () => ctx.evaluate(`JSON.stringify([...document.querySelectorAll('#rmlog .rmmsg.out')].map(m => ({ body: m.querySelector('.rmbody').textContent.trim(), fail: m.querySelector('.rmfail span')?.textContent || null, faded: getComputedStyle(m.querySelector('.rmbody')).opacity })))`).then(JSON.parse);
    await ctx.fill('#rmbox', 'yes — on it');
    await enter('#rmbox');
    out.going = { outs: await outs(), box: await ctx.evaluate(`${q('#rmbox')}.value`), held: await ctx.evaluate(`window.__send.length`) };
    ctx.assert.deepEqual(out.going, { outs: [{ body: 'yes — on it', fail: null, faded: '0.55' }], box: '', held: 1 }, `drawn at once, faded, the box emptied, the server not yet asked: ${JSON.stringify(out.going)}`);
    ctx.assert.equal(await ctx.evaluate(`${q('#rmlog .rmmsg:last-of-type')}.matches('.mine.out')`), true, 'the last in the log');
    await ctx.settle(); await ctx.shot('2b-sending', await rect('#room'));
    await ctx.evaluate(`window.__hold = false; window.__send.shift()()`);
    await ctx.waitFor(`[...document.querySelectorAll('#rmlog .rmmsg.mine[data-id]')].some(m => /yes — on it/.test(m.textContent)) && !document.querySelector('#rmlog .rmmsg.out')`, { what: 'the message sent, GitHub\'s comment in its place' });
    ctx.assert.equal(gh.repo('acme-chat/room').issues[0].comments.at(-1).body, 'yes — on it');
    ctx.assert.equal(await ctx.evaluate(`[...document.querySelectorAll('#rmlog .rmmsg')].filter(m => /yes — on it/.test(m.textContent)).length`), 1, 'once');
    // one that does not go says so where it is, to you alone: Try again sends it; Edit puts its words back in the box
    await ctx.evaluate(`window.__fail = 'GitHub said no'`);
    await ctx.fill('#rmbox', 'second try');
    await enter('#rmbox');
    await ctx.waitFor(`!!${q('#rmlog .rmmsg.out.fail')}`, { what: 'the message that did not go' });
    out.failed = await outs();
    ctx.assert.deepEqual(out.failed, [{ body: 'second try', fail: 'Not sent: GitHub said no', faded: '1' }]);
    ctx.assert.ok(!gh.repo('acme-chat/room').issues[0].comments.some(c => c.body === 'second try'), 'nobody else has it');
    await ctx.settle(); await ctx.shot('2c-not-sent', await rect('#room'));
    await ctx.evaluate(`window.__fail = null; ${q('#rmlog .rmmsg.out.fail [data-rm="retry"]')}.click()`);
    await ctx.waitFor(`[...document.querySelectorAll('#rmlog .rmmsg.mine[data-id]')].some(m => /second try/.test(m.textContent)) && !document.querySelector('#rmlog .rmmsg.out')`, { what: 'sent again' });
    ctx.assert.equal(gh.repo('acme-chat/room').issues[0].comments.at(-1).body, 'second try');
    await ctx.evaluate(`window.__fail = 'offline'`);
    await ctx.fill('#rmbox', 'third');
    await enter('#rmbox');
    await ctx.waitFor(`!!${q('#rmlog .rmmsg.out.fail')}`, { what: 'another that did not go' });
    await ctx.evaluate(`window.__fail = null; ${q('#rmlog .rmmsg.out.fail [data-rm="edit"]')}.click()`);
    ctx.assert.deepEqual([await ctx.evaluate(`${q('#rmbox')}.value`), await ctx.evaluate(`!!${q('#rmlog .rmmsg.out')}`), await ctx.evaluate(`document.activeElement === ${q('#rmbox')}`)], ['third', false, true], 'its words back in the box, with the keys');
    await ctx.evaluate(`(b => { b.value = ''; b.dispatchEvent(new InputEvent('input', { bubbles: true })); })(${q('#rmbox')})`);

    // said while the panel is shut: unread in the bar; shown, it is read — and the other labelled issue is nobody's
    await ctx.evaluate(`${q('#rmClose')}.click()`);
    gh.say('acme-chat/room', 2, 'ana', 'in the other issue');
    gh.say('acme-chat/room', 1, 'ana', 'ping');
    await ctx.waitFor(`${q('#sbChat')}.textContent === 'chat1'`, { what: 'the unread in the bar' });
    await ctx.evaluate(`${q('#sbChat')}.click()`);
    await ctx.waitFor(`/ping/.test(${q('#rmlog')}.textContent)`, { what: 'ana\'s ping in the panel' });
    ctx.assert.ok(!/in the other issue/.test(await ctx.evaluate(`${q('#rmlog')}.textContent`)), 'another labelled issue is not the chat');
    await waitFor(async () => (await ctx.server.api('api/chat')).body.unread === 0, { what: 'read once shown' });
    await ctx.waitFor(`${q('#sbChat')}.textContent === 'chat'`, { what: 'the bar\'s count gone' });

    // the people: eva suggested, rui invited by his login, ana removed after asking
    await ctx.evaluate(`${q('#rmPeople')}.click()`);
    await ctx.waitFor(`/eva/.test(${q('#rmplist')}.textContent)`, { what: 'the suggestions' });
    out.people = await ctx.evaluate(`[...document.querySelectorAll('#rmplist h6')].map(h => h.textContent + ': ' + [...(function* () { for (let n = h.nextElementSibling; n && n.tagName !== 'H6'; n = n.nextElementSibling) if (n.dataset.login) yield n.dataset.login; })()].join(','))`);
    ctx.assert.deepEqual(out.people, ['From your chats’ PRs: eva', 'In the chat: me,ana']);
    await ctx.settle(); await ctx.shot('3-people', await rect('#room'));
    await ctx.fill('#rmfind', 'rui');
    ctx.assert.match(await ctx.evaluate(`${q('#rmplist')}.textContent`), /Invite.*rui.*a GitHub login/);
    await enter('#rmfind');
    await ctx.waitFor(`/Invited.*rui/.test(${q('#rmplist')}.textContent)`, { what: 'rui invited' });
    ctx.assert.equal(gh.repo('acme-chat/room').invitations[0].login, 'rui');
    await ctx.evaluate(`${q('#rmplist .rmp[data-login="ana"] [data-rm="sureRemove"]')}.click()`);
    ctx.assert.match(await ctx.evaluate(`${q('#rmplist .rmsure')}.textContent`), /Remove ana\?/);
    await ctx.evaluate(`${q('#rmplist .rmsure [data-rm="remove"]')}.click()`);
    await ctx.waitFor(`!${q('#rmplist .rmp[data-login="ana"]')}`, { what: 'ana removed' });
    ctx.assert.equal(gh.repo('acme-chat/room').perms.ana, undefined);
    // Esc: the people first, then the panel
    await esc();
    ctx.assert.deepEqual([await ctx.evaluate(`${q('#room')}.open`), await ctx.evaluate(`${q('#rmlog')}.hidden`)], [true, false], 'back to the messages');
    const mine = await ctx.evaluate(`[...document.querySelectorAll('#rmlog .rmmsg.mine')].at(-1).dataset.id`);
    await ctx.evaluate(`${q(`#rmlog .rmmsg.mine[data-id="${mine}"] .rmdel`)}.click()`);
    await ctx.waitFor(`!${q(`#rmlog .rmmsg[data-id="${mine}"]`)}`, { what: 'your message deleted' });
    ctx.assert.ok(!gh.repo('acme-chat/room').issues[0].comments.some(c => c.id === Number(mine)));
    await esc();
    ctx.assert.equal(await ctx.evaluate(`${q('#room')}.open`), false, 'Esc closes the panel');

    // a repo where you are a member: no people, no delete on another's words
    await ctx.server.api('api/config', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat: { repo: 'ana/talk' } }) });
    await waitFor(async () => (await ctx.server.api('api/chat')).body.ready, { what: 'ana/talk read' });
    await ctx.evaluate(`${q('#sbChat')}.click()`);
    await ctx.waitFor(`/welcome/.test(${q('#rmlog')}.textContent)`, { what: 'ana/talk\'s chat' });
    out.member = await panel();
    ctx.assert.deepEqual([out.member.title, out.member.people, out.member.dels], ['Chat', false, 0]);
    await ctx.evaluate(`${q('#rmClose')}.click()`);

    // no chat, an invitation: the bar says so, Settings joins it
    await ctx.server.api('api/config', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat: null }) });
    gh.invite('ana-chat/later', 'me', 'ana');
    await ctx.cmd('Comma');
    await ctx.evaluate(`${q('#settings .stabs [data-tab="chat"]')}.click()`);
    await ctx.waitFor(`!!${q('#chatSet [data-chat="join"]')}`, { what: 'the invitation in Settings' });
    ctx.assert.match(await ctx.evaluate(`${q('#chatSet')}.textContent`), /ana invited you.*ana-chat\/later/);
    ctx.assert.equal(await ctx.evaluate(`${q('#sbChat')}?.textContent`), 'invited');
    await ctx.settle(); await ctx.shot('4-invited', await rect('#settings'));
    await ctx.evaluate(`${q('#chatSet [data-chat="join"]')}.click()`);
    await ctx.waitFor(`/You are a member/.test(${q('#chatSet')}.textContent)`, { what: 'joined' });
    ctx.assert.equal((await ctx.server.api('api/config')).body.chat.repo, 'ana-chat/later');
    return out;
  } finally { await gh.close(); }
}
