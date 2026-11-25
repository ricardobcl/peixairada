// Keeping the Mac awake (2026-10-08): an idle-sleep assertion (caffeinate), and the lid's own setting (pmset).
import { execFile, spawn } from 'node:child_process';
import { execFileP } from './env.mjs';
import { canRun, findBin } from './bins.mjs';
import { broadcast } from './sse.mjs';
import { awakeOn, saveState, setAwakeOn } from './state.mjs';

// ---- keeping the Mac awake: an idle-sleep assertion, and the lid's own setting (2026-10-08) -------------------------
// Two buttons of the status bar (2026-10-09; the chat header's and its menu's when the bar is off). *Awake* is a
// `caffeinate -i -w <this pid>` the server keeps running while the switch is on: idle sleep held off, the display free
// to sleep, and caffeinate gone by itself when the server goes (-w) — the switch is in the state file, so a restart
// starts it again. Closing the lid still sleeps the Mac; *lid closed* is `pmset -a disablesleep 1`, which root alone may
// set: each turn goes through sudo — Touch ID where it takes it — else osascript's administrator dialog (a password).
// The setting is the system's — it outlives the server and a reboot — so it is read back (`pmset -g`: SleepDisabled)
// every minute (POWER_POLL_MS, 2026-10-15; on every registry poll before) rather than remembered, and shown whoever set
// it; the board's own switch and GET /api/awake read it at once. So are the idle sleep the Mac is set to on the power it
// draws from now (`sleep`, in minutes, 0 for never) and that power (`pmset -g ps`) (2026-10-09): on a charger set never
// to sleep, the cup has nothing to hold off, and the page says so. Tests: CAFFEINATE_BIN and PMSET_BIN are the fakes,
// and AWAKE_ADMIN=none runs pmset as it is — the only way PMSET_BIN sets anything (lidRuns).
let caffeinate = null; // the child holding the assertion
let lidOff = false; // SleepDisabled, as pmset last said
let idleSleep = null; // the minutes idle before the Mac sleeps on the power it draws from now, 0 never; null unread
let powerSrc = null; // 'ac' · 'battery' · 'ups', as pmset last said; null unread
let lidAsking = null; // Touch ID or a password dialog up: the next turn waits for it
export const POWER_POLL_MS = Number(process.env.POWER_POLL_MS || 60_000); // two pmsets a look; a test server's is 1.2 s
export const awakeState = () => ({ awake: awakeOn && !!caffeinate, lid: lidOff, idleSleep, power: powerSrc });
const sayAwake = () => broadcast('awake', awakeState());
/** The switch: on starts caffeinate (once), off ends it. Answers the state, or throws when caffeinate cannot run. */
export function keepAwake(on) {
  setAwakeOn(on);
  saveState();
  if (on && !caffeinate) {
    const bin = findBin('caffeinate', 'the Mac cannot be kept awake');
    if (!bin) {
      setAwakeOn(false);
      saveState();
      throw new Error('caffeinate not found');
    }
    const p = spawn(bin, ['-i', '-w', String(process.pid)], { stdio: 'ignore' });
    caffeinate = p;
    p.once('error', e => console.error('[peixairada] caffeinate:', e.message));
    // ended by someone else, or failed to start: the switch is off — the mark goes rather than claim what is not so
    p.once('exit', () => {
      if (caffeinate !== p) return;
      caffeinate = null;
      setAwakeOn(false);
      saveState();
      console.error('[peixairada] caffeinate ended on its own — the Mac may sleep again');
      sayAwake();
    });
    console.log('[peixairada] keeping the Mac awake (caffeinate -i)');
  } else if (!on && caffeinate) {
    const p = caffeinate;
    caffeinate = null;
    p.kill();
    console.log('[peixairada] the Mac may sleep again');
  }
  sayAwake();
  return awakeState();
}
/** pmset's word on sleep: SleepDisabled 1 is no sleep at all, lid shut or not; `sleep` under *Currently in use* the
 *  idle minutes on the power drawn from now (the setting — the assertions holding it off follow it in brackets); and
 *  `-g ps` that power. A failure to ask leaves each as it was. */
export async function readPower() {
  const bin = findBin('pmset', "the Mac's sleep settings go unread");
  if (!bin) return;
  const ask = args =>
    execFileP(bin, args, { timeout: 5000 }).then(
      r => r.stdout,
      e => {
        console.error(`[peixairada] pmset ${args.join(' ')}:`, String(e.message || e).split('\n')[0]);
        return null;
      },
    );
  const [g, ps] = await Promise.all([ask(['-g']), ask(['-g', 'ps'])]);
  const was = JSON.stringify([lidOff, idleSleep, powerSrc]);
  if (g != null) {
    lidOff = /^\s*SleepDisabled\s+1\b/m.test(g);
    const m = /^\s*sleep\s+(\d+)/m.exec(g.slice(g.indexOf('Currently in use')));
    idleSleep = m ? Number(m[1]) : null;
  }
  if (ps != null)
    powerSrc = { AC: 'ac', Battery: 'battery', UPS: 'ups' }[/Now drawing from '(\w+) Power'/.exec(ps)?.[1]] ?? null;
  if (JSON.stringify([lidOff, idleSleep, powerSrc]) !== was) sayAwake();
}
// As root it is always the system's own pmset (2026-10-14): findBin's — PMSET_BIN, then the PATH, with ~/.local/bin, a
// version manager's shims and Homebrew's on it — is whoever can write there's, and it ran with administrator privileges.
// The one found runs only as it is (AWAKE_ADMIN=none: the tests, PMSET_BIN their fake).
const ROOT_PMSET = '/usr/bin/pmset';
/** The commands that turn the lid's setting, by AWAKE_ADMIN: `plain` the pmset found, run as it is (`none`); else
 *  `sudo` and its fallback `dialog` (osascript's administrator one), both on ROOT_PMSET whatever was found. Pure. */
export function lidRuns(on, mode, found) {
  const args = ['-a', 'disablesleep', on ? '1' : '0'];
  if (mode === 'none') return { plain: [found, args] };
  const q = t => `"${t.replace(/[\\"]/g, '\\$&')}"`;
  return {
    sudo: ['/usr/bin/sudo', [ROOT_PMSET, ...args]],
    dialog: [
      '/usr/bin/osascript',
      [
        '-e',
        `do shell script quoted form of ${q(ROOT_PMSET)} & ${q(' ' + args.join(' '))} with prompt ${q(on ? 'peixAIrada wants to keep this Mac awake with its lid closed.' : 'peixAIrada wants to let this Mac sleep again when its lid closes.')} with administrator privileges`,
      ],
    ],
  };
}
/** Sleep with the lid shut, or not, as root: through `sudo` first — Touch ID where sudo takes it (pam_tid in
 *  /etc/pam.d/sudo_local), or a sudoers rule that asks nothing — and, when sudo cannot do it without a terminal to type a
 *  password in, through osascript's administrator dialog (2026-10-09; the dialog alone the day before). Then pmset read back. */
export async function setLid(on) {
  if (lidAsking) await lidAsking.catch(() => {});
  const mode = process.env.AWAKE_ADMIN || 'sudo';
  const bin =
    mode === 'none' ? findBin('pmset', "the lid's setting cannot be changed") : canRun(ROOT_PMSET) && ROOT_PMSET;
  if (!bin) throw new Error('pmset not found');
  const run = lidRuns(on, mode, bin);
  const viaDialog = () => execFileP(...run.dialog, { timeout: 5 * 60_000 });
  // no terminal: sudo's stdin is nothing, so a password it cannot get is a quick failure, not a wait
  const viaSudo = () =>
    new Promise((res, rej) =>
      execFile(...run.sudo, { timeout: 90_000, env: { ...process.env, SUDO_ASKPASS: '' } }, (err, so, se) =>
        err ? rej(Object.assign(err, { stderr: se })) : res(),
      ).stdin?.end(),
    );
  lidAsking =
    mode === 'none'
      ? execFileP(...run.plain, { timeout: 10_000 })
      : mode === 'osascript'
        ? viaDialog()
        : viaSudo().catch(e => {
            console.log(
              `[peixairada] sudo pmset did not go through (${
                String(e.stderr || e.message)
                  .trim()
                  .split('\n')[0]
              }) — asking with the dialog`,
            );
            return viaDialog();
          });
  try {
    await lidAsking;
  } catch (e) {
    throw new Error(
      /-128|cancel/i.test(String(e.stderr || e.message))
        ? 'cancelled'
        : String(e.stderr || e.message)
            .trim()
            .split('\n')[0],
      { cause: e },
    );
  } finally {
    lidAsking = null;
    await readPower();
  }
  console.log(`[peixairada] sleep with the lid closed: ${lidOff ? 'off — the Mac stays awake' : 'on again'}`);
  return awakeState();
}
