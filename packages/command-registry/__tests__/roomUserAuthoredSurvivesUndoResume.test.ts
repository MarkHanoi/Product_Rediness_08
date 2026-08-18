// @vitest-environment happy-dom
//
// EI-7e (C84 §9, NOT-MEASURED register) — do user-authored room `name` /
// `number` / `finish` survive `RoomTopologyObserver.resume()`'s post-undo
// recompute?
//
// WHY THIS SHAPE. The question is only answerable at the layer that DECIDES,
// and that layer is a chain, not a pure function:
//
//   performUndoRedo._withPausedObservers  (performUndoRedo.ts:461-474)
//     -> topology.pause()                 (RoomTopologyObserver.ts:492)
//     -> the undo body mutates walls, which emits `bim-wall-mutation-committed`
//        INTO the paused window -> queued in `_suppressedCommitLevels`
//                                         (RoomTopologyObserver.ts:417-422)
//     -> finally: topology.resume()       (RoomTopologyObserver.ts:513)
//     -> resume() DISCHARGES the queue: `_executeRedetect(levelId)`, synchronous
//                                         (RoomTopologyObserver.ts:534)
//     -> `new ReDetectRoomsCommand(...)` -> commandManager.execute
//                                         (RoomTopologyObserver.ts:823-828)
//     -> ReDetectRoomsCommand.execute     (ReDetectRoomsCommand.ts:86-92)
//          detected    = engine.detectRoomsForLevel(...)              <- geometry only
//          merged      = engine.mergeWithExisting(detected, existing) <- re-attaches semantics
//          withNumbers = assignUniqueRoomNumbers(merged, levelPrefix) <- THE DECIDER
//          roomStore.update(room.id, room)
//
// So this test drives the REAL observer, the REAL DOM commit event, the REAL
// `resume()`, the REAL `ReDetectRoomsCommand`, the REAL `RoomDetectionEngine`
// and the REAL `RoomStore`. Nothing about the answer is read off a pure
// function's return value; every assertion is a read-back from the store the
// user's Property Inspector renders from.
//
// THE AUTHORING PATH IS REAL TOO. `RoomPropertySection.ts:113` dispatches
// `room.setName` and `:139` dispatches `room.setNumber` with `inp.value.trim()`
// -- an arbitrary string, placeholder 'e.g. 101'. `SetRoomNumber.ts:90`
// forwards it verbatim into `new RenameRoomCommand(roomId, { roomNumber })`.
// `RoomTypes.ts:286` documents the field as "Alphanumeric room number
// (e.g. '101', 'G.04')". So '101' is not an exotic value -- it is the
// placeholder the UI itself shows the user.
//
// ASSERTION DISCIPLINE. Every negative assertion below is paired with a
// POSITIVE one on the SAME expression, so a mis-spelled field cannot make an
// arm pass vacuously.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  RoomDetectionEngine,
  RoomStore,
  RoomTopologyObserver,
  type RoomFinishes,
} from '@pryzm/room-topology';
import type { WallData } from '@pryzm/geometry-wall';
import { ReDetectRoomsCommand } from '../src/rooms/ReDetectRoomsCommand';
import { RenameRoomCommand } from '../src/rooms/RenameRoomCommand';
import { UpdateRoomFinishesCommand } from '../src/rooms/UpdateRoomFinishesCommand';
import type { CommandContext } from '../src/types';

const LEVEL = 'L0';

// -- The user's authored values ----------------------------------------------
// Deliberately the shapes the UI itself invites: the Number field's own
// placeholder is 'e.g. 101', and RoomTypes documents 'G.04' as valid.
const USER_NAME = 'Master Bedroom';
const USER_NUMBER = '101';
const USER_FINISHES: RoomFinishes = {
  floor: { materialName: 'Oak Parquet', materialColor: '#C8A165' },
  walls: { materialName: 'Plaster White', materialColor: '#F2F2F0' },
  ceiling: { materialName: 'Gypsum', materialColor: '#FFFFFF' },
};

const GENERATED_NUMBER = /^\d{2}-\d{3}$/;

function wall(id: string, s: [number, number], e: [number, number]): WallData {
  return {
    id,
    type: 'wall',
    baseLine: [{ x: s[0], y: 0, z: s[1] }, { x: e[0], y: 0, z: e[1] }],
    height: 2.7,
    thickness: 0.2,
    baseOffset: 0,
    levelId: LEVEL,
    childrenIds: [],
    openings: [],
    metadata: { createdAt: 0, modifiedAt: 0, createdBy: 'test', version: 1 },
  } as unknown as WallData;
}

/** One 8 m x 6 m rectangular room. */
function rectWalls(): WallData[] {
  return [
    wall('w-south', [0, 0], [8, 0]),
    wall('w-east', [8, 0], [8, 6]),
    wall('w-north', [8, 6], [0, 6]),
    wall('w-west', [0, 6], [0, 0]),
  ];
}

function makeWallStore(walls: WallData[]) {
  const byId = new Map(walls.map(w => [w.id, w]));
  return {
    getByLevel: (levelId: string) => (levelId === LEVEL ? walls : []),
    getById: (id: string) => byId.get(id),
    getAll: () => walls,
    subscribe: () => () => {},
  };
}

const bimManager = {
  getLevelById: (id: string) => (id === LEVEL ? { id, elevation: 0, height: 2.7 } : undefined),
  getLevels: () => [{ id: LEVEL, elevation: 0, height: 2.7 }],
  registerElement: () => {},
  unregisterElement: () => {},
};

/**
 * The full live harness: real RoomStore, real engine, real observer wired via
 * `attach()` so the genuine `bim-wall-mutation-committed` DOM path is live, and
 * a commandManager that executes the REAL command objects against a real ctx.
 */
function makeHarness() {
  const walls = rectWalls();
  const wallStore = makeWallStore(walls);
  const roomStore = new RoomStore(null, bimManager as never);
  const engine = new RoomDetectionEngine(wallStore as never);

  const ctx = {
    stores: { roomStore, wallStore },
    bimManager,
  } as unknown as CommandContext;

  const executed: string[] = [];
  const commandManager = {
    execute: (cmd: { type: string; execute: (c: CommandContext) => unknown }) => {
      executed.push(String(cmd.type));
      return cmd.execute(ctx);
    },
  };

  const observer = new RoomTopologyObserver(
    wallStore as never, roomStore as never, commandManager as never, engine as never, bimManager as never,
  );
  observer.attach();

  // Seed the level exactly as a first detection would: run the real command
  // once, so the stored room is a genuine engine product, not a hand-built literal.
  const seed = new ReDetectRoomsCommand(LEVEL, 0, 2.7);
  const seedResult = seed.execute(ctx);

  return { walls, wallStore, roomStore, engine, ctx, observer, commandManager, executed, seedResult };
}

/** The undo gesture, verbatim in shape from performUndoRedo._withPausedObservers. */
function undoWithPausedObservers(observer: RoomTopologyObserver, body: () => void): void {
  observer.pause();
  try {
    body();
  } finally {
    observer.resume();
  }
}

/** What the undo body does to walls: emit the commit event the real wall path emits. */
function emitWallMutationCommitted(levelId: string): void {
  window.dispatchEvent(new CustomEvent('bim-wall-mutation-committed', { detail: { levelId } }));
}

describe('EI-7e - user-authored room semantics across RoomTopologyObserver.resume()', () => {
  let h: ReturnType<typeof makeHarness>;
  let roomId: string;

  beforeEach(() => {
    h = makeHarness();
    const seeded = h.roomStore.getByLevel(LEVEL);
    expect(seeded.length, 'fixture must seed exactly one room').toBe(1);
    roomId = seeded[0]!.id;

    // The user authors name + number + finishes through the SAME commands the
    // Property Inspector's `room.setName` / `room.setNumber` handlers dispatch.
    const rename = new RenameRoomCommand(roomId, { name: USER_NAME, roomNumber: USER_NUMBER });
    expect(rename.canExecute(h.ctx).ok).toBe(true);
    expect(rename.execute(h.ctx).success).toBe(true);

    const finish = new UpdateRoomFinishesCommand(roomId, USER_FINISHES);
    expect(finish.execute(h.ctx).success).toBe(true);

    // CONTROL - the authoring itself landed. Without this the survival
    // assertions below could pass on a room that never held the values.
    const authored = h.roomStore.getById(roomId)!;
    expect(authored.name).toBe(USER_NAME);
    expect(authored.roomNumber).toBe(USER_NUMBER);
    expect(authored.finishes?.floor?.materialName).toBe('Oak Parquet');
  });

  afterEach(() => { h.observer.dispose?.(); });

  it('CONTROL - the paused window really queues the commit, and resume() really discharges it', () => {
    // Negative arm and positive arm on the SAME expression: the suppressed-level
    // count. If the queue were not exercised, the survival tests below would be
    // asserting over a recompute that never ran.
    expect(h.observer.suppressedCommitLevelCount).toBe(0);   // positive: starts empty

    h.observer.pause();
    emitWallMutationCommitted(LEVEL);
    expect(h.observer.suppressedCommitLevelCount).toBe(1);   // the commit WAS queued
    expect(h.observer.suppressedCommitLevelCount).not.toBe(0);

    const before = h.executed.length;
    h.observer.resume();
    expect(h.observer.suppressedCommitLevelCount).toBe(0);   // discharged
    // The discharge really executed a ReDetectRoomsCommand - same expression,
    // both arms.
    expect(h.executed.length).toBeGreaterThan(before);
    expect(h.executed).toContain('REDETECT_ROOMS');
  });

  it('the room SURVIVES the recompute as the same record (identity control)', () => {
    undoWithPausedObservers(h.observer, () => emitWallMutationCommitted(LEVEL));

    const after = h.roomStore.getByLevel(LEVEL);
    expect(after.length).toBe(1);
    // Positive + negative on the SAME expression.
    expect(after[0]!.id).toBe(roomId);
    expect(after[0]!.id).not.toBe('');
  });

  it('user-authored NAME survives resume()', () => {
    undoWithPausedObservers(h.observer, () => emitWallMutationCommitted(LEVEL));

    const after = h.roomStore.getById(roomId)!;
    expect(after, 'the room must still exist to have a name at all').toBeDefined();
    expect(after.name).toBe(USER_NAME);                       // positive
    expect(after.name).not.toBe(`Room ${after.roomNumber}`);  // negative, same expression
  });

  it('user-authored NUMBER survives resume()', () => {
    undoWithPausedObservers(h.observer, () => emitWallMutationCommitted(LEVEL));

    const after = h.roomStore.getById(roomId)!;
    expect(after, 'the room must still exist to have a number at all').toBeDefined();
    expect(after.roomNumber).toBe(USER_NUMBER);               // positive
    expect(after.roomNumber).not.toMatch(GENERATED_NUMBER);   // negative, same expression
  });

  it('user-authored FINISHES survive resume()', () => {
    undoWithPausedObservers(h.observer, () => emitWallMutationCommitted(LEVEL));

    const after = h.roomStore.getById(roomId)!;
    expect(after.finishes, 'finishes object must survive at all').toBeDefined();
    expect(after.finishes!.floor?.materialName).toBe('Oak Parquet');   // positive
    expect(after.finishes!.floor?.materialName).not.toBeUndefined();   // negative, same expression
    expect(after.finishes!.walls?.materialName).toBe('Plaster White');
    expect(after.finishes!.ceiling?.materialName).toBe('Gypsum');
  });

  it('an ALPHANUMERIC number - the "G.04" form RoomTypes.ts:286 documents as valid - survives resume()', () => {
    // The generated form is NN-NNN. A user number that is not merely "different
    // digits" but a different SHAPE is the sharpest case: nothing about it can
    // be mistaken for a detection-assigned number.
    const alnum = 'G.04';
    expect(new RenameRoomCommand(roomId, { roomNumber: alnum }).execute(h.ctx).success).toBe(true);
    expect(h.roomStore.getById(roomId)!.roomNumber).toBe(alnum);   // authoring control

    undoWithPausedObservers(h.observer, () => emitWallMutationCommitted(LEVEL));

    const after = h.roomStore.getById(roomId)!;
    expect(after.roomNumber).toBe(alnum);                     // positive
    expect(after.roomNumber).not.toMatch(GENERATED_NUMBER);   // negative, same expression
  });

  it('a room with NO number still gets a generated one (the anti-over-fix control)', () => {
    // The fix must not turn `assignUniqueRoomNumbers` into a no-op: a room with
    // an EMPTY number must still be numbered, or every new room ships
    // unnumbered. Positive + negative on the same expression.
    expect(new RenameRoomCommand(roomId, { roomNumber: '' }).execute(h.ctx).success).toBe(true);
    expect(h.roomStore.getById(roomId)!.roomNumber).toBe('');   // control: really cleared

    undoWithPausedObservers(h.observer, () => emitWallMutationCommitted(LEVEL));

    const after = h.roomStore.getById(roomId)!;
    expect(after.roomNumber).toMatch(GENERATED_NUMBER);   // positive: numbered
    expect(after.roomNumber).not.toBe('');                // negative, same expression
  });

  it('numbers stay unique across the level (uniqueness control)', () => {
    // Guards the fix against the obvious wrong shape - "just keep whatever the
    // user typed" - colliding with a generated number.
    expect(new RenameRoomCommand(roomId, { roomNumber: '00-001' }).execute(h.ctx).success).toBe(true);

    undoWithPausedObservers(h.observer, () => emitWallMutationCommitted(LEVEL));

    const all = h.roomStore.getByLevel(LEVEL);
    const numbers = all.map(r => r.roomNumber);
    expect(numbers.length).toBeGreaterThan(0);            // not vacuous on an empty set
    expect(new Set(numbers).size).toBe(numbers.length);   // all distinct
  });
});
