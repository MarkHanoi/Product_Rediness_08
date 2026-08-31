// Room handler smoke suite (S25).
//
// Mirrors `plugins/slab/__tests__/handlers.test.ts`.  Asserts the
// 8 handlers register, accept their happy-path payloads, and produce
// invertible patches.  Boundary-detection correctness is in
// `packages/geometry-kernel/__tests__/produceRoom.parity.test.ts`.

import { afterEach, describe, expect, it } from 'vitest';
import {
  CommandBus,
  PatchEmitter,
  UndoStack,
  type EventRecord,
} from '@pryzm/plugin-sdk';
import { attachStores } from '@pryzm/plugin-sdk';
import { createId } from '@pryzm/plugin-sdk';
import { RoomStore, type RoomData, type RoomsState } from '../src/store.js';
import {
  buildRoomHandlerSet,
  registerRoomHandlers,
  ROOM_HANDLER_TYPES,
} from '../src/handlers/index.js';

function buildEnv() {
  const room = new RoomStore();
  const stores = { room: room as unknown as import('@pryzm/stores').Store<object> };
  const emitter = new PatchEmitter();
  const undoStack = new UndoStack({ maxSize: 50 });
  const bus = new CommandBus({
    audit: { actorId: 'test', projectId: 'p1', clientId: 't1' },
    emitter,
    undoStack,
    storesProvider: () => ({
      room: Object.fromEntries(room.getState()) as RoomsState,
    }),
  });
  for (const h of buildRoomHandlerSet()) bus.register(h);
  const detach = attachStores(emitter, stores);
  return { room, bus, emitter, undoStack, detach };
}

function snap(store: RoomStore): Record<string, RoomData> {
  return JSON.parse(JSON.stringify(Object.fromEntries(store.getState())));
}

function undoLast(store: RoomStore, ev: EventRecord<unknown>): void {
  store.applyPatch([...ev.inverse].reverse());
}

describe('room handler registration', () => {
  it('registerRoomHandlers wires all 8 command types', () => {
    const env = buildEnv();
    const bus = new CommandBus({
      audit: { actorId: 'test', projectId: 'p1', clientId: 't1' },
      storesProvider: () => ({ room: {} }),
    });
    const types = registerRoomHandlers(bus);
    expect([...types].sort()).toEqual([...ROOM_HANDLER_TYPES].sort());
    for (const t of ROOM_HANDLER_TYPES) expect(bus.has(t)).toBe(true);
    env.detach();
  });
});

// §FIX-ROOM-CREATE-STORE-KEY — `room.create` is a LEGACY BRIDGE, like its eleven
// siblings. It was the LAST handler in this directory still declaring
// `affectedStores: ['room']` against the bus storeKey `'rooms'`, so
// `CommandBus.buildContext()` threw "required store 'room' is missing from
// HandlerContext.stores" before `execute()` ever ran — in the browser as well as
// headlessly. That made `RoomPlanToolHandler`'s sole creation path a no-op behind
// a swallowed `.catch()`.
//
// These tests deliberately do NOT assert on the plugin `RoomsState`. The previous
// versions did, and in doing so they pinned the lie (C16 §5.1 CA-21): they passed
// against a store that neither the renderer, nor persistence, nor the area
// schedules read — for a verb the bus could not even dispatch. What is pinned now
// is the forwarded `CreateRoomCommand` and the refusals.
const COMPLETE_ROOM = (id: string) => ({
  id,
  type: 'room' as const,
  levelId: 'L1',
  name: 'Office 101',
  roomNumber: '101',
  occupancyType: 'unclassified',
  boundary: {
    polygon: [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 3 }, { x: 0, z: 3 }],
    height: 3, baseOffset: 0, detectionMethod: 'manual-boundary',
  },
  boundingWallIds: [], boundingSlabIds: [], boundingColumnIds: [],
  finishes: {}, properties: {},
  computed: {
    area: 12, grossArea: 12, perimeter: 14, volume: 36,
    centroid: { x: 2, z: 1.5 },
    boundingBox: { minX: 0, minZ: 0, maxX: 4, maxZ: 3 },
  },
  metadata: { createdAt: 0, modifiedAt: 0, createdBy: 'test', version: 1 },
});

describe('room.create — legacy bridge (§FIX-ROOM-CREATE-STORE-KEY)', () => {
  let env: ReturnType<typeof buildEnv>;
  const g = globalThis as unknown as { window?: unknown };
  const savedWindow = g.window;
  afterEach(() => {
    env?.detach();
    if (savedWindow === undefined) delete g.window;
    else g.window = savedWindow;
  });

  it('forwards a complete RoomData to the legacy CreateRoomCommand and writes no plugin store', async () => {
    env = buildEnv();
    const id = '11111111-1111-4111-a111-111111111111';
    const before = snap(env.room);
    const executed: Array<{ targetIds?: readonly string[] }> = [];
    g.window = {
      __pryzmInitComplete: true,
      commandManager: { execute: (c: unknown) => { executed.push(c as { targetIds?: readonly string[] }); } },
    };
    await env.bus.executeCommand('room.create', COMPLETE_ROOM(id));
    expect(executed).toHaveLength(1);
    expect(executed[0]?.targetIds).toContain(id);
    // The bridge owns no plugin store — the authoritative write is the command's.
    expect(snap(env.room)).toEqual(before);
  });

  it('refuses an incomplete payload and NAMES the derived fields it will not invent', async () => {
    env = buildEnv();
    g.window = {
      __pryzmInitComplete: true,
      commandManager: { execute: () => { throw new Error('must not run for an incomplete payload'); } },
    };
    // The old plugin-shaped payload: no boundary.polygon, no computed, no metadata.
    await expect(
      env.bus.executeCommand('room.create', { id: createId('room'), levelId: 'L1', name: 'Office 101' }),
    ).rejects.toThrow(/computed/);
    await expect(
      env.bus.executeCommand('room.create', { id: createId('room'), levelId: 'L1', name: 'Office 101' }),
    ).rejects.toThrow(/room\.redetect/);
  });

  it('refuses AS A VALUE, with both numbers, when no legacy command manager is present', async () => {
    // §FIX-ROOM-CREATE-REFUSAL-IS-A-VALUE (C-FIX LANE 3) — REWRITTEN, not
    // deleted, in the commit that changed the behaviour. This case used to
    // assert `.rejects.toThrow(/legacy command manager is not available/)`.
    //
    // The engine-absent branch now returns a typed `CapabilityRefusal` on
    // `HandlerResult.refusal` beside an empty patch pair (C80 §1.4) instead of
    // throwing, because three of this verb's four live dispatchers catch to an
    // EMPTY block (`RoomAIAssistant.ts:165`, `RoomTool.ts:224/387`) and so the
    // throw was reaching nobody — C80 §10.f's defect exactly.
    //
    // ⚠ THE OTHER THREE CASES IN THIS DESCRIBE STILL ASSERT THROWS ON PURPOSE.
    // An incomplete payload and a CreateRoomCommand rejection are ordinary
    // validation/propagation failures, not a withheld capability, and
    // flattening them into refusals would make "the room could not be created"
    // and "this process cannot create rooms at all" the same value.
    env = buildEnv();
    delete g.window;
    const record = await env.bus.executeCommand(
      'room.create',
      COMPLETE_ROOM('22222222-2222-4222-a222-222222222222'),
    );
    expect(record.refusal).toBeDefined();
    expect(record.refusal!.reason).toBe('ENGINE_NOT_AVAILABLE');
    expect(record.refusal!.asked).toBe(1);
    expect(record.refusal!.unaccountedFor).toBe(1);
    expect(record.refusal!.detail).toMatch(/legacy command manager is not present/);
    // Full coverage of the shape lives in __tests__/roomCreateEngineRefusal.test.ts.
  });

  it('surfaces a CreateRoomCommand refusal instead of reporting success', async () => {
    env = buildEnv();
    g.window = {
      __pryzmInitComplete: true,
      commandManager: { execute: () => ({ success: false, error: "Level 'L1' not found" }) },
    };
    await expect(
      env.bus.executeCommand('room.create', COMPLETE_ROOM('33333333-3333-4333-a333-333333333333')),
    ).rejects.toThrow(/CreateRoomCommand refused — Level 'L1' not found/);
  });
});

describe('room.delete — legacy bridge', () => {
  // DeleteRoomHandler is now an F-1.x bridge (like RenameRoomHandler): it does
  // NOT mutate the plugin RoomsState; it forwards to the legacy DeleteRoomCommand
  // via window.commandManager (where the detected/rendered rooms actually live).
  let env: ReturnType<typeof buildEnv>;
  const g = globalThis as unknown as { window?: unknown };
  const savedWindow = g.window;
  afterEach(() => {
    env?.detach();
    if (savedWindow === undefined) delete g.window;
    else g.window = savedWindow;
  });

  it('bridges to the legacy DeleteRoomCommand via window.commandManager', async () => {
    env = buildEnv();
    const executed: Array<{ targetIds?: readonly string[] }> = [];
    g.window = {
      __pryzmInitComplete: true,
      commandManager: { execute: (c: unknown) => executed.push(c as { targetIds?: readonly string[] }) },
    };
    await env.bus.executeCommand('room.delete', { roomId: 'room_abc' });
    // The bridge mutates no plugin store…
    expect(env.room.size()).toBe(0);
    // …and forwarded exactly one DeleteRoomCommand targeting the room.
    expect(executed).toHaveLength(1);
    expect(executed[0]?.targetIds).toContain('room_abc');
  });

  // §FIX-DEAD-VERB-ROOM-BRIDGE (W3-3) — this used to assert the handler "no-ops (does
  // not throw)" pre-init, i.e. it PINNED the silent lie: the bus resolved successfully
  // while the room was never deleted, and the caller could not tell that apart from a
  // real delete. C03 §4.6 U-4 — failure and emptiness are never the same value. What is
  // pinned now is the REFUSAL and its reason; the pre-init guarantee that the legacy
  // commandManager is never invoked is retained by the throwing stub below.
  it('refuses, with a reason, before the engine is initialised', async () => {
    env = buildEnv();
    g.window = {
      __pryzmInitComplete: false,
      commandManager: { execute: () => { throw new Error('must not run pre-init'); } },
    };
    await expect(env.bus.executeCommand('room.delete', { roomId: 'room_x' }))
      .rejects.toThrow(/room\.delete: the engine is not initialised/);
  });

  it('rejects an empty roomId payload', async () => {
    env = buildEnv();
    g.window = { __pryzmInitComplete: true, commandManager: { execute: () => {} } };
    await expect(
      env.bus.executeCommand('room.delete', { roomId: '' }),
    ).rejects.toThrow();
  });
});

// §FIX-ROOM-SIBLING-HANDLERS-STORE (L-79) — room.move is a LEGACY BRIDGE (like
// room.setName / room.delete): it forwards an UpdateRoomBoundaryCommand through
// window.commandManager (translating the legacy room's boundary polygon read from
// window.roomStore) and declares affectedStores:[]. The previous
// affectedStores:['room'] mismatched the bus storeKey 'rooms' and threw
// "required store 'room' is missing from HandlerContext.stores".
describe('room.move — legacy bridge (§FIX-ROOM-SIBLING-HANDLERS-STORE, L-79)', () => {
  let env: ReturnType<typeof buildEnv>;
  const g = globalThis as unknown as { window?: unknown };
  const savedWindow = g.window;
  afterEach(() => {
    env?.detach();
    if (savedWindow === undefined) delete g.window;
    else g.window = savedWindow;
  });

  function busWithoutRoomStore() {
    const bus = new CommandBus({
      audit: { actorId: 'test', projectId: 'p1', clientId: 't1' },
      storesProvider: () => ({}),
    });
    for (const h of buildRoomHandlerSet()) bus.register(h);
    return bus;
  }

  it('does NOT throw the missing-store error and forwards a translated UpdateRoomBoundaryCommand', async () => {
    env = buildEnv();
    const bus = busWithoutRoomStore();
    const executed: Array<{ type?: string; targetIds?: readonly string[] }> = [];
    g.window = {
      __pryzmInitComplete: true,
      commandManager: { execute: (c: unknown) => executed.push(c as { type?: string }) },
      roomStore: {
        getById: () => ({
          boundary: {
            polygon: [
              { x: 0, z: 0 },
              { x: 2, z: 0 },
              { x: 2, z: 2 },
            ],
            height: 2.4,
            baseOffset: 0,
            detectionMethod: 'auto-topology',
          },
        }),
      },
    };
    await expect(
      bus.executeCommand('room.move', { roomId: 'room_abc', delta: { x: 10, y: 1, z: 5 } }),
    ).resolves.toBeDefined();
    expect(executed).toHaveLength(1);
    expect(executed[0]?.type).toBe('UPDATE_ROOM_BOUNDARY');
    expect(executed[0]?.targetIds).toContain('room_abc');
    // The plugin RoomsState is NOT mutated by the bridge.
    expect(env.room.size()).toBe(0);
  });

  // §FIX-DEAD-VERB-ROOM-BRIDGE (W3-3) — see room.delete above: a pre-init "no-op that
  // resolves" is indistinguishable from a move that happened. Pin the refusal instead.
  it('refuses, with a reason, before the engine is initialised', async () => {
    env = buildEnv();
    const bus = busWithoutRoomStore();
    g.window = {
      __pryzmInitComplete: false,
      commandManager: { execute: () => { throw new Error('must not run pre-init'); } },
    };
    await expect(
      bus.executeCommand('room.move', { roomId: 'room_x', delta: { x: 1, y: 0, z: 0 } }),
    ).rejects.toThrow(/room\.move: the engine is not initialised/);
  });
});

// §FIX-ROOM-SETNAME-STORE (L-75) — room.setName is a LEGACY BRIDGE (like
// room.rename / room.delete): the detected/rendered/persisted rooms live in the
// legacy room-topology RoomStore (window.roomStore), not the plugin RoomsState,
// so the handler forwards a RenameRoomCommand through window.commandManager and
// declares affectedStores:[] (no plugin-store injection required — the previous
// affectedStores:['room'] mismatched the bus storeKey 'rooms' and threw
// "required store 'room' is missing from HandlerContext.stores").
describe('room.setName — legacy bridge (§FIX-ROOM-SETNAME-STORE, L-75)', () => {
  let env: ReturnType<typeof buildEnv>;
  const g = globalThis as unknown as { window?: unknown };
  const savedWindow = g.window;
  afterEach(() => {
    env?.detach();
    if (savedWindow === undefined) delete g.window;
    else g.window = savedWindow;
  });

  // Build a bus whose storesProvider has NO 'room' key — faithfully reproducing
  // the production wiring (PluginRegistry contributes the plugin RoomStore under
  // storeKey 'rooms', so 'room' is absent). Before the fix, room.setName declared
  // affectedStores:['room'] → buildContext threw the R1A-16 missing-store error.
  // This test fails if that regression returns.
  function busWithoutRoomStore() {
    const bus = new CommandBus({
      audit: { actorId: 'test', projectId: 'p1', clientId: 't1' },
      storesProvider: () => ({}),
    });
    for (const h of buildRoomHandlerSet()) bus.register(h);
    return bus;
  }

  it('does NOT throw the missing-store error and forwards a RenameRoomCommand', async () => {
    env = buildEnv();
    const bus = busWithoutRoomStore();
    const executed: Array<{ targetIds?: readonly string[]; [k: string]: unknown }> = [];
    g.window = {
      __pryzmInitComplete: true,
      commandManager: {
        execute: (c: unknown) => executed.push(c as { targetIds?: readonly string[] }),
      },
    };
    await expect(
      bus.executeCommand('room.setName', { roomId: 'room_abc', name: 'Atrium' }),
    ).resolves.toBeDefined();
    // Bridged exactly one RenameRoomCommand targeting the room, carrying the name.
    expect(executed).toHaveLength(1);
    expect(executed[0]?.targetIds).toContain('room_abc');
    expect(executed[0]?.type).toBe('RENAME_ROOM');
    // The plugin RoomsState is NOT mutated by the bridge.
    expect(env.room.size()).toBe(0);
  });

  // §FIX-DEAD-VERB-ROOM-BRIDGE (W3-3) — see room.delete above. A rename the user watched
  // "succeed" and then lost on reload is the exact Class-A dead verb; pin the refusal.
  it('refuses, with a reason, before the engine is initialised', async () => {
    env = buildEnv();
    const bus = busWithoutRoomStore();
    g.window = {
      __pryzmInitComplete: false,
      commandManager: { execute: () => { throw new Error('must not run pre-init'); } },
    };
    await expect(
      bus.executeCommand('room.setName', { roomId: 'room_x', name: 'Late' }),
    ).rejects.toThrow(/room\.setName: the engine is not initialised/);
  });

  it('rejects an empty name payload', async () => {
    env = buildEnv();
    const bus = busWithoutRoomStore();
    g.window = { __pryzmInitComplete: true, commandManager: { execute: () => {} } };
    await expect(
      bus.executeCommand('room.setName', { roomId: 'room_abc', name: '' }),
    ).rejects.toThrow();
  });

  it('rejects an empty roomId payload', async () => {
    env = buildEnv();
    const bus = busWithoutRoomStore();
    g.window = { __pryzmInitComplete: true, commandManager: { execute: () => {} } };
    await expect(
      bus.executeCommand('room.setName', { roomId: '', name: 'X' }),
    ).rejects.toThrow();
  });

  // ── §FIX-S4-VOICE-ABSENT-TARGET (C16 CA-18) ────────────────────────────────
  //
  // check-authoritative-state arm S4-VOICE, ledger entry
  // "S4-VOICE REFUSAL room.setName(absent room)": dispatching at a roomId that
  // does not exist resolved ok=true, moved zero authoritative paths, and put no
  // refusal in front of the caller. S4-STATE passed the whole time — nothing was
  // mutated — so the defect was never state, it was that SUCCESS AND REFUSAL WERE
  // THE SAME OBSERVABLE at the dispatch site.
  //
  // The refusal existed: RenameRoomCommand.canExecute returns
  // `{ok:false, reason:"Room '<id>' not found"}` and CommandManagerImpl surfaces it
  // as `{success:false, info:[reason]}` WITHOUT throwing. The handler discarded
  // that object. These two tests pin the distinguishability, not the absence of a
  // crash — the assertion is on the DISCRIMINANT (rejected vs resolved) and on the
  // reason text naming the missing room.
  it('SURFACES a RenameRoomCommand refusal for an absent room instead of reporting success', async () => {
    env = buildEnv();
    const bus = busWithoutRoomStore();
    // Exactly what the REAL CommandManagerImpl returns on a canExecute refusal
    // (CommandManagerImpl.ts:172-185): a resolved object, never a throw.
    g.window = {
      __pryzmInitComplete: true,
      commandManager: {
        execute: () => ({
          success: false,
          affectedElementIds: [],
          info: ["Room 'no-such-room-at-all' not found"],
        }),
      },
    };
    await expect(
      bus.executeCommand('room.setName', { roomId: 'no-such-room-at-all', name: 'X' }),
    ).rejects.toThrow(/room\.setName: RenameRoomCommand refused — Room 'no-such-room-at-all' not found/);
  });

  it('a caller can DISTINGUISH the absent-room refusal from a real rename', async () => {
    // The whole point of the arm, asserted as one comparison rather than two
    // isolated cases: same verb, same shape of payload, two outcomes that a
    // script / the AI / a retry loop can tell apart WITHOUT reading the console.
    env = buildEnv();
    const bus = busWithoutRoomStore();

    const seen: string[] = [];
    g.window = {
      __pryzmInitComplete: true,
      commandManager: {
        execute: (c: unknown) => {
          const id = (c as { targetIds?: readonly string[] }).targetIds?.[0] ?? '';
          seen.push(id);
          return id === 'room_present'
            ? { success: true, affectedElementIds: [id] }
            : { success: false, affectedElementIds: [], info: [`Room '${id}' not found`] };
        },
      },
    };

    const present = await bus
      .executeCommand('room.setName', { roomId: 'room_present', name: 'Atrium' })
      .then(() => 'resolved' as const, () => 'rejected' as const);
    const absent = await bus
      .executeCommand('room.setName', { roomId: 'room_absent', name: 'Atrium' })
      .then(() => 'resolved' as const, () => 'rejected' as const);

    expect(present).toBe('resolved');
    expect(absent).toBe('rejected');
    expect(present).not.toBe(absent);
    // Both reached the legacy command — the refusal is the LEGACY layer's verdict
    // being surfaced, not a new pre-check that short-circuits the bridge.
    expect(seen).toEqual(['room_present', 'room_absent']);
  });

  // ZERO BEHAVIOUR CHANGE WHEN THE ROOM EXISTS. The success path must be
  // byte-identical to today, including for the historical `execute(): void` shape
  // and for doubles that return a non-object (the suite above uses
  // `executed.push(...)`, which returns a NUMBER). Only an explicit
  // `success === false` refuses; `undefined` and `3` must both still resolve.
  it('leaves the success path untouched for void / non-object / success:true managers', async () => {
    env = buildEnv();
    for (const execute of [
      () => { /* historical `execute(): void` */ },
      () => 3 as unknown as void,                       // `arr.push()` shape
      () => ({ success: true, affectedElementIds: ['room_abc'] }),
      () => ({ affectedElementIds: ['room_abc'] }),      // no `success` field at all
    ]) {
      const bus = busWithoutRoomStore();
      g.window = { __pryzmInitComplete: true, commandManager: { execute } };
      await expect(
        bus.executeCommand('room.setName', { roomId: 'room_abc', name: 'Atrium' }),
      ).resolves.toBeDefined();
    }
  });
});

// §FIX-ROOM-SIBLING-HANDLERS-STORE (L-79) — setNumber / setOccupancy / setMaterial
// / setHeightOffset are now LEGACY BRIDGES (like room.setName): each forwards the
// corresponding legacy command through window.commandManager and declares
// affectedStores:[]. Before the fix each declared affectedStores:['room'] against
// the bus storeKey 'rooms' → buildContext threw the R1A-16 missing-store error, and
// the mutation targeted the disconnected plugin RoomsState the renderer/persistence
// never read. Each test runs a bus with NO 'room' store key (production wiring) and
// asserts the right legacy CommandType is forwarded with no throw.
describe('room.setNumber / setOccupancy / setMaterial / setHeightOffset — legacy bridges (§FIX-ROOM-SIBLING-HANDLERS-STORE, L-79)', () => {
  let env: ReturnType<typeof buildEnv>;
  const g = globalThis as unknown as { window?: unknown };
  const savedWindow = g.window;
  afterEach(() => {
    env?.detach();
    if (savedWindow === undefined) delete g.window;
    else g.window = savedWindow;
  });

  function busWithoutRoomStore() {
    const bus = new CommandBus({
      audit: { actorId: 'test', projectId: 'p1', clientId: 't1' },
      storesProvider: () => ({}),
    });
    for (const h of buildRoomHandlerSet()) bus.register(h);
    return bus;
  }

  function stubWindow(executed: Array<{ type?: string; targetIds?: readonly string[] }>) {
    g.window = {
      __pryzmInitComplete: true,
      commandManager: { execute: (c: unknown) => executed.push(c as { type?: string }) },
      roomStore: {
        getById: () => ({
          boundary: {
            polygon: [
              { x: 0, z: 0 },
              { x: 2, z: 0 },
              { x: 2, z: 2 },
            ],
            height: 2.4,
            baseOffset: 0,
            detectionMethod: 'auto-topology',
          },
        }),
      },
    };
  }

  it('setNumber forwards a RenameRoomCommand (empty string clears)', async () => {
    env = buildEnv();
    const bus = busWithoutRoomStore();
    const executed: Array<{ type?: string; targetIds?: readonly string[] }> = [];
    stubWindow(executed);
    await expect(
      bus.executeCommand('room.setNumber', { roomId: 'room_abc', number: '101' }),
    ).resolves.toBeDefined();
    expect(executed).toHaveLength(1);
    expect(executed[0]?.type).toBe('RENAME_ROOM');
    expect(executed[0]?.targetIds).toContain('room_abc');
    // Clearing (empty string) still forwards a RenameRoomCommand.
    await bus.executeCommand('room.setNumber', { roomId: 'room_abc', number: '' });
    expect(executed).toHaveLength(2);
    expect(env.room.size()).toBe(0);
  });

  it('setOccupancy forwards a SetRoomOccupancyCommand', async () => {
    env = buildEnv();
    const bus = busWithoutRoomStore();
    const executed: Array<{ type?: string; targetIds?: readonly string[] }> = [];
    stubWindow(executed);
    await expect(
      bus.executeCommand('room.setOccupancy', { roomId: 'room_abc', occupancy: 'bathroom' }),
    ).resolves.toBeDefined();
    expect(executed).toHaveLength(1);
    expect(executed[0]?.type).toBe('SET_ROOM_OCCUPANCY');
    expect(executed[0]?.targetIds).toContain('room_abc');
  });

  it('setMaterial forwards an UpdateRoomCommand carrying the colour', async () => {
    env = buildEnv();
    const bus = busWithoutRoomStore();
    const executed: Array<{ type?: string; targetIds?: readonly string[] }> = [];
    stubWindow(executed);
    await expect(
      bus.executeCommand('room.setMaterial', { roomId: 'room_abc', materialColor: '#ff0000' }),
    ).resolves.toBeDefined();
    expect(executed).toHaveLength(1);
    expect(executed[0]?.type).toBe('UPDATE_ROOM');
    expect(executed[0]?.targetIds).toContain('room_abc');
  });

  it('setMaterial still requires at least one of materialId / materialColor', async () => {
    env = buildEnv();
    const bus = busWithoutRoomStore();
    const executed: Array<{ type?: string }> = [];
    stubWindow(executed);
    await expect(
      bus.executeCommand('room.setMaterial', { roomId: 'room_abc' }),
    ).rejects.toThrow();
  });

  it('setHeightOffset forwards an UpdateRoomCommand (in-range) and rejects out-of-range', async () => {
    env = buildEnv();
    const bus = busWithoutRoomStore();
    const executed: Array<{ type?: string; targetIds?: readonly string[] }> = [];
    stubWindow(executed);
    await expect(
      bus.executeCommand('room.setHeightOffset', { roomId: 'room_abc', heightOffset: 0.5 }),
    ).resolves.toBeDefined();
    expect(executed).toHaveLength(1);
    expect(executed[0]?.type).toBe('UPDATE_ROOM');
    expect(executed[0]?.targetIds).toContain('room_abc');
    await expect(
      bus.executeCommand('room.setHeightOffset', { roomId: 'room_abc', heightOffset: 11 }),
    ).rejects.toThrow();
    await expect(
      bus.executeCommand('room.setHeightOffset', { roomId: 'room_abc', heightOffset: Number.NaN }),
    ).rejects.toThrow();
  });

  // §FIX-DEAD-VERB-ROOM-BRIDGE (W3-3) — see room.delete above. Pin the refusal, and
  // assert it for the WHOLE sibling family so one handler cannot silently regress to a
  // no-op while its three siblings refuse.
  it('refuses, with a reason, before the engine is initialised — all four siblings', async () => {
    env = buildEnv();
    const bus = busWithoutRoomStore();
    g.window = {
      __pryzmInitComplete: false,
      commandManager: { execute: () => { throw new Error('must not run pre-init'); } },
    };
    await expect(
      bus.executeCommand('room.setNumber', { roomId: 'room_x', number: '9' }),
    ).rejects.toThrow(/room\.setNumber: the engine is not initialised/);
    await expect(
      bus.executeCommand('room.setOccupancy', { roomId: 'room_x', occupancy: 'Office' }),
    ).rejects.toThrow(/room\.setOccupancy: the engine is not initialised/);
    await expect(
      bus.executeCommand('room.setHeightOffset', { roomId: 'room_x', heightOffset: 0.25 }),
    ).rejects.toThrow(/room\.setHeightOffset: the engine is not initialised/);
    // room.setMaterial's colour path is the one live bridge in this family — pre-init it
    // must refuse for the same reason rather than reporting an applied fill.
    await expect(
      bus.executeCommand('room.setMaterial', { roomId: 'room_x', materialColor: '#ff0000' }),
    ).rejects.toThrow(/room\.setMaterial: the engine is not initialised/);
  });
});

// §DEPT153 (L-12540+) — room.setDepartment is a LEGACY BRIDGE, mirroring
// room.setNumber EXACTLY (same RenameRoomCommand target, same empty-string-clears
// shape). This is the manual Department field's ONLY writer
// (RoomPropertySection.ts, beside Occupancy).
describe('room.setDepartment — legacy bridge (§DEPT153)', () => {
  let env: ReturnType<typeof buildEnv>;
  const g = globalThis as unknown as { window?: unknown };
  const savedWindow = g.window;
  afterEach(() => {
    env?.detach();
    if (savedWindow === undefined) delete g.window;
    else g.window = savedWindow;
  });

  function busWithoutRoomStore() {
    const bus = new CommandBus({
      audit: { actorId: 'test', projectId: 'p1', clientId: 't1' },
      storesProvider: () => ({}),
    });
    for (const h of buildRoomHandlerSet()) bus.register(h);
    return bus;
  }

  it('is registered by registerRoomHandlers', () => {
    expect(ROOM_HANDLER_TYPES).toContain('room.setDepartment');
  });

  it('forwards a RenameRoomCommand carrying department (empty string clears)', async () => {
    env = buildEnv();
    const bus = busWithoutRoomStore();
    const executed: Array<{ type?: string; targetIds?: readonly string[] }> = [];
    g.window = {
      __pryzmInitComplete: true,
      commandManager: { execute: (c: unknown) => executed.push(c as { type?: string }) },
    };
    await expect(
      bus.executeCommand('room.setDepartment', { roomId: 'room_abc', department: 'Residential' }),
    ).resolves.toBeDefined();
    expect(executed).toHaveLength(1);
    expect(executed[0]?.type).toBe('RENAME_ROOM');
    expect(executed[0]?.targetIds).toContain('room_abc');
    // Clearing (empty string) still forwards a RenameRoomCommand — mirrors setNumber.
    await bus.executeCommand('room.setDepartment', { roomId: 'room_abc', department: '' });
    expect(executed).toHaveLength(2);
    // The plugin RoomsState is NOT mutated by the bridge.
    expect(env.room.size()).toBe(0);
  });

  it('refuses, with a reason, before the engine is initialised', async () => {
    env = buildEnv();
    const bus = busWithoutRoomStore();
    g.window = {
      __pryzmInitComplete: false,
      commandManager: { execute: () => { throw new Error('must not run pre-init'); } },
    };
    await expect(
      bus.executeCommand('room.setDepartment', { roomId: 'room_x', department: 'Residential' }),
    ).rejects.toThrow(/room\.setDepartment: the engine is not initialised/);
  });

  it('rejects an empty roomId payload', async () => {
    env = buildEnv();
    const bus = busWithoutRoomStore();
    g.window = { __pryzmInitComplete: true, commandManager: { execute: () => {} } };
    await expect(
      bus.executeCommand('room.setDepartment', { roomId: '', department: 'Residential' }),
    ).rejects.toThrow();
  });
});

// §FIX-ROOM-SIBLING-HANDLERS-STORE (L-79) — room.recomputeBoundary declares
// affectedStores:[]; before L-79 it declared affectedStores:['room'] and threw
// "required store 'room' is missing" on every wall create/move/resize.
//
// ⚠ RETITLED 2026-08-15 (PR-11). This block used to be called "no-op legacy
// bridge" and its assertions were `resolves.toBeDefined()` + "mutated no store"
// — BOTH OF WHICH PASS AGAINST A HANDLER THAT DOES NOTHING. That is the PR-11
// defect expressed as a test: it pinned the no-op and reported it as coverage.
// The handler now ANSWERS (typed determination, C78 §8.1), and the assertions
// that can tell the difference live in `__tests__/recomputeRoomBoundary.test.ts`.
// What survives HERE is only the store-key regression L-79 actually fixed.
describe('room.recomputeBoundary — L-79 store-key regression only (see recomputeRoomBoundary.test.ts)', () => {
  let env: ReturnType<typeof buildEnv>;
  afterEach(() => env?.detach());

  function busWithoutRoomStore() {
    const bus = new CommandBus({
      audit: { actorId: 'test', projectId: 'p1', clientId: 't1' },
      storesProvider: () => ({}),
    });
    for (const h of buildRoomHandlerSet()) bus.register(h);
    return bus;
  }

  it('does NOT throw the missing-store error, and mutates no plugin store', async () => {
    env = buildEnv();
    const bus = busWithoutRoomStore();
    const record = await bus.executeCommand(
      'room.recomputeBoundary',
      { roomId: 'room_abc', cascadedFrom: 'wall.move' },
    );
    // L-79: resolves rather than throwing "required store 'room' is missing".
    expect(record).toBeDefined();
    // CA-19: the detached plugin RoomsState is untouched.
    expect(env.room.size()).toBe(0);
    // PR-11: and — unlike the no-op this replaces — it does not report SUCCESS.
    // With no readable room store it must refuse, typed.
    expect((record as unknown as { refusal?: { reason: string } }).refusal?.reason)
      .toBe('RELATIONSHIP_NOT_READABLE');
  });

  it('rejects an empty roomId payload', async () => {
    env = buildEnv();
    const bus = busWithoutRoomStore();
    await expect(
      bus.executeCommand('room.recomputeBoundary', { roomId: '' }),
    ).rejects.toThrow();
  });
});
