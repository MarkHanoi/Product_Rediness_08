// G-3 — Aspect-ratio validator.
//
// A room's longest-side / shortest-side ratio MUST NOT exceed its programmatic
// aspect-ratio maximum
// (`docs/archive/pryzm3-internal/APARTMENT-DIMENSIONAL-CONSTRAINTS-AND-SPATIAL-PROPORTION-FRAMEWORK-2026-05-29.md`
// §G-3). Hard ceiling: a bathroom MUST NOT have an aspect ratio above 2.5 (a
// 1.1 m × 5.0 m bathroom is a technically valid polygon but architecturally
// absurd — a "tunnel" room). Violations fail the legality gate.
//
// Corridors are SKIPPED — corridors ARE elongated by nature; the G-3 check is
// meaningless. The skip is encoded as `aspectRatioMax === Infinity` in the
// `DIMENSIONAL_LIMITS` table so the policy is data-driven, not hard-coded.
//
// PURE: no I/O, no closures over mutable state, no DOM, no THREE.

import { limitsFor } from './limits.js';
import type { DimensionalViolation } from './types.js';

/** One room as the validator sees it. POJO on purpose — no Zod, no class. */
export interface AspectRoom {
    readonly id: string;
    readonly type: string;
    /** One rectangular plan dimension (m). Order vs `lengthM` does NOT matter. */
    readonly widthM: number;
    /** The other rectangular plan dimension (m). */
    readonly lengthM: number;
}

/**
 * Find every room that exceeds its G-3 aspect-ratio maximum.
 *
 * Returns the violations in the SAME ORDER as the input `rooms` (stable for
 * snapshot tests + deterministic for the UI).
 *
 * Aspect ratio = `max(widthM, lengthM) / min(widthM, lengthM)`. Boundary is
 * INCLUSIVE: a ratio exactly equal to the maximum is OK; the maximum plus an
 * epsilon fails. Rooms with a non-positive shorter side are SKIPPED to avoid
 * a divide-by-zero (the upstream G-2 check is responsible for flagging
 * degenerate widths).
 *
 * Unknown room types are SKIPPED with no violation — same policy as
 * `validateAreaMax` (G-1). See `areaMax.ts` for the rationale.
 *
 * Rooms whose `aspectRatioMax` is `Infinity` (corridor sentinel) are SKIPPED
 * with no violation — data-driven exemption.
 */
export function validateAspect(
    rooms: ReadonlyArray<AspectRoom>,
): DimensionalViolation[] {
    const out: DimensionalViolation[] = [];
    for (const room of rooms) {
        const limits = limitsFor(room.type);
        if (limits === undefined) continue;          // unknown type → skip
        const max = limits.aspectRatioMax;
        if (!isFinite(max)) continue;                // sentinel (corridor) → skip
        const longer  = Math.max(room.widthM, room.lengthM);
        const shorter = Math.min(room.widthM, room.lengthM);
        if (!(shorter > 0)) continue;                // degenerate → skip (G-2 catches)
        const ratio = longer / shorter;
        if (!(ratio > max)) continue;                // ≤ max ⇒ OK (boundary inclusive)
        out.push({
            classId: 'G-3',
            roomId: room.id,
            roomType: room.type,
            severity: 'error',
            observed: ratio,
            maximum: max,
            message:
                `G-3 aspect-ratio: ${room.type} '${room.id}' is ${ratio.toFixed(2)}:1 ` +
                `(${longer.toFixed(2)} m × ${shorter.toFixed(2)} m), ` +
                `programmatic max is ${max.toFixed(2)}:1 ` +
                `(above this ceiling the room is a "tunnel" — unusable in plan).`,
        });
    }
    return out;
}
