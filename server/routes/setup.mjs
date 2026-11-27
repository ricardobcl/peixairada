// Routes: the setup, Jira, the chat and lunch.
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { homedir } from 'node:os';
import { CONFIG_FILE, inClaudeDir } from '../env.mjs';
import { chatReset, chatRoute } from '../chat.mjs';
import { chatPicRoute } from '../chat-pics.mjs';
import { folderCache, suggestRoots } from '../folders.mjs';
import { json, jsonBody, NEXT } from '../http.mjs';
import { jiraInfo, jiraReset, saveJiraToken } from '../jira.mjs';
import { lunchRoute, lunchSetupChanged } from '../lunch.mjs';
import {
  boardConfig,
  cleanSetup,
  configError,
  expandHome,
  reloadConfig,
  saveConfig,
  setSetup,
  setup,
  tildePath,
} from '../setup.mjs';
import { broadcast } from '../sse.mjs';

/** The setup and what hangs off it: the config, the first run's guess, Jira and its token, the chat, lunch. */
export async function setupRoutes(req, res, url, path) {
  let match;

  if (req.method === 'GET' && path === '/api/config') return json(res, 200, boardConfig());
  if (req.method === 'GET' && path === '/api/config/suggest') return json(res, 200, { roots: suggestRoots() });
  if (req.method === 'GET' && path === '/api/jira') return json(res, 200, await jiraInfo());
  if (path === '/api/chat') return chatRoute(req, res, null, url); // the chat (2026-10-17): its own routes
  if (path === '/api/chat/pic' || path === '/api/chat/upload') return chatPicRoute(req, res, url, path); // its pictures (2026-11-25): fetched for the page, yours uploaded
  if ((match = path.match(/^\/api\/chat\/(\w+)$/))) return chatRoute(req, res, match[1], url);
  if (path === '/api/lunch') return lunchRoute(req, res, url); // lunch (2026-10-18)

  if ((req.method === 'PUT' || req.method === 'DELETE') && path === '/api/jira/token') {
    // the Setup's token box: into the keychain, or out of it
    const body = req.method === 'PUT' ? await jsonBody(req) : {};
    const token = req.method === 'PUT' ? (typeof body.token === 'string' ? body.token.trim() : '') : '';

    if (req.method === 'PUT' && !/^[\x21-\x7e]{8,1024}$/.test(token)) {
      return json(res, 400, { error: 'expected {token} — the API token, one line' });
    }

    try {
      await saveJiraToken(token);
    } catch (error) {
      return json(res, 400, { error: error.message });
    }

    return json(res, 200, await jiraInfo());
  }

  if (req.method === 'PUT' && path === '/api/config') {
    // the settings' Setup: the keys given replace theirs, the rest stand
    reloadConfig(); // a hand edit since the last poll first: merged into, not saved over — nor a broken one written over
    if (configError) return json(res, 409, { error: `${configError} — fix it by hand, or delete it to start over` });
    const body = await jsonBody(req);
    // `create`: the welcome's "make it" — a root under the home that is not there yet is made, so a new Mac's ~/code can
    // be the answer before anything is cloned into it. Nowhere else: a typo in the Setup stays a refusal. Made once the
    // whole PUT holds, never in Claude Code's folder (2026-11-27, an outside audit's note: a refused PUT left its folders,
    // and ~/.claude/x was made — the board writes nothing there).
    const toMake = new Set();

    if (body.create === true && Array.isArray(body.roots)) {
      for (const root of body.roots) {
        const dir = typeof root?.dir === 'string' && root.dir.trim() ? resolve(expandHome(root.dir)) : '';

        if (!dir.startsWith(`${homedir()}/`) || existsSync(dir)) continue;

        if (inClaudeDir(dir)) {
          return json(res, 400, {
            error: `${tildePath(dir)} is in Claude Code's own folder — the board makes nothing there`,
          });
        }

        toMake.add(dir);
      }
    }

    const result = cleanSetup(body, true, toMake);

    if (result.error) return json(res, 400, { error: result.error });

    for (const dir of toMake) {
      try {
        mkdirSync(dir, { recursive: true });
      } catch (error) {
        return json(res, 400, { error: `${tildePath(dir)}: ${error.message}` });
      }
    }

    const jiraWas = JSON.stringify(setup.jira ?? null);
    const chatWas = setup.chat?.repo ?? null;
    const lunchWas = JSON.stringify(setup.lunch ?? null);

    setSetup({ ...setup, ...result.setup });
    folderCache.clear();
    if (JSON.stringify(setup.jira ?? null) !== jiraWas) jiraReset();
    if ((setup.chat?.repo ?? null) !== chatWas) chatReset();
    if (JSON.stringify(setup.lunch ?? null) !== lunchWas) lunchSetupChanged(lunchWas);
    const failed = saveConfig();

    broadcast('config', boardConfig());
    return failed
      ? json(res, 500, { error: `not saved to ${tildePath(CONFIG_FILE)}: ${failed}` })
      : json(res, 200, { ok: true, config: boardConfig() });
  }

  return NEXT;
}
