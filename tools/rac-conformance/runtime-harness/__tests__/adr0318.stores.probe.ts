// ADR-0318 — SAME-INSTANCE probe (`§STORE-IDENTITY-NOT-CONSTRUCTION`).
//
// Proves, executed and headless, that `runtime.stores.elements` is a LIVE VIEW
// over the SAME objects the rest of the system reads — never a copy, never a
// rival construction:
//
//   ID-1  runtime.stores.elements.get('door') === the doorStore module singleton
//         ProjectSerializer imports (identity, not deep-equal).
//   ID-2  a write through the RUNTIME handle is visible through the MODULE
//         singleton (one store, two paths — the no-fork proof).
//   ID-3  the slot is backed by the ONE storeRegistry: the deep-path import
//         (`@pryzm/core-app-model/store-registry`, what composeRuntime uses)
//         and the barrel import (`@pryzm/core-app-model`, what engineLauncher's
//         initStores.ts uses) are the same singleton — so engineLauncher's
//         registerAllStores() writes land in runtime.stores.elements with zero
//         new wiring.
//   ID-4  FALSIFIABILITY — a fresh `new DoorStore()` (the plugin-DTO rival
//         shape) is REJECTED by the identity check; the probe cannot be
//         satisfied by a copy.
//   ID-5  honest absence — the 12 not-yet-migrated kinds read `undefined`
//         headlessly (ADR-0318 I-3), enumerated loudly.
//
// STUB LEDGER: nothing on the measured path is stubbed. Real composeRuntime,
// real bootstrapWithEverything, real module singletons. The ID-3 sentinel store
// is a probe-local object registered under a probe-only kind; it stands in for
// engineLauncher's registration CALL, not for any store on a measured path.

import { describe, it, expect, beforeAll } from 'vitest';

let rt: any;

beforeAll(async () => {
  const { composeRuntime } = await import('@pryzm/runtime-composer');
  const { bootstrapWithEverything } = await import('@pryzm/editor/bootstrap.everything');
  rt = await composeRuntime({
    audit: { actorId: 'rac-harness', projectId: 'rac-probe', clientId: 'node' },
    canvas: null,
    bootstrapFn: bootstrapWithEverything as never,
  });
}, 600_000);

const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
let n = 0;
function bid(prefix: string): string {
  n += 1;
  let s = '';
  for (let i = 0; i < 26; i++) s += B32[(i * 7 + n * 13 + prefix.length) % 32];
  return prefix + '_' + s;
}

describe('ADR-0318 — runtime.stores.elements is the authoritative registry, by identity', () => {
  it('slot exists and enumerates (runtime.stores keys, kinds present/absent)', () => {
    console.log('[ADR-0318] runtime.stores keys:', Object.keys(rt.stores).sort().join(','));
    expect(rt.stores.elements).toBeTruthy();
    const KINDS = ['wall','slab','roof','room','ceiling','floor','furniture','plumbing',
      'stair','column','curtainwall','grid','beam','handrail','door','window'];
    for (const k of KINDS) {
      const s = rt.stores.elements.get(k);
      console.log(`[ADR-0318] elements.get('${k}'):`,
        s ? 'PRESENT (' + (s.constructor?.name ?? typeof s) + ')' : 'ABSENT (headless — per ADR-0318 exit condition)');
    }
    console.log('[ADR-0318] kinds():', rt.stores.elements.kinds().join(',') || '(none)');
  });

  it('ID-1: get("door") / get("window") ARE the module singletons the serializer imports', async () => {
    const { doorStore } = await import('@pryzm/geometry-door');
    const { windowStore } = await import('@pryzm/geometry-window');
    const viaRuntimeDoor = rt.stores.elements.get('door');
    const viaRuntimeWindow = rt.stores.elements.get('window');
    console.log('[ID-1] door identity:', viaRuntimeDoor === doorStore ? 'SAME INSTANCE' : 'FORK (different objects)');
    console.log('[ID-1] window identity:', viaRuntimeWindow === windowStore ? 'SAME INSTANCE' : 'FORK (different objects)');
    expect(viaRuntimeDoor).toBe(doorStore);       // identity, not equality
    expect(viaRuntimeWindow).toBe(windowStore);
  });

  it('ID-2: a write via the RUNTIME handle is read back via the MODULE singleton', async () => {
    const { doorStore } = await import('@pryzm/geometry-door');
    const id = bid('door');
    const handle = rt.stores.elements.get('door');
    // Write through the runtime-obtained handle…
    handle.add({ id, openingId: bid('opening'), wallId: bid('wall'), offset: 6.25,
      width: 0.9, height: 2.1, sillHeight: 0, doorType: 'single' });
    // …read through the independently imported module singleton.
    const rec = doorStore.getById(id);
    console.log('[ID-2] wrote offset=6.25 via runtime handle; module singleton reads:',
      rec ? 'PRESENT offset=' + rec.offset : 'ABSENT (FORK)');
    expect(rec?.offset).toBe(6.25);
    // And the records are the SAME object, not a serialized copy.
    expect(handle.getById(id)).toBe(rec);
  });

  it('ID-3: deep-path and barrel storeRegistry are ONE singleton — engineLauncher writes land here', async () => {
    const deep = (await import('@pryzm/core-app-model/store-registry')).storeRegistry;
    const barrel = (await import('@pryzm/core-app-model')).storeRegistry;
    console.log('[ID-3] deep === barrel registry:', deep === barrel ? 'SAME INSTANCE' : 'TWO REGISTRIES (BROKEN)');
    expect(deep).toBe(barrel);
    // Simulate the engineLauncher direction: a registration made the way
    // initStores.ts makes them (via the barrel singleton) is immediately
    // visible through runtime.stores.elements — same registry object.
    const sentinel = { getAll: () => [] };
    barrel.register('adr0318-sentinel', sentinel as any);
    const seen = rt.stores.elements.get('adr0318-sentinel');
    console.log('[ID-3] barrel-registered sentinel via runtime.stores.elements:',
      seen === sentinel ? 'SAME INSTANCE' : 'NOT VISIBLE (BROKEN)');
    expect(seen).toBe(sentinel);
    barrel.unregister('adr0318-sentinel');
  });

  it('ID-4: FALSIFIABILITY — a fresh rival DoorStore is REJECTED by the identity check', async () => {
    const { DoorStore, doorStore } = await import('@pryzm/geometry-door') as any;
    const rival = new DoorStore();          // the plugin-DTO defect shape
    const viaRuntime = rt.stores.elements.get('door');
    const wouldPassWithCopy = viaRuntime === rival;
    console.log('[ID-4] rival new DoorStore() satisfies identity check:',
      wouldPassWithCopy ? 'YES (BROKEN PROBE)' : 'NO (probe rejects copies — trustworthy)');
    expect(wouldPassWithCopy).toBe(false);
    expect(viaRuntime).toBe(doorStore);
  });

  it('ID-5: honest absence — unmigrated kinds are undefined headlessly, loudly', () => {
    const UNMIGRATED = ['wall','slab','roof','room','ceiling','floor','furniture',
      'plumbing','stair','column','curtainwall','grid','beam','handrail'];
    const absent = UNMIGRATED.filter((k) => rt.stores.elements.get(k) === undefined);
    const present = UNMIGRATED.filter((k) => rt.stores.elements.get(k) !== undefined);
    console.log('[ID-5] headless ABSENT (' + absent.length + '):', absent.join(','));
    console.log('[ID-5] headless PRESENT beyond door/window (' + present.length + '):',
      present.join(',') || '(none — as expected until per-kind migration)');
    // No assertion pinning the count: per-kind migrations SHRINK this list, and
    // this probe must go greener, not red, as they land. The loud enumeration
    // is the deliverable; door/window presence is pinned in ID-1.
    expect(rt.stores.elements.has('door')).toBe(true);
    expect(rt.stores.elements.has('window')).toBe(true);
  });
});
