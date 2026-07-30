# NEXT — Italy (`it`)

> **Last updated:** 2026-07-24 · **Maintainer:** UNASSIGNED · **Status:** RESEARCH COMPLETE — live probe session run 2026-07-24; several blockers resolved or partially resolved; no packs started

---

## 1 — WHERE WE STOPPED (the one-paragraph truth)

The Italy master study is complete at the mechanism-characterisation level, and a live-probe session
was run on 2026-07-24. **Catasto WFS is fully confirmed live and public** (URL correction: `owfs01.php`,
not `ows01_CXF.php`). Bolzano's GeoServer WMS is confirmed live at `geoservices1.civis.bz.it`; a
ZoningPlan WFS is confirmed in metadata (CC0, updated daily) but could not be confirmed live from
Replit's IP range. ARPA Piemonte Edifici 3D WMS is confirmed live; height field name not yet
confirmed. Turin PRG "Zone di Piano" WMS is confirmed live (updated 2025-06-30); zip vector download
is restricted. SITAP/APAR remains unreachable from Replit. Lombardy PGT WFS endpoint not found.
The next concrete step is to test the Bolzano WFS from a non-Replit IP, read Turin PRG NTA (B2),
and confirm ARPA Piemonte height field name by probing the FeatureServer from a browser.

---

## 2 — THE NUMBER (what % of clicks, which denominator, and why)

**Full-envelope resolution: 0% (not started).** National rate estimate: ~9–11% (see `RATE.md`).
Denominator: all Italian parcels outside AP Trento and Bolzano (covered by Agenzia delle Entrate
Catasto WFS). **Catasto parcel geometry is now live-probe confirmed** (2026-07-24). All zoning,
height, and floor-area figures remain research-level estimates — no operative rule value has been
confirmed by live probe.

---

## 3 — BLOCKERS (ordered by dependency)

### B0 — AP Bolzano WFS ZoningPlan — partially confirmed; public access unverifiable from Replit

**LIVE PROBE RUN 2026-07-24. Status: PARTIALLY RESOLVED — WMS live; WFS timed out from Replit.**

- **What is now confirmed:**
  - **GeoServer WMS LIVE:** `https://geoservices1.civis.bz.it/geoserver/p_bz-TerritorialPlans/ows` responds with full GetCapabilities. Key planning layers: `LandscapePlan-Zoning` (Zonierung/Zonizzazione), `LandscapePlan-LandCover`, `CivilProtectionPlan`. Service title: "Web Map Service: R28" (Abteilung Natur, Landschaft und Raumentwicklung).
  - **ZoningPlan metadata confirmed (CC0):** INSPIRE record `p_bz:TerritorialPlans:UrbanPlan-ZoningPlan` (geonetwork1.civis.bz.it) confirms: CC0 licence, no public access limitations, updated **daily**, scale 1:5000, CRS ETRS89/ETRS-TM32, distribution format WMS 1.3.0.
  - **INSPIRE LandUse.ZoningElement record (2024):** `p_bz:Inspire:LandUse.ZoningElement` (demo-geonetwork1.civis.bz.it, created 2024-03-15) confirms: distribution formats **WFS 2.0.0 + WMS 1.3.0**, CC0, biannual update, 1:5000. This is the INSPIRE-compliant zoning-element layer.
  - **NewPlan portal LIVE:** `https://newplan.civis.bz.it/` is a live OpenLayers-based viewer (current as of 2026-07-24). Frontend planning portal — login is available but not required to view.
  - **mapproxy is WMS-only:** `geoservices.buergernetz.bz.it/mapproxy/ows` confirmed WMS-only (no WFS). Old `geoservices.buergernetz.bz.it/geoserver` returns 404.
  - **Correct GeoServer host:** `geoservices1.civis.bz.it` (note the `1`; the old `geoservices.buergernetz.bz.it/geoserver` path is dead).
- **What remains unconfirmed:** WFS GetCapabilities on the GeoServer timed out from Replit — unable to confirm which feature type names carry the zoning polygon layer, or whether WFS is accessible without login. The INSPIRE metadata says WFS 2.0.0 exists; the specific WFS endpoint URL for the ZoningElement layer is not in the metadata record retrieved.
- **THE EXACT RESUME STEP (updated).**
  ```bash
  # Try the GeoServer WFS from outside Replit (browser or curl from non-Replit IP)
  curl "https://geoservices1.civis.bz.it/geoserver/p_bz-TerritorialPlans/ows?\
  SERVICE=WFS&VERSION=2.0.0&REQUEST=GetCapabilities" \
    | grep -iE '<Name>|FeatureType' | head -40
  # If successful, run a GetFeature for Bolzano city centre bbox
  # Bolzano centre: lat 46.4983, lon 11.3548 (ETRS-TM32 approx: E 686000, N 5151000)
  # Also try the INSPIRE endpoint from demo-geonetwork1:
  curl "https://geoservices1.civis.bz.it/geoserver/p_bz-Inspire/ows?\
  SERVICE=WFS&VERSION=2.0.0&REQUEST=GetCapabilities" | grep -i 'Name' | head -30
  ```
  Confirm: (1) WFS layer name for zoning polygons; (2) whether zone-type and building-parameter attributes are present in the feature properties; (3) licence is CC0 (already confirmed in metadata).

### B1 — Catasto WFS — ✅ RESOLVED (live-probed 2026-07-24)

**CONFIRMED LIVE AND PUBLIC. No authentication required. URL corrected in all files.**

- **Confirmed endpoint:** `https://wfs.cartografia.agenziaentrate.gov.it/inspire/wfs/owfs01.php`
  ⚠️ **URL CORRECTION:** All prior docs used `ows01_CXF.php` — that path does NOT work. Correct file is `owfs01.php`. This correction has been applied to `SOURCES.md`.
- **Feature types confirmed:**
  - `CP:CadastralParcel` (Particelle) — individual cadastral parcel polygons
  - `CP:CadastralZoning` (Mappe) — cadastral sheet (foglio) boundaries
- **Default CRS:** EPSG:6706 (GRS80 geographic). **BBOX axis order is lat_min,lon_min,lat_max,lon_max** (not the GeoJSON/WGS84 lon/lat order — this is the critical implementation gotcha).
- **Fields on `CP:CadastralParcel`:**
  - `msGeometry` — polygon geometry
  - `INSPIREID_LOCALID` — e.g. `IT.AGE.PLA.L219_128000.1`
  - `INSPIREID_NAMESPACE` — e.g. `IT.AGE.PLA.`
  - `LABEL` — parcel number within the foglio (e.g. `1`)
  - `NATIONALCADASTRALREFERENCE` — foglio + particella (e.g. `L219_128000.1` for Turin foglio 128000 particella 1)
  - `ADMINISTRATIVEUNIT` — ISTAT municipality code (e.g. `L219` = Turin, `F205` = Milan, `H501` = Rome)
- **Confirmed live for:** Turin (`L219`), Milan (`F205`), Rome (`H501`) — GetFeature returns real parcel polygons with full geometry at all three locations.
- **Licence:** CC BY 4.0 (confirmed in GetCapabilities `<ows:Fees>` field).
- **Pagination:** supported via `COUNT` + `STARTINDEX`; `next` URL in response for continuation.
- **No auth required:** response arrives without any API key or token.
- **Remaining gap:** `CP:CadastralZoning` (sheet-level boundaries) and `CP:CadastralParcel` are the only two feature types — no zone/planning data is in the Catasto WFS itself.

### B2 — Turin PRG NTA primary text not read (gate for Tier 1 classification) — UPDATED: now a moving target

- **What it is.** The entire Tier 1 categorisation of Turin rests on an *unconfirmed assumption*
  that the current Torino PRG Norme Tecniche di Attuazione still uses DM 1444-style zone letters
  (`A`, `B`, `C`, etc.) with per-zone numeric tables for height, coverage, and density. The PRG
  NTA primary text was not directly read in the research pass.
- **NEW additional risk:** Turin's PRG is **actively being rewritten in 2026**. A "regime di
  salvaguardia" is in effect following adoption of the preliminary revision (DCC 123, March 16,
  2026). The new plan is reportedly being condensed from 260 to ~80 pages. Any dev-day estimate
  built on Turin's zone-letter mechanism needs to check whether the *incoming* plan keeps or drops
  the letter scheme — this could go either direction. The Tier 1 rating is now **~12%
  (contingent, and currently a moving target)**.
- **Why it blocks.** If the incoming plan drops zone letters entirely and adopts a bespoke
  mechanism, Turin moves from Tier 1 to Tier 2 — dev-day estimate roughly doubles. Committing a
  budget before this check risks building against a plan mid-revision.
- **What would unblock it.** (1) Read the outgoing PRG NTA from `comune.torino.it/urbanistica`
  to confirm current zone-letter mechanism; (2) read the DCC 123 preliminary revision text to
  assess what zone classification structure the incoming plan will use; (3) confirm "regime di
  salvaguardia" scope — does it freeze the outgoing plan's operative rules while the new plan is
  adopted, or does it create a gap?
- **THE EXACT RESUME STEP.** Navigate to `comune.torino.it/urbanistica` → Piano Regolatore
  Generale → Norme Tecniche di Attuazione. Download the consolidated NTA PDF. Read Art. 1–15
  (typically: classification by zone type) and the first numeric table. Record zone letters used
  and whether they map directly to DM 1444 `A`/`B`/`C` or have been replaced by local mnemonics.
  Then: search `comune.torino.it` for "DCC 123 2026" and "variante PRG" to locate the preliminary
  revision text and assess its zone-classification structure.

### B3 — Turin PRG zoning — WMS confirmed live; vector download restricted; PRG revision still unread

**PARTIALLY UPDATED 2026-07-24 (live probe session).**

- **Turin PRG WMS confirmed live:** `https://geomap.reteunitaria.piemonte.it/ws/siccms/coto-01/wmsg01/wms_sicc23_prg_azzonamento` — GetCapabilities returns successfully. Layers confirmed: `PRGAzzonamento` (root group), `PUSP` (Progetti unitari su suolo pubblico), `AreeDiPiano`, `ZonediPiano`, `LimitiZoneDiPiano`. Service title: "Città di Torino — PRG Azzonamento". Operator: Comune di Torino via Rete Unitaria Piemonte.
- **"Zone di Piano" dataset currency:** metadata record `c_l219:71bd559a-de54-4ebc-84c4-4c304a53a720` (Comune di Torino) shows date-of-revision **2025-06-30** — very recently updated. INSPIRE theme: Land Use. Keywords: PRG, zone di piano, azzonamento.
- **Vector download status:** `http://geoportale.comune.torino.it/sec/zip/zone_di_piano.zip` — labelled "accesso riservato" (restricted access). WMS is public for visualization; the vector layer download requires a Comune di Torino institutional login.
- **Piedmont regional WFS:** `geoportale.piemonte.it/geoserver/ows` timed out / returned empty from Replit. The regional PRG mosaic WFS could not be probed. Piedmont's regional portal has 174 WFS records but the specific PRG mosaic WFS feature type name was not confirmed. The "Mosaicatura PRG (Storico)" record is explicitly labelled historical.
- **What remains unresolved:** (1) The Piedmont regional WFS layer name for the current PRG mosaic (as distinct from the historic raster mosaic); (2) whether a non-restricted WFS endpoint for Turin's "Zone di Piano" layer exists; (3) the PRG NTA text and DCC 123 revision structure (B2 — unchanged).
- **THE EXACT RESUME STEP (updated).**
  - To get Turin vector zoning data: request "accesso riservato" access to `zone_di_piano.zip` from Comune di Torino geoportal. Alternatively: check if the WMS supports GetFeatureInfo on the `ZonediPiano` layer (which could return zone attributes from the public WMS without vector download).
  - To probe Piedmont regional mosaic: try `https://www.geoportale.piemonte.it/geoserver/Urbanistica/ows?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetCapabilities` from a non-Replit IP (direct curl or browser).

### B4 — Lombardy Geoportale PGT WFS queryability unconfirmed (Milan prerequisite)

- **What it is.** Lombardy's regional Geoportale hosts the PGT documentary and cartographic
  archive for every Lombard comune, and Milan's own `pgt.comune.milano.it` publishes the NTA
  text and tavole. Whether either source exposes a **parcel-level zone-polygon WFS** (returning
  the relevant Piano delle Regole zone for a given coordinate) versus map-service-only is
  unconfirmed.
- **Why it blocks.** Milan's new engine kind (territorial index + perequation) cannot be scoped
  precisely until we know whether the Plan delle Regole zone boundary is machine-queryable per
  parcel or only available as a rendered PDF map.
- **THE EXACT RESUME STEP.** Check Geoportale Lombardia WFS capabilities for a Milan bbox:
  ```bash
  curl "https://www.geoportale.regione.lombardia.it/geoserver/wfs\
  ?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetCapabilities" | grep -i 'pgt\|piano\|zona\|urb'
  ```

### B5 — APAR/SITAP WFS public-access status — confirmed unreachable from Replit

**PROBE RUN 2026-07-24. Status: BLOCKED FROM REPLIT. Public access still unconfirmed.**

- **Probe result:** Both `sitap.cultura.gov.it` and `sitap.beniculturali.it` returned empty responses from Replit's IP range. Neither ArcGIS REST (`/arcgis/rest/services?f=json`) nor OGC WFS paths could be reached. The service may block cloud/datacenter IP ranges, may require VPN, or may simply be unreliable.
- **What remains unconfirmed.** Whether the APAR/SITAP WFS is public or MiBACT-restricted. The OGC upgrade (WFS 2.0.0 + WMS) is confirmed in documentation; public access is not.
- **THE EXACT RESUME STEP (updated).** Test from a residential/office IP (not a cloud host):
  ```bash
  curl "https://sitap.cultura.gov.it/geoserver/wfs?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetCapabilities" \
    | grep -i 'Name\|Title\|vincolo\|paesaggio' | head -20
  # Or try the ArcGIS REST path:
  curl "https://sitap.cultura.gov.it/arcgis/rest/services?f=json" | head -40
  ```
  Alternatively: send an email to the SITAP team (`cartografia@cultura.gov.it`) asking for the public OGC endpoint — the guida v2.0.0 was distributed publicly so a public endpoint may exist but require registration.

### B6 — ARPA Piemonte Edifici 3D — WMS and FeatureServer confirmed; height field name still needed

**PARTIALLY RESOLVED 2026-07-24.**

- **Confirmed live endpoints:**
  - **WMS:** `https://webgis.arpa.piemonte.it/ags/services/topografia_dati_di_base/Edifici_3D_2017/MapServer/WMSServer` — GetCapabilities responds. Layer: "Edifici 3D 2017" (layer ID 0). Style: default.
  - **ArcGIS REST FeatureServer:** `https://webgis.arpa.piemonte.it/ags/rest/services/topografia_dati_di_base/Edifici_3D_2017/FeatureServer/0` — responds, supports pagination, statistics, advanced queries, datum transformation.
  - CRS: EPSG:32632 (WGS84 / UTM Zone 32N).
  - Geometry type: `esriGeometryPolygon` (building footprints, not volumetric mesh).
  - **Field `USO` confirmed:** building use type — P = Produttivo, R = Residenziale, S = Servizi.
- **What remains unconfirmed:** height-related field name(s). The FeatureServer endpoint timed out before returning the full field schema from Replit. The dataset is called "3D" and derives from BDTRE — a height field exists, but its attribute name (`QUOTA_MEDIA`, `ALTEZZA`, `Z_MAX`, or similar) was not confirmed in this probe session.
- **Year:** 2017 dataset. May be outdated for new construction since 2017. Check if a more recent version exists on the geoportal.
- **THE EXACT RESUME STEP (updated).**
  ```bash
  # Get the full field schema from a browser or non-Replit curl:
  curl "https://webgis.arpa.piemonte.it/ags/rest/services/topografia_dati_di_base/Edifici_3D_2017/FeatureServer/0?f=json" \
    | python3 -m json.tool | grep -A2 '"name"' | grep -v 'name.*Shape\|OBJECTID' | head -60
  # Then run a sample query for one Turin bbox to see actual height values:
  # Approximate bbox in EPSG:32632: xmin=390000, ymin=4990000, xmax=395000, ymax=4995000
  curl "https://webgis.arpa.piemonte.it/ags/rest/services/topografia_dati_di_base/Edifici_3D_2017/FeatureServer/0/query?geometry=390000,4990000,395000,4995000&geometryType=esriGeometryEnvelope&spatialRel=esriSpatialRelIntersects&outFields=*&returnGeometry=false&f=json&resultRecordCount=3" | python3 -m json.tool | head -60
  ```

---

## 4 — TRIP-WIRES (if you see X elsewhere, come back HERE and do Y)

- **4.1 — If a national Italian zoning WFS is announced or discovered** → treat as the GPU
  equivalent for Italy; re-evaluate the national rate and update `RATE.md`. Check UrbisMap or
  PgtOnLine for a newly published open tier.
- **4.2 — If CNIG SRU (France) reaches broad adoption** → revisit whether Italy has a parallel
  initiative (none found in this pass); search for "standard urbanistico italiano" or
  "SIT comunale nazionale" before declaring absent again.
- **4.3 — If any other Italian region is targeted** → that region is Tier 3 by default; a
  dedicated research pass on its regional planning law and geoportal status is required before
  any dev-day estimate can be given. Do not assume the PRG or DM 1444 mechanism applies without
  checking the region's own law. Use EU INSPIRE Geoportal as first discovery step before crawling
  regional portals.
- **4.4 — If the Agenzia delle Entrate Feb 2025 bulk download includes zone data** → update B1
  and reassess national rate. The bulk download was confirmed for parcels and addresses; zone
  data is separately unlikely but worth checking if the download manifest is read.
- **4.5 — If AP Trento is ever targeted** → requires entirely separate cadastral integration
  (not the national WFS). Start from scratch; do not port any national Italy integration.
- **4.5b — If AP Bolzano (South Tyrol) is targeted** → do NOT treat as a standard Tier 3 case.
  Read B0 above first. South Tyrol may be the easiest Italian jurisdiction in the entire study;
  NewPlan probe is the first step, not a regional-instrument research pass.
- **4.6 — If Turin PRG NTA confirms DM 1444 zone letters in the *incoming* plan (post-DCC 123)** →
  port the German B-Plan zone-letter reader concept (BauNVO→GRZ/GFZ equivalent) to Italy's mc/mq
  density metric. The abstraction is similar; field units differ (mc/mq vs GFZ ratio). Update
  Turin NEXT.md B2 as resolved.
- **4.7 — If Milan's perequation ledger is found as queryable GIS** → the biggest structural
  uncertainty for Milan (which parcels have already transacted rights, at what volume) may
  become engineering-tractable. Update Milan NEXT.md immediately.
- **4.8 — If any Italian comune's zoning shapefile is found via EU INSPIRE Geoportal** → check
  `Spatial representation type` metadata field before treating as structured data: `Grid` = raster
  scan (not usable for zone identification); `Vector` = potentially usable (still check currency).
  Do not assume "found on INSPIRE = current legal vector layer."
- **4.9 — If Emilia-Romagna zoning WFS is confirmed (not just topography)** → update zone
  identification score for that region and check if any Emilia-Romagna cities become viable
  Tier 1 candidates (PUG mechanism — research still needed on NTA structure).
- **4.10 — If Lombardy Indagine Offerta PGT schema probe (B8) shows parcel-level granularity** →
  update indice di fabbricabilità score from ~0% to a non-zero Lombardy figure; revisit Milan
  rate estimate.

---

## 5 — WHAT IS ALREADY BUILT (do not redo)

- Full mechanism characterisation — `findings/ITALY-MASTER-DATA-SOURCE-STUDY.md`
- National floor rules documented — `README.md §1.3 and §2.5` / `sources/SOURCES.md §A`
- Regional-instrument map — `README.md §1.2`
- Three-tier sequencing recommendation — `README.md §1.5`
- City deep-dives (Milan, Rome, Turin) with dev-day estimates — `findings/` and each city's `README.md`

---

## 6 — VERIFIED SOURCES

| Source | Answers | Tier | Exact query / note |
|---|---|---|---|
| **Catasto WFS** `https://wfs.cartografia.agenziaentrate.gov.it/inspire/wfs/owfs01.php` | Parcel geometry, nationwide (ex-APs) | **VERIFIED-LIVE (2026-07-24)** | Feature types: `CP:CadastralParcel`, `CP:CadastralZoning`. Fields: `NATIONALCADASTRALREFERENCE`, `ADMINISTRATIVEUNIT`, `LABEL`. CRS: EPSG:6706. Bbox: lat_min,lon_min,lat_max,lon_max. No auth. CC BY 4.0. Confirmed for Turin (L219), Milan (F205), Rome (H501). |
| Agenzia delle Entrate bulk download (Feb 2025) | Parcels + addresses nationwide | VERIFIED-LEAD | Open data portal — format TBD |
| DM 2 aprile 1968 n. 1444 | Zone taxonomy (A–F) + density/distance ceilings | `published` | `normattiva.it` → DM 1968/1444 |
| Codice Civile Art. 873 | National minimum boundary setback (3 m) | `published` | `normattiva.it` → CC Art. 873 |
| DPR 380/2001 (Testo Unico Edilizia) Art. 2-bis | Regional derogation regime for building distances | `published` | `normattiva.it` → DPR 380/2001 Art. 2-bis |
| D.Lgs. 42/2004 (Codice Beni Culturali) | Heritage and landscape protection basis | `published` | `normattiva.it` → D.Lgs. 42/2004 |
| APAR/SITAP `sitap.cultura.gov.it` | Landscape constraints — confirmed OGC WMS+WFS (APAR re-engineering) | VERIFIED-LEAD (WFS access method confirmed in documentation; **unreachable from Replit** — public access from residential/office IP still TBD) | Guida v2.0.0 confirms OGC alignment; both `sitap.cultura.gov.it` and `sitap.beniculturali.it` returned empty from Replit 2026-07-24 |
| Vincoli in Rete | Listed buildings + archaeological assets (D.Lgs. 42/2004 Parts II-III) | VERIFIED-LEAD | Freely consultable — programmatic endpoint TBD |
| **ARPA Piemonte Edifici 3D** | Per-building footprints + use type (USO field); height field name TBD | **PARTIALLY VERIFIED-LIVE (2026-07-24)** | WMS live: `webgis.arpa.piemonte.it/ags/services/topografia_dati_di_base/Edifici_3D_2017/MapServer/WMSServer`. FeatureServer: `/FeatureServer/0`. CRS: EPSG:32632. Field `USO` confirmed (P/R/S). Height field name TBD — FeatureServer timed out from Replit before full schema returned. |
| PST/SIM terrain — MASE | DTM/DSM, 25 cm resolution, CC BY 4.0 (PNRR 2026 target: 100%) | `published` | MASE open data portal |
| **Turin PRG "Zone di Piano" WMS** | Turin zoning polygons — WMS visualization | **PARTIALLY VERIFIED-LIVE (2026-07-24)** | WMS endpoint: `geomap.reteunitaria.piemonte.it/ws/siccms/coto-01/wmsg01/wms_sicc23_prg_azzonamento`. Layers: `ZonediPiano`, `LimitiZoneDiPiano`, `AreeDiPiano`, `PUSP`. Dataset updated **2025-06-30**. Vector download (`zone_di_piano.zip`) is **accesso riservato** — institutional login required. WFS not confirmed. |
| EU INSPIRE Geoportal | Free federated discovery of per-comune plan records across all 21 Italian planning regimes | VERIFIED-LEAD (discovery; each record requires individual format/currency verification) | `https://inspire-geoportal.ec.europa.eu` — search by comune name + plan type |
| dati.gov.it + RNDT | Free public discovery of municipal plan PDF links; RNDT metadata → INSPIRE | VERIFIED-LEAD (discovery only) | `https://geodati.gov.it/geoportale/` (RNDT) |
| OpenBuildingMap | National modeled building height (JRC-derived, 2025) | `inferred` — modeled; NOT shippable as legal/surveyed claim | `https://openbuildingmap.org` — must be flagged as modeled |
| OSM Italy | Building footprints, ODbL, ~2.1 GB extract | `corroborated (completeness uneven)` | `https://download.geofabrik.de/europe/italy.html` |
| **AP Bolzano GeoServer TerritorialPlans** | Landscape plans, zoning, civil protection — WMS live | **PARTIALLY VERIFIED-LIVE (2026-07-24)** | WMS: `https://geoservices1.civis.bz.it/geoserver/p_bz-TerritorialPlans/ows`. Layers: `LandscapePlan-Zoning`, `LandscapePlan-LandCover`, `CivilProtectionPlan`. CC0. WFS timed out from Replit. INSPIRE ZoningElement record confirms WFS 2.0.0 distribution. ZoningPlan dataset: CC0, daily update, 1:5000. |
| Lombardy Indagine Offerta PGT | SLP floor-area figures by function for every Lombard comune | VERIFIED-LEAD (existence confirmed; schema TBD) | Geoportale Lombardia or ARIA S.p.A. open data — see B8 |

---

## 7 — DEAD ENDS (measured negatives — do NOT re-run hoping)

- **National structured zoning WFS:** no Italian equivalent of France's GPU WFS or Germany's
  XPlanung national/regional service was found. Do not search for one under the assumption it
  exists under a different name without a fresh targeted search — the private-aggregator market
  (UrbisMap, PgtOnLine) is the strongest available evidence of the gap.
- **DM 1444 zone letters as a universal query key for Milan and Rome:** both cities have
  operationally abandoned the DM 1444 taxonomy. Querying "which DM 1444 zone applies here" for
  a Milan or Rome parcel is not the right question and will not produce a usable operative rule.
- **National LoD2 building model:** PST/SIM produces terrain/surface only. No national
  building-height/semantic-building product was found. Do not re-search for a ZSHH-equivalent
  Italian federal body — one was not identified and the absence appears structural.
- **Tuscany regional zoning as vector data:** Tuscany's PRG data is delivered as PDF-format
  scanned maps, not vector — confirmed negative. Do not probe Tuscany geoportal expecting
  structured zone polygons.
- **Puglia PUG as a feature service:** Puglia's PUG zoning layer is a planning-status tracker
  (which comuni have adopted/approved), not a queryable per-parcel feature service — confirmed
  negative for zone identification purposes.
- **Catasto WFS URL `ows01_CXF.php`:** the path documented in all prior research is dead. Correct path is `owfs01.php`. Do not retry the old path.
- **`geoservices.buergernetz.bz.it/geoserver`:** returns 404. Dead. The live GeoServer is at `geoservices1.civis.bz.it/geoserver` (note the `1`).
- **Bolzano mapproxy WFS:** `geoservices.buergernetz.bz.it/mapproxy/ows` is WMS-only — confirmed WFS rejection. Do not probe it expecting WFS.
- **SITAP from Replit IP range:** both `sitap.cultura.gov.it` and `sitap.beniculturali.it` are unreachable from Replit (cloud datacenter IP). Must probe from residential/office IP.
- **Piedmont regional GeoServer WFS from Replit:** `geoportale.piemonte.it/geoserver/ows` and workspace-specific paths returned empty. Likely blocked from Replit IP. Must probe from browser or non-Replit curl.
- **Lombardy Geoportale GeoServer WFS:** `geoportale.regione.lombardia.it/geoserver/...` paths return 404 or page-not-found HTML. No GeoServer WFS access path confirmed.
- **Turin vector zoning zip download (public):** `zone_di_piano.zip` at Comune di Torino is "accesso riservato" — institutionally gated. Public WMS only; no public WFS or zip for zone polygon geometry.

---

## 8 — THE SMALLEST NEXT STEP that moves the number, and its cost

**After the 2026-07-24 probe session, the landscape has changed. Revised priority order:**

1. **Catasto WFS (B1) is RESOLVED.** No further action needed. Parcel geometry access is confirmed.

2. **Bolzano WFS from a non-Replit IP (B0 — 0.25 dev-days).** The GeoServer WMS is live; the ZoningPlan WFS is confirmed in INSPIRE metadata as existing (CC0, daily updates, 1:5000). The WFS GetCapabilities timed out from Replit but this is almost certainly an IP-range block, not a service outage. One curl from a browser or office machine confirms or denies the WFS layer name and whether zone-type attributes are present. If confirmed, Bolzano is Tier 0 — before Turin in priority.

3. **ARPA Piemonte Edifici 3D height field name (B6 — 0.1 dev-days).** The FeatureServer endpoint is confirmed live. Open `https://webgis.arpa.piemonte.it/ags/rest/services/topografia_dati_di_base/Edifici_3D_2017/FeatureServer/0?f=json` in a browser and read the `fields` array to find the height field name (expect `QUOTA_MEDIA` or `ALTEZZA`). Run one sample query. This directly enables Turin's height context layer.

4. **Turin PRG NTA text (B2 — 0.5 dev-days).** Navigate `comune.torino.it/urbanistica` → NTA PDF. Read Art. 1–15 to confirm or deny zone-letter mechanism in the *outgoing* PRG. Then check DCC 123 preliminary revision text for the *incoming* mechanism. This determines Tier 1 vs. Tier 2 classification.

5. **APAR/SITAP from non-Replit IP (B5 — 0.25 dev-days).** Test `sitap.cultura.gov.it` OGC endpoints from a residential IP. Both Replit-accessible paths returned empty — this is the one probe that *must* be done outside Replit.

6. **Lombardy Indagine Offerta PGT schema (B8 — 0.25 dev-days).** Independent of all the above; direct download from Geoportale Lombardia or ARIA open data.

**After steps 2 + 3 + 4 are completed, Italy moves from "live-probe session done" to "Tier 1 candidate (Turin) ready to estimate." The realistic dev-day estimate for a Turin pack can be committed once B2 (NTA text) is read.**

---

## 9 — §PROBE — Phase-3 C63 composite-RATE first moves (probe → wire → verify)

> Companion to [`RATE-IMPLEMENTATION-PLAN.md`](./RATE-IMPLEMENTATION-PLAN.md) (the ROI-sequenced 7-axis climb).
> §CONTEXT-DATA-HONESTY: these are probe/wire steps — no cell moves until the backing state changes and the
> scorecard function (not a human) re-emits the axis number (C63 §1.1). Ordered by ROI, Phase A first.

- **Phase A — wire the cadastre (PARCEL + DATA-SOURCES, ~30 % of composite weight).** NO probe needed — the
  Agenzia Entrate WFS is **VERIFIED-LIVE 2026-07-24**. Wire `AgenziaEntrateParcelProvider.ts` as an `isInItaly`
  `kind:'cadastral'` row in `parcelProviders/registry.ts` (mirror ES `catastroParcelProvider`), add
  `ItalyJurisdictionResolver` (ISTAT routing), then draw a `computeParcelConfidence` sample per Rome/Milan bbox
  (C57 §2.4). **Verify:** sample returns `high` match + in-ring containment → PARCEL becomes measurable; DATA-SOURCES
  cadastre slot flips `documented`→`live`. Guard: exclude AP Trento/Bolzano (own cadastre).
- **Phase B — regional height adapters (HEIGHTS/LOD + DATA-SOURCES).** Probe first: ARPA Piemonte `Edifici_3D`
  field name (§8 step 3) + Lombardia/Veneto/Emilia nDSM/DBT schemas. Then wire `ItalyHeightAdapter` through the
  **shared ES/FR/PT nDSM module** (DSM−DTM→P90; do NOT fork). **Verify:** tagged-height fraction in the baked bbox
  → HEIGHTS/LOD measurable; stamp `heightSource` so modeled ≠ surveyed.
- **Phase C — verify TINITALY terrain (TERRAIN 50→100).** No new bake — run `terrain.verify.mjs --tileset` round-trip
  for `rome` + `milan`, confirm deployed `layer.json` 200 + extent, and check `enableLighting`+octvertexnormals
  (L-636 white-mask guard). **Verify:** round-trip passes → TERRAIN rung 50→100, `validationState`→`cross-validated`.
- **Phase D — municipal envelope packs (LEGISLATION + ENVELOPE).** The human-gated cost; sequence
  Milano PGT → Bologna PUG → Torino PRG → Roma PRG → Firenze. Each NTA parameter passes the **L-449 gate** before it
  serves at `confidence: structured`. See §8 (steps 2/4/5) for the live-probe queue that de-risks Turin/Bolzano first.
