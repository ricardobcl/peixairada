// A stand-in for Jira Cloud's REST API (2026-10-08): the three calls the board makes — the site's projects, who you
// are, and a bulk fetch of issues — answered from a list, on a loopback port, for the tests and the scenarios.
//   import { startFakeJira } from './fakejira.mjs';
//   const jira = await startFakeJira({ issues: { 'ACME-12': { summary, status, cat: 'new' | 'indeterminate' | 'done', type, assignee } }, projects: ['ACME'] });
//   … setup.jira = { site: jira.url, email: jira.email }, JIRA_API_TOKEN = jira.token … await jira.close();
// A request without that email and token is a 401, as Jira's. `calls` counts each path; `bulk` holds every key list asked.
import { createServer } from 'node:http';

export async function startFakeJira({ issues = {}, projects = null, email = 'me@acme.test', token = 'fake-jira-token', me = { accountId: 'acc-me', displayName: 'Me Myself' } } = {}) {
  const calls = {}, bulk = [];
  const auth = `Basic ${Buffer.from(`${email}:${token}`).toString('base64')}`;
  const keys = projects || [...new Set(Object.keys(issues).map(k => k.split('-')[0]))];
  const issue = (key, i) => ({ key, id: String(Math.abs([...key].reduce((h, c) => h * 31 + c.charCodeAt(0) | 0, 7))), fields: {
    summary: i.summary || key, issuetype: { name: i.type || 'Task' },
    status: { name: i.status || 'To Do', statusCategory: { key: i.cat || 'new' } },
    assignee: i.assignee ? { accountId: i.assignee === 'me' ? me.accountId : `acc-${i.assignee}`, displayName: i.assignee === 'me' ? me.displayName : i.assignee, avatarUrls: { '24x24': null } } : null } });
  const server = createServer((req, res) => {
    const path = new URL(req.url, 'http://x').pathname;
    calls[path] = (calls[path] || 0) + 1;
    const send = (code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
    if (req.headers.authorization !== auth) return send(401, { errorMessages: ['Client must be authenticated to access this resource.'] });
    let raw = ''; req.on('data', c => { raw += c; }); req.on('end', () => {
      if (req.method === 'GET' && path === '/rest/api/3/myself') return send(200, me);
      if (req.method === 'GET' && path === '/rest/api/3/project/search') return send(200, { isLast: true, values: keys.map(key => ({ key, name: key })) });
      if (req.method === 'POST' && path === '/rest/api/3/issue/bulkfetch') {
        const want = (JSON.parse(raw || '{}').issueIdsOrKeys || []).map(String); bulk.push(want);
        const found = want.filter(k => issues[k]);
        return send(200, { issues: found.map(k => issue(k, issues[k])), issueErrors: want.filter(k => !issues[k]).map(k => ({ issueIdsOrKeys: [k], errorMessages: ['Issue does not exist or you do not have permission to see it.'] })) });
      }
      send(404, { errorMessages: [`no such call: ${req.method} ${path}`] });
    });
  });
  await new Promise(res => server.listen(0, '127.0.0.1', res));
  return { url: `http://127.0.0.1:${server.address().port}`, email, token, issues, calls, bulk, close: () => new Promise(res => server.close(res)) };
}
