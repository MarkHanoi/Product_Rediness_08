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
//   ID-5  honest absence — the 11 not-yet-migrated kinds read `undefined`
//         headlessly (ADR-0318 I-3), enumerated loudly. (Was "12" before the
//         wall/slab/room wave; the census's "12 unreachable" counts `opening`,
//         which is not an element-kind store — different denominator.)
//
// STUB LEDGER: nothing on the measured path is stubbed. Real composeRuntime,
// real bootstrapWithEverything, real module singletons. The ID-3 sentinel store
// is a probe-local object registered under a probe-only kind; it stands in for
// engineLauncher's registration CALL, not for any store on a measured path.

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..', '..', '..');

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

  // ───────────────────────────────────────────────────────────────────────────
  // ADR-0318 §3 PER-KIND ADOPTION — wave 1: wall / slab / room.
  //
  // Each migrated kind must extend this probe with its own same-instance
  // assertion (ADR-0318 exit condition). ID-6/ID-7/ID-8 are the wall/slab/room
  // equivalents of ID-1/ID-2, and ID-9 closes the half ID-1 cannot see: that the
  // ENGINE half adopts the same singleton rather than constructing a rival.
  // ───────────────────────────────────────────────────────────────────────────

  /** A schema-valid RoomData (RoomDataAddSchema), so ID-8 reaches the level guard. */
  function validRoom(): Record<string, unknown> {
    const uuid = '0318a318-0318-4318-8318-' + String(++n).padStart(12, '0');
    return {
      id: uuid, type: 'room', levelId: 'level_ADR0318', name: 'ADR-0318 probe room',
      roomNumber: 'R-0318', occupancyType: 'unclassified',
      boundary: {
        polygon: [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 3 }, { x: 0, z: 3 }],
        height: 2.7, baseOffset: 0, detectionMethod: 'manual-boundary',
      },
      boundingWallIds: [], boundingSlabIds: [], boundingColumnIds: [],
      finishes: {}, properties: {},
      computed: {
        area: 12, grossArea: 12, perimeter: 14, volume: 32.4,
        centroid: { x: 2, z: 1.5 },
        boundingBox: { minX: 0, minZ: 0, maxX: 4, maxZ: 3 },
      },
      metadata: { createdAt: 1, modifiedAt: 1, createdBy: 'adr0318-probe', version: 1 },
    };
  }

  const MIGRATED: readonly { kind: string; module: string; exportName: string }[] = [
    { kind: 'wall', module: '@pryzm/geometry-wall/store', exportName: 'wallStore' },
    { kind: 'slab', module: '@pryzm/geometry-slab/store', exportName: 'slabStore' },
    { kind: 'room', module: '@pryzm/room-topology/store', exportName: 'roomStore' },
  ];

  it('ID-6: wall/slab/room ARE their module singletons (identity, per kind)', async () => {
    for (const m of MIGRATED) {
      const mod: any = await import(/* @vite-ignore */ m.module);
      const singleton = mod[m.exportName];
      const viaRuntime = rt.stores.elements.get(m.kind);
      console.log(`[ID-6] ${m.kind} identity:`,
        viaRuntime === singleton ? 'SAME INSTANCE' : 'FORK (different objects)',
        '| ctor=' + (viaRuntime?.constructor?.name ?? 'ABSENT'));
      expect(singleton).toBeTruthy();
      expect(viaRuntime).toBe(singleton);   // identity, not equality
    }
  });

  it('ID-7: a write via the RUNTIME handle is read back via the MODULE singleton (slab)', async () => {
    // MEASURED, not assumed: of the three wave-1 kinds, only SLAB has a write
    // path that takes no engine dep when `levelId` is supplied. `WallStore.add`
    // and `RoomStore.add` both run a LEVEL-EXISTENCE GUARD, which needs the
    // level authority — so headlessly they REFUSE, and ID-8 pins that refusal
    // instead. Faking a BimManager here to force a green write-through would be
    // a stub on the measured path and would let the probe grade its own
    // homework; the identity assertion in ID-6 is `toBe`, so a copy or a proxy
    // is already rejected without it.
    const { slabStore } = await import('@pryzm/geometry-slab/store');
    const slabId = bid('slab');
    const handleS = rt.stores.elements.get('slab');
    handleS.add({
      id: slabId, levelId: 'level_ADR0318', type: 'slab',
      polygon: [{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }, { x: 4, y: 0, z: 4 }, { x: 0, y: 0, z: 4 }],
      holes: [], thickness: 0.25, position: { x: 0, y: 0, z: 0 },
    });
    const sRec = slabStore.getById(slabId);
    console.log('[ID-7] slab: wrote via runtime handle; module singleton reads:',
      sRec ? 'PRESENT thickness=' + sRec.thickness : 'ABSENT (FORK)');
    expect(sRec?.thickness).toBe(0.25);
    expect(handleS.getById(slabId)).toBe(sRec);
  });

  it('ID-8: wall + room REFUSE honestly while the level authority is unattached (I-3, at method level)', async () => {
    // The other face of I-3. `elements.get('wall')` is PRESENT headlessly — but
    // presence is not permission: the level-existence guard is a real constraint
    // and an unattached store cannot evaluate it. It must therefore refuse, by
    // name, and must NOT silently skip the guard. A store that accepted a wall
    // onto a level it could not check would report success while the model went
    // nowhere — the exact liveness lie CA-21 exists to catch, relocated one
    // layer down.
    const wallMod: any = await import('@pryzm/geometry-wall/store');
    const roomMod: any = await import('@pryzm/room-topology/store');
    const cases: { kind: string; attached: boolean; add: () => void; errName: string }[] = [
      {
        kind: 'wall',
        attached: wallMod.wallStore.isEngineAttached(),
        errName: 'WallStoreEngineNotAttachedError',
        add: () => rt.stores.elements.get('wall').add({
          id: bid('wall'), levelId: 'level_ADR0318', type: 'wall',
          baseLine: [{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }],
          height: 2.7, thickness: 0.2, openings: [], childrenIds: [],
        }),
      },
      {
        kind: 'room',
        attached: roomMod.roomStore.isEngineAttached(),
        errName: 'RoomStoreEngineNotAttachedError',
        // A SCHEMA-VALID room, deliberately: RoomStore.add runs the Zod gate
        // BEFORE the level guard, so an invalid payload would be refused for the
        // wrong reason and the guard would never be reached. Getting past the
        // schema is what makes this a test of the level authority.
        add: () => rt.stores.elements.get('room').add(validRoom()),
      },
    ];
    for (const c of cases) {
      expect(c.attached).toBe(false);          // headless: genuinely unattached
      let threw: unknown = null;
      try { c.add(); } catch (e) { threw = e; }
      const name = threw ? ((threw as Error).name || 'Error') : 'NOTHING';
      console.log(`[ID-8] ${c.kind}: engineAttached=${c.attached} | unattached add refused with: ` +
        (threw ? name : 'NOTHING (silent acceptance — BROKEN)'));
      expect(threw).toBeTruthy();
      // The refusal must be the TYPED engine-absence one, so the reason a caller
      // reads is the real reason — not an incidental schema complaint that would
      // survive even if the guard had been skipped.
      expect(name).toBe(c.errName);
    }
  });

  it('ID-9: the ENGINE half ADOPTS these singletons — zero rival production constructions', () => {
    // ID-6 proves registry ≡ module singleton. It cannot see the other half of
    // I-1: that the instance `initBuilders.ts` hands to `registerAllStores()`
    // and `initPersistence()` (→ ProjectSerializer) is that SAME object. That is
    // a source fact, and it is asserted here rather than assumed, because a
    // reintroduced `new WallStore(projectContext, …)` would silently restore the
    // fork while every runtime assertion above stayed green.
    const raw = readFileSync(path.join(REPO_ROOT, 'apps', 'editor', 'src', 'engine', 'initBuilders.ts'), 'utf8');
    // CODE only. The adoption comments themselves quote `new WallStore(...)` to
    // say why it must not exist, and a scanner that counted its own warning
    // would be unfailable — the defect this whole probe family exists to avoid.
    const src = raw
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n').map((l) => l.replace(/\/\/.*/, '')).join('\n');
    for (const ctor of ['WallStore', 'SlabStore', 'RoomStore']) {
      const rival = new RegExp(String.raw`new\s+${ctor}\s*\(`).test(src);
      console.log(`[ID-9] initBuilders.ts constructs a rival ${ctor}:`, rival ? 'YES (I-1 BROKEN)' : 'NO (adopts the singleton)');
      expect(rival).toBe(false);
    }
    for (const attach of ['wallStoreSingleton.attachEngine', 'slabStoreSingleton.attachEngine', 'roomStoreSingleton.attachEngine']) {
      console.log(`[ID-9] initBuilders.ts adopts via ${attach}:`, src.includes(attach) ? 'YES' : 'NO (ADOPTION MISSING)');
      expect(src.includes(attach)).toBe(true);
    }
  });

  it('ID-5: honest absence — unmigrated kinds are undefined headlessly, loudly', () => {
    const UNMIGRATED = ['roof','ceiling','floor','furniture',
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
    // Wave 1 of the per-kind migration — pinned so a regression is named.
    expect(rt.stores.elements.has('wall')).toBe(true);
    expect(rt.stores.elements.has('slab')).toBe(true);
    expect(rt.stores.elements.has('room')).toBe(true);
  });
});
