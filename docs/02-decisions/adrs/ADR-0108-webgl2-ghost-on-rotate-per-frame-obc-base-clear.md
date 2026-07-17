# ADR-0108 — WebGL2 ghost/duplicate-on-rotate: per-frame OBC base framebuffer clear

- **Status:** ACCEPTED (2026-07-02) — IMPLEMENTED.
- **Tag:** `§FIX-WEBGL2-GHOST-ON-ROTATE` (audit W2.2 / L-05 / Q5 / F7).
- **Owner:** renderer (`@pryzm/renderer-three`) + editor engine (`apps/editor/src/engine/initScene.ts`).
- **Affects:** `RenderPipelineManager` (lightweight WebGL render path),
  `apps/editor/src/engine/initScene.ts` (OBC base-clear closure + boot/live-swap wiring).
- **References:** [C04](../contracts/C04-RENDERING-AND-SCHEDULING.md) (single THREE owner P2,
  single rAF P3), [ADR-0261](./ADR-0261-webgl2-render-on-move-and-wall-drag-defer.md)
  (`§PERF-WEBGL2-RENDER-ON-MOVE` — the continuous per-frame WebGL2 repaint this defect rides on),
  [ADR-0076] (`§PERF-WEBGPU-FRAGMENT` — WebGL default + backend toggle),
  [ADR-0077] (`§RENDERER-LIVE-SWAP` — live backend swap).

## Context

On the **WebGL2 backend only** (`RendererBackend === 'webgl-fallback'`: a `THREE.WebGPURenderer`
constructed with `forceWebGL: true` — the founder-default `'webgl'` preference, ADR-0076), rotating
the model leaves **trailing / duplicated geometry** that settles once motion stops. Native WebGPU is
clean.

Phase 5 uses **two stacked canvases**:

1. **OBC base canvas** (lower z-index) — `OBCF.PostproductionRenderer`, `autoClear = false`
   (`BimWorld.ts`), locked to MANUAL and **silenced** in Phase 5 (it never renders again). Its WebGL
   context is created `preserveDrawingBuffer: false`.
2. **PRYZM overlay canvas** (`z-index: 2`, `alpha: true`) — the `pryzmRenderer`, cleared to
   **transparent** every frame (`setClearAlpha(0)`), so the OBC base shows through its transparent
   pixels.

`§FIX-OBC-BASE-STALE-COMPOSITE` clears the OBC base **once** at activate / live-swap, on the
assumption that a silenced renderer stays clear forever. That holds at rest. But once ADR-0261's
`§PERF-WEBGL2-RENDER-ON-MOVE` drives a **continuous per-frame** overlay repaint during orbit/pan/zoom,
the OBC base buffer (`preserveDrawingBuffer: false`) can **re-present stale content** frame-to-frame
(driver-dependent buffer re-presentation for a non-preserved, non-redrawn context). The old geometry
then shows **through** the transparent overlay while the overlay paints the **new** camera positions
→ both the live and the stale geometry are visible at once = the reported ghost/duplicate-on-rotate
trail. It "settles" when motion stops because the loop idles and the last overlay frame lands over a
base that is no longer being re-presented in motion.

This is the WebGL2-only companion to ADR-0261: the render-on-move fix made the overlay repaint every
frame, but nothing kept the **base underneath it** clean every frame.

## Decision

Re-clear the OBC base framebuffer **per lightweight move-frame**, WebGL2 path only.

- **`RenderPipelineManager.setPreLightweightFrameHook(hook | null)`** — a new setter that injects an
  optional callback. `render()` invokes it at the **start of the lightweight branch**, immediately
  **before** the overlay `renderer.render(scene, camera)`. The hook is consulted **only** inside the
  `_lightweightWebGlActive` branch — which is set true **exclusively** on the `'webgl-fallback'`
  backend. The native-WebGPU TSL path (and the plain `'webgl-only'` OBC-AUTO path) never enter that
  branch, so **WebGPU output is byte-unchanged**. A hook throw is swallowed (best-effort) so a failed
  base-clear can never break the overlay paint.

- **`initScene`** feeds its existing `clearObcBaseFramebuffer` closure (the same
  `§FIX-OBC-BASE-STALE-COMPOSITE` clear: `setClearColor(black, 0)` + `clear(color, depth, stencil)`)
  as that hook when it enables the lightweight path — at **boot** and after a **live-swap** to
  `'webgl-fallback'` — and passes `null` on a live-swap **to** real WebGPU (disarm). The closure
  gained a `quiet` flag so the per-frame call site does not flood the console; the one-shot
  activate/live-swap callers keep their single audit log.

Why keep the OBC-specific clear in `initScene` rather than in `renderer-three`? `renderer-three` (L1)
must not import OBC (L4 `core-app-model` / OBC libs) — that is a layer inversion (P2/boundaries). RPM
therefore owns only a generic, backend-gated per-frame hook; the app supplies the OBC knowledge. This
reuses the **existing** `clearObcBaseFramebuffer` seam rather than adding a parallel one.

## Alternatives considered

- **Set `preserveDrawingBuffer: true` on the OBC base context.** Rejected: it is the WebGPURenderer /
  OBC context, not freely reconfigurable here, and would change unrelated thumbnail/readback behaviour;
  it also does not clear the stale content, it only pins it.
- **Give the overlay an opaque clear (paint a background so the base never shows through).** Rejected:
  the overlay is intentionally transparent so VPT/bloom modes and the OBC canvas can co-exist; an
  opaque overlay would break those modes.
- **Revive OBC's own render loop on the webgl-fallback path.** Rejected for the same reason as ADR-0261:
  in Phase 5 OBC is deliberately silenced (its WebGL shadow-map render destroys PRYZM shadow textures
  mid-submit). The PRYZM path must own the paint.
- **Clear the base only on `beginMotion`/`controlstart` (once per drag).** Rejected: the stale buffer
  can resurface on **any** frame during the damping tail; a per-frame clear is the robust guarantee and
  a full-viewport `clear()` on an already-empty base is cheap.

## Consequences

**Positive**
- WebGL2 orbit/pan/zoom no longer trails; the transparent overlay is the sole visible surface every
  frame throughout the motion + damping tail.
- Zero change to native WebGPU (the hook is unreachable on that path) and to `'webgl-only'`.
- Reuses the existing `clearObcBaseFramebuffer` closure and the existing lightweight-render toggle
  sites (boot + live-swap) — no new subsystem, no new rAF (P3), THREE access stays in `renderer-three`
  (P2). `setPreLightweightFrameHook` is a pure setter (no I/O → no span needed, per P8).

**Negative / risk**
- One extra full-viewport `clear()` on the OBC base per WebGL2 move-frame. Negligible (it is a bare
  clear of a non-redrawn context; post-FX is off on this path by design) and only during motion (the
  loop idles at rest).
- The hook must be disarmed on a live-swap to WebGPU — handled by passing `null` alongside
  `setLightweightWebGlRender(false)` at the swap site.

## Acceptance criteria

- On `'webgl-fallback'`, `RenderPipelineManager.render()` invokes the injected hook **before** the
  overlay `renderer.render` on every lightweight frame; passing `null` disarms it; a throwing hook does
  not break the paint; the hook is never entered on the real-WebGPU path
  (`RenderPipelineManager.backend.test.ts` — `§FIX-WEBGL2-GHOST-ON-ROTATE` block, 5 tests, all green).
- In-browser (WebGL backend): rotating a multi-wall model shows no trailing/duplicated geometry;
  WebGPU output byte-unchanged.
