// Apartment-layout VALIDATOR ORCHESTRATOR — shared types.
//
// The orchestrator (`orchestrator.ts`) runs the 11 shipped validator slices
// (G-1 / G-2 / G-3 / G-5 / G-6 / G-7 dimensional + A-1 / A-2 / A-3 / A-4 / A-5
// topology) on ONE canonical apartment-layout input and returns ONE aggregated
// report. This file declares those shared input/output shapes.
//
// Design rules (consistent with the per-validator files):
//   • POJO only — no Zod, no class, no I/O, no DOM, no THREE.
//   • The input is a SUPERSET of every per-validator's room shape: each
//     validator selects only the fields it needs (`AreaMaxRoom` reads
//     `areaM2`; `WallUsabilityRoom` reads `longestUsableWallM`; etc.). A
//     single `ApartmentLayoutRoom` therefore feeds all 6 dimensional
//     validators without per-validator narrowing at the call site.
//   • Two "forward-compat" fields (`hasExteriorEdge`, `glazedAreaM2`) are
//     present today even though no shipped validator reads them — they are
//     declared now so a future A-7 (frontage-quality) and G-10 (lighting)
//     slice can be added without changing the input contract.
//   • Output is FROZEN (`Object.freeze`) by the orchestrator — consumers can
//     pass the report around without defensive cloning.

import type { DimensionalViolation } from './dimensional/types.js';
import type { AdjacencyEdge, TopologyViolation } from './topology/types.js';

/**
 * A room in the validation input — superset of every per-validator room shape.
 *
 * Every field is required: the orchestrator's contract is "one canonical room
 * record feeds every validator", so callers must compute the geometry-derived
 * fields (`longestUsableWallM`, `externalFrontageM`) before calling. Callers
 * that don't yet compute those fields can pass `0` — the underlying validator
 * will then flag G-5 / G-7 violations, which is the correct surface for
 * "missing data => missing daylight / wall surface".
 */
export interface ApartmentLayoutRoom {
    readonly id: string;
    readonly type: string;
    /** Net floor area (m²) — read by G-1. */
    readonly areaM2: number;
    /** SHORTER plan dimension (m) — read by G-2, G-3, G-6. */
    readonly widthM: number;
    /** LONGER plan dimension (m) — read by G-3. */
    readonly lengthM: number;
    /** Longest continuous wall NOT broken by opening (m) — read by G-5. */
    readonly longestUsableWallM: number;
    /** Length of room-owned external (perimeter) wall (m) — read by G-7. */
    readonly externalFrontageM: number;
    /** Forward-compat for A-7 (frontage-quality) — NOT yet read. */
    readonly hasExteriorEdge: boolean;
    /** Forward-compat for G-10 (lighting) — NOT yet read. */
    readonly glazedAreaM2: number;
}

/**
 * The orchestrator's input: rooms + the realised adjacency edge set. Symmetric
 * (the topology validators never test orientation).
 */
export interface ApartmentLayoutForValidation {
    readonly rooms: ReadonlyArray<ApartmentLayoutRoom>;
    readonly edges: ReadonlyArray<AdjacencyEdge>;
}

/**
 * The orchestrator's output. Two parallel violation arrays preserve the per-
 * validator surfacing (callers can render dimensional vs topology defects in
 * separate UI groups) and three pre-computed aggregates keep the modal /
 * trigger code from re-tallying.
 *
 * `violationsByClass` is keyed by `classId` ('G-1', 'A-3', ...) so the modal
 * can list "3 × G-1, 1 × A-3, 2 × A-5" without iterating violations again.
 *
 * The whole object is frozen by `validateApartmentLayout()` — mutation throws
 * in strict mode and is a no-op in sloppy mode.
 */
export interface AggregatedViolationReport {
    readonly dimensional: ReadonlyArray<DimensionalViolation>;
    readonly topology: ReadonlyArray<TopologyViolation>;
    /** Count of `severity === 'error'` across BOTH arrays. */
    readonly errors: number;
    /** Count of `severity === 'warning'` across BOTH arrays. */
    readonly warnings: number;
    /** Total violations = `errors + warnings`. */
    readonly total: number;
    /** `classId` → count (e.g. `'G-1' → 2`, `'A-3' → 1`). */
    readonly violationsByClass: Readonly<Record<string, number>>;
}
