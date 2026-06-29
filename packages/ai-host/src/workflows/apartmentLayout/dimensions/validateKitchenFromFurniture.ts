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
 * §FURNISH-KITCHEN-TRIANGLE-CONFIG (2026-06-29) — extract the WORK-TRIANGLE points
 * (sink / hob / fridge) from a PARAMETRIC kitchen run's `kitchenConfig.units` slots.
 *
 * WHY: the primary kitchen path (`planKitchenRun`) emits ONE `kitchen_straight` /
 * `kitchen_l_shape` / `kitchen_u_shape` element carrying a `KitchenCabinetConfigLike`
 * whose `units[]` flag which CELL holds each appliance — it does NOT emit separate
 * `sink` / `hob` / `fridge` items. So the old `validateKitchenFromFurniture` fell to
 * the DEGENERATE single-run heuristic (Case C: three points at ±0.25·runWidth → legs
 * of 0.25·W ≈ 0.95 m on a ~3.8 m run), producing the spurious
 * `kitchen-triangle (HARD): leg 0.95 m < 1.2 m` warnings on layouts whose REAL
 * appliances are ≥1.2 m apart by construction. Reading the cells gives the TRUE
 * spacing (sink↔hob are ≥2 cells = ≥1.2 m apart; the fridge sits off-corner / on a
 * secondary arm), so the validator measures what is actually built.
 *
 * The cell world positions mirror the KitchenCabinetEngine local frame EXACTLY (engine
 * doc-comment §Group origin / §Main-Left-Right arms):
 *   • The placed run `position` is the MAIN-arm MID-POINT; the run's `rotationY` yaw
 *     maps engine-local +Z (cabinet FRONT) → the room inward normal (sin yaw, cos yaw)
 *     and engine-local +X → (cos yaw, −sin yaw) (footprintCorners convention).
 *   • Main cell i centre: local (x = −L/2 + (i+0.5)·mainUnitW, z = 0).
 *   • Left  cell i centre: from the X=−L/2 corner, along +Z: local
 *     (x = −L/2 + depth/2, z = depth/2 + (i+0.5)·leftUnitW).
 *   • Right cell i centre: from the X=+L/2 corner, along +Z: local
 *     (x = +L/2 − depth/2, z = depth/2 + (i+0.5)·rightUnitW).
 * Returns null when the run carries no config or any of the three appliances is
 * un-slotted (caller falls back to the run-centre heuristic). Pure + deterministic.
 */
function trianglePointsFromConfig(run: PlacedFurniture): { sink: Pt; stove: Pt; fridge: Pt } | null {
    const cfg = run.kitchenConfig;
    if (!cfg || !cfg.units || cfg.units.length === 0) return null;
    const yaw = run.rotationY;
    const cos = Math.cos(yaw), sin = Math.sin(yaw);
    const L = cfg.length;
    const depth = cfg.depth;
    const mainUnitW = cfg.numUnits > 0 ? L / cfg.numUnits : L;
    const leftLen = cfg.lengthLeft ?? 0, numLeft = cfg.numUnitsLeft ?? 0;
    const rightLen = cfg.lengthRight ?? 0, numRight = cfg.numUnitsRight ?? 0;
    const leftUnitW = numLeft > 0 ? leftLen / numLeft : 0;
    const rightUnitW = numRight > 0 ? rightLen / numRight : 0;

    // Engine-local (x,z) → world: +x → (cos,−sin), +z → (sin,cos), origin = run.position.
    const toWorld = (lx: number, lz: number): Pt => ({
        x: run.position.x + lx * cos + lz * sin,
        z: run.position.z - lx * sin + lz * cos,
    });
    const cellLocal = (arm: 'main' | 'left' | 'right', i: number): { x: number; z: number } | null => {
        if (arm === 'main') return { x: -L / 2 + (i + 0.5) * mainUnitW, z: 0 };
        if (arm === 'left') {
            if (leftUnitW <= 0) return null;
            return { x: -L / 2 + depth / 2, z: depth / 2 + (i + 0.5) * leftUnitW };
        }
        if (arm === 'right') {
            if (rightUnitW <= 0) return null;
            return { x: L / 2 - depth / 2, z: depth / 2 + (i + 0.5) * rightUnitW };
        }
        return null;
    };

    const findAppliance = (match: (a: string) => boolean): Pt | null => {
        for (const u of cfg.units!) {
            if (u.appliance && match(u.appliance)) {
                const loc = cellLocal(u.arm, u.index);
                if (loc) return toWorld(loc.x, loc.z);
            }
        }
        return null;
    };
    const sink = findAppliance(a => a.includes('sink'));
    const stove = findAppliance(a => a.includes('hob') || a.includes('stove') || a.includes('cooktop') || a.includes('oven'));
    const fridge = findAppliance(a => a.includes('fridge'));
    if (!sink || !stove || !fridge) return null;
    return { sink, stove, fridge };
}

/**
 * Run the G10 NKBA work-triangle validator against a placed kitchen's
 * furniture. Returns null when the heuristic can't form a triangle.
 */
export function validateKitchenFromFurniture(
    kitchenRoomId: string,
    placed: readonly PlacedFurniture[],
): DimensionalValidation | null {
    // A.21.D20 — preferred path: the D-FLE kitchen planner now emits EXPLICIT
    // sink / hob / fridge appliances, so the work-triangle is read directly
    // (NKBA-accurate) rather than from the run-centre heuristic below.
    const sinkP = placed.find(p => p.kind === 'sink');
    const hobP = placed.find(p => p.kind === 'hob');
    const fridgeP = placed.find(p => p.kind === 'fridge');
    if (sinkP && hobP && fridgeP) {
        return validateKitchenTriangle({
            kitchenId: kitchenRoomId,
            sink: ptOf(sinkP), stove: ptOf(hobP), fridge: ptOf(fridgeP),
        });
    }

    // §FURNISH-KITCHEN-TRIANGLE-CONFIG (2026-06-29) — PARAMETRIC run path: the primary
    // kitchen planner emits ONE run element carrying its appliance slots in
    // `kitchenConfig.units`. Read the TRUE sink/hob/fridge cell positions from the
    // config (NKBA-accurate) BEFORE the degenerate run-centre heuristic below, which
    // otherwise fabricated a 0.25·runWidth triangle (≈0.95 m legs) and spuriously
    // HARD-failed runs whose real appliances are ≥1.2 m apart by construction.
    for (const run of placed) {
        if (!KITCHEN_RUN_KINDS.has(run.kind) || !run.kitchenConfig) continue;
        const tri = trianglePointsFromConfig(run);
        if (tri) {
            return validateKitchenTriangle({
                kitchenId: kitchenRoomId, sink: tri.sink, stove: tri.stove, fridge: tri.fridge,
            });
        }
    }

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
