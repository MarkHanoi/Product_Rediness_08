# ADR-0111 — Transient shadow suppression FREEZES the shadow map; it never clears `castShadow`

- Status: Accepted
- Date: 2026-07-02
- Tag: `§FIX-SHADOW-MIDSUBMIT-DESTROY` (nav path); `§FIX-SHADOW-LOAD-TIER-DESTROY` (load path — added 2026-07-02)
- Scope: `packages/renderer-three/src/pipeline/RenderPipelineManager.ts`,
  `apps/editor/src/engine/initScene.ts` (the `§PERF-NAV-LOD` nav gate + the shadow-realloc
  guard wiring + the whole-load freeze),
  `packages/core-app-model/src/rendering/RenderingPipelineCoordinator.ts` (the tier
  shadow-level realloc, now wrapped in the injected realloc guard),
  `packages/core-app-model/src/rendering/PascalSceneLighting.ts` (unchanged behaviour,
  now used only by the persistent heavy-tier gate).
- Supersedes the shadow-lifecycle portion of `§PERF-NAV-LOD` only. Extends, and stays
  consistent with, `§SHADOW-DEVICE-LOSS-FIX` (ShadowQualityUpgrader deferred disposes).

## Context (founder issue L-25)

On the WebGPU backend, creating a few walls while moving the mouse a lot and then
clicking turned the 3D view **black** and dropped every element from 3D (the 2D
Canvas2D plan still rendered). Console:

```
131× Destroyed texture [Texture "ShadowDepthTexture"] used in a submit.
     — While calling [Queue].Submit([CommandBuffer from CommandEncoder "renderContext_…"])
```

This is a WebGPU **device-loss cascade**: a shadow depth texture is destroyed while a
GPU submit that still references it is in flight → the device is lost → all pipelines
become invalid → "Rendering has stopped" → black viewport.

### Root cause

`§PERF-NAV-LOD` (heavy-nav perf) dropped the shadow pass during active camera/pointer
motion and restored it on settle. Its physical lever was
`PascalSceneLighting.setShadowsSuppressed()`, which flips `keyLight.castShadow`.

On the WebGPU backend, when a light stops casting, THREE's shadow renderer **destroys**
that light's `ShadowDepthTexture` inside the very next `rp.render()`. But the previous
frame's command buffer — which referenced that texture — may still be draining on the
GPU queue. Destroy-while-referenced ⇒ the error above. Rapid mouse motion made the nav
gate flip `castShadow` (motion-start → settle) every few frames, thrashing the
destroy/reallocate cycle until a submit collided with a destroy.

Note this is a genuine regression from the nav-LOD shadow work: `setShadowsSuppressed`
itself does not call `.dispose()` (it respects `§SHADOW-DEVICE-LOSS-FIX`), but the
`castShadow=false` flip lets **THREE** perform the destroy on its own schedule — mid
command-buffer, uncoordinated with the in-flight submit.

## Decision

Split transient vs. persistent shadow suppression, and change the transient (nav) lever
so it never lets a texture be destroyed:

1. **Transient (nav-LOD) suppression FREEZES the shadow map.** New
   `RenderPipelineManager.setShadowPassSuppressed(suppressed)` sets
   `renderer.shadowMap.autoUpdate = false` on the live WebGPU renderer. THREE then
   **reuses** the existing `ShadowDepthTexture` and skips the shadow-caster re-render —
   the pass is skipped (the intended perf win) but **nothing is allocated,
   reallocated, or destroyed**, so a mid-submit destroy is impossible. Restore sets
   `autoUpdate = true` + `needsUpdate = true` to refresh the frozen map exactly once
   against the settled scene. `castShadow` is left untouched throughout. WebGPU-path
   only; no-op on the WebGL2 fallback (which owns its own shadowMap).

2. **The nav restore is debounced** (settle window ~120 ms). A new motion burst
   (`controlstart`) cancels a pending restore, so rapid start/settle nudges keep the
   map frozen instead of forcing repeated shadow re-renders.

3. **Persistent (heavy-tier) suppression is decoupled and unchanged.** The
   `§PERF-HEAVY-SHADOW-OFF` gate (≥8000 casters / survival) still clears
   `keyLight.castShadow` via `PascalSceneLighting.setShadowsSuppressed()` — correct
   there because it is a one-time, persistent drop of the whole pass, and THREE
   reclaims the map on its own schedule with no per-frame thrash. The two gates no
   longer share the `castShadow` lever.

## Shadow-lifecycle contract (updated)

> ⚠⚠ **CORRECTED 2026-08-24 (lane SHADOW24, L-10380) — the third bullet below was FALSE, and it
> is the sentence this whole family kept regressing through.** It read, and still reads for the
> record: *"A **persistent** shadow-pass drop MAY clear `castShadow` (letting THREE reclaim the map
> on its own schedule), but MUST NOT be driven from a per-frame / per-motion event."*
>
> **"On its own schedule" is INSIDE AN OPEN COMMAND ENCODER, and the schedule is not the caller's
> tick.** MEASURED against the installed three r183.2:
> ```
> node_modules/three/src/nodes/lighting/AnalyticLightNode.js
>   :267-270  } else if ( this.shadowNode !== null ) { this.shadowNode.dispose(); … }
> node_modules/three/src/nodes/lighting/ShadowNode.js
>   :769-780  _reset() { … this.shadowMap.dispose(); this.shadowMap = null; … }
>   :396      depthTexture.name = 'ShadowDepthTexture';
> ```
> `AnalyticLightNode.setup()` runs during `nodeBuilder.build()`
> (`NodeManager.js:224/229/301`), which `RenderObject.getNodeBuilderState()`
> (`RenderObject.js:379`) reaches LAZILY from `Renderer._renderObjectDirect`
> (`Renderer.js:3381-3395`) — **after `backend.beginRender(renderContext)` (`Renderer.js:1641`)
> has opened the frame's encoder.** So the free lands between `beginRender` and `Queue.submit()`,
> which is the founder's message verbatim:
> `Destroyed texture [Texture "ShadowDepthTexture"] used in a submit. — While calling
> [Queue].Submit([[CommandBuffer from CommandEncoder "renderContext_1"]])`.
>
> ⛔ **AND THE FREE IS LATENT, WHICH IS WHY EVERY GUARD BUILT AROUND THE WRITE MISSED IT.**
> `RenderObjects.get` only re-reads a render object's cache key when `material.version` bumped or
> `needsUpdate` is set (`RenderObjects.js:127-129`). A caster flip therefore sits pending for an
> unbounded number of frames and detonates on an UNRELATED later event — a lighting-fixture
> placement, a material swap, a new mesh. `RenderPipelineManager.runShadowCasterMutation()`
> (§FIX-SHADOW-TIER-CASTER-DESTROY, L-908) pauses submits AROUND THE WRITE; by the time three
> actually frees the texture that window has long closed. **"Persistent, not per-frame" was never
> the property that made a bare clear safe. Nothing makes a bare clear safe.**
>
> **The rule that replaces it is the fourth bullet below** (§SHADOW-CASTER-FLIP-AT-BOUNDARY).
> ADR-0111's ORIGINAL decision — that a *transient* nav-LOD suppression must freeze and must never
> touch `castShadow` — is UNAFFECTED and still binding.

- **No shadow depth texture is ever `.destroy()`-ed within the frame it is submitted.**
- A **transient** (per-motion) shadow-pass suppression MUST freeze the map
  (`autoUpdate=false`), never clear `castShadow` and never dispose a shadow texture.
- ~~A **persistent** shadow-pass drop MAY clear `castShadow` (letting THREE reclaim the
  map on its own schedule), but MUST NOT be driven from a per-frame / per-motion event.~~
  **SUPERSEDED 2026-08-24 — see the correction box above and the next bullet.**
- **A `castShadow` clear — persistent or not — MUST be ORDERED AT THE FRAME BOUNDARY
  (§SHADOW-CASTER-FLIP-AT-BOUNDARY, L-10380).** Either enqueue it with
  `scheduleShadowCasterFlip(light, false)` (drained by the frame owner in
  `RenderPipelineManager.render()`), or rely on the DERIVED arm
  `RenderPipelineManager._orderPendingCasterReleasesAtBoundary()`, which compares the fingerprint
  three itself keys the node cache on (`LightsNode.customCacheKey()` +
  `renderer.shadowMap.type/.enabled`, folded into every render object by
  `NodeManager.js:441-447`) and, on a change, performs three's OWN release at the boundary —
  the sanctioned `light.dispatchEvent({type:'dispose'})`, not an external `.destroy()`. It then
  resets the compiled node states in the same boundary step, because the graph compiled while the
  light WAS casting still binds the map just freed, and holds the submit-pause window across the
  recompile. External code still never destroys a light-owned texture (rule 6 / C04 §SHADOW.2.6);
  the light's own node does, at an instant the frame owner chooses.
- Any explicit shadow-map dispose (size change / level change / restore) routes through
  the deferred post-submit path (`§SHADOW-DEVICE-LOSS-FIX`,
  `ShadowQualityUpgrader._deferReleaseShadowMap`).
- **A shadow-map REALLOCATION (mapSize / quality-level change) MUST freeze the live
  renderer's shadow map (`autoUpdate=false`) for the duration of the change and thaw
  DEFERRED past the in-flight submit** (added by `§FIX-SHADOW-LOAD-TIER-DESTROY`). THREE
  reallocates a shadow render target INSIDE `render()` whenever `mapSize` changes while
  `autoUpdate=true`; freezing is the only way to keep that realloc off the in-flight
  submit. The one regen at the new resolution lands on the thaw frame.
- **`light.dispose()` on a shadow-casting light is a SYNCHRONOUS free from whatever tick calls it**
  (`AnalyticLightNode.js:99-107` subscribes to the light's own `'dispose'` event). It is the one
  trigger the boundary detector cannot see coming, because the damage is already done before the
  next boundary. Route a light teardown through `releaseLightOwnedShadowNow()` at a boundary, or
  remove the light and let the detector collect it — never call `light.dispose()` from a store
  listener, a command handler or a service teardown while the viewport is live.

## Load-time sibling — `§FIX-SHADOW-LOAD-TIER-DESTROY` (founder issue L-39, 2026-07-02)

### Context

Opening a saved project (`Loaded: Auto-save (32 elements)`) painted the model once, then
the WHOLE APP froze — camera dead, buttons dead. Console during the load:

```
500× Destroyed texture [Texture "ShadowDepthTexture"] used in a submit
     — While calling [Queue].Submit(...)
[SceneQualityTier] N meshes → tier=cinematic (SSGI=on TRAA=on shadows=high)
[ShadowQualityUpgrader] Level changed to "high"   (shadow map reallocated 512→high-res)
```

Same device-loss family as L-25, but a **different trigger the nav fix did not cover**.

### Root cause

On project open the `SceneQualityTier` escalates to `cinematic`, and
`RenderingPipelineCoordinator.applyTierForMeshCount()` calls
`ShadowQualityUpgrader.apply()/setLevel('high')`, which reallocates the Pascal key
light's shadow map **512→2048**. That map lives on the light, so the live PRYZM WebGPU
renderer draws its shadow pass with it — and with that renderer's
`shadowMap.autoUpdate === true` (the default), **THREE performs the realloc INSIDE a
`render()`/submit** while the rAF loop is still draining command buffers that reference
the old `ShadowDepthTexture` → destroy-in-submit ×hundreds → device loss → freeze.

`§SHADOW-DEVICE-LOSS-FIX`'s `setTimeout(0)` deferral covered the upgrader's EXPLICIT
`.dispose()` of the old map, but **not THREE's own in-render reallocation** when
`autoUpdate` is live during the busy load render loop. That was the gap.

### Decision

1. **Wrap every shadow-map realloc in a freeze/deferred-thaw guard.** New
   `RenderPipelineManager.setShadowReallocFrozen(frozen)` — a **ref-counted** sibling of
   `setShadowPassSuppressed` that shares one applier (`_applyShadowFreezeState`), so the
   map is frozen (`autoUpdate=false`) while EITHER the nav lever OR any realloc/load
   freeze is active, and refreshes once (`needsUpdate=true`) only when the last source
   releases. `RenderingPipelineCoordinator` runs its `apply()/setLevel()/setShadowsEnabled()`
   shadow mutation through an injected guard (`setShadowReallocGuardHook`) wired by
   initScene to `setShadowReallocFrozen(true)` → mutate → `setTimeout(0)` thaw + one
   `getFrameScheduler().markDirty()`. THREE therefore never reallocates the map mid-submit;
   the single regen at the new resolution lands on an idle frame.
2. **Whole-load freeze (belt-and-suspenders).** initScene freezes the shadow map for the
   entire load window (`pryzm-project-switch` → boolean-latched `setShadowReallocFrozen(true)`)
   and thaws it deferred on `pryzm-project-loaded`, so NO shadow-map churn during load
   (tier escalation, lighting re-apply, outline rebuild) can destroy the texture
   mid-submit; shadow quality is escalated exactly once, when the device is idle post-load.
3. **`castShadow` is never touched; no texture is ever `.destroy()`-ed by the freeze** —
   fully consistent with the contract above. WebGPU-path only (no-op on the WebGL2
   fallback, which owns its own shadowMap).

### L-42 (camera dead after load) is downstream of this

The reported "camera won't orbit/pan/zoom after load" (L-42) was the **visible symptom of
the same device loss**: once the WebGPU device is lost no new frames present, so the
camera-controls damping loop (the `vendor-thatopen … requestAnimationFrame` in the stack)
keeps updating but nothing repaints — the model looks frozen. Keeping the device alive
(this fix) restores frame presentation, so the camera moves again. No separate camera
control-lock is engaged during load: `§LOAD-RAF-PAUSE` pauses only the wall-rebuild
scheduler and is released in `finally`; the `~16s stuck "setup"` watchdog line reflects
element hydration slowed by the failing render loop, not an independent main-thread hang.

## Consequences

- Fixes L-25: rapid wall-create + mouse motion no longer loses the WebGPU device; the
  viewport stays alive (prevention, not just recovery). ViewportCrashGuard / device-loss
  recovery is untouched and remains the fallback.
- Nav-LOD keeps its per-frame win (shadow-caster draws skipped during motion) while at
  rest shadows are identical to before.
- P2 respected: the only `renderer.shadowMap` mutation lives in `renderer-three`; the
  app layer calls it via `window.renderPipelineManager.setShadowPassSuppressed()`.
- P3 respected: no new `requestAnimationFrame`; the debounce is a `setTimeout` and the
  one-frame restore repaint reuses `getFrameScheduler().markDirty()`.

## Tests

`packages/renderer-three/__tests__/RenderPipelineManager.shadowFreeze.test.ts` — pins
that `setShadowPassSuppressed(true)` freezes (`autoUpdate=false`) and NEVER calls
`dispose`/`destroy` on the shadow map, that restore refreshes once
(`needsUpdate=true`), idempotence, and inertness on the non-WebGPU backend.

`packages/renderer-three/__tests__/RenderPipelineManager.shadowReallocFreeze.test.ts`
(`§FIX-SHADOW-LOAD-TIER-DESTROY`) — pins that `setShadowReallocFrozen(true)` freezes
(`autoUpdate=false`) and NEVER disposes/destroys the shadow map; that the ref-count
thaws only on the LAST release (refreshing once, no underflow on a surplus pop); that it
COMPOSES with the nav freeze (frozen while either source is active); and inertness on the
non-WebGPU backend.

The existing `RenderPipelineManager.shadowDebounce.test.ts` (project-load rebuild
coalescing) continues to pass unchanged.

## Addendum (2026-07-03) — `§FIX-SSGI-DEFAULT-OFF-TRAA-SELECT-FLASH` (founder L-59)

Two WebGPU post-FX defaults are changed here because they share the same tier +
`RenderPipelineManager` machinery as the shadow fixes above and must not regress them.

**Problem.** (1) SSGINode's per-frame denoise temporal accumulation flickered ALL
elements every frame on WebGPU. SSGI was enabled by default two ways: the `cinematic`
and `balanced` tiers in `SceneQualityTierManager` carried `ssgi:true`, and `initScene`
called `renderPipelineManager.activateSSGI()` unconditionally at startup. (2) The
`balanced`/`cinematic` tiers also carried `traa:true`; the tier's TRAA hook
(`RenderingPipelineCoordinator._onTierTraa -> rpm.activateTRAA/deactivateTRAA`) rebuilds
the pipeline (`_rebuildPipelineWithCurrentState` -> a new WebGPU `RenderPipeline` -> shader
PSO recompile) on any tier transition, which presents a ~1s BLACK frame. Scene- and
selection-driven `applyTierForMeshCount` re-evaluations therefore flashed the viewport
black on selection.

**Decision.** SSGI and TRAA now default **OFF at every tier** (cinematic/balanced set
`ssgi:false, traa:false`, matching performance/survival), the startup `activateSSGI()`
call is removed (only `activateOutlines()` runs, so selection highlighting is intact via
`_buildPipeline`'s phase-4 outline composite), and the RenderRail SSGI toggle defaults
OFF. Both remain fully user-opt-in through `rpm.activateSSGI()` / `rpm.activateTRAA()`.
With the tier no longer driving these hooks ON, there is no tier/selection-driven
rebuild-to-black; `setSelectedObjects()` only mutates the live outline arrays and never
rebuilds. Device-loss / backend-live-swap recovery (`recoverPipeline`,
`tryUpgradePostFx`, and the `initScene` legacy fallback) restores SSGI only when the user
had it enabled (gated on `_ssgiActive` / `status.ssgiActive`), so the flicker cannot
silently return after a swap.

**Shadow-fix safety.** Only the `ssgi` / `traa` booleans changed. `shadows`,
`shadowLevel`, and every `§FIX-SHADOW-MIDSUBMIT-DESTROY` / `§FIX-SHADOW-LOAD-TIER-DESTROY`
/ `setShadowReallocFrozen` / `setShadowPassSuppressed` path is untouched; the WebGL
fallback path is unaffected (`applyBackendGate` already forced SSGI/TRAA off there).

**Tests.** `SceneQualityTierManager.test.ts` pins cinematic/balanced SSGI+TRAA OFF on
real WebGPU; new `RenderPipelineManager.selectionNoRebuild.test.ts` pins that
`setSelectedObjects()` / `setHoveredObjects()` trigger no pipeline-rebuild entry point.

## Addendum (2026-07-03) — `§FIX-SHADOW-WALLCOMMIT-DESTROY` (founder L-64)

The wall-COMMIT sibling of L-25 (`§FIX-SHADOW-MIDSUBMIT-DESTROY`, the nav-LOD path) and
L-39 (`§FIX-SHADOW-LOAD-TIER-DESTROY`, the project-load path). Same device-loss class,
new trigger: the polyline-wall CLOSE.

**Problem.** On a polyline wall creation, the instant the user presses Enter to close
the loop the walls flash BLACK for a microsecond. Prod log:
`[PascalSceneLighting] Shadow flags set on N mesh(es)` immediately followed by
`Destroyed texture [Texture "ShadowDepthTexture"] used in a submit`. The moment the
newly-committed walls enter the scene, two things touch the LIVE WebGPU renderer's shadow
map (whose `shadowMap.autoUpdate === true`): (a) the debounced
`PascalSceneLighting.onGeometryAdded` pass sets `castShadow` on the new meshes — the
shadow-caster set changes, so THREE re-renders / can realloc the shadow pass — and (b)
the mesh-count change re-evaluates `SceneQualityTier`
(`RenderingPipelineCoordinator.applyTierForMeshCount`), which can reallocate the Pascal
key light's shadow map (mapSize change). Either, performed INSIDE a `render()`/submit
while the previous frame's command buffer (referencing the old `ShadowDepthTexture`) is
still draining on the WebGPU queue, is the mid-submit destroy → device-loss cascade →
black flash.

The existing per-realloc guard (`setShadowReallocGuardHook` → `setShadowReallocFrozen`)
freezes only for the *synchronous* duration of the tier's mapSize mutation. It does NOT
span the debounced shadow-flag pass (a), which runs ~100 ms later on its own timer, nor
the settle frame — so the commit window had an un-frozen gap where the destroy occurred.

**Decision.** Extend the SAME ref-counted `setShadowReallocFrozen` latch across the whole
wall-commit window. In `apps/editor/src/engine/initScene.ts` the boolean-latched pair
`_armWallCommitShadowFreeze` / `_releaseWallCommitShadowFreeze` wraps the existing
`_debouncedGeomAdded` (Pascal) path: the freeze is armed **synchronously** the moment a
non-batched `bim-*-added/updated` event begins mutating the scene — before the shadow
flags are set and before the deferred per-event tier-re-eval macrotask escalates the tier
— and released one frame AFTER the shadow-flag pass settles (deferred thaw via
`setTimeout(0)` + `getFrameScheduler().markDirty` — P3-clean, no new rAF). A burst of
commit events (all segments of one polyline close) coalesces into ONE continuous freeze
window via the latch, so the ref-count never drops to zero mid-commit and the map is never
thawed (never destroyed) between the shadow-flag pass and the tier realloc. While frozen
(`autoUpdate=false`) THREE reuses the existing `ShadowDepthTexture` and never destroys it;
the single regen at the new caster set / resolution lands on an idle frame.

This is timing-only and composes with the nav (L-25) and load (L-39) freezes via the
shared ref-count + `_applyShadowFreezeState`. WebGPU-path only (`setShadowReallocFrozen`
is a no-op on the WebGL2 fallback, which owns its own shadow map).

**Shadow-fix safety.** No new freeze primitive is introduced — only a new *caller* of the
existing ref-counted latch. The shadow LEVEL/quality (`shadows`, `shadowLevel`), the
`§FIX-SHADOW-MIDSUBMIT-DESTROY` / `§FIX-SHADOW-LOAD-TIER-DESTROY` paths, and the L-59
`ssgi` / `traa` defaults are all untouched.

**Tests.** New
`packages/renderer-three/__tests__/RenderPipelineManager.shadowWallCommitFreeze.test.ts`
simulates a wall-commit re-tier (shadow-flag pass + nested per-realloc guard) and pins
that the `ShadowDepthTexture` is NEVER disposed/destroyed while the commit freeze is held,
that the map stays frozen while a nested guard pushes/pops, that it composes with an
overlapping nav freeze, that the final release thaws + refreshes exactly once, and that it
is inert on the WebGL2 fallback.
