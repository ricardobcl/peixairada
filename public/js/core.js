const $ = s => document.querySelector(s);
// A script animation is let go of once it is done (2026-10-15). WebKit keeps every animation `animate()` made after it
// ends on the document timeline, which walks the finished ones on every frame (removeReplacedAnimations, the
// timeline's tick), and keeps any animation with a timeline alive, cancelled or not, its element with it, out of the
// page or not: a board open for hours spent its frames and its memory on thousands of them, and a reload made it cheap
// again. So each is cancelled once done and taken off its timeline: one that fills nothing, one cancelled by its own
// code, one that fills forwards once its element has left the page (a bubble, a folding card, a line that fell away:
// each removed at its end) or a later one replaced it; seconds after, so its own handlers ran.
const animate0 = Element.prototype.animate,
  ended = new Set();
let endTimer = 0;
function letGoEnded() {
  endTimer = 0;
  for (const a of ended) {
    const fills =
      /forwards|both/.test(a.effect?.getTiming().fill) && a.effect.target?.isConnected && a.replaceState !== 'removed';
    if (a.playState === 'idle' || (a.playState === 'finished' && !fills)) {
      ended.delete(a);
      a.cancel();
      a.timeline = null;
    } else if (a.playState !== 'finished') ended.delete(a); // played again
  }
  if (ended.size) endTimer = setTimeout(letGoEnded, 5000); // one holding its last frame in the page: looked at again
}
const endSoon = a => {
  ended.add(a);
  endTimer ||= setTimeout(letGoEnded, 2000);
};
Element.prototype.animate = function (...args) {
  const a = animate0.apply(this, args);
  a.finished.then(
    () => endSoon(a),
    () => endSoon(a),
  );
  return a;
};
const state = {
  voiceOver: false,
  sessions: new Map(),
  projects: [],
  paneGh: new Map(),
  paneIde: new Map(),
  paneWt: new Map(),
  paneVisible: false,
  paneLeft: 0,
  fill: false,
  fillHeard: false,
  notch: null,
  pins: [],
  hidden: [],
  repos: {},
  current: null,
  unread: new Map(),
  entries: [],
  notifications: true,
  serverNotify: false,
  about: {},
  config: { roots: [], quick: null, projects: {} },
  titleEdit: null,
  prsFor: null,
  snapshots: 0,
  awake: { awake: false, lid: false, idleSleep: null, power: null },
  lidAsking: false,
  clones: new Map(),
  update: null,
  editors: null,
  key: null,
  chat: { on: false, repo: null, room: null, unread: 0, invites: [] },
  lunch: { on: false, set: false, places: [] },
  priority: [],
};
const prefs = {
  space: false,
  spaceAt: 0.52,
  spZoom: 1,
  spLanes: true,
  spOff: ['idle', 'done'],
  spWin: 30,
  spSky: true,
  spTwinkle: true,
  spFalls: 'some',
  spVisits: true,
  spAnswer: true,
  spFade: true,
  spLinks: true,
  spArrange: 'state',
  spCard: true,
  spBusy: false,
  spNames: 'zoom',
  agentCards: {},
  cardPartsSeen: 0,
  mutedAt: 0,
  fishKey: null,
  fishing: null,
  laneSchool: false,
  laneBed: false,
  project: 'all',
  lastProject: null,
  lanesShut: ['done', 'idle'],
  lanesIdle: false,
  listFilter: null,
  sessionsWidth: 380,
  headDetails: false,
  chatZoom: 1,
  listHidden: false,
  splitAt: 0.5,
  stackAt: 0.5,
  prsOpen: false,
  cards: 'compact',
  cardsByLane: false,
  cardsMoved: false,
  optMeta: true,
  termReader: false,
  pageZoom: 1,
  fullSpace: false,
  person: null,
  cardsEven: false,
  cardsSnipOne: false,
  sounds: false,
  barStats: ['cpu', 'mem'],
  peopleCompact: true,
  changesScope: 'turn',
  editor: 'vscode',
  inEditor: 'vscode',
  pagesOut: true,
  linksMoved: false,
  boardSites: ['github.com'],
  cardParts: ['prs', 'rounds', 'tickets', 'faces'],
  prsHeight: null,
  theme: 'own',
  skinFollow: true,
  look: null,
  darkFrame: false,
  fillHints: 0,
  tvSeen: false,
  tvHints: 0,
  toured: false,
  newsSeen: [],
  newsLater: 0,
  settingsPane: 'general',
  zeBest: {},
  zeDay: null,
  zeDiff: 1,
  zeSound: true,
  zeBand: 'vira',
  zeTwo: null,
  zeTrophies: {},
  prChips: 'matrix',
  agentFor: {},
  prAgent: null,
  prio: true,
  pinned: 0,
  mornings: 9,
  zzLane: 0,
  focusSince: 0,
};
try {
  Object.assign(prefs, JSON.parse(localStorage.getItem('peixairada-prefs') || '{}'));
} catch {}
// Compact is the cards' default (2026-10-12; large before), and a board saved with large — the old default — moves to it
// once; one that chose medium keeps it.
if (!prefs.cardsMoved) {
  if (prefs.cards === 'large') prefs.cards = 'compact';
  prefs.cardsMoved = true;
}
// Pages but GitHub's open in the browser by default (2026-10-21, later; the board's own that morning) — and once on a
// board saved before, whichever it said; what is picked after stays.
if (!prefs.linksMoved) {
  prefs.pagesOut = true;
  prefs.linksMoved = true;
}
// Idle folds to begin with (2026-10-12) — and once on a board saved with Done alone folded, the default it had; one
// that opened Done (the harness opens every lane) keeps what it chose.
if (!prefs.lanesIdle) {
  if (Array.isArray(prefs.lanesShut) && prefs.lanesShut.includes('done') && !prefs.lanesShut.includes('idle'))
    prefs.lanesShut.push('idle');
  prefs.lanesIdle = true;
}
// keys from the lane board (before 2026-09-19): harmless, but no reason to carry them
for (const k of [
  'groupByRepo',
  'compact',
  'chatVisible',
  'chatSide',
  'chatWidth',
  'collapsed',
  'repoCollapsed',
  'tight',
  'showTools',
])
  delete prefs[k];
delete prefs.projectsCompact; // the projects column's strip or full width — there is no column since 2026-09-24
// the switches nothing set since the cog was pared down (2026-09-21): a saved value was the only way to flip them;
// and the code's fold, the settings' and each chat's, since long code is always folded, and how a date is written,
// day first again (both 2026-09-28)
for (const k of ['sound', 'showAll', 'toolsMode', 'foldCode', 'foldBy', 'dates']) delete prefs[k];
// the one-of-four filter (before 2026-09-20) becomes the set of states shown; 'all' was every state
// the state chips went (2026-10-11, later) — the lanes fold instead (lanesShut, Done shut to begin with); a filter
// saved before is dropped, or a state switched off then would be hidden with nothing left to bring it back
delete prefs.filter;
delete prefs.filters;
// the list folded to a rail (sessionsCompact) became the list hidden (2026-10-25): a folded one is hidden
if ('sessionsCompact' in prefs) {
  prefs.listHidden = !!prefs.sessionsCompact;
  delete prefs.sessionsCompact;
}
delete prefs.peopleFold; // the faces folded to a count (2026-10-09, off by default) became peopleCompact (2026-10-11, later): folded by default
// the experimental switches pared (2026-10-14): what they chose is now the only way, or gone
for (const k of [
  'simpleColors',
  'simpleColor',
  'skinExact',
  'autoResume',
  'edgeLight',
  'ringsInStep',
  'cardSpot',
  'tileStack',
  'wallFollow',
  'tiles',
  'headFloat',
  'statusBar',
  'layout',
  'sidebarStyle',
])
  delete prefs[k]; // layout: Tiles · Sidebar, sidebarStyle: Ring · Glass, until 2026-11-01
if (!Array.isArray(prefs.lanesShut)) prefs.lanesShut = ['done', 'idle'];
prefs.lanesShut = prefs.lanesShut.filter(g => g !== 'move' && g !== 'replied'); // lanes for a morning (2026-10-12), filters since
if (!['move', 'replied', 'prio'].includes(prefs.listFilter)) prefs.listFilter = null;
// the Snoozed lane folded to begin with (2026-11-24, round XXX's W1), as Idle and Done are, on a board that had prefs before it
if (!prefs.zzLane) {
  if (!prefs.lanesShut.includes('snoozed')) prefs.lanesShut.push('snoozed');
  prefs.zzLane = 1;
}
// Top priority became Pinned, on by default (2026-11-25): on once on a board that had prefs before
if (!prefs.pinned) {
  prefs.prio = true;
  prefs.pinned = 1;
}
// what the status bar adds (sbStats, none by default until 2026-10-09, then CPU and memory as barStats): a pick carries
// over; the empty default every saved prefs held does not, or nobody would see the new one
if ('sbStats' in prefs) {
  if (Array.isArray(prefs.sbStats) && prefs.sbStats.length) prefs.barStats = prefs.sbStats;
  delete prefs.sbStats;
}
// a card's parts chosen before it had agents to show (2026-11-02), before every part was one (2026-11-03: shown, as they
// were), and before the snooze's mark and the pin were on by default (2026-11-25: on, once)
if (Array.isArray(prefs.cardParts)) {
  if (!prefs.cardPartsSeen) prefs.cardParts.push('agents');
  if (prefs.cardPartsSeen < 2)
    prefs.cardParts.push('tab', 'branch', 'where', 'watch', 'fable', 'unread', 'move', 'live');
  if (prefs.cardPartsSeen < 3 && !prefs.cardParts.includes('nap')) prefs.cardParts.push('nap');
  if (prefs.cardPartsSeen < 4 && !prefs.cardParts.includes('pin')) prefs.cardParts.push('pin');
}
prefs.cardPartsSeen = 4;
const savePrefs = () => {
  try {
    localStorage.setItem('peixairada-prefs', JSON.stringify(prefs));
  } catch {}
};
