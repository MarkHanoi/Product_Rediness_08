#!/usr/bin/env tsx
/**
 * P2 — `packages/renderer-three/` is the sole THREE importer. Hard-fail at 0.
 *
 * Spec:   docs/03_PRYZM3/00-PROCESS-TRACKER.md §1 metrics #12 / #12a / #12b
 * Anchor: docs/01-strategy/STR-03-engineering-vision.md (P2 — Single THREE owner)
 *
 * ─── §FIX-GATE-NEEDS-RIPGREP (L-811), 2026-08-09 ─────────────────────────────
 * This gate used to shell out to `rg`. Ripgrep is not a declared dependency, is
 * not installed on a stock Windows box, and `.github/workflows/ci.yml` never
 * installed it — so on any such machine the gate died with
 *
 *     Error: spawnSync rg ENOENT
 *
 * and P2, one of the eight architectural principles, was enforced by nothing.
 * Worse, this gate was ALSO listed in `gate-debt.json`, so the crash was absorbed
 * as "known failing" and never distinguished from a real violation. MISSING
 * PREREQUISITE and DIRTY CODE produced the same observable state — the
 * §CONTEXT-DATA-HONESTY failure, applied to CI itself.
 *
 * Rewritten on `lib/sourceScan.ts` (Node only, zero external binaries). See that
 * file for why the fix is Node-native rather than "install ripgrep in CI".
 *
 * ─── What is matched ─────────────────────────────────────────────────────────
 *   import … from 'three'               ← bare
 *   import … from 'three/tsl'           ← sub-path
 *   import … from 'three/examples/…'    ← addons
 *
 * NOT matched (P2-compliant paths through the owner):
 *   '@pryzm/renderer-three'        · the canonical barrel
 *   '@pryzm/renderer-three/three'  · the THREE namespace sub-path
 *   export * from 'three'          · the re-export barrel inside the owner
 *   await import('three')          · dynamic; not an import declaration
 *
 * Exit: 0 = zero violations · 1 = any violation · 2 = scan misconfigured
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { scanFiles } from './lib/sourceScan.js';

const REPO_ROOT = process.env.GA_GATE_REPO_ROOT ?? process.cwd();
const LABEL = 'three-import-tripwire';
const HARD_FAIL = 0;

/**
 * Everything the PRYZM 3 build owns. `editor/` is a standalone sibling
 * sub-project (own turbo, own biome, own port, absent from pnpm-workspace.yaml);
 * `attached_assets/` is user uploads. Neither is in any build path.
 */
const SCAN_DIRS = ['src', 'apps', 'packages', 'plugins', 'server', 'tools', 'scripts']
  .filter((d) => existsSync(join(REPO_ROOT, d)));

/** ~7k TS files across those trees today. */
const MIN_FILES = 3000;

function excluded(rel: string): boolean {
  // The sole legitimate importer: the re-export barrel and its addon wrappers.
  if (rel.startsWith('packages/renderer-three/')) return true;
  // Intentional ESLint-rule violation fixtures — they must contain the pattern.
  if (/(^|\/)__fixtures__\//.test(rel)) return true;
  if (/(^|\/)__tests__\/lint-fixtures\//.test(rel)) return true;
  if (/\.(bad|good)\.tsx?$/.test(rel)) return true;
  // This gate file — the pattern literal lives in it.
  if (rel === 'tools/ga-gate/check-three-imports.ts') return true;
  return false;
}

// Anchored at line start, so JSDoc lines (` * import …`), string literals and
// `export … from 'three'` re-exports do not match.
const PATTERN = /^\s*import\b.*\bfrom\s*['"]three(?:\/[^'"]+)?['"]/;

const res = scanFiles({
  root: REPO_ROOT,
  dirs: SCAN_DIRS,
  pattern: PATTERN,
  minFiles: MIN_FILES,
  exclude: excluded,
  label: LABEL,
});

console.log(`[${LABEL}] files scanned: ${res.filesScanned} (excluded ${res.filesExcluded}) · dirs: ${SCAN_DIRS.join(', ')}`);

if (res.matches.length > HARD_FAIL) {
  console.error(`\n[${LABEL}] FAIL: ${res.matches.length} import line(s) outside packages/renderer-three/ import 'three' directly.`);
  for (const m of res.matches) console.error(`      ${m.file}:${m.line}  ${m.text}`);
  console.error(
    `\n  All THREE consumers must use '@pryzm/renderer-three' (barrel) or\n` +
    `  '@pryzm/renderer-three/three' (THREE namespace) — never 'three/*' directly.\n` +
    `  Read: docs/01-strategy/STR-03-engineering-vision.md (P2)`,
  );
  process.exit(1);
}

console.log(`[${LABEL}] OK: 0 direct 'three' or 'three/*' importers outside packages/renderer-three/.`);
