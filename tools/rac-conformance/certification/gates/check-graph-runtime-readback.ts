// ─── GATE · check-graph-runtime-readback ─────────────────────────────────────
//
// C71 §5.5 (GR-09) · C71 §5.8 (GR-18) · C70 §5 exit-code contract.
//
// ─── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
// GR-09 and GR-18 were both closed by a human running HARNESS 5
// (`__tests__/graphruntime.cert.ts`) once and writing "H5 16/16" into a cell.
// `bim30-status` therefore printed both as **CARRIED** — *"instrument is not a
// runnable gate: H5 graphruntime.cert"*. The harness is excellent and it is
// EXECUTED; what was missing is that no runner could resolve the sentence.
//
// This gate is the resolver. It does two things a cell cannot:
//   1. it RUNS the harness (it does not read yesterday's artefact and call that
//      a measurement), and
//   2. it asserts the specific verdicts GR-09 and GR-18 are about, so a harness
//      that still passes 11/11 while the wall writer goes dead cannot report the
//      rows green.
//
// ─── FRESHNESS IS A FLOOR, NOT A NICETY ──────────────────────────────────────
// The artefact is only read if it was written AFTER this process started. A gate
// that reads a stale `results/graphruntime.json` has measured nothing, and
// "0 problems" over nothing is the empty-seed lie the whole BIM 3.0 programme is
// about (contract.ts's own header states this rule). A missing or stale artefact
// exits 2 — MISCONFIGURED, never absorbable, never a pass.
//
// ─── VITEST'S EXIT CODE IS INFORMATIONAL; THE ARTEFACT IS THE VERDICT ────────
// This is `certify.ts`'s reasoning applied verbatim, and it cuts both ways: a
// red suite is a FINDING rather than breakage, and — more dangerously — a suite
// that fails to reach its cases can exit 0 having measured nothing. So the exit
// code is printed and never trusted; the floors below are what establish that
// the run happened.
//
// ─── THE ARMS ────────────────────────────────────────────────────────────────
//   A1 · every case's MEASURED verdict equals its DECLARED verdict. A drift in
//        either direction is a finding — a writer that stopped being reached and
//        a case whose declaration was quietly widened look identical otherwise.
//   A2 · GR-09 — the `CreateWallCommand — sitsOn` case must read REACHED. This
//        case was the harness's NEGATIVE CONTROL for as long as
//        `CreateWallCommand.ts` held zero `semanticGraphManager` calls; it is now
//        a positive one, and that inversion is exactly the row.
//   A3 · a `contains` case must read REACHED (C71 §5.2's first-party writer).
//   A4 · GR-18 / the probe's own integrity — the NEVER-CREATED negative control
//        must read NOT-REACHED. If it ever reads REACHED the probe is
//        manufacturing edges and **every other verdict in the run is void**;
//        that is a floor, not a finding, because a gate whose comparator is
//        broken has not established its subject.
//   A5 · zero `registrationFailures`. A command family that failed to register
//        is a case that could not run, and an unrun case must never read as an
//        absent edge.
//
// ─── WHAT THIS GATE DOES **NOT** ESTABLISH ───────────────────────────────────
// It inherits the harness's own not-measured block verbatim and adds nothing:
//   (a) GESTURE reachability — the harness constructs the commands itself. No
//       user gesture, tool, bus verb or panel is proven to reach them. L-847 (a
//       whole workbench shipping unreachable) lives in this gap. CE-05 owns it.
//   (b) PERSISTENCE — nothing here saves or reloads; `check-graph-persistence`
//       owns whether the edge survives serialize→deserialize.
//   (c) MULTI-CLIENT / MULTI-LEVEL — one client, one seeded level (CE-06).
//   (d) the relationship families no case names — untouched is not absent
//       (C71 §2.3: PARKED is a different state from gap).
//   (e) DELETE and MOVE propagation into the graph. Creation only.
//
// ─── EXECUTED CONTROLS, EVERY RUN (C70 §5.6) ─────────────────────────────────
// The harness carries its own positive and negative controls on every run. This
// gate additionally drives its ANALYSER over synthetic verdict tables: a table
// whose negative control reads REACHED must be rejected; a declared-REACHED case
// measuring NOT-REACHED must be a finding; a clean table must yield none. A
// failing control exits 2.

import { existsSync, readFileSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { reportGate, type Floor } from '../contract.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, '../../../..');
const CERT_DIR = resolve(REPO, 'tools/rac-conformance/certification');
const ARTEFACT = resolve(CERT_DIR, 'results/graphruntime.json');
const SUITE = '__tests__/graphruntime.cert.ts';

const GATE = 'check-graph-runtime-readback';

/** Vitest's own hook timeout for this suite is 600 s; this bounds the gate. */
const SUITE_TIMEOUT_MS = 220_000;

export interface CertRow { path: string; edgeType: string; declared: string; measured: string }

export interface Analysis {
  findings: string[];
  reached: number;
  notReached: number;
  negativeControlHonest: boolean;
  wallRowFound: boolean;
  containsRowFound: boolean;
}

/** Pure, so the synthetic controls below drive the same code the verdict uses. */
export function analyse(rows: readonly CertRow[], registrationFailures: readonly unknown[]): Analysis {
  const findings: string[] = [];

  for (const r of rows) {
    if (r.measured !== r.declared) {
      findings.push(`A1 ${r.path} [${r.edgeType}] declared ${r.declared} but MEASURED ${r.measured}`);
    }
  }

  const neg = rows.filter((r) => /NEGATIVE CONTROL/.test(r.path) && r.declared === 'NOT-REACHED');
  const negativeControlHonest = neg.length > 0 && neg.every((r) => r.measured === 'NOT-REACHED');

  const wall = rows.filter((r) => /CreateWallCommand/.test(r.path));
  const wallRowFound = wall.length > 0;
  if (wallRowFound && !wall.some((r) => r.measured === 'REACHED')) {
    findings.push('A2 GR-09 — no CreateWallCommand case reads REACHED: the wall create writes no graph edge that the live graph can be queried for');
  }

  const contains = rows.filter((r) => r.edgeType === 'contains');
  const containsRowFound = contains.length > 0;
  if (containsRowFound && !contains.some((r) => r.measured === 'REACHED')) {
    findings.push('A3 C71 §5.2 — no `contains` case reads REACHED: the first-party writer is not reached');
  }

  if (registrationFailures.length > 0) {
    findings.push(`A5 ${registrationFailures.length} command registration failure(s) — an unrun case is not an absent edge`);
  }

  return {
    findings,
    reached: rows.filter((r) => r.measured === 'REACHED').length,
    notReached: rows.filter((r) => r.measured === 'NOT-REACHED').length,
    negativeControlHonest,
    wallRowFound,
    containsRowFound,
  };
}

/* ─────────────────────────── executed controls ─────────────────────────── */

interface Control { id: string; what: string; pass: boolean }

const CLEAN: CertRow[] = [
  { path: 'CreateColumnCommand  (POSITIVE CONTROL)', edgeType: 'sitsOn', declared: 'REACHED', measured: 'REACHED' },
  { path: 'CreateFurnitureCommand — contains', edgeType: 'contains', declared: 'REACHED', measured: 'REACHED' },
  { path: 'CreateWallCommand — sitsOn (§GR-09)', edgeType: 'sitsOn', declared: 'REACHED', measured: 'REACHED' },
  { path: 'NEVER-CREATED ELEMENT  (NEGATIVE CONTROL)', edgeType: 'sitsOn', declared: 'NOT-REACHED', measured: 'NOT-REACHED' },
];

const swap = (i: number, measured: string): CertRow[] => CLEAN.map((r, k) => (k === i ? { ...r, measured } : r));

function selfTest(): Control[] {
  const clean = analyse(CLEAN, []);
  const wallDead = analyse(swap(2, 'NOT-REACHED'), []);
  const negLies = analyse(swap(3, 'REACHED'), []);
  const containsDead = analyse(swap(1, 'NOT-REACHED'), []);
  const noNeg = analyse(CLEAN.slice(0, 3), []);

  return [
    { id: 'H1', what: 'a clean verdict table yields 0 findings', pass: clean.findings.length === 0 },
    { id: 'H2', what: 'GR-09 — the wall case going NOT-REACHED is a finding', pass: wallDead.findings.some((f) => f.startsWith('A2')) },
    { id: 'H3', what: 'a declared/measured drift is a finding in its own right', pass: wallDead.findings.some((f) => f.startsWith('A1')) },
    { id: 'H4', what: 'the negative control reading REACHED is REJECTED — the probe would be manufacturing edges', pass: !negLies.negativeControlHonest },
    { id: 'H5c', what: 'a dead `contains` writer is a finding', pass: containsDead.findings.some((f) => f.startsWith('A3')) },
    { id: 'H6', what: 'a table with NO negative control is not treated as honest', pass: !noNeg.negativeControlHonest },
    { id: 'H7', what: 'registration failures are a finding — an unrun case is not an absent edge', pass: analyse(CLEAN, ['CreateStairCommand']).findings.some((f) => f.startsWith('A5')) },
    { id: 'H8', what: 'the clean table locates both the wall case and a contains case', pass: clean.wallRowFound && clean.containsRowFound },
  ];
}

/* ─────────────────────────── main ─────────────────────────── */

function main(): void {
  const controls = selfTest();
  const controlsPassed = controls.filter((x) => x.pass).length;

  // 1 s slack for filesystem clock skew — certify.ts uses the same allowance.
  const notBefore = Date.now() - 1000;

  // `shell: true` is REQUIRED on win32: Node refuses to spawnSync a .cmd shim
  // directly since the CVE-2024-27980 hardening, and this repo's founder runs
  // Windows. L-774 is what a gate that only spawns on the CI runner looks like.
  const r = spawnSync('npx', ['vitest', 'run', SUITE], {
    cwd: CERT_DIR, encoding: 'utf8', shell: true, timeout: SUITE_TIMEOUT_MS,
    maxBuffer: 64 * 1024 * 1024, env: process.env,
  });
  const spawned = r.status !== null && !r.error ? 1 : 0;

  let fresh = 0;
  let rows: CertRow[] = [];
  let regFailures: unknown[] = [];
  let generatedAt = 'ABSENT';
  if (existsSync(ARTEFACT)) {
    const st = statSync(ARTEFACT);
    if (st.mtimeMs >= notBefore) fresh = 1;
    try {
      const j = JSON.parse(readFileSync(ARTEFACT, 'utf8'));
      rows = Array.isArray(j.rows) ? j.rows : [];
      regFailures = Array.isArray(j.registrationFailures) ? j.registrationFailures : [];
      generatedAt = String(j.generatedAt ?? 'UNSTAMPED');
    } catch { /* leaves rows empty; the floor below is what notices */ }
  }

  const a = analyse(rows, regFailures);

  const lines: string[] = [
    `harness ${SUITE} spawned in ${CERT_DIR}`,
    `vitest exited ${r.status === null ? 'NULL (spawn failure or timeout)' : r.status} — INFORMATIONAL. The artefact is the verdict (certify.ts §1).`,
    `artefact generatedAt ${generatedAt} · fresh(this run) ${fresh ? 'YES' : 'NO'} · ${rows.length} case(s)`,
    '',
    ...rows.map((x) => `   ${x.measured === x.declared ? '✓' : '❌'} ${x.path} [${x.edgeType}] declared=${x.declared} measured=${x.measured}`),
    '',
    `REACHED ${a.reached} · NOT-REACHED ${a.notReached} · negative control honest: ${a.negativeControlHonest ? 'YES' : 'NO'}`,
    '',
    `executed controls (C70 §5.6 — an arm never watched failing is UNPROVEN): ${controlsPassed}/${controls.length}`,
    ...controls.map((x) => `   ${x.pass ? '✓' : '❌'} ${x.id} ${x.what}`),
    '',
    'STILL UNPROVEN — NOT MEASURED HERE, inherited verbatim from the harness:',
    '   GESTURE reachability (no user gesture is driven; L-847 lives here; CE-05 owns it) ·',
    '   PERSISTENCE of these edges (check-graph-persistence owns it) · MULTI-CLIENT and',
    '   MULTI-LEVEL (CE-06 unchanged) · the relationship families no case names ·',
    '   DELETE and MOVE propagation into the graph.',
  ];

  const floors: Floor[] = [
    { what: 'executed controls passed', measured: controlsPassed, min: controls.length },
    { what: 'harness process spawned and exited', measured: spawned, min: 1 },
    { what: 'results artefact written BY THIS RUN (a stale artefact is not a measurement)', measured: fresh, min: 1 },
    { what: 'cases in the artefact', measured: rows.length, min: 5 },
    { what: 'cases measuring REACHED (green must be reachable — L-716)', measured: a.reached, min: 1 },
    { what: 'cases measuring NOT-REACHED (the probe must be able to report absence)', measured: a.notReached, min: 1 },
    { what: 'NEVER-CREATED negative control reads NOT-REACHED (else every verdict is void)', measured: a.negativeControlHonest ? 1 : 0, min: 1 },
    { what: 'GR-09 CreateWallCommand case located', measured: a.wallRowFound ? 1 : 0, min: 1 },
    { what: '`contains` case located', measured: a.containsRowFound ? 1 : 0, min: 1 },
  ];

  process.exit(reportGate({ gate: GATE, floors, lines, findings: a.findings.length, declared: 0, findingNames: a.findings }));
}

main();
