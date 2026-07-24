# Switzerland (`ch`) — national data sources

**Status:** PARTIALLY LIVE-PROBED 2026-07-24.
Context-data layer: confirmed from official product documentation + partial live probes.
Legal/zoning layer: ÖREB endpoints VERIFIED LIVE (AG, ZH GetEGRID; GE, VD RDPPF). ÖREB data extract
content NOT YET FETCHED. Nutzungsplanung WFS GetCapabilities VERIFIED LIVE; GetFeature geo-blocked.
GWR API VERIFIED LIVE. CityGML 2.0 CONFIRMED. GWR full Stufe A field schema CONFIRMED from PDF v4.2.

> **Trust gate (playbook §3.3):** a field with NO citable source stays `null` in the pack and is listed
> under §B. A pack may NOT ship `confidence: 'structured'` unless EVERY field it sets has a row in §A
> with a real citation.

---

## A — CONFIRMED (official sources + live probe results)

### Context-data layer

| Field / layer | Value / endpoint | Governing instrument | Document / source (title + date) | URL / handle | Confidence |
|---|---|---|---|---|---|
| swissBUILDINGS3D 2.0 — coverage | Full national + Liechtenstein since 2018 | swisstopo institutional mandate | "swissBUILDINGS3D 2.0" product page | `swisstopo.admin.ch/en/landscape-model-swissbuildings3d-2-0` | `document` |
| swissBUILDINGS3D 2.0 — LOD / geometry | LOD2, closed solid + roof/façade/footprint, manually stereo-photogrammetrically extracted roofs incl. overhangs | Same | Same | Same | `document` |
| swissBUILDINGS3D 2.0 — accuracy | ±30–50cm planimetric and altimetric | Same | Same | Same | `document` |
| swissBUILDINGS3D 2.0 — formats | FileGDB, DWG, CityGML | Same | Same | Same | `document` |
| swissBUILDINGS3D 2.0 — licence | Free OGD since 1 March 2021; no login; commercial use permitted | Federal OGD ordinance | swisstopo licence terms | `swisstopo.admin.ch` | `document` |
| **swissBUILDINGS3D — CityGML version** | **CityGML 2.0 CONFIRMED** — "swisstopo is providing some of the 3D building models from swissBUILDINGS3D 3.0 Beta in the open data format CityGML 2.0" | swisstopo | "swissBUILDINGS3D 3.0 Beta in the format CityGML 2.0" product page, 2024-08-14 | `swisstopo.admin.ch/en/landscape-model-swissbuildings3d-citygml-20240814` | `VERIFIED-LIVE` 2026-07-24 (page fetched) |
| swissBUILDINGS3D 3.0 Beta — canton coverage (2026-07-24) | AG, AI, AR, BE, BL, BS, FR, GL, JU, LU, NE, NW, OW, SG, SH, SO, SZ, TG, UR + city of Zürich only | swisstopo 3.0 Beta rollout | opendata.swiss dataset page | `opendata.swiss/en/dataset/swissbuildings3d-3-0-beta` | `document` |
| swissBUILDINGS3D 3.0 Beta — CityGML canton coverage (Aug 2024) | AG, AI, AR, BE, BL, BS, GL, JU, TG + city of Zurich — note: slightly smaller than full 3.0 Beta list; FR, LU, NE, NW, OW, SG, SH, SO, SZ, UR added between Aug 2024 and July 2026 | swisstopo | CityGML product page 2024-08-14 | `swisstopo.admin.ch/en/landscape-model-swissbuildings3d-citygml-20240814` | `document` |
| swissBUILDINGS3D — EGID link | 3.0 Beta: EGID baked in model. 2.0: join via GWR `buildings.geojson` coordinate match (LV95/CH1903+) | Same | Same + BFS GWR documentation | Same | `document` |
| swissBUILDINGS3D — fidelity gap | 2.0 fallback = same LOD2 quality; EGID can be joined externally; this is a convenience gap, not a data-availability gap | swisstopo research finding | Product documentation | Same | `document` |
| swissSURFACE3D — LiDAR point cloud | 15–20 pts/m²; classes: Ground / Low/Med/High veg / Building / Water / Bridge / power lines / façades / bridge piers; full national (7-stage survey 2017–2024/25) | swisstopo | swissSURFACE3D product documentation | `swisstopo.admin.ch` | `document` |
| swissSURFACE3D — COPC format | Newest tiles (Eastern Switzerland, since 2024): COPC; older tiles: zipped `.las` (LAZ 1.2) | Same | Same | Same | `document` |
| swissSURFACE3D — TLM integration | DSM integrates swissTLM3D watercourse vectors for river/lake surface quality — per swisstopo own product description | Same | swisstopo product description (explicit statement) | `swisstopo.admin.ch` | `document` |
| swissSURFACE3D Raster — DSM | 0.5m DSM; full national by 2025; GeoTIFF 1 km² tiles | Same | Same | Same | `document` |
| swissALTI3D — DTM | 0.5m or 2m grid; bare earth; 6-year cycle; full national; free OGD | swisstopo | swissALTI3D product documentation | `swisstopo.admin.ch` | `document` |
| swissTLM3D — coverage | Full national + Liechtenstein; confirmed across versions 1.7 → 2.4 | swisstopo | Objektkatalog swissTLM3D v1.7–2.4 | `swisstopo.admin.ch` | `document` |
| swissTLM3D — accuracy | 0.2–1.5m all 3 dimensions; roads/watercourses/lakes = "well-defined" top tier | Same | Same | Same | `document` |
| swissTLM3D — roads attributes | `VERKEHRSBEDEUTUNG`, `VERKEHRSBESCHRAENKUNG` (incl. "closed"), `VERKEHRSMITTEL`, `EIGENTUEMER` | Same | Same | Same | `document` |
| swissTLM3D — roads update cadence | Annual for road links + admin boundaries; official cadastral survey is named reference partner | Same | Same | Same | `document` |
| swissTLM3D — water (Gewässernetz) | Watercourse centerlines + lake polygon outlines as distinct feature classes | Same | Same | Same | `document` |
| swissTLM3D — parks (Areale > Freizeit) | Parks/recreation/leisure as distinct polygon class separate from generic ground cover | Same | Same | Same | `document` |
| swissTLM3D — trees (Bodenbedeckung) | Individual tree points (Einzelbäume) + wooded area polygons (Gehölzflächen) as distinct object class | Same + Zürich OGD | Objektkatalog + City of Zürich open-data documentation (production use confirmed) | `swisstopo.admin.ch` + Zürich opendata.swiss | `document` |
| swissTLM3D — tree data authority | Zürich assigns greater authority to its own Baumkataster over swissTLM3D tree data | City of Zürich | Zürich OGD "Bodenbedeckung – Einzelbäume & Gehölzflächen" dataset documentation | Zürich opendata.swiss | `document` |
| swissTLM3D — licence | Free OGD since 1 March 2021; no login; commercial use permitted | Federal OGD ordinance | swisstopo licence terms | `swisstopo.admin.ch` | `document` |
| **GWR — API VERIFIED LIVE** | `POST https://madd.bfs.admin.ch/eCH-0206?egid={EGID}&requestContext=building` — HTTP 200, structured XML response | BFS institutional mandate | Live probe 2026-07-24; EGID 1175237 (Poschiavo, GR) + EGID 501001 (Heiden, AR) both returned building data | `madd.bfs.admin.ch` | `VERIFIED-LIVE` 2026-07-24 |
| **GWR — Stufe A field schema CONFIRMED** (PDF v4.2) | Full list: EGID, EDID, EGAID, GEBNR, GBEZ, GDEKT, GGDENR, GDENAME, EGRID, LGBKR, LPARZ, ESID, STRINDX, STRNAME, STRNAMK, DEINR, STRSP, STROFFIZIEL, DPLZ4, DPLZZ, DPLZNAME, DOFFADR, GKODE, GKODN, GKSCE, DKODE, DKODN, GKAT, GKLAS, GSTAT, GBAUJ, GBAUM, GBAUP, GABBJ, GAREA, GVOL, GVOLNORM, GVOLSCE, GASTW, GAZZI, GSCHUTZR, GEBF, GWAERZH1/2, GENH1/2, GWAERSCEH1/2, GWAERDATH1/2, GWAERZW1/2, GENW1/2, GWAERSCEW1/2, GWAERDATW1/2 | BFS GWR Verordnung | GWR Merkmalskatalog PDF Version 4.2 (BFS, 2022, Neuchâtel) | `housing-stat.ch/files/Data_de.pdf` | `document` (PDF fetched 2026-07-24) |
| GWR — Stufe B (restricted) | GLOC1–4 (local codes), GQUART (quarter) — require agreement (Stufe B) | BFS GWR Verordnung VGWR Anhang 1 | Same PDF | Same | `document` |
| GWR — update cadence | ≤48h nationally; ZH/TG/GL/SZ confirmed daily | BFS operational commitment | GWR product documentation | `housing-stat.ch` | `document` |
| GWR — access | API/JSON via `madd.bfs.admin.ch/eCH-0206`; rate limit 20 req/min; also canton mirrors via opendata.swiss | BFS open-data policy | GWR product documentation | `housing-stat.ch` | `document` |
| GWR — current API catalog version | 4.3 (as of 2026-07-24) | BFS | `housing-stat.ch/de/madd/index.html` — "Die Daten werden in Version 4.3 des GWR-Merkmalskatalog bereitgestellt" | `housing-stat.ch` | `document` |
| GWR — download includes geojson | `buildings.geojson` (LV95/CH1903+) in download zip — enables coordinate-based EGID join for 2.0 geometry | BFS | GWR download documentation | `housing-stat.ch/de/data/supply/public_content.html` | `document` |
| Federal OGD licence (swisstopo/BFS) | Open use including commercial, no login, since 1 March 2021 | Federal OGD Act | Federal OGD ordinance | `fedlex.admin.ch` | `document` |

### Legal/zoning layer — ÖREB/RDPPF endpoints

| Canton | Endpoint URL | Probe status |
|---|---|---|
| AG | `https://api.geo.ag.ch/v2/oereb` | `VERIFIED-LIVE` — GetEGRID returned `CH959823775233` |
| AR | `https://oereb.ar.ch/ktar/wsgi/oereb` | `document` |
| AI | `https://oereb.ai.ch/ktai/wsgi/oereb` | `document` |
| BE | `https://www.oereb2.apps.be.ch` | `document` |
| BL | `https://oereb.geo.bl.ch` | `document` |
| BS | `https://api.oereb.bs.ch` | `document` |
| FR | `https://maps.fr.ch/RDPPF_ws/RdppfSVC.svc` | `document` |
| **GE** | `https://ge.ch/terecadastrews/RdppfSVC.svc` | **`VERIFIED-LIVE`** — WCF service page confirmed |
| GL | `https://map.geo.gl.ch/oereb` | `document` |
| GR | `https://oereb.geo.gr.ch/oereb` | `document` |
| JU | `https://geo.jura.ch/crdppf_server` | `document` |
| LU | `https://svc.geo.lu.ch/oereb` | `document` |
| **NE** | *(no URL listed — email only: sitn@ne.ch)* | `document` (M2M page 2026-02-13) |
| NW | `https://oereb.gis-daten.ch/oereb` | `document` |
| OW | `https://oereb.gis-daten.ch/oereb` (shared with NW) | `document` |
| SH | `https://oereb.geo.sh.ch` | `document` |
| SZ | `https://map.geo.sz.ch/oereb` | `document` |
| SO | `https://geo.so.ch/api/oereb` | `document` |
| SG | `https://oereb.geo.sg.ch/ktsg/wsgi/oereb` | `document` |
| TI | `https://crdpp.geo.ti.ch/oereb2` | `document` |
| TG | `https://map.geo.tg.ch/services/oereb` | `document` |
| UR | `https://prozessor-oereb.ur.ch/oereb` | `document` |
| **VD** | `https://www.rdppf.vd.ch/ws/RdppfSVC.svc/` | **`VERIFIED-LIVE`** — WCF service page confirmed |
| VS | `https://rdppf.apps.vs.ch` | `document` |
| ZG | `https://oereb.zg.ch/ors` | `document` |
| **ZH** | `https://maps.zh.ch/oereb/v2` | **`VERIFIED-LIVE`** — GetEGRID returned `CH779170199926` |

Source: `cadastre.ch/de/oereb-webservice` (federal M2M page, dated 2026-02-13).

### Legal/zoning layer — ÖREB 2.0 data model

| Field / concept | Value / confirmed | Source | Confidence |
|---|---|---|---|
| ÖREB API syntax | `${baseurl}/getegrid/${FORMAT}/?EN=${E},${N}` and `${baseurl}/extract/${FORMAT}/?EGRID=${EGRID}` | Federal M2M documentation + live probe confirmation | `document` |
| ÖREB 2.0 schema versions | 0.9, 1.0, 2.0 at `schemas.geo.admin.ch/V_D/OeREB/` | Schema repository index | `VERIFIED-LIVE` 2026-07-24 |
| ÖREB `RestrictionOnLandownership` — `TypeCode` | Zone type code — **STRUCTURED** string attribute in ÖREB 2.0 JSON schema | `schemas.geo.admin.ch/V_D/OeREB/2.0/extractdata.json` | `document` (schema fetched) |
| ÖREB `RestrictionOnLandownership` — `TypeCodelist` | URI pointing to the code list for `TypeCode` — **STRUCTURED** | Same | `document` |
| ÖREB `RestrictionOnLandownership` — `LegalProvisions` | Array of documents with `TextAtWeb` URI (URL to legal provision — typically PDF). Ausnützungsziffer and height are in these PDFs. | Same | `document` |
| ÖREB `RestrictionOnLandownership` — `Information` | Optional key-value pairs — canton-specific; may contain additional data not in base schema | Same | `document` |
| ÖREB — Ausnützungsziffer in schema | **NOT a numeric field in the base ÖREB 2.0 schema** — numeric FAR/height lives in `LegalProvisions[].TextAtWeb` (PDF link) | Same | `document` — conclusive |
| ÖREB — Nutzungsplanung topic in ZH | "Zonenplan – Grundnutzungen (kantonal/kommunal)" and "Zonenplan – Überlagernde Nutzungsplaninhalte" are confirmed ÖREB topics in ZH | `geolion.zh.ch/geodatensatz/2281` + ZH ÖREB page | `document` |

### Legal/zoning layer — Nutzungsplanung WFS (geodienste.ch)

| Field / concept | Value | Source | Confidence |
|---|---|---|---|
| Nutzungsplanung WFS base URL | `https://geodienste.ch/db/npl_nutzungsplanung_v1_2_0/deu` | `cadastre.ch` + geodienste.ch | `VERIFIED-LIVE` 2026-07-24 (GetCapabilities HTTP 200) |
| WFS layer names (confirmed from GetCapabilities) | `ms:grundnutzung` (zone polygons) · `ms:ueberlagernde_nutzungsplaninhalte_flaechenbezogene_festlegungen` (area overlays) · `ms:ueberlagernde_nutzungsplaninhalte_linienbezogene_festlegungen` (line overlays) · `ms:ueberlagernde_nutzungsplaninhalte_punktbezogene_festlegungen` (point overlays) | WFS GetCapabilities response | `VERIFIED-LIVE` 2026-07-24 |
| WFS model version | MGDM ID 73.1, INTERLIS version 1.2 (Nutzungsplanung_V1_2) | GetCapabilities description + `models.geo.admin.ch/ARE/Nutzungsplanung_V1_2.ili` | `document` |
| WFS INTERLIS model legal basis | Updated 2023-03-20 (ARE); adapted to ÖREB Rahmenmodell V2.0 from 2021-09-01; GEOID 73 | `models.geo.admin.ch/ARE/Nutzungsplanung_V1_2.ili` | `document` |
| WFS CRS | EPSG:2056 (LV95) primary; also EPSG:4326, EPSG:3857 | GetCapabilities | `VERIFIED-LIVE` 2026-07-24 |
| WFS output formats | GML 3.2 / 3.1.1 / 2.1.2; application/json (GeoJSON) | GetCapabilities | `VERIFIED-LIVE` 2026-07-24 |
| WFS participating cantons (FULL coverage) | AG, AI, AR, BL, BS, FR, GE, JU, LU, NE, NW, OW, SG, SH, SZ, TG, UR, VD, ZG | geodienste.ch service availability map | `document` 2026-07-24 |
| WFS participating cantons (INCOMPLETE) | BE, GR, SO, VS | Same | `document` 2026-07-24 |
| WFS non-participating | FL (Liechtenstein) — no data | Same | `document` 2026-07-24 |
| WFS fee note | "Für den Bezug des Geodienstes können Kosten anfallen. Die Gebühren werden durch die Kantone erhoben." — cantonal fees may apply | GetCapabilities AccessConstraints | `VERIFIED-LIVE` 2026-07-24 |
| WFS geo-IP restriction | ZG confirmed geo-blocked from non-DACH IPs; geodienste.ch may apply similar restriction | Live probe — ZG returned geo-block page from non-DACH IP | `VERIFIED-LIVE` 2026-07-24 |
| WFS `ms:grundnutzung` Nutzungsziffer attribute | **NOT YET CONFIRMED** — INTERLIS model includes `Nutzungsziffer` concept; whether it is a populated WFS attribute requires GetFeature from DACH IP | WFS GetFeature geo-blocked | `NOT PROBED` — highest-priority remaining item |
| ÖREB V-ÖREB federal ordinance | Mandates standardized data model across all 26 cantons for public-law restrictions | V-ÖREB (Verordnung über das eidgenössische Gebäude- und Wohnungsregister, as applicable to ÖREB) | `document` |
| INTERLIS Nutzungsplanung_V1_2 — key classes | `Catalogue_CH` (national codes 11–99), `Dokument`, `Grundnutzung_Zonenflaeche` (zone polygon class — Nutzungsziffer attribute status not confirmed from partial model read) | `models.geo.admin.ch/ARE/Nutzungsplanung_V1_2.ili` | `document` (partial read — full Geobasisdaten TOPIC not yet seen) |
| swisstopo WMS (`wms.geo.admin.ch`) | VERIFIED LIVE — includes heritage/inventory layers; CRS EPSG:2056, 21781, 4326, 3857 etc. | WMS GetCapabilities | `VERIFIED-LIVE` 2026-07-24 |

---

## B — UNVERIFIED / open (stays `null` in the pack)

| Field | Why not verified | What would verify it |
|---|---|---|
| Nutzungsplanung WFS `ms:grundnutzung` Nutzungsziffer attribute | GetFeature geo-blocked from non-DACH IP | `curl` from CH/DE/AT server: `geodienste.ch/db/npl_nutzungsplanung_v1_2_0/deu?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAMES=ms:grundnutzung&COUNT=1&outputFormat=application/json` — inspect `features[0].properties` for numeric FAR field |
| Nutzungsplanung WFS overlay layer — max height attribute | Same geo-block | Same server requirement; check `ms:ueberlagernde_nutzungsplaninhalte_flaechenbezogene_festlegungen` |
| ÖREB data extract `Information` fields (canton-specific numeric content) | ÖREB extract not fetched | `curl "https://api.geo.ag.ch/v2/oereb/extract/json/?EGRID=CH959823775233"` — check if `Information[].Text` contains AZ or height as structured key-value |
| NE ÖREB endpoint URL | No URL on federal M2M page (email only) | Check `sitn.ne.ch` portal or email `sitn@ne.ch` |
| Geodienste.ch fee structure by canton | "Costs may apply" — exact amount/policy per canton unknown | Email `support@geodienste.kgk-cgc.ch` or check each canton's geodienste portal |
| INTERLIS model full Geobasisdaten TOPIC | PDF/ili read cut off; Grundnutzung_Zonenflaeche class attributes not confirmed | Read `models.geo.admin.ch/ARE/Nutzungsplanung_V1_2.ili` from byte 8000 onward |
| swissTLM3D 2.4 pedestrian sub-classification | Not transcribed from Objektkatalog | Read Objektkatalog 2.4 "Strassen und Wege" path sub-types |
| swissTLM3D 2.4 Areale Freizeit sub-types | Not transcribed | Read Objektkatalog 2.4 "Areale" chapter |
| Municipal tree cadastres (GE, BS, LS, BE) | Only ZH confirmed open data | Search each city's opendata.swiss for "Baumkataster" / "arbres" |
| GKAT / GKLAS domain code values | Full domain lists not transcribed from GWR PDF | Read GWR PDF v4.2 section on code tables / `kodes_codes_codici.csv` |
| Cantonal Denkmalschutz WFS endpoints | Not probed | Check ZH: `gis.zh.ch`; BE: `geo.be.ch`; GE: `ge.ch/sitg`; for Denkmalschutz/Patrimoine layers |
| Max height rule (numeric) for any Swiss parcel | Not probed — in PDF BZO | Read cantonal Bau- und Zonenordnung for one test address per pilot canton |
| Any legal numeric value (AZ, height, setback) for any specific Swiss parcel | No BZO/Nutzungsplanung document has been read for any specific address | Run full envelope query for test address; read applicable BZO PDF; cite per-field |

---

⚠ No zone code, Ausnützungsziffer, height rule, setback, or heritage value has been verified from a
primary source for any specific Swiss parcel. The ÖREB zone TypeCode structure is confirmed in the
data model schema, but no actual ÖREB data extract has been fetched and read. All pack values
remain `null` / refused until VERIFICATION.md is completed for specific parcels.
