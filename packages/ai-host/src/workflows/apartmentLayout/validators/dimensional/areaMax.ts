// G-1 — Area MAX validator.
//
// A room MUST NOT exceed its programmatic area maximum
// (`docs/03_PRYZM3/APARTMENT-DIMENSIONAL-CONSTRAINTS-AND-SPATIAL-PROPORTION-FRAMEWORK-2026-05-29.md`
// §G-1). Hard ceiling: a corridor MUST NOT exceed 8 m² (above this it is a
// hall, a different programmatic type). Violations fail the legality gate.
//
// PURE: no I/O, no closures over mutable state, no DOM, no THREE.

import { limitsFor } from './limits.js';
import type { DimensionalViolation } from './types.js';

/** One room as the validator sees it. POJO on purpose — no Zod, no class. */
export interface AreaMaxRoom {
    readonly id: string;
    readonly type: string;
    readonly areaM2: number;
}

/**
 * Find every room that exceeds its G-1 area maximum.
 *
 * Returns the violations in the SAME ORDER as the input `rooms` (stable for
 * snapshot tests + deterministic for the UI).
 *
 * Unknown room types are SKIPPED with no violation: the G-1 ceiling is
 * normative, not exhaustive — a room type the spec doesn't list (e.g. a
 * custom "gym" added via the Family Platform) has no ceiling to violate.
 * This is the same policy as `dimensionsFor` falling back to `utility` would
 * give, only stricter (skip rather than impose an arbitrary cap). See the
 * companion test `unknown-roomType-skips` for the contract.
 */
export function validateAreaMax(
    rooms: ReadonlyArray<AreaMaxRoom>,
): DimensionalViolation[] {
    const out: DimensionalViolation[] = [];
    for (const room of rooms) {
        const limits = limitsFor(room.type);
        if (limits === undefined) continue;          // unknown type → skip
        const max = limits.areaMaxM2;
        if (!(room.areaM2 > max)) continue;          // ≤ max ⇒ OK (boundary inclusive)
        out.push({
            classId: 'G-1',
            roomId: room.id,
            roomType: room.type,
            severity: 'error',
            observed: room.areaM2,
            maximum: max,
            message:
                `G-1 area-max: ${room.type} '${room.id}' is ${room.areaM2.toFixed(2)} m², ` +
                `programmatic max is ${max.toFixed(2)} m² ` +
                `(above this ceiling the room is a different programmatic type).`,
        });
    }
    return out;
}
