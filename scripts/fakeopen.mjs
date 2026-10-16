#!/usr/bin/env node
// A stand-in for macOS's `open` (2026-10-16), for the board's key: what the server would open in this Mac's browser — a
// tab with a ticket (POST /api/key/open) — is written to FAKE_OPEN_LOG, a line each, and nothing is opened.
import { appendFileSync } from 'node:fs';
if (process.env.FAKE_OPEN_LOG) appendFileSync(process.env.FAKE_OPEN_LOG, `${process.argv.slice(2).join(' ')}\n`);
