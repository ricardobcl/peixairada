// The chat's own hand on a PR (2026-10-15): a push or a gh that writes to it — and a PR's move said in an
// alert.
import { hushOf, nativeNotify } from '../notify.mjs';
import { bumpLog, isoS, logEvents, loggedOf, roundsOf } from './ledger.mjs';
import { PR_RE, prKey, prMatch } from './mentions.mjs';
import { queuePr, touchedAt } from './status.mjs';
import { ghRepoOf } from '../repos.mjs';
import { summary } from '../sessions.mjs';
import { broadcast, schedulePush } from '../sse.mjs';
import { indexing, mutedChats, prLogs, prTurns, sessions, snoozed } from '../state.mjs';
import { resultText } from '../transcript/text.mjs';

// ---- …and the chat's own hand on it (2026-10-15) -------------------------------------------------------------------
// Most answers are made from a chat — in a week of transcripts, 300 pushes and 236 replies or reviews posted through
// `gh api`, across 52 chats. A Bash call that acts on a PR — a push, `gh pr review · comment · merge · create`, a POST to
// a PR's comments, replies or reviews — is noted when its result comes back without an error (prActs, noteActsDone),
// tied to the chat's PR it names (its URL, its number in the chat's repo or the one given, or for a push the PR whose
// branch it pushed — the line's own branch when none is named), and goes into that PR's ledger as the chat's event. A
// round its word closes says it came from that chat (`by`), and the PR is asked about again a few seconds on, so the
// answer shows without waiting for the next poll.
const ANSWERS = new Set(['push', 'review', 'comment', 'reply']);

export const PR_CONFIRM_MS = Number(process.env.PR_CONFIRM_MS || 4000);
export const ACTS_MAX = 40;

/** A command's words, quotes kept together, and the shell's own `&&` `||` `;` `|` and new lines as words of their own. */
const shellWords = cmd =>
  [
    ...String(cmd || '').matchAll(
      /"((?:[^"\\]|\\[\s\S])*)"|'([^']*)'|(&&|\|\||[;|\n])|([^\s"';|&]+(?:&(?!&)[^\s"';|&]*)*)/g,
    ),
  ].map(m => (m[3] ? { op: m[3] } : { w: m[1] ?? m[2] ?? m[4] }));

/** The words of each command in a line, split where the shell would split it. */
function shellCommands(cmd) {
  const out = [[]];

  for (const t of shellWords(cmd)) {
    if (t.op) out.push([]);
    else out.at(-1).push(t.w);
  }

  return out.filter(c => c.length);
}

// the flags of `gh pr <sub>` that take a value; any other flag stands alone
const GH_PR_VALUES = {
  review: ['-b', '--body', '-F', '--body-file', '-R', '--repo'],
  comment: ['-b', '--body', '-F', '--body-file', '-R', '--repo'],
  merge: [
    '-b',
    '--body',
    '-F',
    '--body-file',
    '-t',
    '--subject',
    '-R',
    '--repo',
    '--match-head-commit',
    '-A',
    '--author-email',
  ],
  create: [
    '-b',
    '--body',
    '-F',
    '--body-file',
    '-t',
    '--title',
    '-B',
    '--base',
    '-H',
    '--head',
    '-r',
    '--reviewer',
    '-a',
    '--assignee',
    '-l',
    '--label',
    '-m',
    '--milestone',
    '-p',
    '--project',
    '-T',
    '--template',
    '-R',
    '--repo',
    '--recover',
  ],
};

const GH_API_VALUES = new Set([
  '-X',
  '--method',
  '-H',
  '--header',
  '-f',
  '--raw-field',
  '-F',
  '--field',
  '--input',
  '-q',
  '--jq',
  '-t',
  '--template',
  '--hostname',
  '-p',
  '--preview',
  '--cache',
]);

const GH_API_PR =
  /^\/?repos\/([^/\s]+)\/([^/\s]+)\/(pulls|issues)\/([1-9]\d{0,9})\/(comments|reviews)(?:\/\d+\/replies)?\/?(?:\?.*)?$/;

/**
 * What a Bash command did to a PR, as far as its words say (pure): `{ x: push · review · comment · reply · merge ·
 * opened, url? | num? (repo? 'owner/name') | branch? }` — a branch of '' is the one checked out. `git push` names its
 * branches by refspec (`+src:dst`, `HEAD` the current one); `gh pr <sub>` its PR as a URL, a number or a branch, else
 * the current branch's; `gh api` counts only when it writes (a field, `--input`, or `-X POST|PATCH|PUT`).
 */
export function prActs(cmd) {
  const acts = [];

  for (let w of shellCommands(cmd)) {
    while (w.length && (/^\w+=/.test(w[0]) || ['env', 'command', 'time', 'noglob'].includes(w[0]))) w = w.slice(1);

    if (w[0] === 'git') {
      let i = 1;

      while (i < w.length && w[i].startsWith('-')) {
        i += ['-C', '-c', '--git-dir', '--work-tree', '--namespace'].includes(w[i]) ? 2 : 1;
      }

      if (w[i] !== 'push') continue;

      const pos = [];
      const args = w.slice(i + 1);

      let skip = false;

      for (let j = 0; j < args.length; j++) {
        const a = args[j];

        if (['-d', '--delete', '--tags', '--all', '--mirror', '--prune'].includes(a)) {
          skip = true;
          break;
        }

        if (['-o', '--push-option', '--repo', '--receive-pack', '--exec'].includes(a)) {
          j++;
          continue;
        }

        if (!a.startsWith('-')) pos.push(a);
      }

      if (skip) continue;
      const refs = pos.slice(1);

      if (!refs.length) acts.push({ x: 'push', branch: '' });

      for (const r of refs) {
        const b = r
          .replace(/^\+/, '')
          .split(':')
          .pop()
          .replace(/^refs\/heads\//, '');

        acts.push({ x: 'push', branch: b === 'HEAD' ? '' : b });
      }
    } else if (w[0] === 'gh' && w[1] === 'pr' && GH_PR_VALUES[w[2]]) {
      const values = GH_PR_VALUES[w[2]];
      const pos = [];

      let repo = null;

      for (let j = 3; j < w.length; j++) {
        const a = w[j];

        const [flag, inline] =
          a.startsWith('--') && a.includes('=') ? [a.slice(0, a.indexOf('=')), a.slice(a.indexOf('=') + 1)] : [a, null];

        if (values.includes(flag)) {
          const v = inline ?? w[++j];

          if (flag === '-R' || flag === '--repo') repo = v;
          continue;
        }

        if (!a.startsWith('-')) pos.push(a);
      }

      const x = w[2] === 'create' ? 'opened' : w[2];
      const ref = pos[0];

      if (x === 'opened') {
        acts.push({ x });
        continue;
      }

      const one = ref && prMatch(ref);

      acts.push(
        one
          ? { x, url: ref }
          : ref && /^#?\d{1,10}$/.test(ref)
            ? { x, num: Number(ref.replace('#', '')), repo }
            : { x, branch: ref || '', repo },
      );
    } else if (w[0] === 'gh' && w[1] === 'api') {
      let path = null;
      let writes = false;

      for (let j = 2; j < w.length; j++) {
        const a = w[j];

        if (a === '-X' || a === '--method') {
          writes ||= /^(POST|PATCH|PUT)$/i.test(w[j + 1] || '');
          j++;
          continue;
        }

        if (/^--method=/.test(a)) {
          writes ||= /=(POST|PATCH|PUT)$/i.test(a);
          continue;
        }

        if (['-f', '--raw-field', '-F', '--field', '--input'].includes(a) || /^--(raw-)?field=|^--input=/.test(a)) {
          writes = true;
        }

        if (GH_API_VALUES.has(a)) {
          j++;
          continue;
        }

        if (!a.startsWith('-') && !path) path = a;
      }

      const m = writes && path && GH_API_PR.exec(path);

      if (!m) continue;
      const repo = m[1] === '{owner}' || m[2] === '{repo}' ? null : `${m[1]}/${m[2]}`;

      acts.push({
        x: m[5] === 'reviews' ? 'review' : m[3] === 'issues' ? 'comment' : 'reply',
        num: Number(m[4]),
        repo,
      });
    }
  }

  return acts;
}

/** A Bash call of the chat's: what it would do to a PR, waiting on its result. */
export function noteActsCalled(s, b, ts, branch) {
  const acts = b.id && ts ? prActs(b.input?.command) : [];

  if (!acts.length) return;
  s.actsWait.set(b.id, { acts, at: ts, branch: branch || s.gitBranch || null });
  if (s.actsWait.size > ACTS_MAX) s.actsWait.delete(s.actsWait.keys().next().value);
}

/** Its result: done without an error, the acts are the chat's — `gh pr create` names its PR in what it printed. */
export function noteActsDone(s, b) {
  const w = s.actsWait.get(b.tool_use_id);

  if (!w) return;
  s.actsWait.delete(b.tool_use_id);
  if (b.is_error) return;
  const out = w.acts.some(a => a.x === 'opened') ? resultText(b) : '';

  w.acts.forEach((a, i) => {
    const url = a.x === 'opened' ? out.match(PR_RE)?.[0] : a.url;

    if (a.x === 'opened' && !url) return;
    s.prActs.push({ ...a, url: null, ref: url || null, id: `${b.tool_use_id}:${i}`, at: w.at, cur: w.branch });
  });

  if (s.prActs.length > ACTS_MAX) s.prActs.splice(0, s.prActs.length - ACTS_MAX);
  takeActs(s);
}

/** Which of the chat's PRs an act is on, if it can be told yet: a push's branch needs GitHub to have named the PR's. */
function actUrl(s, a) {
  if (a.ref) {
    const m = prMatch(a.ref);

    return m ? prKey(m[1], m[2], m[3]) : null;
  }

  const own = ghRepoOf(s.live?.cwd || s.cwd);
  const repo = a.repo ? a.repo.split('/') : own ? [own.owner, own.name] : null;

  if (a.num) return repo?.length === 2 ? prKey(repo[0], repo[1], a.num) : null;
  const branch = a.branch || a.cur;

  if (!branch || branch === 'HEAD' || !repo) return null;
  const base = `https://github.com/${repo[0]}/${repo[1]}/pull/`.toLowerCase();

  return s.prs.find(p => p.url.startsWith(base) && p.refs?.head === branch && !p.refs.fork)?.url || null;
}

/** The chat's acts that can be tied to a PR now, into its ledger — and a fresh answer, the PR asked about again soon. */
export function takeActs(s) {
  for (const a of s.prActs) {
    if (a.url) continue;
    const url = actUrl(s, a);

    if (!url || (!prTurns[url] && !s.prs.some(p => p.url === url))) continue; // a PR of the chat's, or one with a turn: not an issue's number
    a.url = url;

    const ev = {
      id: `chat:${s.id}:${a.id}`,
      k: 'chat',
      w: '',
      x: a.x,
      a: isoS(Date.parse(a.at) || Date.now()),
      c: s.id,
    };

    if (!logEvents(url, [ev])) continue;
    const r = prLogs[url].r.at(-1); // a round closed before the chat's line was read: said now

    if (r?.how === 'answered' && !r.by && ANSWERS.has(a.x) && ev.a >= r.from) {
      Object.assign(r, byChat(url, r, isoS(Date.now())));
      bumpLog(url);
    }

    pushRounds(url);
    const age = Date.now() - Date.parse(a.at);

    if (!indexing && !s.silent && ANSWERS.has(a.x) && prTurns[url] && age >= 0 && age < 5 * 60_000) {
      setTimeout(() => queuePr(url, 0), PR_CONFIRM_MS);
    }
  }
}

/** The chat whose answer closed a round: its newest answering act on the PR since the round began. */
export function byChat(url, round, until) {
  const ev = (prLogs[url]?.ev || [])
    .filter(e => e.k === 'chat' && ANSWERS.has(e.x) && e.a >= round.from && e.a <= until)
    .at(-1);

  return ev ? { by: { c: ev.c, x: ev.x, a: ev.a } } : {};
}

/** A PR's rounds, and its ledger's count, onto every chat that names it. */
function pushRounds(url) {
  const rounds = roundsOf(url);
  const rs = JSON.stringify(rounds);
  const logged = loggedOf(url);

  for (const s of sessions.values()) {
    const pr = s.prs.find(p => p.url === url);

    if (pr && (pr.logged !== logged || JSON.stringify(pr.rounds ?? null) !== rs)) {
      pr.rounds = rounds;
      pr.logged = logged;
      schedulePush(s);
    }
  }
}

/** Who says a PR's alert: the chat touched last of those that mention it, a muted one only when all are (2026-11-02) —
 *  nor a snoozed one (2026-11-24, round XXX): it calls you on nothing. */
export function prAlertChat(chats) {
  const loud = chats.filter(s => !mutedChats[s.id] && !snoozed[s.id]);

  return (loud.length ? loud : chats).reduce((a, b) => (!a || touchedAt(b) > touchedAt(a) ? b : a), null);
}

/** A PR come round to you: one alert, on the chat `prAlertChat` picks. */
export function notifyPr(url, turn, chats) {
  const s = prAlertChat(chats);

  if (!s || indexing) return;

  const sum = summary(s);
  const heading = `Your move · ${s.prs.find(p => p.url === url)?.label || url}`;

  const evt = {
    kind: 'pr',
    sessionId: s.id,
    project: sum.project,
    title: sum.title,
    heading,
    snippet: turn.why,
    url,
    ts: new Date().toISOString(),
    ...hushOf(s),
  };

  broadcast('alert', evt);
  if (!evt.quiet) nativeNotify(heading, sum.title, turn.why);
}
