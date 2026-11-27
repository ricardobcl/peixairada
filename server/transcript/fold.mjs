// A transcript line folded into its chat: its status, the last tool call, its entries, a turn's end
// and why it stopped.
import { MAX_ENTRIES } from '../env.mjs';
import { agentNamed, noteAgentNotices } from '../agents/rows.mjs';
import { noteMateType, SPAWN_TOOLS } from '../agents/team.mjs';
import { EDIT_TOOLS } from '../changes.mjs';
import { bashCmds, branchHeard, noteBranch, noteGitCmd } from '../drift.mjs';
import { noteBranchTicket, noteTickets } from '../jira.mjs';
import { HANDOFF_TEXT, noteContinued, noteFirstLine } from '../links.mjs';
import { queueNotify } from '../notify.mjs';
import { notePeer, notePeerQueue, noteSend, noteSent, peerOf, pstr } from '../peers.mjs';
import { noteActsCalled, noteActsDone } from '../prs/acts.mjs';
import { noteOpened, noteOpening, notePr, notePrs } from '../prs/mentions.mjs';
import { tickCleared } from '../registry.mjs';
import { noteTaskCall, noteTaskEvent, startTask, TASK_NOTE_RE } from '../tasks.mjs';
import { noteSpan } from '../today.mjs';
import {
  cleanPrompt,
  CLEAR_RE,
  cut,
  plainSnippet,
  snippet,
  summarizeToolInput,
  SYNTHETIC_RE,
  textOf,
  toolResultSnippet,
} from './text.mjs';
import { noteWakeCall, startWake, WAKE_TOOLS, wakeFired } from '../wakes.mjs';

function setStatus(session, status, ts) {
  if (session.status !== status) {
    session.status = status;
    session.statusSince = ts || new Date().toISOString();
  }
}

/** The last few things a chat did, kept for every chat, open or not (2026-10-10): what the overview's
 *  tiles show of one with no drawer here — its tool calls with their results, its words — short. */
const RECENT_MAX = 16;

function noteRecent(session, entry) {
  if (!['tool_use', 'tool_result', 'text', 'interrupt'].includes(entry.kind)) return;

  const row = {
    role: entry.role,
    kind: entry.kind,
    ts: entry.ts,
    text:
      entry.kind === 'text'
        ? plainSnippet(entry.text, 220)
        : snippet(entry.text, entry.kind === 'tool_result' ? 120 : 220),
  };

  if (entry.name) row.name = entry.name;
  if (entry.toolUseId) row.toolUseId = entry.toolUseId;
  if (entry.isError) row.isError = true;
  (session.recent ||= []).push(row);
  if (session.recent.length > RECENT_MAX) session.recent.splice(0, session.recent.length - RECENT_MAX);
}

/** What a turn at work is doing now (2026-10-11), for the card's live line: the newest tool call since your last word
 *  — its tool and what it was given, as the transcript summarizes it — or null when the turn has called none yet. */
export function doingOf(session) {
  const recent = session.recent || [];

  for (let index = recent.length - 1; index >= 0; index--) {
    const row = recent[index];

    if (row.role === 'user' && (row.kind === 'text' || row.kind === 'interrupt')) return null;
    if (row.kind === 'tool_use') return { name: row.name || 'tool', text: row.text || '', ts: row.ts || null };
  }

  return null;
}

export function pushEntry(session, entry) {
  session.entryCount++;
  noteRecent(session, entry);
  if (!session.loaded) return;
  session.entries.push(entry);
  if (session.entries.length > MAX_ENTRIES) session.entries.splice(0, session.entries.length - MAX_ENTRIES);
  if (!session.reading) session.newEntries.push(entry); // a whole read is nothing new — every entry of it was kept twice until its end
}

const NEEDS_INPUT_TOOLS = new Set(['AskUserQuestion', 'ExitPlanMode']);
const TURN_ENDS = new Set(['end_turn', 'stop_sequence', 'max_tokens', 'refusal']);

/** An assistant message that ends its turn — a chat's, or a sub-agent's (agentRunning): end_turn, or max_tokens or a
 *  refusal (2026-10-03: a turn that ran out of tokens stayed working and its reply was never alerted), unless what ran
 *  out was a tool call Claude Code goes on with. */
export const endsTurn = message =>
  TURN_ENDS.has(message?.stop_reason) &&
  !(
    message.stop_reason === 'max_tokens' &&
    Array.isArray(message.content) &&
    message.content.some(block => block?.type === 'tool_use')
  );

/** A turn that ended on something other than an answer (2026-10-31, round XIII's S4), or null: an API error Claude Code
 *  wrote after its retries — a `<synthetic>` line flagged `isApiErrorMessage`, its words "API Error: …", `error` a kind
 *  (server_error, authentication_failed, invalid_request…) —, a reply the token limit cut, a refusal. */
export function stopOf(line, message, text, ts) {
  if (line.isApiErrorMessage) {
    const detail = String(text || '').replace(/^API Error:\s*/i, '');
    const code = /^(\d{3})\b/.exec(detail)?.[1];
    const msg = /"message"\s*:\s*"([^"]+)"/.exec(detail)?.[1];

    const why = msg || detail.replace(/^\d{3}\s*/, '').split(/(?<=[.!?])\s/)[0];

    return {
      why: 'api',
      text: snippet(`${code ? `${code} · ` : ''}${why}`, 90) || null,
      kind: typeof line.error === 'string' ? line.error : null,
      at: ts,
    };
  }

  if (message.stop_reason === 'max_tokens') return { why: 'max_tokens', text: null, kind: null, at: ts };
  if (message.stop_reason === 'refusal') return { why: 'refusal', text: null, kind: null, at: ts };
  return null;
}

/** Fold one JSONL line into the session. Returns true if the session summary changed. */
export function fold(session, line) {
  const ts = line.timestamp || null;

  switch (line.type) {
    case 'ai-title':
      if (line.aiTitle) session.title = line.aiTitle;
      return true;
    case 'continued-in':
      if (line.continuedInSessionId) noteContinued(session, line.continuedInSessionId, ts);
      return false;
    case 'custom-title':
      session.customTitle = line.customTitle || line.title || null;
      return true;
    case 'agent-setting':
      session.agent = typeof line.agentSetting === 'string' && line.agentSetting ? line.agentSetting : null;
      return true; // the agent it runs as (2026-11-06): --agent, or its folder's setting
    case 'last-prompt':
      if (!session.lastPrompt && line.lastPrompt) session.lastPrompt = plainSnippet(line.lastPrompt, 200);
      return true; // whole, it was a card's and a search's to carry

    case 'pr-link': {
      const url = line.prUrl || line.url;

      if (url) notePr(session, url, ts, null);
      return true;
    }

    case 'system':
      // Claude Code's own recap of where a chat stands, written as you come back to it (2026-10-31): a handoff's first
      // word on it — `{type: system, subtype: away_summary, content: <text>}`, measured on this Mac's transcripts
      if (line.subtype === 'away_summary' && typeof line.content === 'string' && line.content.trim()) {
        session.away = { text: cut(line.content.trim(), HANDOFF_TEXT), at: ts };
        return false;
      }

      if (line.subtype !== 'compact_boundary') return false;
      pushEntry(session, { role: 'system', kind: 'compact', text: 'Conversation compacted', ts });
      if (!session.compacting) return false; // one Claude Code ran mid-turn on its own: the turn goes on
      // the /compact you typed is done (2026-10-14): no reply ever closes its turn, and the next prompt was taken for
      // part of it — "worked for 182 min", a day's span over the idle hours between
      session.compacting = false;
      noteSpan(session, 'w', session.turnStart, ts);
      session.turnStart = null;
      setStatus(session, 'idle', ts);
      return true;

    case 'user': {
      if (line.isSidechain) return false;
      if (!session.truncatedHead) noteFirstLine(session, line); // a tail's first is not the chat's: headPrs read that
      if (line.cwd) session.cwd = line.cwd;

      if (line.entrypoint) {
        session.entrypoint = line.entrypoint;
        session.entrypointAt = ts;
      }

      if (line.gitBranch) {
        session.gitBranch = line.gitBranch;
        if (line.gitBranch !== session.ticketBranch) noteBranchTicket(session, line.gitBranch, ts);
      }

      noteBranch(session, line, ts);

      if (line.isMeta) {
        const peer = peerOf(line);

        if (peer) return notePeer(session, peer, ts);
      } // another chat's message (2026-10-31): drawn, never your word

      const fired = line.turnOrigin === 'scheduled' && wakeFired(session, ts); // a wake-up it set itself went off (2026-10-31): its prompt is a meta line

      if (line.isMeta || line.isCompactSummary) return fired;
      const content = line.message?.content;
      const blocks = Array.isArray(content) ? content : null;
      const toolResults = blocks ? blocks.filter(block => block?.type === 'tool_result') : [];

      if (toolResults.length) {
        for (const result of toolResults) {
          startTask(session, result, ts);
          if (session.wakeCalls?.size) startWake(session, result, line.toolUseResult, ts);

          pushEntry(session, {
            role: 'user',
            kind: 'tool_result',
            toolUseId: result.tool_use_id,
            isError: !!result.is_error,
            text: toolResultSnippet(result),
            ts,
            ...(toolResults.length === 1 && agentNamed(line.toolUseResult)),
          });

          if (session.actsWait.size) noteActsDone(session, result);
          if (session.opening.size) noteOpened(session, result);
          if (session.sends?.size) noteSent(session, result, line.toolUseResult, ts);

          if (session.askOpen?.id === result.tool_use_id) {
            noteSpan(session, 'a', session.askOpen.from, ts);
            session.askOpen = null;
          } // a question and its answer: the time it waited on you
        }

        session.lastActivity = ts;

        if (session.status === 'needs-input') {
          // question answered — that was you
          session.lastUserAt = ts;
          session.woke = null;
          setStatus(session, 'working', ts);
          // …and the question's line arrived with its answer (see waitingOn): an alert for it now would be after the fact
          session.pendingNotify?.delete('needs-input');
        }

        return true;
      }

      const raw = textOf(content);

      if (raw.startsWith('[Request interrupted')) {
        pushEntry(session, { role: 'user', kind: 'interrupt', text: raw, ts });
        session.lastActivity = ts;
        session.lastUserAt = ts; // Escape is you acting on the chat too
        noteSpan(session, 'w', session.turnStart, ts);
        session.askOpen = null;
        session.turnStart = null;
        session.compacting = false;
        session.woke = null;
        session.stopped = null; // stopped by you: no error
        setStatus(session, 'idle', ts);
        return true;
      }

      // The reminder blocks go first: Claude Code puts them at the head of the user's own text, and a prompt that
      // follows one is a prompt (the test that caught it: 2026-09-20). Only what remains is judged synthetic.
      const text = cleanPrompt(raw);

      if (!text) return false;

      if (TASK_NOTE_RE.test(text)) {
        // a monitor's event, or the end of one
        // …and, between turns, what wakes the next one (2026-10-31): a turn begun by the chat's own task stays Watching
        const was = session.woke;

        if (!session.turnStart) session.woke = ts;
        const ended = noteAgentNotices(session, text, ts); // an agent's: how it ended (2026-11-02)

        return noteTaskEvent(session, text, ts) || was !== session.woke || ended;
      }

      if (CLEAR_RE.test(text)) {
        session.clearedAt = ts;
        tickCleared(session);
      } // a chat born of /clear: the one it left is done

      if (text.startsWith('<bash-input>')) {
        noteGitCmd(session.gitCmds, /<bash-input>([\s\S]*?)<\/bash-input>/.exec(text)?.[1], ts);
      } // a `!` command of yours: the chat's own

      if (SYNTHETIC_RE.test(text)) return false;
      pushEntry(session, { role: 'user', kind: 'text', text, ts, uuid: line.uuid });
      notePrs(session, text, ts, 'user');
      noteTickets(session, text, ts, 'user');
      session.lastPrompt = plainSnippet(text, 200);
      session.firstPrompt ??= plainSnippet(text, 400);
      branchHeard(session);

      // A prompt starts the turn; one typed mid-turn is part of it — and the files it edits (the changes tab's `turn`). Not
      // a turn the claude that began it never closed (2026-10-14): killed or crashed mid-way, and this prompt typed into
      // the claude that resumed the chat since — begun before it started, the prompt after.
      const born = Number(session.live?.startedAt);
      const orphan = session.turnStart && born > Date.parse(session.turnStart) && born <= Date.parse(ts);

      if (orphan) noteSpan(session, 'w', session.turnStart, session.lastActivity); // the turn as far as it went

      if (!session.turnStart || session.status !== 'working' || orphan) {
        session.turnStart = ts;
        session.turnFiles = new Set();
      }

      session.compacting = /^\/compact(\s|$)/.test(text);
      session.lastActivity = ts;
      session.lastUserAt = ts;
      session.woke = null;
      session.stopped = null; // your word: the turn is yours, and whatever stopped the last is behind it
      setStatus(session, 'working', ts);
      return true;
    }

    case 'assistant': {
      if (line.isSidechain) {
        for (const command of bashCmds(line)) noteGitCmd(session.gitCmds, command, ts, line.message?.id);
        return false;
      } // a sub-agent's git is the chat's own

      if (line.cwd) session.cwd = line.cwd;

      if (line.entrypoint) {
        session.entrypoint = line.entrypoint;
        session.entrypointAt = ts;
      }

      const message = line.message || {};
      const blocks = Array.isArray(message.content) ? message.content : [];

      if (message.model && message.model !== '<synthetic>') session.model = message.model; // an API error's line, not what the chat runs on

      let needsInput = false;
      let said = null;

      session.turnStart ??= ts; // a turn no word of yours began — a task's notice woke it — starts at its first line

      for (const block of blocks) {
        if (block.type === 'text' && block.text?.trim()) {
          pushEntry(session, (said = { role: 'assistant', kind: 'text', text: block.text, ts, msgId: message.id }));
          notePrs(session, block.text, ts, 'claude');
          noteTickets(session, block.text, ts, 'claude');
        } else if (block.type === 'tool_use') {
          const entry = {
            role: 'assistant',
            kind: 'tool_use',
            name: block.name,
            text: summarizeToolInput(block.name, block.input),
            toolUseId: block.id,
            ts,
          };

          if (block.name === 'SendMessage') noteSend(session, entry, block);
          if (block.name === 'Agent' && pstr(block.input?.name)) entry.who = block.input.name;
          if (SPAWN_TOOLS.has(block.name) && pstr(block.input?.name)) noteMateType(session, block.input);
          if (block.name === 'Skill' && pstr(block.input?.args)) entry.args = snippet(block.input.args, 140); // a fork's words: which PR this review is of
          pushEntry(session, entry);

          if (EDIT_TOOLS.has(block.name) && (block.input?.file_path || block.input?.notebook_path)) {
            (session.turnFiles ||= new Set()).add(block.input.file_path || block.input.notebook_path);
          }

          if (NEEDS_INPUT_TOOLS.has(block.name)) {
            const opts = block.input?.questions?.[0]?.options;
            const list = Array.isArray(opts) ? opts : []; // a model's own input: options as a string once (2026-10-14)

            session.askOpen = { id: block.id, from: ts };
            needsInput = true;

            session.ask = {
              tool: block.name,
              text: summarizeToolInput(block.name, block.input),
              options: list.length,
              labels: list.slice(0, 9).map(option => snippet(option?.label, 40)),
            };
          }

          if (block.name === 'Monitor' || (block.name === 'Bash' && block.input?.run_in_background)) {
            noteTaskCall(session, block);
          }

          if (WAKE_TOOLS.has(block.name)) noteWakeCall(session, block, ts);

          if (block.name === 'Bash') {
            noteGitCmd(session.gitCmds, block.input?.command, ts, message.id);
            noteActsCalled(session, block, ts, line.gitBranch);
            noteOpening(session, block, ts);
          }

          if (block.name === 'TaskStop' && session.tasks?.size) {
            const inputJson = JSON.stringify(block.input || '');

            for (const id of [...session.tasks.keys()]) if (inputJson.includes(id)) session.tasks.delete(id);
          }
        }
      }

      noteBranch(session, line, ts);
      session.lastActivity = ts;

      if (endsTurn(message)) {
        const text = textOf(blocks).trim();

        if (text) {
          session.lastReply = plainSnippet(text, 300);
          session.lastReplyAt = ts;
          session.replyText = cut(text, HANDOFF_TEXT);
        }

        // the reply that ends the turn, and how long since your last word it took — the transcript's footer under it
        // (2026-10-08); pushed in this same tick, so the page gets it marked
        if (said) {
          said.turnEnd = true;
          const ms = Date.parse(ts) - Date.parse(session.turnStart);

          if (ms > 0) said.worked = ms;
        }

        noteSpan(session, 'w', session.turnStart, ts); // the day's timeline (2026-10-10): the turn, prompt to reply
        session.turnStart = null;
        session.compacting = false;
        session.woke = null;
        session.stopped = stopOf(line, message, text, ts);
        setStatus(session, 'idle', ts);
        if (!session.agentsRunning) queueNotify(session, 'reply'); // a turn that ends with agents still at work is not the reply yet
      } else if (needsInput) {
        setStatus(session, 'needs-input', ts);
        queueNotify(session, 'needs-input');
      } else if (message.stop_reason === 'tool_use') {
        setStatus(session, 'working', ts);
      }

      return true;
    }

    case 'attachment': {
      const peer = !line.isSidechain && peerOf(line);

      return peer ? notePeer(session, peer, ts) : false;
    } // a message taken in mid-turn (2026-10-31)

    case 'queue-operation':
      return notePeerQueue(session, line, ts);
    default:
      return false;
  }
}
