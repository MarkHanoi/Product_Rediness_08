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

### B2 — Turin PRG NTA primary text not read (gate for Tier 1 classification)

- **What it is.** The entire Tier 1 categorisation of Turin rests on an *unconfirmed assumption*
  that the current Torino PRG Norme Tecniche di Attuazione still uses DM 1444-style zone letters
  (`A`, `B`, `C`, etc.) with per-zone numeric tables for height, coverage, and density. The PRG
  NTA primary text was not directly read in the research pass.
- **Why it blocks.** If the assumption holds, Turin is ~10–15 dev-days (zone-letter config, not
  a new engine kind). If Turin has drifted toward a Milan- or Rome-style bespoke mechanism, it
  becomes Tier 2 (~20–25 dev-days, new kind). Committing a budget before this check is the same
  category of mistake as assuming all German cities have live XPlanGML attributes without probing.
- **What would unblock it.** Locate and read Torino's current PRG NTA from the Comune di Torino
  official portal or the Piedmont regional mosaic. Specifically: find the zoning classification
  table and the per-zone building parameter articles.
- **THE EXACT RESUME STEP.** Navigate to `comune.torino.it/urbanistica` → Piano Regolatore
  Generale → Norme Tecniche di Attuazione. Download the consolidated NTA PDF. Read Art. 1–15
  (typically: classification by zone type) and the first numeric table. Record zone letters used
  and whether they map directly to DM 1444 `A`/`B`/`C` or have been replaced by local mnemonics.

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

### B5 — SITAP machine-readable endpoint not confirmed

- **What it is.** SITAP is described as a "web-GIS system" — its queryability as a
  programmatic WFS/WCS for per-parcel constraint intersection has not been confirmed.
- **Why it blocks.** If SITAP is WFS-queryable, the heritage overlay can be integrated into the
  parcel probe pipeline. If it is map-viewer-only, each parcel requires a human lookup or a
  headless browser scrape.
- **THE EXACT RESUME STEP.** Navigate to `sitap.beniculturali.it` and inspect network requests
  for WFS/WCS endpoints. Attempt:
  ```bash
  curl "https://sitap.beniculturali.it/arcgis/rest/services?f=json" 2>/dev/null | head -40
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
  checking the region's own law.
- **4.4 — If the Agenzia delle Entrate Feb 2025 bulk download includes zone data** → update B1
  and reassess national rate. The bulk download was confirmed for parcels and addresses; zone
  data is separately unlikely but worth checking if the download manifest is read.
- **4.5 — If AP Trento or Bolzano is ever targeted** → both require entirely separate cadastral
  integrations (not the national WFS). Bolzano also uses the PCTP instrument (not PRG/PGT/PUC).
  Start from scratch; do not port any national Italy integration.
- **4.6 — If Turin PRG NTA confirms DM 1444 zone letters** → port the German B-Plan zone-letter
  reader concept (BauNVO→GRZ/GFZ equivalent) to Italy's mc/mq density metric. The abstraction
  is similar; the field units differ (mc/mq vs GFZ ratio). Update Turin NEXT.md B2 as resolved.
- **4.7 — If Milan's perequation ledger is found as queryable GIS** → the biggest structural
  uncertainty for Milan (which parcels have already transacted rights, at what volume) may
  become engineering-tractable. Update Milan NEXT.md immediately.

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
| SITAP `sitap.beniculturali.it` | Landscape constraints (Artt. 136/157/142 D.Lgs. 42/2004) | VERIFIED-LEAD (web-GIS; programmatic endpoint TBD) | Web-GIS confirmed; WFS endpoint TBD |
| Vincoli in Rete | Listed buildings + archaeological assets (D.Lgs. 42/2004 Parts II-III) | VERIFIED-LEAD | Freely consultable — programmatic endpoint TBD |
| ARPA Piemonte Edifici 3D | Per-building height (Piedmont region) | VERIFIED-LEAD (existence confirmed; endpoint TBD) | `opendata.arpa.piemonte.it` |
| PST/SIM terrain — MASE | DTM/DSM, 25 cm resolution, CC BY 4.0 (PNRR 2026 target: 100%) | `published` | MASE open data portal |

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

---

## 8 — THE SMALLEST NEXT STEP that moves the number, and its cost

**Run the Catasto WFS probe (B1) and, in the same session, the Piedmont PRG mosaic probe (B3).
Estimated: 0.5 dev-days.**

This single session:
1. Confirms the national parcel geometry access path (WFS field schema, auth, response format).
2. Confirms whether the Piedmont PRG mosaic WFS returns zone letters for Turin parcels with
   current-date data.
3. Together, these two results determine whether Turin is an immediately startable Tier 1 city
   (zone + parcel accessible via API → read the NTA PDF for the numbers) or requires further
   research.

If both probes succeed, the next step is reading Turin's PRG NTA primary text (B2) — a half-day
PDF read that converts the Tier 1 assumption into a confirmed classification.
