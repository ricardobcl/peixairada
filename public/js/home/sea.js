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
function seaFish(lvl, col, progress, lp) {
  const centerX = lp.x0 + lp.dir * 44 * progress;
  const centerY = lp.y0 - 24 * 4 * progress * (1 - progress);
  const vx = lp.dir * 44;
  const vy = -24 * 4 * (1 - 2 * progress);

  const th = Math.max(-0.75, Math.min(0.75, lp.dir > 0 ? Math.atan2(vy, vx) : Math.atan2(-vy, -vx)));
  const cosine = Math.cos(th);
  const sn = Math.sin(th);
  const SC = 0.85;
  const dark = lp.dark; // tilted along its path, never past ~43°

  for (let sy = Math.floor(centerY - 12); sy <= centerY + 12; sy++) {
    for (let sx = Math.floor(centerX - 15); sx <= centerX + 15; sx++) {
      if (sx < 0 || sx >= SEA_W || sy < 0 || sy >= SEA_H || sy > lp.y0 + 1) continue; // under the water line, unseen

      const dx = sx + 0.5 - centerX;
      const dy = sy + 0.5 - centerY;
      const pu = (dx * cosine + dy * sn) / SC;
      const pv = (-dx * sn + dy * cosine) / SC;

      let px = Math.floor(pu + 13);
      const py = Math.floor(pv + 5.5);

      if (lp.dir > 0) px = 25 - px;
      const ch = FISH[py]?.[px];

      if (!ch || ch === '.') continue;
      const index = sy * SEA_W + sx;

      lvl[index] = ch === 'o' ? 1 : 3;
      col[index] = ch === 'o' ? lp.eye : dark;
    }
  }

  // spray where it leaves the water and where it goes back in
  for (const [splash, xe] of [
    [progress / 0.14, lp.x0],
    [(progress - 0.86) / 0.2, lp.x0 + lp.dir * 44],
  ]) {
    if (splash < 0 || splash > 1) continue;

    for (let drop = 0; drop < 9; drop++) {
      const sx = Math.round(xe + (((drop * 37) % 9) - 4) * (0.6 + splash));
      const sy = Math.round(lp.y0 - 1 - ((drop * 53) % 5) * Math.sin(splash * Math.PI));

      if (sx >= 0 && sx < SEA_W && sy >= 0 && sy < SEA_H) {
        lvl[sy * SEA_W + sx] = 1 + (drop % 2);
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

function seaPaint(seconds, now) {
  const { s: scene, img, lut, masks, cell } = sea;
  const d32 = new Uint32Array(img.data.buffer);
  const n2 = cell * cell;
  const row = SEA_W * cell;

  scene.frame(seconds);

  if (sea.leap) {
    const progress = (now - sea.leap.at) / LEAP_MS;

    if (progress >= 1.25) sea.leap = null;
    else seaFish(scene.lvl, scene.col, Math.min(1, progress), sea.leap);
  }

  d32.fill(lut.ground);

  for (let gridRow = 0; gridRow < SEA_H; gridRow++) {
    for (let gridColumn = 0; gridColumn < SEA_W; gridColumn++) {
      const index = gridRow * SEA_W + gridColumn;
      const level = scene.lvl[index];

      if (!level) continue;

      const base = gridRow * cell * row + gridColumn * cell;
      const off = (scene.col[index] * 3 + level - 1) * n2;
      const mask = masks[level - 1];

      for (let dot = 0; dot < mask.length; dot++) d32[base + mask[dot].o] = lut.px[off + mask[dot].p];
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
  const glyph = document.createElement('canvas');

  glyph.width = glyph.height = cell;
  const gx = glyph.getContext('2d', { willReadFrequently: true });

  gx.textAlign = 'center';
  gx.textBaseline = 'middle';
  gx.font = `${cell * 1.3}px ui-monospace, Menlo, monospace`;
  gx.fillStyle = '#fff';
  const alpha = [];

  sea.masks = [...'·•●'].map(ch => {
    gx.clearRect(0, 0, cell, cell);
    gx.fillText(ch, cell / 2, cell / 2 + cell * 0.05);

    const pixels = gx.getImageData(0, 0, cell, cell).data;
    const mask = [];

    for (let pixel = 0; pixel < cell * cell; pixel++) {
      if (pixels[pixel * 4 + 3] > 8) {
        mask.push({ p: pixel, o: Math.floor(pixel / cell) * SEA_W * cell + (pixel % cell) });
      }
    }

    alpha.push(Float32Array.from({ length: cell * cell }, (_, pixel) => pixels[pixel * 4 + 3] / 255));
    return mask;
  });

  const hexRgb = hex => [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16));
  const gr = hexRgb(SEA_GROUND);

  const pack = ([red, g2, blue]) => ((255 << 24) | (blue << 16) | (g2 << 8) | red) >>> 0;
  const n2 = cell * cell;

  const px = new Uint32Array(SEA_PALETTE.length * 3 * n2);

  SEA_PALETTE.forEach((color, ci) => {
    const rgb = hexRgb(color);

    for (let level = 0; level < 3; level++) {
      for (let pixel = 0; pixel < n2; pixel++) {
        const coverage = alpha[level][pixel];

        px[(ci * 3 + level) * n2 + pixel] = pack(
          rgb.map((channel, index) => Math.round(gr[index] + (channel - gr[index]) * coverage)),
        );
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
