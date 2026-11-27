// ---- ⌥⌘N's ＋ on "new worktree" (2026-10-13) --------------------------------------------------------------------------
// The chats step of a git checkout: ＋ in this folder, or in a worktree of its own on the branch typed — made inside
// the repo, so the chat shares no files with another. The row says what ⏎ would do as the name is typed (brAsk → GET
// /api/worktrees/branch): a new branch; one here or on origin, checked out in a new worktree; or one out in a tree
// already, which the chat would share — said in red, and only then asked for (`share`; the server refuses it
// otherwise). A new branch asks what it starts from first (2026-10-28, baseStep): the default branch selected, so ⏎ ⏎
// is the common case.
const BRANCH_OK = /^(?!-)(?!.*\.\.)[\w./-]{1,200}$/; // the server's BRANCH_NAME; git's own rule is the server's answer

/** ＋'s switch: false when there is none or it is there already. */
function pickWt(on) {
  if (!pick.git || pick.wt === on) return false;
  pick.wt = on;
  pick.sel = 0;
  pickHint();
  pickRender();
  brAsk();
  return true;
}

/** ＋'s words on "new worktree" for the name typed: [the row's html, what ⏎ would do, a tone]. */
function wtSay(name) {
  const from = pick.git.dflt || 'main';

  if (!name) {
    return [
      '＋ new chat in a new worktree',
      `type a branch name — for a new one, ⏎ asks what it starts from, ${from} first`,
      '',
    ];
  }

  const rowHtml = `＋ new chat on <b>${esc(name)}</b>`;
  const where = pick.br?.name === name ? pick.br.v : null;

  if (!BRANCH_OK.test(name) || where?.ok === false) return [rowHtml, 'not a name git takes for a branch', 'bad'];
  if (!where) return [rowHtml, '', '']; // asked: the answer redraws the row
  if (where.error) return [rowHtml, where.error, 'bad'];
  const live = where.live ? ` — ${where.live} chat${where.live === 1 ? '' : 's'} at work there` : '';

  if (where.tree) {
    return [
      rowHtml,
      where.main
        ? `already ${folderName(where.tree)}'s own branch: ⏎ shares that folder${live}`
        : `already out in ${treeName(pick.git, where.tree)}: ⏎ shares that worktree${live}`,
      'warn',
    ];
  }

  if (where.local) return [rowHtml, 'a branch here, checked out in a worktree of its own', ''];
  if (where.origin) return [rowHtml, `origin's branch, in a worktree of its own tracking it`, ''];
  return [rowHtml, `a new branch in a worktree of its own — ⏎ asks what it starts from, ${from} first`, ''];
}

let brTimer = 0;

/** The branch typed on "new worktree", asked of the server a beat after the last key: where it is already. */
function brAsk() {
  clearTimeout(brTimer);

  const name = boxText();
  const cwd = pick.ctx.cwds?.[0];
  const gen = pick.gen;

  if (pick.mode !== 'chats' || !pick.wt || !pick.git || !BRANCH_OK.test(name) || pick.br?.name === name) return;

  brTimer = setTimeout(async () => {
    const where = await api(
      'GET',
      `/api/worktrees/branch?cwd=${encodeURIComponent(cwd)}&name=${encodeURIComponent(name)}`,
    ).catch(error => ({ error: error.message }));

    if (gen !== pick.gen || !$('#pick').open || boxText() !== name) return;
    pick.br = { name, v: where };
    pickRender(true);
  }, 120);
}

/** ⏎ on ＋ "new worktree": a branch that is here, on origin or out in a tree already is checked out (or shared) at once;
 *  a new one asks what it starts from first (2026-10-28) — where the name is is asked now if the row has no answer yet. */
async function wtEnter(cwd, name) {
  const box = $('#pickq');
  const gen = pick.gen;

  if (!name) return note(box, 'Type the branch’s name first', true);
  if (!BRANCH_OK.test(name)) return note(box, `${name} is not a name git takes for a branch`, true);
  let where = pick.br?.name === name ? pick.br.v : null;

  if (!where) {
    if (pick.asking) return; // ⏎ again while the first is asked: one answer
    clearTimeout(brTimer);
    pick.asking = true;

    where = await api('GET', `/api/worktrees/branch?cwd=${encodeURIComponent(cwd)}&name=${encodeURIComponent(name)}`)
      .catch(error => ({ error: error.message }))
      .finally(() => {
        pick.asking = false;
      });

    if (gen !== pick.gen || !$('#pick').open || boxText() !== name) return;
    pick.br = { name, v: where };
    pickRender(true);
  }

  if (where.ok === false) return note(box, `${name} is not a name git takes for a branch`, true);
  if (where.error) return note(box, where.error, true);

  if (where.local || where.origin || where.tree) {
    return newChatOnBranch(cwd, name, { share: !!where.tree, agent: agentGo() });
  }

  baseStep(cwd, name, pick.ctx, where, agentGo());
}

/** The base step: the checkout's branches and origin's (GET /api/worktrees/bases), the one ⏎ takes first — origin's
 *  default branch, or this checkout's when it is ahead. ← or ⌫ on an empty box goes back to the name, as typed. */
async function baseStep(cwd, name, chats, br, agent) {
  // `agent`: the chip's, carried to the chat and back (2026-11-06)
  const had = { agent: pick.agent, agentTouched: pick.agentTouched };

  const back = () => {
    pickOpen('chats', chats);
    Object.assign(pick, had);
    $('#pickq').value = name;
    pick.br = { name, v: br };
    pickWt(true);
  };

  pickOpen('base', { cwd, branch: name, bases: null, dflt: br.dflt, back, agent });

  const gen = pick.gen;

  const listing = await api('GET', `/api/worktrees/bases?cwd=${encodeURIComponent(cwd)}`).catch(error => ({
    error: error.message,
  }));

  if (gen !== pick.gen || !$('#pick').open) return;

  if (listing.error) {
    pick.ctx.err = listing.error;
    return pickRender();
  }

  Object.assign(pick.ctx, { bases: listing.branches || [], dflt: listing.dflt || br.dflt });

  pick.sel = Math.max(
    0,
    pick.ctx.bases.findIndex(base => base.ref === listing.prefer),
  );

  pickRender();
  if (pick.ctx.go && !$('#pickq').value.trim()) pickChoose(pick.sel);
}

/** The worktree made — from `base` when the branch is new — and the chat started in it; `share`: a tree that has it out. */
const wtStarting = new Set(); // the branches a chat is being started on (2026-11-04): the picker left and the same asked again is the same ask, not a second chat

async function newChatOnBranch(cwd, name, { base = null, share = false, agent } = {}) {
  const key = `${cwd}\0${name}`;

  if (wtStarting.has(key)) {
    $('#pick').close();
    return note($('#shead'), `Already starting a chat on ${name} — it opens once its worktree is there`);
  }

  wtStarting.add(key);

  const box = $('#pickq');
  const was = box.value;
  const short = base && base.replace(/^refs\/(heads|remotes)\//, '');
  const run = ++pick.gen;

  box.disabled = true;
  pick.cloning = true;
  box.value = '';

  box.placeholder = share
    ? `starting a chat on ${name}…`
    : `making a worktree for ${name}${short ? ` from ${short}` : ''}…`;

  try {
    let tree;

    try {
      tree = await api('POST', '/api/worktrees', { cwd, branch: name, fresh: true, share, ...(base && { base }) });
    } catch (error) {
      if (run !== pick.gen || !$('#pick').open) {
        return note($('#shead'), `Could not make a worktree for ${name}: ${error.message}`, true);
      } // the picker left meanwhile: its box is another step's now

      pick.cloning = false;
      box.disabled = false;
      box.value = was;
      pickHint();

      if (error.body?.out && pick.mode === 'chats') {
        pick.br = null;
        brAsk();
      } // out in a tree since the row last looked: it says so now, and ⏎ again shares it

      pickRender();
      box.focus();
      return note(box, error.message, true);
    }

    wtData.delete(cwd);
    if (run === pick.gen) $('#pick').close();
    await newChat(tree.path, null, withAgent(agent));

    if (tree.unasked) {
      note(
        $('#shead'),
        `Origin did not answer: ${name} starts from ${tree.from.replace(/^refs\/(heads|remotes)\//, '')}, unchecked against its branches`,
        true,
      );
    }
  } finally {
    wtStarting.delete(key);
  }
}
