// §TOBE-ALLOCATION (lane PL-TOBE-ENVELOPE, 2026-09-06) — STR §25.2's arithmetic: BRUT vs NET, and
// THE REMAINDER THE USER MUST BE TOLD.
//
// The founder's worked example IS the specification, and it is pinned verbatim by a test:
//
//   > "Imagine there is a plot of 1200 sqm. The maximum implantation area in ground is 200 sqm.
//   >  The maximum total buildable area BRUT is 320. We should let the user know that only in
//   >  first floor he will be able to build 120 sqm."
//
// So the loop is: ask how much of the GROUND-floor implantation allowance the user wants →
// subtract it from the TOTAL BRUT allowance → **state the remainder for the floors above** → let
// them allocate it per floor. This module is the arithmetic half of that loop, and nothing else:
// it decides numbers and sentences, it draws nothing and it stores nothing.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⛔ THE TWO ALLOWANCES ARE DIFFERENT QUESTIONS AND ARE NEVER FOLDED INTO ONE NUMBER
// ══════════════════════════════════════════════════════════════════════════════════════════════
//   · GROUND IMPLANTATION (m², a PLAN limit)  — how much of the parcel may be covered. Bounds
//     EVERY storey's plate, because no storey may overhang the buildable footprint.
//   · TOTAL BRUT (m², a SUM limit)            — how much floor area may exist in total, added up
//     over all storeys.
//
// A user who has 200 m² of implantation and 320 m² of BRUT does not have 520 m² of anything. The
// C114 §3a discipline ("three questions, three authorities, never summed into one number") is the
// same rule one level up, and this module keeps the two apart in the type, not in a comment.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⛔ AN UNKNOWN ALLOWANCE IS NEVER A ZERO ALLOWANCE
// ══════════════════════════════════════════════════════════════════════════════════════════════
// `remainingM2` is `number | null`, and `null` means *"PRYZM does not know the total"* — never
// *"nothing remains"*. Those two demand opposite next actions from the user, and rendering them
// as one value is [[context-data-honesty-family]], the single most-repeated defect in this repo.
// Every refusal below carries BOTH numbers it was decided from, per the founder's hard-stopper
// doctrine and the sibling rule already held by `targetFootprintAreaSolver.ts`.
//
// PURE: no store, no DOM, no THREE, no I/O, no clock, no RNG. Never throws. Deterministic.

import { trace } from '@opentelemetry/api';

const _tracer = trace.getTracer('pryzm.site.brutAreaAllocation');

/**
 * Below any planning decision, comfortably above the float wobble of two routes to one area.
 * The SAME 0.5 m² `targetFootprintAreaState`'s staleness gate uses, deliberately — one tolerance
 * for one kind of quantity.
 */
export const ALLOCATION_TOLERANCE_M2 = 0.5;

// ─────────────────────────────────────────────────────────────────────────────
// 1. The allowances — where each number came from, always named
// ─────────────────────────────────────────────────────────────────────────────

/**
 * How the TOTAL BRUT allowance was arrived at. ⛔ The distinction is legal, not cosmetic:
 *
 *   · `far`                       — a PUBLISHED ratio × the parcel area. A real BRUT limit.
 *   · `footprint-times-storeys`   — the buildable footprint × the derived storey count. This is a
 *                                   GEOMETRIC PRODUCT, not a published limit: it is what the
 *                                   massing can hold, and it binds only because you cannot build
 *                                   floor area you have no floors for. Saying "the ordinance
 *                                   allows 1,421 m²" about this number would be an invention.
 *   · `far-capped-by-geometry`    — both existed and the GEOMETRY was the smaller. Both numbers
 *                                   are carried so the user can see which one bit.
 */
export type BrutTotalSource = 'far' | 'footprint-times-storeys' | 'far-capped-by-geometry';

/** Why there is no total BRUT allowance to state. Closed. */
export type BrutTotalAbsentReason =
    /** No FAR published AND no storey count derived — there is nothing to compute a total from. */
    | 'no-far-no-storeys'
    /** No permitted footprint at all, so neither route can run. */
    | 'no-permitted-footprint';

/** The inputs this module reads off a `BuildableEnvelope` (declared structurally so a partial,
 *  a persisted fallback ring, or a test fixture can all be passed without a cast). */
export interface BrutAllowanceInput {
    /** The PERMITTED buildable footprint area, m² — the card's ONE producer of it. */
    readonly permittedFootprintM2: number | null;
    /** `BuildableEnvelope.maxFAR`, or null when the pack published none. */
    readonly maxFAR: number | null;
    /** The PARCEL area (not the footprint), m² — FAR is a ratio of the parcel. */
    readonly parcelAreaM2: number | null;
    /** `BuildableEnvelope.maxFloors`, or null when the pack derived none. */
    readonly maxFloors: number | null;
}

export interface BrutAllowance {
    /**
     * The binding total buildable (BRUT) area, m². `null` ⇒ PRYZM does not know it.
     * ⛔ NEVER 0 AS A STAND-IN FOR UNKNOWN.
     */
    readonly totalBrutM2: number | null;
    /** How `totalBrutM2` was arrived at; `null` exactly when `totalBrutM2` is null. */
    readonly totalSource: BrutTotalSource | null;
    /** Set exactly when `totalBrutM2` is null — WHY there is no total. */
    readonly totalAbsentReason: BrutTotalAbsentReason | null;
    /** The FAR route's answer (m²), when a FAR and a parcel area both existed. Carried even when
     *  it did not bind, so a user can see the pair the decision was made from. */
    readonly farRouteM2: number | null;
    /** The geometry route's answer (footprint × storeys), when a storey count existed. */
    readonly geometryRouteM2: number | null;
    /**
     * The GROUND IMPLANTATION ceiling, m² — the permitted buildable footprint. Also the ceiling on
     * EVERY storey's plate (see `storeyFootprintCeilingM2`). `null` ⇒ no footprint solved.
     */
    readonly groundCeilingM2: number | null;
    /** One sentence naming where the total came from, or why there is none. Ready to render. */
    readonly statement: string;
}

const fin = (v: unknown): number | null =>
    typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;

/**
 * ⭐ THE ONE PRODUCER OF THE TWO ALLOWANCES. Pure; total; never throws.
 *
 * ⚠ WHEN BOTH ROUTES EXIST THE SMALLER BINDS, AND BOTH ARE CARRIED. A FAR of 0.27 on a 1,200 m²
 * parcel says 320 m²; a 200 m² footprint over 4 storeys says 800 m². You may not build 800 m²,
 * and you may not build 320 m² if you only have one storey — the binding answer is the minimum,
 * and hiding the loser is how a user comes to argue with a number whose partner they cannot see.
 */
export function resolveBrutAllowance(input: BrutAllowanceInput): BrutAllowance {
    const span = _tracer.startSpan('pryzm.site.resolveBrutAllowance');
    try {
        const footprint = fin(input.permittedFootprintM2);
        const far = fin(input.maxFAR);
        const parcel = fin(input.parcelAreaM2);
        const floors = fin(input.maxFloors);

        const farRouteM2 = far !== null && parcel !== null ? far * parcel : null;
        const geometryRouteM2 = footprint !== null && floors !== null ? footprint * floors : null;

        if (footprint === null) {
            span.setAttribute('pryzm.brut.absent', 'no-permitted-footprint');
            return {
                totalBrutM2: null,
                totalSource: null,
                totalAbsentReason: 'no-permitted-footprint',
                farRouteM2,
                geometryRouteM2: null,
                groundCeilingM2: null,
                statement:
                    'PRYZM has not solved a buildable footprint for this parcel, so it can state neither '
                    + 'a ground-floor implantation allowance nor a total buildable area. This is a gap in '
                    + 'what PRYZM knows — NOT a finding that nothing may be built.',
            };
        }

        if (farRouteM2 === null && geometryRouteM2 === null) {
            span.setAttribute('pryzm.brut.absent', 'no-far-no-storeys');
            return {
                totalBrutM2: null,
                totalSource: null,
                totalAbsentReason: 'no-far-no-storeys',
                farRouteM2: null,
                geometryRouteM2: null,
                groundCeilingM2: footprint,
                statement:
                    `PRYZM can implant ${footprint.toFixed(0)} m² on the ground here, but it does not know `
                    + 'the TOTAL buildable area: this ordinance publishes no floor-area ratio and PRYZM '
                    + 'derived no storey count. Until one of those exists PRYZM cannot tell you what '
                    + 'remains for the floors above — it will not guess a total.',
            };
        }

        let totalBrutM2: number;
        let totalSource: BrutTotalSource;
        if (farRouteM2 !== null && geometryRouteM2 !== null) {
            if (geometryRouteM2 < farRouteM2 - ALLOCATION_TOLERANCE_M2) {
                totalBrutM2 = geometryRouteM2;
                totalSource = 'far-capped-by-geometry';
            } else {
                totalBrutM2 = farRouteM2;
                totalSource = 'far';
            }
        } else if (farRouteM2 !== null) {
            totalBrutM2 = farRouteM2;
            totalSource = 'far';
        } else {
            totalBrutM2 = geometryRouteM2!;
            totalSource = 'footprint-times-storeys';
        }

        const statement =
            totalSource === 'far'
                ? `Total buildable area ${totalBrutM2.toFixed(0)} m² BRUT — the published floor-area ratio `
                  + `(${far!.toFixed(2)}) applied to this parcel's ${parcel!.toFixed(0)} m². Ground-floor `
                  + `implantation is capped separately at ${footprint.toFixed(0)} m².`
                : totalSource === 'far-capped-by-geometry'
                    ? `Total buildable area ${totalBrutM2.toFixed(0)} m² BRUT. The floor-area ratio would allow `
                      + `${farRouteM2!.toFixed(0)} m², but the massing cannot hold it: `
                      + `${footprint.toFixed(0)} m² over ${floors!.toFixed(0)} storeys is `
                      + `${geometryRouteM2!.toFixed(0)} m², and the smaller of the two binds.`
                    : `Total buildable area ${totalBrutM2.toFixed(0)} m² — ${footprint.toFixed(0)} m² of `
                      + `implantation over the ${floors!.toFixed(0)} storeys PRYZM derived. ⚠ This ordinance `
                      + `publishes no floor-area ratio, so this is what the massing can HOLD, not a stated `
                      + `BRUT limit.`;

        span.setAttribute('pryzm.brut.source', totalSource);
        span.setAttribute('pryzm.brut.totalM2', totalBrutM2);
        return {
            totalBrutM2,
            totalSource,
            totalAbsentReason: null,
            farRouteM2,
            geometryRouteM2,
            groundCeilingM2: footprint,
            statement,
        };
    } finally {
        span.end();
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. The allocation — what the user has taken, and what is left
// ─────────────────────────────────────────────────────────────────────────────

/** A storey the user can allocate to. Ordered by the caller; this module sorts by elevation. */
export interface AllocationStorey {
    readonly levelId: string;
    /** `null` when the level record carries none — never invented from the index. */
    readonly name: string | null;
    /** Metres above datum; `null` when unknown (sorted last, deterministically). */
    readonly elevation: number | null;
}

/** What the user asked to build on one storey. `requestedM2` is `unknown` on purpose — it comes
 *  from a text field and is CLASSIFIED here, never trusted. */
export interface AllocationRequest {
    readonly levelId: string;
    readonly requestedM2: unknown;
}

/** Why one storey's request could not be honoured. Closed — a sixth arm is a type error at every
 *  `switch`, which is the feature. */
export type AllocationRefusalReason =
    /** The field was empty or not a number. */
    | 'not-a-number'
    /** Zero or negative. */
    | 'not-positive'
    /** ⭐ Bigger than the parcel's implantation ceiling — a PLAN limit. */
    | 'exceeds-footprint-ceiling'
    /** ⭐ THE §25.2 ONE. Bigger than what is left of the total BRUT. Both numbers travel with it. */
    | 'exceeds-remaining-brut'
    /** A request naming a storey that is not in the project. */
    | 'unknown-storey';

/** What binds one storey's ceiling. Named so the panel can say WHY, not just what. */
export type AllocationCeilingSource =
    | 'footprint-ceiling'
    | 'remaining-brut'
    /** Both allow the same, within tolerance. */
    | 'both'
    /** No total BRUT is known, so only the footprint ceiling binds — stated, never silently
     *  treated as "the footprint is the whole answer". */
    | 'footprint-ceiling-total-unknown'
    /** Nothing is known — the storey cannot be allocated to at all. */
    | 'unknown';

export interface AllocationStoreyRow {
    readonly levelId: string;
    readonly name: string | null;
    readonly elevation: number | null;
    /** What the user asked for on this storey, once classified. `null` ⇒ nothing asked. */
    readonly requestedM2: number | null;
    /** What was ACCEPTED. `null` ⇒ nothing asked, or the request was refused.
     *  ⛔ A REFUSED REQUEST IS NEVER SILENTLY CLIPPED TO THE CEILING. */
    readonly allocatedM2: number | null;
    /** The most this storey may take, given the footprint ceiling and what other storeys hold.
     *  `null` ⇒ PRYZM cannot say (no footprint). */
    readonly ceilingM2: number | null;
    readonly ceilingSource: AllocationCeilingSource;
    /** Set exactly when the request was refused. */
    readonly refusal: AllocationRefusalReason | null;
    /** Plain language for this row — the refusal with both its numbers, or what was accepted. */
    readonly statement: string;
}

export interface BrutAllocationModel {
    readonly allowance: BrutAllowance;
    /** One row per storey, lowest first. Storeys with no request still get a row and a ceiling —
     *  the ceiling IS the answer to "how much can I put here?", asked before anything is typed. */
    readonly rows: readonly AllocationStoreyRow[];
    /** Sum of the ACCEPTED allocations, m². Always a number (0 when nothing is allocated — that
     *  is a finding, not an unknown). */
    readonly allocatedM2: number;
    /**
     * What is left of the total BRUT. `null` ⇒ the total is unknown.
     * ⛔ `null` IS NOT ZERO. Read `allowance.totalAbsentReason` for why.
     */
    readonly remainingM2: number | null;
    /** Requests that named a storey the project does not have. Counted, never silently dropped. */
    readonly unknownStoreyRequests: number;
    /**
     * ⭐ THE FOUNDER'S SENTENCE. On his worked example this reads:
     * *"You have allocated 200 m² of the 320 m² total buildable area, so 120 m² remains for the
     *  floors above."*
     */
    readonly statement: string;
}

const classify = (raw: unknown): { value: number | null; reason: AllocationRefusalReason | null } => {
    if (typeof raw === 'boolean' || raw === null || raw === undefined) {
        return { value: null, reason: 'not-a-number' };
    }
    const n = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isFinite(n)) return { value: null, reason: 'not-a-number' };
    if (!(n > 0)) return { value: n, reason: 'not-positive' };
    return { value: n, reason: null };
};

/**
 * ⭐ BUILD THE ALLOCATION. Pure; total; never throws.
 *
 * ⚠ THE ORDER IS LOAD-BEARING, AND IT IS THE FOUNDER'S ORDER. Storeys are processed LOWEST FIRST,
 * so the ground floor's request is subtracted from the total BEFORE the first floor's ceiling is
 * computed. That is literally §25.2: *"if the user takes 200 on the ground, the panel must TELL
 * THEM only 120 m² remains for the first floor."* Processing in any other order would give the
 * first floor a ceiling that ignores a decision the user has already made.
 *
 * ⚠ A REFUSED REQUEST CONSUMES NOTHING. It is not clipped, not partially honoured, and does not
 * reduce any other storey's ceiling — the user asked a question and got "no" with both numbers;
 * silently taking part of it would answer a question they did not ask.
 */
export function buildBrutAllocation(
    allowance: BrutAllowance,
    storeys: readonly AllocationStorey[],
    requests: readonly AllocationRequest[],
): BrutAllocationModel {
    const span = _tracer.startSpan('pryzm.site.buildBrutAllocation');
    try {
        // Lowest first; unknown elevations last, then by id — the same deterministic ordering
        // `intendedAreaChannel.ts` uses, so two folds about one project cannot disagree on order.
        const ordered = [...storeys].sort((a, b) => {
            if (a.elevation !== null && b.elevation !== null) return a.elevation - b.elevation;
            if (a.elevation !== null) return -1;
            if (b.elevation !== null) return 1;
            return a.levelId < b.levelId ? -1 : a.levelId > b.levelId ? 1 : 0;
        });

        const byLevel = new Map<string, AllocationRequest>();
        for (const r of requests) if (typeof r?.levelId === 'string' && r.levelId.length > 0) byLevel.set(r.levelId, r);
        const knownIds = new Set(ordered.map((s) => s.levelId));
        let unknownStoreyRequests = 0;
        for (const id of byLevel.keys()) if (!knownIds.has(id)) unknownStoreyRequests++;

        const footprintCeiling = allowance.groundCeilingM2;
        const total = allowance.totalBrutM2;

        const rows: AllocationStoreyRow[] = [];
        let allocatedM2 = 0;

        for (const s of ordered) {
            const remainingBrut = total === null ? null : Math.max(0, total - allocatedM2);
            // ⛔ EVERY storey's plate is bounded by the SAME buildable footprint — no storey may
            // overhang it. The ground implantation limit is therefore not a ground-floor-only
            // rule; naming it `groundCeilingM2` describes where the user meets it, not its reach.
            const ceilingM2 = footprintCeiling === null
                ? null
                : remainingBrut === null
                    ? footprintCeiling
                    : Math.min(footprintCeiling, remainingBrut);
            const ceilingSource: AllocationCeilingSource = footprintCeiling === null
                ? 'unknown'
                : remainingBrut === null
                    ? 'footprint-ceiling-total-unknown'
                    : Math.abs(footprintCeiling - remainingBrut) <= ALLOCATION_TOLERANCE_M2
                        ? 'both'
                        : footprintCeiling < remainingBrut
                            ? 'footprint-ceiling'
                            : 'remaining-brut';

            const label = s.name ?? (s.elevation !== null ? `storey at ${s.elevation.toFixed(2)} m` : s.levelId);
            const req = byLevel.get(s.levelId);
            if (req === undefined) {
                rows.push({
                    levelId: s.levelId,
                    name: s.name,
                    elevation: s.elevation,
                    requestedM2: null,
                    allocatedM2: null,
                    ceilingM2,
                    ceilingSource,
                    statement: ceilingM2 === null
                        ? `${label}: PRYZM has no buildable footprint for this parcel, so it cannot say how `
                          + 'much may go here.'
                        : ceilingSource === 'remaining-brut'
                            ? `${label}: up to ${ceilingM2.toFixed(0)} m² — that is all that is left of the `
                              + `${total!.toFixed(0)} m² total, not the ${footprintCeiling!.toFixed(0)} m² the `
                              + 'footprint would allow.'
                            : ceilingSource === 'footprint-ceiling-total-unknown'
                                ? `${label}: up to ${ceilingM2.toFixed(0)} m² by footprint. PRYZM does not know the `
                                  + 'total buildable area, so it cannot tell you what this would leave for the '
                                  + 'floors above.'
                                : `${label}: up to ${ceilingM2.toFixed(0)} m².`,
                    refusal: null,
                });
                continue;
            }

            const { value, reason } = classify(req.requestedM2);
            if (reason !== null) {
                rows.push({
                    levelId: s.levelId,
                    name: s.name,
                    elevation: s.elevation,
                    requestedM2: value,
                    allocatedM2: null,
                    ceilingM2,
                    ceilingSource,
                    refusal: reason,
                    statement: reason === 'not-a-number'
                        ? `${label}: enter an area in m².`
                        + (ceilingM2 !== null ? ` Up to ${ceilingM2.toFixed(0)} m² can go here.` : '')
                        : `${label}: an area has to be greater than zero.`
                        + (ceilingM2 !== null ? ` Up to ${ceilingM2.toFixed(0)} m² can go here.` : ''),
                });
                continue;
            }

            const want = value!;
            if (footprintCeiling !== null && want > footprintCeiling + ALLOCATION_TOLERANCE_M2) {
                // ⭐ THE PLAN REFUSAL IS DECIDED FIRST, so a user who exceeds the footprint hears
                // about the footprint — not about a BRUT remainder that happens to be smaller.
                // A refusal about coverage dressed as a refusal about totals sends the user to
                // change the wrong thing.
                rows.push({
                    levelId: s.levelId,
                    name: s.name,
                    elevation: s.elevation,
                    requestedM2: want,
                    allocatedM2: null,
                    ceilingM2,
                    ceilingSource,
                    refusal: 'exceeds-footprint-ceiling',
                    statement:
                        `${label}: you asked for ${want.toFixed(0)} m², but no storey may overhang the `
                        + `buildable footprint, which is ${footprintCeiling.toFixed(0)} m² — `
                        + `${(want - footprintCeiling).toFixed(0)} m² less than you asked for. Nothing was `
                        + 'allocated here.',
                });
                continue;
            }
            const remainingNow = total === null ? null : Math.max(0, total - allocatedM2);
            if (remainingNow !== null && want > remainingNow + ALLOCATION_TOLERANCE_M2) {
                rows.push({
                    levelId: s.levelId,
                    name: s.name,
                    elevation: s.elevation,
                    requestedM2: want,
                    allocatedM2: null,
                    ceilingM2,
                    ceilingSource,
                    refusal: 'exceeds-remaining-brut',
                    statement:
                        `${label}: you asked for ${want.toFixed(0)} m², but only ${remainingNow.toFixed(0)} m² `
                        + `is left of the ${total!.toFixed(0)} m² total buildable area — you have already `
                        + `allocated ${allocatedM2.toFixed(0)} m² below. Nothing was allocated here. Reduce a `
                        + 'lower floor, or take less here.',
                });
                continue;
            }

            allocatedM2 += want;
            rows.push({
                levelId: s.levelId,
                name: s.name,
                elevation: s.elevation,
                requestedM2: want,
                allocatedM2: want,
                ceilingM2,
                ceilingSource,
                refusal: null,
                statement: `${label}: ${want.toFixed(0)} m² allocated.`,
            });
        }

        const remainingM2 = total === null ? null : total - allocatedM2;

        // ⭐ THE FOUNDER'S SENTENCE, and the three arms it must have.
        const statement = total === null
            ? (allowance.totalAbsentReason === 'no-permitted-footprint'
                ? 'PRYZM has no buildable footprint for this parcel, so there is no allowance to divide '
                  + 'between floors. This is a gap in what PRYZM knows, not a finding that nothing may be built.'
                : `You have allocated ${allocatedM2.toFixed(0)} m² so far. PRYZM does not know the TOTAL `
                  + 'buildable area for this parcel, so it cannot tell you what remains for the floors above '
                  + '— and it will not guess a total in order to produce a remainder.')
            : remainingM2! <= ALLOCATION_TOLERANCE_M2 && remainingM2! >= -ALLOCATION_TOLERANCE_M2
                ? `You have allocated ${allocatedM2.toFixed(0)} m² of the ${total.toFixed(0)} m² total buildable `
                  + 'area. Nothing remains for further floors.'
                : remainingM2! < 0
                    ? `You have allocated ${allocatedM2.toFixed(0)} m² against a ${total.toFixed(0)} m² total — `
                      + `${Math.abs(remainingM2!).toFixed(0)} m² MORE than the ordinance allows. Reduce a floor.`
                    : `You have allocated ${allocatedM2.toFixed(0)} m² of the ${total.toFixed(0)} m² total buildable `
                      + `area, so ${remainingM2!.toFixed(0)} m² remains for the floors above.`;

        span.setAttribute('pryzm.brut.allocatedM2', allocatedM2);
        span.setAttribute('pryzm.brut.remainingKnown', remainingM2 !== null);
        span.setAttribute('pryzm.brut.rows', rows.length);
        return Object.freeze({
            allowance,
            rows: Object.freeze(rows),
            allocatedM2,
            remainingM2,
            unknownStoreyRequests,
            statement,
        });
    } finally {
        span.end();
    }
}
