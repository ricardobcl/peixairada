// The README's clips (2026-10-16): each feature a few seconds on the made-up board (readme-board.mjs), never this
// Mac's — the page driven through the steps a hand would take, framed by Chrome's screencast (a frame each time the page
// is drawn anew), resampled to FPS, and made into an animated WebP by libwebp's img2webp (GitHub plays one in an <img>;
// a video in the repo it does not). Run it with
//   npm run scenario -- scripts/readme-clips.mjs --timeout 900000 [-- <clip>…]
// (every clip, or the ones named — CLIPS below) and look at docs/shots/clip-*.webp before committing them. Headless
// Chrome draws no pointer and no keys: a drawn pointer follows the moves sent, and the keys pressed show at the foot,
// in a popover of the script's own (the top layer, over a dialog once raised again). The PRs' clock runs fast here
// (PR_TTL_MS, PR_WATCH_MS) so a PR GitHub moved comes round within the clip.
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prLinkLine, replyLines, toolLines } from './fixture.mjs';
import { chat, endBoard, FABLE, kit, meta as board, OUT, PAGE, PRS, prsFile, VS } from './readme-board.mjs';

export const meta = { ...board, env: { ...board.env, PR_TTL_MS: '1000', PR_WATCH_MS: '2000' }, prefs: { ...board.prefs, cards: 'compact' } };

const CW = 1200, CH = 750;            // the window the clips are taken in, CSS px, at 1×: the frames' own size
const FPS = 15, HOLD = 1600;          // frames a second in the clip; the last one held before it loops
const IMG2WEBP = process.env.IMG2WEBP || ['/opt/homebrew/bin/img2webp', '/usr/local/bin/img2webp'].find(f => { try { return statSync(f).isFile(); } catch { return false; } }) || 'img2webp';

// The pointer and the keys, drawn over the page in a shadow root of their own (the page's rules reach none of it).
const KIT = `(() => { if (window.top !== window) return;
  const up = () => {
    const host = document.createElement('div'); host.id = 'clipkit'; host.popover = 'manual';
    host.style.cssText = 'position:fixed;inset:0;width:auto;height:auto;margin:0;padding:0;border:0;background:none;overflow:visible;pointer-events:none';
    const sh = host.attachShadow({ mode: 'open' });
    sh.innerHTML = \`<style>
      .cur { position: fixed; left: 0; top: 0; width: 22px; height: 30px; transform: translate(-100px, -100px); filter: drop-shadow(0 1px 2px rgb(0 0 0 / .5)); }
      .ring { position: fixed; left: 0; top: 0; width: 36px; height: 36px; margin: -18px 0 0 -18px; border-radius: 50%; border: 2px solid rgb(255 255 255 / .9); box-shadow: 0 0 0 2px rgb(0 0 0 / .25); opacity: 0; }
      .keys { position: fixed; left: 50%; bottom: 46px; transform: translateX(-50%); display: flex; gap: 6px; opacity: 0; }
      .keys b { font: 600 22px/1 -apple-system, "SF Pro Text", Helvetica, sans-serif; color: #fff; background: rgb(24 24 27 / .88); border: 1px solid rgb(255 255 255 / .22); border-radius: 9px; padding: 9px 13px; min-width: 18px; text-align: center; box-shadow: 0 6px 18px rgb(0 0 0 / .45); }
    </style>
    <svg class="cur" viewBox="0 0 22 30"><path d="M2 2 L2 24 L7.5 18.6 L11.2 27.4 L15 25.8 L11.4 17.2 L19 17.2 Z" fill="#fff" stroke="#111" stroke-width="1.6" stroke-linejoin="round"/></svg>
    <div class="ring"></div><div class="keys"></div>\`;
    document.body.append(host); host.showPopover();
    const cur = sh.querySelector('.cur'), ring = sh.querySelector('.ring'), keys = sh.querySelector('.keys');
    let kt = 0;
    window.__clip = {
      raise() { if (host.matches(':popover-open')) host.hidePopover(); host.showPopover(); },
      at(x, y) { cur.style.transform = 'translate(' + (x - 2) + 'px, ' + (y - 2) + 'px)'; },
      click(x, y) { ring.style.translate = x + 'px ' + y + 'px'; ring.animate([{ opacity: .9, scale: .4 }, { opacity: 0, scale: 1.3 }], { duration: 380, easing: 'ease-out' }); },
      keys(list) {
        this.raise(); keys.innerHTML = list.map(k => '<b>' + k + '</b>').join(''); keys.style.opacity = 1;
        clearTimeout(kt); kt = setTimeout(() => keys.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220 }).onfinish = () => { keys.style.opacity = 0; }, 1100);
      },
    };
  };
  if (document.body) up(); else addEventListener('DOMContentLoaded', up);
})()`;

const KEY_GLYPH = { KeyA: 'A', KeyB: 'B', KeyC: 'C', KeyD: 'D', KeyE: 'E', KeyG: 'G', KeyK: 'K', KeyL: 'L', KeyN: 'N', KeyT: 'T', Digit0: '0', Digit1: '1', Digit2: '2', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' };

export default async function (ctx) {
  const { theme, scale, rect, board: boardOn } = kit(ctx);
  const sleep = ctx.sleep;
  const work = mkdtempSync(join(realpathSync(tmpdir()), 'peix-clips-'));
  const made = [];
  let pointer = { x: CW * 0.7, y: CH * 0.55 };

  // ---- the hand: a pointer that glides, a click, a key pressed — each also drawn ----
  const at = async t => typeof t !== 'string' ? t : ctx.evaluate(`(r => r && ({ x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }))(document.querySelector(${JSON.stringify(t)})?.getBoundingClientRect())`);
  const move = async (to, ms = 520) => {
    const b = await at(to); if (!b) throw new Error(`nothing at ${to}`);
    const a = pointer, t0 = Date.now();
    for (let k = 0; k < 1;) {   // by the clock: a step is two calls, slower while the screencast runs
      k = Math.min(1, (Date.now() - t0) / ms);
      const e = k < .5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;   // ease in and out
      const x = Math.round(a.x + (b.x - a.x) * e), y = Math.round(a.y + (b.y - a.y) * e);
      await ctx.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
      await ctx.evaluate(`window.__clip?.at(${x}, ${y})`);
    }
    pointer = b; return b;
  };
  const click = async (to, { alt = false, ms } = {}) => {
    if (to) await move(to, ms);
    const { x, y } = pointer, modifiers = alt ? 1 : 0;
    await ctx.evaluate(`window.__clip?.click(${x}, ${y})`);
    if (alt) await ctx.evaluate(`window.__clip?.keys(['⌥', 'click'])`);
    await ctx.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1, modifiers });
    await sleep(60);
    await ctx.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1, modifiers });
  };
  const hot = async code => { await ctx.evaluate(`window.__clip?.keys(['⌥', '⌘', ${JSON.stringify(KEY_GLYPH[code] || code)}])`); await ctx.key(code); };
  const press = async (key, code = key, kc = 0) => {
    await ctx.evaluate(`window.__clip?.keys([${JSON.stringify({ Enter: '⏎', Escape: 'esc', ArrowDown: '↓', ArrowUp: '↑', ArrowRight: '→', ArrowLeft: '←' }[key] || key)}])`);
    await ctx.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: kc });
    await ctx.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: kc });
  };
  const typeText = async (text, every = 55) => { for (const ch of text) { await ctx.send('Input.insertText', { text: ch }); await sleep(every); } };
  const raise = () => ctx.evaluate(`window.__clip?.raise()`);
  const append = (c, lines) => appendFileSync(c.file, lines.map(l => JSON.stringify(l)).join('\n') + '\n');

  // ---- the camera: Chrome's screencast — a frame each time the page is drawn anew —, then resampled to FPS ----
  const record = async (name, steps) => {
    const frames = [];
    const off = ctx.on('Page.screencastFrame', p => { frames.push({ t: p.metadata.timestamp * 1000, data: p.data }); ctx.send('Page.screencastFrameAck', { sessionId: p.sessionId }).catch(() => {}); });
    await ctx.send('Page.startScreencast', { format: 'png', everyNthFrame: 1 });
    try { await steps(); await sleep(400); } finally { await ctx.send('Page.stopScreencast'); off(); }
    if (!frames.length) throw new Error(`no frames for ${name}`);
    // the picture on screen at each tick, a run of the same one a single frame held for the whole of it, the last HOLD
    const kept = [], step = 1000 / FPS, end = frames.at(-1).t;
    for (let t = frames[0].t, j = 0; t <= end; t += step) {
      while (j + 1 < frames.length && frames[j + 1].t <= t) j++;
      if (kept.at(-1)?.data === frames[j].data) kept.at(-1).ms += step; else kept.push({ data: frames[j].data, ms: step });
    }
    kept.at(-1).ms = HOLD;
    const dir = join(work, name); mkdirSync(dir, { recursive: true });
    const args = ['-loop', '0'];   // -min_size and -m 6 took a minute or more a clip for a tenth less
    kept.forEach((f, i) => { const file = join(dir, `${String(i).padStart(4, '0')}.png`); writeFileSync(file, Buffer.from(f.data, 'base64')); args.push('-d', String(Math.max(20, Math.round(f.ms))), '-lossy', '-q', '68', '-m', '4', file); });
    const out = join(OUT, `clip-${name}.webp`);
    writeFileSync(join(dir, 'args'), [...args, '-o', out].join('\n'));
    execFileSync(IMG2WEBP, [join(dir, 'args')], { stdio: 'ignore' });
    const size = statSync(out).size, seconds = kept.reduce((s, f) => s + f.ms, 0) / 1000;
    made.push({ name, frames: kept.length, seconds: +seconds.toFixed(1), kb: Math.round(size / 1024) });
    ctx.log(`→ ${out} — ${kept.length} frames (of ${frames.length} drawn), ${seconds.toFixed(1)} s, ${Math.round(size / 1024)} KB`);
  };

  // each clip from the board reloaded on its prefs, the chat named open (null: home), the pointer parked
  const start = async (open, prefs = {}) => {
    prefs = { prsOpen: false, ...prefs };
    await ctx.evaluate(`document.getElementById('shotpane')?.remove()`);   // VS Code Web's frames go first: their beforeunload
    await ctx.evaluate(`sessionStorage.clear()`);   // each clip from the board as it starts: a chat's tabs outlive a reload (keepTabs)
    await boardOn(prefs, open);
    await ctx.settle().catch(() => {});
    pointer = { x: Math.round(CW * 0.72), y: Math.round(CH * 0.6) };
    await ctx.evaluate(`window.__clip?.at(${pointer.x}, ${pointer.y})`);
    await sleep(600);
  };

  const card = t => `#slist > .card[data-id="${chat(t).id}"]`;
  const lines = c => readFileSync(c.file, 'utf8').trim().split('\n').map(l => JSON.parse(l));
  // the drawer typed into as a hand would, a key at a time, then ⏎
  const typeIn = async (text, g = 0, every = 45) => {
    const box = `document.querySelector('#termBody${g ? 'B' : ''} textarea')`;
    for (const ch of text) { await ctx.evaluate(`${box}.dispatchEvent(new InputEvent('input', { data: ${JSON.stringify(ch)}, inputType: 'insertText', bubbles: true }))`); await sleep(every); }
    await sleep(250);
    await ctx.evaluate(`${box}.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }))`);
  };
  const tabs = () => ctx.evaluate(`window.peix.state().tabs`);
  // VS Code Web's address as the app would show it for the made-up user's folder, not the fixture's temp path
  const vsAddress = () => ctx.evaluate(`(k => k && window.peixPaneUrl(k, 'http://127.0.0.1:7332/?folder=' + encodeURIComponent('/Users/ada/work/storefront')))(window.peix.state().tabs.find(k => k.startsWith('ide:')))`);
  const quickOpen = async file => {
    const f = await rect('#shotpane iframe:not([style*="display: none"])');
    await click({ x: Math.round(f.x + f.width * .62), y: Math.round(f.y + f.height * .55) }, { ms: 300 });
    await sleep(250);
    await ctx.evaluate(`window.__clip?.keys(['⌘', 'P'])`);
    await ctx.send('Input.dispatchKeyEvent', { type: 'keyDown', modifiers: 4, key: 'p', code: 'KeyP', windowsVirtualKeyCode: 80 });
    await ctx.send('Input.dispatchKeyEvent', { type: 'keyUp', modifiers: 4, key: 'p', code: 'KeyP', windowsVirtualKeyCode: 80 });
    await sleep(700); await typeText(file, 50); await sleep(900);
    await ctx.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    await ctx.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  };

  const CLIPS = {
    // ⌥⌘A, every live chat at once by what it wants from you; the arrows walk it, ⏎ opens one
    overview: async () => {
      await start(chat('Dark mode for the product grid').id);
      await record('overview', async () => {
        await sleep(700);
        await hot('KeyA'); await ctx.waitFor(`document.querySelector('#ov[open]')`, { what: 'the overview' }); await raise();
        await sleep(2000);
        await press('ArrowRight', 'ArrowRight', 39); await sleep(700);
        await press('ArrowRight', 'ArrowRight', 39); await sleep(900);
        await press('Enter', 'Enter', 13);
        await sleep(1700);
      });
    },

    // ⌥⌘L: chats, projects, PRs and every action, found by a word
    launcher: async () => {
      await start(chat('Dark mode for the product grid').id);
      await record('launcher', async () => {
        await sleep(600);
        await hot('KeyL'); await ctx.waitFor(`document.querySelector('#pick[open]')`, { what: 'the launcher' }); await raise();
        await sleep(1100);
        await typeText('node', 140); await sleep(1800);
        await press('Enter', 'Enter', 13);
        await sleep(2200);
      });
    },

    // ⌥⌘E: VS Code Web on the chat's folder, in the pane beside it — loaded once before, so the clip shows it as it is
    // when it has been opened before
    vscode: async () => {
      if (!VS.child) { ctx.log('no VS Code Web (the `code` CLI): no vscode clip'); return; }
      await start(chat('Dark mode for the product grid').id);
      await hot('KeyE'); await ctx.waitFor(`!!document.querySelector('#shotpane iframe')`, { what: 'VS Code Web over its half', timeout: 20000 });
      await sleep(10000);   // the workbench loads, finds the repo
      await quickOpen('ProductCard.css'); await sleep(2500);
      await ctx.key('KeyW'); await ctx.waitFor(`!window.peix.state().tabs.some(k => k.startsWith('ide:'))`, { what: 'the VS Code tab closed' });
      await ctx.settle().catch(() => {}); await sleep(800);
      await record('vscode', async () => {
        await sleep(600);
        await hot('KeyE'); await ctx.waitFor(`window.peix.state().tabs.some(k => k.startsWith('ide:'))`, { what: 'the VS Code tab' }); await vsAddress();
        await sleep(1500);
        await hot('KeyE'); await sleep(1100);   // again from it: its half fills the column
        await quickOpen('SearchBox.tsx'); await sleep(1500);
      });
      await hot('KeyE'); await sleep(400); await ctx.key('KeyW'); await sleep(400);
    },

    // a chat's pane: its transcript, then whatever it needs beside it on tabs — its changes, a shell — the column split
    pane: async () => {
      await start(chat('Watch the release build').id);
      await record('pane', async () => {
        await sleep(500);
        await click(`${card('Dark mode for the product grid')} .title`); await sleep(1200);
        await hot('KeyD'); await ctx.waitFor(`window.peix.state().tab === 'changes'`, { what: 'the changes', timeout: 15000 });
        await sleep(1600);
        await hot('KeyT'); await ctx.waitFor(`window.peix.state().tabs.some(k => k.startsWith('shell:'))`, { what: 'the zsh tab', timeout: 15000 });
        await ctx.waitFor(`[...document.querySelectorAll('#termBodyB .xterm-rows > div')].some(r => r.textContent.includes('%'))`, { what: 'the zsh prompt', timeout: 15000 }).catch(() => {});
        await sleep(300);
        await typeIn('git status --short', 1); await sleep(1500);
      });
    },

    // Claude Code itself in the drawer: resumed on ⌥⌘C, typed into as in any terminal
    terminal: async () => {
      await start(chat('Dark mode for the product grid').id);
      await record('terminal', async () => {
        await sleep(600);
        await hot('KeyC'); await ctx.waitFor(`window.peix.state().termSession === ${JSON.stringify(chat('Dark mode for the product grid').id)} && !window.peix.state().termExited`, { what: 'Claude in the drawer', timeout: 20000 });
        await ctx.waitFor(`String(window.peix.screen(0)).includes('accept edits')`, { what: 'the drawer drawn', timeout: 15000 }).catch(() => {});
        await sleep(1200);
        await typeIn('give the search box the same tokens'); await sleep(2800);
      });
    },

    // a PR's state, CI and whose move it is, in the header; its round under it; a round let go
    'pr-status': async () => {
      await start(chat('Bump Node to 22').id);
      await record('pr-status', async () => {
        await sleep(600);
        await click('#prToggle'); await sleep(1500);
        // GitHub moves: #92's CI goes green, polled within seconds here
        PRS['acme/infra#92'].commits = { nodes: [{ commit: { statusCheckRollup: { state: 'SUCCESS' } } }] };
        writeFileSync(prsFile, JSON.stringify(PRS));
        await ctx.waitFor(`window.peix.session(${JSON.stringify(chat('Bump Node to 22').id)})?.prs?.find(p => p.url.endsWith('/92'))?.checks === 'pass'`, { what: '#92 green', timeout: 15000 }).catch(e => ctx.log(e.message));
        await sleep(1500);
        await click('#shead .hmove', { alt: true }); await sleep(2000);
      });
    },

    // the board: a chat lands and moves to Ready, a question waits, a chat ticked done folds away
    board: async () => {
      await start(chat('Watch the release build').id);
      await record('board', async () => {
        await sleep(1600);
        const c = chat('Retry declined payments');
        append(c, replyLines({ id: c.id, cwd: c.cwd, text: 'Declined cards now retry three times with backoff — 1 s, 2 s, 4 s — before the error shows. The payment tests pass.', at: new Date(), model: FABLE }));
        await sleep(2000);
        await click(`${card('Flaky test in the refunds suite')} .act[data-act="done"]`); await sleep(1500);
        await click(`${card('Queue for invoice webhooks')} .title`); await sleep(1800);
      });
    },

    // a PR named in a chat becomes its chip — on the card, in the header — with its state from GitHub, no setup
    prs: async () => {
      const c = chat('Queue for invoice webhooks');
      await start(chat('Dark mode for the product grid').id, { prsOpen: true });
      const ask = lines(c).find(l => l.message?.content?.[0]?.name === 'AskUserQuestion').message.content[0].id;
      await record('prs', async () => {
        await sleep(700);
        await click(`${card('Queue for invoice webhooks')} .title`); await sleep(900);
        append(c, [{ ...lines(c).at(-1), type: 'user', uuid: randomUUID(), timestamp: new Date().toISOString(), message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: ask, content: 'User has answered your questions: "Which queue should the webhooks go through?"="SQS".' }] } }]);
        await sleep(1200);
        append(c, toolLines({ id: c.id, cwd: c.cwd, name: 'Bash', input: { command: 'gh pr create --draft --fill', description: 'Open the PR' }, result: 'https://github.com/acme/billing-api/pull/57', at: new Date() }));
        append(c, [prLinkLine({ id: c.id, url: 'https://github.com/acme/billing-api/pull/57' })]);
        await sleep(1200);
        append(c, replyLines({ id: c.id, cwd: c.cwd, text: 'Webhooks now go on SQS and the handler answers at once. Opened https://github.com/acme/billing-api/pull/57 as a draft.', at: new Date(), model: FABLE }));
        await ctx.waitFor(`window.peix.session(${JSON.stringify(c.id)})?.prs?.some(p => p.state)`, { what: '#57 answered', timeout: 15000 }).catch(() => ctx.log('#57 not answered'));
        await sleep(2400);
      });
    },
  };

  try {
    mkdirSync(OUT, { recursive: true });
    await scale(1, CW, CH); await theme(true);
    await ctx.send('Page.addScriptToEvaluateOnNewDocument', { source: PAGE });
    await ctx.send('Page.addScriptToEvaluateOnNewDocument', { source: KIT });
    ctx.on('Page.javascriptDialogOpening', () => ctx.send('Page.handleJavaScriptDialog', { accept: true }).catch(() => {}));   // a page's beforeunload
    await ctx.server.post(`/api/sessions/${chat('Rewrite the getting-started guide').id}/done`, { done: true });
    const want = ctx.args.length ? ctx.args : Object.keys(CLIPS);
    for (const name of want) { if (!CLIPS[name]) throw new Error(`no clip ${name} (${Object.keys(CLIPS).join(', ')})`); ctx.log(`clip ${name}`); await CLIPS[name](); }
    return { made, vscode: !!VS.child };
  } finally {
    if (process.env.CLIP_KEEP) ctx.log(`frames kept in ${work}`); else rmSync(work, { recursive: true, force: true });
    endBoard();
  }
}
