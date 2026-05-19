// Public surface of @pryzm/schemas.
export * from './types/Id.js';
export * from './factory/createId.js';
export * from './base/index.js';
export * from './elements/index.js';
export { SCHEMA_REGISTRY, type SchemaRegistry, type ElementSchema } from './registry.js';

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
