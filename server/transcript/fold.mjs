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

function setStatus(s, status, ts) {
  if (s.status !== status) {
    s.status = status;
    s.statusSince = ts || new Date().toISOString();
  }
}

/** The last few things a chat did, kept for every chat, open or not (2026-10-10): what the overview's
 *  tiles show of one with no drawer here — its tool calls with their results, its words — short. */
const RECENT_MAX = 16;

function noteRecent(s, e) {
  if (!['tool_use', 'tool_result', 'text', 'interrupt'].includes(e.kind)) return;

  const r = {
    role: e.role,
    kind: e.kind,
    ts: e.ts,
    text: e.kind === 'text' ? plainSnippet(e.text, 220) : snippet(e.text, e.kind === 'tool_result' ? 120 : 220),
  };

  if (e.name) r.name = e.name;
  if (e.toolUseId) r.toolUseId = e.toolUseId;
  if (e.isError) r.isError = true;
  (s.recent ||= []).push(r);
  if (s.recent.length > RECENT_MAX) s.recent.splice(0, s.recent.length - RECENT_MAX);
}

/** What a turn at work is doing now (2026-10-11), for the card's live line: the newest tool call since your last word
 *  — its tool and what it was given, as the transcript summarizes it — or null when the turn has called none yet. */
export function doingOf(s) {
  const r = s.recent || [];

  for (let i = r.length - 1; i >= 0; i--) {
    const x = r[i];

    if (x.role === 'user' && (x.kind === 'text' || x.kind === 'interrupt')) return null;
    if (x.kind === 'tool_use') return { name: x.name || 'tool', text: x.text || '', ts: x.ts || null };
  }

  return null;
}

export function pushEntry(s, entry) {
  s.entryCount++;
  noteRecent(s, entry);
  if (!s.loaded) return;
  s.entries.push(entry);
  if (s.entries.length > MAX_ENTRIES) s.entries.splice(0, s.entries.length - MAX_ENTRIES);
  if (!s.reading) s.newEntries.push(entry); // a whole read is nothing new — every entry of it was kept twice until its end
}

const NEEDS_INPUT_TOOLS = new Set(['AskUserQuestion', 'ExitPlanMode']);
const TURN_ENDS = new Set(['end_turn', 'stop_sequence', 'max_tokens', 'refusal']);

/** An assistant message that ends its turn — a chat's, or a sub-agent's (agentRunning): end_turn, or max_tokens or a
 *  refusal (2026-10-03: a turn that ran out of tokens stayed working and its reply was never alerted), unless what ran
 *  out was a tool call Claude Code goes on with. */
export const endsTurn = m =>
  TURN_ENDS.has(m?.stop_reason) &&
  !(m.stop_reason === 'max_tokens' && Array.isArray(m.content) && m.content.some(b => b?.type === 'tool_use'));

/** A turn that ended on something other than an answer (2026-10-31, round XIII's S4), or null: an API error Claude Code
 *  wrote after its retries — a `<synthetic>` line flagged `isApiErrorMessage`, its words "API Error: …", `error` a kind
 *  (server_error, authentication_failed, invalid_request…) —, a reply the token limit cut, a refusal. */
export function stopOf(line, m, text, ts) {
  if (line.isApiErrorMessage) {
    const t = String(text || '').replace(/^API Error:\s*/i, '');
    const code = /^(\d{3})\b/.exec(t)?.[1];
    const msg = /"message"\s*:\s*"([^"]+)"/.exec(t)?.[1];

    const why = msg || t.replace(/^\d{3}\s*/, '').split(/(?<=[.!?])\s/)[0];

    return {
      why: 'api',
      text: snippet(`${code ? `${code} · ` : ''}${why}`, 90) || null,
      kind: typeof line.error === 'string' ? line.error : null,
      at: ts,
    };
  }

  if (m.stop_reason === 'max_tokens') return { why: 'max_tokens', text: null, kind: null, at: ts };
  if (m.stop_reason === 'refusal') return { why: 'refusal', text: null, kind: null, at: ts };
  return null;
}

/** Fold one JSONL line into the session. Returns true if the session summary changed. */
export function fold(s, line) {
  const ts = line.timestamp || null;

  switch (line.type) {
    case 'ai-title':
      if (line.aiTitle) s.title = line.aiTitle;
      return true;
    case 'continued-in':
      if (line.continuedInSessionId) noteContinued(s, line.continuedInSessionId, ts);
      return false;
    case 'custom-title':
      s.customTitle = line.customTitle || line.title || null;
      return true;
    case 'agent-setting':
      s.agent = typeof line.agentSetting === 'string' && line.agentSetting ? line.agentSetting : null;
      return true; // the agent it runs as (2026-11-06): --agent, or its folder's setting
    case 'last-prompt':
      if (!s.lastPrompt && line.lastPrompt) s.lastPrompt = plainSnippet(line.lastPrompt, 200);
      return true; // whole, it was a card's and a search's to carry

    case 'pr-link': {
      const url = line.prUrl || line.url;

      if (url) notePr(s, url, ts, null);
      return true;
    }

    case 'system':
      // Claude Code's own recap of where a chat stands, written as you come back to it (2026-10-31): a handoff's first
      // word on it — `{type: system, subtype: away_summary, content: <text>}`, measured on this Mac's transcripts
      if (line.subtype === 'away_summary' && typeof line.content === 'string' && line.content.trim()) {
        s.away = { text: cut(line.content.trim(), HANDOFF_TEXT), at: ts };
        return false;
      }

      if (line.subtype !== 'compact_boundary') return false;
      pushEntry(s, { role: 'system', kind: 'compact', text: 'Conversation compacted', ts });
      if (!s.compacting) return false; // one Claude Code ran mid-turn on its own: the turn goes on
      // the /compact you typed is done (2026-10-14): no reply ever closes its turn, and the next prompt was taken for
      // part of it — "worked for 182 min", a day's span over the idle hours between
      s.compacting = false;
      noteSpan(s, 'w', s.turnStart, ts);
      s.turnStart = null;
      setStatus(s, 'idle', ts);
      return true;

    case 'user': {
      if (line.isSidechain) return false;
      if (!s.truncatedHead) noteFirstLine(s, line); // a tail's first is not the chat's: headPrs read that
      if (line.cwd) s.cwd = line.cwd;

      if (line.entrypoint) {
        s.entrypoint = line.entrypoint;
        s.entrypointAt = ts;
      }

      if (line.gitBranch) {
        s.gitBranch = line.gitBranch;
        if (line.gitBranch !== s.ticketBranch) noteBranchTicket(s, line.gitBranch, ts);
      }

      noteBranch(s, line, ts);

      if (line.isMeta) {
        const p = peerOf(line);

        if (p) return notePeer(s, p, ts);
      } // another chat's message (2026-10-31): drawn, never your word

      const fired = line.turnOrigin === 'scheduled' && wakeFired(s, ts); // a wake-up it set itself went off (2026-10-31): its prompt is a meta line

      if (line.isMeta || line.isCompactSummary) return fired;
      const content = line.message?.content;
      const blocks = Array.isArray(content) ? content : null;
      const toolResults = blocks ? blocks.filter(b => b?.type === 'tool_result') : [];

      if (toolResults.length) {
        for (const b of toolResults) {
          startTask(s, b, ts);
          if (s.wakeCalls?.size) startWake(s, b, line.toolUseResult, ts);

          pushEntry(s, {
            role: 'user',
            kind: 'tool_result',
            toolUseId: b.tool_use_id,
            isError: !!b.is_error,
            text: toolResultSnippet(b),
            ts,
            ...(toolResults.length === 1 && agentNamed(line.toolUseResult)),
          });

          if (s.actsWait.size) noteActsDone(s, b);
          if (s.opening.size) noteOpened(s, b);
          if (s.sends?.size) noteSent(s, b, line.toolUseResult, ts);

          if (s.askOpen?.id === b.tool_use_id) {
            noteSpan(s, 'a', s.askOpen.from, ts);
            s.askOpen = null;
          } // a question and its answer: the time it waited on you
        }

        s.lastActivity = ts;

        if (s.status === 'needs-input') {
          // question answered — that was you
          s.lastUserAt = ts;
          s.woke = null;
          setStatus(s, 'working', ts);
          // …and the question's line arrived with its answer (see waitingOn): an alert for it now would be after the fact
          s.pendingNotify?.delete('needs-input');
        }

        return true;
      }

      const raw = textOf(content);

      if (raw.startsWith('[Request interrupted')) {
        pushEntry(s, { role: 'user', kind: 'interrupt', text: raw, ts });
        s.lastActivity = ts;
        s.lastUserAt = ts; // Escape is you acting on the chat too
        noteSpan(s, 'w', s.turnStart, ts);
        s.askOpen = null;
        s.turnStart = null;
        s.compacting = false;
        s.woke = null;
        s.stopped = null; // stopped by you: no error
        setStatus(s, 'idle', ts);
        return true;
      }

      // The reminder blocks go first: Claude Code puts them at the head of the user's own text, and a prompt that
      // follows one is a prompt (the test that caught it: 2026-09-20). Only what remains is judged synthetic.
      const text = cleanPrompt(raw);

      if (!text) return false;

      if (TASK_NOTE_RE.test(text)) {
        // a monitor's event, or the end of one
        // …and, between turns, what wakes the next one (2026-10-31): a turn begun by the chat's own task stays Watching
        const was = s.woke;

        if (!s.turnStart) s.woke = ts;
        const ended = noteAgentNotices(s, text, ts); // an agent's: how it ended (2026-11-02)

        return noteTaskEvent(s, text, ts) || was !== s.woke || ended;
      }

      if (CLEAR_RE.test(text)) {
        s.clearedAt = ts;
        tickCleared(s);
      } // a chat born of /clear: the one it left is done

      if (text.startsWith('<bash-input>')) {
        noteGitCmd(s.gitCmds, /<bash-input>([\s\S]*?)<\/bash-input>/.exec(text)?.[1], ts);
      } // a `!` command of yours: the chat's own

      if (SYNTHETIC_RE.test(text)) return false;
      pushEntry(s, { role: 'user', kind: 'text', text, ts, uuid: line.uuid });
      notePrs(s, text, ts, 'user');
      noteTickets(s, text, ts, 'user');
      s.lastPrompt = plainSnippet(text, 200);
      s.firstPrompt ??= plainSnippet(text, 400);
      branchHeard(s);

      // A prompt starts the turn; one typed mid-turn is part of it — and the files it edits (the changes tab's `turn`). Not
      // a turn the claude that began it never closed (2026-10-14): killed or crashed mid-way, and this prompt typed into
      // the claude that resumed the chat since — begun before it started, the prompt after.
      const born = Number(s.live?.startedAt);
      const orphan = s.turnStart && born > Date.parse(s.turnStart) && born <= Date.parse(ts);

      if (orphan) noteSpan(s, 'w', s.turnStart, s.lastActivity); // the turn as far as it went

      if (!s.turnStart || s.status !== 'working' || orphan) {
        s.turnStart = ts;
        s.turnFiles = new Set();
      }

      s.compacting = /^\/compact(\s|$)/.test(text);
      s.lastActivity = ts;
      s.lastUserAt = ts;
      s.woke = null;
      s.stopped = null; // your word: the turn is yours, and whatever stopped the last is behind it
      setStatus(s, 'working', ts);
      return true;
    }

    case 'assistant': {
      if (line.isSidechain) {
        for (const c of bashCmds(line)) noteGitCmd(s.gitCmds, c, ts, line.message?.id);
        return false;
      } // a sub-agent's git is the chat's own

      if (line.cwd) s.cwd = line.cwd;

      if (line.entrypoint) {
        s.entrypoint = line.entrypoint;
        s.entrypointAt = ts;
      }

      const m = line.message || {};
      const blocks = Array.isArray(m.content) ? m.content : [];

      if (m.model && m.model !== '<synthetic>') s.model = m.model; // an API error's line, not what the chat runs on

      let needsInput = false;
      let said = null;

      s.turnStart ??= ts; // a turn no word of yours began — a task's notice woke it — starts at its first line

      for (const b of blocks) {
        if (b.type === 'text' && b.text?.trim()) {
          pushEntry(s, (said = { role: 'assistant', kind: 'text', text: b.text, ts, msgId: m.id }));
          notePrs(s, b.text, ts, 'claude');
          noteTickets(s, b.text, ts, 'claude');
        } else if (b.type === 'tool_use') {
          const e = {
            role: 'assistant',
            kind: 'tool_use',
            name: b.name,
            text: summarizeToolInput(b.name, b.input),
            toolUseId: b.id,
            ts,
          };

          if (b.name === 'SendMessage') noteSend(s, e, b);
          if (b.name === 'Agent' && pstr(b.input?.name)) e.who = b.input.name;
          if (SPAWN_TOOLS.has(b.name) && pstr(b.input?.name)) noteMateType(s, b.input);
          if (b.name === 'Skill' && pstr(b.input?.args)) e.args = snippet(b.input.args, 140); // a fork's words: which PR this review is of
          pushEntry(s, e);

          if (EDIT_TOOLS.has(b.name) && (b.input?.file_path || b.input?.notebook_path)) {
            (s.turnFiles ||= new Set()).add(b.input.file_path || b.input.notebook_path);
          }

          if (NEEDS_INPUT_TOOLS.has(b.name)) {
            const opts = b.input?.questions?.[0]?.options;
            const list = Array.isArray(opts) ? opts : []; // a model's own input: options as a string once (2026-10-14)

            s.askOpen = { id: b.id, from: ts };
            needsInput = true;

            s.ask = {
              tool: b.name,
              text: summarizeToolInput(b.name, b.input),
              options: list.length,
              labels: list.slice(0, 9).map(o => snippet(o?.label, 40)),
            };
          }

          if (b.name === 'Monitor' || (b.name === 'Bash' && b.input?.run_in_background)) noteTaskCall(s, b);
          if (WAKE_TOOLS.has(b.name)) noteWakeCall(s, b, ts);

          if (b.name === 'Bash') {
            noteGitCmd(s.gitCmds, b.input?.command, ts, m.id);
            noteActsCalled(s, b, ts, line.gitBranch);
            noteOpening(s, b, ts);
          }

          if (b.name === 'TaskStop' && s.tasks?.size) {
            const j = JSON.stringify(b.input || '');

            for (const id of [...s.tasks.keys()]) if (j.includes(id)) s.tasks.delete(id);
          }
        }
      }

      noteBranch(s, line, ts);
      s.lastActivity = ts;

      if (endsTurn(m)) {
        const text = textOf(blocks).trim();

        if (text) {
          s.lastReply = plainSnippet(text, 300);
          s.lastReplyAt = ts;
          s.replyText = cut(text, HANDOFF_TEXT);
        }

        // the reply that ends the turn, and how long since your last word it took — the transcript's footer under it
        // (2026-10-08); pushed in this same tick, so the page gets it marked
        if (said) {
          said.turnEnd = true;
          const ms = Date.parse(ts) - Date.parse(s.turnStart);

          if (ms > 0) said.worked = ms;
        }

        noteSpan(s, 'w', s.turnStart, ts); // the day's timeline (2026-10-10): the turn, prompt to reply
        s.turnStart = null;
        s.compacting = false;
        s.woke = null;
        s.stopped = stopOf(line, m, text, ts);
        setStatus(s, 'idle', ts);
        if (!s.agentsRunning) queueNotify(s, 'reply'); // a turn that ends with agents still at work is not the reply yet
      } else if (needsInput) {
        setStatus(s, 'needs-input', ts);
        queueNotify(s, 'needs-input');
      } else if (m.stop_reason === 'tool_use') {
        setStatus(s, 'working', ts);
      }

      return true;
    }

    case 'attachment': {
      const p = !line.isSidechain && peerOf(line);

      return p ? notePeer(s, p, ts) : false;
    } // a message taken in mid-turn (2026-10-31)

    case 'queue-operation':
      return notePeerQueue(s, line, ts);
    default:
      return false;
  }
}
