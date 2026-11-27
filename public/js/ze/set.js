// ---- the set: Barcelos across the Cávado, in stone and tile (H2). Painted once; each sky lights it when it bakes it.
const ZE_RIGS = [
  {
    name: 'sunset',
    amb: [0.92, 0.74, 0.76],
    hz: [0.66, 0.22, 0.06],
    haze: [1.0, 0.42, 0.34],
    lift: [0.012, 0.0, 0.02],
    gain: [1.03, 0.99, 0.98],
    sat: 1.1,
    dust: 'gold',
    festa: 0.5,
    cloud: [0.53, [0.1, 0.03, 0.16], [0.95, 0.32, 0.3], 0.5, 0.12],
    fog: [1.0, 0.5, 0.38, 0.2],
    rays: 0.95,
    bloom: 0.52,
    shadow: [0.25, 3.3, 0.62],
    gnd: [0.5, 0.33, 0.4],
    key: [-0.1, -0.42, -0.9],
    tAmb: [0.46, 0.3, 0.4],
    keyC: [2.1, 1.05, 0.5],
    rim: 1.5,
    water: [0.2, 0.07, 0.15],
    lamp: 0.3,
    win: 0.36,
    wet: 0.22,
    glint: 2.4,
    sunX: 400,
  },
  {
    name: 'blue hour',
    amb: [0.56, 0.62, 0.92],
    hz: [0.5, 0.24, 0.08],
    haze: [0.2, 0.22, 0.5],
    lift: [0.0, 0.0, 0.018],
    gain: [1, 1, 1.03],
    sat: 1.12,
    dust: 'fire',
    festa: 1,
    cloud: [0.56, [0.03, 0.04, 0.11], [0.12, 0.16, 0.36], 0.55, 0.3],
    fog: [0.34, 0.34, 0.62, 0.16],
    rays: 0.18,
    bloom: 0.78,
    shadow: [-0.5, 3.0, 0.46],
    gnd: [0.26, 0.28, 0.46],
    key: [0.42, -0.55, -0.7],
    tAmb: [0.4, 0.46, 0.78],
    keyC: [0.75, 0.9, 1.5],
    rim: 1.1,
    water: [0.03, 0.05, 0.15],
    lamp: 1,
    win: 1,
    wet: 0.3,
    glint: 0.5,
    sunX: 590,
  },
  {
    name: 'storm',
    amb: [0.66, 0.4, 0.42],
    hz: [0.46, 0.22, 0.08],
    haze: [0.4, 0.06, 0.05],
    lift: [0.016, 0, 0],
    gain: [1.03, 0.97, 0.95],
    sat: 1.05,
    dust: 'ember',
    festa: 0.3,
    cloud: [0.44, [0.04, 0.008, 0.018], [0.34, 0.06, 0.05], 0.74, 0.8],
    fog: [0.55, 0.1, 0.07, 0.28],
    rays: 0,
    bloom: 0.72,
    shadow: [0.0, 0, 0],
    gnd: [0.26, 0.12, 0.14],
    key: [0.0, 0.6, 0.5],
    tAmb: [0.42, 0.2, 0.2],
    keyC: [1.0, 0.34, 0.12],
    rim: 0.8,
    water: [0.08, 0.015, 0.02],
    lamp: 0.75,
    win: 0.8,
    wet: 0.3,
    glint: 0,
    sunX: 360,
  },
  {
    name: 'rain',
    amb: [0.6, 0.68, 0.84],
    hz: [0.6, 0.34, 0.14],
    haze: [0.27, 0.33, 0.43],
    lift: [0, 0.004, 0.012],
    gain: [0.99, 1, 1.03],
    sat: 0.98,
    dust: 'none',
    festa: 0.8,
    cloud: [0.38, [0.05, 0.065, 0.09], [0.14, 0.17, 0.23], 0.92, 0.9],
    fog: [0.4, 0.47, 0.58, 0.34],
    rays: 0,
    bloom: 0.66,
    shadow: [0.0, 0, 0],
    gnd: [0.32, 0.38, 0.48],
    key: [0.0, -0.8, 0.4],
    tAmb: [0.52, 0.58, 0.68],
    keyC: [0.2, 0.24, 0.3],
    rim: 0.4,
    water: [0.05, 0.08, 0.12],
    lamp: 1,
    win: 0.95,
    wet: 0.85,
    glint: 0,
    sunX: 360,
  },
  {
    name: 'dawn',
    amb: [0.94, 0.84, 0.86],
    hz: [0.68, 0.42, 0.14],
    haze: [1.0, 0.8, 0.72],
    lift: [0.012, 0.008, 0.012],
    gain: [1.02, 1, 0.98],
    sat: 1.04,
    dust: 'pollen',
    festa: 0.12,
    cloud: [0.55, [0.6, 0.48, 0.62], [1.2, 0.78, 0.66], 0.42, 0.35],
    fog: [1.0, 0.86, 0.8, 0.5],
    rays: 0.8,
    bloom: 0.46,
    shadow: [-0.3, 3.5, 0.5],
    gnd: [0.56, 0.46, 0.54],
    key: [0.25, -0.3, -0.92],
    tAmb: [0.86, 0.74, 0.76],
    keyC: [1.7, 1.15, 0.68],
    rim: 1.3,
    water: [0.24, 0.22, 0.34],
    lamp: 0.1,
    win: 0.3,
    wet: 0.24,
    glint: 2.4,
    sunX: 296,
  },
];

const zgRng = s => () => (s = (s * 16807) % 2147483647) / 2147483647;

const zgCanvas = S => {
  const c = document.createElement('canvas');

  c.width = Math.round(ZE_W * S);
  c.height = Math.round(ZE_H * S);
  const x = c.getContext('2d');

  x.scale(S, S);
  return [c, x];
};

/** The sky, as zeScene paints it, down to the water — its sun risen to stand on the town, and what burns in a canvas of its own. */
function zgPaintSky(P) {
  const [c, x] = zgCanvas(1);
  const [e, y] = zgCanvas(1);
  const bot = ZE_WATER + 16;

  const sky = x.createLinearGradient(0, 0, 0, bot);

  P.stops.forEach((col, i) => sky.addColorStop([0, 0.32, 0.7, 1][i], col));
  x.fillStyle = sky;
  x.fillRect(0, 0, ZE_W, ZE_H);

  if (P.glow) {
    const r = x.createRadialGradient(360, ZE_WATER, 20, 360, ZE_WATER, 460);

    r.addColorStop(0, `${P.glow}99`);
    r.addColorStop(1, `${P.glow}00`);
    x.fillStyle = r;
    x.fillRect(0, 0, ZE_W, ZE_H);
  }

  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

  for (let i = 0; i < P.stars; i++) {
    const sy = rnd() ** 1.6 * 420;

    x.globalAlpha = 0.25 + 0.75 * (1 - sy / 420) * rnd();
    x.fillStyle = '#fff6e0';
    x.fillRect(rnd() * ZE_W, sy, rnd() < 0.15 ? 2 : 1.2, rnd() < 0.15 ? 2 : 1.2);
  }

  x.globalAlpha = 1;

  if (P.moon === 'crescent' || P.moon === 'faint') {
    x.globalAlpha = P.moon === 'faint' ? 0.45 : 1;
    x.fillStyle = '#fff3c4';
    x.beginPath();
    x.arc(118, 132, 26, 0, Math.PI * 2);
    x.fill();
    x.globalAlpha = 1;
    x.fillStyle = sky;
    x.beginPath();
    x.arc(130, 124, 24, 0, Math.PI * 2);
    x.fill();
  }

  if (P.moon === 'full') {
    const r = x.createRadialGradient(590, 150, 10, 590, 150, 90);

    r.addColorStop(0, 'rgba(220, 230, 255, .35)');
    r.addColorStop(1, 'rgba(220, 230, 255, 0)');
    x.fillStyle = r;
    x.fillRect(490, 50, 200, 200);
    x.fillStyle = '#e8eeff';
    x.beginPath();
    x.arc(590, 150, 24, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = '#c9d2ee';

    for (const [mx, my, mr] of [
      [583, 145, 5],
      [597, 158, 3.5],
      [594, 141, 2.5],
    ]) {
      x.beginPath();
      x.arc(mx, my, mr, 0, Math.PI * 2);
      x.fill();
    }
  }

  if (P.sun) {
    const S = P.sun;
    const sy0 = S.y > 860 ? S.y : S.y - 74;
    const sun = x.createLinearGradient(0, sy0 - S.r, 0, sy0 + S.r);

    sun.addColorStop(0, S.a);
    sun.addColorStop(1, S.b);
    x.save();
    x.beginPath();
    x.arc(S.x, sy0, S.r, 0, Math.PI * 2);
    x.clip();
    x.fillStyle = sun;
    x.fillRect(S.x - S.r, sy0 - S.r, S.r * 2, S.r * 2);

    if (S.bands) {
      x.fillStyle = sky;
      for (let i = 0; i < 6; i++) x.fillRect(S.x - S.r, sy0 - 60 + i * 18, S.r * 2, 2 + i * 2);
    }

    x.restore();
    y.drawImage(c, 0, 0);
    y.globalCompositeOperation = 'destination-in';
    y.fillStyle = '#000';
    y.beginPath();
    y.arc(S.x, sy0, S.r, 0, Math.PI * 2);
    y.fill();
    y.globalCompositeOperation = 'source-over';
  }

  return [c, e];
}

/** The town: rows of houses on the far bank, and zeTown's landmarks in stone. Its lit windows in a canvas of their own. */
function zgPaintTown() {
  const S = 1.5;
  const [c, x] = zgCanvas(S);
  const [e, y] = zgCanvas(S);
  const r = zgRng(11);
  const B = ZE_WATER;

  const R = (col, a, b, w, h) => {
    x.fillStyle = col;
    x.fillRect(a, b, w, h);
  };

  const lit = (a, b, w, h, col = '#ffd27a') => {
    y.fillStyle = col;
    y.fillRect(a, b, w, h);
  };

  const WALL = ['#e6dcca', '#d9ccb5', '#cdc2b2', '#e8d7b6', '#cbc4c0', '#dfc9ae', '#c9bba4'];
  const ROOF = ['#a8553a', '#97492f', '#b4623e', '#8e4530'];

  const house = (hx, w, h) => {
    const top = B - h;
    const wall = WALL[(r() * WALL.length) | 0];
    const roof = ROOF[(r() * ROOF.length) | 0];
    const rh = 5 + r() * 7;

    R(wall, hx, top, w, h);
    R('rgba(40, 25, 40, .28)', hx + w - Math.max(3, w * 0.3), top, Math.max(3, w * 0.3), h);
    x.fillStyle = roof;
    x.beginPath();
    x.moveTo(hx - 2, top + 1);
    x.lineTo(hx + w * 0.3, top - rh);
    x.lineTo(hx + w * 0.72, top - rh);
    x.lineTo(hx + w + 2, top + 1);
    x.fill();
    R('rgba(30, 15, 30, .3)', hx + w * 0.55, top - rh, w * 0.45 + 2, rh + 1);

    for (let wy = top + 4; wy < B - 6; wy += 9) {
      for (let wx = hx + 3; wx < hx + w - 4; wx += 7) {
        if (r() < 0.12) continue;
        const on = r() < 0.3;

        R(on ? '#5a4632' : '#2a2a38', wx, wy, 3, 5);
        if (on) lit(wx, wy, 3, 5);
      }
    }

    if (r() < 0.4) R('#6f4a3a', hx + w * 0.7, top - rh - 5, 3, 7);
  };

  for (let hx = -14; hx < 740;) {
    const w = 18 + r() * 24;

    house(hx, w, 34 + r() * 44);
    hx += w - 2;
  }

  const G1 = '#9d9182';
  const G2 = '#7e7366';
  const G3 = '#b5a998';
  const OFF = 30;
  const T = (a, b, w, h, col = G1) => R(col, a, b - OFF, w, h);

  T(206, 642, 36, 150);
  T(232, 642, 10, 150, G2);
  T(202, 636, 44, 7, G3);
  for (let i = 0; i < 4; i++) T(202 + i * 12.3, 626, 7, 11, G3); // the Torre da Porta Nova

  for (const [a, b] of [
    [220, 662],
    [229, 704],
    [216, 744],
  ]) {
    T(a, b, 4, 8, '#3a3440');
    lit(a, b - OFF, 4, 8);
  }

  T(262, 712, 58, 80, G3);
  T(306, 712, 14, 80, G1);
  x.fillStyle = '#94553d';
  x.beginPath();
  x.moveTo(258, 713 - OFF);
  x.lineTo(291, 688 - OFF);
  x.lineTo(324, 713 - OFF);
  x.fill(); // the Igreja Matriz…
  x.fillStyle = '#3a3440';
  x.beginPath();
  x.arc(291, 728 - OFF, 5, 0, 7);
  x.fill();
  y.fillStyle = '#ffcf7a';
  y.beginPath();
  y.arc(291, 728 - OFF, 5, 0, 7);
  y.fill();
  T(322, 662, 22, 130);
  T(336, 662, 8, 130, G2);
  x.fillStyle = '#7f4a38';
  x.beginPath();
  x.moveTo(319, 663 - OFF);
  x.lineTo(333, 644 - OFF);
  x.lineTo(347, 663 - OFF);
  x.fill();
  T(330, 676, 6, 10, '#2c2832'); // …and its tower
  x.fillStyle = G2;
  x.beginPath();

  for (const [a, b] of [
    [352, 792],
    [352, 718],
    [361, 718],
    [361, 708],
    [373, 708],
    [373, 724],
    [386, 724],
    [386, 704],
    [398, 704],
    [398, 720],
    [410, 720],
    [410, 792],
  ]) {
    x.lineTo(a, b - OFF);
  }

  x.fill(); // the Paço dos Condes
  T(364, 674, 7, 36, G2);
  T(362, 670, 11, 5);
  T(391, 668, 7, 38, G2);
  T(389, 664, 11, 5);
  for (const a of [358, 378, 396]) T(a, 734, 7, 12, '#2c2832');
  T(422, 702, 46, 90, G3);
  T(456, 702, 12, 90);
  x.fillStyle = '#b8ad9b';
  x.beginPath();
  x.arc(445, 703 - OFF, 23, Math.PI, 0);
  x.fill();
  x.fillStyle = '#8f8473';
  x.beginPath();
  x.arc(445, 703 - OFF, 23, Math.PI * 1.55, 0);
  x.lineTo(445, 703 - OFF);
  x.fill(); // Bom Jesus da Cruz
  T(441, 670, 8, 14, G3);
  x.fillStyle = G3;
  x.beginPath();
  x.arc(445, 671 - OFF, 5, Math.PI, 0);
  x.fill();
  T(444, 654, 2, 12, G2);
  T(441, 658, 8, 2, G2);

  for (const a of [432, 456]) {
    T(a, 732, 4, 10, '#3a3440');
    lit(a, 732 - OFF, 4, 10);
  }

  for (let hx = -8; hx < 740;) {
    const w = 14 + r() * 18;

    if (hx < 196 || hx > 470) house(hx, w, 12 + r() * 20);
    hx += w + (r() < 0.25 ? 6 : -1);
  } // a low row on the water

  x.fillStyle = 'rgba(20, 12, 24, .55)';
  x.fillRect(-2, B - 3, 724, 3);
  return { c, e };
}

/** The medieval bridge: six arches in stone, their cutwaters, three lamps. */
function zgPaintBridge() {
  const S = 1.5;
  const [c, x] = zgCanvas(S);
  const [e, y] = zgCanvas(S);
  const B = ZE_WATER;
  const stone = '#ab9e8b';
  const dark = '#6e6355';

  x.fillStyle = stone;
  x.fillRect(-4, B - 26, 296, 26);
  x.fillStyle = '#c1b5a2';
  x.fillRect(-4, B - 30, 296, 5);
  x.fillStyle = dark;
  x.fillRect(-4, B - 25, 296, 1.5);
  x.globalCompositeOperation = 'destination-out';

  for (let i = 0; i < 6; i++) {
    const a = -6 + i * 50;

    x.beginPath();
    x.moveTo(a + 6, B + 1);
    x.lineTo(a + 6, B - 10);
    x.quadraticCurveTo(a + 12, B - 21, a + 25, B - 22);
    x.quadraticCurveTo(a + 38, B - 21, a + 44, B - 10);
    x.lineTo(a + 44, B + 1);
    x.fill();
  }

  x.globalCompositeOperation = 'source-over';

  for (let i = 0; i < 7; i++) {
    const a = -6 + i * 50;

    x.fillStyle = '#c1b5a2';
    x.fillRect(a - 2, B - 7, 8, 7);
    x.fillStyle = dark;
    x.fillRect(a + 3, B - 7, 3, 7);
  }

  const r = zgRng(5);

  for (let i = 0; i < 90; i++) {
    x.fillStyle = r() < 0.5 ? 'rgba(60, 50, 40, .22)' : 'rgba(240, 230, 210, .14)';
    x.fillRect(-4 + r() * 296, B - 25 + r() * 18, 5, 1.5);
  }

  for (const a of [40, 142, 244]) {
    x.fillStyle = '#20242e';
    x.fillRect(a, B - 45, 2, 16);
    x.fillRect(a - 2, B - 50, 6, 5);
    y.fillStyle = '#ffd98a';
    y.fillRect(a - 1.5, B - 49.5, 5, 4);
  }

  return { c, e };
}

function zgPaintHills(P) {
  const [c, x] = zgCanvas(1);
  const r = zgRng(3);
  const B = ZE_WATER;

  const hill = (col, base, amp, step, ph, clump) => {
    const top = i => base - amp * (Math.sin(i / step + ph) * 0.6 + Math.sin(i / (step * 0.37) + ph * 2) * 0.4);

    x.fillStyle = col;
    x.beginPath();
    x.moveTo(-2, B + 2);
    for (let i = -2; i <= ZE_W + 2; i += 6) x.lineTo(i, top(i));
    x.lineTo(ZE_W + 2, B + 2);
    x.fill();

    for (let i = 0; i < clump; i++) {
      const a = r() * ZE_W;
      const b = top(a) + 2 + r() * 40;
      const s = 2 + r() * 5;

      x.fillStyle = r() < 0.5 ? 'rgba(0, 0, 0, .16)' : 'rgba(255, 255, 255, .06)';
      x.beginPath();
      x.arc(a, b, s, 0, 7);
      x.fill();
    }
  };

  hill(P.hills[0], 712, 34, 90, 1, 240);
  hill(P.hills[1], 742, 22, 60, 4, 200);
  return c;
}

const ZE_LAMPS = [
  { x: 252, y: 722 },
  { x: 406, y: 722 },
];

// the festa's lights: wires from the left to lamp to lamp to Trota's sign, a bulb every 15 px, Minho's colours
const ZE_WIRES = [
  [[-4, 690], [252, 716], 34],
  [[252, 716], [406, 716], 26],
  [[406, 716], [490, 672], 18],
];

const zgWire = ([a, b, s], t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t + Math.sin(t * Math.PI) * s];

const ZE_FESTA = (() => {
  const o = [];

  const C = [
    [1, 0.22, 0.18],
    [1, 0.72, 0.2],
    [0.3, 0.85, 0.35],
    [1, 0.9, 0.7],
    [0.35, 0.55, 1],
  ];

  let n = 0;

  for (const w of ZE_WIRES) {
    const L = Math.hypot(w[1][0] - w[0][0], w[1][1] - w[0][1]);
    const m = Math.round(L / 15);

    for (let i = 1; i < m; i++) {
      const [x, y] = zgWire(w, i / m);

      o.push({ x, y, c: C[n++ % C.length], ph: n * 1.7 });
    }
  }

  return o;
})();

/** The terrace he runs on: its iron rail and granite kerb, two lamps, Trota's with its side and roof, the galo on granite; what shines by itself apart. */
function zgPaintSet(k) {
  const [c, x] = zgCanvas(k);
  const [e, y] = zgCanvas(k);
  const { x: RX, w: RW, top: RT } = ZE_REST;
  const AY = RT + 18;
  const F = ZE_FLOOR;
  const iron = '#161a24';
  const end = RX - 30;

  for (let i = 8; i < end; i += 30) {
    x.fillStyle = iron;
    x.fillRect(i, 804, 3, 22);
    x.fillRect(i - 1, 802, 5, 3);
  }

  x.fillStyle = iron;
  x.fillRect(0, 803, end, 2.5);
  x.fillRect(0, 815, end, 1.5);

  for (let i = 0; i < end; i += 6) {
    x.fillStyle = 'rgba(22, 26, 36, .65)';
    x.fillRect(i + 1, 805, 1.2, 19);
  }

  x.fillStyle = '#8c8a88';
  x.fillRect(0, 824, end + 2, 8);
  x.fillStyle = '#b4b1ac';
  x.fillRect(0, 824, end + 2, 2);
  const r = zgRng(9);

  for (let i = 0; i < end; i += 26 + r() * 10) {
    x.fillStyle = 'rgba(30, 25, 30, .4)';
    x.fillRect(i, 826, 1.2, 6);
  }

  x.strokeStyle = 'rgba(14, 14, 22, .85)';
  x.lineWidth = 1;

  for (const w of ZE_WIRES) {
    x.beginPath();

    for (let i = 0; i <= 24; i++) {
      const [a, b] = zgWire(w, i / 24);

      x.lineTo(a, b);
    }

    x.stroke();
  }

  for (const L of ZE_LAMPS) {
    x.fillStyle = iron;
    x.fillRect(L.x - 2, L.y + 2, 4, 830 - L.y);
    x.fillRect(L.x - 6, 822, 12, 10);
    x.fillRect(L.x - 4, 812, 8, 4);
    x.fillRect(L.x - 9, L.y - 15, 18, 3);
    x.beginPath();
    x.moveTo(L.x - 7, L.y - 15);
    x.lineTo(L.x, L.y - 23);
    x.lineTo(L.x + 7, L.y - 15);
    x.fill();
    x.fillRect(L.x - 7, L.y + 1, 14, 3);
    x.fillStyle = '#e8d9a0';
    x.fillRect(L.x - 6, L.y - 12, 12, 13);
    x.fillStyle = iron;
    x.fillRect(L.x - 0.8, L.y - 12, 1.6, 13);
    y.fillStyle = '#fff0b8';
    y.fillRect(L.x - 6, L.y - 12, 12, 13);
  }

  x.fillStyle = '#6f5442';
  x.beginPath();
  x.moveTo(RX - 5, RT - 7);
  x.lineTo(RX - 30, RT - 1);
  x.lineTo(RX - 30, 832);
  x.lineTo(RX - 5, F);
  x.fill(); // Trota's side, going off towards the river
  x.fillStyle = 'rgba(20, 10, 30, .32)';
  x.fillRect(RX - 30, RT - 1, 25, F - RT);
  x.fillStyle = '#2a2230';
  x.fillRect(RX - 24, AY + 26, 12, 30);
  y.fillStyle = '#e8b45a';
  y.fillRect(RX - 24, AY + 26, 12, 30);

  const roof = (col, a, b) => {
    x.fillStyle = col;
    x.beginPath();
    x.moveTo(RX - 5 + a, RT - 8 - b);
    x.lineTo(RX + RW + 5 - a, RT - 8 - b);
    x.lineTo(RX + RW + 5 - a - 2, RT - 8 - b - 3);
    x.lineTo(RX - 5 + a + 2, RT - 8 - b - 3);
    x.fill();
  };

  for (let i = 0; i < 5; i++) roof(i % 2 ? '#a14e30' : '#b65c38', i * 2, i * 3);
  zeRestaurant(x);
  x.fillStyle = 'rgba(24, 10, 28, .32)';
  x.fillRect(RX, AY + 16, RW, 9); // the awning's shade on the wall
  zeGaloArt(x, 110, F, 1.35);

  {
    const px = 110 - 36 * 1.35;
    const pw = 72 * 1.35;
    const ph = 22 * 1.35;
    const tx = 110 - 30 * 1.35;
    const tw = 60 * 1.35;
    const th = 6 * 1.35; // his plinth in granite, its side showing

    x.fillStyle = '#6a6562';
    x.beginPath();
    x.moveTo(px + pw, F - ph);
    x.lineTo(px + pw + 10, F - ph + 3);
    x.lineTo(px + pw + 10, F - 8);
    x.lineTo(px + pw, F);
    x.fill();
    x.fillStyle = '#1b0b2e';
    x.fillRect(px - 1.5, F - ph - 1.5, pw + 3, ph + 1.5);
    x.fillRect(tx - 1.5, F - ph - th - 1.5, tw + 3, th + 2);
    x.fillStyle = '#8f8a86';
    x.fillRect(px, F - ph, pw, ph);
    x.fillStyle = '#aaa59f';
    x.fillRect(px, F - ph, pw, 2.5);
    x.fillStyle = 'rgba(40, 30, 40, .28)';
    x.fillRect(px + pw * 0.72, F - ph, pw * 0.28, ph);
    x.fillStyle = '#9c9791';
    x.fillRect(tx, F - ph - th, tw, th);
    x.fillStyle = '#bcb7af';
    x.fillRect(tx, F - ph - th, tw, 1.8);

    for (let i = 0; i < 9; i++) {
      x.fillStyle = 'rgba(40, 30, 40, .16)';
      x.fillRect(px + 4 + i * 11, F - ph + 7 + (i % 3) * 6, 7, 1.2);
    }
  }

  for (const wx of [RX + 12, RX + RW - 72]) {
    y.fillStyle = '#ffdb70';
    y.fillRect(wx + 2, AY + 31, 26, 42);
    y.fillRect(wx + 31, AY + 31, 27, 42);
  }

  for (const lx of [RX + 28, RX + RW - 36]) {
    y.fillStyle = '#fff0a0';
    y.fillRect(lx, RT + 5, 8, 8);
  }

  const DX = RX + RW / 2 - 18;
  const DY = AY + 22;

  y.fillStyle = '#ffd868';
  y.fillRect(DX + 5, DY + 6, 8, 16);
  y.fillRect(DX + 23, DY + 6, 8, 16);
  return { c, e };
}

/** A sky's set, baked: each layer lit by that sky. */
function zgScene(i) {
  if (zg.scenes.has(i)) return zg.scenes.get(i);

  const gl = zg.gl;
  const P = ZE_SKIES[i];
  const R = ZE_RIGS[i];

  zg.town ||= zgPaintTown();
  zg.bridge ||= zgPaintBridge();

  const sun = P.sun
    ? [R.sunX, P.sun.y > 860 ? ZE_WATER : P.sun.y - 74]
    : P.moon === 'full'
      ? [590, 150]
      : [R.sunX, 600];

  const rimD = (() => {
    const a = sun[0] - 360;
    const b = sun[1] - 720;
    const l = Math.hypot(a, b) || 1;

    return [a / l, b / l];
  })();

  gl.disable(gl.BLEND);

  const bake = (alb, em, { amb = [1, 1, 1], rim = 0, s = 1, emB = 1, blur = 0, haze = 0 }) => {
    const ta = zgUp(gl, alb);
    const te = em ? zgUp(gl, em) : null;
    const A = zgFbo(gl, Math.round(ZE_W * s), Math.round(ZE_H * s));

    zgBind(A);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    zgUse(
      zg.P.bake,
      ZG_FULL,
      {
        uHaze: R.haze,
        uHazeA: haze,
        uAmb: amb,
        uRimC: R.keyC.map(v => v * rim),
        uRimD: rimD,
        uEm: emB,
        uUseE: em ? 1 : 0,
      },
      em ? { uA: ta, uE: te } : { uA: ta },
    );

    gl.deleteTexture(ta);
    if (te) gl.deleteTexture(te);
    if (!blur) return A;
    const B = zgFbo(gl, A.w, A.h);

    zgBind(B);
    zgUse(zg.P.disc, ZG_FULL, { uR: blur, uB: 1.4 }, { uT: A.t });
    zgDrop(gl, A);
    return B; // out of focus by its distance: what shines opens into a disc
  };

  const S = { i, R, sun };
  const [sc, se] = zgPaintSky(P.sun ? { ...P, sun: { ...P.sun, x: R.sunX } } : P);
  const hc = zgPaintHills(P);

  S.sky = bake(sc, se, { s: 0.75, emB: 1.5, blur: 0.9 });
  S.hills = bake(hc, null, { s: 0.5, blur: 3.2, haze: R.hz[0] * 0.55 });
  zgLetGo(sc, se, hc);
  S.town = bake(zg.town.c, zg.town.e, { amb: R.tAmb, rim: R.rim * 0.9, emB: R.win * 2.6, blur: 2.4, haze: R.hz[1] });

  S.bridge = bake(zg.bridge.c, zg.bridge.e, {
    amb: R.tAmb.map(v => v * 1.1),
    rim: R.rim,
    emB: Math.max(R.lamp, R.win * 0.6) * 3.6,
    blur: 1.1,
    haze: R.hz[2],
  });

  // the picture the river sees
  S.comp = zgFbo(gl, 360, 450, zg.fmt, true);
  zgBind(S.comp);
  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

  for (const L of [S.sky, S.hills, S.town, S.bridge]) {
    zgUse(zg.P.layer, ZG_FULL, { uA: 1, uShift: [0, 0] }, { uT: L.t });
  }

  gl.bindTexture(gl.TEXTURE_2D, S.comp.t);
  gl.generateMipmap(gl.TEXTURE_2D);

  if (R.rays > 0) {
    gl.disable(gl.BLEND);
    S.rays = zgFbo(gl, 180, 225);
    zgBind(S.rays);
    zgUse(zg.P.rays, ZG_FULL, { uC: sun, uThr: P.sun ? 0.55 : 0.25 }, { uT: S.comp.t });
    gl.enable(gl.BLEND);
  } // the light through the town, baked from it

  zg.scenes.set(i, S);
  return S;
}

/** Every sky baked ahead, one a frame, so a level-up never waits for its own. */
function zgBakeAhead() {
  for (let i = 0; i < ZE_SKIES.length; i++) {
    if (!zg.scenes.has(i)) {
      zgScene(i);
      return;
    }
  }

  zg.baked = true;
  zgLetGo(zg.town?.c, zg.town?.e, zg.bridge?.c, zg.bridge?.e);
  zg.town = zg.bridge = null;
}

function zgSet(k) {
  if (zg.set?.k === k) return zg.set;

  const gl = zg.gl;
  const { c, e } = zgPaintSet(k);

  if (zg.set) {
    gl.deleteTexture(zg.set.a);
    gl.deleteTexture(zg.set.e);
    zgDrop(gl, zg.set.h);
  }

  const a = zgUp(gl, c);
  const h = zgFbo(gl, gl.canvas.width >> 2, gl.canvas.height >> 2, [gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE]);

  gl.disable(gl.BLEND);
  zgBind(h);
  zgUse(zg.P.alpha, ZG_FULL, {}, { uT: a });
  gl.enable(gl.BLEND);
  const ta = zgUp(gl, e);

  zgLetGo(c, e);
  return (zg.set = { k, a, e: ta, h });
}

function zgSize(w, h) {
  const gl = zg.gl;
  const cv = gl.canvas;

  if (cv.width !== w || cv.height !== h) {
    cv.width = w;
    cv.height = h;
  }

  if (zg.fS?.w === w && zg.fS.h === h) return;
  for (const b of [zg.fS, zg.fA, zg.fC]) zgDrop(gl, b);
  const b8 = [gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE];

  zg.fA = zgFbo(gl, w, h, b8);
  zg.fC = zgFbo(gl, w, h, b8);
  zg.fS = zgFbo(gl, w, h);
  zgDrop(gl, zg.fM);
  zg.fM = zgFbo(gl, w >> 1, h >> 1, zg.fmt, true);
  zgDrop(gl, zg.fH);
  zg.fH = zgFbo(gl, w >> 2, h >> 2, b8);
  for (const b of zg.fB || []) zgDrop(gl, b);
  zg.fB = [2, 3, 4, 5].map(s => zgFbo(gl, Math.max(2, w >> s), Math.max(2, h >> s)));
}
