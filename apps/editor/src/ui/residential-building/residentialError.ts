// Residential building (multi-family) — pure reason→friendly-copy mapping + the
// error/rejection modal HTML builder (P3.3 reject UX).
//
// When `orchestrateResidentialBuilding(...)` HARD-rejects (plot too small,
// degenerate footprint, core doesn't fit, generic soft-fail) the controller used
// to surface only a console warning + a transient toast — the user never clearly
// learned WHY or what to do. These pure builders map the orchestrator's
// `result.reason` (a terse engine string) to friendly, ACTIONABLE copy and render
// it into the SAME `alm-*` brand chrome the residential/apartment/house modals
// already use (white + #6600FF; the error tint reuses the established
// `.alm-notice--rejected` token from apartmentLayoutModal.ts — #e11d48 /
// #9f1239 / #fff4f4 — NOT a new ad-hoc red).
//
// PURE: no DOM, no THREE — the modal controller injects the returned HTML string.
// Unit-tests in plain Node (the apps/editor vitest 'node' env).

/** Minimal HTML-escape for any interpolated text (mirrors residentialModalHtml). */
function esc(s: unknown): string {
    return String(s ?? '').replace(/[&<>"']/g, (c) => (
        c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;'
    ));
}

/** Shoelace area (m²) of a closed plan-XZ ring. Pure. Returns 0 for < 3 pts. */
export function polygonAreaM2(ring: ReadonlyArray<{ x: number; z: number }>): number {
    if (!ring || ring.length < 3) return 0;
    let a = 0;
    for (let i = 0; i < ring.length; i++) {
        const p = ring[i]!;
        const q = ring[(i + 1) % ring.length]!;
        a += p.x * q.z - q.x * p.z;
    }
    return Math.abs(a) / 2;
}

/** Rough minimum plate for a multi-family core + corridor + apartments (m²).
 *  Surfaced in the "too small" guidance copy. */
export const RESIDENTIAL_MIN_PLATE_M2 = 400;

/** A friendly, palette-neutral description of a reject reason. */
export interface FriendlyResidentialError {
    /** Modal title, e.g. "Can't build a residential building here". */
    readonly title: string;
    /** One human-readable sentence describing what went wrong. */
    readonly body: string;
    /** What the user can do about it (actionable). */
    readonly guidance: string;
    /** Coarse kind — drives which icon/copy + lets tests assert the branch taken. */
    readonly kind: 'too-small' | 'degenerate' | 'core-too-large' | 'generic';
}

/**
 * Map a terse orchestrator `reason` (+ optional plot area in m²) to friendly,
 * actionable modal copy. Pure + total (never throws; unknown reasons fall through
 * to the generic branch). The area, when known, is woven into the "too small"
 * guidance so the user sees their actual plot size vs the rough minimum.
 */
export function friendlyResidentialError(
    reason: string | undefined,
    areaM2?: number,
): FriendlyResidentialError {
    const r = String(reason ?? '').toLowerCase();
    const hasArea = typeof areaM2 === 'number' && isFinite(areaM2) && areaM2 > 0;
    const areaTxt = hasArea ? `~${Math.round(areaM2!)} m²` : 'this size';

    // "level N partition placed zero apartments (core/corridor leave no usable band runs)"
    // → the plate is too small to host a core + corridor + any apartment band.
    if (r.includes('zero apartment') || r.includes('no usable band') || r.includes('too small')) {
        return {
            kind: 'too-small',
            title: "Can't build a residential building here",
            body: `This plot (${areaTxt}) is too small for a multi-family building. A central core (stair + lift), a public corridor, and apartments on either side need room to fit.`,
            guidance: `A core + corridor + apartments need roughly ≥${RESIDENTIAL_MIN_PLATE_M2} m² of plate. Draw a larger boundary, or reduce the core / corridor size in the inputs.`,
        };
    }

    // "footprint is degenerate (zero-area plate)" → invalid / zero boundary.
    if (r.includes('degenerate') || r.includes('zero-area') || r.includes('zero area')) {
        return {
            kind: 'degenerate',
            title: "Can't read the building boundary",
            body: 'The drawn boundary is degenerate (zero-area), so there is no plate to build on.',
            guidance: 'Draw a proper closed boundary (at least three corners enclosing real floor area), then try again.',
        };
    }

    // "core doesn't fit" / core too large for the plate.
    if (r.includes("core doesn't fit") || r.includes('core does not fit') || (r.includes('core') && (r.includes('too large') || r.includes('exceed') || r.includes('larger')))) {
        return {
            kind: 'core-too-large',
            title: 'The core is too large for this plot',
            body: `The central core (stair + lift) doesn't fit inside this plot (${areaTxt}) with room left for a corridor and apartments.`,
            guidance: 'Reduce the core width / depth (or the corridor width) in the inputs, or draw a larger boundary.',
        };
    }

    // Generic engine soft-fail / any other reason.
    return {
        kind: 'generic',
        title: "Can't build a residential building here",
        body: reason && reason.trim()
            ? `The generator couldn't lay out a building on this plot: ${reason.trim()}.`
            : "The generator couldn't lay out a building on this plot.",
        guidance: 'Try a larger boundary, fewer floors, smaller apartments, or a smaller core / corridor.',
    };
}

/** Per-`kind` glyph for the modal's notice icon (aria-hidden). */
function iconFor(kind: FriendlyResidentialError['kind']): string {
    return kind === 'too-small' ? '⬚' : '⚠';
}

/**
 * Build the error-modal inner HTML. Reuses the residential/apartment `alm-*` brand
 * chrome (overlay/panel/header/footer) + the established `.alm-notice--rejected`
 * error token, so it matches the rest of the editor by construction. The footer
 * carries a single "OK" dismiss action; an optional "Adjust inputs" secondary is
 * shown when `withAdjust` is set. Pure + XSS-guarded.
 */
export function buildResidentialErrorModalHtml(
    err: FriendlyResidentialError,
    opts: { readonly withAdjust?: boolean } = {},
): string {
    const adjustBtn = opts.withAdjust
        ? '<button type="button" class="alm-cancel" data-action="adjust">Adjust inputs</button>'
        : '';
    return `
      <div class="alm-panel rb-error-panel" role="alertdialog" aria-label="${esc(err.title)}">
        <div class="alm-header">${esc(err.title)}</div>
        <div class="alm-notice-region rb-error-region">
          <div class="alm-notice alm-notice--rejected rb-error-notice" role="alert">
            <span class="alm-notice-icon" aria-hidden="true">${iconFor(err.kind)}</span>
            <span class="alm-notice-body">
              <span class="alm-notice-text">${esc(err.body)}</span>
              <span class="alm-notice-hint">${esc(err.guidance)}</span>
            </span>
          </div>
        </div>
        <div class="alm-footer">
          ${adjustBtn}
          <button type="button" class="alm-select rb-error-ok" data-action="dismiss-error">OK</button>
        </div>
      </div>`;
}

/**
 * Partial-success non-blocking banner — shown INSIDE the preview modal when the
 * building generated but some apartments were rejected (over-programmed). Returns
 * '' when nothing was rejected. Reuses the informative purple `.alm-notice--reduced`
 * token (NOT the error red) — the build still succeeds. Pure + XSS-guarded.
 */
export function buildResidentialPartialNoticeHtml(rejectedCount: number, totalCount: number): string {
    if (!(rejectedCount > 0)) return '';
    const n = Math.round(rejectedCount);
    const m = Math.round(totalCount);
    const aptWord = n === 1 ? 'apartment' : 'apartments';
    return (
        '<div class="alm-notice alm-notice--reduced rb-partial-notice" data-role="rb-partial-notice" role="status">' +
        '<span class="alm-notice-icon" aria-hidden="true">◐</span>' +
        '<span class="alm-notice-body">' +
        '<span class="alm-notice-title">Some apartments couldn’t be laid out</span>' +
        `<span class="alm-notice-text">${n} of ${m} ${aptWord} couldn’t be laid out on this plate (over-programmed).</span>` +
        '<span class="alm-notice-hint">Try a larger min / max apartment area, fewer floors, or a smaller core / corridor.</span>' +
        '</span>' +
        '</div>'
    );
}
