// G-5 — Wall-usability validator.
//
// A room MUST have at least one "usable wall" — a continuous wall segment NOT
// broken by an opening (door/window) — long enough to host the typical primary
// furniture piece for the room type
// (`docs/archive/pryzm3-internal/APARTMENT-DIMENSIONAL-CONSTRAINTS-AND-SPATIAL-PROPORTION-FRAMEWORK-2026-05-29.md`
// §G-5). A bedroom whose only continuous wall is < 1.4 m has nowhere for a
// single bed; a kitchen whose only continuous wall is < 2.4 m has nowhere for
// even a two-base-unit run. Violations fail the legality gate.
//
// Corridors + balconies are SKIPPED (no primary furniture piece). The skip is
// encoded as `minUsableWallM === 0` in the `DIMENSIONAL_LIMITS` table so the
// policy is data-driven, not hard-coded.
//
// This validator is COMPUTATION-FREE: the caller is responsible for computing
// `longestUsableWallM` (longest continuous wall segment not broken by a
// door/window) — the validator just compares the value to the threshold.
// Keeping the geometry out of this file preserves the "pure POJO inputs"
// contract shared with G-1/G-2/G-3.
//
// PURE: no I/O, no closures over mutable state, no DOM, no THREE.

import { limitsFor } from './limits.js';
import type { DimensionalViolation } from './types.js';

/** One room as the validator sees it. POJO on purpose — no Zod, no class. */
export interface WallUsabilityRoom {
    readonly id: string;
    readonly type: string;
    /**
     * Length (m) of the longest continuous wall segment NOT broken by an
     * opening (door/window). Computed by the caller.
     */
    readonly longestUsableWallM: number;
}

/**
 * Find every room whose longest usable wall is shorter than its G-5 minimum.
 *
 * Returns the violations in the SAME ORDER as the input `rooms` (stable for
 * snapshot tests + deterministic for the UI).
 *
 * Boundary is INCLUSIVE: a usable-wall length exactly equal to the minimum is
 * OK; the minimum minus an epsilon fails.
 *
 * Unknown room types are SKIPPED with no violation — same policy as
 * `validateAreaMax` (G-1). See `areaMax.ts` for the rationale.
 *
 * Rooms whose `minUsableWallM` is `0` (corridor + balcony sentinel) are
 * SKIPPED with no violation — data-driven exemption.
 */
export function validateWallUsability(
    rooms: ReadonlyArray<WallUsabilityRoom>,
): DimensionalViolation[] {
    const out: DimensionalViolation[] = [];
    for (const room of rooms) {
        const limits = limitsFor(room.type);
        if (limits === undefined) continue;          // unknown type → skip
        const min = limits.minUsableWallM;
        if (!(min > 0)) continue;                    // sentinel (corridor/balcony) → skip
        if (!(room.longestUsableWallM < min)) continue;  // ≥ min ⇒ OK (boundary inclusive)
        out.push({
            classId: 'G-5',
            roomId: room.id,
            roomType: room.type,
            severity: 'error',
            observed: room.longestUsableWallM,
            // G-5 is a MINIMUM, but `maximum` is the field name DimensionalViolation
            // uses for "the threshold the room violated". The framework spec keeps
            // one structural field per row so the UI/score-axis stays uniform; the
            // `classId` disambiguates direction (G-1/G-2/G-3 are ceilings,
            // G-5 is a floor).
            maximum: min,
            message:
                `G-5 wall-usability: ${room.type} '${room.id}' has longest usable wall ` +
                `${room.longestUsableWallM.toFixed(2)} m, ` +
                `programmatic min is ${min.toFixed(2)} m ` +
                `(no continuous wall long enough for the primary furniture piece).`,
        });
    }
    return out;
}
