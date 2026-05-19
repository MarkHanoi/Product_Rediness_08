/**
 * `@pryzm/api-spec` — canonical OpenAPI 3.1 schema for the PRYZM Public API.
 *
 * S63 D1 foundation per ADR-0039 and SPEC-26 §8. The hand-authored YAML at
 * `packages/api-spec/openapi.yaml` is the source of truth (ADR-0039 §B); the
 * loader + invariant checker below let downstream consumers (docs site at
 * D7, client SDK codegen at S65) work against a parsed view of that YAML.
 */

export {
  loadOpenApiSpec,
  resolveDefaultSpecPath,
  validateOpenApi3_1Invariants,
  HTTP_METHODS,
} from './loader.js';

export type {
  OpenApiDocument,
  OpenApiInfo,
  OpenApiServer,
  OpenApiOperation,
  OpenApiPathItem,
  OpenApiComponents,
  OpenApiSecurityScheme,
  HttpMethod,
  LoadedOpenApiSpec,
  InvariantViolation,
} from './loader.js';
