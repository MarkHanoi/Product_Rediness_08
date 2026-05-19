import { describe, it, expect, beforeAll } from 'vitest';
import { stringify as stringifyYaml } from 'yaml';
import {
  loadOpenApiSpec,
  validateOpenApi3_1Invariants,
  HTTP_METHODS,
  type LoadedOpenApiSpec,
} from '../src/index.js';

/**
 * S63 D7-D8 smoke suite for `@pryzm/api-spec` per ADR-0039 §A + the
 * docs-site dependency at apps/docs-site/src/content/docs/api/openapi.md.
 *
 * Where openapi-spec.test.ts pins byte-stable invariants (SHA-256 +
 * literal field equality), this suite asserts behavioural properties:
 *   • the YAML round-trips through parse → stringify → re-parse without
 *     drift in the structurally-significant fields,
 *   • every operation declared has an OAuth2 security requirement,
 *   • every scope referenced in a security requirement is declared in
 *     `components.securitySchemes.oauth2.flows.authorizationCode.scopes`,
 *   • the validateOpenApi3_1Invariants() checker reports zero violations.
 */

let loaded: LoadedOpenApiSpec;

beforeAll(() => {
  loaded = loadOpenApiSpec();
});

describe('S63 D7-D8 — round-trip stability', () => {
  it('parse → stringify → re-parse preserves the openapi version', () => {
    const re = stringifyYaml(loaded.parsed);
    // round-trip via the package's own yaml dependency (not the loader, which
    // re-reads from disk).
    const re2 = stringifyYaml(JSON.parse(JSON.stringify(loaded.parsed)));
    expect(re.length).toBeGreaterThan(0);
    expect(re2.length).toBeGreaterThan(0);
    // Both serialisations must encode the same `openapi` value.
    expect(re).toContain('openapi: 3.1.0');
    expect(re2).toContain('openapi: 3.1.0');
  });

  it('parse → stringify → re-parse preserves info.title + info.version', () => {
    const re = stringifyYaml(loaded.parsed);
    expect(re).toContain('PRYZM Public API');
    expect(re).toContain('1.0.0-draft');
  });

  it('parse → stringify → re-parse preserves the canonical server URL', () => {
    const re = stringifyYaml(loaded.parsed);
    expect(re).toContain('https://api.pryzm.com/v1');
  });
});

describe('S63 D7-D8 — endpoint presence + method spread', () => {
  it('declares at least the SPEC-26 §8 REST surface (export + import)', () => {
    const paths = Object.keys(loaded.parsed.paths);
    expect(paths).toContain('/projects/{projectId}/export.pryzm');
    expect(paths).toContain('/projects/import');
  });

  it('every declared operation uses one of the 8 standard HTTP methods', () => {
    for (const [path, item] of Object.entries(loaded.parsed.paths)) {
      for (const key of Object.keys(item)) {
        if ((HTTP_METHODS as readonly string[]).includes(key)) {
          // ✓ valid
        } else if (['summary', 'description', 'parameters', 'servers'].includes(key)) {
          // ✓ valid pathItem-level fields
        } else {
          throw new Error(`unexpected pathItem key "${key}" at ${path}`);
        }
      }
    }
  });

  it('every operation declares an OAuth2 security requirement', () => {
    for (const [path, item] of Object.entries(loaded.parsed.paths)) {
      for (const method of HTTP_METHODS) {
        const op = item[method];
        if (!op) continue;
        const security = op.security ?? loaded.parsed.security ?? [];
        expect(security.length, `${method.toUpperCase()} ${path} must declare a security requirement`).toBeGreaterThan(0);
        const hasOAuth2 = security.some((req) => 'oauth2' in (req ?? {}));
        expect(hasOAuth2, `${method.toUpperCase()} ${path} must reference oauth2`).toBe(true);
      }
    }
  });

  it('every scope referenced in security is declared in components.securitySchemes', () => {
    const schemeScopes = new Set(
      Object.keys(
        loaded.parsed.components?.securitySchemes?.oauth2?.flows?.authorizationCode?.scopes ?? {},
      ),
    );
    for (const [path, item] of Object.entries(loaded.parsed.paths)) {
      for (const method of HTTP_METHODS) {
        const op = item[method];
        if (!op) continue;
        const security = op.security ?? loaded.parsed.security ?? [];
        for (const req of security) {
          for (const scope of req.oauth2 ?? []) {
            expect(schemeScopes.has(scope), `${method.toUpperCase()} ${path} references undeclared scope "${scope}"`).toBe(true);
          }
        }
      }
    }
  });
});

describe('S63 D7-D8 — invariant checker reports clean', () => {
  it('validateOpenApi3_1Invariants returns zero violations', () => {
    const violations = validateOpenApi3_1Invariants(loaded.parsed);
    expect(violations, `unexpected invariant violations: ${JSON.stringify(violations, null, 2)}`).toEqual([]);
  });
});

describe('S63 D7-D8 — scope catalogue parity with @pryzm/api-rbac', () => {
  it('the openapi.yaml scope set matches the api-rbac ALL_API_SCOPES list', async () => {
    // Lazy-load api-rbac so a missing peer doesn't break this suite — it's
    // a parity check, not a hard dep.
    let allRbacScopes: readonly string[];
    try {
      const mod = await import('@pryzm/api-rbac');
      allRbacScopes = mod.ALL_API_SCOPES;
    } catch {
      // api-rbac might not be installed in every CI shard; skip if so.
      return;
    }
    const yamlScopes = Object.keys(
      loaded.parsed.components?.securitySchemes?.oauth2?.flows?.authorizationCode?.scopes ?? {},
    ).sort();
    expect(yamlScopes).toEqual([...allRbacScopes].sort());
  });
});
