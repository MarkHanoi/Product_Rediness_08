// hello-12-elements — PLUGIN-CONTRIBUTION smoke for every element family
// (W-1C-1).
//
// ⚠ §MT-01-COMPOSED-BUS-READBACK — READ THIS BEFORE TRUSTING ANY GREEN BELOW.
//
// This file used to describe itself as "bus-end-to-end" and claim that every
// `*.create` "lands its entity in the corresponding store". **That claim was
// FALSE, and it is what held MT-01 (C70 A-INV-3 · ADR-0318) closed for months
// while the capability was unreachable.**
//
// The defect was the RUNTIME, not the assertions. This file boots
// `bootstrapWithEverything({audit})` DIRECTLY (line ~55) — it never calls
// `composeRuntime()`, which P1 (CLAUDE.md) makes the only way production obtains
// a runtime. Two consequences, both measured:
//
//   1. NOTHING registers an authoritative element store in this process, so
//      `CreateWallHandler`'s census (`storeRegistry.getStoreForType('wall')`)
//      takes its `if (!s) return null` branch and the handler proceeds.
//      §PLUGIN-BOOTSTRAP-REGISTERS-NO-AUTHORITATIVE-STORE below PINS that, so
//      this file can never again be mistaken for an authoritative-state proof.
//   2. `rt.stores.wall` is therefore the PLUGIN DTO STORE — the very store MT-01
//      says nobody reads. On a composed runtime `runtime.stores` has no `.wall`
//      key at all (its keys are elements, hydrate, project, registerHydrator,
//      viewState).
//
// SO WHAT THIS FILE IS NOW, HONESTLY: a smoke test that every element plugin
// CONTRIBUTES a working handler + DTO store to a plugins-only bootstrap, and that
// the four verbs which must REFUSE (door, window, stair, and the opening
// reservations) still refuse. That is a real and useful invariant. It is NOT a
// reachability proof and it never was.
//
// WHY IT IS NOT SIMPLY REPOINTED AT `composeRuntime`: this suite's vitest
// environment is `node` ON PURPOSE (`apps/editor/vitest.config.ts` — sibling
// suites assert `globalThis.window === undefined`), and `composeRuntime` needs a
// DOM. The reachability question therefore lives in a sibling that opts into
// happy-dom for itself:
//
//     apps/editor/__tests__/composedBusElementReadback.test.ts
//
// — which composes via `composeRuntime()`, dispatches on THAT bus, and reads the
// element back out of `runtime.stores.elements.get('wall')`, the module singleton
// `ProjectSerializer` reads. Add authoritative-state claims THERE, never here.
//
// Counterpart to `tests/integration/all-12-elements.test.ts` (S14-T9) which
// exercises every kernel PRODUCER directly.

import { describe, expect, it } from 'vitest';
import { createId } from '@pryzm/schemas';
import { storeRegistry } from '@pryzm/core-app-model/store-registry';
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

describe('hello-12-elements — plugin-contribution smoke (W-1C-1)', () => {
  // §PLUGIN-BOOTSTRAP-REGISTERS-NO-AUTHORITATIVE-STORE (§MT-01-COMPOSED-BUS-READBACK).
  //
  // The header's diagnosis, asserted rather than described. This is the line that
  // stops this file from ever being read as a reachability proof again: in THIS
  // process there is no authoritative store to reach, so every `rt.stores.*`
  // assertion below is — provably — a read of the plugin DTO store.
  //
  // It is also the FALSIFIABILITY arm for the sibling: if a future change made
  // `bootstrapWithEverything` register authoritative stores on its own, this
  // expectation would go red and the reachability claim would have to move.
  it('registers NO authoritative element store — so nothing here can be an authoritative proof', async () => {
    await bootstrapWithEverything({ audit: AUDIT });
    for (const kind of ['wall', 'slab', 'room', 'door', 'window']) {
      expect(storeRegistry.getStoreForType(kind)).toBeUndefined();
    }
  });

  it('every element plugin contributes a handler + DTO store (NOT authoritative state)', async () => {
    const rt = await bootstrapWithEverything({ audit: AUDIT });

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
    // §MT-01: `rt.stores.wall` is the PLUGIN DTO store, NOT authoritative state.
    // The authoritative readback for wall.create lives in the sibling named in the
    // header — do not re-add an authoritative claim to this line.
    expect((rt.stores.wall as unknown as WallStore).get(wallId)).toBeDefined();

    // ---- 2. slab ----
    const slabId = createId('slab');
    await rt.bus.executeCommand('slab.create', { id: slabId, levelId: 'lvl' });
    // §MT-01: plugin DTO store again. Slab is still readback-NEGATIVE against the
    // authoritative SlabStore even on the composed bus — a SHAPE mismatch
    // (`boundary` vs `polygon`/`position`), enumerated in
    // `UNMIRRORED_KINDS` (@pryzm/runtime-composer) with its measured reason.
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
    // §FIX-CREATE-LIVENESS-LIE (BIM20 C5/C6, Wave 4) — `door.create` now REFUSES.
    // The CA-21 executed read-back caught it reporting success while the
    // AUTHORITATIVE doorStore (the one ProjectSerializer reads) never changed; the
    // green assertion this block used to carry was against the detached plugin DTO
    // store — the lie, pinned. The creation is the `wall.createOpening` above
    // (→ CreateWallOpeningCommand mints opening + doorStore record atomically in
    // production); here the refusal and the reserved opening are what is true.
    await expect(
      rt.bus.executeCommand('door.create', { id: doorId, wallId, openingId: openingIdDoor }),
    ).rejects.toThrow(/wall\.createOpening/);
    expect((rt.stores.door as unknown as DoorStore).get(doorId)).toBeUndefined();

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
    // §FIX-CREATE-LIVENESS-LIE — window twin of the door block above.
    await expect(
      rt.bus.executeCommand('window.create', { id: windowId, wallId, openingId: openingIdWin }),
    ).rejects.toThrow(/wall\.createOpening/);
    expect((rt.stores.window as unknown as WindowStore).get(windowId)).toBeUndefined();

    // ---- 5. roof ----
    const roofId = createId('roof');
    await rt.bus.executeCommand('roof.create', { id: roofId, levelId: 'lvl' });
    expect((rt.stores.roof as unknown as RoofStore).get(roofId)).toBeDefined();

    // ---- 6. curtain wall ----
    const cwId = createId('curtainwall');
    await rt.bus.executeCommand('curtain-wall.create', { id: cwId, levelId: 'lvl' });
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
    // §FIX-STAIR-CREATE-SHADOW (MT-03) — `stair.create` is no longer answered by
    // a plugin handler. The CA-21 read-back (StairCreateReachesGeometryStore.
    // test.ts, watched failing 3/3 first) ruled the verb belongs to the §E.5.4
    // initBusHandlers bridge → CreateStairCommand → the geometry StairStore (the
    // record the mesh builder, plan projector and ProjectSerializer read); the
    // plugin arm wrote only a detached DTO store, refused the live plan-tool
    // payload (shape 'I'), and minted phantom DTO stairs for the 3-D tools'
    // `{}` telemetry dispatches. A plugins-only runtime therefore has NO
    // stair.create handler — the editor boot owns the verb. What is true here:
    // the dispatch is refused loudly, and the plugin store minted nothing.
    const stairId = createId('stair');
    await expect(
      rt.bus.executeCommand('stair.create', { id: stairId, levelId: 'lvl', topLevelId: 'lvl_top' }),
    ).rejects.toThrow(/no handler registered/i);
    expect((rt.stores.stair as unknown as StairStore).get(stairId)).toBeUndefined();

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

  it('exposes the view plugin store + handlers (13th plugin)', async () => {
    // The view plugin's bus integration (CreateView reads ctx.stores.view
    // as a ViewRegistry instance, not a Record) is the responsibility of
    // W-2A view-state-integration.  W-1C-1 ships the plugin contribution:
    // ViewRegistry is registered as runtime.stores.view + 5 view handler
    // types are recorded under registeredHandlerTypes.view.
    const rt = await bootstrapWithEverything({ audit: AUDIT });
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
