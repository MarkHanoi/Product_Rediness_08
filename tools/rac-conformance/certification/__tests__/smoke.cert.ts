// Throwaway smoke: does the certification world compose headlessly?
import { describe, it, expect, beforeAll } from 'vitest';
import type { World } from '../world';

let world: World;

beforeAll(async () => {
  const { buildWorld } = await import('../world');
  world = await buildWorld();
}, 600_000);

describe('world smoke', () => {
  it('composes and registers the bridge verbs', async () => {
    const reg = world.bus.registry as Map<string, unknown>;
    const wanted = [
      'roof.update', 'wall.updateDimensions', 'element.updateParameters',
      'door.setOffset', 'window.setOffset', 'wall.updateBaseline',
      'wall.updateSystemTypeBatch', 'room.setMaterial', 'slab.updateDimensions',
    ];
    for (const v of wanted) console.log(`[smoke] registered ${v} = ${reg.has(v)}`);
    console.log('[smoke] registrationFailures =', JSON.stringify(world.registrationFailures));
    expect(reg.size).toBeGreaterThan(0);
  });

  it('seeds a wall through the REAL CommandManager + CreateWallCommand', async () => {
    const { CreateWallCommand } = await import('@pryzm/command-registry') as any;
    const r = world.cm.execute(new CreateWallCommand('cert-wall-1', {
      start: { x: 0, z: 0 }, end: { x: 6, z: 0 }, height: 3, thickness: 0.2, levelId: 'L0',
    }));
    console.log('[smoke] CreateWall result =', JSON.stringify(r));
    const rec = world.stores.wallStore.getById('cert-wall-1');
    console.log('[smoke] wallStore record present =', !!rec, 'height =', rec?.height);
    expect(!!rec).toBe(true);
  });

  it('roof.update via bus reaches the REAL roofStore', async () => {
    const { CreateRoofCommand } = await import('@pryzm/command-registry') as any;
    const r0 = world.cm.execute(new CreateRoofCommand('cert-roof-1', {
      levelId: 'L0',
      footprint: { polygon: [[-2, -2], [2, -2], [2, 2], [-2, 2]], centroid: [0, 0] },
      roofType: 'flat', overhang: 0.3, baseOffset: 3, thickness: 0.2,
    }));
    console.log('[smoke] CreateRoof result =', JSON.stringify(r0));
    const before = world.stores.roofStore.getById('cert-roof-1')?.thickness;
    const d = await world.dispatch('roof.update', { id: 'cert-roof-1', updates: { thickness: 0.35 } });
    const after = world.stores.roofStore.getById('cert-roof-1')?.thickness;
    console.log(`[smoke] roof.update dispatch=${d.ok ? 'OK' : 'THREW ' + d.err} thickness ${before} -> ${after}`);
    expect(after).toBe(0.35);
  });

  it('serializes with the REAL ProjectSerializer over the REAL stores', async () => {
    const mod = await import('../../../../apps/editor/src/engine/persistence/ProjectSerializer');
    const snap = mod.ProjectSerializer.serialize(world.stores as never, world.bimManager as never, { projectName: 'cert' });
    console.log('[smoke] snapshot walls =', snap.walls?.length, 'roofs =', snap.roofs?.length, 'levels =', snap.levels?.length);
    expect(snap.walls?.length).toBeGreaterThan(0);
  });

  it('loads with the REAL ProjectLoader', async () => {
    const modS = await import('../../../../apps/editor/src/engine/persistence/ProjectSerializer');
    const modL = await import('../../../../apps/editor/src/engine/persistence/ProjectLoader');
    const snap = JSON.parse(JSON.stringify(
      modS.ProjectSerializer.serialize(world.stores as never, world.bimManager as never, { projectName: 'cert' })));
    const loader = new modL.ProjectLoader(world.cm as never);
    const res = await loader.load(snap);
    console.log('[smoke] load result =', JSON.stringify({ success: res.success, loaded: res.loaded, failed: res.failed, errors: res.errors.slice(0, 5), warnings: res.warnings.slice(0, 5) }));
    const rec = world.stores.wallStore.getById('cert-wall-1');
    console.log('[smoke] wall after reload present =', !!rec);
    expect(typeof res.success).toBe('boolean');
  });
});
