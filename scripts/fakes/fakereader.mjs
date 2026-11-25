#!/usr/bin/env node
// A stand-in for the claude -p that reads the lunch menus (2026-10-18; READER_BIN): reads the one stream-json message on
// stdin, answers as print mode does — a `result` line with `structured_output` — from FAKEREADER_FILE, a JSON object:
//   { reads: { <words in the prompt>: <a read: {isMenu, kind, days, price, closed}> }, slack: {places: [...]}, fail: <words> }
// The first key of `reads` found in the prompt's text (a caption, a place's name) is the answer; none, not a menu. A
// run with --allowedTools (the Slack read) answers `slack`. A prompt holding `fail`'s words ends with no answer. Every
// run is a line in FAKEREADER_LOG: slack, or the key it answered with (none when none).
import { appendFileSync, readFileSync } from 'node:fs';

let d = {}; try { d = JSON.parse(readFileSync(process.env.FAKEREADER_FILE, 'utf8')); } catch {}
const slack = process.argv.includes('--allowedTools');
let raw = ''; process.stdin.setEncoding('utf8');
process.stdin.on('data', c => { raw += c; });
process.stdin.on('end', () => {
  let text = ''; try { text = JSON.parse(raw.split('\n')[0]).message.content.filter(c => c.type === 'text').map(c => c.text).join('\n'); } catch {}
  const key = slack ? 'slack' : Object.keys(d.reads || {}).find(k => text.includes(k)) || 'none';
  if (process.env.FAKEREADER_LOG) appendFileSync(process.env.FAKEREADER_LOG, key + '\n');
  if (d.fail && text.includes(d.fail)) { process.stdout.write(JSON.stringify({ type: 'result', is_error: true, result: 'fake failure' }) + '\n'); return; }
  const answer = slack ? d.slack || { places: [] } : d.reads?.[key] || { isMenu: false, kind: 'other', days: [], price: null, closed: null };
  process.stdout.write(JSON.stringify({ type: 'system', subtype: 'init' }) + '\n' + JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: JSON.stringify(answer), structured_output: answer }) + '\n');
});
