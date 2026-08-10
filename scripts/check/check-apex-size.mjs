#!/usr/bin/env node
/**
 * scripts/check/check-apex-size.mjs
 * ============================================================================
 * C51 §6.1.3 gate — "apex FIRST-PAINT payload ≤ 200 KB (gzipped)."
 *
 * The 200 KB gzipped ceiling is the budget that delivers C51 §2.1.2's sub-100 ms
 * first paint from every Cloudflare PoP. This gate gzips the files the apex
 * deploy ships (everything under apps/editor/dist-apex/ EXCEPT the Cloudflare
 * control files _headers / _redirects, which are edge config, not payload),
 * sums the compressed bytes, and fails if the total exceeds the budget.
 *
 * §6.1.3 MEDIA CARVE-OUT (amended 2026-08-09, founder hero-video brief)
 * ---------------------------------------------------------------------
 * Streamed media (.mp4/.webm/.ogv/.mov/.m4v) is measured SEPARATELY and is not
 * charged to the first-paint budget. This is not a loophole, it is what the
 * budget was always measuring: a `<video preload="metadata">` contributes a
 * range request for its header to first paint, not its body, and the browser
 * paints the poster immediately. Charging a 14 MB progressive-download asset
 * against a ceiling that exists to bound TIME-TO-FIRST-PAINT would fail a page
 * that is in fact fast, and — worse — would push the next contributor to delete
 * the measurement rather than the megabytes.
 *
 * The carve-out is NOT unbounded: media has its own MEDIA_BUDGET_BYTES ceiling,
 * and busting it is a hard failure exactly like the first-paint budget. Both
 * numbers print on every run so neither can rot unobserved.
 *
 * Gzip (not brotli) because Cloudflare's floor for older clients is gzip; the
 * budget must hold for the worst-case transfer encoding. Media is reported RAW
 * (already-compressed containers do not gzip).
 *
 * Run `pnpm build:apex` first (the orchestrator `npm run check:apex` does this).
 *
 * Exit 0 = within both budgets. Exit 1 = over either (prints the breakdown).
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

// §6.1.3 media carve-out. 24 MB is deliberately close to the current asset
// (a 14.25 MB testing hero) rather than a comfortable round number: the point
// is to notice the SECOND video, not to pre-authorise it.
// 24 → 36 MB (2026-08-10): the founder replaced the testing hero with a 31.5 MB
// v2. Raised EXPLICITLY rather than snuck past — this gate exists to make weight
// a decision, and this line is that decision. 36 keeps ~13% headroom over the
// new asset while still refusing a careless 50 MB drop. STILL A TESTING BUDGET:
// compress/stream the hero to well under 24 MB before real launch traffic, then
// ratchet this back down. Any further bump needs its own dated justification.
const MEDIA_BUDGET_BYTES = 36 * 1024 * 1024;
const MEDIA_EXT = /\.(mp4|webm|ogv|mov|m4v)$/i;

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
const mediaRows = [];
let totalGz = 0;
let totalMedia = 0;
for (const file of shippableFiles(distApex)) {
  const raw = readFileSync(file);
  const rel = relative(distApex, file).replace(/\\/g, '/');
  if (MEDIA_EXT.test(file)) {
    totalMedia += raw.length;
    mediaRows.push({ rel, raw: raw.length });
    continue;
  }
  const gz = gzipSync(raw, { level: 9 }).length;
  totalGz += gz;
  rows.push({ rel, raw: raw.length, gz });
}

rows.sort((a, b) => b.gz - a.gz);
console.log('[check-apex-size] first-paint payload, gzipped (excludes _headers/_redirects + media):');
for (const r of rows) {
  console.log(`  ${r.rel.padEnd(28)} ${r.gz.toLocaleString().padStart(8)} B gz  (${r.raw.toLocaleString()} B raw)`);
}

if (mediaRows.length > 0) {
  mediaRows.sort((a, b) => b.raw - a.raw);
  console.log('\n[check-apex-size] streamed media, raw (C51 §6.1.3 carve-out — NOT first paint):');
  for (const r of mediaRows) {
    console.log(`  ${r.rel.padEnd(28)} ${(r.raw / (1024 * 1024)).toFixed(2).padStart(8)} MB raw`);
  }
}

const kb = (totalGz / 1024).toFixed(1);
const budgetKb = (BUDGET_BYTES / 1024).toFixed(0);
const mediaMb = (totalMedia / (1024 * 1024)).toFixed(2);
const mediaBudgetMb = (MEDIA_BUDGET_BYTES / (1024 * 1024)).toFixed(0);

let failed = false;
if (totalGz > BUDGET_BYTES) {
  console.error(`\n[check-apex-size] FAIL — first-paint ${kb} KB gzipped exceeds the ${budgetKb} KB budget (C51 §6.1.3).`);
  failed = true;
}
if (totalMedia > MEDIA_BUDGET_BYTES) {
  console.error(`\n[check-apex-size] FAIL — media ${mediaMb} MB exceeds the ${mediaBudgetMb} MB media budget (C51 §6.1.3 carve-out).`);
  failed = true;
}
if (failed) process.exit(1);

console.log(`\n[check-apex-size] PASS — first paint ${kb} KB gzipped, within the ${budgetKb} KB budget (${((1 - totalGz / BUDGET_BYTES) * 100).toFixed(0)}% headroom).`);
if (totalMedia > 0) {
  console.log(`[check-apex-size] PASS — media ${mediaMb} MB, within the ${mediaBudgetMb} MB media budget (${((1 - totalMedia / MEDIA_BUDGET_BYTES) * 100).toFixed(0)}% headroom).`);
}
