// P0.4 slice A (Family Platform) — public surface for the L0 FamilyRequest
// substrate (the INGESTION side of the Family Generation Pipeline).
//
// Pairs with the existing `family-registry/` substrate (the OUTPUT side).
// Pipeline flow per APARTMENT-FAMILY-PLATFORM-AND-USER-DEFINED-ELEMENTS-2026-05-30.md §4:
//
//   FamilyRequest  ─[Stage 1 Ingestion]→  FamilyDefinition
//                  ─[Stage 2..4]→         Generated*
//                  ─[Stage 5]→            RegisteredFamily
//
// Slice A contents:
//   - documentation:  AssetRefSchema, FamilyDocumentationSchema
//   - geometry:       ParametricRangeSchema, FamilyDimensionsSchema,
//                     HostedRelationshipSchema, FamilyGeometrySchema
//   - behaviour:      FamilyBehaviourSchema, FamilyConstraintsSchema,
//                     FamilyPlacementHintSchema, FamilyAiHintSchema
//   - request:        FamilyRequestSchema (top-level aggregate)
//
// Deferred to later slices: permissions, versioning, licensing extensions,
// AI-generated provenance, plugin-marketplace signing, and the actual
// Stage-1 parser that turns FamilyRequest → FamilyDefinition.

export * from './documentation.js';
export * from './geometry.js';
export * from './behaviour.js';
export * from './request.js';
