#!/usr/bin/env tsx
/**
 * G1-T4 — NME proxy geometry-leak ceiling guard.
 *
 * Spec:   docs/03_PRYZM3/04-PLAN-FORWARD/50-PLAN-FORWARD-GAP-ANALYSIS.md §1 (G1-T4)
 * Anchor: docs/03_PRYZM3/04-PLAN-FORWARD/50-PLAN-FORWARD-GAP-ANALYSIS.md §1 (N1)
 *
 * ─── §FIX-GATE-NEEDS-RIPGREP (L-811), 2026-08-11 ─────────────────────────────
 * This gate used to shell out to `rg` via `execFileSync('rg', …)`. Ripgrep is not
 * a declared dependency of this repo, is not installed on a stock Windows box, and
 * `.github/workflows/ci.yml` never installed it — `ci.yml:296-305` says in so many
 * words: "DO NOT reintroduce a gate that shells out to a tool this workflow does
 * not install." On any such machine this gate died with
 *
 *     Error: spawnSync rg ENOENT
 *
 * exit 1 — the same exit code a REAL violation produces. And because the gate was
 * ALSO carried on `gate-debt.json`, that permanent red was absorbed as "known
 * debt" while the gate had never read a single line of source. MISSING
 * PREREQUISITE and CLEAN CODE produced the same observable state.
 *
 * Rewritten on `lib/sourceScan.ts` (Node only, zero external binaries).
 *
 * ─── What the gate asserts ───────────────────────────────────────────────────
 * Hard-fail if ANY `releaseGroups(` call-site is missing the `{ disposeProxies: true }`
 * option that ensures NME proxy EdgesGeometry objects are disposed when no longer needed.
 *
 * Background:
 *   NativeElementMeshExporter.releaseGroups() has two code paths depending on the
 *   `disposeProxies` flag (introduced in G1-T1 / G1-T3):
 *
 *     disposeProxies: true  → iterate group.children, call g.dispose() for every mesh
 *                             whose geometry does NOT have sharedGeometry=true.  This is
 *                             the correct path that prevents EdgesGeometry GPU accumulation.
 *
 *     disposeProxies: false (default) → skip geometry disposal entirely.  Callers that
 *                             still pass no options or { disposeProxies: false } silently
 *                             leak all EdgesGeometry objects created during EPS projection.
 *
 * Pass condition (hard ceiling = 0 violations):
 *   Every `releaseGroups(` call on a single line includes `disposeProxies: true`.
 *
 *   NOTE: multi-line releaseGroups( calls are not detected by the single-line pattern.
 *   If you split a call across lines, ensure the call is followed immediately by
 *   `disposeProxies: true` and add an inline comment `// §G1-T3`.
 *
 * Antipatterns detected (either → exit 1):
 *
 *   Pattern A — releaseGroups called without options:
 *     nme.releaseGroups(groups)
 *     nme.releaseGroups(nativeGroups)
 *
 *   Pattern B — releaseGroups called with disposeProxies: false (explicit leak):
 *     nme.releaseGroups(groups, { disposeProxies: false })
 *
 * Safe usage (NOT flagged):
 *   nme.releaseGroups(groups, { disposeProxies: true })
 *   nme.releaseGroups(nativeGroups, { disposeProxies: true })
 *
 * ─── Scope ───────────────────────────────────────────────────────────────────
 * The rg version scanned `.` with `--type ts` minus a glob list. The port names
 * the PRYZM 3 source roots explicitly instead. Verified before the port that
 * `editor/` (standalone sibling sub-project, absent from pnpm-workspace.yaml) and
 * `attached_assets/` (user uploads) contain ZERO `releaseGroups(` occurrences, so
 * this is a restatement of scope, not a narrowing to reach green. Same dir list as
 * check-three-imports.ts and check-scene-graph.ts.
 *
 * Exclusions:
 *   tools/ga-gate/check-geometry-ceiling.ts — this file (pattern literals live here)
 *   __tests__ / __fixtures__                — test stubs / mocks
 *
 * Exit: 0 = zero violations · 1 = any violation · 2 = scan misconfigured
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { scanFiles, type Match, type ScanResult } from './lib/sourceScan.js';

const REPO_ROOT = process.env.GA_GATE_REPO_ROOT ?? process.cwd();
const LABEL = 'geometry-ceiling';
const HARD_FAIL = 0;

const SCAN_DIRS = ['src', 'apps', 'packages', 'plugins', 'server', 'tools', 'scripts']
  .filter((d) => existsSync(join(REPO_ROOT, d)));

/**
 * ⚠ THE HONESTY FLOOR. ~7k TS files across those trees today; 3000 catches a
 * broken root, a bad cwd or a vanished subject directory without being tripped by
 * ordinary file movement. Below it `scanFiles` exits 2 — NOT 0, and NOT 1.
 * "Misconfigured" and "failed" are different facts; conflating them is how
 * "0 violations" once meant "walked nothing".
 */
const MIN_FILES = 3000;

/** Extensions rg's `--type ts` covered. Never narrower than the rg version. */
const EXTS = ['.ts', '.tsx', '.mts', '.cts'] as const;

function excluded(rel: string): boolean {
  if (rel === 'tools/ga-gate/check-geometry-ceiling.ts') return true;
  if (/(^|\/)__tests__\//.test(rel)) return true;
  if (/(^|\/)__fixtures__\//.test(rel)) return true;
  return false;
}

/**
 * Pattern A — releaseGroups called with a single argument (no options object).
 *
 * Matches any `.releaseGroups(` call where the only argument is a plain identifier
 * or identifier[n] and the call closes on the same line:
 *   nme.releaseGroups(groups)   nme.releaseGroups(nativeGroups)   nme.releaseGroups(groups[0])
 *
 * The leading `\.` is load-bearing: it keeps the METHOD DECLARATION in
 * packages/core-app-model/src/geometry/NativeElementMeshExporter.ts
 * (`releaseGroups(groups: THREE.Group[], opts?: …)`) out of the count.
 *
 * Does NOT match:
 *   nme.releaseGroups(groups, { disposeProxies: true })  ← has second arg
 */
const PATTERN_A = /\.releaseGroups\(\s*\w[\w.[\]]*\s*\)/;

/**
 * Pattern B — releaseGroups called with disposeProxies: false (explicit leak).
 *   nme.releaseGroups(groups, { disposeProxies: false })
 */
const PATTERN_B = /\.releaseGroups\(.*disposeProxies\s*:\s*false/;

function scan(pattern: RegExp, sub: string): ScanResult {
  return scanFiles({
    root: REPO_ROOT,
    dirs: SCAN_DIRS,
    pattern,
    minFiles: MIN_FILES,
    exclude: excluded,
    exts: EXTS,
    label: `${LABEL}/${sub}`,
  });
}

const resA = scan(PATTERN_A, 'pattern-A');
const resB = scan(PATTERN_B, 'pattern-B');
const a: readonly Match[] = resA.matches;
const b: readonly Match[] = resB.matches;

console.log(
  `[${LABEL}] files scanned: ${resA.filesScanned} (excluded ${resA.filesExcluded}) · ` +
  `floor ${MIN_FILES} · dirs: ${SCAN_DIRS.join(', ')}`,
);

const total = a.length + b.length;

if (total > HARD_FAIL) {
  console.error(`\n[${LABEL}] FAIL: ${total} releaseGroups() violation(s) — geometry leak risk.`);
  if (a.length > 0) {
    console.error(`  Pattern A (single-arg, no disposeProxies): ${a.length} match(es).`);
    for (const m of a) console.error(`      ${m.file}:${m.line}  ${m.text}`);
  }
  if (b.length > 0) {
    console.error(`  Pattern B (disposeProxies: false): ${b.length} match(es).`);
    for (const m of b) console.error(`      ${m.file}:${m.line}  ${m.text}`);
  }
  console.error(
    `\n  Fix: every releaseGroups() call MUST include { disposeProxies: true }.\n` +
    `  Read: docs/03_PRYZM3/04-PLAN-FORWARD/50-PLAN-FORWARD-GAP-ANALYSIS.md §1 (G1-T4)`,
  );
  process.exit(1);
}

console.log(`[${LABEL}] OK: 0 releaseGroups() violations (Pattern A=${a.length}, B=${b.length}).`);
