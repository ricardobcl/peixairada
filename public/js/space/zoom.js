// ---- Space's zoom (2026-11-18, v3): the grid zoomed whole, so it reflows — more nodes a row as it shrinks, 50–150 % by
// tens (`prefs.spZoom`); its buttons, ⌘+ ⌘− ⌘0 with the keys in Space (chatZoomKey), a pinch or ⌘/⌃-wheel over the nodes.
// Fit: the largest that shows every node without a scroll.
const spZoomNow = () => Math.min(1.5, Math.max(0.5, Number(prefs.spZoom) || 1));

function spZoomShow() {
  const zoom = spZoomNow();
  const grid = $('#spgrid');

  grid.style.setProperty('--spz', String(zoom));
  grid.classList.toggle('small', zoom < 0.75);
  $('#main').style.setProperty('--sp-min', `${Math.ceil(SP_TILE[0] * zoom + 20 + 16)}px`); // the divider's floor: one tile at this zoom, the field's padding and a scrollbar (2026-11-18, v12)
  $('#spzv').textContent = `${Math.round(zoom * 100)}%`;
}

function spZoom(zoom) {
  prefs.spZoom = Math.round(Math.min(1.5, Math.max(0.5, zoom)) * 10) / 10;
  savePrefs();
  spZoomShow();
}

function spFit() {
  const field = $('#spfield');
  const count = $('#spgrid').querySelectorAll('.spt').length;
  const width = field.clientWidth - 20;
  const height = field.clientHeight - 64;

  for (let zoom = 1.5; zoom > 0.5; zoom = Math.round((zoom - 0.1) * 10) / 10) {
    const cols = Math.max(1, Math.floor((width / zoom + 6) / (SP_TILE[0] + 6)));

    if (Math.ceil(count / cols) * (SP_TILE[1] + 8) * zoom <= height) return spZoom(zoom);
  }

  spZoom(0.5);
}

/** Space's ×, and ⌘W on the chat's tab there: the chat closed — Claude runs on —, Space the whole width again. */
function spCloseChat() {
  if (!state.current) return;
  leaveChat();
  renderBoard();
}

const spSoon = () => {
  if (prefs.space && !sp.raf) sp.raf = requestAnimationFrame(renderSpace);
};

/** On or off: the layout, the button, the clock; the chat's column moved, so its drawer and the pane's pages follow. */
function applySpace() {
  const on = !!prefs.space;
  const main = $('#main');

  main.classList.toggle('space', on);
  if (!on) main.classList.remove('spfull');
  applyList(); // the list's button: off while Space has its place
  $('#space').hidden = $('#spdiv').hidden = !on;
  main.style.setProperty('--sp', String(Math.min(0.9, Math.max(0.05, Number(prefs.spaceAt) || 0.52)))); // CSS holds the floors: one tile, the chat's
  const button = $('#sbSpace');

  button.setAttribute('aria-pressed', String(on));
  button.title = `${on ? 'Leave' : 'Open'} Space — every chat as a node of its agents (⌥⌘X)`;
  clearInterval(sp.timer);
  sp.timer = on ? setInterval(spSoon, 5000) : 0;

  if (!on) {
    spAskClose();
    sweepMinis(sp.minis, true);
    clearInterval(sp.askT);
    sp.askT = 0;
  }

  spLook();
  if (on !== !!sp.fall) spFall();
  if (on !== !!sp.visit) spVisit(); // a falling star now and then while Space is on
  if (on) renderSpace();
  const session = state.sessions.get(state.current);

  if (session) {
    drawn.head = null;
    renderHead(session);
    syncTerm(session);
  } else repostPane(); // the header's × is Space's
  if (state.notch) layoutNotch(); // Space's bar round the housing, or the list's
}

function spToggle() {
  prefs.space = !prefs.space;
  savePrefs();
  applySpace();
}

// Settings › Space (2026-11-18, v5): the sky, its twinkle and its falling stars; the agent card, the pods' agents and
// names, the lanes' span. What only looks is a class or an attribute on #space (spLook); what is drawn, a redraw.
function spLook() {
  const sky = prefs.spSky !== false;
  const el = $('#space');

  el.classList.toggle('nosky', !sky);
  el.classList.toggle('still', prefs.spTwinkle === false);
  el.dataset.names = prefs.spNames || 'zoom';
  $('#skyOn').checked = sky;
  $('#twinkleOn').checked = prefs.spTwinkle !== false;
  $('#agCardOn').checked = prefs.spCard !== false;
  $('#busyOnly').checked = !!prefs.spBusy;
  $('#fallPick').value = SP_FALLS[prefs.spFalls] ? prefs.spFalls : 'off';
  $('#podNames').value = prefs.spNames || 'zoom';
  $('#laneSpan').value = String(spWin());
  $('#visitOn').checked = prefs.spVisits !== false;
  $('#askOn').checked = prefs.spAnswer !== false;
  $('#fadeOn').checked = prefs.spFade !== false;
  $('#linksOn').checked = prefs.spLinks !== false;

  for (const [row, box] of [
    ['#twinkleRow', '#twinkleOn'],
    ['#fallRow', '#fallPick'],
    ['#visitRow', '#visitOn'],
  ]) {
    const element = $(row);
    const say = element.querySelector('small');

    element.classList.toggle('off', !sky);
    $(box).disabled = !sky;
    say.textContent = sky ? say.dataset.d : say.dataset.off;
  }
}

const spSet = (key, value, draw) => {
  prefs[key] = value;
  savePrefs();
  spLook();
  if (key === 'spSky' || key === 'spFalls') spFall();
  if (key === 'spSky') spVisit();
  if (draw) renderSpace();
};

$('#skyOn').addEventListener('change', event => spSet('spSky', event.target.checked));
$('#twinkleOn').addEventListener('change', event => spSet('spTwinkle', event.target.checked));
$('#fallPick').addEventListener('change', event => spSet('spFalls', event.target.value));

$('#visitOn').addEventListener('change', event => {
  spSet('spVisits', event.target.checked);
  spVisit();
});

$('#agCardOn').addEventListener('change', event => {
  spSet('spCard', event.target.checked);
  if (!event.target.checked) mxtHide();
});

$('#busyOnly').addEventListener('change', event => spSet('spBusy', event.target.checked, prefs.space));
$('#fadeOn').addEventListener('change', event => spSet('spFade', event.target.checked, prefs.space));
$('#linksOn').addEventListener('change', event => spSet('spLinks', event.target.checked, prefs.space));

$('#askOn').addEventListener('change', event => {
  if (!event.target.checked) spAskClose();
  spSet('spAnswer', event.target.checked, prefs.space);
});

$('#podNames').addEventListener('change', event => spSet('spNames', event.target.value));
$('#laneSpan').addEventListener('change', event => spSet('spWin', +event.target.value, prefs.space));
// The sky (2026-11-18, later), drawn once: four layers of stars from fixed seeds, so it is the same sky every time — the
// first still, the others twinkling (CSS). A falling star now and then (SP_FALL_MS, a random wait each time): from a random
// place in the sky's top half, at a random angle, under a second and a half — never while Space is hidden, the page is,
// the theme is light, or motion is reduced: the wait just starts again.
const SP_FALLS = { rare: [60_000, 180_000], some: [20_000, 60_000], often: [5_000, 20_000] }; // Settings › Space's picks

{
  const rand = seed => () => (seed = (seed * 16807) % 2147483647) / 2147483647;

  // the fifth layer (2026-11-19): a few bigger stars, 3–4.5 px, each with a soft glow, slow to twinkle
  $('#spsky').innerHTML = [
    ['', 11, 46, 0.28],
    ['tw1', 23, 22, 0.55],
    ['tw2', 37, 18, 0.5],
    ['tw3', 51, 14, 0.6],
    ['big', 67, 9, 0.8],
  ]
    .map(([cls, seed, count, opacity]) => {
      const random = rand(seed * 7919);

      return `<b class="${cls}">${Array.from({ length: count }, () => {
        const left = (random() * 100).toFixed(2);
        const top = (random() * 100).toFixed(2);
        const size = cls === 'big' ? (3 + random() * 1.5).toFixed(1) : random() < 0.85 ? 1 : random() < 0.7 ? 1.5 : 2;

        return `<i style="left:${left}%;top:${top}%;width:${size}px;height:${size}px;opacity:${(opacity * (0.6 + random() * 0.4)).toFixed(2)}"></i>`;
      }).join('')}</b>`;
    })
    .join('');
}

function spFall(now = false) {
  clearTimeout(sp.fall);
  sp.fall = 0;
  const at = SP_FALLS[prefs.spFalls];

  if (!prefs.space || !at || prefs.spSky === false) return;
  const wait = at[0] + Math.random() * (at[1] - at[0]);

  if (!now) {
    sp.fall = setTimeout(() => spFall(true), wait);
    return;
  }

  const sky = $('#spsky');

  if (!document.hidden && !REDUCED.matches && getComputedStyle(sky).display !== 'none' && sky.clientWidth) {
    const el = document.createElement('i');
    const deg = 15 + Math.random() * 25;
    const ms = 900 + Math.random() * 500;

    el.className = 'spfall';

    Object.assign(el.style, {
      left: `${(Math.random() * 80).toFixed(1)}%`,
      top: `${(Math.random() * 45).toFixed(1)}%`,
    });

    sky.append(el);

    el.animate(
      [
        { transform: `rotate(${deg}deg) translateX(-130px) scaleX(.3)`, opacity: 0 },
        { opacity: 1, offset: 0.18 },
        { transform: `rotate(${deg}deg) translateX(240px) scaleX(1)`, opacity: 0 },
      ],
      { duration: ms, easing: 'ease-out', id: 'spfall' },
    ).finished.then(
      () => el.remove(),
      () => el.remove(),
    );
  }

  spFall();
}

// A visitor now and then (2026-11-19): a planet — some ringed — drifting across the sky in half a minute or so, or a
// comet in a few seconds, its tail behind it; one at a time, every SP_VISIT_MS, a random wait each; moved by transform
// and opacity alone, and under the same guards as a falling star. `prefs.spVisits`.
const SP_VISIT_MS = [45_000, 150_000];

function spVisit(now = false) {
  clearTimeout(sp.visit);
  sp.visit = 0;
  if (!prefs.space || prefs.spSky === false || prefs.spVisits === false) return;

  if (!now) {
    sp.visit = setTimeout(() => spVisit(true), SP_VISIT_MS[0] + Math.random() * (SP_VISIT_MS[1] - SP_VISIT_MS[0]));
    return;
  }

  const sky = $('#spsky');
  const width = sky.clientWidth;
  const height = sky.clientHeight;

  if (
    !document.hidden &&
    !REDUCED.matches &&
    getComputedStyle(sky).display !== 'none' &&
    width &&
    !sky.querySelector('.spvis')
  ) {
    const el = document.createElement('i');
    const comet = Math.random() < 0.5;
    const ltr = Math.random() < 0.5;
    const y0 = height * (0.08 + Math.random() * 0.6);
    const dy = (Math.random() - 0.5) * height * (comet ? 0.5 : 0.15);

    if (comet) {
      el.className = 'spvis spcomet';
      el.innerHTML = '<s></s>';
    } else {
      const size = 14 + Math.round(Math.random() * 22);
      const hue = [25, 55, 200, 280, 150][Math.floor(Math.random() * 5)];

      el.className = `spvis spplanet${Math.random() < 0.4 ? ' ringed' : ''}`;
      el.style.setProperty('--d', `${size}px`);
      el.style.setProperty('--h', String(hue));
      el.innerHTML = '<s></s>';
    }

    el.style.top = `${y0.toFixed(0)}px`;
    sky.append(el);

    const pad = 160;
    const from = ltr ? -pad : width + pad;
    const to = ltr ? width + pad : -pad;
    const turn = comet ? (Math.atan2(dy, to - from) * 180) / Math.PI : 0;

    el.animate(
      [
        { transform: `translate(${from}px, 0) rotate(${turn}deg)`, opacity: 0 },
        { opacity: comet ? 0.95 : 0.85, offset: 0.1 },
        { opacity: comet ? 0.95 : 0.85, offset: 0.9 },
        { transform: `translate(${to}px, ${dy}px) rotate(${turn}deg)`, opacity: 0 },
      ],
      {
        duration: comet ? 5000 + Math.random() * 4000 : 28000 + Math.random() * 20000,
        easing: 'linear',
        id: 'spvisit',
      },
    ).finished.then(
      () => el.remove(),
      () => el.remove(),
    );
  }

  spVisit();
}

$('#sbSpace').onclick = spToggle;

$('#spgrid').addEventListener('pointerover', event => {
  const id = event.target.closest?.('.spt[data-id]')?.dataset.id || null;

  if (id !== sp.over) {
    sp.over = id;
    spLitLinks();
  }
});

$('#spgrid').addEventListener('pointerleave', () => {
  sp.over = null;
  spLitLinks();
});

new ResizeObserver(() => spLinksSoon()).observe($('#spgrid'));

$('#spgrid').addEventListener('keydown', event => {
  // F on a node: star it, or not; D: done, or back
  const key = event.key.toLowerCase();

  const node =
    (key === 'f' || key === 'd') &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.altKey &&
    event.target.closest?.('.spt[data-id]');

  const pill =
    event.key === 'Enter' &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.altKey &&
    event.target.matches?.('.spt[data-id]') &&
    event.target.querySelector('.spask[data-tid]');

  if (pill) {
    event.preventDefault();
    return spAskOpen(event.target.dataset.id, pill.dataset.tid);
  } // ⏎ on a node asking you: its question

  if (!node) return;
  event.preventDefault();
  if (key === 'f') setFav(node.dataset.id, !state.sessions.get(node.dataset.id)?.fav);
  else spTick(node.dataset.id, node.querySelector('.spdone'));
});

// ⌘F with the keys in Space — not in the chat beside it, whose find stays its own — is its box (2026-11-23)
addEventListener(
  'keydown',
  event => {
    if (
      !prefs.space ||
      event.code !== 'KeyF' ||
      !event.metaKey ||
      event.altKey ||
      event.ctrlKey ||
      event.shiftKey ||
      $('#space').hidden ||
      document.querySelector('dialog[open]')
    ) {
      return;
    }

    if (event.target.closest?.('#chat, #sessions')) return;
    event.preventDefault();
    event.stopPropagation();
    const box = $('#spq');

    box.focus();
    box.select();
  },
  true,
);

const spRing = () => $('#spgrid .spt.hit')?.scrollIntoView({ block: 'nearest' });

/** The word being typed, if it is a filter's start: the whole of it and where it starts. */
const spPartial = text => {
  const match = /(?:^|\s)((?:is|pr):\w*|[@#]\S*)$/.exec(text);

  return match ? { w: match[1], at: text.length - match[1].length } : null;
};

/** What a filter's start can be: [token, what it means, how many chats it keeps]. */
function spTokRows(word) {
  const pool = projectList().find(project => project.key === prefs.project)?.sessions || [];
  const keeps = token => pool.filter(spTokTest(token) || (() => false)).length;

  const lw = word.toLowerCase();

  const list = lw.startsWith('is:')
    ? Object.keys(SP_IS).map(name => [`is:${name}`, SP_IS_SAY[name]])
    : lw.startsWith('pr:')
      ? Object.keys(SP_PRS).map(name => [`pr:${name}`, SP_PRS_SAY[name]])
      : lw.startsWith('@')
        ? [...new Set(pool.flatMap(spTypes))].sort().map(type => [`@${type}`, 'an agent of that type'])
        : [...new Set(pool.map(session => session.project).filter(Boolean))]
            .sort()
            .map(project => [`#${project}`, 'its project']);

  return list
    .filter(([token]) => token.toLowerCase().startsWith(lw) && !sp.toks.includes(token))
    .map(([token, say]) => [token, say, keeps(token)])
    .slice(0, 8);
}

function spTokDraw() {
  $('#spq').parentElement.classList.toggle('toks', sp.toks.length > 0);

  setHtml(
    $('#sptoks'),
    sp.toks
      .map(
        (token, index) =>
          `<span class="sptok">${esc(token)}<button type="button" data-i="${index}" aria-label="${esc(`Take ${token} off`)}">×</button></span>`,
      )
      .join(''),
  );

  const box = $('#spq');
  const dropdown = $('#spqd');
  const part = document.activeElement === box && spPartial(box.value);
  const rows = part && part.w !== sp.dshut ? spTokRows(part.w) : [];

  dropdown.hidden = !rows.length;
  if (!rows.length) return setHtml(dropdown, '');
  sp.dsel = Math.min(sp.dsel, rows.length - 1);

  setHtml(
    dropdown,
    rows
      .map(
        ([token, say, count], index) =>
          `<div class="dr${index === sp.dsel ? ' on' : ''}" role="option" aria-selected="${index === sp.dsel}" data-tok="${esc(token)}"><code>${esc(token)}</code><span>${esc(say)}</span><em>${count}</em></div>`,
      )
      .join(''),
  );
}

/** A filter taken: a chip, the word typed for it gone. */
function spTokAdd(token) {
  const box = $('#spq');
  const part = spPartial(box.value);

  if (!sp.toks.includes(token)) sp.toks.push(token);
  box.value = sp.q = part ? box.value.slice(0, part.at) : box.value;
  sp.sel = 0;
  sp.dsel = 0;
  renderSpace();
  box.focus();
}

/** Words typed: a whole filter followed by a space becomes a chip; the rest stays text. */
function spTyped(box) {
  const text = box.value;
  const match = /(?:^|\s)((?:is|pr):\w+|[@#]\S+)\s$/.exec(text);

  if (match && spTokTest(match[1])) {
    if (!sp.toks.includes(match[1])) sp.toks.push(match[1]);
    box.value = text.slice(0, text.length - match[0].length + (match[0].startsWith(' ') ? 1 : 0)).trimStart();
  }

  sp.q = box.value;
  sp.sel = 0;
  sp.dsel = 0;
  sp.dshut = '';
}

$('#spq').addEventListener('input', event => {
  spTyped(event.target);
  renderSpace();
  $('#spfield').scrollTop = 0;
});

$('#spq').addEventListener('focus', () => spTokDraw());

$('#spq').addEventListener('blur', () =>
  setTimeout(() => {
    if (document.activeElement !== $('#spq')) $('#spqd').hidden = true;
  }, 150),
);

$('#spqd').addEventListener('pointerdown', event => {
  const row = event.target.closest('.dr[data-tok]');

  if (row) {
    event.preventDefault();
    spTokAdd(row.dataset.tok);
  }
});

$('#sptoks').addEventListener('click', event => {
  const button = event.target.closest('button[data-i]');

  if (button) {
    sp.toks.splice(+button.dataset.i, 1);
    sp.sel = 0;
    renderSpace();
    $('#spq').focus();
  }
});

$('#spq').addEventListener('keydown', event => {
  if (event.metaKey || event.ctrlKey || event.altKey) return;

  const dropdown = $('#spqd');
  const rows = dropdown.hidden ? [] : [...dropdown.querySelectorAll('.dr[data-tok]')];

  if (rows.length) {
    // a filter's start typed: its list has the arrows, ⇥ and ⏎ take one, esc closes it
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      sp.dsel = (sp.dsel + (event.key === 'ArrowDown' ? 1 : rows.length - 1)) % rows.length;
      return spTokDraw();
    }

    if (event.key === 'Tab' || event.key === 'Enter') {
      event.preventDefault();
      return spTokAdd(rows[sp.dsel].dataset.tok);
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      sp.dshut = spPartial(event.target.value)?.w || '';
      return spTokDraw();
    }
  }

  if (event.key === 'Backspace' && !event.target.value && sp.toks.length) {
    event.preventDefault();
    sp.toks.pop();
    sp.sel = 0;
    return renderSpace();
  }

  const step = { ArrowDown: 1, ArrowUp: -1 }[event.key];

  if (step && spOn()) {
    event.preventDefault();
    sp.sel = Math.max(0, Math.min(sp.list.length - 1, sp.sel + step));
    renderSpace();
    return spRing();
  }

  if (event.key === 'Enter' && spOn()) {
    event.preventDefault();
    const session = sp.list[sp.sel];

    if (session && session.id !== state.current) openSession(session.id);
    return;
  }

  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    if (event.target.value || sp.toks.length) {
      event.target.value = sp.q = '';
      sp.toks = [];
      sp.sel = 0;
      renderSpace();
    } else event.target.blur();
  }
});

$('#space').addEventListener('click', event => {
  const filter = event.target.closest('.spf[data-k]');

  if (filter) {
    const status = filter.dataset.k;
    const off = spOff();

    prefs.spOff = off.includes(status) ? off.filter(other => other !== status) : [...off, status];
    savePrefs();
    return renderSpace();
  }

  const winButton = event.target.closest('.spwin [data-w]');

  if (winButton) {
    prefs.spWin = +winButton.dataset.w;
    savePrefs();
    spLook();
    return renderSpace();
  }

  const zoomButton = event.target.closest('.spzoom [data-z]');

  if (zoomButton) return zoomButton.dataset.z === 'fit' ? spFit() : spZoom(spZoomNow() + 0.1 * +zoomButton.dataset.z);

  if (event.target.closest('.spfold')) {
    prefs.spLanes = prefs.spLanes === false;
    savePrefs();
    return renderSpace();
  }

  // a pod's +N: the ones done or idle, folded again SP_OPEN_MS on — later while the pointer is on its chat (2026-11-18, v10)
  const px = event.target.closest('.spx[data-pod]');

  if (px) {
    const key = `${px.closest('.spt').dataset.id}:${px.dataset.pod}`;

    sp.open.has(key) ? spShut(key) : spOpen(key);
    return renderSpace();
  }

  // an agent's mark: its chat, open on that agent's tab — its own transcript (2026-11-18, v8); one with none yet, the chat
  const mk = event.target.closest('.spgrid .spa[data-ag]');
  const ms = mk && state.sessions.get(mk.dataset.sid);
  const mr = ms && spRows(ms).find(row => row.id === mk.dataset.ag);

  if (mr && AG_ID.test(String(mr.id)) && mr.st !== 'joined') {
    mxtHide();
    return agOpen(ms, mr);
  }

  // the star: its own target, or the one under the pointer should the click go to the node's button (2026-11-18, v11)
  const star =
    event.target.closest('.spstar') ||
    (event.detail &&
      event.target.matches?.('.spt') &&
      document.elementFromPoint(event.clientX, event.clientY)?.closest('.spstar'));

  if (star) {
    const id = star.closest('.spt').dataset.id;

    return setFav(id, !state.sessions.get(id)?.fav);
  }

  const tk = event.target.closest('.spdone');

  if (tk) return spTick(tk.closest('.spt').dataset.id, tk);
  const ar = event.target.closest('#spar [data-arr]');

  if (ar) {
    prefs.spArrange = ar.dataset.arr;
    savePrefs();
    return renderSpace();
  }

  const tkp = event.target.closest('.sptk[data-url]'); // its ticket's page, beside the chat (2026-11-24)

  if (tkp) {
    const id = tkp.closest('.spt').dataset.id;
    const url = tkp.dataset.url;

    if (url) {
      (id === state.current ? Promise.resolve() : openSession(id)).then(() => {
        const chat = state.sessions.get(id);

        if (chat && state.current === id) openExternal(url, { s: chat });
      });
    }

    return;
  }

  const ak = event.target.closest('.spask'); // its question (2026-11-24); one asked elsewhere opens nothing

  if (ak) {
    if (ak.dataset.tid) {
      const id = ak.closest('.spt').dataset.id;

      sp.ask?.tid === ak.dataset.tid ? spAskClose() : spAskOpen(id, ak.dataset.tid);
    }

    return;
  }

  // a PR in a node's list: its chat open, the PR on a tab beside it (2026-11-23); the pill itself opens nothing
  const pr = event.target.closest('.spprr[data-url]');

  if (pr) {
    const id = pr.closest('.spt').dataset.id;
    const url = pr.dataset.url;

    (id === state.current ? Promise.resolve() : openSession(id)).then(() => {
      const chat = state.sessions.get(id);

      if (chat && state.current === id) openExternal(url, { s: chat });
    });

    return;
  }

  if (event.target.closest('.sppr')) return;
  const node = event.target.closest('.spt[data-id]');

  if (node && event.shiftKey) {
    const id = node.dataset.id;

    sp.chosen.has(id) ? sp.chosen.delete(id) : sp.chosen.add(id);
    return renderSpace();
  } // ⇧-click: chosen, or not

  if (node) {
    if (sp.chosen.size) {
      sp.chosen.clear();
      renderSpace();
    }

    if (node.dataset.id !== state.current) openSession(node.dataset.id);
    return;
  }

  const session = state.sessions.get(state.current);
  const lane = event.target.closest('.splane[data-ag]');
  const agent = lane && session && spRows(session).find(row => row.id === lane.dataset.ag);

  if (agent) agOpen(session, agent);
});

// a pinch over the nodes is theirs: Chrome's comes as a wheel with ⌃, WebKit's as gesture events; ⌘-wheel too
// the gesture's own zoom, unrounded (2026-11-24, review): a slow pinch's small steps add up, where each rounded to tenths
// came back to where it was; an event's step at most a tenth, a mouse's notch
{
  let raw = null;
  let rest = 0;

  $('#spfield').addEventListener(
    'wheel',
    event => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      clearTimeout(rest);

      rest = setTimeout(() => {
        raw = null;
      }, 300);

      raw = Math.min(
        1.5,
        Math.max(0.5, (raw ?? spZoomNow()) * Math.exp(-Math.max(-30, Math.min(30, event.deltaY)) / 300)),
      );

      spZoom(raw);
    },
    { passive: false },
  );
}

{
  let at = 1;
  const field = $('#spfield');

  field.addEventListener('gesturestart', event => {
    event.preventDefault();
    at = spZoomNow();
  });

  field.addEventListener('gesturechange', event => {
    event.preventDefault();
    spZoom(at * event.scale);
  });
}

$('#space').addEventListener('keydown', event => {
  if (event.metaKey || event.ctrlKey || event.altKey) return;

  if ((event.key === 'Enter' || event.key === ' ') && event.target.matches?.('.splane[data-ag]')) {
    event.preventDefault();
    return event.target.click();
  }

  const at = event.target.closest?.('#spgrid .spt');

  if (event.key === 'Escape' && sp.chosen.size && !event.target.closest?.('input, textarea')) {
    event.preventDefault();
    event.stopPropagation();
    sp.chosen.clear();
    return renderSpace();
  }

  if (!at || !['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();

  // by the grid as it lies (2026-11-24): ←→ the node before or after, ↑↓ the nearest in the row above or below, Home End the ends
  const nodes = [...$('#spgrid').querySelectorAll('.spt')];
  const index = nodes.indexOf(at);
  const box = node => node.getBoundingClientRect();
  const here = box(at);
  const cx = here.left + here.width / 2;

  let to;

  if (event.key === 'Home') to = nodes[0];
  else if (event.key === 'End') to = nodes.at(-1);
  else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    to = nodes[Math.max(0, Math.min(nodes.length - 1, index + (event.key === 'ArrowRight' ? 1 : -1)))];
  } else {
    const down = event.key === 'ArrowDown';

    const rows = nodes
      .map(node => [node, box(node)])
      .filter(([, rect]) => (down ? rect.top > here.top + 4 : rect.top < here.top - 4));

    const row = down ? Math.min(...rows.map(([, rect]) => rect.top)) : Math.max(...rows.map(([, rect]) => rect.top));

    to =
      rows
        .filter(([, rect]) => Math.abs(rect.top - row) < 4)
        .sort(
          ([, first], [, second]) =>
            Math.abs(first.left + first.width / 2 - cx) - Math.abs(second.left + second.width / 2 - cx),
        )[0]?.[0] || at;
  }

  if (event.shiftKey && to) {
    sp.chosen.add(at.dataset.id);
    sp.chosen.add(to.dataset.id);
    renderSpace();
  } // ⇧: both chosen

  to?.focus();
  to?.scrollIntoView({ block: 'nearest' });
});
