// ---- ⌘+ / ⌘- / ⌘0: the chat's size — the transcript through CSS zoom, the terminal through its font
// ⌘0 reaches here only with one half (CMDKEYS takes it first and hands it back through hotOnlyHalf): split, the
// key closes the other half instead, which is the thing you want it for when there are two.
const ZOOM_MIN = 0.6,
  ZOOM_MAX = 2,
  TERM_FONT = 12;
const termFontSize = () => Math.round(TERM_FONT * (Number(prefs.chatZoom) || 1));
function applyChatZoom() {
  prefs.chatZoom = Math.round(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Number(prefs.chatZoom) || 1)) * 10) / 10;
  document.documentElement.style.setProperty('--chat-zoom', prefs.chatZoom);
  for (const tm of terms)
    if (tm.xt) {
      tm.xt.options.fontSize = termFontSize();
      fitTerm(tm);
    }
}
function chatZoomKey(e) {
  if (!e.metaKey || e.ctrlKey || e.altKey) return false;
  const step = e.key === '=' || e.key === '+' ? 0.1 : e.key === '-' || e.key === '_' ? -0.1 : e.key === '0' ? 0 : null;
  if (step === null) return false;
  if (prefs.space && e.target.closest?.('#space')) {
    spZoom(step ? spZoomNow() + step : 1);
    e.preventDefault();
    return true;
  } // the keys in Space: its nodes' zoom (2026-11-18)
  prefs.chatZoom = step ? prefs.chatZoom + step : 1;
  applyChatZoom();
  savePrefs();
  e.preventDefault();
  return true;
}
document.addEventListener('keydown', e => {
  if (!e.target.closest?.('.tbody')) chatZoomKey(e);
}); // either half's drawer did it already
applyChatZoom();
