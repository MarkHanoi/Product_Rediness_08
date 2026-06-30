# ADR-0087 — Forma AO is opt-in (render-error-guarded) + gentle Overpass mirror fetch

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-06-30 |
| Owner | Geospatial / Cesium Forma view (`apps/editor/src/ui/geospatial`) |
| Supersedes | §SITE-METRIC-OVERPASS-PARALLEL `Promise.any` all-mirror blast (as the building fetch strategy) |
| Tags | §FORMA-AO-OPT-IN · §FORMA-RENDER-ERROR-GUARD · §OVERPASS-GENTLE-MIRRORS |
| Contracts | P8 (≥1 span / exported fn — N/A here, no NEW exported runtime fn carries cross-module side-effects), graceful-degrade discipline |

## Context

Two demo-killing failures in the Cesium "Forma" massing view, both caused by a *cosmetic* or
*aggressive* side-effect crashing/blocking the whole view.

### Bug 1 — "Rendering has stopped" (PRIMARY, demo-killer)

Switching to the geospatial / Forma view rendered the massing (`massing rendered: 570 wall(s)
across 6 storey(s)`) and then **died**:

```
Cesium.js [Cesium WebGL] Fragment shader compile log: …(AO post-process shader)…
Cesium.js An error occurred while rendering.  Rendering has stopped.
RuntimeError: Fragment shader failed to compile.
  $o.showErrorPanel … _onRenderError … Si.render
```

**Root cause.** Forma mode enabled Cesium's **Ambient Occlusion** (AO) HBAO post-process. On the
founder's GPU/driver the AO fragment shader fails to compile. Cesium treats a shader-compile
failure as **FATAL**: it raises `scene.renderError`, shows its error panel, and **STOPS the entire
render loop**. So one optional cosmetic effect blanked the whole geospatial view — even though the
massing geometry itself had already rendered fine.

### Bug 2 — Overpass `429 Too Many Requests` (secondary)

§SITE-METRIC-OVERPASS-PARALLEL raced **all** building mirrors at once (`Promise.any`). Together
with the roads + water fetches (which each also start with `overpass-api.de`) for the same view,
the primary mirror received a burst of near-simultaneous POSTs → `429` → every mirror failed →
"context buildings unavailable". This pattern looks like abuse to the public endpoints.

## Decision

### §FORMA-AO-OPT-IN — AO defaults OFF, behind a flag

AO adds nothing essential to a massing study (we already have soft shadows + silhouette). It is
no longer constructed or enabled by default. It is gated behind an explicit opt-in
(`window.__pryzmFormaAO === true`, read at mount), and the AO stage is only *built* when wanted —
so the crashing shader is never even compiled in the default path.

### §FORMA-RENDER-ERROR-GUARD — render errors are non-fatal

`CesiumViewport` subscribes to `scene.renderError` at mount. On any render error (the typical
cause being a post-process shader-compile failure) it **disables the AO + silhouette stages**,
sets a `formaPostProcessFaulted` latch so apply/restore never re-enables them, and calls
`requestRender()`. Cesium re-arms its loop on the next render, so dropping the faulty stage
*restores* the view instead of letting Cesium stop the loop and show its error panel. Even an
opted-in AO can therefore never permanently kill the view.

### §OVERPASS-GENTLE-MIRRORS — staggered, bounded-concurrency, 429 back-off

The building fetch no longer blasts every mirror at once. Instead it:

1. tries mirrors with **limited concurrency** (`OVERPASS_MAX_CONCURRENCY = 2`) launched a small
   **stagger** apart (`OVERPASS_STAGGER_MS = 350`), resolving on the first usable response and
   aborting the laggards — keeping the fast-result benefit without the burst;
2. treats a **429** (honouring `Retry-After`) as a **back-off** signal — the offending mirror is
   recorded in a shared cooldown registry (`OVERPASS_RATE_LIMIT_COOLDOWN_MS = 60 s` floor) and
   skipped until it expires;
3. reuses the existing per-bbox memory + localStorage caches (unchanged), so revisits don't
   re-hit mirrors at all.

The cooldown registry is **exported** (`isOverpassMirrorCoolingDown`,
`noteOverpassMirrorRateLimited`, `clearOverpassMirrorCooldowns`) so the roads/water Overpass
loaders — which already import from `contextBuildings` — can honour the same back-off. (Adopting
it in `contextRoads.ts` / `contextWater.ts` is a follow-up; they already iterate mirrors
sequentially, so they are not the primary abuse source.)

All failures remain **non-fatal**: every degrade path resolves to an empty collection.

## Consequences

- The Forma view renders the massing even when AO is unavailable (the common case on the
  founder's GPU). No more "Rendering has stopped".
- The public Overpass endpoints are contacted far more gently; a 429 pauses a mirror instead of
  retrying it in a loop. Worst case (all mirrors cooling down) degrades silently to no context.
- AO can still be turned on for capable GPUs via `window.__pryzmFormaAO = true`, and is auto-shed
  if it then faults.

## Verification

- **Bug 2 (automated):** `apps/editor/__tests__/overpassMirrorThrottle.test.ts` — cooldown
  registry (note → cooling → expire → Retry-After floor), 429 records a shared cooldown + degrades
  to empty, a pre-cooled mirror is never contacted, concurrency/stagger constants are sane.
- **Bug 1 (manual):** the AO-disable / render-error guard is hard to unit-test (needs a real
  WebGL context that fails to compile the AO shader). Manual check: open the Forma view on the
  affected GPU — the massing renders, console logs
  `FORMA mode applied: … AO=off (opt-in via window.__pryzmFormaAO)`; force AO with
  `window.__pryzmFormaAO = true` before mount on a failing GPU and confirm the
  `§FORMA-RENDER-ERROR-GUARD` log fires and the scene keeps rendering instead of showing Cesium's
  error panel.
