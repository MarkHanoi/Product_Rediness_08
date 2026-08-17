// ─── GATE · check-gate-residency ─────────────────────────────────────────────
//
// C71 §6 (GR-11) · C72 §6 (PR-08) · C73 §5 (GE-07) · C74 §6 (CO-11) ·
// C75 §6 (PV-07) · tracker §5/§5.1 · C70 §5 exit-code contract.
//
// ─── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
// Five rows of the BIM 3.0 register make the SAME claim in five vocabularies:
//
//   GR-11  "all three C71 gates are unbuilt at HEAD"
//   PR-08  "check-prevstate-contract and check-suppression-is-reversible are
//           specified and NOT BUILT"
//   GE-07  "three C73 gates specified and NOT BUILT"
//   CO-11  "all three C74 gates are UNBUILT"
//   PV-07  "all three C75 gates are UNBUILT"
//
// Each was closed by a human running the gates once and writing the row green.
// `bim30-status` therefore prints all five as **CARRIED** — their deciding
// instrument is "the three gates themselves", which is not a name any runner can
// resolve. A claim of the form *"the control exists"* that is itself checked by
// nothing is the L-809 shape precisely: `eslint.config.js` set a boundary rule to
// `'error'` for months while it resolved — and therefore policed — almost none of
// the imports it existed for.
//
// ⭐ THE SECOND ARM IS THE POINT. Existence is the cheap half. This corpus's
// recurring defect is AUTHORED-BUT-UNWIRED, and the tracker committed it about
// its own gates: its §5 — captioned "THIS OUTRANKS THE ENTIRE TABLE ABOVE IT" —
// asserted that 13 gates ran in no runner, days after all 13 were registered.
// So R2 does not ask whether a file exists; it asks whether a RUNNER names it AND
// whether the path it names RESOLVES. A registry entry pointing at a renamed file
// is a gate nobody runs with a green tick next to it.
//
// ⭐ AND §5 ITSELF IS IN THE MANIFEST. Those thirteen gates are checked here by
// name, so the section's claim stops being prose. It is stale prose TODAY (all
// thirteen are registered) — but stale-in-the-safe-direction is luck, not a
// control, and prose cannot notice the day one of them falls out again. Seven §2
// rows and the whole bar-3 programme depend on these running.
//
// ─── THE THREE ARMS ──────────────────────────────────────────────────────────
//   R1 · RESIDENCY   — the gate file exists under one of the two declared gate
//                      directories (`tools/ga-gate`,
//                      `tools/rac-conformance/certification/gates`). Those two
//                      are also exactly where `bim30-status` looks, so a gate
//                      outside them is unreachable to the status generator even
//                      when it exists.
//   R2 · REGISTRATION— EITHER runner names the gate AND the path it names
//                      resolves to a real file. Both runners, because there are
//                      two gate homes: `run-all.ts` registers by `script:` PATH,
//                      `certify.ts` by BARE NAME in a `const gates = [...]`
//                      array, and `check-move-propagation` lives only in the
//                      latter — checking one runner would report it unwired.
//                      Both halves matter: a name with a dead path is worse than
//                      no entry, because it reads as coverage.
//   R3 · VERDICT PATH— the file reaches a verdict — it calls `reportGate(` or
//                      `process.exit(`. A module that computes and returns is
//                      "specified and NOT BUILT" with a filename attached, and
//                      these five rows are about exactly that distinction.
//
// ─── WHAT THIS GATE DOES **NOT** ESTABLISH (never cite it for these) ─────────
//   • It does NOT run the twenty-seven manifest gates. Their READINGS belong to other rows by
//     name — GR-01/05/06/07/08/10 for C71, PR-03 for C72, GE-01/02/03 for C73,
//     CO-01/03/06/08/12 for C74, PV-01/03/06 for C75 — and several of them are
//     RED at HEAD. GE-07's own tracker cell states the split: *"the row is about
//     existence; their readings are GE-01/02/03's business."* Merging the two
//     would let a red reading masquerade as a missing gate, and vice versa.
//   • It does NOT establish that a registered gate measures the RIGHT SUBJECT.
//     `check-gate-subject-floors` owns the floor half; nothing owns subject
//     correctness, and `bim30-status`'s own footer says so.
//   • It does NOT check CI residency — whether `.github/workflows/ci.yml` runs
//     `run-all.ts` in a merge-blocking job. CLAUDE.md records that required
//     status checks are not the real gate in this repo (§L-540-CI-GATE); that is
//     a separate question this file deliberately leaves open rather than
//     answering by assumption.
//
// ─── EXECUTED CONTROLS, EVERY RUN (C70 §5.6) ─────────────────────────────────
// A control that cannot fail is not a control. `selfTest()` drives all three
// arms over synthetics: a manifest entry naming a gate that does not exist must
// fail R1; a registry missing an entry, and a registry whose entry points at a
// vanished path, must each fail R2; a stub with no verdict path must fail R3 and
// a real gate body must pass it. A failing control exits 2, never 0.

import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { reportGate, type Floor } from '../contract.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, '../../../..');

const GATE = 'check-gate-residency';

/** The two directories a gate may live in — the same pair `bim30-status` scans. */
const GATE_DIRS = ['tools/ga-gate', 'tools/rac-conformance/certification/gates'];

/**
 * BOTH runners, because there are two gate homes and a gate in neither "reads as
 * coverage while running nowhere" (run-all.ts's own disclosure, quoted by the
 * tracker's §5). `certify.ts` registers by BARE NAME in a `const gates = [...]`
 * array; `run-all.ts` registers by `script:` PATH. Checking only one would report
 * `check-move-propagation` — registered solely in certify.ts — as unwired.
 */
const RUN_ALL = 'tools/ga-gate/run-all.ts';
const CERTIFY = 'tools/rac-conformance/certification/certify.ts';

/**
 * The manifest is HAND-NAMED, per row, with the contract clause that names the
 * gate. It is not derived from the directory listing: a gate that vanished would
 * then vanish from the manifest too, and the check would go green on an empty
 * subject — the empty-seed lie this whole programme is about.
 */
const MANIFEST: ReadonlyArray<{ row: string; clause: string; gates: readonly string[] }> = [
  { row: 'GR-11', clause: 'C71 §6', gates: ['check-graph-write-coverage', 'check-graph-delete-integrity', 'check-graph-persistence'] },
  { row: 'PR-08', clause: 'C72 §6', gates: ['check-prevstate-contract', 'check-suppression-is-reversible'] },
  { row: 'GE-07', clause: 'C73 §5', gates: ['check-epsilon-policy', 'check-predicate-canonical', 'check-deterministic-regeneration'] },
  { row: 'CO-11', clause: 'C74 §6', gates: ['check-constraint-honesty', 'check-solver-is-real', 'check-no-hidden-mock'] },
  { row: 'PV-07', clause: 'C75 §6', gates: ['check-provenance-not-invented', 'check-provenance-coverage', 'check-derived-not-authored'] },
  // ⭐ §5 — "THE 13 GATES THAT RUN IN NO RUNNER", the tracker section captioned
  // "This outranks the entire table above it". All thirteen ARE registered today,
  // so that section is STALE PROSE — and prose is exactly what cannot notice the
  // day one of them falls out again. Naming them here makes the claim executable:
  // twelve in run-all.ts, `check-move-propagation` in certify.ts. Seven §2 rows and
  // the whole bar-3 programme rest on these running.
  { row: '§5', clause: 'tracker §5/§5.1', gates: [
    'check-dependency-fields-honoured', 'check-generation-is-consequential',
    'check-graph-delete-integrity', 'check-graph-persistence', 'check-index-can-refuse',
    'check-move-propagation', 'check-no-empty-means-unknown', 'check-no-silent-partial',
    'check-provenance-export-boundary', 'check-region-fallback-populated',
    'check-region-host-attribution', 'check-region-reference-frame',
    'check-relationship-determination',
  ] },
];

/* ─────────────────────────── the arms, as pure detectors ─────────────────── */

/** R1 — where does this gate live? `null` = nowhere under the declared dirs. */
export function residency(gate: string, dirExists: (rel: string) => boolean): string | null {
  for (const d of GATE_DIRS) if (dirExists(`${d}/${gate}.ts`)) return `${d}/${gate}.ts`;
  return null;
}

export interface RegistryEntry { script: string; resolved: string | null }

/** Parse every `script: '…'` in the runner, resolved relative to its own dir. */
export function parseRegistry(runAllSrc: string, fileExists: (rel: string) => boolean): RegistryEntry[] {
  const out: RegistryEntry[] = [];
  const re = /script:\s*'([^']+)'/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(runAllSrc))) {
    const rel = `tools/ga-gate/${m[1]}`.replace(/\/\.\//g, '/');
    // collapse a leading `../` hop out of tools/ga-gate
    const norm = rel.replace(/tools\/ga-gate\/\.\.\//g, 'tools/');
    out.push({ script: m[1], resolved: fileExists(norm) ? norm : null });
  }
  return out;
}

/** `certify.ts` registers by BARE NAME in `const gates = [ 'check-x', … ]`. */
export function parseCertifyRegistry(certifySrc: string, gateExists: (name: string) => boolean): RegistryEntry[] {
  const out: RegistryEntry[] = [];
  const re = /const\s+gates\s*=\s*\[([\s\S]*?)\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(certifySrc))) {
    for (const s of m[1].match(/'([^']+)'|"([^"]+)"/g) ?? []) {
      const name = s.slice(1, -1);
      out.push({ script: `${name}.ts`, resolved: gateExists(name) ? name : null });
    }
  }
  return out;
}

/** R2 — is this gate REGISTERED in EITHER runner, with a path that resolves? */
export function registration(gate: string, registry: readonly RegistryEntry[]): { named: boolean; resolves: boolean } {
  const hits = registry.filter((e) => e.script.endsWith(`${gate}.ts`));
  return { named: hits.length > 0, resolves: hits.some((e) => e.resolved !== null) };
}

/** R3 — does the file reach a verdict, or merely compute one? */
export function hasVerdictPath(src: string): boolean {
  return /\breportGate\s*\(/.test(src) || /\bprocess\.exit\s*\(/.test(src);
}

/* ─────────────────────────── executed controls ─────────────────────────── */

interface Control { id: string; what: string; pass: boolean }

const STUB = `export function analyse(): number { return 0; }\n`;
const REAL = `import { reportGate } from '../contract.js';\nprocess.exit(reportGate({ gate: 'x', floors: [], lines: [], findings: 0, declared: 0 }));\n`;

function selfTest(): Control[] {
  const present = new Set(['tools/ga-gate/check-real.ts']);
  const exists = (rel: string): boolean => present.has(rel);
  const registrySrc = `const GATES = [\n  { name: 'real', script: 'check-real.ts' },\n  { name: 'moved', script: 'check-moved.ts' },\n];`;
  const reg = parseRegistry(registrySrc, exists);

  return [
    { id: 'R1a', what: 'R1 locates a gate that exists in a declared dir', pass: residency('check-real', exists) === 'tools/ga-gate/check-real.ts' },
    { id: 'R1b', what: 'R1 reports NOWHERE for a gate that does not exist', pass: residency('check-absent', exists) === null },
    { id: 'R1c', what: 'R1 refuses a gate outside the two declared dirs', pass: residency('check-real', (r) => r === 'tools/elsewhere/check-real.ts') === null },
    { id: 'R2a', what: 'R2 accepts a registered entry whose path resolves', pass: registration('check-real', reg).named && registration('check-real', reg).resolves },
    { id: 'R2b', what: 'R2 rejects a gate absent from the registry', pass: !registration('check-unregistered', reg).named },
    { id: 'R2c', what: 'R2 rejects a REGISTERED entry whose path no longer resolves — a name with a dead path reads as coverage', pass: registration('check-moved', reg).named && !registration('check-moved', reg).resolves },
    { id: 'R2d', what: 'R2 resolves the ../rac-conformance hop out of tools/ga-gate', pass: parseRegistry(`{ script: '../rac-conformance/certification/gates/check-x.ts' }`, (r) => r === 'tools/rac-conformance/certification/gates/check-x.ts')[0].resolved !== null },
    { id: 'R2e', what: "R2 reads certify.ts's BARE-NAME `const gates = [...]` array — check-move-propagation lives only there", pass: registration('check-move-propagation', parseCertifyRegistry(`const gates = ['check-a', 'check-move-propagation'];`, (n) => n === 'check-move-propagation')).named },
    { id: 'R2f', what: 'a bare name in certify.ts with no gate FILE does not resolve', pass: !registration('check-ghost', parseCertifyRegistry(`const gates = ['check-ghost'];`, () => false)).resolves },
    { id: 'R3a', what: 'R3 fails a stub that computes and returns', pass: !hasVerdictPath(STUB) },
    { id: 'R3b', what: 'R3 passes a body that reaches a verdict', pass: hasVerdictPath(REAL) },
  ];
}

/* ─────────────────────────── main ─────────────────────────── */

function main(): void {
  const controls = selfTest();
  const controlsPassed = controls.filter((x) => x.pass).length;

  const exists = (rel: string): boolean => existsSync(resolve(REPO, rel));
  const runAllPath = resolve(REPO, RUN_ALL);
  const runAllSrc = existsSync(runAllPath) ? readFileSync(runAllPath, 'utf8') : '';
  const certifyPath = resolve(REPO, CERTIFY);
  const certifySrc = existsSync(certifyPath) ? readFileSync(certifyPath, 'utf8') : '';
  const registry = [
    ...parseRegistry(runAllSrc, exists),
    ...parseCertifyRegistry(certifySrc, (n) => residency(n, exists) !== null),
  ];

  const findings: string[] = [];
  const lines: string[] = [];
  let checked = 0;

  for (const row of MANIFEST) {
    const cells: string[] = [];
    for (const g of row.gates) {
      checked++;
      const home = residency(g, exists);
      const reg = registration(g, registry);
      const verdict = home ? hasVerdictPath(readFileSync(resolve(REPO, home), 'utf8')) : false;

      if (!home) findings.push(`R1 ${row.row} · ${g} — NO FILE under ${GATE_DIRS.join(' or ')} (${row.clause} specifies it)`);
      if (!reg.named) findings.push(`R2 ${row.row} · ${g} — exists but is REGISTERED IN NO RUNNER (neither ${RUN_ALL} nor ${CERTIFY})`);
      else if (!reg.resolves) findings.push(`R2 ${row.row} · ${g} — registered under a path that DOES NOT RESOLVE — a name with a dead path reads as coverage`);
      if (home && !verdict) findings.push(`R3 ${row.row} · ${g} — no verdict path (neither reportGate() nor process.exit()); specified, not built`);

      cells.push(`${g} ${home ? '✓file' : '❌file'}${reg.named ? (reg.resolves ? ' ✓reg' : ' ❌path') : ' ❌reg'}${verdict ? ' ✓verdict' : ' ❌verdict'}`);
    }
    lines.push(`${row.row} (${row.clause}) — ${row.gates.length} gate(s)`);
    for (const c of cells) lines.push(`      ${c}`);
  }

  lines.push('');
  lines.push(`registry entries parsed from ${RUN_ALL} + ${CERTIFY}: ${registry.length} · unresolvable: ${registry.filter((e) => e.resolved === null).length}`);
  lines.push('');
  lines.push(`executed controls (C70 §5.6 — an arm never watched failing is UNPROVEN): ${controlsPassed}/${controls.length}`);
  for (const c of controls) lines.push(`   ${c.pass ? '✓' : '❌'} ${c.id} ${c.what}`);
  lines.push('');
  lines.push('NOT MEASURED BY THIS GATE: the fourteen gates are NOT RUN here. Their readings');
  lines.push('belong to GR-01/05/06/07/08/10 · PR-03 · GE-01/02/03 · CO-01/03/06/08/12 ·');
  lines.push('PV-01/03/06, and several are RED at HEAD. Existence is not health, and this');
  lines.push('gate answers only the first. Nor does it check that a registered gate measures');
  lines.push('the right SUBJECT, nor that run-all.ts itself runs in a merge-blocking CI job.');

  const floors: Floor[] = [
    { what: 'executed controls passed', measured: controlsPassed, min: controls.length },
    { what: 'manifest gates checked', measured: checked, min: 27 },
    { what: `registry entries parsed from both runners`, measured: registry.length, min: 60 },
  ];

  process.exit(reportGate({ gate: GATE, floors, lines, findings: findings.length, declared: 0, findingNames: findings }));
}

main();
