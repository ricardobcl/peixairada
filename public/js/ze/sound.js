// ---- the sound: a funk band of oscillators, and what the round does to it
/** The context, made by a press that starts a round (a page may not start sound by itself). */
function zeAudio() {
  if (ze.music) return ze.music;
  let ac;
  try {
    ac = new (window.AudioContext || window.webkitAudioContext)();
  } catch {
    return null;
  }
  const out = ac.createGain(),
    lp = ac.createBiquadFilter(),
    hp = ac.createBiquadFilter(),
    crush = ac.createWaveShaper(),
    noise = ac.createBuffer(1, ac.sampleRate, ac.sampleRate),
    d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  lp.type = 'lowpass';
  lp.frequency.value = 18000;
  lp.Q.value = 0.9; // the A-Class's glass (zeMode), the walkie-talkie's top
  hp.type = 'highpass';
  hp.frequency.value = 20; // …and its bottom (zeRadio)
  out.gain.value = 0.7;
  out.connect(lp).connect(hp).connect(crush).connect(ac.createDynamicsCompressor()).connect(ac.destination);
  const m = (ze.music = { ac, out, lp, hp, crush, noise, step: 0, at: 0, timer: 0, rest: 0, mode: 'walk' });
  zeMode(ze.g.ride?.kind);
  zeRadio();
  return m;
}
function zeGroove(on) {
  const m = on ? zeAudio() : ze.music;
  if (!m) return;
  clearInterval(m.timer);
  clearTimeout(m.rest);
  m.timer = 0;
  if (!on) return;
  m.ac.resume().catch(() => {});
  m.step = 0;
  m.at = m.ac.currentTime + 0.08;
  m.track = 'band';
  m.timer = setInterval(() => zePlan(m), 25);
  zePlan(m);
}
function zeHush() {
  const m = ze.music;
  if (!m) return;
  clearInterval(m.timer);
  clearTimeout(m.rest);
  m.ac.close().catch(() => {});
  ze.music = null;
}
/** What falls within the next 120 ms of the audio clock: the band's — the funk's sixteenths swung, or the vira's
 *  quavers (T) —, a little quicker each level (to a third more), or the dragon's straight at ZE_16D; a timer late by
 *  more starts from now. */
function zePlan(m) {
  const now = m.ac.currentTime,
    fera = m.track === 'dragon',
    band = fera ? 'dragon' : prefs.zeBand,
    quick = 1 + Math.min(10, ze.g.level - 1) * 0.03;
  const len = fera ? ZE_16D : (({ vira: ZE_8V, malhao: ZE_8M }[band] || ZE_16) / quick) * zeMod(m).q;
  if (m.at < now) m.at = now + 0.02;
  while (m.at < now + 0.12) {
    if (ze.mossad && m.step % 24 === 0) {
      zeNoise(m, m.at, 0.09, 0.05);
      zeTone(m, m.at + 0.09, 'sine', 1800, 1800, 0.05, 0.03);
    } // the walkie-talkie's squelch, and its beep
    if (fera) zeFera(m, m.step % 32, m.at);
    else if (band === 'vira') zeVira(m, m.step % 96, m.at, len);
    else if (band === 'malhao') zeMalhao(m, m.step % 64, m.at, len);
    else {
      const s = m.step % 16;
      zeBar(m, s, (m.step >> 4) % 4, m.at + (s % 2 ? len * 0.18 : 0));
    }
    m.at += len;
    m.step++;
  }
}
/** The music hears the round (2026-10-30, the next round): in the Focus the band goes up a tone and quicker, its
 *  ferrinhos doubled and a kick on four; in the A-Class it is a car radio behind glass, three semitones down, slowed
 *  and wobbling like a tape. ZE_MODES' by the car (zeMode), from the next note. */
const ZE_MODES = {
  walk: { q: 1, tr: 0, lp: 18000, hats: 1, wob: 0, kick2: false },
  focus: { q: 1 / 1.12, tr: 2, lp: 18000, hats: 2, wob: 0, kick2: true },
  aclass: { q: 1.28, tr: -3, lp: 700, hats: 1, wob: 22, kick2: false },
};
function zeMode(kind) {
  const m = ze.music;
  if (!m || (kind && ze.g.demo)) return;
  m.mode = ZE_MODES[kind] ? kind : 'walk';
  zeRadio();
}
/** The filters as the round has them: the A-Class's glass, and MOSSAD's walkie-talkie — a narrow band, clipped. */
function zeRadio() {
  const m = ze.music;
  if (!m) return;
  const t = m.ac.currentTime,
    on = ze.mossad;
  m.lp.frequency.setTargetAtTime(Math.min(ZE_MODES[m.mode].lp, on ? 2600 : 18000), t, 0.08);
  m.hp.frequency.setTargetAtTime(on ? 480 : 20, t, 0.08);
  m.crush.curve = on ? Float32Array.from({ length: 1024 }, (_, i) => Math.tanh((i / 511.5 - 1) * 4)) : null;
}
const zeMod = m => ZE_MODES[m.track === 'dragon' ? 'walk' : m.mode] || ZE_MODES.walk;
/** A tape's wobble on an oscillator, by the A-Class (cents, slow). */
const zeWob = (m, o, t) => {
  const w = zeMod(m).wob;
  if (w) o.detune.setValueAtTime(o.detune.value + Math.sin(t * Math.PI * 1.4) * w, t);
};
function zeTrack(t) {
  const m = ze.music;
  if (!m || m.track === t) return;
  m.track = t;
  m.step = 0;
  m.at = m.ac.currentTime + 0.05;
}
function zeFera(m, s, t) {
  // the dragon's: the lead, the bass jumping octaves, a kick on the beat, a snare on two and four
  if (ZE_FLEAD[s]) zeTone(m, t, 'square', zeHz(ZE_FLEAD[s]), zeHz(ZE_FLEAD[s]), ZE_16D * 0.95, 0.05);
  const b = zeHz(ZE_FBASS[s >> 3] + (s % 2 ? 12 : 0));
  zeTone(m, t, 'sawtooth', b, b, ZE_16D * 0.9, 0.09);
  if (s % 4 === 0) zeDrum(m, 'kick', t);
  if (s % 8 === 4) zeDrum(m, 'snare', t, 0.8);
  zeDrum(m, 'hat', t, s % 2 ? 0.3 : 0.6);
}
// the vira's players: the concertina's tune, the viola braguesa's root and the bombo on one, the cavaquinho strummed
// on two and three, the ferrinhos ringing every quaver — as many as his bulk: thin, no cavaquinho; buff, a second
// concertina an octave down and the bombo on the last beat too (2026-10-30, the next round)
function zeVira(m, s, t, q) {
  const bar = Math.floor(s / 6),
    e = s % 6,
    notes = ZE_VIRA[bar],
    ch = ZE_VIRA_CH[bar],
    M = zeMod(m),
    tr = M.tr,
    mass = ze.g.mass;
  if (notes[e] > 0) {
    let n = 1;
    while (e + n < 6 && notes[e + n] === -1) n++;
    zeConcertina(m, t, notes[e] + tr, n * q * 0.95);
    if (mass >= 9) zeConcertina(m, t, notes[e] + tr - 12, n * q * 0.95, 0.03);
  }
  if (e === 0) {
    zeDrum(m, 'kick', t, 0.6);
    zePluck(m, t, ZE_ROOT[ch] + tr, 0.4, 0.16);
  }
  if (e === 3 && (M.kick2 || mass >= 9)) zeDrum(m, 'kick', t, 0.4);
  if ((e === 2 || e === 4) && mass > 3)
    ZE_CHORD[ch].forEach((n, i) => zePluck(m, t + i * 0.012, n + 12 + tr, 0.14, 0.035));
  for (let h = 0; h < M.hats; h++)
    for (const hz of [4200, 6150])
      zeTone(m, t + (h * q) / 2, 'sine', hz, hz, 0.07, (e === 2 || e === 4) && !h ? 0.02 : e % 2 ? 0.007 : 0.012);
}
// the malhão's: the concertina's tune, the viola's root and the bombo on one, its fifth on two, the cavaquinho on the
// off-beats, the ferrinhos on every quaver, louder off the beat
function zeMalhao(m, s, t, q) {
  const bar = s >> 2,
    e = s % 4,
    notes = ZE_MALHAO[bar],
    ch = ZE_MALHAO_CH[bar],
    M = zeMod(m),
    tr = M.tr,
    mass = ze.g.mass;
  if (notes[e] > 0) {
    let n = 1;
    while (e + n < 4 && notes[e + n] === -1) n++;
    zeConcertina(m, t, notes[e] + tr, n * q * 0.92);
    if (mass >= 9) zeConcertina(m, t, notes[e] + tr - 12, n * q * 0.92, 0.03);
  }
  if (e === 0) {
    zeDrum(m, 'kick', t, 0.6);
    zePluck(m, t, ZE_MROOT[ch] + tr, 0.3, 0.16);
  }
  if (e === 2) {
    zeDrum(m, 'kick', t, mass >= 9 || M.kick2 ? 0.45 : 0.3);
    zePluck(m, t, ZE_MROOT[ch] + 7 + tr, 0.3, 0.13);
  }
  if ((e === 1 || e === 3) && mass > 3)
    ZE_MCHORD[ch].forEach((n, i) => zePluck(m, t + i * 0.01, n + 12 + tr, 0.12, 0.035));
  for (let h = 0; h < M.hats; h++)
    for (const hz of [4200, 6150]) zeTone(m, t + (h * q) / 2, 'sine', hz, hz, 0.06, e % 2 && !h ? 0.018 : 0.008);
}
function zeConcertina(m, t, n, d, v = 0.05) {
  // three reeds a little apart, as a concertina's
  const ac = m.ac,
    f = ac.createBiquadFilter(),
    g = ac.createGain();
  f.type = 'lowpass';
  f.frequency.value = 2800;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(v, t + 0.02);
  g.gain.setValueAtTime(v, t + Math.max(0.03, d - 0.04));
  g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  f.connect(g).connect(m.out);
  for (const [type, det] of [
    ['sawtooth', -7],
    ['square', 0],
    ['sawtooth', 7],
  ]) {
    const o = ac.createOscillator();
    o.type = type;
    o.frequency.value = zeHz(n);
    o.detune.value = det;
    zeWob(m, o, t);
    o.connect(f);
    o.start(t);
    o.stop(t + d + 0.02);
  }
}
function zePluck(m, t, n, d, v) {
  // a string plucked: the cavaquinho's, the viola's
  const o = m.ac.createOscillator(),
    g = m.ac.createGain();
  o.type = 'triangle';
  o.frequency.value = zeHz(n);
  zeWob(m, o, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(v, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  o.connect(g).connect(m.out);
  o.start(t);
  o.stop(t + d + 0.02);
}
/** The car's engine while he rides — a low saw through a low-pass, the A-Class's sputtering — or none; zeRev its pitch. */
function zeEngine(kind) {
  const m = ze.music;
  if (!m || (kind && ze.g.demo)) return;
  if (m.engine) {
    for (const o of m.engine.os)
      try {
        o.stop();
      } catch {}
    m.engine = null;
  }
  if (!kind) return;
  const ac = m.ac,
    o = ac.createOscillator(),
    f = ac.createBiquadFilter(),
    g = ac.createGain(),
    os = [o];
  o.type = 'sawtooth';
  o.frequency.value = kind === 'focus' ? 70 : 45;
  f.type = 'lowpass';
  f.frequency.value = kind === 'focus' ? 520 : 320;
  g.gain.value = 0.05;
  if (kind === 'aclass') {
    const lfo = ac.createOscillator(),
      d = ac.createGain();
    lfo.frequency.value = 7;
    d.gain.value = 0.035;
    lfo.connect(d).connect(g.gain);
    lfo.start();
    os.push(lfo);
  }
  o.connect(f).connect(g).connect(m.out);
  o.start();
  m.engine = { o, os, base: o.frequency.value };
}
const zeRev = v => {
  const e = ze.music?.engine;
  if (e) e.o.frequency.setTargetAtTime(e.base + v * 0.12, ze.music.ac.currentTime, 0.08);
};
function zeBar(m, s, bar, t) {
  // the funk: a tone up in the Focus, down in the A-Class; thin, no clav; buff, the horns twice
  const fill = bar === 3 && s >= 12,
    tr = zeMod(m).tr,
    mass = ze.g.mass;
  if (s === 0 || s === 7 || s === 10 || (bar % 2 && s === 13)) zeDrum(m, 'kick', t);
  if (fill) zeDrum(m, 'snare', t, 0.45 + (s - 12) * 0.18);
  else if (s === 4 || s === 12) zeDrum(m, 'snare', t);
  else if (s === 9 || s === 15) zeDrum(m, 'snare', t, 0.16); // ghosts
  if (!fill) zeDrum(m, s === 14 && bar % 2 ? 'open' : 'hat', t, s % 4 === 2 ? 0.9 : s % 2 ? 0.35 : 0.6);
  const b = ZE_BASS[bar % 2][s];
  if (b) zeBass(m, t, b[0] + tr, b[1], b[2]);
  if (ZE_CLAV[s] && !fill && mass > 3) zeClav(m, t, ZE_CLAV[s], tr);
  if ((bar === 2 || (bar === 0 && mass >= 9)) && ZE_HORN[s]) zeHorn(m, t, ZE_HORN[s][0] + tr, ZE_HORN[s][1]);
}
function zeDrum(m, kind, t, v = 1) {
  const ac = m.ac,
    g = ac.createGain();
  g.connect(m.out);
  if (kind === 'kick') {
    const o = ac.createOscillator();
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.connect(g);
    o.start(t);
    o.stop(t + 0.32);
    return;
  }
  const n = ac.createBufferSource(),
    f = ac.createBiquadFilter(),
    len = kind === 'snare' ? 0.16 : kind === 'open' ? 0.24 : 0.04;
  n.buffer = m.noise;
  f.type = kind === 'snare' ? 'bandpass' : 'highpass';
  f.frequency.value = kind === 'snare' ? 2200 : 7500;
  f.Q.value = kind === 'snare' ? 0.8 : 0.7;
  g.gain.setValueAtTime((kind === 'snare' ? 0.55 : 0.16) * v, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + len);
  n.connect(f).connect(g);
  n.start(t, Math.random() * 0.7);
  n.stop(t + len + 0.02);
  if (kind === 'snare' && v > 0.3) zeTone(m, t, 'triangle', 220, 140, 0.09, 0.3 * v); // the drum's body under the rattle
}
function zeTone(m, t, type, f0, f1, d, v) {
  const o = m.ac.createOscillator(),
    g = m.ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(f1, t + d);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(v, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  o.connect(g).connect(m.out);
  o.start(t);
  o.stop(t + d + 0.02);
}
function zeBass(m, t, n, len, pop) {
  const ac = m.ac,
    d = len * ZE_16 * 0.9,
    f = ac.createBiquadFilter(),
    g = ac.createGain();
  f.type = 'lowpass';
  f.Q.value = 7;
  f.frequency.setValueAtTime(pop ? 3200 : 1700, t);
  f.frequency.exponentialRampToValueAtTime(pop ? 600 : 260, t + 0.12); // the slap, then the thumb's thud
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(pop ? 0.3 : 0.4, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.15, t + d * 0.7);
  g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  f.connect(g).connect(m.out);
  for (const type of ['sawtooth', 'sine']) {
    const o = ac.createOscillator();
    o.type = type;
    o.frequency.value = zeHz(n);
    o.connect(f);
    o.start(t);
    o.stop(t + d + 0.02);
  }
}
function zeClav(m, t, v, tr = 0) {
  // E7#9, Hendrix's chord, the wah opening on each stab
  const ac = m.ac,
    f = ac.createBiquadFilter(),
    g = ac.createGain();
  f.type = 'bandpass';
  f.Q.value = 3;
  f.frequency.setValueAtTime(700, t);
  f.frequency.exponentialRampToValueAtTime(2400, t + 0.08);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.06 * v, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
  f.connect(g).connect(m.out);
  for (const n of [52, 56, 62, 67]) {
    const o = ac.createOscillator();
    o.type = 'square';
    o.frequency.value = zeHz(n + tr);
    o.connect(f);
    o.start(t);
    o.stop(t + 0.13);
  }
}
function zeHorn(m, t, n, len) {
  const ac = m.ac,
    d = len * ZE_16,
    f = ac.createBiquadFilter(),
    g = ac.createGain();
  f.type = 'lowpass';
  f.frequency.value = 2200;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.07, t + 0.025);
  g.gain.setValueAtTime(0.07, t + d * 0.7);
  g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  f.connect(g).connect(m.out);
  for (const det of [-8, 8]) {
    const o = ac.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = zeHz(n);
    o.detune.value = det;
    o.connect(f);
    o.start(t);
    o.stop(t + d + 0.02);
  }
}
function zeNoise(m, t, d, v) {
  const n = m.ac.createBufferSource(),
    g = m.ac.createGain();
  n.buffer = m.noise;
  g.gain.setValueAtTime(v, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + d);
  n.connect(g).connect(m.out);
  n.start(t);
  n.stop(t + d + 0.02);
}
function zeSfx(kind) {
  const m = ze.music;
  if (!m || m.ac.state === 'closed' || ze.g.demo) return; // the title's demo plays in silence
  const ac = m.ac,
    t = ac.currentTime + 0.005;
  if (kind === 'chomp') {
    zeTone(m, t, 'square', 520, 180, 0.07, 0.12);
    zeTone(m, t + 0.09, 'square', 480, 160, 0.07, 0.1);
  } else if (kind === 'jump') zeTone(m, t, 'square', 300, 620, 0.1, 0.06);
  else if (kind === 'flap') zeNoise(m, t, 0.08, 0.08);
  else if (kind === 'peck') zeTone(m, t, 'square', 900, 1400, 0.04, 0.06);
  else if (kind === 'boing') zeTone(m, t, 'triangle', 180, 520, 0.12, 0.07);
  else if (kind === 'smash') {
    zeTone(m, t, 'sine', 320, 70, 0.16, 0.5);
    zeDrum(m, 'snare', t, 0.7);
  } else if (kind === 'bleh') zeTone(m, t, 'sawtooth', 260, 90, 0.38, 0.16);
  else if (kind === 'level')
    [523, 659, 784, 1047].forEach((hz, i) => zeTone(m, t + i * 0.08, 'square', hz, hz, 0.11, 0.08));
  else if (kind === 'combo') [784, 988, 1175].forEach((hz, i) => zeTone(m, t + i * 0.06, 'square', hz, hz, 0.08, 0.08));
  else if (kind === 'chompBig') {
    zeTone(m, t, 'sawtooth', 196, 150, 0.1, 0.14);
    zeTone(m, t + 0.05, 'sawtooth', 294, 220, 0.1, 0.12);
  } else if (kind === 'transform') {
    // the dragon wakes: a rising roar, a rush, a chord
    zeTone(m, t, 'sawtooth', 90, 900, 1.1, 0.16);
    zeNoise(m, t, 1, 0.1);
    [220, 277, 330, 440].forEach((hz, i) => zeTone(m, t + 1.05 + i * 0.03, 'square', hz, hz, 0.6, 0.07));
  } else if (kind === 'detransform') zeTone(m, t, 'sawtooth', 800, 110, 0.7, 0.12);
  else if (kind === 'boom')
    for (const d of [0.3, 0.58, 0.86]) {
      zeTone(m, t + d, 'sine', 120, 42, 0.3, 0.2);
      zeNoise(m, t + d, 0.16, 0.06);
    }
  else if (kind === 'thunder') {
    zeNoise(m, t, 0.7, 0.18);
    zeTone(m, t, 'sine', 70, 30, 0.5, 0.3);
  } else if (kind === 'whoosh') {
    const n = ac.createBufferSource(),
      f = ac.createBiquadFilter(),
      g = ac.createGain();
    n.buffer = m.noise;
    f.type = 'bandpass';
    f.Q.value = 1.5;
    f.frequency.setValueAtTime(500, t);
    f.frequency.exponentialRampToValueAtTime(3500, t + 0.16);
    g.gain.setValueAtTime(0.25, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    n.connect(f).connect(g).connect(m.out);
    n.start(t, Math.random() * 0.7);
    n.stop(t + 0.2);
  } else if (kind === 'galo') {
    // a crow: cocorocó
    const o = ac.createOscillator(),
      f = ac.createBiquadFilter(),
      g = ac.createGain();
    o.type = 'sawtooth';
    f.type = 'bandpass';
    f.frequency.value = 1500;
    f.Q.value = 2;
    for (const [dt, hz] of [
      [0, 700],
      [0.08, 1250],
      [0.18, 1050],
      [0.3, 1350],
      [0.62, 800],
    ])
      o.frequency.linearRampToValueAtTime(hz, t + dt);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.2, t + 0.03);
    g.gain.setValueAtTime(0.2, t + 0.5);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.66);
    o.connect(f).connect(g).connect(m.out);
    o.start(t);
    o.stop(t + 0.7);
  } else if (kind === 'focus') {
    // beep beep, and a rev
    for (const d of [0, 0.18]) for (const hz of [440, 554]) zeTone(m, t + d, 'square', hz, hz, 0.12, 0.05);
    zeTone(m, t + 0.36, 'sawtooth', 60, 220, 0.5, 0.12);
  } else if (kind === 'aclass') {
    zeTone(m, t, 'square', 392, 330, 0.6, 0.07);
    zeNoise(m, t + 0.1, 0.3, 0.08);
    zeNoise(m, t + 0.5, 0.2, 0.06);
  } // a sad meep, a cough
  else if (kind === 'beep') for (const hz of [440, 554]) zeTone(m, t, 'square', hz, hz, 0.14, 0.05);
  else if (kind === 'meep') zeTone(m, t, 'square', 330, 300, 0.28, 0.05);
  else if (kind === 'monstro')
    [40, 47, 52].forEach((n, i) => {
      zeTone(m, t + i * 0.02, 'sawtooth', zeHz(n), zeHz(n), 0.9, 0.09);
      zeTone(m, t + 0.45, 'square', zeHz(n + 12), zeHz(n + 12), 0.5, 0.04);
    }); // a power chord, twice
  else if (kind === 'spy')
    [64, 67, 71, 75, 76].forEach((n, i) =>
      zeTone(m, t + i * 0.09, 'sawtooth', zeHz(n), zeHz(n), i === 4 ? 0.7 : 0.1, 0.07),
    ); // E minor, its major seventh: a spy's chord
  else if (kind === 'over') {
    // the trombone that says it
    [392, 370, 349].forEach((hz, i) => zeHorn(m, t + i * 0.36, 12 * Math.log2(hz / 440) + 69 - 12, 0.34 / ZE_16));
    const o = ac.createOscillator(),
      lfo = ac.createOscillator(),
      depth = ac.createGain(),
      g = ac.createGain();
    o.type = 'sawtooth';
    o.frequency.value = 165;
    lfo.frequency.value = 6;
    depth.gain.value = 5;
    lfo.connect(depth).connect(o.frequency);
    g.gain.setValueAtTime(0.0001, t + 1.08);
    g.gain.exponentialRampToValueAtTime(0.12, t + 1.12);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
    o.connect(g).connect(m.out);
    for (const x of [o, lfo]) {
      x.start(t + 1.08);
      x.stop(t + 2.25);
    }
  }
}

// his two running frames for All caught up (T4, ZERO_HTML), drawn once as CSS images, and a click on him there opens his game
for (const [n, pose] of [
  ['--ze1', 'run1'],
  ['--ze2', 'run2'],
])
  document.documentElement.style.setProperty(n, `url(${zeBuild(6, pose, { flip: true }).toDataURL()})`);
$('#slist').addEventListener('click', e => {
  if (e.target.closest('.zewalk i')) zeOpen();
});
