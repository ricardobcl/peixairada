// Settings › Updates & access › Board key (2026-10-16): whether the board's key is required yet, and a new one — asked
// once more, in a line under the row that says what it does, before it is made (a destructive action looks it).
function showKey() {
  const keyState = state.key;

  if (!keyState) return;
  $('#keyWord').textContent = keyState.required ? 'Required' : 'Not required yet';

  $('#keySay').textContent = keyState.required
    ? 'Every page and request carries the board’s key'
    : 'The board answers a request without it until the app opens with it';

  $('#keyReq').hidden = keyState.required;
}

$('#keyReq').onclick = event =>
  api('PUT', '/api/key')
    .then(keyState => {
      state.key = keyState;
      showKey();
    })
    .catch(err => note(event.target, err.message, true));

const keySure = on => {
  $('#keySure').hidden = !on;
  $('#keyNew').setAttribute('aria-expanded', String(on));
};

$('#keyNew').onclick = () => {
  keySure(true);
  $('#keyNo').focus();
};

$('#keyNo').onclick = () => {
  keySure(false);
  $('#keyNew').focus();
};

$('#keyYes').onclick = async event => {
  const button = event.currentTarget;

  try {
    const { key } = await api('POST', '/api/key/new');

    if (IN_APP && window.PEIX_KEY) post({ type: 'key' });
    else {
      takeKey(key);
      location.reload();
    }
  } catch (err) {
    note(button, `No new key: ${err.message}`, true);
  }
};

$('#lockGo').onclick = async () => {
  const say = $('#lockSay');

  say.classList.remove('err');

  try {
    await api('POST', '/api/key/open');
    say.textContent = "A tab with the key is opening in this Mac's browser — this one follows it.";
  } catch (err) {
    say.classList.add('err');
    say.textContent = err.message;
  }
};

$('#lockApp').onclick = () => post({ type: 'key' });
$('#lock').addEventListener('cancel', event => event.preventDefault()); // nothing behind it to go back to

$('#updBtn').addEventListener('click', event => {
  const button = event.currentTarget;
  const apply = button.dataset.apply === '1';

  updAsked = Date.now();
  button.disabled = true;

  api('POST', '/api/update', { apply })
    .then(takeUpdate)
    .catch(err => {
      showUpdate();
      note(button, `Could not look: ${err.message}`, true);
    });
});
