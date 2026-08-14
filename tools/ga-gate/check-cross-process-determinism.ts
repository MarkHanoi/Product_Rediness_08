/**
 * @file tools/ga-gate/check-cross-process-determinism.ts
 *
 * §GE-08 — THE MEASUREMENT, NOT THE CLAIM (C73 §5.4b/c).
 *
 * ─── What the register asked for, and why a probe rather than a fix ──────────
 * BIM30-GAP-REGISTER GE-08 reads UNPROVEN and its own closing instruction is
 * *"say UNPROVEN; do not infer it from single-process green"*.
 * `check-deterministic-regeneration.ts` says the same thing about itself in its
 * exit-condition block: cross-machine floating-point determinism and GPU-side
 * geometry are NOT PROVEN by it. Both are correct, and neither could be fixed by
 * writing code — the missing thing was an INSTRUMENT that can fail.
 *
 * This file is that instrument, at the strength it can honestly reach today.
 *
 * ─── WHAT THIS PROVES ────────────────────────────────────────────────────────
 * The same geometry, computed in SEPARATE OS PROCESSES from a cold module load,
 * produces byte-identical IEEE-754 output. That is a real and previously
 * unmeasured claim. It catches exactly the class `check-deterministic-regeneration`
 * cannot see, because that gate is a STATIC read:
 *
 *   • module-level memoisation / lazy singletons whose first-caller wins;
 *   • a tolerance or table mutated by whichever code path ran first;
 *   • `Map`/`Set` iteration order that depends on insertion history;
 *   • anything that reads a process-global (locale, TZ, an env var) and folds it
 *     into a number;
 *   • JIT-tier-dependent arithmetic — arm 2 below runs one replica under
 *     `--jitless`, so the interpreter and the optimising compiler must agree.
 *
 * ─── WHAT THIS DOES **NOT** PROVE — READ BEFORE CITING IT ────────────────────
 * ⚠ **THIS IS NOT CROSS-MACHINE DETERMINISM (§5.4b).** Every replica here runs
 *   on ONE machine, ONE CPU architecture, ONE V8 build. Two processes agreeing on
 *   this laptop says nothing about an x86 server and an ARM laptop agreeing, and
 *   writing "determinism: PROVEN" off this gate would be the exact overstatement
 *   the register is warning about. The apparatus is built so that the missing
 *   half is now a matter of RUNNING it in a second environment and diffing the
 *   emitted digests — see `--emit-digests` — rather than of building anything.
 * ⚠ **THIS IS NOT GPU DETERMINISM (§5.4c).** Anything computed in a shader is
 *   outside this process model entirely. No arm here can ever reach it.
 * ⚠ **THIS IS NOT CORRECTNESS.** Two processes agreeing on a wrong number is a
 *   pass. Correctness is the oracle fixtures' job (C73 §5.4a).
 * ⚠ **COVERAGE IS THE FIXTURE LIST, NOT THE REPO.** It measures the geometry
 *   named in `determinism-probe-worker.ts` and nothing else. `MIN_FIXTURES`
 *   below is a floor against the sweep silently emptying, not a claim of breadth.
 *   The register's companion finding — that 0 of the classified determinism field
 *   paths name GEOMETRY — is unaffected by this file and stays open.
 *
 * ─── ARM 2, AND WHY `--jitless` IS THE RIGHT SECOND CONDITION ────────────────
 * A second replica under identical conditions is a weak test: it re-runs the same
 * machine code and will agree even if the arithmetic is fragile. Varying the
 * EXECUTION TIER is the strongest condition available without a second machine —
 * `--jitless` forces the Ignition interpreter for the whole run, so a
 * disagreement means the optimising compiler and the interpreter computed
 * different bytes for the same source. That is the closest same-machine proxy for
 * "a different V8 will disagree", and it is a genuine falsifier: it is how
 * unsafe-math-style fragility surfaces without a second architecture.
 * TZ/LANG are varied on the same replica so a locale-dependent number is caught
 * in the same pass.
 *
 * ─── FLAGS ───────────────────────────────────────────────────────────────────
 *   --emit-digests   print `fixture <sha256>` for the primary replica and exit 0.
 *                    THIS IS THE CROSS-MACHINE PATH: run it on machine A, run it
 *                    on machine B, diff the two files. A difference IS the §5.4b
 *                    finding, and it is now a fifteen-second experiment.
 *   --fixture <id>   run one fixture by name (debugging), including the controls.
 *
 * ─── PROOF THAT THIS PROBE CAN FAIL ──────────────────────────────────────────
 * A probe never seen to fail is indistinguishable from one that CANNOT fail.
 * `--fixture __negative-control` runs a fixture that folds the PID into its
 * digest, so the three replicas disagree by construction and the gate exits 1
 * naming three distinct digests. EXECUTED 2026-08-14, reading:
 *     __negative-control — 3 DISTINCT digests across 3 replicas
 *     8c761ea4…  A · default tier
 *     9dff24fa…  B · default tier, other locale/TZ/heap
 *     91f926ef…  C · --jitless (interpreter only)
 * The control is excluded from the default sweep (`FIXTURE_IDS` drops
 * `__`-prefixed ids), so it can never fail CI — only demonstrate the apparatus.
 *
 * ─── EXIT CODES ──────────────────────────────────────────────────────────────
 *   0 — every fixture agreed byte-for-byte across all replicas.
 *   1 — a fixture DISAGREED between processes. Names the fixture and the digests.
 *   2 — MISCONFIGURED: fewer fixtures than the floor, or a replica failed to run.
 *       Exit 2 is deliberately not 1 — a probe that did not execute has measured
 *       nothing, and "0 disagreements over 0 fixtures" must never read as a pass.
 */

import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = resolve(HERE, 'lib', 'determinism-probe-worker.ts');
const GATE = 'check-cross-process-determinism';

/**
 * §R5-FLOOR. This gate's headline is an ABSENCE ("no disagreement"), and an empty
 * fixture list produces a perfect score over nothing. Measured 2026-08-14: 4.
 */
const MIN_FIXTURES = 4;

/** One replica: a label plus the process conditions it runs under. */
interface Replica {
    readonly label: string;
    readonly nodeOptions: readonly string[];
    readonly env: Readonly<Record<string, string>>;
}

const REPLICAS: readonly Replica[] = [
    { label: 'A · default tier', nodeOptions: [], env: { TZ: 'UTC', LANG: 'C' } },
    // Same tier, different locale/timezone/heap — catches a number that reads a
    // process global. A pure geometry path must not notice any of this.
    { label: 'B · default tier, other locale/TZ/heap', nodeOptions: ['--max-old-space-size=512'], env: { TZ: 'Pacific/Kiritimati', LANG: 'tr_TR.UTF-8' } },
    // The load-bearing one — see the header. Interpreter only.
    { label: 'C · --jitless (interpreter only)', nodeOptions: ['--jitless'], env: { TZ: 'UTC', LANG: 'C' } },
];

function misconfigured(msg: string): never {
    console.error(`\n[${GATE}] MISCONFIGURED (exit 2) — ${msg}`
        + `\n  A probe that did not execute has measured nothing. This is NOT a pass.`);
    process.exit(2);
}

function runReplica(replica: Replica, fixtureId: string): string {
    const r = spawnSync(
        process.execPath,
        [...replica.nodeOptions, resolve(HERE, '..', '..', 'node_modules', 'tsx', 'dist', 'cli.mjs'), WORKER, fixtureId],
        {
            encoding: 'utf8',
            env: { ...process.env, ...replica.env },
            maxBuffer: 32 * 1024 * 1024,
        },
    );
    if (r.status !== 0) {
        misconfigured(
            `replica "${replica.label}" failed on fixture ${fixtureId} (exit ${String(r.status)}).`
            + `\n  stderr: ${(r.stderr ?? '').split('\n').slice(0, 6).join('\n          ')}`,
        );
    }
    const line = (r.stdout ?? '').trim().split('\n').filter(Boolean).pop() ?? '';
    const [id, digest] = line.split(/\s+/);
    if (id !== fixtureId || digest === undefined || digest.length !== 64) {
        misconfigured(`replica "${replica.label}" produced no digest for ${fixtureId} (got: ${JSON.stringify(line)}).`);
    }
    return digest;
}

function listFixtures(): string[] {
    const r = spawnSync(
        process.execPath,
        [resolve(HERE, '..', '..', 'node_modules', 'tsx', 'dist', 'cli.mjs'), WORKER, '--list'],
        { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 },
    );
    if (r.status !== 0) misconfigured(`could not list fixtures (exit ${String(r.status)}). stderr: ${(r.stderr ?? '').slice(0, 400)}`);
    return (r.stdout ?? '').trim().split('\n').map((s) => s.trim()).filter(Boolean);
}

// ─── Main ────────────────────────────────────────────────────────────────────

const only = process.argv.includes('--fixture')
    ? process.argv[process.argv.indexOf('--fixture') + 1]
    : undefined;
const emitOnly = process.argv.includes('--emit-digests');

const all = listFixtures();
if (all.length < MIN_FIXTURES) {
    misconfigured(`the worker listed ${all.length} fixture(s); floor is ${MIN_FIXTURES}.`);
}
// `--fixture` resolves against the WIDER set, so the negative control below is
// reachable by name while staying out of every unattended run.
const fixtures = only === undefined ? all : [only];

console.log(`\n[${GATE}] §GE-08 cross-PROCESS determinism (C73 §5.4b, partial — read this file's header)`);
console.log(`  fixtures: ${fixtures.length}   replicas: ${REPLICAS.length}`);

if (emitOnly) {
    // The cross-machine path. One replica, canonical conditions, digests to stdout.
    for (const f of fixtures) console.log(`${f} ${runReplica(REPLICAS[0]!, f)}`);
    console.log(`\n[${GATE}] digests emitted for replica "${REPLICAS[0]!.label}".`
        + `\n  Run this on a SECOND machine and diff. A difference IS the C73 §5.4b finding.`);
    process.exit(0);
}

const failures: string[] = [];
for (const f of fixtures) {
    const seen = REPLICAS.map((r) => ({ label: r.label, digest: runReplica(r, f) }));
    const distinct = new Set(seen.map((s) => s.digest));
    if (distinct.size === 1) {
        console.log(`  ✓ ${f}  ${seen[0]!.digest.slice(0, 16)}…  (${REPLICAS.length} replicas agree)`);
    } else {
        failures.push(
            `${f} — ${distinct.size} DISTINCT digests across ${REPLICAS.length} replicas:\n`
            + seen.map((s) => `        ${s.digest.slice(0, 24)}…  ${s.label}`).join('\n'),
        );
        console.log(`  ✗ ${f}  DISAGREEMENT`);
    }
}

console.log(
    `\n[${GATE}] SCOPE, stated so this is not over-cited: this proves SAME-MACHINE,`
    + `\n  cross-PROCESS, cross-execution-tier byte equality over ${fixtures.length} fixture(s).`
    + `\n  It does NOT prove cross-MACHINE determinism (C73 §5.4b) — every replica ran on one`
    + `\n  CPU and one V8 build — and it cannot reach GPU-side geometry (§5.4c) at all.`
    + `\n  GE-08 stays UNPROVEN for both. Use --emit-digests on a second machine to close §5.4b.`,
);

if (failures.length > 0) {
    console.error(`\n[${GATE}] ❌ ${failures.length} fixture(s) are NOT deterministic across processes:\n`);
    for (const f of failures) console.error(`   • ${f}\n`);
    console.error(
        `  A geometry that differs between two runs on ONE machine cannot converge between two`
        + `\n  clients, cannot be regenerated from a saved model, and makes every downstream`
        + `\n  byte-equality pin meaningless. This is a hard failure, not a ratchet.\n`,
    );
    process.exit(1);
}

console.log(`\n[${GATE}] ✅ ${fixtures.length} fixture(s) byte-identical across ${REPLICAS.length} processes.\n`);
process.exit(0);
