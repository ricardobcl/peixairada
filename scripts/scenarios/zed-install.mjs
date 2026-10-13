// Zed installed when it is picked (2026-10-13): with no Zed.app among the server's apps (every test server's own folder),
// picking Zed in Settings › Board › editor runs the server's `brew install --cask zed` — scripts/fakebrew.mjs, its
// lines spaced here so the install can be seen —, the line under the pick says how far it is, ··· 's folder in Zed
// meanwhile says Zed is still coming rather than open a URL nothing answers, and once the app is there the install's
// words go — what Zed is not (in the pane) stays — and the row opens the folder in Zed.
export const meta = { server: true, fake: true, fixture: 'auto', env: { FAKE_BREW_MS: '700' } };

const E = `document.querySelector('#zedBtn').click()`;
// ··· 's folder in Zed with the browser's ways out caught: what it would have opened
const opened = `(() => {
  const seen = [], click = HTMLAnchorElement.prototype.click, open = window.open;
  HTMLAnchorElement.prototype.click = function () { seen.push(this.href); };
  window.open = u => { seen.push('window.open ' + u); };
  try { ${E}; } finally { HTMLAnchorElement.prototype.click = click; window.open = open; }
  return JSON.stringify(seen);
})()`;

export default async function (ctx) {
  const out = {};
  const s = ctx.fixture.chats[0];
  await ctx.openChat(s.id);
  out.before = await ctx.peix('state().editors');
  ctx.assert.deepEqual(out.before.zed, { app: null, brew: true, installing: false, line: null, error: null }, 'no Zed among the apps, brew there to install it');

  await ctx.evaluate(`document.querySelector('#settingsBtn').click()`);
  await ctx.evaluate(`document.querySelector('#edPick [data-ed="zed"]').click()`);
  await ctx.waitFor(`/installing Zed with Homebrew/.test(document.querySelector('#edSay').textContent) && /Downloading|Installing Cask/.test(document.querySelector('#edSay').textContent)`, { what: 'the line under the pick: installing, and brew\'s own step' });
  await ctx.settle();
  await ctx.evaluate(`document.querySelector('#edSay').scrollIntoView({ block: 'center' })`);
  await ctx.shot('installing');
  out.installing = await ctx.evaluate(`document.querySelector('#edSay').textContent`);

  await ctx.evaluate(`document.querySelector('#settings').close()`);
  await ctx.settle();
  out.early = JSON.parse(await ctx.evaluate(opened));
  ctx.assert.deepEqual(out.early, [], 'nothing opened while Zed is not there');
  out.note = await ctx.evaluate(`document.querySelector('.note.err')?.textContent || ''`);
  ctx.assert.match(out.note, /Zed is still being installed/, '…it says so instead');

  await ctx.waitFor(`!!window.peix.state().editors?.zed?.app && !/install/.test(document.querySelector('#edSay').textContent)`, { timeout: 15_000, what: 'Zed installed, and the install\'s words gone' });
  ctx.assert.match(await ctx.evaluate(`document.querySelector('#edSay').textContent`), /^Zed opens in its own window, outside the board/, '…what Zed is not stays');
  out.after = await ctx.peix('state().editors');
  ctx.assert.match(out.after.zed.app, /\/apps\/Zed\.app$/);
  out.e = JSON.parse(await ctx.evaluate(opened));
  ctx.assert.deepEqual(out.e, [`zed://file${s.cwd}`], 'the row opens the folder in Zed now');
  return out;
}
