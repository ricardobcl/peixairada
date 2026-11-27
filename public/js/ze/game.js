// ---- Zé: ⌥⌘Z's game (2026-10-30) ---------------------------------------------------------------------------------
// Zé, the Bruce Lee of Barcelos, in pixels (ZE_FACE: the hair, the round gold glasses, the beard; his body, zeBuild): meat falls
// and he eats it and grows — broader, his arms thicker, pecs and biceps —; vegetables make him thinner, down to his
// ribs and then his bones, the K.O. — unless he dodges them or kicks them out of the sky; some lunch that looks safe
// has a leaf in it. Six meats in a row bring a Ford Focus, ZE_RIDE seconds of speed; three greens a Mercedes A-Class,
// ZE_RIDE slow ones. ← → (A D, or the pointer over the picture) run, ↑ jumps, space kicks (honks, in a car), P pauses,
// M the sound, T the music — Barcelos' own vira (the default since 2026-10-30, prefs.zeBand), the malhão or the funk; esc or ⌥⌘Z
// again closes. The golden rooster, Barcelos'
// for luck, is muscle. Taller than wide, the window's height (2026-10-30, last).
// From Trota's, the 8-bit game it learnt from (2026-10-30, later): four ways to play (ZE_DIFFS, prefs.zeDiff; a best
// each, prefs.zeBest), a combo every five in a row, the mouth opening as food comes, food that drifts at the higher
// levels, a banner each level, the K.O.'s Again · Menu, the restaurant behind him, its sign's bulbs chasing — and at
// level ZE_DRAGON_LEVEL its MODO FERA as ENTER THE DRAGON: twice his size, on fire, the sky dark and struck, the band
// in A minor, everything good to eat, for ZE_DRAGON s. For those who know (the Mossad's): a briefcase that falls once a
// round makes him AGENT ZÉ (sunglasses, an earpiece, a TOP SECRET stamp), one kick in six is KRAV MAGA, a falafel is
// a green, the Focus says YALLA.
// The next round (2026-10-30, late at night, the ideas sheet's picks): his body in pixels too (zeBuild), Barcelos on the
// horizon and a sky a level (zeTown, ZE_SKIES), a title that plays (game.demo), squash, hit-stop, chunks, afterimages
// and smoke, MONSTRO; the band hearing the cars and his bulk (zeMode), the malhão; the galo's miracle; power-ups, the
// nunchaku, the Avó da Horta every fifth level, the awning and the sign, a dash, the day's round (zeSeed), twelve
// trophies, fish, the galo as player two; the board in it — a chat asking stops it (zeHeard), today's lunch falls,
// a best posted to the room, Zé on All caught up, the trackpad's bumps; MOSSAD typed on the title, the dossier, Bruce
// Lee at the K.O.
// A canvas in a modal dialog, a world of its own — its colours are the picture's, not a theme's. Its frames run only
// while it is open and not paused; its music is Web Audio of its own, planned ahead on the audio clock, made on the
// first start, suspended by a pause or a K.O., closed with the dialog or by M — never left rendering silence (the
// alerts' AUDIO_REST_MS story). Under reduced motion nothing shakes, flashes or blinks.
const ZE_W = 720;
const ZE_H = 900;
const ZE_FLOOR = 842;
const ZE_FALL = 1.5; // the picture, the floor, how much quicker food falls the longer way

const ZE_BPM = 104;
const ZE_16 = 60 / ZE_BPM / 4;
const ZE_16D = 0.125;
const ZE_8V = 60 / 184 / 2; // the funk's sixteenth, the dragon's, the vira's quaver

const ZE_MEAT = [
  ['🥩', 15, 'posta'],
  ['🍗', 10, 'frango'],
  ['🍖', 10, 'costeleta'],
  ['🥓', 10, 'toucinho'],
  ['🌭', 10, 'chouriço'],
];

// the greens, and lunch with a leaf in it (Trota's TEM ALFACE!) — each with what a hit says
const ZE_VEG = [
  ['🥦', 'BLEH! brócolos'],
  ['🥕', 'BLEH! cenoura'],
  ['🥬', 'BLEH! alface'],
  ['🌽', 'BLEH! milho'],
  ['🍆', 'BLEH! beringela'],
  ['🥒', 'BLEH! pepino'],
  ['🫑', 'BLEH! pimento'],
  ['🧅', 'BLEH! cebola'],
  ['🍔', 'HAS LETTUCE!'],
  ['🥪', 'HAS TOMATO!'],
  ['🥙', 'HAS SALAD!'],
  ['🧆', 'FALAFEL? CHICKPEAS!'],
];

// neither meat nor green (2026-10-30, the next round): fish, +5 and no bulk — a sardine, a salt cod (paler, salted)
const ZE_FISH = [
  ['🐟', 'sardinha', null],
  ['🐟', 'bacalhau', 'rgba(240, 230, 205, .55)'],
];

// the power-ups (2026-10-30, the next round), ZE_POWER_T s each, one at a time: a francesinha — full bulk and a wide
// mouth —, a vinho verde — slow motion, the picture wobbling —, a bifana — a magnet, the meat curving to him; each a
// dish in pixels (zeDish), 16 square
const ZE_POWER_T = 6;

const ZE_POWERS = {
  francesinha: {
    name: 'FRANCESINHA!',
    say: 'FULL BULK AND A WIDE MOUTH',
    c: '#e0612b',
    draw(rect, ellipse) {
      ellipse(8, 13, 7.6, 2.6, '#b8401c');
      ellipse(8, 12.8, 6.2, 1.7, '#e0612b');
      rect(3, 7, 10, 5, '#d9a05b');
      rect(3, 9, 10, 1, '#8a3a22');
      rect(3, 11, 10, 1, '#a8703a');
      rect(2, 5, 12, 2, '#ffe08a');
      rect(3, 7, 1, 2, '#ffe08a');
      rect(7, 7, 1, 3, '#ffe08a');
      rect(11, 7, 1, 2, '#ffe08a');
      rect(13, 7, 1, 1, '#ffe08a');
      ellipse(8, 3.6, 3.4, 2.3, '#fffaf0');
      ellipse(8.4, 3.4, 1.4, 1.2, '#ffb700');
    },
  },
  vinho: {
    name: 'VINHO VERDE!',
    say: 'SLOW MOTION',
    c: '#9be15d',
    draw(rect) {
      rect(7, 0, 2, 2, '#c9a46a');
      rect(7, 2, 2, 3, '#2f6f2a');
      rect(6, 5, 4, 1, '#2f6f2a');
      rect(5, 6, 6, 10, '#3f8f3a');
      rect(6, 7, 1, 8, '#9ad26a');
      rect(5, 9, 6, 4, '#f2ead8');
      rect(5, 10, 6, 1, '#c8322f');
      rect(7, 12, 2, 1, '#2f6f2a');
    },
  },
  bifana: {
    name: 'BIFANA!',
    say: 'A MAGNET FOR MEAT',
    c: '#c9843f',
    draw(rect, ellipse) {
      ellipse(8, 11.5, 7, 2.4, '#e3a865');
      rect(1, 9, 14, 2, '#8a4a2a');
      rect(0, 10, 1, 1, '#8a4a2a');
      rect(15, 9, 1, 1, '#8a4a2a');
      ellipse(8, 7.2, 6.6, 2.8, '#c9843f');
      rect(5, 5, 3, 1, '#f4cf8f');
      rect(4, 11, 7, 1, '#e8c32a');
    },
  },
};

const ZE_NUN = 8;

// the Avó da Horta (2026-10-30, the next round): every ZE_AVO_EVERY-th level a Minho grandmother leans out of a window
// above Trota's and throws couves at him — kick three back at her; ZE_AVO_T s at most. Her words, and her face in
// pixels (k her black scarf, g her grey hair, o her glasses' rims, a her shawl, r its flowers)
const ZE_AVO_EVERY = 5;
const ZE_AVO_T = 30;
const ZE_AVO = { x: 570, y: 588 };

const ZE_AVO_SAYS = [
  'Come a sopa, menino!',
  'Uma folhinha não mata!',
  'Olha que eu digo à tua mãe!',
  'Verdinho faz bem!',
  'Não há sobremesa sem sopa!',
];

const ZE_AVO_FACE = [
  '......kkkkkkkk......',
  '....kkkkkkkkkkkk....',
  '...kkkkkkkkkkkkkk...',
  '..kkkkkkkkkkkkkkkk..',
  '..kkggggggggggggkk..',
  '..kkgssssssssssgkk..',
  '..kksoeossssoeoskk..',
  '..kkssssSSSSsssskk..',
  '..kksSssssssssSskk..',
  '..kksssmoooomssskk..',
  '...kkssssssssssk...',
  '....kkssssssssk.....',
  '.....kkkkkkkkkk.....',
  '...aaaakkkkkkaaaa...',
  '..aaaaaaarraaaaaaa..',
  '.aaaraaaaaaaaaraaaa.',
  '.aaaaaaaaaaaaaaaaaa.',
  'aaaaraaaaaaaaaaraaaa',
];

// the galo, player two (2026-10-30, the next round): G on the title — CO-OP, it pecks the greens out of the sky; VERSUS,
// it steals his meat — on A D and W (Zé on the arrows alone then); Barcelos' black rooster in pixels, facing right
// twelve trophies (2026-10-30, the next round), kept with the day each was won (prefs.zeTrophies.won), and the counts
// that take more than a round (kicked, agents)
const ZE_TROPHIES = [
  ['chourico', '🌭', 'DEZ CHOURIÇOS', 'ten chouriços in a round'],
  ['moose', '🦌', 'MOOSE TEST', 'an A-Class out at full bulk'],
  ['cem', '🥦', 'CEM VERDES', 'a hundred greens kicked'],
  ['agent', '🕶️', 'AGENTE ZÉ ×3', 'Agent Zé three times'],
  ['fera', '🐉', 'FERA', 'the dragon on HARDCORE'],
  ['monstro', '💪', 'MONSTRO', 'his full bulk'],
  ['milagre', '🐓', 'O MILAGRE', 'the golden galo eaten'],
  ['nunchaku', '🥋', 'NUNCHAKU', 'five greens in one sweep'],
  ['avo', '👵', 'A AVÓ DESISTE', 'the Avó da Horta beaten'],
  ['telhado', '🏠', 'NO TELHADO', "on top of Trota's sign"],
  ['combo', '🔥', 'COMBO ×4', 'the top combo'],
  ['peixe', '🐟', 'PESCADOR', "the board's fish let go"],
];

const ZE_TWO = { coop: 'CO-OP — IT PECKS THE GREENS', versus: 'VERSUS — IT STEALS HIS MEAT' };

const ZE_GALO = [
  '..............rr....',
  '.............rrrr...',
  '............kkkkk...',
  '...........kkwkkkyy.',
  '...........kkkkkkyyy',
  '..kk.......kkkkkr...',
  '.kkkk......kkkkr....',
  'kkbkk.....kkkk......',
  'kkkkyk...kkkkk......',
  '.kkkkkkkkkkkkk......',
  '..kkkhkkkkdkkk......',
  '..kkkkkkkhkkkk......',
  '...kkdkkkkkkk.......',
  '....kkkkkkkk........',
  '......y...y.........',
  '......y...y.........',
  '.....yy..yy.........',
];

const ZE_GALO_PAL = {
  k: '#151018',
  r: '#e8322f',
  w: '#ffffff',
  y: '#ffcc33',
  b: '#3f8fe0',
  h: '#e8322f',
  d: '#5cbf4a',
};

const ZE_AVO_PAL = {
  k: '#1b1b22',
  g: '#c8c8cc',
  s: '#e8b48e',
  S: '#c98f6d',
  o: '#8a7a5a',
  e: '#2a1f1c',
  m: '#8a3b3b',
  a: '#3a2f4a',
  r: '#c8322f',
}; // kicks that land to fill the nunchaku (2026-10-30, the next round)

// Bruce Lee at the K.O. (2026-10-30, the next round), bent to food
const ZE_LEE = [
  'Be water, my friend. Not caldo verde.',
  "Don't think. Eat.",
  'Empty your mind. Fill your plate.',
  'Absorb what is useful. Discard what is green.',
  'I fear not the man who has eaten ten thousand bifanas once…',
  'The best kick is the one that sends the broccoli home.',
  'Adapt what is useful, reject what is lettuce.',
];

const ZE_KO = [
  'too many greens',
  'a salad got him',
  'vegan for a day',
  'the broccoli won',
  'five a day, all at once',
  'the burger had lettuce',
];

// the four ways to play: how fast and how often it falls, how green it gets (at level 1, more a level, at most), how
// far past him his mouth reaches, the points a level takes, the level food starts drifting at; HARDCORE deals from a
// shuffled bag instead, five meats in every fifty
const ZE_DIFFS = [
  {
    id: 'easy',
    name: 'EASY',
    c: '#a6dc5a',
    say: 'slow food, a big mouth',
    speed: 0.75,
    spawn: 1.3,
    veg: [0.2, 0.015, 0.36],
    reach: 1.35,
    step: 200,
    drift: 6,
  },
  {
    id: 'normal',
    name: 'NORMAL',
    c: '#ffd23f',
    say: 'the classic',
    speed: 1,
    spawn: 1,
    veg: [0.34, 0.03, 0.55],
    reach: 1,
    step: 150,
    drift: 4,
  },
  {
    id: 'hard',
    name: 'HARD',
    c: '#ff5a64',
    say: 'faster, and greener',
    speed: 1.3,
    spawn: 0.78,
    veg: [0.42, 0.03, 0.62],
    reach: 0.85,
    step: 120,
    drift: 2,
  },
  {
    id: 'hardcore',
    name: 'HARDCORE',
    c: '#c77dff',
    say: 'five meats in every fifty',
    speed: 1.25,
    spawn: 0.7,
    bag: [5, 50],
    reach: 0.85,
    step: 60,
    drift: 3,
  },
];

// a round of 3 to 5 minutes (2026-11-01; ze-pace.mjs): two bots never ended one on Normal in ten. His speed stops growing at
// level 1 + cap, each level costs up × more than the last, and every bite levels a green takes one more: meat and greens
// kept level with each other at any speed of falling, so that last one is what ends a round
const ZE_PACE = { cap: 10, up: 0.2, bite: 5 };
const zeBite = game => 1 + Math.floor((game.level - 1) / ZE_PACE.bite);

const ZE_DRAGON_LEVEL = 3;
const ZE_DRAGON = 16;
const ZE_DRAGON_IN = 1.2;
const ZE_DRAGON_OUT = 0.8;

// his bulk: a meat adds one (to ZE_MASS_MAX), a green takes one; none left is his bones, and the K.O.
const ZE_MASS0 = 6;
const ZE_MASS_MAX = 12;

// the cars, ZE_RIDE s each: three meats in a row bring the Focus, three greens the A-Class
const ZE_RIDE = 5;
const ZE_FOCUS_ROW = 6;
const ZE_FOCUS_GAP = 20;

const ZE_CARS = {
  focus: { name: 'FORD FOCUS', speed: 1.8, c: '#5b8ff0' },
  aclass: { name: 'MERCEDES A-CLASS', speed: 0.5, c: '#c8ccd2' },
};

// the music, two bars of bass and one of horns: step → [midi note, sixteenths, popped]
const ZE_BASS = [
  { 0: [40, 2], 2: [52, 1, 1], 3: [40, 1], 6: [43, 2], 8: [45, 1], 10: [52, 1, 1], 11: [50, 1], 14: [47, 2] },
  {
    0: [40, 2],
    2: [52, 1, 1],
    3: [40, 1],
    5: [43, 1],
    7: [45, 1],
    9: [46, 1],
    10: [47, 2],
    12: [50, 1],
    14: [52, 1, 1],
    15: [50, 1],
  },
];

const ZE_CLAV = { 2: 0.7, 6: 1, 9: 0.5, 11: 0.8, 14: 1 };
const ZE_HORN = { 0: [64, 1], 2: [67, 1], 4: [69, 3], 8: [67, 1], 10: [64, 2] };

// the dragon's theme, Trota's MODO FERA: A minor, a square lead, a sawtooth bass a bar a note (ZE_FBASS)
const ZE_FLEAD = [
  69, 0, 72, 0, 76, 0, 81, 79, 77, 0, 76, 0, 74, 0, 72, 71, 69, 0, 72, 0, 76, 0, 82, 81, 79, 0, 77, 76, 74, 72, 71, 68,
];

const ZE_FBASS = [45, 41, 43, 40];

// the vira (T), Minho's dance at Barcelos' fair: sixteen bars of three-four in G, six quavers a bar — a note, -1 held,
// 0 a rest —, its chords a bar each, the cavaquinho's voicings and the viola's roots
const ZE_VIRA = [
  [74, -1, 71, 74, 79, 78],
  [76, -1, 74, -1, 71, -1],
  [72, -1, 69, 72, 78, 76],
  [74, -1, 72, -1, 69, -1],
  [66, 69, 72, 69, 66, 69],
  [74, -1, 72, 71, 69, 72],
  [71, -1, 67, 71, 74, 71],
  [79, -1, -1, 0, 0, 0],
  [76, -1, 72, 76, 79, 76],
  [76, 74, 72, -1, 76, -1],
  [74, -1, 71, 74, 79, -1],
  [78, 76, 74, -1, 71, -1],
  [69, -1, 72, 76, 74, 72],
  [71, -1, 69, -1, 66, -1],
  [67, 71, 74, 79, 78, 76],
  [79, -1, -1, 0, 0, 0],
];

const ZE_VIRA_CH = 'GGDDDDGGCCGGDDGG';
const ZE_CHORD = { G: [55, 59, 62, 67], D: [57, 62, 66, 72], C: [55, 60, 64, 67] };
const ZE_ROOT = { G: 43, D: 50, C: 48 };

// the malhão (T, 2026-10-30, the next round), a third tune: another dance of the north, in two-four — sixteen bars in D
// in its manner, four quavers a bar, written for the game, the same players on an oom-pah
const ZE_MALHAO = [
  [69, 74, 74, 73],
  [71, 69, 69, -1],
  [67, 71, 71, 69],
  [67, 66, 66, -1],
  [64, 67, 67, 66],
  [64, 62, 64, 66],
  [67, 69, 71, 73],
  [74, -1, 0, 0],
  [78, -1, 76, 74],
  [73, 74, 76, -1],
  [76, -1, 74, 73],
  [71, 73, 74, -1],
  [74, 73, 71, 69],
  [67, 69, 71, 67],
  [66, 64, 69, 61],
  [62, -1, 0, 0],
];

const ZE_MALHAO_CH = 'DDGDADADDAAGDGAD';
const ZE_MCHORD = { D: [57, 62, 66, 69], A: [57, 61, 64, 67], G: [55, 59, 62, 67] };
const ZE_MROOT = { D: 50, A: 45, G: 43 };
const ZE_8M = 60 / 132 / 2;

const ZE_BANDS = { vira: 'VIRA DE BARCELOS', malhao: 'MALHÃO', funk: 'FUNK' };

// his face in pixels: dark hair, round gold glasses, a full beard — a drawing, no picture; the mouth open for a bite
// (ZE_OPEN's rows), sunglasses and an earpiece as AGENT ZÉ (ZE_SPY's), and what is left at the end (ZE_SKULL, his
// glasses still on) — on his pixel body since 2026-10-30, the next round (zeBuild), outlined, drawn unsmoothed.
const ZE_PAL = {
  h: '#2a1f1c',
  s: '#eab995',
  S: '#c98f6d',
  b: '#33261f',
  B: '#17110f',
  g: '#c9a46a',
  e: '#2a1f1c',
  w: '#ffffff',
  m: '#8a3b3b',
  o: '#4a1020',
  K: '#0e0c12',
  L: '#f2ead8',
  l: '#c9bfa8',
  n: '#e8e8e8',
};

const ZE_FACE = [
  '......hhhhhhhh......',
  '....hhhhhhhhhhhh....',
  '...hhhhhhhhhhhhhh...',
  '..hhhhhhhhhhhhhhhh..',
  '..hhhhhhhhhhhhhhhh..',
  '.hhhsssssssssssshhh.',
  '.hssssssssssssssssh.',
  '.hssssssssssssssssh.',
  '.hsBBBBssssssBBBBsh.',
  'ShggggggssssgggggghS',
  'SbgseesggggggseesgbS',
  'SbgwsssgssssgwsssgbS',
  '.bggggggsSSsggggggb.',
  '.bbsssssSSSSsssssbb.',
  '.bbbssssSSSSssssbbb.',
  '.bbbbbBBBBBBBBbbbbb.',
  '.bbbbbbmmmmmmbbbbbb.',
  '.bbbbbbbbbbbbbbbbbb.',
  '..bbbbBbbbbbbBbbbb..',
  '..bbbbbbbbbbbbbbbb..',
  '...bbbBbbbbbbBbbb...',
  '....bbbbbbbbbbbb....',
  '.....bbbbbbbbbb.....',
  '.......bbbbbb.......',
];

const ZE_OPEN = { 16: '.bbbbbmoooooombbbbb.', 17: '.bbbbbmoooooombbbbb.', 18: '..bbbbBmmmmmmBbbbb..' };

const ZE_SPY = {
  10: 'SbgKKKKggggggKKKKgbS',
  11: 'SbgwKKKgssssgwKKKgbS',
  12: 'nbggggggsSSsggggggb.',
  13: 'nbbsssssSSSSsssssbb.',
  14: 'nbbbssssSSSSssssbbb.',
};

const ZE_SHADES = { 10: ZE_SPY[10], 11: ZE_SPY[11] }; // MOSSAD typed on the title: everyone's sunglasses, his without the earpiece

const ZE_SKULL = [
  '......LLLLLLLL......',
  '....LLLLLLLLLLLL....',
  '...LLLLLLLLLLLLLL...',
  '..LLLLLLLLLLLLLLLL..',
  '..LLLLLLLLLLLLLLLL..',
  '.LLLLLLLLLLLLLLLLLL.',
  '.LLLLLLLLLLLLLLLLLL.',
  '.LLLLLLLLLLLLLLLLLL.',
  '.LlLLLLLLLLLLLLLLlL.',
  '.LggggggLLLLggggggL.',
  '.LgKKKKggggggKKKKgL.',
  '.LgKKKKgLLLLgKKKKgL.',
  '.LggggggLKKLggggggL.',
  '.lLLLLLLLKKLLLLLLLl.',
  '..lLLLLLLLLLLLLLLl..',
  '...lLLLLLLLLLLLLl...',
  '....LKLKLKLKLKLK....',
  '....LLLLLLLLLLLL....',
  '.....lLLLLLLLLLl.....',
];

// his body in the same pixels (2026-10-30, the next round): the suit, its shade, its shine, the stripes and shoes, his
// fists — as broad as his bulk, a pixel at a time (zeBuild); each pose its joints from the neck and the torso's top
const ZE_SUIT = {
  Y: '#ffd23f',
  y: '#d29a14',
  l: '#fff3a8',
  K: '#151018',
  s: '#eab995',
  S: '#c98f6d',
  bone: '#f2ead8',
  bone2: '#c9bfa8',
};

const ZE_POSES = {
  stand: (centerX, top, bulk) => ({
    arms: [
      [
        [centerX - bulk.hw + 1, top + 2],
        [centerX - bulk.hw - 3, top + 8],
        [centerX - bulk.hw + 2, top + 11],
      ],
      [
        [centerX + bulk.hw - 1, top + 2],
        [centerX + bulk.hw + 4, top + 7],
        [centerX + bulk.hw + 4, top],
      ],
    ],
    legs: [
      [
        [centerX - 3, top + 15],
        [centerX - 5, top + 25],
        [centerX - 6, top + 34],
      ],
      [
        [centerX + 3, top + 15],
        [centerX + 5, top + 25],
        [centerX + 6, top + 34],
      ],
    ],
  }),
  run1: (centerX, top, bulk) => ({
    arms: [
      [
        [centerX - bulk.hw + 1, top + 2],
        [centerX - bulk.hw - 4, top + 7],
        [centerX - bulk.hw - 7, top + 11],
      ],
      [
        [centerX + bulk.hw - 1, top + 2],
        [centerX + bulk.hw + 5, top + 6],
        [centerX + bulk.hw + 6, top + 1],
      ],
    ],
    legs: [
      [
        [centerX - 2, top + 15],
        [centerX - 6, top + 23],
        [centerX - 11, top + 29],
      ],
      [
        [centerX + 2, top + 15],
        [centerX + 6, top + 24],
        [centerX + 7, top + 34],
      ],
    ],
  }),
  run2: (centerX, top, bulk) => ({
    arms: [
      [
        [centerX - bulk.hw + 1, top + 2],
        [centerX - bulk.hw - 2, top + 9],
        [centerX - bulk.hw + 2, top + 13],
      ],
      [
        [centerX + bulk.hw - 1, top + 2],
        [centerX + bulk.hw + 3, top + 9],
        [centerX + bulk.hw + 1, top + 13],
      ],
    ],
    legs: [
      [
        [centerX - 2, top + 15],
        [centerX - 1, top + 25],
        [centerX - 2, top + 34],
      ],
      [
        [centerX + 2, top + 15],
        [centerX + 3, top + 24],
        [centerX - 1, top + 30],
      ],
    ],
  }),
  kick: (centerX, top, bulk) => ({
    arms: [
      [
        [centerX - bulk.hw + 1, top + 2],
        [centerX - bulk.hw - 6, top + 4],
        [centerX - bulk.hw - 11, top + 2],
      ],
      [
        [centerX + bulk.hw - 1, top + 2],
        [centerX + bulk.hw + 3, top + 6],
        [centerX + bulk.hw + 2, top - 1],
      ],
    ],
    legs: [
      [
        [centerX - 2, top + 15],
        [centerX - 3, top + 25],
        [centerX - 4, top + 34],
      ],
      [
        [centerX + 2, top + 14],
        [centerX + 12, top + 12],
        [centerX + 23, top + 10],
      ],
    ],
    kick: true,
  }),
  jump: (centerX, top, bulk) => ({
    arms: [
      [
        [centerX - bulk.hw + 1, top + 2],
        [centerX - bulk.hw - 4, top - 2],
        [centerX - bulk.hw - 3, top - 7],
      ],
      [
        [centerX + bulk.hw - 1, top + 2],
        [centerX + bulk.hw + 4, top - 2],
        [centerX + bulk.hw + 3, top - 7],
      ],
    ],
    legs: [
      [
        [centerX - 3, top + 15],
        [centerX - 1, top + 21],
        [centerX - 7, top + 26],
      ],
      [
        [centerX + 3, top + 15],
        [centerX + 8, top + 20],
        [centerX + 3, top + 27],
      ],
    ],
  }),
  sit: (centerX, top, bulk) => ({
    arms: [
      [
        [centerX - bulk.hw + 1, top + 2],
        [centerX - bulk.hw + 3, top + 9],
        [centerX + bulk.hw + 6, top + 8],
      ],
      [
        [centerX + bulk.hw - 1, top + 2],
        [centerX + bulk.hw + 4, top + 9],
        [centerX + bulk.hw + 9, top + 7],
      ],
    ],
    legs: [
      [
        [centerX - 2, top + 15],
        [centerX + 8, top + 15],
        [centerX + 9, top + 24],
      ],
      [
        [centerX + 2, top + 15],
        [centerX + 11, top + 14],
        [centerX + 12, top + 23],
      ],
    ],
  }),
  flex: (centerX, top, bulk) => ({
    arms: [
      [
        [centerX - bulk.hw + 1, top + 2],
        [centerX - bulk.hw - 6, top + 2],
        [centerX - bulk.hw - 5, top - 7],
      ],
      [
        [centerX + bulk.hw - 1, top + 2],
        [centerX + bulk.hw + 6, top + 2],
        [centerX + bulk.hw + 5, top - 7],
      ],
    ],
    legs: [
      [
        [centerX - 3, top + 15],
        [centerX - 7, top + 25],
        [centerX - 9, top + 34],
      ],
      [
        [centerX + 3, top + 15],
        [centerX + 7, top + 25],
        [centerX + 9, top + 34],
      ],
    ],
  }),
};

const zePick = list => list[(Math.random() * list.length) | 0];
const zeHz = midi => 440 * 2 ** ((midi - 69) / 12);

const zeDiff = () => ZE_DIFFS[prefs.zeDiff] || ZE_DIFFS[1];

/** Today's best of each way to play (the day's round, prefs.zeDay), a new day's empty. */
const zeTrophies = () => {
  const trophies =
    prefs.zeTrophies && typeof prefs.zeTrophies === 'object' ? prefs.zeTrophies : (prefs.zeTrophies = {});

  trophies.won ||= {};
  return trophies;
};

/** A trophy won, once ever: said at the top of the picture for a while (game.trophy) — never in the title's demo. */
function zeTrophy(game, id) {
  const trophies = zeTrophies();

  if (game.demo || trophies.won[id]) return;
  trophies.won[id] = zeToday();
  savePrefs();
  const [, emoji, name] = ZE_TROPHIES.find(trophy => trophy[0] === id);

  game.trophy = { e: emoji, name, t: 2.6 };
  zeSfx('level');
}

/** One more of a count that outlives a round — kicked, agents —, and the trophy at goal. */
const zeCount = (game, key, goal, id) => {
  if (game.demo) return;
  const trophies = zeTrophies();

  trophies[key] = (trophies[key] || 0) + 1;
  if (trophies[key] >= goal) zeTrophy(game, id);
};

const zeDayBests = () => {
  const day = zeToday();

  if (prefs.zeDay?.day !== day) prefs.zeDay = { day, best: {} };
  return prefs.zeDay.best;
};

/** The best of each way to play, by its id; a number is NORMAL's, from before there were four. */
const zeBests = () =>
  prefs.zeBest && typeof prefs.zeBest === 'object'
    ? prefs.zeBest
    : (prefs.zeBest = prefs.zeBest ? { normal: +prefs.zeBest } : {});

const zeRound = (phase, day = phase === 'play' && `${zeToday()}|${zeDiff().id}`) => ({
  phase,
  rnd: day ? zeSeed(day) : Math.random,
  bagRnd: day ? zeSeed(`${day}|bag`) : Math.random,
  t: 0,
  score: 0,
  mass: ZE_MASS0,
  streak: 0,
  greens: 0,
  mult: 1,
  level: 1,
  next: phase === 'title' ? Infinity : zeDiff().step,
  x: phase === 'title' ? 570 : ZE_W / 2,
  y: ZE_FLOOR,
  gy: ZE_FLOOR,
  jumps: 0,
  drop: 0,
  dash: 0,
  dashF: 0,
  dashCool: 0,
  vx: 0,
  vy: 0,
  f: phase === 'title' ? -1 : 1,
  run: 0,
  kick: 0,
  cool: 0,
  hurt: 0,
  chomp: 0,
  pump: 0,
  gape: false,
  spawn: 0.9,
  shake: 0,
  flash: 0,
  red: 0,
  gold: 0,
  power: null,
  nun: 0,
  holdAt: null,
  sweep: 0,
  avo: null,
  trophy: null,
  chouricos: 0,
  call: null,
  news: [],
  lunch: [],
  sq: null,
  freeze: 0,
  punch: 0,
  trail: [],
  fw: [],
  trailT: 0,
  smoke: [],
  smokeT: 0,
  flex: 0,
  monAt: -99,
  items: [],
  bits: [],
  words: [],
  flames: [],
  bag: [],
  banner: null,
  dragon: 0,
  bolt: null,
  lightT: 0,
  koT: 0,
  focusAt: -99,
  jumpBuf: 0,
  kickBuf: 0,
  coyote: 0,
  ride: null,
  leaving: null,
  agent: false,
  cased: false,
  sel: 0,
  overT: 0,
  best: false,
  ko: '',
  demo: phase === 'title',
  card: 0,
  cardT: 0.5,
});

const ze = {
  tap: null,
  typed: '',
  mossad: false,
  keys2: { l: 0, r: 0 },
  g: zeRound('title'),
  raf: 0,
  at: 0,
  frames: 0,
  glyphs: new Map(),
  sprites: new Map(),
  scene: null,
  was: null,
  drops: [],
  keys: { l: 0, r: 0 },
  aim: null,
  music: null,
};

const zeCalm = () => REDUCED.matches;
const zeBlink = (game, hz) => zeCalm() || Math.floor(game.t * hz) % 2 === 0; // a blink, or steady under reduced motion

const zeLabels = () => {
  $('#zeSnd').textContent = prefs.zeSound ? 'sound on' : 'sound off';

  $('#zeTune').textContent =
    `♪ ${{ vira: 'vira de Barcelos', malhao: 'malhão', funk: 'funk' }[prefs.zeBand] || 'funk'}`;
};

function zeOpen() {
  const dlg = $('#zeGame');

  if (dlg.open) return;
  if (inApp) post({ type: 'focus' });
  ze.g = zeRound('title');
  ze.keys = { l: 0, r: 0 };
  ze.aim = null;
  zeLabels();
  dlg.showModal();
  repostPane();
  dlg.focus();
  zeSize();
  zeGo();
}

function zeToggle() {
  if ($('#zeGame').open) $('#zeGame').close();
  else zeOpen();
} // a declaration: HOTKEYS names it before this line runs

$('#zeGame').addEventListener('close', () => {
  zeStop();
  zeHush();
  zgFree();
  ze.scene = ze.was = null;
  savePrefs();
  repostPane();
}); // the scene's canvases go with it, the counts are kept

function zeGo() {
  if (!ze.raf) {
    ze.at = 0;
    ze.raf = requestAnimationFrame(zeTick);
  }
}

function zeStop() {
  cancelAnimationFrame(ze.raf);
  ze.raf = 0;
}

/** The sky's fade, and its rain: drops falling slant while the sky has rain — held where they are under reduced motion. */
function zeWeather(dt) {
  if (ze.was && (ze.was.a -= dt / 1.4) <= 0) ze.was = null;

  if (!ZE_SKIES[zeSkyOf(ze.g)].rain) {
    ze.drops.length = 0;
    return;
  }

  while (ze.drops.length < 170) {
    ze.drops.push({ x: Math.random() * 780, y: Math.random() * ZE_FLOOR, v: 650 + Math.random() * 250 });
  }

  if (zeCalm() || ze.g.freeze > 0) return;

  for (const drop of ze.drops) {
    drop.y += drop.v * dt;
    drop.x -= drop.v * 0.22 * dt;

    if (drop.y > ZE_FLOOR + 10) {
      drop.y = -20;
      drop.x = Math.random() * 800;
    }
  }
}

function zeTick(now) {
  ze.raf = 0;
  const dt = ze.at ? Math.min(0.05, (now - ze.at) / 1000) : 0;

  ze.at = now;
  const ko = ze.g.phase === 'over' && ze.g.koT < ZE_KO_T; // the K.O.'s moment: what still flies, at a quarter speed

  if (ko && (ze.g.koT += dt) >= ZE_KO_T) {
    ze.g.shake = 0.3;
    zeBits(ze.g, ze.g.x, ze.g.y - 60, ['#f2ead8', '#fff3c4'], 14);
  }

  ze.dt = dt;
  zeStep(ko ? dt / 4 : dt);
  zeWeather(dt);
  zeRoom(ze.g);
  zeDraw();
  ze.frames++;
  if ($('#zeGame').open && ze.g.phase !== 'pause' && ze.g.phase !== 'call') ze.raf = requestAnimationFrame(zeTick);
}

/** The canvas's pixels are its box's at the screen's density; the logic is ZE_W × ZE_H whatever they are. */
function zeSize() {
  const canvas = $('#zeCanvas');
  const width = Math.round(canvas.clientWidth * (devicePixelRatio || 1)) || ZE_W;
  const height = Math.round((width * ZE_H) / ZE_W);

  if (canvas.width === width && canvas.height === height) return;
  canvas.width = width;
  canvas.height = height;
  ze.scene = ze.was = null;
  if ($('#zeGame').open && !ze.raf) zeDraw();
}

new ResizeObserver(zeSize).observe($('#zeCanvas'));

function zeStart() {
  ze.g = zeRound('play');
  ze.keys2 = { l: 0, r: 0 };
  ze.g.lunch = zeLunch();

  if (ZE_TWO[prefs.zeTwo]) {
    ze.g.galo = { mode: prefs.zeTwo, x: 200, y: ZE_FLOOR, vx: 0, vy: 0, f: 1, peck: 0, flaps: 0, score: 0, t: 0 };
  }

  if (prefs.zeSound) zeGroove(true);
  zeGo();
}

function zeMenu() {
  ze.g = zeRound('title');
  zeGo();
}

function zeSetDiff(index) {
  index = (index + ZE_DIFFS.length) % ZE_DIFFS.length;
  if (index === prefs.zeDiff) return;
  prefs.zeDiff = index;
  savePrefs();
}

function zePause(on) {
  ze.g.phase = on ? 'pause' : 'play';
  const ac = ze.music?.ac;

  if (ac) (on ? ac.suspend() : ac.resume()).catch(() => {});
  else if (!on && prefs.zeSound) {
    zeGroove(true);
    if (ze.g.ride) zeEngine(ze.g.ride.kind);
  } // the sound turned on while it stood

  if (on) {
    zeStop();
    zeDraw();
  } else zeGo();
}

/** The K.O. (2026-11-01): the last bite in slow motion, the camera going in, the lights going down on him, and then the bones and the card. At once under reduced motion. */
const ZE_KO_T = 0.9;
const zeKoK = game => (game.phase === 'over' ? 1 - (1 - Math.min(1, game.koT / ZE_KO_T)) ** 2 : 0);

function zeOver(game) {
  if (game.ride) zeLeave(game);

  Object.assign(game, {
    phase: 'over',
    koT: zeCalm() ? ZE_KO_T : 0,
    quote: zePick(ZE_LEE),
    mass: 0,
    ko: game.agent ? 'the Mossad has never heard of him' : game.avo ? 'the avó won: he ate his soup' : zePick(ZE_KO),
    hurt: 0,
    overT: 0,
    sel: 0,
    dragon: 0,
    bolt: null,
    banner: null,
    avo: null,
  });

  game.words.length = 0;
  game.flames.length = 0;

  const bests = zeBests();
  const id = zeDiff().id;
  const today = zeDayBests();

  if (game.score > (bests[id] || 0)) {
    bests[id] = game.score;
    game.best = true;
  }

  if (game.score > (today[id] || 0)) {
    today[id] = game.score;
    game.todays = true;
  }

  savePrefs();
  zeHold(game, 0.12);
  zeBump(game, 'generic');
  zeGroove(false);
  zeSfx('over');
  const music = ze.music;

  if (music) music.rest = setTimeout(() => music.ac.suspend().catch(() => {}), 2600); // after the trombone
}

function zeKick(game) {
  if (game.cool > 0) {
    game.kickBuf = ZE_FORGIVE;
    return;
  }

  game.cool = 0.48;

  if (!game.ride) {
    game.kick = 0.34;
    zeSfx('whoosh');
    return;
  }

  const focus = game.ride.kind === 'focus'; // in a car the key is its horn

  zeSfx(focus ? 'beep' : 'meep');
  zeWord(game, focus ? 'BEEP BEEP!' : 'meep…', game.x, game.y - 200 * zeSz(game), '#fff3c4');
}

/** The nunchaku (2026-10-30, the next round): kicks that land fill it (game.nun); full, space held and let go — the
 *  pointer too — and it sweeps every green off the screen, five each. Not from a car. */
function zeLetGo(game) {
  const held = game.holdAt == null ? 0 : game.t - game.holdAt;

  game.holdAt = null;
  if (game.phase !== 'play' || game.nun < ZE_NUN || held < 0.3 || game.ride) return;
  const greens = game.items.filter(it => it.kind === 'veg' && !it.out);

  for (const it of greens) {
    const direction = Math.sign(it.x - game.x) || 1;

    Object.assign(it, {
      out: true,
      vx: direction * (500 + Math.random() * 300),
      vy: -420 - Math.random() * 200,
      spin: direction * 16,
      g: 900,
    });

    zeChunks(game, it.x, it.y, 'veg', 8);
  }

  Object.assign(game, { nun: 0, sweep: 0.35, shake: Math.max(game.shake, 0.25) });
  zeHold(game, 0.14, true);

  zeBanner(
    game,
    'NUNCHAKU!',
    greens.length
      ? `${greens.length} GREEN${greens.length === 1 ? '' : 'S'} SWEPT OFF THE SCREEN`
      : 'NOT A GREEN IN SIGHT',
    ['#ffd23f', '#ff5a64'],
    1.6,
  );

  zeSfx('whoosh');
  zeSfx('smash');
  zeScore(game, greens.length * 5);
  if (greens.length >= 5) zeTrophy(game, 'nunchaku');
  return greens.length;
}

// controls that forgive (2026-11-01, as Celeste's do): a press in the moment before it can happen is kept; off an edge he can still jump for a moment
const ZE_FORGIVE = 0.12;
const ZE_COYOTE = 0.1;

const ZE_SHAVE = 34; // how near a green must pass for a RASPÃO (2026-11-01): grazing, from the shmups — staying close pays, running away does not

/** ↑: a jump from what he stands on, high enough for Trota's awning (2026-10-30, the next round) — and at his full
 *  bulk, a second one in the air. ↓ drops him through the awning or the sign. */
function zeJump(game) {
  if ((game.phase !== 'play' && !game.demo) || game.ride) return;

  if (game.y >= game.gy - 0.5 || game.coyote > 0) {
    game.vy = -640;
    game.jumps = 1;
    game.coyote = 0;
    game.jumpBuf = 0;
  } else if (game.mass >= ZE_MASS_MAX && game.jumps < 2) {
    game.vy = -580;
    game.jumps = 2;
    zeWord(game, 'DOUBLE!', game.x, game.y - 190 * zeSz(game), '#fff3c4');
  } else {
    game.jumpBuf = ZE_FORGIVE;
    return;
  }

  zeSquash(game, 'jump', 0.16);
  zeSfx('jump');
}

/** A dash (2026-10-30, the next round): ← or → twice within ZE_TAP s — quick, leaving afterimages, through a green
 *  unharmed. Not in a car; a little while between two. */
const ZE_TAP = 0.25;

function zeDash(game, facing) {
  if (game.phase !== 'play' || game.ride || game.dashCool > 0) return;
  Object.assign(game, { dash: 0.2, dashF: facing, dashCool: 0.55, f: facing });
  zeSfx('whoosh');
}

/** W: the galo flaps — off the floor, or again in the air, three times before it lands. */
function zeFlap(galo) {
  if (galo.flaps >= 3) return;
  galo.vy = -430;
  galo.flaps++;
  zeSfx('flap');
}

/** The galo's turn: A D run it, it falls slower than him, and what its beak meets — a green pecked out of the sky (five,
 *  the team's in CO-OP, its own in VERSUS), or in VERSUS meat stolen from under his nose (its points, his streak gone). */
function zeGaloStep(game, dt) {
  const galo = game.galo;
  const want = ze.keys2.r - ze.keys2.l;

  galo.t += dt;
  galo.peck = Math.max(0, galo.peck - dt);
  galo.vx += (want * 330 - galo.vx) * Math.min(1, dt * 12);
  if (want) galo.f = want;
  galo.x = Math.max(24, Math.min(ZE_W - 24, galo.x + galo.vx * dt));
  galo.vy += 1100 * dt;
  galo.y = Math.min(ZE_FLOOR, galo.y + galo.vy * dt);

  if (galo.y >= ZE_FLOOR) {
    galo.vy = 0;
    galo.flaps = 0;
  }

  const beak = {
    l: galo.x + Math.min(galo.f * 6, galo.f * 30),
    r: galo.x + Math.max(galo.f * 6, galo.f * 30),
    t: galo.y - 46,
    b: galo.y - 14,
  };

  for (const it of game.items) {
    if (it.out || it.dead || !zeTouch(it, beak, 18)) continue;
    const vs = galo.mode === 'versus';

    if (it.kind === 'veg') {
      Object.assign(it, { out: true, vx: galo.f * 300, vy: -300, spin: galo.f * 10, g: 900 });
      galo.peck = 0.2;
      zeWord(game, 'PIC!', it.x, it.y - 20, '#ffcc33');
      zeChunks(game, it.x, it.y, 'veg', 6);
      zeSfx('peck');
      if (vs) galo.score += 5;
      else zeScore(game, 5);
    } else if (vs && ['meat', 'fish', 'gold', 'galo'].includes(it.kind)) {
      it.dead = true;
      galo.peck = 0.2;
      galo.score += it.pts || 10;
      game.streak = 0;
      game.mult = 1;
      zeWord(game, 'ROUBADO!', it.x, it.y - 20, '#ff5a64', true);
      zeChunks(game, it.x, it.y, it.kind === 'fish' ? 'fish' : 'meat', 6);
      zeSfx('peck');
    }
  }
}

function zeFallThrough(game) {
  if (game.phase === 'play' && game.gy < ZE_FLOOR && game.y >= game.gy - 0.5) {
    game.drop = 0.25;
    game.vy = 60;
  }
}

/** Squash and stretch (2026-10-30, the next round): flat as he lands and as he chews, long as he jumps — eased out over duration. */
const zeSquash = (game, kind, duration) => {
  game.sq = { k: kind, t: duration, d: duration };
};

/** The trackpad feels it (2026-10-30, the next round): the board's haptic bump on a kick that lands, a car arriving and
 *  the K.O. — the app's, never the demo's. */
const zeBump = (game, kind) => {
  if (!game.demo) haptic(kind);
};

/** A hit-stop (2026-10-30, the next round): the picture holds for duration — a kick that lands, a bite, a combo, the K.O. —, and a
 *  combo punches the camera in a little (game.punch, none under reduced motion). */
const zeHold = (game, duration, punch = false) => {
  game.freeze = Math.max(game.freeze, duration);
  if (punch) game.punch = 0.2;
};

function zeMute() {
  prefs.zeSound = !prefs.zeSound;
  savePrefs();
  zeLabels();

  if (!prefs.zeSound) zeHush();
  else if (ze.g.phase === 'play') {
    zeGroove(true);
    if (ze.g.ride) zeEngine(ze.g.ride.kind);
  }
}

/** Zé hears the board (2026-10-30, the next round): a chat that starts asking you while the game is up stops it with a
 *  card — who asks, and what; ⏎ goes to the chat, esc (or space) plays on. What landed or asked during a round is
 *  kept for the K.O. (game.news). From the stream's session events. */
function zeHeard(session, was, landed) {
  if (!$('#zeGame').open || session.muted) return;

  const game = ze.g;
  const now = asking(session) && visible(session) && !(was && asking(was));

  if (now) zeCall(game, session);

  if ((landed || now) && !game.demo) {
    game.news = game.news.filter(item => item.id !== session.id);
    game.news.push({ id: session.id, project: session.project, title: session.title, asks: !landed });
  }
}

function zeCall(game, session) {
  if (game.phase === 'call') {
    game.call.s = session;
    zeDraw();
    return;
  } // the newest one asking

  game.call = { s: session, from: game.phase };
  if (game.phase === 'play') ze.music?.ac.suspend().catch(() => {});
  game.phase = 'call';
  ze.keys = { l: 0, r: 0 };
  zeStop();
  zeDraw();
}

/** The call answered: to the chat (the game closes), or back to where the game was. True if there was one. */
function zeCallEnd(go) {
  const game = ze.g;
  const call = game.call;

  if (game.phase !== 'call' || !call) return false;
  game.call = null;

  if (go) {
    game.phase = call.from === 'play' ? 'pause' : call.from;
    $('#zeGame').close();
    openSession(call.s.id, { locate: true });
    return true;
  }

  if (call.from === 'play') {
    game.phase = 'pause';
    zePause(false);
  } else {
    game.phase = call.from;
    if (call.from === 'pause') zeDraw();
    else zeGo();
  }

  $('#zeGame').focus();
  return true;
}

const zeCallButtons = () => [
  { x: ZE_W / 2 - 172, y: 560, w: 164, h: 34, id: 'go', s: '⏎ GO TO IT' },
  { x: ZE_W / 2 + 8, y: 560, w: 164, h: 34, id: 'keep', s: 'ESC · KEEP PLAYING' },
];

/** MOSSAD (2026-10-30, the next round): everyone in sunglasses — him, the galos, the avó — and the band through a
 *  walkie-talkie (zeRadio); typed again, off. Its M turned the sound over on the way: turned back. */
function zeMossad() {
  ze.mossad = !ze.mossad;
  zeMute();
  zeRadio();
  ze.g.stamp = 1.2;
}

/** T: the vira, the malhão, the funk, round again — from the next beat. */
function zeTune() {
  prefs.zeBand = { vira: 'malhao', malhao: 'funk' }[prefs.zeBand] || 'vira';
  savePrefs();
  zeLabels();
  const music = ze.music;

  if (music?.track === 'band') {
    music.step = 0;
    music.at = music.ac.currentTime + 0.05;
  }
}

$('#zeTune').addEventListener('click', () => {
  zeTune();
  $('#zeGame').focus();
});

$('#zeGame').addEventListener('keydown', event => {
  if (event.metaKey || event.ctrlKey || event.altKey) return; // ⌥⌘Z, ⌘W and the rest are the board's

  const game = ze.g;
  const code = event.code;

  const take = () => {
    event.preventDefault();
    event.stopPropagation();
  };

  if (game.phase === 'call') {
    if (code === 'Enter' || code === 'Space') {
      take();
      if (!event.repeat) zeCallEnd(code === 'Enter');
    }

    return;
  } // a chat asking: ⏎ to it, space plays on (esc too)

  const two = !!game.galo && game.phase === 'play';
  const bird = two && ['KeyA', 'KeyD', 'KeyW'].includes(code); // A D W: the galo's, when it plays

  if (bird) {
    take();
    if (code === 'KeyW') {
      if (!event.repeat) zeFlap(game.galo);
    } else ze.keys2[code === 'KeyA' ? 'l' : 'r'] = 1;
    return;
  }

  if (
    game.phase === 'title' &&
    /^Key[A-Z]$/.test(code) &&
    !event.repeat &&
    (ze.typed = (ze.typed + code.slice(3)).slice(-6)) === 'MOSSAD'
  ) {
    ze.typed = '';
    zeMossad();
  } // typed on the title, for those who know — its D still moves the way to play back

  if (game.phase === 'title' && code === 'KeyG') {
    take();

    if (!event.repeat) {
      prefs.zeTwo = { null: 'coop', coop: 'versus' }[prefs.zeTwo] || null;
      savePrefs();
    }

    return;
  }

  const left = code === 'ArrowLeft' || code === 'KeyA';
  const right = code === 'ArrowRight' || code === 'KeyD';

  if (game.phase === 'title' && (left || right || /^Digit[1-4]$/.test(code))) {
    take();
    if (!event.repeat) zeSetDiff(left ? prefs.zeDiff - 1 : right ? prefs.zeDiff + 1 : +code.slice(5) - 1);
    return;
  }

  if (game.phase === 'over' && (left || right)) {
    take();
    const count = zeOverButtons().length;

    if (!event.repeat && game.overT > 0.8) game.sel = (game.sel + (right ? 1 : count - 1)) % count;
    return;
  }

  if (left || right) {
    take();
    ze.keys[left ? 'l' : 'r'] = 1;
    ze.aim = null;

    if (!event.repeat) {
      const facing = left ? -1 : 1;
      const now = performance.now();

      if (ze.tap?.f === facing && now - ze.tap.at < ZE_TAP * 1000) {
        zeDash(game, facing);
        ze.tap = null;
      } else ze.tap = { f: facing, at: now };
    } // twice: a dash

    return;
  }

  if (!['Space', 'Enter', 'ArrowUp', 'KeyW', 'ArrowDown', 'KeyS', 'KeyP', 'KeyM', 'KeyT'].includes(code)) return;
  take();
  if (event.repeat) return; // a key held down is one kick
  if (game.phase === 'play' && ze.music?.ac.state === 'suspended') ze.music.ac.resume().catch(() => {}); // a press may start it
  if (code === 'Space' || code === 'Enter') {
    if (game.phase === 'play') {
      zeKick(game);
      game.holdAt = game.t;
    } else if (game.phase === 'pause') zePause(false);
    else if (game.phase === 'title') zeStart();
    else if (game.overT > 0.8) zeOverAct(zeOverButtons()[game.sel]?.id); // not at once: a kick held at the K.O. is no new round
  } else if (code === 'ArrowUp' || code === 'KeyW') zeJump(game);
  else if (code === 'ArrowDown' || code === 'KeyS') zeFallThrough(game);
  else if (code === 'KeyP') {
    if (game.phase === 'play' || game.phase === 'pause') zePause(game.phase === 'play');
  } else if (code === 'KeyT') zeTune();
  else zeMute();
});

$('#zeGame').addEventListener('keyup', event => {
  const two = !!ze.g.galo;

  if (two && (event.code === 'KeyA' || event.code === 'KeyD')) {
    ze.keys2[event.code === 'KeyA' ? 'l' : 'r'] = 0;
    return;
  }

  if (event.code === 'ArrowLeft' || event.code === 'KeyA') ze.keys.l = 0;
  if (event.code === 'ArrowRight' || event.code === 'KeyD') ze.keys.r = 0;
  if (event.code === 'Space' || event.code === 'Enter') zeLetGo(ze.g);
});

$('#zeCanvas').addEventListener('pointermove', event => {
  ze.aim = (event.offsetX / event.currentTarget.clientWidth) * ZE_W;
});

$('#zeCanvas').addEventListener('pointerleave', () => {
  ze.aim = null;
});

$('#zeCanvas').addEventListener('pointerdown', event => {
  if (event.button !== 0) return;

  const game = ze.g;
  const pointerX = (event.offsetX / event.currentTarget.clientWidth) * ZE_W;
  const pointerY = (event.offsetY / event.currentTarget.clientHeight) * ZE_H;

  if (game.phase === 'title') {
    const hit = zeDiffButtons().find(button => zeIn(button, pointerX, pointerY));

    if (hit) zeSetDiff(hit.i);
    else if (zeIn(ZE_PANEL, pointerX, pointerY)) {
      game.card++;
      game.cardT = 0;
    } else zeStart();
  } else if (game.phase === 'over') {
    if (game.overT > 0.8) {
      const hit = zeOverButtons().find(button => zeIn(button, pointerX, pointerY));

      if (hit) zeOverAct(hit.id);
    }
  } else if (game.phase === 'call') {
    const hit = zeCallButtons().find(button => zeIn(button, pointerX, pointerY));

    if (hit) zeCallEnd(hit.id === 'go');
  } else if (game.phase === 'play') {
    zeKick(game);
    game.holdAt = game.t;
  } else zePause(false);
});

$('#zeCanvas').addEventListener('pointerup', event => {
  if (event.button === 0) zeLetGo(ze.g);
});

$('#zeGame').addEventListener('click', event => {
  // the backdrop — not the gap between the picture and its foot
  const rect = event.currentTarget.getBoundingClientRect();

  if (
    event.target === event.currentTarget &&
    (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)
  ) {
    event.currentTarget.close();
  }
});

// the keys let go, and the round paused, when the game is not what you are looking at
const zeAway = () => {
  ze.keys = { l: 0, r: 0 };
  ze.keys2 = { l: 0, r: 0 };
  if ($('#zeGame').open && ze.g.phase === 'play') zePause(true);
};

window.addEventListener('blur', zeAway);

document.addEventListener('visibilitychange', () => {
  if (document.hidden) zeAway();
});
