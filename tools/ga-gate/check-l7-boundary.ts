#!/usr/bin/env tsx
/**
 * PR 4.B.3 — L7 plugin boundary violation tripwire.
 *
 * Spec: docs/03_PRYZM3/04-PLAN-FORWARD/08-WAVE-4-SLOT-TYPING-ROUTING.md §3 PR 4.B.3
 * Anchor: docs/03_PRYZM3/02-ARCHITECTURE.md §3 (L7 boundary rule — plugins must
 *         use @pryzm/plugin-sdk, not L0–L5 internals directly).
 *         docs/03_PRYZM3/04-PLAN-FORWARD/10-WAVE-6-CONVERGENCE.md §2
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
 */
import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const BASELINE_FILE = resolve(REPO_ROOT, '.ga-gate', 'baselines', 'l7-boundary-violations.json');

// L0–L5 packages that plugins must NOT import directly.
// Sync with packages/eslint-plugin-pryzm/src/rules/no-l7-boundary-violation.js BLOCKED_PKGS.
const BLOCKED_PATTERN = [
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
].join('|');

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
 * Return per-plugin count of TypeScript source files (in plugins/<name>/src/) that
 * contain at least one ACTUAL static import (not `import type`, not a comment line)
 * of an L0–L5 @pryzm/* package.
 *
 * Uses content-mode rg (no -l), then filters each matched line in TypeScript to
 * exclude comment lines that merely mention the package name in documentation.
 */
function countViolations(): Record<string, number> {
  let out: string;
  try {
    // Content mode (no -l): one line per match, format "FILE:CONTENT"
    out = execSync(
      `rg '(${BLOCKED_PATTERN})' plugins/ --type ts ` +
        `-g '!**/__tests__/**' -g '!**/*.test.*' -g '!**/*.spec.*' ` +
        `-g '!node_modules' -g '!dist' ` +
        `--no-heading`,
      { encoding: 'utf8', cwd: REPO_ROOT },
    );
  } catch (err: unknown) {
    const e = err as { status?: number; stdout?: string };
    if (e.status === 1) return {};   // rg exits 1 when no matches found
    throw err;
  }

  // Deduplicate: track FILES that have at least one real import violation.
  // A "real" violation is a non-comment line that begins an actual static import
  // (not `import type`) or a value re-export (`export ... from '...'`).
  const violatingFiles = new Set<string>();

  for (const line of out.trim().split('\n')) {
    if (!line) continue;
    // rg without -l: "plugins/foo/src/bar.ts:  import { X } from '@pryzm/…'"
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const filePath = line.slice(0, colonIdx);
    const content = line.slice(colonIdx + 1).trimStart();

    // ── Skip comment lines ────────────────────────────────────────────────────
    // These are false positives: the author mentions a blocked package in JSDoc
    // precisely to explain WHY they are NOT importing it directly.
    if (
      content.startsWith('//') ||   // single-line comment
      content.startsWith('*') ||    // JSDoc / block-comment body
      content.startsWith('/*') ||   // block-comment open
      content.startsWith('#')       // shebang (safety)
    ) continue;

    // ── Only count actual static import/export-from statements ────────────────
    // Exempt: `import type …` — type-erased at runtime, not a real boundary cross.
    // Include: `import { X } from`, `import * as X from`, `export { X } from`,
    //          `export * from` (re-exporting L0–L5 is also a violation).
    const isRealViolation =
      /^import\s+(?!type[\s{])/.test(content) ||
      /^export\s+(?!type[\s{]).*\bfrom\s+['"]/.test(content);

    if (!isRealViolation) continue;

    violatingFiles.add(filePath);
  }

  const counts: Record<string, number> = {};
  for (const filePath of violatingFiles) {
    const m = filePath.match(/^plugins\/([^/]+)\//);
    if (!m) continue;
    const plugin = m[1];
    counts[plugin] = (counts[plugin] ?? 0) + 1;
  }
  return counts;
}

function main(): number {
  const baseline = loadBaseline();
  const actual = countViolations();

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
    console.error(`  Read: docs/03_PRYZM3/04-PLAN-FORWARD/08-WAVE-4-SLOT-TYPING-ROUTING.md §3`);
    console.error(regressions.join('\n'));
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
