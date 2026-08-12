// ─── certify.ts — the CI entry point for BIM 2.0 certification ───────────────
//
// Criterion C10 of docs/03-execution/plans/BIM20-ACCEPTANCE-10-OF-10.md is two
// claims, and only one of them is about YAML:
//
//   (a) "the certification runs in CI"        — the workflow job.
//   (b) "and cannot print a pass on a broken run" — THIS FILE.
//
// (b) is the load-bearing half, and it is why the runner does not simply shell
// out to `vitest` from the workflow. Vitest's exit code cannot answer C10:
//
//   * The cert suites are RED TODAY BY DESIGN. They use `expect.soft` so the
//     whole table prints, and every red `it` is a MEASURED round-trip divergence
//     — a FINDING, not breakage. Treating vitest's non-zero exit as "broken"
//     would make the honest state of the estate indistinguishable from a crash.
//   * And the converse, which is the dangerous direction: a suite that seeds
//     NOTHING is GREEN. Every comparator correctly reports "nothing to compare",
//     every row reads UNPROVEN, the FAILED tally is 0, vitest exits 0. That run
//     is maximally broken and maximally green.
//
// So the runner takes a timestamp, runs the suites, and then grades the ARTEFACT
// they wrote against declared floors (floors.ts) before anything is allowed to
// call the run a pass. Order of authority, strongest first:
//
//   MISCONFIGURED (2)  — floors unmet, or the artefact is missing/stale
//   RATCHET (3)        — more FAILED rows than the shrink-only ledger declares
//   DECLARED (1)       — findings at or under the ledger
//   CLEAN (0)
//
// Usage:
//   npx tsx certify.ts              run the suites, then grade
//   npx tsx certify.ts --no-run     grade the artefacts already on disk
//   npx tsx certify.ts --gates-only run only the Wave-3 gates

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFloors, SUITE_FLOORS, type SuiteArtefact } from './floors.js';
import {
  EXIT_CLEAN, EXIT_DECLARED, EXIT_MISCONFIGURED, EXIT_RATCHET_EXCEEDED, type ExitCode,
} from './contract.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RESULTS = resolve(__dirname, 'results');
const RATCHET_FILE = resolve(__dirname, 'cert-ratchet.json');

interface Ratchet {
  '//': string[];
  measuredAt: string;
  maxFailedRows: Record<string, number>;
}

const argv = process.argv.slice(2);
const noRun = argv.includes('--no-run');
const gatesOnly = argv.includes('--gates-only');

const worst = (a: ExitCode, b: ExitCode): ExitCode => {
  const rank: Record<number, number> = { 0: 0, 1: 1, 3: 2, 2: 3 };
  return rank[a] >= rank[b] ? a : b;
};

let exitCode: ExitCode = EXIT_CLEAN;
const summary: Record<string, unknown> = { startedAt: new Date().toISOString() };

// ── 1. Run the suites ────────────────────────────────────────────────────────
// The stamp is taken BEFORE the run and every artefact must be newer than it.
// This is what makes a crashed suite fail instead of silently re-publishing the
// last good file.
const notBefore = Date.now() - 1000; // 1 s slack for filesystem clock skew
let vitestStatus: number | null = null;

if (!noRun && !gatesOnly) {
  console.log('── running the certification suites (red = findings, not breakage) ──');
  // `shell: true` is REQUIRED on win32 — Node refuses to spawnSync a .cmd shim
  // directly (EINVAL) since the CVE-2024-27980 hardening, and this repo's founder
  // runs Windows. A gate that only spawns on the CI runner is the L-774 shape:
  // "the runner could not spawn on win32 and reported 25/25 FAILED to anyone who
  // tried". Arguments are fixed literals here, so there is no injection surface.
  const r = spawnSync(
    'npx',
    ['vitest', 'run', '__tests__/persistence.cert.ts', '__tests__/undoredo.cert.ts', '__tests__/regenerable.cert.ts'],
    { cwd: __dirname, stdio: 'inherit', env: process.env, shell: true },
  );
  vitestStatus = r.status;
  if (r.error) console.error('vitest spawn error: ' + String(r.error));
  console.log(`── vitest exited ${r.status} (informational — the verdict is the ARTEFACT below) ──`);
}
summary.vitestStatus = vitestStatus;

// ── 2. Floors ────────────────────────────────────────────────────────────────
const artefacts: Record<string, SuiteArtefact | null> = {};
const floorReport: Record<string, unknown> = {};

if (!gatesOnly) {
  for (const suite of ['persistence', 'undoredo'] as const) {
    const p = resolve(RESULTS, SUITE_FLOORS[suite].file);
    const art = existsSync(p) ? (JSON.parse(readFileSync(p, 'utf8')) as SuiteArtefact) : null;
    artefacts[suite] = art;
    const { floors, notes } = readFloors(suite, art, noRun ? 0 : notBefore);
    const unmet = floors.filter((f) => f.measured < f.min);
    floorReport[suite] = { floors, notes, unmet: unmet.length };

    console.log(`\n── FLOORS · ${suite} ${'─'.repeat(40)}`);
    for (const f of floors) {
      console.log(`   ${f.measured < f.min ? '❌' : '✓ '} ${f.what}: measured ${f.measured}, min ${f.min}`);
    }
    for (const n of notes) console.log('   ! ' + n);
    if (unmet.length > 0) {
      console.log(
        `   → [2] MISCONFIGURED — ${suite} did not establish its subject. ` +
        'A comparator over an empty or stale subject reports "0 divergences" and means nothing; ' +
        'that reading is REFUSED here and is NEVER absorbable as debt.',
      );
      exitCode = worst(exitCode, EXIT_MISCONFIGURED);
    } else {
      console.log(`   → floors met — the ${suite} verdict below is over a real, freshly measured subject.`);
    }
  }
}

// ── 3. The shrink-only FAILED-row ratchet ────────────────────────────────────
// WHY A RATCHET AND NOT A HARD ZERO: the suites report 20 FAILED rows today
// (8 persistence + 12 undo/redo, measured 2026-08-11 20:35 UTC). Those are real
// defects — F-1 identity re-minting, F-2 stair/beam id loss, F-3 the 15 mm drift
// — and every one of them lives in code owned by other tracks. A gate that
// blocked on them would block the commits that fix them, which is the L-247
// failure mode this repo has already paid for once.
//
// WHY STALENESS DOES *NOT* FAIL HERE, unlike a ga-gate boolean baseline: this is
// a COUNTER over a suite five agents are actively repairing. Making "you fixed
// something" a build failure would be perverse. A drop prints the exact new
// number and the instruction to lower the ledger; only a RISE exits 3.
if (!gatesOnly && existsSync(RATCHET_FILE)) {
  const ratchet = JSON.parse(readFileSync(RATCHET_FILE, 'utf8')) as Ratchet;
  const measured: Record<string, number> = {};
  let ratchetExceeded = false;
  console.log(`\n── RATCHET · FAILED rows (shrink-only) ${'─'.repeat(26)}`);
  for (const suite of ['persistence', 'undoredo'] as const) {
    const rows = artefacts[suite]?.rows ?? [];
    const failed = rows.filter((r) => r.status === 'FAILED').length;
    measured[suite] = failed;
    const max = ratchet.maxFailedRows[suite];
    if (typeof max !== 'number') {
      console.log(`   ❌ ${suite}: no declared level in cert-ratchet.json — an undeclared subject is MISCONFIGURED.`);
      exitCode = worst(exitCode, EXIT_MISCONFIGURED);
      continue;
    }
    if (failed > max) {
      console.log(`   ❌ ${suite}: ${failed} FAILED rows against a declared max of ${max} — RATCHET EXCEEDED.`);
      ratchetExceeded = true;
    } else if (failed < max) {
      console.log(`   ✓  ${suite}: ${failed} FAILED rows, BELOW the declared max of ${max}.`);
      console.log(`      LOWER IT: set maxFailedRows.${suite} = ${failed} in cert-ratchet.json, in the commit that earned it.`);
    } else {
      console.log(`   ✓  ${suite}: ${failed} FAILED rows, exactly at the declared level.`);
      exitCode = worst(exitCode, EXIT_DECLARED);
    }
  }
  summary.failedRows = measured;
  if (ratchetExceeded) exitCode = worst(exitCode, EXIT_RATCHET_EXCEEDED);
}

// ── 4. The Wave-3 gates ──────────────────────────────────────────────────────
// §BIM30-PHASE-0R — check-propagation-trackers-reach added 2026-08-12. It is the
// first gate over the BESPOKE per-pair wiring (DoorDependencyTracker,
// WindowDependencyTracker, cascade-delete, RoomTopologyObserver) — the
// propagation that actually works in this product, and which the BIM 3.0 gap
// register's coverage matrix found to be completely ungated. Level 4 of the
// maturity ladder rests on it; until now nothing would have told us if it broke.
// §BIM30-R3 — check-preview-purity (G-REASON-01) added 2026-08-12. The first gate over the
// consequence-preview surface: it drives a REAL wall.move preview and asserts stores/events/
// undo/dirty are all unchanged, each with a positive control proving the check can observe a
// violation and a negative control (an impure preview) proving the checker flags one. Lands
// GREEN today — preview is pure — so it carries no ratchet/newly-measured entry.
// §BIM30-R4 — check-execution-plan-agreement (G-REASON-03) added 2026-08-12. The plan doc's
// R4 exit condition verbatim: "G-REASON-03 lands (red or green — honest either way) with its
// ledger." It drives preview→plan→execute→report on the REAL wall move (bus →
// plugins/wall wall.updateBaseline → commandManager bridge → geometry WallStore) through the
// production ConsequenceExecutionService, with a positive control (a planner-blind mutation
// between plan and execute MUST be reported as plan-fidelity-divergence, not absorbed), a
// negative control (a planner-visible mutation MUST refuse binding as typed PLAN_STALE while
// the command still executes plan-less), and the typed-absence clause for plan-less dispatch.
// §ROOM-IDENTITY-BY-STRUCTURE — check-room-identity-survives-wall-move added 2026-08-12.
// The first gate over ROOM identity under EDITING (check-identity-roundtrip covers identity
// under SAVE/RELOAD; nothing covered identity under a wall move). It drives the REAL
// RoomDetectionEngine through detect → stamp semantics → move a bounding wall → re-detect →
// merge, and asserts id/name/roomNumber/occupancyType/finishes/ifcData.guid/revitId survive.
// It pins closed a MEASURED cliff: semantics were re-attached by centroid proximity alone
// within CENTROID_MATCH_RADIUS = 2.0 m, so a 4.0 m wall move (2.0 m centroid shift) RE-MINTED
// the room's uuid and dropped every semantic field — including ifcData.guid, which ADR-0319
// grants NO TOLERANCE EVER. Carries a POSITIVE CONTROL every run (the pre-fix centroid-only
// matcher fed to the same checker, which must report 7 lost fields or the gate exits 2) and
// two anti-over-matching controls (a genuine SPLIT must still yield two rooms; a disjoint
// room 100 m away must not be claimed). Lands GREEN today, so it carries no ratchet entry.
// §BIM30-R5 — check-consequence-report-completeness (G-REASON-06) added 2026-08-12. The plan
// doc's R5 exit condition verbatim: "G-REASON-06 completeness per declared contract, for
// `wall.move`." It measures BOTH surfaces R5 requires, because a complete report nobody can
// see does not satisfy R5: the REPORT (does the object the R4 executor produces carry every
// section R5 names — changed/excluded/undetermined/regenerated/refused/validation/provenance/
// predicted-vs-actual, with the plan carried whole rather than re-inferred) and the RENDERER
// (does the production ConsequenceReportView actually SHOW them — STR-06 §2 makes a divergence
// nobody can see a defect, not a nuance). It drives the real loop preview → plan → execute →
// SINK → the PRODUCTION view, and reads the DOM that view drew. Three controls run on EVERY
// invocation: a divergence must render visibly with its ids (positive); plan-time UNDETERMINED
// must render AS undetermined with reality beside it, and an unmeasured channel must NOT print
// a zero (positive); a renderer handed a stale or plan-less execution must SAY it has no report
// rather than draw a confident blank (negative). Lands GREEN today — hard-0, no ledger entry.
const gates = ['check-identity-roundtrip', 'check-propagation-reaches', 'check-derived-regenerable', 'check-propagation-trackers-reach', 'check-preview-purity', 'check-execution-plan-agreement', 'check-room-identity-survives-wall-move', 'check-consequence-report-completeness'];
const gateCodes: Record<string, number | null> = {};
console.log(`\n── WAVE-3 GATES ${'─'.repeat(48)}`);
for (const g of gates) {
  const p = resolve(__dirname, 'gates', g + '.ts');
  if (!existsSync(p)) {
    // L-812: a gate whose SCRIPT FILE is missing is never excusable as debt.
    console.log(`   ❌ ${g}: SCRIPT FILE MISSING at ${p} — MISCONFIGURED, never absorbable.`);
    gateCodes[g] = null;
    exitCode = worst(exitCode, EXIT_MISCONFIGURED);
    continue;
  }
  const r = spawnSync('npx', ['tsx', p], { cwd: __dirname, stdio: 'inherit', env: process.env, shell: true });
  // A gate that could not even be SPAWNED has measured nothing. `?? 2` files that
  // as MISCONFIGURED rather than letting an absent status read as clean — L-774
  // is the fossil of a runner that failed to spawn and was believed anyway.
  const code = (r.status ?? 2) as ExitCode;
  gateCodes[g] = code;
  exitCode = worst(exitCode, code);
}
summary.gates = gateCodes;
summary.exitCode = exitCode;
summary.finishedAt = new Date().toISOString();

writeFileSync(resolve(RESULTS, 'certify.json'), JSON.stringify({ ...summary, floors: floorReport }, null, 2));

const NAME: Record<number, string> = {
  0: 'CLEAN', 1: 'DECLARED-LEVEL', 2: 'MISCONFIGURED (never absorbable)', 3: 'RATCHET EXCEEDED (never absorbable)',
};
console.log(`\n════ CERTIFY: exit ${exitCode} — ${NAME[exitCode]} ════`);
if (exitCode === EXIT_MISCONFIGURED) {
  console.log('The run could not establish its subject. This is NOT a pass and NOT a finding —');
  console.log('it is the harness being broken, and it is reported separately for exactly that reason.');
}
process.exit(exitCode);
