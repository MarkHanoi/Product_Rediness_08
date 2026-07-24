# Rate Implementation Plan — Córdoba (`es-an`, INE 14021) city

**Current rate:** ~8% municipality-wide (see [`RATE.md`](./RATE.md)) · **Realistic ceiling:** ~8%
municipality-wide until pilot coverage extends / ~89% partial · ~19% full-numeric **within the Sur +
Noroeste pilot** (post-sign-off) · **Gap to Denmark (~96%):** ~88 pts municipality-wide ·
**Last updated:** 2026-07-24 · **Owner:** UNASSIGNED

> ⚠ Córdoba's rate has two denominators. **~8%** is municipality-wide (the headline). **~89% partial /
> ~19% full** is the pilot area (2 of ~10 districts) after human sign-off. The gap between them is
> **pilot COVERAGE**, and it is external (COACo) — not something the pipeline can close alone.

---

## 1 — The ceiling: what "maximum" means here

Córdoba is **PDF-bound but the cleanest possible version of it** — a shape-B city (modern consolidated
PGOU-2001, clean scanned ordinances, low OCR burden, numbers keyed to a live GIS calificación). The
single structural fact that sets the ceiling is **not** OCR difficulty (that is solved — 12 clean
documents, zero numeric-field accuracy loss); it is **calificación coverage**: the geometry that binds
a parcel to its ordinance exists for only 2 of ~10 districts. So there are two ceilings:

- **Municipality-wide: ~8%, and it stays there** until COACo extends the pilot or the PGOU PDFs are
  curated per-district against SITUA parcel geometry. This is external work, not a PRYZM lever.
- **Pilot area (Sur + Noroeste, 5,725 parcels): ~89% partial / ~19% fully-numeric**, reachable *after*
  human verification of the already-completed extraction. Capped below 100% by two honest limits: the
  two dominant families' edificabilidad is DERIVED (algorithm → `null`), and Manzana Cerrada's height
  is a per-street-width table needing a street-width resolver.

Córdoba is the **proof case for the national ordinance-extraction pipeline** (`ORDINANCE-EXTRACTION-
PIPELINE.md`): it shows OCR is a solved problem for shape-B cities and that the real gates are
verification + coverage.

---

## 2 — Phase tracker

Status vocabulary is FIXED: **NOT STARTED · IN PROGRESS · BLOCKED · SHIPPED · VERIFIED · N/A**.
"Rate: from→to" is stated per denominator (pilot vs municipality-wide) because they diverge. ⚠ Status
tracks WORK; the rate only moves when RATE.md is re-derived.

| Phase | Goal | Unlocks | Rate: from→to | Effort | Status | Owner |
|---|---|---|---|---|---|---|
| **0** | Assess — endpoint probe + write RATE.md | the honest baseline | — → ~8% | done | **VERIFIED** (`findings/CALIFICACION-ENDPOINT-PROBE.md`) | UNASSIGNED |
| **1** | Data-access: find the live calificación endpoint | a parcel→ordenanza binding for the pilot districts | (access, not rate) | done | **SHIPPED** (COACo WFS, 2 districts) | UNASSIGNED |
| **2** | OCR/vision extraction of all 15 ordinance PDFs | the numeric values (`pipeline-extracted-unverified`) | (extraction, not rate) | done | **SHIPPED** (`findings/OCR-EXTRACTION-RESULTS.md`) | UNASSIGNED |
| **3** | **Human verification** of the extracted values against source crops (L-449) | pilot: `pipeline-extracted-unverified` → `estimated-ruleset` | pilot 0% → ~19% full / ~89% partial | Medium (per-value human pass) | **NOT STARTED** — `SOURCES.md` §C empty, `VERIFICATION.md` DRAFT | UNASSIGNED |
| **4** | Register the authored starter pack `esCordobaPGOU2001.ts` (after the schema grows a `pipeline-extracted-unverified` tier + sign-off) | a shippable amber pack for the pilot | pilot (realises Phase 3) | Medium | **NOT STARTED** (pack authored, UNREGISTERED) | UNASSIGNED |
| **5** | Córdoba street-width resolver | Manzana Cerrada height (per-street-width table → parcel answer) | pilot partial → fuller | Medium | **NOT STARTED** | UNASSIGNED |
| **6** | Extend calificación coverage (COACo pilot → all districts, or per-district SITUA curation) | the ONLY lever on the municipality-wide rate | municipality ~8% → higher | High — **BLOCKED on external COACo / a curation programme** | BLOCKED | UNASSIGNED |
| **cert** | Per-family L-449 sign-off + dual-source corroboration (not run — single-source docs) | moves values toward `structured`; re-derives the rate | — | parallel | **NOT STARTED** | UNASSIGNED |

---

## 3 — The gap to Denmark (~96%)

**An ~88-point municipality-wide gap, and it is two separators — but NOT the OCR one people expect:**

- **(a) Numbers in PDFs — yes, but this is the SOLVED half.** The extraction is done and the documents
  are clean; the residual is *verification* (the L-449 gate, which caps climb speed) and the **DERIVED
  trap** — the two dominant families state edificabilidad as an algorithm, not a number, so a correct
  pipeline emits `null` and the fully-numeric rate stays ~19% even in the pilot. That is honesty, not a
  failure: manufacturing the number would be the confident-wrong error the gates exist to prevent.
- **(b) Fragmentation — the binding gap.** Calificación geometry covers 2 of ~10 districts. This is the
  dominant reason the municipality-wide rate is ~8% not ~89%, and it is **external** — it moves only
  when COACo extends the pilot or someone curates the PGOU PDFs per-district against SITUA.

Denmark has neither: national structured fields and national coverage. Córdoba has clean documents and
2-district coverage. Closing the gap is a coverage-and-verification programme, not an engineering one.

---

## 4 — Dependencies, blockers, and cross-jurisdiction reuse

- **Blocked:** Phase 6 (the only municipality-wide lever) on external COACo pilot extension or a
  per-district curation programme. Phase 4 on the schema growing a `pipeline-extracted-unverified` tier
  and the human sign-off of Phase 3.
- **Reuse — Córdoba is the pipeline's proof case, and it pays forward:** the ordinance-extraction
  pipeline (`docs/04-reference/ORDINANCE-EXTRACTION-PIPELINE.md`) built and validated here generalises
  to every shape-B Spanish city for free (same clean-scanned-PGOU shape). The two honesty guards it
  proved out — the **arithmetic cross-check** (catches misreads) and the **algorithm/valuation prose
  check** (catches the confident-wrong *status* number the arithmetic cannot, e.g. Barcelona's
  valuation-assumption trap L-590h §3.2) — are corpus-wide gates. The **street-width resolver** (Phase
  5) is the same machinery Barcelona needs for its nucli-antic height table. And the national SIU
  verdict discovered here (SIU serves clasificación, **there is no national calificación WMS** —
  calificación is per-jurisdiction) is a proven negative that saves Barcelona and Madrid the same hunt.
- **Depends on:** C58 §1.2/§1.4/§1.11/§2.2, ADR-0269/0270, L-449, L-450. Block-ring is **0/3 in
  Córdoba** (`SPAIN-CADASTRAL-DISSOLVE-PROBE`) — the tolerant-mode dissolve fix (L-535) is a
  prerequisite for any block-derived rule kind here, though Córdoba's shapes (front-on-vial, retranqueos)
  lean on alignment/setback more than block-derivation.

---

*Model references: **Denmark** `../../dk/` (ceiling, ~96%) · **Barcelona**
`../es-ct/08019-barcelona/` (pilot climb). Governing: **C58** (fidelity/provenance),
**ADR-0269** (curate-then-serve), **L-449** (human-verification gate), **L-450** (PDF corpus on
object storage), `ORDINANCE-EXTRACTION-PIPELINE.md` (the horizontal capability Córdoba proves out).*
