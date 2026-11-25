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
  endClaude, jobOf, shellOf, termOf, terms, TERMS_DIR, termsAvailable, termSummary
} from '../terminals/terms.mjs';

/** ⌥⌘T and ⌘T: a zsh in the chat's folder. */
export async function shellRoute(req, res, url, p) {
  let m;
  // ⌥⌘T: a zsh in the chat's folder, in the pane's zsh tab — a holder like the claude one (`zsh -l -i` in the PTY),
  // alive until `exit` or a DELETE. The inline "new tab in iTerm" (2026-09-20): the chat's zsh, started once and
  // answered with ever after — and `fresh` (⌘T, 2026-10-13) another one beside it, every time: a second zsh harms
  // nothing, so it is not one spawn at a time as the first is.
  if (req.method === 'POST' && (m = p.match(/^\/api\/sessions\/([\w-]+)\/shell$/))) {
    const s = sessions.get(m[1]);
    if (!s) return json(res, 404, { error: 'unknown session' });
    const body = await jsonBody(req), spec = { cwd: s.live?.cwd || s.cwd, sessionId: s.id, cols: body.cols, rows: body.rows, shell: true };
    // the in-app editor's vim (2026-10-21): in the chat's folder, or `dir` — a worktree of its PR's branch —, one start
    // per folder at a time; the page shows one it has before asking for another
    if (body.vim === true) {
      if (typeof body.dir === 'string' && body.dir) { if (!isAbsolute(body.dir)) return json(res, 400, { error: 'dir must be an absolute path' }); spec.cwd = body.dir; }
      const r = await spawnOnce(`${s.id}:vim:${spec.cwd}`, () => spawnTerm({ ...spec, editor: 'vim' }));
      return json(res, r.code, r);
    }
    if (body.fresh === true) { const r = await spawnTerm(spec); return json(res, r.code, r); }
    const have = shellOf(s);
    if (have && have.exited === null) return json(res, 200, { terminal: termSummary(have) });
    const r = await spawnOnce(`${s.id}:shell`, () => spawnTerm(spec));
    return json(res, r.code, r);
  }
  return NEXT;
}

/** What a new chat can start with: the drawers, a folder's launchers and agents, the roots' folders, a clone. */
export async function startRoutes(req, res, url, p) {
  if (req.method === 'GET' && p === '/api/terminals') return json(res, 200, { terminals: [...terms.values()].map(termSummary), available: termsAvailable(), dir: TERMS_DIR });
  if (req.method === 'GET' && p === '/api/launchers') {   // the folder's Taskfile tasks that launch claude, if any (see launchersFor)
    const cwd = url.searchParams.get('cwd') || '';
    if (!cwd.startsWith('/')) return json(res, 400, { error: 'cwd must be an absolute path' });
    return json(res, 200, { cwd, launchers: await launchersFor(cwd), untrusted: !!taskfileOf(cwd) && !claudeTrusts(cwd) });   // a Taskfile left unasked (2026-10-16)
  }
  if (req.method === 'GET' && p === '/api/agents') {   // who a new chat there can start as (agentsFor), and whether its Taskfile starts it instead
    const cwd = url.searchParams.get('cwd') || '';
    if (!cwd.startsWith('/')) return json(res, 400, { error: 'cwd must be an absolute path' });
    return json(res, 200, { cwd, ...agentsFor(cwd), launchers: (await launchersFor(cwd)).length });
  }
  if (req.method === 'GET' && p === '/api/folders') return json(res, 200, { roots: boardConfig().roots, folders: rootFolders() });
  if (req.method === 'POST' && p === '/api/clone') {   // a repo of a root's org, cloned into that root — then the page starts a chat in it
    const body = await jsonBody(req);
    return cloneRepo(typeof body.name === 'string' ? body.name.trim() : '', typeof body.root === 'string' ? body.root : null, r => r.error ? json(res, r.code, { error: r.error }) : json(res, r.code, { cwd: r.cwd, cloned: r.cloned }));
  }
  return NEXT;
}

/** Drawers: a new chat, attach or resume, branch, take over, end. */
export async function terminalRoutes(req, res, url, p) {
  let m;
  if (req.method === 'POST' && p === '/api/terminals') {   // a new chat in a folder — `claude`, or `task <name>` when the folder launches it so
    const body = await jsonBody(req);
    const cwd = typeof body.cwd === 'string' ? body.cwd : null, task = typeof body.task === 'string' && body.task ? body.task : null;
    if (task && !(TASK_NAME.test(task) && (await launchersFor(cwd)).some(l => l.name === task))) return json(res, 400, { error: `no launcher named ${task} in ${cwd || '(no folder)'} — its Taskfile has ${(await launchersFor(cwd)).map(l => l.name).join(', ') || 'none'}${cwd && !claudeTrusts(cwd) ? ' asked of it: Claude Code has not trusted the folder' : ''}` });
    // a merge (2026-10-31): the handoff you read and started as the new chat's first prompt, under an id the board picks,
    // so the chats it came from are tied to it at once (addLink)
    const prompt = typeof body.prompt === 'string' && body.prompt.trim() ? body.prompt : null;
    const from = Array.isArray(body.from) ? [...new Set(body.from.filter(id => typeof id === 'string' && sessions.has(id)))] : [];
    if ((prompt || from.length) && task) return json(res, 400, { error: 'a launcher takes no first prompt' });
    // `agent` (2026-11-06): one of the folder's (agentsFor), or '' for none over its settings' own; a folder not there yet
    // is spawnTerm's to answer (a clone), and the ask after it is checked — but the no-folder chats' own, which spawnTerm
    // makes, is checked at once: yours, the plugins', Claude Code's
    const agent = typeof body.agent === 'string' ? body.agent : null;
    if (agent !== null && task) return json(res, 400, { error: `a launcher takes no agent — task ${task} starts claude its own way` });
    if (agent && (!AGENT_NAME.test(agent) || cwd && (existsSync(cwd) || cwd === SCRATCH_DIR) && !agentsFor(cwd).agents.some(a => a.name === agent))) return json(res, 400, { error: `no agent named ${agent} for a chat in ${cwd ? tildePath(cwd) : 'no folder'}` });
    if (!prompt && !from.length) { const r = await spawnTerm({ cwd, cols: body.cols, rows: body.rows, task, agent }); return json(res, r.code, r); }
    const newId = randomUUID(); placeholder(newId, cwd);
    const r = await spawnTerm({ cwd, cols: body.cols, rows: body.rows, prompt, newId, agent });
    if (r.code !== 201) { sessions.delete(newId); return json(res, r.code, r); }
    for (const id of from) addLink('merge', id, newId);
    return json(res, r.code, { ...r, sessionId: newId });
  }
  if (req.method === 'POST' && (m = p.match(/^\/api\/sessions\/([\w-]+)\/terminal$/))) {   // attach to, or resume, this chat
    const s = sessions.get(m[1]);
    if (!s) return json(res, 404, { error: 'unknown session' });
    // `prompt` (2026-10-31, Send to…): the words go in as the resumed claude's first prompt — `prompted` says they did;
    // a drawer already there, or a resume another ask started, has not had them, and the page types them in instead
    const body = await jsonBody(req), prompt = typeof body.prompt === 'string' && body.prompt.trim() ? body.prompt : null;
    if (removedMarks[s.id] && !removing.has(s.id)) putBackOnBoard(s);   // resumed from where ⌥⌘K found it (2026-11-04)
    const have = termOf(s);
    if (have && have.exited === null) return json(res, 200, { terminal: termSummary(have), prompted: false });
    // In the background (2026-11-04): attached, not a second claude — the one running, in this drawer
    const job = s.alive && s.live?.pid && jobOf(s.live);
    if (job) { const r = await spawnOnce(`${s.id}:claude`, () => spawnTerm({ cwd: s.live.cwd || s.cwd, sessionId: s.id, attach: job, claudePid: s.live.pid, cols: body.cols, rows: body.rows })); return json(res, r.code, { ...r, prompted: false }); }
    // Live elsewhere: same rule as replies — a second claude on one transcript is how it gets mangled.
    if (!s.alive && !s.file) return json(res, 409, { error: 'nothing in it to resume: its claude ended before a first word' });   // claude would say so and exit, on a drawer nobody sees (2026-11-04)
    if (s.alive) return json(res, 409, { error: `this chat is live in ${s.live?.entrypoint === 'claude-vscode' ? 'VS Code' : 'another terminal'} — take it over, or continue it there` });
    let mine = false;
    const r = await spawnOnce(`${s.id}:claude`, async () => { mine = true; return spawnTerm({ cwd: s.live?.cwd || s.cwd, sessionId: s.id, cols: body.cols, rows: body.rows, prompt }); });
    return json(res, r.code, { ...r, prompted: !!prompt && mine && r.code === 201 });
  }
  // Branch from here (2026-10-31): a copy of the chat in a drawer of its own — `claude --resume <id> --fork-session
  // --session-id <new>`, the new id the board's, so the tie holds before Claude Code writes the copy. The chat itself is
  // read, not written to: a chat live anywhere, even elsewhere, can be branched.
  if (req.method === 'POST' && (m = p.match(/^\/api\/sessions\/([\w-]+)\/branch$/))) {
    const s = sessions.get(m[1]), body = await jsonBody(req);
    if (!s) return json(res, 404, { error: 'unknown session' });
    if (!s.file) return json(res, 409, { error: 'nothing in it to branch yet' });
    const cwd = s.live?.cwd || s.cwd, newId = randomUUID(); placeholder(newId, cwd, s.id);
    const r = await spawnTerm({ cwd, fork: s.id, newId, cols: body.cols, rows: body.rows });
    if (r.code !== 201) { sessions.delete(newId); return json(res, r.code, r); }
    addLink('branch', s.id, newId);
    return json(res, r.code, { ...r, sessionId: newId });
  }
  if (req.method === 'POST' && (m = p.match(/^\/api\/sessions\/([\w-]+)\/takeover$/))) {   // end every claude it is live in elsewhere, resume it here
    const s = sessions.get(m[1]);
    if (!s) return json(res, 404, { error: 'unknown session' });
    const body = await jsonBody(req);
    const have = termOf(s);
    if (have && have.exited === null) {
      // Already here: this ends the others — VS Code's, when the chat was opened there again after a take-over.
      const others = s.rivals;
      for (const p of others) { const r = await endClaude(p); if (!r.ok) return json(res, r.code, { error: r.error }); }
      loadRegistry();
      return json(res, 200, { terminal: termSummary(have), ended: others.map(p => p.pid) });
    }
    if (!s.alive || !s.live?.pid) return json(res, 409, { error: 'not live anywhere — open a terminal on it instead' });
    const cwd = s.live.cwd || s.cwd;   // before the registry entry goes
    for (const p of [s.live, ...s.rivals]) { const r = await endClaude(p); if (!r.ok) return json(res, r.code, { error: r.error }); }
    loadRegistry();
    const t = await spawnOnce(`${s.id}:claude`, () => spawnTerm({ cwd, sessionId: s.id, cols: body.cols, rows: body.rows }));
    return json(res, t.code, t);
  }
  if (req.method === 'DELETE' && (m = p.match(/^\/api\/terminals\/([\w-]+)$/))) {
    const t = terms.get(m[1]);
    if (!t) return json(res, 404, { error: 'unknown terminal' });
    killTerm(t);
    return json(res, 200, { ok: true });
  }
  return NEXT;
}
