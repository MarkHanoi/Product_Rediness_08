/**
 * Helper-surface tests for the canonical NFT-target list.
 *
 * The row-by-row contract gate lives in `c10-crosscheck.test.ts`, which parses
 * C10 §1 directly. This file covers only the derived helpers.
 *
 * REWRITTEN 2026-08-11 (W5-1). The previous revision asserted a 9-row list
 * anchored to `docs/00_NEW_ARCHITECTURE/08-VISION.md §6` — a document that no
 * longer exists in the repo — with fields (`pryzm1Baseline`, `s71Status`,
 * `s71Note`) describing a sprint-close status rather than a contract. Its
 * "every benchFile exists" assertion passed while the benches it pointed at
 * asserted numbers unrelated to C10, which is precisely how the drift stayed
 * invisible.
 */

import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  NFT_TARGETS,
  MEASURED_NFTS,
  NOT_YET_MEASURABLE_NFTS,
  flattenBaselineKeys,
  K3F_REGRESSION_THRESHOLD_PCT,
  R2_NFT_EXECUTED_IN_CI_BASELINE,
} from '../src/nft-targets.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..', '..');

describe('flattenBaselineKeys()', () => {
  it('flattens single + array keys and skips rows without one', () => {
    const flat = flattenBaselineKeys(NFT_TARGETS);
    expect(flat.every((k) => typeof k === 'string' && k.length > 0)).toBe(true);
    expect(flat.length).toBe(
      NFT_TARGETS.filter((t) => t.baselineKey !== undefined).length,
    );
  });

  it('returns an empty array for empty input', () => {
    expect(flattenBaselineKeys([])).toEqual([]);
  });
});

describe('partitions', () => {
  it('measured + not-yet-measurable exactly cover the table', () => {
    expect(MEASURED_NFTS.length + NOT_YET_MEASURABLE_NFTS.length).toBe(
      NFT_TARGETS.length,
    );
  });

  it('at least one NFT is genuinely measured (the table is not vacuous)', () => {
    expect(MEASURED_NFTS.length).toBeGreaterThan(0);
  });
});

describe('K3F_REGRESSION_THRESHOLD_PCT', () => {
  it('is 10 %', () => {
    expect(K3F_REGRESSION_THRESHOLD_PCT).toBe(10);
  });
});

describe('R2 ratchet baseline', () => {
  // Raised 0 → 16 on 2026-08-11 once `apps/bench/scripts/nft-ci.ts` measured
  // EXECUTED 16/19. The three that do not execute (NFT 1, 2 — `window is not
  // defined` at module load; NFT 19 — the file C10 names does not exist) are
  // documented on the constant itself.
  it('records 16 executed-in-CI NFT benches as of 2026-08-11', () => {
    expect(R2_NFT_EXECUTED_IN_CI_BASELINE).toBe(16);
  });

  it('never exceeds the number of NFT rows that could possibly execute', () => {
    // A baseline above the count of rows with a bench file on disk would be
    // unsatisfiable — the ratchet could never be met and would stop meaning
    // anything. Guard the arithmetic, not just the literal.
    const withBenchFile = NFT_TARGETS.filter(
      (t) => t.benchPath !== null && existsSync(resolve(REPO_ROOT, t.benchPath)),
    );
    expect(R2_NFT_EXECUTED_IN_CI_BASELINE).toBeLessThanOrEqual(withBenchFile.length);
  });

  it('is now wired into a workflow — the condition the baseline of 0 recorded', () => {
    // The probe that produced the ORIGINAL baseline of 0, kept executable so
    // the claim stays falsifiable rather than becoming a comment. At baseline 0
    // this directory contained no workflow invoking apps/bench; W5-1 added the
    // `nft-bench` job, so the probe now asserts the OPPOSITE and will fail if
    // anyone deletes the job.
    const ci = resolve(REPO_ROOT, '.github/workflows/ci.yml');
    expect(existsSync(ci)).toBe(true);
    const text = readFileSync(ci, 'utf8');
    expect(text, 'ci.yml no longer invokes apps/bench — R2 has regressed to 0').toContain(
      'nft-bench',
    );
    expect(text).toContain('nft:ci');
  });
});

describe('baseline.json cross-check', () => {
  it('apps/bench/baseline.json is readable and has a benches map', () => {
    const p = resolve(REPO_ROOT, 'apps/bench/baseline.json');
    expect(existsSync(p)).toBe(true);
    const baseline = JSON.parse(readFileSync(p, 'utf-8')) as {
      benches?: Record<string, unknown>;
    };
    expect(typeof baseline.benches).toBe('object');
  });
});
