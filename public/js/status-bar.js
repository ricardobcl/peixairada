  // ---- the status bar: the machine at the window's foot (2026-10-09) ------------------------------------------------
  // The studies' F (Orca's): the connection, the chats live · clauding · asking, the drawers · shells · monitors, and on
  // the right what the settings add — CPU, memory, Claude's memory, asked of the server every 3 s while shown —, the
  // plan usage as small meters (a click: its rows in a panel over the board) and the Mac kept awake. On by default; the
  // settings' switch hides it, and the list's foot gets its usage back. Drawn when its markup changes (setHtml), from
  // renderBoard, the usage, the awake state, the stream's open and error, and each stats answer.
  const bar = { stats: {}, conn: true, lost: false, open: false, busy: false };
  const fmtBytes = b => b >= 2 ** 30 ? `${(b / 2 ** 30).toFixed(1)} GB` : `${Math.round(b / 2 ** 20)} MB`;
  // A meter past 90 % (2026-11-01, round XIX's S3): the ink and a ! that reads without colour, never the red that means asking
  const hotInk = p => p >= 90 ? 'var(--ink)' : 'var(--watch)', hotMark = p => p >= 90 ? '!' : '';
  const sbMeter = (label, pct, text, color, tip = `${label}: ${text}`, html = null) => `<span class="m" title="${esc(tip)}">${esc(label)}<i style="--p:${Math.max(0, Math.min(100, pct)).toFixed(1)}%;--u:${color}"></i><b>${html ?? esc(text)}</b></span>`;
  const FISH_LOGO = () => $('#logo').innerHTML;
  // The pixel fish (the home's, 2026-10-10), 26 × 11, head to the left: # its body, = its scales, o its eye.
  const FISH = ['..........######..........', '.......############.....##', '.....################..###', '...####=####=####=####.###', '..##o##=####=####=#######.',
    '.###=##=####=####=######..', '..######=####=####=######.', '...#####=####=####=###.###', '.....################..###', '.......############.....##', '..........######..........'];
  // …and swimming in the status bar at the pace of the agents at work (2026-10-11, RunCat's cat): `#sbSwim`, a lane of
  // its own outside the bar's redrawn slots, the fish an SVG of those pixels — its tail one of its own, wagging. The
  // swim is one animation whose pace follows the count (swimPaceTo keeps its place). It never stops (2026-10-11,
  // later; paused while nothing was at work before): nothing at work, it potters at half the pace; and it swims back
  // and forth, turning at either end (it went off the left and came back on the right before). A click is the overview.
  // Its lips are a path of their own (m, 2026-10-11, late night): hidden, its mouth is open. The whole fish is a box
  // (.fw) a pat can turn, the swimmer's own transform being the swim's.
  // Boxes, not SVG groups (2026-10-13): the swimmer a span, its body (.fb) and its tail (.ft) an svg each — WebKit never
  // hands an SVG group's transform to the compositor, so the tail's wag, always running, kept every frame of the board
  // on the main thread (a style pass and a walk of every layer, each frame); an svg in an HTML box it does.
  const fishRuns = (from, to, ch, rows = FISH) => rows.flatMap((r, y) => [...r.slice(from, to).matchAll(new RegExp(`[${ch}]+`, 'g'))].map(m => `M${m.index + from} ${y}h${m[0].length}v1h-${m[0].length}z`)).join('');
  const SWIM_ROWS = FISH.map((r, y) => y === 5 ? `.mmm${r.slice(4)}` : r);
  const FISH_BODY = `<path class="b" d="${fishRuns(0, 21, '#', SWIM_ROWS)}"/><path class="b m" d="${fishRuns(0, 21, 'm', SWIM_ROWS)}"/><path class="s" d="${fishRuns(0, 21, '=')}"/><path class="e" d="${fishRuns(0, 21, 'o')}"/>`, FISH_TAIL = `<path class="b" d="${fishRuns(21, 26, '#')}"/>`;
  const SWIM_FISH = `<span class="swimmer" aria-hidden="true"><span class="fw"><svg class="fb" viewBox="0 0 21 11" width="21" height="11" shape-rendering="crispEdges">${FISH_BODY}</svg>`
    + `<svg class="ft" viewBox="21 0 5 11" width="5" height="11" shape-rendering="crispEdges">${FISH_TAIL}</svg></span></span>`;
  const REST_FISH = `<svg class="restfish" viewBox="0 0 26 11" width="52" height="22" shape-rendering="crispEdges" aria-hidden="true">${FISH_BODY}${FISH_TAIL}</svg>`;   // the empty list's, still
  const swim = { n: -1, anim: null, w: 0, h: 0, food: [], eaten: 0, dart: false, raf: 0, patAt: -Infinity, out: false };
  // The lane is the bar's free room (2026-10-11, later), so its width moves: the swim's path is the lane's width and its
  // length keeps the fish's speed in pixels (92 px in 6 s, as in the 64 px lane it had), and a new width keeps where the
  // fish was. One iteration is a length each way: right to left head first, turned at the left (a mirror, at once — a
  // pixel fish has no frames between), left to right, turned at the right.
  const SWIM_PAD = 2, swimEnd = w => Math.max(SWIM_PAD, w - 26 - SWIM_PAD);
  const swimFrames = w => [{ transform: `translateX(${swimEnd(w)}px) scaleX(1)` }, { transform: `translateX(${SWIM_PAD}px) scaleX(1)`, offset: .5 },
    { transform: `translateX(${SWIM_PAD}px) scaleX(-1)`, offset: .5 }, { transform: `translateX(${swimEnd(w)}px) scaleX(-1)` }];
  const swimMs = w => Math.max(1000, 6000 * 2 * (swimEnd(w) - SWIM_PAD) / 92);
  const swimRate = n => [.5, 1, 1.35, 1.9, 2.3][Math.min(n, 4)] + Math.max(0, n - 4) * .45;
  // The pace is the swim's length, not its playback rate (2026-10-13): a rate other than 1 had WebKit resolve the swim on
  // the main thread every frame. A new pace or a new lane keeps where the fish is in its loop, at the new length.
  const swimLen = () => swim.anim.effect.getTiming().duration;
  function swimPaceTo(w = swim.w) {
    const a = swim.anim, D = swimLen(), p = (a.currentTime % D) / D, d = swimMs(w) / swimPace();
    if (Math.abs(d - D) < 1) return;
    a.effect.updateTiming({ duration: d }); a.currentTime = p * d;
  }
  new ResizeObserver(() => {
    const lane = $('#sbSwim'), a = swim.anim, w = lane.clientWidth; if (!a || !w || w === swim.w) return;
    a.effect.setKeyframes(swimFrames(w)); swimPaceTo(w); swim.w = w;
  }).observe($('#sbSwim'));
  function swimAt(n) {
    const lane = $('#sbSwim'); if (!lane) return;
    if (!lane.firstChild) { lane.innerHTML = SWIM_FISH; lane.addEventListener('click', () => ovOpen()); lane.firstChild.addEventListener('pointerenter', pat); }
    lane.title = n ? `${n} at work — the fish swims at their pace · click for every agent (⌥⌘A)` : 'nothing at work — click for every agent (⌥⌘A)';
    if (n === swim.n) return; swim.n = n;
    const f = lane.firstChild, w = lane.clientWidth || 64;
    lane.classList.toggle('rest', !n); lane.style.setProperty('--wag', n ? `${Math.max(.14, .5 / Math.sqrt(n))}s` : '1.6s');
    if (REDUCED.matches) return;
    if (!swim.anim) { swim.anim = f.animate(swimFrames(w), { duration: swimMs(w), iterations: Infinity, id: 'swim' }); swim.anim.currentTime = swimMs(w) / 4; swim.w = w; }   // from the lane's middle, heading left
    swimPaceTo(); noteMotion(null, 'swim', n);
  }
  // The lane is the minimap (2026-11-01, round XIX's W1; a switch, off by default): a fish per live chat in its project's
  // colour, each holding its own place, so you learn where a chat lives. At work it swims on the spot, watching slowly, ready
  // it rests dimmed, and asking it stops dead, red, with a ping. A click opens it. Past LANE_MAX the ones that want you stay
  // and a count stands for the rest. Places go by when each chat started, and a fish keeps its node, so nothing restarts.
  const LANE_MAX = 12;
  function schoolOf() {
    const live = [...state.sessions.values()].filter(s => visible(s) && s.alive && !s.done);
    const rank = s => asking(s) ? 0 : s.status === 'working' ? 1 : inWatch(s) ? 2 : 3;
    const kept = live.length > LANE_MAX ? [...live].sort((a, b) => rank(a) - rank(b) || byWord(a, b)).slice(0, LANE_MAX - 1) : live;
    return { kept: [...kept].sort((a, b) => String(a.startedAt).localeCompare(String(b.startedAt)) || a.id.localeCompare(b.id)), more: live.length - kept.length, rank };
  }
  function schoolBar() {
    const lane = $('#sbSwim'); if (!lane?.firstChild) return;
    const on = !!prefs.laneSchool;
    lane.classList.toggle('school', on);
    let box = lane.querySelector('.schoolbox');
    if (!on) { if (box) { box.remove(); if (!swim.out) swim.anim?.play(); } return; }
    if (swim.anim?.playState === 'running') swim.anim.pause();
    if (!box) {
      box = document.createElement('div'); box.className = 'schoolbox'; lane.append(box);
      box.addEventListener('click', e => { const b = e.target.closest('.sf'); if (!b) return; e.stopPropagation(); openSession(b.dataset.id, { locate: true }); });
    }
    const { kept, more, rank } = schoolOf(), slots = kept.length + (more ? 1 : 0), have = new Map([...box.querySelectorAll('.sf')].map(b => [b.dataset.id, b]));
    const STATE = ['s-ask', 's-work', 's-watch', 's-ready'], SAID = ['asking you', 'at work', 'watching', 'ready'];
    kept.forEach((s, i) => {
      let b = have.get(s.id); have.delete(s.id);
      if (!b) { b = document.createElement('button'); b.type = 'button'; b.dataset.id = s.id; b.innerHTML = SWIM_FISH.replace('"swimmer"', '"sfw"'); box.append(b); }
      const r = rank(s), said = `${s.project} · ${s.title} · ${SAID[r]}`, left = `${(i + .5) / slots * 100}%`, color = repoColor(s.cwd) || 'var(--muted)';
      if (b.className !== `sf ${STATE[r]}`) b.className = `sf ${STATE[r]}`;
      if (b.style.left !== left) b.style.left = left;
      if (b.style.getPropertyValue('--c') !== color) b.style.setProperty('--c', color);
      if (b.title !== said) { b.title = said; b.setAttribute('aria-label', said); }
    });
    for (const b of have.values()) b.remove();
    let m = box.querySelector('.sfmore');
    if (more) { if (!m) { m = document.createElement('span'); m.className = 'sfmore'; box.append(m); } m.textContent = `+${more}`; m.title = `${more} more, ready: a click on the lane shows every agent`; } else m?.remove();
  }
  $('#laneSchool').checked = !!prefs.laneSchool;
  $('#laneSchool').addEventListener('change', e => { prefs.laneSchool = e.target.checked; savePrefs(); renderBar(); });
  // The seabed (2026-11-01, round XIX's W2; a switch, off by default): the lane's floor is your day, from the first turn to
  // the end of a working day or now. Its height is how many chats were at work in each five minutes, red flecks along the
  // top where one sat waiting on you. Change-blind by design: drawn once a minute, one canvas, nothing moves, and nothing
  // in it asks for your eye. Hover says the hour in the lane's tooltip. Blocked minutes are never made a score.
  const BED_STEP = 5 * 60_000, BED_SPAN = 8 * 3600e3, BED_EVERY_MS = 60_000;
  const bed = { day: null, at: 0, busy: false, cols: null };
  async function bedLoad(force) {
    if (!prefs.laneBed) { if (bed.cols) bedDraw(); return; }
    if (bed.busy || document.hidden || (!force && Date.now() - bed.at < BED_EVERY_MS)) return;
    bed.busy = true;
    try { bed.day = await api('GET', `/api/today?since=${new Date().setHours(0, 0, 0, 0)}`); bed.at = Date.now(); } catch {} finally { bed.busy = false; }
    bedDraw();
  }
  function bedCols() {
    const spans = (bed.day?.chats || []).flatMap(c => c.spans || []).filter(x => x.from), now = Date.now();
    if (!spans.length) return null;
    const hour = 3600e3, midnight = new Date().setHours(0, 0, 0, 0), first = Math.max(midnight, Math.min(...spans.map(x => Date.parse(x.from))));
    const start = Math.floor(first / hour) * hour, end = Math.max(start + BED_SPAN, now + hour / 2), n = Math.ceil((end - start) / BED_STEP);
    const cols = Array.from({ length: n }, () => ({ w: 0, a: 0 }));
    for (const c of bed.day.chats) for (const k of ['w', 'a']) {   // a chat counts once in a column, however many spans it had there
      const hit = new Set();
      for (const x of c.spans || []) if (x.k === k && x.from) {
        const a = Math.max(start, Date.parse(x.from)), b = x.to ? Date.parse(x.to) : now;
        for (let i = Math.floor((a - start) / BED_STEP); i <= Math.min(n - 1, Math.floor((b - 1 - start) / BED_STEP)); i++) if (i >= 0) hit.add(i);
      }
      for (const i of hit) cols[i][k]++;
    }
    return { start, end, n, cols };
  }
  function bedDraw() {
    const lane = $('#sbSwim'); if (!lane?.firstChild) return;
    let c = lane.querySelector('canvas.bed');
    if (!prefs.laneBed) { c?.remove(); bed.cols = null; lane.onpointermove = null; return; }
    bed.cols = bedCols();
    if (!c) {
      c = document.createElement('canvas'); c.className = 'bed'; c.setAttribute('aria-hidden', 'true'); lane.prepend(c);
      lane.onpointermove = e => { if (!bed.cols || !prefs.laneBed) return; const i = Math.floor(e.offsetX / bed.w * bed.cols.n), col = bed.cols.cols[i]; if (!col || e.target !== lane && e.target !== c) return; lane.title = `${new Date(bed.cols.start + i * BED_STEP).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })}: ${col.w} at work${col.a ? `, ${col.a} waiting on you` : ''}`; };
    }
    const w = bed.w = lane.clientWidth, h = lane.clientHeight, dpr = devicePixelRatio || 1;
    c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
    const x = c.getContext('2d'); x.scale(dpr, dpr); x.clearRect(0, 0, w, h);
    if (!bed.cols) return;
    const css = getComputedStyle(lane), bw = w / bed.cols.n;
    x.fillStyle = css.getPropertyValue('--muted'); x.globalAlpha = .3;
    bed.cols.cols.forEach((col, i) => { const b = Math.min(h - 3, col.w * 3.2); if (b) x.fillRect(i * bw, h - b, Math.max(1, bw - .5), b); });
    x.globalAlpha = 1; x.fillStyle = css.getPropertyValue('--needs');
    bed.cols.cols.forEach((col, i) => { if (col.a) x.fillRect(i * bw, 0, Math.max(1.5, bw - .5), 2); });
    noteMotion(null, 'bed:draw', bed.cols.n);
  }
  $('#laneBed').checked = !!prefs.laneBed;
  $('#laneBed').addEventListener('change', e => { prefs.laneBed = e.target.checked; savePrefs(); bedDraw(); bedLoad(true); });
  new ResizeObserver(() => { if (prefs.laneBed && bed.cols) bedDraw(); }).observe($('#sbSwim'));
  new MutationObserver(() => { if (prefs.laneBed && bed.cols) bedDraw(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-skin', 'data-frame'] });
  // It eats (2026-10-11, late night): now and then it blurps a bubble or three out ahead of it and swims after them — its
  // mouth open for the last few pixels, darting the last DART_PX at DART times its pace — and gulps each one it reaches,
  // the bubble drawn into its mouth and its body swelling; every third one gulped, a burp rises. One it turned away from
  // rises and pops after FOOD_MS. The pointer on it is a pat: it wiggles, and blurps one if none is out. Where its mouth
  // is comes from the swim's own clock (fishAt), never a rect, so the frame loop (feed) reads no layout; it runs only
  // while a bubble is out. None of it under reduced motion: there is no swim to chase with.
  const DART = 3, DART_PX = 10, FOOD_MS = 12_000, SPIT_MS = 420;
  const fishAt = () => { const D = swimLen(), p = (swim.anim.currentTime % D) / D, e = swimEnd(swim.w);
    return p < .5 ? { x: e + (SWIM_PAD - e) * p * 2, dir: -1 } : { x: SWIM_PAD + (e - SWIM_PAD) * (p - .5) * 2, dir: 1 }; };
  const mouthOf = f => f.x + (f.dir < 0 ? 1 : 25);   // its lips' front pixel, whichever way it faces
  const swimPace = () => swimRate(Math.max(0, swim.n)) * (swim.dart ? DART : 1);
  function blurp(n = 1 + (Math.random() < .35) + (Math.random() < .12)) {
    const lane = $('#sbSwim'); if (!swim.anim || swim.food.length || !lane || swim.out || prefs.laneSchool) return false;
    const f = fishAt(), m = mouthOf(f), room = f.dir < 0 ? m - SWIM_PAD - 1 : swimEnd(swim.w) + 25 - m, d0 = 16 + Math.random() * 12;
    const at = []; for (let i = 0; i < n; i++) { const d = Math.min(d0 + i * 8, room - 4); if (d < 8 || at.includes(m + f.dir * d)) break; at.push(m + f.dir * d); }
    if (!at.length) return false;
    swim.h = lane.clientHeight; at.forEach((x, i) => setTimeout(() => spit(lane, x), i * 150)); noteMotion(null, 'blurp', at.length);
    return true;
  }
  function spit(lane, x) {   // out of its mouth to x, where it bobs
    if (!swim.anim) return;
    const m = mouthOf(fishAt()), z = 3 + Math.round(Math.random() * 2), y = Math.round(swim.h / 2 + Math.random() * 3 - 2), el = document.createElement('i');
    el.className = 'bub food'; el.style.cssText = `left: ${x - z / 2}px; top: ${y - z / 2}px; width: ${z}px; height: ${z}px`; lane.append(el);
    el.animate([{ transform: `translate(${m - x}px, ${swim.h / 2 - y}px) scale(.3)`, opacity: 0 }, { opacity: .95, offset: .2 }, { transform: 'none', opacity: .95 }], { duration: SPIT_MS, easing: EASE_OUT, fill: 'forwards' });
    swim.food.push({ el, x, y, born: performance.now() });
    swim.raf ||= requestAnimationFrame(feed);
  }
  function feed() {
    swim.raf = 0; const lane = $('#sbSwim'); if (!swim.anim) return;
    const f = fishAt(), m = mouthOf(f), now = performance.now(); let near = Infinity;
    for (const b of [...swim.food]) {
      const ahead = (b.x - m) * f.dir;   // how far before its mouth
      if (ahead <= 1 && ahead > -10) gulp(b, m, lane);
      else if (now - b.born > FOOD_MS) lose(b);
      else if (ahead > 0) near = Math.min(near, ahead);
    }
    lane.classList.toggle('open', near < 6);
    if ((near < DART_PX) !== swim.dart) { swim.dart = !swim.dart; swimPaceTo(); if (swim.dart) noteMotion(null, 'dart'); }
    if (swim.food.length) swim.raf = requestAnimationFrame(feed);
  }
  function gulp(b, m, lane) {
    swim.food.splice(swim.food.indexOf(b), 1);
    const from = getComputedStyle(b.el).transform; b.el.getAnimations().forEach(a => a.cancel());
    b.el.animate([{ transform: from, opacity: .95 }, { transform: `translate(${m - b.x}px, ${swim.h / 2 - b.y}px) scale(.2)`, opacity: 0 }], { duration: 110, easing: EASE_OUT, fill: 'forwards' }).onfinish = () => b.el.remove();
    lane.querySelector('.fb').animate([{ transform: 'none' }, { transform: 'scale(1.1, 1.25)', offset: .35 }, { transform: 'none' }], { duration: 320, easing: EASE_OUT });
    noteMotion(null, 'gulp', ++swim.eaten);
    if (swim.eaten % 3 === 0) setTimeout(burp, 600);
  }
  function lose(b) {
    swim.food.splice(swim.food.indexOf(b), 1);
    b.el.animate([{ transform: 'none', opacity: .95 }, { transform: 'translateY(-9px) scale(1.4)', opacity: 0 }], { duration: 700, easing: EASE_OUT, fill: 'forwards' }).onfinish = () => b.el.remove();
  }
  function burp() {   // a bubble rising from its mouth, whichever way it faces
    const lane = $('#sbSwim'); if (!swim.anim || document.hidden || swim.out) return;
    const f = fishAt(), b = document.createElement('i');
    b.className = 'bub'; b.style.left = `${mouthOf(f) - 2}px`; b.style.top = `${swim.h / 2 - 3}px`; lane.append(b);
    b.animate([{ transform: 'translate(0, 0) scale(.5)', opacity: 0 }, { opacity: .9, offset: .15 }, { transform: `translate(${f.dir * 4}px, -12px) scale(1)`, opacity: 0 }], { duration: 1400, easing: 'ease-out', fill: 'forwards' }).onfinish = () => b.remove();
    noteMotion(null, 'burp');
  }
  // Out to lunch (2026-10-18; lunchBar): the fish swims off the bar the way it faces, its swim held where it was; back, the
  // swim goes on and the fish swims in from behind — fed, round-bellied a while, and it burps. Seen or not: away (the
  // screen locked, the page hidden) it is simply gone, and under reduced motion it simply is or is not.
  function swimOff(seen = true) {
    const lane = $('#sbSwim'); if (!lane?.firstChild || swim.out) return;
    swim.out = true; noteMotion(null, 'lunch:off');
    if (!swim.anim || !seen || REDUCED.matches) { lane.classList.add('out'); return; }
    const f = fishAt(), d = f.dir < 0 ? f.x + 34 : swim.w - f.x + 8;
    swim.anim.pause();
    lane.querySelector('.fw').animate([{ transform: 'none' }, { transform: `translateX(${-d}px)` }], { duration: Math.max(500, d * 9), easing: 'ease-in' }).onfinish = () => { if (swim.out) lane.classList.add('out'); };
  }
  function swimBack(fed) {
    const lane = $('#sbSwim'); if (!lane?.firstChild || !swim.out) return;
    swim.out = false; lane.classList.remove('out'); noteMotion(null, fed ? 'lunch:fed' : 'lunch:in');
    if (!swim.anim || REDUCED.matches) return;
    swim.anim.play();
    const f = fishAt(), d = f.dir < 0 ? swim.w - f.x + 8 : f.x + 34, ms = Math.max(600, d * 10);
    lane.querySelector('.fw').animate([{ transform: `translateX(${d}px)` }, { transform: 'none' }], { duration: ms, easing: EASE_OUT });
    if (!fed) return;
    lane.querySelector('.fb').animate([{ transform: 'scale(1.08, 1.3)' }, { transform: 'scale(1.08, 1.3)', offset: .85 }, { transform: 'none' }], { duration: 9000, easing: EASE_OUT });
    setTimeout(burp, ms + 300);
  }
  function pat() {
    const now = performance.now(), lane = $('#sbSwim'); if (!swim.anim || swim.out || now - swim.patAt < 1200) return; swim.patAt = now;
    lane.querySelector('.fw').animate([{ transform: 'none' }, { transform: 'rotate(-14deg)' }, { transform: 'rotate(10deg)' }, { transform: 'rotate(-5deg)' }, { transform: 'none' }], { duration: 560, easing: EASE_OUT });
    lane.querySelector('.ft').animate([{ transform: 'scaleY(1)' }, { transform: 'scaleY(.4)' }], { duration: 70, iterations: 8, direction: 'alternate' });
    noteMotion(null, 'pat'); setTimeout(() => blurp(1), 400);
  }
  setInterval(() => {   // now and then a blurp — and the empty list's fish (renderSessionList), resting, a bubble from its mouth
    const nf = !document.hidden && !REDUCED.matches && document.querySelector('#slist > .none .nfish');
    if (nf && Math.random() < .5) {
      const b = document.createElement('i'); b.className = 'bub'; b.style.left = '3px'; b.style.top = '8px'; nf.append(b);
      b.animate([{ transform: 'translate(0, 0) scale(.5)', opacity: 0 }, { opacity: .9, offset: .15 }, { transform: 'translate(-6px, -18px) scale(1)', opacity: 0 }], { duration: 1600, easing: 'ease-out', fill: 'forwards' }).onfinish = () => b.remove();
    }
    const lane = $('#sbSwim'); if (document.hidden || !lane || REDUCED.matches) return;
    if (Math.random() < (lane.classList.contains('rest') ? .5 : .35)) blurp();
  }, 2600);   // the fish, for the bar's connection: the same mark, belly-up while the stream is down
  // A mute shows (2026-11-01, round XIX's S7; an inhibit must be unmistakable, as the FAA has it): notifications off is a
  // mark on the bar and a slash through the menu bar's fish, and a click turns them on. It says how long past the first
  // hour and nods once as each hour turns, so one left on by accident gets noticed.
  function muteSeg() {
    if (state.notifications) { if (prefs.mutedAt) { delete prefs.mutedAt; savePrefs(); } muteSeg.h = 0; return []; }
    if (!prefs.mutedAt) { prefs.mutedAt = Date.now(); savePrefs(); }
    const h = Math.floor((Date.now() - prefs.mutedAt) / 3600e3);
    if (h > (muteSeg.h ?? h) && !REDUCED.matches) requestAnimationFrame(() => { noteMotion(null, 'mute:remind', h); $('#sbLeft .mute')?.animate([{ transform: 'none' }, { transform: 'translateY(-3px)' }, { transform: 'none' }], { duration: 420, easing: SPRING }); });
    muteSeg.h = h;
    return [`<button class="seg mute" title="Notifications are off${h ? ` for ${h} h` : ''}: chats still count here, no banner comes. Click to turn them on">${ICON.bellOff}muted${h ? ` · ${h}h` : ''}</button>`];
  }
  function renderBar() {
    if (!state.snapshots) return;
    const all = [...state.sessions.values()], n = f => all.filter(f).length;
    const ask = n(askingLoud);
    const askWait = ask ? waitWord(Date.now() - Math.min(...all.filter(askingLoud).map(askedAt))) : '', nx = nextQueue()[0];   // the longest wait (2026-11-01, round XIX's S4)
    const mons = all.reduce((a, s) => a + (s.alive ? (s.tasks || []).length : 0), 0);
    // the connection is the fish alone (2026-10-27; *connected* beside it before), its colour the state: green on the
    // stream, amber belly-up while it tries again, red when the server turned it away (the lock's) — the words out of sight
    const link = bar.conn ? ['', 'connected', 'Connected to the board\'s server'] : bar.lost ? [' off lost', 'disconnected', 'The server turned the stream away'] : [' off', 'reconnecting', 'The server is not answering — reconnecting'];
    const left = [`<button class="seg conn${link[0]}${bar.back ? ' back' : ''}" title="${link[2]} — click for the About box">${FISH_LOGO()}<span class="vh">${link[1]}</span></button>`,
      // the live chats and the drawers and shells went (2026-10-11, later); what waits on you and what is watching stay,
      // each only while there is one — in the words the lanes use (2026-10-12: *asking*, *N monitors* before); what is
      // watching is the card's mark and its count (2026-10-27), the word out of sight
      nextSeg(nx, ask, askWait),
      ...muteSeg(),
      ...(mons ? [`<span class="seg mons" title="${mons} monitor${mons > 1 ? 's' : ''} and background commands running">${ICON.watch}${rn('mons', mons)}<span class="vh"> watching</span></span>`] : [])];
    for (const c of state.clones.values()) left.push(`<span class="seg cl" title="gh repo clone ${esc(c.ref)} into ${esc(homePath(c.dir))} — ${esc(cloneSays(c))}">${ICON.download}cloning <b>${esc(c.ref)}</b><i style="--p:${(c.percent || 0) / 100}"></i>${c.percent || 0}%</span>`);
    const cs = chatSeg(); if (cs) left.splice(1, 0, cs);   // the chat (2026-10-17), after the connection
    left.push(updSeg());
    const st = bar.stats, want = prefs.barStats || [], stat = [], right = [];
    if (want.includes('cpu')) stat.push(sbMeter('CPU', st.cpu ?? 0, st.cpu == null ? '…' : `${st.cpu}%`, hotInk(st.cpu), 'every core\'s time spent busy, the last 3 s', st.cpu == null ? null : `${hotMark(st.cpu)}${rn('cpu', st.cpu)}%`));
    if (want.includes('mem')) { const pct = st.mem ? Math.round(st.mem.used / st.mem.total * 100) : null; stat.push(st.mem ? sbMeter('RAM', pct, `${pct}%`, hotInk(pct), `memory used, as Activity Monitor counts it: ${fmtBytes(st.mem.used)} of ${fmtBytes(st.mem.total)}`, `${hotMark(pct)}${rn('mem', pct)}%`) : sbMeter('RAM', 0, '…', 'var(--watch)')); }
    if (want.includes('claude')) stat.push(`<span class="m" title="what the Claude processes running hold in memory (their children aside)">Claude <b>${st.claude?.rss != null ? fmtBytes(st.claude.rss) : '…'}</b>${st.claude?.n ? ` · ${st.claude.n}` : ''}</span>`);
    if (stat.length) right.push(`<span class="seg">${stat.join('')}</span>`);
    if (!usage.off) {
      const ws = (usage.data?.windows || []).filter(w => !uGrant(w));
      right.push(`<button class="seg us${bar.open ? ' on' : ''}${usage.err && usage.data ? ' stale' : ''}" title="Claude plan usage${usage.err ? ` — ${esc(usage.err)}` : ''} — click for the rows">${ws.length ? ws.map(w => sbMeter(uShort(w), w.percent, `${w.percent}%`, uColor(w.percent), uTip(w), `${hotMark(w.percent)}${rn('bu:' + uShort(w), w.percent)}%`)).join('') : `<span class="unote">usage: ${esc(usage.err || (usage.data ? 'nothing reported' : 'asking…'))}</span>`}</button>`);
    }
    // keeping the Mac awake, both switches, always here (2026-10-09): a muted mark while off, and a muted cup while there
    // is nothing for it to hold off (cupMoot)
    const aw = state.awake;
    right.push(`<button class="seg aw${aw.awake ? '' : ' off'}${cupMoot(aw) ? ' moot' : ''}" id="sbAwake" aria-pressed="${!!aw.awake}" title="${esc(cupTip(aw))}">${ICON.cup}${aw.awake ? '<span>awake</span>' : ''}</button>`,
      `<button class="seg lidb${aw.lid ? '' : ' off'}" id="sbLid" aria-pressed="${!!aw.lid}" title="${esc(aw.lid ? 'This Mac does not sleep, not even with its lid closed (pmset disablesleep) — mind the battery and the heat in a bag. Click to let it sleep with the lid shut again (Touch ID or your password)' : 'Keep this Mac awake with its lid closed too (pmset disablesleep) — Touch ID or your password each time; mind the battery in a bag')}">${ICON.lid}${state.lidAsking ? '<span>Touch ID…</span>' : aw.lid ? '<span>lid closed</span>' : ''}</button>`);
    // the clock, far right (2026-10-11, later): the time on a 24-hour clock whatever the locale (2026-10-11, late
    // night; the who-lines' 12 before), the day in its tooltip — the menu bar's is hidden in the fill. Drawn again on
    // the minute (clockTick).
    const now = new Date();
    right.push(`<span class="seg clock" title="${esc(now.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))}">${esc(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }))}</span>`);
    const rows = usage.data?.windows || [];
    setHtml($('#sbLeft'), left.join(''));
    swimAt(fishing.until ? 0 : all.reduce((a, s) => a + (s.alive && s.status === 'working' ? 1 + (s.agents || 0) : 0), 0));
    lunchBar(); fishingBar(); schoolBar(); bedLoad();
    setHtml($('#sbRight'), right.join('') + (bar.open && rows.length ? `<div class="sbpanel"><div class="uhd">plan usage</div><div class="urows">${usageRows(rows)}</div></div>` : ''));
    rollSoon();
  }
  async function loadStats() {
    const want = prefs.barStats || [];
    if (!want.length || bar.busy || document.hidden) return;
    bar.busy = true;
    try { bar.stats = await api('GET', `/api/stats?want=${want.join(',')}`); } catch { bar.stats = {}; }
    bar.busy = false; renderBar(); homeSoon();   // the home's Mac line (2026-10-10) — after an await, so the block below has run
  }
  setInterval(loadStats, 3000);
  (function clockTick() { renderBar(); setTimeout(clockTick, 60_000 - Date.now() % 60_000 + 50); })();   // on the minute, the bar's clock
  $('#sbar').addEventListener('click', e => {
    if (e.target.closest('.us')) { bar.open = !bar.open; renderBar(); return; }
    if (e.target.closest('.conn')) { aboutOpen(); return; }
    if (e.target.closest('#sbChat')) { chatSegClick(); return; }
    if (e.target.closest('.seg.mute')) { setNotify(true); return; }
    if (e.target.closest('.seg.nx')) { hotNext(); return; }   // (2026-10-12) the count opens the chats it counts, one after another
    const upg = e.target.closest('.seg.upg'); if (upg) { if (reload.want && reload.why !== 'server') location.reload(); else if (upg.dataset.take) updNow(); else updatesOpen(); return; }
    const aw = e.target.closest('#sbAwake'); if (aw) { setAwake({ awake: !state.awake.awake }, aw); return; }
    const lid = e.target.closest('#sbLid'); if (lid && !state.lidAsking) setAwake({ lid: !state.awake.lid }, lid);
  });
  document.addEventListener('click', e => { if (bar.open && !e.composedPath().includes($('#sbar'))) { bar.open = false; renderBar(); } });   // the path: the button clicked is drawn anew under the click
  // What else the bar says (prefs.barStats): Settings › Appearance's checkboxes, or a right-click on the bar (2026-10-16,
  // ctxRows) — the settings' boxes follow either way.
  const BAR_STATS = [['cpu', 'CPU'], ['mem', 'Memory'], ['claude', 'Claude’s memory']];
  function setBarStats(on) {
    prefs.barStats = BAR_STATS.map(([k]) => k).filter(k => on.includes(k)); savePrefs();
    for (const c of $('#sbarStats').querySelectorAll('input')) c.checked = prefs.barStats.includes(c.dataset.stat);
    bar.stats = {}; renderBar(); loadStats();
  }
  for (const c of $('#sbarStats').querySelectorAll('input')) {
    c.checked = (prefs.barStats || []).includes(c.dataset.stat);
    c.addEventListener('change', () => setBarStats([...$('#sbarStats').querySelectorAll('input:checked')].map(x => x.dataset.stat)));
  }
  renderBar(); loadStats();

