/**
 * floorFinishDefaults — pure default values for interactive Floor Finish creation.
 *
 * §FIX-FLOOR-FINISH-DEFAULT-THICKNESS (L-14 · C11 element-creation pipeline · C03 floor defaults).
 *
 * A floor finish has TWO INDEPENDENT dimensions and they must default independently:
 *   • BASE OFFSET — WHERE the finish sits. It is the Finished Floor Level (FFL) height above
 *     the level datum: `FFL = level.elevation + baseOffset` (geometry invariant in FloorTypes,
 *     and the value `resolveFflOffset` reads — L-87). The default 75 mm represents the usual
 *     screed / services build-up between the structural slab top and the walking surface.
 *   • THICKNESS — the REAL thickness of the applied finish layer itself (tile / engineered
 *     timber / vinyl), ~10–20 mm. It is NOT the build-up height and must NOT be tied to it.
 *
 * The OLD behaviour (L-14 bug) coupled `thickness := baseOffset`, so an interactively-drawn
 * finish became a 75 mm-thick slab — an unrealistic finish and inconsistent with the command
 * path (`resolveFinishSeating`, §A.21.D48), which already defaults a bare finish to a thin
 * 15 mm layer (`DEFAULT_FINISH_THICKNESS_M`). Decoupling here brings the interactive tool in
 * line: a thin finish whose top face is the FFL, its body extending down from the FFL, leaving
 * the screed/build-up zone below it unmodelled. Both remain user-editable in the creation modal.
 *
 * Pure module (no THREE, no @thatopen, no DOM) so it is importable/testable in a node env —
 * the THREE/@thatopen-pulling FloorTool re-exports these for its instance defaults.
 */

/**
 * Default Finished-Floor-Level (FFL) offset above the level datum (metres). 75 mm — the typical
 * screed / services build-up height between the structural slab top and the walking surface.
 * `FFL = level.elevation + baseOffset` — the value `resolveFflOffset` reads (L-87).
 */
export const DEFAULT_FLOOR_FINISH_BASE_OFFSET_M = 0.075;

/**
 * Default applied-finish assembly thickness (metres). 15 mm — a realistic tile / engineered-
 * timber finish layer. INDEPENDENT of the base offset (a finish's thickness is not its FFL
 * build-up height). Mirrors core-app-model `DEFAULT_FINISH_THICKNESS_M` (§A.21.D48) so the
 * interactive tool and the `resolveFinishSeating` command path agree on the bare-finish default.
 */
export const DEFAULT_FLOOR_FINISH_THICKNESS_M = 0.015;
