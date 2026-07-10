/**
 * §DUPLICATE-ROOMS-PERSIST (2026-06-26) — replay / catch-up idempotency.
 *
 * Collab catch-up re-sends the full command log. When a project is opened its
 * elements are hydrated into the registry BEFORE replay catches up, so the
 * replay re-executes the SAME CREATE_* commands for ids that already exist:
 *   - CreateRoomCommand does roomStore.add() (duplicate "Room NN" twin) before
 *     hitting the throwing registerSemantic (swallowed) → duplicate room persists.
 *   - CreateStair/CreateVerticalCirculation FATAL on "ID already exists".
 *
 * RemoteCommandDispatcher.dispatch now skips a create whose every targetId is
 * already registered, making replay idempotent. These tests pin that contract
 * at the pure-predicate level (so they don't need the full CommandRegistry /
 * window.runtime bus stack), plus the replayCatchUp skip-count behaviour.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

// The real @pryzm/core-app-model/element-registry barrel touches `window` at
// module init (ViewRenderCache), which is undefined in this node-env suite.
// We only depend on `elementRegistry.getStoreType` for the idempotency check, so
// stub the module with a minimal in-memory registry. This keeps the test fast and
// free of the DOM-coupled transitive imports without changing production code.
const _store = new Map<string, string>();
vi.mock('@pryzm/core-app-model/element-registry', () => ({
  elementRegistry: {
    getStoreType: (id: string) => _store.get(id),
    registerSemantic: (id: string, storeType: string) => { _store.set(id, storeType); },
    clear: () => { _store.clear(); },
  },
}));

// Also stub the CommandRegistry barrel the dispatcher imports — the duplicate-skip
// path returns BEFORE reconstructing a command, so the factory is never used here.
vi.mock('../src/engine/CommandRegistry', () => ({
  CommandRegistry: { create: () => null },
}));

const { elementRegistry } = await import('@pryzm/core-app-model/element-registry');
const { isAlreadyAppliedCreate, RemoteCommandDispatcher } =
  await import('../src/engine/RemoteCommandDispatcher');
type SerializedCommand = import('@pryzm/command-registry').SerializedCommand;

function serialized(type: string, targetIds: string[]): SerializedCommand {
  return { type: type as never, payload: {}, targetIds, timestamp: 0, version: 1 };
}

// §FIX-CATCHUP-DUPLICATE-CREATE — dotted-bus creates carry ids INLINE in the
// payload (not in targetIds), so build serialized records that mirror the bus
// shape: single create → payload.id; batch → payload[<arrayField>][].id.
function busSerialized(type: string, payload: Record<string, unknown>): SerializedCommand {
  return { type: type as never, payload, targetIds: [], timestamp: 0, version: 1 } as SerializedCommand;
}

afterEach(() => {
  (elementRegistry as { clear: () => void }).clear();
});

describe('isAlreadyAppliedCreate (§DUPLICATE-ROOMS-PERSIST)', () => {
  it('skips a CREATE_ROOM whose target id is already registered', () => {
    elementRegistry.registerSemantic('room-7', 'room');
    expect(isAlreadyAppliedCreate(serialized('CREATE_ROOM', ['room-7']))).toBe(true);
  });

  it('skips a CREATE_STAIR whose target id is already registered (fixes the FATAL)', () => {
    elementRegistry.registerSemantic('stair_42', 'stair');
    expect(isAlreadyAppliedCreate(serialized('CREATE_STAIR', ['stair_42']))).toBe(true);
  });

  it('does NOT skip a CREATE whose target is not yet registered (first apply still runs)', () => {
    expect(isAlreadyAppliedCreate(serialized('CREATE_ROOM', ['room-new']))).toBe(false);
  });

  it('does NOT skip a partially-applied batch (some ids missing → replay fills the gap)', () => {
    elementRegistry.registerSemantic('room-a', 'room');
    // room-b not registered yet → the batch is not fully applied → must replay.
    expect(isAlreadyAppliedCreate(serialized('BATCH_CREATE_ROOMS', ['room-a', 'room-b']))).toBe(false);
  });

  it('skips a fully-applied BATCH_CREATE_ROOMS', () => {
    elementRegistry.registerSemantic('room-a', 'room');
    elementRegistry.registerSemantic('room-b', 'room');
    expect(isAlreadyAppliedCreate(serialized('BATCH_CREATE_ROOMS', ['room-a', 'room-b']))).toBe(true);
  });

  it('never skips a non-create command (move/update/delete always replay)', () => {
    elementRegistry.registerSemantic('room-7', 'room');
    expect(isAlreadyAppliedCreate(serialized('MOVE_FURNITURE', ['room-7']))).toBe(false);
    expect(isAlreadyAppliedCreate(serialized('UPDATE_ROOM_BOUNDING_LINE', ['room-7']))).toBe(false);
    expect(isAlreadyAppliedCreate(serialized('DELETE_ROOM_BOUNDING_LINE', ['room-7']))).toBe(false);
  });

  it('never skips a create with empty targetIds (derived/bulk creates that do not predeclare ids)', () => {
    expect(isAlreadyAppliedCreate(serialized('CREATE_SLABS_ON_ALL_FLOORS', []))).toBe(false);
  });
});

describe('isAlreadyAppliedCreate — furniture / dotted-bus family (§FIX-CATCHUP-DUPLICATE-CREATE, L-18)', () => {
  it('skips a legacy CREATE_FURNITURE whose target id is already registered (the founder-reported catch-up path)', () => {
    // CreateFurnitureCommand now registers the furniture id in the ElementRegistry
    // on execute(), exactly like CreateWallCommand — so a replayed CREATE_FURNITURE
    // (targetIds carries the id) on catch-up is recognised as already-applied.
    elementRegistry.registerSemantic('furn-sofa-1', 'furniture');
    expect(isAlreadyAppliedCreate(serialized('CREATE_FURNITURE', ['furn-sofa-1']))).toBe(true);
  });

  it('skips a dotted-bus furniture.create whose payload id is already registered', () => {
    elementRegistry.registerSemantic('furn-9', 'furniture');
    expect(isAlreadyAppliedCreate(busSerialized('furniture.create', { id: 'furn-9' }))).toBe(true);
  });

  it('does NOT skip a genuinely NEW remote furniture.create (id not yet registered → first apply runs)', () => {
    expect(isAlreadyAppliedCreate(busSerialized('furniture.create', { id: 'furn-new' }))).toBe(false);
  });

  it('skips a fully-applied furniture.batch.create (every per-entry id registered)', () => {
    elementRegistry.registerSemantic('furn-a', 'furniture');
    elementRegistry.registerSemantic('furn-b', 'furniture');
    expect(isAlreadyAppliedCreate(
      busSerialized('furniture.batch.create', { furniture: [{ id: 'furn-a' }, { id: 'furn-b' }] }),
    )).toBe(true);
  });

  it('does NOT skip a partially-applied furniture.batch.create (one id missing → replay fills the gap)', () => {
    elementRegistry.registerSemantic('furn-a', 'furniture');
    // furn-b not registered yet → batch not fully applied → must replay.
    expect(isAlreadyAppliedCreate(
      busSerialized('furniture.batch.create', { furniture: [{ id: 'furn-a' }, { id: 'furn-b' }] }),
    )).toBe(false);
  });

  it('covers another dotted-bus create family too — lighting.create (not special-cased to furniture)', () => {
    elementRegistry.registerSemantic('light-3', 'furniture'); // storeType value is irrelevant to the check
    expect(isAlreadyAppliedCreate(busSerialized('lighting.create', { id: 'light-3' }))).toBe(true);
  });

  it('covers a dotted-bus wall.batch.create (per-entry ids in payload.walls[])', () => {
    elementRegistry.registerSemantic('w-1', 'wall');
    elementRegistry.registerSemantic('w-2', 'wall');
    expect(isAlreadyAppliedCreate(
      busSerialized('wall.batch.create', { walls: [{ id: 'w-1' }, { id: 'w-2' }] }),
    )).toBe(true);
  });

  it('does NOT treat non-minting *.createXxx verbs as element creates (wall.createOpening / plumbing.createFixture)', () => {
    elementRegistry.registerSemantic('wall-7', 'wall');
    // These end in "Opening"/"Fixture", not ".create" → must never be dedup-skipped here.
    expect(isAlreadyAppliedCreate(busSerialized('wall.createOpening', { id: 'wall-7' }))).toBe(false);
    expect(isAlreadyAppliedCreate(busSerialized('plumbing.createFixture', { id: 'wall-7' }))).toBe(false);
  });

  it('does NOT skip a bus create with no extractable ids (empty payload)', () => {
    expect(isAlreadyAppliedCreate(busSerialized('furniture.create', {}))).toBe(false);
  });
});

describe('RemoteCommandDispatcher.dispatch idempotency (§DUPLICATE-ROOMS-PERSIST)', () => {
  it('returns "skipped-duplicate" for an already-applied create and never reaches execute()', () => {
    elementRegistry.registerSemantic('room-7', 'room');
    let executed = 0;
    const fakeCm = { execute: () => { executed++; return { success: true }; } } as never;
    const dispatcher = new RemoteCommandDispatcher(fakeCm, { value: false });

    const outcome = dispatcher.dispatch(serialized('CREATE_ROOM', ['room-7']));
    expect(outcome).toBe('skipped-duplicate');
    expect(executed).toBe(0); // the duplicate room was never added a second time
  });

  it('replayCatchUp counts an already-applied create as skipped, not applied (no double-create, no throw)', () => {
    elementRegistry.registerSemantic('stair_1', 'stair');
    const fakeCm = { execute: () => ({ success: true }) } as never;
    const dispatcher = new RemoteCommandDispatcher(fakeCm, { value: false });

    // Catch-up re-sends a CREATE_STAIR that was already applied during hydration.
    const result = dispatcher.replayCatchUp([serialized('CREATE_STAIR', ['stair_1'])]);
    expect(result.applied).toBe(0);
    expect(result.skipped).toBe(1);
  });
});
