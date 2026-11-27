// The boot, only when run as the program: the port first, then the state, the transcripts, the holders, the
// registry — and the polls.
import { existsSync, rmSync, watch } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  CLAUDE_DIR,
  CONFIG_FILE,
  HOST,
  NOTIFY,
  PORT,
  PROJECTS_DIR,
  REGISTRY_POLL_MS,
  SESSIONS_DIR,
  STATE_FILE,
} from './env.mjs';
import { agentsSoon, pastSweep, scanAgents } from './agents/subagents.mjs';
import { keepAwake, POWER_POLL_MS, readPower } from './awake.mjs';
import { chat, chatReset } from './chat.mjs';
import { sweepHeads } from './drift.mjs';
import { booted, server } from './http.mjs';
import { sweepTickets } from './jira.mjs';
import { KEY_FILE, keyFile, keyRequired, privateDir, requireKey, setBoardKey } from './key.mjs';
import { LUNCH_DIR, LUNCH_TICK_MS, lunchTick } from './lunch.mjs';
import { sweepPrs } from './prs/status.mjs';
import { loadRegistry, scanProjects } from './registry.mjs';
import { pollRepos, REPOS_POLL_MS } from './repos.mjs';
import {
  boardCwds,
  CONFIG_POLL_MS,
  configError,
  loadConfig,
  movePeacock,
  reloadConfig,
  saveConfig,
  setup,
  tildePath,
} from './setup.mjs';
import { armSnoozes, wakeAll } from './snooze.mjs';
import { schedulePush } from './sse.mjs';
import {
  awakeOn,
  loadState,
  peacockMoved,
  pruneChatMarks,
  saveState,
  seenSince,
  sessions,
  setIndexing,
  setPeacockMoved,
  setSeenSince,
} from './state.mjs';
import { cpuBusy } from './stats.mjs';
import { findTasks, pruneTasks, sweepTasks } from './tasks.mjs';
import { holderSend } from './terminals/holder.mjs';
import { sweepDrawers } from './terminals/idle.mjs';
import { adoptHolders } from './terminals/spawn.mjs';
import { terms, TERMS_DIR } from './terminals/terms.mjs';
import { tailFile } from './transcript/read.mjs';
import {
  APP_DIR,
  APP_LOOK_MS,
  appWhyNot,
  checkUpdate,
  errText,
  lookApp,
  readApp,
  readCheckout,
  sayUpdate,
  staleParts,
  upd,
  UPDATE_EVERY_MS,
  watchBuild,
} from './update.mjs';
import { endVsWebWithUs, freshenVsWeb, VSWEB_FRESH_MS } from './vsweb.mjs';
import { pruneWakes } from './wakes.mjs';
import { sweepWorktrees, WT_SWEEP_MS, wtSweptAt } from './worktrees.mjs';

export async function main() {
  endVsWebWithUs();

  // A test's server goes with its test (2026-10-14): lib/testserver.mjs hands it a pipe for stdin and PEIX_TEST_PARENT,
  // and the pipe's end is that process gone — killed, timed out, crashed before its stop() — so the server ends its
  // drawers, which nobody else will now, and itself. A server run any other way never reads its stdin.
  if (process.env.PEIX_TEST_PARENT) {
    let gone = false;

    const orphaned = () => {
      if (gone) return;
      gone = true;

      console.error(
        `[peixairada] the test that started this server (pid ${process.env.PEIX_TEST_PARENT}) is gone — ending its drawers and stopping`,
      );

      for (const t of terms.values()) holderSend(t, { t: 'quit' });
      setTimeout(() => process.exit(0), 500);
    };

    process.stdin.once('end', orphaned).once('error', orphaned).resume();
  }

  // The port first, and nothing else until it is ours (2026-10-03): a server waiting on a busy port — the agent behind
  // the app's own, an `npm start` beside the agent — adopted every holder, polled GitHub, posted alerts and wrote its
  // boot-time copy of the state file over the live server's ticks, all while serving nobody. A busy port is waited
  // for, not died on: the launchd agent starts while the app's own server still holds 7331, and the handoff is the app
  // quitting a moment later — a crash here would only make launchd throttle and retry with noise in the log.
  server.on('error', e => {
    if (e.code !== 'EADDRINUSE') throw e;
    console.error(`[peixairada] port ${PORT} is busy — trying again in 3 s`);
    setTimeout(() => server.listen(PORT, HOST), 3000);
  });

  await new Promise(res => server.listen(PORT, HOST, res));
  console.log(`[peixairada] listening on http://${HOST}:${PORT}  (notify=${NOTIFY}, terminals in ${TERMS_DIR})`);
  privateDir(dirname(STATE_FILE)); // before anything is read or written in it (2026-11-06)
  loadState(); // now, not at import: what a server busy on the port saved while this one waited is in it
  setBoardKey(keyFile(KEY_FILE));
  if (!keyRequired() && !existsSync(APP_DIR)) requireKey(`no app at ${APP_DIR} to wait for`);
  const t0 = Date.now();

  if (!seenSince) {
    setSeenSince(new Date().toISOString());
    saveState();
  } // a reply before the board kept what it showed is no new one (2026-10-12)

  loadConfig();
  rmSync(join(LUNCH_DIR, 'chrome'), { recursive: true, force: true }); // lunch's Instagram login, a Chrome profile, gone with the login (2026-11-23)
  // The transcripts are watched before they are read (2026-10-14): FSEvents tells only of what comes after the watch
  // starts, and a reply written while the scan or the adoption ran stayed unread until the file's next line.
  const pendingFiles = new Map();

  function onFsEvent(_ev, rel) {
    if (!rel) return;
    const parts = String(rel).split('/');

    if (parts.length === 4 && parts[2] === 'subagents' && parts[3].endsWith('.jsonl')) {
      // <slug>/<id>/subagents/agent-*.jsonl
      const s = sessions.get(parts[1]);

      if (!s) return;
      agentsSoon(s);
      return;
    }

    if (parts.length !== 2 || !parts[1].endsWith('.jsonl')) return; // ignore memory/, <id>/subagents/*.meta.json, etc.
    const file = join(PROJECTS_DIR, rel);

    clearTimeout(pendingFiles.get(file));

    pendingFiles.set(
      file,
      setTimeout(() => {
        pendingFiles.delete(file);

        try {
          tailFile(file);
        } catch (e) {
          console.error('[peixairada] tail error', file, e);
        }
      }, 40),
    );
  }

  // The transcripts' folder, watched from when there is one (2026-11-04: a Mac whose first chat came after the boot had no watch at
  // all, and that chat's transcript was not read until a restart — a card with no words and no Resume).
  let projectsWatch = null;

  function watchProjects() {
    if (!projectsWatch && existsSync(PROJECTS_DIR)) projectsWatch = watch(PROJECTS_DIR, { recursive: true }, onFsEvent);
    return !!projectsWatch;
  }

  watchProjects();
  scanProjects();
  await adoptHolders(); // before the registry: a drawer's own process is what makes a chat's live process "mine"
  loadRegistry();
  sweepHeads(Date.now(), true); // the checkouts' branches as they stand, judged in silence: a move from before the restart is no news

  if (!peacockMoved && !configError) {
    // once, every folder known (2026-10-15); a setup that does not read waits for the next boot
    const was = setup.projects;
    const projs = movePeacock(boardCwds(), was);

    if (projs) setup.projects = projs;

    if (projs && saveConfig()) {
      setup.projects = was;
    } // not written: tried again at the next boot
    else {
      setPeacockMoved(new Date().toISOString());
      saveState();

      if (projs) {
        console.log(
          `[peixairada] Peacock's colours moved into ${tildePath(CONFIG_FILE)}: ${Object.keys(projs)
            .filter(k => projs[k] !== was?.[k])
            .join(', ')}`,
        );
      }
    }
  }

  setIndexing(false);
  if (pruneChatMarks()) saveState(); // the top priority and snoozes of chats the board no longer has (2026-11-24, round XXX)
  armSnoozes(); // the nearest snooze's time; one that came while the board was down, a moment on
  // Statuses alone could wait for a chat to be opened; titles cannot — they head every card, so the whole
  // board needs them up front. Batched 40 to a GraphQL call, in the background, the recent chats' first.
  sweepPrs();
  sweepTickets();
  chat.live = true;
  chat.invitesAt = Date.now();
  chatReset(); // the chat's repo read; with none, an invitation looked for CHAT_INVITES_MS on (or as Settings › Chat opens): no gh at boot for a board with no chat

  if (awakeOn) {
    try {
      keepAwake(true);
    } catch (e) {
      console.error(`[peixairada] could not keep the Mac awake: ${e.message}`);
    }
  } // the switch outlives a restart

  readPower();
  cpuBusy(); // the first sample: the status bar's first ask has a share to give
  pollRepos();
  setInterval(pollRepos, REPOS_POLL_MS);
  setInterval(reloadConfig, CONFIG_POLL_MS);
  setInterval(lunchTick, LUNCH_TICK_MS);
  setTimeout(lunchTick, Math.min(5000, LUNCH_TICK_MS)); // lunch's clock (2026-10-18): the morning's looks, the reminder   // a stat against the board's own record of it: a save-by-rename, a file not there yet, one made and gone between two looks

  if (VSWEB_FRESH_MS > 0) {
    setTimeout(freshenVsWeb, Math.min(90_000, VSWEB_FRESH_MS));
    setInterval(freshenVsWeb, VSWEB_FRESH_MS);
  } // VS Code Web on the newest build, before you open it

  readCheckout().then(
    async co => {
      Object.assign(upd, co);

      if (co.checkout) {
        upd.app = await readApp().catch(() => null);
        upd.appWhy = appWhyNot(false, false, false);
        upd.pending = staleParts();
      }

      sayUpdate();
    },
    e => {
      upd.error = errText(e);
    },
  ); // pending: a server that waited on the port while a pull came (2026-11-25)

  setInterval(lookApp, APP_LOOK_MS);
  watchBuild(); // an app's rebuild that outlived the restart it came with   // where the checkout stands, for the settings, before the first look

  if (UPDATE_EVERY_MS > 0) {
    setTimeout(checkUpdate, Math.min(60_000, UPDATE_EVERY_MS));
    setInterval(checkUpdate, UPDATE_EVERY_MS);
  } // the board's own new commits (checkUpdate)

  for (const s of sessions.values()) if (s.alive) scanAgents(s); // the past agents of the chats with no claude: the poll's, a few at a time (pastSweep)

  // An agent gone quiet stops counting; a task past its expiry stops running. Both are only visible on a push, and
  // a chat whose last word was "monitor started" has nothing else to push.
  setInterval(() => {
    if (!projectsWatch && watchProjects()) scanProjects();

    // a live chat's file looked at: what an event never told of is read (2026-10-14) — a stat when nothing was
    for (const f of [...sessions.values()].filter(s => s.alive && s.file).map(s => s.file)) {
      try {
        tailFile(f);
      } catch (e) {
        console.error('[peixairada] tail error', f, e);
      }
    }

    try {
      findTasks();
    } catch (e) {
      console.error('[peixairada] findTasks', e);
    }

    for (const s of sessions.values()) {
      if (pruneTasks(s) + pruneWakes(s)) schedulePush(s); // both asked, each its own pruning

      if (s.alive) {
        scanAgents(s);
        s.agentDirAt = null;
      } else if (s.agentsRunning) {
        s.agentsRunning = 0;
        schedulePush(s);
      } // its claude is gone, and its agents with it — a stale card read "2 agents" until a restart
    }

    pastSweep();
    sweepTasks();
    sweepDrawers();
    sweepHeads();
    wakeAll(); // a snooze whose time came while the Mac slept, or whose event no push told of (2026-11-24, round XXX)
    if (Date.now() - wtSweptAt > WT_SWEEP_MS) sweepWorktrees(); // the trees made for a PR since merged or closed
    sweepPrs();
    sweepTickets();
  }, REGISTRY_POLL_MS);

  setInterval(readPower, POWER_POLL_MS); // the lid's setting and idle sleep are the system's: whoever changes them, or the charger, the marks follow

  console.log(
    `[peixairada] indexed ${sessions.size} sessions (${[...sessions.values()].filter(s => s.alive).length} alive) from ${CLAUDE_DIR} in ${Date.now() - t0}ms`,
  );

  if (existsSync(SESSIONS_DIR)) {
    let regTimer;

    watch(SESSIONS_DIR, () => {
      clearTimeout(regTimer);
      regTimer = setTimeout(loadRegistry, 100);
    });
  }

  setInterval(loadRegistry, REGISTRY_POLL_MS);
  booted.resolve();
}
