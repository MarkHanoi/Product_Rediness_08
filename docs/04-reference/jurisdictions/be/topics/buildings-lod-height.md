# Belgium — Buildings / LOD / Height (context layer)

> Part of the 3D-Context-Data country study. See `../README.md` and
> `../findings/BELGIUM-MASTER-DATA-SOURCE-STUDY.md §A.6`.
> **Verify every endpoint live before relying on it** — entries below are research-confirmed leads,
> not all live-probed.

- **Target LOD:** LOD1 (block model, LiDAR-derived ridge height) — LOD2 not confirmed anywhere in Belgium
- **Primary source (Flanders):** `3D GRB — Gebouw LOD1 DHMV II` (Informatie Vlaanderen/AGIV) — block model with approximate ridge-height reference; free
- **Secondary source — federal footprints:** CADMAP building sublayer ("buildings managed by AGDP") inside the already-verified federal WFS — height attribute not yet probed
- **Integration effort:** HIGH — three separate regional systems (GRB/DHMV, PICC, UrbIS); no shared schema; Brussels LiDAR programme unconfirmed

---

## Source details

| Source | Region | Endpoint | Feature type / field | Licence | LOD | Status |
|---|---|---|---|---|---|---|
| CADMAP building sublayer ("buildings managed by AGDP") | All three (federal) | `ccff02.minfin.fgov.be/geoservices/arcgis/rest/services/INSPIRE/CP/MapServer/…` | Building footprints; height attribute **NOT YET PROBED** | CC-equivalent open, no key | LOD1 footprint (confirmed); height TBD | ✅ Endpoint LIVE; attribute unknown |
| 3D GRB — Gebouw LOD1 DHMV II | Flanders | `geoservices.informatievlaanderen.be` (robots-blocked) or `mercator.vlaanderen.be` | Block-model building footprint + approximate ridge height from DHMV II | Free ("kosteloos") | LOD1 | ⚠ Confirmed via cache; direct fetch robots-disallowed |
| PICC building layer | Wallonia | `geoservices.wallonie.be/geoserver/picc/ows` | Building footprints (field schema unknown) | TBD | LOD1 footprint (suspected); height unknown | ❔ Service existence confirmed via aggregator; not independently probed |
| UrbIS | Brussels | `geoservices-urbis.irisnet.be` | Building footprints (field schema unknown) | TBD | LOD1 footprint (suspected); height unknown | ❔ Service confirmed; not probed |
| DHMV II terrain model | Flanders | Informatie Vlaanderen download | DTM/DSM raster; ~8–16 pts/m² | Free | Terrain raster | `stated` — full coverage confirmed; DHMV I gaps in 13 cities |
| Wallonia LiDAR/terrain | Wallonia | `geoportail.wallonie.be` | DTM/DSM product (coverage/resolution unknown) | TBD | Unknown | ❔ Not probed |
| Brussels LiDAR | Brussels | Not identified | — | — | — | ❌ No standing programme confirmed |

**No LOD2 building model confirmed anywhere in Belgium.** Unlike Germany's LoD2-DE (~58M buildings,
CityGML) or France's BD TOPO bâtiment (~90% coverage), Belgium has no equivalent national or
regional LOD2 product. Flanders' `3D GRB — Gebouw LOD1 DHMV II` is a block model (LOD1), not a
full roof-geometry product.

---

## Spike evidence (fill during Phase 1 — live probe not yet run)

| Question | Answer | Evidence |
|---|---|---|
| (a) Real building footprint? | **YES (research-confirmed)** — CADMAP federal sublayer + regional GRB/PICC/UrbIS all carry building polygons | NOT YET live-probed for any attribute schema |
| (b) Real height attribute? | **UNKNOWN** — CADMAP sublayer may carry height; GRB LOD1 carries ridge height from DHMV; PICC/UrbIS unknown | NOT YET — run CADMAP GetFeature first (lowest-effort, free, national) |
| (c) Real roof shape? | **NO** — LOD2 not confirmed anywhere; GRB LOD1 is a flat-topped block model only | stated |
| CRS of response | Belgian Lambert 72 (EPSG:31370) or WGS84 depending on endpoint | NOT YET — probe and record |
| Licence | CADMAP: CC-equivalent open; GRB: free ("kosteloos"); PICC/UrbIS: TBD | NOT YET for PICC/UrbIS — check live response metadata |
| Coverage gaps → fallback | DHMV I: 13 Flemish centrumsteden lack full coverage; DHMV II covers these. PICC/UrbIS: unknown. | Fallback chain: CADMAP federal (national, free) → GRB LOD1 (Flanders) → PICC (Wallonia) → UrbIS (Brussels) → OSM |

**Priority probe — CADMAP building sublayer height attribute (lowest-effort, highest leverage):**
```bash
# Federal CADMAP WFS — check building sublayer attribute schema
# Try to fetch one building feature from the "buildings managed by AGDP" sublayer
curl "https://ccff02.minfin.fgov.be/geoservices/arcgis/rest/services/INSPIRE/CP/MapServer/\
exts/InspireFeatureDownload/service\
?request=GetFeature&service=WFS&version=2.0.0\
&TypeName=BU:Building\
&Count=3&outputFormat=application/json" \
  | python3 -m json.tool | head -60
# If TypeName not found, check GetCapabilities for correct building layer name:
# Look for any layer with "Build", "BU", or "Gebouw" in the name
```

**Flanders GRB probe (after mercator.vlaanderen.be alternative confirmed):**
```bash
# Check mercator.vlaanderen.be for GRB building WFS
curl "https://www.mercator.vlaanderen.be/raadpleegdienstenmercatorpubliek/wfs\
?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetCapabilities" | grep -i "gebouw\|GRB\|lod\|3D"
```

---

## 5-building spot check (fill during Phase 1 — after live probe)

| Dataset building id | Dataset height (m) | Visual check (satellite/StreetView) | Verdict |
|---|---|---|---|
| (TBD — fill after CADMAP GetFeature probe) | | | |

---

## Implementation notes (fill during Phase 2)

- **Regional router:** route by region polygon; hand off to region-specific building/LiDAR endpoint.
  Unlike Germany (one CityGML schema, 16 addresses) or France (one IGN schema, one address),
  Belgium has three schemas (GRB, PICC, UrbIS) — three separate adapters, not one adapter with
  three config values.
- **DHMV I gap handling:** the 13 Flemish centrumsteden (Dendermonde, Diest, Hasselt, Hoboken,
  Ieper, Kortrijk, Oudenaarde, Ronse, Sint-Truiden, Tienen, Waregem, Riemst, Tongeren) have
  incomplete DHMV I coverage — 3D GRB entities may be absent for buildings in these cities. DHMV II
  is full-coverage; check whether the product version exposed via the WFS is DHMV-II-based.
- **Fallback chain (Flanders):** `3D GRB LOD1 DHMV II` (LOD1 block model + ridge height) →
  CADMAP federal building sublayer (footprint only if no height attribute found) → OSM `building`
  polygons with `height` / `building:levels` tags.
- **Antwerp specifically:** Antwerp is NOT in the confirmed DHMV I gap list — verify this holds for
  DHMV II before assuming full building-height coverage for any Antwerp pack.
- **CRS reprojection:** Belgian data is commonly in EPSG:31370 (Belgian Lambert 72) or EPSG:4326.
  Reproject to EPSG:4326 for PRYZM internal storage; record the source CRS from the probe response.
