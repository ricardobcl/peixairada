// A PR opened again is the tab it already has — while that tab is still at it (2026-10-13). Further into the PR (its
// files, a comment) is still the PR; a tab followed somewhere else is that somewhere's now: opening the PR gives it a
// new tab in front, and the old one keeps where it went, named for it. A closed tab's view lingers in the shell where it
// was left, so a new tab never takes that name. ⌥⌘G from a page that left the PR opens the PR rather than fill the
// column. The app's bridge is faked, as in pane-tabs.mjs, and so is its word on where a page is (peixPaneUrl).
export const meta = { server: true, fake: true, fixture: 'auto' };

export default async function (ctx) {
  const [chat] = ctx.fixture.chats; // the one with two PRs
  const out = {};

  await ctx.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `window.__errs = []; addEventListener('error', e => window.__errs.push(e.message)); window.__posts = []; window.webkit = { messageHandlers: { hub: { postMessage: m => window.__posts.push(m) } } };`,
  });

  await ctx.reload();
  await ctx.openChat(chat.id);
  const [prUrl] = await ctx.peix(`session(${JSON.stringify(chat.id)}).prs.map(p => p.url)`);
  const pages = () => ctx.peix(`state().paneTabs[${JSON.stringify(chat.id)}] || []`);

  const open = () =>
    ctx.evaluate(
      `document.querySelector('#slist > .card[data-id=${JSON.stringify(chat.id)}] .mxs[data-url=${JSON.stringify(prUrl)}]').click()`,
    ); // the card's chip

  const wentTo = (key, url) => ctx.evaluate(`window.peixPaneUrl(${JSON.stringify(key)}, ${JSON.stringify(url)})`); // the shell, as the page navigates

  const lastPane = () =>
    ctx.evaluate(`JSON.stringify(window.__posts.filter(m => m.type === 'pane').pop() || null)`).then(JSON.parse);

  const label = key =>
    ctx.evaluate(
      `[...(document.querySelector(${JSON.stringify(`.ptab[data-tab="${key}"]`)})?.childNodes || [])].find(n => n.nodeType === 3)?.textContent || null`,
    );

  // the PR on its tab
  await open();
  await ctx.waitFor(`window.peix.state().tab === ${JSON.stringify(`gh:${prUrl}`)}`, { what: 'the PR on a tab' });
  ctx.assert.deepEqual(await pages(), [`gh:${prUrl}`]);

  // followed into its files, then to a comment: still the PR — opening it again is that tab
  await wentTo(`gh:${prUrl}`, `${prUrl}/files`);
  await ctx.cmd('Digit1');
  await open();

  await ctx.waitFor(`window.peix.state().tab === ${JSON.stringify(`gh:${prUrl}`)}`, {
    what: "the same tab, the PR's files",
  });

  await wentTo(`gh:${prUrl}`, `${prUrl}#issuecomment-1`);
  await ctx.cmd('Digit1');
  await open();

  await ctx.waitFor(`window.peix.state().tab === ${JSON.stringify(`gh:${prUrl}`)}`, {
    what: 'the same tab, a comment on it',
  });

  ctx.assert.deepEqual(await pages(), [`gh:${prUrl}`], 'no second tab while the first is at the PR');

  // followed elsewhere — another PR whose number starts with this one's: no longer the PR. Opening it is a new tab, in
  // front, the keys on it; the old one stays, named for where it went
  const away = `${prUrl}0`;

  await wentTo(`gh:${prUrl}`, away);
  await ctx.cmd('Digit1');
  await open();
  await ctx.waitFor(`window.peix.state().tab === ${JSON.stringify(`gh2:${prUrl}`)}`, { what: 'a new tab for the PR' });

  out.two = {
    pages: await pages(),
    strip: (await ctx.peix('state().strips'))[1],
    pane: await lastPane(),
    old: await label(`gh:${prUrl}`),
  };

  ctx.assert.deepEqual(out.two.pages, [`gh:${prUrl}`, `gh2:${prUrl}`]);

  ctx.assert.deepEqual(
    out.two.strip,
    [`gh:${prUrl}`, `gh2:${prUrl}`],
    'beside the old one, in the half without the chat',
  );

  ctx.assert.equal(out.two.pane.focus, `gh2:${prUrl}`, 'the shell shows the new tab and gives it the keys');
  const number = /\/pull\/(\d+)$/.exec(prUrl)[1];

  ctx.assert.match(out.two.old, new RegExp(`#${number}0$`), 'the old tab is named for where it is');

  ctx.assert.equal(
    await ctx.evaluate(`document.querySelector('#ptabsB .purl')?.dataset.url`),
    prUrl,
    "the new one's address is the PR",
  );

  await ctx.settle();
  await ctx.shot('two-tabs');

  // again: the new tab, not a third
  await ctx.cmd('Digit1');
  await open();
  await ctx.waitFor(`window.peix.state().tab === ${JSON.stringify(`gh2:${prUrl}`)}`, { what: 'the new tab again' });
  ctx.assert.equal((await pages()).length, 2);

  // the old tab clicked: it comes up as it stands, nothing opened
  await ctx.evaluate(`document.querySelector(${JSON.stringify(`#ptabsB .ptab[data-tab="gh:${prUrl}"]`)}).click()`);
  await ctx.waitFor(`window.peix.state().tab === ${JSON.stringify(`gh:${prUrl}`)}`, { what: 'the old tab in front' });
  ctx.assert.equal((await pages()).length, 2, 'a tab clicked is never a new one');
  ctx.assert.equal(await ctx.evaluate(`document.querySelector('#ptabsB .purl')?.dataset.url`), away);
  // ⌥⌘G from it: not the PR's page, so not filling the column — the PRs, to choose from
  await ctx.key('KeyG');
  await ctx.waitFor(`!!document.querySelector('#pick').open`, { what: 'the PR picker' });
  ctx.assert.equal(await ctx.peix('state().zoomed'), null, 'nothing filled the column');
  await ctx.evaluate(`document.querySelector('#pick').close()`);
  // ⌥⌘G from the PR's own tab is the picker again — the chat has two (2026-10-16) — and once more fills the column, and back
  await ctx.evaluate(`document.querySelector(${JSON.stringify(`#ptabsB .ptab[data-tab="gh2:${prUrl}"]`)}).click()`);
  await ctx.key('KeyG');

  await ctx.waitFor(
    `!!document.querySelector('#pick').open && /⌥⌘G fills/.test(document.querySelector('#pickq').placeholder)`,
    { what: 'the picker, from the PR' },
  );

  await ctx.key('KeyG');

  await ctx.waitFor(`window.peix.state().zoomed === 1 && !document.querySelector('#pick').open`, {
    what: "the PR's half filling the column",
  });

  await ctx.key('KeyG');
  await ctx.key('KeyG');
  await ctx.waitFor(`window.peix.state().zoomed === null`, { what: 'both back' });

  // the new tab followed elsewhere too, then closed: its view lingers in the shell there, so the PR's next tab is
  // another name — from a blank tab, the PR's address typed
  await wentTo(`gh2:${prUrl}`, 'https://example.com/elsewhere');
  ctx.assert.equal(await ctx.evaluate(`window.peixKey('KeyW', 'cmd')`), true);

  await ctx.waitFor(`window.peix.state().tab === ${JSON.stringify(`gh:${prUrl}`)}`, {
    what: 'the old tab in front again',
  });

  await ctx.cmd('KeyT');
  await ctx.waitFor(`/^new:/.test(window.peix.state().tab)`, { what: 'a blank tab' });

  ctx.assert.ok(
    await ctx.evaluate(
      `[...document.querySelectorAll('#gbodyB .gblank .lpr')].some(e => e.textContent === ${JSON.stringify(`#${number}`)})`,
    ),
    'the PR offered under it: no tab is at it',
  );

  await ctx.fill('#ptabsB .paddr', prUrl);

  await ctx.evaluate(
    `document.querySelector('#ptabsB .paddr').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))`,
  );

  await ctx.waitFor(`window.peix.state().tab === ${JSON.stringify(`gh3:${prUrl}`)}`, {
    what: 'the PR on a tab of a name no view holds',
  });

  ctx.assert.deepEqual(await pages(), [`gh:${prUrl}`, `gh3:${prUrl}`]);
  ctx.assert.deepEqual(await ctx.evaluate('JSON.stringify(window.__errs)').then(JSON.parse), [], 'nothing threw');
  return out;
}
