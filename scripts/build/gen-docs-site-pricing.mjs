#!/usr/bin/env node
// scripts/build/gen-docs-site-pricing.mjs
//
// Regenerates `apps/docs-site/src/data/pricing.json` from the canonical
// @pryzm/entitlements registry. Run this whenever the registry changes;
// commit the generated JSON alongside the change.
//
// Why a snapshot instead of a runtime import?
//   The docs-site is an Astro static-pre-render surface deployed to
//   Cloudflare Pages. Importing @pryzm/entitlements at build time
//   transitively pulls @pryzm/schemas + zod@4, which collides with
//   Starlight 0.30 + Astro 5's internal zod@3 schema invocation
//   (the `inst._zod` parse path crashes). See ADR-052 §1.4 (the
//   marketing-surface JSON-snapshot pattern, added 2026-06-02).
//
// CONTRACT INTENT (C39 §1.13): the pricing page MUST be generated
// from the entitlement registry. This script realises that — the
// snapshot is recomputed every time someone runs `pnpm run
// gen:docs-site-pricing`, and a queued CI gate
// (`scripts/check/check-docs-site-pricing-fresh.mjs`) will fail any
// PR where the snapshot drifts from the registry.
//
// USAGE
//   pnpm run gen:docs-site-pricing
//
// Implementation note: invoked via tsx so we can import the TS source
// directly (the canonical `@pryzm/entitlements` exports `./src/index.ts`
// per its package.json). No build step required.

import { execSync } from 'node:child_process';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
// A.U.20 — script lives at scripts/build/; REPO_ROOT is two levels up.
const REPO_ROOT = resolve(__dirname, '..', '..');
const OUT_PATH = resolve(REPO_ROOT, 'apps/docs-site/src/data/pricing.json');

mkdirSync(dirname(OUT_PATH), { recursive: true });

// Use tsx to evaluate the TS source directly. The output is captured
// via stdout to avoid mixing log lines with the JSON.
const ts = `
import { buildPricingPageData } from '${REPO_ROOT.replace(/\\/g, '/')}/packages/entitlements/src/pricingPage.ts';
process.stdout.write(JSON.stringify(buildPricingPageData(), null, 2));
`;

let json;
try {
    json = execSync(`npx tsx -e "${ts.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`, {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'inherit'],
    });
} catch (err) {
    console.error('[gen-docs-site-pricing] FATAL — tsx invocation failed:', err.message);
    process.exit(2);
}

// Verify it's parseable JSON before writing.
try {
    JSON.parse(json);
} catch (parseErr) {
    console.error('[gen-docs-site-pricing] FATAL — tsx output was not valid JSON:');
    console.error(json.slice(0, 500));
    process.exit(2);
}

writeFileSync(OUT_PATH, json + '\n');
console.log(`[gen-docs-site-pricing] OK — wrote ${OUT_PATH} (${json.length} bytes)`);
