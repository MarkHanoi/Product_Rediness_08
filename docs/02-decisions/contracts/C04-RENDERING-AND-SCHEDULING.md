# C04 — Rendering & Scheduling

> **Stamp**: 2026-05-02 · **Status**: CANONICAL  
> **Scope**: `packages/renderer-three/` (single THREE owner, L1), `packages/frame-scheduler/` (single rAF, L1), `packages/scene-committer/` (L4), `packages/renderer/` (abstract renderer, L4), `packages/render-runtime/` (L4).  
> **Key principles**: P2 (single THREE owner), P3 (single rAF).

---

## §1 — Single THREE Owner (P2)

### §1.1 — The invariant

`import * as THREE` is **only permitted in `packages/renderer-three/`**. Every other package that needs a THREE type MUST import it via the `RendererHandle` or a typed re-export from `renderer-three`.

**CI gate**: `eslint-plugin-boundaries` — hard-fail.

### §1.2 — Why

Three.js bundles `~1.1 MB` gzipped. Allowing multiple packages to import it directly creates: (a) bundle duplication when dynamic-import splitting is applied, (b) version skew bugs when modules resolve different copies, (c) deep coupling that prevents swapping the renderer. All of these have been observed in PRYZM 1.

### §1.3 — Renderer handle

`packages/renderer-three/` exposes a `RendererHandle` interface that all callers use. Callers receive a `RendererHandle` from `composeRuntime().renderer`. They MUST NOT reach into THREE geometry objects directly; they use the typed API on `RendererHandle`.

```ts
interface RendererHandle {
  readonly canvas:    HTMLCanvasElement;
  readonly camera:    CameraHandle;
  attach(container: HTMLElement): void;
  detach(): void;
  resize(width: number, height: number): void;
  dispose(): void;
}
```

### §1.4 — WebGL / WebGPU fallback

`packages/renderer-three/` MUST attempt WebGPU first, fall back to WebGL 2, then plain WebGL. It MUST log the selected backend at init time. It MUST NOT throw on fallback — a headless/no-GPU environment returns a no-op renderer.

**Amendment (Wave A15 S121, 2026-05-03)**: The WebGPU adapter (`WebGPURendererAdapter`) MUST NOT be wired into the production boot path until P2 is fully green (the `check-three-imports.ts` CI gate exits 0 with zero violations). Until that gate is green, the fallback chain MUST route to `WebGLRendererAdapter` as its concrete implementation. This prevents the TSL pipeline from activating in environments where the P2 isolation invariant is not yet proven. The `RendererHandle` abstraction and `WebGLRendererAdapter` are available from Wave A15 S121 onward; `WebGPURendererAdapter` is gated behind P2 closure. Context-loss recovery callbacks MUST be wired via `setupContextLossHandlers` (exported from `@pryzm/renderer-three`); implementations MUST pause the render loop on `webglcontextlost` and invoke `onContextRestored` listeners on `webglcontextrestored`.

---

## §2 — Single rAF Owner (P3)

### §2.1 — The invariant

`requestAnimationFrame()` is called **only** in `packages/frame-scheduler/src/RafAdapter.ts` (invoked by `packages/frame-scheduler/src/FrameScheduler.ts`). All animation, render loops, and per-frame callbacks MUST subscribe to the `FrameScheduler` interface exposed on `PryzmRuntime.scene.scheduler`.

**CI gate**: `tools/ga-gate/check-raf-count.ts` — ratchet at 1 owner, hard-fail.

### §2.2 — FrameScheduler API

```ts
interface FrameScheduler {
  onFrame(callback: FrameCallback, priority?: FramePriority): Unsubscribe;
  scheduleOnce(callback: FrameCallback): void;
  pause(): void;
  resume(): void;
}
type FrameCallback = (dt: number, elapsed: number) => void;
type FramePriority = 'physics' | 'update' | 'render' | 'post';
```

- `onFrame` subscribes for every frame at the given priority tier (physics → update → render → post).
- `scheduleOnce` runs the callback on the next frame and automatically unsubscribes.
- `pause` / `resume` control the rAF loop for background tabs and test isolation.

### §2.3 — Priority tiers (execution order per frame)

1. **physics** — physics integration and input sampling.
2. **update** — element/scene state updates, command replay.
3. **render** — THREE scene commit + `renderer.render()`.
4. **post** — screenshot capture, perf sampling, telemetry flush.

A callback MUST NOT mutate state in a tier that has already executed in the current frame.

---

## §3 — Scene Committer (L4)

`packages/scene-committer/` is the bridge between the domain store (`ElementStore`) and the THREE scene graph. It:

- Subscribes to `ElementStore` changes at **render** priority.
- Computes a minimal diff (add / update / remove) between the previous committed scene and the current store snapshot.
- Issues the corresponding THREE object mutations (`mesh.position.set(...)`, `material.color.set(...)`, etc.) through `RendererHandle`.
- MUST NOT call `renderer.render()` itself; that is the responsibility of the render priority callback in `packages/render-runtime/`.

### §3.1 — Scene committer invariants

- All THREE object creation/destruction MUST go through the scene committer. No plugin or UI component MAY add objects to the THREE scene directly.
- The committer MUST be idempotent: calling it twice with the same store snapshot MUST produce the same scene state with no extra allocations.

### §3.2 — GPU picking ID-buffer requirement (Amendment — Wave A15 S121, 2026-05-03)

The picking system MUST use an offscreen `WebGLRenderTarget` ID buffer for element selection. Raycasting (`THREE.Raycaster`) is permitted ONLY in headless or no-GPU contexts where a render target cannot be allocated.

**Rationale**: Raycasting is O(n) in the number of mesh faces. At ≥ 500k elements (the IFC target model size), a single click event causes ≥ 500k triangle intersection tests, producing 16 ms+ spikes that violate NFT 16 (frame budget). An ID-buffer read is O(1): one GPU render pass encodes element indices into RGBA8 color, one `readRenderTargetPixels` call reads the clicked pixel — regardless of element count.

**Implementation reference**: `packages/picking/src/gpu-pick.ts` (`GpuPickStrategy`). The `GpuPickRenderer` interface (defined in `packages/picking/src/types.ts`) decouples the strategy from the concrete renderer and is satisfied by `WebGLRendererAdapter.readRenderTargetPixels`.

**Requirement**: `PickStrategyResolver` (in `packages/picking/src/PickStrategyResolver.ts`) MUST prefer `GpuPickStrategy` and fall back to `BvhPickStrategy` only when the GPU renderer probe fails. This resolver is the ONLY place where the strategy is selected at runtime.

---

## §3.5 — LOD System (Distance-Based, Wave A18)

**Amendment**: Wave A18-T16 · 2026-05-03 · Status: CANONICAL

The scene-committer MUST provide a 3-tier, distance-based Level-of-Detail (LOD) system for large models (≥ 500 k elements) to maintain the 60 FPS budget (NFT 4).

### §3.5.1 — LOD tiers

| Tier | Distance (camera to element centroid) | Geometry detail |
|---|---|---|
| **0** | < 100 m | Full detail — all geometry submitted to committer |
| **1** | 100 m – 500 m | Simplified — reduced polygon geometry (committer may substitute low-poly proxy) |
| **2** | ≥ 500 m | Bounding box only — committer renders axis-aligned bounding box; full geometry skipped |

Hard-cull threshold: elements whose camera distance exceeds **1 000 m** MAY be omitted from the commit call entirely when the total element count exceeds 500 k.

### §3.5.2 — Implementation

- `packages/scene-committer/src/LODManager.ts` — `LODManager.computeLOD(distance): 0 | 1 | 2`
- `CommitterHost.setViewDistance(metres)` — called every frame by the render loop
- `CommitterHost.currentLODTier` — exposes the active tier for the current frame
- `PrimitiveCommitter` implementations receive the LOD tier via the delta context; they are responsible for geometry selection

### §3.5.3 — Invariants

- `LODManager` imports NOTHING from `three` (P2).
- LOD tier changes MUST NOT cause a frame stutter > 2 ms (the geometry swap must be deferred to the next idle frame if the cost exceeds budget).
- The bounding-box fallback in Tier 2 MUST preserve element selection hit-testing (picking still works on the bounding box).

---

## §4 — Abstract Renderer (L4)

`packages/renderer/` defines the abstract `Renderer` interface that `packages/render-runtime/` orchestrates. It MUST:
- Depend on `packages/frame-scheduler/` and `packages/scene-committer/`.
- NOT import `three` directly (P2).
- Expose only `attach`, `detach`, `resize`, `dispose`, and `onRenderComplete` in its public surface.

`packages/render-runtime/` owns the render loop: it subscribes at **render** priority, calls `scene-committer.commit()`, then calls `renderer-three.render()`.

---

## §5 — Viewport & Camera

The camera is a domain concept, not a Three.js object in the hands of the UI. The `CameraController` slot on `PryzmRuntime` wraps the Three.js camera and controls. See C06 §3 for the UI-facing camera contract.

### §5.1 — NFT targets for rendering

| NFT | Target | Bench |
|---|---|---|
| Frame budget (interactive viewport) | 16.6 ms p95 (60 FPS) | `frame-budget.bench.ts` |
| Cold-boot to first paint | < 2.5 s on M1 / Chrome | `cold-boot.bench.ts` |
| Bundle size (editor app) | < 4 MB gzipped | `bundle-size.bench.ts` |

See C10 for the full NFT table and measurement methodology.

---

## §6 — What is NOT in this contract

- How the camera is exposed to tools and plugins → C06, C07.
- The plan-view 2D rendering pipeline → C06 §4.
- The path-tracer (photorealistic mode) — `three-gpu-pathtracer` is a lazy dynamic import; its contract is in [SPEC-31].
- How renders are saved to the gallery → C05 §5.

---

---

## §SHADOW — the sun / ground-shadow subsystem (NORMATIVE)

Written 2026-07-10 after L-205: a grey rectangle over the ground that survived **ten** root-cause
attempts. Nine were wrong. This section exists so that never happens again. See ADR-0120.

### §SHADOW.0 — The mental model

The L0 ground catcher is a huge `THREE.ShadowMaterial` plane. It paints
`alpha = opacity × (1 − shadowMask)`. Therefore:

- **lit fragment** ⇒ `shadowMask = 1` ⇒ alpha 0 ⇒ **invisible** (the intended resting state).
- **shadowed fragment** ⇒ `shadowMask = 0` ⇒ alpha = `opacity` ⇒ **visible grey**.

A shadow you can see on the ground is the catcher's *shadowed* fragments. A grey rectangle is the
catcher reporting **"everything here is in shadow."** Those are the same mechanism, not two bugs.

### §SHADOW.1 — The actual root cause of L-205

`PascalSceneLighting._enableShadowsOnScene()` set `castShadow = true` on **every mesh in the
scene**, filtered only by whether the mesh's name contained `edge`, `grid`, or `collision`.

The scene contains meshes that are not BIM elements. Among them is a ground-level plane installed
by the OBC `ShadowedScene`. It became a shadow caster. **A ground-level plane that casts a shadow
shadows the entire catcher.** Every catcher fragment inside the shadow camera reads `shadowMask = 0`
and paints `opacity` — a **solid grey rectangle bounded exactly by the shadow camera's footprint**.

The evidence was in every log we ever captured, on an **empty project**, before any wall existed and
before the catcher was even attached:

```
[PBRSceneUpgrader]     Applied — meshes: 2
[PascalSceneLighting]  Shadow flags set on 1 mesh(es).
```

Two meshes, zero BIM elements, and one just became a shadow caster.

**The single most important consequence — and the thing that defeated nine attempts:** *the grey
rectangle is always exactly the size of the shadow camera's ground footprint.* Resizing the shadow
camera therefore changed the grey's **size**, never its existence:

| shadow camera | observed grey |
|---|---|
| `±113,657 m` (the runaway fitted frustum) | grey to the horizon |
| `±50 m` (the fixed camera) | a ~100 m grey diamond |

Nine attempts read the *size* of the symptom as a clue to its *cause*. It never was.

The catcher was kept out of the caster set only by an incidental `transparent && opacity < 0.5`
check — which merely `return`s, so it never **cleared** a `castShadow` an earlier pass had set.

**Fix:** `§FIX-SHADOW-CASTER-DENYLIST` (`92f437a0`). Explicitly **demote** (clear, never merely skip)
any mesh that exists to *receive* a shadow (`role === 'ground-shadow-catcher'`, or a
`ShadowMaterial`), and any mesh whose world bounding radius exceeds `MAX_CASTER_RADIUS_M = 500`
(a 40-storey tower is ~75 m; a scene/ground plane is thousands). Demotions are logged by name, type
and radius, so an offending mesh names itself in production.

### §SHADOW.2 — Rules (normative)

1. **The caster set is an explicit allowlist concept, never "every mesh minus some names."** A mesh
   casts a shadow only if it is BIM geometry. Never derive the caster set from name substrings.
2. **A shadow RECEIVER must never CAST.** Demote by clearing `castShadow`, not by declining to set
   it — another pass may already have set it. Receivers keep `receiveShadow`.
3. **Size is a type signal.** No BIM element exceeds `MAX_CASTER_RADIUS_M`. Anything larger is scene
   infrastructure. Cap it, and log what you capped.
4. **The shadow camera MUST be bounded and finite.** Any code deriving `light.shadow.camera` extents
   from scene geometry MUST clamp the result and MUST `Number.isFinite`-assert every extent. A fit
   that exceeds the clamp is a bug in the AABB sweep: clamp, log the offending object, fall back to
   the fixed frustum. (`f4533641` derived an **84 km** radius from a scene containing one wall.)
5. **Texel density is the sharpness invariant, not the frustum.**
   `metresPerTexel = (right − left) / mapSize.width`. Any change claiming to sharpen the shadow MUST
   state its before/after `metresPerTexel` and pin it with a test. **Sharpen by raising `mapSize` on
   a stable camera — never by shrink-wrapping the camera.** (Shrink-wrapping is what produced the
   84 km runaway; it is a legitimate technique only with rule 4 in force.)
6. **Never resize a live caster's shadow map.** Writing `light.shadow.mapSize` (or disposing
   `light.shadow.map`) while the light casts makes THREE destroy + recreate the `ShadowDepthTexture`
   inside `render()` while the previous frame's command buffer still references it →
   `Destroyed texture [ShadowDepthTexture] used in a submit` → WebGPU device loss. Choose the
   allocation once, at a device-safe size (ADR-0111). Tiers may change `bias`, `normalBias`,
   `radius` — never the allocation.
7. **Never dispose or rebuild the render pipeline off-frame.** `scheduleShadowRebuild()` →
   `_rebuildPipeline()` was fire-and-forget (`SHADOW_REBUILD_COMPLETE elapsed=0.0ms` — it timed a
   promise, not the work), so `createScenePass()` + pipeline dispose landed mid-submit.
8. **A new caster does NOT require a pipeline rebuild.** three's `LightsNode.customCacheKey()`
   hashes `light.castShadow` per-**light**, not per-caster-mesh; `ShadowNode.updateShadow()` redraws
   the depth map every frame with whatever casters exist. Rebuilding on geometry is unnecessary and
   destructive.
9. **Two renderers must not share one light's shadow state.** `world.renderer` (OBC
   `PostproductionRenderer`, a **WebGLRenderer**) and `window.pryzmRenderer` (**WebGPURenderer**)
   draw the same scene and see the same key light, which has exactly one `shadow.map` slot. The OBC
   renderer's `shadowMap.enabled` stays **false** (`BimWorld.ts`); PRYZM's WebGPU pipeline owns the
   shadow pass end-to-end. `ViewController._restore3DRendererPresentation()` enforces the same.
10. **Know which flag you are writing.** On the WebGPU node path, `renderer.shadowMap.autoUpdate` is
    **inert** — `ShadowNode.updateBefore()` gates on the per-**light** `shadow.autoUpdate` /
    `shadow.needsUpdate`. `renderer.shadowMap.enabled` is read once, at **compile** time
    (`ShadowNode.setup`). Several L-205-era "fixes" adjusted a switch wired to nothing.
11. **`ShadowMaterial` differs per backend.** On WebGPU it resolves to `ShadowNodeMaterial` +
    `ShadowMaskModel`, whose `finish()` is `diffuseColor.a.mulAssign(shadowMask.oneMinus())` —
    opacity **is** respected. `ShadowNode`'s `frustumTest` clamps `x,y ∈ [0,1] ∧ z ≤ 1` and returns
    `1` (LIT) outside, so ground **outside** the shadow frustum is invisible, never grey.
    **Corollary: grey outside the frustum is impossible. Grey everywhere means the frustum covers
    everywhere, or everything inside it is genuinely shadowed.**

### §SHADOW.3 — Debugging protocol (follow in order; do not skip to code)

L-205 cost ten attempts because it was debugged by inference. Every wrong answer was internally
consistent, survived review, and shipped. **Measure first.**

1. **Untick "Ground shadows."** Grey gone ⇒ it is the catcher. Grey stays ⇒ it is a different mesh
   and everything below is irrelevant.
2. **Untick "Cast shadows."** Grey gone ⇒ the catcher and its material are healthy; the fault is in
   what the shadow pass contains.
3. **Enumerate the caster set.** This is the step that would have ended L-205 on day one — paste
   into the browser console with geometry present and the real sun on:

   ```js
   (() => {
     const out = [];
     window.a2.scene.three.traverse((o) => {
       if (!o.isMesh || !o.castShadow) return;
       try { o.geometry.computeBoundingSphere(); } catch { /* degenerate */ }
       const r = (o.geometry?.boundingSphere?.radius ?? 0) *
                 Math.max(o.scale.x, o.scale.y, o.scale.z);
       out.push({
         name: o.name || '(unnamed)',
         material: o.material?.type,
         role: o.userData?.role ?? '',
         radius_m: +r.toFixed(1),
         y: +o.position.y.toFixed(2),
       });
     });
     out.sort((a, b) => b.radius_m - a.radius_m);
     console.table(out.slice(0, 12));
     console.log('total casters:', out.length);
   })()
   ```

   **Any large mesh at `y ≈ 0` is the bug.** A ground-level caster shadows the whole catcher.
4. **Read `§DIAG-GROUND-SHADOW`** (`RenderPipelineManager.logShadowDiagnostics`): shadow camera
   extents, `metresPerTexel`, `shadowMapType` (`RenderTarget` = healthy WebGPU;
   `WebGLRenderTarget` = a WebGL renderer claimed the slot), `lightAutoUpdate`, the freeze latches.
5. Only now form a hypothesis.

**Refuted hypotheses — do not re-attempt.** Each cost a deploy: ScenePass-not-rebuilt-on-first-caster;
catcher-outside-the-frustum; freeze-latch-unbalanced; `ViewController` disabling the live shadow map
(it writes the *silenced OBC* renderer; `BimWorld.ts` assigns `world.renderer` exactly once);
leaked `shadowMap.enabled = false`; transition-only `autoUpdate` writer; the off-frame ScenePass
rebuild (a real defect, fixed in `d9b8f7cf`, **but not the grey**); the exploded frustum (a real
latent bug, **but only the grey's size**); WebGPU reusing a foreign `WebGLRenderTarget` (refuted from
three's source — `ShadowNode.setupShadow()` always creates its own target).

### §SHADOW.4 — Current state and the safe path to sharpness

HEAD runs the **fixed ±50 m** shadow camera with a 512² map ⇒ `metresPerTexel ≈ 0.195 m`. The ground
shadow is therefore **correct but soft**. To sharpen, in this order, each verified on production
against `§DIAG-GROUND-SHADOW` before the next:

1. Raise `mapSize` **once, at allocation time**, on the fixed camera (512 → 2048 ⇒ `0.049 m/texel`,
   a 4× improvement). Device-safe: check `maxTextureSize`; degrade on `performance` and lower tiers
   (a 2048² depth texture is 4× the memory). Never resize a live map (§SHADOW.2.6).
2. Only then consider a **clamped** fit (§SHADOW.2.4), with a finite-check, a fallback to the fixed
   frustum, a log of the offending object, and a regression test that feeds it the 84 km outlier.

**Open latent bug:** the AABB sweep in the (now removed) `refitShadowToScene()` derived an 84 km
radius from a one-wall scene. The offending mesh has never been identified. If the fit is ever
reinstated, identify it first.
