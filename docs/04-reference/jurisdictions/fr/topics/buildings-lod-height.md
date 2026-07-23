# France — Buildings / LOD / Height (context layer)

> Part of the 3D-Context-Data country study. See `../README.md` and `../findings/FRANCE-MASTER-DATA-SOURCE-STUDY.md §A.6`.
> **Verify every endpoint live before relying on it** — all entries below are research-confirmed leads, not live-probed.

- **Target LOD:** LOD1 now (real footprint + real height attribute); LOD2 after LiDAR HD → reconstruction pipeline
- **Primary source:** IGN **BD TOPO®** — feature type `BATIMENT`, field `HAUTEUR`
- **Point cloud source:** IGN **LiDAR HD** — 10 pts/m², Etalab 2.0 licence
- **Integration effort:** LOW-MED (no licence gate, no purchase — endpoint probe + adapter only)

---

## Source details

| Source | Endpoint | Feature type / field | Licence | Update cadence |
|---|---|---|---|---|
| IGN BD TOPO® (buildings + height) | `data.geopf.fr/wfs` | `BDTOPO_V3:batiment` · field `HAUTEUR` (metres, photogrammetry/LiDAR-derived) | Etalab 2.0 (open, commercial OK) | Continuously updated |
| IGN LiDAR HD (point cloud) | `lidarhd.ign.fr` (tile download) | 11-class classified: ground, low/med/high vegetation, buildings, water, etc. | Etalab 2.0 (commercial OK, attribution only) | ~80% metro France end-2025; full national end-2026 |
| IGN LiDAR HD (DTM/DSM derived) | `lidarhd.ign.fr` | 50 cm and 5 m GeoTIFF tiles | Etalab 2.0 | Co-published with point cloud |
| IGN LiDAR HD coverage map | `macarte.ign.fr/carte/mThSup/diffusionMNxLiDARHD` | Visual tile-coverage check | — | Live map |

---

## Spike evidence (fill during Phase 1 — live probe not yet run)

| Question | Answer | Evidence (endpoint response / sample) |
|---|---|---|
| (a) Real footprint from BD TOPO? | **YES** (research-confirmed) — `BATIMENT` feature type includes `WKT_GEOM` polygon | NOT YET live-probed — run probe in `../NEXT.md §8` |
| (b) Real height from BD TOPO `HAUTEUR` field? | **YES** (research-confirmed) — photogrammetry/LiDAR-derived, field name `HAUTEUR` | NOT YET live-probed — field may be null for some buildings; measure null rate |
| (c) Real roof shape (LOD2)? | **NOT from BD TOPO directly** — requires LiDAR HD → 3dfier/GeoFlow reconstruction | NOT YET — pipeline not written; LiDAR data is available for ~80% metro France |
| CRS of WFS response | Likely EPSG:4326 or EPSG:2154 (Lambert-93) depending on `SRSNAME` param | NOT YET probed — request `SRSNAME=EPSG:4326` and confirm |
| Licence text (verbatim, from this response) | Etalab 2.0 — expected in response metadata or `Content-License` header | NOT YET — check live response headers |
| LiDAR HD: Paris/Lyon/Marseille tiles available? | Likely YES (~80% coverage) | NOT YET — check `macarte.ign.fr` coverage map for each city bbox |
| Vegetation classification bundled? | **YES** — 11-class scheme includes low/med/high veg and building points together | Research-confirmed; no separate tree dataset needed |
| Coverage gaps → fallback | Areas not yet flown (remaining ~20% end-2025) → BD TOPO `HAUTEUR` as LOD1 fallback | TBD — map the gap zones |

**Probe command (copy-paste ready):**
```bash
# BD TOPO buildings + HAUTEUR — Paris 8th arrondissement sample
curl "https://data.geopf.fr/wfs?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature\
&TYPENAMES=BDTOPO_V3:batiment\
&BBOX=2.3460,48.8520,2.3500,48.8560,EPSG:4326\
&SRSNAME=EPSG:4326&COUNT=10&OUTPUTFORMAT=application/json" \
  | python3 -m json.tool | grep -E '"HAUTEUR"|"hauteur"|"type"|"geometry"' | head -30
```

---

## 5-building spot check (fill during Phase 1 — after live probe)

| BD TOPO building id | `HAUTEUR` value (m) | Visual check (satellite/StreetView) | Verdict |
|---|---|---|---|
| (TBD — fill after probe) | | | |

---

## Implementation notes (fill during Phase 2)

- **Adapter:** TBD — WFS GetFeature on `BDTOPO_V3:batiment` with bbox, parse `HAUTEUR` field
- **Reprojection:** `SRSNAME=EPSG:4326` in WFS request → no reprojection needed for WGS84 internal storage
- **LiDAR→LOD2 pipeline:** same 3dfier/GeoFlow-style pipeline scoped for Catalonia; inputs differ (IGN LiDAR HD tiles vs ICGC), pipeline structure is identical
- **Height datum:** BD TOPO `HAUTEUR` is height above ground (not above sea level); clarify in adapter documentation
- **Null handling:** if `HAUTEUR` is null for a feature, fall back to median height of surrounding buildings with non-null values, and flag as `estimated` in `ContextBuilding.provenance`
