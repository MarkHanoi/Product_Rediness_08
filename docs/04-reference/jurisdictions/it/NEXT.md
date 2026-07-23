# NEXT — Italy (`it`)

> **Last updated:** 2026-07-23 · **Maintainer:** UNASSIGNED · **Status:** RESEARCH COMPLETE — no live probes run; no packs started

---

## 1 — WHERE WE STOPPED (the one-paragraph truth)

The Italy master study is complete at the mechanism-characterisation level. The three-layer structure
(national Catasto + regional instrument + municipal plan) is documented, the 21 regional-instrument
variants are mapped, the national floor rules (DM 1444, Codice Civile Art. 873, DPR 380/2001 Art.
2-bis) are cited, and the three target cities (Turin, Milan, Rome) are individually scoped with rough
dev-day estimates. No live probe has been run against any Italian endpoint — not the Catasto WFS,
not the Lombardy Geoportale, not the Piedmont PRG mosaic, not SITAP. The first engineering task for
any Italian city is therefore a **live-probe session** (Catasto WFS field schema + regional zoning
WFS status), followed immediately by reading Turin's PRG NTA primary text to confirm or disprove the
Tier 1 zone-letter assumption before any dev estimate is committed.

---

## 2 — THE NUMBER (what % of clicks, which denominator, and why)

**Full-envelope resolution: 0% (not started).** National rate estimate: ~8% (see `RATE.md`).
Denominator: all Italian parcels outside AP Trento and Bolzano (covered by Agenzia delle Entrate
Catasto WFS). Neither numerator nor denominator is measured from a live probe — all figures are
research-level estimates.

---

## 3 — BLOCKERS (ordered by dependency)

### B0 — AP Bolzano NewPlan not probed (potential Tier 0 — highest-value unverified lead)

- **What it is.** South Tyrol (AP Bolzano) runs NewPlan — a geographic information system for
  integrated management of territorial plans, unifying urban planning and landscape-constraint
  layers. The province makes geodata freely available via WMS/WMTS/WFS/WCS, CC0 by default, since
  2007. If the planning layer is public and parcel-queryable via WFS, this may be closer to
  Denmark's ~96% than Italy's ~8% — the strongest Italian jurisdiction found in any research pass.
- **Why it blocks.** If confirmed, Bolzano becomes Tier 0 (pre-Turin in implementation priority);
  the entire Italy tier list re-orders. If denied (geobrowser-only or institution-restricted), it
  reverts to a standard Tier 3 exception needing its own separate cadastral + planning integration.
- **What would unblock it.** (1) Confirm WFS endpoint for the planning/zoning layer exists and is
  publicly accessible; (2) run a GetFeature for a Bolzano parcel bbox and inspect whether zoning
  attributes (zone type, permitted height, density index) are present; (3) confirm CC0 licence
  applies to the planning layer specifically, not just base cartography.
- **THE EXACT RESUME STEP.**
  ```bash
  # Probe the South Tyrol geobrowser / WFS entry point
  curl "https://geokatalog.buergernetz.bz.it/geokatalog/" | head -40
  # Search for NewPlan WFS endpoint
  curl "https://geoservices.buergernetz.bz.it/mapproxy/ows?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetCapabilities" \
    | grep -i 'plan\|zona\|urb\|prg\|pct' | head -20
  # Alternative: check the GeoServer instance
  curl "https://geoservices.buergernetz.bz.it/geoserver/wfs?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetCapabilities" \
    | grep -i 'plan\|zona\|urb' | head -20
  ```

### B1 — Catasto WFS not live-probed (gate for ALL Italian parcel work)

- **What it is.** The Agenzia delle Entrate WFS (`wfs.cartografia.agenziaentrate.gov.it`) is
  confirmed at research level as CC BY 4.0 and covering the entire national territory (except
  AP Trento and Bolzano). Field schema, authentication requirements, and GetFeature response
  format have not been confirmed by direct query.
- **Why it blocks.** All downstream parcel-level work depends on confirmed parcel geometry
  access. If the WFS requires authentication or returns a non-standard schema, a different
  access path (bulk download from the Feb 2025 release) must be planned.
- **What would unblock it.** Run a GetCapabilities + one bbox GetFeature over a known Turin,
  Milan, or Rome parcel.
- **THE EXACT RESUME STEP.**
  ```bash
  # Step 1: GetCapabilities
  curl "https://wfs.cartografia.agenziaentrate.gov.it/inspire/wfs/ows01_CXF.php\
  ?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetCapabilities" | head -80

  # Step 2: GetFeature — one Turin parcel bbox (~45.0703, 7.6869 — central Turin)
  curl "https://wfs.cartografia.agenziaentrate.gov.it/inspire/wfs/ows01_CXF.php\
  ?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature\
  &TYPENAMES=cp:CadastralParcel\
  &BBOX=7.683,45.067,7.692,45.074,EPSG:4326\
  &SRSNAME=EPSG:4326&COUNT=3&OUTPUTFORMAT=application/json" | python3 -m json.tool | head -40
  ```

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

### B3 — Piedmont PRG mosaic WFS currency unconfirmed for Turin

- **What it is.** Piedmont's regional PRG mosaic WMS/WFS is documented as covering destinazioni
  d'uso, vincoli, and piani esecutivi — but with explicitly uneven currency. The metadata flags
  that provincial capitals and the metropolitan area were among the more recently updated zones,
  so Turin is *plausibly* better-covered than the regional average, but this is not confirmed.
- **Why it blocks.** Without knowing the WFS field schema and the date of the Turin layer, we
  cannot confirm whether a zone-letter query against the mosaic would return current, operative
  data or a stale snapshot.
- **THE EXACT RESUME STEP.** Live-probe the Piedmont geoportal WFS:
  ```bash
  curl "https://www.geoportale.piemonte.it/geoserver/wfs\
  ?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetCapabilities" | grep -i 'prg\|urb\|zona\|piano'
  # Then GetFeature for a Turin parcel bbox to inspect field names and data-currency metadata
  ```

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

### B5 — APAR/SITAP WFS public-access status unconfirmed (status upgraded from web-GIS-only)

- **What it is.** SITAP has been re-engineered as **APAR/SITAP** and now complies with OGC
  standards, delivering WMS and WFS cartographic services (confirmed in guida v2.0.0 documentation,
  behind `sitap.cultura.gov.it`). The data is genuine vector (polygon, line, point features) —
  not raster tiles. This is a material upgrade from the original "web-GIS only" characterisation.
- **What remains unconfirmed.** Whether the WFS endpoint is publicly accessible or restricted to
  MiBACT-affiliated users. The documentation was found as v2.0.0 guida text, not a confirmed open
  public endpoint probe.
- **Why it still blocks.** If public: heritage overlay becomes automatable via WFS per-parcel
  intersection — a meaningful pipeline step. If institution-restricted: same scrape/manual path as
  before.
- **THE EXACT RESUME STEP.** Probe the APAR/SITAP WFS endpoint directly:
  ```bash
  curl "https://sitap.cultura.gov.it/arcgis/rest/services?f=json" 2>/dev/null | head -40
  # If that 404s, try the legacy path:
  curl "https://sitap.beniculturali.it/arcgis/rest/services?f=json" 2>/dev/null | head -40
  # Or attempt OGC WFS GetCapabilities:
  curl "https://sitap.cultura.gov.it/geoserver/wfs?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetCapabilities" \
    | grep -i 'sitap\|vincolo\|paesaggio' | head -20
  ```

### B6 — ARPA Piemonte Edifici 3D endpoint and field schema unconfirmed

- **What it is.** ARPA Piemonte's Edifici 3D dataset (per-building volumetric footprints with
  mean elevation for all of Piedmont) is confirmed to exist and to derive height from BDTRE +
  terrain sources, with a per-building data-quality code. The actual WFS endpoint, field names,
  and the reliability of the height field for the Turin urban core specifically have not been
  live-probed.
- **Why it blocks.** Turin's building-height context data advantage (its key differentiator from
  Milan and Rome) cannot be confirmed until the endpoint is probed.
- **THE EXACT RESUME STEP.** Navigate to ARPA Piemonte open data portal (`opendata.arpa.piemonte.it`)
  → "Edifici 3D". Check download format and whether a WFS/WCS endpoint is available:
  ```bash
  curl "https://opendata.arpa.piemonte.it/api/3/action/package_search?q=edifici+3d" \
    | python3 -m json.tool | grep -E '"url|format|name"' | head -20
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
| Catasto WFS `wfs.cartografia.agenziaentrate.gov.it` | Parcel geometry, nationwide (ex-APs) | VERIFIED-LEAD (research-level; not live-probed) | `cp:CadastralParcel` type name — confirmed in research; GetFeature schema TBD |
| Agenzia delle Entrate bulk download (Feb 2025) | Parcels + addresses nationwide | VERIFIED-LEAD | Open data portal — format TBD |
| DM 2 aprile 1968 n. 1444 | Zone taxonomy (A–F) + density/distance ceilings | `published` | `normattiva.it` → DM 1968/1444 |
| Codice Civile Art. 873 | National minimum boundary setback (3 m) | `published` | `normattiva.it` → CC Art. 873 |
| DPR 380/2001 (Testo Unico Edilizia) Art. 2-bis | Regional derogation regime for building distances | `published` | `normattiva.it` → DPR 380/2001 Art. 2-bis |
| D.Lgs. 42/2004 (Codice Beni Culturali) | Heritage and landscape protection basis | `published` | `normattiva.it` → D.Lgs. 42/2004 |
| APAR/SITAP `sitap.cultura.gov.it` | Landscape constraints — confirmed OGC WMS+WFS (APAR re-engineering) | VERIFIED-LEAD (WFS access method confirmed in documentation; public access and schema TBD) | Guida v2.0.0 confirms OGC alignment; live probe of public access TBD |
| Vincoli in Rete | Listed buildings + archaeological assets (D.Lgs. 42/2004 Parts II-III) | VERIFIED-LEAD | Freely consultable — programmatic endpoint TBD |
| ARPA Piemonte Edifici 3D | Per-building height, surveyed (Piedmont region) | VERIFIED-LEAD (existence confirmed; endpoint TBD) | `opendata.arpa.piemonte.it` |
| PST/SIM terrain — MASE | DTM/DSM, 25 cm resolution, CC BY 4.0 (PNRR 2026 target: 100%) | `published` | MASE open data portal |
| EU INSPIRE Geoportal | Free federated discovery of per-comune plan records across all 21 Italian planning regimes | VERIFIED-LEAD (discovery; each record requires individual format/currency verification) | `https://inspire-geoportal.ec.europa.eu` — search by comune name + plan type |
| dati.gov.it + RNDT | Free public discovery of municipal plan PDF links; RNDT metadata → INSPIRE | VERIFIED-LEAD (discovery only) | `https://geodati.gov.it/geoportale/` (RNDT) |
| OpenBuildingMap | National modeled building height (JRC-derived, 2025) | `inferred` — modeled; NOT shippable as legal/surveyed claim | `https://openbuildingmap.org` — must be flagged as modeled |
| OSM Italy | Building footprints, ODbL, ~2.1 GB extract | `corroborated (completeness uneven)` | `https://download.geofabrik.de/europe/italy.html` |
| AP Bolzano geodata infrastructure | CC0 WMS/WMTS/WFS/WCS; NewPlan planning GIS | VERIFIED-LEAD (infrastructure confirmed; planning-layer WFS and access TBD) | `https://geokatalog.buergernetz.bz.it/` |
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

---

## 8 — THE SMALLEST NEXT STEP that moves the number, and its cost

**Run the AP Bolzano NewPlan probe (B0) in parallel with the APAR/SITAP WFS public-access
probe (B5). Estimated: 0.25 dev-days each = 0.5 dev-days total.**

B0 (Bolzano) is now the highest-value unverified lead because it is the one place that could
overturn the structural "Italy is worst-performing" conclusion for at least one jurisdiction. If
NewPlan WFS is confirmed public and parcel-queryable, Bolzano leaps to Tier 0, ahead of Turin.
If not, it clarifies as Tier 3 and Turin remains the cheapest candidate.

B5 (APAR/SITAP) is cheap and high-leverage: confirming public WFS access moves the heritage
overlay pipeline from web-GIS to programmable for all Italian cities simultaneously.

**After B0 and B5 are resolved:**
- If Bolzano confirmed: run a GetFeature probe over a sample Bolzano parcel bbox and inspect
  zone attribute fields → Bolzano becomes Tier 0; estimate dev-days for a NewPlan pack.
- If Bolzano denied: run Catasto WFS probe (B1) + Piedmont PRG mosaic probe (B3) for Turin
  (0.5 dev-days), then read Turin's outgoing NTA and DCC 123 revision text (B2) — a half-day
  PDF read that either confirms Tier 1 or reclassifies Turin to Tier 2.

The Lombardy Indagine Offerta PGT schema probe (B8) is a parallel low-cost task (0.25 dev-days)
that can run alongside either path above, as it is Milan-scoped and independent of Turin/Bolzano.
