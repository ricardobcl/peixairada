// Routes: a chat's changes and the working trees of its checkout.
import { BRANCH_NAME, branchWhere, changesOf, changeStat, worktreeBases, worktreesFor } from '../changes.mjs';
import { json, jsonBody, NEXT } from '../http.mjs';
import { sessions } from '../state.mjs';
import { ensureWorktree, linkModules, switchGuard } from '../worktrees.mjs';

/** A chat's changes and the working trees of its checkout: read, made, linked — and whether its folder may switch
 *  branch. */
export async function changeRoutes(req, res, url, p) {
  let m;
  // the changes tab (2026-10-10): the chat's folder's diff in a scope — `pr` with `pr=<n or URL>` (and `base=`) a PR's,
  // from origin's refs (2026-10-13) —, or ?stat=1 for the header's counts
  if (req.method === 'GET' && (m = p.match(/^\/api\/sessions\/([\w-]+)\/changes$/))) {
    const s = sessions.get(m[1]);
    if (!s) return json(res, 404, { error: 'unknown session' });
    const scope = ['uncommitted', 'branch', 'turn', 'pr'].includes(url.searchParams.get('scope'))
      ? url.searchParams.get('scope')
      : 'uncommitted';
    const ask = {
      pr: url.searchParams.get('pr'),
      base: BRANCH_NAME.test(url.searchParams.get('base') || '') ? url.searchParams.get('base') : null,
    }; // scope pr's: which, and against what
    try {
      const r = url.searchParams.get('stat') ? await changeStat(s) : await changesOf(s, scope, false, ask);
      return json(res, r.error ? 409 : 200, r);
    } catch (e) {
      return json(res, 500, {
        error: String(e.stderr || e.message)
          .trim()
          .split('\n')[0],
      });
    }
  }
  // the working trees of a chat's checkout and the branch each holds (2026-10-13); a tree for a PR's branch or a new
  // one — the one that has it, else made (ensureWorktree); its node_modules linked to the main tree's
  if (req.method === 'GET' && p === '/api/worktrees') {
    try {
      const r = await worktreesFor(url.searchParams.get('cwd'));
      return json(res, r.error ? 409 : 200, r);
    } catch (e) {
      return json(res, 500, {
        error: String(e.stderr || e.message)
          .trim()
          .split('\n')[0],
      });
    }
  }
  if (req.method === 'GET' && p === '/api/worktrees/branch') {
    // a new chat's branch, as its name is typed: where it is already
    try {
      const r = await branchWhere(url.searchParams.get('cwd'), url.searchParams.get('name') || '');
      return json(res, r.error ? 409 : 200, r);
    } catch (e) {
      return json(res, 500, {
        error: String(e.stderr || e.message)
          .trim()
          .split('\n')[0],
      });
    }
  }
  if (req.method === 'GET' && p === '/api/worktrees/bases') {
    // what a new chat's new branch may start from (2026-10-28)
    try {
      const r = await worktreeBases(url.searchParams.get('cwd'));
      return json(res, r.error ? 409 : 200, r);
    } catch (e) {
      return json(res, 500, {
        error: String(e.stderr || e.message)
          .trim()
          .split('\n')[0],
      });
    }
  }
  if (req.method === 'POST' && p === '/api/worktrees') {
    const b = await jsonBody(req);
    const r = await ensureWorktree({
      cwd: typeof b.cwd === 'string' ? b.cwd : null,
      pr: typeof b.pr === 'string' || typeof b.pr === 'number' ? String(b.pr) : null,
      branch: typeof b.branch === 'string' ? b.branch : null,
      detach: b.detach === true,
      fresh: b.fresh === true,
      share: b.share === true,
      base: typeof b.base === 'string' ? b.base : null,
    }).catch(e => ({ code: 500, error: e.message }));
    return json(res, r.error ? r.code || 500 : 200, r);
  }
  if (req.method === 'POST' && p === '/api/worktrees/modules') {
    const b = await jsonBody(req),
      r = await linkModules(typeof b.path === 'string' ? b.path : null).catch(e => ({ code: 500, error: e.message }));
    return json(res, r.error ? r.code || 500 : 200, r);
  }
  // whether the chat's folder may be switched to a branch — the board types `git switch` into its zsh, unrun, only then
  if (req.method === 'GET' && (m = p.match(/^\/api\/sessions\/([\w-]+)\/switch$/))) {
    const s = sessions.get(m[1]);
    if (!s) return json(res, 404, { error: 'unknown session' });
    const branch = url.searchParams.get('branch') || '';
    if (!BRANCH_NAME.test(branch)) return json(res, 400, { error: 'which branch?' });
    return json(res, 200, await switchGuard(s, branch).catch(e => ({ ok: false, why: [e.message] })));
  }
  return NEXT;
}
