#!/usr/bin/env node
// @pryzm/release ga-gate — Z.6 of PRYZM2-WIREUP-PLAN-S72 §26.1.
//
// Runs the §23 verification checks in order, prints a scoreboard, and
// exits non-zero on the first failure. The H.10 GA-launch gate calls
// this script directly.
//
// Usage:
//   node src/ga-gate.mjs           (human scoreboard)
//   node src/ga-gate.mjs --json    (machine output)
//
// Exit codes:
//   0 — every check passed
//   1 — at least one check failed
//   2 — gate misconfigured (e.g. floor file missing)

import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const FLOOR_FILE = resolve(REPO_ROOT, '.local', 'wireup-floor.json');

// Per §26.3 — monotonic ratchet floor numbers captured at the audit
// date.  Future PRs may only reduce shrinkers and grow growers.
const RATCHET = {
  ui_cast_sites:           { kind: 'shrink', floor: 767 },
  raf_outside_scheduler:   { kind: 'shrink', floor: 89 },
  canvas_outside_renderer: { kind: 'shrink', floor: 47 },
  // 49 = 47 original + Z.6 (@pryzm/release) + Z.7 (@pryzm/bench-visual-diff).
  packages_count:          { kind: 'grow',   floor: 49 },
  adr_count:               { kind: 'grow',   floor: 44 },
};

function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    stdio: opts.silent ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    env: process.env,
    ...opts,
  });
}

function checkWireupFloor() {
  if (!existsSync(FLOOR_FILE)) {
    return {
      name: 'wireup-floor',
      pass: false,
      detail: `floor file missing — run scripts/wireup-baseline.sh > ${FLOOR_FILE}`,
      configError: true,
    };
  }
  let floor;
  try {
    floor = JSON.parse(readFileSync(FLOOR_FILE, 'utf8'));
  } catch (err) {
    return {
      name: 'wireup-floor',
      pass: false,
      detail: `floor file is not valid JSON: ${err.message}`,
      configError: true,
    };
  }
  const violations = [];
  for (const [key, ratchet] of Object.entries(RATCHET)) {
    const actual = floor[key];
    if (typeof actual !== 'number') {
      violations.push(`${key}: missing from floor file`);
      continue;
    }
    if (ratchet.kind === 'shrink' && actual > ratchet.floor) {
      violations.push(`${key}: ${actual} > floor ${ratchet.floor} (shrinker rose)`);
    }
    if (ratchet.kind === 'grow' && actual < ratchet.floor) {
      violations.push(`${key}: ${actual} < floor ${ratchet.floor} (grower fell)`);
    }
  }
  return {
    name: 'wireup-floor',
    pass: violations.length === 0,
    detail: violations.length === 0
      ? `all 5 ratchet dimensions within floor`
      : violations.join('; '),
  };
}

function checkLint() {
  // Lint runs in warn mode — only ERROR-level diagnostics fail the gate.
  // Use eslint's `--max-warnings=Infinity` to ignore warnings explicitly.
  const r = run('pnpm', ['exec', 'eslint', '.', '--max-warnings=999999'], { silent: true });
  return {
    name: 'lint',
    pass: r.status === 0,
    detail: r.status === 0
      ? 'no eslint errors'
      : (r.stdout?.split('\n').slice(-20).join('\n') || r.stderr || `exit ${r.status}`),
  };
}

function checkGestureCoverage() {
  const script = resolve(REPO_ROOT, 'apps', 'bench', 'scripts', 'check-gesture-coverage.mjs');
  if (!existsSync(script)) {
    return { name: 'gesture-coverage', pass: false, detail: `${script} missing`, configError: true };
  }
  const r = run(process.execPath, [script], { silent: true });
  return {
    name: 'gesture-coverage',
    pass: r.status === 0,
    detail: r.status === 0
      ? 'every gesture covered'
      : (r.stdout?.trim().split('\n').slice(-10).join('\n') || `exit ${r.status}`),
  };
}

function checkVisualDiffSmoke() {
  const script = resolve(REPO_ROOT, 'packages', 'bench-visual-diff', 'src', 'index.mjs');
  if (!existsSync(script)) {
    return { name: 'visual-diff-smoke', pass: false, detail: `${script} missing`, configError: true };
  }
  const r = run(process.execPath, [script, '--no-fixtures'], { silent: true });
  return {
    name: 'visual-diff-smoke',
    pass: r.status === 0,
    detail: r.status === 0
      ? 'harness intact'
      : (r.stdout?.trim() || r.stderr?.trim() || `exit ${r.status}`),
  };
}

function checkTypecheck() {
  // Typecheck the root tsconfig — workspace packages typecheck themselves
  // on their own. This catches new errors that appear at the integration
  // surface only.
  const r = run('pnpm', ['exec', 'tsc', '--noEmit', '--skipLibCheck'], { silent: true });
  return {
    name: 'typecheck',
    pass: r.status === 0,
    detail: r.status === 0
      ? 'tsc --noEmit clean'
      : (r.stdout?.split('\n').slice(-15).join('\n') || r.stderr || `exit ${r.status}`),
  };
}

// PRYZM 3 Wave 1 tripwires (S78-WIRE) — the three "Stop the Bleed" gates.
// Spec: docs/archive/pryzm3-internal/04-PLAN-FORWARD/02-WAVE-1-TRIPWIRES.md §§2-4.
function makeTripwire(name, script) {
  return function () {
    const scriptPath = resolve(REPO_ROOT, script);
    if (!existsSync(scriptPath)) {
      return { name, pass: false, detail: `${script} missing`, configError: true };
    }
    // Invoke tsx directly (not via `pnpm exec`) to avoid pnpm engine-warning
    // lines polluting the script's stdout/stderr detail output.
    const tsxBin = resolve(REPO_ROOT, 'node_modules', '.bin', 'tsx');
    const r = run(tsxBin, [scriptPath], { silent: true });
    const cleanLines = (s) => (s || '')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('WARN ') && !l.includes('Unsupported engine'));
    const tail = (cleanLines(r.stdout).slice(-5).join('\n')
      || cleanLines(r.stderr).slice(-5).join('\n')
      || `exit ${r.status}`);
    return { name, pass: r.status === 0, detail: tail };
  };
}
const checkLocTripwire  = makeTripwire('loc-tripwire',  'tools/ga-gate/check-engine-bootstrap-loc.ts');
const checkCastTripwire = makeTripwire('cast-tripwire', 'tools/ga-gate/check-cast-count.ts');
const checkRafTripwire  = makeTripwire('raf-tripwire',  'tools/ga-gate/check-raf-count.ts');
// Wave 4 Track B PR 4.B.3 — L7 boundary lint (per-plugin violation ratchet
// against .ga-gate/baselines/l7-boundary-violations.json; 39 plugins, 279 files baseline).
const checkL7Boundary   = makeTripwire('boundary-lint-l7', 'tools/ga-gate/check-l7-boundary.ts');
// R11 tripwire — motion-gate coverage in L7.5 Canvas2D view managers.
// Spec: docs/archive/pryzm3-internal/04-PLAN-FORWARD/13-RISK-REGISTER.md §1 R11
// Any src/core/views/ file with DOM gesture handlers MUST call beginMotion() + endMotion().
// Structural resolution: Wave 8-11 (packages/input-host/ real).
const checkMotionGateCoverage = makeTripwire('motion-gate-coverage', 'tools/ga-gate/check-motion-gate-coverage.ts');

const CHECKS = [
  // PRYZM 3 Wave 1 tripwires — cheap, run first.
  checkLocTripwire,
  checkCastTripwire,
  checkRafTripwire,
  // Wave 4 Track B PR 4.B.3 — L7 boundary lint gate.
  checkL7Boundary,
  // R11 tripwire — motion-gate coverage (S88-WIRE 2026-05-01).
  checkMotionGateCoverage,
  // Existing PRYZM 2 GA-gate checks.
  checkWireupFloor,
  checkLint,
  checkGestureCoverage,
  checkVisualDiffSmoke,
  // Typecheck is the most expensive — keep it last so cheap checks fail fast.
  checkTypecheck,
];

// `--check <name>` filters to a single named check (or comma-separated list).
// Names: loc-tripwire | cast-tripwire | raf-tripwire | boundary-lint-l7
//        | motion-gate-coverage | wireup-floor | lint | gesture-coverage
//        | visual-diff-smoke | typecheck
//        | wave-1-exit (composite of the three Wave 1 tripwires)
//        | wave-4-exit (Wave 4 Track A + Track B combined gate)
//        | motion-gate-exit (raf-tripwire + motion-gate-coverage, R11 guard)
const COMPOSITES = {
  'wave-1-exit': ['loc-tripwire', 'cast-tripwire', 'raf-tripwire'],
  // Wave 4 exit gate — raf-tripwire (boolean #3 ratcheted to 1) + boundary-lint-l7
  // (PR 4.B.3 no-l7-boundary-violation rule + 279-file baseline ratchet).
  // typecheck is intentionally excluded: pre-existing WorkspaceSurfaceKind / WorkspaceModeController
  // TS errors in packages/runtime-composer/ are tracked separately (Wave 7 S84-WIRE scope);
  // including them in wave-4-exit would permanently break the gate before Wave 7 lands.
  // Full spec: docs/archive/pryzm3-internal/04-PLAN-FORWARD/08-WAVE-4-SLOT-TYPING-ROUTING.md §3 + §4
  'wave-4-exit': ['raf-tripwire', 'boundary-lint-l7'],
  // Wave 5 + ongoing — R11 motion-gate coverage guard (Canvas2D view managers).
  // Spec: docs/archive/pryzm3-internal/04-PLAN-FORWARD/13-RISK-REGISTER.md §1 R11
  // Composite for use during Wave 5+ reviews; retired when packages/input-host/ is real (Wave 8-11).
  'motion-gate-exit': ['raf-tripwire', 'motion-gate-coverage'],
};
function selectChecks(argv) {
  const i = argv.indexOf('--check');
  if (i === -1 || !argv[i + 1]) return null;
  const requested = argv[i + 1].split(',').flatMap((n) => COMPOSITES[n] ?? [n]);
  const NAME_TO_FN = {
    'loc-tripwire':           checkLocTripwire,
    'cast-tripwire':          checkCastTripwire,
    'raf-tripwire':           checkRafTripwire,
    // Wave 4 Track B PR 4.B.3 — L7 boundary lint gate.
    'boundary-lint-l7':       checkL7Boundary,
    // R11 tripwire — motion-gate coverage in L7.5 Canvas2D view managers.
    'motion-gate-coverage':   checkMotionGateCoverage,
    'wireup-floor':           checkWireupFloor,
    'lint':                   checkLint,
    'gesture-coverage':       checkGestureCoverage,
    'visual-diff-smoke':      checkVisualDiffSmoke,
    'typecheck':              checkTypecheck,
  };
  const selected = [];
  const unknown = [];
  for (const name of requested) {
    if (NAME_TO_FN[name]) selected.push(NAME_TO_FN[name]);
    else unknown.push(name);
  }
  if (unknown.length > 0) {
    console.error(`[ga-gate] unknown check(s): ${unknown.join(', ')}`);
    console.error(`[ga-gate] valid: ${Object.keys(NAME_TO_FN).join(', ')}, ${Object.keys(COMPOSITES).join(', ')}`);
    process.exit(2);
  }
  return selected;
}

function main() {
  const json = process.argv.includes('--json');
  const skipTypecheck = process.argv.includes('--skip-typecheck');
  const filtered = selectChecks(process.argv);
  let checks;
  if (filtered !== null) {
    checks = filtered;
  } else {
    checks = skipTypecheck ? CHECKS.filter((c) => c !== checkTypecheck) : CHECKS;
  }

  const results = [];
  let configError = false;
  for (const check of checks) {
    const result = check();
    results.push(result);
    if (result.configError) configError = true;
  }

  const failed = results.filter((r) => !r.pass);

  if (json) {
    console.log(JSON.stringify({
      pass: failed.length === 0,
      total: results.length,
      passed: results.length - failed.length,
      failed: failed.length,
      results,
    }, null, 2));
  } else {
    console.log('PRYZM 2 GA gate (Z.6 / S72 §26.1)');
    console.log('═══════════════════════════════════════════════════════════════');
    for (const r of results) {
      const tag = r.pass ? 'PASS' : 'FAIL';
      console.log(`  [${tag}] ${r.name.padEnd(22)} ${r.pass ? r.detail : ''}`);
      if (!r.pass) {
        console.log(r.detail.split('\n').map((l) => `         │ ${l}`).join('\n'));
      }
    }
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`  ${results.length - failed.length}/${results.length} checks passed`);
    if (failed.length > 0) console.log(`  ${failed.length} failure(s); see details above`);
  }

  if (configError) process.exit(2);
  process.exit(failed.length > 0 ? 1 : 0);
}

main();
