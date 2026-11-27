// The board's own code kept up to date (2026-10-12): the server's switch and its word on the checkout (checkUpdate in
// server/update.mjs), and the page reloading itself once an update has changed it — at once when the update was asked for
// here, else once the page is left be: no dialog up, no box being typed in, no page of the pane in front, nothing
// pressed for RELOAD_IDLE_MS (hidden, none of that matters). Never before the server is back from its own restart: a
// page loaded from one about to go is half a page.
const LOADED_AT = Date.now();
const RELOAD_IDLE_MS = 15_000;

let inputAt = Date.now();
let updAsked = 0;

const reload = { want: null, since: 0, t: 0, why: null };

for (const t of ['keydown', 'pointerdown', 'wheel']) {
  addEventListener(
    t,
    () => {
      inputAt = Date.now();
    },
    { capture: true, passive: true },
  );
}

const shortSha = h => (h ? h.slice(0, 7) : '?');
const UPD_PARTS = { deps: 'the packages', server: 'the server', page: 'the page', app: 'the app' };

const UPD_STEPS = {
  pull: 'pulling',
  deps: 'installing the packages',
  page: 'trying the new page',
  server: 'trying the new server',
  restart: 'restarting the server',
  build: 'rebuilding the app',
};

const many = (k, w) => `${k} ${w}${k === 1 ? '' : 's'}`;

// What a board follows (2026-11-27, Settings › Updates › Follow): releases — the newest one past the release it is on,
// said by its name and its notes (CHANGELOG.md's, `u.notes`) — or every commit, said as commits.
/** A release as people say it: 0.2 for 0.2.0 (lib/changelog.mjs' relName). */
const relName = v => {
  const m = /^v?(\d+)\.(\d+)(?:\.(\d+))?$/.exec(String(v || ''));

  return m ? (Number(m[3]) ? `${m[1]}.${m[2]}.${m[3]}` : `${m[1]}.${m[2]}`) : String(v || '');
};

const onReleases = u => u?.channel !== 'main';
/** `0.2 is out` while one is to be taken on releases, else null. */
const relOut = u => (onReleases(u) && u?.release && u.behind > 0 ? `${relName(u.release)} is out` : null);

/** The notes of what Update now would bring, newest release first, as a reply's markdown is drawn. */
const notesHtml = notes =>
  (notes || [])
    .map(
      n =>
        `<div class="unote"><div class="unh">${esc(relName(n.version))}${n.title ? ` <small>${esc(n.title)}</small>` : ''}</div><div class="md">${md(n.md).html}</div></div>`,
    )
    .join('');

/** The update's run as words: the step it is at and how far that is (`p`, 0–1), or null while nothing runs. A restart
 *  or a page waiting on one is said for a minute at most — a restart that never came is not for ever. */
function updRun(u) {
  if (!u) return null;

  const n = u.steps?.length || 0;
  const at = k => (n ? (u.steps.indexOf(k) + 0.5) / n : null);

  if (u.busy === 'updating') {
    return {
      say: UPD_STEPS[u.steps?.[u.step]] || 'updating',
      p: n && u.step >= 0 ? (u.step + 0.5) / n : null,
      of: n && u.step >= 0 ? `${u.step + 1} of ${n}` : '',
    };
  }

  const fresh = [u.last?.at, u.restartAt].some(t => t && Date.now() - Date.parse(t) < 60_000); // restartAt: a restart for the code on disk (2026-11-25)

  if ((u.restarting || reload.why === 'server') && fresh) return { say: UPD_STEPS.restart, p: at('restart') };
  if (u.building) return { say: UPD_STEPS.build, p: null };
  return null;
}

// The installed app against the checkout (2026-10-14; readApp in server/update.mjs): behind when built from another mac/ than
// HEAD's — commits made here as much as pulled ones —, and why it is not being rebuilt (`appWhy`: appWhyNot's word).
const appFailed = u => !!(u?.app?.behind && u.build?.done && !u.build.ok && u.build.source === u.app.source);

function appSay(u) {
  const a = u.app;

  if (!a?.behind || u.building) return '';
  const fail = appFailed(u) ? ` <span class="uerr">the app was not rebuilt: ${esc(u.build.why || '')}</span> —` : '';

  return ` ·${fail || ' the app is behind <code>mac/</code> here —'} ${
    {
      off: '<b>Update now</b> rebuilds it (it quits and opens again)',
      tried: '<b>Update now</b> tries again',
      busy: `rebuilt once nothing has been done on the board for ${Math.round(u.quiet / 60_000)} min`,
      changes: `not rebuilt over ${many(a.changes, 'change')} to it here`,
      pull: 'rebuilt with the commits',
    }[u.appWhy] || '<code>mac/build.sh install</code> rebuilds it'
  }`;
}

// What *update now* would take: new commits it can fast-forward to, the switch or the rest aside — over files changed
// here too, unless the commits change one of them (2026-10-15, `clash`); the app behind mac/, rebuilt alone. The
// settings' button and the status bar's word (2026-10-14) both go by them.
const canPull = u =>
  u.behind > 0 &&
  (!u.ahead || u.rewritten) &&
  (['off', 'busy', 'held'].includes(u.why) || (u.why === 'changes' && u.clash?.length === 0));

/** Files by name, three at most (2026-10-15); `n` how many there are in all. */
const filesSay = (names = [], n = names.length) =>
  names.length
    ? names
        .slice(0, 3)
        .map(f => `<code>${esc(f)}</code>`)
        .join(', ') + (n > 3 ? ` and ${n - 3} more` : '')
    : many(n, 'file');

/** A command to run in the checkout, to copy out of the settings' line: `cd` there first, a word quoted only when it must be. */
function inCheckout(u, ...words) {
  const q = w => (/^[\w@%+=:,./-]+$/.test(w) ? w : `'${w.replace(/'/g, `'\\''`)}'`);
  const dir = u.dir || '.';

  return esc(`cd ${dir.startsWith('~/') ? `~/${q(dir.slice(2))}` : q(dir)} && ${words.map(q).join(' ')}`);
}

const canBuild = u => !u.busy && ['off', 'tried', 'busy'].includes(u.appWhy);
const canRestart = u => !u.busy && !!u.restart && !!u.pending?.includes('server'); // the agent, older than its checkout (2026-11-25)

/** Settings' row for the update (2026-10-16, a status row): a few words for where it stands (`word`), one line on it
 *  (`say`), and the rest — the commands that clear the way, why a commit was held, the last update — under Details
 *  (`more`); and whether its button updates (rather than looks). */
function updateSay(u) {
  if (!u || u.checkout === null) return { word: 'Not looked yet', say: 'not looked yet' };

  if (u.checkout === false) {
    return {
      word: 'Not a git checkout',
      say: 'this board does not run from a git checkout — <code>mac/build.sh install</code> brings the app up to date',
      none: true,
    };
  }

  // a rewritten history (2026-11-06): its commits are this checkout's own, made again — the news is what it adds
  const up = esc(u.upstream || 'the remote');

  const fresh = u.rewritten
    ? `${up}'s history rewritten, ${many(u.fresh || 0, 'new commit')} besides`
    : relOut(u)
      ? `${esc(relName(u.release))}, ${many(u.behind, 'commit')} on ${up}`
      : `${many(u.behind, 'new commit')} on ${up}`;

  const run = updRun(u);
  const more = [];
  const them = n => (n === 1 ? 'it' : 'them');

  if (u.rewritten && u.behind > 0) {
    more.push(
      `every commit here is one it names as rewritten (<code>.github/rewritten</code>), so none of them is lost: <b>Update now</b> moves this checkout onto it, your changes kept`,
    );
  }

  let say;

  if (u.busy === 'checking') say = `looking at ${up}…`;
  else if (u.busy === 'updating') {
    say = `updating to <code>${shortSha(u.up)}</code> — ${run.say}${run.of ? ` (${run.of})` : ''}…`;
  } else if (u.error) say = `<span class="uerr">${esc(u.error)}</span>`;
  else if (u.why === 'diverged') {
    say = `this checkout and ${up} have each moved on, ${u.ahead} here and ${u.behind} there — not pulled`;

    more.push(
      `<code>${inCheckout(u, 'git', 'pull', '--rebase')}</code> puts ${u.ahead === 1 ? 'the one' : 'those'} here on top, then <b>Check now</b>`,
    );
  } else if (u.why === 'changes' && u.clash?.length) {
    say = `${fresh}, not pulled: ${filesSay(u.clash)} changed here, and the new commits change ${them(u.clash.length)} too`;

    more.push(
      `commit or discard ${them(u.clash.length)} (<code>${inCheckout(u, 'git', 'checkout', 'HEAD', '--', ...u.clash)}</code> discards), then <b>Check now</b>`,
    );
  } else if (u.why === 'held') {
    say = `<code>${shortSha(u.held?.to)}</code> was not kept — the next commit is tried`;
    more.push(`why: ${esc(u.held?.why || 'it did not start')}`);
  }
  // a tip no trusted key signed is never taken, the button's way neither (2026-11-06): said, with the keys' file
  else if (u.why === 'unsigned') {
    say = `${fresh}, not taken: <code>${shortSha(u.up)}</code> ${esc(u.sign?.why || 'is not signed')}`;

    more.push(
      `an update is taken only when its newest commit is signed by a key in <code>.github/allowed_signers</code>, as this checkout has it — <code>${inCheckout(u, 'git', 'log', '--show-signature', '-1', u.upstream || '@{u}')}</code> shows it`,
    );
  } else {
    say =
      {
        detached: 'the checkout is on no branch — nothing to follow',
        'no-upstream': `<b>${esc(u.branch)}</b> follows no remote branch — nothing to pull`,
        current: u.ahead
          ? `<code>${shortSha(u.head)}</code> is ${many(u.ahead, 'commit')} ahead of ${up} — nothing to pull`
          : onReleases(u)
            ? `${u.running ? `on ${esc(relName(u.running))}, the newest release` : 'no release yet'}${u.past ? ` · ${many(u.past, 'commit')} on ${up} since, which <b>Every commit</b> takes` : ''}`
            : `up to date · <code>${shortSha(u.head)}</code>`,
        changes: `${fresh} — <b>Update now</b> takes them and leaves ${filesSay(u.changed, u.dirty)} changed here as ${u.dirty === 1 ? 'it is' : 'they are'}${u.on ? '; by itself it never pulls over a change' : ''}`,
        off: `${fresh} — <b>Update now</b> ${u.rewritten ? 'follows it' : 'takes them'}`,
        busy: `${fresh} — pulled once nothing has been done on the board for ${Math.round(u.quiet / 60_000)} min`,
      }[u.why] || `<code>${shortSha(u.head)}</code>${u.checkedAt ? '' : ' · not looked yet'}`;
  }

  if (run && u.busy !== 'updating') say += ` · ${run.say}…`;
  else if (!u.busy) say += appSay(u);

  // the server older than the checkout (2026-11-25): a pull by hand, or an update this server could not restart for
  if (u.pending?.includes('server')) {
    say += u.restart
      ? ' · the server running is older than the checkout — <b>Restart now</b> starts it again'
      : ' · restart the server to wear it';

    more.push(`<code>${inCheckout(u, 'scripts/launchd.sh', 'restart')}</code> restarts it; the chats in drawers stay`);
  }

  if (u.checkedAt && !u.busy) say += ` · looked ${rel(u.checkedAt)} ago`;

  if (!u.every) {
    say += ' · it looks only when asked';
    more.push('this server is not the login agent, so it looks only when asked');
  }

  if (u.behind > 0 && u.commits?.length) {
    more.push(
      `${relOut(u) ? `the commits ${esc(relName(u.release))} brings` : u.behind === 1 ? 'the new commit' : 'the new commits'}${u.behind > 1 && u.behind > u.commits.length ? `, the newest ${u.commits.length}` : ''}${u.sign?.ok && u.sign.by ? `, the newest signed by ${esc(u.sign.by)}` : ''}: ${u.commits.map(c => `<code>${esc(c.h)}</code> ${esc(c.s)} — ${esc(c.a)}`).join('<br>')}`,
    );
  } // what Update now takes, named first (2026-11-06)

  if (u.last) {
    more.push(
      `last update ${rel(u.last.at)} ago: ${u.last.release ? `to ${esc(relName(u.last.release))}, ` : ''}${many(u.last.count, 'commit')}${
        u.last.parts.length
          ? `, touching ${u.last.parts
              .map(k => UPD_PARTS[k])
              .join(', ')
              .replace(/, ([^,]*)$/, ' and $1')}`
          : ''
      }`,
    );
  }

  return {
    word: updWord(u),
    say,
    notes: u.behind > 0 && !u.busy ? notesHtml(u.notes) : '',
    more: more.join('<br>'),
    apply: canPull(u) || canBuild(u) || canRestart(u),
    restart: !canPull(u) && !canBuild(u) && canRestart(u),
  };
}

/** Where the update stands, in a few words: the status row's name. */
const updWord = u =>
  u.busy === 'checking'
    ? 'Looking…'
    : u.busy === 'updating'
      ? 'Updating…'
      : u.error
        ? 'Could not look'
        : u.failed
          ? 'Update failed'
          : u.why === 'held'
            ? 'Held back'
            : u.why === 'diverged'
              ? 'Diverged'
              : u.why === 'unsigned'
                ? 'Not signed'
                : u.why === 'changes' && u.clash?.length
                  ? 'Waiting on your changes'
                  : u.behind > 0
                    ? u.rewritten
                      ? 'History rewritten'
                      : relOut(u) || many(u.behind, 'new commit')
                    : u.why === 'detached'
                      ? 'On no branch'
                      : u.why === 'no-upstream'
                        ? 'No remote branch'
                        : u.pending?.includes('server')
                          ? 'The server is behind'
                          : u.app?.behind
                            ? 'The app is behind'
                            : u.ahead
                              ? 'Ahead of the remote'
                              : 'Up to date';

/** The status bar's word on the update (2026-10-12): what it is doing, step by step; a page that waits to be reloaded
 *  (a click reloads it); an update that failed or was held back; new commits not taken, and why; for a minute, what
 *  came. Nothing while it is up to date. A click opens Settings › Updates — but on news *update now* would take, where
 *  it is *update now* (2026-10-14: `data-take`, `updNow`), and the words say so. */
function updSeg() {
  const u = state.update;

  if (!u?.checkout && !reload.want) return ''; // a page wanted after a restart is said off a checkout too (pageFollows)

  const seg = (cls, icon, words, tip, p = null, take = '') =>
    `<button class="seg upg ${cls}"${take ? ' data-take="1"' : ''} title="${esc(tip)} — click ${cls === 'page' ? 'to reload it now' : take || 'for Settings › Updates'}">${icon}<span>${words}</span>${p == null ? '' : `<i style="--p:${p.toFixed(2)}"></i>`}</button>`;

  const run = updRun(u);
  const w = updateSay(u);

  const tip = unesc(
    [w.say, w.more]
      .filter(Boolean)
      .join(' · ')
      .replace(/<br>/g, ' · ')
      .replace(/<[^>]+>/g, ''),
  ); // text again, which seg escapes once

  if (run) return seg('run', ICON.reload, `${esc(run.say)}…`, tip, run.p);

  if (reload.want) {
    return seg(
      'page',
      ICON.reload,
      'updated · reload the page',
      `The board's page was updated — it reloads by itself once you leave it be (${{ dialog: 'a dialog is up', typing: 'a box has the keyboard', pane: 'a page of the pane is in front', input: 'you are at it' }[reload.why] || 'any moment'})`,
    );
  }

  if (u.failed || u.why === 'held') {
    return seg('err', ICON.reload, u.why === 'held' ? 'update held back' : 'update failed', tip);
  }

  if (appFailed(u)) return seg('err', ICON.reload, 'the app was not rebuilt', tip);

  const why = {
    off: '',
    changes: canPull(u) ? '' : ' · changes here',
    diverged: ' · diverged',
    unsigned: ' · not signed',
    busy: ' · once you rest',
  }[u.why]; // off, the default: new commits are the news, not the switch (2026-10-13); changes here, unless a click pulls over them (2026-10-15)

  if (u.behind > 0 && why != null) {
    return seg(
      'new',
      ICON.download,
      `${u.rewritten ? 'history rewritten' : relOut(u) || many(u.behind, 'new commit')}${why || (canPull(u) ? ' · update' : '')}`,
      tip,
      null,
      canPull(u) ? 'to update now' : '',
    );
  }

  const appWhy = { off: '', tried: '', manual: '', changes: ' · changes here', busy: ' · once you rest' }[u.appWhy]; // nothing to pull, and the app older than mac/ here (2026-10-14)

  if (u.app?.behind && appWhy != null) {
    return seg(
      'new',
      ICON.download,
      `the app is behind${appWhy || (canBuild(u) ? ' · rebuild' : '')}`,
      tip,
      null,
      canBuild(u) ? 'to rebuild it now (it quits and opens again)' : '',
    );
  }

  if (u.pending?.includes('server')) {
    return seg(
      'new',
      ICON.reload,
      `the server is behind${canRestart(u) ? ' · restart' : ''}`,
      tip,
      null,
      canRestart(u) ? 'to restart it now (the chats in drawers stay)' : '',
    );
  } // 2026-11-25

  if (u.last && Date.now() - Date.parse(u.last.at) < 60_000) {
    return seg(
      'done',
      ICON.reload,
      u.last.release ? `updated to ${esc(relName(u.last.release))}` : `updated · ${many(u.last.count, 'commit')}`,
      tip,
    );
  }

  return '';
}

const updatesOpen = () => settingsAt('system', '#updRow');

function showUpdate() {
  const u = state.update;
  const w = updateSay(u);
  const b = $('#updBtn');

  $('#autoUpdate').checked = u?.on === true;
  $('#autoUpdate').disabled = !!w.none;

  $('#autoUpdateSay').textContent = w.none
    ? 'Only for a board run from a git checkout'
    : onReleases(u)
      ? u?.on
        ? 'Takes a new release after two idle minutes, never over your changes'
        : 'The status bar says when a release comes'
      : u?.on
        ? 'Pulls new commits after two idle minutes, never over your changes'
        : 'The status bar says when new commits come';

  for (const b of document.querySelectorAll('#updFollow [data-ch]')) {
    b.setAttribute('aria-checked', String(b.dataset.ch === (onReleases(u) ? 'releases' : 'main')));
    b.disabled = !!(w.none || u?.busy);
  }

  $('#updFollowSay').textContent = onReleases(u)
    ? 'The newest release, with notes on what it brings'
    : 'Every commit on the main branch, the day it lands';

  $('#updWord').textContent = w.word;
  setHtml($('#updSay'), w.say);
  $('#updNotes').hidden = !w.notes;
  setHtml($('#updNotes'), w.notes || '');
  $('#updMore').hidden = !w.more;
  setHtml($('#updMore div'), w.more || '');
  b.textContent = w.restart ? 'Restart now' : w.apply ? 'Update now' : 'Check now';
  b.dataset.apply = w.apply ? '1' : '';
  b.disabled = !!(u?.busy || w.none);
}

/** The server's word on the update — the snapshot's, an `update` event's, an answer's. A newer page is wanted once an
 *  update that changed the page came after this one was loaded. */
function takeUpdate(u) {
  if (!u) return;
  const was = state.update?.running;

  state.update = u;
  if (u.running !== was) newsSoon(); // on another release: its notes, once the board is quiet (2026-11-27)
  showUpdate();

  if (!reload.want && u.last?.parts?.includes('page') && Date.parse(u.last.at) > LOADED_AT) {
    reload.want = u.last.to;
    reload.since = Date.now();
    reloadSoon();
  }

  renderBar();
}

/** The page follows a restart (2026-10-13): the server stamps the page it serves, and its own boot, in the head's meta
 *  (`peix-page`), and a snapshot says which page is on disk now. One from a server started since — a restart by hand
 *  after a pull — with another page wants a reload, as an update's does. A reconnect to the same server reloads
 *  nothing: a page edited under it is live on a reload by hand, as before. */
let pageSince = null;

function pageFollows(d) {
  const m = document.querySelector('meta[name="peix-page"]');
  const since = d.about?.since;

  pageSince ??= Number(m?.dataset.since) || since;
  const restarted = since !== pageSince;

  pageSince = since;
  if (!restarted || reload.want || !m?.content || !d.page || d.page === m.content) return;
  reload.want = d.page;
  reload.since = Date.now();
  reloadSoon();
}

function reloadBusy() {
  if (!bar.conn || state.update?.busy || (state.update?.restarting && Date.now() - reload.since < 60_000)) {
    return 'server';
  } // the update still under way, or its restart

  if (document.hidden || Date.now() - updAsked < 5 * 60_000) return null;
  if (document.querySelector('dialog[open]')) return 'dialog';

  if (
    document.activeElement?.matches(
      'textarea:not(.xterm-helper-textarea), input:not([type=checkbox], [type=radio], [type=range], [type=color], [type=button]), [contenteditable]:not([contenteditable=false])',
    )
  ) {
    return 'typing';
  }

  if (inApp && state.paneVisible) return 'pane';
  if (Date.now() - inputAt < RELOAD_IDLE_MS) return 'input';
  return null;
}

function reloadSoon() {
  clearTimeout(reload.t);
  if (!reload.want) return;
  const was = reload.why;

  reload.why = reloadBusy();

  if (!reload.why) {
    location.reload();
    return;
  }

  if (was !== reload.why) renderBar();
  reload.t = setTimeout(reloadSoon, 1000);
}

// Follow (2026-11-27): the server's, as the switch is; the checkout looked at again against it
for (const b of document.querySelectorAll('#updFollow [data-ch]')) {
  b.addEventListener('click', () => {
    const was = state.update?.channel;

    if (b.dataset.ch === (onReleases(state.update) ? 'releases' : 'main')) return;
    b.parentElement.querySelectorAll('[data-ch]').forEach(x => x.setAttribute('aria-checked', String(x === b)));

    api('PUT', '/api/update', { channel: b.dataset.ch })
      .then(takeUpdate)
      .catch(err => {
        if (state.update) state.update.channel = was;
        showUpdate();
        note(b, `Could not save it: ${err.message}`, true);
      });
  });
}

$('#autoUpdate').addEventListener('change', e => {
  const on = e.target.checked;

  api('PUT', '/api/update', { on })
    .then(takeUpdate)
    .catch(err => {
      e.target.checked = !on;
      note(e.target, `Could not save the switch: ${err.message}`, true);
    });
});

/** *update now* from the status bar (2026-10-14): the settings' button without the settings — the page reloads at once
 *  when it is done, as it does for the button. One ask at a time; the bar's word follows the server's. */
let updPosting = false;

function updNow() {
  if (updPosting) return;
  updPosting = true;
  updAsked = Date.now();

  api('POST', '/api/update', { apply: true })
    .then(takeUpdate)
    .catch(err => note($('#sbLeft .upg') || $('#sbar'), `Could not update: ${err.message}`, true))
    .finally(() => {
      updPosting = false;
    });
}
