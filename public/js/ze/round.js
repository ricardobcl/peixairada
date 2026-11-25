// ---- the round: Zé, what falls, and what they do to each other
/** Today's lunch (T2, 2026-10-30, the next round): the dishes the board read from the day's menus (state.lunch) fall now
 *  and then under their real names, their place beside them — soups and salads as greens, fish as fish, a vegetarian
 *  dish as a green, the rest as golden specials, thirty points; desserts and bread left out. */
function zeLunch() {
  const l = state.lunch;
  if (!l?.on) return [];
  return (l.places || [])
    .filter(p => p.state !== 'closed')
    .flatMap(p =>
      (p.dishes || []).flatMap(d => {
        const it = { dish: d, place: p.name, say: d, special: true };
        if (/^(p[aã]o|entrada|sobremesa)|brownie|bolo|mousse|pudim|gelado|fruta|tarte|arroz doce|leite creme/i.test(d))
          return [];
        if (/^(sopa|creme|caldo)|salada/i.test(d))
          return [{ ...it, kind: 'veg', e: /salada/i.test(d) ? '🥗' : '🥣', say: `${d.toUpperCase()}!` }];
        if (
          /bacalhau|peixe|polvo|lula|salm[aã]o|pescada|dourada|robalo|sardinh|atum|camar|marisco|choco|truta/i.test(d)
        )
          return [{ ...it, kind: 'fish', e: '🐟', pts: 5 }];
        if (/legumes|vegetarian|vegan|tofu|grão|espinafre|cogumelo/i.test(d))
          return [{ ...it, kind: 'veg', e: '🥗', say: `${d.toUpperCase()}!` }];
        const e = /frango|galinha|pato|peru/i.test(d)
          ? '🍗'
          : /bife|vitela|novilho|vaca|carne/i.test(d)
            ? '🥩'
            : /porco|rojõ|costel|entrecosto|leit[aã]o|febras/i.test(d)
              ? '🍖'
              : /massa|esparguete|lasanha|bolonhesa/i.test(d)
                ? '🍝'
                : /arroz/i.test(d)
                  ? '🍛'
                  : '🍲';
        return [{ ...it, kind: 'meat', e, pts: 30 }];
      }),
    );
}
/** The day's round (2026-10-30, the next round): what falls is the date's — the same for everyone today, a way to play
 *  each —, from a generator seeded by the day (zeSeed); every drop takes ZE_DRAWS numbers of it whatever it uses, so
 *  the round you play does not change what falls next. The demo on the title, and the bits and words, take chance's. */
const ZE_DRAWS = 16;
const zeToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
function zeSeed(text) {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.codePointAt(0), 16777619); // FNV-1a, then mulberry32
  return () => {
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** Is the next one green? A chance that grows with the level — or HARDCORE's bag, five meats and forty-five greens. */
function zeGreen(g, r) {
  const D = zeDiff();
  if (!D.bag) {
    const [base, up, max] = D.veg;
    return r < Math.min(max, base + (g.level - 1) * up);
  }
  if (!g.bag.length) {
    g.bag = Array.from({ length: D.bag[1] }, (_, i) => i >= D.bag[0]);
    for (let i = g.bag.length - 1; i > 0; i--) {
      const j = (g.bagRnd() * (i + 1)) | 0;
      [g.bag[i], g.bag[j]] = [g.bag[j], g.bag[i]];
    }
  }
  return g.bag.pop();
}
/** One thing falls, as the day's numbers say; the jitter of the wait for the next is the drop's too, returned. */
function zeDrop(g) {
  const D = zeDiff(),
    R = Array.from({ length: ZE_DRAWS }, g.rnd),
    at = (a, i) => a[(R[i] * a.length) | 0];
  const veg = g.dragon ? R[0] < 0.5 : zeGreen(g, R[0]),
    galo = !veg && !g.dragon && g.mass < ZE_MASS_MAX - 1 && R[1] < 0.035;
  const spy = !veg && !galo && !g.dragon && !g.cased && g.level >= 2 && R[2] < 0.03; // the briefcase: once a round, from level 2
  let it;
  if (spy) {
    it = { kind: 'case', e: '💼', pts: 100, say: 'CLASSIFIED' };
    g.cased = true;
  } else if (galo) it = { kind: 'galo', e: '🐓', pts: 50, say: 'GALO! +2 muscle' };
  else if (!g.dragon && g.lunch.length && R[15] < 0.07)
    it = { ...at(g.lunch, 3) }; // today's lunch
  else if (veg) {
    const [e, say] = at(ZE_VEG, 3);
    it = { kind: 'veg', e, say };
  } else if (!g.dragon && !g.power && g.t > 12 && !g.items.some(x => x.kind === 'power') && R[4] < 0.03)
    it = { kind: 'power', p: at(Object.keys(ZE_POWERS), 3), e: '', pts: 25 };
  else if (!g.dragon && !g.items.some(x => x.kind === 'peixe') && R[5] < 0.008)
    it = { kind: 'peixe', e: '', pts: 100, say: 'LET GO!' }; // the board's own fish, now and then
  else if (!g.dragon && !D.bag && R[6] < 0.09) {
    const [e, say, tint] = at(ZE_FISH, 3);
    it = { kind: 'fish', e, say, tint, pts: 5 };
  } else {
    const [e, pts, say] = at(ZE_MEAT, 3);
    it = { kind: 'meat', e, pts, say };
  }
  // Barcelos' miracle (2026-10-30, the next round): now and then a chicken that falls stands up, crows, and is the
  // golden galo — the roast cock on the judge's plate that stood up and crowed, and saved the pilgrim
  if (it.e === '🍗' && !g.dragon && !g.items.some(x => x.miracle) && R[7] < 0.06) it.miracle = 240 + R[8] * 220;
  const drift = g.level >= D.drift ? Math.min(110, (g.level - D.drift + 1) * 22) : 20,
    fall = (g.dragon ? 1 : D.speed) * ZE_FALL; // past its level, food drifts — off the walls
  g.items.push(
    Object.assign(it, {
      x: 30 + R[9] * (ZE_W - 60),
      y: -24,
      vx: (R[10] * 2 - 1) * drift,
      vy: (60 + g.level * 18 + R[11] * 50) * fall,
      g: (110 + g.level * 16) * fall * (it.kind === 'peixe' ? 0.35 : 1),
      rot: R[12] * 6,
      spin: (R[13] - 0.5) * 4,
    }),
  ); // the board's fish swims down slowly
  return R[14];
}
const zeTouch = (it, b, r = 16) => {
  const x = Math.max(b.l, Math.min(it.x, b.r)),
    y = Math.max(b.t, Math.min(it.y, b.b));
  return (it.x - x) ** 2 + (it.y - y) ** 2 < r * r;
};
const zeWord = (g, s, x, y, c, big = false) =>
  !g.demo && g.words.push({ s, x: Math.max(110, Math.min(ZE_W - 110, x)), y, c, big, t: 0 });
function zeBits(g, x, y, cs, n) {
  for (let i = 0; i < n; i++)
    g.bits.push({
      x,
      y,
      vx: (Math.random() - 0.5) * 320,
      vy: -120 - Math.random() * 260,
      t: 0,
      life: 0.5 + Math.random() * 0.4,
      c: zePick(cs),
      r: 2 + Math.random() * 3,
    });
}
/** What flies off is what was hit (2026-10-30, the next round): bits of meat and a bone from a bite, leaves from a green —
 *  turning as they fly, where confetti was. */
function zeChunks(g, x, y, kind, n) {
  const cs =
    kind === 'veg'
      ? ['#2f7a2c', '#4fa03c', '#9ad26a', '#5cbf4a']
      : kind === 'fish'
        ? ['#c9d2e0', '#8a9bb0', '#e8eef5', '#6f7f95']
        : ['#7a3018', '#b0603a', '#e8a0a0', '#d8843a'];
  for (let i = 0; i < n; i++)
    g.bits.push({
      x,
      y,
      vx: (Math.random() - 0.5) * 360,
      vy: -140 - Math.random() * 280,
      t: 0,
      life: 0.55 + Math.random() * 0.3,
      c: zePick(cs),
      w: 3 + Math.random() * 4,
      h: kind === 'veg' ? 2 + Math.random() * 2 : 3 + Math.random() * 3,
      rot: Math.random() * 6,
      spin: (Math.random() - 0.5) * 18,
    });
  if (kind !== 'veg')
    g.bits.push({
      x,
      y,
      vx: (Math.random() - 0.5) * 200,
      vy: -320,
      t: 0,
      life: 0.8,
      c: '#f2ead8',
      w: 10,
      h: 3,
      rot: 0,
      spin: 14,
      bone: true,
    }); // a bone, a fishbone
}
const zeBanner = (g, s, sub = '', cs = ['#ffd23f', '#a6dc5a'], t = 1.6) => {
  g.banner = { s, sub, cs, t };
};
/** The dragon's size: 1, twice it in its time — growing and shrinking in four steps, as a sprite would. */
function zeK(g) {
  if (!g.dragon) return 1;
  const el = ZE_DRAGON - g.dragon;
  return el < ZE_DRAGON_IN
    ? 1 + Math.floor((el / ZE_DRAGON_IN) * 4) / 4
    : g.dragon < ZE_DRAGON_OUT
      ? 1 + Math.ceil((g.dragon / ZE_DRAGON_OUT) * 4) / 4
      : 2;
}
const zeSz = g => (0.84 + Math.max(0, g.mass) * 0.03) * zeK(g); // his size: his bulk's, and the dragon's
const zeTw = g => 9 + Math.max(0, g.mass) * 1.6; // his half-width at the shoulders
const zeDark = g => (g.dragon ? Math.min(1, (ZE_DRAGON - g.dragon) / ZE_DRAGON_IN, g.dragon / ZE_DRAGON_OUT) : 0); // the sky's turn, 0 to 1
function zeScore(g, n) {
  g.score += n;
  if (g.dragon || g.avo || g.score < g.next) return;
  g.level++;
  g.next += zeDiff().step * (1 + (g.level - 2) * ZE_PACE.up);
  if (g.level === ZE_DRAGON_LEVEL) zeDragon(g, true);
  else if (g.level % ZE_AVO_EVERY === 0) zeAvo(g);
  else {
    zeBanner(g, `LEVEL ${g.level}!`, g.level % ZE_PACE.bite === 1 ? `THE GREENS BITE ${zeBite(g)} NOW` : '');
    zeSfx('level');
    zeFireworks(g);
  }
}
/** Festa das Cruzes (B3, 2026-11-01): three rockets at a level-up, over the river and in it. None under reduced motion. */
const ZE_FW = ['#ffd23f', '#ff5a64', '#7ef0ff', '#9be15d', '#ff9ad5', '#fff3c4'],
  ZE_FW_N = 56,
  ZE_FW_LIFE = 1.6;
function zeFireworks(g) {
  if (zeCalm()) return;
  for (let i = 0; i < 3; i++)
    g.fw.push({
      x: 90 + Math.random() * 540,
      y: 120 + Math.random() * 300,
      t: -i * 0.28,
      c: zePick(ZE_FW),
      a0: Math.random() * 6.3,
      R: 80 + Math.random() * 50,
    });
  zeSfx('boom');
}
/** Where each spark of a rocket is at its age: out quickly, then falling. fn(x, y, fade). */
function zeFwEach(g, fn) {
  for (const f of g.fw) {
    if (f.t < 0) {
      fn(f.x, f.y - f.t * 900, 1, f, true);
      continue;
    } // going up
    for (const [back, dim] of [
      [0, 1],
      [0.05, 0.55],
      [0.1, 0.28],
    ]) {
      // each spark and its tail
      const t = f.t - back;
      if (t < 0) continue;
      const out = f.R * (1 - Math.exp(-3.4 * t)),
        down = 70 * t * t,
        fade = (1 - f.t / ZE_FW_LIFE) * dim;
      for (let i = 0; i < ZE_FW_N; i++) {
        const a = f.a0 + (i / ZE_FW_N) * 6.283,
          k = 0.62 + (i % 4) * 0.14;
        fn(f.x + Math.cos(a) * out * k, f.y + Math.sin(a) * out * k + down, fade, f, false);
      }
    }
  }
}
function zeDragon(g, on) {
  g.streak = 0;
  g.mult = 1;
  if (on) {
    if (g.ride) zeLeave(g);
    Object.assign(g, { dragon: ZE_DRAGON, hurt: 0, shake: 0.9, flash: 0.3, lightT: 1.4 });
    zeBanner(g, 'ENTER THE DRAGON!', 'MODO FERA — EAT EVERYTHING', ['#ff7a2a', '#ffd23f'], 2.4);
    zeSfx('transform');
    zeTrack('dragon');
    if (zeDiff().id === 'hardcore') zeTrophy(g, 'fera');
    return;
  }
  Object.assign(g, { dragon: 0, bolt: null, spawn: 1.2, level: ZE_DRAGON_LEVEL + 1, next: g.score + zeDiff().step });
  g.flames.length = 0;
  for (const it of g.items) if (!it.out) zeBits(g, it.x, it.y, ['#ffd23f', '#ff7a2a', '#e43b44'], 5); // what is left of the feast goes up in smoke
  g.items = g.items.filter(it => it.out);
  zeBanner(g, `LEVEL ${g.level}!`, 'BACK TO NORMAL', ['#ffd23f', '#a6dc5a'], 2.2);
  zeSfx('detransform');
  zeTrack('band');
}
/** The Avó da Horta comes to her window: the house rises behind Trota's, the food stops, and she throws couves —
 *  three in a fan, five rained from above, one straight at him —, saying so. */
function zeAvo(g) {
  if (g.ride) zeLeave(g);
  g.avo = {
    t: 0,
    hp: 3,
    rise: 0,
    next: 1.8,
    n: 0,
    say: ZE_AVO_SAYS[0],
    sayT: 2.4,
    arm: 0,
    hit: 0,
    leaving: false,
    won: false,
  };
  g.items = g.items.filter(it => it.out);
  zeBanner(g, 'AVÓ DA HORTA!', 'KICK THREE OF HER COUVES BACK AT HER', ['#9be15d', '#ffd23f'], 2.4);
  zeSfx('transform');
}
function zeAvoStep(g, dt) {
  const a = g.avo;
  a.t += dt;
  a.arm = Math.max(0, a.arm - dt);
  a.hit = Math.max(0, a.hit - dt);
  a.sayT = Math.max(0, a.sayT - dt);
  a.rise = a.leaving ? Math.max(0, a.rise - dt / 0.9) : Math.min(1, a.rise + dt / 0.9);
  if (a.leaving) {
    if (!a.rise) g.avo = null;
    return;
  }
  if (a.t > ZE_AVO_T) {
    a.leaving = true;
    a.say = 'Amanhã há mais!';
    a.sayT = 2;
    return;
  } // she gives up for today
  if (a.rise < 1 || (a.next -= dt) > 0) return;
  const pattern = a.n++ % 3,
    from = { x: ZE_AVO.x - 18, y: ZE_AVO.y + 20 },
    couve = (x, y, vx, vy, gr = 260) =>
      g.items.push({
        kind: 'veg',
        e: '🥬',
        say: 'COME A SOPA!',
        from: 'avo',
        x,
        y,
        vx,
        vy,
        g: gr,
        rot: 0,
        spin: (Math.random() - 0.5) * 6,
      });
  if (pattern === 0)
    for (const d of [-1, 0, 1]) couve(from.x, from.y, (g.x - from.x) * 0.9 + d * 170, -260); // a fan
  else if (pattern === 1)
    for (let i = 0; i < 5; i++) couve(70 + i * 145, -30 - i * 40, 0, 60, 200); // rained from above
  else {
    const T = 0.9;
    couve(from.x, from.y, (g.x - from.x) / T, (g.y - 100 - from.y) / T - 150 * T, 300);
  } // straight at him
  a.arm = 0.35;
  a.next = 2.2 - Math.min(0.8, g.level * 0.05);
  if (Math.random() < 0.5) {
    a.say = zePick(ZE_AVO_SAYS);
    a.sayT = 1.8;
  }
  zeSfx('whoosh');
}
/** One of her couves kicked back: aimed at her window, on a high arc. */
function zeAvoBack(it) {
  const T = 0.6,
    gr = 900;
  Object.assign(it, {
    back: true,
    vx: (ZE_AVO.x - it.x) / T,
    vy: (ZE_AVO.y - it.y) / T - (gr * T) / 2,
    g: gr,
    spin: 14,
  });
}
function zeAvoHit(g, it) {
  const a = g.avo;
  it.dead = true;
  a.hp--;
  a.hit = 0.4;
  g.shake = Math.max(g.shake, 0.2);
  zeChunks(g, ZE_AVO.x, ZE_AVO.y, 'veg', 14);
  zeWord(g, a.hp ? 'AI!' : 'AI, ESTE MENINO!', ZE_AVO.x - 60, ZE_AVO.y - 60, '#9be15d', true);
  zeSfx('smash');
  zeHold(g, 0.1, !a.hp);
  if (a.hp) return;
  Object.assign(a, { leaving: true, won: true, say: 'Pronto, come o que quiseres!', sayT: 2.2 });
  zeBanner(g, 'A AVÓ DESISTE!', '+300 · EAT WHAT YOU LIKE', ['#ffd23f', '#9be15d'], 2.4);
  zeSfx('level');
  zeScore(g, 300);
  zeTrophy(g, 'avo');
}
function zeStrike(g) {
  // lightning, while the dragon is out
  let x = 60 + Math.random() * (ZE_W - 120),
    y = 20;
  const pts = [[x, y]];
  while (y < 560) {
    y += 20 + Math.random() * 34;
    x += (Math.random() - 0.5) * 70;
    pts.push([x, y]);
  }
  g.bolt = { pts, t: 0.28 };
  g.flash = 0.14;
  g.shake = Math.max(g.shake, 0.2);
  zeSfx('thunder');
}
/** A car comes for him: the Focus (YALLA — quick) or the A-Class (the punishment — slow), ZE_RIDE s; one there goes. */
function zeRide(g, kind) {
  if (g.dragon || g.avo || (g.phase !== 'play' && !g.demo)) return; // no car while the dragon or the avó is out: space kicks
  if (g.ride) zeLeave(g);
  Object.assign(g, {
    ride: { kind, t: ZE_RIDE, tilt: 0, vx: g.vx, wheel: 0 },
    kick: 0,
    vy: 0,
    y: ZE_FLOOR,
    gy: ZE_FLOOR,
  });
  zeBits(g, g.x, ZE_FLOOR - 20, ['#d9c7e8', '#ffffff', '#9aa0a8'], 14);
  if (kind === 'focus') zeBanner(g, 'FORD FOCUS!', 'YALLA — FIVE SECONDS OF SPEED', ['#5b8ff0', '#ffd23f'], 2.2);
  else zeBanner(g, 'MERCEDES A-CLASS…', 'THE PUNISHMENT — FIVE SLOW SECONDS', ['#c8ccd2', '#ff5a64'], 2.2);
  zeSfx(kind);
  zeEngine(kind);
  zeMode(kind);
  zeBump(g, 'levelChange');
}
const zeFast = g => g.dash > 0 || (g.ride?.kind === 'focus' && Math.abs(g.vx) > 260); // quick enough to leave afterimages
/** …and goes off on its own: the Focus at speed, the A-Class over onto its roof first, as at the moose test. */
function zeLeave(g) {
  const r = g.ride;
  if (!r) return;
  g.leaving = { kind: r.kind, x: g.x, f: g.f, t: 0, wheel: r.wheel, flip: 0 };
  if (r.kind === 'aclass') {
    zeWord(g, 'FAILED THE MOOSE TEST!', g.x, ZE_FLOOR - 150, '#c8ccd2', true);
    if (g.mass >= ZE_MASS_MAX && g.phase === 'play') zeTrophy(g, 'moose');
  }
  g.ride = null;
  zeEngine(null);
  zeMode(null);
}
/** Bigger by n, to his full bulk — reached from below, MONSTRO! (2026-10-30, the next round): the gym's word for it, a
 *  flex under a spotlight (g.flex), once in a while at most. */
function zeGrow(g, n) {
  const was = g.mass;
  Object.assign(g, { mass: Math.min(ZE_MASS_MAX, g.mass + n), pump: 0.3 });
  if (was >= ZE_MASS_MAX || g.mass < ZE_MASS_MAX || g.dragon || g.t - g.monAt < 8) return;
  g.monAt = g.t;
  g.flex = 1.4;
  zeHold(g, 0.1);
  zeBanner(g, 'MONSTRO!', "FULL BULK — THE GYM'S WORD FOR IT", ['#ffd23f', '#ff7a2a'], 1.6);
  zeSfx('monstro');
  zeTrophy(g, 'monstro');
}
/** What meets him: meat (or anything at all, the dragon's) is eaten and makes him bigger, the combo growing every five
 *  in a row and a Focus coming every three; a green takes some of him — three in a row, the A-Class; none left, the
 *  K.O.; the rooster is muscle; the briefcase, AGENT ZÉ. */
function zeEat(g, it) {
  const k = zeSz(g),
    mx = g.x + g.f * 4 * k,
    my = g.y - 110 * k;
  if (it.kind === 'case') {
    g.agent = true;
    zeBanner(g, 'AGENT ZÉ', 'ON LOAN TO THE MOSSAD · סודי ביותר', ['#e8e8e8', '#5b8ff0'], 2.6);
    zeBits(g, mx, my, ['#e8e8e8', '#5b8ff0', '#0e0c12'], 12);
    zeSfx('spy');
    zeCount(g, 'agents', 3, 'agent');
    return zeScore(g, it.pts);
  }
  if (it.kind === 'gold') {
    zeGrow(g, 2);
    g.gold = 0.5;
    zeBanner(g, 'O MILAGRE DO GALO!', '+100 · THE ROAST COCK STOOD UP AND CROWED', ['#ffd23f', '#fff3c4'], 2.2);
    zeBits(g, it.x, it.y, ['#ffd23f', '#fff3c4', '#feae34'], 22);
    zeSfx('galo');
    zeSfx('level');
    zeTrophy(g, 'milagre');
    return zeScore(g, it.pts);
  }
  if (it.kind === 'power') {
    // a power-up, ZE_POWER_T s: the francesinha fills him at once
    const P = ZE_POWERS[it.p];
    g.power = { kind: it.p, t: ZE_POWER_T };
    if (it.p === 'francesinha') zeGrow(g, ZE_MASS_MAX);
    zeBanner(g, P.name, P.say, [P.c, '#fff3c4'], 1.8);
    zeBits(g, it.x, it.y, [P.c, '#fff3c4', '#ffd23f'], 14);
    zeSfx('level');
    zeHold(g, 0.08);
    return zeScore(g, it.pts);
  }
  if (it.kind === 'fish') {
    // neither meat nor green: five, no bulk, the streak as it was
    zeWord(g, `+5 ${it.say}`, it.x, it.y - 24, '#c9e4ff');
    zeChunks(g, mx, my, 'fish', 7);
    zeSfx('chomp');
    zeHold(g, 0.05);
    return zeScore(g, 5);
  }
  if (it.kind === 'galo') {
    zeGrow(g, 2);
    zeWord(g, it.say, it.x, it.y - 24, '#ffd23f', true);
    zeBits(g, it.x, it.y, ['#ffd23f', '#e8322f', '#2b5cb8'], 14);
    zeSfx('galo');
    return zeScore(g, it.pts);
  }
  if (it.kind === 'veg' && !g.dragon) {
    Object.assign(g, {
      mass: g.mass - zeBite(g),
      streak: 0,
      mult: 1,
      hurt: 1.4,
      red: 0.2,
      shake: 0.35,
      pump: -0.3,
      greens: g.greens + 1,
    });
    zeWord(g, it.say, it.x, it.y - 24, '#9be15d', true);
    zeChunks(g, it.x, it.y, 'veg', 10);
    zeSfx('bleh');
    if (g.demo)
      g.mass = Math.max(g.mass, 3); // the demo never ends
    else if (g.mass <= 0) return zeOver(g);
    if (g.greens >= 3) {
      g.greens = 0;
      zeRide(g, 'aclass');
    }
    return;
  }
  g.streak++;
  g.greens = 0;
  if (it.kind === 'meat') {
    zeGrow(g, 1);
    if (it.e === '🌭' && ++g.chouricos >= 10) zeTrophy(g, 'chourico');
  }
  const mult = 1 + Math.min(3, Math.floor(g.streak / 5)),
    up = mult > g.mult,
    pts = (it.kind === 'veg' ? 10 : it.pts) * mult;
  g.mult = mult;
  g.chomp = 0.3;
  zeSquash(g, 'chew', 0.14);
  if (g.dragon) g.shake = Math.max(g.shake, 0.08);
  if (up) {
    zeWord(g, `COMBO ×${mult}!`, mx, my - 70 * k, '#feae34', true);
    zeSfx('combo');
    zeHold(g, 0.12, true);
    if (mult >= 4) zeTrophy(g, 'combo');
  } else {
    zeSfx(g.dragon ? 'chompBig' : 'chomp');
    if (!g.dragon) zeHold(g, 0.05);
  } // the dragon's feast does not stop for each bite
  zeWord(
    g,
    `+${pts}${it.kind === 'meat' ? ` ${it.say}` : ''}`,
    it.x,
    it.y - 24,
    it.kind === 'veg' ? '#ff7a2a' : it.special ? '#ffd23f' : '#fff3c4',
  );
  if (it.place) zeWord(g, it.place, it.x, it.y - 2, '#d9c7e8');
  zeChunks(g, mx, my, it.kind === 'veg' ? 'veg' : 'meat', g.dragon ? 12 : 7);
  zeScore(g, pts);
  if (
    it.kind === 'meat' &&
    g.streak % ZE_FOCUS_ROW === 0 &&
    g.ride?.kind !== 'focus' &&
    g.t - g.focusAt >= ZE_FOCUS_GAP
  ) {
    g.focusAt = g.t;
    zeRide(g, 'focus');
  } // an event (2026-11-01): he was in it for up to 46 % of a round, and in a car he cannot kick
}
function zeStep(dt) {
  const g = ze.g;
  if (g.freeze > 0) {
    g.freeze = Math.max(0, g.freeze - dt);
    return;
  } // a hit-stop: everything holds
  g.t += dt;
  for (const w of g.words) {
    w.t += dt;
    w.y -= 36 * dt;
  }
  g.words = g.words.filter(w => w.t < 1.1);
  for (const b of g.bits) {
    b.t += dt;
    b.vy += 900 * dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (b.spin) b.rot += b.spin * dt;
  }
  g.bits = g.bits.filter(b => b.t < b.life);
  for (const f of g.flames) {
    f.t += dt;
    f.x += f.vx * dt;
    f.y += f.vy * dt;
  }
  g.flames = g.flames.filter(f => f.t < f.life);
  for (const n of ['shake', 'chomp', 'kick', 'flash', 'red', 'punch', 'flex', 'gold', 'sweep'])
    g[n] = Math.max(0, g[n] - dt);
  g.pump -= Math.sign(g.pump) * Math.min(Math.abs(g.pump), dt); // a pump or a sag, easing back
  if (g.sq && (g.sq.t -= dt) <= 0) g.sq = null;
  if (g.banner && (g.banner.t -= dt) <= 0) g.banner = null;
  if (g.trophy && (g.trophy.t -= dt) <= 0) g.trophy = null;
  if (g.bolt && (g.bolt.t -= dt) <= 0) g.bolt = null;
  const l = g.leaving;
  if (l) {
    l.t += dt;
    if (l.kind === 'aclass' && l.t < 0.6)
      l.flip = (Math.PI * l.t) / 0.6; // over it goes, then slides off on its roof
    else {
      l.x += l.f * (l.kind === 'focus' ? 640 : 320) * dt;
      l.wheel += (l.f * (l.kind === 'focus' ? 640 : 0) * dt) / 17;
    }
    if (l.x < -220 || l.x > ZE_W + 220) g.leaving = null;
  }
  if (g.phase === 'over' && g.koT >= ZE_KO_T) g.overT += dt;
  for (const f of g.fw) f.t += dt;
  g.fw = g.fw.filter(f => f.t < ZE_FW_LIFE);
  if (g.phase === 'title' && (g.cardT += dt) >= ZE_CARD_T) {
    g.card++;
    g.cardT = 0;
  } // the rules turn while the demo plays
  if (g.stamp) g.stamp = Math.max(0, g.stamp - dt * 6);
  if (g.phase !== 'play' && !g.demo) return;
  const D = zeDiff(),
    k = zeSz(g),
    car = g.ride && ZE_CARS[g.ride.kind];
  // Zé: runs where the keys or the pointer say — quicker each level, as the dragon, in the Focus; slower in the A-Class
  const aim = ze.aim == null || Math.abs(ze.aim - g.x) < 10 ? 0 : Math.sign(ze.aim - g.x),
    want = g.demo ? zeBot(g) : ze.keys.r - ze.keys.l || aim;
  g.vx +=
    (want * (380 + Math.min(g.level - 1, ZE_PACE.cap) * 12) * (g.dragon ? 1.15 : 1) * (car ? car.speed : 1) - g.vx) *
    Math.min(1, dt * (car ? 6 : 12)); // a car takes its time
  if (want) g.f = want;
  g.dashCool = Math.max(0, g.dashCool - dt);
  if (g.dash > 0) {
    g.dash = Math.max(0, g.dash - dt);
    g.vx = g.dashF * 1150;
    g.f = g.dashF;
  }
  const half = car ? 100 : 28 * k;
  g.x = Math.max(half, Math.min(ZE_W - half, g.x + g.vx * dt));
  // what he stands on: the floor, or the awning or the sign come down on from above (G4, 2026-10-30, the next round)
  const wasY = g.y,
    gy = g.drop > 1e-6 || g.ride || g.vy < 0 ? ZE_FLOOR : zePlatform(g.x, wasY),
    aloft = wasY < gy - 0.5;
  g.drop = Math.max(0, g.drop - dt);
  g.vy += 1500 * dt;
  g.y += g.vy * dt;
  if (g.y >= gy) {
    if (aloft && g.vy > 200) zeSquash(g, 'land', 0.2);
    g.y = gy;
    g.vy = 0;
    g.jumps = 0;
    if (gy === ZE_PLATS[1].y) zeTrophy(g, 'telhado');
    if (g.jumpBuf > 0) zeJump(g);
  }
  g.gy = g.vy < 0 ? ZE_FLOOR : zePlatform(g.x, g.y);
  g.jumpBuf = Math.max(0, g.jumpBuf - dt);
  g.coyote = g.y >= g.gy - 0.5 ? ZE_COYOTE : g.vy < 0 || g.drop > 0 ? 0 : Math.max(0, g.coyote - dt);
  if (g.kickBuf > 0) {
    g.kickBuf = Math.max(0, g.kickBuf - dt);
    if (g.cool <= 0 && g.kickBuf > 0) {
      g.kickBuf = 0;
      zeKick(g);
    }
  }
  g.run += Math.abs(g.vx) * dt * 0.05;
  g.cool = Math.max(0, g.cool - dt);
  g.hurt = Math.max(0, g.hurt - dt);
  if (g.ride) {
    // the car: its wheels, its pitch as it pulls away or brakes (the A-Class's the more), its engine, its time
    const r = g.ride,
      pitch =
        Math.max(-0.3, Math.min(0.3, (-(g.vx - r.vx) / Math.max(dt, 0.001)) * 0.00012)) *
        (r.kind === 'aclass' ? 1.6 : 0.5);
    r.tilt += (pitch * g.f - r.tilt) * Math.min(1, dt * 8);
    r.vx = g.vx;
    r.wheel += (g.vx * dt) / 17;
    zeRev(Math.abs(g.vx));
    if ((r.t -= dt) <= 0) zeLeave(g);
  }
  // the Focus leaves afterimages of him and itself behind, the A-Class black smoke (2026-10-30, the next round)
  if ((g.trailT -= dt) <= 0) {
    g.trailT = 0.035;
    if (zeFast(g)) {
      g.trail.unshift({ x: g.x, y: g.y });
      g.trail.length = Math.min(g.trail.length, 6);
    } else g.trail.length = 0;
  }
  if (g.ride?.kind === 'aclass' && (g.smokeT -= dt) <= 0) {
    g.smokeT = 0.07 + Math.random() * 0.05;
    g.smoke.push({
      x: g.x - g.f * 74,
      y: ZE_FLOOR - 24,
      vx: -g.f * (30 + Math.random() * 40) + g.vx * 0.3,
      vy: -18 - Math.random() * 30,
      r: 5 + Math.random() * 3,
      t: 0,
      life: 1 + Math.random() * 0.4,
    });
  }
  for (const p of g.smoke) {
    p.t += dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.r += 16 * dt;
  }
  g.smoke = g.smoke.filter(p => p.t < p.life);
  g.spawn -= g.power?.kind === 'vinho' ? dt * 0.45 : dt;
  if (g.power && (g.power.t -= dt) <= 0) g.power = null;
  if (g.galo) zeGaloStep(g, dt);
  if (g.avo) zeAvoStep(g, dt);
  else if (g.dragon) {
    g.dragon = Math.max(0, g.dragon - dt);
    const el = ZE_DRAGON - g.dragon;
    if (g.spawn <= 0 && el > ZE_DRAGON_IN && g.dragon > ZE_DRAGON_OUT + 0.8) g.spawn = 0.16 + zeDrop(g) * 0.12; // a feast, while he is big
    if ((g.lightT -= dt) <= 0) {
      zeStrike(g);
      g.lightT = 1.3 + Math.random() * 2;
    }
    for (let i = 0, n = (dt * 110 + Math.random()) | 0; i < n; i++)
      // the fire round him
      g.flames.push({
        x: g.x + (Math.random() * 2 - 1) * (zeTw(g) + 16) * k,
        y: g.y - Math.random() * 160 * k,
        vx: (Math.random() - 0.5) * 30,
        vy: -(60 + Math.random() * 120),
        t: 0,
        life: 0.35 + Math.random() * 0.3,
        s: Math.random() < 0.5 ? 5 : 7,
      });
    if (!g.dragon) zeDragon(g, false);
  } else {
    if (g.spawn <= 0) g.spawn = Math.max(0.3, 1.05 - (g.level - 1) * 0.07) * D.spawn * (0.75 + zeDrop(g) * 0.5);
    if (ZE_SKIES[zeSkyOf(g)].bolt && (g.lightT -= dt) <= 0) {
      zeStrike(g);
      g.lightT = 2.5 + Math.random() * 3;
    } // the storm's, round again with no dragon
  }
  // what falls meets his foot, then his mouth (meat) or him (a green) — broader as he is —, then the floor
  const pw = g.power?.kind,
    idt = pw === 'vinho' ? dt * 0.45 : dt; // the vinho verde's slow motion: what falls, not him
  const air = g.y < g.gy - 0.5,
    reach = g.dragon ? 1.4 : D.reach * (pw === 'francesinha' ? 1.9 : 1),
    w = (zeTw(g) + 6) * k,
    body = { l: g.x - w, r: g.x + w, t: g.y - 164 * k, b: g.y - 4 };
  const mouth = { ...body, l: g.x - w * reach, r: g.x + w * reach };
  const foot =
    g.kick > 0.04
      ? {
          l: g.x + Math.min(g.f * 8, g.f * 94) * k,
          r: g.x + Math.max(g.f * 8, g.f * 94) * k,
          t: g.y - (air ? 84 : 100) * k,
          b: g.y - (air ? 20 : 36) * k,
        }
      : null;
  for (const it of g.items) {
    if (pw === 'bifana' && !it.out && ['meat', 'gold', 'galo', 'fish'].includes(it.kind)) {
      // the bifana's magnet: meat curves to his mouth
      const dx = g.x - it.x,
        dy = g.y - 110 * k - it.y,
        d = Math.hypot(dx, dy);
      if (d < 340) {
        it.vx += (dx / d) * 900 * dt;
        it.vx *= 1 - Math.min(1, dt * 2);
        if (dy > 0) it.vy += (dy / d) * 300 * dt;
      }
    }
    const sdt = it.out ? dt : idt,
      iy = it.y;
    it.vy += it.g * sdt;
    it.x += it.vx * sdt;
    it.y += it.vy * sdt;
    it.rot += it.spin * sdt;
    if (!it.out && it.vy > 0 && (it.bounces || 0) < 4)
      for (const p of ZE_PLATS)
        if (it.x >= p.l && it.x <= p.r && iy < p.y - 14 && it.y >= p.y - 14) {
          // off the sign, off the awning, and off it
          Object.assign(it, {
            y: p.y - 14,
            vy: -Math.max(160, it.vy * 0.55),
            vx: it.vx + Math.sign(it.x - (p.l + p.r) / 2 || 1) * 150,
            bounces: (it.bounces || 0) + 1,
          });
          zeSfx('boing');
          break;
        }
    if (it.out) {
      if (it.back && g.avo && !g.avo.leaving && Math.hypot(it.x - ZE_AVO.x, it.y - ZE_AVO.y) < 46) zeAvoHit(g, it);
      it.dead = it.dead || it.y > ZE_H + 40 || it.y < -80 || it.x < -80 || it.x > ZE_W + 80;
      continue;
    }
    if (it.x < 20 || it.x > ZE_W - 20) {
      it.vx *= -1;
      it.x = Math.max(20, Math.min(ZE_W - 20, it.x));
    }
    if (it.miracle && it.kind === 'meat' && it.y >= it.miracle && !it.stood) {
      // the miracle: it stops, stands up and crows…
      Object.assign(it, { stood: 0.9, vx: 0, vy: 0, g: 0, spin: 0 });
      zeWord(g, 'CÓCÓRÓCÓCÓ!', it.x, it.y - 40, '#ffd23f', true);
      zeSfx('galo');
    }
    if (it.stood > 0 && (it.stood -= dt) <= 0) {
      // …and is the golden galo, floating down
      Object.assign(it, { kind: 'gold', e: '🐓', pts: 100, say: 'O MILAGRE DO GALO!', vy: 40, g: 30, rot: 0 });
      zeBits(g, it.x, it.y, ['#ffd23f', '#fff3c4', '#feae34'], 16);
    }
    if (it.kind === 'veg' && foot && zeTouch(it, foot, 22)) {
      // WATAAA: out of the sky — or, one kick in six, its other name
      Object.assign(it, {
        out: true,
        vx: g.f * (420 + Math.random() * 220),
        vy: -360 - Math.random() * 120,
        spin: g.f * 14,
        g: 900,
      });
      if (it.from === 'avo' && g.avo && !g.avo.leaving) zeAvoBack(it); // hers go back to her
      zeWord(g, Math.random() < 1 / 6 ? 'KRAV MAGA!' : 'WATAAA!', it.x, it.y - 20, '#ffd23f', true);
      zeChunks(g, it.x, it.y, 'veg', 12);
      zeSfx('smash');
      zeHold(g, 0.07);
      zeBump(g, 'alignment');
      g.nun = Math.min(ZE_NUN, g.nun + 1);
      zeCount(g, 'kicked', 100, 'cem');
      zeScore(g, 5);
      continue;
    }
    if (it.kind === 'peixe' && (zeTouch(it, mouth, 30) || it.y >= ZE_FLOOR - 30)) {
      // the board's fish is let go, not eaten: it swims off
      const caught = it.y < ZE_FLOOR - 30;
      Object.assign(it, { out: true, vx: (it.x < ZE_W / 2 ? 1 : -1) * 260, vy: -160, g: -60, spin: 0, rot: 0 });
      if (caught) {
        zeWord(g, 'LET GO! +100', it.x, it.y - 30, '#7ef0ff', true);
        zeBits(g, it.x, it.y, ['#7ef0ff', '#fff3c4', '#5b8ff0'], 12);
        zeSfx('combo');
        zeScore(g, 100);
        zeTrophy(g, 'peixe');
      }
      continue;
    }
    const green = it.kind === 'veg' && !g.dragon; // a green while he still blinks from the last one passes him by
    if (green && !it.shaved && !g.hurt && !g.dash && !g.ride && zeTouch(it, body, ZE_SHAVE)) it.shaved = true; // that close: if it lands without touching him, RASPÃO
    if (!(green && (g.hurt > 0 || g.dash > 0)) && zeTouch(it, green ? body : mouth)) {
      it.dead = true;
      zeEat(g, it);
      if (g.phase !== 'play') return;
      continue;
    }
    if (it.y >= ZE_FLOOR - 8) {
      it.dead = true;
      zeChunks(g, it.x, ZE_FLOOR - 4, it.kind === 'veg' || it.kind === 'fish' ? it.kind : 'meat', 3);
      if (it.shaved && it.kind === 'veg' && !g.dragon) {
        zeWord(g, 'RASPÃO! +5', it.x, ZE_FLOOR - 44, '#9be15d', true);
        zeSfx('peck');
        zeScore(g, 5);
        g.nun = Math.min(ZE_NUN, g.nun + 0.34);
      }
      if (it.kind === 'meat' && !g.dragon) {
        if (g.streak >= 5) zeWord(g, 'wasted!', it.x, ZE_FLOOR - 30, '#d9c7e8');
        g.streak = 0;
        g.mult = 1;
      } // a miss lets the combo go
    }
  }
  g.items = g.items.filter(it => !it.dead);
  // the mouth opens as food comes: something falling close above his head
  const hx = g.x + g.f * 2 * k,
    hy = g.y - 134 * k;
  g.gape =
    g.power?.kind === 'francesinha' ||
    g.items.some(it => !it.out && Math.abs(it.x - hx) < 50 * k && hy - it.y < 110 * k && hy - it.y > -10);
}
