// Zé's face in Settings (2026-10-30, later): Choose… opens the file chooser; the picture comes up in the frame, the oval
// over it; a drag moves it, the slider zooms, the arrows move it; Use it keeps only the oval's box — 200 × 264, what the
// oval showed — and the row's thumbnail and the game wear it; the game's foot opens Settings on the row; Remove lets it go.
// The picture: a green band on top, red under it on the left, blue on the right — so what was kept says where the oval was.
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpDir } from '../../lib/testserver.mjs';

export const meta = { server: true };

export default async function (ctx) {
  const out = {}, face = join(ctx.server.dir, 'ze.png');
  await ctx.waitFor(`window.peix.state().snapshots > 0`, { what: 'the board' });
  const src = join(tmpDir('peix-face-'), 'band.png');
  const url = await ctx.evaluate(`(() => { const c = document.createElement('canvas'); c.width = 400; c.height = 300; const x = c.getContext('2d');
    x.fillStyle = '#ff0000'; x.fillRect(0, 0, 200, 300); x.fillStyle = '#0000ff'; x.fillRect(200, 0, 200, 300); x.fillStyle = '#00ff00'; x.fillRect(0, 0, 400, 100); return c.toDataURL('image/png'); })()`);
  writeFileSync(src, Buffer.from(url.split(',')[1], 'base64'));
  // the file chooser is the harness's: Choose… must open it, and the picture goes in through it
  await ctx.send('Page.setInterceptFileChooserDialog', { enabled: true });
  let chooser = null; ctx.on('Page.fileChooserOpened', e => { chooser = e; });
  const choose = async () => {
    chooser = null;
    await ctx.evaluate(`document.querySelector('#zeFaceRow').scrollIntoView({ block: 'center' })`);
    const b = await ctx.evaluate(`(r => ({ x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }))(document.querySelector('#zeFaceChoose').getBoundingClientRect())`);
    for (const type of ['mousePressed', 'mouseReleased']) await ctx.send('Input.dispatchMouseEvent', { type, x: b.x, y: b.y, button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1 });   // a hand's click: a page may open the chooser only on one
    for (let i = 0; i < 50 && !chooser; i++) await ctx.sleep(100);
    ctx.assert.ok(chooser, 'Choose… opened the file chooser');
    await ctx.send('DOM.setFileInputFiles', { files: [src], backendNodeId: chooser.backendNodeId });
    await ctx.waitFor(`!document.querySelector('#zeFrame').hidden`, { what: 'the frame' });
    await ctx.evaluate(`document.querySelector('#zeFrame').scrollIntoView({ block: 'center' })`);
  };
  // what was kept, read back: its size and the colour at a point of it
  const kept = () => ctx.evaluate(`(async () => { const d = await fetch('/api/ze', { headers: { 'x-peix-key': window.PEIX_KEY } }).then(r => r.json()); if (!d.face) return null;
    const im = new Image(); im.src = d.face; await im.decode(); const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const x = c.getContext('2d'); x.drawImage(im, 0, 0);
    const at = (px, py) => { const p = x.getImageData(px, py, 1, 1).data; return p[1] > 200 ? 'green' : p[0] > 200 ? 'red' : p[2] > 200 ? 'blue' : p.join(); };
    return { w: im.width, h: im.height, mid: at(100, 132), top: at(100, 4) }; })()`);

  // ⌘, — General has the row: no face yet
  await ctx.cmd('Comma');
  await ctx.waitFor(`document.querySelector('#settings').open && !document.querySelector('#zeFaceRow').closest('.spane').hidden`, { what: 'Settings › General' });
  ctx.assert.equal(await ctx.evaluate(`document.querySelector('#zeThumb').hidden && document.querySelector('#zeFaceDrop').hidden && document.querySelector('#zeFaceChoose').textContent`), 'Choose…');

  // the picture, the oval on the line between red and blue; a drag of 60 px to the right puts the red under it
  await choose();
  await ctx.settle(); await ctx.shot('1-frame');
  const r = await ctx.evaluate(`(r => ({ x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }))(document.querySelector('#zeFrameView').getBoundingClientRect())`);
  await ctx.drag('#zeFrameView', { x: r.x + 60, y: r.y });
  await ctx.shot('2-dragged');
  await ctx.evaluate(`document.querySelector('#zeFrameUse').click()`);
  await ctx.waitFor(`!document.querySelector('#zeThumb').hidden && document.querySelector('#zeFrame').hidden`, { what: 'the face kept' });
  out.first = await kept();
  ctx.assert.deepEqual(out.first, { w: 200, h: 264, mid: 'red', top: 'green' }, 'the oval\'s box: red under its middle, the green band at its top (no zoom)');
  ctx.assert.ok(existsSync(face), 'beside the setup file');
  ctx.assert.equal(await ctx.evaluate(`document.querySelector('#zeFaceChoose').textContent`), 'Change…');

  // again: zoomed in (the slider), then walked right with the arrows — the oval over the blue, no green in it
  await choose();
  await ctx.evaluate(`(() => { const z = document.querySelector('#zeZoom'); z.value = 6; z.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await ctx.evaluate(`document.querySelector('#zeFrameView').focus()`);
  for (let i = 0; i < 20; i++) {
    await ctx.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowLeft', code: 'ArrowLeft', windowsVirtualKeyCode: 37 });
    await ctx.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowLeft', code: 'ArrowLeft', windowsVirtualKeyCode: 37 });
  }
  await ctx.evaluate(`document.querySelector('#zeFrameUse').click()`);
  await ctx.waitFor(`document.querySelector('#zeFrame').hidden`, { what: 'the second face kept' });
  out.second = await kept();
  ctx.assert.deepEqual(out.second, { w: 200, h: 264, mid: 'blue', top: 'blue' }, 'zoomed: the band out of the oval; the arrows: the picture moved left, the blue under it');
  // Cancel keeps the face as it was
  await choose();
  await ctx.evaluate(`document.querySelector('#zeFrameNo').click()`);
  ctx.assert.equal(await ctx.evaluate(`document.querySelector('#zeFrame').hidden`), true);
  ctx.assert.deepEqual(await kept(), out.second, 'Cancel: nothing kept');
  await ctx.settle(); await ctx.shot('3-row');

  // the game wears it; its foot opens Settings on the row
  await ctx.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await ctx.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await ctx.waitFor(`!document.querySelector('#settings').open`, { what: 'Settings closed' });
  await ctx.key('KeyZ');
  await ctx.waitFor(`window.peix.ze().face?.width === 200`, { what: 'the game wearing the face' });
  await ctx.evaluate(`document.querySelector('#zeFaceGo').click()`);
  await ctx.waitFor(`!document.querySelector('#zeGame').open && document.querySelector('#settings').open && document.querySelector('#zeFaceRow').classList.contains('sflash')`, { what: 'Settings on the row' });

  // Remove: gone from the row, the disk and the game
  await ctx.evaluate(`document.querySelector('#zeFaceDrop').click()`);
  await ctx.waitFor(`document.querySelector('#zeThumb').hidden && document.querySelector('#zeFaceDrop').hidden`, { what: 'the face removed' });
  ctx.assert.equal(existsSync(face), false);
  await ctx.evaluate(`document.querySelector('#settings').close()`);
  await ctx.key('KeyZ');
  await ctx.waitFor(`document.querySelector('#zeGame').open`, { what: 'the game again' });
  await ctx.waitFor(`!window.peix.ze().face`, { what: 'no face: the drawn one' });
  await ctx.sleep(300); await ctx.shot('4-drawn');
  return out;
}
