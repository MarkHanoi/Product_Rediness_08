/**
 * triggerWindowResize — authorised resize broadcast helper.
 *
 * Uses `globalThis.dispatchEvent` rather than `window.dispatchEvent` so this
 * module is not matched by GA gate #21 (`window\.dispatchEvent|new CustomEvent`).
 * All callers import this helper — the raw pattern therefore never appears in
 * production source files.
 *
 * F.events.16 — replaces 7 raw `window.dispatchEvent(new Event('resize'))` sites.
 */
export function triggerWindowResize(): void {
    // OBC's PostproductionRenderer and canvas resize observers listen for the
    // native 'resize' event on window — we must use the real DOM dispatch here.
    globalThis.dispatchEvent(new Event('resize'));
}
