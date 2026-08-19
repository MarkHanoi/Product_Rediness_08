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

> Folded into C04 §7 (`§GPU-RESOURCE-LIFETIME`) on 2026-08-07.

New **§GPU-RESOURCE-LIFETIME**, normative:

1. **L1 Ownership** and **L2 Ordering**, verbatim as above.
2. `RenderPipelineManager.render()` is the **sole drain point** for deferred GPU releases.
3. *A render failure must be classified before it is retried; a retry that cannot repair the fault class is a defect, not a mitigation.*
4. *Error suppression must be accounted and must escalate on a burst; silent suppression of a resource-lifetime symptom is itself a defect.*

---

## Amendments (2026-08-07) — the holes this ADR left open, closed

The founder still lost the scene after `3508baae` shipped. Three L2 (ordering) gaps, none
in a place this ADR looked, all closed by `7bccefd5` (re-landed as `e56f2972` after an
interim revert) and `da27ea8d`:

1. **The instancing renderer, not just the builders** (`7bccefd5`). This ADR enumerated
   element BUILDERS; a furniture type change re-registers under a NEW geometry hash and
   `InstanceGroup.dispose()` destroyed the old group's index buffers synchronously inside
   `execute()` — beneath EVERY instanced element class (hence the identical crash on stair
   railings). `InstanceGroup.dispose()` now defers the GPU free to the frame boundary;
   slot bookkeeping still clears immediately.
2. **Detection must not depend on the fault throwing** (`7bccefd5`). A WebGPU VALIDATION
   error (`Destroyed texture … used in a submit`) does not throw and does not reject —
   `render()` returned normally and the user got a blank viewport with no error.
   `RenderPipelineManager` now subscribes to `GPUDevice.uncapturederror` and routes it
   through the SAME `isDestroyedGpuResourceError` classifier and the SAME
   one-reconstruction policy. Coalescing is per-channel.
3. **A `setTimeout(…, 0)` is a GUESS at a frame boundary** (`da27ea8d`,
   `§GPU-RESOURCE-LIFETIME` free side). `ShadowQualityUpgrader._deferReleaseShadowMap`
   disposed the old shadow target on a macrotask: (a) a WebGPU `Queue.submit()` is
   asynchronous, so a macrotask can fire mid-submit; (b) it consulted NOTHING — it fired
   straight through the pipeline's own shadow-rebuild guard, two drivers reallocating one
   resource with no ordering (exactly ADR-0302 §3). The release now goes through
   `scheduleGpuRelease()` (which gained a render-target branch, checked BEFORE texture),
   drained by `RenderPipelineManager.render()` at the TOP of a frame — the one instant at
   which the previous frame is fully submitted and the next has not begun encoding.
4. **The one-reconstruction policy now REFUSES what it cannot repair** (`da27ea8d`,
   ADR-0299 applied to our own recovery). A light's `LightShadow.map` is owned by the
   LIGHT and reallocated by THREE's shadow pass — unreachable from `_rebuildPipeline()`,
   so the "ONE immediate reconstruction" burned a multi-second rebuild and failed anyway,
   twice. `isShadowResourceError()` classifies it and the handler DECLINES the
   reconstruction, failing loudly at once. A pipeline-owned target still earns its one
   reconstruction.
5. **The forbidden lever, pinned where it is actually called** (`7bccefd5`). This ADR
   forbade recovery via `onProjectSwitch()` but pinned the rule only inside
   `RenderPipelineManager`; `ViewportCrashGuard` went on calling it. New
   `recoverFromRenderFailure()` drives the real rebuild and returns `false` when there is
   nothing to rebuild. The same never-audited-under-the-rule failure also held for
   **resize**: the `ResizeObserver` → `onProjectSwitch()` subscription rebuilt the whole
   pipeline (submits paused, 834–1 862 ms) on every panel toggle — that is
   **`§RESIZE-IS-NOT-A-PROJECT-SWITCH`**, governed by **ADR-0302 §2** (one owner per GPU
   resource: ADR-0302 §3) and implemented by `7131835c` + `4f75386a`
   (`RenderPipelineManager.onViewportResize()` does only `_reconcileRenderSize()`).
   Both are `§FIX-ONCE-IMPORT-EVERYWHERE` instances (ADR-0306): a rule about a lever must
   be audited at every caller of the lever.

---

## Amendment (2026-08-19, lane GPU1, L-1290) — the ordering was RIGHT and still had to be REMEMBERED

The founder lost the viewport to `Destroyed texture [Texture "ShadowDepthTexture"] used in a
submit` **five times in one week**, most recently on *"change a RAILING to this MATERIAL"* — one
day after the same crash on *"change a handrail TYPE"* was closed. Nothing in L1/L2 was wrong.
What was wrong is the shape of the answer to one question.

### The question, and why the old answer kept rotting

*"Which mutation changes the shadow CASTER SET, so the ordering window must open?"*

Until now that was answered by **enumeration**: `apps/editor/src/engine/geometryMutationEvents.ts`
lists the `bim-*` events known to lead there (§GEOM-CASTER-EVENT-CHOKEPOINT, L-1189 — itself the
fix for the SAME list existing twice as two diverged literals). That list is gated, disjoint and
complete against the event catalogue, and it is still a **remembered** rule: it only covers a
mutation that ANNOUNCES ITSELF as a classified per-family event.

Measured, a railing MATERIAL change does not fit that shape at all. It runs
`PropertyRenderer` (the C100 picker) → `PropertyPanel.onApply()` → the **generic**
`element.updateParameters` verb → `UpdateElementParameterCommand` → the generic
`store.update?.(id, parameters)` tail. There is no material-, finish- or parameter-named event
in `packages/event-bus/src/catalog.ts` at all. **A per-family event list is the wrong shape for
a generic parameter bridge**, and the next generic bridge will be wrong the same way.

### The derived answer

Every element builder frees its meshes through `scheduleGpuRelease` /
`detachAndReleaseChildren` — because **this ADR made that the only legal way to free
element-owned GPU memory** (76 call sites). So the instant a shadow caster is actually
released is observable in the funnel, with no cooperation from the route that caused it.

`scheduleGpuRelease` now checks the released subtree for a `castShadow` mesh (iterative,
early-exit, bounded by the ELEMENT's mesh count — never the scene's) and notifies the frame
owner once per release batch. `RenderPipelineManager` claims that slot in `bind()`, opens the
same submit-pause + freeze window `runShadowCasterMutation` defines, and closes it in
`render()` immediately after the boundary drain — deferred, so the frame that drained stays
unsubmitted. **§GPU-CASTER-RELEASE-CHOKEPOINT**, folded into C04 §3.1.2a rules 6–8.

### What this amendment costs, and what it does not establish

- **The funnel's completeness is now load-bearing, not merely tidy.** §Scope above listed eight
  builders with the dispose-before-detach pattern as "untouched here". One of them —
  `StairLandingBuilder.removeLanding` — was still disposing in place, which means it bypassed
  the derivation silently. Fixed, and the builder-scoped census (8 sites / 5 files → 6 / 4) is
  now a shrink-only gate rather than a paragraph.
- **The pause is bounded.** ADR-0299 / §RECOVERY-MUST-REFUSE established that a repair which
  cannot work must decline. The inverse applies to a guard: an unbounded submit pause is a dark
  viewport, so the window caps at 8 consecutive frames and degrades.
- ⚠ **NOT ESTABLISHED: which destroyer fired in the founder's session.** Reading three r183,
  there are at least three candidates that dispose a `ShadowDepthTexture` synchronously inside
  `render()` — `ShadowNode.setup`'s `_reset()` on a `renderer.shadowMap.type` change,
  `AnalyticLightNode.setup`'s `shadowNode.dispose()` when `light.castShadow` is false at compile
  time, and `ShadowNode.renderShadow`'s `shadowMap.setSize`. Distinguishing them needs a
  browser. The fix does not depend on the answer — all three require the same precondition (a
  caster teardown reaching the GPU unordered against submission) — but *"we know which one"* is
  **not** what this amendment establishes, and should not be written down as if it were.
- ⚠ **The enumeration is RETAINED, not replaced.** The two arms fail differently (the event arm
  covers a mutation that changes `castShadow` without releasing anything; the release arm covers
  a route that announces nothing). Neither has been shown to subsume the other, so deleting
  either on the strength of the other would be a claim nobody has measured.

**Verification:** `packages/renderer-three/__tests__/casterReleaseChokepoint.test.ts` (10 pass) ·
`apps/editor/__tests__/handrailMaterialCasterRelease.test.ts` (5 pass, drives the real command +
real store + real builder; reverting either fix fails 3 of the 5) · `packages/renderer-three`
tsc RC=0.
