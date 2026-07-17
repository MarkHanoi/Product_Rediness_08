# ADR-0077 — Live, In-Place Renderer Backend Swap (§RENDERER-LIVE-SWAP)

| Field | Value |
|---|---|
| Status | **Proposed** — 2026-06-26 |
| Tag | §RENDERER-LIVE-SWAP · 2026-06-26 |
| Owner | Graphics / Engine lead |
| Supersedes | [ADR-0076](./ADR-0076-webgpu-fragment-performance.md) — only its **reload-on-toggle** sub-decision (the corner GPU pill's persist+`location.reload()` behaviour). The rest of ADR-0076 (fragment-engine perf, render-quality tiers, §PERF-WEBGL2-NO-TSL backend gating) stands unchanged. |
| Related | [ADR-0206](./ADR-0206-default-render-mode.md) (default render mode), [ADR-0007](./ADR-0007-webgpu-webgl2-dual-mode.md) (WebGPU/WebGL2 dual mode), [ADR-0222](./ADR-0222-renderer-topology-backend-runtime.md) |
| Related contracts | C04 (Rendering & Scheduling); C01 P1 (single composition root), P2 (single THREE owner), P3 (single rAF), P4 (no `(window as any)`), P8 (every new exported function carries ≥1 OTel span) |

---

## Context

The founder-requested corner GPU pill (`RendererBackendToggle`) lets the user force
the GPU backend between WebGPU (the full TSL pipeline — SSGI / TRAA / soft shadows /
outlines) and plain WebGL2 (a lightweight forward render). It is both an A/B perf
tool and a stability escape hatch.

Under ADR-0076 the renderer was resolved **once** at engine boot, so the toggle
**persisted the choice to localStorage, set a one-shot `sessionStorage` reopen flag,
and called `location.reload()`** — the next boot booted cleanly into the chosen
backend via `createRenderer()`. ADR-0076's header documented *why* a naive live
hot-swap was rejected at the time: the scene, camera, `RenderPipelineManager`,
frame-loop and other services all captured the **original** renderer instance, so
swapping the renderer underneath them "collapsed the viewport".

The reload path works but is heavy: a full page reload tears down the entire engine,
re-fetches bundles, re-opens the project (via the reopen flag → `PlatformRouter`),
re-warms the GPU, and re-runs the whole boot pipeline. On a populated building this is
several seconds of black screen and a lost interaction context every time the user
toggles — unacceptable for an A/B perf tool whose whole value is *instant* comparison
on the same model.

The key realisation that unblocks the live swap: **the scene graph (THREE.Scene,
geometries, materials, lights, camera) is backend-agnostic CPU-side data and does NOT
need to be rebuilt.** THREE re-uploads geometry/material GPU resources lazily on the
next render against the new renderer/device. The only real work is to (1) dispose the
old renderer + its TSL pipeline cleanly, (2) construct the new renderer on a fresh
canvas in the same DOM slot, (3) **re-bind every service that captured the old
renderer**, (4) re-establish the TSL pipeline appropriate to the new backend, and
(5) resume the frame loop — keeping the camera and current view exactly as they were.

## Decision

**Switching the renderer backend is a LIVE, in-place rebind — not a page reload.**
A single composition-root rebind layer, `swapRendererBackend(pref)`, is defined
**inside `initScene`** (where every renderer-bound reference already lives) and
registered on the typed global `window.pryzmSwapRendererBackend`. The corner toggle
calls it instead of reloading. It still **persists** the preference (so a fresh boot
honours the choice) but never reloads.

The rebind layer performs, in order:

1. **Stop the single rAF loop** (`UnifiedFrameLoop.stop()`). P3 — we re-start *this*
   loop after the rebind; no second loop is created.
2. **Dispose the old TSL pipeline** via `RenderPipelineManager.dispose()`, which routes
   through `_safeDisposeRenderPipeline()` and its §I2 `pipeline.usedTimes` device-loss
   guard.
3. **Build the new renderer on a fresh `<canvas>` in the same `#container` DOM slot**
   via the canonical `createRenderer()` path (a WebGPURenderer is bound to one canvas
   for its lifetime, so a new overlay canvas is minted rather than reusing the old one).
   `createRenderer()` reads the just-persisted preference, so behaviour is identical to
   a fresh boot.
4. **Re-bind the renderer-bound services** to the new renderer:
   `pryzmRenderer` / `pryzmCanvas` / `pryzmRendererBackend` closure refs, the window
   globals (`window.pryzmRenderer`, `window.pryzmCanvas`), the resize sync, and the
   `RenderPipelineManager` (`bind()` + `activateSSGI()` + `activateOutlines()` when the
   new backend is real WebGPU). The `RenderingPipelineCoordinator` render-quality tier
   reads `window.renderPipelineManager.status.webGpuActive` **at call-time**, so it picks
   up the new backend automatically on the next geometry-add — no re-bind needed.
   `RenderPerformanceService` is bound to the **OBC** renderer
   (`postproductionRenderer.three`), which is **never** swapped — so it needs no re-bind.
5. **Re-establish the TSL pipeline for the new backend.** §PERF-WEBGL2-NO-TSL (ADR-0076)
   still governs: only a **native `webgpu`** backend may run the TSL pipeline;
   `webgl-fallback` (WebGPURenderer with `forceWebGL` → WebGL2 backend) stays on the
   lightweight WebGL path. The new backend flag is threaded into `bind()` so it never
   re-probes the renderer class.
6. **Dispose the old renderer + remove the old canvas** (only on the success path, after
   the new renderer is live, so there is no blank frame), then **resume the rAF loop**.
   The PASCAL render callback closes over the *same* `RenderPipelineManager` instance
   (now rebound), so the callback needs no re-wire.

**Robustness / fallback.** If the new renderer construction fails (e.g. WebGPU
unavailable on this device, or `createRenderer` returns a non-TSL `webgl-only`
backend), the swap **rolls back**: it re-binds the existing pipeline to the *old*
renderer and resumes the loop so the viewport is never left dead, returns `false`, and
the toggle falls back to the **legacy ADR-0076 reload path** (`_reloadInto`). The swap
is also guarded against re-entrancy (an in-flight swap is ignored) and against the
"Phase 5 never activated" case (no PRYZM overlay renderer to rebind → return `false` →
reload fallback).

**Compliance.** P1 — the rebind layer lives in the one composition root (`initScene`);
no parallel runtime wiring is created. P2 — `import * as THREE` stays only in
`@pryzm/renderer-three`. P3 — the single rAF in the frame scheduler is stopped and
re-started, never duplicated. P4 — the entry point is the typed global
`window.pryzmSwapRendererBackend` (declared in `globals.d.ts`); no `(window as any)`.
P8 — `swapRendererBackend` records a `pryzm.renderer.swap` OTel span with from/to
backend + outcome attributes.

## Consequences

**Good.**
- Backend switching is sub-second and in-place: project stays open, camera/view stays
  put, the viewport keeps rendering. The pill becomes a genuine instant A/B perf tool.
- The known-good fresh-boot renderer-construction path (`createRenderer`) is **reused**
  for the swap, so the new renderer behaves identically to a boot into that backend.
- The reload path is retained as a fallback, so the toggle is never worse than before.

**Trade-offs / risks.**
- This is GPU-runtime code that cannot be exercised by `tsc` or unit tests. The dispose
  → reconstruct → rebind sequence must be verified in a live browser on
  `pryzm.fly.dev` (both directions: WebGPU→WebGL and WebGL→WebGPU, on a populated
  building, confirming camera/view persistence and no GPU-validation error flood).
- A device-loss during the swap window is handled by the existing `createRenderer`
  device-lost recovery + the §I2 `usedTimes` guard; the rollback path covers a clean
  construction failure.

## Alternatives considered

- **Keep ADR-0076's reload-on-toggle.** Rejected: several seconds of black screen + a
  full re-boot per toggle defeats the A/B-perf purpose. Retained only as a fallback.
- **Reuse the old canvas for the new renderer.** Rejected: a `WebGPURenderer` binds to a
  single canvas/context for its lifetime; swapping in a fresh canvas in the same DOM
  slot is the clean, THREE-supported path and matches the boot-time overlay-canvas
  pattern.
- **A second composition root / parallel wiring for the swapped renderer.** Rejected —
  violates P1. The rebind layer is defined inside the existing `initScene` root so it
  closes over the real captured references.
