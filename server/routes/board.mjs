// Routes: the board's own lists — pinned and hidden projects, Pinned chats, named projects — and its notifications
import { json, jsonBody, NEXT } from '../http.mjs';
import { projectInput, projectList } from '../sessions.mjs';
import { broadcast } from '../sse.mjs';
import {
  hiddenProjects,
  isRemoved,
  notificationsOn,
  pinned,
  priority,
  PRIORITY_MAX,
  projects,
  saveState,
  sessions,
  setHiddenProjects,
  setNotificationsOn,
  setPinned,
  setPriority,
} from '../state.mjs';
// switch.

/** The board's lists and its switch: pinned projects, Pinned chats, hidden projects, notifications. */
export async function boardRoutes(req, res, url, path) {
  if (req.method === 'PUT' && path === '/api/pins') {
    // the pinned projects, in order — the whole list each time; folder cwds and c:<id>
    const body = await jsonBody(req);

    if (!Array.isArray(body.pins)) return json(res, 400, { error: 'expected {pins: [key]}' });

    setPinned(
      [
        ...new Set(
          body.pins.filter(key => typeof key === 'string' && /^(\/|c:\w+$)/.test(key)).map(key => key.slice(0, 1000)),
        ),
      ].slice(0, 200),
    );

    saveState();
    broadcast('pins', { pins: pinned });
    return json(res, 200, { ok: true, pins: pinned });
  }

  if (req.method === 'PUT' && path === '/api/priority') {
    // top priority (2026-11-24, round XXX): the chats at the list's head, in order — the whole list each time
    const body = await jsonBody(req);

    if (!Array.isArray(body.ids)) return json(res, 400, { error: 'expected {ids: [chat id]}' });

    setPriority(
      [
        ...new Set(
          body.ids.filter(
            id => typeof id === 'string' && /^[\w-]+$/.test(id) && sessions.has(id) && !isRemoved(sessions.get(id)),
          ),
        ),
      ].slice(0, PRIORITY_MAX),
    );

    saveState();
    broadcast('priority', { priority });
    return json(res, 200, { ok: true, priority });
  }

  if (req.method === 'PUT' && path === '/api/hidden') {
    // the projects taken off the board, the whole list each time — same keys as the pins
    const body = await jsonBody(req);

    if (!Array.isArray(body.hidden)) return json(res, 400, { error: 'expected {hidden: [key]}' });

    setHiddenProjects(
      [
        ...new Set(
          body.hidden.filter(key => typeof key === 'string' && /^(\/|c:\w+$)/.test(key)).map(key => key.slice(0, 1000)),
        ),
      ].slice(0, 500),
    );

    saveState();
    broadcast('hidden', { hidden: hiddenProjects });
    return json(res, 200, { ok: true, hidden: hiddenProjects });
  }

  if (req.method === 'PUT' && path === '/api/notifications') {
    // the cog's switch: system notifications on or off, for every page and the app
    const body = await jsonBody(req);

    if (typeof body.on !== 'boolean') return json(res, 400, { error: 'expected {on: true|false}' });
    setNotificationsOn(body.on);
    saveState();
    broadcast('notifications', { on: notificationsOn });
    return json(res, 200, { ok: true, on: notificationsOn });
  }

  return NEXT;
}

/** Named projects: listed, made, changed, deleted. */
export async function projectRoutes(req, res, url, path) {
  let match;

  if (req.method === 'GET' && path === '/api/projects') return json(res, 200, { projects: projectList() });

  if (req.method === 'POST' && path === '/api/projects') {
    const body = await jsonBody(req);
    const input = projectInput(body, { cwds: [] });

    if (input.error) return json(res, 400, { error: input.error });
    const id = `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

    projects[id] = { id, ...input, createdAt: new Date().toISOString() };
    saveState();
    broadcast('projects', { projects: projectList() });
    return json(res, 201, { project: projects[id] });
  }

  if ((req.method === 'PUT' || req.method === 'DELETE') && (match = path.match(/^\/api\/projects\/(\w+)$/))) {
    const prev = projects[match[1]];

    if (!prev) return json(res, 404, { error: 'unknown project' });

    if (req.method === 'DELETE') {
      delete projects[match[1]];

      if (pinned.includes(`c:${match[1]}`)) {
        setPinned(pinned.filter(key => key !== `c:${match[1]}`));
        broadcast('pins', { pins: pinned });
      }

      saveState();
      broadcast('projects', { projects: projectList() });
      return json(res, 200, { ok: true });
    }

    const body = await jsonBody(req);
    const input = projectInput(body, prev);

    if (input.error) return json(res, 400, { error: input.error });
    projects[match[1]] = { ...prev, ...input };
    saveState();
    broadcast('projects', { projects: projectList() });
    return json(res, 200, { project: projects[match[1]] });
  }

  return NEXT;
}
