# Switzerland (`ch`) — human verification sign-off

**Verifier:** UNASSIGNED · **Date:** — · **Pack version / commit:** —

---

## Status (2026-07-24)

**NO PACK VALUES SIGNED OFF YET.** Live probes have confirmed endpoint availability and data model
structure. The context-data layer sources are confirmed from official documentation. The ÖREB legal
layer endpoints are live. No numeric building-rule value (zone code, Ausnützungsziffer, height,
setback) has been read from a real parcel response and verified against a primary planning document.

Per playbook §3.4 and L-449: a pack may NOT ship `confidence: 'structured'` without this file
completed for each field.

---

## Live probe log (all 2026-07-24 — agent-run, not human sign-off)

| Endpoint / action | Result | Human sign-off required? |
|---|---|---|
| ÖREB AG `getegrid/json/?EN=2645020,1249500` | ✅ HTTP 200 — `{"GetEGRIDResponse":[{"egrid":"CH959823775233","number":"62","identDN":"AG0200004001","type":{"Code":"RealEstate",...}}]}` | No (structural confirmation only) |
| ÖREB ZH `getegrid/json/?EN=2683448,1248342` | ✅ HTTP 200 — `{"GetEGRIDResponse":[{"egrid":"CH779170199926","number":"UN4079","identDN":"ZH0200000261",...}]}` | No (structural confirmation only) |
| ÖREB GE `ge.ch/terecadastrews/RdppfSVC.svc` | ✅ HTTP 200 — WCF service page; WSDL accessible | No (endpoint live) |
| ÖREB VD `rdppf.vd.ch/ws/RdppfSVC.svc/` | ✅ HTTP 200 — WCF service page; WSDL accessible | No (endpoint live) |
| GWR API `madd.bfs.admin.ch/eCH-0206?egid=1175237` | ✅ HTTP 200 — XML response with building data for Poschiavo (GR) | No (API structural; GASTW visible in response) |
| GWR API `madd.bfs.admin.ch/eCH-0206?egid=501001` | ✅ HTTP 200 — XML response with 5 dwellings for Heiden (AR) | No (API structural) |
| swissBUILDINGS3D CityGML page | ✅ Page fetched — "CityGML 2.0" confirmed verbatim | No (format confirmation) |
| Nutzungsplanung WFS GetCapabilities (geodienste.ch) | ✅ HTTP 200 — layer names confirmed; 19 cantons full | No (capabilities only; GetFeature not run) |
| swisstopo WMS GetCapabilities | ✅ HTTP 200 — capabilities confirmed live | No (structural) |
| GWR PDF Merkmalskatalog v4.2 | ✅ PDF fetched — full Stufe A field list read | No (schema confirmation only) |

---

## What was checked against which document version

| Field | Verified against | Method | Verdict |
|---|---|---|---|
| swissBUILDINGS3D 2.0 — LOD2, coverage, accuracy, formats, licence | swisstopo product page (read 2026-07-24) | Document read | ⚠ Research-confirmed from official page; NOT live-endpoint-verified (no tile downloaded) |
| swissBUILDINGS3D CityGML version | swisstopo CityGML product page 2024-08-14 (fetched 2026-07-24) | Page fetch | ✅ **CityGML 2.0 CONFIRMED** — verbatim statement in page text |
| swissBUILDINGS3D 3.0 Beta — canton list | opendata.swiss dataset page (read 2026-07-24) | Document read | ⚠ Research-confirmed; biannual update — re-check |
| swissTLM3D — roads, water, parks, trees coverage and attributes | Objektkatalog swissTLM3D v1.7–2.4 (read 2026-07-24) | Document read | ⚠ Research-confirmed; NOT live-endpoint-verified |
| GWR Stufe A field schema | GWR Merkmalskatalog PDF v4.2 (fetched and read 2026-07-24) | PDF read | ✅ Full field list confirmed; API catalog version is now 4.3 (minor delta) |
| GWR API — live availability | `madd.bfs.admin.ch/eCH-0206` (probed 2026-07-24, two EGIDs) | HTTP probe | ✅ VERIFIED LIVE — structured XML returned |
| ÖREB AG endpoint — live availability | `api.geo.ag.ch/v2/oereb/getegrid/json/` (probed 2026-07-24) | HTTP probe | ✅ VERIFIED LIVE — JSON EGRID response |
| ÖREB ZH endpoint — live availability | `maps.zh.ch/oereb/v2/getegrid/json/` (probed 2026-07-24) | HTTP probe | ✅ VERIFIED LIVE — JSON EGRID response |
| ÖREB GE endpoint — live availability | `ge.ch/terecadastrews/RdppfSVC.svc` (probed 2026-07-24) | HTTP probe | ✅ VERIFIED LIVE — WCF service page |
| ÖREB VD endpoint — live availability | `rdppf.vd.ch/ws/RdppfSVC.svc/` (probed 2026-07-24) | HTTP probe | ✅ VERIFIED LIVE — WCF service page |
| ÖREB 2.0 schema — TypeCode structured | `schemas.geo.admin.ch/V_D/OeREB/2.0/extractdata.json` (fetched 2026-07-24) | Schema read | ✅ `TypeCode` confirmed as required string field in `RestrictionOnLandownership` |
| ÖREB 2.0 schema — no numeric FAR/height field | Same schema | Schema read | ✅ Confirmed: no `Ausnuetzungsziffer` or `Gebaeudehoehe` numeric field in base schema |
| Nutzungsplanung WFS — layer names, canton coverage | geodienste.ch GetCapabilities (fetched 2026-07-24) | WFS probe | ✅ Layer names and canton list confirmed |
| Nutzungsplanung WFS — Nutzungsziffer attribute | NOT CHECKED — GetFeature geo-blocked | — | ❌ NOT CONFIRMED |
| ÖREB data extract content (any canton) | NOT FETCHED — format path issue | — | ❌ NOT CONFIRMED |
| Any specific Swiss parcel — zone code, AZ, height | NOT CHECKED | — | ❌ NOT CONFIRMED |
| Cantonal Denkmalschutz WFS | NOT PROBED | — | ❌ NOT CONFIRMED |

---

## What I could NOT confirm (and why it stays unshippable)

- **Ausnützungsziffer (FAR) as structured field:** confirmed absent from ÖREB base schema; not
  confirmed in Nutzungsplanung WFS (geo-blocked).
- **Max height rule as structured field:** same as above.
- **Any numeric building-rule value for any Swiss parcel:** no ÖREB extract fetched; no cantonal BZO
  read.
- **Geodienste.ch access fee:** "costs may apply" — not confirmed free.
- **NE ÖREB endpoint:** no URL found.
- **GWR field domain codes (GKAT, GKLAS values):** field names confirmed; code list CSV not read.

## Caveats that must remain visible in the product

- **CityGML 2.0 applies to 3.0 Beta cantons only** — the 2.0 product ships FileGDB and DWG.
- **3.0 Beta canton list is dated 2026-07-24 and is biannually updated.** Re-check before build plans.
- **NW and OW share one ÖREB endpoint** (`oereb.gis-daten.ch/oereb`) — must test both canton EGIDs.
- **GE and VD RDPPF are SOAP/WCF services**, not REST/JSON — require SOAP client, not simple GET.
- **Geodienste.ch WFS: cantonal fees may apply** — cannot assume free for production use.
- **GWR tree data / swissTLM3D** — Zürich assigns primary authority to its Baumkataster; treat
  swissTLM3D tree data as national fallback only.

---

**Sign-off:** NOT YET SIGNED OFF. No pack field may ship `confidence: 'structured'` until a named
human verifier has reviewed an actual ÖREB extract and/or BZO document for the specific pilot parcel
and completed the sign-off table. — UNASSIGNED, date TBD.
