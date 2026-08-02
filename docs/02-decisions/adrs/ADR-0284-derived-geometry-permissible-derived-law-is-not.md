# 0284 — Derived geometry is permissible; derived law is not

**Status**: ACCEPTED (2026-08-02 — founder, corpus-wide doctrine set)
**Date**: 2026-08-02
**Deciders**: founder + architecture team
**Related contracts**: [C58 — Zoning Rules & Buildable Envelope](../contracts/C58-ZONING-RULES-AND-BUILDABLE-ENVELOPE.md) (§1.4, §1.9 parse purity), [C62 — Data Confidence & Unknown Reason](../contracts/C62-DATA-CONFIDENCE-PROVENANCE-MODEL.md)
**Related ADRs**: [ADR-0283](./ADR-0283-authoritative-publication-bounds-knowledge-unknown-is-valid.md) (the parent doctrine), [ADR-0285](./ADR-0285-computing-an-observable-criterion-is-implementation.md) (the permitted case, sharpened), [ADR-0271](./ADR-0271-block-derived-buildable-depth.md) (block-derived *profunditat edificable* — the precedent), [ADR-0270](./ADR-0270-geometric-rule-model-setback-vs-alignment.md)

## Context

PRYZM computes things the published record does not state. Barcelona's *profunditat edificable* is
constructed from block geometry under PGM Art. 242.2 (ADR-0271) because the article defines an
**algorithm**, not a lookup. Murcia's *ancho de calle* is measured from published *alineaciones* because
the ordinance keys storey count to street width without prescribing how to measure it.

Both are derivations. Neither is a licence to derive *the rule itself*, and the failure mode when that line
blurs is severe and has been observed in this repo more than once:

- **Córdoba, until 2026-08-01**, published invented setbacks (3.0/1.5/3.0), FAR 2.00 and 50 % coverage
  across **95.1 % of its suelo urbano**. No predicate matched, a registry hole let an estimate through, and
  the fabricated triple was indistinguishable from a cited one.
- **L-616**: massing ignored a FAR ceiling (~5× over) and drew a setback-unknown as zero. The founder's
  correction stands as the rule: **a SOLID must intersect ALL derived constraints.**
- **Madrid NZ 3, 2026-08-02**: the `Fondo` geometry is published and queryable, and it is *still* not
  authority to compute an entitlement if Art. 8.3.1 refuses one.

The distinction needed a name because "we derived it" was being used to justify both.

## Decision

> **Derived geometry is permissible. Derived law is not.**

**Permitted — deriving a GEOMETRIC QUANTITY** that the ordinance makes legally operative but does not
tabulate: a depth constructed from a block ring, a street width measured between published alignments, a
buildable band clipped from an alignment. The legal rule is unchanged; only the *measurement* is derived.
See ADR-0285 for the precise test.

**Forbidden — deriving a LEGAL DETERMINATION** the publisher has not made:
- inventing a numeric value (setback, FAR, coverage, height) because a plausible default exists;
- borrowing another zone's parameters because they are adjacent, similar, or referenced;
- promoting an analytical reconstruction (e.g. NZ-3 occupancy inferred probabilistically from Catastro
  built-area) into a zoning dataset — it may be produced, but it is labelled an analytical reconstruction
  and **never** published as law;
- treating a machine transcription of an ordinance as certified. **Transcribing an ordinance is a legal
  act**, and a pack cannot sign its own transcription — hence the `*_ENVELOPE_VERIFIED` gates and the
  `pipeline-extracted-unverified` tier that Madrid's 23 machine-extracted zones sit in until a human signs.

## Consequences

- Where a rule is unavailable, the output is a **cited refusal naming the governing article**, never a
  default. A refusal is a correct answer (C58 §1.5); a fabricated value is a defect on clickable land.
- A derivation must be **reproducible and inspectable**: same input, same output, with the construction
  documented and its provenance carried to the UI (ADR-0286).
- A constructed value must never be cited as though the ordinance stated it. This is the distinction
  ADR-0271 exists to keep, and it is why Barcelona's card says the depth is constructed.
- Anti-fabrication guards are **repo-wide totality guards**, not per-city conditionals: no registration may
  advertise more land than it claims, and no unmatched parcel may reach an estimate. A `contains` tighter
  than its declared `extent` *is* the Córdoba hole.
- ⚠ **A well-formed, fully-cited falsehood is still a falsehood.** `honestyOk` verifies that a number *has*
  a derivation, never that the derivation is *true* — it stayed green while the scorecard published a
  fabricated "0 % context" for nine cities. Citation discipline is necessary and not sufficient.
