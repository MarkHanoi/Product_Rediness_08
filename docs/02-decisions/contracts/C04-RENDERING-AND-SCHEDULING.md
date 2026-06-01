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
