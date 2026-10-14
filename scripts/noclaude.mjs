#!/usr/bin/env node
// What a test server runs for `claude` when the test did not ask for the stand-in (2026-10-14): the server's search found
// ~/.local/bin/claude before, so a test that reached a spawn without `fake: true` ran the real CLI on the real ~/.claude.
// It runs nothing, and says so in the drawer and the holder's log. Ask for scripts/fakeclaude.mjs — `startTestServer({
// fake: true })`, a scenario's `meta.fake` — or name the real one outright (`env: { CLAUDE_BIN: … }`).
console.error(`noclaude: this test server runs no claude (asked: claude ${process.argv.slice(2).join(' ')}) — ask for the fake (fake: true) or name CLAUDE_BIN`);
process.exit(2);
