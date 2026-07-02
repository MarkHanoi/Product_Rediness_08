/**
 * floorFinishDefaults — pure default values for interactive Floor Finish creation.
 *
 * §FIX-FLOORFINISH-DEFAULT-THICKNESS (C11 element-creation pipeline · C03 floor defaults).
 * The floor finish is recessed by BASE OFFSET into the structural slab top. A finish whose
 * assembly thickness EQUALS that base offset fills the recess FLUSH with the slab top — no
 * overlap into the slab (no Z-fighting / no phantom volume) and no gap above it. So the
 * thickness default DERIVES from the base-offset default and the two stay coupled by
 * construction; the user can still edit either afterward in the creation modal.
 *
 * Pure module (no THREE, no @thatopen, no DOM) so it is importable/testable in a node env —
 * the THREE/@thatopen-pulling FloorTool re-exports these for its instance defaults.
 */

/** Default recess depth of the finish below/into the slab top (metres). 75 mm. */
export const DEFAULT_FLOOR_FINISH_BASE_OFFSET_M = 0.075;

/**
 * Default assembly thickness (metres). DATA-DRIVEN: equals the base-offset default so the
 * finish fills its recess without overlapping the slab/level. Coupled by construction.
 */
export const DEFAULT_FLOOR_FINISH_THICKNESS_M = DEFAULT_FLOOR_FINISH_BASE_OFFSET_M;
