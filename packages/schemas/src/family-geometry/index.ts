// P0.5 Stage-3 (Family Platform) — public surface for the L0
// GeneratedGeometry substrate (Stage-3 geometry synthesis OUTPUT).
//
// Pairs with:
//   - `family-request/`     the INGESTION input  (FamilyRequest — slice A)
//   - `family-definition/`  the Stage-1 canonical form (FamilyDefinition)
//   - `family-parametric/`  the Stage-2 decomposition output (ParametricFamily)
//   - `family-registry/`    the Stage-5 registered output (RegisteredFamily)
//
// Pipeline flow per APARTMENT-FAMILY-PLATFORM-AND-USER-DEFINED-ELEMENTS-2026-05-30.md §4:
//
//   FamilyRequest  ─[Stage 1]→ FamilyDefinition   ─[Stage 2]→ ParametricFamily
//                  ─[Stage 3]→ GeneratedGeometry  ─[Stages 4-5]→ RegisteredFamily
//
// Stage-3 contents (OUTPUT TYPE ONLY — the Stage-3 synthesiser itself is
// a later slice that lives in `@pryzm/family-runtime` / L2+):
//   - builder-ref:      BuilderKindSchema, BuilderRefSchema + inferred types
//   - plan-symbol-ref:  PlanSymbolKindSchema, PlanSymbolRefSchema + types
//   - footprint:        FootprintSchema + inferred type
//   - generated:        GeneratedGeometrySchema (top-level) + inferred type

export * from './builder-ref.js';
export * from './plan-symbol-ref.js';
export * from './footprint.js';
export * from './generated.js';

// P0.5 Stage-3 (Family Platform) — pure ParametricFamily → GeneratedGeometry
// synthesiser.  Adds: `synthesiseGeometry`, `SynthesiseGeometryOptions`.
// No name collisions with the substrate above.
export * from './from-parametric.js';
