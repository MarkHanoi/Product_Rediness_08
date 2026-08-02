# 0287 — Resolvers refuse whenever uncertainty can change the legal outcome

**Status**: ACCEPTED (2026-08-02 — founder, corpus-wide doctrine set; condition 4 of **SIG-MU2**, generalised)
**Date**: 2026-08-02
**Deciders**: founder + architecture team
**Related contracts**: [C58 — Zoning Rules & Buildable Envelope](../contracts/C58-ZONING-RULES-AND-BUILDABLE-ENVELOPE.md) (§1.4 never present a guess as a fact; §1.5 a refusal is an answer; §1.14.4 never-overstates), [C62 — Data Confidence & Unknown Reason](../contracts/C62-DATA-CONFIDENCE-PROVENANCE-MODEL.md)
**Related ADRs**: [ADR-0283](./ADR-0283-authoritative-publication-bounds-knowledge-unknown-is-valid.md) (Unknown is a valid state), [ADR-0285](./ADR-0285-computing-an-observable-criterion-is-implementation.md) (the derivations this constrains), [ADR-0276](./ADR-0276-regime-undetermined-refusal.md), [ADR-0270](./ADR-0270-geometric-rule-model-setback-vs-alignment.md) (no front edge ⇒ hard refusal, never a full-depth ring)

## Context

A derived measurement carries error. Usually that is harmless — a depth of 15.02 m against 15.00 m changes
no outcome. But planning law is full of **thresholds**, and near a threshold a small measurement error
flips a legal category, not a decimal.

Murcia's *ancho de calle* bands are the worked example, and the ordinance is harder than it looks: the 4 m
boundary **flips inclusivity** between Arts. 5.3.3 and 5.7.3 (at exactly 4.00 m, `RC` = 3 plantas while
`RN` = 2), and the bands **overlap at 8.00 m**, with Art. 1.1.4 resolving the overlap *downward*. A width
measured at 4.00 ± 0.15 m does not yield "about 3 storeys" — it yields **either 3 or 2**, and publishing
either one asserts a legal outcome we cannot support.

The same shape recurs elsewhere: an alignment zone with no identifiable street edge (ADR-0270), a parcel
whose `edgeClassifications` length does not match its ring, a band clip that leaves no street-facing tier.

## Decision

> **Resolvers refuse whenever uncertainty can change the legal outcome.**

Not "flag it", not "pick the conservative branch", not "publish with a wider error bar". **Refuse**, with a
cited, land-identifying reason — because under ADR-0283 Unknown is a valid product state, and under C58 §1.5
a refusal is a correct answer.

**The test:** if the measurement's uncertainty interval spans a threshold at which the legal answer changes,
the resolver must not publish a determination.

## Consequences

- **This is a SIGNED REQUIREMENT, not a design preference.** It is condition 4 of SIG-MU2. It must not be
  weakened to raise coverage, and each threshold behaviour is pinned by a test at the boundary — including
  the inclusivity flip and the overlap-resolves-down case.
- **Refusals are expected and are not defects.** Murcia's realised coverage will land below its 32.32 %
  upper bound precisely *because* this rule fires. That gap is the doctrine working. Report the measured
  share and the refusal rate; never quote the upper bound as achieved.
- **There is no "conservative branch" escape when the error is two-sided.** València's `altura` is the
  proof: it sits **below** the built storey count on 81 % of sampled Ensanche buildings (modally by two) yet
  **above** it on a minority. Taking the lower reading would publish an envelope *lower than the building
  already standing on the plot*; taking the higher over-states. **Wrong in both directions ⇒ no safe
  branch**, so C58 §1.14.4's never-overstates invariant offers no shelter and §1.4 forbids presenting one
  reading as the fact. València therefore publishes nothing and holds for an authoritative definition.
- **Refuse rather than guess between two shapes.** Where a construction admits more than one legal reading of
  the plot, refusing is correct; inventing the simpler case duplicates a determination the branch was not
  built to assert.
- **Cite our own geometry, never the article, when the failure is ours.** *"PRYZM's erosion is discontinuous
  on this block"* is honest; *"the ordinance cannot be satisfied here"* would be a claim about planning law
  resting on our own limitation (C58 §1.11).
- **A refusal must name the land and the reason.** A silent empty result is indistinguishable from a crash
  and from "nothing applies here" — the failure-vs-empty family (L-422/457/467/469) this repo has been bitten
  by repeatedly.
