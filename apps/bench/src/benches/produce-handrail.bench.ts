// Bench: `produce-handrail` — S14-T6. Warn-only.

import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { produceHandrail } from '../../../../packages/geometry-kernel/src/producers/handrail.js';
import { NO_JOINS } from '../../../../packages/geometry-kernel/src/types/JoinData.js';
import { getHandrailFixture } from '../../../../packages/geometry-kernel/__tests__/__configs__/handrail-index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
mkdirSync(resolve(__dirname, '..', '..', '.run-output'), { recursive: true });
mkdirSync(resolve(__dirname, '..', '..', 'reports'), { recursive: true });

function pct(s: number[], p: number): number {
  if (s.length === 0) return 0;
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]!;
}
function run(name: string, fixId: string) {
  const f = getHandrailFixture(fixId);
  produceHandrail(f.handrail, NO_JOINS, f.worldY);
  const samples = new Array<number>(500);
  for (let i = 0; i < 500; i++) {
    const s = performance.now();
    produceHandrail(f.handrail, NO_JOINS, f.worldY);
    samples[i] = performance.now() - s;
  }
  samples.sort((a, b) => a - b);
  return { name, p50: pct(samples, 50), p95: pct(samples, 95), p99: pct(samples, 99) };
}
describe('produce-handrail bench (warn-only)', () => {
  for (const fix of ['round-straight', 'square-stair-rake', 'round-l-shape'] as const) {
    it(fix, () => {
      const s = run(fix, fix);
      console.log(`[bench:produce-handrail] ${JSON.stringify(s)}`);
      expect(s.p50).toBeGreaterThanOrEqual(0);
    });
  }
});
