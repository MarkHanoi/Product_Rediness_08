// G-10 — Lighting (window-to-floor-area ratio) validator.
//
// A habitable room MUST have glazed window area no smaller than a per-type
// fraction of its net floor area
// (`docs/archive/pryzm3-internal/APARTMENT-DIMENSIONAL-CONSTRAINTS-AND-SPATIAL-PROPORTION-FRAMEWORK-2026-05-29.md`
// §G-10). Per Building Regs Part F1 the daylight floor for habitable rooms
// is 10 % of net floor area (`minLightRatio = 0.10`). Violations fail the
// legality gate.
//
// Applies to DAYLIGHT-REQUIRING rooms only. Circulation (corridor / hall),
// wet rooms (bathroom / wc / ensuite), service (utility / storage) and the
// balcony itself are SKIPPED — these rooms either have no daylight
// requirement (artificial light + mechanical extract is acceptable) or are
// themselves open to the sky. The skip is encoded as
// `minLightRatio === undefined` in the `DIMENSIONAL_LIMITS` table so the
// policy is data-driven, not hard-coded.
//
// This validator is COMPUTATION-FREE: the caller is responsible for summing
// the room's glazed window areas into `glazedAreaM2` — the validator just
// compares the ratio to the threshold. Keeping the geometry out of this
// file preserves the "pure POJO inputs" contract shared with the rest of
// the G-class slice.
//
// PURE: no I/O, no closures over mutable state, no DOM, no THREE.

import { limitsFor } from './limits.js';
import type { DimensionalViolation } from './types.js';
import { notMeasuredNote, type NotMeasuredNote } from '../not-measured.js';

/** One room as the validator sees it. POJO on purpose — no Zod, no class. */
export interface LightingRoom {
    readonly id: string;
    readonly type: string;
    /** Net floor area (m²). */
    readonly areaM2: number;
    /**
     * Total glazed window area (m²) the room owns — the sum of every window
     * pane glazing area inside this room's perimeter. Computed by the
     * caller.
     *
     * §L-909(b) — `undefined` means **NOT MEASURED**, and is NOT the same
     * value as `0` ("measured, and the room owns no glazing"). A caller that
     * cannot sum the room's window panes MUST leave this absent; the rule
     * then SKIPS and records a `NotMeasuredNote`. Reporting a defaulted `0`
     * as a measured ratio of `0.000` is exactly the defect this guard exists
     * to stop.
     */
    readonly glazedAreaM2?: number;
}

/** Both halves of one G-10 pass: the violations it DID find, and the rooms it
 *  could not check because their glazed area was never measured. */
export interface LightingOutcome {
    readonly violations: readonly DimensionalViolation[];
    readonly notMeasured: readonly NotMeasuredNote[];
}

/**
 * Find every daylight-requiring room whose glazed-to-floor-area ratio is
 * below its G-10 minimum.
 *
 * Returns the violations in the SAME ORDER as the input `rooms` (stable for
 * snapshot tests + deterministic for the UI).
 *
 * Boundary is INCLUSIVE: a ratio exactly equal to the minimum is OK; the
 * minimum minus an epsilon fails.
 *
 * Unknown room types are SKIPPED with no violation — same policy as
 * `validateAreaMax` (G-1). See `areaMax.ts` for the rationale.
 *
 * Rooms whose `minLightRatio` is `undefined` (corridor / hall / bathroom /
 * wc / ensuite / utility / storage / balcony) are SKIPPED with no
 * violation — data-driven exemption.
 *
 * Rooms with `areaM2 <= 0` are SKIPPED (no divide-by-zero; the room is
 * degenerate and other G-classes will flag it).
 */
export function validateLighting(
    rooms: ReadonlyArray<LightingRoom>,
): DimensionalViolation[] {
    return evaluateLighting(rooms).violations as DimensionalViolation[];
}

/**
 * §L-909(b) — the NOT-MEASURED half of the same pass. One note per in-scope
 * room whose `glazedAreaM2` was never measured. Same walk as
 * `validateLighting`, so skip set and note set cannot drift.
 */
export function lightingNotMeasured(
    rooms: ReadonlyArray<LightingRoom>,
): NotMeasuredNote[] {
    return evaluateLighting(rooms).notMeasured as NotMeasuredNote[];
}

/**
 * The single G-10 walk. In-scope rooms split three ways:
 *   • glazing measured, ratio below the floor → VIOLATION
 *   • glazing measured, ratio at/above the floor → nothing
 *   • glazing NOT measured (`undefined`) → NOT-MEASURED NOTE, no violation
 */
export function evaluateLighting(
    rooms: ReadonlyArray<LightingRoom>,
): LightingOutcome {
    const out: DimensionalViolation[] = [];
    const notMeasured: NotMeasuredNote[] = [];
    for (const room of rooms) {
        const limits = limitsFor(room.type);
        if (limits === undefined) continue;                  // unknown type → skip
        const min = limits.minLightRatio;
        if (min === undefined) continue;                     // no-daylight room → skip
        if (!(room.areaM2 > 0)) continue;                    // degenerate room → skip
        // §L-909(b) — precondition ABSENT ⇒ the rule cannot run.
        if (typeof room.glazedAreaM2 !== 'number'
            || !Number.isFinite(room.glazedAreaM2)) {
            notMeasured.push(notMeasuredNote(
                'G-10', room.id, room.type, 'glazedAreaM2',
                `glazed area not measured by this report — G-10 (min ratio ` +
                `${min.toFixed(2)}) NOT CHECKED for ${room.type} '${room.id}'`,
            ));
            continue;
        }
        const ratio = room.glazedAreaM2 / room.areaM2;
        if (!(ratio < min)) continue;                        // ≥ min ⇒ OK (boundary inclusive)
        out.push({
            classId: 'G-10',
            roomId: room.id,
            roomType: room.type,
            severity: 'error',
            observed: ratio,
            // G-10 is a MINIMUM, but `maximum` is the field name
            // DimensionalViolation uses for "the threshold the room
            // violated". The framework spec keeps one structural field per
            // row so the UI/score-axis stays uniform; the `classId`
            // disambiguates direction (G-1/G-2/G-3 are ceilings,
            // G-5/G-6/G-7/G-10 are floors).
            maximum: min,
            message:
                `G-10 lighting: ${room.type} '${room.id}' has glazed-to-floor ratio ` +
                `${ratio.toFixed(3)} (${room.glazedAreaM2.toFixed(2)} m² / ${room.areaM2.toFixed(2)} m²), ` +
                `programmatic min is ${min.toFixed(2)} ` +
                `(below this floor the room cannot satisfy Building Regs Part F1 daylight requirements).`,
        });
    }
    return { violations: out, notMeasured };
}
