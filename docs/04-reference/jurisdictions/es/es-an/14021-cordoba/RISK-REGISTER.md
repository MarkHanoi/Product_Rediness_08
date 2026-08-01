# RISK-REGISTER — Córdoba (INE 14021)

> Fail-safe honesty guardrails. **Last updated:** 2026-07-30. **Maintainer:** UNASSIGNED.
>
> **Standing principle:** *an absent envelope costs nothing; a confident wrong one costs credibility.*
> Every risk is scored against whether the mitigation FAILS SAFE (refuse / badge honestly) or fails
> loud-and-wrong.

| # | Risk | Guard (the honest default) |
|---|---|---|
| R1 | Publishing `esCordobaPGOU2001.ts` values before human sign-off | ⬆ **GUARD RESTATED 2026-08-01 — it is no longer "stay unregistered".** The pack IS registered (registration wires ROUTING; it does not authorise OUTPUT). The guard is the dispatcher's **verification gate**: `CORDOBA_ENVELOPE_VERIFIED = false` refuses every Córdoba parcel *before* the registry is consulted, and the Córdoba leg makes **no planning network call at all** while it is shut — proven by driving the real dispatch, not inferred from an import graph. Every value stays `pipeline-extracted-unverified`; `SOURCES.md §C` empty. **Flipping the flag is a LEGAL ACT** (sign `sources/VERIFICATION.md`, L-449), never a code change. |
| R2 | Manufacturing a scalar for the DERIVED families | Manzana Cerrada + Colonia Tradicional Popular density/height are an **algorithm / per-street-width table**, not a number — the pipeline emits `null`, never a fabricated value (the confident-wrong trap; IND-1/2/3 ocupación is the verbatim example). |
| R3 | Presenting pilot coverage as municipality-wide | Calificación geometry exists for **2 of ~10 districts** only — **1 628 616 m², i.e. 4.88 % of Córdoba's 33.342 km² of SUELO URBANO** (national SIU, INE 14021, measured 2026-08-01). ⚠ **AND THE OLD GUARD TEXT WAS ITSELF A FALSE CLAIM ABOUT OUR OWN COVERAGE:** it said *"outside the pilot a click resolves to SIU clasificación"*. **It does not** — the SIU proxy is mounted server-side and **no client code calls it** (grep, zero callers). Outside the pilot a click now gets a cited `no-plan-at-point` refusal that promises nothing we do not render (`CLOSURE-REGISTER.md` blockers 5 + 9). |
| R4 | Reading `not-assessed` as 0 % | `not-assessed ≠ 0 %` (C63 §1.2); overall renormalised over the assessed subset (DATA-SOURCES · TERRAIN · CONTEXT) + flagged `partial`. |
| R5 | Borrowing another city's legal numbers | Córdoba's numbers are `es-14021` data; Barcelona/Madrid tables do NOT transfer. LEGISLATION + ENVELOPE stay `not-assessed` until Córdoba-cited (§CONTEXT-DATA-HONESTY). |
| R6 | Claiming measured heights before a bake | HEIGHTS `not-assessed` until the H1 provenance probe; `REGION_SOURCE.cordoba` is configured but not confirmed landed. |
| R7 | Claiming TERRAIN is verified | rung capped at **50** (baked-but-unverified) — no `terrain.verify.mjs` round-trip recorded. |
| R8 | Trusting the block ring | `dissolveParcelsToBlockRing` is **0/3 in Córdoba** — the dissolve fails before any depth construction; do not assume a block-derived depth is available here. |

*Authority: C63 §3.1 (honesty companion), C62 (typed unknowns), C58 §1.2. Findings:
`findings/OCR-EXTRACTION-RESULTS.md`, `findings/CALIFICACION-ENDPOINT-PROBE.md`.*
