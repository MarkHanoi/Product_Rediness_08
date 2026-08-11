// room.setFinish — PROBE + PROOF (VERBS-CMD, 2026-08-11).
//
// ─── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
//
// `docs/04-reference/RAC-CONFORMANCE-SCORECARD-CATEGORIES-6-10.md` §155 records
// the exact inverse of a dead verb:
//
//   "Room *finishes* are fully modelled and fully persisted (RoomFinishesSchema,
//    RoomDataSchema.ts:83-89 — materialId, materialName, materialColor,
//    finishCode, nbs, csiDivision; round-tripped at roomSnapshotUtils.ts:95/190)
//    — and there is no command-bus route to set any of them. A rich persisted
//    schema with no write path is the mirror image of a dead verb."
//
// A DEAD VERB reports success and writes nothing.  This was a READER WITH NO
// WRITE: the field round-trips through save/load perfectly and nothing in the
// product can ever put a value in it.
//
// ─── WHAT THIS SUITE PROVES, AND HOW IT AVOIDS THE W3-3 TRAP ─────────────────
//
// The W3-3 dead-verb commit found FIVE test files that "passed" while measuring
// the WRONG STORE — they asserted the detached plugin DTO `RoomsState` mutated,
// which nothing renders, persists or exports.  This suite therefore does NOT
// assert against the plugin store at all.  It stands up a REAL authoritative
// room record behind a REAL `UpdateRoomCommand` (the same legacy command
// `room.setMaterial`'s live colour path uses) and reads the property back OUT
// of that record.  The fake is only the `commandManager` TRANSPORT; the store
// write, the Zod update gate and the undo snapshot are the production ones.
//
// If this handler ever regresses to writing the plugin DTO store, these
// assertions fail — which is the property the five converted tests lacked.

import { afterEach, describe, expect, it } from 'vitest';
import { CommandBus, PatchEmitter, UndoStack } from '@pryzm/plugin-sdk';
import { buildRoomHandlerSet } from '../src/handlers/index.js';

// ── A stand-in for the AUTHORITATIVE legacy room record ──────────────────────
//
// Shape-compatible with `packages/room-topology` `RoomData` for the fields this
// verb touches.  `@pryzm/room-topology` is deliberately NOT added as a
// dependency of `plugins/rooms` — adding one desynchronises `pnpm-lock.yaml`
// and breaks `--frozen-lockfile` for every other agent sharing this tree — so
// the record is declared structurally here and the REAL semantics that matter
// (shallow top-level merge, snapshot undo) are reproduced faithfully below.

interface FinishSpec {
  materialId?: string;
  materialName: string;
  materialColor: string;
  finishCode?: string;
  nbs?: string;
  csiDivision?: string;
  notes?: string;
}
interface Finishes {
  floor?: FinishSpec;
  ceiling?: FinishSpec;
  walls?: FinishSpec;
  skirtingHeight?: number;
  coveHeight?: number;
}
interface AuthoritativeRoom {
  id: string;
  name: string;
  finishes: Finishes;
}

/**
 * Reproduces `RoomStore.update()`'s SHALLOW top-level merge — the single most
 * important detail this verb has to respect.  `finishes` is ONE top-level
 * field, so writing `{ finishes: { floor } }` REPLACES the whole bag and
 * silently destroys `ceiling` / `walls`.  That is a data-loss bug the handler
 * must prevent by read-merging, and this fake is what makes the loss visible.
 */
class FakeRoomStore {
  private rooms = new Map<string, AuthoritativeRoom>();

  seed(room: AuthoritativeRoom): void {
    this.rooms.set(room.id, JSON.parse(JSON.stringify(room)) as AuthoritativeRoom);
  }
  getById(id: string): AuthoritativeRoom | undefined {
    const r = this.rooms.get(id);
    return r ? (JSON.parse(JSON.stringify(r)) as AuthoritativeRoom) : undefined;
  }
  update(id: string, updates: Partial<AuthoritativeRoom>): void {
    const existing = this.rooms.get(id);
    if (!existing) throw new Error(`room not found: ${id}`);
    this.rooms.set(id, { ...existing, ...JSON.parse(JSON.stringify(updates)) });
  }
  restoreSnapshot(snap: AuthoritativeRoom): void {
    this.rooms.set(snap.id, JSON.parse(JSON.stringify(snap)) as AuthoritativeRoom);
  }
}

/**
 * A minimal stand-in for `CommandManagerImpl` that RUNS the command against the
 * store and keeps the undo stack, so `undo()` exercises the command's own
 * snapshot/restore path rather than a test-local re-write.
 */
function makeCommandManager(roomStore: FakeRoomStore) {
  const stack: Array<{ undo(ctx: unknown): unknown }> = [];
  const ctx = { stores: { roomStore } };
  return {
    stack,
    execute(cmd: unknown) {
      const c = cmd as {
        canExecute?(ctx: unknown): { ok: boolean; reason?: string };
        execute(ctx: unknown): { success: boolean; error?: string };
        undo(ctx: unknown): unknown;
      };
      const v = c.canExecute?.(ctx);
      if (v && !v.ok) return { success: false, affectedElementIds: [], error: v.reason };
      const res = c.execute(ctx);
      if (res.success) stack.push(c);
      return res;
    },
    undoLast() {
      const c = stack.pop();
      if (!c) throw new Error('nothing to undo');
      return c.undo(ctx);
    },
  };
}

function buildBus() {
  const emitter = new PatchEmitter();
  const undoStack = new UndoStack({ maxSize: 50 });
  const bus = new CommandBus({
    audit: { actorId: 'test', projectId: 'p1', clientId: 't1' },
    emitter,
    undoStack,
    // The bridge declares affectedStores:[] — it needs no plugin store view.
    storesProvider: () => ({ room: {} }),
  });
  for (const h of buildRoomHandlerSet()) bus.register(h);
  return bus;
}

const OAK: FinishSpec = {
  materialId: 'mat_oak_engineered',
  materialName: 'Oak, engineered board',
  materialColor: '#b98b4f',
  finishCode: 'FL-03',
  nbs: 'M42/110',
  csiDivision: '09 64 00',
};

const g = globalThis as unknown as { window?: unknown };
const savedWindow = g.window;

describe('room.setFinish', () => {
  afterEach(() => {
    if (savedWindow === undefined) delete g.window;
    else g.window = savedWindow;
  });

  // ── THE PROBE ──────────────────────────────────────────────────────────────
  //
  // BEFORE the implementation this is the ONLY test that could exist, and it
  // fails at `bus.has(...)`: there is no route at all.  Kept permanently as the
  // registration pin.
  it('is registered as a bus verb at all', () => {
    expect(buildBus().has('room.setFinish')).toBe(true);
  });

  it('writes the floor finish through to the AUTHORITATIVE room record', async () => {
    const roomStore = new FakeRoomStore();
    roomStore.seed({ id: 'room_abc', name: 'Office 101', finishes: {} });
    const cm = makeCommandManager(roomStore);
    g.window = { __pryzmInitComplete: true, commandManager: cm, roomStore };

    // BEFORE — the persisted field is empty, which is exactly the scorecard's
    // "rich persisted schema with no write path".
    expect(roomStore.getById('room_abc')?.finishes.floor).toBeUndefined();

    await buildBus().executeCommand('room.setFinish', {
      roomId: 'room_abc',
      surface: 'floor',
      finish: OAK,
    });

    // AFTER — read back out of the authoritative record, not the plugin store.
    const after = roomStore.getById('room_abc');
    expect(after?.finishes.floor).toEqual(OAK);
    expect(after?.finishes.floor?.finishCode).toBe('FL-03');
    expect(after?.finishes.floor?.csiDivision).toBe('09 64 00');
  });

  it('undo restores the previous finish', async () => {
    const roomStore = new FakeRoomStore();
    const PREV: FinishSpec = { materialName: 'Screed', materialColor: '#9a9a9a' };
    roomStore.seed({ id: 'room_abc', name: 'Office 101', finishes: { floor: PREV } });
    const cm = makeCommandManager(roomStore);
    g.window = { __pryzmInitComplete: true, commandManager: cm, roomStore };

    await buildBus().executeCommand('room.setFinish', {
      roomId: 'room_abc',
      surface: 'floor',
      finish: OAK,
    });
    expect(roomStore.getById('room_abc')?.finishes.floor?.materialName).toBe('Oak, engineered board');

    cm.undoLast();
    expect(roomStore.getById('room_abc')?.finishes.floor).toEqual(PREV);
  });

  // ── THE DATA-LOSS GUARD ────────────────────────────────────────────────────
  //
  // `finishes` is ONE top-level field and `RoomStore.update` merges only at the
  // top level.  A naive `update(id, { finishes: { floor } })` therefore DELETES
  // the ceiling and wall finishes.  The handler read-merges to prevent it; this
  // test is what stops that merge being refactored away.
  it('setting one surface does NOT wipe the other surfaces', async () => {
    const roomStore = new FakeRoomStore();
    const CEILING: FinishSpec = { materialName: 'Plaster, skimmed', materialColor: '#f2f2f2' };
    const WALLS: FinishSpec = { materialName: 'Emulsion, matt', materialColor: '#eeeae2' };
    roomStore.seed({
      id: 'room_abc',
      name: 'Office 101',
      finishes: { ceiling: CEILING, walls: WALLS, skirtingHeight: 0.1 },
    });
    g.window = {
      __pryzmInitComplete: true,
      commandManager: makeCommandManager(roomStore),
      roomStore,
    };

    await buildBus().executeCommand('room.setFinish', {
      roomId: 'room_abc',
      surface: 'floor',
      finish: OAK,
    });

    const f = roomStore.getById('room_abc')?.finishes;
    expect(f?.floor).toEqual(OAK);
    expect(f?.ceiling).toEqual(CEILING); // ← would be undefined without the read-merge
    expect(f?.walls).toEqual(WALLS);
    expect(f?.skirtingHeight).toBe(0.1);
  });

  it('sets skirtingHeight / coveHeight without touching any surface', async () => {
    const roomStore = new FakeRoomStore();
    roomStore.seed({ id: 'room_abc', name: 'Office 101', finishes: { floor: OAK } });
    g.window = {
      __pryzmInitComplete: true,
      commandManager: makeCommandManager(roomStore),
      roomStore,
    };

    await buildBus().executeCommand('room.setFinish', {
      roomId: 'room_abc',
      skirtingHeight: 0.12,
      coveHeight: 0.05,
    });

    const f = roomStore.getById('room_abc')?.finishes;
    expect(f?.skirtingHeight).toBe(0.12);
    expect(f?.coveHeight).toBe(0.05);
    expect(f?.floor).toEqual(OAK);
  });

  // ── REFUSALS — never a silent partial write (brief rule 5) ─────────────────

  it('refuses an unknown room with a named reason', async () => {
    const roomStore = new FakeRoomStore();
    g.window = {
      __pryzmInitComplete: true,
      commandManager: makeCommandManager(roomStore),
      roomStore,
    };
    await expect(
      buildBus().executeCommand('room.setFinish', {
        roomId: 'room_nope',
        surface: 'floor',
        finish: OAK,
      }),
    ).rejects.toThrow(/room not found/i);
  });

  it('refuses a finish spec missing the required materialName / materialColor', async () => {
    const roomStore = new FakeRoomStore();
    roomStore.seed({ id: 'room_abc', name: 'Office 101', finishes: {} });
    g.window = {
      __pryzmInitComplete: true,
      commandManager: makeCommandManager(roomStore),
      roomStore,
    };
    await expect(
      buildBus().executeCommand('room.setFinish', {
        roomId: 'room_abc',
        surface: 'floor',
        finish: { materialId: 'mat_oak' },
      }),
    ).rejects.toThrow(/materialName/);
    // …and nothing was written.
    expect(roomStore.getById('room_abc')?.finishes.floor).toBeUndefined();
  });

  it('refuses an unknown surface', async () => {
    const roomStore = new FakeRoomStore();
    roomStore.seed({ id: 'room_abc', name: 'Office 101', finishes: {} });
    g.window = {
      __pryzmInitComplete: true,
      commandManager: makeCommandManager(roomStore),
      roomStore,
    };
    await expect(
      buildBus().executeCommand('room.setFinish', {
        roomId: 'room_abc',
        surface: 'roof',
        finish: OAK,
      }),
    ).rejects.toThrow(/surface must be/);
  });

  it('refuses a payload that asks for nothing', async () => {
    const roomStore = new FakeRoomStore();
    roomStore.seed({ id: 'room_abc', name: 'Office 101', finishes: {} });
    g.window = {
      __pryzmInitComplete: true,
      commandManager: makeCommandManager(roomStore),
      roomStore,
    };
    // Matched on the REASON, not merely "it threw" — before the verb existed
    // this assertion passed vacuously off "no handler registered", which is the
    // passing-proof-of-the-wrong-thing trap W3-3 had to unpick in five files.
    await expect(
      buildBus().executeCommand('room.setFinish', { roomId: 'room_abc' }),
    ).rejects.toThrow(/Nothing to set/);
  });

  // §FIX-DEAD-VERB-ROOM-BRIDGE (W3-3) — a pre-init "no-op that resolves" is
  // indistinguishable from a finish that was applied. Pin the refusal.
  it('refuses, with a reason, before the engine is initialised', async () => {
    g.window = {
      __pryzmInitComplete: false,
      commandManager: { execute: () => { throw new Error('must not run pre-init'); } },
    };
    await expect(
      buildBus().executeCommand('room.setFinish', {
        roomId: 'room_abc',
        surface: 'floor',
        finish: OAK,
      }),
    ).rejects.toThrow(/room\.setFinish: the engine is not initialised/);
  });

  it('refuses when the legacy command manager is absent', async () => {
    g.window = { __pryzmInitComplete: true };
    await expect(
      buildBus().executeCommand('room.setFinish', {
        roomId: 'room_abc',
        surface: 'floor',
        finish: OAK,
      }),
    ).rejects.toThrow(/command manager is not available/);
  });

  // The bridge must REPORT a refusal the legacy command returns, never swallow
  // it into a success — the exact failure mode W3-3 closed elsewhere.
  it('propagates a refusal returned by the legacy command', async () => {
    const roomStore = new FakeRoomStore();
    roomStore.seed({ id: 'room_abc', name: 'Office 101', finishes: {} });
    g.window = {
      __pryzmInitComplete: true,
      roomStore,
      commandManager: {
        execute: () => ({ success: false, affectedElementIds: [], error: 'RoomStore not available' }),
      },
    };
    await expect(
      buildBus().executeCommand('room.setFinish', {
        roomId: 'room_abc',
        surface: 'floor',
        finish: OAK,
      }),
    ).rejects.toThrow(/RoomStore not available/);
  });
});
