#!/usr/bin/env node
// A stand-in for `code serve-web` (2026-10-11), for the test of VS Code Web kept on its newest build: it listens where it
// is told, and a request for a build by name — `/<quality>-<commit>/` — "downloads" it into the CLI's data dir
// (VSCODE_CLI_DATA_DIR, `serve-web/<commit>`, a moment later) and answers 202, as serve-web does; anything else is the
// workbench, 200. Its connection token (2026-10-16) as serve-web's: `--connection-token-file` or `--connection-token`
// (`--without-connection-token`, or neither here, is none), and a request without it is a 403 — one with `tkn` in its
// query a 302 to the same address without it, the token set as the `vscode-tkn` cookie, which lets every request after
// it through. FAKE_CODE_LOG, when set, gets a line per request (a refused one says so).
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
const args = process.argv.slice(2), at = k => args.includes(k) ? args[args.indexOf(k) + 1] : undefined;
if (args[0] !== 'serve-web') { console.error(`fakecode: only serve-web, not ${args[0]}`); process.exit(2); }
const dir = join(process.env.VSCODE_CLI_DATA_DIR || '.', 'serve-web');
const token = at('--connection-token-file') ? readFileSync(at('--connection-token-file'), 'utf8').trim() : at('--connection-token');
createServer((req, res) => {
  const url = new URL(req.url, 'http://x'), cookie = /(?:^|;\s*)vscode-tkn=([^;]*)/.exec(req.headers.cookie || '')?.[1];
  const log = line => { if (process.env.FAKE_CODE_LOG) appendFileSync(process.env.FAKE_CODE_LOG, `${req.method} ${req.url}${line}\n`); };
  if (token && url.searchParams.get('tkn') === token) {
    url.searchParams.delete('tkn'); log(' → 302');
    res.writeHead(302, { location: url.pathname + url.search, 'set-cookie': `vscode-tkn=${token}; Max-Age=604800; SameSite=Lax` }); return res.end();
  }
  if (token && cookie !== token) { log(' → 403'); res.writeHead(403, { 'content-type': 'text/plain' }); return res.end('Forbidden'); }
  log('');
  const m = /^\/(\w+)-([0-9a-f]{40})\//.exec(req.url);
  if (!m) { res.writeHead(200, { 'content-type': 'text/html' }); return res.end('<!doctype html><title>workbench</title>'); }
  setTimeout(() => { mkdirSync(join(dir, m[2]), { recursive: true }); writeFileSync(join(dir, m[2], 'product.json'), JSON.stringify({ quality: m[1], commit: m[2] })); }, 200);
  res.writeHead(202, { 'content-type': 'text/html' }); res.end('<!doctype html><title>downloading</title>');
}).listen(Number(at('--port')), at('--host') || '127.0.0.1');
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => process.exit(0));
