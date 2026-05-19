// S01 reference bench — a smoke test for the harness itself.
//
// Measures parse + serialize + re-parse of the canonical Wall schema.  It
// is intentionally trivial — the real benches (cmd-execute-latency, idle-cpu,
// save-edit, orbit-fps, …) land in S02–S06 owned by their respective tracks.

import { describe, it, expect } from 'vitest';
import { Wall } from '@pryzm/protocol';
import { measure } from '../timing.js';
import { writeBenchSample } from '../save-baseline.js';

describe('schemas.roundtrip', () => {
  it('parses + re-parses the canonical Wall under the budget', async () => {
    const dto = Wall.parse({});
    const json = JSON.stringify(dto);

    const sample = await measure(
      'schemas.roundtrip.wall',
      () => {
        const decoded = JSON.parse(json);
        Wall.parse(decoded);
      },
      { samples: 200, warmup: 25, warnMs: 2.0, budgetMs: 5.0 },
    );

    writeBenchSample(sample);
    // S01 is warn-only — we record the number, we do not gate on it.
    expect(sample.p95).toBeGreaterThan(0);
  });
});
