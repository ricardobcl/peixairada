const sea = {
  s: null,
  cv: null,
  img: null,
  lut: null,
  masks: null,
  cell: 0,
  t0: 0,
  last: 0,
  raf: 0,
  leap: null,
  next: 0,
  stirAt: 0,
  rested: false,
};

const SEA_W = 200;
const SEA_H = 100;
const SEA_HZ = 56;
const SEA_FPS = 15;
const LEAP_MS = 1700;
const SEA_REST_MS = 60_000;

const seaStir = () => {
  sea.stirAt = performance.now();
  if (sea.rested && sea.cv?.isConnected && !state.current) seaRun();
};

for (const ev of ['pointermove', 'pointerdown', 'keydown', 'wheel']) {
  document.addEventListener(ev, seaStir, { capture: true, passive: true });
}

// the fish's cells for this moment of a leap: FISH at .85 scale, mirrored when it swims right, turned along its path
function seaFish(lvl, col, u, lp) {
  const x = lp.x0 + lp.dir * 44 * u;
  const y = lp.y0 - 24 * 4 * u * (1 - u);
  const vx = lp.dir * 44;
  const vy = -24 * 4 * (1 - 2 * u);

  const th = Math.max(-0.75, Math.min(0.75, lp.dir > 0 ? Math.atan2(vy, vx) : Math.atan2(-vy, -vx)));
  const c = Math.cos(th);
  const sn = Math.sin(th);
  const SC = 0.85;
  const dark = lp.dark; // tilted along its path, never past ~43°

  for (let sy = Math.floor(y - 12); sy <= y + 12; sy++) {
    for (let sx = Math.floor(x - 15); sx <= x + 15; sx++) {
      if (sx < 0 || sx >= SEA_W || sy < 0 || sy >= SEA_H || sy > lp.y0 + 1) continue; // under the water line, unseen

      const dx = sx + 0.5 - x;
      const dy = sy + 0.5 - y;
      const pu = (dx * c + dy * sn) / SC;
      const pv = (-dx * sn + dy * c) / SC;

      let px = Math.floor(pu + 13);
      const py = Math.floor(pv + 5.5);

      if (lp.dir > 0) px = 25 - px;
      const ch = FISH[py]?.[px];

      if (!ch || ch === '.') continue;
      const k = sy * SEA_W + sx;

      lvl[k] = ch === 'o' ? 1 : 3;
      col[k] = ch === 'o' ? lp.eye : dark;
    }
  }

  // spray where it leaves the water and where it goes back in
  for (const [p, xe] of [
    [u / 0.14, lp.x0],
    [(u - 0.86) / 0.2, lp.x0 + lp.dir * 44],
  ]) {
    if (p < 0 || p > 1) continue;

    for (let i = 0; i < 9; i++) {
      const sx = Math.round(xe + (((i * 37) % 9) - 4) * (0.6 + p));
      const sy = Math.round(lp.y0 - 1 - ((i * 53) % 5) * Math.sin(p * Math.PI));

      if (sx >= 0 && sx < SEA_W && sy >= 0 && sy < SEA_H) {
        lvl[sy * SEA_W + sx] = 1 + (i % 2);
        col[sy * SEA_W + sx] = lp.foam;
      }
    }
  }
}

function seaLeap(now) {
  const dir = Math.random() < 0.5 ? 1 : -1;

  sea.leap = {
    at: now,
    dir,
    x0: 134 - dir * 22 + Math.round((Math.random() - 0.5) * 20),
    y0: SEA_HZ + 12 + Math.round(Math.random() * 6),
    dark: sea.s.nearest(0.035, 0.025, 0.08),
    eye: sea.s.nearest(1, 0.85, 0.6),
    foam: sea.s.nearest(1, 0.87, 0.75),
  };

  sea.next = now + LEAP_MS + 16_000 + Math.random() * 24_000;
}

function seaPaint(t, now) {
  const { s, img, lut, masks, cell } = sea;
  const d32 = new Uint32Array(img.data.buffer);
  const n2 = cell * cell;
  const row = SEA_W * cell;

  s.frame(t);

  if (sea.leap) {
    const u = (now - sea.leap.at) / LEAP_MS;

    if (u >= 1.25) sea.leap = null;
    else seaFish(s.lvl, s.col, Math.min(1, u), sea.leap);
  }

  d32.fill(lut.ground);

  for (let r = 0; r < SEA_H; r++) {
    for (let x = 0; x < SEA_W; x++) {
      const k = r * SEA_W + x;
      const l = s.lvl[k];

      if (!l) continue;

      const base = r * cell * row + x * cell;
      const off = (s.col[k] * 3 + l - 1) * n2;
      const m = masks[l - 1];

      for (let i = 0; i < m.length; i++) d32[base + m[i].o] = lut.px[off + m[i].p];
    }
  }

  sea.cv.getContext('2d').putImageData(img, 0, 0);
  sea.frames = (sea.frames || 0) + 1;
}

function seaMount(cv) {
  if (sea.cv === cv && sea.s) {
    if (!sea.rested) seaRun();
    return;
  } // home drawn again (every few seconds): a sea at rest stays so

  sea.cv = cv;
  sea.s ||= makeSea();
  sea.stirAt = performance.now(); // home come up: a minute before it rests
  const cell = (sea.cell = Math.max(3, Math.round(2.6 * (devicePixelRatio || 1)))); // a dot of ~2.6 px: the sea ~520 px wide beside the facts

  cv.width = SEA_W * cell;
  cv.height = SEA_H * cell;
  cv.style.width = `${(SEA_W * cell) / (devicePixelRatio || 1)}px`;
  sea.img = new ImageData(cv.width, cv.height);
  // each glyph once, as the pixels it covers and how much of each
  const g = document.createElement('canvas');

  g.width = g.height = cell;
  const gx = g.getContext('2d', { willReadFrequently: true });

  gx.textAlign = 'center';
  gx.textBaseline = 'middle';
  gx.font = `${cell * 1.3}px ui-monospace, Menlo, monospace`;
  gx.fillStyle = '#fff';
  const alpha = [];

  sea.masks = [...'·•●'].map(ch => {
    gx.clearRect(0, 0, cell, cell);
    gx.fillText(ch, cell / 2, cell / 2 + cell * 0.05);

    const a = gx.getImageData(0, 0, cell, cell).data;
    const m = [];

    for (let p = 0; p < cell * cell; p++) {
      if (a[p * 4 + 3] > 8) m.push({ p, o: Math.floor(p / cell) * SEA_W * cell + (p % cell) });
    }

    alpha.push(Float32Array.from({ length: cell * cell }, (_, p) => a[p * 4 + 3] / 255));
    return m;
  });

  const hexRgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const gr = hexRgb(SEA_GROUND);

  const pack = ([r, g2, b]) => ((255 << 24) | (b << 16) | (g2 << 8) | r) >>> 0;
  const n2 = cell * cell;

  const px = new Uint32Array(SEA_PALETTE.length * 3 * n2);

  SEA_PALETTE.forEach((c, ci) => {
    const rgb = hexRgb(c);

    for (let l = 0; l < 3; l++) {
      for (let p = 0; p < n2; p++) {
        const a = alpha[l][p];

        px[(ci * 3 + l) * n2 + p] = pack(rgb.map((v, i) => Math.round(gr[i] + (v - gr[i]) * a)));
      }
    }
  });

  sea.lut = { px, ground: pack(gr) };
  sea.t0 = performance.now();
  sea.next = sea.t0 + 5000;

  if (REDUCED.matches) {
    seaLeap(sea.t0);
    sea.leap.at = sea.t0 - LEAP_MS / 2;
    seaPaint(20, sea.t0);
    sea.leap = null;
    return;
  }

  seaRun();
}

function seaRun() {
  if (sea.raf || REDUCED.matches) return;
  sea.rested = false;

  const step = now => {
    sea.raf = 0;
    if (!sea.cv?.isConnected || state.current) return; // home gone: the loop ends, showHome starts it again

    if (now - sea.stirAt > SEA_REST_MS && !sea.leap) {
      sea.rested = true;
      return;
    } // nobody about: the last frame stays

    if (document.visibilityState === 'visible' && now - sea.last >= 1000 / SEA_FPS - 2) {
      sea.last = now;
      if (!sea.leap && now >= sea.next) seaLeap(now);
      seaPaint((now - sea.t0) / 1000, now);
    }

    sea.raf = requestAnimationFrame(step);
  };

  sea.raf = requestAnimationFrame(step);
}
