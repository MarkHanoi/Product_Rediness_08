#!/usr/bin/env tsx
/**
 * @file tools/ga-gate/check-otel-spans.ts
 *
 * GA gate — P8 OpenTelemetry span coverage (C10 §2, STR-03 §2 P8).
 *
 * CONTRACT (C10 §2): "Every new exported function MUST add ≥ 1 OpenTelemetry
 * span. This is a merge blocker." STR-03 §2 states the same rule as P8.
 * For CommandBus handlers this means each handler file MUST call
 * `withHandlerSpan()` (or `withAsyncHandlerSpan()`) from @pryzm/plugin-sdk.
 * Direct `@opentelemetry/api` imports in handler files are FORBIDDEN per
 * ADR-002 §2 (L7 boundary).
 *
 * ───────────────────────────────────────────────────────────────────────────
 * §FIX-P8-ENFORCEMENT-BLIND (W3-2, 2026-08-11) — what this gate used to be
 * ───────────────────────────────────────────────────────────────────────────
 * Until 2026-08-11 this gate PRINTED A PASS while enforcing almost nothing.
 * It had two independent blindnesses, and both were demonstrated by executed
 * negative test, not by reading:
 *
 *  1. DISCOVERY was `plugins/*&#47;src/handlers/` ONLY, non-recursive.
 *     `packages/command-registry/**` (309 files) and EVERY app were never
 *     opened. P8 says "every exported function"; the gate looked at one
 *     directory family.
 *
 *  2. The load-bearing condition was `instrumented < HARD_FLOOR` — an ABSOLUTE
 *     FLOOR, never a ratio. On 2026-08-11 instrumented = total = 255 against a
 *     floor of 213, so the gate had 42 files of slack. NEGATIVE TEST: one
 *     synthetic uninstrumented exported handler was added to
 *     `plugins/beam/src/handlers/`. The gate printed:
 *
 *         [otel-spans] 255 / 256 handler files have OTel spans.
 *         [otel-spans] OK: 255 ≥ HARD_FLOOR(213). ✅   EXIT:0
 *
 *     It PRINTED the violation in its own headline number and still exited 0.
 *     A PR adding fifty uninstrumented handlers merged green.
 *
 * The load-bearing condition is now `uncovered.length === 0` for Zone A. The
 * absolute floor survives only as a WEAKER SECOND assertion (below).
 *
 * ───────────────────────────────────────────────────────────────────────────
 * The three zones, and why the honest scope is not one number
 * ───────────────────────────────────────────────────────────────────────────
 * ZONE A — CommandBus handler files (`plugins/*&#47;src/handlers/**`, recursive,
 *   excluding barrels and marker-exempt files). ZERO TOLERANCE, hard fail.
 *   This family is at 100% today, so it can be gated at zero with no debt.
 *
 * ZONE B — the families discovery never reached: `packages/command-registry/`,
 *   `apps/*&#47;src/**&#47;handlers/`, and the plugin handler `index.ts` registration
 *   barrels. These are NOT clean. They are gated by a NAMED, SHRINK-ONLY
 *   BASELINE (`ZONE_B_BASELINE` below) — not a count. A count-based ceiling
 *   would let a PR instrument one file and un-instrument another and stay
 *   level; a named list cannot. Any file with an exported function that is NOT
 *   on the list and has no span FAILS. Any listed file that acquires a span
 *   MUST be removed from the list in the same PR — the gate fails until it is.
 *   The list may only ever get shorter.
 *
 * ZONE C — the repo-wide census, PRINTED, NOT GATED. See §CENSUS below.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * §CENSUS — the number nobody had measured (2026-08-11)
 * ───────────────────────────────────────────────────────────────────────────
 * Under the LITERAL contract scope — every exported function in
 * packages|plugins|apps — the measured state on 2026-08-11 was:
 *
 *     4,592 source files read (excluding __tests__/__mocks__ and *.test/spec/d.ts)
 *     1,878 of them declare ≥ 1 exported function
 *     4,669 exported-function declarations in total
 *     1,641 of those 1,878 files contain NO span call whatsoever
 *
 * That is ~87% of the literal contract subject, uninstrumented. (The figure is
 * recomputed live on every run — it is printed, never trusted from this comment.)
 * It is not
 * debt this gate can ratchet down; it is a programme of work, and pretending
 * otherwise by gating it would make the gate permanently red and therefore
 * permanently ignored — the failure mode that produced the blind floor above.
 * So it is PRINTED on every run, never hidden, and never counted as a pass.
 *
 * Two contract facts belong in the same breath, for whoever schedules that work:
 *   - C10 §2.3 names `scripts/ci-check-spans.ts` as the enforcement. THAT FILE
 *     DOES NOT EXIST. The real gate is this file.
 *   - C10 §2.3 describes a DIFF-based check ("diffs the changed files for new
 *     `export` declarations"). This gate is CENSUS-based. A diff-based check is
 *     the only mechanism that can enforce the literal rule ("every NEW exported
 *     function") without demanding retroactive instrumentation of 1,610 files.
 *     Until such a check exists, Zones A+B are what is actually enforced.
 *
 * Verification:
 *   pnpm tsx tools/ga-gate/check-otel-spans.ts
 *   pnpm tsx tools/ga-gate/check-otel-spans.ts --print-baseline   (regenerate Zone B)
 *
 *   Exit 0 → all clear.
 *   Exit 1 → violation (a file that must have a span does not).
 *   Exit 2 → MISCONFIGURED: the scan read fewer files than its honesty floor.
 *            Never absorbable as declared debt.
 */

import { existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanFileCoverage, walk, relPath } from './lib/sourceScan.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dir, '..', '..');

const PRINT_BASELINE = process.argv.includes('--print-baseline');

// ── Patterns ──────────────────────────────────────────────────────────────────

/** A file is instrumented when it CALLS a span helper (not merely imports one). */
const SPAN_CALL_RE =
  /withHandlerSpan\s*\(|withAsyncHandlerSpan\s*\(|startActiveSpan\s*\(|startSpan\s*\(/;

/** Top-level exported function or exported arrow-function const. */
const EXPORTED_FN_RE =
  /^\s*export\s+(?:default\s+)?(?:async\s+)?function\s+\w+|^\s*export\s+(?:const|let)\s+\w+\s*(?::[^=]+)?=\s*(?:async\s*)?(?:\([^)]*\)|\w+)\s*(?::[^=]*)?=>/m;

const TEST_FILE_RE = /\.(test|spec|mock|d)\.tsx?$/;

/**
 * A documented, in-source exemption. Kept from the original gate. Files carrying
 * it are excluded from Zone A but are PRINTED on every run — an exemption that
 * nobody can see is indistinguishable from a blind spot.
 */
const GATE_EXCLUDE_MARKER = '@command-gate: not-a-command-bus-handler';

// ── Honesty floors (MISCONFIGURATION detectors, NOT coverage targets) ─────────
//
// These answer "did the walk reach a real tree?", never "is the code clean?".
// NEVER raise one to make this gate green. Raising a floor to silence a failure
// is the exact move that made the old HARD_FLOOR meaningless.
const ZONE_A_MIN_FILES = 200;   // 293 files walked on 2026-08-11
const ZONE_B_MIN_FILES = 250;   // 320 files walked on 2026-08-11
const ZONE_C_MIN_FILES = 3000;  // 4,495 files walked on 2026-08-11

// ── The weaker second assertion ───────────────────────────────────────────────
//
// Retained from the pre-2026-08-11 gate, DEMOTED. It no longer decides anything
// on its own: `uncovered.length === 0` is the load-bearing test. This survives
// only to catch the other direction — a scan that finds a suspiciously small
// clean set. A file family that shrank from 255 instrumented handlers to 40 is
// not "clean", it is a broken glob. Compare with ZONE_A_MIN_FILES, which guards
// files READ; this guards files INSTRUMENTED.
const HARD_FLOOR = 213;

// ── Zone A — CommandBus handler files. ZERO TOLERANCE. ───────────────────────

function pluginHandlerDirs(): string[] {
  const pluginsDir = join(REPO_ROOT, 'plugins');
  if (!existsSync(pluginsDir)) return [];
  return readdirSync(pluginsDir)
    .map((p) => join('plugins', p, 'src', 'handlers'))
    .filter((d) => existsSync(join(REPO_ROOT, d)));
}

const handlerDirs = pluginHandlerDirs();
const markerExempt: string[] = [];

const zoneA = scanFileCoverage({
  root: REPO_ROOT,
  dirs: handlerDirs,
  require: SPAN_CALL_RE,
  minFiles: ZONE_A_MIN_FILES,
  exts: ['.ts'],
  label: 'otel-spans/zone-A',
  participates: (rel, src) => {
    if (rel.endsWith('/index.ts')) return false;          // barrel → Zone B
    if (TEST_FILE_RE.test(rel)) return false;
    if (src.slice(0, 600).includes(GATE_EXCLUDE_MARKER)) { markerExempt.push(rel); return false; }
    return true;
  },
});

// ── Zone B — the families discovery never reached. SHRINK-ONLY BASELINE. ─────
//
// §RATCHET-P8-ZONE-B — dated justification, 2026-08-11.
//
// Widening discovery to `packages/command-registry/**`, the app handler
// directories, and the plugin handler registration barrels surfaced 53 files
// that declare an exported function and contain no span. They were never
// hidden deliberately — the gate simply never opened those directories, and the
// absolute floor meant nobody would have noticed if it had.
//
// They are recorded here, BY NAME, rather than fixed in this pass because
// instrumenting them is a code change to 53 files across three ownership
// boundaries and this task owns only the gate. A named baseline is a debt with
// a name, not permission: the list may only ever get SHORTER. The gate fails if
// a file on it acquires a span and is not removed, and fails if a new
// uninstrumented exported function appears anywhere in the zone.
//
// Composition of the 53:
//   36 — plugin `src/handlers/index.ts` registration barrels (`registerXHandlers`).
//        Open question for the contract owner: a registration barrel arguably
//        performs no operation worth a span. If C10 agrees, they become a
//        documented exemption rather than debt — but that is a CONTRACT
//        decision, and until it is made they are counted, not assumed away.
//   15 — packages/command-registry/** helpers and command utilities.
//    2 — apps/sync-server/src/handlers/** — event append/load, the two places
//        where a missing span actually costs an operator a trace.
//
// Regenerate with: pnpm tsx tools/ga-gate/check-otel-spans.ts --print-baseline
const ZONE_B_BASELINE: readonly string[] = [
  'apps/sync-server/src/handlers/AppendEvent.ts',
  'apps/sync-server/src/handlers/LoadEvents.ts',
  'packages/command-registry/src/PatchSnapshot.ts',
  'packages/command-registry/src/StableCreatedId.ts',
  'packages/command-registry/src/ai-vg/VGIntentMapper.ts',
  'packages/command-registry/src/ai-vg/ViewAuthoringIntentMapper.ts',
  'packages/command-registry/src/floors/floorFinish.ts',
  'packages/command-registry/src/generic/ElementRebuildRegistry.ts',
  'packages/command-registry/src/operations/UnderlayCommands.ts',
  'packages/command-registry/src/project/projectLoaderUtils.ts',
  'packages/command-registry/src/requirements/requirementDefaults.ts',
  'packages/command-registry/src/rooms/RoomNumbering.ts',
  'packages/command-registry/src/rooms/perRoomBoundary.ts',
  'packages/command-registry/src/stair/stairOpeningId.ts',
  'packages/command-registry/src/vg/BulkApplyAppearanceCommand.ts',
  'packages/command-registry/src/vg/OverrideCommandUtils.ts',
  'packages/command-registry/src/walls/wallSnapshotUtils.ts',
  'plugins/ai-floorplan/src/handlers/index.ts',
  'plugins/annotations/src/handlers/index.ts',
  'plugins/bcf/src/handlers/index.ts',
  'plugins/beam/src/handlers/index.ts',
  'plugins/ceiling/src/handlers/index.ts',
  'plugins/column/src/handlers/index.ts',
  'plugins/cross/src/handlers/index.ts',
  'plugins/curtain-wall/src/handlers/index.ts',
  'plugins/dimensions/src/handlers/index.ts',
  'plugins/door/src/handlers/index.ts',
  'plugins/floor/src/handlers/index.ts',
  'plugins/furniture/src/handlers/index.ts',
  'plugins/geospatial/src/handlers/index.ts',
  'plugins/grid/src/handlers/index.ts',
  'plugins/handrail/src/handlers/index.ts',
  'plugins/ifc-export/src/handlers/index.ts',
  'plugins/levels/src/handlers/index.ts',
  'plugins/lighting/src/handlers/index.ts',
  'plugins/multiplayer/src/handlers/index.ts',
  'plugins/navigate/src/handlers/index.ts',
  'plugins/plan-view/src/handlers/index.ts',
  'plugins/plumbing/src/handlers/index.ts',
  'plugins/pool/src/handlers/index.ts',
  'plugins/roof/src/handlers/index.ts',
  'plugins/rooms/src/handlers/index.ts',
  'plugins/section-view/src/handlers/index.ts',
  'plugins/selection/src/handlers/index.ts',
  'plugins/sheets/src/handlers/index.ts',
  'plugins/slab/src/handlers/index.ts',
  'plugins/stair/src/handlers/index.ts',
  'plugins/structural/src/handlers/index.ts',
  'plugins/toy-cube/src/handlers/index.ts',
  'plugins/view/src/handlers/index.ts',
  // 2026-08-11 — `plugins/visibility-intent/src/handlers/index.ts` REMOVED from this
  // baseline because the file no longer exists. P7's five handlers were `console.debug`
  // and nothing else; the real implementation moved to `packages/visibility/src/intents/`
  // (visibility intent is a DOMAIN concept, not plugin UI — keeping it at L6 forced
  // `runtime-composer` to import UPWARD). The gate CAUGHT the stale entry itself:
  // "1 baselined file(s) are now instrumented (or no longer exist) but are still
  // listed" — a named baseline that ratchets in BOTH directions, which is exactly
  // why it is a list of names and not a count. A count would have silently absorbed
  // this and left a free slot behind.
  'plugins/wall/src/handlers/index.ts',
  'plugins/window/src/handlers/index.ts',
];

function appHandlerDirs(): string[] {
  const appsDir = join(REPO_ROOT, 'apps');
  if (!existsSync(appsDir)) return [];
  const out: string[] = [];
  for (const app of readdirSync(appsDir)) {
    const src = join(REPO_ROOT, 'apps', app, 'src');
    if (!existsSync(src)) continue;
    for (const abs of walk(src, { exts: ['.ts', '.tsx'] })) {
      const rel = relPath(REPO_ROOT, abs);
      const idx = rel.lastIndexOf('/handlers/');
      if (idx === -1) continue;
      const dir = rel.slice(0, idx + '/handlers'.length);
      if (!out.includes(dir)) out.push(dir);
    }
  }
  return out;
}

const zoneBDirs = [
  'packages/command-registry/src',
  ...appHandlerDirs(),
  ...handlerDirs, // barrels only — filtered below
];

const zoneB = scanFileCoverage({
  root: REPO_ROOT,
  dirs: zoneBDirs,
  require: SPAN_CALL_RE,
  minFiles: ZONE_B_MIN_FILES,
  exts: ['.ts', '.tsx'],
  label: 'otel-spans/zone-B',
  participates: (rel, src) => {
    if (TEST_FILE_RE.test(rel)) return false;
    // From the plugin handler dirs, Zone B takes ONLY the barrels; the handler
    // files themselves are Zone A's zero-tolerance population.
    if (rel.startsWith('plugins/') && !rel.endsWith('/index.ts')) return false;
    return EXPORTED_FN_RE.test(src);
  },
});

// ── Zone C — the repo-wide census. PRINTED, NOT GATED. ───────────────────────

const zoneC = scanFileCoverage({
  root: REPO_ROOT,
  dirs: ['packages', 'plugins', 'apps'],
  require: SPAN_CALL_RE,
  minFiles: ZONE_C_MIN_FILES,
  exts: ['.ts', '.tsx'],
  skipDirs: ['__tests__', '__mocks__'],
  label: 'otel-spans/zone-C',
  participates: (rel, src) => !TEST_FILE_RE.test(rel) && EXPORTED_FN_RE.test(src),
});

// ── --print-baseline ──────────────────────────────────────────────────────────

if (PRINT_BASELINE) {
  console.log('const ZONE_B_BASELINE: readonly string[] = [');
  for (const f of [...zoneB.uncovered].sort()) console.log(`  '${f}',`);
  console.log(`]; // ${zoneB.uncovered.length} files`);
  process.exit(0);
}

// ── Report ────────────────────────────────────────────────────────────────────

const aTotal = zoneA.covered.length + zoneA.uncovered.length;
console.log(
  `[otel-spans] ZONE A (CommandBus handlers, zero tolerance): ` +
  `${zoneA.covered.length} / ${aTotal} instrumented ` +
  `(${zoneA.filesRead} files read, ${zoneA.filesExcluded} excluded).`,
);
if (markerExempt.length > 0) {
  console.log(`[otel-spans] ZONE A marker-exempt (${GATE_EXCLUDE_MARKER}):`);
  for (const f of markerExempt) console.log(`  · ${f}`);
}

const bTotal = zoneB.covered.length + zoneB.uncovered.length;
console.log(
  `[otel-spans] ZONE B (command-registry + app handlers + plugin barrels): ` +
  `${zoneB.uncovered.length} uninstrumented of ${bTotal} ` +
  `(baseline allows ${ZONE_B_BASELINE.filter((p) => p !== '__PLACEHOLDER__').length}).`,
);

const cTotal = zoneC.covered.length + zoneC.uncovered.length;
console.log(
  `[otel-spans] ZONE C §CENSUS (NOT GATED — literal C10 §2 scope): ` +
  `${zoneC.uncovered.length} / ${cTotal} files declaring an exported function have NO span ` +
  `(${zoneC.filesRead} source files read).`,
);

// ── Verdict ───────────────────────────────────────────────────────────────────

let failed = false;

// A1 — LOAD-BEARING. Zero tolerance.
if (zoneA.uncovered.length > 0) {
  failed = true;
  console.error(
    `\n[otel-spans] FAIL (Zone A): ${zoneA.uncovered.length} CommandBus handler file(s) have no ` +
    `withHandlerSpan()/withAsyncHandlerSpan() call. P8 (C10 §2) requires ≥ 1 span per exported ` +
    `handler; this zone is a zero-tolerance zone and has no baseline.`,
  );
  for (const f of zoneA.uncovered) console.error(`  ✗ ${f}`);
}

// A2 — the weaker second assertion. Guards a collapsed scan, not code quality.
if (zoneA.covered.length < HARD_FLOOR) {
  failed = true;
  console.error(
    `\n[otel-spans] FAIL (Zone A floor): only ${zoneA.covered.length} instrumented handler file(s) ` +
    `found — this family had ${HARD_FLOOR}+ on 2026-08-11. Either instrumentation was deleted, or ` +
    `the discovery glob collapsed. DO NOT lower this number to make the gate green; find out which.`,
  );
}

// B — shrink-only named baseline.
const baseline = new Set(ZONE_B_BASELINE.filter((p) => p !== '__PLACEHOLDER__'));
const zoneBNew = zoneB.uncovered.filter((f) => !baseline.has(f));
const zoneBFixedButListed = [...baseline].filter((f) => !zoneB.uncovered.includes(f));

if (zoneBNew.length > 0) {
  failed = true;
  console.error(
    `\n[otel-spans] FAIL (Zone B): ${zoneBNew.length} NEW uninstrumented exported function file(s) ` +
    `outside the §RATCHET-P8-ZONE-B baseline. Add ≥ 1 OTel span (P8 / C10 §2). The baseline is ` +
    `shrink-only — it must NOT be extended to absorb new debt.`,
  );
  for (const f of zoneBNew) console.error(`  ✗ ${f}`);
}

if (zoneBFixedButListed.length > 0) {
  failed = true;
  console.error(
    `\n[otel-spans] FAIL (Zone B ratchet): ${zoneBFixedButListed.length} baselined file(s) are now ` +
    `instrumented (or no longer exist) but are still listed. Remove them from ZONE_B_BASELINE in ` +
    `this PR — that is how the ratchet tightens.`,
  );
  for (const f of zoneBFixedButListed) console.error(`  · ${f}`);
}

if (failed) process.exit(1);

console.log(
  `\n[otel-spans] OK ✅  Zone A ${zoneA.covered.length}/${aTotal} at zero tolerance; ` +
  `Zone B at or below its ${baseline.size}-file shrink-only baseline.`,
);
console.log(
  `[otel-spans] NOTE: Zone C's ${zoneC.uncovered.length} figure is NOT enforced. P8 as written in ` +
  `C10 §2 is not fully enforced by any gate in this repo — see §CENSUS in this file.`,
);
process.exit(0);
