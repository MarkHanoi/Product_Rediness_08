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
