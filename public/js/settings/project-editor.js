// ---- project editor ----------------------------------------------------------------
function openProjectEditor(id) {
  const p = id ? state.projects.find(x => x.id === id) : null;
  const dlg = $('#pdlg');

  dlg.dataset.id = id || '';
  $('#pdlgTitle').textContent = p ? `Edit “${p.name}”` : 'New project';
  $('#pname').value = p?.name || '';
  $('#perr').textContent = '';

  const known = knownFolders();
  const chosen = new Set(p?.cwds || []);

  $('#pfolders').innerHTML =
    known
      .map(
        f =>
          `<label><input type="checkbox" value="${esc(f)}"${chosen.has(f) ? ' checked' : ''}> <b>${esc(folderName(f))}</b> <span>${esc(f)}</span></label>`,
      )
      .join('') || '<div class="none">No folders known yet</div>';

  $('#pextra').value = [...chosen].filter(f => !known.includes(f)).join('\n');
  $('#pdel').hidden = !p;
  dlg.showModal();
  repostPane();
  $('#pname').focus();
}

let projectSaving = false; // ⏎ twice, or a double click on Save, made the project twice

async function saveProject() {
  const dlg = $('#pdlg');
  const id = dlg.dataset.id;

  const name = $('#pname').value.trim();

  if (!name) {
    $('#pname').focus();
    return;
  }

  if (projectSaving) return;
  const cwds = [...$('#pfolders').querySelectorAll('input:checked')].map(i => i.value);

  cwds.push(
    ...$('#pextra')
      .value.split('\n')
      .map(x => x.trim())
      .filter(Boolean),
  );

  let d;

  projectSaving = true;

  try {
    d = await api(id ? 'PUT' : 'POST', id ? `/api/projects/${id}` : '/api/projects', {
      name,
      cwds: [...new Set(cwds)],
    });
  } catch (e) {
    $('#perr').textContent = e.message;
    return;
  } finally {
    projectSaving = false;
  }

  dlg.close();
  if (d.project) selectProject(`c:${d.project.id}`); // the `projects` event re-renders with it
}

async function deleteProject() {
  const id = $('#pdlg').dataset.id;

  if (!id) return;

  try {
    await api('DELETE', `/api/projects/${id}`);
  } catch (e) {
    $('#perr').textContent = e.message;
    return;
  }

  $('#pdlg').close();
  if (prefs.project === `c:${id}`) selectProject(ALL);
}

$('#psave').onclick = saveProject;
$('#pdel').onclick = deleteProject;
$('#pcancel').onclick = () => $('#pdlg').close();

$('#pname').addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    e.preventDefault();
    saveProject();
  }
});
