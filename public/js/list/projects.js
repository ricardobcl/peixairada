// ---- projects ----------------------------------------------------------------------
// A project is a folder — the registry cwd, which is the stable repo path — or a name you gave to
// a set of folders (multi-repo work, an investigation). A chat lives in its folder and in every
// custom project that claims that folder. "ALL" is the flat list, newest first.
const ALL = 'all';
const inFolder = (cwd, f) => !!cwd && (cwd === f || cwd.startsWith(f.replace(/\/$/, '') + '/'));
// A chat in a worktree inside a repo, `<repo>/.claude/worktrees/<name>`, is the repo's (2026-10-13): a folder project
// is keyed by the repo, so its pins, its hiding, its name and its chats are the repo's — a named project took it by
// its prefix already (inFolder), and its colour by the repo's name (colorKey). Its branch is a chip on its card.
const projDir = cwd => (cwd ? cwd.replace(/\/\.claude\/worktrees\/[^/]+(?:\/.*)?$/, '') : cwd);
const inProject = (s, p) =>
  p.key === ALL || (p.custom ? p.cwds.some(f => inFolder(s.cwd, f)) : (projDir(s.cwd) || '?') === p.key);
const scopedOn = s => !!s.cwd && prefs.project !== ALL && inProject(s, projectStub(prefs.project)); // the list narrowed to what holds this chat, a folder or a named set
const REPO_FUN =
  '<svg class="fun" viewBox="0 0 16 16" aria-hidden="true"><path d="M1.75 2.5h12.5a.5.5 0 0 1 .38.82L10 8.9v4.35a.5.5 0 0 1-.28.45l-2.5 1.2A.5.5 0 0 1 6.5 14.45V8.9L1.37 3.32a.5.5 0 0 1 .38-.82Z" /></svg>';
const projectStub = key =>
  key === ALL
    ? { key }
    : key.startsWith('c:')
      ? { key, custom: true, cwds: state.projects.find(p => 'c:' + p.id === key)?.cwds || [] }
      : { key };
// The same rules as the lane board had: empty live panels and stale chats older than 30 days hide unless asked.
// Taken off the board by ⌥⌘N's ✕ (2026-09-22): the key is a folder's cwd or `c:<id>`, the pins' own spelling, and the
// server keeps the list (state.json), so every browser and the app agree. It takes the row out of every picker (and,
// while there was one, the projects column) — the chats themselves are untouched and still show under ALL, because
// hiding a folder is tidying an index, not throwing work away. The cog is the way back.
const isHidden = key => state.hidden.includes(key);
// A live chat with no transcript yet is a card too, when it is yours to type into (2026-09-27): the
// drawer's — ＋, or /clear, which gives the process a new id and an empty chat — and a claude in a terminal
// elsewhere. VS Code's empty panels stay hidden: it mounts one per tab it restores, and none of them was ever asked
// anything. The card's time and place are the chat's start (`startedAt`, the server's), until a first word lands.
// Ticked done, an empty chat is gone at once (2026-09-27): Done ends its claude, and there is nothing in it to read
// or resume.
function visible(s) {
  if (s.removed) return false; // deleted from the board (2026-11-04): only ⌥⌘K, typed, finds it
  if (!s.lastActivity) return s.alive && !s.done && !inVsCode(s);
  if (!s.alive && !s.done && Date.now() - new Date(s.lastActivity) > STALE_MAX_AGE_MS) return false;
  return true;
}
// One order everywhere: the chat whose last *word* is newest first — yours or Claude's, whichever came later
// (2026-09-27; your last touch alone before, so a reply landing did not move a card). Yours is a prompt, an answer to
// its question, an interrupt; Claude's is the reply that ends a turn — not each tool call on the way, so a clauding
// card does not climb with every step. A session whose tail held neither (boot reads only the end of a long
// transcript) falls back to its last activity, not the bottom.
// A PR come round to you is a word too (2026-09-28): the chat rises to the top of its group, under today's line, from
// when the board learnt of the move (the server's turn.movedAt) — the server's copy agrees.
// Not on a chat done for good (2026-10-11): its PRs are forgotten.
// A snooze ended by itself is one too (2026-11-24, round XXX's H1: the server's `wokeAt`): back at the top of its lane.
const movedAt = s =>
  s.forGood ? '' : (s.prs || []).reduce((m, p) => (p.turn?.you && p.turn.movedAt > m ? p.turn.movedAt : m), '');
// Kept per summary (a new object with every update): the sort asked it twice a comparison, a thousand times a render.
const words = new WeakMap();
const wordAt = s => {
  let w = words.get(s);
  if (w === undefined) {
    const u = String(s.lastUserAt || ''),
      r = String(s.lastReplyAt || ''),
      m = movedAt(s);
    w = (u > r ? u : r) || String(s.lastActivity || '') || String(s.startedAt || '');
    if (m > w) w = m;
    if (String(s.wokeAt || '') > w) w = String(s.wokeAt);
    words.set(s, w);
  }
  return w;
}; // an empty chat: its start
const byWord = (a, b) => {
  const x = wordAt(a),
    y = wordAt(b);
  return x < y ? 1 : x > y ? -1 : 0;
}; // ISO strings: no collation needed
const timeTip = s =>
  !s.lastActivity
    ? s.startedAt
      ? `started ${rel(s.startedAt)} ago · no messages yet`
      : ''
    : `last activity ${rel(s.lastActivity)} ago${s.lastUserAt ? ` · you last wrote ${rel(s.lastUserAt)} ago` : ''}${s.lastReplyAt ? ` · Claude last replied ${rel(s.lastReplyAt)} ago` : ''}${movedAt(s) ? ` · a PR came round to you ${rel(movedAt(s))} ago` : ''}`;
// Three states since 2026-09-20, and done is *only* the tick (asked later that day; the first cut folded
// stale into done): a chat with no live process is ready — resume it and it carries on. The dot still says
// stale in grey and the card is dimmed a touch, so you know a resume is coming before you click. Clauding
// is working; ready is everything else, a pending question included (the card still says *asking you*).
// The server keeps the finer statuses for notifications and the app's badge.
const bucket = s => (s.done ? 'done' : s.status === 'working' ? 'working' : 'ready');
// The two states that live *inside* a bucket and the card draws its edge from: a question waiting on your answer
// (still a ready chat — the filters see 'ready'), and a monitor or background command of its own still running.
const asking = s => s.alive && !s.done && s.status === 'needs-input';
// A muted chat keeps its card's truth, the red edge too, and calls you on nothing else (2026-11-02): not the Dock, the
// title, the menu bar, Next, the bar's red, the lines of news or Zé's game.
const askingLoud = s => asking(s) && !s.muted;
