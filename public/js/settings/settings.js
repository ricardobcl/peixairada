// The settings: a modal dialog (2026-09-28), from the chat header's ··· or ⌘, — the dialog's own Esc, its backdrop
// clicked, or × close it; closing drops a setup row half typed. The pane goes down while it is up (postPane), and
// comes back on `close`, as under any dialog. A sidebar of panes and a search box since 2026-10-16 (the settings
// study's B): the box has the keys as it opens, the pane in front is the one last shown (prefs.settingsPane), and the
// keys go back to whatever had them once it closes.
const sset = { tab: prefs.settingsPane || 'general', opener: null };

const settingsOpen = (on = true) => {
  const dlg = $('#settings');

  if (!on) {
    if (dlg.open) dlg.close();
    return;
  }

  if (dlg.open) return;
  if ($('#hmenu').open) $('#hmenu').close();
  if (inApp) post({ type: 'focus' }); // from the pane's keys, the board needs the keyboard back
  sset.opener = document.activeElement !== document.body ? document.activeElement : null;
  settingsTab(sset.tab); // the pane last shown, its tab lit, no search
  dlg.showModal();
  $('#sq').focus();
  repostPane();
  loadJira();
  loadEditors();
  cardLabShow(!$('#spList').hidden);
};

const settingsToggle = () => settingsOpen(!$('#settings').open);

$('#settings').addEventListener('close', () => {
  cardLabShow(false);

  if (setupUi.pending.size) {
    setupUi.pending.clear();
    renderSetup();
  }

  setupUi.open = null;

  for (const row of document.querySelectorAll('#setup .srow.proj.open')) {
    row.classList.remove('open');
    row.querySelector('.stile').setAttribute('aria-expanded', 'false');
  }

  window.CSS?.highlights?.delete('sfind');
  keySure(false);

  if (chatUi.setSure) {
    chatUi.setSure = false;
    renderChatSet(true);
  }

  const opener = sset.opener;

  sset.opener = null;

  if (
    opener?.isConnected &&
    !document.querySelector('dialog[open]') &&
    (document.activeElement === document.body || !document.activeElement)
  ) {
    opener.focus({ preventScroll: true });
  }

  repostPane();
});

$('#settings').addEventListener('click', event => {
  if (event.target === event.currentTarget) settingsOpen(false);
}); // the backdrop

$('#settingsClose').onclick = () => settingsOpen(false);

/** A pane in front: its tab lit, the search let go. */
function settingsTab(tab) {
  const dlg = $('#settings');
  const chosen = dlg.querySelector(`.stabs [data-tab="${tab}"]`) || dlg.querySelector('.stabs [data-tab]');

  sset.tab = chosen.dataset.tab;
  $('#sq').value = '';

  if (prefs.settingsPane !== sset.tab) {
    prefs.settingsPane = sset.tab;
    savePrefs();
  }

  dlg.querySelectorAll('.stabs [data-tab]').forEach(button => {
    button.classList.toggle('on', button === chosen);
    button.setAttribute('aria-selected', String(button === chosen));
    button.tabIndex = button === chosen ? 0 : -1;
  });

  settingsFind();
  $('#sbody').scrollTop = 0;
  if (sset.tab === 'chat') loadChatSet();
  if (sset.tab === 'lunch') loadLunchSet();
}

$('#settings .stabs').addEventListener('click', event => {
  const button = event.target.closest('[data-tab]');

  if (button) settingsTab(button.dataset.tab);
});

/** Settings open on a row (2026-10-16): its pane in front, the row scrolled to and lit once — the status bar's update
 *  word, its right-click's *Status bar settings…*. */
function settingsAt(tab, sel) {
  settingsOpen(true);
  settingsTab(tab);
  const row = $(sel);

  if (!row) return;
  row.scrollIntoView({ block: 'center' });
  row.classList.remove('sflash');
  void row.offsetWidth;
  row.classList.add('sflash'); // once more from the start, if lit already
  row.addEventListener('animationend', () => row.classList.remove('sflash'), { once: true });
}

$('#sbody').addEventListener('click', event => {
  const paneHead = event.target.closest('.sph');

  if (paneHead && $('#settings').classList.contains('finding')) settingsTab(paneHead.closest('.spane').dataset.tab);
});

// ↑ ↓ (and ← →) between the panes, as a tab list is walked (2026-10-12; down the sidebar since 2026-10-16)
$('#settings .stabs').addEventListener('keydown', event => {
  const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[event.key];

  if (!step) return;
  event.preventDefault();

  const bs = [...$('#settings .stabs').querySelectorAll('[data-tab]')];
  const index = bs.indexOf(document.activeElement);
  const next = bs[(index + step + bs.length) % bs.length];

  next.click();
  next.focus();
});

// Search (2026-10-16): a row shows while its words — its name, its line, its keywords, a box's value, its group's and
// its pane's names — hold every word typed; each pane with any shows them under its name, the sidebar counts them, and
// the words are marked where the CSS highlight API is. Nothing is drawn anew: rows are only hidden (.nomatch), so a
// control keeps its node and its listeners. A row the board itself hides (the app's alone, Zed's line) stays hidden.
function settingsFind() {
  const dlg = $('#settings');
  const raw = $('#sq').value.trim();
  const words = raw.toLowerCase().split(/\s+/).filter(Boolean);

  dlg.classList.toggle('finding', !!words.length);
  let total = 0;

  for (const pane of dlg.querySelectorAll('.spane')) {
    const tab = dlg.querySelector(`.stabs [data-tab="${pane.dataset.tab}"]`);
    let matched = 0;

    for (const group of pane.querySelectorAll('.sgrp')) {
      const head = `${tab.textContent} ${group.querySelector('.sgh')?.textContent || ''} ${group.dataset.kw || ''}`;
      let gn = 0;

      for (const row of group.querySelectorAll('.srow')) {
        const text =
          `${head} ${row.textContent} ${row.dataset.kw || ''} ${[...row.querySelectorAll('input[type=text], select')].map(field => field.value).join(' ')}`.toLowerCase();

        const hit = words.every(word => text.includes(word));

        row.classList.toggle('nomatch', !hit);
        if (hit && !row.hidden && !group.hidden) gn++;
      }

      group.classList.toggle('nomatch', !gn && !!words.length);
      matched += gn;
    }

    pane.hidden = words.length ? !matched : pane.dataset.tab !== sset.tab;
    tab.querySelector('.sn').textContent = words.length && matched ? matched : '';
    tab.classList.toggle('dim', !!words.length && !matched);
    total += matched;
  }

  $('#snone').hidden = !words.length || !!total;
  $('#snone').textContent = `No setting matches “${raw}”.`;
  cardLabShow(dlg.open && !$('#spList').hidden);

  $('#spTitle').textContent = words.length
    ? `Results for “${raw}”`
    : dlg.querySelector(`.stabs [data-tab="${sset.tab}"] span`).textContent;

  if (!window.CSS?.highlights) return;
  const ranges = [];

  if (words.length) {
    for (const el of dlg.querySelectorAll(
      '.spane:not([hidden]) :is(.srow:not(.nomatch) :is(.sl, .pn), .sgrp:not(.nomatch) .sgh)',
    )) {
      const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);

      for (let node; (node = tw.nextNode());) {
        const low = node.nodeValue.toLowerCase();

        for (const word of words) {
          for (let index = low.indexOf(word); index >= 0; index = low.indexOf(word, index + word.length)) {
            const range = new Range();

            range.setStart(node, index);
            range.setEnd(node, index + word.length);
            ranges.push(range);
          }
        }
      }
    }
  }

  CSS.highlights.set('sfind', new Highlight(...ranges));
}

$('#sq').addEventListener('input', () => {
  settingsFind();
  $('#sbody').scrollTop = 0;
});

// the sidebar's foot: the key sheet and the tour, the settings closed first
$('#keysBtn').onclick = () => {
  settingsOpen(false);
  keysOpen();
};

// no chat open: the header's ··· is the settings alone (delegated — leaveChat writes the header anew; its icon is
// drawn where ICON is defined, before leaveChat keeps the header)
$('#shead').addEventListener('click', event => {
  if (event.target.closest('#noChatMore')) settingsOpen(true);
});

// System notifications, the popover's one switch (2026-09-23). It is the server's setting, not a pref: the app posts
// its banners from the alerts it hears, a browser tab from its own, and all of them follow the `quiet` flag the
// server puts on each alert. A browser that has never been asked is asked on the way to on — the app has its own
// permission, granted to the app.
const showNotify = () => {
  $('#notifyOn').checked = state.notifications;
  if (state.snapshots) renderBar();
};

function setNotify(on) {
  state.notifications = on;
  showNotify();

  api('PUT', '/api/notifications', { on }).catch(error => {
    state.notifications = !on;
    showNotify();
    note($('#notifyOn'), `Could not save the switch: ${error.message}`, true);
  }); // refused: it shows what the server has

  if (on && !inApp && window.Notification?.permission === 'default') Notification.requestPermission();
}

$('#notifyOn').addEventListener('change', event => setNotify(event.target.checked));
