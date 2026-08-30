// PHASE 3 BATCH B7 measurement probe -- READ-ONLY audit artefact.
// water / liftPart / bathroomPod / selection / section-view through the REAL
// composition root (bootstrapWithEverything). Constructs NO store and NO stores
// object (D6). Prints numbers; asserts almost nothing.
import { describe, it } from 'vitest';
import {
  bootstrapWithEverything,
  ELEMENT_PLUGIN_IDS,
} from '../../../../apps/editor/src/bootstrap.everything.js';
import { STORE_ONLY_PLUGIN_IDS } from '../../../../apps/editor/src/PluginRegistry.js';

const AUDIT = { actorId: 'u', projectId: 'p', clientId: 'c', timestamp: '' } as const;
const FAMS = ['water', 'liftPart', 'bathroomPod', 'selection', 'section'] as const;
const IDS = ['water', 'liftPart', 'bathroomPod', 'selection', 'section-view'] as const;

function log(tag: string, v: unknown): void {
  console.log('[B7 ' + tag + '] ' + (typeof v === 'string' ? v : JSON.stringify(v)));
}

describe('B7 -- store keys + verbs at the real composition root', () => {
  it('Q-A: which storeKeys resolve on rt.stores', async () => {
    const rt = await bootstrapWithEverything({ audit: AUDIT });
    const s = rt.stores as unknown as Record<string, unknown>;
    for (const k of FAMS) {
      const v = s[k];
      log('Q-A stores.' + k, {
        defined: v !== undefined,
        ctor: v === undefined ? null : (v as object).constructor?.name ?? null,
      });
    }
    log('Q-A all rt.stores keys', Object.keys(s).sort());
    rt.tearDown();
  });

  it('Q-B: registeredHandlerTypes + registeredStoreKeys per plugin id', async () => {
    const rt = await bootstrapWithEverything({ audit: AUDIT });
    const h = rt.registeredHandlerTypes as unknown as Record<string, unknown>;
    const k = rt.registeredStoreKeys as unknown as Record<string, unknown>;
    for (const id of IDS) {
      log('Q-B ' + id, { handlerTypes: h[id] ?? null, storeKeys: k[id] ?? null });
    }
    log('Q-B plumbing (owner of bathroomPod verbs)', {
      handlerTypes: h['plumbing'] ?? null,
      storeKeys: k['plumbing'] ?? null,
    });
    log('Q-B ELEMENT_PLUGIN_IDS', ELEMENT_PLUGIN_IDS);
    log('Q-B ELEMENT_PLUGIN_IDS.length', (ELEMENT_PLUGIN_IDS as readonly string[]).length);
    log('Q-B STORE_ONLY_PLUGIN_IDS keys', Object.keys(STORE_ONLY_PLUGIN_IDS));
    for (const id of IDS) {
      log('Q-B membership ' + id, {
        inELEMENT_PLUGIN_IDS: (ELEMENT_PLUGIN_IDS as readonly string[]).includes(id),
        inSTORE_ONLY: Object.prototype.hasOwnProperty.call(STORE_ONLY_PLUGIN_IDS, id),
      });
    }
    rt.tearDown();
  });
});

describe('B7 -- what happens when the family verb is dispatched directly', () => {
  it('Q-C: water.create / liftPart.create -- is there a handler at all?', async () => {
    const rt = await bootstrapWithEverything({ audit: AUDIT });
    for (const verb of [
      'water.create', 'water.delete', 'water.update',
      'liftPart.create', 'liftPart.delete',
      'bathroomPod.create', 'bathroomPod.delete',
      'selection.select', 'section.create',
    ]) {
      try {
        const r = await rt.bus.executeCommand(verb, {});
        log('Q-C ' + verb, 'RESOLVED ' + String(JSON.stringify(r)).slice(0, 200));
      } catch (e) {
        log('Q-C ' + verb, 'THREW ' + String((e as Error).message).slice(0, 220));
      }
    }
    rt.tearDown();
  });

  it('Q-D: selection.select through the composed bus -- does it land?', async () => {
    const rt = await bootstrapWithEverything({ audit: AUDIT });
    const before = (rt.stores as any).selection?.getState?.();
    log('Q-D selection state BEFORE', {
      type: before === undefined ? 'undefined' : before.constructor?.name,
      size: before?.size ?? null,
    });
    try {
      const r = await rt.bus.executeCommand('selection.select', {
        targets: [{ id: 'wall_01ARZ3NDEKTSV4RRFFQ69G5FA9', kind: 'wall' }],
        mode: 'replace',
      });
      log('Q-D selection.select result', String(JSON.stringify(r)).slice(0, 400));
    } catch (e) {
      log('Q-D selection.select THREW', String((e as Error).message).slice(0, 300));
    }
    const after = (rt.stores as any).selection?.getState?.();
    log('Q-D selection state AFTER', {
      size: after?.size ?? null,
      keys: after ? [...after.keys()] : null,
    });
    rt.tearDown();
  });

  it('Q-E: section.create WITHOUT an id -- is the id minted in the handler?', async () => {
    const rt = await bootstrapWithEverything({ audit: AUDIT });
    const r = await rt.bus.executeCommand('section.create', {
      line: { a: { x: 0, y: 0 }, b: { x: 10, y: 0 }, lookDepth: 5 },
    });
    log('Q-E section.create (no id) result', String(JSON.stringify(r)).slice(0, 300));
    const st = (rt.stores as any).section;
    const state = typeof st?.getState === 'function' ? st.getState() : st;
    const ids = state instanceof Map ? [...state.keys()] : Object.keys(state ?? {});
    log('Q-E section store ids after create', ids);
    log('Q-E section store shape', state instanceof Map ? 'Map' : typeof state);
    rt.tearDown();
  });
});

describe('B7 -- does the parent write the member store', () => {
  it('Q-F: after a pool.create, how many `water` records exist', async () => {
    const rt = await bootstrapWithEverything({ audit: AUDIT });
    const SLAB = 'slab_01ARZ3NDEKTSV4RRFFQ69G5H01';
    const POOL = 'pool_01ARZ3NDEKTSV4RRFFQ69G5H05';
    try {
      await rt.bus.executeCommand('slab.create', {
        id: SLAB, levelId: 'level-1',
        boundary: [
          { x: -20, y: 0, z: -20 }, { x: 20, y: 0, z: -20 },
          { x: 20, y: 0, z: 20 }, { x: -20, y: 0, z: 20 },
        ],
        thickness: 0.3,
      });
    } catch (e) { log('Q-F slab.create THREW', String((e as Error).message).slice(0, 250)); }
    try {
      const r = await rt.bus.executeCommand('pool.create', {
        poolId: POOL, levelId: 'level-1', hostSlabId: SLAB,
        outline: [
          { x: 0, y: 0, z: 0 }, { x: 8, y: 0, z: 0 },
          { x: 8, y: 0, z: 4 }, { x: 0, y: 0, z: 4 },
        ],
        depth: 1.5,
      });
      log('Q-F pool.create result', String(JSON.stringify(r)).slice(0, 300));
    } catch (e) { log('Q-F pool.create THREW', String((e as Error).message).slice(0, 400)); }
    const w = (rt.stores as any).water?.getState?.();
    log('Q-F water store', { size: w?.size ?? null, keys: w ? [...w.keys()] : null });
    if (w && w.size > 0) {
      log('Q-F first water record', String(JSON.stringify([...w.values()][0])).slice(0, 700));
    }
    rt.tearDown();
  });

  it('Q-G: RuntimeEvents keys -- which of these families have a channel', async () => {
    const rt = await bootstrapWithEverything({ audit: AUDIT });
    const seen: string[] = [];
    const ev = rt.events as unknown as { on: (k: string, f: (x: unknown) => void) => void };
    for (const k of [
      'water.created', 'water.updated', 'water.deleted',
      'liftPart.created', 'lift.created',
      'bathroomPod.created', 'plumbing.created',
      'selection.changed', 'section.created', 'element.updated',
    ]) {
      try { ev.on(k, () => { seen.push(k); }); log('Q-G on("' + k + '")', 'SUBSCRIBED OK'); }
      catch (e) { log('Q-G on("' + k + '")', 'THREW ' + String((e as Error).message).slice(0, 160)); }
    }
    rt.tearDown();
  });
});
