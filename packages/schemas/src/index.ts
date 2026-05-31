// Public surface of @pryzm/schemas.
export * from './types/Id.js';
export * from './factory/createId.js';
export * from './base/index.js';
export * from './elements/index.js';
export { SCHEMA_REGISTRY, type SchemaRegistry, type ElementSchema } from './registry.js';

// P0.3 slice A (Family Platform) — L0 FamilyRegistry substrate.  Re-exported
// at the root so consumers can `import { RegisteredFamilySchema } from
// '@pryzm/schemas'`.  No name collisions with the existing element schemas
// (this surface uses `Family*` prefixes; the existing element registry
// exports `SCHEMA_REGISTRY` not `FamilyRegistryState`).  A later slice can
// add a `./family-registry` subpath entry in `package.json` to mirror the
// annotation/view/apartment supplements.
export * from './family-registry/index.js';

// P0.4 slice A (Family Platform) — L0 FamilyRequest substrate.  The
// INGESTION-side counterpart to `family-registry/` (the OUTPUT side).  All
// exported names are `FamilyRequest*`, `FamilyDocumentation*`,
// `FamilyGeometry*`, `FamilyBehaviour*`, `FamilyConstraints*`,
// `FamilyPlacementHint*`, `FamilyAiHint*`, `AssetRef*`,
// `ParametricRange*`, `FamilyDimensions*`, `HostedRelationship*` — none of
// which collide with the existing `family-registry/` exports
// (`Family{Id,Identity,Origin,MountClass,Category,Occupancy,ArchetypeHint,
// RegisteredFamily,IfcMapping,RegistryState}`) or the element schemas.
export * from './family-request/index.js';

// P0.4 slice Stage-1 (Family Platform) — L0 FamilyDefinition substrate.
// The canonical structured form that emerges from Stage-1 ingestion:
// FamilyRequest → fromRequest() → FamilyDefinition (request + derived).
// Adds: `FamilyDefinition*`, `FamilyDefinitionDerived*`, `fromRequest`,
// `canonicaliseSemanticNames`, `computeCanonicalHash`, `FromRequestOptions`.
// No name collisions with `family-registry/` or `family-request/`.
//
// NOTE: this barrel re-export has been stripped by a linter/auto-fixer
// twice during P0.4 slice authoring. If it disappears again, re-add it
// here — the file `family-definition/index.js` is real and required for
// `familyDefinition.test.ts` to resolve `FamilyDefinitionSchema` etc.
export * from './family-definition/index.js';

// P0.5 slice 0 (Family Platform) — L0 ParametricFamily substrate (Stage-2
// parametric decomposition OUTPUT type).  Sits between FamilyDefinition
// (Stage-1) and Generated* / RegisteredFamily (Stages 3-5).  Exports:
// `PrimitiveKind*`, `Vec3*`, `PrimitiveTransform*`, `ParameterRef*`,
// `ParametricValue*`, `Primitive*`, `ParametricParameter*`,
// `ParametricFamily*` — none of which collide with the existing
// `family-registry/`, `family-request/`, or `family-definition/` exports.
//
// NOTE: like the family-definition barrel above, this re-export has been
// stripped by a linter/auto-fixer during sibling slice authoring twice.
// If it disappears, re-add it here — `family-parametric/index.js` is real
// and required for `familyParametric.test.ts` to resolve
// `ParametricFamilySchema` etc.
export * from './family-parametric/index.js';

// P0.5 Stage-3 (Family Platform) — L0 GeneratedGeometry substrate (Stage-3
// geometry synthesis OUTPUT type).  Sits between ParametricFamily (Stage-2)
// and RegisteredFamily (Stages 4-5).  Exports:
// `BuilderKind*`, `BuilderRef*`, `PlanSymbolKind*`, `PlanSymbolRef*`,
// `Footprint*`, `GeneratedGeometry*` — none of which collide with the
// existing `family-registry/`, `family-request/`, `family-definition/`, or
// `family-parametric/` exports.
//
// NOTE: like the family-definition + family-parametric barrels above, this
// re-export has been observed to be stripped by a linter/auto-fixer during
// sibling slice authoring.  If it disappears, re-add it here —
// `family-geometry/index.js` is real and required for
// `familyGeometry.test.ts` to resolve `GeneratedGeometrySchema` etc.
export * from './family-geometry/index.js';

// P0.5 Stage-4 (Family Platform) — L0 GeneratedSchemas substrate (Stage-4
// data-model synthesis OUTPUT type).  Sits between GeneratedGeometry
// (Stage-3) and RegisteredFamily (Stage-5).  Exports:
// `InstanceParameterKind*`, `InstanceParameterSpec*`, `InstanceSchemaSpec*`,
// `CommandKind*`, `CommandPayloadSpec*`, `CommandPayloadSet*`,
// `GeneratedSchemas*` — none of which collide with the existing
// `family-registry/`, `family-request/`, `family-definition/`,
// `family-parametric/`, or `family-geometry/` exports.
//
// NOTE: like the four sibling family-* barrels above, this re-export has
// been observed to be stripped by a linter/auto-fixer during sibling slice
// authoring.  If it disappears, re-add it here — `family-schemas/index.js`
// is real and required for `familyGeneratedSchemas.test.ts` to resolve
// `GeneratedSchemasSchema` etc.
export * from './family-schemas/index.js';

// P0.5 Stage-pipeline (Family Platform) — L0 single-call orchestrator that
// chains every Family-Generation Stage (1 → 2 → 3 → 4 → 5) into ONE
// function call.  Takes raw JSON, returns a fully-typed `RegisteredFamily`
// (plus every intermediate stage output for debug + cache-key extraction)
// — or an `IngestionFailure` verbatim on Stage-1 ingestion failure.
// Exports: `runFamilyPipeline`, `isPipelineSuccess`,
// `RunFamilyPipelineOptions`, `RunFamilyPipelineStages`,
// `RunFamilyPipelineSuccess`, `RunFamilyPipelineOutcome`.  No name
// collisions with the prior six family-* barrels.
//
// NOTE: like the six sibling family-* barrels above, this re-export has
// been observed to be stripped by a linter/auto-fixer during sibling slice
// authoring.  If it disappears, re-add it here — `family-pipeline/index.js`
// is real and required for `familyPipeline.test.ts` to resolve
// `runFamilyPipeline` etc.
export * from './family-pipeline/index.js';

// S31 / Phase 2B Supplement §A1 — auto-dimension schemas (DimensionString,
// EvaluatedDimension, anchor/orientation enums) and §B1 — ViewTemplate
// schemas (StrokeStyle, CategoryVG, ViewFilter, FilterCondition, ViewRange).
//
// These intentionally live ONLY behind subpath exports
// (`@pryzm/schemas/annotation`, `@pryzm/schemas/annotation/dimension`,
// `@pryzm/schemas/view`, `@pryzm/schemas/view/view-template`) — earlier
// drafts re-exported them as `* as Annotation` / `* as View` namespaces at
// the package root, but those names collide with the existing
// `elements/Annotation.ts` and `elements/View.ts` element schemas
// (`Annotation as AnnotationSchemaInfer` in `@pryzm/stores`,
// `Annotation` as a value in `@pryzm/plugin-annotations`).  Subpath
// imports have zero collision risk and are what every supplement-S33/S34
// consumer (producer, evaluator, scene-committer) already uses.
