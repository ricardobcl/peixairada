// A question answered from its node in Space (2026-11-24). The line that asks reaches the transcript only with its
// answer, so the node's pill and panel read the question off the chat's drawer, as Claude Code draws its select: the
// question, then numbered answers, a description under each. The pill counts the answers; pressed (or ⏎ on the node)
// the panel has the question and each answer whole; a digit, ⏎ on the ringed row or a click is that key on the
// drawer's socket. A permission prompt the same; an answer that wants words opens the chat. A chat asking in a terminal
// elsewhere: a pill saying where, no panel. Settings › Space › Answer from the node off: no pill.
// The drawer is a stand-in (`window.peixSpDrawer`): its xterm written by hand, its socket a recorder — what Claude Code
// draws is the input here, and the keys sent are what is checked. A number moves its ring as Claude Code's select does,
// and ⏎ follows only onto it (2026-11-24, review): a select the number took alone gets none. The panel's keys are its
// own: moved to ⌘F's box, a digit is the box's. An asking node has no ✓, nor does D tick it.
import { spawn } from 'node:child_process';
import { makeFixture, toolLines } from '../fixture.mjs';

export const meta = { server: true, fixture: 'auto', prefs: { space: true, cards: 'compact' } };

const ESC = '\x1b';
const ASK = [
  `${ESC}[2m☐ Queue${ESC}[0m`,
  '',
  'Which queue should the invoice webhooks go on, given that billing already reads a Kafka topic?',
  '',
  `${ESC}[36m❯${ESC}[0m 1. SQS`,
  `     ${ESC}[2mManaged, at-least-once; the retries are ours${ESC}[0m`,
  '  2. Kafka topic',
  `     ${ESC}[2mThe one billing already reads${ESC}[0m`,
  '  3. Postgres table and a worker',
  `     ${ESC}[2mNo new infrastructure${ESC}[0m`,
  '  4. Type something.',
  '',
  `${ESC}[2mEnter to select · ↑/↓ to navigate · Esc to cancel${ESC}[0m`,
];
const PERM = [
  '╭──────────────────────────────────────────────────────────╮',
  '│ Bash command                                             │',
  '│                                                          │',
  '│   npm run migrate                                        │',
  '│   Run the migrations                                     │',
  '│                                                          │',
  '│ Do you want to proceed?                                  │',
  '│ ❯ 1. Yes                                                 │',
  "│   2. Yes, and don't ask again for npm run migrate        │",
  '│   3. No, and tell Claude what to do differently (esc)    │',
  '╰──────────────────────────────────────────────────────────╯',
];

export default async function (ctx) {
  const out = {},
    now = Date.now(),
    cwd = ctx.fixture.chats[0].cwd;
  const sleeps = [0, 1].map(() => spawn('sleep', ['300'], { stdio: 'ignore' }));
  const asked = (i, title) => ({
    cwd,
    title,
    prompt: 'pick one',
    reply: 'One question.',
    at: new Date(now - 300_000 - i * 1000),
    live: { pid: sleeps[i].pid, startedAt: now - 3_600_000 },
    lines: id =>
      toolLines({
        id,
        cwd,
        name: 'AskUserQuestion',
        at: new Date(now - 60_000),
        input: {
          questions: [{ question: 'Which one?', header: 'Pick', options: [{ label: 'This' }, { label: 'That' }] }],
        },
      }),
  });
  const node = id => `document.querySelector('#spgrid .spt[data-id="${id}"]')`;
  const press = async sel => {
    // a hand's click, hit-testing and all
    const r = await ctx.evaluate(
      `(() => { const b = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })()`,
    );
    await ctx.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r.x, y: r.y });
    await ctx.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.x, y: r.y, button: 'left', clickCount: 1 });
    await ctx.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: r.x,
      y: r.y,
      button: 'left',
      clickCount: 1,
    });
  };
  const key = async (key, code, vk) => {
    await ctx.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key, code, windowsVirtualKeyCode: vk });
    await ctx.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk });
  };
  const panel = () =>
    ctx.evaluate(
      `(p => p && !p.hidden ? { q: p.querySelector('.spaq')?.textContent || '', opts: [...p.querySelectorAll('.spao')].map(o => [o.dataset.k, o.querySelector('span:last-child').firstChild.textContent, o.querySelector('small')?.textContent || '']) } : null)(document.querySelector('#spaskp'))`,
    );
  /** The stand-in drawer's screen, drawn anew; its socket a recorder of what was typed. */
  /** The select with its ring on answer k, as Claude Code redraws it on a number. */
  const ringOn = (lines, k) =>
    lines.map(l => {
      const m = /^(\s*│?\s?)(?:❯ | {2})(\d+)\. (.*)$/.exec(l.replace(/\x1b\[[0-9;]*m/g, ''));
      return m ? `${m[1]}${+m[2] === k ? '❯ ' : '  '}${m[2]}. ${m[3]}` : l;
    });
  /** The stand-in drawer's screen, drawn anew; its socket a recorder of what was typed. A number redraws it — the ring on
   *  that answer, or (`took`) the select gone, as when the number alone takes the answer. */
  const draw = (lines, took = false) => {
    const after = Object.fromEntries(
      [1, 2, 3, 4, 5, 6, 7, 8, 9].map(k => [k, (took ? ['Done.'] : ringOn(lines, k)).join('\r\n')]),
    );
    return ctx.evaluate(`((m, first, after) => { m.ws.onmessage = null; try { m.ws.close(); } catch {} const paint = s => { m.xt.reset(); m.xt.write(s); };
      m.ws = { readyState: 1, close() {}, send: d => { const x = JSON.parse(d); (window.__sent ||= []).push(x); if (after[x.d]) paint(after[x.d]); } };
      paint(first); return true; })(peix.spMini('tfake'), ${JSON.stringify(lines.join('\r\n'))}, ${JSON.stringify(after)})`);
  };
  const sent = () => ctx.evaluate(`(window.__sent || []).map(m => m.t + ':' + m.d)`);
  try {
    const {
      chats: [here, far],
    } = makeFixture(ctx.fixture.dir, [
      asked(0, 'Queue for invoice webhooks'),
      asked(1, 'Asked in a terminal elsewhere'),
    ]);
    await ctx.waitFor(
      `peix.session('${here.id}')?.status === 'needs-input' && peix.session('${far.id}')?.status === 'needs-input'`,
      { what: 'both chats asking', timeout: 20000 },
    );
    await ctx.waitFor(`${node(far.id)}?.querySelector('.spask')`, { what: 'the pills' });
    out.far = await ctx.evaluate(
      `[${node(far.id)}.querySelector('.spask').className, ${node(far.id)}.querySelector('.spask').textContent]`,
    );
    ctx.assert.deepEqual(out.far, ['spask off', '? In a terminal elsewhere'], 'asked elsewhere: where, and no panel');

    await ctx.evaluate(
      `window.peixSpDrawer = { '${here.id}': { id: 'tfake', exited: null, cols: 100, rows: 30 } }; document.querySelector('#spfs .spf[data-k="ask"]').click(); document.querySelector('#spfs .spf[data-k="ask"]').click()`,
    );
    await ctx.waitFor(`peix.spMini('tfake') && ${node(here.id)}?.querySelector('.spask[data-tid="tfake"]')`, {
      what: 'its drawer read',
    });
    await draw(ASK);
    await ctx.waitFor(`${node(here.id)}.querySelector('.spask .spakn')?.textContent === '4 answers'`, {
      what: 'its pill, the answers counted off its screen',
    });
    await ctx.settle();

    // asking: no ✓ on its node, and D ticks nothing — Done would end its claude mid-question
    ctx.assert.equal(
      await ctx.evaluate(`!!${node(here.id)}.querySelector('.spdone')`),
      false,
      'an asking node has no ✓',
    );
    await ctx.evaluate(`${node(here.id)}.focus()`);
    await key('d', 'KeyD', 68);
    await ctx.sleep(400);
    ctx.assert.equal(await ctx.evaluate(`peix.session('${here.id}').done`), false, 'D on it ticks nothing');

    await press(`#spgrid .spt[data-id="${here.id}"] .spask`);
    await ctx.waitFor(
      `!document.querySelector('#spaskp')?.hidden && document.querySelectorAll('#spaskp .spao').length === 4`,
      { what: 'its panel' },
    );
    out.ask = await panel();
    ctx.assert.deepEqual(
      out.ask,
      {
        q: 'Which queue should the invoice webhooks go on, given that billing already reads a Kafka topic?',
        opts: [
          ['1', 'SQS', 'Managed, at-least-once; the retries are ours'],
          ['2', 'Kafka topic', 'The one billing already reads'],
          ['3', 'Postgres table and a worker', 'No new infrastructure'],
          ['4', 'Type something.', ''],
        ],
      },
      'the question whole — wrapped rows one sentence, the tab header out —, each answer with its description',
    );
    out.inView = await ctx.evaluate(
      `(r => r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight)(document.querySelector('#spaskp').getBoundingClientRect())`,
    );
    ctx.assert.equal(out.inView, true, 'the panel in the window');
    await ctx.shot('space-answer');
    await key('ArrowDown', 'ArrowDown', 40);
    ctx.assert.equal(
      await ctx.evaluate(`document.querySelector('#spaskp .spao.sel')?.dataset.k`),
      '2',
      '↓ rings the next',
    );
    await key('Enter', 'Enter', 13);
    await ctx.waitFor(`document.querySelector('#spaskp').hidden`, { what: '⏎: answered, the panel gone' });
    await ctx.waitFor(`(window.__sent || []).length === 2`, { what: 'its ⏎' });
    ctx.assert.deepEqual(await sent(), ['in:2', 'in:\r'], 'the ringed answer’s number, then ⏎, on its drawer');
    ctx.assert.equal(await ctx.evaluate(`peix.state().current`), null, 'a plain answer opens nothing');

    // a permission prompt in a box, by ⏎ on its node and a click on a row
    await draw(PERM);
    await ctx.waitFor(`${node(here.id)}.querySelector('.spask .spakn')?.textContent === '3 answers'`, {
      what: 'the permission prompt’s pill',
    });
    await ctx.evaluate(`${node(here.id)}.focus()`);
    await key('Enter', 'Enter', 13);
    await ctx.waitFor(`document.querySelectorAll('#spaskp .spao').length === 3`, { what: '⏎ on the node: its panel' });
    out.perm = await panel();
    ctx.assert.deepEqual(
      out.perm,
      {
        q: 'npm run migrate Run the migrations\nDo you want to proceed?',
        opts: [
          ['1', 'Yes', ''],
          ['2', "Yes, and don't ask again for npm run migrate", ''],
          ['3', 'No, and tell Claude what to do differently (esc)', ''],
        ],
      },
      'out of its box: the command and the question, its three answers',
    );
    ctx.assert.equal(
      await ctx.evaluate(`peix.state().current`),
      null,
      '⏎ on an asking node: its question, not the chat',
    );
    await press('#spaskp .spao[data-k="1"]');
    await ctx.waitFor(`document.querySelector('#spaskp').hidden`, { what: 'a click: answered' });
    await ctx.waitFor(`(window.__sent || []).length === 4`, { what: 'its ⏎' });
    ctx.assert.deepEqual(await sent(), ['in:2', 'in:\r', 'in:1', 'in:\r']);

    // an answer that wants words: its key, then the chat open
    await draw(PERM);
    await press(`#spgrid .spt[data-id="${here.id}"] .spask`);
    await ctx.waitFor(`document.querySelectorAll('#spaskp .spao').length === 3`, { what: 'the panel again' });
    await key('3', 'Digit3', 51);
    await ctx.waitFor(`peix.state().current === '${here.id}'`, { what: '“No, and tell Claude…”: the chat opened' });
    await ctx.sleep(300);
    ctx.assert.deepEqual(
      await sent(),
      ['in:2', 'in:\r', 'in:1', 'in:\r', 'in:3'],
      'an answer that wants words: its number alone, the chat opened on its box',
    );

    // the number took the answer alone: the select gone, no ⏎ after it — the next prompt's default is nobody's answer
    await draw(PERM, true);
    await press(`#spgrid .spt[data-id="${here.id}"] .spask`);
    await ctx.waitFor(`document.querySelectorAll('#spaskp .spao').length === 3`, {
      what: 'the panel, a select that takes the number alone',
    });
    await key('2', 'Digit2', 50);
    await ctx.waitFor(`(window.__sent || []).length === 6`, { what: 'its number' });
    await ctx.sleep(1200);
    ctx.assert.deepEqual((await sent()).slice(5), ['in:2'], 'its number alone: the select went with it, no ⏎');

    // the keys moved away — ⌘F's box — take the panel down, and a digit typed there is the box's
    await draw(PERM);
    await press(`#spgrid .spt[data-id="${here.id}"] .spask`);
    await ctx.waitFor(`document.querySelectorAll('#spaskp .spao').length === 3`, { what: 'the panel again' });
    await ctx.evaluate(`document.querySelector('#spq').focus()`);
    await ctx.waitFor(`document.querySelector('#spaskp').hidden`, { what: 'the keys in the find box: the panel down' });
    await key('2', 'Digit2', 50);
    await ctx.sleep(400);
    ctx.assert.equal((await sent()).length, 6, 'a digit in the find box answers nothing');
    await ctx.evaluate(
      `(b => { b.value = ''; b.dispatchEvent(new Event('input')); b.blur(); })(document.querySelector('#spq'))`,
    );

    // esc closes it; a screen that does not parse is shown as its text
    await draw(['Something Claude Code drew that is no select at all', '', '  not a question']);
    await ctx.waitFor(`${node(here.id)}.querySelector('.spask .spakn')?.textContent === 'Answer'`, {
      what: 'no answers read',
    });
    await press(`#spgrid .spt[data-id="${here.id}"] .spask`);
    await ctx.waitFor(`/no select at all/.test(document.querySelector('#spaskp .spapre')?.textContent || '')`, {
      what: 'its screen as text',
      timeout: 5000,
    });
    await key('Escape', 'Escape', 27);
    await ctx.waitFor(`document.querySelector('#spaskp').hidden`, { what: 'esc closed it' });

    // off in Settings › Space: no pill
    await ctx.evaluate(`document.querySelector('#askOn').click()`);
    await ctx.waitFor(`!${node(here.id)}.querySelector('.spask') && !${node(far.id)}.querySelector('.spask')`, {
      what: 'off: no pill',
    });
    ctx.assert.equal(await ctx.evaluate(`peix.prefs().spAnswer`), false);
    return out;
  } finally {
    for (const s of sleeps) s.kill();
  }
}
