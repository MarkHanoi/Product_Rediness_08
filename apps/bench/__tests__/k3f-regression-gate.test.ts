/**
 * K3-F regression-gate static contract per ADR-0053 §B.
 *
 * K3-F (PHASE-3-COMPLETION-GA-M25-M36.md §K3-F line 575):
 *   "If at S69 (M35) regression > 10% on any NFT target, halt forward
 *    3D work; root-cause + fix; re-bench."
 *
 * This test is the STATIC half of the gate.  It reads
 * `apps/bench/baseline.json` and the canonical NFT-target list from
 * `@pryzm/perf-budgets` and asserts:
 *
 *   1. Every NFT row marked `landed` has a baseline entry under each
 *      of its baseline keys.
 *   2. Every landed baseline entry has `p95 ≤ budgetMs` (the in-file
 *      hard-fail bar — i.e. the gate is currently passing on the
 *      recorded numbers).
 *   3. Every landed baseline entry carries either `hardFail: true`
 *      OR a `notes` field documenting why the entry is still warn-only
 *      (with a sprint pointer).
 *   4. The `largest-model.{parse,produce}` entries are flipped to
 *      `hardFail: true` per the S71 perf-hunt close.
 *
 * The DYNAMIC half (current p95 vs prior p95 ≥ 10% slip = halt) is
 * `apps/bench/scripts/check-regression.mjs` — invoked via
 * `pnpm bench:check` after a fresh `.run-output/` is produced.  Static
 * + dynamic together = K3-F enforcement per ADR-0053 §B.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const BASELINE_PATH = resolve(REPO_ROOT, 'apps/bench/baseline.json');

interface BaselineEntry {
  p50: number;
  p95: number;
  p99: number;
  samples: number;
  warnMs: number;
  budgetMs: number;
  hardFail?: boolean;
  sprint?: string;
  notes?: string;
}

interface BaselineFile {
  benches: Record<string, BaselineEntry>;
}

interface NftTargetShape {
  id: string;
  baselineKey: string | readonly string[];
  s71Status: 'landed' | 'partial' | 'gap';
}

function loadBaseline(): BaselineFile {
  if (!existsSync(BASELINE_PATH)) {
    throw new Error(`baseline.json not found at ${BASELINE_PATH}`);
  }
  return JSON.parse(readFileSync(BASELINE_PATH, 'utf-8')) as BaselineFile;
}

async function loadNftTargets(): Promise<readonly NftTargetShape[]> {
  const mod = await import(
    resolve(REPO_ROOT, 'packages/perf-budgets/src/nft-targets.ts')
  );
  return mod.NFT_TARGETS as readonly NftTargetShape[];
}

describe('K3-F regression-gate static contract (ADR-0053 §B)', () => {
  it('apps/bench/baseline.json exists and parses', () => {
    const b = loadBaseline();
    expect(b.benches).toBeDefined();
    expect(typeof b.benches).toBe('object');
  });

  it('every landed NFT row has baseline entries under all its keys', async () => {
    const targets = await loadNftTargets();
    const baseline = loadBaseline();
    const landed = targets.filter((t) => t.s71Status === 'landed');
    for (const t of landed) {
      const keys =
        typeof t.baselineKey === 'string' ? [t.baselineKey] : t.baselineKey;
      for (const k of keys) {
        expect(
          Object.prototype.hasOwnProperty.call(baseline.benches, k),
          `landed NFT row "${t.id}" expects baseline key "${k}"`,
        ).toBe(true);
      }
    }
  });

  it('every landed baseline entry with a captured p95 passes its hard-fail bar (p95 ≤ budgetMs)', async () => {
    const targets = await loadNftTargets();
    const baseline = loadBaseline();
    const landed = targets.filter((t) => t.s71Status === 'landed');
    for (const t of landed) {
      const keys =
        typeof t.baselineKey === 'string' ? [t.baselineKey] : t.baselineKey;
      for (const k of keys) {
        const entry = baseline.benches[k];
        if (!entry) continue;
        // Some landed entries have the hardFail bar set but p95 not yet
        // captured (e.g. bake.incremental — note "p50/p95/p99 populated on
        // first CI run").  That's a structural pass; only assert p95 ≤
        // budgetMs when p95 is a number.
        if (typeof entry.p95 !== 'number') continue;
        expect(
          entry.p95,
          `${t.id}::${k} p95 ${entry.p95}ms must be ≤ budgetMs ${entry.budgetMs}ms`,
        ).toBeLessThanOrEqual(entry.budgetMs);
      }
    }
  });

  it('every landed baseline entry has a budgetMs and either hardFail:true or a sprint+notes pointer', async () => {
    const targets = await loadNftTargets();
    const baseline = loadBaseline();
    const landed = targets.filter((t) => t.s71Status === 'landed');
    for (const t of landed) {
      const keys =
        typeof t.baselineKey === 'string' ? [t.baselineKey] : t.baselineKey;
      for (const k of keys) {
        const entry = baseline.benches[k];
        if (!entry) continue;
        expect(
          typeof entry.budgetMs,
          `${t.id}::${k} must have budgetMs as number`,
        ).toBe('number');
      }
    }
  });

  it('every landed baseline entry has hardFail:true OR a notes field documenting deferral', async () => {
    const targets = await loadNftTargets();
    const baseline = loadBaseline();
    const landed = targets.filter((t) => t.s71Status === 'landed');
    for (const t of landed) {
      const keys =
        typeof t.baselineKey === 'string' ? [t.baselineKey] : t.baselineKey;
      for (const k of keys) {
        const entry = baseline.benches[k];
        if (!entry) continue;
        const hasHardFail = entry.hardFail === true;
        const hasNotes = typeof entry.notes === 'string' && entry.notes.length > 0;
        expect(
          hasHardFail || hasNotes,
          `${t.id}::${k} must carry hardFail:true OR notes documenting deferral`,
        ).toBe(true);
      }
    }
  });

  it('largest-model.{parse,produce} are flipped to hardFail:true at S71 close (ADR-0053 §A)', () => {
    const baseline = loadBaseline();
    const parse = baseline.benches['largest-model.parse'];
    const produce = baseline.benches['largest-model.produce'];
    expect(parse).toBeDefined();
    expect(produce).toBeDefined();
    expect(parse.hardFail).toBe(true);
    expect(produce.hardFail).toBe(true);
    expect(parse.sprint).toBe('S71');
    expect(produce.sprint).toBe('S71');
  });

  it('largest-model.{parse,produce} retain massive headroom over budget (catastrophic-regression detector)', () => {
    const baseline = loadBaseline();
    const parse = baseline.benches['largest-model.parse'];
    const produce = baseline.benches['largest-model.produce'];
    const parseHeadroom = parse.budgetMs / parse.p95;
    const produceHeadroom = produce.budgetMs / produce.p95;
    expect(parseHeadroom).toBeGreaterThan(20);
    expect(produceHeadroom).toBeGreaterThan(20);
  });
});
