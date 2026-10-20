// A poll in the chat (2026-10-20): a fake GitHub (scripts/fakegithub.mjs) with the chat, ana and rui in it, and lunch set
// up with two places. What this checks: the box's poll button opens the form in the box's place and Esc lets it go;
// what is typed is kept through a row added, and ⏎ walks down to a new answer; Lunch fills it with lunch's places and
// Not today; Ask posts it — on GitHub a comment that reads as words, a line per answer with the reaction that votes for
// it — and the panel draws it as a poll; a click votes (your reaction on GitHub), another answer moves it (one each), the
// same one again takes it back; ana's vote, given on GitHub, comes in with her name; lunch's dialog asks the chat with the
// form filled.
import { waitFor } from '../../lib/testserver.mjs';
import { startFakeGitHub } from '../fakegithub.mjs';

const gh = await startFakeGitHub({ users: ['me', 'ana', 'rui'], orgs: { 'acme-chat': ['me'] }, repos: {
  'acme-chat/room': { perms: { ana: 'pull', rui: 'pull' }, rooms: [{ title: 'General', comments: [['ana', 'hungry?']] }] } } });

export const meta = { server: true, fixture: 'auto', env: { GITHUB_API: gh.url, FAKEGH_VIEWER: 'me', CHAT_FAST_MS: '250', CHAT_SLOW_MS: '250', CHAT_GAP_MS: '30' } };

export default async function (ctx) {
  const out = {};
  try {
    const q = sel => `document.querySelector(${JSON.stringify(sel)})`;
    const click = sel => ctx.evaluate(`${q(sel)}.click()`);
    const enter = (sel, meta = false) => ctx.evaluate(`${q(sel)}.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', metaKey: ${meta}, bubbles: true, cancelable: true }))`);
    const esc = () => ctx.evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }))`);
    const form = () => ctx.evaluate(`JSON.stringify({ shown: !${q('#rmform')}.hidden, box: !${q('#rmrow')}.hidden, q: ${q('#rmform [data-pf="q"]')}?.value ?? null,
      answers: [...document.querySelectorAll('#rmform [data-pf="a"]')].map(i => i.value), focus: document.activeElement.dataset.pf ?? document.activeElement.id })`).then(JSON.parse);
    const poll = () => ctx.evaluate(`JSON.stringify([...document.querySelectorAll('#rmlog .rmpoll')].map(p => ({ q: p.querySelector('.rmq').textContent,
      opts: [...p.querySelectorAll('.rmopt')].map(o => ({ label: o.querySelector('.rmol').textContent, n: Number(o.querySelector('b').textContent), mine: o.getAttribute('aria-pressed') === 'true', who: o.querySelector('.rmvs span')?.textContent || '' })),
      foot: p.querySelector('.rmpf').textContent })))`).then(JSON.parse);
    const rect = sel => ctx.evaluate(`(r => ({ x: Math.max(0, r.left - 8), y: Math.max(0, r.top - 8), width: r.width + 16, height: r.height + 16 }))(${q(sel)}.getBoundingClientRect())`);
    const reactions = () => gh.repo('acme-chat/room').issues[0].comments.at(-1).reactions.map(x => `${x.user.login}:${x.content}`).sort();

    await ctx.server.api('api/config', { method: 'PUT', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat: { repo: 'acme-chat/room' }, lunch: { at: '12:30', days: [0, 1, 2, 3, 4, 5, 6], places: [{ name: 'Ramen Break' }, { name: 'Casa do Professor' }] } }) });
    await waitFor(async () => (await ctx.server.api('api/chat')).body.ready, { what: 'the chat read' });
    await ctx.waitFor(`!!${q('#sbChat')}`, { what: 'the chat in the bar' });
    await click('#sbChat');
    await ctx.waitFor(`${q('#room')}.open && /hungry/.test(${q('#rmlog')}.textContent)`, { what: 'the panel' });

    // the form, in the box's place; Esc lets it go before the panel
    await click('#rmPollBtn');
    out.opened = await form();
    ctx.assert.deepEqual([out.opened.shown, out.opened.box, out.opened.answers.length, out.opened.focus], [true, false, 2, 'q'], 'two answers to start, the question with the keys');
    await ctx.fill('#rmform [data-pf="q"]', 'Coffee?');
    await ctx.fill('#rmform [data-pf="a"][data-i="0"]', 'Now');
    await ctx.fill('#rmform [data-pf="a"][data-i="1"]', 'Later');
    await enter('#rmform [data-pf="a"][data-i="1"]');
    out.typed = await form();
    ctx.assert.deepEqual([out.typed.q, out.typed.answers, out.typed.focus], ['Coffee?', ['Now', 'Later', ''], 'a'], '⏎ past the last answer: a new one, what was typed kept');
    await esc();
    out.gone = await form();
    ctx.assert.deepEqual([out.gone.shown, out.gone.box, await ctx.evaluate(`${q('#room')}.open`)], [false, true, true], 'Esc: the form first, the panel stays');

    // Lunch fills it; Ask posts it
    await click('#rmPollBtn');
    await click('#rmform [data-pf="lunch"]');
    out.lunch = await form();
    ctx.assert.deepEqual([out.lunch.q, out.lunch.answers], ['Lunch at 12:30?', ['Ramen Break', 'Casa do Professor', 'Not today']]);
    await ctx.settle(); await ctx.shot('1-form', await rect('#room'));
    await click('#rmform [data-pf="post"]');
    await ctx.waitFor(`!!${q('#rmlog .rmpoll')} && ${q('#rmform')}.hidden`, { what: 'the poll, posted' });
    out.body = gh.repo('acme-chat/room').issues[0].comments.at(-1).body;
    ctx.assert.match(out.body, /^<!-- peixAIrada poll -->\n📊 \*\*Lunch at 12:30\?\*\*\n\n👍 Ramen Break\n🎉 Casa do Professor\n👎 Not today\n/, 'GitHub reads it as words, a reaction to each answer');
    out.posted = (await poll())[0];
    ctx.assert.deepEqual(out.posted.opts.map(o => [o.label, o.n, o.mine]), [['Ramen Break', 0, false], ['Casa do Professor', 0, false], ['Not today', 0, false]]);
    ctx.assert.match(out.posted.foot, /Nobody has answered yet · one answer each/);

    // a vote; another answer moves it; the same again takes it back — each a reaction of yours on GitHub
    await click('#rmlog .rmopt[data-r="+1"]');
    await waitFor(() => reactions().join() === 'me:+1', { what: 'your vote, a reaction' });
    await ctx.waitFor(`${q('#rmlog .rmopt[data-r="+1"]')}.getAttribute('aria-pressed') === 'true'`, { what: 'your vote drawn' });
    await click('#rmlog .rmopt[data-r="-1"]');
    await waitFor(() => reactions().join() === 'me:-1', { what: 'your vote moved on GitHub' });
    gh.react(gh.repo('acme-chat/room').issues[0].comments.at(-1).id, 'ana', '+1');
    await ctx.waitFor(`/ana/.test(${q('#rmlog .rmopt[data-r="+1"] .rmvs')}?.textContent || '')`, { what: 'ana\'s vote, given on GitHub' });
    out.voted = (await poll())[0];
    ctx.assert.deepEqual(out.voted.opts.map(o => [o.n, o.mine, o.who]), [[1, false, 'ana'], [0, false, ''], [1, true, 'you']]);
    ctx.assert.match(out.voted.foot, /^2 answered/);
    await ctx.settle(); await ctx.shot('2-voted', await rect('#room'));
    await click('#rmlog .rmopt[data-r="-1"]');
    await waitFor(() => reactions().join() === 'ana:+1', { what: 'yours taken back' });
    await ctx.waitFor(`${q('#rmlog .rmopt[data-r="-1"]')}.getAttribute('aria-pressed') === 'false' && ${q('#rmlog .rmopt[data-r="-1"] b')}.textContent === '0'`, { what: 'drawn taken back' });

    // lunch's dialog asks the chat: the panel, the form filled
    await click('#rmClose');
    await ctx.key('KeyM');
    await ctx.waitFor(`${q('#lunchd')}?.open && !!${q('#lunchd [data-lunch="poll"]')}`, { what: 'the chalkboard, with Ask the chat' });
    await click('#lunchd [data-lunch="poll"]');
    await ctx.waitFor(`${q('#room')}.open && !${q('#rmform')}.hidden`, { what: 'the panel, its form filled' });
    out.fromLunch = await form();
    ctx.assert.deepEqual([out.fromLunch.q, out.fromLunch.answers.length, out.fromLunch.focus, await ctx.evaluate(`${q('#lunchd')}.open`)], ['Lunch at 12:30?', 3, 'post', false]);
    await esc(); await esc();
    ctx.assert.equal(await ctx.evaluate(`${q('#room')}.open`), false, 'Esc: the form, then the panel');
    return out;
  } finally { await gh.close(); }
}
