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
