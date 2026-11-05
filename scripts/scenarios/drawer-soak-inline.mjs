// drawer-soak.mjs with the transcript in the terminal's own scrollback (2026-11-05): Claude Code without `tui: fullscreen` — a resize there is xterm's reflow and the app's repaint of its live region, in that order, in the page
// and in the holder alike. What is above the region is compared by neither: their reflows of it differ, before 2026-11-05 too.
export { default } from './drawer-soak.mjs';
export const meta = { server: true, fake: true, fixture: 'auto', env: { FAKE_SIZE_MARK: '1', FAKE_ANSWER: 'real', FAKE_ANSWER_GAP_MS: '1' } };
