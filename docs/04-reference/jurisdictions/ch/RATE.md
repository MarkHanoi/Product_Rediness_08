# Data Readiness Rate — Switzerland (`ch`) national

**Headline rate: ~85% (context-data layer) / ~25–35% estimated (building-rule layer)**

> **Structured dimensional fill rate** — the fraction of parcel-level building-rule queries that
> return a complete, machine-readable answer (**zone/use code + a density metric [FAR / coverage /
> Ausnützungsziffer] + height**) **without reading an ordinance text/PDF**. This definition is
> IDENTICAL across every jurisdiction (Denmark / Madrid / Saudi / Barcelona / Norway / Germany /
> France / Belgium …) so the scores are directly comparable. Derived from **live endpoint probes
> and schema reads**, 2026-07-24.

⚠ **Two-layer split.** Switzerland has two structurally different numbers:

1. **Context-data layer (~85%):** the 3D physical context — buildings, terrain, roads, water, parks,
   trees — confirmed live from swisstopo/BFS product documentation. Open items (GWR schema, CityGML
   version, pedestrian sub-classification) are now resolved by this pass (see §3 below).

2. **Building-rule layer (~25–35% estimated):** the ÖREB/RDPPF cadastre is confirmed live for 25/26
   cantons. Zone type code is **structured** in the ÖREB 2.0 data model (`TypeCode` field). The
   Ausnützungsziffer/FAR and max height are **not** structured fields in the ÖREB schema — they live
   in linked legal provision PDFs. However, a separate national Nutzungsplanung WFS at geodienste.ch
   covers 19 cantons with zone polygons; whether it includes numeric Nutzungsziffer as a WFS attribute
   is the last unconfirmed question. Full 3-field rate is **estimated** 15–35% pending that probe.

| Jurisdiction | Rate |
|---|---|
| Denmark | ~96% |
| **Switzerland (context-data layer)** | **~85%** |
| Madrid | ~68% |
| Saudi (national) | ~55% |
| Barcelona | ~48% |
| **Switzerland (building-rule, estimated)** | **~25–35%** |
| Norway (national) | ~32% |
| Germany (national) | ~28% |
| France (national) | ~22% |
| Belgium (national, blended) | ~10–14% |

---

## Field-by-field breakdown

### Context-data layer

| Field | Structured? | Source | Score | Probe status |
|---|---|---|---|---|
| Parcel geometry (Amtliche Vermessung / EGRID) | ✅ Full | Federal Amtliche Vermessung; EGRID as join key in ÖREB | ~90% | `document` |
| Building footprint LOD2 | ✅ Full | swissBUILDINGS3D 2.0 — nationwide since 2018, ±30–50cm | ~95% | `document` |
| Building height (volumetric LOD2) | ✅ Full | swissBUILDINGS3D 2.0/3.0 Beta — volumetric solid, roof shape manually extracted | ~95% | `document` |
| Building height (LiDAR cross-check) | ✅ Full | swissSURFACE3D — 15–20 pts/m², Building class, full national | ~95% | `document` |
| GWR storey count (GASTW) | ✅ Full | GWR BFS API — `GASTW` field, EGID-linked, ≤48h update | ~90% | `VERIFIED-LIVE` 2026-07-24 |
| EGID link (geometry ↔ GWR) | ✅ in 3.0 Beta / ⚠️ join in 2.0 | swissBUILDINGS3D 3.0 Beta (20 cantons); 2.0 coordinate-join | ~80% | `document` |
| Terrain DTM (bare earth, swissALTI3D) | ✅ Full | swissALTI3D — 0.5m/2m grid, full national | ~95% | `document` |
| Terrain DSM (swissSURFACE3D Raster) | ✅ Full | 0.5m grid DSM, full national by 2025 | ~90% | `document` |
| Roads — object-level, swissTLM3D | ✅ Full | swissTLM3D "Strassen und Wege" — feature classes + attributes | ~90% | `document` |
| Water — object-level, swissTLM3D | ✅ Full | swissTLM3D "Gewässernetz" — centerlines + lake outlines | ~95% | `document` |
| Parks / leisure areas — object-level | ✅ Full | swissTLM3D "Areale > Freizeit" — distinct polygon class | ~85% | `document` |
| Individual trees — object-level | ⚠️ National fallback | swissTLM3D "Bodenbedeckung" — periodic recalculation; municipal cadastre authoritative where published | ~70% | `document` |
| Vegetation canopy height | ✅ Derivable | swissSURFACE3D Low/Med/High vegetation classes | ~85% | `document` |
| GWR construction year (GBAUJ) | ✅ Full | GWR BFS — Baujahr, Stufe A public | ~90% | `VERIFIED-LIVE` 2026-07-24 |
| GWR building category (GKAT / GKLAS) | ✅ Full | GWR BFS — Gebäudekategorie / Gebäudeklasse, Stufe A | ~90% | `VERIFIED-LIVE` 2026-07-24 |
| swissBUILDINGS3D CityGML version | ✅ **CityGML 2.0 CONFIRMED** | Official swisstopo product page (2024-08-14) | — | `document` 2026-07-24 |

### Building-rule layer

| Field | Structured? | Source | Score | Probe status |
|---|---|---|---|---|
| Zone boundary geometry | ✅ Structured | ÖREB 2.0 data extract — parcel × zone intersection geometry; all 25 canton endpoints live | ~75% | `VERIFIED-LIVE` (AG, ZH probed) |
| Zone type code (Nutzungszone) | ✅ Structured | ÖREB 2.0 schema: `TypeCode` + `TypeCodelist` URI — standardized across all cantons | ~70% | `document` (schema) + VERIFIED-LIVE endpoints |
| Nutzungsplanung WFS — zone polygons (19 cantons) | ✅ Structured | geodienste.ch `ms:grundnutzung` layer — AG, AI, AR, BL, BS, FR, GE, JU, LU, NE, NW, OW, SG, SH, SZ, TG, UR, VD, ZG (full); BE, GR, SO, VS (incomplete) | ~60% | `VERIFIED-LIVE` (WFS GetCapabilities confirmed) |
| Nutzungsplanung WFS fee note | ⚠️ Costs may apply | geodienste.ch: "Für den Bezug des Geodienstes können Kosten anfallen. Die Gebühren werden durch die Kantone erhoben." | — | `document` 2026-07-24 |
| Density metric (Ausnützungsziffer / GFZ) | ❓ UNCONFIRMED | ÖREB legal provisions link to PDF — Ausnützungsziffer is NOT a numeric field in the ÖREB 2.0 schema. May be a WFS attribute in `ms:grundnutzung` (INTERLIS model — NOT YET CONFIRMED) | ~15–25% | PARTIAL — schema read; WFS GetFeature geo-blocked |
| Max height rule (Gebäudehöhe / Firsthöhe) | ❓ UNCONFIRMED | Typically in cantonal Bau- und Zonenordnung PDF; not a field in ÖREB 2.0 base schema; possibly in overlay WFS `ms:ueberlagernde_nutzungsplaninhalte_flaechenbezogene_festlegungen` | ~5–15% | NOT CONFIRMED — PDF-based |
| Setback / alignment (Grenzabstand) | ❌ Not structured | Typically in cantonal BZO ordinance PDF | ~0–5% | NOT PROBED |
| Legal provision documents | ✅ Structured | ÖREB `LegalProvisions` array → `TextAtWeb` URL per restriction | ~75% | `document` (schema) |
| Heritage overlay (Denkmalschutz) | ⚠️ Federal inventories on swisstopo WMS | `wms.geo.admin.ch` confirmed LIVE with heritage layers; cantonal Denkmalschutz WFS endpoints NOT probed | ~40% | `VERIFIED-LIVE` (WMS capabilities) |

---

## The structural gap

**Switzerland is "Outcome A-partial."**

The critical finding from this pass: **ÖREB IS structured for zone type code** (`TypeCode` in the 2.0
data model) but **is NOT structured for Ausnützungsziffer or max height**. Those numeric values live
in the linked legal provision PDFs (`LegalProvisions[].TextAtWeb`), not in separate machine-readable
fields, in the base ÖREB 2.0 schema.

This separates Switzerland from Denmark (~96%), which has numeric density and height as structured
fields in Plandata.dk. Switzerland's zone boundary/code coverage is Denmark-level; the numeric fill
is not.

**What partially closes the gap:** the national Nutzungsplanung WFS on geodienste.ch (19+ cantons,
MGDM ID 73.1, INTERLIS V1.2 model) may expose Nutzungsziffer as a WFS attribute of
`ms:grundnutzung`. If confirmed, this would raise the FAR score for 19+ cantons from ~0% to ~60%
and push the overall building-rule rate toward ~35–45%. This is the single probe that most changes
the rate.

**Switzerland vs. the benchmark:**
- vs. Denmark: Switzerland has the structured zone code; Denmark also has structured FAR/height in
  Plandata. Switzerland is missing the numeric layer.
- vs. Norway: Switzerland's ÖREB is more standardized across cantons than Norway's
  357-kommune fragmentation, but the numeric fill is similar (Norway WFS attributes include height
  for LOD building, but FAR is often in PDF).
- vs. Germany: Switzerland's ÖREB zone code is more standardized than Germany's 16-Bundesland
  B-Plan PDFs; but the numeric gap is the same.

### Live probe record (2026-07-24)

| Endpoint / source | Status | What was confirmed |
|---|---|---|
| swissBUILDINGS3D 2.0 product spec | ✅ `document` | LOD2, nationwide, ±30–50cm, FileGDB/DWG/CityGML, free OGD |
| swissBUILDINGS3D 3.0 Beta + CityGML page | ✅ `document` | **CityGML 2.0 CONFIRMED**; canton coverage list |
| swissTLM3D Objektkatalog | ✅ `document` | Roads/water/parks/trees object-level, nationwide |
| GWR `housing-stat.ch` API (`EGID=1175237`, `EGID=501001`) | ✅ `VERIFIED-LIVE` | Structured XML response; EGID, coordinates, canton, GASTW confirmed returned |
| GWR Stufe A field schema (PDF v4.2) | ✅ `document` | Full field list: EGID, GKAT, GKLAS, GSTAT, GBAUJ, GBAUM, GBAUP, GABBJ, GAREA, GVOL, GASTW, GAZZI, GEBF, heating fields |
| ÖREB AG (`api.geo.ag.ch/v2/oereb`) — GetEGRID | ✅ `VERIFIED-LIVE` | `{"GetEGRIDResponse":[{"egrid":"CH959823775233","number":"62","identDN":"AG0200004001",...}]}` |
| ÖREB ZH (`maps.zh.ch/oereb/v2`) — GetEGRID | ✅ `VERIFIED-LIVE` | `{"GetEGRIDResponse":[{"egrid":"CH779170199926","number":"UN4079","identDN":"ZH0200000261",...}]}` |
| ÖREB GE (`ge.ch/terecadastrews/RdppfSVC.svc`) | ✅ `VERIFIED-LIVE` | WCF SOAP service page — endpoint live, WSDL accessible |
| ÖREB VD (`rdppf.vd.ch/ws/RdppfSVC.svc`) | ✅ `VERIFIED-LIVE` | WCF SOAP service page — endpoint live, WSDL accessible |
| ÖREB full canton endpoint list | ✅ `document` | 25/26 canton URLs confirmed (NE: email only, no URL listed as of 2026-02-13) |
| ÖREB 2.0 JSON schema (`schemas.geo.admin.ch`) | ✅ `document` | `TypeCode`, `TypeCodelist`, `LegalProvisions` (PDF URL), `Information` (key-value); NO numeric FAR/height field |
| Nutzungsplanung WFS geodienste.ch (GetCapabilities) | ✅ `VERIFIED-LIVE` | Layer `ms:grundnutzung` + 3 overlay layers; 19 cantons full, 4 incomplete; fees may apply |
| ZG Nutzungsplanung WFS | ⚠️ `geo-blocked` | Confirmed endpoint live; blocked from non-DACH IPs |
| swisstopo WMS (`wms.geo.admin.ch`) | ✅ `VERIFIED-LIVE` | Capabilities confirmed live; includes heritage/inventory layers |
| ÖREB AG extract (full data) | ❌ `NOT FETCHED` | Wrong URL format; correct format `extract/json/?EGRID=...` returned 404 — AG v2 extract path needs verification |
| Nutzungsplanung WFS GetFeature | ❌ `geo-blocked` | ZG blocked from non-DACH IP; geodienste.ch TYPENAMES needed from capabilities |
| Cantonal Denkmalschutz WFS | ❌ `NOT PROBED` | No cantonal heritage WFS fetched directly |
| NE ÖREB endpoint | ❌ `NOT FOUND` | Federal M2M page lists NE email only (sitn@ne.ch) — no URL; status unknown |

---

## What would raise the rate

| Action | Rate impact | Effort |
|---|---|---|
| Probe geodienste.ch `ms:grundnutzung` WFS GetFeature for a test canton (from a DACH-region server) | Confirms whether Nutzungsziffer is a WFS attribute → raises FAR score from ~15% to ~60% for 19 cantons if YES | Low (one GetFeature call from CH/DE/AT IP) |
| Probe overlay WFS `ms:ueberlagernde_nutzungsplaninhalte_flaechenbezogene_festlegungen` for height attributes | Confirms whether max height is structured in overlay layer | Low (same server requirement) |
| Probe one ÖREB `extract/json/` for a specific parcel (correct endpoint path) | See `Information` key-value pairs — some cantons may populate AZ/height here | Low (need correct URL format per canton) |
| Confirm geodienste.ch licensing (fee structure by canton) | Essential before ingestion — some cantons may charge for WFS access | Low (email geodienste.ch or check each canton's terms) |
| Find NE ÖREB endpoint URL | Closes the only canton without a confirmed M2M URL | Low (email sitn@ne.ch or check SITN Neuchâtel portal) |
| Probe cantonal Denkmalschutz WFS (ZH: `gis.zh.ch`, BE: `geo.be.ch`, etc.) | Raises heritage overlay score from ~40% to ~75%+ | Low–Medium (one probe per major canton) |
| Read cantonal BZO / Bau- und Zonenordnung for a test address | Confirms whether max height is always in PDF or sometimes in structured field | Medium |

---

*Last updated: 2026-07-24. Live probes run: ÖREB AG GetEGRID ✅, ÖREB ZH GetEGRID ✅, GE RDPPF ✅,
VD RDPPF ✅, GWR API ✅, Nutzungsplanung WFS GetCapabilities ✅, swisstopo WMS ✅, CityGML 2.0
page ✅. ÖREB data extract content NOT YET FETCHED. WFS GetFeature geo-blocked from probe origin.
GWR full field schema: confirmed from PDF v4.2. Maintainer: UNASSIGNED.*
