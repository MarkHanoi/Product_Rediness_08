# Element-Lifecycle Remediation Plan

> **Companion to**: `docs/02-decisions/adrs/ADR-0098-element-lifecycle-conformance-audit.md`
> **Status**: ACTIVE · **Date**: 2026-07-02
> **Purpose**: Turn the ADR-0098 findings (F1–F9) into a prioritized, testable delivery plan. Every item lists
> the target files, the `§`-tag, the acceptance criteria, and a regression test. Contract-changing items must
> land a superseding ADR — never a new `*-AUDIT.md`.

---

## Priority ladder

- **W1 — Ship-blocker freezes** (F1, F2): the app locks; nothing else matters until these clear.
- **W2 — Interaction correctness** (F4 selection, F7 WebGL ghost): visible, high-frequency, low-risk fixes.
- **W3 — Edit-storm containment** (F3): the amplifier behind the freezes; systemic perf.
- **W4 — Architectural uniformity** (F5 rotation, F6 materials, F8 movement): new command families.
- **W0 — Audit completion** (the ADR-0098 **N/V** cells): verify the untraced matrix cells to full coverage.
- **W5 — Carried hygiene** (F9): bridge fallbacks, init sentinel, `CLAUDE.md` contract-path fix.

Deliver W1 → W2 → W3 in that order (each independently shippable). W4/W0 run in parallel as a background track.

---

## W1 — Ship-blocker freezes

### W1.1 — Wall-move-with-hosted-door freeze (F1) — IN FLIGHT
- **Root cause**: `DoorBuilder.rebuildForWall(wallId)` scans `O(all-doors-in-project)` per rebuilt wall
  (`WindowBuilder` identical), inside a synchronous whole-level `O(N²)` `WallJoinResolver.resolveLevel` with
  no main-thread yield.
- **Files**: `packages/geometry-door/src/DoorBuilder.ts`, `packages/geometry-window/src/WindowBuilder.ts`,
  `packages/geometry-door/src/DoorStore.ts`, `packages/geometry-window/src/WindowStore.ts`,
  `apps/editor/src/engine/WallRebuildCoordinator.ts`.
- **Fix** (`§FIX-HOSTWALL-DOOR-INDEX` + `§FIX-HOSTWALL-MOVE-COALESCE`):
  1. Maintain a `wallId → Set<openingId>` index in the door/window stores; `rebuildForWall` becomes
     `O(openings-on-that-wall)`.
  2. Route a wall **move** through the once-settle deferred path (`__wallDragInProgress` +
     `resumeAndFlushDeferredDrag`, ADR-057/061) so the whole-level resolve + redetect + plan re-projection fire
     **once** after the move, not per hosted child.
- **Acceptance**: moving a host wall with K doors visits only K door records; a multi-door level move stays
  interactive (no >1 frame stall). **Regression test**: `apps/editor/__tests__/` — index lookup returns only
  the wall's own openings; move triggers a bounded rebuild count. Model on `loadRedetectFreeze.test.ts`.
- **Contract**: restores C15 §3 + C10; add the C15 §9 rebuild-duration span if missing.

### W1.2 — Project-open freeze (F2) — OPEN
- **Symptom**: persisted project loads fully, then UI (viewport **and** buttons) locks; `redetect_sweep` is
  already skipped, so it is a **post-load** storm.
- **Approach**: instrument the post-load window — capture what runs after `pryzm-project-loaded` (wall
  re-anchor / `rebuildWalls` re-queues, plan re-projection, instancing coalesce). Likely the same re-anchor
  fan-out as W1.1 applied across every level at once. Land W1.1 first, then re-test F2; if still present, add a
  post-load yield/budget so per-level settle is chunked (mirror `§LOAD-CHUNKED`).
- **Files**: `apps/editor/src/engine/persistence/ProjectLoader.ts`, `WallRebuildCoordinator.ts`,
  `apps/editor/src/engine/initBatchLifecycle.ts`.
- **Acceptance**: opening the "Madrid"-class project stays interactive within 1–2 frames of load; a repro test
  asserting bounded post-load rebuild work.

---

## W2 — Interaction correctness

### W2.1 — 3D selection picks wrong element (F4)
- **Root cause**: gpu-pick **search-radius fallback** returns the nearest/larger-footprint neighbour instead
  of the id at the exact cursor pixel; worsens with density.
- **Files**: `packages/picking/**` (start `packages/picking/src/types.ts`), the editor pick resolver
  (`§SELECT-PICK-RESOLUTION`, `PickResolver`, `SelectionManager`).
- **Fix** (`§SELECT-EXACT-PIXEL-FIRST`): exact cursor pixel wins whenever it carries a valid id; radius
  fallback engages only when the exact pixel is empty, then picks the **nearest-to-cursor** candidate (depth
  tiebreak), never the largest footprint. Preserve ≥1:1 resolution + thin-element preservation; don't regress
  instanced-wall/window picking.
- **Acceptance**: synthetic id+depth buffer test — cursor over window id returns the window even with an
  adjacent door cluster; returns the door only when the cursor pixel is empty. **Contract**: C15 §11/§12, C06.

### W2.2 — WebGL2 ghost/duplicate-on-rotate (F7)
- **Root cause**: OBC base canvas context is `preserveDrawingBuffer:false`; `§FIX-OBC-BASE-STALE-COMPOSITE`
  clears it once at activate/swap, so the stale buffer resurfaces under the transparent overlay during
  `§PERF-WEBGL2-RENDER-ON-MOVE` repaints.
- **Files**: `packages/renderer-three/**`, `packages/core-app-model/src/rendering/**` (RenderPipelineManager /
  RenderingPipelineCoordinator).
- **Fix** (`§FIX-WEBGL2-GHOST-ON-ROTATE`): clear color+depth / invalidate the base framebuffer per move-frame
  on the **WebGL2 path only** (WebGPU untouched); keep render-on-move behaviour.
- **Acceptance**: rotating a multi-wall model on WebGL2 shows no trailing; WebGPU output byte-unchanged.
  **Contract**: C04.

---

## W3 — Edit-storm containment (F3)

- **Symptom**: every wall edit fires `REDETECT_ROOMS` + a whole-level plan re-projection chain
  (`EdgeProjector` → `HiddenLineRemoval` → `NativeElementMeshExporter` → symbol builders).
- **Fix**: (a) confirm the 300 ms redetect soft-coalesce actually gates a *move* (not just discrete edits);
  (b) make plan re-projection incremental/dirty-scoped instead of whole-level per edit; (c) ensure edits inside
  a drag defer projection to drag-end.
- **Files**: room-topology observer, `apps/editor/src/engine/views/EdgeProjectorService.ts`, plan-view host.
- **Acceptance**: a single wall edit triggers at most one redetect + one incremental projection for the
  affected region. **Contract**: C04, C10. This is the amplifier behind F1/F2 — deliver after W1 to confirm the
  freeze is fully gone under load.

---

## W4 — Architectural uniformity (new command families)

### W4.1 — Uniform transform: Rotation (F5) + Movement (F8)
- **Gap**: no `Rotate*Command` exists; movement is per-family. Elements without a rotation path: columns,
  beams, stairs, handrails, most furniture.
- **Design**: introduce a `transform.move` / `transform.rotate` command family (or a documented per-family
  contract) so every element type has a consistent, discoverable, undoable transform path with an OTel span.
  Walls keep baseline semantics (C15 §7 reversal guard) but expose the same verb surface.
- **Deliverable**: a superseding ADR defining the transform-command contract (extends C16); implement for
  furniture + columns/beams first (highest user value), then the rest.
- **Acceptance**: each element family has a move + rotate command with undo + span; properties panel + gizmo
  both dispatch it.

### W4.2 — Uniform materials/finish (F6)
- **Gap**: only walls/doors/windows have material commands; horizontals go via layers; structural/MEP/
  furnishings have none.
- **Design**: a `material.set` affordance per element (dedicated command or a documented generic
  `UpdateElementParameterCommand` material path) honouring C18 preview-visual semantics and the unified purple
  preview.
- **Acceptance**: material/finish is editable from the properties panel for every visible element family;
  change reflects in 3D within one rebuild.

---

## W0 — Audit completion (close the ADR-0098 N/V cells)

Trace to source and upgrade each **N/V** cell to OK/GAP/BROKEN:
- Slab/floor/ceiling/roof **movement** (`UpdateSlabLevel/PolygonCommand`) and **binding**
  (`FloorSlabBindingHandler`, `RoomFinishSyncService`).
- Structural/furniture **rotation** + **dimensions** wiring (gizmo → command).
- Hosting/anchoring traces: beam↔grid/columns, stair↔levels, furniture↔room/floor, lighting↔ceiling,
  plumbing↔wall.
- **Output**: update the ADR-0098 §4 matrix in place (edit the canonical ADR — do not spawn a new doc).

---

## W5 — Carried hygiene (F9)

- E.5.6 bus bridge: replace the silent `if (cm) cm.execute(...)` no-op with an explicit error path.
- Add `window.__pryzmInitComplete` sentinel; assert in `PlanToolDrawContext` (catches partial-init silent
  tool failure).
- `WallPlanToolHandler`: pass `{ source: 'HUMAN_DIRECT' }` instead of `window.commandContext` where
  `metadata` is expected.
- **Fix `CLAUDE.md`**: the contracts path is `docs/02-decisions/contracts/` (not `docs/00_Contracts/`); the
  wrong path made automated audit passes thrash.

---

## Sequencing summary

| Wave | Items | Gate |
|---|---|---|
| **Now** | W1.1 (in flight), then W1.2 | no freeze on host-wall move or project open |
| **Next** | W2.1 selection, W2.2 WebGL ghost | correct pick + no rotate-trail |
| **Then** | W3 edit-storm | one redetect + incremental projection per edit |
| **Background** | W4 transform + materials, W0 matrix completion, W5 hygiene | uniform command surface + full ✅ matrix |

Each wave is independently shippable to `pryzm.fly.dev` via the standard push→deploy loop, gated on root
`tsc --skipLibCheck --noEmit` = exit 0.

---

## Live reported-items queue (founder-reported; append-only)

Every founder-reported issue is logged here so nothing is lost. Status: OPEN / IN-PROGRESS / SHIPPED.

| # | Item | Maps to | Status |
|---|---|---|---|
| Q1 | Wall-move-with-hosted-door total freeze | ADR-0098 F1 / ADR-0099 | SHIPPED (merged c9fcbdf5) |
| Q2 | Heavy-tower (40-storey) navigation too slow | W-nav (shadow ceiling / instancing / nav-LOD) | IN-PROGRESS (agent) |
| Q3 | Heavy-project load fails ("Load timed out 30s") + frozen view; autosave-during-load; clear-on-switch O(N); 940 RBLs | ADR-0098 F2 + C13/C05 | IN-PROGRESS (agent) |
| Q4 | 3D selection picks wrong element (window→door) | ADR-0098 F4 / W2.1 | OPEN |
| Q5 | WebGL2 ghost/duplicate-on-rotate | ADR-0098 F7 / W2.2 | OPEN |
| Q6 | Per-edit redetect + full plan-reprojection storm | ADR-0098 F3 / W3 | OPEN |
| Q7 | No first-class Rotate command; uneven Materials commands | ADR-0098 F5/F6 / W4 | OPEN |
| Q8 | **Wall-draw rubber-band preview stutters / gets stuck** while placing the 2nd point (empty project, 0 elements — NOT density). Suspects: (a) first wall flips SceneQualityTier→cinematic → TRAA/SSGI/shadows-high pipeline REBUILD mid-draw; (b) TRAA temporal accumulation ghosts a thin moving preview line so it reads as "stuck"; (c) preview pointermove doesn't request a render every move (render-on-demand drops frames); (d) frame-scheduler coalesces/drops preview updates. Files: WallTool pointermove/preview path, RenderPipelineManager tier-change, frame scheduler render-request. | NEW → W6 | OPEN |

### W6 — Wall-draw preview responsiveness (Q8)
- **Acceptance**: rubber-band wall preview updates smoothly every pointer move on an empty project, no stutter/stuck frames; drawing the first wall must NOT trigger a mid-draw render-pipeline rebuild that stalls the preview (defer tier escalation until the draw commits, or make the preview render-request unconditional per move). Consider suppressing TRAA/temporal accumulation on the transient preview line.
- **Contract**: C04 (rendering/scheduling), C06 (UI shell & tools).
