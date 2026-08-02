# 0286 — Every derived value must expose its legal source, its computational source, and its confidence tier

**Status**: ACCEPTED (2026-08-02 — founder, corpus-wide doctrine set)
**Date**: 2026-08-02
**Deciders**: founder + architecture team
**Related contracts**: [C58 — Zoning Rules & Buildable Envelope](../contracts/C58-ZONING-RULES-AND-BUILDABLE-ENVELOPE.md) (§1.2 confidence, §1.3 explain-why, §1.6 tier ladder), [C62 — Data Confidence & Unknown Reason](../contracts/C62-DATA-CONFIDENCE-PROVENANCE-MODEL.md), [C63 — City-Completion Scorecard](../contracts/C63-CITY-COMPLETION-AND-DOSSIER.md) (§1.1 — every axis % is a total function of inspectable state)
**Related ADRs**: [ADR-0283](./ADR-0283-authoritative-publication-bounds-knowledge-unknown-is-valid.md), [ADR-0284](./ADR-0284-derived-geometry-permissible-derived-law-is-not.md), [ADR-0285](./ADR-0285-computing-an-observable-criterion-is-implementation.md), [ADR-0280](./ADR-0280-data-confidence-provenance-unknown-reason-model.md) (the C62 metadata envelope this populates)

## Context

Three values can look identical on a card and mean entirely different things: a figure read verbatim from a
published table, a figure constructed by our own geometry from published inputs, and a figure a machine
extracted from a PDF that no human has checked. If the card renders them the same way, the user cannot tell
a legal fact from our arithmetic — and neither can we, later.

This was not hypothetical. Until L-665, `ZoningRulesEngine` hard-coded
`let confidence: EnvelopeConfidence = 'estimated-ruleset'` and **never read `rulePack.defaultConfidence`**.
Madrid's PGOUM-97 and Córdoba's PGOU-2001 packs — both declaring `pipeline-extracted-unverified`, C58 §1.6's
permanent bottom tier — would have surfaced under the **same violet "Estimated" chip** as a hand-transcribed,
article-cited pack. The red "machine-extracted, unverified" affordance the renderer already implemented was
**unreachable**. The defect was latent only because every verification gate was `false`; it would have gone
live the instant any gate was signed.

That is exactly what the founder's SIG-M1 signature is conditioned on: transcription may publish *provided
it remains explicitly identified as a machine-generated derivative* at the `pipeline-extracted-unverified`
tier. **A disclosure requirement the renderer cannot honour is not a disclosure requirement.**

## Decision

> **Every derived value must expose: its legal source, its computational source, and its confidence tier.**

- **Legal source** — the governing article, with instrument, edition and (where available) page, plus the
  verbatim quotation the value was read from.
- **Computational source** — what produced the number: read from a published field; constructed by a named
  construction from named inputs; or extracted by a named pipeline. If it was constructed, the card says so
  (a constructed depth is never cited as though the ordinance stated it — ADR-0271).
- **Confidence tier** — the C58 §1.6 ladder position, rendered with its own affordance, never flattened
  into a neighbouring tier.

These three travel **together, to the UI**, not merely into a comment or a derivation log a user never sees.

## Consequences

- **The tier is a property of the DETERMINATION, not of one consumer.** It is resolved in the engine, so the
  panel, the report, the API and the export cannot disagree. Per-call-site patching is forbidden.
- **A pack may DEMOTE itself, never PROMOTE itself.** `capEnvelopeConfidenceToPackDefault` takes the weaker
  of the field-resolution tier and the pack's declared tier on the one L0 ladder. A pack certifying its own
  numbers is precisely what the verification gates exist to prevent. Applied only where the pack actually
  supplied a value — clamping a fully structured solve to a pack ceiling would under-state real published
  data, the same lie inverted.
- **A signature does not promote a tier.** SIG-MU2 approves a methodology; Murcia stays `estimated-ruleset`.
- **Withheld beats guessed.** A value that cannot be derived is `null` with a typed `UnknownReason`
  (ADR-0280), never `0`. `parseFloat("0 / 5") === 0` is the trap this closes: Madrid's `COEF_Z` is a
  categorical grade token, so a compound value yields `null`, never a silent zero.
- **Absence must be visible.** A row that renders as an empty string when its input is missing is a
  disclosure failure — an absent parcel ring must *say* it is absent, not vanish and read as "no
  constraint". Verified and fixed in the site card on 2026-08-02.
- **This is testable, and must be tested.** Verifying that a machine-extracted solve genuinely surfaces the
  red chip end-to-end is the concrete form of this ADR, and is a precondition of any transcription signature.
