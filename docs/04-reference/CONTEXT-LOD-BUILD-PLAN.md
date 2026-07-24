# CONTEXT-LOD BUILD PLAN — turning LOD-RATE-MASTER into real heights in the 3D context

**What this is.** The BUILD that follows the measurement in
`docs/04-reference/jurisdictions/LOD-RATE-MASTER.md`. That doc catalogued, per country, a real
per-building HEIGHT source. This plan wires each source into the context bake so the 3D Site renders
**real building heights (LoD1)** instead of the fabricated 9 m default (`heightProvenance:'assumed'`
in `apps/editor/src/ui/geospatial/contextBuildings.ts`).

**The render reality (why "LoD1 real height" is the buildable target NOW).** The client context path
(`contextBuildings.ts` → `contextTiles.ts` → Cesium) extrudes `footprint × height` into a flat prism
— that is **LoD1**. So the maximum LOD we can ship *today, with no render-path change* is a real
per-building `height` attribute (+ `num_floors` / `roof_type` where the source carries them) baked
into `buildings.pmtiles`, replacing the `assumed` default. **True LoD2** (real roof geometry:
hips/gables/setbacks) needs a MESH render path the client does not have — scoped in §LoD2-NEXT below,
**not built here**.

**The moat framing (keep it front of mind).** The building layer is a **commodity** — Overture,
Microsoft, OSM all give footprints, and heights are increasingly free. PRYZM's value is not the
footprints; it is **existing reality (this plan) × the legal envelope (the `RATE.md` rules rate) =
development opportunity**. This build makes the "existing reality" half faithful; it is worthless
conflated with the rules half (§CONTEXT-DATA-HONESTY / C58 — never merge the two rates).

**Module:** `tools/context-bake/heightSources.mjs` (standalone; `bake.mjs` core is owned by the
Overture-density agent and is NOT edited here — see §Integration for the one line).

---

## 0. The global data strategy this plan implements

A **minimal 2-source footprint stack**, not a multi-source monster:

| Tier | Source | Role |
|---|---|---|
| **Footprint PRIMARY** | **Overture Maps buildings** | one global schema unifying OSM + Microsoft + Google + Esri; carries a `height` attribute where available. The default everywhere. |
| **Footprint FALLBACK** | **Microsoft Global Building Footprints** | triggered **per-tile by a density ratio** (e.g. Riyadh: Overture ~8k vs MS ~50k footprints → use MS). **MERGE, don't replace** — keep Overture's attribution / names / categories, fill the gaps with MS polygons. |
| **Footprint PREMIUM** | country adapters, **only where ROI justifies** | NL 3DBAG · FR IGN BD TOPO · CH swissBUILDINGS3D · DK GeoDanmark · NO Kartverket · ES Catastro · DE LoD2-DE. These beat Overture/MS on 2D accuracy AND carry a real height. |

**Height is a confidence hierarchy**, not a single source — every height carries a confidence + an
honest `heightProvenance`:

| Conf tier | Source | Typical confidence | `heightProvenance` |
|---|---|---|---|
| **1** | existing measured height attribute (3DBAG roof, BD TOPO `hauteur`, LoD2-DE `measuredHeight`) | ~90%+ | `tagged` |
| **2** | LiDAR-derived nDSM (DSM−DTM under the footprint: 3DEP, PNOA/ICGC, NDH, DGT) | ~75–90% | `tagged` |
| **3** | satellite / ML estimate (Overture/MS height model) | ~60–80% | `tagged` (low confidence) |
| **4** | building-TYPE assumption (floor-count × storey height; apartments vs villa default) | ~40% | `derived-levels` |
| floor | nothing usable → honest **9 m default** | — | `assumed` |

**⚠ 2D footprint accuracy and 3D height accuracy are DIFFERENT numbers and must never be blended.**
2D is 85–98% almost everywhere (footprints are a solved, commodity problem). 3D is the hard 40–80%
(measured height is the scarce input). The binding LOD-200 sub-metric stays **real-height coverage**
(the 3D number). Every country doc now reports the two separately.

**Building-TYPE accuracy varies** and it is a real FAR risk, not a cosmetic one:
- **Dense apartment blocks ★★★★★** — one footprint = one building, clean party walls (BCN Eixample, Paris, NL).
- **Villas / detached / low-density ★★–★★★** — courtyards, attached garages and roof complexity make
  ML/Overture merge or split polygons. **"One polygon = 3 villas"** over-states GFA and corrupts any
  density/FAR read. Worst in Saudi/UAE/Portugal suburban fabric. Flag `footprint_type_confidence`.

---

## 1. Per-city build table (ordered by LOD-RATE ranking — cheap high-coverage wins first)

`impl` legend: **live** = a working fetcher in `heightSources.mjs`, LIVE-PROBED 2026-07-24 ·
**documented** = endpoint characterised, fetcher is the next build step · **blocked** = auth /
geo-fence / licence gate (a real barrier, recorded, not skipped).

| # | City / region | Country source (premium) | Endpoint | Format | Ingestion path | Target LOD NOW | impl | Effort |
|---|---|---|---|---|---|---|---|---|
| 1 | amsterdam (NL) | **3DBAG** (BAG × AHN LiDAR) | `api.3dbag.nl/collections/pand/items` | CityJSON, RD (EPSG:28992) bbox | fetch → height = `b3_h_dak_50p − b3_h_maaiveld`; footprint RD→WGS84 | **LoD1 real height** (roof geom ready for LoD2) | **live** | LOW |
| 2 | zurich/geneva/bern (CH) | **swissBUILDINGS3D 2.0/3.0** + GWR | swisstopo CityGML bulk + `madd.bfs.admin.ch/eCH-0206` | CityGML 2.0 + XML | offline CityGML extract, join GWR `GASTW` by EGID | **LoD1 real height** (native roofs → LoD2) | documented | MED |
| 3 | copenhagen (DK) | **Danmark i 3D / GeoDanmark** + BBR | Datafordeler + DHM LiDAR | GML / LiDAR | account/token; join BBR floors+year+use | **LoD1 real height** | documented | MED |
| 4 | berlin (DE) | **LoD2-DE** (Berlin open) | `opengeodata.nrw.de/…/lod2_gml/` pattern; Berlin FIS-Broker | CityGML | per-Land router → tile → `measuredHeight` + roof planes | **LoD1 real height** (real roofs → LoD2) | documented | MED |
| — | munich (DE) | LoD2-DE (Bavaria) | ZSHH | CityGML | **BLOCKED — Bavaria licence TBD (ZSHH INSPIRE-restricted)** | falls to Overture | blocked | licence |
| 5 | paris/lyon (FR) | **IGN BD TOPO® batiment** | `data.geopf.fr/wfs/ows` | GeoJSON EPSG:4326 (lon,lat bbox) | fetch → `hauteur` + `nombre_d_etages`; geometry direct | **LoD1 real height** | **live** | LOW |
| 6 | oslo (NO) | Matrikkelen point + **NDH nDSM** (free path) | Geonorge WFS + `hoydedata.no` | WFS + LiDAR | nDSM = DSM−DTM per footprint (FKB top-height is licensed) | **LoD1 real height (coarse)** | documented | MED |
| 7 | stockholm (SE) | Lantmäteriet CC0 + national **LiDAR nDSM** | Lantmäteriet | INSPIRE BU + LiDAR | nDSM per building (LoD2 is fee-based municipal) | **LoD1 real height** | documented | MED |
| 8 | newyork/sanfrancisco (US) | **Overture height** + USGS **3DEP nDSM** | Overture S3 + `tnmaccess.nationalmap.gov` | GeoParquet + LiDAR | Overture height (tier 1/3) + 3DEP nDSM top-up (tier 2) | **LoD1 real height (partial)** | documented | MED |
| 9 | spain (national) + BCN/Madrid/Córdoba | **Catastro INSPIRE** | `ovc.catastro.meh.es/INSPIRE/wfsBU.aspx` | GML EPSG:4326 | `bu:BuildingPart` `numberOfFloorsAboveGround` → **derived-levels** (floor count × 3.2 m) | **LoD1 floor-count** (real measured needs nDSM) | **live** | LOW |
| 10 | brussels (BE) | Flanders 3D GRB (north only) | CADMAP + GRB DHMV II | WFS | GRB ridge height (Flanders); Brussels UrbIS height unprobed | LoD1 (Flanders) / **BLOCKED** (Brussels) | blocked | probe |
| 11 | lisbon/porto (PT) | **DGT national LiDAR nDSM** | DGT CDD | LiDAR | Overture/OSM footprints (no national layer) + nDSM height | **LoD1 real height** | documented | MED |
| 12 | rome/milan (IT) | ARPA Piemonte (Turin only) | `opendata.arpa.piemonte.it` | WFS | **NO source for Rome/Milan** → Overture 9 m; Turin has a layer | no-source (Rome/Milan) | documented | — |
| 13 | riyadh/jeddah (SA) | — (national line geo-fenced) | Balady (403 from outside SA) | — | **BLOCKED** — Overture PRIMARY → **MS FALLBACK** (density trigger); no real height, keep 9 m | LOD100 (honest floor) | blocked | licence+geo |

**Where no premium/national source resolves** (Rome, Milan, London, Helsinki, Riyadh, Jeddah, and any
unlisted city): the region keeps the **Overture → MS-fallback footprints at the honest 9 m `assumed`
default**. Real heights only — a fabricated height is never presented as real (§CONTEXT-DATA-HONESTY).

---

## 2. LIVE-PROBE evidence (2026-07-24) — the top 3, asserted on Content-Type + real values

Run: `node tools/context-bake/heightSources.mjs --probe`. Verbatim (asserting Content-Type **and** a
real height/floor value returned):

| Source | Endpoint | Content-Type | Real values returned | Verdict |
|---|---|---|---|---|
| **FR BD TOPO** | `data.geopf.fr/wfs/ows` (Paris 8e, lon,lat bbox) | `application/json;charset=UTF-8` | `hauteur` = **21.7**, **8.3** m; MultiPolygon EPSG:4326 | **VERIFIED — measured height, fully wireable (no reprojection)** |
| **NL 3DBAG** | `api.3dbag.nl/collections/pand/items` (Amsterdam, **RD/EPSG:28992** bbox) | `application/json` | heights **14.998 / 13.102 / 14.427** m (`b3_h_dak_50p − b3_h_maaiveld`); `b3_dak_type` = **slanted**; `b3_bouwlagen` storeys present | **VERIFIED — measured roof height + roof type (LoD2 attrs)** |
| **ES Catastro** | `ovc.catastro.meh.es/INSPIRE/wfsBU.aspx` (Madrid centro) | `application/x-unknown` (**GML/XML body**) | `bu:BuildingPart` × **334**, **334 populated** `numberOfFloorsAboveGround` (1,6,0,0,2,2,7,1…); geometry in EPSG:4326 | **VERIFIED — footprint + floor COUNT (→ derived-levels, NOT measured)** |

**Two live findings that corrected the desk assumptions (honesty):**
- 3DBAG's `items` bbox is interpreted in **RD (EPSG:28992)**, not lon/lat — a WGS84 bbox returns 0
  features. The module now converts WGS84→RD (Schreutelkamp closed form) before querying.
- Catastro's floor count is on **`bu:BuildingPart`**, not `bu:Building` (Building's field is nil in
  central Madrid). And it is a **floor COUNT** — stamped `derived-levels`, never `tagged`. Spain's
  ~45% real-MEASURED-height gap (LOD-RATE-MASTER) is confirmed, not papered over.

---

## 3. Integration into `bake.mjs` — the ONE line (orchestrator reconciles; core NOT edited here)

`heightSources.mjs` exposes `resolveHeights(region, { bbox })` returning a discriminated result
(`ok` / `no-source` / `blocked` / `documented` / `error`). In `bake.mjs`'s **buildings-layer
per-region loop** (where it assembles `geos`), after the OSM export for region `r`:

```js
import { resolveHeights } from './heightSources.mjs';           // top of file
// …inside the buildings layer loop, per okRegion r:
const nat = await resolveHeights(r.name, { bbox: r.bbox.split(',').map(Number) });
if (nat.status === 'ok') geos.push(nat.geojsonseq);             // ← THE ONE LINE: real heights join
else console.log(`  · ${r.name} heights: ${nat.status} — ${nat.reason ?? ''}`);
```

The national GeoJSONSeq carries `height` + `heightProvenance:'tagged'` (or `derived-levels`) per
building; the client's `resolveHeightWithProvenance` reads the `height` tag exactly as it reads an OSM
`height`, so **no client change is needed** — the same LoD1 extrude, now at real height.

**⚠ REPLACE-vs-APPEND (dedup policy — the one non-trivial decision).** A national source and the OSM
footprints describe the *same* buildings; appending both draws each building twice (once at 9 m,
once at real height → z-fighting/double massing). Policy per source coverage:

| Source coverage | Policy | Rationale |
|---|---|---|
| **Full national** (3DBAG, BD TOPO, LoD2-DE, Catastro) | **REPLACE** the region's OSM *buildings* clip with the national GeoJSONSeq (roads/water/parks stay OSM) | national footprint + height is strictly better; no duplicates |
| **Partial** (BD TOPO `hauteur` nulls, 3DEP tile gaps) | **APPEND**, then the client near-cap + a footprint-overlap dedup thins twins | keep OSM where the national source is silent |
| **none / blocked** | keep OSM (Overture→MS) at 9 m `assumed` | honest floor |

For the whole-Spain national bake this means: Catastro national buildings REPLACE the Spanish OSM
buildings clip (Barcelona/Madrid/Córdoba/anywhere), carrying `derived-levels` heights — a real
improvement over the 9 m carpet, honestly labelled as floor-count-derived.

---

## 4. §LoD2-NEXT — the mesh render-tier upgrade (scoped, NOT built)

Everything above is **LoD1** (flat prism at real height) because that is what the current extruder
does. The countries whose sources carry **real roof geometry** — NL 3DBAG 2.2, CH swissBUILDINGS3D,
DE LoD2-DE, DK GeoDanmark — can render **true LoD2** (hips, gables, setbacks, overhangs) once the
render path can carry a MESH instead of a footprint+height pair. The data is already reachable (3DBAG
probe returned `b3_dak_type` + roof-percentile heights live); the gap is purely the render path.

**What the render-path change needs (scoped, for the render-owning agent — this plan does NOT touch
`CesiumViewport.ts`):**

1. **Bake a mesh tileset, not vector tiles, for LoD2 regions.** Convert 3DBAG CityJSON 2.2 /
   swissBUILDINGS3D CityGML / LoD2-DE → **glTF batched into 3D Tiles** (or Cesium `.b3dm`), keyed by
   the same z/x/y grid. New bake target alongside `buildings.pmtiles` — call it
   `buildings-lod2.3dtiles` per region.
2. **Client: a mesh context layer.** Cesium consumes 3D Tiles natively (`Cesium3DTileset`), so the
   change is additive: when a region has a LoD2 tileset, load it INSTEAD of extruding the PMTiles
   footprints; keep the PMTiles LoD1 path as the fallback for LoD1-only regions. Near/far ring +
   shadow budget (L-454/L-579) apply unchanged — a 3D-Tiles LOD selector replaces the manual cap.
3. **Provenance rides in the tileset** (`heightProvenance:'tagged'` + `roofSource`) so the honesty
   panel stays truthful across both tiers.

**Effort: HIGH** (new bake target + a client mesh path + per-tile LOD selection). **Sequence it AFTER
LoD1 real-height is shipped for all live/documented sources** — LoD1 removes the 9 m carpet (the
founder's actual complaint) for every country; LoD2 is the roof-fidelity polish on the four native-LoD2
countries only.

---

## 5. Honesty gates (binding on this whole build)

- **Real heights only.** Every ingested height flagged `heightProvenance:'tagged'` (measured) or
  `derived-levels` (floor count). No fabricated height is ever presented as real.
- **No national source resolves → Overture (other agent) → MS fallback → honest 9 m `assumed`.** A gap
  is `no-source`/`blocked` with a reason, never a silent skip or an invented number.
- **Every probe is a live-verified number** (§2). Desk figures in the country docs are flagged
  **ESTIMATED**; only what was live-probed this pass is **VERIFIED**.
- **2D footprint accuracy ≠ 3D height accuracy** — reported separately everywhere; the binding metric
  is the 3D real-height number.
- **Never conflate with the buildable-rule `RATE.md`** (§CONTEXT-DATA-HONESTY / C58). This is
  "existing reality"; that is "legal envelope". The product is the two multiplied, never added.

---

*Created 2026-07-24. Top-3 sources (3DBAG, BD TOPO, Catastro) LIVE-PROBED this pass; the rest
documented from LOD-RATE-MASTER. Module: `tools/context-bake/heightSources.mjs`. Integration: one line
into `bake.mjs` (§3). LoD2-mesh is the next tier (§4), scoped not built. Maintainer: UNASSIGNED.*
