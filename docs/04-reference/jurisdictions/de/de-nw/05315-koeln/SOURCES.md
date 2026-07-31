# Köln / Cologne (`05315`) — official source registry

**Country:** `de` · **Land:** Nordrhein-Westfalen (`de-nw`) · **AGS:** `05315000` ·
**Pack id:** `de-05315-koeln` · **CRS:** ETRS89 / UTM 32N (**EPSG:25832**) ·
**Last updated:** 2026-07-31 · **Maintainer:** UNASSIGNED ·
**Status:** RESEARCH CAPTURE — founder's Germany / NRW / Köln study. No live probe run against Köln
B-Plan GIS; no numeric planning value captured.

> **§CONTEXT-DATA-HONESTY (binding on this whole dossier).** No GRZ / GFZ / height / floor value
> enters any file here unless it is cited to an **exact official plan Festsetzung** (a specific
> Bebauungsplan Satzung, by plan number). **§34 (unplanned interior) is a cited REFUSAL, not a
> number.** BauNVO §17 ceilings and BauNVO zone defaults are **never** parcel answers. An OSM
> building footprint is **never** a legal parcel answer. Failure and empty are the same value —
> ship the probe before the fill.

Status legend: **VERIFIED** (live-probed or primary text read) · **CONVERGENT** (multi-source
research-confirmed, not live-probed) · **PENDING** (identified but not yet captured / probed).

---

## A — Planning (legal envelope) sources

| # | Source | What it is authoritative for | URL | Status |
|---|---|---|---|---|
| A1 | **Stadt Köln — Bebauungsplan-Suche** | The **binding** municipal source for `Art der baulichen Nutzung` (use), `Maß der baulichen Nutzung` (GRZ/GFZ), `Geschossigkeit` (Z / Vollgeschosse), `Bebauungsdichte` and `überbaubare Grundstücksflächen`. Searchable by location / Flurstück / plan number / plan status. | `stadt-koeln.de/leben-in-koeln/planen-bauen/bebauungsplaene/suche` | **VERIFIED** (search entry point confirmed to exist and to be the binding B-Plan register). The **per-plan Festsetzung values are PENDING** — no plan selected/read yet. |
| A2 | **Köln XPlanung (XPlanGML)** | Structured XPlanGML exchange representation of Köln B-Plans. **Publication is limited** and the machine record is a derivative — the **legal authority remains the analogue Satzung**, NOT the XPlanGML. Do not treat XPlanGML as the source of legal truth. | `stadt-koeln.de/artikel/70386` | **CONVERGENT** — page identified; attribute population (does XPlanGML actually carry grz/gfz/z/hoehe for Köln plans?) is **PENDING PROBE**. |
| A3 | **Köln Geoportal** | Municipal geoportal entry (map services, layer discovery, likely host of the B-Plan GIS overlay used for point-in-polygon plan lookup). | `stadt-koeln.de/politik-und-verwaltung/geoportal` | **CONVERGENT** — portal identified; the exact B-Plan WFS / feature-service endpoint + Köln bbox is **PENDING PROBE**. |
| A4 | **BauO NRW 2018** (Bauordnung für das Land Nordrhein-Westfalen) | Land building code — governs **§6 Abstandsflächen** (setback formula, the one citable planning-side number for Köln). Latest amendment **effective 01.01.2024**. | `recht.nrw.de` | **VERIFIED-CITABLE** (formula captured in `NRW-SETBACK-ENGINE.md`; verify exact current wording at recht.nrw.de before it gates production). |
| A5 | **BauGB §§30 / 34 / 35** (federal) | Regime taxonomy: §30 (B-Plan governs → numbers), §34 (unplanned interior → *Einfügen*, no numeric envelope by law → refusal), §35 (outlying → refusal). Regime classification runs FIRST. | `gesetze-im-internet.de/bbaug/` | **CONVERGENT** (national text, published). |
| A6 | **BauNVO §§17 / 19 / 20** (federal) | Metric **definitions** only: §19 defines GRZ (coverage), §20 defines GFZ / Vollgeschoss (FAR / floors), §17 gives density ceilings. BauNVO defines the *metric*; the **municipality sets the value**. §17 is a sanity ceiling, never a parcel default. | `gesetze-im-internet.de/baunutzungsv/` | **CONVERGENT** (national text, published). |

---

## B — Technical (geospatial) sources — NRW Land authority

The Land is the technical authority; see `../../LANDS/NORDRHEIN-WESTFALEN.md` (VERIFIED-LIVE anchor)
and `../../LAND-REGISTRY.md` (row 10).

| # | Source | What it is authoritative for | URL | Status |
|---|---|---|---|---|
| B1 | **ALKIS NRW** (Geobasis NRW / GDI-NW) | Cadastral parcels — `Flurstück` (Gemarkung/Flur/Flurstück). Full NRW coverage, survey-grade, licence **DL-DE Zero 2.0**. See `PARCEL.md`. | `opengeodata.nrw.de` / GDI-NW | **CONVERGENT** (open, per LAND-REGISTRY); exact WFS endpoint + feature-type + Köln bbox **PENDING PROBE** (`PARCEL.md §Probe`). |
| B2 | **LoD2-DE NRW** (CityGML) | Building geometry + height — `measuredHeight`, `traufhoehe` (eaves), `firsthoehe` (ridge), roof planes. Supplies true height; no DSM sampling needed. | `opengeodata.nrw.de/produkte/geobasis/3dg/lod2_gml/` | **VERIFIED-LIVE** (probed 2026-07-24 per LAND-REGISTRY; HTTP 200, per-tile CityGML packaging). |
| B3 | **NRW DGM1** (terrain, 1 m LiDAR) | Digital terrain model — WCS / GeoTIFF, DL-DE Zero 2.0. The rasant (ground reference the ordinance measures height from) needs the DTM at the façade, not a single block-centroid sample. | `opengeodata.nrw.de` | **CONVERGENT** (open per LAND-REGISTRY); exact WCS endpoint **PENDING PROBE**. |

---

## C — Convergence table (what corroborates what)

| Claim | A1 (B-Plan Suche) | A2 (XPlanung) | A3 (Geoportal) | Verdict |
|---|---|---|---|---|
| Köln publishes binding B-Plans searchable by parcel | ✅ | ✅ (derivative) | ✅ (map) | **CONVERGENT** — entry points exist |
| A machine-readable numeric envelope (grz/gfz/z) is retrievable per parcel | ? | **PENDING PROBE** | ? | **UNVERIFIED** — do not assume XPlanung = numbers |

---

## D — What is NOT a source (forbidden as a legal answer)

- OSM building footprints — geometry only, **never** a parcel / legal answer (`PARCEL.md`).
- BauNVO §17 ceilings or BauNVO §§2–11 zone defaults — metric *definitions*, **never** the value
  for a specific parcel.
- XPlanGML treated as legal truth — it is a derivative; the analogue Satzung is the authority (A2).

---

**Related:** `../../LANDS/NORDRHEIN-WESTFALEN.md` · `../../LAND-REGISTRY.md` · `../../GERMANY.md` ·
`PARCEL.md` · `LEGISLATION.md` · `EXTRACTION-PIPELINE.md` · `NRW-SETBACK-ENGINE.md` · `RATE.md`.

*Last updated: 2026-07-31. Authority: [C63](../../../../02-decisions/contracts/C63-CITY-COMPLETION-AND-DOSSIER.md),
[C58](../../../../02-decisions/contracts/C58-ZONING-RULES-AND-BUILDABLE-ENVELOPE.md),
[C57](../../../../02-decisions/contracts/C57-PARCEL-DATA-LAYER.md). Founder research capture; no numeric planning value verified.*
