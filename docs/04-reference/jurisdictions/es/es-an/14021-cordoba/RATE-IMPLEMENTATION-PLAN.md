# Rate Implementation Plan — Córdoba (`es-an`, INE 14021) city

**Current rate:** ~8% municipality-wide (see [`RATE.md`](./RATE.md)) · **Realistic ceiling:**
**UNKNOWN until the authoritative GMU geometry is investigated** — the official Calificación mapping
exists **city-wide** (see below); recovering the upstream vector geometry is the highest-value task ·
~89% partial / ~19% full-numeric **within the Sur + Noroeste pilot** (post-sign-off) ·
**Gap to Denmark (~96%):** ~88 pts municipality-wide **at today's coverage** ·
**Last updated:** 2026-07-24 · **Owner:** UNASSIGNED

> ⚠ **CEILING REVISED (2026-07-24, `findings/CORDOBA-DATA-RECON-SPIKE.md`).** The prior "~8%
> municipality-wide until COACo extends" framed the ceiling as an EXTERNAL wait. The recon spike proved
> that framing wrong: the **Gerencia Municipal de Urbanismo (GMU)** — the *authority*, of which COACo is
> only a downstream vectorizer — publishes the PGOU-2001 **Calificación, Usos y Sistemas** series
> **municipality-wide** as **77 georeferenceable raster sheets** (49 urban `CUS01W…CUS49W` + 28
> peripheral). So the calificación *knowledge* AND *mapping* both exist **city-wide**; the ~8% is a
> **vectorization artifact**, not a structural limit. The municipality-wide ceiling is therefore
> **UNKNOWN until the GMU-raster→vector acquisition (WS2) is scoped** — and it is an *in-house
> engineering* task on already-published public data, NOT a wait-on-COACo external dependency.
>
> ⚠ Córdoba's rate still has two denominators. **~8%** is municipality-wide *at today's vectorized
> coverage*. **~89% partial / ~19% full** is the pilot area (2 of ~10 districts) after human sign-off.
> The gap between them is **COVERAGE (vectorization)** — now understood as an engineering lever (WS2),
> not only an external COACo one.

---

## 1 — The ceiling: what "maximum" means here

Córdoba is **PDF-bound but the cleanest possible version of it** — a shape-B city (modern consolidated
PGOU-2001, clean scanned ordinances, low OCR burden, numbers keyed to a live GIS calificación). The
fact that sets the *pilot* ceiling is **not** OCR difficulty (that is solved — 12 clean documents, zero
numeric-field accuracy loss); it is **vector calificación coverage**: the geometry that binds a parcel
to its ordinance is *vectorized* for only 2 of ~10 districts. But — corrected by the recon spike — the
calificación **mapping itself exists city-wide** (GMU publishes it as 77 raster sheets); only the
*vectorization* stops at 2 districts. So there are two ceilings:

- **Municipality-wide: UNKNOWN — the highest-value open question.** It is NOT structurally ~8%. GMU has
  published the Calificación, Usos y Sistemas series **municipality-wide as georeferenceable raster**
  (`findings/CORDOBA-DATA-RECON-SPIKE.md §1, §3b`). The ceiling is set by **WS2 (raster→vector
  acquisition)** — an in-house engineering task on public data — not by an external COACo wait. Scope
  WS2 before quoting any municipality-wide ceiling.
- **Pilot area (Sur + Noroeste, 5,725 parcels): ~89% partial / ~19% fully-numeric**, reachable *after*
  human verification of the already-completed extraction. Capped below 100% by two honest limits: the
  two dominant families' edificabilidad is DERIVED (algorithm → `null`), and Manzana Cerrada's height
  is a per-street-width table needing a street-width resolver.

**KNOWLEDGE vs COVERAGE (the split that makes the ceiling tractable):** verification scales
per-ORDINANCE, not per-parcel. The PGOU normativa is ~10 families / 15 subzone documents governing the
**whole municipality**; each is L-449-verified **once** and reused across every district forever. The
only per-district work is WS2 (geometry) + WS4 (binding). So extending coverage adds *zero* new
verification — the numeric knowledge is already city-wide the moment WS3+WS6 are done.

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
| **6** | Extend calificación coverage — **WS2: vectorize the 41 remaining urban + 28 peripheral GMU CUS raster sheets** (in-house), OR COACo extends its pilot | the ONLY lever on the municipality-wide rate | municipality ~8% → **UNKNOWN (scope WS2)** | High — but **in-house engineering on public GMU rasters**, NOT solely a COACo wait (`CORDOBA-DATA-RECON-SPIKE.md §7 WS2`) | NOT STARTED | UNASSIGNED |
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

- **Phase 6 (the only municipality-wide lever) is NO LONGER purely externally blocked.** The recon
  spike found the authoritative GMU calificación published **municipality-wide as raster** (77 sheets),
  so Phase 6 = **WS2, an in-house raster→vector acquisition** on public data (COACo extending its own
  pilot is one path, not the only path). The one residual external caveat: `www.gmucordoba.es` is
  network-unreachable from our current vantage (`ECONNREFUSED`) — pulling the raw CUS rasters direct
  needs a Spanish/EU egress or proxy (they are also reachable via the COACo `/doc/planos/cus/` proxy).
  Phase 4 still gated on the schema growing a `pipeline-extracted-unverified` tier and Phase 3 sign-off.
- **Reuse — Córdoba is the pipeline's proof case, and it pays forward:** the ordinance-extraction
  pipeline (`docs/04-reference/standards/ORDINANCE-EXTRACTION-PIPELINE.md`) built and validated here generalises
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
