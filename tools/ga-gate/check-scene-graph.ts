#!/usr/bin/env tsx
/**
 * G2-T2 — NME proxy-in-scene tripwire.
 *
 * Spec:   docs/03_PRYZM3/04-PLAN-FORWARD/50-PLAN-FORWARD-GAP-ANALYSIS.md §2 (G2-T2)
 * Anchor: docs/03_PRYZM3/04-PLAN-FORWARD/50-PLAN-FORWARD-GAP-ANALYSIS.md N2
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
 * exit 1 — indistinguishable, to a reader of exit codes alone, from "found a real
 * violation". And because the gate was ALSO carried on `gate-debt.json`, that
 * permanent red was absorbed as "known debt" while the gate measured nothing at
 * all. MISSING PREREQUISITE and CLEAN CODE produced the same observable state:
 * the §CONTEXT-DATA-HONESTY failure applied to CI itself.
 *
 * Rewritten on `lib/sourceScan.ts` (Node only, zero external binaries). See that
 * file for why the fix is Node-native rather than "install ripgrep in CI".
 *
 * ─── What the gate asserts ───────────────────────────────────────────────────
 * Hard-fail if any TypeScript source file adds an NME proxy group or proxy mesh
 * to the live THREE.js scene.  NME proxy groups — produced by
 * `NativeElementMeshExporter.exportForView()` — MUST only be consumed by
 * `EdgeProjectorService.project()` for off-screen 2D technical drawing projection.
 * Passing them to `scene.add()` (or any equivalent) places flat slab/mullion
 * Mesh objects directly in the rendered scene, causing:
 *
 *   • 123–153 draw calls at 14 triangles each (vs. 7 instanced draw calls)
 *   • ≈4× geometry count inflation (Source B from doc 49 §2.2)
 *   • 4–8 fps navigation (vs. 45–55 fps target NFT-04)
 *
 * Antipatterns detected (either → exit 1):
 *
 *   Pattern A — nativeGroup/nativeGroups variable passed to any .add() call:
 *     world.scene.three.add(nativeGroups)
 *     scene.add(nativeGroups[0])
 *     group.add(nativeGroup)
 *
 *   Pattern B — exportForView() chained directly into .add():
 *     scene.add(nativeElementMeshExporter.exportForView(viewDef)[0])
 *
 * Safe usage (NOT flagged by this gate):
 *   edgeProjectorService.project(viewDef, models, nativeGroups, ifcSceneGroups)
 *   nativeElementMeshExporter.releaseGroups(nativeGroups, { disposeProxies: true })
 *   scene.children                  ← read-only traversal to collect IFC groups
 *
 * Hard-fail = 0.  Any match is an immediate CI blocker.
 *
 * ─── Scope ───────────────────────────────────────────────────────────────────
 * The rg version scanned `.` with `--type ts` minus a glob list. The port names
 * the PRYZM 3 source roots explicitly instead. This is NOT a narrowing to make
 * the gate green — it was verified before the port that `editor/` (a standalone
 * sibling sub-project: own turbo, own biome, own port, absent from
 * pnpm-workspace.yaml) and `attached_assets/` (user uploads) contain ZERO
 * occurrences of either pattern, exactly as the rg version's own `-g` exclusions
 * already assumed. Same dir list as check-three-imports.ts, for one definition of
 * "PRYZM 3 source" across gates.
 *
 * Exclusions:
 *   tools/ga-gate/check-scene-graph.ts — this file (the pattern literals live here)
 *   __tests__ directories              — unit-test mocks / stubs
 *   __fixtures__ directories           — lint/eslint fixtures
 *
 * Exit: 0 = zero violations · 1 = any violation · 2 = scan misconfigured
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { scanFiles, type Match, type ScanResult } from './lib/sourceScan.js';

const REPO_ROOT = process.env.GA_GATE_REPO_ROOT ?? process.cwd();
const LABEL = 'scene-graph-tripwire';
const HARD_FAIL = 0;

const SCAN_DIRS = ['src', 'apps', 'packages', 'plugins', 'server', 'tools', 'scripts']
  .filter((d) => existsSync(join(REPO_ROOT, d)));

/**
 * ⚠ THE HONESTY FLOOR. ~7k TS files across those trees today; 3000 catches a
 * broken root, a bad cwd or a vanished subject directory without being tripped by
 * ordinary file movement. Below it `scanFiles` exits 2 — NOT 0, and NOT 1. A
 * scanner that finds nothing because it looked nowhere must not be able to report
 * a pass, and "misconfigured" is a different fact from "failed".
 */
const MIN_FILES = 3000;

/** Extensions rg's `--type ts` covered. Never narrower than the rg version. */
const EXTS = ['.ts', '.tsx', '.mts', '.cts'] as const;

function excluded(rel: string): boolean {
  // This gate file — the pattern literals live in it.
  if (rel === 'tools/ga-gate/check-scene-graph.ts') return true;
  if (/(^|\/)__tests__\//.test(rel)) return true;
  if (/(^|\/)__fixtures__\//.test(rel)) return true;
  return false;
}

/**
 * Pattern A — nativeGroup(s) variable passed to .add().
 *
 * Matches any `.add(` call whose first argument token starts with `nativeGroup`:
 *   .add(nativeGroups)   .add(nativeGroups[0])   .add(nativeGroup)
 *   .add( nativeGroups   ← whitespace variants
 *
 * Does NOT match:
 *   .project(viewDef, models, nativeGroups, ...)  ← no `.add(`
 *   .releaseGroups(nativeGroups, ...)             ← no `.add(`
 */
const PATTERN_A = /\.add\(\s*nativeGroup/;

/**
 * Pattern B — exportForView() chained directly into .add().
 *
 * Matches any `.add(` call on the same line as `exportForView`:
 *   scene.add(nativeElementMeshExporter.exportForView(viewDef)[0])
 *   group.add( nmeExporter.exportForView(v) )
 *
 * Does NOT match a two-line form where the export lands in a local first.
 */
const PATTERN_B = /\.add\([^)]*exportForView/;

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

// State the subject size, not just the verdict — a gate that reports only its
// verdict cannot be distinguished from a gate that walked nothing.
console.log(
  `[${LABEL}] files scanned: ${resA.filesScanned} (excluded ${resA.filesExcluded}) · ` +
  `floor ${MIN_FILES} · dirs: ${SCAN_DIRS.join(', ')}`,
);

const total = a.length + b.length;

if (total > HARD_FAIL) {
  console.error(`\n[${LABEL}] FAIL: ${total} NME proxy-add-to-scene violation(s) detected.`);
  if (a.length > 0) {
    console.error(`  Pattern A (nativeGroup passed to .add()): ${a.length} match(es).`);
    for (const m of a) console.error(`      ${m.file}:${m.line}  ${m.text}`);
  }
  if (b.length > 0) {
    console.error(`  Pattern B (exportForView chained into .add()): ${b.length} match(es).`);
    for (const m of b) console.error(`      ${m.file}:${m.line}  ${m.text}`);
  }
  console.error(
    `\n  Fix: NME proxy groups MUST be passed to EdgeProjectorService.project()\n` +
    `       NEVER to scene.add() or any THREE.Object3D.add() call.\n` +
    `  Read: docs/03_PRYZM3/04-PLAN-FORWARD/50-PLAN-FORWARD-GAP-ANALYSIS.md §2 (N2, G2-T2)`,
  );
  process.exit(1);
}

console.log(`[${LABEL}] OK: 0 NME proxy-add-to-scene violations (Pattern A=${a.length}, B=${b.length}).`);
