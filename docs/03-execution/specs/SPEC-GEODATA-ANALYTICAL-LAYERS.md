# SPEC — Geodata Analytical Layers (Forma/Cesium draped layers, pluggable providers)

**Status:** DRAFT (2026-06-09) · **Owner:** PRYZM core · **Tracker:** `GEODATA-LAYERS` → tracker §29
**Governs:** the engineering design of the **analytical geodata layer subsystem** — a Hektar-style country-grouped **Layers panel** on PRYZM's Forma 3D site view, draping national open-data analytical layers (flood, landslide, slope, soil, noise, protected habitats, population, property/detail plans, ancient monuments, drainage basins, ground coverage, terrain shading) over the Cesium terrain + white building massing, each layer a **toggle + opacity slider**, sourced through a **pluggable provider abstraction**.
**Governance:** [C55 — Geodata Analytical Layers](../../02-decisions/contracts/C55-GEODATA-ANALYTICAL-LAYERS.md) (the binding invariants) · [ADR-0065](../../02-decisions/adrs/0065-geodata-analytical-layers-pluggable-provider.md) (the pluggable-provider draped-layer decision) · [C19](../../02-decisions/contracts/C19-SITE-MODEL-AND-PARCEL.md) (Site + parcel bbox) · [C12](../../02-decisions/contracts/C12-GEOSPATIAL.md) (LTP-ENU + WGS84 reprojection) · [C22](../../02-decisions/contracts/C22-PRIVACY-AND-PII-TIER.md) (population/sensitive tier) · [C23](../../02-decisions/contracts/C23-PROVENANCE-AND-AI-AUDIT.md) (attribution) · [C04](../../02-decisions/contracts/C04-RENDERING-AND-SCHEDULING.md) (THREE/rAF ownership) · [C45](../../02-decisions/contracts/C45-BROWSER-AND-DEVICE-MATRIX.md) (tiling tiering) · [C49](../../02-decisions/contracts/C49-MULTI-REGION-AND-SOVEREIGNTY.md) (per-country sovereignty).
**Relates to:** [SPEC-FORMA-SITE-VIEW](./SPEC-FORMA-SITE-VIEW.md) §5 (the view toggle the panel sits beside) + §6 (the existing sun/shadow/wind/climate overlays the Layers panel joins as a peer) · [SPEC-WIND-CFD-LBM](./SPEC-WIND-CFD-LBM.md) (the wind-CFD comfort field is a sibling analytical layer on the same view) · [SPEC-ENVIRONMENTAL-DESIGN-DRIVERS](./SPEC-ENVIRONMENTAL-DESIGN-DRIVERS.md) (the future flood/landslide/slope → generator-keep-out tie-in, §10).
**Scope discipline:** the subsystem is a NEW pure registry/provider package + an editor panel; it **consumes** the existing Site/Forma/Cesium substrate read-only and **drapes** layers through the existing THREE/Cesium owner. It does NOT introduce a parallel site model, a new coordinate frame, or a new viewer; it does NOT (in GL.1–GL.5) feed the generator.

> Reference (founder-shared): Hektar, a Nordic early-stage land-analysis tool — a Layers panel on the right of a 3D massing+terrain view, analytical geodata grouped by country (DK / NO / SE) plus a cross-country top group (Europe), each layer a toggle + opacity slider, draping over terrain + white massing; data credited to Lantmäteriet, SGU (Sveriges geologiska undersökning), Mapbox, Nimbo.

---

## §1 — Why (and why on the existing Forma view)

PRYZM's Forma site view already shows imagery (OSM/ESRI/Google 3D Tiles), context buildings, and **climate** overlays (sun scrubber, soft shadow, wind rose + 3D streaks, comfort heat field — `FormaSiteAnalysisControls.ts`, SPEC-FORMA-SITE-VIEW §6). It does not show the **land constraints** that are the reason an early-stage land tool exists: flood, landslide, slope, soil, ground coverage, statutory plans, heritage, drainage, population, noise, protected habitats. Those are national open-data products. This SPEC adds a **Layers panel** that drapes them on the view PRYZM already has, sourced through a pluggable provider so registries grow per-country. No layer code ships with this SPEC; it is the engineering design behind C55.

## §2 — Invariants (engineering restatement of C55)

1. A layer is a **pure descriptor** (§3); the panel + renderer + provider lookup are derived from it (C55 §1.1).
2. Layers **drape** (Cesium imagery / clamped-to-ground vector); they are never BIM, never mutate the Site (C55 §1.2).
3. The core depends only on the **`GeodataProvider` interface**; no country/registry/layer hardcoded in L1/L2 or the panel (C55 §1.3).
4. No provider / no data / reprojection failure → **quiet per-layer no-op** with a "no data here" affordance (C55 §1.4).
5. **Attribution** is mandatory + recorded as provenance (C55 §1.5, C23).
6. Population/noise/sensitive layers carry a **C22 `dataTier`** and respect C49 sovereignty (C55 §1.6).
7. **Opacity is render-only (no re-fetch)**; layers lazy-load + tile + cache (C55 §1.7).
8. Layers feed analysis only through **existing** consumers (future tie-in, §10); no parallel objective (C55 §1.8).

## §3 — Schema (pure, L0 — `packages/schemas/src/geodata/`)

```ts
// All pure (P5): no Cesium/THREE/DOM/I-O imports.

type GeodataGroupId = string;          // 'Europe' | 'SE' | 'NO' | 'DK' | …  (country ISO-3166-1 alpha-2 or a named cross-country group)
type GeodataProviderId = string;       // 'lantmateriet-sgu' | 'ogc-wms' | …
type GeometryKind = 'raster' | 'vector';
type DrapeMode = 'terrain' | 'building' | 'overlay';   // clamp-to-ground | also over massing | screen-space
type DataTier = 'PUBLIC' | 'PROJECT' | 'DERIVED' | 'PII';   // per C22

interface GeodataLegend {
  kind: 'ordinal' | 'continuous';
  stops: Array<{ value: number | string; colour: string; label: string }>;
  units?: string;
}

interface GeodataLayer {
  id: string;                          // stable, provider-namespaced: 'se.sgu.landslide-susceptibility'
  group: GeodataGroupId;               // the panel accordion
  title: string;                       // 'Landslide Susceptibility'
  sourceProviderId: GeodataProviderId;
  geometryKind: GeometryKind;
  drapeMode: DrapeMode;
  legend: GeodataLegend;
  defaultOpacity: number;              // 0..1
  dataTier: DataTier;                  // C55 §1.6
  attribution: string;                 // non-empty (C55 §1.5) — 'SGU — Sveriges geologiska undersökning'
  minZoom?: number; maxZoom?: number;
}

// Runtime layer state (visibility intent — P7; not persisted to .pryzm)
interface GeodataLayerState { layerId: string; enabled: boolean; opacity: number; }

// A fetched tile payload (provider → renderer); raster = image bytes/URL template, vector = GeoJSON-ish features
type GeodataTile =
  | { kind: 'raster'; bbox: [number,number,number,number]; z: number; image: ImageRef }
  | { kind: 'vector'; bbox: [number,number,number,number]; z: number; features: GeoFeature[] };
```

## §4 — Registry + provider interface (L1/L2 — `packages/geodata-layers/`)

```ts
// Pure: no Cesium/THREE/DOM. Adapters that DO I/O live at L5 (apps/editor) and implement this.
interface GeodataProvider {
  readonly id: GeodataProviderId;
  readonly country: GeodataGroupId;            // the accordion this provider's layers default into
  listLayers(): GeodataLayer[];                // descriptor catalogue (C55 §1.1)
  fetchTile(layerId: string, bbox: [number,number,number,number], z: number): Promise<GeodataTile | null>; // null = no data here (C55 §1.4)
  legendFor(layerId: string): GeodataLegend;
  attribution(): string;                        // C55 §1.5
}

class GeodataLayerRegistry {
  registerProvider(p: GeodataProvider): void;   // C55 §1.3 — runtime, via geodata.registerProvider
  groups(): GeodataGroupId[];                   // for the panel accordions
  layers(group?: GeodataGroupId): GeodataLayer[];
  providerFor(layerId: string): GeodataProvider | null;
}
```

- **Tile cache** keyed `(providerId, layerId, bbox-quantised, z)`, LRU-bounded (C55 §1.7; size in §8). Opacity changes never touch the cache or the provider.
- **Reprojection** helpers reuse C12 (`packages/geospatial/`) WGS84 ↔ project CRS so a layer's native CRS (often a national grid, e.g. SWEREF99 TM) drapes correctly.

## §5 — Rendering + draping on Cesium (L5 binding)

- **Raster layers** → a Cesium `ImageryLayer` added on top of the basemap (the same `viewer.imageryLayers.addImageryProvider` path `CesiumViewport.ts` uses for the ESRI/OSM basemaps), `alpha` driven by the layer's opacity. Clamped to terrain by Cesium's globe.
- **Vector layers** → clamped-to-ground polygons/polylines (Cesium entities with `classificationType = TERRAIN`, or a draped renderer through `packages/renderer-three/` for the in-scene massing-aware case — P2). `drapeMode: 'building'` lets a layer also tint the white massing where relevant.
- **Palette:** legends use the dataset's own ramp; PRYZM chrome (the panel, toggles, sliders) stays white + `#6600FF` per brand. The analysis-canvas (Forma) palette is unchanged.
- **Feature-detect + degrade** (mirror the defensive try/catch in `CesiumViewport.ts`): a layer that can't drape (no terrain provider, post-process unavailable) falls back to flat overlay or shows "no data here", never throws (C55 §1.4).

## §6 — Layers panel UI (the Hektar UX, L5)

- A right-side **Layers panel** (a peer of the existing `FormaSiteAnalysisControls`), in white + `#6600FF` chrome, mounted only on the **Site 3D (Forma)** view (reuse `GISAreaLayout`'s `setVisible` plumbing).
- **Country-grouped accordions**: a top cross-country group (**Europe** — Labels / Other / Noise Pollution / Population / Natura 2000 Habitats) then one accordion per registered provider's country (**Denmark / Norway / Sweden / …**) populated from `registry.groups()` + `registry.layers(group)`.
- **Per layer:** a **toggle** (`geodata.toggleLayer`) + an **opacity slider** (`geodata.setOpacity`) + the **legend** + the **attribution** line. A layer with no data for the current bbox renders greyed with a "no data here" note (C55 §1.4).
- Toggling persists as **visibility intent** (P7) for the session, not into the `.pryzm` file.

## §7 — Initial layer catalogue (the founder's reference set)

The reference layers, with the geometry kind + the drape mode + the C22 tier the descriptor carries. All are draped read-only context (C55 §1.2). The **Sweden** column maps to the reference Lantmäteriet/SGU adapter (§9); equivalents register under NO/DK as their adapters land.

| Layer | `geometryKind` | `drapeMode` | `dataTier` | Reference source |
|---|---|---|---|---|
| Property Regions | vector | terrain | PROJECT | Lantmäteriet (cadastre) |
| Detail Plans (statutory) | vector | terrain | PROJECT | Lantmäteriet / municipal |
| Ground Coverage | raster | terrain | DERIVED | Lantmäteriet land-cover |
| Terrain Shading (hillshade) | raster | terrain | DERIVED | Lantmäteriet DEM |
| Terrain Slope | raster | terrain | DERIVED | Lantmäteriet DEM (derived) |
| Soil Types | vector/raster | terrain | DERIVED | SGU |
| Landslide Susceptibility | raster | terrain | DERIVED | SGU |
| Calculated Maximum Flood | raster | terrain | DERIVED | national flood agency |
| 200-year Flood | raster | terrain | DERIVED | national flood agency |
| 100-year Flood | raster | terrain | DERIVED | national flood agency |
| Ancient Monuments (heritage) | vector | terrain | PROJECT | heritage registry |
| Drainage Basins | vector | terrain | DERIVED | hydrology registry |
| Population per km² | raster | terrain | **PII-adjacent → PROJECT** | statistics agency (aggregate) |
| Noise Pollution | raster | terrain | **PROJECT** | environmental agency |
| Natura 2000 Habitats | vector | terrain | PUBLIC | EU / EEA (cross-country `Europe` group) |

The catalogue is **provider-supplied**, not hardcoded — this table is the GL.4 reference adapter's `listLayers()` output, documented here for design, not a core constant (C55 §1.1/§1.3).

## §8 — Performance targets (C10)

- **Toggle-on latency:** first visible tiles within a tile-fetch budget for the current bbox (lazy, tiled — C55 §1.7); subsequent pans served from cache where possible.
- **Opacity:** in-place `ImageryLayer.alpha` / material-opacity mutation animated via the frame scheduler (P3); **zero** provider calls on an opacity change.
- **Cache:** LRU per `(providerId, layerId, bbox-quantised, z)`; bounded (default budget in the C10 NFT table when implemented). Toggling a layer off drops its GPU/imagery resources.
- A panel of N enabled layers MUST NOT stall the editor frame loop; fetches are off the main render path and cancellable.

## §9 — Provider plug-in contract + the reference adapter

- **`GeodataProvider`** (§4) is the only seam. An adapter: declares its `country`, returns a descriptor catalogue, fetches tiles for a bbox/zoom (returning `null` for no-data), and supplies legends + attribution.
- **Reference adapter (GL.4):** a **Swedish Lantmäteriet + SGU** adapter at L5 — Lantmäteriet for cadastre/detail-plans/DEM-derived (terrain shading/slope/ground coverage) and SGU for soil + landslide. It handles the national CRS (SWEREF99 TM → WGS84 via C12), the registry's tile/WMS endpoints, rate limits, and licence attribution. **API keys / endpoints live at the app layer**, never in L1/L2 (ADR-055 deploy-split discipline).
- **OGC fallback adapter:** a generic WMS/WMTS/WFS adapter so any standards-compliant registry (many EU national registries) plugs in with only configuration — the breadth path while bespoke per-country adapters are built.
- **Graceful absence:** a country with no registered provider simply has no accordion; a provider returning `null` greys the layer (C55 §1.4).

## §10 — Future tie-in (reserved, NOT in GL.1–GL.5)

A flood / landslide / slope layer is a natural **build keep-out / suitability surface**. When taken up, the layer's raster MUST feed an **existing** site-constraint / suitability input that the generator already reads (SPEC-ENVIRONMENTAL-DESIGN-DRIVERS), NOT a new "geodata objective" (C55 §1.8, mirroring the C54 §1.6 wind precedent). This SPEC reserves the seam and explicitly scopes GL.1–GL.5 to visualisation only.

## §11 — Phased build plan

- **GL.1 — Registry + panel (L0/L2/L5).** `GeodataLayer`/`GeodataLayerState` schemas + `GeodataLayerRegistry` + `GeodataProvider` interface + the country-grouped Layers panel shell (accordions, toggle, opacity slider), driven by a stub provider. `geodata.toggleLayer` / `setOpacity` / `registerProvider` commands (C55 §2). No real data yet.
- **GL.2 — Raster drape.** Wire a raster layer (a stub/test tile source) onto a Cesium `ImageryLayer` with opacity-in-place (C55 §1.7) + terrain clamping; proves the drape + opacity-without-re-fetch path.
- **GL.3 — Vector layers.** Clamped-to-ground vector drape (property regions / detail plans / drainage basins / heritage / Natura 2000) through the THREE/Cesium owner (P2) + legends.
- **GL.4 — Provider adapters.** The Lantmäteriet/SGU reference adapter (the §7 catalogue) + the generic OGC fallback; CRS reprojection via C12; attribution (C55 §1.5) + the C22 tier on population/noise (C55 §1.6).
- **GL.5 — Legend + attribution + polish.** Per-layer legend rendering, the mandatory attribution line, graceful "no data here" affordance (C55 §1.4), OTel spans (P8), and the C45 tiling/tiering pass.

Each step ships behind its own tests; GL.4 (real adapters) is the only step that touches a network registry — GL.1–GL.3 run on stub providers so the panel + drape + opacity are validated without external dependencies.

## §12 — Acceptance

A user on the **Site 3D (Forma)** view opens the **Layers panel**, expands the **Sweden** accordion, toggles on **Calculated Maximum Flood** and **Landslide Susceptibility**, and sees them drape over the terrain + white massing with a legend and a "Lantmäteriet / SGU" attribution line; dragging each layer's opacity slider fades it instantly with no network call; toggling off drops it. A region with no registered provider shows no accordion; a layer with no data for the current bbox greys out with "no data here" — the Forma view and other layers stay intact. Population + Noise layers carry the C22 tier. No country id or registry URL appears in the L1/L2 core.
