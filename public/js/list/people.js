// ---- the people row: everyone in the PRs of the chats in view ---------------------------------------------------
// (2026-09-29). The chats in view — the project's, in the states the
// chips show — give their PRs' people (the server's prPeople: author, reviewers, commenters, pushers; you and bots
// out), merged by login, the newest interaction first. A click is prefs.person: the list, its counts and its
// timeline narrow to the chats whose PRs have that person; the same face again, or the person leaving the view,
// lets go. The query and the chips still apply on top.
function peopleOf(chats) {
  const by = new Map();
  for (const s of chats)
    for (const pr of s.prs || [])
      for (const p of pr.people || []) {
        const had = by.get(p.login) || { login: p.login, avatar: p.avatar, at: '', did: new Set(), chats: new Set() };
        had.avatar ||= p.avatar;
        if (String(p.at) > had.at) had.at = String(p.at);
        for (const d of p.did) had.did.add(d);
        had.chats.add(s.id);
        by.set(p.login, had);
      }
  return [...by.values()].sort((a, b) => b.at.localeCompare(a.at));
}
const hasPerson = (s, login) => (s.prs || []).some(pr => (pr.people || []).some(x => x.login === login));
let peopleDrawn = '';
function renderPeople(chats) {
  const box = $('#people'),
    people = peopleOf(chats);
  // Let go only when GitHub has answered for every PR in view (2026-10-03): after a server restart no PR has its faces
  // until gh answers, and the person you had narrowed to was cleared — and saved cleared — on the first snapshot.
  const known = chats.every(s => (s.prs || []).every(pr => pr.people != null));
  if (prefs.person && known && !people.some(x => x.login === prefs.person)) {
    prefs.person = null;
    savePrefs();
  }
  // Folded by default (2026-10-11, later; off by default, and a count beside the mark, from 2026-10-09 — "so many faces
  // is a bit distracting"): GitHub's mark alone, which unfolds them; the person
  // the list is narrowed to keeps their face, so the filter stays in sight. The fold is the box's class, and the
  // mark's words are set after the draw, so a fold keeps the nodes and the faces fade away rather than vanish.
  const compact = prefs.peopleCompact !== false;
  const head = `<button type="button" class="pgh">${ICON.github}</button>`;
  const html = !people.length
    ? ''
    : head +
      people
        .map(x => {
          const on = x.login === prefs.person;
          return `<button type="button" data-login="${esc(x.login)}"${on ? ' class="on"' : ''} title="${esc(`${x.login} — ${[...x.did].join(', ')} · in ${x.chats.size} chat${x.chats.size === 1 ? '' : 's'} — click to ${on ? 'show every chat again' : 'show only those'}`)}">${faceHtml(x)}</button>`;
        })
        .join('');
  if (html !== peopleDrawn) {
    box.innerHTML = peopleDrawn = html;
    box.hidden = !html;
  } // drawn only when it changed: the faces are images
  box.classList.toggle('compact', compact);
  const mark = box.querySelector('.pgh');
  if (mark) {
    mark.setAttribute('aria-expanded', String(!compact));
    mark.title = `${people.length} ${people.length === 1 ? 'person' : 'people'} on the PRs of the chats in view — click to ${compact ? 'show' : 'fold'} their faces`;
  }
  const here = !!prefs.person && people.some(x => x.login === prefs.person);
  box.classList.toggle('on', here);
  return here; // narrowed to them only while they are in view: until the faces come back, every chat shows
}
$('#people').addEventListener('click', e => {
  if (e.target.closest('.pgh')) {
    prefs.peopleCompact = prefs.peopleCompact === false;
    savePrefs();
    renderBoard();
    return;
  }
  const b = e.target.closest('button[data-login]');
  if (!b) return;
  prefs.person = prefs.person === b.dataset.login ? null : b.dataset.login;
  savePrefs();
  renderBoard();
  if (prefs.person) showList();
});
