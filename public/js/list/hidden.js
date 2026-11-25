// Hiding is the pins' shape: the whole list each time, shown at once, the server confirms with a `hidden` event.
// A hidden project that is the selected one falls back to ALL on the next render (renderBoard does that already).
const setHidden = keys => {
  state.hidden = keys;
  renderBoard();
  api('PUT', '/api/hidden', { hidden: keys }).catch(e =>
    note($('#stitle'), `Could not save the hidden list: ${e.message}`, true),
  );
};
const hideProject = key => {
  if (key) setHidden([...state.hidden.filter(k => k !== key), key]);
};
const showProject = key => setHidden(state.hidden.filter(k => k !== key));
/** What a hidden key is called now: a named project by its name, a folder by its own and where it is. A named
 *  project deleted while hidden leaves a key nothing answers — it is still listed, so it can be let go. */
const hiddenLabel = key =>
  key.startsWith('c:')
    ? { name: state.projects.find(x => 'c:' + x.id === key)?.name || 'a project that is gone', where: '' }
    : { name: folderName(key), where: homePath(key) };
function renderHidden() {
  const box = $('#hidden');
  if (!box) return;
  $('#hiddenGrp').hidden = !state.hidden.length; // Settings › Projects › Hidden, there while something is (2026-10-16)
  const drew = setHtml(
    box,
    state.hidden
      .map(k => {
        const l = hiddenLabel(k);
        return `<div class="srow set hrow"><span class="pn" title="${esc(l.where || k)}"><b>${esc(l.name)}</b>${l.where ? `<small>${esc(l.where)}</small>` : ''}</span><button type="button" class="btn" data-key="${esc(k)}" title="Put it back on the board">Show</button></div>`;
      })
      .join(''),
  );
  if (drew && $('#settings').open) settingsFind();
}
$('#hidden').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (b) showProject(b.dataset.key);
});
