# NEXT — Milan (015146, IT-25 Lombardy)

> **Last updated:** 2026-07-23 · **Maintainer:** UNASSIGNED · **Status:** SCAFFOLD — research complete; no live probes run; no pack started

---

## 1 — WHERE WE STOPPED (the one-paragraph truth)

Research is complete at the mechanism level. Milan's PGT Piano delle Regole structure is documented:
the dominant TUC (Tessuto Urbano Consolidato) mechanism uses a single citywide territorial-building-
rights index (0.35 mq/mq base, 0.70 mq/mq ceiling via perequation) — not a DM 1444 zone-letter
table. This is a structurally new engine kind with no existing analogue in the current rule schema.
The PGT NTA text is publicly accessible at `pgt.comune.milano.it`. The Lombardy Geoportale hosts the
PGT cartographic archive. No live probe has been run against either. The perequation ledger — which
determines how much of the 0.70 mq/mq ceiling any given parcel can access — is not confirmed as
publicly queryable GIS data and is the biggest structural unknown for this city. Estimate: ~20–25
dev-days for the TUC kind plus NTA sourcing, before certification, for the dominant TUC mechanism
only; ERS and agricultural carve-outs are separate smaller tasks.

---

## 2 — THE NUMBER (what % of clicks, which denominator, and why)

**Full-envelope resolution: 0% (not started).** Denominator: Milan parcels inside the TUC with a
confirmed lotto funzionale. Both numerator and denominator are unknown — the new engine kind must be
built and the PGT zone layer must be confirmed live before either can be measured.

---

## 3 — BLOCKERS (ordered by dependency)

### B1 — Lombardy Geoportale PGT WFS not probed (gate for zone identification)

- **What it is.** Lombardy's Geoportale hosts the PGT documentary and cartographic archive for every
  Lombard comune. Whether this archive is queryable as a WFS (returning the Piano delle Regole zone
  polygon for a given parcel centroid/bbox) versus map-service-only is unconfirmed.
- **Why it blocks.** Zone identification (TUC vs ERS vs agricultural) is the first classification
  step before any numeric rule can be applied. Without a confirmed WFS, zone lookup requires
  navigating the PGT tavole as map images.
- **What would unblock it.** Run a GetCapabilities + GetFeature against the Lombardy Geoportale WFS.
- **THE EXACT RESUME STEP.**
  ```bash
  # Step 1: GetCapabilities
  curl "https://www.geoportale.regione.lombardia.it/geoserver/wfs\
  ?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetCapabilities" \
    | grep -i 'pgt\|piano.regole\|zona\|urb\|misurc' | head -20

  # Step 2: GetFeature — central Milan bbox (~45.4654, 9.1859 — near Duomo)
  curl "https://www.geoportale.regione.lombardia.it/geoserver/wfs\
  ?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature\
  &BBOX=9.181,45.462,9.192,45.470,EPSG:4326\
  &SRSNAME=EPSG:4326&COUNT=3&OUTPUTFORMAT=application/json" \
    | python3 -m json.tool | head -60

  # Step 3: Check Milan's own PGT portal WFS (if separate)
  curl "https://pgt.comune.milano.it/wfs\
  ?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetCapabilities" 2>/dev/null | head -20
  ```

### B2 — PGT Piano delle Regole NTA not read as primary source

- **What it is.** The NTA (Norme Tecniche di Attuazione) of the Piano delle Regole is the primary
  legal text governing operative rules per zone. At research level: TUC base index = 0.35 mq/mq,
  ceiling = 0.70 mq/mq via perequation. ERS and agricultural exclusions confirmed. The primary
  text was not directly read.
- **Why it blocks.** The 0.35/0.70 figures cannot be shipped as `published` without reading the
  consolidated NTA primary text. Also: the NTA will contain setback, height, and footprint rules
  (in the RET and Plan delle Regole articles) that are not covered by the research pass.
- **What would unblock it.** Download the consolidated Piano delle Regole NTA PDF from
  `pgt.comune.milano.it`. Read the TUC articles, the perequation mechanism articles, and the ERS
  and agricultural zone articles. Record all numeric values with article citations.
- **THE EXACT RESUME STEP.** Navigate to `pgt.comune.milano.it` → Piano delle Regole → Norme
  Tecniche di Attuazione. Download the consolidated NTA (likely a PDF). Read:
  - Art. governing TUC classification and territorial index (0.35/0.70 mq/mq)
  - Art. governing perequation rights mechanism
  - Art. governing ERS zone rules
  - Art. governing setbacks (or cross-reference to RET)
  Record exact article numbers and text for each value.

### B3 — Perequation ledger public queryability unconfirmed

- **What it is.** The TUC ceiling (0.70 mq/mq) is only achievable through perequated rights
  accumulated via land trading, bonus mechanisms, and social-housing quotas. Which Milan parcels
  have already transacted rights — and for what volume — determines the operative ceiling for any
  given parcel. This ledger is not confirmed as publicly queryable GIS data.
- **Why it blocks.** Without the ledger, the ceiling answer for any TUC parcel is "0.35 mq/mq
  confirmed; 0.70 mq/mq achievable subject to ledger lookup." This may be the correct, honest
  answer — but it should be verified rather than assumed.
- **What would unblock it (ascending cost).**
  1. Check Milan's SIT (Sistema Informativo Territoriale) portal for a perequation/rights ledger layer — 0.5 days.
  2. Check `pgt.comune.milano.it` for a downloadable rights-ledger dataset — 0.5 days.
  3. Check whether commercial platforms (PgtOnLine, UrbisMap) expose this — 0.5 days.
  4. Direct enquiry to Comune di Milano Settore Urbanistica — 2–3 days (response time variable).
- **THE EXACT RESUME STEP.** Search `sit.comune.milano.it` and `pgt.comune.milano.it` for
  "perequazione", "indice territoriale", or "diritti edificatori" layer or dataset download.

### B4 — Lombardy RET setback rules not read

- **What it is.** The Regolamento Edilizio-Tipo (RET), Lombardy's building-code layer, governs
  setbacks (and potentially height calculation methods) for Milan. Multipliers and minimums not read.
- **THE EXACT RESUME STEP.** Navigate to `normelombardia.consiglio.regione.lombardia.it` → search
  "Regolamento Edilizio Tipo" → find setback article (likely titled "Distanze" or equivalent).
  Record multiplier (e.g. "0.4H") and minimum absolute distance.

### B5 — Lombardy building-height GIS layer unconfirmed

- **What it is.** Unlike Piedmont (ARPA Piemonte Edifici 3D confirmed), a Lombardy-wide
  building-height GIS layer has not been identified.
- **THE EXACT RESUME STEP.** Check Lombardy Geoportale WFS capabilities for "edifici 3d",
  "altimetria", or "modello 3D" layer:
  ```bash
  curl "https://www.geoportale.regione.lombardia.it/geoserver/wfs\
  ?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetCapabilities" | grep -i 'edifici\|altez\|3d\|lod'
  ```

---

## 4 — TRIP-WIRES (if you see X elsewhere, come back HERE and do Y)

- **4.1 — If the Lombardy Geoportale WFS returns PGT Piano delle Regole zone polygons with zone-type attribute** → Milan zone identification becomes an API call. Update B1 as resolved and move to B2.
- **4.2 — If the perequation ledger is found as a queryable public dataset** → Milan's ceiling answer becomes computable. Update B3 as resolved; the 0.70 mq/mq ceiling may be serviceable.
- **4.3 — If any other Lombard city is targeted** → the PGT Piano delle Regole WFS (if confirmed in B1) is reusable. Milan's engine kind covers the entire Lombard-PGT-using set of ~1,500 comuni.
- **4.4 — If the PGT Piano delle Regole NTA is amended post-2019** → check `pgt.comune.milano.it` for variant dates; the current consolidated version may have been updated. Do not use a non-consolidated text.
- **4.5 — If a national Italian machine-readable zoning standard emerges** → check whether Lombardy's PGT is included or if it remains outside any national schema (the instrument is Lombardy-specific so it may need a region-specific standard separately).

---

## 5 — WHAT IS ALREADY BUILT (do not redo)

- TUC territorial-index mechanism characterisation — `../../findings/ITALY-MASTER-DATA-SOURCE-STUDY.md §B.1`
- 0.35/0.70 mq/mq figures confirmed at research level — `sources/SOURCES.md §A`
- PGT three-document structure documented — `README.md §1`
- National Catasto WFS confirmed as parcel geometry source — `../../sources/SOURCES.md §A`

---

## 6 — VERIFIED SOURCES

| Source | Answers | Tier | Exact query / note |
|---|---|---|---|
| Catasto WFS `wfs.cartografia.agenziaentrate.gov.it` | Parcel geometry | VERIFIED-LEAD (research; not live-probed) | `cp:CadastralParcel` — see `../../sources/SOURCES.md` |
| `pgt.comune.milano.it` | PGT NTA text + tavole | VERIFIED-LEAD (portal confirmed; PDF not read) | Navigate → Piano delle Regole → NTA |
| Geoportale Regione Lombardia | PGT archive for all Lombard comuni | VERIFIED-LEAD (portal confirmed; WFS queryability TBD) | `www.geoportale.regione.lombardia.it` |
| L.R. Lombardia 12/2005 | PGT legal basis | `published` | `normelombardia.consiglio.regione.lombardia.it` |
| SITAP `sitap.beniculturali.it` | Landscape constraints | VERIFIED-LEAD (informational only) | Web-GIS; WFS endpoint TBD |
| Vincoli in Rete `vincoliinrete.beniculturali.it` | Listed buildings + archaeology | VERIFIED-LEAD | Freely consultable; programmatic queryability TBD |

---

## 7 — DEAD ENDS (measured negatives — do NOT re-run hoping)

- **DM 1444 zone letters as operative key for Milan:** confirmed in research that Milan's PGT has superseded the DM 1444 zone-letter mechanism for TUC parcels. Querying "which A/B/C zone applies" will not return an operative rule for most Milan parcels. Do not attempt to build a DM 1444-keyed lookup for Milan.
- **National zoning WFS for Milan:** no Italian national equivalent of France's GPU WFS exists (see country-level NEXT.md). Do not search for one before checking the Lombardy-specific Geoportale route.

---

## 8 — THE SMALLEST NEXT STEP that moves the number, and its cost

**Run the Lombardy Geoportale WFS probe (B1) and read the first 20 pages of the PGT Piano delle
Regole NTA (B2, partial). Estimated: 1 dev-day.**

B1 confirms whether zone identification is an API call or a PDF navigation problem, and determines
whether the new engine kind is immediately buildable or requires further data-access work. The
partial NTA read converts the research-level 0.35/0.70 figures into primary-source citations.
Together these two steps set the realistic dev-day estimate with much lower uncertainty than the
current ~20–25 range.
