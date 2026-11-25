/** Zé, his feet at (g.x, g.y), in pixels (zeBuild): his pose — standing, running, kicking, in the air, seated in a car
 *  and pitching with it —, as big as his bulk and the dragon make him; blinking while a green's hit lasts; at the K.O.
 *  his bones, flat on his back, seeing stars. */
function zeHero(cx, g) {
  const air = g.y < g.gy - 0.5,
    over = g.phase === 'over' && g.koT >= ZE_KO_T,
    moving = Math.abs(g.vx) > 30 && !air && g.phase === 'play' && !g.ride;
  const k = zeSz(g) * (1 + g.pump * 0.25),
    p = ZE_PX * k,
    flip = g.f < 0 && !over;
  const pose = over
    ? 'bones'
    : g.ride
      ? 'sit'
      : g.kick > 0.04
        ? 'kick'
        : air
          ? 'jump'
          : g.flex > 0
            ? 'flex'
            : moving
              ? Math.floor(g.run) % 2
                ? 'run1'
                : 'run2'
              : 'stand';
  const open = g.chomp > 0 ? Math.floor(g.chomp * 20) % 2 === 0 : g.gape;
  const spr = zeBuild(Math.max(0, g.mass), pose, {
    open,
    agent: g.agent,
    shades: ze.mossad,
    sick: g.hurt > 0.9 || g.phase === 'over',
    flip,
  });
  const bob = over || g.ride ? 0 : moving ? -Math.abs(Math.cos(g.run)) * 3 : Math.sin(g.t * 3) * 1.2,
    tw = zeTw(g);
  const under = zePlatform(g.x, g.y); // his shadow, on whatever is under him
  if (!cx.zg) {
    cx.fillStyle = 'rgba(20, 8, 30, .35)';
    cx.beginPath();
    cx.ellipse(g.x, under + 3, Math.max(10, tw + 10 - (under - g.y) * 0.05) * k, 5 * k, 0, 0, Math.PI * 2);
    cx.fill();
  }
  cx.save();
  cx.translate(g.x + (g.mass === 1 && g.phase === 'play' && !zeCalm() ? Math.sin(g.t * 70) * 1.6 : 0), g.y); // on his last bit of bulk he shivers
  if (g.ride) {
    const pv = g.ride.kind === 'focus' ? -58 : -46;
    cx.scale(g.f, 1);
    cx.translate(pv, 0);
    cx.rotate(g.ride.tilt);
    cx.translate(-pv, 0);
    cx.scale(g.f, 1);
    cx.translate(-14 * g.f, 16);
  } // in the driver's seat, pitching with his car
  if (g.hurt > 0 && !over) cx.globalAlpha = zeCalm() ? 0.65 : Math.floor(g.hurt * 12) % 2 ? 0.4 : 1;
  if (over) {
    // K.O.: flat on his back, his feet where they stood — and seeing stars
    cx.translate(0, -14 * p);
    cx.scale(g.f, 1);
    cx.rotate(-Math.PI / 2);
    zeBlit(cx, spr, 0, 0, p, false);
    cx.restore();
    for (let i = 0; i < 3; i++) {
      const a = g.t * 3 + (i * Math.PI * 2) / 3,
        sx = g.x - g.f * 50 * p + Math.cos(a) * 30,
        sy = g.y - 30 * p + Math.sin(a) * 8;
      cx.fillStyle = '#ffd23f';
      cx.beginPath();
      for (let j = 0; j < 10; j++) {
        const r = j % 2 ? 2.5 : 6,
          b = (j * Math.PI) / 5 - Math.PI / 2;
        cx.lineTo(sx + Math.cos(b) * r, sy + Math.sin(b) * r);
      }
      cx.fill();
    }
    return;
  }
  const q = g.sq,
    a = q ? q.t / q.d : 0; // squashed or stretched about his feet
  const [sx, sy] = !q
    ? [1, 1]
    : q.k === 'land'
      ? [1 + 0.2 * a, 1 - 0.17 * a]
      : q.k === 'jump'
        ? [1 - 0.12 * a, 1 + 0.15 * a]
        : [1 + 0.1 * a, 1 - 0.08 * a];
  zeBlit(cx, spr, 0, bob * k, p, flip, sx, sy);
  if (g.dragon) {
    // the dragon's aura round his head
    cx.save();
    cx.shadowColor = '#ff7a2a';
    cx.shadowBlur = 16;
    cx.lineWidth = 3;
    cx.strokeStyle = zeBlink(g, 9) ? '#ff7a2a' : '#ffd23f';
    cx.beginPath();
    cx.ellipse(0, (bob - 48 * ZE_PX) * k, 12 * p, 13.5 * p, 0, 0, Math.PI * 2);
    cx.stroke();
    cx.restore();
  }
  cx.restore();
}
/** The cars, side on, their wheels on the floor at x, their front towards f: the Focus — Ford blue, the tall tail light
 *  up its back pillar, the oval on its nose —, the A-Class — silver, short and tall, the star on its nose —, each its
 *  name along its doors (zeCarName), read the right way whichever way it faces. He sits in it, seen above its doors:
 *  part 'back' is the whole car, drawn before him, 'front' its doors and wheels again over his lap, a beltline along
 *  their top. tilt pitches it on its rear wheel; flip turns it over its middle onto its roof, with a hop. */
function zeCar(cx, kind, x, y, f, wheel, tilt, flip, part = 'all') {
  if (cx.zg) return zgCar(cx, kind, x, y, f, wheel, tilt, flip, part);
  const K = '#1b0b2e',
    focus = kind === 'focus',
    shape = pts => {
      cx.beginPath();
      cx.moveTo(...pts[0]);
      for (const p of pts.slice(1)) cx.lineTo(...p);
      cx.closePath();
    };
  cx.save();
  cx.translate(x, y);
  cx.scale(f, 1);
  if (flip) {
    cx.translate(0, -50 - Math.sin(flip) * 60);
    cx.rotate(flip);
    cx.translate(0, 50);
  } else if (tilt) {
    cx.translate(focus ? -58 : -46, 0);
    cx.rotate(tilt);
    cx.translate(focus ? 58 : 46, 0);
  }
  const body = focus
    ? [
        [-96, -16],
        [-97, -50],
        [-86, -88],
        [-14, -92],
        [28, -88],
        [54, -60],
        [92, -52],
        [99, -32],
        [97, -16],
      ]
    : [
        [-72, -16],
        [-74, -84],
        [-62, -100],
        [8, -100],
        [52, -60],
        [74, -46],
        [77, -26],
        [73, -16],
      ];
  const belt = focus ? -54 : -56; // the doors' top: under it, in front of him
  if (part === 'front') {
    cx.beginPath();
    cx.rect(-140, belt, 280, 100);
    cx.clip();
  }
  const glass = focus
    ? [
        [-80, -82],
        [-14, -86],
        [24, -83],
        [46, -60],
        [-86, -56],
      ]
    : [
        [-64, -94],
        [4, -94],
        [42, -62],
        [-68, -58],
      ];
  cx.lineJoin = 'round';
  cx.lineWidth = 5;
  cx.strokeStyle = K;
  shape(body);
  cx.stroke();
  cx.fillStyle = focus ? '#2457b8' : '#c8ccd2';
  cx.fill();
  cx.save();
  shape(body);
  cx.clip();
  cx.fillStyle = focus ? '#183e86' : '#9aa0a8';
  cx.fillRect(-110, -38, 220, 30);
  cx.restore(); // the sills, darker
  cx.fillStyle = 'rgba(159, 211, 255, .45)';
  shape(glass);
  cx.fill();
  cx.lineWidth = 2.5;
  cx.stroke();
  cx.strokeStyle = K;
  cx.lineWidth = 3;
  cx.beginPath();
  cx.moveTo(-24, focus ? -86 : -94);
  cx.lineTo(-24, -18);
  cx.stroke(); // the door's edge
  if (focus) {
    cx.fillStyle = '#e43b44';
    shape([
      [-97, -50],
      [-92, -80],
      [-86, -80],
      [-90, -48],
    ]);
    cx.fill(); // the tall tail light, the Focus's own
    cx.fillStyle = '#fff6c8';
    shape([
      [86, -54],
      [98, -48],
      [98, -40],
      [88, -42],
    ]);
    cx.fill();
    cx.fillStyle = '#1c3f94';
    cx.strokeStyle = '#dfe9f2';
    cx.lineWidth = 1.5;
    cx.beginPath();
    cx.ellipse(80, -34, 8, 4.5, 0, 0, Math.PI * 2);
    cx.fill();
    cx.stroke();
    zeCarName(cx, 'FORD FOCUS', -8, f, 13, '#ffffff', '#0f2a66');
  } else {
    cx.fillStyle = '#e43b44';
    cx.fillRect(-75, -68, 5, 18);
    cx.fillStyle = '#fff6c8';
    shape([
      [60, -54],
      [74, -48],
      [74, -42],
      [62, -44],
    ]);
    cx.fill();
    cx.strokeStyle = '#4a4f58';
    cx.lineWidth = 1.6;
    cx.beginPath();
    cx.arc(70, -31, 7, 0, Math.PI * 2);
    cx.stroke(); // the star
    for (const a of [-Math.PI / 2, Math.PI / 6, (Math.PI * 5) / 6]) {
      cx.beginPath();
      cx.moveTo(70, -31);
      cx.lineTo(70 + Math.cos(a) * 7, -31 + Math.sin(a) * 7);
      cx.stroke();
    }
    zeCarName(cx, 'MERCEDES CLASS A', -2, f, 10.5, '#1b0b2e', '#eef0f3');
  }
  for (const wx of focus ? [-58, 62] : [-46, 46]) {
    const r = focus ? 17 : 15;
    cx.fillStyle = K;
    cx.beginPath();
    cx.arc(wx, -r, r + 3, 0, Math.PI * 2);
    cx.fill();
    cx.fillStyle = '#2a2a33';
    cx.beginPath();
    cx.arc(wx, -r, r, 0, Math.PI * 2);
    cx.fill();
    cx.fillStyle = '#b8bcc4';
    cx.beginPath();
    cx.arc(wx, -r, r * 0.55, 0, Math.PI * 2);
    cx.fill();
    cx.strokeStyle = '#6b6f78';
    cx.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
      const a = wheel + (i * Math.PI * 2) / 5;
      cx.beginPath();
      cx.moveTo(wx, -r);
      cx.lineTo(wx + Math.cos(a) * r * 0.5, -r + Math.sin(a) * r * 0.5);
      cx.stroke();
    }
  }
  if (part === 'front') {
    cx.save();
    shape(body);
    cx.clip();
    cx.fillStyle = K;
    cx.fillRect(-140, belt, 280, 3);
    cx.restore();
  } // the doors' top edge, over his lap
  cx.restore();
}
/** A car's name along its doors, between the glass and the sills, at x along it: unmirrored (the car is drawn mirrored
 *  for f), outlined in the body's own dark or light so it reads on the paint. */
function zeCarName(cx, s, x, f, size, ink, edge) {
  cx.save();
  cx.scale(f, 1);
  cx.font = `italic 900 ${size}px Futura, "Avenir Next Condensed", system-ui, sans-serif`;
  cx.textAlign = 'center';
  cx.textBaseline = 'middle';
  cx.lineJoin = 'round';
  cx.lineWidth = 3;
  cx.strokeStyle = edge;
  cx.strokeText(s, x * f, -46);
  cx.fillStyle = ink;
  cx.fillText(s, x * f, -46);
  cx.restore();
}
/** The scene behind, in layers (2026-10-30, the next round): the sky — the night coming down over the stars and a moon,
 *  a striped sun going down —, Barcelos on the horizon (zeTown, each frame, shifting a little against his run), then
 *  the Minho's hills, Trota's and the rooster on its plinth, and a floor of azulejos from ZE_FRONT down. The sky and
 *  the front are drawn once per size and sky (ze.scene), each in a canvas of its own; a new sky fades in over the last
 *  (ze.was). A sky every three levels (2026-11-01; ZE_SKIES, ZE_SKY_LEVELS): first the sunset, then the blue hour under a full moon, then
 *  the dragon's storm, Minho rain, dawn, then round again — the hills', the town's colours, its windows lit after
 *  dark, a tint over the front. */
const ZE_FRONT = 636;
const ZE_SKIES = [
  {
    name: 'sunset',
    stops: ['#120826', '#2a0f4f', '#b8306b', '#ff9a3d'],
    hills: ['#5a1f63', '#36164a'],
    town: '#41195a',
    lit: 0,
    stars: 90,
    moon: 'crescent',
    sun: { x: 400, y: 790, r: 150, a: '#ffe45c', b: '#ff5e5b', bands: true },
  },
  {
    name: 'blue hour',
    stops: ['#070b24', '#17205a', '#4b3f8e', '#d0708a'],
    hills: ['#28265e', '#181743'],
    town: '#1d1b4a',
    lit: 0.9,
    stars: 150,
    moon: 'full',
    tint: 'rgba(20, 30, 90, .35)',
    sun: { x: 400, y: 880, r: 150, a: '#ff9a6a', b: '#c04a6a', bands: true },
  },
  {
    name: 'storm',
    stops: ['#050208', '#1e0612', '#4a0c18', '#8f1f1a'],
    hills: ['#2a0b1c', '#16060f'],
    town: '#1c0812',
    lit: 0.55,
    litc: '#ff8a4a',
    stars: 0,
    glow: '#ff3a1a',
    tint: 'rgba(60, 0, 15, .45)',
    bolt: true,
  },
  {
    name: 'rain',
    stops: ['#0b1220', '#1b2638', '#334259', '#4d5b70'],
    hills: ['#26303f', '#18202c'],
    town: '#1d2633',
    lit: 0.8,
    stars: 0,
    rain: true,
    clouds: true,
    tint: 'rgba(15, 25, 45, .45)',
  },
  {
    name: 'dawn',
    stops: ['#243a6a', '#5f74ae', '#e7a2a0', '#ffe0a0'],
    hills: ['#6f5a8c', '#46386a'],
    town: '#5c4a7c',
    lit: 0.2,
    stars: 20,
    moon: 'faint',
    tint: 'rgba(255, 200, 180, .08)',
    sun: { x: 540, y: 820, r: 110, a: '#fff2b0', b: '#ffb08a' },
  },
];
const ZE_CLOUDS = [
  [120, 90, 160, 40, '#1f2a3c'],
  [420, 60, 220, 46, '#1a2433'],
  [650, 120, 150, 36, '#222e41'],
  [260, 180, 170, 30, '#28344a'],
  [560, 230, 190, 28, '#2a374d'],
];
const ZE_SKY_LEVELS = 3; // a sky lasts three levels (2026-11-01): the bots' levels came every 17 s, too quick for a whole rig of light
const zeSkyOf = g => (g.phase === 'title' ? 0 : Math.floor((g.level - 1) / ZE_SKY_LEVELS) % ZE_SKIES.length);
function zeScene(c, i) {
  if (ze.scene?.w === c.width && ze.scene.i === i) return ze.scene;
  if (ze.scene?.w === c.width) ze.was = { scene: ze.scene, a: 1 }; // the last sky, fading out over the new
  const P = ZE_SKIES[i],
    layer = (top, h) => {
      const b = document.createElement('canvas'),
        k = c.width / ZE_W;
      b.width = c.width;
      b.height = Math.ceil(h * k);
      const x = b.getContext('2d');
      x.scale(k, k);
      x.translate(0, -top);
      return [b, x];
    };
  const [skyC, x] = layer(0, ZE_FLOOR);
  const sky = x.createLinearGradient(0, 0, 0, ZE_FLOOR);
  P.stops.forEach((col, i) => sky.addColorStop([0, 0.32, 0.7, 1][i], col));
  x.fillStyle = sky;
  x.fillRect(0, 0, ZE_W, ZE_FLOOR);
  if (P.glow) {
    const r = x.createRadialGradient(360, 820, 20, 360, 820, 480);
    r.addColorStop(0, P.glow + '99');
    r.addColorStop(1, P.glow + '00');
    x.fillStyle = r;
    x.fillRect(0, 0, ZE_W, ZE_FLOOR);
  } // the storm's fire on the hills
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647; // the same stars every time
  for (let i = 0; i < P.stars; i++) {
    const sy = rnd() ** 1.6 * 420;
    x.globalAlpha = 0.25 + 0.75 * (1 - sy / 420) * rnd();
    x.fillStyle = '#fff6e0';
    x.fillRect(rnd() * ZE_W, sy, rnd() < 0.15 ? 2 : 1.2, rnd() < 0.15 ? 2 : 1.2);
  }
  x.globalAlpha = 1;
  if (P.moon === 'crescent' || P.moon === 'faint') {
    // a new moon's crescent, the sky cut out of it — faint at dawn
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
    // the blue hour's full moon, its halo and its seas
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
    const S = P.sun,
      sun = x.createLinearGradient(0, S.y - S.r, 0, S.y + S.r);
    sun.addColorStop(0, S.a);
    sun.addColorStop(1, S.b);
    x.save();
    x.beginPath();
    x.arc(S.x, S.y, S.r, 0, Math.PI * 2);
    x.clip();
    x.fillStyle = sun;
    x.fillRect(S.x - S.r, S.y - S.r, S.r * 2, S.r * 2);
    if (S.bands) {
      x.fillStyle = sky;
      for (let i = 0; i < 6; i++) x.fillRect(S.x - S.r, S.y - 60 + i * 18, S.r * 2, 2 + i * 2);
    }
    x.restore();
  }
  if (P.clouds)
    for (const [cx2, cy2, rx, ry, col] of ZE_CLOUDS) {
      x.fillStyle = col;
      x.beginPath();
      x.ellipse(cx2, cy2, rx, ry, 0, 0, Math.PI * 2);
      x.fill();
    }
  const [front, y] = layer(ZE_FRONT, ZE_H - ZE_FRONT);
  const hills = (col, base, amp, step, ph) => {
    y.fillStyle = col;
    y.beginPath();
    y.moveTo(0, ZE_FLOOR);
    for (let i = 0; i <= ZE_W; i += 10)
      y.lineTo(i, base - amp * (Math.sin(i / step + ph) * 0.6 + Math.sin(i / (step * 0.37) + ph * 2) * 0.4));
    y.lineTo(ZE_W, ZE_FLOOR);
    y.fill();
  };
  hills(P.hills[0], 776, 30, 90, 1);
  hills(P.hills[1], 810, 20, 60, 4);
  zeRestaurant(y);
  zeGaloArt(y, 110, ZE_FLOOR, 1.35);
  y.fillStyle = '#1b0b2e';
  y.fillRect(0, ZE_FLOOR, ZE_W, 3);
  for (let row = 0; row < 2; row++)
    for (let col = 0; col * 29 < ZE_W; col++) {
      // azulejos: a blue rosette at every corner
      const tx = col * 29,
        ty = ZE_FLOOR + 3 + row * 29;
      y.fillStyle = row ? '#d9d2e6' : '#ece6f4';
      y.fillRect(tx, ty, 29, 29);
      y.fillStyle = '#2b4fa8';
      for (const [cx2, cy2] of [
        [0, 0],
        [29, 0],
        [0, 29],
        [29, 29],
      ]) {
        y.beginPath();
        y.arc(tx + cx2, ty + cy2, 8, 0, Math.PI * 2);
        y.fill();
      }
      y.beginPath();
      y.moveTo(tx + 14.5, ty + 8);
      y.lineTo(tx + 21, ty + 14.5);
      y.lineTo(tx + 14.5, ty + 21);
      y.lineTo(tx + 8, ty + 14.5);
      y.fill();
    }
  const dusk = y.createLinearGradient(0, ZE_FLOOR, 0, ZE_H);
  dusk.addColorStop(0, 'rgba(60, 20, 80, .25)');
  dusk.addColorStop(1, 'rgba(30, 8, 45, .6)');
  y.fillStyle = dusk;
  y.fillRect(0, ZE_FLOOR + 3, ZE_W, ZE_H - ZE_FLOOR);
  if (P.tint) {
    y.globalCompositeOperation = 'source-atop';
    y.fillStyle = P.tint;
    y.fillRect(0, 0, ZE_W, ZE_H);
  }
  return (ze.scene = { w: c.width, i, sky: skyC, front, P });
}
/** Barcelos across the Cávado, one silhouette between the sun and the hills (2026-10-30, the next round): houses, the
 *  Torre da Porta Nova, the Igreja Matriz and its tower, the Paço dos Condes' ruin and its chimneys, the dome of Bom
 *  Jesus da Cruz — its windows lit after dark. ox: how far it has shifted. */
const ZE_HOUSES = [
  [146, 26, 40, 11],
  [174, 30, 52, 12],
  [244, 18, 62, 8],
  [344, 8, 56, 5],
  [410, 13, 58, 7],
  [478, 22, 50, 9],
  [540, 16, 60, 8],
];
const ZE_LIT = [
  [220, 662, 4, 7],
  [229, 704, 4, 7],
  [330, 678, 3, 6],
  [336, 678, 3, 6],
  [160, 760, 4, 4],
  [186, 750, 4, 4],
  [196, 750, 4, 4],
  [252, 744, 4, 4],
  [432, 732, 3, 6],
  [456, 732, 3, 6],
  [414, 756, 3, 4],
  [492, 756, 4, 4],
  [560, 760, 4, 4],
];
function zeTown(x, P, ox) {
  x.save();
  x.translate(ox, 0);
  x.fillStyle = P.town;
  const base = 792;
  for (const [hx, w, h, r] of ZE_HOUSES) {
    x.fillRect(hx, base - h, w, h);
    x.beginPath();
    x.moveTo(hx - 2, base - h);
    x.lineTo(hx + w / 2, base - h - r);
    x.lineTo(hx + w + 2, base - h);
    x.fill();
  }
  x.fillRect(206, 642, 36, 150);
  x.fillRect(202, 636, 44, 7);
  for (let i = 0; i < 4; i++) x.fillRect(202 + i * 12.3, 626, 7, 11); // the Torre da Porta Nova
  x.fillRect(262, 712, 58, 80);
  x.beginPath();
  x.moveTo(258, 713);
  x.lineTo(291, 688);
  x.lineTo(324, 713);
  x.fill(); // the Igreja Matriz…
  x.fillRect(322, 662, 22, 130);
  x.beginPath();
  x.moveTo(319, 663);
  x.lineTo(333, 644);
  x.lineTo(347, 663);
  x.fill(); // …and its tower
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
  ])
    x.lineTo(a, b);
  x.fill(); // the Paço dos Condes
  x.fillRect(364, 674, 7, 36);
  x.fillRect(362, 670, 11, 5);
  x.fillRect(391, 668, 7, 38);
  x.fillRect(389, 664, 11, 5); // its chimneys
  x.fillRect(422, 702, 46, 90);
  x.beginPath();
  x.arc(445, 703, 23, Math.PI, 0);
  x.fill(); // Bom Jesus da Cruz
  x.fillRect(441, 670, 8, 14);
  x.beginPath();
  x.arc(445, 671, 5, Math.PI, 0);
  x.fill();
  x.fillRect(444, 654, 2, 12);
  x.fillRect(441, 658, 8, 2);
  if (P.lit) {
    x.fillStyle = P.litc || '#ffd77a';
    x.globalAlpha = P.lit;
    for (const [wx, wy, w, h] of ZE_LIT) x.fillRect(wx, wy, w, h);
    x.beginPath();
    x.arc(291, 728, 4, 0, Math.PI * 2);
    x.fill();
    x.globalAlpha = 1;
  }
  x.restore();
}
/** Trota's (2026-10-30, later): the restaurant of the 8-bit game this one learnt from, behind him at the right — a
 *  cornice, wall lamps, a striped awning, warm windows with their tables, a green door, azulejos at its foot, its sign
 *  on the roof. The sign's bulbs chase each other per frame (zeBulbs), faster and red while the dragon is out. */
const ZE_REST = { x: 470, w: 200, top: ZE_FLOOR - 130 },
  ZE_SIGN = { x: 490, y: ZE_FLOOR - 194, w: 160, h: 42 };
const ZE_BULBS = (() => {
  const b = [],
    { x, y, w, h } = ZE_SIGN;
  for (let bx = x + 4; bx <= x + w - 4; bx += 8) b.push([bx, y], [bx, y + h]);
  for (let by = y + 8; by <= y + h - 8; by += 8) b.push([x, by], [x + w, by]);
  return b;
})();
// what stands up to be stood on (G4, 2026-10-30, the next round): the awning's top and the sign's, and what falls
// bounces off them
const ZE_PLATS = [
  { l: ZE_REST.x - 5, r: ZE_REST.x + ZE_REST.w + 5, y: ZE_REST.top + 16, name: 'awning' },
  { l: ZE_SIGN.x - 3, r: ZE_SIGN.x + ZE_SIGN.w + 3, y: ZE_SIGN.y - 3, name: 'sign' },
];
/** The ground under a point at x whose feet are at y: the highest of the awning, the sign or the floor at or below it. */
const zePlatform = (x, y) =>
  ZE_PLATS.reduce((gy, p) => (x >= p.l && x <= p.r && y <= p.y + 0.5 && p.y < gy ? p.y : gy), ZE_FLOOR);
function zeRestaurant(x) {
  const { x: RX, w: RW, top: RT } = ZE_REST,
    K = '#1b0b2e',
    F = ZE_FLOOR,
    AY = RT + 18;
  x.fillStyle = K;
  x.fillRect(RX - 5, RT - 8, RW + 10, F - RT + 8);
  x.fillStyle = '#7a4630';
  x.fillRect(RX - 4, RT - 7, RW + 8, 6);
  x.fillStyle = '#c47a4a';
  x.fillRect(RX - 4, RT - 7, RW + 8, 2);
  x.fillStyle = '#d9bd9e';
  x.fillRect(RX, RT, RW, F - RT);
  for (const lx of [RX + 28, RX + RW - 36]) {
    x.fillStyle = K;
    x.fillRect(lx - 2, RT + 3, 12, 12);
    x.fillStyle = '#fee761';
    x.fillRect(lx, RT + 5, 8, 8);
  }
  for (let i = 0, sx = RX - 5; sx < RX + RW + 5; i++, sx += 8) {
    // the awning, a scallop a stripe
    x.fillStyle = i % 2 ? '#fff6e0' : '#e43b44';
    x.fillRect(sx, AY, 8, 12);
    x.beginPath();
    x.arc(sx + 4, AY + 12, 4, 0, Math.PI);
    x.fill();
  }
  x.fillStyle = K;
  x.fillRect(RX - 5, AY - 2, RW + 10, 2);
  for (const wx of [RX + 12, RX + RW - 72]) {
    // warm windows, two tables each, a plate on each
    x.fillStyle = K;
    x.fillRect(wx - 3, AY + 26, 66, 52);
    x.fillStyle = '#24643a';
    x.fillRect(wx - 1.5, AY + 27.5, 63, 49);
    x.fillStyle = '#fee761';
    x.fillRect(wx + 2, AY + 31, 56, 42);
    x.fillStyle = '#feae34';
    x.fillRect(wx + 2, AY + 56, 56, 17);
    for (const tx of [wx + 8, wx + 36]) {
      x.fillStyle = '#7a4630';
      x.fillRect(tx - 2, AY + 54, 18, 3);
      x.fillRect(tx + 6, AY + 57, 3, 16);
      x.fillStyle = '#fff6e0';
      x.fillRect(tx + 3, AY + 51, 8, 3);
    }
    x.fillStyle = '#24643a';
    x.fillRect(wx + 28.5, AY + 31, 3, 42);
  }
  const DX = RX + RW / 2 - 18,
    DY = AY + 22;
  x.fillStyle = K;
  x.fillRect(DX - 2, DY - 2, 40, F - DY + 2);
  x.fillStyle = '#2f8f4e';
  x.fillRect(DX, DY, 36, F - DY);
  x.fillStyle = '#24643a';
  x.fillRect(DX + 17, DY, 2, F - DY);
  x.fillStyle = '#fee761';
  x.fillRect(DX + 5, DY + 6, 8, 16);
  x.fillRect(DX + 23, DY + 6, 8, 16);
  x.strokeStyle = '#3f8fe0';
  x.lineWidth = 1.2;
  for (let tx = RX; tx + 10 <= RX + RW; tx += 10)
    if (tx + 10 <= DX - 2 || tx >= DX + 38) {
      x.fillStyle = '#eaf2fb';
      x.fillRect(tx, F - 20, 10, 20);
      x.strokeRect(tx + 0.6, F - 19.4, 8.8, 8.8);
      x.strokeRect(tx + 0.6, F - 9.4, 8.8, 8.8);
    }
  const { x: SX, y: SY, w: SW, h: SH } = ZE_SIGN;
  for (const px of [SX + 26, SX + SW - 32]) {
    x.fillStyle = K;
    x.fillRect(px - 1.5, SY + SH, 9, RT - 7 - SY - SH);
    x.fillStyle = '#566c86';
    x.fillRect(px, SY + SH, 6, RT - 7 - SY - SH);
  }
  x.fillStyle = K;
  x.fillRect(SX - 3, SY - 3, SW + 6, SH + 6);
  x.fillStyle = '#7a2a3a';
  x.fillRect(SX, SY, SW, SH);
  x.fillStyle = '#b13e53';
  x.fillRect(SX + 4, SY + 4, SW - 8, SH - 8);
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.font = 'italic 900 22px Futura, "Avenir Next Condensed", system-ui, sans-serif';
  x.fillStyle = '#4a1426';
  x.fillText("TROTA'S", SX + SW / 2 + 2, SY + 18 + 2);
  x.fillStyle = '#fee761';
  x.fillText("TROTA'S", SX + SW / 2, SY + 18);
  x.font = '700 7px Futura, system-ui, sans-serif';
  x.fillStyle = '#ffcd75';
  x.fillText('R E S T A U R A N T E', SX + SW / 2, SY + 33);
}
function zeBulbs(cx, g) {
  const phase = zeCalm() ? 0 : Math.floor(g.t * (g.dragon ? 16 : 6));
  ZE_BULBS.forEach(([x, y], i) => {
    cx.fillStyle = (i + phase) % 3 ? (g.dragon ? '#ff5a64' : '#fff6c8') : '#7a4630';
    cx.fillRect(x - 2, y - 2, 4, 4);
  });
}
/** The rooster of Barcelos: black, his comb red, his body painted with hearts and dots — standing on a plinth. */
function zeGaloArt(x, at, floor, s) {
  x.save();
  x.translate(at, floor);
  x.scale(s, s);
  x.fillStyle = '#241433';
  x.fillRect(-36, -22, 72, 22);
  x.fillRect(-30, -28, 60, 6);
  x.strokeStyle = '#151018';
  x.lineWidth = 5;
  x.lineCap = 'round';
  x.beginPath();
  x.moveTo(-6, -28);
  x.lineTo(-6, -52);
  x.moveTo(8, -28);
  x.lineTo(8, -52);
  x.stroke();
  x.fillStyle = '#151018';
  x.beginPath();
  x.moveTo(-24, -86);
  x.bezierCurveTo(-40, -150, -88, -132, -72, -92);
  x.bezierCurveTo(-62, -72, -46, -62, -24, -58);
  x.fill();
  x.beginPath();
  x.moveTo(-22, -78);
  x.bezierCurveTo(-60, -118, -96, -90, -64, -62);
  x.lineTo(-24, -58);
  x.fill();
  x.beginPath();
  x.ellipse(0, -72, 36, 24, -0.15, 0, Math.PI * 2);
  x.fill();
  x.beginPath();
  x.moveTo(14, -90);
  x.lineTo(28, -128);
  x.lineTo(44, -122);
  x.lineTo(32, -78);
  x.fill();
  x.beginPath();
  x.arc(36, -124, 12, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = '#e8322f';
  for (const [cx2, cy2] of [
    [28, -137],
    [35, -140],
    [42, -137],
  ]) {
    x.beginPath();
    x.arc(cx2, cy2, 5.5, 0, Math.PI * 2);
    x.fill();
  }
  x.beginPath();
  x.ellipse(45, -110, 4, 6, 0, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = '#ffcc33';
  x.beginPath();
  x.moveTo(46, -128);
  x.lineTo(58, -122);
  x.lineTo(46, -117);
  x.fill();
  x.fillStyle = '#fff';
  x.beginPath();
  x.arc(39, -126, 2.4, 0, Math.PI * 2);
  x.fill();
  const heart = (hx, hy, r, c) => {
    x.fillStyle = c;
    x.beginPath();
    x.moveTo(hx, hy + r);
    x.bezierCurveTo(hx - r * 1.8, hy - r * 0.2, hx - r, hy - r * 1.6, hx, hy - r * 0.7);
    x.bezierCurveTo(hx + r, hy - r * 1.6, hx + r * 1.8, hy - r * 0.2, hx, hy + r);
    x.fill();
  };
  heart(0, -74, 9, '#e8322f');
  heart(-22, -70, 5, '#ffcc33');
  heart(18, -66, 5, '#3f8fe0');
  for (const [dx, dy, c] of [
    [-52, -112, '#ffcc33'],
    [-60, -96, '#e8322f'],
    [-44, -94, '#3f8fe0'],
    [-70, -82, '#5cbf4a'],
    [26, -96, '#ffcc33'],
    [-10, -58, '#5cbf4a'],
    [8, -86, '#ffcc33'],
  ]) {
    x.fillStyle = c;
    x.beginPath();
    x.arc(dx, dy, 2.6, 0, Math.PI * 2);
    x.fill();
  }
  x.restore();
}
