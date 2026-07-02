# V1 Launch-Readiness Audit — Basic Modeling UX (LIVING DOCUMENT)

> **Status**: LIVING · **Owner**: engine · **Started**: 2026-07-02 · **Target**: v1 launch (next week)
> **Companion plan**: `docs/04-reference/V1-LAUNCH-IMPLEMENTATION-PLAN.md` (phased/subphased, side-by-side).
> **Feeds from**: `ADR-0098` (element-lifecycle conformance audit), `ADR-0099` (host-wall freeze fix),
> `ELEMENT-LIFECYCLE-REMEDIATION-PLAN.md` (element detail + Q-queue).
> **Governance**: this is a launch-readiness rollup, NOT a `*-AUDIT.md` contract-derivative — it references the
> canonical C-contracts (`docs/02-decisions/contracts/`) and never redefines them.

## How to use this document
Every issue the founder reports (past + future) is logged in **§2 Issue Log** with an `L-NN` id and mapped to a
functional area in **§3**. Append new issues to the bottom of §2 and tick the area table in §3. The companion
plan turns these into phased work. **Nothing is dropped.**

Verdict legend: **OK** (verified working) · **GAP** (works but diverges/incomplete) · **BROKEN** (reproduced
defect) · **N/V** (needs source verification — file cited).

---

## §1 Scope — the "basic modeling must be perfect" surface

The v1 promise is that an architect can, flawlessly and responsively: **navigate the camera**, **create elements**,
**move/rotate/edit elements** (dimensions, materials, hosting), **select**, **create & manage views**
(plan / 3D / elevation / section / sheets), **annotate & dimension**, **undo/redo**, and **save/load** — on both
an empty project and a heavy one, without freezes or stutter.

---

## §2 Issue Log (append-only; founder-reported + audit-found)

| ID | Reported | Issue | Area | Verdict | Maps to |
|----|----------|-------|------|---------|---------|
| L-01 | founder | Wall-move with hosted door/window **freezes** the app | Editing/Hosting | BROKEN→FIXED | ADR-0099 (shipped 52ce2693); amplifier Q6 in flight |
| L-02 | founder | Heavy 40-storey tower **navigation too slow** | Camera/Perf | BROKEN | Q2 (agent) |
| L-03 | founder | Heavy project **load fails** ("timeout 30s") + frozen view; autosave-during-load; clear-on-switch O(N); 940 RBLs | Save/Load | BROKEN | Q3 (agent) / ADR-0098 F2 |
| L-04 | founder | **Selection picks wrong element** (window→door), worse with density | Selection | BROKEN | Q4 (agent) / F4 |
| L-05 | founder | **WebGL2 ghost/duplicate on rotate** (WebGPU fine) | Camera/Render | BROKEN | Q5 / F7 |
| L-06 | audit | Per-edit **redetect + full plan re-projection storm** (freeze amplifier) | Editing/Perf | BROKEN | Q6 (agent) / F3 |
| L-07 | audit | **No first-class Rotate command**; rotation absent for most elements | Editing | GAP | Q7 / F5 |
| L-08 | audit | **Uneven material commands** (only walls/doors/windows) | Editing/Materials | GAP | Q7 / F6 |
| L-09 | founder | **Wall-draw rubber-band preview stutters/gets stuck** (empty project) | Modeling | BROKEN | Q8 (agent) / W6 |
| L-10 | founder | Wall-move freeze **"still present"** — was testing pre-F1 bundle; F1 deploying | Editing | INFO | verify post-deploy + Q6 |
| L-11 | founder | **Environment & Camera panel must be REAL**: real sun (Forma/Cesium ephemeris basis), real shadows + an invisible L0 shadow-catcher so every element casts a ground shadow, and every button meaningful (climate/heat/wind/population/post-fx) | Camera/Render/Env | GAP | design ready (map ab4e868) → ADR + impl; C04/C12/C19/C21/ADR-0074 |
| L-12 | founder | **Wall T-junction draws an "arrow"/spike** — guest wall should butt clean on the host, host unchanged | Editing/Geometry | BROKEN→FIXED | ADR-0055 §FIX-WALL-TJUNCTION-BUTT (batch 2) |
| L-13 | founder | **Plan-view door: wall lines don't close onto the frame — gap at the jamb** | Views/Drawing | BROKEN→FIXED | ADR-0104 §FIX-PLAN-DOOR-JAMB-SEAM (batch 2) |
| L-14 | founder | **Floor Finish default assembly thickness should = base offset** (avoid overlap; user-overridable) | Creation | GAP | queued; C11/C03 |
| L-15 | founder | **Properties panel must be professional** — remove stray lines, absolute alignment, organic to use | UI | BROKEN→FIXED | ADR-0103 §FIX-PROPERTIES-PANEL-POLISH (batch 2) |
| L-16 | founder | **Spacebar rotates the preview element 90° CW during placement** (all placeable elements, 3D+plan) until click/Enter commit / Esc cancel | Modeling/Creation | GAP | queued; extends F5/Q7; C06/C11 |
| L-17 | founder | **Every element needs a "change type" dropdown** to swap it for another type (e.g. sofa→another sofa). Exists for walls (WALL TYPE) but **doesn't work for existing placed elements** — select an element → replace with a different type | Editing/Types | SHIPPED | ADR-0105 §FEAT-ELEMENT-CHANGE-TYPE (batch 3) |
| L-18 | founder | **Duplicate furniture on open** — moving a sofa reveals an identical one underneath (collab catch-up re-creates already-placed furniture; dedup covers rooms/slabs/floors but not furniture) | Save/Load/Collab | BROKEN | agent acc09ea (C08) / §FIX-CATCHUP-DUPLICATE-CREATE |
| L-19 | founder | **Rotate gizmo shows full 3-axis sphere** — most elements only rotate about the VERTICAL axis (yaw); need single-axis default + per-type exceptions (roof/beam slope) | Editing/Rotation | GAP | routed to Rotate agent (a476739); C16/C11/C03 |
| L-20 | founder | **Placement preview must appear IMMEDIATELY** on element select — currently the ghost only shows AFTER the first click (which already creates the element), so the 1st placement has no preview. Applies to ALL placeable elements (furniture, windows, …) | Modeling/Creation | BROKEN | queued → preview agent; C06/C11/C18 |
| L-21 | founder | **Placement preview geometry must be PRECISELY ACCURATE** — a huge rectangle shows for a tiny bedside table; the ghost box doesn't match the element's real footprint/size (placeholder-box default when GLB 404s). Audit all elements | Modeling/Creation | BROKEN | queued → preview agent; C06/C11/C18 |
| L-22 | founder | **Furniture/interiors library card previews are low-quality / "tacky"** — `/items/**/thumbnail.webp` 404s in prod (tracker OBJECT-STORAGE-GLB) so cards fell back to mixed-metaphor side-view icons + a raster 3D isometric on a light-blue bg, inconsistent with PRYZM's clean plan symbols | UI/Symbols | BROKEN→FIXED | ADR-0110 §FIX-LIBRARY-DIAGRAM-ICONS (batch) — new pure `furniturePlanIcon.ts` renders clean **diagrammatic top-view** plan symbols (PRYZM purple `#6600FF`, single ink, no black) reusing the drawing's `*PlanSymbolBuilder` vocabulary; symbol is default+fallback for every card (real photo upgrades in if ever hosted); covers wardrobe/chairs/tables/beds/kitchen/sofas/trees/sanitary/cabinets + generic. Drawing symbols unchanged; C06/C18 |
| L-20/21/23 | founder | **Placement preview** — appear immediately on select (L-20), accurate footprint ghost (L-21), SPACE-rotate on ALL flows incl parametric kitchen/wardrobe (L-23) | Modeling/Creation | BROKEN→FIXED | ADR-0107 (amended) `§FIX-PLACEMENT-PREVIEW` + `§FIX-PARAMETRIC-SPACE-ROTATE` — kitchen/wardrobe reuse shared `PrePlacementRotation`; carousel GLB ghost sized to real descriptor footprint; per-flow audit table in §3.2 |
| L-25 | founder | **WebGPU 3D goes BLACK** after creating a few walls with lots of mouse motion, then clicking (2D plan still shows elements — it's Canvas2D). Console: `131× Destroyed texture [ShadowDepthTexture] used in a submit` — WebGPU **device-loss cascade**. Root cause: the `§PERF-NAV-LOD` nav lever dropped shadows during motion by clearing `keyLight.castShadow`; on WebGPU that makes THREE **destroy** the ShadowDepthTexture inside the next `rp.render()` while the prior frame's submit (referencing it) is still in flight → device lost. Rapid mouse motion thrashed the destroy/realloc every few frames. | Camera/Render | BROKEN→FIXED | ADR-0111 `§FIX-SHADOW-MIDSUBMIT-DESTROY` — nav-LOD now **freezes** the shadow map (`shadowMap.autoUpdate=false`, never destroys the texture) via new `RenderPipelineManager.setShadowPassSuppressed()`, with a debounced restore; heavy-tier gate decoupled from the nav gate. C04 / §SHADOW-DEVICE-LOSS-FIX |
| L-26 | founder | **Wall-draw alignment guide** should prefer the PERPENDICULAR (ortho) direction of the draw, not the colinear same-direction extension (which conveys nothing) | Modeling/Creation | BROKEN→FIXED | `§FIX-ALIGN-GUIDE-PERPENDICULAR` — new `WallAlignmentGuide.guideAxisPreference(dx,dz)` suppresses the colinear axis's guide+snap (±22.5° neutral zone keeps both for diagonal draws); `WallTool` passes draw dir; C06/snapping, no ADR |
| L-27 | founder | **Wall T-junction STILL shows an "arrow" spike** — interior partition meeting a wall in a T; L-12's `§FIX-WALL-TJUNCTION-BUTT` (JunctionResolverV2) shipped but is INSUFFICIENT for the real thin-partition case (black wedge in 3D + arrow tip in plan). Re-opened. | Geometry/Walls | BROKEN→FIXED | ADR-0055 `§FIX-WALL-TJUNCTION-BUTT-2` (batch 3). **Real root cause = the ring-sweep PIVOT, not the classification.** L-12 correctly reclassified host→passthrough (guest side-corners butt on the host near face) — but `applyRingSweep` still wrote a centreline PIVOT vertex at the host centreline for the T-attacher and `WallFootprint2D` inserted it BETWEEN the two near-face corners → a triangular tongue from the near face (z=+halfT) DOWN to the host centreline (z=0): the founder's 3D wedge / plan chevron. L-12's `§WALL-BODY-INNER-FACE` suppressed that pivot ONLY when the host was ≥1.5× thicker, so an equal-thickness partition-into-wall T still spiked. Fix: suppress the centreline pivot for EVERY real endpoint abutting a passthrough (a T is not an X), thickness-independent; AND re-point the ring-sweep pivot for every clean 1-real-end T onto the host-centreline foot so a guest ending on the host inner face butts flush (no half-thickness gap). Plan chevron = projection of the fixed 3D footprint (`EdgeProjectorService` has no T-logic) → auto-resolves. Layered/opening walls use the legacy `WallJoinResolver._clampEndToShellInnerFace` which already butt-clamps body-Ts (arrow is V2-footprint-specific). **Cluster sub-case `§FIX-WALL-CLUSTER-DEGENERATE`:** the founder's other repro is an L-corner (two walls co-terminate) that ALSO receives a THIRD wall at the SAME vertex → black triangular spike. Reproduced in a footprint harness: a genuine 3-wall node of FULL-LENGTH walls tiles cleanly (all positive-area, shared pivot); the spike is a DEGENERATE cluster member — a wall shorter than the 0.20 m band whose BOTH endpoints snap to one node, so the ring sweep hinges both ends on one pivot → a bow-tie / negative-area (inverted-normal, area −0.03) footprint that also distorts the L-corner. This stub (0.158 m) clears the legacy 0.15 m length gate and the legacy 0.12 m band never doubles it, so only the V2 path renders it. Fix: detect a wall doubled in a cluster, STRIP it from the sweep (the L-corner walls then render clean) and mark its `WallMiter`/`WallFootprint` `invalid` → `WallFragmentBuilder.buildWall` skips its mesh at the shared `§WJR-INVALID` checkpoint. Genuine N-way full-length nodes unaffected (no false positive). Footprint-level regression tests added (thin-partition T + L-corner-plus-stub cluster: 17 cases green; 114 geometry-wall + 67 V2 tests green). C15/C11. |
| L-28 | founder | **Wall tool needs "Apply" on plan view** — on 3D, `WA` activates the wall tool immediately (can set first point straight away); on PLAN view the "Select Wall Type" panel requires clicking **Apply** before drawing. Should be active-by-default with the default (Plain Wall) pre-applied, matching 3D. Related to L-28-adjacent tool-activation parity. | Modeling/Creation | BROKEN→FIXED | `§FIX-PLAN-WALLTOOL-DEFAULT-ACTIVE` — root cause was **perceptual, not functional**: `WallPlanToolHandler` is armed the instant the tool activates and its `onClick` sets the first point UNCONDITIONALLY, committing with the tool's type (default `undefined` → Plain Wall / thickness 0.2, identical to 3D). No Apply was ever functionally required — but the `showWallPreDraw` panel (`PropertyPanelPreDraw.ts`) title "Select Wall Type" + hint "Choose a type, then click on the canvas to draw" + prominent Apply button made the founder believe an Apply click gated drawing. Fix: panel now (a) **pre-applies** the default type on open via `canonicalWallTool.setSystemTypeId(current ‖ undefined)` so the default is explicitly seeded (idempotent; preserves a mid-session switch), and (b) reframes the copy to "Draw Wall" / "✓ Plain Wall ready — click on canvas to draw. Change type below (optional)." Type dropdown stays apply-on-change for live switching; ESC-cancel, wall-mode, align guide untouched; 3D path unchanged. Test: `apps/editor/__tests__/PlanWallToolDefaultActive.test.ts` (first click arms start point with no Apply / no type; commits Plain Wall thickness 0.2; mid-session switch honoured, never blocks initial draw). C06/C11; no ADR (no tool-activation contract changed). |
| L-29 | founder | **Wall-MOVE preview dimensions (orthogonal to wall vector)** — the wall-DRAW first-point already shows well-defined witness dimensions to the nearest orthogonal walls (great). Want the SAME when a wall is selected on plan and moved: live preview dimensions in the direction **orthogonal** to the wall's direction vector (a wall normally translates perpendicular to itself). | Editing/Move | FIXED | `§FEAT-WALL-MOVE-DIMENSIONS` — new pure `computeWallMoveDimensions` (`packages/core-app-model/src/geometry/wallMoveDimensions.ts`, 14 tests): classifies the moving wall's dominant axis (±22.5° neutral zone, L-26 convention → near-diagonal = no dim), takes the perpendicular, returns the nearest PARALLEL neighbour gap on each side (+/−) that the wall projects onto. `PlanElementDragController._renderWallOverlay` renders them live per drag move via the SAME blue dashed `_drawDimensionLine` the move-delta/hosted-opening dims use; transient overlay (read-only, no store writes P6, no new rAF P3), cleared on drag end/cancel. Descriptor shape kept reusable for L-30. C06/C16, no ADR |
| L-30 | founder | **(follow-up to L-29) Door/Window-MOVE preview dimensions (along wall vector)** — for wall-hosted elements show move dimensions **along** the host wall's vector (hosted elements slide only along the wall). | Editing/Move/Hosting | QUEUED | after L-29 lands; C15/C06 |
| L-31 | founder | **Cross-level REFERENCES (Revit-like, better)** — when drawing walls on an UPPER floor, PRYZM should intelligently offer sound references to the **slab corners** (which are defined by the lower floor's walls) to place the 1st + subsequent points. Also fixes the `SnapBoundsError: SpatialGrid.getCellKeysForBounds total cell count 11039838 exceeds cap` seen when snapping far from origin on L1. | Modeling/Snapping/Refs | FIXED | `§FEAT-SLAB-CORNER-REFS` + `§FIX-SNAP-BOUNDS-OVERFLOW` (ADR-0112). (1) `SlabSnapProvider` extended: emits slab-polygon vertices as ENDPOINT (the corners), edge midpoints as MIDPOINT, edge nearest-points as EDGE; level-gated to the active draw floor via a lazy `getActiveLevelId()` accessor. Wired by default in `SnapManager.createWithDefaults()` — falls back to read-only `window.slabStore` + `window.projectContext.activeLevelId` so WallTool (which forwards only `{gridStore}`) gets the reference untouched; reuses the existing SnapVisualizer indicator + rankCandidates pipeline (composes with L-26 guide/ortho). (2) root cause of the 11039838-cell throw: `SpatialGrid.getCellKeysForBounds` SOLID-FILLED an oversized/degenerate (origin-spanning or geolocated far-from-origin) element AABB, and `insert()` — unlike `query()` — did NOT catch the `SnapBoundsError`, so it propagated out of the wall-draw flow. Fix = degrade oversized fills to the AABB's ≤8 CORNER cells (bounded, snapping stays correct at corners/endpoints, never throws on insert); non-finite bounds still throw and `query()` degrades to `[]`. 3 tests (far-from-origin under cap; slab corners as candidates; draw-point snaps to corner) + level-gate/fallback/EDGE tests. C06/snapping |
| L-32 | founder | **Slab-by-Region PREVIEW mirrored through project origin** — creating a slab via Region: the slab commits in the CORRECT place, but the transient PREVIEW renders far away, mirrored across the project origin (see image). Only slabs. | Modeling/Creation/Slab | BROKEN→FIXED | `§FIX-SLAB-REGION-PREVIEW-MIRROR` (wave 4d) — the By-Region preview built its `THREE.Shape` from world-XZ then rotated `-π/2`, negating Z → mirror through origin; commit path never did. Fix pre-negates Z to cancel the rotation (matches polyline-preview convention). 14/14 tests. C06/C11, no ADR |
| L-33 | founder | **Second parametric kitchen creation fails** — after placing one L-Shape kitchen run, trying to create a SECOND one had an issue (couldn't place / errored). | Modeling/Creation/Kitchen | BROKEN | routed → kitchen-fidelity agent; C11 |
| L-34 | founder | **Kitchen placement PREVIEW is a bounding RECTANGLE, not the real L-shape** — the ghost (plan dashed rect + 3D) must PRECISELY match the real parametric kitchen footprint (L / U / galley / single-wall) in BOTH plan and 3D, not a coarse box. | Modeling/Creation/Kitchen | BROKEN | routed → kitchen-fidelity agent; extends L-21/§FIX-PLACEMENT-PREVIEW; C06/C11 |
| L-35 | founder | **Kitchen 2D PLAN SYMBOL must be professional/elegant/modern** — currently a poor rectangle; needs true cabinet runs + sink/hob/fridge glyphs + cabinet-door-swing arcs + work-triangle, per typical-kitchen-layout drafting convention (single-wall/galley/L/U/island — ref image). Accurate to the actual configured run. | Views/Drawing/Kitchen | BROKEN | routed → kitchen-fidelity agent; relates L-22 symbol style + C06/C18 |
| L-23-RV | founder | **Kitchen Space-rotate re-verify** — founder reports kitchen doesn't rotate on SPACE; `§FIX-PARAMETRIC-SPACE-ROTATE` shipped wave 4c but founder screenshot shows OLD "Press R" copy (pre-fix bundle). Verify live end-to-end for the L-shape kitchen; fix if genuinely broken. | Editing/Rotation/Kitchen | VERIFY | kitchen-fidelity agent verifies; ADR-0107 |
| L-36 | founder | **Shower plumbing fixture faces the WRONG direction** — the wall-mounted shower (riser + rain head + mixer) is oriented incorrectly when placed/hosted (head/arm not facing correctly relative to its wall). | Plumbing/Placement | FIXED | `§FIX-SHOWER-ORIENTATION` (ADR-0114). Root cause: `PlumbingTool` applied `lookAt(point+normal)` (which already aims local +Z along the outward normal) **then** an extra `rotateY(π)` for the shower — driving its +Z front (riser→head→tray→glass, authored at +Z) INTO the wall. Toilet/sink front is at −Z so they need the flip; the shower does not. Fix = drop `'shower'` from the flip, restoring parity with the plan tool (which never flips). Test (a). |
| L-37 | founder | **New composite shower TYPE(s): shower + glass + gutter** — today only a bare shower head/riser exists. Want at least one richer type providing the shower PLUS a base/tray, OR at least a linear GUTTER (channel) drain (ref image 2: rain head + hand-shower + mixer + linear drain), PLUS a side GLASS panel whose direction the user can choose. A parametric walk-in shower enclosure. | Plumbing/Catalogue | FIXED | `§FEAT-SHOWER-ENCLOSURE-TYPE` (ADR-0114). Added composite walk-in built from the existing sub-assembly builders: rain head + hand-shower + round mixer + niche + **linear gutter drain** (metal trough/grate) + low tray + **frameless glass**. User-chosen glass **direction** encoded as the variant slug (`shower_walkin_left`/`_right`/`_corner`) — same type-as-data pattern as sliding/open, no schema change, undoable via `UpdatePlumbingParametersCommand`. Auto-registers in the catalogue/type-picker; 3D + variant-aware plan symbol (gutter line + glass-side line + head glyph, ADR-0110). Tests (b)+(c). |
| L-38 | founder | **URGENT — Site-plan overlay (PDF/image) + Project North / True North.** (1) Upload a PDF/image → it drops onto the floor plan where the user can **move / rotate / scale** it interactively, then **OK** — NO boundary tracing needed; the goal is just a properly located + **geolocated** + scaled underlay. (2) Dual north: the image/PDF defines **PROJECT NORTH** (its orthogonal axis) — PRYZM main **plan view always works on project north** (orthogonal to the underlay); the **3D site / 3D globe works on TRUE NORTH** (the underlay geolocated correctly on the map). | Site/Geo/Views | BROKEN(feature)→PARTIAL | ADR-0115 (wave 4g) `§FEAT-PROJECT-TRUE-NORTH` — dual-north model shipped: pure `projectToTrueNorth`/`trueToProjectNorth` round-trip (rigid rotation about C19 base point, θ=SiteLocation.trueNorth, θ=0 identity), "✓ Use this placement (set Project North)" OK path captures θ via new P6 `dispatchSiteTrueNorth` (no boundary trace), back-compat persistence. **Remaining**: wire the plan-canvas `FloorPlanUnderlayTool` OK→captureUnderlay→dispatch (helpers ready); globe reads θ to rotate massing; durable geolocation schema. 10/10 tests. |
| L-40 | founder | **3D globe / 3D site not reachable from 3D view** — must ALWAYS be available; currently the entry point is missing/disabled | Site/Geo/Views | BROKEN→FIXED | ADR-0115 (wave 4g) — stable `window.pryzmEnterSiteView` registered at boot + always-present floating "◉ 3D Site / Globe" launcher on the 3D viewport + hardened GIS-rail button (activate-then-retry, never dead-ends; enters on default centre with no site). |
| L-41 | founder | **Plan view ignores chosen wall type** — any wall type selected in plan view still commits Plain Wall default | Modeling/Types | BROKEN | routed → plan-wall-type agent (a43d2b7f); C06/C11/§WALL-TYPE-WIRE |
| L-42 | founder | **Navigation not working after project load** — model loads & renders but camera orbit/pan/zoom is dead. Console: `§LOAD-WATCHDOG stuck in "setup" ~16s` (load took 19.6s), runaway `requestAnimationFrame` recursion in the ThatOpen/OBC camera-controls update loop. Likely tied to the load-time render/device state (sibling of L-39/L-25) and/or camera control-lock not cleared. | Camera/Nav/Load | BROKEN | routed → freeze/nav agent (afa0cb87, expanded); C04; sibling of L-39/L-25 |
| L-43 | founder | **Move/rotate for walls in PLAN view doesn't work** — selecting a wall in plan attaches the gizmo (`[WallTransform] gizmo aligned`) but move/rotate has no effect. Applies to walls (check all element transforms in plan). | Editing/Move/Plan | BROKEN | routed → plan-transform agent; C06/C16; distinct from L-42 (camera nav) |
| L-44 | founder | **T-junction with 3 DIFFERENT walls — preview perfect, EXECUTION bad** — the live preview shows a clean junction but the committed geometry is wrong (not the degenerate-stub case L-27 fixed; a real 3-wall T). Log shows `§MULTI-CLUSTER-PARTITION-TRIM ... angled arm 0.004m off → square-cap`. | Geometry/Walls | BROKEN | routed → T-junction-exec agent; ADR-0055; preview-vs-commit divergence |
| L-45 | audit | **Underlay bugs** — (a) `CommandBusError: no handler registered for DELETE_UNDERLAY` (deleting a floor-plan underlay throws); (b) `QuotaExceededError` persisting the underlay to localStorage (raster stored in localStorage exceeds quota). | Site/Underlay | BROKEN | queued (site/underlay lane); register DELETE_UNDERLAY handler + move raster off localStorage; relates ADR-0115 §Remaining |
| L-46 | founder | **Changing wall TYPE changes the wall's LENGTH** — on `UPDATE_WALL_SYSTEM_TYPE` the wall's baseline endpoints are moved (log: `§DIAG-WALL-SPIKE srcLen=1.531m newLen=1.153m dLen=-0.378m preserve=false bMoved=true`; the `§MULTI-CLUSTER-PARTITION-TRIM` square-caps the arm to "consensus"). A type change must only alter thickness/material, NEVER the baseline/length. | Geometry/Walls/Types | BROKEN | routed → L-44 agent (a2f12335, same multi-cluster-trim); ADR-0055; a type-only rebuild must `preserve=true` the baseline (cf reverted §CLAMP-COSHARE-WELD) |
| L-47 | founder | **Creating a wall NEARBY shrinks an UNRELATED, already-joined wall** — two walls cleanly joined in an L; drawing a new wall nearby makes one of the L walls change length. Root = the SAME as L-44/L-46: `WallJoinResolver` re-resolves the cluster on any nearby change and **writes back a moved/trimmed baseline** (`§MULTI-CLUSTER-PARTITION-TRIM` square-cap-to-consensus, `§NEAR-CORNER-L`) onto other walls' stored baselines. **Geometry-integrity violation.** | Geometry/Walls | BROKEN | routed → L-44 agent (a2f12335); UNIFIED root w/ L-44+L-46; ADR-0055; joins must be render/footprint-only, NEVER mutate/persist another wall's baseline (cf reverted §CLAMP-COSHARE-WELD) |
| _next_ | | _append here_ | | | |

---

## §3 Functional-area conformance

### 3.1 Camera & navigation — **NEEDS HARDENING**
- Surface: `packages/renderer/CameraController`, `packages/view-state/ViewController`,
  `packages/stores/CameraPositionService`, `packages/renderer-three/LTPENUCameraService`,
  `runtime-composer/buildCameraControllerSlot`. Constraints armed (`minDist=0.2, maxDist=10000`, polar clamp).
- Issues: **L-02** (heavy-scene orbit slow — shadow-ceiling bypass + instancing + no nav-LOD), **L-05** (WebGL2
  ghost-on-rotate). **L-25** (WebGPU black 3D on rapid wall-create + mouse motion — `ShadowDepthTexture` destroyed
  mid-submit by the `§PERF-NAV-LOD` `castShadow` toggle) **FIXED** via `§FIX-SHADOW-MIDSUBMIT-DESTROY`: the nav lever
  now FREEZES the shadow map (`shadowMap.autoUpdate=false`) instead of clearing `castShadow`, so THREE never destroys
  the texture (no mid-submit destroy); restore is debounced; the heavy-tier drop-the-pass gate is decoupled from the
  transient nav gate. Zoom-fit/zoom-selected handlers exist (`§C-B1`).
- **N/V**: pan/zoom/orbit smoothness on mid projects; camera state persistence per view; frame-on-view-switch.
- Contract: C04 (rendering/scheduling).

### 3.2 Element creation — **MOSTLY OK, one BROKEN**
- Dual-write/bus-bridge paths verified for walls/curtain-walls/doors/windows/slabs/floors/roofs/stairs/columns/
  beams/plumbing/lighting (ADR-0098 §4, prior audit §3). Hardened door/window creation fallback (§DPT/§WPT).
- Issue: **L-09** wall-draw preview stutter (creation *interaction*, not the command).
- Contract: C11, C15.

### 3.3 Element editing — move / rotate / dimensions / materials / hosting — **CORE GAPS**
- **Movement**: wall=`UpdateWallBaselineCommand`, door/window=offset, furniture=params — non-uniform (F8).
  **L-01** host-wall move freeze FIXED (ADR-0099); **L-06** per-move storm amplifier in flight (Q6).
- **Rotation**: **BROKEN/absent** — no `Rotate*Command` (L-07/F5).
  Partial: **placement-time** rotation shipped — Spacebar rotates the live placement preview
  +90° CW (`§FEAT-PLACEMENT-SPACEBAR-ROTATE`, ADR-0107) for one-click placeables (furniture 3D +
  plan, carousel GLB), with the chosen yaw carried through to the committed element. The general
  post-placement first-class Rotate command/gizmo (F5/Q7) remains OPEN.
- **Dimensions**: OK coverage (`UpdateWall/Slab/Door/Window Dimensions/Height/Width/SillHeight`).
- **Materials**: uneven (L-08/F6) — structural/MEP/furnishings have no material command.
- **Hosting**: correct model (C15) — offset + dual-store; the perf failure (L-01) is fixed.
- Contract: C03, C11, C15, C16.

### 3.4 Selection — **BROKEN**
- `findSelectableRoot` walk-up correct; **L-04** gpu-pick chooses wrong candidate under density (Q4 agent).
- `§SELECT-STUCK-STATE-SELFHEAL` exists (escape un-wedges) — a symptom of the edit-storm (L-06), not a fix.
- Contract: C15 §11/§12, C06.

### 3.5 Views — plan / 3D / elevation / section / sheets / **view creation** — **VERIFIED (2 fixes shipped)**
- Commands present: `CreateViewDefinitionCommand`, `UpdateViewDefinitionCommand`, `DeleteViewDefinitionCommand`,
  `CreateViewTemplateCommand`/`Update`/`Delete`, `UpdateViewportScaleCommand`; `DefaultViewsManager` guarantees a
  3D + Ground-Floor plan on every project; split-view plan (Canvas2D) auto-opens; `EdgeProjectorService` +
  `HiddenLineRemoval` + `NativeElementMeshExporter` drive plan projection.
- **Traced end-to-end from the UI (§3.5 verdicts — replaces the N/V cells):**

  | Flow | Verdict | Evidence / fix |
  |---|---|---|
  | **View list / browser** (all types listed, grouped, badges, active pill) | **OK** | `ViewsRailPanel.ts` — `getByType()` per group; `vd:view-*` refresh subscriptions. |
  | **Create new plan / structural-plan view** (form + level picker + validation) | **OK** | `ViewsRailPanel._executeCreateView` → `view.createDefinition` → `CreateViewDefinitionCommand`. Level required + validated. |
  | **Create new 3D / section / elevation / detail / … view** (name form) | **OK** | Same path; `CreateViewDefinitionCommand.canExecute` whitelists all 12 `viewType`s. |
  | **Switch / activate view** (single-click; re-entry guard) | **OK** | `ViewsRailPanel._onActivateView` → `viewController.setActiveViewDefinitionId` + OBC-mode activate. Section/elevation route to Canvas2D `PlanViewManager`. |
  | **Duplicate / delete view** | **OK** | `view.createDefinition` (clone spatial) / `view.deleteDefinition`. |
  | **View range editing** | **OK** | `ViewPropertiesPanel._fireSetViewRange` → `view.setRange` (plugin-view `SetViewRangeHandler`, store-backed, undoable). Read by `EdgeProjectorService.resolveClipRange` (`spatial.viewRange.near/farOffset`). |
  | **View crop editing** | **OK** | `ViewPropertiesPanel._fireSetViewCrop` → `view.setCrop`. Read by `EdgeProjectorService` (`crop.region` / `crop.farClip`). |
  | **Elevation MARK placement** (4-dir click) | **OK** | `ElevationPlanToolHandler` → `elevation.create` → `CreateElevationMarkCommand` (creates elevation ViewDefinition + `elevation-mark` annotation with `linkedViewId`). |
  | **Section MARK placement** (2-click cut line) | **BROKEN → FIXED** | `SectionPlanToolHandler` fired `section.create`, whose bus key is owned by plugin-section-view's **geometry** handler (payload `{ line:{a,b,lookDepth} }`) — the tool's `{ sectionViewId, cutPointA, … }` was rejected at `canExecute` and swallowed by the caller `.catch()`, so **nothing was created**. Fixed **§FIX-SECTION-MARK-CREATE**: new distinct bus key `section.mark.create` (bridge in `initBusHandlers.ts`) → `CreateSectionMarkCommand`; tool repointed. |
  | **Click a placed section / elevation mark → navigate to its view** | **GAP → FIXED** | `PlanViewInteraction._onClick` only *selected* the mark; it never read `parameters.linkedViewId`. Fixed **§FIX-MARK-NAVIGATE**: on hit of a `section-mark`/`elevation-mark`, `_navigateToLinkedView()` activates the linked view (Revit click-to-navigate). |
  | **Viewport scale on a sheet** | **OK (unchanged)** | `UpdateViewportScaleCommand` + `sheet.addViewport` via `ViewsRailPanel` context-menu. |

- **Note (out of G8 lane, flag only):** the *3D* `SectionMarkTool` (plugins/annotations) additionally fires a generic
  `annotation.create` alongside `CreateSectionMarkCommand`, which can leave a redundant generic annotation. Belongs to
  the annotations subsystem (G9) — not touched here.
- The projection cost is the L-06 storm's biggest consumer.
- Contract: C04, C06, C09. Tests: `plugins/annotations/__tests__/section-elevation-mark.test.ts` (6, pins the
  mark-create + `linkedViewId` contract that both fixes depend on).

### 3.6 Annotations & dimensions — **OK (was GAP; fixed §G9-PERSIST 2026-07-02)**
- Commands: `CreateAnnotationCommand`/`UpdateAnnotation`/`DeleteAnnotation` (seen live), `UpdateElementMarkCommand`;
  `AnnotationManager` + `OBCAnnotationAdapter`.
- **OBC verdict — resolved, not a blocker.** The "linear/angle/slope annotations not present in this OBC build —
  skipping" logs are BENIGN: `OBCAnnotationAdapter` is a *secondary* front-end that gracefully no-ops when the OBC
  classes are absent. Every dimension/annotation type has a PRYZM-native tool
  (`plugins/annotations/src/tools/*`) that does NOT depend on OBC. The absent-OBC path was never the primary path.
- **Placing a linear dimension — OK.** UI button (`AnnotationRailPanel` → `toolManager.activateLinearDimAnnotation`)
  and the `D`+`I` shortcut both arm `LinearDimensionAnnotationTool`, whose commit dispatches
  `CreateAnnotationCommand` via `commandManager` into the subsystem `annotationStore` that the render layer reads and
  `ProjectSerializer` persists. Verified end-to-end. String/chained dims OK.
- **Placing a text annotation / tag / other dimension types — was BROKEN, now OK.** ROOT CAUSE found: 13 of 14
  native tools (`TextNote`, `ElementTag`, `Door/Window/Level` tags, `GridBubble`, `Angular/Slope/Radius/Diameter`
  dims, `SpotElevation`, `Keynote`, `RevisionCloud`) built the full `AnnotationElement` but only fired the bus
  telemetry `annotation.create` `{id,viewId,kind}` — which writes a DIFFERENT anchor-keyed Zustand store (per
  `initBusHandlers.ts` §P3.5-AN) and carries no geometry. They never called `commandManager.execute` /
  `annotationStore.add`, so the annotation neither rendered nor persisted. Only `LinearDimensionAnnotationTool`
  (and the mark/scale/north/matchline/datum tools) were wired correctly. **Fix (§G9-PERSIST):** new shared helper
  `plugins/annotations/src/tools/persistAnnotation.ts` dispatches `CreateAnnotationCommand` through
  `window.commandManager` (the same authoritative path LinearDim uses → store write + undo/redo); each of the 13
  tools now calls it before the bus telemetry.
- **Editing / deleting — OK.** `UpdateAnnotationCommand` / `DeleteAnnotationCommand` mutate the subsystem store with
  full undo snapshots; dimension edits route through the shared property panel (`AnnotationManager` §ANN-SEL);
  room-tag drag routes the legacy `UPDATE_ANNOTATION` through `commandManager` (initBusHandlers BUG-ANNO-DRAG fix).
- **Persistence + plan re-projection — OK.** `annotationStore.serialize()`/`deserialize()` are wired both sides of
  `ProjectSerializer`/`ProjectLoader` (`annotations` snapshot slice). Plan re-projection is reactive:
  `AnnotationRenderLayer` subscribes to `store.onChange` and re-reads `getByView(activeViewId)` through the live
  camera matrix each frame.
- **Room-tag auto-populate (`RoomTagAutoPopulator`) — OK.** Idempotent create/refresh/delete of `room-tag`
  annotations via `Create/Update/DeleteAnnotationCommand`; no-op when tags already match (verified live in house/apt
  gen).
- **Tests:** `plugins/annotations/__tests__/persist-annotation.test.ts` (9 cases) covers the helper, the
  create/update/delete + undo lifecycle, view-scoped read (render source), and serialize→deserialize round-trip.
- Contract: C06, C03.

### 3.7 Undo / redo — **OK (verify at scale)**
- History/redo stacks, per-command snapshot scope, remote/PROJECT_LOAD exclusions verified (prior audit §6).
- **N/V**: undo of a wall-move-with-openings after the ADR-0099 changes; undo during the L-06 storm.

### 3.8 Save / load & lifecycle — **BROKEN at scale**
- **L-03**: 30s false-timeout, autosave-during-load serialize (22.7MB), O(N) clear-on-switch, 940 degenerate RBLs
  (Q3 agent, C13/C05). Small projects load fine.
- Contract: C05, C13.

### 3.9 Performance & responsiveness (cross-cutting) — **BROKEN**
- **L-02** heavy nav, **L-06** edit storm, **L-09** preview stutter, **L-03** load. The shadow-ceiling bypass
  (12,737 casters at `shadows=standard`) and instancing gaps are the render-side; the redetect/plan storm is the
  interaction-side. Contract: C04, C10.
- **L-25 FIXED** (`§FIX-SHADOW-MIDSUBMIT-DESTROY`) — the `§PERF-NAV-LOD` shadow lever no longer destroys the
  `ShadowDepthTexture` mid-submit during rapid mouse motion (WebGPU device-loss → black 3D). Nav-LOD now freezes the
  shadow map (`shadowMap.autoUpdate=false`, texture kept alive) via `RenderPipelineManager.setShadowPassSuppressed()`
  with a debounced restore; prevention, not just recovery (ViewportCrashGuard remains the fallback). Honours
  `§SHADOW-DEVICE-LOSS-FIX` (no GPU texture is ever `.destroy()`-ed within the frame it is submitted).

---

## §4 Launch-gate summary (what MUST be green for v1)

| Gate | Requirement | State |
|---|---|---|
| G1 | No freeze on host-wall move (any element count) | F1 shipped; Q6 amplifier in flight |
| G2 | No freeze/fail opening a heavy saved project | Q3 in flight |
| G3 | Smooth camera navigation on a full building | Q2 in flight |
| G4 | Correct click-selection at any density | Q4 in flight |
| G5 | Smooth wall/element draw preview | Q8 in flight |
| G6 | No ghost/trailing on rotate (both backends) | Q5 queued |
| G7 | Move + rotate + material editable for every visible element | Q7 queued (F5/F6) |
| G8 | Create/manage plan+3D+section+elevation views from UI | GREEN — §3.5 verified end-to-end; §FIX-SECTION-MARK-CREATE (section-mark tool no longer no-ops) + §FIX-MARK-NAVIGATE (mark click-to-navigate) shipped |
| G9 | Place/edit annotations + dimensions | GREEN — native path verified; §G9-PERSIST fixed 13 bus-only tools (§3.6) |
| G10 | Undo/redo sound across all of the above | §3.7 verify at scale |

See the companion plan for the phased path to green.
