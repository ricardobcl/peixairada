// A stand-in for GitHub's REST API (2026-10-17): the calls the chat makes — who you are and who someone is, a repo with
// its collaborators and invitations, its issues (the rooms) and their comments, a label, the repo's subscription, a repo
// made — on a loopback port, for the tests and the scenarios. A token is `fake-token-<login>` (the fake gh's `auth
// token`); one it does not know is a 401. Every GET answers with a weak ETag of its body, and a 304 to that ETag; `calls`
// holds each request as `METHOD path status`. Who may do what follows GitHub's roles: `pull` reads, opens issues and
// comments, deletes its own; `push` also labels, closes and deletes anyone's; `admin` also invites and removes.
//   import { startFakeGitHub } from './fakegithub.mjs';
//   const gh = await startFakeGitHub({ users: ['me', 'ana'], orgs: { 'acme-chat': ['me'] },
//     repos: { 'acme-chat/room': { perms: { me: 'admin', ana: 'pull' }, rooms: [{ title: 'General', comments: [['ana', 'hi']] }] } } });
//   … env GITHUB_API = gh.url … gh.say('acme-chat/room', 1, 'ana', 'hello') … await gh.close();
// A repo's `org` is its owner's being one of `orgs` (whose admins may make repos there); `description` starts with the
// board's mark unless given. `say`, `edit` and `drop` change it as another board would; `invite(repo, login, by)` too.
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';

const face = login => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" fill="hsl(${[...login].reduce((h, c) => h + c.charCodeAt(0) * 37, 0) % 360} 55% 55%)"/><text x="8" y="12" font-size="10" text-anchor="middle" fill="#fff" font-family="sans-serif">${login[0].toUpperCase()}</text></svg>`)}`;
const ROLE = { pull: 1, push: 2, admin: 3 }, ROLE_NAME = { pull: 'read', push: 'write', admin: 'admin' };

export async function startFakeGitHub({ users = ['me'], orgs = {}, repos = {} } = {}) {
  const people = new Map(), all = new Map(), calls = [];
  let nextId = 5000, inviteId = 700, clock = Date.parse('2026-10-17T09:00:00Z');
  const at = () => new Date(clock += 1000).toISOString();
  const user = login => { if (!people.has(login)) people.set(login, { login, id: people.size + 1, type: /\[bot\]$/.test(login) ? 'Bot' : 'User', avatar_url: face(login) }); return people.get(login); };
  for (const u of users) user(u);
  const isOrg = owner => Object.keys(orgs).some(o => o.toLowerCase() === owner.toLowerCase());
  function makeRepo(full, { perms = {}, description, rooms = [], private: priv = true } = {}) {
    const [owner, name] = full.split('/'), r = { owner, name, full_name: full, private: priv, description: description ?? 'peixAIrada chat — its rooms are the issues labelled room', perms: { ...perms }, invitations: [], issues: [], labels: new Set(), subs: {} };
    if (!isOrg(owner)) r.perms[owner] = 'admin';
    all.set(full.toLowerCase(), r);
    for (const room of rooms) {
      const i = { number: r.issues.length + 1, title: room.title, labels: room.labels || ['room'], state: room.state || 'open', user: user(room.by || owner), comments: [] };
      if (i.labels.includes('room')) r.labels.add('room');
      for (const [by, body] of room.comments || []) { const t = at(); i.comments.push({ id: nextId++, user: user(by), body, created_at: t, updated_at: t }); }
      r.issues.push(i);
    }
    return r;
  }
  for (const [full, spec] of Object.entries(repos)) makeRepo(full, spec);
  const role = (r, login) => r.perms[login] || (isOrg(r.owner) && orgs[Object.keys(orgs).find(o => o.toLowerCase() === r.owner.toLowerCase())]?.includes(login) ? 'admin' : null);
  const may = (r, login, need) => (ROLE[role(r, login)] || 0) >= ROLE[need];
  const issueOut = (r, i) => ({ number: i.number, title: i.title, state: i.state, user: i.user, labels: i.labels.map(name => ({ name })), comments: i.comments.length, url: `https://api.github.com/repos/${r.full_name}/issues/${i.number}` });
  const commentOut = (r, i, c) => ({ id: c.id, user: c.user, body: c.body, created_at: c.created_at, updated_at: c.updated_at, issue_url: `https://api.github.com/repos/${r.full_name}/issues/${i.number}`, html_url: `https://github.com/${r.full_name}/issues/${i.number}#issuecomment-${c.id}` });
  const repoOut = (r, login) => ({ full_name: r.full_name, name: r.name, private: r.private, description: r.description, owner: { login: r.owner, type: isOrg(r.owner) ? 'Organization' : 'User' },
    permissions: { admin: may(r, login, 'admin'), push: may(r, login, 'push'), pull: may(r, login, 'pull') } });
  const inviteOut = (r, v) => ({ id: v.id, invitee: user(v.login), inviter: user(v.by), created_at: v.created_at, expired: !!v.expired, permissions: v.permission === 'pull' ? 'read' : 'write', repository: { full_name: r.full_name, description: r.description, private: r.private } });
  const comments = r => r.issues.flatMap(i => i.comments.map(c => commentOut(r, i, c)));
  const find = id => { for (const r of all.values()) for (const i of r.issues) { const c = i.comments.find(x => x.id === id); if (c) return { r, i, c }; } return null; };

  const server = createServer((req, res) => {
    let raw = ''; req.on('data', d => { raw += d; });
    req.on('end', () => {
      const u = new URL(req.url, 'http://x'), path = u.pathname, q = u.searchParams, M = req.method;
      const send = (code, body) => {
        let text = body === undefined ? '' : JSON.stringify(body), tag = null;
        if (M === 'GET' && code === 200) { tag = `W/"${createHash('sha1').update(text).digest('hex')}"`; if (req.headers['if-none-match'] === tag) { code = 304; text = ''; } }
        calls.push(`${M} ${path}${u.search} ${code}`);
        res.writeHead(code, { 'content-type': 'application/json', ...tag && { etag: tag } }); res.end(text);
      };
      const no = (code, message) => send(code, { message });
      const token = /^Bearer fake-token-(.+)$/.exec(req.headers.authorization || ''), me = token && people.has(token[1]) ? token[1] : null;
      if (!me) return no(401, 'Bad credentials');
      let body = {}; try { body = raw ? JSON.parse(raw) : {}; } catch { return no(400, 'Problems parsing JSON'); }
      let m;
      if (M === 'GET' && path === '/user') return send(200, user(me));
      if (M === 'GET' && (m = path.match(/^\/users\/([^/]+)$/))) return people.has(m[1]) ? send(200, user(m[1])) : no(404, 'Not Found');
      if (M === 'GET' && path === '/user/repository_invitations') return send(200, [...all.values()].flatMap(r => r.invitations.filter(v => v.login === me).map(v => inviteOut(r, v))));
      if (M === 'PATCH' && (m = path.match(/^\/user\/repository_invitations\/(\d+)$/))) {
        for (const r of all.values()) { const v = r.invitations.find(x => x.id === Number(m[1]) && x.login === me); if (v) { r.invitations.splice(r.invitations.indexOf(v), 1); r.perms[me] = v.permission; return send(204); } }
        return no(404, 'Not Found');
      }
      if (M === 'POST' && (path === '/user/repos' || (m = path.match(/^\/orgs\/([^/]+)\/repos$/)))) {
        const owner = m ? m[1] : me;
        if (m && !orgs[owner]?.includes(me)) return no(403, 'You need admin access to the organization before adding a repository to it.');
        if (all.has(`${owner}/${body.name}`.toLowerCase())) return send(422, { message: 'Repository creation failed.', errors: [{ message: 'name already exists on this account' }] });
        const r = makeRepo(`${owner}/${body.name}`, { description: body.description || '', private: body.private !== false, perms: m ? {} : {} });
        return send(201, repoOut(r, me));
      }
      if (!(m = path.match(/^\/repos\/([^/]+)\/([^/]+)(\/.*)?$/))) return no(404, 'Not Found');
      const r = all.get(`${m[1]}/${m[2]}`.toLowerCase()), rest = m[3] || '';
      if (!r || !may(r, me, 'pull')) return no(404, 'Not Found');
      if (M === 'GET' && !rest) return send(200, repoOut(r, me));
      if (M === 'PUT' && rest === '/subscription') { r.subs[me] = { subscribed: !!body.subscribed, ignored: !!body.ignored }; return send(200, { ...r.subs[me], url: `https://api.github.com/repos/${r.full_name}/subscription` }); }
      if (M === 'GET' && rest === '/collaborators') {
        if (!may(r, me, 'push')) return no(403, 'Must have push access to view repository collaborators.');
        return send(200, Object.entries(r.perms).map(([login, p]) => ({ ...user(login), role_name: ROLE_NAME[p] })));
      }
      if ((m = rest.match(/^\/collaborators\/([^/]+)$/))) {
        const who = m[1];
        if (M === 'PUT') {
          if (!may(r, me, 'admin')) return no(403, 'Must have admin rights to Repository.');
          if (!people.has(who)) return no(404, 'Not Found');
          if (r.perms[who]) return send(204);
          if (!r.invitations.some(v => v.login === who)) r.invitations.push({ id: inviteId++, login: who, by: me, created_at: at(), permission: isOrg(r.owner) ? (body.permission || 'push') : 'push' });
          return send(201, inviteOut(r, r.invitations.find(v => v.login === who)));
        }
        if (M === 'DELETE') { if (who !== me && !may(r, me, 'admin')) return no(403, 'Must have admin rights to Repository.'); delete r.perms[who]; return send(204); }
      }
      if (M === 'GET' && rest === '/invitations') { if (!may(r, me, 'admin')) return no(403, 'Must have admin rights to Repository.'); return send(200, r.invitations.map(v => inviteOut(r, v))); }
      if (M === 'DELETE' && (m = rest.match(/^\/invitations\/(\d+)$/))) {
        if (!may(r, me, 'admin')) return no(403, 'Must have admin rights to Repository.');
        r.invitations = r.invitations.filter(v => v.id !== Number(m[1])); return send(204);
      }
      if (M === 'POST' && rest === '/labels') {
        if (!may(r, me, 'push')) return no(403, 'Must have push access to repository');
        if (r.labels.has(body.name)) return send(422, { message: 'Validation Failed', errors: [{ code: 'already_exists' }] });
        r.labels.add(body.name); return send(201, { name: body.name });
      }
      if (M === 'GET' && rest === '/issues') {
        const label = q.get('labels'), state = q.get('state') || 'open';
        return send(200, r.issues.filter(i => (state === 'all' || i.state === state) && (!label || i.labels.includes(label))).map(i => issueOut(r, i)));
      }
      if (M === 'POST' && rest === '/issues') {
        const labels = may(r, me, 'push') ? (body.labels || []) : [];   // a reader's labels are dropped, as GitHub drops them
        const i = { number: r.issues.length + 1, title: String(body.title || ''), labels, state: 'open', user: user(me), comments: [] };
        r.issues.push(i); return send(201, issueOut(r, i));
      }
      if (M === 'PATCH' && (m = rest.match(/^\/issues\/(\d+)$/))) {
        const i = r.issues.find(x => x.number === Number(m[1])); if (!i) return no(404, 'Not Found');
        if (!may(r, me, 'push') && i.user.login !== me) return no(403, 'Must have push access');
        if (body.state) i.state = body.state; if (body.title) i.title = body.title;
        return send(200, issueOut(r, i));
      }
      if (M === 'GET' && rest === '/issues/comments') {
        const key = q.get('sort') === 'updated' ? 'updated_at' : 'created_at', down = q.get('direction') === 'desc', per = Math.min(100, Number(q.get('per_page')) || 30);
        const list = comments(r).sort((a, b) => (a[key] === b[key] ? a.id - b.id : a[key] < b[key] ? -1 : 1) * (down ? -1 : 1));
        return send(200, list.slice(0, per));
      }
      if ((m = rest.match(/^\/issues\/(\d+)\/comments$/))) {
        const i = r.issues.find(x => x.number === Number(m[1])); if (!i) return no(404, 'Not Found');
        if (M === 'GET') { const per = Math.min(100, Number(q.get('per_page')) || 30), page = Math.max(1, Number(q.get('page')) || 1); return send(200, i.comments.slice((page - 1) * per, page * per).map(c => commentOut(r, i, c))); }
        if (M === 'POST') { const t = at(), c = { id: nextId++, user: user(me), body: String(body.body || ''), created_at: t, updated_at: t }; i.comments.push(c); return send(201, commentOut(r, i, c)); }
      }
      if (M === 'DELETE' && (m = rest.match(/^\/issues\/comments\/(\d+)$/))) {
        const f = find(Number(m[1])); if (!f || f.r !== r) return no(404, 'Not Found');
        if (f.c.user.login !== me && !may(r, me, 'push')) return no(403, 'Must have push access');
        f.i.comments.splice(f.i.comments.indexOf(f.c), 1); return send(204);
      }
      no(404, `no such call: ${M} ${path}`);
    });
  });
  await new Promise(ok => server.listen(0, '127.0.0.1', ok));
  const repo = full => all.get(full.toLowerCase());
  return {
    url: `http://127.0.0.1:${server.address().port}`, calls, repo,
    /** A message another board sent: its id. */
    say(full, n, login, body) { const t = at(), c = { id: nextId++, user: user(login), body, created_at: t, updated_at: t }; repo(full).issues.find(i => i.number === n).comments.push(c); return c.id; },
    edit(id, body) { const f = find(id); f.c.body = body; f.c.updated_at = at(); },
    drop(id) { const f = find(id); f.i.comments.splice(f.i.comments.indexOf(f.c), 1); },
    invite(full, login, by) { const r = repo(full); user(login); r.invitations.push({ id: inviteId++, login, by, created_at: at(), permission: isOrg(r.owner) ? 'pull' : 'push' }); },
    user,
    close: () => new Promise(ok => { server.closeAllConnections?.(); server.close(ok); }),
  };
}
