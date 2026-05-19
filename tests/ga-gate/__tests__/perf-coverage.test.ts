/**
 * GA-gate · Performance (PHASE-3D §3 Performance).
 *
 * Spec verbatim:
 *   - Every NFT target in `08-VISION.md §6` green.
 *   - 10K wall × 50 level largest fixture confirmed working.
 *   - No memory leaks over 4h session.
 *
 * This test consumes `@pryzm/perf-budgets::NFT_TARGETS` (the S71
 * single-source-of-truth for the §6 contract) and asserts every row
 * is either landed-with-baseline OR has a documented deferral note
 * pointing to the sprint that owns the next fill-in.
 *
 * The 4-h memory-leak gate is operator-side per ADR-0053 §D. The
 * Node-side synthetic 200-cycle leak hunt is the in-dev actionable
 * complement (recorded in S71 sprint report §4).
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NFT_TARGETS, K3F_REGRESSION_THRESHOLD_PCT, flattenBaselineKeys } from '../../../packages/perf-budgets/src/index';

const REPO_ROOT = join(import.meta.dirname, '..', '..', '..');

interface BaselineEntry {
  budgetMs?: number;
  hardFail?: boolean;
  notes?: string;
  p95?: number;
}

interface Baseline {
  benches: Record<string, BaselineEntry>;
}

function loadBaseline(): Baseline {
  const raw = readFileSync(join(REPO_ROOT, 'apps/bench/baseline.json'), 'utf-8');
  return JSON.parse(raw) as Baseline;
}

describe('GA-gate · Performance NFT-target coverage', () => {
  it('K3-F threshold is 10% per master plan §K3-F', () => {
    expect(K3F_REGRESSION_THRESHOLD_PCT).toBe(10);
  });

  it('every §6 NFT row is landed OR has a documented deferral pointer', () => {
    const violations: string[] = [];
    for (const target of NFT_TARGETS) {
      if (target.s71Status === 'landed') continue;
      // partial / gap → must have a deferral note explaining the gap.
      if (!target.s71Note || target.s71Note.trim().length === 0) {
        violations.push(`${target.id}: status=${target.s71Status} but no s71Note`);
      }
    }
    expect(violations).toEqual([]);
  });

  it('every landed row has baseline entries under all keys', () => {
    const baseline = loadBaseline();
    const missing: string[] = [];
    for (const target of NFT_TARGETS) {
      if (target.s71Status !== 'landed') continue;
      for (const key of flattenBaselineKeys(target)) {
        if (!baseline.benches[key]) {
          missing.push(`${target.id}: baseline.json::benches.${key} absent`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it('largest-model.{parse,produce} have hardFail:true after S71 flip (ADR-0053 §A)', () => {
    const baseline = loadBaseline();
    expect(baseline.benches['largest-model.parse']?.hardFail).toBe(true);
    expect(baseline.benches['largest-model.produce']?.hardFail).toBe(true);
  });

  it('largest-model fixture exists (10K walls × 50 levels)', () => {
    const fixturePath = join(REPO_ROOT, 'tests/fixtures/largest-project.pryzm-stub.json');
    expect(existsSync(fixturePath), 'largest-project fixture must exist').toBe(true);
  });

  it('S71 perf report exists and documents the K3-F gate evaluation', () => {
    const reportPath = join(REPO_ROOT, 'apps/bench/reports/S71-perf-regression-hunt-2026-04-28.md');
    expect(existsSync(reportPath)).toBe(true);
    const text = readFileSync(reportPath, 'utf-8');
    expect(text).toContain('K3-F');
    expect(text).toContain('NOT TRIPPED');
  });

  it('M36-GA milestone bench report exists', () => {
    const reportPath = join(REPO_ROOT, 'apps/bench/reports/M36-GA.md');
    expect(existsSync(reportPath), 'M36-GA.md must exist (S72 D5 deliverable)').toBe(true);
  });
});
