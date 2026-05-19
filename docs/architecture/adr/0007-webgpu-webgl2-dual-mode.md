# ADR-007 — WebGPU / WebGL2 dual-mode renderer strategy

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-04-26 (S06 D1) |
| Owner | Track B |
| Cites PRYZM-1 evidence at | greenfield — `@webgpu/types` already in `package.json` deps but unused (zero `navigator.gpu` references in `src/`); existing `src/rendering/createRenderer.ts` is WebGL2-only with 4 `(window as any)` casts |

## Context

PRYZM 1 ships exclusively against WebGL2 via `THREE.WebGLRenderer`. The project package already declares `@webgpu/types` as a devDependency but has zero runtime references — a stalled migration we are now picking up.

Two facts force a dual-mode design rather than a hard cut to WebGPU:

1. **Browser availability is uneven.** WebGPU is enabled by default in Chrome / Edge ≥113, in Firefox Nightly behind a flag, and in Safari behind a flag (Safari 17.4 enables it on macOS but not stably elsewhere). Linux Chromium without the right GPU stack still fails `navigator.gpu.requestAdapter()`. Production users on legacy enterprise machines remain on WebGL2-only Chromium for the foreseeable Q1.
2. **Headless CI cannot exercise WebGPU.** `chrome --headless` on the typical Linux runner does not expose `navigator.gpu`. The S03 `idle-cpu` and S06 `orbit-fps` benches must run on the CI matrix; if they could only run under WebGPU we'd lose the gate.

A "WebGPU-only with WebGL2 fallback at boot" approach is therefore the pragmatic floor. PASCAL post-FX (the heavy `RenderPipelineManager.ts` PRYZM 1 ships) stays out of 1A entirely — both modes render a single forward-pass `MeshPass` only.

## Decision

The PRYZM 2 renderer exposes a single boot entry:

```ts
Renderer.init(canvas: HTMLCanvasElement, mode: 'auto' | 'webgpu' | 'webgl2'): Promise<Renderer>
```

The `mode` parameter is **single-valued** and resolved as follows:

| Requested | Detection | Outcome |
|---|---|---|
| `'auto'` (default) | Try WebGPU first via `navigator.gpu?.requestAdapter()`. If it succeeds and returns a non-null adapter, boot WebGPU. Otherwise boot WebGL2. | The boot path that user-facing `?pryzm2=1` URLs receive when no `&mode=...` is present. |
| `'webgpu'` | Same WebGPU detection. **If WebGPU is unavailable, throw `RendererInitError('WebGPU unavailable on this client')`.** | Used by the WebGPU side of the visual-diff parity matrix; production code never sets this explicitly. |
| `'webgl2'` | Skip WebGPU detection entirely. Create `WebGL2RenderingContext` from the canvas. | Used by the WebGL2 side of the visual-diff parity matrix and by the user-facing `?pryzm2=1&mode=webgl2` URL. |

The detection flow lives in `packages/renderer/src/Renderer.ts`. Tests stub `navigator.gpu` to exercise both branches without a real GPU.

### Visual-diff parity gate

Both modes render the Hello Cube fixture into off-screen canvases at 256×256. `pixelmatch` compares the two PNGs. The CI gate hard-fails if **the per-pixel diff exceeds 2 px after the OTel overlay region (top 24 px) is masked out** (S06-T9). Font rendering is not in scope for 1A — masks become unnecessary in 1B when text labels appear.

### Bundle-size implications

`@pryzm/renderer` re-exports a thin `Renderer` class. Internally it lazy-imports the WebGPU code path (`./internal/webgpu.ts`) only when WebGPU is actually selected — the WebGL2 path stays in the initial chunk because it is the always-available fallback. This keeps the `?pryzm2=1` initial chunk under the 1.8 MB gzip ceiling (S06-T10) even when `three/webgpu` enters tree-shaking-resistant code paths.

### Logging the mode at startup

Every `Renderer.init()` call records its resolved mode under the OTel attribute `pryzm.renderer.mode = 'webgpu' | 'webgl2'` on the boot span (`pryzm.renderer.init`). This is what makes the S06 D9 demo's "switch from WebGPU to WebGL2 via flag" line legible in the trace overlay.

## Alternatives considered

1. **WebGPU-only.** Rejected because S04/05 CI cannot exercise it — gates would be informational only, defeating the bench-harness investment.
2. **WebGL2-only with WebGPU added in 2A.** Rejected because the visual-diff parity test only catches drift early if both modes are wired from the moment `MeshPass` exists. Adding WebGPU later would have meant rewriting the renderer factory in 2A, paying the integration cost twice.
3. **`mode: 'webgpu' | 'webgl2'` (no `'auto'`).** Rejected because the user-facing flag `?pryzm2=1` (no mode suffix) needs a default; making callers always pass a mode pushes the detection logic into bootstrap, repeating it across the bench harnesses.

## Consequences

- **Positive.** Both renderer paths are exercised on every CI run; the visual-diff gate catches GPU-driver drift the moment it appears.
- **Positive.** The user can force WebGL2 when WebGPU misbehaves on a particular driver (`?pryzm2=1&mode=webgl2`) without a redeploy.
- **Negative.** Two THREE.js renderer code paths mean two mesh-material pipelines to keep parity in. We mitigate by keeping 1A's pipeline minimal (`ClearPass` + `MeshPass`, no post-FX, one `MeshStandardMaterial`).
- **Negative.** The WebGPU init can take ≥ 100 ms on cold adapter-request on Chromium / Linux. We surface this in the boot span so it is visible in profiles; if it becomes a UX issue in 1B we add a "WebGL2 first, swap to WebGPU on idle" two-stage boot.

## Follow-ups for 1B / 1C

- ADR-008 will revisit when WebGPU becomes the unconditional default (target: Chrome ≥120 ships fully).
- ADR-009 will document the post-FX pipeline once we re-introduce PASCAL (planned for 1B/M5).
- The visual-diff fixture set will grow with each new primitive committer (walls, slabs, doors, windows…) — each addition lands a fixture pair under `apps/editor/__tests__/visual-fixtures/<primitive>/{webgpu,webgl2}.png`.
