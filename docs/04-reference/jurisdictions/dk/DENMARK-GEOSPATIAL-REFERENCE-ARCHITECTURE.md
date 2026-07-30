# Denmark Geospatial Reference Implementation — Toolchain Validation & Unified Architecture

> **Stamp**: 2026-07-17 · **Status**: VALIDATION + ARCHITECTURE (no code changed, no contract flipped, no tracker edited)
> **Author**: Principal GIS / Geospatial-Data-Engineering Architect (validation pass)
> **Tracker**: **L-383** (this initiative) · sub-items **L-383a–e** (§8). **Unifies L-380** (parcel-select →
> buildable-envelope, `PARCEL-ZONING-FEATURE-SCOPING.md`) **and L-374** (provider-agnostic Context Engine,
> `FORMA-CONTEXT-ENGINE-AUDIT.md`) on a single genuinely-open national dataset.
> **Governance posture**: launch-readiness/strategy validation doc, NOT a `*-AUDIT.md` contract-derivative. References
> the canonical C-contracts; authors none. Recommends governance (§6); flags conflicts, resolves none.
> **Business posture (unchanged)**: **Spain stays the business-priority market** (L-380). Denmark is the **technical
> reference implementation** that proves the whole pipeline end-to-end on open data — NOT a market change.

---

## §0 — The item, in one line

> Prove PRYZM's **entire** geospatial pipeline — **parcel → zoning (legislation) → real LOD2 semantic 3D buildings →
> real terrain** — end-to-end on Denmark's genuinely-open national data, through a **permissively-licensed open-source
> toolchain** (GDAL · proj4js · Turf · citygml-tools · tyler/3d-tiles-tools · cesium-terrain-builder · PostGIS+Martin),
> validated tool-by-tool against PRYZM's **actual** existing seams before any code is committed. Denmark is the
> reference adapter set that L-380's Parcel/Zoning providers and L-374's Building/Terrain providers generalise from;
> **GeoJSON (WGS84) is the one canonical interchange** and everything downstream stays source-format- and CRS-blind.

---

## §1 — Executive summary + per-tool verdict

Denmark is the **only** validated jurisdiction where all four substrate layers are open at national scale: parcels
(Matriklen), zoning-as-legislation (Plandata.dk, structured fields), **real semantic LOD2 CityGML buildings** ("Danmark
i 3D"), and **survey-grade terrain** (DHM LiDAR + 0.4 m DTM/DSM). Spain/Switzerland have parcels + zone-class but **no
free LOD2** — so Denmark is the technical proving ground and Spain/CH ride the **footprint-extrusion** path (§4.4).

Every tool in the requested chain is **permissively licensed for commercial use** and integrates with an **existing**
PRYZM seam. The integration risk is **not** licensing and **not** the JS libraries — it is the **native-binary / JVM
deploy story on Fly** for the four offline converters (GDAL, citygml-tools, cesium-terrain-builder, tyler). The
mitigation (validated below) is that all four run **offline, pre-baking static artefacts** (3D-Tiles + quantized-mesh +
GeoJSON) that the browser and the existing Cesium/MapLibre viewers consume with **no runtime binary dependency** — the
only thing that must ship in the Fly image is the lightweight **runtime WFS/tile proxy** (a clone of
`server/overpassProxy.js`) and, optionally, the PostGIS+Martin serving tier as a **separate service**, not in the app image.

### Per-tool verdict (detail + `file:line` in §3)

| Tool | Role | License (verified) | PRYZM seam | Verdict |
|---|---|---|---|---|
| **GDAL/OGR (`ogr2ogr`)** | Ingestion normalizer WFS/GML/SHP→GeoJSON | **MIT-style** (OSGeo/gdal LICENSE.TXT) | offline worker behind `server/parcelZoningProxy.js` (clone of `overpassProxy.js`, mounted `server.js:357`) | **CLEAN (offline) / CAVEAT (native binary if run in-image)** |
| **proj4js** | Reprojection at the edge (25832/25830-31/2056→WGS84) | **MIT** (already dep `packages/geospatial/package.json:20` `proj4 ^2.15.0`) | reuse `LTPENURebase.ts:57` `proj4.defs('PROJECT_CRS',…)`; no new dep | **INTEGRATES-CLEANLY** |
| **Turf.js** | Setback inset (neg. buffer), area, point-in-polygon parcel pick | **MIT** (Turfjs/turf) | pairs with `SiteBoundaryMap2D.ts` (`queryRenderedFeatures:868`); target of L-380b `computeBuildableEnvelope` | **CLEAN — but NEW dep (Turf is NOT currently in the tree — see §3.3)** |
| **PDAL** | DHM LiDAR LAZ processing | **BSD-3** | optional/later; DTM GeoTIFF is the simpler start | **CLEAN (optional, defer)** |
| **citygml-tools** | CityGML→CityJSON | **Apache-2.0**, Java-17 CLI (citygml4j/citygml-tools) | offline one-time/cached; feeds the tiler | **INTEGRATES-WITH-CAVEAT (JVM deploy → run offline)** |
| **tyler (3DGI)** *(primary CityJSON→3D-Tiles)* | CityJSON→glTF/glb → 3D Tiles w/ per-feature metadata | **UNVERIFIED — likely Apache/MIT** (3DGI/tyler, Rust; confirm at integration) | output = `Cesium3DTileset` dropped via `scene.primitives.add` (`CesiumViewport.ts:1399/1440`) | **INTEGRATES-WITH-CAVEAT (verify license; depends on geoflow-bundle)** |
| **3d-tiles-tools (CesiumGS)** *(post-process/optimise)* | gzip/merge/upgrade/optimise 3D Tiles; glTF↔b3dm | **Apache-2.0**, Node/npm (CesiumGS/3d-tiles-tools) | same tileset seam | **CLEAN — CAVEAT: does NOT ingest CityJSON (glTF↔tiles only) → tyler/py3dtiles does the CityJSON step** |
| **py3dtiles (Oslandia/OSGeo)** *(alt tiler)* | Convert to 3D Tiles (points/WKB; CityJSON via py3dtilers) | **Apache-2.0** (OSGeo project) | same tileset seam | **CLEAN (alternative to tyler)** |
| **cesium-terrain-builder** | DTM GeoTIFF→quantized-mesh terrain tiles | **Apache-2.0** (geo-data original) | terrain seam `CesiumViewport.ts:4588` + `terrainProviderHasElevationData:4687` (terrain is NEVER attached today, `:4593-4607`) | **INTEGRATES-WITH-CAVEAT — original outputs legacy heightmap-1.0 only; use the quantized-mesh fork (tum-gis `ctb-quantized-mesh` docker / ahuarte47 fork)** |
| **PostGIS** | In-house normalized geospatial store | **GPLv2** (usage-as-DB is unrestricted per PostGIS FAQ) | extends existing Postgres (`package.json:249` `pg ^8.20.0`) | **INTEGRATES-WITH-CAVEAT — GPLv2 (not permissive) but DB-usage explicitly unrestricted; needs PostGIS enabled on the managed PG** |
| **Martin (MapLibre)** | Vector-tile server off PostGIS | **Apache-2.0 / MIT dual** (maplibre/martin, Rust) | serves MVT to `SiteBoundaryMap2D` (MapLibre) + could serve context to Cesium | **INTEGRATES-CLEANLY (as a separate service)** |
| **pg_tileserv (Crunchy)** *(Martin alt)* | Vector-tile server off PostGIS | **Apache-2.0** | same | **INTEGRATES-CLEANLY (alt to Martin)** |

**Biggest integration RISK**: the **native-binary/JVM deploy story on Fly** (GDAL, citygml-tools, cesium-terrain-builder,
tyler). **Recommendation**: keep all four **out of the Fly app image** — run them **offline / in a one-shot Docker build
job**, pre-bake the static artefacts (Denmark 3D-Tiles + quantized-mesh terrain + normalized GeoJSON/PostGIS), and serve
those through (a) static hosting / object storage, (b) the lightweight runtime WFS proxy in the Node image, and
optionally (c) a **separate** PostGIS+Martin Fly service. The Fly **app** image gains **zero** new native dependencies.

---

## §2 — Denmark open-data validation (LIVE, cited)

> **The API-key gate is real and explicit**: Denmark's authoritative datasets (Matriklen, Danmark-i-3D, DHM via the
> Datafordeler/REST+FTP paths) are **open-with-key, NOT keyless**. Registration is **free** self-service.

### §2.1 — Datafordeler API-key / access flow (the gate)

- **Access model (verified)**: to pull data programmatically you register a **web user** via Datafordeler
  Self-Service (activate via email link), then create an **IT-system** and a **service user**, and issue an **API-key**
  (or OAuth) for that IT-system. Login via **MitID or email**. Free. WFS/WMS/WMTS, REST, FTP and file-download are all
  gated behind this. — `https://datafordeler.dk/vejledning/brugeradgang/` ·
  `https://datafordeler.dk/vejledning/brugeradgang/brugeroprettelse/` (fetched 2026-07-17).
- **Implication for PRYZM**: the runtime proxy (System C, §4) holds a **single server-side service-user API-key**;
  the browser never sees it (mirrors how a keyed Cesium/Google token is server-gated today). For the reference build,
  the **offline** pre-bake job uses the same key once, so runtime key traffic is minimal.
- **Note**: some layers are also mirrored **keyless** on `api.dataforsyningen.dk` (Dataforsyningen/"Kortforsyningen"
  successor) with a `token=` param; the Matriklen/Danmark-i-3D authoritative feeds are the **Datafordeler key** path.

### §2.2 — Parcels — Matriklen / Matrikelkort (jordstykke)

- **Source**: Matriklen2 (cadastre) via **Datafordeler**, feature `jordstykke` (parcel) / matrikelkort. WFS 2.0.0 + GML.
- **CRS**: **EPSG:25832** (ETRS89 / UTM32N). **License**: open (Danish public-authority open data), **free-with-key**.
- **Access**: Datafordeler service-user API-key (§2.1). Confirmed open-with-key in the L-380 scoping (`§3.3`).
- Reference: `https://datafordeler.dk` (Matriklen product) — key flow §2.1.

### §2.3 — Zoning-as-legislation — Plandata.dk

- **Source**: **Plandata.dk** (national plan register) — `lokalplan` + `kommuneplan(ramme)` polygons with **structured
  fields**: `bebyggelsesprocent` (≈ FAR/plot-ratio), `maksbygningshoejde`/max height, `maksantaletager` (max floors),
  `anvendelse` (permitted use), zone status. Queryable by point/BBOX (spatial WFS). **National, single register** —
  the single most standardized open zoning source (L-380 §4.1/§4.3 ranks it best-in-class).
- **Format/CRS**: WFS/WMS/WMTS, GML/GeoJSON, EPSG:25832. **License**: open. Endpoint (GeoServer WFS):
  `http://wfs.plansystem.dk/geoserver/wfs?service=WFS&request=GetCapabilities` (per L-380 §15).
- **Note**: numeric fields populated on a large share (not 100%) of local plans; where absent, the L-380 two-fidelity
  Zoning-Rules-Engine's curated `JurisdictionZoningContract` fills the gap — but Denmark needs it **least** of any
  jurisdiction (that is exactly why it is the reference).

### §2.4 — LOD2 3D buildings — "Danmark i 3D" (CityGML)

- **Verified**: Denmark publishes a **national semantic LOD2 CityGML** city model ("Danmark i 3D") — every GeoDanmark
  building as a **separate CityObject with a unique ID**, roof surfaces modelled (LOD2.0, primarily gable), fused from
  the GeoDanmark building theme + DHM + oblique photos, and linkable to **BBR/DAR/CVR** registries. Open XML CityGML,
  distributed by SDFE → **Klimadatastyrelsen** via Datafordeler. — search-verified 2026-07-17
  (`sdfi.dk` gevinstanalyse "Danmark i 3D"; `norden.lmi.is` "Denmark in 3D"; OloOcki/awesome-citygml).
- **This is REAL semantic LOD2 at national scale, free-with-key** — the differentiator vs Spain/CH (which have no free
  LOD2). It is the input to the CityGML→CityJSON→3D-Tiles pipeline (§3.5–§3.6).
- **Generalisation**: **Germany** publishes nationwide **LOD2-DE** CityGML too
  (`data.europa.eu/data/datasets/31bedca5-1843-4254-a168-1acda618c0b4`) — the same pipeline extends to DE unchanged.

### §2.5 — Terrain — DHM (Danmarks Højdemodel)

- **Verified**: DHM = **LiDAR LAZ point cloud ~4.5 pts/m², classified into 13 classes** (ground/buildings/veg/bridge…),
  **+ derived 0.4 m DTM & DSM GeoTIFF rasters** (~5 cm vertical accuracy), offered in 10 km blocks. Free under Denmark's
  open-data license, **commercial use allowed**. — `dataforsyningen.dk/data/930`; product spec
  `dataforsyningen.dk/asset/PDF/produkt_dokumentation/dhm-prodspec-v1.0.0.pdf`; DHM WMS
  `api.dataforsyningen.dk/dhm_DAF?request=GetCapabilities&service=WMS&token=` (search-verified 2026-07-17).
- **CRS**: EPSG:25832. **The DTM GeoTIFF is the simple start** (→ cesium-terrain-builder → quantized-mesh); the LAZ
  point cloud (→ PDAL) is the optional later/engineering path.

---

## §3 — Toolchain validation against PRYZM's ACTUAL stack

Each tool: what it is (repo-verified) · where it plugs into PRYZM (`file:line`) · integration mode · caveat/blocker · license.

### §3.1 — GDAL/OGR (`ogr2ogr`) — the ingestion normalizer
- **Verified**: MIT-style license (OSGeo/gdal `LICENSE.TXT`) — permissive, commercial OK. `ogr2ogr` normalizes
  WFS/GML/Shapefile/ArcGIS-JSON → GeoJSON and reprojects (`-t_srs EPSG:4326`) in one pass.
- **PRYZM seam**: the **planned** `server/parcelZoningProxy.js` (L-380d) is a clone of **`server/overpassProxy.js`**
  (read in full; mounted `server.js:357` `app.post(OVERPASS_PATH, apiLimiter, overpassBodyParser, overpassHandler)`).
  That proxy's shape — forward-once, hash LRU cache, 24 h TTL, non-fatal empty fallback — is the exact template.
- **Integration mode**: GDAL is best run as an **offline batch** (pre-bake Denmark GeoJSON/PostGIS once) — NOT as a
  per-request child-process in the hot path. If a runtime `ogr2ogr` child-process is ever wanted, it becomes a native
  binary in the Fly image (see §5). For the reference build, prefer **proj4js at the edge** (already in-tree, §3.2) for
  the light per-request reprojection, and reserve GDAL for the heavy offline GML/CityGML normalization.
- **Verdict**: **INTEGRATES-CLEANLY (offline batch) / INTEGRATES-WITH-CAVEAT (native binary if run in the Fly image)**.

### §3.2 — proj4js — reprojection at the edge
- **Verified**: MIT. **Already a dependency**: `packages/geospatial/package.json:20` → `"proj4": "^2.15.0"`; used in
  `packages/geospatial/src/LTPENURebase.ts:57` (`proj4.defs('PROJECT_CRS', proj4String)`) — the C12 LTP-ENU rebase engine.
- **PRYZM seam**: DK 25832 / ES 25830-31 / CH 2056 → WGS84 all resolve through the **existing** proj4 + `LTPENURebase`.
  `buildBoundaryFromLatLonRing` (`apps/editor/src/ui/site/boundaryProjection.ts:143`) already converts a WGS84 ring →
  scene-XZ — a fetched parcel ring is "just a pre-supplied ring" (L-380 §2). **No new dependency, no second projector**
  (SPEC-FORMA §8.3 single-projector rule preserved).
- **Verdict**: **INTEGRATES-CLEANLY** (reuse).

### §3.3 — Turf.js — setback inset / area / point-in-polygon
- **Verified**: MIT (Turfjs/turf). `buffer` (negative → setback inset), `area`, `booleanPointInPolygon` (parcel pick),
  `intersect`.
- **PRYZM seam reality-check (correction to an assumption)**: **Turf is NOT currently in the tree** — a repo-wide
  `grep '@turf' packages/**/package.json apps/**/package.json` returns **nothing**, and `SiteBoundaryMap2D.ts` does
  parcel-footprint picking with **MapLibre's own `queryRenderedFeatures`** (`SiteBoundaryMap2D.ts:868`), not Turf. So
  the L-374/L-380 phrasing "SiteBoundaryMap2D uses Turf" is **UNVERIFIED — actually it does not (yet)**.
- **Where it lands**: Turf becomes the geometry engine for **L-380b `ZoningRulesEngine.computeBuildableEnvelope`**
  (parcel ⊖ setbacks = `turf.buffer(polygon, -setback)`; `maxVolume = area × maxHeight`), a **new** pure L2 package
  (`packages/site-parcel-data/`). It is a **new (small, permissive) dependency**, not a reuse.
- **Verdict**: **INTEGRATES-CLEANLY — but as a NEW dep** (flag for the lockfile-sync discipline).

### §3.4 — PDAL — DHM LiDAR point cloud (optional/later)
- **Verified**: BSD-3 (PDAL). Classifies/filters/rasterizes LAZ.
- **Assessment**: **defer.** The DHM **0.4 m DTM GeoTIFF** (§2.5) is a strictly simpler terrain start and needs only
  GDAL + cesium-terrain-builder. PDAL is the later engineering path (custom DTM/DSM from raw LAZ, canopy for L-374d
  vegetation). Not on the reference-implementation critical path.
- **Verdict**: **INTEGRATES-CLEANLY (optional, deferred)**.

### §3.5 — citygml-tools — CityGML→CityJSON
- **Verified**: Apache-2.0, **Java-17 CLI** (citygml4j/citygml-tools); converts CityGML↔CityJSON, plus validate/reproject.
- **PRYZM seam**: **offline one-time/cached** conversion of "Danmark i 3D" CityGML → CityJSON, feeding the tiler (§3.6).
  No runtime PRYZM code path — it produces a static artefact.
- **Caveat**: **JVM** in the pipeline. Run it in the **offline build job / its Docker image**, never in the Fly app image.
- **Verdict**: **INTEGRATES-WITH-CAVEAT (JVM — offline only)**.

### §3.6 — tyler / 3d-tiles-tools / py3dtiles — CityJSON/glTF → Cesium 3D Tiles
- **Verified**:
  - **3d-tiles-tools (CesiumGS)** — Apache-2.0, Node/npm. **CAVEAT (verified): it does NOT ingest CityJSON** — it
    converts **glTF↔b3dm/i3dm/pnts/cmpt** and optimises/merges/gzips tilesets. So it is the **post-processor**, not the
    CityJSON entry point.
  - **tyler (3DGI)** — Rust; **CityJSON/CityJSONSeq → glb → 3D Tiles** directly, embedding **per-CityObject metadata**
    (`EXT_mesh_features` / `EXT_structural_metadata`) + meshopt/quantization compression + optional implicit tiling.
    Depends on the **geoflow-bundle** for the CityJSON→glTF step. **License UNVERIFIED — likely Apache/MIT; confirm at
    integration.**
  - **py3dtiles (Oslandia/OSGeo)** — Apache-2.0; alternative tiler (CityJSON via the py3dtilers front-end).
- **Recommended chain**: CityGML →(citygml-tools)→ CityJSON →(**tyler**)→ **3D Tiles (glb) w/ semantic metadata**
  →(**3d-tiles-tools**, optional)→ gzip/optimise/merge.
- **PRYZM seam**: the output tileset drops into the **existing** Cesium path — `Cesium3DTileset.fromUrl(...)` then
  `this.viewer.scene.primitives.add(tileset)` exactly as `CesiumViewport.ts:1399` (`fromIonAssetId`) and `:1440`
  (`createGooglePhotorealistic3DTileset`) already do. The viewer already tracks tilesets
  (`private photorealTileset: Cesium.Cesium3DTileset` `:884`; `p instanceof Cesium.Cesium3DTileset` `:2021/:2370`). A
  **Denmark semantic LOD2 tileset is a second `Cesium3DTileset` added alongside** the photoreal/OSM context — the
  L-374 "engineering context tier" (semantic, not photoreal). Per-CityObject metadata → the future
  `BuildingProvider.fetchTile` LOD2 hand-off (L-374 §7.1).
- **Verdict**: **3d-tiles-tools INTEGRATES-CLEANLY** (post-process); **tyler INTEGRATES-WITH-CAVEAT** (verify license;
  offline; geoflow-bundle dependency). The tileset **consumption seam in PRYZM is proven to already exist**.

### §3.7 — cesium-terrain-builder — DTM GeoTIFF → quantized-mesh terrain
- **Verified**: geo-data/cesium-terrain-builder — Apache-2.0, **C++11 CLI** (`ctb-tile`, GDAL-based). **CAVEAT
  (verified): the original emits legacy `heightmap-1.0` only — quantized-mesh is on its TODO.** The maintained
  quantized-mesh path is the **tum-gis `ctb-quantized-mesh` Docker image** (from the **ahuarte47** fork), Apache-2.0.
- **PRYZM seam (the payoff)**: PRYZM's Cesium **never attaches a real terrain provider today** — verified at
  `CesiumViewport.ts:4593-4607` (explicit comment: "the keyless/no-token build NEVER attaches a real terrain
  provider… we deliberately do NOT create/await a world-terrain provider"), `terrainProviderHasElevationData:4687`
  (rejects `EllipsoidTerrainProvider`, requires `provider.availability`), and `sampleTerrainMostDetailed` at `:4627`.
  A DHM-derived **quantized-mesh tileset served behind a standard `CesiumTerrainProvider`** satisfies the
  `availability != null` gate → `sampleTerrainMostDetailed` **actually runs** → the model + context clamp to **true
  ground** instead of flat base-0. **This flips L-374's "terrain clamp degraded" default into truth** (L-374 §1.2, §5).
- **Caveat**: native C++/GDAL binary; **use the quantized-mesh fork**; **offline** tile-bake (§5).
- **Verdict**: **INTEGRATES-WITH-CAVEAT** (fork required for quantized-mesh; offline binary; but the runtime consumption
  seam is a **standard `CesiumTerrainProvider`** — clean).

### §3.8 — PostGIS + Martin / pg_tileserv — in-house serving tier
- **Verified**:
  - **PostGIS** — **GPLv2**. Per the PostGIS FAQ (`postgis.net/documentation/faq/gpl-license/`): *"the GPL's share-and-
    share-alike clauses do not apply to ordinary uses of a spatial database, such as loading data into it and running
    queries."* Only **modifying + distributing** PostGIS itself triggers GPL. PRYZM uses it as a **DB server over a
    network** → proprietary code unaffected. **PRYZM already runs Postgres** (`package.json:249` `"pg": "^8.20.0"`;
    CLAUDE.md "PostgreSQL is the database"), so PostGIS is a **`CREATE EXTENSION postgis`** on the existing DB (managed-
    PG permitting) — no new datastore.
  - **Martin (MapLibre)** — Apache-2.0/MIT dual, Rust; serves MVT vector tiles straight from PostGIS
    (auto-discovers tables/functions). **pg_tileserv (Crunchy)** — Apache-2.0 — is the equivalent alternative.
- **PRYZM seam**: the "serve-in-house" tier — normalize gov WFS **once** into PostGIS, then serve **vector tiles** to
  `SiteBoundaryMap2D` (MapLibre, native MVT) and GeoJSON to the providers, instead of re-hammering Datafordeler per
  request (rate-limit citizenship + latency). Martin runs as a **separate service** (not in the Node app image).
- **Verdict**: **PostGIS INTEGRATES-WITH-CAVEAT** (GPLv2 licensing nuance — resolved by DB-usage exemption; needs
  PostGIS enabled on the managed PG). **Martin/pg_tileserv INTEGRATES-CLEANLY** (separate permissive service).

---

## §4 — The unified architecture (Denmark reference implementation)

### §4.1 — One canonical interchange: **GeoJSON (WGS84)**

GDAL (offline) and proj4js (edge) translate **every** source format/CRS → **GeoJSON WGS84** at ingestion. Everything
downstream — Turf, the `ParcelProvider`/`ZoningProvider` (L-380a/b) and `BuildingProvider`/`TerrainProvider` (L-374f)
adapters, and `buildBoundaryFromLatLonRing` (`boundaryProjection.ts:143`) — sees **only WGS84 GeoJSON** and never knows
the source was DK GML/25832 vs ES GML/25830 vs CH GeoJSON/2056. **This is what makes the provider abstractions actually
scale**: a new jurisdiction is a new adapter that emits the same canonical GeoJSON; the core is untouched. The one
exception is the **3D tiers** — LOD2 buildings arrive as **3D Tiles** and terrain as **quantized-mesh** (Cesium's native
streaming formats), pre-baked offline; GeoJSON stays the canonical form for the **2D/vector + envelope** path.

### §4.2 — ASCII architecture diagram

```
                    DENMARK OPEN DATA (free, API-key via Datafordeler §2.1)
   ┌───────────────┬───────────────────┬────────────────────────┬───────────────────────┐
   │ Matriklen     │ Plandata.dk       │ "Danmark i 3D"         │ DHM                    │
   │ jordstykke    │ lokalplan/komm.   │ LOD2 CityGML (semantic)│ DTM/DSM GeoTIFF + LAZ  │
   │ WFS/GML 25832 │ WFS structured fld│ national, per-bldg ID  │ 0.4m 25832 (+4.5pt/m²) │
   └──────┬────────┴─────────┬─────────┴───────────┬────────────┴──────────┬────────────┘
          │ 2D vector        │ 2D vector           │ 3D mesh               │ terrain
          ▼                  ▼                     ▼                       ▼
  ┌─────────────────────────────────────┐  ┌──────────────────┐  ┌──────────────────────┐
  │ INGEST / NORMALIZE (OFFLINE batch)  │  │ citygml-tools    │  │ GDAL + cesium-terrain│
  │  GDAL ogr2ogr  →  GeoJSON (WGS84)   │  │  CityGML→CityJSON│  │ -builder(quantized   │
  │  proj4js (25832→4326)               │  │   ↓ tyler        │  │  -mesh fork)         │
  │  → optional PostGIS store           │  │  CityJSON→3DTiles│  │  DTM→quantized-mesh  │
  └───────────────┬─────────────────────┘  │  (+3d-tiles-tools│  └──────────┬───────────┘
                  │                         │   optimise)      │             │
                  │   CANONICAL = GeoJSON   └────────┬─────────┘             │
                  ▼   (WGS84)                        │ static 3D-Tiles       │ static terrain tiles
  ┌───────────────────────────────────┐             │  (object storage)     │  (object storage)
  │ RUNTIME (Fly app image = light)   │             │                       │
  │  server/parcelZoningProxy.js      │             │                       │
  │  (clone overpassProxy.js:357)     │             │                       │
  │  forward-once + LRU cache + key   │             │                       │
  │  + non-fatal empty fallback       │             │                       │
  │  [opt] PostGIS+Martin MVT (sep svc)│            │                       │
  └───────┬───────────────────┬───────┘             │                       │
          │ GeoJSON           │ GeoJSON/MVT         │ Cesium3DTileset       │ CesiumTerrainProvider
          ▼                   ▼                     ▼                       ▼
  ┌──────────────────┐  ┌──────────────────────────────────────────────────────────────┐
  │ 2D MAP           │  │ 3D VIEW  —  CesiumViewport.ts                                 │
  │ SiteBoundaryMap2D│  │  scene.primitives.add(tileset)  (:1399/:1440 pattern)        │
  │  parcel/zoning   │  │  DK LOD2 semantic tileset  ⟵ L-374 "engineering context tier" │
  │  overlays + pick │  │  terrainProvider = CesiumTerrainProvider  (:4588/:4687 seam,  │
  │  (:868 qRF)      │  │   TODAY never attached :4593-4607 → NOW real ground)          │
  └────────┬─────────┘  └──────────────────────────────────────────────────────────────┘
           │ parcel WGS84 ring
           ▼
  buildBoundaryFromLatLonRing (boundaryProjection.ts:143) → dispatchParcelBoundary → site.parcel-boundary-set
           │
           ▼  ZoningRulesEngine (Turf: parcel ⊖ setbacks, area×maxHeight) → site.updateZoning → buildable envelope
```

### §4.3 — GeoJSON-canonical data flow (one line each)

1. **Parcel pick**: map click → proxy → Matriklen WFS(25832/GML) →(GDAL/proj4js)→ **GeoJSON WGS84 ring** →
   `buildBoundaryFromLatLonRing:143` → `site.parcel-boundary-set` (L-380a).
2. **Zoning**: parcel → proxy → Plandata WFS → **GeoJSON + structured fields** → `ZoningRulesEngine` (Turf inset) →
   `site.updateZoning` → buildable envelope (L-380b).
3. **LOD2 buildings**: (offline) CityGML →citygml-tools→ CityJSON →tyler→ **3D Tiles** → `scene.primitives.add` as a
   second `Cesium3DTileset` (L-374 Building tier).
4. **Terrain**: (offline) DTM GeoTIFF →ctb(quantized-mesh)→ terrain tiles → **`CesiumTerrainProvider`** attached at the
   `:4588/:4687` seam → real ground clamp (L-374 Terrain tier).

### §4.4 — Denmark = reference adapter set; Spain/CH = extrusion path (set the expectation)

- **Denmark** ships the **full** adapter quartet: `DkParcelProvider` (Matriklen), `DkZoningProvider` (Plandata,
  mostly-structured), `DkBuildingProvider` (**real LOD2 3D-Tiles**), `DkTerrainProvider` (**real DHM quantized-mesh**).
- **Spain / Switzerland** have parcels + zone-class but **no free LOD2 and no free national quantized-mesh terrain**.
  Their `BuildingProvider` is the **footprint-EXTRUSION** path — procedurally extrude OSM/cadastral footprints from
  height/floor fields (today's `contextBuildings.ts` LOD1, evolved), and their terrain falls back to the L-374 open
  tier (Copernicus GLO-30). **Explicitly: only Denmark (and Germany LOD2-DE) get semantic LOD2 in this reference;
  everywhere else is extrusion until a local LOD2 source exists.** This is a data-availability fact, not an architecture
  limit — the provider interface is identical; only the tier the adapter resolves to differs.

---

## §5 — Deploy reality-check (Fly / native binaries) — the real risk

Four tools are **native binaries or JVM**: GDAL (C++), citygml-tools (Java-17), cesium-terrain-builder (C++/GDAL),
tyler (Rust + geoflow-bundle). The Fly **app** image today is a Node/Express image (`server.js`) — adding any of these
inflates the image, slows deploys, and risks the "agent-added dep breaks frozen-lockfile / Fly build" class of failure
already burned into memory.

**Recommendation (validated):**

| Concern | Recommendation |
|---|---|
| GDAL / citygml-tools / tyler / cesium-terrain-builder | **Do NOT bundle in the Fly app image.** Run them **offline** in a one-shot Docker build job (locally or CI/GitHub-Actions), **pre-baking static artefacts** once per Denmark data release. |
| LOD2 3D-Tiles + quantized-mesh terrain | **Pre-bake offline → host as static tiles on object storage** (the memory note "re-host on object storage" for the GLB-404 case is the precedent). Cesium streams them by URL — **zero** runtime binary dependency. |
| Runtime WFS/zoning fetch | The **only** new thing in the Fly app image = `server/parcelZoningProxy.js` (pure Node, clone of `overpassProxy.js`) holding the server-side Datafordeler API-key. No native code. |
| PostGIS + Martin (optional serve-in-house tier) | Run as a **separate Fly service** (PostGIS = `CREATE EXTENSION` on the existing/managed PG; Martin = its own Rust container). Not in the app image. |
| On-demand vs pre-bake | **Pre-bake** everything for the reference (Denmark is a fixed, slowly-changing national dataset). Reserve on-demand GDAL/child-process only if a future jurisdiction needs live conversion — and then isolate it in a dedicated worker service, never the app image. |

**Net deploy risk: LOW _if_ the offline-bake discipline holds; MEDIUM-HIGH if any converter is naively `apt-get`'d into
the app Dockerfile.** This is the single call-out the human owner must ratify before build.

---

## §6 — Governance alignment (recommend; author none; flag conflicts)

- **Contracts touched**: **C12-GEOSPATIAL** (coordinate substrate — the strong part; extend for terrain/LOD2 ingestion —
  L-374 §7.4 already flags the coverage gap); the **proposed C57-PARCEL-DATA-LAYER** + **C58-ZONING-RULES-ENGINE**
  (L-380 §9.3); the **proposed C12-CONTEXT-ENGINE / C-CONTEXT-ENGINE** (L-374 §7.4); **C10** (add the missing
  view-activation perf budget — L-374 §7.4/L-358); **C19-SITE-MODEL-AND-PARCEL** (envelope output fields already exist).
  Confirm C57/C58 numbering against the **C00 index** (`docs/02-decisions/contracts/README.md`).
- **Recommendation**:
  1. **Fold Denmark into the L-380 strategy ADR** (the "parcel-data + per-jurisdiction zoning + buy-vs-build" ADR,
     L-380 §9.2) as the **open-data reference implementation** section — do NOT spawn a competing ADR.
  2. **Extend / author the Context-Engine contract** (C12-CONTEXT-ENGINE per L-374 §7.4) to cover the **GeoJSON-canonical
     ingestion rule**, the **offline-bake → static-tiles** deploy policy, and the DK adapter set as the reference.
  3. **VISION note**: add a one-line "**Denmark = geospatial technical reference implementation**" anchor under
     STR-12 §2.1 (site substrate) — recording that the whole parcel→zoning→LOD2→terrain chain is proven on open data,
     **without** re-opening the Spain-first business priority.
- **Conflicts to flag (human decision — report, don't resolve)**:
  - **C-1**: L-374 §7.5 — "engineering-grade context (real terrain + LOD2)" vs SPEC-FORMA's deliberately-abstract flat
    massing study. The Denmark reference **is** the engineering-context mode; the founder must decide default view /
    one-toggle-vs-two. *(Inherited from L-374 — not re-derived.)*
  - **C-2**: PostGIS is **GPLv2**, the only non-permissive item. DB-usage is exempt (§3.8) but legal sign-off on
    "network DB use ≠ distribution" is a human ratify.
  - **C-3**: whether the serve-in-house PostGIS+Martin tier is **in scope for the reference** or a later optimisation
    (the reference works with pre-baked static tiles + the runtime proxy alone).
  - **C-4**: tyler license **UNVERIFIED** — must be confirmed permissive before it enters the pipeline (fallback:
    py3dtiles/py3dtilers, Apache-2.0).

---

## §7 — Phased plan (extends L-380 + L-374; does NOT duplicate them)

Each phase re-labels/extends existing L-380/L-374 phases. Effort is **incremental** on top of the already-scoped work.

| Phase | Deliverable | Extends | Effort | Deps | Verify-gate |
|---|---|---|---|---|---|
| **DK-0 — Data access + offline-bake harness** (L-383a/e) | Datafordeler service-user + API-key; a **one-shot offline Docker job** running GDAL/citygml-tools/tyler/ctb; canonical **GeoJSON (WGS84)** output contract | new (foundation for L-380 P1 + L-374 all) | **S–M** (3–5 d) | Datafordeler reg. | scripted `ogr2ogr` returns a real Copenhagen `jordstykke` parcel as WGS84 GeoJSON + a Plandata zoning polygon |
| **DK-1 — Parcel + zoning (DK adapters + runtime proxy)** (L-383a) | `DkParcelProvider` + `DkZoningProvider` + `server/parcelZoningProxy.js` (clone `overpassProxy.js:357`) w/ server-side key | **= L-380 P1–P3 + L-380d**, DK adapter instead of Catastro/MUC | **M** (re-uses L-380 machinery) | DK-0 | click a Copenhagen parcel → highlighted WGS84 geometry via `boundaryProjection.ts:143`; envelope from Plandata **structured** fields (Turf inset), no curated ruleset needed |
| **DK-2 — LOD2 semantic buildings (3D-Tiles)** (L-383b) | Offline CityGML→CityJSON→3D-Tiles (citygml-tools→tyler→3d-tiles-tools); host static; add as a 2nd `Cesium3DTileset` | **= L-374 Phase-4 (LOD2-ingestion), DK-first** | **M–L** | DK-0 | Copenhagen LOD2 tileset renders in `CesiumViewport` via `scene.primitives.add` (`:1399/:1440` pattern); per-building metadata present |
| **DK-3 — Real terrain (quantized-mesh)** (L-383c) | Offline DTM GeoTIFF→ctb(quantized-mesh fork)→terrain tiles; attach `CesiumTerrainProvider` | **= L-374 Phase-1 (real terrain), DK-first** | **M** | DK-0 | `terrainProviderHasElevationData:4687` passes → `sampleTerrainMostDetailed:4627` runs → model clamps to true DHM ground (the `:4593-4607` "never attached" comment becomes false) |
| **DK-4 — (optional) PostGIS+Martin serve-in-house** (L-383d) | `CREATE EXTENSION postgis` on existing PG; normalize DK into PostGIS; Martin MVT to MapLibre | new serve tier (L-380d evolution) | **M** | DK-1 | MapLibre renders DK parcels from Martin MVT; no per-request Datafordeler hit |
| **DK-5 — End-to-end reference demo** | parcel-click → zoning envelope → LOD2 buildings + real terrain in one Cesium view | unifies L-380 + L-374 | **S** (integration) | DK-1..3 | one Copenhagen plot: click → envelope → LOD2 context + terrain, all four tiers live |

**Cross-links (do not duplicate)**: DK-1 **reuses** L-380 P1–P3 + L-380d verbatim (DK adapter swap). DK-2/DK-3 are the
**Denmark-first instances** of L-374 Phase-4 / Phase-1. DK-0/DK-5 are the new unifying glue. Effort **on top of** L-380's
5–7 wk pilot + L-374's phased roadmap — NOT a re-estimate of those.

---

## §8 — L-383 rows (ready-to-paste; NOT written to any tracker here)

Format: `| ID | Reported | **[Pn - AREA] bold** | Area/contracts | Status | route -> queue |`

```
| L-383 | founder 2026-07-17 (technical-reference direction: Denmark open-data end-to-end geospatial pipeline) | **[P2 - STRATEGY / GIS] Denmark technical reference implementation — prove the WHOLE geospatial pipeline (parcel → zoning/legislation → real LOD2 semantic 3D buildings → real terrain) end-to-end on genuinely-open Danish national data via a permissively-licensed OSS toolchain (GDAL/proj4js/Turf/citygml-tools/tyler+3d-tiles-tools/cesium-terrain-builder/PostGIS+Martin).** UNIFIES L-380 (parcel-select → buildable-envelope) + L-374 (provider-agnostic Context Engine) on one dataset; GeoJSON(WGS84) is the single canonical interchange. Spain stays the business-priority market — Denmark is the TECHNICAL proving ground, NOT a market change. Denmark = the reference adapter set (DkParcel/DkZoning/DkBuilding/DkTerrain); Spain/CH = footprint-extrusion path (no free LOD2). Biggest risk = native-binary/JVM Fly deploy → mitigate by OFFLINE pre-bake of static 3D-Tiles + quantized-mesh terrain, app image stays pure Node. Full validation: docs/04-reference/jurisdictions/dk/DENMARK-GEOSPATIAL-REFERENCE-ARCHITECTURE.md. | Geospatial / site-feasibility + context. Extends L-380 (C57/C58) + L-374 (C12-CONTEXT-ENGINE); ties C12-GEOSPATIAL, C19, C10 (perf budget). Reuses server/overpassProxy.js (server.js:357), proj4/LTPENURebase (packages/geospatial, proj4 ^2.15.0), buildBoundaryFromLatLonRing (boundaryProjection.ts:143), CesiumViewport tileset seam (:1399/:1440) + terrain seam (:4588/:4687, never attached :4593-4607), pg ^8.20.0. CONFLICTS (human): engineering-context vs Forma-abstract (L-374 §7.5); PostGIS GPLv2 DB-usage sign-off; tyler license unverified; serve-in-house tier scope. | **OPEN — VALIDATED, not started.** owner UNASSIGNED, target TBD. Sub-items L-383a..e. | route -> geospatial / site-feasibility queue. |
| L-383a | L-383 validation (GDAL/GeoJSON ingestion + DK parcel/zoning adapters) | **[P2 - GIS] GDAL/OGR + proj4js GeoJSON(WGS84) ingestion layer + DkParcelProvider (Matriklen jordstykke WFS, EPSG:25832, Datafordeler API-key) + DkZoningProvider (Plandata.dk structured lokalplan fields: bebyggelsesprocent/height/floors/use) behind server/parcelZoningProxy.js (clone overpassProxy.js:357, server-side key, forward-once + LRU cache + non-fatal empty fallback).** GeoJSON WGS84 is canonical; nothing downstream knows the source CRS/format. GDAL runs OFFLINE (not in Fly app image); proj4js reused at the edge (packages/geospatial, no new dep). | Geospatial (extends L-380a/b/d; C57/C58; ties C12, C19). GDAL MIT-style; proj4js MIT (in-tree ^2.15.0); Turf MIT (NEW dep for the envelope inset). dep: L-383e (deploy harness). | **OPEN.** owner UNASSIGNED, target TBD. | route -> geospatial / server queue. |
| L-383b | L-383 validation (DK LOD2 3D-Tiles context pipeline) | **[P2 - GIS] Denmark LOD2 semantic 3D-buildings pipeline — "Danmark i 3D" national CityGML (per-building ID, Datafordeler key) → citygml-tools (Apache-2.0, Java CLI) → CityJSON → tyler (CityJSON→3D-Tiles w/ EXT_mesh_features metadata) → 3d-tiles-tools (Apache-2.0, optimise) → static hosting → added as a 2nd Cesium3DTileset via scene.primitives.add (CesiumViewport.ts:1399/1440) = L-374 "engineering context (semantic, not photoreal) tier".** All converters run OFFLINE. tyler license UNVERIFIED — confirm permissive (fallback py3dtiles Apache-2.0). | Geospatial (Denmark-first instance of L-374 Phase-4 LOD2-ingestion; new LOD2-ingestion contract gap; ties C12-CONTEXT-ENGINE). dep: L-383e. | **OPEN.** owner UNASSIGNED, target TBD. | route -> geospatial queue. |
| L-383c | L-383 validation (DK terrain via cesium-terrain-builder) | **[P2 - GIS] Denmark real terrain — DHM 0.4m DTM/DSM GeoTIFF (EPSG:25832, open, ~5cm) → GDAL + cesium-terrain-builder QUANTIZED-MESH fork (tum-gis ctb-quantized-mesh / ahuarte47, Apache-2.0; original emits legacy heightmap-1.0 only) → static quantized-mesh tiles → standard CesiumTerrainProvider attached at CesiumViewport.ts:4588 seam.** Flips the "terrain NEVER attached" default (:4593-4607) into real ground: terrainProviderHasElevationData:4687 passes → sampleTerrainMostDetailed:4627 runs → model + context clamp to true DHM ground. Optional PDAL/LAZ path deferred. | Geospatial (Denmark-first instance of L-374 Phase-1 real-terrain; extend C12 §1.4; new terrain-ingestion contract gap). dep: L-383e. | **OPEN.** owner UNASSIGNED, target TBD. | route -> geospatial queue. |
| L-383d | L-383 validation (PostGIS/Martin in-house serving) | **[P2 - GIS / SERVER] Serve-in-house tier — PostGIS (GPLv2; DB-usage unrestricted per PostGIS FAQ; CREATE EXTENSION on existing Postgres pg ^8.20.0) as normalized store + Martin (Apache-2.0/MIT, Rust) OR pg_tileserv (Apache-2.0) serving MVT vector tiles to SiteBoundaryMap2D (MapLibre native MVT) + GeoJSON to providers — instead of re-fetching gov WFS per request (rate-limit citizenship + latency).** Runs as a SEPARATE service, not in the Fly app image. OPTIONAL for the reference (pre-baked static tiles + runtime proxy suffice). | Server / GIS (evolves L-380d; ties C12). PostGIS GPLv2 (caveat, DB-usage exempt); Martin/pg_tileserv permissive. dep: L-383a. | **OPEN — optional.** owner UNASSIGNED, target TBD. Human: GPLv2 DB-usage sign-off; in-scope-for-reference? | route -> server / geospatial queue. |
| L-383e | L-383 validation (deploy / native-binary integration) | **[P2 - GIS / DEVOPS] Native-binary/JVM deploy strategy — GDAL/citygml-tools/tyler/cesium-terrain-builder are C++/Java/Rust binaries; keep them OUT of the Fly app image. Run OFFLINE in a one-shot Docker build job (local/CI), pre-bake static 3D-Tiles + quantized-mesh terrain + normalized GeoJSON/PostGIS, host on object storage (precedent: furniture-GLB re-host). Fly app image gains ONLY server/parcelZoningProxy.js (pure Node) + server-side Datafordeler API-key; PostGIS+Martin = separate service.** This is the single biggest integration risk; owner must ratify the offline-bake discipline before build. | DevOps / GIS (ties Fly deploy memory notes: lockfile-sync, object-storage GLB, push-to-deploy). dep: none. | **OPEN — decision needed.** owner UNASSIGNED, target TBD. | route -> devops / geospatial queue. |
```

**Master-execution-tracker row (ready-to-paste):**
```
| **L-383** Denmark geospatial reference implementation (open-data end-to-end: parcel→zoning→LOD2→terrain) (P2, HIGH strategic-technical) | UNASSIGNED | post-Sept | Prove the WHOLE geospatial pipeline on genuinely-open Danish national data via a permissive OSS toolchain (GDAL/proj4js/Turf/citygml-tools/tyler/cesium-terrain-builder/PostGIS+Martin). UNIFIES L-380 (parcel→envelope) + L-374 (Context Engine); GeoJSON(WGS84) canonical; Denmark = reference adapter set, Spain/CH = extrusion path. Native binaries run OFFLINE → static tiles; Fly app image stays pure Node. Spain remains the business market (NOT a change). Validation: docs/04-reference/jurisdictions/dk/DENMARK-GEOSPATIAL-REFERENCE-ARCHITECTURE.md | Geospatial. Extends L-380 (C57/C58) + L-374 (C12-CONTEXT-ENGINE); ties C12/C19/C10. Reuses overpassProxy.js, proj4/LTPENURebase, boundaryProjection.ts:143, CesiumViewport tileset/terrain seams. Sub-items L-383a..e. |
```

---

## §9 — Live sources (verified 2026-07-17)

- **Datafordeler access/key flow** — `https://datafordeler.dk/vejledning/brugeradgang/` ·
  `https://datafordeler.dk/vejledning/brugeradgang/brugeroprettelse/` (web user → IT-system → service-user API-key/OAuth, free).
- **Matriklen / Plandata** — `https://datafordeler.dk` (Matriklen product) ·
  `http://wfs.plansystem.dk/geoserver/wfs?service=WFS&request=GetCapabilities` (Plandata zoning WFS).
- **"Danmark i 3D" LOD2 CityGML** — `https://sdfi.dk/media/6607/sdfe-gevinstanalyse-danmark-i-3d.pdf` ·
  `https://norden.lmi.is/wp-content/uploads/2019/09/Denmark-in-3Daaland.pdf` · `https://github.com/OloOcki/awesome-citygml`.
- **DHM terrain** — `https://dataforsyningen.dk/data/930` ·
  `https://dataforsyningen.dk/asset/PDF/produkt_dokumentation/dhm-prodspec-v1.0.0.pdf` ·
  `https://api.dataforsyningen.dk/dhm_DAF?request=GetCapabilities&service=WMS&token=`.
- **Germany LOD2-DE (generalisation)** — `https://data.europa.eu/data/datasets/31bedca5-1843-4254-a168-1acda618c0b4`.
- **GDAL** MIT-style — `https://github.com/OSGeo/gdal/blob/master/LICENSE.TXT`.
- **proj4js** MIT — in-tree `packages/geospatial/package.json` (`proj4 ^2.15.0`).
- **Turf.js** MIT — `https://github.com/Turfjs/turf`.
- **citygml-tools** Apache-2.0 (Java) — `https://github.com/citygml4j/citygml-tools`.
- **tyler (3DGI)** CityJSON→3D-Tiles — `https://github.com/3DGI/tyler` (license UNVERIFIED — confirm).
- **3d-tiles-tools (CesiumGS)** Apache-2.0 — `https://github.com/CesiumGS/3d-tiles-tools` (glTF↔tiles; NOT CityJSON ingest).
- **py3dtiles / py3dtilers** Apache-2.0 — `https://github.com/Oslandia/py3dtilers`.
- **cesium-terrain-builder** Apache-2.0 — `https://github.com/geo-data/cesium-terrain-builder` (heightmap-1.0 only);
  quantized-mesh fork — `https://github.com/tum-gis/cesium-terrain-builder-docker` (from ahuarte47 fork).
- **Martin** Apache-2.0/MIT — `https://github.com/maplibre/martin`. **pg_tileserv** Apache-2.0 (Crunchy Data).
- **PostGIS** GPLv2, DB-usage unrestricted — `https://postgis.net/documentation/faq/gpl-license/`.

---

*End of validation. No code was modified, no contract was flipped, no tracker was edited in producing this document.*
