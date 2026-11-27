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
  ].map(match => (match[3] ? { op: match[3] } : { w: match[1] ?? match[2] ?? match[4] }));

/** The words of each command in a line, split where the shell would split it. */
function shellCommands(cmd) {
  const out = [[]];

  for (const token of shellWords(cmd)) {
    if (token.op) out.push([]);
    else out.at(-1).push(token.w);
  }

  return out.filter(words => words.length);
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

  for (let words of shellCommands(cmd)) {
    while (words.length && (/^\w+=/.test(words[0]) || ['env', 'command', 'time', 'noglob'].includes(words[0]))) {
      words = words.slice(1);
    }

    if (words[0] === 'git') {
      let index = 1;

      while (index < words.length && words[index].startsWith('-')) {
        index += ['-C', '-c', '--git-dir', '--work-tree', '--namespace'].includes(words[index]) ? 2 : 1;
      }

      if (words[index] !== 'push') continue;

      const pos = [];
      const args = words.slice(index + 1);

      let skip = false;

      for (let argIndex = 0; argIndex < args.length; argIndex++) {
        const arg = args[argIndex];

        if (['-d', '--delete', '--tags', '--all', '--mirror', '--prune'].includes(arg)) {
          skip = true;
          break;
        }

        if (['-o', '--push-option', '--repo', '--receive-pack', '--exec'].includes(arg)) {
          argIndex++;
          continue;
        }

        if (!arg.startsWith('-')) pos.push(arg);
      }

      if (skip) continue;
      const refs = pos.slice(1);

      if (!refs.length) acts.push({ x: 'push', branch: '' });

      for (const refspec of refs) {
        const branch = refspec
          .replace(/^\+/, '')
          .split(':')
          .pop()
          .replace(/^refs\/heads\//, '');

        acts.push({ x: 'push', branch: branch === 'HEAD' ? '' : branch });
      }
    } else if (words[0] === 'gh' && words[1] === 'pr' && GH_PR_VALUES[words[2]]) {
      const values = GH_PR_VALUES[words[2]];
      const pos = [];

      let repo = null;

      for (let index = 3; index < words.length; index++) {
        const arg = words[index];

        const [flag, inline] =
          arg.startsWith('--') && arg.includes('=')
            ? [arg.slice(0, arg.indexOf('=')), arg.slice(arg.indexOf('=') + 1)]
            : [arg, null];

        if (values.includes(flag)) {
          const value = inline ?? words[++index];

          if (flag === '-R' || flag === '--repo') repo = value;
          continue;
        }

        if (!arg.startsWith('-')) pos.push(arg);
      }

      const act = words[2] === 'create' ? 'opened' : words[2];
      const ref = pos[0];

      if (act === 'opened') {
        acts.push({ x: act });
        continue;
      }

      const one = ref && prMatch(ref);

      acts.push(
        one
          ? { x: act, url: ref }
          : ref && /^#?\d{1,10}$/.test(ref)
            ? { x: act, num: Number(ref.replace('#', '')), repo }
            : { x: act, branch: ref || '', repo },
      );
    } else if (words[0] === 'gh' && words[1] === 'api') {
      let path = null;
      let writes = false;

      for (let index = 2; index < words.length; index++) {
        const arg = words[index];

        if (arg === '-X' || arg === '--method') {
          writes ||= /^(POST|PATCH|PUT)$/i.test(words[index + 1] || '');
          index++;
          continue;
        }

        if (/^--method=/.test(arg)) {
          writes ||= /=(POST|PATCH|PUT)$/i.test(arg);
          continue;
        }

        if (['-f', '--raw-field', '-F', '--field', '--input'].includes(arg) || /^--(raw-)?field=|^--input=/.test(arg)) {
          writes = true;
        }

        if (GH_API_VALUES.has(arg)) {
          index++;
          continue;
        }

        if (!arg.startsWith('-') && !path) path = arg;
      }

      const match = writes && path && GH_API_PR.exec(path);

      if (!match) continue;
      const repo = match[1] === '{owner}' || match[2] === '{repo}' ? null : `${match[1]}/${match[2]}`;

      acts.push({
        x: match[5] === 'reviews' ? 'review' : match[3] === 'issues' ? 'comment' : 'reply',
        num: Number(match[4]),
        repo,
      });
    }
  }

  return acts;
}

/** A Bash call of the chat's: what it would do to a PR, waiting on its result. */
export function noteActsCalled(session, block, ts, branch) {
  const acts = block.id && ts ? prActs(block.input?.command) : [];

  if (!acts.length) return;
  session.actsWait.set(block.id, { acts, at: ts, branch: branch || session.gitBranch || null });
  if (session.actsWait.size > ACTS_MAX) session.actsWait.delete(session.actsWait.keys().next().value);
}

/** Its result: done without an error, the acts are the chat's — `gh pr create` names its PR in what it printed. */
export function noteActsDone(session, block) {
  const waiting = session.actsWait.get(block.tool_use_id);

  if (!waiting) return;
  session.actsWait.delete(block.tool_use_id);
  if (block.is_error) return;
  const out = waiting.acts.some(act => act.x === 'opened') ? resultText(block) : '';

  waiting.acts.forEach((act, index) => {
    const url = act.x === 'opened' ? out.match(PR_RE)?.[0] : act.url;

    if (act.x === 'opened' && !url) return;

    session.prActs.push({
      ...act,
      url: null,
      ref: url || null,
      id: `${block.tool_use_id}:${index}`,
      at: waiting.at,
      cur: waiting.branch,
    });
  });

  if (session.prActs.length > ACTS_MAX) session.prActs.splice(0, session.prActs.length - ACTS_MAX);
  takeActs(session);
}

/** Which of the chat's PRs an act is on, if it can be told yet: a push's branch needs GitHub to have named the PR's. */
function actUrl(session, act) {
  if (act.ref) {
    const match = prMatch(act.ref);

    return match ? prKey(match[1], match[2], match[3]) : null;
  }

  const own = ghRepoOf(session.live?.cwd || session.cwd);
  const repo = act.repo ? act.repo.split('/') : own ? [own.owner, own.name] : null;

  if (act.num) return repo?.length === 2 ? prKey(repo[0], repo[1], act.num) : null;
  const branch = act.branch || act.cur;

  if (!branch || branch === 'HEAD' || !repo) return null;
  const base = `https://github.com/${repo[0]}/${repo[1]}/pull/`.toLowerCase();

  return session.prs.find(pr => pr.url.startsWith(base) && pr.refs?.head === branch && !pr.refs.fork)?.url || null;
}

/** The chat's acts that can be tied to a PR now, into its ledger — and a fresh answer, the PR asked about again soon. */
export function takeActs(session) {
  for (const act of session.prActs) {
    if (act.url) continue;
    const url = actUrl(session, act);

    if (!url || (!prTurns[url] && !session.prs.some(pr => pr.url === url))) continue; // a PR of the chat's, or one with a turn: not an issue's number
    act.url = url;

    const ev = {
      id: `chat:${session.id}:${act.id}`,
      k: 'chat',
      w: '',
      x: act.x,
      a: isoS(Date.parse(act.at) || Date.now()),
      c: session.id,
    };

    if (!logEvents(url, [ev])) continue;
    const round = prLogs[url].r.at(-1); // a round closed before the chat's line was read: said now

    if (round?.how === 'answered' && !round.by && ANSWERS.has(act.x) && ev.a >= round.from) {
      Object.assign(round, byChat(url, round, isoS(Date.now())));
      bumpLog(url);
    }

    pushRounds(url);
    const age = Date.now() - Date.parse(act.at);

    if (!indexing && !session.silent && ANSWERS.has(act.x) && prTurns[url] && age >= 0 && age < 5 * 60_000) {
      setTimeout(() => queuePr(url, 0), PR_CONFIRM_MS);
    }
  }
}

/** The chat whose answer closed a round: its newest answering act on the PR since the round began. */
export function byChat(url, round, until) {
  const ev = (prLogs[url]?.ev || [])
    .filter(event => event.k === 'chat' && ANSWERS.has(event.x) && event.a >= round.from && event.a <= until)
    .at(-1);

  return ev ? { by: { c: ev.c, x: ev.x, a: ev.a } } : {};
}

/** A PR's rounds, and its ledger's count, onto every chat that names it. */
function pushRounds(url) {
  const rounds = roundsOf(url);
  const rs = JSON.stringify(rounds);
  const logged = loggedOf(url);

  for (const session of sessions.values()) {
    const pr = session.prs.find(candidate => candidate.url === url);

    if (pr && (pr.logged !== logged || JSON.stringify(pr.rounds ?? null) !== rs)) {
      pr.rounds = rounds;
      pr.logged = logged;
      schedulePush(session);
    }
  }
}

/** Who says a PR's alert: the chat touched last of those that mention it, a muted one only when all are (2026-11-02) —
 *  nor a snoozed one (2026-11-24, round XXX): it calls you on nothing. */
export function prAlertChat(chats) {
  const loud = chats.filter(session => !mutedChats[session.id] && !snoozed[session.id]);

  return (loud.length ? loud : chats).reduce(
    (latest, chat) => (!latest || touchedAt(chat) > touchedAt(latest) ? chat : latest),
    null,
  );
}

/** A PR come round to you: one alert, on the chat `prAlertChat` picks. */
export function notifyPr(url, turn, chats) {
  const session = prAlertChat(chats);

  if (!session || indexing) return;

  const sum = summary(session);
  const heading = `Your move · ${session.prs.find(pr => pr.url === url)?.label || url}`;

  const evt = {
    kind: 'pr',
    sessionId: session.id,
    project: sum.project,
    title: sum.title,
    heading,
    snippet: turn.why,
    url,
    ts: new Date().toISOString(),
    ...hushOf(session),
  };

  broadcast('alert', evt);
  if (!evt.quiet) nativeNotify(heading, sum.title, turn.why);
}
