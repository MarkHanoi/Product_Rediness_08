# SPIKE — Window-aware sun penetration + per-room daylight (3D-tiles globe + Forma)

**Tracker:** §61 · **Type:** feasibility spike (options + recommendation, NOT implementation) · **Date:** 2026-06-11

## The founder's question

> "Is it possible in Google 3D tiles (3D globe view) that the windows allow the sun to go through the room? Also in the Forma 3D view — so that we can then calculate the average sun in each room depending on the window size and location?"

Two distinct asks, which the spike deliberately separates because they have different right-answers:

- **A — VISUAL:** sun light visibly passing through the window apertures onto the interior floor, in the Cesium globe and the Forma views.
- **B — NUMERIC:** a per-room *average daylight / insolation* metric derived from `{window size · position · façade orientation · sun-path over the day/year · site latitude}`.

## What PRYZM already has (the substrate)

- **Sun position:** `RealSunService` (NOAA sun-path, azimuth/elevation per timestamp/lat-lon), the `VIEW PROPERTIES → Sun Settings` (azimuth/elevation/intensity), the Site-analysis Sun-&-shadow / Sun-path overlays, FORMA.5 climate.
- **Real building geometry in both Cesium views:** **FORMA.6 (v158, 2026-06-11)** now loads the *real* PRYZM building — with actual window VOIDS cut in the walls — into Cesium as a `Cesium.Model` (`fromGltfAsync`, `shadows: ENABLED`) at the site ENU origin, in BOTH the globe and the Forma study. The globe path (`renderRealModelOnGlobe`, §A.21.D49) and the Forma path share this bridge.
- **Window apertures as data:** the window-emission engine (`windowEmission/`) already produces per-room window placements with width/height/sill/offset/host-wall (façade) — the exact inputs ask **B** needs.

## A — Visual sun-through-window

### Cesium globe (Google 3D-tiles)

**Verdict: already largely POSSIBLE, low incremental effort — needs tuning, not new architecture.**

Cesium lights the scene with a single directional sun (`scene.light` = `SunLight`/`DirectionalLight` driven from the sun position) and renders **cascaded shadow maps**. A mesh with *real* wall openings (which FORMA.6 now supplies) casts a shadow with holes where the windows are — so a sunbeam-shaped patch of light DOES fall on the interior floor, **provided**:

1. **Shadows are on for the model AND the receiver.** FORMA.6 sets `shadows: ENABLED` (caster+receiver) on the building model. The interior floor is part of the same GLB → it receives. ✅ already wired.
2. **The sun is above the horizon and the camera/time gives a low-enough elevation** for the beam to reach deep into the room (high noon sun barely penetrates; morning/evening rakes in). Driven by `RealSunService` + the Sun Settings — already adjustable.
3. **Shadow-map resolution is high enough** to resolve a ~1–2 m window aperture at building scale. Cesium's default cascade may be too coarse → the beam edge is soft/blocky. **Tuning lever:** `scene.shadowMap.size`, `maximumDistance`, `softShadows`, cascade count. This is the main work item.
4. **No opaque glass pane blocks it.** If the GLB models a glass infill, it must be transparent (alpha) or the beam stops at the pane. The window builder's glass is translucent — verify the exported material keeps alpha through the GLB.

**Limitations / honest caveats:**
- Cesium shadow maps are a *visual approximation* — not physically-accurate radiance. Good for "you can see the sun coming in," not for a defensible lux number.
- Interior self-shadowing (the room is a box; the roof/ceiling shadows the floor) means the only light entering is through the openings — which is exactly what we want, but it also means ambient/sky fill is absent unless we add an ambient/IBL term (Forma already runs an AO + soft-shadow post pass; the globe uses real imagery lighting).
- Photoreal 3D-tiles context buildings can over-occlude (neighbour shadows) — correct behaviour, but worth noting it affects the result.

### Forma 3D view

**Verdict: same as the globe, and arguably better suited.** Forma already runs a tuned directional key light + soft-shadow + AO post-process (FORMA.2) over the flat-ground study, and FORMA.6 puts the real building (with voids) under it. The abstract white palette actually makes the sun patch on the floor *more* legible than the photoreal globe. Same tuning levers (shadow-map size, sun elevation). Lowest-risk place to ship the visual first.

## B — Per-room average daylight (the numeric core)

**Verdict: do NOT compute this from the renderer. Build an OFFLINE ANALYTIC pass — renderer-independent, deterministic, defensible.**

A shadow-map render gives pixels, not a per-room average; reading it back per room is fragile (camera-dependent, resolution-dependent, non-deterministic across GPUs — violates ADR-0061). The right architecture is a **pure L2 analytic daylight pass** that consumes the data we already have:

**Inputs (all already available):** room polygons (room detection), window apertures (`windowEmission` placements: aperture rect in world space + façade normal), the sun-path (`RealSunService` sample over a representative day or the year), the site latitude/orientation (C19 site substrate / Project North).

**Algorithm (ray-cast / radiance-style sampling, deterministic):**
1. For each room, lay a grid of sample points on the floor plane (e.g. 0.5 m spacing).
2. For a set of sun positions over the day/year (e.g. hourly × solstices+equinoxes, or a fuller annual sweep), for each sample point cast a ray toward the sun.
3. Test occlusion: the ray reaches the sun **iff** it passes through one of the room's window apertures (point-in-aperture-rect on the façade plane) AND is not blocked by an interior wall or (optionally) a neighbour/context building. The window's solid-angle + the cosine of incidence on the floor weights the contribution.
4. Integrate over sample points × sun positions → a per-room **average daylight factor / insolation score** (normalisable 0–1 or to lux-equivalent with a sky model). Larger/lower-sill/better-oriented windows → higher score, exactly the founder's "depending on the window size and location."

**Where it lives:** a new pure module — candidate `packages/ai-host/.../daylight/` or a dedicated `@pryzm/daylight` L2 package (no THREE/Cesium/DOM, like the constraint validators). It feeds:
- **§27 `DAYLIGHT-GRAPH`** (the per-room daylight colour-code graph) — this IS its data source.
- The **§59 kitchen "natural-light" scorecard axis** + the window-rules (§41/§68.16) — so the *layout engine* can score/optimise daylight, not just visualise it.
- The cognition-stack **Perceptual-Sim** layer (apartment cognition framework).

**Effort:** moderate. The geometry (room polys + apertures + sun vectors) all exists; the work is the sampler + occlusion test + integration + a calibration pass. No renderer dependency, fully unit-testable, deterministic.

## Recommendation

| Goal | Approach | Effort | Sequence |
|---|---|---|---|
| **A — visual sun-through-window** | Tune the **existing** FORMA.6 real-model + Cesium/Forma shadow maps (shadow-map size/cascades/soft-shadows; verify glass alpha survives the GLB; drive elevation from RealSunService). NO new architecture. | **Low** | Ship first — in the **Forma** view (cleanest), then the globe. |
| **B — per-room average daylight** | A new **offline analytic daylight pass** (pure L2, ray-cast sun-vector vs window apertures per room, integrated over the sun-path). Renderer-independent + deterministic. Feeds §27 daylight graph + §59 scorecard. | **Moderate** | Ship second — the quantitative core; unify with A by sharing the `RealSunService` sun-path. |

**Do NOT** try to compute B by reading back the renderer's shadow map — it's non-deterministic and resolution-bound. Keep the *visual* (A, renderer) and the *number* (B, analytic) as two passes that share the same sun-path data.

**Next concrete step (when prioritised):** a thin prototype of the daylight sampler against one generated apartment (one room, four sun positions) to validate the occlusion-through-aperture test, plus a one-line Forma shadow-map size bump to confirm the visual beam resolves. Both are small and independently shippable.

— Governance: ties to §27 (DAYLIGHT-GRAPH), §59 (scorecard natural-light axis), C19 (site/climate), FORMA.5/FORMA.6, ADR-0061 (determinism — why B is analytic not renderer-readback).
