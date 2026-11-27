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

  const out = ac.createGain();
  const lp = ac.createBiquadFilter();
  const hp = ac.createBiquadFilter();
  const crush = ac.createWaveShaper();
  const noise = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
  const samples = noise.getChannelData(0);

  for (let index = 0; index < samples.length; index++) samples[index] = Math.random() * 2 - 1;
  lp.type = 'lowpass';
  lp.frequency.value = 18000;
  lp.Q.value = 0.9; // the A-Class's glass (zeMode), the walkie-talkie's top
  hp.type = 'highpass';
  hp.frequency.value = 20; // …and its bottom (zeRadio)
  out.gain.value = 0.7;
  out.connect(lp).connect(hp).connect(crush).connect(ac.createDynamicsCompressor()).connect(ac.destination);
  const music = (ze.music = { ac, out, lp, hp, crush, noise, step: 0, at: 0, timer: 0, rest: 0, mode: 'walk' });

  zeMode(ze.g.ride?.kind);
  zeRadio();
  return music;
}

function zeGroove(on) {
  const music = on ? zeAudio() : ze.music;

  if (!music) return;
  clearInterval(music.timer);
  clearTimeout(music.rest);
  music.timer = 0;
  if (!on) return;
  music.ac.resume().catch(() => {});
  music.step = 0;
  music.at = music.ac.currentTime + 0.08;
  music.track = 'band';
  music.timer = setInterval(() => zePlan(music), 25);
  zePlan(music);
}

function zeHush() {
  const music = ze.music;

  if (!music) return;
  clearInterval(music.timer);
  clearTimeout(music.rest);
  music.ac.close().catch(() => {});
  ze.music = null;
}

/** What falls within the next 120 ms of the audio clock: the band's — the funk's sixteenths swung, or the vira's
 *  quavers (T) —, a little quicker each level (to a third more), or the dragon's straight at ZE_16D; a timer late by
 *  more starts from now. */
function zePlan(music) {
  const now = music.ac.currentTime;
  const fera = music.track === 'dragon';
  const band = fera ? 'dragon' : prefs.zeBand;
  const quick = 1 + Math.min(10, ze.g.level - 1) * 0.03;

  const len = fera ? ZE_16D : (({ vira: ZE_8V, malhao: ZE_8M }[band] || ZE_16) / quick) * zeMod(music).q;

  if (music.at < now) music.at = now + 0.02;

  while (music.at < now + 0.12) {
    if (ze.mossad && music.step % 24 === 0) {
      zeNoise(music, music.at, 0.09, 0.05);
      zeTone(music, music.at + 0.09, 'sine', 1800, 1800, 0.05, 0.03);
    } // the walkie-talkie's squelch, and its beep

    if (fera) zeFera(music, music.step % 32, music.at);
    else if (band === 'vira') zeVira(music, music.step % 96, music.at, len);
    else if (band === 'malhao') zeMalhao(music, music.step % 64, music.at, len);
    else {
      const step = music.step % 16;

      zeBar(music, step, (music.step >> 4) % 4, music.at + (step % 2 ? len * 0.18 : 0));
    }

    music.at += len;
    music.step++;
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
  const music = ze.music;

  if (!music || (kind && ze.g.demo)) return;
  music.mode = ZE_MODES[kind] ? kind : 'walk';
  zeRadio();
}

/** The filters as the round has them: the A-Class's glass, and MOSSAD's walkie-talkie — a narrow band, clipped. */
function zeRadio() {
  const music = ze.music;

  if (!music) return;

  const now = music.ac.currentTime;
  const on = ze.mossad;

  music.lp.frequency.setTargetAtTime(Math.min(ZE_MODES[music.mode].lp, on ? 2600 : 18000), now, 0.08);
  music.hp.frequency.setTargetAtTime(on ? 480 : 20, now, 0.08);
  music.crush.curve = on ? Float32Array.from({ length: 1024 }, (_, index) => Math.tanh((index / 511.5 - 1) * 4)) : null;
}

const zeMod = music => ZE_MODES[music.track === 'dragon' ? 'walk' : music.mode] || ZE_MODES.walk;

/** A tape's wobble on an oscillator, by the A-Class (cents, slow). */
const zeWob = (music, oscillator, at) => {
  const wobble = zeMod(music).wob;

  if (wobble) oscillator.detune.setValueAtTime(oscillator.detune.value + Math.sin(at * Math.PI * 1.4) * wobble, at);
};

function zeTrack(track) {
  const music = ze.music;

  if (!music || music.track === track) return;
  music.track = track;
  music.step = 0;
  music.at = music.ac.currentTime + 0.05;
}

function zeFera(music, step, at) {
  // the dragon's: the lead, the bass jumping octaves, a kick on the beat, a snare on two and four
  if (ZE_FLEAD[step]) zeTone(music, at, 'square', zeHz(ZE_FLEAD[step]), zeHz(ZE_FLEAD[step]), ZE_16D * 0.95, 0.05);
  const bassHz = zeHz(ZE_FBASS[step >> 3] + (step % 2 ? 12 : 0));

  zeTone(music, at, 'sawtooth', bassHz, bassHz, ZE_16D * 0.9, 0.09);
  if (step % 4 === 0) zeDrum(music, 'kick', at);
  if (step % 8 === 4) zeDrum(music, 'snare', at, 0.8);
  zeDrum(music, 'hat', at, step % 2 ? 0.3 : 0.6);
}

// the vira's players: the concertina's tune, the viola braguesa's root and the bombo on one, the cavaquinho strummed
// on two and three, the ferrinhos ringing every quaver — as many as his bulk: thin, no cavaquinho; buff, a second
// concertina an octave down and the bombo on the last beat too (2026-10-30, the next round)
function zeVira(music, step, at, stepLength) {
  const bar = Math.floor(step / 6);
  const eighth = step % 6;
  const notes = ZE_VIRA[bar];
  const ch = ZE_VIRA_CH[bar];
  const mode = zeMod(music);
  const tr = mode.tr;
  const mass = ze.g.mass;

  if (notes[eighth] > 0) {
    let span = 1;

    while (eighth + span < 6 && notes[eighth + span] === -1) span++;
    zeConcertina(music, at, notes[eighth] + tr, span * stepLength * 0.95);
    if (mass >= 9) zeConcertina(music, at, notes[eighth] + tr - 12, span * stepLength * 0.95, 0.03);
  }

  if (eighth === 0) {
    zeDrum(music, 'kick', at, 0.6);
    zePluck(music, at, ZE_ROOT[ch] + tr, 0.4, 0.16);
  }

  if (eighth === 3 && (mode.kick2 || mass >= 9)) zeDrum(music, 'kick', at, 0.4);

  if ((eighth === 2 || eighth === 4) && mass > 3) {
    ZE_CHORD[ch].forEach((midi, index) => zePluck(music, at + index * 0.012, midi + 12 + tr, 0.14, 0.035));
  }

  for (let hat = 0; hat < mode.hats; hat++) {
    for (const hz of [4200, 6150]) {
      zeTone(
        music,
        at + (hat * stepLength) / 2,
        'sine',
        hz,
        hz,
        0.07,
        (eighth === 2 || eighth === 4) && !hat ? 0.02 : eighth % 2 ? 0.007 : 0.012,
      );
    }
  }
}

// the malhão's: the concertina's tune, the viola's root and the bombo on one, its fifth on two, the cavaquinho on the
// off-beats, the ferrinhos on every quaver, louder off the beat
function zeMalhao(music, step, at, stepLength) {
  const bar = step >> 2;
  const eighth = step % 4;
  const notes = ZE_MALHAO[bar];
  const ch = ZE_MALHAO_CH[bar];
  const mode = zeMod(music);
  const tr = mode.tr;
  const mass = ze.g.mass;

  if (notes[eighth] > 0) {
    let span = 1;

    while (eighth + span < 4 && notes[eighth + span] === -1) span++;
    zeConcertina(music, at, notes[eighth] + tr, span * stepLength * 0.92);
    if (mass >= 9) zeConcertina(music, at, notes[eighth] + tr - 12, span * stepLength * 0.92, 0.03);
  }

  if (eighth === 0) {
    zeDrum(music, 'kick', at, 0.6);
    zePluck(music, at, ZE_MROOT[ch] + tr, 0.3, 0.16);
  }

  if (eighth === 2) {
    zeDrum(music, 'kick', at, mass >= 9 || mode.kick2 ? 0.45 : 0.3);
    zePluck(music, at, ZE_MROOT[ch] + 7 + tr, 0.3, 0.13);
  }

  if ((eighth === 1 || eighth === 3) && mass > 3) {
    ZE_MCHORD[ch].forEach((midi, index) => zePluck(music, at + index * 0.01, midi + 12 + tr, 0.12, 0.035));
  }

  for (let hat = 0; hat < mode.hats; hat++) {
    for (const hz of [4200, 6150]) {
      zeTone(music, at + (hat * stepLength) / 2, 'sine', hz, hz, 0.06, eighth % 2 && !hat ? 0.018 : 0.008);
    }
  }
}

function zeConcertina(music, at, midi, duration, volume = 0.05) {
  // three reeds a little apart, as a concertina's
  const ac = music.ac;
  const filter = ac.createBiquadFilter();
  const gain = ac.createGain();

  filter.type = 'lowpass';
  filter.frequency.value = 2800;
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(volume, at + 0.02);
  gain.gain.setValueAtTime(volume, at + Math.max(0.03, duration - 0.04));
  gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  filter.connect(gain).connect(music.out);

  for (const [type, det] of [
    ['sawtooth', -7],
    ['square', 0],
    ['sawtooth', 7],
  ]) {
    const oscillator = ac.createOscillator();

    oscillator.type = type;
    oscillator.frequency.value = zeHz(midi);
    oscillator.detune.value = det;
    zeWob(music, oscillator, at);
    oscillator.connect(filter);
    oscillator.start(at);
    oscillator.stop(at + duration + 0.02);
  }
}

function zePluck(music, at, midi, duration, volume) {
  // a string plucked: the cavaquinho's, the viola's
  const oscillator = music.ac.createOscillator();
  const gain = music.ac.createGain();

  oscillator.type = 'triangle';
  oscillator.frequency.value = zeHz(midi);
  zeWob(music, oscillator, at);
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(volume, at + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  oscillator.connect(gain).connect(music.out);
  oscillator.start(at);
  oscillator.stop(at + duration + 0.02);
}

/** The car's engine while he rides — a low saw through a low-pass, the A-Class's sputtering — or none; zeRev its pitch. */
function zeEngine(kind) {
  const music = ze.music;

  if (!music || (kind && ze.g.demo)) return;

  if (music.engine) {
    for (const old of music.engine.os) {
      try {
        old.stop();
      } catch {}
    }

    music.engine = null;
  }

  if (!kind) return;

  const ac = music.ac;
  const oscillator = ac.createOscillator();
  const filter = ac.createBiquadFilter();
  const gain = ac.createGain();
  const os = [oscillator];

  oscillator.type = 'sawtooth';
  oscillator.frequency.value = kind === 'focus' ? 70 : 45;
  filter.type = 'lowpass';
  filter.frequency.value = kind === 'focus' ? 520 : 320;
  gain.gain.value = 0.05;

  if (kind === 'aclass') {
    const lfo = ac.createOscillator();
    const depth = ac.createGain();

    lfo.frequency.value = 7;
    depth.gain.value = 0.035;
    lfo.connect(depth).connect(gain.gain);
    lfo.start();
    os.push(lfo);
  }

  oscillator.connect(filter).connect(gain).connect(music.out);
  oscillator.start();
  music.engine = { o: oscillator, os, base: oscillator.frequency.value };
}

const zeRev = speed => {
  const engine = ze.music?.engine;

  if (engine) engine.o.frequency.setTargetAtTime(engine.base + speed * 0.12, ze.music.ac.currentTime, 0.08);
};

function zeBar(music, step, bar, at) {
  // the funk: a tone up in the Focus, down in the A-Class; thin, no clav; buff, the horns twice
  const fill = bar === 3 && step >= 12;
  const tr = zeMod(music).tr;
  const mass = ze.g.mass;

  if (step === 0 || step === 7 || step === 10 || (bar % 2 && step === 13)) zeDrum(music, 'kick', at);
  if (fill) zeDrum(music, 'snare', at, 0.45 + (step - 12) * 0.18);
  else if (step === 4 || step === 12) zeDrum(music, 'snare', at);
  else if (step === 9 || step === 15) zeDrum(music, 'snare', at, 0.16); // ghosts
  if (!fill) zeDrum(music, step === 14 && bar % 2 ? 'open' : 'hat', at, step % 4 === 2 ? 0.9 : step % 2 ? 0.35 : 0.6);
  const bassNote = ZE_BASS[bar % 2][step];

  if (bassNote) zeBass(music, at, bassNote[0] + tr, bassNote[1], bassNote[2]);
  if (ZE_CLAV[step] && !fill && mass > 3) zeClav(music, at, ZE_CLAV[step], tr);

  if ((bar === 2 || (bar === 0 && mass >= 9)) && ZE_HORN[step]) {
    zeHorn(music, at, ZE_HORN[step][0] + tr, ZE_HORN[step][1]);
  }
}

function zeDrum(music, kind, at, volume = 1) {
  const ac = music.ac;
  const gain = ac.createGain();

  gain.connect(music.out);

  if (kind === 'kick') {
    const oscillator = ac.createOscillator();

    oscillator.frequency.setValueAtTime(150, at);
    oscillator.frequency.exponentialRampToValueAtTime(45, at + 0.12);
    gain.gain.setValueAtTime(volume, at);
    gain.gain.exponentialRampToValueAtTime(0.001, at + 0.3);
    oscillator.connect(gain);
    oscillator.start(at);
    oscillator.stop(at + 0.32);
    return;
  }

  const source = ac.createBufferSource();
  const filter = ac.createBiquadFilter();
  const len = kind === 'snare' ? 0.16 : kind === 'open' ? 0.24 : 0.04;

  source.buffer = music.noise;
  filter.type = kind === 'snare' ? 'bandpass' : 'highpass';
  filter.frequency.value = kind === 'snare' ? 2200 : 7500;
  filter.Q.value = kind === 'snare' ? 0.8 : 0.7;
  gain.gain.setValueAtTime((kind === 'snare' ? 0.55 : 0.16) * volume, at);
  gain.gain.exponentialRampToValueAtTime(0.001, at + len);
  source.connect(filter).connect(gain);
  source.start(at, Math.random() * 0.7);
  source.stop(at + len + 0.02);
  if (kind === 'snare' && volume > 0.3) zeTone(music, at, 'triangle', 220, 140, 0.09, 0.3 * volume); // the drum's body under the rattle
}

function zeTone(music, at, type, f0, f1, duration, volume) {
  const oscillator = music.ac.createOscillator();
  const gain = music.ac.createGain();

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(f0, at);
  oscillator.frequency.exponentialRampToValueAtTime(f1, at + duration);
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(volume, at + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  oscillator.connect(gain).connect(music.out);
  oscillator.start(at);
  oscillator.stop(at + duration + 0.02);
}

function zeBass(music, at, midi, len, pop) {
  const ac = music.ac;
  const duration = len * ZE_16 * 0.9;
  const filter = ac.createBiquadFilter();
  const gain = ac.createGain();

  filter.type = 'lowpass';
  filter.Q.value = 7;
  filter.frequency.setValueAtTime(pop ? 3200 : 1700, at);
  filter.frequency.exponentialRampToValueAtTime(pop ? 600 : 260, at + 0.12); // the slap, then the thumb's thud
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(pop ? 0.3 : 0.4, at + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.15, at + duration * 0.7);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  filter.connect(gain).connect(music.out);

  for (const type of ['sawtooth', 'sine']) {
    const oscillator = ac.createOscillator();

    oscillator.type = type;
    oscillator.frequency.value = zeHz(midi);
    oscillator.connect(filter);
    oscillator.start(at);
    oscillator.stop(at + duration + 0.02);
  }
}

function zeClav(music, at, volume, tr = 0) {
  // E7#9, Hendrix's chord, the wah opening on each stab
  const ac = music.ac;
  const filter = ac.createBiquadFilter();
  const gain = ac.createGain();

  filter.type = 'bandpass';
  filter.Q.value = 3;
  filter.frequency.setValueAtTime(700, at);
  filter.frequency.exponentialRampToValueAtTime(2400, at + 0.08);
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(0.06 * volume, at + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.11);
  filter.connect(gain).connect(music.out);

  for (const midi of [52, 56, 62, 67]) {
    const oscillator = ac.createOscillator();

    oscillator.type = 'square';
    oscillator.frequency.value = zeHz(midi + tr);
    oscillator.connect(filter);
    oscillator.start(at);
    oscillator.stop(at + 0.13);
  }
}

function zeHorn(music, at, midi, len) {
  const ac = music.ac;
  const duration = len * ZE_16;
  const filter = ac.createBiquadFilter();
  const gain = ac.createGain();

  filter.type = 'lowpass';
  filter.frequency.value = 2200;
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(0.07, at + 0.025);
  gain.gain.setValueAtTime(0.07, at + duration * 0.7);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  filter.connect(gain).connect(music.out);

  for (const det of [-8, 8]) {
    const oscillator = ac.createOscillator();

    oscillator.type = 'sawtooth';
    oscillator.frequency.value = zeHz(midi);
    oscillator.detune.value = det;
    oscillator.connect(filter);
    oscillator.start(at);
    oscillator.stop(at + duration + 0.02);
  }
}

function zeNoise(music, at, duration, volume) {
  const source = music.ac.createBufferSource();
  const gain = music.ac.createGain();

  source.buffer = music.noise;
  gain.gain.setValueAtTime(volume, at);
  gain.gain.exponentialRampToValueAtTime(0.001, at + duration);
  source.connect(gain).connect(music.out);
  source.start(at);
  source.stop(at + duration + 0.02);
}

function zeSfx(kind) {
  const music = ze.music;

  if (!music || music.ac.state === 'closed' || ze.g.demo) return; // the title's demo plays in silence

  const ac = music.ac;
  const at = ac.currentTime + 0.005;

  if (kind === 'chomp') {
    zeTone(music, at, 'square', 520, 180, 0.07, 0.12);
    zeTone(music, at + 0.09, 'square', 480, 160, 0.07, 0.1);
  } else if (kind === 'jump') zeTone(music, at, 'square', 300, 620, 0.1, 0.06);
  else if (kind === 'flap') zeNoise(music, at, 0.08, 0.08);
  else if (kind === 'peck') zeTone(music, at, 'square', 900, 1400, 0.04, 0.06);
  else if (kind === 'boing') zeTone(music, at, 'triangle', 180, 520, 0.12, 0.07);
  else if (kind === 'smash') {
    zeTone(music, at, 'sine', 320, 70, 0.16, 0.5);
    zeDrum(music, 'snare', at, 0.7);
  } else if (kind === 'bleh') zeTone(music, at, 'sawtooth', 260, 90, 0.38, 0.16);
  else if (kind === 'level') {
    [523, 659, 784, 1047].forEach((hz, index) => zeTone(music, at + index * 0.08, 'square', hz, hz, 0.11, 0.08));
  } else if (kind === 'combo') {
    [784, 988, 1175].forEach((hz, index) => zeTone(music, at + index * 0.06, 'square', hz, hz, 0.08, 0.08));
  } else if (kind === 'chompBig') {
    zeTone(music, at, 'sawtooth', 196, 150, 0.1, 0.14);
    zeTone(music, at + 0.05, 'sawtooth', 294, 220, 0.1, 0.12);
  } else if (kind === 'transform') {
    // the dragon wakes: a rising roar, a rush, a chord
    zeTone(music, at, 'sawtooth', 90, 900, 1.1, 0.16);
    zeNoise(music, at, 1, 0.1);
    [220, 277, 330, 440].forEach((hz, index) => zeTone(music, at + 1.05 + index * 0.03, 'square', hz, hz, 0.6, 0.07));
  } else if (kind === 'detransform') zeTone(music, at, 'sawtooth', 800, 110, 0.7, 0.12);
  else if (kind === 'boom') {
    for (const delay of [0.3, 0.58, 0.86]) {
      zeTone(music, at + delay, 'sine', 120, 42, 0.3, 0.2);
      zeNoise(music, at + delay, 0.16, 0.06);
    }
  } else if (kind === 'thunder') {
    zeNoise(music, at, 0.7, 0.18);
    zeTone(music, at, 'sine', 70, 30, 0.5, 0.3);
  } else if (kind === 'whoosh') {
    const source = ac.createBufferSource();
    const filter = ac.createBiquadFilter();
    const gain = ac.createGain();

    source.buffer = music.noise;
    filter.type = 'bandpass';
    filter.Q.value = 1.5;
    filter.frequency.setValueAtTime(500, at);
    filter.frequency.exponentialRampToValueAtTime(3500, at + 0.16);
    gain.gain.setValueAtTime(0.25, at);
    gain.gain.exponentialRampToValueAtTime(0.001, at + 0.18);
    source.connect(filter).connect(gain).connect(music.out);
    source.start(at, Math.random() * 0.7);
    source.stop(at + 0.2);
  } else if (kind === 'galo') {
    // a crow: cocorocó
    const oscillator = ac.createOscillator();
    const filter = ac.createBiquadFilter();
    const gain = ac.createGain();

    oscillator.type = 'sawtooth';
    filter.type = 'bandpass';
    filter.frequency.value = 1500;
    filter.Q.value = 2;

    for (const [dt, hz] of [
      [0, 700],
      [0.08, 1250],
      [0.18, 1050],
      [0.3, 1350],
      [0.62, 800],
    ]) {
      oscillator.frequency.linearRampToValueAtTime(hz, at + dt);
    }

    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.2, at + 0.03);
    gain.gain.setValueAtTime(0.2, at + 0.5);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.66);
    oscillator.connect(filter).connect(gain).connect(music.out);
    oscillator.start(at);
    oscillator.stop(at + 0.7);
  } else if (kind === 'focus') {
    // beep beep, and a rev
    for (const delay of [0, 0.18]) for (const hz of [440, 554]) zeTone(music, at + delay, 'square', hz, hz, 0.12, 0.05);
    zeTone(music, at + 0.36, 'sawtooth', 60, 220, 0.5, 0.12);
  } else if (kind === 'aclass') {
    zeTone(music, at, 'square', 392, 330, 0.6, 0.07);
    zeNoise(music, at + 0.1, 0.3, 0.08);
    zeNoise(music, at + 0.5, 0.2, 0.06);
  } // a sad meep, a cough
  else if (kind === 'beep') for (const hz of [440, 554]) zeTone(music, at, 'square', hz, hz, 0.14, 0.05);
  else if (kind === 'meep') zeTone(music, at, 'square', 330, 300, 0.28, 0.05);
  else if (kind === 'monstro') {
    [40, 47, 52].forEach((midi, index) => {
      zeTone(music, at + index * 0.02, 'sawtooth', zeHz(midi), zeHz(midi), 0.9, 0.09);
      zeTone(music, at + 0.45, 'square', zeHz(midi + 12), zeHz(midi + 12), 0.5, 0.04);
    });
  } // a power chord, twice
  else if (kind === 'spy') {
    [64, 67, 71, 75, 76].forEach((midi, index) =>
      zeTone(music, at + index * 0.09, 'sawtooth', zeHz(midi), zeHz(midi), index === 4 ? 0.7 : 0.1, 0.07),
    );
  } // E minor, its major seventh: a spy's chord
  else if (kind === 'over') {
    // the trombone that says it
    [392, 370, 349].forEach((hz, index) =>
      zeHorn(music, at + index * 0.36, 12 * Math.log2(hz / 440) + 69 - 12, 0.34 / ZE_16),
    );

    const oscillator = ac.createOscillator();
    const lfo = ac.createOscillator();
    const depth = ac.createGain();
    const gain = ac.createGain();

    oscillator.type = 'sawtooth';
    oscillator.frequency.value = 165;
    lfo.frequency.value = 6;
    depth.gain.value = 5;
    lfo.connect(depth).connect(oscillator.frequency);
    gain.gain.setValueAtTime(0.0001, at + 1.08);
    gain.gain.exponentialRampToValueAtTime(0.12, at + 1.12);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 2.2);
    oscillator.connect(gain).connect(music.out);

    for (const node of [oscillator, lfo]) {
      node.start(at + 1.08);
      node.stop(at + 2.25);
    }
  }
}

// his two running frames for All caught up (T4, ZERO_HTML), drawn once as CSS images, and a click on him there opens his game
for (const [property, pose] of [
  ['--ze1', 'run1'],
  ['--ze2', 'run2'],
]) {
  document.documentElement.style.setProperty(property, `url(${zeBuild(6, pose, { flip: true }).toDataURL()})`);
}

$('#slist').addEventListener('click', event => {
  if (event.target.closest('.zewalk i')) zeOpen();
});
