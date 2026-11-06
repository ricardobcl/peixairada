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
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `document.addEventListener('securitypolicyviolation', e => console.error('CSP violation: ' + e.effectiveDirective + ' ' + e.blockedURI))` });
    await cdp.send('Page.navigate', { url: srv.url });
    // drawn, or something threw — whichever first: a page that died at load never draws
    const drawn = 'window.peix?.state().snapshots > 0 && document.querySelectorAll("#slist > .card").length === 2';
    await waitFor(async () => cdp.exceptions.length || await cdp.evaluate(drawn).catch(() => false), { timeout: 20_000, what: 'the first snapshot drawn' });
    assert.deepEqual(cdp.exceptions, [], 'no exception at load');
    assert.deepEqual(cdp.console.filter(l => /CSP violation/.test(l)), [], 'nothing the page\'s policy refused');
    assert.equal(await cdp.evaluate('typeof window.peix'), 'object');
  } finally { await cdp?.close(); await srv.stop(); }
});

// The page's policy (2026-11-06): its two inline blocks by their hashes, worked out from the page served — so the board
// runs under it (the test above), and nothing else inline would.
test('the page is served with its policy: its own inline scripts by hash, nothing else', async () => {
  const srv = await startTestServer({});
  try {
    const r = await fetch(srv.url), csp = r.headers.get('content-security-policy') || '', html = await r.text();
    const { createHash } = await import('node:crypto');
    const want = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => `'sha256-${createHash('sha256').update(m[1]).digest('base64')}'`);
    assert.equal(want.length, 2, 'the page has its two inline blocks');
    const script = csp.split(/;\s*/).find(d => d.startsWith('script-src '));
    assert.equal(script, `script-src 'self' ${want.join(' ')}`, 'script-src: the vendored files and those two, no unsafe-inline, no eval');
    for (const d of ["object-src 'none'", "base-uri 'none'", "form-action 'none'", "frame-ancestors 'none'", "default-src 'self'"]) assert.ok(csp.includes(d), d);
    assert.match(csp, new RegExp(`connect-src 'self' ws://${new URL(srv.url).host.replace(/[.[\]]/g, '\\$&')}`), 'its stream and sockets: this server');
  } finally { await srv.stop(); }
});
