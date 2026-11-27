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

for (const type of ['keydown', 'pointerdown', 'wheel']) {
  addEventListener(
    type,
    () => {
      inputAt = Date.now();
    },
    { capture: true, passive: true },
  );
}

const shortSha = sha => (sha ? sha.slice(0, 7) : '?');
const UPD_PARTS = { deps: 'the packages', server: 'the server', page: 'the page', app: 'the app' };

const UPD_STEPS = {
  pull: 'pulling',
  deps: 'installing the packages',
  page: 'trying the new page',
  server: 'trying the new server',
  restart: 'restarting the server',
  build: 'rebuilding the app',
};

const many = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

// What a board follows (2026-11-27, Settings › Updates › Follow): releases — the newest one past the release it is on,
// said by its name and its notes (CHANGELOG.md's, `u.notes`) — or every commit, said as commits.
/** A release as people say it: 0.2 for 0.2.0 (lib/changelog.mjs' relName). */
const relName = version => {
  const match = /^v?(\d+)\.(\d+)(?:\.(\d+))?$/.exec(String(version || ''));

  return match
    ? Number(match[3])
      ? `${match[1]}.${match[2]}.${match[3]}`
      : `${match[1]}.${match[2]}`
    : String(version || '');
};

const onReleases = update => update?.channel !== 'main';

/** `0.2 is out` while one is to be taken on releases, else null. */
const relOut = update =>
  onReleases(update) && update?.release && update.behind > 0 ? `${relName(update.release)} is out` : null;

/** The notes of what Update now would bring, newest release first, as a reply's markdown is drawn. */
const notesHtml = notes =>
  (notes || [])
    .map(
      release =>
        `<div class="unote"><div class="unh">${esc(relName(release.version))}${release.title ? ` <small>${esc(release.title)}</small>` : ''}</div><div class="md">${md(release.md).html}</div></div>`,
    )
    .join('');

/** The update's run as words: the step it is at and how far that is (`p`, 0–1), or null while nothing runs. A restart
 *  or a page waiting on one is said for a minute at most — a restart that never came is not for ever. */
function updRun(update) {
  if (!update) return null;

  const stepCount = update.steps?.length || 0;
  const at = step => (stepCount ? (update.steps.indexOf(step) + 0.5) / stepCount : null);

  if (update.busy === 'updating') {
    return {
      say: UPD_STEPS[update.steps?.[update.step]] || 'updating',
      p: stepCount && update.step >= 0 ? (update.step + 0.5) / stepCount : null,
      of: stepCount && update.step >= 0 ? `${update.step + 1} of ${stepCount}` : '',
    };
  }

  const fresh = [update.last?.at, update.restartAt].some(stamp => stamp && Date.now() - Date.parse(stamp) < 60_000); // restartAt: a restart for the code on disk (2026-11-25)

  if ((update.restarting || reload.why === 'server') && fresh) return { say: UPD_STEPS.restart, p: at('restart') };
  if (update.building) return { say: UPD_STEPS.build, p: null };
  return null;
}

// The installed app against the checkout (2026-10-14; readApp in server/update.mjs): behind when built from another mac/ than
// HEAD's — commits made here as much as pulled ones —, and why it is not being rebuilt (`appWhy`: appWhyNot's word).
const appFailed = update =>
  !!(update?.app?.behind && update.build?.done && !update.build.ok && update.build.source === update.app.source);

function appSay(update) {
  const app = update.app;

  if (!app?.behind || update.building) return '';

  const fail = appFailed(update)
    ? ` <span class="uerr">the app was not rebuilt: ${esc(update.build.why || '')}</span> —`
    : '';

  return ` ·${fail || ' the app is behind <code>mac/</code> here —'} ${
    {
      off: '<b>Update now</b> rebuilds it (it quits and opens again)',
      tried: '<b>Update now</b> tries again',
      busy: `rebuilt once nothing has been done on the board for ${Math.round(update.quiet / 60_000)} min`,
      changes: `not rebuilt over ${many(app.changes, 'change')} to it here`,
      pull: 'rebuilt with the commits',
    }[update.appWhy] || '<code>mac/build.sh install</code> rebuilds it'
  }`;
}

// What *update now* would take: new commits it can fast-forward to, the switch or the rest aside — over files changed
// here too, unless the commits change one of them (2026-10-15, `clash`); the app behind mac/, rebuilt alone. The
// settings' button and the status bar's word (2026-10-14) both go by them.
const canPull = update =>
  update.behind > 0 &&
  (!update.ahead || update.rewritten) &&
  (['off', 'busy', 'held'].includes(update.why) || (update.why === 'changes' && update.clash?.length === 0));

/** Files by name, three at most (2026-10-15); `count` how many there are in all. */
const filesSay = (names = [], count = names.length) =>
  names.length
    ? names
        .slice(0, 3)
        .map(file => `<code>${esc(file)}</code>`)
        .join(', ') + (count > 3 ? ` and ${count - 3} more` : '')
    : many(count, 'file');

/** A command to run in the checkout, to copy out of the settings' line: `cd` there first, a word quoted only when it must be. */
function inCheckout(update, ...words) {
  const quote = word => (/^[\w@%+=:,./-]+$/.test(word) ? word : `'${word.replace(/'/g, `'\\''`)}'`);
  const dir = update.dir || '.';

  return esc(`cd ${dir.startsWith('~/') ? `~/${quote(dir.slice(2))}` : quote(dir)} && ${words.map(quote).join(' ')}`);
}

const canBuild = update => !update.busy && ['off', 'tried', 'busy'].includes(update.appWhy);
const canRestart = update => !update.busy && !!update.restart && !!update.pending?.includes('server'); // the agent, older than its checkout (2026-11-25)

/** Settings' row for the update (2026-10-16, a status row): a few words for where it stands (`word`), one line on it
 *  (`say`), and the rest — the commands that clear the way, why a commit was held, the last update — under Details
 *  (`more`); and whether its button updates (rather than looks). */
function updateSay(update) {
  if (!update || update.checkout === null) return { word: 'Not looked yet', say: 'not looked yet' };

  if (update.checkout === false) {
    return {
      word: 'Not a git checkout',
      say: 'this board does not run from a git checkout — <code>mac/build.sh install</code> brings the app up to date',
      none: true,
    };
  }

  // a rewritten history (2026-11-06): its commits are this checkout's own, made again — the news is what it adds
  const up = esc(update.upstream || 'the remote');

  const fresh = update.rewritten
    ? `${up}'s history rewritten, ${many(update.fresh || 0, 'new commit')} besides`
    : relOut(update)
      ? `${esc(relName(update.release))}, ${many(update.behind, 'commit')} on ${up}`
      : `${many(update.behind, 'new commit')} on ${up}`;

  const run = updRun(update);
  const more = [];
  const them = count => (count === 1 ? 'it' : 'them');

  if (update.rewritten && update.behind > 0) {
    more.push(
      `every commit here is one it names as rewritten (<code>.github/rewritten</code>), so none of them is lost: <b>Update now</b> moves this checkout onto it, your changes kept`,
    );
  }

  let say;

  if (update.busy === 'checking') say = `looking at ${up}…`;
  else if (update.busy === 'updating') {
    say = `updating to <code>${shortSha(update.up)}</code> — ${run.say}${run.of ? ` (${run.of})` : ''}…`;
  } else if (update.error) say = `<span class="uerr">${esc(update.error)}</span>`;
  else if (update.why === 'diverged') {
    say = `this checkout and ${up} have each moved on, ${update.ahead} here and ${update.behind} there — not pulled`;

    more.push(
      `<code>${inCheckout(update, 'git', 'pull', '--rebase')}</code> puts ${update.ahead === 1 ? 'the one' : 'those'} here on top, then <b>Check now</b>`,
    );
  } else if (update.why === 'changes' && update.clash?.length) {
    say = `${fresh}, not pulled: ${filesSay(update.clash)} changed here, and the new commits change ${them(update.clash.length)} too`;

    more.push(
      `commit or discard ${them(update.clash.length)} (<code>${inCheckout(update, 'git', 'checkout', 'HEAD', '--', ...update.clash)}</code> discards), then <b>Check now</b>`,
    );
  } else if (update.why === 'held') {
    say = `<code>${shortSha(update.held?.to)}</code> was not kept — the next commit is tried`;
    more.push(`why: ${esc(update.held?.why || 'it did not start')}`);
  }
  // a tip no trusted key signed is never taken, the button's way neither (2026-11-06): said, with the keys' file
  else if (update.why === 'unsigned') {
    say = `${fresh}, not taken: <code>${shortSha(update.up)}</code> ${esc(update.sign?.why || 'is not signed')}`;

    more.push(
      `an update is taken only when its newest commit is signed by a key in <code>.github/allowed_signers</code>, as this checkout has it — <code>${inCheckout(update, 'git', 'log', '--show-signature', '-1', update.upstream || '@{u}')}</code> shows it`,
    );
  } else {
    say =
      {
        detached: 'the checkout is on no branch — nothing to follow',
        'no-upstream': `<b>${esc(update.branch)}</b> follows no remote branch — nothing to pull`,
        current: update.ahead
          ? `<code>${shortSha(update.head)}</code> is ${many(update.ahead, 'commit')} ahead of ${up} — nothing to pull`
          : onReleases(update)
            ? `${update.running ? `on ${esc(relName(update.running))}, the newest release` : 'no release yet'}${update.past ? ` · ${many(update.past, 'commit')} on ${up} since, which <b>Every commit</b> takes` : ''}`
            : `up to date · <code>${shortSha(update.head)}</code>`,
        changes: `${fresh} — <b>Update now</b> takes them and leaves ${filesSay(update.changed, update.dirty)} changed here as ${update.dirty === 1 ? 'it is' : 'they are'}${update.on ? '; by itself it never pulls over a change' : ''}`,
        off: `${fresh} — <b>Update now</b> ${update.rewritten ? 'follows it' : 'takes them'}`,
        busy: `${fresh} — pulled once nothing has been done on the board for ${Math.round(update.quiet / 60_000)} min`,
      }[update.why] || `<code>${shortSha(update.head)}</code>${update.checkedAt ? '' : ' · not looked yet'}`;
  }

  if (run && update.busy !== 'updating') say += ` · ${run.say}…`;
  else if (!update.busy) say += appSay(update);

  // the server older than the checkout (2026-11-25): a pull by hand, or an update this server could not restart for
  if (update.pending?.includes('server')) {
    say += update.restart
      ? ' · the server running is older than the checkout — <b>Restart now</b> starts it again'
      : ' · restart the server to wear it';

    more.push(
      `<code>${inCheckout(update, 'scripts/launchd.sh', 'restart')}</code> restarts it; the chats in drawers stay`,
    );
  }

  if (update.checkedAt && !update.busy) say += ` · looked ${rel(update.checkedAt)} ago`;

  if (!update.every) {
    say += ' · it looks only when asked';
    more.push('this server is not the login agent, so it looks only when asked');
  }

  if (update.behind > 0 && update.commits?.length) {
    more.push(
      `${relOut(update) ? `the commits ${esc(relName(update.release))} brings` : update.behind === 1 ? 'the new commit' : 'the new commits'}${update.behind > 1 && update.behind > update.commits.length ? `, the newest ${update.commits.length}` : ''}${update.sign?.ok && update.sign.by ? `, the newest signed by ${esc(update.sign.by)}` : ''}: ${update.commits.map(commit => `<code>${esc(commit.h)}</code> ${esc(commit.s)} — ${esc(commit.a)}`).join('<br>')}`,
    );
  } // what Update now takes, named first (2026-11-06)

  if (update.last) {
    more.push(
      `last update ${rel(update.last.at)} ago: ${update.last.release ? `to ${esc(relName(update.last.release))}, ` : ''}${many(update.last.count, 'commit')}${
        update.last.parts.length
          ? `, touching ${update.last.parts
              .map(part => UPD_PARTS[part])
              .join(', ')
              .replace(/, ([^,]*)$/, ' and $1')}`
          : ''
      }`,
    );
  }

  return {
    word: updWord(update),
    say,
    notes: update.behind > 0 && !update.busy ? notesHtml(update.notes) : '',
    more: more.join('<br>'),
    apply: canPull(update) || canBuild(update) || canRestart(update),
    restart: !canPull(update) && !canBuild(update) && canRestart(update),
  };
}

/** Where the update stands, in a few words: the status row's name. */
const updWord = update =>
  update.busy === 'checking'
    ? 'Looking…'
    : update.busy === 'updating'
      ? 'Updating…'
      : update.error
        ? 'Could not look'
        : update.failed
          ? 'Update failed'
          : update.why === 'held'
            ? 'Held back'
            : update.why === 'diverged'
              ? 'Diverged'
              : update.why === 'unsigned'
                ? 'Not signed'
                : update.why === 'changes' && update.clash?.length
                  ? 'Waiting on your changes'
                  : update.behind > 0
                    ? update.rewritten
                      ? 'History rewritten'
                      : relOut(update) || many(update.behind, 'new commit')
                    : update.why === 'detached'
                      ? 'On no branch'
                      : update.why === 'no-upstream'
                        ? 'No remote branch'
                        : update.pending?.includes('server')
                          ? 'The server is behind'
                          : update.app?.behind
                            ? 'The app is behind'
                            : update.ahead
                              ? 'Ahead of the remote'
                              : 'Up to date';

/** The status bar's word on the update (2026-10-12): what it is doing, step by step; a page that waits to be reloaded
 *  (a click reloads it); an update that failed or was held back; new commits not taken, and why; for a minute, what
 *  came. Nothing while it is up to date. A click opens Settings › Updates — but on news *update now* would take, where
 *  it is *update now* (2026-10-14: `data-take`, `updNow`), and the words say so. */
function updSeg() {
  const update = state.update;

  if (!update?.checkout && !reload.want) return ''; // a page wanted after a restart is said off a checkout too (pageFollows)

  const seg = (cls, icon, words, tip, progress = null, take = '') =>
    `<button class="seg upg ${cls}"${take ? ' data-take="1"' : ''} title="${esc(tip)} — click ${cls === 'page' ? 'to reload it now' : take || 'for Settings › Updates'}">${icon}<span>${words}</span>${progress == null ? '' : `<i style="--p:${progress.toFixed(2)}"></i>`}</button>`;

  const run = updRun(update);
  const report = updateSay(update);

  const tip = unesc(
    [report.say, report.more]
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

  if (update.failed || update.why === 'held') {
    return seg('err', ICON.reload, update.why === 'held' ? 'update held back' : 'update failed', tip);
  }

  if (appFailed(update)) return seg('err', ICON.reload, 'the app was not rebuilt', tip);

  const why = {
    off: '',
    changes: canPull(update) ? '' : ' · changes here',
    diverged: ' · diverged',
    unsigned: ' · not signed',
    busy: ' · once you rest',
  }[update.why]; // off, the default: new commits are the news, not the switch (2026-10-13); changes here, unless a click pulls over them (2026-10-15)

  if (update.behind > 0 && why != null) {
    return seg(
      'new',
      ICON.download,
      `${update.rewritten ? 'history rewritten' : relOut(update) || many(update.behind, 'new commit')}${why || (canPull(update) ? ' · update' : '')}`,
      tip,
      null,
      canPull(update) ? 'to update now' : '',
    );
  }

  const appWhy = { off: '', tried: '', manual: '', changes: ' · changes here', busy: ' · once you rest' }[
    update.appWhy
  ]; // nothing to pull, and the app older than mac/ here (2026-10-14)

  if (update.app?.behind && appWhy != null) {
    return seg(
      'new',
      ICON.download,
      `the app is behind${appWhy || (canBuild(update) ? ' · rebuild' : '')}`,
      tip,
      null,
      canBuild(update) ? 'to rebuild it now (it quits and opens again)' : '',
    );
  }

  if (update.pending?.includes('server')) {
    return seg(
      'new',
      ICON.reload,
      `the server is behind${canRestart(update) ? ' · restart' : ''}`,
      tip,
      null,
      canRestart(update) ? 'to restart it now (the chats in drawers stay)' : '',
    );
  } // 2026-11-25

  if (update.last && Date.now() - Date.parse(update.last.at) < 60_000) {
    return seg(
      'done',
      ICON.reload,
      update.last.release
        ? `updated to ${esc(relName(update.last.release))}`
        : `updated · ${many(update.last.count, 'commit')}`,
      tip,
    );
  }

  return '';
}

const updatesOpen = () => settingsAt('system', '#updRow');

function showUpdate() {
  const update = state.update;
  const report = updateSay(update);
  const button = $('#updBtn');

  $('#autoUpdate').checked = update?.on === true;
  $('#autoUpdate').disabled = !!report.none;

  $('#autoUpdateSay').textContent = report.none
    ? 'Only for a board run from a git checkout'
    : onReleases(update)
      ? update?.on
        ? 'Takes a new release after two idle minutes, never over your changes'
        : 'The status bar says when a release comes'
      : update?.on
        ? 'Pulls new commits after two idle minutes, never over your changes'
        : 'The status bar says when new commits come';

  for (const option of document.querySelectorAll('#updFollow [data-ch]')) {
    option.setAttribute('aria-checked', String(option.dataset.ch === (onReleases(update) ? 'releases' : 'main')));
    option.disabled = !!(report.none || update?.busy);
  }

  $('#updFollowSay').textContent = onReleases(update)
    ? 'The newest release, with notes on what it brings'
    : 'Every commit on the main branch, the day it lands';

  $('#updWord').textContent = report.word;
  setHtml($('#updSay'), report.say);
  $('#updNotes').hidden = !report.notes;
  setHtml($('#updNotes'), report.notes || '');
  $('#updMore').hidden = !report.more;
  setHtml($('#updMore div'), report.more || '');
  button.textContent = report.restart ? 'Restart now' : report.apply ? 'Update now' : 'Check now';
  button.dataset.apply = report.apply ? '1' : '';
  button.disabled = !!(update?.busy || report.none);
}

/** The server's word on the update — the snapshot's, an `update` event's, an answer's. A newer page is wanted once an
 *  update that changed the page came after this one was loaded. */
function takeUpdate(update) {
  if (!update) return;
  const was = state.update?.running;

  state.update = update;
  if (update.running !== was) newsSoon(); // on another release: its notes, once the board is quiet (2026-11-27)
  showUpdate();

  if (!reload.want && update.last?.parts?.includes('page') && Date.parse(update.last.at) > LOADED_AT) {
    reload.want = update.last.to;
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

function pageFollows(snapshot) {
  const meta = document.querySelector('meta[name="peix-page"]');
  const since = snapshot.about?.since;

  pageSince ??= Number(meta?.dataset.since) || since;
  const restarted = since !== pageSince;

  pageSince = since;
  if (!restarted || reload.want || !meta?.content || !snapshot.page || snapshot.page === meta.content) return;
  reload.want = snapshot.page;
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
for (const option of document.querySelectorAll('#updFollow [data-ch]')) {
  option.addEventListener('click', () => {
    const was = state.update?.channel;

    if (option.dataset.ch === (onReleases(state.update) ? 'releases' : 'main')) return;

    option.parentElement
      .querySelectorAll('[data-ch]')
      .forEach(other => other.setAttribute('aria-checked', String(other === option)));

    api('PUT', '/api/update', { channel: option.dataset.ch })
      .then(takeUpdate)
      .catch(err => {
        if (state.update) state.update.channel = was;
        showUpdate();
        note(option, `Could not save it: ${err.message}`, true);
      });
  });
}

$('#autoUpdate').addEventListener('change', event => {
  const on = event.target.checked;

  api('PUT', '/api/update', { on })
    .then(takeUpdate)
    .catch(err => {
      event.target.checked = !on;
      note(event.target, `Could not save the switch: ${err.message}`, true);
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
