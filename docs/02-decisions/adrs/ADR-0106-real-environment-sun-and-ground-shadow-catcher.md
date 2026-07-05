# ADR-0106 — The Environment & Camera panel drives a REAL sun + an invisible ground shadow-catcher

- Status: Accepted
- Date: 2026-07-05
- Tag: `§FEAT-REAL-ENVIRONMENT` (umbrella); `§FEAT-REAL-ENVIRONMENT-SUN` (sun); `§FEAT-GROUND-SHADOW-CATCHER` (ground)
- Issue: founder L-11 — "Environment & Camera panel must be REAL".
- Scope:
  - `packages/core-app-model/src/rendering/RealSunService.ts` — drives the scene's
    real shadow caster instead of adding a parallel light; adds `real+offset`/`manual`
    modes + `KeyLightHost` seam.
  - `packages/core-app-model/src/rendering/RealEnvironmentService.ts` (new) — orchestrator.
  - `packages/renderer-three/src/GroundShadowCatcher.ts` (new) — invisible L0 receiver plane.
  - `packages/core-app-model/src/rendering/PascalSceneLighting.ts` — exposes `keyLight` +
    `scene` getters (implements `KeyLightHost`); behaviour otherwise unchanged.
  - `packages/core-app-model/src/rendering/SharedRenderingState.ts` — persists panel state.
  - `apps/editor/src/ui/property-panel/ViewPropertiesSection.ts` — real-sun mode, time-of-day,
    ground-shadow toggle, persisted post-processing.
  - `apps/editor/src/engine/initScene.ts` — wiring (bind + enable + event bridge).
  - `packages/runtime-composer/src/types.ts` — 4 new typed panel events.
- Consistent with (does NOT regress): ADR-0111 / `§FIX-SHADOW-*` (shadow-freeze device-loss
  paths), `§PERF-HEAVY-SHADOW-OFF` (heavy/nav shadow suppression), L-59 SSGI/TRAA defaults.
- Contracts: C04 (rendering/scheduling), C12/C19 (site), C21/ADR-0074 (climate/solar ephemeris).

## Context (founder issue L-11)

The View Properties "Environment & Camera" panel exposed Sun (azimuth / elevation /
intensity), Shadows, Climate/Wind/Population and Post-processing controls, but the SUN
was a fixed studio key with no relationship to the real solar position, and there was no
way to ground floating elements when a scene had no floor slab. The audit required:
real sun (Forma/Cesium ephemeris basis), real shadows + an invisible L0 shadow-catcher so
every element casts a ground shadow, and every button meaningful.

The scene already had the right pieces:

- `PascalSceneLighting` injects a 3-light rig; its **key light is the scene's SOLE real
  shadow caster** and the single lever `§PERF-HEAVY-SHADOW-OFF` toggles.
- `RealSunService` already implemented the NOAA solar-position math (the same basis
  `@pryzm/solar-analysis` / ADR-0074 use), but only as a **separate** `DirectionalLight`.

## Decision

### 8A — the sun is real and DRIVES the existing key light (no parallel light)

`RealSunService` gains a `KeyLightHost` seam (`{ keyLight }`, implemented by
`PascalSceneLighting`). When bound, the solve steers **that** key light's direction /
colour / intensity instead of adding a second `DirectionalLight`. This keeps exactly **one**
shadow caster, so `§PERF-HEAVY-SHADOW-OFF`'s single-lever assumption (`keyLight.castShadow`)
still holds, and doubling the scene's directional energy is avoided.

Two modes:

- `real+offset` (default): direction/intensity come from the real solar position at the
  site lat/lon + time-of-day; the panel Azimuth/Elevation are **offsets** (deg) and
  Intensity is a **multiplier**.
- `manual`: the panel Azimuth/Elevation/Intensity are **absolute** (the legacy studio key).

The drive **never touches** `keyLight.castShadow` and performs **no synchronous GPU
dispose** — moving the light is enough; THREE regenerates the shadow map on its own
schedule, so ADR-0111 / `§SHADOW-DEVICE-LOSS-FIX` are respected. It preserves the light's
existing distance so the shadow-frustum coverage is unchanged. The default enable solves
for local **midday** so the authoring scene is never dark at load regardless of wall-clock
time at the site.

### 8B — an invisible L0 ground shadow-catcher

`GroundShadowCatcher` (renderer-three, P2) is a large `ShadowMaterial` plane at the lowest
level's elevation: `receiveShadow = true`, `castShadow = false`, `opacity < 0.5` (so it is
invisible except where a shadow falls AND `PascalSceneLighting`'s shadow-flag traversal
skips it — it never becomes a caster), `raycast` disabled (never intercepts a pick/snap
ray), seated a hair below the datum so a real slab wins the depth test. It adds **zero**
casters, so on heavy/nav scenes that drop the shadow pass it simply shows no ground shadow.
Toggling it hides the plane with no GPU teardown (reversible, ADR-0111 safe).

### Orchestration + panel bridge

`RealEnvironmentService` (core-app-model) owns one `RealSunService` (bound to the key
light) + one `GroundShadowCatcher`, and exposes `setSunMode / setSunOffsets / setSunTime /
setGroundShadows / refreshSiteLocation / refreshGroundElevation`. `initScene` binds it to
the live scene + `pascalSceneLighting` + a `siteModelStore` reader (mirroring
`CesiumViewport.readSiteLocation`, so both viewports agree on the sun) + an L0-elevation
reader, enables it, and bridges four new typed runtime events emitted by the panel:
`pryzm-set-sun-mode`, `pryzm-set-sun-offsets`, `pryzm-set-sun-time`,
`pryzm-toggle-ground-shadows`. Panel post-processing/environment toggles persist through
`sharedRenderingState` so a per-selection panel rebuild keeps the user's choices.

## Consequences

- The sun angle now tracks the real site + time-of-day; shadows fall at the real angle.
  This is an intended visual change to the default key light (the point of L-11).
- One shadow caster, one perf lever — `§PERF-HEAVY-SHADOW-OFF` and ADR-0111 are unchanged.
- Climate/Wind/Population/Post-FX buttons were already wired (`§ENV-CLIMATE-VISIBLE`,
  `EnvironmentHud`, initUI post-FX listeners) and remain so.
- SSGI/TRAA defaults (L-59) are untouched — this ADR adds no post-FX pass.

## Alternatives considered

- **Add a second sun DirectionalLight** (the pre-existing `RealSunService` standalone
  path): rejected — doubles directional energy and defeats the single-caster perf lever.
  Kept only as the fallback when no `KeyLightHost` is bound (legacy VisualizationEnginePanel).
- **A real slab as shadow receiver**: rejected — not every scene has a ground slab, and a
  visible slab is not wanted. An invisible `ShadowMaterial` plane grounds everything with
  zero geometry cost.

## Tests

- `packages/core-app-model/src/rendering/RealSunService.driveKeyLight.test.ts` — a
  sun-direction/offset control moves the key light; no parallel light added; `castShadow`
  never touched; manual mode uses absolute angles; disable restores the studio default;
  distance (frustum coverage) preserved.
- `packages/renderer-three/__tests__/GroundShadowCatcher.test.ts` — receive-only, transparent
  ShadowMaterial, non-raycastable, attach/detach, elevation placement, reversible toggle.
