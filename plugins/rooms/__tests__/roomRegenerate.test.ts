// ─── room.regenerate — C80 GEN-GAP-1, the verb that refuses ──────────────────
//
// C80 §11's exit condition 1 is "one generation runs as a bus verb". This suite
// proves the verb EXISTS on the bus and that dispatching it produces the three
// properties C80 requires of a v1 that cannot regenerate safely:
//
//   1. A TYPED REFUSAL — not silence (C16 CA-18 shape (c)), not a throw
//      (C80 §10.f — `canExecute({valid:false})` becomes a thrown
//      CommandBusError that a `catch {}` swallows), and not a bare empty patch
//      pair (C16 CA-18 shape (b)).
//   2. BOTH NUMBERS and the PROTECTED SUBJECT (C80 §1.4 / §3.2).
//   3. ZERO STORE MUTATIONS (C80 §1.5).
//
// ⚠ WHAT THESE TESTS DO NOT CLAIM. They do not claim regeneration works — it
// does not, deliberately, and the refusal IS the behaviour under test. When
// C80 GEN-GAP-2 lands element-grain provenance and this verb starts returning
// a ConsequencePlan, these assertions MUST be rewritten in the same commit
// rather than deleted: a test asserting "it refuses" that is quietly removed
// would let the verb start regenerating with nothing watching.

import { describe, expect, it } from 'vitest';
import {
  CommandBus,
  PatchEmitter,
  UndoStack,
  attachStores,
} from '@pryzm/plugin-sdk';
import { RoomStore, type RoomsState } from '../src/store.js';
import {
  buildRoomHandlerSet,
  registerRoomHandlers,
  ROOM_HANDLER_TYPES,
} from '../src/handlers/index.js';
import { buildRegenerationRefusal } from '../src/handlers/RegenerateRooms.js';

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

describe('room.regenerate — generation as a bus verb (C80 GEN-GAP-1)', () => {
  it('is REGISTERED on the bus — the central place C80 §0.1(1) says does not exist', () => {
    const bus = new CommandBus({
      audit: { actorId: 'test', projectId: 'p1', clientId: 't1' },
      storesProvider: () => ({ room: {} }),
    });
    const types = registerRoomHandlers(bus);
    expect(types).toContain('room.regenerate');
    expect(ROOM_HANDLER_TYPES).toContain('room.regenerate');
    expect(bus.has('room.regenerate')).toBe(true);
  });

  it('dispatching it RETURNS a typed refusal — not silence, not a throw', async () => {
    const env = buildEnv();
    // If this threw, the assertion below would never run — which is the point:
    // C80 §10.f's defect is a refusal delivered as an exception, because an
    // exception is what an empty `catch {}` swallows without trace.
    const record = await env.bus.executeCommand('room.regenerate', {
      levelId: 'L1',
      roomIds: ['r-1', 'r-2', 'r-3'],
      generator: 'the house layout generator',
    });

    expect(record.refusal).toBeDefined();
    expect(record.refusal!.kind).toBe('refused');
    expect(record.refusal!.commandType).toBe('room.regenerate');
    env.detach();
  });

  it('the refusal uses the CLOSED C78 §8.1 union member RELATIONSHIP_NOT_RECORDED', async () => {
    const env = buildEnv();
    const record = await env.bus.executeCommand('room.regenerate', {
      levelId: 'L1',
      roomIds: ['r-1'],
    });
    // element→origin is a relationship the system HAS A CONCEPT OF (C75 owns
    // the vocabulary, C80 §2 the authority question over it) and that NO
    // PRODUCER WRITES. That is this member's definition verbatim.
    expect(record.refusal!.reason).toBe('RELATIONSHIP_NOT_RECORDED');
    env.detach();
  });

  it('carries BOTH NUMBERS (C80 §1.4) — the ask and the unaccounted-for', async () => {
    const env = buildEnv();
    const record = await env.bus.executeCommand('room.regenerate', {
      levelId: 'L1',
      roomIds: ['r-1', 'r-2', 'r-3'],
    });
    const r = record.refusal!;
    expect(r.asked).toBe(3);
    expect(r.unaccountedFor).toBe(3);
    // The sentence must carry them too — a number that only a consumer with
    // the typed object can see is not a refusal a user can read.
    expect(r.detail).toContain('3 room(s)');
    expect(r.detail).toContain('all 3');
    env.detach();
  });

  it('NAMES what it protects (C80 §3.2) — a refusal that cannot say is not actionable', async () => {
    const env = buildEnv();
    const record = await env.bus.executeCommand('room.regenerate', {
      levelId: 'L1',
      roomIds: ['r-1'],
    });
    const r = record.refusal!;
    expect(r.protects.length).toBeGreaterThan(0);
    // The named subject is the measured one: rooms a human DREW, identified
    // by the only element-grain provenance signal that exists at HEAD.
    expect(r.protects).toContain('manual-boundary');
    expect(r.protects).toContain('GEN-GAP-2');
    env.detach();
  });

  it('states the ASK and the BLOCKER, both (C80 §1.4 adapted)', async () => {
    const env = buildEnv();
    const record = await env.bus.executeCommand('room.regenerate', {
      levelId: 'L1',
      roomIds: ['r-1'],
    });
    const d = record.refusal!.detail;
    expect(d).toContain('THE ASK:');
    expect(d).toContain('THE BLOCKER:');
    // And it cites the MEASUREMENT rather than asserting a risk — the run that
    // destroyed a hand-drawn room, b0ca0c27 clause (b).
    expect(d).toContain('the authored room survived=false');
    env.detach();
  });

  it('performs ZERO store mutations (C80 §1.5)', async () => {
    const env = buildEnv();
    const before = JSON.stringify(Object.fromEntries(env.room.getState()));

    const record = await env.bus.executeCommand('room.regenerate', {
      levelId: 'L1',
      roomIds: ['r-1', 'r-2'],
    });

    // Three independent readings of the same fact, because one of them alone
    // could be satisfied by a handler that mutated and then reported nothing:
    //   (a) the patch pair is empty,
    expect(record.forward).toHaveLength(0);
    expect(record.inverse).toHaveLength(0);
    //   (b) the handler declares no store, and
    expect(record.affectedStores).toHaveLength(0);
    //   (c) the REAL store, read back independently, is byte-identical.
    expect(JSON.stringify(Object.fromEntries(env.room.getState()))).toBe(before);
    env.detach();
  });

  it('an ABSENT roomIds list yields `undefined`, never 0 (C80 §5.2 known-vs-unknown)', () => {
    // "the caller named no set" and "the caller named an empty set" are
    // different facts. Reporting both as 0 is the §CONTEXT-DATA-HONESTY defect
    // rebuilt inside a refusal.
    const absent = buildRegenerationRefusal({ levelId: 'L1' });
    expect(absent.asked).toBeUndefined();
    expect(absent.unaccountedFor).toBeUndefined();
    expect(absent.detail).toContain('an unenumerated set of rooms');

    const empty = buildRegenerationRefusal({ levelId: 'L1', roomIds: [] });
    expect(empty.asked).toBe(0);
    expect(empty.unaccountedFor).toBe(0);
  });

  it('canExecute still validates the PAYLOAD (C16 CA-3) — a bad levelId is a caller error', async () => {
    const env = buildEnv();
    // The capability decision is not taken in canExecute (it would throw), but
    // payload validation legitimately is: rejecting a malformed levelId is
    // correct, and it must not be confused with the capability refusal.
    await expect(
      env.bus.executeCommand('room.regenerate', { levelId: '' }),
    ).rejects.toThrow(/levelId must be a non-empty string/);
    env.detach();
  });
});
