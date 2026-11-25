// Space (⌥⌘X, 2026-11-18): the board's other layout. Off at first; the status bar's Space or ⌥⌘X puts it on: Space on the
// left, the chat on the right (v3), the header's × or ⌘W closing it; the nodes zoom (−, +, Fit, ⌘+ in Space). Each chat of the project in view a node — its name, its folder, its edge its state — with a pod per
// agent type docked to it, each agent its type's letters in its type's colour (the definition's), its state a badge or a
// turning arc; the states on top filter it (Idle and Done off at first). No chat open, Space takes the column; a click on
// a node opens the chat below it, whose agents become lanes on one clock; a lane opens its agent's tab. Every key is the
// board's: ⌥⌘N's picker comes up over Space. The divider's place and Space itself outlive a reload. ⌥⌘X again leaves it.
// Pods named by type, capitalised; an agent pointed at shows its card, its name only there (v4); a dark theme's sky, a
// falling star by transform and opacity; none in light. Shots dark and light.
import { spawn } from 'node:child_process';
import { appendFileSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { agentFiles, agentNoteLine, makeFixture } from '../fixture.mjs';
import { tmpDir } from '../../lib/testserver.mjs';
import { ANIM_RULES } from '../../lib/animcheck.mjs';

export const meta = { server: true, fixture: 'auto', prefs: { cards: 'compact', lanesShut: [] } };
const MIN = 60_000;

export default async function (ctx) {
  const out = {},
    now = Date.now(),
    root = realpathSync(tmpDir('peix-sp-')),
    sleeps = [0, 1, 2, 3, 4].map(() => spawn('sleep', ['300'], { stdio: 'ignore' }));
  const live = (i, more = {}) => ({ pid: sleeps[i].pid, startedAt: now - 90 * MIN, ...more });
  const dir = name => {
    const d = join(root, name);
    mkdirSync(d, { recursive: true });
    return d;
  };
  const projects = {
    'billing-api': { color: '#3d9a6a' },
    infra: { color: '#8b6cf0' },
    storefront: { color: '#4a86e8' },
    'mobile-app': { color: '#e0883a' },
  };
  await ctx.server.api('api/config', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ projects }),
  });
  // two agent types defined with a colour, as Claude Code reads them: the user's agents folder
  mkdirSync(join(ctx.fixture.dir, 'agents'), { recursive: true });
  writeFileSync(
    join(ctx.fixture.dir, 'agents', 'security.md'),
    '---\nname: security\ndescription: Reviews for security\ncolor: red\n---\nLook for what is too wide.\n',
  );
  writeFileSync(
    join(ctx.fixture.dir, 'agents', 'cost.md'),
    '---\nname: cost\ndescription: Prices things\ncolor: green\n---\nPrice it.\n',
  );
  const nodes = () =>
    ctx.evaluate(`[...document.querySelectorAll('#spgrid .spt')].map(b => ({ title: b.querySelector('.spbt').textContent, folder: b.querySelector('.spbf')?.textContent || '', st: b.querySelector('.spbox').dataset.st, on: b.classList.contains('on'),
    pods: [...b.querySelectorAll('.sppod')].map(p => ({ label: p.nextElementSibling.textContent, h: p.style.getPropertyValue('--h'), marks: [...p.querySelectorAll('.spa')].map(a => a.textContent + ':' + a.dataset.st).join(' ') })) }))`);
  try {
    const { chats } = makeFixture(ctx.fixture.dir, [
      {
        cwd: dir('infra'),
        title: 'Review the staging VPC plan from every angle before we apply it',
        prompt: 'review the plan',
        reply: 'Sending reviewers out.',
        at: new Date(now - 12 * MIN),
        live: live(0, { agent: 'orchestrator' }),
      },
      {
        cwd: dir('billing-api'),
        title: 'Queue for invoice webhooks',
        prompt: 'move the webhooks to a queue',
        reply: 'Which queue should they go on?',
        at: new Date(now - 25 * MIN),
        live: live(1, { status: 'waiting', waitingFor: 'permission prompt' }),
      },
      {
        cwd: dir('storefront'),
        title: 'Retry declined card payments with backoff',
        prompt: 'retry them',
        reply: 'On it.',
        at: new Date(now - 20 * MIN),
        live: live(2),
      },
      {
        cwd: join(root, 'storefront'),
        title: 'Product grid follows the dark theme',
        prompt: 'fix the grid',
        reply: 'Done, 14 tests pass.',
        at: new Date(now - 40 * MIN),
        live: live(3),
      },
      {
        cwd: dir('mobile-app'),
        title: 'Bump the build number',
        prompt: 'bump it',
        reply: 'Bumped on both apps.',
        at: new Date(now - 30 * MIN),
        live: live(4),
      },
    ]);
    const [infra, billing, store] = chats;
    agentFiles({
      dir: ctx.fixture.dir,
      lead: infra,
      agents: [
        {
          id: 'spec',
          kind: 'specifier',
          asked: 'Specify the VPC review',
          ago: 30 * MIN,
          steps: ['Read the plan'],
          report: 'Spec ready.',
          finished: true,
          tool: 'toolu_spec',
          quiet: 25 * MIN,
        }, // a round before: still a pod (v9)
        {
          id: 'sec1',
          kind: 'security',
          asked: 'Look for open ingress',
          ago: 11 * MIN,
          steps: ['Grep 0.0.0.0/0 in modules/'],
        },
        { id: 'sec2', kind: 'security', asked: 'Look for wide IAM policies', ago: 11 * MIN, steps: ['Read iam.tf'] },
        { id: 'cost', kind: 'cost', asked: 'Price the NAT gateways', ago: 10 * MIN, steps: ['Read plan/staging.json'] },
        {
          id: 'map',
          kind: 'Explore',
          asked: 'Find every module that uses the VPC',
          ago: 9 * MIN,
          steps: ['List modules/'],
          quiet: 4 * MIN,
        },
      ],
    });
    agentFiles({
      dir: ctx.fixture.dir,
      lead: billing,
      agents: [
        {
          id: 'find',
          asked: 'Find every webhook handler',
          ago: 24 * MIN,
          steps: ['List src/webhooks/'],
          report: 'Seven handlers.',
          finished: true,
          tool: 'toolu_find',
          quiet: 19 * MIN,
        },
        {
          id: 'load',
          asked: 'Load-test the queue prototype',
          ago: 21 * MIN,
          steps: ['k6 run scripts/queue.js'],
          finished: true,
          tool: 'toolu_load',
          quiet: 12 * MIN,
        },
      ],
    });
    appendFileSync(
      billing.file,
      JSON.stringify(
        agentNoteLine({
          id: billing.id,
          cwd: billing.cwd,
          tool: 'toolu_load',
          asked: 'Load-test the queue prototype',
          status: 'failed',
          said: 'failed: Agent terminated early due to an API error',
          at: new Date(now - 12 * MIN).toISOString(),
        }),
      ) + '\n',
    );
    agentFiles({
      dir: ctx.fixture.dir,
      lead: store,
      agents: [
        { id: 'api', asked: 'Backoff in the payments client', ago: 18 * MIN, steps: ['Edit src/payments/retry.ts'] },
      ],
    });
    await ctx.waitFor(
      `(peix.session('${infra.id}')?.agentAll || []).length === 5 && (peix.session('${billing.id}')?.agentRows || []).some(r => r.st === 'fail') && (peix.session('${store.id}')?.agentRows || []).length === 1`,
      { what: 'every chat’s agents', timeout: 20000 },
    );
    ctx.assert.equal(
      await ctx.evaluate(`peix.session('${infra.id}').agentRows.find(r => r.id === 'sec1').color`),
      'red',
      'a row carries its type’s colour, from its definition',
    );
    ctx.assert.equal(
      await ctx.evaluate(`!!document.querySelector('#main.space') || !document.querySelector('#space').hidden`),
      false,
      'off at first',
    );

    // on, by the status bar's button: no chat open, Space takes the column
    await ctx.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
    await ctx.evaluate(`document.querySelector('#sbSpace').click()`);
    await ctx.waitFor(
      `document.querySelector('#main').classList.contains('space') && document.querySelectorAll('#spgrid .spt').length === 7`,
      { what: 'Space on, a node a chat (the five, and the auto fixture\u2019s two)' },
    );
    ctx.assert.equal(
      await ctx.evaluate(
        `document.querySelector('#main').classList.contains('spfull') && getComputedStyle(document.querySelector('#chat')).display`,
      ),
      'none',
      'no chat open: Space takes the column',
    );
    ctx.assert.equal(
      await ctx.evaluate(`document.querySelector('#sbSpace').getAttribute('aria-pressed')`),
      'true',
      'its button lit',
    );
    ctx.assert.deepEqual(
      await ctx.evaluate(
        `[getComputedStyle(document.querySelector('#sessions')).display, document.querySelector('#sbList').getAttribute('aria-pressed')]`,
      ),
      ['none', 'false'],
      'Space or the list, never both: the list gone, its button off',
    );
    out.nodes = await nodes();
    const by = t => out.nodes.find(n => n.title.startsWith(t));
    ctx.assert.equal(
      by('Review the staging').title,
      'Review the staging VPC plan from every angle before we apply…',
      'a name past 60 characters cut',
    );
    ctx.assert.match(by('Review the staging').folder, /infra$/, 'its folder under its name');
    ctx.assert.equal(by('Queue for invoice').st, 'ask', 'asking: its edge red');
    ctx.assert.deepEqual(
      by('Review the staging').pods.map(p => [p.label, p.h, p.marks]),
      [
        ['Security', '25', 'SE:run SE:run'],
        ['Specifier', by('Review the staging').pods[1].h, 'SP:done'],
        ['Cost', '150', 'CO:run'],
        ['Explore', by('Review the staging').pods[3].h, 'EX:quiet'],
      ],
      'a pod per type round the node, the most first — a round before the last one\u2019s too —, named by its type capitalised; its letters, its colour (the definition’s hue), its state',
    );
    ctx.assert.deepEqual(
      by('Queue for invoice').pods.map(p => p.marks),
      ['GP:fail'],
      'two of one type: one pod, folded to its newest when none works',
    );
    const pill = `document.querySelector('#spgrid .spt[data-id="${billing.id}"] .spx')`;
    ctx.assert.deepEqual(
      await ctx.evaluate(`[${pill}.textContent, ${pill}.getAttribute('aria-expanded')]`),
      ['+1', 'false'],
      'the rest behind +N, counted',
    );
    ctx.assert.equal(
      await ctx.evaluate(`document.querySelectorAll('#spgrid .spt[data-id="${infra.id}"] .spx').length`),
      0,
      'a pod with nothing behind it has no button',
    );
    await ctx.evaluate(`window.peixSpOpenMs = 1500; ${pill}.click()`);
    await ctx.waitFor(
      `${pill}.getAttribute('aria-expanded') === 'true' && document.querySelectorAll('#spgrid .spt[data-id="${billing.id}"] .spa').length === 2`,
      { what: 'opened: the done ones too' },
    );
    await ctx.settle();
    await ctx.shot('space-pod-open');
    await ctx.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 1, y: 1 });
    await ctx.waitFor(`${pill}.getAttribute('aria-expanded') === 'false'`, {
      what: 'folded again on its own',
      timeout: 6000,
    });
    await ctx.evaluate(`${pill}.click()`);
    await ctx.waitFor(`${pill}.getAttribute('aria-expanded') === 'true'`, { what: 'open again' });
    await ctx.evaluate(`${pill}.click(); delete window.peixSpOpenMs`);
    await ctx.waitFor(`${pill}.getAttribute('aria-expanded') === 'false'`, { what: 'its − folds it' });
    await ctx.settle();
    await ctx.shot('space-dark');
    ctx.assert.deepEqual(await ctx.evaluate(ANIM_RULES), [], 'its arcs and pings keep the compositor\u2019s rules');

    // the sky behind the nodes, dark: four layers of stars, three twinkling by their opacity; a falling star, gone once fallen
    out.sky =
      await ctx.evaluate(`(() => { const k = document.querySelector('#spsky'); return { shown: getComputedStyle(k).display !== 'none', layers: k.querySelectorAll(':scope > b').length, stars: k.querySelectorAll('b > i').length,
      twinkle: document.getAnimations().filter(a => a.animationName === 'sptw').length, field: getComputedStyle(document.querySelector('#spfield')).backgroundColor }; })()`);
    ctx.assert.deepEqual(
      out.sky,
      { shown: true, layers: 5, stars: 109, twinkle: 4, field: 'rgba(0, 0, 0, 0)' },
      `a night sky behind the field: ${JSON.stringify(out.sky)}`,
    );
    ctx.assert.equal(await ctx.evaluate(`peix.spFall()`), 1, 'a falling star');
    ctx.assert.deepEqual(
      await ctx.evaluate(
        `document.getAnimations().filter(a => a.id === 'spfall').map(a => a.effect.getKeyframes().map(k => Object.keys(k).filter(p => !['offset', 'easing', 'composite', 'computedOffset'].includes(p)).sort().join()).join(' '))`,
      ),
      ['opacity,transform opacity opacity,transform'],
      'it moves by transform and opacity alone',
    );
    await ctx.waitFor(`!document.querySelector('#spsky .spfall')`, { what: 'fallen and gone', timeout: 3000 });
    // bigger stars, glowing (2026-11-19); a planet or a comet passing: moved by transform and opacity alone, one at a time
    ctx.assert.equal(
      await ctx.evaluate(
        `[...document.querySelectorAll('#spsky .big > i')].every(i => parseFloat(i.style.width) >= 3 && getComputedStyle(i).boxShadow !== 'none')`,
      ),
      true,
      'the bigger stars, each with its glow',
    );
    out.visit = await ctx.evaluate(`peix.spVisit()`);
    ctx.assert.match(out.visit, /^spvis (spcomet|spplanet( ringed)?)$/, 'a visitor in the sky');
    ctx.assert.deepEqual(
      await ctx.evaluate(
        `document.getAnimations().filter(a => a.id === 'spvisit').map(a => [...new Set(a.effect.getKeyframes().flatMap(k => Object.keys(k).filter(p => !['offset', 'easing', 'composite', 'computedOffset'].includes(p))))].sort().join())`,
      ),
      ['opacity,transform'],
      'one visitor, by transform and opacity',
    );
    ctx.assert.equal(
      await ctx.evaluate(`(peix.spVisit(), document.querySelectorAll('#spsky .spvis').length)`),
      1,
      'never two at once',
    );
    await ctx.sleep(1500);
    await ctx.shot('space-visitor');
    for (let i = 0; i < 8; i++) {
      await ctx.evaluate(
        `(document.querySelectorAll('#spsky .spvis').forEach(v => v.getAnimations().forEach(a => a.finish())), 0)`,
      );
      await ctx.sleep(30);
      if ((await ctx.evaluate(`peix.spVisit()`)).includes(out.visit.includes('comet') ? 'spplanet' : 'spcomet')) break;
    }
    await ctx.evaluate(
      `document.getAnimations().filter(a => a.id === 'spvisit').forEach(a => { a.pause(); a.currentTime = a.effect.getTiming().duration * .45; })`,
    );
    await ctx.shot('space-visitor-2');
    await ctx.evaluate(
      `document.querySelectorAll('#spsky .spvis').forEach(v => v.getAnimations().forEach(a => a.finish()))`,
    );
    await ctx.waitFor(`!document.querySelector('#spsky .spvis')`, { what: 'the visitor gone once by', timeout: 3000 });

    // an agent pointed at: its card — type, state, what it was asked, what it does now; then its model and effort
    const mark = await ctx.evaluate(
      `(() => { const r = document.querySelector('#spgrid .spt[data-id="${infra.id}"] .spa[data-ag="sec1"]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`,
    );
    await ctx.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: mark.x, y: mark.y });
    await ctx.waitFor(`document.querySelector('#mxtip.on .spch')`, { what: 'the agent\u2019s card' });
    await ctx.waitFor(`/tool call/.test(document.querySelector('#mxtip .spcv').textContent)`, {
      what: 'its effort read',
    });
    await ctx.settle();
    out.card =
      await ctx.evaluate(`(() => { const t = document.querySelector('#mxtip'), m = document.querySelector('#spgrid .spa[data-ag="sec1"]').getBoundingClientRect(), r = t.getBoundingClientRect(); return {
      head: t.querySelector('.spch').textContent, asked: t.querySelector('.mtt').textContent, now: t.querySelector('.spcw').textContent, kv: [...t.querySelectorAll('.spcv dt')].map(d => d.textContent).join(' '), clear: r.bottom <= m.top + 1 || r.top >= m.bottom - 1 }; })()`);
    ctx.assert.match(out.card.head, /^SESecurityat work \d+m$/, `its type, its state and time: ${out.card.head}`);
    ctx.assert.equal(out.card.asked, 'Look for open ingress', 'what it was asked');
    ctx.assert.match(out.card.now, /^Now.*0\.0\.0\.0\/0/, `what it does now: ${out.card.now}`);
    ctx.assert.equal(out.card.kv, 'Model So far', 'its model and effort, read when pointed at');
    ctx.assert.ok(out.card.clear, 'beside its mark, over it or under it as the room goes: never on it');
    await ctx.shot('space-card-dark');
    await ctx.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 5 });
    await ctx.waitFor(`!document.querySelector('#mxtip.on')`, { what: 'the card gone with the pointer' });

    // Settings › Space: its pane; the sky off, then on without its twinkle; no falling star when Never; no card; only agents at work; no pod names
    ctx.assert.equal(await ctx.evaluate(`peixKey('Comma', 'cmd')`), true, '⌘, the settings');
    await ctx.evaluate(`document.querySelector('#settings .stabs [data-tab="space"]').click()`);
    out.pane = await ctx.evaluate(`[...document.querySelectorAll('#spSpace .srow.set .sl b')].map(b => b.textContent)`);
    ctx.assert.deepEqual(
      out.pane,
      [
        'Night sky',
        'Twinkling',
        'Falling stars',
        'Planets and comets',
        'Fade the quiet ones',
        'Constellations',
        'Answer from the node',
        'Agent card',
        'Only agents at work',
        'Pod names',
        'Lanes’ span'.replace('’', "'"),
      ],
      'its rows',
    );
    await ctx.settle();
    await ctx.shot('space-settings-dark');
    await ctx.evaluate(`document.querySelector('#settingsClose').click()`);
    const set = (id, v) =>
      ctx.evaluate(
        `(() => { const el = document.querySelector('#${id}'); if (el.type === 'checkbox') el.checked = ${JSON.stringify(v)}; else el.value = ${JSON.stringify(v)}; el.dispatchEvent(new Event('change', { bubbles: true })); })()`,
      );
    await set('skyOn', false);
    ctx.assert.deepEqual(
      await ctx.evaluate(
        `[getComputedStyle(document.querySelector('#spsky')).display, getComputedStyle(document.querySelector('#spfield')).backgroundColor !== 'rgba(0, 0, 0, 0)', document.querySelector('#twinkleRow').classList.contains('off'), document.querySelector('#fallPick').disabled, peix.spFall()]`,
      ),
      ['none', true, true, true, 0],
      'no sky: the field its own ground again, the sky’s rows off with their reason, no star falls',
    );
    await set('skyOn', true);
    await set('twinkleOn', false);
    ctx.assert.deepEqual(
      await ctx.evaluate(
        `[getComputedStyle(document.querySelector('#spsky')).display, document.getAnimations().filter(a => a.animationName === 'sptw').length]`,
      ),
      ['block', 0],
      'the sky back, its stars still',
    );
    await set('twinkleOn', true);
    await set('fallPick', 'off');
    ctx.assert.equal(await ctx.evaluate(`peix.spFall()`), 0, 'falling stars: never');
    await set('fallPick', 'some');
    await set('visitOn', false);
    ctx.assert.equal(await ctx.evaluate(`peix.spVisit()`), '', 'planets and comets: off');
    await set('visitOn', true);
    await set('agCardOn', false);
    const sec = await ctx.evaluate(
      `(() => { const r = document.querySelector('#spgrid .spt[data-id="${infra.id}"] .spa[data-ag="sec1"]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`,
    );
    await ctx.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: sec.x, y: sec.y });
    await ctx.sleep(400);
    ctx.assert.equal(await ctx.evaluate(`!!document.querySelector('#mxtip.on')`), false, 'no card when it is off');
    await ctx.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 5 });
    await set('agCardOn', true);
    await set('busyOnly', true);
    await ctx.waitFor(
      `document.querySelectorAll('#spgrid .spt[data-id="${billing.id}"] .sppod').length === 0 && document.querySelectorAll('#spgrid .spt[data-id="${infra.id}"] .spa').length === 4`,
      { what: 'pods of agents at work alone' },
    );
    await set('busyOnly', false);
    await ctx.waitFor(`document.querySelectorAll('#spgrid .spt[data-id="${billing.id}"] .spa').length === 1`, {
      what: 'the ended ones back, folded to the newest',
    });
    await set('podNames', 'never');
    ctx.assert.equal(
      await ctx.evaluate(
        `[...document.querySelectorAll('#spgrid .spl')].every(l => getComputedStyle(l).display === 'none')`,
      ),
      true,
      'no pod names',
    );
    await set('podNames', 'zoom');
    await set('laneSpan', '60');
    ctx.assert.equal(await ctx.evaluate(`peix.prefs().spWin`), 60, 'the lanes’ span');
    await set('laneSpan', '30');

    // the states on top filter it: Ready off, its two chats gone; Idle and Done start off
    out.filters = await ctx.evaluate(
      `[...document.querySelectorAll('#spfs .spf')].map(f => f.dataset.k + ':' + f.getAttribute('aria-pressed') + ':' + f.querySelector('b').textContent).join(' ')`,
    );
    ctx.assert.equal(
      out.filters,
      'ask:true:1 work:true:2 watch:true:0 ready:true:4 idle:false:0 done:false:0',
      'a toggle a state, its count',
    );
    await ctx.evaluate(`document.querySelector('#spfs .spf[data-k="ready"]').click()`);
    await ctx.waitFor(`document.querySelectorAll('#spgrid .spt').length === 3`, {
      what: 'the four ready chats left out',
    });
    ctx.assert.deepEqual(await ctx.evaluate(`peix.prefs().spOff`), ['idle', 'done', 'ready'], 'kept');
    await ctx.evaluate(`document.querySelector('#spfs .spf[data-k="ready"]').click()`);
    await ctx.waitFor(`document.querySelectorAll('#spgrid .spt').length === 7`, { what: 'back' });

    // favourites (2026-11-18, v11): the ★ in a node's corner stars it — first, a row of its own, its own chip on top that
    // keeps it whatever its state, kept by the server; F on a node unstars it. A node made anew keeps its pings and arcs
    // where they were: on the document clock, as the cards' are (no flicker)
    const bump = await ctx.evaluate(
      `[...document.querySelectorAll('#spgrid .spt')].find(b => b.querySelector('.spbt').textContent.startsWith('Bump the build')).dataset.id`,
    );
    const tile = `document.querySelector('#spgrid .spt[data-id="${bump}"]')`;
    const spAnims = `document.getAnimations().filter(a => ['spsonar', 'spspin'].includes(a.animationName))`;
    const press = async sel => {
      // the mouse at its middle, pressed and let go: hit-testing as a hand's click has it
      const r = await ctx.evaluate(
        `(() => { const b = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })()`,
      );
      await ctx.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r.x, y: r.y });
      await ctx.send('Input.dispatchMouseEvent', {
        type: 'mousePressed',
        x: r.x,
        y: r.y,
        button: 'left',
        clickCount: 1,
      });
      await ctx.send('Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        x: r.x,
        y: r.y,
        button: 'left',
        clickCount: 1,
      });
    };
    ctx.assert.equal(
      await ctx.evaluate(`!!document.querySelector('#spfs .spf[data-k="fav"]')`),
      false,
      'no ★ chip before a favourite',
    );
    ctx.assert.equal(
      await ctx.evaluate(`getComputedStyle(${tile}.querySelector('.spstar')).visibility`),
      'hidden',
      'an unstarred node\u2019s star: only under the pointer',
    );
    await press(`#spgrid .spt[data-id="${bump}"] .spstar`);
    await ctx.waitFor(
      `document.querySelector('#spgrid .spt').dataset.id === '${bump}' && ${tile}.querySelector('.spstar').getAttribute('aria-pressed') === 'true'`,
      { what: 'starred: first' },
    );
    await ctx.waitFor(`peix.session('${bump}')?.fav === true`, { what: 'the server\u2019s word' });
    ctx.assert.equal(
      await ctx.evaluate(
        `[...document.querySelectorAll('#spfs .spf')].map(f => f.dataset.k + ':' + f.getAttribute('aria-pressed') + ':' + f.querySelector('b').textContent).join(' ')`,
      ),
      'fav:true:1 ask:true:1 work:true:2 watch:true:0 ready:true:3 idle:false:0 done:false:0',
      'its chip first, the rest counted without it',
    );
    await ctx.settle();
    out.favRow = await ctx.evaluate(
      `(() => { const [a, b] = document.querySelectorAll('#spgrid .spt'); return { next: b.classList.contains('spfirst'), below: b.offsetTop > a.offsetTop, left: b.offsetLeft === a.offsetLeft }; })()`,
    );
    ctx.assert.deepEqual(out.favRow, { next: true, below: true, left: true }, 'the favourites a row of their own');
    await ctx.shot('space-favorite');
    // a node made anew (infra's, its agents' marks a new look): every ping and arc still on the document clock
    await ctx.evaluate(`window.__infraNode = document.querySelector('#spgrid .spt[data-id="${infra.id}"]')`);
    await press(`#spgrid .spt[data-id="${infra.id}"] .spstar`);
    await ctx.waitFor(
      `document.querySelector('#spgrid .spt[data-id="${infra.id}"]') !== window.__infraNode && document.querySelector('#spgrid .spt[data-id="${infra.id}"] .spstar').getAttribute('aria-pressed') === 'true'`,
      { what: 'infra starred: its node made anew' },
    );
    await ctx.settle();
    out.phased = await ctx.evaluate(`${spAnims}.map(a => a.startTime === 0)`);
    ctx.assert.ok(
      out.phased.length > 2 && out.phased.every(Boolean),
      `every ping and arc on the document clock (${out.phased})`,
    );
    await ctx.evaluate(`document.querySelector('#spgrid .spt[data-id="${infra.id}"] .spstar').click()`);
    await ctx.waitFor(`peix.session('${infra.id}')?.fav === false`, { what: 'infra unstarred' });
    await ctx.evaluate(`document.querySelector('#spfs .spf[data-k="ready"]').click()`);
    await ctx.waitFor(`document.querySelectorAll('#spgrid .spt').length === 4 && !!${tile}`, {
      what: 'Ready off: the starred ready chat stays',
    });
    await ctx.evaluate(
      `document.querySelector('#spfs .spf[data-k="ready"]').click(); document.querySelector('#spfs .spf[data-k="fav"]').click()`,
    );
    await ctx.waitFor(`document.querySelectorAll('#spgrid .spt').length === 6 && !${tile}`, {
      what: 'the ★ chip off: the favourite out',
    });
    await ctx.evaluate(`document.querySelector('#spfs .spf[data-k="fav"]').click()`);
    await ctx.waitFor(`document.querySelectorAll('#spgrid .spt').length === 7`, { what: 'in again' });
    await ctx.reload();
    await ctx.waitFor(`document.querySelector('#spgrid .spt')?.dataset.id === '${bump}'`, {
      what: 'starred still after a reload',
    });
    await ctx.evaluate(`${tile}.focus()`);
    await ctx.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'f', code: 'KeyF', text: 'f' });
    await ctx.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'f', code: 'KeyF' });
    await ctx.waitFor(
      `!document.querySelector('#spfs .spf[data-k="fav"]') && document.querySelector('#spgrid .spt').dataset.id !== '${bump}' && peix.session('${bump}')?.fav === false`,
      { what: 'F: unstarred, back in its place' },
    );

    // zoom: the buttons, Fit, ⌘+ with the keys in Space, kept
    await ctx.evaluate(
      `document.querySelector('.spzoom [data-z="-1"]').click(); document.querySelector('.spzoom [data-z="-1"]').click(); document.querySelector('.spzoom [data-z="-1"]').click()`,
    );
    await ctx.waitFor(
      `document.querySelector('#spzv').textContent === '70%' && document.querySelector('#spgrid').classList.contains('small')`,
      { what: '70 %, the pods\u2019 names gone' },
    );
    out.cols = await ctx.evaluate(
      `getComputedStyle(document.querySelector('#spgrid')).gridTemplateColumns.split(' ').length`,
    );
    ctx.assert.ok(out.cols >= 3, `zoomed out, more nodes a row (${out.cols})`);
    await ctx.evaluate(`document.querySelector('#spgrid .spt').focus()`);
    await ctx.send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: '=',
      code: 'Equal',
      modifiers: 4,
      windowsVirtualKeyCode: 187,
    });
    await ctx.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: '=',
      code: 'Equal',
      modifiers: 4,
      windowsVirtualKeyCode: 187,
    });
    await ctx.waitFor(`document.querySelector('#spzv').textContent === '80%'`, {
      what: '\u2318+ in Space: its zoom, not the chat\u2019s',
    });
    await ctx.evaluate(`document.querySelector('.spzoom .fit').click()`);
    await ctx.waitFor(
      `(() => { const f = document.querySelector('#spfield'); return f.scrollHeight <= f.clientHeight + 1; })()`,
      { what: 'Fit: every node in sight' },
    );
    out.fit = await ctx.evaluate(`peix.prefs().spZoom`);
    await ctx.settle();
    await ctx.shot('space-fit-dark');

    // a click on a node opens its chat on the right, the whole height; its agents a strip under the nodes
    await ctx.evaluate(`document.querySelector('#spgrid .spt[data-id="${billing.id}"]').click()`);
    await ctx.waitFor(
      `peix.state().current === '${billing.id}' && !document.querySelector('#main').classList.contains('spfull') && getComputedStyle(document.querySelector('#chat')).display !== 'none'`,
      { what: 'the chat on the right' },
    );
    await ctx.waitFor(
      `document.querySelector('#spgrid .spt[data-id="${billing.id}"]').classList.contains('on') && document.querySelectorAll('#spside .splane').length === 2`,
      { what: 'its node lit, its lanes' },
    );
    out.geom = await ctx.evaluate(
      `(() => { const s = document.querySelector('#space').getBoundingClientRect(), c = document.querySelector('#chat').getBoundingClientRect(), l = document.querySelector('#spside').getBoundingClientRect(), f = document.querySelector('#spfield').getBoundingClientRect(); return { right: c.left >= s.right, tall: Math.abs(c.top - s.top) <= 8 && Math.abs(c.bottom - s.bottom) <= 8, strip: l.top >= f.bottom - 1 && l.left === s.left }; })()`,
    );
    ctx.assert.deepEqual(
      out.geom,
      { right: true, tall: true, strip: true },
      'Space left, the chat right at its height, the lanes under the nodes',
    );
    ctx.assert.match(
      await ctx.evaluate(`document.querySelector('#spside .splane[data-st="fail"] .spll').textContent`),
      /API error/i,
      'why it failed',
    );
    await ctx.settle();
    await ctx.shot('space-chat-dark');

    // the strip folds to its head, kept
    await ctx.evaluate(`document.querySelector('#spside .spfold').click()`);
    await ctx.waitFor(
      `!document.querySelector('#spside .splane') && document.querySelector('#spside .spfold').getAttribute('aria-expanded') === 'false'`,
      { what: 'the lanes folded' },
    );
    await ctx.evaluate(`document.querySelector('#spside .spfold').click()`);
    await ctx.waitFor(`document.querySelectorAll('#spside .splane').length === 2`, { what: 'open again' });

    // the header's × closes the chat — Space the whole width again; its claude is left alone
    ctx.assert.equal(await ctx.evaluate(`!!document.querySelector('#shead #spClose')`), true, 'the header has its ×');
    await ctx.evaluate(`document.querySelector('#spClose').click()`);
    await ctx.waitFor(
      `peix.state().current === null && document.querySelector('#main').classList.contains('spfull') && document.querySelector('#spside').hidden`,
      { what: 'closed by its \u00d7' },
    );
    ctx.assert.equal(await ctx.evaluate(`peix.session('${billing.id}').alive`), true, 'its claude runs on');
    ctx.assert.equal(await ctx.evaluate(`document.querySelector('#spgrid .spt.on')`), null, 'no node lit');
    // ⌘W on the chat's tab does the same
    await ctx.evaluate(`document.querySelector('#spgrid .spt[data-id="${billing.id}"]').click()`);
    await ctx.waitFor(
      `peix.state().current === '${billing.id}' && !document.querySelector('#main').classList.contains('spfull')`,
      { what: 'open again' },
    );
    ctx.assert.equal(await ctx.evaluate(`peixKey('KeyW', 'cmd')`), true, '\u2318W taken');
    await ctx.waitFor(`peix.state().current === null && document.querySelector('#main').classList.contains('spfull')`, {
      what: 'closed by \u2318W',
    });
    await ctx.evaluate(`document.querySelector('#spgrid .spt[data-id="${billing.id}"]').click()`);
    await ctx.waitFor(`peix.state().current === '${billing.id}'`, { what: 'and again, for what follows' });

    // every key is the board's: ⌥⌘N's picker over Space
    await ctx.key('KeyN');
    await ctx.waitFor(`document.querySelector('#pick').open`, { what: '⌥⌘N’s picker' });
    await ctx.send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: 'Escape',
      code: 'Escape',
      windowsVirtualKeyCode: 27,
    });
    await ctx.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: 'Escape',
      code: 'Escape',
      windowsVirtualKeyCode: 27,
    });
    await ctx.waitFor(`!document.querySelector('#pick').open`, { what: 'the picker closed' });
    ctx.assert.equal(
      await ctx.evaluate(`document.querySelector('#main').classList.contains('space')`),
      true,
      'Space still on',
    );

    // a lane opens its agent's tab, in the chat below
    await ctx.evaluate(`document.querySelector('#spgrid .spt[data-id="${infra.id}"]').click()`);
    await ctx.waitFor(
      `peix.state().current === '${infra.id}' && !!document.querySelector('#spside .splane[data-ag="sec1"]')`,
      { what: 'its lanes' },
    );
    ctx.assert.equal(
      await ctx.evaluate(`document.querySelector('#spside .splane[data-ag="sec1"] .spla').textContent`),
      'Look for open ingress',
      'a lane says what it was asked, no name: names are the card\u2019s',
    );
    await ctx.evaluate(`document.querySelector('#spside .splane[data-ag="sec1"]').click()`);
    await ctx.waitFor(
      `!document.querySelector('#agv').hidden && /Look for open ingress/.test(document.querySelector('#agv .agvh').textContent)`,
      { what: 'its tab, in the chat' },
    );
    // the node names the agent its chat runs as; a click on an agent's mark is its chat, on that agent's tab (v8)
    ctx.assert.equal(
      await ctx.evaluate(`document.querySelector('#spgrid .spt[data-id="${infra.id}"] .spra')?.textContent`),
      '@orchestrator',
      'the chat\u2019s own agent in its node',
    );
    await ctx.evaluate(`document.querySelector('#spClose').click()`);
    await ctx.waitFor(`peix.state().current === null`, { what: 'closed first' });
    await ctx.evaluate(`document.querySelector('#spgrid .spt[data-id="${infra.id}"] .spa[data-ag="sec2"]').click()`);
    await ctx.waitFor(
      `peix.state().current === '${infra.id}' && !document.querySelector('#agv').hidden && /wide IAM/.test(document.querySelector('#agv .agvh').textContent)`,
      { what: 'a mark clicked: its chat, on its agent\u2019s tab' },
    );
    await ctx.settle();
    await ctx.shot('space-agent-click-dark');

    // the divider, dragged: kept with Space across a reload
    const r = await ctx.evaluate(
      `(() => { const d = document.querySelector('#spdiv').getBoundingClientRect(), m = document.querySelector('#main').getBoundingClientRect(); return { x: d.left + d.width / 2, y: d.top + d.height / 2, to: m.left + m.width * .6 }; })()`,
    );
    await ctx.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.x, y: r.y, button: 'left', clickCount: 1 });
    await ctx.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: (r.x + r.to) / 2,
      y: r.y,
      button: 'left',
      buttons: 1,
    });
    await ctx.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r.to, y: r.y, button: 'left', buttons: 1 });
    await ctx.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: r.to,
      y: r.y,
      button: 'left',
      clickCount: 1,
    });
    out.at = await ctx.evaluate(`peix.prefs().spaceAt`);
    ctx.assert.ok(Math.abs(out.at - 0.6) < 0.03, `the divider dragged across to 60 % (${out.at})`);
    await ctx.reload();
    await ctx.waitFor(
      `document.querySelector('#main').classList.contains('space') && document.querySelectorAll('#spgrid .spt').length === 7`,
      { what: 'Space back after the reload' },
    );
    ctx.assert.equal(
      await ctx.evaluate(`document.querySelector('#main').style.getPropertyValue('--sp')`),
      String(out.at),
      'its share kept',
    );
    // dragged all the way left: Space down to one tile's column, never less (2026-11-18, v12); then back
    const r2 = await ctx.evaluate(
      `(() => { const d = document.querySelector('#spdiv').getBoundingClientRect(), m = document.querySelector('#main').getBoundingClientRect(); return { x: d.left + d.width / 2, y: d.top + d.height / 2, to: m.left + 4, back: m.left + m.width * .6 }; })()`,
    );
    const drag = async (from, to) => {
      await ctx.send('Input.dispatchMouseEvent', {
        type: 'mousePressed',
        x: from,
        y: r2.y,
        button: 'left',
        clickCount: 1,
      });
      await ctx.send('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x: (from + to) / 2,
        y: r2.y,
        button: 'left',
        buttons: 1,
      });
      await ctx.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: to, y: r2.y, button: 'left', buttons: 1 });
      await ctx.send('Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        x: to,
        y: r2.y,
        button: 'left',
        clickCount: 1,
      });
    };
    await drag(r2.x, r2.to);
    await ctx.settle();
    out.narrow =
      await ctx.evaluate(`(() => { const z = peix.prefs().spZoom || 1, f = document.querySelector('#spfield'), sp = document.querySelector('#space').getBoundingClientRect(), node = document.querySelector('#spgrid .spt').getBoundingClientRect();
      return { w: Math.round(sp.width) === Math.ceil(304 * z + 36), cols: getComputedStyle(document.querySelector('#spgrid')).gridTemplateColumns.split(' ').length, fits: f.scrollWidth <= f.clientWidth + 1, inside: node.right <= sp.right + .5 }; })()`);
    ctx.assert.deepEqual(
      out.narrow,
      { w: true, cols: 1, fits: true, inside: true },
      'one column, one tile at this zoom wide, nothing past Space\u2019s edge',
    );
    await ctx.shot('space-one-column');
    const d2 = await ctx.evaluate(
      `(() => { const d = document.querySelector('#spdiv').getBoundingClientRect(); return d.left + d.width / 2; })()`,
    );
    await drag(d2, r2.back);
    ctx.assert.equal(
      await ctx.evaluate(`document.querySelector('#spzv').textContent`),
      `${Math.round(out.fit * 100)}%`,
      'its zoom kept',
    );

    // the list's button leaves Space for the list; ⌥⌘X takes its place again
    await ctx.evaluate(`document.querySelector('#sbList').click()`);
    await ctx.waitFor(
      `!document.querySelector('#main').classList.contains('space') && getComputedStyle(document.querySelector('#sessions')).display !== 'none'`,
      { what: 'the list back, Space gone' },
    );
    ctx.assert.deepEqual(
      await ctx.evaluate(
        `[document.querySelector('#sbList').getAttribute('aria-pressed'), document.querySelector('#sbSpace').getAttribute('aria-pressed'), peix.prefs().space]`,
      ),
      ['true', 'false', false],
      'each button says which',
    );
    await ctx.key('KeyX');
    await ctx.waitFor(
      `document.querySelector('#main').classList.contains('space') && getComputedStyle(document.querySelector('#sessions')).display === 'none'`,
      { what: 'Space in the list\u2019s place again' },
    );
    // ⌥⌘X leaves it: the board as it was
    await ctx.key('KeyX');
    await ctx.waitFor(
      `!document.querySelector('#main').classList.contains('space') && document.querySelector('#space').hidden`,
      { what: 'Space off' },
    );
    await ctx.key('KeyX');
    await ctx.waitFor(`document.querySelector('#main').classList.contains('space')`, { what: 'on again' });
    await ctx.openChat(infra.id);
    await ctx.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
    await ctx.settle();
    ctx.assert.equal(
      await ctx.evaluate(`getComputedStyle(document.querySelector('#spsky')).display`),
      'none',
      'no sky on a light theme',
    );
    await ctx.shot('space-chat-light');
    return out;
  } finally {
    for (const s of sleeps) s.kill();
  }
}
