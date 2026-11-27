// ---- ⌥⌘P: the project picker. The board's projects, pinned first; the box filters by name. ----
// ⌥⌘G puts the chat's PRs in the same dialog (state · repo#n · title · age, as #prlist lays them out)
// when it mentions more than one; the box filters by number and title, ⏎ opens the PR as a row click would.
// ⌥⌘K (2026-09-20) fills it with every chat that is ready or clauding — done ones stay out — across all projects, in
// the list's own order (clauding first, then by your last touch); the box searches the same words as the list's
// magnifier (title, project, prompt, branch) but fuzzily, and with something typed the best match leads instead
// (2026-09-21); ⏎ opens the chat, switching project when it lives elsewhere.
// With something typed the done ones are hunted too (2026-11-03), at half their worth (DONE_WORTH), and a PR's link
// alone in the box asks the server about every transcript (namedAsk).
// ⌥⌘N (2026-09-20) is a chat in the one dialog, a step at a time: the project (⌥⌘P's list without ALL),
// then — since 2026-09-21 — that project's open chats, newest by your last touch, with ＋ new chat first; ＋ then asks
// the folder when the project spans several and the environment when the folder's Taskfile launches claude itself, as
// oracle's `task production-workload` does (newChatIn asks the server); ⏎ at the last step starts it.
// ⌥⌘O (2026-09-20) is that flow with the project answered and the environment brought forward: oracle's
// environments first, then *that environment's* open chats with ＋ new chat first (hotOracle). A chat's environment
// is the server's record of the launcher it was started with (`s.env`), so it outlives the drawer; a chat with no
// record — a bare `claude` in the folder, or one from before the record existed — shows under ⌥⌘N, not ⌥⌘O.
// ⌥⌘N's first row is a chat in no folder (2026-10-14): ＋ new chat · no folder starts claude at once in the board's own
// folder (the server's `about.scratch`, made when a chat starts there), so a question that belongs to no repo needs no
// repo picked. It is hunted like the projects — a name typed hides it — and the project in view still takes the
// selection; on ALL the selection starts on it.
// The chats step shows even when the scope has no chats (2026-09-22): ＋ new chat is then the
// whole list, ⏎ starts it, esc walks away. Before, an empty scope skipped the step and the next one spawned a
// terminal with nothing to stop it.
// ---- the pickers' matcher: fuzzy since 2026-09-21 ----------------------------------------------
// The query's letters have to turn up in order, not together: `wapi res` finds *w*allet-*api*
// *res*olvers. Each space-separated word is hunted on its own, so the order you type them in does not matter.
// A run of letters is worth more than scattered ones and a letter starting a word more than one inside it — that
// is what makes `res` find *res*olvers rather than a*r*r*es*t. Every place a word's first letter appears is tried
// as a start and the best of them wins, which is how the run in *res*olvers is found at all. Null = not there.
const WORD_EDGE = /[^a-z0-9]/;

function fuzzScore(text, at) {
  let score = -at[0] / 8; // an earlier start beats a later one, gently

  for (let index = 0; index < at.length; index++) {
    const position = at[index];
    const gap = index ? position - at[index - 1] - 1 : 0; // what the matcher had to skip to get here

    score +=
      1 + (index && !gap ? 10 : 0) - Math.min(5, gap / 3) + (!position || WORD_EDGE.test(text[position - 1]) ? 8 : 0);
  }

  return score;
}

function fuzzWord(text, word) {
  let best = null;

  for (
    let start = text.indexOf(word[0]);
    start >= 0 && start <= text.length - word.length;
    start = text.indexOf(word[0], start + 1)
  ) {
    const at = [start];
    let position = start;

    for (let index = 1; index < word.length; index++) {
      position = text.indexOf(word[index], position + 1);
      if (position < 0) break;
      at.push(position);
    }

    if (position < 0) break; // a later start's letters only land further on: what this one could not find, none can
    const score = fuzzScore(text, at);

    if (!best || score > best.score) best = { score, at };
  }

  return best;
}

// A web address in the box is found whole, never letter by letter (2026-10-28): pasted, it means that one page — as
// itself, or as what the board calls it: GitHub's …/pull/693 (its /files, a comment's #anchor) as the chip's
// `repo#693`, Jira's …/browse/KEY-123 as `KEY-123`. So a PR's URL finds the chat that has it, as its number does, and
// …/pull/69 does not find #693.
const URL_WORD = /^(?:https?:\/\/|(?:www\.)?github\.com\/)/;

function urlForms(word) {
  const gh = /^(?:https?:\/\/)?(?:www\.)?github\.com\/[\w.-]+\/([\w.-]+)\/(?:pull|issues)\/(\d+)\b/.exec(word);
  const jira = /^https?:\/\/[^/]+\/browse\/([a-z][a-z0-9_]*-\d+)\b/.exec(word);

  return gh ? [`${gh[1]}#${gh[2]}`, word] : jira ? [jira[1], word] : [word];
}

// A PR's link alone in ⌥⌘K's box (2026-11-03) is put to every transcript: the chips hold what the boot read of a long
// chat, and on the real board 54 of 123 pr-link lines in done chats lay outside that. The chats it names join the rows
// when the answer lands; ⏎ on no row till then waits for it.
const PR_LINK = /^(?:https?:\/\/)?(?:www\.)?(github\.com\/[\w.-]+\/[\w.-]+\/pull\/[1-9]\d{0,9})(?!\d)\S*$/i;

function namedAsk() {
  const link = pick.mode === 'chat' ? PR_LINK.exec($('#pickq').value.trim())?.[1] : null;

  if (!link) {
    pick.named = null;
    return;
  }

  if (pick.named?.link === link) return;
  const ask = (pick.named = { link, ids: null, err: null, go: false });

  api('GET', `/api/named?pr=${encodeURIComponent(`https://${link}`)}`)
    .then(
      result => {
        ask.ids = result.ids;
      },
      error => {
        ask.ids = [];
        ask.err = error.message;
      },
    )
    .then(() => {
      if (pick.named !== ask || !$('#pick').open) return;
      pickRender(true);
      if (ask.go && pick.list.length) pickChoose(pick.sel);
    });
}

/** The word as it stands, in no longer name (`acme-widgets#6`) or number (`widgets#650`) — scored as fuzzWord
 *  scores the same letters. */
function wholeWord(text, word) {
  for (let index = text.indexOf(word); index >= 0; index = text.indexOf(word, index + 1)) {
    if (/[\w.-]/.test(text[index - 1] || '') || /[a-z0-9]/.test(text[index + word.length] || '')) continue;
    const at = Array.from({ length: word.length }, (_, offset) => index + offset);

    return { score: fuzzScore(text, at), at };
  }

  return null;
}

/** One word of the query hunted in one field: a web address whole, its best form; any other fuzzily. */
function wordIn(text, word) {
  if (!URL_WORD.test(word)) return fuzzWord(text, word);
  return urlForms(word)
    .map(form => wholeWord(text, form))
    .reduce((best, match) => (match && (!best || match.score > best.score) ? match : best), null);
}

/**
 * Every word of the query, each hunted in *one* field — not necessarily the same one, so `wapi res` can take its
 * first word from the project and its second from the title, but neither may be spelled out of letters borrowed
 * from both. Null the moment a word is in none of them.
 *
 * A field's worth falls off down the list (1, ¾, ⅗…), so a name or a branch beats a long prompt that a short
 * word wanders into by accident — without the prompt ceasing to be searchable. A word that only just scraped a
 * match is worth nothing rather than something negative, which would have made the weighting work backwards.
 */
function fuzzy(fields, query) {
  let total = 0;

  for (const word of query.split(/\s+/)) {
    if (!word) continue;
    let best = null;

    for (let index = 0; index < fields.length; index++) {
      const match = fields[index] && wordIn(fields[index].toLowerCase(), word);

      if (!match) continue;
      const score = Math.max(0, match.score) / (1 + index / 3);

      if (best === null || score > best) best = score;
    }

    if (best === null) return null;
    total += best;
  }

  return { score: total };
}

/** Where the query's words landed in one string, for the bolding; a word that matched some other field is simply
 *  not marked here. Runs come back merged by `mark`. */
function fuzzMarks(text, query) {
  const hay = text.toLowerCase();
  let at = [];

  for (const word of query.split(/\s+/)) {
    if (!word) continue;
    const match = wordIn(hay, word);

    if (match) at = at.concat(match.at);
  }

  return [...new Set(at)].sort((left, right) => left - right);
}

/** The text, escaped, with the letters the query landed on in <b> — runs merged, so a word comes out as one <b> and
 *  not one per letter. The pickers' rows, and the cards under the magnifier's query. */
function markHits(text, query) {
  text = String(text ?? '');
  const at = query ? fuzzMarks(text, query) : [];

  if (!at.length) return esc(text);

  let out = '';
  let last = 0;

  for (let index = 0; index < at.length; index++) {
    const from = at[index];
    let to = from + 1;

    while (index + 1 < at.length && at[index + 1] === to) {
      to++;
      index++;
    }

    out += `${esc(text.slice(last, from))}<b>${esc(text.slice(from, to))}</b>`;
    last = to;
  }

  return out + esc(text.slice(last));
}

// gen: which opening of the picker; typed: the chats step's box just typed in; git: the chats step's folder's working
// trees when it is one git checkout (wtOf), wt: its ＋ row on "new worktree", br: the branch typed, as the server found it,
// asking: ⏎ on it waiting for that answer (wtEnter); named: ⌥⌘K's box holding a PR's link, and the chats that name it (namedAsk)
// ag: the chats step's folder's agents (GET /api/agents), agent: the one ＋'s chip has (null: Claude), agentTouched: you
// changed it, unfold: the agent list's folded rows opened (2026-11-06, round XXVIII)
const pick = {
  mode: 'project',
  ctx: {},
  list: [],
  sel: 0,
  gen: 0,
  cloning: false,
  typed: false,
  git: null,
  wt: false,
  br: null,
  asking: false,
  named: null,
  ag: null,
  agLoad: null,
  agent: null,
  agentTouched: false,
  unfold: new Set(),
};

const PICK_HINT = {
  project: 'Project — type to filter · ↑↓ · ⏎ opens · esc',
  pr: ctx =>
    `Pull request — type to filter · ↑↓ · ⏎ opens${ctx.zoom === 'fill' ? ' · ⌥⌘G fills the column' : ctx.zoom === 'back' ? ' · ⌥⌘G gives the column back' : ''} · esc`,
  chat: "A chat — every project · typed, done chats too · or a PR's link · ⏎ · esc",
  new: () =>
    `New chat — a project${folders.roots.length ? `, a folder in ${folders.roots.map(root => homePath(root.dir)).join(' or ')}` : ''}${
      folders.roots.some(root => root.org)
        ? `, a name to clone from ${folders.roots
            .filter(root => root.org)
            .map(root => root.org)
            .join(' or ')}`
        : ''
    }${state.about.scratch ? ', or no folder at all' : ''} · ↑↓ · ⏎ · esc`,
  folder: ctx => `${ctx.then === 'chats' ? 'Which folder' : 'New chat — which folder'}? type to filter · ↑↓ · ⏎ · esc`,
  // named: ⌥⌘O never asked which folder. From ⌥⌘O the environment is a scope (its chats follow); from ⌥⌘N it is the last step.
  env: ctx =>
    ctx.then === 'chats'
      ? `${folderName(ctx.cwd)} — which environment? its open chats, and a new one · ↑↓ · ⏎ · esc`
      : `New chat in ${folderName(ctx.cwd)} — which environment? task <env> from the folder's Taskfile · ↑↓ · ⏎ starts it · esc`,
  chats: ctx =>
    pick.wt && pick.git
      ? `${ctx.name} — the new chat's branch: type its name · ⏎ · esc`
      : `${ctx.name}${ctx.env ? ` · task ${ctx.env}` : ''} — an open chat, or ＋ a new one · type to filter · ↑↓ · ⏎ · esc`,
  base: ctx => `${ctx.branch} — what it starts from · type to filter · ↑↓ · ⏎ · esc`, // a new worktree's new branch (2026-10-28)
  launch: 'Anything — chats, projects, PRs, tickets, actions · ⏎ · esc',
  toggle: 'Switches — ⏎ flips one, the menu stays · ← back · esc',
  prs: "Pull requests — every chat's · ⏎ opens the chat and the PR · ← back · esc",
  chatpick: ctx =>
    ctx.many
      ? `${ctx.ask} — ⏎ takes a chat in or out · ${ctx.picked.length} in · esc`
      : `${ctx.ask} — type to filter · ↑↓ · ⏎ · esc`, // a chat to send to, fold into, merge (2026-10-31)
  agent: ctx => `${ctx.title} — which agent? type to filter · ↑↓ · ⏎ · esc`, // a PR's chat as an agent (2026-11-06)
};

const NO_FOLDER = '＋ new chat — no folder'; // ⌥⌘N's first row (2026-10-14)

const PICK_NOUN = {
  pr: 'PR',
  prs: 'PR',
  chat: 'chat',
  chats: 'chat',
  chatpick: 'chat',
  folder: 'folder',
  env: 'environment',
  launch: 'thing',
  toggle: 'switch',
  base: 'branch',
  agent: 'agent',
}; // for "no … matches"; the rest are projects

const homePath = path => path.replace(/^\/Users\/[^/]+(?=\/|$)/, '~');

const chatState = session =>
  session.done ? 'done' : bucket(session) === 'working' ? 'clauding' : asking(session) ? 'asking' : 'ready';
