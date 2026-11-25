  // ---- a frame
  function zgDraw() {
    const c = $('#zeCanvas'), cx = c.getContext('2d'), g = ze.g, k = c.width / ZE_W, calm = zeCalm(), gl = zg.gl, ax = zg.ax;
    zg.k = k; zgSize(c.width, c.height);
    gl.disable(gl.BLEND); zgBind(zg.fA); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    ax.begin(k);
    if (ze.mossad) zeShades(ax, 110 + 39 * 1.35, ZE_FLOOR - 126 * 1.35, 1.35, '#c8ccd2');
    if (g.flex > 0) { const a = Math.min(1, g.flex / .3, (1.4 - g.flex) / .2), w = 70 * zeSz(g); ax.fillStyle = `rgba(255, 246, 210, ${.13 * a})`; ax.beginPath(); ax.moveTo(g.x - 18, 0); ax.lineTo(g.x + 18, 0); ax.lineTo(g.x + w * 1.4, ZE_FLOOR); ax.lineTo(g.x - w * 1.4, ZE_FLOOR); ax.closePath(); ax.fill(); }
    zeActors(ax, g, calm);
    ax.end();
    cx.setTransform(1, 0, 0, 1, 0, 0); cx.clearRect(0, 0, c.width, c.height); cx.setTransform(k, 0, 0, k, 0, 0);
    zeUi(cx, g, k, calm);
    let behind = false;
    if (g.bolt || g.avo) {   // what stands behind Trota's: the bolt, the Avó's house
      behind = true; zgBind(zg.fC); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); ax.begin(k);
      if (g.bolt) for (const [w, col] of [[9, 'rgba(200, 121, 255, .6)'], [3, '#fff6e0']]) { ax.strokeStyle = col; ax.lineWidth = w; ax.beginPath(); ax.moveTo(...g.bolt.pts[0]); for (const pt of g.bolt.pts.slice(1)) ax.lineTo(...pt); ax.stroke(); }
      if (g.avo) zeAvoHouse(ax, g, calm);
      ax.end();
    }
    zgRender(g, calm, behind); zg.frames++;
  }
  /** What lights the round this frame: Trota's lamps, windows and sign, the terrace's lamps, the dragon's fire, MONSTRO's spot, a power-up, what shines as it falls, a car's headlight. */
  function zgLights(g, R, calm) {
    const lp = zg.lp ||= new Float32Array(48), lc = zg.lc ||= new Float32Array(48); let n = 0;
    const add = (x, y, z, r, cr, cg, cb, casts = 0) => { if (n >= 12) return; lp.set([x, y, z, r], n * 4); lc.set([cr, cg, cb, casts], n * 4); n++; };
    const { x: RX, w: RW, top: RT } = ZE_REST, AY = RT + 18, warm = [1.9, 1.25, .55], t = zg.T, fl = calm ? 1 : .94 + .06 * Math.sin(t * 13) * Math.sin(t * 7.3);
    const on = R.lamp * fl, w = R.win * fl;
    for (const lx of [RX + 32, RX + RW - 32]) add(lx, RT + 9, 34, 62, warm[0] * on * .9, warm[1] * on * .9, warm[2] * on * .9);
    for (const wx of [RX + 42, RX + RW - 42]) add(wx, AY + 52, 46, 84, warm[0] * w * .8, warm[1] * w * .8, warm[2] * w * .8);
    const sign = g.dragon ? [1.6, .28, .3] : [1.5, 1.2, .72], so = Math.max(.3, on) * .6; add(ZE_SIGN.x + ZE_SIGN.w / 2, ZE_SIGN.y + 44, 70, 90, sign[0] * so, sign[1] * so, sign[2] * so);
    for (const L of ZE_LAMPS) add(L.x, L.y - 6, -24, 120, warm[0] * on * 1.25, warm[1] * on * 1.25, warm[2] * on * 1.25, on > .3 ? 1 : 0);
    if (g.dragon) { const f = calm ? 1 : .8 + .2 * Math.sin(t * 21) + .1 * Math.sin(t * 37); add(g.x, g.y - 70, -46, 210, 3.2 * f, 1.3 * f, .36 * f); }   // the fire is round him, not in his face
    if (g.flex > 0) { const a = Math.min(1, g.flex / .3, (1.4 - g.flex) / .2); add(g.x, g.y - 250, 40, 180, 2.6 * a, 2.4 * a, 1.9 * a); }
    if (g.power) { const h = parseInt(ZE_POWERS[g.power.kind].c.slice(1), 16); add(g.x, g.y - 120, 30, 110, ((h >> 16) & 255) / 120, ((h >> 8) & 255) / 120, (h & 255) / 120); }
    let glows = 0; for (const it of g.items) { if (glows >= 2) break; if (it.out) continue; if (it.kind === 'gold' || it.kind === 'galo' || it.kind === 'case' || it.kind === 'power' || it.stood > 0 || it.special) { glows++; const cold = it.kind === 'case'; add(it.x, it.y, 30, 90, cold ? .8 : 2, cold ? 1.1 : 1.4, cold ? 2 : .4); } }
    if (g.ride && R.lamp > .3) add(g.x + g.f * 128, ZE_FLOOR - 26, 40, 120, 1.7, 1.6, 1.2);
    return { lp, lc, n };
  }
  /** What floats in each sky: gold dust, fireflies, embers, pollen; the rain's splashes on the tiles. Still under reduced motion. */
  function zgAir(dt, R, calm) {
    const kind = R.dust, D = zg.dust ||= [];
    if (zg.dustK !== kind) { zg.dustK = kind; D.length = 0; const n = { gold: 70, fire: 34, ember: 60, pollen: 60, none: 0 }[kind]; for (let i = 0; i < n; i++) D.push({ x: Math.random() * 760 - 20, y: Math.random() * 860, s: Math.random(), ph: Math.random() * 6.3, far: Math.random() }); }
    if (calm) return;
    for (const p of D) {
      if (kind === 'ember') { p.y -= (24 + p.s * 40) * dt; p.x += Math.sin(zg.T * 1.6 + p.ph) * 14 * dt; if (p.y < 300) { p.y = 840; p.x = Math.random() * 720; } }
      else if (kind === 'fire') { p.x += Math.sin(zg.T * .7 + p.ph) * 12 * dt; p.y += Math.cos(zg.T * .9 + p.ph * 2) * 10 * dt; }
      else { p.y += (3 + p.s * 6) * dt; p.x += (8 + Math.sin(zg.T * .5 + p.ph) * 10) * dt; if (p.y > 860) p.y = 380; if (p.x > 740) p.x = -20; }
    }
    zg.splash ||= [];
    if (R.wet > .5) for (let n = dt * 70 + Math.random() | 0; n > 0; n--) zg.splash.push({ x: Math.random() * 720, y: ZE_TERRACE + Math.random() * 66, t: 0 });
    for (const s of zg.splash) s.t += dt;
    zg.splash = zg.splash.filter(s => s.t < .18);
  }
