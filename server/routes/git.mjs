// Routes: a chat's changes and the working trees of its checkout.
import { BRANCH_NAME, branchWhere, changesOf, changeStat, worktreeBases, worktreesFor } from '../changes.mjs';
import { json, jsonBody, NEXT } from '../http.mjs';
import { sessions } from '../state.mjs';
import { ensureWorktree, linkModules, switchGuard } from '../worktrees.mjs';

/** A chat's changes and the working trees of its checkout: read, made, linked — and whether its folder may switch
 *  branch. */
export async function changeRoutes(req, res, url, path) {
  let match;

  // the changes tab (2026-10-10): the chat's folder's diff in a scope — `pr` with `pr=<n or URL>` (and `base=`) a PR's,
  // from origin's refs (2026-10-13) —, or ?stat=1 for the header's counts
  if (req.method === 'GET' && (match = path.match(/^\/api\/sessions\/([\w-]+)\/changes$/))) {
    const session = sessions.get(match[1]);

    if (!session) return json(res, 404, { error: 'unknown session' });

    const scope = ['uncommitted', 'branch', 'turn', 'pr'].includes(url.searchParams.get('scope'))
      ? url.searchParams.get('scope')
      : 'uncommitted';

    const ask = {
      pr: url.searchParams.get('pr'),
      base: BRANCH_NAME.test(url.searchParams.get('base') || '') ? url.searchParams.get('base') : null,
    }; // scope pr's: which, and against what

    try {
      const result = url.searchParams.get('stat')
        ? await changeStat(session)
        : await changesOf(session, scope, false, ask);

      return json(res, result.error ? 409 : 200, result);
    } catch (error) {
      return json(res, 500, {
        error: String(error.stderr || error.message)
          .trim()
          .split('\n')[0],
      });
    }
  }

  // the working trees of a chat's checkout and the branch each holds (2026-10-13); a tree for a PR's branch or a new
  // one — the one that has it, else made (ensureWorktree); its node_modules linked to the main tree's
  if (req.method === 'GET' && path === '/api/worktrees') {
    try {
      const result = await worktreesFor(url.searchParams.get('cwd'));

      return json(res, result.error ? 409 : 200, result);
    } catch (error) {
      return json(res, 500, {
        error: String(error.stderr || error.message)
          .trim()
          .split('\n')[0],
      });
    }
  }

  if (req.method === 'GET' && path === '/api/worktrees/branch') {
    // a new chat's branch, as its name is typed: where it is already
    try {
      const result = await branchWhere(url.searchParams.get('cwd'), url.searchParams.get('name') || '');

      return json(res, result.error ? 409 : 200, result);
    } catch (error) {
      return json(res, 500, {
        error: String(error.stderr || error.message)
          .trim()
          .split('\n')[0],
      });
    }
  }

  if (req.method === 'GET' && path === '/api/worktrees/bases') {
    // what a new chat's new branch may start from (2026-10-28)
    try {
      const result = await worktreeBases(url.searchParams.get('cwd'));

      return json(res, result.error ? 409 : 200, result);
    } catch (error) {
      return json(res, 500, {
        error: String(error.stderr || error.message)
          .trim()
          .split('\n')[0],
      });
    }
  }

  if (req.method === 'POST' && path === '/api/worktrees') {
    const body = await jsonBody(req);

    const result = await ensureWorktree({
      cwd: typeof body.cwd === 'string' ? body.cwd : null,
      pr: typeof body.pr === 'string' || typeof body.pr === 'number' ? String(body.pr) : null,
      branch: typeof body.branch === 'string' ? body.branch : null,
      detach: body.detach === true,
      fresh: body.fresh === true,
      share: body.share === true,
      base: typeof body.base === 'string' ? body.base : null,
    }).catch(error => ({ code: 500, error: error.message }));

    return json(res, result.error ? result.code || 500 : 200, result);
  }

  if (req.method === 'POST' && path === '/api/worktrees/modules') {
    const body = await jsonBody(req);

    const result = await linkModules(typeof body.path === 'string' ? body.path : null).catch(error => ({
      code: 500,
      error: error.message,
    }));

    return json(res, result.error ? result.code || 500 : 200, result);
  }

  // whether the chat's folder may be switched to a branch — the board types `git switch` into its zsh, unrun, only then
  if (req.method === 'GET' && (match = path.match(/^\/api\/sessions\/([\w-]+)\/switch$/))) {
    const session = sessions.get(match[1]);

    if (!session) return json(res, 404, { error: 'unknown session' });
    const branch = url.searchParams.get('branch') || '';

    if (!BRANCH_NAME.test(branch)) return json(res, 400, { error: 'which branch?' });
    return json(res, 200, await switchGuard(session, branch).catch(error => ({ ok: false, why: [error.message] })));
  }

  return NEXT;
}
