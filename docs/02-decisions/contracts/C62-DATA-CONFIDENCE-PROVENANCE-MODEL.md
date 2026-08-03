# C62 — Data Confidence, Provenance & Unknown-Reason Model

> **Stamp**: 2026-07-29 · **Status**: ACTIVE (schema shipped + exported; consumer migration sequenced)
> **Ratified by**: [ADR-0280](../adrs/ADR-0280-data-confidence-provenance-unknown-reason-model.md).
> **Scope**: the ONE cross-cutting vocabulary for **how trustworthy a piece of data is** — a typed
> `UnknownReason`, an ordered `AuthorityRank`, a `ValidationState` lifecycle, a per-domain
> `DomainConfidence`, and a generic `MetadataEnvelope<T>` wrapper — that every subsystem (parcel C57,
> envelope C58, analytical layers C55, heights/terrain ADR-0277 / future C61) **inherits** instead of
> reinventing. Born from the L-640 parcel-metadata review, whose #1 architectural finding was that
> confidence/provenance were being re-implemented per subsystem, risking divergence at 1k–10k cities.
> **Companion to**: C57, C58, C55, C23 (Provenance & AI Audit — the consumer), C60 (coverage).
> **Key principle**: **P5** (schemas pure — `packages/schemas/src/site/metadata/` has no THREE / I/O / DOM).
> **Honesty**: this contract is the *structural* home of §CONTEXT-DATA-HONESTY — unknown data stays
> explicitly unknown with a typed reason; a value is never fabricated to fill a slot.

---

## §1 — Invariants

### §1.1 — Unknown is typed, never a bare `null` or a fabricated value
Every absent field that a consumer models MUST carry a typed `UnknownReason`
(`authority-does-not-publish | not-queried | outside-coverage | adapter-limitation | license-restriction
| geometry-incomplete | pending-implementation`). "Failure ≠ empty ≠ fabricated": a value that could not
be sourced is `value: null` + an `unknownReason`, never a synthesised number and never an untyped null.

### §1.2 — One confidence vocabulary; subsystems specialise, they do not diverge
`DomainConfidence` is the shared per-domain summary (`tier?` — the domain's own enum as a string —
`score? (0..1)`, `authorityRank?`, `validationState`, `unknownReason?`). A subsystem's concrete
confidence (C57 `ParcelConfidence.match`, C58 `EnvelopeConfidence`) is an **instance** of this shape, never
a second, rival scale a consumer must reconcile. New subsystems MUST express confidence through
`DomainConfidence`, not a bespoke scalar.

### §1.3 — Provenance carries authority; conflicts resolve deterministically
Every sourced value SHOULD carry `SourceProvenance` (`source`, `sourceVersion`, `retrievedAt`, `license`,
`authorityRank`). `AuthorityRank` is ordered strongest-first (`national-cadastre > regional-gis > inspire >
osm > generated > user`); the pure `authorityOutranks(a, b)` comparator is the deterministic "which source
wins" primitive when two sources disagree. No consumer invents its own ranking.

### §1.4 — Validation state is distinct from confidence
`ValidationState` (`not-checked | auto-validated | cross-validated | human-reviewed | authority-confirmed`)
answers "who checked this", which is orthogonal to how confident the number is. Default `not-checked`; it
graduates ONLY on a recorded verification event, never silently (mirrors the C58 L-449 human sign-off gate).

### §1.5 — The generic wrapper is the composition unit
`MetadataEnvelope<T> = { value: T | null, unknownReason?, provenance?, confidence?, authorityRank?,
validationState? }` (Zod factory `metadataEnvelope(valueSchema)`; `unknownEnvelope(reason)` for the
unknown case). A dossier is a *composition* of `MetadataEnvelope`-wrapped values — the honesty rule lives in
the wrapper, not hand-rolled per field.

### §1.6 — Pure L0; no runtime behaviour is defined here
This contract defines schema + vocabulary only. It performs no I/O and mandates no rendering. Consumers
(C57/C58/C55) decide how to *display* a confidence; C62 only guarantees they speak the same words.

### §1.7 — ABSENCE IS A TYPED CLAIM, AND IT CARRIES A DISCOVERY PRECONDITION
"The authority does not publish this" is **a claim about our search, not a property of the world**, and
it is the only claim in this model whose failure mode is invisible: refusing produces no error, no
failing test and no user complaint, so a wrong one survives indefinitely while suppressing coverage the
authority already publishes. Measured 2026-08-03: **9 of 14** standing absence conclusions across
Balears, Canarias, Barcelona and Huesca were overturned in one day, **none** because a publisher released
new data — every one because the discovery method that produced the negative was incomplete.

Therefore an absence recorded anywhere in the system (an `UnknownReason`, a refusal, a `packsByZone: {}`,
a `*_UNRESOLVED` sentinel) **MUST** carry a discovery-confidence token:

| Token | Meaning |
|---|---|
| `VALIDATED` | Every applicable discovery stage ran; positive **and** negative controls present |
| `STRONG` | Substantial search, one or more stages unrun or unreachable — named |
| `UNVERIFIED` | Not exhaustively searched. **Scheduled re-audit, not a closed question** |

⛔ A bare "not available" is not a permitted value. ⛔ A failed guess is not an absence (HTTP 400 from a
WFS is evidence about the guess). ⛔ An advertised inventory is not the inventory (`GetCapabilities` is a
publication choice; only `DescribeLayer` enumerates). ⛔ Absence in one artefact class is not absence in
the jurisdiction. ⛔ A fabricated URL that 404s **manufactures** evidence of absence and is never valid
evidence.

Normative procedure, mandatory stages per platform, the 20-entry false-negative taxonomy and the
pre-conclusion checklist: **ADR-0296** and
`docs/04-reference/standards/DISCOVERY-EXHAUSTION-STANDARD.md`.

---

## §2 — Schema (shipped)
`packages/schemas/src/site/metadata/DataConfidence.ts` (exported from the `@pryzm/schemas` site barrel):
`UnknownReason`, `AuthorityRank` (+ `AUTHORITY_RANK_ORDER`, `authorityOutranks`), `ValidationState`,
`SourceProvenance`, `DomainConfidence`, `MetadataEnvelope<T>` / `metadataEnvelope()` / `unknownEnvelope()`.
Tests: `packages/schemas/__tests__/dataConfidence.test.ts` (closed vocabularies reject fabricated tokens;
null+typed-reason honesty; enum ordering; `authorityOutranks`; the generic factory).

## §3 — Consumers & migration (sequenced, NOT part of ratification)
- **C57** `ParcelConfidence.match` → an instance of `DomainConfidence` (tier + areaSource facts).
- **C58** `EnvelopeConfidence` (6-tier) → the parcel/envelope share one `DomainConfidence` vocabulary.
- **C55** analytical-layer confidence; **ADR-0277 / C61** height & terrain confidence.
- **C23** consumes the provenance/validation for the AI audit trail.
Migration is additive + per-subsystem; until a consumer migrates, its existing shape stays valid (this
contract asserts the shared vocabulary exists + is exported, not that every consumer already uses it).

## §4 — Cross-references
[ADR-0280](../adrs/ADR-0280-data-confidence-provenance-unknown-reason-model.md) ·
[C57](./C57-PARCEL-DATA-LAYER.md) · [C58](./C58-ZONING-RULES-AND-BUILDABLE-ENVELOPE.md) ·
[C55](./C55-GEODATA-ANALYTICAL-LAYERS.md) · [C23](./C23-PROVENANCE-AND-AI-AUDIT.md) ·
[PARCEL-METADATA-MODEL-REVIEW.md](../../04-reference/geospatial/PARCEL-METADATA-MODEL-REVIEW.md) (the review that
motivated this) · [PARCEL-METADATA-MODEL-IMPLEMENTATION-PLAN.md](../../04-reference/geospatial/PARCEL-METADATA-MODEL-IMPLEMENTATION-PLAN.md).

## §5 — Contract history
| Date | Change |
|---|---|
| 2026-07-29 | Minted + ACTIVE (ADR-0280). Schema `DataConfidence.ts` shipped + exported from the site barrel; the shared honesty vocabulary (`UnknownReason` / `AuthorityRank` / `ValidationState` / `DomainConfidence` / `MetadataEnvelope`) is the single owner across C57/C58/C55/C23. Consumer migration sequenced separately. |
