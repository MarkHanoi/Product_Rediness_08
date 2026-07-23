# NEXT — Braga (`pt-03 / 0303-braga`)

> Last updated: 2026-07-23 · Maintainer: UNASSIGNED · Status: RESEARCH STUB — first-mover candidate

## 1 — WHERE WE STOPPED

Two numeric PDM values have been cited from secondary research (índice 1.20, cércea 7.5 m for
"espaços residenciais") but the governing article has NOT been read from the primary PDM
regulamento text. Cadastral regime unconfirmed. SNIT not probed. Braga is the recommended
first-mover city precisely because no unique engine features are required.

## 2 — THE NUMBER

**0%** of Braga parcel clicks get a full envelope (no pack exists). Potential: ~60–80% of
urban land once "espaços residenciais" and 2–3 other categories are sourced — depends on PDM
category distribution, which has NOT been measured.

## 3 — BLOCKERS

### B1 — Cadastral regime unconfirmed (P0)
- **Resume step:** Query DGT SNIC for Braga DICOFRE 0303.
  ```
  Navigate: https://snic.dgterritorio.gov.pt
  OR: https://snig.dgterritorio.gov.pt → search "cadastro predial" → Braga
  Confirm: CGPR covered? SiNErGIC covered? No coverage?
  If covered: is urban parcel geometry included, or only rural?
  ```

### B2 — Governing article for indexed values not confirmed (blocks pack)
- The 1.20 índice and 7.5 m cércea are cited from secondary research. The specific PDM article
  has NOT been read. Pack cannot ship `structured` confidence without this.
- **Resume step:**
  1. Navigate SNIT → search for Braga PDM → download regulamento PDF.
  2. Search for "espaços residenciais" in the PDF.
  3. Find the table of parâmetros urbanísticos; confirm índice de utilização máx and cércea máx.
  4. Record: article number, exact value(s), definition of "área de edificação" used.
  5. Add row to `sources/SOURCES.md §A`.

### B3 — Full category list not sourced
- Only "espaços residenciais" has cited values. The full PDM Planta de Ordenamento category set
  is unknown.
- **Resume step:** After reading regulamento, scan the Planta de Ordenamento (map) for all zone
  colours/categories; record each categoria label and its SNIT zone code equivalent.

### B4 — Afastamentos not sourced
- Setback values (front/side/rear) for each categoria not read.
- **Resume step:** Read PDM Art. 14 (or equivalent "Afastamentos e recuos" article) — Braga's
  afastamentos article is cited in country-level research as Art. 14 but not confirmed.

## 4 — TRIP-WIRES

- **If SNIT WFS returns categoria-level attributes** (not just PDF link) → Braga zone classification
  becomes fully automatable. Update `pt/NEXT.md §3.2` and `pt/sources/SOURCES.md`.
- **If Carta Cadastral OGC API goes live** → re-probe Braga coverage via the API immediately.
- **If another Portuguese municipality's PDM numeric values are sourced** → check whether their
  "espaços residenciais" numbers match Braga's (they should NOT be the same; if they appear
  identical, re-source; do not copy numeric values across PDMs).

## 5 — WHAT IS ALREADY BUILT

- Country-level study: `pt/findings/PORTUGAL-MASTER-DATA-SOURCE-STUDY.md §B.3`.
- Two numeric values (CONVERGENT-SECONDARY): `sources/SOURCES.md §A`.

## 6 — VERIFIED SOURCES

| Source | Tier | Note |
|---|---|---|
| Secondary research citing Braga PDM for índice 1.20 + cércea 7.5 m | `CONVERGENT-SECONDARY` | Article number not confirmed; upgrade by reading PDM directly |

## 7 — DEAD ENDS

- Do NOT copy Braga's índice/cércea values to any other Portuguese city — Portugal has no
  national ceiling and values are municipality-specific.

## 8 — THE SMALLEST NEXT STEP

**Confirm Braga cadastral regime (0.25 dev-days) + read Braga PDM regulamento (0.5 dev-days).**

Combined: ~0.75 dev-days to convert the two `CONVERGENT-SECONDARY` values to `VERIFIED-PRIMARY`
and discover the full category list. This is the cheapest step that materially advances the number
for any Portuguese city.

Expected outcome: Braga "espaços residenciais" pack authoring unlocked, with 1–2 additional
categorias identified for subsequent sourcing. Full Braga pack estimated at 8–12 dev-days total
once cadastral is confirmed.
