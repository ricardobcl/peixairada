// The page loads (2026-10-14): a throwaway server with a chat or two and headless Chrome — window.peix is there once the
// first snapshot is drawn, and nothing threw on the way. check-page only compiles the script; a `const` read before its
// line compiles and kills the live board at load, which only `npm run verify` caught, by hand.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { CHROME, launchChrome } from '../lib/cdp.mjs';
import { startTestServer, tmpDir, waitFor } from '../lib/testserver.mjs';
import { defaultFixture } from '../scripts/fixture.mjs';

test('the board loads: window.peix, the snapshot drawn, no exception', { timeout: 60_000, skip: !existsSync(CHROME) && `no Chrome at ${CHROME}` }, async () => {
  const fx = defaultFixture(tmpDir('peix-fx-'), { cwdA: process.cwd(), cwdB: tmpdir() });
  const srv = await startTestServer({ claudeDir: fx.dir });
  let cdp = null;
  try {
    cdp = await launchChrome({ key: srv.key });
    await cdp.send('Page.navigate', { url: srv.url });
    // drawn, or something threw — whichever first: a page that died at load never draws
    const drawn = 'window.peix?.state().snapshots > 0 && document.querySelectorAll("#slist > .card").length === 2';
    await waitFor(async () => cdp.exceptions.length || await cdp.evaluate(drawn).catch(() => false), { timeout: 20_000, what: 'the first snapshot drawn' });
    assert.deepEqual(cdp.exceptions, [], 'no exception at load');
    assert.equal(await cdp.evaluate('typeof window.peix'), 'object');
  } finally { await cdp?.close(); await srv.stop(); }
});
