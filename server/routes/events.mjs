// Routes: the stream every page listens to and its snapshot, and a test notification.
import { basename } from 'node:path';
import { hostname, userInfo } from 'node:os';
import { readPage } from '../../lib/page.mjs';
import { CLAUDE_DIR, CONFIG_FILE, NOTIFY, PKG, PORT, SCRATCH_DIR, SINCE, STATE_FILE } from '../env.mjs';
import { awakeState } from '../awake.mjs';
import { chatSummary } from '../chat.mjs';
import { clones, cloneState } from '../folders.mjs';
import { json, NEXT } from '../http.mjs';
import { keyState } from '../key.mjs';
import { lunchSummary } from '../lunch.mjs';
import { nativeNotify } from '../notify.mjs';
import { repoUrls } from '../repos.mjs';
import { pageStamp } from './page.mjs';
import { projectList, sortedSummaries } from '../sessions.mjs';
import { boardConfig } from '../setup.mjs';
import { broadcast, sseClients } from '../sse.mjs';
import { hiddenProjects, notificationsOn, pinned, priority } from '../state.mjs';
import { LOGIN_SHELL } from '../terminals/spawn.mjs';
import { upd, updateState } from '../update.mjs';
import { editorState } from '../zed.mjs';

export const aboutInfo = () => ({
  version: upd.version || PKG.version || 'dev',
  node: process.version,
  pid: process.pid,
  port: PORT,
  claudeDir: CLAUDE_DIR,
  stateFile: STATE_FILE,
  configFile: CONFIG_FILE,
  since: SINCE,
  shell: basename(LOGIN_SHELL),
  user: userInfo().username,
  host: hostname().replace(/\.local$/, ''),
  scratch: SCRATCH_DIR,
});

/** A test notification, and the stream every page listens to. */
export async function eventRoutes(req, res, url, p) {
  if (req.method === 'POST' && p === '/api/test-notify') {
    if (notificationsOn) nativeNotify('peixAIrada', 'test', 'Native notifications are working.');

    broadcast('alert', {
      kind: 'reply',
      sessionId: null,
      project: 'peixAIrada',
      title: 'Test notification',
      snippet: 'If you can read this, alerts work.',
      ts: new Date().toISOString(),
      quiet: !notificationsOn,
    });

    return json(res, 200, { ok: true });
  }

  if (req.method === 'GET' && p === '/events') {
    const snap = JSON.stringify({
      sessions: sortedSummaries(),
      projects: projectList(),
      pins: pinned,
      priority,
      hidden: hiddenProjects,
      repos: repoUrls(),
      notify: NOTIFY,
      notifications: notificationsOn,
      config: boardConfig(),
      chat: chatSummary(),
      lunch: lunchSummary(),
      about: aboutInfo(),
      awake: awakeState(),
      clones: [...clones.values()].map(cloneState),
      update: updateState(),
      editors: editorState(),
      key: keyState(),
      page: pageStamp(readPage()),
    });

    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
    res.write(`event: snapshot\ndata: ${snap}\n\n`);
    res.keyed = !!(req.headers['x-peix-key'] || url.searchParams.get('key')); // one come in with no key goes when it is required (requireKey)
    sseClients.add(res);
    const ping = setInterval(() => res.write(': ping\n\n'), 25_000);

    req.on('close', () => {
      clearInterval(ping);
      sseClients.delete(res);
    });

    return;
  }

  return NEXT;
}
