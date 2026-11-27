// ---- the picture
function zeDraw() {
  if (zgOn()) return zgDraw();

  const canvas = $('#zeCanvas');
  const cx = canvas.getContext('2d');
  const game = ze.g;
  const scale = canvas.width / ZE_W;
  const calm = zeCalm();
  const dark = zeDark(game);

  cx.setTransform(scale, 0, 0, scale, 0, 0);

  if (game.power?.kind === 'vinho' && !calm) {
    const angle = Math.sin(game.t * 1.9) * 0.018;

    cx.translate(ZE_W / 2, ZE_H / 2);
    cx.rotate(angle);
    cx.scale(1.03, 1.03 + Math.sin(game.t * 2.7) * 0.012);
    cx.translate(-ZE_W / 2, -ZE_H / 2);
  } // the vinho verde: the picture wobbles

  if (game.punch > 0 && !calm) {
    const zoom = 1 + (0.07 * game.punch) / 0.2;
    const hy = game.y - 100;

    cx.translate(game.x, hy);
    cx.scale(zoom, zoom);
    cx.translate(-game.x, -hy);
  } // a combo's camera punch

  const koK = calm ? 0 : zeKoK(game);

  if (koK) {
    const zoom = 1 + 0.14 * koK;
    const hy = game.y - 90;

    cx.translate(game.x, hy);
    cx.scale(zoom, zoom);
    cx.translate(-game.x, -hy);
  }

  const scene = zeScene(canvas, zeSkyOf(game));
  const unit = ZE_W / canvas.width;
  const was = ze.was?.scene.w === canvas.width ? ze.was : null;
  const ox = (ZE_W / 2 - game.x) * 0.05;

  const layers = (sky, town, front) => {
    // the new sky, and the last one fading over it
    for (const [layer, alpha] of was
      ? [
          [scene, 1],
          [was.scene, was.a],
        ]
      : [[scene, 1]]) {
      cx.globalAlpha = alpha;
      if (sky) cx.drawImage(layer.sky, 0, 0, ZE_W, layer.sky.height * unit);
      if (town) zeTown(cx, layer.P, ox);
      if (front) cx.drawImage(layer.front, 0, ZE_FRONT, ZE_W, layer.front.height * unit);
    }

    cx.globalAlpha = 1;
  };

  layers(true, false, false);

  if (game.bolt) {
    for (const [width, col] of [
      [9, 'rgba(200, 121, 255, .6)'],
      [3, '#fff6e0'],
    ]) {
      // lightning, the dragon's or the storm's
      cx.strokeStyle = col;
      cx.lineWidth = width;
      cx.lineJoin = 'miter';
      cx.beginPath();
      cx.moveTo(...game.bolt.pts[0]);
      for (const pt of game.bolt.pts.slice(1)) cx.lineTo(...pt);
      cx.stroke();
    }
  }

  if (game.fw.length) {
    zeFwEach(game, (sparkX, sparkY, alpha, firework) => {
      cx.globalAlpha = Math.max(0, alpha);
      cx.fillStyle = firework.c;
      cx.fillRect(sparkX, sparkY, 3, 3);
    });
  }

  cx.globalAlpha = 1;
  layers(false, true, false);
  if (game.avo) zeAvoHouse(cx, game, calm);
  layers(false, false, true);
  zeBulbs(cx, game);

  if (dark) {
    // the dragon's sky, darker still
    cx.fillStyle = `rgba(70, 0, 24, ${0.4 * dark})`;
    cx.fillRect(0, 0, ZE_W, ZE_FLOOR);
    cx.fillStyle = `rgba(20, 0, 12, ${0.3 * dark})`;
    cx.fillRect(0, 0, ZE_W, 360);
    cx.fillRect(0, 0, ZE_W, 150);
  }

  if (ze.mossad) zeShades(cx, 110 + 39 * 1.35, ZE_FLOOR - 126 * 1.35, 1.35, '#c8ccd2'); // the rooster on its plinth too

  if (game.flex > 0) {
    // MONSTRO's spotlight: a cone from above onto him, a pool of light at his feet
    const fade = Math.min(1, game.flex / 0.3, (1.4 - game.flex) / 0.2);
    const width = 70 * zeSz(game);
    const sp = cx.createLinearGradient(0, 0, 0, ZE_FLOOR);

    sp.addColorStop(0, `rgba(255, 246, 210, ${0.05 * fade})`);
    sp.addColorStop(1, `rgba(255, 246, 210, ${0.3 * fade})`);
    cx.fillStyle = sp;
    cx.beginPath();
    cx.moveTo(game.x - 18, 0);
    cx.lineTo(game.x + 18, 0);
    cx.lineTo(game.x + width * 1.4, ZE_FLOOR);
    cx.lineTo(game.x - width * 1.4, ZE_FLOOR);
    cx.fill();
    cx.fillStyle = `rgba(255, 246, 210, ${0.35 * fade})`;
    cx.beginPath();
    cx.ellipse(game.x, ZE_FLOOR + 2, width * 1.4, 10, 0, 0, Math.PI * 2);
    cx.fill();
  }

  if (koK) {
    cx.fillStyle = `rgba(10, 2, 20, ${0.55 * koK})`;
    cx.fillRect(-100, -100, ZE_W + 200, ZE_H + 200);
  }

  if (game.shake > 0 && !calm) {
    cx.translate((Math.random() - 0.5) * 24 * game.shake, (Math.random() - 0.5) * 24 * game.shake);
  }

  zeActors(cx, game, calm);

  if (scene.P.rain && ze.drops.length) {
    cx.strokeStyle = 'rgba(190, 210, 240, .45)';
    cx.lineWidth = 1.4;
    cx.beginPath();

    for (const drop of ze.drops) {
      cx.moveTo(drop.x, drop.y);
      cx.lineTo(drop.x - 4, drop.y + 16);
    }

    cx.stroke();
  } // Minho's rain

  zeUi(cx, game, scale, calm);
}

/** What moves, on the 2D canvas or on the stage's batcher (zgBatch): what falls, the fire, the cars, Zé, the galo, what flies off. */
function zeActors(cx, game, calm) {
  for (const it of game.items) {
    cx.save();
    cx.translate(it.x, it.y);
    const glow = it.kind === 'gold' || it.stood > 0 ? 48 : 34;

    if (it.special && !it.out) {
      zeText(
        cx,
        it.dish.length > 26 ? `${it.dish.slice(0, 25)}…` : it.dish,
        0,
        32,
        11,
        it.kind === 'veg' ? '#9be15d' : '#ffd23f',
        'center',
        700,
      );
    } // under its real name

    if (it.kind === 'galo' || it.kind === 'case' || glow > 34 || (it.special && it.kind === 'meat')) {
      const gradient = cx.createRadialGradient(0, 0, 4, 0, 0, glow);

      gradient.addColorStop(0, it.kind === 'case' ? 'rgba(150, 190, 255, .8)' : 'rgba(255, 220, 90, .85)');
      gradient.addColorStop(1, 'rgba(255, 220, 90, 0)');
      cx.fillStyle = gradient;
      cx.fillRect(-glow, -glow, glow * 2, glow * 2);
    }

    if (it.stood > 0) {
      cx.translate(0, -Math.abs(Math.sin(it.stood * 9)) * (calm ? 0 : 6));
      cx.rotate(-0.9);
    } // stood up on its plate, hopping as it crows
    else cx.rotate(it.rot);

    if (it.kind === 'power') {
      // a power-up: its dish in pixels in a ring of its colour, beating
      const power = ZE_POWERS[it.p];
      const radius = 30 + (calm ? 0 : Math.sin(game.t * 8) * 3);
      const dish = zeDish(it.p);

      cx.fillStyle = `${power.c}55`;
      cx.strokeStyle = power.c;
      cx.lineWidth = 3;
      cx.beginPath();
      cx.arc(0, 0, radius, 0, Math.PI * 2);
      cx.fill();
      cx.stroke();
      cx.imageSmoothingEnabled = false;
      cx.drawImage(dish, -dish.width * 1.5, -dish.height * 1.5, dish.width * 3, dish.height * 3);
      cx.imageSmoothingEnabled = true;
      cx.restore();
      continue;
    }

    if (it.kind === 'peixe') {
      const fish = zePeixe();

      cx.rotate(-it.rot);
      cx.scale(it.vx > 0 ? -1 : 1, 1);
      cx.rotate(Math.sin(game.t * 8) * (calm ? 0 : 0.12));
      cx.imageSmoothingEnabled = false;
      cx.drawImage(fish, -fish.width * 1.5, -fish.height * 1.5, fish.width * 3, fish.height * 3);
      cx.imageSmoothingEnabled = true;
      cx.restore();
      continue;
    }

    const size = it.kind === 'gold' ? 54 : 42;

    cx.drawImage(
      zeGlyph(it.e, it.kind === 'gold' ? 'rgba(255, 196, 40, .55)' : it.tint),
      -size / 2,
      -size / 2,
      size,
      size,
    );

    if (ze.mossad && it.e === '🐓') zeShades(cx, -size * 0.2, -size * 0.26, size / 42, '#e8e8e8');
    cx.restore();
  }

  if (!cx.zg) {
    for (const flame of game.flames) {
      const remaining = 1 - flame.t / flame.life;

      cx.fillStyle =
        remaining > 0.7 ? '#fee761' : remaining > 0.45 ? '#feae34' : remaining > 0.25 ? '#f77622' : '#e43b44';

      cx.fillRect(flame.x, flame.y, flame.s, flame.s);
    }
  }

  if (game.leaving) {
    zeCar(cx, game.leaving.kind, game.leaving.x, ZE_FLOOR, game.leaving.f, game.leaving.wheel, 0, game.leaving.flip);
  }

  for (const puff of game.smoke) {
    cx.globalAlpha = 0.55 * (1 - puff.t / puff.life);
    cx.fillStyle = puff.t < 0.25 ? '#2a2630' : '#45404d';
    cx.beginPath();
    cx.arc(puff.x, puff.y, puff.r, 0, Math.PI * 2);
    cx.fill();
  }

  cx.globalAlpha = 1;

  {
    // in a car: the car, him sitting in it, its doors over his lap — and, quick, his afterimages and speed lines
    const ride = game.ride;

    const him = () => {
      if (ride) zeCar(cx, ride.kind, game.x, ZE_FLOOR, game.f, ride.wheel, ride.tilt, 0, 'back');
      zeHero(cx, game);
      if (ride) zeCar(cx, ride.kind, game.x, ZE_FLOOR, game.f, ride.wheel, ride.tilt, 0, 'front');
    };

    if (zeFast(game)) {
      cx.strokeStyle = 'rgba(255, 243, 196, .5)';
      cx.lineWidth = 2.5;
      cx.beginPath();

      for (let index = 0; index < 7; index++) {
        const ly = ZE_FLOOR - 24 - index * 24;
        const len = 40 + ((index * 37 + (calm ? 0 : Math.floor(game.t * 30))) % 60);
        const lx = game.x - game.f * (112 + (index % 3) * 16);

        cx.moveTo(lx, ly);
        cx.lineTo(lx - game.f * len, ly);
      }

      cx.stroke();

      game.trail.slice(1, 5).forEach((point, index) => {
        cx.save();
        cx.globalAlpha = 0.26 - index * 0.06;
        cx.translate(point.x - game.x, point.y - game.y);
        him();
        cx.restore();
      });
    }

    him();
    if (game.galo) zeGaloDraw(cx, game, calm);

    if (game.holdAt != null && game.nun >= ZE_NUN && !game.ride && game.t - game.holdAt > 0.12) {
      zeNunchaku(cx, game, calm);
    }

    if (game.sweep > 0) {
      // the sweep: an arc round him, fading
      cx.strokeStyle = `rgba(255, 243, 196, ${game.sweep * 2})`;
      cx.lineWidth = 10;
      cx.beginPath();
      cx.arc(game.x, game.y - 90 * zeSz(game), 150 + (0.35 - game.sweep) * 500, 0, Math.PI * 2);
      cx.stroke();
    }
  }

  for (const bit of game.bits) {
    cx.globalAlpha = 1 - bit.t / bit.life;
    cx.fillStyle = bit.c;

    if (!bit.w) {
      cx.fillRect(bit.x - bit.r, bit.y - bit.r, bit.r * 2, bit.r * 2);
      continue;
    }

    cx.save();
    cx.translate(bit.x, bit.y);
    cx.rotate(bit.rot);
    cx.fillRect(-bit.w / 2, -bit.h / 2, bit.w, bit.h);

    if (bit.bone) {
      cx.fillRect(-bit.w / 2 - 2, -bit.h / 2 - 1.5, 3, 3);
      cx.fillRect(-bit.w / 2 - 2, bit.h / 2 - 1.5, 3, 3);
      cx.fillRect(bit.w / 2 - 1, -bit.h / 2 - 1.5, 3, 3);
      cx.fillRect(bit.w / 2 - 1, bit.h / 2 - 1.5, 3, 3);
    } // a bone's knobs

    cx.restore();
  }

  cx.globalAlpha = 1;
}

/** What is read, on the top canvas whichever draws the rest, and never lit or blurred: the floating words, the HUD, the cards. */
function zeUi(cx, game, scale, calm) {
  for (const word of game.words) {
    cx.globalAlpha = Math.min(1, 2.2 - word.t * 2);
    zeText(cx, word.s, word.x, word.y, word.big ? 30 : 19, word.c, 'center');
  }

  cx.globalAlpha = 1;
  cx.setTransform(scale, 0, 0, scale, 0, 0);

  if (!calm && game.red > 0) {
    cx.fillStyle = 'rgba(228, 59, 68, .28)';
    cx.fillRect(0, 0, ZE_W, ZE_H);
  } // the hit

  if (!calm && game.flash > 0 && !zg.gl) {
    cx.fillStyle = `rgba(255, 250, 235, ${Math.min(0.65, game.flash * 4)})`;
    cx.fillRect(0, 0, ZE_W, ZE_H);
  } // the lightning's

  if (!calm && game.gold > 0) {
    cx.fillStyle = `rgba(255, 210, 63, ${game.gold * 0.7})`;
    cx.fillRect(0, 0, ZE_W, ZE_H);
  } // the miracle's

  if (game.phase === 'over' && game.koT < ZE_KO_T) return; // the card waits for the bones
  if (game.phase !== 'title' && game.phase !== 'over') zeHud(cx, game); // the K.O. says the score itself, and what landed

  if (game.banner && game.phase === 'play') {
    const banner = game.banner;

    zeText(cx, banner.s, ZE_W / 2, 300, 46, banner.cs[zeBlink(game, 8) ? 0 : 1], 'center', 900);
    if (banner.sub) zeText(cx, banner.sub, ZE_W / 2, 348, 17, '#fff3c4', 'center');
  }

  if (game.trophy && game.phase === 'play') {
    // a trophy won: a plaque dropping in under the HUD
    const trophy = game.trophy;
    const top = 170 - Math.max(0, trophy.t - 2.3) * 200;
    const width = 360;

    cx.fillStyle = '#1b0b2e';
    cx.beginPath();
    cx.roundRect(ZE_W / 2 - width / 2 - 3, top - 25, width + 6, 56, 12);
    cx.fill();
    cx.fillStyle = '#3a2a52';
    cx.strokeStyle = '#ffd23f';
    cx.lineWidth = 2;
    cx.beginPath();
    cx.roundRect(ZE_W / 2 - width / 2, top - 22, width, 50, 10);
    cx.fill();
    cx.stroke();
    cx.drawImage(zeGlyph(trophy.e), ZE_W / 2 - width / 2 + 10, top - 17, 40, 40);
    zeText(cx, 'TROPHY', ZE_W / 2 - width / 2 + 62, top - 6, 12, '#ffd23f', 'left', 700);
    zeText(cx, trophy.name, ZE_W / 2 - width / 2 + 62, top + 13, 20, '#fff3c4');
  }

  if (game.phase !== 'play') zeCard(cx, game);
}

/** The house above Trota's, risen behind it while the Avó da Horta is out: a granite front, a window with its green
 *  shutters open, geraniums on the sill, and her in it — throwing, hit, and what she says. */
function zeAvoHouse(cx, game, calm) {
  const avo = game.avo;
  const top = 704 - 162 * (1 - (1 - avo.rise) ** 2);
  const EDGE = '#1b0b2e';
  const wx = ZE_AVO.x - 38;
  const wy = top + 14;

  cx.fillStyle = EDGE;
  cx.fillRect(468, top - 4, 204, 712 - top);
  cx.fillStyle = '#d8cdb8';
  cx.fillRect(472, top, 196, 712 - top);
  cx.fillStyle = '#7a4630';
  cx.fillRect(464, top - 10, 212, 8); // the eaves

  for (let course = top + 12; course < 700; course += 14) {
    cx.fillStyle = 'rgba(120, 100, 80, .18)';
    cx.fillRect(472, course, 196, 1.5);
  } // granite courses

  cx.fillStyle = EDGE;
  cx.fillRect(wx - 4, wy - 4, 84, 82);
  cx.fillStyle = '#2a1d24';
  cx.fillRect(wx, wy, 76, 74); // the window, dark inside

  for (const sx of [wx - 34, wx + 78]) {
    cx.fillStyle = EDGE;
    cx.fillRect(sx - 2, wy - 4, 36, 82);
    cx.fillStyle = '#2f8f4e';
    cx.fillRect(sx, wy - 2, 32, 78);
    cx.fillStyle = '#24643a';
    for (let slat = wy + 4; slat < wy + 74; slat += 8) cx.fillRect(sx + 3, slat, 26, 3);
  }

  // her, from her waist up — leaning out, flinching when hit
  const pixel = 2.6;
  const hx = ZE_AVO.x - 10 * pixel + (avo.hit > 0 && !calm ? Math.sin(avo.hit * 60) * 4 : 0);
  const hy = wy + 8;

  ZE_AVO_FACE.forEach((row, rowIndex) => {
    for (let col = 0; col < row.length; col++) {
      let ch = row[col];

      if (ch === '.') continue;
      if (ze.mossad && rowIndex === 6 && 'oe'.includes(ch)) ch = 'k'; // sunglasses, she too
      cx.fillStyle = avo.hit > 0 && ch === 's' ? '#9be15d' : ZE_AVO_PAL[ch];
      cx.fillRect(hx + col * pixel, hy + rowIndex * pixel, pixel + 0.2, pixel + 0.2);
    }
  });

  if (avo.arm > 0) {
    cx.fillStyle = ZE_AVO_PAL.a;
    cx.fillRect(hx + 17 * pixel, hy + 3 * pixel, 3 * pixel, 12 * pixel);
    cx.fillStyle = ZE_AVO_PAL.s;
    cx.fillRect(hx + 17 * pixel, hy, 3 * pixel, 3 * pixel);
  } // her arm up, throwing

  cx.fillStyle = '#7a4630';
  cx.fillRect(wx - 8, wy + 70, 92, 8); // the sill, its geraniums

  for (let pot = 0; pot < 5; pot++) {
    cx.fillStyle = '#2f8f3a';
    cx.fillRect(wx - 2 + pot * 18, wy + 60, 12, 10);
    cx.fillStyle = '#e8322f';
    cx.fillRect(wx + 1 + pot * 18, wy + 56, 6, 6);
  }

  for (let index = 0; index < 3; index++) {
    cx.fillStyle = index < avo.hp ? '#e8322f' : 'rgba(255, 255, 255, .25)';
    cx.fillRect(ZE_AVO.x - 26 + index * 20, top - 30, 14, 10);
  } // her patience

  if (avo.sayT > 0) {
    // what she says
    cx.font = 'italic 800 15px Futura, "Avenir Next Condensed", system-ui, sans-serif';

    const width = cx.measureText(avo.say).width + 24;
    const bx = Math.max(12, ZE_AVO.x - 60 - width);
    const by = top + 4;

    cx.fillStyle = EDGE;
    cx.beginPath();
    cx.roundRect(bx - 2, by - 2, width + 4, 34, 10);
    cx.fill();
    cx.fillStyle = '#fff6e0';
    cx.beginPath();
    cx.roundRect(bx, by, width, 30, 9);
    cx.fill();
    cx.beginPath();
    cx.moveTo(bx + width - 6, by + 10);
    cx.lineTo(bx + width + 14, by + 22);
    cx.lineTo(bx + width - 6, by + 22);
    cx.fill();
    cx.fillStyle = EDGE;
    cx.textAlign = 'left';
    cx.textBaseline = 'middle';
    cx.fillText(avo.say, bx + 12, by + 16);
  }
}

/** Player two's galo: its shadow, itself turned its way, pecking — and its score over it in VERSUS. */
function zeGaloDraw(cx, game, calm) {
  const galo = game.galo;
  let spr = ze.sprites.get('galo2');

  if (!spr) {
    const src = document.createElement('canvas');
    const context = src.getContext('2d');

    src.width = ZE_GALO[0].length;
    src.height = ZE_GALO.length;

    ZE_GALO.forEach((line, row) =>
      [...line].forEach((ch, col) => {
        if (ch !== '.') {
          context.fillStyle = ZE_GALO_PAL[ch];
          context.fillRect(col, row, 1, 1);
        }
      }),
    );

    spr = zeSprite(src);
    ze.sprites.set('galo2', spr);
  }

  const pixel = 3.2;
  const bob = galo.y >= ZE_FLOOR && Math.abs(galo.vx) > 30 && !calm ? -Math.abs(Math.sin(galo.t * 14)) * 3 : 0;

  if (!cx.zg) {
    cx.fillStyle = 'rgba(20, 8, 30, .35)';
    cx.beginPath();
    cx.ellipse(galo.x, ZE_FLOOR + 3, 24, 5, 0, 0, Math.PI * 2);
    cx.fill();
  }

  const halo = cx.createRadialGradient(galo.x, galo.y - 26, 4, galo.x, galo.y - 26, 46);

  halo.addColorStop(0, 'rgba(255, 236, 170, .45)');
  halo.addColorStop(1, 'rgba(255, 236, 170, 0)'); // a pale glow: a black bird on the dusk
  cx.fillStyle = halo;
  cx.fillRect(galo.x - 46, galo.y - 72, 92, 92);
  cx.save();
  cx.translate(galo.x, galo.y + bob);
  cx.scale(galo.f, 1);
  if (galo.peck > 0) cx.rotate(0.45);
  cx.imageSmoothingEnabled = false;
  cx.drawImage(spr, -11 * pixel, -(spr.height - 1) * pixel, spr.width * pixel, spr.height * pixel);
  cx.imageSmoothingEnabled = true;
  if (ze.mossad) zeShades(cx, 3 * pixel, -13.5 * pixel, 0.55, '#c8ccd2');
  cx.restore();
  zeText(cx, galo.mode === 'versus' ? `P2 · ${galo.score}` : 'P2', galo.x, galo.y - 70, 14, '#ffcc33', 'center');
}

/** Sunglasses at (atX, atY), scale big: two black lenses on a bridge, rimmed so they read on a black head. */
function zeShades(cx, atX, atY, scale, rim) {
  cx.fillStyle = rim;
  cx.fillRect(atX - 11 * scale, atY - 4 * scale, 22 * scale, 8 * scale);
  cx.fillStyle = '#0e0c12';
  cx.fillRect(atX - 10 * scale, atY - 3 * scale, 9 * scale, 6 * scale);
  cx.fillRect(atX + 1 * scale, atY - 3 * scale, 9 * scale, 6 * scale);
  cx.fillStyle = 'rgba(160, 200, 255, .8)';
  cx.fillRect(atX - 8 * scale, atY - 2 * scale, 3 * scale, 1.5 * scale);
  cx.fillRect(atX + 3 * scale, atY - 2 * scale, 3 * scale, 1.5 * scale);
}

/** The nunchaku in his front fist, spinning while space is held: a stick held, its chain, the other stick round it. */
function zeNunchaku(cx, game, calm) {
  const size = zeSz(game);
  const hx = game.x + game.f * 34 * size;
  const hy = game.y - 100 * size;
  const angle = calm ? -0.6 : game.t * 24;
  const stickLength = 34 * size;

  const stick = (x0, y0, x1, y1) => {
    for (const [width, color] of [
      [9, '#1b0b2e'],
      [5, '#a0522d'],
    ]) {
      cx.strokeStyle = color;
      cx.lineWidth = width;
      cx.lineCap = 'round';
      cx.beginPath();
      cx.moveTo(x0, y0);
      cx.lineTo(x1, y1);
      cx.stroke();
    }
  };

  const ex = hx + game.f * 10 * size;
  const ey = hy - 18 * size;
  const cx2 = ex + Math.cos(angle) * 12 * size;
  const cy2 = ey + Math.sin(angle) * 12 * size;

  stick(hx, hy, ex, ey);
  cx.strokeStyle = '#c8ccd2';
  cx.lineWidth = 2;
  cx.beginPath();
  cx.moveTo(ex, ey);
  cx.lineTo(cx2, cy2);
  cx.stroke();
  stick(cx2, cy2, cx2 + Math.cos(angle) * stickLength, cy2 + Math.sin(angle) * stickLength);

  if (!calm) {
    cx.strokeStyle = 'rgba(255, 243, 196, .35)';
    cx.lineWidth = 3;
    cx.beginPath();
    cx.arc(ex, ey, stickLength + 12 * size, angle - 1.2, angle);
    cx.stroke();
  } // its blur
}

function zeText(cx, text, atX, atY, size, fill, align = 'left', weight = 800) {
  cx.font = `italic ${weight} ${size}px Futura, "Avenir Next Condensed", system-ui, sans-serif`;
  cx.textAlign = align;
  cx.textBaseline = 'middle';
  cx.lineJoin = 'round';
  cx.lineWidth = Math.max(3, size / 5);
  cx.strokeStyle = '#1b0b2e';
  cx.strokeText(text, atX, atY);
  cx.fillStyle = fill;
  cx.fillText(text, atX, atY);
}

/** An emoji drawn once into a canvas of its own: fillText of a colour glyph every frame is the slow way. Tinted (the
 *  golden galo's gold) over its own shapes, if asked. */
function zeGlyph(emoji, tint = null) {
  const key = tint ? emoji + tint : emoji;
  let canvas = ze.glyphs.get(key);

  if (canvas) return canvas;
  canvas = document.createElement('canvas');
  canvas.width = canvas.height = 96;
  const context = canvas.getContext('2d');

  context.font = '76px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(emoji, 48, 54);

  if (tint) {
    context.globalCompositeOperation = 'source-atop';
    context.fillStyle = tint;
    context.fillRect(0, 0, 96, 96);
  }

  ze.glyphs.set(key, canvas);
  return canvas;
}

/** A dish in pixels, 16 square, outlined: its rects (rect) and its ellipses (ellipse) — a power-up's. */
function zeDish(kind) {
  let canvas = ze.sprites.get(`dish:${kind}`);

  if (canvas) return canvas;

  const src = document.createElement('canvas');
  const context = src.getContext('2d');

  src.width = src.height = 16;

  const rect = (left, top, width, height, col) => {
    context.fillStyle = col;
    context.fillRect(left, top, width, height);
  };

  const ellipse = (ex, ey, rx, ry, col) => {
    context.fillStyle = col;

    for (let py = 0; py < 16; py++) {
      for (let px = 0; px < 16; px++) {
        const dx = (px + 0.5 - ex) / rx;
        const dy = (py + 0.5 - ey) / ry;

        if (dx * dx + dy * dy <= 1) context.fillRect(px, py, 1, 1);
      }
    }
  };

  ZE_POWERS[kind].draw(rect, ellipse);
  canvas = zeSprite(src);
  ze.sprites.set(`dish:${kind}`, canvas);
  return canvas;
}

/** The board's own fish (FISH, the home's and the status bar's), in the theme's accent, outlined — head to the left. */
function zePeixe() {
  let canvas = ze.sprites.get('peixe');

  if (canvas) return canvas;

  const src = document.createElement('canvas');
  const context = src.getContext('2d');
  const accent = cssToken('--accent') || '#7ef0ff';

  src.width = FISH[0].length;
  src.height = FISH.length;

  FISH.forEach((line, row) =>
    [...line].forEach((ch, col) => {
      if (ch === '.') return;
      context.fillStyle = ch === 'o' ? '#1b0b2e' : ch === '=' ? 'rgba(0, 0, 0, .3)' : accent;
      context.fillRect(col, row, 1, 1);

      if (ch === '=') {
        context.globalCompositeOperation = 'destination-over';
        context.fillStyle = accent;
        context.fillRect(col, row, 1, 1);
        context.globalCompositeOperation = 'source-over';
      }
    }),
  );

  canvas = zeSprite(src);
  ze.sprites.set('peixe', canvas);
  return canvas;
}

/** A pixel drawing, outlined a pixel round whatever is drawn, into a canvas a pixel bigger each way; tinted, if asked. */
function zeSprite(src, tint) {
  const width = src.width;
  const height = src.height;
  const pixels = src.getContext('2d').getImageData(0, 0, width, height).data;
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');

  canvas.width = width + 2;
  canvas.height = height + 2;
  context.fillStyle = '#1b0b2e';

  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) if (pixels[(row * width + col) * 4 + 3]) context.fillRect(col, row, 3, 3);
  }

  context.drawImage(src, 1, 1);

  if (tint) {
    context.globalCompositeOperation = 'source-atop';
    context.fillStyle = tint;
    context.fillRect(0, 0, canvas.width, canvas.height);
  }

  return canvas;
}

/** His bulk in pixels: half his shoulders, half his waist, his arms' and legs' thickness — skinny at none, MONSTRO at ZE_MASS_MAX. */
const zeBulkPx = mass => ({
  hw: Math.round(5 + (mass * 7) / ZE_MASS_MAX),
  ww: Math.round(4 + mass / 3),
  at: 2 + (mass >= 5) + (mass >= 10),
  lw: 3 + (mass >= 5) + (mass >= 10),
});

const ZE_PX = 2.6;
const ZE_BW = 52;
const ZE_BH = 64;
const ZE_FEET = 61; // the picture's units to a pixel of his; the sprite; his feet's row in it

/** Zé whole, in pixels (2026-10-30, the next round): his body in a pose (ZE_POSES) at his bulk, then his face — chewing,
 *  open as food comes, an agent's, green from a green —, outlined; turned to face left with his face unturned; or
 *  his bones and his skull. Cached by all of that. */
function zeBuild(mass, pose, options = {}) {
  const key = `${mass}|${pose}|${+!!options.open}|${+!!options.agent}|${+!!options.sick}|${+!!options.flip}|${+!!options.shades}`;
  let spr = ze.sprites.get(key);

  if (spr) return spr;
  if (ze.sprites.size > 400) ze.sprites.clear();

  const WIDTH = ZE_BW;
  const cx = 25;
  const top = 23;
  const bulk = zeBulkPx(mass);
  const bones = pose === 'bones';
  const canvas = document.createElement('canvas');

  canvas.width = WIDTH;
  canvas.height = ZE_BH;

  const context = canvas.getContext('2d');
  const SUIT = ZE_SUIT;

  const rect = (left, top, width, height, col) => {
    context.fillStyle = col;
    context.fillRect(options.flip ? WIDTH - left - width : left, top, width, height);
  };

  const seg = ([x0, y0], [x1, y1], th, col) => {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);

    for (let step = 0; step <= steps; step++) {
      rect(
        Math.floor(x0 + ((x1 - x0) * step) / steps - th / 2 + 0.5),
        Math.floor(y0 + ((y1 - y0) * step) / steps - th / 2 + 0.5),
        th,
        th,
        col,
      );
    }
  };

  const limbs = ZE_POSES[bones ? 'stand' : pose](cx, top, bulk);

  if (bones) {
    // only bones: the neck, the spine, four ribs, the pelvis, the long bones and their joints
    rect(cx - 1, 19, 2, 4, SUIT.bone);
    seg([cx, top], [cx, top + 14], 2, SUIT.bone);

    for (let rib = 0; rib < 4; rib++) {
      rect(cx - 6 + rib, top + 3 + rib * 3, 12 - rib * 2, 1, SUIT.bone);
      rect(cx - 6 + rib, top + 4 + rib * 3, 1, 1, SUIT.bone2);
      rect(cx + 5 - rib, top + 4 + rib * 3, 1, 1, SUIT.bone2);
    }

    rect(cx - 4, top + 14, 8, 2, SUIT.bone);

    for (const [start, joint, end] of [...limbs.arms, ...limbs.legs]) {
      seg(start, joint, 1, SUIT.bone);
      seg(joint, end, 1, SUIT.bone);
      rect(joint[0] - 1, joint[1] - 1, 2, 2, SUIT.bone2);
      rect(end[0] - 1, end[1] - 1, 2, 2, SUIT.bone);
    }
  } else {
    limbs.legs.forEach(([hip, knee, ankle], index) => {
      // the legs, their outer stripe, the shoes
      const out = index ? bulk.lw / 2 - 0.5 : -bulk.lw / 2 + 0.5;
      const up = -bulk.lw / 2 + 0.5;

      seg(hip, knee, bulk.lw, SUIT.Y);
      seg(knee, ankle, bulk.lw, SUIT.Y);

      if (limbs.kick && index === 1) {
        seg([hip[0], hip[1] + up], [knee[0], knee[1] + up], 1, SUIT.K);
        seg([knee[0], knee[1] + up], [ankle[0], ankle[1] + up], 1, SUIT.K);
        rect(ankle[0] + 1, ankle[1] - Math.ceil(bulk.lw / 2) - 1, 3, bulk.lw + 2, SUIT.K);
      } else if (pose === 'sit') rect(ankle[0] - 1, ankle[1] + 1, bulk.lw + 3, 2, SUIT.K);
      else {
        seg([hip[0] + out, hip[1]], [knee[0] + out, knee[1]], 1, SUIT.K);
        seg([knee[0] + out, knee[1]], [ankle[0] + out, ankle[1]], 1, SUIT.K);
        rect(Math.floor(ankle[0] - bulk.lw / 2 + 0.5), ankle[1] + 1, bulk.lw + 2, 2, SUIT.K);
      }
    });

    for (let row = 0; row < 15; row++) {
      // the torso: his shoulders, a taper to the waist, the suit's stripes
      const half =
        row <= 3 ? bulk.hw : row >= 11 ? bulk.ww : Math.round(bulk.hw + ((bulk.ww - bulk.hw) * (row - 3)) / 8);

      const inset = row === 0 ? 1 + (mass >= 10) : row === 1 && mass >= 10 ? 1 : 0;

      rect(cx - half + inset, top + row, half * 2 - inset * 2, 1, SUIT.Y);

      if (row) {
        rect(cx - half + 1, top + row, 1, 1, SUIT.K);
        rect(cx + half - 2, top + row, 1, 1, SUIT.K);
      }
    }

    rect(cx - 1, top + 1, 1, 14, SUIT.y); // the zip

    if (mass >= 5) {
      const pr = mass >= 10 ? 6 : 5;

      rect(cx - bulk.hw + 3, top + pr, bulk.hw - 4, 1, SUIT.y);
      rect(cx + 1, top + pr, bulk.hw - 4, 1, SUIT.y);
      rect(cx - bulk.hw + 3, top + 2, 3, 1, SUIT.l);
      rect(cx + 2, top + 2, 3, 1, SUIT.l);
    } // pecs

    if (mass >= 9) {
      for (const row of [8, 10, 12]) {
        rect(cx - 4, top + row, 2, 1, SUIT.y);
        rect(cx + 1, top + row, 2, 1, SUIT.y);
      }
    } // abs

    if (mass <= 2) for (const row of [5, 7, 9]) rect(cx - bulk.hw + 3, top + row, bulk.hw * 2 - 6, 1, SUIT.y); // his ribs, through the suit

    for (const [shoulder, elbow, wrist] of limbs.arms) {
      // a sleeve to the wrist (a biceps when he is buff), a fist
      seg(shoulder, elbow, bulk.at + (mass >= 10), SUIT.Y);
      seg(elbow, wrist, bulk.at, SUIT.Y);

      if (mass >= 10) {
        rect(Math.round((shoulder[0] + elbow[0]) / 2) - 1, Math.round((shoulder[1] + elbow[1]) / 2) - 2, 2, 1, SUIT.l);
      }

      const fist = bulk.at + 1;
      const fx = Math.floor(wrist[0] - fist / 2 + 0.5);
      const fy = Math.floor(wrist[1] - fist / 2 + 0.5);

      rect(fx, fy, fist, fist, SUIT.s);
      rect(fx, fy + fist - 1, fist, 1, SUIT.S);
    }
  }

  const fx0 = options.flip ? WIDTH - cx - 10 : cx - 10; // the face, last and never turned: over the neck, whichever way he faces

  (bones ? ZE_SKULL : ZE_FACE).forEach((row, rowIndex) => {
    const line =
      (!bones &&
        ((options.agent && ZE_SPY[rowIndex]) ||
          (options.shades && ZE_SHADES[rowIndex]) ||
          (options.open && ZE_OPEN[rowIndex]))) ||
      row;

    for (let col = 0; col < line.length; col++) {
      if (line[col] !== '.') {
        context.fillStyle = ZE_PAL[line[col]];
        context.fillRect(fx0 + col, rowIndex, 1, 1);
      }
    }
  });

  spr = zeSprite(canvas, options.sick ? 'rgba(110, 200, 70, .45)' : null);
  ze.sprites.set(key, spr);
  return spr;
}

/** A sprite of his at (atX, atY) — his feet —, pixel units a pixel, squashed (sx, sy) about his feet; unsmoothed. */
function zeBlit(cx, spr, atX, atY, pixel, flip, sx = 1, sy = 1) {
  const ax = flip ? ZE_BW + 2 - 26 : 26; // the torso's middle, the face's, in the outlined sprite

  cx.imageSmoothingEnabled = false;
  cx.drawImage(spr, atX - ax * pixel * sx, atY - ZE_FEET * pixel * sy, spr.width * pixel * sx, spr.height * pixel * sy);
  cx.imageSmoothingEnabled = true;
}

function zeHud(cx, game) {
  const difficulty = zeDiff();

  zeText(cx, `SCORE ${game.score}`, 20, 30, 26, '#fff3c4');

  if (game.mult > 1 && game.phase === 'play') {
    zeText(cx, `COMBO ×${game.mult}`, 22, 62, 17, zeBlink(game, 6) ? '#feae34' : '#f77622');
  }

  if (game.galo?.mode === 'versus') zeText(cx, `GALO ${game.galo.score}`, 220, 30, 16, '#ffcc33');
  zeText(cx, `BEST ${Math.max(zeBests()[difficulty.id] || 0, game.score)}`, ZE_W / 2, 30, 16, '#d9c7e8', 'center');

  // his bulk, a bar of ZE_MASS_MAX from bone to meat — the left end blinking when it is nearly all that is left
  const bw = 12;
  const gap = 3;
  const x0 = ZE_W - 20 - ZE_MASS_MAX * (bw + gap) + gap;
  const thin = game.mass <= 2 && game.phase === 'play';

  zeText(cx, 'BUFF', x0 - 12, 30, 15, thin && !zeBlink(game, 4) ? '#ff5a64' : '#fff3c4', 'right');

  for (let cell = 0; cell < ZE_MASS_MAX; cell++) {
    cx.fillStyle = '#1b0b2e';
    cx.fillRect(x0 + cell * (bw + gap) - 1.5, 19, bw + 3, 23);

    cx.fillStyle =
      cell >= game.mass
        ? 'rgba(255, 255, 255, .1)'
        : cell < 2
          ? '#f2ead8'
          : cell < 5
            ? '#e8a07a'
            : cell < 9
              ? '#e05a4a'
              : '#b8203a';

    cx.fillRect(x0 + cell * (bw + gap), 20.5, bw, 20);
  }

  zeText(cx, `${difficulty.name} · LEVEL ${game.level}`, ZE_W - 20, 62, 15, difficulty.c, 'right');
  if (thin) zeText(cx, 'SKIN AND BONES!', ZE_W - 20, 86, 14, '#ff5a64', 'right');
  const full = game.nun >= ZE_NUN; // the nunchaku's meter, under his score

  zeText(
    cx,
    full ? 'NUNCHAKU! HOLD SPACE' : 'NUNCHAKU',
    20,
    92,
    13,
    full ? (zeBlink(game, 4) ? '#ffd23f' : '#ff5a64') : '#d9c7e8',
  );

  if (!full) {
    for (let cell = 0; cell < ZE_NUN; cell++) {
      cx.fillStyle = '#1b0b2e';
      cx.fillRect(108 + cell * 11, 85, 9, 14);
      cx.fillStyle = cell < Math.floor(game.nun) ? '#ffd23f' : 'rgba(255, 255, 255, .12)';
      cx.fillRect(109.5 + cell * 11, 86.5, 6, 11);
    }
  }

  if (game.agent) {
    // AGENT ZÉ's stamp
    cx.save();
    cx.translate(ZE_W / 2, 66);
    cx.rotate(-0.08);
    cx.strokeStyle = '#e43b44';
    cx.lineWidth = 3;
    cx.strokeRect(-74, -15, 148, 30);
    cx.font = '900 16px Futura, "Avenir Next Condensed", system-ui, sans-serif';
    cx.textAlign = 'center';
    cx.textBaseline = 'middle';
    cx.fillStyle = '#e43b44';
    cx.fillText('TOP SECRET', 0, 1);
    cx.restore();
  }

  let by = 104;

  const bar = (frac, color, label) => {
    // the dragon's time, the car's, a power-up's, running out — one under the other
    cx.fillStyle = '#1b0b2e';
    cx.fillRect(20, by, ZE_W - 40, 10);
    cx.fillStyle = color;
    cx.fillRect(22, by + 2, (ZE_W - 44) * frac, 6);
    zeText(cx, label, ZE_W - 20, by + 24, 14, color, 'right');
    by += 40;
  };

  if (game.dragon) bar(game.dragon / ZE_DRAGON, zeBlink(game, 12) ? '#ff7a2a' : '#ffd23f', 'MODO FERA');
  else if (game.ride) bar(game.ride.t / ZE_RIDE, ZE_CARS[game.ride.kind].c, ZE_CARS[game.ride.kind].name);

  if (game.power) {
    bar(game.power.t / ZE_POWER_T, ZE_POWERS[game.power.kind].c, ZE_POWERS[game.power.kind].name.slice(0, -1));
  }
}

/** The title's four ways to play, and the K.O.'s two ways on — where a click lands. */
function zeDiffButtons() {
  const ws = ZE_DIFFS.map(difficulty => difficulty.name.length * 11 + 28);
  const gap = 8;

  let left = ZE_W / 2 - (ws.reduce((total, width) => total + width) + gap * (ws.length - 1)) / 2;

  return ZE_DIFFS.map((difficulty, index) => {
    const button = { x: left, y: 424, w: ws[index], h: 28, i: index };

    left += ws[index] + gap;
    return button;
  });
}

/** The K.O.'s ways on: again, the menu — and, with the board's chat on, a new best posted to its room, and on a Friday
 *  the week's poll (T3, 2026-10-30, the next round). Each is a click or ← → and space; nothing goes to the room
 *  but on one. */
function zeOverButtons() {
  const game = ze.g;
  const chat = state.chat;
  const room = !!chat?.on && !chat.missing && chat.room != null;

  const say = (status, idle, done) =>
    status === 'sending' ? 'SENDING…' : status === 'sent' ? done : status ? 'NOT SENT' : idle;

  const bs = [
    { id: 'again', s: 'AGAIN', w: 122 },
    { id: 'menu', s: 'MENU', w: 122 },
  ];

  if (room && (game.best || game.todays)) {
    bs.push({ id: 'post', s: say(game.posted, 'POST TO THE CHAT', 'POSTED ✓'), w: 176 });
  }

  if (room && new Date().getDay() === 5) {
    bs.push({ id: 'poll', s: say(game.polled, 'FRIDAY POLL', 'POLL ASKED ✓'), w: 150 });
  }

  let left = ZE_W / 2 - (bs.reduce((total, button) => total + button.w, 0) + 10 * (bs.length - 1)) / 2;

  return bs.map(button => {
    const placed = { ...button, x: left, y: 568, h: 32 };

    left += button.w + 10;
    return placed;
  });
}

function zeOverAct(id) {
  if (id === 'menu') zeMenu();
  else if (id === 'post') zePost(ze.g);
  else if (id === 'poll') zePoll(ze.g);
  else zeStart();
}

// what a score posted says, and how the poll finds it again in the room's week
const ZE_POST = "Zé's game:";
const ZE_POST_RE = /^Zé's game: (\d+) on ([A-Z]+)/;

async function zePost(game) {
  if (game.posted === 'sending' || game.posted === 'sent') return;
  const difficulty = zeDiff();

  game.posted = 'sending';
  game.roomSay = '';

  try {
    await api('POST', '/api/chat/send', {
      body: `${ZE_POST} ${game.score} on ${difficulty.name}, level ${game.level} — ${game.best ? 'a new best' : "today's best"} 🥋 (the day's round, ${zeToday()})`,
    });

    game.posted = 'sent';
    game.roomSay = 'in the chat — ⌥⌘Z for yours';
  } catch (error) {
    game.posted = 'failed';
    game.roomSay = error.message;
  }
}

/** Friday's poll: the week's scores posted in the room, each one's best, the top eight asked about. */
async function zePoll(game) {
  if (game.polled === 'sending' || game.polled === 'sent') return;
  game.polled = 'sending';
  game.roomSay = '';

  try {
    const data = await api('GET', '/api/chat/messages');
    const since = Date.now() - 7 * 86_400_000;
    const best = new Map();

    for (const message of data.msgs || []) {
      const match = String(message.body || '').match(ZE_POST_RE);

      if (!match || new Date(message.at) < since) continue;
      if (+match[1] > (best.get(message.who)?.n || 0)) best.set(message.who, { n: +match[1], way: match[2] });
    }

    const top = [...best].sort((left, right) => right[1].n - left[1].n).slice(0, 8);

    if (top.length < 2) {
      game.polled = 'failed';
      game.roomSay = top.length ? 'one score posted this week — a poll wants two' : 'no score posted this week';
      return;
    }

    await api('POST', '/api/chat/poll', {
      q: 'Who is the Bruce Lee of Barcelos this week? 🥋',
      answers: top.map(([who, score]) => `${who} — ${score.n} on ${score.way}`),
      many: false,
    });

    game.polled = 'sent';
    game.roomSay = 'the poll is in the chat';
  } catch (error) {
    game.polled = 'failed';
    game.roomSay = error.message;
  }
}

const zeIn = (button, pointX, pointY) =>
  pointX >= button.x && pointX < button.x + button.w && pointY >= button.y && pointY < button.y + button.h;

function zeButton(cx, button, label, on, color) {
  cx.fillStyle = '#1b0b2e';
  cx.beginPath();
  cx.roundRect(button.x - 2, button.y - 2, button.w + 4, button.h + 4, 8);
  cx.fill();
  cx.fillStyle = on ? color : '#3a2a52';
  cx.beginPath();
  cx.roundRect(button.x, button.y, button.w, button.h, 6);
  cx.fill();
  cx.font = 'italic 800 15px Futura, "Avenir Next Condensed", system-ui, sans-serif';
  cx.textAlign = 'center';
  cx.textBaseline = 'middle';
  cx.fillStyle = on ? '#1b0b2e' : '#d9c7e8';
  cx.fillText(label, button.x + button.w / 2, button.y + button.h / 2 + 1);
}
