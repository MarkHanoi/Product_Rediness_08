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

// §REFUSAL-IDENTITY (C58 §1.13, added 2026-08-11) — WHY THIS GATE GREW A `code`.
//
// C58 §1.13.1 makes a refusal a first-class answer over a CLOSED code set, and
// §1.13.8 states the seam rule this gate was breaching: **the distinction the
// decider makes MUST reach the card.** This gate is ordinance-grounded — its
// `maxHeightM` is the parcel's resolved legal cap, read through
// `SiteQueryService.getMaxHeightM()`, which is `BuildableEnvelope.maxHeight_m`
// — and yet its refusal arm carried no identity at all. Five call sites
// (House ×2, Office ×2, Residential) rendered `reason` as prose into a toast or
// a modal, so a user told "no" could not trace the "no" to the branch that said
// it, and no downstream surface could branch on it. That is precisely the class
// §1.13 exists for: an ordinance-grounded refusal, unattributable BY CONSTRUCTION.
//
// The codes are DERIVED FROM THE GATE'S OWN TWO BRANCHES — nothing was invented,
// and no ordinance article is asserted that this module did not read:
//
//   • `height-exceeds-cap`     — the cap admits ≥ 1 storey at this floor-to-floor
//                                height, so the request is REDUCIBLE. The gate
//                                already computes and offers `maxFeasibleFloors`.
//                                The actionable answer is "build fewer floors".
//   • `cap-admits-no-storey`   — `maxFeasibleFloors === 0`: the cap is lower than
//                                ONE floor-to-floor. Reducing the storey count
//                                cannot help; only a lower floor-to-floor, or a
//                                different parcel, can. A DIFFERENT answer, and
//                                the gate has always branched on it (the `offer`
//                                ternary) — it just never told anyone which side
//                                it landed on.
//
// ⚠ There is deliberately NO third code for "cap is 0". A recorded cap of 0 is
// data like any other (see the header above) and lands in `cap-admits-no-storey`
// on its own arithmetic. Minting a code for it would assert a legal distinction
// the gate does not make. `maxHeightM === null` is NOT a refusal at all — it is
// "no cap recorded", the gate proceeds, and §CONTEXT-DATA-HONESTY forbids
// dressing an absence as a limit.

/** Small tolerance (m) so float drift at exact-cap requests never refuses. */
const HEIGHT_EPS = 1e-6;

/**
 * The CLOSED refusal-code set, modelled on `EnvelopeRefusalCode`
 * (`packages/schemas/src/site/zoning/BuildableEnvelope.ts`). CLOSED is the point:
 * widening this to `string` would let any caller mint an unattributable "no",
 * which is the defect this type exists to make unrepresentable.
 */
export const MAX_HEIGHT_REFUSAL_CODES = ['height-exceeds-cap', 'cap-admits-no-storey'] as const;
export type MaxHeightRefusalCode = (typeof MAX_HEIGHT_REFUSAL_CODES)[number];

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
        /**
         * §REFUSAL-IDENTITY (C58 §1.13.1) — WHICH branch refused, over a closed set.
         * Render it with `maxHeightRefusalText()`; never render `reason` alone, or
         * the identity dies one layer before the user.
         */
        readonly code: MaxHeightRefusalCode;
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
    // The gate has ALWAYS branched here; §REFUSAL-IDENTITY only makes the branch nameable.
    const code: MaxHeightRefusalCode =
        maxFeasibleFloors > 0 ? 'height-exceeds-cap' : 'cap-admits-no-storey';
    const offer = maxFeasibleFloors > 0
        ? ` Up to ${maxFeasibleFloors} floor${maxFeasibleFloors === 1 ? '' : 's'} ` +
          `(≈ ${round2(maxFeasibleFloors * f2f)} m) would fit.`
        : ' Not even a single floor fits at this floor-to-floor height.';
    const reason =
        `building height exceeds the permitted envelope: the envelope here allows ` +
        `${round2(maxHeightM)} m; ${floors} floor${floors === 1 ? '' : 's'} × ${round2(f2f)} m ` +
        `≈ ${requestedHeightM} m.${offer}`;
    return { ok: false, code, requestedHeightM, maxHeightM: round2(maxHeightM), maxFeasibleFloors, reason };
}

/**
 * §REFUSAL-IDENTITY — THE render seam. Every one of the five call sites must send
 * the refusal through here rather than reading `.reason`, so the code cannot be
 * dropped on the way to the toast/modal.
 *
 * The code is interpolated into the USER-VISIBLE sentence, copying the shipped
 * pattern in `apps/editor/src/ui/site/siteDispatch.ts` (which puts the reason enum
 * key in a parenthetical inside the note it renders). A refusal a user can quote
 * back — "PRYZM said cap-admits-no-storey" — is traceable to a branch, an
 * ordinance and a support ticket; "it said no" is not.
 */
export function maxHeightRefusalText(
    refusal: Extract<MaxHeightGateResult, { ok: false }>,
): string {
    return `${refusal.reason} (${refusal.code})`;
}
