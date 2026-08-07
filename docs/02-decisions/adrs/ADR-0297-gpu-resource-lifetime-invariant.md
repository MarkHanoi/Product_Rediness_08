# ADR-0297 — GPU resource lifetime: ownership and ordering

| Field | Value |
|---|---|
| **Status** | Accepted — 2026-08-06 |
| **Tag** | `§GPU-RESOURCE-LIFETIME` |
| **Owner** | Render pipeline |
| **Closes** | Founder, 2026-08-06: *"During element creation — SOFAS — the SCENE GOT BLOCKED. I needed to swap to WebGL."* — `PIPELINE_FAILURE reason="Failed to execute 'setIndexBuffer' on 'GPURenderPassEncoder': parameter 1 is not of type 'GPUBuffer'"` immediately after `CHANGE_FURNITURE_TYPE` |
| **Extends** | ADR-0085 (§I2 WebGPU-safe disposal seam) — same file, new layer |
| **Related** | ADR-0087 (§RPM-RECOVERY-DOWNGRADE), L-663 (unbounded recovery loop), §FIX-DELETED-TEXTURE-BIND, L-691 |
| **Constraints** | C04 §1.1 (P2 — THREE only in `packages/renderer-three/`), C04 §2 (frame ownership), C11 (element-mutation → rebuild) |
| **Implemented by** | `3508baae` |

---

## Context

**ADR-0085 stopped the THROW. It never stopped the RELEASE.** That distinction is the whole of this ADR.

`safeDispose*` was introduced so that a WebGPU `usedTimes` `TypeError` could not abort a builder's `rebuild()`. It works, and it is still correct for what it covers. But `FurnitureFragmentBuilder.updateFurniture()` was **fully §I2-compliant and still killed the scene** — because throw-tolerance says nothing about *whether the resource should have been released at all*.

### The mechanism, traced end to end (three@0.183.2)

`FurnitureFragmentBuilder.updateFurniture()` (pre-fix, L161–181) traversed the **live, still-parented** subtree calling `geometry.dispose()` / `material.dispose()` on every child, and only *afterwards* called `root.clear()`. `removeFurniture()` had the identical inversion — dispose, *then* `scene.remove(root)`.

On the WebGPU backend that is fatal, synchronously:

1. `BufferGeometry.dispose()` → `Geometries.initGeometry`'s `onDispose` listener (`three/src/renderers/common/Geometries.js:185–216`)
2. → `Attributes.delete(index)` (`Attributes.js:38–50`) → `backend.destroyAttribute` — the per-attribute record is **deleted** and the `GPUBuffer` **destroyed**
3. `WebGPUBackend.draw` then reads `const buffer = this.get( index ).buffer` (`WebGPUBackend.js:1541`). `DataMap.get` returns a bare `{}` once the record is gone, so `buffer === undefined`
4. → **`setIndexBuffer … parameter 1 is not of type 'GPUBuffer'`** — the founder's exact message.

**Nobody owned the ordering.** The mutation runs on a DOM listener (`initBuilders.ts:789`, `bim-furniture-updated` → `_safeFurnitureUpdate` → `updateFurniture`), dispatched synchronously from `FurnitureStore.update()` inside `ChangeFurnitureTypeCommand.execute()`. That path has **no relationship to the frame boundary**; the frame loop lives in `UnifiedFrameLoop` → `RenderPipelineManager.render`. Disposal was therefore neither mid-frame-safe nor deferred — the window was simply always open.

### A second, independent fault in the same three lines

`isCachedMaterial()` (`MaterialService.ts:9`) only knew `MaterialService`'s own `cachedMaterials` set. `geometry-furniture` has **six other module-level caches** (`KitchenCabinetEngine`, `WardrobeCabinetEngine`, `ParametricTreeEngine`, `foliageCards` ×3, `AIElementEngine`). Every material they hand out failed the membership test and was **disposed out from under every sibling element still drawing it** — while the cache went on handing out the dead handle. On WebGPU `material.dispose()` → `RenderObject.onMaterialDispose` → `renderObject.dispose()`, which is precisely where the sibling `usedTimes` throw originates.

A third instance was latent: the builder disposed the very materials it had just handed to `_instanceBridge.register()`, which routes them through `SharedMaterialCache.dedupInstanceMaterial` — so the disposed material could be the **canonical** material for an entire `InstanceGroup`.

---

## Decision

Two invariants, enforced in `packages/renderer-three/src/safeDispose.ts` (the sole THREE owner, per P2).

> **L1 — OWNERSHIP.** A GPU resource handed out by a cache is owned by that cache and MUST NOT be released by an element teardown.
> ***"It is not in MY cache" is not evidence of exclusive ownership — it is only evidence of ignorance about the other caches.***
> Ownership is recorded **on the resource**, not inferred from a per-builder membership test.

> **L2 — ORDERING.** A GPU resource may only be released AFTER (a) every `Object3D` referencing it has been detached from the render graph, and (b) the frame that last referenced it has finished encoding and submitting.
> An element mutation therefore **DETACHES on its own tick and RELEASES at the next frame boundary** — it never disposes in place.

**API:** `markSharedGpuResource` / `isSharedGpuResource` (every `safeDispose*` no-ops on a stamped resource); `scheduleGpuRelease` / `drainGpuReleaseQueue` / `pendingGpuReleaseCount` / `detachAndReleaseChildren`; `isDestroyedGpuResourceError`.

`RenderPipelineManager.render()` is the **single** drain caller — the frame owner owns the boundary (C04 §2) — and drains **before every early return**, so the queue cannot grow while the viewport is collapsed or suspended.

### Relationship to ADR-0085 — two layers, one seam

These compose deliberately and must not be merged:

| | ADR-0085 `safeDispose*` | ADR-0297 (this) |
|---|---|---|
| Question | The resource is genuinely dead — does `dispose()` throw? | **Is the resource dead at all?** |
| Concern | Safe teardown of an **already-detached** graph | **Ordering** (still in a draw list?) and **ownership** (does someone else own it?) |

`drainGpuReleaseQueue()` releases *through* `safeDisposeObject3D`, so throw-safety applies to every deferred release; `markSharedGpuResource` makes all `safeDispose*` helpers no-op on cache-owned resources.

⚠ **This explains a previously confusing observation:** `§FIX-FURNITURE-USEDTIMES` was already applied throughout `FurnitureFragmentBuilder` and the scene still died. The builder was correctly *not throwing* while destroying live buffers.

---

## Consequences

- Element mutations may run on any tick; the frame owner decides when memory is actually freed.
- **Retry is now fault-classified.** Shader-compile → downgrade (ADR-0087); destroyed-resource → **one** immediate reconstruction, then **loud failure** (`phase='error'`); everything else → the existing ladder.
- ⚠ **Recovery for this class MUST use `_rebuildPipeline()`, NEVER `onProjectSwitch()`.** `onProjectSwitch()` explicitly defers the pipeline rebuild to `onProjectLoaded()` — but by then `render()` has already set `_hasPipelineError = true` and nulled `_renderPipeline`, so routing recovery through it prints a confident recovery message and leaves the viewport **permanently dark with no error**. It is the habitual "soft recovery" lever in this codebase and **it does not do what its callers assume.** Pinned by a named regression test rather than by inspection.
- Suppression in `ViewportCrashGuard` is accounted and escalates on a burst (>12 in 2 s). Previously `KNOWN_NONFATAL_KEYWORDS = ['usedtimes']` suppressed with `preventDefault()`, no counting and no ceiling, and `_isRenderRelated()` returned `false` for anything containing it — so it could *never* escalate. Sound for one stale-session teardown; wrong at volume.

### Why the old retry could not have worked

`RenderPipelineManager.ts:747–759` rebuilds the **post-FX pipeline**. The damage is in the **renderer's** `Attributes` / backend `DataMap`s — a different object graph entirely. Three attempts at 500/1000/2000 ms were all guaranteed to fail. *A retry that cannot repair the fault class is a defect, not a mitigation* — the user waits instead of being told.

---

## Scope beyond this change (follow-up, tracked as L-691)

The **dispose-before-detach** pattern is not furniture-specific. Confirmed same-shape sites, untouched here: `WallFragmentBuilder`, `DoorBuilder`, `WindowBuilder`, `SlabFragmentBuilder`, `CeilingPanelBuilder`, `RoofFragmentBuilder`, `ColumnFragmentBuilder`, `CurtainWallBuilder` — the eight listed by ADR-0085.

**The real scope is every element rebuild.** The seam was therefore built general (`detachAndReleaseChildren` / `scheduleGpuRelease`) and wired only to furniture. Migrating the other seven is mechanical: `traverse+dispose; clear()` → `detachAndReleaseChildren(root)`.

Corroborating evidence from the same session: `bindTexture: attempt to use a deleted object` ×251 after a slab batch is the **WebGL2 sibling** of the same bug on a different resource kind — which is why `scheduleGpuRelease` handles textures and `isDestroyedGpuResourceError` matches `deleted object`.

⚠ **Distinct from `64f431f6`** (curved stair allocating meshes/materials per riser). That was device-loss by **volume**; this is **use-after-dispose**. Same symptom class, unrelated mechanisms — do not merge them.

---

## Verification

| Suite | Result |
|---|---|
| `renderer-three/__tests__/gpuResourceLifetime.test.ts` | **20 pass** — ownership (shared material/geometry/texture survive teardown; element-owned still disposed; the sibling-kill regression) and ordering (nothing disposed on the mutation tick; `stillReachableAtDispose === false` captured *at* disposal; drain empties; a throwing dispose cannot strand the batch or kill the frame) |
| `renderer-three/__tests__/RenderPipelineManager.destroyedGpuResource.test.ts` | **8 pass** — no retry scheduled; reconstruction via `_rebuildPipeline` and **not** `onProjectSwitch`; exactly one attempt; recurrence → `phase='error'`; unrelated errors keep the ladder; drain at top of frame including on declined frames |
| `apps/editor/__tests__/ViewportCrashGuardSuppressionAccounting.test.ts` | **4 pass** |
| `packages/geometry-furniture` | **63/63** |
| `packages/renderer-three` (touched suites) | **42/42** |
| Root `npx tsc --noEmit` | zero errors in every file touched |

**Pre-existing, unrelated:** `renderer-three/__tests__/depth-buffer.test.ts` (3 failures) — its `vi.mock('three')` factory returns a non-constructible arrow under vitest 4.1.10. Unchanged since the initial commit; none of this change's files load in it.

---

## C04 amendment (to be folded into the contract)

New **§GPU-RESOURCE-LIFETIME**, normative:

1. **L1 Ownership** and **L2 Ordering**, verbatim as above.
2. `RenderPipelineManager.render()` is the **sole drain point** for deferred GPU releases.
3. *A render failure must be classified before it is retried; a retry that cannot repair the fault class is a defect, not a mitigation.*
4. *Error suppression must be accounted and must escalate on a burst; silent suppression of a resource-lifetime symptom is itself a defect.*
