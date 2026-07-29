# 0280 — A shared Data-Confidence, Provenance & Unknown-Reason model (mint C62)

**Status**: ACCEPTED (2026-07-29 — ratified; C62 contract minted, schema exported. Consumer migration of C57 `ParcelConfidence` / C58 `EnvelopeConfidence` to instances of the generic is sequenced separately, not part of this ratification.)
**Date**: 2026-07-29
**Deciders**: founder (parcel-metadata review directive, L-640) + architecture team
**Related contracts**: [C57 — Parcel Data Layer](../contracts/C57-PARCEL-DATA-LAYER.md) (its `ParcelConfidence` becomes a C62 instance), [C58 — Zoning Rules & Buildable Envelope](../contracts/C58-ZONING-RULES-AND-BUILDABLE-ENVELOPE.md) (its `EnvelopeConfidence` becomes a C62 instance), [C55 — Geodata Analytical Layers](../contracts/C55-GEODATA-ANALYTICAL-LAYERS.md), [C19 — Site Model & Parcel](../contracts/C19-SITE-MODEL-AND-PARCEL.md); C61 (context-scene height/terrain, unratified per ADR-0279 §6) also inherits it once minted — **new candidate contract C62 is the cross-cutting owner these reference**
**Related ADRs**: [ADR-0277](./ADR-0277-geo-data-sourcing-map-open-datasets-derived-heights.md) (heights provenance — inherits C62), [ADR-0279](./ADR-0279-envelope-structural-pipeline-as-replication-standard.md) (the envelope replication standard whose honesty model C62 generalises), [ADR-0269](./ADR-0269-compliance-authoring-parcel-zoning-envelope-strategy.md), [ADR-0276](./ADR-0276-regime-undetermined-refusal.md) (the refusal-as-answer precedent C62's `UnknownReason` typifies)
**Reference docs**: [PARCEL-METADATA-MODEL-REVIEW.md](../../04-reference/PARCEL-METADATA-MODEL-REVIEW.md) (**the review this ADR acts on** — Architectural Finding #1 + Gap-Matrix P0 "Shared metadata contract"), [ENVELOPE-REPLICATION-STANDARD.md](../../04-reference/ENVELOPE-REPLICATION-STANDARD.md) (the honesty model C62 lifts to a generic), [PARCEL-METADATA-MODEL-IMPLEMENTATION-PLAN.md](../../04-reference/PARCEL-METADATA-MODEL-IMPLEMENTATION-PLAN.md) (the L-640 plan whose per-domain confidence inherits C62), [CITY-REPLICATION-STANDARD.md](../../04-reference/CITY-REPLICATION-STANDARD.md)

## Context

The parcel-metadata architecture review (`PARCEL-METADATA-MODEL-REVIEW.md`) names as its **#1 structural
finding** that PRYZM's model is *field-centric, not domain-inherited*: every subsystem re-invents its own
confidence + provenance + unknown-reason shape.

- C57 parcels ship `ParcelConfidence` (a `high | medium | low` `match` tier + raw diagnostic numbers).
- C58 envelopes ship `EnvelopeConfidence` (a 6-tier enum: `authoritative | structured | block-constructed
  | estimated-ruleset | pipeline-extracted-unverified | not-determined`) plus `FieldProvenance`.
- ADR-0277 heights carry their own `provenance` + `confidence` labels.
- C55 overlays carry theirs.

These are **four divergent scales a consumer must reconcile by hand**, with no shared vocabulary for *why a
value is unknown*. At 1,000 cities this is unmaintainable drift; at 10,000 it blocks a URN-keyed spatial
store (review §Future-proofing). The honesty spine (§CONTEXT-DATA-HONESTY: *failure ≠ empty ≠ fabricated*,
restated at the envelope layer in ADR-0279 §5 and as the refusal-as-answer model in ADR-0276) is PRYZM's
genuine differentiator — but today it is re-hand-rolled per field instead of being **structural**.

The review's prescribed fix (Gap-Matrix P0, Architectural Finding #1): mint **C62** — a single generic,
domain-inherited `MetadataEnvelope<T>` wrapper plus a typed `UnknownReason` enum that every layer's fields
inherit, so the honesty rule lives in the wrapper, not in every field by hand.

## Decision

1. **Mint candidate contract C62 as the single cross-cutting owner of the honesty vocabulary.** C62 owns,
   and is the only place that defines, the shared confidence/provenance/unknown-reason model. C57, C58,
   C55, C61 and ADR-0277 **reference** C62 rather than each minting their own — no subsystem reinvents
   confidence again.

2. **The vocabulary is a pure L0 Zod schema** — `packages/schemas/src/site/metadata/DataConfidence.ts`
   (P5-pure: Zod only, zero I/O / THREE / DOM). It defines:
   - **`UnknownReason`** — a closed typed enum (`authority-does-not-publish | not-queried |
     outside-coverage | adapter-limitation | license-restriction | geometry-incomplete |
     pending-implementation`). A missing value is `null` **plus** a reason — never a guessed `0`.
   - **`AuthorityRank`** — ordered most-authoritative-first (`national-cadastre | regional-gis | inspire |
     osm | generated | user`) + a pure `authorityOutranks(a, b)` comparator: the deterministic
     "which source wins" primitive.
   - **`ValidationState`** — a distinct axis from confidence (`not-checked | auto-validated |
     cross-validated | human-reviewed | authority-confirmed`), upgraded only on a recorded event.
   - **`SourceProvenance`** — structured provenance (source / version / retrievedAt / license /
     authorityRank), the clean supertype of the ad-hoc `source` string tags.
   - **`DomainConfidence`** — the per-domain confidence summary (`tier?` for each domain's own
     vocabulary, `score` 0..1 or `null`, `authorityRank?`, `validationState`, `unknownReason?`).
   - **`metadataEnvelope(valueSchema)`** — the generic wrapper factory (Zod generics are factory
     functions) yielding `{ value: T | null, unknownReason?, provenance?, confidence?, authorityRank?,
     validationState? }`, with a companion hand-authored `MetadataEnvelope<T>` type and an
     `unknownEnvelope(reason)` one-liner.

3. **C57's `ParcelConfidence` and C58's `EnvelopeConfidence` become INSTANCES of the generic, not rivals.**
   `ParcelConfidence.match` and `EnvelopeConfidence`'s 6 tiers each become a `DomainConfidence.tier`
   string; `EnvelopeConfidence: 'not-determined'` maps to a `null` value + a typed `UnknownReason`. Each
   domain keeps its own tier vocabulary — C62 adds only the shared axes, so it is a clean supertype, **not
   a conflicting third confidence scale**.

4. **This is a schema + contract move only — no runtime behaviour changes.** No consumer is wired in this
   ADR: the schema is authored but deliberately **not re-exported from the site barrel**. Consumer
   migration (C57 / C58 / C55 / ADR-0277 adopting the wrapper) is **sequenced separately** and gated on
   founder sign-off, exactly as ADR-0279 §7 sequences its gaps.

5. **The honesty rule is now structural.** Because `null + UnknownReason` is the wrapper's shape, the
   §CONTEXT-DATA-HONESTY invariant (an unknown stays explicitly unknown with a typed reason; never
   fabricate) is enforced by the type, not by per-field discipline.

## Consequences

- **Positive** — one honesty vocabulary across every layer; the drift the review flags (four divergent
  confidence scales) is removed at the root before the 1k-city scale where it becomes unmaintainable. The
  wrapper makes future subsystems inherit honesty for free, and gives the eventual URN-keyed spatial store
  (review §Future-proofing) one schema to key on. `authorityOutranks` supplies the deterministic
  conflict-resolution primitive the review's authority-ranking gap asks for.
- **Neutral** — C62 is *candidate/PROPOSED*; it is not ratified until the orchestrator adds the
  `C62-*.md` contract to the C00 index and the founder signs off. This ADR + schema are the draft input to
  that ratification, mirroring how ADR-0279 ratified a standard document.
- **Cost / follow-up (sequenced separately, not in this ADR)** — migrating C57 `ParcelConfidence` and C58
  `EnvelopeConfidence` to instances of the generic; deciding whether the richer review concepts (ISO-19157
  quality vocabulary, PROV-style lineage graph, temporal validity, geometry LoD) extend the C62 envelope
  or sit alongside it; and the storage-model decision (inline vs spatial store) the review defers. None of
  these block the vocabulary landing.
- **Honesty-safe** — nothing here fabricates data: every unsourced field remains an explicit `null` + a
  typed `UnknownReason`; `score` is nullable so an unknown confidence is never coerced to `0`.
