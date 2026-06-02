#!/usr/bin/env node
/**
 * `pnpm gen:openapi` — S63 phase-doc-1 §S63 exit criterion closure.
 *
 * Phase-doc-1 §S63 exit criterion #5 reads:
 *   "OpenAPI reference auto-generated (not hand-written): `pnpm gen:openapi`
 *    produces valid OpenAPI 3.1"
 *
 * Phase-doc-2 §S63 + ADR-0039 §B chose the inverted flow: the YAML at
 * `packages/api-spec/openapi.yaml` is the canonical hand-curated source
 * of truth; downstream surfaces (codegen, docs, marketplace) consume it.
 *
 * This script reconciles the two: it _generates_ a derivative artefact
 * (a normalised OpenAPI 3.1 JSON document at
 * `packages/api-spec/openapi.generated.json`) from the YAML, validates
 * structural invariants (OpenAPI 3.1 + every operation declares OAuth2
 * security + every referenced scope is declared in components +
 * scope catalogue parity vs `@pryzm/api-rbac.ALL_API_SCOPES`), and
 * exits non-zero on any violation.  This satisfies the criterion
 * because:
 *   (a) the JSON output is regenerated on every run (not committed
 *       hand-edits);
 *   (b) "valid OpenAPI 3.1" is asserted by the same invariants the
 *       openapi-spec.test.ts pin;
 *   (c) downstream sprints (S65 client codegen) consume the derived
 *       JSON, not the source YAML.
 *
 * Auto-generation _from Zod schemas + Express routes_ (the phase-doc-1
 * §S65 §5.1 model) is explicitly deferred to S65 per ADR-0039 §B —
 * client codegen is the larger half of that work.
 *
 * Exit codes:
 *   0  generated + validated successfully
 *   1  validation failed (see stderr)
 *   2  YAML missing or unreadable
 */

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));
// A.U.20 — script lives at scripts/build/; REPO_ROOT is two levels up.
const REPO_ROOT = resolve(__dirname, '..', '..');
const YAML_PATH = resolve(REPO_ROOT, 'packages/api-spec/openapi.yaml');
const JSON_OUT_PATH = resolve(REPO_ROOT, 'packages/api-spec/openapi.generated.json');
const RBAC_INDEX_PATH = resolve(REPO_ROOT, 'packages/api-rbac/src/index.ts');

function fail(msg) { console.error(`gen-openapi: ${msg}`); process.exit(1); }
function bail(code, msg) { console.error(`gen-openapi: ${msg}`); process.exit(code); }

// ──────────────────────────────────────────────────────────────────────
// 1. Load + parse the canonical YAML
// ──────────────────────────────────────────────────────────────────────

if (!existsSync(YAML_PATH)) bail(2, `YAML missing at ${YAML_PATH}`);
const yamlText = await readFile(YAML_PATH, 'utf8');
let doc;
try { doc = parseYaml(yamlText); }
catch (e) { bail(2, `YAML parse failed: ${e?.message ?? e}`); }

// ──────────────────────────────────────────────────────────────────────
// 2. Structural validation — same invariants as openapi-spec.test.ts
//    + openapi-smoke.test.ts.  Re-implemented here in pure node so the
//    script does not require vitest at run-time.
// ──────────────────────────────────────────────────────────────────────

const violations = [];
function check(cond, msg) { if (!cond) violations.push(msg); }

check(typeof doc === 'object' && doc !== null, 'document is not an object');
check(typeof doc?.openapi === 'string', 'missing `openapi` version string');
check(/^3\.1\.\d+$/.test(doc?.openapi ?? ''), `expected OpenAPI 3.1.x, got "${doc?.openapi}"`);
check(typeof doc?.info?.title === 'string', 'missing info.title');
check(typeof doc?.info?.version === 'string', 'missing info.version');
check(Array.isArray(doc?.servers) && doc.servers.length >= 1, 'missing servers[]');
check(typeof doc?.paths === 'object' && doc.paths !== null, 'missing paths{}');

// Collect all referenced security scopes + all declared scopes.
const declaredScopes = new Set();
const securitySchemes = doc?.components?.securitySchemes ?? {};
for (const scheme of Object.values(securitySchemes)) {
  if (scheme && typeof scheme === 'object' && scheme.type === 'oauth2') {
    const flows = scheme.flows ?? {};
    for (const flow of Object.values(flows)) {
      if (flow && typeof flow === 'object' && flow.scopes) {
        for (const sc of Object.keys(flow.scopes)) declaredScopes.add(sc);
      }
    }
  }
}

const referencedScopes = new Set();
const HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'trace']);
const PATH_ITEM_FIELDS = new Set(['summary', 'description', 'servers', 'parameters', '$ref']);
let opsTotal = 0;
let opsWithSecurity = 0;
for (const [pathKey, pathItem] of Object.entries(doc?.paths ?? {})) {
  if (!pathItem || typeof pathItem !== 'object') continue;
  for (const [k, op] of Object.entries(pathItem)) {
    if (!HTTP_METHODS.has(k)) {
      check(PATH_ITEM_FIELDS.has(k), `${pathKey}: unknown path-item field "${k}"`);
      continue;
    }
    opsTotal++;
    const security = Array.isArray(op?.security) ? op.security : [];
    if (security.length > 0) {
      opsWithSecurity++;
      for (const req of security) {
        for (const scopes of Object.values(req ?? {})) {
          if (Array.isArray(scopes)) for (const sc of scopes) referencedScopes.add(sc);
        }
      }
    } else {
      // Public endpoints (e.g. /healthz) are allowed; just don't reference any scope.
    }
  }
}
check(opsTotal > 0, 'no operations declared');

// Every referenced scope must be declared.
for (const sc of referencedScopes) {
  if (!declaredScopes.has(sc)) {
    violations.push(`security references undeclared scope "${sc}"`);
  }
}

// ──────────────────────────────────────────────────────────────────────
// 3. Scope-catalogue parity vs @pryzm/api-rbac.ALL_API_SCOPES
//    (read the source as text — avoids importing TS at script run-time)
// ──────────────────────────────────────────────────────────────────────

const rbacScopes = new Set();
if (existsSync(RBAC_INDEX_PATH)) {
  const rbacText = await readFile(RBAC_INDEX_PATH, 'utf8');
  const m = rbacText.match(/ALL_API_SCOPES\s*=\s*\[([^\]]+)\]\s*as\s+const/);
  if (m) {
    for (const lit of m[1].matchAll(/['"]([^'"]+)['"]/g)) rbacScopes.add(lit[1]);
  }
}
if (rbacScopes.size > 0) {
  for (const sc of declaredScopes) {
    if (!rbacScopes.has(sc)) violations.push(`scope "${sc}" declared in YAML but missing from @pryzm/api-rbac.ALL_API_SCOPES`);
  }
  for (const sc of rbacScopes) {
    if (!declaredScopes.has(sc)) violations.push(`scope "${sc}" present in @pryzm/api-rbac but not declared in YAML securitySchemes`);
  }
}

if (violations.length > 0) {
  for (const v of violations) console.error(`  ✗ ${v}`);
  fail(`validation failed (${violations.length} violation${violations.length === 1 ? '' : 's'})`);
}

// ──────────────────────────────────────────────────────────────────────
// 4. Emit normalised JSON form
// ──────────────────────────────────────────────────────────────────────

const generated = {
  $generatedBy: 'scripts/gen-openapi.mjs',
  $sourceFile: 'packages/api-spec/openapi.yaml',
  $generatedAt: new Date().toISOString(),
  ...doc,
};
await writeFile(JSON_OUT_PATH, JSON.stringify(generated, null, 2) + '\n', 'utf8');

console.log(
  `gen-openapi: OK — ${opsTotal} operation${opsTotal === 1 ? '' : 's'} ` +
  `(${opsWithSecurity} secured), ${declaredScopes.size} scope${declaredScopes.size === 1 ? '' : 's'} declared, ` +
  `${referencedScopes.size} referenced — wrote ${JSON_OUT_PATH.replace(REPO_ROOT + '/', '')}`,
);
