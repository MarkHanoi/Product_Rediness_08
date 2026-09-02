// §PERF-STORESVIEW-MEMO (2026-09-02 perf lane, diagnosis fix 6).
//
// SUBJECT: bootstrap.ts's `storesAsRecordView` rebuilt `Object.fromEntries`
// over EVERY registered store's whole Map on EVERY bus dispatch. Its own
// comment promised "for S06 we'll add a memoised view if it shows up in the
// bench" — BASE-INNER measured it at 0.117 → 0.672 ms/dispatch as the wall
// store grows to 1000 elements, on every verb. This suite pins the memo:
// per-store dirty-flag invalidation via Store.subscribeDirty (the ONLY
// mutation door — attachStores routes all bus patches through applyPatch,
// which fires the dirty listeners).
//
// RED-FIRST: at the pre-fix code the identity assertions fail (every call
// built fresh objects). The FRESHNESS assertions held before and must still
// hold after — they are the behaviour-preservation guard (C03: handlers must
// always see latest state at context-build time).

import { describe, expect, it } from 'vitest';
import { CubeStore, Store } from '@pryzm/stores';
import { bootstrap } from '../src/bootstrap.js';

const AUDIT = { actorId: 'u', projectId: 'p', clientId: 'c', timestamp: '' } as const;

function fetchView(rt: ReturnType<typeof bootstrap>): Record<string, Record<string, unknown>> {
  // Phase D (C03 §4.1) public surface over the private storesProvider.
  return (rt.bus as unknown as {
    fetchStores(ids: readonly string[]): Record<string, Record<string, unknown>>;
  }).fetchStores(['cube', 'other']);
}

describe('§PERF-STORESVIEW-MEMO — storesAsRecordView is dirty-flag memoized', () => {
  it('repeat provider calls with no intervening mutation reuse the SAME view objects', () => {
    const rt = bootstrap({ audit: AUDIT, stores: { cube: new CubeStore() as Store<object> } });
    const v1 = fetchView(rt);
    const v2 = fetchView(rt);
    // Pre-fix: fresh Object.fromEntries per call — identity differs. RED.
    expect(v2.cube).toBe(v1.cube);
    rt.tearDown();
  });

  it('a mutation invalidates EXACTLY the touched store and the view stays fresh', () => {
    const cube = new CubeStore();
    const other = new Store<{ v: number }>('other');
    const rt = bootstrap({ audit: AUDIT, stores: { cube: cube as Store<object>, other: other as Store<object> } });

    const v1 = fetchView(rt);
    expect(Object.keys(v1).sort()).toEqual(['cube', 'other']);

    // Mutate through the ONE mutation door the bus itself uses (attachStores →
    // applyPatch), which fires subscribeDirty.
    cube.applyPatch([{ op: 'add', path: ['c1'], value: { x: 1, y: 2, z: 3 } }]);

    const v2 = fetchView(rt);
    // FRESHNESS (held pre-fix, must hold post-fix): the handler context view
    // reflects the mutation.
    expect(v2.cube['c1']).toBeTruthy();
    expect((v2.cube['c1'] as { x: number }).x).toBe(1);
    // The touched store's inner view was rebuilt…
    expect(v2.cube).not.toBe(v1.cube);
    // …and the untouched store's inner view kept its identity (per-store
    // granularity — pre-fix this also failed: everything rebuilt every call).
    expect(v2.other).toBe(v1.other);

    // Removal invalidates too.
    cube.applyPatch([{ op: 'remove', path: ['c1'] }]);
    const v3 = fetchView(rt);
    expect(v3.cube['c1']).toBeUndefined();

    rt.tearDown();
    // Post-tearDown mutations must not throw (dirty subscriptions disposed).
    expect(() => cube.applyPatch([{ op: 'add', path: ['c2'], value: { x: 0, y: 0, z: 0 } }])).not.toThrow();
  });
});
