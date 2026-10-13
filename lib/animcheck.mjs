// What keeps WebKit's frames on the main thread (2026-10-13), as an expression to evaluate on the board: a list of what
// breaks the rules, empty when nothing does. WebKit — the app's engine — runs a page's animations on the compositor only
// while none of them has to be resolved on the main thread; one that does makes every frame a style pass and a walk of
// every layer, and four did on 2026-10-13 without a scenario noticing (Chrome composites what WebKit does not):
//   * an animation, never ending, on an SVG element inside an <svg> — WebKit composites no SVG group's transform;
//   * one at a playback rate other than 1;
//   * one with no box to draw — WebKit keeps an animation on a `display: none` pseudo-element and runs it (Chrome makes
//     none, so this one is seen in WebKit alone: scripts/perf.mjs);
//   * an inherited registered property under a transition on an element with much under it — every element below is
//     restyled each frame of it.
// Used by scripts/scenarios/compositor-rules.mjs (Chrome) and scripts/perf.mjs (WebKit).
export const ANIM_RULES = `(() => {
  const bad = new Set();
  const name = el => !el ? '?' : el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\\s+/).slice(0, 3).join('.') : '');
  const what = a => (a.animationName || a.id || (a.transitionProperty ? 'transition of ' + a.transitionProperty : 'an animation')) + ' on ' + name(a.effect?.target) + (a.effect?.pseudoElement || '');
  for (const a of document.getAnimations()) {
    const t = a.effect?.target, lasting = a.effect?.getComputedTiming().endTime === Infinity || (a.timeline && a.timeline !== document.timeline);   // a scroll-driven one never ends either
    if (!t || a.playState !== 'running' || !lasting) continue;
    if (t instanceof SVGElement && t.ownerSVGElement) bad.add('an SVG element inside an svg animated: ' + what(a));
    if (a.playbackRate !== 1) bad.add('a playback rate of ' + a.playbackRate + ': ' + what(a));
    const drawn = t.getClientRects().length > 0 && (!a.effect.pseudoElement || getComputedStyle(t, a.effect.pseudoElement).display !== 'none');
    if (!drawn) bad.add('running with nothing drawn: ' + what(a));
  }
  const inherited = new Set();
  const walk = rules => { for (const r of rules) { if (typeof CSSPropertyRule !== 'undefined' && r instanceof CSSPropertyRule && r.inherits) inherited.add(r.name); if (r.cssRules) walk(r.cssRules); } };
  for (const s of document.styleSheets) { try { walk(s.cssRules); } catch {} }
  if (inherited.size) for (const el of document.querySelectorAll('*')) {
    const props = getComputedStyle(el).transitionProperty.split(',').map(p => p.trim()).filter(p => inherited.has(p));
    if (props.length && el.getElementsByTagName('*').length > 50) bad.add('an inherited registered property under a transition (' + props.join(', ') + ') on ' + name(el) + ', ' + el.getElementsByTagName('*').length + ' elements under it');
  }
  return [...bad];
})()`;
