// @pryzm/ui — Accessibility tokens (S70 D7, ADR-0052 §B.2).
//
// Centralises the focus-ring colour + width, the skip-link CSS, and a
// screen-reader-only utility class so every PRYZM surface (editor,
// marketing, docs) renders the same a11y primitives.
//
// PURE — no DOM mutation; the consumer injects the CSS via
// `injectA11yStylesheet(document)` at module-init time.
//
// Spec: WCAG SC 1.4.11 (non-text contrast 3:1) + SC 2.4.7 (focus
// visible) + SC 2.4.1 (bypass blocks).

/** Brand-aligned focus-ring colour.  Contrast against the editor's
 *  default backgrounds is verified in __tests__/a11y/tokens.test.ts. */
export const FOCUS_RING_COLOR = '#3a7bd5';
export const FOCUS_RING_WIDTH_PX = 2;
export const FOCUS_RING_OFFSET_PX = 2;

/** RGB-as-tuple for the focus ring + the two background tones the UI
 *  layers on top of.  Used by the contrast-ratio test below + by any
 *  surface that wants to verify dynamic backgrounds at runtime. */
export const FOCUS_RING_RGB = Object.freeze([0x3a, 0x7b, 0xd5] as const);
export const EDITOR_BG_LIGHT_RGB = Object.freeze([0xe8, 0xed, 0xf6] as const);
export const EDITOR_BG_DARK_RGB = Object.freeze([0x1f, 0x29, 0x37] as const);

/** Skip-link target id.  The link in `index.html` is
 *  `<a href="#main" class="skip-link">`. */
export const SKIP_LINK_TARGET_ID = 'main';

/** The full a11y stylesheet.  Imported as a string so callers can
 *  ship it via either a `<style>` tag or a CSS-in-JS injector. */
export const A11Y_STYLESHEET = `
/* @pryzm/ui a11y tokens — S70 D7. */

.skip-link {
  position: absolute;
  left: -9999px;
  top: 4px;
  z-index: 100001;
  background: ${FOCUS_RING_COLOR};
  color: #fff;
  padding: 8px 16px;
  border-radius: 4px;
  font: 600 14px/1.2 system-ui, -apple-system, "Segoe UI", sans-serif;
  text-decoration: none;
}
.skip-link:focus,
.skip-link:focus-visible {
  left: 8px;
  outline: ${FOCUS_RING_WIDTH_PX}px solid #fff;
  outline-offset: 2px;
}

/* Visible focus ring on every focusable element — overrides the
 * browser default which is often invisible against PRYZM bg tones. */
:focus-visible {
  outline: ${FOCUS_RING_WIDTH_PX}px solid ${FOCUS_RING_COLOR};
  outline-offset: ${FOCUS_RING_OFFSET_PX}px;
}

/* Screen-reader-only utility (hide visually but keep for AT). */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
`.trim();

/** Mount the a11y stylesheet into the given document.  Idempotent —
 *  a second call is a no-op.  Returns the inserted (or existing)
 *  `<style>` element so tests can assert on it. */
export function injectA11yStylesheet(doc: Document = document): HTMLStyleElement {
  const ID = 'pryzm-a11y-tokens';
  const existing = doc.getElementById(ID);
  if (existing instanceof HTMLStyleElement) return existing;
  const el = doc.createElement('style');
  el.id = ID;
  el.textContent = A11Y_STYLESHEET;
  doc.head.appendChild(el);
  return el;
}

// ─── Contrast helpers (used by the unit test) ────────────────────────────────

/** Per WCAG 2.2 SC 1.4.11 §"Procedure" — relative luminance of an
 *  sRGB colour. */
export function relativeLuminance([r, g, b]: readonly [number, number, number]): number {
  const norm = (c: number): number => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * norm(r) + 0.7152 * norm(g) + 0.0722 * norm(b);
}

/** Returns the 1.0–21.0 contrast ratio between two colours.  WCAG
 *  SC 1.4.11 (non-text) requires ≥ 3:1; SC 1.4.3 (text) requires
 *  ≥ 4.5:1 normal text or ≥ 3:1 large text. */
export function contrastRatio(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}
