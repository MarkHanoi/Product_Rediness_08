// skipLink — keyboard-accessible "Skip to main content" link (S58 §19.7 #3).
//
// Spec source: PHASE-3B-FAMILY-CREATOR-REWRITE-PLAN.md §19.7
// "Full keyboard nav across every panel (focus rings, skip-links,
// screen-reader live region for solver status)".
//
// The skip-link is the FIRST focusable element on the page.  It is
// visually hidden until focused, then becomes a high-contrast button
// in the top-left corner.  Activating it moves focus to the element
// with id=`mainContentId` (set by AppShell on the active panel).
//
// LAYER — L7 chrome-side. Pure DOM, no THREE, no React.

const HIDDEN_STYLE = [
  'position:absolute',
  'top:-100px',
  'left:8px',
  'padding:8px 16px',
  'background:#6600FF',
  'color:#ffffff',
  'border-radius:6px',
  'font:600 13px/1 system-ui,sans-serif',
  'text-decoration:none',
  'z-index:9999',
  'transition:top 80ms ease-out',
].join(';');

const VISIBLE_STYLE = HIDDEN_STYLE.replace('top:-100px', 'top:8px');

export function createSkipLink(mainContentId: string): HTMLAnchorElement {
  const link = document.createElement('a');
  link.href = `#${mainContentId}`;
  link.textContent = 'Skip to main content';
  link.dataset.role = 'a11y-skip-link';
  link.style.cssText = HIDDEN_STYLE;
  link.addEventListener('focus', () => {
    link.style.cssText = VISIBLE_STYLE;
  });
  link.addEventListener('blur', () => {
    link.style.cssText = HIDDEN_STYLE;
  });
  link.addEventListener('click', (ev) => {
    const target = document.getElementById(mainContentId);
    if (!target) return;
    ev.preventDefault();
    // tabindex=-1 ensures programmatic focus works even on non-focusable elements.
    if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
    target.focus();
    // History hash update keeps URL deep-linkable but does not scroll twice.
    if (typeof history !== 'undefined' && typeof history.replaceState === 'function') {
      history.replaceState(null, '', `#${mainContentId}`);
    }
  });
  return link;
}
