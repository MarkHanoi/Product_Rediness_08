# Edge Line Flicker Fix — Implementation Plan

**Document:** `20-EDGE-LINE-FLICKER-FIX-IMPLEMENTATION-PLAN.md`  
**Status:** PENDING IMPLEMENTATION  
**Affects:** Walls, Slabs (all types including layered)  
**Does NOT affect:** Curtain Walls, Columns, Beams (use compatible materials — no action needed)  
**Contract references:** `01-BIM-ENGINE-CORE-CONTRACT`, `02-BIM-SPATIAL-PROJECTION-CONTRACT`, `05-BIM-UI-ARCHITECTURE-CONTRACT`

---

## 1. PROBLEM STATEMENT

Wall and slab edge overlays flicker on every frame when viewed in the 3D WebGPU viewport. The flicker manifests:

- During creation of a wall or slab (immediately visible)
- Continuously after creation, even when the camera is static
- Even when edge visibility is toggled "off" via the V/G Governance panel (edges persist)

The error produced on every animation frame:

```
THREE.NodeMaterial: Material "LineMaterial" is not compatible.
```

This is accompanied by a shadow texture corruption warning:

```
Destroyed texture [Texture "ShadowDepthTexture"] used in a submit.
```

---

## 2. ROOT CAUSE ANALYSIS (FULL DIAGNOSIS)

### 2.1 Primary Cause — LineMaterial is incompatible with the WebGPU TSL renderer

`WallEdgeOverlayBuilder.ts` and `SlabFragmentBuilder.ts` both construct edge overlays using:

```
LineSegments2 (three/examples/jsm/lines/LineSegments2)
  + LineMaterial (three/examples/jsm/lines/LineMaterial)
```

`LineMaterial` is a GLSL-based `ShaderMaterial`. It was designed exclusively for the WebGL rendering path. PRYZM runs on the Three.js WebGPU renderer (`three/webgpu`) with a full TSL post-processing pipeline (ScenePass MRT → GTAONode → DenoiseNode → OutlinePass). The WebGPU TSL renderer **cannot compile `LineMaterial`'s GLSL vertex shader into a WebGPU node shader**.

Because no compiled shader is cached, the renderer's `needsRefresh` check returns `true` on every frame, causing the renderer to re-attempt compilation on every frame, fail on every frame, and produce undefined draw output — some frames the lines draw, some frames they are skipped. This is the flicker.

The call path that fires on every frame:

```
RAF loop (ds)
  → render
  → _renderObjectDirect
  → needsRefresh          ← always true — no cached WebGPU shader
  → getMonitor
  → getNodeBuilderState
  → getForRender
  → build                 ← attempts GLSL → TSL compilation, fails
  → "LineMaterial is not compatible"
```

### 2.2 Secondary Cause — WallEdgeVisibilityService type-check is broken

`WallEdgeVisibilityService._apply()` hides edges by checking:

```typescript
obj instanceof THREE.LineSegments && obj.userData?.elementType === 'WallEdges'
```

`LineSegments2` **extends `THREE.Mesh`**, not `THREE.LineSegments`. The `instanceof THREE.LineSegments` check always returns `false` for every edge overlay object in the scene. The traversal finds no matches. The visibility service is silently inert — it can never show or hide any edge overlay. This is why disabling edges in 3D views had no effect.

### 2.3 Tertiary Cause — Z-fighting (depth coplanarity)

Neither `WallEdgeOverlayBuilder.ts` nor `SlabFragmentBuilder.ts` applies any polygon offset, `depthTest` override, or `renderOrder` difference to the edge objects. Edge line vertices are mathematically coplanar with the solid mesh faces they trace — they exist at the exact same depth in the GPU depth buffer. Without a depth bias, the depth test arbitrarily picks between the face and the edge line on each frame, depending on floating-point rounding. This produces a secondary Z-fighting flicker independent of the LineMaterial issue.

### 2.4 Consequential Cause — Shadow texture corruption

When the WebGPU renderer encounters the incompatible material mid-frame, the active command encoder is partially committed. The in-flight shadow depth texture is still referenced in the submit when the encoder completes. WebGPU's validation layer correctly reports this as:

```
Destroyed texture [Texture "ShadowDepthTexture"] used in a submit.
```

The engine then forces a full shadow map rebuild (`[PascalSceneLighting] Shadow flags set on N mesh(es)`), adding extra per-frame GPU overhead on top of the flicker.

### 2.5 Why curtain walls and columns are unaffected

`CurtainWallBuilder` and `ColumnFragmentBuilder` use `THREE.LineSegments` with `THREE.LineBasicMaterial`. The WebGPU TSL renderer provides a built-in TSL fallback for `LineBasicMaterial`. No GLSL is involved. No incompatibility error fires. No flicker.

---

## 3. FILES REQUIRING MODIFICATION

| File | Change Required | Priority |
|---|---|---|
| `src/elements/walls/WallEdgeOverlayBuilder.ts` | Replace `LineSegments2` + `LineMaterial` with `THREE.LineSegments` + `THREE.LineBasicMaterial` + polygon offset | Critical |
| `src/elements/slabs/SlabFragmentBuilder.ts` | Replace `LineSegments2` + `LineMaterial` with `THREE.LineSegments` + `THREE.LineBasicMaterial` + polygon offset | Critical |
| `src/ui/WallEdgeVisibilityService.ts` | Fix type check: `instanceof THREE.LineSegments` → `userData.role === 'edges'` | Critical |
| `src/types/three-addons.d.ts` | Remove or archive `LineMaterial`, `LineSegments2`, `LineSegmentsGeometry` type declarations if no longer used elsewhere | Low |

---

## 4. IMPLEMENTATION STEPS

### Step 1 — Audit all remaining usages of LineMaterial / LineSegments2

Before modifying anything, run a full search to enumerate every file that imports from `three/examples/jsm/lines/`:

```
grep -r "three/examples/jsm/lines" src/ --include="*.ts" -l
```

This will show all files that need to be updated. As of the analysis date, the known files are:
- `src/elements/walls/WallEdgeOverlayBuilder.ts`
- `src/elements/slabs/SlabFragmentBuilder.ts`

Confirm whether any other builders (roofs, beams, furniture, handrails, plumbing) also import from this path. Each one found must also be updated in the same pass.

---

### Step 2 — Modify `WallEdgeOverlayBuilder.ts`

**Remove:**
- `import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'`
- `import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js'`
- `import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js'`

**Replace the edge construction block with:**
- `new THREE.EdgesGeometry(geometry, thresholdAngle)` — same as before
- `new THREE.LineBasicMaterial({ color: colorHex, depthTest: true })` — WebGPU-compatible
- `new THREE.LineSegments(edgesGeo, lineMat)` — extends `THREE.LineSegments`, fixes the visibility service type check

**Add depth offset to prevent Z-fighting:**
- Set `renderOrder = 1` on the `LineSegments` object so it renders after the solid mesh
- Set `material.polygonOffset = true`, `material.polygonOffsetFactor = -1`, `material.polygonOffsetUnits = -1` on the `LineBasicMaterial`

**Preserve `userData` exactly as-is** — the role, elementType, parentId, and id fields are consumed by `WallEdgeVisibilityService`, `VGSceneApplicator`, and the selection system. Do not rename them.

**Remove `userData.isLineMaterial2 = true`** — this flag was used by `VGSceneApplicator` to detect `LineMaterial` objects for lineweight updates. Since `LineBasicMaterial` does not support variable linewidth (hardware caps at 1px), the flag is no longer needed and its presence would be misleading. Verify `VGSceneApplicator` handles the absence of this flag gracefully (it should, since the flag is only tested — no crash if absent).

**Tradeoff accepted:** `THREE.LineBasicMaterial` does not support sub-pixel or multi-pixel line widths (the `linewidth` property is ignored on most WebGL/WebGPU drivers except some mobile platforms). Edge lines will render at 1px. For the 3D viewport, 1px is correct. For documentation views (elevations, plan views, sections), the line weight is controlled separately by the sheet/view rendering subsystem, not by the viewport LineMaterial.

---

### Step 3 — Modify `SlabFragmentBuilder.ts` (method `createSlabMeshWithEdges`)

**Remove:**
- The three `import` lines for `LineMaterial`, `LineSegmentsGeometry`, `LineSegments2`

**Replace the edge construction block** inside `createSlabMeshWithEdges` (lines ~469–492) with:
- `new THREE.EdgesGeometry(geometry, 30)` — same threshold as before
- `new THREE.LineBasicMaterial({ color: 0x555555, depthTest: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 })`
- `new THREE.LineSegments(rawEdgesGeo, lineMat)`
- Set `renderOrder = 1` on the `LineSegments` object

**Preserve `userData` exactly** — `id`, `parentId`, `elementType: 'SlabEdges'`, `role: 'edges'`, `selectable: false`. Remove `isLineMaterial2: true` for the same reason as Step 2.

**Layered slabs:** The fix applies to each layer's edge overlay individually. The `SlabFragmentBuilder.updateSlab()` loop over layers calls `createSlabMeshWithEdges` per layer — the fix in `createSlabMeshWithEdges` automatically covers all layers.

---

### Step 4 — Fix `WallEdgeVisibilityService._apply()`

**Replace:**
```typescript
obj instanceof THREE.LineSegments &&
    obj.userData?.elementType === 'WallEdges'
```

**With:**
```typescript
obj.userData?.role === 'edges' &&
    (obj.userData?.elementType === 'WallEdges' || obj.userData?.elementType === 'SlabEdges')
```

This change:
1. Removes the `instanceof` check that was silently failing for `LineSegments2` (and will also work correctly for the new `THREE.LineSegments` going forward — defensive programming)
2. Extends coverage to `SlabEdges` as well as `WallEdges` — the service name is `WallEdgeVisibilityService` but slabs have the same flickering problem and the same visibility requirement
3. Uses `userData.role === 'edges'` as the primary discriminator — this is the semantic tag stamped by both builders

If a narrower scope is required (walls only, slabs separately), the `elementType` check can be used as the filter and the service can be split into `WallEdgeVisibilityService` and `SlabEdgeVisibilityService` at a later stage. For the immediate fix, a unified check is correct.

---

### Step 5 — Verify VGSceneApplicator handles removed `isLineMaterial2` flag

Search `VGSceneApplicator` for all references to `isLineMaterial2`:

```
grep -n "isLineMaterial2" src/core/presentation/VGSceneApplicator.ts
```

If found, the code path guarded by that flag was updating `LineMaterial.linewidth`. After the migration, `LineBasicMaterial` ignores `linewidth` on hardware that caps at 1px. The correct action is to **remove the `isLineMaterial2` code path entirely** and leave edge objects at their default 1px rendering in the 3D viewport. Document views handle line weight through a separate rendering system.

---

### Step 6 — TypeScript compile check

After all file edits:

```bash
npx tsc --noEmit
```

Zero errors required. The removal of `LineMaterial`, `LineSegmentsGeometry`, `LineSegments2` imports will eliminate any associated type errors. If `three-addons.d.ts` contains module augmentations for these types, they may be removed if no other file still imports them.

---

### Step 7 — Restart workflow and verify

1. Restart the `Start application` workflow
2. Open a project
3. Draw a wall — edge lines must appear immediately with no console error
4. Draw a slab — same verification
5. Open browser console: confirm zero occurrences of `THREE.NodeMaterial: Material "LineMaterial" is not compatible`
6. Confirm zero occurrences of `Destroyed texture [Texture "ShadowDepthTexture"] used in a submit`
7. Toggle V/G edge visibility off — confirm edges disappear
8. Toggle back on — confirm edges reappear
9. Move the camera — confirm no flickering with the camera moving

---

### Step 8 — Regression check for documentation views

Verify that plan views, elevations, and sections still produce correct edge representations. Since those views use a different rendering path (orthographic projection, potentially the `LayoutEngine` / `UnderlayRenderService` for sheet output), the removal of `LineMaterial` from the 3D builder should not affect documentation output. Confirm by generating a sheet that contains wall and slab representations.

---

## 5. WHAT IS NOT CHANGED BY THIS FIX

| System | Impact |
|---|---|
| Command layer (CreateWallCommand, CreateSlabCommand) | None — builder is called from DependencyResolver, not commands |
| Store layer (WallStore, SlabStore) | None — semantic model untouched |
| SemanticGraph | None |
| BimManager / ElementRegistry | None |
| Selection system (SelectionManager) | None — `userData.selectable = false` preserved |
| VG Governance panel (VGGovernancePanel.ts) | Only `VGSceneApplicator` needs `isLineMaterial2` path removal |
| Outline pass (OutlinePass.ts / RenderPipelineManager) | None — outlines are computed separately |
| Shadow system (PascalSceneLighting) | Resolved as a consequence — shadow corruption stops when LineMaterial is removed |
| Documentation / sheet rendering | None — uses a separate rendering path |

---

## 6. WHY THIS APPROACH SATISFIES THE CONTRACTS

### Contract 01 — BIM Engine Core

- Modification is in the **Builder layer only** — `WallEdgeOverlayBuilder` and `SlabFragmentBuilder` are projection-only functions
- No store mutations, no command dispatch, no graph changes
- Builders remain pure projection functions of read-only semantic state
- Idempotency preserved — calling build twice with the same data still produces identical scene graph output

### Contract 02 — BIM Spatial & Projection

- World Y coordinates untouched — elevation resolution via BimManager unchanged
- `userData` fields preserved — `id`, `type`, `levelId`, `version` tracking all intact
- No orphaned geometry — the existing disposal patterns in both builders are unchanged

### Contract 05 — UI Architecture

- `WallEdgeVisibilityService` modification is a pure render-layer concern — no store writes, no command dispatch
- The fix is in `_apply()`, an internal private method — no public interface changes
- CSS / panel architecture is completely unaffected

### Contract 04 — AI Modification Protocol

The modification is classified as:

```
Layer Affected: Builder
Phase: Phase 1 (Current)
Architectural Classification: A (Builder-layer change only)
Risk Level: Low
Semantic Impact: No
Constraint Impact: No
Graph Impact: No
Propagation Impact: No
Undo/Redo Impact: No
Spatial Impact: No
Idempotency Impact: No (idempotency is preserved)
```

---

## 7. LONG-TERM CONSIDERATION — Documentation View Edge Rendering

For documentation purposes (plan views, elevations, sections), edge lines need to represent BIM element outlines with correct architectural line weights (e.g., cut elements at 0.5mm, projection lines at 0.25mm). This requirement is **separate from and independent of** the 3D viewport edge overlay fix described in this document.

The 3D viewport fix (Steps 1–8 above) makes edges visible and stable in the 3D view at 1px.

The documentation line weight requirement should be addressed in the sheet/view rendering pipeline (`LayoutEngine`, `UnderlayRenderService`, `CropRegionFilterService`) using one of:

- **Option A:** CSS/SVG overlay for 2D views — renders edges as SVG strokes with correct line weights, bypassing the WebGL/WebGPU renderer entirely
- **Option B:** Separate orthographic render pass for documentation — uses a clean WebGL renderer (not the WebGPU TSL pipeline) with configurable `LineMaterial` line widths, since that renderer does not use the TSL node pipeline
- **Option C:** After Three.js r183 upgrade — use the TSL `outline()` pass (already in the PRYZM pipeline) with per-object style parameters to generate documentation-quality outlines. The outline pass is screen-space and fully WebGPU-native, eliminating the LineMaterial problem at the source

Option C aligns best with the overall graphics migration plan (`02-GRAPHICS-IMPLEMENTATION-PLAN.md` Phase B).

---

## 8. IMPLEMENTATION ORDER SUMMARY

```
Day 1:
  Step 1 — Audit all LineMaterial imports across src/
  Step 2 — Fix WallEdgeOverlayBuilder.ts (remove LineMaterial, add LineBasicMaterial + polygon offset)
  Step 3 — Fix SlabFragmentBuilder.ts createSlabMeshWithEdges (same replacement)
  Step 4 — Fix WallEdgeVisibilityService._apply() type check
  Step 5 — Audit VGSceneApplicator for isLineMaterial2 and remove dead path

Day 1 (continued):
  Step 6 — tsc --noEmit: zero errors
  Step 7 — Restart + verify: no console errors, no flicker, visibility toggle works
  Step 8 — Regression: documentation views still produce correct output
```

Total estimated effort: **3–5 hours**.

---

## 9. SUCCESS CRITERIA

| Test | Expected Result |
|---|---|
| Draw a wall | No `LineMaterial` error in console. No flicker. Edge lines visible at 1px. |
| Draw a slab | Same as above. |
| Draw multiple walls, create corners | Edges stable on all walls, no shadow texture warning. |
| Toggle V/G edge visibility off | All wall and slab edges disappear. |
| Toggle V/G edge visibility on | All wall and slab edges reappear. |
| Camera movement (orbit/pan/zoom) | No flickering on any wall or slab edge at any camera angle. |
| Generate a sheet with walls and slabs | Documentation line output unchanged. |
| `npx tsc --noEmit` | Zero errors. |
| Browser console (after any wall or slab action) | Zero `LineMaterial` errors. Zero `ShadowDepthTexture` errors. |
