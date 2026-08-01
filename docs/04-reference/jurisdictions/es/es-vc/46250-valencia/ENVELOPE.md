# ENVELOPE — València (INE 46250)

> Per-municipality envelope status (ADR-0279 / `ENVELOPE-REPLICATION-STANDARD.md`; feeds C63 Axis 4).
> **Last updated:** 2026-08-01. **Maintainer:** UNASSIGNED.
> Blockers: [`CLOSURE-REGISTER.md`](./CLOSURE-REGISTER.md).

## Status: **WIRED AND REFUSING — 0 % computable, 100 % terminal**

⚠ **Read that carefully: this is not "no pack yet".** The five slots are wired end to end, the
ordinance has been sourced and transcribed article by article, and the envelope is **still 0 %** —
because the plan puts its numbers on a **drawing**, not in its text. That is a property of the
instrument, not a stage of our work, and no further reading closes it.

| Slot | What it is | State |
|---|---|---|
| **S1 — parcel provider** | Catastro INSPIRE WFS (national), keyless | ✅ wired; measured live 2026-08-01 → `6618617YJ2761H`, `<cp>46</cp><cm>250</cm>` → 46250 |
| **S2 — router predicate** | `providers/valenciaBbox.ts` — `isInValencia` + `VALENCIA_BBOX` | ✅ shipped |
| **S3 — zone source** | `MapServer/231` (`califi`/`tipoca`/`origen`), live + keyless | ⚠ **PROVEN available, NOT yet wired** — CLOSURE-REGISTER #4 |
| **S4 — rule pack** | `rulepacks/esValenciaPgou.ts` + `esValenciaEnvelope.ts` | ✅ shipped — ⚠ **`zones: []` BY CONSTRUCTION** |
| **S5 — registration** | `rulepacks/registry.ts` (València block) + `ENVELOPE_PUBLICATION_GATES` | ✅ shipped |

## Why `zones` is empty, in one table

| zone | envelope rule | article | input held? |
|---|---|---|---|
| ENS | `Hc = 4,80 + 2,90·Np`, Np from **Plano C** | 6.19.1 | ❌ |
| ENS | *«La profundidad edificable será la señalada en el Plano C»* | 6.18.2 | ❌ |
| EDA | `Hc = 5,30 + 2,90·Np` ⚠ **same shape, DIFFERENT intercept** | 6.25.1 | ❌ |
| UFA | closed table 2→7 m, 3→10 m, selected by **Plano C** | 6.30.1 | ❌ |

⚠ **`Hc = 4,80 + 2,90·Np` with a guessed Np is a FABRICATED DETERMINATION, not a conservative
estimate** (L-616 mechanism-A). ⚠ **Np is the graphed floor count MINUS ONE** — the ordinance's own
eight-row table settles it (5 plantas → 16,40 m, not 19,30 m), and a test pins all eight rows.
⚠ **The 20 m depth fallback does NOT rescue this**: Art. 6.18.2 gates it on *«Caso de no indicarse
ésta»*, a fact about Plano C that PRYZM cannot observe.

## The gate: `VALENCIA_ENVELOPE_VERIFIED = false`

⚠ **The first gate in the platform that a SIGNATURE CANNOT LIFT.** Madrid's and Córdoba's are `false`
pending a human signature on a transcription PRYZM already holds; Murcia's has been signed. València's
is `false` because **there is no number to sign**. Flipping it would authorise nothing — `zones` is
empty — it would merely remove the interlock that stops a later author packing a representative Np.
**Do not flip it to ship a demo** (L-449).

## Measured coverage (L-656 denominator = 1 874,9 ha private buildable land)

| | share |
|---|---:|
| carries a computed envelope today | **0 %** |
| receives an explicit, documented, land-identifying refusal | **100 %** |
| …of which entitled to the stronger cited **delegation** (`origen ≠ PGOU*`) | 36,40 % ⚠ *not yet issued — needs S3* |
| PGOU-ordered — the ceiling **if Plano C is ever obtained** | **63,60 %** |

Method and caveats:
[`findings/VALENCIA-LAND-SHARE-MEASUREMENT-2026-08-01.md`](./findings/VALENCIA-LAND-SHARE-MEASUREMENT-2026-08-01.md).

**Do NOT reuse another municipality's numbers** — every height/FAR/coverage/street-width value is
per-municipality (C58 §1.2). ⚠ ENS 4,80 and EDA 5,30 are 0,50 m apart **inside the same plan**; the
cross-city version of that mistake is worse. An absent envelope costs nothing; a confident wrong one
costs credibility.

*Cross-refs: C58, ADR-0270, ADR-0279, C63 §3 Axis 4, L-449, L-616, L-656.*
