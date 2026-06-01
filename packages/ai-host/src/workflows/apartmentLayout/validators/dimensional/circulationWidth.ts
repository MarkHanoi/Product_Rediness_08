// G-6 — Circulation-Width validator.
//
// Circulation-type rooms (corridor / entrance hall) MUST have a clear width
// no smaller than the Part M (UK) / ADA ergonomic floor — a 900 mm corridor
// fails wheelchair pass-through and trolley / two-person traversal
// (`docs/archive/pryzm3-internal/APARTMENT-DIMENSIONAL-CONSTRAINTS-AND-SPATIAL-PROPORTION-FRAMEWORK-2026-05-29.md`
// §G-6 / §G-7-circulation table). Violations fail the legality gate.
//
// Applies to CIRCULATION-type rooms only. Every other room type is SKIPPED
// — the G-2 width-max ceiling already governs habitable rooms; a separate
// width FLOOR is meaningful only where circulation ergonomics dominate. The
// skip is encoded as `minCirculationWidthM === undefined` in the
// `DIMENSIONAL_LIMITS` table so the policy is data-driven, not hard-coded.
//
// PURE: no I/O, no closures over mutable state, no DOM, no THREE.

import { limitsFor } from './limits.js';
import type { DimensionalViolation } from './types.js';

/** One room as the validator sees it. POJO on purpose — no Zod, no class. */
export interface CirculationWidthRoom {
    readonly id: string;
    readonly type: string;
    /** Clear width (m) — the SHORTER plan dimension, walking cross-section. */
    readonly widthM: number;
}

/**
 * Find every circulation-type room whose clear width is below its G-6 minimum.
 *
 * Returns the violations in the SAME ORDER as the input `rooms` (stable for
 * snapshot tests + deterministic for the UI).
 *
 * Boundary is INCLUSIVE: a width exactly equal to the minimum is OK; the
 * minimum minus an epsilon fails.
 *
 * Unknown room types are SKIPPED with no violation — same policy as
 * `validateAreaMax` (G-1). See `areaMax.ts` for the rationale.
 *
 * Rooms whose `minCirculationWidthM` is `undefined` (every non-circulation
 * room type — bathroom, bedroom, living, …) are SKIPPED with no violation —
 * data-driven exemption.
 */
export function validateCirculationWidth(
    rooms: ReadonlyArray<CirculationWidthRoom>,
): DimensionalViolation[] {
    const out: DimensionalViolation[] = [];
    for (const room of rooms) {
        const limits = limitsFor(room.type);
        if (limits === undefined) continue;                  // unknown type → skip
        const min = limits.minCirculationWidthM;
        if (min === undefined) continue;                     // non-circulation → skip
        if (!(room.widthM < min)) continue;                  // ≥ min ⇒ OK (boundary inclusive)
        out.push({
            classId: 'G-6',
            roomId: room.id,
            roomType: room.type,
            severity: 'error',
            observed: room.widthM,
            // G-6 is a MINIMUM, but `maximum` is the field name DimensionalViolation
            // uses for "the threshold the room violated". The framework spec keeps
            // one structural field per row so the UI/score-axis stays uniform; the
            // `classId` disambiguates direction (G-1/G-2/G-3 are ceilings,
            // G-5/G-6 are floors).
            maximum: min,
            message:
                `G-6 circulation-width: ${room.type} '${room.id}' is ${room.widthM.toFixed(2)} m wide, ` +
                `programmatic min is ${min.toFixed(2)} m ` +
                `(below this floor the passageway fails Part M / ADA wheelchair pass-through).`,
        });
    }
    return out;
}
