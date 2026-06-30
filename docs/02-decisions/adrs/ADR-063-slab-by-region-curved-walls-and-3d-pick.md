# ADR-063 — Slab "By Region": shared curve-aware tracer + 3D-view region pick

- **Status:** ACCEPTED (2026-06-30) — IMPLEMENTED.
- **Owner:** slab tool (`packages/geometry-slab`) + plan-view overlay
  (`apps/editor/src/engine/views/plantools`).
- **Affects:**
  - `packages/geometry-slab/src/SlabRegionTracer.ts` (NEW — pure, THREE-free tracer)
  - `packages/geometry-slab/src/SlabTool.ts` (3D tool — delegates to tracer + adds 3D hover preview)
  - `apps/editor/src/engine/views/plantools/SlabPlanToolHandler.ts` (plan overlay — delegates to tracer)
  - `packages/geometry-slab/__tests__/SlabRegionTracer.test.ts` (NEW — 9 tests)
- **References:** C11 (element-creation pipeline — slab is a floor/slab element),
  Contract §03-1.2 (curved-wall quadratic-Bézier descriptor `WallCurve.control`),
  `§SLAB-3D-PREVIEW` (DAILY-USE 2026-05-22 — 3D pointer resolves on the active-level plane),
  ADR-0061 (pure-predicate / no-OTel-span precedent), `§SLAB-REGION-CURVED`, `§SLAB-REGION-3D`.

## Context

The founder reported two related defects in the Slab **By Region** tool (auto-detect a slab
footprint from the closed loop of walls enclosing the clicked point):

1. **Curved-wall regions fail.** A room whose boundary includes a curved / filleted wall
   (e.g. `WA-00-009`) never closes → no region → no slab. Straight-edged rooms work.
2. **By Region does not work in the 3D view.** The same operation succeeds in plan view.
   Console: `[SlabTool] §SLAB-3D-PREVIEW pointermove tool=REGION_SLAB firstPointSet=false`.

### Root cause

The region tracer existed in **two divergent copies**:

- `packages/geometry-slab/src/SlabTool.ts` — the 3D tool. It already tessellated curved walls
  (a prior `_wallPlanCenterline` had landed) but had **no `onPointerMove` branch for
  `REGION_SLAB`**, so the 3D view gave the user *zero* hover feedback before clicking — no
  highlighted region, no candidate polygon until pointer-down. The region-preview mesh was also
  pinned at world `Y≈0` while the 3D pointer resolves on the active-level plane
  (`§SLAB-3D-PREVIEW`), so on any upper level the preview parallax-shifted off the cursor.
- `apps/editor/src/engine/views/plantools/SlabPlanToolHandler.ts` — the plan-view overlay. Its
  copy read each wall as a **single straight `baseLine` chord and dropped the `curve`
  descriptor entirely**. A loop bounded by an arc could therefore never close → defect (1) in
  plan view.

Two copies of the same graph-tracing logic had drifted: one curve-aware, one not; one with a
hover preview, one without.

## Decision

Extract a **single, pure, THREE-free tracer** — `SlabRegionTracer.ts` — and have **both** the
3D tool and the plan overlay consume it. The module operates on plain `{ x, y }` points
(`y` = world Z) and exposes `wallPlanCenterline`, `wallsToSegments`, `buildClosedLoops`,
`pointInPolygon`, `polygonArea`, and the top-level `findRegionAtPoint(walls, x, z)`.

- **Curved walls** are tessellated by sampling the quadratic Bézier
  (`baseLine[0] → curve.control → baseLine[1]`) into chords, each longer than the loop-builder's
  0.15 m vertex-weld tolerance so the intermediate nodes survive welding and the arc participates
  in loop closure. This makes a curved-wall region both **close** and **follow the curve** (the
  committed slab polygon bows with the wall instead of cutting a straight chord across it). The
  loop-walker's safety bound is raised (50 → 400) to accommodate tessellated rings.
- **Smallest-enclosing-loop preference:** `findRegionAtPoint` returns the minimal-area loop that
  contains the click, so an inner room wins over the building shell.

For defect (2):
- A `REGION_SLAB` branch is added to `SlabTool.onPointerMove` so the 3D view runs the same
  hover → detect → preview path as plan view.
- The region-preview mesh is placed at the **active-level elevation** (not `Y=0`), matching the
  `§SLAB-3D-PREVIEW` pointer-plane fix, so the highlight tracks the cursor under the angled 3D
  camera.

Creation continues to flow through the existing command path (`createSlabFromPolygon` →
`CreateSlabCommand` in the 3D tool; `slab.create` via the bus in the plan overlay) — no new
mutation path (C11 §7.0, P6).

### Why no OpenTelemetry span

`SlabRegionTracer` is pure 2D geometry — no I/O, no store reads, no command dispatch. It mirrors
the existing THREE-free slab utilities (`SlabGeomUtils`, `SlabValidator`) which carry no spans,
and follows the ADR-0061 pure-predicate precedent. The user-facing handler path (the tool's
pointer handlers) is unchanged in shape and already non-spanned in this legacy tool.

## Consequences

- The two tracers can no longer drift — one implementation, one behaviour in both views.
- The pure tracer is **unit-testable** without a DOM/THREE harness; 9 tests cover straight-room
  regression, curved-wall closure, curve-following polygon shape (area strictly greater than the
  straight-chord approximation), and tolerance welding.
- `@pryzm/geometry-slab` gains a `test` script + `vitest` devDep (matching `@pryzm/geometry-wall`);
  the pnpm lockfile was synced.
- Layering preserved: `geometry-slab` (L2) imports nothing higher; `apps/editor` (L5) imports the
  L2 tracer (a lower-layer import, already done for `SlabTool`).
