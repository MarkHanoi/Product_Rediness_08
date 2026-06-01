# ADR-0028 — Plan-view canvas architecture

- Status: **Accepted** (2026-04-27)
- Sprint: **S29** (Phase 2A — non-element-family completion, M15)
- Authors: PRYZM 2 BIM rebuild
- Related: ADR-0003 (FrameScheduler priority vs deadline), ADR-0006 (idle-continuation budget),
  ADR-0009 (frozen producer signature), ADR-0021 (plugin-descriptor bootstrap),
  `docs/03-execution/plans/legacy/phases/PHASE-2/2A-Q1-M13-M15-NON-ELEMENT-COMPLETION.md` §S29

---

## Context

S29 introduces the **plan view** — the orthographic top-down 2D drawing surface that every
BIM tool needs (the literal "floor plan").  Plan view is the foundation for §M15's
documentation pass (S30 sections, S31 dimension billboards, S32 schedules) and is the first
PRYZM 2 view that does **not** use the THREE renderer.

Three architectural questions need an answer before the surface can be written:

1. **What renders the plan?**  THREE.OrthographicCamera, an SVG layer, or a vanilla
   `HTMLCanvas` 2D context?
2. **How is the plan-view render loop integrated with the existing FrameScheduler** so the
   60 fps interactive / 0 fps idle invariant holds across both 3D and 2D surfaces?
3. **What is the projection contract** between element DTOs (walls / slabs / doors / …)
   and the 2D drawing primitives (line segments + polygons + door breaks)?  Does the canvas
   host walk the stores directly, or does it consume a pre-projected scene?

The PRYZM 1 plan view used `THREE.WebGLRenderer` with an OrthographicCamera and a custom
post-FX stack to fake line-quality strokes.  This was expensive (a full WebGL context per
plan tab) and incompatible with multi-window split layouts.  We do not want to repeat that.

## Decision

### §1. The plan view is a vanilla 2D `HTMLCanvas` (no THREE)

Three renderer for plan view is rejected: THREE buys nothing for line-art drawing
(no shading, no texturing), and it forces a second WebGL context per plan tab.  SVG was
considered and rejected because text-anchor + line-join control across browsers is uneven
and the per-element DOM cost dominates above ~5,000 segments — plan views routinely render
20,000+ segments in real projects.

The `HTMLCanvas` 2D API gives us:

- A single OS surface per plan tab (no WebGL handle pressure).
- Trivially predictable text + arrowhead rendering.
- A clean fall-back to SVG export by replaying the same projected scene.
- No mandatory dependency on `three` for code paths that never need it (P2 isolation lint
  already forbids THREE imports outside `plugins/*/committer/`; this surface stays clean).

### §2. `CanvasHost` abstract base class lives in `plugins/plan-view/` for now

The S29 spec talks about `@pryzm/ui/CanvasHost` but no `@pryzm/ui` package exists today.
Promoting the base class to a shared package is deferred until the second consumer
(section views, S30) lands — at that point the move is a one-file rename + a workspace
manifest update.  Until then, the abstract class lives next to its first concrete subclass
(`PlanViewCanvasHost`) so the shape is set by the first real use case, not by speculation.

`CanvasHost` exposes a 4-method contract:

```ts
abstract class CanvasHost {
  protected abstract subsystemId(): string;
  protected abstract render(): void;
  mount(container: HTMLElement): void;
  dispose(): void;
  requestRender(): void;
}
```

Constructor takes `{ scheduler, canvasFactory? }` — the factory is injectable so tests can
drop in a fake `<canvas>` without JSDOM (matches the existing committer test pattern).

### §3. FrameScheduler dirty-flag drives render — true 0 fps idle

`requestRender()` is the **only** way the host paints.  It does two things:

1. Flips `this.dirty = true`.
2. Calls `scheduler.requestFrame('<subsystem>-dirty', 'interaction')`.

The host registers a single `addTickListener('<subsystem>-render', cb, 'render')`.  The
callback drains the dirty flag and calls `render()` only if dirty was set.  This means:

- One mutation = one frame request = exactly one `render()` call.
- Idle = no frame request = the FrameScheduler stops the rAF loop after the
  `IdleContinuation` 30-frame budget (ADR-0006).  **0 fps idle is real**, not a polled
  no-op.
- Interactive churn (camera pan, dragging, level switching) coalesces multiple
  `requestRender()` calls into one frame request because the scheduler dedupes pending
  requests by reason.

Cross-tab integration: each plan tab is a separate `PlanViewCanvasHost` instance with its
own listener id (`plan-view-render-{tabId}`).  The FrameScheduler's listener registry keys
by id, so multi-tab plan-view layouts compose naturally.

### §4. Projection is a pure function — `projectPlanScene(input) → PlanScene`

The canvas host does **not** walk stores in `render()`.  It snapshots the relevant store
states into plain DTO arrays and hands them to a pure module-level function:

```ts
projectPlanScene({
  walls: readonly Wall[],
  slabs: readonly Slab[],
  doors: readonly Door[],
  levelId: string,
}) → {
  wallSegments: PlanSegment[],
  slabOutlines: PlanPolygon[],
  doorBreaks:  PlanSegment[],
}
```

The projection rule is "drop world Y, keep XZ":

- World X+ → plan +X
- World Z+ → plan +Y
- World Y → vertical, dropped

`levelId` is the active level filter — only elements whose `levelId === input.levelId` are
emitted.  Doors that don't have an explicit `levelId` are filtered indirectly through their
host wall (`Door.wallId` → `Wall.levelId`).

Door breaks are clamped to the host wall length so a stale `Door.offset + Door.width` that
would otherwise overrun the wall end can never emit a break beyond the host's footprint.

Because the projection is pure, three downstream consumers can share one implementation:

1. The plan-view canvas host (renders the scene to `<canvas>`).
2. The SVG / DXF export pipeline (S30+).
3. The unit tests (assert on the scene shape directly — no canvas needed).

### §5. LevelStore is `ephemeral`

`LevelStore extends Store<LevelData>` with `static ephemeral = true`.  Levels are project
metadata loaded on project open — they are NOT replayed through the command-bus event log
alongside element mutations.  This mirrors the `ActiveViewStore` from S17 (ADR-0016) and
keeps the per-element event log free of view-state churn.

Active-level state is exclusive: at most one level has `isActive = true` at any time.
`setActive(id)` builds an Immer-shaped patch that flips every other level's `isActive` to
`false` in one apply, so subscribers see one dirty event per switch (not one per level).

### §6. Dimension scoping (cross-cut with S29 dimensions track)

Dimension annotations now carry a `levelId` field (default `''`).  The plan view filters
dimensions the same way it filters walls — by `Dimension.levelId === activeLevel.id`.
Dimensions remain renderable in 3D via the standard committer pipeline (S31+); the
`analyseDimension(dto)` analytic record returned by the kernel producer is consumed by both
the 2D plan-view text overlay and the 3D billboard committer, so the formatted label and
arrowhead anchors are computed exactly once per (DTO, hash) pair.

`Dimension.style ∈ {'architectural','engineering','custom'}` selects the arrowhead style
and the formatting locale; the geometry-kernel material key (`composeDimensionMaterialKey`)
folds the style into the cache key so style toggles invalidate the right minimum subset of
the geometry cache.

## Consequences

**Positive**

- Plan view is independent of the THREE renderer — no second WebGL context per tab, no
  isolation-lint exception needed.
- 0 fps idle is structural, not opportunistic — the FrameScheduler's existing idle-continuation
  budget covers the plan view automatically.
- Pure projection means SVG / DXF export is a one-day re-skin in S30, not a parallel
  rewrite.
- LevelStore being `ephemeral` keeps the event log clean for the per-element undo / redo
  + sync-server flows.

**Negative / accepted trade-offs**

- The `CanvasHost` base class lives in `plugins/plan-view/` instead of a shared
  `@pryzm/ui` package.  Promoting it requires moving one file when the second consumer
  (section views) needs it; an explicit follow-up ticket tracks this.
- Plan-view rendering is a separate code path from the 3D committer — there is one more
  surface to keep regression-tested.  We mitigate this with the canvas-host `tickCount` /
  `renderCount` counters that the unit tests assert on directly.
- Dimension `levelId` defaulting to `''` means existing dimensions persisted before S29
  appear on every level until a one-time migration assigns them.  The migration is
  deferred until the persistence-loader work in S32 (no production data exists yet).

## Alternatives considered

- **THREE OrthographicCamera with line shaders** — rejected (§1).
- **SVG plan view** — rejected (§1) on segment-count + cross-browser line-join concerns.
- **Direct store walks inside `render()`** — rejected (§4); breaks SVG export reuse and
  prevents pure unit tests of the projection logic.
- **Per-tick polling render** — rejected (§3); incompatible with the 0 fps idle invariant.

## Compliance / open follow-ups

- **Promote `CanvasHost` to `@pryzm/ui`** when section views land (S30).
- **Persist `Dimension.levelId` migration** when the persistence loader gains its
  schema-version-up bridge (S32).
- **`@pryzm/plugin-plan-view`** depends on `@pryzm/frame-scheduler` only — no THREE,
  no scene-committer.  Verified by the package's `tsconfig.json` (rootDir / composite
  flags) and the workspace `tsc --skipLibCheck` build pass.
