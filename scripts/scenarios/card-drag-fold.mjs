// A card dragged onto another (2026-11-02, round XIV's I5): the menu's Fold into… by hand, and nothing folded until the box
// is answered. What this checks: a press that barely moves is still a click; a press on a control lifts nothing; a lift
// brings up the ghost, the card it came from faded; the chat under the pointer lights and the ghost says what letting go
// would do, or why not; Esc, its own card and nothing all put it back, and the release's click opens nothing; the list
// stands still under the hand and draws what came on the way out; a chat at work does not come up; the ends scroll and a
// shut lane's head held on opens; letting go asks (the box, its Fold grey until the handoff is in) and Cancel changes
// nothing; Fold then does what the menu's does. Reduced motion: no scale, no flight. The pinned section off (2026-11-25): on,
// a held card brings it up and a chat at work comes up to be pinned — pinned.mjs's.
import { spawn } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { makeFixture, toolLines } from '../fixture.mjs';

export const meta = { server: true, fake: true, fixture: 'auto', prefs: { prio: false, pinned: 1 } };
const sid = JSON.stringify;

export default async function (ctx) {
  const out = {};
  const [chatA, chatB] = ctx.fixture.chats;
  const cwd = realpathSync(tmpdir());

  const sleeps = Array.from({ length: 2 }, () => spawn('sleep', ['180'], { stdio: 'ignore' }));

  try {
    const card = id => `document.querySelector('#slist > .card[data-id="${id}"]')`;

    const at = sel =>
      ctx.evaluate(
        `(r => ({ x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }))((${sel}).getBoundingClientRect())`,
      );

    const title = id => at(`${card(id)}.querySelector('.title')`);

    const move = (spot, held = true) =>
      ctx.send('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x: spot.x,
        y: spot.y,
        button: held ? 'left' : 'none',
        buttons: held ? 1 : 0,
      });

    const press = spot =>
      ctx.send('Input.dispatchMouseEvent', {
        type: 'mousePressed',
        x: spot.x,
        y: spot.y,
        button: 'left',
        buttons: 1,
        clickCount: 1,
      });

    const release = spot =>
      ctx.send('Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        x: spot.x,
        y: spot.y,
        button: 'left',
        buttons: 0,
        clickCount: 1,
      });

    /** Pressed on one spot and carried off it far enough to come up. */
    const lift = async spot => {
      await move(spot, false);
      await press(spot);
      await move({ x: spot.x + 12, y: spot.y + 4 });
    };

    const ghost = () =>
      ctx.evaluate(
        `(g => g && { say: g.querySelector('.cdsay').textContent, go: g.classList.contains('go') })(document.querySelector('#cdghost'))`,
      );

    const marks = id =>
      ctx.evaluate(`(c => ['cdfrom', 'cdoff', 'cdover'].filter(k => c.classList.contains(k)))(${card(id)})`);

    const nothingUp = () =>
      ctx.waitFor(
        `!document.querySelector('#cdghost') && !document.querySelector('.card:is(.cdfrom, .cdoff, .cdover)') && !document.body.classList.contains('carddrag')`,
        { what: 'the ghost and the marks gone', timeout: 3000 },
      );

    const unchanged = async what => {
      const sessionA = await ctx.peix(`session(${sid(chatA.id)})`);
      const sessionB = await ctx.peix(`session(${sid(chatB.id)})`);

      ctx.assert.equal(!!sessionA.done, false, `${what}: the first chat is not done`);
      ctx.assert.equal(sessionB.terminal ?? null, null, `${what}: no drawer on the second`);
      ctx.assert.deepEqual([sessionA.links || [], sessionB.links || []], [[], []], `${what}: nothing tied`);
    };

    await ctx.waitFor(`!!${card(chatA.id)} && !!${card(chatB.id)}`, { what: 'both cards' });
    await ctx.settle();

    // ---- a press that barely moves is a click: no ghost ----
    let point = await title(chatB.id);

    await move(point, false);
    await press(point);
    await move({ x: point.x + 3, y: point.y + 1 });
    ctx.assert.equal(await ghost(), null, 'three pixels lift nothing');
    await release({ x: point.x + 3, y: point.y + 1 });
    await ctx.waitFor(`window.peix.state().current === ${sid(chatB.id)}`, { what: 'the click opened the chat' });
    await ctx.key('Digit0'); // home again: no chat open

    await ctx.waitFor(`!window.peix.state().current && !document.querySelector('#slist > .card.active')`, {
      what: 'no chat open, no open row',
    });

    await ctx.settle();

    // ---- a press on a control lifts nothing ----
    point = await at(`${card(chatA.id)}.querySelector('.act')`);
    await move(point, false);
    await press(point);
    await move({ x: point.x - 40, y: point.y + 30 });
    ctx.assert.equal(await ghost(), null, 'the ✓ is no handle');
    const far = await at(`document.querySelector('#sbar')`);

    await move(far);
    await release(far);

    // ---- up: the ghost by the pointer, the card it came from faded ----
    const was = await ctx.peix('state().current');

    point = await title(chatA.id);
    const hapticsWere = await ctx.evaluate(`window.peix.motion().filter(m => /^haptic/.test(m.kind)).length`);

    await lift(point);
    await ctx.settle();
    out.up = await ghost();
    ctx.assert.match(out.up?.say || '', /^Drop it on another chat/, 'it says what to do');
    ctx.assert.deepEqual(await marks(chatA.id), ['cdfrom'], 'the card it came from');

    ctx.assert.equal(
      await ctx.evaluate(`document.querySelector('#cdghost .ht').textContent`),
      'Two PRs mentioned',
      'the ghost names the chat',
    );

    await ctx.shot('1-up');

    // ---- over another chat: lit, and the ghost says it ----
    let dropPoint = await title(chatB.id);

    await move(dropPoint);
    out.over = await ghost();
    ctx.assert.deepEqual(out.over, { say: 'Fold into “Plain chat”', go: true });
    ctx.assert.deepEqual(await marks(chatB.id), ['cdover'], 'the chat under the pointer lights');

    ctx.assert.ok(
      (await ctx.evaluate(`window.peix.motion().filter(m => /^haptic/.test(m.kind)).length`)) >= hapticsWere + 2,
      'a bump at the lift and on the chat',
    );

    await ctx.settle();
    await ctx.shot('2-over');

    // ---- Esc puts it back; the release's click opens nothing ----
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

    await nothingUp();
    await move({ x: dropPoint.x + 2, y: dropPoint.y });
    ctx.assert.equal(await ghost(), null, 'held on, nothing comes back up');
    await release({ x: dropPoint.x + 2, y: dropPoint.y });
    await ctx.sleep(120);
    ctx.assert.equal(await ctx.evaluate(`document.querySelector('#handoff').open`), false, 'no box after Esc');
    ctx.assert.equal(await ctx.peix('state().current'), was, 'no chat opened by the release');
    // …and the next click is still a click (the swallow goes with the release)
    await unchanged('after Esc');

    // ---- its own card, and nothing at all: back, no box ----
    point = await title(chatA.id);
    await lift(point);
    await move(point);
    ctx.assert.match((await ghost()).say, /^Drop it on another chat/, 'its own card is no target');
    ctx.assert.deepEqual(await marks(chatA.id), ['cdfrom'], 'and does not light');
    await release(point);
    await nothingUp();
    await lift(point);
    await move(far);
    await release(far);
    await nothingUp();
    ctx.assert.equal(await ctx.evaluate(`document.querySelector('#handoff').open`), false, 'no box');
    await unchanged('let go on nothing');

    // ---- the list stands still under the hand, and draws what came on the way out ----
    point = await title(chatA.id);
    dropPoint = await title(chatB.id);
    await lift(point);
    await move(dropPoint);

    const order = () =>
      ctx.evaluate(`[...document.querySelectorAll('#slist > .card')].map(c => c.dataset.id + ':' + c.dataset.rank)`);

    const before = await order();

    await ctx.server.post(`/api/sessions/${chatB.id}/done`, { done: true });
    await ctx.waitFor(`window.peix.session(${sid(chatB.id)})?.done === true`, { what: 'the event in' });
    await ctx.sleep(250);
    ctx.assert.deepEqual(await order(), before, 'nothing moved under the pointer');
    await move({ x: far.x, y: far.y });
    await release(far);
    await nothingUp();
    await ctx.waitFor(`${card(chatB.id)}?.dataset.rank === 'done'`, { what: 'the held draw, on the way out' });
    await ctx.server.post(`/api/sessions/${chatB.id}/done`, { done: false });
    await ctx.waitFor(`${card(chatB.id)}?.dataset.rank !== 'done'`, { what: 'the chat back' });
    await ctx.settle();

    // ---- a chat asking cannot take it, and says why; one at work does not come up ----
    const ago = minutes => Date.now() - minutes * 60_000;

    const [asker, worker] = makeFixture(ctx.fixture.dir, [
      {
        cwd,
        title: 'Asking you something',
        prompt: 'go',
        reply: 'one question',
        at: new Date(ago(2)),
        live: {
          pid: sleeps[0].pid,
          startedAt: ago(30),
          status: 'waiting',
          waitingFor: 'input needed',
          statusAt: ago(1),
        },
      },
      {
        cwd,
        title: 'Hard at work',
        prompt: 'go',
        reply: 'on it',
        at: new Date(ago(2)),
        lines: id => toolLines({ id, cwd, name: 'Bash', input: { command: 'sleep 100' }, at: new Date(ago(1)) }),
        live: { pid: sleeps[1].pid, startedAt: ago(30), status: 'busy', statusAt: ago(1) },
      },
    ]).chats;

    await ctx.waitFor(
      `${card(asker.id)}?.classList.contains('asking') && window.peix.session(${sid(worker.id)})?.status === 'working'`,
      { what: 'the two live chats', timeout: 15_000 },
    );

    await ctx.settle();
    point = await title(chatA.id);
    dropPoint = await title(asker.id);
    await lift(point);
    await move(dropPoint);
    out.notHere = await ghost();
    ctx.assert.match(out.notHere.say, /^Not here — it is asking you something/, 'it says why');
    ctx.assert.equal(out.notHere.go, false);
    ctx.assert.deepEqual(await marks(asker.id), ['cdoff'], 'faded, not lit');
    ctx.assert.equal(await ctx.evaluate(`document.body.classList.contains('cdno')`), true, 'the pointer says no');
    await ctx.settle();
    await ctx.shot('3-not-here');
    await release(dropPoint);
    await nothingUp();
    ctx.assert.equal(await ctx.evaluate(`document.querySelector('#handoff').open`), false, 'no box');
    point = await title(worker.id);
    await lift(point);
    ctx.assert.equal(await ghost(), null, 'a chat at work does not come up');

    ctx.assert.match(
      await ctx.evaluate(`document.querySelector('.note')?.textContent || ''`),
      /^Not folded: it is at work/,
      'a note says why',
    );

    await release({ x: point.x + 12, y: point.y + 4 });
    await ctx.sleep(120);
    ctx.assert.notEqual(await ctx.peix('state().current'), worker.id, 'and the release opens nothing');

    // ---- the list's foot scrolls it; a shut lane's head held on opens ----
    const many = makeFixture(
      ctx.fixture.dir,
      Array.from({ length: 26 }, (_, index) => ({
        cwd,
        title: `Another chat ${index}`,
        prompt: 'a question',
        reply: 'an answer',
        at: new Date(ago(60 + index)),
      })),
    ).chats;

    await ctx.waitFor(`document.querySelectorAll('#slist > .card').length >= 28`, {
      what: 'a long list',
      timeout: 15_000,
    });

    await ctx.server.post(`/api/sessions/${many[0].id}/done`, { done: true });
    await ctx.waitFor(`document.querySelector('#slist > .gsep.lane[data-lane="done"]')`, { what: 'the Done lane' });
    await ctx.evaluate(`document.querySelector('#slist > .gsep.lane[data-lane="done"]').click()`);

    await ctx.waitFor(`document.querySelector('#slist > .gsep.lane[data-lane="done"]').classList.contains('shut')`, {
      what: 'the lane shut',
    });

    await ctx.settle();
    await ctx.evaluate(`document.querySelector('#slist').scrollTop = 0`);
    await ctx.sleep(60);
    point = await title(many[2].id); // one in the window: the fixture's two are at the list's foot now
    await lift(point);

    const foot = await ctx.evaluate(
      `(r => ({ x: Math.round(r.left + r.width / 2), y: Math.round(r.bottom - 8) }))(document.querySelector('#slist').getBoundingClientRect())`,
    );

    await move(foot);

    await ctx.waitFor(`(l => l.scrollTop + l.clientHeight >= l.scrollHeight - 2)(document.querySelector('#slist'))`, {
      what: 'the list scrolled to its end by the pointer at its foot',
      timeout: 40_000,
    });

    const head = await at(`document.querySelector('#slist > .gsep.lane[data-lane="done"]')`);

    await move(head);
    ctx.assert.match((await ghost()).say, /^Hold to open/, 'the head says so');

    await ctx.waitFor(
      `!document.querySelector('#slist > .gsep.lane[data-lane="done"]').classList.contains('shut') && !!${card(many[0].id)}`,
      { what: 'the lane opened under the hand', timeout: 5000 },
    );

    ctx.assert.deepEqual(await marks(many[2].id), ['cdfrom'], 'the marks survive the draw');
    ctx.assert.ok(await ctx.evaluate(`!!document.querySelector('#cdghost')`), 'still in the hand');

    await ctx.send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: 'Escape',
      code: 'Escape',
      windowsVirtualKeyCode: 27,
    });

    await nothingUp();
    await release(head);
    await ctx.sleep(80);
    await ctx.evaluate(`${card(chatA.id)}.scrollIntoView({ block: 'center' })`);
    await ctx.settle();

    // ---- let go on a chat: it asks. Fold stays grey until the handoff is in, Cancel changes nothing ----
    point = await title(chatA.id);
    dropPoint = await title(chatB.id);
    await lift(point);
    await move(dropPoint);
    await release(dropPoint);
    await nothingUp();
    await ctx.waitFor(`document.querySelector('#handoff').open`, { what: 'the box', timeout: 3000 });

    await ctx.waitFor(
      `!document.querySelector('#hoText').disabled && /^Another chat of mine/.test(document.querySelector('#hoText').value)`,
      { timeout: 10_000, what: 'the handoff in the box' },
    );

    out.box = await ctx.evaluate(
      `({ title: document.querySelector('#hoTitle').textContent, chats: [...document.querySelectorAll('#hoChats .hochat')].map(e => e.textContent), go: document.querySelector('#hoGo').textContent, off: document.querySelector('#hoGo').disabled })`,
    );

    ctx.assert.equal(out.box.title, 'Fold one chat into another?', 'a question');
    ctx.assert.deepEqual(out.box.chats, ['repo-aTwo PRs mentionedthen done', 'TPlain chatgets it, unsent']);
    ctx.assert.equal(out.box.off, false, 'Fold, once there is something to confirm');
    await unchanged('the box up');
    await ctx.settle();
    await ctx.shot('4-box');
    await ctx.evaluate(`document.querySelector('#hoCancel').click()`);
    await ctx.waitFor(`!document.querySelector('#handoff').open`, { what: 'the box closed' });
    await ctx.sleep(200);
    await unchanged('Cancel');

    // ---- reduced motion: nothing comes up or flies ----
    await ctx.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    point = await title(chatA.id);
    dropPoint = await title(chatB.id);
    await lift(point);
    await move(dropPoint);

    out.calm = await ctx.evaluate(
      `({ lift: document.querySelector('#cdghost').getAnimations().length, scale: getComputedStyle(${card(chatB.id)}).scale })`,
    );

    ctx.assert.deepEqual(out.calm, { lift: 0, scale: 'none' }, 'no pop, no scale');
    await release(dropPoint);

    ctx.assert.equal(
      await ctx.evaluate(`document.querySelector('#handoff').open && !document.querySelector('#cdghost')`),
      true,
      'the box at once',
    );

    await ctx.evaluate(`document.querySelector('#hoCancel').click()`);
    await ctx.waitFor(`!document.querySelector('#handoff').open`, { what: 'the box closed' });
    await ctx.send('Emulation.setEmulatedMedia', { features: [] });
    await ctx.settle();

    // ---- Fold: what the menu's does — the other chat opened, the handoff in its prompt unsent, the first done, both tied ----
    point = await title(chatA.id);
    dropPoint = await title(chatB.id);
    await lift(point);
    await move(dropPoint);
    await release(dropPoint);

    await ctx.waitFor(`document.querySelector('#handoff').open && !document.querySelector('#hoGo').disabled`, {
      timeout: 10_000,
      what: 'the box, ready',
    });

    await ctx.evaluate(`document.querySelector('#hoGo').click()`);
    await ctx.waitFor(`window.peix.state().current === ${sid(chatB.id)}`, { what: 'the chat it went into, opened' });

    await ctx.waitFor(`(s => s?.alive && s.terminal?.exited === null)(window.peix.session(${sid(chatB.id)}))`, {
      timeout: 20_000,
      what: 'its drawer resumed',
    });

    await ctx.waitFor(
      `[...document.querySelectorAll('#termBody .xterm-rows > div')].some(r => r.textContent.includes('❯ Another chat of mine, folded into this one'))`,
      { timeout: 15_000, what: 'the handoff in its prompt' },
    );

    await ctx.sleep(800);

    ctx.assert.equal(
      await ctx.evaluate(`window.peix.session(${sid(chatB.id)}).lastPrompt`),
      'what day is it?',
      'typed, not sent',
    );

    await ctx.waitFor(
      `(s => s?.done && s.links?.some(l => l.k === 'fold' && l.dir === 'out' && l.id === ${sid(chatB.id)}))(window.peix.session(${sid(chatA.id)}))`,
      { timeout: 10_000, what: 'the first chat done, tied to it' },
    );

    const term = (await ctx.peix(`session(${sid(chatB.id)})`)).terminal;

    if (term) await ctx.server.api(`/api/terminals/${term.id}`, { method: 'DELETE' });
    return out;
  } finally {
    for (const child of sleeps) child.kill();
  }
}
