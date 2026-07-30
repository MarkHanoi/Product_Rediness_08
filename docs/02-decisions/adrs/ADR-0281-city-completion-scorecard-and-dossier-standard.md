# 0281 — A 7-axis City-Completion Scorecard + a fixed per-city Dossier standard (mint C63)

**Status**: ACCEPTED (2026-07-30 — ratified; C63 contract minted. The scorecard schema + function are
sequenced separately, not part of this ratification; the overall weighting vector in C63 §4 is a
**FOUNDER DECISION**, DRAFT until signed.)
**Date**: 2026-07-30
**Deciders**: founder (city-completion scorecard directive) + architecture team
**Related contracts**: [C63 — City Completion & Dossier](../contracts/C63-CITY-COMPLETION-AND-DOSSIER.md) (this ADR mints it), [C62 — Data Confidence, Provenance & Unknown-Reason](../contracts/C62-DATA-CONFIDENCE-PROVENANCE-MODEL.md) (each axis is a `DomainConfidence` instance; `not-assessed` carries a C62 `UnknownReason`), [C57 — Parcel Data Layer](../contracts/C57-PARCEL-DATA-LAYER.md) (PARCEL axis input), [C58 — Zoning Rules & Buildable Envelope](../contracts/C58-ZONING-RULES-AND-BUILDABLE-ENVELOPE.md) (LEGISLATION + ENVELOPE axes; the L-449 verification gate), [C60 — Site Entry & Jurisdiction Coverage](../contracts/C60-SITE-ENTRY-AND-JURISDICTION-COVERAGE.md) (coverage-is-derived precedent), [C12 — Geospatial](../contracts/C12-GEOSPATIAL.md) (TERRAIN axis)
**Related ADRs**: [ADR-0280](./ADR-0280-data-confidence-provenance-unknown-reason-model.md) (C62 — the confidence/unknown model C63 composes), [ADR-0279](./ADR-0279-envelope-structural-pipeline-as-replication-standard.md) (the envelope replication standard whose per-city state the ENVELOPE axis reads), [ADR-0277](./ADR-0277-geo-data-sourcing-map-open-datasets-derived-heights.md) (heights provenance — the HEIGHTS/LOD axis reads it), [ADR-0276](./ADR-0276-regime-undetermined-refusal.md) (refusal-as-answer — the §3.1 honesty companion)
**Reference docs**: [CITY-REPLICATION-STANDARD.md](../../04-reference/CITY-REPLICATION-STANDARD.md) (the 8-layer recipe whose per-city completeness C63 measures), [ENVELOPE-REPLICATION-STANDARD.md](../../04-reference/ENVELOPE-REPLICATION-STANDARD.md), [BUILDING-HEIGHT-REPLICATION-STANDARD.md](../../04-reference/BUILDING-HEIGHT-REPLICATION-STANDARD.md), [GEOGRAPHIC-ROLLOUT-MASTER-TRACKER.md](../../04-reference/GEOGRAPHIC-ROLLOUT-MASTER-TRACKER.md), [GEO-DATA-SOURCING-MASTER.md](../../04-reference/jurisdictions/GEO-DATA-SOURCING-MASTER.md), [SPEC-CITY-COMPLETION-SCORECARD](../../03-execution/specs/SPEC-CITY-COMPLETION-SCORECARD.md)

## Context

PRYZM is replicating Barcelona city-by-city. The "Replicate Barcelona" recipe
(`CITY-REPLICATION-STANDARD.md`) decomposes a city into eight independent data/geometry layers, five of
them per-city data pipelines. Two sibling standards (`ENVELOPE-REPLICATION-STANDARD.md` ADR-0279,
`BUILDING-HEIGHT-REPLICATION-STANDARD.md` L-646) deepen the L3 and L5 layers. Per-country
data-readiness is tracked by a single `RATE.md` number (structured dimensional fill).

But there was **no single, comparable, honest measure of "how complete is city X"** across all the
layers, and no enforced dossier shape. The founder's directive: *every city PRYZM tackles gets a
well-structured dossier, and a MULTI-AXIS COMPLETION SCORECARD tracks how complete each city is across
ALL countries.* Three concrete gaps:

1. **No comparable measure.** "Madrid is ahead of Oslo" was prose, not a number; the one `RATE.md`
   number captured only the legal-fill axis, not terrain / heights / context / parcel state.
2. **Fabrication risk.** Any completeness number a human types is a §CONTEXT-DATA-HONESTY hazard (a
   guess presented as a measurement — the L-422/L-457/L-467 family). The measure had to be a *function
   of state*, not an opinion.
3. **No fixed dossier.** New-city evidence landed ad hoc; `_TEMPLATE/` was a single flat city scaffold
   with no completion face and no country-level roll-up.

## Decision

**Mint C63 — City Completion Scorecard & Dossier Standard.** It defines:

1. **A 7-axis, 0–100 % completion scorecard** — PARCEL, LEGISLATION, DATA-SOURCES, ENVELOPE, TERRAIN,
   HEIGHTS/LOD, CONTEXT — each with a FIXED, identical-across-cities definition and a named input from
   which it is **computed** (registry rows, baked-tile probes, `SOURCES.md`/`VERIFICATION.md` counts,
   `heightSources.mjs` `impl` flags, terrain `layer.json` + round-trip). **Core invariant (C63 §1.1):**
   an axis number is NEVER hand-typed; it is a total function of state. **Honesty invariant (§1.2):** an
   unmeasured axis is `not-assessed` + a typed C62 `UnknownReason`, never 0 % and never blank.

2. **An OVERALL number** = a weighted, assessed-subset-renormalised sum, with the weight vector stored
   as CONFIG (`CITY_COMPLETION_WEIGHTS`). The **default weighting is a FOUNDER DECISION** (C63 §4): the
   proposal front-loads the expensive, differentiating axes (LEGISLATION 25 %, ENVELOPE 20 %, PARCEL
   15 %, DATA-SOURCES 15 %, HEIGHTS/LOD 10 %, TERRAIN 10 %, CONTEXT 5 %) rather than equal weights,
   because three axes port free and two are the human-gated cost — equal weighting would let a city look
   ~43 % "done" from the free axes while holding zero certified law.

3. **A fixed dossier folder standard** (C63 §5): `COMPLETION.md` (the scorecard face) + RATE / NEXT /
   ENVELOPE / HEIGHT / RISK-REGISTER / sources / findings, with the folder identity equal to the pack
   `jurisdictionId`. Templates at `jurisdictions/_TEMPLATE/` (country) + `_TEMPLATE/_CITY/` (city).

4. **The §3.1 honesty companion** — a `honestyOk` scalar orthogonal to completeness: a city can be
   0 % complete and 100 % honest (all cited refusals). Launch-blocking is `honestyOk`, not a completion
   threshold. This is ADR-0276's refusal-as-answer lifted to the scorecard.

## Why not the alternatives

- **Extend the single `RATE.md` number.** Rejected: one number cannot express that Madrid has terrain +
  heights but no certified envelope while Barcelona has both. The multi-axis view is the requirement.
  `RATE.md` is *kept* as the LEGISLATION-axis input, not discarded.
- **Equal 1/7 axis weights.** Rejected as the default (see decision 2) — but it is expressible: the
  weight vector is config, so a founder who prefers equal weights sets it in one place.
- **Let humans maintain the matrix by hand.** Rejected as the primary sin this contract exists to
  prevent (C63 §1.1) — it would reintroduce fabricated completeness. The matrix is generated; today,
  before the function ships, every cell is honestly `not-assessed`.
- **A brand-new confidence scale.** Rejected — C62 already owns the confidence/unknown vocabulary; each
  axis is a `DomainConfidence` instance (C63 §1.4), not a rival scale (the exact divergence C62/ADR-0280
  exists to prevent).

## Consequences

- **Positive.** One comparable, honest, reproducible completeness measure across all cities; a fixed
  dossier so new-city evidence is uniform; the honesty spine is structural (composes C62), not
  re-hand-rolled; the founder gets a single tracker matrix that cannot lie.
- **Cost / debt.** The scorecard schema (`packages/schemas/src/site/completion/`) + the impure scorecard
  function + `check-city-completion.ts` CI gate are **not yet built** — until they are, the matrix is
  honestly all-`not-assessed`, and the honesty rule is enforced by review discipline, not CI. This is
  logged, not hidden (C63 §8).
- **Open founder decisions.** The §4 weighting vector; whether `derived-levels` earns partial HEIGHTS/LOD
  credit.
- **Follow-ups.** Populate `COMPLETION.md` for the shipped Catalan cities + Madrid once the DATA-SOURCES /
  TERRAIN / CONTEXT axes (the cheap first computes) are wired; retro-fit the `_TEMPLATE/_CITY/` shape to
  existing dossiers.
