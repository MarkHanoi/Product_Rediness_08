# ADR-0379 — `context-aggregate`: a fabric statistic is a rule value; extent-weighted, and an absent fabric refuses

**Status:** ACCEPTED · **Date:** 2026-09-02 · **Lane:** S1 (schema seats), per the
envelope-architecture audit (lane A §2 #1, matrix row 1) and the validated matrix. §S1-CTXAGG.
This is the `fabricDerivedHeight` seat named by `ptPortoPdmDraft.ts` blocker 4.

## Context

Porto PDM Art. 3.º o) defines the *moda da cércea* — "the cércea with the greatest extent along
the built urban frontage" (*frente urbana*, Art. 3.º l) — and Art. 24.º n.º 1 e) / Art. 27.º
n.º 2 b) make it GOVERN heights in the consolidated zones (overriding the 21 m cap in tipo II).
Paris `plub_filet` code M ("same as the existing façade") is the same family. No prior kind can
carry this: every one of them is a function of THIS parcel (at most its block ring); this value
is a function of the NEIGHBOURING FABRIC. Publishing the subordinate 21 m cap where the moda
governs would over- or understate parcel by parcel.

## Decision

1. **`ContextAggregateRuleSchema`** joins the `GeometricRuleSchema` union (append-only, with
   ADR-0378): `aggregate: 'mode' | 'median' | 'max'`, `contextSet: 'urban-frontage'`,
   `attribute: 'cornice-height'`, and a REQUIRED `heightDatum` (ADR-0377; Porto ⇒
   `mean-ground-at-facade`, Art. 3.º g). Every axis is a CLOSED enum minted from a citation
   (the factVocabulary discipline); an absolute-national datum rejects at parse — an aggregated
   cércea is relative by definition.
2. **Aggregation semantics, stated once**
   (`site-parcel-data/rulepacks/declarative/evaluateContextAggregate.ts`):
   - `mode` is **EXTENT-weighted** — the value whose summed frontage extent is greatest («com
     maior extensão» — extent, not member count; a count-mode lets five narrow houses outvote one
     long block front). An extent TIE between different values REFUSES — never pick on a tie.
   - `median` is extent-weighted (robust-peer discipline — never MIN; memory
     `corpus-never-jittered-min-over-peers`).
   - `max` is the "unless the existing cércea is higher" comparison class (Art. 27.º n.º 2 b)).
3. **The honest refusals are part of the kind:** `context-set-unavailable` (the set could not be
   constructed — extractor/data/fetch, `why` says which) ≠ `context-set-empty` (extracted, zero
   members) — failure and empty are DIFFERENT facts (§CONTEXT-DATA-HONESTY); a poisoned member
   (non-finite value, non-positive extent) refuses the WHOLE evaluation (`invalid-member`) —
   a silent drop could flip the mode. Results carry the frontage-granularity caveat (C58 §1.11).
4. **The module does NOT construct the context set** — frontage extraction is adapter/kernel work
   (lane A row 1); members are injected. **This lane does not wire Porto's pack or flip its
   gate** — per §PORTO-SIGN-OFF blocker 4 the orchestrator does that, citing this ADR.
5. **Registry row:** `solveSeat: 'declarative-evaluator'`, `footprintShaping: false`,
   `requiresBlockRing: false`.

## Consequences

- Porto's moda is representable and evaluable against an injected synthetic frontage today; the
  production wire waits on the frontage extractor and the orchestrator's §PORTO-SIGN-OFF flip.
- Falsified 2026-09-02 (final tree): `case 'max'` severed → TS2345 `never` (switch closure);
  aggregation severed to COUNT-weighted → 3 tests RED (⭐ extent-weighted mode, extent pooling,
  extent-weighted median); restores byte-identical (sha256).
