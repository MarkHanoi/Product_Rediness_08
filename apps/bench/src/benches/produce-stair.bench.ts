// Bench: `produce-stair` — S14-T3.  Warn-only on Replit.

import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { produceStair } from '../../../../packages/geometry-kernel/src/producers/stair.js';
import { NO_JOINS } from '../../../../packages/geometry-kernel/src/types/JoinData.js';
import { getStairFixture } from '../../../../packages/geometry-kernel/__tests__/__configs__/stair-index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RUN_OUTPUT = resolve(__dirname, '..', '..', '.run-output');
const REPORTS = resolve(__dirname, '..', '..', 'reports');
mkdirSync(RUN_OUTPUT, { recursive: true });
mkdirSync(REPORTS, { recursive: true });

interface BenchSample { scenario: string; cold: number; warmAvg: number; p50: number; p95: number; p99: number; budgetMs: number }

function pct(s: number[], p: number): number {
  if (s.length === 0) return 0;
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]!;
}

function runScenario(name: string, fixId: string, budgetMs: number): BenchSample {
  const f = getStairFixture(fixId);
  const t0 = performance.now();
  produceStair(f.stair, NO_JOINS, f.worldY);
  const cold = performance.now() - t0;
  const warm: number[] = [];
  for (let i = 0; i < 99; i++) {
    const s = performance.now();
    produceStair(f.stair, NO_JOINS, f.worldY);
    warm.push(performance.now() - s);
  }
  const warmAvg = warm.reduce((a, b) => a + b, 0) / warm.length;
  const samples = new Array<number>(1000);
  for (let i = 0; i < samples.length; i++) {
    const s = performance.now();
    produceStair(f.stair, NO_JOINS, f.worldY);
    samples[i] = performance.now() - s;
  }
  samples.sort((a, b) => a - b);
  return { scenario: name, cold, warmAvg, p50: pct(samples, 50), p95: pct(samples, 95), p99: pct(samples, 99), budgetMs };
}

describe('produce-stair bench (warn-only)', () => {
  for (const [name, id, budget] of [
    ['straight-residential', 'straight-residential', 5],
    ['l-shape-mid', 'l-shape-mid', 8],
    ['u-shape-heavy', 'u-shape-heavy', 12],
  ] as const) {
    it(`${name}`, () => {
      const s = runScenario(name, id, budget);
      console.log(`[bench:produce-stair] ${JSON.stringify(s)}`);
      expect(s.warmAvg).toBeGreaterThan(0);
    });
  }
});
