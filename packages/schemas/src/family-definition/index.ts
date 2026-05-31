// P0.4 slice B (Family Platform) — public surface for the L0
// FamilyDefinition substrate (Stage-1 canonical structured form).
//
// Pairs with:
//   - `family-request/`   the INPUT side  (FamilyRequest — slice A)
//   - `family-registry/`  the OUTPUT side (RegisteredFamily — P0.3 slice A)
//
// Pipeline flow per APARTMENT-FAMILY-PLATFORM-AND-USER-DEFINED-ELEMENTS-2026-05-30.md §4:
//
//   FamilyRequest  ─[Stage 1 Ingestion — fromRequest]→  FamilyDefinition
//                  ─[Stages 2-4]→                       Generated*
//                  ─[Stage 5]→                          RegisteredFamily
//
// Slice B contents:
//   - definition:    FamilyDefinitionDerivedSchema, FamilyDefinitionSchema +
//                    inferred types
//   - from-request:  fromRequest(request, opts) — pure JSON-mode transformer
//                    plus the exported canonicaliseSemanticNames +
//                    computeCanonicalHash helpers (for unit testing)
//
// Deferred to later slices: the PDF / OCR / image ingestion paths (Stage-1
// has multiple input modes; only the JSON-mode path ships here), and the
// downstream Stage-2 parametric decomposition / Stage-3 geometry synthesis
// / Stage-4 registration substrates.

export * from './definition.js';
export * from './from-request.js';
