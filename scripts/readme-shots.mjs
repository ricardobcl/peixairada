// The README's screenshots, from the made-up board (readme-board.mjs). Run it with
//   npm run scenario -- scripts/readme-shots.mjs
// and look at docs/shots/ before committing them. Not in scripts/scenarios/: it checks nothing, it draws. The clips are
// readme-clips.mjs's. WebP rather than PNG: the grain made each PNG megabytes.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chat, endBoard, kit, OUT, PAGE, VS, W, H } from './readme-board.mjs';
export { meta } from './readme-board.mjs';

export default async function (ctx) {
  const shots = [];
  const snap = async (name, clip) => {
    await ctx.settle(); await ctx.sleep(300);
    const r = await ctx.send('Page.captureScreenshot', { format: 'webp', quality: 92, ...(clip ? { clip: { scale: 1, ...clip } } : {}) });
    const f = join(OUT, `${name}.webp`); writeFileSync(f, Buffer.from(r.result.data, 'base64')); shots.push(f); ctx.log(`→ ${f}`);
  };
  const { theme, scale, rect, grid, board } = kit(ctx);
  const VSC = `127.0.0.1:${VS.port}`;
  try {
    mkdirSync(OUT, { recursive: true });
    for (const f of ['board-dark', 'board-light', 'simple-dark', 'simple-light', 'cards-dark', 'timeline-dark', 'picker-dark']) rmSync(join(OUT, `${f}.png`), { force: true });
    await scale(2);
    await ctx.send('Page.addScriptToEvaluateOnNewDocument', { source: PAGE });
    await ctx.server.post(`/api/sessions/${chat('Rewrite the getting-started guide').id}/done`, { done: true });
    await board();
    await ctx.waitFor(`document.querySelector('#slist > .gsep.lane.done.shut')`, { what: 'Done folded into its lane', timeout: 15000 });
    await ctx.waitFor(`window.peix.sessions().some(s => s.agents === 3)`, { what: 'the three sub-agents', timeout: 20000 });

    // 1 · the board: a project's chats, the chat, both themes
    for (const dark of [true, false]) { await theme(dark); await snap(`board-${dark ? 'dark' : 'light'}`); }

    // 2 · the chat list alone, up close — the four readings of a card's edge
    await theme(true);
    const list = await rect('#sessions');
    await snap('cards-dark', { ...list, height: Math.min(list.height, 640) });

    // 3 · ⌥⌘L, the launcher: its menu
    await ctx.key('KeyL'); await ctx.waitFor(`document.querySelector('#pick[open]')`, { what: 'the launcher' });
    await ctx.settle();
    const pick = await rect('#pick[open]'), pad = 28;
    await snap('launcher-dark', { x: pick.x - pad, y: Math.max(0, pick.y - pad), width: pick.width + 2 * pad, height: pick.height + 2 * pad });
    await ctx.key('Escape'); await ctx.evaluate(`document.querySelector('dialog[open]')?.close()`);

    // 4 · the timeline swelled: the pointer held at the window's left edge calls it out
    await ctx.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 1, y: 420 });
    await ctx.waitFor(`window.peix.state().timeline.shown && window.peix.state().timeline.k === 1`, { what: 'the timeline called out' });
    await ctx.sleep(300);
    await snap('timeline-dark', { ...list, height: Math.min(list.height, 640) });
    await ctx.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: W - 5, y: H / 2 });
    await ctx.waitFor(`!window.peix.state().timeline.shown`, { what: 'the timeline gone again' });

    // 5 · ⌥⌘A, every agent at once
    await ctx.key('KeyA'); await ctx.waitFor(`document.querySelector('#ov[open]')`, { what: 'the overview' });
    await ctx.sleep(1500);
    await snap('overview-dark');
    await ctx.key('Escape'); await ctx.evaluate(`document.querySelector('dialog[open]')?.close()`);

    // 6 · the ways it can look, smaller: each a switch or a key, the board reloaded on it
    await scale(1);
    const looks = [
      ['look-rail', { sessionsCompact: true }, true],
      ['look-tokyo', { sessionsCompact: false, cards: 'large', cardsEven: false, skinDark: 'tokyo-night' }, true],
      ['look-latte', { skinDark: null, skinLight: 'catppuccin-latte' }, false],
    ];
    for (const [name, prefs, dark] of looks) {
      await theme(dark); await board(prefs);
      await ctx.sleep(500); await snap(name);
    }
    await scale(2); await theme(true); await board({ skinLight: null });

    // 7 · home, ⌥⌘0: the board at a glance and the day
    await ctx.key('Digit0'); await ctx.waitFor(`document.querySelector('#home .hh')`, { what: 'the home' });
    await ctx.sleep(800); await snap('home-dark');
    await board();

    // 8 · in the chat: Claude in the drawer on the left; a zsh, the PR and VS Code Web on tabs on the right
    await ctx.key('KeyT'); await ctx.waitFor(`window.peix.state().tabs.some(k => k.startsWith('shell:'))`, { what: 'the zsh tab', timeout: 15000 });
    await ctx.key('KeyG'); await ctx.waitFor(`window.peix.state().tabs.some(k => k.startsWith('gh:'))`, { what: 'the PR tab' });
    await ctx.key('KeyC'); await ctx.waitFor(`window.peix.state().termSession === ${JSON.stringify(grid.id)} && !window.peix.state().termExited`, { what: 'Claude in the drawer', timeout: 20000 });
    await ctx.waitFor(`String(window.peix.screen(0)).includes('accept edits')`, { what: 'the drawer drawn', timeout: 15000 }).catch(() => ctx.log('the drawer\'s screen was not read back'));
    if (VS.child) {
      await ctx.key('KeyE'); await ctx.waitFor(`window.peix.state().tabs.some(k => k.startsWith('ide:'))`, { what: 'the VS Code tab', timeout: 20000 });
      await ctx.waitFor(`!!document.querySelector('#shotpane iframe')`, { what: 'VS Code Web over its half' });
      await ctx.sleep(9000);   // the workbench loads, finds the repo
      // Quick Open, from a click in the editor's area: ProductCard.css, its gutter showing the uncommitted edit
      const f = await rect('#shotpane iframe');
      await ctx.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: f.x + f.width * 0.65, y: f.y + f.height * 0.5, button: 'left', clickCount: 1 });
      await ctx.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: f.x + f.width * 0.65, y: f.y + f.height * 0.5, button: 'left', clickCount: 1 });
      await ctx.sleep(300);
      await ctx.send('Input.dispatchKeyEvent', { type: 'keyDown', modifiers: 4, key: 'p', code: 'KeyP', windowsVirtualKeyCode: 80 });
      await ctx.send('Input.dispatchKeyEvent', { type: 'keyUp', modifiers: 4, key: 'p', code: 'KeyP', windowsVirtualKeyCode: 80 });
      await ctx.sleep(800);
      await ctx.send('Input.insertText', { text: 'ProductCard.css' });
      await ctx.sleep(1200);
      await ctx.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
      await ctx.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
      await ctx.sleep(2500);
      // the address as the app would show it for a folder of the made-up user's, not the fixture's temp path
      await ctx.evaluate(`(k => window.peixPaneUrl(k, 'http://127.0.0.1:7332/?folder=' + encodeURIComponent('/Users/ada/work/storefront')))(window.peix.state().tabs.find(k => k.startsWith('ide:')))`);
    }
    // the PR's rows under the header: its state, its CI, whose move
    await ctx.evaluate(`document.querySelector('#prToggle').click()`);
    await ctx.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 600, y: 500 });
    await snap('chat-dark');

    // 9 · ⌥⌘D, the chat's changes beside it — the list folded to its rail (⌥⌘B), for the room
    await ctx.key('KeyB'); await ctx.waitFor(`window.peix.prefs().sessionsCompact`, { what: 'the rail' });
    await ctx.key('KeyD'); await ctx.waitFor(`window.peix.state().tab === 'changes' && document.querySelector('#chg .dfile, #chg .dl, #chg pre, #chg table')`, { what: 'the changes', timeout: 15000 }).catch(() => ctx.log('the changes did not show as expected'));
    await ctx.sleep(800);
    await snap('changes-dark');
    await ctx.key('KeyB');
    return { shots, vscode: !!VS.child, url: VSC };
  } finally {
    endBoard();
  }
}
