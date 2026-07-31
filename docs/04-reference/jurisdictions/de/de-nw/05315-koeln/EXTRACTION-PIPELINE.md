# Köln / Cologne (`05315`) — buildability EXTRACTION PIPELINE (design)

**Country:** `de` · **Land:** Nordrhein-Westfalen (`de-nw`) · **AGS:** `05315000` ·
**C63 axes:** PARCEL → LEGISLATION → ENVELOPE · **Last updated:** 2026-07-31 ·
**Status:** RESEARCH CAPTURE — founder's full extraction-pipeline design. **No plan content invented**;
the `plans/` bundles are scaffolded with `unknown` / `PENDING`.

> **§CONTEXT-DATA-HONESTY.** XPlanGML is **evidence, not legal authority**. No numeric value is
> production until it passes every quality gate (§6). §34 parcels are a **cited REFUSAL**, correctly
> **excluded from the KPI numerator** (refusal, not miss). A field existing ≠ populated ≠ legally
> sufficient.

---

## 1 — The pipeline

```
parcel(lat,lon)
  → ALKIS Flurstück                       (cadastral parcel, EPSG:25832 — PARCEL.md)
  → B-Plan polygon intersection           (point-in-polygon against Köln B-Plan GIS)
  → REGIME CLASSIFIER
        ├─ §30  B-Plan exists       → EXTRACT numeric envelope
        ├─ §34  Innenbereich        → CITED REFUSAL (no numeric envelope by law — Einfügen)
        └─ §35  Außenbereich        → RESTRICTED (privileged uses only → refusal)
  → { XPlanGML structured attrs  |  Satzung PDF legal text }   (§30 path only)
  → verified rule object                  (per-field confidence + source chain)
  → parcel answer
```

Regime classification runs **first** — it decides whether a number is even sought. Most of the
honesty guarantee lives here: §34/§35 return a *correct refusal*, not a data gap.

---

## 2 — XPlanGML = EVIDENCE, not legal authority

The **binding** source is the **Satzung PDF / ordinance** (the analogue plan the council enacted).
XPlanGML is a structured **derivative**. Therefore:

- XPlan attributes (`grz`, `gfz`, `z`, `hoehe`) **may be present-but-unpopulated** → **test
  population**, never assume.
- A field **existing** ≠ **populated** ≠ **legally sufficient**. All three must hold before a value
  is production.
- Where XPlanGML is empty or absent, fall back to **Satzung-PDF extraction** (human-verified), and
  cite the PDF page — not the GML.

---

## 3 — Per-PLAN evidence bundle (immutable legal object)

Each Köln B-Plan is captured as an **immutable evidence bundle** at
`plans/<PLAN-ID>/`. The bundle is the auditable chain from parcel answer back to enacted ordinance.

| File | Contents |
|---|---|
| `metadata.json` | `planId`, `officialTitle`, `rechtskraeftig` (legally in force), `effectiveDate`, `authority` (= "Stadt Köln"), `confidence` |
| `geometry.geojson` | plan boundary polygon (EPSG:25832) for point-in-polygon |
| `xplan.gml` | the XPlanGML machine record (evidence, not authority) |
| `ordinance.pdf` | the **binding** Satzung / textual Festsetzungen |
| `planzeichnung.pdf` | the plan drawing (Planzeichnung) — Baugrenzen/Baulinien, zone areas |
| `extraction.json` | extracted field values, **each with per-field confidence + source chain** |
| `citations.json` | value → document → section/page → Festsetzung number → confidence |

A registry `plans/index.json` lists every captured plan. See `plans/README.md` for the scaffold.
**No plan is populated yet** — all scaffold values are `unknown` / `PENDING`.

---

## 4 — German → C63 field mapping

FAR is **not** a native German field. The GFZ is mapped to `farRatio` **with provenance** (unit +
densityScope), never bare `FAR = GFZ`.

| German Festsetzung | C63 field | Rule |
|---|---|---|
| **Grundflächenzahl (GRZ)** | `maxCoverage` | direct (BauNVO §19 metric) |
| **Geschossflächenzahl (GFZ)** | `farRatio { value, unit:'GFZ', densityScope }` | **with provenance** — never bare `FAR=GFZ` |
| **Zahl der Vollgeschosse (Z)** | `maxFloors` | the German height determinant for most plans |
| **Gebäudehöhe / Traufhöhe / Firsthöhe** | `maxHeight_m` (measurement **stamped**) | record which height (TH vs FH vs GH) + reference (rasant) |
| **Baugrenze / Baulinie → überbaubare Grundstücksfläche** | `buildableDepth_m` | **GEOMETRY-DERIVED** from the plan polygon — **never** guessed from street width |
| **Abstandsfläche** | `setback` | **per-Land formula** (BauO NRW §6 — `NRW-SETBACK-ENGINE.md`), computed from H |
| **Baugebiet** (WA/MI/GE/MK/…) | `zoneType` | BauNVO use category |

`buildableDepth_m` is geometry-derived from the Baugrenzen, **not** inferred from street frontage —
inventing a depth from streets is a fabrication.

---

## 5 — PER-FIELD confidence (not per-plan)

A single plan holds **mixed certainty**: e.g. GRZ verified from the Satzung, height `unknown`. So
confidence attaches **per field**, never per plan. Every numeric value carries a **source chain**:

```
value  →  document  →  section/page  →  Festsetzung number  →  confidence
```

`extraction.json` stores each field with its own confidence; `citations.json` stores the chain.

---

## 6 — QUALITY GATES (all required before a row is production)

A value is production **only if ALL** hold:

1. Official **plan ID** captured.
2. Official **municipality source** (Stadt Köln) — not a third party.
3. **Ordinance PDF** present (the binding Satzung).
4. **Parcel intersection verified** — point-in-polygon in **EPSG:25832**.
5. **Every numeric value cited** — source chain complete (§5).
6. **Denominator declared** — the row states what population it belongs to.
7. **Unknowns preserved** — empty fields stay `unknown`, never back-filled with defaults.

Miss any one → **not production** (stays `PENDING` / evidence-only).

---

## 7 — REJECT LIST (never enters the engine)

- **BauNVO §17 orientation values** — taxonomy / ceiling only, never a parcel value.
- **Neighbouring parcels' values** — not legally transferable to the subject parcel.
- **OSM land-use** — context only, never a legal answer.
- **AI / OCR output without PDF verification** — must be confirmed against the Satzung PDF.
- **XPlan geometry without populated attributes** — a polygon is not an envelope.
- **City reputation** ("Köln is dense, so assume high GFZ") — not evidence.

---

## 8 — KPI: the real Köln legislation rate

```
Köln legislation rate  =  (B-Plan parcels with structured GRZ/GFZ/Z)
                          ───────────────────────────────────────────
                                  (all BUILDABLE parcels)
```

- **NOT** "number of PDFs collected."
- **§34 parcels are EXCLUDED from the numerator** — they are a correct refusal, not a miss. (Whether
  they sit in the denominator depends on the declared denominator — state it, per gate §6.6.)
- **NOT YET MEASURED.**

### Pilot (measure the fill fraction)

Sample ~10 B-Plans spanning **WA / MI / GE / MK** and **old-scan vs new-XPlan** (see
`LEGISLATION.md §5`). Measure the fraction exposing **structured** GRZ/GFZ/Z in XPlanGML vs requiring
Satzung-PDF extraction. That fraction is the first real data point for `RATE.md`.

### Expansion (extractor stays identical)

`5 plans → 50 → district → city → NRW-wide adapter`. The extractor does not change:

```
GermanyBoundaryResolver → Land adapter → ALKIS → regime classifier → BPlan extractor
```

Only the Land adapter (endpoint/auth/CRS) varies. This is the same replication model as Barcelona
(one abstract provider, per-jurisdiction subclass).

---

**Related:** `plans/README.md` (evidence-bundle scaffold) · `LEGISLATION.md` · `PARCEL.md` ·
`NRW-SETBACK-ENGINE.md` · `SOURCES.md` · `RATE.md` · `../../GERMANY.md §1` (router model).

*Last updated: 2026-07-31. Founder extraction-pipeline design captured; no plan content invented.
Authority: [C58](../../../../02-decisions/contracts/C58-ZONING-RULES-AND-BUILDABLE-ENVELOPE.md),
[C57](../../../../02-decisions/contracts/C57-PARCEL-DATA-LAYER.md),
[C62](../../../../02-decisions/contracts/C62-DATA-CONFIDENCE-PROVENANCE-MODEL.md).*
