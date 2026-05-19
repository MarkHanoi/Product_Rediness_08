import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

/**
 * Minimal hand-rolled OpenAPI 3.1 type surface — narrow enough to validate the
 * SPEC-26 §8 invariants without dragging in a heavy openapi-types dependency.
 * Per ADR-0039 §B, the YAML at `packages/api-spec/openapi.yaml` is the
 * canonical contract; this type is the runtime view of that contract.
 */
export interface OpenApiInfo {
  title: string;
  version: string;
  description?: string;
}

export interface OpenApiServer {
  url: string;
  description?: string;
}

export interface OpenApiOperation {
  summary?: string;
  description?: string;
  security?: ReadonlyArray<Record<string, ReadonlyArray<string>>>;
  parameters?: ReadonlyArray<unknown>;
  requestBody?: unknown;
  responses?: Record<string, unknown>;
}

export type OpenApiPathItem = Partial<Record<HttpMethod, OpenApiOperation>>;

export const HTTP_METHODS = [
  'get',
  'put',
  'post',
  'delete',
  'options',
  'head',
  'patch',
  'trace',
] as const;
export type HttpMethod = (typeof HTTP_METHODS)[number];

export interface OpenApiSecurityScheme {
  type: 'oauth2' | 'apiKey' | 'http' | 'openIdConnect' | 'mutualTLS';
  flows?: {
    authorizationCode?: {
      authorizationUrl: string;
      tokenUrl: string;
      scopes: Record<string, string>;
    };
    [k: string]: unknown;
  };
  [k: string]: unknown;
}

export interface OpenApiComponents {
  schemas?: Record<string, unknown>;
  securitySchemes?: Record<string, OpenApiSecurityScheme>;
}

export interface OpenApiDocument {
  openapi: string;
  info: OpenApiInfo;
  servers?: ReadonlyArray<OpenApiServer>;
  paths: Record<string, OpenApiPathItem>;
  components?: OpenApiComponents;
  security?: ReadonlyArray<Record<string, ReadonlyArray<string>>>;
}

export interface LoadedOpenApiSpec {
  raw: string;
  parsed: OpenApiDocument;
  sha256: string;
  path: string;
}

/**
 * Resolve the canonical path to `packages/api-spec/openapi.yaml`. When called
 * without an argument, walks up from this module's directory (which is `src/`
 * inside the package) to find the YAML at the package root.
 */
export function resolveDefaultSpecPath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, '..', 'openapi.yaml');
}

/**
 * Load + parse + hash the canonical OpenAPI YAML. Throws on parse failure.
 * Use {@link validateOpenApi3_1Invariants} to assert the SPEC-26 §8 invariants
 * after loading.
 */
export function loadOpenApiSpec(specPath?: string): LoadedOpenApiSpec {
  const path = specPath ?? resolveDefaultSpecPath();
  const raw = readFileSync(path, 'utf8');
  const parsed = parseYaml(raw) as OpenApiDocument;
  if (!parsed || typeof parsed !== 'object') {
    throw new Error(`OpenAPI YAML at ${path} did not parse to an object`);
  }
  const sha256 = createHash('sha256').update(raw, 'utf8').digest('hex');
  return { raw, parsed, sha256, path };
}

export interface InvariantViolation {
  path: string;
  message: string;
}

const TITLE_EXACT = 'PRYZM Public API';
const VERSION_REGEX = /^\d+\.\d+\.\d+(?:-(?:draft|alpha\.\d+|rc\.\d+))?$/;
const OPENAPI_VERSION = '3.1.0';

/**
 * Assert the OpenAPI 3.1 invariants this repo cares about (per ADR-0039 §E +
 * SPEC-26 §8). Returns an empty array when the document is valid, or a sorted
 * list of violations (each with a dot-path locator + message) when not.
 *
 * The checks here are intentionally narrow: they cover only what the §8 surface
 * requires at S63 D1. Broader OpenAPI 3.1 conformance (request bodies, schema
 * subtypes, callback objects, etc.) is the job of D8 lint per phase-doc-2 D8.
 */
export function validateOpenApi3_1Invariants(
  doc: OpenApiDocument,
): InvariantViolation[] {
  const violations: InvariantViolation[] = [];

  if (doc.openapi !== OPENAPI_VERSION) {
    violations.push({
      path: 'openapi',
      message: `must be exactly '${OPENAPI_VERSION}', got '${String(doc.openapi)}'`,
    });
  }

  if (!doc.info || typeof doc.info !== 'object') {
    violations.push({ path: 'info', message: 'is required and must be an object' });
  } else {
    if (doc.info.title !== TITLE_EXACT) {
      violations.push({
        path: 'info.title',
        message: `must be exactly '${TITLE_EXACT}', got '${String(doc.info.title)}'`,
      });
    }
    if (typeof doc.info.version !== 'string' || !VERSION_REGEX.test(doc.info.version)) {
      violations.push({
        path: 'info.version',
        message: `must match ${VERSION_REGEX.source}, got '${String(doc.info.version)}'`,
      });
    }
  }

  if (!Array.isArray(doc.servers) || doc.servers.length === 0) {
    violations.push({
      path: 'servers',
      message: 'must be a non-empty array (at least one server URL)',
    });
  }

  const declaredSchemes = new Set<string>(
    Object.keys(doc.components?.securitySchemes ?? {}),
  );
  const declaredScopesByScheme = new Map<string, Set<string>>();
  for (const [schemeName, scheme] of Object.entries(
    doc.components?.securitySchemes ?? {},
  )) {
    const scopes = scheme.flows?.authorizationCode?.scopes ?? {};
    declaredScopesByScheme.set(schemeName, new Set(Object.keys(scopes)));
  }

  if (!doc.paths || typeof doc.paths !== 'object') {
    violations.push({ path: 'paths', message: 'is required and must be an object' });
  } else {
    for (const [pathKey, pathItem] of Object.entries(doc.paths)) {
      const methodsPresent = HTTP_METHODS.filter(
        (m) => pathItem != null && typeof pathItem === 'object' && m in pathItem,
      );
      if (methodsPresent.length === 0) {
        violations.push({
          path: `paths.${pathKey}`,
          message: 'must declare at least one HTTP method',
        });
        continue;
      }
      for (const method of methodsPresent) {
        const op = pathItem![method]!;
        const opPath = `paths.${pathKey}.${method}`;
        if (!Array.isArray(op.security) || op.security.length === 0) {
          violations.push({
            path: `${opPath}.security`,
            message: 'every operation must declare at least one security requirement',
          });
          continue;
        }
        for (const requirement of op.security) {
          for (const [schemeName, requiredScopes] of Object.entries(requirement) as Array<[string, ReadonlyArray<string>]>) {
            if (!declaredSchemes.has(schemeName)) {
              violations.push({
                path: `${opPath}.security`,
                message: `references undefined securityScheme '${schemeName}'`,
              });
              continue;
            }
            const declared = declaredScopesByScheme.get(schemeName) ?? new Set<string>();
            for (const scope of requiredScopes) {
              if (!declared.has(scope)) {
                violations.push({
                  path: `${opPath}.security`,
                  message: `references undefined scope '${scope}' on scheme '${schemeName}'`,
                });
              }
            }
          }
        }
      }
    }
  }

  violations.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return violations;
}
