// ─── §STAIR-ONE-LIMIT-AUTHORITY (L-1430) ─────────────────────────────────────
//
// THE DEFECT THIS MODULE EXISTS TO CLOSE, founder-measured in one session's log:
//
//   [StairPathToolController] Cannot finish: invalid — Run too short — tread 218 mm (min 220 mm)
//   [CommandManager] REFUSED CREATE_STAIR: Tread depth 222mm is below minimum 250mm
//
// TWO layers enforced TWO different minima on TWO different quantities:
//
//   • the SKETCH TOOL (`StairSolver2D`) refused below **220 mm**, measured on the
//     PER-SEGMENT tread `seg.flightLength / seg.stepCount`;
//   • the COMMAND (`CreateStairCommand.canExecute`) refused below **250 mm**,
//     measured on the AVERAGED tread `Σ seg.length / totalSteps` that
//     `StairPathAdapter` actually hands it.
//
// So a stair the tool ACCEPTED was thrown away by the pipeline — a direct
// C84 EI-3 breach ("UI offers ⇒ pipeline accepts") — and the two numbers in the
// two messages were not even the same measurement, which is why they differed by
// 4 mm rather than by 30.
//
// ⭐ THE FIX IS NOT "EDIT 220 TO 250". Two hand-copied numbers that agree today
// drift again tomorrow — this repo has the same shape recorded four times over
// (C84 EI-1: one authority, never two agreeing copies). Both layers now READ the
// limits from here and evaluate the SAME predicate on the SAME quantity:
//
//   • `resolveStairGeometryLimits()`  — the numbers, from `STAIR_CONSTRAINTS`.
//   • `checkStairGeometry()`          — the predicate, shared verbatim.
//   • `deriveCommittedTreadDepth()`   — the QUANTITY, derived once, so the tool
//                                       validates the value the command receives
//                                       rather than a cousin of it.
//
// ── WHAT THIS MODULE DELIBERATELY IS NOT ─────────────────────────────────────
//
// It is NOT a building-code engine. Tread and riser minima are code-dependent
// (jurisdiction, occupancy, private vs common stair), and `C98-ELEMENT-STAIR.md`
// names NO source of authority for stair geometry limits — measured 2026-08-20;
// the contract's §12 covers datum and mesh stacks only. The repo's one gesture
// toward it is `STAIR_CONSTRAINTS_REGIONS` in `StairValidationAuthority`, a
// three-key record with 'AS-1657' and 'EUROPEAN' aliased to the SAME object.
// That gap is recorded in C98 §13 rather than closed here: inventing a
// jurisdiction resolver behind a defect fix would be the larger error.
// `resolveStairGeometryLimits` therefore takes the constraint set as a parameter,
// so the day a real code resolver exists it feeds this module instead of
// replacing it.

import { STAIR_CONSTRAINTS, StairValidationConstraints } from './StairTypes';

/** The four limits that BOTH the sketch tool and the create command enforce. */
export interface StairGeometryLimits {
    readonly minRiserHeight: number;
    readonly maxRiserHeight: number;
    readonly minTreadDepth: number;
    readonly maxTreadDepth: number;
    /**
     * §L-1435 — WIDTH joined this set because lane RAC2 measured the SAME defect
     * on it, between two other layers: `element.updateDimensionsBatch` validates
     * POSITIVITY ONLY, while the single-stair route enforces `STAIR_CONSTRAINTS`.
     * So a BULK route can set a width the SINGLE route refuses — the 220/250 tread
     * breach again, tool-vs-command replaced by bulk-vs-single.
     * ⛔ Publishing this here does NOT close that seam: the bulk route must
     * DISPATCH to a per-family predicate, and it does not. See the note on
     * `checkStairGeometry`.
     */
    readonly minWidth: number;
    readonly minAccessibleWidth: number;
}

/**
 * Per-stair-type overrides, as `StairTypeStore.resolveRules()` returns them.
 * A type may tighten (or loosen) tread and riser; it has no say over max tread.
 */
export interface StairTypeGeometryRules {
    readonly maxRiserHeight?: number;
    readonly minTreadDepth?: number;
}

/**
 * THE limits, resolved once. `constraints` defaults to `STAIR_CONSTRAINTS` — the
 * same object `CreateStairCommand`, `UpdateStairParametersCommand` and
 * `StairValidationAuthority` already read.
 *
 * Type rules are applied exactly as `CreateStairCommand.canExecute` applied them
 * before this module existed: a present override replaces the default, an absent
 * one leaves it.
 */
export function resolveStairGeometryLimits(
    constraints: StairValidationConstraints = STAIR_CONSTRAINTS,
    typeRules?: StairTypeGeometryRules | null,
): StairGeometryLimits {
    return {
        minRiserHeight: constraints.MIN_RISER_HEIGHT,
        maxRiserHeight: typeRules?.maxRiserHeight ?? constraints.MAX_RISER_HEIGHT,
        minTreadDepth: typeRules?.minTreadDepth ?? constraints.MIN_TREAD_DEPTH,
        maxTreadDepth: constraints.MAX_TREAD_DEPTH,
        minWidth: constraints.MIN_WIDTH,
        minAccessibleWidth: constraints.MIN_ACCESSIBLE_WIDTH,
    };
}

/** One refusal. `field`/`code` match the vocabulary `StairValidationAuthority` emits. */
export interface StairGeometryRefusal {
    readonly code:
        | 'STAIR-RISER-TOO-LOW'
        | 'STAIR-RISER-TOO-HIGH'
        | 'STAIR-TREAD-TOO-SHALLOW'
        | 'STAIR-TREAD-TOO-DEEP'
        | 'STAIR-WIDTH-TOO-NARROW'
        | 'STAIR-ACCESSIBLE-WIDTH-TOO-NARROW';
    readonly field: string;
    readonly message: string;
    readonly currentValue: number;
    readonly requiredValue: number;
    /** Present when the refusal is about ONE flight's tread rather than the scalar. */
    readonly flightIndex?: number;
}

/**
 * The candidate stair geometry, as either layer knows it.
 *
 * ⭐ A STAIR HAS **TWO** TREAD-DEPTH QUANTITIES AND THE OLD CODE VALIDATED ONE
 * EACH. `StairPathAdapter` emits BOTH: a scalar `treadDepth`
 * (`Σ seg.length / totalSteps`) and a PER-FLIGHT `flights[i].treadDepth`
 * (`seg.flightLength / seg.stepCount`). They are not equal on any L- or U-shape,
 * because a corner landing consumes part of the drawn segment. The per-flight
 * value is the one `StairMeshBuilder` actually builds with; the scalar is the one
 * the command's `canExecute` read. Validating either alone leaves the other
 * unchecked, so the candidate carries both and the predicate checks both.
 */
export interface StairGeometryCandidate {
    readonly riserHeight?: number;
    /**
     * The scalar tread depth that WILL BE COMMITTED — for the sketch tool that
     * means the value `deriveCommittedTreadDepth` produces, not a per-segment tread.
     */
    readonly treadDepth?: number;
    /** Per-flight treads, as built. Entries without one are skipped, not defaulted. */
    readonly flights?: ReadonlyArray<{ readonly treadDepth?: number }>;
    readonly width?: number;
    /** Only `'accessible'` raises the width floor; any other value leaves it. */
    readonly accessibilityType?: string;
}

const mm = (m: number): string => `${(m * 1000).toFixed(0)}mm`;

/**
 * ⭐ THE PREDICATE. The accept-set of a stair's geometry is exactly
 * `checkStairGeometry(c, limits).length === 0` — at EVERY layer that has an
 * opinion. A layer that wants to refuse MORE must say so in its own words and be
 * recorded; it may never disagree about THESE four.
 *
 * `undefined` is not a violation: a partial candidate (the property panel editing
 * one field) is checked on the fields it carries, exactly as
 * `StairValidationAuthority.validate` has always done.
 *
 * ⚠ **A KNOWN SEAM THIS FUNCTION DOES NOT YET REACH (L-1435).** Lane RAC2 measured
 * that `element.updateDimensionsBatch` validates POSITIVITY ONLY, so a BULK width
 * edit can set a value the SINGLE-stair route refuses. That is this same defect
 * between two different layers. The predicate is ready for it — `width` and
 * `accessibilityType` are on the candidate — but the generic bulk route has no
 * per-family dispatch to call it through, and inventing one belongs with the
 * bulk-route owner, not smuggled in here. Stated so the gap is visible.
 */
export function checkStairGeometry(
    candidate: StairGeometryCandidate,
    limits: StairGeometryLimits,
): StairGeometryRefusal[] {
    const out: StairGeometryRefusal[] = [];

    const r = candidate.riserHeight;
    if (r !== undefined && Number.isFinite(r)) {
        if (r < limits.minRiserHeight) {
            out.push({
                code: 'STAIR-RISER-TOO-LOW', field: 'riserHeight',
                message: `Riser height ${mm(r)} is below minimum ${mm(limits.minRiserHeight)}`,
                currentValue: r, requiredValue: limits.minRiserHeight,
            });
        } else if (r > limits.maxRiserHeight) {
            out.push({
                code: 'STAIR-RISER-TOO-HIGH', field: 'riserHeight',
                message: `Riser height ${mm(r)} exceeds maximum ${mm(limits.maxRiserHeight)}`,
                currentValue: r, requiredValue: limits.maxRiserHeight,
            });
        }
    }

    const w = candidate.width;
    if (w !== undefined && Number.isFinite(w)) {
        if (w < limits.minWidth) {
            out.push({
                code: 'STAIR-WIDTH-TOO-NARROW', field: 'width',
                message: `Stair width ${mm(w)} is below minimum ${mm(limits.minWidth)}`,
                currentValue: w, requiredValue: limits.minWidth,
            });
        }
        if (candidate.accessibilityType === 'accessible' && w < limits.minAccessibleWidth) {
            out.push({
                code: 'STAIR-ACCESSIBLE-WIDTH-TOO-NARROW', field: 'width',
                message: `Accessible stair width ${mm(w)} is below minimum ${mm(limits.minAccessibleWidth)}`,
                currentValue: w, requiredValue: limits.minAccessibleWidth,
            });
        }
    }

    pushTreadRefusals(out, candidate.treadDepth, limits, 'treadDepth', undefined);

    const flights = candidate.flights;
    if (flights) {
        for (let i = 0; i < flights.length; i++) {
            pushTreadRefusals(out, flights[i]?.treadDepth, limits, `flights[${i}].treadDepth`, i);
        }
    }

    return out;
}

function pushTreadRefusals(
    out: StairGeometryRefusal[],
    t: number | undefined,
    limits: StairGeometryLimits,
    field: string,
    flightIndex: number | undefined,
): void {
    if (t === undefined || !Number.isFinite(t)) return;
    const where = flightIndex === undefined ? 'Tread depth' : `Run ${flightIndex + 1} tread depth`;
    if (t < limits.minTreadDepth) {
        out.push({
            code: 'STAIR-TREAD-TOO-SHALLOW', field,
            message: `${where} ${mm(t)} is below minimum ${mm(limits.minTreadDepth)}`,
            currentValue: t, requiredValue: limits.minTreadDepth, flightIndex,
        });
    } else if (t > limits.maxTreadDepth) {
        out.push({
            code: 'STAIR-TREAD-TOO-DEEP', field,
            message: `${where} ${mm(t)} exceeds maximum ${mm(limits.maxTreadDepth)}`,
            currentValue: t, requiredValue: limits.maxTreadDepth, flightIndex,
        });
    }
}

/**
 * ⭐ THE QUANTITY, derived ONCE.
 *
 * `StairPathAdapter.toCreateStairInput` hands `CreateStairCommand` a SINGLE
 * `treadDepth` computed as `Σ segment.length / totalSteps` (§STAIR-PREVIEW-MATCH
 * -2026-04-25: the value the plan preview and the HUD already show). The sketch
 * tool used to validate `seg.flightLength / seg.stepCount` instead — a DIFFERENT
 * number, smaller by the landing consumption on every L- and U-shape. Two layers
 * disagreeing about a NUMBER usually means they disagree about the DEFINITION,
 * and here they did.
 *
 * Both callers now import this function, so the definition cannot fork again.
 *
 * @param segments   solved runs; `length` is the drawn segment length (landing
 *                   consumption INCLUDED — that is what the adapter sums).
 * @param totalSteps risers distributed across all segments.
 * @param fallback   the ideal preferred tread, used when the sum is degenerate.
 */
export function deriveCommittedTreadDepth(
    segments: ReadonlyArray<{ readonly length: number }>,
    totalSteps: number,
    fallback: number,
): number {
    const totalLen = segments.reduce((s, seg) => s + seg.length, 0);
    return totalSteps > 0 && totalLen > 0 ? totalLen / totalSteps : fallback;
}
