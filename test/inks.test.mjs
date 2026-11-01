// The small inks hold 4.5:1 in every theme (2026-11-01, round XV): the board's own in each frame (Matching, Ink,
// Stage) and every theme of the picker, each small-text colour measured in the page against the grounds it is set on —
// the chat's, the header's, a bubble's, a tool row's, the code block's, the sidebar's grey and the status bar's, a
// chip's wash of itself, the asking red's. The board's own are fitted in the CSS, a theme's by skinCss as it is written.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { CHROME, launchChrome } from '../lib/cdp.mjs';
import { INK_CHECK } from '../lib/inkcheck.mjs';
import { startTestServer, tmpDir, waitFor } from '../lib/testserver.mjs';
import { defaultFixture } from '../scripts/fixture.mjs';

test('every theme’s small inks hold 4.5:1 on their grounds', { timeout: 60_000, skip: !existsSync(CHROME) && `no Chrome at ${CHROME}` }, async () => {
  const fx = defaultFixture(tmpDir('peix-fx-'), { cwdA: process.cwd(), cwdB: tmpdir() });
  const srv = await startTestServer({ claudeDir: fx.dir });
  let cdp = null;
  try {
    cdp = await launchChrome({ key: srv.key });
    await cdp.send('Page.navigate', { url: srv.url });
    await waitFor(async () => cdp.exceptions.length || await cdp.evaluate('window.peix?.state().snapshots > 0').catch(() => false), { timeout: 20_000, what: 'the page' });
    assert.deepEqual(cdp.exceptions, [], 'no exception at load');
    const { looks, worst, checked } = JSON.parse(await cdp.evaluate(INK_CHECK));
    assert.ok(looks.length >= 18 && looks.includes('softened') && looks.includes('own light, Ink') && looks.includes('own dark, Stage'), `every look: ${looks.join(', ')}`);
    assert.ok(checked > 2000, `${checked} pairs`);
    assert.ok(worst[0].ratio >= 4.5, `the lowest: ${worst.filter(w => w.ratio < 4.5).map(w => `${w.look} · ${w.ink} on ${w.on} ${w.ratio}`).join('; ')}`);
  } finally { await cdp?.close(); await srv.stop(); }
});
