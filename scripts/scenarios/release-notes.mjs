// Releases on the page (2026-11-27): a board follows releases by default — Settings › Updates › Follow —, so a commit on
// main is no news but a line in the settings; a release is said by its name, in the status bar (*0.2 is out · update*)
// and the settings, its notes drawn there before it is taken; Every commit makes the commits past it the news again. The server's side is test/update-release.test.mjs; the
// checkout here is its throwaway one (test/update-project.mjs), the agent's restart a stand-in that writes it was asked.
import { PAGE, project } from '../../test/update-project.mjs';

const p = project();

export const meta = {
  server: true,
  env: { ...p.env, UPDATE_CHANNEL: 'releases', UPDATE_QUIET_MS: '0' },
};

export default async function (ctx) {
  const out = {};
  const row = () =>
    ctx.evaluate(
      `({ word: document.querySelector('#updWord').textContent, say: document.querySelector('#updSay').textContent, notes: document.querySelector('#updNotes').hidden ? null : document.querySelector('#updNotes').innerText, follow: [...document.querySelectorAll('#updFollow [aria-checked="true"]')].map(b => b.dataset.ch) })`,
    );
  const seg = () => ctx.evaluate(`document.querySelector('#sbLeft .upg')?.textContent ?? null`);
  const look = async what => {
    await ctx.evaluate(`document.querySelector('#updBtn').click()`);
    await ctx.waitFor(
      `!window.peix.update()?.busy && window.peix.update()?.checkedAt > ${JSON.stringify(new Date().toISOString())}`,
      { what },
    );
  };
  const rect = sel =>
    ctx.evaluate(
      `(r => ({ x: r.left, y: r.top, width: r.width, height: r.height }))(document.querySelector('${sel}').getBoundingClientRect())`,
    );

  // a commit, no release: Follow says Releases; the commit is a line, not the bar's news
  await ctx.cmd('Comma');
  await ctx.waitFor(`document.querySelector('#settings').open`, { what: 'the settings' });
  await ctx.evaluate(`document.querySelector('#stSystem').click()`);
  p.push({ 'public/index.html': PAGE + '<!-- a -->\n' }, 'a');
  await look('a look with a commit and no release');
  out.commit = { row: await row(), seg: await seg() };
  ctx.assert.deepEqual(out.commit.row.follow, ['releases'], 'releases by default');
  ctx.assert.equal(out.commit.row.word, 'Up to date');
  ctx.assert.match(out.commit.row.say, /^no release yet · 1 commit on origin\/main since, which Every commit takes/);
  ctx.assert.equal(out.commit.row.notes, null);
  ctx.assert.equal(out.commit.seg, null, 'no news in the bar');

  // a release: its name in the bar and the settings, its notes drawn before it is taken
  const r2 = p.release(
    '0.2.0',
    '### New\n\n- **Space** (⌥⌘X) shows every chat as a node, its agents round it.\n- **Pinned** keeps the chats you pin above the lanes.\n\n### Fixed\n\n- Links in a drawer open when clicked.\n',
  );
  await look('a look with a release');
  out.release = { row: await row(), seg: await seg() };
  ctx.assert.equal(out.release.row.word, '0.2 is out');
  ctx.assert.match(out.release.row.say, /^0\.2, 2 commits on origin\/main — Update now takes them/);
  ctx.assert.match(out.release.row.notes || '', /^0\.2\s+27 November 2026\s+new\s+Space \(⌥⌘X\) shows every chat/i);
  ctx.assert.equal(out.release.seg, '0.2 is out · update');
  ctx.assert.equal(await ctx.evaluate(`document.querySelector('#updNotes h3')?.textContent`), 'New', 'markdown, drawn');
  await ctx.evaluate(`document.querySelector('#updRow').scrollIntoView({ block: 'start' })`);
  await ctx.settle();
  await ctx.shot('1-settings-release', await rect('#settings'));

  // taken from the bar: the board moves to the release, no further
  await ctx.evaluate(`document.querySelector('#settings').close()`);
  await ctx.evaluate(`window.__mark = 1; document.querySelector('#sbLeft .upg[data-take]').click()`);
  await ctx.waitFor(`window.peix.update()?.running === '0.2.0'`, { what: 'the board on 0.2' });
  ctx.assert.equal(p.head(), r2, 'onto the release');
  await ctx.server.restart(); // what launchd.sh restart does: the same port, a new server
  // the page the update changed reloads once the new server answers
  await ctx.waitFor(`!window.__mark && window.peix?.state().snapshots > 0`, { what: 'the new page', timeout: 25_000 });

  // Every commit: the commits past the release are the news again
  const b = p.push({ 'public/index.html': PAGE + '<!-- b -->\n' }, 'b');
  await ctx.cmd('Comma');
  await ctx.waitFor(`document.querySelector('#settings').open`, { what: 'the settings again' });
  await ctx.evaluate(`document.querySelector('#stSystem').click()`);
  await look('a look on releases, a commit past it');
  ctx.assert.match((await row()).say, /^on 0\.2, the newest release · 1 commit on origin\/main since/);
  await ctx.evaluate(`document.querySelector('#updFollow [data-ch="main"]').click()`);
  await ctx.waitFor(`window.peix.update()?.channel === 'main' && !window.peix.update()?.busy`, {
    what: 'Every commit',
  });
  out.main = { row: await row(), seg: await seg(), up: await ctx.evaluate(`window.peix.update().up`) };
  ctx.assert.deepEqual(
    [out.main.row.follow, out.main.row.word, out.main.seg, out.main.up],
    [['main'], '1 new commit', '1 new commit · update', b],
  );
  ctx.assert.match(out.main.row.say, /^1 new commit on origin\/main — Update now takes them/);
  await ctx.shot('3-every-commit', await rect('#settings'));
  return out;
}
