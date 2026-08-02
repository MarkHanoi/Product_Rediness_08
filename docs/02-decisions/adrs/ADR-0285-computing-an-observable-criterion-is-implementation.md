# 0285 — Implementation may compute an observable geometric quantity when the ordinance specifies the criterion but not the method

**Status**: ACCEPTED (2026-08-02 — the ratio decidendi of the founder's **SIG-MU2** signature, generalised)
**Date**: 2026-08-02
**Deciders**: founder (SIG-MU2, Murcia *ancho de calle*) + architecture team
**Related contracts**: [C58 — Zoning Rules & Buildable Envelope](../contracts/C58-ZONING-RULES-AND-BUILDABLE-ENVELOPE.md), [C62 — Data Confidence & Unknown Reason](../contracts/C62-DATA-CONFIDENCE-PROVENANCE-MODEL.md)
**Related ADRs**: [ADR-0284](./ADR-0284-derived-geometry-permissible-derived-law-is-not.md) (the parent distinction), [ADR-0286](./ADR-0286-every-derived-value-exposes-legal-computational-source-and-tier.md) (the disclosure this requires), [ADR-0287](./ADR-0287-resolvers-refuse-when-uncertainty-changes-the-legal-outcome.md) (the refusal duty this creates), [ADR-0271](./ADR-0271-block-derived-buildable-depth.md)

## Context

Murcia's PGOU keys storey count to **street width**: Arts. 5.3.3 · 5.5.3 · 5.7.3 · 5.9.3 assign a maximum
number of *plantas* by band of *ancho de calle*. The ordinance states the criterion and **does not state how
the width is to be measured**. Spain publishes no national street-width dataset; Murcia's `viales` layer is
centrelines with no width attribute, and `comunicaciones_poligonos` returns four features across the whole
Casco Antiguo. But the PGOU measures between **alineaciones**, and Murcia publishes those polygons directly.

That left an unresolved question of principle: is measuring the width from published alignment geometry an
*implementation* of the ordinance, or an *amendment* to it? The same question governs Barcelona's
block-derived *profunditat edificable* (ADR-0271) and would govern any future case where a legal criterion
is observable but untabulated.

## Decision

The founder's rationale, signed as SIG-MU2 and adopted here as doctrine:

> *"The ordinance makes street width the legal criterion. **It does not prescribe a measurement
> methodology.** Computing that width from authoritative geometry is an **implementation** of the ordinance,
> not a modification of it. The legal rule remains unchanged; only the measurement is derived."*

> **Implementation may compute observable geometric quantities when the ordinance specifies the criterion
> but not the computational method.**

**The four-part test.** All four must hold:
1. **The criterion is stated by the ordinance.** We are measuring something the law already made operative —
   not choosing what matters.
2. **The method is unprescribed.** If the instrument *does* prescribe a method, that method binds; a
   different one is an amendment.
3. **The input is authoritative published geometry.** Measuring between published *alineaciones* qualifies;
   inferring an alignment where none is published does not (ADR-0283 — partial publication authorises
   nothing beyond its demonstrated extent).
4. **The computation is reproducible.** Same input, same result, deterministic, pinned by test over a
   captured fixture.

## Consequences

**Scope of any signature under this ADR.** The founder was explicit: *"This signature approves the
methodology, not every individual parcel outcome. Individual results remain contingent on the quality of
the underlying geometry and the resolver's conservative refusal policy."* A methodology signature is not a
per-parcel warranty, and must not be recorded as one.

**Mandatory conditions**, carried from SIG-MU2 and generalised to every derivation under this ADR:
- the measurement is **reproducible** from authoritative geometry;
- the value is **explicitly labelled constructed**, never presented as an official municipal measurement;
- the **applicable article(s) accompany every result**;
- the resolver **refuses** where measurement uncertainty could change the applicable band (ADR-0287).

**Tier.** A quantity derived under this ADR does not earn a higher confidence tier by virtue of being
signed. Murcia remains `estimated-ruleset`; SIG-MU1 records that `authoritative` is unreachable for its
ruleset. **A signature on methodology does not promote the tier** — see ADR-0286.

**Coverage discipline.** Publish the **measured** realised share, never the arithmetic maximum. Murcia's
32.32 % is an upper bound whose refusal rate on real geometry was unmeasured at signature time; quoting it
as achieved would be the §SIZE-IS-NOT-PROVENANCE error. Upper bounds are internal planning numbers.

**Boundary against ADR-0284.** This ADR permits deriving a *measurement*. It never permits deriving a
*rule*, a *value the ordinance withheld*, or an *entitlement the law declines to grant*.
