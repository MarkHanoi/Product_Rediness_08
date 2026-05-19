import { describe, it, expect, beforeAll } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import {
  loadOpenApiSpec,
  resolveDefaultSpecPath,
  validateOpenApi3_1Invariants,
  type OpenApiDocument,
  type LoadedOpenApiSpec,
} from '../src/index.js';

/**
 * S63 D1 test suite for `@pryzm/api-spec`. Per ADR-0039 §B the YAML at
 * `packages/api-spec/openapi.yaml` is the canonical contract; these tests pin
 * every SPEC-26 §8 invariant + a byte-stable SHA-256 so accidental rewrites
 * (auto-formatter, line-ending change, etc.) fail at CI time rather than at
 * S65 client-codegen time when the cost is much higher.
 */

// SHA-256 of `packages/api-spec/openapi.yaml` as authored. Updated only when an
// ADR explicitly authorizes a change to the YAML (per ADR-0039 §B).
// Last re-pinned at S65 D1 (2026-04-28) authorized by ADR-0041 §B + ADR-0042 §A
// + ADR-0043 §A + ADR-0044 §C + ADR-0045 §A — adds the AI public API,
// Workspace Admin AI Spend rollup, enterprise admin overrides, formula
// catalog, and the WS gateway `x-websocket` extension paths to the byte-pinned
// surface.  See packages/api-spec/openapi.yaml header comment for the full
// authorization chain.
const PINNED_SHA256 =
  'cef1439bd7745d8d3a40b7ceaae5d5c6ff89a16e36adeffa946a6c1599b002f3';

let loaded: LoadedOpenApiSpec;

beforeAll(() => {
  loaded = loadOpenApiSpec();
});

describe('S63 D1 — OpenAPI YAML structural invariants (SPEC-26 §8)', () => {
  it('parses as valid YAML', () => {
    expect(loaded.parsed).toBeTypeOf('object');
    expect(loaded.parsed).not.toBeNull();
  });

  it('declares openapi version 3.1.0 exactly', () => {
    expect(loaded.parsed.openapi).toBe('3.1.0');
  });

  it('declares info.title exactly "PRYZM Public API"', () => {
    expect(loaded.parsed.info.title).toBe('PRYZM Public API');
  });

  it('pins info.version to "1.0.0-draft" (ADR-0039 §D)', () => {
    expect(loaded.parsed.info.version).toBe('1.0.0-draft');
  });

  it('declares the canonical server URL https://api.pryzm.com/v1', () => {
    expect(loaded.parsed.servers).toBeDefined();
    expect(loaded.parsed.servers!.length).toBeGreaterThanOrEqual(1);
    expect(loaded.parsed.servers![0]!.url).toBe('https://api.pryzm.com/v1');
  });
});

describe('S63 D1 — SPEC-26 §8 REST surface', () => {
  it('declares GET /projects/{projectId}/export.pryzm with project:read scope', () => {
    const op = loaded.parsed.paths['/projects/{projectId}/export.pryzm']?.get;
    expect(op).toBeDefined();
    expect(op!.security).toBeDefined();
    expect(op!.security![0]).toEqual({ oauth2: ['project:read'] });
    expect(op!.responses?.['200']).toBeDefined();
  });

  it('declares POST /projects/import with project:write scope', () => {
    const op = loaded.parsed.paths['/projects/import']?.post;
    expect(op).toBeDefined();
    expect(op!.security).toBeDefined();
    expect(op!.security![0]).toEqual({ oauth2: ['project:write'] });
    expect(op!.responses?.['201']).toBeDefined();
    expect(op!.requestBody).toBeDefined();
  });

  it('declares all three OAuth scopes (project:read, project:write, ai:invoke)', () => {
    const oauth2 = loaded.parsed.components?.securitySchemes?.['oauth2'];
    expect(oauth2).toBeDefined();
    expect(oauth2!.type).toBe('oauth2');
    const scopes = oauth2!.flows?.authorizationCode?.scopes ?? {};
    expect(Object.keys(scopes).sort()).toEqual([
      'ai:invoke',
      'project:read',
      'project:write',
    ]);
    expect(scopes['project:read']).toBe('Read project state');
    expect(scopes['project:write']).toBe('Create/update projects');
    expect(scopes['ai:invoke']).toBe('Invoke AI workflows');
  });

  it('defines Project component schema referenced by /projects/import', () => {
    const projectSchema = loaded.parsed.components?.schemas?.['Project'];
    expect(projectSchema).toBeDefined();
    const importOp = loaded.parsed.paths['/projects/import']?.post;
    const responseRef = (importOp?.responses?.['201'] as Record<string, unknown> | undefined)
      ?.['content'] as Record<string, { schema?: { $ref?: string } }> | undefined;
    expect(responseRef?.['application/json']?.schema?.$ref).toBe(
      '#/components/schemas/Project',
    );
  });

  it('canonical OpenAPI path resolves to packages/api-spec/openapi.yaml', () => {
    const path = resolveDefaultSpecPath();
    expect(path).toMatch(/packages[/\\]api-spec[/\\]openapi\.yaml$/);
  });
});

describe('S63 D1 — byte-stability (no accidental rewrites)', () => {
  it('YAML SHA-256 matches pinned hash (auto-formatter guard)', () => {
    if ((loaded.sha256 as string) === '__PIN_AT_FIRST_RUN__' || PINNED_SHA256 === '__PIN_AT_FIRST_RUN__') {
      // First run: emit the actual hash so the developer can pin it.
      // This branch is intentionally an assertion failure with a friendly message.
      throw new Error(
        `Pin the SHA-256 in this test:\n  PINNED_SHA256 = '${loaded.sha256}';\n` +
          `(see ADR-0039 §B — YAML is canonical; auto-formatter rewrites must fail CI)`,
      );
    }
    expect(loaded.sha256).toBe(PINNED_SHA256);
  });

  it('hashing is stable across re-reads', () => {
    const raw = readFileSync(resolveDefaultSpecPath(), 'utf8');
    const hash = createHash('sha256').update(raw, 'utf8').digest('hex');
    expect(hash).toBe(loaded.sha256);
  });
});

describe('S63 D1 — invariant checker accepts the canonical YAML', () => {
  it('reports zero violations for the canonical spec', () => {
    const violations = validateOpenApi3_1Invariants(loaded.parsed);
    expect(violations).toEqual([]);
  });
});

describe('S63 D1 — invariant checker rejects targeted breakages', () => {
  function clone(): OpenApiDocument {
    return parseYaml(loaded.raw) as OpenApiDocument;
  }

  it('rejects when openapi field is not 3.1.0', () => {
    const bad = clone();
    bad.openapi = '3.0.0';
    const violations = validateOpenApi3_1Invariants(bad);
    expect(violations.some((v) => v.path === 'openapi')).toBe(true);
  });

  it('rejects when info.title is wrong', () => {
    const bad = clone();
    bad.info.title = 'Some Other API';
    const violations = validateOpenApi3_1Invariants(bad);
    expect(violations.some((v) => v.path === 'info.title')).toBe(true);
  });

  it('rejects when info.version does not match the version regex', () => {
    const bad = clone();
    bad.info.version = 'banana';
    const violations = validateOpenApi3_1Invariants(bad);
    expect(violations.some((v) => v.path === 'info.version')).toBe(true);
  });

  it('rejects when servers is empty', () => {
    const bad = clone();
    bad.servers = [];
    const violations = validateOpenApi3_1Invariants(bad);
    expect(violations.some((v) => v.path === 'servers')).toBe(true);
  });

  it('rejects when an operation has no security', () => {
    const bad = clone();
    delete bad.paths['/projects/import']!.post!.security;
    const violations = validateOpenApi3_1Invariants(bad);
    expect(
      violations.some(
        (v) => v.path === 'paths./projects/import.post.security',
      ),
    ).toBe(true);
  });

  it('rejects when an operation references an undefined scope', () => {
    const bad = clone();
    bad.paths['/projects/import']!.post!.security = [
      { oauth2: ['nonexistent:scope'] },
    ];
    const violations = validateOpenApi3_1Invariants(bad);
    expect(
      violations.some((v) =>
        v.message.includes("references undefined scope 'nonexistent:scope'"),
      ),
    ).toBe(true);
  });

  it('rejects when an operation references an undefined scheme', () => {
    const bad = clone();
    bad.paths['/projects/import']!.post!.security = [{ basic: [] }];
    const violations = validateOpenApi3_1Invariants(bad);
    expect(
      violations.some((v) =>
        v.message.includes("references undefined securityScheme 'basic'"),
      ),
    ).toBe(true);
  });

  it('rejects when a path has zero HTTP methods', () => {
    const bad = clone();
    bad.paths['/projects/import'] = {};
    const violations = validateOpenApi3_1Invariants(bad);
    expect(
      violations.some((v) => v.path === 'paths./projects/import'),
    ).toBe(true);
  });

  it('returns violations sorted by path', () => {
    const bad = clone();
    bad.openapi = '3.0.0';
    bad.info.title = 'Wrong';
    bad.servers = [];
    const violations = validateOpenApi3_1Invariants(bad);
    const paths = violations.map((v) => v.path);
    const sorted = [...paths].sort();
    expect(paths).toEqual(sorted);
  });
});
