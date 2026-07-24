# Data Readiness Rate — Córdoba (`es-an`, INE 14021) city

**Headline rate: ~8%** (municipality-wide) · **ASSESSED** (OCR extraction complete, unverified)

> **Structured dimensional fill rate** — the fraction of parcel-level building-rule queries that
> return a complete, machine-readable answer (**zone/use code + a density metric [FAR / coverage /
> BYA / BRA / %-utilisation] + height**) **without reading an ordinance text/PDF**. This definition
> is IDENTICAL across every jurisdiction (Denmark / Madrid / Saudi / Barcelona / Norway / Germany /
> France …) so the scores are directly comparable. Derived from direct endpoint/schema checks, not
> assumed from the jurisdiction's open-data reputation.

| Jurisdiction | Rate |
|---|---|
| Denmark | ~96% |
| Madrid | ~68% |
| Saudi (national) | ~55% |
| Barcelona | ~48% |
| Spain (national) | ~34% |
| Norway (national) | ~32% |
| Germany (national) | ~28% |
| France (national) | ~22% |
| **Córdoba** | **~8%** |

Córdoba is the **shape-B OCR city** — a modern consolidated plan (PGOU-2001) with clean scanned
ordinances — and its rate is the lowest in the assessed set for reasons that are *cited, not a
data-quality excuse*. The metric asks for a structured answer **without reading a PDF**, and Córdoba's
zoning numbers live in scanned ordinance PDFs. Three facts hold the municipality-wide rate to single
digits:

1. **Calificación geometry (the structured zone code) is published for 2 of ~10 districts only** — the
   IMDEEC-funded COACo pilot (Sur + Noroeste, ~1.63 km²). Everywhere else the best answer is SIU
   *clasificación* (land class: urbano / urbanizable / no urbanizable) — **not an envelope**
   (`findings/CALIFICACION-ENDPOINT-PROBE.md`).
2. **The density + height numbers are OCR-extracted from scanned PDFs and NOT human-verified** — tier
   `pipeline-extracted-unverified`. Under the L-449 gate they cannot ship `structured`, and per the
   metric they are not a without-a-PDF answer.
3. **For the two dominant families, the key numbers are not even scalars:** Manzana Cerrada (the
   largest by area) has its height as a **per-street-width TABLE** (null scalar until a street-width
   resolver exists — the same gap as Barcelona) and its edificabilidad **DERIVED by algorithm**;
   Colonia Tradicional Popular (the most common by parcel) has edificabilidad DERIVED too.

⚠ **The CEILING is far higher than the rate.** The OCR pilot MEASURED that ~19% of pilot parcels get a
*fully-numeric* envelope and ~89% get at least a *partial* one after human sign-off. So Córdoba's
problem is **pilot COVERAGE (2/10 districts) + verification**, not OCR — the OCR is done and the
documents are clean. See [`RATE-IMPLEMENTATION-PLAN.md`](./RATE-IMPLEMENTATION-PLAN.md) §1.

---

## Field-by-field breakdown

Denominator = a parcel click anywhere in Córdoba (INE 14021), whole municipality.

| Field | Structured? | Source | Score |
|---|---|---|---|
| Parcel geometry | ✅ Structured | Catastro INSPIRE WFS (national) + `coaco:vcatastro_urbanismo` (5,725 parcels in the pilot). Block ring: **0/3 in Córdoba** (`SPAIN-CADASTRAL-DISSOLVE-PROBE`) — the dissolve fails before any rule is consulted. | **~85%** geometry; block-ring ❌ |
| Plan/zone existence + boundary | ⚠️ Partial | PGOU-2001 confirmed in force via SIU `Planeamiento_Vigente`. Calificación polygons (`coaco:ordenanzas`, 453) live — **2 of ~10 districts only**. | **~25%** |
| Zone/use code (calificación → ordenanza) | ⚠️ Pilot-only | COACo WFS carries the ordenanza code + a document `link` per polygon — structured, but geographically limited to Sur + Noroeste. Rest of city: SIU clasificación (land class only). | **~20%** |
| Density metric (edificabilidad / FAR) | ❌ OCR-from-PDF, unverified + DERIVED | OCR-extracted (`findings/OCR-EXTRACTION-RESULTS.md`): clean scalars for PAS/OA/UAD (minor families); **DERIVED (algorithm) for Manzana Cerrada + Colonia Tradicional Popular** (the two dominant families) — `null`, never a number. MC-3 = 3.50 flagged out-of-range → human. All `pipeline-extracted-unverified`. | **~6%** |
| Max height (parcel-level) | ❌ Table / OCR-unverified | Clean scalars for the minor families (PB+1/7 m etc.). **Manzana Cerrada height is a per-street-width TABLE → null scalar** (needs a Córdoba street-width resolver, not built). All unverified. | **~5%** |
| Setback / alignment (ADR-0270) | ⚠️ Extracted, unverified | Front on the vial line (0) for MC/CTP; real retranqueos for UAD/PAS/OA. Kind is *calificación → ordenanza → document* (same shape as Barcelona's clau); NOT a stored-FAR or setback source by default. | **~15%** |
| Building footprint + height (LOD1/2) | ⚠️ Partial | Catastro constructions (national footprint). Height coarse; nDSM ❌. | **~40%** footprint |
| Terrain (DTM/DSM) | ✅ / ❌ | IGN MDT + Cesium World Terrain. nDSM ❌. | **~85%** terrain; nDSM ❌ |
| Heritage overlay | ❌ Separate regime | The **casco histórico is under a separate PEPCH** (Plan Especial), plus CTP1-Campo de la Verdad defers to the Conjunto Histórico Tomo VI (a document not held) and Elemento Protegido is a preservation regime with no new envelope. Cited refusals, not data. | **~5%** |

---

## The structural gap

**The wall is not OCR — that is solved — it is pilot COVERAGE and verification.** Córdoba is the
cleanest case for the extraction pipeline: 12 distinct readable documents (2 born-digital text, 10
pristine clean rasters), zero OCR-accuracy loss on the numeric fields, image quality no obstacle. The
15-ordinance extraction is *done*. But two facts keep the structured-fill rate at ~8% municipality-wide:

**Coverage.** The calificación geometry that binds a parcel to an ordinance exists for only the Sur +
Noroeste pilot (~1.63 km², 2 of ~10 districts). Outside it, a click resolves to SIU *clasificación* — a
land class, not an envelope — so the whole-municipality fraction with an extractable envelope is
**effectively 0%** until COACo extends the pilot or the PGOU PDFs are curated per-district against SITUA.

**Verification + the DERIVED trap.** Every extracted value is `pipeline-extracted-unverified` (single-pass
vision, no human sign-off) — so `SOURCES.md` §C (the verified table) is empty and nothing ships
`structured`. And the two dominant families' density is stated as *"resultante de la aplicación de las
Normas de composición"* — an **algorithm, not a number**; the pipeline correctly emits `null` rather
than manufacture a value (the confident-wrong trap the auto-gates exist to stop, IND-1/2/3 ocupación
being the verbatim example). So even in the pilot, the *fully-numeric* rate is ~19%, not ~89%.

---

## What would raise the rate

| Action | Rate impact | Effort |
|---|---|---|
| Human-verify the 15-ordinance OCR extraction (sign off `pipeline-extracted-unverified` → `estimated-ruleset`) against source crops | Unlocks the pilot: ~19% fully-numeric / ~89% partial *within Sur + Noroeste* | Medium (per-value human pass) |
| COACo extends the calificación pilot beyond 2/10 districts (or per-district PGOU curation against SITUA) | The only lever that raises the *municipality-wide* rate off ~0% | High (external / curation) |
| Build a Córdoba street-width resolver | Converts the Manzana Cerrada per-street-width height table into a parcel answer (same gap as Barcelona `bcnAlcadaNucliAntic.ts`) | Medium |
| Recover the dead-link families (Unifamiliar Aislada `O_UAS1`) + resolve Campo de la Verdad (Tomo VI) | Closes 2 of the 4 not-extractable families | Low–Medium |
| Register the authored starter pack `esCordobaPGOU2001.ts` after sign-off + a `pipeline-extracted-unverified` schema tier | Turns extracted values into a shippable amber pack | Medium |

---

*Last updated: 2026-07-24. Calificación endpoint (COACo WFS) confirmed live for 2 of ~10 districts;
national SIU serves clasificación not calificación (proven negative). 15-ordinance OCR extraction
COMPLETE but `pipeline-extracted-unverified` — nothing human-signed, `SOURCES.md` §C empty. Pilot-area
resolution MEASURED (~19% full / ~89% partial / ~10.5% not-extractable); municipality-wide ≈ 0%
structured today. Starter pack authored, UNREGISTERED. Maintainer: UNASSIGNED.*
