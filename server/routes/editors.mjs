// Routes: the editors.
import { json, NEXT } from '../http.mjs';
import { ensureVsWeb } from '../vsweb.mjs';
import { editorState, installZed } from '../zed.mjs';

/** The editors: Zed installed, VS Code Web for the pane. */
export async function editorRoutes(req, res, url, p) {
  if (req.method === 'GET' && p === '/api/editors') return json(res, 200, editorState()); // whether Zed is on this Mac, and its install (2026-10-13)
  if (req.method === 'POST' && p === '/api/editors/zed/install') {
    // Zed picked and not here: brew installs it
    const r = installZed();
    return r.error ? json(res, r.code, { error: r.error }) : json(res, r.zed.installing ? 202 : 200, r);
  }
  if (req.method === 'POST' && p === '/api/vscode-web') {
    // VS Code Web for the pane: start it if need be, say where it is and its token
    const r = await ensureVsWeb();
    return json(
      res,
      r.ok ? 200 : r.code,
      r.ok ? { url: r.url, token: r.token, started: r.started } : { error: r.error },
    );
  }
  return NEXT;
}
