// Bench: `produce-ceiling` — S14-T8. Warn-only.

import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { produceCeiling } from '../../../../packages/geometry-kernel/src/producers/ceiling.js';
import { NO_JOINS } from '../../../../packages/geometry-kernel/src/types/JoinData.js';
import { getCeilingFixture } from '../../../../packages/geometry-kernel/__tests__/__configs__/ceiling-index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
mkdirSync(resolve(__dirname, '..', '..', '.run-output'), { recursive: true });
mkdirSync(resolve(__dirname, '..', '..', 'reports'), { recursive: true });

function pct(s: number[], p: number): number {
  if (s.length === 0) return 0;
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]!;
}
function run(name: string, fixId: string) {
  const f = getCeilingFixture(fixId);
  produceCeiling(f.ceiling, NO_JOINS, f.worldY);
  const samples = new Array<number>(500);
  for (let i = 0; i < 500; i++) {
    const s = performance.now();
    produceCeiling(f.ceiling, NO_JOINS, f.worldY);
    samples[i] = performance.now() - s;
  }
  samples.sort((a, b) => a - b);
  return { name, p50: pct(samples, 50), p95: pct(samples, 95), p99: pct(samples, 99) };
}
describe('produce-ceiling bench (warn-only)', () => {
  for (const fix of ['rect-residential', 'l-shape-office', 'pentagon-acoustic'] as const) {
    it(fix, () => {
      const s = run(fix, fix);
      console.log(`[bench:produce-ceiling] ${JSON.stringify(s)}`);
      expect(s.p50).toBeGreaterThanOrEqual(0);
    });
  }
});
