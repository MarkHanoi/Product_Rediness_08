// apps/sync-server/__tests__/CollabGraphIntegrity.test.ts
//
// Regression pin for the C8 harness (`src/collab-gate/collabGraphIntegrity.ts`),
// so the gate's subject cannot rot silently between gate runs.
//
// Two tests, and the second is the one that matters:
//   ① the real run is clean, with its counts above the declared floors;
//   ② the CHECKER detects a dangling host.  Without ②, ① is compatible with a
//      checker that returns "no violations" unconditionally — which is exactly
//      the failure mode `check-collab-graph-integrity` reports as
//      `blind-comparator`.

import { describe, expect, it } from 'vitest';
import { YjsDocAdapter } from '@pryzm/sync-client';
import {
  checkHosting,
  runCollabGraphIntegrity,
  MIN_COMPARED_ELEMENTS,
  MIN_COMPARED_RELATIONSHIPS,
} from '../src/collab-gate/collabGraphIntegrity.js';

describe('C8 harness — collaboration preserves relationships', () => {
  it('the local two-client run is clean, transport-probed, and above its floors', async () => {
    const report = await runCollabGraphIntegrity({ timeoutMs: 12_000 });

    // "no transport" must never read as "converged fine".
    expect(report.misconfiguredReason).toBeUndefined();
    expect(report.transport.probed).toBe(true);
    expect(report.transport.converged).toBe(true);

    // Emptiness is never a pass — the comparator reports what it compared.
    expect(report.comparedElements).toBeGreaterThanOrEqual(MIN_COMPARED_ELEMENTS);
    expect(report.comparedRelationships).toBeGreaterThanOrEqual(MIN_COMPARED_RELATIONSHIPS);

    // The checker demonstrated on this very run that it can fail.
    expect(report.negativeControl).toEqual({ ran: true, detected: true });

    expect(report.violations).toEqual([]);
    expect(report.status).toBe('clean');
  }, 90_000);

  it('the checker flags a dangling host — it can say otherwise', () => {
    const a = new YjsDocAdapter('unit-negative-control');
    const b = new YjsDocAdapter('unit-negative-control');
    a.applyCommand('wall.create', { id: 'w1', height: 3 });
    a.applyCommand('door.create', { id: 'd1', wallId: 'w1', width: 0.9 });
    b.applyUpdate(a.encodeStateAsUpdate());
    b.applyCommand('element.updateParameters', {
      elementId: 'd1',
      elementType: 'door',
      parameters: { wallId: 'w-does-not-exist' },
    });

    const clean = checkHosting('control', [{ label: 'A', adapter: a }], 'd1', ['w1']);
    expect(clean.violations).toEqual([]);

    const broken = checkHosting('control', [{ label: 'B', adapter: b }], 'd1', ['w1']);
    expect(broken.violations.map((v) => v.kind)).toContain('hosting-edge-dangling');

    // …and a genuine A-vs-B disagreement about the host is its own kind.
    const diverged = checkHosting(
      'control',
      [{ label: 'A', adapter: a }, { label: 'B', adapter: b }],
      'd1',
      ['w1', 'w-does-not-exist'],
    );
    expect(diverged.violations.map((v) => v.kind)).toContain('hosting-edge-diverged');

    a.destroy();
    b.destroy();
  });
});
