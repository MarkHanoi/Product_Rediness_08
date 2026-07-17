# ADR-0267 — Auto-WebGL fallback for heavy scenes (Auto backend mode)

- **Status:** ACCEPTED (2026-07-17) — IMPLEMENTED (awaiting live WebGPU confirmation before the L-362 audit row is marked Fixed).
- **Owner:** editor engine (`apps/editor/src/engine`) + renderer factory (`apps/editor/src/rendering`).
- **Affects:**
  - `apps/editor/src/rendering/autoWebGLHeavyScene.ts` (**new** — the proactive-swap guard),
  - `apps/editor/src/engine/initBatchLifecycle.ts` (batch GPU-compile-start hook — batched generators),
  - `apps/editor/src/engine/initScene.ts` (`runTierPbrPass` per-add tier pass — non-batched generators),
  - `packages/core-app-model/src/rendering/LevelScoped3DCullingService.ts` (`isHeavyModel` exported as the shared heuristic).
- **References:**
  - [C04](../contracts/C04-RENDERING-AND-SCHEDULING.md) §1.4 (WebGL/WebGPU backend selection), P2 single-THREE-owner, P3 single rAF, P8 spans.
  - [C10](../contracts/C10-OBSERVABILITY-AND-PERF-BUDGETS.md) heavy-scene perf-budgets.
  - [ADR-0076 §PERF-WEBGPU-FRAGMENT] — WebGL default + the corner backend toggle (Auto/WebGPU/WebGL) + the persisted `pryzm.renderer.backend` key.
  - [ADR-0077 §RENDERER-LIVE-SWAP] — the live in-place backend swap (`window.pryzmSwapRendererBackend`) this ADR reuses.
  - [ADR-0089] — non-fatal WebGPU device-loss recovery (the REACTIVE safety net this ADR complements, does not replace).
  - `§FIX-HEAVY-SCENE-3D-SCALABILITY` (L-139) — the device-loss recovery cap → WebGL safe-mode; `§FIX-MASSING-LOD-THRESHOLD-TOO-AGGRESSIVE` (L-164) — the `isHeavyModel` heuristic this ADR reuses verbatim.
  - **L-361** (the WebGPU batch-resi device-loss cascade this mitigates), **L-362** (this work).

## Context

Generating a residential / office building on the **WebGPU** backend reliably device-losses some
GPUs (the founder's Windows box): `THREE.TSL: Invalid generated code, expected a "float"` at PSO
compile and/or `WebGPU Device Lost: "A valid external Instance reference no longer exists"
(reason: unknown)` — a GPU-driver watchdog reset (TDR) triggered by the heavy-scene PSO-compile
storm + the transmission-glass TSL node graph. It is **NOT a recent regression** (reproduced across
many commits, including before every suspected commit): it is a fundamental WebGPU heavy-scene
instability on that hardware. The **identical building renders cleanly on WebGL** (founder-confirmed
repeatedly).

L-361 chased the per-trigger seeds (non-finite `attenuationDistance` on transmission glass; the
curtain-wall PSO / shadow-rebuild storm). Each fix was correct hardening but did not stop the
crash — a whack-a-mole against a driver-level watchdog. The founder-approved direction is to stop
sending heavy scenes to a backend that cannot survive them **on this class of hardware**, while
keeping WebGPU's nicer fidelity for the light scenes it handles fine.

A **reactive** safety net already exists: `createRenderer.ts` §FIX-HEAVY-SCENE-3D-SCALABILITY counts
WebGPU device losses and, after the cap, drops to a stable WebGL safe-mode (ADR-0089). But it fires
only **after** the GPU is already lost — and on a truly unlucky box the WebGL2 fallback can be lost
too, reaching the §L-324 terminal "reload required" state. We want to avoid the first loss entirely.

### The backend toggle has three modes

The corner toggle (ADR-0076 / ADR-0077) persists `pryzm.renderer.backend` ∈ {`auto`, `webgpu`,
`webgl`}. The unset default is `'webgl'` (§PERF-WEBGPU-FRAGMENT — the stable, fragment-engine-suited
path). `'auto'`/`'webgpu'` use the native-WebGPU-first chain. Only `'auto'` is meant to be adaptive.

## Decision

Change **only** the **Auto** mode. Add a proactive guard,
`maybeAutoSwitchToWebGLForHeavyScene(scene, reason)`
(`apps/editor/src/rendering/autoWebGLHeavyScene.ts`), that live-swaps WebGPU→WebGL **once per
session** when **all** of these hold:

1. **Auto mode only** — `getRendererBackendPreference() === 'auto'`. An explicit `'webgpu'` pick is
   a user override we **respect** (keep WebGPU, log a one-time warning, never swap). `'webgl'` is
   already the safe path.
2. **Real WebGPU backend only** — `window.renderPipelineManager.status.webGpuActive === true` (set
   from `RenderPipelineManager.isRealWebGPUBackend()`). On the WebGL2 fallback there is no WebGPU
   device to lose.
3. **Device-loss-risk heuristic tripped** — **REUSES the exact** `isHeavyModel(levelCount,
   elementCount)` predicate from `LevelScoped3DCullingService` (**≥ 15 levels AND ≥ 1000 elements,
   OR ≥ 4000 elements**), fed the same top-level-element count semantics, so the two subsystems never
   disagree on "heavy".
4. **Once per session** — a module-scoped guard mirrored to `globalThis.__pryzmAutoSwappedToWebGL`,
   set **before** the async swap so the two call-sites can never double-fire.

When they hold, the guard calls the existing `window.pryzmSwapRendererBackend('webgl')`
(ADR-0077 §RENDERER-LIVE-SWAP) — a live, in-place, no-reload rebind that persists `'webgl'` and
pins WebGL for the session, and opens a `pryzm.renderer.auto-webgl-heavy` OTel span (P8).

Log: `§AUTO-WEBGL-HEAVY — scene is device-loss-risk (N elems / M levels; reason=…); Auto mode
switching WebGPU→WebGL to avoid heavy-scene device loss. (Explicit WebGPU selection would override
this.)`

### Where the guard fires (proactive placement)

The whole point is to swap **before** the heavy PSO-compile that TDRs the device. There are two
generation shapes, so there are two call-sites:

- **Batched generators (office / apartment / curtain-wall / slab)** — the hook is
  `BatchCoordinator.setGpuCompileStartCallback` (in `initBatchLifecycle.ts`). This fires at
  `BatchCoordinator` line ~1946, **after** all batch geometry is in the scene (mesh/element count
  accurate) but **before** `endBatchRenderSuppress()` and before any frame renders — for heavy
  scenes the synchronous post-geometry compile is already SKIPPED (§PERF-POSTGEOM-COMPILE-NO-SYNC-
  BLOCK / ADR-0094) and PSOs would compile lazily once rendering resumes. The swap's synchronous
  prefix (`unifiedFrameLoop.stop()` + dispose the old pipeline) runs before the callback returns, so
  **no further WebGPU frame renders** — the PSO storm never reaches the doomed device. The batch's
  own `count` argument is unusable here (≈ 0 for these bus-fed generators — see ADR-0094), which is
  why we detect at compile-start on the live scene, not at batch-start.
- **Non-batched generators (residential-building pipeline)** — that pipeline adds geometry OUTSIDE
  `batchCoordinator` batches (see `initScene.ts` §PERF-WEBGPU-FRAGMENT per-event tier note), so
  GPU-compile-start never fires for it. The hook is the per-add tier pass (`runTierPbrPass`), which
  already runs per geometry-add; as the scene crosses the threshold the guard fires an ordinary live
  swap (rendering is live — the same path the corner toggle uses).

Both call-sites are wrapped in try/catch and are strict no-ops on every gate miss.

## Consequences

- **Positive.** On this hardware class, a heavy building generation no longer TDRs the GPU on Auto
  mode — it renders on WebGL (founder-confirmed clean). The first device loss is avoided proactively
  instead of recovered reactively. The device-loss recovery (ADR-0089) is **untouched** and remains
  the net for anything that still slips through (e.g. an explicit-WebGPU user).
- **Negative / accepted.** On Auto mode, heavy scenes lose the WebGPU-only fidelity (transmission
  glass gloss / SSGI / TRAA); light scenes on Auto keep WebGPU. Users who explicitly select
  **WebGPU** keep it on heavy scenes (override respected) and shoulder the device-loss risk (with the
  recovery net). The live swap persists `'webgl'`, so a user's Auto choice becomes WebGL for the rest
  of the session and across reloads until they re-pick Auto/WebGPU — an intentional pin (a fresh
  heavy load then re-swaps if they return to Auto). This matches the founder default already being
  WebGL.
- **Neutral.** `isHeavyModel` is now `export`ed from `LevelScoped3DCullingService` as the single
  source of truth for "heavy / device-loss-risk"; the massing auto-escalation and this swap share it.

## Alternatives rejected

1. **Keep chasing the per-trigger WebGPU seeds** (finite `attenuationDistance`, coalesce the CW PSO /
   shadow-rebuild storm, gate the L-314 reattach). These are correct hardening and stay in the tree,
   but each addressed one seed while the driver-level TDR persisted — whack-a-mole against a watchdog
   we do not control. Insufficient as the primary fix (L-361 history).
2. **Disable transmission glass / SSGI globally on WebGPU.** Removes fidelity everywhere (including
   the light scenes WebGPU handles fine) and still would not guarantee the PSO-storm TDR is gone.
3. **Rely solely on the reactive device-loss recovery.** It is REACTIVE (fires after the loss) and
   can itself reach the terminal reload state when the WebGL2 fallback is also lost (§L-324). Kept as
   the net, not promoted to the primary mitigation.
4. **Swap at batch START.** The batch-start element `count` is ≈ 0 for the bus-fed office/resi/
   apartment generators (ADR-0094), so heaviness is not yet known there — GPU-compile-start is the
   earliest point the live scene is both fully populated and still pre-render.

## Verification

- Root `tsc --skipLibCheck --noEmit` — 0 errors.
- `pnpm --filter @pryzm/core-app-model typecheck` — 0 errors.
- Logic path (reasoned; a browser run needs the founder's WebGPU box):
  - Auto + real WebGPU + heavy → exactly one swap (guard set before await; second call-site no-ops).
  - Explicit WebGPU + heavy → no swap, one-time warning (override respected).
  - Light scene / WebGL2 fallback / already-swapped → no-op.
