// What each frame of a drawer showed (2026-11-05): a rAF, and a message posted from it, which lands after that frame's
// paint and reads no layout. Against Claude Code's real screens it counts how often the screen changed; against the fake
// with FAKE_SIZE_MARK (scripts/fakeclaude.mjs) each frame also says the size it was drawn for, so a stale screen (drawn
// for another size than the grid it is on) and a torn one (a mark missing, a frame landing in a repaint) are facts, not a
// reading of pixels. For the pixels themselves, `burst` in scripts/webkit.mjs.
//   await ctx.watchFrames(0); …act…; const { frames, sends } = await ctx.frames();
//   frameTrouble(frames) → { stale: [...], torn: [...] }; looks(frames) → each change of what was on the screen
// A body for `npm run webkit` takes FRAME_WATCH as it is: `const w = (${FRAME_WATCH})(0); …; w.stop()`.
import xterm from '@xterm/headless';

const { Terminal } = xterm;

export const FRAME_WATCH = `(g => {
  const body = g ? '#termBodyB' : '#termBody', out = [], sends = [], ch = new MessageChannel(), t0 = performance.now(); let run = true;
  const send = WebSocket.prototype.send;
  WebSocket.prototype.send = function (d) {
    try { const m = typeof d === 'string' && JSON.parse(d); if (m && m.t === 'resize') sends.push({ t: Math.round(performance.now() - t0), cols: m.cols, rows: m.rows }); } catch {}
    return send.call(this, d);
  };
  ch.port1.onmessage = () => {
    const rows = [...document.querySelectorAll(body + ' .xterm-rows > div')].map(r => r.textContent), x = rows.map(r => r.trim());
    let first = -1, last = -1, n = 0; x.forEach((t, i) => { if (t) { n++; if (first < 0) first = i; last = i; } });
    let h = 0; for (const c of x.join('|').replace(/elapsed\\s+\\S+\\s+\\S+/, '')) h = (h * 31 + c.charCodeAt(0)) | 0;
    const claim = t => /<<(\\d+x\\d+)>>/.exec(t || '')?.[1] || null, grid = window.peix.grid?.(g);
    out.push({ t: Math.round(performance.now() - t0), n, first, last, rows: rows.length, cols: grid?.cols ?? null, hold: !!grid?.hold, top: claim(rows[0]), bottom: claim(rows[rows.length - 1]), h, text: out.at(-1)?.h === h ? undefined : x });   // the rows, when they changed
  };
  const f = () => { if (!run) return; ch.port2.postMessage(0); requestAnimationFrame(f); };
  requestAnimationFrame(f);
  return { t0, stop() { run = false; WebSocket.prototype.send = send; return { frames: out, sends, t0 }; } };   // t0: the page's clock at the start
})`;

/** Frames the fake's marks say were wrong: `stale`, drawn for a size that is not the grid they are on; `torn`, one mark
 *  without the other, or two that differ. A frame of no text at all is `blank`; one with text and no mark (a zsh, a page
 *  between two drawers) is no drawing of the fake's, and not judged. `top: false`: the fake draws its live region alone (no
 *  FAKE_TUI=fullscreen), with its mark at the bottom only. */
export function frameTrouble(frames, { top = true } = {}) {
  const stale = [], torn = [], blank = [];
  for (const f of frames) {
    if (!f.n) { blank.push(f); continue; }
    const mark = top ? f.top : f.bottom;
    if (!f.top && !f.bottom) continue;
    if (!mark || (top && f.top !== f.bottom)) { torn.push(f); continue; }
    if (f.cols != null && mark !== `${f.cols}x${f.rows}`) stale.push(f);
  }
  return { stale, torn, blank };
}

/** Each change of what the frames showed, the first frame as the start: its time, its grid, the rows that have text. */
export function looks(frames) {
  const out = []; let p = null;
  for (const f of frames) { if (!p || f.h !== p.h || f.rows !== p.rows || f.cols !== p.cols) out.push(f); p = f; }
  return out;
}

/** A drawer's screen as its holder has it: a socket of our own, which sends nothing and so sizes nothing, its first frame the
 *  snapshot, read at the holder's size into a terminal of our own. One row a string, trailing blanks gone. */
export async function holderRows(server, id) {
  const t = (await server.terminals()).find(x => x.id === id);
  if (!t) throw new Error(`no terminal ${id}`);
  const data = await new Promise((res, rej) => {
    const ws = new WebSocket(server.ws(`api/terminals/${id}/ws`)); ws.binaryType = 'arraybuffer';
    const timer = setTimeout(() => { ws.close(); rej(new Error(`no snapshot from ${id}`)); }, 5000);
    ws.onmessage = e => { if (typeof e.data === 'string') return; clearTimeout(timer); ws.close(); res(new Uint8Array(e.data)); };
    ws.onerror = () => { clearTimeout(timer); rej(new Error(`no socket to ${id}`)); };
  });
  const term = new Terminal({ cols: t.cols, rows: t.rows, scrollback: 0, allowProposedApi: true });
  await new Promise(res => term.write(data, res));
  const b = term.buffer.active, rows = [];
  for (let y = 0; y < t.rows; y++) rows.push(b.getLine(b.baseY + y)?.translateToString(true) || '');
  term.dispose();
  return { cols: t.cols, rows: rows.map(r => r.replace(/\s+$/, '')), raw: new TextDecoder().decode(data) };
}
