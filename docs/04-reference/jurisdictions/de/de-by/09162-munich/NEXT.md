# NEXT — Munich / München (09162, DE-BY)

> **Last updated:** 2026-07-23 · **Maintainer:** UNASSIGNED · **Status:** SCAFFOLD

---

## 1 — WHERE WE STOPPED (the one-paragraph truth)

Research is complete at the mechanism level. Munich uses the same BauGB/BauNVO/XPlanung framework as Hamburg. The main structural unknowns are: (a) what fraction of Munich parcels fall under §34 (assumed small, not measured — this is the first thing to check before committing a dev-day budget); (b) whether Bavarian LoD2-DE tiles are accessible without a licence fee; (c) the DiPlanung platform migration timing (31 October 2026 — a scheduling risk for any Munich integration built today). No live probe has been run. No rule pack has started.

---

## 2 — THE NUMBER (what % of clicks, which denominator, and why)

**Zoning full-envelope resolution: 0% (not started).**

Denominator: Munich parcels inside a modern BauGB B-Plan boundary with non-null GRZ/GFZ/height in XPlanGML, minus any §34 parcels (which correctly refuse). The §34 fraction is unknown — until measured, the denominator is an assumption.

---

## 3 — BLOCKERS

### B1 — §34 coverage fraction not measured (run before committing any budget)

- **What it is.** The fraction of Munich parcels under §34 (no numeric envelope by law) is unknown. The master study assumes it is smaller than Berlin's (Munich has continuously West-German fabric) but this is an assumption, not a measurement.
- **Why it blocks.** If §34 covers, say, 25% of Munich, the dev-day return per covered parcel changes materially. The devday estimate of 12–15 only makes sense if the §34 fraction is small (< 10%).
- **What would unblock it.** Grid-sample probe over Munich bbox classifying B-Plan vs §34 vs §35 coverage — same method as the Barcelona `probe-bcn-clau-distribution.mts`.
- **THE EXACT RESUME STEP.**
  ```bash
  # Munich bbox: approximately 11.360, 48.061 to 11.722, 48.248
  # Use the Bavarian XPlanung WFS (interim platform) or Munich's own geoportal
  # to query B-Plan coverage at each grid point

  # Step 1: find the Bavarian/Munich XPlanung WFS endpoint
  curl "https://geoportal.bayern.de/bayernatlas/wms\
  ?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetCapabilities" | grep -i bebauungsplan

  # Step 2: run a GetFeature request for one known Munich central parcel
  # (Marienplatz area: 11.575, 48.137)
  curl "https://stadtplan.muenchen.de/stadtplan/ows\
  ?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature\
  &TYPENAMES=<feature-type-from-step1>\
  &BBOX=11.570,48.133,11.582,48.142,EPSG:4326\
  &SRSNAME=EPSG:4326&COUNT=3&OUTPUTFORMAT=application/json"
  ```
  Note: the exact WFS endpoint for Munich B-Plans needs to be confirmed in Step 1 — this is part of the probe.

### B2 — DiPlanung platform transition (31 October 2026 scheduling risk)

- **What it is.** Bavaria mandates DiPlanung as the statewide XPlanung delivery platform from 31 October 2026. Any Munich integration built against the interim Bavarian XPlanung services before that date targets a platform that will be replaced.
- **Why it blocks.** A Munich pack built now may require re-integration in weeks.
- **What would unblock it.** Either: (a) wait until after October 2026 and target DiPlanung directly; (b) build with an abstraction layer (endpoint URL as a config constant) so migration is a one-line change.
- **THE EXACT RESUME STEP.** Check `diplanung.de` for DiPlanung API documentation and whether a staging/preview endpoint exists before October 2026 launch. If DiPlanung already has a documented WFS endpoint, build against that from the start.

### B3 — Bavarian LoD2 licence terms unconfirmed

- **What it is.** ZSHH (LoD2-DE coordination) is hosted at Bavaria's state survey office (Bayerische Vermessungsverwaltung). ZSHH hosting may or may not mean preferential open-access terms for Bavaria-local LoD2 tiles.
- **Why it blocks.** Cannot use LoD2 for Munich context buildings without knowing the licence.
- **What would unblock it.** Read the Bayerische Vermessungsverwaltung LoD2 product page.
- **THE EXACT RESUME STEP.** `curl "https://geodaten.bayern.de/opengeodata/OpenDataDetail.html?pn=lod2"` — check licence type (open/dl-de or fee-based) and download method.

### B4 — BayBO Abstandsflächen multiplier not read

- **What it is.** BayBO Art. 6 sets the height-proportional setback multiplier for Bavaria. Bavaria's LBO had a 1H multiplier historically; this was revised. Current value not yet read.
- **Why it blocks.** Cannot author the setback component of any Munich B-Plan pack.
- **THE EXACT RESUME STEP.** `curl "https://www.gesetze-bayern.de/Content/Document/BayBO-6"` — read Art. 6 (Abstandsflächen). Record: multiplier for standard buildings (expected 0.4H in cities under BayBO Art. 6 Abs. 5 exception); minimum absolute distance.

---

## 4 — TRIP-WIRES (if you see X elsewhere, come back HERE and do Y)

- **4.1 — If Hamburg XPlanGML probe confirms attributes are populated** → the same reader works for Munich XPlanGML (same schema). Build Hamburg first; Munich is then a config change + §34 measurement, not a new pipeline.
- **4.2 — If DiPlanung API documentation is published** → check `diplanung.de` and update B2 above with the exact endpoint. If a staging endpoint exists pre-October 2026, consider building against DiPlanung directly.
- **4.3 — If Bavarian LoD2 is confirmed as open** (B3 probe) → Munich context buildings are resolved at LOD2 without a licence negotiation. Update `../../topics/buildings-lod-height.md` Bavaria row.
- **4.4 — If a Baunutzungsplan-equivalent legacy plan is found for Munich** → this changes the complexity estimate from 12–15 to 30–35 dev-days (Berlin-equivalent). Add a new blocker section here and update `../../README.md §5` Munich row.

---

## 5 — WHAT IS ALREADY BUILT (do not redo)

- National XPlanung standard characterisation — `../../findings/GERMANY-MASTER-DATA-SOURCE-STUDY.md`
- BauNVO §17 ceiling table — `../../README.md §1.3`
- Hamburg XPlanGML reader (once built) — **port to Munich before rebuilding**

---

## 6 — VERIFIED SOURCES

| Source | Answers | Tier | Exact query / note |
|---|---|---|---|
| BauGB §§30/34 | Regime taxonomy | `published` | `gesetze-im-internet.de/bbaug/` |
| BauNVO §17 | Density ceilings | `published` | `gesetze-im-internet.de/baunutzungsv/__17.html` |
| Munich/Bavaria XPlanung WFS (interim) | B-Plan polygon coverage (endpoint TBD) | VERIFIED-LEAD | `stadtplan.muenchen.de` or `geoportal.bayern.de` — WFS endpoint needs probe |
| DiPlanung (from Oct 2026) | Mandatory Bavarian XPlanung delivery | `published` (mandate) | `diplanung.de` |
| ZSHH LoD2-DE Bavaria tiles | Building footprint + height (LOD2) | VERIFIED-LEAD (licence TBD) | `geodaten.bayern.de` |
| BayBO Art. 6 | Abstandsflächen multiplier for Bavaria | VERIFIED-LEAD (not read) | `gesetze-bayern.de/Content/Document/BayBO-6` |

---

## 7 — DEAD ENDS

- **No legacy plan equivalent to Berlin's Baunutzungsplan identified:** not a confirmed absence — confirmed unconfirmed. Do not assume absence; check explicitly (see §1 "Baunutzungsplan-equivalent" in README §6).

---

## 8 — THE SMALLEST NEXT STEP that moves the number, and its cost

**Run the §34 fraction probe (B1). Estimated: 0.5–1 dev-days.**

This single measurement converts "Munich is probably cheap" from an assumption into a fact. It also identifies the XPlanung WFS endpoint for Munich in the process, unblocking B-Plan attribute probing in the same session. Start with B1 before committing any other Munich budget.
