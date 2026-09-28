// The README's screenshots, from a made-up board: a handful of projects with Peacock colours, chats in every state,
// PRs coloured by a fake gh, a plan-usage answer of its own — nothing from this Mac's ~/.claude. Run it with
//   npm run scenario -- scripts/readme-shots.mjs
// and look at docs/shots/ before committing them. Not in scripts/scenarios/: it checks nothing, it draws.
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeFixture, replyLines, taskNoteLine, toolLines } from './fixture.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = join(ROOT, 'docs', 'shots');
const W = 1440, H = 900;

// The fixture is built as the module loads — before the runner starts the server — so the server boots on it whole.
const root = mkdtempSync(join(realpathSync(tmpdir()), 'peix-shots-'));
const claudeDir = join(root, 'claude'), work = join(root, 'work');
const COLORS = { storefront: '#3b7ddd', 'billing-api': '#2e9e6a', infra: '#8a5cf6', 'mobile-app': '#e5892a', 'docs-site': null };
for (const [name, color] of Object.entries(COLORS)) {
  mkdirSync(join(work, name, '.vscode'), { recursive: true });
  if (color) writeFileSync(join(work, name, '.vscode', 'settings.json'), JSON.stringify({ 'peacock.color': color }, null, 2));
}
for (const name of ['admin-portal', 'analytics', 'design-system']) mkdirSync(join(work, name), { recursive: true });   // folders with no chat yet: ⌥⌘N lists them
const cwd = name => join(work, name);

const prsFile = join(root, 'prs.json');
writeFileSync(prsFile, JSON.stringify({
  'acme/storefront#482': { state: 'OPEN', title: 'Retry declined card payments with backoff' },
  'acme/storefront#479': { state: 'OPEN', title: 'Product grid follows the dark theme' },
  'acme/storefront#471': { state: 'MERGED', title: 'Cache search suggestions for 5 minutes' },
  'acme/infra#91': { state: 'OPEN', title: 'Node 22 across every service' },
  'acme/infra#92': { state: 'OPEN', isDraft: true, title: 'Drop the Node 18 base image' },
  'acme/mobile-app#310': { state: 'CLOSED', title: 'Guard the keychain read on first launch' },
}));

const sleeps = Array.from({ length: 5 }, () => spawn('sleep', ['600'], { stdio: 'ignore' }));
const live = i => ({ pid: sleeps[i].pid, startedAt: Date.now() - 3600_000 });
const now = Date.now(), ago = min => new Date(now - min * 60_000), DAY = 24 * 60;
const FABLE = 'claude-fable-5-1';
const userLine = (id, where, text, at) => ({ isSidechain: false, userType: 'external', entrypoint: 'cli', cwd: where, sessionId: id, version: 'fixture', gitBranch: 'main',
  parentUuid: null, type: 'user', uuid: randomUUID(), timestamp: at.toISOString(), message: { role: 'user', content: [{ type: 'text', text }] } });

const GRID = cwd('storefront');
const gridReply = `The cards hard-code their colours instead of reading the theme tokens, so they never change with the system setting.

**What changed**

- \`ProductCard.css\` reads \`var(--surface)\` and \`var(--text)\` instead of \`#fff\` / \`#111\`
- the price badge uses \`--accent-muted\`, which already has a dark value
- the image placeholder uses \`--surface-sunken\`, so nothing flashes white while images load

\`\`\`css
.product-card {
  background: var(--surface);
  color: var(--text);
  border: 1px solid var(--border-subtle);
}
\`\`\`

All 14 grid tests pass. Want me to open a PR?`;

const { chats } = makeFixture(claudeDir, [
  // the open chat of the hero shot: a turn of tool calls, a markdown reply, a PR
  { cwd: GRID, title: 'Dark mode for the product grid', model: FABLE, at: ago(42),
    prompt: 'The product grid ignores the dark theme — the cards stay white. Make it follow the system setting.',
    reply: 'Let me see where the grid gets its colours from.',
    lines: id => [
      ...toolLines({ id, cwd: GRID, name: 'Grep', input: { pattern: 'background: #fff', path: 'src/components' }, result: 'src/components/ProductGrid/ProductCard.css:12:  background: #fff;', at: ago(41) }),
      ...toolLines({ id, cwd: GRID, name: 'Read', input: { file_path: `${GRID}/src/components/ProductGrid/ProductCard.css` }, result: '…', at: ago(41) }),
      ...toolLines({ id, cwd: GRID, name: 'Read', input: { file_path: `${GRID}/src/theme/tokens.css` }, result: '…', at: ago(40) }),
      ...toolLines({ id, cwd: GRID, name: 'Edit', input: { file_path: `${GRID}/src/components/ProductGrid/ProductCard.css` }, result: 'The file has been updated.', at: ago(39) }),
      ...toolLines({ id, cwd: GRID, name: 'Bash', input: { command: 'npm test -- ProductGrid', description: 'Run the grid tests' }, result: 'Tests: 14 passed, 14 total', at: ago(38) }),
      ...replyLines({ id, cwd: GRID, text: gridReply, at: ago(37), model: FABLE }),
      userLine(id, GRID, 'yes, open it', ago(35)),
      ...toolLines({ id, cwd: GRID, name: 'Bash', input: { command: 'gh pr create --fill', description: 'Open the PR' }, result: 'https://github.com/acme/storefront/pull/479', at: ago(34) }),
      ...replyLines({ id, cwd: GRID, text: 'Opened https://github.com/acme/storefront/pull/479 — the visual snapshots for the grid are updated in the same commit.', at: ago(33), model: FABLE }),
    ] },
  // clauding: a tool call in flight
  { cwd: cwd('storefront'), title: 'Retry declined payments', model: FABLE, at: ago(20), live: live(0),
    prompt: 'Declined cards should retry with backoff before we show the error — see https://github.com/acme/storefront/pull/482',
    reply: 'Reading the payment client first.',
    lines: id => toolLines({ id, cwd: cwd('storefront'), name: 'Bash', input: { command: 'npm test -- payments', description: 'Run the payment tests' }, at: ago(1) }) },
  // asking: a question with its answers, waiting on you
  { cwd: cwd('billing-api'), title: 'Queue for invoice webhooks', at: ago(25), live: live(1),
    prompt: 'Invoice webhooks time out under load. Move them off the request path.',
    reply: 'They can go on a queue — one question first.',
    lines: id => toolLines({ id, cwd: cwd('billing-api'), name: 'AskUserQuestion', at: ago(3),
      input: { questions: [{ question: 'Which queue should the webhooks go through?', header: 'Queue', options: [{ label: 'SQS' }, { label: 'Redis streams' }, { label: 'Postgres (pg-boss)' }] }] } }) },
  // three sub-agents at work
  { cwd: cwd('infra'), title: 'Review the staging VPC plan', at: ago(15), live: live(2),
    prompt: 'Review the terraform plan for the staging VPC from every angle — cost, security, blast radius.',
    reply: 'Sending three reviewers out.',
    lines: id => toolLines({ id, cwd: cwd('infra'), name: 'Agent', input: { description: 'review: security', prompt: 'review the plan for security' }, at: ago(2) }) },
  // ready, but a monitor is still watching
  { cwd: cwd('mobile-app'), title: 'Watch the release build', at: ago(55), live: live(3),
    prompt: 'Watch the release build and tell me when the iOS job finishes.',
    reply: 'Watching it.',
    lines: id => [
      ...toolLines({ id, cwd: cwd('mobile-app'), name: 'Monitor', input: { command: 'gh run watch', description: 'the release build', timeout_ms: 1800_000 },
        result: 'Monitor started (task mon4rel01, expires in 30m unless the source ends first). You will be notified on each event.', at: ago(12) }),
      taskNoteLine({ id, cwd: cwd('mobile-app'), taskId: 'mon4rel01', summary: 'Monitor event: "the release build"', event: 'android: success', at: ago(6) }),
      ...replyLines({ id, cwd: cwd('mobile-app'), text: 'Android is green. Still waiting on the iOS job.', at: ago(6) }),
    ] },
  // ready, live in a drawer here, idle
  { cwd: cwd('billing-api'), title: 'Flaky test in the refunds suite', at: ago(95), live: live(4),
    prompt: 'refunds.spec.ts fails one run in ten on CI. Find out why.',
    reply: 'The test shares a fixture clock with the one before it: whichever finishes first moves time for both. Each now gets its own clock, and 200 runs in a row pass.' },
  // yesterday and before
  { cwd: cwd('infra'), title: 'Bump Node to 22', at: ago(DAY + 120),
    prompt: 'Move every service to Node 22. https://github.com/acme/infra/pull/91 is the base, https://github.com/acme/infra/pull/92 drops 18.',
    reply: 'Both PRs are up: #91 switches the base images, #92 removes the old one once nothing uses it.' },
  { cwd: cwd('docs-site'), title: 'Rewrite the getting-started guide', at: ago(DAY + 200),
    prompt: 'The getting-started guide still talks about the old CLI. Rewrite it for the new one.',
    reply: 'Rewritten: install, first project, deploy — each with the command it takes and nothing else.' },
  { cwd: cwd('mobile-app'), title: 'Crash on first launch', at: ago(2 * DAY + 60),
    prompt: 'The app crashes on first launch on a fresh install. Stack trace attached.',
    reply: 'The keychain is read before it is unlocked. https://github.com/acme/mobile-app/pull/310 guards it — closed in favour of moving the read.' },
  { cwd: cwd('storefront'), title: 'Cache the search suggestions', at: ago(2 * DAY + 180),
    prompt: 'Search suggestions hit the API on every keystroke. Cache them.',
    reply: 'Cached for five minutes per prefix — https://github.com/acme/storefront/pull/471.' },
]);
const chat = t => chats.find(c => c.title === t);
const agents = chat('Review the staging VPC plan');
const agentDir = join(dirname(agents.file), agents.id, 'subagents');
mkdirSync(agentDir, { recursive: true });
for (const n of [1, 2, 3]) writeFileSync(join(agentDir, `agent-${n}.jsonl`), JSON.stringify({ isSidechain: true, type: 'user', message: { role: 'user', content: 'go' } }) + '\n');

export const meta = { server: true, fixture: claudeDir, env: { GH_BIN: join(ROOT, 'scripts', 'fakegh.mjs'), FAKEGH_PRS: prsFile, ORG: 'acme', ORG_DIR: work } };

// What /api/usage would answer, for the footer — the page's fetch answers it before the server is asked.
const inMin = m => new Date(now + m * 60_000).toISOString();
const USAGE = { fetchedAt: new Date(now).toISOString(), windows: [
  { key: 'five_hour', label: 'session · 5 h', percent: 34, resetsAt: inMin(130) },
  { key: 'seven_day', label: 'week · all models', percent: 58, resetsAt: inMin(3 * DAY + 200) },
  { key: 'limits:weekly_scoped:Fable', label: 'week · Fable', percent: 71, resetsAt: inMin(3 * DAY + 200) },
] };

export default async function (ctx) {
  const shots = [];
  const snap = async (name, clip) => {
    await ctx.settle(); await ctx.sleep(300);
    const r = await ctx.send('Page.captureScreenshot', { format: 'png', ...(clip ? { clip: { scale: 1, ...clip } } : {}) });
    const f = join(OUT, `${name}.png`); writeFileSync(f, Buffer.from(r.result.data, 'base64')); shots.push(f); ctx.log(`→ ${f}`);
  };
  const theme = dark => ctx.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' }] });
  const rect = sel => ctx.evaluate(`(r => ({ x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) }))(document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect())`);
  try {
    mkdirSync(OUT, { recursive: true });
    await ctx.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 2, mobile: false });
    await ctx.send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => { const f = window.fetch, u = ${JSON.stringify(USAGE)};
      window.fetch = (url, o) => String(url).includes('/api/usage') ? Promise.resolve(new Response(JSON.stringify(u), { status: 200, headers: { 'content-type': 'application/json' } })) : f(url, o); })()` });
    await ctx.server.post(`/api/sessions/${chat('Rewrite the getting-started guide').id}/done`, { done: true });
    await ctx.send('Page.reload'); await ctx.sleep(800);
    await ctx.waitFor(`document.querySelectorAll('#slist > .card').length === ${chats.length}`, { what: 'every card', timeout: 15000 });
    await ctx.waitFor(`window.peix.sessions().some(s => s.agents === 3)`, { what: 'the three sub-agents', timeout: 20000 });
    const grid = chat('Dark mode for the product grid');
    await ctx.openChat(grid.id);
    await ctx.waitFor(`${JSON.stringify(chats.map(c => c.id))}.filter(id => window.peix.session(id)?.prs?.some(p => p.state)).length >= 5`, { what: 'the PR states from the fake gh', timeout: 30000 });

    // 1 · the board: a project's chats, the chat, both themes
    for (const dark of [true, false]) { await theme(dark); await snap(`board-${dark ? 'dark' : 'light'}`); }

    // 2 · the chat list alone, up close — the four readings of a card's edge
    await theme(true);
    const list = await rect('#sessions');
    await snap('cards-dark', { ...list, height: Math.min(list.height, 640) });

    // 3 · ⌥⌘K, the chat picker
    await ctx.key('KeyK'); await ctx.waitFor(`document.querySelector('dialog[open]')`, { what: 'the picker' });
    await ctx.settle();
    const pick = await rect('dialog[open]'), pad = 28;
    await snap('picker-dark', { x: pick.x - pad, y: Math.max(0, pick.y - pad), width: pick.width + 2 * pad, height: pick.height + 2 * pad });
    await ctx.key('Escape'); await ctx.evaluate(`document.querySelector('dialog[open]')?.close()`);

    // 4 · the timeline swelled: the pointer held at the window's left edge calls it out
    await ctx.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 1, y: 420 });
    await ctx.waitFor(`window.peix.state().timeline.shown && window.peix.state().timeline.k === 1`, { what: 'the timeline called out' });
    await ctx.sleep(300);
    await snap('timeline-dark', { ...list, height: Math.min(list.height, 640) });
    await ctx.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: W - 5, y: H - 5 });
    return { shots };
  } finally {
    for (const s of sleeps) try { s.kill(); } catch {}
    rmSync(root, { recursive: true, force: true });
  }
}
