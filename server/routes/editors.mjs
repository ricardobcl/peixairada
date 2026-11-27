// Routes: the editors.
import { json, NEXT } from '../http.mjs';
import { ensureVsWeb } from '../vsweb.mjs';
import { editorState, installZed } from '../zed.mjs';

/** The editors: Zed installed, VS Code Web for the pane. */
export async function editorRoutes(req, res, url, path) {
  if (req.method === 'GET' && path === '/api/editors') return json(res, 200, editorState()); // whether Zed is on this Mac, and its install (2026-10-13)

  if (req.method === 'POST' && path === '/api/editors/zed/install') {
    // Zed picked and not here: brew installs it
    const result = installZed();

    return result.error
      ? json(res, result.code, { error: result.error })
      : json(res, result.zed.installing ? 202 : 200, result);
  }

  if (req.method === 'POST' && path === '/api/vscode-web') {
    // VS Code Web for the pane: start it if need be, say where it is and its token
    const result = await ensureVsWeb();

    return json(
      res,
      result.ok ? 200 : result.code,
      result.ok ? { url: result.url, token: result.token, started: result.started } : { error: result.error },
    );
  }

  return NEXT;
}
