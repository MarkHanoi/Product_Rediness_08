// P0.5 slice 0 (Family Platform) — public surface for the L0
// ParametricFamily substrate (Stage-2 decomposition output).
//
// Pairs with:
//   - `family-request/`    the INGESTION input  (FamilyRequest — slice A)
//   - `family-definition/` the Stage-1 canonical form (FamilyDefinition)
//   - `family-registry/`   the Stage-5 registered output (RegisteredFamily)
//
// Pipeline flow per APARTMENT-FAMILY-PLATFORM-AND-USER-DEFINED-ELEMENTS-2026-05-30.md §4:
//
//   FamilyRequest  ─[Stage 1]→ FamilyDefinition  ─[Stage 2]→ ParametricFamily
//                  ─[Stage 3]→ Generated*        ─[Stage 5]→ RegisteredFamily
//
// Slice 0 contents (OUTPUT TYPE ONLY — the Stage-2 decomposer itself is a
// later slice):
//   - primitive:  PrimitiveKindSchema, Vec3Schema, PrimitiveTransformSchema,
//                 ParameterRefSchema, ParametricValueSchema, PrimitiveSchema
//                 + inferred types
//   - parameter:  ParametricParameterSchema + inferred type
//   - family:     ParametricFamilySchema + inferred type

export * from './primitive.js';
export * from './parameter.js';
export * from './family.js';
