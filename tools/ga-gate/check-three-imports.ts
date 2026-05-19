#!/usr/bin/env tsx
/**
 * Wave A15 P2 — `packages/renderer-three/` sole THREE importer tripwire.
 *
 * Spec:   docs/03_PRYZM3/00-PROCESS-TRACKER.md §1 metrics #12 / #12a / #12b
 * Anchor: docs/03_PRYZM3/04-PLAN-FORWARD/11-WAVE-7-CLEANUP-PHASE-F.md §11
 *
 * Hard-fail if any TypeScript file outside `packages/renderer-three/` contains
 * a direct import from the `three` package OR any of its sub-paths:
 *
 *   import … from 'three'               ← bare (Wave 8 codemod cleaned these)
 *   import … from 'three/tsl'           ← Class A2 (Wave A15 S119 closed)
 *   import … from 'three/examples/…'    ← Class A1 (Wave A15 S119–S120 closed)
 *
 * NOT matched (intentional — these are P2-compliant paths through the owner):
 *   import … from '@pryzm/renderer-three'        ← canonical barrel
 *   import … from '@pryzm/renderer-three/three'  ← THREE namespace sub-path
 *   export * from 'three'                         ← re-export in three-re-export.ts
 *   export { X } from 'three/examples/…'          ← addon re-exports in addons/
 *
 * ALLOWLISTED files (intentional violations — ESLint rule fixtures):
 *   packages/eslint-plugin-pryzm/__tests__/lint-fixtures/three-outside-committer.bad.ts
 *   packages/eslint-plugin-pryzm/__tests__/lint-fixtures/three-in-kernel.bad.ts
 *   packages/geometry-kernel/__fixtures__/three-import.bad.ts
 *   attached_assets/**                             ← snapshots, not live code
 *
 * Pattern: `^\s*import\b.*from ['"]three(?:/[^'"]+)?['"]`
 *   – Anchored at line start — will NOT match:
 *       JSDoc comment lines   (start with " * import …")
 *       string literals        (the line does not start with import)
 *       export re-exports      (export * from 'three')
 *       dynamic imports        (await import('three'))
 *       @pryzm/ scoped paths   (start with '@pryzm/…' not 'three')
 *   – Matches bare `three`, `three/tsl`, `three/examples/jsm/…`, etc.
 *
 * Uses execFileSync (no shell) to avoid quoting issues with the ['"] char class.
 *
 * Hard-fail = 0.  Any regression immediately breaks CI.
 */
import { execFileSync } from 'node:child_process';

const HARD_FAIL = 0;

function countViolatingLines(): number {
  let out: string;
  try {
    out = execFileSync(
      'rg',
      [
        // Wave A15: widened pattern now catches bare 'three' AND sub-paths
        // 'three/tsl', 'three/examples/jsm/…', etc.
        String.raw`^\s*import\b.*from ['"]three(?:/[^'"]+)?['"]`,
        '.',
        '--type', 'ts',
        '-g', '!node_modules',
        '-g', '!dist',
        '-g', '!build',
        '-g', '!.next',
        '-g', '!editor/**',
        '-g', '!attached_assets/**',
        // Exclude the sole legitimate importer (the re-export barrel + addon wrappers)
        '-g', '!packages/renderer-three/**',
        // Exclude intentional ESLint rule violation fixtures
        '-g', '!**/__fixtures__/**',
        '-g', '!**/__tests__/lint-fixtures/**',
        // Exclude this gate file (the pattern literal lives here)
        '-g', '!tools/ga-gate/check-three-imports.ts',
      ],
      { encoding: 'utf8' },
    );
  } catch (err: unknown) {
    // rg exits with code 1 when it finds no matches — that is the desired state
    const e = err as { status?: number };
    if (e.status === 1) return 0;
    throw err;
  }
  return out.trim().split('\n').filter(Boolean).length;
}

function main(): number {
  const n = countViolatingLines();

  if (n > HARD_FAIL) {
    console.error(
      `[three-import-tripwire] FAIL: ${n} import line(s) outside packages/renderer-three/ ` +
        `directly import from 'three' or a three sub-path.`,
    );
    console.error(
      `  All THREE consumers must use '@pryzm/renderer-three' (barrel) or`,
    );
    console.error(
      `  '@pryzm/renderer-three/three' (THREE namespace) — never from 'three/*' directly.`,
    );
    console.error(
      `  Find them with: rg "^\\s*import\\b.*from .three(?:/[^'\"]+)?." . --type ts ` +
        `-g '!node_modules' -g '!dist' -g '!packages/renderer-three/**' ` +
        `-g '!**/__fixtures__/**' -g '!**/__tests__/lint-fixtures/**'`,
    );
    console.error(
      `  Read: docs/03_PRYZM3/04-PLAN-FORWARD/11-WAVE-7-CLEANUP-PHASE-F.md §11`,
    );
    return 1;
  }

  console.log(
    `[three-import-tripwire] OK: 0 direct 'three' or 'three/*' importers outside packages/renderer-three/.`,
  );
  return 0;
}

process.exit(main());
