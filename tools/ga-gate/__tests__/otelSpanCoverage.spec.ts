



/**
 * §FIX-P8-ENFORCEMENT-BLIND (W3-2, 2026-08-11) — behavioural specs for the P8
 * OTel span gate (`tools/ga-gate/check-otel-spans.ts`, C10 §2, STR-03 §2 P8).
 *
 * These lock the two blindnesses that made the gate's green tick meaningless,
 * plus the honesty assertion that a coverage scan reaching nothing can never
 * report a pass.
 *
 *   BLINDNESS 1 — discovery was `plugins/*&#47;src/handlers/` only, so
 *   `packages/command-registry/**` and every app were never opened.
 *   BLINDNESS 2 — the verdict was `instrumented < HARD_FLOOR`, an absolute
 *   floor with 42 files of slack, so adding uninstrumented handlers still
 *   printed a pass.
 *
 * The gate is run as a subprocess so the assertions are on its REAL exit code,
 * not on a re-implementation of its logic.
 */

import { describe, it, expect, afterEach, beforeAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { scanFileCoverage } from '../lib/sourceScan.js';

const ROOT = process.cwd().replace(/[\\/]$/, '');
const GATE = join(ROOT, 'tools', 'ga-gate', 'check-otel-spans.ts');

const UNINSTRUMENTED = [
  '// TEMPORARY spec fixture — removed in afterEach.',
  'export function __specSyntheticP8Violation(x: number): number {',
  '  return x + 1;',
  '}',
  '',
].join('\n');

function runGate(): { code: number; out: string } {
  const r = spawnSync('npx', ['tsx', GATE], {
    cwd: ROOT, encoding: 'utf8', shell: process.platform === 'win32',
  });
  return { code: r.status ?? -1, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

const planted: string[] = [];
function plant(rel: string): void {
  const abs = join(ROOT, rel);
  writeFileSync(abs, UNINSTRUMENTED, 'utf8');
  planted.push(abs);
}

afterEach(() => {
  while (planted.length > 0) {
    const p = planted.pop()!;
    if (existsSync(p)) rmSync(p);
  }
});

// The gate walks ~4,600 source files for the §CENSUS zone, and each run pays an
// `npx tsx` cold start. Every subprocess assertion needs a generous budget.
const RUN_TIMEOUT = 180_000;

/** The clean-tree run, taken once and reused — it is the same fact every time. */
let cleanRun: { code: number; out: string };
beforeAll(() => { cleanRun = runGate(); }, RUN_TIMEOUT);

describe('check-otel-spans — the gate must pass on a clean tree', () => {
  it('exits 0 with no synthetic violation present', () => {
    expect(cleanRun.out).toContain('ZONE A');
    expect(cleanRun.code).toBe(0);
  });
});

describe('BLINDNESS 2 — absolute floor vs zero tolerance', () => {
  it('FAILS on ONE uninstrumented handler in plugins/*/src/handlers, and names it', { timeout: RUN_TIMEOUT }, () => {
    plant('plugins/beam/src/handlers/__SpecP8Probe.ts');
    const { code, out } = runGate();
    expect(code).toBe(1);
    expect(out).toContain('plugins/beam/src/handlers/__SpecP8Probe.ts');
    // The old gate printed exactly this shape of headline and still exited 0.
    // The verdict must NOT be a count comparison against a floor.
    expect(out).toMatch(/FAIL \(Zone A\)/);
  });
});

describe('BLINDNESS 1 — discovery never opened command-registry or apps', () => {
  it('FAILS on an uninstrumented exported function in packages/command-registry', { timeout: RUN_TIMEOUT }, () => {
    plant('packages/command-registry/src/__SpecP8Probe.ts');
    const { code, out } = runGate();
    expect(code).toBe(1);
    expect(out).toContain('packages/command-registry/src/__SpecP8Probe.ts');
    expect(out).toMatch(/FAIL \(Zone B\)/);
  });

  it('reports the ungated repo-wide §CENSUS on every run, never hides it', () => {
    const out = cleanRun.out;
    expect(out).toContain('ZONE C §CENSUS');
    expect(out).toContain('NOT GATED');
    const m = out.match(/ZONE C §CENSUS[^:]*:\s*(\d+)\s*\/\s*(\d+)/);
    expect(m).not.toBeNull();
    // The literal C10 §2 subject is far larger than what is enforced. If this
    // ever reads as a small number, the census walk collapsed — not the debt.
    expect(Number(m![2])).toBeGreaterThan(1000);
  });
});

describe('scanFileCoverage — the honesty floor (doctrine: exit 2, never exit 0)', () => {
  it('partitions covered + uncovered into exactly the population', () => {
    const dir = mkdtempSync(join(tmpdir(), 'p8-cov-'));
    try {
      mkdirSync(join(dir, 'src'));
      writeFileSync(join(dir, 'src', 'a.ts'), 'export function a() { withHandlerSpan(() => 1); }');
      writeFileSync(join(dir, 'src', 'b.ts'), 'export function b() { return 1; }');
      writeFileSync(join(dir, 'src', 'c.ts'), 'export function c() { return 2; }');
      const r = scanFileCoverage({
        root: dir, dirs: ['src'], require: /withHandlerSpan\s*\(/,
        minFiles: 3, exts: ['.ts'], label: 'spec',
      });
      expect(r.covered.length).toBe(1);
      expect(r.uncovered.length).toBe(2);
      expect(r.covered.length + r.uncovered.length + r.filesExcluded).toBe(r.filesRead);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('exits 2 — NOT 0, NOT 1 — when the walk reads fewer files than minFiles', { timeout: RUN_TIMEOUT }, () => {
    // A scan that looked nowhere finds nothing. That is misconfiguration, and
    // misconfiguration must never be absorbable as declared debt.
    const script = [
      `import { scanFileCoverage } from ${JSON.stringify(join(ROOT, 'tools/ga-gate/lib/sourceScan.ts').replace(/\\/g, '/'))};`,
      `scanFileCoverage({ root: ${JSON.stringify(ROOT.replace(/\\/g, '/'))}, dirs: ['no-such-directory-anywhere'],`,
      `  require: /x/, minFiles: 5, label: 'spec-empty' });`,
      `console.log('REACHED_UNREACHABLE');`,
    ].join('\n');
    const dir = mkdtempSync(join(tmpdir(), 'p8-exit2-'));
    try {
      const f = join(dir, 'probe.ts');
      writeFileSync(f, script, 'utf8');
      const r = spawnSync('npx', ['tsx', f], {
        cwd: ROOT, encoding: 'utf8', shell: process.platform === 'win32',
      });
      expect(r.status).toBe(2);
      expect(`${r.stdout ?? ''}`).not.toContain('REACHED_UNREACHABLE');
      expect(`${r.stderr ?? ''}`).toContain('MISCONFIGURED (exit 2)');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
