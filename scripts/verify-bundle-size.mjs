#!/usr/bin/env node
/**
 * verify-bundle-size.mjs — S61 D6 deliverable per
 * `docs/architecture/adr/0031-s61-staged-legacy-deletion.md` §Decision D6:
 *
 *   "visual + e2e regression suite confirms `bundle.size.initial-app
 *    < 1.8 MB gzip` (per `apps/bench/`) and `visual-diff < 2 px` on the
 *    30-case fixture (per ADR-0030 reconciliation contract)."
 *
 * Visual-diff is gated on production fixture infrastructure (deferred).
 * This script covers the bundle-size half: scan `dist/assets/`, gzip
 * each entry chunk, and assert the largest entry chunk gzipped is
 * under the budget.
 *
 * Behaviour:
 *
 *   • `dist/` missing  → exit 2 (build did not run; no signal).
 *   • Largest entry chunk > 1.8 MB gzip → exit 1 with a per-chunk table.
 *   • All chunks under budget → exit 0 with a one-line OK.
 *
 * Invocation:
 *
 *   pnpm run build && node scripts/verify-bundle-size.mjs
 *
 * Optional `--budget=<bytes>` override for local experimentation; the
 * canonical budget is the constant `BUDGET_GZIP_BYTES` below.
 *
 * Per ADR-0031 §Negative-mitigated: from D5 onward (when un-flagged
 * users no longer pay the PRYZM 1 chunk download), this budget should
 * stay green by Vite's tree-shaking. Today (D1-D4 polarity) the legacy
 * chunk is still in the default user's bundle, so this script is run
 * informationally; CI does not gate on it until D5 closes.
 */

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

const BUDGET_GZIP_BYTES = 1_800_000; // 1.8 MB per ADR-0031 §D6
const DIST_DIR = 'dist';
const ASSETS_DIR = join(DIST_DIR, 'assets');

function parseBudgetOverride(argv) {
  for (const arg of argv) {
    const m = /^--budget=(\d+)$/.exec(arg);
    if (m) return Number(m[1]);
  }
  return BUDGET_GZIP_BYTES;
}

function listJsChunks(dir) {
  if (!existsSync(dir)) return [];
  const entries = [];
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    for (const name of readdirSync(cur)) {
      const path = join(cur, name);
      const st = statSync(path);
      if (st.isDirectory()) {
        stack.push(path);
      } else if (name.endsWith('.js')) {
        entries.push({ path, raw: st.size });
      }
    }
  }
  return entries;
}

function isEntryChunk(filename) {
  // Vite emits entry chunks as `index-<hash>.js` or `<name>-<hash>.js`
  // alongside dynamic chunks (which generally include `chunk-` in the
  // name or are imported asynchronously).  Heuristic: any `.js` file in
  // `dist/assets/` that does NOT start with `chunk-` is candidate-entry.
  // Per ADR-0031 §D6 the budget is on the *initial-app* chunk specifically;
  // we keep the heuristic simple and report all candidates so reviewer
  // can spot a mis-classification.
  return !/(^|\/)chunk-/.test(filename);
}

function format(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function main() {
  const budget = parseBudgetOverride(process.argv.slice(2));

  if (!existsSync(DIST_DIR)) {
    console.error(`[verify-bundle-size] ${DIST_DIR}/ not found — run \`pnpm run build\` first.`);
    process.exit(2);
  }

  const chunks = listJsChunks(ASSETS_DIR).map(({ path, raw }) => {
    const buf = readFileSync(path);
    const gz = gzipSync(buf, { level: 9 }).length;
    return { path, raw, gz, entry: isEntryChunk(path) };
  });

  if (chunks.length === 0) {
    console.error(`[verify-bundle-size] no .js chunks in ${ASSETS_DIR}/.`);
    process.exit(2);
  }

  // Sort largest gzip first.
  chunks.sort((a, b) => b.gz - a.gz);

  const offenders = chunks.filter((c) => c.entry && c.gz > budget);

  console.log(`[verify-bundle-size] budget = ${format(budget)} gzip per entry chunk (per ADR-0031 §D6)`);
  console.log(`[verify-bundle-size] scanned ${chunks.length} .js chunks; top 10 by gzip size:`);
  for (const c of chunks.slice(0, 10)) {
    const tag = c.entry ? 'entry' : 'async';
    const flag = c.entry && c.gz > budget ? '  ⚠ OVER BUDGET' : '';
    console.log(`  [${tag}] ${format(c.gz).padStart(9)} gzip / ${format(c.raw).padStart(9)} raw  ${c.path}${flag}`);
  }

  if (offenders.length > 0) {
    console.error(`\n[verify-bundle-size] FAIL — ${offenders.length} entry chunk(s) exceed ${format(budget)} gzip:`);
    for (const c of offenders) {
      console.error(`  ${c.path} → ${format(c.gz)} gzip`);
    }
    process.exit(1);
  }

  console.log(`\n[verify-bundle-size] OK — all entry chunks under ${format(budget)} gzip.`);
  process.exit(0);
}

main();
