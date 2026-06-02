#!/usr/bin/env node
// scripts/check-ai-host-bundle.mjs — S48 D6 runtime side of K3-A.
//
// Spec source: `phases/PHASE-2D-Q4-M22-M24-SYNC-AWARENESS-BETA.md`
// §S47 D1 (line 611) — "verified via DevTools and build report".
// Companion to `scripts/check-ai-host-lazy.mjs` (the static side).
//
// CONTRACT
// ─────────────────────────────────────────────────────────────────────────────
// Given a Vite manifest (default: `apps/editor/dist/.vite/manifest.json`),
// assert that:
//
//   (a) `AiHost.impl` appears as a SEPARATE chunk that is NOT marked
//       `isEntry: true` and NOT in the entry chunk's `imports` array
//       (which is the editor's first-paint dependency closure).
//   (b) The entry chunk does NOT statically reference `ai-host` in its
//       imports — only `dynamicImports` is allowed.
//
// If no manifest exists yet (clean dev tree), the script SKIPS with a
// clear "no build artefact yet" note and exits 0. CI is expected to
// run `npm run build` before invoking this script for a hard gate.
//
// USAGE
// ─────────────────────────────────────────────────────────────────────────────
//   node scripts/check-ai-host-bundle.mjs                              # default manifest path
//   node scripts/check-ai-host-bundle.mjs path/to/manifest.json        # explicit path
//   PRYZM_BUNDLE_REPORT_REQUIRED=1 node scripts/check-ai-host-bundle.mjs   # missing manifest → fail

import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const DEFAULT_MANIFEST = 'apps/editor/dist/.vite/manifest.json';

const argv = process.argv.slice(2);
const manifestPath = resolve(process.cwd(), argv[0] ?? DEFAULT_MANIFEST);
const required = process.env['PRYZM_BUNDLE_REPORT_REQUIRED'] === '1';

if (!existsSync(manifestPath) || !statSync(manifestPath).isFile()) {
  if (required) {
    console.error(`[check-ai-host-bundle] FAIL — manifest not found at ${manifestPath}`);
    console.error('PRYZM_BUNDLE_REPORT_REQUIRED=1 → manifest is mandatory.');
    console.error('Run `npm run build` first, or unset the env var to allow skip.');
    process.exit(2);
  }
  console.log(`[check-ai-host-bundle] SKIP — no manifest at ${manifestPath} (run \`npm run build\` first).`);
  console.log('Skipped check is still a SUCCESS in dev. Set PRYZM_BUNDLE_REPORT_REQUIRED=1 in CI to enforce.');
  process.exit(0);
}

let manifest;
try {
  manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
} catch (e) {
  console.error(`[check-ai-host-bundle] FAIL — manifest is not valid JSON: ${e.message}`);
  process.exit(1);
}

const entries = Object.entries(manifest);

const aiHostChunks = entries.filter(([k, v]) => {
  const fileMatch = typeof v?.file === 'string' && /AiHost\.impl/i.test(v.file);
  const keyMatch = /AiHost\.impl/i.test(k);
  return fileMatch || keyMatch;
});

if (aiHostChunks.length === 0) {
  console.log('[check-ai-host-bundle] PASS — manifest does not reference AiHost.impl at all.');
  console.log('  (This is expected when no caller has wired getAiHost() yet — S48 keeps');
  console.log('   the editor binding deferred to S49.)');
  process.exit(0);
}

const violations = [];

for (const [key, chunk] of aiHostChunks) {
  if (chunk?.isEntry) {
    violations.push(`AiHost.impl chunk \`${key}\` is marked isEntry — it must NOT be a first-paint entry.`);
  }
}

const entryChunks = entries.filter(([, v]) => v?.isEntry);
for (const [key, entry] of entryChunks) {
  const staticImports = Array.isArray(entry.imports) ? entry.imports : [];
  for (const imp of staticImports) {
    const target = manifest[imp];
    if (target?.file && /AiHost\.impl/i.test(target.file)) {
      violations.push(
        `Entry chunk \`${key}\` statically imports \`${imp}\` which resolves to ` +
          `${target.file}. AiHost.impl must only appear in dynamicImports.`,
      );
    }
  }
}

if (violations.length > 0) {
  console.error('[check-ai-host-bundle] FAIL — K3-A bundle contract broken:\n');
  for (const v of violations) console.error(`  • ${v}`);
  console.error('\nSpec: phases/PHASE-2D-Q4-M22-M24-SYNC-AWARENESS-BETA.md §S47 line 611');
  console.error('ADR : docs/02-decisions/adrs/0037-ai-host-lazy-bootstrap.md (lazy contract)');
  console.error('ADR : docs/02-decisions/adrs/0038-m24-beta-gate-closure.md §3 (runtime gate)');
  console.error('Fix : route all AI host access through `getAiHost()` (lazy).');
  process.exit(1);
}

console.log('[check-ai-host-bundle] PASS — AiHost.impl is in a separate chunk and not in any entry closure.');
process.exit(0);
