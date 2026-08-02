# 0290 — Authoritative published data must be exhausted before engineering a derived solution

**Status**: ACCEPTED (2026-08-02 — founder, PEC Phase 2: *"This is now an **architectural invariant, not a recommendation**."*)
**Date**: 2026-08-02
**Deciders**: founder (Envelope Compiler programme) + architecture team
**Related contracts**: [C58 — Zoning Rules & Buildable Envelope](../contracts/C58-ZONING-RULES-AND-BUILDABLE-ENVELOPE.md) · [C63 — City Completion & Dossier](../contracts/C63-CITY-COMPLETION-AND-DOSSIER.md)
**Related ADRs**: [ADR-0283](./ADR-0283-authoritative-publication-bounds-knowledge-unknown-is-valid.md) (published evidence bounds what we may assert) · [ADR-0284](./ADR-0284-derived-geometry-permissible-derived-law-is-not.md) · [ADR-0285](./ADR-0285-computing-an-observable-criterion-is-implementation.md) (**this ADR is its precondition**) · [ADR-0288](./ADR-0288-machine-readable-is-not-publishable.md) · [ADR-0289](./ADR-0289-geometry-derived-ordinance-variable-engine.md)
**Reference docs**: `docs/04-reference/standards/DATASET-DISCOVERY-PROTOCOL.md` — **Stage 0, the mechanism that discharges this invariant (in authoring; link once landed)** · [MACHINE-READABLE-EVIDENCE-REGISTER.md](../../04-reference/standards/MACHINE-READABLE-EVIDENCE-REGISTER.md) · [PROBE-DISCIPLINE.md](../../04-reference/standards/PROBE-DISCIPLINE.md)

## Context

ADR-0285 permits computing an observable geometric quantity where the ordinance states the criterion but
not the method. It says nothing about **when** we are entitled to reach for that permission. In practice we
reached for it far too early, three times in 48 hours, each time while the authoritative dataset was already
published and merely unsearched:

| # | What we were about to build | What already existed | Cost avoided |
|---|---|---|---|
| 1 | a street-width construction, on the assumption Murcia published no alignments | **`Murcia:pgou_alineaciones`** — block-level alignment polygons, exactly the datum Art. 4.5.3 names | the entire capability |
| 2 | a refusal treated as a missing-data blocker | **`Murcia:pgou_eje_comercial`** — a published layer we simply never queried | a 0.7 % refusal rate re-classified from *data unavailable* to *engineering, days* |
| 3 | a cadastral-dissolve engine for block rings (Córdoba dissolves 0/3 on the sampled blocks) | **`idecordoba:manzana`** — **20 730** published blocks covering **92.9 %** of ordenanza polygons | a multi-week engine demoted to fallback |

The third is the sharpest: **published geometry outranks geometry we derive ourselves** (ADR-0283), so the
discovered layer is not merely cheaper — it is *better evidence*, and shipping the dissolve first would have
produced a permanently weaker provenance tier for the same parcels.

The founder's diagnosis of the root cause: *"**PRYZM currently discovers datasets manually. That does not
scale.**"* The failure was never analytical. Nobody looked, because looking was not a required step.

## Decision

> **Authoritative published data must always be exhausted before engineering a derived solution.**
>
> This is an **architectural invariant, not a recommendation.** Every proposed engineering capability must
> explicitly demonstrate why an authoritative source cannot satisfy the requirement first.

**Operationally — the Stage 0 gate.** No capability that *derives, constructs, reconstructs, approximates or
digitises* a planning variable may enter an implementation sprint until a **Stage 0 discovery pass** has run
for the affected municipalities and its negative result is recorded with evidence.

**A negative must be PROVEN, not assumed.** Under PROBE-DISCIPLINE, every probe records URL · HTTP status ·
content-type · byte count, and:
- **failure ≠ empty** — a 403 / 499 / timeout / DNS error is `UNKNOWN`, never "no data" (L-422/457/467/469);
- **verify spatial extent before believing a service name** — `GMU_Services` looked like Gerencia Municipal
  de Urbanismo Córdoba and was **George Mason University, Virginia, 6 148 km away**;
- **an empty result must survive alternate axis orders / CRS** — Córdoba's first `manzana` query returned
  **0 features** from a WFS axis-order artefact, not absence;
- **a plausible proxy is not a source.** `sup_viales` produced a believable 9,12 m median street width and
  was still the wrong legal object — the *callejero* (physical street surface), not an alignment.
  *"Plausible, which is the trap."* **A layer that could supply a variable is a CANDIDATE, never a
  resolution** — the ordinance decides, not the plausibility of the number.

## Consequences

- **This ADR is a precondition of ADR-0285, not an alternative to it.** Test 3 of ADR-0285 asks whether the
  input is authoritative published geometry; this ADR asks whether an authoritative *published value or
  dataset* removes the need to construct at all. Construction remains legitimate — **second**.
- **Sequencing changes across the programme.** Discovery precedes engineering for every derived capability.
  Where a Stage 0 pass has not run, the capability is not "ready"; it is **unsized**.
- **Prefer the published source even when the derived one already works.** A shipped derivation whose
  authoritative source is later discovered should migrate to it — the tier is better and the provenance is
  the publisher's, not ours. Córdoba's dissolve becomes fallback behind `manzana` on exactly that reasoning.
- **This does not license unbounded searching.** A Stage 0 pass is **one-shot and time-boxed**, with an exit
  criterion, per the blocker standard; an open-ended search has no exit and is indistinguishable from an
  unstarted one. Córdoba's six-avenue sweep is the reference shape: exhaustive, evidenced, concluded once.
- **Discovery answers "can we read it", never "may we publish it"** (ADR-0288). A dataset found under this
  ADR still requires a legal grant before any determination is published from it.
