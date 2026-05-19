/**
 * NFT-target shape lock per ADR-0053 §C.
 *
 * Asserts the canonical NFT-target list:
 *   - has a row for every 08-VISION.md §6 NFT contract (9 rows)
 *   - every row carries the 6 required fields
 *   - every benchFile path actually exists in the repo
 *   - every baselineKey is a non-empty string (or array of them)
 *   - K3-F threshold constant is the 10% spec value
 *
 * This test does NOT read live bench numbers — that's the K3-F
 * regression-gate test under apps/bench/__tests__/.  This test is
 * the *static contract* gate over the NFT-target list itself.
 */

import { describe, expect, it } from 'vitest';
import { existsSync, statSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  NFT_TARGETS,
  flattenBaselineKeys,
  K3F_REGRESSION_THRESHOLD_PCT,
  type NftTarget,
} from '../src/nft-targets.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..', '..');

describe('NFT_TARGETS — canonical list (ADR-0053 §C)', () => {
  it('has exactly 9 rows matching 08-VISION.md §6 table', () => {
    expect(NFT_TARGETS.length).toBe(9);
  });

  it('every row has all required fields with valid types', () => {
    for (const t of NFT_TARGETS) {
      expect(typeof t.id).toBe('string');
      expect(t.id.length).toBeGreaterThan(0);
      expect(/^[a-z][a-z0-9-]*$/.test(t.id)).toBe(true);
      expect(typeof t.displayName).toBe('string');
      expect(t.displayName.length).toBeGreaterThan(0);
      expect(typeof t.pryzm1Baseline).toBe('string');
      expect(typeof t.pryzm2Target).toBe('string');
      expect(typeof t.benchFile).toBe('string');
      expect(t.benchFile.startsWith('apps/bench/')).toBe(true);
      expect(['landed', 'partial', 'gap']).toContain(t.s71Status);
    }
  });

  it('every id is unique across the table', () => {
    const ids = NFT_TARGETS.map((t) => t.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('every benchFile actually exists and is non-empty', () => {
    for (const t of NFT_TARGETS) {
      const abs = resolve(REPO_ROOT, t.benchFile);
      expect(existsSync(abs)).toBe(true);
      const s = statSync(abs);
      expect(s.isFile()).toBe(true);
      expect(s.size).toBeGreaterThan(0);
    }
  });

  it('every baselineKey is a non-empty string or non-empty array of strings', () => {
    for (const t of NFT_TARGETS) {
      if (typeof t.baselineKey === 'string') {
        expect(t.baselineKey.length).toBeGreaterThan(0);
      } else {
        expect(Array.isArray(t.baselineKey)).toBe(true);
        expect(t.baselineKey.length).toBeGreaterThan(0);
        for (const k of t.baselineKey) {
          expect(typeof k).toBe('string');
          expect(k.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('partial / gap rows carry an s71Note explaining the deferral', () => {
    for (const t of NFT_TARGETS) {
      if (t.s71Status === 'partial' || t.s71Status === 'gap') {
        expect(typeof t.s71Note).toBe('string');
        expect((t.s71Note ?? '').length).toBeGreaterThan(0);
      }
    }
  });

  it('largest-model row is landed (S69 D3 baseline + S71 hardFail flip)', () => {
    const largest = NFT_TARGETS.find((t) => t.id === 'largest-model');
    expect(largest).toBeDefined();
    expect(largest!.s71Status).toBe('landed');
    expect(Array.isArray(largest!.baselineKey)).toBe(true);
    expect(largest!.baselineKey).toContain('largest-model.parse');
    expect(largest!.baselineKey).toContain('largest-model.produce');
  });
});

describe('flattenBaselineKeys()', () => {
  it('flattens single + array keys into a single list', () => {
    const flat = flattenBaselineKeys(NFT_TARGETS);
    expect(flat.length).toBeGreaterThan(NFT_TARGETS.length);
    expect(flat.every((k: string) => typeof k === 'string' && k.length > 0)).toBe(true);
  });

  it('returns empty array for empty input', () => {
    expect(flattenBaselineKeys([])).toEqual([]);
  });
});

describe('K3F_REGRESSION_THRESHOLD_PCT', () => {
  it('is 10 per PHASE-3-COMPLETION-GA-M25-M36.md §K3-F line 575', () => {
    expect(K3F_REGRESSION_THRESHOLD_PCT).toBe(10);
  });
});

describe('NFT-target list crosschecks against baseline.json', () => {
  it('every landed row has a corresponding entry in apps/bench/baseline.json', () => {
    const baselinePath = resolve(REPO_ROOT, 'apps/bench/baseline.json');
    expect(existsSync(baselinePath)).toBe(true);
    const baseline = JSON.parse(readFileSync(baselinePath, 'utf-8')) as {
      benches: Record<string, unknown>;
    };
    const benches = baseline.benches ?? {};
    const landed = NFT_TARGETS.filter((t: NftTarget) => t.s71Status === 'landed');
    for (const t of landed) {
      const keys =
        typeof t.baselineKey === 'string' ? [t.baselineKey] : t.baselineKey;
      for (const k of keys) {
        expect(
          Object.prototype.hasOwnProperty.call(benches, k),
          `landed NFT row "${t.id}" expects baseline key "${k}"`,
        ).toBe(true);
      }
    }
  });
});
