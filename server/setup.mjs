// The setup, the user's CONFIG_FILE (2026-09-28): roots, quick, projects, jira, chat, lunch — read, shaped
// (cleanSetup), written, read again on a hand edit; Peacock's colours moved into it once (2026-10-15).
import {
  chmodSync, mkdirSync, readFileSync, readlinkSync, realpathSync, renameSync, rmSync, statSync, writeFileSync
} from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { CONFIG_FILE } from './env.mjs';
import { chatReset } from './chat.mjs';
import { folderCache, isDir } from './folders.mjs';
import { jiraReset } from './jira.mjs';
import { cleanLunch, lunchSetupChanged } from './lunch.mjs';
import { projectDir } from './sessions.mjs';
import { broadcast } from './sse.mjs';
import { pinned, projects, saveState, sessions } from './state.mjs';

// The board's setup — the settings' Setup (2026-09-28), see cleanSetup below. What was set and nothing else: a key never
// set is the default, worked out when asked (boardConfig). Kept in CONFIG_FILE since 2026-10-01; the state file's
// `config` is read once more, to move it there.
export let setup = {};
export function setSetup(v) { setup = v; }   // for the modules that write it: an import is read-only

// ---- the board's setup: CONFIG_FILE, the settings' Setup ------------------------------------------------------------
// What had been written into this file and the page for one Mac — the directory the repos live in and the GitHub org
// they come from, ⌥⌘O's folder, the short names and colours given by hand — is the settings' since the board went to
// colleagues (2026-09-28), and the server's, so the app
// and every browser agree: in the state file's `config` at first, in CONFIG_FILE of its own since 2026-10-01. A key
// never set is the default: the roots are ORG_DIR / ORG's when either is in the environment (the tests', a server run
// by hand), else none — and the page asks, once (`ask`); no ⌥⌘O folder; no names or colours of the board's own. A
// root's org is what ＋ clone asks GitHub for — a root without one lists its folders and clones nothing.
export const ORG_NAME = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/;   // GitHub's rule for an account's name
export const REPO_RE = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9._-]{1,100}$/;   // …and a repo's, as owner/name
export const expandHome = p => p.trim().replace(/^~(?=\/|$)/, homedir());
/**
 * The setup as the state file or a PUT hands it over, down to what the board uses. `strict` (a PUT) says what is wrong
 * instead of dropping it, and asks whether each root is a folder here; the state file's are only shaped, so a folder
 * gone for a while (an unplugged disk) is not forgotten. Only the keys given come back: a PUT replaces those alone.
 */
export function cleanSetup(c, strict = false) {
  const out = {}, fail = error => ({ setup: null, error });
  if (!c || typeof c !== 'object') return strict ? fail('expected {roots?, quick?, projects?, jira?}') : { setup: out };
  if ('roots' in c) {
    if (!Array.isArray(c.roots)) { if (strict) return fail('roots: expected a list of {dir, org}'); }
    else {
      out.roots = [];
      for (const r of c.roots.slice(0, 20)) {
        const dir = typeof r?.dir === 'string' ? expandHome(r.dir) : '', org = typeof r?.org === 'string' ? r.org.trim() : '';
        const bad = !dir.startsWith('/') ? `"${r?.dir ?? ''}" is not a path — /… or ~/…` : org && !ORG_NAME.test(org) ? `"${org}" is not a GitHub org` : strict && !isDir(dir) ? `${dir} is not a folder here` : '';
        if (bad) { if (strict) return fail(bad); continue; }
        const at = resolve(dir);
        if (!out.roots.some(x => x.dir === at)) out.roots.push({ dir: at, org });
      }
    }
  }
  if ('quick' in c) {
    const q = typeof c.quick === 'string' ? c.quick.trim() : '';
    if (q.length > 200 || q.includes('/')) { if (strict) return fail('quick: a project\'s name, not a path'); }
    else out.quick = q || null;
  }
  if ('projects' in c) {
    if (!c.projects || typeof c.projects !== 'object' || Array.isArray(c.projects)) { if (strict) return fail('projects: expected {name: {abbr?, color?}}'); }
    else {
      out.projects = {};
      for (const [name, v] of Object.entries(c.projects).slice(0, 200)) {
        const abbr = typeof v?.abbr === 'string' ? v.abbr.trim() : '', color = typeof v?.color === 'string' ? v.color.trim().toLowerCase() : '';
        const bad = !name.trim() || name.length > 200 ? 'a project needs a name' : abbr.length > 6 ? `${name}: a short name is 6 letters at most` : color && !/^#[0-9a-f]{6}$/.test(color) ? `${name}: a colour is #rrggbb` : '';
        if (bad) { if (strict) return fail(bad); continue; }
        if (abbr || color) out.projects[name] = { ...abbr && { abbr }, ...color && { color } };
      }
    }
  }
  if ('jira' in c) {   // the Jira Cloud site and your login there (2026-10-08) — the token is kept apart, never in this file
    const j = c.jira, site = jiraSite(j?.site), email = typeof j?.email === 'string' ? j.email.trim() : '';
    if (j === null || (!site && !email && (!j || typeof j === 'object'))) out.jira = null;
    else if (!site) { if (strict) return fail(`"${j?.site ?? ''}" is not a Jira site — https://acme.atlassian.net`); }
    else if (!/^[^\s"\\@]+@[^\s"\\@]+$/.test(email)) { if (strict) return fail(`"${email}" is not an email — the one you sign in to Jira with`); }
    else out.jira = { site, email };
  }
  if ('chat' in c) {   // the chat's repo (2026-10-17): owner/name — or its address — or null, no chat
    const v = c.chat, repo = typeof v?.repo === 'string' ? v.repo.trim().replace(/^(https?:\/\/)?github\.com\//i, '').replace(/(\.git)?\/*$/, '') : '';
    if (v === null || (v && typeof v === 'object' && !repo)) out.chat = null;
    else if (!REPO_RE.test(repo)) { if (strict) return fail(`"${v?.repo ?? ''}" is not a GitHub repo — owner/name`); }
    else out.chat = { repo };
  }
  if ('lunch' in c) {   // lunch (2026-10-18): when, which days, the places and where their menus are read — or null, none
    const v = c.lunch;
    if (v === null) out.lunch = null;
    else {
      const r = cleanLunch(v);
      if (r.error) { if (strict) return fail(`lunch: ${r.error}`); }
      else out.lunch = r.lunch;
    }
  }
  return { setup: out };
}
/** A Jira site as its origin — https://acme.atlassian.net — or null; http only on this Mac (a test's fake). */
export function jiraSite(v) {
  if (typeof v !== 'string' || !v.trim()) return null;
  let u; try { u = new URL(/^https?:\/\//i.test(v.trim()) ? v.trim() : `https://${v.trim()}`); } catch { return null; }
  return u.protocol === 'https:' || (u.protocol === 'http:' && /^(127\.0\.0\.1|localhost)$/.test(u.hostname)) ? u.origin : null;
}
const envRoots = () => process.env.ORG_DIR || process.env.ORG ? [{ dir: resolve(expandHome(process.env.ORG_DIR || join(homedir(), process.env.ORG))), org: process.env.ORG || '' }] : [];
/** The setup the board runs on: what was set, the defaults for the rest — and, for the page, the file it lives in,
 *  why that file cannot be read (while it cannot), and whether the repos' folder was never answered (`ask`: the
 *  welcome). The three ride along on every answer and event; a PUT that hands them back is not read for them. */
export const boardConfig = () => ({ roots: setup.roots ?? envRoots(), quick: setup.quick ?? null, projects: setup.projects ?? {}, jira: setup.jira ?? null, chat: setup.chat ?? null, lunch: setup.lunch ?? null,
  file: CONFIG_FILE, error: configError, ask: !configError && setup.roots === undefined && !envRoots().length });
export const tildePath = p => p === homedir() || p.startsWith(homedir() + '/') ? '~' + p.slice(homedir().length) : p;
// The file is the user's as much as the board's: written with two spaces and `~/…` for a folder under the home, so it
// reads by hand and travels with dotfiles; into the file as it stands, so a key the board does not know — a note, a
// newer board's — stays (2026-10-14: a save wrote the board's four alone); beside its real path and renamed over it, so a
// symlink into a dotfiles repo stays one and a write cut short leaves the file whole (2026-10-14: in place before). A
// file that does not parse is said in the Setup and never written over — the board keeps what it had until it reads.
export let configError = null;
let configStamp = 0;   // its mtime as last read or written: the poll's news is a change of it
export const CONFIG_POLL_MS = Number(process.env.CONFIG_POLL_MS || 2000);   // a test server's is 200 ms
function readConfigFile() {
  let txt;
  try { txt = readFileSync(CONFIG_FILE, 'utf8'); } catch (e) { return e.code === 'ENOENT' ? { missing: true } : { error: `${tildePath(CONFIG_FILE)}: ${e.message}` }; }
  try { const c = JSON.parse(txt); if (c && typeof c === 'object' && !Array.isArray(c)) return { setup: c }; } catch (e) { return { error: `${tildePath(CONFIG_FILE)} does not parse — ${e.message}` }; }
  return { error: `${tildePath(CONFIG_FILE)} is not a JSON object` };
}
export function saveConfig() {
  const out = {};
  if (setup.roots) out.roots = setup.roots.map(r => ({ dir: tildePath(r.dir), org: r.org }));
  if ('quick' in setup) out.quick = setup.quick;
  if (setup.projects) out.projects = setup.projects;
  if ('jira' in setup) out.jira = setup.jira;
  if ('chat' in setup) out.chat = setup.chat;
  if ('lunch' in setup) out.lunch = setup.lunch;
  const was = readConfigFile().setup || {};
  let real = CONFIG_FILE;   // a symlink's target, a dangling one's too
  try { real = realpathSync(CONFIG_FILE); } catch { try { real = resolve(dirname(CONFIG_FILE), readlinkSync(CONFIG_FILE)); } catch {} }
  const tmp = `${real}.${process.pid}.tmp`;
  try {
    mkdirSync(dirname(real), { recursive: true });
    writeFileSync(tmp, JSON.stringify({ ...was, ...out }, null, 2) + '\n');
    try { chmodSync(tmp, statSync(real).mode & 0o7777); } catch {}   // the file's own mode, where there was one
    renameSync(tmp, real);
    configStamp = statSync(CONFIG_FILE).mtimeMs; return null;
  } catch (e) { try { rmSync(tmp, { force: true }); } catch {} console.error('[peixairada] could not save the setup', e.message); return e.message; }
}
/** At boot, and only then: the setup from CONFIG_FILE — moved there from the state file the first time. Never on an
 *  import: test/agents.test.mjs imports this module with no STATE_FILE of its own, and ran the move against this
 *  Mac's real files the first time it was written at the top level. */
export function loadConfig() {
  const r = readConfigFile();
  if (r.setup) setup = cleanSetup(r.setup).setup;
  else if (r.error) { setup = {}; configError = r.error; console.error(`[peixairada] ${r.error} — the setup waits for it to read`); }
  else if (Object.keys(setup).length && !saveConfig()) { console.log(`[peixairada] moved the setup to ${CONFIG_FILE}`); saveState(); }   // out of the state file, for good
  try { configStamp = statSync(CONFIG_FILE).mtimeMs; } catch {}
}
/** CONFIG_FILE changed under the board — a hand edit, a dotfiles checkout, a delete to start over: every page follows
 *  within seconds (a `config` event); a file that stopped parsing leaves the board as it was and says why. */
export function reloadConfig() {
  let at = 0; try { at = statSync(CONFIG_FILE).mtimeMs; } catch {}
  if (at === configStamp) return;
  configStamp = at;
  const before = JSON.stringify(boardConfig()), jiraWas = JSON.stringify(setup.jira ?? null), chatWas = setup.chat?.repo ?? null, lunchWas = JSON.stringify(setup.lunch ?? null), r = readConfigFile();
  if (r.error) { if (r.error !== configError) console.error(`[peixairada] ${r.error}`); configError = r.error; }
  else { setup = r.setup ? cleanSetup(r.setup).setup : {}; configError = null; }
  if (JSON.stringify(boardConfig()) !== before) { folderCache.clear(); broadcast('config', boardConfig()); }
  if (JSON.stringify(setup.jira ?? null) !== jiraWas) jiraReset();   // a root or a colour is no new site (2026-10-14)
  if ((setup.chat?.repo ?? null) !== chatWas) chatReset();
  if (JSON.stringify(setup.lunch ?? null) !== lunchWas) lunchSetupChanged(lunchWas);
}
// ---- Peacock's colours, moved into the setup once (2026-10-15) ------------------------------------------------------
// A project's colour was Peacock's until 2026-10-15 — the nearest .vscode/settings.json at or above a folder, stat'ed
// every 3 s and written by the header's square — and the setup's only where Peacock gave none; now it is the setup's
// alone (`projects[name].color`). The first boot since reads Peacock once for every folder the board knows and writes
// what it finds into the setup under the project's shown name, over the setup's own (Peacock's won on the page), so a
// board keeps the colours it showed; `peacockMoved` in the state file says it is done.
const HOME = homedir();
/** The text with its comments blanked to spaces, every offset kept: a key inside a comment is not read (2026-10-03: a
 *  commented-out colour won over the live one). A regex, not JSON.parse: settings.json allows comments and trailing
 *  commas. */
const bareJsonc = txt => txt.replace(/("(?:[^"\\\n]|\\.)*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (m, str) => str ?? m.replace(/[^\n]/g, ' '));
/** Peacock's colour for a folder: the nearest settings file at or above it, short of the home folder — "peacock.color",
 *  else the activity-bar colour Peacock derives from it. Null for none. */
function peacockOf(cwd) {
  for (let dir = cwd; dir && dir !== HOME && dir !== '/' && dir !== '.'; dir = dirname(dir)) {
    let txt; try { txt = bareJsonc(readFileSync(join(dir, '.vscode', 'settings.json'), 'utf8')); } catch { continue; }
    const m = txt.match(/"peacock\.color"\s*:\s*"(#[0-9a-fA-F]{6})/) || txt.match(/"activityBar\.background"\s*:\s*"(#[0-9a-fA-F]{6})/);
    return m ? m[1].toLowerCase() : null;
  }
  return null;
}
/** The setup's projects with Peacock's colours in: each folder under its project's shown name (the summary's
 *  `project`), the folder itself before a worktree of it, the first colour found for a name. Null when nothing changes. */
export function movePeacock(cwds, projs = {}) {
  const out = { ...projs }, named = new Set(), own = c => projectDir(c) === c ? 0 : 1;
  for (const c of [...cwds].sort((a, b) => own(a) - own(b))) {
    const name = basename(projectDir(c) || '');
    if (!name || named.has(name)) continue;
    const color = peacockOf(c); if (!color) continue;
    named.add(name);
    if (out[name]?.color !== color) out[name] = { ...out[name], color };
  }
  return Object.keys(out).some(n => out[n] !== projs[n]) ? out : null;
}
export function boardCwds() {
  const out = new Set();
  for (const s of sessions.values()) { const c = s.live?.cwd || s.cwd; if (c) out.add(c); }
  for (const p of Object.values(projects)) for (const c of p.cwds || []) out.add(c);
  for (const k of pinned) if (k.startsWith('/')) out.add(k);
  return out;
}
