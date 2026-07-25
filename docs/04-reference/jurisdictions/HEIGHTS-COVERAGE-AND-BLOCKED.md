# Building-height coverage & blockers — per jurisdiction

**The question this answers, for the founder to hand to an authority:** *"Which countries under our
jurisdiction list CANNOT have 100 % real per-building heights, and exactly why?"*

**Honesty frame (§CONTEXT-DATA-HONESTY / C58 §1.4).** "Real height" here means a **measured** height
(`heightProvenance: 'tagged'` — a surveyed/LiDAR/photogrammetric number). A **floor count × 3.2 m**
(`derived-levels`) is *not* a measurement and is never labelled as one. A **9 m default**
(`assumed`) is a fabrication and renders visibly translucent so it cannot pass as data. This doc
reports the **3D height** axis only — it is a different number from 2D footprint accuracy (which is
85–98 % almost everywhere) and the two are never blended.

**Reachability verdicts below were LIVE-PROBED 2026-07-25** (`node tools/height-engine/probe_lidar_indexes.mjs`
and `node tools/context-bake/heightSources.mjs --probe`). Density / licence figures are characterised
from each programme's public spec (**ESTIMATED**); the HTTP verdict is **VERIFIED**.

---

## Two cross-cutting blockers (read first — they explain most "not yet")

1. **The nDSM LiDAR height engine is a SCAFFOLD, not a running service.** The Python geospatial stack
   (`pdal`, `laspy`, `rasterio`, `open3d`) is **absent in the current build environment** (`python -c
   "import pdal,laspy,rasterio"` → `ModuleNotFoundError`). So any country whose *only* measured-height
   path is LiDAR nDSM (NO, US, PT, SE, ES-measured, and the LoD2 uplift for NL/CH/DE) **cannot be
   processed yet** — the tile registry + pipeline design exist (`tools/height-engine/`) and the honesty
   core is proven on synthetic points, but no point cloud is processed. **Unblock:** provision a
   Python geo-worker image (`pip install pdal laspy rasterio shapely numpy scipy open3d pyproj`). This
   is a build-farm resourcing action, not a per-country licence.
2. **Some live sources return real heights but not yet joinable geometry.** BD TOPO (FR) returns full
   footprint geometry and is fully wired. 3DBAG (NL), Catastro (ES) and LoD2-DE/NRW (DE) return
   **real, live-confirmed heights** but their **footprint parse is the documented next ingest step**
   (3DBAG RD→WGS84 from CityJSON LoD0; Catastro GML `posList`; NRW CityGML `posList` from a 76 MB
   tile). Until that parse is built, those regions keep their OSM/Overture footprints (honest fallback)
   rather than the national ones. **Unblock:** engineering (no external gate) — build the per-source
   footprint extractor.

---

## Master table — 14 jurisdiction countries

`Keyless` = reachable with no credential. `Live 2026-07-25` = the probed HTTP verdict.
`100 % real measured?` = can this country, in principle, reach full **measured**-height coverage.

| CC | Source (measured-height path) | Licence | Keyless | Live 2026-07-25 | 100 % real measured? | The specific blocker | ONE human action to unblock |
|----|-------------------------------|---------|---------|------------------|----------------------|----------------------|------------------------------|
| **FR** | IGN **BD TOPO** `hauteur` (WFS, EPSG:4326) | Etalab 2.0 (open) | ✅ | `200` — heights 21.7/8.3 m | **YES — already wired** (4,635 Paris bldgs produced) | none | none — ship it |
| **NL** | **3DBAG** roof−ground (BAG×AHN, OGC API) | CC-BY-4.0 | ✅ | `200` — 14.99/13.10 m + roof types | **YES (path proven)** | footprint RD→WGS84 parse (CityJSON LoD0) not built → currently `documented` | build the 3DBAG footprint extractor (proj4 RD→WGS84) — engineering, no gate |
| **ES** | **Catastro** floors → `derived-levels`; measured needs PNOA/ICGC nDSM | CC-BY 4.0 (CNIG) | ✅ | `200` — 334 floor counts, GML EPSG:4326 | **NO via Catastro** (floor count ≠ measurement); YES via nDSM | Catastro gives floors, not height; measured height needs LiDAR nDSM (engine scaffold-only). ~45 % measured gap (LOD-RATE) | resource the nDSM engine (cross-cutting #1) + build the Catastro `posList` footprint parse |
| **DE** | **LoD2-DE** `measuredHeight` (per-Land CityGML) | per-Land (NRW open) | NRW ✅ | NRW `200` — 3.99/4.87 m + roofType | **partial** — open Länder yes; Bavaria/Hamburg no | per-Land licence routing: **NRW/Berlin/BW open; Bavaria (Munich) BLOCKED — ZSHH INSPIRE-restricted, licence TBD**. Also NRW footprint `posList` parse not built | for Bavaria: resolve the ZSHH licence (**authority: Bayer. Vermessungsverwaltung / LDBV**); for NRW/Berlin: build CityGML parse + wire the FIS-Broker (Berlin) endpoint |
| **CH** | **swissBUILDINGS3D** (CityGML) + **swissSURFACE3D** LiDAR | swisstopo open (BGDI) | ✅ | swissSURFACE3D STAC `200` (v0.9+v1) | **YES (path proven)** | bulk CityGML (not a bbox API) → offline extract + GWR join by EGID not built; no live fetcher yet | build the swissBUILDINGS3D CityGML extractor + GWR `GASTW` join — engineering, no gate |
| **NO** | **NDH nDSM** (hoydedata.no); FKB survey height is commercial | CC-BY-4.0 (NDH) / commercial (FKB) | NDH ✅ | ArcGIS REST `200` | **YES via NDH nDSM** | free path is LiDAR nDSM (engine scaffold-only). FKB-Bygning surveyed height is **commercial-licensed** | resource the nDSM engine (cross-cutting #1); OR licence FKB-Bygning (**authority: Kartverket**) for direct heights |
| **US** | **Overture** height (partial) + **3DEP** LPC nDSM | US Public Domain | ✅ | 3DEP TNM API `200` — **162 LPC products live** | **partial now, YES with nDSM** | Overture height is partial (~20 M, growing); 3DEP is point-cloud → nDSM engine scaffold-only | resource the nDSM engine (cross-cutting #1) to process 3DEP; Overture partial heights already usable |
| **DK** | **GeoDanmark** bygning + **DHM** LiDAR + **BBR** | Free (registration) | ❌ **gated** | Datafordeler `403`/`404` keyless | **YES once credentialled** | **AUTH-GATED: Datafordeler Basic Auth was RETIRED** (git 1fc5bc8b); the 2026 host needs service credentials. No keyless bbox path (probed) | obtain a **Datafordeler service user** (`DATAFORDELER_USER`/`DATAFORDELER_PASS`) or a **Dataforsyningen token** (`DATAFORSYNING_TOKEN`) — **authority: SDFI (Styrelsen for Dataforsyning og Infrastruktur)** |
| **PT** | **DGT national LiDAR** nDSM (2024–25, ~10 ppm²) | open (DGT) | ✅ (portal) | (CNIG-class portal) | **YES via nDSM** (height only) | nDSM engine scaffold-only; **no national FOOTPRINT layer** (use Overture/OSM); weak parcels | resource the nDSM engine (cross-cutting #1) |
| **SE** | **Lantmäteriet** CC0 footprints + national **LiDAR nDSM** | CC0 + free (account) | ⚠ account | (account-gated download) | **YES via nDSM** | nDSM engine scaffold-only; LoD2 volumes are **per-municipality PAID**; download needs an account+scope | Lantmäteriet account + resource the nDSM engine |
| **IT** | ARPA **Piemonte** Edifici 3D (Turin/Piedmont ONLY) | open (regional) | ✅ (Piedmont) | (regional WFS) | **NO nationally** | **structural gap — Italy has NO national building-height product** (PST/SIM LiDAR is terrain only). Rome/Milan = no source → OSM 9 m | none possible nationally; only per-region (Piedmont) or await a national programme. **Rome/Milan cannot reach 100 % real height** |
| **BE** | **3D GRB** DHMV (Flanders ONLY) | open (Flanders) | ✅ (Flanders) | (Flanders WFS) | **NO nationally** | height structured **only in Flanders**; **Brussels (UrbIS) + Wallonia (PICC) height UNKNOWN/unprobed** — three separate schemas | probe UrbIS + PICC height attributes (**authorities: CIRB/UrbIS Brussels · SPW Wallonia**) |
| **GB** | **OS Building Heights** (Verisk/OS) | **licensed (commercial)** | ❌ | not probed (licensed) | **NO on open data** | **OS Building Heights is a licensed product**; GB is not in LOD-RATE-MASTER. Only OSM-tag coverage is free | licence OS Building Heights (**authority: Ordnance Survey**) OR accept OSM-tag-only coverage |
| **FI** | Helsinki / NLS open **LoD2** | open | ✅ (candidate) | not yet wired | **YES (candidate)** | not yet wired; Helsinki has open LoD2, no fetcher built | wire the Helsinki/NLS open LoD2 source (**authority: NLS Finland / Helsinki 3D+**) — engineering, no gate |
| **SA** | Balady national line (geo-fenced) | licensed + **geo-fenced** | ❌ | Balady `403` from outside SA | **NO from outside SA** | **geo-fence: the national NOOFFLOORS product returns 403 outside Saudi**; reachable = ML footprints + coarse 30 m DEM only, no per-building height | a **GEOSA/Balady data agreement** or in-country access (**authority: Saudi GEOSA**) |

---

## The short answer (which countries CANNOT reach 100 % real heights, and why)

- **Cannot, structurally (no national data exists):** **IT** (Rome/Milan — no national height product;
  only Piedmont), **BE** (Brussels/Wallonia — height only structured in Flanders).
- **Cannot, without a licence/agreement:** **GB** (OS Building Heights is commercial), **SA** (Balady
  is geo-fenced — needs a GEOSA agreement), **NO-FKB** (surveyed height is commercial; the *free* NDH
  nDSM path IS open).
- **Cannot, until a credential is supplied:** **DK** (Datafordeler service credential — the Basic-Auth
  retirement is the exact blocker).
- **Can, but blocked on OUR engineering, not on any authority:** **NL, CH, DE-NRW** (footprint parse),
  **FI** (wire Helsinki), and every LiDAR country (**NO, US, PT, SE, ES-measured**) once the **nDSM
  engine** is resourced (Python geo stack).
- **Already real today:** **FR** (BD TOPO — wired, 4,635 Paris buildings at real heights).
- **Real *floor-count* today (honest `derived-levels`, not measured):** **ES** (Catastro).

---

## Copy-pasteable verification prompt (hand to a data authority)

```
We are assessing open building-HEIGHT data for a 3D urban-planning product, per country. For the
jurisdiction below, please CONFIRM or CORRECT each field. We define "measured height" as a surveyed,
LiDAR, or photogrammetric per-building height (not a floor count, not an assumed default).

Country: <ES | FR | NL | NO | CH | DE | DK | US | IT | BE | PT | SE | GB | FI | SA>
1. National measured-building-height product name + responsible agency:
2. Licence (SPDX or name) and whether COMMERCIAL use is permitted:
3. Access: keyless public API / token or account required / geo-fenced / bulk download only?
   - If a credential is required, name the exact credential and where to request it.
4. Coverage: % of the national building stock with a MEASURED height (not floor count):
5. Native LoD: LoD1 (height only) or LoD2 (roof geometry)? Format (CityGML / GeoJSON / CityJSON)?
6. National open LiDAR programme (name, ~points/m², classified y/n, licence) for nDSM fallback:
7. The single biggest blocker to us using this at national scale, in your view:

Our current live-probe findings (2026-07-25) for this country are: <paste the country's row above>.
Please flag anything stale or wrong — endpoints, licences, and the specific blocker especially.
```

---

*Created 2026-07-25. Reachability LIVE-PROBED (see `tools/height-engine/probe_lidar_indexes.mjs` +
`tools/context-bake/heightSources.mjs --probe`). Density/licence ESTIMATED from programme specs — the
prompt above exists to get them authority-verified. Cross-refs: `CONTEXT-LOD-BUILD-PLAN.md`,
`CONTEXT-SCENE-COMPILER-AND-TERRAIN-NORTH-STAR.md` §6.4/§6.7, `LOD-RATE-MASTER.md`,
`tools/context-bake/heightSources.mjs`, `tools/height-engine/`. Maintainer: UNASSIGNED.*
