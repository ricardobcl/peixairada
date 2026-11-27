// ---- the room: the band in the air of each sky, its rain, its thunder. All of it on the game's own context, closed with it.
const ZE_ROOM = [1.5, 2.3, 1.1, 0.8, 1.9];

function zeRoom(game) {
  const music = ze.music;

  if (!music || game.demo) return;
  const ac = music.ac;

  if (ac.state === 'closed') return;

  if (!music.room) {
    const conv = ac.createConvolver();
    const wet = ac.createGain();
    const rain = ac.createBufferSource();
    const rainF = ac.createBiquadFilter();
    const rainG = ac.createGain();

    wet.gain.value = 0;
    music.crush.connect(conv);
    conv.connect(wet);
    wet.connect(ac.destination);
    rain.buffer = music.noise;
    rain.loop = true;
    rainF.type = 'highpass';
    rainF.frequency.value = 1400;
    rainG.gain.value = 0;
    rain.connect(rainF);
    rainF.connect(rainG);
    rainG.connect(ac.destination);
    rain.start();
    music.room = { conv, wet, rainG, sky: -1, bolt: null };
  }

  const room = music.room;
  const sky = zeSkyOf(game);

  if (room.sky !== sky) {
    // a room of its own: a burst of noise dying away, as long as the sky is wide
    room.sky = sky;

    const len = Math.round(ac.sampleRate * ZE_ROOM[sky]);
    const buffer = ac.createBuffer(2, len, ac.sampleRate);

    for (let channel = 0; channel < 2; channel++) {
      const samples = buffer.getChannelData(channel);

      for (let index = 0; index < len; index++) {
        const progress = index / len;

        samples[index] = (Math.random() * 2 - 1) * (1 - progress) ** 3.2 * (index < 400 ? index / 400 : 1);
      }
    }

    room.conv.buffer = buffer;
  }

  const wet = game.phase === 'play' || game.phase === 'over' ? (sky === 3 ? 0.1 : 0.2) : 0;
  const rain = game.phase === 'play' && ZE_SKIES[sky].rain ? 0.022 : 0; // the rain's room is a small one

  if (room.wetV !== wet) {
    room.wetV = wet;
    room.wet.gain.setTargetAtTime(wet, ac.currentTime, 0.08);
  }

  if (room.rainV !== rain) {
    room.rainV = rain;
    room.rainG.gain.setTargetAtTime(rain, ac.currentTime, 0.3);
  }

  if (game.bolt && game.bolt !== room.bolt) {
    // thunder, a moment after the bolt
    const source = ac.createBufferSource();
    const filter = ac.createBiquadFilter();
    const volume = ac.createGain();
    const at = ac.currentTime + 0.12;

    source.buffer = music.noise;
    source.loop = true;
    filter.type = 'lowpass';
    filter.frequency.value = 170;
    volume.gain.setValueAtTime(0, at);
    volume.gain.linearRampToValueAtTime(0.5, at + 0.05);
    volume.gain.exponentialRampToValueAtTime(0.001, at + 1.6);
    source.connect(filter);
    filter.connect(volume);
    volume.connect(ac.destination);
    source.start(at);
    source.stop(at + 1.7);
  }

  room.bolt = game.bolt;
}

function zgPoints(batch, mode) {
  const gl = zg.gl;

  if (!batch.n) return;
  gl.bindVertexArray(zg.ptVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, zg.ptBuf);
  gl.bufferData(gl.ARRAY_BUFFER, zg.pts.subarray(0, batch.n * 8), gl.DYNAMIC_DRAW);
  gl.useProgram(zg.Pt.p);
  gl.uniform1f(gl.getUniformLocation(zg.Pt.p, 'uK'), gl.canvas.width / ZE_W);
  gl.drawArrays(mode, 0, batch.n);
  gl.bindVertexArray(zg.vao);
}

const zgPt = (batch, centerX, centerY, size, red, green, blue, alpha, soft) => {
  const offset = batch.n++ * 8;
  const points = zg.pts;

  points[offset] = centerX;
  points[offset + 1] = centerY;
  points[offset + 2] = red;
  points[offset + 3] = green;
  points[offset + 4] = blue;
  points[offset + 5] = alpha;
  points[offset + 6] = size;
  points[offset + 7] = soft;
};

const zgNorm = vector => {
  const length = Math.hypot(...vector) || 1;

  return [vector[0] / length, vector[1] / length, vector[2] / length];
};

function zgRender(game, calm, behind) {
  const gl = zg.gl;
  const dt = ze.dt || 0;
  const iSky = zeSkyOf(game);
  const scene = zgScene(iSky);
  const set = zgSet(zg.k);
  const px = (ZE_W / 2 - game.x) * 0.05;

  if (!zg.baked) zgBakeAhead();
  if (game.freeze <= 0 && !calm) zg.T += dt;

  if (zg.sky !== iSky) {
    if (zg.sky >= 0) zg.was = { S: zg.scenes.get(zg.sky), a: 1 };
    zg.sky = iSky;
  }

  if (zg.was && (zg.was.a -= dt / 1.4) <= 0) zg.was = null;

  const dark = zeDark(game);
  const R0 = scene.R;
  const Rw = zg.was?.S.R;

  const mixv = (current, previous) =>
    zg.was ? current.map((value, index) => value + (previous[index] - value) * zg.was.a) : current;

  const mixn = (current, previous) => (zg.was ? current + (previous - current) * zg.was.a : current);

  const rig = {
    ...R0,
    amb: mixv(R0.amb, Rw?.amb),
    gnd: mixv(R0.gnd, Rw?.gnd),
    keyC: mixv(R0.keyC, Rw?.keyC),
    lamp: mixn(R0.lamp, Rw?.lamp),
    win: mixn(R0.win, Rw?.win),
    wet: mixn(R0.wet, Rw?.wet),
    bloom: mixn(R0.bloom, Rw?.bloom),
    festa: mixn(R0.festa, Rw?.festa),
  };

  if (dark) {
    rig.amb = rig.amb.map((value, index) => value * (1 - dark * [0.25, 0.62, 0.6][index]));
    rig.gnd = rig.gnd.map((value, index) => value * (1 - dark * [0.2, 0.65, 0.6][index]));
    rig.lamp = Math.max(rig.lamp, 0.8 * dark);
    rig.win = Math.max(rig.win, 0.8 * dark);
  }

  if (game.flash > 0 && !calm) {
    const flash = Math.min(1, game.flash * 5);

    rig.amb = rig.amb.map((value, index) => value + flash * [0.9, 0.9, 1.2][index]);
  }

  zgAir(dt, rig, calm);
  gl.disable(gl.BLEND);
  zgBind(zg.fH);
  zgUse(zg.P.alpha, ZG_FULL, {}, { uT: zg.fA.t }); // how high what moves stands, for its light
  zgBind(zg.fS);
  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

  const back = (backdrop, alpha) => {
    zgUse(zg.P.layer, [0, 0, ZE_W, ZE_BANK], { uA: alpha, uShift: [0, 0] }, { uT: backdrop.sky.t });

    zgUse(
      zg.P.clouds,
      [0, 0, ZE_W, ZE_WATER],
      {
        uT: zg.T,
        uCover: backdrop.R.cloud[0],
        uDark: backdrop.R.cloud[1],
        uLit: backdrop.R.cloud[2],
        uA: backdrop.R.cloud[3] * alpha,
        uTop: backdrop.R.cloud[4],
        uSunP: backdrop.sun,
      },
      { uN: zg.noise },
    );

    zgUse(
      zg.P.layer,
      [0, 520, ZE_W, ZE_WATER + 4 - 520],
      { uA: alpha, uShift: [px * 0.22, 0] },
      { uT: backdrop.hills.t },
    );

    zgUse(
      zg.P.layer,
      [0, 520, ZE_W, ZE_WATER + 2 - 520],
      { uA: alpha, uShift: [px * 0.5, 0] },
      { uT: backdrop.town.t },
    );

    zgUse(
      zg.P.layer,
      [0, 680, ZE_W, ZE_WATER + 2 - 680],
      { uA: alpha, uShift: [px * 0.7, 0] },
      { uT: backdrop.bridge.t },
    );

    zgUse(
      zg.P.river,
      [0, ZE_WATER, ZE_W, ZE_BANK - ZE_WATER + 8],
      {
        uA: alpha,
        uT: zg.T,
        uWet: backdrop.R.wet > 0.5 ? 1 : 0,
        uSunX: backdrop.R.sunX,
        uSunS: backdrop.R.glint,
        uWater: backdrop.R.water,
        uSunC: backdrop.R.keyC,
      },
      { uC: backdrop.comp.t, uN: zg.noise },
    );
  };

  back(scene, 1);
  if (zg.was) back(zg.was.S, zg.was.a);

  if (game.fw.length) {
    // the fireworks: light in the sky, and a broken line of it on the water
    const sparks = { n: 0 };

    zeFwEach(game, (sparkX, sparkY, alpha, rocket, up) => {
      const hex = parseInt(rocket.c.slice(1), 16);
      const red = ((hex >> 16) & 255) / 255;
      const gr = ((hex >> 8) & 255) / 255;
      const blue = (hex & 255) / 255;
      const intensity = 6 * alpha;

      zgPt(sparks, sparkX, sparkY, up ? 4 : 6, red * intensity, gr * intensity, blue * intensity, 1, 1);

      if (sparkY < ZE_WATER) {
        const my = ZE_WATER + (ZE_WATER - sparkY) * 0.1;

        if (my < ZE_BANK) {
          zgPt(
            sparks,
            sparkX + Math.sin(my * 0.9 + zg.T * 4) * 4,
            my,
            3.4,
            red * intensity * 0.4,
            gr * intensity * 0.4,
            blue * intensity * 0.4,
            1,
            1,
          );
        }
      }
    });

    gl.blendFunc(gl.ONE, gl.ONE);
    zgPoints(sparks, gl.POINTS);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  }

  zgUse(
    zg.P.fog,
    [0, 660, ZE_W, 170],
    { uT: zg.T, uA: R0.fog[3], uY0: 660, uY1: 830, uC: R0.fog.slice(0, 3) },
    { uN: zg.noise },
  ); // mist on the water

  if (dark) {
    zgUse(zg.P.tint, [0, 0, ZE_W, ZE_BANK], {
      uC: [0.06 * 0.4 * dark, 0, 0.01 * 0.4 * dark, 0.4 * dark],
      uFade: [1e4, 2e4],
    });

    zgUse(zg.P.tint, [0, 0, ZE_W, 560], {
      uC: [0.007 * 0.3 * dark, 0, 0.003 * 0.3 * dark, 0.3 * dark],
      uFade: [200, 560],
    });
  } // the dragon's sky, darker still

  // where it will land: a shadow under each thing falling, darker as it nears, and under him in the air
  const bl = (zg.bl ||= new Float32Array(48));
  let bn = 0;

  for (const it of game.items) {
    if (bn >= 16) break;
    if (it.out || it.y > ZE_FLOOR - 4) continue;

    const up = Math.max(0, ZE_FLOOR - it.y);
    const near = 1 - Math.min(1, up / 640);

    bl.set(
      [
        it.x + it.vx * (up / Math.max(60, it.vy)) * 0.5,
        7 + 26 * (1 - near) * 0.4 + near * 12,
        0.1 + near * near * (it.kind === 'veg' ? 0.62 : 0.46),
      ],
      bn * 3,
    );

    bn++;
  }

  if (game.phase !== 'title' && game.y < ZE_FLOOR - 1 && bn < 16) {
    bl.set([game.x, 26, 0.35 * (1 - Math.min(1, (ZE_FLOOR - game.y) / 300))], bn * 3);
    bn++;
  }

  const { lp, lc, n: lightCount } = zgLights(game, rig, calm);

  const lit = {
    uAmbS: rig.amb,
    uAmbG: rig.gnd,
    uKey: zgNorm(R0.key),
    uKeyC: rig.keyC,
    uRim: R0.rim,
    uLp: { v4: lp },
    uLc: { v4: lc },
    uLn: { int: lightCount },
  };

  zgUse(
    zg.P.floor,
    [0, ZE_TERRACE, ZE_W, ZE_H - ZE_TERRACE],
    {
      uT: zg.T,
      uWet: rig.wet > 0.5 ? 1 : 0,
      uRefl: rig.wet,
      uAmbS: rig.amb,
      uKs: R0.shadow,
      uLp: { v4: lp },
      uLc: { v4: lc },
      uLn: { int: lightCount },
      uBl: { v3: bl },
      uBn: { int: bn },
    },
    { uTile: zg.tile, uM: zg.fM.t, uN: zg.noise, uA: zg.fA.t, uH: zg.fH.t },
  );

  {
    const bokeh = { n: 0 };

    for (const bulb of ZE_FESTA) {
      const tw = calm ? 1 : 0.8 + 0.2 * Math.sin(zg.T * 2.2 + bulb.ph);
      const intensity = rig.festa * tw * 2.4;

      zgPt(bokeh, bulb.x, bulb.y, 16, bulb.c[0] * intensity, bulb.c[1] * intensity, bulb.c[2] * intensity, 0.55, 1);

      zgPt(
        bokeh,
        bulb.x,
        bulb.y,
        3.4,
        bulb.c[0] * intensity * 2,
        bulb.c[1] * intensity * 2,
        bulb.c[2] * intensity * 2,
        1,
        1,
      );
    }

    gl.blendFunc(gl.ONE, gl.ONE);
    zgPoints(bokeh, gl.POINTS);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  } // the festa, each bulb a little bokeh

  if (behind) zgUse(zg.P.canvas, ZG_FULL, {}, { uT: zg.fC.t });

  zgUse(
    zg.P.lit,
    [0, 420, ZE_W, 480],
    {
      ...lit,
      uKeep: 0,
      uEdge: 0,
      uBev: 1.1,
      uUseE: 1,
      uSpec: 0.55,
      uEm: rig.win * 0.8 + 0.001,
      uDrop: R0.shadow[2] > 0 ? 0.34 : 0.2,
      uDropD: [-lit.uKey[0] * 12, -lit.uKey[1] * 6 + 4],
    },
    { uA: set.a, uH: set.h.t, uE: set.e, uD: zg.fH.t },
  );

  // the sign's bulbs chase each other
  const bulbs = { n: 0 };
  const phase = calm ? 0 : Math.floor(game.t * (game.dragon ? 16 : 6));

  ZE_BULBS.forEach(([bulbX, bulbY], index) => {
    const intensity = (index + phase) % 3 ? 3.2 : 0.35;

    zgPt(
      bulbs,
      bulbX,
      bulbY,
      4,
      game.dragon ? intensity * 1.1 : intensity,
      game.dragon ? intensity * 0.25 : intensity * 0.85,
      game.dragon ? intensity * 0.3 : intensity * 0.5,
      1,
      0,
    );
  });

  gl.disable(gl.BLEND);
  zgPoints(bulbs, gl.POINTS);
  gl.enable(gl.BLEND);

  zgUse(
    zg.P.lit,
    ZG_FULL,
    { ...lit, uKeep: 0.55, uEdge: 0.42, uBev: 2.2, uUseE: 0, uSpec: 0.1, uEm: 0, uDrop: 0, uDropD: [0, 0] },
    { uA: zg.fA.t, uH: zg.fH.t, uE: zg.fA.t, uD: zg.fH.t },
  ); // what must read keeps most of its own colour, an edge against the blur

  // fire, and the glow of what shines as it falls
  const glows = { n: 0 };

  for (const flame of game.flames) {
    const remaining = 1 - flame.t / flame.life;

    const color =
      remaining > 0.7
        ? [2.6, 1.9, 0.6]
        : remaining > 0.45
          ? [2.5, 1.1, 0.24]
          : remaining > 0.25
            ? [1.9, 0.55, 0.1]
            : [1.4, 0.2, 0.1];

    zgPt(glows, flame.x + flame.s / 2, flame.y + flame.s / 2, flame.s, color[0], color[1], color[2], 1, 0);
  }

  for (const it of game.items) {
    if (it.out) continue;

    const glow =
      it.kind === 'gold' || it.stood > 0
        ? [2.2, 1.6, 0.4, 104]
        : it.kind === 'galo' || (it.special && it.kind === 'meat')
          ? [1.5, 1.05, 0.28, 76]
          : it.kind === 'case'
            ? [0.5, 0.8, 1.5, 76]
            : null;

    if (glow) zgPt(glows, it.x, it.y, glow[3], glow[0], glow[1], glow[2], 0.55, 1);
  }

  for (const mote of zg.dust || []) {
    const dustKind = zg.dustK;
    const near = mote.far > 0.94;

    if (dustKind === 'gold' || dustKind === 'pollen') {
      const color = dustKind === 'gold' ? [2.2, 1.5, 0.55] : [1.7, 1.5, 1.2];
      const alpha = (0.4 + 0.3 * Math.sin(zg.T * 1.3 + mote.ph)) * (near ? 0.05 : 0.8);
      const size = near ? 44 + mote.s * 40 : 1.8 + mote.s * 2.2;

      zgPt(glows, mote.x + px * (near ? 1.5 : 0.4), mote.y, size, color[0], color[1], color[2], alpha, 1);
    } else if (dustKind === 'ember') {
      const alpha = 0.55 + 0.45 * Math.sin(zg.T * 7 + mote.ph);

      zgPt(glows, mote.x, mote.y, 2 + mote.s * 2.2, 3.4 * alpha, 1.2 * alpha, 0.24 * alpha, 1, 1);
    } else if (dustKind === 'fire') {
      const alpha = Math.max(0, Math.sin(zg.T * 0.9 + mote.ph)) ** 2;

      zgPt(glows, mote.x, mote.y, 6 + mote.s * 4, 1.9 * alpha, 2.5 * alpha, 0.6 * alpha, 0.9, 1);
    }
  }

  gl.blendFunc(gl.ONE, gl.ONE);
  zgPoints(glows, gl.POINTS);

  if (ZE_SKIES[iSky].rain) {
    const Rn = { n: 0 };

    for (const drop of ze.drops) {
      zgPt(Rn, drop.x, drop.y, 1, 0.34, 0.4, 0.52, 0.55, 0);
      zgPt(Rn, drop.x - 4, drop.y + 16, 1, 0.34, 0.4, 0.52, 0.15, 0);
    }

    gl.lineWidth(1);
    zgPoints(Rn, gl.LINES);
    const Sp = { n: 0 };

    for (const splash of zg.splash || []) {
      const alpha = 1 - splash.t / 0.18;

      zgPt(Sp, splash.x, splash.y, 2 + splash.t * 26, 0.5 * alpha, 0.55 * alpha, 0.7 * alpha, 0.5, 2);
    }

    zgPoints(Sp, gl.POINTS);
  }

  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.disable(gl.BLEND);
  zgBind(zg.fM);
  zgUse(zg.P.down, ZG_FULL, { uPx: [1 / zg.fM.w, 1 / zg.fM.h] }, { uT: zg.fS.t });
  gl.bindTexture(gl.TEXTURE_2D, zg.fM.t);
  gl.generateMipmap(gl.TEXTURE_2D); // next frame's mirror
  // bloom, on what passes for shining: down from the mirror and back up
  let src = zg.fM;

  zg.fB.forEach((framebuffer, index) => {
    zgBind(framebuffer);
    zgUse(zg.P.down, ZG_FULL, { uPx: [1 / framebuffer.w, 1 / framebuffer.h], uThr: index ? 0 : 1 }, { uT: src.t });
    src = framebuffer;
  });

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE);

  for (let index = zg.fB.length - 2; index >= 0; index--) {
    const framebuffer = zg.fB[index];

    zgBind(framebuffer);
    zgUse(zg.P.up, ZG_FULL, { uPx: [1 / framebuffer.w, 1 / framebuffer.h] }, { uT: zg.fB[index + 1].t });
  }

  gl.disable(gl.BLEND);
  zgBind(null);

  zgUse(
    zg.P.final,
    ZG_FULL,
    {
      uCam: { m3: zgCam(game, calm) },
      uFlash: !calm && game.flash > 0 ? Math.min(0.26, game.flash * 1.6) : 0,
      uFlashC: game.bolt ? [0.65, 0.55, 1] : [1, 1, 1],
      uBloom: rig.bloom,
      uRays: scene.rays ? R0.rays : 0,
      uT: zg.T,
      uVig: 0.3,
      uSat: R0.sat,
      uLift: R0.lift,
      uGain: R0.gain,
      uKo: zeKoK(game),
      uKoP: [game.x, game.y - 90],
    },
    { uS: zg.fS.t, uB: zg.fB[0].t, uR: scene.rays?.t || zg.fB[3].t, uA: zg.fA.t },
  );
}

/** The camera's moves — a combo's push, the vinho's wobble, a shake — as a matrix from the glass to the picture. */
function zgCam(game, calm) {
  let zoom = 1;
  let cx = ZE_W / 2;
  let cy = ZE_H / 2;
  let angle = 0;
  let sx = 0;
  let sy = 0;
  let sy2 = 1;

  if (!calm) {
    if (game.power?.kind === 'vinho') {
      angle = Math.sin(game.t * 1.9) * 0.018;
      zoom = 1.03;
      sy2 = 1 + Math.sin(game.t * 2.7) * 0.012;
    }

    if (game.punch > 0) {
      zoom *= 1 + (0.07 * game.punch) / 0.2;
      cx = game.x;
      cy = game.y - 100;
    }

    if (game.shake > 0) {
      sx = (Math.random() - 0.5) * 24 * game.shake;
      sy = (Math.random() - 0.5) * 24 * game.shake;
    }

    const ko = zeKoK(game);

    if (ko) {
      zoom *= 1 + 0.14 * ko;
      cx = game.x;
      cy = game.y - 90;
    }
  }

  const co = Math.cos(angle) / zoom;
  const si = Math.sin(angle) / zoom;
  const ty = 1 / sy2;

  return new Float32Array([
    co,
    si * ty,
    0,
    -si,
    co * ty,
    0,
    cx - co * cx + si * cy - sx,
    cy - (si * cx + co * cy) * ty - sy,
    1,
  ]);
}

// the harness's hands: a round the bot plays, and what brings a moment on
ze.lab = {
  zeDragon,
  zeRide,
  zeAvo,
  zeDrop,
  zeStep,
  zeBot,
  round: () => zeRound('play'),
  draw: () => zeDraw(),
  demo() {
    const game = zeRound('play');

    Object.assign(game, { demo: true, next: Infinity, lunch: [] });
    ze.g = game;
    zeGo();
    return game;
  },
};
