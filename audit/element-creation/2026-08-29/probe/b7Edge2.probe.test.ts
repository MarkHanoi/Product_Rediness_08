// PHASE 3 BATCH B7 measurement probe #2 -- READ-ONLY audit artefact.
// Constructs NO store and NO stores object (D6).
import { describe, it } from 'vitest';
import { bootstrapWithEverything } from '../../../../apps/editor/src/bootstrap.everything.js';

const AUDIT = { actorId: 'u', projectId: 'p', clientId: 'c', timestamp: '' } as const;
function log(tag: string, v: unknown): void {
  console.log('[B7B ' + tag + '] ' + (typeof v === 'string' ? v : JSON.stringify(v)));
}

describe('B7B -- selection verbs against the PRODUCTION storesProvider', () => {
  it('R-A: every selection verb, with a VALID payload', async () => {
    const rt = await bootstrapWithEverything({ audit: AUDIT });
    const cases: Array<[string, unknown]> = [
      ['selection.select', { targets: [{ id: 'wall-1', kind: 'wall' }], mode: 'replace' }],
      ['selection.deselect', { ids: ['wall-1'] }],
      ['selection.clear', {}],
      ['copy-selection', {}],
      ['paste-clipboard', {}],
    ];
    for (const [verb, payload] of cases) {
      try {
        const r = await rt.bus.executeCommand(verb, payload);
        log('R-A ' + verb, 'RESOLVED ' + String(JSON.stringify(r)).slice(0, 220));
      } catch (e) {
        log('R-A ' + verb, 'THREW ' + String((e as Error).message).slice(0, 240));
      }
    }
    const st = (rt.stores as any).selection?.getState?.();
    log('R-A selection store AFTER all five', { size: st?.size ?? null });
    rt.tearDown();
  });

  it('R-B: what ctx.stores.selection actually IS at the composition root', async () => {
    const rt = await bootstrapWithEverything({ audit: AUDIT });
    let captured: unknown = 'NOT CAPTURED';
    class Spy {
      readonly type = 'audit.spy.selection';
      readonly affectedStores = ['selection'] as const;
      canExecute(): { valid: boolean } { return { valid: true }; }
      execute(ctx: any): { forward: never[]; inverse: never[] } {
        const s = ctx.stores.selection;
        captured = {
          typeof: typeof s,
          ctor: s?.constructor?.name ?? null,
          isMap: s instanceof Map,
          ownKeys: s && typeof s === 'object' ? Object.keys(s).slice(0, 8) : null,
          hasSelectFn: typeof s?.select === 'function',
          hasClearFn: typeof s?.clear === 'function',
          hasGetStateFn: typeof s?.getState === 'function',
        };
        return { forward: [], inverse: [] };
      }
    }
    (rt.bus as any).register(new Spy());
    await rt.bus.executeCommand('audit.spy.selection', {});
    log('R-B ctx.stores.selection', captured);

    class Spy2 {
      readonly type = 'audit.spy.section';
      readonly affectedStores = ['section'] as const;
      canExecute(): { valid: boolean } { return { valid: true }; }
      execute(ctx: any): { forward: never[]; inverse: never[] } {
        const s = ctx.stores.section;
        captured = { typeof: typeof s, ctor: s?.constructor?.name ?? null, isMap: s instanceof Map,
          hasGetStateFn: typeof s?.getState === 'function' };
        return { forward: [], inverse: [] };
      }
    }
    (rt.bus as any).register(new Spy2());
    await rt.bus.executeCommand('audit.spy.section', {});
    log('R-B ctx.stores.section', captured);
    rt.tearDown();
  });
});

describe('B7B -- water lands in its own store via pool.create', () => {
  it('R-C: pool.create -> water record count + shape', async () => {
    const rt = await bootstrapWithEverything({ audit: AUDIT });
    const SLAB = 'slab_01ARZ3NDEKTSV4RRFFQ69G5H01';
    const POOL = 'pool_01ARZ3NDEKTSV4RRFFQ69G5H05';
    const WATER = 'water_01ARZ3NDEKTSV4RRFFQ69G5H06';
    const FLOOR = 'slab_01ARZ3NDEKTSV4RRFFQ69G5H07';
    const WALLS = [
      'wall_01ARZ3NDEKTSV4RRFFQ69G5H10', 'wall_01ARZ3NDEKTSV4RRFFQ69G5H11',
      'wall_01ARZ3NDEKTSV4RRFFQ69G5H12', 'wall_01ARZ3NDEKTSV4RRFFQ69G5H13',
    ];
    try {
      await rt.bus.executeCommand('slab.create', {
        id: SLAB, levelId: 'level-1',
        boundary: [{ x: -20, y: 0, z: -20 }, { x: 20, y: 0, z: -20 },
                   { x: 20, y: 0, z: 20 }, { x: -20, y: 0, z: 20 }],
        thickness: 0.3,
      });
    } catch (e) { log('R-C slab.create THREW', String((e as Error).message).slice(0, 250)); }
    try {
      const r = await rt.bus.executeCommand('pool.create', {
        poolId: POOL, levelId: 'level-1', hostSlabId: SLAB,
        boundary: [{ x: 0, y: 0, z: 0 }, { x: 8, y: 0, z: 0 },
                   { x: 8, y: 0, z: 4 }, { x: 0, y: 0, z: 4 }],
        wallIds: WALLS, floorSlabId: FLOOR, waterId: WATER, depth: 1.5,
      });
      log('R-C pool.create', 'RESOLVED, affectedStores=' +
        String(JSON.stringify((r as any)?.affectedStores)));
    } catch (e) { log('R-C pool.create THREW', String((e as Error).message).slice(0, 400)); }
    const w = (rt.stores as any).water?.getState?.();
    log('R-C water store', { size: w?.size ?? null, keys: w ? [...w.keys()] : null });
    if (w && w.size > 0) log('R-C water record', String(JSON.stringify([...w.values()][0])).slice(0, 800));
    rt.tearDown();
  });
});

describe('B7B -- bathroomPod through the real bus', () => {
  it('R-D: bathroomPod.create with a real payload', async () => {
    const rt = await bootstrapWithEverything({ audit: AUDIT });
    const POD = 'bathroomPod_01ARZ3NDEKTSV4RRFFQ69G5H20';
    const MEMBERS = ['m1', 'm2', 'm3', 'm4'].map((s) => 'plumbing_01ARZ3NDEKTSV4RRFFQ69G5H2' + s);
    for (const n of [3, 4, 5, 6]) {
      const ids = Array.from({ length: n }, (_v, i) => 'fx_01ARZ3NDEKTSV4RRFFQ69G5H3' + i);
      try {
        const r = await rt.bus.executeCommand('bathroomPod.create', {
          podId: POD + '_' + String(n), levelId: 'level-1',
          room: { width: 2.6, length: 3.2, doorWall: 'south', doorOffset: 1.0 },
          handedness: 'left', memberIds: ids,
        });
        log('R-D n=' + String(n), 'RESOLVED ' + String(JSON.stringify(r)).slice(0, 160));
        break;
      } catch (e) { log('R-D n=' + String(n), 'THREW ' + String((e as Error).message).slice(0, 220)); }
    }
    const st = (rt.stores as any).bathroomPod?.getState?.();
    log('R-D bathroomPod store', { size: st?.size ?? null, keys: st ? [...st.keys()] : null });
    if (st && st.size > 0) log('R-D pod record', String(JSON.stringify([...st.values()][0])).slice(0, 900));
    log('R-D MEMBERS unused', MEMBERS.length);
    rt.tearDown();
  });
});
