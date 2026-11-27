// A stand-in for Jira Cloud's REST API (2026-10-08): the three calls the board makes — the site's projects, who you
// are, and a bulk fetch of issues — answered from a list, on a loopback port, for the tests and the scenarios.
//   import { startFakeJira } from './fakejira.mjs';
//   const jira = await startFakeJira({ issues: { 'ACME-12': { summary, status, cat: 'new' | 'indeterminate' | 'done', type, assignee } }, projects: ['ACME'] });
//   … setup.jira = { site: jira.url, email: jira.email }, JIRA_API_TOKEN = jira.token … await jira.close();
// A request without that email and token is a 401, as Jira's. `calls` counts each path; `bulk` holds every key list asked.
// `delays` (path → ms, also on the returned object, read per request) holds an answer back — a call still in flight.
import { createServer } from 'node:http';

export async function startFakeJira({
  issues = {},
  projects = null,
  email = 'me@acme.test',
  token = 'fake-jira-token',
  me = { accountId: 'acc-me', displayName: 'Me Myself' },
  delays = {},
} = {}) {
  const calls = {};
  const bulk = [];

  const auth = `Basic ${Buffer.from(`${email}:${token}`).toString('base64')}`;
  const keys = projects || [...new Set(Object.keys(issues).map(key => key.split('-')[0]))];

  const issue = (key, spec) => ({
    key,
    id: String(Math.abs([...key].reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) | 0, 7))),
    fields: {
      summary: spec.summary || key,
      issuetype: { name: spec.type || 'Task' },
      status: { name: spec.status || 'To Do', statusCategory: { key: spec.cat || 'new' } },
      assignee: spec.assignee
        ? {
            accountId: spec.assignee === 'me' ? me.accountId : `acc-${spec.assignee}`,
            displayName: spec.assignee === 'me' ? me.displayName : spec.assignee,
            avatarUrls: { '24x24': null },
          }
        : null,
    },
  });

  const server = createServer((req, res) => {
    const path = new URL(req.url, 'http://x').pathname;

    calls[path] = (calls[path] || 0) + 1;

    const send = (code, body) => {
      res.writeHead(code, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };

    if (req.headers.authorization !== auth) {
      return send(401, { errorMessages: ['Client must be authenticated to access this resource.'] });
    }

    let raw = '';

    req.on('data', chunk => {
      raw += chunk;
    });

    req.on('end', () =>
      (delays[path] ? callback => setTimeout(callback, delays[path]) : callback => callback())(() => {
        if (req.method === 'GET' && path === '/rest/api/3/myself') return send(200, me);

        if (req.method === 'GET' && path === '/rest/api/3/project/search') {
          return send(200, { isLast: true, values: keys.map(key => ({ key, name: key })) });
        }

        if (req.method === 'POST' && path === '/rest/api/3/issue/bulkfetch') {
          const want = (JSON.parse(raw || '{}').issueIdsOrKeys || []).map(String);

          bulk.push(want);
          const found = want.filter(key => issues[key]);

          return send(200, {
            issues: found.map(key => issue(key, issues[key])),
            issueErrors: want
              .filter(key => !issues[key])
              .map(key => ({
                issueIdsOrKeys: [key],
                errorMessages: ['Issue does not exist or you do not have permission to see it.'],
              })),
          });
        }

        send(404, { errorMessages: [`no such call: ${req.method} ${path}`] });
      }),
    );
  });

  await new Promise(res => server.listen(0, '127.0.0.1', res));
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    email,
    token,
    issues,
    calls,
    bulk,
    delays,
    close: () => new Promise(res => server.close(res)),
  };
}
