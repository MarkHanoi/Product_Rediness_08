# NEXT — Switzerland (`ch`)

> **Last updated:** 2026-07-24 · **Maintainer:** UNASSIGNED · **Status:** Context-data GATE PASSED;
> ÖREB legal-layer PARTIALLY PROBED — zone code CONFIRMED STRUCTURED; FAR/height UNCONFIRMED.

---

## 1 — WHERE WE STOPPED

**Context-data layer:** Gate PASSED. All four topics confirmed. CityGML 2.0 confirmed. GWR full Stufe
A field schema confirmed. Three residual open items remain (see §3.3).

**Legal/zoning layer:** Major progress. All 25 ÖREB canton endpoints now confirmed with URLs (NE has
email only). AG and ZH GetEGRID VERIFIED LIVE. GE (Geneva) and VD (Vaud) RDPPF endpoints VERIFIED
LIVE — both are SOAP/WCF services. The ÖREB 2.0 data schema confirms zone TypeCode is a structured
field, but Ausnützungsziffer and max height are NOT in the base ÖREB schema — they live in linked PDF
legal provisions.

A national Nutzungsplanung WFS at geodienste.ch (MGDM ID 73.1, V1.2, layer `ms:grundnutzung`) is
confirmed live for 19+ cantons. Whether this WFS layer includes Nutzungsziffer (FAR) as a structured
attribute is the single remaining critical unknown — blocked by geo-IP restriction on probe.

ÖREB full data extract has NOT been fetched (format path needs verification per canton). One first-
municipality folder (`ch-zh/...` or `ch-be/...`) has not been created — awaiting WFS attribute
confirmation.

---

## 2 — THE NUMBER

**Context-data structured fill:** ~85% (context layer; see `RATE.md`).

**Building-rule structured fill:**
- Zone type code: ~70% (ÖREB TypeCode confirmed structured; all 25 canton endpoints live)
- Zone polygon / boundary: ~75% (ÖREB + geodienste.ch WFS for 19+ cantons)
- Density metric (Ausnützungsziffer): ~15–25% ESTIMATED (in PDF per ÖREB schema; geodienste.ch WFS attribute unconfirmed; pending)
- Max height: ~5–15% ESTIMATED (in PDF typically; overlay WFS attribute unconfirmed)
- Full 3-field (zone + FAR + height): **~15–35% estimated** — pending WFS GetFeature probe

---

## 3 — BLOCKERS

### 3.1 — Nutzungsplanung WFS attribute schema not probed (geo-IP blocked)

- **What it is.** The geodienste.ch WFS (`ms:grundnutzung`) covers 19+ cantons with zone polygons.
  Whether the features include Nutzungsziffer (FAR) as a structured attribute cannot be determined
  without a GetFeature call — blocked from non-DACH IP addresses (ZG confirmed geo-blocked;
  geodienste.ch likely same).
- **Why it blocks.** If YES: FAR score rises from ~15% to ~60% for 19 cantons; overall building-rule
  rate rises to ~35–45%. If NO: FAR remains PDF-only and the rate estimate holds.
- **THE EXACT RESUME STEP.**
  ```bash
  # From a CH/DE/AT server or VPN exit node:
  curl "https://geodienste.ch/db/npl_nutzungsplanung_v1_2_0/deu?SERVICE=WFS&VERSION=2.0.0\
  &REQUEST=GetFeature&TYPENAMES=ms:grundnutzung&COUNT=1&outputFormat=application/json" \
  | jq '.features[0].properties'
  # Check: is there a 'nutzungsziffer', 'ausnuetzungsziffer', 'gfz', or similar numeric field?
  # Also check: is there a 'gebaeudehoehemax' or 'firsthoehe' attribute?
  ```

### 3.2 — ÖREB full data extract not fetched

- **What it is.** The ÖREB 2.0 schema shows a `Information` key-value array in
  `RestrictionOnLandownership` — some cantons may populate this with structured AZ/height data.
  The actual extract content for a real parcel has not been seen.
- **Why it blocks.** Cannot confirm whether canton-specific Information fields carry numeric
  parameters beyond what the base schema defines.
- **THE EXACT RESUME STEP.**
  ```bash
  # AG v2 correct extract syntax (note: may need no slash before ?):
  curl "https://api.geo.ag.ch/v2/oereb/extract/json/?EGRID=CH959823775233"
  # If that fails, check AG capabilities for correct path format:
  curl "https://api.geo.ag.ch/v2/oereb/capabilities/json/"
  # Inspect: do any RestrictionOnLandownership entries for Nutzungsplanung
  # include Information key-value pairs with numeric AZ or height?
  ```

### 3.3 — Context-data residual open items

These are LOW effort and do not block implementation, but close the context-data rate gap (~85% → ~92%):

1. **Pedestrian sub-classification in swissTLM3D 2.4**: Read Objektkatalog 2.4 "Strassen und Wege"
   chapter; confirm whether "Wege" is further sub-typed for sidewalks vs. generic paths.
2. **Areale Freizeit sub-types**: Read Objektkatalog 2.4 "Areale" chapter; confirm whether Freizeit
   sub-classifies park vs. sports field vs. playground.
3. **Municipal tree cadastres (Geneva, Basel, Lausanne, Bern)**: Check each city's opendata.swiss
   entry for "Baumkataster" or "cadastre des arbres". Zürich is the only confirmed open-data case.

### 3.4 — Geodienste.ch licensing (fees may apply)

- **What it is.** The geodienste.ch Nutzungsplanung WFS GetCapabilities states: "Für den Bezug des
  Geodienstes können Kosten anfallen. Die Gebühren werden durch die Kantone erhoben." — cantonal
  fees may apply.
- **Why it blocks.** Cannot assume free access for production ingestion without confirming the fee
  structure per canton.
- **THE EXACT RESUME STEP.** Email `support@geodienste.kgk-cgc.ch` to confirm whether API access
  for PRYZM's production use case is free for all participating cantons, or whether per-canton
  agreements are needed.

### 3.5 — NE (Neuchâtel) ÖREB endpoint URL not found

- **What it is.** The federal M2M page (2026-02-13) lists NE with email only (`sitn@ne.ch`), no URL.
- **THE EXACT RESUME STEP.** Check `sitn.ne.ch` — the SITN portal for Neuchâtel — for an ÖREB or
  RDPPF webservice entry. Or email sitn@ne.ch directly.

---

## 4 — TRIP-WIRES

- **4.1 — geodienste.ch WFS Nutzungsziffer confirmed** → update `RATE.md §2` FAR row; raise building-
  rule rate from ~25% to ~35–45%; proceed to Phase 1 municipality folder.
- **4.2 — ÖREB extract Information fields carry numeric AZ/height** → update `RATE.md §2`; raises
  rate for confirmed cantons; add SOURCES.md rows for each canton confirming this.
- **4.3 — swissBUILDINGS3D 3.0 Beta adds a new canton** → update `regions/README.md` canton table.
  Check biannually at `opendata.swiss/en/dataset/swissbuildings3d-3-0-beta`.
- **4.4 — Any Swiss city publishes open-data tree cadastre** → update `topics/parks-trees.md`; add
  endpoint to `sources/SOURCES.md`.
- **4.5 — NW and OW share an ÖREB endpoint** (`oereb.gis-daten.ch/oereb`) — test with one EGRID from
  each canton to confirm the shared endpoint routes correctly.
- **4.6 — Geodienste.ch fee structure confirmed free** → unblocks production ingestion for 19
  cantons immediately.

---

## 5 — WHAT IS ALREADY BUILT (do not redo)

- **Context-data Gate: PASSED.** All 4 topic files filled with confirmed sources and open items.
- **ÖREB canton endpoint table:** all 25/26 URLs confirmed and documented in `sources/SOURCES.md`.
- **GWR full Stufe A field schema:** confirmed from PDF v4.2; all field names documented in
  `sources/SOURCES.md`.
- **CityGML 2.0 version:** confirmed from official swisstopo product page.
- **Live probe record:** AG GetEGRID, ZH GetEGRID, GE RDPPF, VD RDPPF, GWR API, WMS capabilities,
  geodienste.ch WFS GetCapabilities — all confirmed in `RATE.md §3 probe record`.
- **ÖREB 2.0 schema:** TypeCode structured, LegalProvisions → PDF URL, Information optional key-value.
- **Nutzungsplanung WFS layer names:** `ms:grundnutzung`, `ms:ueberlagernde_nutzungsplaninhalte_*`.
- **3.0 Beta canton routing table:** `regions/README.md` with full routing logic.

---

## 6 — VERIFIED SOURCES

| Source | Answers | Tier | Exact query / note |
|---|---|---|---|
| `api.geo.ag.ch/v2/oereb/getegrid/json/?EN=2645020,1249500` | AG ÖREB GetEGRID — returned EGRID `CH959823775233`, parcel `62`, identDN `AG0200004001` | `VERIFIED-LIVE` 2026-07-24 | HTTP 200, JSON response |
| `maps.zh.ch/oereb/v2/getegrid/json/?EN=2683448,1248342` | ZH ÖREB GetEGRID — returned EGRID `CH779170199926`, parcel `UN4079`, identDN `ZH0200000261` | `VERIFIED-LIVE` 2026-07-24 | HTTP 200, JSON response |
| `ge.ch/terecadastrews/RdppfSVC.svc` | GE RDPPF endpoint live | `VERIFIED-LIVE` 2026-07-24 | WCF service page; WSDL at `?wsdl` |
| `rdppf.vd.ch/ws/RdppfSVC.svc/` | VD RDPPF endpoint live | `VERIFIED-LIVE` 2026-07-24 | WCF service page |
| `madd.bfs.admin.ch/eCH-0206?egid=1175237` | GWR live API — building data for EGID 1175237 (Poschiavo, GR) | `VERIFIED-LIVE` 2026-07-24 | HTTP 200, XML; canton GR confirmed, GASTW visible |
| `madd.bfs.admin.ch/eCH-0206?egid=501001` | GWR live API — building data for EGID 501001 (Heiden, AR) | `VERIFIED-LIVE` 2026-07-24 | HTTP 200, XML; 5 dwellings, Heiden AR confirmed |
| `swisstopo.admin.ch/en/landscape-model-swissbuildings3d-citygml-20240814` | CityGML 2.0 confirmed; CityGML cantons (Aug 2024): AG, AI, AR, BE, BL, BS, GL, JU, TG + city of Zurich | `document` 2026-07-24 | Official swisstopo product page |
| `cadastre.ch/de/oereb-webservice` | Full canton ÖREB endpoint list (25 URLs + NE email) | `document` 2026-02-13 (page date) | Official federal ÖREB M2M page |
| `schemas.geo.admin.ch/V_D/OeREB/2.0/extractdata.json` | ÖREB 2.0 JSON schema — TypeCode, TypeCodelist, LegalProvisions, Information structure | `document` 2026-07-24 | Schema file fetched |
| `geodienste.ch/db/npl_nutzungsplanung_v1_2_0/deu?SERVICE=WFS&REQUEST=GetCapabilities` | Nutzungsplanung WFS live; layer `ms:grundnutzung`; 19 cantons full; fees may apply | `VERIFIED-LIVE` 2026-07-24 | WFS GetCapabilities, HTTP 200 |
| `housing-stat.ch/files/Data_de.pdf` | GWR Stufe A field list: EGID, GKAT, GKLAS, GSTAT, GBAUJ, GAREA, GASTW, GAZZI, heating fields (full list in SOURCES.md) | `document` 2022 (PDF v4.2) | PDF fetched and read |
| `wms.geo.admin.ch/?SERVICE=WMS&REQUEST=GetCapabilities` | swisstopo WMS confirmed live; includes heritage inventory layers | `VERIFIED-LIVE` 2026-07-24 | WMS GetCapabilities HTTP 200 |

---

## 7 — DEAD ENDS

- **ÖREB AG extract (`extract/reduced/json` without trailing slash / `extract/full/json`):** returned
  404 — path format incorrect. The API syntax table shows format `extract/${FORMAT}/?EGRID=...` (with
  trailing slash). Retry: `curl "https://api.geo.ag.ch/v2/oereb/extract/json/?EGRID=CH959823775233"`.
- **SO ÖREB GetEGRID:** returned server error on two attempts ("Unbekannter Server Fehler") — may be
  transient or the test coordinates were invalid. Do not re-run with same coordinates.
- **`bfs.admin.ch/bfs/de/home/register/.../merkmale-gwr.html`:** 404 — URL has changed. Use
  `housing-stat.ch/files/Data_de.pdf` or `housing-stat.ch/de/docs/index.html` instead.
- **ZG Nutzungsplanung WFS GetFeature:** geo-blocked from non-DACH IPs. Do not retry from the same
  origin — requires DACH IP or on-premises Swiss server.

---

## 8 — THE SMALLEST NEXT STEP

From a DACH-region server or Swiss IP, run:
```bash
curl "https://geodienste.ch/db/npl_nutzungsplanung_v1_2_0/deu?SERVICE=WFS&VERSION=2.0.0\
&REQUEST=GetFeature&TYPENAMES=ms:grundnutzung&COUNT=1&outputFormat=application/json" \
| jq '.features[0].properties | keys'
```
This one call confirms whether Nutzungsziffer (FAR) is a structured WFS attribute. If YES: build-rule
rate rises to ~35–45% and Phase 1 can be scoped for a pilot municipality. If NO: clarifies that FAR
remains PDF-only and the transcription-pipeline question (L-449) becomes the rate ceiling gate.
