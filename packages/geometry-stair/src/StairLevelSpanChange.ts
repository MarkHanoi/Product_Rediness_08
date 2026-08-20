// ─── §STAIR-LEVEL-SPAN-CHANGE (L-1533) ───────────────────────────────────────
//
// FOUNDER (item 0.2): "Be able to change stair Base level + top level."
//
// ⭐ THIS IS NOT A FIELD WRITE, AND TREATING IT AS ONE IS THE DEFECT THIS MODULE
// EXISTS TO PREVENT. `StairData.baseLevelId` / `topLevelId` are not descriptive
// labels; they are the two ends of the span the whole stair is solved against.
// The invariant `CreateStairCommand.canExecute` and `StairValidationAuthority`
// both enforce is
//
//      riserHeight × Σ flights[i].riserCount  ===  topElevation − baseElevation
//                                                  (± HEIGHT_TOLERANCE)
//
// so writing a new `topLevelId` and nothing else produces a stair that FAILS its
// own validator the next time anything looks at it, renders at the old height,
// and pierces the wrong decks. The span change must re-solve the riser
// distribution in the same breath.
//
// ── WHAT THIS MODULE DOES AND DOES NOT DECIDE ────────────────────────────────
//
// It DERIVES the new riser distribution and NOTHING ELSE. It owns no limits and
// no accept-set of its own — that would be the second rule set C84 EI-1 forbids,
// and this family has already paid for one (§STAIR-ONE-LIMIT-AUTHORITY, L-1430:
// the tool refused below 220 mm and the command below 250 mm). Validation of the
// result is the caller's, through the three authorities that already exist:
//
//   • `StairValidationAuthority.validate` — same-level, level existence, riser /
//     tread / width bounds, riser count, and the height-match invariant above;
//   • `checkStairGeometry` + `resolveStairGeometryLimits` — the shared predicate,
//     including the §L-1434 per-flight RISE cap the authority does not carry;
//   • `LevelTraversalPolicy.canTraverse` — the per-type level-skip cap.
//
// ⚠ §L-1437's LESSON, LOAD-BEARING HERE. Two of the five built-in stair types
// (`timber-closed`, `residential-timber`) are LOOSER than `STAIR_CONSTRAINTS`.
// A caller that validates a re-solved span WITHOUT the stair's type store in the
// validation context will refuse spans the model permits — "one AUTHORITY is not
// one RESOLUTION of it". Both `StairValidationContext.typeStore` and
// `resolveStairGeometryLimits`'s `typeRules` must be supplied.
//
// ── THE RE-SOLVE ─────────────────────────────────────────────────────────────
//
// Riser height is DERIVED from the height, never the other way round, so the
// product is exact and the HEIGHT_TOLERANCE check cannot fail on rounding. That
// is `deriveRisers`, already the single owner of that arithmetic for the creation
// path — this module calls it rather than repeating it.
//
// The NOMINAL riser handed to `deriveRisers` is the stair's CURRENT riser height,
// not the 175 mm library default: the architect chose that riser, and a span
// change should move the stair as little as the new span allows. A stair at
// 150 mm risers re-pointed one storey up stays near 150 mm.
//
// Risers are redistributed across the EXISTING flights in proportion to their
// current counts, so an L- or U-shape keeps its landing roughly where the
// architect put it. Every flight keeps at least one riser (a zero-riser flight is
// a degenerate run the mesh builder cannot build), and the largest flight absorbs
// the rounding remainder so the total is EXACT — the invariant above is an
// equality, not an approximation.
//
// Pure: no DOM, no THREE, no I/O, no store access.

import { deriveRisers, type StairLevelInput } from './StairVerticalSpanResolver';
import { StairValidationAuthority } from './StairValidationAuthority';
import { LevelTraversalPolicy } from './LevelTraversalPolicy';
import { resolveStairGeometryLimits, checkStairGeometry } from './StairGeometryLimits';
import { STAIR_CONSTRAINTS, type StairValidationConstraints } from './StairTypes';
import type { StairData } from './StairTypes';
import type { StairTypeStore } from './StairTypeStore';
import type { Level } from '@pryzm/geometry-wall';

/** Minimum span (metres) below which a stair is geometrically meaningless. */
export const MIN_LEVEL_SPAN = 0.05;

/** One flight, as much of it as the re-solve reads and writes. */
export interface StairFlightRisers {
    readonly riserCount: number;
}

/** The re-solved distribution, or the reason no distribution exists. */
export type StairLevelSpanResolve =
    | {
          readonly status: 'ok';
          readonly baseLevelId: string;
          readonly topLevelId: string;
          readonly baseElevation: number;
          readonly topElevation: number;
          /** `topElevation − baseElevation`. Always > MIN_LEVEL_SPAN. */
          readonly height: number;
          /** Derived so that `riserHeight × riserCount === height` exactly. */
          readonly riserHeight: number;
          readonly riserCount: number;
          /** Per-flight counts, same length and order as the input flights. */
          readonly flightRiserCounts: readonly number[];
      }
    /**
     * The span itself is not authorable. `requested` and `limit` are BOTH named so
     * the refusal can state what was asked AND what is allowed (the founder's
     * standing doctrine on refusals) — `limit` is `null` only for the two codes
     * where no numeric limit exists (a missing level, an identical pair).
     */
    | {
          readonly status: 'refused';
          readonly code: StairLevelSpanRefusalCode;
          readonly message: string;
          readonly requested: number | string;
          readonly limit: number | string | null;
      };

export type StairLevelSpanRefusalCode =
    /** Base and top name the same level. */
    | 'STAIR-SPAN-SAME-LEVEL'
    /** One of the two ids is not in the level table. */
    | 'STAIR-SPAN-LEVEL-NOT-FOUND'
    /** The two elevations are equal, or the top is BELOW the base. */
    | 'STAIR-SPAN-NOT-CLIMBABLE'
    /** The span is positive but smaller than a stair can express. */
    | 'STAIR-SPAN-TOO-SHORT';

function elevationOf(level: StairLevelInput): number {
    return Number(level.elevation ?? level.height ?? 0);
}

const mm = (m: number): string => `${(m * 1000).toFixed(0)}mm`;

/**
 * Re-solve a stair's riser distribution for a NEW base/top level pair.
 *
 * @param levels             every level in the project (any order).
 * @param baseLevelId        the requested base level.
 * @param topLevelId         the requested top level.
 * @param currentRiserHeight the stair's riser height today — the nominal the
 *                           re-solve stays as close to as the new span allows.
 * @param flights            the stair's flights today; their riser counts set the
 *                           proportions the new total is split by.
 */
export function resolveStairLevelSpanChange(
    levels: readonly StairLevelInput[],
    baseLevelId: string,
    topLevelId: string,
    currentRiserHeight: number,
    flights: readonly StairFlightRisers[],
): StairLevelSpanResolve {
    if (baseLevelId === topLevelId) {
        return {
            status: 'refused',
            code: 'STAIR-SPAN-SAME-LEVEL',
            message: `Base level and top level are both "${baseLevelId}" — a stair must climb between two different levels`,
            requested: baseLevelId,
            limit: null,
        };
    }

    const base = levels.find(l => l.id === baseLevelId);
    const top = levels.find(l => l.id === topLevelId);
    if (!base || !top) {
        const missing = !base ? baseLevelId : topLevelId;
        return {
            status: 'refused',
            code: 'STAIR-SPAN-LEVEL-NOT-FOUND',
            message:
                `Level "${missing}" does not exist in this project ` +
                `(known levels: ${levels.map(l => l.id).join(', ') || 'none'})`,
            requested: missing,
            limit: levels.map(l => l.id).join(', ') || 'none',
        };
    }

    const baseElevation = elevationOf(base);
    const topElevation = elevationOf(top);
    const height = topElevation - baseElevation;

    if (height <= 0) {
        // ⭐ NOT silently flipped. A stair whose "top" is at or below its "base" is
        // the founder asking for something the model cannot express, and quietly
        // swapping the two ends would author a stair they did not draw.
        return {
            status: 'refused',
            code: 'STAIR-SPAN-NOT-CLIMBABLE',
            message:
                `Top level "${top.name ?? topLevelId}" is at ${topElevation.toFixed(3)} m, ` +
                `at or below base level "${base.name ?? baseLevelId}" at ${baseElevation.toFixed(3)} m — ` +
                `a stair must rise. Pick a top level above ${baseElevation.toFixed(3)} m.`,
            requested: topElevation,
            limit: baseElevation,
        };
    }
    if (height < MIN_LEVEL_SPAN) {
        return {
            status: 'refused',
            code: 'STAIR-SPAN-TOO-SHORT',
            message:
                `That span rises ${mm(height)}, below the ${mm(MIN_LEVEL_SPAN)} minimum a stair can express — ` +
                `use a ramp or a level change instead`,
            requested: height,
            limit: MIN_LEVEL_SPAN,
        };
    }

    const nominal = Number.isFinite(currentRiserHeight) && currentRiserHeight > 0
        ? currentRiserHeight
        : undefined;
    const derived = nominal === undefined ? deriveRisers(height) : deriveRisers(height, nominal);

    return {
        status: 'ok',
        baseLevelId,
        topLevelId,
        baseElevation,
        topElevation,
        height,
        riserHeight: derived.riserHeight,
        riserCount: derived.riserCount,
        flightRiserCounts: distributeRisers(derived.riserCount, flights),
    };
}

/**
 * Split `total` risers across `flights` in proportion to their current counts.
 *
 * Guarantees, in this order:
 *   1. `Σ result === total` EXACTLY — the height invariant is an equality.
 *   2. every flight gets ≥ 1 riser — a zero-riser run is not buildable.
 *   3. proportions are preserved as closely as (1) and (2) allow, so an L/U
 *      stair's landing stays roughly where the architect placed it.
 *
 * When `total` is smaller than the flight count, (2) cannot hold for every
 * flight and (1) wins: the surplus flights are given 1 each and the excess is
 * taken from the largest, which is what a caller's validator will then refuse
 * on riser count rather than this function silently dropping a run.
 */
export function distributeRisers(
    total: number,
    flights: readonly StairFlightRisers[],
): number[] {
    const n = flights.length;
    if (n === 0) return [];
    if (n === 1) return [total];

    const currentTotal = flights.reduce((s, f) => s + Math.max(0, f.riserCount || 0), 0);
    // No usable proportions (a brand-new or malformed flight set) — split evenly.
    const weights = currentTotal > 0
        ? flights.map(f => Math.max(0, f.riserCount || 0) / currentTotal)
        : flights.map(() => 1 / n);

    const raw = weights.map(w => Math.max(1, Math.round(w * total)));
    let drift = raw.reduce((s, v) => s + v, 0) - total;

    // Absorb the rounding remainder, always from the flight that can most afford
    // it, and never below one riser.
    while (drift !== 0) {
        if (drift > 0) {
            let idx = 0;
            for (let i = 1; i < n; i++) if (raw[i]! > raw[idx]!) idx = i;
            if (raw[idx]! <= 1) break;          // cannot shrink further — see doc-comment
            raw[idx]!--; drift--;
        } else {
            let idx = 0;
            for (let i = 1; i < n; i++) if (raw[i]! < raw[idx]!) idx = i;
            raw[idx]!++; drift++;
        }
    }
    return raw;
}


// ─── THE ONE GATE (L-1533) ───────────────────────────────────────────────────

/** What `evaluateStairLevelSpanChange` was asked, and what it decided. */
export type StairLevelSpanVerdict =
    | {
          readonly ok: true;
          readonly baseLevelId: string;
          readonly topLevelId: string;
          readonly height: number;
          readonly riserHeight: number;
          readonly riserCount: number;
          readonly flightRiserCounts: readonly number[];
          /** Non-blocking notes (e.g. "this stair skips 2 intermediate levels"). */
          readonly warnings: readonly string[];
      }
    | {
          readonly ok: false;
          /** One sentence per refusal. EVERY one names what was asked AND the limit. */
          readonly refusals: readonly string[];
      };

/**
 * ⭐ THE SINGLE PLACE THAT ANSWERS "may this stair change to THIS base/top pair,
 * and what does it become if it does?" — for the COMMAND and for the PANEL alike.
 *
 * WHY IT IS ONE FUNCTION AND NOT TWO CALL SITES OF THREE AUTHORITIES. The panel
 * must be able to grey out an unbuildable pair and say why; the command must
 * refuse the same pair for the same reason. Composing the three authorities
 * separately in each place is exactly the shape that produced
 * §STAIR-ONE-LIMIT-AUTHORITY (L-1430 — the tool refused a 218 mm tread while the
 * command refused below 250 mm) and the rake panel's rival gate
 * (§FEAT-RAKE-LAYERED — "the copy is gone; the DECISION comes from the one gate,
 * only the WORDING is local"). So the COMPOSITION is the gate, and both callers
 * ask it rather than re-assembling it.
 *
 * It owns NO limits of its own. Its three constituents are:
 *   1. {@link resolveStairLevelSpanChange} — is the SPAN authorable, and what
 *      riser distribution does it imply?
 *   2. `LevelTraversalPolicy.canTraverse`  — may this TYPE skip that many levels?
 *   3. `StairValidationAuthority.validate` + `checkStairGeometry` — is the RESULT
 *      a legal stair? (The second adds the §L-1434 per-flight RISE cap, which the
 *      authority does not carry.)
 *
 * ⚠ §L-1437: `typeStore` is threaded into BOTH (2) and (3). Two of the five
 * built-in types are LOOSER than `STAIR_CONSTRAINTS`; validating without it mints
 * false refusals — the L-1430 breach running backwards.
 *
 * Pure. Takes the level table and the type store; touches no store of its own.
 */
export function evaluateStairLevelSpanChange(args: {
    readonly stair: Pick<StairData, 'baseLevelId' | 'topLevelId' | 'riserHeight' | 'treadDepth' | 'width' | 'flights' | 'accessibilityType' | 'typeId'> & Partial<StairData>;
    readonly levels: readonly Level[];
    readonly baseLevelId: string;
    readonly topLevelId: string;
    /** Overrides arriving in the SAME edit, so the candidate is the real candidate. */
    readonly typeId?: string;
    readonly treadDepth?: number;
    readonly width?: number;
    readonly accessibilityType?: string;
    readonly typeStore?: StairTypeStore;
    readonly constraints?: StairValidationConstraints;
}): StairLevelSpanVerdict {
    const { stair, levels, baseLevelId, topLevelId, typeStore } = args;
    const constraints = args.constraints ?? STAIR_CONSTRAINTS;
    const typeId = args.typeId ?? stair.typeId;

    // (1) the span itself.
    const resolved = resolveStairLevelSpanChange(
        levels as readonly StairLevelInput[],
        baseLevelId,
        topLevelId,
        stair.riserHeight,
        stair.flights ?? [],
    );
    if (resolved.status === 'refused') return { ok: false, refusals: [resolved.message] };

    const warnings: string[] = [];

    // (2) may this TYPE skip that many levels?
    const traversal = LevelTraversalPolicy.canTraverse(
        baseLevelId, topLevelId, levels as Level[], typeStore, typeId,
    );
    if (!traversal.ok && traversal.reason) return { ok: false, refusals: [traversal.reason] };
    if (traversal.warning) warnings.push(traversal.warning);

    // (3) is the RESULT a legal stair?
    const candidateFlights = (stair.flights ?? []).map((f, i) => ({
        ...f,
        riserCount: resolved.flightRiserCounts[i] ?? f.riserCount,
    }));
    const candidate: Partial<StairData> = {
        ...(stair as Partial<StairData>),
        baseLevelId,
        topLevelId,
        riserHeight: resolved.riserHeight,
        riserCount: resolved.riserCount,
        flights: candidateFlights,
        typeId,
    };

    const refusals: string[] = [];
    const authority = StairValidationAuthority.validate(candidate, { levels: levels as Level[], typeStore });
    for (const err of authority.errors) refusals.push(err.message);
    for (const w of authority.warnings) warnings.push(w.message);

    const limits = resolveStairGeometryLimits(
        constraints,
        typeId && typeStore ? typeStore.resolveRules(typeId) : null,
    );
    for (const refusal of checkStairGeometry(
        {
            riserHeight: resolved.riserHeight,
            treadDepth: args.treadDepth ?? stair.treadDepth,
            flights: candidateFlights,
            width: args.width ?? stair.width,
            accessibilityType: args.accessibilityType ?? stair.accessibilityType,
        },
        limits,
    )) {
        refusals.push(refusal.message);
    }

    if (refusals.length > 0) return { ok: false, refusals };
    return {
        ok: true,
        baseLevelId,
        topLevelId,
        height: resolved.height,
        riserHeight: resolved.riserHeight,
        riserCount: resolved.riserCount,
        flightRiserCounts: resolved.flightRiserCounts,
        warnings,
    };
}
