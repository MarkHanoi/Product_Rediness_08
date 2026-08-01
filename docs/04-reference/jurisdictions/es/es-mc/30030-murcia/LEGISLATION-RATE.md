# LEGISLATION-RATE — Murcia (INE 30030)

> Structured legislation / data-fill rate (C58 comparable ruler; feeds C63 Axis 2).
> **Last updated:** 2026-08-01. **Maintainer:** UNASSIGNED.

## Rate: **ROUTING 100 % · NUMERIC 33.0 % authored, 0 % rendered**

The two must be reported separately (planning-regime-resolver finding): a city can know *which
instrument governs every parcel* while holding *no number for most of them*. Murcia is exactly that
city, and collapsing the pair into one percentage would hide its actual shape.

### ROUTING completeness — 100 %

Every Murcia parcel resolves to a typed disposition naming the governing regime, live, from
Murcia's own municipal GeoServer (`Murcia:pgou_alineaciones` + `Murcia:pgou_sectores` via
`/api/es/murcia-pgou`). No parcel falls through to "unknown regime". The regimes are:

| Regime | Governing article | share of private buildable land |
|---|---|---:|
| PGOU-direct ordinance (Tít. 5 Caps. 2–23) | per-calificación | **33.0 %** |
| *Calificación genérica* — use + typology only | Arts. 5.25.3.3 / 5.26.3.3 / 6.5.1 | 30.2 % |
| Suelo urbanizable → Plan Parcial | Art. 6.2.2.3 | 20.5 % |
| Remitted to convalidated prior plan | Arts. 5.24.5 / 5.24.6 | 11.2 % |
| Delegating ámbito (UA/UH/UM/UE/UD/TA/TM/P\*) | Arts. 5.24 / 5.25 / 5.26 / 6.6 | 5.1 % |

### NUMERIC completeness — 33.0 % authored, **0 % rendered**

- **33.0 %** of private buildable land carries a transcribed, cited, article-quoted rule set
  (14 calificaciones, `rulepacks/esMurciaPgou2012.ts`).
- **23.51 %** now RENDERS. ⚠ **UPDATED 2026-08-01 — this line previously read "0 % renders, because
  `MURCIA_ENVELOPE_VERIFIED = false`".** Every part of that is now out of date: SIG-MU1 is signed,
  the gate is `true`, R-7's delegation parity is closed, and the L5 render path
  (§MURCIA-ENVELOPE-RENDER) is built and tested end-to-end through the real dispatcher.
  **23.51 %** is lower than the 33.0 % authored because it counts only packed calificaciones that
  *also* sit on **non-delegated** soil — measured by `tools/murcia-coverage-crosstab/`, run before
  the signature so the number could not be flattered by it.
- The remaining **9.5 pp** (33.0 − 23.51) is packed land the PGOU nonetheless delegates; it keeps a
  cited `derived-plan` refusal and **no signature can lift it**.
- **67.0 %** is unreachable by any transcription of this instrument — the general plan is the wrong
  document for that land, by its own articles.
- The firm floor excluding the expressly *interim* `RL` regime (Art. 5.14.3) is **16.5 %**.

## The instrument

«PLAN GENERAL MUNICIPAL DE ORDENACIÓN DE MURCIA — Texto Refundido. diciembre 2012. VOLUMEN 11 —
NORMAS URBANÍSTICAS», Ayuntamiento de Murcia. Retrieved 2026-08-01 from `urbanismo.murcia.es`,
205 pp, born-digital, embedded title `TR PG vol_11 NN UU.signed.pdf`. **No** «sin valor normativo»
disclaimer (checked: 0 occurrences). **BORM approval reference: `not-located-in-source`.**

Full provenance, authority caveats and the per-calificación four-state table: [`ENVELOPE.md`](./ENVELOPE.md).

## What would move it

1. Sign `sources/VERIFICATION.md` → 33.0 % authored becomes 33.0 % rendered.
2. A Murcia street-width / frontage-class source → unblocks `RC`, `RM` (base), `RN`, `MZ`, `MX`,
   ≈ +4 pp.
3. Nothing else on this instrument. Beyond that the only lever is acquiring the **derived plans**
   themselves — a per-ámbito document-sourcing problem, not a transcription problem.

⚠ The national prior (`es/RATE.md`, ~34 % structured-fill) is a COUNTRY figure and was never this
municipality's; the near-coincidence with 33.0 % is arithmetic, not evidence.

*Cross-refs: C58, C63 §3 Axis 2, L-656, `../../RATE.md` (national), `./RATE.md`, `./ENVELOPE.md`.*
