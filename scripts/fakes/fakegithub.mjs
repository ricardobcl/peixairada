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
  `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" fill="hsl(${[...login].reduce((hash, char) => hash + char.charCodeAt(0) * 37, 0) % 360} 55% 55%)"/><text x="8" y="12" font-size="10" text-anchor="middle" fill="#fff" font-family="sans-serif">${login[0].toUpperCase()}</text></svg>`)}`;

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

  for (const login of users) user(login);

  const orgNames = [...Object.keys(orgs), ...Object.keys(members)];
  const orgName = owner => orgNames.find(org => org.toLowerCase() === owner.toLowerCase());

  const isOrg = owner => !!orgName(owner);

  const orgOut = org => ({
    login: org,
    id: 9000 + orgNames.indexOf(org),
    avatar_url: face(org),
    created_at: new Date(Date.parse('2026-01-01T00:00:00Z') + orgNames.indexOf(org) * 86_400_000).toISOString(),
  });

  function makeRepo(full, { perms = {}, description, rooms = [], private: priv = true } = {}) {
    const [owner, name] = full.split('/');

    const repository = {
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

    if (!isOrg(owner)) repository.perms[owner] = 'admin';
    all.set(full.toLowerCase(), repository);

    for (const room of rooms) {
      const issue = {
        number: repository.issues.length + 1,
        title: room.title,
        labels: room.labels || ['room'],
        state: room.state || 'open',
        user: user(room.by || owner),
        comments: [],
      };

      if (issue.labels.includes('room')) repository.labels.add('room');

      for (const [by, body] of room.comments || []) {
        const time = at();

        issue.comments.push({ id: nextId++, user: user(by), body, created_at: time, updated_at: time, reactions: [] });
      }

      repository.issues.push(issue);
    }

    return repository;
  }

  for (const [full, spec] of Object.entries(repos)) makeRepo(full, spec);

  const role = (repository, login) =>
    repository.perms[login] || (orgs[orgName(repository.owner) || '']?.includes(login) ? 'admin' : null);

  const may = (repository, login, need) => (ROLE[role(repository, login)] || 0) >= ROLE[need];

  const issueOut = (repository, issue) => ({
    number: issue.number,
    title: issue.title,
    state: issue.state,
    user: issue.user,
    labels: issue.labels.map(name => ({ name })),
    comments: issue.comments.length,
    url: `https://api.github.com/repos/${repository.full_name}/issues/${issue.number}`,
  });

  const commentOut = (repository, issue, comment) => ({
    id: comment.id,
    user: comment.user,
    body: comment.body,
    created_at: comment.created_at,
    updated_at: comment.updated_at,
    issue_url: `https://api.github.com/repos/${repository.full_name}/issues/${issue.number}`,
    html_url: `https://github.com/${repository.full_name}/issues/${issue.number}#issuecomment-${comment.id}`,
    reactions: Object.fromEntries([
      ['total_count', comment.reactions.length],
      ...REACTIONS.map(content => [content, comment.reactions.filter(reaction => reaction.content === content).length]),
    ]),
  });

  const react = (comment, login, content) => {
    let reaction = comment.reactions.find(candidate => candidate.user.login === login && candidate.content === content);

    if (reaction) return [200, reaction];
    reaction = { id: reactionId++, user: user(login), content, created_at: at() };
    comment.reactions.push(reaction);
    return [201, reaction];
  };

  const repoOut = (repository, login) => ({
    id: repository.id,
    full_name: repository.full_name,
    name: repository.name,
    private: repository.private,
    description: repository.description,
    owner: { login: repository.owner, type: isOrg(repository.owner) ? 'Organization' : 'User' },
    permissions: {
      admin: may(repository, login, 'admin'),
      push: may(repository, login, 'push'),
      pull: may(repository, login, 'pull'),
    },
  });

  const inviteOut = (repository, invitation) => ({
    id: invitation.id,
    invitee: user(invitation.login),
    inviter: user(invitation.by),
    created_at: invitation.created_at,
    expired: !!invitation.expired,
    permissions: invitation.permission === 'pull' ? 'read' : 'write',
    repository: { full_name: repository.full_name, description: repository.description, private: repository.private },
  });

  const comments = repository =>
    repository.issues.flatMap(issue => issue.comments.map(comment => commentOut(repository, issue, comment)));

  const find = id => {
    for (const repository of all.values()) {
      for (const issue of repository.issues) {
        const comment = issue.comments.find(candidate => candidate.id === id);

        if (comment) return { r: repository, i: issue, c: comment };
      }
    }

    return null;
  };

  const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' };

  const addAsset = (repository, bytes, type) => {
    const id = randomUUID();

    assets.set(id, { repo: repository.full_name, type, bytes: Buffer.from(bytes), n: assetN++ });
    return `https://github.com/user-attachments/assets/${id}`;
  };

  const server = createServer((req, res) => {
    const chunks = [];

    req.on('data', chunk => {
      chunks.push(chunk);
    });

    req.on('end', () => {
      const bytes = Buffer.concat(chunks);
      const raw = bytes.toString('utf8');

      const requestUrl = new URL(req.url, 'http://x');
      const path = requestUrl.pathname;
      const query = requestUrl.searchParams;
      const method = req.method;

      const send = (code, body) => {
        let text = body === undefined ? '' : JSON.stringify(body);
        let tag = null;

        if (method === 'GET' && code === 200) {
          tag = `W/"${createHash('sha1').update(text).digest('hex')}"`;

          if (req.headers['if-none-match'] === tag) {
            code = 304;
            text = '';
          }
        }

        calls.push(`${method} ${path}${requestUrl.search} ${code}`);
        res.writeHead(code, { 'content-type': 'application/json', ...(tag && { etag: tag }) });
        res.end(text);
      };

      const no = (code, message) => send(code, { message });
      let match;

      if (method === 'GET' && (match = path.match(/^\/pics\/\d+-([0-9a-f-]{36})\.\w+$/))) {
        // a signed address: no token, the signature
        const asset = assets.get(match[1]);

        if (!asset || !signed.has(query.get('jwt'))) return no(404, 'Not Found');
        calls.push(`${method} ${path} 200`);
        res.writeHead(200, { 'content-type': asset.type, 'content-length': asset.bytes.length });
        return res.end(asset.bytes);
      }

      const token = /^Bearer fake-token-(.+)$/.exec(req.headers.authorization || '');
      const me = token && people.has(token[1]) ? token[1] : null;

      if (!me) return no(401, 'Bad credentials');

      if (method === 'POST' && path === '/user-attachments/assets') {
        // GitHub's attachment endpoint: a writer's picture, its address back
        const target = [...all.values()].find(candidate => candidate.id === Number(query.get('repository_id')));

        if (!target || !may(target, me, 'push')) return no(404, 'Not Found');
        if (!EXT[query.get('content_type')] || !bytes.length) return send(422, { message: 'Validation Failed' });
        const url = addAsset(target, bytes, query.get('content_type'));

        return send(201, {
          id: assets.size,
          name: query.get('name'),
          content_type: query.get('content_type'),
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

      if (method === 'POST' && path === '/markdown') {
        // GitHub's rendering for you: a picture of a repo you read signed, any other as written
        const html = String(body.text || '')
          .split(/\n{2,}/)
          .map(
            par =>
              `<p dir="auto">${par.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt, url) => {
                const asset = assets.get(url.split('/').pop());
                const assetRepo = asset && all.get(asset.repo.toLowerCase());

                let src = url;

                if (asset && may(assetRepo, me, 'pull')) {
                  const jwt = createHash('sha1').update(`${me}:${url}:${Math.random()}`).digest('hex');

                  signed.add(jwt);
                  src = `http://127.0.0.1:${server.address().port}/pics/${asset.n}-${url.split('/').pop()}.${EXT[asset.type]}?jwt=${jwt}`;
                }

                return `<a target="_blank" rel="noopener noreferrer" href="${src.replace(/&/g, '&amp;')}"><img src="${src.replace(/&/g, '&amp;')}" alt="${alt}" style="max-width: 100%;"></a>`;
              })}</p>`,
          )
          .join('\n');

        calls.push(`${method} ${path} 200`);
        res.writeHead(200, { 'content-type': 'text/html;charset=utf-8' });
        return res.end(html);
      }

      if (method === 'GET' && path === '/user') return send(200, user(me));

      if (method === 'GET' && path === '/emojis') {
        const emojiUrl = cp => `https://github.githubassets.com/images/icons/emoji/unicode/${cp}.png?v8`;

        return send(200, {
          '+1': emojiUrl('1f44d'),
          tada: emojiUrl('1f389'),
          heart: emojiUrl('2764'),
          rocket: emojiUrl('1f680'),
          smile: emojiUrl('1f604'),
          smiley: emojiUrl('1f603'),
          sweat_smile: emojiUrl('1f605'),
          fish: emojiUrl('1f41f'),
          ramen: emojiUrl('1f35c'),
          hash: emojiUrl('0023-20e3'),
          rainbow_flag: emojiUrl('1f3f3-fe0f-200d-1f308'),
          octocat: 'https://github.githubassets.com/images/icons/emoji/octocat.png?v8',
        });
      }

      if (method === 'GET' && (match = path.match(/^\/users\/([^/]+)$/))) {
        return people.has(match[1]) ? send(200, user(match[1])) : no(404, 'Not Found');
      }

      if (method === 'GET' && path === '/user/memberships/orgs') {
        return send(
          200,
          orgNames
            .filter(org => orgs[org]?.includes(me) || members[org]?.includes(me))
            .map(org => ({
              organization: orgOut(org),
              role: orgs[org]?.includes(me) ? 'admin' : 'member',
              state: 'active',
            })),
        );
      }

      if (method === 'GET' && (match = path.match(/^\/orgs\/([^/]+)$/))) {
        return isOrg(match[1]) ? send(200, orgOut(orgName(match[1]))) : no(404, 'Not Found');
      }

      if (method === 'GET' && (match = path.match(/^\/orgs\/([^/]+)\/repos$/))) {
        return isOrg(match[1])
          ? send(
              200,
              [...all.values()]
                .filter(
                  candidate => candidate.owner.toLowerCase() === match[1].toLowerCase() && may(candidate, me, 'pull'),
                )
                .map(found => repoOut(found, me)),
            )
          : no(404, 'Not Found');
      }

      if (method === 'GET' && path === '/user/repos') {
        // affiliation: owner, collaborator (let in by name), organization_member
        const aff = (query.get('affiliation') || 'owner,collaborator,organization_member').split(',');
        const inOrg = candidate => [orgs, members].some(roster => roster[orgName(candidate.owner) || '']?.includes(me));

        return send(
          200,
          [...all.values()]
            .filter(
              candidate =>
                (aff.includes('owner') && candidate.owner === me) ||
                (aff.includes('collaborator') && candidate.owner !== me && candidate.perms[me]) ||
                (aff.includes('organization_member') && inOrg(candidate)),
            )
            .map(found => repoOut(found, me)),
        );
      }

      if (method === 'GET' && path === '/user/repository_invitations') {
        return send(
          200,
          [...all.values()].flatMap(candidate =>
            candidate.invitations
              .filter(invitation => invitation.login === me)
              .map(invitation => inviteOut(candidate, invitation)),
          ),
        );
      }

      if (method === 'PATCH' && (match = path.match(/^\/user\/repository_invitations\/(\d+)$/))) {
        for (const candidate of all.values()) {
          const invitation = candidate.invitations.find(entry => entry.id === Number(match[1]) && entry.login === me);

          if (invitation) {
            candidate.invitations.splice(candidate.invitations.indexOf(invitation), 1);
            candidate.perms[me] = invitation.permission;
            return send(204);
          }
        }

        return no(404, 'Not Found');
      }

      if (method === 'POST' && (path === '/user/repos' || (match = path.match(/^\/orgs\/([^/]+)\/repos$/)))) {
        const owner = match ? match[1] : me;

        if (match && !orgs[owner]?.includes(me)) {
          return no(403, 'You need admin access to the organization before adding a repository to it.');
        }

        if (all.has(`${owner}/${body.name}`.toLowerCase())) {
          return send(422, {
            message: 'Repository creation failed.',
            errors: [{ message: 'name already exists on this account' }],
          });
        }

        const made = makeRepo(`${owner}/${body.name}`, {
          description: body.description || '',
          private: body.private !== false,
          perms: match ? {} : {},
        });

        return send(201, repoOut(made, me));
      }

      if (!(match = path.match(/^\/repos\/([^/]+)\/([^/]+)(\/.*)?$/))) return no(404, 'Not Found');

      const repository = all.get(`${match[1]}/${match[2]}`.toLowerCase());
      const rest = match[3] || '';

      if (!repository || !may(repository, me, 'pull')) return no(404, 'Not Found');
      if (method === 'GET' && !rest) return send(200, repoOut(repository, me));

      if (method === 'PUT' && rest === '/subscription') {
        repository.subs[me] = { subscribed: !!body.subscribed, ignored: !!body.ignored };
        return send(200, {
          ...repository.subs[me],
          url: `https://api.github.com/repos/${repository.full_name}/subscription`,
        });
      }

      if (method === 'GET' && rest === '/collaborators') {
        if (!may(repository, me, 'push')) return no(403, 'Must have push access to view repository collaborators.');
        return send(
          200,
          Object.entries(repository.perms).map(([login, permission]) => ({
            ...user(login),
            role_name: ROLE_NAME[permission],
          })),
        );
      }

      if ((match = rest.match(/^\/collaborators\/([^/]+)$/))) {
        const who = match[1];

        if (method === 'PUT') {
          if (!may(repository, me, 'admin')) return no(403, 'Must have admin rights to Repository.');
          if (!people.has(who)) return no(404, 'Not Found');
          if (repository.perms[who]) return send(204);

          if (!repository.invitations.some(invitation => invitation.login === who)) {
            repository.invitations.push({
              id: inviteId++,
              login: who,
              by: me,
              created_at: at(),
              permission: isOrg(repository.owner) ? body.permission || 'push' : 'push',
            });
          }

          return send(
            201,
            inviteOut(
              repository,
              repository.invitations.find(invitation => invitation.login === who),
            ),
          );
        }

        if (method === 'DELETE') {
          if (who !== me && !may(repository, me, 'admin')) return no(403, 'Must have admin rights to Repository.');
          delete repository.perms[who];
          return send(204);
        }
      }

      if (method === 'GET' && rest === '/invitations') {
        if (!may(repository, me, 'admin')) return no(403, 'Must have admin rights to Repository.');
        return send(
          200,
          repository.invitations.map(invitation => inviteOut(repository, invitation)),
        );
      }

      if (method === 'DELETE' && (match = rest.match(/^\/invitations\/(\d+)$/))) {
        if (!may(repository, me, 'admin')) return no(403, 'Must have admin rights to Repository.');
        repository.invitations = repository.invitations.filter(invitation => invitation.id !== Number(match[1]));
        return send(204);
      }

      if (method === 'POST' && rest === '/labels') {
        if (!may(repository, me, 'push')) return no(403, 'Must have push access to repository');

        if (repository.labels.has(body.name)) {
          return send(422, { message: 'Validation Failed', errors: [{ code: 'already_exists' }] });
        }

        repository.labels.add(body.name);
        return send(201, { name: body.name });
      }

      if (method === 'GET' && rest === '/issues') {
        const label = query.get('labels');
        const state = query.get('state') || 'open';

        return send(
          200,
          repository.issues
            .filter(issue => (state === 'all' || issue.state === state) && (!label || issue.labels.includes(label)))
            .map(issue => issueOut(repository, issue)),
        );
      }

      if (method === 'POST' && rest === '/issues') {
        const labels = may(repository, me, 'push') ? body.labels || [] : []; // a reader's labels are dropped, as GitHub drops them

        const issue = {
          number: repository.issues.length + 1,
          title: String(body.title || ''),
          labels,
          state: 'open',
          user: user(me),
          comments: [],
        };

        repository.issues.push(issue);
        return send(201, issueOut(repository, issue));
      }

      if (method === 'PATCH' && (match = rest.match(/^\/issues\/(\d+)$/))) {
        const issue = repository.issues.find(candidate => candidate.number === Number(match[1]));

        if (!issue) return no(404, 'Not Found');
        if (!may(repository, me, 'push') && issue.user.login !== me) return no(403, 'Must have push access');
        if (body.state) issue.state = body.state;
        if (body.title) issue.title = body.title;
        return send(200, issueOut(repository, issue));
      }

      if (method === 'GET' && rest === '/issues/comments') {
        const key = query.get('sort') === 'updated' ? 'updated_at' : 'created_at';
        const down = query.get('direction') === 'desc';
        const per = Math.min(100, Number(query.get('per_page')) || 30);

        const list = comments(repository).sort(
          (left, right) =>
            (left[key] === right[key] ? left.id - right.id : left[key] < right[key] ? -1 : 1) * (down ? -1 : 1),
        );

        return send(200, list.slice(0, per));
      }

      if ((match = rest.match(/^\/issues\/(\d+)\/comments$/))) {
        const issue = repository.issues.find(candidate => candidate.number === Number(match[1]));

        if (!issue) return no(404, 'Not Found');

        if (method === 'GET') {
          const per = Math.min(100, Number(query.get('per_page')) || 30);
          const page = Math.max(1, Number(query.get('page')) || 1);

          return send(
            200,
            issue.comments.slice((page - 1) * per, page * per).map(comment => commentOut(repository, issue, comment)),
          );
        }

        if (method === 'POST') {
          const time = at();

          const comment = {
            id: nextId++,
            user: user(me),
            body: String(body.body || ''),
            created_at: time,
            updated_at: time,
            reactions: [],
          };

          issue.comments.push(comment);
          return send(201, commentOut(repository, issue, comment));
        }
      }

      if ((match = rest.match(/^\/issues\/comments\/(\d+)\/reactions(?:\/(\d+))?$/))) {
        // anyone who reads reacts; a reaction is taken back by its own
        const found = find(Number(match[1]));

        if (!found || found.r !== repository) return no(404, 'Not Found');

        if (method === 'GET' && !match[2]) {
          return send(200, found.c.reactions.slice(0, Math.min(100, Number(query.get('per_page')) || 30)));
        }

        if (method === 'POST' && !match[2]) {
          if (!REACTIONS.includes(body.content)) return send(422, { message: 'Validation Failed' });
          return send(...react(found.c, me, body.content));
        }

        if (method === 'DELETE' && match[2]) {
          const reaction = found.c.reactions.find(candidate => candidate.id === Number(match[2]));

          if (!reaction) return no(404, 'Not Found');
          if (reaction.user.login !== me) return no(403, 'Must own the reaction');
          found.c.reactions.splice(found.c.reactions.indexOf(reaction), 1);
          return send(204);
        }
      }

      if (method === 'PATCH' && (match = rest.match(/^\/issues\/comments\/(\d+)$/))) {
        const found = find(Number(match[1]));

        if (!found || found.r !== repository) return no(404, 'Not Found');
        if (found.c.user.login !== me && !may(repository, me, 'push')) return no(403, 'Must have push access');
        found.c.body = String(body.body || '');
        found.c.updated_at = at();
        return send(200, commentOut(repository, found.i, found.c));
      }

      if (method === 'DELETE' && (match = rest.match(/^\/issues\/comments\/(\d+)$/))) {
        const found = find(Number(match[1]));

        if (!found || found.r !== repository) return no(404, 'Not Found');
        if (found.c.user.login !== me && !may(repository, me, 'push')) return no(403, 'Must have push access');
        found.i.comments.splice(found.i.comments.indexOf(found.c), 1);
        return send(204);
      }

      no(404, `no such call: ${method} ${path}`);
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
    say(full, issueNumber, login, body) {
      const time = at();
      const comment = { id: nextId++, user: user(login), body, created_at: time, updated_at: time, reactions: [] };

      repo(full)
        .issues.find(issue => issue.number === issueNumber)
        .comments.push(comment);

      return comment.id;
    },
    edit(id, body) {
      const found = find(id);

      found.c.body = body;
      found.c.updated_at = at();
    },
    drop(id) {
      const found = find(id);

      found.i.comments.splice(found.i.comments.indexOf(found.c), 1);
    },
    react(id, login, content) {
      return react(find(id).c, login, content)[1].id;
    },
    unreact(id, login, content) {
      const comment = find(id).c;

      comment.reactions = comment.reactions.filter(
        reaction => !(reaction.user.login === login && reaction.content === content),
      );
    },
    invite(full, login, by) {
      const repository = repo(full);

      user(login);

      repository.invitations.push({
        id: inviteId++,
        login,
        by,
        created_at: at(),
        permission: isOrg(repository.owner) ? 'pull' : 'push',
      });
    },
    user,
    close: () =>
      new Promise(ok => {
        server.closeAllConnections?.();
        server.close(ok);
      }),
  };
}
