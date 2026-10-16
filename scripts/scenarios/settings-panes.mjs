// The settings as a sidebar and a search box (2026-10-16, the settings study's B): seven panes by task, the box with the
// keys as the dialog opens, each pane alone in front and named in the head, ↑ ↓ down the sidebar. What a search shows:
// the rows whose words hold every word typed, under their pane's name, the sidebar counting them, the words marked; a
// word nothing holds says so; Esc lets the search go before it closes the dialog, and the keys go back to whatever had
// them; the pane last shown is in front again, after a reload too. The sidebar's foot opens the keys sheet; the Hidden group is there only while something is hidden. The drawer's
// screen-reader mode follows VoiceOver, which the app says.
export const meta = { server: true, fixture: 'auto' };

export default async function (ctx) {
  const out = {};
  const look = () => ctx.evaluate(`JSON.stringify({
    open: document.querySelector('#settings').open, focus: document.activeElement?.id || document.activeElement?.tagName,
    title: document.querySelector('#spTitle').textContent,
    panes: [...document.querySelectorAll('#settings .spane')].filter(p => !p.hidden).map(p => p.dataset.tab),
    rows: [...document.querySelectorAll('#settings .spane:not([hidden]) .srow:not(.nomatch)')].filter(r => r.getClientRects().length).map(r => r.querySelector('.sl b, .pn b, kbd')?.textContent.trim() || r.className),
    counts: Object.fromEntries([...document.querySelectorAll('#settings .stabs [data-tab]')].map(b => [b.dataset.tab, (b.classList.contains('dim') ? '-' : '') + b.querySelector('.sn').textContent])),
    marks: window.CSS?.highlights?.get('sfind')?.size ?? null, none: document.querySelector('#snone').hidden ? null : document.querySelector('#snone').textContent,
  })`).then(JSON.parse);
  const find = q => ctx.evaluate(`(i => { i.value = ${JSON.stringify(q)}; i.dispatchEvent(new Event('input', { bubbles: true })); })(document.querySelector('#sq'))`);
  const esc = () => ctx.evaluate(`(() => { const e = new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }); document.activeElement.dispatchEvent(e); return e.defaultPrevented; })()`);
  const box = () => ctx.evaluate(`(r => ({ x: r.left, y: r.top, width: r.width, height: r.height }))(document.querySelector('#settings').getBoundingClientRect())`);

  // ⌘, from a control that has the keys: the search box takes them, General in front
  await ctx.evaluate(`document.querySelector('#fBtn').focus()`);
  await ctx.cmd('Comma');
  await ctx.waitFor(`document.querySelector('#settings').open`, { what: 'the settings' });
  await ctx.settle();
  out.opened = await look();
  ctx.assert.deepEqual([out.opened.focus, out.opened.title, out.opened.panes], ['sq', 'General', ['general']], 'the box has the keys, General in front');
  ctx.assert.deepEqual(out.opened.rows, ['Notifications', 'Sounds', 'Open files in'], 'General\'s rows (full screen is the app\'s)');
  await ctx.shot('1-general', await box());

  // each pane alone, named in the head; ↓ from a tab walks to the next
  out.panes = {};
  for (const t of ['look', 'list', 'term', 'setup', 'jira', 'system']) {
    await ctx.evaluate(`document.querySelector('#settings .stabs [data-tab="${t}"]').click()`);
    const l = await look(); out.panes[t] = { title: l.title, rows: l.rows.length };
    ctx.assert.deepEqual(l.panes, [t], `${t} alone`);
  }
  ctx.assert.deepEqual(Object.values(out.panes).map(p => p.title), ['Appearance', 'Chat list', 'Terminal', 'Projects', 'Jira', 'Updates & access']);
  await ctx.evaluate(`document.querySelector('#settings .stabs [data-tab="list"]').focus()`);
  await ctx.evaluate(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }))`);
  out.down = await look();
  ctx.assert.deepEqual([out.down.panes, out.down.focus], [['term'], 'stTerm'], '↓ is the next pane, with the keys');
  ctx.assert.equal(await ctx.evaluate(`document.querySelector('#hiddenGrp').hidden`), true, 'nothing hidden: no Hidden group');

  // a search: every pane's matches under its name, counted in the sidebar, the words marked
  await ctx.evaluate(`document.querySelector('#sq').focus()`);
  await find('notif');
  out.notif = await look();
  ctx.assert.deepEqual([out.notif.title, out.notif.panes, out.notif.rows], ['Results for “notif”', ['general'], ['Notifications']]);
  ctx.assert.deepEqual(out.notif.counts, { general: '1', look: '-', list: '-', term: '-', setup: '-', jira: '-', system: '-' }, 'counted, the rest dimmed');
  ctx.assert.ok(out.notif.marks > 0, `the words marked: ${out.notif.marks}`);
  await find('same height');
  out.dependent = await look();
  ctx.assert.deepEqual([out.dependent.panes, out.dependent.rows], [['list'], ['Same height']], 'a dependent row found by its own words');
  await find('memory');
  out.meters = await look();
  ctx.assert.deepEqual(out.meters.rows, ['Show in the status bar'], 'a row found by its controls\' words');
  await find('key');
  out.key = await look();
  ctx.assert.ok(out.key.panes.includes('system') && out.key.rows.includes('Required') && out.key.rows.includes('New key'), `the board's key: ${JSON.stringify(out.key)}`);
  await ctx.settle();
  await ctx.shot('2-search', await box());
  await find('zzzz');
  out.nothing = await look();
  ctx.assert.deepEqual([out.nothing.panes, out.nothing.none], [[], 'No setting matches “zzzz”.']);

  // Esc: the search first, then the dialog — and the keys back where they were
  out.esc1 = { taken: await esc(), ...(await look()) };
  ctx.assert.deepEqual([out.esc1.taken, out.esc1.open, out.esc1.panes, out.esc1.title], [true, true, ['term'], 'Terminal'], 'Esc lets the search go, the pane before it in front');
  out.esc2 = { taken: await esc() };
  await ctx.waitFor(`!document.querySelector('#settings').open`, { what: 'the settings closed' });
  await ctx.sleep(50);
  out.esc2.focus = await ctx.evaluate(`document.activeElement?.id`);
  ctx.assert.deepEqual(out.esc2, { taken: true, focus: 'fBtn' }, 'closed, and the keys back on the funnel');

  // the sidebar's foot: the keys sheet, the settings closed first
  await ctx.cmd('Comma');
  await ctx.waitFor(`document.querySelector('#settings').open`, { what: 'the settings again' });
  ctx.assert.equal(await ctx.evaluate(`document.querySelector('#spTitle').textContent`), 'Terminal', 'the pane in front kept while the page lives');
  await ctx.evaluate(`document.querySelector('#keysBtn').click()`);
  await ctx.waitFor(`document.querySelector('#keysheet').open && !document.querySelector('#settings').open`, { what: 'the keys sheet instead' });
  await ctx.evaluate(`document.querySelector('#keysheet').close()`);

  // Terminal › Screen reader mode follows VoiceOver (2026-10-16): the app says so (peixVoiceOver), the switch on and off
  // with why while it runs, the pref untouched; without it the switch is the pref
  const reader = () => ctx.evaluate(`(r => ({ on: r.querySelector('input').checked, off: r.querySelector('input').disabled && r.classList.contains('off'), say: r.querySelector('small').textContent }))(document.querySelector('#termReader').closest('.srow'))`);
  out.reader = { browser: await reader() };
  ctx.assert.deepEqual(out.reader.browser, { on: false, off: false, say: 'The drawer’s lines read out as they come' });
  await ctx.evaluate(`window.peixVoiceOver(true)`);
  out.reader.vo = await reader();
  ctx.assert.deepEqual(out.reader.vo, { on: true, off: true, say: 'On while VoiceOver runs' }, 'on, and off with why, while VoiceOver runs');
  ctx.assert.equal((await ctx.peix('prefs()')).termReader, false, 'the pref untouched');
  await ctx.evaluate(`window.peixVoiceOver(false)`);
  ctx.assert.deepEqual((await reader()).on, false, 'VoiceOver gone: the switch as it was');

  // Jira with no token: its line says where to paste one, from where it says it (the settings' Setup, before)
  await ctx.server.api('api/config', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jira: { site: 'https://acme.atlassian.net', email: 'ada@acme.dev' } }) });
  await ctx.cmd('Comma');
  await ctx.waitFor(`document.querySelector('#settings').open`, { what: 'the settings, for Jira' });
  await ctx.evaluate(`document.querySelector('#settings .stabs [data-tab="jira"]').click()`);
  await ctx.waitFor(`/no API token/.test(document.querySelector('#jiraSet .sjst')?.textContent || '')`, { what: 'Jira\'s line, no token' });
  ctx.assert.equal(await ctx.evaluate(`document.querySelector('#jiraSet .sjst').textContent`), 'no API token yet — paste one in the box above');
  await ctx.cmd('Comma');

  // a new key is asked once more, in a line under its row that says what it does; the button keeps its name
  await ctx.cmd('Comma');
  await ctx.waitFor(`document.querySelector('#settings').open`, { what: 'the settings, for the key' });
  await ctx.evaluate(`document.querySelector('#settings .stabs [data-tab="system"]').click()`);
  await ctx.evaluate(`document.querySelector('#keyNew').click()`);
  out.sure = await ctx.evaluate(`({ shown: !document.querySelector('#keySure').hidden, say: document.querySelector('#keySureSay').textContent, label: document.querySelector('#keyNew').textContent, focus: document.activeElement?.id })`);
  ctx.assert.deepEqual(out.sure, { shown: true, say: 'Every browser loses the board until it has the new key, from a tab the board opens.', label: 'New key…', focus: 'keyNo' });
  await ctx.settle(); await ctx.shot('3-new-key', await box());
  await ctx.evaluate(`document.querySelector('#keyNo').click()`);
  ctx.assert.deepEqual(await ctx.evaluate(`[document.querySelector('#keySure').hidden, document.activeElement?.id]`), [true, 'keyNew'], 'Cancel: nothing made, the keys back on the button');
  await ctx.cmd('Comma');

  // the pane last shown, after a reload too (2026-10-16, prefs.settingsPane)
  await ctx.reload();
  await ctx.cmd('Comma');
  await ctx.waitFor(`document.querySelector('#settings').open`, { what: 'the settings after a reload' });
  ctx.assert.deepEqual(await ctx.evaluate(`[document.querySelector('#spTitle').textContent, document.querySelector('#settings .stabs .on')?.dataset.tab, document.activeElement?.id]`), ['Updates & access', 'system', 'sq'], 'the pane last shown again, its tab lit, the box with the keys');
  await ctx.cmd('Comma');
  return out;
}
