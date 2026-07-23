# Germany — Buildings / LOD / Height (context layer)

> Part of the 3D-Context-Data country study. See `../README.md` and
> `../findings/GERMANY-MASTER-DATA-SOURCE-STUDY.md §A.5`.
> **Verify every endpoint live before relying on it** — all entries below are research-confirmed
> leads, not live-probed.

- **Target LOD:** LOD2 (CityGML LoD2 — ~58M buildings nationwide via LoD2-DE; LiDAR-derived, ~1 m height accuracy)
- **Primary source:** LoD2-DE via per-Land portals (ALKIS footprint + LiDAR-derived height + CityGML roof geometry)
- **Secondary source (footprint + height attribute only):** ALKIS per-Land WFS — simpler to access where LoD2-DE tiles are not openly published
- **Integration effort:** MED-HIGH — per-Land routing (16 Länder; no single national feed); licence varies

---

## Source details

| Source | Endpoint (per Land) | Feature type / field | Licence | LOD |
|---|---|---|---|---|
| LoD2-DE — Berlin | FIS-Broker Berlin (`fbinter.stadt-berlin.de`) — LOD2 layer | CityGML LoD2 polygons + height | Open (GDI-BE) | LOD2 |
| LoD2-DE — Sachsen-Anhalt | Open tile download (`geodaten.sachsen-anhalt.de`) | CityGML LoD2 | Open | LOD2 |
| LoD2-DE — Baden-Württemberg | Open tile download (`lgl-bw.de`) | CityGML LoD2 | Open | LOD2 |
| LoD2-DE — Bavaria | Bayerische Vermessungsverwaltung (`geodaten.bayern.de`) — licence TBD | CityGML LoD2 | **TBD — ZSHH hosting ≠ confirmed open** | LOD2 |
| LoD2-DE — Hamburg | Hamburg LGV / Transparenzportal — licence TBD | CityGML LoD2 | **TBD — not confirmed separately from ZSHH national feed** | LOD2 |
| ALKIS (footprint + height attribute) | Per-Land WFS — ALKIS object `Gebäude` | `WKT_GEOM` footprint + `traufhoehe`/`firsthoehe` attributes | Per-Land | LOD1 |
| ZSHH national LoD2 gateway | ZSHH (hosted at Bavarian state survey office) | CityGML LoD2 | INSPIRE Art. 13(1)(e) — **RESTRICTED** | LOD2 |

---

## Spike evidence (fill during Phase 1 — live probe not yet run)

| Question | Answer | Evidence (endpoint response / sample) |
|---|---|---|
| (a) Real footprint? | **YES (research-confirmed)** — ALKIS `Gebäude` + LoD2-DE both carry footprint polygons | NOT YET live-probed — run Berlin FIS-Broker probe first (open licence) |
| (b) Real height? | **YES (research-confirmed)** — LoD2-DE carries LiDAR-derived height (~1 m accuracy); ALKIS carries `traufhoehe` (eaves height) / `firsthoehe` (ridge height) | NOT YET live-probed |
| (c) Real roof shape? | **YES (research-confirmed)** — LoD2-DE is CityGML LoD2; roof geometry is part of the CityGML solid | NOT YET live-probed |
| CRS of response | Likely EPSG:25832 (UTM Zone 32N, standard for NRW/Hamburg/Berlin) or EPSG:25833 (UTM Zone 33N for Berlin/East Germany) | NOT YET — probe and record |
| Licence text (verbatim) | Varies per Land — Berlin: open (GDI-DE Open Data Licence); Bavaria: TBD | NOT YET — check live response metadata or licence page |
| Coverage gaps → fallback | ZSHH claims ~58M buildings nationwide; individual Land tiles may lag. Use ALKIS `Gebäude` as LOD1 fallback where LoD2 tile is absent. | TBD — map per-Land tile completeness |
| Height datum | LoD2-DE heights are above NHN (Normalhöhennull — Germany's standard height datum, equivalent to DHHN2016); ALKIS `traufhoehe` is above terrain | NOT YET — verify in probe response |

**Probe command (Berlin — open licence, start here):**
```bash
# Berlin FIS-Broker — LoD2 building data
# Check available feature types first
curl "https://fbinter.stadt-berlin.de/fb/wfs/geometry/senstadt/re_3dgebaeude\
?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetCapabilities" | grep -i FeatureType

# Then fetch a sample around Alexanderplatz
curl "https://fbinter.stadt-berlin.de/fb/wfs/geometry/senstadt/re_3dgebaeude\
?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature\
&TYPENAMES=re_3dgebaeude\
&BBOX=13.4100,52.5180,13.4200,52.5230,EPSG:4326\
&SRSNAME=EPSG:4326&COUNT=5&OUTPUTFORMAT=application/json" \
  | python3 -m json.tool | grep -E '"hoeheAbsolut|hoehe|height|dach|roof"' | head -20
```

**Hamburg probe (after licence confirmed):**
```bash
# Hamburg Transparenzportal — check for LoD2 or building data
curl "https://geodienste.hamburg.de/HH_WFS_Gebaeude\
?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetCapabilities" | grep -i FeatureType
```

---

## 5-building spot check (fill during Phase 1 — after live probe)

| ALKIS / LoD2 building id | Dataset height (m) | Visual check (satellite/StreetView) | Verdict |
|---|---|---|---|
| (TBD — fill after Berlin probe) | | | |

---

## Implementation notes (fill during Phase 2)

- **Per-Land router:** route by Land polygon (NUTS3 / AGS prefix); hand off to Land-specific
  LoD2 tile URL or WFS endpoint. Analogous to a DNS resolver — one data model, 16 addresses.
- **CRS reprojection:** German LoD2-DE data is typically in UTM (EPSG:25832 or 25833). Must
  reproject to WGS84 (EPSG:4326) for PRYZM internal storage. Probe response CRS first.
- **Height datum:** LoD2-DE heights above NHN must be distinguished from ALKIS eaves heights
  above terrain in the adapter documentation. Use the appropriate one for the context-building
  display (eaves height above terrain is more useful for visual context; absolute NHN heights
  are needed for LTP-ENU terrain composition).
- **CityGML parsing:** LoD2-DE ships as CityGML; a GML/CityGML parser (or gdal `ogr2ogr` with
  CityGML driver) is needed to extract the roof surface polygons. The `osgeo/gdal` image supports
  this out of the box.
- **Fallback chain:** LoD2 tile (CityGML) → ALKIS `Gebäude` WFS (LOD1) → OSM building polygons
  with `height` tag (OSM `building:levels` × 3.0 m as last resort).
