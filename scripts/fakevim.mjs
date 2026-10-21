#!/usr/bin/env node
// A stand-in for vim (2026-10-21), the in-app editor's other pick, for every test server (VIM_BIN): it draws a screen
// that names itself, its folder and its arguments, and quits on :qa or :q — unless FAKE_VIM_DIRTY is set, when :qa says
// what vim says over unsaved work (E162) and stays, and only :qa! ends it. Everything else typed is echoed on its line.
const dirty = !!process.env.FAKE_VIM_DIRTY;
const say = s => process.stdout.write(s);
say(`\x1b[2J\x1b[Hfake vim — ${process.cwd()} — ${process.argv.slice(2).join(' ')}\r\n~\r\n~\r\n`);
let typed = '';
if (process.stdin.isTTY) process.stdin.setRawMode(true);
process.stdin.on('data', d => {
  typed += d.toString('utf8');
  for (;;) {
    const m = /:(qa?!?)\r/.exec(typed); if (!m) break;
    typed = typed.slice(m.index + m[0].length);
    if (m[1].endsWith('!') || !dirty) process.exit(0);
    say('\r\nE162: No write since last change for buffer "notes.txt"\r\n');
  }
  say(d.toString('utf8').replace(/\x1b/g, ''));
});
