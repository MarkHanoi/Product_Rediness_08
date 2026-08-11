#!/usr/bin/env tsx
/**
 * PR 4.B.3 — L7 plugin boundary violation tripwire.
 *
 * Spec: docs/archive/pryzm3-internal/04-PLAN-FORWARD/archive/08-WAVE-4-SLOT-TYPING-ROUTING.md §3 PR 4.B.3
 * Anchor: docs/01-strategy/STR-04-architecture.md (L7 boundary rule — plugins must
 *         use @pryzm/plugin-sdk, not L0–L5 internals directly).
 *         docs/archive/pryzm3-internal/04-PLAN-FORWARD/archive/10-WAVE-6-CONVERGENCE.md §2
 *         (each plugin's migration to plugin-sdk unlocks its slot-typed Phase B binding)
 *
 * Hard-fail if ANY plugin's L0–L5 import file count GROWS beyond its baseline.
 * Soft-warn for any plugin that is not yet at 0 (still has violations).
 * Pass (OK) only when every plugin reaches 0 violations (Phase F target).
 *
 * Scope: plugins/<name>/src/**  excluding __tests__, *.test.*, *.spec.*
 * Detects: static imports of L0–L5 @pryzm/* packages (see BLOCKED pattern below).
 * Exempt: `import type` declarations (type-erased at runtime, not a real boundary cross).
 * Exempt: comment lines (// … * … /* …) — package name appears in JSDoc only.
 *
 * Baseline: .ga-gate/baselines/l7-boundary-violations.json
 *
 * Fix 2026-05-14: countViolations() now filters comment lines before classifying a
 * file as violating. The prior -l (file-list) rg mode matched package names anywhere
 * in a file — including JSDoc explanations of WHY the direct import is avoided — which
 * inflated the violation count with false positives. Only lines that begin with a real
 * `import` (not `import type`) or `export … from` statement are now counted.
 *
 * ─── §FIX-GATE-NEEDS-RIPGREP (L-811), 2026-08-11 ─────────────────────────────
 * ⚠ THIS GATE WAS REPORTING A PASS WHILE MEASURING NOTHING — sometimes.
 *
 * `countViolations()` shelled out to `rg … plugins/ --type ts`. Ripgrep is not a
 * declared dependency and is absent from a stock Windows box. Measured BEFORE this
 * port on the founder's Windows 11 machine:
 *
 *     'rg' is not recognized as an internal or external command
 *     Error: Command failed … status: 255            → the gate CRASHED, exit 1
 *
 * That crash was the LUCKY outcome, and it was luck. The catch block reads
 * `if (e.status === 1) return {}` — rg's "no matches" convention — and `{}` means
 * "zero violations in every plugin", which walks straight through `main()` to
 * `[l7-boundary] OK: 0 violations — all plugins have migrated to @pryzm/plugin-sdk`.
 * A shell that reports a missing binary as status 1 (POSIX `sh` does exactly this,
 * with status 127; some wrappers normalise to 1) would have printed that sentence —
 * the strongest possible all-clear — from a scan that read no files at all.
 *
 * Rewritten on `lib/sourceScan.ts` (Node only, zero external binaries), with a
 * `minFiles` honesty floor so "walked nothing" now exits 2, never 0.
 *
 * ─── Comment stripping ───────────────────────────────────────────────────────
 * The 2026-05-14 fix approximated comment removal with four `startsWith` tests
 * (`//`, `*`, `/*`, `#`). That misses a trailing comment after code and misses any
 * block comment whose body lines are not star-prefixed. The port uses the repo's
 * real comment lexer via `scanFilesStripped`, which is what those four tests were
 * reaching for. Measured 2026-08-11: 139 blocked-package mentions on raw lines,
 * 103 once comments are removed — 36 lines were pure documentation.
 *
 * ─── Known, PRE-EXISTING under-count — carried forward deliberately ──────────
 * Both the rg version and this port classify a violation by testing the SINGLE line
 * that mentions the package. A multi-line import —
 *
 *     import {
 *       Foo,
 *     } from '@pryzm/stores';
 *
 * — has its package name on a line beginning `} from`, which matches neither the
 * `^import` nor the `^export … from` test, so it is NOT counted. This port does not
 * fix that: doing so would CHANGE the number the per-plugin baseline was captured
 * against, which is a founder decision, not a silent edit inside a port. It is
 * recorded here so the gate's reading is understood as a floor, not a total.
 *
 * ─── Scope: RESTATED, NOT NARROWED ───────────────────────────────────────────
 * rg scanned `plugins/` with `--type ts` minus __tests__, *.test.*, *.spec.*,
 * node_modules and dist. The port walks the same single `plugins` directory with
 * the same four extensions rg's `ts` type covers, reproduces the three test-file
 * exclusions in `excluded()`, and skips node_modules/dist via DEFAULT_SKIP_DIRS.
 *
 * Exit: 0 = no plugin grew · 1 = any plugin grew · 2 = baseline missing or scan
 *       misconfigured (these are different facts from a violation and from each other)
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanFilesStripped, distinctLines, type Match } from './lib/sourceScan.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Default is unchanged (this file's location, two levels up). The env override is
// added so this gate can be pointed at a scratch root and its honesty floor
// exercised, exactly like every other gate in tools/ga-gate/.
const REPO_ROOT = process.env.GA_GATE_REPO_ROOT ?? resolve(__dirname, '..', '..');
const BASELINE_FILE = resolve(REPO_ROOT, '.ga-gate', 'baselines', 'l7-boundary-violations.json');

// L0–L5 packages that plugins must NOT import directly.
// Sync with packages/eslint-plugin-pryzm/src/rules/no-l7-boundary-violation.js BLOCKED_PKGS.
const BLOCKED_PACKAGES = [
  '@pryzm/runtime-composer',
  '@pryzm/command-bus',
  '@pryzm/event-bus',
  '@pryzm/frame-scheduler',
  '@pryzm/renderer',
  '@pryzm/renderer-three',
  '@pryzm/scene-committer',
  '@pryzm/sync-client',
  '@pryzm/visibility',
  '@pryzm/persistence-client',
  '@pryzm/input-host',
  '@pryzm/physics-host',
  '@pryzm/picking',
  '@pryzm/render-runtime',
  '@pryzm/runtime-undo-stack',
  '@pryzm/view-state',
  '@pryzm/stores',
];

/** The extensions rg's `--type ts` covered. Never narrower than the rg version. */
const EXTS = ['.ts', '.tsx', '.mts', '.cts'] as const;

/**
 * ⚠ THE HONESTY FLOOR. `plugins/` holds 957 TS files, 780 of them outside the test
 * exclusions. 500 catches a bad cwd, a broken REPO_ROOT or a vanished plugins tree
 * without tripping on ordinary churn. Below it `scanFilesStripped` exits 2 — NOT 0
 * and NOT 1. This floor is the whole point of the port: 0 violations is this gate's
 * loudest all-clear, and it must never again be reachable by looking nowhere.
 */
const MIN_FILES = 500;

/** One alternation over the blocked package names, matched per line. */
const BLOCKED_RE = new RegExp(
  '(' + BLOCKED_PACKAGES.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')',
);

/** Reproduces rg's three test-file exclusions exactly. */
function excluded(rel: string): boolean {
  if (/(^|\/)__tests__\//.test(rel)) return true;
  if (/\.test\./.test(rel)) return true;
  if (/\.spec\./.test(rel)) return true;
  return false;
}

interface Baseline {
  perPlugin: Record<string, number>;
  totalFiles: number;
}

function loadBaseline(): Baseline {
  if (!existsSync(BASELINE_FILE)) {
    console.error(`[l7-boundary] FATAL: baseline file missing — ${BASELINE_FILE}`);
    console.error('  Run tools/ga-gate/check-l7-boundary.ts --update-baseline to create it.');
    process.exit(2);
  }
  return JSON.parse(readFileSync(BASELINE_FILE, 'utf8')) as Baseline;
}

/**
 * Return per-plugin count of TypeScript source files (under plugins/) that contain
 * at least one ACTUAL static import — not `import type`, not a comment — of an
 * L0–L5 @pryzm/* package.
 *
 * `import type` stays exempt: it is type-erased at runtime and crosses no real
 * boundary. Value re-exports (`export … from`) ARE counted — re-exporting an L0–L5
 * package through a plugin is the same breach wearing a different hat.
 */
function countViolations(): { counts: Record<string, number>; scanned: number; sites: Match[] } {
  const res = scanFilesStripped({
    root: REPO_ROOT,
    dirs: ['plugins'],
    pattern: BLOCKED_RE,
    minFiles: MIN_FILES,
    exclude: excluded,
    exts: EXTS,
    label: 'l7-boundary',
  });

  const violatingFiles = new Set<string>();
  const sites: Match[] = [];

  for (const m of distinctLines(res.matches)) {
    const content = m.text.trimStart();

    // Only count real static import / value-re-export statements.
    const isRealViolation =
      /^import\s+(?!type[\s{])/.test(content) ||
      /^export\s+(?!type[\s{]).*\bfrom\s+['"]/.test(content);

    if (!isRealViolation) continue;
    violatingFiles.add(m.file);
    sites.push(m);
  }

  const counts: Record<string, number> = {};
  for (const filePath of violatingFiles) {
    const m = filePath.match(/^plugins\/([^/]+)\//);
    if (!m) continue;
    const plugin = m[1]!;
    counts[plugin] = (counts[plugin] ?? 0) + 1;
  }
  return { counts, scanned: res.filesScanned, sites };
}

function main(): number {
  const baseline = loadBaseline();
  const { counts: actual, scanned, sites } = countViolations();

  // State the subject size, not just the verdict — a gate that reports only its
  // verdict cannot be distinguished from a gate that walked nothing.
  console.log(
    `[l7-boundary] files scanned: ${scanned} (floor ${MIN_FILES}) · dir: plugins · ` +
    `comments stripped · ${sites.length} violating import line(s) in ` +
    `${Object.values(actual).reduce((a, b) => a + b, 0)} file(s)`,
  );

  const regressions: string[] = [];
  const improvements: string[] = [];

  for (const [plugin, actualCount] of Object.entries(actual)) {
    const baselineCount = baseline.perPlugin[plugin] ?? 0;
    if (actualCount > baselineCount) {
      regressions.push(
        `  ${plugin}: ${actualCount} files (baseline ${baselineCount}) — REGRESSION +${actualCount - baselineCount}`,
      );
    }
  }

  for (const [plugin, baselineCount] of Object.entries(baseline.perPlugin)) {
    const actualCount = actual[plugin] ?? 0;
    if (actualCount < baselineCount) {
      improvements.push(
        `  ${plugin}: ${actualCount} files (baseline ${baselineCount}) — improved by ${baselineCount - actualCount}`,
      );
    }
  }

  if (regressions.length > 0) {
    console.error(`[l7-boundary] FAIL: ${regressions.length} plugin(s) grew their violation count.`);
    console.error(`  Violations must only DECREASE as plugins migrate to @pryzm/plugin-sdk.`);
    console.error(`  Read: docs/archive/pryzm3-internal/04-PLAN-FORWARD/archive/08-WAVE-4-SLOT-TYPING-ROUTING.md §3`);
    console.error(regressions.join('\n'));
    // Name the actual import lines. The rg version printed counts only, plus an rg
    // command to re-run — useless on a machine without rg.
    const regressed = new Set(regressions.map((r) => r.trim().split(':')[0]!));
    for (const m of sites) {
      const plugin = m.file.match(/^plugins\/([^/]+)\//)?.[1];
      if (plugin && regressed.has(plugin)) {
        console.error(`      ${m.file}:${m.line}  ${m.text.slice(0, 120)}`);
      }
    }
    return 1;
  }

  if (improvements.length > 0) {
    console.log(`[l7-boundary] NOTE: ${improvements.length} plugin(s) improved since baseline:`);
    console.log(improvements.join('\n'));
  }

  const remaining = Object.values(actual).reduce((a, b) => a + b, 0);
  const violatingPlugins = Object.keys(actual).length;
  // Compute the true baseline ceiling from the per-plugin map (not the stale totalFiles field).
  const baselineCeiling = Object.values(baseline.perPlugin).reduce((a, b) => a + b, 0);

  if (remaining === 0) {
    console.log(`[l7-boundary] OK: 0 violations — all plugins have migrated to @pryzm/plugin-sdk.`);
    return 0;
  }

  // Still violations, but not growing — soft state.
  console.log(
    `[l7-boundary] WARN: ${remaining} file(s) across ${violatingPlugins} plugin(s) ` +
      `still import L0–L5 packages directly. ` +
      `Baseline ceiling: ${baselineCeiling} files. No regressions — ratchet holding.`,
  );
  return 0;
}

process.exit(main());
