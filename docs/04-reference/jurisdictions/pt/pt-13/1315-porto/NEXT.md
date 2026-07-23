# NEXT — Porto (`pt-13 / 1315-porto`)

> Last updated: 2026-07-23 · Maintainer: UNASSIGNED · Status: RESEARCH STUB

## 1 — WHERE WE STOPPED

Legal structure characterised at country level. Porto identified as second-priority city (after
Braga). Two unique structural features: moda da cércea (new rule kind required) and UNESCO World
Heritage ZEP overlay. Cadastral regime unresolved. No SNIT probe, no PDMP text read.

## 2 — THE NUMBER

**0%** of Porto parcel clicks get a full envelope. All zero.

## 3 — BLOCKERS

### B1 — Cadastral regime unconfirmed (P0)
- **Resume step:** Query DGT SNIC for Porto DICOFRE 1315. Porto is north of the Tagus — CGPR
  coverage historically concentrated south of the Tagus. Confirm before assuming coverage.

### B2 — Moda da cércea requires new C58 `fabricDerivedHeight` GeometricRule kind
- Porto's PDMP defines a fabric-derived height rule (the cércea value with greatest linear extent
  on the urban front). This cannot be expressed by any existing C58 §2.2 rule kind.
- **Resume step:** Read the Porto PDMP regulamento article defining "moda da cércea." Draft a C58
  amendment adding `fabricDerivedHeight` as a new `GeometricRule` kind. Get ADR approved. Only then
  author any Porto pack for moda-da-cércea zones.

### B3 — Índice de edificação definition (what "área de edificação" includes) not read
- Porto uses "índice de edificação" (not "índice de utilização") — the definitional formula at PDMP
  Art. 11 has not been read. Even the formula (what counts) needs per-PDM sourcing.
- **Resume step:** Read PDMP Art. 11 from Aviso n.º 12773/2021 (Diário da República) directly.

### B4 — DGPC ZEP for Porto Historic Centre not sourced
- UNESCO designation triggers DGPC ZEP over Ribeira/Barredo. Spatial extent unknown.
- **Resume step:** Live query DGPC Atlas do Património Classificado for Porto Historic Centre;
  download ZEP polygon; record extent and any ZNA sub-zones.

## 4 — TRIP-WIRES

- **If `fabricDerivedHeight` kind is added to C58** → Porto moda-da-cércea zones are unblocked.
  Return here and update pack status to "UNBLOCKED."
- **If Braga pack is authored and SNIT WFS pattern is confirmed** → Porto uses the same SNIT WFS;
  the Porto adapter can reuse the same infrastructure.
- **If the DGPC Atlas is confirmed live/queryable** → Porto Historic Centre ZEP is harvestable.

## 5 — WHAT IS ALREADY BUILT

Country-level: `pt/findings/PORTUGAL-MASTER-DATA-SOURCE-STUDY.md §B.2`.

## 6 — VERIFIED SOURCES

None live-probed for Porto specifically.

## 7 — DEAD ENDS

- Do NOT treat moda da cércea as a config value on an existing rule — it is a new rule kind.
- Do NOT assume Porto is CGPR-covered. Porto is north of the Tagus (CGPR was southern-focused).

## 8 — THE SMALLEST NEXT STEP

Confirm Porto's cadastral regime (0.25 dev-days). Then read moda da cércea governing article and
draft the C58 amendment (0.5 dev-days). Then probe SNIT WFS for Porto zone layer (0.5 dev-days).
Estimated total before first pack: ~15–20 dev-days after blockers resolved.
