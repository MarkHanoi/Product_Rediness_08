# Rate Implementation Plan — Badalona (`es-ct`, INE 08015)

**Current rate:** NOT MEASURED (see [`RATE.md`](./RATE.md)) · **Envelope gate:**
`BADALONA_ENVELOPE_VERIFIED = false` (cited refusal) · **Model reference:** Barcelona =
`../08019-barcelona/RATE-IMPLEMENTATION-PLAN.md` (the pilot climb this file mirrors) ·
**Last updated:** 2026-07-30 · **Owner:** UNASSIGNED

> Badalona does not yet have a rate to *climb* — it has a rate to *establish*. Phase 0 is the
> measurement, not a coverage push. Nothing here fabricates a number: every figure is produced by a
> probe or stays typed-unknown (§CONTEXT-DATA-HONESTY).

---

## 1 — The ceiling: what "maximum" means here

Unknown until measured. Badalona is ordinance-bound exactly like Barcelona (the PGM-1976 *Normes* are
prose; the AMB municipalities layer their own *modificacions*), so a realistic ceiling **cannot be
assumed equal to Barcelona's ~48%** — it must be re-derived from 08015's own clau distribution and
document sufficiency. State it as **not-measured** until Phase 0 produces it.

## 2 — Phase tracker

Status vocabulary is FIXED: **NOT STARTED · IN PROGRESS · BLOCKED · SHIPPED · VERIFIED · N/A**.

| Phase | Goal | Unlocks | Status | Owner |
|---|---|---|---|---|
| **—** | Routing + registration (S2 predicate, S4 pack, S5 registration, L5 branch) | the city is reachable and returns an honest cited refusal | **SHIPPED** | UNASSIGNED |
| **0** | **Clau-coverage audit** — enumerate the distinct claus over the 08015 extent from the MUC; record each clau's PGM article + whether a municipal *modificació* alters it | the first honest denominator; the measured rate | **NOT STARTED** | UNASSIGNED |
| **1** | **Source Badalona's own height / street-width tables** (municipal *text refós*, Ajuntament de Badalona) | the height rung Barcelona's tables cannot supply | **NOT STARTED** (BLOCKED on human sourcing) | UNASSIGNED |
| **2** | **Author `es-08015-badalona` pack** for the most-common verified clau (or a cited per-clau equivalence ruling to the PGM construction) | the first non-refusal envelope | **NOT STARTED** | UNASSIGNED |
| **cert** | Sign `sources/VERIFICATION.md` (L-449 gate) → flip `BADALONA_ENVELOPE_VERIFIED` for the certified clau(s) only | moves the certified clau amber→green; re-derives the RATE.md number | **NOT STARTED** | UNASSIGNED |
| **H** | Heights: H1 probe → per-08015 MDS bbox → re-bake (see [`HEIGHT.md`](./HEIGHT.md)) | measured context heights (LoD1) instead of the 9 m assumed carpet | **NOT STARTED** | UNASSIGNED |

## 3 — The gap to Barcelona (the pilot)

Barcelona is ahead by everything Phases 0–2 will build: a measured clau distribution, sourced height
tables, and at least one authored pack (13a shipped). Badalona reuses Barcelona's **engine** for free
(the registry + three-outcome disposition + Art. 242.2 depth construction are metropolitan), so the gap
is **data + verification effort**, not engineering. The per-municipality legal parameter set does NOT
transfer — which is why the gate stays closed.

## 4 — Dependencies, blockers, and cross-jurisdiction reuse

- **Reuse (free from Barcelona):** the `block-derived-alignment` depth construction (metropolitan), the
  refusal vocabulary (`no-rule-pack` etc.), the registry/dispatcher, `dissolveParcelsToBlockRing`.
- **Does NOT transfer:** *alçada reguladora* height tables, *ample oficial* street widths, per-clau FAR
  / coverage — all `es-08019` data. Sourcing these is the whole cost (human-gated).
- **Top blocker:** the honesty gate (§3.1 of `NEXT.md`) — a legal act, not a code change.

---

*Governing: **C58** (fidelity/provenance), **C60 §3** (coverage statement beside its citation),
**ADR-0271** (Art. 242.2 depth construction), **L-449** (human-verification gate),
`ENVELOPE-REPLICATION-STANDARD.md`, `BUILDING-HEIGHT-REPLICATION-STANDARD.md`. Model:
`../08019-barcelona/RATE-IMPLEMENTATION-PLAN.md`.*
