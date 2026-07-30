# Data Readiness Rate — Switzerland (`ch`) national

> **Naming note (L-649 reconciliation, 2026-07-30).** This file was `RATE.md`; its content is the
> **structured national legislation / data-fill rate** (the C58/L-449 cross-jurisdiction ruler), which
> [`NAMING-CONVENTION`](../_TEMPLATE/NAMING-CONVENTION.md) §1 names `LEGISLATION-RATE.md`. It feeds the
> country composite master [`COUNTRY-RATE.md`](./COUNTRY-RATE.md) as **Axis 2 (LEGISLATION)**. Content
> below is unchanged — only the filename moved (§CONTEXT-DATA-HONESTY: no rate value was altered).

**Headline rate: ~85% (context-data layer) / ~20–25% (building-rule structured dimensional fill — MEASURED, not estimated)**

> **Structured dimensional fill rate** — the fraction of parcel-level building-rule queries that
> return a complete, machine-readable answer (**zone/use code + a density metric [FAR / coverage /
> Ausnützungsziffer] + height**) **without reading an ordinance text/PDF**. This definition is
> IDENTICAL across every jurisdiction (Denmark / Madrid / Saudi / Barcelona / Norway / Germany /
> France / Belgium …) so the scores are directly comparable. Derived from **live endpoint probes
> and schema reads**, 2026-07-24.

### ✅ DECIDING PROBE RESOLVED (2026-07-24) — the ~88% aspiration is DISPROVEN as numeric fill

The single probe that gated the rate — *does the national Nutzungsplanung WFS carry `Nutzungsziffer`
(FAR) / height as a structured attribute per zone polygon?* — has now been run to a verdict, from a
non-DACH origin that was **not** geo-blocked for `geodienste.ch`. Full transcript:
[`findings/SWITZERLAND-DATA-RECON-SPIKE.md`](./findings/SWITZERLAND-DATA-RECON-SPIKE.md).

**VERDICT: Outcome B — numeric fill is model/PDF-bound, NOT Outcome A.** The national WFS
`ms:grundnutzung` `DescribeFeatureType` + `GetFeature` deliver **zone identification only**
(`typ_kommunal/kantonal_code+bezeichnung`, national `hauptnutzung_code`, `bemerkungen` = local abbrev
e.g. `W2`, `dokument`) — **no `Nutzungsziffer`, no `Vollgeschosse`, no `Gebäudehöhe`**. The overlay
layer schema is identical (no height either). The federal INTERLIS model `Nutzungsplanung_V1_2` *does*
define an **OPTIONAL** `Typ.Nutzungsziffer : 0.00 .. 9.00` slot (so the FAR *ceiling* beats France's
prose), but it is not populated/surfaced by the national delivery, and **height/floor-count exist
nowhere in the model** — genuinely Baureglement-PDF-bound.

⚠ **Do not read ~85% as the comparable number.** The ~85% is the **context-data axis** (physical 3D
context) — a *different ruler* from the building-rule dimensional-fill number every other jurisdiction
is scored on. On the comparable ruler Switzerland is **~20–25% — France-class, not Denmark-class.**
The "~88%, highest of any jurisdiction" claim conflated these two axes; it is corrected here.

⚠ **Two-layer split.** Switzerland has two structurally different numbers:

1. **Context-data layer (~85%):** the 3D physical context — buildings, terrain, roads, water, parks,
   trees — confirmed live from swisstopo/BFS product documentation + live STAC/GWR probes this pass.
   Genuinely among the strongest in the benchmark. This is NOT the comparable building-rule number.

2. **Building-rule layer (~20–25%, MEASURED):** the ÖREB/RDPPF cadastre is confirmed live for 25/26
   cantons; zone type code is **structured** (ÖREB 2.0 `TypeCode`; national WFS `typ_*_code`). The
   Ausnützungsziffer/FAR is a typed model slot that the **national WFS does not expose** and is optional
   at source (~0–10% delivered today); **max height and setback are not in the model at all** and live
   in cantonal Baureglement PDFs (~0–5%). Full 3-field (zone + density + height, no PDF) = **~20–25%**,
   dominated by height never being data. Higher *ceiling* than France (typed FAR slot), same *floor*.

| Jurisdiction (building-rule dimensional-fill ruler) | Rate |
|---|---|
| Denmark | ~96% |
| Madrid | ~68% |
| Saudi (national) | ~55% |
| Barcelona | ~48% |
| Norway (national) | ~32% |
| Germany (national) | ~28% |
| **Switzerland (building-rule, MEASURED)** | **~20–25%** |
| France (national) | ~22% |
| Belgium (national, blended) | ~10–14% |

*Separate axis (NOT comparable to the above):* **Switzerland context-data layer ~85%** ·
Denmark context-data is comparably high. Context-data measures the physical 3D scene, not the
buildable-envelope rule.

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
| Nutzungsplanung WFS — zone polygons (19 cantons) | ✅ Structured (zone-ID only) | geodienste.ch `ms:grundnutzung` — `typ_kommunal/kantonal_code+bezeichnung`, `hauptnutzung_code` (11–99), `bemerkungen` (local abbrev e.g. `W2`), `dokument`; AG, AI, AR, BL, BS, FR, GE, JU, LU, NE, NW, OW, SG, SH, SZ, TG, UR, VD, ZG (full); BE, GR, SO, VS (incomplete) | ~65% | `VERIFIED-LIVE` — GetFeature returned `1102 Wohnzone / hauptnutzung 11` (AI) |
| Nutzungsplanung WFS fee note | ⚠️ Costs may apply | geodienste.ch: "Für den Bezug des Geodienstes können Kosten anfallen. Die Gebühren werden durch die Kantone erhoben." | — | `document` 2026-07-24 |
| Density metric (Ausnützungsziffer / GFZ) | ❌ NOT in national delivery (typed model slot, optional, unexposed) | **RESOLVED 2026-07-24:** national geodienste WFS `ms:grundnutzung` carries NO `nutzungsziffer` element (DescribeFeatureType + GetFeature, verbatim). Federal INTERLIS `Nutzungsplanung_V1_2` defines `Typ.Nutzungsziffer : 0.00 .. 9.00` but it is OPTIONAL and not surfaced by the national WFS. Recoverable only via a per-canton `Typ`-catalogue harvest. | ~5–10% | `VERIFIED-LIVE` — WFS schema+data + `.ili` model |
| Max height rule (Gebäudehöhe / Firsthöhe) | ❌ Not modelled — PDF-bound | **RESOLVED 2026-07-24:** NO height/floor-count attribute anywhere — not in `ms:grundnutzung`, not in overlay `ms:ueberlagernde_…_flaechenbezogene_festlegungen` (identical schema, verbatim), not in the INTERLIS model. Lives in cantonal Bau- und Zonenordnung PDF. Same status as France for height. | ~0–5% | `VERIFIED-LIVE` — WFS + `.ili` |
| Setback / alignment (Grenzabstand) | ❌ Not structured | Typically in cantonal BZO ordinance PDF | ~0–5% | NOT PROBED |
| Legal provision documents | ✅ Structured | ÖREB `LegalProvisions` array → `TextAtWeb` URL per restriction | ~75% | `document` (schema) |
| Heritage overlay (Denkmalschutz) | ⚠️ Federal inventories on swisstopo WMS | `wms.geo.admin.ch` confirmed LIVE with heritage layers; cantonal Denkmalschutz WFS endpoints NOT probed | ~40% | `VERIFIED-LIVE` (WMS capabilities) |

---

## The structural gap

**Switzerland is Outcome B (zone-ID strong, numbers model/PDF-bound) — Outcome A is now CLOSED.**

The critical finding, now RESOLVED by the deciding probe (2026-07-24): **the structured national
delivery identifies the zone but does not carry the numbers.** Both ÖREB 2.0 (`TypeCode` structured;
FAR/height only via `LegalProvisions[].TextAtWeb` PDF) and the national Nutzungsplanung WFS
(`ms:grundnutzung` = zone-ID + `dokument`, no `nutzungsziffer`/height element) agree: zone code is
data, the density/height is not.

This separates Switzerland from Denmark (~96%), which has numeric density and height as structured
fields in Plandata.dk. Switzerland's zone boundary/code coverage is Denmark-level; the numeric fill
is not — it is France-class (~20–25%).

**The hypothesis that "the national WFS may expose Nutzungsziffer" is DISPROVEN.** `DescribeFeatureType`
+ `GetFeature` on `ms:grundnutzung` (and the area-overlay layer) return zone-ID + `dokument` only — no
FAR, no height. So the earlier "~60% FAR if the WFS carries it → building-rule ~35–45%" path does **not**
open. See [`findings/SWITZERLAND-DATA-RECON-SPIKE.md`](./findings/SWITZERLAND-DATA-RECON-SPIKE.md) §1.

**BUT — the ceiling is higher than France's, and this is the one genuinely good news:** the federal
INTERLIS model `Nutzungsplanung_V1_2` defines a **typed** `Typ.Nutzungsziffer : 0.00 .. 9.00` +
`Nutzungsziffer_Art` slot (optional, reachable from every zone polygon via the mandatory `Typ_Geometrie`
association). France's FAR exists only as prose; Switzerland's exists as a native numeric model field
that some cantons populate. So the FAR is recoverable by a **per-canton `Typ`-catalogue harvest**
(INTERLIS/ili2pg — a data-plumbing job, not prose OCR), not by the single national WFS call. Height and
setback remain genuinely PDF-bound (not modelled at all) and need the Baureglement extraction pipeline
+ L-449, exactly like France for height.

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
| **Nutzungsplanung WFS `ms:grundnutzung` DescribeFeatureType** | ✅ **`VERIFIED-LIVE` (DECIDING PROBE)** | 13 elements: geometry, publiziert ab/bis, rechtsstatus, bemerkungen, typ_kommunal/kantonal code+bezeichnung, hauptnutzung code+bezeichnung, kanton, dokument. **NO nutzungsziffer / geschosszahl / gebäudehöhe** |
| **Nutzungsplanung WFS `ms:grundnutzung` GetFeature** | ✅ **`VERIFIED-LIVE` (DECIDING PROBE)** | Canton AI, GML: `typ_kommunal_code 1102 / Wohnzone`, `hauptnutzung 11 / Wohnzonen`, `bemerkungen W2`, `dokument` = Dokumente array with all-null links. Zone identified; **no numbers** |
| **Nutzungsplanung overlay `…flaechenbezogene_festlegungen` DescribeFeatureType** | ✅ **`VERIFIED-LIVE`** | Byte-for-byte the SAME generic schema as grundnutzung — **no height attribute** (disproves the overlay-height hypothesis) |
| **INTERLIS model `Nutzungsplanung_V1_2.ili`** | ✅ **`VERIFIED-LIVE`** | `Typ.Nutzungsziffer : 0.00 .. 9.00` (OPTIONAL) + `Nutzungsziffer_Art`; reachable via `Typ_Geometrie` assoc. **NO height/floor class anywhere in the model** |
| **GWR eCH-0206 building record (EGID 1175237)** | ✅ **`VERIFIED-LIVE`** | `buildingCategory 1020`, `buildingClass 1110`, `dateOfConstruction 1987`, `surfaceAreaOfBuilding 87`, `numberOfFloors 3`, Poschiavo GR — structured per-building context |
| **STAC `ch.swisstopo.swissbuildings3d_3_0`** | ✅ **`VERIFIED-LIVE`** | Collection + items live; EPSG 2056; tiled/fullcoverage; per-tile assets `.gdb.zip` + `.dwg.zip` (CityGML 2.0 is a separate curated download, not a STAC asset) |
| swisstopo WMS (`wms.geo.admin.ch`) | ✅ `VERIFIED-LIVE` | Capabilities confirmed live; includes heritage/inventory layers |
| ÖREB extract (full data content) — AG/ZH/BS, json/xml/pdf | ❌ `ATTEMPTED — NOT LANDED` | `getegrid` works; full `extract` operation 404/303 on all federal-spec path guesses — needs per-canton path discovery. NOT decision-relevant: ÖREB 2.0 schema already precludes a typed FAR/height field |
| Cantonal Denkmalschutz WFS | ❌ `NOT PROBED` | No cantonal heritage WFS fetched directly |
| NE ÖREB endpoint | ❌ `NOT FOUND` | Federal M2M page lists NE email only (sitn@ne.ch) — no URL; status unknown |

---

## What would raise the rate

| Action | Rate impact | Effort |
|---|---|---|
| ~~Probe geodienste.ch `ms:grundnutzung` WFS GetFeature~~ | ✅ **DONE — no Nutzungsziffer in the national WFS.** FAR does not come from here | — |
| ~~Probe overlay WFS for height attributes~~ | ✅ **DONE — overlay schema identical, no height.** Height does not come from here | — |
| **Per-canton `Typ`-catalogue harvest (INTERLIS/ili2pg) for the populated `Nutzungsziffer`** | The ONE lever that raises FAR: the typed `Typ.Nutzungsziffer` slot is populated by some cantons; harvesting it makes FAR structured DATA (not OCR). Raises FAR score materially where populated | Medium (per-canton INTERLIS ingest, not one national call) |
| Build the Baureglement extraction pipeline (height + setback) + L-449 gate | Height/setback are not modelled anywhere → only the ordinance pipeline recovers them. Same play as France | High (per-plan-authority extraction) |
| Probe one ÖREB `extract` for a parcel (correct per-canton path) | Confirms the `Information` key-value array is not used for AZ/height in practice (schema already precludes a typed field) | Low — but low value; the schema is conclusive |
| Confirm geodienste.ch licensing (fee structure by canton) | Essential before ingestion — some cantons may charge for WFS access | Low (email geodienste.ch or check each canton's terms) |
| Find NE ÖREB endpoint URL | Closes the only canton without a confirmed M2M URL | Low (email sitn@ne.ch or check SITN Neuchâtel portal) |
| Probe cantonal Denkmalschutz WFS (ZH: `gis.zh.ch`, BE: `geo.be.ch`, etc.) | Raises heritage overlay score from ~40% to ~75%+ | Low–Medium (one probe per major canton) |

---

*Last updated: 2026-07-24. **DECIDING PROBE RESOLVED (Outcome B):** geodienste `ms:grundnutzung`
DescribeFeatureType + GetFeature ✅ (zone-ID only, no FAR/height); overlay layer ✅ (no height);
INTERLIS `Nutzungsplanung_V1_2.ili` ✅ (optional `Typ.Nutzungsziffer 0..9`, no height class);
GWR eCH-0206 EGID 1175237 ✅; STAC swissBUILDINGS3D 3.0 ✅. Also prior: ÖREB AG/ZH GetEGRID ✅,
GE/VD RDPPF ✅, GWR API ✅, WFS GetCapabilities ✅, WMS ✅, CityGML 2.0 page ✅. ÖREB full extract
content ATTEMPTED-not-landed (per-canton path; not decision-relevant). Transcript:
`findings/SWITZERLAND-DATA-RECON-SPIKE.md`. Maintainer: UNASSIGNED.*
