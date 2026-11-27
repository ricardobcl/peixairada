// ---- alerts --------------------------------------------------------------------------
// No in-page toast: alerts surface as the unread badge on the card and its project plus a *system*
// notification (the Mac app posts its own; a plain browser gets the Notification API one below).
// Sounds (2026-10-11, Tweetbot's; Settings → Board → *sounds*, prefs.sounds, off by default): an alert that comes while
// the board is the window in front — where no notification shows — is heard: a soft tick for a reply or a PR come
// round, two rising notes for a question. Web Audio, two oscillators each; the context is made on a press or a key
// (a page may not start sound by itself) and the switch's own change, which plays the tick to hear it.
// It rests between sounds (2026-10-15): a context left running renders silence for as long as the board is shown — a
// real-time thread in the web process and another in the GPU process, and coreaudiod holding the Mac from idle sleep
// while the output runs. Suspended AUDIO_REST_MS after it last ran, resumed for the next sound: once a press has
// started it, a context may start again without one (`ran`).
const AUDIO_REST_MS = 1500;
let audio = null;

const audioRest = () => {
  clearTimeout(audioRest.t);

  audioRest.t = setTimeout(() => {
    if (audio?.state === 'running') audio.suspend().catch(() => {});
  }, AUDIO_REST_MS);
};

const audioUp = () => {
  if (!prefs.sounds) return null;

  try {
    if (!audio) {
      audio = new (window.AudioContext || window.webkitAudioContext)();

      audio.onstatechange = () => {
        if (audio.state === 'running') {
          audio.ran = true;
          audioRest();
        }
      };

      if (audio.state === 'running') {
        audio.ran = true;
        audioRest();
      }
    }
  } catch {
    audio = null;
    return null;
  }

  if (!audio.ran && audio.state === 'suspended') audio.resume().catch(() => {}); // not started yet: a press may start it
  return audio;
};

for (const ev of ['pointerdown', 'keydown']) document.addEventListener(ev, audioUp, { capture: true, passive: true });

function tone(frequency, t0, dur, type, vol) {
  const oscillator = audio.createOscillator();
  const envelope = audio.createGain();

  oscillator.type = type;
  oscillator.frequency.value = frequency;
  envelope.gain.setValueAtTime(0.0001, t0);
  envelope.gain.exponentialRampToValueAtTime(vol, t0 + 0.006);
  envelope.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  oscillator.connect(envelope).connect(audio.destination);
  oscillator.start(t0);
  oscillator.stop(t0 + dur + 0.02);
}

const CHIME_GAP_MS = 1200;

function chime(kind) {
  if (!prefs.sounds || !audio?.ran) return;

  // one voice at a time (S6): a burst of landings is one tick; a question is always heard
  const now = performance.now();
  const asks = kind === 'needs-input' || kind === 'drift';

  if (!asks && now - (chime.at || 0) < CHIME_GAP_MS) return;
  chime.at = now;

  const play = () => {
    noteMotion(null, `sound:${kind}`);
    const startAt = audio.currentTime + 0.02;

    if (kind === 'needs-input' || kind === 'drift' || kind === 'agent-failed') {
      tone(784, startAt, 0.15, 'triangle', 0.09);
      tone(1174.7, startAt + 0.14, 0.22, 'triangle', 0.09);
    } else {
      tone(1318.5, startAt, 0.18, 'sine', 0.08);
      tone(659.3, startAt, 0.26, 'sine', 0.05);
    }

    audioRest();
  };

  if (audio.state === 'running') play();
  else audio.resume().then(play, () => {});
}

$('#soundsOn').checked = !!prefs.sounds;

$('#soundsOn').addEventListener('change', event => {
  prefs.sounds = event.target.checked;
  savePrefs();
  if (audioUp()) setTimeout(() => chime('reply'), 30);
});

function onAlert(alert) {
  if (alert.kind === 'chat') return chatAlert(alert); // the chat's (2026-10-17): its own rules
  if (alert.kind === 'lunch') return lunchAlert(alert); // lunch's (2026-10-18)

  const viewing =
    alert.sessionId &&
    alert.sessionId === state.current &&
    document.visibilityState === 'visible' &&
    document.hasFocus();

  const as = alert.sessionId ? state.sessions.get(alert.sessionId) : null;

  if (fishing.until && (alert.kind === 'reply' || alert.kind === 'pr' || alert.kind === 'back')) {
    alert = { ...alert, quiet: true, held: true };
  } // gone fishing (M4): it counts, and says nothing yet
  else if (prioFocus() && as && !inPrio(as) && alert.kind !== 'needs-input') {
    alert = { ...alert, quiet: true, held: true };
  } // in focus, the rest says nothing yet but its questions (2026-11-24, round XXX's F3)

  if (
    !viewing &&
    !alert.held &&
    !alert.muted &&
    !alert.snoozed &&
    !(as && asleep(as)) &&
    document.visibilityState === 'visible' &&
    document.hasFocus()
  ) {
    chime(alert.kind);
  } // in front: heard rather than shown; not the chat you are looking at (2026-11-01, round XIX's S6)

  if (alert.sessionId && !viewing && !(as && asleep(as))) {
    state.unread.set(alert.sessionId, (state.unread.get(alert.sessionId) || 0) + 1);
  } // a snoozed chat counted nowhere (W4)

  if (viewing && alert.kind === 'reply') markSeen(alert.sessionId);
  renderBoard();

  // the badge that just came, or grew, pops in — a one-shot on the node the render made
  const badge =
    alert.sessionId &&
    !viewing &&
    !REDUCED.matches &&
    document.querySelector(`#slist > .card[data-id="${alert.sessionId}"] .badge`);

  if (badge) {
    noteMotion(alert.sessionId, 'pop');

    badge.animate(
      [
        { transform: 'scale(.5)', opacity: 0 },
        { transform: 'none', opacity: 1 },
      ],
      { duration: 380, easing: SPRING, id: 'pop' },
    );
  }

  if (inApp) {
    post({
      type: 'alert',
      kind: alert.kind,
      heading: alert.heading || '',
      project: alert.project || '',
      title: alert.title || '',
      snippet: alert.snippet || '',
      sessionId: alert.sessionId || '',
      hash: alert.kind === 'pr' && alert.url && alert.sessionId ? tvSoloHash(alert.sessionId, alert.url) : '',
      serverNotify: !!state.serverNotify,
      quiet: !!alert.quiet,
      at: alert.ts || '', // a reply from its banner is for this turn alone (peixReply)
      drawer: !!(
        alert.sessionId &&
        state.sessions.get(alert.sessionId) &&
        drawerOf(state.sessions.get(alert.sessionId))
      ),
    });
  } // drawer: the banner can take a reply (2026-10-12)   // the app posts the banner and counts the Dock's badge

  if (alert.quiet) return; // notifications off (the cog): the unread count above, nothing else

  if ('Notification' in window && Notification.permission === 'granted' && !viewing) {
    const notification = new Notification(
      alert.heading || `${alert.kind === 'reply' ? 'Claude replied' : 'Claude is asking you'} · ${alert.project}`,
      { body: `${alert.title}\n${alert.snippet || ''}`, tag: alert.sessionId || 'test' },
    );

    notification.onclick = () => {
      window.focus();
      if (alert.kind === 'pr' && alert.url && alert.sessionId) location.hash = tvSoloHash(alert.sessionId, alert.url);
      else if (alert.sessionId) openSession(alert.sessionId, { locate: true });
      notification.close();
    }; // a PR's: its timeline, at the move
  }
}
