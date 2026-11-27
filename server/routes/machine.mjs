// Routes: the board's own code, the machine, keeping it awake, the plan's usage.
import { awakeState, keepAwake, readPower, setLid } from '../awake.mjs';
import { json, jsonBody, NEXT } from '../http.mjs';
import { autoUpdate, saveState, setAutoUpdate, setUpdateChannel } from '../state.mjs';
import { machineStats } from '../stats.mjs';
import {
  CHANNELS,
  channelNow,
  checkUpdate,
  releaseNotes,
  sayUpdate,
  UPDATE_EVERY_MS,
  updateState,
} from '../update.mjs';
import { planUsage } from '../usage.mjs';

/** The board's own code, the machine's numbers, keeping it awake. */
export async function machineRoutes(req, res, url, path) {
  // The board's own code (2026-10-12, checkUpdate): where it stands; the switch; look now — and, `apply`, update now
  if (req.method === 'GET' && path === '/api/update') return json(res, 200, updateState());

  // the notes of the releases after `since`, up to the one on disk (2026-11-27): What's new's, once a board is on a newer one
  if (req.method === 'GET' && path === '/api/update/notes') {
    return json(res, 200, releaseNotes(url.searchParams.get('since') || '0.0.0'));
  }

  if (req.method === 'PUT' && path === '/api/update') {
    // {on}: the switch; {channel}: what it follows (2026-11-27) — the checkout read again against it
    const body = await jsonBody(req);
    const on = typeof body.on === 'boolean';
    const chan = CHANNELS.includes(body.channel);

    if (!on && !chan) return json(res, 400, { error: `expected {on: true|false} or {channel: ${CHANNELS.join('|')}}` });
    const moved = chan && body.channel !== channelNow();

    if (on) setAutoUpdate(body.on);
    if (chan) setUpdateChannel(body.channel);
    saveState();
    if (moved) return json(res, 200, await checkUpdate());
    sayUpdate();
    if (on && autoUpdate && UPDATE_EVERY_MS > 0) checkUpdate(); // on again: what came while it was off, once the board rests
    return json(res, 200, updateState());
  }

  if (req.method === 'POST' && path === '/api/update') {
    const body = await jsonBody(req);

    return json(res, 200, await checkUpdate({ asked: true, apply: body.apply === true }));
  }

  if (req.method === 'GET' && path === '/api/stats') {
    return json(res, 200, await machineStats(new Set((url.searchParams.get('want') || '').split(',').filter(Boolean))));
  }

  if (req.method === 'GET' && path === '/api/awake') {
    await readPower();
    return json(res, 200, awakeState());
  }

  if (req.method === 'PUT' && path === '/api/awake') {
    // the menu's two switches: {awake} holds idle sleep off, {lid} sleep with the lid shut (a password)
    const body = await jsonBody(req);

    if (typeof body.awake !== 'boolean' && typeof body.lid !== 'boolean') {
      return json(res, 400, { error: 'expected {awake: true|false} or {lid: true|false}' });
    }

    try {
      if (typeof body.awake === 'boolean') keepAwake(body.awake);
      if (typeof body.lid === 'boolean') await setLid(body.lid);
    } catch (error) {
      return json(res, error.message === 'cancelled' ? 409 : 500, { error: error.message, ...awakeState() });
    }

    return json(res, 200, { ok: true, ...awakeState() });
  }

  return NEXT;
}

/** The plan's usage. */
export async function usageRoute(req, res, url, path) {
  if (req.method === 'GET' && path === '/api/usage') {
    const { code, body } = await planUsage();

    return json(res, code, body);
  }

  return NEXT;
}
