# PRYZM BIM — 3D Scene Accuracy & Selection System Audit
**Audit scope:** Selection pipeline · Coordinate systems · Raycasting · Camera/projection · Semantic-geometry consistency · Picking architecture · GPU/render synchronisation  
**Codebase revision:** Current main branch (≥rev-83 per `03-CURRENT-STATE.md`)  
**Evidence base:** Direct source inspection of `packages/picking/src/{types,gpu-pick,bvh-pick,PickStrategyResolver}.ts`, `plugins/selection/src/{tool,store}.ts`, `packages/renderer-three/src/{RendererHandle,WorkspaceSurface}.ts`, `apps/editor/src/engine/initTools.ts`, and contracts C04, C11.  
**Severity scale:** **CRITICAL** (silent wrong data, data loss, crash) → **HIGH** (reproducible functional error) → **MEDIUM** (latent / maintenance hazard) → **LOW** (polish / instrumentation gap)

---

## Part 1 — Selection Pipeline End-to-End

### Architecture as built

```
PointerEvent (CSS px)
  └─ SelectionTool.onPointerDown(e)          plugins/selection/src/tool.ts:79
       └─ hitTest(e.offsetX, e.offsetY)       injected by host
            └─ PickStrategy.pick(point, ctx)  @pryzm/picking
                 ├─ GpuPickStrategy           RGBA RT readback
                 └─ BvhPickStrategy           three-mesh-bvh CPU raycast
            └─ commandBus.executeCommand(     SelectionCommandBus (legacy)
                 'selection.select' | 'selection.clear')
```

### CRITICAL-1 · SelectionTool dispatches on `pointerdown`, not `pointerup`

**File:** `plugins/selection/src/tool.ts:65, 79`  
**Contract violation:** C11 §3.3 — _"Tools MUST NOT dispatch on pointerdown. Preview / snap display only on pointerdown. Dispatch happens on pointerup."_

```ts
// AS-IS (wrong)
this.canvas.addEventListener('pointerdown', this.ptrDownHandler);

private onPointerDown(e: PointerEvent): void {
  const hit = this.hitTest(e.offsetX, e.offsetY);   // ← pick + dispatch here
  this.commandBus.executeCommand('selection.select', …)
```

Every camera orbit or pan in the 3D viewport begins with a `pointerdown`. The GPU pick render pass fires immediately, and the result (empty space or a wall) gets dispatched as `selection.clear` or `selection.select`. The user who clicks-and-drags to orbit finds their selection silently changed at the moment the drag begins. This is a **daily-use regression** — the tool is functionally broken for any workflow that involves both orbiting and selecting.

**Fix:** Replace `pointerdown` with a short-circuit `pointerup` listener pattern:

```ts
// Track whether a drag occurred between down and up
private hasDragged = false;
private readonly ptrUpHandler = (e: PointerEvent) => { … };

constructor(…) {
  this.canvas.addEventListener('pointerdown', () => { this.hasDragged = false; });
  this.canvas.addEventListener('pointermove', () => { this.hasDragged = true; });
  this.canvas.addEventListener('pointerup', this.ptrUpHandler);
}

private onPointerUp(e: PointerEvent): void {
  if (this.hasDragged) return;           // was a drag — skip selection
  const hit = this.hitTest(e.offsetX, e.offsetY);
  …dispatch…
}
```

---

### HIGH-1 · `SelectionCommandBus.executeCommand` — legacy API, violates C11 §3.2

**File:** `plugins/selection/src/tool.ts:24`  
**Contract violation:** C11 §3.2 — _"A tool MUST dispatch via `runtime.commandBus.dispatch(typeId, payload, { source: 'user' })`. A tool MUST NOT call `commandManager.execute()`."_

```ts
export interface SelectionCommandBus {
  executeCommand<T>(type: string, payload: T): Promise<unknown>;   // ← legacy shape
}
```

The `{ source: 'user' }` tag is missing. The command bus uses this tag to scope undo/redo history (user-initiated vs AI-initiated changes are tracked separately). Selection commands dispatched without the tag are invisible to the user undo stack — a user cannot Ctrl-Z a selection-driven batch operation initiated from the 3D viewport.

**Fix:** Update the interface and the invocation:
```ts
export interface SelectionCommandBus {
  dispatch<T>(typeId: string, payload: T, opts: { source: 'user' | 'ai' }): Promise<unknown>;
}
// In onPointerDown / onKeyDown:
this.commandBus.dispatch('selection.select', { targets: [hit], mode }, { source: 'user' });
```

---

### MEDIUM-1 · Missing drag-direction disambiguation (box-select vs click-select)

**File:** `plugins/selection/src/tool.ts` (entire class)

There is no drag-distance threshold. A single-pixel accidental micro-drag on a slow device still fires `selection.select`. The `MarqueeSelectionTool` (`initTools.ts:287`) handles Shift+drag separately but uses its own drag detection. The two tools share no `pointerdown` state, creating a race: if both listen to the same canvas, a Shift+drag fires `SelectionTool.onPointerDown` (which sees `shiftKey=true` and immediately dispatches `selection.select { mode:'add' }`) and _also_ fires `MarqueeSelectionTool` — double-dispatch on the same drag.

---

## Part 2 — Coordinate System Correctness

### Architecture

Three coordinate systems must be tracked:

| Space | Origin | Y direction | Used in |
|---|---|---|---|
| CSS (screen) | top-left | down | `e.offsetX/Y`, `clientWidth/Height` |
| WebGL / RT | bottom-left | up | `gl.readPixels`, RT pixel addressing |
| NDC | centre | up (+1 = top) | `camera.setFromCamera`, unproject |

### Assessment — GPU pick Y-flip (CORRECT)

`gpu-pick.ts:251`:
```ts
const ry = this.targetHeight - 1 - Math.floor((point.y / ctx.viewportHeight) * this.targetHeight);
```
The CSS→WebGL Y-flip is present and correct for `pickInternal`. `pickRectInternal:298` also correctly converts:
```ts
const ry = Math.floor(((ctx.viewportHeight - rect.y - rect.h) / ctx.viewportHeight) * this.targetHeight);
```

### Assessment — BVH `screenToNdc` (CORRECT)

`bvh-pick.ts:265`:
```ts
const ndcY = -((point.y / ctx.viewportHeight) * 2 - 1);
```
CSS y=0 (top) maps to NDC +1 (top). Correct.

### Assessment — `projectBoxToScreen` (CORRECT)

`bvh-pick.ts:291`:
```ts
const sy = ((1 - c.y) / 2) * ctx.viewportHeight;
```
NDC y=+1 → sy=0 (CSS top). Correct.

### HIGH-2 · `viewportWidth/viewportHeight` is a static boot-time snapshot

**File:** `apps/editor/src/engine/initTools.ts:252-253`

```ts
viewportWidth:  world.renderer.three.domElement.clientWidth  || 1280,
viewportHeight: world.renderer.three.domElement.clientHeight || 720,
```

These values are captured **once** at `initTools` call time and frozen into the probe context. When the `_strategy` object returned by `resolvePickStrategy(_probeCtx as any)` is later passed `ctx` at actual pick time, the **question is whether `SelectionManager.pick()` rebuilds the context with fresh dimensions**. Since `SelectionManager` is in the legacy `src/engine/` mass (49,647 LOC not yet migrated), and it receives the strategy via `setPickStrategy(_strategy)`, the actual context it provides at pick time could equally be stale. Without a live size query on every pick, a resize will shift all pick coordinates.

**The fallback `|| 1280` / `|| 720`** is the worst case: if `clientWidth` is 0 at init (element not yet laid out in the DOM, common in React StrictMode double-invocation), every pick uses a 1280×720 phantom viewport even on a 4K display.

**Fix:** The `PickContext` construction must occur at pick call time, not at boot time:
```ts
// In SelectionManager.performPick(event):
const ctx: PickContext = {
  camera: …,
  elementRegistry: …,
  viewportWidth:  canvas.clientWidth,
  viewportHeight: canvas.clientHeight,
  scene: …,
  renderer: …,
};
return this.pickStrategy.pick({ x: event.offsetX, y: event.offsetY }, ctx);
```

### MEDIUM-2 · `GpuPickRenderer.width/height` vs `ctx.viewportWidth/Height` unit mismatch (latent)

**File:** `apps/editor/src/engine/initTools.ts:258-259`

```ts
get width()  { return r.domElement.width;  },   // physical pixels (×DPR)
get height() { return r.domElement.height; },   // physical pixels (×DPR)
```

vs.

```ts
viewportWidth:  r.domElement.clientWidth,        // CSS pixels
```

`GpuPickRenderer.width/height` is not used in any coordinate calculation within `gpu-pick.ts` today (it is only accessed as a property, never fed into the `(x / ctx.viewportWidth) * targetWidth` mapping). However, any future code that reads `ctx.renderer.width` expecting CSS pixels and receives physical pixels will produce a 2× offset on Retina displays. The inconsistency is undocumented and invisible to type-checking.

### MEDIUM-3 · Depth reconstruction coordinate convention is inconsistent between two methods

**File:** `packages/picking/src/gpu-pick.ts:446 vs 402`

`readDepthResult` (single-point depth) works in CSS space:
```ts
const ndcX = (screenPoint.x / ctx.viewportWidth) * 2.0 - 1.0;
const ndcY = -((screenPoint.y / ctx.viewportHeight) * 2.0 - 1.0);  // CSS flip
```

`buildDepthBySlot` (multi-element depth) works in RT space:
```ts
const screenX = (rep.x / this.targetWidth) * ctx.viewportWidth;   // RT→CSS mapping
const screenY = (rep.y / this.targetHeight) * ctx.viewportHeight;  // RT→CSS mapping
const ndcY = (screenY / ctx.viewportHeight) * 2.0 - 1.0;          // NO explicit flip
```

Both produce equivalent NDC-Y because `rep.y` is already in RT/WebGL space (0=bottom=NDC -1) — the roundtrip through `screenY` cancels. But the two methods use different intermediate representations: one uses CSS space + explicit flip; the other uses RT space + no flip. A reader comparing them must understand why one has a negation and the other doesn't. A future maintainer adding a third depth method is likely to choose the wrong convention.

**Fix:** Consolidate on one function `rtCoordToNdc(px, py, targetW, targetH)` that documents which space it accepts.

---

## Part 3 — Raycasting Architecture

### Assessment — BVH integration (MOSTLY CORRECT)

`three-mesh-bvh` is correctly installed:
```ts
((THREE.Mesh as unknown) as AccelMesh).prototype.raycast = acceleratedRaycast;
```
This patches `Mesh.prototype.raycast` globally at import time. Because the BVH strategy is always imported (even as fallback), this patch is always active — **including on the main render scene**, not just the pick scene. This is the correct use of `three-mesh-bvh` but is an implicit side effect of the import.

### HIGH-3 · `BvhPickStrategy.firstMesh()` — only first Mesh in Group tested; InstancedMesh misidentified

**File:** `packages/picking/src/bvh-pick.ts:253-262, 160`

```ts
function firstMesh(obj: THREE.Object3D | null): THREE.Mesh | null {
  obj.traverse((child) => {
    if (found !== null) return;
    if (child instanceof THREE.Mesh) found = child;   // ← finds first Mesh in DFS order
  });
  return found;
}
```

**Problem A — multi-face Groups:** A wall element is a Group: `[frameMesh, faceMesh, edgeFillMesh, …]`. The DFS visits `frameMesh` first (or whatever THREE adds first). If the user clicks on the wall face, `firstMesh` returns `frameMesh` (which may be a 1px-wide box) and the raycast misses entirely.

**Problem B — InstancedMesh cast:** `THREE.InstancedMesh extends THREE.Mesh`. `instanceof THREE.Mesh` is `true` for an InstancedMesh. After ADR-046 coalescing, curtain-wall panels that have NOT been merged into the global IM still appear as hidden InstancedMeshes in the Group. `firstMesh()` may return one of these InstancedMeshes. The BVH is then built for `instancedMesh.geometry` (the raw panel geometry, NOT accounting for per-instance matrices), and `raycaster.intersectObject(instancedMesh, false)` uses THREE's built-in InstancedMesh raycast (not BVH-accelerated, because BVH patches `Mesh.prototype.raycast` but InstancedMesh overrides `raycast` and doesn't invoke `super`). All instances thus appear at the origin of the IM — picks in world-space panel positions will miss.

**Fix:** Explicitly exclude InstancedMesh in `firstMesh` and add a separate `InstancedMesh` raycast path:
```ts
if (child instanceof THREE.Mesh && !(child instanceof THREE.InstancedMesh)) found = child;
```
And add an `intersectAll` loop that collects intersections across ALL meshes in the Group, not just the first.

### HIGH-4 · BVH `pickRectInternal` uses AABB screen-projection, not frustum culling — produces false positives

**File:** `packages/picking/src/bvh-pick.ts:182-211`

```ts
tmpBox.setFromObject(mesh);
const screenBox = projectBoxToScreen(tmpBox, ctx);
if (!rectsOverlap(rect, screenBox)) continue;
// → element is included
```

`setFromObject(mesh)` computes the world-space AABB. `projectBoxToScreen` projects 8 AABB corners into screen space and returns their bounding rect. For a diagonally-oriented element (a 45° beam, a staircase handrail, a curtain-wall at an angle), the projected screen rect can be up to `√2` wider than the element's actual screen footprint. Elements whose screen rect _overlaps_ the selection rect but whose actual geometry is _entirely outside_ the selection rect will be included. For box-select operations (the primary use case of `pickRect`), this produces false selections of nearby diagonal elements.

The correct implementation for `pickRect` in the BVH path is a frustum-based culling using the four edge planes of the selection rect unprojected through the camera. `three-mesh-bvh` supports frustum intersection natively via `bvh.intersectsFrustum(frustum)`.

---

## Part 4 — Camera / Projection

### Assessment — NDC ↔ world unprojection

`ndcToWorldPos` (`gpu-pick.ts:707`):
```ts
return new THREE.Vector3(ndcX, ndcY, ndcZ).unproject(camera);
```

This uses `THREE.Vector3.unproject(camera)` which computes:
```
world = (projectionMatrix × viewMatrix)^{-1} × NDC
```
This is correct for both perspective and orthographic cameras as THREE maintains the inverse matrices automatically.

`unpackRGBAToDepth` (`gpu-pick.ts:694`):
```ts
return (r / 255) / 1.0
     + (g / 255) / 255.0
     + (b / 255) / 65025.0
     + (a / 255) / 16581375.0;
```
This mirrors THREE's `UnpackDepthRGBA` macro exactly. **Correct.**

### MEDIUM-4 · Depth render target uses RGBA8 — precision loss on deep scenes

**File:** `packages/picking/src/gpu-pick.ts:82-94, 466-470`

The `DEPTH_PACK_MATERIAL` encodes `gl_FragCoord.z` (linear NDC depth) into 4×8-bit channels via `packDepthToRGBA`. This gives 32-bit depth precision when packed, but `readRenderTargetPixels` into a `Uint8Array` forces RGBA8 format — the read-back is 8 bits per channel. The effective depth precision is therefore ≈ 24 bits (R=high, G=mid, B=low, A=lowest). For a scene with `near=0.1, far=10000` (typical BIM scene), z-fighting between surfaces less than `10000 / 2^24 ≈ 0.0006m` apart (< 1mm) will cause incorrect depth sorting. For most BIM use cases (elements are tens of millimetres apart) this is acceptable, but for co-planar annotation overlays on wall faces it will produce wrong `distance` values and incorrect depth sort in `pickRectInternal`.

### LOW-1 · Pick render target is DPR-agnostic and fixed at 256×256

**File:** `packages/picking/src/gpu-pick.ts:98-101; apps/editor/src/engine/initTools.ts:272`

The default 256×256 RT is correct for correctness but coarse for precision. On a 2560×1440 viewport, each pick pixel covers (2560/256)×(1440/256) ≈ 10×5.6 CSS pixels. A click on the midpoint of a pixel boundary between two adjacent thin elements (dimension line, handrail) will resolve to whichever element occupies the RT pixel that contains the click — a spatial error of up to ±10px. The `GpuPickOptions.targetWidth/targetHeight` options exist but are not used in `initTools.ts`. The target size should scale with viewport size (e.g., min(viewport, 1024)) capped at the implementation limit.

---

## Part 5 — Semantic / Geometry Consistency

### HIGH-5 · `syncPickScene` uses `updateMatrixWorld(false)` on the simple-Mesh path — stale transforms possible

**File:** `packages/picking/src/gpu-pick.ts:569`

```ts
// Simple Mesh / Group path
obj.updateMatrixWorld(false);               // ← force=false
entry.clone.matrix.copy(obj.matrixWorld);
entry.clone.matrixAutoUpdate = false;
```

Compare with the InstancedMesh path (`gpu-pick.ts:616`):
```ts
root.updateMatrixWorld(true);               // ← force=true (correct)
src.updateWorldMatrix(true, false);
```

`updateMatrixWorld(false)` means "only update if the dirty flag is set". In CRDT-driven collaborative editing (Yjs), a remote peer's position change is applied by writing directly to `matrix` / `matrixWorld` on the THREE object via the scene committer. If the committer writes `matrixWorld` directly without calling `position.set()` (which is what triggers THREE's dirty flag on the parent), the dirty flag is never set. The next `syncPickScene` call sees `force=false`, skips the update, and the pick clone remains at the previous position. Picks on moved elements will return the wrong element ID or miss entirely.

**The InstancedMesh path is correct** (`force=true`) and the simple-Mesh path must match.

### HIGH-6 · `extractGeometry` and `firstMesh` share the same DFS-first-found problem

**File:** `packages/picking/src/gpu-pick.ts:660-670`

```ts
function extractGeometry(obj): THREE.BufferGeometry | null {
  obj.traverse((child) => {
    if (found !== null) return;
    if (child instanceof THREE.Mesh) found = child.geometry;
  });
  return found;
}
```

This is identical in structure to `bvh-pick.ts:firstMesh()`. For a wall Group with `[frameMesh, faceMesh]`, the GPU pick clone is built from `frameMesh.geometry` (the narrow frame), not `faceMesh.geometry` (the wide visible face). A click on the wall face body will read a pick pixel corresponding to the frame clone, which may not cover the face body. The face body has no pick clone at all — clicks on it return `slot=0` (no hit).

### MEDIUM-5 · InstancedMesh pick-clone count mismatch on grow — stale instance matrices

**File:** `packages/picking/src/gpu-pick.ts:646`

```ts
const count = Math.min(clone.count, src.count);
```

`refreshInstancedPickClone` silently clamps to the minimum of clone count and source count. If a curtain-wall gains panels (e.g., user stretches wall width → more panels), `src.count > clone.count` — the extra panels are never added to the pick clone. They are visually present in the main render but invisible to the pick system. Clicks on the new panels return "no hit". The pick clone must be rebuilt (not refreshed) when `src.count !== clone.count`.

---

## Part 6 — Picking Architecture

### Assessment — PickStrategy interface (GOOD)

The `PickStrategy` interface is well-designed: both strategies implement `pick`, `pickRect`, `probeAvailability`, and `dispose`. The resolver is a pure function (not a class), returns a stable strategy, and correctly emits the `pryzm.picking.gpu-pick.unavailable` span event.

### CRITICAL-2 · GPU pick `probeAvailability` does not validate actual pixel readback — R1C-02 Mesa bug unmitigated

**File:** `packages/picking/src/gpu-pick.ts:146-167`

```ts
probeAvailability(ctx: PickContext): PickProbeResult {
  try {
    const rt = ctx.renderer.createRenderTarget(1, 1);
    const probeBuf = new Uint8Array([1, 2, 3, 255]);
    ctx.renderer.readPixels(rt, 0, 0, 1, 1, probeBuf);
    // "only verify the renderer accepted the call"
    return { ok: true };
  } catch (err) { … }
}
```

The comment explicitly acknowledges the R1C-02 Mesa bug: _"The R1C-02 quirk silently leaves the buffer all zero ON ALL RTs even after a successful render"_ and defers validation to _"first-pick"_. But there is **no first-pick validation**. `pickInternal` calls `decodeRGBAToIndex` on whatever `readPixels` returns. If Mesa silently zeroes the buffer, every decode returns `slot=0`, `pick()` returns `null`, and selection silently fails on every click — with no fallback to BVH, no error, no telemetry.

The probe MUST render a known element into the RT and verify readback before returning `ok=true`:

```ts
// Render a unit mesh at (0,0,0) with colour [1,2,3,255] into a 1×1 RT.
// If readback returns [1,2,3,255] → driver is healthy.
// If readback returns [0,0,0,0]  → R1C-02 Mesa bug → return { ok: false }.
```

### HIGH-7 · Slot index monotonic growth — no free-list; exhaustion at 2²⁴−1 elements

**File:** `packages/picking/src/gpu-pick.ts:130, 553`

```ts
private nextSlot = 1;
…
const slotIndex = this.nextSlot++;
```

When an element is removed, its slot is deleted from `indexToId` but `nextSlot` is never decremented. The slot is permanently lost. `encodeIndexToRGBA` returns `[0,0,0,0]` (no-hit sentinel) for any `index >= 0x1000000`. In a long-running session (automated AI-driven wall placement-and-deletion, or a large IFC import that creates 50k walls then undoes them), slots accumulate. At 16 million allocations the pick system silently stops assigning IDs to new elements — they are invisible to picking with no error or warning.

**Fix:** Maintain a free list:
```ts
private freeSlots: number[] = [];

private allocateSlot(): number {
  return this.freeSlots.length > 0 ? this.freeSlots.pop()! : this.nextSlot++;
}

// In remove path:
this.freeSlots.push(entry.slotIndex);
```

### MEDIUM-6 · `as any` cast at the strategy call site bypasses all PickContext type safety

**File:** `apps/editor/src/engine/initTools.ts:272`

```ts
const _strategy = resolvePickStrategy(_probeCtx as any);
```

The cast suppresses the TypeScript error caused by the inline renderer adapter not conforming exactly to `GpuPickRenderer`. Because `PickContext.renderer` is typed as `GpuPickRenderer | undefined`, and `_probeCtx.renderer` is an anonymous object literal, the `as any` silences two distinct issues:
1. The renderer object may not satisfy the `GpuPickRenderer` interface (checked at compile time but bypassed here).
2. The `viewportWidth/viewportHeight` stale-snapshot issue (CRITICAL-2 above) is invisible to TypeScript.

A proper typed adapter class (implementing `GpuPickRenderer`) for `THREE.WebGLRenderer` should exist in `packages/renderer-three/src/adapters/WebGLRendererAdapter.ts` and be used here — not an inline anonymous object with an `as any` escape hatch. This adapter appears to be planned (referenced in `important_files` in the codebase notes) but not yet connected.

---

## Part 7 — GPU / Render Synchronisation

### Assessment — Pick render pass timing (ACCEPTABLE WITH CAVEATS)

The GPU pick pass runs inside `pick()` / `pickRect()` which is called from a user input handler (pointer event callback), outside the main `rAF` loop. THREE.js renders to the main framebuffer in the `rAF` loop. Both paths share the same `WebGLRenderer` instance. Because JavaScript is single-threaded and the pick call happens between `rAF` frames, there is no true GPU write-write race. However:

### HIGH-8 · Pick render pass uses `overrideMaterial` via `as any` — not context-safe

**File:** `apps/editor/src/engine/initTools.ts:261-264`

```ts
r.setRenderTarget(target);
(r as any).overrideMaterial = mat;     // ← bypasses THREE.WebGLRenderer type
r.render(scene, camera);
(r as any).overrideMaterial = prevMat;
r.setRenderTarget(prev);
```

`THREE.WebGLRenderer.overrideMaterial` is a documented public property — the `as any` is unnecessary and dangerous. More critically: if `r.render(scene, camera)` throws an exception (e.g., shader compile error on first GPU pick), the `overrideMaterial` is never restored. The next main-render frame will render the entire visible scene with the pick colour-encode material (flat RGB with element IDs), producing a frame of coloured pixels visible to the user before the next frame corrects it.

**Fix:** Use a try/finally:
```ts
r.setRenderTarget(target);
(r as THREE.WebGLRenderer).overrideMaterial = mat;
try {
  r.render(scene, camera);
} finally {
  (r as THREE.WebGLRenderer).overrideMaterial = prevMat;
  r.setRenderTarget(prev);
}
```

Or better: use the typed `WebGLRendererAdapter` (see MEDIUM-6).

### MEDIUM-7 · Pick render targets not invalidated on WebGL context loss

**File:** `packages/picking/src/gpu-pick.ts:133-138, 460-470`

```ts
private renderTarget: THREE.WebGLRenderTarget | null = null;
private depthTarget:  THREE.WebGLRenderTarget | null = null;
```

After a WebGL context loss/restore cycle, all GPU resources (textures, render targets, programs) become invalid. `RendererHandle.onContextLost` and `onContextRestored` exist specifically for this case (C04 §1.4). `GpuPickStrategy` does not register any context-loss listener. After context restore, `ensureRenderTarget` returns the stale handle (it is non-null), `readPixels` reads from an invalid RT, and the result is undefined (likely all zeros — CRITICAL-2 silent-null path again).

**Fix:**
```ts
constructor(opts, renderer: GpuPickRenderer) {
  renderer.onContextLost(() => {
    this.renderTarget = null;
    this.depthTarget  = null;
  });
}
```

### MEDIUM-8 · No resize handler — pick RT and viewportWidth never updated after window resize

This is the render-synchronisation manifestation of HIGH-2. The pick RT is sized at 256×256 (DPR-agnostic, acceptable), but `ctx.viewportWidth/viewportHeight` frozen at boot means the screen→RT coordinate mapping uses wrong denominators after resize. On a split-panel editor where the 3D viewport can be resized mid-session, this means the pick offset drifts progressively further from the cursor.

---

## Part 8 — Contract Compliance Summary

| Contract | Clause | Status | Finding |
|---|---|---|---|
| C04 §1 | Single THREE owner via RendererHandle | ⚠️ PARTIAL | `(r as any).overrideMaterial` bypasses typed boundary |
| C04 §1.4 | Context-loss handling | ❌ MISSING | No `onContextLost` listener in `GpuPickStrategy` |
| C04 §3 | GPU pick as default, O(1) ID readback | ✅ OK | Implemented correctly |
| C04 §3.2 | Depth-sorted pickRect results | ✅ OK | `results.sort((a,b) => a.distance - b.distance)` |
| C11 §3.2 | Tools dispatch via `commandBus.dispatch` with `{source:'user'}` | ❌ MISSING | Legacy `executeCommand` used, no source tag |
| C11 §3.3 | Dispatch on `pointerup`, not `pointerdown` | ❌ BROKEN | `pointerdown` fires dispatch — orbit breaks selection |
| ADR-046 | InstancedMesh pick resolution | ✅ OK | `syncPickScene` handles hidden IMs with per-instance world-space clones |
| ADR-0015 | Boot-time gpu→bvh fallback | ✅ OK | `resolvePickStrategy` + OTel span |

---

## Part 9 — Risk Register

| ID | Severity | Area | Description | Repro |
|---|---|---|---|---|
| R01 | **CRITICAL** | Selection | `pointerdown` dispatch breaks selection on every camera orbit | Click any element, immediately orbit → selection lost |
| R02 | **CRITICAL** | GPU pick | Mesa R1C-02 readback bug not detected by probe → silent all-miss | Any Intel/Mesa VM driver |
| R03 | **HIGH** | Coordinate | Static `viewportWidth/Height` snapshot → picks offset after resize | Open editor, resize panel, click wall |
| R04 | **HIGH** | GPU pick | `overrideMaterial` not restored on exception → one corrupted frame | Any shader compile error on first pick |
| R05 | **HIGH** | BVH | `firstMesh()` returns frame geo not face geo → wall face not pickable | BVH path (headless / no-GPU), click wall face body |
| R06 | **HIGH** | BVH | InstancedMesh returned by `firstMesh` → BVH built on wrong geo, picks miss | Any curtain-wall in BVH mode |
| R07 | **HIGH** | Transform | `updateMatrixWorld(false)` on simple-Mesh path → stale CRDT-updated positions | Remote peer moves wall → pick still hits old position |
| R08 | **HIGH** | Pick slot | No free-list → slot exhaustion at 2²⁴−1 in long sessions | Automated wall create/delete loop × 16M |
| R09 | **HIGH** | InstancedMesh | `refreshInstancedPickClone` clamps count — new panels invisible to pick | Stretch curtain-wall to add panels |
| R10 | **HIGH** | Command | No `{source:'user'}` tag → selection commands not on user undo stack | Select wall, Ctrl-Z → undo skips selection |
| R11 | **MEDIUM** | Context loss | Pick RTs not invalidated on WebGL context loss | Tab backgrounded on integrated GPU → context loss |
| R12 | **MEDIUM** | BVH rect | AABB screen-projection false positives for diagonal elements | Box-select near diagonal beams |
| R13 | **LOW** | Precision | 256×256 RT quantization → ±10px error on 2560px viewport | Click near boundary of two close thin elements |

---

## Part 10 — Recommended Remediation Order

### Sprint S-PICK-1 (Blockers — ship nothing that touches selection until these land)

1. **R01** Fix `SelectionTool` to use `pointerdown`/`pointermove`/`pointerup` with drag-distance guard.  
2. **R10** Replace `SelectionCommandBus.executeCommand` with `commandBus.dispatch(…, { source:'user' })`.  
3. **R04** Wrap `renderToTarget` in try/finally to guarantee `overrideMaterial` restore.

### Sprint S-PICK-2 (Correctness — coordinate and transform accuracy)

4. **R03** Make `PickContext` construction happen at pick call time (fresh `clientWidth/Height`). Remove `|| 1280` fallback.  
5. **R07** Change `updateMatrixWorld(false)` to `updateMatrixWorld(true)` on the simple-Mesh path in `syncPickScene`.  
6. **R09** Rebuild InstancedMesh pick clone when `src.count !== clone.count` instead of silent clamp.

### Sprint S-PICK-3 (Robustness — driver + session longevity)

7. **R02** Implement proper GPU pick probe: render a known element, verify readback ≠ all-zero before returning `ok:true`. If zero, fall through to BVH (not silent all-miss).  
8. **R11** Register `onContextLost` handler in `GpuPickStrategy` to null out render targets.  
9. **R08** Implement slot free-list in `GpuPickStrategy`.

### Sprint S-PICK-4 (Architecture cleanup)

10. **MEDIUM-6** Implement `WebGLRendererAdapter` as a typed class implementing `GpuPickRenderer`. Remove `as any` casts.  
11. **HIGH-3/6** Refactor `firstMesh()` / `extractGeometry()` to return ALL meshes in a Group, with explicit InstancedMesh exclusion. Add full-Group raycast in BVH path.  
12. **HIGH-4** Replace AABB screen-projection in `BvhPickStrategy.pickRectInternal` with proper frustum culling via `bvh.intersectsFrustum`.  
13. **LOW-1** Scale GPU pick RT size to `min(viewportWidth, 1024) × min(viewportHeight, 1024)` at pick time.

---

## Appendix A — File-to-Finding Cross-Reference

| File | Findings |
|---|---|
| `plugins/selection/src/tool.ts` | CRITICAL-1 (pointerdown), HIGH-1 (executeCommand), MEDIUM-1 (drag race) |
| `apps/editor/src/engine/initTools.ts` | HIGH-2 (static viewport), MEDIUM-2 (DPR mismatch), MEDIUM-6 (as any), HIGH-8 (overrideMaterial) |
| `packages/picking/src/gpu-pick.ts` | CRITICAL-2 (probe), HIGH-5 (updateMatrixWorld), HIGH-6 (extractGeometry), HIGH-7 (slot exhaustion), HIGH-9 (IM count clamp), MEDIUM-3 (depth coords), MEDIUM-4 (depth precision), MEDIUM-5 (IM count clamp), MEDIUM-7 (context loss), LOW-1 (RT size) |
| `packages/picking/src/bvh-pick.ts` | HIGH-3 (firstMesh IM), HIGH-4 (AABB rect), HIGH-3B (multi-mesh groups) |
| `packages/picking/src/PickStrategyResolver.ts` | (correct as written) |
| `packages/picking/src/types.ts` | MEDIUM-6 (scene optional) |
| `packages/renderer-three/src/RendererHandle.ts` | MEDIUM-7 (onContextLost contract) |

---

*Audit produced: 2026-05-15. All line numbers reference the current main branch. No code was modified during this audit.*
