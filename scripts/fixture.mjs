#!/usr/bin/env node
// A ~/.claude look-alike for tests: projects/<slug>/<id>.jsonl per chat, an empty sessions/ (nothing alive).
//   node scripts/fixture.mjs <dir>        # the default fixture (a two-PR chat, a plain one), prints its chats as JSON
// Or from a script: makeFixture(dir, [{ id?, cwd, prompt, reply, title?, at?, model?, branch?, lines?, live? }]) → { dir, chats: […] }.
// The lines carry what the server reads (fold(), server/transcript/fold.mjs): user/assistant messages with text blocks, ai-title, pr-link —
// and, through `lines` (toolLines / taskNoteLine below), the tool calls and task notifications a chat mid-work has.
// `live: { pid, startedAt }` writes the registry file that makes a chat *alive*: the states that only exist while a
// claude is running — a pending question, a monitor, sub-agents — need one, and any live pid will do (the server
// only asks whether it is there). `status` / `waitingFor` on it go into the file as Claude Code writes them
// (`waiting` + `permission prompt` is a chat blocked on a prompt the transcript knows nothing of). A pid that is running
// gets its `procStart` as Claude Code writes it (2026-10-14), one made up none; `live.procStart` says it outright.
import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdirSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

export const slugOf = cwd => cwd.replace(/[/.]/g, '-');

/** This time yesterday, by the calendar (2026-10-14): a day of 86 400 000 ms is an hour off across a DST change. */
export const yesterday = () => {
  const date = new Date();

  date.setDate(date.getDate() - 1);
  return date;
};

/** The JSONL lines of one chat: prompt, reply (end_turn), optionally an ai-title. `at` is the reply's time. */
export function chatLines({
  id,
  cwd,
  prompt,
  reply,
  title = null,
  at = yesterday(),
  entrypoint = 'cli',
  model = 'fixture-1',
  branch = 'main',
}) {
  const ts = ms => new Date(at.getTime() + ms).toISOString();

  const userUuid = randomUUID();
  const assistantUuid = randomUUID();

  const base = {
    isSidechain: false,
    userType: 'external',
    entrypoint,
    cwd,
    sessionId: id,
    version: 'fixture',
    gitBranch: branch,
  };

  const lines = [
    {
      ...base,
      parentUuid: null,
      type: 'user',
      message: { role: 'user', content: [{ type: 'text', text: prompt }] },
      uuid: userUuid,
      timestamp: ts(-60_000),
    },
    {
      ...base,
      parentUuid: userUuid,
      type: 'assistant',
      message: {
        model,
        id: `msg_${assistantUuid.slice(0, 8)}`,
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: reply }],
        stop_reason: 'end_turn',
      },
      uuid: assistantUuid,
      timestamp: ts(0),
    },
  ];

  if (title) lines.push({ type: 'ai-title', sessionId: id, aiTitle: title });
  return lines;
}

/** The base every line of a chat carries — the fields fold() reads off any of them. */
const lineBase = (id, cwd, entrypoint = 'cli') => ({
  isSidechain: false,
  userType: 'external',
  entrypoint,
  cwd,
  sessionId: id,
  version: 'fixture',
  gitBranch: 'main',
});

/** A turn that calls a tool and stops there (stop_reason 'tool_use' — the chat is working), and its result if the
 *  tool answered. A call with no result is what a chat waiting on you looked like to a claude that reports no
 *  status (AskUserQuestion, ExitPlanMode); a real one writes that line only with its answer — see `live.status`. */
export function toolLines({ id, cwd, name, input, result = null, toolUseResult = null, at = new Date() }) {
  const base = lineBase(id, cwd);
  const useId = `toolu_${randomUUID().replace(/-/g, '').slice(0, 20)}`;

  const lines = [
    {
      ...base,
      parentUuid: null,
      type: 'assistant',
      uuid: randomUUID(),
      timestamp: at.toISOString(),
      message: {
        model: 'fixture-1',
        id: `msg_${useId.slice(6, 14)}`,
        type: 'message',
        role: 'assistant',
        content: [{ type: 'tool_use', id: useId, name, input }],
        stop_reason: 'tool_use',
      },
    },
  ];

  if (result !== null) {
    lines.push({
      ...base,
      parentUuid: null,
      type: 'user',
      uuid: randomUUID(),
      timestamp: new Date(at.getTime() + 1000).toISOString(),
      message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: useId, content: result }] },
      ...(toolUseResult && { toolUseResult }),
    });
  }

  return lines;
}

/** The meta line a wake-up the chat set itself writes when it goes off (2026-10-31): `/loop`'s prompt, `turnOrigin` scheduled. */
export function scheduledLine({ id, cwd, at = new Date() }) {
  return {
    ...lineBase(id, cwd),
    parentUuid: null,
    type: 'user',
    isMeta: true,
    promptSource: 'system',
    turnOrigin: 'scheduled',
    uuid: randomUUID(),
    timestamp: at.toISOString(),
    message: { role: 'user', content: 'the loop again' },
  };
}

/** The line Claude Code writes when a turn dies on an API error after its retries: synthetic, flagged, its words the error. */
export function apiErrorLines({
  id,
  cwd,
  text = 'API Error: Connection lost mid-response. The response may be incomplete.',
  error = 'server_error',
  at = new Date(),
}) {
  return [
    {
      ...lineBase(id, cwd),
      parentUuid: null,
      type: 'assistant',
      uuid: randomUUID(),
      timestamp: at.toISOString(),
      error,
      isApiErrorMessage: true,
      message: {
        model: '<synthetic>',
        id: `msg_${randomUUID().slice(0, 8)}`,
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text }],
        stop_reason: 'stop_sequence',
      },
    },
  ];
}

/** A `<task-notification>` line: an event of a running task, or — with a status — the end of one. */
export function taskNoteLine({ id, cwd, taskId, summary = '', event = '', status = null, at = new Date() }) {
  const body = `<task-notification>\n<task-id>${taskId}</task-id>\n${status ? `<status>${status}</status>\n` : ''}<summary>${summary}</summary>\n${event ? `<event>${event}</event>\n` : ''}</task-notification>`;

  return {
    ...lineBase(id, cwd),
    parentUuid: null,
    type: 'user',
    uuid: randomUUID(),
    timestamp: at.toISOString(),
    message: { role: 'user', content: [{ type: 'text', text: body }] },
  };
}

/** The `pr-link` line Claude Code writes once the chat has opened or pushed to a PR — what makes it the chat's own. */
export function prLinkLine({ id, url, at = new Date() }) {
  const match = /github\.com\/([^/]+\/[^/]+)\/pull\/(\d+)/.exec(url);

  return {
    type: 'pr-link',
    sessionId: id,
    prNumber: Number(match?.[2]),
    prUrl: url,
    prRepository: match?.[1],
    timestamp: at.toISOString(),
  };
}

/** A turn of plain words that ends (stop_reason 'end_turn') — the chat goes ready. */
export function replyLines({ id, cwd, text, at = new Date(), model = 'fixture-1' }) {
  return [
    {
      ...lineBase(id, cwd),
      parentUuid: null,
      type: 'assistant',
      uuid: randomUUID(),
      timestamp: at.toISOString(),
      message: {
        model,
        id: `msg_${randomUUID().slice(0, 8)}`,
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text }],
        stop_reason: 'end_turn',
      },
    },
  ];
}

/** A message between two chats (2026-10-31), in the shapes Claude Code 2.1.3xx writes and this Mac showed — keys as
 *  read there, the words stand-ins. `sent`: the sender's SendMessage call and its result (a `msg_id`, no `routing`);
 *  `queued`: the receiver's `queue-operation` enqueue and dequeue while it was at work; `delivered`: the receiver's meta
 *  `user` line with `origin.kind: "peer"`; `absorbed`: the same taken in mid-turn, a `queued_command` attachment. */
export function peerLines({
  from,
  to,
  fromName,
  toName,
  pid,
  body,
  msgId = randomUUID(),
  at = new Date(),
  mode = 'prompting',
}) {
  const ts = ms => new Date(at.getTime() + ms).toISOString();
  const sock = `uds:/tmp/cc-socks/${pid}.sock`;

  const xml = text => text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const envelope = `<cross-session-message from="${sock}" from-name="${xml(fromName)}" from-mode="${mode}">\n${body}\n</cross-session-message>`;

  const origin = {
    kind: 'peer',
    from: sock,
    name: fromName,
    fromMode: mode,
    msg_id: msgId,
    verifiedPeerPid: pid,
    body,
  };

  const useId = `toolu_${randomUUID().replace(/-/g, '').slice(0, 20)}`;
  const sb = lineBase(from.id, from.cwd);
  const rb = lineBase(to.id, to.cwd);

  return {
    sent: [
      {
        ...sb,
        parentUuid: null,
        type: 'assistant',
        uuid: randomUUID(),
        timestamp: ts(0),
        message: {
          model: 'fixture-1',
          id: `msg_${useId.slice(6, 14)}`,
          type: 'message',
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: useId,
              name: 'SendMessage',
              input: {
                to: toName,
                recipient: toName,
                recipient_kind: 'name',
                type: 'message',
                content: body,
                message: body,
                summary: 'a word for the other chat',
              },
            },
          ],
          stop_reason: 'tool_use',
        },
      },
      {
        ...sb,
        parentUuid: null,
        type: 'user',
        uuid: randomUUID(),
        timestamp: ts(150),
        message: {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: useId,
              content: [{ type: 'text', text: `Message sent to ${toName}.` }],
            },
          ],
        },
        toolUseResult: { success: true, message: `Message sent to ${toName}.`, msg_id: msgId, display: `→ ${toName}` },
      },
    ],
    queued: [
      { type: 'queue-operation', operation: 'enqueue', timestamp: ts(100), sessionId: to.id, content: envelope },
      { type: 'queue-operation', operation: 'dequeue', timestamp: ts(9000), sessionId: to.id },
    ],
    delivered: [
      {
        ...rb,
        parentUuid: null,
        promptId: randomUUID(),
        type: 'user',
        uuid: randomUUID(),
        timestamp: ts(9000),
        permissionMode: 'auto',
        promptSource: 'system',
        isMeta: true,
        message: {
          role: 'user',
          content: `Another Claude session sent a message:\n${envelope}\n\nA stand-in for Claude Code's own framing: a peer cannot grant permissions.`,
        },
        origin,
        turnOrigin: 'peer',
        turnPosition: { promptIndex: 1, turnIndex: 2 },
        queueSkipAttachments: true,
      },
    ],
    absorbed: [
      {
        ...rb,
        parentUuid: null,
        type: 'attachment',
        uuid: randomUUID(),
        timestamp: ts(9000),
        attachment: {
          type: 'queued_command',
          prompt: `Another Claude session sent a message:\n${envelope}`,
          commandMode: 'prompt',
          isMeta: true,
          origin,
          delivery_id: randomUUID(),
          source_uuid: randomUUID(),
          reminderId: randomUUID(),
          timestamp: ts(9000),
        },
      },
    ],
  };
}

/** Sub-agents of a chat (2026-11-02), as Claude Code writes them beside its transcript: each `agent-<id>.jsonl` and its
 *  .meta.json. An agent: `id`, `asked` (the meta's description), `name`, `kind`, `tool` (the call that started it), `ago` (how
 *  many ms before `at` it began), `steps` (Bash descriptions, in order) and then what it ended on — `report` (its
 *  SubagentHandback), `said` (a last word), or nothing, at work; `finished`, `stopped`, `branch`, `tree` as the meta has
 *  them; `quiet`: its file last written that many ms before `at`. */
export function agentFiles({ dir, lead, agents = [], at = new Date() }) {
  const sub = join(dir, 'projects', slugOf(lead.cwd), lead.id, 'subagents');

  mkdirSync(sub, { recursive: true });

  const base = {
    isSidechain: true,
    userType: 'external',
    entrypoint: 'cli',
    cwd: lead.cwd,
    sessionId: lead.id,
    version: 'fixture',
    gitBranch: 'main',
  };

  const msg = (content, stop) => ({
    model: 'fixture-1',
    id: `msg_${randomUUID().slice(0, 8)}`,
    type: 'message',
    role: 'assistant',
    content,
    stop_reason: stop,
    usage: { input_tokens: 10, cache_read_input_tokens: 1000, output_tokens: 20 },
  });

  const files = {};

  for (const agent of agents) {
    const from = at.getTime() - (agent.ago || 0);
    const step = index => new Date(from + 1000 * (index + 1)).toISOString();
    const agentId = agent.id;
    const ls = [];

    const line = fields => ls.push({ ...base, agentId, uuid: randomUUID(), parentUuid: null, ...fields });

    line({
      type: 'user',
      timestamp: new Date(from).toISOString(),
      message: { role: 'user', content: agent.prompt || agent.asked || 'go' },
    });

    (agent.steps || []).forEach((description, index) => {
      const id = `toolu_${randomUUID().replace(/-/g, '').slice(0, 20)}`;

      line({
        type: 'assistant',
        timestamp: step(index),
        message: msg([{ type: 'tool_use', id, name: 'Bash', input: { command: 'true', description } }], 'tool_use'),
      });

      if (index < agent.steps.length - 1 || agent.report || agent.said) {
        line({
          type: 'user',
          timestamp: step(index),
          message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: 'ok' }] },
        });
      }
    });

    const tail = (agent.steps || []).length;

    if (agent.report) {
      const id = `toolu_${randomUUID().replace(/-/g, '').slice(0, 20)}`;

      line({
        type: 'assistant',
        timestamp: step(tail),
        message: msg(
          [{ type: 'tool_use', id, name: 'SubagentHandback', input: { message: agent.report } }],
          'tool_use',
        ),
      });

      line({
        type: 'user',
        timestamp: step(tail),
        message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: 'Handed back.' }] },
      });
    } else if (agent.said) {
      line({
        type: 'assistant',
        timestamp: step(tail),
        message: msg([{ type: 'text', text: agent.said }], 'end_turn'),
      });
    }

    const file = join(sub, `agent-${agentId}.jsonl`);

    writeFileSync(file, `${ls.map(entry => JSON.stringify(entry)).join('\n')}\n`);

    writeFileSync(
      join(sub, `agent-${agentId}.meta.json`),
      JSON.stringify({
        agentType: agent.kind || 'general-purpose',
        isBuiltIn: true,
        description: agent.asked,
        spawnDepth: 1,
        requestShape: 'background',
        requestNonInteractive: false,
        ...(agent.tool ? { toolUseId: agent.tool } : {}),
        ...(agent.name ? { name: agent.name } : {}),
        ...(agent.finished ? { finished: true } : {}),
        ...(agent.stopped ? { stoppedByUser: true } : {}),
        ...(agent.branch ? { worktreeBranch: agent.branch } : {}),
        ...(agent.tree ? { worktreePath: agent.tree, spawnedWithWorktree: true } : {}),
      }),
    );

    if (agent.quiet != null) {
      const time = new Date(at.getTime() - agent.quiet);

      utimesSync(file, time, time);
      utimesSync(join(sub, `agent-${agentId}.meta.json`), time, time);
    }

    files[agentId] = file;
  }

  return { sub, files };
}

/** An agent's notice in its chat's transcript (2026-11-02): how it stopped, as Claude Code tells the chat. */
export function agentNoteLine({ id, cwd, tool, asked, status = 'completed', said = 'finished', at }) {
  return {
    type: 'user',
    uuid: randomUUID(),
    parentUuid: null,
    isSidechain: false,
    userType: 'external',
    entrypoint: 'cli',
    cwd,
    sessionId: id,
    version: 'fixture',
    gitBranch: 'main',
    timestamp: at || new Date().toISOString(),
    message: {
      role: 'user',
      content: `<task-notification>\n<task-id>a${tool}</task-id>\n<tool-use-id>${tool}</tool-use-id>\n<status>${status}</status>\n<summary>Agent "${asked}" ${said}</summary>\n</task-notification>`,
    },
  };
}

/** An agent team under a lead chat (2026-10-31), as Claude Code's experimental teams write it and this Mac showed it
 *  (keys as read there): `teams/session-<id8>/config.json` with the lead and, when `roster`, its teammates (their
 *  member shape is a guess: none was on this Mac); each teammate a sub-agent file of the lead's, its .meta.json an
 *  in-process teammate's, its first prompt the lead's `<teammate-message>`, then at work on a tool call (`work`) or done
 *  with a last word. `plain`: a background sub-agent of the lead's beside them, no teammate; `also`: names on the roster
 *  with no file of their own yet. `spawned` (2026-11-18): name → the `subagent_type` the lead's Agent call spawned it as (or `{type, tool}`: `Task`, its older name),
 *  written into the lead's transcript — a teammate's category, which its own metadata does not name. */
export function teamFiles({
  dir,
  lead,
  mates = [],
  roster = true,
  plain = false,
  also = [],
  spawned = {},
  at = new Date(),
}) {
  const id8 = lead.id.slice(0, 8);
  const team = `session-${id8}`;
  const ts = ms => new Date(at.getTime() + ms).toISOString();

  const sub = join(dir, 'projects', slugOf(lead.cwd), lead.id, 'subagents');

  mkdirSync(sub, { recursive: true });

  const base = {
    isSidechain: true,
    userType: 'external',
    entrypoint: 'cli',
    cwd: lead.cwd,
    sessionId: lead.id,
    version: 'fixture',
    gitBranch: 'main',
  };

  const agent = (name, meta, ls) => {
    const hash = randomUUID().replace(/-/g, '').slice(0, 16);
    const agentId = `a${name}-${hash}`;

    writeFileSync(join(sub, `agent-${agentId}.meta.json`), JSON.stringify(meta));

    writeFileSync(
      join(sub, `agent-${agentId}.jsonl`),
      `${ls.map(entry => JSON.stringify({ ...base, agentId, uuid: randomUUID(), parentUuid: null, ...entry })).join('\n')}\n`,
    );
  };

  const said = (text, ms) => ({
    type: 'assistant',
    timestamp: ts(ms),
    message: {
      model: 'fixture-1',
      id: `msg_${randomUUID().slice(0, 8)}`,
      type: 'message',
      role: 'assistant',
      content: [{ type: 'text', text }],
      stop_reason: 'end_turn',
    },
  });

  for (const mate of mates) {
    agent(
      mate.name,
      {
        agentType: mate.name,
        ...(mate.spawnedType && { spawnedAgentType: mate.spawnedType, customAgentType: mate.spawnedType }),
        color: mate.color || 'blue',
        description: mate.summary,
        model: 'fixture-1',
        name: mate.name,
        permissionMode: 'auto',
        planModeRequired: false,
        requestNonInteractive: false,
        requestShape: 'background',
        spawnDepth: 1,
        taskKind: 'in_process_teammate',
        teamName: team,
      },
      [
        {
          type: 'user',
          timestamp: ts(0),
          promptId: randomUUID(),
          message: {
            role: 'user',
            content: `<teammate-message teammate_id="team-lead" summary="${mate.summary}">\n${mate.ask || mate.summary}\n</teammate-message>`,
          },
        },
        mate.work
          ? {
              type: 'assistant',
              timestamp: ts(1000),
              message: {
                model: 'fixture-1',
                id: `msg_${randomUUID().slice(0, 8)}`,
                type: 'message',
                role: 'assistant',
                content: [
                  {
                    type: 'tool_use',
                    id: `toolu_${randomUUID().replace(/-/g, '').slice(0, 20)}`,
                    name: 'Bash',
                    input: { command: 'npm test', description: mate.work },
                  },
                ],
                stop_reason: 'tool_use',
              },
            }
          : said(mate.said || 'Done.', 1000),
      ],
    );
  }

  if (plain) {
    agent(
      'explore',
      {
        agentType: 'Explore',
        description: 'look around',
        requestNonInteractive: false,
        requestShape: 'background',
        spawnDepth: 1,
        toolUseId: 'toolu_x',
      },
      [{ type: 'user', timestamp: ts(0), message: { role: 'user', content: 'look around' } }, said('Looked.', 500)],
    );
  }

  for (const [name, said] of Object.entries(spawned)) {
    const { type, tool = 'Agent' } = said && typeof said === 'object' ? said : { type: said };

    appendFileSync(
      lead.file,
      `${JSON.stringify({
        type: 'assistant',
        uuid: randomUUID(),
        parentUuid: null,
        isSidechain: false,
        userType: 'external',
        entrypoint: 'cli',
        cwd: lead.cwd,
        sessionId: lead.id,
        version: 'fixture',
        gitBranch: 'main',
        timestamp: ts(-1000),
        message: {
          model: 'fixture-1',
          id: `msg_${randomUUID().slice(0, 8)}`,
          type: 'message',
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: `toolu_${randomUUID().replace(/-/g, '').slice(0, 20)}`,
              name: tool,
              input: {
                name,
                team_name: team,
                description: `Spawn ${name}`,
                prompt: 'Join the team.',
                ...(type ? { subagent_type: type } : {}),
              },
            },
          ],
          stop_reason: 'tool_use',
        },
      })}\n`,
    );
  }

  const tdir = join(dir, 'teams', team);

  mkdirSync(tdir, { recursive: true });

  const member = (name, extra) => ({
    agentId: `${name}@${team}`,
    name,
    agentType: name,
    joinedAt: at.getTime(),
    tmuxPaneId: '',
    cwd: lead.cwd,
    subscriptions: [],
    backendType: 'in-process',
    ...extra,
  });

  writeFileSync(
    join(tdir, 'config.json'),
    JSON.stringify({
      name: team,
      createdAt: at.getTime(),
      leadAgentId: `team-lead@${team}`,
      leadSessionId: lead.id,
      leadProcess: { pid: lead.pid || 0, pidSpace: 'fixture-host', claimedAt: at.getTime() },
      members: [
        member('team-lead', { agentType: 'team-lead', tmuxPaneId: 'leader' }),
        ...(roster ? mates.map(mate => member(mate.name, { color: mate.color || 'blue' })) : []),
        ...also.map(name => member(name, { color: 'cyan' })),
      ],
    }),
  );

  return { sub, team };
}

/** A running process's start as `ps` gives it in UTC and the C locale — the registry's procStart — or null. */
export function procStartOf(pid) {
  try {
    process.kill(pid, 0);
    return (
      execFileSync('/bin/ps', ['-o', 'lstart=', '-p', String(pid)], {
        encoding: 'utf8',
        env: { ...process.env, LC_ALL: 'C', TZ: 'UTC' },
      }).trim() || null
    );
  } catch {
    return null;
  }
}

export function makeFixture(dir, chats) {
  const sessDir = join(dir, 'sessions');

  mkdirSync(sessDir, { recursive: true });
  const made = [];

  for (const chat of chats) {
    const id = chat.id || randomUUID();
    const projDir = join(dir, 'projects', slugOf(chat.cwd));

    mkdirSync(projDir, { recursive: true });
    const file = join(projDir, `${id}.jsonl`);

    const lines = [
      ...chatLines({ ...chat, id }),
      ...(typeof chat.lines === 'function' ? chat.lines(id) : chat.lines || []),
    ];

    writeFileSync(file, `${lines.map(line => JSON.stringify(line)).join('\n')}\n`);

    // The registry, for a chat that has to look alive: one file per pid, as Claude Code writes it.
    const procStart =
      chat.live && (chat.live.procStart !== undefined ? chat.live.procStart : procStartOf(chat.live.pid));

    if (chat.live) {
      writeFileSync(
        join(sessDir, `${chat.live.pid}.json`),
        JSON.stringify({
          pid: chat.live.pid,
          ...(procStart && { procStart }),
          sessionId: id,
          cwd: chat.cwd,
          startedAt: chat.live.startedAt ?? Date.now() - 3600_000,
          version: 'fixture',
          kind: 'interactive',
          entrypoint: chat.live.entrypoint || 'cli',
          pidDomain: process.platform,
          ...(chat.live.status && { status: chat.live.status, statusUpdatedAt: chat.live.statusAt ?? Date.now() }),
          ...(chat.live.waitingFor && { waitingFor: chat.live.waitingFor }),
          ...(chat.live.name && {
            name: chat.live.name,
            nameSource: 'derived',
            messagingSocketPath: `/tmp/cc-socks/${chat.live.pid}.sock`,
          }), // the name another chat's SendMessage reaches it by (2026-10-31)
          ...(chat.live.agent && { agent: chat.live.agent }), // `claude --agent <name>` (2026-11-18)
        }),
      );
    }

    made.push({ id, cwd: chat.cwd, file, title: chat.title || null, pid: chat.live?.pid || null });
  }

  return { dir, chats: made };
}

/** What most scenarios want: two stale chats in two folders — one mentioning two PRs, one plain. The plain one is
 *  the newer by a whole second, not by however long the first file took to write: the two landed in the same
 *  millisecond now and then, and the board's order between them was then the readdir's (card-signals, 2026-09-27). */
export function defaultFixture(dir, { cwdA = '/Users/test/repo-a', cwdB = '/Users/test/repo-b' } = {}) {
  const at = yesterday();

  return makeFixture(dir, [
    {
      cwd: cwdA,
      at,
      title: 'Two PRs mentioned',
      prompt: 'Look at https://github.com/acme/repo-a/pull/12 and its follow-up https://github.com/acme/repo-a/pull/13',
      reply: 'Both reviewed. #12 is the base, #13 (https://github.com/acme/repo-a/pull/13) depends on it.',
    },
    {
      cwd: cwdB,
      at: new Date(at.getTime() + 1000),
      title: 'Plain chat',
      prompt: 'what day is it?',
      reply: 'It is a fixture. No PRs here.',
    },
  ]);
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const dir = process.argv[2];

  if (!dir) {
    console.error('usage: node scripts/fixture.mjs <dir>');
    process.exit(2);
  }

  console.log(JSON.stringify(defaultFixture(dir), null, 1));
}
