# SOURCES — Denmark national zoning (Plandata.dk)

> Per-field citation catalogue for the DK structured-zoning path (C58 §1.2 fidelity 1).
> Every value the `DkZoningProvider` → `mapPlandataToZoningRecord` path sets has a row here,
> traced to the Plandata.dk GeoServer WFS field it comes from. A field with no citable source
> stays `null` (never interpolated). L-449 human-verification gate: see `VERIFICATION.md`.

## The source

| | |
|---|---|
| **Register** | Plandata.dk — the Danish national plan register (Erhvervsstyrelsen / Danish Business Authority) |
| **Endpoint** | `https://geoserver.plandata.dk/geoserver/wfs` — WFS 2.0, **keyless / open** |
| **License** | Open public data (Plandata.dk) |
| **Native CRS** | EPSG:25832 (ETRS89 / UTM 32N) — metric; shoelace on it yields m² directly |
| **Access model** | Denmark is a DATA-FILL ceiling, NOT an access wall (opposite of Barcelona): the WFS is fully open; the limit is which plans *publish a number*, not whether we can read them. |

## Layers used (verified live via GetCapabilities + DescribeFeatureType, 2026-07-23)

| Layer (`pdk:` prefix) | Role | National feature count (`resultType=hits`, 2026-07-23) |
|---|---|---|
| `theme_pdk_lokalplandelomraade_vedtaget` | local-plan SUB-AREA (delområde) — most specific dimensional layer | 66,220 |
| `theme_pdk_lokalplan_vedtaget` | whole local plan | 37,974 |
| `theme_pdk_kommuneplanramme_vedtaget_v` | municipal-plan FRAMEWORK (fall-through floor) | 50,627 |
| `theme_pdk_byggefelt_vedtaget` | building-field FOOTPRINT polygons (assessed L-609 — see findings) | 57,031 |
| `theme_pdk_zonekort_samlet_v` | official zone map (byzone/landzone/sommerhus), dissolved per-kommune | 98 (byzone) |

## Per-field map (raw WFS attribute → C58 `ZoningRecord` field)

| ZoningRecord field | WFS attribute | Present on layers | Notes |
|---|---|---|---|
| `structuredFields.plotRatioFAR` | `bebygpct` / 100 | lokalplan, delområde, ramme | bebyggelsesprocent = etageareal/grundareal ×100 = **FAR×100**, NOT coverage. |
| `structuredFields.maxHeight_m` | `maxbygnhjd` | lokalplan, delområde, ramme, **byggefelt** | metres, passthrough. |
| `structuredFields.maxFloors` | `maxetager` | lokalplan, delområde, ramme, **byggefelt** | decimal in source (e.g. 3.5 incl. attic) → floored to int. |
| `structuredFields.permittedUse[]` | `anvendelsegenerel` / `anvgen` | lokalplan, delområde, ramme | classified onto the C58 closed vocabulary. |
| `structuredFields.maxCoverage` | — | — | **`null` — no source.** Plandata's standard plan fields publish no ground-coverage %. byggefelt gives a footprint *polygon*, not a %, and coverage = footprint∩parcel/parcel needs the parcel geometry (absent in the pure mapper). See L-609. |
| `structuredFields.setbacks` | — | — | **`null` — separate dataset.** Per-edge setbacks (byggelinjer) are not carried on the plan feature. |
| `ordinanceRef` | `doklink` | all | plan-document PDF link — the C58 §1.3 governing-document citation. |
| `zoneLabel` / `zoneCode` | `plannavn`/`lp_plannavn`, `plannr`/`lp_plannr`, `planid`/`lokplan_id`, `delnr` | all | plan identity; the delområde/byggefelt layers carry it under the `lp_*` aliases. |
| `overlays[]` | `zonestatus` | lokalplan, delområde | Byzone/Landzone context tag (note: on `kommuneplanramme` this field is 82.6% null — see findings). |

## Verified probe queries (reproducible)

```
# National feature count for any layer
GET {endpoint}?service=WFS&version=2.0.0&request=GetFeature&resultType=hits&typeNames=pdk:<layer>

# Point query (metric bbox — EPSG:25832 axis order is easting,northing, unambiguous)
GET {endpoint}?service=WFS&version=2.0.0&request=GetFeature&typeNames=pdk:<layer>
    &outputFormat=application/json&srsName=EPSG:25832
    &propertyName=maxbygnhjd,maxetager,bebygpct&bbox=<minE>,<minN>,<maxE>,<maxN>,urn:ogc:def:crs:EPSG::25832
```

All counts and the area/click measurements were run live on **2026-07-23**; see
`../findings/L-609-click-weighted-fill-and-byggefelt.md` for the method and the numbers.

---

## The national geospatial platform (SDFI / Dataforsyningen) — data-axis anchors

> Scope note: everything above is the **zoning-rule** per-field path (`DkZoningProvider`). This
> section adds the **geospatial data-availability axis** — the authoritative national registers a
> context engine consumes — folded from the founder Danish geospatial deep-dive, 2026-07-30. Full
> catalogue: `../DENMARK-GEOSPATIAL-DATA-INVENTORY.md`; per-layer source hierarchies + badging:
> `../findings/DENMARK-CONTEXT-DATA-DEEP-DIVE-L513.md`. All rows **`VERIFIED-PRIMARY`**
> (authoritative national source, documented) unless the confidence column says otherwise; every
> row **⚠ re-probe the endpoint before it gates prod** (§CONTEXT-DATA-HONESTY). None of this moves a
> RATE % cell.

**🏆 Denmark is the benchmark — the ONLY audited country with machine-readable national planning
(PLANDATA.dk).** The RATE LEGISLATION / ENVELOPE `not-assessed` state is the **unsigned L-449
human-verification gate**, NOT data absence: the planning data is machine-readable (national
structured-fill prior ≈96%). See `../sources/VERIFICATION.md` for the gate.

| Source | Authority | Access | API | Licence | CRS | Confidence |
|---|---|---|---|---|---|---|
| **SDFI / Dataforsyningen** (the platform) | Styrelsen for Dataforsyning og Infrastruktur | Datafordeler (open-with-key) + `api.dataforsyningen.dk` (keyless `token=`) | OGC API / WFS / WMS / WMTS / WCS / REST | Open | 25832 | `VERIFIED-PRIMARY` ⚠ re-probe |
| **Matriklen** (cadastre / `jordstykke` parcels) | SDFI (Matriklen2) | Datafordeler | WFS 2.0 / OGC API / REST / bulk · GML/GeoJSON/SHP | Open | 25832 | `VERIFIED-PRIMARY` ⚠ re-probe |
| **BBR** (Bygnings- og Boligregistret — year/use/floors/area/roof/units/energy) | Klimadatastyrelsen (Climate Data Agency) | Datafordeler | REST JSON / WFS | Open | 25832 | `VERIFIED-PRIMARY` ⚠ re-probe |
| **DAR** (Danmarks Adresseregister — addresses / reverse-geocode) | SDFI | Datafordeler / Dataforsyningen | REST | Open | 25832 | `VERIFIED-PRIMARY` ⚠ re-probe |
| **GeoDanmark** (national topo base — buildings/roads/hydro/rail/veg/coast) | GeoDanmark (SDFI + municipalities) | Dataforsyningen / Datafordeler | WFS 2.0 / OGC API | Open | 25832 | `VERIFIED-PRIMARY` ⚠ re-probe |
| **National LiDAR + DTM/DSM** (DHM — ~4.5 pts/m², 0.4 m rasters) | SDFI (DHM) | Datafordeler / Dataforsyningen | LAZ tiles · WCS / GeoTIFF | Open | 25832 | `VERIFIED-PRIMARY` ⚠ re-probe |
| **🏆 PLANDATA.dk** (national planning — Lokalplaner + Kommuneplan) | Erhvervsstyrelsen (Danish Business Authority) | `geoserver.plandata.dk` — **keyless/open** | WFS 2.0 / REST · GML/GeoJSON | Open | 25832 | **`VERIFIED-LIVE` (2026-07-23)** |
| **Danish Environmental Portal** (Miljøportal — §3 nature / Natura2000 / wetland / flood) | Danmarks Miljøportal | Miljøportal | WMS / WFS | Open | 25832 | `VERIFIED-PRIMARY` ⚠ re-probe |

**Height is Denmark's strength:** national LiDAR → DSM−DTM (P90) → **BBR floor-count VALIDATION** (a
cross-check unique to Denmark in the study). **Cycle infrastructure** (municipal engineering GIS) and
**machine-readable planning** (PLANDATA.dk) are the two DK differentiators. Honest weaknesses: no
national semantic LOD3/BIM; some municipal engineering data (cycle/pedestrian/parks/trees) is local;
utilities fragmented. Re-probe endpoints before prod even at benchmark confidence.
