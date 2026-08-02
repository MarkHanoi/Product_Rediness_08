# 0290 — The PRYZM Envelope Compiler: the VARIABLE is the unit of architecture, not the city

**Status**: **PROPOSED** (2026-08-02 — founder-commissioned national capability analysis)
**Date**: 2026-08-02
**Deciders**: founder + architecture team
⚠ **Numbering note**: `ADR-0289` is being authored concurrently in another worktree (the Urban Geometry
Engine, Murcia). This ADR is numbered 0290 to avoid a collision; the orchestrator may renumber.
**Reference doc**: [NATIONAL-CAPABILITY-REGISTER.md](../../04-reference/standards/NATIONAL-CAPABILITY-REGISTER.md) — this ADR is its architectural decision; the evidence, the measurements and the ranked roadmap live there.
**Related contracts**: C57 (parcel adapter seam) · C58 (§1.3 derivation, §1.5 refusal-as-answer, §2.2 rule kinds) · C62 · C63
**Related ADRs**: [0270](./ADR-0270-geometric-rule-model-setback-vs-alignment.md) · [0271](./ADR-0271-block-derived-buildable-depth.md) · [0283](./ADR-0283-authoritative-publication-bounds-knowledge-unknown-is-valid.md) · [0284](./ADR-0284-derived-geometry-permissible-derived-law-is-not.md) · [0285](./ADR-0285-computing-an-observable-criterion-is-implementation.md) · [0286](./ADR-0286-every-derived-value-exposes-legal-computational-source-and-tier.md) · [0287](./ADR-0287-resolvers-refuse-when-uncertainty-changes-the-legal-outcome.md) · [0288](./ADR-0288-machine-readable-is-not-publishable.md)

## Context

PRYZM has onboarded five Spanish cities. Each was built as a city: a parcel provider, a zoning provider, a
rule pack, a refusal vocabulary, and a hand-wired branch in `apps/editor/src/ui/site/siteDispatch.ts`.
`registry.ts:93-102` already records the consequence — *the jurisdiction ordering is stated twice and can
drift.*

Three measurements, landed independently in the same week, say that the city is the wrong unit.

1. **A dataset existed and nobody looked — three times.** Murcia's `pgou_alineaciones` (published block
   alignments) while we planned a dissolve. Murcia's `eje_comercial` while **our own resolver already
   carried the consumer parameter** (`esMurciaAnchoDeCalle.ts:323 opts.ejeComercial`) — 0.7 pp refuses for
   want of a fetch. Córdoba's `idecordoba:manzana` — **20,730 published block polygons, 92.9 % of ordenanza
   polygons** — while we carried a P1 "dissolve ceiling" built on a three-block sample. Under ADR-0283
   published geometry **outranks** our construction, so each miss is a **confidence-tier loss**, not merely
   wasted effort.

2. **The same variable is blocked by different dependencies in different cities, and today they all read
   the same.** *Height* is blocked by an unbound published annotation in one city, by an absent street
   width in another, by a per-street-width table with no width source in a third, and by a band edge that
   ADR-0287 correctly refuses in a fourth. The product says *"no envelope"* in all four. It should say
   *"blocked only by `storeys`, which is blocked by `streetWidth`, which is blocked by `alignment`."*

3. **A capability shipped in one city does not reach the next one by construction.**
   `geometry/streetWidth.ts` declares *"REGIONAL SCOPE — DELIBERATELY NONE"* and is genuinely
   jurisdiction-neutral — and reaching a second city still required a new hand-wired dispatch branch,
   because there is no seam for a variable resolver. `git grep` for `variableResolver`, `resolveVariable`,
   `VariableResolution`, `ParcelContext` and `LegalStack` returns **zero hits across `packages/` and
   `apps/`.**

Meanwhile the expensive half is already built: provenance (`DerivationEntrySchema`, mandatory per numeric
constraint under C58 §1.3), envelope synthesis (`computeBuildableEnvelope` → `envelopeToMassing`, five
jurisdiction-neutral rule kinds, a never-overstates invariant), the refusal vocabulary, and the confidence
ladder with its demote-only pack ceiling.

## Decision

> **The unit of architecture is the ORDINANCE VARIABLE. A municipality is a set of bindings for variables
> the platform already knows how to resolve — never a new code path.**

Three structural commitments follow.

### 1 — Every ordinance variable resolves through ONE pipeline, in ONE order

```
0 ▸ IS A METHOD PRESCRIBED BY THE INSTRUMENT?   ⚠ FIRST, MANDATORY, EXPLICIT
1 ▸ PUBLISHED VALUE
2 ▸ PUBLISHED GEOMETRY          (outranks our construction — ADR-0283)
3 ▸ PUBLISHED ANNOTATION        (refuse until an authority binds the semantics)
4 ▸ REFERENCED INSTRUMENT       (identify + cite; admit numbers only if held and in force)
5 ▸ LEGALLY CONSTRUCTIBLE       (ADR-0285, all four tests)
6 ▸ TYPED UNKNOWN               (with the reason, the article, and the missing dependency)
```

⚠ **Step 0 is new and is a correction, not an addition.** ADR-0285's test 2 — *"the method is
unprescribed"* — was on its way to being treated as a general property of Spanish PGOUs. Murcia's Art.
4.5.3 prescribes the method (*«ancho entre alineaciones de parcela … media aritmética … hasta completar la
manzana»*), and Art. 4.5.4 gives a corner *solar* the **widest** street where our resolver takes the
narrowest. **Test 2 must be checked per city, per article. It may never be assumed.**

### 2 — Variables are NODES with declared dependencies; a click traverses the graph

```
Envelope
├── Height      ← Ordinance · Street Width ← Alignment ← published GIS layer
│                              · Corner Rule · Vertical Datum
├── Footprint   ← Alignment · Setbacks · Buildable Depth · Occupation
├── Constraints ← Heritage · Special Plan · Flood · Airport · Infrastructure
└── Legal       ← Governing Instrument · Delegation · Overrides
```

Each node carries **authoritative source · resolution method · confidence · legal basis · dependencies**.
A parcel either compiles to an envelope or **names the exact missing dependency**. *"Cannot compute"* stops
being a valid product output.

### 3 — Discovery precedes construction

No geometry reconstruction may be scheduled for a variable until the published GIS inventory has been
searched for it. This is a **process gate on the roadmap**, enforced by evidence in the city's `findings/`,
not by code. Its rationale is ADR-0283: constructing what is published produces a **weaker legal tier than
was available**. *(The discovery protocol itself is specified elsewhere and is deliberately not designed
here.)*

## What this does NOT change — do not redesign what exists

`DerivationEntrySchema` and the C58 §1.3 obligation · `computeBuildableEnvelope` / `envelopeToMassing` ·
the `GeometricRule` union (ADR-0270) · the refusal vocabulary and its per-jurisdiction copy (which
`registry.ts` marks per-jurisdiction **by explicit design** and which must **not** be standardised) ·
`ENVELOPE_AXIS_TIER_WEIGHT` and `capEnvelopeConfidenceToPackDefault` (a demote-only ceiling, wired and
tested) · the C57 adapter seam. The missing work is **layers 2, 3 and 4 only**, and it is contiguous.

## Consequences

- **Success is measured by Envelope Completion Coverage**, not by city completion. Determination Coverage
  is retained and reported as product honesty — *both* metrics, never one replacing the other.
- **A new metric is minted and deliberately kept separate: Intervention-Ceiling Coverage.** A cited
  maximum-permitted-intervention volume is drawable and is **not an envelope**. It must never aggregate
  into ECC, and it is **not publishable** while its binding ceiling (the existing building's own
  *envolvente* and built area) is unobtainable — publishing an upper bound without its binding constraint
  is the L-616 defect (ADR-0284: *a SOLID must intersect ALL derived constraints*).
- **Only `Engineering` dependencies enter implementation sprints.** `Legal`, `Data` and `External
  authority` become tracked dependencies with a named owner and one exit criterion
  (BLOCKER-CLASSIFICATION-STANDARD). Measured across the five cities, that removes ~99.4 % of the remaining
  land from the sprint board — which is the point, not a problem.
- **Migration is behaviour-preserving or it is a correctness event.** All five cities' measured coverage
  must reproduce **byte-identically** through the new engine before any city is migrated. A rewrite that
  moves a published number is a defect, not a refactor.
- **The capability formerly framed as a street-width engine is renamed** toward
  **Geometry-derived Ordinance Variable Engine** (layer 3: *Variable Resolution Engine*). The module
  already knows nothing about streets — it takes rings and returns metres. Street width is one instance;
  frontage, plaza, corner, opposing frontage and block depth are the next.
- **`ENVELOPE_AXIS_TIER_WEIGHT` needs a `legally-delegated` tier.** Today a cited legal determination and
  PRYZM's own gap both weigh 0.0 and are indistinguishable in the score, over 60.46 % / 67.00 % / 36.40 %
  of three cities. This ADR does not set the weight; it records that the vocabulary is incomplete.
- **Airport, flood and infrastructure constraints are modelled as first-class variables from the start**,
  even though no city measures them today. They constrain **downward**, so their absence can only
  over-state — and an unmodelled downward constraint is invisible in every metric on the board.
