// PRs mentioned in a chat: pr-link lines, pull URLs, a `gh pr create`'s own output; one taken off.
import { open as openFile } from 'node:fs/promises';
import { ACTS_MAX } from './acts.mjs';
import { isoS, loggedOf, roundsOf } from './ledger.mjs';
import { noPr, refsIn } from './refs.mjs';
import { prStatus, queuePr } from './status.mjs';
import { indexing, sessions, unlinked } from '../state.mjs';
import { plainSnippet, resultText } from '../transcript/text.mjs';

// ---- PRs mentioned in the chat ------------------------------------------------------------
// Claude Code writes a `pr-link` line when it opens one, but most PRs are just URLs someone typed
// or Claude wrote, so message text is scanned too. Only message text: tool results are snipped to
// 200 chars and half a URL would name the wrong PR.
// The number is one GraphQL's Int takes (2026-10-14): `pull/012` was a syntax error in the query and one past 2^31−1 an
// invalid value — either failed the whole batch, its PRs unasked and asked again together on every sweep.
export const PR_RE = /https?:\/\/(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+)\/pull\/([1-9]\d{0,9})(?!\d)/g;
export const PR_ONE = new RegExp(PR_RE.source); // same pattern, no /g — safe to reuse for a single match

export const prMatch = url => {
  const match = PR_ONE.exec(url);

  return match && Number(match[3]) <= 2147483647 ? match : null;
};

const MAX_PRS = 40;

// Which chats name a PR, whatever the board read of them (2026-11-03; ⌥⌘K with a link in its box): the boot reads a long
// transcript's two ends, so the chips miss what the middle said, and those PRs must not become chips — every PR a chat
// has un-ticks it when it moves. So the bytes are read when asked, nothing kept: 2.7 GB in about a second, the server's
// loop never held over 11 ms (measured then). Any mention counts, a tool's output too: the link is that one page.
const NAMING_CHUNK = 1 << 20;
const NAMING_AT_ONCE = 4;

/** Whether the file holds the PR's link: `/pull/<n>`, not more digits after it, `where` (lower-case) before it, in any case. */
async function fileNames(file, where, tail) {
  const keep = where.length + tail.length + 1; // a link cut by a chunk's end, and the byte after it, are whole in the next

  const buf = Buffer.allocUnsafe(NAMING_CHUNK + keep);
  const fh = await openFile(file, 'r');

  try {
    for (let have = 0; ;) {
      const { bytesRead } = await fh.read(buf, have, NAMING_CHUNK);

      if (!bytesRead) return false;

      const end = have + bytesRead;
      const hay = buf.subarray(0, end);

      for (let index = hay.indexOf(tail); index >= 0; index = hay.indexOf(tail, index + 1)) {
        const after = hay[index + tail.length]; // none yet at the end of what was read: no match here, and the next chunk has it whole

        if (
          (after < 48 || after > 57) &&
          index >= where.length &&
          hay.toString('latin1', index - where.length, index).toLowerCase() === where
        ) {
          return true;
        }
      }

      have = Math.min(end, keep);
      buf.copy(buf, 0, end - have, end);
    }
  } finally {
    await fh.close();
  }
}

export async function chatsNaming(owner, repo, number) {
  const where = `github.com/${owner}/${repo}`.toLowerCase();
  const tail = Buffer.from(`/pull/${number}`);

  const todo = [...sessions.values()].filter(session => session.file);
  const ids = [];

  await Promise.all(
    Array.from({ length: NAMING_AT_ONCE }, async () => {
      for (let session; (session = todo.pop());) {
        if (await fileNames(session.file, where, tail).catch(() => false)) ids.push(session.id);
      } // a file gone since: not a chat that names it
    }),
  );

  return ids;
}

/**
 * Record one sighting: `by` is who said it ('user' / 'claude'), or null for a `pr-link` line — Claude
 * Code writes several of those per PR, so they order the list and date it but do not count as mentions.
 * Most recently mentioned first, so the header leads with the PR in play now. `ref` is how a short reference named it
 * (`bare`, a `#12`; `repo`, with its repo — see below); a URL or a pr-link line has none, and makes the PR the chat's
 * whatever GitHub says. The chat's own PRs are marked in the order it made them its own (2026-10-27): `linked` at its
 * first pr-link line, `named` at the first time you named it — what titles the chat (prTitle). Past MAX_PRS the oldest
 * PR it only heard of goes, never one of its own (a listing of sixty PRs pushed out the one the chat was about), and is
 * kept aside whole (`prsGone`), so naming it again brings it back as it was, its first sighting with it.
 */
/** A PR's one spelling: GitHub's owner and repo names are any case, so `Acme/Widgets` and `acme/widgets` were two PRs —
 *  two chips, two turns, two alerts for one move (2026-10-03). The label keeps the case first seen. */
export const prKey = (owner, repo, number) =>
  `https://github.com/${owner.toLowerCase()}/${repo.toLowerCase()}/pull/${number}`;

export function notePr(session, url, ts, by, ref = null) {
  const match = prMatch(url);

  if (!match && (ref || !/^https?:\/\//i.test(url))) return; // a pr-link that is no web address is nothing to put in an href
  const clean = match ? prKey(match[1], match[2], match[3]) : url;

  if (ref && noPr.has(clean)) return;

  const at = session.prs.findIndex(entry => entry.url === clean);
  const off = unlinked[session.id]?.[clean];

  if (off && at < 0 && !(by === 'user' && ts > off)) return; // taken off the chat, and not named by you since
  const gone = at < 0 && session.prsGone?.get(clean);

  if (gone) session.prsGone.delete(clean);

  const pr =
    at >= 0
      ? session.prs.splice(at, 1)[0]
      : gone || {
          url: clean,
          repo: match ? match[2] : null,
          number: match ? Number(match[3]) : null,
          // The owner rarely disambiguates and eats half the width of the chip; the URL is in the tooltip.
          label: match ? `${match[2]}#${match[3]}` : clean.replace(/^https?:\/\/(www\.)?github\.com\//, ''),
          count: 0,
          by: null,
          firstAt: session.prsHeard.get(clean) ?? ts,
          ref,
          linked: null,
          named: null,
        };

  session.prsHeard.delete(clean);

  if (at < 0) {
    // what GitHub has said of it since, a PR put aside included
    const status = prStatus.get(clean);

    Object.assign(pr, {
      state: status?.state ?? null,
      title: status?.title ?? null,
      turn: status?.turn ?? null,
      people: status?.people ?? null,
      checks: status?.checks ?? null,
      refs: status?.refs ?? null,
      updated: status?.updated ?? null,
      review: status?.review ?? null,
      rounds: roundsOf(clean),
      logged: loggedOf(clean),
    });
  }

  if (!ref) pr.ref = null;
  else if (ref === 'repo' && pr.ref) pr.ref = 'repo';

  if (by) {
    pr.count++;
    pr.by = by;
  }

  const seq = ++session.prSeq;

  if (by == null) pr.linked ??= seq;
  else if (by === 'user') pr.named ??= seq;
  pr.lastAt = ts || pr.lastAt || null;
  session.prs.unshift(pr);

  if (session.prs.length > MAX_PRS) {
    const index = session.prs.findLastIndex(entry => entry.linked == null && entry.named == null);
    const [out] = session.prs.splice(index >= 0 ? index : session.prs.length - 1, 1);

    (session.prsGone ||= new Map()).set(out.url, out);
  }

  if (!indexing) queuePr(clean); // at boot this would ask GitHub about every PR in every transcript
}

/** The PRs a Bash call of the chat's opened (2026-10-27): a command that runs `gh pr create` — first in a command, in a
 *  loop over repos, a `$(…)`, a `bash -c` —, and every PR URL its output printed, once it ended without an error, is the
 *  chat's own as a pr-link line makes one: Claude Code writes none for most of a loop's. Only where a command starts: a
 *  script, a grep or a regex with the words in it opened nothing. */
const OPENS_RE = /(?:^|[;&|({`\n]|\$\(|\b(?:do|then|else|xargs)\s|-c\s+['"])\s*(?:\w+=\S*\s+)*gh\s+pr\s+create\b/;

export function noteOpening(session, block, ts) {
  if (!block.id || !OPENS_RE.test(block.input?.command || '')) return;
  session.opening.set(block.id, ts);
  if (session.opening.size > ACTS_MAX) session.opening.delete(session.opening.keys().next().value);
}

export function noteOpened(session, block) {
  const at = session.opening.get(block.tool_use_id);

  if (at === undefined) return;
  session.opening.delete(block.tool_use_id);

  if (!block.is_error) {
    for (const match of resultText(block).matchAll(PR_RE)) if (prMatch(match[0])) notePr(session, match[0], at, null);
  }
}

/** Take a PR off a chat (2026-10-11): gone from its chips, its title, its turn and its polls, and kept off (`unlinked`). */
export function unlinkPr(session, url) {
  const at = session.prs.findIndex(pr => pr.url === url);

  if (at < 0) return false;
  session.prs.splice(at, 1);
  (unlinked[session.id] ||= {})[url] = new Date().toISOString();
  return true;
}

/** Scan one message, in the order it says things. A PR said twice in it counts once, where first said, and as the
 *  fullest of the ways it was said: a URL, then a short reference with its repo, then a bare `#12`. */
const SAID_AS = { bare: 1, repo: 2 };
// A listing (2026-10-27): Claude naming LIST_MIN PRs or more at once, most of them new to the chat — the state of your
// open PRs, a Slack digest, what a project has open — is an answer about other work, and it put every one of them on the
// chat: its chips, their turns un-ticking it, their alerts. It touches no PR; its new ones are only heard of
// (`prsHeard`), so a report on the chat's own PRs — mostly ones it has, or listed before — counts as any text does, the
// second report of a review that the boot read from its first. So does a list you paste.
const LIST_MIN = 10;

export function notePrs(session, text, ts, by) {
  if (!text) return;
  text = String(text);
  const said = new Map();

  const urls = text.includes('/pull/')
    ? [...text.matchAll(PR_RE)]
        .filter(match => prMatch(match[0]))
        .map(match => ({ at: match.index, url: match[0], key: prKey(match[1], match[2], match[3]), ref: null }))
    : [];

  for (const mention of [...urls, ...(text.includes('#') ? refsIn(session, text) : [])].sort(
    (left, right) => left.at - right.at,
  )) {
    const first = said.get(mention.key);

    if (!first) said.set(mention.key, mention);
    else if ((SAID_AS[mention.ref] ?? 3) > (SAID_AS[first.ref] ?? 3)) {
      Object.assign(first, { url: mention.url, ref: mention.ref });
    }
  }

  if (by === 'claude' && said.size >= LIST_MIN) {
    const fresh = [...said.keys()].filter(
      key => !session.prs.some(pr => pr.url === key) && !session.prsGone?.has(key) && !session.prsHeard.has(key),
    );

    if (fresh.length * 2 > said.size) {
      for (const key of fresh) session.prsHeard.set(key, ts);
      return;
    }
  }

  for (const mention of said.values()) notePr(session, mention.url, ts, by, mention.ref);

  // your words that name its PRs, for their history beside GitHub's (2026-10-15: the pointer on a card's PRs)
  if (by === 'user' && said.size && ts) {
    (session.prSaid ||= []).push({
      a: isoS(Date.parse(ts) || Date.now()),
      text: plainSnippet(text, 160),
      urls: [...said.keys()],
    });

    if (session.prSaid.length > 8) session.prSaid.shift();
  }
}
