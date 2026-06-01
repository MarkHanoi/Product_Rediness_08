// G-2 — Width MAX validator.
//
// A room MUST NOT exceed its programmatic width maximum
// (`docs/archive/pryzm3-internal/APARTMENT-DIMENSIONAL-CONSTRAINTS-AND-SPATIAL-PROPORTION-FRAMEWORK-2026-05-29.md`
// §G-2). Hard ceiling: a corridor MUST NOT be wider than 2.5 m (above this it
// is a hall, a gallery, an open lobby — not a corridor). Width is the SHORTER
// plan dimension (the navigable cross-section). Violations fail the legality
// gate.
//
// PURE: no I/O, no closures over mutable state, no DOM, no THREE.

import { limitsFor } from './limits.js';
import type { DimensionalViolation } from './types.js';

/** One room as the validator sees it. POJO on purpose — no Zod, no class. */
export interface WidthMaxRoom {
    readonly id: string;
    readonly type: string;
    /** SHORTER plan dimension (m). */
    readonly widthM: number;
}

/**
 * Find every room that exceeds its G-2 width maximum.
 *
 * Returns the violations in the SAME ORDER as the input `rooms` (stable for
 * snapshot tests + deterministic for the UI).
 *
 * Unknown room types are SKIPPED with no violation — same policy as
 * `validateAreaMax` (G-1). See `areaMax.ts` for the rationale.
 */
export function validateWidthMax(
    rooms: ReadonlyArray<WidthMaxRoom>,
): DimensionalViolation[] {
    const out: DimensionalViolation[] = [];
    for (const room of rooms) {
        const limits = limitsFor(room.type);
        if (limits === undefined) continue;          // unknown type → skip
        const max = limits.widthMaxM;
        if (!(room.widthM > max)) continue;          // ≤ max ⇒ OK (boundary inclusive)
        out.push({
            classId: 'G-2',
            roomId: room.id,
            roomType: room.type,
            severity: 'error',
            observed: room.widthM,
            maximum: max,
            message:
                `G-2 width-max: ${room.type} '${room.id}' is ${room.widthM.toFixed(2)} m wide, ` +
                `programmatic max is ${max.toFixed(2)} m ` +
                `(above this ceiling the room is a different programmatic type).`,
        });
    }
    return out;
}
