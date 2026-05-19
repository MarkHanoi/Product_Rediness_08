/**
 * @file src/ui/icons/ViewerIconSet.ts
 *
 * Wave 2 — UI/UX §1.3
 * Monochrome line-glyph icon set used across the Visibility-Intent surfaces
 * (Properties panel spine, Override list rows, future per-element editor).
 *
 * All glyphs are stroked-outline SVGs with `currentColor` so consumers control
 * tint via CSS `color`. Default stroke width 1.5 px at 16x16 viewBox.
 *
 * Replaces the coloured emoji glyphs (🔒 👁 🚫 📌 ⚠ 🎨 🗎) used by the legacy
 * VG panel and the original AI Intent block. Intent-spine UI must use these.
 */

const SIZE = 16;

function svg(inner: string, size = SIZE): string {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${SIZE} ${SIZE}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
}

/** Visibility — eye open. Used for show/visible state. */
export const ICON_EYE = svg(`<path d="M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8s-2.5 4.5-6.5 4.5S1.5 8 1.5 8z"/><circle cx="8" cy="8" r="2"/>`);

/** Visibility — eye off. Used for hide state. */
export const ICON_EYE_OFF = svg(`<path d="M2 2l12 12"/><path d="M9.9 9.9a2 2 0 0 1-2.8-2.8"/><path d="M6.1 6.1C3.7 6.9 1.5 8 1.5 8s2.5 4.5 6.5 4.5c1 0 1.9-.2 2.7-.5"/><path d="M11.7 11.7C13.5 10.6 14.5 8 14.5 8s-2.5-4.5-6.5-4.5c-.5 0-1 .1-1.5.2"/>`);

/** Lock — closed padlock. Used for locked / read-only fields. */
export const ICON_LOCK = svg(`<rect x="3" y="7.5" width="10" height="6.5" rx="1"/><path d="M5 7.5V5a3 3 0 0 1 6 0v2.5"/>`);

/** Lock — open padlock. Used for unlocked / editable fields. */
export const ICON_LOCK_OPEN = svg(`<rect x="3" y="7.5" width="10" height="6.5" rx="1"/><path d="M5 7.5V5a3 3 0 0 1 5.83-1"/>`);

/** Pin — push pin. Used for "stuck" / per-element override flag. */
export const ICON_PIN = svg(`<path d="M9 2.5l4.5 4.5-2 2L8 5.5l-3 3v3l-2-2 3-3L3 3l2-2 4 1.5z"/>`);

/** Warning — triangle with exclamation. Used for conflict / validation issue. */
export const ICON_WARNING = svg(`<path d="M8 2 L14.5 13.5 H1.5 Z"/><line x1="8" y1="6" x2="8" y2="9.5"/><circle cx="8" cy="11.5" r="0.4" fill="currentColor"/>`);

/** Pencil — edit. Used for "Open intent editor" affordance. */
export const ICON_PENCIL = svg(`<path d="M11.5 2.5l2 2L5 13H3v-2l8.5-8.5z"/>`);

/** Document — outlined sheet. Used for view / template references. */
export const ICON_DOCUMENT = svg(`<path d="M4 1.5h5l3 3v10H4z"/><path d="M9 1.5v3h3"/>`);

/** Refresh — circular arrow. Used for revert / reset row affordance. */
export const ICON_REVERT = svg(`<path d="M2.5 8a5.5 5.5 0 1 0 1.6-3.9"/><polyline points="2,3 2,5.5 4.5,5.5"/>`);

/** Diamond — fill swatch. Used to indicate graphic-override (colour/fill) rows. */
export const ICON_FILL = svg(`<path d="M8 2l5 5-5 7-5-7z"/>`);

/** Slash circle — banned / hidden. Used for "isolate" mode badge. */
export const ICON_ISOLATE = svg(`<circle cx="8" cy="8" r="5.5"/><line x1="3.5" y1="3.5" x2="12.5" y2="12.5"/>`);

/** Layers — stacked rectangles. Used for "intent" badge / spine. */
export const ICON_INTENT = svg(`<polygon points="8,2 14,5 8,8 2,5"/><polyline points="2,8 8,11 14,8"/><polyline points="2,11 8,14 14,11"/>`);

/** Helper that returns an HTMLSpanElement wrapping the SVG. */
export function makeIcon(svgString: string, opts?: { className?: string; title?: string; ariaLabel?: string }): HTMLSpanElement {
    const span = document.createElement('span');
    span.className = `vi-icon${opts?.className ? ' ' + opts.className : ''}`;
    span.innerHTML = svgString;
    if (opts?.title) span.title = opts.title;
    if (opts?.ariaLabel) span.setAttribute('aria-label', opts.ariaLabel);
    span.setAttribute('aria-hidden', opts?.ariaLabel ? 'false' : 'true');
    return span;
}
