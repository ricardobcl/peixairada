// ---- the room: the band in the air of each sky, its rain, its thunder. All of it on the game's own context, closed with it.
const ZE_ROOM = [1.5, 2.3, 1.1, 0.8, 1.9];

function zeRoom(g) {
  const m = ze.music;

  if (!m || g.demo) return;
  const ac = m.ac;

  if (ac.state === 'closed') return;

  if (!m.room) {
    const conv = ac.createConvolver();
    const wet = ac.createGain();
    const rain = ac.createBufferSource();
    const rainF = ac.createBiquadFilter();
    const rainG = ac.createGain();

    wet.gain.value = 0;
    m.crush.connect(conv);
    conv.connect(wet);
    wet.connect(ac.destination);
    rain.buffer = m.noise;
    rain.loop = true;
    rainF.type = 'highpass';
    rainF.frequency.value = 1400;
    rainG.gain.value = 0;
    rain.connect(rainF);
    rainF.connect(rainG);
    rainG.connect(ac.destination);
    rain.start();
    m.room = { conv, wet, rainG, sky: -1, bolt: null };
  }

  const R = m.room;
  const sky = zeSkyOf(g);

  if (R.sky !== sky) {
    // a room of its own: a burst of noise dying away, as long as the sky is wide
    R.sky = sky;

    const len = Math.round(ac.sampleRate * ZE_ROOM[sky]);
    const b = ac.createBuffer(2, len, ac.sampleRate);

    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);

      for (let i = 0; i < len; i++) {
        const t = i / len;

        d[i] = (Math.random() * 2 - 1) * (1 - t) ** 3.2 * (i < 400 ? i / 400 : 1);
      }
    }

    R.conv.buffer = b;
  }

  const wet = g.phase === 'play' || g.phase === 'over' ? (sky === 3 ? 0.1 : 0.2) : 0;
  const rain = g.phase === 'play' && ZE_SKIES[sky].rain ? 0.022 : 0; // the rain's room is a small one

  if (R.wetV !== wet) {
    R.wetV = wet;
    R.wet.gain.setTargetAtTime(wet, ac.currentTime, 0.08);
  }

  if (R.rainV !== rain) {
    R.rainV = rain;
    R.rainG.gain.setTargetAtTime(rain, ac.currentTime, 0.3);
  }

  if (g.bolt && g.bolt !== R.bolt) {
    // thunder, a moment after the bolt
    const s = ac.createBufferSource();
    const f = ac.createBiquadFilter();
    const v = ac.createGain();
    const t = ac.currentTime + 0.12;

    s.buffer = m.noise;
    s.loop = true;
    f.type = 'lowpass';
    f.frequency.value = 170;
    v.gain.setValueAtTime(0, t);
    v.gain.linearRampToValueAtTime(0.5, t + 0.05);
    v.gain.exponentialRampToValueAtTime(0.001, t + 1.6);
    s.connect(f);
    f.connect(v);
    v.connect(ac.destination);
    s.start(t);
    s.stop(t + 1.7);
  }

  R.bolt = g.bolt;
}

function zgPoints(L, mode) {
  const gl = zg.gl;

  if (!L.n) return;
  gl.bindVertexArray(zg.ptVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, zg.ptBuf);
  gl.bufferData(gl.ARRAY_BUFFER, zg.pts.subarray(0, L.n * 8), gl.DYNAMIC_DRAW);
  gl.useProgram(zg.Pt.p);
  gl.uniform1f(gl.getUniformLocation(zg.Pt.p, 'uK'), gl.canvas.width / ZE_W);
  gl.drawArrays(mode, 0, L.n);
  gl.bindVertexArray(zg.vao);
}

const zgPt = (L, x, y, size, r, g, b, a, soft) => {
  const i = L.n++ * 8;
  const P = zg.pts;

  P[i] = x;
  P[i + 1] = y;
  P[i + 2] = r;
  P[i + 3] = g;
  P[i + 4] = b;
  P[i + 5] = a;
  P[i + 6] = size;
  P[i + 7] = soft;
};

const zgNorm = v => {
  const l = Math.hypot(...v) || 1;

  return [v[0] / l, v[1] / l, v[2] / l];
};

function zgRender(g, calm, behind) {
  const gl = zg.gl;
  const dt = ze.dt || 0;
  const iSky = zeSkyOf(g);
  const S = zgScene(iSky);
  const set = zgSet(zg.k);
  const px = (ZE_W / 2 - g.x) * 0.05;

  if (!zg.baked) zgBakeAhead();
  if (g.freeze <= 0 && !calm) zg.T += dt;

  if (zg.sky !== iSky) {
    if (zg.sky >= 0) zg.was = { S: zg.scenes.get(zg.sky), a: 1 };
    zg.sky = iSky;
  }

  if (zg.was && (zg.was.a -= dt / 1.4) <= 0) zg.was = null;

  const dark = zeDark(g);
  const R0 = S.R;
  const Rw = zg.was?.S.R;
  const mixv = (a, b) => (zg.was ? a.map((v, i) => v + (b[i] - v) * zg.was.a) : a);
  const mixn = (a, b) => (zg.was ? a + (b - a) * zg.was.a : a);

  const R = {
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
    R.amb = R.amb.map((v, i) => v * (1 - dark * [0.25, 0.62, 0.6][i]));
    R.gnd = R.gnd.map((v, i) => v * (1 - dark * [0.2, 0.65, 0.6][i]));
    R.lamp = Math.max(R.lamp, 0.8 * dark);
    R.win = Math.max(R.win, 0.8 * dark);
  }

  if (g.flash > 0 && !calm) {
    const f = Math.min(1, g.flash * 5);

    R.amb = R.amb.map((v, i) => v + f * [0.9, 0.9, 1.2][i]);
  }

  zgAir(dt, R, calm);
  gl.disable(gl.BLEND);
  zgBind(zg.fH);
  zgUse(zg.P.alpha, ZG_FULL, {}, { uT: zg.fA.t }); // how high what moves stands, for its light
  zgBind(zg.fS);
  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

  const back = (T, a) => {
    zgUse(zg.P.layer, [0, 0, ZE_W, ZE_BANK], { uA: a, uShift: [0, 0] }, { uT: T.sky.t });

    zgUse(
      zg.P.clouds,
      [0, 0, ZE_W, ZE_WATER],
      {
        uT: zg.T,
        uCover: T.R.cloud[0],
        uDark: T.R.cloud[1],
        uLit: T.R.cloud[2],
        uA: T.R.cloud[3] * a,
        uTop: T.R.cloud[4],
        uSunP: T.sun,
      },
      { uN: zg.noise },
    );

    zgUse(zg.P.layer, [0, 520, ZE_W, ZE_WATER + 4 - 520], { uA: a, uShift: [px * 0.22, 0] }, { uT: T.hills.t });
    zgUse(zg.P.layer, [0, 520, ZE_W, ZE_WATER + 2 - 520], { uA: a, uShift: [px * 0.5, 0] }, { uT: T.town.t });
    zgUse(zg.P.layer, [0, 680, ZE_W, ZE_WATER + 2 - 680], { uA: a, uShift: [px * 0.7, 0] }, { uT: T.bridge.t });

    zgUse(
      zg.P.river,
      [0, ZE_WATER, ZE_W, ZE_BANK - ZE_WATER + 8],
      {
        uA: a,
        uT: zg.T,
        uWet: T.R.wet > 0.5 ? 1 : 0,
        uSunX: T.R.sunX,
        uSunS: T.R.glint,
        uWater: T.R.water,
        uSunC: T.R.keyC,
      },
      { uC: T.comp.t, uN: zg.noise },
    );
  };

  back(S, 1);
  if (zg.was) back(zg.was.S, zg.was.a);

  if (g.fw.length) {
    // the fireworks: light in the sky, and a broken line of it on the water
    const L = { n: 0 };

    zeFwEach(g, (x, y, a, f, up) => {
      const h = parseInt(f.c.slice(1), 16);
      const r = ((h >> 16) & 255) / 255;
      const gr = ((h >> 8) & 255) / 255;
      const b = (h & 255) / 255;
      const v = 6 * a;

      zgPt(L, x, y, up ? 4 : 6, r * v, gr * v, b * v, 1, 1);

      if (y < ZE_WATER) {
        const my = ZE_WATER + (ZE_WATER - y) * 0.1;

        if (my < ZE_BANK) {
          zgPt(L, x + Math.sin(my * 0.9 + zg.T * 4) * 4, my, 3.4, r * v * 0.4, gr * v * 0.4, b * v * 0.4, 1, 1);
        }
      }
    });

    gl.blendFunc(gl.ONE, gl.ONE);
    zgPoints(L, gl.POINTS);
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

  for (const it of g.items) {
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

  if (g.phase !== 'title' && g.y < ZE_FLOOR - 1 && bn < 16) {
    bl.set([g.x, 26, 0.35 * (1 - Math.min(1, (ZE_FLOOR - g.y) / 300))], bn * 3);
    bn++;
  }

  const { lp, lc, n } = zgLights(g, R, calm);

  const lit = {
    uAmbS: R.amb,
    uAmbG: R.gnd,
    uKey: zgNorm(R0.key),
    uKeyC: R.keyC,
    uRim: R0.rim,
    uLp: { v4: lp },
    uLc: { v4: lc },
    uLn: { int: n },
  };

  zgUse(
    zg.P.floor,
    [0, ZE_TERRACE, ZE_W, ZE_H - ZE_TERRACE],
    {
      uT: zg.T,
      uWet: R.wet > 0.5 ? 1 : 0,
      uRefl: R.wet,
      uAmbS: R.amb,
      uKs: R0.shadow,
      uLp: { v4: lp },
      uLc: { v4: lc },
      uLn: { int: n },
      uBl: { v3: bl },
      uBn: { int: bn },
    },
    { uTile: zg.tile, uM: zg.fM.t, uN: zg.noise, uA: zg.fA.t, uH: zg.fH.t },
  );

  {
    const L = { n: 0 };

    for (const b of ZE_FESTA) {
      const tw = calm ? 1 : 0.8 + 0.2 * Math.sin(zg.T * 2.2 + b.ph);
      const v = R.festa * tw * 2.4;

      zgPt(L, b.x, b.y, 16, b.c[0] * v, b.c[1] * v, b.c[2] * v, 0.55, 1);
      zgPt(L, b.x, b.y, 3.4, b.c[0] * v * 2, b.c[1] * v * 2, b.c[2] * v * 2, 1, 1);
    }

    gl.blendFunc(gl.ONE, gl.ONE);
    zgPoints(L, gl.POINTS);
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
      uEm: R.win * 0.8 + 0.001,
      uDrop: R0.shadow[2] > 0 ? 0.34 : 0.2,
      uDropD: [-lit.uKey[0] * 12, -lit.uKey[1] * 6 + 4],
    },
    { uA: set.a, uH: set.h.t, uE: set.e, uD: zg.fH.t },
  );

  // the sign's bulbs chase each other
  const B = { n: 0 };
  const phase = calm ? 0 : Math.floor(g.t * (g.dragon ? 16 : 6));

  ZE_BULBS.forEach(([x, y], i) => {
    const v = (i + phase) % 3 ? 3.2 : 0.35;

    zgPt(B, x, y, 4, g.dragon ? v * 1.1 : v, g.dragon ? v * 0.25 : v * 0.85, g.dragon ? v * 0.3 : v * 0.5, 1, 0);
  });

  gl.disable(gl.BLEND);
  zgPoints(B, gl.POINTS);
  gl.enable(gl.BLEND);

  zgUse(
    zg.P.lit,
    ZG_FULL,
    { ...lit, uKeep: 0.55, uEdge: 0.42, uBev: 2.2, uUseE: 0, uSpec: 0.1, uEm: 0, uDrop: 0, uDropD: [0, 0] },
    { uA: zg.fA.t, uH: zg.fH.t, uE: zg.fA.t, uD: zg.fH.t },
  ); // what must read keeps most of its own colour, an edge against the blur

  // fire, and the glow of what shines as it falls
  const A = { n: 0 };

  for (const f of g.flames) {
    const t = 1 - f.t / f.life;
    const h = t > 0.7 ? [2.6, 1.9, 0.6] : t > 0.45 ? [2.5, 1.1, 0.24] : t > 0.25 ? [1.9, 0.55, 0.1] : [1.4, 0.2, 0.1];

    zgPt(A, f.x + f.s / 2, f.y + f.s / 2, f.s, h[0], h[1], h[2], 1, 0);
  }

  for (const it of g.items) {
    if (it.out) continue;

    const m =
      it.kind === 'gold' || it.stood > 0
        ? [2.2, 1.6, 0.4, 104]
        : it.kind === 'galo' || (it.special && it.kind === 'meat')
          ? [1.5, 1.05, 0.28, 76]
          : it.kind === 'case'
            ? [0.5, 0.8, 1.5, 76]
            : null;

    if (m) zgPt(A, it.x, it.y, m[3], m[0], m[1], m[2], 0.55, 1);
  }

  for (const p of zg.dust || []) {
    const K = zg.dustK;
    const near = p.far > 0.94;

    if (K === 'gold' || K === 'pollen') {
      const v = K === 'gold' ? [2.2, 1.5, 0.55] : [1.7, 1.5, 1.2];
      const a = (0.4 + 0.3 * Math.sin(zg.T * 1.3 + p.ph)) * (near ? 0.05 : 0.8);
      const s = near ? 44 + p.s * 40 : 1.8 + p.s * 2.2;

      zgPt(A, p.x + px * (near ? 1.5 : 0.4), p.y, s, v[0], v[1], v[2], a, 1);
    } else if (K === 'ember') {
      const a = 0.55 + 0.45 * Math.sin(zg.T * 7 + p.ph);

      zgPt(A, p.x, p.y, 2 + p.s * 2.2, 3.4 * a, 1.2 * a, 0.24 * a, 1, 1);
    } else if (K === 'fire') {
      const a = Math.max(0, Math.sin(zg.T * 0.9 + p.ph)) ** 2;

      zgPt(A, p.x, p.y, 6 + p.s * 4, 1.9 * a, 2.5 * a, 0.6 * a, 0.9, 1);
    }
  }

  gl.blendFunc(gl.ONE, gl.ONE);
  zgPoints(A, gl.POINTS);

  if (ZE_SKIES[iSky].rain) {
    const Rn = { n: 0 };

    for (const d of ze.drops) {
      zgPt(Rn, d.x, d.y, 1, 0.34, 0.4, 0.52, 0.55, 0);
      zgPt(Rn, d.x - 4, d.y + 16, 1, 0.34, 0.4, 0.52, 0.15, 0);
    }

    gl.lineWidth(1);
    zgPoints(Rn, gl.LINES);
    const Sp = { n: 0 };

    for (const s of zg.splash || []) {
      const a = 1 - s.t / 0.18;

      zgPt(Sp, s.x, s.y, 2 + s.t * 26, 0.5 * a, 0.55 * a, 0.7 * a, 0.5, 2);
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

  zg.fB.forEach((b, i) => {
    zgBind(b);
    zgUse(zg.P.down, ZG_FULL, { uPx: [1 / b.w, 1 / b.h], uThr: i ? 0 : 1 }, { uT: src.t });
    src = b;
  });

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE);

  for (let i = zg.fB.length - 2; i >= 0; i--) {
    const b = zg.fB[i];

    zgBind(b);
    zgUse(zg.P.up, ZG_FULL, { uPx: [1 / b.w, 1 / b.h] }, { uT: zg.fB[i + 1].t });
  }

  gl.disable(gl.BLEND);
  zgBind(null);

  zgUse(
    zg.P.final,
    ZG_FULL,
    {
      uCam: { m3: zgCam(g, calm) },
      uFlash: !calm && g.flash > 0 ? Math.min(0.26, g.flash * 1.6) : 0,
      uFlashC: g.bolt ? [0.65, 0.55, 1] : [1, 1, 1],
      uBloom: R.bloom,
      uRays: S.rays ? R0.rays : 0,
      uT: zg.T,
      uVig: 0.3,
      uSat: R0.sat,
      uLift: R0.lift,
      uGain: R0.gain,
      uKo: zeKoK(g),
      uKoP: [g.x, g.y - 90],
    },
    { uS: zg.fS.t, uB: zg.fB[0].t, uR: S.rays?.t || zg.fB[3].t, uA: zg.fA.t },
  );
}

/** The camera's moves — a combo's push, the vinho's wobble, a shake — as a matrix from the glass to the picture. */
function zgCam(g, calm) {
  let z = 1;
  let cx = ZE_W / 2;
  let cy = ZE_H / 2;
  let a = 0;
  let sx = 0;
  let sy = 0;
  let sy2 = 1;

  if (!calm) {
    if (g.power?.kind === 'vinho') {
      a = Math.sin(g.t * 1.9) * 0.018;
      z = 1.03;
      sy2 = 1 + Math.sin(g.t * 2.7) * 0.012;
    }

    if (g.punch > 0) {
      z *= 1 + (0.07 * g.punch) / 0.2;
      cx = g.x;
      cy = g.y - 100;
    }

    if (g.shake > 0) {
      sx = (Math.random() - 0.5) * 24 * g.shake;
      sy = (Math.random() - 0.5) * 24 * g.shake;
    }

    const ko = zeKoK(g);

    if (ko) {
      z *= 1 + 0.14 * ko;
      cx = g.x;
      cy = g.y - 90;
    }
  }

  const co = Math.cos(a) / z;
  const si = Math.sin(a) / z;
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
    const g = zeRound('play');

    Object.assign(g, { demo: true, next: Infinity, lunch: [] });
    ze.g = g;
    zeGo();
    return g;
  },
};
