  /** The title's rules, a card at a time (ZE_RULES), turning every ZE_CARD_T s — or on a click; flat under reduced motion. */
  const ZE_CARD_T = 4.5, ZE_PANEL = { x: 50, y: 190, w: ZE_W - 100, h: 222 };
  const ZE_RULES = ['EAT', 'AVOID', 'THE ROUND', 'TROPHIES'];
  function zeRuleCard(cx, g) {
    const P = ZE_PANEL, mid = ZE_W / 2, i = g.card % ZE_RULES.length, flat = zeCalm() || g.cardT >= .5, out = !flat && g.cardT < .25;   // the last card turning away, then this one turning in
    cx.save(); cx.translate(mid, P.y + P.h / 2); cx.scale(flat ? 1 : Math.max(.02, out ? 1 - g.cardT / .25 : (g.cardT - .25) / .25), 1); cx.translate(-mid, -(P.y + P.h / 2));
    cx.fillStyle = 'rgba(20, 6, 34, .82)'; cx.strokeStyle = 'rgba(255, 243, 196, .2)'; cx.lineWidth = 2;
    cx.beginPath(); cx.roundRect(P.x, P.y, P.w, P.h, 10); cx.fill(); cx.stroke();
    const shown = out ? (i + ZE_RULES.length - 1) % ZE_RULES.length : i, y0 = P.y;
    zeText(cx, ZE_RULES[shown], mid, y0 + 26, 17, '#ffd23f', 'center');
    ZE_RULES.forEach((_, j) => { cx.fillStyle = j === shown ? '#ffd23f' : 'rgba(255, 243, 196, .25)'; cx.beginPath(); cx.arc(mid - 27 + j * 18, y0 + P.h - 14, 4, 0, Math.PI * 2); cx.fill(); });
    if (shown === 0) {
      ZE_MEAT.forEach(([e, pts], j) => { cx.drawImage(zeGlyph(e), 160 + j * 64, y0 + 50, 44, 44); zeText(cx, String(pts), 182 + j * 64, y0 + 104, 12, '#ffd23f', 'center'); });
      zeText(cx, 'meat makes him buff — greens thin — only bones: K.O.', mid, y0 + 134, 14, '#fff3c4', 'center', 600);
      zeText(cx, '🐓 the rooster: muscle · 🐟 fish: five, no bulk · a francesinha, a vinho verde, a bifana: power', mid, y0 + 162, 12, '#d9c7e8', 'center', 600);
      zeText(cx, '← → run · ↑ jumps (twice, buff) · ← ← dashes', mid, y0 + 184, 12, '#d9c7e8', 'center', 600);
    } else if (shown === 1) {
      ZE_VEG.slice(0, 5).concat(ZE_VEG.slice(-4)).forEach(([e], j) => cx.drawImage(zeGlyph(e), 104 + j * 56 + (j > 4 ? 14 : 0), y0 + 50, 40, 40));
      zeText(cx, 'not what they seem!', 534, y0 + 102, 12, '#ff5a64', 'center', 600);
      zeText(cx, 'kick the greens out of the sky — space — or let one shave past: RASPÃO!', mid, y0 + 134, 14, '#fff3c4', 'center', 600);
      zeText(cx, `${ZE_NUN} kicks fill the nunchaku: hold space, let go — every green swept`, mid, y0 + 162, 12, '#d9c7e8', 'center', 600);
      zeText(cx, 'the awning and the sign hold him — ↓ drops through', mid, y0 + 184, 12, '#d9c7e8', 'center', 600);
    } else if (shown === 2) {
      zeText(cx, `${ZE_FOCUS_ROW} MEATS IN A ROW: A FORD FOCUS — FASTER`, mid, y0 + 64, 15, ZE_CARS.focus.c, 'center');
      zeText(cx, '3 GREENS IN A ROW: A MERCEDES A-CLASS — SLOWER', mid, y0 + 92, 15, ZE_CARS.aclass.c, 'center');
      zeText(cx, `LEVEL ${ZE_DRAGON_LEVEL}: ENTER THE DRAGON`, mid, y0 + 124, 16, '#ff7a2a', 'center');
      zeText(cx, `EVERY ${ZE_AVO_EVERY}TH LEVEL: THE AVÓ DA HORTA — KICK HER COUVES BACK`, mid, y0 + 152, 14, '#9be15d', 'center');
      zeText(cx, `a new sky every ${ZE_SKY_LEVELS} levels · every ${ZE_PACE.bite} the greens bite harder · the same falls for all today`, mid, y0 + 182, 12, '#d9c7e8', 'center', 600);
    } else {
      const won = zeTrophies().won;
      ZE_TROPHIES.forEach(([id, e, name, how], j) => {
        const x = j % 2 ? mid + 12 : P.x + 22, y = y0 + 50 + (j >> 1) * 23;
        cx.globalAlpha = won[id] ? 1 : .35; cx.drawImage(zeGlyph(e), x, y - 10, 20, 20);
        zeText(cx, name, x + 26, y, 12, won[id] ? '#ffd23f' : '#d9c7e8', 'left', 700); cx.globalAlpha = 1;
        zeText(cx, how, x + 34 + cx.measureText(name).width, y, 10, '#d9c7e8', 'left', 500);   // after the name, in the font it was drawn in
      });
    }
    cx.restore();
  }
  /** As Agent Zé, the pause is his file (2026-10-30, the next round): OPERATION BIFANA, most of it blacked out. */
  const ZE_FILE = [['AGENT', 'ZÉ ▇▇▇▇▇▇▇▇'], ['ALSO KNOWN AS', 'THE BRUCE LEE OF BARCELOS'], ['BASE', '▇▇▇▇▇▇▇, BARCELOS'], ['OPERATION', 'BIFANA'],
    ['MISSION', '▇▇▇ ▇▇▇▇▇▇ ▇▇ ▇▇▇▇ bifana ▇▇▇ ▇▇▇▇▇'], ['WEAKNESS', '▇▇▇▇▇▇▇▇ (green)'], ['CONTACT', 'TROTA\'S, ▇▇▇▇ TABLE ▇'], ['STATUS', '▇▇▇▇▇▇▇▇▇▇▇▇▇▇']];
  function zeDossier(cx) {
    const x = 96, y = 170, w = ZE_W - 192, h = 470, K = '#1b0b2e', type = s => `${s}px "Courier New", ui-monospace, monospace`;
    cx.save(); cx.translate(ZE_W / 2, y + h / 2); cx.rotate(-.025); cx.translate(-ZE_W / 2, -(y + h / 2));
    cx.fillStyle = K; cx.fillRect(x - 3, y - 33, 186, 36); cx.fillRect(x - 3, y - 3, w + 6, h + 6);
    cx.fillStyle = '#d8b878'; cx.fillRect(x, y - 30, 180, 32); cx.fillRect(x, y, w, h);   // the folder, its tab
    cx.fillStyle = '#c9a868'; cx.fillRect(x, y + h - 30, w, 30);
    cx.fillStyle = '#3a2a1a'; cx.font = type(14); cx.textAlign = 'left'; cx.textBaseline = 'middle'; cx.fillText('FILE 007/ZÉ', x + 14, y - 14);
    cx.font = `900 ${30}px "Courier New", ui-monospace, monospace`; cx.fillText('OPERATION BIFANA', x + 28, y + 48);
    ZE_FILE.forEach(([k, v], i) => {
      const ly = y + 104 + i * 38; cx.font = type(13); cx.fillStyle = '#5a4630'; cx.fillText(k, x + 28, ly);
      let vx = x + 168; cx.font = `700 ${16}px "Courier New", ui-monospace, monospace`;
      for (const part of v.split(/(▇+)/)) {   // the blacked-out parts as bars
        if (!part) continue;
        const pw = cx.measureText(part).width;
        if (part[0] === '▇') { cx.fillStyle = '#0e0c12'; cx.fillRect(vx, ly - 9, pw, 18); } else { cx.fillStyle = '#1b1208'; cx.fillText(part, vx, ly); }
        vx += pw;
      }
    });
    cx.save(); cx.translate(x + w - 130, y + h - 92); cx.rotate(-.2);   // the stamp
    cx.strokeStyle = '#c8322f'; cx.lineWidth = 4; cx.strokeRect(-96, -24, 192, 48);
    cx.font = '900 20px Futura, "Avenir Next Condensed", system-ui, sans-serif'; cx.textAlign = 'center'; cx.fillStyle = '#c8322f'; cx.fillText('TOP SECRET', 0, -6); cx.font = '700 14px system-ui, sans-serif'; cx.fillText('סודי ביותר', 0, 13);
    cx.restore();
    cx.font = type(13); cx.fillStyle = '#3a2a1a'; cx.textAlign = 'center'; cx.fillText('THIS FILE WILL SELF-DESTRUCT · P OR SPACE TO GO ON', ZE_W / 2, y + h - 15);
    cx.restore();
  }
  /** The title's demo: Zé on his own (g.demo) — after the lowest meat, kicking a green that comes near, out from under
   *  one that falls on him; now and then a jump. -1, 0, 1. */
  function zeBot(g) {
    const k = zeSz(g), live = g.items.filter(it => !it.out);
    const green = live.find(it => it.kind === 'veg' && Math.abs(it.x - g.x) < 110 * k && it.y > g.y - 150 * k && it.y < g.y - 30);
    if (green) { g.f = Math.sign(green.x - g.x) || g.f; if (Math.abs(green.x - g.x) > 30 * k) zeKick(g); else return green.x > g.x ? -1 : 1; }
    const meat = live.filter(it => it.kind !== 'veg').sort((a, b) => b.y - a.y)[0];
    if (meat && meat.y < g.y - 260 && Math.abs(meat.x - g.x) < 40 && Math.random() < .01) zeJump(g);
    const to = meat ? meat.x : ZE_W / 2;
    return Math.abs(to - g.x) < 12 ? 0 : Math.sign(to - g.x);
  }
  function zeCard(cx, g) {
    if (g.phase === 'title') {   // the demo shows through below the menu
      const sh = cx.createLinearGradient(0, 0, 0, ZE_FLOOR); sh.addColorStop(0, 'rgba(20, 6, 34, .7)'); sh.addColorStop(.7, 'rgba(20, 6, 34, .55)'); sh.addColorStop(.78, 'rgba(20, 6, 34, .1)'); sh.addColorStop(1, 'rgba(20, 6, 34, 0)');
      cx.fillStyle = sh; cx.fillRect(0, 0, ZE_W, ZE_H);
    } else { cx.fillStyle = 'rgba(20, 6, 34, .58)'; cx.fillRect(0, 0, ZE_W, ZE_H); }
    const D = zeDiff(), mid = ZE_W / 2, blink = zeCalm() ? 1 : .55 + .45 * Math.sin(g.t * 5);
    const big = (s, y, size) => {   // the 70s way: the word twice behind itself, in pink and teal
      cx.font = `italic 900 ${size}px Futura, "Avenir Next Condensed", system-ui, sans-serif`; cx.textAlign = 'center'; cx.textBaseline = 'middle';
      for (const [d, c] of [[size / 11, '#ff4f9a'], [size / 22, '#00c2c7']]) { cx.fillStyle = c; cx.fillText(s, mid + d, y + d); }
      zeText(cx, s, mid, y, size, '#ffd23f', 'center', 900);
    };
    if (g.phase === 'title') {   // a title that plays (2026-10-30, the next round): the demo round behind it, the logo on the band's beat, the rules on cards that turn
      const beat = { vira: 60 / 184, malhao: 60 / 132, funk: 60 / ZE_BPM }[prefs.zeBand] || 60 / 184, hop = zeCalm() ? 0 : Math.abs(Math.sin(Math.PI * g.t / beat)) ** 3 * 12;
      big('ZÉ', 96 - hop, 116);
      if (ze.mossad) {   // MOSSAD, stamped
        cx.save(); cx.translate(mid + 150, 92); cx.rotate(-.18); cx.scale(1 + (g.stamp || 0) * .8, 1 + (g.stamp || 0) * .8);
        cx.strokeStyle = '#e43b44'; cx.lineWidth = 4; cx.strokeRect(-70, -20, 140, 40);
        cx.font = '900 24px Futura, "Avenir Next Condensed", system-ui, sans-serif'; cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.fillStyle = '#e43b44'; cx.fillText('MOSSAD', 0, 1); cx.restore();
      }
      zeText(cx, 'THE BRUCE LEE OF BARCELOS', mid, 166, 26, '#fff3c4', 'center');
      zeRuleCard(cx, g);
      zeDiffButtons().forEach(b => zeButton(cx, b, ZE_DIFFS[b.i].name, b.i === prefs.zeDiff, ZE_DIFFS[b.i].c));
      zeText(cx, `${D.say} · ← → or 1–4`, mid, 472, 13, D.c, 'center', 600);
      zeText(cx, `T · music: ${ZE_BANDS[prefs.zeBand] || 'FUNK'} · G · player two: ${prefs.zeTwo ? prefs.zeTwo.toUpperCase() : 'OFF'}`, mid, 496, 13, '#d9c7e8', 'center', 600);
      cx.globalAlpha = blink; zeText(cx, 'SPACE TO START', mid, 534, 24, '#7ef0ff', 'center'); cx.globalAlpha = 1;
      const best = zeBests()[D.id], today = zeDayBests()[D.id];
      zeText(cx, `THE DAY'S ROUND · ${zeToday()}${best ? ` · TODAY ${today || 0} · BEST ${best}` : ''}`, mid, 566, 13, '#d9c7e8', 'center', 600);
      const won = zeTrophies().won;   // the trophies, lit or dim
      ZE_TROPHIES.forEach(([id, e], i) => { cx.globalAlpha = won[id] ? 1 : .22; cx.drawImage(zeGlyph(e), mid - 6 * 34 + i * 34 + 4, 584, 26, 26); });
      cx.globalAlpha = 1;
    } else if (g.phase === 'call') {   // a chat asking you
      const c = g.call.s, cut = (t, n) => t.length > n ? t.slice(0, n - 1) + '…' : t;
      cx.fillStyle = '#1b0b2e'; cx.beginPath(); cx.roundRect(77, 287, ZE_W - 154, 336, 16); cx.fill();
      cx.fillStyle = '#2a1a40'; cx.strokeStyle = '#ff5a64'; cx.lineWidth = 3; cx.beginPath(); cx.roundRect(80, 290, ZE_W - 160, 330, 14); cx.fill(); cx.stroke();
      zeText(cx, 'CLAUDE IS ASKING', mid, 336, 30, zeBlink(g, 3) ? '#ff5a64' : '#ffd23f', 'center', 900);
      zeText(cx, cut(c.project || '', 34), mid, 398, 24, '#fff3c4', 'center');
      zeText(cx, cut(c.title || '', 50), mid, 436, 16, '#d9c7e8', 'center', 600);
      zeText(cx, cut(askWhat(c), 60), mid, 486, 15, '#ffb3b8', 'center', 600);
      zeCallButtons().forEach((b, i) => zeButton(cx, b, b.s, !i, '#ffd23f'));
    } else if (g.phase === 'pause' && g.agent) zeDossier(cx);
    else if (g.phase === 'pause') {
      big('PAUSE', 400, 84);
      zeText(cx, 'P or space to go on', mid, 470, 18, '#fff3c4', 'center', 600);
    } else {
      if (g.news.length) {   // what landed while you played
        zeText(cx, 'WHILE YOU PLAYED', mid, 30, 12, '#ffd23f', 'center', 700);
        g.news.slice(-3).reverse().forEach((n, i) => zeText(cx, `${n.project} · ${n.title.length > 34 ? n.title.slice(0, 33) + '…' : n.title} — ${n.asks ? 'is asking you' : 'landed'}`, mid, 54 + i * 22, 14, n.asks ? '#ffb3b8' : '#a6dc5a', 'center', 600));
      }
      zeText(cx, `“${g.quote}”`, mid, 164, 18, '#fff3c4', 'center', 600);
      zeText(cx, '— BRUCE LEE, MORE OR LESS', mid, 192, 12, '#d9c7e8', 'center', 700);
      big('K.O.', 290, 110);
      zeText(cx, 'ONLY BONES LEFT', mid, 372, 26, '#f2ead8', 'center');
      zeText(cx, g.ko, mid, 410, 20, '#fff3c4', 'center', 600);
      zeText(cx, `${D.name} · LEVEL ${g.level}`, mid, 444, 15, D.c, 'center');
      if (g.galo?.mode === 'versus') zeText(cx, `ZÉ ${g.score} · GALO ${g.galo.score} — ${g.score > g.galo.score ? 'ZÉ WINS' : g.score < g.galo.score ? 'THE GALO WINS' : 'A DRAW'}`, mid, 488, 26, '#fff3c4', 'center');
      else zeText(cx, `SCORE ${g.score}`, mid, 488, 32, '#fff3c4', 'center');
      const news = g.best ? 'A NEW BEST!' : g.todays ? 'TODAY\'S BEST!' : null;
      zeText(cx, news || `TODAY ${zeDayBests()[D.id] || 0} · BEST EVER ${zeBests()[D.id] || 0}`, mid, 528, 18, news ? (zeBlink(g, 4) ? '#ffd23f' : '#feae34') : '#d9c7e8', 'center');
      if (news) zeText(cx, `TODAY ${zeDayBests()[D.id] || 0} · BEST EVER ${zeBests()[D.id] || 0}`, mid, 552, 13, '#d9c7e8', 'center', 600);
      if (g.overT > .8) zeOverButtons().forEach((b, i) => zeButton(cx, b, b.s, i === g.sel, '#ffd23f'));
      if (g.roomSay) zeText(cx, g.roomSay, mid, 620, 13, g.posted === 'failed' || g.polled === 'failed' ? '#ff5a64' : '#a6dc5a', 'center', 600);
    }
  }
