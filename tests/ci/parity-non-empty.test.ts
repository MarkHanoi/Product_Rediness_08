// Cross-cutting CI guard #1 — every parity family must have a
// non-empty `configs/` and `snapshots/` directory.
//
// Source: `PHASE-1-COMPLETION-PLAN.md` §5.1 #1 — a vacuous-pass
// parity test (zero fixtures) becomes a CI failure.

import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PARITY_ROOT = resolve(__dirname, '../parity');

const FAMILIES = [
  'wall', 'door', 'window', 'slab', 'roof', 'curtain-wall',
  'grid', 'column', 'beam', 'stair', 'handrail', 'ceiling',
] as const;

describe('CI guard — parity directories non-empty (W-1C cross-cut)', () => {
  for (const fam of FAMILIES) {
    it(`tests/parity/${fam}/configs/ contains at least one config`, () => {
      const dir = resolve(PARITY_ROOT, fam, 'configs');
      expect(existsSync(dir), `Missing dir: ${dir}`).toBe(true);
      const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
      expect(files.length, `Empty configs dir: ${dir}`).toBeGreaterThan(0);
    });

    it(`tests/parity/${fam}/snapshots/ contains at least one snapshot`, () => {
      const dir = resolve(PARITY_ROOT, fam, 'snapshots');
      expect(existsSync(dir), `Missing dir: ${dir}`).toBe(true);
      const files = readdirSync(dir).filter((f) => f.endsWith('.snap.json'));
      expect(files.length, `Empty snapshots dir: ${dir}`).toBeGreaterThan(0);
    });
  }

  it('total parity fixtures across all 12 families ≥ 163 (Phase 1C exit budget)', () => {
    let total = 0;
    for (const fam of FAMILIES) {
      const dir = resolve(PARITY_ROOT, fam, 'snapshots');
      if (existsSync(dir)) {
        total += readdirSync(dir).filter((f) => f.endsWith('.snap.json')).length;
      }
    }
    expect(total, `Total parity fixtures = ${total}; budget = 163`).toBeGreaterThanOrEqual(163);
  });
});
