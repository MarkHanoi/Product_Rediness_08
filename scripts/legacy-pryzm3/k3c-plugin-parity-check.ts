#!/usr/bin/env tsx
/**
 * scripts/k3c-plugin-parity-check.ts
 *
 * K3-C gate check #2: SDK host proxy parity check.
 * Verifies that @pryzm/plugin-sdk exports cover all 6 host-proxy contracts
 * and the core lifecycle + descriptor surface.
 *
 * Per 20-PHASE-F-PLAN.md §3.1 step 1 (corrected 2026-05-02):
 *   pnpm tsx scripts/k3c-plugin-parity-check.ts   # → all pairings ✅
 *
 * Correction vs. plan: Plan listed proxies as CommandBusProxy / StoreProxy /
 * RendererProxy / PersistenceProxy / SyncProxy / AiProxy. Actual names are:
 * CommandBusProxy / StoresProxy / ViewsProxy / SelectionProxy / AiProxy /
 * FormatProxy. All are type-only exports via packages/plugin-sdk/src/hosts/.
 *
 * Phase F pre-publish gate (2026-05-02).
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// A.U.20 — script lives at scripts/legacy-pryzm3/; ROOT is two levels up.
const ROOT = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');
const SDK_SRC = join(ROOT, 'packages', 'plugin-sdk', 'src');

const BANNER = '─'.repeat(60);
let errors = 0;
let passes = 0;

function fail(msg: string): void {
  console.error(`  ✘  ${msg}`);
  errors++;
}

function pass(msg: string): void {
  console.log(`  ✔  ${msg}`);
  passes++;
}

console.log(`\n${BANNER}`);
console.log('  K3-C Gate #2 — SDK Host Proxy Parity Check');
console.log(`  scripts/k3c-plugin-parity-check.ts  (2026-05-02)`);
console.log(BANNER);

const indexPath = join(SDK_SRC, 'index.ts');
const indexContent = existsSync(indexPath) ? readFileSync(indexPath, 'utf8') : '';

// ── Check 1: host proxy files exist ─────────────────────────────────────────
console.log(`\n  [1/3] Host proxy source files`);
const HOST_FILES = [
  'hosts/command-bus.ts',
  'hosts/stores.ts',
  'hosts/views.ts',
  'hosts/selection.ts',
  'hosts/ai.ts',
  'hosts/format.ts',
  'hosts/index.ts',
];
for (const f of HOST_FILES) {
  const path = join(SDK_SRC, f);
  if (existsSync(path)) {
    pass(`${f} exists`);
  } else {
    fail(`${f} missing`);
  }
}

// ── Check 2: proxy type names exported from index.ts ─────────────────────────
console.log(`\n  [2/3] Proxy exports in @pryzm/plugin-sdk index.ts`);
// Actual proxy type names per packages/plugin-sdk/src/hosts/index.ts:
const PROXY_TYPES = [
  'HostProxies',
  'CommandBusProxy',
  'StoresProxy',
  'ViewsProxy',
  'SelectionProxy',
  'AiProxy',
  'FormatProxy',
];
for (const sym of PROXY_TYPES) {
  if (indexContent.includes(sym)) {
    pass(`index.ts exports ${sym}`);
  } else {
    fail(`index.ts missing: ${sym}`);
  }
}

// ── Check 3: lifecycle + descriptor + sandbox + signing surface ───────────────
console.log(`\n  [3/3] Lifecycle + descriptor + sandbox + signing`);
const REQUIRED_SYMBOLS = [
  'definePlugin',
  'PluginManifestSchema',
  'validateManifest',
  'buildPluginCSP',
  'buildIframeHeadHTML',
  'generateKeyPair',
  'verifyPluginSignature',
  'RevocationList',
];
for (const sym of REQUIRED_SYMBOLS) {
  if (indexContent.includes(sym)) {
    pass(`index.ts exports ${sym}`);
  } else {
    fail(`index.ts missing: ${sym}`);
  }
}

// ── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n${BANNER}`);
console.log(`  Checks: ${passes + errors} | Passed: ${passes} | Failed: ${errors}`);
if (errors === 0) {
  console.log('  ✅  K3-C Gate #2 PASSED — host proxy parity verified\n');
  process.exit(0);
} else {
  console.log(`  ✘   K3-C Gate #2 FAILED — ${errors} error(s)\n`);
  process.exit(1);
}
