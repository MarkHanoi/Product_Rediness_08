/**
 * Behavioural specs for `tools/ga-gate/check-gate-subject-floors.ts` (RATCHET R5).
 *
 * Written 2026-08-13 alongside the THIRD false-accusation widening: a gate that
 * exits via the shared certification contract — `process.exit(reportGate(result))`
 * with a `floors:` array, where `reportGate` (tools/rac-conformance/certification/
 * contract.ts) returns 2 on any unmet floor — was reported as "declares a floor
 * but has no reachable process.exit(2)", because EXIT2_RE hunted a LITERAL `2`.
 * That accused check-no-dark-test-files, an innocent, and would have accused
 * every future contract-idiom gate (the house idiom since C77).
 *
 * The gate is run as a SUBPROCESS against a FIXTURE tree (GA_GATE_REPO_ROOT), so
 * the assertions are on its REAL exit code and output, not a re-implementation
 * (C72 §3.4). Three pins:
 *
 *  1. §CONTRACT-FLOORED — a reportGate-with-floors gate reads FLOORED even with
 *     no literal `2` anywhere in it. This is the widening's satisfiability proof.
 *  2. §STILL-CATCHES-GUILTY — a gate with a declared floor but only exit(1)
 *     still reads unfloored and forces exit 3 with the offender named. The
 *     widening must not have opened a hole: `floors:` + reportGate is required
 *     together, a floor constant alone still fails.
 *  3. §NO-FALSE-ACCUSATION-AT-HEAD — the real tree never names
 *     check-no-dark-test-files as unfloored again.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const GATE_DIR = resolve(HERE, '..');
const ROOT = resolve(GATE_DIR, '..', '..');
const GATE = join(GATE_DIR, 'check-gate-subject-floors.ts');

function runGate(repoRoot?: string): { out: string; code: number } {
  const env = { ...process.env, ...(repoRoot ? { GA_GATE_REPO_ROOT: repoRoot } : {}) };
  try {
    const out = execFileSync('npx', ['tsx', GATE], {
      cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], shell: true, env,
    });
    return { out, code: 0 };
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; status?: number };
    return { out: (err.stdout ?? '') + (err.stderr ?? ''), code: err.status ?? -1 };
  }
}

/** A conventionally floored gate: MIN_ constant, compared, literal exit 2. */
const LITERAL_FLOORED = [
  'const MIN_FILES = 5;',
  'const n = 6;',
  'if (n < MIN_FILES) process.exit(2);',
  'process.exit(0);',
].join('\n');

/**
 * The shared-contract idiom, spelled exactly the way check-no-dark-test-files
 * and check-secrets-register spell it: floors compared by `reportGate`, and NOT
 * ONE literal `2` in the whole file. Before the widening this read as
 * "declares a floor but has no reachable process.exit(2)".
 */
const CONTRACT_FLOORED = [
  "import { reportGate, type Floor } from '../rac-conformance/certification/contract.js';",
  'const MIN_TEST_FILES = 3;',
  'const measured = 10;',
  "const floors: Floor[] = [{ what: 'test files discovered', measured, min: MIN_TEST_FILES }];",
  "process.exit(reportGate({ gate: 'fixture-contract', floors, lines: [], findings: 0, declared: 0 }));",
].join('\n');

/** Guilty: a floor is declared and compared, but exit 2 is unreachable. */
const FLOOR_WITHOUT_EXIT2 = [
  'const MIN_FILES = 5;',
  'const n = 1;',
  'if (n < MIN_FILES) process.exit(1);',
  'process.exit(0);',
].join('\n');

let fixRoot = '';
let fixGateDir = '';

/** MIN_GATES in the gate is 20 — the fixture must clear it. */
const N_LITERAL = 19;

beforeAll(() => {
  fixRoot = mkdtempSync(join(tmpdir(), 'r5-fixture-'));
  fixGateDir = join(fixRoot, 'tools', 'ga-gate');
  mkdirSync(fixGateDir, { recursive: true });
  for (let i = 0; i < N_LITERAL; i++) {
    writeFileSync(join(fixGateDir, `check-fx-${String(i).padStart(2, '0')}.ts`), LITERAL_FLOORED);
  }
  writeFileSync(join(fixGateDir, 'check-fx-contract.ts'), CONTRACT_FLOORED);
});

afterAll(() => {
  rmSync(fixRoot, { recursive: true, force: true });
});

// Each spec spawns `npx tsx <gate>` — tens of seconds cold on win32.
const SPAWN_TIMEOUT_MS = 120_000;

describe('check-gate-subject-floors — the shared-contract widening (third false accusation)', () => {
  it('§CONTRACT-FLOORED — a reportGate-with-floors gate reads FLOORED, exit 0', { timeout: SPAWN_TIMEOUT_MS }, () => {
    const run = runGate(fixRoot);
    expect(run.out).toContain(`gates inspected: ${N_LITERAL + 1}`);
    expect(run.out).toContain('unfloored: 0');
    expect(run.out).not.toContain('check-fx-contract.ts');
    expect(run.code).toBe(0);
  });

  it('§STILL-CATCHES-GUILTY — a declared-but-unenforced floor still fails, exit 3, offender named', { timeout: SPAWN_TIMEOUT_MS }, () => {
    const bad = join(fixGateDir, 'check-zz-bad.ts');
    writeFileSync(bad, FLOOR_WITHOUT_EXIT2);
    try {
      const run = runGate(fixRoot);
      expect(run.code).toBe(3);
      expect(run.out).toContain('check-zz-bad.ts');
      expect(run.out).toContain('declares a floor but has no reachable process.exit(2)');
      // The innocent contract gate must NOT be swept up alongside the guilty one.
      expect(run.out).not.toContain('check-fx-contract.ts');
    } finally {
      rmSync(bad, { force: true });
    }
  });

  it('§NO-FALSE-ACCUSATION-AT-HEAD — the real tree never accuses check-no-dark-test-files again', { timeout: SPAWN_TIMEOUT_MS }, () => {
    const run = runGate();
    // Whatever the real tree's current unfloored set is (a concurrent lane may
    // legitimately be over the ceiling), the contract-idiom gate this widening
    // exonerated must never appear in it.
    expect(run.out).not.toMatch(/check-no-dark-test-files\.ts\s+—/);
  });
});
