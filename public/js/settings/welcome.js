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
    .forEach(button => button.classList.toggle('on', homePath(welcome.sugs[+button.dataset.i].dir) === dir));

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
    .then(result => {
      welcome.sugs = result.roots || [];
      const top = welcome.sugs[0];

      if (top && !$('#wdir').value.trim()) {
        $('#wdir').value = homePath(top.dir);
        $('#worg').value = top.org || '';
      }

      $('#wsugs').innerHTML = welcome.sugs
        .map(
          (suggestion, index) =>
            `<button class="wsug" data-i="${index}" title="${esc(suggestion.dir)}">${ICON.folder}<span class="pn"><b>${esc(homePath(suggestion.dir))}</b><small>${suggestion.repos} repo${suggestion.repos === 1 ? '' : 's'}${suggestion.chats ? ` · ${suggestion.chats} with chats` : ''}</small></span><span class="wo">${suggestion.org ? `github.com/${esc(suggestion.org)}` : ''}</span></button>`,
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
  } catch (error) {
    const dir = roots[0]?.dir;

    if (!create && /is not a folder here/.test(error.message)) {
      welcome.make = dir;
      $('#werr').textContent = `${dir} isn't there yet.`;
      $('#wok').textContent = 'Make it and use it';
    } else {
      $('#werr').textContent =
        error.status === 404 ? 'The running server predates the setup — scripts/launchd.sh restart' : error.message;
    }

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

$('#wsugs').addEventListener('click', event => {
  const button = event.target.closest('.wsug');

  if (!button) return;
  const suggestion = welcome.sugs[+button.dataset.i];

  $('#wdir').value = homePath(suggestion.dir);
  $('#worg').value = suggestion.org || '';
  welcomeMark();
  if (event.detail > 1) $('#wok').click();
  else $('#wok').focus(); // a double click is the answer
});

$('#welcome').addEventListener('keydown', event => {
  if (event.key === 'Enter' && event.target.matches('input')) {
    event.preventDefault();
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

$('#autoTile').addEventListener('change', event => {
  prefs.autoTile = event.target.checked;
  savePrefs();
  postTiles();
}); // the next terminal: the tiles there are stay as they are

$('#optMeta').addEventListener('change', event => {
  prefs.optMeta = event.target.checked;
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
  const vo = state.voiceOver;
  const sw = $('#termReader');

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

$('#termReader').addEventListener('change', event => {
  prefs.termReader = event.target.checked;
  savePrefs();
  showReader();
});

queueMicrotask(showReader); // once the script has run: the drawers (terms) and inApp are declared further down
