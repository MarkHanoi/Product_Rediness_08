// ─── Grade the CE-02 geometry artefact against its floors ────────────────────
//
// §4.6 — VITEST'S EXIT CODE IS NOT THE VERDICT, and this file is why that
// sentence is load-bearing rather than pedantic. MEASURED: the empty-world run
// seeds nothing, builds nothing, produces `builtFamilies=0 triangles=0`, and
// VITEST EXITS 0 — because no assertion about a non-existent element failed.
// That is the §0 incident exactly: maximally broken and maximally green.
//
// So the runner timestamps, runs, and then grades the ARTEFACT, in the order of
// authority MISCONFIGURED (2) -> RATCHET (3) -> DECLARED (1) -> CLEAN (0).
//
// USAGE
//   npx tsx gradeGeometry.ts                      # grade results/geometry.json
//   npx tsx gradeGeometry.ts --run                # run the suite, then grade it
//   PRYZM_CERT_EMPTY_WORLD=1 npx tsx gradeGeometry.ts --run   # the §4.4 proof
//
// The `--run` form takes the freshness stamp BEFORE spawning vitest, so a suite
// that crashes in `beforeAll` and leaves the PREVIOUS run's green artefact on
// disk is caught as STALE rather than graded as the past (§4.4 way 2).

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readGeometryFloors, GEOMETRY_FLOORS, type GeometryArtefact } from './geometryFloors.js';
import { reportGate, EXIT_MISCONFIGURED, type ExitCode } from './contract.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RESULTS = resolve(__dirname, 'results');
const ARTEFACT = resolve(RESULTS, GEOMETRY_FLOORS.file);

const argv = process.argv.slice(2);
const doRun = argv.includes('--run');

// The freshness stamp is taken BEFORE the runner spawns vitest. Anything older
// than this instant was not written by this run.
const notBefore = Date.now();

if (doRun) {
  console.log('── running __tests__/geometry.cert.ts ' + '─'.repeat(34));
  const r = spawnSync('npx', ['vitest', 'run', '__tests__/geometry.cert.ts'], {
    cwd: __dirname, stdio: 'inherit', env: process.env, shell: true,
  });
  console.log(
    `\n   vitest exited ${r.status} — NOT the verdict (§4.6). ` +
    'A suite that seeds NOTHING also exits 0; the artefact is what gets graded.',
  );
}

let artefact: GeometryArtefact | null = null;
let parseError = '';
if (existsSync(ARTEFACT)) {
  try {
    artefact = JSON.parse(readFileSync(ARTEFACT, 'utf8')) as GeometryArtefact;
  } catch (e) {
    parseError = String(e).slice(0, 300);
  }
}

const { floors, notes } = readGeometryFloors(artefact, notBefore);

const lines: string[] = [];
if (parseError) lines.push(`artefact PARSE ERROR: ${parseError}`);
if (artefact?.emptyWorldRun) {
  lines.push(
    'PRYZM_CERT_EMPTY_WORLD=1 — this artefact is the §4.4 DELIBERATE-BREAKAGE PROOF. ' +
    'It MUST exit 2. An empty world scoring anything other than MISCONFIGURED would mean the ' +
    'floors are decorative, and every verdict this harness has ever printed would be void.',
  );
}

// §4.2 — every comparator prints its COMPARED COUNT next to its verdict.
// "0 divergences" without a compared count is not a result.
for (const f of artefact?.families ?? []) {
  const fam = f as { family: string; attempted: number; built: number; meshes: number; triangles: number; error?: string };
  lines.push(
    `compared ${fam.family}: attempted=${fam.attempted} built=${fam.built} ` +
    `meshes=${fam.meshes} triangles=${fam.triangles}` + (fam.error ? ` [error: ${fam.error}]` : ''),
  );
}
const oracle = artefact?.oracle as { ran?: boolean; passed?: boolean; detail?: string } | undefined;
if (oracle) lines.push(`oracle: ran=${oracle.ran} passed=${oracle.passed} — ${oracle.detail ?? ''}`);
for (const a of (artefact?.negativeControl ?? []) as Array<{ arm: string; sighted: boolean; observed: string }>) {
  lines.push(`negative control ${a.arm}: sighted=${a.sighted} (${a.observed})`);
}
for (const n of notes) lines.push(n);

// FINDINGS. Deliberately narrow: a family that was HANDED elements and produced
// no meshes is a finding. A family with nothing to build is NOT a finding — it
// is a floor failure, and floors short-circuit to MISCONFIGURED before findings
// are ever counted. Conflating the two is how "nothing to compare" becomes
// "nothing wrong".
const findingNames: string[] = [];
for (const f of (artefact?.families ?? []) as Array<{ family: string; attempted: number; meshes: number; error?: string }>) {
  if (f.attempted > 0 && f.meshes === 0) {
    findingNames.push(`${f.family}: ${f.attempted} element(s) built 0 meshes${f.error ? ` — ${f.error}` : ''}`);
  }
}
if (oracle && oracle.ran && !oracle.passed) findingNames.push('offset oracle: known answer NOT matched');

// The declared ledger for this gate. 0 = hard-0, no baseline: on the measured
// reading every family built and the oracle matched, so there is no debt to
// declare. If that ever stops being true the gate goes RED rather than
// absorbing it — a ledger entry added here must be reviewed as C70 §5.3.
const DECLARED = 0;

const code: ExitCode = reportGate({
  gate: 'CE-02 geometry (executed headless fragment build)',
  floors,
  lines,
  findings: findingNames.length,
  declared: DECLARED,
  findingNames,
});

if (code === EXIT_MISCONFIGURED) {
  console.log('\n   The Geometry axis could not establish its subject. This is NOT a pass and NOT a');
  console.log('   finding — it is the harness being broken, and it is reported separately for');
  console.log('   exactly that reason. It is NEVER absorbable as debt (C70 §5.1).');
}

process.exit(code);
