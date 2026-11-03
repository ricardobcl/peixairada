// The small inks, measured in the page (2026-11-01, round XV): every theme — the board's own and each half of the
// picker's, a light one in its dark frame too (round XVII) — worn in turn on the root, each small-text colour read off the page where it is set (the chat, or the
// frame: the list and the status bar) and held against the grounds it sits on there, a chip's or the asking red's wash
// of itself included, and the project's tab on any colour (2026-11-03, round XXI), a probe of it on a row and in the toolbar. The page puts back what it wore. An expression for cdp.evaluate; it returns
// { looks, worst: [{ look, ink, on, ratio }] } — the lowest ratios first.
export const INK_CHECK = `(() => {
  const root = document.documentElement, was = { ...root.dataset };
  const cv = document.createElement('canvas'); cv.width = cv.height = 1; const cx = cv.getContext('2d', { willReadFrequently: true });
  const paint = (...cols) => { cx.clearRect(0, 0, 1, 1); for (const c of cols) { cx.fillStyle = '#f0f'; cx.fillStyle = c; cx.fillRect(0, 0, 1, 1); } return [...cx.getImageData(0, 0, 1, 1).data].slice(0, 3); };
  const tok = (el, n) => { const i = document.createElement('i'); i.style.color = 'var(--' + n + ')'; el.append(i); const v = getComputedStyle(i).color; i.remove(); return v; };
  const lin = v => (v /= 255) <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4, lum = c => .2126 * lin(c[0]) + .7152 * lin(c[1]) + .0722 * lin(c[2]);
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
  const mix = (a, b, t) => a.map((v, i) => v * t + b[i] * (1 - t));
  const STATES = ['pr-open', 'pr-merged', 'pr-closed', 'pr-draft', 'tk-todo', 'tk-doing', 'tk-done'], SIGNS = ['needs', 'watch', 'idle', 'you', 'working-ink'];
  const HL = ['hl-com', 'hl-key', 'hl-str', 'hl-num', 'hl-fn', 'hl-cls', 'hl-var', 'hl-meta'];
  const sheet = document.body, frame = document.querySelector('#sessions');
  const out = [], looks = [];
  // the project's tab: its ink and fill are read off a probe of each, its colour any
  const TABS = ['#000000', '#ffffff', '#808080', ...[20, 80, 140, 200, 260, 320].flatMap(h => [[.45, .2], [.62, .22], [.7, .2], [.9, .1]].map(([l, c]) => 'oklch(' + l + ' ' + c + ' ' + h + ')'))];
  const rowProbe = document.createElement('div'), barProbe = document.createElement('span');
  rowProbe.className = 'card'; rowProbe.innerHTML = '<div class="top hastab"><span class="repo">x</span></div>'; barProbe.className = 'repo';
  document.querySelector('#slist').append(rowProbe); document.querySelector('#shead h2').append(barProbe);
  const rowTab = rowProbe.querySelector('.repo');
  // [name, data-skin, data-theme, data-frame]: the board's own, its light in the dark frame, then each half of the
  // picker's, a light one in the dark frame too
  const all = [['own dark', null, 'dark', 'dark'], ['own light', null, 'light', 'light'], ['own light, dark frame', null, 'light', 'dark'],
    ...window.peix.skins().flatMap(([k, dark]) => [[k, k, dark ? 'dark' : 'light', null], ...dark ? [] : [[k + ', dark frame', k, 'light', 'dark']]])];
  for (const [name, skin, look, fr] of all) {
    if (skin) root.dataset.skin = skin; else delete root.dataset.skin;
    Object.assign(root.dataset, { layout: 'sidebar', theme: look, frame: fr || look });   // the sidebar: its grey is a ground
    looks.push(name);
    for (const [where, el] of [['chat', sheet], ['frame', frame]]) {
      const c = n => paint(tok(el, n)), bg = c('bg'), panel = c('panel'), side = c('side'), bar = c('bar');
      const flat = where === 'chat' ? { bg, panel } : { bg, panel, side, bar };
      const check = (ink, grounds, tint = 0) => { const col = c(ink);
        for (const [on, g] of Object.entries(grounds)) { const r = ratio(col, tint ? mix(col, g, tint) : g); out.push({ look: name, ink: where + ' ' + ink, on: on + (tint ? ' ' + Math.round(tint * 100) + '% wash' : ''), ratio: +r.toFixed(2) }); } };
      check('muted', where === 'chat' ? { ...flat, bubble: c('user-bg'), tool: c('tool-bg') } : flat);
      for (const k of SIGNS) check(k, flat);
      check('needs', { bg, panel, ...(where === 'frame' ? { side } : {}) }, .09);
      for (const k of STATES) { check(k, { bg, panel, ...(where === 'frame' ? { side } : {}) }); check(k, { bg, panel, ...(where === 'frame' ? { side } : {}) }, .12); }
      if (where === 'chat') {
        check('accent', { bg, panel });
        const il = tok(el, 'inline-bg'); check('code-ink', { 'inline on bg': paint(tok(el, 'bg'), il), 'inline on panel': paint(tok(el, 'panel'), il), 'inline on bubble': paint(tok(el, 'user-bg'), il) });
        for (const k of HL) check(k, { code: c('code-bg') });
      }
    }
    const side = paint(tok(frame, 'side')), panel = paint(tok(sheet, 'panel')), under = (...cols) => paint('rgb(' + side.join(' ') + ')', ...cols);
    const wash = [['rest', []], ['pointer', ['color-mix(in srgb, ' + tok(frame, 'ink') + ' 6%, transparent)']], ['asking', ['color-mix(in srgb, ' + tok(frame, 'needs') + ' 9%, transparent)']]];
    for (const col of TABS) {
      rowProbe.style.setProperty('--repo', col); barProbe.style.setProperty('--repo', col);
      const r = getComputedStyle(rowTab), b = getComputedStyle(barProbe), rowInk = paint(r.color), barInk = paint(b.color);
      for (const [on, cols] of wash) out.push({ look: name, ink: 'tab ' + col, on: 'row ' + on, ratio: +ratio(rowInk, under(...cols, r.backgroundColor)).toFixed(2) });
      out.push({ look: name, ink: 'tab ' + col, on: 'toolbar', ratio: +ratio(barInk, paint('rgb(' + panel.join(' ') + ')', b.backgroundColor)).toFixed(2) });
    }
  }
  rowProbe.remove(); barProbe.remove();
  for (const k of ['skin', 'theme', 'frame', 'layout']) if (was[k] === undefined) delete root.dataset[k]; else root.dataset[k] = was[k];
  out.sort((a, b) => a.ratio - b.ratio);
  return JSON.stringify({ looks, worst: out.slice(0, 12), checked: out.length });
})()`;
