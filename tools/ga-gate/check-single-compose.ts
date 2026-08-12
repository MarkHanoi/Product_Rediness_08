#!/usr/bin/env tsx
/**
 * tools/ga-gate/check-single-compose.ts
 *
 * §P1-UNENFORCED (L-812) — "Single composition root", actually checked.
 *
 * C01 §1/§5 have listed this exact filename as a hard-fail gate since 2026-05-02.
 * **The file did not exist.** P1 had no enforcement of any kind.
 *
 * ─── What P1 actually asserts ────────────────────────────────────────────────
 * Production code obtains a runtime ONLY via `composeRuntime()` in
 * `packages/runtime-composer`. There is no second runtime wiring and no parallel
 * composition. This matters because composeRuntime is where the command bus, the
 * frame scheduler (P3), the store attachment and the plugin host are joined; a
 * rival factory produces an object that looks like a runtime and silently lacks
 * one of them.
 *
 * ─── The three things this gate CAN decide ───────────────────────────────────
 *   1. `composeRuntime` is DEFINED exactly once, in the one legal file.  HARD 1.
 *   2. No RIVAL runtime factory is exported anywhere — any exported symbol
 *      matching /^(create|build|make|init|assemble|setup|wire)…Runtime$/ outside
 *      the allowlist.                                                    HARD 0.
 *   3. How many production (non-test, non-bench) files CALL composeRuntime.
 *      Ratcheted, not hard-failed: a legitimate second caller exists today
 *      (`@pryzm/headless`, which delegates rather than re-composes), so a hard 1
 *      would be wrong. Growth still has to be argued for.
 *
 * ─── What it CANNOT decide, stated plainly ───────────────────────────────────
 * It cannot tell a delegating wrapper (`headlessRuntime` → `composeRuntime`) from
 * a genuine second composition root by static shape alone — both call the same
 * function. Check 3 is therefore a TRIPWIRE on the number of entry points, not a
 * proof of singularity. Claiming otherwise would be the manufactured-confidence
 * failure this suite exists to avoid.
 *
 * Exit: 0 = clean/at baseline · 1 = violated · 2 = scan misconfigured
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { scanFiles, walk, relPath } from './lib/sourceScan.js';

const REPO_ROOT = process.env.GA_GATE_REPO_ROOT ?? process.cwd();
const LABEL = 'single-compose';

/** The ONE legal home of the composition root. */
const CANONICAL = 'packages/runtime-composer/src/composeRuntime.ts';

/**
 * Files permitted to export a runtime-factory-shaped symbol. Each is a DELEGATE
 * (it calls composeRuntime), not a rival composition root. Adding to this list
 * is an architectural decision, not a build fix.
 */
const FACTORY_ALLOWLIST: readonly string[] = [
  CANONICAL,
  'packages/runtime-composer/src/index.ts',
  'packages/headless/src/headlessRuntime.ts',   // delegates: returns composeRuntime({canvas:null})
  'packages/headless/src/index.ts',
];

/**
 * ⚠ SHRINK-ONLY. Frozen 2026-08-09 on the first run: **2**.
 *   • `src/main.ts`                          — the browser boot path. Correct.
 *   • `packages/headless/src/headlessRuntime.ts` — delegates with `canvas: null`.
 * Both are entry points into the ONE composer, not rival composers. A third is a
 * question to answer, not a number to raise.
 */
const MAX_PROD_CALLERS = Number(process.env.PRYZM_P1_MAX_CALLERS ?? 2);

/**
 * ⚠ SHRINK-ONLY. Frozen 2026-08-09 on the first run: **1**.
 *
 * The one rival is `apps/component-editor/src/app/familyEditorRuntime.ts`
 * → `createFamilyEditorRuntime()`. It is a GENUINE second composition root: it
 * builds its own command bus (`createCommandBus()`), its own sketch/constraint/
 * selection/referencePlane/solid stores, and its own solver runner, with no
 * reference to `composeRuntime`.
 *
 * ─── The case was argued: **ADR-0316** ───────────────────────────────────────
 * `docs/02-decisions/adrs/ADR-0316-family-creator-is-a-second-composition-root.md`
 *
 * This number used to be a magic constant standing in for a decision nobody had
 * made — the docstring above said "separate surface" is a reason to argue the
 * case in an ADR, and the ADR did not exist. It does now, and it is ACCEPTED:
 * the Family Creator is a different product surface (no project, no site, no
 * collaboration, no renderer) under a hard 180 KB gzip first-paint budget, while
 * `composeRuntime()` statically imports `@pryzm/renderer-three` — THREE's core
 * alone measures 281 KB gzip, 1.53× that entire budget — and requires a
 * `bootstrapFn` supplied by `@pryzm/editor`. Delegation is not merely costly
 * there; it makes the app's own contract unsatisfiable.
 *
 * The blessing is CONDITIONAL, and the conditions are executable:
 * `apps/component-editor/__tests__/app/secondCompositionRoot.invariants.test.ts`
 * pins what the two roots must keep in common (P6 command-only mutation, verb
 * reachability, one-batch-is-one-undo, P8 spans, total dispose) and forbids the
 * imports that would collapse the "second surface" argument. ADR-0316 §5 lists
 * what would make the decision wrong later.
 *
 * ⚠ Baselined, NOT allowlisted — deliberately. Adding the file to
 * FACTORY_ALLOWLIST would make the rival disappear from this gate's output;
 * baselining keeps it counted and named on every CI run while forbidding growth.
 * 1 → 2 is a new ADR or a bug. Never raise it to go green.
 */
const MAX_RIVALS = Number(process.env.PRYZM_P1_MAX_RIVALS ?? 1);

const MIN_FILES = 1500;

const SCAN_DIRS = ['src', 'apps', 'plugins', 'packages'].filter((d) => existsSync(join(REPO_ROOT, d)));

function isTest(rel: string): boolean {
  return /(^|\/)(__tests__|__fixtures__|__mocks__)\//.test(rel)
      || /\.(spec|test|bench)\.tsx?$/.test(rel)
      || rel.endsWith('.d.ts')
      || /(^|\/)apps\/bench\//.test(rel);
}

// ── 1. composeRuntime is defined exactly once ────────────────────────────────
const defs = scanFiles({
  root: REPO_ROOT,
  dirs: SCAN_DIRS,
  pattern: /^\s*export\s+(?:async\s+)?function\s+composeRuntime\b|^\s*export\s+const\s+composeRuntime\s*[:=]/,
  minFiles: MIN_FILES,
  exclude: isTest,
  label: LABEL,
});

// ── 2. rival runtime factories ───────────────────────────────────────────────
// PREFIXES ARE CONSTRUCTION VERBS ONLY. The first draft also matched
// `wire|setup|init|boot`, which produced 7 false positives: `wireRuntime(rt)`,
// `wireClimateRuntime(rt)` and friends are INJECTORS — they receive the composed
// runtime and store it in a module singleton, which is the P1-compliant pattern,
// the exact opposite of a rival factory. Recorded because a gate that flags the
// correct pattern as the violation is how gates get switched off.
const RIVAL_RE = /^\s*export\s+(?:async\s+)?(?:function|const|class)\s+((?:create|build|make|assemble|compose)[A-Za-z0-9_]*Runtime)\b/;
const rivals = scanFiles({
  root: REPO_ROOT,
  dirs: SCAN_DIRS,
  pattern: RIVAL_RE,
  minFiles: MIN_FILES,
  exclude: (rel) => isTest(rel) || FACTORY_ALLOWLIST.includes(rel),
  label: LABEL,
});

// ── 3. production callers ────────────────────────────────────────────────────
const CALL_RE = /(?<![\w.])composeRuntime\s*\(/;
const callFiles = new Set<string>();
for (const dir of SCAN_DIRS) {
  for (const abs of walk(join(REPO_ROOT, dir))) {
    const rel = relPath(REPO_ROOT, abs);
    if (isTest(rel) || rel.startsWith('packages/runtime-composer/')) continue;
    let src: string;
    try { src = readFileSync(abs, 'utf8'); } catch { continue; }
    for (const raw of src.split('\n')) {
      if (/^\s*(\/\/|\*|\/\*)/.test(raw)) continue;   // comments are not call sites
      // Strip string literals BEFORE matching. Without this, the two
      // `console.error('… composeRuntime() must have failed at boot')` diagnostics
      // in ProjectHub.ts and src/main.ts counted as composition entry points —
      // a gate reporting log messages as architecture.
      const line = raw.replace(/'[^']*'|"[^"]*"|`[^`]*`/g, "''");
      if (CALL_RE.test(line)) { callFiles.add(rel); break; }
    }
  }
}

// ── Report ───────────────────────────────────────────────────────────────────
console.log(`[${LABEL}] §P1-UNENFORCED (L-812) — single composition root (C01 §1 P1)`);
console.log(`[${LABEL}] files scanned: ${defs.filesScanned} · composeRuntime definitions: ${defs.matches.length} · rival runtime factories: ${rivals.matches.length} · production callers: ${callFiles.size}`);

let failed = false;

if (defs.matches.length !== 1 || defs.matches[0]!.file !== CANONICAL) {
  console.error(`\n[${LABEL}] FAIL — composeRuntime must be defined EXACTLY ONCE, in ${CANONICAL}.`);
  for (const m of defs.matches) console.error(`      ${m.file}:${m.line}  ${m.text}`);
  if (defs.matches.length === 0) {
    console.error(`  Found ZERO definitions. Either the composition root moved (update CANONICAL in\n` +
                  `  this gate in the same commit) or the scan is wrong — do not ignore this.`);
  }
  failed = true;
}

if (rivals.matches.length) {
  console.log('\n  Rival runtime factories (declared debt — see MAX_RIVALS):');
  for (const m of rivals.matches) console.log(`      ${m.file}:${m.line}  ${m.groups[0]}`);
}

if (rivals.matches.length > MAX_RIVALS) {
  console.error(`\n[${LABEL}] FAIL — ${rivals.matches.length} rival runtime factory export(s), baseline ${MAX_RIVALS}:`);
  for (const m of rivals.matches) console.error(`      ${m.file}:${m.line}  ${m.groups[0]}`);
  console.error(
    `  P1: there is ONE composition root. A second factory yields an object that looks\n` +
    `  like a runtime while quietly missing a slot (bus, scheduler, store attachment,\n` +
    `  plugin host). Delegate to composeRuntime() instead, or — if it genuinely must be\n` +
    `  a distinct wiring — raise an ADR and add the file to FACTORY_ALLOWLIST with the\n` +
    `  ADR number. Do not add it silently.`,
  );
  failed = true;
}

// §EXIT-CODE-CONTRACT (2026-08-11, C9). MAX_PROD_CALLERS is a shrink-only ratchet
// — a NEW composition entry point is debt GROWTH, which no ledger absorbs (exit 3,
// §RATCHET-EXCEEDED-IS-NEVER-DEBT R7). A rival runtime factory outside
// FACTORY_ALLOWLIST is a P1 invariant breach (exit 1). Two facts, two codes.
let ratchetExceeded = false;
if (callFiles.size > MAX_PROD_CALLERS) {
  console.error(`\n[${LABEL}] FAIL — ${callFiles.size} production file(s) call composeRuntime(), baseline ${MAX_PROD_CALLERS}:`);
  for (const f of [...callFiles].sort()) console.error(`      ${f}`);
  console.error(`  Each new caller is a new entry point into composition. Justify it or route\n` +
                `  through the existing one. Do NOT raise this threshold to go green.`);
  ratchetExceeded = true;
} else if (callFiles.size) {
  console.log('\n  Production composeRuntime() callers:');
  for (const f of [...callFiles].sort()) console.log(`      ${f}`);
}

if (ratchetExceeded) process.exit(3);
if (failed) process.exit(1);
console.log(`\n[${LABEL}] ✓ one composition root (${CANONICAL}), 0 rivals, ${callFiles.size}/${MAX_PROD_CALLERS} production caller(s).`);
