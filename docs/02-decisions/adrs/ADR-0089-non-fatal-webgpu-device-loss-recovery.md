# ADR-0087 — Non-fatal WebGPU device-loss recovery (downgrade, never "Rendering has stopped")

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-06-30 |
| Owner | Render pipeline (`packages/renderer-three` · `apps/editor` createRenderer / initScene) |
| Tag | §RPM-RECOVERY-DOWNGRADE |
| Builds on | §I2 / §FIX-DISPOSE-USEDTIMES (dispose-time device-loss family), §PERF-WEBGL2-NO-TSL, ADR-0261 (lightweight WebGL render), ADR-0077 (§RENDERER-LIVE-SWAP) |
| Contracts | C04 (rendering/scheduling), P3 (single rAF), P8 (≥1 span / exported fn) |

## Context

DEMO-KILLER (prod, 2026-06-29, office-building circular plate). A hard error overlay appeared in
the viewport: **"An error occurred while rendering. Rendering has stopped. RuntimeError: Fragment
shader failed to compile."** Console sequence:

```
[RenderPipelineManager] §I2 pipeline.usedTimes is not a number — patching to 0 …
[RenderPipelineManager] §FIX-DISPOSE-USEDTIMES — old pipeline dispose error (non-fatal, stale GPU session after device loss) …
[RenderPipelineManager] Phase: phase4 | WebGPU: true | SSGI: true | TRAA: false
[createRenderer] WebGPU device recovered — pipeline rebound.
… RuntimeError: Fragment shader failed to compile → "Rendering has stopped."
```

**Root cause.** On a WebGPU **device loss + recovery**, `createRenderer`'s `device.lost` handler
recreates the renderer and rebinds the pipeline; the live-swap path (`§RENDERER-LIVE-SWAP`) does
the same on a backend toggle. Both then rebuilt the **heavy phase-4 TSL pipeline** (SSGI +
outlines) against the *freshly recovered* device via `bind()` → `activateSSGI()` →
`activateOutlines()`. On some devices a generated fragment shader fails to compile on the recovered
device. THREE's WebGPU `Renderer.render()` reports `RuntimeError: Fragment shader failed to
compile` and flips its internal **"Rendering has stopped"** latch — the whole render loop dies and
the user is stuck behind a dead overlay until a hard refresh.

The trigger is the **device-recovery pipeline rebuild**, not the geometry (the circular plate just
happened to be on screen). Retrying the *same* heavy graph recompiles the *same* failing shader, so
the existing `MAX_RETRIES` ladder cannot help — it only delays the same fatal outcome.

## Decision

Device-loss recovery is **non-fatal**: a shader-compile failure on the recovered device
**downgrades to the lightweight phase-2 pipeline** (MRT scene + background blend, no post-FX)
instead of killing the render loop. The viewport keeps rendering plain — no "Rendering has stopped"
overlay. The hard crash dialog is reserved for genuinely unrecoverable states (even phase-2 fails).

### Mechanics

1. **Classifier** — `isShaderCompileError(err)` in `packages/renderer-three/src/safeDispose.ts`
   (a sibling of the existing `isUsedTimesDisposeError`). Matches the THREE WebGPU
   "`<stage> shader failed to compile`" RuntimeError and WGSL compile-log variants by message
   text (survives minor THREE upgrades / bundler renaming). A non-shader RuntimeError is **not**
   matched, so real logic bugs still surface.

2. **`RenderPipelineManager` downgrade** —
   - `render()`'s catch block: a shader-compile throw short-circuits the retry ladder and calls
     `_downgradeToLightweightPipeline()` instead of escalating to `phase='error'`.
   - `_downgradeToLightweightPipeline()` strips SSGI/TRAA/outlines, sets the `_postFxDisabled`
     latch, and rebuilds the minimal phase-2 pipeline. Only a phase-2 build failure reaches
     `phase='error'` (→ crash overlay).
   - `activateSSGI()` / `activateTRAA()` / `activateOutlines()` no-op while `_postFxDisabled` so
     the heavy graph is not immediately re-built into the same failure.
   - `recoverPipeline(scene, camera, renderer, backendIsWebGPU)` — the public, non-fatal recovery
     entry point: rebinds, attempts the full pipeline, and downgrades on any shader-compile
     failure. Always ends with a rendering viewport (degraded if necessary). Returns the resolved
     phase.
   - `tryUpgradePostFx()` — best-effort re-upgrade on a later idle frame; re-latches on repeat
     failure.

3. **Call sites** — `createRenderer`'s `device.lost` handler and both `§RENDERER-LIVE-SWAP`
   branches (success + rollback) route through `recoverPipeline()` instead of a bare
   `bind()` + `activate*` sequence. Both are defensive (tolerate an older RPM without the method).

P3 is preserved (no new rAF — the existing single FrameScheduler loop drives the downgraded
pipeline). On a real WebGPU backend that compiles cleanly, behaviour is unchanged (full phase-4).

## Consequences

- **Positive.** A forced device-loss → recovery (or backend swap) on a device whose recovered
  session cannot compile the heavy TSL shaders now ends with a **plain, rendering viewport**, never
  the dead "Rendering has stopped" overlay. The crash dialog is reserved for truly unrecoverable
  states.
- **Trade-off.** After a downgrade the viewport runs without SSGI/outlines until `tryUpgradePostFx()`
  succeeds. This is strictly better than a dead viewport and matches the existing
  §PERF-WEBGL2-NO-TSL "lightweight is acceptable" stance.
- **Tests.** `RenderPipelineManager.backend.test.ts` pins: `isShaderCompileError` classification,
  `render()` downgrades (not `phase='error'`) on a shader-compile throw while still retrying
  non-shader throws, and the `_postFxDisabled` latch gating `activate*`.

## Alternatives considered

- **Hard reload on device loss.** Loses unsaved in-memory state and bounces the founder to the hub
  — the very failure mode ADR-0261 / §VCG-CONSECUTIVE-FRAME-GUARD already fight. Rejected.
- **Pre-compile the heavy pipeline before swapping.** THREE compiles lazily at first `render()`;
  there is no reliable pre-warm that distinguishes "will compile" from "will fail" on a recovered
  device without actually rendering. Downgrade-on-failure is the robust fallback.
