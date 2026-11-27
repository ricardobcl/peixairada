// Space's keys and filters (2026-11-24). In ⌘F's box a word with a colon, an @ or a # is a filter: its start typed lists
// what it can be, each with its count; ⇥ or ⏎ takes one, a space after a whole one does too — a chip, ⌫ on an empty box
// takes the last off, esc clears all. The arrows go by the grid as it lies (↑↓ the nearest node a row away, Home End the
// ends). ⇧-click or ⇧-arrows choose several; a bar stars, mutes or ticks them all; esc lets them go.
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { tmpDir } from '../../lib/testserver.mjs';
import { agentFiles, makeFixture } from '../fixture.mjs';

const dir = tmpDir('peix-spk-');
const file = join(dir, 'prs.json');

const ago = min => new Date(Date.now() - min * 60_000).toISOString().replace(/\.\d+Z$/, 'Z');

const face = login => ({
  login,
  __typename: 'User',
  avatarUrl: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg"/>')}`,
});

writeFileSync(
  file,
  JSON.stringify({
    'acme/store#11': {
      state: 'OPEN',
      title: 'Retry declined payments',
      isDraft: false,
      isCrossRepository: false,
      author: face('me'),
      reviewRequests: { nodes: [] },
      reviews: { nodes: [] },
      comments: { nodes: [] },
      baseRefName: 'main',
      headRefName: 'retry',
      createdAt: ago(300),
      updatedAt: ago(5),
      reviewDecision: 'CHANGES_REQUESTED',
      reviewThreads: { nodes: [{ isResolved: false }] },
    },
  }),
);

export const meta = {
  server: true,
  fixture: 'auto',
  prefs: { space: true, spOff: [], cards: 'compact', spVisits: false },
  env: {
    GH_BIN: fileURLToPath(new URL('../fakes/fakegh.mjs', import.meta.url)),
    FAKEGH_PRS: file,
    FAKEGH_VIEWER: 'me',
  },
};

export default async function (ctx) {
  const sleep = spawn('sleep', ['300'], { stdio: 'ignore' });

  const out = {};
  const now = Date.now();
  const at = minutes => new Date(now - minutes * 60_000);

  const folder = name => {
    const path = join(dir, name);

    mkdirSync(path, { recursive: true });
    return path;
  };

  const {
    chats: [retry, queue, bump, grid, docs],
  } = makeFixture(ctx.fixture.dir, [
    {
      cwd: folder('storefront'),
      title: 'Retry declined card payments',
      prompt: 'see https://github.com/acme/store/pull/11',
      reply: 'Looked.',
      at: at(5),
    },
    {
      cwd: folder('billing-api'),
      title: 'Queue for invoice webhooks',
      prompt: 'move them',
      reply: 'Moving.',
      at: at(10),
      live: { pid: sleep.pid, startedAt: now - 3_600_000 },
    },
    { cwd: folder('mobile-app'), title: 'Bump the build number', prompt: 'bump it', reply: 'Bumped.', at: at(15) },
    { cwd: join(dir, 'storefront'), title: 'Product grid theme', prompt: 'fix it', reply: 'Fixed.', at: at(20) },
    { cwd: folder('docs'), title: 'Write the retry docs', prompt: 'docs', reply: 'Written.', at: at(25) },
  ]);

  agentFiles({
    dir: ctx.fixture.dir,
    lead: queue,
    agents: [
      {
        id: 'sec',
        kind: 'security',
        asked: 'Look for open ingress',
        ago: 8 * 60_000,
        steps: ['Grep'],
        report: 'None.',
        finished: true,
        tool: 'toolu_sec',
        quiet: 7 * 60_000,
      },
    ],
  });

  const ids = () => ctx.evaluate(`[...document.querySelectorAll('#spgrid .spt')].map(b => b.dataset.id)`);

  const key = async (key, code, vk, modifiers = 0) => {
    await ctx.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key, code, windowsVirtualKeyCode: vk, modifiers });
    await ctx.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk, modifiers });
  };

  const click = async (sel, modifiers = 0) => {
    const point = await ctx.evaluate(
      `(() => { const b = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })()`,
    );

    await ctx.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x, y: point.y, modifiers });

    await ctx.send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: point.x,
      y: point.y,
      button: 'left',
      clickCount: 1,
      modifiers,
    });

    await ctx.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: point.x,
      y: point.y,
      button: 'left',
      clickCount: 1,
      modifiers,
    });
  };

  const toks = () =>
    ctx.evaluate(`[...document.querySelectorAll('#sptoks .sptok')].map(t => t.firstChild.textContent)`);

  await ctx.waitFor(
    `document.querySelectorAll('#spgrid .spt').length === 7 && peix.session('${retry.id}')?.prs?.[0]?.review?.decision === 'changes' && (peix.session('${queue.id}')?.agentRows || []).length === 1`,
    { what: 'seven nodes, the PR’s review, the agent', timeout: 30000 },
  );

  // filters: a prefix lists what it can be; ⇥ takes one; a space after a whole one does too; ⌫ takes the last off
  await ctx.evaluate(`document.querySelector('#spq').focus()`);
  await ctx.send('Input.insertText', { text: 'is:' });
  await ctx.waitFor(`!document.querySelector('#spqd').hidden`, { what: 'its list' });

  out.list = await ctx.evaluate(
    `[...document.querySelectorAll('#spqd .dr')].map(r => r.dataset.tok + ' ' + r.querySelector('em').textContent)`,
  );

  ctx.assert.deepEqual(
    out.list,
    ['is:asking 0', 'is:working 0', 'is:watching 0', 'is:ready 7', 'is:idle 0', 'is:done 0', 'is:star 0'],
    'what is: can be, each with its count',
  );

  await ctx.send('Input.insertText', { text: 'rea' });
  await ctx.waitFor(`document.querySelectorAll('#spqd .dr').length === 1`, { what: 'narrowed to is:ready' });
  await key('Tab', 'Tab', 9);
  await ctx.waitFor(`document.querySelectorAll('#sptoks .sptok').length === 1`, { what: 'a chip' });

  ctx.assert.deepEqual(
    [await toks(), await ctx.evaluate(`document.querySelector('#spq').value`), (await ids()).length],
    [['is:ready'], '', 7],
  );

  await ctx.send('Input.insertText', { text: 'pr:changes ' });

  await ctx.waitFor(`document.querySelectorAll('#sptoks .sptok').length === 2`, {
    what: 'a space after a whole one: a chip',
  });

  ctx.assert.deepEqual(await ids(), [retry.id], 'is:ready pr:changes: the one');
  await ctx.settle();
  await ctx.shot('space-filters');
  await key('Backspace', 'Backspace', 8);

  await ctx.waitFor(
    `document.querySelectorAll('#sptoks .sptok').length === 1 && document.querySelectorAll('#spgrid .spt').length === 7`,
    { what: '⌫ on an empty box: the last chip off' },
  );

  await ctx.send('Input.insertText', { text: '@sec' });

  await ctx.waitFor(`document.querySelector('#spqd .dr')?.dataset.tok === '@security'`, {
    what: '@: the agents’ types',
  });

  await key('Enter', 'Enter', 13);
  await ctx.waitFor(`document.querySelectorAll('#sptoks .sptok').length === 2`, { what: '⏎ takes it' });
  ctx.assert.deepEqual(await ids(), [queue.id], '@security: the chat whose claude ran one');
  await ctx.send('Input.insertText', { text: 'webhooks' });

  await ctx.waitFor(
    `document.querySelectorAll('#spgrid .spt').length === 1 && document.querySelector('#spgrid .spbt b')`,
    { what: 'filters and words together' },
  );

  await key('Escape', 'Escape', 27);

  await ctx.waitFor(
    `!document.querySelector('#sptoks .sptok') && document.querySelector('#spq').value === '' && document.querySelectorAll('#spgrid .spt').length === 7`,
    { what: 'esc: all cleared' },
  );

  await ctx.evaluate(
    `document.querySelector('#spq').value = ''; document.querySelector('#spq').dispatchEvent(new Event('input'))`,
  );

  await ctx.send('Input.insertText', { text: '#mob ' });
  await ctx.waitFor(`document.querySelectorAll('#spgrid .spt').length === 1`, { what: '#: a project' });
  ctx.assert.deepEqual(await ids(), [bump.id]);
  await key('Escape', 'Escape', 27);
  await key('Escape', 'Escape', 27);
  await ctx.waitFor(`document.querySelectorAll('#spgrid .spt').length === 7`, { what: 'all back' });

  // the arrows by the grid: ↓ the nearest a row down, → the next, End and Home the ends
  await ctx.settle();

  const order = await ids();

  const geo = await ctx.evaluate(
    `[...document.querySelectorAll('#spgrid .spt')].map(b => { const r = b.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top)]; })`,
  );

  const perRow = geo.filter(position => position[1] === geo[0][1]).length;

  ctx.assert.ok(perRow >= 2 && perRow < 7, `more than one row: ${perRow} a row`);
  await ctx.evaluate(`document.querySelector('#spgrid .spt').focus()`);
  await key('ArrowDown', 'ArrowDown', 40);
  ctx.assert.equal(await ctx.evaluate(`document.activeElement.dataset.id`), order[perRow], '↓: the one under it');
  await key('ArrowUp', 'ArrowUp', 38);
  ctx.assert.equal(await ctx.evaluate(`document.activeElement.dataset.id`), order[0], '↑: back up');
  await key('ArrowRight', 'ArrowRight', 39);
  ctx.assert.equal(await ctx.evaluate(`document.activeElement.dataset.id`), order[1], '→: the next');
  await key('End', 'End', 35);
  ctx.assert.equal(await ctx.evaluate(`document.activeElement.dataset.id`), order.at(-1), 'End: the last');
  await key('Home', 'Home', 36);
  ctx.assert.equal(await ctx.evaluate(`document.activeElement.dataset.id`), order[0], 'Home: the first');

  // several at once: ⇧→ chooses two, esc lets go; ⇧-clicks choose, the bar stars them, then ticks them
  await key('ArrowRight', 'ArrowRight', 39, 8);

  await ctx.waitFor(
    `document.querySelectorAll('#spgrid .spt.chosen').length === 2 && !document.querySelector('#spbar').hidden`,
    { what: '⇧→: two chosen' },
  );

  ctx.assert.match(await ctx.evaluate(`document.querySelector('#spbar').textContent`), /^2 chosen/);
  await key('Escape', 'Escape', 27);

  await ctx.waitFor(`!document.querySelector('#spgrid .spt.chosen') && document.querySelector('#spbar').hidden`, {
    what: 'esc: let go',
  });

  await click(`#spgrid .spt[data-id="${grid.id}"] .spbox`, 8);
  await click(`#spgrid .spt[data-id="${docs.id}"] .spbox`, 8);
  await ctx.waitFor(`document.querySelectorAll('#spgrid .spt.chosen').length === 2`, { what: '⇧-clicks: two chosen' });
  ctx.assert.equal(await ctx.evaluate(`peix.state().current`), null, 'a ⇧-click opens nothing');
  await ctx.settle();
  await ctx.shot('space-chosen');
  await ctx.evaluate(`document.querySelector('#spbar [data-do="star"]').click()`);

  await ctx.waitFor(
    `peix.session('${grid.id}')?.fav && peix.session('${docs.id}')?.fav && document.querySelector('#spbar').hidden`,
    { what: 'both starred, the bar gone' },
  );

  await click(`#spgrid .spt[data-id="${grid.id}"] .spbox`, 8);
  await click(`#spgrid .spt[data-id="${docs.id}"] .spbox`, 8);
  await ctx.evaluate(`document.querySelector('#spbar [data-do="done"]').click()`);
  await ctx.waitFor(`peix.session('${grid.id}')?.done && peix.session('${docs.id}')?.done`, { what: 'both ticked' });
  sleep.kill();
  return out;
}
