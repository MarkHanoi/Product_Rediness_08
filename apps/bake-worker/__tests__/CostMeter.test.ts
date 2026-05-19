// CostMeter.test.ts — exit criteria #5 + #10 (R2 cost audit + telemetry).
//
// Spec source: `phases/PHASE-1D-Q4-M10-M12-BAKE-PRYZM-ALPHA.md`
//   • S21 exit #5 (line 877) — per-event R2 cost audited and documented.
//   • S21 exit #10 — `bake.event.cost` telemetry stream live.

import { describe, expect, it } from 'vitest';
import { InMemoryStorageDriver } from '@pryzm/storage-driver';
import { CostMeter, R2_PRICING } from '../src/cost/CostMeter.js';

describe('CostMeter', () => {
  it('records per-event delta from storage driver stats', async () => {
    const storage = new InMemoryStorageDriver();
    const meter = new CostMeter(storage);

    const bytes = new Uint8Array(1024);
    await storage.put('hash-1', bytes);

    const delta = meter.recordEvent({ projectId: 'p', levelId: 'L', jobId: 'j-1' });

    expect(delta.classBOps).toBe(1);
    expect(delta.bytesUploaded).toBe(1024);
    expect(delta.opCostUsd).toBeCloseTo(R2_PRICING.classBOpUsd, 12);
  });

  it('aggregates totals across multiple recordEvent calls', async () => {
    const storage = new InMemoryStorageDriver();
    const meter = new CostMeter(storage);

    for (let i = 0; i < 5; i++) {
      await storage.put(`h-${i}`, new Uint8Array(100));
      meter.recordEvent({ projectId: 'p', levelId: 'L', jobId: `j-${i}` });
    }

    const totals = meter.totals();
    expect(totals.classBOps).toBe(5);
    expect(totals.bytesUploaded).toBe(500);
    expect(meter.eventCount()).toBe(5);
  });

  it('summary() reports per-event USD averaged across all events', async () => {
    const storage = new InMemoryStorageDriver();
    const meter = new CostMeter(storage);

    for (let i = 0; i < 3; i++) {
      await storage.put(`h-${i}`, new Uint8Array(50));
      meter.recordEvent({ projectId: 'p', levelId: 'L', jobId: `j-${i}` });
    }

    const summary = meter.summary();
    expect(summary.eventCount).toBe(3);
    expect(summary.classBOps).toBe(3);
    expect(summary.perEventUsd).toBeCloseTo(R2_PRICING.classBOpUsd, 12);
  });

  it('zero-event summary returns zero perEventUsd (no NaN)', async () => {
    const meter = new CostMeter(new InMemoryStorageDriver());
    expect(meter.summary().perEventUsd).toBe(0);
  });

  it('R2_PRICING constants match spec line 639 (Cloudflare R2 published rates)', () => {
    // $0.36 per 1M Class B operations
    expect(R2_PRICING.classBOpUsd * 1_000_000).toBeCloseTo(0.36, 6);
    // $0.36 per 10M Class A operations
    expect(R2_PRICING.classAOpUsd * 10_000_000).toBeCloseTo(0.36, 6);
    // $0.015 per GB-month storage
    expect(R2_PRICING.storageUsdPerByteMonth * (1024 ** 3)).toBeCloseTo(0.015, 6);
  });
});
