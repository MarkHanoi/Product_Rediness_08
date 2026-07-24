# Rate Implementation Plan — Madrid (`es-md`, INE 28079) city

**Current rate:** ~68% data-readiness (see [`RATE.md`](./RATE.md)) · **PRYZM engine resolution
today:** ≈ 0% · **Realistic engine ceiling:** ~60–62% of residential clicks · **Gap to Denmark
(~96%):** ~28 pts · **Last updated:** 2026-07-24 · **Owner:** UNASSIGNED

> ⚠ Madrid has two numbers and they must not be conflated. **68%** is the DATA-readiness rate (how
> much is structured/machine-readable in principle — the fixed metric). **~0% today / ~60–62% ceiling**
> is PRYZM's ENGINE resolution (what actually ships an envelope). The gap between them is wiring +
> document-sourcing, not new data. This plan closes that gap.

---

## 1 — The ceiling: what "maximum" means here

Madrid is **partly Denmark-like and partly PDF-bound — a hybrid, and that is why it clears 68%**. The
Denmark-like part: NZ 1 (historic core) publishes the buildable footprint and edificabilidad as live
structured geometry, so that slice needs *ingestion*, not transcription — the work is an engine branch,
not a human read. The PDF-bound part: NZ 4/8/5/7 (the parametric residential zones, NZ 4 dominant) hold
their *fondo edificable* and *retranqueos* as grado-structured prose in the PGOUM-97 NNUU, and ~35% of
residential land is derived-ámbito (a `derived-plan` refusal, the Barcelona trap).

The single structural fact that sets the ENGINE ceiling: **~65% of residential land is governed
directly by a Norma Zonal, and of that ~96% is NZ 3/4/1/8** ⇒ **~62% of residential clicks** is the
maximum an envelope engine reaches once the four are sourced+solvable. Above that is derived-ámbito
land that refuses honestly. The DATA-readiness ceiling is higher (~70%) because Madrid publishes the
calificación code and NZ 1 geometry regardless of whether PRYZM consumes them — but the founder metric
is envelopes, and the envelope ceiling is ~62%.

---

## 2 — Phase tracker

Status vocabulary is FIXED: **NOT STARTED · IN PROGRESS · BLOCKED · SHIPPED · VERIFIED · N/A**.
"Resolution: from→to" = PRYZM shippable ENVELOPE resolution over a Madrid residential parcel click
(the founder metric), NOT the ~68% data-readiness rate. ⚠ Status tracks WORK.

| Phase | Goal | Unlocks | Resolution: from→to | Effort | Status | Owner |
|---|---|---|---|---|---|---|
| **0** | Assess — live ArcGIS probe of `pgoum97`; rule-kind decision per NZ; write RATE.md | the honest baseline + the four rule kinds | — → 0% (SPEC) | done | **VERIFIED** (`findings/L-608-MADRID-PACK-SPEC.md`) | UNASSIGNED |
| **1** | **NZ 3** `derived-plan` refusal (volumetría específica) | a cited "no envelope — see the per-parcel ficha" answer; +the ~35% derived-ámbito refusals | 0% → 0% envelopes (but cited answers ship) | Low | **NOT STARTED** (authorable now, copy in `sources/SOURCES.md`) | UNASSIGNED |
| **2** | **`explicit-area` engine branch + NZ 1 ringRef resolver** (KG-4) | NZ 1's live footprint+`COEF_Z` data becomes a shipped envelope; reusable for every footprint-publishing jurisdiction | 0% → the NZ 1 core share | Medium (one engine unit) | **BLOCKED** on the KG-4 engine work + the `explicitAreaFootprint` interface-field fix (pre-existing tsc defect) | UNASSIGNED |
| **3** | **NZ 4** `alignment` — source *fondo edificable* per grado (NNUU Compendio 2023 Cap. 8.4), L-449 | the dominant central-Madrid residential envelope; `Alineaciones` layer already published | → most of the ~62% ceiling | High (human read, per grado) | **NOT STARTED** — DOCUMENT-gated | UNASSIGNED |
| **4** | **NZ 8 (+5, 7)** `setback` — source retranqueos per grado, L-449 | detached/open residential envelopes | → toward ceiling | High (human read) | **NOT STARTED** — DOCUMENT-gated | UNASSIGNED |
| **5** | Re-verify `PG_ORDENACION` live + `COEF_Z` parse under assertion | re-confirms the calificación endpoint (PRIOR-VERIFIED only) + makes NZ 1 edificabilidad safe | confidence, not resolution | Low | **NOT STARTED** | UNASSIGNED |
| **cert** | Per-NZ L-449 sign-off (`sources/VERIFICATION.md` — currently DRAFT, nothing signed) | moves packs to shippable; **re-derives the rate** | — | parallel | **NOT STARTED** | UNASSIGNED |

---

## 3 — The gap to Denmark (~96%)

**A ~28-point gap, the smallest in the Spanish set, and it is two of the three canonical separators:**

- **(a) Numbers in PDFs — but only for NZ 4/8/5/7.** Unlike Barcelona, Madrid's problem is *narrower*:
  the calificación code and the NZ 1 footprint are already structured, so only the parametric-zone
  scalars (fondo, retranqueos, altura) need transcription + the L-449 gate. That is a bounded human
  read of the Compendio 2023, not an open-ended OCR programme.
- **(b) Fragmentation — the derived-ámbito ~35%.** APR/APE/API/Plan Parcial land points at per-site
  documents PRYZM does not hold — the same shape as Barcelona clau 18, and it caps the envelope ceiling
  at ~62% by construction.

Madrid is closer to Denmark than any other Spanish city because it made the opposite choice for its
historic core: it *published the footprint as geometry* rather than leaving it as parameters in prose.
Denmark did that for everything; Madrid did it for NZ 1. Every additional NZ that follows that model
(if the specific volumetría of NZ 3 is ever published as geometry, it becomes `explicit-area` too)
narrows the gap.

---

## 4 — Dependencies, blockers, and cross-jurisdiction reuse

- **Blocked:** Phase 2 on the KG-4 engine work — the `explicit-area` solver branch does not exist
  (declared in the schema, no engine branch), and the discriminated-union solver is exhaustive so
  adding NZ 1 is a compile error until the branch lands. Plus the `ComputeBuildableEnvelopeInput.
  explicitAreaFootprint` interface-field fix (a pre-existing tsc defect, engine owner).
- **Reuse — Madrid pays forward the biggest shared asset in the corpus:** the **`explicit-area`
  ringRef resolver** (`findings/L-608-EXPLICIT-AREA-SOLVER-SHIPPED.md`, the merged jurisdiction-agnostic
  solver + `esMadridNZ1Provider.ts`) is the reusable unlock the JURISDICTION-PLAYBOOK flags — *any*
  jurisdiction that publishes a buildable footprint reuses it. The `fondo-line + alignment-line → ring`
  construction is a general op. Madrid's NZ 4 `alignment` also validates ADR-0270 against a second
  city (Barcelona 13a was the first), and its `Fondo de la Edificación` polyline is the canonical
  evidence that the C58 setback triple cannot represent Spanish planning — the finding that justifies
  the whole `explicit-area` kind.
- **Depends on:** C58 §1.2/§1.4/§1.11/§2.2, ADR-0270/0271, L-449. Block-ring is **2/4 in Madrid**
  (`SPAIN-CADASTRAL-DISSOLVE-PROBE`) — the tolerant-mode dissolve fix (L-535) is a soft prerequisite
  for the block-keyed `COEF_Z` join, though NZ 1 is footprint-published so less exposed to it than
  Barcelona's block-derived claus.

---

*Model references: **Denmark** `../../dk/` (ceiling, ~96%) · **Barcelona**
`../es-ct/08019-barcelona/` (pilot climb). Governing: **C58** (fidelity/provenance),
**ADR-0269** (curate-then-serve), **ADR-0270** (rule-kind union), **L-449** (human-verification gate),
**L-608** (`findings/L-608-MADRID-PACK-SPEC.md`).*
