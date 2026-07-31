# Köln / Cologne (`05315`) — LEGISLATION (PART A: the legal envelope regime)

**Country:** `de` · **Land:** Nordrhein-Westfalen (`de-nw`) · **AGS:** `05315000` ·
**C63 axis:** LEGISLATION · **C58:** Zoning Rules & Buildable Envelope · **Last updated:** 2026-07-31 ·
**Status:** RESEARCH CAPTURE — regime model captured; **zero numeric Festsetzung values** (no B-Plan
selected/read). One bootstrap CSV row, all `unknown` / `confidence=PENDING`.

> **§CONTEXT-DATA-HONESTY.** No GRZ / GFZ / Z / height value enters `LEGISLATION.csv` unless cited to
> an exact plan Festsetzung (plan number + document + page). **§34 = cited REFUSAL (a POSITIVE
> answer), not a number.** BauNVO §17 ceilings and BauNVO zone defaults are **never** the value for a
> parcel. The bootstrap row below is deliberately all-`unknown` — that is the honest state before any
> plan is read.

---

## 1 — The German regime split (classification runs FIRST)

Before any number is sought, the parcel is classified into a BauGB regime. **Regime classification
is the first step of the extraction pipeline** (`EXTRACTION-PIPELINE.md §1`).

| Regime | BauGB | Meaning | PRYZM answer |
|---|---|---|---|
| **§30 — B-Plan** | §30 BauGB | A qualified Bebauungsplan (Satzung) exists → binding Festsetzungen | **Numeric envelope** (GRZ/GFZ/Z/height) — *only where the plan sets them* |
| **§34 — Innenbereich** | §34 BauGB | Unplanned interior ("im Zusammenhang bebauter Ortsteil") → *Einfügen* into the surroundings → **NO numeric envelope by law** | **Cited REFUSAL** — a POSITIVE, correct answer (not a data gap) |
| **§35 — Außenbereich** | §35 BauGB | Outlying area → building generally not permitted (privileged uses only) | **Restricted / refusal** |

**§34 is not a miss.** A §34 parcel correctly returns "no numeric envelope — the law prescribes
*Einfügen*, not a coverage/FAR/height figure", with the BauGB §34 citation. This is the honest
answer and it counts as *answered*, not *unknown*.

---

## 2 — What a §30 B-Plan Festsetzung carries

The **municipality sets the values**; BauNVO defines only the **metric**. So every value below is
`unknown` until the specific Köln Satzung is read.

| Festsetzung | German | Metric definition (BauNVO) | C63 field | Note |
|---|---|---|---|---|
| **GRZ** — Grundflächenzahl | coverage ratio | **BauNVO §19** | `maxCoverage` | fraction of parcel that may be built over |
| **GFZ** — Geschossflächenzahl | floor-area ratio | **BauNVO §20** | `farRatio` (unit `GFZ`) | FAR is **not** a native German field — it is the GFZ, stamped with unit + densityScope |
| **Z** — Zahl der Vollgeschosse | number of full storeys | BauNVO §20 (Vollgeschoss) | `maxFloors` | **the German height determinant for most plans** |
| **TH / FH** — Traufhöhe / Firsthöhe | eaves / ridge height (m) | — (plan-set, metric) | `maxHeight_m` (measurement stamped) | metric height — **rarer** than Z; measured from the rasant |

BauNVO §17 gives density **ceilings** — a sanity bound, **never** a parcel default.

---

## 3 — Extraction architecture (summary; full design in `EXTRACTION-PIPELINE.md`)

```
ALKIS Flurstück  →  point-in-polygon (EPSG:25832)  →  Köln B-Plan GIS  →  B-Plan ID
   →  { XPlanGML structured attrs  |  Satzung PDF human-extraction }  →  C63 row
```

**Test XPlanGML attribute population (grz / gfz / z / hoehe) BEFORE assuming.** Do not assume
"XPlanung ⇒ numbers": a field can exist in the schema and be **unpopulated** for a given Köln plan.
A present-but-empty attribute is the *same value* as no attribute (§CONTEXT-DATA-HONESTY). The
binding fallback is the analogue Satzung PDF.

---

## 4 — `LEGISLATION.csv` — schema + bootstrap row

Header (fixed): `zoneCode,officialDesignation,farRatio,densityScope,maxHeight_m,heightMeasurement,maxFloors,maxCoverage,setback,buildableDepth_m,permittedUse,legalSource,articleParagraph,effectiveDate,confidence`

The CSV currently holds **one bootstrap row, all `unknown` / `confidence=PENDING`** — because
**no B-Plan has been selected yet**. That reason is stamped in the row's `officialDesignation`
field. No value is fabricated. See `LEGISLATION.csv`.

---

## 5 — Candidate first-10-plan sampling strategy (pilot)

To measure the real structured-fill fraction, sample ~10 Köln B-Plans spanning use types **and**
vintages (the old analogue-scan plans vs the newer XPlan-native plans behave differently on
attribute population):

| Bucket | BauNVO use (Baugebiet) | Vintage to sample |
|---|---|---|
| Residential | **WA** (Allgemeines Wohngebiet) | 1× old-scan · 1× new-XPlan |
| Mixed | **MI** (Mischgebiet) | 1× old-scan · 1× new-XPlan |
| Commercial / industrial | **GE** (Gewerbegebiet) | 1× old-scan · 1× new-XPlan |
| Core / centre | **MK** (Kerngebiet) | 1× new-XPlan |
| Special / other | **MU** (Urbanes Gebiet) or SO | 1× (whichever available) |

Measure: of the sampled plans, what fraction expose **structured** GRZ/GFZ/Z in XPlanGML vs require
Satzung-PDF human extraction. That fraction is the input to `RATE.md` and `EXTRACTION-PIPELINE.md
§KPI`. **Not yet run.**

---

## 6 — Setback is a Land rule, not a per-zone number

Köln setbacks come from **BauO NRW 2018 §6 Abstandsflächen** (height-proportional formula), coded
**once per Land** — see `NRW-SETBACK-ENGINE.md`. It does **not** populate a per-zone setback metre
value; the `setback` CSV column stays `unknown` at the zone level and is computed per-parcel from
wall height H.

---

**Related:** `LEGISLATION.csv` · `EXTRACTION-PIPELINE.md` · `NRW-SETBACK-ENGINE.md` · `SOURCES.md §A` ·
`RATE.md`.

*Last updated: 2026-07-31. Authority: [C58](../../../../02-decisions/contracts/C58-ZONING-RULES-AND-BUILDABLE-ENVELOPE.md).
Founder research capture; zero numeric Festsetzung verified — bootstrap row only.*
