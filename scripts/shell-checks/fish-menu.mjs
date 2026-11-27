// The fish in the menu bar and its menu, from the real shell (2026-11-25): the menu is the bare minimum — the chats asking
// you, then Show Board and Quit —, the fish's number the questions alone, and a reply lights it with no number.
import { spawn } from 'node:child_process';
import { appendFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { makeFixture, replyLines } from '../fixture.mjs';
import { waitFor } from '../../lib/testserver.mjs';

export const meta = {};

export default async function (ctx) {
  await ctx.board();

  const fish = () => ctx.ask('fish');
  const titles = f => f.rows.map(r => r.title);

  const rest = await fish();

  ctx.assert.deepEqual(titles(rest), ['Show Board', 'Quit peixAIrada'], 'nothing asking: the board and Quit alone');
  ctx.assert.equal(rest.title, '', 'no number');
  // a reply lights the fish, and adds no number nor a row
  const [a] = ctx.fixture.chats;

  appendFileSync(
    a.file,
    `${replyLines({ id: a.id, cwd: a.cwd, text: 'Done, have a look.', at: new Date() })
      .map(l => JSON.stringify(l))
      .join('\n')}\n`,
  );

  const lit = await waitFor(async () => (f => (f.dim ? null : f))(await fish()), {
    what: 'the fish lit by a reply',
  });

  ctx.assert.equal(lit.title, '', 'a reply adds no number');
  ctx.assert.match(lit.tip, /1 new reply/);
  ctx.assert.deepEqual(titles(lit), ['Show Board', 'Quit peixAIrada'], 'nor a row');
  // a question: its number, and its row over the rest
  const sleep = spawn('sleep', ['120'], { stdio: 'ignore' });

  try {
    const cwd = realpathSync(tmpdir());
    const ago = m => Date.now() - m * 60_000;

    makeFixture(ctx.fixture.dir, [
      {
        cwd,
        title: 'A question',
        prompt: 'go',
        reply: 'one question',
        at: new Date(ago(6)),
        live: { pid: sleep.pid, startedAt: ago(60), status: 'waiting', waitingFor: 'input needed', statusAt: ago(5) },
      },
    ]);

    const asked = await waitFor(async () => (f => (f.title === ' 1' ? f : null))(await fish()), {
      what: 'the question on the fish',
    });

    ctx.assert.deepEqual(
      titles(asked),
      ['Asking you · 1', 'A question', '—', 'Show Board', 'Quit peixAIrada'],
      'the question, then the board and Quit',
    );

    const row = asked.rows[1];

    ctx.log(`its row: ${JSON.stringify(row)}`);
    ctx.assert.equal(row.on, true, 'its row opens it');
    if ('sub' in row) ctx.assert.equal(row.sub, `${cwd.split('/').pop()} · waited 5 min`, 'its project and its wait');
    ctx.assert.match(asked.tip, /1 asking you, 1 new reply/);
    return { rest: titles(rest), asked: asked.rows };
  } finally {
    sleep.kill();
  }
}
