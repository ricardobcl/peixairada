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
        .filter(p => p.key !== ALL)
        .map(p => p.name),
    ),
  ].sort((a, b) => a.localeCompare(b));

/** A project's square in the setup: its colour and the ink that reads on it. */
function tileStyle(name, byName) {
  const p = byName.get(name);
  const color = (p && ownColor(p.cwds)) || projCfg(name).color;

  return color ? `background:${color};color:${inkOn(color)}` : '';
}

const setupByName = () =>
  new Map(
    projectList()
      .filter(p => p.key !== ALL)
      .map(p => [p.name, p]),
  );

function renderSetup(force = false) {
  const box = $('#setup');
  const c = state.config;
  const roots = c.roots || [];
  const projs = cfgProjects();
  const byName = setupByName();

  const names = [...new Set([...Object.keys(projs), ...setupUi.pending])];
  const all = setupNames();

  const text = 'type="text" spellcheck="false" autocomplete="off"';

  const org = (v, ph) =>
    `<label class="sorgw" title="The GitHub org ＋ clone asks for — empty, nothing is cloned into this folder">github.com/<input ${text} class="sorg" value="${esc(v)}" placeholder="${ph}"></label>`;

  const rootRow = (r, i) =>
    `<div class="srow root" data-i="${i}"><span class="sic">${ICON.folder}</span><input ${text} class="sdir" value="${esc(homePath(r.dir))}" title="${esc(r.dir)}">${org(r.org, 'org')}<button class="sdel" title="Forget this folder — nothing in it is touched" aria-label="Forget ${esc(homePath(r.dir))}">×</button></div>`;

  // a project's square is its short name on its colour, once (2026-10-16; a square, a short name's box and a colour's
  // circle side by side before): a click opens its colour under it (and the short name's box, until 2026-10-25)
  const projRow = n => {
    const p = projs[n] || {};
    const bp = byName.get(n);
    const open = setupUi.open === n;

    return (
      `<div class="srow proj${open ? ' open' : ''}" data-name="${esc(n)}"><button type="button" class="stile" style="${tileStyle(n, byName)}" aria-expanded="${open}" aria-label="The colour of ${esc(n)}" title="Its colour — click to change it">${esc(p.abbr || abbrRule(n))}</button>` +
      `<span class="pn" title="${esc(bp ? bp.cwds.map(homePath).join('\n') : n)}"><b>${projIcon(n)}${esc(n)}</b>${bp ? `<small>${esc(bp.cwds.map(homePath).join(' · '))}</small>` : ''}</span>` +
      `<button class="sdel" title="Forget the colour of ${esc(n)}" aria-label="Forget ${esc(n)}">×</button>` +
      `<div class="sedit"><label class="ssw${p.color ? '' : ' none'}" style="${p.color ? `--c:${p.color}` : ''}" title="${p.color ? `${p.color} — click to change, ⌥-click to take it off` : 'A colour for it — click to pick'}"><input type="color" value="${esc(p.color || '#808080')}"></label><span class="sedc">${p.color ? 'Colour' : 'No colour'}</span></div></div>`
    );
  };

  const quick = [...new Set([...(c.quick ? [c.quick] : []), ...all])];

  const group = (title, kw, rows, foot) =>
    `<section class="sgrp" data-kw="${kw}"><h6 class="sgh">${title}</h6><div class="slist">${rows}</div>${foot ? `<p class="sgf">${foot}</p>` : ''}</section>`;

  const html =
    (c.error
      ? `<p class="sgf serr">${esc(c.error)} — the board keeps what it had and writes nothing over it until the file reads.</p>`
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
      `<label class="srow quick"><kbd>⌥⌘O</kbd><span>starts a chat in</span><span class="ssel">${c.quick ? projIcon(c.quick) : ''}<select id="quickSel" title="The project ⌥⌘O starts a chat in — on its environments first, when its Taskfile launches Claude"><option value="">nothing — ⌥⌘N does it all</option>${quick.map(n => `<option${n === c.quick ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select></span></label>`,
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
        .filter(n => !names.includes(n))
        .map(n => `<option>${esc(n)}</option>`)
        .join('')}</select></div>`,
      'A colour for its cards, its chats’ header and their tiles; the chat header’s square sets it too.',
    );

  // the two keys the setup names, for the ? sheet: one line each, the rest under it (2026-10-12; a list in the
  // settings' Keys pane until 2026-10-16)
  keyNotes.quickKey = {
    html: c.quick ? `a new chat in ${esc(c.quick)}` : "a new chat in the setup's quick project — none yet",
    title: c.quick
      ? 'its environments first, when its Taskfile launches Claude, then their open chats'
      : 'Settings › Projects › Quick chat names it',
  };

  keyNotes.newKey = {
    title: `or a project${roots.length ? `, a folder in ${roots.map(r => homePath(r.dir)).join(' or ')}` : ''}${roots.some(r => r.org) ? ', or ＋ clone a repo' : ''} · then its open chats or ＋ a new one — in the folder, or (←→) in a new worktree on a branch of its own · @ or ＋’s chip: an agent to run it (claude --agent) · ✕ takes a row off the board`,
  };

  $('#pextra').placeholder = `${roots[0] ? homePath(roots[0].dir) : '~/code'}/some-repo`;
  $('#sfilePath').textContent = c.file ? homePath(c.file) : 'Kept by the server';
  drawSetup(box, html, force);
  drawSetup($('#jiraSet'), jiraSetup(c.jira, setupUi.jira), force);
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
function jiraSetup(j, info) {
  const text = 'type="text" spellcheck="false" autocomplete="off"';
  const sug = info?.suggest || {};

  const tok = info?.token;

  const from = {
    env: "JIRA_API_TOKEN in the server's environment",
    keychain: 'a token in your keychain',
    file: "a token in the board's file",
  }[tok];

  const line = !j
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
    `<div class="srow jsite"><span class="sic">${ICON.ticket}</span><input ${text} class="sjsite" value="${esc(j?.site || '')}" placeholder="${esc(sug.site || 'https://acme.atlassian.net')}" title="Your Jira Cloud site"><input ${text} class="sjmail" value="${esc(j?.email || '')}" placeholder="${esc(sug.email || 'you@acme.com')}" title="The email you sign in to Jira with"><span></span></div>` +
    `<div class="srow jtok"><span class="sic">${ICON.key}</span><input type="password" class="sjtok" autocomplete="off" spellcheck="false"${j ? '' : ' disabled'} placeholder="${tok ? `${esc(from)} — paste another to replace it` : 'API token — id.atlassian.com → Security → API tokens'}" title="Kept in your keychain, never in the setup file; the page never sees it again">` +
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
  const s = state.sessions.get(state.current);

  if (s) renderHead(s);
}

async function putConfig(part, anchor) {
  try {
    state.config = (await api('PUT', '/api/config', part)).config;
    configChanged();
    return true;
  } catch (e) {
    note(
      anchor,
      e.status === 404
        ? 'The running server predates the setup — scripts/launchd.sh restart'
        : `Not saved: ${e.message}`,
      true,
    );

    renderSetup(true); // the row as the server has it
    return false;
  }
}

const rootsInBox = () =>
  [...$('#setup').querySelectorAll('.srow.root')]
    .map(r => ({ dir: r.querySelector('.sdir').value.trim(), org: r.querySelector('.sorg').value.trim() }))
    .filter(r => r.dir);

function setProject(name, patch, anchor) {
  const all = { ...cfgProjects() };
  const next = { ...all[name], ...patch };

  for (const k of Object.keys(next)) if (!next[k]) delete next[k];
  if (Object.keys(next).length) all[name] = next;
  else delete all[name];
  return putConfig({ projects: all }, anchor);
}

for (const box of [$('#setup'), $('#jiraSet')]) {
  // the Projects pane and Jira's, one setup
  box.addEventListener('focusout', e => {
    if (box._stale && !box.contains(e.relatedTarget)) renderSetup();
  });

  box.addEventListener('click', e => {
    const f = e.target.closest('.sjforget');

    if (!f) return;

    api('DELETE', '/api/jira/token').then(
      d => {
        setupUi.jira = d;
        renderSetup(true);
      },
      err => note(f, `Not forgotten: ${err.message}`, true),
    );
  });

  box.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.matches('.sjtok, .sjsite, .sjmail')) {
      e.target.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });

  box.addEventListener('change', e => {
    const t = e.target;
    const row = t.closest('.srow');

    if (t.id === 'quickSel') return putConfig({ quick: t.value || null }, t);

    if (t.classList.contains('sjsite') || t.classList.contains('sjmail')) {
      // both, or neither: a site with no login is no setup
      const site = box.querySelector('.sjsite').value.trim();
      const email = box.querySelector('.sjmail').value.trim();

      if (!!site !== !!email) return;
      return putConfig({ jira: site ? { site, email } : null }, t);
    }

    if (t.classList.contains('sjtok')) {
      const token = t.value.trim();

      if (!token) return;
      t.value = '';
      t.blur();
      return api('PUT', '/api/jira/token', { token }).then(
        d => {
          setupUi.jira = d;
          renderSetup(true);
        },
        e => note(t, `Not saved: ${e.message}`, true),
      );
    }

    if (t.classList.contains('sadd')) {
      if (!t.value) return;
      setupUi.pending.add(t.value);
      const n = t.value;

      setupUi.open = n;
      renderSetup(true);
      box.querySelector(`.srow.proj[data-name="${CSS.escape(n)}"] .ssw input`)?.focus();
      return;
    }

    if (row?.classList.contains('root')) {
      if (row.classList.contains('add') && !row.querySelector('.sdir').value.trim()) return;
      return putConfig({ roots: rootsInBox() }, t);
    }

    if (row?.classList.contains('proj')) {
      const name = row.dataset.name;

      if (t.type === 'color') {
        clearTimeout(setupUi.colorTimer);

        if (setupUi.colors.get(name) !== t.value) {
          setupUi.colors.set(name, t.value);
          setProject(name, { color: t.value }, row);
        }
      }
    }
  });

  // A colour previews on the board as the panel moves and is written once it rests — the header's square's way; the
  // row's square follows it.
  box.addEventListener('input', e => {
    const t = e.target;

    if (t.type !== 'color') return;

    const row = t.closest('.srow.proj');
    const name = row.dataset.name;
    const hex = t.value;

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

  box.addEventListener('click', e => {
    const x = e.target.closest('.sdel');
    const sw = e.target.closest('.ssw');
    const row = e.target.closest('.srow');

    if (sw && e.altKey) {
      e.preventDefault();
      setupUi.colors.delete(row.dataset.name);
      return setProject(row.dataset.name, { color: '' }, sw);
    }

    if (!x) return;

    if (row.classList.contains('root')) {
      row.remove();
      return putConfig({ roots: rootsInBox() }, x);
    }

    const name = row.dataset.name;

    setupUi.pending.delete(name);
    if (cfgProjects()[name]) setProject(name, { abbr: '', color: '' }, x);
    else renderSetup(true);
  });

  box.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.matches('input[type=text]')) e.target.blur();
  });

  // a square clicked opens its colour under it, and closes another's
  box.addEventListener('click', e => {
    const tile = e.target.closest('.srow.proj .stile');

    if (!tile) return;

    const row = tile.closest('.srow.proj');
    const on = setupUi.open !== row.dataset.name;

    setupUi.open = on ? row.dataset.name : null;

    for (const r of box.querySelectorAll('.srow.proj')) {
      const o = r.dataset.name === setupUi.open;

      r.classList.toggle('open', o);
      r.querySelector('.stile').setAttribute('aria-expanded', String(o));
    }

    if (on) row.querySelector('.ssw input').focus();
  });
}

$('#sfileCopy').onclick = e => {
  const b = e.currentTarget;

  copyText(state.config.file || '').then(ok => note(b, ok ? 'Copied' : 'Could not copy it', !ok));
};
