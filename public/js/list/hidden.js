// Hiding is the pins' shape: the whole list each time, shown at once, the server confirms with a `hidden` event.
// A hidden project that is the selected one falls back to ALL on the next render (renderBoard does that already).
const setHidden = keys => {
  state.hidden = keys;
  renderBoard();

  api('PUT', '/api/hidden', { hidden: keys }).catch(error =>
    note($('#stitle'), `Could not save the hidden list: ${error.message}`, true),
  );
};

const hideProject = key => {
  if (key) setHidden([...state.hidden.filter(hiddenKey => hiddenKey !== key), key]);
};

const showProject = key => setHidden(state.hidden.filter(hiddenKey => hiddenKey !== key));

/** What a hidden key is called now: a named project by its name, a folder by its own and where it is. A named
 *  project deleted while hidden leaves a key nothing answers — it is still listed, so it can be let go. */
const hiddenLabel = key =>
  key.startsWith('c:')
    ? { name: state.projects.find(project => `c:${project.id}` === key)?.name || 'a project that is gone', where: '' }
    : { name: folderName(key), where: homePath(key) };

function renderHidden() {
  const box = $('#hidden');

  if (!box) return;
  $('#hiddenGrp').hidden = !state.hidden.length; // Settings › Projects › Hidden, there while something is (2026-10-16)

  const drew = setHtml(
    box,
    state.hidden
      .map(key => {
        const label = hiddenLabel(key);

        return `<div class="srow set hrow"><span class="pn" title="${esc(label.where || key)}"><b>${esc(label.name)}</b>${label.where ? `<small>${esc(label.where)}</small>` : ''}</span><button type="button" class="btn" data-key="${esc(key)}" title="Put it back on the board">Show</button></div>`;
      })
      .join(''),
  );

  if (drew && $('#settings').open) settingsFind();
}

$('#hidden').addEventListener('click', event => {
  const button = event.target.closest('button');

  if (button) showProject(button.dataset.key);
});
