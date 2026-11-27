/** The title's rules, a card at a time (ZE_RULES), turning every ZE_CARD_T s — or on a click; flat under reduced motion. */
const ZE_CARD_T = 4.5;
const ZE_PANEL = { x: 50, y: 190, w: ZE_W - 100, h: 222 };

const ZE_RULES = ['EAT', 'AVOID', 'THE ROUND', 'TROPHIES'];

function zeRuleCard(cx, game) {
  const PANEL = ZE_PANEL;
  const mid = ZE_W / 2;
  const rule = game.card % ZE_RULES.length;
  const flat = zeCalm() || game.cardT >= 0.5;
  const out = !flat && game.cardT < 0.25; // the last card turning away, then this one turning in

  cx.save();
  cx.translate(mid, PANEL.y + PANEL.h / 2);
  cx.scale(flat ? 1 : Math.max(0.02, out ? 1 - game.cardT / 0.25 : (game.cardT - 0.25) / 0.25), 1);
  cx.translate(-mid, -(PANEL.y + PANEL.h / 2));
  cx.fillStyle = 'rgba(20, 6, 34, .82)';
  cx.strokeStyle = 'rgba(255, 243, 196, .2)';
  cx.lineWidth = 2;
  cx.beginPath();
  cx.roundRect(PANEL.x, PANEL.y, PANEL.w, PANEL.h, 10);
  cx.fill();
  cx.stroke();

  const shown = out ? (rule + ZE_RULES.length - 1) % ZE_RULES.length : rule;
  const y0 = PANEL.y;

  zeText(cx, ZE_RULES[shown], mid, y0 + 26, 17, '#ffd23f', 'center');

  ZE_RULES.forEach((_, index) => {
    cx.fillStyle = index === shown ? '#ffd23f' : 'rgba(255, 243, 196, .25)';
    cx.beginPath();
    cx.arc(mid - 27 + index * 18, y0 + PANEL.h - 14, 4, 0, Math.PI * 2);
    cx.fill();
  });

  if (shown === 0) {
    ZE_MEAT.forEach(([emoji, pts], index) => {
      cx.drawImage(zeGlyph(emoji), 160 + index * 64, y0 + 50, 44, 44);
      zeText(cx, String(pts), 182 + index * 64, y0 + 104, 12, '#ffd23f', 'center');
    });

    zeText(cx, 'meat makes him buff — greens thin — only bones: K.O.', mid, y0 + 134, 14, '#fff3c4', 'center', 600);

    zeText(
      cx,
      '🐓 the rooster: muscle · 🐟 fish: five, no bulk · a francesinha, a vinho verde, a bifana: power',
      mid,
      y0 + 162,
      12,
      '#d9c7e8',
      'center',
      600,
    );

    zeText(cx, '← → run · ↑ jumps (twice, buff) · ← ← dashes', mid, y0 + 184, 12, '#d9c7e8', 'center', 600);
  } else if (shown === 1) {
    ZE_VEG.slice(0, 5)
      .concat(ZE_VEG.slice(-4))
      .forEach(([emoji], index) =>
        cx.drawImage(zeGlyph(emoji), 104 + index * 56 + (index > 4 ? 14 : 0), y0 + 50, 40, 40),
      );

    zeText(cx, 'not what they seem!', 534, y0 + 102, 12, '#ff5a64', 'center', 600);

    zeText(
      cx,
      'kick the greens out of the sky — space — or let one shave past: RASPÃO!',
      mid,
      y0 + 134,
      14,
      '#fff3c4',
      'center',
      600,
    );

    zeText(
      cx,
      `${ZE_NUN} kicks fill the nunchaku: hold space, let go — every green swept`,
      mid,
      y0 + 162,
      12,
      '#d9c7e8',
      'center',
      600,
    );

    zeText(cx, 'the awning and the sign hold him — ↓ drops through', mid, y0 + 184, 12, '#d9c7e8', 'center', 600);
  } else if (shown === 2) {
    zeText(cx, `${ZE_FOCUS_ROW} MEATS IN A ROW: A FORD FOCUS — FASTER`, mid, y0 + 64, 15, ZE_CARS.focus.c, 'center');
    zeText(cx, '3 GREENS IN A ROW: A MERCEDES A-CLASS — SLOWER', mid, y0 + 92, 15, ZE_CARS.aclass.c, 'center');
    zeText(cx, `LEVEL ${ZE_DRAGON_LEVEL}: ENTER THE DRAGON`, mid, y0 + 124, 16, '#ff7a2a', 'center');

    zeText(
      cx,
      `EVERY ${ZE_AVO_EVERY}TH LEVEL: THE AVÓ DA HORTA — KICK HER COUVES BACK`,
      mid,
      y0 + 152,
      14,
      '#9be15d',
      'center',
    );

    zeText(
      cx,
      `a new sky every ${ZE_SKY_LEVELS} levels · every ${ZE_PACE.bite} the greens bite harder · the same falls for all today`,
      mid,
      y0 + 182,
      12,
      '#d9c7e8',
      'center',
      600,
    );
  } else {
    const won = zeTrophies().won;

    ZE_TROPHIES.forEach(([id, emoji, name, how], index) => {
      const left = index % 2 ? mid + 12 : PANEL.x + 22;
      const top = y0 + 50 + (index >> 1) * 23;

      cx.globalAlpha = won[id] ? 1 : 0.35;
      cx.drawImage(zeGlyph(emoji), left, top - 10, 20, 20);
      zeText(cx, name, left + 26, top, 12, won[id] ? '#ffd23f' : '#d9c7e8', 'left', 700);
      cx.globalAlpha = 1;
      zeText(cx, how, left + 34 + cx.measureText(name).width, top, 10, '#d9c7e8', 'left', 500); // after the name, in the font it was drawn in
    });
  }

  cx.restore();
}

/** As Agent Zé, the pause is his file (2026-10-30, the next round): OPERATION BIFANA, most of it blacked out. */
const ZE_FILE = [
  ['AGENT', 'ZÉ ▇▇▇▇▇▇▇▇'],
  ['ALSO KNOWN AS', 'THE BRUCE LEE OF BARCELOS'],
  ['BASE', '▇▇▇▇▇▇▇, BARCELOS'],
  ['OPERATION', 'BIFANA'],
  ['MISSION', '▇▇▇ ▇▇▇▇▇▇ ▇▇ ▇▇▇▇ bifana ▇▇▇ ▇▇▇▇▇'],
  ['WEAKNESS', '▇▇▇▇▇▇▇▇ (green)'],
  ['CONTACT', "TROTA'S, ▇▇▇▇ TABLE ▇"],
  ['STATUS', '▇▇▇▇▇▇▇▇▇▇▇▇▇▇'],
];

function zeDossier(cx) {
  const left = 96;
  const top = 170;
  const width = ZE_W - 192;
  const height = 470;
  const EDGE = '#1b0b2e';
  const type = size => `${size}px "Courier New", ui-monospace, monospace`;

  cx.save();
  cx.translate(ZE_W / 2, top + height / 2);
  cx.rotate(-0.025);
  cx.translate(-ZE_W / 2, -(top + height / 2));
  cx.fillStyle = EDGE;
  cx.fillRect(left - 3, top - 33, 186, 36);
  cx.fillRect(left - 3, top - 3, width + 6, height + 6);
  cx.fillStyle = '#d8b878';
  cx.fillRect(left, top - 30, 180, 32);
  cx.fillRect(left, top, width, height); // the folder, its tab
  cx.fillStyle = '#c9a868';
  cx.fillRect(left, top + height - 30, width, 30);
  cx.fillStyle = '#3a2a1a';
  cx.font = type(14);
  cx.textAlign = 'left';
  cx.textBaseline = 'middle';
  cx.fillText('FILE 007/ZÉ', left + 14, top - 14);
  cx.font = `900 ${30}px "Courier New", ui-monospace, monospace`;
  cx.fillText('OPERATION BIFANA', left + 28, top + 48);

  ZE_FILE.forEach(([label, value], index) => {
    const ly = top + 104 + index * 38;

    cx.font = type(13);
    cx.fillStyle = '#5a4630';
    cx.fillText(label, left + 28, ly);
    let vx = left + 168;

    cx.font = `700 ${16}px "Courier New", ui-monospace, monospace`;

    for (const part of value.split(/(▇+)/)) {
      // the blacked-out parts as bars
      if (!part) continue;
      const pw = cx.measureText(part).width;

      if (part[0] === '▇') {
        cx.fillStyle = '#0e0c12';
        cx.fillRect(vx, ly - 9, pw, 18);
      } else {
        cx.fillStyle = '#1b1208';
        cx.fillText(part, vx, ly);
      }

      vx += pw;
    }
  });

  cx.save();
  cx.translate(left + width - 130, top + height - 92);
  cx.rotate(-0.2); // the stamp
  cx.strokeStyle = '#c8322f';
  cx.lineWidth = 4;
  cx.strokeRect(-96, -24, 192, 48);
  cx.font = '900 20px Futura, "Avenir Next Condensed", system-ui, sans-serif';
  cx.textAlign = 'center';
  cx.fillStyle = '#c8322f';
  cx.fillText('TOP SECRET', 0, -6);
  cx.font = '700 14px system-ui, sans-serif';
  cx.fillText('סודי ביותר', 0, 13);
  cx.restore();
  cx.font = type(13);
  cx.fillStyle = '#3a2a1a';
  cx.textAlign = 'center';
  cx.fillText('THIS FILE WILL SELF-DESTRUCT · P OR SPACE TO GO ON', ZE_W / 2, top + height - 15);
  cx.restore();
}

/** The title's demo: Zé on his own (game.demo) — after the lowest meat, kicking a green that comes near, out from under
 *  one that falls on him; now and then a jump. -1, 0, 1. */
function zeBot(game) {
  const size = zeSz(game);
  const live = game.items.filter(it => !it.out);

  const green = live.find(
    it => it.kind === 'veg' && Math.abs(it.x - game.x) < 110 * size && it.y > game.y - 150 * size && it.y < game.y - 30,
  );

  if (green) {
    game.f = Math.sign(green.x - game.x) || game.f;
    if (Math.abs(green.x - game.x) > 30 * size) zeKick(game);
    else return green.x > game.x ? -1 : 1;
  }

  const meat = live.filter(it => it.kind !== 'veg').sort((left, right) => right.y - left.y)[0];

  if (meat && meat.y < game.y - 260 && Math.abs(meat.x - game.x) < 40 && Math.random() < 0.01) zeJump(game);
  const to = meat ? meat.x : ZE_W / 2;

  return Math.abs(to - game.x) < 12 ? 0 : Math.sign(to - game.x);
}

function zeCard(cx, game) {
  if (game.phase === 'title') {
    // the demo shows through below the menu
    const sh = cx.createLinearGradient(0, 0, 0, ZE_FLOOR);

    sh.addColorStop(0, 'rgba(20, 6, 34, .7)');
    sh.addColorStop(0.7, 'rgba(20, 6, 34, .55)');
    sh.addColorStop(0.78, 'rgba(20, 6, 34, .1)');
    sh.addColorStop(1, 'rgba(20, 6, 34, 0)');
    cx.fillStyle = sh;
    cx.fillRect(0, 0, ZE_W, ZE_H);
  } else {
    cx.fillStyle = 'rgba(20, 6, 34, .58)';
    cx.fillRect(0, 0, ZE_W, ZE_H);
  }

  const difficulty = zeDiff();
  const mid = ZE_W / 2;
  const blink = zeCalm() ? 1 : 0.55 + 0.45 * Math.sin(game.t * 5);

  const big = (word, centerY, size) => {
    // the 70s way: the word twice behind itself, in pink and teal
    cx.font = `italic 900 ${size}px Futura, "Avenir Next Condensed", system-ui, sans-serif`;
    cx.textAlign = 'center';
    cx.textBaseline = 'middle';

    for (const [offset, color] of [
      [size / 11, '#ff4f9a'],
      [size / 22, '#00c2c7'],
    ]) {
      cx.fillStyle = color;
      cx.fillText(word, mid + offset, centerY + offset);
    }

    zeText(cx, word, mid, centerY, size, '#ffd23f', 'center', 900);
  };

  if (game.phase === 'title') {
    // a title that plays (2026-10-30, the next round): the demo round behind it, the logo on the band's beat, the rules on cards that turn
    const beat = { vira: 60 / 184, malhao: 60 / 132, funk: 60 / ZE_BPM }[prefs.zeBand] || 60 / 184;
    const hop = zeCalm() ? 0 : Math.abs(Math.sin((Math.PI * game.t) / beat)) ** 3 * 12;

    big('ZÉ', 96 - hop, 116);

    if (ze.mossad) {
      // MOSSAD, stamped
      cx.save();
      cx.translate(mid + 150, 92);
      cx.rotate(-0.18);
      cx.scale(1 + (game.stamp || 0) * 0.8, 1 + (game.stamp || 0) * 0.8);
      cx.strokeStyle = '#e43b44';
      cx.lineWidth = 4;
      cx.strokeRect(-70, -20, 140, 40);
      cx.font = '900 24px Futura, "Avenir Next Condensed", system-ui, sans-serif';
      cx.textAlign = 'center';
      cx.textBaseline = 'middle';
      cx.fillStyle = '#e43b44';
      cx.fillText('MOSSAD', 0, 1);
      cx.restore();
    }

    zeText(cx, 'THE BRUCE LEE OF BARCELOS', mid, 166, 26, '#fff3c4', 'center');
    zeRuleCard(cx, game);

    zeDiffButtons().forEach(button =>
      zeButton(cx, button, ZE_DIFFS[button.i].name, button.i === prefs.zeDiff, ZE_DIFFS[button.i].c),
    );

    zeText(cx, `${difficulty.say} · ← → or 1–4`, mid, 472, 13, difficulty.c, 'center', 600);

    zeText(
      cx,
      `T · music: ${ZE_BANDS[prefs.zeBand] || 'FUNK'} · G · player two: ${prefs.zeTwo ? prefs.zeTwo.toUpperCase() : 'OFF'}`,
      mid,
      496,
      13,
      '#d9c7e8',
      'center',
      600,
    );

    cx.globalAlpha = blink;
    zeText(cx, 'SPACE TO START', mid, 534, 24, '#7ef0ff', 'center');
    cx.globalAlpha = 1;

    const best = zeBests()[difficulty.id];
    const today = zeDayBests()[difficulty.id];

    zeText(
      cx,
      `THE DAY'S ROUND · ${zeToday()}${best ? ` · TODAY ${today || 0} · BEST ${best}` : ''}`,
      mid,
      566,
      13,
      '#d9c7e8',
      'center',
      600,
    );

    const won = zeTrophies().won; // the trophies, lit or dim

    ZE_TROPHIES.forEach(([id, emoji], index) => {
      cx.globalAlpha = won[id] ? 1 : 0.22;
      cx.drawImage(zeGlyph(emoji), mid - 6 * 34 + index * 34 + 4, 584, 26, 26);
    });

    cx.globalAlpha = 1;
  } else if (game.phase === 'call') {
    // a chat asking you
    const session = game.call.s;
    const cut = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

    cx.fillStyle = '#1b0b2e';
    cx.beginPath();
    cx.roundRect(77, 287, ZE_W - 154, 336, 16);
    cx.fill();
    cx.fillStyle = '#2a1a40';
    cx.strokeStyle = '#ff5a64';
    cx.lineWidth = 3;
    cx.beginPath();
    cx.roundRect(80, 290, ZE_W - 160, 330, 14);
    cx.fill();
    cx.stroke();
    zeText(cx, 'CLAUDE IS ASKING', mid, 336, 30, zeBlink(game, 3) ? '#ff5a64' : '#ffd23f', 'center', 900);
    zeText(cx, cut(session.project || '', 34), mid, 398, 24, '#fff3c4', 'center');
    zeText(cx, cut(session.title || '', 50), mid, 436, 16, '#d9c7e8', 'center', 600);
    zeText(cx, cut(askWhat(session), 60), mid, 486, 15, '#ffb3b8', 'center', 600);
    zeCallButtons().forEach((button, index) => zeButton(cx, button, button.s, !index, '#ffd23f'));
  } else if (game.phase === 'pause' && game.agent) zeDossier(cx);
  else if (game.phase === 'pause') {
    big('PAUSE', 400, 84);
    zeText(cx, 'P or space to go on', mid, 470, 18, '#fff3c4', 'center', 600);
  } else {
    if (game.news.length) {
      // what landed while you played
      zeText(cx, 'WHILE YOU PLAYED', mid, 30, 12, '#ffd23f', 'center', 700);

      game.news
        .slice(-3)
        .reverse()
        .forEach((chat, index) =>
          zeText(
            cx,
            `${chat.project} · ${chat.title.length > 34 ? `${chat.title.slice(0, 33)}…` : chat.title} — ${chat.asks ? 'is asking you' : 'landed'}`,
            mid,
            54 + index * 22,
            14,
            chat.asks ? '#ffb3b8' : '#a6dc5a',
            'center',
            600,
          ),
        );
    }

    zeText(cx, `“${game.quote}”`, mid, 164, 18, '#fff3c4', 'center', 600);
    zeText(cx, '— BRUCE LEE, MORE OR LESS', mid, 192, 12, '#d9c7e8', 'center', 700);
    big('K.O.', 290, 110);
    zeText(cx, 'ONLY BONES LEFT', mid, 372, 26, '#f2ead8', 'center');
    zeText(cx, game.ko, mid, 410, 20, '#fff3c4', 'center', 600);
    zeText(cx, `${difficulty.name} · LEVEL ${game.level}`, mid, 444, 15, difficulty.c, 'center');
    if (game.galo?.mode === 'versus') {
      zeText(
        cx,
        `ZÉ ${game.score} · GALO ${game.galo.score} — ${game.score > game.galo.score ? 'ZÉ WINS' : game.score < game.galo.score ? 'THE GALO WINS' : 'A DRAW'}`,
        mid,
        488,
        26,
        '#fff3c4',
        'center',
      );
    } else zeText(cx, `SCORE ${game.score}`, mid, 488, 32, '#fff3c4', 'center');
    const news = game.best ? 'A NEW BEST!' : game.todays ? "TODAY'S BEST!" : null;

    zeText(
      cx,
      news || `TODAY ${zeDayBests()[difficulty.id] || 0} · BEST EVER ${zeBests()[difficulty.id] || 0}`,
      mid,
      528,
      18,
      news ? (zeBlink(game, 4) ? '#ffd23f' : '#feae34') : '#d9c7e8',
      'center',
    );

    if (news) {
      zeText(
        cx,
        `TODAY ${zeDayBests()[difficulty.id] || 0} · BEST EVER ${zeBests()[difficulty.id] || 0}`,
        mid,
        552,
        13,
        '#d9c7e8',
        'center',
        600,
      );
    }

    if (game.overT > 0.8) {
      zeOverButtons().forEach((button, index) => zeButton(cx, button, button.s, index === game.sel, '#ffd23f'));
    }

    if (game.roomSay) {
      zeText(
        cx,
        game.roomSay,
        mid,
        620,
        13,
        game.posted === 'failed' || game.polled === 'failed' ? '#ff5a64' : '#a6dc5a',
        'center',
        600,
      );
    }
  }
}
