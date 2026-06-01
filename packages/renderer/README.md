# `@pryzm/renderer`

L5/L7 — the only package allowed to import `three` outside
`@pryzm/scene-committer` (and the explicitly allowlisted boot file
`apps/editor/src/bootstrap.render.ts`).

See `docs/04-reference/architecture-detail/renderer.md` for the full design.

## Quick start

```ts
import { Renderer, CameraController } from '@pryzm/renderer';
import { FrameScheduler } from '@pryzm/frame-scheduler';

const scheduler = new FrameScheduler();
const renderer = await Renderer.init(canvas, { mode: 'auto' });
const camera = new CameraController(renderer.camera, canvas, scheduler);
const detach = renderer.attachTo(scheduler);

scheduler.start();        // begin rAF loop
scheduler.markDirty('camera');  // pump the first frame
```

## Modes (ADR-007)

| `mode` | Behavior |
|---|---|
| `'auto'` (default) | Probe `navigator.gpu` (or `gpuProvider()`); falls back to `'webgl2'` if WebGPU unavailable. |
| `'webgpu'` | Forces WebGPU; throws `RendererInitError` if no adapter. |
| `'webgl2'` | Forces WebGL2; never touches `gpuProvider`. |

In 1A both modes use `THREE.WebGLRenderer` under the hood; the
`'webgpu'` tag is a contract surface for the 1B `WebGPURenderer` swap.

## OTel spans

* `pryzm.renderer.init` — boot path; `pryzm.renderer.mode` ∈ `{ 'webgpu', 'webgl2' }`.
* `pryzm.frame.render` — per-frame draw; records `pryzm.renderer.draw_calls`, `pryzm.renderer.triangles`.

## Tests

```sh
npm test --workspace=@pryzm/renderer        # 27 tests (mode + camera + pipeline)
```
