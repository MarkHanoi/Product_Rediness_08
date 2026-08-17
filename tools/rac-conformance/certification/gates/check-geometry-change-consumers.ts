// ─── GATE · check-geometry-change-consumers ──────────────────────────────────
//
// C72 §1.1 (PR-10, PR-12) · C70 §5 exit-code contract.
//
// ─── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
// Two register rows say the same thing about two different consumers of a
// geometry change:
//
//   PR-10  "roof → walls-beneath propagation is MEASURED-ABSENT in both
//           directions"           deciding instrument: *the roof-clash detector
//                                 + its suites*
//   PR-12  "schedules have no geometry subscription — open panels show stale
//           areas"                deciding instrument: *the staleness suites*
//
// Neither sentence resolves to a gate, so `bim30-status` printed both CARRIED —
// status inherited from prose, not evidence at HEAD.
//
// ⚠ TWO ROWS, ONE EXIT CODE — stated so nobody has to discover it. A red arm on
// either side reddens both rows. That coupling is deliberately CONSERVATIVE: it
// can only make a row read WORSE than its own arm, never better, and this
// register's whole doctrine is that an unmeasured green must never be banked.
// If the two ever need to move independently, split the file; do not loosen it.
//
// ─── THE ARMS ────────────────────────────────────────────────────────────────
//   P1 · PR-10 the detector EXISTS as a pure module with an exported entry point.
//   P2 · PR-10 ⭐ REACHABILITY, TWO HOPS. `checkAndAnnounceRoofWallClashes` must
//        be called from a production module, AND that module must itself be
//        called from the engine launcher. One hop is not enough: a caller that is
//        never called is the same dead code with an extra file in front of it,
//        and this corpus has shipped precisely that (L-847).
//   P3 · PR-10 the cited suite executes green.
//   P4 · PR-12 ⭐ the schedule panel subscribes to a geometry-event FAMILY, not to
//        the one event a fixture happened to dispatch. The subject file records
//        why in its own words: only `bim-slab-updated` was a real production
//        event, so subscribing to just that *"would have turned the test green
//        while leaving every wall, door, roof, stair and column schedule exactly
//        as stale — a fix shaped to the fixture rather than to the defect"*
//        (C74 §3.4). The arm therefore floors the family SIZE and requires the
//        listeners to be actually attached, not merely declared in an array.
//   P5 · PR-12 the cited staleness suite executes green.
//
// ─── WHAT THIS GATE DOES **NOT** ESTABLISH ───────────────────────────────────
//   • That a clash, once detected, REACHES A USER. P2 proves the announcer is
//     wired into the level-rebuild path; whether the report is rendered anywhere
//     a person looks is not measured, and PR-10's "in both directions" wording
//     covers more than this gate reads.
//   • That the schedule's recomputed numbers are CORRECT — the suite owns that,
//     and this gate is exactly as strong as it is.
//   • That the geometry events are DISPATCHED on every mutation path. P4 measures
//     the listener side only; a mutation that fires no event is invisible here and
//     is `check-propagation-reaches`' territory.
//
// ─── EXECUTED CONTROLS, EVERY RUN (C70 §5.6) ─────────────────────────────────
// The call-site detector is driven over synthetics: a call that exists only in a
// comment earns nothing, a definition is not counted as a call, a real call is.
// The family detector must reject a single-event subscription — PR-12's exact
// fixture-shaped trap — and accept a real family.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { reportGate, type Floor } from '../contract.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, '../../../..');
const GATE = 'check-geometry-change-consumers';

const DETECTOR = 'packages/geometry-roof/src/pure/roofWallClash.ts';
const ANNOUNCER = 'apps/editor/src/engine/roofWallClashAnnouncer.ts';
const ANNOUNCE_FN = 'checkAndAnnounceRoofWallClashes';
const LAUNCHER = 'apps/editor/src/engine/engineLauncher.ts';
const ROOF_SUITE = '__tests__/roofWallClash.test.ts';
const ROOF_PKG = '@pryzm/geometry-roof';

const PANEL = 'apps/editor/src/ui/SchedulePanel/SchedulePanel.ts';
const PANEL_FAMILY = 'SCHEDULE_GEOMETRY_EVENTS';
const SCHED_SPEC = 'apps/editor/src/engine/__tests__/schedulePanelGeometryStaleness.spec.ts';

/** PR-12's own note: one event is a fix shaped to the fixture. Demand a family. */
const MIN_FAMILY = 6;
const SUITE_TIMEOUT_MS = 170_000;
const SCAN_ROOTS = ['apps/editor/src', 'packages', 'plugins'];

/* ─────────────────────────── primitives ─────────────────────────── */

export function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

/** CALL sites of `fn`, excluding its own definition. Comments earn nothing. */
export function callSites(src: string, fn: string): number {
  const code = stripComments(src);
  const all = (code.match(new RegExp(`\\b${fn}\\s*\\(`, 'g')) ?? []).length;
  const defs = (code.match(new RegExp(`\\bfunction\\s+${fn}\\s*\\(`, 'g')) ?? []).length;
  return Math.max(0, all - defs);
}

/** Size of a `const NAME = [ … ] as const` string array, or 0. */
export function familySize(src: string, name: string): number {
  const m = stripComments(src).match(new RegExp(`const\\s+${name}\\s*=\\s*\\[([\\s\\S]*?)\\]`));
  if (!m) return 0;
  return (m[1].match(/'([^']+)'|"([^"]+)"/g) ?? []).length;
}

/** Are the family members actually attached as listeners? */
export function familyIsAttached(src: string, name: string): boolean {
  const code = stripComments(src);
  return new RegExp(`for\\s*\\([^)]*\\bof\\s+${name}\\s*\\)[\\s\\S]{0,200}addEventListener`).test(code)
    || new RegExp(`${name}\\s*\\.\\s*forEach[\\s\\S]{0,200}addEventListener`).test(code);
}

function walk(dir: string, hit: (p: string) => void): void {
  const SKIP = new Set(['node_modules', 'dist', 'build', '.git', 'coverage', '.turbo', 'results', 'out']);
  let entries: string[];
  try { entries = readdirSync(dir); } catch { return; }
  for (const name of entries) {
    if (SKIP.has(name)) continue;
    const p = resolve(dir, name);
    let st; try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) walk(p, hit); else hit(p);
  }
}

/** Production files (no tests) that CALL `fn`, excluding `exclude`. */
function productionCallers(fn: string, exclude: readonly string[]): string[] {
  const out: string[] = [];
  for (const root of SCAN_ROOTS) {
    const abs = resolve(REPO, root);
    if (!existsSync(abs)) continue;
    walk(abs, (p) => {
      if (!/\.tsx?$/.test(p) || /\.d\.ts$/.test(p)) return;
      const rel = relative(REPO, p).replace(/\\/g, '/');
      if (exclude.includes(rel)) return;
      if (/(^|\/)__tests__\//.test(rel) || /\.(test|spec|cert)\.tsx?$/.test(rel)) return;
      if (callSites(readFileSync(p, 'utf8'), fn) > 0) out.push(rel);
    });
  }
  return out;
}

/* ─────────────────────────── executed controls ─────────────────────────── */

interface Control { id: string; what: string; pass: boolean }

function selfTest(): Control[] {
  const single = `const E = ['bim-slab-updated'] as const;\nfor (const e of E) { window.addEventListener(e, f); }`;
  const family = `const E = ['a','b','c','d','e','f','g'] as const;\nfor (const e of E) { window.addEventListener(e, f); }`;
  const declaredOnly = `const E = ['a','b','c','d','e','f','g'] as const;\nconsole.log(E.length);`;
  return [
    { id: 'G1', what: 'a call named only in a comment earns nothing', pass: callSites(`// one day we call ${ANNOUNCE_FN}(params)`, ANNOUNCE_FN) === 0 },
    { id: 'G2', what: 'a definition is not counted as a call', pass: callSites(`export function ${ANNOUNCE_FN}(p: P): R[] { return []; }`, ANNOUNCE_FN) === 0 },
    { id: 'G3', what: 'a real call site IS counted', pass: callSites(`export function ${ANNOUNCE_FN}(p: P) {}\n${ANNOUNCE_FN}({ a });`, ANNOUNCE_FN) === 1 },
    { id: 'G4', what: 'PR-12 trap — a ONE-event subscription is below the family floor', pass: familySize(single, 'E') < MIN_FAMILY },
    { id: 'G5', what: 'a real family clears the floor and reads as attached', pass: familySize(family, 'E') >= MIN_FAMILY && familyIsAttached(family, 'E') },
    { id: 'G6', what: 'a family DECLARED but never attached is not credited', pass: !familyIsAttached(declaredOnly, 'E') },
  ];
}

/* ─────────────────────────── main ─────────────────────────── */

/**
 * `shell: true` is REQUIRED on win32 (Node refuses to spawnSync a .cmd shim since
 * the CVE-2024-27980 hardening) and this repo's founder runs Windows.
 *
 * ⚠ `npx vitest` is NOT usable inside `packages/geometry-roof`: the package has no
 * local vitest, so npx resolves a DOUBLED path (`node_modules/node_modules/.pnpm/…`)
 * and dies MODULE_NOT_FOUND before collecting a single test — exit 1, which a
 * careless gate would report as "the suite failed". That is the L-774 shape (a
 * runner that could not spawn, believed anyway). The workspace-aware spawn is
 * `pnpm --filter`, which is also what CLAUDE.md documents for per-package suites.
 */
function runSuite(bin: string, args: string[], cwd: string): { status: number | null; out: string } {
  const r = spawnSync(bin, args, {
    cwd, encoding: 'utf8', shell: true, timeout: SUITE_TIMEOUT_MS,
    maxBuffer: 64 * 1024 * 1024, env: process.env,
  });
  return { status: r.error ? null : r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

function main(): void {
  const controls = selfTest();
  const controlsPassed = controls.filter((x) => x.pass).length;
  const findings: string[] = [];

  const read = (rel: string): string => (existsSync(resolve(REPO, rel)) ? readFileSync(resolve(REPO, rel), 'utf8') : '');

  // P1/P2 — the detector, and the two-hop wiring chain.
  const detectorSrc = read(DETECTOR);
  const announcerSrc = read(ANNOUNCER);
  const launcherSrc = read(LAUNCHER);
  const hop1 = productionCallers(ANNOUNCE_FN, [ANNOUNCER]);
  const hop2 = hop1.filter((c) => {
    const fn = c.split('/').pop()!.replace(/\.tsx?$/, '');
    return new RegExp(`\\b${fn}\\s*\\(`).test(stripComments(launcherSrc));
  });

  if (!detectorSrc) findings.push(`P1 the roof↔wall clash detector is missing at ${DETECTOR}`);
  if (hop1.length === 0) findings.push(`P2 ${ANNOUNCE_FN} has ZERO production callers — the detector is authored but unwired`);
  else if (hop2.length === 0) findings.push(`P2 ${ANNOUNCE_FN} is called only from [${hop1.join(', ')}], none of which the engine launcher calls — a caller that is never called is dead code with an extra file in front of it`);

  // P4 — the schedule panel's geometry-event family.
  const panelSrc = read(PANEL);
  const fam = familySize(panelSrc, PANEL_FAMILY);
  const attached = familyIsAttached(panelSrc, PANEL_FAMILY);
  if (fam === 0) findings.push(`P4 ${PANEL} declares no ${PANEL_FAMILY} — schedules have no geometry subscription`);
  else if (fam < MIN_FAMILY) findings.push(`P4 ${PANEL_FAMILY} carries ${fam} event(s), below the family floor of ${MIN_FAMILY} — a fix shaped to the fixture leaves every other element type stale (C74 §3.4)`);
  if (fam > 0 && !attached) findings.push(`P4 ${PANEL_FAMILY} is DECLARED but never attached with addEventListener — a declared subscription is not a subscription`);

  // P3 / P5 — execute both cited suites.
  const roof = runSuite('pnpm', ['--filter', ROOF_PKG, 'exec', 'vitest', 'run', ROOF_SUITE], REPO);
  const sched = runSuite('npx', ['vitest', 'run', SCHED_SPEC], REPO);
  for (const [row, name, s] of [['P3', 'roof-clash', roof], ['P5', 'schedule-staleness', sched]] as const) {
    if (s.status === null) continue; // the floor below catches a failed spawn
    if (/MODULE_NOT_FOUND|Cannot find module/.test(s.out)) {
      // A runner that could not spawn has measured NOTHING. Reporting that as a
      // failing suite would be the empty-seed lie with a red tick on it.
      findings.push(`${row} the ${name} runner could not resolve its test framework — this run MEASURED NOTHING and is not a suite failure`);
      continue;
    }
    if (s.status !== 0) findings.push(`${row} the cited ${name} suite exited ${s.status}`);
    if (/No test files found/.test(s.out)) findings.push(`${row} vitest matched NO test files for ${name} — the run measured nothing`);
  }
  const tally = (s: { out: string }): string => s.out.match(/Tests\s+(\d+) passed/)?.[1] ?? '?';

  const lines = [
    `P1  detector ${DETECTOR} — ${detectorSrc ? 'present' : 'MISSING'}`,
    `P2  ${ANNOUNCE_FN} production callers: ${hop1.length ? hop1.join(', ') : 'NONE'}`,
    `      of those, called by ${LAUNCHER}: ${hop2.length ? hop2.join(', ') : 'NONE'}`,
    `      announcer module ${ANNOUNCER} — ${announcerSrc ? 'present' : 'MISSING'}`,
    `P3  ${ROOF_PKG} ${ROOF_SUITE} — vitest exited ${roof.status ?? 'NULL'} · ${tally(roof)} test(s) passed`,
    `P4  ${PANEL_FAMILY}: ${fam} event(s) (floor ${MIN_FAMILY}) · attached via addEventListener: ${attached ? 'YES' : 'NO'}`,
    `P5  ${SCHED_SPEC} — vitest exited ${sched.status ?? 'NULL'} · ${tally(sched)} test(s) passed`,
    '',
    `executed controls (C70 §5.6 — an arm never watched failing is UNPROVEN): ${controlsPassed}/${controls.length}`,
    ...controls.map((x) => `   ${x.pass ? '✓' : '❌'} ${x.id} ${x.what}`),
    '',
    'NOT MEASURED HERE: that a detected clash REACHES A USER (P2 proves the announcer',
    'is wired into the level-rebuild path, not that the report is rendered anywhere a',
    'person looks — PR-10\'s "in both directions" covers more than this gate reads) ·',
    'that the recomputed schedule numbers are CORRECT (the suite owns that) · that the',
    'geometry events are DISPATCHED on every mutation path — P4 reads the LISTENER side',
    'only, and a mutation that fires no event is invisible here (check-propagation-reaches).',
  ];

  const floors: Floor[] = [
    { what: 'executed controls passed', measured: controlsPassed, min: controls.length },
    { what: 'subject files located (detector, announcer, launcher, panel)', measured: [detectorSrc, announcerSrc, launcherSrc, panelSrc].filter(Boolean).length, min: 4 },
    { what: 'cited suites located', measured: [resolve(REPO, 'packages/geometry-roof', ROOF_SUITE), resolve(REPO, SCHED_SPEC)].filter(existsSync).length, min: 2 },
    { what: 'suite processes spawned and exited', measured: [roof, sched].filter((s) => s.status !== null).length, min: 2 },
    { what: 'scan roots present', measured: SCAN_ROOTS.filter((r) => existsSync(resolve(REPO, r))).length, min: 3 },
  ];

  process.exit(reportGate({ gate: GATE, floors, lines, findings: findings.length, declared: 0, findingNames: findings }));
}

main();
