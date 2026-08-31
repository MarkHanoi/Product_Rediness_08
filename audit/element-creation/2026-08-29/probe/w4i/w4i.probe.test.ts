/**
 * @vitest-environment happy-dom
 */
// WAVE 4i — ceiling + curtain-wall, the seven facts, EXECUTED.
//
// Model: composedBusElementReadback.test.ts (MT-01). The runtime is a REAL
// composeRuntime(); the bus is its real bus; the mirrors are the REAL exported
// pure functions initTools.ts calls; the stores are the REAL classes
// initBuilders.ts:399 / :340 construct; the builders are the REAL builders.
//
// STUB LEDGER — see NOTES.md. Only the bimManager LEVEL AUTHORITY is a stand-in.
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { writeFileSync } from 'node:fs';
import { createId } from '@pryzm/schemas';
import { composeRuntime } from '@pryzm/runtime-composer';
import { bootstrapWithEverything } from '../../../../../apps/editor/src/bootstrap.everything.js';

const AUDIT = { actorId: 'w4i', projectId: 'w4i', clientId: 'node' } as const;
const LEVEL_ID = 'L0';
/* eslint-disable @typescript-eslint/no-explicit-any */
let rt: any;
const LOG: string[] = [];
const say = (s: string): void => { LOG.push(s); console.error(s); };

beforeAll(async () => {
  rt = await composeRuntime({ audit: AUDIT, canvas: null, bootstrapFn: bootstrapWithEverything as never });
}, 600_000);

async function outcome(verb: string, payload: unknown): Promise<string> {
  try { await rt.bus.executeCommand(verb, payload); return 'OK'; }
  catch (err) { return (err as Error).message ?? String(err); }
}

const capturedCeiling: any[] = [];
const capturedCw: any[] = [];

describe('W4i-A — registry census on the COMPOSED runtime', () => {
  it('A-1: which kinds the authoritative registry holds', () => {
    say('[A-1] kinds = ' + JSON.stringify(rt.stores.elements.kinds?.() ?? null));
    for (const k of ['wall', 'slab', 'ceiling', 'curtainwall', 'curtain-wall', 'curtain-panel']) {
      say('[A-1] elements.get(' + k + ') = ' + String(rt.stores.elements.get(k)?.constructor?.name));
    }
    say('[A-1] rt.stores.ceiling (plugin DTO) = ' + String(rt.stores.ceiling?.constructor?.name));
    say('[A-1] rt.stores.curtainwall (plugin DTO) = ' + String(rt.stores.curtainwall?.constructor?.name));
    expect(true).toBe(true);
  });
});

describe('W4i-B — DISPATCH on the real bus, capture the real *.created event', () => {
  it('B-1: ceiling.create', async () => {
    rt.events.on('ceiling.created', (ev: any) => { capturedCeiling.push(ev); });
    const id = createId('ceiling');
    const r = await outcome('ceiling.create', {
      id, levelId: LEVEL_ID,
      boundary: [{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }, { x: 4, y: 0, z: 4 }, { x: 0, y: 0, z: 4 }],
      ceilingHeight: 2.7, thickness: 0.05,
      materialId: 'MAT-GYPSUM', materialColor: '#eeeeee',
    });
    say('[B-1] ceiling.create outcome = ' + r);
    say('[B-1] captured ceiling.created = ' + JSON.stringify(capturedCeiling.map((e) => ({
      id: e.id, levelId: e.levelId, boundaryLen: e.boundary?.length,
      ceilingHeight: e.ceilingHeight, thickness: e.thickness,
      materialId: e.materialId, materialColor: e.materialColor, commandType: e.commandType,
    }))));
    const dto = rt.stores.ceiling;
    say('[B-1] plugin DTO readback present = ' +
      String((dto?.getById?.(id) ?? dto?.get?.(id)) !== undefined));
    expect(true).toBe(true);
  });

  it('B-2: curtain-wall.create', async () => {
    rt.events.on('curtain-wall.created', (ev: any) => { capturedCw.push(ev); });
    const id = createId('curtainwall');
    const r = await outcome('curtain-wall.create', {
      id, levelId: LEVEL_ID,
      baseLine: [{ x: 0, y: 0, z: 0 }, { x: 6, y: 0, z: 0 }],
      height: 3, baseOffset: 0,
      bayWidth: 1.5, bayHeight: 1.5,
      mullionThickness: 0.05, panelThickness: 0.02,
      materialId: 'MAT-GLASS',
    });
    say('[B-2] curtain-wall.create outcome = ' + r);
    say('[B-2] captured curtain-wall.created = ' + JSON.stringify(capturedCw.map((e) => ({
      id: e.id, levelId: e.levelId, baseLineLen: e.baseLine?.length, height: e.height,
      bayWidth: e.bayWidth, bayHeight: e.bayHeight, mullionThickness: e.mullionThickness,
      materialId: e.materialId, commandType: e.commandType,
    }))));
    expect(true).toBe(true);
  });
});

describe('W4i-C — REACHABLE: the real mirror + the real authoritative store', () => {
  it('C-1: ceiling — real event to mirror to real CeilingStore.add', async () => {
    const mirrorMod: any = await import('../../../../../apps/editor/src/engine/ceilingCreatedMirror.js');
    const camMod: any = await import('@pryzm/core-app-model');
    const CeilingStore = camMod.CeilingStore;
    const store: any = new CeilingStore();

    const ev = capturedCeiling[0];
    say('[C-1] have a real event = ' + String(ev !== undefined));
    if (!ev) { say('[C-1] NO EVENT — cannot proceed'); return; }

    const rec: any = mirrorMod.ceilingRecordFromCreatedEvent(ev, { existingCeilingCount: store.getAll().length });
    say('[C-1] mirror returned = ' + (rec === null ? 'null (GUARD REJECTED)' : 'record'));
    if (!rec) return;
    say('[C-1] record keys = ' + JSON.stringify(Object.keys(rec).sort()));
    say('[C-1] record materialId/materialColor = ' + String(rec.materialId) + ' / ' + String(rec.materialColor));

    const domSeen: any[] = [];
    globalThis.addEventListener('bim-ceiling-added', (e: any) => { domSeen.push(e.detail); });
    const busSeen: any[] = [];
    const seb: any = camMod.storeEventBus;
    let un: any;
    try { un = seb?.subscribe?.((x: any) => busSeen.push(x)); } catch { /* noop */ }

    let addErr = '';
    try { store.add(rec); } catch (err) { addErr = (err as Error).message ?? String(err); }
    say('[C-1] AUTHORITATIVE CeilingStore.add() = ' + (addErr === '' ? 'ACCEPTED VERBATIM' : 'REFUSED: ' + addErr));
    say('[C-1] READBACK store.getById = ' + (store.getById(rec.id) ? 'PRESENT' : 'ABSENT'));
    say('[C-1] store.has = ' + String(store.has(rec.id)));
    say('[C-1] DOM bim-ceiling-added details = ' + JSON.stringify(domSeen));
    say('[C-1] storeEventBus ceiling events = ' + JSON.stringify(busSeen.filter((b) => b && b.elementType === 'ceiling')));
    if (typeof un === 'function') un();

    rt.stores.elements.register('ceiling', store);
    say('[C-1] after register: elements.get(ceiling) === store = ' +
      String(rt.stores.elements.get('ceiling') === store));

    const id2 = createId('ceiling');
    const r2 = await outcome('ceiling.create', {
      id: id2, levelId: LEVEL_ID,
      boundary: [{ x: 0, y: 0, z: 0 }, { x: 3, y: 0, z: 0 }, { x: 3, y: 0, z: 3 }, { x: 0, y: 0, z: 3 }],
      ceilingHeight: 2.7, thickness: 0.05,
    });
    say('[C-1] 2nd ceiling.create outcome = ' + r2);
    say('[C-1] COMPOSITION-ROOT readback = ' + (store.getById(id2) ? 'PRESENT' : 'ABSENT'));
    expect(true).toBe(true);
  });

  it('C-2: curtain-wall — real event to mirror to real CurtainWallStore.add', async () => {
    const mirrorMod: any = await import('../../../../../apps/editor/src/engine/curtainWallCreatedMirror.js');
    const cwMod: any = await import('@pryzm/geometry-curtain-wall');
    const store: any = new cwMod.CurtainWallStore();

    const ev = capturedCw[0];
    say('[C-2] have a real event = ' + String(ev !== undefined));
    if (!ev) { say('[C-2] NO EVENT — cannot proceed'); return; }

    const rec: any = mirrorMod.curtainWallRecordFromCreatedEvent(ev);
    say('[C-2] mirror returned = ' + (rec === null ? 'null (GUARD REJECTED)' : 'record'));
    if (!rec) return;
    say('[C-2] record keys = ' + JSON.stringify(Object.keys(rec).sort()));

    const subSeen: any[] = [];
    try { store.subscribe?.((event: string, cw: any) => { subSeen.push({ event, id: cw && cw.id }); }); } catch { /* noop */ }

    let addErr = '';
    try { store.add(rec); } catch (err) { addErr = (err as Error).message ?? String(err); }
    say('[C-2] AUTHORITATIVE CurtainWallStore.add() = ' + (addErr === '' ? 'ACCEPTED VERBATIM' : 'REFUSED: ' + addErr));
    say('[C-2] READBACK store.has = ' + String(store.has?.(rec.id)));
    const got = store.get?.(rec.id);
    say('[C-2] store.get = ' + (got ? 'PRESENT' : 'ABSENT'));
    say('[C-2] subscribe fired = ' + JSON.stringify(subSeen));
    if (got) {
      say('[C-2] gridSystem cells = ' + String(got.gridSystem?.cells?.length ?? 'no gridSystem'));
      say('[C-2] height = ' + String(got.height));
    }

    rt.stores.elements.register('curtainwall', store);
    rt.stores.elements.register('curtain-wall', store);
    say('[C-2] after register: elements.get(curtain-wall) === store = ' +
      String(rt.stores.elements.get('curtain-wall') === store));

    const id2 = createId('curtainwall');
    const r2 = await outcome('curtain-wall.create', {
      id: id2, levelId: LEVEL_ID,
      baseLine: [{ x: 0, y: 0, z: 0 }, { x: 5, y: 0, z: 0 }],
      height: 3, bayWidth: 1.5, bayHeight: 1.5,
    });
    say('[C-2] 2nd curtain-wall.create outcome = ' + r2);
    say('[C-2] COMPOSITION-ROOT readback = ' + String(store.has?.(id2)));
    expect(true).toBe(true);
  });
});

describe('W4i-D — RENDERS_3D: the real builders, a real THREE scene', () => {
  it('D-1: CeilingPanelBuilder.buildCeiling produces scene geometry', async () => {
    const threeMod: any = await import('three');
    const gsMod: any = await import('@pryzm/geometry-slab');
    const mirrorMod: any = await import('../../../../../apps/editor/src/engine/ceilingCreatedMirror.js');
    const camMod: any = await import('@pryzm/core-app-model');
    const store: any = new camMod.CeilingStore();
    const ev = capturedCeiling[0];
    if (!ev) { say('[D-1] NO EVENT'); return; }
    const rec: any = mirrorMod.ceilingRecordFromCreatedEvent(ev, { existingCeilingCount: 0 });
    if (!rec) { say('[D-1] mirror null'); return; }
    try { store.add(rec); } catch (e) { say('[D-1] add refused: ' + String(e)); return; }

    const scene: any = new threeMod.Scene();
    const level = { id: LEVEL_ID, name: 'Ground', elevation: 0, childrenIds: [] as string[] };
    const bimManagerStandIn: any = {
      getLevelById: (id: string) => (id === LEVEL_ID ? level : undefined),
      getLevels: () => [level],
    };
    let builder: any;
    try { builder = new gsMod.CeilingPanelBuilder(scene, bimManagerStandIn); }
    catch (e) { say('[D-1] CeilingPanelBuilder ctor threw: ' + String(e)); return; }

    const before = scene.children.length;
    const data = store.getById(rec.id);
    say('[D-1] listener body store.getById = ' + (data ? 'PRESENT' : 'ABSENT'));
    try { builder.buildCeiling(data); } catch (e) { say('[D-1] buildCeiling threw: ' + String(e)); }
    await new Promise((r) => setTimeout(r, 500));
    say('[D-1] scene.children before/after = ' + before + ' / ' + scene.children.length);
    let meshes = 0; let verts = 0;
    scene.traverse((o: any) => { if (o.isMesh) { meshes++; verts += o.geometry?.attributes?.position?.count ?? 0; } });
    say('[D-1] MESHES = ' + meshes + ' · verts = ' + verts);
    if (meshes === 0) {
      try {
        const sync = builder._buildCeilingSync;
        if (typeof sync === 'function') {
          sync.call(builder, data);
          let m2 = 0; let v2 = 0;
          scene.traverse((o: any) => { if (o.isMesh) { m2++; v2 += o.geometry?.attributes?.position?.count ?? 0; } });
          say('[D-1] after direct _buildCeilingSync: MESHES = ' + m2 + ' · verts = ' + v2);
        } else { say('[D-1] no _buildCeilingSync on instance'); }
      } catch (e) { say('[D-1] _buildCeilingSync threw: ' + String(e)); }
    }
    expect(true).toBe(true);
  }, 180_000);

  it('D-2: CurtainWallBuilder.updateCurtainWall produces scene geometry', async () => {
    const threeMod: any = await import('three');
    const cwMod: any = await import('@pryzm/geometry-curtain-wall');
    const mirrorMod: any = await import('../../../../../apps/editor/src/engine/curtainWallCreatedMirror.js');
    const ev = capturedCw[0];
    if (!ev) { say('[D-2] NO EVENT'); return; }
    const rec: any = mirrorMod.curtainWallRecordFromCreatedEvent(ev);
    if (!rec) { say('[D-2] mirror null'); return; }
    const store: any = new cwMod.CurtainWallStore();
    try { store.add(rec); } catch (e) { say('[D-2] add refused: ' + String(e)); return; }
    const cw = store.get(rec.id);

    const scene: any = new threeMod.Scene();
    let builder: any;
    try { builder = new cwMod.CurtainWallBuilder(scene, { materialMap: undefined }); }
    catch (e) { say('[D-2] CurtainWallBuilder ctor threw: ' + String(e)); return; }
    const before = scene.children.length;
    try { builder.updateCurtainWall(cw); } catch (e) { say('[D-2] updateCurtainWall threw: ' + String(e)); }
    await new Promise((r) => setTimeout(r, 500));
    say('[D-2] scene.children before/after = ' + before + ' / ' + scene.children.length);
    let meshes = 0; let verts = 0;
    scene.traverse((o: any) => {
      if (o.isMesh || o.isInstancedMesh) { meshes++; verts += o.geometry?.attributes?.position?.count ?? 0; }
    });
    say('[D-2] MESHES = ' + meshes + ' · verts = ' + verts);
    expect(true).toBe(true);
  }, 180_000);
});

describe('W4i-E — RENDERS_PLAN: what is executable', () => {
  it('E-1: GEOMETRY_ELEMENT_TYPES + VDT registerElement, executed', async () => {
    let mod: any;
    try { mod = await import('@pryzm/core-app-model'); }
    catch (e) { say('[E-1] core-app-model import threw: ' + String(e)); return; }
    const G = mod.GEOMETRY_ELEMENT_TYPES;
    say('[E-1] GEOMETRY_ELEMENT_TYPES = ' + JSON.stringify(G ? Array.from(G) : null));
    const P = mod.PLAN_INCREMENTAL_SAFE_TYPES;
    say('[E-1] PLAN_INCREMENTAL_SAFE_TYPES = ' + JSON.stringify(P ? Array.from(P) : null));
    const vdt = mod.viewDependencyTracker;
    say('[E-1] viewDependencyTracker singleton = ' + String(vdt?.constructor?.name));
    if (vdt && typeof vdt.registerElement === 'function') {
      try {
        vdt.registerElement('w4i-ceil-1', LEVEL_ID);
        vdt.registerElement('w4i-cw-1', LEVEL_ID);
        say('[E-1] VDT.registerElement executed OK for both');
      } catch (e) { say('[E-1] VDT.registerElement threw: ' + String(e)); }
    } else {
      say('[E-1] no viewDependencyTracker singleton on the barrel');
    }
    expect(true).toBe(true);
  });
});

afterAll(() => {
  const NL = String.fromCharCode(10);
  try {
    writeFileSync(
      'C://Users//LENOVO//OneDrive//Desktop//PRYZM//Product_Rediness_08//audit//element-creation//2026-08-29//probe//w4i//LOG.txt',
      LOG.join(NL),
      'utf8',
    );
  } catch (e) { console.error('WRITE FAILED', e); }
});

describe('W4i-Z — dump', () => {
  it('Z: log', () => { say('[Z] lines = ' + LOG.length); expect(true).toBe(true); });
});
