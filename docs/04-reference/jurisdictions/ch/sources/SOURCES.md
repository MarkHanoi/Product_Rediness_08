# Switzerland (`ch`) — national data sources

**Status:** PARTIALLY CONFIRMED 2026-07-24 — context-data layer confirmed from official swisstopo/BFS
product documentation (product pages, Objektkatalog, opendata.swiss dataset pages). No live HTTP
probe has been run against any Swiss endpoint. No legal/zoning (ÖREB/RDPPF) values verified —
zero canton endpoints queried.

> **Trust gate (playbook §3.3, C58 §1.6):** a field with NO citable source stays `null` in the pack
> and is listed under §B. A pack may not ship `confidence: 'structured'` unless EVERY field it sets
> has a row in §A here with a live-verified citation. Current status: context-data sources are
> `document`-tier; no `VERIFIED-LIVE` rows yet (no live probe run).

---

## A — CONFIRMED (research-cited; source is official product documentation)

| Field / layer | Value / endpoint | Governing instrument | Document (title + date) | URL / handle | Confidence |
|---|---|---|---|---|---|
| swissBUILDINGS3D 2.0 — coverage | Full national + Liechtenstein, since 2018 | swisstopo institutional mandate | "swissBUILDINGS3D 2.0" product page | `swisstopo.admin.ch/en/landscape-model-swissbuildings3d-2-0` | `document` |
| swissBUILDINGS3D 2.0 — LOD / geometry type | LOD2, closed solid + separate roof/façade/footprint elements; manually stereo-photogrammetrically extracted roofs incl. overhangs | Same | Same | Same | `document` |
| swissBUILDINGS3D 2.0 — accuracy | ±30–50cm planimetric and altimetric | Same | Same | Same | `document` |
| swissBUILDINGS3D 2.0 — formats | ESRI FileGDB, DWG, CityGML | Same | Same | Same | `document` |
| swissBUILDINGS3D 2.0 — licence | Free OGD since 1 March 2021; no login; commercial use permitted | Federal OGD ordinance | swisstopo licence terms | `swisstopo.admin.ch` | `document` |
| swissBUILDINGS3D 2.0 — download | `map.geo.admin.ch` selection UI or swisstopo documented API; no registration | Same | Same | `map.geo.admin.ch` | `document` |
| swissBUILDINGS3D 3.0 Beta — canton coverage (live cantons) | AG, AI, AR, BE, BL, BS, FR, GL, JU, LU, NE, NW, OW, SG, SH, SO, SZ, TG, UR + city of Zürich only — as of 2026-07-24 | swisstopo 3.0 Beta rollout programme | opendata.swiss dataset page — "swissBUILDINGS3D 3.0 Beta" | `opendata.swiss/en/dataset/swissbuildings3d-3-0-beta` | `document` |
| swissBUILDINGS3D 3.0 Beta — EGID attribute | EGID (federal building ID) baked directly into the model | Same | Same | Same | `document` |
| swissBUILDINGS3D 3.0 Beta — update cadence | Biannual | Same | Same | Same | `document` |
| swissBUILDINGS3D 3.0 Beta — fallback for non-covered cantons | swissBUILDINGS3D 2.0 — same LOD2 quality; EGID join via GWR coordinate match | Same | Same | Same | `document` |
| swissBUILDINGS3D — fidelity gap vs. availability gap | Not-yet-covered cantons have full LOD2 coverage via 2.0; absence of EGID in model is a convenience gap, not a data-availability gap | Same | Research finding consistent with swisstopo product documentation | Same | `document` |
| swissSURFACE3D — LiDAR point cloud | 15–20 pts/m²; classified; classes: Ground / Low veg / Medium veg / High veg / Building / Water / Bridge / power lines / façades / bridge piers | swisstopo institutional mandate | "swissSURFACE3D" product documentation | `swisstopo.admin.ch` | `document` |
| swissSURFACE3D — national coverage | Full national; 7-stage survey completed 2017–2024/25; Bern release completed national coverage | Same | Same | Same | `document` |
| swissSURFACE3D — COPC format | Newest tiles (Eastern Switzerland, since 2024) ship as COPC; older tiles: zipped `.las` (LAZ 1.2) | Same | Same | Same | `document` |
| swissSURFACE3D — licence | Free OGD; no login | Same | Same | Same | `document` |
| swissSURFACE3D Raster — DSM | 0.5m grid DSM (ground + vegetation + buildings); full national by 2025; GeoTIFF 1 km² tiles | swisstopo institutional mandate | "swissSURFACE3D Raster" product documentation | `swisstopo.admin.ch` | `document` |
| swissSURFACE3D — TLM watercourse integration | swissSURFACE3D DSM integrates swissTLM3D watercourse vectors to improve river/lake surface representation — per swisstopo own product description | Same | swisstopo product description (explicit statement) | `swisstopo.admin.ch` | `document` |
| swissALTI3D — DTM | 0.5m or 2m grid; bare earth only (no vegetation/buildings); 6-year update cycle; GeoTIFF 1 km² tiles; full national | swisstopo institutional mandate | "swissALTI3D" product documentation | `swisstopo.admin.ch` | `document` |
| swissALTI3D — licence | Free OGD since 1 March 2021 | Same | Same | Same | `document` |
| swissTLM3D — product scope | 8-topic, 21M+-object national topographic landscape model; topics include Strassen und Wege, Öffentlicher Verkehr, Gewässernetz, Areale, Bodenbedeckung | swisstopo institutional mandate | Objektkatalog swissTLM3D v1.7–2.4 | `swisstopo.admin.ch` | `document` |
| swissTLM3D — coverage | Full national + Liechtenstein; confirmed across versions 1.7 → 2.4 | Same | Same | Same | `document` |
| swissTLM3D — accuracy | 0.2–1.5m in all 3 dimensions; roads, watercourses, lakes explicitly classed as "well-defined" objects | Same | Same | Same | `document` |
| swissTLM3D — update cadence (roads) | Annual update for road links and admin boundaries; official cadastral survey is a named reference partner | Same | Same | Same | `document` |
| swissTLM3D — formats | ESRI FileGDB (native), SHP, DXF, and others | Same | Same | Same | `document` |
| swissTLM3D — licence | Free OGD since 1 March 2021; no login; commercial use permitted | Federal OGD ordinance | swisstopo licence terms | `swisstopo.admin.ch` | `document` |
| swissTLM3D — roads attributes confirmed | `VERKEHRSBEDEUTUNG` (traffic significance) · `VERKEHRSBESCHRAENKUNG` (incl. "closed") · `VERKEHRSMITTEL` (transport mode) · `EIGENTUEMER` (owner) | Same | Objektkatalog swissTLM3D v1.7–2.4 | `swisstopo.admin.ch` | `document` |
| swissTLM3D — water object classes | Watercourse centerlines + lake polygon outlines as distinct feature classes in "Gewässernetz" topic group | Same | Same | Same | `document` |
| swissTLM3D — parks/leisure | "Areale > Freizeit" — parks, recreation grounds, sports facilities as distinct polygons separate from generic ground cover | Same | Same | Same | `document` |
| swissTLM3D — individual trees | "Bodenbedeckung" — Einzelbäume (individual tree points) + Gehölzflächen (wooded area polygons) as distinct object classes | Same | Same + City of Zürich open-data documentation (production use confirmed) | `swisstopo.admin.ch` + Zürich OGD | `document` |
| swissTLM3D — tree data authority | Zürich city explicitly positions swissTLM3D tree layer as secondary to its own municipal Baumkataster; uses swissTLM3D only to supplement gaps | City of Zürich open-data documentation | "Bodenbedeckung – Einzelbäume & Gehölzflächen" Zürich OGD dataset documentation | Zürich opendata.swiss | `document` |
| GWR — product | Gebäude- und Wohnungsregister (federal building and dwelling register); per-building EGID-linked record | Federal Statistical Office (BFS) institutional mandate; GWR federal legislation | BFS GWR product documentation | `housing-stat.ch` | `document` |
| GWR — Stufe A attributes (public) | Anzahl Geschosse (storey count) · Baujahr (construction year) · Gebäudeart (building type) · Gebäudefläche (footprint area) · heating type · dwelling count | BFS GWR Stufe A open-data policy | GWR product documentation; Merkmalskatalog (field-by-field schema NOT YET READ) | `housing-stat.ch` | `document` |
| GWR — update cadence | ≤48h nationally; Zürich / Thurgau / Glarus / Schwyz confirmed daily | BFS operational commitment | GWR product documentation + canton opendata.swiss republication notes | `housing-stat.ch` / opendata.swiss | `document` |
| GWR — access | API/JSON via `housing-stat.ch` (BFS); also republished by several cantons/cities via opendata.swiss (Zürich, Thurgau, Glarus, Schwyz confirmed) | BFS open-data policy | GWR product documentation | `housing-stat.ch` | `document` |
| GWR × swissBUILDINGS3D join key | EGID — shared between geometry (3.0 Beta: baked-in; 2.0: join via coordinate) and GWR attributes | Federal EGID assignment (BFS) | Research finding; consistent with both product documentations | `housing-stat.ch` + `swisstopo.admin.ch` | `document` |
| ÖREB/RDPPF legal basis | V-ÖREB federal ordinance mandates standardized data model across all 26 cantons for public-law restriction cadastre | Verordnung über das Grundbuch (GBV) + V-ÖREB | Federal law | `fedlex.admin.ch` | `document` |
| Federal OGD licence (swisstopo/BFS products) | Open use including commercial, no login, since 1 March 2021 | Federal OGD Act (Bundesgesetz über das Open Government Data) | Federal OGD ordinance | `fedlex.admin.ch` | `document` |

---

## B — UNVERIFIED / open (stays `null` in the pack)

| Field | Why not verified | What would verify it (the exact source to read) |
|---|---|---|
| Any ÖREB/RDPPF endpoint — zone code, Ausnützungsziffer, height rule for any canton | Zero live HTTP probes run | `curl "https://oereb.zh.ch/extract/reduced/json/coord/2683448,1248342"` — inspect for structured `Typ_Kt`/`Bezeichnung` zone code field + numeric FAR/height attribute vs. `PDF_URL` only |
| swissBUILDINGS3D CityGML export version | Sample tile not downloaded | Download one tile from `map.geo.admin.ch`; inspect `cityGMLVersion` declaration in the GML header |
| GWR Merkmalskatalog full field schema | `housing-stat.ch/files/881-2200.pdf` not read field-by-field | Download PDF; record all Stufe A field names, types, domain values, and Stufe B restricted fields |
| swissTLM3D roads — full VERKEHRSBEDEUTUNG / VERKEHRSBESCHRAENKUNG domain values | Attribute existence confirmed; full code-value list not transcribed | Read Objektkatalog swissTLM3D 2.4 chapter "Strassen und Wege"; list all domain values for both attributes |
| swissTLM3D roads — pedestrian/sidewalk sub-classification | "Wege" confirmed as an object class; sub-types for pedestrian-specific paths not verified | Read Objektkatalog swissTLM3D 2.4 chapter "Strassen und Wege" — path sub-type table |
| swissTLM3D Areale — Freizeit sub-types | Whether Freizeit is further subdivided (park vs. sports field vs. playground etc.) | Read Objektkatalog swissTLM3D 2.4 chapter "Areale" — Freizeit sub-type list |
| Municipal tree cadastres — Geneva, Basel, Lausanne, Bern | Only Zürich confirmed as published open data | Search each city's opendata.swiss entry or city OGD portal for "Baumkataster" (German) or "arbres" / "cadastre des arbres" (French) |
| 3.0 Beta canton list as of probe date (any date after 2026-07-24) | List is biannually updated | Check `opendata.swiss/en/dataset/swissbuildings3d-3-0-beta` distribution list; compare with `regions/README.md` |
| Heritage overlay (Denkmalschutz / Heimatschutz) — any canton | Federal list and cantonal Denkmalschutz services not probed | Check `wms.geo.admin.ch` for "Kulturgüter" / "Denkmal" layers; check cantonal Denkmalschutz GIS portals |
| Amtliche Vermessung (cadastral parcel geometry) — direct endpoint | Product existence and INSPIRE conformance confirmed; WFS endpoint URL and live HTTP status not verified | `curl "https://wms.geo.admin.ch/?SERVICE=WMS&REQUEST=GetCapabilities"` or check INSPIRE geoportal for Swiss parcel WFS |

---

⚠ No zone code, Ausnützungsziffer, height rule, setback, or heritage overlay value has been verified
from a primary source for any Swiss parcel. The context-data layer sources in §A are confirmed from
official product documentation; live HTTP probe status is UNVERIFIED. Switzerland's context-data
scores in `RATE.md` are research-confirmed, not yet live-endpoint-verified.
