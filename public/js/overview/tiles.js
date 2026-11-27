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
    const response = await api('GET', `/api/tails?ids=${ids.map(encodeURIComponent).join(',')}`);
    let news = false;

    for (const [id, items] of Object.entries(response.tails || {})) {
      if (JSON.stringify(tails.get(id)) !== JSON.stringify(items)) news = true;
      tails.set(id, items);
    }

    if (news) then?.();
  } catch {
  } finally {
    tailsAsking = false;
  }
}

const firstLine = text =>
  String(text || '')
    .split('\n')[0]
    .slice(0, 60);

/** The tail as rows: each tool call with its result's first line (none yet: it is running), Claude's words, yours. */
function tailHtml(items = [], limit = 8, cwd = '') {
  const res = new Map(items.filter(item => item.kind === 'tool_result').map(item => [item.toolUseId, item]));
  const rows = [];

  const short = text => pathTail(text, cwd); // a path in the chat's folder from there, a long one its last two segments

  for (const item of items) {
    if (item.kind === 'tool_use' && (item.name === 'AskUserQuestion' || item.name === 'ExitPlanMode')) continue; // the question is the tile's own line
    if (item.kind === 'tool_use') {
      const result = res.get(item.toolUseId);

      rows.push(
        `<div class="tl ${result ? (result.isError ? 'err' : 'ok') : 'run'}"><i></i><b>${esc(toolName(item.name))}</b><span>${esc(short(item.text))}</span><em>${result ? esc(firstLine(short(result.text))) : '…'}</em></div>`,
      );
    } else if (item.kind === 'text') {
      rows.push(
        item.role === 'assistant'
          ? `<div class="say">${esc(item.text)}</div>`
          : `<div class="you">${esc(item.text)}</div>`,
      );
    } else if (item.kind === 'interrupt') rows.push('<div class="you">— interrupted</div>');
  }

  return rows.slice(-limit).join('') || '<div class="say none">nothing yet</div>';
}

/** A drawer drawn small in `host`, one per terminal and surface (`reg`), kept across redraws — a redraw moves it in. */
function mountMini(reg, host, term, crop = true) {
  let mini = reg.get(term.id);

  if (!mini) {
    const el = document.createElement('div');

    el.className = 'mini';
    el.inert = true; // a picture: its helper textarea out of the tab order (2026-10-12)

    const xt = new Terminal({
      cols: term.cols || 120,
      rows: term.rows || 30,
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
    const ws = new WebSocket(keyed(`${location.origin.replace(/^http/, 'ws')}/api/terminals/${term.id}/ws`));

    ws.binaryType = 'arraybuffer';

    ws.onmessage = event => {
      if (typeof event.data !== 'string') xt.write(new Uint8Array(event.data), () => cropSoon(mini));
      else if (JSON.parse(event.data).t === 'clear') xt.write('', () => xt.clear());
    };

    mini = { xt, ws, el, cols: xt.cols, rows: xt.rows, scale: 1, foot: 0 };
    reg.set(term.id, mini);
  }

  if (term.cols && term.rows && (term.cols !== mini.cols || term.rows !== mini.rows)) {
    mini.xt.resize(term.cols, term.rows);
    mini.cols = term.cols;
    mini.rows = term.rows;
  }

  if (mini.el.parentElement !== host) host.append(mini.el);
  mini.used = true;
  mini.crop = crop;

  requestAnimationFrame(() => {
    const sc = mini.el.querySelector('.xterm-screen');
    const width = sc?.offsetWidth;
    const hw = host.clientWidth;

    if (width && hw) mini.scale = Math.max(0.7, Math.min(1, hw / width));
    placeMini(mini);
  });

  return mini;
}

// Claude Code's own footer is out of the tile (2026-10-12): the tile keeps the bottom of the screen in view, and the
// bottom of Claude Code's is its prompt box, its status line (tokens, cost, the model) and the agents' list — what a
// glance at a tile does not want. The prompt box is the last two rules of ─ near the bottom; from the upper one down
// the screen is moved below the tile's edge, so what is over it — the work, the spinner — sits at the bottom. Not on
// a chat asking you, whose choices are where the prompt box was; no two rules, nothing moved.
function footRows(xt) {
  const buffer = xt.buffer.active;
  const rules = [];

  for (let row = xt.rows - 1; row >= Math.max(0, xt.rows - 30) && rules.length < 2; row--) {
    const line =
      buffer
        .getLine(buffer.viewportY + row)
        ?.translateToString(true)
        .trim() || '';

    if (line.length >= xt.cols * 0.5 && /^─+$/.test(line)) rules.push(row);
  }

  return rules.length === 2 ? xt.rows - rules[1] : 0;
}

function placeMini(mini) {
  mini.foot = mini.crop ? footRows(mini.xt) : 0;
  const rh = (mini.el.querySelector('.xterm-screen')?.offsetHeight || 0) / mini.xt.rows;

  mini.el.style.transform = `translateY(${Math.round(mini.foot * rh * mini.scale)}px) scale(${mini.scale})`;
}

const cropSoon = mini => {
  if (mini.cropT) return;

  mini.cropT = setTimeout(() => {
    mini.cropT = 0;
    if (mini.el.isConnected) placeMini(mini);
  }, 250);
};

/** The minis a redraw did not use: their sockets closed, their xterms gone. All of them with `all`. */
function sweepMinis(reg, all = false) {
  for (const [id, mini] of reg) {
    if (!all && mini.used) {
      mini.used = false;
      continue;
    }

    mini.ws.onmessage = null;
    mini.ws.close();
    mini.xt.dispose();
    mini.el.remove();
    reg.delete(id);
  }
}

const drawerOf = session =>
  session.terminal && session.terminal.exited === null && !session.terminal.shell ? session.terminal : null;

// ---- tiles: the board's panels laid out as Hyprland's (2026-10-10) ------------------------------------------------
// The only layout since 2026-10-14 (a switch, Settings → Board → tiles, before; main.tiles is in the markup). Its look
// is Hyprland's: gaps over a wallpaper of the theme's colours, square edges, each panel's border its project's colour
// (`tileEdge`, a black one grey) — faint, and whole on the panel the keys are in (`.kf`). (The stack, up to three
// live tiles of the chats asking or clauding beside the open one, ⌥⌘S, went on 2026-10-14 too.)
$('#chat').classList.add('kf'); // the chat wears the border at first

// the panel the keys are in wears the border: the list or the chat (a pointer press or a focus inside it)
const markKf = event => {
  const panel = event.target.closest?.('#sessions, #chat');

  if (!panel) return;
  for (const marked of document.querySelectorAll('main.tiles .kf')) if (marked !== panel) marked.classList.remove('kf');
  panel.classList.add('kf');
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
  const MARGIN = 60;
  const notch = state.notch;

  const panels = [$('#sessions'), $('#chat')];

  if (!notch && !panels.some(panel => panel.classList.contains('ncutp'))) return;
  const rects = panels.map(panel => panel.getBoundingClientRect()); // every read, then every write

  panels.forEach((panel, index) => {
    const rect = rects[index];

    const cut =
      !!notch &&
      rect.width > 0 &&
      rect.top < notch.top + BW &&
      rect.left < notch.right + BW &&
      rect.right > notch.left - BW;

    let ring = panel.querySelector(':scope > .ncut');

    if (!cut) {
      if (panel.classList.contains('ncutp')) {
        panel.classList.remove('ncutp');
        panel.style.clipPath = '';
        for (const part of panel.querySelectorAll(':scope > :is(.ncut, .ncap)')) part.remove();
      }

      return;
    }

    // in the panel's border box: the hole is the housing, its left to its right, down to its bottom; a side past the
    // panel's edge has no border of its own (the hole runs off that edge)
    const x1 = notch.left - rect.left;
    const x2 = notch.right - rect.left;
    const y2 = notch.top - rect.top;
    const leftInside = x1 > 0;
    const rightInside = x2 < rect.width;

    const holeLeft = leftInside ? x1 : -MARGIN;
    const holeRight = rightInside ? x2 : rect.width + MARGIN;
    const cornerRadius = Math.min(HOUSING_R, (holeRight - holeLeft) / 2, y2); // the cut's lower corners

    const flare = Math.max(0, Math.min(HOUSING_R, y2 - cornerRadius)); // the panel's corners beside the cut's top
    const hole = `${leftInside ? `M${holeLeft - flare} ${-MARGIN}V0A${flare} ${flare} 0 0 1 ${holeLeft} ${flare}` : `M${holeLeft} ${-MARGIN}`}V${y2 - cornerRadius}A${cornerRadius} ${cornerRadius} 0 0 0 ${holeLeft + cornerRadius} ${y2}H${holeRight - cornerRadius}A${cornerRadius} ${cornerRadius} 0 0 0 ${holeRight} ${y2 - cornerRadius}${rightInside ? `V${flare}A${flare} ${flare} 0 0 1 ${holeRight + flare} 0` : ''}V${-MARGIN}Z`;

    panel.classList.add('ncutp');
    panel.style.clipPath = `path(evenodd, 'M${-MARGIN} ${-MARGIN}H${rect.width + MARGIN}V${rect.height + MARGIN}H${-MARGIN}Z ${hole}')`;

    if (!ring) {
      ring = document.createElement('i');
      ring.className = 'ncut';
      panel.append(ring);
    }

    const left = leftInside ? x1 - BW : 0;
    const right = rightInside ? x2 + BW : rect.width; // the ring's outer edges, in the border box

    Object.assign(ring.style, {
      left: `${left - BW}px`,
      top: `${-BW}px`,
      width: `${right - left}px`,
      height: `${y2 + BW}px`,
      borderLeftWidth: leftInside ? `${BW}px` : '0',
      borderRightWidth: rightInside ? `${BW}px` : '0',
      borderBottomLeftRadius: leftInside ? `${cornerRadius + BW}px` : '0',
      borderBottomRightRadius: rightInside ? `${cornerRadius + BW}px` : '0',
    }); // the inner edge's radius is the cut's

    // the border round the panel's two corners at the top of the cut: a quarter of a ring each, the clip's own curve outside
    for (const [side, on, capLeft] of [
      ['l', leftInside, x1 - flare],
      ['r', rightInside, x2],
    ]) {
      let cap = panel.querySelector(`:scope > .ncap.${side}`);

      if (!on || !flare) {
        cap?.remove();
        continue;
      }

      if (!cap) {
        cap = document.createElement('i');
        cap.className = `ncap ${side}`;
        panel.append(cap);
      }

      Object.assign(cap.style, {
        left: `${capLeft - BW}px`,
        top: `${-BW}px`,
        width: `${flare}px`,
        height: `${flare}px`,
        [side === 'l' ? 'borderTopRightRadius' : 'borderTopLeftRadius']: `${flare}px`,
      });
    }
  });
}
