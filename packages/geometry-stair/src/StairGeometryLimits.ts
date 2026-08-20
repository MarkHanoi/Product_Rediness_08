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
import { BUILT_IN_STAIR_TYPES } from './StairTypeDefinitions';

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
    /**
     * §L-1434 — the cap on ONE FLIGHT, in METRES OF RISE.
     *
     * ── WHY THIS IS A RISE AND NOT THE RISER COUNT THAT WAS DECLARED ──────────
     *
     * `MAX_RISERS_PER_FLIGHT: 16` was declared in THREE files
     * (`geometry-stair/StairTypes`, `core-app-model/stores/StairTypes`,
     * `constraint-solver/stair-constraint-engine`) and **read by nobody** —
     * measured 2026-08-20: five grep hits, every one a declaration, zero readers on
     * create, update, validate or the sketch tool. It became urgent because L-1433
     * made the multi-storey stair real: a Ground→L5 stair is ~86 risers, and as an
     * I- or L-shape that is one or two flights.
     *
     * ⭐⭐ ENFORCING 16 AS DECLARED WOULD HAVE SHIPPED A WORSE DEFECT THAN THE ONE
     * IT CLOSES, and this is only discoverable by trying to enforce it. Measured:
     * an ORDINARY 3.0 m storey at the 175 mm comfort default solves to **17
     * risers** (`round(3.0 / 0.175)`, actual riser 176.5 mm). A hard cap of 16
     * therefore REFUSES the single most common stair in the product. A limit
     * nobody reads is a limit nobody has ever validated — and this one is wrong in
     * the direction that refuses legal stairs.
     *
     * ⭐ The reason it is wrong is a CATEGORY ERROR, not a typo. What building
     * codes actually regulate is the VERTICAL RISE between landings — CTE DB-SUA
     * (residential: a flight saves at most 3.20 m), IBC 1011.8 (12 ft ≈ 3.66 m).
     * A riser COUNT is that rule divided by an assumed riser height: 16 × 200 mm =
     * 3.20 m. Our own `MAX_RISER_HEIGHT` is 190 mm and the typical solved riser is
     * 176 mm, so the count form silently tightens as risers get shallower — which
     * is exactly backwards, because a shallower riser makes a flight *more*
     * comfortable, not less.
     *
     * ⛔ SO THE THRESHOLD IS DERIVED FROM THE CONSTANTS THAT ALREADY EXIST —
     * `MAX_RISERS_PER_FLIGHT × MAX_RISER_HEIGHT` = 16 × 0.190 = **3.04 m** — and NO
     * NEW NUMBER IS INVENTED. Derived this way it can never refuse anything the
     * declared count would have allowed, so enforcement cannot regress a project
     * that was legal under the old (unread) rule.
     *
     * ⚠ 3.04 m is a DERIVATION, **not a cited code value**. The real instrument
     * must be named when the jurisdiction question behind `MIN_TREAD_DEPTH`
     * (250 vs CTE's 220) is answered — it is the same open question, on the same
     * missing source of authority. See C98.
     */
    readonly maxFlightRise: number;
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
        // DERIVED, never stored — see `maxFlightRise` above for why the declared
        // riser COUNT is the wrong quantity and why this is the safe direction.
        maxFlightRise: constraints.MAX_RISERS_PER_FLIGHT * constraints.MAX_RISER_HEIGHT,
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
        | 'STAIR-ACCESSIBLE-WIDTH-TOO-NARROW'
        | 'STAIR-FLIGHT-RISE-TOO-TALL';
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
    /**
     * Per-flight treads and riser counts, as built. A missing field is skipped,
     * never defaulted — a partial candidate is checked on what it carries.
     */
    readonly flights?: ReadonlyArray<{ readonly treadDepth?: number; readonly riserCount?: number }>;
    readonly width?: number;
    /** Only `'accessible'` raises the width floor; any other value leaves it. */
    readonly accessibilityType?: string;
}

const mm = (m: number): string => `${(m * 1000).toFixed(0)}mm`;

/**
 * ⭐ §L-1441.3.b (lane RAC2's finding, closed here) — RESOLVE A TYPE'S OWN RULES.
 *
 * `CreateStairCommand` resolves per-type limits from `stairTypeStore`; the sketch
 * tool had no type store and so validated against the DEFAULTS. That is not a
 * harmless asymmetry, because TWO OF THE FIVE BUILT-IN TYPES ARE **LOOSER** than
 * `STAIR_CONSTRAINTS`:
 *
 *     timber-closed       maxRiserHeight 0.220 ⬆   minTreadDepth 0.220 ⬇
 *     residential-timber  maxRiserHeight 0.220 ⬆   minTreadDepth 0.220 ⬇
 *
 * So a 230 mm tread on a `residential-timber` stair is PERMITTED by the command
 * and would have been REFUSED by the tool — the §L-1430 breach running backwards.
 * ⭐ A false refusal minted by a safety check is WORSE than no check: it tells the
 * user the model forbids something the model permits, in the voice of a validator.
 *
 * ⚠ Built-ins only. A CUSTOM type lives in a `StairTypeStore` instance that this
 * pure module cannot reach, and it falls back to the defaults — stated, not
 * hidden. Custom types cannot currently be authored through the stair-path tool,
 * so the residual is unreachable today; if that changes, the tool must be handed
 * resolved rules rather than a type id.
 */
export function builtInStairTypeRules(typeId?: string): StairTypeGeometryRules | null {
    if (!typeId) return null;
    const t = BUILT_IN_STAIR_TYPES.find(d => d.id === typeId);
    return t?.rules ?? null;
}

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

            // §L-1434 — the cap that was declared three times and enforced nowhere,
            // measured on the quantity codes actually regulate (see `maxFlightRise`).
            // ⭐ The refusal names BOTH numbers AND the action (C16 CA-18): a user
            // told only "too tall" cannot act, and one told only "max 3.04 m" does
            // not know how far over they are.
            const risers = flights[i]?.riserCount;
            if (risers !== undefined && Number.isFinite(risers) && risers > 0
                && r !== undefined && Number.isFinite(r)) {
                const rise = risers * r;
                if (rise > limits.maxFlightRise + 1e-9) {
                    out.push({
                        code: 'STAIR-FLIGHT-RISE-TOO-TALL',
                        field: `flights[${i}].riserCount`,
                        message:
                            `Run ${i + 1} climbs ${rise.toFixed(2)} m in one flight (${risers} risers), ` +
                            `above the maximum ${limits.maxFlightRise.toFixed(2)} m without a landing — ` +
                            `add a landing to split it, or reduce the levels this stair spans`,
                        currentValue: rise,
                        requiredValue: limits.maxFlightRise,
                        flightIndex: i,
                    });
                }
            }
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
