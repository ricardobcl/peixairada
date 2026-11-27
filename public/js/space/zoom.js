// ---- Space's zoom (2026-11-18, v3): the grid zoomed whole, so it reflows — more nodes a row as it shrinks, 50–150 % by
// tens (`prefs.spZoom`); its buttons, ⌘+ ⌘− ⌘0 with the keys in Space (chatZoomKey), a pinch or ⌘/⌃-wheel over the nodes.
// Fit: the largest that shows every node without a scroll.
const spZoomNow = () => Math.min(1.5, Math.max(0.5, Number(prefs.spZoom) || 1));

function spZoomShow() {
  const z = spZoomNow();
  const g = $('#spgrid');

  g.style.setProperty('--spz', String(z));
  g.classList.toggle('small', z < 0.75);
  $('#main').style.setProperty('--sp-min', `${Math.ceil(SP_TILE[0] * z + 20 + 16)}px`); // the divider's floor: one tile at this zoom, the field's padding and a scrollbar (2026-11-18, v12)
  $('#spzv').textContent = `${Math.round(z * 100)}%`;
}

function spZoom(z) {
  prefs.spZoom = Math.round(Math.min(1.5, Math.max(0.5, z)) * 10) / 10;
  savePrefs();
  spZoomShow();
}

function spFit() {
  const f = $('#spfield');
  const n = $('#spgrid').querySelectorAll('.spt').length;
  const W = f.clientWidth - 20;
  const H = f.clientHeight - 64;

  for (let z = 1.5; z > 0.5; z = Math.round((z - 0.1) * 10) / 10) {
    const cols = Math.max(1, Math.floor((W / z + 6) / (SP_TILE[0] + 6)));

    if (Math.ceil(n / cols) * (SP_TILE[1] + 8) * z <= H) return spZoom(z);
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
  const b = $('#sbSpace');

  b.setAttribute('aria-pressed', String(on));
  b.title = `${on ? 'Leave' : 'Open'} Space — every chat as a node of its agents (⌥⌘X)`;
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
  const s = state.sessions.get(state.current);

  if (s) {
    drawn.head = null;
    renderHead(s);
    syncTerm(s);
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
    const r = $(row);
    const say = r.querySelector('small');

    r.classList.toggle('off', !sky);
    $(box).disabled = !sky;
    say.textContent = sky ? say.dataset.d : say.dataset.off;
  }
}

const spSet = (k, v, draw) => {
  prefs[k] = v;
  savePrefs();
  spLook();
  if (k === 'spSky' || k === 'spFalls') spFall();
  if (k === 'spSky') spVisit();
  if (draw) renderSpace();
};

$('#skyOn').addEventListener('change', e => spSet('spSky', e.target.checked));
$('#twinkleOn').addEventListener('change', e => spSet('spTwinkle', e.target.checked));
$('#fallPick').addEventListener('change', e => spSet('spFalls', e.target.value));

$('#visitOn').addEventListener('change', e => {
  spSet('spVisits', e.target.checked);
  spVisit();
});

$('#agCardOn').addEventListener('change', e => {
  spSet('spCard', e.target.checked);
  if (!e.target.checked) mxtHide();
});

$('#busyOnly').addEventListener('change', e => spSet('spBusy', e.target.checked, prefs.space));
$('#fadeOn').addEventListener('change', e => spSet('spFade', e.target.checked, prefs.space));
$('#linksOn').addEventListener('change', e => spSet('spLinks', e.target.checked, prefs.space));

$('#askOn').addEventListener('change', e => {
  if (!e.target.checked) spAskClose();
  spSet('spAnswer', e.target.checked, prefs.space);
});

$('#podNames').addEventListener('change', e => spSet('spNames', e.target.value));
$('#laneSpan').addEventListener('change', e => spSet('spWin', +e.target.value, prefs.space));
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
    .map(([cls, seed, n, o]) => {
      const r = rand(seed * 7919);

      return `<b class="${cls}">${Array.from({ length: n }, () => {
        const x = (r() * 100).toFixed(2);
        const y = (r() * 100).toFixed(2);
        const d = cls === 'big' ? (3 + r() * 1.5).toFixed(1) : r() < 0.85 ? 1 : r() < 0.7 ? 1.5 : 2;

        return `<i style="left:${x}%;top:${y}%;width:${d}px;height:${d}px;opacity:${(o * (0.6 + r() * 0.4)).toFixed(2)}"></i>`;
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
  const W = sky.clientWidth;
  const H = sky.clientHeight;

  if (
    !document.hidden &&
    !REDUCED.matches &&
    getComputedStyle(sky).display !== 'none' &&
    W &&
    !sky.querySelector('.spvis')
  ) {
    const el = document.createElement('i');
    const comet = Math.random() < 0.5;
    const ltr = Math.random() < 0.5;
    const y0 = H * (0.08 + Math.random() * 0.6);
    const dy = (Math.random() - 0.5) * H * (comet ? 0.5 : 0.15);

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
    const from = ltr ? -pad : W + pad;
    const to = ltr ? W + pad : -pad;
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

$('#spgrid').addEventListener('pointerover', e => {
  const id = e.target.closest?.('.spt[data-id]')?.dataset.id || null;

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

$('#spgrid').addEventListener('keydown', e => {
  // F on a node: star it, or not; D: done, or back
  const k = e.key.toLowerCase();
  const n = (k === 'f' || k === 'd') && !e.metaKey && !e.ctrlKey && !e.altKey && e.target.closest?.('.spt[data-id]');

  const pill =
    e.key === 'Enter' &&
    !e.metaKey &&
    !e.ctrlKey &&
    !e.altKey &&
    e.target.matches?.('.spt[data-id]') &&
    e.target.querySelector('.spask[data-tid]');

  if (pill) {
    e.preventDefault();
    return spAskOpen(e.target.dataset.id, pill.dataset.tid);
  } // ⏎ on a node asking you: its question

  if (!n) return;
  e.preventDefault();
  if (k === 'f') setFav(n.dataset.id, !state.sessions.get(n.dataset.id)?.fav);
  else spTick(n.dataset.id, n.querySelector('.spdone'));
});

// ⌘F with the keys in Space — not in the chat beside it, whose find stays its own — is its box (2026-11-23)
addEventListener(
  'keydown',
  e => {
    if (
      !prefs.space ||
      e.code !== 'KeyF' ||
      !e.metaKey ||
      e.altKey ||
      e.ctrlKey ||
      e.shiftKey ||
      $('#space').hidden ||
      document.querySelector('dialog[open]')
    ) {
      return;
    }

    if (e.target.closest?.('#chat, #sessions')) return;
    e.preventDefault();
    e.stopPropagation();
    const box = $('#spq');

    box.focus();
    box.select();
  },
  true,
);

const spRing = () => $('#spgrid .spt.hit')?.scrollIntoView({ block: 'nearest' });

/** The word being typed, if it is a filter's start: the whole of it and where it starts. */
const spPartial = v => {
  const m = /(?:^|\s)((?:is|pr):\w*|[@#]\S*)$/.exec(v);

  return m ? { w: m[1], at: v.length - m[1].length } : null;
};

/** What a filter's start can be: [token, what it means, how many chats it keeps]. */
function spTokRows(w) {
  const pool = projectList().find(x => x.key === prefs.project)?.sessions || [];
  const n = t => pool.filter(spTokTest(t) || (() => false)).length;

  const lw = w.toLowerCase();

  const list = lw.startsWith('is:')
    ? Object.keys(SP_IS).map(k => [`is:${k}`, SP_IS_SAY[k]])
    : lw.startsWith('pr:')
      ? Object.keys(SP_PRS).map(k => [`pr:${k}`, SP_PRS_SAY[k]])
      : lw.startsWith('@')
        ? [...new Set(pool.flatMap(spTypes))].sort().map(k => [`@${k}`, 'an agent of that type'])
        : [...new Set(pool.map(s => s.project).filter(Boolean))].sort().map(k => [`#${k}`, 'its project']);

  return list
    .filter(([t]) => t.toLowerCase().startsWith(lw) && !sp.toks.includes(t))
    .map(([t, say]) => [t, say, n(t)])
    .slice(0, 8);
}

function spTokDraw() {
  $('#spq').parentElement.classList.toggle('toks', sp.toks.length > 0);

  setHtml(
    $('#sptoks'),
    sp.toks
      .map(
        (t, i) =>
          `<span class="sptok">${esc(t)}<button type="button" data-i="${i}" aria-label="${esc(`Take ${t} off`)}">×</button></span>`,
      )
      .join(''),
  );

  const box = $('#spq');
  const d = $('#spqd');
  const part = document.activeElement === box && spPartial(box.value);
  const rows = part && part.w !== sp.dshut ? spTokRows(part.w) : [];

  d.hidden = !rows.length;
  if (!rows.length) return setHtml(d, '');
  sp.dsel = Math.min(sp.dsel, rows.length - 1);

  setHtml(
    d,
    rows
      .map(
        ([t, say, n], i) =>
          `<div class="dr${i === sp.dsel ? ' on' : ''}" role="option" aria-selected="${i === sp.dsel}" data-tok="${esc(t)}"><code>${esc(t)}</code><span>${esc(say)}</span><em>${n}</em></div>`,
      )
      .join(''),
  );
}

/** A filter taken: a chip, the word typed for it gone. */
function spTokAdd(t) {
  const box = $('#spq');
  const part = spPartial(box.value);

  if (!sp.toks.includes(t)) sp.toks.push(t);
  box.value = sp.q = part ? box.value.slice(0, part.at) : box.value;
  sp.sel = 0;
  sp.dsel = 0;
  renderSpace();
  box.focus();
}

/** Words typed: a whole filter followed by a space becomes a chip; the rest stays text. */
function spTyped(box) {
  const v = box.value;
  const m = /(?:^|\s)((?:is|pr):\w+|[@#]\S+)\s$/.exec(v);

  if (m && spTokTest(m[1])) {
    if (!sp.toks.includes(m[1])) sp.toks.push(m[1]);
    box.value = v.slice(0, v.length - m[0].length + (m[0].startsWith(' ') ? 1 : 0)).trimStart();
  }

  sp.q = box.value;
  sp.sel = 0;
  sp.dsel = 0;
  sp.dshut = '';
}

$('#spq').addEventListener('input', e => {
  spTyped(e.target);
  renderSpace();
  $('#spfield').scrollTop = 0;
});

$('#spq').addEventListener('focus', () => spTokDraw());

$('#spq').addEventListener('blur', () =>
  setTimeout(() => {
    if (document.activeElement !== $('#spq')) $('#spqd').hidden = true;
  }, 150),
);

$('#spqd').addEventListener('pointerdown', e => {
  const r = e.target.closest('.dr[data-tok]');

  if (r) {
    e.preventDefault();
    spTokAdd(r.dataset.tok);
  }
});

$('#sptoks').addEventListener('click', e => {
  const b = e.target.closest('button[data-i]');

  if (b) {
    sp.toks.splice(+b.dataset.i, 1);
    sp.sel = 0;
    renderSpace();
    $('#spq').focus();
  }
});

$('#spq').addEventListener('keydown', e => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;

  const d = $('#spqd');
  const rows = d.hidden ? [] : [...d.querySelectorAll('.dr[data-tok]')];

  if (rows.length) {
    // a filter's start typed: its list has the arrows, ⇥ and ⏎ take one, esc closes it
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      sp.dsel = (sp.dsel + (e.key === 'ArrowDown' ? 1 : rows.length - 1)) % rows.length;
      return spTokDraw();
    }

    if (e.key === 'Tab' || e.key === 'Enter') {
      e.preventDefault();
      return spTokAdd(rows[sp.dsel].dataset.tok);
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      sp.dshut = spPartial(e.target.value)?.w || '';
      return spTokDraw();
    }
  }

  if (e.key === 'Backspace' && !e.target.value && sp.toks.length) {
    e.preventDefault();
    sp.toks.pop();
    sp.sel = 0;
    return renderSpace();
  }

  const step = { ArrowDown: 1, ArrowUp: -1 }[e.key];

  if (step && spOn()) {
    e.preventDefault();
    sp.sel = Math.max(0, Math.min(sp.list.length - 1, sp.sel + step));
    renderSpace();
    return spRing();
  }

  if (e.key === 'Enter' && spOn()) {
    e.preventDefault();
    const s = sp.list[sp.sel];

    if (s && s.id !== state.current) openSession(s.id);
    return;
  }

  if (e.key === 'Escape') {
    e.preventDefault();
    e.stopPropagation();
    if (e.target.value || sp.toks.length) {
      e.target.value = sp.q = '';
      sp.toks = [];
      sp.sel = 0;
      renderSpace();
    } else e.target.blur();
  }
});

$('#space').addEventListener('click', e => {
  const f = e.target.closest('.spf[data-k]');

  if (f) {
    const k = f.dataset.k;
    const off = spOff();

    prefs.spOff = off.includes(k) ? off.filter(x => x !== k) : [...off, k];
    savePrefs();
    return renderSpace();
  }

  const w = e.target.closest('.spwin [data-w]');

  if (w) {
    prefs.spWin = +w.dataset.w;
    savePrefs();
    spLook();
    return renderSpace();
  }

  const z = e.target.closest('.spzoom [data-z]');

  if (z) return z.dataset.z === 'fit' ? spFit() : spZoom(spZoomNow() + 0.1 * +z.dataset.z);

  if (e.target.closest('.spfold')) {
    prefs.spLanes = prefs.spLanes === false;
    savePrefs();
    return renderSpace();
  }

  // a pod's +N: the ones done or idle, folded again SP_OPEN_MS on — later while the pointer is on its chat (2026-11-18, v10)
  const px = e.target.closest('.spx[data-pod]');

  if (px) {
    const key = `${px.closest('.spt').dataset.id}:${px.dataset.pod}`;

    sp.open.has(key) ? spShut(key) : spOpen(key);
    return renderSpace();
  }

  // an agent's mark: its chat, open on that agent's tab — its own transcript (2026-11-18, v8); one with none yet, the chat
  const mk = e.target.closest('.spgrid .spa[data-ag]');
  const ms = mk && state.sessions.get(mk.dataset.sid);
  const mr = ms && spRows(ms).find(x => x.id === mk.dataset.ag);

  if (mr && AG_ID.test(String(mr.id)) && mr.st !== 'joined') {
    mxtHide();
    return agOpen(ms, mr);
  }

  // the star: its own target, or the one under the pointer should the click go to the node's button (2026-11-18, v11)
  const star =
    e.target.closest('.spstar') ||
    (e.detail && e.target.matches?.('.spt') && document.elementFromPoint(e.clientX, e.clientY)?.closest('.spstar'));

  if (star) {
    const id = star.closest('.spt').dataset.id;

    return setFav(id, !state.sessions.get(id)?.fav);
  }

  const tk = e.target.closest('.spdone');

  if (tk) return spTick(tk.closest('.spt').dataset.id, tk);
  const ar = e.target.closest('#spar [data-arr]');

  if (ar) {
    prefs.spArrange = ar.dataset.arr;
    savePrefs();
    return renderSpace();
  }

  const tkp = e.target.closest('.sptk[data-url]'); // its ticket's page, beside the chat (2026-11-24)

  if (tkp) {
    const id = tkp.closest('.spt').dataset.id;
    const url = tkp.dataset.url;

    if (url) {
      (id === state.current ? Promise.resolve() : openSession(id)).then(() => {
        const c = state.sessions.get(id);

        if (c && state.current === id) openExternal(url, { s: c });
      });
    }

    return;
  }

  const ak = e.target.closest('.spask'); // its question (2026-11-24); one asked elsewhere opens nothing

  if (ak) {
    if (ak.dataset.tid) {
      const id = ak.closest('.spt').dataset.id;

      sp.ask?.tid === ak.dataset.tid ? spAskClose() : spAskOpen(id, ak.dataset.tid);
    }

    return;
  }

  // a PR in a node's list: its chat open, the PR on a tab beside it (2026-11-23); the pill itself opens nothing
  const pr = e.target.closest('.spprr[data-url]');

  if (pr) {
    const id = pr.closest('.spt').dataset.id;
    const url = pr.dataset.url;

    (id === state.current ? Promise.resolve() : openSession(id)).then(() => {
      const s = state.sessions.get(id);

      if (s && state.current === id) openExternal(url, { s });
    });

    return;
  }

  if (e.target.closest('.sppr')) return;
  const node = e.target.closest('.spt[data-id]');

  if (node && e.shiftKey) {
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

  const s = state.sessions.get(state.current);
  const lane = e.target.closest('.splane[data-ag]');
  const r = lane && s && spRows(s).find(x => x.id === lane.dataset.ag);

  if (r) agOpen(s, r);
});

// a pinch over the nodes is theirs: Chrome's comes as a wheel with ⌃, WebKit's as gesture events; ⌘-wheel too
// the gesture's own zoom, unrounded (2026-11-24, review): a slow pinch's small steps add up, where each rounded to tenths
// came back to where it was; an event's step at most a tenth, a mouse's notch
{
  let raw = null;
  let rest = 0;

  $('#spfield').addEventListener(
    'wheel',
    e => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      clearTimeout(rest);

      rest = setTimeout(() => {
        raw = null;
      }, 300);

      raw = Math.min(1.5, Math.max(0.5, (raw ?? spZoomNow()) * Math.exp(-Math.max(-30, Math.min(30, e.deltaY)) / 300)));
      spZoom(raw);
    },
    { passive: false },
  );
}

{
  let at = 1;
  const field = $('#spfield');

  field.addEventListener('gesturestart', e => {
    e.preventDefault();
    at = spZoomNow();
  });

  field.addEventListener('gesturechange', e => {
    e.preventDefault();
    spZoom(at * e.scale);
  });
}

$('#space').addEventListener('keydown', e => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;

  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('.splane[data-ag]')) {
    e.preventDefault();
    return e.target.click();
  }

  const at = e.target.closest?.('#spgrid .spt');

  if (e.key === 'Escape' && sp.chosen.size && !e.target.closest?.('input, textarea')) {
    e.preventDefault();
    e.stopPropagation();
    sp.chosen.clear();
    return renderSpace();
  }

  if (!at || !['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
  e.preventDefault();

  // by the grid as it lies (2026-11-24): ←→ the node before or after, ↑↓ the nearest in the row above or below, Home End the ends
  const nodes = [...$('#spgrid').querySelectorAll('.spt')];
  const i = nodes.indexOf(at);
  const box = n => n.getBoundingClientRect();
  const r = box(at);
  const cx = r.left + r.width / 2;

  let to;

  if (e.key === 'Home') to = nodes[0];
  else if (e.key === 'End') to = nodes.at(-1);
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    to = nodes[Math.max(0, Math.min(nodes.length - 1, i + (e.key === 'ArrowRight' ? 1 : -1)))];
  } else {
    const down = e.key === 'ArrowDown';
    const rows = nodes.map(n => [n, box(n)]).filter(([, b]) => (down ? b.top > r.top + 4 : b.top < r.top - 4));

    const row = down ? Math.min(...rows.map(([, b]) => b.top)) : Math.max(...rows.map(([, b]) => b.top));

    to =
      rows
        .filter(([, b]) => Math.abs(b.top - row) < 4)
        .sort(([, a], [, b]) => Math.abs(a.left + a.width / 2 - cx) - Math.abs(b.left + b.width / 2 - cx))[0]?.[0] ||
      at;
  }

  if (e.shiftKey && to) {
    sp.chosen.add(at.dataset.id);
    sp.chosen.add(to.dataset.id);
    renderSpace();
  } // ⇧: both chosen

  to?.focus();
  to?.scrollIntoView({ block: 'nearest' });
});
