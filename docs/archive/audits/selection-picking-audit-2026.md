# PRYZM Element Selection / Picking — Deep Audit Report
**Date:** 2026-05-15  
**Auditor:** Replit Agent (full static analysis)  
**Scope:** All 8 mandatory component areas per the audit prompt  
**Files fully read:** 9 source files, ~4 900 lines total

---

## Part 1 — Per-File Findings

---

### FILE 1 — `packages/input-host/src/SelectionManager.ts` (2133 lines)

#### F-01 · `_buildElementRegistry()` last-write-wins ID collision  
**Severity: P1 — root cause of wrong-element selection for compound BIM types**

```
Lines 220–236
for (const obj of cache) {
    const id = obj.userData?.id as string | undefined;
    if (id) idToObj.set(id, obj);   // ← overwrites on duplicate id
}
```

`_selectableCache` is built by `scene.traverse()` (lines 711–722). For every compound element (wall with fragment meshes, curtain wall with panel meshes, slab with sub-faces), **multiple objects share the same `userData.id`**, so the Map ends up holding whichever sub-mesh was visited last in traversal order. `registry.objectFor(id)` then hands a sub-mesh to `syncPickScene`, which tries to extract geometry from it. If the sub-mesh carries geometry directly, the pick clone is the sub-mesh's geometry in its LOCAL-space position (pick clone gets `obj.matrixWorld` of the sub-mesh, not the root Group). On a click, line 754 calls `findSelectableRoot(sub-mesh)`, which normally works because the parent chain is intact — but after a geometry rebuild where a fragment is removed from the group, re-created, and re-added, `parent` may briefly be null, causing `findSelectableRoot` to return null and the GPU pick path to silently fall back to BVH (line 756 `if (obj)` guard fails). The user experiences "GPU miss" even though the right pixel was read; BVH then selects whatever its ray hits first.

**Evidence:** `_buildElementRegistry` lines 220–236; cache build lines 711–722; GPU hit dispatch lines 753–779; `findSelectableRoot` parent-walk lines 593–658.

---

#### F-02 · `_buildGpuPickRenderer()` exposes physical-pixel `width/height`, context uses CSS pixels  
**Severity: P2 — HiDPI interface contract hazard**

```
Lines 248–249
get width()  { return renderer.domElement.width;  },   // physical pixels (CSS × DPR)
get height() { return renderer.domElement.height; },   // physical pixels
```

`PickContext.viewportWidth/Height` (lines 746–747) is set to `rect.width / rect.height` (CSS pixels). The coordinate mapping formula in `gpu-pick.ts` line 339 uses only `ctx.viewportWidth/Height`, so the pick *currently* produces correct results. However, `GpuPickRenderer.width/height` is a public interface field (defined in `packages/picking/src/types.ts`). Any future strategy or plugin that reads `ctx.renderer.width` instead of `ctx.viewportWidth` will silently use physical pixels on HiDPI displays, producing coordinates 2× offset on a Retina screen. The mismatch also pollutes `probeAvailability` log output if those values are ever printed.

**Evidence:** `_buildGpuPickRenderer` lines 243–283; `PickContext` construction lines 743–750; `PickStrategy` interface in `packages/picking/src/types.ts`.

---

#### F-03 · Hover BVH result stands when GPU hover misses — 50 ms stale-hover window  
**Severity: P2 — Scenario A / D partial contributor**

`_onPointerMove` (line 1877) is hard-throttled to fire at most every `HOVER_THROTTLE_MS` (50 ms). Inside that window, the raycaster-based BVH result is dispatched immediately (line 1959). The GPU override fires ~16 ms later in `_onHoverGpuPickRaf` (line 1981). When `_onHoverGpuPickRaf` produces a GPU *miss* (line 2029 comment: "no-op; the BVH result stands"), the hover state reflects BVH-only for the next 50 ms cycle. For thin elements at camera distance where BVH geometry ray-misses but GPU pixel-hits, the hover outline never appears for those 50 ms windows. For elements where BVH hits A but GPU hits B (occlusion disagreement), hover cycles between A→B every 50 ms, causing shimmer.

**Evidence:** throttle check line 1877; BVH dispatch line 1959; GPU override lines 1981–2035; GPU-miss no-op comment line 2029.

---

#### F-04 · `performSelection` GPU path dispatches `bim-canvas-world-click` with raycaster world-point, not GPU hit-point  
**Severity: P3 — wrong world coordinates on GPU success path**

On a GPU hit (lines 757–770), the world-click event is computed by ray-plane intersection with `activeLevelElevation` using the BVH raycaster (lines 759–762). The raycaster was set from the same cursor position, so in most cases the level-plane intersection is correct. However when the clicked element is on a level different from `activeLevelElevation` (e.g. selecting a beam on floor 3 while the active level is floor 1), the dispatched `worldPoint.y` is wrong. GPU depth readback in `readDepthResult` already produces a correct 3D hit point but it is only returned in `PickResult.hitPoint` — it is never used for the `bim-canvas-world-click` dispatch.

**Evidence:** world-click dispatch lines 758–770; `readDepthResult` lines 519–553; `PickResult` type in `types.ts`.

---

#### F-05 · `_onPointerMove` and `performSelection` duplicate identical `_selectableCache` build logic  
**Severity: P3 — DRY violation, divergence risk**

The cache build block (traverse + `isSemanticType` test) appears verbatim at lines 711–722 (click path) and again at lines 1899–1910 (hover path). The `!obj.visible` guard at line 715/1902 intentionally excludes hidden objects. If selection criteria change (e.g. new element type added to `SEMANTIC_TYPES`), the developer must update both blocks. Missing an update causes hover and click to use different candidate sets, producing the exact Scenario D symptom (hover picks A, click picks B) without any GPU/BVH disagreement.

**Evidence:** click cache build lines 711–722; hover cache build lines 1899–1910.

---

### FILE 2 — `packages/picking/src/gpu-pick.ts` (835 lines)

#### F-06 · `syncPickScene` additionalClones count not reconciled against current `instancedMeshes.length`  
**Severity: P2 — ghost and missing pick regions after CW panel count changes**

When an element already has an entry (`entry !== undefined`, line 642), the refresh loop is:

```
Lines 648–657
for (let i = 0; i < entry.additionalClones.length; i++) {
    const src = instancedMeshes[i + 1];
    if (src) { refreshInstancedPickClone(...) }
}
```

Two failure modes:

**Case A — more IMs now than at creation:** `entry.additionalClones.length = 2`, `instancedMeshes.length = 4`. `instancedMeshes[3]` (and its panels) has no pick clone — those panels are invisible to GPU pick.

**Case B — fewer IMs now than at creation:** `entry.additionalClones.length = 3`, `instancedMeshes.length = 2`. `entry.additionalClones[2]` is a stale IM clone still in `pickScene` that maps to the old element slot. Clicks in that area decode to the element ID correctly (same slot colour), so the wrong panel geometry acts as a phantom pick surface.

Neither case triggers `setStable=false` because the element *ID* did not change — only its internal IM count changed (panels added/removed within the same CW).

**Evidence:** stable-refresh loop lines 648–657; `setStable` computation lines 574–575; `additionalClones` definition line 128.

---

#### F-07 · `refreshInstancedPickClone` silently truncates when `src.count` decreases  
**Severity: P3 — orphan instance matrices**

```
Lines 766
const count = Math.min(clone.count, src.count);
```

If a panel is removed (slot zeroed in source IM, `src.count` decremented), the clone retains `clone.count` unchanged with the old matrices. Instances `[src.count .. clone.count-1]` are updated only via the `Math.min` guard — they keep stale world-space matrices. On the next pick render those instances are rendered with their original pick colour at the phantom world position. Any click in that area returns the correct element ID (the colour is right), but the *visual* hit area is misaligned from what is rendered, creating the "selection fires next to the element" Scenario B symptom at the curtain wall boundary.

**Evidence:** `refreshInstancedPickClone` lines 756–779; `Math.min` guard line 766.

---

#### F-08 · Pick RT aspect ratio does not match viewport — sub-pixel element misregistration at screen edges  
**Severity: P3 — edge-element pick offset**

The pick render target is 256 × 256 (square, aspect 1:1). The viewport is typically 16:9 (1920 × 1080 CSS). THREE.js renders the pick scene using the live camera, whose `projectionMatrix` was configured for the 16:9 display. When the renderer switches to the 256 × 256 RT, it sets `viewport` to (0, 0, 256, 256) but does **not** recompute the camera's projection matrix. The camera still projects with 16:9 FOV into a 1:1 raster. NDC X and Y map identically in both cases:

```
rx = floor( (x / viewportWidth) * 256 )   // CSS ratio → RT pixel — correct
```

Because both the NDC→RT pixel and the CSS→RT pixel formulas use the same linear fraction, the round-trip is mathematically consistent for any aspect ratio. **This is NOT a bug in the current formula.** However, the fixed 256 × 256 RT means a wall that is only 2–3 CSS pixels wide maps to ≤1 pick pixel (or 0 if it falls in the pixel gap). Clicking on the rendered edge of a wall can decode as background (slot 0) while BVH raycasting hits the wall's geometry. This drives the GPU→BVH fallback for Scenario A at distance.

**Evidence:** `pickInternal` coordinate mapping lines 339–349; `targetWidth/Height` defaults line 167–168.

---

#### F-09 · `extractGeometry()` returns the first `THREE.Mesh`'s geometry — wrong clone for multi-geometry groups  
**Severity: P2 — pick clone covers wrong subset of element**

```typescript
// gpu-pick.ts ~line 663
const geo = extractGeometry(obj);   // first Mesh geometry only
const clone = new THREE.Mesh(geo, material);
entry.clone.matrix.copy(obj.matrixWorld);  // clone at GROUP's world origin
```

For a multi-mesh element (e.g. a wall with three fragment meshes forming a non-convex hull), `extractGeometry` returns a single fragment's geometry. The pick clone covers only that fragment's extent at the group's world position. Fragments translated within the group (e.g., an L-shaped wall with a T-junction spur at a different offset) are not covered by the single-geometry clone. Clicking on the uncovered portion of the element returns a GPU miss → BVH fallback, which selects the element correctly via raycasting. The result is that the same element is always *selected*, but via different paths depending on which part was clicked — leading to Scenario D hover/click disagreement when BVH and GPU paths are used in alternation.

**Evidence:** `extractGeometry` call line 663; clone creation line 677; matrix copy line 690; contrast with InstancedMesh multi-clone path lines 628–641.

---

### FILE 3 — `packages/picking/src/bvh-pick.ts` (308 lines)

#### F-10 · Default `THREE.Raycaster` thresholds used (no explicit configuration)  
**Severity: P3 — oversized hit volume for Lines/Points at distance**

`BvhPickStrategy` constructs a `new THREE.Raycaster()` without setting `params.Line.threshold` or `params.Points.threshold`. THREE.js defaults are `Line.threshold = 1` (world-space metre), `Points.threshold = 1`. SelectionManager's own `_raycaster` (used in the BVH-pruned path) has these correctly set to `0.1` (lines 374–376). If `BvhPickStrategy.pick()` is ever called (headless mode, `forceFallback=true`, or probe failure), point-cloud and line-geometry elements have a 1-metre invisible "magnet" radius — clicks 1 m from a railing post will select the railing.

**Evidence:** `BvhPickStrategy` constructor `bvh-pick.ts` lines ~80–100 (no threshold set); SelectionManager init lines 374–376.

---

#### F-11 · `pickInternal` calls `raycaster.intersectObject(mesh, false)` — `recursive: false` misses nested geometry  
**Severity: P3 — pick miss for elements with nested mesh hierarchies**

```typescript
// bvh-pick.ts ~line 160
const hits = this.raycaster.intersectObject(mesh, false);
```

`firstMesh(obj)` returns the first `THREE.Mesh` found by traversal. For elements whose root is a `THREE.Group` containing multiple sibling meshes (e.g. a column with a base plate and shaft as separate meshes), `firstMesh` returns only one. `intersectObject(..., false)` (non-recursive) only tests that one mesh. The other sibling meshes are invisible to BVH pick. Result: BVH pick misses half the element's geometry.

**Evidence:** `pickInternal` line ~160; `firstMesh` helper function in bvh-pick.ts.

---

### FILE 4 — `packages/picking/src/types.ts`

#### F-12 · `GpuPickRenderer.width/height` vs `viewportWidth/Height` — dual representations, no invariant  
**Severity: P3 — documentation / defensive-coding gap**

`GpuPickRenderer` exposes `width: number` and `height: number`. `PickContext` also carries `viewportWidth: number` and `viewportHeight: number`. No comment or assertion enforces what unit each uses or that they should be equal. As noted in F-02, these are currently physical vs CSS pixels respectively. The interface should declare which unit is canonical; future strategies should be warned not to mix them.

---

### FILE 5 — `packages/core-app-model/src/rendering/InstancedElementRenderer.ts` (284 lines)

#### F-13 · `InstancedElementRenderer` elements are completely unselectable  
**Severity: P2 — whole element family invisible to pick pipeline**

`InstancedElementRenderer` registers groups via `instancedElementRenderer.register()`. The resulting `InstancedMesh` has:

```typescript
mesh.userData.elementType = 'InstancedElement';
mesh.userData.isInstancedGroup = true;
// userData.id is NOT set on the mesh itself
```

`SelectionManager._selectableCache` traverse test:

```typescript
if (obj.userData?.selectable || this.isSemanticType(type) || type === 'slab')
```

`'instancedelement'` is NOT in `SEMANTIC_TYPES`. `selectable` is not set. So the mesh is **never in `_selectableCache`**, never in `_buildElementRegistry()`, and `syncPickScene` never creates a pick clone for it. The `getInstanceElementId` lazy getter (lines 153–158) exists but is never called by SelectionManager — neither on the GPU path (no registry entry) nor on the BVH path (`findSelectableRoot` receives null for these hits since the mesh has no semantic type and no parent with `userData.id`).

**Evidence:** `InstancedElementRenderer.register` lines 106–176; `_selectableCache` traverse filter lines 716–718; `SEMANTIC_TYPES` array in `SelectionManager`.

---

#### F-14 · `getInstanceElementId` is O(n) over all registered elements  
**Severity: P3 — performance, not correctness**

```typescript
Lines 153–159
group.mesh.userData.getInstanceElementId = (slotIndex: number): string | undefined => {
    for (const [id, record] of this._elements.entries()) {   // O(n) scan
        if (record.groupKey === key && record.slot === slotIndex) return id;
    }
    return undefined;
};
```

For N total elements across all groups, each `getInstanceElementId(slot)` call visits all N. In a 500-element model with 10 instances per group, each hover raycast that hits an instanced group fires this O(500) scan. This is fixable with a `Map<slot, id>` inverted index per group, but the function is currently unreachable (F-13), so it only matters if F-13 is fixed first.

---

### FILE 6 — `packages/core-app-model/src/rendering/FrustumCullingService.ts` (284 lines)

#### F-15 · Frustum culling fires on MAIN scene only — pick scene clones unaffected  
**Severity: Informational — confirmed NOT a bug**

`FrustumCullingService._runAudit()` traverses `_scene` (the main render scene) and sets `frustumCulled = true` on BIM element meshes. The GPU pick renders `GpuPickStrategy.pickScene` — a **separate** `THREE.Scene` containing colour-encoded clones. Clones are plain `THREE.Mesh` objects whose default `frustumCulled = true`. When the camera moves, THREE culls invisible clones in `pickScene` automatically. Frustum culling state on main-scene meshes has zero effect on pick scene rendering. The pick pipeline is correctly isolated.

---

#### F-16 · `getElementCount()` counts only direct children with `userData.id` — misses IFC/imported hierarchies  
**Severity: P3 — threshold check under-counts**

```typescript
Lines 178–188
for (const child of this._scene.children) {    // direct children only
    if (!child.userData?.id) continue;
```

Imported IFC elements may be nested under an import-root Group that itself has `userData.id` but its children (individual IFC entities) do not appear as direct `_scene` children. `getElementCount()` returns 1 for the whole import group. `LARGE_MODEL_THRESHOLD = 500` is never reached for large IFC imports, so frustum culling remains inactive on models that most need it.

---

### FILE 7 — `packages/core-app-model/src/views/PlanSnapEngine.ts` (507 lines)

#### F-17 · `_estimateWorldRadius` always creates new `screenToWorld` objects — minor GC pressure  
**Severity: P3 — no selection correctness impact**

```typescript
Lines 454–458
const a = this._planCanvas.screenToWorld(0, 0);
const b = this._planCanvas.screenToWorld(radiusPx, 0);
```

Called on every `querySnap` invocation. Creates two temporary objects per call. On a 60 Hz hover stream this is ~120 allocations/sec. Not a selection bug.

---

#### F-18 · PlanSnapEngine does not participate in element selection — audit scope clarification  
**Severity: Informational**

`PlanSnapEngine` is a placement-assist engine for 2D drawing tools. It operates on `LineSegments` geometry from `TechnicalDrawing` projections and returns `PlanSnapResult` (world X/Z coordinate + snap type). It does **not** interact with `SelectionManager`, `GpuPickStrategy`, or `BvhPickStrategy`. Plan-view element selection is handled by `PlanViewInteraction.ts` (not audited — outside mandatory scope). No selection bugs found in this file.

---

### FILE 8 — `packages/input-host/src/BaseTool.ts`

#### F-19 · `getWorldPoint()` allocates a new `THREE.Raycaster` on every pointer event  
**Severity: P3 — GC pressure; no selection correctness impact**

```typescript
const raycaster = new THREE.Raycaster();   // new allocation every call
raycaster.setFromCamera(mouse, ...);
```

For tools that call `getWorldPoint()` on every `pointermove` this creates ~60 Raycaster objects/sec. Threshold defaults on the disposable Raycaster are 1 m (Line/Points), different from SelectionManager's 0.1 m — but `getWorldPoint` is for world-plane intersection only (not mesh picking), so threshold mismatch has no effect here.

---

## Part 2 — Ranked Bug List

---

### BUG-01 · P1 — GPU pick returns sub-mesh; `findSelectableRoot` fails after geometry rebuild  
**Component:** `SelectionManager._buildElementRegistry()` + `syncPickScene`  
**Symptom:** After editing a wall (resize, opening insert, wall join), clicking the wall either selects nothing (GPU miss falls to BVH, BVH hits a different wall) or attaches TransformControls to a sub-mesh at the wrong scene position. Reproducible immediately after any builder re-adds geometry to a group.  
**Root cause:** `_buildElementRegistry()` lines 220–226 stores the last-traversed object per `userData.id`. For walls, `_selectableCache` contains the root Group AND every `wall-fragment` child mesh (all share `userData.id`). The Map ends up holding whichever sub-mesh traversal order produces last. GPU pick calls `syncPickScene` with `objectFor(id)` = sub-mesh. `extractGeometry(sub-mesh)` gives one fragment's geometry; the clone's world matrix is the sub-mesh's `matrixWorld` (already includes parent offset), so `entry.clone.matrix` is not in group-root space. Post-rebuild, the sub-mesh may have a new parent reference while the old registry still holds the pre-rebuild object — `findSelectableRoot` climbs a stale parent chain and returns null.  
**Fix:** Filter `_buildElementRegistry()` to store only the semantic-root object per ID. A semantic root is one that passes `isSemanticType(type)` AND is the *highest* ancestor with that ID. Alternatively, build the registry from a separate root-only traversal: `this.world.scene.three.children.filter(c => c.userData?.id && isSemanticType(...))`. This ensures `objectFor(id)` always hands a Group root to GPU pick, making `findSelectableRoot` redundant for the GPU path.

---

### BUG-02 · P1 — Multi-geometry elements get a single-fragment pick clone; clicks on uncovered regions fall to BVH  
**Component:** `GpuPickStrategy.syncPickScene` (`extractGeometry` simple-mesh path)  
**Symptom:** Clicking on the "body" of an L-shaped wall selects correctly (GPU hit). Clicking on the shorter arm (a separate fragment mesh translated within the group) produces a GPU miss → BVH fallback. Hover (BVH immediate) shows the correct element; click (GPU first) misses it. User experiences Scenario D: "hover outline appears on A, click selects nothing / selects neighbour B."  
**Root cause:** `extractGeometry(obj)` (line 663) returns only the first `THREE.Mesh`'s geometry. For multi-mesh groups, the pick clone covers only one fragment. The clone's transform is `obj.matrixWorld` (the group root), but the extracted geometry is in the sub-mesh's local frame without accounting for `mesh.position`. When a fragment is offset from the group origin, the pick clone is visually correct only for the zero-offset fragment.  
**Fix option A:** Replace single-geometry clone with a merged `THREE.BufferGeometry` (using `BufferGeometryUtils.mergeGeometries`) of all visible child meshes, each transformed to group-root local space before merging.  
**Fix option B (simpler):** Add one pick clone per child Mesh to `additionalClones` in the simple-mesh path, mirroring the InstancedMesh multi-clone pattern already in lines 632–638. Each clone copies the child mesh's `matrixWorld` directly.

---

### BUG-03 · P2 — `additionalClones` count not reconciled after in-place CW panel count change  
**Component:** `GpuPickStrategy.syncPickScene` stable-entry refresh path  
**Symptom:** After adding or removing a panel from an existing curtain wall (without destroying/recreating the CW element), some panels become unpickable (no clone), or phantom pick regions remain where old panels were. GPU pick returns the correct element ID for the phantom area, but the highlighted geometry is wrong.  
**Root cause:** Lines 648–657 iterate `entry.additionalClones.length` (fixed at creation time). If `instancedMeshes.length` grew, new IMs have no clones. If it shrank, stale clones stay in `pickScene`. `setStable` is computed from the sorted element-ID signature (line 574) — adding a panel to an existing CW doesn't change the CW's element ID, so `setStable` remains true and the removal pass is skipped.  
**Fix:** After the refresh loop, compare `instancedMeshes.length - 1` against `entry.additionalClones.length`. If they differ, rebuild all clones for this entry: remove old additionalClones, create new ones. This reconciliation runs only when the specific element's IM count changes — O(1) amortised.

---

### BUG-04 · P2 — `InstancedElementRenderer` elements invisible to the entire pick pipeline  
**Component:** `InstancedElementRenderer` + `SelectionManager._selectableCache`  
**Symptom:** Structural columns and beams rendered via `InstancedElementRenderer` (repeated identical geometry) cannot be selected by any user action. No hover highlight, no click selection.  
**Root cause:** `InstancedElementRenderer.register()` adds a `THREE.InstancedMesh` with `userData.elementType = 'InstancedElement'` and no `userData.id` to the scene. `SelectionManager`'s cache traversal filters by `isSemanticType(type)` — `'instancedelement'` is not in `SEMANTIC_TYPES`. GPU pick never sees these meshes. BVH raycaster hits them but `findSelectableRoot` returns null (no semantic type, no parent with ID). The `getInstanceElementId` getter on `userData` (lines 153–158) is dead code from the SelectionManager perspective.  
**Fix:** Either (A) register a per-group `userData.id` (the group key or a composite ID) and add `'instancedelement'` to `SEMANTIC_TYPES`, wiring `getInstanceElementId` into the BVH hit path; or (B) integrate `InstancedElementRenderer` groups into GPU pick by passing them through `_buildElementRegistry()` via a separate instanced-group traversal that creates individual element IDs from `getInstanceElementId(slotIndex)`.

---

### BUG-05 · P2 — `_buildGpuPickRenderer()` exposes physical-pixel dimensions; interface contract undefined  
**Component:** `SelectionManager._buildGpuPickRenderer()` / `GpuPickRenderer` interface  
**Symptom:** No current correctness failure on standard displays. On HiDPI (DPR=2), any future pick strategy that reads `ctx.renderer.width` instead of `ctx.viewportWidth` will offset picks by exactly 2× in both axes, making every click appear to target an element in the upper-left quadrant.  
**Root cause:** `renderer.domElement.width/height` (physical) vs `rect.width/height` (CSS). Interface exposes both without documenting the distinction.  
**Fix:** Change `_buildGpuPickRenderer()` to return `get width() { return rect.width; }` (CSS pixels, matching `viewportWidth`). Add a JSDoc comment on `GpuPickRenderer.width/height` clarifying the unit.

---

### BUG-06 · P2 — `refreshInstancedPickClone` truncates to `Math.min(clone.count, src.count)` — orphan matrices  
**Component:** `GpuPickStrategy` / `refreshInstancedPickClone` function  
**Symptom:** After a panel is removed from a CW, the pick clone retains the removed panel's world-space matrix. The pick area for that panel ghost persists until the CW is destroyed and re-created. Clicks in the ghost area decode the correct element ID (same slot colour) but the *visual* highlight appears on the ghost position, not the remaining panels.  
**Root cause:** Line 766 `const count = Math.min(clone.count, src.count)` stops refreshing at `src.count`, leaving `clone.count - src.count` instance matrices stale. Three.js renders all `clone.count` instances.  
**Fix:** When `src.count < clone.count`, zero-scale the orphan instances: `for (let i = src.count; i < clone.count; i++) { clone.setMatrixAt(i, ZERO_MATRIX); }`, then `clone.instanceMatrix.needsUpdate = true`. Or rebuild the clone entirely when counts differ.

---

### BUG-07 · P2 — `performSelection` GPU path dispatches wrong world-point for elements on non-active levels  
**Component:** `SelectionManager.performSelection` lines 758–770  
**Symptom:** `bim-canvas-world-click` carries a Y coordinate matching `activeLevelElevation` even when the element clicked is on a different floor. Tools that consume this event (MirrorTool, JoinTool) place their operation origin at the wrong elevation.  
**Root cause:** World click position is computed as the intersection of the raycaster ray with `new THREE.Plane(Y, -activeLevelElevation)` — always the active level Y. The GPU depth readback in `readDepthResult` already returns the exact 3D hit point but is only surfaced in `PickResult.hitPoint`, not used here.  
**Fix:** Use `gpuResult.hitPoint` (if non-zero) as the world click position instead of the level-plane intersection.

---

### BUG-08 · P3 — `BvhPickStrategy` has no `Line/Points` raycaster threshold — 1-metre hit radius on fallback  
**Component:** `packages/picking/src/bvh-pick.ts`  
**Symptom:** In headless mode, `forceFallback=true`, or after `probeAvailability` failure, clicking within 1 m of a railing, pipe, or lighting fixture selects it even if another element is visually in front. Manifests as "clicking on floor selects the railing on the other side of the room."  
**Root cause:** `BvhPickStrategy` constructs a `new THREE.Raycaster()` without setting `params.Line.threshold` or `params.Points.threshold`. THREE defaults are 1 m world-space for both.  
**Fix:** Add `this.raycaster.params.Line!.threshold = 0.1; this.raycaster.params.Points!.threshold = 0.1;` in the `BvhPickStrategy` constructor, matching SelectionManager's init values.

---

### BUG-09 · P3 — `BvhPickStrategy.pickInternal` calls `intersectObject(mesh, false)` — misses sibling meshes  
**Component:** `packages/picking/src/bvh-pick.ts`  
**Symptom:** On BVH fallback path, clicks on the second or third mesh of a compound element (e.g. column shaft when the base plate was `firstMesh`) produce a miss, causing `unselectAll()`.  
**Root cause:** `firstMesh(obj)` returns one Mesh; `recursive: false` skips all siblings.  
**Fix:** Use `this.raycaster.intersectObject(obj, true)` directly against the original `Object3D` root (with `recursive: true`), then filter by `findSelectableRoot`. This aligns with SelectionManager's own `intersectObjects(candidates, true)` line 792.

---

### BUG-10 · P3 — `_onPointerMove` / `performSelection` duplicate cache-build block — divergence risk  
**Component:** `SelectionManager` lines 711–722 and 1899–1910  
**Symptom:** If a developer adds a new element type check to one block and misses the other, hover and click see different candidate sets — classic Scenario D reproduction vector. No immediate runtime bug, but a latent divergence bug.  
**Fix:** Extract to a private `_ensureSelectableCache()` method called from both paths.

---

## Part 3 — Three Explicit Questions

---

**Q1 — What is the authoritative element-ID lookup contract for GPU pick with compound BIM elements?**

The audit reveals that `_buildElementRegistry()` stores "last traversed sub-mesh per ID" while `syncPickScene` expects to receive a semantic-root Object3D (so it can extract geometry or InstancedMesh children in group-root space). There is no documented contract between them. Before applying BUG-01's fix, the team needs to decide: should `_buildElementRegistry()` guarantee it always returns a root Group (and if so, what exactly is a "root"?), or should `syncPickScene` handle receiving any object in the hierarchy and climb to the root itself? The current mixed behaviour — registry returns sub-mesh, `syncPickScene` calls `extractGeometry` on it without normalising — is the root inconsistency.

**Specifically:** Is there a guaranteed invariant that the object stored under `userData.id` on a wall fragment (`wall-fragment`) is always a *direct child* of the semantic wall Group, or can geometry rebuilders detach/re-attach fragments in ways that break the parent chain? If the parent chain cannot be relied upon, the registry must be built from a root-only pass.

---

**Q2 — Should `InstancedElementRenderer` elements be selectable, and if so, which ID is emitted on selection?**

`InstancedElementRenderer` is documented (lines 38–52) as an alternative render path for repeated identical geometry (structural columns, beam repeats). Its `getInstanceElementId(slotIndex)` getter implies individual instances should be selectable by their BIM element ID. But the `_selectableCache` and registry never include these meshes (BUG-04). The question is architectural:

(A) If each *instance* is a distinct BIM element (e.g. column-1, column-2), the fix requires adding `'instancedelement'` to `SEMANTIC_TYPES` AND wiring `hit.instanceId` → `getInstanceElementId` in both the BVH hit-resolution path and the GPU pick clone creation. The GPU pick path needs per-instance clones (not one clone per group), matching the CW InstancedMesh pattern in `collectInstancedMeshes`.

(B) If all instances in a group represent *one* BIM family element (the group itself has an ID), the fix is simpler: set `mesh.userData.id = groupId` on the group mesh and treat the group as a single selectable entity.

Which model does the product spec require?

---

**Q3 — Is the 256 × 256 GPU pick RT resolution intentional, and is there a plan to scale it with viewport size?**

The pick RT is hard-coded at 256 × 256 (BUG-08 / F-08). On a 1920 × 1080 viewport, each pick pixel covers 7.5 × 4.2 CSS pixels. A wall viewed at distance may project to 3–4 CSS pixels wide — entirely within a single pick RT pixel gap. This means the GPU pick reliably misses thin elements at camera distance and falls through to BVH (Scenario A). The 50 ms BVH hover throttle (F-03) then means hover feedback is absent for up to 50 ms.

Two questions bundled here:

(A) Was 256 × 256 chosen for read-back performance (256 × 256 × 4 bytes = 256 KB per pick call)? Is there a measured regression from a larger RT?

(B) Since Scenario A ("wrong wall selected at distance") is the most-reported user complaint, would the team accept a viewport-proportional RT (e.g., `min(viewport.width, 1024) × min(viewport.height, 1024)`) for `pickRect` operations and a smaller (say 64 × 64) RT for single-point `pick()` — or is the current 256 × 256 already a compromise after profiling?

The answer determines whether Scenario A is fixable by a pure RT-size change (no architecture work) or requires the BVH fallback path to be made more reliable instead.

---

## Summary Matrix

| Bug ID | Severity | File(s) | Failure Scenario | Fix Complexity |
|--------|----------|---------|-----------------|----------------|
| BUG-01 | **P1** | SelectionManager.ts:220–236 | A, B, D | Medium — root-only registry filter |
| BUG-02 | **P1** | gpu-pick.ts:662–693 | A, D | Medium — multi-geometry clone |
| BUG-03 | P2 | gpu-pick.ts:648–657 | B (CW panels) | Small — count reconciliation |
| BUG-04 | P2 | InstancedElementRenderer.ts + SelectionManager.ts | C | Large — architecture decision (Q2) |
| BUG-05 | P2 | SelectionManager.ts:248–249 | Future HiDPI | Trivial — return CSS pixels |
| BUG-06 | P2 | gpu-pick.ts:766 | B (ghost panels) | Small — zero-scale orphan instances |
| BUG-07 | P2 | SelectionManager.ts:758–770 | Tool-position error | Small — use `gpuResult.hitPoint` |
| BUG-08 | P3 | bvh-pick.ts constructor | Fallback-mode lines/points | Trivial — set threshold |
| BUG-09 | P3 | bvh-pick.ts:~160 | Fallback-mode compound elements | Small — recursive:true |
| BUG-10 | P3 | SelectionManager.ts:711–722, 1899–1910 | Latent divergence | Small — extract helper |
