// ---- home: the chat column with no chat open (2026-10-10) ---------------------------------------------------------
// fastfetch's block and btop's honesty: a pixel fish beside the board's facts in key: value lines and the palette's
// blocks; under them the day — every chat a row from the morning to now, clauding in its colour, waiting on you
// hatched red, a monitor a thin line — and the sum: how many questions, how fast you answered, the longest wait.
// Shown wherever the column would say "Pick a chat" (showHome, from leaveChat and the snapshot), ⌥⌘0 from anywhere;
// the day is asked of the server (GET /api/today) on showing, every minute and when a turn lands, the rest is drawn
// from what the page holds.
const home = { day: null, asking: false, timer: 0, soon: 0 };

const dur = ms => {
  const minutes = Math.round((ms || 0) / 60_000);

  return minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`;
};
