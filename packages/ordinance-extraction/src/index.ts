// @pryzm/ordinance-extraction — L2 horizontal ordinance-extraction CORE.
//
// Turns scanned / text-trapped municipal ordinances into citeable buildable-
// envelope parameters at the permanent `pipeline-extracted-unverified` tier,
// behind verification GATES that make confident-wrong extractions catchable
// (§CONTEXT-DATA-HONESTY). Barcelona, Córdoba, Denmark and beyond share this core;
// only the per-city ENUMERATOR differs.
//
// PUBLIC API
//   Types            — ExtractableField, ExtractionCandidate, ExtractedField,
//                      DocumentExtractionResult, GateResult, NonNumericRule …
//   Confidence       — confidenceRank, isStrongerThan, canGraduateTier,
//                      resolvePublishedConfidence, PIPELINE_TIER (the no-silent-
//                      graduation LOCK 3).
//   Gates            — supersessionGate (Stage 0), dualPassAgreement,
//                      arithmeticCrossCheck, rangeSanityGate, localeGate /
//                      normaliseLocaleNumber, algorithmGate / detectAlgorithm.
//   Enumerator       — OrdinanceEnumerator interface + OrdinanceDocumentRef.
//   Adapters         — BarcelonaRpucEnumerator (stub).
//   Orchestrator     — runDocumentExtraction(plan, extractor), the DualPassExtractor
//                      PORT the caller implements (routing through ai-host per C23).
//   Text-parse       — extractRules(text, grammar, source) — the born-digital
//                      TEXT-PARSE path (no OCR / no LLM), + ExtractedRule and the
//                      JurisdictionGrammar contract a per-country adapter supplies.
//   Grammars         — GERMAN_GRAMMAR (the first, proven on the Berlin corpus).
//   Envelope         — toEnvelopeParameters(extraction) — cited rules → ONE typed
//                      parameter set, grouped by parameter key, gated, and honestly
//                      three-valued (resolved / conflicted / unknown).
//   Attribution      — ParameterEvidence<T> + resolveParameter(candidates, table) —
//                      the LEGAL ATTRIBUTION layer that decides WHICH correctly-read
//                      value BINDS (instrument kind, legalStatus, per-jurisdiction
//                      priority tables as data). Extends the three-outcome contract
//                      above; deliberately wired to nothing yet — see
//                      standards/LEGAL-ATTRIBUTION-MODEL.md §8.
//
// Strategic context — docs/04-reference/ORDINANCE-EXTRACTION-PIPELINE.md.

export * from './types.js';
export * from './confidence.js';
export * from './gates/index.js';
export * from './enumerator.js';
export * from './adapters/index.js';
export * from './pipeline.js';
export * from './textExtract/index.js';
export * from './grammars/index.js';
export * from './envelope/index.js';
export * from './attribution/index.js';
export * from './ingest/index.js';
export * from './structure/index.js';
export * from './spine/index.js';
