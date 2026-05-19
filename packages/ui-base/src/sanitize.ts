/**
 * sanitize.ts — Lightweight HTML escaping utility for PRYZM UI components.
 *
 * Use `escHtml()` whenever inserting runtime strings (IFC properties, project
 * names, user-supplied text) into `innerHTML` template literals.
 *
 * For plain-text content prefer `element.textContent = value` — no escaping
 * needed and no XSS surface at all.
 *
 * DOMPurify is available in package.json for cases that need to preserve
 * a subset of HTML tags (e.g. rich-text annotation bodies). Import it
 * directly from 'dompurify' in those components.
 */

/**
 * Escape a value for safe interpolation into an innerHTML template.
 * Handles &, <, >, ", and ' — sufficient to prevent XSS in attribute
 * values and text content within HTML templates.
 *
 * @example
 * el.innerHTML = `<span>${escHtml(propertyName)}</span>`;
 */
export function escHtml(value: unknown): string {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Escape a value for use inside an HTML attribute value (e.g. data-*, title=).
 * Alias for escHtml — same escaping rules apply.
 *
 * @example
 * el.innerHTML = `<input value="${escAttr(userValue)}">`;
 */
export const escAttr = escHtml;
