// ---- project editor ----------------------------------------------------------------
function openProjectEditor(id) {
  const project = id ? state.projects.find(candidate => candidate.id === id) : null;
  const dlg = $('#pdlg');

  dlg.dataset.id = id || '';
  $('#pdlgTitle').textContent = project ? `Edit “${project.name}”` : 'New project';
  $('#pname').value = project?.name || '';
  $('#perr').textContent = '';

  const known = knownFolders();
  const chosen = new Set(project?.cwds || []);

  $('#pfolders').innerHTML =
    known
      .map(
        folder =>
          `<label><input type="checkbox" value="${esc(folder)}"${chosen.has(folder) ? ' checked' : ''}> <b>${esc(folderName(folder))}</b> <span>${esc(folder)}</span></label>`,
      )
      .join('') || '<div class="none">No folders known yet</div>';

  $('#pextra').value = [...chosen].filter(folder => !known.includes(folder)).join('\n');
  $('#pdel').hidden = !project;
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
  const cwds = [...$('#pfolders').querySelectorAll('input:checked')].map(input => input.value);

  cwds.push(
    ...$('#pextra')
      .value.split('\n')
      .map(line => line.trim())
      .filter(Boolean),
  );

  let result;

  projectSaving = true;

  try {
    result = await api(id ? 'PUT' : 'POST', id ? `/api/projects/${id}` : '/api/projects', {
      name,
      cwds: [...new Set(cwds)],
    });
  } catch (error) {
    $('#perr').textContent = error.message;
    return;
  } finally {
    projectSaving = false;
  }

  dlg.close();
  if (result.project) selectProject(`c:${result.project.id}`); // the `projects` event re-renders with it
}

async function deleteProject() {
  const id = $('#pdlg').dataset.id;

  if (!id) return;

  try {
    await api('DELETE', `/api/projects/${id}`);
  } catch (error) {
    $('#perr').textContent = error.message;
    return;
  }

  $('#pdlg').close();
  if (prefs.project === `c:${id}`) selectProject(ALL);
}

$('#psave').onclick = saveProject;
$('#pdel').onclick = deleteProject;
$('#pcancel').onclick = () => $('#pdlg').close();

$('#pname').addEventListener('keydown', event => {
  if (event.key === 'Enter') {
    event.preventDefault();
    saveProject();
  }
});
