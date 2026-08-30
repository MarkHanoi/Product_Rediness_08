// PHASE 3 BATCH B2 measurement probe -- READ-ONLY audit artefact.
// Dispatches roof / column / beam / floor through the REAL composition root
// (bootstrapWithEverything). Constructs NO store and NO stores object (D6).
import { describe, expect, it } from 'vitest';
import { bootstrapWithEverything, ELEMENT_PLUGIN_IDS } from '../../../../apps/editor/src/bootstrap.everything.js';

const AUDIT = { actorId: 'u', projectId: 'p', clientId: 'c', timestamp: '' } as const;

const ROOF_ID   = 'roof_01ARZ3NDEKTSV4RRFFQ69G5FA1';
const COLUMN_ID = 'column_01ARZ3NDEKTSV4RRFFQ69G5FA2';
const BEAM_ID   = 'beam_01ARZ3NDEKTSV4RRFFQ69G5FA3';
const FLOOR_ID  = 'floor_01ARZ3NDEKTSV4RRFFQ69G5FA4';
const FLOOR_ID2 = 'floor_01ARZ3NDEKTSV4RRFFQ69G5FA6';

const BOUNDARY = [
  { x: 0, y: 0, z: 0 }, { x: 6, y: 0, z: 0 },
  { x: 6, y: 0, z: 4 }, { x: 0, y: 0, z: 4 },
];

describe('B2 probe -- store keys at the real composition root', () => {
  it('P-A: roof/column/beam/floor keys all resolve on rt.stores', async () => {
    const rt = await bootstrapWithEverything({ audit: AUDIT });
    const keys = ['roof', 'column', 'beam', 'floor'];
    const present = keys.filter((k) => (rt.stores as Record<string, unknown>)[k] !== undefined);
    console.log('[PROBE P-A] stores present:', JSON.stringify(present));
    console.log('[PROBE P-A] ELEMENT_PLUGIN_IDS has floor?', (ELEMENT_PLUGIN_IDS as readonly string[]).includes('floor'));
    console.log('[PROBE P-A] ELEMENT_PLUGIN_IDS has roof/column/beam?',
      JSON.stringify(['roof', 'column', 'beam'].map((k) => (ELEMENT_PLUGIN_IDS as readonly string[]).includes(k))));
    expect(present).toEqual(keys);
    rt.tearDown();
  });

  it('P-B: registered handler types + store keys for the four families', async () => {
    const rt = await bootstrapWithEverything({ audit: AUDIT });
    for (const id of ['roof', 'column', 'beam', 'floor']) {
      console.log('[PROBE P-B] registeredHandlerTypes[' + id + '] =',
        JSON.stringify((rt.registeredHandlerTypes as Record<string, unknown>)[id]));
      console.log('[PROBE P-B] registeredStoreKeys[' + id + '] =',
        JSON.stringify((rt.registeredStoreKeys as Record<string, unknown>)[id]));
    }
    rt.tearDown();
  });
});

describe('B2 probe -- dispatchability through the composed runtime', () => {
  it('P-C: roof.create dispatches and commits', async () => {
    const rt = await bootstrapWithEverything({ audit: AUDIT });
    const res = await rt.bus.executeCommand('roof.create', {
      id: ROOF_ID, levelId: 'level-1', boundary: BOUNDARY,
      shape: 'flat', pitch: 0, thickness: 0.2, overhang: 0.3,
    });
    console.log('[PROBE P-C] roof.create result:', String(JSON.stringify(res)).slice(0, 300));
    const st = (rt.stores as any).roof.getState();
    console.log('[PROBE P-C] roof store ids:', JSON.stringify([...st.keys()]));
    console.log('[PROBE P-C] roof record:', String(JSON.stringify(st.get(ROOF_ID))).slice(0, 600));
    rt.tearDown();
  });

  it('P-D: column.create dispatches and commits', async () => {
    const rt = await bootstrapWithEverything({ audit: AUDIT });
    const res = await rt.bus.executeCommand('column.create', {
      id: COLUMN_ID, levelId: 'level-1', origin: { x: 1, y: 0, z: 1 },
      width: 0.3, depth: 0.3, height: 3,
    });
    console.log('[PROBE P-D] column.create result:', String(JSON.stringify(res)).slice(0, 300));
    const st = (rt.stores as any).column.getState();
    console.log('[PROBE P-D] column store ids:', JSON.stringify([...st.keys()]));
    rt.tearDown();
  });

  it('P-E: beam.create dispatches and commits', async () => {
    const rt = await bootstrapWithEverything({ audit: AUDIT });
    const res = await rt.bus.executeCommand('beam.create', {
      id: BEAM_ID, levelId: 'level-1',
      baseLine: [{ x: 0, y: 3, z: 0 }, { x: 6, y: 3, z: 0 }],
      width: 0.2, depth: 0.4,
    });
    console.log('[PROBE P-E] beam.create result:', String(JSON.stringify(res)).slice(0, 300));
    const st = (rt.stores as any).beam.getState();
    console.log('[PROBE P-E] beam store ids:', JSON.stringify([...st.keys()]));
    rt.tearDown();
  });

  it('P-F: floor.create dispatches and commits', async () => {
    const rt = await bootstrapWithEverything({ audit: AUDIT });
    const res = await rt.bus.executeCommand('floor.create', {
      floorId: FLOOR_ID, levelId: 'level-1', polygon: BOUNDARY,
      thickness: 0.015, baseOffset: 0,
    });
    console.log('[PROBE P-F] floor.create result:', String(JSON.stringify(res)).slice(0, 300));
    const st = (rt.stores as any).floor.getState();
    console.log('[PROBE P-F] floor store ids:', JSON.stringify([...st.keys()]));
    rt.tearDown();
  });
});

describe('B2 probe -- DEGENERATE payloads', () => {
  it('P-G: beam.create with the EMPTY payload input-host/BeamTool.ts:222 sends', async () => {
    const rt = await bootstrapWithEverything({ audit: AUDIT });
    let threw: string | null = null;
    let res: unknown;
    try { res = await rt.bus.executeCommand('beam.create', {}); }
    catch (e) { threw = (e as Error).message; }
    console.log('[PROBE P-G] threw:', JSON.stringify(threw));
    console.log('[PROBE P-G] result:', String(JSON.stringify(res)).slice(0, 300));
    const st = (rt.stores as any).beam.getState();
    const ids = [...st.keys()];
    console.log('[PROBE P-G] beam store ids after {} dispatch:', JSON.stringify(ids));
    if (ids.length > 0) {
      console.log('[PROBE P-G] PHANTOM BEAM RECORD:', String(JSON.stringify(st.get(ids[0]))).slice(0, 600));
    }
    rt.tearDown();
  });

  it('P-H: floor.create with NO polygon', async () => {
    const rt = await bootstrapWithEverything({ audit: AUDIT });
    let threw: string | null = null;
    let res: unknown;
    try { res = await rt.bus.executeCommand('floor.create', { floorId: FLOOR_ID2, levelId: 'level-1' }); }
    catch (e) { threw = (e as Error).message; }
    console.log('[PROBE P-H] threw:', JSON.stringify(threw));
    console.log('[PROBE P-H] result:', String(JSON.stringify(res)).slice(0, 300));
    const st = (rt.stores as any).floor.getState();
    console.log('[PROBE P-H] floor store ids:', JSON.stringify([...st.keys()]));
    console.log('[PROBE P-H] boundary of the record:', JSON.stringify(st.get(FLOOR_ID2)?.boundary));
    rt.tearDown();
  });

  it('P-I: roof.create with NO boundary', async () => {
    const rt = await bootstrapWithEverything({ audit: AUDIT });
    let threw: string | null = null;
    let res: unknown;
    try { res = await rt.bus.executeCommand('roof.create', { id: ROOF_ID, levelId: 'level-1' }); }
    catch (e) { threw = (e as Error).message; }
    console.log('[PROBE P-I] threw:', JSON.stringify(threw));
    console.log('[PROBE P-I] result:', String(JSON.stringify(res)).slice(0, 300));
    const st = (rt.stores as any).roof.getState();
    console.log('[PROBE P-I] roof store ids:', JSON.stringify([...st.keys()]));
    console.log('[PROBE P-I] roof boundary:', JSON.stringify(st.get(ROOF_ID)?.boundary));
    rt.tearDown();
  });

  it('P-J: which verbs are on the bus', async () => {
    const rt = await bootstrapWithEverything({ audit: AUDIT });
    console.log('[PROBE P-J] all registeredHandlerTypes:', JSON.stringify((rt as any).registeredHandlerTypes));
    for (const t of ['beam.batch.create', 'column.batch.create', 'roof.delete', 'floor.delete', 'beam.delete', 'column.delete', 'floor.updateLayers']) {
      let threw: string | null = null;
      try { await rt.bus.executeCommand(t as never, {} as never); }
      catch (e) { threw = (e as Error).message; }
      console.log('[PROBE P-J] ' + t + ' -> ' + JSON.stringify(threw));
    }
    rt.tearDown();
  });
});

describe('B2 probe -- does the phantom beam occupy an undo slot', () => {
  it('P-K: undoCount before and after the {} beam.create', async () => {
    const rt = await bootstrapWithEverything({ audit: AUDIT });
    const anyRt = rt as any;
    const before = anyRt.undoStack?.undoCount;
    console.log('[PROBE P-K] undoStack present:', String(!!anyRt.undoStack), 'undoCount before:', String(before));
    await rt.bus.executeCommand('beam.create', {});
    console.log('[PROBE P-K] undoCount after {} beam.create:', String(anyRt.undoStack?.undoCount));
    const st = (rt.stores as any).beam.getState();
    console.log('[PROBE P-K] beam ids:', JSON.stringify([...st.keys()]));
    rt.tearDown();
  });
});
