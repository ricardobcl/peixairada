// Routes: the board's own lists — pinned and hidden projects, Pinned chats, named projects — and its notifications
import { json, jsonBody, NEXT } from '../http.mjs';
import { projectInput, projectList } from '../sessions.mjs';
import { broadcast } from '../sse.mjs';
import {
  hiddenProjects, isRemoved, notificationsOn, pinned, priority, PRIORITY_MAX, projects, saveState, sessions,
  setHiddenProjects, setNotificationsOn, setPinned, setPriority
} from '../state.mjs';
// switch.

/** The board's lists and its switch: pinned projects, Pinned chats, hidden projects, notifications. */
export async function boardRoutes(req, res, url, p) {
  if (req.method === 'PUT' && p === '/api/pins') {   // the pinned projects, in order — the whole list each time; folder cwds and c:<id>
    const body = await jsonBody(req);
    if (!Array.isArray(body.pins)) return json(res, 400, { error: 'expected {pins: [key]}' });
    setPinned([...new Set(body.pins.filter(k => typeof k === 'string' && /^(\/|c:\w+$)/.test(k)).map(k => k.slice(0, 1000)))].slice(0, 200));
    saveState(); broadcast('pins', { pins: pinned });
    return json(res, 200, { ok: true, pins: pinned });
  }
  if (req.method === 'PUT' && p === '/api/priority') {   // top priority (2026-11-24, round XXX): the chats at the list's head, in order — the whole list each time
    const body = await jsonBody(req);
    if (!Array.isArray(body.ids)) return json(res, 400, { error: 'expected {ids: [chat id]}' });
    setPriority([...new Set(body.ids.filter(k => typeof k === 'string' && /^[\w-]+$/.test(k) && sessions.has(k) && !isRemoved(sessions.get(k))))].slice(0, PRIORITY_MAX));
    saveState(); broadcast('priority', { priority });
    return json(res, 200, { ok: true, priority });
  }
  if (req.method === 'PUT' && p === '/api/hidden') {   // the projects taken off the board, the whole list each time — same keys as the pins
    const body = await jsonBody(req);
    if (!Array.isArray(body.hidden)) return json(res, 400, { error: 'expected {hidden: [key]}' });
    setHiddenProjects([...new Set(body.hidden.filter(k => typeof k === 'string' && /^(\/|c:\w+$)/.test(k)).map(k => k.slice(0, 1000)))].slice(0, 500));
    saveState(); broadcast('hidden', { hidden: hiddenProjects });
    return json(res, 200, { ok: true, hidden: hiddenProjects });
  }
  if (req.method === 'PUT' && p === '/api/notifications') {   // the cog's switch: system notifications on or off, for every page and the app
    const body = await jsonBody(req);
    if (typeof body.on !== 'boolean') return json(res, 400, { error: 'expected {on: true|false}' });
    setNotificationsOn(body.on);
    saveState(); broadcast('notifications', { on: notificationsOn });
    return json(res, 200, { ok: true, on: notificationsOn });
  }
  return NEXT;
}

/** Named projects: listed, made, changed, deleted. */
export async function projectRoutes(req, res, url, p) {
  let m;
  if (req.method === 'GET' && p === '/api/projects') return json(res, 200, { projects: projectList() });
  if (req.method === 'POST' && p === '/api/projects') {
    const body = await jsonBody(req);
    const v = projectInput(body, { cwds: [] });
    if (v.error) return json(res, 400, { error: v.error });
    const id = 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    projects[id] = { id, ...v, createdAt: new Date().toISOString() };
    saveState(); broadcast('projects', { projects: projectList() });
    return json(res, 201, { project: projects[id] });
  }
  if ((req.method === 'PUT' || req.method === 'DELETE') && (m = p.match(/^\/api\/projects\/(\w+)$/))) {
    const prev = projects[m[1]];
    if (!prev) return json(res, 404, { error: 'unknown project' });
    if (req.method === 'DELETE') {
      delete projects[m[1]];
      if (pinned.includes('c:' + m[1])) { setPinned(pinned.filter(k => k !== 'c:' + m[1])); broadcast('pins', { pins: pinned }); }
      saveState(); broadcast('projects', { projects: projectList() });
      return json(res, 200, { ok: true });
    }
    const body = await jsonBody(req);
    const v = projectInput(body, prev);
    if (v.error) return json(res, 400, { error: v.error });
    projects[m[1]] = { ...prev, ...v };
    saveState(); broadcast('projects', { projects: projectList() });
    return json(res, 200, { project: projects[m[1]] });
  }
  return NEXT;
}
