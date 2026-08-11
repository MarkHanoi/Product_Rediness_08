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
