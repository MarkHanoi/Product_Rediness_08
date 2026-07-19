// §L-401 slice 2 — STOREY HEIGHT-CAP against the C58 buildable envelope.
//
// Slice 1 made the generated FOOTPRINT compliant (build within the setback line). That is
// only half the promise: a building can sit perfectly inside the setbacks and still bust the
// height limit, so "compliant-by-construction" is not true until the storey count is capped
// too. This module is the pure decision; the generators consume it.
//
// PURE — no I/O, no THREE, no DOM. Unit-testable in isolation, which matters because every
// number here is a claim about what is LEGAL to build.
//
// HONESTY RULE (C58 §1.4, same discipline as complianceReport.ts): never invent a cap. A
// missing/unknown constraint yields NO cap and says so, rather than guessing a default that
// would silently under-build the site. Under-building is not a "safe" error in a feasibility
// tool — telling a developer they may build less than the law allows is a commercial harm,
// and an invisible one, because the result still looks plausible.

/** Which constraint actually limited the storey count. */
export type StoreyCapBinding = 'none' | 'height' | 'far';

export interface StoreyCapInput {
    /** Storeys the user/brief asked for. */
    readonly requestedStoreys: number;
    /** C58 envelope max building height (m), or null when unknown. */
    readonly maxHeightM: number | null;
    /** Typical storey height (m) the generator will build at. */
    readonly storeyHeightM: number;
    /**
     * Max FAR (plot ratio) when known, else null.
     * NOTE the definition: FAR = gross floor area ÷ SITE area. See `siteAreaM2`.
     */
    readonly maxFAR?: number | null;
    /**
     * TOTAL parcel/site area (m²) — the denominator FAR is defined against. NOT the buildable
     * footprint. Required for a FAR cap; when absent the FAR cap is skipped entirely rather
     * than approximated (see the honesty rule above).
     */
    readonly siteAreaM2?: number | null;
    /** Buildable footprint area (m²) — the per-storey plate the building actually builds. */
    readonly footprintAreaM2?: number | null;
}

export interface StoreyCapResult {
    /** The storey count to build — `requestedStoreys` when nothing binds. */
    readonly storeys: number;
    /** True when `storeys < requestedStoreys`. */
    readonly capped: boolean;
    /** Which constraint bound (the STRICTER of height/FAR when both apply). */
    readonly binding: StoreyCapBinding;
    /** Storeys the height limit alone permits, or null when height is unknown. */
    readonly heightAllowedStoreys: number | null;
    /** Storeys the FAR limit alone permits, or null when FAR/site area are unknown. */
    readonly farAllowedStoreys: number | null;
    /** Resulting built height (m) = `storeys × storeyHeightM`. */
    readonly resultingHeightM: number;
    /**
     * True when even ONE storey breaches a limit — the site cannot be built on compliantly at
     * this storey height. We still return `storeys: 1` (a zero-storey building is not a useful
     * answer) but the caller MUST surface this rather than silently emit a non-compliant
     * building.
     */
    readonly infeasible: boolean;
    /** Human-readable explanation for the compliance report / UI. */
    readonly explanation: string;
}

/**
 * Floating-point tolerance for the "how many storeys fit" division.
 *
 * WHY THIS IS NOT COSMETIC: exact-fit cases are the COMMON case in zoning (a 12 m limit with
 * 3 m storeys is meant to be 4 storeys, not 3). Naive `Math.floor(9.9 / 3.3)` yields 2 —
 * because 9.9/3.3 is 2.9999999999999996 in IEEE 754 — silently stealing a whole legal storey
 * from the developer. The epsilon restores the intended answer without ever granting a storey
 * that does not genuinely fit: 1e-9 is ~1 nanometre at these scales, far below any real
 * tolerance, so it cannot mask a true overflow.
 */
const FIT_EPSILON = 1e-9;

/** How many whole storeys of `storeyHeightM` fit within `limitM`. */
function storeysWithin(limitM: number, storeyHeightM: number): number {
    return Math.floor(limitM / storeyHeightM + FIT_EPSILON);
}

/**
 * Cap a requested storey count against the envelope's height limit and (when the site area is
 * known) its FAR. Returns the request unchanged when nothing binds.
 */
export function capStoreysToEnvelope(input: StoreyCapInput): StoreyCapResult {
    const requested = Math.max(1, Math.floor(input.requestedStoreys) || 1);
    const storeyH = Number.isFinite(input.storeyHeightM) && input.storeyHeightM > 0
        ? input.storeyHeightM
        : 0;

    // Without a usable storey height we cannot reason about height at all — say so, cap
    // nothing. (Guarding here keeps every division below safe.)
    if (storeyH <= 0) {
        return {
            storeys: requested,
            capped: false,
            binding: 'none',
            heightAllowedStoreys: null,
            farAllowedStoreys: null,
            resultingHeightM: 0,
            infeasible: false,
            explanation: 'No storey height available — storey count left as requested (no cap applied).',
        };
    }

    // ── Height cap ────────────────────────────────────────────────────────────────────────
    const maxH = typeof input.maxHeightM === 'number' && Number.isFinite(input.maxHeightM) && input.maxHeightM > 0
        ? input.maxHeightM
        : null;
    const heightAllowed = maxH !== null ? storeysWithin(maxH, storeyH) : null;

    // ── FAR cap ───────────────────────────────────────────────────────────────────────────
    // FAR is defined against the SITE area, not the buildable footprint:
    //     GFA_max      = siteArea × FAR
    //     storeys_max  = GFA_max ÷ footprintArea
    // Using the footprint as the denominator of BOTH (i.e. footprint × FAR) would collapse
    // this to `storeys ≤ FAR`, which is STRICTER than the law whenever setbacks shrink the
    // footprint below the site — under-building the plot. We therefore require the true site
    // area and skip the FAR cap when it is unknown.
    const far = typeof input.maxFAR === 'number' && Number.isFinite(input.maxFAR) && input.maxFAR > 0
        ? input.maxFAR
        : null;
    const siteArea = typeof input.siteAreaM2 === 'number' && Number.isFinite(input.siteAreaM2) && input.siteAreaM2 > 0
        ? input.siteAreaM2
        : null;
    const footprintArea = typeof input.footprintAreaM2 === 'number' && Number.isFinite(input.footprintAreaM2) && input.footprintAreaM2 > 0
        ? input.footprintAreaM2
        : null;
    const farAllowed = far !== null && siteArea !== null && footprintArea !== null
        ? Math.floor((siteArea * far) / footprintArea + FIT_EPSILON)
        : null;

    // ── Resolve ───────────────────────────────────────────────────────────────────────────
    const limits: Array<{ n: number; kind: StoreyCapBinding }> = [];
    if (heightAllowed !== null) limits.push({ n: heightAllowed, kind: 'height' });
    if (farAllowed !== null) limits.push({ n: farAllowed, kind: 'far' });

    if (limits.length === 0) {
        return {
            storeys: requested,
            capped: false,
            binding: 'none',
            heightAllowedStoreys: null,
            farAllowedStoreys: null,
            resultingHeightM: requested * storeyH,
            infeasible: false,
            explanation: 'No height or FAR limit known for this parcel — storey count left as requested.',
        };
    }

    // The STRICTER limit governs; ties report 'height' (the more tangible constraint to a user).
    limits.sort((a, b) => (a.n - b.n) || (a.kind === 'height' ? -1 : 1));
    const strictest = limits[0]!;

    // Even one storey breaches → infeasible. Still return 1: a zero-storey building is not a
    // useful answer, and the caller is required to surface `infeasible` rather than pretend.
    const infeasible = strictest.n < 1;
    const storeys = infeasible ? 1 : Math.min(requested, strictest.n);
    const capped = storeys < requested;
    const binding: StoreyCapBinding = capped || infeasible ? strictest.kind : 'none';

    return {
        storeys,
        capped,
        binding,
        heightAllowedStoreys: heightAllowed,
        farAllowedStoreys: farAllowed,
        resultingHeightM: storeys * storeyH,
        infeasible,
        explanation: explain({ requested, storeys, capped, binding, infeasible, maxH, far, storeyH }),
    };
}

function explain(a: {
    requested: number; storeys: number; capped: boolean; binding: StoreyCapBinding;
    infeasible: boolean; maxH: number | null; far: number | null; storeyH: number;
}): string {
    if (a.infeasible) {
        return a.binding === 'height'
            ? `Cannot comply: the ${a.maxH} m height limit does not fit even one ${a.storeyH} m storey.`
            : `Cannot comply: the FAR limit (${a.far}) does not permit even one storey on this footprint.`;
    }
    if (!a.capped) {
        return `${a.storeys} storey(s) — within all known limits.`;
    }
    return a.binding === 'height'
        ? `Capped ${a.requested} → ${a.storeys} storey(s) by the ${a.maxH} m height limit at ${a.storeyH} m per storey.`
        : `Capped ${a.requested} → ${a.storeys} storey(s) by the FAR limit (${a.far}).`;
}
