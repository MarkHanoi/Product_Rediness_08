# ADR-0113 — Kitchen fidelity: accurate preview, professional plan symbol, and continuous second placement

- **Status:** Accepted (2026-07-02) — **AMENDED IN PART 2026-08-01 (L-665): see the correction note below.**
- **Tags:** `§FEAT-KITCHEN-ACCURATE-PREVIEW`, `§FEAT-KITCHEN-PLAN-SYMBOL`, `§FIX-KITCHEN-SECOND-PLACE`
- **Founder audit rows:** L-34 (preview), L-35 (plan symbol), L-33 (second placement), L-23-RV (Space-rotate re-verify)
- **Governs:** C06 (interaction / placement), C11 (element-creation pipeline), C18 (catalogue / representation & element-preview visual standard). Relates to Contract §41 (Object Placement Preview Standard), ADR-0107 (`§FIX-PARAMETRIC-SPACE-ROTATE`), ADR-0110 (unified furniture plan-symbol vocabulary).
- **Layers touched:**
  - L2 `packages/geometry-furniture/src/builders/KitchenPlanSymbolBuilder.ts` — work-triangle overlay, public `buildConfigLinework(cfg)`, single-ink purple.
  - L7.5 `apps/editor/src/ui/kitchen/KitchenCabinetTool.ts` — real-engine ghost, scalar-yaw commit, re-arm.
  - L7.5 `apps/editor/src/engine/views/plantools/FurniturePlanToolHandler.ts` — kitchen plan-preview from the shared linework.

## Context

Four founder-reported defects in the parametric kitchen (`kitchen_straight` / `_l_shape` / `_u_shape` / `_island` + `_tall`):

- **L-34 — preview was a bounding RECTANGLE.** `KitchenCabinetTool._buildPreview()` built a coarse box per arm (`BoxGeometry(len, ht, dep)` + one box per L/U arm). The ghost never showed the true configured footprint (arm lengths, unit dividers, appliance massing), and it could drift from the committed geometry because it was authored separately from the engine.
- **L-35 — plan symbol.** `KitchenPlanSymbolBuilder` already drew a professional symbol (run outlines per arm, per-unit dividers, sink/hob/fridge/washer glyphs, door-swing arcs, dashed upper cabinets for `_tall`, countertop line), but it was missing the **work-triangle** the founder's reference shows, and it inked in black.
- **L-33 — a second kitchen would not place.** Two coupled causes: (1) `_placeKitchen()` sent `rotation: { x, y, z, order }` (a Euler **object**) to `furniture.create`, whose `CreateFurnitureHandler.canExecute` validates `Number.isFinite(rotation)` and makes the CommandBus **throw** `canExecute rejected — rotation must be finite`; the `.catch` swallowed the throw while the tool still "deactivated" as if placed, so **no run was ever committed via the 3D path**. (2) After a commit the tool called `deactivate()`, tearing down its ghost + listeners while `ToolManager.activeTool` stayed `'furniture'` — so continuous placement (the founder's "place a second one") was impossible without re-picking the carousel.
- **L-23-RV — Space-rotate.** ADR-0107 already converged the kitchen tool on the shared `PrePlacementRotation` (SPACE = +90°, committed yaw). Verified end-to-end; the founder's "Press R" screenshot was a pre-fix bundle.

## Decision

1. **§FEAT-KITCHEN-ACCURATE-PREVIEW — one config → one geometry.** The 3D ghost is now built by the **same** `KitchenCabinetEngine.create(cfg)` that produces the committed run, then every mesh is re-skinned with `createObjectPreviewMaterial()` (Contract §41 PRYZM purple). Preview ≡ placed massing by construction. A single `_buildEffectiveConfig()` (unit-array normalisation) feeds both the ghost and the commit. The plan-view ghost (`FurniturePlanToolHandler`) draws the true outline from `KitchenPlanSymbolBuilder.buildConfigLinework(cfg)` — the exact linework the placed symbol uses — instead of the bounding-box `FOOTPRINTS` rectangle. No parallel geometry is invented.

2. **§FEAT-KITCHEN-PLAN-SYMBOL — work-triangle + brand ink.** The plan symbol adds the standard dashed **work-triangle** connecting the sink / hob / fridge glyph centres (≥2 poles → the connecting legs; 3 poles → the closed triangle), transformed into root coords through the same reflection/rotation the arm linework uses so a vertex sits on its glyph. The placed kitchen symbol inks in **single-ink PRYZM purple `#6600FF`** (`PLAN_SYMBOL_INK`) per the founder's brand directive.

3. **§FIX-KITCHEN-SECOND-PLACE — scalar yaw + re-arm.** `_placeKitchen()` now commits a **scalar** `rotation: rotY` (radians), matching `FurniturePlanToolHandler` / the wardrobe-plan path and satisfying `canExecute`. After a successful commit the tool **stays armed** (resets the SPACE yaw to 0° and rebuilds the ghost) so the next click places another run; Esc / tool-switch still `deactivate()` cleanly. `newKitchenRunId()` mints a monotonic-counter id so two same-millisecond placements never collide.

## Consequences

- The kitchen ghost is the exact configured run in **both** plan and 3D, live-updating as the config sliders change; preview and committed geometry can never diverge (shared `create(cfg)` / shared linework).
- The 3D kitchen tool actually commits again (the object-rotation reject is gone) and supports continuous placement.
- **Deliberate deviation from ADR-0110:** the sibling `*PlanSymbolBuilder` classes still ink the drawing in black. The kitchen symbol is now purple per the founder's L-35 directive — a scoped, single-constant (`PLAN_SYMBOL_INK`) change, reversible by re-pointing that constant if the drawing-wide ink convention is ever unified. Noted here so the divergence is intentional, not an oversight.
- **Follow-up (out of scope):** `WardrobeCabinetTool` has the identical latent object-rotation + deactivate-after-one-placement defect (same shared payload shape) — a candidate for the same fix.
- Tests: `packages/geometry-furniture/__tests__/kitchenAccuratePreview.test.ts` (preview linework ≡ placed-symbol linework for an L; not a bounding box; dividers scale with unit count; work-triangle poles) + `apps/editor/__tests__/ParametricPlacementSpaceRotate.test.ts` (SPACE advances the second-placement commit yaw; distinct ids). Existing `kitchenPlanSymbolPro` suite still green.

## AMENDMENT — 2026-08-01 (audit **L-665**): decision 3's id generator was wrong and is withdrawn

Decision 3 above ends *"`newKitchenRunId()` mints a monotonic-counter id so two same-millisecond placements
never collide."* The **requirement** (distinctness across a re-arm) was right; the **mechanism** was not.
`` `kitchen_${Date.now()}_${counter}` `` contradicts **ADR-0001** (every element id is
`<prefix>_<26-char Crockford ULID>`, minted by `createId(prefix)`) and is rejected by the `Furniture` schema's
id regex at `Furniture.parse` inside `CreateFurnitureHandler.execute`. So §FIX-KITCHEN-SECOND-PLACE fixed the
rotation reject and replaced it with an **id reject**: the founder reported on 2026-08-01 that an L-shape
kitchen still could not be placed in 3D — a dead click behind a perfect preview, because the preview path
never validates. The `distinct ids` assertion in `ParametricPlacementSpaceRotate.test.ts` did not catch it:
that test **re-implemented the same generator locally** and only asserted uniqueness, never schema validity.

**Withdrawn:** `newKitchenRunId()` (deleted). **Replaced by:** `newFurnitureId()` =
`createId('furniture')`, exported from the canonical
`apps/editor/src/engine/furniture/furnitureCreatePayload.ts`, which now mints (or validates) the id for every
editor furniture placement surface. A ULID's 80-bit random tail preserves this ADR's distinctness guarantee
for same-millisecond placements. `WardrobeCabinetTool` — flagged in the Consequences above as carrying "the
identical latent defect" — had the same id defect and is fixed in the same pass. Status: implemented,
**pending live verification**. Class-level gap (no contract mandates the single minter) logged as **L-666**
and recorded in C11 §7.6.
