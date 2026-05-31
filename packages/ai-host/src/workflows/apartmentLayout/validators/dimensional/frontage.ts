// G-7 — Frontage validator.
//
// A habitable room MUST own a minimum length of EXTERNAL wall (perimeter)
// for daylight and natural ventilation
// (`docs/03_PRYZM3/APARTMENT-DIMENSIONAL-CONSTRAINTS-AND-SPATIAL-PROPORTION-FRAMEWORK-2026-05-29.md`
// §G-7). A bedroom with 600 mm of external wall has no usable window position;
// a living room with 1.0 m of frontage cannot satisfy daylight factor
// requirements. Violations fail the legality gate.
//
// Applies to DAYLIGHT-REQUIRING rooms only. Circulation (corridor / hall),
// wet rooms (bathroom / wc / ensuite), service (utility / storage) and the
// balcony itself are SKIPPED — these rooms either have no daylight
// requirement (artificial light + mechanical extract is acceptable) or are
// themselves the frontage. The skip is encoded as `minFrontageM ===
// undefined` in the `DIMENSIONAL_LIMITS` table so the policy is data-driven,
// not hard-coded.
//
// This validator is COMPUTATION-FREE: the caller is responsible for computing
// `externalFrontageM` (the sum of room-owned perimeter that coincides with
// the apartment exterior shell) — the validator just compares the value to
// the threshold. Keeping the geometry out of this file preserves the "pure
// POJO inputs" contract shared with G-1/G-2/G-3/G-5/G-6.
//
// PURE: no I/O, no closures over mutable state, no DOM, no THREE.

import { limitsFor } from './limits.js';
import type { DimensionalViolation } from './types.js';

/** One room as the validator sees it. POJO on purpose — no Zod, no class. */
export interface FrontageRoom {
    readonly id: string;
    readonly type: string;
    /**
     * Length (m) of EXTERNAL (perimeter) wall the room owns — the sum of
     * room-edge segments coincident with the apartment exterior shell.
     * Computed by the caller.
     */
    readonly externalFrontageM: number;
}

/**
 * Find every daylight-requiring room whose external frontage is below its
 * G-7 minimum.
 *
 * Returns the violations in the SAME ORDER as the input `rooms` (stable for
 * snapshot tests + deterministic for the UI).
 *
 * Boundary is INCLUSIVE: a frontage exactly equal to the minimum is OK; the
 * minimum minus an epsilon fails.
 *
 * Unknown room types are SKIPPED with no violation — same policy as
 * `validateAreaMax` (G-1). See `areaMax.ts` for the rationale.
 *
 * Rooms whose `minFrontageM` is `undefined` (corridor / hall / bathroom /
 * wc / ensuite / utility / storage / balcony) are SKIPPED with no violation
 * — data-driven exemption.
 */
export function validateFrontage(
    rooms: ReadonlyArray<FrontageRoom>,
): DimensionalViolation[] {
    const out: DimensionalViolation[] = [];
    for (const room of rooms) {
        const limits = limitsFor(room.type);
        if (limits === undefined) continue;                  // unknown type → skip
        const min = limits.minFrontageM;
        if (min === undefined) continue;                     // no-daylight room → skip
        if (!(room.externalFrontageM < min)) continue;       // ≥ min ⇒ OK (boundary inclusive)
        out.push({
            classId: 'G-7',
            roomId: room.id,
            roomType: room.type,
            severity: 'error',
            observed: room.externalFrontageM,
            // G-7 is a MINIMUM, but `maximum` is the field name DimensionalViolation
            // uses for "the threshold the room violated". The framework spec keeps
            // one structural field per row so the UI/score-axis stays uniform; the
            // `classId` disambiguates direction (G-1/G-2/G-3 are ceilings,
            // G-5/G-6/G-7 are floors).
            maximum: min,
            message:
                `G-7 frontage: ${room.type} '${room.id}' has external frontage ` +
                `${room.externalFrontageM.toFixed(2)} m, ` +
                `programmatic min is ${min.toFixed(2)} m ` +
                `(below this floor the room cannot satisfy daylight + ventilation requirements).`,
        });
    }
    return out;
}
