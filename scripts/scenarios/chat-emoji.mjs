// Edits, emoji and reactions in the chat (2026-11-25), on a fake GitHub (scripts/fakes/fakegithub.mjs): ana's message
// with a :shortcode: and a reaction of hers, mine with a picture. What this checks: GitHub's names drawn as their emoji
// (not in code; one it has as a picture left as words); her reaction a chip with who, mine given by a click and by the
// React button's row, and taken back; my message edited in the box — its words there, its picture kept, ⏎ saving it on
// GitHub, *edited* said —, ↑ in the empty box taking my last, esc putting back what the box held; the picker's search
// and a pick; the box's : suggestions (↓ and ⇥), and a name closed by its colon becoming its emoji.
import { waitFor } from '../../lib/testserver.mjs';
import { startFakeGitHub } from '../fakes/fakegithub.mjs';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAACgAAAAYCAIAAAAH5iiXAAAAKElEQVR4nGO4Y2M0IIhh1OJRi0ctHrV41OJRi0ctHrV41OJRi4ePxQAWWdW9D91O3QAAAABJRU5ErkJggg==',
  'base64',
);

const gh = await startFakeGitHub({
  users: ['me', 'ana'],
  orgs: { 'acme-chat': ['me'] },
  repos: { 'acme-chat/room': { perms: { ana: 'pull' }, rooms: [{ title: 'Chat', comments: [] }] } },
});

const shot = gh.asset('acme-chat/room', PNG);
const hers = gh.say('acme-chat/room', 1, 'ana', 'shipped :tada: — see `:tada:` and :octocat:');

gh.react(hers, 'ana', 'heart');
const mine = gh.say('acme-chat/room', 1, 'me', `teh fix\n\n![shot](${shot})`);

gh.say('acme-chat/room', 1, 'me', 'later');

export const meta = {
  server: true,
  fixture: 'auto',
  env: { GITHUB_API: gh.url, FAKEGH_VIEWER: 'me', CHAT_FAST_MS: '250', CHAT_SLOW_MS: '250', CHAT_GAP_MS: '30' },
};

export default async function (ctx) {
  const out = {};

  try {
    const query = sel => `document.querySelector(${JSON.stringify(sel)})`;
    const msg = id => `${query(`#rmlog .rmmsg[data-id="${id}"]`)}`;

    const rect = sel =>
      ctx.evaluate(
        `(r => ({ x: Math.max(0, r.left - 8), y: Math.max(0, r.top - 8), width: r.width + 16, height: r.height + 16 }))(${query(sel)}.getBoundingClientRect())`,
      );

    const key = (keyName, sel = '#rmbox', more = '') =>
      ctx.evaluate(
        `${query(sel)}.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(keyName)}, bubbles: true, cancelable: true${more} }))`,
      );

    const type = text =>
      ctx.evaluate(
        `(b => { b.focus(); b.setRangeText(${JSON.stringify(text)}, b.selectionStart, b.selectionEnd, 'end'); b.dispatchEvent(new InputEvent('input', { bubbles: true })); })(${query('#rmbox')})`,
      );

    const box = () => ctx.evaluate(`${query('#rmbox')}.value`);

    await ctx.server.api('api/config', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat: { repo: 'acme-chat/room' } }),
    });

    await ctx.waitFor(`!!${query('#sbChat')} && !/still being read/.test(${query('#sbChat')}.title)`, {
      what: 'the chat',
    });

    await ctx.evaluate(`${query('#sbChat')}.click()`);
    await ctx.waitFor(`document.querySelectorAll('#rmlog .rmmsg').length === 3`, { what: 'the messages' });

    // GitHub's names drawn as their emoji — not in code, its own picture's name left as words
    await ctx.waitFor(`/🎉/.test(${msg(hers)}.querySelector('.rmbody').textContent)`, { what: 'the shortcode drawn' });
    out.words = await ctx.evaluate(`${msg(hers)}.querySelector('.rmbody').textContent.trim()`);
    ctx.assert.equal(out.words, 'shipped 🎉 — see :tada: and :octocat:');

    // her reaction, a chip with who; mine added by a click on it, then a rocket from the React row, the heart taken back
    await ctx.waitFor(`!!${msg(hers)}.querySelector('.rmrc[data-r="heart"]')`, { what: 'her reaction' });

    const chips = () =>
      ctx
        .evaluate(
          `JSON.stringify([...${msg(hers)}.querySelectorAll('.rmrc:not(.add)')].map(c => [c.dataset.r, c.textContent, c.classList.contains('mine'), c.title]))`,
        )
        .then(JSON.parse);

    ctx.assert.deepEqual(await chips(), [['heart', '❤️1', false, 'ana']]);
    await ctx.evaluate(`${msg(hers)}.querySelector('.rmrc[data-r="heart"]').click()`);

    await ctx.waitFor(`${msg(hers)}.querySelector('.rmrc[data-r="heart"]')?.textContent === '❤️2'`, {
      what: 'mine, at once',
    });

    await waitFor(
      () => gh.repo('acme-chat/room').issues[0].comments.find(comment => comment.id === hers).reactions.length === 2,
      {
        what: 'mine on GitHub',
      },
    );

    await ctx.evaluate(`${msg(hers)}.querySelector('.rmacts [data-rm="rxpick"]').click()`);
    await ctx.waitFor(`!${query('#rmrxp')}.hidden`, { what: 'the React row' });
    await ctx.settle();
    await ctx.shot('1-react-row', await rect('#room'));
    await ctx.evaluate(`${query('#rmrxp [data-rx="rocket"]')}.click()`);
    await ctx.waitFor(`!!${msg(hers)}.querySelector('.rmrc[data-r="rocket"]')`, { what: 'the rocket' });
    await ctx.evaluate(`${msg(hers)}.querySelector('.rmrc[data-r="heart"]').click()`);

    await waitFor(
      () =>
        gh
          .repo('acme-chat/room')
          .issues[0].comments.find(comment => comment.id === hers)
          .reactions.map(reaction => `${reaction.user.login}:${reaction.content}`)
          .sort()
          .join() === 'ana:heart,me:rocket',
      { what: 'the heart taken back on GitHub' },
    );

    await ctx.waitFor(`${msg(hers)}.querySelector('.rmrc[data-r="heart"]')?.textContent === '❤️1'`, {
      what: 'the heart back to hers',
    });

    out.chips = await chips();

    ctx.assert.deepEqual(out.chips, [
      ['heart', '❤️1', false, 'ana'],
      ['rocket', '🚀1', true, 'you'],
    ]);

    // ↑ in the empty box takes my last; esc puts back what the box held (nothing); then my first, by its Edit button:
    // its words in the box, its picture kept
    await ctx.evaluate(`${query('#rmbox')}.focus()`);
    await key('ArrowUp');

    await ctx.waitFor(`!${query('#rmediting')}.hidden && ${query('#rmbox')}.value === 'later'`, {
      what: '↑ editing my last',
    });

    await ctx.evaluate(
      `document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }))`,
    );

    await ctx.waitFor(`${query('#rmediting')}.hidden && ${query('#rmbox')}.value === '' && ${query('#room')}.open`, {
      what: 'esc: the edit let go, the panel still up',
    });

    await ctx.evaluate(`${msg(mine)}.querySelector('[data-rm="editmsg"]').click()`);

    await ctx.waitFor(`${query('#rmbox')}.value === 'teh fix' && ${msg(mine)}.classList.contains('editing')`, {
      what: 'my message in the box',
    });

    await ctx.settle();
    await ctx.shot('2-editing', await rect('#room'));
    await ctx.fill('#rmbox', 'the fix');
    await key('Enter');

    await waitFor(
      () =>
        gh.repo('acme-chat/room').issues[0].comments.find(comment => comment.id === mine).body ===
        `the fix\n\n![shot](${shot})`,
      {
        what: 'the edit on GitHub, its picture kept',
      },
    );

    await ctx.waitFor(
      `${query('#rmediting')}.hidden && ${query('#rmbox')}.value === '' && !!${msg(mine)}.querySelector('.edited') && !!${msg(mine)}.querySelector('.rmpic')`,
      {
        what: 'edited, said',
      },
    );

    ctx.assert.match(await ctx.evaluate(`${msg(mine)}.querySelector('.rmbody').textContent`), /the fix/);

    // the picker: searched, a pick into the box where the caret is
    await type('lunch ');
    await ctx.evaluate(`${query('#rmEmoBtn')}.click()`);

    await ctx.waitFor(`!${query('#rmemo')}.hidden && document.querySelectorAll('#rmemog .rmeb').length > 3`, {
      what: 'the picker',
    });

    await ctx.settle();
    await ctx.shot('3-picker', await rect('#room'));
    await ctx.fill('#rmemoq', 'ram');
    await ctx.waitFor(`${query('#rmemog .rmeb')}?.dataset.emo === 'ramen'`, { what: 'ramen found' });
    await key('Enter', '#rmemoq');
    await ctx.waitFor(`${query('#rmemo')}.hidden`, { what: 'the picker let go' });
    ctx.assert.equal(await box(), 'lunch 🍜');

    // the box's suggestions: ":sm" offers, ↓ and ⇥ take the second; ":fish:" closed by its colon is its emoji
    await type(' :sm');

    await ctx.waitFor(`!${query('#rmsug')}.hidden && document.querySelectorAll('#rmsug .rmsi').length >= 2`, {
      what: 'the suggestions',
    });

    out.sug = await ctx.evaluate(`[...document.querySelectorAll('#rmsug .rmsi')].map(i => i.dataset.emo).join(' ')`);
    ctx.assert.equal(out.sug, 'smile smiley sweat_smile');
    await ctx.settle();
    await ctx.shot('4-suggestions', await rect('#room'));
    await key('ArrowDown');
    await key('Tab');
    ctx.assert.equal(await box(), 'lunch 🍜 😃 ');
    ctx.assert.equal(await ctx.evaluate(`${query('#rmsug')}.hidden`), true);
    await type('at :fish:');
    ctx.assert.equal(await box(), 'lunch 🍜 😃 at 🐟');
    await key('Enter');

    await waitFor(() => gh.repo('acme-chat/room').issues[0].comments.at(-1).body === 'lunch 🍜 😃 at 🐟', {
      what: 'sent',
    });

    out.recent = await ctx.evaluate('peix.prefs().emojiRecent.join(" ")');
    ctx.assert.equal(out.recent, 'fish smiley ramen', "the picker's first row: what you used, newest first");
    return out;
  } finally {
    await gh.close();
  }
}
