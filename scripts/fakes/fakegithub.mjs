// A stand-in for GitHub's REST API (2026-10-17): the calls the chat makes — who you are and who someone is, a repo with
// its collaborators and invitations, its issues (the rooms) and their comments with their reactions (a poll's votes), a
// label, the repo's subscription, a repo made — on a loopback port, for the tests and the scenarios. A token is `fake-token-<login>` (the fake gh's `auth
// token`); one it does not know is a 401. Every GET answers with a weak ETag of its body, and a 304 to that ETag; `calls`
// holds each request as `METHOD path status`. Who may do what follows GitHub's roles: `pull` reads, opens issues and
// comments, deletes its own; `push` also labels, closes and deletes anyone's; `admin` also invites and removes.
//   import { startFakeGitHub } from './fakegithub.mjs';
//   const gh = await startFakeGitHub({ users: ['me', 'ana'], orgs: { 'acme-chat': ['me'] },
//     repos: { 'acme-chat/room': { perms: { me: 'admin', ana: 'pull' }, rooms: [{ title: 'General', comments: [['ana', 'hi']] }] } } });
//   … env GITHUB_API = gh.url … gh.say('acme-chat/room', 1, 'ana', 'hello') … await gh.close();
// A repo's `org` is its owner's being one of `orgs` (whose admins may make repos there; each made a day after the one
// before it) or of `members` (organizations where those logins are members only); `description` starts with the
// board's mark unless given. `say`, `edit` and `drop` change it as another board would; `invite(repo, login, by)` and
// `react(id, login, content)` (a vote; `unreact` takes it back) too.
// Pictures (2026-11-25): GitHub's attachment endpoint (`POST /user-attachments/assets?name&content_type&repository_id`,
// on this same port: the board's GITHUB_UPLOADS follows GITHUB_API) takes a picture from whoever can push to that repo
// — a 404 otherwise, as GitHub answers —, and POST /markdown renders `![](…)` as GitHub does for you: an attachment of a
// repo you can read as a signed address on this port (`/pics/…?jwt=`, served with no token), any other as it was.
// `asset(repo, bytes, type)` is a picture dropped on GitHub's page; `assets` holds them all.
// Edits and emoji (2026-11-25): a comment PATCHed by its author (or a writer), as GitHub allows; GET /emojis a few of
// GitHub's names, Unicode ones by their code points and one picture of its own (`octocat`), as GitHub answers.
import { createHash, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';

const face = login =>
  `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" fill="hsl(${[...login].reduce((h, c) => h + c.charCodeAt(0) * 37, 0) % 360} 55% 55%)"/><text x="8" y="12" font-size="10" text-anchor="middle" fill="#fff" font-family="sans-serif">${login[0].toUpperCase()}</text></svg>`)}`;

const ROLE = { pull: 1, push: 2, admin: 3 };
const ROLE_NAME = { pull: 'read', push: 'write', admin: 'admin' };

const REACTIONS = ['+1', '-1', 'laugh', 'confused', 'heart', 'hooray', 'rocket', 'eyes'];

export async function startFakeGitHub({
  users = ['me'],
  orgs = {},
  members = {},
  repos = {},
  since = Date.parse('2026-10-17T09:00:00Z'),
} = {}) {
  const people = new Map();
  const all = new Map();
  const calls = [];

  let nextId = 5000;
  let inviteId = 700;
  let reactionId = 90_000;
  let repoId = 300;
  let assetN = 1;
  let clock = since; // what it writes is a second apart from `since`

  const assets = new Map();
  const signed = new Set(); // an attachment by its id: {repo, type, bytes, n}; the signatures given

  const at = () => new Date((clock += 1000)).toISOString();

  const user = login => {
    if (!people.has(login)) {
      people.set(login, {
        login,
        id: people.size + 1,
        type: /\[bot\]$/.test(login) ? 'Bot' : 'User',
        avatar_url: face(login),
      });
    }

    return people.get(login);
  };

  for (const u of users) user(u);

  const orgNames = [...Object.keys(orgs), ...Object.keys(members)];
  const orgName = owner => orgNames.find(o => o.toLowerCase() === owner.toLowerCase());

  const isOrg = owner => !!orgName(owner);

  const orgOut = o => ({
    login: o,
    id: 9000 + orgNames.indexOf(o),
    avatar_url: face(o),
    created_at: new Date(Date.parse('2026-01-01T00:00:00Z') + orgNames.indexOf(o) * 86_400_000).toISOString(),
  });

  function makeRepo(full, { perms = {}, description, rooms = [], private: priv = true } = {}) {
    const [owner, name] = full.split('/');

    const r = {
      id: repoId++,
      owner,
      name,
      full_name: full,
      private: priv,
      description: description ?? 'peixAIrada chat — its rooms are the issues labelled room',
      perms: { ...perms },
      invitations: [],
      issues: [],
      labels: new Set(),
      subs: {},
    };

    if (!isOrg(owner)) r.perms[owner] = 'admin';
    all.set(full.toLowerCase(), r);

    for (const room of rooms) {
      const i = {
        number: r.issues.length + 1,
        title: room.title,
        labels: room.labels || ['room'],
        state: room.state || 'open',
        user: user(room.by || owner),
        comments: [],
      };

      if (i.labels.includes('room')) r.labels.add('room');

      for (const [by, body] of room.comments || []) {
        const t = at();

        i.comments.push({ id: nextId++, user: user(by), body, created_at: t, updated_at: t, reactions: [] });
      }

      r.issues.push(i);
    }

    return r;
  }

  for (const [full, spec] of Object.entries(repos)) makeRepo(full, spec);
  const role = (r, login) => r.perms[login] || (orgs[orgName(r.owner) || '']?.includes(login) ? 'admin' : null);
  const may = (r, login, need) => (ROLE[role(r, login)] || 0) >= ROLE[need];

  const issueOut = (r, i) => ({
    number: i.number,
    title: i.title,
    state: i.state,
    user: i.user,
    labels: i.labels.map(name => ({ name })),
    comments: i.comments.length,
    url: `https://api.github.com/repos/${r.full_name}/issues/${i.number}`,
  });

  const commentOut = (r, i, c) => ({
    id: c.id,
    user: c.user,
    body: c.body,
    created_at: c.created_at,
    updated_at: c.updated_at,
    issue_url: `https://api.github.com/repos/${r.full_name}/issues/${i.number}`,
    html_url: `https://github.com/${r.full_name}/issues/${i.number}#issuecomment-${c.id}`,
    reactions: Object.fromEntries([
      ['total_count', c.reactions.length],
      ...REACTIONS.map(k => [k, c.reactions.filter(x => x.content === k).length]),
    ]),
  });

  const react = (c, login, content) => {
    let x = c.reactions.find(y => y.user.login === login && y.content === content);

    if (x) return [200, x];
    x = { id: reactionId++, user: user(login), content, created_at: at() };
    c.reactions.push(x);
    return [201, x];
  };

  const repoOut = (r, login) => ({
    id: r.id,
    full_name: r.full_name,
    name: r.name,
    private: r.private,
    description: r.description,
    owner: { login: r.owner, type: isOrg(r.owner) ? 'Organization' : 'User' },
    permissions: { admin: may(r, login, 'admin'), push: may(r, login, 'push'), pull: may(r, login, 'pull') },
  });

  const inviteOut = (r, v) => ({
    id: v.id,
    invitee: user(v.login),
    inviter: user(v.by),
    created_at: v.created_at,
    expired: !!v.expired,
    permissions: v.permission === 'pull' ? 'read' : 'write',
    repository: { full_name: r.full_name, description: r.description, private: r.private },
  });

  const comments = r => r.issues.flatMap(i => i.comments.map(c => commentOut(r, i, c)));

  const find = id => {
    for (const r of all.values()) {
      for (const i of r.issues) {
        const c = i.comments.find(x => x.id === id);

        if (c) return { r, i, c };
      }
    }

    return null;
  };

  const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' };

  const addAsset = (r, bytes, type) => {
    const id = randomUUID();

    assets.set(id, { repo: r.full_name, type, bytes: Buffer.from(bytes), n: assetN++ });
    return `https://github.com/user-attachments/assets/${id}`;
  };

  const server = createServer((req, res) => {
    const chunks = [];

    req.on('data', d => {
      chunks.push(d);
    });

    req.on('end', () => {
      const bytes = Buffer.concat(chunks);
      const raw = bytes.toString('utf8');

      const u = new URL(req.url, 'http://x');
      const path = u.pathname;
      const q = u.searchParams;
      const M = req.method;

      const send = (code, body) => {
        let text = body === undefined ? '' : JSON.stringify(body);
        let tag = null;

        if (M === 'GET' && code === 200) {
          tag = `W/"${createHash('sha1').update(text).digest('hex')}"`;

          if (req.headers['if-none-match'] === tag) {
            code = 304;
            text = '';
          }
        }

        calls.push(`${M} ${path}${u.search} ${code}`);
        res.writeHead(code, { 'content-type': 'application/json', ...(tag && { etag: tag }) });
        res.end(text);
      };

      const no = (code, message) => send(code, { message });
      let m;

      if (M === 'GET' && (m = path.match(/^\/pics\/\d+-([0-9a-f-]{36})\.\w+$/))) {
        // a signed address: no token, the signature
        const a = assets.get(m[1]);

        if (!a || !signed.has(q.get('jwt'))) return no(404, 'Not Found');
        calls.push(`${M} ${path} 200`);
        res.writeHead(200, { 'content-type': a.type, 'content-length': a.bytes.length });
        return res.end(a.bytes);
      }

      const token = /^Bearer fake-token-(.+)$/.exec(req.headers.authorization || '');
      const me = token && people.has(token[1]) ? token[1] : null;

      if (!me) return no(401, 'Bad credentials');

      if (M === 'POST' && path === '/user-attachments/assets') {
        // GitHub's attachment endpoint: a writer's picture, its address back
        const r = [...all.values()].find(x => x.id === Number(q.get('repository_id')));

        if (!r || !may(r, me, 'push')) return no(404, 'Not Found');
        if (!EXT[q.get('content_type')] || !bytes.length) return send(422, { message: 'Validation Failed' });
        const url = addAsset(r, bytes, q.get('content_type'));

        return send(201, {
          id: assets.size,
          name: q.get('name'),
          content_type: q.get('content_type'),
          size: bytes.length,
          url,
          href: url,
        });
      }

      let body;

      try {
        body = raw ? JSON.parse(raw) : {};
      } catch {
        return no(400, 'Problems parsing JSON');
      }

      if (M === 'POST' && path === '/markdown') {
        // GitHub's rendering for you: a picture of a repo you read signed, any other as written
        const html = String(body.text || '')
          .split(/\n{2,}/)
          .map(
            par =>
              `<p dir="auto">${par.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt, url) => {
                const a = assets.get(url.split('/').pop());
                const r = a && all.get(a.repo.toLowerCase());

                let src = url;

                if (a && may(r, me, 'pull')) {
                  const jwt = createHash('sha1').update(`${me}:${url}:${Math.random()}`).digest('hex');

                  signed.add(jwt);
                  src = `http://127.0.0.1:${server.address().port}/pics/${a.n}-${url.split('/').pop()}.${EXT[a.type]}?jwt=${jwt}`;
                }

                return `<a target="_blank" rel="noopener noreferrer" href="${src.replace(/&/g, '&amp;')}"><img src="${src.replace(/&/g, '&amp;')}" alt="${alt}" style="max-width: 100%;"></a>`;
              })}</p>`,
          )
          .join('\n');

        calls.push(`${M} ${path} 200`);
        res.writeHead(200, { 'content-type': 'text/html;charset=utf-8' });
        return res.end(html);
      }

      if (M === 'GET' && path === '/user') return send(200, user(me));

      if (M === 'GET' && path === '/emojis') {
        const u = cp => `https://github.githubassets.com/images/icons/emoji/unicode/${cp}.png?v8`;

        return send(200, {
          '+1': u('1f44d'),
          tada: u('1f389'),
          heart: u('2764'),
          rocket: u('1f680'),
          smile: u('1f604'),
          smiley: u('1f603'),
          sweat_smile: u('1f605'),
          fish: u('1f41f'),
          ramen: u('1f35c'),
          hash: u('0023-20e3'),
          rainbow_flag: u('1f3f3-fe0f-200d-1f308'),
          octocat: 'https://github.githubassets.com/images/icons/emoji/octocat.png?v8',
        });
      }

      if (M === 'GET' && (m = path.match(/^\/users\/([^/]+)$/))) {
        return people.has(m[1]) ? send(200, user(m[1])) : no(404, 'Not Found');
      }

      if (M === 'GET' && path === '/user/memberships/orgs') {
        return send(
          200,
          orgNames
            .filter(o => orgs[o]?.includes(me) || members[o]?.includes(me))
            .map(o => ({ organization: orgOut(o), role: orgs[o]?.includes(me) ? 'admin' : 'member', state: 'active' })),
        );
      }

      if (M === 'GET' && (m = path.match(/^\/orgs\/([^/]+)$/))) {
        return isOrg(m[1]) ? send(200, orgOut(orgName(m[1]))) : no(404, 'Not Found');
      }

      if (M === 'GET' && (m = path.match(/^\/orgs\/([^/]+)\/repos$/))) {
        return isOrg(m[1])
          ? send(
              200,
              [...all.values()]
                .filter(r => r.owner.toLowerCase() === m[1].toLowerCase() && may(r, me, 'pull'))
                .map(r => repoOut(r, me)),
            )
          : no(404, 'Not Found');
      }

      if (M === 'GET' && path === '/user/repos') {
        // affiliation: owner, collaborator (let in by name), organization_member
        const aff = (q.get('affiliation') || 'owner,collaborator,organization_member').split(',');
        const inOrg = r => [orgs, members].some(x => x[orgName(r.owner) || '']?.includes(me));

        return send(
          200,
          [...all.values()]
            .filter(
              r =>
                (aff.includes('owner') && r.owner === me) ||
                (aff.includes('collaborator') && r.owner !== me && r.perms[me]) ||
                (aff.includes('organization_member') && inOrg(r)),
            )
            .map(r => repoOut(r, me)),
        );
      }

      if (M === 'GET' && path === '/user/repository_invitations') {
        return send(
          200,
          [...all.values()].flatMap(r => r.invitations.filter(v => v.login === me).map(v => inviteOut(r, v))),
        );
      }

      if (M === 'PATCH' && (m = path.match(/^\/user\/repository_invitations\/(\d+)$/))) {
        for (const r of all.values()) {
          const v = r.invitations.find(x => x.id === Number(m[1]) && x.login === me);

          if (v) {
            r.invitations.splice(r.invitations.indexOf(v), 1);
            r.perms[me] = v.permission;
            return send(204);
          }
        }

        return no(404, 'Not Found');
      }

      if (M === 'POST' && (path === '/user/repos' || (m = path.match(/^\/orgs\/([^/]+)\/repos$/)))) {
        const owner = m ? m[1] : me;

        if (m && !orgs[owner]?.includes(me)) {
          return no(403, 'You need admin access to the organization before adding a repository to it.');
        }

        if (all.has(`${owner}/${body.name}`.toLowerCase())) {
          return send(422, {
            message: 'Repository creation failed.',
            errors: [{ message: 'name already exists on this account' }],
          });
        }

        const r = makeRepo(`${owner}/${body.name}`, {
          description: body.description || '',
          private: body.private !== false,
          perms: m ? {} : {},
        });

        return send(201, repoOut(r, me));
      }

      if (!(m = path.match(/^\/repos\/([^/]+)\/([^/]+)(\/.*)?$/))) return no(404, 'Not Found');

      const r = all.get(`${m[1]}/${m[2]}`.toLowerCase());
      const rest = m[3] || '';

      if (!r || !may(r, me, 'pull')) return no(404, 'Not Found');
      if (M === 'GET' && !rest) return send(200, repoOut(r, me));

      if (M === 'PUT' && rest === '/subscription') {
        r.subs[me] = { subscribed: !!body.subscribed, ignored: !!body.ignored };
        return send(200, { ...r.subs[me], url: `https://api.github.com/repos/${r.full_name}/subscription` });
      }

      if (M === 'GET' && rest === '/collaborators') {
        if (!may(r, me, 'push')) return no(403, 'Must have push access to view repository collaborators.');
        return send(
          200,
          Object.entries(r.perms).map(([login, p]) => ({ ...user(login), role_name: ROLE_NAME[p] })),
        );
      }

      if ((m = rest.match(/^\/collaborators\/([^/]+)$/))) {
        const who = m[1];

        if (M === 'PUT') {
          if (!may(r, me, 'admin')) return no(403, 'Must have admin rights to Repository.');
          if (!people.has(who)) return no(404, 'Not Found');
          if (r.perms[who]) return send(204);

          if (!r.invitations.some(v => v.login === who)) {
            r.invitations.push({
              id: inviteId++,
              login: who,
              by: me,
              created_at: at(),
              permission: isOrg(r.owner) ? body.permission || 'push' : 'push',
            });
          }

          return send(
            201,
            inviteOut(
              r,
              r.invitations.find(v => v.login === who),
            ),
          );
        }

        if (M === 'DELETE') {
          if (who !== me && !may(r, me, 'admin')) return no(403, 'Must have admin rights to Repository.');
          delete r.perms[who];
          return send(204);
        }
      }

      if (M === 'GET' && rest === '/invitations') {
        if (!may(r, me, 'admin')) return no(403, 'Must have admin rights to Repository.');
        return send(
          200,
          r.invitations.map(v => inviteOut(r, v)),
        );
      }

      if (M === 'DELETE' && (m = rest.match(/^\/invitations\/(\d+)$/))) {
        if (!may(r, me, 'admin')) return no(403, 'Must have admin rights to Repository.');
        r.invitations = r.invitations.filter(v => v.id !== Number(m[1]));
        return send(204);
      }

      if (M === 'POST' && rest === '/labels') {
        if (!may(r, me, 'push')) return no(403, 'Must have push access to repository');

        if (r.labels.has(body.name)) {
          return send(422, { message: 'Validation Failed', errors: [{ code: 'already_exists' }] });
        }

        r.labels.add(body.name);
        return send(201, { name: body.name });
      }

      if (M === 'GET' && rest === '/issues') {
        const label = q.get('labels');
        const state = q.get('state') || 'open';

        return send(
          200,
          r.issues
            .filter(i => (state === 'all' || i.state === state) && (!label || i.labels.includes(label)))
            .map(i => issueOut(r, i)),
        );
      }

      if (M === 'POST' && rest === '/issues') {
        const labels = may(r, me, 'push') ? body.labels || [] : []; // a reader's labels are dropped, as GitHub drops them

        const i = {
          number: r.issues.length + 1,
          title: String(body.title || ''),
          labels,
          state: 'open',
          user: user(me),
          comments: [],
        };

        r.issues.push(i);
        return send(201, issueOut(r, i));
      }

      if (M === 'PATCH' && (m = rest.match(/^\/issues\/(\d+)$/))) {
        const i = r.issues.find(x => x.number === Number(m[1]));

        if (!i) return no(404, 'Not Found');
        if (!may(r, me, 'push') && i.user.login !== me) return no(403, 'Must have push access');
        if (body.state) i.state = body.state;
        if (body.title) i.title = body.title;
        return send(200, issueOut(r, i));
      }

      if (M === 'GET' && rest === '/issues/comments') {
        const key = q.get('sort') === 'updated' ? 'updated_at' : 'created_at';
        const down = q.get('direction') === 'desc';
        const per = Math.min(100, Number(q.get('per_page')) || 30);

        const list = comments(r).sort(
          (a, b) => (a[key] === b[key] ? a.id - b.id : a[key] < b[key] ? -1 : 1) * (down ? -1 : 1),
        );

        return send(200, list.slice(0, per));
      }

      if ((m = rest.match(/^\/issues\/(\d+)\/comments$/))) {
        const i = r.issues.find(x => x.number === Number(m[1]));

        if (!i) return no(404, 'Not Found');

        if (M === 'GET') {
          const per = Math.min(100, Number(q.get('per_page')) || 30);
          const page = Math.max(1, Number(q.get('page')) || 1);

          return send(
            200,
            i.comments.slice((page - 1) * per, page * per).map(c => commentOut(r, i, c)),
          );
        }

        if (M === 'POST') {
          const t = at();

          const c = {
            id: nextId++,
            user: user(me),
            body: String(body.body || ''),
            created_at: t,
            updated_at: t,
            reactions: [],
          };

          i.comments.push(c);
          return send(201, commentOut(r, i, c));
        }
      }

      if ((m = rest.match(/^\/issues\/comments\/(\d+)\/reactions(?:\/(\d+))?$/))) {
        // anyone who reads reacts; a reaction is taken back by its own
        const f = find(Number(m[1]));

        if (!f || f.r !== r) return no(404, 'Not Found');

        if (M === 'GET' && !m[2]) {
          return send(200, f.c.reactions.slice(0, Math.min(100, Number(q.get('per_page')) || 30)));
        }

        if (M === 'POST' && !m[2]) {
          if (!REACTIONS.includes(body.content)) return send(422, { message: 'Validation Failed' });
          return send(...react(f.c, me, body.content));
        }

        if (M === 'DELETE' && m[2]) {
          const x = f.c.reactions.find(y => y.id === Number(m[2]));

          if (!x) return no(404, 'Not Found');
          if (x.user.login !== me) return no(403, 'Must own the reaction');
          f.c.reactions.splice(f.c.reactions.indexOf(x), 1);
          return send(204);
        }
      }

      if (M === 'PATCH' && (m = rest.match(/^\/issues\/comments\/(\d+)$/))) {
        const f = find(Number(m[1]));

        if (!f || f.r !== r) return no(404, 'Not Found');
        if (f.c.user.login !== me && !may(r, me, 'push')) return no(403, 'Must have push access');
        f.c.body = String(body.body || '');
        f.c.updated_at = at();
        return send(200, commentOut(r, f.i, f.c));
      }

      if (M === 'DELETE' && (m = rest.match(/^\/issues\/comments\/(\d+)$/))) {
        const f = find(Number(m[1]));

        if (!f || f.r !== r) return no(404, 'Not Found');
        if (f.c.user.login !== me && !may(r, me, 'push')) return no(403, 'Must have push access');
        f.i.comments.splice(f.i.comments.indexOf(f.c), 1);
        return send(204);
      }

      no(404, `no such call: ${M} ${path}`);
    });
  });

  await new Promise(ok => server.listen(0, '127.0.0.1', ok));
  const repo = full => all.get(full.toLowerCase());

  return {
    url: `http://127.0.0.1:${server.address().port}`,
    calls,
    repo,
    assets,
    /** A picture dropped on GitHub's page of `full`'s issue: its attachment's address. */
    asset(full, bytes, type = 'image/png') {
      return addAsset(repo(full), bytes, type);
    },
    /** A message another board sent: its id. */
    say(full, n, login, body) {
      const t = at();
      const c = { id: nextId++, user: user(login), body, created_at: t, updated_at: t, reactions: [] };

      repo(full)
        .issues.find(i => i.number === n)
        .comments.push(c);

      return c.id;
    },
    edit(id, body) {
      const f = find(id);

      f.c.body = body;
      f.c.updated_at = at();
    },
    drop(id) {
      const f = find(id);

      f.i.comments.splice(f.i.comments.indexOf(f.c), 1);
    },
    react(id, login, content) {
      return react(find(id).c, login, content)[1].id;
    },
    unreact(id, login, content) {
      const c = find(id).c;

      c.reactions = c.reactions.filter(x => !(x.user.login === login && x.content === content));
    },
    invite(full, login, by) {
      const r = repo(full);

      user(login);
      r.invitations.push({ id: inviteId++, login, by, created_at: at(), permission: isOrg(r.owner) ? 'pull' : 'push' });
    },
    user,
    close: () =>
      new Promise(ok => {
        server.closeAllConnections?.();
        server.close(ok);
      }),
  };
}
