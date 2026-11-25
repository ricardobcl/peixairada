  function knownFolders() { return [...new Set([...state.sessions.values()].map(s => s.cwd).filter(Boolean))].sort(); }
  // Claude's mark in pixels (2026-09-27; a school of ><> from
  // 2026-09-20 to then — one node kept across renders, so innerHTML did not hand it a new animation every few seconds;
  // phaseAnims() does that for the mark now, so it is plain markup — then the smooth starburst for an evening). The
  // sheet below is the strip itself, frame beside frame, 9 × 9 each: one path, a run of # per subpath, drawn once;
  // CSS shows one frame at a time (`pix`, `pixhop`, the numbers there are these frames'). It stood alone between the
  // clauding cards and the ready ones until 2026-10-09, then was the Clauding lane's mark until 2026-10-31 (a glyph
  // since); the transcript's presence line's, and All caught up's at rest.
  const PIX_SHEET = [
    // 0 ·      1 +       2 ◆       3 ✳       4 ✶       5 ✽       6 twinkle 7 twinkle
    '......... ......... ......... ......... ......... #...#...# ....#.... #.......#',
    '......... ......... ......... ......... .#..#..#. .#..#..#. ....#.... .#..#..#.',
    '......... ......... ....#.... ..#.#.#.. ..#.#.#.. ..#.#.#.. ..#.#.#.. ..#.#.#..',
    '......... ....#.... ...###... ...###... ...###... ...###... ...###... ...###...',
    '....#.... ...###... ..#####.. ..#####.. .#######. ######### ######### .#######.',
    '......... ....#.... ...###... ...###... ...###... ...###... ...###... ...###...',
    '......... ......... ....#.... ..#.#.#.. ..#.#.#.. ..#.#.#.. ..#.#.#.. ..#.#.#..',
    '......... ......... ......... ......... .#..#..#. .#..#..#. ....#.... .#..#..#.',
    '......... ......... ......... ......... ......... #...#...# ....#.... #.......#',
  ].map(row => row.replace(/ /g, ''));
  const PIX = `<span class="pix"><svg viewBox="0 0 ${PIX_SHEET[0].length} 9" shape-rendering="crispEdges" aria-hidden="true"><path d="${
    PIX_SHEET.flatMap((row, y) => [...row.matchAll(/#+/g)].map(m => `M${m.index} ${y}h${m[0].length}v1h-${m[0].length}z`)).join('')}"/></svg></span>`;
  // Lanes (2026-10-09, the studies' C — Paseo's grouped sidebar; one divider between the clauding and the ready cards
  // before): a head over each group the list ranks by — Asking you · Clauding · Watching · Ready · Idle · Done — with its
  // glyph (Linear's states since 2026-10-31; Claude's mark in pixels was the Clauding head's) and how many cards it
  // holds. Under a query, which ranks by the match, none; under a filter, which shows every match, a head that does not
  // fold (`still`).
  const LANES = { asking: ['Asking you', 'chats waiting on your answer'], working: ['Clauding', 'chats Claude is at work in'], watching: ['Watching', 'chats Claude will come back to by itself: a monitor or a command still running, or a wake-up it set'], ready: ['Ready', 'chats Claude is done in'], idle: ['Idle', `ready chats untouched since before the last ${IDLE_DAYS + 1} days`], done: ['Done', 'chats ticked done'],
    snoozed: ['Snoozed', 'chats put away till a time or till something happens'], prio: ['Pinned', 'chats you pinned, in your order'] };
  // A word that shimmers while Claude works (2026-10-11, Claude Code's own spinner): a light runs across it — a window
  // as wide as the word, masked to a soft band, moving one way while the bright copy in it (its ::before, from
  // data-t, so the text is said once) moves the other; both transforms, so nothing repaints.
  const shim = t => `<span class="shim">${esc(t)}<span class="sw" data-t="${esc(t)}" aria-hidden="true"></span></span>`;
  // A long lane shows its newest LANE_CAP cards and a line for the rest (2026-10-13): every card in the page is restyled,
  // laid out and walked on each render — with every lane open here 400 cards, ~13,000 elements, and Idle and Done only
  // grow. The line shows the rest until the page is loaded again; the open chat's card is there whatever its place, a
  // query and a filter show every match.
  const LANE_CAP = 30, CAPPED = new Set(['idle', 'done']), laneMore = new Set();
  const moreHtml = (g, n) => `<div class="gsep more" data-more="${g}" role="button" tabindex="0" title="Show the other ${n} ${LANES[g][1]}"><span class="mn">${n} more ${LANES[g][0].toLowerCase()} chat${n === 1 ? '' : 's'}</span><span class="ms">+${n}</span></div>`;
  const laneHtml = (g, n, shut = false, still = false, extra = '') => `<div class="gsep lane ${g}${shut ? ' shut' : ''}${still ? ' still' : ''}" data-lane="${g}"${still ? '' : ` role="button" tabindex="0" aria-expanded="${!shut}"`} title="${n} ${LANES[g][1]}${still ? '' : ` — click to ${shut ? 'show' : 'fold'} them`}"><i aria-hidden="true"></i><span class="ln">${LANES[g][0]}</span>${extra}<b>${rn('lane:' + g, n)}</b><span class="lc" aria-hidden="true"></span></div>`;
  // …and when no lane waits on you, a still one that says so (renderSessionList); its mark is the clauding head's at
  // rest. Reached by a tick it earns a moment, once: the mark hops and throws a few sparks (caughtUp).
  const ZERO_HTML = `<div class="gsep lane zero" title="Nothing waits on you — no question, no chat ready">${PIX}<span class="ln">All caught up</span><span class="zewalk"><span class="zw"><i title="Zé — his game, ⌥⌘Z"></i><i title="Zé — his game, ⌥⌘Z"></i></span></span></div>`;
  let lastTickAt = 0, wasCaughtUp = null;
  function caughtUp(now) {
    const was = wasCaughtUp; wasCaughtUp = now;
    if (!now || was !== false || performance.now() - lastTickAt > 3000 || REDUCED.matches) return;
    const lane = document.querySelector('#slist > .gsep.lane.zero'), pix = lane?.querySelector('.pix'); if (!pix) return;
    noteMotion(null, 'caughtup');
    pix.animate([{ transform: 'none' }, { transform: 'translateY(-7px)', offset: .3 }, { transform: 'none', offset: .55 }, { transform: 'translateY(-2px)', offset: .75 }, { transform: 'none' }], { duration: 650, easing: 'ease-out', id: 'caughtup' });
    const box = lane.getBoundingClientRect(), r = pix.getBoundingClientRect(), cx = r.left - box.left + r.width / 2, cy = r.top - box.top + r.height / 2;
    const tones = ['var(--accent)', 'var(--idle)', 'var(--working)', 'var(--watch)'];
    for (let k = 0; k < 12; k++) {
      const sp = document.createElement('i'); sp.className = 'spark'; sp.style.cssText = `left: ${cx - 1.5}px; top: ${cy - 1.5}px; background: ${tones[k % tones.length]}`; lane.append(sp);
      const a = k / 12 * Math.PI * 2 + Math.random() * .5, d = 16 + Math.random() * 18;
      sp.animate([{ transform: 'none', opacity: 1 }, { transform: `translate(${Math.cos(a) * d}px, ${Math.sin(a) * d * .7}px) scale(.5)`, opacity: 0 }], { duration: 600 + Math.random() * 200, easing: 'cubic-bezier(.1, .7, .3, 1)', delay: 90, fill: 'both', id: 'spark' }).onfinish = () => sp.remove();
    }
  }
  // A line under each day's cards, naming the day they are from (2026-09-23). The day is your last
  // touch, like the order. A line closes the run of cards *above* it, so the oldest day in the list gets one too, at
  // the bottom; the list is grouped first, so the done cards can bring a day back after older ready ones, and each run
  // gets its own line. The day stands alone, centred (2026-09-27; still fish either side before, and
  // hairlines for an hour) — nothing moves, plain markup.
  const pad2 = n => String(n).padStart(2, '0');
  // How a date is written: DD-MM-YYYY, `short` without the year for the timeline's labels. The settings offered year
  // and month first for a day (2026-09-28), gone the same day.
  const fmtDate = (d, short) => `${pad2(d.getDate())}-${pad2(d.getMonth() + 1)}${short ? '' : `-${d.getFullYear()}`}`;
  // A timestamp's day, the way the list and the transcript both write it: Today, Yesterday, the weekday within the week
  // (2026-10-12; `today`, else DD-MM-YYYY, before), then DD-MM-YYYY.
  const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayOf = ts => {
    const d = new Date(ts); if (isNaN(d)) return '';
    const back = Math.round((new Date().setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / 86_400_000);
    return back === 0 ? 'Today' : back === 1 ? 'Yesterday' : back > 1 && back < 7 ? WEEKDAYS[d.getDay()] : fmtDate(d);
  };
  const dayName = s => dayOf(wordAt(s));
  // Ages are written after the render, not into the markup (2026-09-27, night): a card's age in its markup made the
  // card's html change every minute and the node with it (and the review's 30 s tick rebuilt the list for the ages
  // alone). Anything that shows an age carries `data-at` and nothing else; fillAges writes the words — and, on a
  // card's age, the tooltip from the chat's own times — after every render and on the 30 s tick, touching only text
  // that changed. So an age on screen is never stale by more than the tick.
  // A card's `.time` carries nothing at all in its markup — not even the timestamp, which a tool call moves — so a
  // chat's activity leaves its card's html, and its node, as they were; the time and the tooltip come from the chat here.
  function fillAges(root = document) {
    for (const el of root.querySelectorAll('.card .time')) {
      const s = state.sessions.get(el.closest('.card')?.dataset.id); if (!s) continue;
      const at = s.lastActivity || s.startedAt || ''; if (el.dataset.at !== at) el.dataset.at = at;
      const tip = timeTip(s); if (el.title !== tip) el.title = tip;
    }
    for (const el of root.querySelectorAll('.chip.watch')) {   // what runs behind the turn, a card's or the header's (2026-10-14)
      const s = state.sessions.get(el.closest('.card')?.dataset.id || el.closest('#shead')?.dataset.sid); if (!s) continue;
      const tip = (s.tasks || []).map(taskLine).join('\n'); if (el.title !== tip) el.title = tip;
    }
    for (const el of root.querySelectorAll('.prrow[data-url]')) {   // the open chat's PR rows (2026-10-14)
      const pr = state.sessions.get(state.current)?.prs?.find(p => p.url === el.dataset.url); if (!pr) continue;
      const tip = prTip(pr); if (el.title !== tip) el.title = tip;
    }
    for (const el of root.querySelectorAll('[data-at]')) { const t = rel(el.dataset.at); if (el.textContent !== t) el.textContent = t; }
    for (const el of root.querySelectorAll('[data-in]')) { const t = relIn(el.dataset.in); if (el.textContent !== t) el.textContent = t; }   // a time to come: a wake-up's (2026-10-31)
    for (const el of root.querySelectorAll('.tvtrk3')) fillTracks(el);   // the chat and its PRs on one clock (2026-10-17)
  }
  const dayHtml = day => `<div class="gsep day" title="below: the chats you were in ${day === 'Yesterday' ? 'yesterday' : 'on ' + day}"><b>${day}</b></div>`;
