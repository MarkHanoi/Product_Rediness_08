# City RATE — Köln / Cologne (`de-nw`, AGS 05315) — honest readiness framing

<!-- founder research capture 2026-07-31. This is NOT a scorecard-function output; the C63 §8 compute
     is not built. NO overall completion % is asserted — no probe has run against Köln B-Plan GIS.
     Every planning number is unknown/PENDING; the only citable planning-side rule is BauO NRW §6
     (NRW-SETBACK-ENGINE.md). §34 = cited REFUSAL is a POSITIVE answer, not a gap. -->

**Country:** `de` · **Land:** Nordrhein-Westfalen (`de-nw`) · **AGS:** `05315000` ·
**Pack id:** `de-05315-koeln` · **Last updated:** 2026-07-31 · **Maintainer:** UNASSIGNED ·
**Status:** RESEARCH CAPTURE — no probe; no numeric envelope; no composite % asserted.

> **§CONTEXT-DATA-HONESTY.** `not-assessed ≠ 0 %`. **No RATE % cell is asserted without the probe.**
> The "✅ / ⚠" marks below describe **source availability** (is the data reachable?), NOT measured
> completion. The composite completion is `not-assessed` until the Köln B-Plan probe + fill
> measurement run.

---

## 1 — Readiness snapshot (source availability, not measured completion)

| Layer | State | Basis |
|---|---|---|
| **Parcel** | ✅ source ready (CONVERGENT) | ALKIS NRW open, DL-DE Zero 2.0, survey-grade, EPSG:25832 — endpoint PENDING PROBE (`PARCEL.md`) |
| **Buildings / height** | ✅ **VERIFIED-LIVE** | NRW LoD2-DE CityGML (roof/ridge/eaves/3D), probed 2026-07-24 (`SOURCES.md §B2`) |
| **Terrain** | ✅ source ready (CONVERGENT) | NRW DGM1 (1 m LiDAR) open — endpoint PENDING PROBE; rasant-at-façade caveat (`PARCEL.md §3`) |
| **Zone (regime)** | ⚠ pipeline designed, unmeasured | Köln B-Plan GIS point-in-polygon → §30/§34/§35 classifier (`EXTRACTION-PIPELINE.md`) — not run |
| **Numeric envelope (GRZ/GFZ/Z/height)** | ⚠ B-Plan dependent, zero captured | every value `unknown` until a Satzung is read (`LEGISLATION.md`, `LEGISLATION.csv`) |
| **§34 (unplanned interior)** | ✅ permanent **REFUSAL floor** | BauGB §34 → *Einfügen*, no numeric envelope by law → **cited refusal is a POSITIVE answer** |
| **Setback** | ✅ citable formula (Land rule) | BauO NRW 2018 §6: 0.4·H / 0.2·H (GE/GI) / 0.25·H (MK), min 3 m (`NRW-SETBACK-ENGINE.md`) |

**Overall completion:** `not-assessed` — the C63 scorecard compute is not built and no Köln probe
has run. **No overall % is claimed.**

---

## 2 — The legislation rate (the real Köln number)

```
Köln legislation rate  =  (B-Plan parcels with numeric GRZ/GFZ/Z)
                          ─────────────────────────────────────────
                                  (all buildable parcels)
```

- **NOT YET MEASURED.** No B-Plan selected; no fill fraction sampled.
- **§34 parcels are the refusal floor** — excluded from the numerator (a correct refusal, not a
  miss). See `EXTRACTION-PIPELINE.md §8` for the full KPI definition and pilot.
- The first real data point comes from the ~10-plan pilot (WA/MI/GE/MK × old-scan/new-XPlan,
  `LEGISLATION.md §5`).

---

## 3 — Why Köln is a strong German candidate (but not yet measured)

NRW is the **wire-first Land** — the one place in Germany where the top of the LOD ladder (LoD2) is
**VERIFIED-LIVE** and the cadastre/terrain/imagery are all open (DL-DE Zero 2.0). So Köln's
**technical** layers (parcel, height, terrain) are the strongest in Germany. The **legal** envelope,
as everywhere in Germany, is municipal and B-Plan-gated — and for Köln it is **entirely unmeasured**.
Technical readiness ≠ legal readiness; do not conflate.

---

## 4 — §CONTEXT-DATA-HONESTY note

**DOES:** point to open, cited technical sources (ALKIS, LoD2 VERIFIED-LIVE, DGM1) and one citable
Land setback formula (BauO NRW §6). **REFUSES:** any numeric envelope — no B-Plan read, so GRZ/GFZ/Z/
height stay `unknown` (never a BauNVO default, never an OSM footprint, never a neighbour's value).
**§34 = cited refusal = a positive answer.** `honestyOk: true` (no fabricated value; every unknown
typed). No composite % asserted.

---

## 5 — Next probe (the one action that moves this rate)

1. **Köln B-Plan GIS endpoint** — discover the WFS / feature-service that backs the Bebauungsplan-Suche
   (`stadt-koeln.de/.../bebauungsplaene/suche`) + Geoportal; capture the endpoint URL, feature-type,
   and Köln bbox (EPSG:25832) so a parcel point-in-polygon returns a B-Plan ID.
2. **XPlanGML attribute-population test** — for the returned plan(s), test whether `grz`/`gfz`/`z`/
   `hoehe` are **populated** (not merely present in the schema). A present-but-empty attribute = the
   same value as absent. This decides whether Köln yields structured numbers or requires Satzung-PDF
   extraction — and produces the first real legislation-rate data point.

---

## 6 — Dossier index

| File | About |
|---|---|
| **`RATE.md`** (this) | honest readiness framing + the legislation-rate definition (no % asserted) |
| [`SOURCES.md`](./SOURCES.md) | official source registry (VERIFIED / CONVERGENT / PENDING) |
| [`PARCEL.md`](./PARCEL.md) | ALKIS NRW parcel layer (PART B) |
| [`LEGISLATION.md`](./LEGISLATION.md) + [`LEGISLATION.csv`](./LEGISLATION.csv) | regime model + honest schema (bootstrap row all `unknown`) |
| [`EXTRACTION-PIPELINE.md`](./EXTRACTION-PIPELINE.md) | parcel→B-Plan→regime→extract pipeline, quality gates, reject list, KPI |
| [`plans/`](./plans/) | per-plan immutable evidence-bundle scaffold (`README.md`, `index.json`, `_TEMPLATE/`) |
| [`NRW-SETBACK-ENGINE.md`](./NRW-SETBACK-ENGINE.md) | BauO NRW §6 Abstandsflächen (citable Land rule) |

**Related:** `../../LANDS/NORDRHEIN-WESTFALEN.md` · `../../LAND-REGISTRY.md` · `../../GERMANY.md`.

*Last updated: 2026-07-31. Authority: [C63](../../../../02-decisions/contracts/C63-CITY-COMPLETION-AND-DOSSIER.md).
Founder research capture; no scorecard compute run; no numeric planning value verified.*
