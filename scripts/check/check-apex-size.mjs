#!/usr/bin/env node
/**
 * scripts/check/check-apex-size.mjs
 * ============================================================================
 * C51 §6.1.3 gate — "apex bundle ≤ 200 KB total (gzipped)."
 *
 * The 200 KB gzipped ceiling is the budget that delivers C51 §2.1.2's sub-100 ms
 * first paint from every Cloudflare PoP. This gate gzips every file the apex
 * deploy ships (everything under apps/editor/dist-apex/ EXCEPT the Cloudflare
 * control files _headers / _redirects, which are edge config, not payload),
 * sums the compressed bytes, and fails if the total exceeds the budget.
 *
 * Gzip (not brotli) because Cloudflare's floor for older clients is gzip; the
 * budget must hold for the worst-case transfer encoding.
 *
 * Run `pnpm build:apex` first (the orchestrator `npm run check:apex` does this).
 *
 * Exit 0 = within budget. Exit 1 = over budget (prints the per-file breakdown).
 *
 * @see docs/02-decisions/contracts/C51-APEX-APP-DEPLOYMENT-SPLIT.md §6.1.3, §7
 * ============================================================================
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { resolve, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const distApex = resolve(repoRoot, 'apps', 'editor', 'dist-apex');

const BUDGET_BYTES = 200 * 1024;

// Cloudflare Pages control files are edge configuration, not first-paint
// payload — they never reach a browser as part of a page load.
const EXCLUDE = new Set(['_headers', '_redirects']);

if (!existsSync(distApex)) {
  console.error(`[check-apex-size] FATAL — ${relative(repoRoot, distApex)} does not exist.`);
  console.error('  Run `pnpm build:apex` first (or `npm run check:apex`, which builds then checks).');
  process.exit(1);
}

/** Recursively collect every shippable file under dist-apex/. */
function shippableFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...shippableFiles(full));
    // Skip Cloudflare control files + dotfiles (Pages does not serve dotfiles).
    else if (!EXCLUDE.has(name) && !name.startsWith('.')) out.push(full);
  }
  return out;
}

const rows = [];
let totalGz = 0;
for (const file of shippableFiles(distApex)) {
  const raw = readFileSync(file);
  const gz = gzipSync(raw, { level: 9 }).length;
  totalGz += gz;
  rows.push({ rel: relative(distApex, file).replace(/\\/g, '/'), raw: raw.length, gz });
}

rows.sort((a, b) => b.gz - a.gz);
console.log('[check-apex-size] gzipped payload (excludes _headers/_redirects):');
for (const r of rows) {
  console.log(`  ${r.rel.padEnd(28)} ${r.gz.toLocaleString().padStart(8)} B gz  (${r.raw.toLocaleString()} B raw)`);
}

const kb = (totalGz / 1024).toFixed(1);
const budgetKb = (BUDGET_BYTES / 1024).toFixed(0);
if (totalGz > BUDGET_BYTES) {
  console.error(`\n[check-apex-size] FAIL — ${kb} KB gzipped exceeds the ${budgetKb} KB budget (C51 §6.1.3).`);
  process.exit(1);
}

console.log(`\n[check-apex-size] PASS — ${kb} KB gzipped, within the ${budgetKb} KB budget (${((1 - totalGz / BUDGET_BYTES) * 100).toFixed(0)}% headroom).`);
