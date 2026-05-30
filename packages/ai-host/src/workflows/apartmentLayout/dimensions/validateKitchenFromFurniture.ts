// D2.3 integration helper — extract kitchen-triangle positions from placed
// furniture and run validateKitchenTriangle against them.
//
// Bridges the pure validateKitchenTriangle (which takes three world-XZ
// points) and the D-FLE engine's placed furniture (which emits one or
// more kitchen_straight runs + an optional kitchen_island). Until the
// engine learns to emit explicit sink/stove/fridge positions, this
// helper uses the heuristic:
//
//   • One kitchen_straight + one island → triangle (run_centre,
//     island_centre, run_endpoint_far_from_island).
//   • Two kitchen_straights (L-shape) → triangle (run1_centre,
//     run2_centre, corner_between_runs).
//   • One kitchen_straight alone → triangle along the run at 1/4, 1/2,
//     3/4 — degenerate but the validator returns sumMin HARD for the
//     caller to handle.
//   • Anything else → null (no kitchen to validate).
//
// This is intentionally LOWER-FIDELITY than the real NKBA rule (which
// wants explicit sink/stove/fridge positions). When the engine learns
// to mint those explicit positions, this helper's heuristic can be
// replaced with a direct read.

import { validateKitchenTriangle } from './validateKitchenTriangle.js';
import type { DimensionalValidation } from './types.js';
import type { FurnitureKind, PlacedFurniture, Pt } from '../../furnishLayout/types.js';

const KITCHEN_RUN_KINDS = new Set<FurnitureKind>([
    'kitchen_straight', 'kitchen_l_shape', 'kitchen_u_shape',
]);

const ptOf = (p: PlacedFurniture): Pt => ({ x: p.position.x, z: p.position.z });

/**
 * Run the G10 NKBA work-triangle validator against a placed kitchen's
 * furniture. Returns null when the heuristic can't form a triangle.
 */
export function validateKitchenFromFurniture(
    kitchenRoomId: string,
    placed: readonly PlacedFurniture[],
): DimensionalValidation | null {
    const runs = placed.filter(p => KITCHEN_RUN_KINDS.has(p.kind));
    const island = placed.find(p => p.kind === 'kitchen_island');
    if (runs.length === 0) return null;

    // Case A: an island present + one+ runs → triangle (run1, island, run-2 or far end).
    if (island && runs.length >= 1) {
        const sink = ptOf(runs[0]!);                          // arbitrary mapping
        const stove = ptOf(island);
        const fridge = runs[1] ? ptOf(runs[1]!)
            // No second run — fallback to a point opposite the run from the island.
            : { x: 2 * runs[0]!.position.x - island.position.x, z: 2 * runs[0]!.position.z - island.position.z };
        return validateKitchenTriangle({
            kitchenId: kitchenRoomId, sink, stove, fridge,
        });
    }

    // Case B: L-shape (two runs perpendicular) → triangle of run centres + corner.
    if (runs.length >= 2) {
        const sink = ptOf(runs[0]!);
        const stove = ptOf(runs[1]!);
        // "Corner" heuristic: project run0's centre onto run1's axis (perpendicular
        // intersection). Without rotation data this collapses to a midpoint —
        // good enough for the heuristic, validated by future engine work.
        const fridge: Pt = {
            x: (runs[0]!.position.x + runs[1]!.position.x) / 2,
            z: (runs[0]!.position.z + runs[1]!.position.z) / 2,
        };
        return validateKitchenTriangle({
            kitchenId: kitchenRoomId, sink, stove, fridge,
        });
    }

    // Case C: a single run alone → degenerate triangle along the run.
    // The validator will hard-fail on sumMin; that signals to the caller
    // (e.g. UI hint) that the kitchen has no real work-triangle.
    const run = runs[0]!;
    const along: Pt[] = [
        { x: run.position.x - run.footprint.w * 0.25, z: run.position.z },
        { x: run.position.x,                          z: run.position.z },
        { x: run.position.x + run.footprint.w * 0.25, z: run.position.z },
    ];
    return validateKitchenTriangle({
        kitchenId: kitchenRoomId,
        sink: along[0]!, stove: along[1]!, fridge: along[2]!,
    });
}
