// The branch moved under a chat (2026-10-13). Two live chats in one checkout: one at work whose lines say
// feat/tax-rounding while the folder's HEAD says main — someone moved it —, and one idle on main beside it. What is
// checked: the poll reads the HEAD file and, a line of the chat's come in after it, the chat at work is alerted once
// (kind drift, a heading) — held before, its own switch's message being written after the call (2026-10-14); the chip
// before the changes' count reads "main now · was feat/tax-rounding", its tooltip names the other chat and screen
// readers hear it; the card wears the red branch, the other card none; the lines catching up are the same move, no second
// alert; the row stays one line narrowed; a click on the chip sets it aside, card and all, and the next move shows
// again; a word of yours clears it. And two more chats at work, each in a checkout of its own: one's own `git switch -c`
// on the line after the one that first shows the branch, its HEAD file moved before either is written — held, judged its
// own, nothing shown nor said —; the other's branch moved from outside on a line of its transcript and its HEAD — said
// once. Tiles and the floating header on, for the shots (DARK=1 for the dark ones).
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { appendFileSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { slugOf } from '../fixture.mjs';
import { tmpDir } from '../../lib/testserver.mjs';

export const meta = { server: true, fixture: 'auto' };

export default async function (ctx) {
  const out = {};
  const root = realpathSync(tmpDir('peix-drift-')), cwd = join(root, 'widgets');
  const sleeps = [0, 1, 2, 3].map(() => spawn('sleep', ['180'], { stdio: 'ignore' }));
  try {
    // a checkout as far as the board reads one: the HEAD file, which is all it reads
    mkdirSync(join(cwd, '.git'), { recursive: true });
    const head = branch => writeFileSync(join(cwd, '.git', 'HEAD'), `ref: refs/heads/${branch}\n`);
    head('main');
    const T = Date.now(), ts = ms => new Date(T + ms).toISOString();
    const projDir = join(ctx.fixture.dir, 'projects', slugOf(cwd)); mkdirSync(projDir, { recursive: true });
    const line = (id, branch, ms, type, content, extra = {}) => ({ isSidechain: false, userType: 'external', entrypoint: 'cli', cwd, sessionId: id, version: 'fixture', gitBranch: branch, parentUuid: null, uuid: randomUUID(), timestamp: ts(ms), type, message: { role: type, content, ...extra } });
    const prompt = (id, branch, ms, text) => line(id, branch, ms, 'user', [{ type: 'text', text }]);
    const said = (id, branch, ms, text, stop = 'end_turn') => line(id, branch, ms, 'assistant', [{ type: 'text', text }], { model: 'fixture-1', id: 'msg_' + randomUUID().slice(0, 8), stop_reason: stop });
    const calls = (id, branch, ms, command) => line(id, branch, ms, 'assistant', [{ type: 'tool_use', id: 'toolu_' + randomUUID().slice(0, 12), name: 'Bash', input: { command } }], { model: 'fixture-1', id: 'msg_' + randomUUID().slice(0, 8), stop_reason: 'tool_use' });
    const chat = ({ title, lines, pid, status }) => {
      const id = randomUUID(), file = join(projDir, `${id}.jsonl`);
      writeFileSync(file, [...lines(id), { type: 'ai-title', sessionId: id, aiTitle: title }].map(l => JSON.stringify(l)).join('\n') + '\n');
      writeFileSync(join(ctx.fixture.dir, 'sessions', `${pid}.json`), JSON.stringify({ pid, sessionId: id, cwd, startedAt: T - 3600_000, version: 'fixture', kind: 'interactive', entrypoint: 'cli', status, statusUpdatedAt: T }));
      return { id, file };
    };

    // light unless DARK=1, whatever this Mac shows: the shots are of both
    if (!process.env.DARK) { await ctx.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] }); await ctx.reload(); }
    // a second listener on the stream: every alert, whatever the page does with it
    await ctx.waitFor(`document.querySelectorAll('#slist > .card').length > 0`, { what: 'the board' });
    await ctx.evaluate(`(() => { window.__alerts = []; window.__es = new EventSource('/events?key=' + window.PEIX_KEY); window.__es.addEventListener('alert', e => window.__alerts.push(JSON.parse(e.data))); })()`);
    await ctx.waitFor(`window.__es.readyState === 1`, { what: 'the second listener connected' });

    const beside = chat({ title: 'Checkout button spacing', pid: sleeps[1].pid, status: 'idle', lines: id => [prompt(id, 'main', -600_000, 'tighten the checkout button'), said(id, 'main', -590_000, 'Done: 12 px now.')] });
    const moved = chat({ title: 'Tax rounding, and the rates follow-up', pid: sleeps[0].pid, status: 'busy', lines: id => [
      prompt(id, 'feat/tax-rounding', -120_000, 'round the tax to the cent'),
      said(id, 'feat/tax-rounding', -110_000, 'The rounding goes in tax.js.', 'tool_use'),
      calls(id, 'feat/tax-rounding', -100_000, 'npm test -- tax'),
    ] });
    const sum = id => ctx.server.api('api/sessions').then(r => r.body.sessions.find(s => s.id === id));
    const card = id => `document.querySelector('#slist > .card[data-id="${id}"]')`;

    // ---- the poll reads the HEAD file: the chat at work is told, once — once a line of its own has come in since, for
    // a chat at work writes the message of its own switch only after the call (2026-10-14) ----
    await ctx.waitFor(`window.peix.session(${JSON.stringify(moved.id)})?.headNow === 'main'`, { what: 'the HEAD file read', timeout: 15_000 });
    await ctx.sleep(2500);   // looks past the slack: held, nothing of its own come in
    ctx.assert.equal((await sum(moved.id)).drift, null, 'held while the chat at work has written nothing since');
    appendFileSync(moved.file, JSON.stringify(said(moved.id, 'feat/tax-rounding', -95_000, 'The tests pass; now the rates.', 'tool_use')) + '\n');
    await ctx.waitFor(`window.peix.session(${JSON.stringify(moved.id)})?.drift?.to === 'main'`, { what: 'the drift on the summary', timeout: 15_000 });
    out.summary = await sum(moved.id);
    ctx.assert.deepEqual([out.summary.drift.from, out.summary.drift.to, out.summary.headNow], ['feat/tax-rounding', 'main', 'main'], 'the folder on main, the chat\'s lines on feat/tax-rounding');
    ctx.assert.deepEqual(out.summary.drift.peers, [beside.id], 'the other live chat in the checkout');
    ctx.assert.equal((await sum(beside.id)).drift, null, 'the chat on main beside it has none');
    await ctx.waitFor(`window.__alerts.some(a => a.kind === 'drift')`, { what: 'the drift alert' });
    out.alert = await ctx.evaluate(`window.__alerts.filter(a => a.kind === 'drift').map(a => ({ id: a.sessionId, heading: a.heading, snippet: a.snippet }))`);
    ctx.assert.deepEqual(out.alert, [{ id: moved.id, heading: `Branch moved · widgets`, snippet: 'main now · was feat/tax-rounding — 1 other chat runs in this checkout' }], 'one alert, with a heading of its own');

    // ---- the card's mark, and none beside it ----
    await ctx.waitFor(`${card(moved.id)}?.querySelector('.trow .drift')`, { what: 'the red branch on the card' });
    out.mark = await ctx.evaluate(`(c => ({ tip: c.querySelector('.trow .drift').title, vh: c.querySelector('.trow .drift .vh').textContent, color: getComputedStyle(c.querySelector('.trow .drift')).color, needs: getComputedStyle(document.documentElement).getPropertyValue('--needs').trim() }))(${card(moved.id)})`);
    ctx.assert.equal(out.mark.tip, 'The branch moved under it: main now, was feat/tax-rounding');
    ctx.assert.equal(out.mark.vh, ', its branch moved', 'said to a screen reader');
    ctx.assert.equal(await ctx.evaluate(`!!${card(beside.id)}.querySelector('.drift')`), false, 'no mark on the card beside it');

    // ---- the header's chip ----
    await ctx.openChat(moved.id);
    await ctx.waitFor(`document.querySelector('#driftBtn')`, { what: 'the chip in the header' });
    await ctx.settle();
    out.chip = await ctx.evaluate(`(b => ({ n: b.querySelector('.n').textContent, q: b.querySelector('.q').textContent, vh: b.querySelector('.vh').textContent, tip: b.title,
      afterTitle: b.previousElementSibling?.tagName, oneLine: Math.abs(b.getBoundingClientRect().top - document.querySelector('#shead h2').getBoundingClientRect().top) < 12 }))(document.querySelector('#driftBtn'))`);
    ctx.assert.deepEqual([out.chip.n, out.chip.q, out.chip.vh], ['main now', '· was feat/tax-rounding', 'The branch moved under this chat: '], 'its words');
    ctx.assert.equal(out.chip.afterTitle, 'H2', 'right after the title: before the changes\' count and the PRs');
    ctx.assert.match(out.chip.tip, /^main is checked out in widgets now — this chat was on feat\/tax-rounding\.\nAlso running in this checkout: Checkout button spacing\n/, 'the tooltip names the chat beside it');
    ctx.assert.ok(out.chip.oneLine, 'on the title\'s row');
    // contrast: the chip's words on its tint over the header, and the card's mark on the card
    const lum = c => { const [r, g, b] = c.match(/[\d.]+/g).slice(0, 3).map(Number).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }); return .2126 * r + .7152 * g + .0722 * b; };
    const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + .05) / (y + .05); };
    out.px = await ctx.evaluate(`(() => {
      const cv = document.createElement('canvas'), g = cv.getContext('2d'), rgb = css => { g.clearRect(0, 0, 1, 1); g.fillStyle = '#000'; g.fillStyle = css; g.fillRect(0, 0, 1, 1); return 'rgb(' + [...g.getImageData(0, 0, 1, 1).data].slice(0, 3).join(',') + ')'; };
      const b = document.querySelector('#driftBtn'), st = getComputedStyle(b), under = getComputedStyle(document.querySelector('#shead'), '::after').backgroundColor;
      const card = ${card(moved.id)};
      const root = getComputedStyle(document.documentElement);
      return { ink: rgb(st.color), tint: st.backgroundColor, under: rgb(under), mark: rgb(getComputedStyle(card.querySelector('.trow .drift')).color), grounds: ['--panel', '--bg'].map(v => rgb(root.getPropertyValue(v).trim())) };
    })()`);
    // the tint is the red at 16 % over the header's black or panel, composited by hand — `color(srgb r g b / a)` in 0–1
    const mix = (fg, bg) => { const f = fg.match(/[\d.]+/g).map(Number), unit = /^color\(/.test(fg) ? 255 : 1, k = f[3] ?? 1, b = bg.match(/[\d.]+/g).map(Number);
      return `rgb(${[0, 1, 2].map(i => Math.round(f[i] * unit * k + b[i] * (1 - k))).join(',')})`; };
    out.contrast = { chip: +ratio(out.px.ink, mix(out.px.tint, out.px.under)).toFixed(2), mark: +Math.min(...out.px.grounds.map(g => ratio(out.px.mark, g))).toFixed(2), theme: await ctx.evaluate(`document.documentElement.dataset.theme`) };
    ctx.assert.ok(out.contrast.chip >= 4.5, `the chip's words read at AA (${out.contrast.chip})`);
    ctx.assert.ok(out.contrast.mark >= 3, `the card's mark reads as a mark (${out.contrast.mark})`);
    await ctx.shot(`1-chip-${out.contrast.theme}`, await ctx.evaluate(`(r => ({ x: Math.max(0, r.x - 8), y: Math.max(0, r.y - 8), width: r.width + 16, height: r.height + 16 }))(document.querySelector('#shead').getBoundingClientRect().toJSON())`));
    await ctx.shot(`2-card-${out.contrast.theme}`, await ctx.evaluate(`(r => ({ x: Math.max(0, r.x - 8), y: Math.max(0, r.y - 8), width: r.width + 16, height: r.height * 2 + 30 }))(${card(moved.id)}.getBoundingClientRect().toJSON())`));

    // ---- the lines catch up: the same move, no second alert ----
    appendFileSync(moved.file, JSON.stringify(said(moved.id, 'main', 1000, 'Running the tests again.', 'tool_use')) + '\n');
    await ctx.waitFor(`window.peix.session(${JSON.stringify(moved.id)})?.lastActivity === ${JSON.stringify(ts(1000))}`, { what: 'the line that carries main' });
    await ctx.sleep(1500);   // a poll past it
    out.caughtUp = { drift: (await sum(moved.id)).drift, alerts: await ctx.evaluate(`window.__alerts.filter(a => a.kind === 'drift').length`) };
    ctx.assert.deepEqual([out.caughtUp.drift?.from, out.caughtUp.drift?.to, out.caughtUp.alerts], ['feat/tax-rounding', 'main', 1], 'the transcript says the same move, and nobody is told twice');

    // ---- narrowed, the row stays one line: the chip gives way, then folds ----
    for (const w of [900, 640]) {
      await ctx.send('Emulation.setDeviceMetricsOverride', { width: w, height: 900, deviceScaleFactor: 1, mobile: false }); await ctx.sleep(400);
      out[`w${w}`] = await ctx.evaluate(`(() => { const h = document.querySelector('#shead'), b = h.querySelector('#driftBtn'), more = h.querySelector('.hmore');
        return { folded: b.classList.contains('hfold'), width: Math.round(b.getBoundingClientRect().width), clipped: b.querySelector('.q').scrollWidth > b.querySelector('.q').clientWidth,
          oneLine: Math.abs(more.getBoundingClientRect().top - h.querySelector('h2').getBoundingClientRect().top) < 12 }; })()`);
      ctx.assert.ok(out[`w${w}`].oneLine, `${w} px: the row is one line (${JSON.stringify(out[`w${w}`])})`);
    }
    await ctx.send('Emulation.clearDeviceMetricsOverride'); await ctx.sleep(400);

    // ---- a click sets it aside, card and all; the state file keeps it ----
    await ctx.evaluate(`document.querySelector('#driftBtn').click()`);
    await ctx.waitFor(`!document.querySelector('#driftBtn') && !${card(moved.id)}.querySelector('.drift')`, { what: 'the chip and the mark gone' });
    await ctx.sleep(400);
    ctx.assert.equal((await sum(moved.id)).drift, null, 'the server has it set aside');
    out.acks = JSON.parse(readFileSync(join(ctx.server.dir, 'state.json'), 'utf8')).driftAcks;
    ctx.assert.deepEqual(out.acks, { [moved.id]: 'feat/tax-rounding→main' }, 'in the state file');
    await ctx.sleep(1500);
    ctx.assert.equal(await ctx.evaluate(`!!document.querySelector('#driftBtn')`), false, 'a poll later, still aside');

    // ---- the next move shows again, with the chat's next line ----
    head('feat/rates');
    await ctx.waitFor(`window.peix.session(${JSON.stringify(moved.id)})?.headNow === 'feat/rates'`, { what: 'the next move read', timeout: 15_000 });
    appendFileSync(moved.file, JSON.stringify(said(moved.id, 'main', 2000, 'Still running.', 'tool_use')) + '\n');
    await ctx.waitFor(`document.querySelector('#driftBtn .n')?.textContent === 'feat/rates now'`, { what: 'the chip back for the next move', timeout: 15_000 });
    out.next = await ctx.evaluate(`document.querySelector('#driftBtn .q').textContent`);
    ctx.assert.equal(out.next, '· was feat/tax-rounding', 'from where the chat was before anything moved');

    // ---- a word of yours clears it ----
    appendFileSync(moved.file, JSON.stringify(prompt(moved.id, 'main', 5000, 'ok — carry on on feat/rates')) + '\n');
    await ctx.waitFor(`!document.querySelector('#driftBtn') && !${card(moved.id)}.querySelector('.drift')`, { what: 'cleared by your word' });
    await ctx.sleep(1500);
    out.cleared = await sum(moved.id);
    ctx.assert.deepEqual([out.cleared.drift, out.cleared.headNow], [null, 'feat/rates'], 'and a poll later the folder\'s branch is the chat\'s, though its line still said main');
    out.acksAfter = JSON.parse(readFileSync(join(ctx.server.dir, 'state.json'), 'utf8')).driftAcks;
    ctx.assert.deepEqual(out.acksAfter, {}, 'the set-aside went with its move');

    // ---- the chat's own switch, written after the line that first shows its branch: nothing shown, nothing said ----
    const now = () => Date.now() - T;
    const alone = (folder, title, branch, pid) => {   // a chat at work in a checkout of its own
      const dir = join(root, folder); mkdirSync(join(dir, '.git'), { recursive: true });
      const c = { id: randomUUID(), head: b => writeFileSync(join(dir, '.git', 'HEAD'), `ref: refs/heads/${b}\n`) };
      c.at = (l, msg) => ({ ...l, cwd: dir, ...msg && { message: { ...l.message, id: msg } } });
      c.add = (...ls) => appendFileSync(c.file, ls.map(l => JSON.stringify(c.at(...[].concat(l)))).join('\n') + '\n');
      c.head(branch);
      const proj = join(ctx.fixture.dir, 'projects', slugOf(dir)); mkdirSync(proj, { recursive: true }); c.file = join(proj, `${c.id}.jsonl`);
      writeFileSync(c.file, [c.at(prompt(c.id, branch, now() - 20_000, 'run the tests')), c.at(calls(c.id, branch, now() - 15_000, 'npm test')), { type: 'ai-title', sessionId: c.id, aiTitle: title }].map(l => JSON.stringify(l)).join('\n') + '\n');
      writeFileSync(join(ctx.fixture.dir, 'sessions', `${pid}.json`), JSON.stringify({ pid, sessionId: c.id, cwd: dir, startedAt: T - 3600_000, version: 'fixture', kind: 'interactive', entrypoint: 'cli', status: 'busy', statusUpdatedAt: Date.now() }));
      return c;
    };
    const saidTo = id => ctx.evaluate(`window.__alerts.filter(a => a.sessionId === ${JSON.stringify(id)}).map(a => [a.kind, a.heading, a.snippet])`);
    const own = alone('gadgets', 'Gadgets, a branch of its own', 'feat/start', sleeps[2].pid);
    await ctx.waitFor(`window.peix.session(${JSON.stringify(own.id)})?.headNow === 'feat/start'`, { what: 'the third chat, its checkout read', timeout: 15_000 });
    const looks = [], watch = setInterval(() => sum(own.id).then(x => looks.push(x?.drift || null), () => {}), 200);
    try {
      own.head('feat/new');   // its switch has run
      await ctx.sleep(1500);   // a poll or more sees the HEAD file moved, the transcript not yet
      const msg = 'msg_' + randomUUID().slice(0, 8), at = now();
      own.add([line(own.id, 'feat/new', at, 'assistant', [{ type: 'thinking', thinking: 'A branch for it.' }], { model: 'fixture-1', stop_reason: 'tool_use' }), msg]);
      await ctx.sleep(400);   // the call's line, a moment later: its own read of the file
      own.add([calls(own.id, 'feat/new', at + 1000, 'git switch -c feat/new && npm test'), msg]);
      await ctx.sleep(5000);   // past the hold, two looks at the disk and the alert's debounce
    } finally { clearInterval(watch); }
    out.ownSwitch = { looks: looks.length, shown: looks.filter(Boolean).length, alerts: (await saidTo(own.id)).length, headNow: (await sum(own.id)).headNow };
    ctx.assert.ok(out.ownSwitch.looks >= 20, `looked all along (${out.ownSwitch.looks})`);
    ctx.assert.deepEqual([out.ownSwitch.shown, out.ownSwitch.alerts, out.ownSwitch.headNow], [0, 0, 'feat/new'], 'its own switch: never shown, never said');

    // ---- an outside move on a chat at work, in its transcript and its HEAD: said once ----
    const moved2 = alone('gizmos', 'Gizmos, moved from outside', 'feat/gizmo', sleeps[3].pid);
    await ctx.waitFor(`window.peix.session(${JSON.stringify(moved2.id)})?.headNow === 'feat/gizmo'`, { what: 'the fourth chat, its checkout read', timeout: 15_000 });
    moved2.head('main');
    moved2.add(said(moved2.id, 'main', now(), 'The tests are still running.', 'tool_use'));
    await ctx.waitFor(`window.__alerts.some(a => a.sessionId === ${JSON.stringify(moved2.id)})`, { what: 'the outside move said', timeout: 15_000 });
    await ctx.sleep(2500);   // the other signal's judgement, and its debounce: no second word
    out.outside = { drift: (await sum(moved2.id)).drift, alerts: await saidTo(moved2.id) };
    ctx.assert.deepEqual([out.outside.drift?.from, out.outside.drift?.to], ['feat/gizmo', 'main'], 'the move on the summary');
    ctx.assert.deepEqual(out.outside.alerts, [['drift', 'Branch moved · gizmos', 'main now · was feat/gizmo']], 'said once');
    return out;
  } finally {
    for (const p of sleeps) p.kill();
    rmSync(root, { recursive: true, force: true });
  }
}
