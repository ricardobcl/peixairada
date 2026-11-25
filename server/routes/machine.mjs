// Routes: the board's own code, the machine, keeping it awake, the plan's usage.
import { awakeState, keepAwake, readPower, setLid } from '../awake.mjs';
import { json, jsonBody, NEXT } from '../http.mjs';
import { autoUpdate, saveState, setAutoUpdate } from '../state.mjs';
import { machineStats } from '../stats.mjs';
import { checkUpdate, sayUpdate, UPDATE_EVERY_MS, updateState } from '../update.mjs';
import { planUsage } from '../usage.mjs';

/** The board's own code, the machine's numbers, keeping it awake. */
export async function machineRoutes(req, res, url, p) {
  // The board's own code (2026-10-12, checkUpdate): where it stands; the switch; look now — and, `apply`, update now
  if (req.method === 'GET' && p === '/api/update') return json(res, 200, updateState());
  if (req.method === 'PUT' && p === '/api/update') {
    const body = await jsonBody(req);
    if (typeof body.on !== 'boolean') return json(res, 400, { error: 'expected {on: true|false}' });
    setAutoUpdate(body.on); saveState(); sayUpdate();
    if (autoUpdate && UPDATE_EVERY_MS > 0) checkUpdate();   // on again: what came while it was off, once the board rests
    return json(res, 200, updateState());
  }
  if (req.method === 'POST' && p === '/api/update') { const body = await jsonBody(req); return json(res, 200, await checkUpdate({ asked: true, apply: body.apply === true })); }
  if (req.method === 'GET' && p === '/api/stats') return json(res, 200, await machineStats(new Set((url.searchParams.get('want') || '').split(',').filter(Boolean))));
  if (req.method === 'GET' && p === '/api/awake') { await readPower(); return json(res, 200, awakeState()); }
  if (req.method === 'PUT' && p === '/api/awake') {   // the menu's two switches: {awake} holds idle sleep off, {lid} sleep with the lid shut (a password)
    const body = await jsonBody(req);
    if (typeof body.awake !== 'boolean' && typeof body.lid !== 'boolean') return json(res, 400, { error: 'expected {awake: true|false} or {lid: true|false}' });
    try {
      if (typeof body.awake === 'boolean') keepAwake(body.awake);
      if (typeof body.lid === 'boolean') await setLid(body.lid);
    } catch (e) { return json(res, e.message === 'cancelled' ? 409 : 500, { error: e.message, ...awakeState() }); }
    return json(res, 200, { ok: true, ...awakeState() });
  }
  return NEXT;
}

/** The plan's usage. */
export async function usageRoute(req, res, url, p) {
  if (req.method === 'GET' && p === '/api/usage') { const { code, body } = await planUsage(); return json(res, code, body); }
  return NEXT;
}
