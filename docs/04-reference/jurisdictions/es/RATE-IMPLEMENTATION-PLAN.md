# Rate Implementation Plan — Spain (`es`) national

**Current rate:** ~34% (see [`RATE.md`](./RATE.md)) · **Realistic ceiling:** ~55% ·
**Gap to ceiling:** ~21 pts · **Gap to Denmark (~96%):** ~62 pts ·
**Last updated:** 2026-07-24 · **Owner:** UNASSIGNED

---

## 1 — The ceiling: what "maximum" means here

Spain is **PDF-bound, not structured-bound**. Its ceiling is NOT Denmark's ~96%, because Denmark's
numbers already exist as structured national fields (Plandata) and Spain's do not — they are authored
per-municipality inside ~8,131 PGOU/PGM ordinance PDFs (L-450). The single structural fact that sets
the ceiling: **the national planning-data layers deliver the zone CODE, never the dimensional NUMBER**
(confirmed live across all three Tier-1 regions, 2026-07-20). So the maximum reachable rate is a
function of how much of that PDF corpus a transcription/OCR pipeline + the L-449 human gate can
convert to structured values — and that climb is bounded by two facts the city measurements already
proved: (a) OCR of the derived-planning corpus yields a *sector FAR* but **~0% parcel-level height**
(Barcelona L-590h — height is on un-OCR-able plànol block-labels), and (b) coverage is delivered
per-municipality, so every point of national gain is 8,131 separate ingestion problems, not one.

A realistic national ceiling is therefore **~55%**: the strong Catastro geometry base (~95% parcel,
~55% footprint) plus a transcribed zone→number table for the high-population regions plus OCR-partial
answers for the shape-B long tail — but **not** the parcel-level heights that need plànol
vectorisation, and **not** the ~15% of the country whose PGOUs are pre-digital scans behind heritage
regimes. The number climbs one region and one city at a time; it does not jump.

---

## 2 — Phase tracker

Status vocabulary is FIXED: **NOT STARTED · IN PROGRESS · BLOCKED · SHIPPED · VERIFIED · N/A**.
"Rate: from→to" is the honest estimated jump in the RATE.md number when the phase lands — NOT a claim
it has landed. ⚠ Status tracks WORK; the rate only moves when RATE.md is re-derived.

| Phase | Goal | Unlocks | Rate: from→to | Effort | Status | Owner |
|---|---|---|---|---|---|---|
| **0** | Assess — live endpoint/schema probes across the CCAA; write this RATE.md | the honest baseline | — → ~34% | done | **VERIFIED** (`SPAIN-ZONING-LIVE-VERIFICATION`, `es/README.md`) | UNASSIGNED |
| **1** | Catastro parcel + construction as the national geometry spine (parcel-select everywhere common-regime) | the denominator for every downstream number | ~34% (already in the base) | shipped | **SHIPPED** (in production) | UNASSIGNED |
| **1b** | Foral-cadastre adapter (País Vasco + Navarra) | parcel-select for 16 SEED municipalities | +~1% → ~35% | Medium | NOT STARTED | UNASSIGNED |
| **2** | Pilot city depth — **Barcelona** clau packs (the proven climb; see [`es-ct/08019-barcelona/`](./es-ct/08019-barcelona/RATE-IMPLEMENTATION-PLAN.md)) | the reusable pattern: PGM transcription + block-derived construction + refusal vocabulary | Barcelona 24%→~48%; national +~2% → ~37% | ~21 wk (1 dev) | **IN PROGRESS** (1b/1c refusals SHIPPED; 13a shipped) | UNASSIGNED |
| **3** | Tier-1 region zone→number transcription (Cataluña / Madrid / Valencia most-common zones), L-449-gated | structured density+height for ~42% of the SEED-318 tier | +~10% → ~47% | High (human, per-region) | NOT STARTED | UNASSIGNED |
| **4** | Ordinance-extraction (OCR) pipeline for shape-B cities (clean scanned PGOU → values → sign-off) | partial numeric answers for the long-tail municipalities (Córdoba is the proof case) | +~6% → ~53% | High | **IN PROGRESS** (Córdoba pilot extracted, unverified) | UNASSIGNED |
| **5** | PNOA LiDAR nDSM (heights) — licence-gated | measured building height replacing coarse floor-count | +~2% → ~55% (ceiling) | Med–High; **BLOCKED on L-584 V2 licence** | BLOCKED | UNASSIGNED |

---

## 3 — The gap to Denmark (~96%)

**Two of the three canonical structural separators apply, and both are load-bearing:**

- **(a) Numbers are in PDFs, not structured fields.** Spain's version is the sharpest in the corpus:
  the zone code IS structured (the regional WFS layers), but the dimensional value was never required
  to be digitised, so it sits in the ordinance prose. This needs transcription + the L-449 gate, and
  for the derived-planning slice OCR recovers a sector FAR but **not** the parcel height (it is on the
  plànol, not in the text — Barcelona L-590h, measured over 24 documents).
- **(b) Delivery is fragmented across ~8,131 municipalities.** Even a perfect per-municipality
  pipeline is 8,131 endpoints and 8,131 human sign-offs. Denmark is one national Plandata; Spain is
  the opposite extreme in the benchmark set. This is why the national number climbs city-by-city and
  region-by-region, and why "finish Barcelona to a defensible standard before widening" is the
  measured strategy (`SPAIN-GEODATA-SOURCE-COVERAGE` §10.8), not sentiment.

Licence-gating (c) applies only to the height layer (PNOA LiDAR, L-584 V2), not to the zoning numbers.

---

## 4 — Dependencies, blockers, and cross-jurisdiction reuse

- **Depends on:** C58 (fidelity/provenance), ADR-0269 (curate-then-serve), ADR-0270 (the
  setback/alignment/explicit-area rule union — Spain uses all three and Madrid's `Fondo` polyline is
  the reason `explicit-area` exists), ADR-0271 (Barcelona's block-derived depth construction), L-449
  (the human gate), L-450 (the PDF corpus on object storage).
- **Blocked:** Phase 5 (heights) on the L-584 V2 PNOA-LiDAR commercial-redistribution licence — a gate
  that can veto the whole nDSM branch and therefore runs before any pipeline work.
- **Reuse that makes the corpus cheaper than N separate builds:** the **ordinance-extraction
  pipeline** (`docs/04-reference/standards/ORDINANCE-EXTRACTION-PIPELINE.md`) built for Córdoba generalises to
  every shape-B Spanish city for free (same clean-scanned-PGOU shape); the **`explicit-area` ringRef
  resolver** designed for Madrid NZ 1 serves any jurisdiction that publishes a buildable footprint;
  the **`dissolveParcelsToBlockRing` + street-width** machinery from Barcelona serves every
  *alineació-de-vial* zone nationwide; and Valencia's **`url_abs`** (governing-document link on the
  polygon) is the model that turns PDF enumeration into a lookup. Cross-refs in
  `V1-LAUNCH-READINESS-AUDIT.md` (Pipeline A / L-393; §Barcelona complete-coverage L-538) and
  `SPAIN-CADASTRAL-DISSOLVE-PROBE.md` (block-ring success measured Barcelona 2/2 · Madrid 2/4 ·
  Córdoba 0/3 — the geometry stage fails outside Barcelona *before any rule is consulted*, which is
  why rule work is sequenced behind the dissolve fix elsewhere).

---

*Model references: **Denmark** `../dk/` (ceiling, ~96%) · **Barcelona**
`./es-ct/08019-barcelona/` (pilot climb). Governing: **C58** (fidelity/provenance),
**ADR-0269** (curate-then-serve), **L-449** (human-verification gate).*
