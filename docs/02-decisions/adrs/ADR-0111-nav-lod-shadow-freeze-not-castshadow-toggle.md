# ADR-0111 — Transient shadow suppression FREEZES the shadow map; it never clears `castShadow`

- Status: Accepted
- Date: 2026-07-02
- Tag: `§FIX-SHADOW-MIDSUBMIT-DESTROY`
- Scope: `packages/renderer-three/src/pipeline/RenderPipelineManager.ts`,
  `apps/editor/src/engine/initScene.ts` (the `§PERF-NAV-LOD` nav gate),
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

- **No shadow depth texture is ever `.destroy()`-ed within the frame it is submitted.**
- A **transient** (per-motion) shadow-pass suppression MUST freeze the map
  (`autoUpdate=false`), never clear `castShadow` and never dispose a shadow texture.
- A **persistent** shadow-pass drop MAY clear `castShadow` (letting THREE reclaim the
  map on its own schedule), but MUST NOT be driven from a per-frame / per-motion event.
- Any explicit shadow-map dispose (size change / level change / restore) routes through
  the deferred post-submit path (`§SHADOW-DEVICE-LOSS-FIX`,
  `ShadowQualityUpgrader._deferReleaseShadowMap`).

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
The existing `RenderPipelineManager.shadowDebounce.test.ts` (project-load rebuild
coalescing) continues to pass unchanged.
