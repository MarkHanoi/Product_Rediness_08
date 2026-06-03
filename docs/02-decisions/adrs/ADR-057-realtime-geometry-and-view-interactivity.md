# ADR-057 — Realtime geometry editing & view interactivity

- **Status:** PROPOSED (2026-06-03) — not accepted; decision record for review.
- **Owner:** wall geometry (`@pryzm/geometry-wall`) + editor engine (`apps/editor/src/engine`).
- **Affects:** `WallRebuildCoordinator`, `WallFragmentBuilder`, `SetDoorOffsetCommand` /
  `SetWindowOffsetCommand`, `DoorBuilder` / `WindowBuilder`, `HostedElementDragController`.
- **References:** [ADR-0055](./ADR-0055-WALL-JUNCTION-PASCAL-STYLE.md) (Pascal per-wall miter,
  "one mesh per wall, no level-wide CSG"), [ADR-0055A](./ADR-0055A-WALL-JUNCTION-P4-LAYERED-AND-OPENINGS.md),
  [ADR-051](./ADR-051-undo-single-source-of-truth.md) (single undo path),
  [C16-COMMAND-AUTHORING-PROTOCOL](../contracts/C16-COMMAND-AUTHORING-PROTOCOL.md)
  (level-oriented + semantic-first command doctrines),
  [C15-HOSTED-ELEMENT-CONTRACT](../contracts/C15-HOSTED-ELEMENT-CONTRACT.md) (offset is the only
  free coordinate of a hosted element),
  [C04 / C10](../contracts/C10-PERFORMANCE-AND-OBSERVABILITY.md) (rendering, scheduling, perf).
- **Analysis backing:**
  [`docs/03-execution/analysis/PERF-REALTIME-EDIT-AND-VIEW-SWITCH-2026-06-03.md`](../../03-execution/analysis/PERF-REALTIME-EDIT-AND-VIEW-SWITCH-2026-06-03.md).

## Context

Users report that, relative to `@thatopen/components` (OBC, which we depend on), PRYZM feels
laggy on two interactions: (a) moving a door, and (b) switching 3D ↔ plan view. The analysis
doc establishes the facts:

1. **View-switch is already fast** — a camera projection toggle
   (`ViewController.ts:275-292`) plus a cached Canvas2D plan projection
   (`SplitViewManager`, `ViewTechnicalDrawingCache`, `FastPathProjectorService` "sub-50ms").
   The plan-switch is **not** the gap and needs no architectural change.

2. **Door-move is the real gap, but not where one would guess.**
   - The door mesh itself **already moves instantly** during the drag via TransformControls;
     no command, no rebuild fires per frame (`HostedElementDragController.ts:100-205`).
   - At drag-end a single `door.setOffset` command commits
     (`registerTransformDragHandler.ts:54-58`).
   - That command writes the wall's opening offset and bumps the wall's render version
     (`WallStore.updateDoor`, `WallStore.ts:1083-1123`), which triggers
     `WallRebuildCoordinator._flush` one rAF later.
   - `_flush` does a **whole-level** pass: `WallJoinResolver.resolveLevel(levelWalls)`,
     level-wide `refreshV2Cache`, per-wall `buildWall` (full dispose/recreate),
     `computeJunctionInfills` over the level, and a door/window re-anchor sweep
     (`WallRebuildCoordinator.ts:289-466`).
   - There is **no boolean CSG** on this path: the single-volume producer is flag-off and
     self-fails to the segmented `BoxGeometry` mesh (`WallStore.ts:1115-1116`).

   **Root cause:** the authoritative rebuild after a hosted-offset edit is **whole-level and
   synchronous**, scaling with *walls-per-level* rather than with the *one* element edited —
   even though an offset change provably leaves wall baselines, joins, and junction infills
   invariant.

OBC achieves "instant" by transforming fragment/instance data rather than rebuilding host
geometry; expensive geometry is computed on import/commit, not per interaction. PRYZM already
does this for the door mesh but not for the wall hole.

## Decision (proposed)

**Decouple the visual transform from the authoritative geometry rebuild, and make the
authoritative rebuild *local and incremental*, never whole-level, for edits that do not move a
wall baseline.** Target: door-move and window-move feel instant, matching OBC, with no
regression to join correctness (ADR-0055) or undo (ADR-051).

Concretely, three layers:

1. **Visual layer (already correct, formalise it).** During a hosted-element drag, only the
   element's `Object3D` (and a cheap hole preview) move. No store write, no rebuild. This is the
   existing TransformControls behaviour — codify it as the contract for *all* live edits.

2. **Authoritative layer — incremental, scoped by delta classification.** In
   `WallRebuildCoordinator._flush`, classify each pending wall mutation:
   - **openings-only delta** (baseline unchanged; only `openings[].offset/width/height/sill`
     changed): rebuild **only that wall** + re-anchor only its hosted children. **Skip**
     `resolveLevel`, level-wide `refreshV2Cache`, and `computeJunctionInfills` — all invariant
     under an offset change (cf. `cross.wall-room` "DOES NOT FIRE FOR … wall.createOpening",
     `plugins/cross/src/wall-room.ts:33-40`).
   - **baseline delta** (move/resize/rotate): keep today's level-scoped join resolve (joins
     genuinely change). Unchanged.

3. **Hole-local geometry (structural target).** Within the segmented-box opening path, recompute
   only the jamb segments adjacent to the moved opening instead of disposing/recreating the whole
   wall group — the OBC "transform the fragment" model applied to the wall hole. This is the
   end-state; layer 2 already removes the level-wide cost without it.

The plan-switch architecture is **explicitly kept as-is**; the only optional addition is
warming `ViewTechnicalDrawingCache` after a geometry commit so the first post-edit switch is
never cold.

## Alternatives considered

- **A. Per-frame wall CSG during drag (the thing users assume happens).** Rejected — it would
  make things *worse*, not better, and three-bvh-csg isn't even on this path. PRYZM's
  commit-only model is already the right call; the problem is commit *scope*, not commit
  *frequency*.
- **B. Worker-offload the existing whole-level rebuild unchanged.** Moves the hitch off the main
  thread but still does O(walls-per-level) work per door nudge and adds marshalling latency.
  Kept as F4 *insurance* only, layered on top of the incremental path — not the primary fix.
- **C. Switch all walls to GPU-instanced transforms like OBC fragments.** Closest to OBC, but
  opening walls are intentionally excluded from the instanced path
  (`WallFragmentBuilder.ts:776-783`) because a hole needs real split geometry. A full instanced
  rewrite is a much larger program than the targeted incremental fix and is out of scope here.
- **D. Do nothing / accept the hitch.** Rejected — it is the headline "not real-time"
  complaint and is cheaply fixable for the dominant edit (offset change).

## Consequences

**Positive**
- Door/window offset edits drop from an O(walls-per-level) synchronous rebuild to O(1).
- No change to join/miter correctness (ADR-0055 path runs only on genuine baseline deltas).
- No change to the undo model (still one `door.setOffset` per drag, ADR-051 single path).
- View-switch left untouched — zero regression risk there.

**Negative / risk**
- New delta-classification branch in `_flush` is correctness-sensitive: misclassifying a
  baseline change as openings-only would skip a needed join resolve. Mitigate with the existing
  `prevState.baseLine` diff (`WallRebuildCoordinator.ts:272-275`) as the classifier and a unit
  test per branch.
- The hole-local segment rebuild (layer 3) must keep edge overlays and selection proxies
  consistent — covered by the existing fragment bookkeeping; needs targeted tests.

## Phased rollout

- **P1 — Delta classification + single-wall openings path.** Add the openings-only branch to
  `WallRebuildCoordinator._flush`; skip `resolveLevel` / `refreshV2Cache` / infill for it.
  Tests: offset-move leaves neighbour join meshes byte-identical; door re-anchors correctly.
  *(Biggest win, lowest risk — ship first.)*
- **P2 — Live hole preview during drag.** Reuse `FastPathProjectorService` / preview infra to
  show the hole at the dragged offset before commit, for OBC-grade perceived latency.
- **P3 — Jamb-local segment rebuild** in `WallFragmentBuilder` so even the commit touches only
  the two segments around the moved opening.
- **P4 (insurance) — worker/idle defer** of the authoritative build if P1–P3 still leave a tail
  hitch on very dense levels; keep the P2 preview on screen until it lands.
- **P5 (optional) — warm the plan projection cache** on `bim-wall-mutation-committed`.

## Acceptance criteria

- Moving a door on a 40-wall level produces **no whole-level join resolve** (assert
  `resolveLevel` not called for an openings-only delta).
- No visible neighbour-wall flicker on a door nudge.
- View-switch p95 stays within the existing budget (`apps/bench/.../view-switch.bench.ts`).
- Join correctness and undo/redo regression suites unchanged and green.
</content>
