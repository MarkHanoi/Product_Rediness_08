// hello-12-elements — bus-end-to-end smoke for every element family
// (W-1C-1).
//
// Counterpart to `tests/integration/all-12-elements.test.ts` (S14-T9)
// which exercises every kernel PRODUCER directly.  This test exercises
// every BUS COMMAND end-to-end through a registry-driven runtime:
//
//     bootstrapWithEverything → bus.executeCommand('<family>.create', …)
//     → store contains the new entity.
//
// Acceptance:
//   • Every element-family `*.create` command lands its entity in the
//     corresponding store under runtime.stores.
//   • `view.create` lands the new ViewDefinition in runtime.viewRegistry.

import { describe, expect, it } from 'vitest';
import { createId } from '@pryzm/schemas';
import { bootstrapWithEverything } from '../src/bootstrap.everything.js';
import type { WallStore } from '@pryzm/plugin-wall';
import type { SlabStore } from '@pryzm/plugin-slab';
import type { DoorStore } from '@pryzm/plugin-door';
import type { WindowStore } from '@pryzm/plugin-window';
import type { RoofStore } from '@pryzm/plugin-roof';
import type { CurtainWallStore } from '@pryzm/plugin-curtain-wall';
import type { GridStore } from '@pryzm/plugin-grid';
import type { ColumnStore } from '@pryzm/plugin-column';
import type { BeamStore } from '@pryzm/plugin-beam';
import type { StairStore } from '@pryzm/plugin-stair';
import type { HandrailStore } from '@pryzm/plugin-handrail';
import type { CeilingStore } from '@pryzm/plugin-ceiling';

const AUDIT = { actorId: 'u', projectId: 'p', clientId: 'c', timestamp: '' } as const;

describe('hello-12-elements — bus-end-to-end smoke (W-1C-1)', () => {
  it('creates one entity of every element family via the bus', async () => {
    const rt = bootstrapWithEverything({ audit: AUDIT });

    // ---- 1. wall (5 m long so opening reservations have room) ----
    const wallId = createId('wall');
    await rt.bus.executeCommand('wall.create', {
      id: wallId,
      levelId: 'lvl',
      baseLine: [
        { x: 0, y: 0, z: 0 },
        { x: 5, y: 0, z: 0 },
      ],
    });
    expect((rt.stores.wall as unknown as WallStore).get(wallId)).toBeDefined();

    // ---- 2. slab ----
    const slabId = createId('slab');
    await rt.bus.executeCommand('slab.create', { id: slabId, levelId: 'lvl' });
    expect((rt.stores.slab as unknown as SlabStore).get(slabId)).toBeDefined();

    // ---- 3. door (requires a wall opening to be reserved first) ----
    const doorId = createId('door');
    const openingIdDoor = 'op_door_1';
    await rt.bus.executeCommand('wall.createOpening', {
      wallId,
      opening: {
        id: openingIdDoor,
        type: 'door',
        offset: 0.5,
        width: 0.9,
        height: 2.1,
        sillHeight: 0,
        elementId: doorId,
      },
    });
    await rt.bus.executeCommand('door.create', {
      id: doorId,
      wallId,
      openingId: openingIdDoor,
    });
    expect((rt.stores.door as unknown as DoorStore).get(doorId)).toBeDefined();

    // ---- 4. window (host opening on the same wall) ----
    const windowId = createId('window');
    const openingIdWin = 'op_win_1';
    await rt.bus.executeCommand('wall.createOpening', {
      wallId,
      opening: {
        id: openingIdWin,
        type: 'window',
        offset: 1.6,
        width: 0.9,
        height: 1.2,
        sillHeight: 0.9,
        elementId: windowId,
      },
    });
    await rt.bus.executeCommand('window.create', {
      id: windowId,
      wallId,
      openingId: openingIdWin,
    });
    expect((rt.stores.window as unknown as WindowStore).get(windowId)).toBeDefined();

    // ---- 5. roof ----
    const roofId = createId('roof');
    await rt.bus.executeCommand('roof.create', { id: roofId, levelId: 'lvl' });
    expect((rt.stores.roof as unknown as RoofStore).get(roofId)).toBeDefined();

    // ---- 6. curtain wall ----
    const cwId = createId('curtainwall');
    await rt.bus.executeCommand('curtainwall.create', { id: cwId, levelId: 'lvl' });
    expect((rt.stores.curtainwall as unknown as CurtainWallStore).get(cwId)).toBeDefined();

    // ---- 7. grid ----
    const gridId = createId('grid');
    await rt.bus.executeCommand('grid.create', {
      id: gridId,
      levelId: 'lvl',
      lines: [
        { id: 'A', label: 'A', kind: 'linear', start: { x: 0, y: 0, z: 0 }, end: { x: 10, y: 0, z: 0 } },
      ],
    });
    expect((rt.stores.grid as unknown as GridStore).get(gridId)).toBeDefined();

    // ---- 8. column ----
    const columnId = createId('column');
    await rt.bus.executeCommand('column.create', { id: columnId, levelId: 'lvl' });
    expect((rt.stores.column as unknown as ColumnStore).get(columnId)).toBeDefined();

    // ---- 9. beam ----
    const beamId = createId('beam');
    await rt.bus.executeCommand('beam.create', { id: beamId, levelId: 'lvl' });
    expect((rt.stores.beam as unknown as BeamStore).get(beamId)).toBeDefined();

    // ---- 10. stair ----
    const stairId = createId('stair');
    await rt.bus.executeCommand('stair.create', {
      id: stairId,
      levelId: 'lvl',
      topLevelId: 'lvl_top',
    });
    expect((rt.stores.stair as unknown as StairStore).get(stairId)).toBeDefined();

    // ---- 11. handrail ----
    const handrailId = createId('handrail');
    await rt.bus.executeCommand('handrail.create', { id: handrailId, levelId: 'lvl' });
    expect((rt.stores.handrail as unknown as HandrailStore).get(handrailId)).toBeDefined();

    // ---- 12. ceiling ----
    const ceilingId = createId('ceiling');
    await rt.bus.executeCommand('ceiling.create', { id: ceilingId, levelId: 'lvl' });
    expect((rt.stores.ceiling as unknown as CeilingStore).get(ceilingId)).toBeDefined();

    rt.tearDown();
  });

  it('exposes the view plugin store + handlers (13th plugin)', () => {
    // The view plugin's bus integration (CreateView reads ctx.stores.view
    // as a ViewRegistry instance, not a Record) is the responsibility of
    // W-2A view-state-integration.  W-1C-1 ships the plugin contribution:
    // ViewRegistry is registered as runtime.stores.view + 5 view handler
    // types are recorded under registeredHandlerTypes.view.
    const rt = bootstrapWithEverything({ audit: AUDIT });
    expect(rt.viewRegistry).toBeDefined();
    expect(rt.stores.view).toBe(rt.viewRegistry);
    expect(rt.registeredHandlerTypes.view).toEqual([
      'view.create',
      'view.delete',
      'view.rename',
      'view.switch',
      'view.updateCamera',
    ]);
    rt.tearDown();
  });
});
