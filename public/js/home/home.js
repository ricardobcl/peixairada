  function showHome() {
    if (state.current) return;
    if (!$('#log .home')) $('#log').innerHTML = '<div class="home" id="home"></div>';
    drawHome(); loadDay();
    if (!home.timer) home.timer = setInterval(() => { if (!state.current && $('#home')) loadDay(); else { clearInterval(home.timer); home.timer = 0; } }, 60_000);
  }
  async function loadDay() {
    if (home.asking) return; home.asking = true;
    try { home.day = await api('GET', `/api/today?since=${new Date().setHours(0, 0, 0, 0)}`); } catch {} finally { home.asking = false; }
    drawHome();
  }
  const homeSoon = (fetch = false) => { if (state.current || !$('#home')) return; if (fetch) loadDay(); if (!home.soon) home.soon = setTimeout(() => { home.soon = 0; drawHome(); }, 300); };
  function hotHome() { if (state.current) leaveChat(); else showHome(); focusBoard(); }
  function drawHome() {
    const el = $('#home'); if (!el || state.current) return;
    const a = state.about || {}, all = [...state.sessions.values()].filter(visible), alive = all.filter(s => s.alive), d = home.day;
    const prs = allPrs(), open = prs.filter(p => p.state === 'open' || p.state === 'draft');
    const tasks = alive.reduce((n, s) => n + (s.tasks?.length || 0), 0), agents = alive.reduce((n, s) => n + (s.agents || 0), 0), drawers = all.filter(termLive).length;
    const win = usage.data?.windows || [];
    const kv = (k, v) => `<div><b>${k}</b><span>${v}</span></div>`, sep = '<s>·</s>';
    // a count in red or amber only when there is one (2026-10-12): "0 asking you" in red read as an alarm
    const hot = (tag, n, html) => n ? `<${tag}>${html}</${tag}>` : html;
    // …and a count that has something behind it is a way there (2026-10-12): the chat asking you, the overview, the PRs
    const go = (k, n, html) => n ? `<button class="hgo" data-go="${k}" title="${HOME_GO[k]}">${html}</button>` : html;
    const facts = [
      kv('Board', `${esc(state.update?.version || a.version || '?')} ${sep} up ${a.since ? dur(Date.now() - a.since) : '?'}${inApp ? ` ${sep} the app` : ''}`),
      kv('Chats', `${all.filter(s => !s.done).length} ${sep} ${go('ov', alive.length, `${alive.length} live`)} ${sep} ${go('ask', alive.filter(asking).length, hot('em', alive.filter(asking).length, `${alive.filter(asking).length} asking you`))} ${sep} ${go('ov', all.filter(s => bucket(s) === 'working').length, hot('u', all.filter(s => bucket(s) === 'working').length, `${all.filter(s => bucket(s) === 'working').length} clauding`))}`),
      kv('Agents', `${go('ov', agents, `${agents} at work`)} ${sep} ${go('ov', tasks, `${tasks} watching`)} ${sep} ${drawers} in a drawer here`),
      kv('Today', d ? `Claude worked <strong>${dur(d.totals.worked)}</strong> ${sep} waited on you ${hot('em', d.totals.waited, dur(d.totals.waited))}` : '…'),
      kv('PRs', `${open.length} open ${sep} ${go('prs', prs.filter(p => p.turn?.you).length, hot('em', prs.filter(p => p.turn?.you).length, `${prs.filter(p => p.turn?.you).length} at your move`))} ${sep} ${open.filter(p => p.checks === 'pending').length} CI running`),
      win.length ? kv('Plan', win.filter(w => !w.grant).slice(0, 4).map(w => `${esc(uShort(w))} ${Math.round(w.percent)}%`).join(` ${sep} `)) : '',
      kv('Mac', `${bar.stats.cpu != null ? `CPU ${bar.stats.cpu}% ${sep} ` : ''}${bar.stats.mem ? `${(bar.stats.mem.used / 2 ** 30).toFixed(1)} / ${Math.round(bar.stats.mem.total / 2 ** 30)} GB ${sep} ` : ''}${state.awake.awake ? 'kept awake' : 'sleeps as set'}`),
      kv('Theme', esc(skinLabel(wornKey()) + (prefs.skinFollow ? ' · following macOS' : ''))),
    ].filter(Boolean);
    // the day: from the hour of its first span, half an hour before it (2026-10-12; from 8:00 before, which left an
    // evening's work a sliver at the right of a fourteen-hour axis), to the hour after now
    const now = Date.now(), mid = new Date().setHours(0, 0, 0, 0), rows = (d?.chats || []).slice(0, 12);
    const first = Math.min(now, ...rows.flatMap(c => c.spans.map(x => Date.parse(x.from))).filter(x => x > 0));
    const t0 = Math.max(mid, new Date(first - 1800_000).setMinutes(0, 0, 0)), t1 = new Date(now + 3600_000).setMinutes(0, 0, 0), span = t1 - t0 || 1;
    const at = t => `${((Math.max(t0, Math.min(t1, t)) - t0) / span * 100).toFixed(2)}%`;
    const hours = []; for (let h = t0; h <= t1; h += 3600_000) hours.push(h);
    const step = Math.ceil(hours.length / 12);
    const day = !d ? '<div class="hnone">reading the day…</div>' : !rows.length ? '<div class="hnone">nothing yet today</div>' : `
      <div class="hgrid">
        <span></span><div class="haxis">${hours.map((h, i) => i % step ? '' : `<span style="left:${at(h)}">${new Date(h).getHours().toString().padStart(2, '0')}:00</span>`).join('')}</div><span></span>
        ${rows.map(c => `<button class="hrow" data-id="${esc(c.id)}" style="${repoStyle(repoColor(c.cwd))}" title="${esc(c.project)} · ${esc(c.title)} — open it"><b>${projIcon(c.project)}${esc(c.project)}</b><span>${ticks(esc(c.title))}</span></button>
          <div class="htrack" style="${repoStyle(repoColor(c.cwd))};--step:calc(100% / ${hours.length - 1})">${c.spans.map(x => `<i class="${x.k}${x.to ? '' : ' now'}" style="left:${at(Date.parse(x.from))};width:calc(${x.to ? at(Date.parse(x.to)) : 'var(--now)'} - ${at(Date.parse(x.from))})"></i>`).join('')}<span class="hnow" style="left:var(--now)"></span></div>
          <span class="htot">${dur(c.worked)}${c.waited ? ` <em>· ${dur(c.waited)}</em>` : ''}</span>`).join('')}
      </div>
      <div class="hsum"><span><b>${d.totals.questions} question${d.totals.questions === 1 ? '' : 's'}</b> today${d.totals.median != null ? `, answered in <b>${dur(d.totals.median)}</b> on the median` : ''}</span>${d.totals.longest ? `<span>the longest wait: <em>${dur(d.totals.longest.ms)}</em> — ${esc(state.sessions.get(d.totals.longest.id)?.project || 'a chat')} at ${new Date(d.totals.longest.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}${d.totals.longest.open ? ', and still waiting' : ''}</span>` : ''}<span class="r">⌥⌘0 here from anywhere · a row opens its chat</span></div>`;
    // the sea's canvas outlives every draw: the facts and the day are drawn into boxes of their own (2026-10-12)
    if (!el.querySelector('.hsea')) el.innerHTML = '<div class="hff"><canvas class="hsea" role="img" aria-label="An ASCII sunset at sea, the board\'s fish leaping in it" title="Click, and the fish leaps"></canvas><div class="hkv"></div></div><div class="hlunch"></div><div class="hday"></div>';
    seaMount(el.querySelector('.hsea'));
    // each line drawn only when it changed, and now the day's --now, never a place in its markup (2026-10-14): the CPU
    // every 3 s, the clock every draw, redrew the links and the rows under a press, which then clicked nothing
    setKids(el.querySelector('.hkv'), [`<div class="hh">${esc(a.user || 'you')}<span>@</span>${esc(a.host || 'peixairada')}</div>`, '<div class="hrule"></div>', ...facts,
        `<div class="hblocks">${['--needs', '--working', '--idle', '--watch', '--accent', '--spend', '--you', '--ink'].map(v => `<i style="background:var(${v})"></i>`).join('')}</div>`,
        `<div class="hkeys"><kbd>⌥⌘L</kbd> anything <s>·</s> <kbd>⌥⌘K</kbd> a chat <s>·</s> <kbd>⌥⌘N</kbd> new <s>·</s> <kbd>⌥⌘A</kbd> overview <s>·</s> <kbd>?</kbd> keys <s>·</s> <button class="hgo" data-go="tour" title="The board’s main parts, one at a time — a couple of minutes">the tour</button></div>`]);
    setHtml(el.querySelector('.hday'), `<h3><b>Today</b><span>every chat, ${new Date(t0).getHours().toString().padStart(2, '0')}:00 to now</span><span class="lg"><span><i class="w"></i>clauding</span><span><i class="a"></i>waiting on you</span><span><i class="m"></i>watching</span></span></h3>${day}`);
    el.querySelector('.hgrid')?.style.setProperty('--now', at(now));
    setHtml(el.querySelector('.hlunch'), lunchHomeHtml());
  }
  const HOME_GO = { ask: 'Open the chat asking you', ov: 'The overview — every live chat · ⌥⌘A', prs: 'The PRs at your move' };
  $('#log').addEventListener('click', e => {
    const r = e.target.closest('#home .hrow'); if (r) return openSession(r.dataset.id, { locate: true });
    if (e.target.closest('#home .hsea')) { if (!sea.leap && sea.s && !REDUCED.matches) seaLeap(performance.now()); return; }
    const g = e.target.closest('#home .hgo')?.dataset.go;
    if (g === 'ask') { const s = [...state.sessions.values()].filter(x => visible(x) && asking(x)).sort(byWord)[0]; if (s) openSession(s.id, { locate: true }); }
    else if (g === 'ov') ovOpen();
    else if (g === 'prs') pickOpen('prs');
    else if (g === 'tour') tourStart();
  });

