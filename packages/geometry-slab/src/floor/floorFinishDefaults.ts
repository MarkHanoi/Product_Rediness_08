/**
 * floorFinishDefaults — the interactive Floor-Finish creation defaults.
 *
 * §FIX-FLOOR-FINISH-DEFAULT-THICKNESS (L-14 · C11 element-creation pipeline · C03 floor defaults)
 * §FIX-FLOOR-FINISH-CREATION-PARITY  (L-255)
 *
 * A floor finish has TWO INDEPENDENT dimensions and they must default independently:
 *   • BASE OFFSET — WHERE the finish sits. It is the Finished Floor Level (FFL) height above
 *     the level datum: `FFL = level.elevation + baseOffset` (geometry invariant in FloorTypes,
 *     and the value `resolveFflOffset` reads — L-87). The default 75 mm represents the usual
 *     screed / services build-up between the structural slab top and the walking surface.
 *   • THICKNESS — the REAL thickness of the applied finish layer itself (tile / engineered
 *     timber / vinyl), ~10–20 mm. It is NOT the build-up height and must NOT be tied to it.
 *     (The L-14 bug coupled `thickness := baseOffset`, so an interactively-drawn finish became
 *     a 75 mm-thick slab.)
 *
 * ── THE VALUES NO LONGER LIVE HERE (L-255) ────────────────────────────────────
 *
 * They now live at the floor-finish creation CHOKEPOINT — `FloorToolConfigStore` in
 * `@pryzm/core-app-model/stores` — beside the ONE config store and the ONE resolver
 * (`resolveFloorFinish`) that BOTH creation paths read.
 *
 * WHY THE MOVE: this module sits inside `@pryzm/geometry-slab`, a package that pulls THREE and
 * @thatopen via `FloorTool`. The PLAN handler could not reach these constants, so it had no
 * default to inherit and silently fell through to DIFFERENT ones downstream — a plan-drawn
 * finish was meshed 75 mm thick at offset 0, while the "same" 3D-drawn finish was 15 mm thick
 * at offset 75 mm. A default that lives in two places is two defaults; there is now exactly one.
 *
 * This module survives as the geometry-slab-facing alias so existing importers (FloorTool, the
 * package barrel) are unchanged, and so the documentation of what the two dimensions MEAN stays
 * next to the tool that draws them.
 *
 * Pure module (no THREE, no @thatopen, no DOM) — importable in a node test.
 */

export {
    // Default FFL offset above the level datum (m). 75 mm screed/services build-up.
    DEFAULT_FLOOR_FINISH_BASE_OFFSET_M,
    // Default applied-finish assembly thickness (m). 15 mm — aliases DEFAULT_FINISH_THICKNESS_M,
    // the value the command-side `resolveFinishSeating()` uses, so tool and command cannot drift.
    DEFAULT_FLOOR_FINISH_THICKNESS_M,
} from '@pryzm/core-app-model/stores';
