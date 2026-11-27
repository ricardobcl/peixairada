// ---- the round: Zé, what falls, and what they do to each other
/** Today's lunch (T2, 2026-10-30, the next round): the dishes the board read from the day's menus (state.lunch) fall now
 *  and then under their real names, their place beside them — soups and salads as greens, fish as fish, a vegetarian
 *  dish as a green, the rest as golden specials, thirty points; desserts and bread left out. */
function zeLunch() {
  const lunch = state.lunch;

  if (!lunch?.on) return [];
  return (lunch.places || [])
    .filter(place => place.state !== 'closed')
    .flatMap(place =>
      (place.dishes || []).flatMap(dish => {
        const it = { dish, place: place.name, say: dish, special: true };

        if (
          /^(p[aã]o|entrada|sobremesa)|brownie|bolo|mousse|pudim|gelado|fruta|tarte|arroz doce|leite creme/i.test(dish)
        ) {
          return [];
        }

        if (/^(sopa|creme|caldo)|salada/i.test(dish)) {
          return [{ ...it, kind: 'veg', e: /salada/i.test(dish) ? '🥗' : '🥣', say: `${dish.toUpperCase()}!` }];
        }

        if (
          /bacalhau|peixe|polvo|lula|salm[aã]o|pescada|dourada|robalo|sardinh|atum|camar|marisco|choco|truta/i.test(
            dish,
          )
        ) {
          return [{ ...it, kind: 'fish', e: '🐟', pts: 5 }];
        }

        if (/legumes|vegetarian|vegan|tofu|grão|espinafre|cogumelo/i.test(dish)) {
          return [{ ...it, kind: 'veg', e: '🥗', say: `${dish.toUpperCase()}!` }];
        }

        const emoji = /frango|galinha|pato|peru/i.test(dish)
          ? '🍗'
          : /bife|vitela|novilho|vaca|carne/i.test(dish)
            ? '🥩'
            : /porco|rojõ|costel|entrecosto|leit[aã]o|febras/i.test(dish)
              ? '🍖'
              : /massa|esparguete|lasanha|bolonhesa/i.test(dish)
                ? '🍝'
                : /arroz/i.test(dish)
                  ? '🍛'
                  : '🍲';

        return [{ ...it, kind: 'meat', e: emoji, pts: 30 }];
      }),
    );
}

/** The day's round (2026-10-30, the next round): what falls is the date's — the same for everyone today, a way to play
 *  each —, from a generator seeded by the day (zeSeed); every drop takes ZE_DRAWS numbers of it whatever it uses, so
 *  the round you play does not change what falls next. The demo on the title, and the bits and words, take chance's. */
const ZE_DRAWS = 16;

const zeToday = () => {
  const date = new Date();

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

function zeSeed(text) {
  let hash = 2166136261;

  for (const ch of text) hash = Math.imul(hash ^ ch.codePointAt(0), 16777619); // FNV-1a, then mulberry32

  return () => {
    hash = (hash + 0x6d2b79f5) | 0;
    let mixed = Math.imul(hash ^ (hash >>> 15), 1 | hash);

    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

/** Is the next one green? A chance that grows with the level — or HARDCORE's bag, five meats and forty-five greens. */
function zeGreen(game, roll) {
  const difficulty = zeDiff();

  if (!difficulty.bag) {
    const [base, up, max] = difficulty.veg;

    return roll < Math.min(max, base + (game.level - 1) * up);
  }

  if (!game.bag.length) {
    game.bag = Array.from({ length: difficulty.bag[1] }, (_, index) => index >= difficulty.bag[0]);

    for (let index = game.bag.length - 1; index > 0; index--) {
      const other = (game.bagRnd() * (index + 1)) | 0;

      [game.bag[index], game.bag[other]] = [game.bag[other], game.bag[index]];
    }
  }

  return game.bag.pop();
}

/** One thing falls, as the day's numbers say; the jitter of the wait for the next is the drop's too, returned. */
function zeDrop(game) {
  const difficulty = zeDiff();
  const rolls = Array.from({ length: ZE_DRAWS }, game.rnd);
  const at = (list, index) => list[(rolls[index] * list.length) | 0];

  const veg = game.dragon ? rolls[0] < 0.5 : zeGreen(game, rolls[0]);
  const galo = !veg && !game.dragon && game.mass < ZE_MASS_MAX - 1 && rolls[1] < 0.035;

  const spy = !veg && !galo && !game.dragon && !game.cased && game.level >= 2 && rolls[2] < 0.03; // the briefcase: once a round, from level 2
  let it;

  if (spy) {
    it = { kind: 'case', e: '💼', pts: 100, say: 'CLASSIFIED' };
    game.cased = true;
  } else if (galo) it = { kind: 'galo', e: '🐓', pts: 50, say: 'GALO! +2 muscle' };
  else if (!game.dragon && game.lunch.length && rolls[15] < 0.07) {
    it = { ...at(game.lunch, 3) };
  } // today's lunch
  else if (veg) {
    const [emoji, say] = at(ZE_VEG, 3);

    it = { kind: 'veg', e: emoji, say };
  } else if (
    !game.dragon &&
    !game.power &&
    game.t > 12 &&
    !game.items.some(item => item.kind === 'power') &&
    rolls[4] < 0.03
  ) {
    it = { kind: 'power', p: at(Object.keys(ZE_POWERS), 3), e: '', pts: 25 };
  } else if (!game.dragon && !game.items.some(item => item.kind === 'peixe') && rolls[5] < 0.008) {
    it = { kind: 'peixe', e: '', pts: 100, say: 'LET GO!' };
  } // the board's own fish, now and then
  else if (!game.dragon && !difficulty.bag && rolls[6] < 0.09) {
    const [emoji, say, tint] = at(ZE_FISH, 3);

    it = { kind: 'fish', e: emoji, say, tint, pts: 5 };
  } else {
    const [emoji, pts, say] = at(ZE_MEAT, 3);

    it = { kind: 'meat', e: emoji, pts, say };
  }

  // Barcelos' miracle (2026-10-30, the next round): now and then a chicken that falls stands up, crows, and is the
  // golden galo — the roast cock on the judge's plate that stood up and crowed, and saved the pilgrim
  if (it.e === '🍗' && !game.dragon && !game.items.some(item => item.miracle) && rolls[7] < 0.06) {
    it.miracle = 240 + rolls[8] * 220;
  }

  const drift = game.level >= difficulty.drift ? Math.min(110, (game.level - difficulty.drift + 1) * 22) : 20;
  const fall = (game.dragon ? 1 : difficulty.speed) * ZE_FALL; // past its level, food drifts — off the walls

  game.items.push(
    Object.assign(it, {
      x: 30 + rolls[9] * (ZE_W - 60),
      y: -24,
      vx: (rolls[10] * 2 - 1) * drift,
      vy: (60 + game.level * 18 + rolls[11] * 50) * fall,
      g: (110 + game.level * 16) * fall * (it.kind === 'peixe' ? 0.35 : 1),
      rot: rolls[12] * 6,
      spin: (rolls[13] - 0.5) * 4,
    }),
  ); // the board's fish swims down slowly

  return rolls[14];
}

const zeTouch = (it, box, radius = 16) => {
  const nearX = Math.max(box.l, Math.min(it.x, box.r));
  const nearY = Math.max(box.t, Math.min(it.y, box.b));

  return (it.x - nearX) ** 2 + (it.y - nearY) ** 2 < radius * radius;
};

const zeWord = (game, text, atX, atY, color, big = false) =>
  !game.demo && game.words.push({ s: text, x: Math.max(110, Math.min(ZE_W - 110, atX)), y: atY, c: color, big, t: 0 });

function zeBits(game, atX, atY, cs, count) {
  for (let index = 0; index < count; index++) {
    game.bits.push({
      x: atX,
      y: atY,
      vx: (Math.random() - 0.5) * 320,
      vy: -120 - Math.random() * 260,
      t: 0,
      life: 0.5 + Math.random() * 0.4,
      c: zePick(cs),
      r: 2 + Math.random() * 3,
    });
  }
}

/** What flies off is what was hit (2026-10-30, the next round): bits of meat and a bone from a bite, leaves from a green —
 *  turning as they fly, where confetti was. */
function zeChunks(game, atX, atY, kind, count) {
  const cs =
    kind === 'veg'
      ? ['#2f7a2c', '#4fa03c', '#9ad26a', '#5cbf4a']
      : kind === 'fish'
        ? ['#c9d2e0', '#8a9bb0', '#e8eef5', '#6f7f95']
        : ['#7a3018', '#b0603a', '#e8a0a0', '#d8843a'];

  for (let index = 0; index < count; index++) {
    game.bits.push({
      x: atX,
      y: atY,
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
  }

  if (kind !== 'veg') {
    game.bits.push({
      x: atX,
      y: atY,
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
    });
  } // a bone, a fishbone
}

const zeBanner = (game, text, sub = '', cs = ['#ffd23f', '#a6dc5a'], seconds = 1.6) => {
  game.banner = { s: text, sub, cs, t: seconds };
};

/** The dragon's size: 1, twice it in its time — growing and shrinking in four steps, as a sprite would. */
function zeK(game) {
  if (!game.dragon) return 1;
  const el = ZE_DRAGON - game.dragon;

  return el < ZE_DRAGON_IN
    ? 1 + Math.floor((el / ZE_DRAGON_IN) * 4) / 4
    : game.dragon < ZE_DRAGON_OUT
      ? 1 + Math.ceil((game.dragon / ZE_DRAGON_OUT) * 4) / 4
      : 2;
}

const zeSz = game => (0.84 + Math.max(0, game.mass) * 0.03) * zeK(game); // his size: his bulk's, and the dragon's
const zeTw = game => 9 + Math.max(0, game.mass) * 1.6; // his half-width at the shoulders

const zeDark = game =>
  game.dragon ? Math.min(1, (ZE_DRAGON - game.dragon) / ZE_DRAGON_IN, game.dragon / ZE_DRAGON_OUT) : 0; // the sky's turn, 0 to 1

function zeScore(game, points) {
  game.score += points;
  if (game.dragon || game.avo || game.score < game.next) return;
  game.level++;
  game.next += zeDiff().step * (1 + (game.level - 2) * ZE_PACE.up);

  if (game.level === ZE_DRAGON_LEVEL) zeDragon(game, true);
  else if (game.level % ZE_AVO_EVERY === 0) zeAvo(game);
  else {
    zeBanner(
      game,
      `LEVEL ${game.level}!`,
      game.level % ZE_PACE.bite === 1 ? `THE GREENS BITE ${zeBite(game)} NOW` : '',
    );

    zeSfx('level');
    zeFireworks(game);
  }
}

/** Festa das Cruzes (B3, 2026-11-01): three rockets at a level-up, over the river and in it. None under reduced motion. */
const ZE_FW = ['#ffd23f', '#ff5a64', '#7ef0ff', '#9be15d', '#ff9ad5', '#fff3c4'];
const ZE_FW_N = 56;
const ZE_FW_LIFE = 1.6;

function zeFireworks(game) {
  if (zeCalm()) return;

  for (let index = 0; index < 3; index++) {
    game.fw.push({
      x: 90 + Math.random() * 540,
      y: 120 + Math.random() * 300,
      t: -index * 0.28,
      c: zePick(ZE_FW),
      a0: Math.random() * 6.3,
      R: 80 + Math.random() * 50,
    });
  }

  zeSfx('boom');
}

/** Where each spark of a rocket is at its age: out quickly, then falling. fn(x, y, fade). */
function zeFwEach(game, fn) {
  for (const rocket of game.fw) {
    if (rocket.t < 0) {
      fn(rocket.x, rocket.y - rocket.t * 900, 1, rocket, true);
      continue;
    } // going up

    for (const [back, dim] of [
      [0, 1],
      [0.05, 0.55],
      [0.1, 0.28],
    ]) {
      // each spark and its tail
      const age = rocket.t - back;

      if (age < 0) continue;

      const out = rocket.R * (1 - Math.exp(-3.4 * age));
      const down = 70 * age * age;
      const fade = (1 - rocket.t / ZE_FW_LIFE) * dim;

      for (let index = 0; index < ZE_FW_N; index++) {
        const angle = rocket.a0 + (index / ZE_FW_N) * 6.283;
        const spread = 0.62 + (index % 4) * 0.14;

        fn(
          rocket.x + Math.cos(angle) * out * spread,
          rocket.y + Math.sin(angle) * out * spread + down,
          fade,
          rocket,
          false,
        );
      }
    }
  }
}

function zeDragon(game, on) {
  game.streak = 0;
  game.mult = 1;

  if (on) {
    if (game.ride) zeLeave(game);
    Object.assign(game, { dragon: ZE_DRAGON, hurt: 0, shake: 0.9, flash: 0.3, lightT: 1.4 });
    zeBanner(game, 'ENTER THE DRAGON!', 'MODO FERA — EAT EVERYTHING', ['#ff7a2a', '#ffd23f'], 2.4);
    zeSfx('transform');
    zeTrack('dragon');
    if (zeDiff().id === 'hardcore') zeTrophy(game, 'fera');
    return;
  }

  Object.assign(game, {
    dragon: 0,
    bolt: null,
    spawn: 1.2,
    level: ZE_DRAGON_LEVEL + 1,
    next: game.score + zeDiff().step,
  });

  game.flames.length = 0;
  for (const it of game.items) if (!it.out) zeBits(game, it.x, it.y, ['#ffd23f', '#ff7a2a', '#e43b44'], 5); // what is left of the feast goes up in smoke
  game.items = game.items.filter(it => it.out);
  zeBanner(game, `LEVEL ${game.level}!`, 'BACK TO NORMAL', ['#ffd23f', '#a6dc5a'], 2.2);
  zeSfx('detransform');
  zeTrack('band');
}

/** The Avó da Horta comes to her window: the house rises behind Trota's, the food stops, and she throws couves —
 *  three in a fan, five rained from above, one straight at him —, saying so. */
function zeAvo(game) {
  if (game.ride) zeLeave(game);

  game.avo = {
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

  game.items = game.items.filter(it => it.out);
  zeBanner(game, 'AVÓ DA HORTA!', 'KICK THREE OF HER COUVES BACK AT HER', ['#9be15d', '#ffd23f'], 2.4);
  zeSfx('transform');
}

function zeAvoStep(game, dt) {
  const avo = game.avo;

  avo.t += dt;
  avo.arm = Math.max(0, avo.arm - dt);
  avo.hit = Math.max(0, avo.hit - dt);
  avo.sayT = Math.max(0, avo.sayT - dt);
  avo.rise = avo.leaving ? Math.max(0, avo.rise - dt / 0.9) : Math.min(1, avo.rise + dt / 0.9);

  if (avo.leaving) {
    if (!avo.rise) game.avo = null;
    return;
  }

  if (avo.t > ZE_AVO_T) {
    avo.leaving = true;
    avo.say = 'Amanhã há mais!';
    avo.sayT = 2;
    return;
  } // she gives up for today

  if (avo.rise < 1 || (avo.next -= dt) > 0) return;

  const pattern = avo.n++ % 3;
  const from = { x: ZE_AVO.x - 18, y: ZE_AVO.y + 20 };

  const couve = (atX, atY, vx, vy, gr = 260) =>
    game.items.push({
      kind: 'veg',
      e: '🥬',
      say: 'COME A SOPA!',
      from: 'avo',
      x: atX,
      y: atY,
      vx,
      vy,
      g: gr,
      rot: 0,
      spin: (Math.random() - 0.5) * 6,
    });

  if (pattern === 0) {
    for (const side of [-1, 0, 1]) couve(from.x, from.y, (game.x - from.x) * 0.9 + side * 170, -260);
  } // a fan
  else if (pattern === 1) {
    for (let index = 0; index < 5; index++) couve(70 + index * 145, -30 - index * 40, 0, 60, 200);
  } // rained from above
  else {
    const FLIGHT = 0.9;

    couve(from.x, from.y, (game.x - from.x) / FLIGHT, (game.y - 100 - from.y) / FLIGHT - 150 * FLIGHT, 300);
  } // straight at him

  avo.arm = 0.35;
  avo.next = 2.2 - Math.min(0.8, game.level * 0.05);

  if (Math.random() < 0.5) {
    avo.say = zePick(ZE_AVO_SAYS);
    avo.sayT = 1.8;
  }

  zeSfx('whoosh');
}

/** One of her couves kicked back: aimed at her window, on a high arc. */
function zeAvoBack(it) {
  const FLIGHT = 0.6;
  const gr = 900;

  Object.assign(it, {
    back: true,
    vx: (ZE_AVO.x - it.x) / FLIGHT,
    vy: (ZE_AVO.y - it.y) / FLIGHT - (gr * FLIGHT) / 2,
    g: gr,
    spin: 14,
  });
}

function zeAvoHit(game, it) {
  const avo = game.avo;

  it.dead = true;
  avo.hp--;
  avo.hit = 0.4;
  game.shake = Math.max(game.shake, 0.2);
  zeChunks(game, ZE_AVO.x, ZE_AVO.y, 'veg', 14);
  zeWord(game, avo.hp ? 'AI!' : 'AI, ESTE MENINO!', ZE_AVO.x - 60, ZE_AVO.y - 60, '#9be15d', true);
  zeSfx('smash');
  zeHold(game, 0.1, !avo.hp);
  if (avo.hp) return;
  Object.assign(avo, { leaving: true, won: true, say: 'Pronto, come o que quiseres!', sayT: 2.2 });
  zeBanner(game, 'A AVÓ DESISTE!', '+300 · EAT WHAT YOU LIKE', ['#ffd23f', '#9be15d'], 2.4);
  zeSfx('level');
  zeScore(game, 300);
  zeTrophy(game, 'avo');
}

function zeStrike(game) {
  // lightning, while the dragon is out
  let boltX = 60 + Math.random() * (ZE_W - 120);
  let boltY = 20;

  const pts = [[boltX, boltY]];

  while (boltY < 560) {
    boltY += 20 + Math.random() * 34;
    boltX += (Math.random() - 0.5) * 70;
    pts.push([boltX, boltY]);
  }

  game.bolt = { pts, t: 0.28 };
  game.flash = 0.14;
  game.shake = Math.max(game.shake, 0.2);
  zeSfx('thunder');
}

/** A car comes for him: the Focus (YALLA — quick) or the A-Class (the punishment — slow), ZE_RIDE s; one there goes. */
function zeRide(game, kind) {
  if (game.dragon || game.avo || (game.phase !== 'play' && !game.demo)) return; // no car while the dragon or the avó is out: space kicks
  if (game.ride) zeLeave(game);

  Object.assign(game, {
    ride: { kind, t: ZE_RIDE, tilt: 0, vx: game.vx, wheel: 0 },
    kick: 0,
    vy: 0,
    y: ZE_FLOOR,
    gy: ZE_FLOOR,
  });

  zeBits(game, game.x, ZE_FLOOR - 20, ['#d9c7e8', '#ffffff', '#9aa0a8'], 14);
  if (kind === 'focus') zeBanner(game, 'FORD FOCUS!', 'YALLA — FIVE SECONDS OF SPEED', ['#5b8ff0', '#ffd23f'], 2.2);
  else zeBanner(game, 'MERCEDES A-CLASS…', 'THE PUNISHMENT — FIVE SLOW SECONDS', ['#c8ccd2', '#ff5a64'], 2.2);
  zeSfx(kind);
  zeEngine(kind);
  zeMode(kind);
  zeBump(game, 'levelChange');
}

const zeFast = game => game.dash > 0 || (game.ride?.kind === 'focus' && Math.abs(game.vx) > 260); // quick enough to leave afterimages

/** …and goes off on its own: the Focus at speed, the A-Class over onto its roof first, as at the moose test. */
function zeLeave(game) {
  const ride = game.ride;

  if (!ride) return;
  game.leaving = { kind: ride.kind, x: game.x, f: game.f, t: 0, wheel: ride.wheel, flip: 0 };

  if (ride.kind === 'aclass') {
    zeWord(game, 'FAILED THE MOOSE TEST!', game.x, ZE_FLOOR - 150, '#c8ccd2', true);
    if (game.mass >= ZE_MASS_MAX && game.phase === 'play') zeTrophy(game, 'moose');
  }

  game.ride = null;
  zeEngine(null);
  zeMode(null);
}

/** Bigger by amount, to his full bulk — reached from below, MONSTRO! (2026-10-30, the next round): the gym's word for it, a
 *  flex under a spotlight (game.flex), once in a while at most. */
function zeGrow(game, amount) {
  const was = game.mass;

  Object.assign(game, { mass: Math.min(ZE_MASS_MAX, game.mass + amount), pump: 0.3 });
  if (was >= ZE_MASS_MAX || game.mass < ZE_MASS_MAX || game.dragon || game.t - game.monAt < 8) return;
  game.monAt = game.t;
  game.flex = 1.4;
  zeHold(game, 0.1);
  zeBanner(game, 'MONSTRO!', "FULL BULK — THE GYM'S WORD FOR IT", ['#ffd23f', '#ff7a2a'], 1.6);
  zeSfx('monstro');
  zeTrophy(game, 'monstro');
}

/** What meets him: meat (or anything at all, the dragon's) is eaten and makes him bigger, the combo growing every five
 *  in a row and a Focus coming every three; a green takes some of him — three in a row, the A-Class; none left, the
 *  K.O.; the rooster is muscle; the briefcase, AGENT ZÉ. */
function zeEat(game, it) {
  const scale = zeSz(game);
  const mx = game.x + game.f * 4 * scale;
  const my = game.y - 110 * scale;

  if (it.kind === 'case') {
    game.agent = true;
    zeBanner(game, 'AGENT ZÉ', 'ON LOAN TO THE MOSSAD · סודי ביותר', ['#e8e8e8', '#5b8ff0'], 2.6);
    zeBits(game, mx, my, ['#e8e8e8', '#5b8ff0', '#0e0c12'], 12);
    zeSfx('spy');
    zeCount(game, 'agents', 3, 'agent');
    return zeScore(game, it.pts);
  }

  if (it.kind === 'gold') {
    zeGrow(game, 2);
    game.gold = 0.5;
    zeBanner(game, 'O MILAGRE DO GALO!', '+100 · THE ROAST COCK STOOD UP AND CROWED', ['#ffd23f', '#fff3c4'], 2.2);
    zeBits(game, it.x, it.y, ['#ffd23f', '#fff3c4', '#feae34'], 22);
    zeSfx('galo');
    zeSfx('level');
    zeTrophy(game, 'milagre');
    return zeScore(game, it.pts);
  }

  if (it.kind === 'power') {
    // a power-up, ZE_POWER_T s: the francesinha fills him at once
    const power = ZE_POWERS[it.p];

    game.power = { kind: it.p, t: ZE_POWER_T };
    if (it.p === 'francesinha') zeGrow(game, ZE_MASS_MAX);
    zeBanner(game, power.name, power.say, [power.c, '#fff3c4'], 1.8);
    zeBits(game, it.x, it.y, [power.c, '#fff3c4', '#ffd23f'], 14);
    zeSfx('level');
    zeHold(game, 0.08);
    return zeScore(game, it.pts);
  }

  if (it.kind === 'fish') {
    // neither meat nor green: five, no bulk, the streak as it was
    zeWord(game, `+5 ${it.say}`, it.x, it.y - 24, '#c9e4ff');
    zeChunks(game, mx, my, 'fish', 7);
    zeSfx('chomp');
    zeHold(game, 0.05);
    return zeScore(game, 5);
  }

  if (it.kind === 'galo') {
    zeGrow(game, 2);
    zeWord(game, it.say, it.x, it.y - 24, '#ffd23f', true);
    zeBits(game, it.x, it.y, ['#ffd23f', '#e8322f', '#2b5cb8'], 14);
    zeSfx('galo');
    return zeScore(game, it.pts);
  }

  if (it.kind === 'veg' && !game.dragon) {
    Object.assign(game, {
      mass: game.mass - zeBite(game),
      streak: 0,
      mult: 1,
      hurt: 1.4,
      red: 0.2,
      shake: 0.35,
      pump: -0.3,
      greens: game.greens + 1,
    });

    zeWord(game, it.say, it.x, it.y - 24, '#9be15d', true);
    zeChunks(game, it.x, it.y, 'veg', 10);
    zeSfx('bleh');
    if (game.demo) {
      game.mass = Math.max(game.mass, 3);
    } // the demo never ends
    else if (game.mass <= 0) return zeOver(game);

    if (game.greens >= 3) {
      game.greens = 0;
      zeRide(game, 'aclass');
    }

    return;
  }

  game.streak++;
  game.greens = 0;

  if (it.kind === 'meat') {
    zeGrow(game, 1);
    if (it.e === '🌭' && ++game.chouricos >= 10) zeTrophy(game, 'chourico');
  }

  const mult = 1 + Math.min(3, Math.floor(game.streak / 5));
  const up = mult > game.mult;
  const pts = (it.kind === 'veg' ? 10 : it.pts) * mult;

  game.mult = mult;
  game.chomp = 0.3;
  zeSquash(game, 'chew', 0.14);
  if (game.dragon) game.shake = Math.max(game.shake, 0.08);

  if (up) {
    zeWord(game, `COMBO ×${mult}!`, mx, my - 70 * scale, '#feae34', true);
    zeSfx('combo');
    zeHold(game, 0.12, true);
    if (mult >= 4) zeTrophy(game, 'combo');
  } else {
    zeSfx(game.dragon ? 'chompBig' : 'chomp');
    if (!game.dragon) zeHold(game, 0.05);
  } // the dragon's feast does not stop for each bite

  zeWord(
    game,
    `+${pts}${it.kind === 'meat' ? ` ${it.say}` : ''}`,
    it.x,
    it.y - 24,
    it.kind === 'veg' ? '#ff7a2a' : it.special ? '#ffd23f' : '#fff3c4',
  );

  if (it.place) zeWord(game, it.place, it.x, it.y - 2, '#d9c7e8');
  zeChunks(game, mx, my, it.kind === 'veg' ? 'veg' : 'meat', game.dragon ? 12 : 7);
  zeScore(game, pts);

  if (
    it.kind === 'meat' &&
    game.streak % ZE_FOCUS_ROW === 0 &&
    game.ride?.kind !== 'focus' &&
    game.t - game.focusAt >= ZE_FOCUS_GAP
  ) {
    game.focusAt = game.t;
    zeRide(game, 'focus');
  } // an event (2026-11-01): he was in it for up to 46 % of a round, and in a car he cannot kick
}

function zeStep(dt) {
  const game = ze.g;

  if (game.freeze > 0) {
    game.freeze = Math.max(0, game.freeze - dt);
    return;
  } // a hit-stop: everything holds

  game.t += dt;

  for (const word of game.words) {
    word.t += dt;
    word.y -= 36 * dt;
  }

  game.words = game.words.filter(word => word.t < 1.1);

  for (const bit of game.bits) {
    bit.t += dt;
    bit.vy += 900 * dt;
    bit.x += bit.vx * dt;
    bit.y += bit.vy * dt;
    if (bit.spin) bit.rot += bit.spin * dt;
  }

  game.bits = game.bits.filter(bit => bit.t < bit.life);

  for (const flame of game.flames) {
    flame.t += dt;
    flame.x += flame.vx * dt;
    flame.y += flame.vy * dt;
  }

  game.flames = game.flames.filter(flame => flame.t < flame.life);

  for (const field of ['shake', 'chomp', 'kick', 'flash', 'red', 'punch', 'flex', 'gold', 'sweep']) {
    game[field] = Math.max(0, game[field] - dt);
  }

  game.pump -= Math.sign(game.pump) * Math.min(Math.abs(game.pump), dt); // a pump or a sag, easing back
  if (game.sq && (game.sq.t -= dt) <= 0) game.sq = null;
  if (game.banner && (game.banner.t -= dt) <= 0) game.banner = null;
  if (game.trophy && (game.trophy.t -= dt) <= 0) game.trophy = null;
  if (game.bolt && (game.bolt.t -= dt) <= 0) game.bolt = null;
  const leaving = game.leaving;

  if (leaving) {
    leaving.t += dt;

    if (leaving.kind === 'aclass' && leaving.t < 0.6) {
      leaving.flip = (Math.PI * leaving.t) / 0.6;
    } // over it goes, then slides off on its roof
    else {
      leaving.x += leaving.f * (leaving.kind === 'focus' ? 640 : 320) * dt;
      leaving.wheel += (leaving.f * (leaving.kind === 'focus' ? 640 : 0) * dt) / 17;
    }

    if (leaving.x < -220 || leaving.x > ZE_W + 220) game.leaving = null;
  }

  if (game.phase === 'over' && game.koT >= ZE_KO_T) game.overT += dt;
  for (const rocket of game.fw) rocket.t += dt;
  game.fw = game.fw.filter(rocket => rocket.t < ZE_FW_LIFE);

  if (game.phase === 'title' && (game.cardT += dt) >= ZE_CARD_T) {
    game.card++;
    game.cardT = 0;
  } // the rules turn while the demo plays

  if (game.stamp) game.stamp = Math.max(0, game.stamp - dt * 6);
  if (game.phase !== 'play' && !game.demo) return;

  const difficulty = zeDiff();
  const scale = zeSz(game);
  const car = game.ride && ZE_CARS[game.ride.kind];

  // Zé: runs where the keys or the pointer say — quicker each level, as the dragon, in the Focus; slower in the A-Class
  const aim = ze.aim == null || Math.abs(ze.aim - game.x) < 10 ? 0 : Math.sign(ze.aim - game.x);
  const want = game.demo ? zeBot(game) : ze.keys.r - ze.keys.l || aim;

  game.vx +=
    (want * (380 + Math.min(game.level - 1, ZE_PACE.cap) * 12) * (game.dragon ? 1.15 : 1) * (car ? car.speed : 1) -
      game.vx) *
    Math.min(1, dt * (car ? 6 : 12)); // a car takes its time

  if (want) game.f = want;
  game.dashCool = Math.max(0, game.dashCool - dt);

  if (game.dash > 0) {
    game.dash = Math.max(0, game.dash - dt);
    game.vx = game.dashF * 1150;
    game.f = game.dashF;
  }

  const half = car ? 100 : 28 * scale;

  game.x = Math.max(half, Math.min(ZE_W - half, game.x + game.vx * dt));

  // what he stands on: the floor, or the awning or the sign come down on from above (G4, 2026-10-30, the next round)
  const wasY = game.y;
  const gy = game.drop > 1e-6 || game.ride || game.vy < 0 ? ZE_FLOOR : zePlatform(game.x, wasY);
  const aloft = wasY < gy - 0.5;

  game.drop = Math.max(0, game.drop - dt);
  game.vy += 1500 * dt;
  game.y += game.vy * dt;

  if (game.y >= gy) {
    if (aloft && game.vy > 200) zeSquash(game, 'land', 0.2);
    game.y = gy;
    game.vy = 0;
    game.jumps = 0;
    if (gy === ZE_PLATS[1].y) zeTrophy(game, 'telhado');
    if (game.jumpBuf > 0) zeJump(game);
  }

  game.gy = game.vy < 0 ? ZE_FLOOR : zePlatform(game.x, game.y);
  game.jumpBuf = Math.max(0, game.jumpBuf - dt);
  game.coyote = game.y >= game.gy - 0.5 ? ZE_COYOTE : game.vy < 0 || game.drop > 0 ? 0 : Math.max(0, game.coyote - dt);

  if (game.kickBuf > 0) {
    game.kickBuf = Math.max(0, game.kickBuf - dt);

    if (game.cool <= 0 && game.kickBuf > 0) {
      game.kickBuf = 0;
      zeKick(game);
    }
  }

  game.run += Math.abs(game.vx) * dt * 0.05;
  game.cool = Math.max(0, game.cool - dt);
  game.hurt = Math.max(0, game.hurt - dt);

  if (game.ride) {
    // the car: its wheels, its pitch as it pulls away or brakes (the A-Class's the more), its engine, its time
    const ride = game.ride;

    const pitch =
      Math.max(-0.3, Math.min(0.3, (-(game.vx - ride.vx) / Math.max(dt, 0.001)) * 0.00012)) *
      (ride.kind === 'aclass' ? 1.6 : 0.5);

    ride.tilt += (pitch * game.f - ride.tilt) * Math.min(1, dt * 8);
    ride.vx = game.vx;
    ride.wheel += (game.vx * dt) / 17;
    zeRev(Math.abs(game.vx));
    if ((ride.t -= dt) <= 0) zeLeave(game);
  }

  // the Focus leaves afterimages of him and itself behind, the A-Class black smoke (2026-10-30, the next round)
  if ((game.trailT -= dt) <= 0) {
    game.trailT = 0.035;
    if (zeFast(game)) {
      game.trail.unshift({ x: game.x, y: game.y });
      game.trail.length = Math.min(game.trail.length, 6);
    } else game.trail.length = 0;
  }

  if (game.ride?.kind === 'aclass' && (game.smokeT -= dt) <= 0) {
    game.smokeT = 0.07 + Math.random() * 0.05;

    game.smoke.push({
      x: game.x - game.f * 74,
      y: ZE_FLOOR - 24,
      vx: -game.f * (30 + Math.random() * 40) + game.vx * 0.3,
      vy: -18 - Math.random() * 30,
      r: 5 + Math.random() * 3,
      t: 0,
      life: 1 + Math.random() * 0.4,
    });
  }

  for (const puff of game.smoke) {
    puff.t += dt;
    puff.x += puff.vx * dt;
    puff.y += puff.vy * dt;
    puff.r += 16 * dt;
  }

  game.smoke = game.smoke.filter(puff => puff.t < puff.life);
  game.spawn -= game.power?.kind === 'vinho' ? dt * 0.45 : dt;
  if (game.power && (game.power.t -= dt) <= 0) game.power = null;
  if (game.galo) zeGaloStep(game, dt);

  if (game.avo) zeAvoStep(game, dt);
  else if (game.dragon) {
    game.dragon = Math.max(0, game.dragon - dt);
    const el = ZE_DRAGON - game.dragon;

    if (game.spawn <= 0 && el > ZE_DRAGON_IN && game.dragon > ZE_DRAGON_OUT + 0.8) {
      game.spawn = 0.16 + zeDrop(game) * 0.12;
    } // a feast, while he is big

    if ((game.lightT -= dt) <= 0) {
      zeStrike(game);
      game.lightT = 1.3 + Math.random() * 2;
    }

    for (let index = 0, count = (dt * 110 + Math.random()) | 0; index < count; index++)
    // the fire round him
    {
      game.flames.push({
        x: game.x + (Math.random() * 2 - 1) * (zeTw(game) + 16) * scale,
        y: game.y - Math.random() * 160 * scale,
        vx: (Math.random() - 0.5) * 30,
        vy: -(60 + Math.random() * 120),
        t: 0,
        life: 0.35 + Math.random() * 0.3,
        s: Math.random() < 0.5 ? 5 : 7,
      });
    }

    if (!game.dragon) zeDragon(game, false);
  } else {
    if (game.spawn <= 0) {
      game.spawn = Math.max(0.3, 1.05 - (game.level - 1) * 0.07) * difficulty.spawn * (0.75 + zeDrop(game) * 0.5);
    }

    if (ZE_SKIES[zeSkyOf(game)].bolt && (game.lightT -= dt) <= 0) {
      zeStrike(game);
      game.lightT = 2.5 + Math.random() * 3;
    } // the storm's, round again with no dragon
  }

  // what falls meets his foot, then his mouth (meat) or him (a green) — broader as he is —, then the floor
  const pw = game.power?.kind;
  const idt = pw === 'vinho' ? dt * 0.45 : dt; // the vinho verde's slow motion: what falls, not him

  const air = game.y < game.gy - 0.5;
  const reach = game.dragon ? 1.4 : difficulty.reach * (pw === 'francesinha' ? 1.9 : 1);
  const halfWidth = (zeTw(game) + 6) * scale;
  const body = { l: game.x - halfWidth, r: game.x + halfWidth, t: game.y - 164 * scale, b: game.y - 4 };

  const mouth = { ...body, l: game.x - halfWidth * reach, r: game.x + halfWidth * reach };

  const foot =
    game.kick > 0.04
      ? {
          l: game.x + Math.min(game.f * 8, game.f * 94) * scale,
          r: game.x + Math.max(game.f * 8, game.f * 94) * scale,
          t: game.y - (air ? 84 : 100) * scale,
          b: game.y - (air ? 20 : 36) * scale,
        }
      : null;

  for (const it of game.items) {
    if (pw === 'bifana' && !it.out && ['meat', 'gold', 'galo', 'fish'].includes(it.kind)) {
      // the bifana's magnet: meat curves to his mouth
      const dx = game.x - it.x;
      const dy = game.y - 110 * scale - it.y;
      const distance = Math.hypot(dx, dy);

      if (distance < 340) {
        it.vx += (dx / distance) * 900 * dt;
        it.vx *= 1 - Math.min(1, dt * 2);
        if (dy > 0) it.vy += (dy / distance) * 300 * dt;
      }
    }

    const sdt = it.out ? dt : idt;
    const iy = it.y;

    it.vy += it.g * sdt;
    it.x += it.vx * sdt;
    it.y += it.vy * sdt;
    it.rot += it.spin * sdt;

    if (!it.out && it.vy > 0 && (it.bounces || 0) < 4) {
      for (const platform of ZE_PLATS) {
        if (it.x >= platform.l && it.x <= platform.r && iy < platform.y - 14 && it.y >= platform.y - 14) {
          // off the sign, off the awning, and off it
          Object.assign(it, {
            y: platform.y - 14,
            vy: -Math.max(160, it.vy * 0.55),
            vx: it.vx + Math.sign(it.x - (platform.l + platform.r) / 2 || 1) * 150,
            bounces: (it.bounces || 0) + 1,
          });

          zeSfx('boing');
          break;
        }
      }
    }

    if (it.out) {
      if (it.back && game.avo && !game.avo.leaving && Math.hypot(it.x - ZE_AVO.x, it.y - ZE_AVO.y) < 46) {
        zeAvoHit(game, it);
      }

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
      zeWord(game, 'CÓCÓRÓCÓCÓ!', it.x, it.y - 40, '#ffd23f', true);
      zeSfx('galo');
    }

    if (it.stood > 0 && (it.stood -= dt) <= 0) {
      // …and is the golden galo, floating down
      Object.assign(it, { kind: 'gold', e: '🐓', pts: 100, say: 'O MILAGRE DO GALO!', vy: 40, g: 30, rot: 0 });
      zeBits(game, it.x, it.y, ['#ffd23f', '#fff3c4', '#feae34'], 16);
    }

    if (it.kind === 'veg' && foot && zeTouch(it, foot, 22)) {
      // WATAAA: out of the sky — or, one kick in six, its other name
      Object.assign(it, {
        out: true,
        vx: game.f * (420 + Math.random() * 220),
        vy: -360 - Math.random() * 120,
        spin: game.f * 14,
        g: 900,
      });

      if (it.from === 'avo' && game.avo && !game.avo.leaving) zeAvoBack(it); // hers go back to her
      zeWord(game, Math.random() < 1 / 6 ? 'KRAV MAGA!' : 'WATAAA!', it.x, it.y - 20, '#ffd23f', true);
      zeChunks(game, it.x, it.y, 'veg', 12);
      zeSfx('smash');
      zeHold(game, 0.07);
      zeBump(game, 'alignment');
      game.nun = Math.min(ZE_NUN, game.nun + 1);
      zeCount(game, 'kicked', 100, 'cem');
      zeScore(game, 5);
      continue;
    }

    if (it.kind === 'peixe' && (zeTouch(it, mouth, 30) || it.y >= ZE_FLOOR - 30)) {
      // the board's fish is let go, not eaten: it swims off
      const caught = it.y < ZE_FLOOR - 30;

      Object.assign(it, { out: true, vx: (it.x < ZE_W / 2 ? 1 : -1) * 260, vy: -160, g: -60, spin: 0, rot: 0 });

      if (caught) {
        zeWord(game, 'LET GO! +100', it.x, it.y - 30, '#7ef0ff', true);
        zeBits(game, it.x, it.y, ['#7ef0ff', '#fff3c4', '#5b8ff0'], 12);
        zeSfx('combo');
        zeScore(game, 100);
        zeTrophy(game, 'peixe');
      }

      continue;
    }

    const green = it.kind === 'veg' && !game.dragon; // a green while he still blinks from the last one passes him by

    if (green && !it.shaved && !game.hurt && !game.dash && !game.ride && zeTouch(it, body, ZE_SHAVE)) it.shaved = true; // that close: if it lands without touching him, RASPÃO

    if (!(green && (game.hurt > 0 || game.dash > 0)) && zeTouch(it, green ? body : mouth)) {
      it.dead = true;
      zeEat(game, it);
      if (game.phase !== 'play') return;
      continue;
    }

    if (it.y >= ZE_FLOOR - 8) {
      it.dead = true;
      zeChunks(game, it.x, ZE_FLOOR - 4, it.kind === 'veg' || it.kind === 'fish' ? it.kind : 'meat', 3);

      if (it.shaved && it.kind === 'veg' && !game.dragon) {
        zeWord(game, 'RASPÃO! +5', it.x, ZE_FLOOR - 44, '#9be15d', true);
        zeSfx('peck');
        zeScore(game, 5);
        game.nun = Math.min(ZE_NUN, game.nun + 0.34);
      }

      if (it.kind === 'meat' && !game.dragon) {
        if (game.streak >= 5) zeWord(game, 'wasted!', it.x, ZE_FLOOR - 30, '#d9c7e8');
        game.streak = 0;
        game.mult = 1;
      } // a miss lets the combo go
    }
  }

  game.items = game.items.filter(it => !it.dead);

  // the mouth opens as food comes: something falling close above his head
  const hx = game.x + game.f * 2 * scale;
  const hy = game.y - 134 * scale;

  game.gape =
    game.power?.kind === 'francesinha' ||
    game.items.some(it => !it.out && Math.abs(it.x - hx) < 50 * scale && hy - it.y < 110 * scale && hy - it.y > -10);
}
