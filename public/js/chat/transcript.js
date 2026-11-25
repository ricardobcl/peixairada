// ---- transcript rendering ----------------------------------------------------------
// Fallback renderer (fenced code, inline code, bold) if the vendored libs failed to load.
function mdFallback(t) {
  const parts = String(t).split(/```/);
  return parts
    .map((p, i) =>
      i % 2
        ? `<pre><code>${esc(p.replace(/^\w*\n/, ''))}</code></pre>`
        : esc(p)
            .replace(/`([^`\n]+)`/g, '<code>$1</code>')
            .replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>'),
    )
    .join('');
}
const hasMd = typeof marked !== 'undefined' && typeof DOMPurify !== 'undefined';
if (hasMd) marked.setOptions({ gfm: true, breaks: true });
// Syntax highlighting. Optional like the other vendored libs — without it code blocks just stay
// plain. hljs escapes everything it emits, so its output can go in after DOMPurify has run.
const hasHl = typeof hljs !== 'undefined';
// Unlabelled fences are as often terminal output as code, and auto-detect on those guesses badly
// (~4x the cost of a known language, paid again for every message a chat is opened on). So: guess
// only for short blocks, and only among the languages that actually turn up here.
const AUTO_LANGS = ['bash', 'javascript', 'typescript', 'python', 'json', 'yaml', 'go', 'sql', 'diff', 'xml', 'css'];
const AUTO_MAX = 2000;
function highlight(root) {
  if (!hasHl) return;
  for (const code of root.querySelectorAll('pre > code')) {
    const src = code.textContent;
    if (!src.trim()) continue;
    const lang = (code.className.match(/language-([\w+#.-]+)/) || [])[1];
    try {
      const r =
        lang && hljs.getLanguage(lang)
          ? hljs.highlight(src, { language: lang, ignoreIllegals: true })
          : !lang && src.length < AUTO_MAX
            ? hljs.highlightAuto(src, AUTO_LANGS)
            : null;
      if (!r) continue;
      code.innerHTML = r.value;
      if (!lang && r.language) code.classList.add(`language-${r.language}`);
    } catch {}
  }
}
const ABS_URL = /^([a-z][a-z0-9+.-]*:|\/\/|#)/i;
// What a reply's own HTML may not carry (2026-11-06). The board's handlers are delegated on #log by class, id and data-*
// (the lunch link's `.chalk .lgo[data-url]`, `.agcall[data-ag]`, `#webBtn` found by `$()`), and its CSS styles by them:
// a reply that borrowed `class="chalk"` + `class="lgo" id="tour" data-url="file:///…"` laid an invisible veil the size of
// the window over the chat, whose click had the app open any URL; a `class="vh"` hid a command its copy button copied.
// So no id, name, class (but a code block's language-*, kept after), data-*, nor what opens or hides on its own (dialog,
// open, popover, hidden), points at the page's ids (for, form, popovertarget) or paints a colour (font, color) — and
// its links are the web's, mail or a path (no tel:, no //host, no scheme the system hands to an app).
const MD_URI = /^(?:(?:https?|mailto):|(?![\\/]{2})[^a-z]|[a-z0-9+.-]+(?:[^a-z0-9+.:-]|$))/i;
const MD_PURIFY = {
  FORBID_TAGS: [
    'style',
    'form',
    'button',
    'textarea',
    'select',
    'video',
    'audio',
    'source',
    'track',
    'picture',
    'image',
    'feimage',
    'use',
    'dialog',
    'font',
  ],
  FORBID_ATTR: [
    'style',
    'srcset',
    'poster',
    'background',
    'id',
    'name',
    'open',
    'popover',
    'popovertarget',
    'popovertargetaction',
    'command',
    'commandfor',
    'hidden',
    'for',
    'form',
    'target',
    'autofocus',
    'accesskey',
    'color',
    'bgcolor',
    'face',
  ],
  ALLOW_DATA_ATTR: false,
  ALLOWED_URI_REGEXP: MD_URI,
};
// Full GFM via marked, sanitised by DOMPurify (replies may contain raw HTML). Relative links —
// Claude writes [file.ts:42](src/file.ts#L42) — are resolved against the session cwd and opened in the editor.
function md(t, cwd) {
  if (!hasMd) return { html: mdFallback(t), cls: '' };
  let html;
  // No styles and no forms in a transcript (2026-10-03): a <style> after a word, or a style= on a block, restyled or
  // covered the whole board while the chat was open. Task lists keep their (disabled) checkboxes. Nor anything else
  // that fetches on sight (2026-10-14): DOMPurify keeps media, a srcset, a poster, a background, an SVG <image>.
  try {
    html = DOMPurify.sanitize(marked.parse(String(t ?? '')), MD_PURIFY);
  } catch {
    return { html: mdFallback(t), cls: '' };
  }
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  // A class is the board's own word (2026-11-06): the code's language alone is kept, every other goes — see MD_PURIFY.
  for (const el of tpl.content.querySelectorAll('[class]')) {
    const keep = el.localName === 'code' ? [...el.classList].filter(c => /^language-[\w+#.-]+$/.test(c)) : [];
    if (keep.length) el.className = keep.join(' ');
    else el.removeAttribute('class');
  }
  // an input is a task's checkbox or nothing (type=image fetches its src); an SVG attribute's url() points inside the
  // message or nowhere (a fill, mask or clip-path at another document fetches it), and a CSS escape spells no url
  for (const el of tpl.content.querySelectorAll('input:not([type="checkbox"])')) el.remove();
  for (const el of tpl.content.querySelectorAll('svg, svg *'))
    for (const a of [...el.attributes]) if (/url\(\s*['"]?\s*[^\s'"#]|\\/i.test(a.value)) el.removeAttribute(a.name);
  // An image is fetched only if it is in the message itself (data:); one elsewhere is a link to it — a reply led to
  // write ![](https://somewhere/?q=<a secret>) had the board send the secret there on sight, which the drawer never did.
  for (const img of tpl.content.querySelectorAll('img')) {
    const src = img.getAttribute('src') || '';
    if (/^data:image\//i.test(src)) continue;
    const a = document.createElement('a');
    a.href = src;
    a.textContent = `🖼 ${img.getAttribute('alt') || src}`;
    a.title = `An image, not loaded: ${src}`;
    img.replaceWith(a);
  }
  highlight(tpl.content);
  for (const a of tpl.content.querySelectorAll('a[href]')) {
    const href = a.getAttribute('href') || '';
    if (ABS_URL.test(href)) {
      a.target = '_blank';
      a.rel = 'noopener';
      continue;
    }
    const m = href.match(/^([^#?]+)(?:#L(\d+))?/);
    if (!m) continue;
    const abs = normPath(unURI(m[1].startsWith('/') ? m[1] : `${cwd || ''}/${m[1]}`)); // marked's href comes encoded; `..` resolved (2026-11-06)
    a.setAttribute('href', fileUrl(abs, m[2]));
    a.title = `Open ${abs}${m[2] ? ':' + m[2] : ''} in ${editor().name}`;
  }
  // Every block in a .codebox with its bar — the language, a copy button — and the long ones folded, always
  // (2026-09-28; a switch in the settings and a { } row per chat under ··· before). Claude Code cannot fold the code
  // it prints in the drawer — its only collapse is ctrl+o for tool output — so this is the rendered transcript's; a
  // folded block opens with a click on its summary.
  for (const pre of tpl.content.querySelectorAll('pre')) {
    const code = pre.querySelector('code');
    const lines = (code?.textContent || pre.textContent).replace(/\n$/, '').split('\n').length;
    const lang = (code?.className.match(/language-([\w+#.-]+)/) || [])[1] || '';
    const fold = lines > 6;
    const box = document.createElement('div');
    box.className = 'codebox';
    box.innerHTML = `<div class="cbar">${lang && !fold ? `<span class="lang">${esc(lang)}</span>` : ''}<button class="copy" type="button" title="Copy this block">copy</button></div>`;
    pre.replaceWith(box);
    box.append(pre);
    if (!fold) continue;
    const d = document.createElement('details');
    d.className = 'codefold';
    const sm = document.createElement('summary');
    sm.textContent = `${lang || 'code'} · ${lines} lines`;
    box.replaceWith(d);
    d.append(sm, box);
  }
  return { html: tpl.innerHTML, cls: 'md' };
}
/** How long a turn worked, as the footer says it: 12s, 4m 12s, 1h 05m. */
const workedFor = ms => {
  const s = Math.round(ms / 1000);
  return s < 60
    ? `${s}s`
    : s < 3600
      ? `${Math.floor(s / 60)}m ${s % 60}s`
      : `${Math.floor(s / 3600)}h ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}m`;
};
// Chats that talk (2026-10-31): a message from another chat is a third kind of row — neither yours nor Claude's —, its
// sender named and a click away; the SendMessage that sent one links to where it went; one still waiting for the chat's
// turn to end is at the log's foot, queued (renderPeerQueue). Its words are another Claude's, drawn as Claude's are.
const peerLink = (id, name, arrow = '') =>
  `<button type="button" class="peerlink" data-sid="${esc(id)}" title="${esc(`Open ${peerWho(id, name)}`)}">${arrow ? `<span aria-hidden="true">${arrow} </span>` : ''}${esc(peerWho(id, name))}</button>`;
const peerFrom = (e, at) =>
  `<div class="who"><span class="pfrom"><span aria-hidden="true">← </span>from ${e.fromId || e.id ? peerLink(e.fromId || e.id, e.name) : `<b>${esc(e.name || 'another chat')}</b>`}</span>${e.mode ? `<span class="pmode" title="the sender's permission mode">${esc(e.mode)}</span>` : ''}${e.verified === false ? '<span class="pmode" title="Claude Code could not tell which process sent it">unverified</span>' : ''}<span>${at}</span></div>`;
function peerHtml(e) {
  const r = md(e.text, state.sessions.get(state.current)?.cwd),
    at = e.ts ? new Date(e.ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';
  return `<div class="msg peer"${e.ts ? ` data-ts="${esc(e.ts)}"` : ''}><span class="vh">A message from another chat: </span>${peerFrom(e, at)}<div class="bubble"><div class="text ${r.cls}">${r.html}</div></div></div>`;
}
/** `cont`: a word of Claude's after another in the same turn — no who-line again (2026-10-08). */
function entryHtml(e, cont = false) {
  if (e.kind === 'text') {
    const r = md(e.text, state.sessions.get(state.current)?.cwd),
      at = e.ts ? new Date(e.ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';
    const foot =
      e.turnEnd && e.role === 'assistant'
        ? `<div class="turnfoot"><button class="tcopy" type="button" data-ts="${esc(e.ts || '')}" title="Copy what Claude said this turn">${ICON.copy}<span>copy</span></button>${e.worked ? `<span class="worked" title="from your last word to this reply">worked for ${workedFor(e.worked)}</span>` : ''}</div>`
        : '';
    return `<div class="msg ${e.role}${cont ? ' cont' : ''}"${e.ts ? ` data-ts="${esc(e.ts)}"` : ''}${cont && at ? ` title="${at}"` : ''}><div class="who"><span>${e.role === 'user' ? 'You' : 'Claude'}</span><span>${at}</span></div><div class="bubble"><div class="text ${r.cls}">${r.html}</div></div>${foot}</div>`;
  }
  if (e.kind === 'peer') return peerHtml(e);
  if (e.kind === 'tool_use')
    return `<div class="tool"><i class="tst ${toolMark(e.toolUseId)}" data-tu="${esc(e.toolUseId || '')}" role="img" aria-label="${{ run: 'running', ok: 'done', err: 'failed' }[toolMark(e.toolUseId)]}"></i><b${toolName(e.name) !== e.name ? ` title="${esc(e.name)}"` : ''}>${esc(toolName(e.name))}</b>${e.toId ? peerLink(e.toId, e.to, '→') : ''}<span>${esc(e.text)}</span></div>`;
  if (e.kind === 'tool_result')
    return `<div class="tool ${e.isError ? 'err' : ''}"><span>↳</span><span>${esc(e.text || '(no output)')}</span></div>`;
  if (e.kind === 'interrupt' || e.kind === 'compact') return `<div class="sysline">${esc(e.text)}</div>`;
  return '';
}
function toolSummaryHtml(run) {
  const uses = run.filter(e => e.kind === 'tool_use');
  const errs = run.filter(e => e.kind === 'tool_result' && e.isError).length;
  const byName = {};
  for (const u of uses) byName[toolName(u.name)] = (byName[toolName(u.name)] || 0) + 1;
  const label = Object.entries(byName)
    .sort((a, b) => b[1] - a[1])
    .map(([n, c]) => (c > 1 ? `${n} ×${c}` : n))
    .join(', ');
  const pending = uses.some(u => toolMark(u.toolUseId) === 'run'); // a call still out: the folded run says so too
  return `${pending ? '<i class="tst run" aria-hidden="true"></i>' : ''}${uses.length} tool call${uses.length === 1 ? '' : 's'} · ${esc(label)}${errs ? ` · <span class="err">${errs} error${errs > 1 ? 's' : ''}</span>` : ''}`;
}
const toolGroupHtml = run =>
  `<details class="toolgroup"><summary>${toolSummaryHtml(run)}</summary>${run.map(entryHtml).join('')}</details>`;
/** An agent's call (2026-11-02): a line of its own, out of the fold, the way back to its transcript long after its row has left the
 *  card. An Agent call has it from the start and the result ties it (agCallTie); a forked Skill's call stays in its run, and its
 *  result, the first to say an agent was started, is the line. `said`: what the call says it is for. */
function agCallHtml(e, said) {
  const a = e.agent,
    who = a?.name || e.who,
    words = a?.asked || said || '';
  return `<button type="button" class="tool agcall" title="Its transcript, read-only, beside the chat" data-asked="${esc(who || words || 'An agent')}"${a ? ` data-ag="${esc(a.id)}"` : ' disabled'}><i class="tst ${toolMark(e.toolUseId)}" data-tu="${esc(e.toolUseId || '')}" aria-hidden="true"></i><b>${esc(who || 'Agent')}</b><span>${esc(words)}</span><span class="go">its transcript ›</span></button>`;
}
function agCallTie(el, e) {
  if (e.isError) el.title = e.text || '';
  if (e.isError || !e.agent) return;
  el.dataset.ag = e.agent.id;
  el.disabled = false;
  if (e.agent.name) {
    el.querySelector('b').textContent = e.agent.name;
    el.dataset.asked = e.agent.name;
  }
}
// The transcript is appended to, not rewritten (2026-09-27): every `entries` event rebuilt the whole log — each
// markdown body through marked, DOMPurify and highlight.js, then linkify over every text node — several times a
// second while the open chat was clauding. Only what arrived is rendered now: a new entry is appended, and a run of
// tool calls still growing at the end has its new rows appended and its summary written again (2026-10-03; the whole
// <details> was drawn again on every push before, a turn's worth of rows parsed and linkified per push), its open
// state kept. Another chat, or another list (a fetch hands the page a new array), starts the log over.
const logView = { arr: null, n: 0, run: [], group: null, drawnRun: 0, agCalls: new Map() };
const REVEAL_GAP = 45;
function reveal(msg) {
  const parts = [...msg.querySelectorAll('.text > *, .turnfoot')].slice(0, 12);
  noteMotion(state.current, 'reveal', parts.length);
  parts.forEach((p, i) =>
    p.animate(
      [
        { opacity: 0, filter: 'blur(3px)', transform: 'translateY(4px)' },
        { opacity: 1, filter: 'blur(0)', transform: 'none' },
      ],
      { duration: 260, delay: 40 + i * REVEAL_GAP, easing: EASE_OUT, fill: 'backwards', id: 'reveal' },
    ),
  );
}
// A tool call's state, at its row's start (2026-10-11, GitHub Actions' steps): turning while its result has not come
// (still while the chat is not at work — #log.working, renderPresence), a dot once it has, a red cross for an error.
// `toolRes`: every result the open chat's entries hold, by the call it answers; a result arriving for a row already
// drawn sets its mark, with a pop.
const toolRes = new Map();
const toolMark = id => (!id || !toolRes.has(id) ? 'run' : toolRes.get(id) ? 'err' : 'ok');
const htmlNodes = (html, cwd) => {
  const t = document.createElement('template');
  t.innerHTML = html;
  linkify(t.content, cwd);
  return t.content;
};
function renderLog() {
  const log = $('#log'),
    cwd = state.sessions.get(state.current)?.cwd;
  const stick = log.scrollHeight - log.scrollTop - log.clientHeight < 80;
  const resetting = logView.arr !== state.entries || logView.n > state.entries.length;
  // The same chat drawn again (a reconnect's fetch) keeps your place in it, and lights no pill for what you had read
  // (2026-10-03: thrown to the top, and "37 new replies" for the whole transcript).
  const keep =
    resetting && log.dataset.sid === (state.current || '') && !stick ? log.scrollHeight - log.scrollTop : null;
  if (resetting) {
    toolRes.clear();
    for (const e of state.entries) if (e.kind === 'tool_result' && e.toolUseId) toolRes.set(e.toolUseId, !!e.isError);
  } else
    for (const e of state.entries.slice(logView.n))
      if (e.kind === 'tool_result' && e.toolUseId && !toolRes.has(e.toolUseId)) {
        toolRes.set(e.toolUseId, !!e.isError);
        const m = log.querySelector(`.tst[data-tu="${CSS.escape(e.toolUseId)}"]`);
        if (m) {
          m.className = 'tst ' + toolMark(e.toolUseId);
          if (!REDUCED.matches)
            m.animate(
              [
                { scale: 0.2, opacity: 0 },
                { scale: 1, opacity: 1 },
              ],
              { duration: 320, easing: SPRING, id: 'tst' },
            );
        }
      }
  if (resetting) {
    log.innerHTML = '';
    log.dataset.sid = state.current || '';
    Object.assign(logView, {
      arr: state.entries,
      n: 0,
      run: [],
      group: null,
      drawnRun: 0,
      agCalls: new Map(),
      fresh: 0,
      dayKey: new Date().toDateString(),
      lastWho: null,
    });
  }
  // What comes while you read fades in (`.in`); the first fill stands still. New nodes go before the log's tail —
  // the presence line and the new-reply pill, which stay last.
  const live = logView.n > 0 && !log.hidden && !REDUCED.matches,
    arrived = state.entries.length - logView.n;
  let replies = 0;
  const tail = log.querySelector(':scope > .peerq, :scope > .presence, :scope > .lognew'); // once: per entry, it was a query over the whole log
  // …and a reply of Claude's that lands while you are at the end comes up part by part out of a slight blur (2026-10-11,
  // the agent apps' streaming text — the transcript has no stream, a reply arrives whole): its paragraphs, code and
  // lists, REVEAL_GAP apart, instead of the whole message fading in at once.
  const add = frag => {
    const kids = live ? [...frag.children] : [];
    for (const c of kids) if (!(stick && c.matches('.msg.assistant'))) c.classList.add('in');
    if (tail) log.insertBefore(frag, tail);
    else log.append(frag);
    if (stick) for (const c of kids) if (c.matches('.msg.assistant')) reveal(c);
  };
  const group = () => {
    // the trailing run of tool calls: its <details> made, or its new rows added and its summary redone
    const run = logView.run;
    if (!run.length || logView.drawnRun === run.length) return;
    if (!logView.group) {
      const frag = htmlNodes(toolGroupHtml(run), cwd);
      logView.group = frag.firstElementChild;
      add(frag);
    } else {
      logView.group.append(htmlNodes(run.slice(logView.drawnRun).map(entryHtml).join(''), cwd));
      logView.group.querySelector(':scope > summary').innerHTML = toolSummaryHtml(run);
    }
    logView.drawnRun = run.length;
  };
  const runEnds = () => {
    group();
    logView.run = [];
    logView.group = null;
    logView.drawnRun = 0;
  };
  for (const e of state.entries.slice(logView.n)) {
    if (e.kind === 'tool_use' && e.name === 'Agent') {
      runEnds();
      const f = htmlNodes(agCallHtml(e, e.text), cwd);
      logView.agCalls.set(e.toolUseId, f.firstElementChild);
      add(f);
      continue;
    }
    const call = e.kind === 'tool_result' && logView.agCalls.get(e.toolUseId);
    if (call) {
      agCallTie(call, e);
      continue;
    }
    if (e.kind === 'tool_result' && e.agent) {
      const said = logView.run.find(u => u.toolUseId === e.toolUseId)?.args;
      runEnds();
      add(htmlNodes(agCallHtml(e, said), cwd));
      continue;
    }
    if (e.kind === 'tool_use' || e.kind === 'tool_result') {
      logView.run.push(e);
      continue;
    }
    runEnds();
    // a line where the day changes, as the list has (2026-09-27, night): none for today's messages at the top, a
    // date where the transcript goes to another day, "today" where it comes back — by the date itself (2026-10-03: by
    // its label, and a chat open across midnight had no line between yesterday's words and today's)
    if ((e.kind === 'text' || e.kind === 'peer') && e.ts) {
      const k = new Date(e.ts).toDateString();
      if (k !== 'Invalid Date' && k !== logView.dayKey) {
        logView.dayKey = k;
        add(htmlNodes(`<div class="sysline day"><b>${dayOf(e.ts)}</b></div>`, cwd));
      }
    }
    const cont = e.kind === 'text' && e.role === 'assistant' && logView.lastWho === 'assistant';
    add(htmlNodes(entryHtml(e, cont), cwd));
    if (e.kind === 'text') logView.lastWho = e.turnEnd ? null : e.role;
    else if (e.kind === 'interrupt' || e.kind === 'compact' || e.kind === 'peer') logView.lastWho = null; // a turn's end: the next word is a new turn's
    if (e.kind === 'text' && e.role === 'assistant') replies++;
  }
  group();
  logView.n = state.entries.length;
  if (live && arrived) noteMotion(state.current, 'msg', arrived);
  log.querySelector(':scope > .empty')?.remove();
  if (!log.querySelector(':scope > :not(.peerq, .presence, .lognew)'))
    log.insertAdjacentHTML('afterbegin', '<div class="empty">No messages yet</div>');
  renderPresence();
  if (stick) {
    log.scrollTop = log.scrollHeight;
    logNew(0);
  } else if (keep !== null) log.scrollTop = log.scrollHeight - keep;
  else if (arrived && !resetting) {
    logView.fresh += replies;
    logNew(logView.fresh, arrived);
  }
  tvSoon(); // the timeline reads the same entries
}
// The pill at the log's foot (2026-09-27, night): what came while you were scrolled up — "new reply", "3 new
// replies", or "more below" for tool activity alone — sticky at the bottom of the window, the twin of the list's
// ends. A click scrolls to the end; reaching it yourself puts it away (the scroll listener). Made on first need,
// kept the last thing in the log.
function logNew(replies, arrived = 0) {
  const log = $('#log');
  let pill = log.querySelector(':scope > .lognew');
  if (!replies && !arrived) {
    pill?.classList.remove('on');
    logView.fresh = 0;
    return;
  }
  if (!pill) {
    pill = html2el(
      '<div class="lognew"><button type="button" title="Scroll to the end of the chat">↓ <b></b></button></div>',
    );
    pill.querySelector('button').onclick = () => {
      log.scrollTo({ top: log.scrollHeight, behavior: REDUCED.matches ? 'auto' : 'smooth' });
      logNew(0);
    };
  }
  pill.querySelector('b').textContent = replies
    ? replies === 1
      ? 'new reply'
      : `${replies} new replies`
    : 'more below';
  if (pill !== log.lastElementChild) log.append(pill);
  pill.classList.add('on');
  noteMotion(state.current, 'pill', replies);
}
$('#log').addEventListener(
  'scroll',
  () => {
    const log = $('#log');
    if (log.scrollHeight - log.scrollTop - log.clientHeight < 80) logNew(0);
    if (!SCROLL_TIMELINES) $('#shead').style.setProperty('--shade', Math.min(1, log.scrollTop / 24).toFixed(2)); // the header's shadow, by hand
  },
  { passive: true },
);
// Presence at the foot of the transcript (2026-09-27, night): while the open chat is clauding, Claude's mark and the
// word — a reply on its way is seen where you are reading, not only on the card — with the sub-agents' count when
// there is one; while it is asking, the question in the card's red. Kept the last thing in the log, gone when the
// chat is neither; called from renderLog and from the session event, which is where the state flips. phaseAnims puts
// the mark in step with the divider's.
// Fish verbs (2026-10-11, Claude Code's spinner verbs): while the presence line says the chat is clauding, its word
// changes every VERB_MS to one of a fish market's — rolled up and in, shimmering like the first — in place, so the
// line's markup, and every check that reads it as it comes, still start at *clauding…*.
const VERBS = [
  'trawling…',
  'filleting…',
  'netting…',
  'haggling…',
  'gutting…',
  'brining…',
  'scaling…',
  'deboning…',
  'reeling in…',
  'casting…',
  'salting…',
  'shoaling…',
  'smoking…',
  'clauding…',
];
const VERB_MS = 3200;
let verbAt = 0;
setInterval(() => {
  const box = !document.hidden && document.querySelector('#log > .presence .verb');
  if (!box) return;
  const old = box.lastElementChild,
    nu = html2el(`<span class="vw">${shim(VERBS[verbAt++ % VERBS.length])}</span>`);
  box.append(nu);
  phaseAnims();
  if (REDUCED.matches || !old) {
    old?.remove();
    return;
  }
  old.animate(
    [
      { transform: 'none', opacity: 1 },
      { transform: 'translateY(-90%)', opacity: 0 },
    ],
    { duration: 220, easing: EASE_OUT, fill: 'forwards', id: 'verb' },
  ).onfinish = () => old.remove();
  nu.animate(
    [
      { transform: 'translateY(90%)', opacity: 0 },
      { transform: 'none', opacity: 1 },
    ],
    { duration: 340, easing: SPRING, id: 'verb' },
  );
}, VERB_MS);
/** Another chat's messages waiting for this one's turn to end (2026-10-31): before the presence line, gone once taken. */
function renderPeerQueue(log, s) {
  const html = (s?.peerQueue || [])
    .map(
      q =>
        `<div class="msg peer queued"><span class="vh">A message from another chat, waiting for this one's turn to end: </span>${peerFrom(q, '<b class="pq">queued</b>')}<div class="bubble"><div class="text">${esc(q.text)}</div></div></div>`,
    )
    .join('');
  let el = log.querySelector(':scope > .peerq');
  if (!html) {
    el?.remove();
    return;
  }
  if (!el) el = html2el('<div class="peerq"></div>');
  if (el.dataset.html !== html) {
    el.innerHTML = html;
    el.dataset.html = html;
  }
  const after = log.querySelector(':scope > .presence, :scope > .lognew');
  if (el.parentNode !== log || el.nextElementSibling !== after) log.insertBefore(el, after);
}
function renderPresence() {
  const log = $('#log'),
    s = state.sessions.get(state.current);
  renderPeerQueue(log, s);
  log.classList.toggle('working', s?.status === 'working'); // a tool call without its result turns only while the chat works
  const html = !s
    ? ''
    : s.status === 'working'
      ? `<div class="presence" title="Claude is working on a reply">${PIX}<span class="w"><span class="verb"><span class="vw">${shim('clauding…')}</span></span>${s.agents ? ` <em>· ${s.agents} agent${s.agents === 1 ? '' : 's'} at work</em>` : ''}</span></div>`
      : asking(s)
        ? `<div class="presence ask">${askHtml(s)}</div>`
        : '';
  let el = log.querySelector(':scope > .presence');
  if (!html) {
    el?.remove();
    return;
  }
  const stick = log.scrollHeight - log.scrollTop - log.clientHeight < 80,
    pill = log.querySelector(':scope > .lognew');
  const place = n => (pill ? log.insertBefore(n, pill) : log.append(n)); // last, but for the new-reply pill
  if (!el || el.dataset.html !== html) {
    const n = html2el(html);
    n.dataset.html = html;
    if (el) el.replaceWith(n);
    else place(n);
    el = n;
    phaseAnims();
  }
  if (el.nextElementSibling && el.nextElementSibling !== pill) place(el);
  // the same rows as its card's (2026-11-02), for the chat you are reading, whatever its card has folded
  const on = s.status === 'working' && agOn(s),
    had = el.querySelector(':scope > .agl');
  if (on) {
    agNote(s);
    const box = had || el.appendChild(html2el('<div class="agl"></div>')),
      items = agItems({ ...agPlan(s, false), folded: false }, s);
    if (agDraw(box, items, true)) phaseAnims();
    box.hidden = !items.length;
  } else had?.remove();
  if (stick) log.scrollTop = log.scrollHeight;
}

// Located (2026-10-11): a chat opened from somewhere other than its card — ⌥⌘K, the launcher, a notification, the
// overview, a tile, the home — flashes its card once, a light sweeping across it, so the eye finds where it lives.
function locateCard(id) {
  const c = document.querySelector(`#slist > .card[data-id="${CSS.escape(id)}"]`);
  if (!c || REDUCED.matches || prefs.listHidden) return;
  c.querySelector(':scope > .loc')?.remove();
  const l = html2el('<span class="loc" aria-hidden="true"><i></i></span>');
  c.append(l);
  noteMotion(id, 'locate');
  l.firstChild.animate([{ transform: 'translateX(-100%)' }, { transform: 'translateX(250%)' }], {
    duration: 650,
    easing: 'cubic-bezier(.4, 0, .2, 1)',
    id: 'locate',
  }).onfinish = () => l.remove();
}
// The board showed the chat (2026-10-12): the server keeps when, and a reply after it is a new one (the New replies
// filter, the Dock's badge). On opening it, and on a reply landing while it is the chat in front; the
// summary is told at once, so its card does not wait for the server's push to stop being new.
function markSeen(id) {
  const s = state.sessions.get(id),
    at = new Date().toISOString();
  if (!s) return;
  if (s.seenAt) s.seenAt = at;
  api('POST', `/api/sessions/${encodeURIComponent(id)}/seen`).catch(() => {});
}
window.peixMarkRead = id => {
  if (!state.sessions.has(id)) return;
  markSeen(id);
  renderBoard();
}; // the fish's menu, ⌥ on a reply's row (round XIX's S8)
async function openSession(id, { locate = false } = {}) {
  if (id !== state.current) drawer.err = null; // a failure to start a drawer is the chat's it happened on (2026-10-07)
  state.current = id;
  state.unread.delete(id);
  hidePr();
  markSeen(id);
  // the address names the open chat at once (2026-10-02; after the fetch before, so a chat left before its answer
  // came put its id back over the next one's, and a link to that one was then no change of hash)
  if (location.hash !== '#' + id + tvHash(id)) history.replaceState(null, '', '#' + id + tvHash(id)); // and the timeline's narrow beside it (2026-10-17)
  const s0 = state.sessions.get(id);
  // a deep link, a notification or Next can point at a chat outside the project in view: the filter lets go, and ⌥⌘P ⌥⌘P
  // brings it back. It never takes a value you did not give it (2026-11-04, round XXV; it moved to the chat's folder, in silence).
  if (s0 && !inProject(s0, projectStub(prefs.project))) scopeTo(ALL);
  renderBoard();
  if (locate && s0) {
    document.querySelector(`#slist > .card[data-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'nearest' });
    locateCard(id);
  }
  if (s0) renderHead(s0);
  if (s0) syncTerm(s0); // the tab it was on comes back at once — a page in the pane, its zsh; the drawer after the fetch (a chat not yet in the snapshot keeps what is attached until then)
  const ask = awaitEntries(id);
  const seen = sessionSeen.get(id) || 0;
  const data = await api('GET', `/api/sessions/${id}/messages`).catch(() => null);
  if (!newest(ask)) return; // asked again since — this chat or another: that answer is the one
  if (!data) {
    if (state.current === id) {
      takeEntries(id, { entries: [] });
      renderLog();
    }
    return;
  } // nothing to show but what the stream brings
  // another chat opened while this one's answer was on its way (⌥⌘↓ ⌥⌘↑ in quick succession): the answer is stale
  // (2026-10-02) — it drew this chat's transcript under the other's header
  if (state.current !== id) return;
  const s1 = takeSession(id, data, seen);
  takeEntries(id, data);
  renderHead(s1);
  renderLog();
  syncTerm(s1);
  // A chat the snapshot did not have yet — the drawer's new one, told of over the `terminal` event before its own
  // `session` push — gets its card, and the project switch above, from the answer.
  if (!s0) {
    if (!inProject(data.session, projectStub(prefs.project))) scopeTo(ALL);
    renderBoard();
  }
  $('#log').scrollTop = $('#log').scrollHeight;
  document.querySelector(`#slist > .card[data-id="${id}"]`)?.scrollIntoView({ block: 'nearest' });
}
