// Space's find, ✓ and open PRs (2026-11-23). ⌘F with the keys in Space is its box on top: the list's fuzzy match over
// a chat's title, folder, agents and PRs; while typed only the matches show, best first, from every state, the letters
// marked, the chips counting them; ↑↓ ring one, ⏎ opens it, esc clears and then leaves. A node's ✓ (its top right,
// under the pointer; D on it) ticks the chat as the card's does — it leaves while Done is off, the chat stays open —, a
// done one's ↩ brings it back. Any tick of the open chat leaves it open: Space has no list to move on along. A pill on the node's edge counts its PRs open or in draft, amber at your move, a red dot
// for a failing CI; pointed at, their list, a row its PR on a tab beside the chat.
import { join } from 'node:path';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { tmpDir } from '../../lib/testserver.mjs';
import { makeFixture } from '../fixture.mjs';

const dir = tmpDir('peix-spf-');
const file = join(dir, 'prs.json');

const ago = min => new Date(Date.now() - min * 60_000).toISOString().replace(/\.\d+Z$/, 'Z');

const face = login => ({
  login,
  __typename: 'User',
  avatarUrl: `data:image/svg+xml,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" fill="#2e9e6a"/></svg>',
  )}`,
});

const ci = state => ({ commits: { nodes: [{ commit: { statusCheckRollup: { state } } }] } });

const pr = o => ({
  isDraft: false,
  isCrossRepository: false,
  author: face('me'),
  reviewRequests: { nodes: [] },
  reviews: { nodes: [] },
  comments: { nodes: [] },
  baseRefName: 'main',
  createdAt: ago(300),
  ...o,
});

writeFileSync(
  file,
  JSON.stringify({
    'acme/store#11': pr({
      state: 'OPEN',
      title: 'Retry declined payments with backoff',
      headRefName: 'retry',
      updatedAt: ago(5),
      ...ci('FAILURE'),
      comments: { nodes: [{ author: face('joel'), createdAt: ago(5) }] },
      reviewDecision: 'CHANGES_REQUESTED',
      reviewThreads: { nodes: [{ isResolved: false }, { isResolved: false }, { isResolved: true }] },
    }),
    'acme/store#13': pr({
      state: 'OPEN',
      title: 'Decline codes in the receipt',
      headRefName: 'receipt',
      updatedAt: ago(40),
      reviewDecision: 'REVIEW_REQUIRED',
      reviewRequests: { nodes: [{ requestedReviewer: { login: 'ana' } }] },
    }),
    'acme/store#12': pr({
      state: 'OPEN',
      isDraft: true,
      title: 'Payment retry metrics: count every retry by decline code and card network, and alert on a spike',
      headRefName: 'retry-metrics',
      updatedAt: ago(30),
    }),
    'acme/store#5': pr({ state: 'MERGED', title: 'The payments client', headRefName: 'client', updatedAt: ago(200) }),
    'acme/billing#21': pr({
      state: 'MERGED',
      title: 'Webhooks through a queue',
      headRefName: 'queue',
      updatedAt: ago(100),
    }),
  }),
);

export const meta = {
  server: true,
  fixture: 'auto',
  prefs: { space: true, cards: 'compact' },
  env: {
    GH_BIN: fileURLToPath(new URL('../fakes/fakegh.mjs', import.meta.url)),
    FAKEGH_PRS: file,
    FAKEGH_VIEWER: 'me',
  },
};
const pull = (repo, n) => `https://github.com/acme/${repo}/pull/${n}`;

export default async function (ctx) {
  const out = {};
  const now = Date.now();

  const {
    chats: [retry, queue, bump],
  } = makeFixture(ctx.fixture.dir, [
    {
      cwd: join(dir, 'storefront'),
      title: 'Retry declined card payments',
      prompt: `the retries: ${pull('store', 11)} ${pull('store', 12)} ${pull('store', 13)}, after ${pull('store', 5)}`,
      reply: 'Looked at all three.',
      at: new Date(now - 10 * 60_000),
    },
    {
      cwd: join(dir, 'billing-api'),
      title: 'Queue for invoice webhooks',
      prompt: `see ${pull('billing', 21)}`,
      reply: 'Merged already.',
      at: new Date(now - 20 * 60_000),
    },
    {
      cwd: join(dir, 'mobile-app'),
      title: 'Bump the build number',
      prompt: 'bump it',
      reply: 'Bumped on both apps.',
      at: new Date(now - 30 * 60_000),
    },
  ]);

  const node = id => `document.querySelector('#spgrid .spt[data-id="${id}"]')`;

  const at = sel =>
    ctx.evaluate(
      `(() => { const b = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })()`,
    );

  const hover = async sel => {
    const r = await at(sel);

    await ctx.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r.x, y: r.y });
    return r;
  };

  const press = async sel => {
    // the mouse at its middle, pressed and let go: hit-testing as a hand's click has it
    const r = await hover(sel);

    await ctx.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.x, y: r.y, button: 'left', clickCount: 1 });

    await ctx.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: r.x,
      y: r.y,
      button: 'left',
      clickCount: 1,
    });
  };

  const key = async (key, code, vk, modifiers = 0) => {
    await ctx.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key, code, windowsVirtualKeyCode: vk, modifiers });
    await ctx.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk, modifiers });
  };

  await ctx.waitFor(
    `document.querySelector('#main').classList.contains('space') && ${node(retry.id)} && ${node(queue.id)} && ${node(bump.id)}`,
    { what: 'Space on, the three chats' },
  );

  await ctx.waitFor(
    `(peix.session('${retry.id}')?.prs || []).filter(p => p.state).length === 4 && peix.session('${queue.id}')?.prs?.[0]?.state === 'merged'`,
    { timeout: 30_000, what: 'the PR states from the fake gh' },
  );

  await ctx.evaluate(`window.open = url => { (window.__opened ||= []).push(url); return null; }`);
  await ctx.settle();

  // the PRs: open and draft counted, at your move amber, a failing CI's dot; merged and closed none — no pill at all
  out.pills = await ctx.evaluate(
    `[${node(retry.id)}, ${node(queue.id)}, ${node(bump.id)}].map(n => (p => p && { n: p.querySelector('.sppn').firstChild.nextSibling.textContent, you: p.classList.contains('you'), dot: !!p.querySelector('.sppn i') })(n.querySelector('.sppr')))`,
  );

  ctx.assert.deepEqual(
    out.pills,
    [{ n: '3', you: true, dot: true }, null, null],
    'three open, one at your move and failing; a merged one alone, no pill',
  );

  ctx.assert.equal(
    await ctx.evaluate(`getComputedStyle(${node(retry.id)}.querySelector('.sppop')).display`),
    'none',
    'the list folded at rest',
  );

  await hover(`#spgrid .spt[data-id="${retry.id}"] .sppn`);

  await ctx.waitFor(`getComputedStyle(${node(retry.id)}.querySelector('.sppop')).display === 'block'`, {
    what: 'pointed at: the list',
  });

  out.list =
    await ctx.evaluate(`({ head: ${node(retry.id)}.querySelector('.spph').textContent, rows: [...${node(retry.id)}.querySelectorAll('.spprr')].map(r => [r.dataset.state, r.querySelector('.no').textContent, r.querySelector('.tg').textContent]),
    over: (r => document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest('.spprr') === ${node(retry.id)}.querySelectorAll('.spprr')[1])(${node(retry.id)}.querySelectorAll('.spprr')[1].getBoundingClientRect()) })`);

  ctx.assert.deepEqual(
    out.list,
    {
      head: '3 open PRs · 1 merged or closed',
      rows: [
        ['open', 'store#11', 'changes requested2 unresolvedyour move✕'],
        ['open', 'store#13', 'awaiting review'],
        ['draft', 'store#12', ''],
      ],
      over: true,
    },
    'its open PRs, where each review stands, the merged one only counted; the list over whatever is below it',
  );

  await ctx.shot('space-prs');
  await press(`#spgrid .spt[data-id="${retry.id}"] .spprr[data-state="draft"]`);

  await ctx.waitFor(
    `peix.state().current === '${retry.id}' && (window.__opened || []).includes('${pull('store', 12)}')`,
    { what: 'a row: its chat open, its PR opened' },
  );

  await ctx.evaluate(`document.querySelector('#spq').blur(); document.activeElement?.blur?.()`);

  // ⌘F: the box; matches only, ringed, the letters marked, the chips counting them
  await hover('#space .sphd h1');
  await key('f', 'KeyF', 70, 4);
  ctx.assert.equal(await ctx.evaluate(`document.activeElement?.id`), 'spq', '⌘F with the keys in Space: its box');
  await ctx.send('Input.insertText', { text: 'webhook' });
  await ctx.waitFor(`document.querySelectorAll('#spgrid .spt').length === 1`, { what: 'the one match' });

  out.find =
    await ctx.evaluate(`({ ids: [...document.querySelectorAll('#spgrid .spt')].map(b => b.dataset.id), hit: document.querySelector('#spgrid .spt.hit')?.dataset.id, mark: document.querySelector('#spgrid .spbt b')?.textContent.toLowerCase(),
    count: document.querySelector('#spqn').textContent, chips: [...document.querySelectorAll('#spfs .spf')].map(f => f.dataset.k + ':' + f.disabled + ':' + f.querySelector('b').textContent).join(' ') })`);

  ctx.assert.deepEqual(
    out.find,
    {
      ids: [queue.id],
      hit: queue.id,
      mark: 'webhook',
      count: '1 of 1',
      chips: 'ask:true:0 work:true:0 watch:true:0 ready:true:1 idle:true:0 done:true:0',
    },
    'the match alone, ringed, marked; the chips its count',
  );

  await ctx.shot('space-find');
  await ctx.evaluate(`(b => { b.value = ''; b.dispatchEvent(new Event('input')); })(document.querySelector('#spq'))`);
  await ctx.send('Input.insertText', { text: 'store' }); // its PRs' repo: chatIds

  await ctx.waitFor(`document.querySelector('#spgrid .spt')?.dataset.id === '${retry.id}'`, {
    what: 'found by its PRs',
  });

  await ctx.send('Input.insertText', { text: 'qqq' });

  await ctx.waitFor(`!document.querySelector('#spgrid .spt') && !document.querySelector('#spempty').hidden`, {
    what: 'none: said so',
  });

  ctx.assert.match(await ctx.evaluate(`document.querySelector('#spempty').textContent`), /No chat matches “storeqqq”/);
  await key('Escape', 'Escape', 27);

  await ctx.waitFor(
    `document.querySelector('#spq').value === '' && document.querySelectorAll('#spgrid .spt').length >= 3`,
    { what: 'esc: cleared, every node back' },
  );

  ctx.assert.equal(await ctx.evaluate(`document.activeElement?.id`), 'spq', 'the first esc keeps the box');
  await key('Escape', 'Escape', 27);
  ctx.assert.notEqual(await ctx.evaluate(`document.activeElement?.id`), 'spq', 'the second leaves it');

  // ✓: done, gone while Done is off, the open chat left open; found again, ↩ brings it back; D on a node
  ctx.assert.equal(
    await ctx.evaluate(`getComputedStyle(${node(bump.id)}.querySelector('.spdone')).visibility`),
    'hidden',
    'the ✓ only under the pointer',
  );

  await press(`#spgrid .spt[data-id="${bump.id}"] .spdone`);
  await ctx.waitFor(`peix.session('${bump.id}')?.done === true && !${node(bump.id)}`, { what: 'ticked: gone' });
  ctx.assert.equal(await ctx.evaluate(`peix.state().current`), retry.id, 'the chat open stays open');

  await ctx.evaluate(
    `(b => { b.focus(); b.value = 'bump'; b.dispatchEvent(new Event('input')); })(document.querySelector('#spq'))`,
  );

  await ctx.waitFor(`${node(bump.id)}?.querySelector('.spbox').dataset.st === 'done'`, { what: 'found though done' });

  ctx.assert.deepEqual(
    await ctx.evaluate(
      `[getComputedStyle(${node(bump.id)}.querySelector('.spdone')).visibility, ${node(bump.id)}.querySelector('.spdone').title]`,
    ),
    ['visible', 'Back to its lane (D)'],
    'its ↩ shown',
  );

  await press(`#spgrid .spt[data-id="${bump.id}"] .spdone`);

  await ctx.waitFor(
    `peix.session('${bump.id}')?.done === false && ${node(bump.id)}?.querySelector('.spbox').dataset.st !== 'done'`,
    { what: '↩: back' },
  );

  await ctx.evaluate(
    `(b => { b.value = ''; b.dispatchEvent(new Event('input')); b.blur(); })(document.querySelector('#spq'))`,
  );

  await ctx.evaluate(`${node(queue.id)}.focus()`);
  await key('d', 'KeyD', 68);
  await ctx.waitFor(`peix.session('${queue.id}')?.done === true && !${node(queue.id)}`, { what: 'D: done' });

  await ctx.server.api(`api/sessions/${queue.id}/done`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ done: false }),
  });

  // any tick of the open chat leaves it open in Space — a notification's Done as the node's ✓: the list it would move on
  // along is hidden (2026-11-24, review)
  ctx.assert.equal(await ctx.evaluate(`peix.state().current`), retry.id);
  await ctx.evaluate(`window.peixDone('${retry.id}')`);
  await ctx.waitFor(`peix.session('${retry.id}')?.done === true`, { what: 'Done from a notification' });
  await ctx.sleep(300);
  ctx.assert.equal(await ctx.evaluate(`peix.state().current`), retry.id, 'no list to move on to: the chat stays open');

  await ctx.server.api(`api/sessions/${retry.id}/done`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ done: false }),
  });

  return out;
}
