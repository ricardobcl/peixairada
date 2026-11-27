// ---- the picture
function zeDraw() {
  if (zgOn()) return zgDraw();

  const c = $('#zeCanvas');
  const cx = c.getContext('2d');
  const g = ze.g;
  const k = c.width / ZE_W;
  const calm = zeCalm();
  const dark = zeDark(g);

  cx.setTransform(k, 0, 0, k, 0, 0);

  if (g.power?.kind === 'vinho' && !calm) {
    const a = Math.sin(g.t * 1.9) * 0.018;

    cx.translate(ZE_W / 2, ZE_H / 2);
    cx.rotate(a);
    cx.scale(1.03, 1.03 + Math.sin(g.t * 2.7) * 0.012);
    cx.translate(-ZE_W / 2, -ZE_H / 2);
  } // the vinho verde: the picture wobbles

  if (g.punch > 0 && !calm) {
    const z = 1 + (0.07 * g.punch) / 0.2;
    const hy = g.y - 100;

    cx.translate(g.x, hy);
    cx.scale(z, z);
    cx.translate(-g.x, -hy);
  } // a combo's camera punch

  const koK = calm ? 0 : zeKoK(g);

  if (koK) {
    const z = 1 + 0.14 * koK;
    const hy = g.y - 90;

    cx.translate(g.x, hy);
    cx.scale(z, z);
    cx.translate(-g.x, -hy);
  }

  const L = zeScene(c, zeSkyOf(g));
  const u = ZE_W / c.width;
  const was = ze.was?.scene.w === c.width ? ze.was : null;
  const ox = (ZE_W / 2 - g.x) * 0.05;

  const layers = (sky, town, front) => {
    // the new sky, and the last one fading over it
    for (const [S, a] of was
      ? [
          [L, 1],
          [was.scene, was.a],
        ]
      : [[L, 1]]) {
      cx.globalAlpha = a;
      if (sky) cx.drawImage(S.sky, 0, 0, ZE_W, S.sky.height * u);
      if (town) zeTown(cx, S.P, ox);
      if (front) cx.drawImage(S.front, 0, ZE_FRONT, ZE_W, S.front.height * u);
    }

    cx.globalAlpha = 1;
  };

  layers(true, false, false);

  if (g.bolt) {
    for (const [w, col] of [
      [9, 'rgba(200, 121, 255, .6)'],
      [3, '#fff6e0'],
    ]) {
      // lightning, the dragon's or the storm's
      cx.strokeStyle = col;
      cx.lineWidth = w;
      cx.lineJoin = 'miter';
      cx.beginPath();
      cx.moveTo(...g.bolt.pts[0]);
      for (const pt of g.bolt.pts.slice(1)) cx.lineTo(...pt);
      cx.stroke();
    }
  }

  if (g.fw.length) {
    zeFwEach(g, (x, y, a, f) => {
      cx.globalAlpha = Math.max(0, a);
      cx.fillStyle = f.c;
      cx.fillRect(x, y, 3, 3);
    });
  }

  cx.globalAlpha = 1;
  layers(false, true, false);
  if (g.avo) zeAvoHouse(cx, g, calm);
  layers(false, false, true);
  zeBulbs(cx, g);

  if (dark) {
    // the dragon's sky, darker still
    cx.fillStyle = `rgba(70, 0, 24, ${0.4 * dark})`;
    cx.fillRect(0, 0, ZE_W, ZE_FLOOR);
    cx.fillStyle = `rgba(20, 0, 12, ${0.3 * dark})`;
    cx.fillRect(0, 0, ZE_W, 360);
    cx.fillRect(0, 0, ZE_W, 150);
  }

  if (ze.mossad) zeShades(cx, 110 + 39 * 1.35, ZE_FLOOR - 126 * 1.35, 1.35, '#c8ccd2'); // the rooster on its plinth too

  if (g.flex > 0) {
    // MONSTRO's spotlight: a cone from above onto him, a pool of light at his feet
    const a = Math.min(1, g.flex / 0.3, (1.4 - g.flex) / 0.2);
    const w = 70 * zeSz(g);
    const sp = cx.createLinearGradient(0, 0, 0, ZE_FLOOR);

    sp.addColorStop(0, `rgba(255, 246, 210, ${0.05 * a})`);
    sp.addColorStop(1, `rgba(255, 246, 210, ${0.3 * a})`);
    cx.fillStyle = sp;
    cx.beginPath();
    cx.moveTo(g.x - 18, 0);
    cx.lineTo(g.x + 18, 0);
    cx.lineTo(g.x + w * 1.4, ZE_FLOOR);
    cx.lineTo(g.x - w * 1.4, ZE_FLOOR);
    cx.fill();
    cx.fillStyle = `rgba(255, 246, 210, ${0.35 * a})`;
    cx.beginPath();
    cx.ellipse(g.x, ZE_FLOOR + 2, w * 1.4, 10, 0, 0, Math.PI * 2);
    cx.fill();
  }

  if (koK) {
    cx.fillStyle = `rgba(10, 2, 20, ${0.55 * koK})`;
    cx.fillRect(-100, -100, ZE_W + 200, ZE_H + 200);
  }

  if (g.shake > 0 && !calm) cx.translate((Math.random() - 0.5) * 24 * g.shake, (Math.random() - 0.5) * 24 * g.shake);
  zeActors(cx, g, calm);

  if (L.P.rain && ze.drops.length) {
    cx.strokeStyle = 'rgba(190, 210, 240, .45)';
    cx.lineWidth = 1.4;
    cx.beginPath();

    for (const d of ze.drops) {
      cx.moveTo(d.x, d.y);
      cx.lineTo(d.x - 4, d.y + 16);
    }

    cx.stroke();
  } // Minho's rain

  zeUi(cx, g, k, calm);
}

/** What moves, on the 2D canvas or on the stage's batcher (zgBatch): what falls, the fire, the cars, Zé, the galo, what flies off. */
function zeActors(cx, g, calm) {
  for (const it of g.items) {
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
      const r = cx.createRadialGradient(0, 0, 4, 0, 0, glow);

      r.addColorStop(0, it.kind === 'case' ? 'rgba(150, 190, 255, .8)' : 'rgba(255, 220, 90, .85)');
      r.addColorStop(1, 'rgba(255, 220, 90, 0)');
      cx.fillStyle = r;
      cx.fillRect(-glow, -glow, glow * 2, glow * 2);
    }

    if (it.stood > 0) {
      cx.translate(0, -Math.abs(Math.sin(it.stood * 9)) * (calm ? 0 : 6));
      cx.rotate(-0.9);
    } // stood up on its plate, hopping as it crows
    else cx.rotate(it.rot);

    if (it.kind === 'power') {
      // a power-up: its dish in pixels in a ring of its colour, beating
      const P = ZE_POWERS[it.p];
      const r = 30 + (calm ? 0 : Math.sin(g.t * 8) * 3);
      const d = zeDish(it.p);

      cx.fillStyle = `${P.c}55`;
      cx.strokeStyle = P.c;
      cx.lineWidth = 3;
      cx.beginPath();
      cx.arc(0, 0, r, 0, Math.PI * 2);
      cx.fill();
      cx.stroke();
      cx.imageSmoothingEnabled = false;
      cx.drawImage(d, -d.width * 1.5, -d.height * 1.5, d.width * 3, d.height * 3);
      cx.imageSmoothingEnabled = true;
      cx.restore();
      continue;
    }

    if (it.kind === 'peixe') {
      const f = zePeixe();

      cx.rotate(-it.rot);
      cx.scale(it.vx > 0 ? -1 : 1, 1);
      cx.rotate(Math.sin(g.t * 8) * (calm ? 0 : 0.12));
      cx.imageSmoothingEnabled = false;
      cx.drawImage(f, -f.width * 1.5, -f.height * 1.5, f.width * 3, f.height * 3);
      cx.imageSmoothingEnabled = true;
      cx.restore();
      continue;
    }

    const z = it.kind === 'gold' ? 54 : 42;

    cx.drawImage(zeGlyph(it.e, it.kind === 'gold' ? 'rgba(255, 196, 40, .55)' : it.tint), -z / 2, -z / 2, z, z);
    if (ze.mossad && it.e === '🐓') zeShades(cx, -z * 0.2, -z * 0.26, z / 42, '#e8e8e8');
    cx.restore();
  }

  if (!cx.zg) {
    for (const f of g.flames) {
      const t = 1 - f.t / f.life;

      cx.fillStyle = t > 0.7 ? '#fee761' : t > 0.45 ? '#feae34' : t > 0.25 ? '#f77622' : '#e43b44';
      cx.fillRect(f.x, f.y, f.s, f.s);
    }
  }

  if (g.leaving) zeCar(cx, g.leaving.kind, g.leaving.x, ZE_FLOOR, g.leaving.f, g.leaving.wheel, 0, g.leaving.flip);

  for (const p of g.smoke) {
    cx.globalAlpha = 0.55 * (1 - p.t / p.life);
    cx.fillStyle = p.t < 0.25 ? '#2a2630' : '#45404d';
    cx.beginPath();
    cx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    cx.fill();
  }

  cx.globalAlpha = 1;

  {
    // in a car: the car, him sitting in it, its doors over his lap — and, quick, his afterimages and speed lines
    const r = g.ride;

    const him = () => {
      if (r) zeCar(cx, r.kind, g.x, ZE_FLOOR, g.f, r.wheel, r.tilt, 0, 'back');
      zeHero(cx, g);
      if (r) zeCar(cx, r.kind, g.x, ZE_FLOOR, g.f, r.wheel, r.tilt, 0, 'front');
    };

    if (zeFast(g)) {
      cx.strokeStyle = 'rgba(255, 243, 196, .5)';
      cx.lineWidth = 2.5;
      cx.beginPath();

      for (let i = 0; i < 7; i++) {
        const ly = ZE_FLOOR - 24 - i * 24;
        const len = 40 + ((i * 37 + (calm ? 0 : Math.floor(g.t * 30))) % 60);
        const lx = g.x - g.f * (112 + (i % 3) * 16);

        cx.moveTo(lx, ly);
        cx.lineTo(lx - g.f * len, ly);
      }

      cx.stroke();

      g.trail.slice(1, 5).forEach((p, i) => {
        cx.save();
        cx.globalAlpha = 0.26 - i * 0.06;
        cx.translate(p.x - g.x, p.y - g.y);
        him();
        cx.restore();
      });
    }

    him();
    if (g.galo) zeGaloDraw(cx, g, calm);
    if (g.holdAt != null && g.nun >= ZE_NUN && !g.ride && g.t - g.holdAt > 0.12) zeNunchaku(cx, g, calm);

    if (g.sweep > 0) {
      // the sweep: an arc round him, fading
      cx.strokeStyle = `rgba(255, 243, 196, ${g.sweep * 2})`;
      cx.lineWidth = 10;
      cx.beginPath();
      cx.arc(g.x, g.y - 90 * zeSz(g), 150 + (0.35 - g.sweep) * 500, 0, Math.PI * 2);
      cx.stroke();
    }
  }

  for (const b of g.bits) {
    cx.globalAlpha = 1 - b.t / b.life;
    cx.fillStyle = b.c;

    if (!b.w) {
      cx.fillRect(b.x - b.r, b.y - b.r, b.r * 2, b.r * 2);
      continue;
    }

    cx.save();
    cx.translate(b.x, b.y);
    cx.rotate(b.rot);
    cx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);

    if (b.bone) {
      cx.fillRect(-b.w / 2 - 2, -b.h / 2 - 1.5, 3, 3);
      cx.fillRect(-b.w / 2 - 2, b.h / 2 - 1.5, 3, 3);
      cx.fillRect(b.w / 2 - 1, -b.h / 2 - 1.5, 3, 3);
      cx.fillRect(b.w / 2 - 1, b.h / 2 - 1.5, 3, 3);
    } // a bone's knobs

    cx.restore();
  }

  cx.globalAlpha = 1;
}

/** What is read, on the top canvas whichever draws the rest, and never lit or blurred: the floating words, the HUD, the cards. */
function zeUi(cx, g, k, calm) {
  for (const w of g.words) {
    cx.globalAlpha = Math.min(1, 2.2 - w.t * 2);
    zeText(cx, w.s, w.x, w.y, w.big ? 30 : 19, w.c, 'center');
  }

  cx.globalAlpha = 1;
  cx.setTransform(k, 0, 0, k, 0, 0);

  if (!calm && g.red > 0) {
    cx.fillStyle = 'rgba(228, 59, 68, .28)';
    cx.fillRect(0, 0, ZE_W, ZE_H);
  } // the hit

  if (!calm && g.flash > 0 && !zg.gl) {
    cx.fillStyle = `rgba(255, 250, 235, ${Math.min(0.65, g.flash * 4)})`;
    cx.fillRect(0, 0, ZE_W, ZE_H);
  } // the lightning's

  if (!calm && g.gold > 0) {
    cx.fillStyle = `rgba(255, 210, 63, ${g.gold * 0.7})`;
    cx.fillRect(0, 0, ZE_W, ZE_H);
  } // the miracle's

  if (g.phase === 'over' && g.koT < ZE_KO_T) return; // the card waits for the bones
  if (g.phase !== 'title' && g.phase !== 'over') zeHud(cx, g); // the K.O. says the score itself, and what landed

  if (g.banner && g.phase === 'play') {
    const b = g.banner;

    zeText(cx, b.s, ZE_W / 2, 300, 46, b.cs[zeBlink(g, 8) ? 0 : 1], 'center', 900);
    if (b.sub) zeText(cx, b.sub, ZE_W / 2, 348, 17, '#fff3c4', 'center');
  }

  if (g.trophy && g.phase === 'play') {
    // a trophy won: a plaque dropping in under the HUD
    const T = g.trophy;
    const y = 170 - Math.max(0, T.t - 2.3) * 200;
    const w = 360;

    cx.fillStyle = '#1b0b2e';
    cx.beginPath();
    cx.roundRect(ZE_W / 2 - w / 2 - 3, y - 25, w + 6, 56, 12);
    cx.fill();
    cx.fillStyle = '#3a2a52';
    cx.strokeStyle = '#ffd23f';
    cx.lineWidth = 2;
    cx.beginPath();
    cx.roundRect(ZE_W / 2 - w / 2, y - 22, w, 50, 10);
    cx.fill();
    cx.stroke();
    cx.drawImage(zeGlyph(T.e), ZE_W / 2 - w / 2 + 10, y - 17, 40, 40);
    zeText(cx, 'TROPHY', ZE_W / 2 - w / 2 + 62, y - 6, 12, '#ffd23f', 'left', 700);
    zeText(cx, T.name, ZE_W / 2 - w / 2 + 62, y + 13, 20, '#fff3c4');
  }

  if (g.phase !== 'play') zeCard(cx, g);
}

/** The house above Trota's, risen behind it while the Avó da Horta is out: a granite front, a window with its green
 *  shutters open, geraniums on the sill, and her in it — throwing, hit, and what she says. */
function zeAvoHouse(cx, g, calm) {
  const a = g.avo;
  const top = 704 - 162 * (1 - (1 - a.rise) ** 2);
  const K = '#1b0b2e';
  const wx = ZE_AVO.x - 38;
  const wy = top + 14;

  cx.fillStyle = K;
  cx.fillRect(468, top - 4, 204, 712 - top);
  cx.fillStyle = '#d8cdb8';
  cx.fillRect(472, top, 196, 712 - top);
  cx.fillStyle = '#7a4630';
  cx.fillRect(464, top - 10, 212, 8); // the eaves

  for (let y = top + 12; y < 700; y += 14) {
    cx.fillStyle = 'rgba(120, 100, 80, .18)';
    cx.fillRect(472, y, 196, 1.5);
  } // granite courses

  cx.fillStyle = K;
  cx.fillRect(wx - 4, wy - 4, 84, 82);
  cx.fillStyle = '#2a1d24';
  cx.fillRect(wx, wy, 76, 74); // the window, dark inside

  for (const sx of [wx - 34, wx + 78]) {
    cx.fillStyle = K;
    cx.fillRect(sx - 2, wy - 4, 36, 82);
    cx.fillStyle = '#2f8f4e';
    cx.fillRect(sx, wy - 2, 32, 78);
    cx.fillStyle = '#24643a';
    for (let y = wy + 4; y < wy + 74; y += 8) cx.fillRect(sx + 3, y, 26, 3);
  }

  // her, from her waist up — leaning out, flinching when hit
  const p = 2.6;
  const hx = ZE_AVO.x - 10 * p + (a.hit > 0 && !calm ? Math.sin(a.hit * 60) * 4 : 0);
  const hy = wy + 8;

  ZE_AVO_FACE.forEach((row, r) => {
    for (let i = 0; i < row.length; i++) {
      let ch = row[i];

      if (ch === '.') continue;
      if (ze.mossad && r === 6 && 'oe'.includes(ch)) ch = 'k'; // sunglasses, she too
      cx.fillStyle = a.hit > 0 && ch === 's' ? '#9be15d' : ZE_AVO_PAL[ch];
      cx.fillRect(hx + i * p, hy + r * p, p + 0.2, p + 0.2);
    }
  });

  if (a.arm > 0) {
    cx.fillStyle = ZE_AVO_PAL.a;
    cx.fillRect(hx + 17 * p, hy + 3 * p, 3 * p, 12 * p);
    cx.fillStyle = ZE_AVO_PAL.s;
    cx.fillRect(hx + 17 * p, hy, 3 * p, 3 * p);
  } // her arm up, throwing

  cx.fillStyle = '#7a4630';
  cx.fillRect(wx - 8, wy + 70, 92, 8); // the sill, its geraniums

  for (let i = 0; i < 5; i++) {
    cx.fillStyle = '#2f8f3a';
    cx.fillRect(wx - 2 + i * 18, wy + 60, 12, 10);
    cx.fillStyle = '#e8322f';
    cx.fillRect(wx + 1 + i * 18, wy + 56, 6, 6);
  }

  for (let i = 0; i < 3; i++) {
    cx.fillStyle = i < a.hp ? '#e8322f' : 'rgba(255, 255, 255, .25)';
    cx.fillRect(ZE_AVO.x - 26 + i * 20, top - 30, 14, 10);
  } // her patience

  if (a.sayT > 0) {
    // what she says
    cx.font = 'italic 800 15px Futura, "Avenir Next Condensed", system-ui, sans-serif';

    const w = cx.measureText(a.say).width + 24;
    const bx = Math.max(12, ZE_AVO.x - 60 - w);
    const by = top + 4;

    cx.fillStyle = K;
    cx.beginPath();
    cx.roundRect(bx - 2, by - 2, w + 4, 34, 10);
    cx.fill();
    cx.fillStyle = '#fff6e0';
    cx.beginPath();
    cx.roundRect(bx, by, w, 30, 9);
    cx.fill();
    cx.beginPath();
    cx.moveTo(bx + w - 6, by + 10);
    cx.lineTo(bx + w + 14, by + 22);
    cx.lineTo(bx + w - 6, by + 22);
    cx.fill();
    cx.fillStyle = K;
    cx.textAlign = 'left';
    cx.textBaseline = 'middle';
    cx.fillText(a.say, bx + 12, by + 16);
  }
}

/** Player two's galo: its shadow, itself turned its way, pecking — and its score over it in VERSUS. */
function zeGaloDraw(cx, g, calm) {
  const b = g.galo;
  let spr = ze.sprites.get('galo2');

  if (!spr) {
    const src = document.createElement('canvas');
    const x = src.getContext('2d');

    src.width = ZE_GALO[0].length;
    src.height = ZE_GALO.length;

    ZE_GALO.forEach((r, j) =>
      [...r].forEach((ch, i) => {
        if (ch !== '.') {
          x.fillStyle = ZE_GALO_PAL[ch];
          x.fillRect(i, j, 1, 1);
        }
      }),
    );

    spr = zeSprite(src);
    ze.sprites.set('galo2', spr);
  }

  const p = 3.2;
  const bob = b.y >= ZE_FLOOR && Math.abs(b.vx) > 30 && !calm ? -Math.abs(Math.sin(b.t * 14)) * 3 : 0;

  if (!cx.zg) {
    cx.fillStyle = 'rgba(20, 8, 30, .35)';
    cx.beginPath();
    cx.ellipse(b.x, ZE_FLOOR + 3, 24, 5, 0, 0, Math.PI * 2);
    cx.fill();
  }

  const halo = cx.createRadialGradient(b.x, b.y - 26, 4, b.x, b.y - 26, 46);

  halo.addColorStop(0, 'rgba(255, 236, 170, .45)');
  halo.addColorStop(1, 'rgba(255, 236, 170, 0)'); // a pale glow: a black bird on the dusk
  cx.fillStyle = halo;
  cx.fillRect(b.x - 46, b.y - 72, 92, 92);
  cx.save();
  cx.translate(b.x, b.y + bob);
  cx.scale(b.f, 1);
  if (b.peck > 0) cx.rotate(0.45);
  cx.imageSmoothingEnabled = false;
  cx.drawImage(spr, -11 * p, -(spr.height - 1) * p, spr.width * p, spr.height * p);
  cx.imageSmoothingEnabled = true;
  if (ze.mossad) zeShades(cx, 3 * p, -13.5 * p, 0.55, '#c8ccd2');
  cx.restore();
  zeText(cx, b.mode === 'versus' ? `P2 · ${b.score}` : 'P2', b.x, b.y - 70, 14, '#ffcc33', 'center');
}

/** Sunglasses at (x, y), s big: two black lenses on a bridge, rimmed so they read on a black head. */
function zeShades(cx, x, y, s, rim) {
  cx.fillStyle = rim;
  cx.fillRect(x - 11 * s, y - 4 * s, 22 * s, 8 * s);
  cx.fillStyle = '#0e0c12';
  cx.fillRect(x - 10 * s, y - 3 * s, 9 * s, 6 * s);
  cx.fillRect(x + 1 * s, y - 3 * s, 9 * s, 6 * s);
  cx.fillStyle = 'rgba(160, 200, 255, .8)';
  cx.fillRect(x - 8 * s, y - 2 * s, 3 * s, 1.5 * s);
  cx.fillRect(x + 3 * s, y - 2 * s, 3 * s, 1.5 * s);
}

/** The nunchaku in his front fist, spinning while space is held: a stick held, its chain, the other stick round it. */
function zeNunchaku(cx, g, calm) {
  const k = zeSz(g);
  const hx = g.x + g.f * 34 * k;
  const hy = g.y - 100 * k;
  const a = calm ? -0.6 : g.t * 24;
  const L = 34 * k;

  const stick = (x0, y0, x1, y1) => {
    for (const [w, c] of [
      [9, '#1b0b2e'],
      [5, '#a0522d'],
    ]) {
      cx.strokeStyle = c;
      cx.lineWidth = w;
      cx.lineCap = 'round';
      cx.beginPath();
      cx.moveTo(x0, y0);
      cx.lineTo(x1, y1);
      cx.stroke();
    }
  };

  const ex = hx + g.f * 10 * k;
  const ey = hy - 18 * k;
  const cx2 = ex + Math.cos(a) * 12 * k;
  const cy2 = ey + Math.sin(a) * 12 * k;

  stick(hx, hy, ex, ey);
  cx.strokeStyle = '#c8ccd2';
  cx.lineWidth = 2;
  cx.beginPath();
  cx.moveTo(ex, ey);
  cx.lineTo(cx2, cy2);
  cx.stroke();
  stick(cx2, cy2, cx2 + Math.cos(a) * L, cy2 + Math.sin(a) * L);

  if (!calm) {
    cx.strokeStyle = 'rgba(255, 243, 196, .35)';
    cx.lineWidth = 3;
    cx.beginPath();
    cx.arc(ex, ey, L + 12 * k, a - 1.2, a);
    cx.stroke();
  } // its blur
}

function zeText(cx, s, x, y, size, fill, align = 'left', weight = 800) {
  cx.font = `italic ${weight} ${size}px Futura, "Avenir Next Condensed", system-ui, sans-serif`;
  cx.textAlign = align;
  cx.textBaseline = 'middle';
  cx.lineJoin = 'round';
  cx.lineWidth = Math.max(3, size / 5);
  cx.strokeStyle = '#1b0b2e';
  cx.strokeText(s, x, y);
  cx.fillStyle = fill;
  cx.fillText(s, x, y);
}

/** An emoji drawn once into a canvas of its own: fillText of a colour glyph every frame is the slow way. Tinted (the
 *  golden galo's gold) over its own shapes, if asked. */
function zeGlyph(e, tint = null) {
  const key = tint ? e + tint : e;
  let c = ze.glyphs.get(key);

  if (c) return c;
  c = document.createElement('canvas');
  c.width = c.height = 96;
  const x = c.getContext('2d');

  x.font = '76px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText(e, 48, 54);

  if (tint) {
    x.globalCompositeOperation = 'source-atop';
    x.fillStyle = tint;
    x.fillRect(0, 0, 96, 96);
  }

  ze.glyphs.set(key, c);
  return c;
}

/** A dish in pixels, 16 square, outlined: its rects (P) and its ellipses (E) — a power-up's. */
function zeDish(k) {
  let c = ze.sprites.get(`dish:${k}`);

  if (c) return c;

  const src = document.createElement('canvas');
  const x = src.getContext('2d');

  src.width = src.height = 16;

  const P = (a, b, w, h, col) => {
    x.fillStyle = col;
    x.fillRect(a, b, w, h);
  };

  const E = (ex, ey, rx, ry, col) => {
    x.fillStyle = col;

    for (let py = 0; py < 16; py++) {
      for (let px = 0; px < 16; px++) {
        const dx = (px + 0.5 - ex) / rx;
        const dy = (py + 0.5 - ey) / ry;

        if (dx * dx + dy * dy <= 1) x.fillRect(px, py, 1, 1);
      }
    }
  };

  ZE_POWERS[k].draw(P, E);
  c = zeSprite(src);
  ze.sprites.set(`dish:${k}`, c);
  return c;
}

/** The board's own fish (FISH, the home's and the status bar's), in the theme's accent, outlined — head to the left. */
function zePeixe() {
  let c = ze.sprites.get('peixe');

  if (c) return c;

  const src = document.createElement('canvas');
  const x = src.getContext('2d');
  const accent = cssToken('--accent') || '#7ef0ff';

  src.width = FISH[0].length;
  src.height = FISH.length;

  FISH.forEach((r, j) =>
    [...r].forEach((ch, i) => {
      if (ch === '.') return;
      x.fillStyle = ch === 'o' ? '#1b0b2e' : ch === '=' ? 'rgba(0, 0, 0, .3)' : accent;
      x.fillRect(i, j, 1, 1);

      if (ch === '=') {
        x.globalCompositeOperation = 'destination-over';
        x.fillStyle = accent;
        x.fillRect(i, j, 1, 1);
        x.globalCompositeOperation = 'source-over';
      }
    }),
  );

  c = zeSprite(src);
  ze.sprites.set('peixe', c);
  return c;
}

/** A pixel drawing, outlined a pixel round whatever is drawn, into a canvas a pixel bigger each way; tinted, if asked. */
function zeSprite(src, tint) {
  const w = src.width;
  const h = src.height;
  const a = src.getContext('2d').getImageData(0, 0, w, h).data;
  const c = document.createElement('canvas');
  const x = c.getContext('2d');

  c.width = w + 2;
  c.height = h + 2;
  x.fillStyle = '#1b0b2e';
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (a[(j * w + i) * 4 + 3]) x.fillRect(i, j, 3, 3);
  x.drawImage(src, 1, 1);

  if (tint) {
    x.globalCompositeOperation = 'source-atop';
    x.fillStyle = tint;
    x.fillRect(0, 0, c.width, c.height);
  }

  return c;
}

/** His bulk in pixels: half his shoulders, half his waist, his arms' and legs' thickness — skinny at none, MONSTRO at ZE_MASS_MAX. */
const zeBulkPx = m => ({
  hw: Math.round(5 + (m * 7) / ZE_MASS_MAX),
  ww: Math.round(4 + m / 3),
  at: 2 + (m >= 5) + (m >= 10),
  lw: 3 + (m >= 5) + (m >= 10),
});

const ZE_PX = 2.6;
const ZE_BW = 52;
const ZE_BH = 64;
const ZE_FEET = 61; // the picture's units to a pixel of his; the sprite; his feet's row in it

/** Zé whole, in pixels (2026-10-30, the next round): his body in a pose (ZE_POSES) at his bulk, then his face — chewing,
 *  open as food comes, an agent's, green from a green —, outlined; turned to face left with his face unturned; or
 *  his bones and his skull. Cached by all of that. */
function zeBuild(m, pose, o = {}) {
  const key = `${m}|${pose}|${+!!o.open}|${+!!o.agent}|${+!!o.sick}|${+!!o.flip}|${+!!o.shades}`;
  let spr = ze.sprites.get(key);

  if (spr) return spr;
  if (ze.sprites.size > 400) ze.sprites.clear();

  const W = ZE_BW;
  const cx = 25;
  const top = 23;
  const B = zeBulkPx(m);
  const bones = pose === 'bones';
  const c = document.createElement('canvas');

  c.width = W;
  c.height = ZE_BH;

  const x = c.getContext('2d');
  const Y = ZE_SUIT;

  const P = (a, b, w, h, col) => {
    x.fillStyle = col;
    x.fillRect(o.flip ? W - a - w : a, b, w, h);
  };

  const seg = ([x0, y0], [x1, y1], th, col) => {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);

    for (let i = 0; i <= n; i++) {
      P(
        Math.floor(x0 + ((x1 - x0) * i) / n - th / 2 + 0.5),
        Math.floor(y0 + ((y1 - y0) * i) / n - th / 2 + 0.5),
        th,
        th,
        col,
      );
    }
  };

  const L = ZE_POSES[bones ? 'stand' : pose](cx, top, B);

  if (bones) {
    // only bones: the neck, the spine, four ribs, the pelvis, the long bones and their joints
    P(cx - 1, 19, 2, 4, Y.bone);
    seg([cx, top], [cx, top + 14], 2, Y.bone);

    for (let r = 0; r < 4; r++) {
      P(cx - 6 + r, top + 3 + r * 3, 12 - r * 2, 1, Y.bone);
      P(cx - 6 + r, top + 4 + r * 3, 1, 1, Y.bone2);
      P(cx + 5 - r, top + 4 + r * 3, 1, 1, Y.bone2);
    }

    P(cx - 4, top + 14, 8, 2, Y.bone);

    for (const [s, e, w] of [...L.arms, ...L.legs]) {
      seg(s, e, 1, Y.bone);
      seg(e, w, 1, Y.bone);
      P(e[0] - 1, e[1] - 1, 2, 2, Y.bone2);
      P(w[0] - 1, w[1] - 1, 2, 2, Y.bone);
    }
  } else {
    L.legs.forEach(([h, k, a], i) => {
      // the legs, their outer stripe, the shoes
      const out = i ? B.lw / 2 - 0.5 : -B.lw / 2 + 0.5;
      const up = -B.lw / 2 + 0.5;

      seg(h, k, B.lw, Y.Y);
      seg(k, a, B.lw, Y.Y);

      if (L.kick && i === 1) {
        seg([h[0], h[1] + up], [k[0], k[1] + up], 1, Y.K);
        seg([k[0], k[1] + up], [a[0], a[1] + up], 1, Y.K);
        P(a[0] + 1, a[1] - Math.ceil(B.lw / 2) - 1, 3, B.lw + 2, Y.K);
      } else if (pose === 'sit') P(a[0] - 1, a[1] + 1, B.lw + 3, 2, Y.K);
      else {
        seg([h[0] + out, h[1]], [k[0] + out, k[1]], 1, Y.K);
        seg([k[0] + out, k[1]], [a[0] + out, a[1]], 1, Y.K);
        P(Math.floor(a[0] - B.lw / 2 + 0.5), a[1] + 1, B.lw + 2, 2, Y.K);
      }
    });

    for (let r = 0; r < 15; r++) {
      // the torso: his shoulders, a taper to the waist, the suit's stripes
      const half = r <= 3 ? B.hw : r >= 11 ? B.ww : Math.round(B.hw + ((B.ww - B.hw) * (r - 3)) / 8);
      const inset = r === 0 ? 1 + (m >= 10) : r === 1 && m >= 10 ? 1 : 0;

      P(cx - half + inset, top + r, half * 2 - inset * 2, 1, Y.Y);

      if (r) {
        P(cx - half + 1, top + r, 1, 1, Y.K);
        P(cx + half - 2, top + r, 1, 1, Y.K);
      }
    }

    P(cx - 1, top + 1, 1, 14, Y.y); // the zip

    if (m >= 5) {
      const pr = m >= 10 ? 6 : 5;

      P(cx - B.hw + 3, top + pr, B.hw - 4, 1, Y.y);
      P(cx + 1, top + pr, B.hw - 4, 1, Y.y);
      P(cx - B.hw + 3, top + 2, 3, 1, Y.l);
      P(cx + 2, top + 2, 3, 1, Y.l);
    } // pecs

    if (m >= 9) {
      for (const r of [8, 10, 12]) {
        P(cx - 4, top + r, 2, 1, Y.y);
        P(cx + 1, top + r, 2, 1, Y.y);
      }
    } // abs

    if (m <= 2) for (const r of [5, 7, 9]) P(cx - B.hw + 3, top + r, B.hw * 2 - 6, 1, Y.y); // his ribs, through the suit

    for (const [s, e, w] of L.arms) {
      // a sleeve to the wrist (a biceps when he is buff), a fist
      seg(s, e, B.at + (m >= 10), Y.Y);
      seg(e, w, B.at, Y.Y);
      if (m >= 10) P(Math.round((s[0] + e[0]) / 2) - 1, Math.round((s[1] + e[1]) / 2) - 2, 2, 1, Y.l);

      const f = B.at + 1;
      const fx = Math.floor(w[0] - f / 2 + 0.5);
      const fy = Math.floor(w[1] - f / 2 + 0.5);

      P(fx, fy, f, f, Y.s);
      P(fx, fy + f - 1, f, 1, Y.S);
    }
  }

  const fx0 = o.flip ? W - cx - 10 : cx - 10; // the face, last and never turned: over the neck, whichever way he faces

  (bones ? ZE_SKULL : ZE_FACE).forEach((row, r) => {
    const line = (!bones && ((o.agent && ZE_SPY[r]) || (o.shades && ZE_SHADES[r]) || (o.open && ZE_OPEN[r]))) || row;

    for (let i = 0; i < line.length; i++) {
      if (line[i] !== '.') {
        x.fillStyle = ZE_PAL[line[i]];
        x.fillRect(fx0 + i, r, 1, 1);
      }
    }
  });

  spr = zeSprite(c, o.sick ? 'rgba(110, 200, 70, .45)' : null);
  ze.sprites.set(key, spr);
  return spr;
}

/** A sprite of his at (x, y) — his feet —, p units a pixel, squashed (sx, sy) about his feet; unsmoothed. */
function zeBlit(cx, spr, x, y, p, flip, sx = 1, sy = 1) {
  const ax = flip ? ZE_BW + 2 - 26 : 26; // the torso's middle, the face's, in the outlined sprite

  cx.imageSmoothingEnabled = false;
  cx.drawImage(spr, x - ax * p * sx, y - ZE_FEET * p * sy, spr.width * p * sx, spr.height * p * sy);
  cx.imageSmoothingEnabled = true;
}

function zeHud(cx, g) {
  const D = zeDiff();

  zeText(cx, `SCORE ${g.score}`, 20, 30, 26, '#fff3c4');

  if (g.mult > 1 && g.phase === 'play') {
    zeText(cx, `COMBO ×${g.mult}`, 22, 62, 17, zeBlink(g, 6) ? '#feae34' : '#f77622');
  }

  if (g.galo?.mode === 'versus') zeText(cx, `GALO ${g.galo.score}`, 220, 30, 16, '#ffcc33');
  zeText(cx, `BEST ${Math.max(zeBests()[D.id] || 0, g.score)}`, ZE_W / 2, 30, 16, '#d9c7e8', 'center');

  // his bulk, a bar of ZE_MASS_MAX from bone to meat — the left end blinking when it is nearly all that is left
  const bw = 12;
  const gap = 3;
  const x0 = ZE_W - 20 - ZE_MASS_MAX * (bw + gap) + gap;
  const thin = g.mass <= 2 && g.phase === 'play';

  zeText(cx, 'BUFF', x0 - 12, 30, 15, thin && !zeBlink(g, 4) ? '#ff5a64' : '#fff3c4', 'right');

  for (let i = 0; i < ZE_MASS_MAX; i++) {
    cx.fillStyle = '#1b0b2e';
    cx.fillRect(x0 + i * (bw + gap) - 1.5, 19, bw + 3, 23);

    cx.fillStyle =
      i >= g.mass ? 'rgba(255, 255, 255, .1)' : i < 2 ? '#f2ead8' : i < 5 ? '#e8a07a' : i < 9 ? '#e05a4a' : '#b8203a';

    cx.fillRect(x0 + i * (bw + gap), 20.5, bw, 20);
  }

  zeText(cx, `${D.name} · LEVEL ${g.level}`, ZE_W - 20, 62, 15, D.c, 'right');
  if (thin) zeText(cx, 'SKIN AND BONES!', ZE_W - 20, 86, 14, '#ff5a64', 'right');
  const full = g.nun >= ZE_NUN; // the nunchaku's meter, under his score

  zeText(
    cx,
    full ? 'NUNCHAKU! HOLD SPACE' : 'NUNCHAKU',
    20,
    92,
    13,
    full ? (zeBlink(g, 4) ? '#ffd23f' : '#ff5a64') : '#d9c7e8',
  );

  if (!full) {
    for (let i = 0; i < ZE_NUN; i++) {
      cx.fillStyle = '#1b0b2e';
      cx.fillRect(108 + i * 11, 85, 9, 14);
      cx.fillStyle = i < Math.floor(g.nun) ? '#ffd23f' : 'rgba(255, 255, 255, .12)';
      cx.fillRect(109.5 + i * 11, 86.5, 6, 11);
    }
  }

  if (g.agent) {
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

  const bar = (frac, c, label) => {
    // the dragon's time, the car's, a power-up's, running out — one under the other
    cx.fillStyle = '#1b0b2e';
    cx.fillRect(20, by, ZE_W - 40, 10);
    cx.fillStyle = c;
    cx.fillRect(22, by + 2, (ZE_W - 44) * frac, 6);
    zeText(cx, label, ZE_W - 20, by + 24, 14, c, 'right');
    by += 40;
  };

  if (g.dragon) bar(g.dragon / ZE_DRAGON, zeBlink(g, 12) ? '#ff7a2a' : '#ffd23f', 'MODO FERA');
  else if (g.ride) bar(g.ride.t / ZE_RIDE, ZE_CARS[g.ride.kind].c, ZE_CARS[g.ride.kind].name);
  if (g.power) bar(g.power.t / ZE_POWER_T, ZE_POWERS[g.power.kind].c, ZE_POWERS[g.power.kind].name.slice(0, -1));
}

/** The title's four ways to play, and the K.O.'s two ways on — where a click lands. */
function zeDiffButtons() {
  const ws = ZE_DIFFS.map(d => d.name.length * 11 + 28);
  const gap = 8;

  let x = ZE_W / 2 - (ws.reduce((a, b) => a + b) + gap * (ws.length - 1)) / 2;

  return ZE_DIFFS.map((d, i) => {
    const b = { x, y: 424, w: ws[i], h: 28, i };

    x += ws[i] + gap;
    return b;
  });
}

/** The K.O.'s ways on: again, the menu — and, with the board's chat on, a new best posted to its room, and on a Friday
 *  the week's poll (T3, 2026-10-30, the next round). Each is a click or ← → and space; nothing goes to the room
 *  but on one. */
function zeOverButtons() {
  const g = ze.g;
  const c = state.chat;
  const room = !!c?.on && !c.missing && c.room != null;
  const say = (v, idle, done) => (v === 'sending' ? 'SENDING…' : v === 'sent' ? done : v ? 'NOT SENT' : idle);

  const bs = [
    { id: 'again', s: 'AGAIN', w: 122 },
    { id: 'menu', s: 'MENU', w: 122 },
  ];

  if (room && (g.best || g.todays)) bs.push({ id: 'post', s: say(g.posted, 'POST TO THE CHAT', 'POSTED ✓'), w: 176 });

  if (room && new Date().getDay() === 5) {
    bs.push({ id: 'poll', s: say(g.polled, 'FRIDAY POLL', 'POLL ASKED ✓'), w: 150 });
  }

  let x = ZE_W / 2 - (bs.reduce((a, b) => a + b.w, 0) + 10 * (bs.length - 1)) / 2;

  return bs.map(b => {
    const o = { ...b, x, y: 568, h: 32 };

    x += b.w + 10;
    return o;
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

async function zePost(g) {
  if (g.posted === 'sending' || g.posted === 'sent') return;
  const D = zeDiff();

  g.posted = 'sending';
  g.roomSay = '';

  try {
    await api('POST', '/api/chat/send', {
      body: `${ZE_POST} ${g.score} on ${D.name}, level ${g.level} — ${g.best ? 'a new best' : "today's best"} 🥋 (the day's round, ${zeToday()})`,
    });

    g.posted = 'sent';
    g.roomSay = 'in the chat — ⌥⌘Z for yours';
  } catch (e) {
    g.posted = 'failed';
    g.roomSay = e.message;
  }
}

/** Friday's poll: the week's scores posted in the room, each one's best, the top eight asked about. */
async function zePoll(g) {
  if (g.polled === 'sending' || g.polled === 'sent') return;
  g.polled = 'sending';
  g.roomSay = '';

  try {
    const d = await api('GET', '/api/chat/messages');
    const since = Date.now() - 7 * 86_400_000;
    const best = new Map();

    for (const m of d.msgs || []) {
      const k = String(m.body || '').match(ZE_POST_RE);

      if (!k || new Date(m.at) < since) continue;
      if (+k[1] > (best.get(m.who)?.n || 0)) best.set(m.who, { n: +k[1], way: k[2] });
    }

    const top = [...best].sort((a, b) => b[1].n - a[1].n).slice(0, 8);

    if (top.length < 2) {
      g.polled = 'failed';
      g.roomSay = top.length ? 'one score posted this week — a poll wants two' : 'no score posted this week';
      return;
    }

    await api('POST', '/api/chat/poll', {
      q: 'Who is the Bruce Lee of Barcelos this week? 🥋',
      answers: top.map(([who, b]) => `${who} — ${b.n} on ${b.way}`),
      many: false,
    });

    g.polled = 'sent';
    g.roomSay = 'the poll is in the chat';
  } catch (e) {
    g.polled = 'failed';
    g.roomSay = e.message;
  }
}

const zeIn = (b, x, y) => x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h;

function zeButton(cx, b, s, on, c) {
  cx.fillStyle = '#1b0b2e';
  cx.beginPath();
  cx.roundRect(b.x - 2, b.y - 2, b.w + 4, b.h + 4, 8);
  cx.fill();
  cx.fillStyle = on ? c : '#3a2a52';
  cx.beginPath();
  cx.roundRect(b.x, b.y, b.w, b.h, 6);
  cx.fill();
  cx.font = 'italic 800 15px Futura, "Avenir Next Condensed", system-ui, sans-serif';
  cx.textAlign = 'center';
  cx.textBaseline = 'middle';
  cx.fillStyle = on ? '#1b0b2e' : '#d9c7e8';
  cx.fillText(s, b.x + b.w / 2, b.y + b.h / 2 + 1);
}
