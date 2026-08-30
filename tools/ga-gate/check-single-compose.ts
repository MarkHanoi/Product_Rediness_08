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
 * ─── The three things this gate CAN decide (the three ARMS) ──────────────────
 *   D1  `composeRuntime` is DEFINED exactly once, in the one legal file.  HARD 1.
 *   R1  No RIVAL runtime factory is exported anywhere — any exported symbol
 *       matching /^(create|build|make|assemble|compose)…Runtime$/ outside the
 *       allowlist. Ratcheted at MAX_RIVALS (currently 1, ADR-0316).
 *   C1  How many production (non-test, non-bench) files CALL composeRuntime.
 *       Ratcheted, not hard-failed: a legitimate second caller exists today
 *       (`@pryzm/headless`, which delegates rather than re-composes), so a hard 1
 *       would be wrong. Growth still has to be argued for.
 *
 * ─── What it CANNOT decide, stated plainly ───────────────────────────────────
 * It cannot tell a delegating wrapper (`headlessRuntime` → `composeRuntime`) from
 * a genuine second composition root by static shape alone — both call the same
 * function. C1 is therefore a TRIPWIRE on the number of entry points, not a
 * proof of singularity. Claiming otherwise would be the manufactured-confidence
 * failure this suite exists to avoid.
 *
 * ─── §FALSE-GREEN-TERMINAL-LINE — CORRECTED 2026-08-30 (audit W1a) ───────────
 * The terminal success line used to read, verbatim:
 *
 *     "✓ one composition root (…), 0 rivals, N/M production caller(s)."
 *
 * **"0 rivals" was a HARD-CODED STRING.** It interpolated only the caller count
 * and never the measured rival count. The gate's own body had already printed
 * "rival runtime factories: 1" and NAMED
 * `apps/component-editor/src/app/familyEditorRuntime.ts:85 createFamilyEditorRuntime`
 * — and then its last line, the one a CI log reader actually sees, told them P1
 * was clean at zero rivals. A summary that contradicts the measurement above it
 * is worse than no summary: it is the gate laundering its own finding.
 * The line now interpolates the MEASURED count against its baseline.
 *
 * ─── Negative + positive control — EXECUTED ON EVERY RUN ────────────────────
 * A terminal line can only be trusted if the arms behind it are watched failing.
 * `selfTest()` materialises two synthetic workspaces and runs the SAME
 * `analyse()` over them at the SAME production baselines (MAX_RIVALS,
 * MAX_PROD_CALLERS) — not at relaxed ones, so what the control proves is what
 * production enforces:
 *   • PLANTED — a second `composeRuntime` definition outside the canonical file
 *     (D1 must fire), two rival factories outside the allowlist (R1 must fire
 *     and must NAME them), and three production callers (C1 must fire).
 *   • CLEAN — one canonical definition, an allowlisted delegate that calls it,
 *     `src/main.ts` calling it (exactly the baseline 2 callers), plus the two
 *     shapes that are CORRECT and must never fire: `wireRuntime(rt)`, an
 *     INJECTOR receiving the composed runtime, and a diagnostic string literal
 *     mentioning composeRuntime(). Must read 0.
 * If any planted arm stays silent, or the clean tree reads dirty, the gate exits
 * 2 as a BLIND COMPARATOR — an arm never watched failing has never been shown to
 * work, and this gate has already shipped one false green.
 *
 * A consequence worth stating, because it is the point rather than a side
 * effect: because the controls run at the LIVE baselines, RAISING a ceiling
 * through `PRYZM_P1_MAX_RIVALS` / `PRYZM_P1_MAX_CALLERS` disarms the planted
 * violations and the gate exits 2 instead of going green — the forbidden fix
 * (§RATCHET-EXCEEDED-IS-NEVER-DEBT) now announces itself.
 *   Measured 2026-08-30: `PRYZM_P1_MAX_RIVALS=99 PRYZM_P1_MAX_CALLERS=99` →
 *   RC=2, "R1 did not fire", "C1 did not fire".
 * The converse — legitimately TIGHTENING a baseline — will make the CLEAN
 * fixture read dirty (it carries exactly 2 callers). That is a fixture that must
 * move in the same commit as the threshold, the same rule as CANONICAL moving.
 *
 * Exit: 0 = clean/at baseline · 1 = invariant violated (D1/R1) · 2 = scan
 * misconfigured or blind comparator · 3 = shrink-only ratchet exceeded (C1).
 */

import { existsSync, readFileSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { scanFiles, walk, relPath, type Match } from './lib/sourceScan.js';

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
 *
 * ⚠ And it must be VISIBLE, not merely counted: see §FALSE-GREEN-TERMINAL-LINE
 * above. A baselined rival that the summary line reports as zero is
 * indistinguishable from no rival at all, which defeats the entire reason for
 * baselining it instead of allowlisting it.
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

// ── The arms ─────────────────────────────────────────────────────────────────

type Arm = 'D1' | 'R1' | 'C1';

interface Finding {
  readonly arm: Arm;
  readonly key: string;
  readonly detail: string;
}

interface Analysis {
  readonly defs: readonly Match[];
  readonly rivals: readonly Match[];
  readonly callers: readonly string[];
  readonly filesScanned: number;
  readonly findings: readonly Finding[];
}

/**
 * The whole measurement, over an arbitrary root. Parameterised by root/dirs/
 * minFiles ONLY so the executed controls can drive the identical code path over
 * a synthetic tree; the BASELINES are the production ones in both cases, so a
 * control that fires proves the arm that ships fires.
 */
function analyse(
  root: string,
  dirs: readonly string[],
  minFiles: number,
  maxRivals: number,
  maxCallers: number,
): Analysis {
  // ── D1. composeRuntime is defined exactly once ─────────────────────────────
  const defs = scanFiles({
    root,
    dirs,
    pattern: /^\s*export\s+(?:async\s+)?function\s+composeRuntime\b|^\s*export\s+const\s+composeRuntime\s*[:=]/,
    minFiles,
    exclude: isTest,
    label: LABEL,
  });

  // ── R1. rival runtime factories ────────────────────────────────────────────
  // PREFIXES ARE CONSTRUCTION VERBS ONLY. The first draft also matched
  // `wire|setup|init|boot`, which produced 7 false positives: `wireRuntime(rt)`,
  // `wireClimateRuntime(rt)` and friends are INJECTORS — they receive the composed
  // runtime and store it in a module singleton, which is the P1-compliant pattern,
  // the exact opposite of a rival factory. Recorded because a gate that flags the
  // correct pattern as the violation is how gates get switched off. The CLEAN
  // control tree carries a `wireRuntime`, so that guard is EXECUTED, not asserted.
  const RIVAL_RE = /^\s*export\s+(?:async\s+)?(?:function|const|class)\s+((?:create|build|make|assemble|compose)[A-Za-z0-9_]*Runtime)\b/;
  const rivals = scanFiles({
    root,
    dirs,
    pattern: RIVAL_RE,
    minFiles,
    exclude: (rel) => isTest(rel) || FACTORY_ALLOWLIST.includes(rel),
    label: LABEL,
  });

  // ── C1. production callers ─────────────────────────────────────────────────
  const CALL_RE = /(?<![\w.])composeRuntime\s*\(/;
  const callFiles = new Set<string>();
  for (const dir of dirs) {
    for (const abs of walk(join(root, dir))) {
      const rel = relPath(root, abs);
      if (isTest(rel) || rel.startsWith('packages/runtime-composer/')) continue;
      let src: string;
      try { src = readFileSync(abs, 'utf8'); } catch { continue; }
      for (const raw of src.split('\n')) {
        if (/^\s*(\/\/|\*|\/\*)/.test(raw)) continue;   // comments are not call sites
        // Strip string literals BEFORE matching. Without this, the two
        // console.error diagnostics in ProjectHub.ts and src/main.ts that mention
        // composeRuntime() counted as composition entry points — a gate reporting
        // log messages as architecture. The CLEAN control tree carries that exact
        // shape, so the guard is EXECUTED, not asserted.
        const line = raw.replace(/'[^']*'|"[^"]*"|`[^`]*`/g, "''");
        if (CALL_RE.test(line)) { callFiles.add(rel); break; }
      }
    }
  }
  const callers = [...callFiles].sort();

  // ── Findings ───────────────────────────────────────────────────────────────
  const findings: Finding[] = [];

  if (defs.matches.length !== 1 || defs.matches[0]!.file !== CANONICAL) {
    findings.push({
      arm: 'D1',
      key: `D1::definitions=${defs.matches.length}`,
      detail:
        `composeRuntime must be defined EXACTLY ONCE, in ${CANONICAL}; found ${defs.matches.length} ` +
        `definition(s) [${defs.matches.map((m) => `${m.file}:${m.line}`).join(', ') || 'none'}]. ` +
        (defs.matches.length === 0
          ? 'ZERO definitions: either the composition root moved (update CANONICAL in this gate in ' +
            'the same commit) or the scan is wrong — do not ignore this.'
          : 'A second definition IS a second composition root, whatever it is called.'),
    });
  }

  if (rivals.matches.length > maxRivals) {
    findings.push({
      arm: 'R1',
      key: `R1::rivals=${rivals.matches.length}>${maxRivals}`,
      detail:
        `${rivals.matches.length} rival runtime factory export(s), baseline ${maxRivals}: ` +
        `[${rivals.matches.map((m) => `${m.file}:${m.line} ${m.groups[0]}`).join(' · ')}]. ` +
        `P1: there is ONE composition root. A second factory yields an object that looks like a ` +
        `runtime while quietly missing a slot (bus, scheduler, store attachment, plugin host). ` +
        `Delegate to composeRuntime() instead, or — if it genuinely must be a distinct wiring — ` +
        `raise an ADR and add the file to FACTORY_ALLOWLIST with the ADR number. Never silently.`,
    });
  }

  if (callers.length > maxCallers) {
    findings.push({
      arm: 'C1',
      key: `C1::callers=${callers.length}>${maxCallers}`,
      detail:
        `${callers.length} production file(s) call composeRuntime(), baseline ${maxCallers}: ` +
        `[${callers.join(', ')}]. Each new caller is a new entry point into composition. Justify ` +
        `it or route through the existing one. Do NOT raise this threshold to go green.`,
    });
  }

  return { defs: defs.matches, rivals: rivals.matches, callers, filesScanned: defs.filesScanned, findings };
}

// ─── Executed controls — an arm never watched failing is UNPROVEN ────────────

function writeTree(base: string, files: Record<string, string>): void {
  rmSync(base, { recursive: true, force: true });
  for (const [p, body] of Object.entries(files)) {
    const abs = join(base, p.split('/').join(sep));
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, body, 'utf8');
  }
}

const PLANTED: Record<string, string> = {
  // The canonical root, correct…
  'packages/runtime-composer/src/composeRuntime.ts':
    'export function composeRuntime(opts: unknown) { return opts; }\n',
  // …and a SECOND definition of it elsewhere. D1 must fire.
  'packages/rogue/src/rogueComposer.ts':
    'export function composeRuntime(opts: unknown) { return opts; }\n',
  // Two rival factories outside the allowlist — 2 > MAX_RIVALS. R1 must fire,
  // and must NAME them.
  'apps/a/src/familyRuntime.ts':
    'export function createFamilyRuntime() { return {}; }\n',
  'apps/b/src/kioskRuntime.ts':
    'export const buildKioskRuntime = () => ({});\n',
  // Three production callers — 3 > MAX_PROD_CALLERS. C1 must fire.
  'src/main.ts': 'void composeRuntime({});\n',
  'apps/a/src/boot.ts': 'void composeRuntime({});\n',
  'apps/b/src/boot.ts': 'void composeRuntime({});\n',
};

const CLEAN: Record<string, string> = {
  'packages/runtime-composer/src/composeRuntime.ts':
    'export function composeRuntime(opts: unknown) { return opts; }\n',
  // An ALLOWLISTED delegate: exports a factory-shaped symbol AND calls the one
  // composer. Caller #1. Must not fire.
  'packages/headless/src/headlessRuntime.ts':
    'export function createHeadlessRuntime() { return composeRuntime({ canvas: null }); }\n',
  // Caller #2 — exactly at the baseline of 2. Must not fire.
  'src/main.ts': 'void composeRuntime({});\n',
  // The INJECTOR shape. Receives a composed runtime; it is the P1-compliant
  // pattern and the 7-false-positive lesson. Must not be counted as a rival.
  'apps/a/src/wireRuntime.ts':
    'export function wireRuntime(rt: unknown) { void rt; }\n',
  // The DIAGNOSTIC STRING shape: composeRuntime() inside a literal. Must not be
  // counted as a third caller.
  'apps/a/src/diagnostic.ts':
    "console.error('composeRuntime() must have failed at boot');\n",
};

interface Control {
  readonly ok: boolean;
  readonly lines: readonly string[];
  readonly armsFired: readonly string[];
}

function selfTest(): Control {
  const base = join(tmpdir(), `pryzm-${LABEL}-selftest`);
  const lines: string[] = [];
  const dirs = ['src', 'apps', 'packages'];
  let armsFired: string[] = [];
  let ok = true;
  try {
    writeTree(join(base, 'planted'), PLANTED);
    writeTree(join(base, 'clean'), CLEAN);
    // minFiles 1: the honesty floor exists to catch a walk that reached nothing,
    // and these trees are deliberately tiny. The BASELINES stay the production
    // ones — a control run at relaxed thresholds proves nothing about the gate
    // that ships.
    const bad = analyse(join(base, 'planted'), dirs, 1, MAX_RIVALS, MAX_PROD_CALLERS);
    const good = analyse(join(base, 'clean'), dirs, 1, MAX_RIVALS, MAX_PROD_CALLERS);

    const fired = new Set(bad.findings.map((f) => f.arm));
    armsFired = [...fired].sort();
    lines.push(`Negative control (planted tree): ${bad.findings.length} finding(s), arms fired [${armsFired.join(', ')}]`);
    for (const f of bad.findings) lines.push(`    ✓ ${f.arm} fired — ${f.key}`);
    for (const arm of ['D1', 'R1', 'C1'] as const) {
      if (!fired.has(arm)) {
        ok = false;
        lines.push(`    ✗ BLIND COMPARATOR — ${arm} did not fire on a deliberately planted violation.`);
      }
    }
    // R1 must NAME the rivals, not merely count them: a summary that loses the
    // name is exactly how this gate shipped "0 rivals" over a rival it had found.
    const named = [...bad.rivals].map((m) => m.file).sort();
    lines.push(`    planted rivals named: [${named.join(', ') || 'NONE'}]`);
    for (const want of ['apps/a/src/familyRuntime.ts', 'apps/b/src/kioskRuntime.ts']) {
      if (!named.includes(want)) {
        ok = false;
        lines.push(`    ✗ BLIND COMPARATOR — R1 did not name the planted rival ${want}.`);
      }
    }

    lines.push(
      `Positive control (clean tree — allowlisted delegate, wireRuntime injector, ` +
      `composeRuntime() inside a log string): ${good.findings.length} finding(s) — must be 0`,
    );
    lines.push(
      `    clean tree read: ${good.defs.length} definition(s) · ${good.rivals.length} rival(s) · ` +
      `${good.callers.length} caller(s) [${good.callers.join(', ')}]`,
    );
    for (const f of good.findings) lines.push(`    ✗ FALSE POSITIVE — ${f.key}: ${f.detail}`);
    if (good.findings.length > 0) ok = false;
    if (good.rivals.length !== 0) {
      ok = false;
      lines.push('    ✗ FALSE POSITIVE — the injector/delegate shapes were counted as rivals.');
    }
    if (good.callers.length !== 2) {
      ok = false;
      lines.push(`    ✗ MISCOUNT — the clean tree has exactly 2 real callers; the gate read ${good.callers.length} (the log-string guard).`);
    }
  } catch (e) {
    ok = false;
    lines.push(`    ✗ self-test threw: ${(e as Error).message}`);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
  return { ok, lines, armsFired };
}

// ─── Run ─────────────────────────────────────────────────────────────────────

const control = selfTest();
console.log(`[${LABEL}] executed controls (an arm never watched failing is UNPROVEN):`);
for (const l of control.lines) console.log('   ' + l);

const a = analyse(REPO_ROOT, SCAN_DIRS, MIN_FILES, MAX_RIVALS, MAX_PROD_CALLERS);

console.log(`\n[${LABEL}] §P1-UNENFORCED (L-812) — single composition root (C01 §1 P1)`);
console.log(
  `[${LABEL}] files scanned: ${a.filesScanned} · composeRuntime definitions: ${a.defs.length} · ` +
  `rival runtime factories: ${a.rivals.length} / MAX_RIVALS ${MAX_RIVALS} · ` +
  `production callers: ${a.callers.length} / ${MAX_PROD_CALLERS}`,
);

if (a.rivals.length) {
  console.log('\n  Rival runtime factories (declared debt — see MAX_RIVALS):');
  for (const m of a.rivals) console.log(`      ${m.file}:${m.line}  ${m.groups[0]}`);
}
if (a.callers.length) {
  console.log('\n  Production composeRuntime() callers:');
  for (const f of a.callers) console.log(`      ${f}`);
}

for (const f of a.findings) console.error(`\n[${LABEL}] FAIL ${f.arm} — ${f.detail}`);

// A blind comparator is a MISCONFIGURATION, not a pass and not a violation:
// exit 2, the same code sourceScan uses for a scan that looked nowhere.
if (!control.ok) {
  console.error(
    `\n[${LABEL}] MISCONFIGURED (exit 2) — BLIND COMPARATOR. The executed controls did not ` +
    `establish that this gate's arms fire.\n` +
    `  Whatever it printed about the real tree above is unproven. This gate has already shipped\n` +
    `  one false green (§FALSE-GREEN-TERMINAL-LINE); a silent arm is how the next one ships.`,
  );
  process.exit(2);
}

// §EXIT-CODE-CONTRACT (2026-08-11, C9). MAX_PROD_CALLERS is a shrink-only ratchet
// — a NEW composition entry point is debt GROWTH, which no ledger absorbs (exit 3,
// §RATCHET-EXCEEDED-IS-NEVER-DEBT R7). A rival runtime factory outside
// FACTORY_ALLOWLIST is a P1 invariant breach (exit 1). Two facts, two codes.
if (a.findings.some((f) => f.arm === 'C1')) process.exit(3);
if (a.findings.length) process.exit(1);

// ⛔ EVERY NUMBER ON THIS LINE IS MEASURED. Never re-introduce a literal here:
// the string "0 rivals" stood on this line while the body above named one.
console.log(
  `\n[${LABEL}] ✓ one composition root (${CANONICAL}), ` +
  `${a.rivals.length}/${MAX_RIVALS} rival runtime factor${a.rivals.length === 1 ? 'y' : 'ies'}` +
  `${a.rivals.length ? ` (${a.rivals.map((m) => m.groups[0]).join(', ')} — declared debt, ADR-0316)` : ''}, ` +
  `${a.callers.length}/${MAX_PROD_CALLERS} production caller(s), ` +
  `controls: arms proven to fire [${control.armsFired.join(', ')}].`,
);
