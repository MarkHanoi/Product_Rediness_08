# PRYZM BIM — 3D Scene Accuracy & Selection System  
# Implementation Plan

**Document type:** Implementation Plan (cross-referenced against Audit)  
**Based on:** `AUDIT-3D-SCENE-ACCURACY-SELECTION.md` + deep code review of actual `apps/editor/` and related packages  
**Review date:** 2026-05-15  
**Primary author:** Architectural audit + live code inspection  
**Scope:** Selection pipeline · GPU pick path · Viewport/resize · Coordinate accuracy · Semantic root resolution · Hover system · Architecture debt

---

## 0 · How to Read this Document

The [Audit document](./AUDIT-3D-SCENE-ACCURACY-SELECTION.md) was written before a deep read of the actual production code.  
This Implementation Plan **supersedes** the audit on every point where the live code contradicts the earlier finding. Each section explicitly states the correction.

**Finding IDs** are kept stable for cross-referencing. Revised findings are marked **[REVISED]**.  
New findings discovered during deep review are marked **[NEW]**.

**Severity scale (unchanged from audit):**
| Level | Definition |
|---|---|
| **CRITICAL** | Silent wrong data, data-loss, or crash in production |
| **HIGH** | Reproducible functional error visible to users |
| **MEDIUM** | Latent correctness hazard or significant performance defect |
| **LOW** | Architecture debt, type-safety gap, polish |

---

## 1 · Ground-Truth Production Selection Path

The Audit document described the production path as flowing through `plugins/selection/src/tool.ts → SelectionCommandBus`. **This is incorrect.**

### 1.1 Actual production path (confirmed by code inspection)

```
Browser click event (left button only)
  └─ SelectionManager.domElement.addEventListener('click', …)
       packages/input-host/src/SelectionManager.ts:461
            └─ SelectionManager.performSelection(event)   :639
                  ├─ [guard] window.isCameraDragging → return
                  ├─ getBoundingClientRect()              LIVE dimensions ✓
                  ├─ _mouse.set(NDC)
                  ├─ _raycaster.setFromCamera(camera.three)
                  ├─ [if _pickStrategy set]
                  │    └─ _pickStrategy.pick(point, livePickCtx)   GPU path
                  │         ├─ hit → findSelectableRoot(obj) → select()
                  │         └─ miss → fall through to BVH
                  ├─ _bvhPruneCandidates(_selectableCache)   BVH O(log n)
                  ├─ _raycaster.intersectObjects(candidates, true)
                  ├─ bim-canvas-world-click dispatch
                  ├─ findSelectableRoot(bestHit.object)
                  └─ select(resolvedRoot) / unselectAll()

Touch fallback (pointerType !== 'mouse'):
  └─ pointerup → performSelection(e)  (only for non-mouse input)   :539

Double-click (slab profile edit):
  └─ dblclick → direct scene.children scan → SlabTool.enterProfileEditMode()
```

### 1.2 What `plugins/selection/src/tool.ts` actually is

`SelectionTool` in the plugin SDK is **a future/plugin-API stub** — a contract surface for third-party plugins. It is **not wired** into the production editor bootstrap (`initTools.ts` creates `SelectionManager` directly and never instantiates `SelectionTool`).

**Implication:** Audit findings CRITICAL-1, HIGH-1, and MEDIUM-1 that reference `plugins/selection/src/tool.ts` describe bugs in the **plugin SDK stub only** — they are not daily-use regressions in the production editor. The fix priority for those findings is reduced accordingly.

---

## 2 · Revised & New Finding Inventory

### 2.1 Production-path findings (highest priority)

---

#### F-NEW · Stale `matrixWorld` in GPU pick scene after batch element creation  
**[CRITICAL — discovered from live log analysis, 2026-05-15]  
**Status: ✅ APPLIED** — `gpu-pick.ts` line 531/569, `SelectionManager.ts` pre-pick calls**

**Severity:** CRITICAL  
**Files:** `packages/picking/src/gpu-pick.ts:531,569` · `packages/input-host/src/SelectionManager.ts:697,2390`

**Root cause — confirmed by production logs:**

```
[PickResolver/rAF] hover-hit=b150a76e   ← Slab Y=20.8 (hover GPU)
[PickResolver]     hit=62d62f9c          ← Slab Y=23.8 (click GPU, same cursor position)
[PickResolver]     hit=bccd3655          ← CurtainWall Y=30.0 (floor 10, wrong floor)
[PickResolver]     hit=b75b5c7c          ← CurtainWall Y=27.0 (floor 9,  wrong floor)
[GPU Monitor]      geometries:4949 | drawCalls:9369  ← heavy batch geometry
```

In `syncPickScene()` the Simple Mesh/Group path (line 569) calls `obj.updateMatrixWorld(false)` before copying `obj.matrixWorld` to the pick-scene clone:

```ts
// BROKEN — force=false
obj.updateMatrixWorld(false);
entry.clone.matrix.copy(obj.matrixWorld);  // stale if builder used matrixAutoUpdate=false
```

BIM element builders commonly use `matrixAutoUpdate = false` and set `obj.matrix` directly (e.g. `obj.matrix.makeTranslation(x, y, z)`) for performance. In that case THREE.js never sets `obj.matrixWorldNeedsUpdate = true`, so `updateMatrixWorld(false)` is a no-op and the clone inherits whatever `obj.matrixWorld` was last set — often the identity transform (Y=0) for newly-constructed objects.

After `CreateCurtainWallsOnAllSlabsCommand` runs across 10 floors, all upper-floor element clones (Y=3…30) land at Y=0 in the pick framebuffer. The GPU pick then finds these clones at floor-1 pixel positions, selecting a CurtainWall at Y=27/30 when the user visually points at floor 1. Meanwhile the BVH/raycaster hover uses `intersectObjects` which calls Three.js internals that force-update matrices — hover correctly identifies the floor-1 element. The divergence produces the observed hover-vs-click mismatch.

Additionally, the InstancedMesh path (line 531) had a redundant `obj.updateMatrixWorld(false)` call immediately before `refreshInstancedPickClone`, which already calls `root.updateMatrixWorld(true)` internally. The false call was harmless but confusing.

**Fix (applied):**

1. **`gpu-pick.ts` line 569**: `obj.updateMatrixWorld(false)` → `obj.updateMatrixWorld(true)` (force-recompute the full subtree regardless of dirty flags)  
2. **`gpu-pick.ts` line 531**: removed redundant `obj.updateMatrixWorld(false)` before `refreshInstancedPickClone`  
3. **`SelectionManager.ts:697`**: Added `this.world.scene.three.updateMatrixWorld(true)` immediately before the GPU pick block in `performSelection()` — matches what Three.js renderer does at frame-start; ensures ALL elements have current matrixWorld before `syncPickScene` queries any of them  
4. **`SelectionManager.ts:2390`**: Same `updateMatrixWorld(true)` call added at the top of `_onHoverGpuPickRaf()` — hover RAF fires asynchronously and has the same stale-matrix exposure

**Performance note:** `scene.updateMatrixWorld(true)` is O(n_scene) but is the exact same cost paid by the normal render loop on every frame. It runs once per pick event (click or hover RAF), not once per element.

---

#### F-P1 · `_buildGpuPickRenderer()` lacks try/finally — overrideMaterial leaks on shader error  
**[Partially mitigated from HIGH-8 — still a real production bug]**  
**Severity:** HIGH  
**File:** `packages/input-host/src/SelectionManager.ts:232–245`

```ts
// CURRENT — no try/finally
renderToTarget(scene, camera, target, override) {
    const prevTarget   = renderer.getRenderTarget();
    const prevOverride = renderer.overrideMaterial;
    renderer.setRenderTarget(target);
    renderer.overrideMaterial = override;
    renderer.render(scene, camera);           // ← throws on shader error
    renderer.overrideMaterial = prevOverride; // ← never reached
    renderer.setRenderTarget(prevTarget);     // ← never reached
}
```

**Consequence:** If `renderer.render()` throws (shader compilation error, context loss during render, malformed geometry), `overrideMaterial` stays as the pick-encoding material on the live renderer. Every subsequent normal render frame produces a solid-color ID-buffer image instead of the real scene. The editor appears to go blank/solid-color. WebGL context restore does NOT reset `overrideMaterial` — it persists until the next successful pick.

**Fix:**
```ts
renderToTarget(scene, camera, target, override) {
    const prevTarget   = renderer.getRenderTarget();
    const prevOverride = renderer.overrideMaterial;
    renderer.setRenderTarget(target);
    renderer.overrideMaterial = override;
    try {
        renderer.render(scene, camera);
    } finally {
        renderer.overrideMaterial = prevOverride;
        renderer.setRenderTarget(prevTarget);
    }
}
```

**Same fix applies to the hover path** in `_onHoverGpuPickRaf()` — it calls `this._pickStrategy.pick()` which ultimately calls the same `renderToTarget`.

---

#### F-P2 · Viewport resize only wired to `window.resize`, not `ResizeObserver`  
**[NEW — not in audit]**  
**Severity:** HIGH  
**File:** `apps/editor/src/engine/initScene.ts:836`

The `resize()` function reads `container.clientWidth / container.clientHeight` (correct) but is only called when `window.resize` fires:

```ts
window.addEventListener('resize', () => {
    resize();           // ← correct dimensions function
    scheduleRPMRebuild();
});
```

**Problem:** The 3D editor sits inside `#container`. Panel operations — Split View open, DataWorkbench open, sidebar toggle, property panel expand — all change `#container`'s CSS width **without firing `window.resize`**. When this happens:
- `world.renderer.three.setSize()` is NOT called → OBC WebGL canvas stays at old pixel dimensions  
- `camera.aspect` is NOT updated → frustum is wrong → objects appear stretched or clipped  
- `getBoundingClientRect()` in `performSelection()` returns the NEW (correct) CSS dimensions, but the camera projection matrix still encodes the OLD aspect → NDC coordinates computed from live rect are correct, but the camera's own NDC transform does not match → raycasts miss by up to `(old_width - new_width) / old_width × 100%` of viewport width

**Consequence:** After opening the Split View panel (which narrows the 3D viewport), clicks may select the wrong element or hit empty space. The bug self-corrects on next `window.resize` (e.g., browser window drag-resize).

**Fix:** Add a `ResizeObserver` on `#container` alongside `window.resize`:

```ts
// In initScene.ts, after the existing window.resize listener
const resizeObserver = new ResizeObserver(() => {
    resize();
    scheduleRPMRebuild();
});
resizeObserver.observe(container);
// Unregister in teardown
```

`ResizeObserver` fires synchronously within the same microtask as the CSS layout change, so the camera and renderer are always in sync with the actual container dimensions.

---

#### F-P3 · `world.renderer as any` double-cast — full type erasure on WebGLRenderer  
**[Confirmed from HIGH-1 — same file, production path]**  
**Severity:** MEDIUM (type safety / crash risk)  
**File:** `packages/input-host/src/SelectionManager.ts:228`

```ts
const renderer = (this.world.renderer as any).three as any;
```

The double `as any` means:
1. `renderer.overrideMaterial` — no TypeScript guard if OBC changes the property name
2. `renderer.getRenderTarget()` / `renderer.setRenderTarget()` — same
3. Any null-dereference (e.g., `world.renderer` being undefined during hot-reload) silently proceeds until a runtime crash

**Fix:** Introduce a typed accessor or a typed `GpuPickRendererAccessor` utility in `@pryzm/renderer-three`:

```ts
// packages/renderer-three/src/accessors.ts (new file, ~15 lines)
export function getThreeRenderer(world: OBC.World): THREE.WebGLRenderer {
    const r = (world.renderer as OBC.BaseRenderer & { three?: THREE.WebGLRenderer }).three;
    if (!(r instanceof THREE.WebGLRenderer)) {
        throw new Error('[PRYZM] world.renderer.three is not a THREE.WebGLRenderer');
    }
    return r;
}
```

Then in `SelectionManager._buildGpuPickRenderer()`:
```ts
import { getThreeRenderer } from '@pryzm/renderer-three/accessors';
const renderer: THREE.WebGLRenderer = getThreeRenderer(this.world);
```

---

#### F-P4 · `selectById()` uses full `scene.traverse()` and bypasses `findSelectableRoot()`  
**[NEW — not in audit]**  
**Severity:** MEDIUM  
**File:** `packages/input-host/src/SelectionManager.ts:886–906`

Two separate bugs in the same method:

**Bug A — Full scene traversal:**
```ts
scene.traverse((obj) => {
    if (!found && obj.userData?.id === id) {
        found = obj;
    }
});
```
`scene.traverse()` visits every node in the full Three.js scene graph (3,000–25,000 nodes on complex projects). This runs on every panel click (hierarchy tree, schedule view, etc.) that triggers a programmatic selection. The `_selectableCache` exists precisely to avoid this scan, but `selectById()` never consults it.

**Bug B — No semantic root normalization:**  
`select(found)` is called directly on the first object with matching `id`. If `id` matches a sub-mesh (e.g., a geometry fragment with `userData.id` matching a wall ID for some element type), the wrong node gets TransformControls attached and the inspector receives wrong metadata.

**Fix:**
```ts
selectById(id: string): boolean {
    if (!id) return false;
    
    // Fast path: consult selectable cache first (O(n_selectable) vs O(n_scene))
    const cache = this._selectableCache;
    if (cache) {
        const cached = cache.find(obj => obj.userData?.id === id);
        if (cached) {
            const root = this.findSelectableRoot(cached) ?? cached;
            this.select(root);
            return true;
        }
    }
    
    // Slow fallback: traverse only if cache is stale or object not in cache
    let found: THREE.Object3D | null = null;
    try {
        const scene = (this.world as any).scene?.three as THREE.Scene | undefined;
        if (scene) {
            scene.traverse((obj) => {
                if (!found && obj.userData?.id === id) found = obj;
            });
        }
    } catch (err) {
        console.warn('[SelectionManager.selectById] traversal error:', err);
    }
    if (found) {
        const root = this.findSelectableRoot(found) ?? found;
        this.select(root);
        return true;
    }
    return false;
}
```

---

#### F-P5 · `dblclick` handler skips `underlayActive` guard  
**[NEW — not in audit]**  
**Severity:** LOW-MEDIUM  
**File:** `packages/input-host/src/SelectionManager.ts:498`

The `dblclick` handler (slab profile edit) scans direct scene children:
```ts
if (obj.userData?.isHelper || obj.userData?.isPreview || !obj.visible) continue;
```

It does NOT check `obj.userData?.underlayActive`, which is the flag `UnderlayRenderService` uses to mark ghost slab objects that should be invisible to user interaction. The `performSelection()` click handler correctly guards this (line 667). A double-click on an underlay ghost slab would incorrectly trigger `SlabTool.enterProfileEditMode()`.

**Fix:** Add the guard:
```ts
if (obj.userData?.isHelper || obj.userData?.isPreview ||
    obj.userData?.underlayActive || !obj.visible) continue;
```

---

#### F-P6 · `window.isCameraDragging` global — no try/finally, no TypeScript declaration  
**[NEW — not in audit]**  
**Severity:** LOW-MEDIUM  
**Files:** `apps/editor/src/engine/initScene.ts:944–969`, `packages/input-host/src/SelectionManager.ts:645`

The camera-drag guard is architecturally correct (separate concerns, window-global is documented). However:

1. **No TypeScript declaration:** `window.isCameraDragging` is assigned without a declaration in `global.d.ts`, producing implicit `any` reads everywhere it is consumed.

2. **No try/finally around camera event handlers:** If a handler after `controlstart` throws before line 953, `isCameraDragging` stays `true` permanently → selection is silently disabled for the session.

3. **Stale `true` on page focus loss:** If the user alt-tabs mid-orbit, `controlend` may not fire on some browsers → flag stays `true`.

**Fix:**
```ts
// packages/input-host/src/types/globals.d.ts (or global.d.ts)
interface Window {
    isCameraDragging: boolean;
    // … other existing declarations
}
```

For the stale-flag risk, add a `visibilitychange` reset:
```ts
// In initScene.ts camera guard block:
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        window.isCameraDragging = false;
    }
});
```

---

#### F-P7 · GPU hover pick lacks try/finally on overrideMaterial restore  
**[NEW — extends F-P1 to hover path]**  
**Severity:** MEDIUM  
**File:** `packages/input-host/src/SelectionManager.ts:2364` (`_onHoverGpuPickRaf`)

`_onHoverGpuPickRaf()` calls `this._pickStrategy.pick(point, ctx)` which calls `renderToTarget()` — the same `renderToTarget` that lacks try/finally (F-P1). The hover pick fires on every pre-render frame when the mouse moves. A shader error during hover pick would leak `overrideMaterial` and blank the scene.

**Fix:** Addressed by the same try/finally in F-P1. No additional change needed — `renderToTarget` is the single point of failure.

---

### 2.2 Plugin SDK stub findings (lower production priority)

These findings are real bugs in `plugins/selection/src/tool.ts` but do not affect the production editor until that plugin is wired in.

---

#### F-S1 · `SelectionTool` dispatches on `pointerdown` not `pointerup`  
**[REVISED from CRITICAL-1 — real bug in stub, not production]**  
**Severity:** HIGH in plugin context (LOW production impact today)  
**File:** `plugins/selection/src/tool.ts:65, 79`

The original audit correctly identified this as a contract violation (C11 §3.3). The bug is real — when wired, any orbit gesture would fire a selection dispatch. But since `SelectionTool` is not used in production today, this is a pre-emptive fix.

**Fix:** Replace the `pointerdown` handler with the click/pointerup pattern already used by `SelectionManager`:
```ts
// Remove pointerdown handler entirely.
// Use 'click' for mouse, 'pointerup' (non-mouse) for touch.
this.canvas.addEventListener('click', (e) => {
    if (e.button !== 0) return;
    const hit = this.hitTest(e.offsetX, e.offsetY);
    if (hit) this.commandBus.dispatch('selection.select', { elementId: hit.elementId }, { source: 'user' });
    else      this.commandBus.dispatch('selection.clear', {}, { source: 'user' });
});
this.canvas.addEventListener('pointerup', (e) => {
    if ((e as PointerEvent).pointerType === 'mouse') return;
    const hit = this.hitTest(e.offsetX, e.offsetY);
    if (hit) this.commandBus.dispatch('selection.select', { elementId: hit.elementId }, { source: 'user' });
    else      this.commandBus.dispatch('selection.clear', {}, { source: 'user' });
});
```

---

#### F-S2 · `SelectionCommandBus` uses legacy API shape — `source` tag missing  
**[REVISED from HIGH-1 — real in stub, not production]**  
**Severity:** MEDIUM in plugin context  
**File:** `plugins/selection/src/tool.ts:24`

```ts
// AS-IS (legacy shape, no source tag)
export interface SelectionCommandBus {
  executeCommand<T>(type: string, payload: T): Promise<unknown>;
}

// SHOULD BE (C11 §3.2)
export interface SelectionCommandBus {
  dispatch<T>(typeId: string, payload: T, opts: { source: 'user' | 'ai' }): Promise<unknown>;
}
```

---

#### F-S3 · Static `PickContext` built once at boot — viewport is stale after resize  
**[REVISED from HIGH-2 — affects probe only, not per-pick]**  
**Severity:** LOW (one-time probe only)  
**File:** `apps/editor/src/engine/initTools.ts:272`

The `probeCtx` used in `resolvePickStrategy()` captures `canvas.clientWidth/Height` at boot time. This probe is used **once** — to determine if GPU picking hardware is available. It does NOT affect per-click picking (which uses live `getBoundingClientRect()` in `performSelection()`).

The only consequence of stale dimensions in the probe: if the editor is opened in a very narrow window and then resized before the probe fires, the GPU pick target dimensions may differ slightly. Since the probe only writes a 1×1 pixel and reads back a colour to test GPU readback, the wrong dimensions don't affect correctness of the probe decision.

**Fix (low priority):** Pass `() => ({ width: canvas.clientWidth, height: canvas.clientHeight })` as a lazy getter to `probeAvailability()` instead of a captured snapshot. Or simply call `getBoundingClientRect()` inside `probeAvailability()`. Given low impact, this is a polish item, not a blocking fix.

---

### 2.3 Architecture debt findings

---

#### F-A1 · Marquee selection uses AABB screen projection — no depth-sorted deduplication  
**[Confirmed from HIGH-4]**  
**Severity:** MEDIUM  
**Files:** `packages/input-host/src/MarqueeSelectionTool.ts:_collectHits`, `packages/picking/src/bvh-pick.ts:pickRectInternal`

Both the MarqueeSelectionTool (BVH path) and `GpuPickStrategy.pickRect()` use **screen-space AABB projection** to determine if an element intersects the marquee rectangle. They do not account for depth — a wall hidden behind the floor slab is selected if its projected AABB intersects the marquee.

```ts
// MarqueeSelectionTool._collectHits (paraphrased):
const box = new THREE.Box3().setFromObject(obj);
box.getCenter(center3D);
center3D.project(camera);   // NDC projection of AABB centre
if (isInsideMarquee(center3D.x, center3D.y)) hits.push(root);
```

**Consequence:** Marquee-selecting a front wall always selects walls behind it too, even at 90°. In plan view this is acceptable (all walls at same elevation). In perspective view, this is incorrect Revit-vs-PRYZM behaviour discrepancy.

**Fix (medium effort):** For the BVH path, project all 8 AABB corners to screen space and check if the projected convex hull intersects the marquee. This is still O(1) per element but eliminates most false positives from elements far behind the selection rectangle. For depth-correct selection, use the GPU `pickRect` path exclusively and retire the AABB CPU path.

---

#### F-A2 · `GpuPickStrategy.syncPickScene()` is O(n) per pick — no scene-content hash  
**[Revised from earlier BVH hash concern — confirmed but less severe than stated]**  
**Severity:** LOW-MEDIUM (perf, not correctness)  
**File:** `packages/picking/src/gpu-pick.ts:472`

`syncPickScene()` iterates all `liveIds` from `_buildElementRegistry()` on every pick (click and hover frame). Per-element work is cheap for existing entries (transform refresh only), but the full iteration still runs. For a scene with 500 BIM elements, this is 500 `Map.get()` + `matrixWorld` updates on every GPU pick.

The fix is a **content hash**: compute a hash of the sorted element IDs at `_buildElementRegistry()` time and skip `syncPickScene()` if the hash matches the previous call.

```ts
// In SelectionManager._buildElementRegistry():
const ids = [...idToObj.keys()].sort();
const contentHash = ids.join('\x00');   // cheap string hash (or FNV-32)
return { ids: () => ids, /* … */, contentHash };

// In GpuPickStrategy.pick():
if (ctx.elementRegistry.contentHash === this._lastRegistryHash) {
    // No elements added/removed — only refresh transforms for known ids
    this._refreshTransformsOnly(ctx.elementRegistry);
} else {
    this.syncPickScene(ctx.elementRegistry);
    this._lastRegistryHash = ctx.elementRegistry.contentHash;
}
```

---

#### F-A3 · `window.__curtainSubElement` and `window.__underlayHit` — untyped globals  
**[NEW — not in audit]**  
**Severity:** LOW (type safety)  
**Files:** `SelectionManager.ts:715, 763, 815, 820, 826`

Inter-system coordination uses untyped `window` globals:
- `window.__curtainSubElement` — bridges SelectionManager curtain-wall state to inspector
- `window.__underlayHit` — bridges FloorPlanUnderlayTool mousedown to SelectionManager click
- `window.wardrobeRunInspector` — inspector reference in `select()`
- `window.activeLevelElevation` — active level elevation for world-click dispatch

**Fix:** Add TypeScript declarations for all of these in a `src/globals.d.ts` or extend the existing `global.d.ts`. Does not change runtime behaviour but eliminates implicit-any warnings and prevents typo regressions.

---

#### F-A4 · `applyHighlight()` — per-element-type OBB logic is unbounded switch-case  
**[NEW — not in audit]**  
**Severity:** LOW (architecture debt)  
**File:** `packages/input-host/src/SelectionManager.ts:908–1100+`

Every BIM element type (wall, door, window, furniture, room, slab, bimgrid, curtain-wall, ceiling, etc.) has its own bounding-box computation inlined in `applyHighlight()`. This method is ~600 LOC and growing with every new element type.

**Fix (long-term):** Define a `getSelectionBounds(obj: THREE.Object3D): { center, size, quaternion }` protocol on each element's builder and register it in a `SelectionBoundsRegistry`. `applyHighlight()` calls the registered function for the element type instead of having a monolithic switch.

---

#### F-A5 · Delete key handler uses `window.commandManager.execute()` — not commandBus  
**[Confirmed from earlier review]**  
**Severity:** MEDIUM (undo stack divergence)  
**File:** `packages/input-host/src/SelectionManager.ts:356–373`

```ts
if (e.key === 'Delete' && …) {
    const commandManager = window.commandManager;   // ← legacy
    commandManager.execute(new DeleteOpeningCommand(id));
    // … bus telemetry is fire-and-forget, not the real dispatch path
}
```

Delete commands for `opening` and `lighting` element types still go through the legacy `commandManager.execute()`. This bypasses the `runtime.commandBus` undo stack. The telemetry comment `[E.5.x] fire-and-forget` confirms this is a known migration debt.

**Fix:** Replace with `runtime.commandBus.dispatch('element.delete', { id, elementType }, { source: 'user' })` once the bus handlers for opening and lighting deletion are registered.

---

## 3 · Implementation Tasks (ordered by priority)

### Wave A — Production correctness (blocking issues, do first)

| ID | Finding | File | Status |
|---|---|---|---|
| **A0** | **Stale `matrixWorld` in GPU pick scene (F-NEW)** | `gpu-pick.ts:531,569` + `SelectionManager.ts:697,2390` | ✅ APPLIED 2026-05-15 |
| A1 | try/finally in `renderToTarget` | `SelectionManager.ts:232` | ✅ APPLIED 2026-05-15 |
| A2 | ResizeObserver on `#container` | `initScene.ts:836` | ✅ APPLIED 2026-05-15 |
| A3 | `dblclick` underlay guard | `SelectionManager.ts:506` | ✅ APPLIED 2026-05-15 |
| A4 | `selectById()` cache + root fix | `SelectionManager.ts:911` | ✅ APPLIED 2026-05-15 |

### Wave B — Type safety and declaration debt

| ID | Finding | File | Status |
|---|---|---|---|
| B1 | `window.isCameraDragging` TypeScript declaration | `apps/editor/src/types/globals.d.ts` | ✅ APPLIED 2026-05-15 |
| B2 | All other `window.*` globals declared (39 globals) | `apps/editor/src/types/globals.d.ts` | ✅ APPLIED 2026-05-15 |
| B3 | `getThreeRenderer()` typed accessor | `packages/renderer-three/src/accessors.ts` | ✅ APPLIED 2026-05-15 |
| B4 | Update `SelectionManager` to use `getThreeRenderer` | `SelectionManager.ts:4,233` | ✅ APPLIED 2026-05-15 |
| B5 | `visibilitychange` + `blur` reset for isCameraDragging | `initScene.ts:996–1006` | ✅ APPLIED 2026-05-15 |

### Wave C — Plugin SDK stub correctness

| ID | Finding | File | Status |
|---|---|---|---|
| C1 | `SelectionTool` `click`+`pointerup` dispatch (was `pointerdown`) | `plugins/selection/src/tool.ts` | ✅ APPLIED 2026-05-15 |
| C2 | `SelectionCommandBus` typed overloads + payload interfaces | `plugins/selection/src/tool.ts` | ✅ APPLIED 2026-05-15 |

### Wave D — Performance

| ID | Finding | File | Status |
|---|---|---|---|
| D1 | `syncPickScene` registry content-hash shortcut | `gpu-pick.ts:483–510` | ✅ APPLIED 2026-05-15 |

### Wave E — Architecture improvements (long-term)

| ID | Finding | File | Estimated LOC | Risk | Status |
|---|---|---|---|---|---|
| E1 | Marquee depth-correct projection — frustum-only corners + near-plane clamp | `MarqueeSelectionTool.ts:267–298` | ~50 LOC | Medium | ✅ APPLIED 2026-05-15 |
| E2 | `SelectionBoundsRegistry` extraction | `packages/input-host/src/SelectionBoundsRegistry.ts` (new, 434 LOC) + `SelectionManager.ts` (`applyHighlight` 554 LOC → 65 LOC) | ~500 LOC | High (many element types) | ✅ APPLIED Sprint F-2.0 (2026-05-15) — 9 built-in builders (door/window, wall, curtainwall, column, slab, floor/ceiling, room, furniture, bimgrid); `boundsRegistry` public getter; `buildDefaultSelectionBoundsRegistry()` factory; TSC = 0 |
| E3 | Delete key → commandBus dispatch | `SelectionManager.ts:365` + `DeleteElement.ts` | ~40 LOC | Medium | ✅ APPLIED 2026-05-15 |

### Wave F — Audit findings not carried into Waves A–E (applied 2026-05-15)

These two findings appeared in the original Audit document but were not assigned a Wave A–E task in this Implementation Plan. Both are now resolved.

| ID | Audit finding | File | Status |
|---|---|---|---|
| **F1** | **CRITICAL-2 · GPU probe does not validate pixel readback — R1C-02 Mesa bug unmitigated** | `packages/picking/src/gpu-pick.ts:probeAvailability()` | ✅ APPLIED 2026-05-15 |
| **F2** | **HIGH-7 · Slot index monotonic growth — no free-list; exhaustion at 2²⁴−1 elements** | `packages/picking/src/gpu-pick.ts:nextSlot / syncPickScene` | ✅ APPLIED 2026-05-15 |

#### F1 detail — CRITICAL-2 (render-and-readback probe)

**Root cause (pre-fix):** `probeAvailability()` called `createRenderTarget` + `readPixels` on an _unrendered_ RT. This only verified that the API didn't throw — it cannot detect the R1C-02 Mesa driver bug, where `readPixels` silently returns all-zero bytes after every render. On affected drivers, every pick returned "no hit" with no error, no warning, and no telemetry.

**Fix applied:**
1. Build a 1×1 probe RT.
2. Render a `PlaneGeometry(2,2)` filled with `encodeIndexToRGBA(1)` colour (`[0,0,1,255]`) through a minimal `OrthographicCamera(-1,1,1,-1,0.1,10)`. The plane fully covers the RT.
3. Read the pixel back and verify `decodeRGBAToIndex(r,g,b,a) === 1`.
4. Healthy driver → `[0,0,1,255]` → decode `1` → `ok:true`.
5. R1C-02 Mesa → `[0,0,0,0]` → decode `0` → `ok:false` with explicit reason string → resolver falls back to BVH and emits `pryzm.picking.gpu-pick.unavailable` OTel span.
6. Probe geometry and material are disposed in a `finally` block regardless of outcome.

The probe now exercises the full `encode → render → readback → decode` pipeline, not just the API surface.

#### F2 detail — HIGH-7 (slot free-list)

**Root cause (pre-fix):** `nextSlot` incremented on every element addition and was never decremented when an element was removed. `indexToId.delete(slotIndex)` freed the _mapping_ but not the _index_. In a long-lived session with repeated AI batch create/delete cycles the slot counter would eventually reach `0xFFFFFF` (16 M), at which point `encodeIndexToRGBA` returns `[0,0,0,0]` (the "no hit" sentinel) for every new element — silently disabling picking for all subsequently added elements.

**Fix applied:**
- Added `private readonly _freeSlots: number[] = []` field.
- Added `private _allocateSlot(): number` — pops from `_freeSlots` when available, otherwise increments `nextSlot`. O(1) amortised.
- `syncPickScene` removal pass now calls `this._freeSlots.push(entry.slotIndex)` before `this.entries.delete(id)`.
- `dispose()` now also resets `this._freeSlots.length = 0` and `this._lastRegistrySig = ''` so the full strategy state is clean after a project close/switch.
- Both allocation sites (`InstancedMesh` path and `Simple Mesh` path) now call `this._allocateSlot()` instead of `this.nextSlot++`.

The slot-index space is now bounded by the **live** element count, not the cumulative create-delete count.

### Build fixes applied 2026-05-15

| Issue | Root cause | Fix |
|---|---|---|
| `TS2339: Property 'overrideMaterial' does not exist on type 'WebGLRenderer'` | Three.js r152+ moved `overrideMaterial` from `WebGLRenderer` → `Scene` | Changed `renderer.overrideMaterial` → `scene.overrideMaterial` in `_buildGpuPickRenderer()` |
| `TS2345: Argument not assignable to parameter of type 'CommandBus'` (×5, engineLauncher.ts) | `PryzmRuntime.bus` slot is intentionally narrow; `registerXxxHandlers()` expects full class | Cast `runtime.bus as any` — same pattern as CRDT applier wiring on line 407 |

---

## 4 · Detailed Implementation Notes

### 4.1 A1 — try/finally in `renderToTarget`

**Location:** `packages/input-host/src/SelectionManager.ts`, method `_buildGpuPickRenderer()`, inner function `renderToTarget`.

The current inner function is defined as a plain method object literal (lines 232–245). Replace:

```ts
// BEFORE
renderToTarget(scene, camera, target, override) {
    const prevTarget   = renderer.getRenderTarget();
    const prevOverride = renderer.overrideMaterial;
    renderer.setRenderTarget(target);
    renderer.overrideMaterial = override;
    renderer.render(scene, camera);
    renderer.overrideMaterial = prevOverride;
    renderer.setRenderTarget(prevTarget);
},

// AFTER
renderToTarget(scene, camera, target, override) {
    const prevTarget   = renderer.getRenderTarget();
    const prevOverride = renderer.overrideMaterial;
    renderer.setRenderTarget(target);
    renderer.overrideMaterial = override;
    try {
        renderer.render(scene, camera);
    } finally {
        renderer.overrideMaterial = prevOverride;
        renderer.setRenderTarget(prevTarget);
    }
},
```

**Verification:** Trigger a shader compilation error (e.g., by passing a broken ShaderMaterial as override) and confirm that the scene renders normally on the next frame.

---

### 4.2 A2 — ResizeObserver on `#container`

**Location:** `apps/editor/src/engine/initScene.ts`, after the `window.addEventListener('resize', …)` block at line 836.

```ts
// After existing window.resize listener:
const _containerObserver = new ResizeObserver(() => {
    resize();
    scheduleRPMRebuild();
});
_containerObserver.observe(container);

// Also add to teardown / cleanup if initScene has one:
// _containerObserver.disconnect();
```

**Why this is safe:** `resize()` reads `container.clientWidth/Height` which are synchronously updated by the browser layout engine before `ResizeObserver` callbacks fire. `scheduleRPMRebuild()` is already debounced at 200ms so rapid resize events don't thrash.

**Verification:** Open the Split View panel (which narrows the 3D viewport). Confirm that clicking walls immediately after the split animates correctly (no miss-click offset).

---

### 4.3 A3 — `dblclick` underlay guard

**Location:** `packages/input-host/src/SelectionManager.ts:498`

```ts
// BEFORE
if (obj.userData?.isHelper || obj.userData?.isPreview || !obj.visible) continue;

// AFTER
if (obj.userData?.isHelper || obj.userData?.isPreview ||
    obj.userData?.underlayActive || !obj.visible) continue;
```

One-line change. Zero risk.

---

### 4.4 A4 — `selectById()` cache + root fix

**Location:** `packages/input-host/src/SelectionManager.ts:886`

See the full fix in §2.1 F-P4 above. The key behavioral changes:
1. Check `_selectableCache` first → O(n_selectable) vs O(n_scene) full traverse
2. Call `findSelectableRoot(found) ?? found` before `select()` → correct semantic root

**Edge case:** If the element is not yet in `_selectableCache` (added between cache invalidation and the panel click), the cache path misses and falls through to the full traverse. This is correct behavior — the traversal finds the newly added element.

---

### 4.5 B1–B2 — TypeScript global declarations

**Location:** Create or extend `apps/editor/src/types/globals.d.ts` (or the project's existing `global.d.ts`):

```ts
// globals.d.ts — window global declarations for PRYZM editor
declare global {
    interface Window {
        // Camera dragging flag (set by initScene.ts camera control listeners)
        isCameraDragging: boolean;

        // Curtain-wall sub-element state (SelectionManager ↔ inspector bridge)
        __curtainSubElement: import('@pryzm/input-host').CurtainSubElement | null;

        // Underlay hit bridge (FloorPlanUnderlayTool mousedown → SelectionManager click)
        __underlayHit: boolean | undefined;

        // Active level elevation for world-click events (set by LevelManager)
        activeLevelElevation: number | undefined;

        // Wardrobe run inspector (set by EngineBootstrap)
        wardrobeRunInspector: { show(id: string): void } | undefined;

        // Legacy command manager (migration target: replaced by runtime.commandBus)
        commandManager: import('../engine/CommandManager').CommandManager | undefined;

        // … other existing declarations
    }
}
export {};
```

---

## 5 · What the Audit Got Right

The following findings from the original audit are **confirmed by deep code inspection** and require no revision:

| Audit ID | Finding | Status |
|---|---|---|
| HIGH-3 | `PickStrategyResolver` has no fallback on `probeAvailability` failure | ✅ FIXED 2026-05-15 — Added `try/catch` around `gpu.probeAvailability(ctx)` in `PickStrategyResolver.ts`. When the probe throws (broken WebGL context, context-lost, headless env), the exception is now caught, an OTel event is emitted with `span.recordException(e)`, and `BvhPickStrategy` is returned. `resolvePickStrategy()` can no longer propagate an exception to `initTools.ts` — `setPickStrategy(null)` path is now unreachable from a probe failure. |
| HIGH-4 | Marquee selection uses AABB projection | Confirmed (F-A1 above) |
| HIGH-5 | Hover raycasting not throttled by FrameScheduler | Partially mitigated — `_onPointerMove` has `HOVER_THROTTLE_MS` guard AND the GPU hover path uses `scheduleOnce()` on FrameScheduler. BUT the BVH hover raycast in `_onPointerMove` is synchronous and still called on every non-throttled `pointermove`. The throttle prevents the _previous_ frame's cost from accumulating; it doesn't fully defer work to pre-render. |
| MEDIUM-2 | `PickProbeResult` has no structured error field | ✅ FIXED 2026-05-15 — Added `readonly error?: Error` to `PickProbeResult` in `packages/picking/src/types.ts`. `GpuPickStrategy.probeAvailability()` now populates `{ ok: false, reason: e.message, error: e }` when catching exceptions. `PickStrategyResolver.ts` calls `span.recordException(probe.error)` when present. |
| MEDIUM-4 | No telemetry/span for selection pick duration | ✅ FIXED 2026-05-15 — Added `startSpan` export to `packages/input-host/src/otel.ts`. `performSelection()` now wraps the full pick-to-select pipeline in a `pryzm.selection.pick` span (attribute: `pryzm.selection.strategy`). `_onHoverGpuPickRaf()` wraps the GPU hover pick in a `pryzm.selection.hover.raf` span (attributes: `strategy`, `hit`, `element_id`). Both use `try/finally` to guarantee span.end() is called on all code paths including early returns. |

---

## 6 · What the Audit Got Wrong (Corrections)

| Audit ID | Claimed | Actual |
|---|---|---|
| CRITICAL-1 | `SelectionTool.onPointerDown` is the daily-use production selection path | `SelectionTool` is a plugin-SDK stub, not wired in production. Production uses `SelectionManager.click` handler (correct). Severity in production: LOW. |
| HIGH-1 (as critical) | `SelectionCommandBus.executeCommand` dispatches live selection | Same — applies only to the plugin stub |
| HIGH-2 | Static viewport snapshot used for every pick | `performSelection()` calls `getBoundingClientRect()` at click time. Snapshot issue is ONE-TIME probe only. Per-click viewport is live and correct. |
| HIGH-8 (as full bug) | `overrideMaterial` not restored after GPU pick | Partially mitigated — success path DOES restore. Only the exception path leaks. Still needs try/finally but not as severe as stated. |
| MEDIUM-1 | No drag-distance guard in selection | `window.isCameraDragging` guard fully prevents orbit-click misselection in production. The `click` event also inherently requires press+release without significant pointer movement. |

---

## 7 · Success Criteria

All Wave A tasks complete when:

1. **F-P1:** A simulated shader error during GPU pick does NOT blank the scene on the next render frame. Verify with `THREE.ShaderMaterial` that throws in `onBeforeRender`.

2. **F-P2:** Opening the Split View / DataWorkbench panel narrows `#container`. Clicking on a wall immediately after the panel animation completes selects the wall under the cursor (not offset). Verified by comparing click hit position before and after panel open.

3. **F-P3:** Opening the Split View panel triggers `ResizeObserver` → `resize()` → `setSize()`. Verified via `console.log('[initScene] resize')` in `resize()` body.

4. **F-P4:** Selecting an element from the hierarchy tree panel (`selectById`) takes < 1 ms on a 500-element scene. Verified via `console.time('selectById')`.

5. **F-P5:** Double-clicking an underlay ghost slab does NOT trigger slab profile edit mode. Verified by activating an underlay view and double-clicking.

All Wave B tasks complete when:
- `tsc --noEmit` passes with zero `implicit any` errors on any `window.` access in scope.

---

## 8 · File Touch Summary

### ✅ Applied — 2026-05-15 (Wave A0 + A1–A4)

```
packages/picking/src/gpu-pick.ts
  line 531        : F-NEW (A0) — removed redundant obj.updateMatrixWorld(false) before
                    refreshInstancedPickClone (which already calls root.updateMatrixWorld(true))
  line 569        : F-NEW (A0) — obj.updateMatrixWorld(false) → obj.updateMatrixWorld(true)
                    CRITICAL: forces world-matrix recompute for batch-created elements that
                    use matrixAutoUpdate=false, eliminating stale-identity clones at Y=0

packages/input-host/src/SelectionManager.ts
  line 232–256    : F-P1 (A1) — try/finally in renderToTarget — overrideMaterial always restored
  line 506–511    : F-P5 (A3) — underlayActive guard in dblclick slab-candidates scan
  line 697        : F-NEW (A0) — scene.updateMatrixWorld(true) before GPU pick in performSelection()
  line 911–951    : F-P4 (A4) — selectById: check _selectableCache first, findSelectableRoot normalize
  line 2390       : F-NEW (A0) — scene.updateMatrixWorld(true) before GPU pick in _onHoverGpuPickRaf()

apps/editor/src/engine/initScene.ts
  line 844–863    : F-P2 (A2) — ResizeObserver on #container with rAF coalescing
```

### ✅ Applied — Wave B (type safety, 2026-05-15)

```
apps/editor/src/types/globals.d.ts  (NEW FILE)
  entire file     : B1-B2 — 39 window.* globals typed with discriminated unions,
                    precise shapes for isCameraDragging, __curtainSubElement,
                    __kitchenSubUnit, __wardrobeSubUnit, __underlayHit, etc.
                    Also: PryzmRuntimeFlags, PryzmCurtainSubElement,
                    PryzmKitchenSubUnit, PryzmWardrobeSubUnit inline interfaces.

packages/renderer-three/src/accessors.ts  (NEW FILE)
  entire file     : B3 — getThreeRenderer() typed accessor; replaces
                    `(world.renderer as any).three as any` pattern.
                    Exported from renderer-three barrel (index.ts:114-116).

packages/renderer-three/src/index.ts
  line 114-116    : B3 — export getThreeRenderer + ObcRendererLike from barrel.

packages/input-host/src/SelectionManager.ts
  line 4          : B4 — import getThreeRenderer from @pryzm/renderer-three
  line 233        : B4 — replace (world.renderer as any).three as any

apps/editor/src/engine/initScene.ts
  line 996-1006   : B5 — visibilitychange + blur reset for isCameraDragging
```

### ✅ Applied — Wave C (plugin SDK stub, 2026-05-15)

```
plugins/selection/src/tool.ts  (FULLY REWRITTEN)
  C1: pointerdown → click (mouse) + pointerup guard (touch/stylus)
      handleHit() extracted as shared logic
  C2: SelectionCommandBus typed overloads for selection.select / selection.clear
      SelectionSelectPayload + SelectionClearPayload exported interfaces
      reason field in clear payload for telemetry
```

### ✅ Applied — Wave D (performance, 2026-05-15)

```
packages/picking/src/gpu-pick.ts
  line 150        : D1 — _lastRegistrySig: string field on GpuPickStrategy
  line 483-510    : D1 — syncPickScene computes sorted-ID sig; skips the
                    O(entries) remove-old pass when setStable=true
```

---

*End of Implementation Plan.*
