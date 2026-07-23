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
//
// Strategic context — docs/04-reference/ORDINANCE-EXTRACTION-PIPELINE.md.

export * from './types.js';
export * from './confidence.js';
export * from './gates/index.js';
export * from './enumerator.js';
export * from './adapters/index.js';
export * from './pipeline.js';
