# Renderer (`@pryzm/renderer`) — design

> S06 Track B deliverable.  Spec:
> `phases/PHASE-1A-Q1-M1-M3-SKELETON-RAILS.md` §S06 (lines 555–701);
> ADR-007 (`docs/02-decisions/adrs/0007-webgpu-webgl2-dual-mode.md`).

The renderer is **L5/L7** in the layered stack — the only package
allowed to import `three` outside `@pryzm/scene-committer` and the
explicitly allowlisted boot file `apps/editor/src/bootstrap.render.ts`
(see `eslint-plugin-pryzm/no-three-outside-committer`).

## Goals (sub-phase 1A)

1. **Single, narrow surface.**  `Renderer.init(canvas, opts)` →
   `{ scene, camera, render(), attachTo(scheduler), dispose() }`.
2. **Dual-mode** (`webgpu` | `webgl2`) — auto-detected per ADR-007.
   Both modes route through `THREE.WebGLRenderer` in 1A; the `'webgpu'`
   tag is a *contract surface* for 1B's `THREE.WebGPURenderer` swap.
3. **Forward-only, no post-FX.**  Single-mesh `MeshPass` + a clearing
   `ClearPass`, executed in order by `Pipeline`.  No HDR, no shadows,
   no post-process — those land in 1B/1C and are gated by their own
   ADRs.
4. **OTel transparent.**  `pryzm.renderer.init` records the resolved
   `pryzm.renderer.mode`; `pryzm.frame.render` records draw calls + tris.

## File layout

```
packages/renderer/
  src/
    Renderer.ts             — boot, mode-resolution table (ADR-007),
                              dispose, attachTo(scheduler).
    CameraController.ts     — vanilla orbit + pan + wheel; calls
                              scheduler.markDirty('camera') on input.
    otel.ts                 — startSpan / withSpan / withSpanSync helpers.
    passes/
      Pipeline.ts           — sequenced array of passes; render() walks them.
      ClearPass.ts          — clears the framebuffer (color + depth).
      MeshPass.ts           — `renderer.render(scene, camera)`.
    index.ts                — public surface.
  __tests__/
    Renderer.test.ts        — mode-resolution table.
    CameraController.test.ts — orbit/pan/zoom/dispose.
    Pipeline.test.ts        — Pipeline + ClearPass + MeshPass.
```

## Mode resolution (ADR-007)

| Requested | `navigator.gpu` / `gpuProvider` | Adapter request | Resolved mode |
|---|---|---|---|
| `webgl2` | (not consulted) | (not consulted) | `webgl2` |
| `auto`   | absent | n/a | `webgl2` |
| `auto`   | present | resolves truthy | `webgpu` |
| `auto`   | present | resolves null / throws | `webgl2` |
| `webgpu` | absent | n/a | **throws `RendererInitError`** |
| `webgpu` | present | resolves null / throws | **throws `RendererInitError`** |

The decision lives in `Renderer.ts :: resolveMode()`.  Tests
(`Renderer.test.ts`) cover every row.

## Camera controller

`CameraController` is *vanilla* — no THREE.OrbitControls dep.  The
controller:

1. Listens for `pointerdown` / `pointermove` / `pointerup` / `wheel`
   on the canvas.
2. On every input event, calls `scheduler.markDirty('camera')` so the
   scheduler knows there is work this frame (idle CPU = 0 outside
   input — verified by the S03 idle-cpu bench).
3. Exposes a `dispose()` that removes every listener and unregisters
   the scheduler tick listener — verified by `CameraController.test.ts`.

There is no quaternion in 1A — the controller stores spherical
`(theta, phi, radius)` and a target.  This is enough for orbit; pan
moves the target in screen-aligned XY.

## Pass pipeline

Three classes:

* `Pipeline` — owns an ordered array of passes; `render()` invokes
  every pass in order.  Passes can be added or removed at runtime
  (`add(pass)`, `remove(pass)`); the order matters for the depth
  buffer (clear before draw).
* `ClearPass` — calls `renderer.setClearColor()` + `renderer.clear()`.
* `MeshPass` — calls `renderer.render(scene, camera)` (THREE's
  forward shader).

The `Renderer.render()` method walks the pipeline; the OTel
`pryzm.frame.render` span wraps the whole walk and records draw calls
+ triangle count from `THREE.WebGLRenderer.info.render`.

## Scheduler integration

`renderer.attachTo(scheduler, id?)` registers a `'render'` priority
tick listener that calls `renderer.render()` on every dirty frame.
Returns a disposer; `Renderer.dispose()` is *also* idempotent so a
caller may forget the disposer in test code without leaking.

The data ↔ render interlock lives in `apps/editor/src/bootstrap.render.ts`:

1. **`'pre-render'` priority** — scene reconciler walks
   `host.registry` and adds/removes `Object3D`s on `renderer.scene`.
2. **`'render'` priority** — `renderer.render()` (the
   `attachTo()`-installed listener).

This ordering guarantees that committer-emitted Object3D additions
land in the THREE scene **before** `MeshPass` walks it on the same
tick — there is no one-frame lag.

## What is intentionally NOT here

* **Post-FX**: bloom, SSAO, tonemap, FXAA — all 1C/1D.
* **Shadows**: directional shadow maps, no.  Materials are emissive +
  unlit in 1A.
* **Instancing**: `MaterialPool` exists in `@pryzm/scene-committer` but
  the renderer doesn't grow `InstancedMesh` plumbing in 1A — that lands
  in 1B once we have > 5K curtain-wall panels.
* **Custom shaders**: every material is a `THREE.MeshStandardMaterial`
  in 1A; the shader chunks live in `@pryzm/scene-committer` committers,
  not here.

## Public API

```ts
import { Renderer, CameraController, type RendererMode } from '@pryzm/renderer';

const renderer = await Renderer.init(canvas, { mode: 'auto' });
const camera = new CameraController(renderer.camera, canvas, scheduler);
const detach = renderer.attachTo(scheduler);

// later …
detach();
camera.dispose();
renderer.dispose();
```

## CI gates

* **Bundle size**: `< 1.8 MB gzip` for the `?pryzm2=1` entry chunk
  (renderer is the largest contributor — `three` is its only static
  dep > 200 KB).  Hard-fail at S06 — see
  `apps/bench/scripts/check-bundle-size.mjs`.
* **Visual diff**: WebGPU vs WebGL2 same-scene diff < 2 px.  See
  `apps/bench/scripts/visual-diff.mjs` and
  `apps/editor/__tests__/visual-fixtures/README.md`.
* **OTel coverage**: `pryzm.renderer.init` records
  `pryzm.renderer.mode` ∈ `{ 'webgpu', 'webgl2' }`; `pryzm.frame.render`
  records `pryzm.renderer.draw_calls` + `pryzm.renderer.triangles`.

## Future (1B+)

* `THREE.WebGPURenderer` swap behind the existing `'webgpu'` mode.
* `InstancedMesh` plumbing for curtain-wall panels.
* Per-object visibility culling (frustum culling is THREE's default;
  occlusion / portal culling is a future ADR).
