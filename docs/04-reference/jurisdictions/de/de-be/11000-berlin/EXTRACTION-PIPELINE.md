# Berlin (11000) — B-Plan extraction pipeline (DESIGN)

> **Status:** DESIGN / SCAFFOLD · **Captured:** 2026-07-31 · **Source:** founder research
> **Governing rule:** *No numeric value is emitted unless it is verified against the official plan text and cited.* Every GRZ/GFZ/Vollgeschosse/Höhe/setback value stays `unknown` until an L-449 human sign-off attaches it to an exact Festsetzung clause of an exact `planid`. **Nothing here is populated from GIS/WFS metadata.**

This document consolidates the extraction DESIGN (the document-resolution bridge, the PDF parser stages, the legal-regime classifier, and the city-scale corpus ingestor) into one place, so the dossier does not carry several near-duplicate adapter JSONs. The machine-readable target object is `gis/legislation-record.json` (the empty template the pipeline fills).

---

## 0 — The one hard truth (why this pipeline exists)

The Berlin B-Plan WFS is a **plan LOCATOR, not a rule table**. GRZ / GFZ / Vollgeschosse / height / Baugrenze are **absent from the WFS schema** (confirmed against both endpoint candidates — see `gis/bplan-source.json`). They live **only** in the linked Satzung PDF. This pipeline is the *only* sanctioned path from a located plan to a cited buildability number.

---

## 1 — Document-resolution bridge (GIS locator → legislation)

Input: a `planid` (from `gis/bplan-source.json`). Output: a cited `LegislationRecord` (`gis/legislation-record.json`), or a refusal.

```
planid
  -> resolve document URL   (inhalt  [plu_bplan]  OR  scan_www  [bplan/FIS-Broker])
  -> download PDF           (validate: official domain + planId match)
  -> detect text vs image   (ocrRequired?)
  -> extract text           (embedded text -> OCR fallback -> manual)
  -> parse plan symbols/legend (Nutzungsschablonen, Baufenster)
  -> L-449 human verification (mandatory gate)
  -> cited LegislationRecord
```

- **sourcePolicy — allowed:** official Geoportal, Bezirksverwaltung / Stadtentwicklungsamt pages, binding B-Plan documents.
- **sourcePolicy — forbidden:** real-estate portals, third-party summaries, third-party GIS, neighbour assumptions.
- **doNotInfer:** BauNVO §17 values · Berlin average density · neighbouring parcels · typical district rules · LoD2/OSM heights.

---

## 2 — Legal-regime classifier (runs FIRST, before any numeric extraction)

A per-parcel / per-plan classification. Numeric extraction is only *attempted* for the regimes that produce numbers by law.

| Regime | Basis | `numericExtractionAllowed` | Output on match |
|---|---|---|---|
| **BPLAN §30** | BauGB §30 (modern qualifizierter/vorhabenbezogener B-Plan) | `true` | extract Festsetzungen -> cited numeric row |
| **UNPLANNED_INTERIOR §34** | BauGB §34 | `false` | **cited refusal** (no numeric envelope exists by law — a POSITIVE answer) |
| **OUTLYING §35** | BauGB §35 | `false` | cited refusal (presumptively not buildable) |
| **BERLIN_LEGACY Baunutzungsplan 1958/1960** | §173(3) BBauG | `conditional`, `confidenceCap: "corroborated"` | Baustufe -> translated value, **capped `corroborated, voidance-risk`, NEVER `structured`/`verified`** |

> §34 refusal is documented as a **positive** product answer, not a data gap: *"This parcel lies in an unplanned interior area (§34 BauGB). No numeric building envelope is defined — buildability is assessed case-by-case."*

---

## 3 — PDF parser design (the extraction stages)

Input: `planid` + `documentUrl` (`inhalt` / `scan_www` / `planrecht`). Status: **DESIGN**. `machineReadable: false` (design only). If the PDF lacks explicit GRZ/GFZ/Höhe/setbacks, the output stays `unknown` — the parser never guesses.

1. **download** — validate official domain + planId match.
2. **detect** — text-layer vs image PDF (`ocrRequired?`).
3. **extract text** — embedded text → OCR → manual. Targets: `Festsetzung`, `Nutzungsschablone`, `GRZ`, `GFZ`, `Vollgeschosse`, `Gebäudehöhe / Traufhöhe / Firsthöhe`, `Baugrenze`, `Baulinie`.
4. **parse plan symbols** — Nutzungsschablonen, Baufenster from the Planzeichnung.
5. **citation (MANDATORY)** — document title · B-Plan number · Festsetzung number · page · effective date.

- **qualityControl:** GRZ ∈ [0,1] · GFZ > 0 · height-unit-present · citation-attached.
- **legalChecks:** value exists in the primary doc · the clause is captured · the plan version is confirmed.
- **failureOutput:** `{ "value": "unknown", "reason": "primary source missing or ambiguous" }`.
- **confidenceModel:** `unknown` → `extracted` → `corroborated` → `verified`.

### known_bombshells (capture verbatim — the honesty invariants)

- **structured_XPlanung:** probe attribute-population *before* ingestion — do not assume XPlanung serves populated GRZ/GFZ/height for Berlin.
- **Berlin_Baunutzungsplan:** historical validity requires verification; `confidence_cap: corroborated` (judicial *funktionslos* / voidance risk — OVG Berlin-Brandenburg, Az. 2 B 10.17, 15 Sep 2020).
- **height_values:** **NEVER substitute BauNVO §17 or a LoD2 measured height for the legal maximum height.**

---

## 4 — City-scale corpus (the climb path for all ~1000+ Berlin B-Pläne)

### 4.1 — Batch ingestor / crawler design

```
GDI-BE WFS GetCapabilities
  -> DescribeFeatureType
  -> GetFeature (all planIds)
  -> documentResolver (inhalt / scan_www -> PDF URL)
  -> digitisation classifier
  -> L-449 queue
  -> legislation rows
```

### 4.2 — Digitisation classifier (the key measurement — it decides Berlin's climb path)

Each plan routes to exactly one bucket:

| Bucket | Meaning | Path |
|---|---|---|
| `XPLAN_STRUCTURED` | GRZ/GFZ/height attributes populated | direct mapper |
| `PDF_TEXT` | PDF has a text layer | legal parser (§3) |
| `PDF_SCAN` | image-only PDF | OCR + L-449 |
| `MISSING` | no resolvable document | `unknown` |

> **Open question that gates the whole strategy:** is Berlin ~0% structured (PDF-only, like Hamburg), or does a meaningful XPlanung attribute fraction exist? **Measure the split before choosing XPlan-ingestion vs PDF-extraction** as the primary path.

### 4.3 — Coverage metrics (the honest denominator)

| Metric | Count |
|---|---|
| total B-Plans | unknown |
| plans-with-PDF | unknown |
| plans-with-machine-readable-attrs | unknown |
| plans-needing-OCR | unknown |
| verified-numeric-rows | 0 |
| unknown-rows | all |

> **Rate target = "known denominator + verified coverage", NOT "100% extraction."**

### 4.4 — First-district target

Start **ONE district** — Mitte or **Neukölln** (where fixture `plans/8-30-neukoelln/` sits) — not all Berlin. The document corpus is the bottleneck; a single-district pass proves the pipeline end-to-end and produces the first verified row.

### 4.5 — Production home (future CODE — not created here)

The eventual production home for verified rows is a rule-pack registry entry under `packages/site-parcel-data/src/rulepacks/` (a Berlin pack), converting verified rows → the C63 envelope-solver format. **This is flagged as future CODE work; no code is created by this dossier.**

---

**Related:** `gis/bplan-source.json` (locator + dual endpoints) · `gis/legislation-record.json` (empty target template) · `plans/8-30-neukoelln/metadata.json` (first fixture) · `LEGISLATION.md` · `NEXT.md`
