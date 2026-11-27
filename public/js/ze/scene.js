/** Zé, his feet at (game.x, game.y), in pixels (zeBuild): his pose — standing, running, kicking, in the air, seated in a car
 *  and pitching with it —, as big as his bulk and the dragon make him; blinking while a green's hit lasts; at the K.O.
 *  his bones, flat on his back, seeing stars. */
function zeHero(cx, game) {
  const air = game.y < game.gy - 0.5;
  const over = game.phase === 'over' && game.koT >= ZE_KO_T;
  const moving = Math.abs(game.vx) > 30 && !air && game.phase === 'play' && !game.ride;

  const scale = zeSz(game) * (1 + game.pump * 0.25);
  const pixel = ZE_PX * scale;
  const flip = game.f < 0 && !over;

  const pose = over
    ? 'bones'
    : game.ride
      ? 'sit'
      : game.kick > 0.04
        ? 'kick'
        : air
          ? 'jump'
          : game.flex > 0
            ? 'flex'
            : moving
              ? Math.floor(game.run) % 2
                ? 'run1'
                : 'run2'
              : 'stand';

  const open = game.chomp > 0 ? Math.floor(game.chomp * 20) % 2 === 0 : game.gape;

  const spr = zeBuild(Math.max(0, game.mass), pose, {
    open,
    agent: game.agent,
    shades: ze.mossad,
    sick: game.hurt > 0.9 || game.phase === 'over',
    flip,
  });

  const bob = over || game.ride ? 0 : moving ? -Math.abs(Math.cos(game.run)) * 3 : Math.sin(game.t * 3) * 1.2;
  const tw = zeTw(game);

  const under = zePlatform(game.x, game.y); // his shadow, on whatever is under him

  if (!cx.zg) {
    cx.fillStyle = 'rgba(20, 8, 30, .35)';
    cx.beginPath();

    cx.ellipse(
      game.x,
      under + 3,
      Math.max(10, tw + 10 - (under - game.y) * 0.05) * scale,
      5 * scale,
      0,
      0,
      Math.PI * 2,
    );

    cx.fill();
  }

  cx.save();

  cx.translate(
    game.x + (game.mass === 1 && game.phase === 'play' && !zeCalm() ? Math.sin(game.t * 70) * 1.6 : 0),
    game.y,
  ); // on his last bit of bulk he shivers

  if (game.ride) {
    const pv = game.ride.kind === 'focus' ? -58 : -46;

    cx.scale(game.f, 1);
    cx.translate(pv, 0);
    cx.rotate(game.ride.tilt);
    cx.translate(-pv, 0);
    cx.scale(game.f, 1);
    cx.translate(-14 * game.f, 16);
  } // in the driver's seat, pitching with his car

  if (game.hurt > 0 && !over) cx.globalAlpha = zeCalm() ? 0.65 : Math.floor(game.hurt * 12) % 2 ? 0.4 : 1;

  if (over) {
    // K.O.: flat on his back, his feet where they stood — and seeing stars
    cx.translate(0, -14 * pixel);
    cx.scale(game.f, 1);
    cx.rotate(-Math.PI / 2);
    zeBlit(cx, spr, 0, 0, pixel, false);
    cx.restore();

    for (let star = 0; star < 3; star++) {
      const angle = game.t * 3 + (star * Math.PI * 2) / 3;
      const sx = game.x - game.f * 50 * pixel + Math.cos(angle) * 30;
      const sy = game.y - 30 * pixel + Math.sin(angle) * 8;

      cx.fillStyle = '#ffd23f';
      cx.beginPath();

      for (let point = 0; point < 10; point++) {
        const radius = point % 2 ? 2.5 : 6;
        const pointAngle = (point * Math.PI) / 5 - Math.PI / 2;

        cx.lineTo(sx + Math.cos(pointAngle) * radius, sy + Math.sin(pointAngle) * radius);
      }

      cx.fill();
    }

    return;
  }

  const squash = game.sq;
  const amount = squash ? squash.t / squash.d : 0; // squashed or stretched about his feet

  const [sx, sy] = !squash
    ? [1, 1]
    : squash.k === 'land'
      ? [1 + 0.2 * amount, 1 - 0.17 * amount]
      : squash.k === 'jump'
        ? [1 - 0.12 * amount, 1 + 0.15 * amount]
        : [1 + 0.1 * amount, 1 - 0.08 * amount];

  zeBlit(cx, spr, 0, bob * scale, pixel, flip, sx, sy);

  if (game.dragon) {
    // the dragon's aura round his head
    cx.save();
    cx.shadowColor = '#ff7a2a';
    cx.shadowBlur = 16;
    cx.lineWidth = 3;
    cx.strokeStyle = zeBlink(game, 9) ? '#ff7a2a' : '#ffd23f';
    cx.beginPath();
    cx.ellipse(0, (bob - 48 * ZE_PX) * scale, 12 * pixel, 13.5 * pixel, 0, 0, Math.PI * 2);
    cx.stroke();
    cx.restore();
  }

  cx.restore();
}

/** The cars, side on, their wheels on the floor at atX, their front towards facing: the Focus — Ford blue, the tall tail light
 *  up its back pillar, the oval on its nose —, the A-Class — silver, short and tall, the star on its nose —, each its
 *  name along its doors (zeCarName), read the right way whichever way it faces. He sits in it, seen above its doors:
 *  part 'back' is the whole car, drawn before him, 'front' its doors and wheels again over his lap, a beltline along
 *  their top. tilt pitches it on its rear wheel; flip turns it over its middle onto its roof, with a hop. */
function zeCar(cx, kind, atX, atY, facing, wheel, tilt, flip, part = 'all') {
  if (cx.zg) return zgCar(cx, kind, atX, atY, facing, wheel, tilt, flip, part);

  const OUTLINE = '#1b0b2e';
  const focus = kind === 'focus';

  const shape = pts => {
    cx.beginPath();
    cx.moveTo(...pts[0]);
    for (const point of pts.slice(1)) cx.lineTo(...point);
    cx.closePath();
  };

  cx.save();
  cx.translate(atX, atY);
  cx.scale(facing, 1);

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
  cx.strokeStyle = OUTLINE;
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
  cx.strokeStyle = OUTLINE;
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
    zeCarName(cx, 'FORD FOCUS', -8, facing, 13, '#ffffff', '#0f2a66');
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

    for (const angle of [-Math.PI / 2, Math.PI / 6, (Math.PI * 5) / 6]) {
      cx.beginPath();
      cx.moveTo(70, -31);
      cx.lineTo(70 + Math.cos(angle) * 7, -31 + Math.sin(angle) * 7);
      cx.stroke();
    }

    zeCarName(cx, 'MERCEDES CLASS A', -2, facing, 10.5, '#1b0b2e', '#eef0f3');
  }

  for (const wx of focus ? [-58, 62] : [-46, 46]) {
    const radius = focus ? 17 : 15;

    cx.fillStyle = OUTLINE;
    cx.beginPath();
    cx.arc(wx, -radius, radius + 3, 0, Math.PI * 2);
    cx.fill();
    cx.fillStyle = '#2a2a33';
    cx.beginPath();
    cx.arc(wx, -radius, radius, 0, Math.PI * 2);
    cx.fill();
    cx.fillStyle = '#b8bcc4';
    cx.beginPath();
    cx.arc(wx, -radius, radius * 0.55, 0, Math.PI * 2);
    cx.fill();
    cx.strokeStyle = '#6b6f78';
    cx.lineWidth = 2;

    for (let spoke = 0; spoke < 5; spoke++) {
      const angle = wheel + (spoke * Math.PI * 2) / 5;

      cx.beginPath();
      cx.moveTo(wx, -radius);
      cx.lineTo(wx + Math.cos(angle) * radius * 0.5, -radius + Math.sin(angle) * radius * 0.5);
      cx.stroke();
    }
  }

  if (part === 'front') {
    cx.save();
    shape(body);
    cx.clip();
    cx.fillStyle = OUTLINE;
    cx.fillRect(-140, belt, 280, 3);
    cx.restore();
  } // the doors' top edge, over his lap

  cx.restore();
}

/** A car's name along its doors, between the glass and the sills, at offset along it: unmirrored (the car is drawn mirrored
 *  for facing), outlined in the body's own dark or light so it reads on the paint. */
function zeCarName(cx, text, offset, facing, size, ink, edge) {
  cx.save();
  cx.scale(facing, 1);
  cx.font = `italic 900 ${size}px Futura, "Avenir Next Condensed", system-ui, sans-serif`;
  cx.textAlign = 'center';
  cx.textBaseline = 'middle';
  cx.lineJoin = 'round';
  cx.lineWidth = 3;
  cx.strokeStyle = edge;
  cx.strokeText(text, offset * facing, -46);
  cx.fillStyle = ink;
  cx.fillText(text, offset * facing, -46);
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
const zeSkyOf = game => (game.phase === 'title' ? 0 : Math.floor((game.level - 1) / ZE_SKY_LEVELS) % ZE_SKIES.length);

function zeScene(canvas, skyIndex) {
  if (ze.scene?.w === canvas.width && ze.scene.i === skyIndex) return ze.scene;
  if (ze.scene?.w === canvas.width) ze.was = { scene: ze.scene, a: 1 }; // the last sky, fading out over the new

  const look = ZE_SKIES[skyIndex];

  const layer = (top, height) => {
    const layerCanvas = document.createElement('canvas');
    const scale = canvas.width / ZE_W;

    layerCanvas.width = canvas.width;
    layerCanvas.height = Math.ceil(height * scale);
    const cx = layerCanvas.getContext('2d');

    cx.scale(scale, scale);
    cx.translate(0, -top);
    return [layerCanvas, cx];
  };

  const [skyC, skyCx] = layer(0, ZE_FLOOR);
  const sky = skyCx.createLinearGradient(0, 0, 0, ZE_FLOOR);

  look.stops.forEach((col, index) => sky.addColorStop([0, 0.32, 0.7, 1][index], col));
  skyCx.fillStyle = sky;
  skyCx.fillRect(0, 0, ZE_W, ZE_FLOOR);

  if (look.glow) {
    const gradient = skyCx.createRadialGradient(360, 820, 20, 360, 820, 480);

    gradient.addColorStop(0, `${look.glow}99`);
    gradient.addColorStop(1, `${look.glow}00`);
    skyCx.fillStyle = gradient;
    skyCx.fillRect(0, 0, ZE_W, ZE_FLOOR);
  } // the storm's fire on the hills

  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647; // the same stars every time

  for (let star = 0; star < look.stars; star++) {
    const sy = rnd() ** 1.6 * 420;

    skyCx.globalAlpha = 0.25 + 0.75 * (1 - sy / 420) * rnd();
    skyCx.fillStyle = '#fff6e0';
    skyCx.fillRect(rnd() * ZE_W, sy, rnd() < 0.15 ? 2 : 1.2, rnd() < 0.15 ? 2 : 1.2);
  }

  skyCx.globalAlpha = 1;

  if (look.moon === 'crescent' || look.moon === 'faint') {
    // a new moon's crescent, the sky cut out of it — faint at dawn
    skyCx.globalAlpha = look.moon === 'faint' ? 0.45 : 1;
    skyCx.fillStyle = '#fff3c4';
    skyCx.beginPath();
    skyCx.arc(118, 132, 26, 0, Math.PI * 2);
    skyCx.fill();
    skyCx.globalAlpha = 1;
    skyCx.fillStyle = sky;
    skyCx.beginPath();
    skyCx.arc(130, 124, 24, 0, Math.PI * 2);
    skyCx.fill();
  }

  if (look.moon === 'full') {
    // the blue hour's full moon, its halo and its seas
    const halo = skyCx.createRadialGradient(590, 150, 10, 590, 150, 90);

    halo.addColorStop(0, 'rgba(220, 230, 255, .35)');
    halo.addColorStop(1, 'rgba(220, 230, 255, 0)');
    skyCx.fillStyle = halo;
    skyCx.fillRect(490, 50, 200, 200);
    skyCx.fillStyle = '#e8eeff';
    skyCx.beginPath();
    skyCx.arc(590, 150, 24, 0, Math.PI * 2);
    skyCx.fill();
    skyCx.fillStyle = '#c9d2ee';

    for (const [mx, my, mr] of [
      [583, 145, 5],
      [597, 158, 3.5],
      [594, 141, 2.5],
    ]) {
      skyCx.beginPath();
      skyCx.arc(mx, my, mr, 0, Math.PI * 2);
      skyCx.fill();
    }
  }

  if (look.sun) {
    const sunLook = look.sun;
    const sun = skyCx.createLinearGradient(0, sunLook.y - sunLook.r, 0, sunLook.y + sunLook.r);

    sun.addColorStop(0, sunLook.a);
    sun.addColorStop(1, sunLook.b);
    skyCx.save();
    skyCx.beginPath();
    skyCx.arc(sunLook.x, sunLook.y, sunLook.r, 0, Math.PI * 2);
    skyCx.clip();
    skyCx.fillStyle = sun;
    skyCx.fillRect(sunLook.x - sunLook.r, sunLook.y - sunLook.r, sunLook.r * 2, sunLook.r * 2);

    if (sunLook.bands) {
      skyCx.fillStyle = sky;

      for (let band = 0; band < 6; band++) {
        skyCx.fillRect(sunLook.x - sunLook.r, sunLook.y - 60 + band * 18, sunLook.r * 2, 2 + band * 2);
      }
    }

    skyCx.restore();
  }

  if (look.clouds) {
    for (const [cx2, cy2, rx, ry, col] of ZE_CLOUDS) {
      skyCx.fillStyle = col;
      skyCx.beginPath();
      skyCx.ellipse(cx2, cy2, rx, ry, 0, 0, Math.PI * 2);
      skyCx.fill();
    }
  }

  const [front, frontCx] = layer(ZE_FRONT, ZE_H - ZE_FRONT);

  const hills = (col, base, amp, step, ph) => {
    frontCx.fillStyle = col;
    frontCx.beginPath();
    frontCx.moveTo(0, ZE_FLOOR);

    for (let atX = 0; atX <= ZE_W; atX += 10) {
      frontCx.lineTo(
        atX,
        base - amp * (Math.sin(atX / step + ph) * 0.6 + Math.sin(atX / (step * 0.37) + ph * 2) * 0.4),
      );
    }

    frontCx.lineTo(ZE_W, ZE_FLOOR);
    frontCx.fill();
  };

  hills(look.hills[0], 776, 30, 90, 1);
  hills(look.hills[1], 810, 20, 60, 4);
  zeRestaurant(frontCx);
  zeGaloArt(frontCx, 110, ZE_FLOOR, 1.35);
  frontCx.fillStyle = '#1b0b2e';
  frontCx.fillRect(0, ZE_FLOOR, ZE_W, 3);

  for (let row = 0; row < 2; row++) {
    for (let col = 0; col * 29 < ZE_W; col++) {
      // azulejos: a blue rosette at every corner
      const tx = col * 29;
      const ty = ZE_FLOOR + 3 + row * 29;

      frontCx.fillStyle = row ? '#d9d2e6' : '#ece6f4';
      frontCx.fillRect(tx, ty, 29, 29);
      frontCx.fillStyle = '#2b4fa8';

      for (const [cx2, cy2] of [
        [0, 0],
        [29, 0],
        [0, 29],
        [29, 29],
      ]) {
        frontCx.beginPath();
        frontCx.arc(tx + cx2, ty + cy2, 8, 0, Math.PI * 2);
        frontCx.fill();
      }

      frontCx.beginPath();
      frontCx.moveTo(tx + 14.5, ty + 8);
      frontCx.lineTo(tx + 21, ty + 14.5);
      frontCx.lineTo(tx + 14.5, ty + 21);
      frontCx.lineTo(tx + 8, ty + 14.5);
      frontCx.fill();
    }
  }

  const dusk = frontCx.createLinearGradient(0, ZE_FLOOR, 0, ZE_H);

  dusk.addColorStop(0, 'rgba(60, 20, 80, .25)');
  dusk.addColorStop(1, 'rgba(30, 8, 45, .6)');
  frontCx.fillStyle = dusk;
  frontCx.fillRect(0, ZE_FLOOR + 3, ZE_W, ZE_H - ZE_FLOOR);

  if (look.tint) {
    frontCx.globalCompositeOperation = 'source-atop';
    frontCx.fillStyle = look.tint;
    frontCx.fillRect(0, 0, ZE_W, ZE_H);
  }

  return (ze.scene = { w: canvas.width, i: skyIndex, sky: skyC, front, P: look });
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

function zeTown(cx, look, ox) {
  cx.save();
  cx.translate(ox, 0);
  cx.fillStyle = look.town;
  const base = 792;

  for (const [hx, width, height, roof] of ZE_HOUSES) {
    cx.fillRect(hx, base - height, width, height);
    cx.beginPath();
    cx.moveTo(hx - 2, base - height);
    cx.lineTo(hx + width / 2, base - height - roof);
    cx.lineTo(hx + width + 2, base - height);
    cx.fill();
  }

  cx.fillRect(206, 642, 36, 150);
  cx.fillRect(202, 636, 44, 7);
  for (let merlon = 0; merlon < 4; merlon++) cx.fillRect(202 + merlon * 12.3, 626, 7, 11); // the Torre da Porta Nova
  cx.fillRect(262, 712, 58, 80);
  cx.beginPath();
  cx.moveTo(258, 713);
  cx.lineTo(291, 688);
  cx.lineTo(324, 713);
  cx.fill(); // the Igreja Matriz…
  cx.fillRect(322, 662, 22, 130);
  cx.beginPath();
  cx.moveTo(319, 663);
  cx.lineTo(333, 644);
  cx.lineTo(347, 663);
  cx.fill(); // …and its tower
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
    cx.lineTo(pointX, pointY);
  }

  cx.fill(); // the Paço dos Condes
  cx.fillRect(364, 674, 7, 36);
  cx.fillRect(362, 670, 11, 5);
  cx.fillRect(391, 668, 7, 38);
  cx.fillRect(389, 664, 11, 5); // its chimneys
  cx.fillRect(422, 702, 46, 90);
  cx.beginPath();
  cx.arc(445, 703, 23, Math.PI, 0);
  cx.fill(); // Bom Jesus da Cruz
  cx.fillRect(441, 670, 8, 14);
  cx.beginPath();
  cx.arc(445, 671, 5, Math.PI, 0);
  cx.fill();
  cx.fillRect(444, 654, 2, 12);
  cx.fillRect(441, 658, 8, 2);

  if (look.lit) {
    cx.fillStyle = look.litc || '#ffd77a';
    cx.globalAlpha = look.lit;
    for (const [wx, wy, width, height] of ZE_LIT) cx.fillRect(wx, wy, width, height);
    cx.beginPath();
    cx.arc(291, 728, 4, 0, Math.PI * 2);
    cx.fill();
    cx.globalAlpha = 1;
  }

  cx.restore();
}

/** Trota's (2026-10-30, later): the restaurant of the 8-bit game this one learnt from, behind him at the right — a
 *  cornice, wall lamps, a striped awning, warm windows with their tables, a green door, azulejos at its foot, its sign
 *  on the roof. The sign's bulbs chase each other per frame (zeBulbs), faster and red while the dragon is out. */
const ZE_REST = { x: 470, w: 200, top: ZE_FLOOR - 130 };
const ZE_SIGN = { x: 490, y: ZE_FLOOR - 194, w: 160, h: 42 };

const ZE_BULBS = (() => {
  const bulbs = [];
  const { x: signX, y: signY, w: signWidth, h: signHeight } = ZE_SIGN;

  for (let bx = signX + 4; bx <= signX + signWidth - 4; bx += 8) bulbs.push([bx, signY], [bx, signY + signHeight]);
  for (let by = signY + 8; by <= signY + signHeight - 8; by += 8) bulbs.push([signX, by], [signX + signWidth, by]);
  return bulbs;
})();

// what stands up to be stood on (G4, 2026-10-30, the next round): the awning's top and the sign's, and what falls
// bounces off them
const ZE_PLATS = [
  { l: ZE_REST.x - 5, r: ZE_REST.x + ZE_REST.w + 5, y: ZE_REST.top + 16, name: 'awning' },
  { l: ZE_SIGN.x - 3, r: ZE_SIGN.x + ZE_SIGN.w + 3, y: ZE_SIGN.y - 3, name: 'sign' },
];

/** The ground under a point at atX whose feet are at feetY: the highest of the awning, the sign or the floor at or below it. */
const zePlatform = (atX, feetY) =>
  ZE_PLATS.reduce(
    (gy, platform) =>
      atX >= platform.l && atX <= platform.r && feetY <= platform.y + 0.5 && platform.y < gy ? platform.y : gy,
    ZE_FLOOR,
  );

function zeRestaurant(cx) {
  const { x: RX, w: RW, top: RT } = ZE_REST;
  const OUTLINE = '#1b0b2e';
  const FLOOR = ZE_FLOOR;
  const AY = RT + 18;

  cx.fillStyle = OUTLINE;
  cx.fillRect(RX - 5, RT - 8, RW + 10, FLOOR - RT + 8);
  cx.fillStyle = '#7a4630';
  cx.fillRect(RX - 4, RT - 7, RW + 8, 6);
  cx.fillStyle = '#c47a4a';
  cx.fillRect(RX - 4, RT - 7, RW + 8, 2);
  cx.fillStyle = '#d9bd9e';
  cx.fillRect(RX, RT, RW, FLOOR - RT);

  for (const lx of [RX + 28, RX + RW - 36]) {
    cx.fillStyle = OUTLINE;
    cx.fillRect(lx - 2, RT + 3, 12, 12);
    cx.fillStyle = '#fee761';
    cx.fillRect(lx, RT + 5, 8, 8);
  }

  for (let stripe = 0, sx = RX - 5; sx < RX + RW + 5; stripe++, sx += 8) {
    // the awning, a scallop a stripe
    cx.fillStyle = stripe % 2 ? '#fff6e0' : '#e43b44';
    cx.fillRect(sx, AY, 8, 12);
    cx.beginPath();
    cx.arc(sx + 4, AY + 12, 4, 0, Math.PI);
    cx.fill();
  }

  cx.fillStyle = OUTLINE;
  cx.fillRect(RX - 5, AY - 2, RW + 10, 2);

  for (const wx of [RX + 12, RX + RW - 72]) {
    // warm windows, two tables each, a plate on each
    cx.fillStyle = OUTLINE;
    cx.fillRect(wx - 3, AY + 26, 66, 52);
    cx.fillStyle = '#24643a';
    cx.fillRect(wx - 1.5, AY + 27.5, 63, 49);
    cx.fillStyle = '#fee761';
    cx.fillRect(wx + 2, AY + 31, 56, 42);
    cx.fillStyle = '#feae34';
    cx.fillRect(wx + 2, AY + 56, 56, 17);

    for (const tx of [wx + 8, wx + 36]) {
      cx.fillStyle = '#7a4630';
      cx.fillRect(tx - 2, AY + 54, 18, 3);
      cx.fillRect(tx + 6, AY + 57, 3, 16);
      cx.fillStyle = '#fff6e0';
      cx.fillRect(tx + 3, AY + 51, 8, 3);
    }

    cx.fillStyle = '#24643a';
    cx.fillRect(wx + 28.5, AY + 31, 3, 42);
  }

  const DX = RX + RW / 2 - 18;
  const DY = AY + 22;

  cx.fillStyle = OUTLINE;
  cx.fillRect(DX - 2, DY - 2, 40, FLOOR - DY + 2);
  cx.fillStyle = '#2f8f4e';
  cx.fillRect(DX, DY, 36, FLOOR - DY);
  cx.fillStyle = '#24643a';
  cx.fillRect(DX + 17, DY, 2, FLOOR - DY);
  cx.fillStyle = '#fee761';
  cx.fillRect(DX + 5, DY + 6, 8, 16);
  cx.fillRect(DX + 23, DY + 6, 8, 16);
  cx.strokeStyle = '#3f8fe0';
  cx.lineWidth = 1.2;

  for (let tx = RX; tx + 10 <= RX + RW; tx += 10) {
    if (tx + 10 <= DX - 2 || tx >= DX + 38) {
      cx.fillStyle = '#eaf2fb';
      cx.fillRect(tx, FLOOR - 20, 10, 20);
      cx.strokeRect(tx + 0.6, FLOOR - 19.4, 8.8, 8.8);
      cx.strokeRect(tx + 0.6, FLOOR - 9.4, 8.8, 8.8);
    }
  }

  const { x: SX, y: SY, w: SW, h: SH } = ZE_SIGN;

  for (const px of [SX + 26, SX + SW - 32]) {
    cx.fillStyle = OUTLINE;
    cx.fillRect(px - 1.5, SY + SH, 9, RT - 7 - SY - SH);
    cx.fillStyle = '#566c86';
    cx.fillRect(px, SY + SH, 6, RT - 7 - SY - SH);
  }

  cx.fillStyle = OUTLINE;
  cx.fillRect(SX - 3, SY - 3, SW + 6, SH + 6);
  cx.fillStyle = '#7a2a3a';
  cx.fillRect(SX, SY, SW, SH);
  cx.fillStyle = '#b13e53';
  cx.fillRect(SX + 4, SY + 4, SW - 8, SH - 8);
  cx.textAlign = 'center';
  cx.textBaseline = 'middle';
  cx.font = 'italic 900 22px Futura, "Avenir Next Condensed", system-ui, sans-serif';
  cx.fillStyle = '#4a1426';
  cx.fillText("TROTA'S", SX + SW / 2 + 2, SY + 18 + 2);
  cx.fillStyle = '#fee761';
  cx.fillText("TROTA'S", SX + SW / 2, SY + 18);
  cx.font = '700 7px Futura, system-ui, sans-serif';
  cx.fillStyle = '#ffcd75';
  cx.fillText('R E S T A U R A N T E', SX + SW / 2, SY + 33);
}

function zeBulbs(cx, game) {
  const phase = zeCalm() ? 0 : Math.floor(game.t * (game.dragon ? 16 : 6));

  ZE_BULBS.forEach(([bulbX, bulbY], index) => {
    cx.fillStyle = (index + phase) % 3 ? (game.dragon ? '#ff5a64' : '#fff6c8') : '#7a4630';
    cx.fillRect(bulbX - 2, bulbY - 2, 4, 4);
  });
}

/** The rooster of Barcelos: black, his comb red, his body painted with hearts and dots — standing on a plinth. */
function zeGaloArt(cx, at, floor, scale) {
  cx.save();
  cx.translate(at, floor);
  cx.scale(scale, scale);
  cx.fillStyle = '#241433';
  cx.fillRect(-36, -22, 72, 22);
  cx.fillRect(-30, -28, 60, 6);
  cx.strokeStyle = '#151018';
  cx.lineWidth = 5;
  cx.lineCap = 'round';
  cx.beginPath();
  cx.moveTo(-6, -28);
  cx.lineTo(-6, -52);
  cx.moveTo(8, -28);
  cx.lineTo(8, -52);
  cx.stroke();
  cx.fillStyle = '#151018';
  cx.beginPath();
  cx.moveTo(-24, -86);
  cx.bezierCurveTo(-40, -150, -88, -132, -72, -92);
  cx.bezierCurveTo(-62, -72, -46, -62, -24, -58);
  cx.fill();
  cx.beginPath();
  cx.moveTo(-22, -78);
  cx.bezierCurveTo(-60, -118, -96, -90, -64, -62);
  cx.lineTo(-24, -58);
  cx.fill();
  cx.beginPath();
  cx.ellipse(0, -72, 36, 24, -0.15, 0, Math.PI * 2);
  cx.fill();
  cx.beginPath();
  cx.moveTo(14, -90);
  cx.lineTo(28, -128);
  cx.lineTo(44, -122);
  cx.lineTo(32, -78);
  cx.fill();
  cx.beginPath();
  cx.arc(36, -124, 12, 0, Math.PI * 2);
  cx.fill();
  cx.fillStyle = '#e8322f';

  for (const [cx2, cy2] of [
    [28, -137],
    [35, -140],
    [42, -137],
  ]) {
    cx.beginPath();
    cx.arc(cx2, cy2, 5.5, 0, Math.PI * 2);
    cx.fill();
  }

  cx.beginPath();
  cx.ellipse(45, -110, 4, 6, 0, 0, Math.PI * 2);
  cx.fill();
  cx.fillStyle = '#ffcc33';
  cx.beginPath();
  cx.moveTo(46, -128);
  cx.lineTo(58, -122);
  cx.lineTo(46, -117);
  cx.fill();
  cx.fillStyle = '#fff';
  cx.beginPath();
  cx.arc(39, -126, 2.4, 0, Math.PI * 2);
  cx.fill();

  const heart = (hx, hy, radius, color) => {
    cx.fillStyle = color;
    cx.beginPath();
    cx.moveTo(hx, hy + radius);
    cx.bezierCurveTo(hx - radius * 1.8, hy - radius * 0.2, hx - radius, hy - radius * 1.6, hx, hy - radius * 0.7);
    cx.bezierCurveTo(hx + radius, hy - radius * 1.6, hx + radius * 1.8, hy - radius * 0.2, hx, hy + radius);
    cx.fill();
  };

  heart(0, -74, 9, '#e8322f');
  heart(-22, -70, 5, '#ffcc33');
  heart(18, -66, 5, '#3f8fe0');

  for (const [dx, dy, color] of [
    [-52, -112, '#ffcc33'],
    [-60, -96, '#e8322f'],
    [-44, -94, '#3f8fe0'],
    [-70, -82, '#5cbf4a'],
    [26, -96, '#ffcc33'],
    [-10, -58, '#5cbf4a'],
    [8, -86, '#ffcc33'],
  ]) {
    cx.fillStyle = color;
    cx.beginPath();
    cx.arc(dx, dy, 2.6, 0, Math.PI * 2);
    cx.fill();
  }

  cx.restore();
}
