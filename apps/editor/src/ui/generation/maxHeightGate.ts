// §GEN-MAXHEIGHT-GATE (audit GENERATIVE-PIPELINE-AUDIT-2026-08-10 P0-2 / RAC U5b.3, C58) —
// THE pure envelope-height gate every building generator runs BEFORE building.
//
// The site model resolves a parcel's legal height cap (`Parcel.maxHeight`, read through
// `SiteQueryService.getMaxHeightM()`), but until this gate NO generator consulted it: a
// 10-storey request on a 25.75 m parcel built 30+ m of non-compliant building without a
// word (the L-616 "overstating on real land" class). This module is the one shared,
// unit-testable decision:
//
//   requestedHeight = floors × floorToFloor        (measured from the generator's base)
//   requestedHeight ≤ cap  → proceed
//   requestedHeight > cap  → REFUSE, quoting BOTH numbers + the max feasible floor count
//
// §CONTEXT-DATA-HONESTY (C58 / SiteQueryService header): `maxHeightM === null` means
// "no cap RECORDED", which is NOT "no limit exists" and NOT zero — the gate PROCEEDS and
// says nothing false (the caller must not claim compliance). A recorded cap of 0 is data
// and refuses like any other cap. Callers thread the refusal through their existing
// error/modal path (the §RESI-ZERO-APARTMENTS-REFUSE pattern).
//
// PURE: no DOM, no store reads — the caller supplies the resolved cap. Plain-Node tests.

/** Small tolerance (m) so float drift at exact-cap requests never refuses. */
const HEIGHT_EPS = 1e-6;

export interface MaxHeightGateInput {
    /** TOTAL storey count the request would build (ground + uppers). */
    readonly floors: number;
    /** Floor-to-floor height (m) the generator will mint levels at. */
    readonly floorToFloorM: number;
    /** The resolved parcel height cap (m), or null = "no cap recorded" (proceed). */
    readonly maxHeightM: number | null;
}

export type MaxHeightGateResult =
    | { readonly ok: true }
    | {
        readonly ok: false;
        /** floors × floorToFloorM (m), rounded to 0.01. */
        readonly requestedHeightM: number;
        /** The cap that refused (m) — quoted verbatim to the user. */
        readonly maxHeightM: number;
        /** Largest floor count whose height fits under the cap (can be 0). */
        readonly maxFeasibleFloors: number;
        /** The refusal sentence quoting BOTH numbers + the feasible offer. */
        readonly reason: string;
    };

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Decide whether `floors` storeys at `floorToFloorM` fit under the parcel's resolved
 * height cap. Total: never throws; degenerate inputs (non-positive floors / f2f) proceed
 * (they are some other guard's problem — this gate rules on HEIGHT only).
 */
export function checkMaxHeightGate(input: MaxHeightGateInput): MaxHeightGateResult {
    const { maxHeightM } = input;
    // §CONTEXT-DATA-HONESTY — null = no cap recorded ⇒ proceed, say nothing false.
    // (Non-finite caps are treated as unrecorded too — never invent a limit.)
    if (maxHeightM === null || !Number.isFinite(maxHeightM)) return { ok: true };
    const floors = Math.floor(input.floors);
    const f2f = input.floorToFloorM;
    if (!(floors > 0) || !(f2f > 0) || !Number.isFinite(floors * f2f)) return { ok: true };

    const requestedHeightM = round2(floors * f2f);
    if (requestedHeightM <= maxHeightM + HEIGHT_EPS) return { ok: true };

    const maxFeasibleFloors = Math.max(0, Math.floor((maxHeightM + HEIGHT_EPS) / f2f));
    const offer = maxFeasibleFloors > 0
        ? ` Up to ${maxFeasibleFloors} floor${maxFeasibleFloors === 1 ? '' : 's'} ` +
          `(≈ ${round2(maxFeasibleFloors * f2f)} m) would fit.`
        : ' Not even a single floor fits at this floor-to-floor height.';
    const reason =
        `building height exceeds the permitted envelope: the envelope here allows ` +
        `${round2(maxHeightM)} m; ${floors} floor${floors === 1 ? '' : 's'} × ${round2(f2f)} m ` +
        `≈ ${requestedHeightM} m.${offer}`;
    return { ok: false, requestedHeightM, maxHeightM: round2(maxHeightM), maxFeasibleFloors, reason };
}
