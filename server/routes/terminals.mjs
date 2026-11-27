// Routes: drawers — a zsh, what a new chat can start with, a new chat, attach, resume, branch, take over, end.
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { SCRATCH_DIR } from '../env.mjs';
import { cloneRepo, rootFolders } from '../folders.mjs';
import { json, jsonBody, NEXT } from '../http.mjs';
import { addLink, placeholder } from '../links.mjs';
import { loadRegistry } from '../registry.mjs';
import { boardConfig, tildePath } from '../setup.mjs';
import { putBackOnBoard, removedMarks, removing, sessions } from '../state.mjs';
import { AGENT_NAME, agentsFor } from '../terminals/chat-agents.mjs';
import { claudeTrusts, launchersFor, TASK_NAME, taskfileOf } from '../terminals/launchers.mjs';
import { killTerm, spawnOnce, spawnTerm } from '../terminals/spawn.mjs';
import {
  endClaude,
  jobOf,
  shellOf,
  termOf,
  terms,
  TERMS_DIR,
  termsAvailable,
  termSummary,
} from '../terminals/terms.mjs';

/** ⌥⌘T and ⌘T: a zsh in the chat's folder. */
export async function shellRoute(req, res, url, path) {
  let match;

  // ⌥⌘T: a zsh in the chat's folder, in the pane's zsh tab — a holder like the claude one (`zsh -l -i` in the PTY),
  // alive until `exit` or a DELETE. The inline "new tab in iTerm" (2026-09-20): the chat's zsh, started once and
  // answered with ever after — and `fresh` (⌘T, 2026-10-13) another one beside it, every time: a second zsh harms
  // nothing, so it is not one spawn at a time as the first is.
  if (req.method === 'POST' && (match = path.match(/^\/api\/sessions\/([\w-]+)\/shell$/))) {
    const session = sessions.get(match[1]);

    if (!session) return json(res, 404, { error: 'unknown session' });

    const body = await jsonBody(req);

    const spec = {
      cwd: session.live?.cwd || session.cwd,
      sessionId: session.id,
      cols: body.cols,
      rows: body.rows,
      shell: true,
    };

    // the in-app editor's vim (2026-10-21): in the chat's folder, or `dir` — a worktree of its PR's branch —, one start
    // per folder at a time; the page shows one it has before asking for another
    if (body.vim === true) {
      if (typeof body.dir === 'string' && body.dir) {
        if (!isAbsolute(body.dir)) return json(res, 400, { error: 'dir must be an absolute path' });
        spec.cwd = body.dir;
      }

      const spawned = await spawnOnce(`${session.id}:vim:${spec.cwd}`, () => spawnTerm({ ...spec, editor: 'vim' }));

      return json(res, spawned.code, spawned);
    }

    if (body.fresh === true) {
      const spawned = await spawnTerm(spec);

      return json(res, spawned.code, spawned);
    }

    const have = shellOf(session);

    if (have && have.exited === null) return json(res, 200, { terminal: termSummary(have) });
    const result = await spawnOnce(`${session.id}:shell`, () => spawnTerm(spec));

    return json(res, result.code, result);
  }

  return NEXT;
}

/** What a new chat can start with: the drawers, a folder's launchers and agents, the roots' folders, a clone. */
export async function startRoutes(req, res, url, path) {
  if (req.method === 'GET' && path === '/api/terminals') {
    return json(res, 200, {
      terminals: [...terms.values()].map(termSummary),
      available: termsAvailable(),
      dir: TERMS_DIR,
    });
  }

  if (req.method === 'GET' && path === '/api/launchers') {
    // the folder's Taskfile tasks that launch claude, if any (see launchersFor)
    const cwd = url.searchParams.get('cwd') || '';

    if (!cwd.startsWith('/')) return json(res, 400, { error: 'cwd must be an absolute path' });
    return json(res, 200, {
      cwd,
      launchers: await launchersFor(cwd),
      untrusted: !!taskfileOf(cwd) && !claudeTrusts(cwd),
    }); // a Taskfile left unasked (2026-10-16)
  }

  if (req.method === 'GET' && path === '/api/agents') {
    // who a new chat there can start as (agentsFor), and whether its Taskfile starts it instead
    const cwd = url.searchParams.get('cwd') || '';

    if (!cwd.startsWith('/')) return json(res, 400, { error: 'cwd must be an absolute path' });
    return json(res, 200, { cwd, ...agentsFor(cwd), launchers: (await launchersFor(cwd)).length });
  }

  if (req.method === 'GET' && path === '/api/folders') {
    return json(res, 200, { roots: boardConfig().roots, folders: rootFolders() });
  }

  if (req.method === 'POST' && path === '/api/clone') {
    // a repo of a root's org, cloned into that root — then the page starts a chat in it
    const body = await jsonBody(req);

    return cloneRepo(
      typeof body.name === 'string' ? body.name.trim() : '',
      typeof body.root === 'string' ? body.root : null,
      result =>
        result.error
          ? json(res, result.code, { error: result.error })
          : json(res, result.code, { cwd: result.cwd, cloned: result.cloned }),
    );
  }

  return NEXT;
}

/** Drawers: a new chat, attach or resume, branch, take over, end. */
export async function terminalRoutes(req, res, url, path) {
  let match;

  if (req.method === 'POST' && path === '/api/terminals') {
    // a new chat in a folder — `claude`, or `task <name>` when the folder launches it so
    const body = await jsonBody(req);

    const cwd = typeof body.cwd === 'string' ? body.cwd : null;
    const task = typeof body.task === 'string' && body.task ? body.task : null;

    if (task && !(TASK_NAME.test(task) && (await launchersFor(cwd)).some(launcher => launcher.name === task))) {
      return json(res, 400, {
        error: `no launcher named ${task} in ${cwd || '(no folder)'} — its Taskfile has ${(await launchersFor(cwd)).map(launcher => launcher.name).join(', ') || 'none'}${cwd && !claudeTrusts(cwd) ? ' asked of it: Claude Code has not trusted the folder' : ''}`,
      });
    }

    // a merge (2026-10-31): the handoff you read and started as the new chat's first prompt, under an id the board picks,
    // so the chats it came from are tied to it at once (addLink)
    const prompt = typeof body.prompt === 'string' && body.prompt.trim() ? body.prompt : null;

    const from = Array.isArray(body.from)
      ? [...new Set(body.from.filter(id => typeof id === 'string' && sessions.has(id)))]
      : [];

    if ((prompt || from.length) && task) return json(res, 400, { error: 'a launcher takes no first prompt' });
    // `agent` (2026-11-06): one of the folder's (agentsFor), or '' for none over its settings' own; a folder not there yet
    // is spawnTerm's to answer (a clone), and the ask after it is checked — but the no-folder chats' own, which spawnTerm
    // makes, is checked at once: yours, the plugins', Claude Code's
    const agent = typeof body.agent === 'string' ? body.agent : null;

    if (agent !== null && task) {
      return json(res, 400, { error: `a launcher takes no agent — task ${task} starts claude its own way` });
    }

    if (
      agent &&
      (!AGENT_NAME.test(agent) ||
        (cwd && (existsSync(cwd) || cwd === SCRATCH_DIR) && !agentsFor(cwd).agents.some(known => known.name === agent)))
    ) {
      return json(res, 400, { error: `no agent named ${agent} for a chat in ${cwd ? tildePath(cwd) : 'no folder'}` });
    }

    if (!prompt && !from.length) {
      const spawned = await spawnTerm({ cwd, cols: body.cols, rows: body.rows, task, agent });

      return json(res, spawned.code, spawned);
    }

    const newId = randomUUID();

    placeholder(newId, cwd);
    const result = await spawnTerm({ cwd, cols: body.cols, rows: body.rows, prompt, newId, agent });

    if (result.code !== 201) {
      sessions.delete(newId);
      return json(res, result.code, result);
    }

    for (const id of from) addLink('merge', id, newId);
    return json(res, result.code, { ...result, sessionId: newId });
  }

  if (req.method === 'POST' && (match = path.match(/^\/api\/sessions\/([\w-]+)\/terminal$/))) {
    // attach to, or resume, this chat
    const session = sessions.get(match[1]);

    if (!session) return json(res, 404, { error: 'unknown session' });

    // `prompt` (2026-10-31, Send to…): the words go in as the resumed claude's first prompt — `prompted` says they did;
    // a drawer already there, or a resume another ask started, has not had them, and the page types them in instead
    const body = await jsonBody(req);
    const prompt = typeof body.prompt === 'string' && body.prompt.trim() ? body.prompt : null;

    if (removedMarks[session.id] && !removing.has(session.id)) putBackOnBoard(session); // resumed from where ⌥⌘K found it (2026-11-04)
    const have = termOf(session);

    if (have && have.exited === null) return json(res, 200, { terminal: termSummary(have), prompted: false });
    // In the background (2026-11-04): attached, not a second claude — the one running, in this drawer
    const job = session.alive && session.live?.pid && jobOf(session.live);

    if (job) {
      const spawned = await spawnOnce(`${session.id}:claude`, () =>
        spawnTerm({
          cwd: session.live.cwd || session.cwd,
          sessionId: session.id,
          attach: job,
          claudePid: session.live.pid,
          cols: body.cols,
          rows: body.rows,
        }),
      );

      return json(res, spawned.code, { ...spawned, prompted: false });
    }

    // Live elsewhere: same rule as replies — a second claude on one transcript is how it gets mangled.
    if (!session.alive && !session.file) {
      return json(res, 409, { error: 'nothing in it to resume: its claude ended before a first word' });
    } // claude would say so and exit, on a drawer nobody sees (2026-11-04)

    if (session.alive) {
      return json(res, 409, {
        error: `this chat is live in ${session.live?.entrypoint === 'claude-vscode' ? 'VS Code' : 'another terminal'} — take it over, or continue it there`,
      });
    }

    let mine = false;

    const result = await spawnOnce(`${session.id}:claude`, async () => {
      mine = true;
      return spawnTerm({
        cwd: session.live?.cwd || session.cwd,
        sessionId: session.id,
        cols: body.cols,
        rows: body.rows,
        prompt,
      });
    });

    return json(res, result.code, { ...result, prompted: !!prompt && mine && result.code === 201 });
  }

  // Branch from here (2026-10-31): a copy of the chat in a drawer of its own — `claude --resume <id> --fork-session
  // --session-id <new>`, the new id the board's, so the tie holds before Claude Code writes the copy. The chat itself is
  // read, not written to: a chat live anywhere, even elsewhere, can be branched.
  if (req.method === 'POST' && (match = path.match(/^\/api\/sessions\/([\w-]+)\/branch$/))) {
    const session = sessions.get(match[1]);
    const body = await jsonBody(req);

    if (!session) return json(res, 404, { error: 'unknown session' });
    if (!session.file) return json(res, 409, { error: 'nothing in it to branch yet' });

    const cwd = session.live?.cwd || session.cwd;
    const newId = randomUUID();

    placeholder(newId, cwd, session.id);
    const result = await spawnTerm({ cwd, fork: session.id, newId, cols: body.cols, rows: body.rows });

    if (result.code !== 201) {
      sessions.delete(newId);
      return json(res, result.code, result);
    }

    addLink('branch', session.id, newId);
    return json(res, result.code, { ...result, sessionId: newId });
  }

  if (req.method === 'POST' && (match = path.match(/^\/api\/sessions\/([\w-]+)\/takeover$/))) {
    // end every claude it is live in elsewhere, resume it here
    const session = sessions.get(match[1]);

    if (!session) return json(res, 404, { error: 'unknown session' });
    const body = await jsonBody(req);
    const have = termOf(session);

    if (have && have.exited === null) {
      // Already here: this ends the others — VS Code's, when the chat was opened there again after a take-over.
      const others = session.rivals;

      for (const rival of others) {
        const result = await endClaude(rival);

        if (!result.ok) return json(res, result.code, { error: result.error });
      }

      loadRegistry();
      return json(res, 200, { terminal: termSummary(have), ended: others.map(rival => rival.pid) });
    }

    if (!session.alive || !session.live?.pid) {
      return json(res, 409, { error: 'not live anywhere — open a terminal on it instead' });
    }

    const cwd = session.live.cwd || session.cwd; // before the registry entry goes

    for (const entry of [session.live, ...session.rivals]) {
      const result = await endClaude(entry);

      if (!result.ok) return json(res, result.code, { error: result.error });
    }

    loadRegistry();

    const term = await spawnOnce(`${session.id}:claude`, () =>
      spawnTerm({ cwd, sessionId: session.id, cols: body.cols, rows: body.rows }),
    );

    return json(res, term.code, term);
  }

  if (req.method === 'DELETE' && (match = path.match(/^\/api\/terminals\/([\w-]+)$/))) {
    const term = terms.get(match[1]);

    if (!term) return json(res, 404, { error: 'unknown terminal' });
    killTerm(term);
    return json(res, 200, { ok: true });
  }

  return NEXT;
}
