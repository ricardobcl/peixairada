// ---- live tiles: a chat drawn small — its drawer's screen, or the last few things it did (2026-10-10) --------------
// What the overview (⌥⌘A) shows of a chat that is not the open one (and the stack beside the chat, until 2026-10-14).
// A chat in a drawer here is its screen: an xterm of its own, attached read-only — it never sends a resize, so the
// PTY keeps the size the chat's own view gave it — at that size, scaled down to the tile within reason and cropped
// past that, the bottom left (Claude Code's prompt and a question's box) in view. Any other is its tail: the server's
// last few tool calls with their results, and its words (GET /api/tails).
const tails = new Map(); // chat id → the recent items the server keeps
let tailsAsking = false;

async function loadTails(ids, then) {
  if (!ids.length || tailsAsking) return;
  tailsAsking = true;

  // `then` only on news (2026-10-14): every 2 s while the overview is up, and a draw for nothing is a draw under a press
  try {
    const d = await api('GET', `/api/tails?ids=${ids.map(encodeURIComponent).join(',')}`);
    let news = false;

    for (const [id, items] of Object.entries(d.tails || {})) {
      if (JSON.stringify(tails.get(id)) !== JSON.stringify(items)) news = true;
      tails.set(id, items);
    }

    if (news) then?.();
  } catch {
  } finally {
    tailsAsking = false;
  }
}

const firstLine = t =>
  String(t || '')
    .split('\n')[0]
    .slice(0, 60);

/** The tail as rows: each tool call with its result's first line (none yet: it is running), Claude's words, yours. */
function tailHtml(items = [], n = 8, cwd = '') {
  const res = new Map(items.filter(x => x.kind === 'tool_result').map(x => [x.toolUseId, x]));
  const rows = [];

  const short = t => pathTail(t, cwd); // a path in the chat's folder from there, a long one its last two segments

  for (const x of items) {
    if (x.kind === 'tool_use' && (x.name === 'AskUserQuestion' || x.name === 'ExitPlanMode')) continue; // the question is the tile's own line
    if (x.kind === 'tool_use') {
      const r = res.get(x.toolUseId);

      rows.push(
        `<div class="tl ${r ? (r.isError ? 'err' : 'ok') : 'run'}"><i></i><b>${esc(toolName(x.name))}</b><span>${esc(short(x.text))}</span><em>${r ? esc(firstLine(short(r.text))) : '…'}</em></div>`,
      );
    } else if (x.kind === 'text') {
      rows.push(
        x.role === 'assistant' ? `<div class="say">${esc(x.text)}</div>` : `<div class="you">${esc(x.text)}</div>`,
      );
    } else if (x.kind === 'interrupt') rows.push('<div class="you">— interrupted</div>');
  }

  return rows.slice(-n).join('') || '<div class="say none">nothing yet</div>';
}

/** A drawer drawn small in `host`, one per terminal and surface (`reg`), kept across redraws — a redraw moves it in. */
function mountMini(reg, host, t, crop = true) {
  let m = reg.get(t.id);

  if (!m) {
    const el = document.createElement('div');

    el.className = 'mini';
    el.inert = true; // a picture: its helper textarea out of the tab order (2026-10-12)

    const xt = new Terminal({
      cols: t.cols || 120,
      rows: t.rows || 30,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      fontSize: 12,
      lineHeight: 1.1,
      scrollback: 0,
      cursorBlink: false,
      disableStdin: true,
      theme: xtTheme(),
    });

    xt.open(el);
    exactGlyphs(xt);
    const ws = new WebSocket(keyed(`${location.origin.replace(/^http/, 'ws')}/api/terminals/${t.id}/ws`));

    ws.binaryType = 'arraybuffer';

    ws.onmessage = e => {
      if (typeof e.data !== 'string') xt.write(new Uint8Array(e.data), () => cropSoon(m));
      else if (JSON.parse(e.data).t === 'clear') xt.write('', () => xt.clear());
    };

    m = { xt, ws, el, cols: xt.cols, rows: xt.rows, scale: 1, foot: 0 };
    reg.set(t.id, m);
  }

  if (t.cols && t.rows && (t.cols !== m.cols || t.rows !== m.rows)) {
    m.xt.resize(t.cols, t.rows);
    m.cols = t.cols;
    m.rows = t.rows;
  }

  if (m.el.parentElement !== host) host.append(m.el);
  m.used = true;
  m.crop = crop;

  requestAnimationFrame(() => {
    const sc = m.el.querySelector('.xterm-screen');
    const w = sc?.offsetWidth;
    const hw = host.clientWidth;

    if (w && hw) m.scale = Math.max(0.7, Math.min(1, hw / w));
    placeMini(m);
  });

  return m;
}

// Claude Code's own footer is out of the tile (2026-10-12): the tile keeps the bottom of the screen in view, and the
// bottom of Claude Code's is its prompt box, its status line (tokens, cost, the model) and the agents' list — what a
// glance at a tile does not want. The prompt box is the last two rules of ─ near the bottom; from the upper one down
// the screen is moved below the tile's edge, so what is over it — the work, the spinner — sits at the bottom. Not on
// a chat asking you, whose choices are where the prompt box was; no two rules, nothing moved.
function footRows(xt) {
  const b = xt.buffer.active;
  const rules = [];

  for (let y = xt.rows - 1; y >= Math.max(0, xt.rows - 30) && rules.length < 2; y--) {
    const l =
      b
        .getLine(b.viewportY + y)
        ?.translateToString(true)
        .trim() || '';

    if (l.length >= xt.cols * 0.5 && /^─+$/.test(l)) rules.push(y);
  }

  return rules.length === 2 ? xt.rows - rules[1] : 0;
}

function placeMini(m) {
  m.foot = m.crop ? footRows(m.xt) : 0;
  const rh = (m.el.querySelector('.xterm-screen')?.offsetHeight || 0) / m.xt.rows;

  m.el.style.transform = `translateY(${Math.round(m.foot * rh * m.scale)}px) scale(${m.scale})`;
}

const cropSoon = m => {
  if (m.cropT) return;

  m.cropT = setTimeout(() => {
    m.cropT = 0;
    if (m.el.isConnected) placeMini(m);
  }, 250);
};

/** The minis a redraw did not use: their sockets closed, their xterms gone. All of them with `all`. */
function sweepMinis(reg, all = false) {
  for (const [id, m] of reg) {
    if (!all && m.used) {
      m.used = false;
      continue;
    }

    m.ws.onmessage = null;
    m.ws.close();
    m.xt.dispose();
    m.el.remove();
    reg.delete(id);
  }
}

const drawerOf = s => (s.terminal && s.terminal.exited === null && !s.terminal.shell ? s.terminal : null);

// ---- tiles: the board's panels laid out as Hyprland's (2026-10-10) ------------------------------------------------
// The only layout since 2026-10-14 (a switch, Settings → Board → tiles, before; main.tiles is in the markup). Its look
// is Hyprland's: gaps over a wallpaper of the theme's colours, square edges, each panel's border its project's colour
// (`tileEdge`, a black one grey) — faint, and whole on the panel the keys are in (`.kf`). (The stack, up to three
// live tiles of the chats asking or clauding beside the open one, ⌥⌘S, went on 2026-10-14 too.)
$('#chat').classList.add('kf'); // the chat wears the border at first

// the panel the keys are in wears the border: the list or the chat (a pointer press or a focus inside it)
const markKf = e => {
  const p = e.target.closest?.('#sessions, #chat');

  if (!p) return;
  for (const x of document.querySelectorAll('main.tiles .kf')) if (x !== p) x.classList.remove('kf');
  p.classList.add('kf');
};

document.addEventListener('pointerdown', markKf, true);
document.addEventListener('focusin', markKf, true);

// At the notch (2026-10-10): a panel the camera housing reaches is cut round it — the panel's clip-path the hole, the
// housing's own shape, no gap (2026-10-11, later; the tiles' gap away before, the wallpaper showing in it), so the
// floating header has the room — and its border runs round the cut (.ncut: the left, bottom and right sides, the
// panel's own colour by `inherit`), as if the housing were a window of its own. Its lower corners are round, the
// housing's own (HOUSING_R, the radius of a MacBook's, by eye), the border's concentric with them, and so are the panel's two
// corners beside its top, as the screen flares into the housing there (.ncap, a quarter of border each; the flare's
// radius taken as the housing's own — 8 px of gap below the screen's edge, they cannot be concentric). From
// layoutNotch (the fill, every header drawn or resized).
function tileNotch() {
  const BW = TILE_BW;
  const M = 60;
  const n = state.notch;

  const panels = [$('#sessions'), $('#chat')];

  if (!n && !panels.some(p => p.classList.contains('ncutp'))) return;
  const rects = panels.map(p => p.getBoundingClientRect()); // every read, then every write

  panels.forEach((p, i) => {
    const r = rects[i];
    const cut = !!n && r.width > 0 && r.top < n.top + BW && r.left < n.right + BW && r.right > n.left - BW;

    let c = p.querySelector(':scope > .ncut');

    if (!cut) {
      if (p.classList.contains('ncutp')) {
        p.classList.remove('ncutp');
        p.style.clipPath = '';
        for (const x of p.querySelectorAll(':scope > :is(.ncut, .ncap)')) x.remove();
      }

      return;
    }

    // in the panel's border box: the hole is the housing, its left to its right, down to its bottom; a side past the
    // panel's edge has no border of its own (the hole runs off that edge)
    const x1 = n.left - r.left;
    const x2 = n.right - r.left;
    const y2 = n.top - r.top;
    const L = x1 > 0;
    const R = x2 < r.width;

    const a = L ? x1 : -M;
    const b = R ? x2 : r.width + M;
    const k = Math.min(HOUSING_R, (b - a) / 2, y2); // the cut's lower corners

    const t = Math.max(0, Math.min(HOUSING_R, y2 - k)); // the panel's corners beside the cut's top
    const hole = `${L ? `M${a - t} ${-M}V0A${t} ${t} 0 0 1 ${a} ${t}` : `M${a} ${-M}`}V${y2 - k}A${k} ${k} 0 0 0 ${a + k} ${y2}H${b - k}A${k} ${k} 0 0 0 ${b} ${y2 - k}${R ? `V${t}A${t} ${t} 0 0 1 ${b + t} 0` : ''}V${-M}Z`;

    p.classList.add('ncutp');
    p.style.clipPath = `path(evenodd, 'M${-M} ${-M}H${r.width + M}V${r.height + M}H${-M}Z ${hole}')`;

    if (!c) {
      c = document.createElement('i');
      c.className = 'ncut';
      p.append(c);
    }

    const left = L ? x1 - BW : 0;
    const right = R ? x2 + BW : r.width; // the ring's outer edges, in the border box

    Object.assign(c.style, {
      left: `${left - BW}px`,
      top: `${-BW}px`,
      width: `${right - left}px`,
      height: `${y2 + BW}px`,
      borderLeftWidth: L ? `${BW}px` : '0',
      borderRightWidth: R ? `${BW}px` : '0',
      borderBottomLeftRadius: L ? `${k + BW}px` : '0',
      borderBottomRightRadius: R ? `${k + BW}px` : '0',
    }); // the inner edge's radius is the cut's

    // the border round the panel's two corners at the top of the cut: a quarter of a ring each, the clip's own curve outside
    for (const [side, on, x] of [
      ['l', L, x1 - t],
      ['r', R, x2],
    ]) {
      let q = p.querySelector(`:scope > .ncap.${side}`);

      if (!on || !t) {
        q?.remove();
        continue;
      }

      if (!q) {
        q = document.createElement('i');
        q.className = `ncap ${side}`;
        p.append(q);
      }

      Object.assign(q.style, {
        left: `${x - BW}px`,
        top: `${-BW}px`,
        width: `${t}px`,
        height: `${t}px`,
        [side === 'l' ? 'borderTopRightRadius' : 'borderTopLeftRadius']: `${t}px`,
      });
    }
  });
}
