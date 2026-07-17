# Context View — End-to-End Design (engineering-grade real-world context)

**Date:** 2026-07-17 · **Author:** Principal GIS / Digital-Twin / Real-Time-Graphics architect (design pass)
**Status:** DESIGN — no code changed, no contract flipped. Evidence-grounded (`file:line`).
**Tracker:** L-374 (Context Engine initiative) · new sub-tasks **L-374g+** proposed in §8.
**Builds on:** `docs/04-reference/FORMA-CONTEXT-ENGINE-AUDIT.md` (the L-374 audit — provider comparison, Context Engine sketch, phased roadmap). This doc is the concrete **VIEW + UI** design that audit called for. **Read the audit first** — it is not re-derived here.

---

## 0 — Founder decision this design implements (fixed, not re-litigated)

**TWO DISTINCT PEER VIEWS.**

1. **KEEP** the existing abstract **"3D Site" (Forma) massing view UNCHANGED** — SPEC-FORMA §2/§8 abstract-massing intent (white shadowed extrusions on flat neutral ground, photo-free). **No regression.** Every code path behind `formaMode` / `applyFormaMode()` (`CesiumViewport.ts:1934`, `:1959`) and `mountFormaViewToggle` (`GISAreaLayout.ts:2346`) stays byte-for-byte as-is.
2. **ADD** a NEW **engineering-grade Context View**: real terrain (DEM/DTM/DSM) + orthophoto draping + LOD2/LOD3 buildings + trees/vegetation + water + roads — engineering-accurate, globally scalable, performant — reached via a **new peer segment** on the existing view-mode bar.

This resolves the §7.5 conflict the audit flagged ("engineering context vs the deliberately-abstract Forma non-goal") the way the audit said it must be resolved — **not one toggle, two views**. The Context Engine (audit §7) therefore serves **two render targets**, and this design specifies the second one.

---

## 1 — View coexistence & lifecycle

### 1.1 The views that exist today (traced)

There is **one segmented view-mode bar** — `mountResultToggleBar` (`GISAreaLayout.ts:789`), `data-testid="gis-result-view-toggle"`, floating centred at `top:64px`, `z-index:30`. It is idempotent (`if (resultToggle) return;`, `:790`) and every entry path funnels through `ensureResultToggle()` (`:989`). It currently owns **three peer segments** plus contextual sub-controls:

| Segment | Label (`textContent`) | `activeSegment` | What it mounts | Entry fn |
|---|---|---|---|---|
| BIM dual-pane | `◧ 3D + plan` (`:840`) | `'2D'` | `applyBimDualPane()` (`:776`) — LEFT 3D · RIGHT plan, no Cesium | `applyResultView('2D')` |
| Photoreal globe | `◉ 3D globe` (`:841`) | `'3D'` | Cesium globe + Google 3D Tiles (or keyless ESRI), model placed via `restorePhotorealGlobeContent()` (`:766`) | `applyResultView('3D')` |
| Abstract Forma | `◉ 3D Site` (`:855`) | `'forma'` | `mountFormaViewToggle('plan')` (`:869`) → the secondary `[▦ 2D Map][◳ Plan][◉ 3D]` sub-bar (`:2346`) driving `setFormaMode(true)` | `mountFormaViewToggle` |

The globe segment also renders a **fidelity sub-toggle** `[◉ Real][▢ Massing]` (`:874-921`), a `⤢ Zoom to Site` (`:928`) and `▶ Fly tour` (`:946`) — all shown only while `resultViewMode === '3D'` (`refreshResultButtons` toggles their `display`).

**Critical:** `applyResultView('3D')` calls `removeFormaViewToggle()` (`:725`) first — choosing a top-level segment tears down the Forma sub-bar. Exactly one contextual sub-bar is live at a time (`§FIX-VIEWMODE-BAR-CONSOLIDATE`, L-166). The Context View must obey the same discipline.

### 1.2 The Cesium viewer is a single reused instance

`CesiumViewport` is **one viewer** with a mode flag `formaMode` (`CesiumViewport.ts:561`). `setFormaMode(on)` (`:1934`) flips between `applyFormaMode()` (flat neutral ground, imagery hidden — `:1959`, `:1316`) and `restorePhotorealMode()` (globe + tiles). `setVisible(true/false)` (`:8728`) raises the Cesium canvas above the BIM WebGPU overlay (`CESIUM_Z=15`) or hides it (`display:none`, BIM restored). **The viewer is never re-created between globe/Forma** — it toggles providers + camera + ground. The Context View follows the same reuse model: **a third mode on the same viewer**, not a second viewer instance.

### 1.3 The proposed state machine

```
                 ┌──────────────────────────────────────────────────────────┐
                 │                    ONE Cesium viewer                      │
                 │        (CesiumViewport, formaMode ∈ {off,on} today)       │
                 └──────────────────────────────────────────────────────────┘
   activeSegment:     '2D'            '3D'            'forma'          'context'  ← NEW
   ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────────┐
   │   BIM    │⇄ │   Globe   │⇄ │  3D Site  │⇄ │  Context  │
   │ dual-pane│   │ photoreal │   │ (Forma,  │   │  (NEW,   │
   │ (no      │   │ Google    │   │  abstract │   │ terrain+ │
   │  Cesium) │   │ 3D Tiles) │   │  massing) │   │ ortho+   │
   └──────────┘   └──────────┘   └──────────┘   │ LOD2+trees)│
   Cesium hidden  Cesium visible  Cesium visible  Cesium visible
   setVisible(F)  formaMode=off   formaMode=on    formaMode=off
                  contextMode=off contextMode=off contextMode=ON  ← NEW flag
```

**Transition rules (mirror the existing ones):**
- Any peer-segment click runs through `containViewActivation(() => applyResultView(mode), …)` (`:836`) — a new segment `'context'` extends `applyResultView`'s union to `'2D' | '3D' | 'forma-context'` OR (cleaner) adds a sibling `applyContextView()` that mirrors the `'3D'` branch. **Recommended: a sibling `applyContextView()`** so the globe branch stays untouched.
- Entering Context from Forma: `removeFormaViewToggle()` + `setFormaMode(false)` + `setContextMode(true)` (new). Entering Forma from Context: `setContextMode(false)` + `setFormaMode(true)`. Entering BIM (`'2D'`): `setVisible(false)`.
- The viewer, being reused, keeps its LTP-ENU rebase origin (C12 §1.1) and the placed building across all three Cesium modes — no re-georeference, no second projector (SPEC-FORMA §8.3).

### 1.4 Readiness / overlay / tiles-gate reuse

- **L-270 view-activation loading overlay.** Context activation uses `startViewActivationLoading('context', retry)` (a new `ViewActivationTarget` string; `GISAreaLayout.ts:675`). The overlay + input gate + retry are inherited unchanged. The building placement is registered via `trackViewActivationPlacement(p)` (`:717`) exactly like the globe path.
- **L-371 tiles-gate.** `hasRealTileProvider()` (`CesiumViewport.ts:1012`) currently returns `false` when `formaMode` (`:1023`, so Forma skips the tiles gate) and `true` when a photoreal tileset or globe surface streams. **Context View WANTS the tiles gate armed** — it *does* stream terrain + imagery + LOD2 tiles. Because Context runs with `formaMode=false` and a live globe surface / tileset, `hasRealTileProvider()` already returns `true` on that path with **no change** — the gate arms correctly and the overlay holds until terrain+ortho+first-LOD-ring settle. The only addition: extend `whenGroundSettled()` to resolve against the **real** terrain provider (Phase 1) instead of the ellipsoid-0 default (`:4589`).
- **Seat-once (L-356).** Context must resolve `whenGroundSettled()` on the real terrain provider before placing the model, so the building is seated once on true DEM height, not placed-at-0-then-re-clamped.

### 1.5 No-regression guarantee for the abstract Forma view

The Context View is **additive**: a new `activeSegment` value, a new `applyContextView()`, a new `setContextMode()` on the viewer, and a new (optional) `mountContextViewToggle()` sub-bar. **Nothing behind `formaMode` is touched.** The Forma `hasRealTileProvider` short-circuit (`:1023`), `applyFormaMode()` (`:1959`), and the `[▦ 2D Map][◳ Plan][◉ 3D]` sub-bar (`:2346`) remain the abstract-massing path. CI boundary + the `refreshResultButtons` paint logic already handle N peer segments, so adding a fourth is mechanically the same edit as the existing three.

---

## 2 — UI entry point (concrete)

**Decision: the Context View is a PEER SEGMENT on the existing `mountResultToggleBar`, not a sub-toggle of Forma.** The founder was explicit — it is a peer view. Bolting it under the Forma `[2D Map][Plan][3D]` sub-bar would (a) hide it whenever another segment is active and (b) imply it is a Forma variant, which it is not.

### 2.1 Placement, label, icon, wiring

- **Where:** appended in `mountResultToggleBar` (`GISAreaLayout.ts:789`) immediately **after** the `◉ 3D Site` Forma button (`:871`), before the globe fidelity/zoom/tour group. It is the 4th peer segment.
- **Label + icon:** `▤ Context` (a "layered ground" glyph, distinct from `◉` used by the two 3D views and `◧` used by dual-pane). Alternatives the founder may prefer: `⛰ Context`, `◉ Site Context`, `▤ Real-World`. **Recommend `▤ Context`** — short, unambiguous, not "3D Site" (taken by Forma).
- **`title`:** `"Open the engineering context view — real terrain, orthophoto, LOD2 buildings, trees, roads and water around your real-world plot"`.
- **Attributes:** `data-result-mode="context"`, `data-testid="gis-result-context"` — mirroring `formaBtn` (`:853-854`).
- **Wiring:** mirror the `formaBtn` click handler pattern (`:864`) but route through the activation-contained path used by the 2D/3D segments (`:835`), because Context *does* stream tiles and must show the L-270 overlay:
  ```
  contextBtn.addEventListener('click', () => {
    void containViewActivation(() => applyContextView(), (m) => activeViewActivation?.fail(m),
      'The context view failed to open');
  });
  ```
- **Active paint:** add `'context'` to `refreshResultButtons`'s active-segment paint loop (same `#6600FF` fill / white text brand as the others; PreviewStyle/C06 brand rules). Its contextual controls (layer toggles, §4) live in an optional secondary sub-bar mounted by `mountContextViewToggle()` at `top:108px` `z-index:31` — the exact slot the Forma sub-bar uses (`:2378`), so the two never coexist (only one segment active).

### 2.2 Bar states (mock)

```
Default / BIM (activeSegment='2D'):
┌────────────────────────────────────────────────────────────────────┐
│ [◧ 3D + plan]*  [◉ 3D globe]   [◉ 3D Site]   [▤ Context]            │   (* = active, purple fill)
└────────────────────────────────────────────────────────────────────┘

Globe (activeSegment='3D'):
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ [◧ 3D+plan] [◉ 3D globe]* [◉ 3D Site] [▤ Context] | [◉ Real][▢ Massing] ⤢Zoom ▶Fly tour│
└──────────────────────────────────────────────────────────────────────────────────────┘

Forma / abstract (activeSegment='forma'):   (UNCHANGED)
┌────────────────────────────────────────────────────────────────────┐
│ [◧ 3D+plan] [◉ 3D globe] [◉ 3D Site]* [▤ Context]                   │
├────────────────────────────────────────────────────────────────────┤  ← secondary sub-bar (top:108px)
│ 3D Site | [▦ 2D Map] [◳ Plan] [◉ 3D] | ⤢ Zoom to Site  ☀ Analysis   │
└────────────────────────────────────────────────────────────────────┘

Context / NEW (activeSegment='context'):
┌────────────────────────────────────────────────────────────────────┐
│ [◧ 3D+plan] [◉ 3D globe] [◉ 3D Site] [▤ Context]*                   │
├────────────────────────────────────────────────────────────────────┤  ← NEW secondary sub-bar (top:108px)
│ Context | ☑Terrain ☑Ortho ☑Buildings ☑Trees ☑Roads ☑Water | ⤢ Zoom │
│          [Fidelity: Open ▾ | Premium (Google/Cityweft)]            │  ← provider tier picker (§4)
└────────────────────────────────────────────────────────────────────┘
```

The layer checkboxes and the tier picker are the Context View's contextual actions — the analogue of the globe fidelity toggle. They dispatch to `ContextEngine` layer visibility (§4), never mutate BIM state (P6 — these are view intents, C06 launcher-layer UI).

---

## 3 — Rendering approach: ALL options compared

The founder asked to "look at ALL the options possible." Four are on the table. For each: fidelity, engineering-accuracy, perf/scalability, licensing, offline/caching, integration effort, and how it coexists with BIM geometry + LTP-ENU/C19 transforms.

### (a) Cesium-native — providers streamed into the EXISTING Cesium viewer
Terrain = Cesium ion World Terrain (or keyless Copernicus GLO-30 / Mapzen Terrarium quantized-mesh); imagery = ESRI/Bing/Google ortho `ImageryLayer` draped on terrain; buildings = Google Photorealistic 3D Tiles (premium) or Cesium OSM Buildings / Overture-tiled-to-3D-Tiles (open); trees/roads/water = Cesium primitives from Overture/OSM.

- **Fidelity:** high (photoreal with Google tiles) to solid (open tier). **Engineering-accuracy:** terrain is real quantized-mesh DEM; Google buildings are photogrammetric (visual, not survey-grade heights); LOD2 via Cityweft/CityJSON-tiled is semantic. **Perf/scale:** excellent — Cesium's screen-space-error tiling bounds cost by *view*, not dataset size; global by construction. **Licensing:** Google 3D Tiles ToS restricts derivative/offline re-tiling (display-only) — **flag**; Cesium ion tiered; Copernicus/Overture/ESRI-arcgisonline keyless-usable. **Offline/caching:** terrain+imagery tiles cache in the HTTP layer; Google tiles cannot be persisted offline (ToS). **Integration effort: LOW** — reuses the viewer, the placement anchor (ADR-0268), the L-270 overlay, the L-371 gate, the LTP-ENU rebase. Attach providers + a `contextMode` flag. **BIM coexistence: native** — the model is already placed in this viewer via `restorePhotorealGlobeContent` / ADR-0268; C19 LTP-ENU already reconciles ENU↔ECEF.

### (b) Custom Three.js — DEM→terrain mesh + draped ortho + streamed LOD2 tiles in the PRYZM canvas
Build a terrain `BufferGeometry` from DEM tiles, drape ortho as a texture, load LOD2 as glTF/3D-Tiles into Three.js (the audit's "Context Engine renders into Three.js" path), all inside the PRYZM WebGPU/WebGL canvas next to the BIM scene.

- **Fidelity:** as good as the data + shader effort you invest; full control of materials to match BIM look. **Engineering-accuracy:** you own the DEM sampling → can guarantee survey-grade seating and cut/fill. **Perf/scale:** you must **build** the tiling/LOD/culling that Cesium gives for free — significant; global scale is a large custom streaming effort. **Licensing:** avoids Cesium; Google tiles still ToS-bound if used. **Offline/caching:** fully yours to control (best offline story). **Integration effort: HIGH** — a new terrain streamer, tile scheduler, and a **second** georeference path that must not violate the single-projector rule (SPEC-FORMA §8.3) — high risk of a parallel transform (P2 THREE-owner + C19 tension). **BIM coexistence:** rendered in the same THREE scene (no canvas compositing), but you re-implement globe transforms Cesium already owns.

### (c) Hybrid — Cesium for globe/transform substrate + Three.js for the editable context
Cesium owns nav + WGS84↔ECEF↔ENU + tile streaming; selected context (e.g. editable LOD2 you want to snap/measure against) is handed to Three.js overlaid via the existing canvas-stack (`CESIUM_Z`).

- **Fidelity/accuracy:** high — best of both. **Perf/scale:** good (Cesium streams, THREE renders the editable subset). **Licensing:** same as (a). **Offline:** partial. **Integration effort: MEDIUM-HIGH** — you maintain a Cesium↔THREE sync + double render targets (the audit already notes the canvas-stack compositing at `CESIUM_Z=15`). Justified only once users must **edit/snap against** context geometry (a later phase), not for viewing.
- **BIM coexistence:** this is effectively what PRYZM already does (Cesium canvas above BIM WebGPU canvas) — extend it rather than invent it.

### (d) 3D Tiles as the unifying format (Google / Cesium ion / Cityweft) — orthogonal to (a)–(c)
Treat everything (terrain, buildings, trees, textured mesh) as **3D Tiles** streamed by whichever engine renders. This is a *data-format* choice that (a) consumes natively, (c) can consume, and (b) must implement a loader for.

- **Fidelity:** highest turnkey (Google photoreal / Cityweft LOD2/LOD3). **Engineering-accuracy:** Cityweft LOD2/LOD3 is semantic + analysis-ready; Google is photogrammetric. **Perf/scale:** best-in-class (the format is built for it). **Licensing:** Google ToS derivative/offline restriction is the sharp edge; Cityweft commercial but clean for engineering deliverables; Cesium ion tiered. **Offline/caching:** Cityweft/own-tiled = yours; Google = display-only. **Integration effort: LOW on top of (a)** — a `BuildingProvider`/`TerrainProvider` adapter emitting a tileset URL; the audit §7.1 interfaces already model this. **BIM coexistence:** ADR-0268 already georeferences a 3D-Tiles placement — proven.

### 3.1 Recommendation

**PRIMARY: (a) Cesium-native, with (d) 3D Tiles as the unifying ingestion format.** It reuses the entire existing view lifecycle (viewer, overlay, gate, placement anchor, LTP-ENU), ships fastest, scales globally for free, and keeps the single-projector invariant. The Context Engine (audit §7) sits above Cesium selecting providers; Cesium renders.

**FALLBACK / later specialization: (c) Hybrid**, introduced **only** when users must edit/measure/snap against context geometry (design-in-context), reusing the existing `CESIUM_Z` canvas stack. **(b) pure-Three.js is not recommended** — it re-implements globe transforms Cesium already owns and risks a second projector (SPEC-FORMA §8.3, P2/C19), for control PRYZM does not yet need.

**Verdict table:**

| Approach | Fidelity | Eng-accuracy | Perf/scale | Licensing | Offline | Effort | BIM/LTP-ENU fit | Verdict |
|---|---|---|---|---|---|---|---|---|
| **(a) Cesium-native** | High | High (real DEM; LOD2 via adapters) | Excellent (SSE tiling) | Google ToS flag; open tier clean | HTTP-cache; Google display-only | **LOW** | **Native** (ADR-0268, C19) | **PRIMARY** |
| **(b) Custom Three.js** | High (DIY) | Highest (you own DEM) | You build tiling — heavy | Cesium-free | **Best** | HIGH | Risk of 2nd projector | Not now |
| **(c) Hybrid** | High | High | Good | = (a) | Partial | MED-HIGH | Extends existing canvas-stack | Later (edit-in-context) |
| **(d) 3D Tiles format** | Highest turnkey | Cityweft semantic / Google photo | Best-in-class | Google ToS sharp edge | Cityweft yours; Google no | LOW atop (a) | ADR-0268 proven | **Ingestion format for (a)** |

**Founder business calls surfaced (do not silently decide):** pay for Google Photorealistic 3D Tiles (visual, ToS-restricted) vs Cityweft (semantic LOD2, commercial, clean licence) vs open-only (Copernicus + Overture + ESRI). See §9.

---

## 4 — Provider strategy & data layers

Per layer: premium source-of-truth + open keyless fallback, the audit-§7.1 adapter interface, tile-index/EPSG/streaming, and a per-layer first-interactive budget (C10 has **none** — proposed here, §5).

| Layer | Premium source of truth | Open / keyless fallback | Adapter (audit §7.1) | Tile-index / EPSG / streaming | Per-layer budget (target) |
|---|---|---|---|---|---|
| **Terrain (DEM/DTM/DSM)** | Cesium ion World Terrain / national LiDAR DTM (USGS 3DEP, UK LIDAR, swissALTI3D) | Copernicus GLO-30 / Mapzen Terrarium (AWS, keyless) | `TerrainProvider.sampleHeights()` / `tileUrl(z,x,y)` | quantized-mesh, WGS84 (EPSG:4326→ECEF); Cesium streams by SSE | first tile ≤ **600 ms**; seat model ≤ **900 ms** |
| **Imagery / ortho** | Google/Bing/Maxar or national ortho (USGS NAIP) | ESRI World Imagery (arcgisonline, keyless — already used `CesiumViewport.ts:1277`) | `ImageryProvider.imageryLayer()` (WMTS/url template) | XYZ/WMTS, EPSG:3857; draped on terrain (needs terrain first) | first drape ≤ **800 ms** after terrain |
| **Buildings LOD2/3** | **Cityweft** (semantic) or Google Photoreal 3D Tiles (photogrammetric) | **Overture Buildings** → OSM/Overpass LOD1 (today's `contextBuildings.ts`) | `BuildingProvider.fetchTile(bbox,lod)` → GeoJSON LOD1 \| 3D-Tiles url \| CityJSON | bbox→z/x/y; 3D-Tiles SSE (premium) or Overpass 0.016° single-fetch (L-368, keyless) | first ring ≤ **1.2 s**; far ring deferred |
| **Trees / vegetation** | Cityweft / LiDAR canopy tiles | Overture/OSM `natural=tree` + landuse canopy → GPU-instanced impostors | `VegetationProvider.fetchTile(bbox)` → `TreeInstance[]` | point tiles bbox-indexed; instanced billboards (one draw call) | deferred post-first-frame; ≤ **300 ms/tile** |
| **Roads** | Overture Transportation | OSM/Overpass `way[highway]` (today's `contextRoads.ts`) | `RoadProvider.fetchTile(bbox)` | vector tiles / Overpass; draped ribbons on terrain | deferred post-first-frame |
| **Water / sea** | Overture water + Cesium water material | OSM water (today's `contextWater.ts`) | `WaterProvider.fetchTile(bbox)` | polygon tiles; draped + water shader | deferred post-first-frame |

**Global scalability + graceful degradation.** Mirror the existing keyless-fallback pattern (`CesiumViewport.ts:1277`, ESRI when no Google/Cesium token; `contextBuildings.ts` keyless Overpass). The `ContextEngine` resolver (audit §7.1 `ContextEngine`) picks providers by **tier × coverage × key-availability**: if `VITE_CESIUM_TOKEN`/`VITE_GOOGLE_MAPS_KEY`/Cityweft key is absent, it silently falls to Copernicus + ESRI + Overture/OSM so the Context View is **never blank without keys** — exactly the L-371/keyless philosophy already in the code. Each adapter carries an OTel span (P8) and its `attribution` (ProviderCapabilities, §7.1) is surfaced in the sub-bar.

---

## 5 — Performance plan

The audit's biggest finding — the **71 MB full-scene BIM→GLB on the critical path** (L-355/356/358, `GISAreaLayout.ts:1958/2117`) — is view-agnostic and must be fixed once (Phase 0) so it does not tax the Context View either. On top of that:

1. **Streaming-around-camera, 500 m bubble + LOD rings.** Reuse the L-368 `§PERF-CTX-SINGLE-FETCH` single 0.016° fetch and the L-187 far-ring cap (`CONTEXT_FAR_MAX_BUILDINGS=900`, `contextBuildings.ts:208`). Near ring (≤500 m) = full LOD2/extrusions + shadows; far ring = flat/capped. Terrain + imagery + LOD2 tiles are SSE-streamed by Cesium — cost bounded by view, not dataset.
2. **Instanced trees (GPU impostors).** Vegetation renders as GPU-instanced billboards/impostors (one draw call per tile) — the audit §5 vegetation path. Never per-tree meshes.
3. **Avoid the 71 MB GLB re-export (L-374a).** The authored building blob is exported **once per geometry signature**, cached across all Cesium modes (globe/Forma/Context), Draco/meshopt-compressed, and exported off-thread (worker/idle). Context reuses the same cached blob — it does not trigger a fresh export. This is Phase 0 and unblocks every view.
4. **Seat-once (L-356).** Resolve `whenGroundSettled()` against the real terrain provider before placing the model — no place-at-0-then-reclamp.
5. **Defer non-critical layers.** Terrain + ortho + near buildings + the model on the critical path (gated by L-270 overlay); roads, water, trees, far ring stream **after first interactive frame**.
6. **Windows / WebGL-fallback aware.** The founder's box runs WebGL (per MEMORY: WebGL = stable demo backend; WebGPU heavy-scene device-loss history). Cesium already runs WebGL here (`CesiumViewport` WebGL viewer). Budget assumes WebGL: instanced impostors, capped far ring, LOD2 tile SSE tuned conservative, no per-tree meshes, no unbounded near set (address the audit §1.2 uncapped-near-ring note by capping the near ring in dense cores).

**Proposed view-activation budget (fills the C10 gap):** first-interactive **< 2 s** on the reference model (terrain first tile ≤600 ms, model seated ≤900 ms, near ortho+buildings ≤1.5 s, input ungated at first-interactive); non-critical layers may continue streaming after. This should become a C10 clause (§7).

---

## 6 — Phased build plan (evolve, not replace)

Maps to the audit's L-374a..f sub-items + the **new** UI/view work (L-374g+). Each phase is independently shippable; the abstract Forma view is untouched throughout.

| Phase | Sub-task | Deliverable | Touches | Contracts/ADRs | Effort | UI state unlocked |
|---|---|---|---|---|---|---|
| **P0** | L-374a | GLB export off critical path (worker/idle) + Draco; cross-view signature cache keyed on geometry; seat-once; defer non-critical | `GISAreaLayout.ts` (export/cache), `CesiumViewport.ts` (seat), `GLBExporter.ts` | C10 (add budget — gap); C12 §8 | M (1–2 wk) | All views load fast; prerequisite for Context |
| **P-UI** | **L-374g (NEW)** | New `▤ Context` peer segment + `applyContextView()` + `setContextMode()` + `mountContextViewToggle()` sub-bar; L-270 overlay + L-371 gate reuse; **Forma untouched** | `GISAreaLayout.ts:789` (bar), new `applyContextView`; `CesiumViewport.ts` new `contextMode` flag + provider attach | **C06 §7** (launcher); SPEC-CONTEXT-VIEW (new — gap); C12 §7/§1.4 | S–M (1 wk) | The view EXISTS behind a toggle |
| **P1** | L-374b | Attach real `TerrainProvider` (Cesium ion / Copernicus keyless); wire `sampleTerrainMostDetailed` (`CesiumViewport.ts:4627`); clamp model + context to true ground | `CesiumViewport.ts:4589-4692`, new `TerrainProvider` adapter | C12 §1.4 (extend); terrain rule (gap) | M (1–2 wk) | Truthful ground under Context |
| **P2** | L-374e | Drape ortho `ImageryLayer` over terrain (ESRI open → premium) | `CesiumViewport.ts:1277`, new `ImageryProvider` adapter | imagery/draping rule (gap) | S (days) | Photoreal ground in Context |
| **P3** | L-374f | Extract provider interfaces; refactor `contextBuildings/roads/water/parks` behind adapters; `ContextEngine.streamContext` | new `@pryzm/context-engine` (L2/L3), `apps/editor/src/ui/geospatial/*` | **C12-CONTEXT-ENGINE (new — gap)**; mirror ADR-0065 | L (3–4 wk) | Config-swap of any provider |
| **P4** | L-374c | `BuildingProvider` LOD2/3: Overture (open) + Cityweft/Google-3D-Tiles (premium); 3D-Tiles hand-off; OSM LOD1 fallback | Context Engine, `CesiumViewport` tileset wiring | LOD2-ingestion rule (gap); C12 §8; ADR-0268 | L (3–4 wk) | Engineering-grade buildings |
| **P5** | L-374d | `VegetationProvider`: Overture/OSM trees → GPU-instanced impostors; premium LiDAR canopy | Context Engine, instanced-tree renderer | vegetation rule (gap); SPEC-RENDER-TIERS A.24.4 | M (1–2 wk) | Trees / entourage in Context |

**Dependencies:** P0 first (unblocks testing). **P-UI (L-374g) is the minimal viable new view** — it can ship with the *keyless open tier* (Copernicus terrain + ESRI ortho + Overture/OSM) as soon as P1/P2 land behind it, giving a licence-clean Context View immediately; premium providers slot in at P4 by config. P1→P2 (draping needs terrain); P3 is the abstraction that makes P4/P5 config-swaps.

**Phase-0-shippable definition of the new view:** `▤ Context` segment + Cesium `contextMode` + Copernicus/Cesium-ion terrain + ESRI ortho drape + existing Overpass LOD1 buildings/roads/water reused as-is + the seated authored model. That is engineering-*credible* (real DEM + ortho, truthful ground) and 100% keyless/licence-clean, shippable right after P0+P1+P2+L-374g.

---

## 7 — Architectural alignment & governance gaps

| Doc | Relevance to the Context View |
|---|---|
| **C12-GEOSPATIAL** | §1.1 LTP-ENU substrate (reused unchanged, no 2nd projector); §1.4 datum/ground boundary (extend for real terrain); §7 globe placement (Context reuses the placement anchor); §8 OSM context-fetch (reused for the keyless building/road/water layers). **Gaps: no terrain/LOD2/vegetation/ortho/Context-Engine coverage** (audit §7.4). |
| **C06-UI-SHELL-AND-TOOLS** | §7 launcher/view-mode layer — the `▤ Context` peer segment lives here; the layer-toggle sub-bar is launcher-layer view intent, not BIM state (P6/P7 respected). |
| **C10-PERFORMANCE-AND-OBSERVABILITY** | **Gap: no view-activation budget.** Propose the <2 s first-interactive budget (§5) as a C10 clause; every new Context Engine exported fn needs an OTel span (P8). |
| **SPEC-FORMA-SITE-VIEW** | §2/§8 abstract-massing intent — **the Context View exists precisely so this stays abstract and untouched**; §8.3 single-projector rule (Context obeys — reuses LTP-ENU). |
| **ADR-0268** | Cesium 3D-Tiles georeferenced placement — the anchor the Context View reuses to seat the model; the 3D-Tiles hand-off path for LOD2 (P4). |
| **ADR-0088** | Gentle Overpass mirrors — preserved inside the keyless `OverpassBuildingProvider` the Context View reuses. |
| **ADR-0065** | Geodata analytical layers *pluggable provider* — the pattern to mirror for the Context Engine provider abstraction (P3). |

**Coverage gaps → recommended new governance:**
- **SPEC-CONTEXT-VIEW** (new) — the view's lifecycle, the peer-segment/state-machine contract, the layer set, and the no-regression-of-Forma guarantee. (This design doc is its input.)
- **C12-CONTEXT-ENGINE** (new contract, or C12 §9+) — the provider interfaces (audit §7.1), tier/fallback policy, per-layer perf budget, EPSG/tile-index rules. Author before P3 build.
- **C10 view-activation budget clause** — the <2 s target (§5). Author with P0.

**Confirmed:** the existing abstract "3D Site" (Forma) view is **untouched** — the Context View is a fourth peer segment on the same bar, running the same reused Cesium viewer in a new `contextMode`, with `formaMode` and all Forma code paths byte-for-byte unchanged.

---

*End of design. No code was modified; only this file was created.*
