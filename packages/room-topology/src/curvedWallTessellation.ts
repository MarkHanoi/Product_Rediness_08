/**
 * curvedWallTessellation — RE-EXPORT SHIM.
 *
 * §FIX-CURVED-WALL-PRETRIM-FRAME was authored here (ba7ee582). §FIX-REGION-RING-
 * PRETRIM-FRAME then found a SECOND consumer — `@pryzm/geometry-slab`'s
 * `SlabRegionTracer` — still running the pre-fix maths, so the implementation was
 * HOISTED to `@pryzm/core-app-model`, the lowest (L3) package both consumers
 * already depend on. Nothing was rewritten in the move.
 *
 * The lesson the hoist encodes: this defect has now been fixed THREE times in
 * three files (`WallFragmentBuilder` §V2-PRETRIM-FIX → `RoomDetectionEngine`
 * §FIX-CURVED-WALL-PRETRIM-FRAME → `SlabRegionTracer`) because each fix was a
 * COPY. There is now ONE implementation; a fourth consumer must import it, not
 * re-derive it.
 *
 * This file stays so that `ba7ee582`'s callers and `./index.ts` keep resolving.
 *
 * @see packages/core-app-model/src/geometry/curvedWallTessellation.ts
 */

export type {
  TessPoint,
  ArcDensityArgs,
  ArcDensity,
} from '@pryzm/core-app-model/curved-wall-tessellation';
export {
  clipPolylineToSpan,
  tessellateCurvedWallForTopology,
  baseWallId,
  // §ARC-DENSITY — THE ONE chord-density authority. When RoomDetectionEngine /
  // RoomPolygonUtils adopt adaptive density they MUST resolve it here (and in
  // lock-step with geometry-roof's wallCentreline sampler — the three pin a
  // 1:1 chord parity; see wallCentreline.ts header).
  resolveArcSegmentCount,
  computeArcDensity,
  arcChordSagittaBound,
  ARC_SAGITTA_TARGET_M,
  ARC_MAX_SEGMENTS,
} from '@pryzm/core-app-model/curved-wall-tessellation';
