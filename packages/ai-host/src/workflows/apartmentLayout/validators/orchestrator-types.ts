// Apartment-layout VALIDATOR ORCHESTRATOR — shared types.
//
// The orchestrator (`orchestrator.ts`) runs the 16 shipped validator slices
// (G-1 / G-2 / G-3 / G-5 / G-6 / G-7 / G-8 / G-10 dimensional + A-1 / A-2 /
// A-3 / A-4 / A-5 / A-6 / A-7 / A-8 topology) on ONE canonical apartment-
// layout input and returns ONE aggregated report. This file declares those
// shared input/output shapes.
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
import type { NotMeasuredNote } from './not-measured.js';

export type { NotMeasuredField, NotMeasuredNote } from './not-measured.js';

/**
 * A room in the validation input — superset of every per-validator room shape.
 *
 * The three geometry-derived DAYLIGHT fields (`externalFrontageM`,
 * `hasExteriorEdge`, `glazedAreaM2`) are OPTIONAL — see §L-909(b) below.
 *
 * ⚠ **Corrected 2026-08-14 (§L-909(b)).** This doc-block used to read: *"Callers
 * that don't yet compute those fields can pass `0` — the underlying validator
 * will then flag G-5 / G-7 violations, which is the correct surface for missing
 * data."* **That instruction WAS the defect.** A caller that could not measure
 * frontage/glazing passed `0`/`false`, and G-7 / G-10 / A-7 printed those
 * unmeasured defaults as MEASURED zeros — the founder's generated apartment
 * reported 15 daylight errors on rooms that had windows. `undefined` now means
 * NOT MEASURED and is a DIFFERENT value from `0`; the rule skips and records a
 * `NotMeasuredNote` (C83 §5.2.1/§5.3, C78 §1.4, C70 L-INV-1, C75 §1.4).
 * Never pass `0` for "unknown".
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
    /** Length of room-owned external (perimeter) wall (m) — read by G-7.
     *  `undefined` ⇒ NOT MEASURED (G-7 skips + records a note). */
    readonly externalFrontageM?: number;
    /** Whether the room's perimeter meets the apartment shell — read by A-7.
     *  `undefined` ⇒ NOT MEASURED (A-7 skips + records a note). */
    readonly hasExteriorEdge?: boolean;
    /** Total glazed pane area (m²) the room owns — read by G-10.
     *  `undefined` ⇒ NOT MEASURED (G-10 skips + records a note). */
    readonly glazedAreaM2?: number;
}

/**
 * The orchestrator's input: rooms + the realised adjacency edge set. Symmetric
 * (the topology validators never test orientation).
 */
export interface ApartmentLayoutForValidation {
    readonly rooms: ReadonlyArray<ApartmentLayoutRoom>;
    readonly edges: ReadonlyArray<AdjacencyEdge>;
    /** ID of the apartment's entrance room (entrance_hall, hall, or
     *  whichever room contains the apartment-entry door). When present,
     *  enables A-8 sequencing validation. When omitted, A-8 SKIPS. */
    readonly entranceRoomId?: string;
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
    /**
     * §L-909(b) — checks that COULD NOT RUN because their measured input was
     * absent. These are NOT violations: they never contribute to `errors`,
     * `warnings`, `total` or `violationsByClass`, and they never fail the
     * legality gate. They exist so the report can say *"frontage not measured
     * by this report"* instead of silently omitting the check or (the old
     * behaviour) minting a violation from a defaulted zero.
     */
    readonly notMeasured: ReadonlyArray<NotMeasuredNote>;
}
