# ADR-0267 — Auto-WebGL fallback for heavy scenes (Auto backend mode)

- **Status:** ACCEPTED (2026-07-17) — IMPLEMENTED (awaiting live WebGPU confirmation before the L-362 audit row is marked Fixed). **AMENDED 2026-07-17 (§Fix-1 / §Fix-2, L-366)** — a live Fly run showed the reused `isHeavyModel` gate did NOT trip for a ~1,300-element / 6-level / ~1,645-mesh residential building, so **no swap fired** and it device-lost on WebGPU. The swap now uses a **dedicated, lower threshold** (§Fix-1) decoupled from `isHeavyModel`; the transmission guard is **hardened to the non-batched resi path** (§Fix-2). See the two amendment blocks below.
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
  - **L-361** (the WebGPU batch-resi device-loss cascade this mitigates), **L-362** (the original
    Auto-WebGL work), **L-364** (§L-361-WEBGPU-TRANSMISSION-GUARD, hardened by §Fix-2), **L-366**
    (the §Fix-1 / §Fix-2 / §Fix-3 amendments in this ADR).
  - `packages/renderer-three/src/pipeline/RenderPipelineManager.ts` — public
    `neutralizeTransmissionForWebGPU()` (§Fix-2); `apps/editor/src/types/globals.d.ts` — its typed
    window declaration.

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
3. **Device-loss-risk-for-WebGPU-swap heuristic tripped** — a **DEDICATED threshold** (§Fix-1
   below), **NOT** `isHeavyModel`. The swap fires when the scene has **≥ 400 top-level BIM elements
   OR ≥ 1000 meshes**. (Original design reused `isHeavyModel` — ≥ 15 levels AND ≥ 1000 elems, OR
   ≥ 4000 elems — but that gate is far too high for the swap decision: see §Fix-1.)
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

## Amendment §Fix-1 (2026-07-17, L-366) — dedicated swap threshold (replaces the `isHeavyModel` reuse)

**Why.** A live Fly run generated a residential building of **~1,300 elements / 6 levels / ~1,645
meshes** on Auto+WebGPU. That scene does **not** trip `isHeavyModel` (which needs ≥ 4000 elements or
≥ 15 levels), so **the swap never fired** and the building stayed on WebGPU and device-lost
(`expected a "float"`). Reusing `isHeavyModel` for the swap was the bug: that predicate is owned by
the **massing-LOD** system and must stay HIGH so it never massing-shades a modest building — but the
WebGPU swap must fire on any *normal building generation*, which is an order of magnitude smaller.

**Change.** `maybeAutoSwitchToWebGLForHeavyScene(scene, reason, sceneMeshCount?)` now uses a
**dedicated, decoupled** predicate `isSwapWorthyHeavyScene(elementCount, sceneMeshCount)`:

```
swap when  elementCount ≥ 400   OR   sceneMeshCount ≥ 1000
```

Numbers justified:
- **≥ 400 elements** — a whole building is several hundred+ top-level element roots; a single
  room / manual edit is < ~100. 400 sits comfortably between "trivial edit" (never swap) and
  "building" (always swap), so the founder's ~1,300-element block trips it with wide margin while a
  hand-drawn wall or a one-room edit never does.
- **≥ 1000 meshes** — building geometry explodes into sub-meshes (per-storey prisms, opening insets,
  finishes, frames) far faster than *counted* top-level element roots grow (many arrive with sparse
  `userData.id`/`levelId`, so `countElements` undercounts them). The ~1,645-mesh building crosses
  1000 meshes even in the sub-batch window before its element count is fully wired. This arm is fed
  the live mesh count the `SceneQualityTier` pass already computes (threaded from `runTierPbrPass`);
  the batch GPU-compile-start hook omits it and relies on the element arm.

`isHeavyModel` is **unchanged** and still owned by `LevelScoped3DCullingService` for massing LOD —
the two thresholds are now intentionally **independent** (the LOD system depends on the high one; the
swap needs the low one). The `isHeavyModel` import was removed from `autoWebGLHeavyScene.ts`.

## Amendment §Fix-2 (2026-07-17, L-366) — harden the transmission guard to the non-batched resi path

**Why.** Even on an **explicit-WebGPU** backend (where the swap is correctly suppressed as a respected
override), the `§L-361-WEBGPU-TRANSMISSION-GUARD` (`_neutralizeTransmissionForWebGPU` in
`RenderPipelineManager.ts`) is the only protection — and it **did not fire** for the resi building.
Root cause: the neutralizer had exactly **one caller**, `setShadowPassDisabled('batch', true)`, which
`BatchCoordinator` invokes **only during a batchCoordinator batch** (`BatchCoordinator.ts:1636`). The
residential / office generators add glass **outside** batches (the same structural reason the
Auto-swap needs its own non-batched hook), so the neutralizer never ran on that path and the
`MeshPhysicalNodeMaterial` transmission node graph reached the first post-generation WebGPU render
un-neutralized → `THREE.TSL: Invalid generated code, expected a "float"` → device loss.

**Change.**
- Added a **public** `RenderPipelineManager.neutralizeTransmissionForWebGPU()` that wraps the private
  neutralizer (real-WebGPU-gated `_webGpuActive` + idempotent; no-op on WebGL).
- `initScene.ts` `runTierPbrPass` (the **same non-batched seam** the Auto-swap uses) now calls
  `window.renderPipelineManager?.neutralizeTransmissionForWebGPU?.()` on every non-batched geometry
  add, **before** the next render that would compile the transmission node. `needsUpdate = true`
  inside the neutralizer forces the node material to rebuild WITHOUT the transmission node on that
  next compile (timing is safe: the tier pass runs on the geometry-add macrotask, ahead of the rAF
  render). Coverage note: the guard handles `MeshPhysicalMaterial` with `transmission > 0` (window /
  curtain-wall / furniture glass — the object in the faulting `_renderTransparents` stack); a
  non-physical transparent node crashing is not covered, but the live evidence is physical glass.

Net: on real WebGPU, transmission glass is neutralized before **any** render that would compile the
transmission node graph — on both the batched path (unchanged) and the non-batched resi/office path
(new). WebGL is untouched (`_webGpuActive` gate) and keeps refractive glass.

## Amendment §Fix-3 (2026-07-17, L-366) — heavy scenes fall back to WebGL even under an EXPLICIT WebGPU pin

**Why.** A live run opened a **29-level / 2,115-element / ~12,700-mesh** office tower on an explicit
WebGPU pin and logged `§AUTO-WEBGL-HEAVY — scene is device-loss-risk (2115 elems / 29 levels) but the
backend is EXPLICITLY pinned to WebGPU — respecting the override, NOT switching` — then the tower
device-lost. On this hardware a heavy scene on WebGPU is a near-guaranteed crash, so "respect the
explicit pin on heavy scenes" was the wrong policy: it honoured a preference straight into a crash.

**Change.** `maybeAutoSwitchToWebGLForHeavyScene` now performs the one-time WebGPU→WebGL swap for
**both** `preference === 'auto'` **and** `preference === 'webgpu'` when the scene is device-loss-risk
on real WebGPU. This **supersedes** Decision §1's "explicit 'webgpu' pick is respected, never swap":

- The explicit-WebGPU override is now honoured **only for LIGHT scenes** (they never reach Gate 3, so
  an explicit WebGPU pick still keeps WebGPU + its fidelity for everything the GPU can survive).
- A **heavy / device-loss-risk** scene **always** falls back to WebGL, regardless of the toggle, with
  a distinct one-time warning naming the override path back:
  `§AUTO-WEBGL-HEAVY — device-loss-risk scene (N elems / M meshes / L levels); switched WebGPU→WebGL
  for stability despite the explicit WebGPU pin. Re-pick WebGPU to override.`
- Still **one swap per session**; still a strict no-op on an explicit **`webgl`** pick (already safe).
  The user can force WebGPU back by re-picking it (a fresh heavy load would swap again).

The former separate `_explicitWarnDone` throttle is removed — the once-per-session `_autoSwapDone`
guard now covers the single swap + warning for both prefs.

## Consequences

- **Positive.** On this hardware class, a heavy building generation no longer TDRs the GPU on Auto
  mode — it renders on WebGL (founder-confirmed clean). The first device loss is avoided proactively
  instead of recovered reactively. The device-loss recovery (ADR-0089) is **untouched** and remains
  the net for anything that still slips through (e.g. an explicit-WebGPU user).
- **Negative / accepted.** Heavy scenes lose the WebGPU-only fidelity (transmission glass gloss /
  SSGI / TRAA) on **both** Auto and explicit-WebGPU (§Fix-3); light scenes keep WebGPU under both.
  An explicit **WebGPU** pick no longer keeps a heavy scene on WebGPU — it is forced to WebGL for
  stability (with a warning + "Re-pick WebGPU to override"). The live swap persists `'webgl'`, so the
  choice becomes WebGL for the rest of the session and across reloads until the user re-picks
  Auto/WebGPU — an intentional pin (a fresh heavy load then re-swaps). This matches the founder
  default already being WebGL and the founder's explicit expectation that heavy scenes never stay on
  WebGPU on this hardware.
- **Neutral.** `isHeavyModel` stays owned by `LevelScoped3DCullingService` for the massing LOD;
  §Fix-1 gave the **swap** its own dedicated, lower threshold (`isSwapWorthyHeavyScene`), so the two
  are now independent (the swap no longer imports `isHeavyModel`).

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
  - **Explicit WebGPU + heavy → one swap** (§Fix-3), distinct one-time "switched despite the explicit
    WebGPU pin. Re-pick WebGPU to override." warning.
  - Explicit WebGPU + **light** → no swap (pin honoured; never reaches Gate 3).
  - Explicit WebGL → no-op (already safe). Light scene / WebGL2 fallback / already-swapped → no-op.
  - Threshold (§Fix-1): ≥ 400 elements OR ≥ 1000 meshes trips the swap; a < 100-element manual edit
    does not.
  - §Fix-2: non-batched resi/office glass is neutralized on the tier pass before the first WebGPU
    render (public `neutralizeTransmissionForWebGPU()`).
