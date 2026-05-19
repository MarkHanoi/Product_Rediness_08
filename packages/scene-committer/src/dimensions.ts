// PRYZM 2 — DimensionCommitter (re-export shim post W-02 / Phase 2 close).
//
// The actual implementation moved to `@pryzm/drawing-primitives/dimensions`
// so plan-view (and any other L7 plugin) can import the Canvas2D dimension
// renderer without crossing the L5 SceneCommitter boundary that ADR-0023 +
// ADR-0028 forbid.  See `PHASE-2-CLOSE-IMPLEMENTATION-PLAN-2026-04-28.md` §W-02.
//
// Source-compatibility shim — all callers continue to work.

export {
  commitDimensions,
  type Canvas2DLike,
  type ViewTransformMatrix,
} from '@pryzm/drawing-primitives/dimensions';
