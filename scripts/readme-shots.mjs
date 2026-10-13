// The README's screenshots, from a made-up board: a handful of projects with Peacock colours, chats in every state,
// PRs coloured by a fake gh — their CI, the people on them, one at your move —, a plan-usage answer of its own, the
// Mac's numbers made up too: nothing from this Mac's ~/.claude, nor its name. Run it with
//   npm run scenario -- scripts/readme-shots.mjs
// and look at docs/shots/ before committing them. Not in scripts/scenarios/: it checks nothing, it draws.
// The chat's pages are the app's (2026-10-11, late night): the shell's bridge is faked as pane-tabs.mjs does, and each
// page the app would show in a native view over a half is an iframe there instead — VS Code Web a `code serve-web` of
// its own on the made-up repo (its own server data, its settings seeded into its page's store, behind a proxy that
// lets it be framed); without the `code` CLI that shot is skipped. Claude in the drawer is the fake claude drawing a
// screen written here (FAKE_SCREEN). WebP rather than PNG: the grain made each PNG megabytes.
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import net from 'node:net';
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
  if (color) writeFileSync(join(work, name, '.vscode', 'settings.json'), JSON.stringify({ 'peacock.color': color }, null, 2) + '\n');
}
for (const name of ['admin-portal', 'analytics', 'design-system']) mkdirSync(join(work, name), { recursive: true });   // folders with no chat yet: ⌥⌘N lists them
const cwd = name => join(work, name);

// The storefront is a repo, the open chat's edit left uncommitted: its changes tab has a diff, VS Code a gutter.
const CARD = (bg, ink, edge, sunken, badge) => `.product-card {
  display: grid;
  gap: 8px;
  padding: 12px;
  border-radius: 12px;
  background: ${bg};
  color: ${ink};
  border: 1px solid ${edge};
}

.product-card__image {
  aspect-ratio: 4 / 3;
  border-radius: 8px;
  background: ${sunken};
}

.product-card__title {
  font-size: 15px;
  line-height: 1.3;
}

.product-card__price {
  font-weight: 600;
  background: ${badge};
  border-radius: 6px;
  padding: 2px 6px;
}
`;
const SF = cwd('storefront');
const SOURCES = {
  'package.json': JSON.stringify({ name: 'storefront', private: true, type: 'module', scripts: { dev: 'vite', build: 'vite build', test: 'vitest run' } }, null, 2) + '\n',
  'README.md': '# storefront\n\nThe shop front: the product grid, search and checkout.\n',
  'src/main.tsx': "import { createRoot } from 'react-dom/client';\nimport { App } from './App';\nimport './theme/tokens.css';\n\ncreateRoot(document.getElementById('root')!).render(<App />);\n",
  'src/App.tsx': "import { ProductGrid } from './components/ProductGrid';\nimport { SearchBox } from './components/Search/SearchBox';\n\nexport function App() {\n  return (\n    <main>\n      <SearchBox />\n      <ProductGrid />\n    </main>\n  );\n}\n",
  'src/components/ProductGrid/index.ts': "export { ProductGrid } from './ProductGrid';\n",
  'src/components/ProductGrid/ProductGrid.tsx': "import { ProductCard } from './ProductCard';\nimport { useProducts } from '../../hooks/useProducts';\n\nexport function ProductGrid() {\n  const products = useProducts();\n  return <div className=\"product-grid\">{products.map(p => <ProductCard key={p.id} product={p} />)}</div>;\n}\n",
  'src/components/ProductGrid/ProductCard.tsx': "import './ProductCard.css';\n\nexport function ProductCard({ product }) {\n  return (\n    <article className=\"product-card\">\n      <img className=\"product-card__image\" src={product.image} alt=\"\" />\n      <h3 className=\"product-card__title\">{product.name}</h3>\n      <span className=\"product-card__price\">{product.price}</span>\n    </article>\n  );\n}\n",
  'src/components/ProductGrid/ProductCard.css': CARD('#fff', '#111', '#e5e5e5', '#f2f2f2', '#fde68a'),
  'src/components/ProductGrid/ProductGrid.test.tsx': "import { render } from '@testing-library/react';\nimport { ProductGrid } from './ProductGrid';\n\ntest('renders a card per product', () => {\n  render(<ProductGrid />);\n});\n",
  'src/components/Search/SearchBox.tsx': "export function SearchBox() {\n  return <input type=\"search\" placeholder=\"Search products\" />;\n}\n",
  'src/checkout/payments.ts': "export async function charge(card, amount) {\n  return fetch('/api/charge', { method: 'POST', body: JSON.stringify({ card, amount }) });\n}\n",
  'src/hooks/useProducts.ts': "export function useProducts() {\n  return [];\n}\n",
  'src/theme/tokens.css': ':root {\n  --surface: #ffffff;\n  --surface-sunken: #f2f2f2;\n  --text: #111111;\n  --border-subtle: #e5e5e5;\n  --accent-muted: #fde68a;\n}\n\n@media (prefers-color-scheme: dark) {\n  :root {\n    --surface: #1c1c1e;\n    --surface-sunken: #141416;\n    --text: #f2f2f2;\n    --border-subtle: #2c2c2e;\n    --accent-muted: #5b4a12;\n  }\n}\n',
};
for (const [f, text] of Object.entries(SOURCES)) { mkdirSync(dirname(join(SF, f)), { recursive: true }); writeFileSync(join(SF, f), text); }
const git = (...a) => spawnSync('git', ['-c', 'user.name=Ada', '-c', 'user.email=ada@example.com', '-c', 'commit.gpgsign=false', ...a], { cwd: SF, stdio: 'ignore' });
git('init', '-q', '-b', 'main'); git('add', '-A'); git('commit', '-qm', 'The product grid');
writeFileSync(join(SF, 'src/components/ProductGrid/ProductCard.css'), CARD('var(--surface)', 'var(--text)', 'var(--border-subtle)', 'var(--surface-sunken)', 'var(--accent-muted)'));

// The PRs, as GitHub would answer for them: who wrote, reviewed and pushed, their CI, and so whose move it is.
const now = Date.now(), ago = min => new Date(now - min * 60_000), DAY = 24 * 60;
const iso = min => ago(min).toISOString().replace(/\.\d+Z$/, 'Z');
// a face as GitHub gives one (avatarUrl), drawn here so nothing is fetched
const face = (login, fill) => ({ login, __typename: 'User', avatarUrl: 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect width="48" height="48" fill="${fill}"/><text x="24" y="32" font-family="-apple-system, Helvetica, sans-serif" font-size="22" font-weight="600" text-anchor="middle" fill="#fff">${login[0].toUpperCase()}</text></svg>`) });
const me = face('me', '#c96442'), mara = face('mara', '#d14d72'), joel = face('joel', '#2e9e6a'), priya = face('priya', '#8a5cf6'), kenji = face('kenji', '#e5892a');
const ci = state => ({ commits: { nodes: [{ commit: { statusCheckRollup: { state } } }] } });
const pr = (o) => ({ isDraft: false, headRefOid: 'A', reviewRequests: { nodes: [] }, reviews: { nodes: [] }, comments: { nodes: [] }, pushes: { nodes: [] }, asks: { nodes: [] }, ...o });
const prsFile = join(root, 'prs.json');
writeFileSync(prsFile, JSON.stringify({
  // the open chat's: CI passed, a review asked of priya, mara's comment answered — theirs to move
  'acme/storefront#479': pr({ state: 'OPEN', title: 'Product grid follows the dark theme', createdAt: iso(34), author: me, ...ci('SUCCESS'),
    reviewRequests: { nodes: [{ requestedReviewer: { login: 'priya' } }] }, asks: { nodes: [{ createdAt: iso(33), requestedReviewer: { login: 'priya' } }] },
    reviews: { nodes: [{ author: joel, state: 'COMMENTED', submittedAt: iso(32) }] },
    comments: { nodes: [{ author: mara, createdAt: iso(31) }, { author: me, createdAt: iso(30) }] } }),
  // a reply on yours: your move, CI running
  'acme/storefront#482': pr({ state: 'OPEN', title: 'Retry declined card payments with backoff', createdAt: iso(19), author: me, ...ci('PENDING'),
    comments: { nodes: [{ author: joel, createdAt: iso(4) }] } }),
  'acme/storefront#471': pr({ state: 'MERGED', title: 'Cache search suggestions for 5 minutes', createdAt: iso(3 * DAY), author: me, reviews: { nodes: [{ author: mara, state: 'APPROVED', submittedAt: iso(2 * DAY + 200) }] } }),
  // someone else's, pushed to since you asked for changes: your move
  'acme/infra#91': pr({ state: 'OPEN', title: 'Node 22 across every service', createdAt: iso(DAY + 300), author: kenji, headRefOid: 'B', ...ci('SUCCESS'),
    viewerLatestReview: { submittedAt: iso(DAY + 100), commit: { oid: 'A' } },
    reviews: { nodes: [{ author: me, state: 'CHANGES_REQUESTED', submittedAt: iso(DAY + 100) }, { author: priya, state: 'APPROVED', submittedAt: iso(DAY + 90) }] },
    pushes: { nodes: [{ __typename: 'PullRequestCommit', commit: { committedDate: iso(50), author: { user: kenji } } }] } }),
  'acme/infra#92': pr({ state: 'OPEN', isDraft: true, title: 'Drop the Node 18 base image', createdAt: iso(DAY + 280), author: me, ...ci('FAILURE') }),
  'acme/mobile-app#310': pr({ state: 'CLOSED', title: 'Guard the keychain read on first launch', createdAt: iso(2 * DAY + 90), author: me, reviews: { nodes: [{ author: kenji, state: 'COMMENTED', submittedAt: iso(2 * DAY + 70) }] } }),
}));

const sleeps = Array.from({ length: 5 }, () => spawn('sleep', ['900'], { stdio: 'ignore' }));
const live = i => ({ pid: sleeps[i].pid, startedAt: Date.now() - 3600_000 });
const FABLE = 'claude-fable-5-1';
const userLine = (id, where, text, at) => ({ isSidechain: false, userType: 'external', entrypoint: 'cli', cwd: where, sessionId: id, version: 'fixture', gitBranch: 'main',
  parentUuid: null, type: 'user', uuid: randomUUID(), timestamp: at.toISOString(), message: { role: 'user', content: [{ type: 'text', text }] } });

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
const CARD_FILE = `${SF}/src/components/ProductGrid/ProductCard.css`;

const { chats } = makeFixture(claudeDir, [
  // the open chat of the hero shot: a turn of tool calls, a markdown reply, a PR
  { cwd: SF, title: 'Dark mode for the product grid', model: FABLE, at: ago(42),
    prompt: 'The product grid ignores the dark theme — the cards stay white. Make it follow the system setting.',
    reply: 'Let me see where the grid gets its colours from.',
    lines: id => [
      ...toolLines({ id, cwd: SF, name: 'Grep', input: { pattern: 'background: #fff', path: 'src/components' }, result: 'src/components/ProductGrid/ProductCard.css:6:  background: #fff;', at: ago(41) }),
      ...toolLines({ id, cwd: SF, name: 'Read', input: { file_path: CARD_FILE }, result: '…', at: ago(41) }),
      ...toolLines({ id, cwd: SF, name: 'Read', input: { file_path: `${SF}/src/theme/tokens.css` }, result: '…', at: ago(40) }),
      ...toolLines({ id, cwd: SF, name: 'Edit', input: { file_path: CARD_FILE }, result: 'The file has been updated.', at: ago(39) }),
      ...toolLines({ id, cwd: SF, name: 'Bash', input: { command: 'npm test -- ProductGrid', description: 'Run the grid tests' }, result: 'Tests: 14 passed, 14 total', at: ago(38) }),
      ...replyLines({ id, cwd: SF, text: gridReply, at: ago(37), model: FABLE }),
      userLine(id, SF, 'yes, open it', ago(35)),
      ...toolLines({ id, cwd: SF, name: 'Bash', input: { command: 'gh pr create --fill', description: 'Open the PR' }, result: 'https://github.com/acme/storefront/pull/479', at: ago(34) }),
      ...replyLines({ id, cwd: SF, text: 'Opened https://github.com/acme/storefront/pull/479 — the visual snapshots for the grid are updated in the same commit.', at: ago(33), model: FABLE }),
    ] },
  // clauding: a tool call in flight
  { cwd: SF, title: 'Retry declined payments', model: FABLE, at: ago(20), live: live(0),
    prompt: 'Declined cards should retry with backoff before we show the error — see https://github.com/acme/storefront/pull/482',
    reply: 'Reading the payment client first.',
    lines: id => [
      ...toolLines({ id, cwd: SF, name: 'Read', input: { file_path: `${SF}/src/checkout/payments.ts` }, result: '…', at: ago(6) }),
      ...toolLines({ id, cwd: SF, name: 'Edit', input: { file_path: `${SF}/src/checkout/payments.ts` }, result: 'The file has been updated.', at: ago(3) }),
      ...toolLines({ id, cwd: SF, name: 'Bash', input: { command: 'npm test -- payments', description: 'Run the payment tests' }, at: ago(1) }),
    ] },
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
  // ready, live, idle
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
  { cwd: SF, title: 'Cache the search suggestions', at: ago(2 * DAY + 180),
    prompt: 'Search suggestions hit the API on every keystroke. Cache them.',
    reply: 'Cached for five minutes per prefix — https://github.com/acme/storefront/pull/471.' },
]);
const chat = t => chats.find(c => c.title === t);
const agents = chat('Review the staging VPC plan');
const agentDir = join(dirname(agents.file), agents.id, 'subagents');
mkdirSync(agentDir, { recursive: true });
for (const n of [1, 2, 3]) writeFileSync(join(agentDir, `agent-${n}.jsonl`), JSON.stringify({ isSidechain: true, type: 'user', message: { role: 'user', content: 'go' } }) + '\n');

// Claude Code in the drawer, for the open chat resumed there: the screen the fake draws (it wraps it to its width).
const O = '\x1b[38;2;215;119;87m', B = '\x1b[1m', D = '\x1b[2m', R = '\x1b[0m', OK = '\x1b[38;2;78;186;101m', U = '\x1b[38;5;247m', C = '\x1b[38;2;177;185;249m';
const MINUS = '\x1b[48;2;92;30;36m', PLUS = '\x1b[48;2;24;72;40m';
const tool = (name, arg, ...result) => [`${OK}⏺${R} ${B}${name}${R}(${arg})`, ...result.map((r, i) => i ? `     ${r}` : `  ${D}⎿${R}  ${r}`), ''];
const diff = (n, sign, text) => `      ${D}${String(n).padStart(2)}${R} ${sign === '-' ? MINUS : sign === '+' ? PLUS : ''}${sign || ' '} ${text}${R}`;
const screenFile = join(root, 'screen.json');
writeFileSync(screenFile, JSON.stringify({ screen: [
  ` ${O}▐▛███▜▌${R}   ${B}Claude Code${R}`,
  `${O}▝▜█████▛▘${R}  ${D}Fable 5.1 · Claude Max${R}`,
  `  ${O}▘▘ ▝▝${R}    ${D}~/work/storefront${R}`,
  '',
  `${U}> The product grid ignores the dark theme — the cards stay white. Make it follow the system setting.${R}`,
  '',
  '⏺ Let me see where the grid gets its colours from.',
  '',
  ...tool('Search', 'pattern: "background: #fff", path: "src/components"', `Found ${B}1${R} file`),
  ...tool('Read', 'src/components/ProductGrid/ProductCard.css', `Read ${B}27${R} lines`),
  ...tool('Read', 'src/theme/tokens.css', `Read ${B}19${R} lines`),
  ...tool('Update', 'src/components/ProductGrid/ProductCard.css', `Updated ${B}ProductCard.css${R} with ${B}5${R} additions and ${B}5${R} removals`),
  diff(5, '', '  border-radius: 12px;'),
  diff(6, '-', '  background: #fff;'), diff(7, '-', '  color: #111;'), diff(8, '-', '  border: 1px solid #e5e5e5;'),
  diff(6, '+', '  background: var(--surface);'), diff(7, '+', '  color: var(--text);'), diff(8, '+', '  border: 1px solid var(--border-subtle);'),
  diff(9, '', '}'),
  '',
  ...tool('Bash', 'npm test -- ProductGrid', `${OK}✓${R} src/components/ProductGrid/ProductGrid.test.tsx ${D}(14 tests) 412ms${R}`, `${B}Tests${R}  ${OK}14 passed${R} (14)`),
  '⏺ The cards hard-code their colours instead of reading the theme tokens, so they never change with the system setting.',
  '',
  `  ${B}What changed${R}`,
  '',
  `  - ${C}ProductCard.css${R} reads ${C}var(--surface)${R} and ${C}var(--text)${R} instead of ${C}#fff${R} / ${C}#111${R}`,
  `  - the price badge uses ${C}--accent-muted${R}, which already has a dark value`,
  `  - the image placeholder uses ${C}--surface-sunken${R}, so nothing flashes white while images load`,
  '',
  '  All 14 grid tests pass. Want me to open a PR?',
  '',
  `${U}> yes, open it${R}`,
  '',
  ...tool('Bash', 'gh pr create --fill', 'https://github.com/acme/storefront/pull/479'),
  '⏺ Opened https://github.com/acme/storefront/pull/479 — the visual snapshots for the grid are updated in the same commit.',
  '',
], status: [`  \x1b[38;2;175;135;255m⏵⏵ accept edits on${R}${D} (shift+tab to cycle)${R}`] }));

// VS Code Web for the pane: a serve-web of its own, on a port of its own, its server data in the fixture.
const freePort = () => new Promise(res => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const VS = { port: await freePort(), proxy: await freePort(), child: null, server: null };
const vsUp = async () => { try { return (await fetch(`http://127.0.0.1:${VS.port}/`, { signal: AbortSignal.timeout(1500) })).status === 200; } catch { return false; } };
const endVs = () => { if (VS.child) { try { process.kill(-VS.child.pid, 'SIGTERM'); } catch {} VS.child = null; } VS.server?.close(); VS.server = null; };
process.on('exit', endVs);
const vsArgs = ['serve-web', '--host', '127.0.0.1', '--port', String(VS.port), '--without-connection-token', '--accept-server-license-terms', '--disable-telemetry', '--server-data-dir', join(root, 'vscode')];
VS.child = spawn(process.env.CODE_BIN || 'code', vsArgs, { stdio: 'ignore', detached: true });
VS.child.on('error', () => { VS.child = null; });
for (const t0 = Date.now(); VS.child && Date.now() - t0 < 90_000 && !(await vsUp());) await new Promise(r => setTimeout(r, 500));
if (!(await vsUp())) { console.error('readme-shots: no VS Code Web (the `code` CLI, CODE_BIN) — the chat shot goes without it'); endVs(); }
// Its settings, in the store VS Code Web keeps a user's files in (IndexedDB `vscode-web-db`, the path the key), written
// by a page of the same origin before the workbench loads: a dark theme, no welcome, no trust prompt, no AI panel.
const VS_SETTINGS = { 'workbench.colorTheme': 'Default Dark Modern', 'workbench.startupEditor': 'none', 'security.workspace.trust.enabled': false,
  'chat.disableAIFeatures': true, 'workbench.secondarySideBar.defaultVisibility': 'hidden', 'workbench.tips.enabled': false, 'telemetry.telemetryLevel': 'off',
  'extensions.ignoreRecommendations': true, 'editor.minimap.enabled': false, 'workbench.layoutControl.enabled': false, 'git.openRepositoryInParentFolders': 'never' };
const seedPage = to => `<!doctype html><script>
  const r = indexedDB.open('vscode-web-db', 3);
  r.onupgradeneeded = () => { for (const s of ['vscode-userdata-store', 'vscode-logs-store', 'vscode-filehandles-store']) if (!r.result.objectStoreNames.contains(s)) r.result.createObjectStore(s); };
  r.onsuccess = () => { const db = r.result, tx = db.transaction('vscode-userdata-store', 'readwrite');
    tx.objectStore('vscode-userdata-store').put(new TextEncoder().encode(${JSON.stringify(JSON.stringify(VS_SETTINGS, null, 2))}), '/User/settings.json');
    tx.oncomplete = () => { db.close(); location.replace(${JSON.stringify(to)}); }; };
</script>`;
// serve-web says SAMEORIGIN and frame-ancestors 'self'; the proxy drops both, and passes upgrades (its sockets) through.
if (VS.child) {
  VS.server = http.createServer((req, res) => {
    if (req.url.startsWith('/__seed?')) { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(seedPage(new URL(req.url, 'http://x').searchParams.get('to') || '/')); }
    const up = http.request({ host: '127.0.0.1', port: VS.port, method: req.method, path: req.url, headers: req.headers }, r => {
      const h = { ...r.headers }; delete h['x-frame-options']; delete h['content-security-policy'];
      res.writeHead(r.statusCode, h); r.pipe(res);
    });
    up.on('error', () => { try { res.writeHead(502); res.end(); } catch {} });
    req.pipe(up);
  });
  VS.server.on('upgrade', (req, sock, head) => {
    const up = net.connect(VS.port, '127.0.0.1', () => {
      const hs = []; for (let i = 0; i < req.rawHeaders.length; i += 2) hs.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`);
      up.write(`${req.method} ${req.url} HTTP/1.1\r\n${hs.join('\r\n')}\r\n\r\n`); if (head?.length) up.write(head);
      up.pipe(sock); sock.pipe(up);
    });
    up.on('error', () => sock.destroy()); sock.on('error', () => up.destroy());
  });
  await new Promise(r => VS.server.listen(VS.proxy, '127.0.0.1', r));
}

// the board as it starts — the app's own defaults: tiles, the floating header, the status bar, Done folded (the
// harness opens every lane and turns the first two off unless told)
export const meta = {
  server: true, fake: true, fixture: claudeDir,
  env: { GH_BIN: join(ROOT, 'scripts', 'fakegh.mjs'), FAKEGH_PRS: prsFile, FAKEGH_VIEWER: 'me', ORG: 'acme', ORG_DIR: work,
    VSWEB_PORT: String(VS.port), FAKE_TUI: 'fullscreen', FAKE_SCREEN: screenFile },
  prefs: { lanesShut: ['done'], tiles: true, headFloat: true, changesScope: 'uncommitted' },
};

// What /api/usage and /api/stats would answer — the page's fetch answers them before the server is asked — and the
// snapshot's word on who and where (the home's user@host, the About box): made up, as the rest is.
const inMin = m => new Date(now + m * 60_000).toISOString();
const USAGE = { fetchedAt: new Date(now).toISOString(), windows: [
  { key: 'five_hour', label: 'session · 5 h', percent: 34, resetsAt: inMin(130) },
  { key: 'seven_day', label: 'week · all models', percent: 58, resetsAt: inMin(3 * DAY + 200) },
  { key: 'limits:weekly_scoped:Fable', label: 'week · Fable', percent: 71, resetsAt: inMin(3 * DAY + 200) },
] };
const STATS = { cpu: 23, mem: { used: 21.4 * 2 ** 30, total: 36 * 2 ** 30 } };
const ABOUT = { user: 'ada', host: 'studio', claudeDir: '~/.claude', stateFile: '~/Library/Application Support/peixAIrada/state.json', configFile: '~/.config/peixairada/config.json' };
// Only the board's own frame: the scripts run in every frame, VS Code's too.
const PAGE = `(() => { if (window.top !== window) return;
  const f = window.fetch, answer = o => Promise.resolve(new Response(JSON.stringify(o), { status: 200, headers: { 'content-type': 'application/json' } }));
  window.fetch = (url, o) => String(url).includes('/api/usage') ? answer(${JSON.stringify(USAGE)}) : String(url).includes('/api/stats') ? answer(${JSON.stringify(STATS)}) : f(url, o);
  const ES = window.EventSource;
  window.EventSource = class extends ES { addEventListener(t, fn, o) { return super.addEventListener(t, t !== 'snapshot' ? fn : e => {
    let d = e.data; try { const j = JSON.parse(d); if (j.about) Object.assign(j.about, ${JSON.stringify(ABOUT)}); d = JSON.stringify(j); } catch {}
    fn(new MessageEvent(t, { data: d })); }, o); } };
  // the app's shell: the pane's pages as iframes over the halves it names — VS Code Web through the proxy, a page
  // that can't be framed (GitHub) left blank
  const views = new Map();
  const place = m => {
    let host = document.getElementById('shotpane');
    if (!host) { host = document.createElement('div'); host.id = 'shotpane'; host.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:25'; document.body.append(host); }
    for (const v of views.values()) v.style.display = 'none';
    for (const p of m.panes || []) {
      const ide = /^ide:http:\\/\\/127\\.0\\.0\\.1:${VS.port}(\\/.*)$/.exec(p.key); if (!ide || !${VS.child ? 'true' : 'false'}) continue;
      let v = views.get(p.key);
      if (!v) { v = document.createElement('iframe'); v.src = 'http://127.0.0.1:${VS.proxy}/__seed?to=' + encodeURIComponent(ide[1]); v.style.cssText = 'position:absolute;border:0;pointer-events:auto;background:#1f1f1f'; views.set(p.key, v); host.append(v); }
      Object.assign(v.style, { display: 'block', left: p.left + 'px', top: p.top + 'px', width: p.width + 'px', height: p.height + 'px' });
    }
  };
  window.webkit = { messageHandlers: { hub: { postMessage: m => { if (m?.type === 'pane') place(m); } } } };
})()`;

export default async function (ctx) {
  const shots = [];
  const snap = async (name, clip) => {
    await ctx.settle(); await ctx.sleep(300);
    const r = await ctx.send('Page.captureScreenshot', { format: 'webp', quality: 92, ...(clip ? { clip: { scale: 1, ...clip } } : {}) });
    const f = join(OUT, `${name}.webp`); writeFileSync(f, Buffer.from(r.result.data, 'base64')); shots.push(f); ctx.log(`→ ${f}`);
  };
  const theme = dark => ctx.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' }] });
  const scale = s => ctx.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: s, mobile: false });
  const rect = sel => ctx.evaluate(`(r => ({ x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) }))(document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect())`);
  const grid = chat('Dark mode for the product grid');
  // The board on the prefs given (on what it has, over them), reloaded, the open chat open and its PRs answered.
  const board = async (prefs = {}) => {
    await ctx.evaluate(`(p => { const k = 'peixairada-prefs'; localStorage.setItem(k, JSON.stringify({ ...JSON.parse(localStorage.getItem(k) || '{}'), ...p })); })(${JSON.stringify(prefs)})`);
    await ctx.reload();
    await ctx.waitFor(`document.querySelectorAll('#slist > .card').length >= ${chats.length - 2}`, { what: 'the cards', timeout: 15000 });
    await ctx.openChat(grid.id);
    await ctx.waitFor(`${JSON.stringify(chats.map(c => c.id))}.filter(id => window.peix.session(id)?.prs?.some(p => p.state)).length >= 5`, { what: 'the PR states from the fake gh', timeout: 30000 });
  };
  const VSC = `127.0.0.1:${VS.port}`;
  try {
    mkdirSync(OUT, { recursive: true });
    for (const f of ['board-dark', 'board-light', 'simple-dark', 'simple-light', 'cards-dark', 'timeline-dark', 'picker-dark']) rmSync(join(OUT, `${f}.png`), { force: true });
    await scale(2);
    await ctx.send('Page.addScriptToEvaluateOnNewDocument', { source: PAGE });
    await ctx.server.post(`/api/sessions/${chat('Rewrite the getting-started guide').id}/done`, { done: true });
    await board();
    await ctx.waitFor(`document.querySelector('#slist > .gsep.lane.done.shut')`, { what: 'Done folded into its lane', timeout: 15000 });
    await ctx.waitFor(`window.peix.sessions().some(s => s.agents === 3)`, { what: 'the three sub-agents', timeout: 20000 });

    // 1 · the board: a project's chats, the chat, both themes
    for (const dark of [true, false]) { await theme(dark); await snap(`board-${dark ? 'dark' : 'light'}`); }

    // 2 · the chat list alone, up close — the four readings of a card's edge
    await theme(true);
    const list = await rect('#sessions');
    await snap('cards-dark', { ...list, height: Math.min(list.height, 640) });

    // 3 · ⌥⌘L, the launcher: its menu
    await ctx.key('KeyL'); await ctx.waitFor(`document.querySelector('#pick[open]')`, { what: 'the launcher' });
    await ctx.settle();
    const pick = await rect('#pick[open]'), pad = 28;
    await snap('launcher-dark', { x: pick.x - pad, y: Math.max(0, pick.y - pad), width: pick.width + 2 * pad, height: pick.height + 2 * pad });
    await ctx.key('Escape'); await ctx.evaluate(`document.querySelector('dialog[open]')?.close()`);

    // 4 · the timeline swelled: the pointer held at the window's left edge calls it out
    await ctx.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 1, y: 420 });
    await ctx.waitFor(`window.peix.state().timeline.shown && window.peix.state().timeline.k === 1`, { what: 'the timeline called out' });
    await ctx.sleep(300);
    await snap('timeline-dark', { ...list, height: Math.min(list.height, 640) });
    await ctx.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: W - 5, y: H / 2 });
    await ctx.waitFor(`!window.peix.state().timeline.shown`, { what: 'the timeline gone again' });

    // 5 · ⌥⌘A, every agent at once
    await ctx.key('KeyA'); await ctx.waitFor(`document.querySelector('#ov[open]')`, { what: 'the overview' });
    await ctx.sleep(1500);
    await snap('overview-dark');
    await ctx.key('Escape'); await ctx.evaluate(`document.querySelector('dialog[open]')?.close()`);

    // 6 · the ways it can look, smaller: each a switch or a key, the board reloaded on it
    await scale(1);
    const looks = [
      ['look-plain', { tiles: false, headFloat: false }, true],
      ['look-rail', { tiles: true, headFloat: true, sessionsCompact: true }, true],
      ['look-tokyo', { sessionsCompact: false, cards: 'large', cardsEven: false, skinDark: 'tokyo-night' }, true],
      ['look-latte', { skinDark: null, skinLight: 'catppuccin-latte' }, false],
    ];
    for (const [name, prefs, dark] of looks) {
      await theme(dark); await board(prefs);
      await ctx.sleep(500); await snap(name);
    }
    await scale(2); await theme(true); await board({ skinLight: null });

    // 7 · home, ⌥⌘0: the board at a glance and the day
    await ctx.key('Digit0'); await ctx.waitFor(`document.querySelector('#home .hh')`, { what: 'the home' });
    await ctx.sleep(800); await snap('home-dark');
    await board();

    // 8 · in the chat: Claude in the drawer on the left; a zsh, the PR and VS Code Web on tabs on the right
    await ctx.key('KeyT'); await ctx.waitFor(`window.peix.state().tabs.some(k => k.startsWith('shell:'))`, { what: 'the zsh tab', timeout: 15000 });
    await ctx.key('KeyG'); await ctx.waitFor(`window.peix.state().tabs.some(k => k.startsWith('gh:'))`, { what: 'the PR tab' });
    await ctx.key('KeyC'); await ctx.waitFor(`window.peix.state().termSession === ${JSON.stringify(grid.id)} && !window.peix.state().termExited`, { what: 'Claude in the drawer', timeout: 20000 });
    await ctx.waitFor(`String(window.peix.screen(0)).includes('accept edits')`, { what: 'the drawer drawn', timeout: 15000 }).catch(() => ctx.log('the drawer\'s screen was not read back'));
    if (VS.child) {
      await ctx.key('KeyE'); await ctx.waitFor(`window.peix.state().tabs.some(k => k.startsWith('ide:'))`, { what: 'the VS Code tab', timeout: 20000 });
      await ctx.waitFor(`!!document.querySelector('#shotpane iframe')`, { what: 'VS Code Web over its half' });
      await ctx.sleep(9000);   // the workbench loads, finds the repo
      // Quick Open, from a click in the editor's area: ProductCard.css, its gutter showing the uncommitted edit
      const f = await rect('#shotpane iframe');
      await ctx.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: f.x + f.width * 0.65, y: f.y + f.height * 0.5, button: 'left', clickCount: 1 });
      await ctx.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: f.x + f.width * 0.65, y: f.y + f.height * 0.5, button: 'left', clickCount: 1 });
      await ctx.sleep(300);
      await ctx.send('Input.dispatchKeyEvent', { type: 'keyDown', modifiers: 4, key: 'p', code: 'KeyP', windowsVirtualKeyCode: 80 });
      await ctx.send('Input.dispatchKeyEvent', { type: 'keyUp', modifiers: 4, key: 'p', code: 'KeyP', windowsVirtualKeyCode: 80 });
      await ctx.sleep(800);
      await ctx.send('Input.insertText', { text: 'ProductCard.css' });
      await ctx.sleep(1200);
      await ctx.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
      await ctx.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
      await ctx.sleep(2500);
      // the address as the app would show it for a folder of the made-up user's, not the fixture's temp path
      await ctx.evaluate(`(k => window.peixPaneUrl(k, 'http://127.0.0.1:7332/?folder=' + encodeURIComponent('/Users/ada/work/storefront')))(window.peix.state().tabs.find(k => k.startsWith('ide:')))`);
    }
    // the PR's rows under the header: its state, its CI, whose move
    await ctx.evaluate(`document.querySelector('#prToggle').click()`);
    await ctx.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 600, y: 500 });
    await snap('chat-dark');

    // 9 · ⌥⌘D, the chat's changes beside it — the list folded to its rail (⌥⌘B), for the room
    await ctx.key('KeyB'); await ctx.waitFor(`window.peix.prefs().sessionsCompact`, { what: 'the rail' });
    await ctx.key('KeyD'); await ctx.waitFor(`window.peix.state().tab === 'changes' && document.querySelector('#chg .dfile, #chg .dl, #chg pre, #chg table')`, { what: 'the changes', timeout: 15000 }).catch(() => ctx.log('the changes did not show as expected'));
    await ctx.sleep(800);
    await snap('changes-dark');
    await ctx.key('KeyB');
    return { shots, vscode: !!VS.child, url: VSC };
  } finally {
    endVs();
    for (const s of sleeps) try { s.kill(); } catch {}
    rmSync(root, { recursive: true, force: true });
  }
}
