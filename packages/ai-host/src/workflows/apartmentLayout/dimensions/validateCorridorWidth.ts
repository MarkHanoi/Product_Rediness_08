// A.39.a — `validateCorridorWidth` perceptual evaluator
// (APARTMENT-COGNITION-STACK L5; pairs with A.39 perceptual evaluator).
//
// The G7 framework's circulation rule covered "is there a corridor and
// does it connect every room?" — this evaluator covers "is the corridor
// COMFORTABLE to use?" — the perceptual layer above the topological
// + dimensional gates.
//
// Comfort thresholds (per UK Approved Document M + WHO interior-comfort
// guidance):
//
//   < 0.80 m  HARD reject — fails Building Reg minimum for accessibility
//   < 1.00 m  SOFT — meets minimum but feels constrained
//   1.00–1.40 m  COMFORTABLE — the perceptual sweet spot
//   > 1.40 m   SOFT — wide enough that it reads as wasted circulation
//                     (G7 corridor-efficiency framework §3.2)
//
// Penalty escalates with deviation from the [1.00, 1.40] band. The
// L5 evaluator panel renders the per-corridor score; Pareto rank
// consumes the aggregated penalty into the `corridorComfort` axis.
//
// L2-pure: no THREE / DOM / RNG.

import type { RoomShape } from './validateRoomShape.js';
import type { DimensionalValidation, ValidationFinding } from './types.js';

const HARD_MIN_WIDTH = 0.80;
const SOFT_MIN_WIDTH = 1.00;
const COMFORT_MAX_WIDTH = 1.40;
/** Above this the corridor reads as a "wasted hallway". */
const HARD_MAX_WIDTH = 2.50;
const EPS = 1e-6;

function labelOf(r: RoomShape): string {
    return r.name ?? r.id;
}

/**
 * Validate every corridor in the apartment against the perceptual
 * width comfort band. Operates on the room rect's SHORT side (the
 * navigable clear width).
 *
 *   - `corridor.shortSide < 0.80 m`  → HARD (accessibility floor)
 *   - `corridor.shortSide > 2.50 m`  → HARD (wasted circulation —
 *                                            no apartment corridor
 *                                            should be this wide)
 *   - `corridor.shortSide ∈ [0.80, 1.00)`  → SOFT (cramped)
 *   - `corridor.shortSide ∈ [1.40, 2.50]`  → SOFT (wide)
 *   - `corridor.shortSide ∈ [1.00, 1.40]`  → comfort band, no finding
 *
 * Penalty scales with deviation from the band edges.
 */
export function validateCorridorWidth(
    rooms: readonly RoomShape[],
): DimensionalValidation {
    const hard: ValidationFinding[] = [];
    const soft: ValidationFinding[] = [];

    for (const room of rooms) {
        if (room.type !== 'corridor') continue;
        const w = room.rect.x1 - room.rect.x0;
        const h = room.rect.z1 - room.rect.z0;
        if (w <= EPS || h <= EPS) continue;
        const shortSide = Math.min(w, h);
        const label = labelOf(room);

        if (shortSide < HARD_MIN_WIDTH - EPS) {
            hard.push({
                roomId: room.id,
                severity: 'hard',
                metric: 'corridorTooNarrow',
                delta: 1.0,
                reason: `corridor ${label} width ${shortSide.toFixed(2)} m < ${HARD_MIN_WIDTH.toFixed(2)} m accessibility minimum (UK ADM)`,
            });
            continue;
        }
        if (shortSide > HARD_MAX_WIDTH + EPS) {
            hard.push({
                roomId: room.id,
                severity: 'hard',
                metric: 'corridorTooWide',
                delta: 1.0,
                reason: `corridor ${label} width ${shortSide.toFixed(2)} m > ${HARD_MAX_WIDTH.toFixed(2)} m — not a corridor, reclassify as room`,
            });
            continue;
        }
        if (shortSide < SOFT_MIN_WIDTH - EPS) {
            // Cramped: penalty scales from 0 at SOFT_MIN to ~1 at HARD_MIN.
            const range = SOFT_MIN_WIDTH - HARD_MIN_WIDTH;
            const delta = Math.min(1, (SOFT_MIN_WIDTH - shortSide) / range);
            soft.push({
                roomId: room.id,
                severity: 'soft',
                metric: 'corridorCramped',
                delta,
                reason: `corridor ${label} width ${shortSide.toFixed(2)} m below comfortable ${SOFT_MIN_WIDTH.toFixed(2)} m — feels constrained`,
            });
            continue;
        }
        if (shortSide > COMFORT_MAX_WIDTH + EPS) {
            // Wide: penalty scales from 0 at COMFORT_MAX to ~1 at HARD_MAX.
            const range = HARD_MAX_WIDTH - COMFORT_MAX_WIDTH;
            const delta = Math.min(1, (shortSide - COMFORT_MAX_WIDTH) / range);
            soft.push({
                roomId: room.id,
                severity: 'soft',
                metric: 'corridorWide',
                delta,
                reason: `corridor ${label} width ${shortSide.toFixed(2)} m above comfortable ${COMFORT_MAX_WIDTH.toFixed(2)} m — wasted circulation`,
            });
        }
        // else: in the [1.00, 1.40] comfort band — no finding.
    }

    return {
        admissible: hard.length === 0,
        hardFindings: hard,
        softFindings: soft,
    };
}
