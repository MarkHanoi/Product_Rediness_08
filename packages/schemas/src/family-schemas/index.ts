// P0.5 Stage-4 (Family Platform) — public surface for the L0
// GeneratedSchemas substrate (Stage-4 data-model synthesis OUTPUT).
//
// Pairs with:
//   - `family-request/`     the INGESTION input  (FamilyRequest — slice A)
//   - `family-definition/`  the Stage-1 canonical form (FamilyDefinition)
//   - `family-parametric/`  the Stage-2 decomposition output (ParametricFamily)
//   - `family-geometry/`    the Stage-3 geometry synthesis output (GeneratedGeometry)
//   - `family-registry/`    the Stage-5 registered output (RegisteredFamily)
//
// Pipeline flow per APARTMENT-FAMILY-PLATFORM-AND-USER-DEFINED-ELEMENTS-2026-05-30.md §4:
//
//   FamilyRequest  ─[Stage 1]→ FamilyDefinition   ─[Stage 2]→ ParametricFamily
//                  ─[Stage 3]→ GeneratedGeometry  ─[Stage 4]→ GeneratedSchemas
//                  ─[Stage 5]→ RegisteredFamily
//
// Stage-4 contents (OUTPUT TYPE ONLY — the Stage-4 synthesiser itself is
// a later slice that lives in `@pryzm/family-runtime` / L2+):
//   - instance-schema-spec:  InstanceParameterKindSchema, InstanceParameterSpecSchema,
//                            InstanceSchemaSpecSchema + inferred types
//   - command-payload-spec:  CommandKindSchema, CommandPayloadSpecSchema,
//                            CommandPayloadSetSchema + inferred types
//   - generated:             GeneratedSchemasSchema (top-level) + inferred type

export * from './instance-schema-spec.js';
export * from './command-payload-spec.js';
export * from './generated.js';
