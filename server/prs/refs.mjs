// The short ways of naming a PR (2026-10-06) — #12, widgets#12, acme/widgets#12 —, whose repo each is, and
// when one shows on its chat.
import { foldersIn } from '../folders.mjs';
import { prKey } from './mentions.mjs';
import { prStatus } from './status.mjs';
import { ghRepoOf } from '../repos.mjs';
import { boardConfig } from '../setup.mjs';
import { schedulePush } from '../sse.mjs';
import { sessions } from '../state.mjs';

// ---- …and the short ways of naming one (2026-10-06) ----------------------------------------------------------------
// `#12` is the chat's own repo's PR; `widgets#12` the setup's org's — the root's holding a checkout of that name, else
// the root's the chat's folder is under, else the one root's with an org — or the chat's own repo, by its name;
// `acme/widgets#12` as written. So is `widgets #12`, Claude's own way of writing it, when `widgets` is the chat's repo
// or a checkout under a root; and a list after any of them (`widgets #12, #14 and #15`) is that repo's too. A short
// reference is no PR until GitHub says so: it stays off the chat (`shownPr`) until the call that asks for its state
// finds a PR there, and is let go when GitHub has none (`forgetRef`: an issue's number, a repo that is not there). A
// bare `#12` names something current as well: one that comes to a PR merged or closed long before it was said is a
// review's numbered point, not the chat's PR — its own repo's #3 is years old (REF_AGE_MS) —, and no short reference
// to such a PR titles the card (`pastRef`). A young repo's #1 is neither, so a `#1` after a word that counts — a note, a
// step, an option, a point… (`COUNTED`, 2026-10-27: "deploy note #1" was a repo's first PR) — is none, nor the list
// after it. Code is not prose — GitHub links no `#12` in it, and `#333` is a colour
// there — and neither is a link's text, whose URL says which PR.
const REF_RE = /(?:(?<![\w/.&#-])(?:([A-Za-z0-9][\w-]*)\/)?([A-Za-z0-9][\w.-]*)|(?<![\w&#]))#([1-9]\d{0,5})(?![\w-])/g;
const NOT_PROSE = /```[\s\S]*?(?:```|$)|`[^`\n]*`|\[[^\]\n]*\]\([^)\s]*\)|https?:\/\/\S+/g;
const NOT_REPO = /^(?:prs?|pulls?|issues?)$/i; // `PR#12` is the chat's own #12
const NAME_BEFORE = /([A-Za-z0-9][\w.-]*)[*_]*[ \t]+(?:PRs?[ \t]+)?$/i; // `widgets #12`, `**widgets** PR #12`
const LIST_GAP = /^(?:[ \t*_,/&]|\band\b|\bor\b)*$/; // `#12, #14 and #15`, `#12/#14` — on one line
const COUNTED =
  /\b(?:note|steps?|options?|points?|items?|phases?|parts?|rounds?|rules?|findings?|questions?|cases?|stages?|tiers?|levels?|tasks?|priority)[*_]*[ \t]+$/i;
const REF_AGE_MS = 90 * 24 * 60 * 60_000;
export const noPr = new Set(); // where GitHub had no PR: not taken up again from a short reference until a restart
const sameName = (a, b) => a.toLowerCase() === b.toLowerCase();

/** The org a repo named alone is under, from a chat in `cwd`: the root's the folder is in, else the one root's with an org. */
function orgFor(cwd) {
  const roots = boardConfig().roots.filter(r => r.org);
  return (
    (roots.find(r => cwd && (cwd === r.dir || cwd.startsWith(r.dir + '/'))) || (roots.length === 1 ? roots[0] : null))
      ?.org || null
  );
}
/** A checkout under a root by its name, any case: `{name, org}`, the name as the folder spells it. */
const rootNames = new WeakMap(); // foldersIn's list (kept while the root's mtime is) -> its checkouts by lower-case name
function checkoutNamed(name) {
  for (const r of boardConfig().roots) {
    const list = foldersIn(r.dir);
    let by = rootNames.get(list);
    if (!by) rootNames.set(list, (by = new Map(list.filter(f => f.git).map(f => [f.name.toLowerCase(), f.name]))));
    const hit = by.get(name.toLowerCase());
    if (hit) return { name: hit, org: r.org };
  }
  return null;
}

/** Every short reference in one message, each as the PR it comes to from this chat and where it stands in the text. */
export function refsIn(s, text) {
  // what is not prose blanked out, every character where it was: a newline breaks a list and parts a name from its #
  const prose = text.replace(NOT_PROSE, c =>
    c[0] !== '`' || c[1] === '`' ? '\n'.repeat(c.length) : ` ${c.slice(1, -1).replace(/#/g, ' ')} `,
  );
  const cwd = s.live?.cwd || s.cwd,
    own = ghRepoOf(cwd),
    out = [];
  const repoOf = (owner, name) => {
    if (owner) return { owner, name };
    if (!name || (own && sameName(own.name, name))) return own;
    const c = checkoutNamed(name),
      org = c?.org || orgFor(cwd) || own?.owner;
    return org ? { owner: org, name: c?.name || name } : null;
  };
  let prev = null; // the reference before, and where it ended
  for (const m of prose.matchAll(REF_RE)) {
    let [, owner, name] = m,
      kind = 'repo';
    if (!owner && name && NOT_REPO.test(name)) name = undefined;
    if (!name) {
      const w = NAME_BEFORE.exec(prose.slice(Math.max(0, m.index - 80), m.index))?.[1];
      if (w && ((own && sameName(own.name, w)) || checkoutNamed(w))) name = w;
      else if (prev && LIST_GAP.test(prose.slice(prev.end, m.index))) ({ owner, name, kind } = prev);
      else kind = COUNTED.test(prose.slice(Math.max(0, m.index - 24), m.index)) ? 'counted' : 'bare';
    }
    prev = { owner, name, kind, end: m.index + m[0].length };
    if (kind === 'counted') continue;
    const r = repoOf(owner, name);
    if (r)
      out.push({
        at: m.index,
        url: `https://github.com/${r.owner}/${r.name}/pull/${m[3]}`,
        key: prKey(r.owner, r.name, m[3]),
        ref: kind,
      });
  }
  return out;
}

/** A short reference to a PR merged or closed, and opened over REF_AGE_MS before it was said: a reference to the past,
 *  never the chat's own work — a bare one is not shown, and none titles the card. */
function pastRef(p) {
  if (!p.ref || p.state === 'open' || p.state === 'draft') return false;
  const made = Date.parse(prStatus.get(p.url)?.created);
  return !!made && made < (Date.parse(p.firstAt) || Date.now()) - REF_AGE_MS;
}
/** Whether the chat shows a PR: one said in full always; a short reference once GitHub has found a PR there. */
export const shownPr = p => !p.ref || (!!p.state && (p.ref === 'repo' || !pastRef(p)));

/** GitHub has no PR there: every chat that had it only from a short reference lets it go, and none takes it up again. */
export function forgetRef(url) {
  noPr.add(url);
  for (const s of sessions.values()) {
    const at = s.prs.findIndex(p => p.url === url && p.ref);
    if (at >= 0) {
      s.prs.splice(at, 1);
      schedulePush(s);
    }
  }
}

/**
 * Which PR names the chat (2026-10-27): its own — the first it opened or pushed to (a pr-link line, Claude Code's
 * record of the session's PR), else the first you named — through its merge and after. A PR Claude only mentioned names
 * nothing, and the AI's title stands: the oldest PR still open did, so a chat whose PR merged took the title of any open
 * one it had brought up, and one that listed your open PRs the title of whichever came first. Titles arrive from `gh`
 * with the state, so this is null until that lands — for that PR, not the next.
 */
export function prTitle(s) {
  const first = k =>
    s.prs.reduce((a, p) => (p[k] != null && shownPr(p) && !pastRef(p) && !(a?.[k] < p[k]) ? p : a), null);
  return (first('linked') || first('named'))?.title ?? null;
}
