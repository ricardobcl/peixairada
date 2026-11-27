// ---- a frame
function zgDraw() {
  const canvas = $('#zeCanvas');
  const cx = canvas.getContext('2d');
  const game = ze.g;
  const scale = canvas.width / ZE_W;
  const calm = zeCalm();
  const gl = zg.gl;
  const ax = zg.ax;

  zg.k = scale;
  zgSize(canvas.width, canvas.height);
  gl.disable(gl.BLEND);
  zgBind(zg.fA);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  ax.begin(scale);
  if (ze.mossad) zeShades(ax, 110 + 39 * 1.35, ZE_FLOOR - 126 * 1.35, 1.35, '#c8ccd2');

  if (game.flex > 0) {
    const fade = Math.min(1, game.flex / 0.3, (1.4 - game.flex) / 0.2);
    const width = 70 * zeSz(game);

    ax.fillStyle = `rgba(255, 246, 210, ${0.13 * fade})`;
    ax.beginPath();
    ax.moveTo(game.x - 18, 0);
    ax.lineTo(game.x + 18, 0);
    ax.lineTo(game.x + width * 1.4, ZE_FLOOR);
    ax.lineTo(game.x - width * 1.4, ZE_FLOOR);
    ax.closePath();
    ax.fill();
  }

  zeActors(ax, game, calm);
  ax.end();
  cx.setTransform(1, 0, 0, 1, 0, 0);
  cx.clearRect(0, 0, canvas.width, canvas.height);
  cx.setTransform(scale, 0, 0, scale, 0, 0);
  zeUi(cx, game, scale, calm);
  let behind = false;

  if (game.bolt || game.avo) {
    // what stands behind Trota's: the bolt, the Avó's house
    behind = true;
    zgBind(zg.fC);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    ax.begin(scale);

    if (game.bolt) {
      for (const [width, col] of [
        [9, 'rgba(200, 121, 255, .6)'],
        [3, '#fff6e0'],
      ]) {
        ax.strokeStyle = col;
        ax.lineWidth = width;
        ax.beginPath();
        ax.moveTo(...game.bolt.pts[0]);
        for (const pt of game.bolt.pts.slice(1)) ax.lineTo(...pt);
        ax.stroke();
      }
    }

    if (game.avo) zeAvoHouse(ax, game, calm);
    ax.end();
  }

  zgRender(game, calm, behind);
  zg.frames++;
}

/** What lights the round this frame: Trota's lamps, windows and sign, the terrace's lamps, the dragon's fire, MONSTRO's spot, a power-up, what shines as it falls, a car's headlight. */
function zgLights(game, look, calm) {
  const lp = (zg.lp ||= new Float32Array(48));
  const lc = (zg.lc ||= new Float32Array(48));

  let count = 0;

  const add = (atX, atY, atZ, radius, cr, cg, cb, casts = 0) => {
    if (count >= 12) return;
    lp.set([atX, atY, atZ, radius], count * 4);
    lc.set([cr, cg, cb, casts], count * 4);
    count++;
  };

  const { x: RX, w: RW, top: RT } = ZE_REST;
  const AY = RT + 18;
  const warm = [1.9, 1.25, 0.55];
  const time = zg.T;
  const fl = calm ? 1 : 0.94 + 0.06 * Math.sin(time * 13) * Math.sin(time * 7.3);

  const on = look.lamp * fl;
  const windowsOn = look.win * fl;

  for (const lx of [RX + 32, RX + RW - 32]) {
    add(lx, RT + 9, 34, 62, warm[0] * on * 0.9, warm[1] * on * 0.9, warm[2] * on * 0.9);
  }

  for (const wx of [RX + 42, RX + RW - 42]) {
    add(wx, AY + 52, 46, 84, warm[0] * windowsOn * 0.8, warm[1] * windowsOn * 0.8, warm[2] * windowsOn * 0.8);
  }

  const sign = game.dragon ? [1.6, 0.28, 0.3] : [1.5, 1.2, 0.72];
  const so = Math.max(0.3, on) * 0.6;

  add(ZE_SIGN.x + ZE_SIGN.w / 2, ZE_SIGN.y + 44, 70, 90, sign[0] * so, sign[1] * so, sign[2] * so);

  for (const lamp of ZE_LAMPS) {
    add(lamp.x, lamp.y - 6, -24, 120, warm[0] * on * 1.25, warm[1] * on * 1.25, warm[2] * on * 1.25, on > 0.3 ? 1 : 0);
  }

  if (game.dragon) {
    const flicker = calm ? 1 : 0.8 + 0.2 * Math.sin(time * 21) + 0.1 * Math.sin(time * 37);

    add(game.x, game.y - 70, -46, 210, 3.2 * flicker, 1.3 * flicker, 0.36 * flicker);
  } // the fire is round him, not in his face

  if (game.flex > 0) {
    const fade = Math.min(1, game.flex / 0.3, (1.4 - game.flex) / 0.2);

    add(game.x, game.y - 250, 40, 180, 2.6 * fade, 2.4 * fade, 1.9 * fade);
  }

  if (game.power) {
    const packed = parseInt(ZE_POWERS[game.power.kind].c.slice(1), 16);

    add(game.x, game.y - 120, 30, 110, ((packed >> 16) & 255) / 120, ((packed >> 8) & 255) / 120, (packed & 255) / 120);
  }

  let glows = 0;

  for (const it of game.items) {
    if (glows >= 2) break;
    if (it.out) continue;

    if (
      it.kind === 'gold' ||
      it.kind === 'galo' ||
      it.kind === 'case' ||
      it.kind === 'power' ||
      it.stood > 0 ||
      it.special
    ) {
      glows++;
      const cold = it.kind === 'case';

      add(it.x, it.y, 30, 90, cold ? 0.8 : 2, cold ? 1.1 : 1.4, cold ? 2 : 0.4);
    }
  }

  if (game.ride && look.lamp > 0.3) add(game.x + game.f * 128, ZE_FLOOR - 26, 40, 120, 1.7, 1.6, 1.2);
  return { lp, lc, n: count };
}

/** What floats in each sky: gold dust, fireflies, embers, pollen; the rain's splashes on the tiles. Still under reduced motion. */
function zgAir(dt, look, calm) {
  const kind = look.dust;
  const dust = (zg.dust ||= []);

  if (zg.dustK !== kind) {
    zg.dustK = kind;
    dust.length = 0;
    const count = { gold: 70, fire: 34, ember: 60, pollen: 60, none: 0 }[kind];

    for (let index = 0; index < count; index++) {
      dust.push({
        x: Math.random() * 760 - 20,
        y: Math.random() * 860,
        s: Math.random(),
        ph: Math.random() * 6.3,
        far: Math.random(),
      });
    }
  }

  if (calm) return;

  for (const mote of dust) {
    if (kind === 'ember') {
      mote.y -= (24 + mote.s * 40) * dt;
      mote.x += Math.sin(zg.T * 1.6 + mote.ph) * 14 * dt;

      if (mote.y < 300) {
        mote.y = 840;
        mote.x = Math.random() * 720;
      }
    } else if (kind === 'fire') {
      mote.x += Math.sin(zg.T * 0.7 + mote.ph) * 12 * dt;
      mote.y += Math.cos(zg.T * 0.9 + mote.ph * 2) * 10 * dt;
    } else {
      mote.y += (3 + mote.s * 6) * dt;
      mote.x += (8 + Math.sin(zg.T * 0.5 + mote.ph) * 10) * dt;
      if (mote.y > 860) mote.y = 380;
      if (mote.x > 740) mote.x = -20;
    }
  }

  zg.splash ||= [];

  if (look.wet > 0.5) {
    for (let drops = (dt * 70 + Math.random()) | 0; drops > 0; drops--) {
      zg.splash.push({ x: Math.random() * 720, y: ZE_TERRACE + Math.random() * 66, t: 0 });
    }
  }

  for (const splash of zg.splash) splash.t += dt;
  zg.splash = zg.splash.filter(splash => splash.t < 0.18);
}
