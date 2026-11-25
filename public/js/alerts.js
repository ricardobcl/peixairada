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
  const audioRest = () => { clearTimeout(audioRest.t); audioRest.t = setTimeout(() => { if (audio?.state === 'running') audio.suspend().catch(() => {}); }, AUDIO_REST_MS); };
  const audioUp = () => {
    if (!prefs.sounds) return null;
    try { if (!audio) { audio = new (window.AudioContext || window.webkitAudioContext)(); audio.onstatechange = () => { if (audio.state === 'running') { audio.ran = true; audioRest(); } }; if (audio.state === 'running') { audio.ran = true; audioRest(); } } } catch { audio = null; return null; }
    if (!audio.ran && audio.state === 'suspended') audio.resume().catch(() => {});   // not started yet: a press may start it
    return audio;
  };
  for (const ev of ['pointerdown', 'keydown']) document.addEventListener(ev, audioUp, { capture: true, passive: true });
  function tone(f, t0, dur, type, vol) {
    const o = audio.createOscillator(), g = audio.createGain();
    o.type = type; o.frequency.value = f;
    g.gain.setValueAtTime(.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + .006); g.gain.exponentialRampToValueAtTime(.0001, t0 + dur);
    o.connect(g).connect(audio.destination); o.start(t0); o.stop(t0 + dur + .02);
  }
  const CHIME_GAP_MS = 1200;
  function chime(kind) {
    if (!prefs.sounds || !audio?.ran) return;
    // one voice at a time (S6): a burst of landings is one tick; a question is always heard
    const now = performance.now(), asks = kind === 'needs-input' || kind === 'drift';
    if (!asks && now - (chime.at || 0) < CHIME_GAP_MS) return;
    chime.at = now;
    const play = () => {
      noteMotion(null, 'sound:' + kind);
      const t = audio.currentTime + .02;
      if (kind === 'needs-input' || kind === 'drift' || kind === 'agent-failed') { tone(784, t, .15, 'triangle', .09); tone(1174.7, t + .14, .22, 'triangle', .09); }
      else { tone(1318.5, t, .18, 'sine', .08); tone(659.3, t, .26, 'sine', .05); }
      audioRest();
    };
    if (audio.state === 'running') play(); else audio.resume().then(play, () => {});
  }
  $('#soundsOn').checked = !!prefs.sounds;
  $('#soundsOn').addEventListener('change', e => { prefs.sounds = e.target.checked; savePrefs(); if (audioUp()) setTimeout(() => chime('reply'), 30); });
  function onAlert(a) {
    if (a.kind === 'chat') return chatAlert(a);   // the chat's (2026-10-17): its own rules
    if (a.kind === 'lunch') return lunchAlert(a);   // lunch's (2026-10-18)
    const viewing = a.sessionId && a.sessionId === state.current && document.visibilityState === 'visible' && document.hasFocus();
    const as = a.sessionId ? state.sessions.get(a.sessionId) : null;
    if (fishing.until && (a.kind === 'reply' || a.kind === 'pr' || a.kind === 'back')) a = { ...a, quiet: true, held: true };   // gone fishing (M4): it counts, and says nothing yet
    else if (prioFocus() && as && !inPrio(as) && a.kind !== 'needs-input') a = { ...a, quiet: true, held: true };   // in focus, the rest says nothing yet but its questions (2026-11-24, round XXX's F3)
    if (!viewing && !a.held && !a.muted && !a.snoozed && !(as && asleep(as)) && document.visibilityState === 'visible' && document.hasFocus()) chime(a.kind);   // in front: heard rather than shown; not the chat you are looking at (2026-11-01, round XIX's S6)
    if (a.sessionId && !viewing && !(as && asleep(as))) state.unread.set(a.sessionId, (state.unread.get(a.sessionId) || 0) + 1);   // a snoozed chat counted nowhere (W4)
    if (viewing && a.kind === 'reply') markSeen(a.sessionId);
    renderBoard();
    // the badge that just came, or grew, pops in — a one-shot on the node the render made
    const badge = a.sessionId && !viewing && !REDUCED.matches && document.querySelector(`#slist > .card[data-id="${a.sessionId}"] .badge`);
    if (badge) { noteMotion(a.sessionId, 'pop'); badge.animate([{ transform: 'scale(.5)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 380, easing: SPRING, id: 'pop' }); }
    if (inApp) post({ type: 'alert', kind: a.kind, heading: a.heading || '', project: a.project || '', title: a.title || '', snippet: a.snippet || '', sessionId: a.sessionId || '', hash: a.kind === 'pr' && a.url && a.sessionId ? tvSoloHash(a.sessionId, a.url) : '', serverNotify: !!state.serverNotify, quiet: !!a.quiet, drawer: !!(a.sessionId && state.sessions.get(a.sessionId) && drawerOf(state.sessions.get(a.sessionId))) });   // drawer: the banner can take a reply (2026-10-12)   // the app posts the banner and counts the Dock's badge
    if (a.quiet) return;   // notifications off (the cog): the unread count above, nothing else
    if ('Notification' in window && Notification.permission === 'granted' && !viewing) {
      const n = new Notification(a.heading || `${a.kind === 'reply' ? 'Claude replied' : 'Claude is asking you'} · ${a.project}`, { body: `${a.title}\n${a.snippet || ''}`, tag: a.sessionId || 'test' });
      n.onclick = () => { window.focus(); if (a.kind === 'pr' && a.url && a.sessionId) location.hash = tvSoloHash(a.sessionId, a.url); else if (a.sessionId) openSession(a.sessionId, { locate: true }); n.close(); };   // a PR's: its timeline, at the move
    }
  }

