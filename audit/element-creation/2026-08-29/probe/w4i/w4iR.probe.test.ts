/**
 * @vitest-environment happy-dom
 */
// W4i RECOVERY — the UNVERIFIED facts for ceiling + curtain-wall, EXECUTED.
//
// This file JOINS halves that already existed separately. It writes no mirror, no
// store, no builder, no reader. Everything below is the production class.
//
// STUB LEDGER (the only substitutions; each is a CLOCK or a LEVEL, never the object
// whose absence would BE the defect):
//   S1. FakeRafAdapter — the frame-scheduler package's OWN exported test adapter
//       (RafAdapter.ts). happy-dom does not pump rAF, so buildCeiling()'s
//       getFrameScheduler().schedule('pre-render', ...) never drains. Substituting
//       TIME is not substituting the deferral: the real FrameScheduler, the real
//       tick-listener registry and the real _drainBuildQueue all run.
//   S2. bimManager level authority — CeilingPanelBuilder calls exactly getLevelById.
//       Same declared substitution composedBusElementReadback.test.ts makes for
//       WallStore's level authority.
//   S3. THREE.Scene is a real new Scene().
// Nothing else is stubbed. The runtime is a REAL composeRuntime().

import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { writeFileSync } from 'node:fs';
import { createId } from '@pryzm/schemas';
import { composeRuntime } from '@pryzm/runtime-composer';
import { bootstrapWithEverything } from '../../../../../apps/editor/src/bootstrap.everything.js';

const AUDIT = { actorId: 'w4iR', projectId: 'w4iR', clientId: 'node' } as const;
const LEVEL_ID = 'L0';
/* eslint-disable @typescript-eslint/no-explicit-any */
let rt: any;
const LOG: string[] = [];
const say = (s: string): void => { LOG.push(s); console.error(s); };

const capturedCeiling: any[] = [];
const capturedCw: any[] = [];

beforeAll(async () => {
  rt = await composeRuntime({ audit: AUDIT, canvas: null, bootstrapFn: bootstrapWithEverything as never });
  rt.events.on('ceiling.created', (ev: any) => { capturedCeiling.push(ev); });
  rt.events.on('curtain-wall.created', (ev: any) => { capturedCw.push(ev); });
}, 600_000);

async function outcome(verb: string, payload: unknown): Promise<string> {
  try { await rt.bus.executeCommand(verb, payload); return 'OK'; }
  catch (err) { return (err as Error).message ?? String(err); }
}

function countMeshes(scene: any): { meshes: number; verts: number } {
  let meshes = 0; let verts = 0;
  scene.traverse((o: any) => {
    if (o.isMesh || o.isInstancedMesh) { meshes++; verts += o.geometry?.attributes?.position?.count ?? 0; }
  });
  return { meshes, verts };
}

// Shared across arms so R-2 exports the mesh R-1's REAL builder produced.
const carry: any = { ceilScene: null, ceilStore: null, ceilId: '', cwScene: null, cwStore: null, cwId: '' };

describe('W4i-R1 — CEILING renders_3d through the REAL FrameScheduler deferral', () => {
  it('R-1: bus to event to mirror to CeilingStore to CeilingPanelBuilder to pumped frame to MESH', async () => {
    const THREE: any = await import('@pryzm/renderer-three/three');
    const fsMod: any = await import('@pryzm/frame-scheduler');
    const gsMod: any = await import('@pryzm/geometry-slab');
    const camMod: any = await import('@pryzm/core-app-model');
    const mirrorMod: any = await import('../../../../../apps/editor/src/engine/ceilingCreatedMirror.js');

    const id = createId('ceiling');
    const r = await outcome('ceiling.create', {
      id, levelId: LEVEL_ID,
      boundary: [{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }, { x: 4, y: 0, z: 4 }, { x: 0, y: 0, z: 4 }],
      ceilingHeight: 2.7, thickness: 0.05, materialId: 'MAT-GYPSUM', materialColor: '#eeeeee',
    });
    say('[R-1] ceiling.create outcome = ' + r);
    const ev = capturedCeiling.find((e) => e.id === id);
    say('[R-1] real ceiling.created captured = ' + String(ev !== undefined));
    expect(ev, 'the REAL bus must emit ceiling.created').toBeDefined();

    const store: any = new camMod.CeilingStore();
    const rec: any = mirrorMod.ceilingRecordFromCreatedEvent(ev, { existingCeilingCount: 0 });
    say('[R-1] mirror returned = ' + (rec === null ? 'NULL (guard rejected)' : 'record'));
    expect(rec, 'the REAL production mirror must accept the REAL event').not.toBeNull();
    store.add(rec);
    say('[R-1] CeilingStore readback = ' + (store.getById(rec.id) ? 'PRESENT' : 'ABSENT'));

    const scene: any = new THREE.Scene();
    const level = { id: LEVEL_ID, name: 'Ground', elevation: 0, childrenIds: [] as string[] };
    const bim: any = { getLevelById: (i: string) => (i === LEVEL_ID ? level : undefined), getLevels: () => [level] };
    const builder: any = new gsMod.CeilingPanelBuilder(scene, bim);

    // THE JOIN THE PRIOR RUN MISSED. buildCeiling() only ENQUEUES; the drain is a
    // pre-render tick on the process-singleton FrameScheduler. happy-dom never pumps
    // rAF, so the prior probe read MESHES = 0 and could not tell "deferred" from
    // "broken". S1: give the REAL scheduler a clock.
    const sched: any = fsMod.getFrameScheduler();
    const fake: any = new fsMod.FakeRafAdapter();
    sched.start(fake);
    say('[R-1] scheduler running = ' + String(sched.isRunning));

    const before = countMeshes(scene);
    builder.buildCeiling(store.getById(rec.id));
    const afterEnqueue = countMeshes(scene);
    say('[R-1] AFTER enqueue, BEFORE any frame: meshes = ' + afterEnqueue.meshes +
      '  (this is the DEFERRAL, not a failure)');

    fake.pumpFrames(4);
    const after = countMeshes(scene);
    say('[R-1] pumpCount = ' + String(fake.pumpCount) + ' · totalTicks = ' + String(sched.totalTicks?.()));
    say('[R-1] MESHES before/afterEnqueue/afterPump = ' + before.meshes + ' / ' +
      afterEnqueue.meshes + ' / ' + after.meshes + '  · verts = ' + after.verts);

    const root = builder.getRootById?.(rec.id);
    say('[R-1] builder root = ' + (root ? 'PRESENT' : 'ABSENT') +
      ' · root.userData.id = ' + String(root?.userData?.id) +
      ' · root.userData.elementType = ' + String(root?.userData?.elementType) +
      ' · root.userData.version = ' + String(root?.userData?.version));

    carry.ceilScene = scene; carry.ceilStore = store; carry.ceilId = rec.id;

    expect(after.meshes, 'a pumped pre-render tick must build the ceiling mesh').toBeGreaterThan(0);
    expect(after.verts).toBeGreaterThan(0);
    sched.stop();
  }, 300_000);

  it('R-1c: CONTROL — with NO frame pumped, the scene stays empty (so R-1 measured the drain, not the ctor)', async () => {
    const THREE: any = await import('@pryzm/renderer-three/three');
    const fsMod: any = await import('@pryzm/frame-scheduler');
    const gsMod: any = await import('@pryzm/geometry-slab');
    const camMod: any = await import('@pryzm/core-app-model');
    const mirrorMod: any = await import('../../../../../apps/editor/src/engine/ceilingCreatedMirror.js');
    const ev = capturedCeiling[0];
    const store: any = new camMod.CeilingStore();
    const rec: any = mirrorMod.ceilingRecordFromCreatedEvent(ev, { existingCeilingCount: 0 });
    store.add(rec);
    const scene: any = new THREE.Scene();
    const level = { id: LEVEL_ID, name: 'G', elevation: 0, childrenIds: [] as string[] };
    const builder: any = new gsMod.CeilingPanelBuilder(scene,
      { getLevelById: () => level, getLevels: () => [level] });
    const sched: any = fsMod.getFrameScheduler();
    const fake: any = new fsMod.FakeRafAdapter();
    sched.start(fake);
    builder.buildCeiling(store.getById(rec.id));
    const n = countMeshes(scene);
    say('[R-1c] CONTROL no-pump MESHES = ' + n.meshes + ' (must be 0)');
    expect(n.meshes).toBe(0);
    sched.stop();
  }, 300_000);
});

describe('W4i-R2 — CEILING exports, joined to the mesh the REAL builder produced', () => {
  it('R-2: FragmentReader over the REAL CeilingStore + the REAL builder scene yields IfcCovering/CEILING', async () => {
    const ffMod: any = await import('../../../../../packages/file-format/src/export/ifc/FragmentReader');
    say('[R-2] FragmentReader import = ' + String(typeof ffMod.FragmentReader));
    expect(carry.ceilScene, 'R-1 must have run first').not.toBeNull();
    const model: any = new ffMod.FragmentReader(
      { ceilingStore: carry.ceilStore }, { scene: carry.ceilScene },
    ).read();
    const el = model.elements.find((e: any) => e.id === carry.ceilId);
    say('[R-2] elements = ' + String(model.elements.length) +
      ' · ceiling element = ' + (el ? 'PRESENT' : 'ABSENT'));
    if (el) {
      say('[R-2] ifcClass = ' + String(el.ifcClass) + ' · predefinedType = ' + String(el.predefinedType) +
        ' · verts = ' + String(el.geometry?.vertices?.length));
    }
    expect(el, 'the ceiling the REAL builder meshed must reach the exporter').toBeDefined();
    expect(el.ifcClass).toBe('IfcCovering');
    expect(el.predefinedType).toBe('CEILING');
    expect(el.geometry.vertices.length).toBeGreaterThan(0);
  }, 300_000);

  it('R-2c: CONTROL — the SAME store against an EMPTY scene exports nothing (mesh-gated, as the reader says)', async () => {
    const THREE: any = await import('@pryzm/renderer-three/three');
    const ffMod: any = await import('../../../../../packages/file-format/src/export/ifc/FragmentReader');
    const model: any = new ffMod.FragmentReader(
      { ceilingStore: carry.ceilStore }, { scene: new THREE.Scene() },
    ).read();
    say('[R-2c] CONTROL empty-scene elements = ' + String(model.elements.length) + ' (must be 0)');
    expect(model.elements).toHaveLength(0);
  }, 300_000);
});

describe('W4i-R3 — CURTAIN-WALL renders_3d + the storeEventBus emit', () => {
  it('R-3: bus to event to mirror to CurtainWallStore to CurtainWallBuilder to MESH, and the plan-invalidation event', async () => {
    const THREE: any = await import('@pryzm/renderer-three/three');
    const cwMod: any = await import('@pryzm/geometry-curtain-wall');
    const camMod: any = await import('@pryzm/core-app-model');
    const mirrorMod: any = await import('../../../../../apps/editor/src/engine/curtainWallCreatedMirror.js');

    const id = createId('curtainwall');
    const r = await outcome('curtain-wall.create', {
      id, levelId: LEVEL_ID,
      baseLine: [{ x: 0, y: 0, z: 0 }, { x: 6, y: 0, z: 0 }],
      height: 3, baseOffset: 0, bayWidth: 1.5, bayHeight: 1.5,
      mullionThickness: 0.05, panelThickness: 0.02, materialId: 'MAT-GLASS',
    });
    say('[R-3] curtain-wall.create outcome = ' + r);
    const ev = capturedCw.find((e) => e.id === id);
    expect(ev, 'the REAL bus must emit curtain-wall.created').toBeDefined();

    const rec: any = mirrorMod.curtainWallRecordFromCreatedEvent(ev);
    say('[R-3] mirror returned = ' + (rec === null ? 'NULL (guard rejected)' : 'record'));
    expect(rec).not.toBeNull();

    // MEASURE THE PLAN-INVALIDATION EMIT ON THE REAL BUS, not from the source line.
    const busSeen: any[] = [];
    const seb: any = camMod.storeEventBus;
    let un: any;
    try { un = seb?.subscribe?.((x: any) => busSeen.push(x)); } catch { /* noop */ }

    const store: any = new cwMod.CurtainWallStore();
    store.add(rec);
    if (typeof un === 'function') un();
    say('[R-3] storeEventBus curtainwall events = ' +
      JSON.stringify(busSeen.filter((b) => b && b.elementType === 'curtainwall')));
    say('[R-3] CurtainWallStore readback = ' + String(store.has(rec.id)));

    const scene: any = new THREE.Scene();
    const builder: any = new cwMod.CurtainWallBuilder(scene, { materialMap: undefined });
    builder.updateCurtainWall(store.get(rec.id));
    const n = countMeshes(scene);
    say('[R-3] MESHES = ' + n.meshes + ' · verts = ' + n.verts);
    const root = scene.children[0];
    say('[R-3] scene.children[0].userData.id = ' + String(root?.userData?.id) +
      ' · elementType = ' + String(root?.userData?.elementType) +
      ' · version = ' + String(root?.userData?.version));

    carry.cwScene = scene; carry.cwStore = store; carry.cwId = rec.id;
    expect(n.meshes, 'the curtain wall must produce scene geometry').toBeGreaterThan(0);
  }, 300_000);
});

describe('W4i-R4 — CURTAIN-WALL exports, joined to the mesh the REAL builder produced', () => {
  it('R-4: FragmentReader over the REAL CurtainWallStore + the REAL builder scene yields IfcCurtainWall', async () => {
    const ffMod: any = await import('../../../../../packages/file-format/src/export/ifc/FragmentReader');
    expect(carry.cwScene, 'R-3 must have run first').not.toBeNull();
    const model: any = new ffMod.FragmentReader(
      { curtainWallStore: carry.cwStore }, { scene: carry.cwScene },
    ).read();
    say('[R-4] elements = ' + String(model.elements.length));
    say('[R-4] ids = ' + JSON.stringify(model.elements.map((e: any) => e.id)));
    say('[R-4] classes = ' + JSON.stringify(model.elements.map((e: any) => e.ifcClass)));
    const el = model.elements.find((e: any) => e.id === carry.cwId);
    say('[R-4] curtain-wall element = ' + (el ? 'PRESENT ifcClass=' + el.ifcClass : 'ABSENT'));
    expect(el, 'the curtain wall the REAL builder meshed must reach the exporter').toBeDefined();
    expect(el.ifcClass).toBe('IfcCurtainWall');
  }, 300_000);

  it('R-4c: CONTROL — the SAME store against an EMPTY scene exports nothing', async () => {
    const THREE: any = await import('@pryzm/renderer-three/three');
    const ffMod: any = await import('../../../../../packages/file-format/src/export/ifc/FragmentReader');
    const model: any = new ffMod.FragmentReader(
      { curtainWallStore: carry.cwStore }, { scene: new THREE.Scene() },
    ).read();
    say('[R-4c] CONTROL empty-scene elements = ' + String(model.elements.length));
    expect(model.elements).toHaveLength(0);
  }, 300_000);
});

afterAll(() => {
  const NL = String.fromCharCode(10);
  try {
    writeFileSync(
      'C://Users//LENOVO//OneDrive//Desktop//PRYZM//Product_Rediness_08//audit//element-creation//2026-08-29//probe//w4i//LOG-R.txt',
      LOG.join(NL), 'utf8',
    );
  } catch (e) { console.error('WRITE FAILED', e); }
});
