# Data Readiness Rate — Denmark (`dk`) national

**Headline rate: ~96%**

> **Structured dimensional fill rate** — the fraction of parcel-level building-rule queries that
> return a complete, machine-readable answer (**zone/use code + a density metric [FAR / coverage /
> BYA / BRA / %-utilisation] + height**) **without reading an ordinance text/PDF**. This definition
> is IDENTICAL across every jurisdiction (Denmark / Madrid / Saudi / Barcelona / Norway / Germany /
> France …) so the scores are directly comparable. Derived from direct endpoint/schema checks, not
> assumed from the jurisdiction's open-data reputation.

| Jurisdiction | Rate |
|---|---|
| **Denmark** | **~96%** |
| Madrid | ~68% |
| Saudi (national) | ~55% |
| Barcelona | ~48% |
| Norway (national) | ~32% |
| Germany (national) | ~28% |
| France (national) | ~22% |

**Denmark is the ceiling exemplar** — the reference every other jurisdiction's plan points at. It is
the one jurisdiction where the number is genuinely ~96% because **the values already exist as
digitised, machine-readable data**, not as prose locked in a scanned PDF (Barcelona/Madrid) and not
behind an unfilled schema slot (Germany/Norway). It reaches the ceiling because Denmark is a
**DATA-FILL ceiling, not an access wall** — the national register (Plandata.dk) is fully open and
keyless; the only limit is which plans publish which number, and even that residual is overwhelmingly
born-digital text keyed to Plandata ids, not an image-OCR wall.

### ⚠ What the 96% is, exactly (the honesty reconciliation — C58 §1.2/§1.4)

Two measured numbers sit behind this headline; both are stated so nobody reads 96% as "pure WFS
fields":

- **~87% is delivered as pure structured WFS fields, today, with zero document access.** Live
  measurement: **87.3%** of byzone clicks return ≥1 usable dimension (L-609, area-weighted
  Monte-Carlo N=300, seed 20260723; independently replicated at 85.5%, N=380, L-611 — within CI). This
  is the strictest possible reading of the metric.
- **~96% is the fraction of byzone queries for which zone + density + height exist as *digital,
  machine-readable data*** — the ~87% pure structured fields **plus ≈9 pp** that is born-digital
  machine-readable plan text keyed to a Plandata plan/ramme id, recoverable **deterministically with
  no image-OCR and no human reading a PDF** (L-611 §2: ≈79% of the ~13 pp gap is born-digital text; the
  ramme number is a Plandata *data-entry* gap, not a document omission — it is present verbatim in a
  born-digital consolidated `kommuneplan`, located by anchoring on the ramme id the feature already
  carries). L-611 §4 puts this text-recoverable ceiling at **≈96–97%**.

So the 96% headline is Denmark's **data-readiness rate**: for ~96% of byzone parcel queries the answer
genuinely *exists as digital data*. Only ~4% requires true image-OCR (~1.8 pp scanned minority) or is a
genuine source omission (~1–2 pp — recreational zones that cap no building, `kortbilag`-drawing-only
dims, or numbers a plan defers to national BR18). **Do NOT claim 100%; do NOT quote a single blended
"%" across the dimension / coverage / setback axes** — see the field table.

---

## Field-by-field breakdown

The headline is the weighted read of the three metric components — **zone/use code + density + height**
(the rows marked ◆). The remaining rows are supporting context that Denmark also delivers well but
which do not define the dimensional-fill number.

| Field | Structured? | Source | Score |
|---|---|---|---|
| Parcel geometry | ✅ Structured | National cadastre (Matriklen / Datafordeler); plan layers delivered in EPSG:25832 (metric — shoelace = m² directly). One national product, no per-municipality variation. | **~95%** |
| Plan/zone existence + boundary | ✅ Structured | `theme_pdk_zonekort_samlet_v` (byzone/landzone/sommerhus) + the plan layers. **98.3%** of byzone clicks land on ≥1 plan feature (L-609). Keyless national WFS. | **~98%** |
| Zone/use code ◆ | ✅ Structured | `anvendelsegenerel` / `anvgen` on lokalplan / delområde / kommuneplanramme, classified onto the C58 closed vocabulary (`mapPlandataToZoningRecord`). | **~95%** |
| Density metric (FAR via `bebygpct`) ◆ | ✅ Structured where published; ⚠️ born-digital text for the residual | `bebygpct`/100 = bebyggelsesprocent = FAR (etageareal/grundareal), on lokalplan / delområde / ramme. Part of the measured dimensional fill. `maxCoverage` (ground-coverage %) has **no plan-field source** → honest `null`. | **~87% pure-structured → ~96% incl. born-digital text** |
| Max height (parcel-level) ◆ | ✅ Structured where published; ⚠️ born-digital text for the residual | `maxbygnhjd` (metres, passthrough) + `maxetager` (floored to int) on lokalplan / delområde / ramme / **byggefelt**. Part of the same measured fill. | **~87% pure-structured → ~96% incl. born-digital text** |
| Setback / alignment | ❌ Absent (honest `null`) | Per-edge setbacks (`byggelinjer`) are a **separate** Plandata dataset, not carried on the plan feature. Denmark is coverage-and-FAR / height-and-storeys governed, **not** setback- or alignment-derived (README; ADR-0270). | **~5%** (separate axis; ~0% delivered today) |
| Building footprint + height (LOD1/2) | ⚠️ Partial — source known, spike not run | Danmark i 3D + GeoDanmark (LOD2, real roofs) + DHM; integration effort rated LOW. The DK context spike is **NOT STARTED** (`topics/buildings-lod-height.md`) so this is not yet live-probed in this tree. Separately, `theme_pdk_byggefelt_vedtaget` supplies a real binding footprint *polygon* at ≈6.0% of byzone clicks (23.9% binding). | **~70%** (source known; unverified in-tree) |
| Terrain (DTM/DSM) | ✅ Structured (source), ⚠️ not probed in-tree | Danmarks Højdemodel (DHM) — national, free, complete LiDAR terrain. Well-established national product; not yet live-probed under this jurisdiction tree (topics spike NOT STARTED). | **~95%** |
| Heritage overlay | ⚠️ Partial | Fredede og bevaringsværdige bygninger (FBB) national register + the plan `zonestatus`/overlay tags (`Byzone`/`Landzone`, and `Bindende byggefelt` where a binding footprint exists). Not independently probed per-parcel in this tree. | **~60%** |

**Separate axes (do not blend into the dimensional %):**

| Axis | Today | Ceiling / source |
|---|---|---|
| Footprint / coverage (`maxCoverage`) | 0% delivered | ≈1.4% of byzone clicks (6.0% byggefelt-present × 23.9% binding, L-611 §3.5) — Denmark's ONLY coverage source; ADR-gated cross-layer wiring (needs an L0 footprint-ring field + downstream C57 parcel-intersection). |
| Setbacks (`byggelinjer`) | 0% delivered | separate Plandata dataset; future layer wiring. |

---

## The structural gap — why Denmark is the outlier at ~96%

Every other jurisdiction in the benchmark is held down by one of two structural facts: the number lives
as **prose in an ordinance PDF** (Spain/Barcelona/Madrid — an OCR + parcel-binding wall), or the
**schema defines a slot but it is an unfilled placeholder** and the real value is prose
(Germany's BauNVO, Norway's `BestemmelseUtnyttingsgrad` stub). Denmark has **neither** wall:

1. **The numbers exist as structured fields in one open national register.** `bebygpct`, `maxbygnhjd`,
   `maxetager`, `anvendelsegenerel` are first-class WFS attributes on the adopted plan features
   (`geoserver.plandata.dk`, WFS 2.0, keyless), verified live 2026-07-23. A parcel query returns FAR +
   height + use code as machine-readable fields for ≈87% of byzone clicks with **zero document access**.
   The delområde layer alone supplies the winning dimension for **33.7%** of byzone clicks — the
   §USABLE-FALLBACK instrument chain (`byggefelt → delområde → lokalplan → ramme`) is load-bearing, not
   decoration.

2. **Even the ~13 pp residual gap is digitised, not a scan wall.** Of the byzone gap, **≈79% is
   born-digital, machine-readable plan text** keyed to a Plandata plan/ramme id (L-611 §2, N=52 live gap
   points): 40.4% clean text-pull from the specific plan PDF + 38.5% ramme-id localization within a
   born-digital consolidated `kommuneplan`. Only **13.5%** is a scanned older lokalplan needing true
   image-OCR, and only **≤7.7%** is genuinely plan-omitted (an honest source absence — e.g. `33.ROS`, a
   recreational zone that legitimately caps no building). The ramme number sits in a born-digital
   document located by a deterministic id anchor — a **Plandata data-entry gap, not a document
   omission**.

That is the whole reason the ceiling is genuinely ~96% here and not elsewhere: **Denmark's values are
digitised.** The residual is a data-fill limit at source, not an access wall we could remove and not a
number we may fabricate (C58 §1.4).

---

## What would raise the rate (the last ~4%)

| Action | Rate impact | Effort |
|---|---|---|
| Born-digital text-pull + ramme-id localization of the gap (the cheap, OCR-free path) — reuse the shared `ORDINANCE-EXTRACTION-PIPELINE` Stage-2 born-digital text branch; the `doklink` already gives the exact PDF per feature | Realizes the headline: lifts the *pure-structured* 87% to the **~96–97%** digital-data ceiling (recovers ≈79% of the ~13 pp gap) — as `pipeline-extracted-unverified` until the L-449 human gate signs off | Medium — no scan pipeline; deterministic text-pull + a ramme-id anchor stage |
| Image-OCR of the scanned lokalplan minority (13.5% of the gap) | **+~1.8 pp → ~98%** | Higher — true DocumentAI OCR; reuse the same shared Spain OCR pipeline, do not build a second |
| Byggefelt footprint → `maxCoverage` (coverage axis, ADR-gated) | New axis: ~1.4% of byzone clicks — Denmark's only coverage source; keep DISTINCT from the dimensional % | Cross-layer: L0 footprint-ring field + downstream C57 parcel-intersection + the (already-live) `isBindingFootprint` gate |
| Wire the `byggelinjer` layer (setbacks) | New axis: setback delivery from ~0% | Low–Medium — a separate Plandata layer |
| Ratify §USABLE-FALLBACK legal precedence (Danish-planner sign-off) | 0 pp to the number; unlocks `confidence: 'structured'` on the fall-through dimensions | Low — one human sign-off (VERIFICATION.md, PENDING) |

The genuinely-unreachable residual (~1–2 pp — plan-omitted / `kortbilag`-drawing-only / BR18-deferred)
is **not closable and not fabricatable.**

---

*Last updated: 2026-07-24. Plandata.dk WFS 2.0 CONFIRMED live and keyless (2026-07-23); the ~87%
pure-structured byzone fill and the ≈96–97% born-digital-text ceiling are both VERIFIED-LIVE from
L-609/L-610/L-611. Context layers (LOD buildings, DHM terrain, FBB heritage) have known national sources
but their in-tree spikes are NOT STARTED. Two legal items (§USABLE-FALLBACK precedence; byggefelt
bindingness) PENDING a Danish planner (VERIFICATION.md).
Maintainer: UNASSIGNED.*
