#!/usr/bin/env tsx
/**
 * scripts/k3c-api-surface-diff.ts
 *
 * K3-C gate check #3: API surface freeze check.
 * Verifies no breaking changes in @pryzm/plugin-sdk from the v1.0.0-rc.1
 * locked surface (per ADR-0038 §A — anything exported from plugin-sdk is
 * locked for v1.x).
 *
 * Per 20-PHASE-F-PLAN.md §3.1 step 1:
 *   pnpm tsx scripts/k3c-api-surface-diff.ts   # → 0 breaking changes ✅
 *
 * Locked surface extracted from packages/plugin-sdk/src/index.ts at
 * v1.0.0-rc.1 (2026-05-01). Removal of any named export = breaking change.
 *
 * Correction vs. plan: proxy names corrected to actual names in codebase
 * (StoresProxy/ViewsProxy/SelectionProxy/FormatProxy, no PersistenceProxy
 * or SyncProxy at rc.1; sandbox entry points are buildPluginCSP et al.,
 * not createPluginSandbox).
 *
 * Phase F pre-publish gate (2026-05-02).
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// A.U.20 — script lives at scripts/legacy-pryzm3/; ROOT is two levels up.
const ROOT = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');

const BANNER = '─'.repeat(60);

console.log(`\n${BANNER}`);
console.log('  K3-C Gate #3 — API Surface Freeze Check');
console.log(`  scripts/k3c-api-surface-diff.ts  (2026-05-02)`);
console.log(BANNER);

// Locked API surface at v1.0.0-rc.1 (extracted 2026-05-02, corrected from plan).
// These symbols MUST remain exported in any subsequent version.
const LOCKED_SURFACE_V1_RC1 = [
  // D1 — Descriptor
  'PluginPermissionSchema',
  'PluginContributionSchema',
  'PluginManifestSchema',
  'validateManifest',
  // D2 — Lifecycle
  'definePlugin',
  'HOOK_TIMEOUT_MS',
  // D3 — Host proxies (correct names per packages/plugin-sdk/src/hosts/)
  'CommandBusProxy',
  'StoresProxy',
  'ViewsProxy',
  'SelectionProxy',
  'AiProxy',
  'FormatProxy',
  'HostProxies',
  // D4 + D7 — Sandbox (correct entry points per packages/plugin-sdk/src/sandbox/)
  'buildPluginCSP',
  'buildIframeHeadHTML',
  'buildIframeSrcdoc',
  'isAllowedFromPlugin',
  'isAllowedFromHost',
  // D8 — Signing
  'generateKeyPair',
  'signPayload',
  'verifyPayload',
  'makePluginSignature',
  'verifyPluginSignature',
  'RevocationList',
  'canonicalJSONStringify',
  // Schemas
  'createId',
] as const;

const indexPath = join(ROOT, 'packages', 'plugin-sdk', 'src', 'index.ts');
if (!existsSync(indexPath)) {
  console.error(`  ✘  packages/plugin-sdk/src/index.ts not found`);
  process.exit(1);
}

const content = readFileSync(indexPath, 'utf8');

let breakingCount = 0;
let okCount = 0;

console.log(`\n  Checking ${LOCKED_SURFACE_V1_RC1.length} locked symbols...\n`);

for (const sym of LOCKED_SURFACE_V1_RC1) {
  if (content.includes(sym)) {
    okCount++;
  } else {
    console.error(`  ✘  BREAKING: "${sym}" missing from current index.ts`);
    breakingCount++;
  }
}

console.log(`\n${BANNER}`);
console.log(`  Locked: ${LOCKED_SURFACE_V1_RC1.length} | Present: ${okCount} | Missing: ${breakingCount}`);

if (breakingCount === 0) {
  console.log('  ✅  K3-C Gate #3 PASSED — 0 breaking changes from v1.0.0-rc.1\n');
  process.exit(0);
} else {
  console.log(`  ✘   K3-C Gate #3 FAILED — ${breakingCount} breaking change(s)\n`);
  process.exit(1);
}
