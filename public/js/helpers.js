// ---- helpers -----------------------------------------------------------------------
const esc = s =>
  String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
// Backticks in a title or a snippet are code (2026-10-12): the server keeps them when it turns a prompt or a reply into a
// sentence (plain), and a title like Add `deleteUserForm` read its ticks aloud. Over escaped markup, a run with no tag
// in it — a match marked inside one keeps its ticks.
const ticks = html => html.replace(/`([^`<>\n]{1,80})`/g, '<code class="icode">$1</code>');
// An MCP tool by its server and its name (2026-10-12): mcp__claude_ai_Slack__slack_search_users ran a folded run's
// summary over two lines; it is Slack: search users — the server's prefix (claude_ai_, plugin_<pkg>_) and the tool's
// repeat of the server dropped, underscores spaces. Anything else is its own name.
// A path where a line has no room for it (2026-10-12): the card's live line cut `Read /private/tmp/claude-501/-Users-…`
// at its end, the part every path shares kept and the file name lost. In the chat's folder it is from there, under a
// home it starts at ~, and one still long keeps its last two segments: `…/scratchpad/board.png`. Word by word, so a
// Grep's `pattern  in /some/dir` keeps its pattern.
const pathTail = (text, cwd = '') =>
  String(text || '')
    .split(/(\s+)/)
    .map(w => {
      if (!/^[~/]/.test(w) || !w.includes('/', 1)) return w;
      if (cwd && (w === cwd || w.startsWith(cwd + '/'))) w = w.slice(cwd.length + 1) || '.';
      w = w.replace(/^\/Users\/[^/]+(?=\/|$)/, '~');
      const seg = w.split('/');
      return w.length > 34 && seg.length > 3 ? '…/' + seg.slice(-2).join('/') : w;
    })
    .join('');
const toolName = n => {
  const m = /^mcp__(.+?)__(.+)$/.exec(n || '');
  if (!m) return n || '';
  const srv = m[1].replace(/^claude_ai_/, '').replace(/^plugin_[^_]+_/, ''),
    lo = srv.toLowerCase().replace(/[-\s]/g, '_') + '_';
  const tool = m[2].toLowerCase().startsWith(lo) ? m[2].slice(lo.length) : m[2];
  return `${srv.replace(/[_-]+/g, ' ')}: ${tool.replace(/_/g, ' ')}`;
};
const rel = ts => {
  if (!ts) return '';
  const d = (Date.now() - new Date(ts)) / 1000;
  if (d < 60) return `${Math.max(0, d | 0)}s`;
  if (d < 3600) return `${(d / 60) | 0}m`;
  if (d < 86400) return `${(d / 3600) | 0}h`;
  return `${(d / 86400) | 0}d`;
};
// A chat with a PR is titled by it, which is a title the user never wrote and Claude never chose —
// hover says which PR it is and keeps Claude's own title reachable rather than losing it: the header's tooltip, and
// on a card the rounds' popover's first line (2026-11-01, later; rpopHtml — the card's tooltip before).
function titleTip(s) {
  if (!s.prTitle || s.title !== s.prTitle) return '';
  const pr = s.prs?.find(p => p.title === s.prTitle);
  const own = s.aiTitle || s.lastPrompt;
  return `${pr ? pr.label + ' — ' : ''}${s.prTitle}${own ? `\n\nChat: ${own}` : ''}`;
}
const statusLabel = {
  working: 'clauding…',
  idle: 'ready',
  'needs-input': 'asking you',
  stale: 'ready — Claude isn’t running; resume it to carry on',
  unknown: '',
}; // one word per state (2026-10-12): *your move* is a PR's
// Inline SVG, not emoji: these sit at ~11px inside muted snippet text, where emoji come with their
// own colours and weight and stop reading as part of the sentence. `currentColor` keeps them typographic.
const ICON = {
  bellOff:
    '<svg class="ic st" viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 11H3l1.5-2.5V6.5A3.5 3.5 0 0 1 10 3.6M11.5 6.5v2L13 11H7.5M6.5 13a1.6 1.6 0 0 0 3 0M2.5 13.5l11-11"/></svg>',
  // the tab strip's glyphs, drawn (2026-10-11, the studies' Q1; ‹ › ↻ ↗ ◫ ⊟ ⨯ × in text before): strokes, .st
  back: '<svg class="ic st" viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3.5 5.5 8 10 12.5"/></svg>',
  forward: '<svg class="ic st" viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3.5 10.5 8 6 12.5"/></svg>',
  up: '<svg class="ic st" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 10.25 8 5.75 12.5 10.25"/></svg>',
  prio: '<svg class="ic st" viewBox="0 0 16 16" aria-hidden="true"><path d="M5.25 2.5h5.5M6.5 2.5v3.75L4.25 9.5h7.5L9.5 6.25V2.5M8 9.5v4.25"/></svg>', // Pinned (2026-11-24; a pin since 2026-11-25)
  moon: '<svg class="ic st" viewBox="0 0 16 16" aria-hidden="true"><path d="M12.9 10.1A5.25 5.25 0 0 1 5.9 3.1a5.25 5.25 0 1 0 7 7Z"/></svg>', // a snooze (2026-11-24)   // the PR list's foot: fold it (2026-10-13)
  reload:
    '<svg class="ic st" viewBox="0 0 16 16" aria-hidden="true"><path d="M12.6 6.4A4.9 4.9 0 1 0 12.9 9.6"/><path d="M13 3v3.5H9.5"/></svg>',
  external: '<svg class="ic st" viewBox="0 0 16 16" aria-hidden="true"><path d="M6.5 3.5h6v6M12.5 3.5 4 12"/></svg>',
  copyAddr:
    '<svg class="ic st cp" viewBox="0 0 16 16" aria-hidden="true"><rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/><path d="M10.5 5.5V4A1.5 1.5 0 0 0 9 2.5H4A1.5 1.5 0 0 0 2.5 4v5A1.5 1.5 0 0 0 4 10.5h1.5"/></svg>', // the address's copy (2026-10-20): two sheets…
  copied: '<svg class="ic st ok" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.6 8.4 6.6 11.3 12.4 5"/></svg>', // …and the ✓ they give way to, drawn (addrSay)
  side: '<svg class="ic st" viewBox="0 0 16 16" aria-hidden="true"><rect x="2.5" y="2.5" width="11" height="11" rx="2"/><path d="M8 2.5v11"/></svg>',
  over: '<svg class="ic st" viewBox="0 0 16 16" aria-hidden="true"><rect x="2.5" y="2.5" width="11" height="11" rx="2"/><path d="M2.5 8h11"/></svg>',
  close:
    '<svg class="ic st" viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 4.5 11.5 11.5M11.5 4.5 4.5 11.5"/></svg>',
  // the card's ✓ (2026-10-11; the text glyph before): a stroke, so a tick can draw it
  tick: '<svg class="ic tk" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.4 8.5 6.5 11.5 12.6 4.8"/></svg>',
  // done for good's ✕ (2026-10-11): a stroke like the ✓, which it stands in for while ⌥ is held over it
  forget:
    '<svg class="ic tk fx" viewBox="0 0 16 16" aria-hidden="true"><path d="M4.6 4.6 11.4 11.4M11.4 4.6 4.6 11.4"/></svg>',
  // a crystal ball: the oracle project's mark (see PROJECT_ICONS)
  oracle:
    '<svg class="ic pic" viewBox="0 0 16 16" aria-hidden="true"><path fill-rule="evenodd" d="M8 1.5a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm-2 2a1.1 1.1 0 1 0 0 2.2 1.1 1.1 0 0 0 0-2.2Z"/><path d="M4.6 12.3h6.8l1.3 2.2H3.3Z"/></svg>',
  you: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 8.2a3.1 3.1 0 1 0 0-6.2 3.1 3.1 0 0 0 0 6.2Zm0 1.4c-3.1 0-5.6 1.7-5.6 3.8V14h11.2v-.6c0-2.1-2.5-3.8-5.6-3.8Z"/></svg>',
  claude:
    '<svg class="ic burst" viewBox="0 0 24 24" aria-hidden="true"><path d="M11.22 9.10L12.00 0.50L12.78 9.10ZM13.08 9.20L18.76 2.70L14.33 10.11ZM14.52 10.37L22.94 8.45L15.00 11.84ZM15.00 12.16L22.94 15.55L14.52 13.63ZM14.33 13.89L18.76 21.30L13.08 14.80ZM12.78 14.90L12.00 23.50L11.22 14.90ZM10.92 14.80L5.24 21.30L9.67 13.89ZM9.48 13.63L1.06 15.55L9.00 12.16ZM9.00 11.84L1.06 8.45L9.48 10.37ZM9.67 10.11L5.24 2.70L10.92 9.20ZM9.20 12a2.80 2.80 0 1 0 5.60 0a2.80 2.80 0 1 0 -5.60 0Z"/></svg>',
  term: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M1.6 3.1 6.4 8l-4.8 4.9 1.1 1.1L8.6 8 2.7 2ZM8 12.6h6.4v1.5H8Z"/></svg>',
  play: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 1.8v12.4L14 8Z"/></svg>', // the resume bar's button
  // an arrow down into a tray: a repo being cloned (2026-10-09)
  download:
    '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M7.25 1.5h1.5v7.4l2.5-2.5 1.06 1.06L8 11.77 3.69 7.46 4.75 6.4l2.5 2.5Z"/><path d="M1.5 10.5H3v2.5h10v-2.5h1.5v4h-13Z"/></svg>',
  view: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path fill-rule="evenodd" d="M8 3.6a4.4 4.4 0 1 1 0 8.8 4.4 4.4 0 0 1 0-8.8Zm0 1.5a2.9 2.9 0 1 0 0 5.8 2.9 2.9 0 0 0 0-5.8Z"/><path d="M6.6 8a1.4 1.4 0 1 0 2.8 0 1.4 1.4 0 0 0-2.8 0ZM7.25 0h1.5v2.4h-1.5Zm0 13.6h1.5V16h-1.5ZM0 7.25h2.4v1.5H0Zm13.6 0H16v1.5h-2.4Z"/></svg>',
  more: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><circle cx="3" cy="8" r="1.5"/><circle cx="8" cy="8" r="1.5"/><circle cx="13" cy="8" r="1.5"/></svg>',
  // GitHub's mark (the octicon), heading the faces of the people on the chats' PRs (2026-10-09; the PR mark before)
  github:
    '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"/></svg>',
  globe:
    '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path fill-rule="evenodd" d="M8 1a7 7 0 1 1 0 14A7 7 0 0 1 8 1Zm-1.9 1.9A5.5 5.5 0 0 0 2.55 7.25H5a11 11 0 0 1 1.1-4.35Zm3.8 0A11 11 0 0 1 11 7.25h2.45A5.5 5.5 0 0 0 9.9 2.9ZM9.5 7.25A9.6 9.6 0 0 0 8 2.6a9.6 9.6 0 0 0-1.5 4.65Zm-3 1.5A9.6 9.6 0 0 0 8 13.4a9.6 9.6 0 0 0 1.5-4.65Zm-1.5 0H2.55a5.5 5.5 0 0 0 3.55 4.35A11 11 0 0 1 5 8.75Zm6 0a11 11 0 0 1-1.1 4.35 5.5 5.5 0 0 0 3.55-4.35Z"/></svg>', // a web page's tab
  copy: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path fill-rule="evenodd" d="M5 1.5h7.5A1.5 1.5 0 0 1 14 3v8.5a1.5 1.5 0 0 1-1.5 1.5H11v1.5A1.5 1.5 0 0 1 9.5 16h-6A1.5 1.5 0 0 1 2 14.5v-8A1.5 1.5 0 0 1 3.5 5H3.5V3A1.5 1.5 0 0 1 5 1.5Zm.5 1.5v2h4A1.5 1.5 0 0 1 11 6.5v5h1.5V3Zm-2 3.5v8h6v-8Z"/></svg>', // the turn's footer
  // a Jira ticket (2026-10-08): a ticket stub — the Setup's Jira rows
  ticket:
    '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path fill-rule="evenodd" d="M1.5 3.5h13v3a1.5 1.5 0 0 0 0 3v3h-13v-3a1.5 1.5 0 0 0 0-3Zm1.5 1.5v.9a3 3 0 0 1 0 4.2V11h10v-.9a3 3 0 0 1 0-4.2V5Zm6 0h1.2v6H9Z"/></svg>',
  key: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path fill-rule="evenodd" d="M5.5 4a3.5 3.5 0 1 1-.01 7A3.5 3.5 0 0 1 5.5 4Zm0 1.5a2 2 0 1 0 0 4 2 2 0 0 0 0-4ZM8.6 6.8H15v1.5h-1.3V10h-1.5V8.3H11V10H9.5V8.3h-.9Z"/></svg>',
  // keeping the Mac awake (2026-10-08): a cup for idle sleep held off, an open laptop for no sleep even with the lid shut
  cup: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" d="M2.6 6h8.6v3.4a3.4 3.4 0 0 1-3.4 3.4H6a3.4 3.4 0 0 1-3.4-3.4ZM11.2 7.2h.9a1.6 1.6 0 0 1 0 3.2h-1.1"/><path fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" d="M5.3 1.6c-.5.6.5 1.2 0 2.2M8.3 1.6c-.5.6.5 1.2 0 2.2M1.8 14.6h10.4"/></svg>',
  lid: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" d="M3.2 3.2h9.6v7H3.2Z"/><path fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" d="M1.2 12.8h13.6"/><path d="M6.6 5.6 9.8 6.7 6.6 7.8Z"/></svg>',
  // a radar: something of this chat's is still running and will report back (monitors, background commands)
  watch:
    '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 6.4a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2Z"/><path fill-rule="evenodd" d="M8 3.2A4.8 4.8 0 0 1 12.8 8h-1.5A3.3 3.3 0 0 0 8 4.7Zm0-3.2A8 8 0 0 1 16 8h-1.5A6.5 6.5 0 0 0 8 1.5Z"/></svg>',
  // a speech bubble: Claude has asked you something and is waiting on the answer
  ask: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path fill-rule="evenodd" d="M8 1.3c3.7 0 6.7 2.4 6.7 5.4S11.7 12 8 12c-.6 0-1.2 0-1.8-.2l-3.7 1.8 1-3C2.2 9.7 1.3 8.3 1.3 6.7c0-3 3-5.4 6.7-5.4Z"/></svg>',
  // a cog: the settings, the last row of the chat header's ···
  cog: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 5a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm0 1.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Zm-.9-5.5h1.8l.4 1.9c.4.15.8.35 1.15.6l1.85-.65 1.3 2.2-1.45 1.3c.05.4.05.8 0 1.2l1.45 1.3-1.3 2.2-1.85-.65c-.35.25-.75.45-1.15.6l-.4 1.9H7.1l-.4-1.9a5 5 0 0 1-1.15-.6l-1.85.65L2.4 10l1.45-1.3a5 5 0 0 1 0-1.2L2.4 6.2l1.3-2.2 1.85.65c.35-.25.75-.45 1.15-.6Z"/></svg>',
  // a pull request (Primer's octicon, MIT): a PR of the chat's has come round to you (moveHtml, headMove)
  pr: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 3.25a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 1.5 3.25Zm5.677-.177L9.573.677A.25.25 0 0 1 10 .854V2.5h1A2.5 2.5 0 0 1 13.5 5v5.628a2.251 2.251 0 1 1-1.5 0V5a1 1 0 0 0-1-1h-1v1.646a.25.25 0 0 1-.427.177L7.177 3.427a.25.25 0 0 1 0-.354ZM3.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm0 9.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm8.25.75a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Z"/></svg>',
  // a merged PR (2026-10-31): GitHub's own octicon (Primer, MIT), as pr above is — a merge's mark (linkChip)
  prMerged:
    '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M5.45 5.154A4.25 4.25 0 0 0 9.25 7.5h1.378a2.251 2.251 0 1 1 0 1.5H9.25A5.734 5.734 0 0 1 5 7.123v3.505a2.25 2.25 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.95-.218ZM4.25 13.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm8.5-4.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5ZM5 3.25a.75.75 0 1 0 0 .005V3.25Z"/></svg>',
  // a stylized F with a spark: the chat runs on Fable (see onFable)
  fable:
    '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path transform="translate(1.6 0) skewX(-12)" d="M4 3.2h7v2.4H6.7v2.7h4.2v2.3H6.7V14H4Z"/><path d="M13.8 0l.7 1.5 1.5.7-1.5.7-.7 1.5-.7-1.5-1.5-.7 1.5-.7Z"/></svg>',
  // a folder (Primer's file-directory-fill, MIT): a folder of repos, in the setup
  folder:
    '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M1.75 1A1.75 1.75 0 0 0 0 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0 0 16 13.25v-8.5A1.75 1.75 0 0 0 14.25 3H7.5a.25.25 0 0 1-.2-.1l-.9-1.2C6.07 1.26 5.55 1 5 1H1.75Z"/></svg>',
  pin: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M10 1.5l4.5 4.5-1.6.6-2.5 2.5-.4 3.2-1.3 1.3-2.8-2.8-3.8 3.8-.7-.7 3.8-3.8-2.8-2.8 1.3-1.3 3.2-.4 2.5-2.5Z"/></svg>',
  // ± in a square: a chat's changes, its diff (2026-10-10)
  lock: '<svg class="ic st" viewBox="0 0 16 16" aria-hidden="true"><rect x="3" y="7" width="10" height="7" rx="1.5"/><path d="M5 7V5a3 3 0 0 1 6 0v2"/></svg>', // read-only: an agent's tab (2026-11-02)
  timeline:
    '<svg class="ic st" viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 1.5v13M7.5 4.5h6M7.5 11.5h4"/><circle cx="4.5" cy="4.5" r="1.75"/><circle cx="4.5" cy="11.5" r="1.75"/></svg>', // the timeline tab (2026-10-17)
  stop: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><rect x="3" y="3" width="10" height="10" rx="2.5"/></svg>', // a turn that stopped short (2026-10-31)
  wake: '<svg class="ic st" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8.5" r="5.5"/><path d="M8 5.75V8.5l2 1.25M3 3.25 4.75 1.75M13 3.25l-1.75-1.5"/></svg>', // a wake-up the chat set itself (2026-10-31)
  diff: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M7.25 2.5h1.5v2.25H11v1.5H8.75V8.5h-1.5V6.25H5v-1.5h2.25ZM5 10.5h6V12H5Z"/><path fill-rule="evenodd" d="M2.5 1h11A1.5 1.5 0 0 1 15 2.5v11a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 1 13.5v-11A1.5 1.5 0 0 1 2.5 1Zm0 1.5v11h11v-11Z"/></svg>',
  // a branch (Primer's git-branch, MIT): the changes tab's branch
  branch:
    '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M9.5 3.25a2.25 2.25 0 1 1 3 2.122V6A2.5 2.5 0 0 1 10 8.5H6a1 1 0 0 0-1 1v1.128a2.251 2.251 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.5 0v1.836A2.493 2.493 0 0 1 6 7h4a1 1 0 0 0 1-1v-.628A2.25 2.25 0 0 1 9.5 3.25Zm-6 0a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Zm8.25-.75a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5ZM4.25 12a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Z"/></svg>',
  vscode:
    '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M23.15 2.587L18.21.21a1.494 1.494 0 0 0-1.705.29l-9.46 8.63-4.12-3.128a.999.999 0 0 0-1.276.057L.327 7.261A1 1 0 0 0 .326 8.74L3.899 12 .326 15.26a1 1 0 0 0 .001 1.479L1.65 17.94a.999.999 0 0 0 1.276.057l4.12-3.128 9.46 8.63a1.492 1.492 0 0 0 1.704.29l4.942-2.377A1.5 1.5 0 0 0 24 20.06V3.939a1.5 1.5 0 0 0-.85-1.352zm-5.146 14.861L10.826 12l7.178-5.448v10.896z"/></svg>',
  // Zed's mark (Simple Icons, CC0): the editor row and the setting when Zed is the editor (2026-10-13)
  vim: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path fill-rule="evenodd" d="M8 .6 15.4 8 8 15.4.6 8Zm-3.4 4.4h2l1.4 4.4L9.4 5h2l-2.5 6.2H7.1Z"/></svg>', // the in-app editor's other (2026-10-21): a V in a diamond, as vim's own
  zed: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M2.25 1.5a.75.75 0 0 0-.75.75v16.5H0V2.25A2.25 2.25 0 0 1 2.25 0h20.095c1.002 0 1.504 1.212.795 1.92L10.764 14.298h3.486V12.75h1.5v1.922a1.125 1.125 0 0 1-1.125 1.125H9.264l-2.578 2.578h11.689V9h1.5v9.375a1.5 1.5 0 0 1-1.5 1.5H5.185L2.562 22.5H21.75a.75.75 0 0 0 .75-.75V5.25H24v16.5A2.25 2.25 0 0 1 21.75 24H1.655C.653 24 .151 22.788.86 22.08L13.19 9.75H9.75v1.5h-1.5V9.375A1.125 1.125 0 0 1 9.375 8.25h5.314l2.625-2.625H5.625V15h-1.5V5.625a1.5 1.5 0 0 1 1.5-1.5h13.19L21.438 1.5z"/></svg>',
  // the chat (2026-10-17): a speech bubble, its status-bar segment and Settings' pane; two heads, its people
  poll: '<svg class="ic st" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 13.5h11M4.5 11V7.5M8 11V3.5M11.5 11V6"/></svg>', // a poll in the chat (2026-10-20): a bar chart
  pic: '<svg class="ic st" viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="2.5" width="12" height="11" rx="2"/><circle cx="5.75" cy="6.25" r="1.25"/><path d="m2.5 12 3.75-3.75 2.5 2.5 2-2L14 12"/></svg>', // a picture in the chat (2026-11-25): a frame, a sun, hills
  chat: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 3.6A1.6 1.6 0 0 1 4.1 2h7.8a1.6 1.6 0 0 1 1.6 1.6v5.8A1.6 1.6 0 0 1 11.9 11H7.2l-3.2 3v-3a1.6 1.6 0 0 1-1.5-1.6Z"/></svg>',
  people:
    '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M5.75 7.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Zm5.5-.25a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM1 14c0-2.4 2.1-4.2 4.75-4.2S10.5 11.6 10.5 14Zm10.5 0c0-1.4-.45-2.6-1.25-3.5.35-.1.7-.15 1.05-.15 2.1 0 3.7 1.4 3.7 3.4v.25Z"/></svg>',
};
$('#noChatMore').innerHTML = ICON.more;
const entryLabel = s =>
  s.terminal && s.terminal.exited === null
    ? 'a drawer here'
    : !s.alive
      ? 'not running'
      : s.live?.entrypoint === 'claude-vscode'
        ? 'VS Code'
        : inBackground(s)
          ? 'in the background'
          : s.live?.entrypoint === 'cli'
            ? 'a terminal elsewhere'
            : 'elsewhere'; // the words, not the entrypoint's (2026-10-12; CLI, live, stale before)
// Lives in VS Code (the server's rule: the registry while it runs, else the transcript's last line).
// Such a chat wears a blue border and can be taken over like a CLI chat (2026-09-20) — the cost is the
// tab in VS Code, which goes dead and does not follow; every button and hint that offers it says so.
const inVsCode = s => s?.entrypoint === 'claude-vscode';
// A background session (2026-11-04; `/bg`, `/fork`, `claude --bg`): running with no terminal, the daemon's, opened by `claude attach`.
const inBackground = s => s?.live?.kind === 'bg';
const shName = () => state.about.shell || 'zsh'; // the shell a ⌥⌘T tab is — the login shell's name, from the server
// A project's colour is the setup's (2026-10-15; Peacock's for its folder before, the setup's where Peacock gave
// none): `projects[name].color`, under the project's shown name — a worktree's its repo's (projDir) —, and for a
// named project the first of its folders'. No hashed hues: a folder without one has none, `--repo` stays unset, and
// the CSS paints --nocolor (a light gray) wherever a colour is needed. The board paints ALL, the flat list of every
// chat, in its own black, in both themes; a project set to black is the same black, with the same inks.
const BLACK = '#000000';
const colorKey = cwd => folderName(projDir(cwd)); // the setup's name for a folder's colour
const ownColor = cwds =>
  (Array.isArray(cwds) ? cwds : [cwds]).map(c => c && projCfg(colorKey(c)).color).find(Boolean) || null;
// What the board paints with. The setup and the header's square read ownColor: they are where a project's colour is
// set, so they show it.
const repoColor = cwds => skinColor(ownColor(cwds)); // a theme moves it to its own hue (2026-10-10)
const projColor = p => (p.key === ALL ? BLACK : repoColor(p.cwds));
const repoStyle = color => (color ? `--repo:${color}` : '');
// The ink that reads on a colour: near-black on a light one, white on a dark one — Peacock's rule (tinycolor's
// brightness, (299r + 587g + 114b) / 1000, light from 128), so the header agrees with a VS Code title bar Peacock
// painted in it; WCAG luminance would put black on #007fff. The setup holds #rrggbb; anything else gets the page's ink.
const brightness = color => {
  const m = /^#([0-9a-f]{3,8})$/i.exec(String(color).trim());
  if (!m) return null;
  const h = m[1].length < 6 ? [...m[1]].map(c => c + c).join('') : m[1];
  const ch = i => parseInt(h.slice(i, i + 2), 16);
  return (299 * ch(0) + 587 * ch(2) + 114 * ch(4)) / 1000;
};
const inkOn = color => {
  const b = brightness(color);
  return b === null ? 'var(--ink)' : b >= 128 ? '#1c1c1a' : '#ffffff';
};
// A colour too close to the board's black to be told from it (2026-10-01): the black beside it — the chat header's
// right of the project (main.darkchat) — turns grey. (The dark theme's ground
// behind a list of such cards did too, until the ink cards of 2026-10-09 made every card the panel.)
const nearBlack = color => {
  const b = brightness(color);
  return b !== null && b < 40;
};
// A tile's border (2026-10-10): its project's colour, a black one the grey that reads on the ground
const tileEdge = color => (!color ? 'var(--nocolor)' : nearBlack(color) ? 'var(--tile-grey)' : color);
// The chat pane in a project's colour: --repo for the header and the transcript's wash, --rink for what reads
// on the header, --hveil and --hveil2 the veils its gradient ends in, across and down (away from the ink: black
// under white ink, white under dark), .tinted while there is one (CSS cannot ask whether --repo is set).
const tintChat = color => {
  const c = $('#chat');
  c.classList.toggle('tinted', !!color);
  $('#main').classList.toggle('darkchat', nearBlack(color));
  c.style.setProperty('--tile-edge', tileEdge(color));
  c.style.setProperty('--hbg', color || 'var(--nocolor)'); // the header's ground and the transcript's wash, eased
  if (color) {
    const ink = inkOn(color),
      veil = a => (ink === '#ffffff' ? `rgb(0 0 0 / ${a})` : `rgb(255 255 255 / ${a + 0.08})`);
    c.style.setProperty('--repo', color);
    c.style.setProperty('--rink', ink);
    c.style.setProperty('--hveil', veil(0.26));
    c.style.setProperty('--hveil2', veil(0.16));
  } else for (const p of ['--repo', '--rink', '--hveil', '--hveil2']) c.style.removeProperty(p);
};
const folderName = cwd => (cwd ? cwd.split('/').filter(Boolean).pop() || cwd : '(no folder)');
// What the cog's setup says of a project, by the name the board shows — so a worktree or a second checkout of it is
// the same: a short name, a colour. Written into this file for one Mac until 2026-09-28 (PROJECT_ABBR, PROJECT_COLORS).
const projCfg = name => state.config.projects?.[name] || {};
// A project's mark, next to its name wherever it is written — the chat list's header, the chat header, the cards, the
// pickers: ⌥⌘O's project wears a crystal ball (2026-09-20, for oracle, the investigations folder that runs claude
// against the clusters; since 2026-09-28 whichever project the cog names for ⌥⌘O).
const projIcon = name => (name && name === state.config.quick ? ICON.oracle : '');
// A project's short name, on its square in Settings › Projects (2026-09-22; on a card in the folded chat list, and
// its box beside the colour, until 2026-10-25 — a hand-set `abbr` in the setup still names the square). The rule is
// the initial of each part of a hyphenated name, or the first two letters of a single word — which gives NS, AS, MS,
// FC on its own.
function abbrRule(name) {
  const n = String(name || '');
  const parts = n.split(/[^A-Za-z0-9]+/).filter(Boolean);
  if (!parts.length) return '·';
  return (parts.length > 1 ? parts.map(x => x[0]).join('') : parts[0].slice(0, 2)).toUpperCase().slice(0, 4);
}
const STALE_MAX_AGE_MS = 30 * 86400e3; // Claude Code deletes transcripts after 30 idle days by default; mirror that
