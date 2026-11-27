// A chat's sub-agents, a row each (2026-11-02): what each was asked, what it does now, how it ended — from its .meta.json, its
// transcript and the notice it sends the chat — for the last round only, a failure from before kept; through a throwaway server.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { startTestServer, tmpDir, waitFor } from '../lib/testserver.mjs';
import { agentFiles, agentNoteLine, makeFixture, toolLines } from '../scripts/fixture.mjs';

const standIn = () => spawn('sleep', ['120'], { stdio: 'ignore' });
const MIN = 60_000;

const setup = (agents, notices = []) => {
  const claude = standIn();
  const dir = tmpDir('peix-fx-');
  const started = Date.now() - 60 * MIN;
  const now = new Date();

  const fx = makeFixture(dir, [
    {
      cwd: '/tmp/acme/infra',
      title: 'Review the plan',
      prompt: 'review it',
      reply: 'Sending reviewers out.',
      at: new Date(Date.now() - 30 * MIN),
      live: { pid: claude.pid, startedAt: started },
      lines: id =>
        notices.map(notice =>
          agentNoteLine({ id, cwd: '/tmp/acme/infra', at: new Date(Date.now() - MIN).toISOString(), ...notice }),
        ),
    },
  ]);

  const chat = fx.chats[0];
  const made = agentFiles({ dir, lead: chat, agents, at: now });

  return { p: claude, fx, chat, ...made };
};

const rowsOf = async (srv, id) =>
  (await srv.api('api/sessions')).body.sessions.find(session => session.id === id)?.agentRows;

test(
  'a row per agent of the last round: asked, doing, how it ended; a failure from a round before stays',
  { timeout: 30_000 },
  async () => {
    const {
      p: claude,
      fx,
      chat,
    } = setup(
      [
        { id: 'early', asked: 'An earlier look', ago: 40 * MIN, quiet: 35 * MIN, report: '## Long done' },
        {
          id: 'oldfail',
          asked: 'An earlier failure',
          ago: 38 * MIN,
          quiet: 34 * MIN,
          tool: 'toolu_oldfail',
          steps: ['Read it'],
        },
        {
          id: 'sec',
          asked: 'Review the plan for security',
          ago: 10 * MIN,
          steps: ['Read the plan', 'Parse the ingress rules'],
          branch: 'agent/sec',
          tree: '/tmp/acme/infra/.claude/worktrees/sec',
        },
        {
          id: 'cost',
          asked: 'Price the gateways',
          kind: 'code-reviewer',
          ago: 9 * MIN,
          quiet: MIN,
          report: '## Three **gateways** where one would do\n\nThe rest of it.',
          tool: 'toolu_cost',
          finished: true,
        },
        {
          id: 'logs',
          asked: 'Check flow logs',
          ago: 8 * MIN,
          quiet: MIN,
          tool: 'toolu_logs',
          steps: ['Read the logs'],
          finished: true,
        },
        {
          id: 'hand',
          asked: 'Stopped by hand',
          ago: 7 * MIN,
          quiet: 2 * MIN,
          steps: ['Look'],
          stopped: true,
          finished: true,
        },
        {
          id: 'prev',
          asked: 'Compare with last month',
          ago: 6 * MIN,
          quiet: MIN,
          said: 'Started a diff in the background.',
          tool: 'toolu_prev',
        },
        { id: 'noted', ago: 5 * MIN, quiet: MIN, prompt: 'A prompt as its only words', said: 'Done.' },
      ],
      [
        { tool: 'toolu_cost', asked: 'Price the gateways' },
        {
          tool: 'toolu_logs',
          asked: 'Check flow logs',
          status: 'failed',
          said: 'failed: Agent terminated early due to an API error',
        },
        {
          tool: 'toolu_oldfail',
          asked: 'An earlier failure',
          status: 'failed',
          said: 'failed: Agent terminated early due to an API error',
        },
        { tool: 'toolu_prev', asked: 'Compare with last month', said: 'is waiting on its own background work' },
      ],
    );

    const srv = await startTestServer({ claudeDir: fx.dir });

    try {
      const rows = await waitFor(
        async () => {
          const found = await rowsOf(srv, chat.id);

          return found?.length >= 7 && found;
        },
        { what: 'the rows' },
      );

      const by = id => rows.find(row => row.id === id);

      assert.deepEqual(
        rows.map(row => row.id),
        ['oldfail', 'sec', 'cost', 'logs', 'hand', 'prev', 'noted'],
        'by start, the old round gone but its failure',
      );

      assert.equal(by('oldfail').old, true, 'said to be from a round before');
      assert.equal(by('oldfail').st, 'fail');

      assert.deepEqual(
        [by('sec').st, by('sec').asked, by('sec').last, by('sec').end, by('sec').branch],
        [
          'run',
          'Review the plan for security',
          { kind: 'tool', name: 'Bash', text: 'Parse the ingress rules' },
          null,
          'agent/sec',
        ],
        'at work: what it calls, in words',
      );

      assert.equal(by('sec').kind, null, 'general-purpose says nothing');
      assert.equal(by('cost').kind, 'code-reviewer');

      assert.deepEqual(
        [by('cost').st, by('cost').last],
        ['done', { kind: 'report', text: 'Three gateways where one would do' }],
        "done: its report's first line, a sentence",
      );

      assert.ok(by('cost').end, 'an end time');

      assert.deepEqual(
        [by('logs').st, by('logs').why],
        ['fail', 'Agent terminated early due to an API error'],
        'its notice says why',
      );

      assert.equal(by('hand').st, 'stop');
      assert.equal(by('prev').st, 'wait', 'its turn over, its background work on');
      assert.equal(by('prev').end, null, 'not ended');
      assert.equal(by('noted').asked, 'A prompt as its only words', 'no description: its first prompt');

      assert.equal(
        (await srv.api('api/sessions')).body.sessions.find(session => session.id === chat.id).agents,
        1,
        'only the one at work counts; a finished one with no end of its own does not',
      );

      assert.ok(
        (await srv.api(`api/sessions/${chat.id}/messages`)).body.session.agentRows?.length === 7,
        'kept over a re-read',
      );
    } finally {
      await srv.stop();
      claude.kill();
    }
  },
);

test(
  'a notice arriving ends the row; a new round replaces the last; a finished agent resumed is at work again',
  { timeout: 30_000 },
  async () => {
    const {
      p: claude,
      fx,
      chat,
      files,
    } = setup([{ id: 'one', asked: 'First', ago: 5 * MIN, tool: 'toolu_one', steps: ['Look around'] }]);

    const srv = await startTestServer({ claudeDir: fx.dir });

    try {
      await waitFor(async () => (await rowsOf(srv, chat.id))?.[0]?.st === 'run', { what: 'at work' });

      appendFileSync(
        chat.file,
        `${JSON.stringify(
          agentNoteLine({
            id: chat.id,
            cwd: chat.cwd,
            tool: 'toolu_one',
            asked: 'First',
            status: 'failed',
            said: 'failed: Agent terminated early due to an API error',
          }),
        )}\n`,
      );

      writeFileSync(
        files.one.replace(/\.jsonl$/, '.meta.json'),
        JSON.stringify({ agentType: 'general-purpose', description: 'First', toolUseId: 'toolu_one', finished: true }),
      );

      const failed = await waitFor(
        async () => {
          const row = (await rowsOf(srv, chat.id))?.[0];

          return row?.st === 'fail' && row;
        },
        { what: 'failed by its notice' },
      );

      assert.equal(failed.why, 'Agent terminated early due to an API error');
      assert.doesNotMatch(srv.logText(), /could not be folded/, 'a notice is a line like any other'); // 2026-11-04: agentsSoon, out of reach inside main()
      // words again: written after its meta, it is at work
      await new Promise(res => setTimeout(res, 1700));

      appendFileSync(
        files.one,
        `${JSON.stringify({
          isSidechain: true,
          type: 'assistant',
          timestamp: new Date().toISOString(),
          message: {
            role: 'assistant',
            content: [{ type: 'tool_use', id: 'toolu_z', name: 'Bash', input: { description: 'Try again' } }],
            stop_reason: 'tool_use',
          },
        })}\n`,
      );

      const back = await waitFor(
        async () => {
          const row = (await rowsOf(srv, chat.id))?.[0];

          return row?.st === 'run' && row;
        },
        { what: 'resumed' },
      );

      assert.deepEqual(back.last, { kind: 'tool', name: 'Bash', text: 'Try again' });
    } finally {
      await srv.stop();
      claude.kill();
    }
  },
);

test('a row holds its words AGENT_WORDS_MS, whatever its agent does meanwhile', { timeout: 30_000 }, async () => {
  const { p: claude, fx, chat, files } = setup([{ id: 'one', asked: 'First', ago: 5 * MIN, steps: ['Look around'] }]);
  const srv = await startTestServer({ claudeDir: fx.dir, env: { AGENT_WORDS_MS: '60000' } });

  try {
    await waitFor(async () => (await rowsOf(srv, chat.id))?.[0]?.last?.text === 'Look around', {
      what: 'its first words',
    });

    appendFileSync(
      files.one,
      `${JSON.stringify({
        isSidechain: true,
        type: 'assistant',
        timestamp: new Date().toISOString(),
        message: {
          role: 'assistant',
          content: [{ type: 'tool_use', id: 'toolu_z', name: 'Bash', input: { description: 'Something new' } }],
          stop_reason: 'tool_use',
        },
      })}\n`,
    );

    await new Promise(res => setTimeout(res, 1800)); // the watcher's and the poll's chance to take it
    assert.equal((await rowsOf(srv, chat.id))[0].last.text, 'Look around', 'held');
  } finally {
    await srv.stop();
    claude.kill();
  }
});

test(
  'one agent on demand: what it was asked, its totals, its transcript a piece at a time',
  { timeout: 30_000 },
  async () => {
    const {
      p: claude,
      fx,
      chat,
      files,
    } = setup([
      {
        id: 'one',
        asked: 'First',
        prompt: 'Look at the plan closely.',
        ago: 5 * MIN,
        steps: ['Read it', 'Check it'],
        report: '## Found two\n\nDetails.',
      },
    ]);

    const srv = await startTestServer({ claudeDir: fx.dir });

    try {
      await waitFor(async () => (await rowsOf(srv, chat.id))?.length, { what: 'the row' });
      const totals = (await srv.api(`api/sessions/${chat.id}/agents/one`)).body;

      assert.deepEqual(
        [totals.prompt, totals.tools, totals.tokens],
        ['Look at the plan closely.', 3, 1030],
        'totals: its calls, the context at its last call',
      );

      assert.equal(totals.entries, undefined, 'no transcript unless asked');
      const transcript = (await srv.api(`api/sessions/${chat.id}/agents/one?after=0`)).body;

      assert.deepEqual(
        transcript.entries.map(entry => entry.kind),
        ['text', 'tool_use', 'tool_result', 'tool_use', 'tool_result', 'text'],
        'its report, and nothing of the call that handed it back',
      );

      assert.equal(transcript.entries[5].text, '## Found two\n\nDetails.', 'its report is words');
      assert.equal(transcript.upto, transcript.entries.length);

      appendFileSync(
        files.one,
        `${JSON.stringify({
          isSidechain: true,
          type: 'assistant',
          timestamp: new Date().toISOString(),
          message: {
            role: 'assistant',
            content: [{ type: 'text', text: 'And one more thing.' }],
            stop_reason: 'end_turn',
          },
        })}\n`,
      );

      const more = (await srv.api(`api/sessions/${chat.id}/agents/one?after=${transcript.upto}`)).body;

      assert.deepEqual(
        more.entries.map(entry => entry.text),
        ['And one more thing.'],
        'only what came',
      );

      assert.equal((await srv.api(`api/sessions/${chat.id}/agents/nope`)).status, 404);

      assert.equal(
        (await srv.api(`api/sessions/${chat.id}/agents/..%2Fx`)).status,
        404,
        'an id is a name, never a path',
      );
    } finally {
      await srv.stop();
      claude.kill();
    }
  },
);

/** The `alert` events of a server's stream, from its snapshot on (as drift.test reads them). */
async function alerts(url, key) {
  const seen = [];
  const ac = new AbortController();

  await new Promise((resolve, reject) => {
    fetch(`${url}events`, { signal: ac.signal, headers: { 'x-peix-key': key } })
      .then(async res => {
        let buf = '';

        for await (const chunk of res.body) {
          buf += Buffer.from(chunk).toString();
          let index;

          while ((index = buf.indexOf('\n\n')) >= 0) {
            const match = /^event: (\w+)\ndata: (.*)$/s.exec(buf.slice(0, index));

            buf = buf.slice(index + 2);
            if (match?.[1] === 'snapshot') resolve();
            if (match?.[1] === 'alert') seen.push(JSON.parse(match[2]));
          }
        }
      })
      .catch(error => {
        if (!ac.signal.aborted) reject(error);
      });
  });

  return { seen, stop: () => ac.abort() };
}

test(
  'a result that names an agent says which, on its entry: an Agent call\u2019s, a forked Skill\u2019s; nothing else does',
  { timeout: 30_000 },
  async () => {
    const dir = tmpDir('peix-fx-');
    const cwd = '/tmp/acme/infra';

    const fx = makeFixture(dir, [
      {
        cwd,
        title: 'Its calls',
        prompt: 'go',
        reply: 'Done.',
        at: new Date(Date.now() - 30 * MIN),
        lines: id => [
          ...toolLines({
            id,
            cwd,
            name: 'Agent',
            input: { description: 'Look at it', name: 'looker', prompt: 'go' },
            result: 'launched',
            toolUseResult: { status: 'async_launched', agentId: 'abc-1', description: 'Look at it' },
          }),
          ...toolLines({
            id,
            cwd,
            name: 'Skill',
            input: { skill: 'code-review' },
            result: 'launched',
            toolUseResult: { status: 'forked', commandName: 'code-review', agentId: 'abc-2' },
          }),
          ...toolLines({
            id,
            cwd,
            name: 'Agent',
            input: { description: 'A bad id' },
            result: 'launched',
            toolUseResult: { agentId: '../../etc' },
          }),
          ...toolLines({
            id,
            cwd,
            name: 'Bash',
            input: { command: 'ls' },
            result: 'a file',
            toolUseResult: { stdout: 'a file' },
          }),
        ],
      },
    ]);

    const srv = await startTestServer({ claudeDir: dir });

    try {
      const { entries } = (await srv.api(`api/sessions/${fx.chats[0].id}/messages`)).body;
      const results = entries.filter(entry => entry.kind === 'tool_result');

      assert.deepEqual(
        results.map(entry => entry.agent ?? null),
        [
          { id: 'abc-1', name: null, asked: 'Look at it' },
          { id: 'abc-2', name: 'code-review', asked: null },
          null,
          null,
        ],
      );

      assert.equal(
        entries.find(entry => entry.kind === 'tool_use' && entry.name === 'Agent').who,
        'looker',
        'the name the call gave it',
      );

      assert.equal(entries.filter(entry => entry.kind === 'tool_use' && entry.who).length, 1, 'no name, no word');
    } finally {
      await srv.stop();
    }
  },
);

test(
  'an agent that fails is an alert, once, with what it was asked and why; one that finishes is none',
  { timeout: 30_000 },
  async () => {
    const {
      p: claude,
      fx,
      chat,
    } = setup(
      [
        { id: 'a', asked: 'Price the gateways', ago: 5 * MIN, tool: 'toolu_a', steps: ['Count them'] },
        { id: 'b', asked: 'Check flow logs', ago: 4 * MIN, tool: 'toolu_b', steps: ['Read the logs'] },
        { id: 'gone', asked: 'From before', ago: 9 * MIN, tool: 'toolu_gone', steps: ['Look'] },
      ],
      [
        {
          tool: 'toolu_gone',
          asked: 'From before',
          status: 'failed',
          said: 'failed: Agent terminated early due to an API error',
        },
      ],
    );

    const srv = await startTestServer({ claudeDir: fx.dir });
    let stream;

    try {
      await waitFor(async () => (await rowsOf(srv, chat.id))?.length, { what: 'the rows' });
      stream = await alerts(srv.url, srv.key);

      const note = notice =>
        appendFileSync(chat.file, `${JSON.stringify(agentNoteLine({ id: chat.id, cwd: chat.cwd, ...notice }))}\n`);

      note({ tool: 'toolu_a', asked: 'Price the gateways' });
      await new Promise(res => setTimeout(res, 900));

      assert.deepEqual(
        stream.seen.filter(alert => alert.kind === 'agent-failed'),
        [],
        'one that finished: no word',
      );

      note({
        tool: 'toolu_b',
        asked: 'Check flow logs',
        status: 'failed',
        said: 'failed: Agent terminated early due to an API error',
      });

      await waitFor(() => stream.seen.some(alert => alert.kind === 'agent-failed'), { what: 'the alert' });
      const failed = stream.seen.find(alert => alert.kind === 'agent-failed');

      assert.deepEqual(
        [failed.sessionId, failed.heading, failed.snippet],
        [chat.id, 'An agent failed · infra', 'Check flow logs: Agent terminated early due to an API error'],
      );

      note({
        tool: 'toolu_b',
        asked: 'Check flow logs',
        status: 'failed',
        said: 'failed: Agent terminated early due to an API error',
      }); // a notice again

      await srv.api(`api/sessions/${chat.id}/messages`); // and a re-read of the chat
      await new Promise(res => setTimeout(res, 900));

      assert.equal(
        stream.seen.filter(alert => alert.kind === 'agent-failed').length,
        1,
        'said once; the failure before the server came up, never',
      );
    } finally {
      stream?.stop();
      await srv.stop();
      claude.kill();
    }
  },
);

test(
  "a row says its type and the colour its definition gives, none for a built-in (Space's pods, 2026-11-18)",
  { timeout: 30_000 },
  async () => {
    const {
      p: claude,
      fx,
      chat,
    } = setup([
      { id: 'sec', asked: 'Look for open ingress', kind: 'security', ago: 5 * MIN, steps: ['Grep the modules'] },
      { id: 'look', asked: 'Find the modules', kind: 'Explore', ago: 4 * MIN, steps: ['List them'] },
    ]);

    mkdirSync(join(fx.dir, 'agents'), { recursive: true });

    writeFileSync(
      join(fx.dir, 'agents', 'security.md'),
      '---\nname: security\ndescription: Reviews for security\ncolor: red\n---\nLook.\n',
    );

    const srv = await startTestServer({ claudeDir: fx.dir });

    try {
      const rows = await waitFor(
        async () => {
          const found = await rowsOf(srv, chat.id);

          return found?.length === 2 && found;
        },
        { what: 'the rows' },
      );

      assert.deepEqual(rows.map(row => [row.id, row.type, row.color]).sort(), [
        ['look', 'Explore', null],
        ['sec', 'security', 'red'],
      ]);
    } finally {
      await srv.stop();
      claude.kill();
    }
  },
);

test(
  'every agent its claude ran, for Space: the rows a card shows are the last round, `agentAll` every round (2026-11-18, v9)',
  { timeout: 30_000 },
  async () => {
    const {
      p: claude,
      fx,
      chat,
    } = setup([
      {
        id: 'spec',
        asked: 'Specify it',
        kind: 'specifier',
        ago: 30 * MIN,
        quiet: 25 * MIN,
        report: '## Spec ready',
        finished: true,
        tool: 'toolu_spec',
      },
      { id: 'expl', asked: 'Explore it', kind: 'explorer', ago: 10 * MIN, steps: ['Grep the client'] },
    ]);

    const srv = await startTestServer({ claudeDir: fx.dir });

    try {
      const sum = await waitFor(
        async () => {
          const found = (await srv.api('api/sessions')).body.sessions.find(session => session.id === chat.id);

          return found?.agentAll?.length === 2 && found;
        },
        { what: 'both rounds' },
      );

      assert.deepEqual(
        sum.agentRows.map(row => row.id),
        ['expl'],
        'a card: the last round',
      );

      assert.deepEqual(
        sum.agentAll.map(row => [row.id, row.type]),
        [
          ['spec', 'specifier'],
          ['expl', 'explorer'],
        ],
        'Space: every round, each by its type',
      );
    } finally {
      await srv.stop();
      claude.kill();
    }
  },
);

test(
  'a resume starts its rows over, but the agents of the claudes before stay in agentAll, past; a chat with no claude keeps them',
  { timeout: 30_000 },
  async () => {
    const claude = standIn();
    const dir = tmpDir('peix-fx-');
    const now = new Date();

    const fx = makeFixture(dir, [
      {
        cwd: '/tmp/acme/infra',
        title: 'Resumed',
        prompt: 'carry on',
        reply: 'On it.',
        at: new Date(Date.now() - 5 * MIN),
        live: { pid: claude.pid, startedAt: Date.now() - 20 * MIN },
      },
      {
        cwd: '/tmp/acme/ledger',
        title: 'Ended',
        prompt: 'look',
        reply: 'Looked.',
        at: new Date(Date.now() - 60 * MIN),
      },
    ]);

    const [live, ended] = fx.chats;

    agentFiles({
      dir,
      lead: live,
      at: now,
      agents: [
        {
          id: 'before',
          kind: 'security',
          asked: 'Before the resume',
          ago: 50 * MIN,
          quiet: 45 * MIN,
          report: 'Clean.',
          finished: true,
        },
        { id: 'beforefail', asked: 'Failed before', ago: 48 * MIN, quiet: 44 * MIN, steps: ['Look'], finished: true },
        { id: 'after', asked: 'After the resume', ago: 10 * MIN, quiet: 9 * MIN, report: 'Done.', finished: true },
      ],
    });

    agentFiles({
      dir,
      lead: ended,
      at: now,
      agents: [
        {
          id: 'gone',
          kind: 'code-reviewer',
          asked: 'Its review',
          ago: 80 * MIN,
          quiet: 70 * MIN,
          report: 'Fine.',
          finished: true,
        },
      ],
    });

    const srv = await startTestServer({ claudeDir: fx.dir });

    try {
      const of = async id => (await srv.api('api/sessions')).body.sessions.find(session => session.id === id);

      const liveSession = await waitFor(
        async () => {
          const found = await of(live.id);

          return found?.agentAll?.length === 3 && found;
        },
        { what: 'every agent, the earlier ones too' },
      );

      assert.deepEqual(
        liveSession.agentRows.map(row => row.id),
        ['after'],
        'the rows: this claude’s alone',
      );

      assert.deepEqual(
        liveSession.agentAll.map(row => [row.id, !!row.past]),
        [
          ['before', true],
          ['beforefail', true],
          ['after', false],
        ],
        'all of them, oldest first, the earlier ones past',
      );

      assert.ok(
        liveSession.agentAll.filter(row => row.past).every(row => row.st === 'done' || row.st === 'fail'),
        'a past agent is never at work',
      );

      assert.equal(liveSession.agents, 0);

      const endedSession = await waitFor(
        async () => {
          const found = await of(ended.id);

          return found?.agentAll?.length === 1 && found;
        },
        { what: 'the ended chat’s' },
      );

      assert.deepEqual(
        [
          endedSession.agentRows,
          endedSession.agentAll[0].id,
          endedSession.agentAll[0].past,
          endedSession.agentAll[0].kind,
        ],
        [null, 'gone', true, 'code-reviewer'],
        'no claude: no rows, its past in agentAll',
      );
    } finally {
      await srv.stop();
      claude.kill();
    }
  },
);
