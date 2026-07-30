# 0279 — The buildable-envelope structural pipeline is the canonical per-city replication standard

**Status**: ACCEPTED
**Date**: 2026-07-29
**Deciders**: founder (envelope-rollout directive, 2026-07-29) + architecture team
**Related contracts**: [C58 — Zoning Rules & Buildable Envelope](../contracts/C58-ZONING-RULES-AND-BUILDABLE-ENVELOPE.md) (the envelope authority — a new "structural pipeline & replication" section records this), [C57 — Parcel Data Layer](../contracts/C57-PARCEL-DATA-LAYER.md), [C19 — Site Model](../contracts/C19-SITE-MODEL-AND-PARCEL.md), [C60 — Site Entry & Jurisdiction Coverage](../contracts/C60-SITE-ENTRY-AND-JURISDICTION-COVERAGE.md)
**Related ADRs**: [ADR-0269](./ADR-0269-compliance-authoring-parcel-zoning-envelope-strategy.md) (the jurisdiction-agnostic-core strategy this standardises), [ADR-0270](./ADR-0270-geometric-rule-model-setback-vs-alignment.md) (the `GeometricRule` union), [ADR-0271](./ADR-0271-block-derived-buildable-depth.md) (Art. 242.2 construction), [ADR-0272](./ADR-0272-coverage-and-far-governed-zones.md), [ADR-0273](./ADR-0273-tiered-occupation-envelopes.md), [ADR-0274](./ADR-0274-tolerant-cadastral-block-dissolve.md), [ADR-0275](./ADR-0275-street-width-construction-and-provenance-ladder.md), [ADR-0276](./ADR-0276-regime-undetermined-refusal.md), [ADR-0277](./ADR-0277-geo-data-sourcing-map-open-datasets-derived-heights.md)
**Reference docs**: [ENVELOPE-REPLICATION-STANDARD.md](../../04-reference/standards/ENVELOPE-REPLICATION-STANDARD.md) (**the canonical recipe this ADR ratifies**), [CITY-REPLICATION-STANDARD.md](../../04-reference/standards/CITY-REPLICATION-STANDARD.md) (the terrain/context sibling), [GEOGRAPHIC-ROLLOUT-MASTER-TRACKER.md](../../04-reference/GEOGRAPHIC-ROLLOUT-MASTER-TRACKER.md), [jurisdictions/ENVELOPE-REALISM-MATRIX.md](../../04-reference/jurisdictions/ENVELOPE-REALISM-MATRIX.md)

## Context

Barcelona is the only jurisdiction producing sound buildable envelopes (true boundaries, neighbourhood-
dependent setbacks, constructed buildable depth, real patios, ordinance height, FAR, storeys, GFA,
volume, dwelling capacity), each value carrying provenance. The founder's directive: the **structural
process must be identical for every city**, with per-jurisdiction deviations plugged in — and it must be
**documented and made sound *before* implementation** (explicitly to avoid the exploratory time/token
cost incurred on the terrain work).

The ADR-0269..0277 cluster already decided the *individual* pieces (jurisdiction-agnostic core, the
`GeometricRule` union, the block-depth construction, the refusal-as-answer model, the sourcing map). What
was missing was a **single ratified "this is the pipeline, and this is how you replicate it per city"**
standard — the envelope analogue of `CITY-REPLICATION-STANDARD.md` for terrain. Four code-grounded
research passes (2026-07-29) confirmed the architecture is already sound and largely built, mapped the
exact pipeline stages / data model / honesty model, and surfaced the concrete gaps.

## Decision

1. **Ratify [`ENVELOPE-REPLICATION-STANDARD.md`](../../04-reference/standards/ENVELOPE-REPLICATION-STANDARD.md) as
   the canonical, to-be-followed recipe** for bringing any city's buildable envelope to production
   quality. It is the L3 authority-by-reference for `CITY-REPLICATION-STANDARD.md`.

2. **The structural pipeline is fixed and generic** (stages P0–P11 in the standard). The pure solver
   `computeBuildableEnvelope`, the `GeometricRule` discriminated union, and the two data-driven registries
   are the invariant spine. **No jurisdiction logic is ever added to the engine or UI** (upholding
   ADR-0269 §31, CI-enforced by the `@pryzm/schemas ← site-parcel-data ← apps/editor` boundary).

3. **Onboarding a city is a data addition at exactly five slots** + one dispatcher branch: (S1) parcel
   provider + proxy, (S2) router predicate `isInX`, (S3) zone-identity provider, (S4) curated rule pack,
   (S5) jurisdiction registration. The rule pack (S4) is the entire cost, and that cost is **human-gated
   legal sourcing** that does not parallelise with engineering.

4. **Building heights are NOT an envelope prerequisite.** The envelope's max height is an ordinance value
   (derived from law, e.g. street-width-keyed *alçada reguladora*), not a measured-height dataset.
   Measured heights are a **context-scene** input only. The single crossover (BCN *clau 12b* height-from-
   neighbours) stays **HELD** until context heights are real. This corrects a common assumption and
   decouples envelope rollout from the (scaffold-stage) height programme.

5. **The honesty model is non-negotiable and unchanged**: three orthogonal axes (per-field provenance,
   envelope confidence, granularity) + a closed refusal vocabulary; a missing value is `null`/"not
   derived", never synthesised; a failure and an empty are different cited answers; over-statement is the
   one forbidden direction.

6. **Tracked debt to close before scaling** (from the research, recorded in the standard §8):
   - **BLOCKER-1 (highest):** implement the **merge-blocking CI fidelity-label gate**
     (`tools/ga-gate/check-zoning-fidelity-label.ts`) that ADR-0269 and C58 §6 mandate but which does not
     exist — today the "never render an estimate as authoritative" guarantee rides on convention, not CI.
   - Wire per-edge front/side/rear classification (uniform-setback fallback today).
   - Provider-stamped granularity (engine hard-codes `parcel`).
   - Decide whether land-type (urban/rustic/green) becomes a first-class AS-IS field (today: `permittedUse`
     + refusal codes only).
   - Mint **C61** for the context-scene height/terrain invariants (currently unratified).

7. **No implementation of new jurisdictions proceeds until this standard is founder-signed-off** (the
   explicit "document and make it sound first" instruction).

## Consequences

- Every future city onboarding follows one written recipe; reviewers check the five slots, not a bespoke
  path. The generic spine cannot be forked without a superseding ADR.
- The rollout bottleneck is correctly located: **rule-pack legal sourcing**, not geometry, heights, or
  engine work (`GEOGRAPHIC-ROLLOUT-MASTER-TRACKER.md` §4.0 — a second Spanish city is blocked by the
  router predicate + Catalonia-only zone source + one registered pack, all non-geometry).
- The missing CI fidelity gate is now a named, tracked BLOCKER rather than an implicit assumption — it
  must land before more packs ship, or an estimate could render as published.
- The standard + this ADR are documentation only; they change no runtime behaviour. Implementation of the
  gaps in §6 is sequenced separately and gated on sign-off.
