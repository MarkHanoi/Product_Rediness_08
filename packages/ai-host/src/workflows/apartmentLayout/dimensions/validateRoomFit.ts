// D2.2 — `validateRoomFit` pure validator (G5 furniture-fit area heuristic)
// (APARTMENT-DIMENSIONAL-CONSTRAINTS-AND-SPATIAL-PROPORTION-FRAMEWORK-2026-05-29 §9.2 D2.2).
//
// Closes the F-tier ladder for furniture-fit ergonomics. Checks each
// candidate room rectangle has ENOUGH AREA to accommodate its required
// furniture program PLUS the clearance footprints declared in
// programRules.furnitureSpec. Runs as a fast HARD/SOFT gate BEFORE the
// expensive D-FLE solver runs — candidates that can't possibly fit the
// required furniture are rejected at the enumerate stage.
//
// What this validator does NOT check:
//   • Exact placement geometry (whether the items actually fit without
//     overlap given door + window walls) — that's the D-FLE solver itself.
//   • Activity-system grouping (e.g. sofa + coffee table beside) — sums
//     all required items independently.
//   • Optional furniture — only `required: true` entries are summed.
//
// The heuristic: sum(required.sizeW × (required.sizeD + required.clearFoot)
// + perimeter padding for clearSide). This is a LOWER BOUND on the actual
// required area. If the room's area is below the lower bound, no placement
// is possible — HARD reject. If within 1.2× of the lower bound, SOFT
// penalty (the room is tight but plausible).
//
// L2-pure: no THREE / DOM / RNG. Unit-tests in plain Node.

import { roomRule } from '../rules/programRules.js';
import type { RoomType } from '../types.js';
import type { DimensionalValidation, ValidationFinding } from './types.js';

export interface RoomFitInput {
    readonly roomId: string;
    readonly type: RoomType;
    readonly name?: string;
    /** Axis-aligned rectangle in metres. x0 < x1, z0 < z1. */
    readonly rect: { readonly x0: number; readonly z0: number; readonly x1: number; readonly z1: number };
}

/** Soft threshold: room.area < 1.2 × requiredArea triggers soft "tight" penalty. */
const SOFT_TIGHT_FACTOR = 1.2;

/**
 * Sum the lower-bound area requirement for a room's REQUIRED furniture.
 * Returns 0 for rooms without a furniture program (corridor / utility today).
 *
 * Per item: (sizeW + 2×clearSide) × (sizeD + clearFoot). Sizes are in
 * mm in the rule database; converted to m² here. Multiplied by `count`
 * when the spec declares more than one (e.g. 2 bedside tables, 4 chairs).
 */
export function requiredFurnitureAreaM2(type: RoomType): number {
    const rule = roomRule(type);
    let totalMm2 = 0;
    for (const spec of rule.furnitureSpec) {
        if (!spec.required) continue;
        const count = spec.count ?? 1;
        const w = spec.sizeW + 2 * spec.clearSide;
        const d = spec.sizeD + spec.clearFoot;
        totalMm2 += w * d * count;
    }
    return totalMm2 / 1_000_000;        // mm² → m²
}

/**
 * Validate a candidate room rect can fit its required furniture program.
 *
 * HARD-REJECT when rect area < required-furniture lower-bound area.
 * SOFT penalty when rect area is within SOFT_TIGHT_FACTOR (1.2×) of the
 * required area — geometrically possible but tight enough that the D-FLE
 * solver may produce uncomfortable placements.
 *
 * Rooms with no required furniture (corridor / utility) always pass
 * (admissible, no findings).
 */
export function validateRoomFit(input: RoomFitInput): DimensionalValidation {
    const { roomId, type, name, rect } = input;
    const w = rect.x1 - rect.x0;
    const h = rect.z1 - rect.z0;
    if (w <= 0 || h <= 0) {
        return {
            admissible: false,
            hardFindings: [{
                roomId, severity: 'hard', metric: 'degenerate', delta: 1.0,
                reason: `room "${name ?? roomId}" has a non-positive footprint`,
            }],
            softFindings: [],
        };
    }
    const roomArea = w * h;
    const required = requiredFurnitureAreaM2(type);
    if (required <= 0) {
        // No furniture program (corridor / utility) — nothing to fit.
        return { admissible: true, hardFindings: [], softFindings: [] };
    }

    const hard: ValidationFinding[] = [];
    const soft: ValidationFinding[] = [];

    if (roomArea < required - 1e-6) {
        hard.push({
            roomId, severity: 'hard', metric: 'fitImpossible', delta: 1.0,
            reason: `room "${name ?? roomId}" (${type}, ${roomArea.toFixed(2)} m²) is smaller than the required-furniture lower bound (${required.toFixed(2)} m²) — no placement is possible`,
        });
    } else if (roomArea < required * SOFT_TIGHT_FACTOR) {
        const delta = Math.min(1, (required * SOFT_TIGHT_FACTOR - roomArea) / (required * (SOFT_TIGHT_FACTOR - 1)));
        soft.push({
            roomId, severity: 'soft', metric: 'fitTight', delta,
            reason: `room "${name ?? roomId}" (${type}, ${roomArea.toFixed(2)} m²) is tight against the required-furniture footprint (${required.toFixed(2)} m² × ${SOFT_TIGHT_FACTOR} comfort factor = ${(required * SOFT_TIGHT_FACTOR).toFixed(2)} m²)`,
        });
    }

    return {
        admissible: hard.length === 0,
        hardFindings: hard,
        softFindings: soft,
    };
}
