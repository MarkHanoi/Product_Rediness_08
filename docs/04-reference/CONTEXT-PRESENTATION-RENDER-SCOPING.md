# Context Presentation Render — Scoping & Feasibility (L-379)

> **Stamp**: 2026-07-17 · **Status**: SCOPING (no implementation) · **Owner**: UNASSIGNED
> **Scope**: an ADDITIVE, opt-in "presentation mode" render style for the Forma / context
> site view that matches Spacio.ai-style presentation renders — flat matte massing, soft AO in
> setbacks, soft overcast-studio shadows, stylized ground, instanced trees, flat-shaded roads
> with hierarchy — for CONTEXT buildings, keeping the existing data sources (Overpass/OSM →
> Overture/Cesium 3D-Tiles) AS-IS. **Provider-agnostic render style; NOT L-374's data tiering.**
> **Contracts**: [C04](../02-decisions/contracts/C04-RENDERING-AND-SCHEDULING.md) (render/scheduling),
> [C55](../02-decisions/contracts/C55-GEODATA-ANALYTICAL-LAYERS.md) (read-only draped context layers),
> [C19](../02-decisions/contracts/C19-SITE-MODEL-AND-PARCEL.md)/[C12](../02-decisions/contracts/C12-GEOSPATIAL.md)
> (measurement-accurate substrate), [C10](../02-decisions/contracts/C10-PERFORMANCE-AND-OBSERVABILITY.md) (perf).

---

## 0. THE CRUCIAL ARCHITECTURAL FINDING (decides everything downstream)

**The Forma / context view pixels are owned by CESIUM's own WebGL renderer — NOT by PRYZM's
Three.js / WebGPU pipeline (`packages/renderer-three`).**

Evidence (all in `apps/editor/src/ui/geospatial/CesiumViewport.ts`):

- The view is a `new Cesium.Viewer(...)` with its own WebGL context — `CesiumViewport.ts:1199`.
- **Context buildings** are `viewer.entities.add({ polygon: {...} })` Cesium entities with a **flat
  `Cesium.Color` material** and Cesium `ShadowMode` — near ring `CesiumViewport.ts:5313-5330`
  (material `FORMA_PALETTE.contextFill` `#D9D8D3`, `shadows: ShadowMode.ENABLED`), far ring
  `CesiumViewport.ts:5395-5408` (`ShadowMode.DISABLED`, low-poly, alpha 0.82).
- **Ground** is a flat Cesium globe base colour: `globe.baseColor = FORMA_PALETTE.ground` (`#DDDCD9`)
  — `CesiumViewport.ts:1974`. In Forma mode the imagery basemap is suppressed; the "terrain" under
  the study is a **flat plane** at `formaTerrainBaseHeight` (buildings extrude from it), not a draped
  elevation surface.
- **Roads** are Cesium `corridor` ground ribbons, width-scaled by OSM `highway` class —
  `CesiumViewport.ts:5526-5559` (hierarchy: motorway 14 m … service 4 m).
- **Parks / green space** are flat Cesium green polygons (`FORMA_PALETTE.park` `#A9C77E`) —
  `contextParkEntities` `CesiumViewport.ts:859`, palette `:348`.
- **Lighting** is a Cesium `DirectionalLight` (`CesiumViewport.ts:2244`) + `viewer.shadows = true`
  (`:2095`) + soft-shadow blur (`:2132`) + shadow darkness `0.34` (`:2128`).
- **AO** is a **Cesium post-process stage** (HBAO) — `ensureFormaPostProcess()`
  `CesiumViewport.ts:2476-2524`, feature-detected via `PostProcessStageLibrary.isAmbientOcclusionSupported(scene)`
  (needs `WEBGL_depth_texture`, `:2501`) / `createAmbientOcclusionStage()` (`:2508`), plus a silhouette
  edge composite (`:2538-2551`).

`CesiumThreeBridge` only **syncs the camera** (Cesium → Three) and re-parents BIM geometry into a
`gisRoot` group (`packages/renderer-three/src/geospatial/CesiumThreeBridge.ts:110` `syncCamera`,
`:48` `setAnchor`). Its own migration header records it is **unwired**: *"0 structural importers —
the bridge was pending wiring"* (`CesiumThreeBridge.ts:11-14`). It does **not** composite context
pixels through the Three pipeline, and the proposed massing itself is drawn as Cesium entities
(`renderFormaMassing`, `CesiumViewport.ts:2901+`), not Three meshes.

**What this forces:**

1. **All reference-quality context styling must be done CESIUM-NATIVE** — Cesium materials, Cesium
   post-process stages, Cesium `DirectionalLight` / shadow map, Cesium globe/imagery material. This
   is consistent with C55 §P2 ("raster imagery through the Cesium owner, vector via clamped-to-ground
   entities") and C55 §1.2 (context is read-only draped geometry, never BIM).
2. **The existing L-361 Three.js SSGI / TSL post-FX pipeline CANNOT be reused for context.** `SSGIPass.ts`
   is `SSGINode` (Three.js r183 TSL, WebGPU-only) inside `RenderPipelineManager`; it renders the **BIM
   scene**, not Cesium pixels. It is also OFF on the `webgl-fallback` heavy-scene backend (L-372 /
   ADR-0267). It is architecturally unreachable from the Forma view.
3. **Good news — most of the reference look already exists Cesium-native.** Flat matte massing, soft
   overcast directional light, soft shadows, HBAO in crevices, flat ground, and width-hierarchy road
   ribbons are ALREADY shipped (see Steps 2-4). The remaining true gap is instanced trees (Step 5).

**Context is cleanly separable** from the user's BIM geometry: context lives entirely in Cesium
entity arrays (`contextBuildingEntities` `:848`, `contextRoadEntities` `:853`, `contextParkEntities`
`:859`), disposed via `clearContextBuildings()` / `clearContextRoads()` / `clearContextParks()`. The
user's authored model is Three.js geometry in the BIM scene (or, in Forma, a separately-tracked
massing primitive). **No separability blocker.** A "presentation mode" toggle can restyle the
context entity arrays with zero reach into the BIM render graph.

---

## Step 1 — Current context-building render path (audited)

| Concern | Today | file:line |
|---|---|---|
| Renderer owning context pixels | **Cesium WebGL** (`Cesium.Viewer`) | `CesiumViewport.ts:1199` |
| Context building geometry | Extruded `PolygonGraphics` entity from OSM outer ring | `CesiumViewport.ts:5313-5330` |
| Context building material | **Flat `Cesium.Color`** `FORMA_PALETTE.contextFill` `#D9D8D3`, opaque, thin `#9A958C` outline. **No albedo texture.** | palette `:312-314`, fill `:5288-5289`, `:5320` |
| Near vs far LOD | Near = extruded + `ShadowMode.ENABLED`; far = flat low-poly, `ShadowMode.DISABLED`, alpha 0.82, height-capped 24 m, nearest-N capped (`CONTEXT_FAR_MAX_BUILDINGS` 900) | `:5325`, `:5394-5408`; `contextBuildings.ts:208` |
| Ground | Flat globe base colour (imagery suppressed in Forma); flat plane at `formaTerrainBaseHeight` | `CesiumViewport.ts:1974` |
| Data source | Keyless OSM via Overpass → GeoJSON `{heightM}`; Overture-swap is one function body | `contextBuildings.ts:478-491`, OVERTURE_SWAP note `:473` |

The `contextBuildings.ts` / `contextRoads.ts` / `contextParks.ts` modules are **data loaders only**
(fetch + cache + never-throw); they emit plain GeoJSON. The **render** is 100% Cesium entities in
`CesiumViewport`. This is exactly why the style goal is provider-agnostic: restyling the Cesium
entities is independent of where the footprints came from.

---

## Step 2 — Shared provider-agnostic context material  →  **LARGELY DONE (Cesium-native)**

A single shared matte material for ALL context buildings **already exists**: every context footprint
(near and far, and any future Overture/3D-Tiles source once it lands on the same entity path) uses the
**one** flat `FORMA_PALETTE.contextFill` colour with no albedo texture and a thin outline
(`CesiumViewport.ts:5288`, `:5320`, `:5377`). It is theme-configurable by construction — the look is
driven by the `FORMA_PALETTE` / `FORMA_QUALITY` constant blocks (`CesiumViewport.ts:286-350`,
`formaSceneQuality.ts:24-60`).

**Cesium-native vs Three-pass feasibility:**
- **Cesium-native (RECOMMENDED, already the path):** swap the per-entity `material` `Cesium.Color`.
  Trivial. For Cesium **3D-Tiles** context (the L-374 premium path) the equivalent is a
  `Cesium3DTileStyle` `color` expression or `tileset.style` / per-feature color — a native, supported
  override. No Three involvement. **This is the only architecturally-consistent option.**
- **Three.js-pipeline pass:** would require piping Cesium context geometry INTO the Three scene (wiring
  the dormant `CesiumThreeBridge` in reverse and re-authoring context as Three meshes). This is a large
  architectural change, re-introduces the single-THREE-owner and device-loss surface into the context
  view, and is **not recommended** — it buys nothing the Cesium material path doesn't already give.

**Remaining work (small):** expose theme presets (warm-white / wood-tone) as a couple of extra
`FORMA_PALETTE` variants + a toggle, so "presentation mode" can pick a Spacio-like warm palette
distinct from the current cool architectural grey.

**Effort: XS** (add palette presets + wire a toggle). **Impact: HIGH** (defines the whole look).

---

## Step 3 — Lighting / AO treatment  →  **LARGELY DONE (Cesium-native); tuning only**

The reference "soft-lit overcast-studio + AO-in-crevices" treatment is **already shipped Cesium-native**:

- **Soft directional (overcast-studio) light:** `scene.light = new Cesium.DirectionalLight(...)` with a
  warm/cool tint (`CesiumViewport.ts:2244-2246`), sun-anchored so shadows read as the depth cue.
- **Soft shadows:** `viewer.shadows = true` (`:2095`), soft-shadow PCF blur (`FORMA_QUALITY.shadowSoftBlur`
  `3.0`, `:2132`), shadow-map darkness `0.34` (a gradient, not a stark silhouette — `:2128`,
  `formaSceneQuality.ts:57`), 2048 map @ 600 m.
- **AO in setbacks/crevices:** a **Cesium HBAO post-process stage** — `ensureFormaPostProcess()`
  (`:2476-2524`), feature-detected `isAmbientOcclusionSupported` (`WEBGL_depth_texture`, `:2501`),
  defaults ON (`§FORMA-AO-OPT-IN`), and **degrades gracefully** to a fog ground-AO + shadow gradient on
  GPUs that can't compile HBAO (`formaPostProcessFaulted` latch, `:2145`). A silhouette edge composite
  is layered on top (`:2538-2551`).
- **Atmospheric depth:** light Cesium `scene.fog` tinted to the horizon so building bases melt into the
  ground (`FORMA_QUALITY.fogColor/fogDensity`, `:2046-2049`).

**Can the existing Three SSGI/AO be applied to context? NO.** It is a different renderer
(`SSGIPass.ts` = `SSGINode` TSL/WebGPU inside the BIM `RenderPipelineManager`). It never touches Cesium
pixels and is OFF on the webgl-fallback (L-372). The Cesium AO above is the correct and only lever for
context.

**Perf matrix note (why this is safe):** the BIM `SceneQualityTierManager` thresholds — cinematic ≤1500
meshes / balanced ≤2500 / performance ≤15000 (SSGI ON **only** at cinematic;
`packages/core-app-model/src/rendering/SceneQualityTierManager.ts:87-89`, `:63`), large-scene cap →
performance, and `isHeavyModel` (>5 levels or the L-164 element threshold;
`LevelScoped3DCullingService.ts:180`) — govern the **Three BIM scene**, which is NOT running while the
Forma view owns the screen. The Cesium context render is a **separate renderer with its own budget**;
its perf drivers are the shadow pass (already mitigated: far ring `ShadowMode.DISABLED`, near ring
capped) and the HBAO stage (single full-screen pass, feature-gated + fault-latched). No interaction with
the WebGPU/webgl-fallback split that L-361/L-372 govern.

**Remaining work (small):** tune AO radius/intensity + light softness toward the Spacio reference and,
optionally, add a stronger contact-shadow / ground-plane darkening under buildings for the "studio pool"
read. Parameter tuning on an existing path.

**Effort: XS-S** (param tuning). **Impact: HIGH** (this is the founder's #1 "gradient shadowing" ask).

---

## Step 4 — Ground / terrain + road stylization  →  **MOSTLY DONE; colour-ramp ground is the delta**

- **Roads:** flat-shaded ground ribbons with hierarchy already exist — `corridor` polygons width-scaled
  by OSM `highway` class (arterial 14 m → path 4 m), flat `FORMA_PALETTE.road` `#C9C7C2`, seated just
  above the ground plane so they never slice buildings (`§FORMA-CTX-ROAD-RIBBON`,
  `CesiumViewport.ts:5526-5559`). Reference-consistent already. Small polish possible (casing/centre-line,
  pedestrian tier — pedestrian ways are fetched but not yet drawn, `:5540`).
- **Ground:** in Forma mode the raw satellite imagery is **already replaced** by a flat neutral colour
  (`globe.baseColor = FORMA_PALETTE.ground`, `:1974`) — there is no imagery drape to strip. A
  **simplified colour-ramp / gradient ground shader** (a soft radial "studio pool", or park-tinted
  zones) would be a *net-new but small* Cesium `Material`/`ImageryLayer` on the flat plane.
- **The GLOBE (non-Forma) view** DOES drape Esri imagery (`CesiumViewport.ts:1291-1301`); a colour-ramp
  ground there is genuinely new (overlaps L-374e orthophoto work) — treat as out-of-scope for the
  presentation style, which targets the Forma/context view.

**Measurement-accuracy confirmation (C55/C19/C12):** this changes only **surface shading**. Forma's
context sits on a **flat study plane** at `formaTerrainBaseHeight` — no elevation data is draped there,
so there is nothing accurate to disturb. Building heights come from OSM `height`/`building:levels`
(`contextBuildings.ts:363-380`) and are untouched by shading. Any future terrain-elevation drape must
keep heights measurement-accurate per C19/C12 — a colour-ramp changes the *material*, never the
`extrudedHeight`/terrain sample.

**Effort: S** (road polish XS; colour-ramp ground S). **Impact: MEDIUM.**

---

## Step 5 — Tree / vegetation system  →  **NET-NEW (the real remaining gap)**

**Current state confirmed:** there are **no 3D trees**. Vegetation is only **flat green park polygons**
(`contextParkEntities`, `CesiumViewport.ts:859`; `contextParks.ts` fetches `leisure=park` etc. rings).
The grep hits for "tree" in the geospatial dir are substring matches on "s**tree**t", not a tree system.

**Instancing reuse?** The Three-side instancing (`InstancedMesh`, `ElementInstanceBridge`,
`InstancedElementRenderer`, `§PERF-*-INSTANCING`) is in the **Three/WebGPU BIM renderer** — **not reusable**
for Cesium context (different renderer, per Step 0). Cesium has its **own** instancing primitives
(`Cesium.ModelInstanceCollection` / instanced glTF, `BillboardCollection`, `PointPrimitiveCollection`),
which is what an instanced billboard-card or low-poly-impostor tree system would use. **Net-new Cesium
infrastructure**, including: a tree-point source (OSM `natural=tree` / tree-rows, or scatter within park
polygons), instanced placement, and a matte/stylized card or impostor material consistent with Steps 2-3.

This overlaps the **L-374d VegetationProvider** row (data/provider) already in the launch audit — L-379d
is the **render-STYLE** half (instanced impostor look), L-374d the **data** half; they should be built
together but are tracked split per the provider-agnostic mandate.

**Effort: M-L** (net-new Cesium instanced system + point source). **Impact: MEDIUM-HIGH** (biggest
remaining visual gap vs Spacio, but not required for a credible beta).

---

## Step 6 — Feasibility, ranking, and build order

### Effort-to-impact ranking (best ratio first)

| Rank | Step | State | Effort | Impact | Why |
|---|---|---|---|---|
| 1 | **Step 3 — AO / lighting tune** | shipped; tune params | XS-S | HIGH | Founder's #1 ask already Cesium-native; pure tuning, zero risk |
| 2 | **Step 2 — context material theme** | shipped; add presets | XS | HIGH | One flat material already; add warm-white/wood presets + toggle |
| 3 | **Step 4 — ground / road shading** | roads done; ground new | S | MEDIUM | Roads already hierarchical; colour-ramp ground is a small Cesium material |
| 4 | **Step 5 — instanced trees** | net-new | M-L | MED-HIGH | Only true infra gap; Cesium instancing (not the Three path); pair with L-374d |

### Everything is ADDITIVE / opt-in — zero risk to P0/P1 launch work

- The whole effort layers onto the **existing opt-in Forma "presentation mode"** (`setFormaMode` /
  `renderFormaMassing`, `CesiumViewport.ts`), which is already a user-toggled context view.
- It touches **only Cesium** — `FORMA_PALETTE` / `FORMA_QUALITY` constants, Cesium entity materials,
  Cesium post-process stages, Cesium light/shadow. It shares **no code path** with the in-flight P0/P1
  work, all of which lives in the **Three.js / server** stack: data-loss L-334/L-360 (persistence),
  collaboration L-335 (Yjs/server), WebGPU device-loss L-361/L-372 (`renderer-three` / TSL / backend
  swap), generation-perf L-377 (layout engine). Restyling Cesium context entities cannot regress any of
  these — different renderer, different files.
- Consistent with **C55 §1.2** (context is read-only draped geometry, never BIM) and **§1.7** (opacity/
  style as render parameters). Presentation mode is a visibility/style intent, not a model mutation
  (P6/P7 respected — no command/store writes needed for a pure Cesium restyle).

### September build order (beta vs post-launch)

- **BETA (cheap + high-impact, ship for September):**
  - **L-379a** context-material theme presets (Step 2) — XS.
  - **L-379b** AO / lighting tune toward Spacio reference (Step 3) — XS-S.
  These two are param/config work on an already-Cesium-native, already-shipped path; they realise ~80% of
  the visual delta at near-zero risk.
- **BETA-OPTIONAL (if time):**
  - **L-379c** ground colour-ramp + road polish (Step 4) — S. Roads already good; colour-ramp ground is
    the only new bit.
- **POST-LAUNCH:**
  - **L-379d** instanced trees (Step 5) — M-L. Net-new Cesium instancing; pair with L-374d
    VegetationProvider. Defer past September; a matte massing study with soft AO + shadows reads as
    "presentation quality" without trees.

**L-374 tie-in:** this render style layers onto the Context-View phase (**L-374g**) and does **not block**
it. L-374 governs the *data provider tiering* (which footprints/heights/imagery arrive); L-379 governs how
those footprints are *shaded*. They are orthogonal and provider-agnostic by construction — restyling the
Cesium entity path applies identically whether footprints came from OSM LOD1, Overture LOD2, or Google
3D-Tiles.

### Contract notes

- **C04**: the context render path is the Cesium-owned half of the render graph (C55 §P2 explicitly
  splits "raster imagery through the Cesium owner" from THREE-owned vector geometry). Presentation-mode
  restyling stays inside the Cesium owner — no new `import * as THREE` site, no new rAF (P3 unaffected;
  Cesium drives its own `requestRender`).
- **C55**: presentation styling is consistent with §1.2 (read-only context) and §1.7 (style/opacity as
  render parameters, not re-fetch). If tree scatter or ground ramp ever consumes a geodata layer, it must
  respect the provider abstraction (§1.3) and graceful-absence (§1.4).
- **C19/C12**: shading-only; building heights and any terrain samples remain measurement-accurate.

---

## Appendix — key file:line references

- `apps/editor/src/ui/geospatial/CesiumViewport.ts` — Cesium viewer `:1199`; FORMA_PALETTE `:286-350`;
  Forma mode / flat ground `:1974`; directional light `:2244`; shadows `:2095`/`:2128`/`:2132`; AO
  post-process `:2476-2524`; silhouette `:2538-2551`; context building near `:5313-5330`; far ring
  `:5395-5408`; road ribbons `:5526-5559`; context entity arrays `:848`/`:853`/`:859`.
- `apps/editor/src/ui/geospatial/formaSceneQuality.ts` — `FORMA_QUALITY` (`shadowDarkness` `:57`, fog `:45`).
- `apps/editor/src/ui/geospatial/contextBuildings.ts` — loaders + heights `:363-380`; near/far cap `:208`;
  OVERTURE_SWAP `:473`.
- `apps/editor/src/ui/geospatial/contextRoads.ts` / `contextParks.ts` — road/park data loaders (flat rings).
- `packages/renderer-three/src/geospatial/CesiumThreeBridge.ts` — camera-only bridge, unwired `:11-14`,
  `syncCamera` `:110`.
- `packages/renderer-three/src/pipeline/SSGIPass.ts` — Three SSGINode (WebGPU/TSL), BIM-only, not reusable.
- `packages/core-app-model/src/rendering/SceneQualityTierManager.ts` — tiers `:87-89`, SSGI@cinematic `:63`.
- `packages/core-app-model/src/rendering/LevelScoped3DCullingService.ts` — `isHeavyModel` `:180`.
</content>
</invoke>
