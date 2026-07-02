# ADR-0107 — Spacebar rotates the placement preview 90° (pre-placement rotation)

- **Status:** Accepted (2026-07-02)
- **Tag:** `§FEAT-PLACEMENT-SPACEBAR-ROTATE`
- **Layer:**
  - L4 shared state — `packages/core-app-model/src/preview/PrePlacementRotation.ts`
    (exported from `@pryzm/core-app-model`).
  - L7.5 / L5 tools — `apps/editor/src/engine/views/plantools/FurniturePlanToolHandler.ts`
    (plan view), `packages/geometry-furniture/src/FurnitureTool.ts` (3D view),
    `apps/editor/src/ui/furniture-carousel/FurnitureDragDropHandler.ts` (carousel GLB
    click-to-place), with the GLB commit path threaded through
    `apps/editor/src/engine/initFurnitureInteraction.ts` +
    `apps/editor/src/ui/layout/CreatePanelLayout.ts` +
    `packages/runtime-composer/src/types.ts` (`fc-add-glb.rotationY`).
- **Governs:** C06 (UI shell & tools), C11 (element-creation pipeline). Contract §41
  (Object Placement Preview Standard) gains §41 §7 — pre-placement rotation.
- **Relates to:** Audit finding **F5 / Q7** (no first-class rotation) — this ADR delivers a
  specific placement-time rotation UX while the general first-class rotation gizmo remains
  open. ADR-0027 (Furniture DTO), §FT-FURNITURE (bus→legacy furniture bridge),
  §FIX-FURNITURE-ROTATION (furniture.create scalar-yaw contract).

## Context

Founder directive (L-16): while an element is in **placement preview** on the scene — in either
the 3D view or the plan view — pressing **Spacebar rotates the preview 90° clockwise**,
repeatedly (90 → 180 → 270 → 0), until the user **commits** (click / Enter) or **cancels**
(Esc). The chosen orientation must carry through to the committed element. This is the Revit /
AutoCAD "orient-before-you-drop" convention: the user rotates the ghost, then clicks — instead
of place-then-select-then-rotate.

The screenshot that motivated this was a carousel furniture placement:
*"Corner Sofa — Click to place · Esc to cancel"*.

### The placement landscape (why a shared state is required)

PRYZM has **three** independent one-click placement flows, each with its own preview/ghost and
its own event plumbing — there is no single placement controller:

1. **Plan-view placement** — `FurniturePlanToolHandler` implements the `PlanToolHandler`
   interface. It draws a **Canvas2D** dashed footprint on an overlay. Keyboard is routed by
   `PlanViewToolOverlay._onKeyDown` → `handler.onKeyDown(e)` (the overlay intercepts Escape
   itself and honours the handler's returned `handled` boolean). Handlers **must not** attach
   their own DOM listeners (PlanToolHandler contract §21 §2).
2. **3D-view placement** — `FurnitureTool` (in `geometry-furniture`) owns its own
   `document`/canvas listeners and shows a **THREE** ghost group. Commits via the legacy
   `CreateFurnitureCommand` (Vec3 Euler rotation).
3. **Carousel GLB click-to-place** — `FurnitureDragDropHandler` arms canvas pointer listeners
   and shows a THREE box ghost, then emits `fc-add-glb` → `CreatePanelLayout` → `addFurniture()`
   which loads the GLB. Previously `addFurniture` had **no rotation parameter** at all.

The commit rotation conventions also differ: `furniture.create` (bus) validates a **scalar yaw
in radians** (`Number.isFinite(rotation)`, §FIX-FURNITURE-ROTATION); the `§FT-FURNITURE` bridge
lifts that scalar into the mesh's Y-Euler; the legacy `CreateFurnitureCommand` and the GLB loader
take a Vec3 Euler directly.

## Decision

Introduce a **single shared pre-placement rotation state** — `PrePlacementRotation`
(`packages/core-app-model/src/preview/`) — and converge all one-click placement tools on it
rather than duplicating per-tool rotation logic.

`PrePlacementRotation`:
- holds a cumulative yaw about world-up (Y), advanced +90° (`PRE_PLACEMENT_ROTATION_STEP`) per
  press, normalized to `[0, 2π)` so 90→180→270→0 wraps;
- exposes `rotationY()` (radians, read into the create-command payload — **P6**: rotation flows
  through the command, not a post-hoc store write) and `degrees()` (HUD text);
- offers `attach()` / `detach()` — a `document` capture-phase keydown listener that advances on
  SPACE, **ignores SPACE while a form field is focused** (typing a dimension is unaffected), and
  `preventDefault()`s so the page never scrolls and no other SPACE shortcut fires;
- `reset()` returns to 0° (Esc / tool-switch); `setBase()` seeds a facing without firing
  `onChange` (for wall-snapping tools that recompute the base every pointer-move).

**Per-tool integration:**
- **Plan handler** constructs the state but does **not** `attach()` (contract §21 §2) — it
  advances from `onKeyDown` on SPACE (already overlay-routed), returns `true` so the overlay
  `preventDefault`/`stopPropagation`s, and rotates only the dashed footprint geometry (label +
  bottom-left hint stay upright). Commit sends `rotationY()` as the scalar `rotation`.
- **3D FurnitureTool** `attach()`es on activate / `detach()`es on deactivate; applies
  `rotationY()` to the ghost in `onPointerMove` + `onChange`, and commits `{ x:0, y:rotationY, z:0 }`.
  Multi-click wardrobe / corner-wardrobe gestures derive their facing from the drawn baseline, so
  SPACE rotation applies only to the single-click branch.
- **Carousel GLB** `attach()`es while a GLB placement is armed; rotates the box ghost; forwards
  `rotationY` on `fc-add-glb`. `addFurniture(path, pos, rotationY)` applies it to `model.rotation.y`
  and persists it on the furniture-store record (survives reload / undo-redo).

**Rendering (P3):** no new `requestAnimationFrame`. Preview re-orientation reuses each renderer's
existing MANUAL-mode `needsUpdate` hook (guarded off the WebGPU/ShadowDepthTexture path) and the
plan overlay's synchronous redraw.

**Scope:** free-standing, point-placed elements (furniture, GLB carousel items, and — by reusing
the same shared state — plumbing / lighting when those tools opt in). **Wall-hosted door/window**
placement is deliberately excluded: there "rotation" means host-side / flip, not a free 90° spin
(C15). Those tools do not install `PrePlacementRotation`.

## Consequences

- **Positive:** one source of truth for the interaction → identical behaviour across 3D and plan;
  the committed element carries the chosen orientation via the command (P6); the general
  first-class rotation gizmo (F5/Q7) can be built independently without reworking this.
- **Neutral:** the GLB `fc-add-glb` event gained an optional `rotationY` (defaults to 0 — plain
  drag-drop, which has no preview rotation, is unaffected).
- **Follow-up (F5/Q7):** post-placement rotation (select-then-rotate with a gizmo/handle) and
  extending `PrePlacementRotation.attach()` into the plumbing and lighting tools remain open.

## Verification

`packages/core-app-model/src/preview/PrePlacementRotation.test.ts` — proves +90°/press cumulative
wrap, that commit reads the accumulated yaw, `reset()` on Esc, the form-field guard + `preventDefault`,
and `detach()` no-leak. 14 assertions (9 pure-logic always-run + 5 DOM-key under happy-dom;
the DOM block self-skips under the node env core-app-model runs).
