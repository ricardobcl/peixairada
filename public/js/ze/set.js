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

const zgRng = seed => () => (seed = (seed * 16807) % 2147483647) / 2147483647;

const zgCanvas = scale => {
  const canvas = document.createElement('canvas');

  canvas.width = Math.round(ZE_W * scale);
  canvas.height = Math.round(ZE_H * scale);
  const cx = canvas.getContext('2d');

  cx.scale(scale, scale);
  return [canvas, cx];
};

/** The sky, as zeScene paints it, down to the water — its sun risen to stand on the town, and what burns in a canvas of its own. */
function zgPaintSky(look) {
  const [canvas, cx] = zgCanvas(1);
  const [glow, glowCx] = zgCanvas(1);
  const bot = ZE_WATER + 16;

  const sky = cx.createLinearGradient(0, 0, 0, bot);

  look.stops.forEach((col, index) => sky.addColorStop([0, 0.32, 0.7, 1][index], col));
  cx.fillStyle = sky;
  cx.fillRect(0, 0, ZE_W, ZE_H);

  if (look.glow) {
    const gradient = cx.createRadialGradient(360, ZE_WATER, 20, 360, ZE_WATER, 460);

    gradient.addColorStop(0, `${look.glow}99`);
    gradient.addColorStop(1, `${look.glow}00`);
    cx.fillStyle = gradient;
    cx.fillRect(0, 0, ZE_W, ZE_H);
  }

  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

  for (let star = 0; star < look.stars; star++) {
    const sy = rnd() ** 1.6 * 420;

    cx.globalAlpha = 0.25 + 0.75 * (1 - sy / 420) * rnd();
    cx.fillStyle = '#fff6e0';
    cx.fillRect(rnd() * ZE_W, sy, rnd() < 0.15 ? 2 : 1.2, rnd() < 0.15 ? 2 : 1.2);
  }

  cx.globalAlpha = 1;

  if (look.moon === 'crescent' || look.moon === 'faint') {
    cx.globalAlpha = look.moon === 'faint' ? 0.45 : 1;
    cx.fillStyle = '#fff3c4';
    cx.beginPath();
    cx.arc(118, 132, 26, 0, Math.PI * 2);
    cx.fill();
    cx.globalAlpha = 1;
    cx.fillStyle = sky;
    cx.beginPath();
    cx.arc(130, 124, 24, 0, Math.PI * 2);
    cx.fill();
  }

  if (look.moon === 'full') {
    const halo = cx.createRadialGradient(590, 150, 10, 590, 150, 90);

    halo.addColorStop(0, 'rgba(220, 230, 255, .35)');
    halo.addColorStop(1, 'rgba(220, 230, 255, 0)');
    cx.fillStyle = halo;
    cx.fillRect(490, 50, 200, 200);
    cx.fillStyle = '#e8eeff';
    cx.beginPath();
    cx.arc(590, 150, 24, 0, Math.PI * 2);
    cx.fill();
    cx.fillStyle = '#c9d2ee';

    for (const [mx, my, mr] of [
      [583, 145, 5],
      [597, 158, 3.5],
      [594, 141, 2.5],
    ]) {
      cx.beginPath();
      cx.arc(mx, my, mr, 0, Math.PI * 2);
      cx.fill();
    }
  }

  if (look.sun) {
    const sunLook = look.sun;
    const sy0 = sunLook.y > 860 ? sunLook.y : sunLook.y - 74;
    const sun = cx.createLinearGradient(0, sy0 - sunLook.r, 0, sy0 + sunLook.r);

    sun.addColorStop(0, sunLook.a);
    sun.addColorStop(1, sunLook.b);
    cx.save();
    cx.beginPath();
    cx.arc(sunLook.x, sy0, sunLook.r, 0, Math.PI * 2);
    cx.clip();
    cx.fillStyle = sun;
    cx.fillRect(sunLook.x - sunLook.r, sy0 - sunLook.r, sunLook.r * 2, sunLook.r * 2);

    if (sunLook.bands) {
      cx.fillStyle = sky;

      for (let band = 0; band < 6; band++) {
        cx.fillRect(sunLook.x - sunLook.r, sy0 - 60 + band * 18, sunLook.r * 2, 2 + band * 2);
      }
    }

    cx.restore();
    glowCx.drawImage(canvas, 0, 0);
    glowCx.globalCompositeOperation = 'destination-in';
    glowCx.fillStyle = '#000';
    glowCx.beginPath();
    glowCx.arc(sunLook.x, sy0, sunLook.r, 0, Math.PI * 2);
    glowCx.fill();
    glowCx.globalCompositeOperation = 'source-over';
  }

  return [canvas, glow];
}

/** The town: rows of houses on the far bank, and zeTown's landmarks in stone. Its lit windows in a canvas of their own. */
function zgPaintTown() {
  const SCALE = 1.5;
  const [canvas, cx] = zgCanvas(SCALE);
  const [glow, glowCx] = zgCanvas(SCALE);
  const random = zgRng(11);
  const WATER = ZE_WATER;

  const rect = (col, left, top, width, height) => {
    cx.fillStyle = col;
    cx.fillRect(left, top, width, height);
  };

  const lit = (left, top, width, height, col = '#ffd27a') => {
    glowCx.fillStyle = col;
    glowCx.fillRect(left, top, width, height);
  };

  const WALL = ['#e6dcca', '#d9ccb5', '#cdc2b2', '#e8d7b6', '#cbc4c0', '#dfc9ae', '#c9bba4'];
  const ROOF = ['#a8553a', '#97492f', '#b4623e', '#8e4530'];

  const house = (hx, width, height) => {
    const top = WATER - height;
    const wall = WALL[(random() * WALL.length) | 0];
    const roof = ROOF[(random() * ROOF.length) | 0];
    const rh = 5 + random() * 7;

    rect(wall, hx, top, width, height);
    rect('rgba(40, 25, 40, .28)', hx + width - Math.max(3, width * 0.3), top, Math.max(3, width * 0.3), height);
    cx.fillStyle = roof;
    cx.beginPath();
    cx.moveTo(hx - 2, top + 1);
    cx.lineTo(hx + width * 0.3, top - rh);
    cx.lineTo(hx + width * 0.72, top - rh);
    cx.lineTo(hx + width + 2, top + 1);
    cx.fill();
    rect('rgba(30, 15, 30, .3)', hx + width * 0.55, top - rh, width * 0.45 + 2, rh + 1);

    for (let wy = top + 4; wy < WATER - 6; wy += 9) {
      for (let wx = hx + 3; wx < hx + width - 4; wx += 7) {
        if (random() < 0.12) continue;
        const on = random() < 0.3;

        rect(on ? '#5a4632' : '#2a2a38', wx, wy, 3, 5);
        if (on) lit(wx, wy, 3, 5);
      }
    }

    if (random() < 0.4) rect('#6f4a3a', hx + width * 0.7, top - rh - 5, 3, 7);
  };

  for (let hx = -14; hx < 740;) {
    const width = 18 + random() * 24;

    house(hx, width, 34 + random() * 44);
    hx += width - 2;
  }

  const G1 = '#9d9182';
  const G2 = '#7e7366';
  const G3 = '#b5a998';
  const OFF = 30;
  const stone = (left, top, width, height, col = G1) => rect(col, left, top - OFF, width, height);

  stone(206, 642, 36, 150);
  stone(232, 642, 10, 150, G2);
  stone(202, 636, 44, 7, G3);
  for (let merlon = 0; merlon < 4; merlon++) stone(202 + merlon * 12.3, 626, 7, 11, G3); // the Torre da Porta Nova

  for (const [windowX, windowY] of [
    [220, 662],
    [229, 704],
    [216, 744],
  ]) {
    stone(windowX, windowY, 4, 8, '#3a3440');
    lit(windowX, windowY - OFF, 4, 8);
  }

  stone(262, 712, 58, 80, G3);
  stone(306, 712, 14, 80, G1);
  cx.fillStyle = '#94553d';
  cx.beginPath();
  cx.moveTo(258, 713 - OFF);
  cx.lineTo(291, 688 - OFF);
  cx.lineTo(324, 713 - OFF);
  cx.fill(); // the Igreja Matriz…
  cx.fillStyle = '#3a3440';
  cx.beginPath();
  cx.arc(291, 728 - OFF, 5, 0, 7);
  cx.fill();
  glowCx.fillStyle = '#ffcf7a';
  glowCx.beginPath();
  glowCx.arc(291, 728 - OFF, 5, 0, 7);
  glowCx.fill();
  stone(322, 662, 22, 130);
  stone(336, 662, 8, 130, G2);
  cx.fillStyle = '#7f4a38';
  cx.beginPath();
  cx.moveTo(319, 663 - OFF);
  cx.lineTo(333, 644 - OFF);
  cx.lineTo(347, 663 - OFF);
  cx.fill();
  stone(330, 676, 6, 10, '#2c2832'); // …and its tower
  cx.fillStyle = G2;
  cx.beginPath();

  for (const [pointX, pointY] of [
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
    cx.lineTo(pointX, pointY - OFF);
  }

  cx.fill(); // the Paço dos Condes
  stone(364, 674, 7, 36, G2);
  stone(362, 670, 11, 5);
  stone(391, 668, 7, 38, G2);
  stone(389, 664, 11, 5);
  for (const windowX of [358, 378, 396]) stone(windowX, 734, 7, 12, '#2c2832');
  stone(422, 702, 46, 90, G3);
  stone(456, 702, 12, 90);
  cx.fillStyle = '#b8ad9b';
  cx.beginPath();
  cx.arc(445, 703 - OFF, 23, Math.PI, 0);
  cx.fill();
  cx.fillStyle = '#8f8473';
  cx.beginPath();
  cx.arc(445, 703 - OFF, 23, Math.PI * 1.55, 0);
  cx.lineTo(445, 703 - OFF);
  cx.fill(); // Bom Jesus da Cruz
  stone(441, 670, 8, 14, G3);
  cx.fillStyle = G3;
  cx.beginPath();
  cx.arc(445, 671 - OFF, 5, Math.PI, 0);
  cx.fill();
  stone(444, 654, 2, 12, G2);
  stone(441, 658, 8, 2, G2);

  for (const windowX of [432, 456]) {
    stone(windowX, 732, 4, 10, '#3a3440');
    lit(windowX, 732 - OFF, 4, 10);
  }

  for (let hx = -8; hx < 740;) {
    const width = 14 + random() * 18;

    if (hx < 196 || hx > 470) house(hx, width, 12 + random() * 20);
    hx += width + (random() < 0.25 ? 6 : -1);
  } // a low row on the water

  cx.fillStyle = 'rgba(20, 12, 24, .55)';
  cx.fillRect(-2, WATER - 3, 724, 3);
  return { c: canvas, e: glow };
}

/** The medieval bridge: six arches in stone, their cutwaters, three lamps. */
function zgPaintBridge() {
  const SCALE = 1.5;
  const [canvas, cx] = zgCanvas(SCALE);
  const [glow, glowCx] = zgCanvas(SCALE);
  const WATER = ZE_WATER;
  const stone = '#ab9e8b';
  const dark = '#6e6355';

  cx.fillStyle = stone;
  cx.fillRect(-4, WATER - 26, 296, 26);
  cx.fillStyle = '#c1b5a2';
  cx.fillRect(-4, WATER - 30, 296, 5);
  cx.fillStyle = dark;
  cx.fillRect(-4, WATER - 25, 296, 1.5);
  cx.globalCompositeOperation = 'destination-out';

  for (let arch = 0; arch < 6; arch++) {
    const archX = -6 + arch * 50;

    cx.beginPath();
    cx.moveTo(archX + 6, WATER + 1);
    cx.lineTo(archX + 6, WATER - 10);
    cx.quadraticCurveTo(archX + 12, WATER - 21, archX + 25, WATER - 22);
    cx.quadraticCurveTo(archX + 38, WATER - 21, archX + 44, WATER - 10);
    cx.lineTo(archX + 44, WATER + 1);
    cx.fill();
  }

  cx.globalCompositeOperation = 'source-over';

  for (let pier = 0; pier < 7; pier++) {
    const pierX = -6 + pier * 50;

    cx.fillStyle = '#c1b5a2';
    cx.fillRect(pierX - 2, WATER - 7, 8, 7);
    cx.fillStyle = dark;
    cx.fillRect(pierX + 3, WATER - 7, 3, 7);
  }

  const random = zgRng(5);

  for (let mark = 0; mark < 90; mark++) {
    cx.fillStyle = random() < 0.5 ? 'rgba(60, 50, 40, .22)' : 'rgba(240, 230, 210, .14)';
    cx.fillRect(-4 + random() * 296, WATER - 25 + random() * 18, 5, 1.5);
  }

  for (const lampX of [40, 142, 244]) {
    cx.fillStyle = '#20242e';
    cx.fillRect(lampX, WATER - 45, 2, 16);
    cx.fillRect(lampX - 2, WATER - 50, 6, 5);
    glowCx.fillStyle = '#ffd98a';
    glowCx.fillRect(lampX - 1.5, WATER - 49.5, 5, 4);
  }

  return { c: canvas, e: glow };
}

function zgPaintHills(look) {
  const [canvas, cx] = zgCanvas(1);
  const random = zgRng(3);
  const WATER = ZE_WATER;

  const hill = (col, base, amp, step, ph, clump) => {
    const top = atX => base - amp * (Math.sin(atX / step + ph) * 0.6 + Math.sin(atX / (step * 0.37) + ph * 2) * 0.4);

    cx.fillStyle = col;
    cx.beginPath();
    cx.moveTo(-2, WATER + 2);
    for (let atX = -2; atX <= ZE_W + 2; atX += 6) cx.lineTo(atX, top(atX));
    cx.lineTo(ZE_W + 2, WATER + 2);
    cx.fill();

    for (let tuft = 0; tuft < clump; tuft++) {
      const tuftX = random() * ZE_W;
      const tuftY = top(tuftX) + 2 + random() * 40;
      const radius = 2 + random() * 5;

      cx.fillStyle = random() < 0.5 ? 'rgba(0, 0, 0, .16)' : 'rgba(255, 255, 255, .06)';
      cx.beginPath();
      cx.arc(tuftX, tuftY, radius, 0, 7);
      cx.fill();
    }
  };

  hill(look.hills[0], 712, 34, 90, 1, 240);
  hill(look.hills[1], 742, 22, 60, 4, 200);
  return canvas;
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

const zgWire = ([from, to, sag], progress) => [
  from[0] + (to[0] - from[0]) * progress,
  from[1] + (to[1] - from[1]) * progress + Math.sin(progress * Math.PI) * sag,
];

const ZE_FESTA = (() => {
  const bulbs = [];

  const COLORS = [
    [1, 0.22, 0.18],
    [1, 0.72, 0.2],
    [0.3, 0.85, 0.35],
    [1, 0.9, 0.7],
    [0.35, 0.55, 1],
  ];

  let count = 0;

  for (const wire of ZE_WIRES) {
    const length = Math.hypot(wire[1][0] - wire[0][0], wire[1][1] - wire[0][1]);
    const segments = Math.round(length / 15);

    for (let index = 1; index < segments; index++) {
      const [bulbX, bulbY] = zgWire(wire, index / segments);

      bulbs.push({ x: bulbX, y: bulbY, c: COLORS[count++ % COLORS.length], ph: count * 1.7 });
    }
  }

  return bulbs;
})();

/** The terrace he runs on: its iron rail and granite kerb, two lamps, Trota's with its side and roof, the galo on granite; what shines by itself apart. */
function zgPaintSet(scale) {
  const [canvas, cx] = zgCanvas(scale);
  const [glow, glowCx] = zgCanvas(scale);
  const { x: RX, w: RW, top: RT } = ZE_REST;
  const AY = RT + 18;
  const FLOOR = ZE_FLOOR;
  const iron = '#161a24';
  const end = RX - 30;

  for (let postX = 8; postX < end; postX += 30) {
    cx.fillStyle = iron;
    cx.fillRect(postX, 804, 3, 22);
    cx.fillRect(postX - 1, 802, 5, 3);
  }

  cx.fillStyle = iron;
  cx.fillRect(0, 803, end, 2.5);
  cx.fillRect(0, 815, end, 1.5);

  for (let barX = 0; barX < end; barX += 6) {
    cx.fillStyle = 'rgba(22, 26, 36, .65)';
    cx.fillRect(barX + 1, 805, 1.2, 19);
  }

  cx.fillStyle = '#8c8a88';
  cx.fillRect(0, 824, end + 2, 8);
  cx.fillStyle = '#b4b1ac';
  cx.fillRect(0, 824, end + 2, 2);
  const random = zgRng(9);

  for (let jointX = 0; jointX < end; jointX += 26 + random() * 10) {
    cx.fillStyle = 'rgba(30, 25, 30, .4)';
    cx.fillRect(jointX, 826, 1.2, 6);
  }

  cx.strokeStyle = 'rgba(14, 14, 22, .85)';
  cx.lineWidth = 1;

  for (const wire of ZE_WIRES) {
    cx.beginPath();

    for (let index = 0; index <= 24; index++) {
      const [pointX, pointY] = zgWire(wire, index / 24);

      cx.lineTo(pointX, pointY);
    }

    cx.stroke();
  }

  for (const lamp of ZE_LAMPS) {
    cx.fillStyle = iron;
    cx.fillRect(lamp.x - 2, lamp.y + 2, 4, 830 - lamp.y);
    cx.fillRect(lamp.x - 6, 822, 12, 10);
    cx.fillRect(lamp.x - 4, 812, 8, 4);
    cx.fillRect(lamp.x - 9, lamp.y - 15, 18, 3);
    cx.beginPath();
    cx.moveTo(lamp.x - 7, lamp.y - 15);
    cx.lineTo(lamp.x, lamp.y - 23);
    cx.lineTo(lamp.x + 7, lamp.y - 15);
    cx.fill();
    cx.fillRect(lamp.x - 7, lamp.y + 1, 14, 3);
    cx.fillStyle = '#e8d9a0';
    cx.fillRect(lamp.x - 6, lamp.y - 12, 12, 13);
    cx.fillStyle = iron;
    cx.fillRect(lamp.x - 0.8, lamp.y - 12, 1.6, 13);
    glowCx.fillStyle = '#fff0b8';
    glowCx.fillRect(lamp.x - 6, lamp.y - 12, 12, 13);
  }

  cx.fillStyle = '#6f5442';
  cx.beginPath();
  cx.moveTo(RX - 5, RT - 7);
  cx.lineTo(RX - 30, RT - 1);
  cx.lineTo(RX - 30, 832);
  cx.lineTo(RX - 5, FLOOR);
  cx.fill(); // Trota's side, going off towards the river
  cx.fillStyle = 'rgba(20, 10, 30, .32)';
  cx.fillRect(RX - 30, RT - 1, 25, FLOOR - RT);
  cx.fillStyle = '#2a2230';
  cx.fillRect(RX - 24, AY + 26, 12, 30);
  glowCx.fillStyle = '#e8b45a';
  glowCx.fillRect(RX - 24, AY + 26, 12, 30);

  const roof = (col, inset, lift) => {
    cx.fillStyle = col;
    cx.beginPath();
    cx.moveTo(RX - 5 + inset, RT - 8 - lift);
    cx.lineTo(RX + RW + 5 - inset, RT - 8 - lift);
    cx.lineTo(RX + RW + 5 - inset - 2, RT - 8 - lift - 3);
    cx.lineTo(RX - 5 + inset + 2, RT - 8 - lift - 3);
    cx.fill();
  };

  for (let tier = 0; tier < 5; tier++) roof(tier % 2 ? '#a14e30' : '#b65c38', tier * 2, tier * 3);
  zeRestaurant(cx);
  cx.fillStyle = 'rgba(24, 10, 28, .32)';
  cx.fillRect(RX, AY + 16, RW, 9); // the awning's shade on the wall
  zeGaloArt(cx, 110, FLOOR, 1.35);

  {
    const px = 110 - 36 * 1.35;
    const pw = 72 * 1.35;
    const ph = 22 * 1.35;
    const tx = 110 - 30 * 1.35;
    const tw = 60 * 1.35;
    const th = 6 * 1.35; // his plinth in granite, its side showing

    cx.fillStyle = '#6a6562';
    cx.beginPath();
    cx.moveTo(px + pw, FLOOR - ph);
    cx.lineTo(px + pw + 10, FLOOR - ph + 3);
    cx.lineTo(px + pw + 10, FLOOR - 8);
    cx.lineTo(px + pw, FLOOR);
    cx.fill();
    cx.fillStyle = '#1b0b2e';
    cx.fillRect(px - 1.5, FLOOR - ph - 1.5, pw + 3, ph + 1.5);
    cx.fillRect(tx - 1.5, FLOOR - ph - th - 1.5, tw + 3, th + 2);
    cx.fillStyle = '#8f8a86';
    cx.fillRect(px, FLOOR - ph, pw, ph);
    cx.fillStyle = '#aaa59f';
    cx.fillRect(px, FLOOR - ph, pw, 2.5);
    cx.fillStyle = 'rgba(40, 30, 40, .28)';
    cx.fillRect(px + pw * 0.72, FLOOR - ph, pw * 0.28, ph);
    cx.fillStyle = '#9c9791';
    cx.fillRect(tx, FLOOR - ph - th, tw, th);
    cx.fillStyle = '#bcb7af';
    cx.fillRect(tx, FLOOR - ph - th, tw, 1.8);

    for (let mark = 0; mark < 9; mark++) {
      cx.fillStyle = 'rgba(40, 30, 40, .16)';
      cx.fillRect(px + 4 + mark * 11, FLOOR - ph + 7 + (mark % 3) * 6, 7, 1.2);
    }
  }

  for (const wx of [RX + 12, RX + RW - 72]) {
    glowCx.fillStyle = '#ffdb70';
    glowCx.fillRect(wx + 2, AY + 31, 26, 42);
    glowCx.fillRect(wx + 31, AY + 31, 27, 42);
  }

  for (const lx of [RX + 28, RX + RW - 36]) {
    glowCx.fillStyle = '#fff0a0';
    glowCx.fillRect(lx, RT + 5, 8, 8);
  }

  const DX = RX + RW / 2 - 18;
  const DY = AY + 22;

  glowCx.fillStyle = '#ffd868';
  glowCx.fillRect(DX + 5, DY + 6, 8, 16);
  glowCx.fillRect(DX + 23, DY + 6, 8, 16);
  return { c: canvas, e: glow };
}

/** A sky's set, baked: each layer lit by that sky. */
function zgScene(skyIndex) {
  if (zg.scenes.has(skyIndex)) return zg.scenes.get(skyIndex);

  const gl = zg.gl;
  const look = ZE_SKIES[skyIndex];
  const rig = ZE_RIGS[skyIndex];

  zg.town ||= zgPaintTown();
  zg.bridge ||= zgPaintBridge();

  const sun = look.sun
    ? [rig.sunX, look.sun.y > 860 ? ZE_WATER : look.sun.y - 74]
    : look.moon === 'full'
      ? [590, 150]
      : [rig.sunX, 600];

  const rimD = (() => {
    const deltaX = sun[0] - 360;
    const deltaY = sun[1] - 720;
    const length = Math.hypot(deltaX, deltaY) || 1;

    return [deltaX / length, deltaY / length];
  })();

  gl.disable(gl.BLEND);

  const bake = (alb, em, { amb = [1, 1, 1], rim = 0, s: scale = 1, emB = 1, blur = 0, haze = 0 }) => {
    const ta = zgUp(gl, alb);
    const te = em ? zgUp(gl, em) : null;
    const target = zgFbo(gl, Math.round(ZE_W * scale), Math.round(ZE_H * scale));

    zgBind(target);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    zgUse(
      zg.P.bake,
      ZG_FULL,
      {
        uHaze: rig.haze,
        uHazeA: haze,
        uAmb: amb,
        uRimC: rig.keyC.map(value => value * rim),
        uRimD: rimD,
        uEm: emB,
        uUseE: em ? 1 : 0,
      },
      em ? { uA: ta, uE: te } : { uA: ta },
    );

    gl.deleteTexture(ta);
    if (te) gl.deleteTexture(te);
    if (!blur) return target;
    const blurred = zgFbo(gl, target.w, target.h);

    zgBind(blurred);
    zgUse(zg.P.disc, ZG_FULL, { uR: blur, uB: 1.4 }, { uT: target.t });
    zgDrop(gl, target);
    return blurred; // out of focus by its distance: what shines opens into a disc
  };

  const scene = { i: skyIndex, R: rig, sun };
  const [sc, se] = zgPaintSky(look.sun ? { ...look, sun: { ...look.sun, x: rig.sunX } } : look);
  const hc = zgPaintHills(look);

  scene.sky = bake(sc, se, { s: 0.75, emB: 1.5, blur: 0.9 });
  scene.hills = bake(hc, null, { s: 0.5, blur: 3.2, haze: rig.hz[0] * 0.55 });
  zgLetGo(sc, se, hc);

  scene.town = bake(zg.town.c, zg.town.e, {
    amb: rig.tAmb,
    rim: rig.rim * 0.9,
    emB: rig.win * 2.6,
    blur: 2.4,
    haze: rig.hz[1],
  });

  scene.bridge = bake(zg.bridge.c, zg.bridge.e, {
    amb: rig.tAmb.map(value => value * 1.1),
    rim: rig.rim,
    emB: Math.max(rig.lamp, rig.win * 0.6) * 3.6,
    blur: 1.1,
    haze: rig.hz[2],
  });

  // the picture the river sees
  scene.comp = zgFbo(gl, 360, 450, zg.fmt, true);
  zgBind(scene.comp);
  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

  for (const layer of [scene.sky, scene.hills, scene.town, scene.bridge]) {
    zgUse(zg.P.layer, ZG_FULL, { uA: 1, uShift: [0, 0] }, { uT: layer.t });
  }

  gl.bindTexture(gl.TEXTURE_2D, scene.comp.t);
  gl.generateMipmap(gl.TEXTURE_2D);

  if (rig.rays > 0) {
    gl.disable(gl.BLEND);
    scene.rays = zgFbo(gl, 180, 225);
    zgBind(scene.rays);
    zgUse(zg.P.rays, ZG_FULL, { uC: sun, uThr: look.sun ? 0.55 : 0.25 }, { uT: scene.comp.t });
    gl.enable(gl.BLEND);
  } // the light through the town, baked from it

  zg.scenes.set(skyIndex, scene);
  return scene;
}

/** Every sky baked ahead, one a frame, so a level-up never waits for its own. */
function zgBakeAhead() {
  for (let skyIndex = 0; skyIndex < ZE_SKIES.length; skyIndex++) {
    if (!zg.scenes.has(skyIndex)) {
      zgScene(skyIndex);
      return;
    }
  }

  zg.baked = true;
  zgLetGo(zg.town?.c, zg.town?.e, zg.bridge?.c, zg.bridge?.e);
  zg.town = zg.bridge = null;
}

function zgSet(scale) {
  if (zg.set?.k === scale) return zg.set;

  const gl = zg.gl;
  const { c: canvas, e: glow } = zgPaintSet(scale);

  if (zg.set) {
    gl.deleteTexture(zg.set.a);
    gl.deleteTexture(zg.set.e);
    zgDrop(gl, zg.set.h);
  }

  const albedo = zgUp(gl, canvas);
  const heightMap = zgFbo(gl, gl.canvas.width >> 2, gl.canvas.height >> 2, [gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE]);

  gl.disable(gl.BLEND);
  zgBind(heightMap);
  zgUse(zg.P.alpha, ZG_FULL, {}, { uT: albedo });
  gl.enable(gl.BLEND);
  const ta = zgUp(gl, glow);

  zgLetGo(canvas, glow);
  return (zg.set = { k: scale, a: albedo, e: ta, h: heightMap });
}

function zgSize(width, height) {
  const gl = zg.gl;
  const cv = gl.canvas;

  if (cv.width !== width || cv.height !== height) {
    cv.width = width;
    cv.height = height;
  }

  if (zg.fS?.w === width && zg.fS.h === height) return;
  for (const framebuffer of [zg.fS, zg.fA, zg.fC]) zgDrop(gl, framebuffer);
  const b8 = [gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE];

  zg.fA = zgFbo(gl, width, height, b8);
  zg.fC = zgFbo(gl, width, height, b8);
  zg.fS = zgFbo(gl, width, height);
  zgDrop(gl, zg.fM);
  zg.fM = zgFbo(gl, width >> 1, height >> 1, zg.fmt, true);
  zgDrop(gl, zg.fH);
  zg.fH = zgFbo(gl, width >> 2, height >> 2, b8);
  for (const framebuffer of zg.fB || []) zgDrop(gl, framebuffer);
  zg.fB = [2, 3, 4, 5].map(shift => zgFbo(gl, Math.max(2, width >> shift), Math.max(2, height >> shift)));
}
