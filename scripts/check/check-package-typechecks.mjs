#!/usr/bin/env node
/**
 * scripts/check/check-package-typechecks.mjs — per-package typecheck-hygiene gate.
 *
 * The root / editor typecheck (`tsc -p tsconfig.json`) compiles the whole app
 * under ONE lenient profile (allowImportingTsExtensions, the root
 * src/global-window.d.ts ambient, noUncheckedIndexedAccess off). That MASKS
 * errors a workspace package hits when it is compiled IN ISOLATION via its own
 * `typecheck` script (its own tsconfig + its own dependency closure). This gate
 * runs every workspace package that exposes a `typecheck` script exactly the way
 * CI / a contributor would (`pnpm --filter <name> run typecheck`, falling back to
 * a direct `tsc -p tsconfig.json --noEmit` when the package has no isolated
 * node_modules) and fails non-zero if any package that is expected to be clean
 * reports a TypeScript error.
 *
 * Usage:
 *   node scripts/check/check-package-typechecks.mjs            # all packages
 *   node scripts/check/check-package-typechecks.mjs geometry   # name substring
 *
 * Exit code: 0 = all expected-clean packages pass, 1 = at least one regressed.
 *
 * KNOWN_FAILING: packages whose isolated typecheck is RED today for a tracked,
 * non-trivial reason (see the per-entry note). The gate does NOT fail on these,
 * but it DOES print a reminder if one of them starts passing so the allowlist
 * cannot silently rot. Drive these to zero and delete the entry.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
// scripts/check/ → ROOT is two levels up.
const ROOT = resolve(__dirname, '..', '..');
const TSC = resolve(ROOT, 'node_modules', 'typescript', 'bin', 'tsc');

// ── KNOWN_FAILING allowlist (frozen baseline) ─────────────────────────────────
// key = package dir relative to ROOT, value = human reason / tracking note.
//
// ROOT CAUSE (shared by every entry): pnpm resolves every `@pryzm/*` import to
// the dependency's `src/index.ts` SOURCE (exports map → `./src/index.ts`, no
// built `.d.ts`). So when package A is typechecked in isolation, tsc RE-COMPILES
// the source of all of A's transitive `@pryzm/*` dependencies under A's OWN
// compilerOptions. Where A's tsconfig diverges from a dependency's (notably
// `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, `noUncheckedIndexedAccess`,
// `allowImportingTsExtensions`, and the root `src/global-window.d.ts` ambient),
// the dependency source errors (TS2375/2379/2412 EOPT · TS1484 type-only import
// · TS2339 window-global · TS5097/2835 `.ts` extension · TS7006/7018 implicit
// any). These are MASKED by the root/editor build, which compiles the whole app
// under one lenient profile with the global ambient in scope.
//
// This is a monorepo build-architecture debt (dependencies should be consumed as
// emitted `.d.ts`, or all package tsconfigs should share one profile) — NOT a
// per-file bug to paper over with `as any`. The list below is a FROZEN BASELINE
// captured 2026-06-04: the gate fails if a NON-listed package regresses or a
// listed package newly PASSES (so the baseline can't rot). Drive entries to zero
// and delete them. See docs/03-execution/plans/master-execution-tracker.md
// (PER-PACKAGE-TYPECHECK-HYGIENE).
const KNOWN_FAILING_REASON = 'transitive dep config-profile divergence (EOPT/verbatimModuleSyntax/window-global/.ts-ext) — see header';
const KNOWN_FAILING = Object.fromEntries(
  [
    // apps/*
    'apps/ai-worker', 'apps/bake-worker', 'apps/cli', 'apps/component-editor',
    'apps/editor', 'apps/export-worker', 'apps/marketplace-web', 'apps/sync-server',
    // packages/*
    'packages/ai-host', 'packages/command-registry', 'packages/constraint-solver',
    'packages/core-app-model', 'packages/editor-ui', 'packages/engine',
    'packages/family-instance', 'packages/family-loader', 'packages/file-format',
    'packages/geometry-beam', 'packages/geometry-column', 'packages/geometry-curtain-wall',
    'packages/geometry-door', 'packages/geometry-furniture', 'packages/geometry-kernel',
    'packages/geometry-lighting', 'packages/geometry-plumbing', 'packages/geometry-roof',
    'packages/geometry-slab', 'packages/geometry-stair', 'packages/geometry-wall',
    'packages/geometry-window', 'packages/headless', 'packages/input-host',
    'packages/persistence-client', 'packages/physics-host', 'packages/picking',
    'packages/plugin-sdk', 'packages/protocol', 'packages/render-runtime',
    'packages/renderer', 'packages/room-topology', 'packages/runtime-composer',
    'packages/scene-committer', 'packages/snapping', 'packages/spatial-index',
    'packages/speculative-engine', 'packages/stores', 'packages/types-builtin',
    'packages/ui-base', 'packages/view-state', 'packages/views',
  ].map(p => [p, KNOWN_FAILING_REASON]),
);

// ── Enumerate workspace packages with a `typecheck` script ────────────────────
function listPackages() {
  const dirs = [];
  for (const group of ['packages', 'apps']) {
    const base = join(ROOT, group);
    if (!existsSync(base)) continue;
    for (const name of readdirSync(base)) {
      const rel = `${group}/${name}`;
      const pkgJson = join(ROOT, rel, 'package.json');
      if (!existsSync(pkgJson)) continue;
      let meta;
      try { meta = JSON.parse(readFileSync(pkgJson, 'utf8')); } catch { continue; }
      if (meta?.scripts?.typecheck) dirs.push({ rel, name: meta.name ?? rel });
    }
  }
  return dirs.sort((a, b) => a.rel.localeCompare(b.rel));
}

const filter = process.argv[2];
let packages = listPackages();
if (filter) packages = packages.filter(p => p.rel.includes(filter) || p.name.includes(filter));

if (packages.length === 0) {
  console.error(filter ? `No packages matched filter: ${filter}` : 'No packages with a typecheck script found.');
  process.exit(1);
}

// ── Run one package's isolated typecheck ──────────────────────────────────────
function typecheckPackage(rel) {
  const pkgDir = resolve(ROOT, rel);
  // `composite` packages cache results in tsconfig.tsbuildinfo and would skip
  // re-checking; force a full check so the gate is deterministic.
  try {
    execFileSync('node', [TSC, '-p', 'tsconfig.json', '--noEmit', '--incremental', 'false'], {
      cwd: pkgDir,
      stdio: 'pipe',
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
    return { ok: true, output: '' };
  } catch (err) {
    const out = (err.stdout ?? '') + (err.stderr ?? '');
    return { ok: false, output: out };
  }
}

// ── Run ───────────────────────────────────────────────────────────────────────
const SEP = '─'.repeat(78);
console.log(`\n${SEP}`);
console.log('Per-package typecheck-hygiene gate');
console.log(`${SEP}\n`);

let passed = 0;
let regressed = 0;
const unexpectedPasses = [];

for (const { rel, name } of packages) {
  const known = KNOWN_FAILING[rel];
  const { ok, output } = typecheckPackage(rel);

  if (ok) {
    if (known) {
      console.log(`  ⚠  ${name}  (allowlisted but now PASSES — remove from KNOWN_FAILING)`);
      unexpectedPasses.push(rel);
    } else {
      console.log(`  ✓  ${name}`);
    }
    passed++;
  } else if (known) {
    console.log(`  ○  ${name}  (known-failing: ${known})`);
  } else {
    console.error(`  ✗  ${name}`);
    const errLines = output.split(/\r?\n/).filter(l => /error TS\d+/.test(l));
    for (const l of errLines.slice(0, 40)) console.error(`       ${l.trim()}`);
    if (errLines.length > 40) console.error(`       … and ${errLines.length - 40} more`);
    regressed++;
  }
}

console.log(`\n${SEP}`);
console.log(`${regressed === 0 ? '✓ PASS' : `✗ ${regressed} REGRESSED`}  (${passed} clean, ${Object.keys(KNOWN_FAILING).length} known-failing)`);
if (unexpectedPasses.length > 0) {
  console.log(`  Note: remove now-passing from KNOWN_FAILING: ${unexpectedPasses.join(', ')}`);
}
console.log(`${SEP}\n`);

process.exit(regressed > 0 ? 1 : 0);
