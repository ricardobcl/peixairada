// `make update` (2026-11-27): the board's *Update now*, from a terminal. It asks the running board's own updater
// (server/update.mjs, `POST /api/update {apply: true}`), so what comes from here is checked as what comes from the page:
// a fast-forward to a tip a key in .github/allowed_signers signed, the new page and server tried first, only what the
// commits changed started again (the packages, the server, the app). Its steps are said as they come, then where it ended
// — up to date, updated, or why not and what clears the way —, and it waits out the server's restart and the app's
// rebuild. Nothing answering, it says so and pulls nothing: a pull by hand takes any tip, signed or not, and is yours to run.
// On releases (2026-11-27, the board's default) what it takes is the newest release, and the notes of what it took are
// printed after. PORT (7331) and STATE_FILE (the key beside it) as scripts/board.sh has them. Exit 0: up to date or updated.
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { relName } from '../lib/changelog.mjs';

const PORT = process.env.PORT || '7331';
const STATE = process.env.STATE_FILE || join(homedir(), 'Library', 'Application Support', 'peixAIrada', 'state.json');
const RESTART_MS = Number(process.env.UPDATE_RESTART_WAIT_MS || 90_000); // the agent back from its restart
const BUILD_MS = 15 * 60_000; // the app's rebuild: swiftc, the bundle, the signature
const EVERY_MS = 400;
const STEPS = {
  pull: 'pulling',
  deps: 'installing the packages (npm ci)',
  page: 'trying the new page',
  server: 'trying the new server on a spare port',
  build: 'rebuilding the app',
  restart: 'restarting the server',
};
const PARTS = { deps: 'the packages', server: 'the server', page: 'the page', app: 'the app' };
const sha = h => (h ? h.slice(0, 7) : '?');
const many = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const them = list => (list?.length === 1 ? 'it' : 'them');
const and = list => list.join(', ').replace(/, ([^,]*)$/, ' and $1');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const key = () => {
  try {
    return readFileSync(join(dirname(STATE), 'key'), 'utf8').trim();
  } catch {
    return '';
  }
};
const BY_HAND =
  'git pull --ff-only && npm ci && scripts/launchd.sh restart (and mac/build.sh install when mac/ changed)';

/** The updater's state, or with a body its answer to *Update now*. `null`: nothing answers on the port. */
async function ask(body, path = '/api/update') {
  let r;
  try {
    r = await fetch(`http://127.0.0.1:${PORT}${path}`, {
      method: body ? 'POST' : 'GET',
      headers: { 'x-peix-key': key(), ...(body && { 'content-type': 'application/json' }) },
      body: body && JSON.stringify(body),
      signal: AbortSignal.timeout(body ? BUILD_MS : 5000),
    });
  } catch (e) {
    if (['ECONNREFUSED', 'ECONNRESET', 'UND_ERR_SOCKET'].includes(e.cause?.code) || e.name === 'TimeoutError')
      return null;
    throw e;
  }
  const b = await r.json().catch(() => ({}));
  if (!r.ok)
    throw new Error(
      r.status === 401
        ? `the board refused its key (${dirname(STATE)}/key)`
        : b.error || `the board answered ${r.status}`,
    );
  return b;
}
function stop(line) {
  console.error(line);
  process.exit(1);
}

const fail = e => stop(`not updated: ${e.message}`);
let st = await ask().catch(fail);
if (!st)
  stop(
    `nothing answers on 127.0.0.1:${PORT} — scripts/launchd.sh status says whether the board runs (make install sets it up). By hand: ${BY_HAND}`,
  );
if (st.checkout === false)
  stop(
    `the board on :${PORT} runs from no git checkout — the app's own server: quit and reopen peixAIrada, so the login agent takes the port, then make update again`,
  );
console.log(
  `peixAIrada in ${st.dir}${st.upstream ? `, from ${st.upstream}` : ''}${st.channel === 'main' ? ', every commit' : ', its releases'}`,
);
const before = st.running; // the release it is on: the notes printed after are those past it

// the steps as they come: the answer is the state once the pull, the packages and the pre-flight are done
const asked = Date.now();
let said = '',
  done = false;
const answer = ask({ apply: true }).finally(() => {
  done = true;
});
(async () => {
  while (!done) {
    const u = await ask().catch(() => null);
    const k = u?.busy === 'updating' && u.steps?.[u.step];
    if (k && `${u.up}:${k}` !== said) {
      said = `${u.up}:${k}`;
      console.log(`  ${u.step + 1}/${u.steps.length} ${STEPS[k] || k}…`);
    }
    await sleep(EVERY_MS);
  }
})();
st = await answer.catch(fail);
// an update under way already (the clock's, the page's): its answer is the state at the ask, so it is followed to its end
while (st?.busy) {
  await sleep(EVERY_MS);
  st = await ask().catch(() => null);
}
if (!st) stop(`the board went away while it updated — scripts/launchd.sh logs says why`);

const took = st.last && st.last.to === st.head && Date.parse(st.last.at) >= asked;
if (st.failed) stop(`not updated: ${st.failed}`);
if (st.error) stop(`could not look at ${st.upstream || 'the remote'}: ${st.error}`);
// what came: the release's name, if one did, and after it its notes
const news = st.channel === 'releases' && st.release ? `${relName(st.release)}` : many(st.behind, 'new commit');
if (took) {
  console.log(
    `updated ${sha(st.last.from)} → ${sha(st.last.to)}${st.last.release ? `, to ${relName(st.last.release)}` : ''}, ${many(st.last.count, 'commit')}${st.last.parts.length ? `: ${and(st.last.parts.map(p => PARTS[p]))}` : ', nothing to start again'}`,
  );
} else {
  const up = st.upstream || 'the remote';
  const why = {
    current: st.ahead
      ? `${sha(st.head)} is ${many(st.ahead, 'commit')} ahead of ${up} — nothing to pull`
      : st.channel === 'releases' && st.past
        ? `${st.running ? `on ${relName(st.running)}, the newest release` : 'no release yet'} — ${up} has ${many(st.past, 'commit')} past it, which Settings › Updates › Follow: Every commit takes`
        : null,
    detached: 'the checkout is on no branch — nothing to follow',
    'no-upstream': `${st.branch} follows no remote branch — nothing to pull`,
    diverged: `this checkout and ${up} have each moved on, ${st.ahead} here and ${st.behind} there — not pulled: git pull --rebase in ${st.dir} puts the ones here on top`,
    unsigned: `${news} on ${up}, not taken: ${sha(st.up)} ${st.sign?.why || 'is not signed'} — an update takes only a tip a key in .github/allowed_signers signed`,
    changes: `${news} on ${up}, not pulled: ${and(st.clash || [])} changed here, and the new commits change ${them(st.clash)} too — commit or discard ${them(st.clash)}, then make update again`,
    held: `${sha(st.held?.to)} was not kept: ${st.held?.why || 'it did not start'}`,
  }[st.why];
  if (why === undefined) stop(`not updated (${st.why})`);
  if (why && st.why !== 'current') stop(why);
  console.log(why || `up to date · ${sha(st.head)}${st.version ? ` (${st.version})` : ''}`);
}

// what the update started, waited out: the agent's restart (a new process answers, with no restart of its own under
// way) and the app's rebuild (build.sh quits the app and opens the new one) — side by side, so the rebuild may have
// ended by the time the server is back; the new server knows it from the state file (`build`)
const rebuilt = () => st.build?.at && Date.parse(st.build.at) >= asked;
if (st.restarting) {
  console.log(`  ${STEPS.restart}…`);
  const until = Date.now() + RESTART_MS;
  let back = null;
  while (!back && Date.now() < until) {
    await sleep(EVERY_MS);
    const u = await ask().catch(() => null);
    if (u && !u.restarting) back = u;
  }
  if (!back) stop(`the server has not come back in ${RESTART_MS / 1000} s — scripts/launchd.sh status and logs`);
  st = back;
  console.log(`  the server is back`);
}
if (st.building) {
  console.log(`  ${STEPS.build} — it quits and opens again…`);
  const until = Date.now() + BUILD_MS;
  while (st.building && Date.now() < until) {
    await sleep(1000);
    st = (await ask().catch(() => null)) || st;
  }
  if (st.building) stop(`the app is still being rebuilt — ${dirname(STATE)}/app-build.log says how far`);
}
if (rebuilt() && st.build.done) {
  if (!st.build.ok) stop(`the app was not rebuilt: ${st.build.why || `${dirname(STATE)}/app-build.log says why`}`);
  console.log('  the app rebuilt');
}
// what it could not start again itself: a server not run by the login agent, an app it does not build
if (st.pending?.includes('server'))
  console.log(`the server running is older than its checkout: scripts/launchd.sh restart (the drawers stay)`);
if (st.app?.behind && !st.building && !(rebuilt() && st.build.ok))
  console.log(
    st.appWhy === 'changes'
      ? `the app is behind mac/, not rebuilt over ${many(st.app.changes, 'change')} to it here`
      : 'the app is behind mac/: mac/build.sh install',
  );
// the notes of the releases it took (2026-11-27), as CHANGELOG.md has them — asked of the server that is back
if (took && st.last?.release) {
  const notes =
    (await ask(null, `/api/update/notes?since=${encodeURIComponent(before || '0.0.0')}`).catch(() => null))?.notes ||
    [];
  for (const n of notes) console.log(`\n## ${relName(n.version)}${n.title ? ` — ${n.title}` : ''}\n\n${n.md}`);
}
