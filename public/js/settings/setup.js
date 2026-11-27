// ---- the setup: the cog's second half (2026-09-28) ---------------------------------------------------------------
// Handed to colleagues, the board had to stop knowing one Mac. What had been written into this page and the server
// for one Mac is set here, under the switches: the folders the repos live in, each with the GitHub org ＋ clone asks
// (`roots`), the project ⌥⌘O starts a chat in (`quick`), and a colour per project (`projects`; a short name by
// hand). It is the server's (`config` in its state file, a `config` event), so the app and every browser agree — the
// switches above it are this browser's. A box is written on change, a colour as the panel rests; what the server
// refuses is said beside it and the row put back. The markup is drawn only when it changed, and never under a box
// that has the keyboard: that waits for the focus to leave the section.
const setupUi = { open: null, pending: new Set(), colors: new Map(), colorTimer: null, raf: 0, jira: null };

/** What the server says of Jira (2026-10-08): the site, where the token is, who you are there, what went wrong — asked
 *  as the settings open and after every change to it. */
async function loadJira() {
  try {
    setupUi.jira = await api('GET', '/api/jira');
  } catch {
    setupUi.jira = null;
  }

  renderSetup();
}

const cfgProjects = () => state.config.projects || {};

const setupNames = () =>
  [
    ...new Set(
      projectList()
        .filter(project => project.key !== ALL)
        .map(project => project.name),
    ),
  ].sort((left, right) => left.localeCompare(right));

/** A project's square in the setup: its colour and the ink that reads on it. */
function tileStyle(name, byName) {
  const project = byName.get(name);
  const color = (project && ownColor(project.cwds)) || projCfg(name).color;

  return color ? `background:${color};color:${inkOn(color)}` : '';
}

const setupByName = () =>
  new Map(
    projectList()
      .filter(project => project.key !== ALL)
      .map(project => [project.name, project]),
  );

function renderSetup(force = false) {
  const box = $('#setup');
  const config = state.config;
  const roots = config.roots || [];
  const projs = cfgProjects();
  const byName = setupByName();

  const names = [...new Set([...Object.keys(projs), ...setupUi.pending])];
  const all = setupNames();

  const text = 'type="text" spellcheck="false" autocomplete="off"';

  const org = (value, ph) =>
    `<label class="sorgw" title="The GitHub org ＋ clone asks for — empty, nothing is cloned into this folder">github.com/<input ${text} class="sorg" value="${esc(value)}" placeholder="${ph}"></label>`;

  const rootRow = (root, index) =>
    `<div class="srow root" data-i="${index}"><span class="sic">${ICON.folder}</span><input ${text} class="sdir" value="${esc(homePath(root.dir))}" title="${esc(root.dir)}">${org(root.org, 'org')}<button class="sdel" title="Forget this folder — nothing in it is touched" aria-label="Forget ${esc(homePath(root.dir))}">×</button></div>`;

  // a project's square is its short name on its colour, once (2026-10-16; a square, a short name's box and a colour's
  // circle side by side before): a click opens its colour under it (and the short name's box, until 2026-10-25)
  const projRow = name => {
    const setup = projs[name] || {};
    const bp = byName.get(name);
    const open = setupUi.open === name;

    return (
      `<div class="srow proj${open ? ' open' : ''}" data-name="${esc(name)}"><button type="button" class="stile" style="${tileStyle(name, byName)}" aria-expanded="${open}" aria-label="The colour of ${esc(name)}" title="Its colour — click to change it">${esc(setup.abbr || abbrRule(name))}</button>` +
      `<span class="pn" title="${esc(bp ? bp.cwds.map(homePath).join('\n') : name)}"><b>${projIcon(name)}${esc(name)}</b>${bp ? `<small>${esc(bp.cwds.map(homePath).join(' · '))}</small>` : ''}</span>` +
      `<button class="sdel" title="Forget the colour of ${esc(name)}" aria-label="Forget ${esc(name)}">×</button>` +
      `<div class="sedit"><label class="ssw${setup.color ? '' : ' none'}" style="${setup.color ? `--c:${setup.color}` : ''}" title="${setup.color ? `${setup.color} — click to change, ⌥-click to take it off` : 'A colour for it — click to pick'}"><input type="color" value="${esc(setup.color || '#808080')}"></label><span class="sedc">${setup.color ? 'Colour' : 'No colour'}</span></div></div>`
    );
  };

  const quick = [...new Set([...(config.quick ? [config.quick] : []), ...all])];

  const group = (title, kw, rows, foot) =>
    `<section class="sgrp" data-kw="${kw}"><h6 class="sgh">${title}</h6><div class="slist">${rows}</div>${foot ? `<p class="sgf">${foot}</p>` : ''}</section>`;

  const html =
    (config.error
      ? `<p class="sgf serr">${esc(config.error)} — the board keeps what it had and writes nothing over it until the file reads.</p>`
      : '') +
    group(
      'Repository folders',
      'roots repos repositories folder org github clone',
      `${roots
        .map(rootRow)
        .join(
          '',
        )}<div class="srow root add"><span class="sic">＋</span><input ${text} class="sdir" placeholder="Add a folder of repos — ~/code">${org('', 'org')}<span></span></div>`,
      '⌥⌘N lists every folder in these. With a GitHub org, ＋ clone fetches one you don’t have.',
    ) +
    group(
      'Quick chat',
      'quick chat new oracle',
      `<label class="srow quick"><kbd>⌥⌘O</kbd><span>starts a chat in</span><span class="ssel">${config.quick ? projIcon(config.quick) : ''}<select id="quickSel" title="The project ⌥⌘O starts a chat in — on its environments first, when its Taskfile launches Claude"><option value="">nothing — ⌥⌘N does it all</option>${quick.map(name => `<option${name === config.quick ? ' selected' : ''}>${esc(name)}</option>`).join('')}</select></span></label>`,
      'Its environments first, when its Taskfile launches claude.',
    ) +
    group(
      'Projects',
      'project colour color',
      `${names
        .map(projRow)
        .join(
          '',
        )}<div class="srow padd"><span class="sic">＋</span><select class="sadd" title="Give a project a colour"><option value="">Add a project…</option>${all
        .filter(name => !names.includes(name))
        .map(name => `<option>${esc(name)}</option>`)
        .join('')}</select></div>`,
      'A colour for its cards, its chats’ header and their tiles; the chat header’s square sets it too.',
    );

  // the two keys the setup names, for the ? sheet: one line each, the rest under it (2026-10-12; a list in the
  // settings' Keys pane until 2026-10-16)
  keyNotes.quickKey = {
    html: config.quick ? `a new chat in ${esc(config.quick)}` : "a new chat in the setup's quick project — none yet",
    title: config.quick
      ? 'its environments first, when its Taskfile launches Claude, then their open chats'
      : 'Settings › Projects › Quick chat names it',
  };

  keyNotes.newKey = {
    title: `or a project${roots.length ? `, a folder in ${roots.map(root => homePath(root.dir)).join(' or ')}` : ''}${roots.some(root => root.org) ? ', or ＋ clone a repo' : ''} · then its open chats or ＋ a new one — in the folder, or (←→) in a new worktree on a branch of its own · @ or ＋’s chip: an agent to run it (claude --agent) · ✕ takes a row off the board`,
  };

  $('#pextra').placeholder = `${roots[0] ? homePath(roots[0].dir) : '~/code'}/some-repo`;
  $('#sfilePath').textContent = config.file ? homePath(config.file) : 'Kept by the server';
  drawSetup(box, html, force);
  drawSetup($('#jiraSet'), jiraSetup(config.jira, setupUi.jira), force);
}

/** A setup pane drawn anew — unless a box in it has the keys: then once they leave it (the focusout below). */
function drawSetup(el, html, force) {
  if (html === el._drawn && !force) return;

  if (!force && el.contains(document.activeElement)) {
    el._stale = true;
    return;
  }

  el.innerHTML = el._drawn = html;
  el._stale = false;
  if ($('#settings').open && $('#sq').value) settingsFind();
}

/** The Setup's Jira section (2026-10-08): the site and your login (the setup file's), the token (the keychain's — the
 *  box is write-only, and says where one is kept), and a line on how it went. */
function jiraSetup(jira, info) {
  const text = 'type="text" spellcheck="false" autocomplete="off"';
  const sug = info?.suggest || {};

  const tok = info?.token;

  const from = {
    env: "JIRA_API_TOKEN in the server's environment",
    keychain: 'a token in your keychain',
    file: "a token in the board's file",
  }[tok];

  const line = !jira
    ? sug.site
      ? `jira-cli's ${esc(sug.site)} is offered above — your email, then a token.`
      : 'A site and your email, then an API token.'
    : info?.error
      ? `<span class="serr">${esc(info.error)}${!tok && /^no API token/.test(info.error) ? ' — paste one in the box above' : ''}</span>`
      : info?.me
        ? `Signed in as <b>${esc(info.me)}</b>${info.tickets ? ` · ${info.tickets} ticket${info.tickets === 1 ? '' : 's'} known` : ''}.`
        : 'Asking Jira…';

  return (
    `<section class="sgrp jira" data-kw="jira tickets atlassian site email token"><div class="slist">` +
    `<div class="srow jsite"><span class="sic">${ICON.ticket}</span><input ${text} class="sjsite" value="${esc(jira?.site || '')}" placeholder="${esc(sug.site || 'https://acme.atlassian.net')}" title="Your Jira Cloud site"><input ${text} class="sjmail" value="${esc(jira?.email || '')}" placeholder="${esc(sug.email || 'you@acme.com')}" title="The email you sign in to Jira with"><span></span></div>` +
    `<div class="srow jtok"><span class="sic">${ICON.key}</span><input type="password" class="sjtok" autocomplete="off" spellcheck="false"${jira ? '' : ' disabled'} placeholder="${tok ? `${esc(from)} — paste another to replace it` : 'API token — id.atlassian.com → Security → API tokens'}" title="Kept in your keychain, never in the setup file; the page never sees it again">` +
    `${tok === 'keychain' || tok === 'file' ? '<button class="sdel sjforget" title="Forget the token" aria-label="Forget the token">×</button>' : '<span></span>'}</div>` +
    `</div><p class="sgf sjst">${line}</p><p class="sgf">Tickets a chat names (ACME-12, a link to one, its branch) show their status on its card and header, as its PRs do.</p></section>`
  );
}

/** The setup changed — here or anywhere: everything it paints follows. */
function configChanged() {
  renderSetup();
  renderBoard();
  loadFolders();
  welcomeSync();
  renderLunchSet();
  if ($('#settings').open) loadJira();
  const session = state.sessions.get(state.current);

  if (session) renderHead(session);
}

async function putConfig(part, anchor) {
  try {
    state.config = (await api('PUT', '/api/config', part)).config;
    configChanged();
    return true;
  } catch (error) {
    note(
      anchor,
      error.status === 404
        ? 'The running server predates the setup — scripts/launchd.sh restart'
        : `Not saved: ${error.message}`,
      true,
    );

    renderSetup(true); // the row as the server has it
    return false;
  }
}

const rootsInBox = () =>
  [...$('#setup').querySelectorAll('.srow.root')]
    .map(row => ({ dir: row.querySelector('.sdir').value.trim(), org: row.querySelector('.sorg').value.trim() }))
    .filter(root => root.dir);

function setProject(name, patch, anchor) {
  const all = { ...cfgProjects() };
  const next = { ...all[name], ...patch };

  for (const key of Object.keys(next)) if (!next[key]) delete next[key];
  if (Object.keys(next).length) all[name] = next;
  else delete all[name];
  return putConfig({ projects: all }, anchor);
}

for (const box of [$('#setup'), $('#jiraSet')]) {
  // the Projects pane and Jira's, one setup
  box.addEventListener('focusout', event => {
    if (box._stale && !box.contains(event.relatedTarget)) renderSetup();
  });

  box.addEventListener('click', event => {
    const forget = event.target.closest('.sjforget');

    if (!forget) return;

    api('DELETE', '/api/jira/token').then(
      result => {
        setupUi.jira = result;
        renderSetup(true);
      },
      err => note(forget, `Not forgotten: ${err.message}`, true),
    );
  });

  box.addEventListener('keydown', event => {
    if (event.key === 'Enter' && event.target.matches('.sjtok, .sjsite, .sjmail')) {
      event.target.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });

  box.addEventListener('change', event => {
    const control = event.target;
    const row = control.closest('.srow');

    if (control.id === 'quickSel') return putConfig({ quick: control.value || null }, control);

    if (control.classList.contains('sjsite') || control.classList.contains('sjmail')) {
      // both, or neither: a site with no login is no setup
      const site = box.querySelector('.sjsite').value.trim();
      const email = box.querySelector('.sjmail').value.trim();

      if (!!site !== !!email) return;
      return putConfig({ jira: site ? { site, email } : null }, control);
    }

    if (control.classList.contains('sjtok')) {
      const token = control.value.trim();

      if (!token) return;
      control.value = '';
      control.blur();
      return api('PUT', '/api/jira/token', { token }).then(
        result => {
          setupUi.jira = result;
          renderSetup(true);
        },
        error => note(control, `Not saved: ${error.message}`, true),
      );
    }

    if (control.classList.contains('sadd')) {
      if (!control.value) return;
      setupUi.pending.add(control.value);
      const name = control.value;

      setupUi.open = name;
      renderSetup(true);
      box.querySelector(`.srow.proj[data-name="${CSS.escape(name)}"] .ssw input`)?.focus();
      return;
    }

    if (row?.classList.contains('root')) {
      if (row.classList.contains('add') && !row.querySelector('.sdir').value.trim()) return;
      return putConfig({ roots: rootsInBox() }, control);
    }

    if (row?.classList.contains('proj')) {
      const name = row.dataset.name;

      if (control.type === 'color') {
        clearTimeout(setupUi.colorTimer);

        if (setupUi.colors.get(name) !== control.value) {
          setupUi.colors.set(name, control.value);
          setProject(name, { color: control.value }, row);
        }
      }
    }
  });

  // A colour previews on the board as the panel moves and is written once it rests — the header's square's way; the
  // row's square follows it.
  box.addEventListener('input', event => {
    const control = event.target;

    if (control.type !== 'color') return;

    const row = control.closest('.srow.proj');
    const name = row.dataset.name;
    const hex = control.value;

    state.config.projects = { ...cfgProjects(), [name]: { ...cfgProjects()[name], color: hex } };
    row.querySelector('.ssw').style.setProperty('--c', hex);
    row.querySelector('.ssw').classList.remove('none');
    row.querySelector('.sedc').textContent = 'Colour';
    row.querySelector('.stile').setAttribute('style', tileStyle(name, setupByName()));

    if (!setupUi.raf) {
      setupUi.raf = requestAnimationFrame(() => {
        setupUi.raf = 0;
        renderBoard();
      });
    }

    clearTimeout(setupUi.colorTimer);

    setupUi.colorTimer = setTimeout(() => {
      if (setupUi.colors.get(name) !== hex) {
        setupUi.colors.set(name, hex);
        setProject(name, { color: hex }, row);
      }
    }, 350);
  });

  box.addEventListener('click', event => {
    const forget = event.target.closest('.sdel');
    const sw = event.target.closest('.ssw');
    const row = event.target.closest('.srow');

    if (sw && event.altKey) {
      event.preventDefault();
      setupUi.colors.delete(row.dataset.name);
      return setProject(row.dataset.name, { color: '' }, sw);
    }

    if (!forget) return;

    if (row.classList.contains('root')) {
      row.remove();
      return putConfig({ roots: rootsInBox() }, forget);
    }

    const name = row.dataset.name;

    setupUi.pending.delete(name);
    if (cfgProjects()[name]) setProject(name, { abbr: '', color: '' }, forget);
    else renderSetup(true);
  });

  box.addEventListener('keydown', event => {
    if (event.key === 'Enter' && event.target.matches('input[type=text]')) event.target.blur();
  });

  // a square clicked opens its colour under it, and closes another's
  box.addEventListener('click', event => {
    const tile = event.target.closest('.srow.proj .stile');

    if (!tile) return;

    const row = tile.closest('.srow.proj');
    const on = setupUi.open !== row.dataset.name;

    setupUi.open = on ? row.dataset.name : null;

    for (const other of box.querySelectorAll('.srow.proj')) {
      const isOpen = other.dataset.name === setupUi.open;

      other.classList.toggle('open', isOpen);
      other.querySelector('.stile').setAttribute('aria-expanded', String(isOpen));
    }

    if (on) row.querySelector('.ssw input').focus();
  });
}

$('#sfileCopy').onclick = event => {
  const button = event.currentTarget;

  copyText(state.config.file || '').then(ok => note(button, ok ? 'Copied' : 'Could not copy it', !ok));
};
