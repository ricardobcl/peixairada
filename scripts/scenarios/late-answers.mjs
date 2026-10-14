// What a chat was opened for is done on that chat or not at all (2026-10-14): the launcher's PR row opened the chat,
// waited for its transcript, then opened the PR — on whichever chat was open by then; Rename… opened the title box in
// that chat's header, and a blur renamed the first chat to the second's title. What this checks, with the chat's
// /messages answer held back by the page's fetch while another chat is opened: the PR row opens no PR, Rename… no box.
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = mkdtempSync(join(tmpdir(), 'peix-late-gh-')), file = join(dir, 'prs.json');
writeFileSync(file, JSON.stringify({ 'acme/repo-a#12': { state: 'OPEN', title: 'Base of the follow-up' }, 'acme/repo-a#13': { state: 'OPEN', title: 'The follow-up' } }));
export const meta = { server: true, fixture: 'auto', env: { GH_BIN: fileURLToPath(new URL('../fakegh.mjs', import.meta.url)), FAKEGH_PRS: file } };

export default async function (ctx) {
  const out = {}, [two, plain] = ctx.fixture.chats;   // the first names repo-a#12 and #13
  const card = id => `document.querySelector('#slist > .card[data-id="${id}"]')`;
  await ctx.waitFor(`${card(two.id)}?.querySelectorAll('.cpr[data-url]').length === 2`, { timeout: 10_000, what: 'the card with its two PRs' });
  await ctx.openChat(plain.id);
  // the first chat's transcript held on its way until let go; a page opened in a browser is window.open, counted
  await ctx.evaluate(`(() => {
    const real = window.fetch; window.__opened = [];
    window.open = u => { window.__opened.push(String(u)); return null; };
    window.__arm = () => { window.__held = 0; window.__hold = new Promise(r => { window.__release = r; }); };
    window.__arm();
    window.fetch = async (url, o) => {
      const r = await real(url, o);
      if (!String(url).includes(${JSON.stringify(`/api/sessions/${two.id}/messages`)})) return r;
      window.__held++; const body = await r.text(); await window.__hold; return new Response(body, { status: r.status, headers: r.headers });
    };
  })()`);

  // ⌥⌘L's PR row: its chat asked for, another opened meanwhile — no PR opened on that one
  await ctx.key('KeyL');
  await ctx.waitFor(`document.querySelector('#pick').open`, { what: 'the launcher' });
  await ctx.fill('#pickq', '#13');
  await ctx.waitFor(`document.querySelector('#picklist .pkrow.pr.sel')`, { what: 'the PR row' });
  await ctx.evaluate(`document.querySelector('#pickq').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))`);
  await ctx.waitFor(`window.__held === 1 && window.peix.state().current === '${two.id}'`, { what: 'the PR row’s chat asked for' });
  await ctx.openChat(plain.id);
  await ctx.evaluate(`window.__release()`);
  await ctx.sleep(600);
  out.opened = await ctx.evaluate(`window.__opened`);
  ctx.assert.deepEqual(out.opened, [], 'no PR opened over the chat open now');
  ctx.assert.equal(await ctx.evaluate(`window.peix.state().current`), plain.id, 'and that chat still open');

  // Rename… from the card's menu, the same way: no title box in the other chat's header
  await ctx.evaluate(`window.__arm()`);
  await ctx.evaluate(`(el => { const r = el.getBoundingClientRect(); el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 8, clientY: r.top + 8 })); })(${card(two.id)}.querySelector('.title'))`);
  await ctx.waitFor(`document.querySelector('#ctxm').open`, { what: 'the card’s menu' });
  await ctx.evaluate(`[...document.querySelectorAll('#ctxm button')].find(b => b.textContent === 'Rename…').click()`);
  await ctx.waitFor(`window.__held === 1 && window.peix.state().current === '${two.id}'`, { what: 'Rename…’s chat asked for' });
  await ctx.openChat(plain.id);
  await ctx.evaluate(`window.__release()`);
  await ctx.sleep(600);
  out.box = await ctx.evaluate(`!!document.querySelector('#shead h2 input.tedit')`);
  ctx.assert.equal(out.box, false, 'no title box in the header of the chat open now');
  return out;
}
