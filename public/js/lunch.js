  // ---- lunch: the reminder, and the menus of the places you go (2026-10-18) ------------------------------------------
  // The server reads the menus (setup.lunch; its lunch section) and says where the day stands — state.lunch.phase: off,
  // before, lunch, snoozed (In 15 min), went (Going), back, over. Here: the sign in the fish's lane (LUNCH; ENJOY once
  // you go, and the fish swims off the bar; BACK SOON while the screen is locked; FED · n MIN as it swims back in), the
  // day's dishes scrolling through the lane at lunch time, ⌥⌘M's chalkboard (home's too, while the morning's menus
  // stand), the alert and its buttons in the app (peixLunch), and Settings › Lunch. Away is the app's lock — the screen
  // locked or asleep (peixAway) —, a browser's tab hidden; back from lunch is the first sign of you LUNCH_AWAY_MS on.
  const LUNCH_AWAY_MS = 10 * 60_000;
  const lunchUi = { away: false, awayAt: 0, awayIn: false, fed: null, returning: false, sign: null, tick: null, hooked: false };
  const lunchMain = p => p.dishes.find(d => !/^(sopa|creme|caldo|entrada|p[aã]o\b)/i.test(d)) || p.dishes[0];
  const lunchTime = t => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const LUNCH_HUES = ['--accent', '--watch', '--working', '--idle', '--you', '--pr-merged', '--tk-doing', '--spend'];
  const lunchColor = (p, i) => p.color || `var(${LUNCH_HUES[i % LUNCH_HUES.length]})`;
  /** Out to lunch: Going said and no back yet, today — or the screen locked at lunch time. Not while it swims back. */
  const lunchOut = () => { const l = state.lunch; return !!l?.on && !lunchUi.returning && ((!!l.went && !l.back) || (lunchUi.away && lunchUi.awayIn)); };
  function lunchSignWord() {
    const l = state.lunch; if (!l?.on) return null;
    if (lunchUi.fed) return lunchUi.fed;
    if (lunchOut()) return lunchUi.away ? 'BACK SOON' : 'ENJOY';
    return l.phase === 'lunch' ? 'LUNCH' : null;
  }
  /** The lane as the day has it: the fish in or out, the sign's word, the dishes — each changed only when it changes. */
  function lunchBar() {
    const lane = $('#sbSwim'); if (!lane?.firstChild) return;
    if (!lunchUi.hooked) {   // the sign and the dishes are the menus', not the overview's the lane opens
      lunchUi.hooked = true;
      lane.addEventListener('click', e => { if (e.target.closest('.lsign, .ltick')) { e.stopPropagation(); lunchOpen(); } }, true);
    }
    const l = state.lunch, out = lunchOut();
    if (out && !swim.out) swimOff(!document.hidden && !lunchUi.away);
    else if (!out && swim.out && !lunchUi.returning) swimBack(false);   // no fanfare: a lock that was short, a lunch over
    const word = lunchSignWord();
    if (word !== lunchUi.sign) { lunchSign(lane, word); lunchUi.sign = word; }
    const have = l?.on && l.phase === 'lunch' && !out ? (l.places || []).filter(p => p.dishes.length) : [];
    const key = have.map(p => `${p.name}|${lunchMain(p)}|${p.price || ''}|${p.color || ''}`).join('¦');
    if (key !== lunchUi.tick) { lunchUi.tick = key; lunchTicker(lane, have); }
  }
  function lunchSign(lane, word) {
    let el = lane.querySelector('.lsign:not(.going)');
    if (!word) {
      if (!el) return;
      el.classList.add('going');
      if (REDUCED.matches) el.remove(); else el.animate([{ transform: 'none' }, { transform: 'translateY(-28px)' }], { duration: 380, easing: 'ease-in', fill: 'forwards' }).onfinish = () => el.remove();
      return;
    }
    noteMotion(null, 'lunch:sign', word);
    if (!el) {
      el = document.createElement('button'); el.type = 'button'; el.className = 'lsign'; el.title = 'Lunch — the menus · ⌥⌘M';
      el.innerHTML = '<span class="lswing"><b></b></span>'; el.querySelector('b').textContent = word; lane.append(el);
      if (REDUCED.matches) return;
      el.animate([{ transform: 'translateY(-28px)' }, { transform: 'none' }], { duration: 650, easing: SPRING });
      el.querySelector('.lswing').animate([{ transform: 'rotate(0)' }, { transform: 'rotate(9deg)' }, { transform: 'rotate(-6deg)' }, { transform: 'rotate(3deg)' }, { transform: 'rotate(0)' }], { duration: 1600, delay: 450, easing: 'ease-out' });
      return;
    }
    const b = el.querySelector('b');
    if (REDUCED.matches) { b.textContent = word; return; }
    b.animate([{ transform: 'none' }, { transform: 'scaleX(0)' }], { duration: 140, easing: 'ease-in' }).onfinish = () => { b.textContent = word; b.animate([{ transform: 'scaleX(0)' }, { transform: 'none' }], { duration: 220, easing: EASE_OUT }); };
  }
  function lunchTicker(lane, have) {
    lane.querySelector('.ltick')?.remove();
    if (!have.length) return;
    const items = have.map((p, i) => `<span><i style="--c:${lunchColor(p, (state.lunch.places || []).indexOf(p) >= 0 ? state.lunch.places.indexOf(p) : i)}"></i><b>${esc(p.name)}</b>${esc(lunchMain(p))}${p.price ? ` · ${esc(p.price)}` : ''}</span>`).join('');
    const el = document.createElement('span'); el.className = 'ltick'; el.title = 'Today\'s dishes — click for the menus · ⌥⌘M';
    el.innerHTML = items + items; lane.append(el);
    el.style.setProperty('--dur', `${Math.max(12, el.scrollWidth / 2 / 28).toFixed(1)}s`);   // 28 px a second, whatever the words
    noteMotion(null, 'lunch:dishes', have.length);
  }
  /** Back from lunch: the sign says how long, the fish swims in fed, and the server hears it (every page then knows). */
  function lunchFed(from) {
    lunchUi.fed = `FED · ${Math.max(1, Math.round((Date.now() - from) / 60_000))} MIN`; lunchUi.returning = true;
    api('POST', '/api/lunch', { act: 'back' }).then(d => { state.lunch = d; }, () => {});
    lunchBar();
    setTimeout(() => swimBack(true), 450);
    setTimeout(() => { lunchUi.fed = null; lunchUi.returning = false; lunchBar(); }, 7000);
  }
  /** The screen locked, or back: at lunch time, a lock is lunch — the fish goes; back after LUNCH_AWAY_MS, it comes back fed. */
  function lunchAway(away) {
    if (away === lunchUi.away) return;
    const l = state.lunch;
    if (away) { Object.assign(lunchUi, { away: true, awayAt: Date.now(), awayIn: !!l?.on && ['lunch', 'snoozed', 'went'].includes(l.phase) }); lunchBar(); return; }
    const since = lunchUi.awayAt, at = lunchUi.awayIn; Object.assign(lunchUi, { away: false, awayAt: 0, awayIn: false });
    if (l?.on && ((l.went && !l.back && Date.now() - l.went >= LUNCH_AWAY_MS) || (at && Date.now() - since >= LUNCH_AWAY_MS))) lunchFed(Math.min(l.went || Infinity, since || Infinity));
    else lunchBar();
  }
  window.peixAway = away => { lunchAway(!!away); if (away) wentOut(); else cameBack(); };   // the app's: the screen locked or asleep, the screen saver, the session switched away
  document.addEventListener('visibilitychange', () => { if (inApp) return; lunchAway(document.hidden); if (document.hidden) wentOut(); else cameBack(); });
  // Going, and you never locked it: the first move of yours LUNCH_AWAY_MS on is you back
  const lunchStir = () => { const l = state.lunch; if (l?.on && l.went && !l.back && !lunchUi.away && !lunchUi.returning && Date.now() - l.went >= LUNCH_AWAY_MS) lunchFed(l.went); };
  document.addEventListener('pointermove', lunchStir, { passive: true }); document.addEventListener('keydown', lunchStir, true);
  // ⌥⌘M: the chalkboard
  // your browser's: where you are logged in — an https page and nothing else (2026-11-06: the app hands `external` to the system)
  const lunchUrl = url => { if (!/^https:\/\/[^\s]+$/i.test(url || '')) return; if (inApp) post({ type: 'external', url }); else window.open(url, '_blank', 'noopener'); };
  function lunchOpen() {
    const dlg = $('#lunchd'); if (dlg.open) return;
    if (inApp) post({ type: 'focus' });
    drawLunch(true); dlg.showModal(); repostPane(); dlg.focus();
  }
  function lunchToggle() { if ($('#lunchd').open) $('#lunchd').close(); else lunchOpen(); }   // a declaration: HOTKEYS names it before this line runs
  $('#lunchd').addEventListener('close', () => repostPane());
  const fmtDay = k => new Date(`${k}T12:00`).toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' });
  /** How a place's menu reached the board, or why there is none — a line under it. */
  function lunchWhy(p, l) {
    if (p.dishes.length) {
      const when = p.at ? (dayKeyOf(p.at) === l.day ? lunchTime(p.at) : new Date(p.at).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })) : '';
      return `${p.month ? 'this month\'s dishes · ' : ''}from ${p.src === 'story' ? 'its story' : p.src === 'slack' ? (l.slack || 'Slack') : 'its post'}${when ? ` · ${when}` : ''}`;
    }
    if (p.state === 'closed') return `closed${p.closed?.to ? ` until ${fmtDay(p.closed.to)}` : ' today'}`;
    if (p.state === 'story') return `its story went up at ${lunchTime(p.storyAt)} — not read here: its name opens it`;
    if (p.state === 'none') return 'nothing online — ask at the table';
    return p.error ? `not read — ${p.error}` : 'not up yet';
  }
  const dayKeyOf = t => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  function chalkHtml(l, home = false) {
    if (!l?.set) return `<div class="chd"><h3 id="lunchTitle">Lunch</h3><p class="chsub">Not set up yet</p></div><div class="chnone">The places you go and when you go, in Settings › Lunch: their menus are read here each morning.<br><button type="button" class="btn" data-lunch="settings">Set it up</button></div>`;
    const sub = !l.on ? 'switched off' : l.phase === 'off' ? 'no lunch reminder today' : l.phase === 'before' ? `lunch at ${l.at}` : l.phase === 'lunch' ? `lunch time · ${l.at}` : l.phase === 'snoozed' ? `again at ${lunchTime(l.snooze)}` : l.phase === 'went' ? 'enjoy' : l.phase === 'back' ? 'fed' : 'lunch is over';
    const place = (p, i) => `<section class="lp ${p.state}" style="--c:${lunchColor(p, i)}"><h4><i></i><button type="button" class="lgo" data-url="${esc(p.url || '')}"${p.url ? ` title="${esc(p.state === 'story' || p.src === 'story' ? 'Its stories' : 'Its Instagram')} — in your browser"` : ' disabled'}>${esc(p.name)}</button></h4>`
      + (p.dishes.length ? p.dishes.map((d, j) => `<p class="cdish"><span>${esc(d)}</span><i></i><span class="cprice">${j === 0 && p.price ? esc(p.price) : ''}</span></p>`).join('') + `<p class="cfrom">${esc(lunchWhy(p, l))}</p>` : `<p class="cwhy">${esc(lunchWhy(p, l))}</p>`) + '</section>';
    return `<div class="chd"><h3${home ? '' : ' id="lunchTitle"'}>Lunch today</h3><p class="chsub">${esc(fmtDay(l.day))} · ${esc(sub)}</p></div>`
      + `<div class="ccols">${l.places.map(place).join('') || '<p class="chnone">No places yet — Settings › Lunch.</p>'}</div>${home ? '' : REST_FISH.replace('class="restfish"', 'class="cfish"')}`;
  }
  function lunchFootHtml(l) {
    if (!l?.set) return '';
    const from = ['Instagram', l.slack].filter(Boolean).join(', ');
    const st = l.busy ? `Reading the menus — ${l.busy}…` : l.readAt ? `Read at ${lunchTime(l.readAt)}, from ${from}` : `Not read yet today — from ${from}`;
    const now = ['before', 'lunch', 'snoozed'].includes(l.phase) && l.on;
    return `<span class="lstat">${esc(st)}${l.error ? ` · <span class="serr">${esc(l.error)}</span>` : ''}</span>`
      + `<button type="button" class="btn" data-lunch="read"${l.busy ? ' disabled' : ''}>Read again</button>`
      + (now ? `<button type="button" class="btn" data-lunch="snooze"${l.phase === 'before' ? ' disabled title="At lunch time"' : ''}>In 15 min</button><button type="button" class="btn go" data-lunch="going">Going</button>` : '')
      + (state.chat.ready && state.chat.room != null ? '<button type="button" class="btn" data-lunch="poll" title="A poll in the chat: who is going, and where">Ask the chat</button>' : '')
      + '<button type="button" class="btn" data-lunch="settings">Settings…</button><span><kbd>esc</kbd></span>';
  }
  function drawLunch(force = false) {
    if (!force && !$('#lunchd').open) return;
    setHtml($('#lunchBoard'), chalkHtml(state.lunch)); setHtml($('#lunchFoot'), lunchFootHtml(state.lunch));
  }
  async function lunchAct(act, anchor) {
    if (act === 'settings') { if ($('#lunchd').open) $('#lunchd').close(); return settingsAt('lunch', '#lunchOnRow'); }
    if (act === 'poll') { if ($('#lunchd').open) $('#lunchd').close(); chatOpen(); return chatPollForm(lunchPoll()); }   // the chat's poll, filled (2026-10-20)
    try { state.lunch = await api('POST', '/api/lunch', { act }); lunchChanged(); }
    catch (e) { if (anchor) note(anchor, `Not done: ${e.message}`, true); }
  }
  window.peixLunch = act => act === 'menus' ? lunchOpen() : lunchAct(act);   // the app's notification: Menus · Going · In 15 minutes
  // the harness's: the lane's lunch as drawn, and a lock that began `ago` ms back (a lunch can't be waited out in a scenario)
  Object.assign(window.peix, { lunch: () => ({ sign: lunchUi.sign, out: swim.out, away: lunchUi.away, dishes: [...document.querySelectorAll('#sbSwim .ltick > span')].length / 2 }),
    lunchAway: (away, ago = 0) => { lunchAway(away); if (away) lunchUi.awayAt = Date.now() - ago; } });
  for (const box of [$('#lunchd'), $('#log')]) box.addEventListener('click', e => {
    // the board's own chalk only — the dialog's and the home's (2026-11-06): a transcript in #log is nobody's lunch
    const go = e.target.closest('#lunchd .chalk .lgo, #home .chalk .lgo'); if (go) return lunchUrl(go.dataset.url);
    const b = e.target.closest('#lunchd [data-lunch], #home .hlunch [data-lunch]'); if (b) return lunchAct(b.dataset.lunch, b);
    if (e.target === $('#lunchd')) $('#lunchd').close();   // the backdrop
  });
  /** A lunch alert: in front, a chime; the app's banner carries Menus · Going · In 15 minutes; a browser's opens the board. */
  function lunchAlert(a) {
    if (document.visibilityState === 'visible' && document.hasFocus()) chime('reply');
    if (inApp) post({ type: 'alert', kind: 'lunch', heading: a.heading || 'Lunch', project: '', title: a.title || '', snippet: a.snippet || '', sessionId: '', hash: '', serverNotify: !!state.serverNotify, quiet: !!a.quiet, drawer: false });
    if (a.quiet || !('Notification' in window) || Notification.permission !== 'granted') return;
    const n = new Notification(a.heading || 'Lunch', { body: `${a.title}\n${a.snippet || ''}`, tag: 'lunch' });
    n.onclick = () => { window.focus(); lunchOpen(); n.close(); };
  }
  /** Home's chalkboard: the morning's menus, from the first one in until lunch is over. */
  function lunchHomeHtml() {
    const l = state.lunch;
    if (!l?.on || !['before', 'lunch', 'snoozed'].includes(l.phase) || !l.places.some(p => p.state !== 'waiting')) return '';
    return `<div class="chalk">${chalkHtml(l, true)}</div>`;
  }
  /** What the server said changed: the lane, the chalkboard, home, Settings › Lunch. */
  function lunchChanged() { lunchBar(); drawLunch(); homeSoon(); renderLunchSet(); }
  // Settings › Lunch: on, the time and the days; the places; where the menus come from — their posts, a Slack channel —,
  // which model reads them, and how the last round went
  function lunchSetHtml() {
    const l = state.lunch || {}, c = state.config.lunch, text = 'type="text" spellcheck="false" autocomplete="off"';
    const group = (title, kw, rows, foot) => `<section class="sgrp" data-kw="${kw}">${title ? `<h6 class="sgh">${title}</h6>` : ''}<div class="slist">${rows}</div>${foot ? `<p class="sgf">${foot}</p>` : ''}</section>`;
    const on = `<div class="srow set" id="lunchOnRow" data-kw="lunch reminder menu food restaurant"><label class="sl" for="lunchOn"><b>Lunch</b><small>A sign in the status bar and a notification at lunch time, and the menus of the places you go — ⌥⌘M</small></label><input type="checkbox" class="sw" role="switch" id="lunchOn"${c?.on ? ' checked' : ''}></div>`;
    if (!c) return group('', 'lunch', on);
    const days = [[1, 'Mon'], [2, 'Tue'], [3, 'Wed'], [4, 'Thu'], [5, 'Fri'], [6, 'Sat'], [0, 'Sun']].map(([d, n]) => `<button type="button" data-day="${d}" aria-pressed="${c.days.includes(d)}">${n}</button>`).join('');
    const place = (p, i) => `<div class="srow lplace" data-i="${i}"><i class="lsq" style="--c:${lunchColor(p, i)}"></i><input ${text} class="lname" value="${esc(p.name)}" aria-label="The place's name"><label class="ligw" title="Its Instagram account — where its menus are read">@<input ${text} class="lig" value="${esc(p.instagram || '')}" placeholder="its Instagram" aria-label="${esc(p.name)}'s Instagram account"></label><button type="button" class="sdel" title="Forget ${esc(p.name)}" aria-label="Forget ${esc(p.name)}">×</button></div>`;
    const models = [...new Set(['haiku', 'sonnet', c.model || 'haiku'])].map(m => `<option value="${esc(m)}"${(c.model || 'haiku') === m ? ' selected' : ''}>${esc(m[0].toUpperCase() + m.slice(1))}</option>`).join('');
    const stat = l.busy ? `Reading — ${esc(l.busy)}…` : l.readAt ? `Read at ${lunchTime(l.readAt)} · ${l.places?.filter(p => p.dishes.length).length || 0} of ${l.places?.length || 0} menus in` : 'Not read yet today';
    return group('', 'lunch', on
        + `<div class="srow set sub" data-kw="lunch time hour reminder"><label class="sl" for="lunchAt"><b>Lunch time</b><small>The sign and the notification then; the menus are read in the hour and a quarter before</small></label><input type="time" id="lunchAt" value="${esc(c.at)}"></div>`
        + `<div class="srow set sub" data-kw="days weekdays week"><span class="sl" id="slLunchDays"><b>Days</b><small>No reminder, nothing read, on the others</small></span><span class="sseg ldays" role="group" aria-labelledby="slLunchDays">${days}</span></div>`)
      + group('Places', 'lunch places restaurants instagram account', c.places.map(place).join('')
        + `<div class="srow lplace add"><i class="lsq">＋</i><input ${text} class="lname" placeholder="A place you go" aria-label="A new place's name"><label class="ligw">@<input ${text} class="lig" placeholder="its Instagram" aria-label="Its Instagram account"></label><span></span></div>`,
        'Each one\'s menu is read off its Instagram posts, as anyone sees them. Not its stories, which Instagram shows only to someone logged in: the Slack channel below has those.')
      + group('Where the menus come from', 'lunch stories slack channel model claude read',
        `<div class="srow set" data-kw="slack channel colleagues screenshots"><label class="sl" for="lunchSlack"><b>Slack channel</b><small>Where colleagues post the menus — read by Claude's Slack connector, nothing written</small></label><input ${text} class="lslack" id="lunchSlack" value="${esc(c.slack || '')}" placeholder="#lunch"></div>`
        + `<div class="srow set" data-kw="model claude reader haiku sonnet"><label class="sl" for="lunchModel"><b>Read by</b><small>The Claude model that reads each picture once, on your plan</small></label><span class="ssel"><select id="lunchModel">${models}</select></span></div>`
        + `<div class="srow set stat" data-kw="read now menus status" id="lunchStatRow"><span class="sl"><b>${stat}</b><small>${l.error ? `<span class="serr">${esc(l.error)}</span>` : 'Read again any time; on its own each lunch day'}</small></span><button type="button" class="btn" data-lunch="read"${l.busy ? ' disabled' : ''}>Read now</button></div>`);
  }
  function renderLunchSet(force = false) { drawSetup($('#lunchSet'), lunchSetHtml(), force); }
  function loadLunchSet() { api('GET', '/api/lunch').then(d => { state.lunch = d; lunchChanged(); }, () => {}); }
  /** The setup's lunch as it would be with `patch`: the whole of it, as a PUT replaces it. */
  const lunchPut = (patch, anchor) => putConfig({ lunch: patch === null ? null : { ...(state.config.lunch || { at: '12:00', days: [1, 2, 3, 4, 5], places: [] }), ...patch } }, anchor);
  const lunchPlacesInBox = () => [...$('#lunchSet').querySelectorAll('.srow.lplace')].map(r => ({ name: r.querySelector('.lname').value.trim(), instagram: r.querySelector('.lig').value.trim(),
    color: state.config.lunch?.places?.[Number(r.dataset.i)]?.color })).filter(p => p.name).map(p => ({ name: p.name, ...p.instagram && { instagram: p.instagram }, ...p.color && { color: p.color } }));
  $('#lunchSet').addEventListener('focusout', e => { if ($('#lunchSet')._stale && !$('#lunchSet').contains(e.relatedTarget)) renderLunchSet(); });
  $('#lunchSet').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('input[type=text]')) e.target.blur(); });
  $('#lunchSet').addEventListener('change', e => {
    const t = e.target;
    if (t.id === 'lunchOn') return lunchPut({ on: t.checked }, t);
    if (t.id === 'lunchAt') return t.value && lunchPut({ at: t.value }, t);
    if (t.id === 'lunchSlack') return lunchPut({ slack: t.value.trim() || null }, t);
    if (t.id === 'lunchModel') return lunchPut({ model: t.value }, t);
    if (t.closest('.srow.lplace')) { if (t.closest('.add') && !t.closest('.add').querySelector('.lname').value.trim()) return; return lunchPut({ places: lunchPlacesInBox() }, t); }
  });
  $('#lunchSet').addEventListener('click', e => {
    const d = e.target.closest('[data-day]');
    if (d) { const days = new Set(state.config.lunch?.days || []), n = Number(d.dataset.day); if (days.has(n)) days.delete(n); else days.add(n); return lunchPut({ days: [...days] }, d); }
    const x = e.target.closest('.srow.lplace .sdel'); if (x) { x.closest('.srow').remove(); return lunchPut({ places: lunchPlacesInBox() }, x); }
    const b = e.target.closest('[data-lunch]'); if (b) lunchAct(b.dataset.lunch, b);
  });

