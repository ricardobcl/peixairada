// ---- home's sea (2026-10-12): an ASCII sunset at sea, the board's fish leaping in it ------------------------------
// Asked for as "a cool ascii art … like this one: ascii.rest/ocean-sunset". The scene is that piece's, ported from
// its TypeScript as it stands — the sun on the horizon past a pine headland, heaped cloud lit from below, a glitter
// path, swells rolling in, a sloop — shaded per cell on a 200 × 100 grid and drawn as a halftone of · • ● (a dot's
// size its brightness), each in the palette colour nearest its hue. What is the board's: the fish, from FISH, leaps
// out of the glitter now and then — and on a click — dark against the sun; and the drawing: each glyph drawn once
// into a mask, and every frame blitted into one ImageData, at 15 frames a second while home is on screen and the
// page in view; one still frame, the fish at the top of its leap, under reduced motion. At rest after a minute with
// no pointer, key or wheel on the page (2026-10-15, SEA_REST_MS): it ran at 13–21 % of a core, the dearest thing on
// the board; it stops on the frame it last drew, and any of them starts it again (seaStir).
//
// ocean-sunset.ts from https://github.com/bas3line/ascii — MIT License, Copyright (c) 2026 bas3line
// (https://github.com/bas3line). Permission is hereby granted, free of charge, to any person obtaining a copy of this
// software and associated documentation files (the "Software"), to deal in the Software without restriction,
// including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following
// conditions: The above copyright notice and this permission notice shall be included in all copies or substantial
// portions of the Software. THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
// INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
// NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
// SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
const SEA_PALETTE = [
  '#140f2c',
  '#1e1640',
  '#2b1c52',
  '#3d2266',
  '#552a74',
  '#6e2c78',
  '#90327c',
  '#b23c7c',
  '#d24f7a',
  '#ea6a78',
  '#c2306a',
  '#ff5d8f',
  '#ff8a9a',
  '#7a2456',
  '#f05d5e',
  '#f2804f',
  '#f99a43',
  '#ffb44a',
  '#ffcd62',
  '#ffe39a',
  '#fff5d8',
  '#a8323c',
  '#d2453c',
  '#e8603e',
  '#2f1a3e',
  '#47234f',
  '#63305c',
  '#874266',
  '#ac5b70',
  '#ff9e86',
  '#ffc4a2',
  '#ffdcc0',
  '#0e1230',
  '#171a46',
  '#232059',
  '#33286a',
  '#4a2f78',
  '#1c2a5c',
  '#2e4078',
  '#7d3f8f',
  '#a24f98',
  '#c8649e',
  '#de8bb5',
];

const SEA_GROUND = '#0b0817';

const makeSea = (() => {
  const WIDTH = 200;
  const HEIGHT = 100;

  const HZ = 56; // the horizon
  const SUN = [134, HZ - 4.5];
  const SR = 8.5; // the sun's radius
  const BOAT = 112; // the sloop's mast

  // wind chop on the swell: [dir x, dir z, wavenumber, slope, speed, offset]
  const CHOP = [
    [-0.45, 0.89, 22, 0.07, 2.1, 0.4],
    [0.5, 0.87, 37, 0.06, 2.9, 2.1],
    [-0.15, 0.99, 61, 0.05, 3.7, 4.4],
    [0.3, 0.95, 97, 0.04, 4.6, 1.3],
  ];

  const COVER = [0, 0.3, 0.6, 1];
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(value => value / 16 - 0.47);

  // pines on the headland: [x, height, half width at the foot]
  const PINES = [
    [2.5, 10, 2.6],
    [8, 13, 3],
    [13, 18, 3.6],
    [18.5, 11, 2.8],
    [24, 20, 3.8],
    [30, 12, 2.9],
    [35, 8, 2.3],
    [39.5, 5, 1.8],
  ];

  function hash(cellX, cellY) {
    let bits = Math.imul(cellX | 0, 374761393) + Math.imul(cellY | 0, 668265263);

    bits = Math.imul(bits ^ (bits >>> 13), 1274126177);
    return ((bits ^ (bits >>> 16)) >>> 0) / 4294967296;
  }

  // Value noise, wrapping every `period` lattice cells in x when period > 0.
  function noise(posX, posY, period) {
    const xi = Math.floor(posX);
    const yi = Math.floor(posY);

    const fx = posX - xi;
    const fy = posY - yi;

    const easeX = fx * fx * (3 - 2 * fx);
    const easeY = fy * fy * (3 - 2 * fy);

    let x0 = xi;
    let x1 = xi + 1;

    if (period) {
      x0 = ((xi % period) + period) % period;
      x1 = (x0 + 1) % period;
    }

    const topLeft = hash(x0, yi);
    const topRight = hash(x1, yi);
    const bottomLeft = hash(x0, yi + 1);
    const bottomRight = hash(x1, yi + 1);

    return (
      topLeft +
      (topRight - topLeft) * easeX +
      (bottomLeft - topLeft) * easeY +
      (topLeft - topRight - bottomLeft + bottomRight) * easeX * easeY
    );
  }

  function fbm(posX, posY, octaves, period) {
    let sum = 0;
    let weight = 0;
    let amp = 0.5;
    let frequency = 1;

    for (let octave = 0; octave < octaves; octave++) {
      sum += amp * noise(posX * frequency, posY * frequency, period * frequency);
      weight += amp;
      amp *= 0.5;
      frequency *= 2;
    }

    return sum / weight;
  }

  const clamp = value => (value < 0 ? 0 : value > 1 ? 1 : value);

  const smooth = (from, to, value) => {
    const progress = clamp((value - from) / (to - from));

    return progress * progress * (3 - 2 * progress);
  };

  const mix = (from, to, amount) => from + (to - from) * amount;
  const hex = color => [1, 3, 5].map(offset => parseInt(color.slice(offset, offset + 2), 16) / 255);

  // The sky's gradient, top to horizon, as [stop, r, g, b].
  const STOPS = [
    [0, 0.08, 0.1, 0.3],
    [0.3, 0.15, 0.1, 0.34],
    [0.52, 0.4, 0.15, 0.4],
    [0.72, 0.68, 0.27, 0.4],
    [0.88, 0.8, 0.32, 0.4],
    [1, 0.88, 0.4, 0.4],
  ];

  function gradient(position, out) {
    let stop = 1;

    while (stop < STOPS.length - 1 && position > STOPS[stop][0]) stop++;

    const before = STOPS[stop - 1];
    const after = STOPS[stop];

    const amount = clamp((position - before[0]) / (after[0] - before[0]));

    ((out[0] = mix(before[1], after[1], amount)),
      (out[1] = mix(before[2], after[2], amount)),
      (out[2] = mix(before[3], after[3], amount)));
  }

  // The headland: its skyline row at x, and the row where its foot meets the sea.
  const ridge = posX =>
    HZ +
    2.5 -
    11 * smooth(54, 32, posX) ** 0.7 -
    2.4 * Math.exp(-(((posX - 19) / 9) ** 2)) -
    2 * fbm(posX * 0.21, 3.3, 3, 0);

  const shore = posX => HZ + 1.5 + 5 * smooth(54, 4, posX);

  // a sea stack off the point
  const stack = posX =>
    posX > 52 && posX < 58 ? HZ - 3.5 - 1.6 * fbm(posX * 0.6, 8.1, 2, 0) + 2.5 * ((posX - 55) / 3) ** 4 : 1e9;

  function makeSea() {
    const PALETTE = SEA_PALETTE.map(hex);
    const CELLS = WIDTH * HEIGHT;

    const lvl = new Uint8Array(CELLS);
    const col = new Uint8Array(CELLS);

    const lut = new Uint8Array(32768).fill(255);

    const nearest = (red, green, blue) => {
      const slot =
        (Math.min(31, (red * 31.99) | 0) << 10) |
        (Math.min(31, (green * 31.99) | 0) << 5) |
        Math.min(31, (blue * 31.99) | 0);

      if (lut[slot] !== 255) return lut[slot];

      let best = 0;
      let bd = 1e9;

      for (let index = 0; index < PALETTE.length; index++) {
        const dr = PALETTE[index][0] - red;
        const dg = PALETTE[index][1] - green;
        const db = PALETTE[index][2] - blue;

        const distance = 0.3 * dr * dr + 0.5 * dg * dg + 0.2 * db * db;

        if (distance < bd) ((bd = distance), (best = index));
      }

      return (lut[slot] = best);
    };

    // dot and colour for one shaded cell
    const halftone = (index, row, column, cr, cg, cb, floor, fade, color) => {
      const peak = Math.max(cr, cg, cb, 1e-4);
      const level = clamp(floor + (1 - floor) * peak ** 0.85 * 0.95) * fade;
      const step = Math.max(0, Math.min(3, Math.round(level * 3 + BAYER[(row & 3) * 4 + (column & 3)])));

      lvl[index] = step;

      if (color) {
        // small dots are drawn brighter to make up their size, but the darkest
        // cells keep a dim colour, so the shadows stay deep instead of glittering
        const want = step ? Math.min(1, (level + 0.06) / COVER[step]) : 0;
        const scale = ((0.3 + 0.7 * want) * (0.4 + 0.6 * smooth(0.14, 0.5, level))) / peak;

        color[index] = nearest(clamp(cr * scale), clamp(cg * scale), clamp(cb * scale));
      }
    };

    // --- the clear sky, built once ------------------------------------------
    const sky = new Float32Array(HZ * WIDTH * 3);
    const rgb = [0, 0, 0];

    for (let row = 0; row < HZ; row++) {
      for (let column = 0; column < WIDTH; column++) {
        const posY = row + 0.5;

        const dx = column + 0.5 - SUN[0];
        const dy = (posY - SUN[1]) * 1.6;

        const distance = Math.sqrt(dx * dx + dy * dy);
        // rose and violet everywhere, burning gold only toward the sun
        const near = Math.exp(-Math.abs(dx) / 62);
        const depth = posY / HZ;

        gradient(depth ** (1.0 + 0.12 * (1 - near)), rgb);
        const warm = Math.exp(-Math.abs(dx) / 36) * smooth(0.45, 1, depth) * 0.9;

        ((rgb[0] = mix(rgb[0], 1.0 * mix(0.6, 1, depth), warm)),
          (rgb[1] = mix(rgb[1], 0.64 * mix(0.6, 1, depth), warm)),
          (rgb[2] = mix(rgb[2], 0.3, warm)));

        const fall = mix(1, 0.86 + 0.14 * near, smooth(0.6, 1, depth));
        const glow = Math.exp(-distance / 40) * 0.15 + Math.exp(-distance / 9) * 0.1;
        // high haze in long thin bands, so no stretch of sky is one flat tone
        const haze = 0.82 + 0.36 * fbm(column * 0.03, posY * 0.12, 3, 0);
        const index = (row * WIDTH + column) * 3;
        const vig = (1 - 0.08 * (Math.abs(column + 0.5 - 100) / 100) ** 2) * haze * fall;

        sky[index] = rgb[0] * (0.85 + 0.15 * near) * vig + glow;
        sky[index + 1] = rgb[1] * (0.65 + 0.35 * near) * vig + glow * 0.7;
        sky[index + 2] = rgb[2] * (1.1 - 0.2 * near) * vig + glow * 0.3;
      }
    }

    // --- the headland and its pines, built once ------------------------------
    const LANDW = 60;
    const LANDH = HZ + 10;

    const land = new Uint8Array(CELLS); // 1 rock, 2 pine

    const LR = new Float32Array(CELLS);
    const LG = new Float32Array(CELLS);
    const LB = new Float32Array(CELLS);

    // the rock's seaward edge on each row, for the light on the cliff face
    const edge = new Float32Array(LANDH).fill(-1);

    for (let row = 0; row < LANDH; row++) {
      const posY = row + 0.5;

      for (let column = 0; column < LANDW; column++) {
        if (posY >= ridge(column + 0.5) && posY < shore(column + 0.5)) edge[row] = column;
      }
    }

    for (let row = 0; row < LANDH; row++) {
      const posY = row + 0.5;

      for (let column = 0; column < LANDW; column++) {
        const index = row * WIDTH + column;
        const xc = column + 0.5;

        const t0 = ridge(xc);
        const st = stack(xc);

        let cr;
        let cg;
        let cb;

        if ((posY >= t0 && posY < shore(xc)) || (posY >= st && posY < HZ + 1.2)) {
          land[index] = 1;
          const isStack = !(posY >= t0 && posY < shore(xc));
          const top = isStack ? st : t0;
          // dark violet rock in rough strata
          const shade = 0.6 + 0.8 * fbm(column * 0.22, posY * 0.7, 3, 0);

          ((cr = 0.06 * shade), (cg = 0.042 * shade), (cb = 0.15 * shade));
          // the sun is low and to the right: slopes that drop toward it catch it
          const facing = clamp(0.4 + (isStack ? 0.5 : (ridge(xc + 1.2) - ridge(xc - 1.2)) * 0.45));
          const rim = smooth(top + 2.4, top + 0.4, posY) * facing;
          // the cliff face, warm where it turns to the sun, broken by crags
          const crag = smooth(0.35, 0.75, fbm(column * 0.4 + 3, posY * 0.5, 3, 0));

          const face = isStack
            ? smooth(53.5, 57.5, xc) * 0.7
            : edge[row] > 30
              ? Math.exp(-(edge[row] - column) / 4) * smooth(HZ + 5, HZ - 4, posY)
              : 0;

          const lit = clamp(Math.max(rim * 0.9, face * (0.3 + 0.7 * crag) * 0.75));

          ((cr = mix(cr, 0.95, lit)), (cg = mix(cg, 0.38, lit * 0.95)), (cb = mix(cb, 0.3, lit * 0.9)));
        }

        for (const [tx, th, tw] of PINES) {
          const tb = ridge(tx);
          const dy = posY - (tb - th);
          // a conifer: a spire that widens in tiers of branches
          const tier = (dy + th * 0.3) / 2.4;
          const half = (dy / th) * tw * (0.5 + 0.75 * (tier - Math.floor(tier))) + 0.35;
          const ex = xc - tx;

          if (dy >= 0 && posY < tb + 1.5 && Math.abs(ex) <= half) {
            land[index] = 2;
            const shade = 0.7 + 0.6 * hash(column * 13 + row, 5);

            ((cr = 0.045 * shade), (cg = 0.03 * shade), (cb = 0.1 * shade));
            // the right flank faces the sun
            const flank = ex > 0 && ex > half - 1.1 ? 0.3 + 0.3 * smooth(th, 0, dy) : 0;

            ((cr = mix(cr, 0.85, flank)), (cg = mix(cg, 0.3, flank)), (cb = mix(cb, 0.3, flank)));
          }
        }

        if (land[index]) ((LR[index] = cr), (LG[index] = cg), (LB[index] = cb));
      }
    }

    // a small sloop out on the water, dark against the glow left of the sun
    for (let row = HZ - 10; row < HZ + 4; row++) {
      const posY = row + 0.5;

      for (let column = BOAT - 6; column <= BOAT + 6; column++) {
        const index = row * WIDTH + column;
        const ex = column + 0.5 - BOAT;

        const hull = posY >= HZ + 1 && posY < HZ + 3 && Math.abs(ex - 0.3) < 4.6 - (posY - HZ - 1) * 1.3;
        const mast = Math.abs(ex) < 0.5 && posY >= HZ - 9 && posY < HZ + 1;
        const main = ex > 0 && posY >= HZ - 8.5 && posY < HZ + 0.5 && ex < 0.6 + (posY - (HZ - 8.5)) * 0.42;
        const jib = ex < 0 && posY >= HZ - 7 && posY < HZ + 0.5 && -ex < (posY - (HZ - 7)) * 0.36;

        if (hull || mast || main || jib) {
          land[index] = 3;
          // the sails are thin enough to glow a little with the sun behind them
          const glow = main ? 0.12 + 0.18 * smooth(0, 3.5, ex) : 0;

          ((LR[index] = 0.05 + glow), (LG[index] = 0.03 + glow * 0.45), (LB[index] = 0.09 + glow * 0.35));
        }
      }
    }

    // --- the cloud deck: a sheet of heaped cloud seen from below, laid out on
    // its own plane so it shrinks and flattens toward the horizon -------------
    const DECK_U = 640;
    const DECK_V = 128;

    const deck = new Float32Array(DECK_U * DECK_V);
    const deckLit = new Float32Array(DECK_U * DECK_V);

    const deckAt = (posU, posV) => {
      const warp = fbm(posU * 0.0125, posV * 0.06, 2, 8);
      const patch = fbm(posU * 0.00625, posV * 0.03 + 7, 2, 4);

      return fbm(posU * 0.040625 + warp * 1.6, posV * 0.3, 5, 26) + 0.25 * (patch - 0.5);
    };

    for (let deckRow = 0; deckRow < DECK_V; deckRow++) {
      for (let deckCol = 0; deckCol < DECK_U; deckCol++) {
        const density = deckAt(deckCol, deckRow);

        deck[deckRow * DECK_U + deckCol] = density;
        // the side of each heap that faces the horizon, and the sun, is lit
        deckLit[deckRow * DECK_U + deckCol] = clamp(0.5 + (density - deckAt(deckCol, deckRow + 2.5)) * 9);
      }
    }

    // thinning toward the zenith, ragged rather than a ruled line
    const thinTop = new Float32Array(WIDTH * HZ);

    for (let row = 0; row < HZ; row++) {
      for (let column = 0; column < WIDTH; column++) {
        thinTop[row * WIDTH + column] = fbm(column * 0.05 + 11, row * 0.15, 2, 0);
      }
    }

    // --- low bars over the horizon: a wrapping field that drifts -------------
    const CW = 720;

    const loCover = new Float32Array(CW * HZ);
    const loLit = new Float32Array(CW * HZ);

    const lower = (posX, posY) => {
      // long thin bars low over the horizon
      const bars = fbm(posX / 40, posY * 0.3, 4, CW / 40);
      const gaps = fbm(posX / 120, 5, 2, CW / 120);

      return (
        bars + 0.01 + 0.5 * (gaps - 0.5) - 0.35 * smooth(HZ - 14, HZ - 20, posY) - 0.25 * smooth(HZ - 4, HZ - 1, posY)
      );
    };

    for (let row = 0; row < HZ; row++) {
      for (let column = 0; column < CW; column++) {
        const posY = row + 0.5;
        const index = row * CW + column;
        const dl = lower(column, posY);

        loCover[index] = smooth(0.58, 0.66, dl);
        loLit[index] = clamp(0.5 + (dl - lower(column, posY + 1.2)) * 6);
      }
    }

    // this frame's sky, finished, for the sea to mirror
    const SKR = new Float32Array(HZ * WIDTH);
    const SKG = new Float32Array(HZ * WIDTH);
    const SKB = new Float32Array(HZ * WIDTH);

    const color = col;

    const frame = seconds => {
      const dUp = seconds * 0.9;
      const dLo = seconds * 1.7;

      for (let row = 0; row < HZ; row++) {
        const posY = row + 0.5;

        for (let column = 0; column < WIDTH; column++) {
          const index = row * WIDTH + column;
          const skyIndex = index * 3;

          let cr = sky[skyIndex];
          let cg = sky[skyIndex + 1];
          let cb = sky[skyIndex + 2];

          const dx = column + 0.5 - SUN[0];
          const dy = posY - SUN[1];
          let disc = 0;
          const ds = Math.sqrt(dx * dx + (dy / 0.9) ** 2);

          if (ds < SR + 0.6) {
            // the disc, a little flattened, hot at the core and redder at the rim
            const radial = ds / SR;

            disc = smooth(SR + 0.45, SR - 0.45, ds);
            const e4 = radial * radial * radial * radial;

            cr = mix(cr, 1.0, disc);
            cg = mix(cg, 0.95 - 0.2 * e4, disc);
            cb = mix(cb, 0.78 - 0.38 * e4, disc);
          }

          const near = Math.exp(-Math.sqrt(dx * dx + dy * dy * 2.5) / 45);
          const depth = posY / HZ;
          // the cloud deck, found on its plane: far rows are far away
          const distance = 58 / (HZ - posY + 2.5);
          // a band of heaped cloud mid-sky: clear above and clear in the low glow
          const far = smooth(4.8, 2.7, distance) * smooth(1.08, 1.7, distance);
          let cloud = 0;

          if (far > 0) {
            const su = dx * distance + dUp + 64200;
            const sv = (distance - 0.9) * 10;

            let iu = Math.floor(su);

            const fu = su - iu;
            const iv = Math.floor(sv);
            const fv = sv - iv;

            iu %= DECK_U;

            const iu1 = (iu + 1) % DECK_U;
            const a0 = iv * DECK_U;
            const a1 = a0 + DECK_U;

            const d0 = deck[a0 + iu] + (deck[a0 + iu1] - deck[a0 + iu]) * fu;
            const d1 = deck[a1 + iu] + (deck[a1 + iu1] - deck[a1 + iu]) * fu;
            const dd = d0 + (d1 - d0) * fv - 0.22 * (1 - far) * thinTop[index];
            const deckCover = smooth(0.56, 0.68, dd) * Math.sqrt(far);

            if (deckCover > 0.01) {
              cloud = deckCover;
              const l0 = deckLit[a0 + iu] + (deckLit[a0 + iu1] - deckLit[a0 + iu]) * fu;
              const l1 = deckLit[a1 + iu] + (deckLit[a1 + iu1] - deckLit[a1 + iu]) * fu;
              const light = l0 + (l1 - l0) * fv;
              // undersides glow gold toward the sun and rose away from it, and
              // more the lower they sit; thick cores stay dusk violet
              const az = Math.exp(-Math.abs(dx) / 60);
              const low = depth * depth;
              const thin = 1 - smooth(0.6, 0.76, dd);

              const bright = clamp(
                smooth(0.45, 0.85, light) ** 1.5 * (0.55 + 0.25 * low + 0.35 * az) + 0.3 * thin * az * low,
              );

              const warm = clamp(az * (0.1 + 1.2 * low));

              const hr = 1.0;
              const hg = mix(0.45, 0.72, warm);
              const hb = mix(0.52, 0.38, warm);

              const sr = mix(0.1, 0.2, depth);
              const sg = mix(0.065, 0.07, depth);
              const sb = mix(0.23, 0.27, depth);

              cr = mix(cr, mix(sr, hr, bright), deckCover);
              cg = mix(cg, mix(sg, hg, bright), deckCover);
              cb = mix(cb, mix(sb, hb, bright), deckCover);
            }
          }

          // the low bars, dark against the glow with burning edges
          const sx = column + dLo;
          const ix = Math.floor(sx);
          const fx = sx - ix;

          const i0 = row * CW + (ix % CW);
          const i1 = row * CW + ((ix + 1) % CW);

          // thinned over the sun and kept off the sky behind the headland
          const barCover =
            (loCover[i0] + (loCover[i1] - loCover[i0]) * fx) *
            (1 - 0.75 * Math.exp(-((dx / 13) ** 2))) *
            (1 - 0.85 * smooth(76, 50, column));

          if (barCover > 0.01) {
            cloud = Math.max(cloud, barCover);
            const light = loLit[i0] + (loLit[i1] - loLit[i0]) * fx;
            const rim = light ** 2 * (0.35 + 0.9 * near);
            const alpha = Math.min(1, barCover * 1.2) * 0.92;

            cr = mix(cr, 0.3 + 0.7 * rim, alpha);
            cg = mix(cg, 0.09 + 0.55 * rim, alpha);
            cb = mix(cb, 0.24 + 0.18 * rim, alpha);
          }

          // the first stars, high up where the sky has gone to indigo
          if (row < 22 && cloud < 0.05 && hash(column, row * 5 + 3) > 0.993) {
            const tw = 0.55 + 0.45 * Math.sin(seconds * (0.8 + hash(row, column) * 1.6) + hash(column, row) * 6.28);
            const st = tw * smooth(22, 4, row) * 0.75;

            ((cr = Math.max(cr, st * 0.95)), (cg = Math.max(cg, st * 0.85)), (cb = Math.max(cb, st)));
          }

          // the sea is too rough to mirror the disc whole: it gives back glitter
          const keep = 1 - 0.75 * disc;

          ((SKR[index] = cr * keep), (SKG[index] = cg * keep), (SKB[index] = cb * keep));
          if (land[index]) {
            ((cr = LR[index]), (cg = LG[index]), (cb = LB[index]));
            halftone(index, row, column, cr, cg, cb, 0.02, 1, color);
          } else halftone(index, row, column, cr, cg, cb, 0.05, 1, color);
        }
      }

      for (let row = HZ; row < HEIGHT; row++) {
        const posY = row + 0.5;
        // the sea: each cell is a facet of water that mirrors whatever part
        // of the sky its tilt points it at
        const dz = posY - HZ;
        const worldZ = 36 / dz; // distance out
        const rows = 36 / (dz * dz); // how much sea one row spans
        const swellAmt = smooth(8, 26, dz);
        const hot = Math.exp(-dz / 9);
        const pw = 3 + dz * 0.8; // the glitter path, wider as it comes toward us

        const fx = (0.9 / (1 + dz * 0.06)) * 0.35;
        const fy = 1.6 / (1 + dz * 0.05);

        const fres = 0.24 + 0.46 * Math.exp(-dz / 8);
        const depth = smooth(HZ, HEIGHT, posY);
        const fade = smooth(HEIGHT + 6, HEIGHT - 4, posY);

        for (let column = 0; column < WIDTH; column++) {
          const index = row * WIDTH + column;

          if (land[index]) {
            halftone(index, row, column, LR[index], LG[index], LB[index], 0.02, 1, color);
            continue;
          }

          const dx = column + 0.5 - SUN[0];
          const worldX = (column + 0.5 - 100) / dz;

          // the long swell rolls toward us; shorter chop rides on it
          const phase =
            13 * (worldZ + 0.05 * worldX) + 2.2 * fbm(worldX * 0.35 + 3, worldZ * 0.4, 2, 0) + seconds * 0.8;

          const wv = Math.sin(phase);
          const slope = Math.cos(phase);

          let sz = 0.11 * slope * clamp(1.4 / (13 * rows));
          let sxl = 0.015 * slope;

          for (let chop = 0; chop < CHOP.length; chop++) {
            const [kx, kz, kk, steep, speed, offset] = CHOP[chop];
            const ph = kk * (kx * worldX + kz * worldZ) - speed * seconds + offset;
            const tilt = Math.cos(ph) * steep * clamp(1.6 / (kk * rows));

            ((sz += tilt * kz), (sxl += tilt * kx));
          }

          let ry = Math.round(HZ - 1 - dz * 0.85 - 70 * sz);

          ry = ry < 0 ? 0 : ry > HZ - 1 ? HZ - 1 : ry;
          let rx = Math.round(column - 60 * sxl);

          rx = rx < 0 ? 0 : rx > WIDTH - 1 ? WIDTH - 1 : rx;
          const mirrorIndex = ry * WIDTH + rx;
          // violet near the horizon, deepening to indigo toward us
          // broken into long horizontal ripples, each giving back a little more
          // or less of the sky
          const rip = noise(column * fx * 1.4 + 13 - seconds * 0.15, posY * fy * 1.1 + seconds * 0.25, 0);
          const rf = fres * (0.5 + 1.1 * rip * rip);
          let cr = SKR[mirrorIndex] * rf * 0.8 + 0.03 - 0.01 * depth;
          let cg = SKG[mirrorIndex] * rf * 0.75 + 0.022;
          let cb = SKB[mirrorIndex] * rf + 0.095 + 0.03 * depth;

          // ripple facets that catch the sun: short dashes far out, longer
          // close in, each turning toward the sun and away again
          const facets =
            0.55 * noise(column * fx + seconds * 0.3, posY * fy * 1.3 - seconds * 0.4, 0) +
            0.45 * noise(column * fx * 1.7 - seconds * 0.4, posY * fy * 2 + seconds * 0.3 + 40, 0);

          const wave = Math.floor(phase / (2 * Math.PI));
          const crest = (0.5 + 0.5 * wv) ** 7 * swellAmt * smooth(0.4, 0.65, noise(worldX * 2.5 + 7, wave * 3.7, 0));
          const path = Math.exp(-((dx / pw) ** 2));
          const soft = Math.exp(-((dx / (pw * 1.6)) ** 2));

          // the near face of a swell is in shadow
          if (slope > 0) {
            const shadow = 1 - 0.7 * swellAmt * slope;

            ((cr *= shadow), (cg *= shadow), (cb *= shadow));
          }

          const th = 0.84 - 0.3 * path * (0.45 + 0.55 * hot);
          const glint = smooth(th, th + 0.08, facets) * (0.25 + 0.75 * path) * soft;
          const white = path * path * smooth(th + 0.04, th + 0.2, facets);

          cr += 0.2 * soft * (0.4 + hot) + glint * 1.1;
          cg += 0.1 * soft * (0.4 + hot) + glint * (0.55 + 0.3 * hot + 0.35 * white);
          cb += 0.04 * soft + glint * (0.2 + 0.25 * hot + 0.45 * white);
          // the crests catch it: gold in the path, rose out to the sides
          const catchL = crest * (0.15 + 0.85 * soft) * (0.6 + 0.6 * facets);

          ((cr += catchL * 0.95), (cg += catchL * mix(0.3, 0.7, soft)), (cb += catchL * mix(0.5, 0.3, soft)));
          // the sun's own column: a gap under the disc, then broken dashes
          const dash = smooth(0.4, 0.7, noise(column * 0.18 + seconds * 0.25, posY * 0.9 - seconds * 0.5, 0));

          const col =
            Math.exp(-((dx / (1.0 + dz * 0.22)) ** 2)) *
            Math.exp(-dz / 5) *
            (0.6 + 0.4 * facets) *
            smooth(0, 3, dz) *
            dash;

          ((cr += col), (cg += col * 0.8), (cb += col * 0.45));

          // the headland upside down in the water, broken by ripples
          if (column < LANDW + 4 && dz < 26) {
            const xs = column + 0.5 + 1.3 * Math.sin(posY * 1.1 + seconds * 1.2 + column * 0.05);
            const ix = Math.max(0, Math.min(LANDW - 1, xs | 0));
            const ft = shore(ix + 0.5);

            if (posY > ft) {
              const my = Math.floor(2 * ft - posY);

              if (my >= 0 && my < LANDH) {
                const landIndex = my * WIDTH + ix;

                if (land[landIndex]) {
                  const alpha = 0.8 * smooth(ft + 24, ft + 4, posY);

                  ((cr = mix(cr, LR[landIndex] * 0.8 + 0.02, alpha)),
                    (cg = mix(cg, LG[landIndex] * 0.7 + 0.015, alpha)),
                    (cb = mix(cb, LB[landIndex] * 0.85 + 0.05, alpha)));
                }
              }

              // a line of surf where rock meets water
              const foam =
                smooth(ft + 1.6, ft + 0.3, posY) *
                smooth(0.45, 0.8, noise(column * 0.5 - seconds * 0.4, seconds * 0.3, 0));

              ((cr += 0.5 * foam), (cg += 0.3 * foam), (cb += 0.35 * foam));
            }
          }

          // and the sloop's, shorter and more broken
          if (dz > 2.5 && dz < 14 && column > BOAT - 8 && column < BOAT + 8) {
            const ix = (column + 0.5 + 0.9 * Math.sin(posY * 1.3 + seconds * 1.6)) | 0;
            const landIndex = Math.floor(2 * (HZ + 3) - posY) * WIDTH + ix;

            if (land[landIndex] === 3) {
              const alpha = 0.7 * smooth(HZ + 14, HZ + 4, posY) * (0.6 + 0.4 * rip);

              ((cr = mix(cr, 0.04, alpha)), (cg = mix(cg, 0.03, alpha)), (cb = mix(cb, 0.1, alpha)));
            }
          }

          // a crisp dark line at the horizon for the sun to sit on
          if (dz < 1.5) ((cr *= 0.55), (cg *= 0.55), (cb *= 0.55));
          halftone(index, row, column, cr, cg, cb, 0.18, fade, color);
        }
      }
    };

    return { frame, lvl, col, land, nearest };
  }

  return makeSea;
})();
