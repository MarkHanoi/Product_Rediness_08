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

// §RESI-REFUSAL-TRUE (founder 2026-08-01: "why is a plot of 674 m² too small? What is the ceiling?")
//
// THE DEFECT. This module used to carry `RESIDENTIAL_MIN_PLATE_M2 = 400` — a number INVENTED here,
// matching NO constant in the generator (the engine's own per-apartment floor is 72 m², and the
// engine has NO plot-area gate at all). The "too small" copy then quoted the user's PLOT area
// against that fabricated PLATE threshold, producing a message that stated its own threshold and
// then violated it: "This plot (~674 m²) is too small … need roughly ≥400 m² of plate."
//
// THE TRUTH (measured against the real engine). The binding quantity is the plate's SHORT SIDE, not
// its area: a 16 m × 45 m (720 m²) plate refuses while a 16.5 m × 16.5 m (272 m²) plate builds. So
// NO plot area may ever be quoted as a feasibility threshold.
//
// THE RULE THIS MODULE NOW FOLLOWS: **quote only what the engine emitted.** The orchestrator derives
// `MIN_PLATE_WIDTH_M` from its own constants and puts BOTH the measured plate width AND that
// threshold into the reject reason; this module parses them back out. It declares NO feasibility
// number of its own, so it is structurally incapable of repeating the `RESIDENTIAL_MIN_PLATE_M2`
// mistake — if the engine did not measure it, the user is not told it. (This also keeps the module
// PURE, as its header promises: a value import of the `@pryzm/ai-host` barrel would drag the whole
// AI host into the editor's first-paint chunk and break its plain-Node unit tests. Every ai-host
// import in this folder's pure modules is type-only for exactly that reason.)

/** A friendly, palette-neutral description of a reject reason. */
export interface FriendlyResidentialError {
    /** Modal title, e.g. "Can't build a residential building here". */
    readonly title: string;
    /** One human-readable sentence describing what went wrong. */
    readonly body: string;
    /** What the user can do about it (actionable). */
    readonly guidance: string;
    /** Coarse kind — drives which icon/copy + lets tests assert the branch taken. */
    readonly kind: 'too-narrow' | 'too-small' | 'degenerate' | 'core-too-large' | 'no-apartments' | 'exceeds-height' | 'generic';
}

/** Pull the MEASURED plate short side (m) out of the orchestrator's "too narrow" reason. */
function parsePlateWidthM(reason: string): number | undefined {
    const m = /measures\s+([\d.]+)\s*m\s+across its short side/i.exec(reason);
    const n = m ? Number(m[1]) : NaN;
    return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** Pull the engine's DERIVED minimum plate width (m) out of the same reason. Returns `undefined`
 *  when the engine did not state one — in which case the copy states none either. */
function parseMinPlateWidthM(reason: string): number | undefined {
    const m = /needs at least\s+([\d.]+)\s*m/i.exec(reason);
    const n = m ? Number(m[1]) : NaN;
    return Number.isFinite(n) && n > 0 ? n : undefined;
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

    // §RESI-REFUSAL-TRUE — "plate is too narrow: the buildable plate measures X m across its short
    // side; a core + corridor + one apartment run needs at least Y m". The engine measured the plate
    // and knows the derived threshold, so quote BOTH — never a plot area.
    if (r.includes('too narrow')) {
        const raw = String(reason ?? '');
        const wM = parsePlateWidthM(raw);
        const minM = parseMinPlateWidthM(raw);
        const measured = wM !== undefined ? `measures ${wM} m` : 'is too narrow';
        // The threshold sentence appears ONLY when the engine supplied the threshold.
        const needs = minM !== undefined
            ? ` A stair-and-lift core, a corridor and one run of apartments need at least ${minM} m of width.`
            : '';
        return {
            kind: 'too-narrow',
            title: 'This plot is too narrow for a residential building',
            body: `The buildable plate ${measured} across its short side.${needs}`,
            guidance: 'Width is the limit here, not area — a long thin plot of any size still can’t host a core plus an apartment beside it. Widen the boundary across its short side, or draw it on a wider part of the site.',
        };
    }

    // §GEN-MAXHEIGHT-GATE (audit P0-2 / C58) — "building height exceeds the permitted envelope: the
    // envelope here allows Y m; N floors × h m ≈ X m. Up to K floors (≈ Z m) would fit." The gate
    // measured the cap (site model) and the request (arithmetic), so the copy quotes its reason
    // VERBATIM — this module still declares no feasibility number of its own (§RESI-REFUSAL-TRUE).
    if (r.includes('exceeds the permitted envelope')) {
        return {
            kind: 'exceeds-height',
            title: 'Too tall for this plot’s envelope',
            body: String(reason ?? '').trim(),
            guidance: 'Reduce the number of floors to the feasible count quoted above (or lower the floor-to-floor height). The height cap comes from the resolved zoning envelope for this parcel.',
        };
    }

    // §RESI-ZERO-APARTMENTS-REFUSE — "all N apartment cell(s) failed to lay out (most common: …)".
    // The partition PLACED cells but every per-cell layout soft-failed, so building would produce an
    // EMPTY building (shell + core + corridors, zero apartments). Quote the engine's own most-common
    // per-cell reason verbatim — this module still declares no feasibility number of its own.
    if (r.includes('failed to lay out')) {
        return {
            kind: 'no-apartments',
            title: "Couldn't lay out any apartment here",
            body: `The plate was divided into apartment cells, but none of them could be laid out into rooms: ${String(reason ?? '').trim()}.`,
            guidance: 'Try a smaller minimum apartment size, fewer floors, or a less elongated boundary — the cells the corridor grid produces here are too small or too narrow for a real apartment plan.',
        };
    }

    // "level N partition placed zero apartments on a W m × D m plate (…)" → the plate is wide enough
    // in principle but this particular shape/brief placed nothing. Quote the plate, never the plot.
    if (r.includes('zero apartment') || r.includes('no usable band') || r.includes('too small')) {
        const dims = /on a ([\d.]+) m × ([\d.]+) m plate/.exec(String(reason ?? ''));
        const plateTxt = dims ? `${dims[1]} m × ${dims[2]} m` : 'this shape';
        return {
            kind: 'too-small',
            title: "Can't fit apartments on this plot",
            body: `No apartment fits on the ${plateTxt} buildable plate with the floors and apartment sizes requested. A central core (stair + lift), a public corridor and an apartment run all have to fit across it.`,
            guidance: 'Try a smaller minimum apartment size, fewer apartment types, or a boundary that is less elongated. The limit is the plate’s proportions, not its area.',
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

// §REFUSAL-IDENTITY (C58 §1.13, 2026-08-11) — WHY `kind` NOW REACHES THE DOM.
//
// `kind` is a SEVEN-member closed union that the mapper above works hard to resolve:
// it parses the engine's measured plate width, distinguishes "the partition placed
// zero apartments" from "no cell could be laid out", and separates a height-envelope
// refusal from a geometric one. All seven then arrived at ONE `aria-hidden` glyph
// that collapsed SIX of them onto `⚠` — and, being `aria-hidden`, carried nothing at
// all to a screen reader. The panel knew which of seven refusals it was; the user did
// not. That is C58 §1.13 restated at the modal: a refusal that loses its identity is
// indistinguishable from a generic "not applicable".
//
// The fix is the `data-metric`/`data-status` convention the capacity panel already
// uses: stamp the discriminant on the element. The glyph is now also per-kind, but the
// glyph is DECORATION — `data-refusal-kind` is the load-bearing carrier, precisely
// because a glyph cannot be quoted in a bug report and this one is hidden from AT.

/** Per-`kind` glyph for the modal's notice icon (aria-hidden — DECORATION only). */
function iconFor(kind: FriendlyResidentialError['kind']): string {
    switch (kind) {
        case 'too-small':      return '⬚';   // the plate is the wrong SIZE
        case 'too-narrow':     return '↔';   // the plate is the wrong PROPORTION
        case 'exceeds-height': return '↥';   // the ENVELOPE refused, not the geometry
        case 'degenerate':     return '⊘';   // there is no plate to reason about
        case 'core-too-large': return '⊞';   // the core out-competes the apartments
        case 'no-apartments':  return '◌';   // cells were placed; none laid out
        case 'generic':        return '⚠';
    }
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
      <div class="alm-panel rb-error-panel" role="alertdialog" aria-label="${esc(err.title)}"
           data-refusal-kind="${esc(err.kind)}">
        <div class="alm-header">${esc(err.title)}</div>
        <div class="alm-notice-region rb-error-region">
          <div class="alm-notice alm-notice--rejected rb-error-notice" role="alert"
               data-refusal-kind="${esc(err.kind)}">
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
