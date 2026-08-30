// PHASE 3 BATCH B4 measurement probe -- READ-ONLY audit artefact.
// Dispatches furniture / lighting / plumbing / room through the REAL composition
// root (bootstrapWithEverything). Constructs NO store and NO stores object (D6).
import { describe, it } from 'vitest';
import { bootstrapWithEverything, ELEMENT_PLUGIN_IDS } from '../../../../apps/editor/src/bootstrap.everything.js';

const AUDIT = { actorId: 'u', projectId: 'p', clientId: 'c', timestamp: '' } as const;

const FURN_ID  = 'furniture_01ARZ3NDEKTSV4RRFFQ69G5FB1';
const LIGHT_ID = 'lighting_01ARZ3NDEKTSV4RRFFQ69G5FB2';
const PLUMB_ID = 'plumbing_01ARZ3NDEKTSV4RRFFQ69G5FB3';
const FURN_ID2 = 'furniture_01ARZ3NDEKTSV4RRFFQ69G5FB4';

/* eslint-disable @typescript-eslint/no-explicit-any */

function ids(store: any): string[] {
  try {
    const st = store.getState();
    if (st && typeof st.keys === 'function') return [...st.keys()];
    return Object.keys(st ?? {});
  } catch (e) { return ['<getState threw: ' + String(e) + '>']; }
}

function rec(store: any, id: string): string {
  try {
    const st = store.getState();
    const v = (st && typeof st.get === 'function') ? st.get(id) : st?.[id];
    return String(JSON.stringify(v)).slice(0, 700);
  } catch (e) { return '<threw ' + String(e) + '>'; }
}

async function out(rt: any, verb: string, payload: unknown): Promise<string> {
  try { await rt.bus.executeCommand(verb, payload); return 'OK'; }
  catch (e) { return (e as Error).message ?? String(e); }
}

describe('B4 probe -- registration facts at the real composition root', () => {
  it('P-A: storeKeys / handler types / ELEMENT_PLUGIN_IDS membership', async () => {
    const rt = await bootstrapWithEverything({ audit: AUDIT });
    const S = rt.stores as Record<string, unknown>;
    console.log('[B4 P-A] ALL rt.stores keys:', JSON.stringify(Object.keys(S).sort()));
    for (const k of ['furniture', 'lighting', 'plumbing', 'rooms', 'room', 'bathroomPod']) {
      console.log('[B4 P-A] rt.stores.' + k + ' present =', S[k] !== undefined);
    }
    for (const id of ['furniture', 'lighting', 'plumbing', 'rooms']) {
      console.log('[B4 P-A] registeredStoreKeys[' + id + '] =',
        JSON.stringify((rt.registeredStoreKeys as Record<string, unknown>)[id]));
      console.log('[B4 P-A] registeredHandlerTypes[' + id + '] =',
        JSON.stringify((rt.registeredHandlerTypes as Record<string, unknown>)[id]));
      console.log('[B4 P-A] ELEMENT_PLUGIN_IDS has ' + id + ' =',
        (ELEMENT_PLUGIN_IDS as readonly string[]).includes(id));
    }
    rt.tearDown();
  });
});

describe('B4 probe -- dispatchability + committed record shape', () => {
  it('P-B: furniture.create with the PLUGIN TOOL payload (origin/catalogId)', async () => {
    const rt = await bootstrapWithEverything({ audit: AUDIT });
    console.log('[B4 P-B] outcome:', await out(rt, 'furniture.create', {
      id: FURN_ID, levelId: 'L0', catalogId: 'cat-sofa',
      origin: { x: 3, y: 0, z: 4 }, rotation: 0, scale: 1,
    }));
    console.log('[B4 P-B] furniture ids:', JSON.stringify(ids((rt.stores as any).furniture)));
    console.log('[B4 P-B] record:', rec((rt.stores as any).furniture, FURN_ID));
    rt.tearDown();
  });

  it('P-C: furniture.create with the EDITOR payload (furnitureType/position)', async () => {
    const rt = await bootstrapWithEverything({ audit: AUDIT });
    console.log('[B4 P-C] outcome:', await out(rt, 'furniture.create', {
      id: FURN_ID2, levelId: 'L0', furnitureType: 'sofa',
      position: { x: 3, y: 0, z: 4 }, rotation: 0,
      width: 2, length: 0.9, height: 0.8, material: 'fabric', baseOffset: 0,
    }));
    console.log('[B4 P-C] record:', rec((rt.stores as any).furniture, FURN_ID2));
    rt.tearDown();
  });

  it('P-D: furniture.create with the TELEMETRY payload {} (FurnitureTool.ts:625)', async () => {
    const rt = await bootstrapWithEverything({ audit: AUDIT });
    console.log('[B4 P-D] outcome:', await out(rt, 'furniture.create', {}));
    const list = ids((rt.stores as any).furniture);
    console.log('[B4 P-D] furniture ids after {}:', JSON.stringify(list));
    if (list[0]) console.log('[B4 P-D] ghost record:', rec((rt.stores as any).furniture, list[0]));
    rt.tearDown();
  });

  it('P-E: lighting.create (tool payload kind/origin)', async () => {
    const rt = await bootstrapWithEverything({ audit: AUDIT });
    console.log('[B4 P-E] outcome:', await out(rt, 'lighting.create', {
      id: LIGHT_ID, levelId: 'L0', kind: 'downlight', origin: { x: 1, y: 2.7, z: 1 },
    }));
    console.log('[B4 P-E] record:', rec((rt.stores as any).lighting, LIGHT_ID));
    rt.tearDown();
  });

  it('P-F: plumbing.create with the TELEMETRY payload {} (PlumbingTool.ts:414)', async () => {
    const rt = await bootstrapWithEverything({ audit: AUDIT });
    console.log('[B4 P-F] outcome:', await out(rt, 'plumbing.create', {}));
    const list = ids((rt.stores as any).plumbing);
    console.log('[B4 P-F] plumbing ids after {}:', JSON.stringify(list));
    if (list[0]) console.log('[B4 P-F] ghost record:', rec((rt.stores as any).plumbing, list[0]));
    rt.tearDown();
  });

  it('P-G: plumbing.create with the DECLARED bus type (fixtureType/position)', async () => {
    const rt = await bootstrapWithEverything({ audit: AUDIT });
    console.log('[B4 P-G] outcome:', await out(rt, 'plumbing.create', {
      id: PLUMB_ID, levelId: 'L0', fixtureType: 'toilet', position: { x: 2, y: 0, z: 3 },
    }));
    console.log('[B4 P-G] record:', rec((rt.stores as any).plumbing, PLUMB_ID));
    rt.tearDown();
  });

  it('P-H: plumbing.createFixture (the reachable fixture route) headless', async () => {
    const rt = await bootstrapWithEverything({ audit: AUDIT });
    console.log('[B4 P-H] outcome:', await out(rt, 'plumbing.createFixture', {
      id: PLUMB_ID, levelId: 'L0', fixtureType: 'toilet',
      position: { x: 2, y: 0, z: 3 }, rotation: { x: 0, y: 0, z: 0 },
    }));
    console.log('[B4 P-H] plumbing ids:', JSON.stringify(ids((rt.stores as any).plumbing)));
    rt.tearDown();
  });

  it('P-I: room.create telemetry {} and complete record', async () => {
    const rt = await bootstrapWithEverything({ audit: AUDIT });
    console.log('[B4 P-I] {} outcome:', await out(rt, 'room.create', {}));
    console.log('[B4 P-I] complete outcome:', await out(rt, 'room.create', {
      id: '0318a318-0318-4318-8318-0000000000b4', type: 'room', levelId: 'L0',
      name: 'B4', roomNumber: 'R-B4', occupancyType: 'unclassified',
      boundary: {
        polygon: [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 3 }, { x: 0, z: 3 }],
        height: 2.7, baseOffset: 0, detectionMethod: 'manual-boundary',
      },
      boundingWallIds: [], boundingSlabIds: [], boundingColumnIds: [],
      finishes: {}, properties: {},
      computed: {
        area: 12, grossArea: 12, perimeter: 14, volume: 32.4,
        centroid: { x: 2, z: 1.5 }, boundingBox: { minX: 0, minZ: 0, maxX: 4, maxZ: 3 },
      },
      metadata: { createdAt: 1, modifiedAt: 1, createdBy: 'b4', version: 1 },
    }));
    console.log('[B4 P-I] rooms store ids:', JSON.stringify(ids((rt.stores as any).rooms)));
    rt.tearDown();
  });

  it('P-J: furniture.create carrying wardrobeCabinetConfig (window-guard probe)', async () => {
    const rt = await bootstrapWithEverything({ audit: AUDIT });
    console.log('[B4 P-J] outcome:', await out(rt, 'furniture.create', {
      id: 'furniture_01ARZ3NDEKTSV4RRFFQ69G5FB5', levelId: 'L0',
      origin: { x: 0, y: 0, z: 0 }, rotation: 0,
      wardrobeCabinetConfig: { height: 2.4 },
    }));
    rt.tearDown();
  });
});

describe('B4 probe -- does a ghost create occupy an undo slot', () => {
  it('P-K: bus.undo.size before/after furniture.create {} and plumbing.create {}', async () => {
    const rt = await bootstrapWithEverything({ audit: AUDIT });
    const bus = rt.bus as any;
    const sz = () => { try { return bus.undo?.size; } catch (e) { return '<' + String(e) + '>'; } };
    console.log('[B4 P-K] undo.size before:', sz());
    await out(rt, 'furniture.create', {});
    console.log('[B4 P-K] undo.size after furniture.create {}:', sz());
    await out(rt, 'plumbing.create', {});
    console.log('[B4 P-K] undo.size after plumbing.create {}:', sz());
    await out(rt, 'room.create', {});
    console.log('[B4 P-K] undo.size after room.create {} (refused):', sz());
    rt.tearDown();
  });
});
