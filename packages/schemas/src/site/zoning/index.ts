// C58 — Zoning-rules & buildable-envelope L0 schemas (pure Zod, P5).
//
// Re-exported through `packages/schemas/src/site/index.ts` → the root
// `@pryzm/schemas` barrel. All types here are pure data shapes with zero I/O,
// zero THREE, zero DOM — the CI fidelity-label gate (C58 §6) and the pure L2
// `ZoningRulesEngine` (@pryzm/site-parcel-data) bind to them.
//
// Strategic context — docs/02-decisions/contracts/C58-ZONING-RULES-AND-BUILDABLE-ENVELOPE.md §2.

export * from './ProvenanceFlags.js';
export * from './ExtractionProvenance.js';
export * from './EnvelopeNumbers.js';
export * from './ZoningRecord.js';
export * from './JurisdictionZoningContract.js';
export * from './BuildableEnvelope.js';
// W5-2 / C63 §3.2 (L-656) — WHICH LAND a planning ratio is measured over. A branded, invariant
// `RatioOverLand<B>` + the closed denominator-refusal union, so "FAR over gross land" and
// "coverage over the parcel" can never be related by arithmetic that compiles.
export * from './LandBasis.js';
// STRUCTURAL-SEAM-4 — the shared fetch-outcome union (transient ≠ absent), C57 §1.5 / C58 §1.13.8.
export * from './FetchOutcome.js';
// §CONTEXT-DERIVED-STUDY-ENVELOPE (§ENVAMS148) — a STANDALONE massing-study artefact, deliberately
// NOT a field on `BuildableEnvelope` — see the module header for why.
export * from './ContextDerivedStudyEnvelope.js';
// §RULE-STATE (founder transmission 2026-09-03) — the SHARED per-rule state vocabulary: the five
// reachability states, the founder's four answer shapes + the PRYZM-side `unrecovered` arm, the
// six-label failure taxonomy, and the F1/F2 split the NL and NSW audits both name as their open
// gap. Composes with `FieldProvenance`/`EnvelopeConfidence`; replaces neither. Used by every
// country adapter — FR, PT/ES, NL/DK and NSW — so there is exactly one spelling.
export * from './RuleState.js';
// §CONSTRAINT-FORM (founder ES field-level pass §5) — the SIX forms a planning constraint takes:
// scalar · formula · conditional · geometric · linear · document-derived. Spain's conditional norms
// (`IF floors=3 THEN height<=10.50m`) are not expressible as a nullable number. Types the shape of
// the E1a `SiteIntelRule.body` JSON blob; rivals neither it nor `RuleState`, which it joins via
// `ruleStatusForResolution`.
export * from './ConstraintForm.js';
