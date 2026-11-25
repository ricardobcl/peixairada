// ---- the first run: where the repos live (2026-10-01) ------------------------------------------------------------
// A board whose setup never named one (`ask`, the server's word) asks,
// once, over everything: the folder and its GitHub org, as the server guesses them from the chats it holds
// (GET /api/config/suggest) — the likeliest already in the boxes, so ⏎ is mostly the whole answer. Skip is an answer
// too (no folder, never asked again); Esc only puts the question off to the next load. A folder under the home that
// is not there yet is offered to be made. In the app, Choose… is the system's folder panel (`chooseFolder`, which
// answers through peixFolder).
const welcome = { sugs: [], make: null };
/** The guesses' rows, the one the box names lit; a box changed by hand is no longer the folder offered to be made. */
function welcomeMark() {
  const dir = $('#wdir').value.trim();
  $('#wsugs')
    .querySelectorAll('.wsug')
    .forEach(b => b.classList.toggle('on', homePath(welcome.sugs[+b.dataset.i].dir) === dir));
  if (welcome.make && welcome.make !== dir) {
    welcome.make = null;
    $('#werr').textContent = '';
    $('#wok').textContent = 'Use this folder';
  }
}
/** Up while the server asks, down once it does not — after an answer here or in another window. */
function welcomeSync() {
  const dlg = $('#welcome');
  if (!state.config.ask) {
    if (dlg.open) dlg.close();
    return;
  }
  if (dlg.open) return;
  welcome.make = null;
  $('#werr').textContent = '';
  $('#wok').textContent = 'Use this folder';
  $('#wwhere').textContent = state.config.file ? `Saved to ${homePath(state.config.file)}` : '';
  $('#welcome .wlogo').innerHTML = FISH_LOGO();
  $('#wchoose').hidden = !inApp;
  dlg.showModal();
  repostPane();
  $('#wdir').focus();
  api('GET', '/api/config/suggest')
    .then(d => {
      welcome.sugs = d.roots || [];
      const top = welcome.sugs[0];
      if (top && !$('#wdir').value.trim()) {
        $('#wdir').value = homePath(top.dir);
        $('#worg').value = top.org || '';
      }
      $('#wsugs').innerHTML = welcome.sugs
        .map(
          (r, i) =>
            `<button class="wsug" data-i="${i}" title="${esc(r.dir)}">${ICON.folder}<span class="pn"><b>${esc(homePath(r.dir))}</b><small>${r.repos} repo${r.repos === 1 ? '' : 's'}${r.chats ? ` · ${r.chats} with chats` : ''}</small></span><span class="wo">${r.org ? `github.com/${esc(r.org)}` : ''}</span></button>`,
        )
        .join('');
      welcomeMark();
    })
    .catch(() => {});
}
async function welcomeAnswer(roots, create = false) {
  $('#werr').textContent = '';
  try {
    state.config = (await api('PUT', '/api/config', { roots, ...(create && { create: true }) })).config;
  } catch (e) {
    const dir = roots[0]?.dir;
    if (!create && /is not a folder here/.test(e.message)) {
      welcome.make = dir;
      $('#werr').textContent = `${dir} isn't there yet.`;
      $('#wok').textContent = 'Make it and use it';
    } else
      $('#werr').textContent =
        e.status === 404 ? 'The running server predates the setup — scripts/launchd.sh restart' : e.message;
    return;
  }
  configChanged(); // the board in the new setup; welcomeSync puts the dialog away
  if (!prefs.toured) {
    news.hold = true;
    setTimeout(tourStart, 200);
  } // and once, the tour (2026-10-14) — after the dialog's own fade; what's new waits for it
}
$('#wok').onclick = () => {
  const dir = $('#wdir').value.trim();
  if (!dir) {
    $('#werr').textContent = 'Which folder? Or Skip.';
    $('#wdir').focus();
    return;
  }
  welcomeAnswer([{ dir, org: $('#worg').value.trim() }], dir === welcome.make);
};
$('#wskip').onclick = () => welcomeAnswer([]);
$('#wdir').addEventListener('input', welcomeMark);
$('#wsugs').addEventListener('click', e => {
  const b = e.target.closest('.wsug');
  if (!b) return;
  const r = welcome.sugs[+b.dataset.i];
  $('#wdir').value = homePath(r.dir);
  $('#worg').value = r.org || '';
  welcomeMark();
  if (e.detail > 1) $('#wok').click();
  else $('#wok').focus(); // a double click is the answer
});
$('#welcome').addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.matches('input')) {
    e.preventDefault();
    $('#wok').click();
  }
});
$('#wchoose').onclick = () => post({ type: 'chooseFolder', dir: $('#wdir').value.trim() });
window.peixFolder = path => {
  if (!path) return;
  $('#wdir').value = homePath(path);
  welcomeMark();
  $('#wok').focus();
};
// The switch that is this browser's alone (2026-09-28): ⌥ in the terminal. The code's fold and how a date is
// written were beside it for a day.
const optMetaSay = () => {
  $('#optMetaSay').textContent =
    prefs.optMeta !== false ? '⌥B and ⌥F move by word, ⌥⌫ deletes one' : '⌥ types what your keyboard layout composes';
};
$('#optMeta').checked = prefs.optMeta !== false;
optMetaSay();
$('#autoTile').checked = !!prefs.autoTile;
$('#autoTile').addEventListener('change', e => {
  prefs.autoTile = e.target.checked;
  savePrefs();
}); // the next terminal: the tiles there are stay as they are
$('#optMeta').addEventListener('change', e => {
  prefs.optMeta = e.target.checked;
  savePrefs();
  optMetaSay();
  for (const tm of terms) if (tm.xt) tm.xt.options.macOptionIsMeta = prefs.optMeta;
});
// xterm's screen-reader mode (2026-10-12, off): the drawer's lines kept in a live region a reader follows
// …and it follows VoiceOver (2026-10-16): the app says whether VoiceOver runs (peixVoiceOver, at load and on each
// change) and the drawer reads its lines out while it does, the switch on and off with why; without it the switch keeps
// it on. A browser cannot know, so there the switch is the only way.
const readerOn = () => !!prefs.termReader || state.voiceOver;
function showReader() {
  const vo = state.voiceOver,
    sw = $('#termReader');
  sw.checked = readerOn();
  sw.disabled = vo;
  sw.closest('.srow').classList.toggle('off', vo);
  $('#termReaderSay').textContent = vo
    ? 'On while VoiceOver runs'
    : inApp
      ? 'The drawer’s lines read out; on by itself while VoiceOver runs'
      : 'The drawer’s lines read out as they come';
  for (const tm of terms) if (tm.xt) tm.xt.options.screenReaderMode = readerOn();
}
window.peixVoiceOver = on => {
  state.voiceOver = !!on;
  showReader();
};
$('#termReader').addEventListener('change', e => {
  prefs.termReader = e.target.checked;
  savePrefs();
  showReader();
});
queueMicrotask(showReader); // once the script has run: the drawers (terms) and inApp are declared further down
