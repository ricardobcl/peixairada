#!/usr/bin/env node
// peixAIrada — a local board for every Claude Code session on this machine (VS Code extension and CLI alike). Tails
// ~/.claude/projects/**/*.jsonl, tracks which sessions are alive via ~/.claude/sessions/*.json, serves a live web UI
// over SSE and fires native macOS notifications when Claude finishes a reply or needs your input.
//
//   node server.mjs                # http://127.0.0.1:7331
//   npm start                       # same thing
//   PORT=8000 NOTIFY=off node server.mjs
//   CLAUDE_DIR=/path/to/fixture node server.mjs   # point at a different ~/.claude (tests)
//
// The server is server/, a module per concern (2026-11-25); this file is its entry. Run, it boots (server/boot.mjs);
// imported — the tests —, it gives the parts they take and does nothing.
import { isMain } from './server/env.mjs';   // first: it is the module every other one needs, and it sets the log up
import { main } from './server/boot.mjs';

// What the tests take from the server, imported without booting it
export { agentRunning } from './server/agents/subagents.mjs';
export { lidRuns } from './server/awake.mjs';
export {
  addedPatch, branchWhere, changesOf, parseNameStatus, parseNumstat, parseWorktrees, patchStat, splitPatch,
  worktreeBases, worktreesFor
} from './server/changes.mjs';
export { pollBody, pollOf } from './server/chat.mjs';
export { driftOf, headOf, noteHead, settleDrift } from './server/drift.mjs';
export { folderBack, putBack } from './server/folders.mjs';
export { noteTickets, ticketsIn } from './server/jira.mjs';
export { handoffText } from './server/links.mjs';
export { cleanLunch, closedOn, dayKey, dishesOn, lunchPhase, readerArgs } from './server/lunch.mjs';
export { foreignTo } from './server/origin.mjs';
export { prActs, prAlertChat, takeActs } from './server/prs/acts.mjs';
export { ciEvent, logEvents, noteRounds, prEvents, roundsOf } from './server/prs/ledger.mjs';
export { notePr, notePrs, unlinkPr } from './server/prs/mentions.mjs';
export { forgetRef, prTitle } from './server/prs/refs.mjs';
export { duePrs, prStatus, setPrInfo } from './server/prs/status.mjs';
export {
  moveTurn, prChecks, prPeople, prRefs, prReview, prTurn, pruneLogs, unwaiveTurn, waiveTurn
} from './server/prs/turn.mjs';
export { ghRepoOf } from './server/repos.mjs';
export { pageCsp } from './server/routes/page.mjs';
export { newSession, projectDir, projectInput, summary } from './server/sessions.mjs';
export { cleanSetup, movePeacock } from './server/setup.mjs';
export { snoozeOf, wakeWhy } from './server/snooze.mjs';
export {
  doneMarks, favChats, forGoodMarks, isDone, mutedChats, priority, prLogs, prTurns, sessions, snoozed, unlinked,
  worktreesMade
} from './server/state.mjs';
export { findTasks, pruneTasks, sweepTasks } from './server/tasks.mjs';
export { agentFront, agentsFor } from './server/terminals/chat-agents.mjs';
export { terms, termSummary } from './server/terminals/terms.mjs';
export { dayOf, noteSpan } from './server/today.mjs';
export { doingOf, fold, stopOf } from './server/transcript/fold.mjs';
export { indexFile } from './server/transcript/read.mjs';
export {
  cleanPrompt, plain, snippet, summarizeToolInput, textOf, toolResultSnippet
} from './server/transcript/text.mjs';
export { updateParts } from './server/update.mjs';
export { usageWindows } from './server/usage.mjs';
export { cronNext, nextWake, pruneWakes } from './server/wakes.mjs';
export { ensureWorktree, linkModules, sweepWorktrees, switchGuard } from './server/worktrees.mjs';

if (isMain) main().catch(e => { console.error('[peixairada] boot failed:', e); process.exit(1); });
