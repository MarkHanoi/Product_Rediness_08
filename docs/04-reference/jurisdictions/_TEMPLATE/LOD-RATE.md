# LOD-200 Context-Building Rate — `<JURISDICTION>` (`<iso>`) `<national | city>`

<!-- ────────────────────────────────────────────────────────────────────────────
COPY THIS FILE to start a LOD-RATE.md for a country or a city. Delete these HTML
comments as you fill it in.

⚠ THIS IS A SECOND, DISTINCT RATE. It is NOT the buildable-rule RATE.md.
  • RATE.md answers: "do we know the RULES for a plot?" (zone / density / height-limit —
    what you MAY build). Its ruler is the *structured dimensional fill rate*.
  • LOD-RATE.md (this file) answers: "can we obtain a faithful physical model of the
    EXISTING city around the plot?" (real parcels + real building heights + attributes —
    what IS already there). Its ruler is the *LOD-200 context-building rate* below.
  They are ORTHOGONAL. A jurisdiction can be high on one and low on the other
  (France: rules ~22%, context ~80%. Saudi: rules ~55%, context ~18%). NEVER conflate
  the two numbers — that conflation is the §CONTEXT-DATA-HONESTY failure C58 forbids.
  Cross-reference RATE.md; never merge its score into this one.

⚠ HONESTY RULES (C58 §1.2/§1.4 — the whole point of the number):
  1. The metric DEFINITION and the LOD LADDER below are FIXED and identical in every
     jurisdiction, so the numbers are COMPARABLE. Do not redefine them per country.
  2. Every % is a CLAIM. Tag it **VERIFIED** (you live-probed the endpoint this pass —
     record it in the Appendix table) or **ESTIMATED** (desk assessment from the source's
     own product spec / the jurisdiction's `topics/buildings-lod-height.md`). NEVER present
     a desk estimate as a measurement.
  3. The binding sub-metric is **real building-HEIGHT coverage** — footprints are
     near-universal (OSM), but real per-building HEIGHTS are the gap that decides whether
     context renders as flat wireframe (LOD 100) or true massing (LOD 200). "how can we
     have the rules if we don't even have the heights of the buildings?"
  4. If NO assessment has been done, the honest headline is
     **"NOT YET ASSESSED — scaffold only"**, NOT a guessed percentage.
──────────────────────────────────────────────────────────────────────────── -->

**Headline: `<LOD level>` · real-height coverage `<NN>%` · `<VERIFIED | ESTIMATED>`**
<!-- e.g. "LOD 2.2 · real-height coverage ~99% · VERIFIED" -->

> **LOD-200 context-building rate** — the fraction of the existing buildings around a
> plot for which we can obtain a faithful **≥ LOD-150 physical model** — **real parcel
> geometry + real MEASURED per-building height + ≥1 extra attribute (roof form / storeys /
> use / construction year)** — from an authoritative source, WITHOUT falling back to a
> fabricated OSM flat-extrude (the 9 m default). The binding sub-metric is real
> building-HEIGHT coverage. This definition is IDENTICAL across every jurisdiction so the
> scores are directly comparable. Derived from direct endpoint/schema checks where marked
> VERIFIED; from the source's product spec where marked ESTIMATED.

## The LOD ladder (fixed — use consistently)

| Level | What it is | How it renders | Our label |
|---|---|---|---|
| **LOD 100** | Footprint + block/estimated height (OSM `height` tag, or `building:levels`×3.2 m, or the **9 m fabricated default** when nothing is tagged) | flat prism at a guessed height, or flat wireframe | `assumed` / `derived-levels` (the universal floor — what we render TODAY with no national source) |
| **LOD 150 (LoD1)** | Footprint + **REAL measured** height (national height attribute or LiDAR nDSM) | correct prismatic massing (right ridge height, flat top) | the first honest tier |
| **LOD 200 (LoD2)** | Footprint + real height + **roof form / storeys** (CityGML LoD2, real roof planes) | true massing with pitched/hipped roofs | the target |

Headline LOD-rate = the LOD level we can deliver **+** the % real-height coverage.
Extra credit for LoD2 roof forms and a real parcel-join.

<!-- The cross-jurisdiction benchmark. Keep this table in SYNC across every LOD-RATE.md —
     it is the shared ruler. Insert this jurisdiction at its honest position. -->
| Jurisdiction | LOD achievable | Real-height % | Headline | Flag |
|---|---|---|---|---|
| Netherlands | LOD 2.2 | ~99% | ~97% | VERIFIED |
| Switzerland | LOD 2 | ~98% | ~95% | VERIFIED |
| Denmark | LOD 2 | ~95% | ~93% | ESTIMATED |
| Germany | LOD 2 | ~90% | ~82% | VERIFIED (NRW) |
| France | LOD 1→2 | ~88% | ~80% | VERIFIED |
| Norway | LOD 1 | ~85% | ~72% | ESTIMATED |
| Sweden | LOD 1 | ~80% | ~68% | ESTIMATED |
| USA | LOD 1 | ~60% | ~58% | VERIFIED |
| Spain | LOD 1 (hybrid) | ~45% | ~52% | VERIFIED (footprint) |
| Belgium | LOD 1 | ~55% | ~48% | ESTIMATED |
| Portugal | LOD 1 | ~75% | ~42% | ESTIMATED |
| Italy | LOD 1 (regional) | ~30% | ~35% | ESTIMATED |
| Saudi Arabia | LOD 1 (ML) | ~20% | ~18% | ESTIMATED |
| **`<THIS JURISDICTION>`** | **`<LOD>`** | **`<NN>%`** | **`<NN>%`** | **`<flag>`** |

---

## The three sub-metrics

<!-- One row per sub-metric. `Coverage` = the % of buildings/plots the layer covers.
     `Flag` = VERIFIED (live-probed this pass) / ESTIMATED (desk). -->

| Sub-metric | Source | Coverage | Flag | Note |
|---|---|---|---|---|
| **(a) Parcel definition** (cadastral geometry) | `<cadastre / INSPIRE CP>` | `<NN>%` | | reuse what RATE.md's cadastre work found |
| **(b) Real building HEIGHT** (per-building, measured — THE BINDING METRIC) | `<national 3D source / LiDAR nDSM>` | `<NN>%` | | measured, NOT floor-count×3 m and NOT the 9 m default |
| **(c) Extra attributes** (roof form / storeys / use / year) | `<register / CityGML LoD2>` | `<LOW / MED / HIGH>` | | roof form is the LoD2 differentiator |

**OSM height-tag floor (the universal fallback, what we render with NO national source):**
`<state the OSM explicit-`height`-tag + `building:levels` coverage — ESTIMATED — this is the
LOD-100 floor below which no jurisdiction can fall, and the fabricated 9 m default kicks in
where even that is absent (`contextBuildings.ts` `DEFAULT_BUILDING_HEIGHT_M = 9`).>`

---

## The structural finding

<!-- 1–3 short paragraphs: the ONE fact that fixes this jurisdiction's LOD level. Usually
     one of: (i) a native national CityGML LoD2 model exists → LOD 200 (NL/CH/DK/DE);
     (ii) a national height ATTRIBUTE exists but no roof geometry → LOD 150, LoD2 needs a
     LiDAR reconstruction pipeline (FR/ES/NO/SE); (iii) no national building model at all →
     footprint + derived nDSM, or ML-footprint-only floor (IT/PT/US/SA). State the specific
     version, the confirming evidence, and whether the height is MEASURED or ESTIMATED. If
     parcel or height is the outlier (US parcel weak; Saudi geo-fenced), justify it here. -->

---

## Orthogonality with RATE.md (do not conflate)

<!-- ONE line stating this jurisdiction's buildable-rule RATE.md score next to this
     LOD-context score, and why they differ. e.g. "France: rules ~22% (numbers in PLU PDFs)
     but context ~80% (BD TOPO HAUTEUR is a national open attribute) — the numbers we lack are
     the RULES, not the physical model." This is the founder's insight made explicit. -->

---

## What would raise the LOD level

| Action | LOD / height impact | Effort |
|---|---|---|
| | | |

---

## Appendix — live-probe evidence (where VERIFIED)

<!-- Every VERIFIED % above must trace to a row here. Assert on Content-Type + body. -->

| Endpoint | Probed | Result (HTTP · body assertion) | Verdict |
|---|---|---|---|
| `<url>` | `<date>` | `<HTTP 200 · returned field X = value>` | `<VERIFIED / geo-blocked / 404>` |

---

*Last updated: `<YYYY-MM-DD>`. `<one line: what is VERIFIED live vs desk-ESTIMATED vs
licence/geo-gated.>` Maintainer: `<UNASSIGNED or name>`.*
