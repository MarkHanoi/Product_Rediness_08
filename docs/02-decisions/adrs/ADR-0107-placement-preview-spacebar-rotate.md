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
- **Follow-up (F5/Q7):** post-placement rotation (select-then-rotate with a gizmo/handle) remains open.
  Extending `PrePlacementRotation.attach()` into the plumbing and lighting tools also remains open —
  those flows are wall-hosted / radially-symmetric, so pre-placement 90° spin is low-value there.

## Amendment (2026-07-02) — `§FIX-PARAMETRIC-SPACE-ROTATE` (founder L-20/L-21/L-23)

The original decision converged the three *simple* one-click flows. The **parametric** placement
tools — `apps/editor/src/ui/kitchen/KitchenCabinetTool.ts` and
`apps/editor/src/ui/wardrobe/WardrobeCabinetTool.ts` — were a separate flow that forked their **own
local "R" key** (`preview.rotation.y += π/2`) and read the yaw off the live preview mesh at commit.
That violated the "single source of truth" intent and gave the user an inconsistent keybinding
("Press R to rotate" in the config panel vs. SPACE everywhere else).

These two tools now **reuse the same `PrePlacementRotation`** (no fork): they `attach()` on
`activate()` / `detach()` + `reset()` on `deactivate()`; `onChange` re-orients the live ghost even
when the pointer is stationary; `_buildPreview()` seeds the ghost's `rotation.y` from `rotationY()`
so a config-driven rebuild keeps the orientation; and `_placeKitchen()` / `_placeWardrobe()` read
`rotationY()` (not the preview mesh) into the `furniture.create` payload. The local "R" handler is
removed and both config-panel hints now read "Press Space to rotate 90°".

Two related preview-correctness fixes ship under the same tag (`§FIX-PLACEMENT-PREVIEW`):
- **L-20 (immediate preview):** the parametric tools build the ghost inside `activate()`, so the
  preview is visible the instant the tool is armed — before the first pointer-move/click. (The 3D
  `FurnitureTool` and the plan handlers already did this; the carousel GLB ghost shows on the first
  move after arming.)
- **L-21 (accurate size):** the carousel GLB click-to-place ghost previously used a fixed
  `1×1×1 m` box regardless of the item — the only size cue when the GLB itself 404s. The
  `fc-place-glb-start` event now carries the catalog descriptor's **declared footprint**
  (`dimensions`), and `FurnitureDragDropHandler` sizes the ghost from it (falling back to the 1 m
  block only when no dimensions are supplied). Parametric ghosts are already built from the run
  config; plan/3D ghosts from the registry/`FOOTPRINTS`.

No API change to `PrePlacementRotation` (class stays stable — a sibling builds the post-placement
gizmo on it). The per-flow verdict table lives in `docs/04-reference/V1-LAUNCH-READINESS-AUDIT.md`
§3.2.

## Verification

`packages/core-app-model/src/preview/PrePlacementRotation.test.ts` — proves +90°/press cumulative
wrap, that commit reads the accumulated yaw, `reset()` on Esc, the form-field guard + `preventDefault`,
and `detach()` no-leak. 14 assertions (9 pure-logic always-run + 5 DOM-key under happy-dom;
the DOM block self-skips under the node env core-app-model runs).

`apps/editor/__tests__/ParametricPlacementSpaceRotate.test.ts` (§FIX-PARAMETRIC-SPACE-ROTATE) — 7
assertions proving the parametric flows' contract without the renderer: the shared rotation is the
single commit-time yaw source (advance→wrap→`rotationY()`), `onChange` fires on a stationary press,
`reset()` on deactivate; and the kitchen/wardrobe ghost dimensions track the shared builder config
(`buildDefaultKitchenConfig` / `buildDefaultWardrobeCabinetConfig`), never a fixed default box.
