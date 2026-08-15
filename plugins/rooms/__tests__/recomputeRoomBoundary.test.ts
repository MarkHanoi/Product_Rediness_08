// PR-11 — the DIFFERENTIATING suite for `room.recomputeBoundary`.
//
// ═══════════════════════════════════════════════════════════════════════════════
// WHAT MAKES THIS TEST DIFFERENT FROM THE ONE IT REPLACES
// ═══════════════════════════════════════════════════════════════════════════════
// The suite this supersedes (`handlers.test.ts` §FIX-ROOM-SIBLING-HANDLERS-STORE)
// asserted, in full:
//
//     await expect(bus.executeCommand('room.recomputeBoundary', {...}))
//       .resolves.toBeDefined();
//     expect(env.room.size()).toBe(0);
//
// **Every one of those assertions passes against a handler that does nothing.**
// That is the PR-11 defect expressed as a test: it pinned the no-op in place and
// reported it as coverage.
//
// This suite is built so that:
//   • it FAILS against a no-op (`{forward: [], inverse: []}` for every input) —
//     because a no-op cannot produce four DISTINCT outcomes for four distinct
//     situations; and
//   • it FAILS DIFFERENTLY against a wrong impact — a handler that answers with
//     the wrong C78 member, or that reports a moved boundary as unchanged, trips
//     a different assertion with a different message than the no-op does.
//
// `describe('the suite differentiates')` at the bottom PROVES both claims by
// running the SAME classifier over a deliberate no-op and a deliberate
// wrong-impact stand-in and asserting the classifications collide / mismatch.
// A test that passes against a no-op has proved nothing, so this one is
// self-verifying about that exact property.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CommandBus, type HandlerResult } from '@pryzm/plugin-sdk';
import { buildRoomHandlerSet } from '../src/handlers/index.js';
import { RecomputeRoomBoundaryHandler } from '../src/handlers/RecomputeRoomBoundary.js';
import {
  determineRoomBoundaryRecompute,
  type RoomBoundaryUndeterminedReason,
} from '../src/boundaryRecomputeDetermination.js';

// ─── Fixtures ────────────────────────────────────────────────────────────────

/** A 2 m × 2 m sketched room: area 4 m², perimeter 8 m, no bounding walls.
 *  `analyseRoom` computes these PURELY from `boundary` in 'sketched' mode, so
 *  the determined arms below run the REAL geometry rather than a stub. */
function sketchedSquare(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'room_sq',
    levelId: 'L0',
    boundaryMode: 'sketched',
    seedPoint: null,
    boundary: [
      { x: 0, y: 0, z: 0 },
      { x: 2, y: 0, z: 0 },
      { x: 2, y: 0, z: 2 },
      { x: 0, y: 0, z: 2 },
    ],
    // The STORED analytic. Matching the recomputed value ⇒ DETERMINED-unaffected.
    area: 4,
    perimeter: 8,
    boundingWallIds: [],
    ...overrides,
  };
}

const storeOf = (items: readonly unknown[]): { getAll: () => readonly unknown[] } => ({
  getAll: () => items,
});

type Globals = { roomStore?: unknown; wallStore?: unknown };
const g = globalThis as unknown as Globals;

function busWith(handlers = buildRoomHandlerSet()): CommandBus {
  const bus = new CommandBus({
    audit: { actorId: 'test', projectId: 'p1', clientId: 't1' },
    storesProvider: () => ({}),
  });
  for (const h of handlers) bus.register(h);
  return bus;
}

// ─── The classifier — ONE function both the real handler and the stand-ins are
//     judged by, so "differentiates" is a property of the assertions, not of
//     how carefully each test was hand-written. ────────────────────────────────

type Outcome =
  | { label: 'determined-unaffected' }
  | { label: 'determined-affected'; detail: string }
  | { label: 'undetermined'; reason: string };

function classify(result: HandlerResult): Outcome {
  const refusal = result.refusal;
  if (refusal === undefined) {
    // A bare empty pair is legal for EXACTLY ONE meaning (C71 §4.4).
    expect(result.forward).toEqual([]);
    expect(result.inverse).toEqual([]);
    return { label: 'determined-unaffected' };
  }
  // The withheld-write arm is the only refusal that reports a REAL delta.
  if (refusal.reason === 'RELATIONSHIP_NOT_RECORDED' && /WAS recomputed and it MOVED/.test(refusal.detail)) {
    return { label: 'determined-affected', detail: refusal.detail };
  }
  return { label: 'undetermined', reason: refusal.reason };
}

async function run(bus: CommandBus, roomId: string): Promise<Outcome> {
  const record = await bus.executeCommand('room.recomputeBoundary', { roomId });
  return classify(record as unknown as HandlerResult);
}

// ─── 1 · The pure determination — every arm is a DISTINCT value ───────────────

describe('determineRoomBoundaryRecompute — the four cases the no-op collapsed', () => {
  const base = { roomId: 'room_sq', walls: [] as readonly never[] };

  it('UNREADABLE room store ⇒ RELATIONSHIP_NOT_READABLE, not "no such room"', () => {
    const out = determineRoomBoundaryRecompute({ ...base, rooms: undefined } as never);
    expect(out.forward.kind).toBe('undetermined');
    expect(out.forward).toMatchObject({ reason: 'RELATIONSHIP_NOT_READABLE' });
    // The INVERSE arm is determined independently and must agree, not default to
    // a confident empty set.
    expect(out.inverse).toMatchObject({ kind: 'undetermined', reason: 'RELATIONSHIP_NOT_READABLE' });
    expect(out.changed).toBe(false);
  });

  it('UNREADABLE wall store ⇒ RELATIONSHIP_NOT_READABLE (a boundary is traced FROM walls)', () => {
    const out = determineRoomBoundaryRecompute({
      roomId: 'room_sq',
      rooms: [sketchedSquare()],
      walls: undefined,
    } as never);
    expect(out.forward).toMatchObject({ kind: 'undetermined', reason: 'RELATIONSHIP_NOT_READABLE' });
  });

  it('READABLE store that does not hold the id ⇒ INVALID_REQUEST, NOT unreadable', () => {
    const out = determineRoomBoundaryRecompute({ ...base, rooms: [] } as never);
    expect(out.forward).toMatchObject({ kind: 'undetermined', reason: 'INVALID_REQUEST' });
    // ⭐ THE DISTINCTION THE OLD HANDLER COULD NOT MAKE: an empty-but-READ store
    // and an UNREADABLE store are different answers.
    const unreadable = determineRoomBoundaryRecompute({ ...base, rooms: undefined } as never);
    expect((out.forward as { reason: string }).reason).not.toBe(
      (unreadable.forward as { reason: string }).reason,
    );
  });

  it('wallBound room with no seedPoint ⇒ RELATIONSHIP_NOT_RECORDED, not a geometry failure', () => {
    const out = determineRoomBoundaryRecompute({
      ...base,
      rooms: [sketchedSquare({ boundaryMode: 'wallBound', seedPoint: null })],
    } as never);
    expect(out.forward).toMatchObject({ kind: 'undetermined', reason: 'RELATIONSHIP_NOT_RECORDED' });
  });

  it('analyse that cannot close a ring ⇒ GEOMETRY_UNPREDICTABLE, and the cached analytic is LEFT INTACT', () => {
    const out = determineRoomBoundaryRecompute({
      ...base,
      rooms: [sketchedSquare()],
      analyse: () => undefined,
    } as never);
    expect(out.forward).toMatchObject({ kind: 'undetermined', reason: 'GEOMETRY_UNPREDICTABLE' });
    // NOT zeroed — an undetermined boundary must not be reported as area 0.
    expect(out.after).toBeUndefined();
  });

  it('analyse that THROWS ⇒ GEOMETRY_UNPREDICTABLE, never an exception out of the module', () => {
    const out = determineRoomBoundaryRecompute({
      ...base,
      rooms: [sketchedSquare()],
      analyse: () => {
        throw new Error('open loop');
      },
    } as never);
    expect(out.forward).toMatchObject({ kind: 'undetermined', reason: 'GEOMETRY_UNPREDICTABLE' });
  });

  it('DETERMINED-unaffected: the recompute RAN and nothing moved ⇒ determined with []', () => {
    const out = determineRoomBoundaryRecompute({ ...base, rooms: [sketchedSquare()] } as never);
    expect(out.forward).toEqual({ kind: 'determined', elements: [] });
    expect(out.changed).toBe(false);
    // Real geometry ran: 2×2 square.
    expect(out.after?.area).toBeCloseTo(4, 6);
    expect(out.after?.perimeter).toBeCloseTo(8, 6);
  });

  it('DETERMINED-affected: a stale cached area ⇒ determined with [roomId] and the real delta', () => {
    const out = determineRoomBoundaryRecompute({
      ...base,
      rooms: [sketchedSquare({ area: 0, perimeter: 0 })],
    } as never);
    expect(out.forward).toEqual({ kind: 'determined', elements: ['room_sq'] });
    expect(out.changed).toBe(true);
    expect(out.before?.area).toBe(0);
    expect(out.after?.area).toBeCloseTo(4, 6);
  });

  it('⭐ the empty DETERMINED set and the undetermined arms are DIFFERENT VALUES', () => {
    const unaffected = determineRoomBoundaryRecompute({ ...base, rooms: [sketchedSquare()] } as never);
    const unreadable = determineRoomBoundaryRecompute({ ...base, rooms: undefined } as never);
    // Both "have no elements" — and that is precisely why the old `[]` was a lie.
    expect(unaffected.forward.kind).toBe('determined');
    expect(unreadable.forward.kind).toBe('undetermined');
    expect(unaffected.forward).not.toEqual(unreadable.forward);
  });
});

// ─── 2 · The handler over a REAL bus — four situations, four distinct outcomes ─

describe('room.recomputeBoundary handler — distinct outcomes over a real bus', () => {
  let bus: CommandBus;

  beforeEach(() => {
    bus = busWith();
  });
  afterEach(() => {
    delete g.roomStore;
    delete g.wallStore;
  });

  it('no room store ⇒ typed refusal RELATIONSHIP_NOT_READABLE (never a silent success)', async () => {
    delete g.roomStore;
    g.wallStore = storeOf([]);
    expect(await run(bus, 'room_sq')).toEqual({
      label: 'undetermined',
      reason: 'RELATIONSHIP_NOT_READABLE',
    });
  });

  it('a room store that THROWS ⇒ RELATIONSHIP_NOT_READABLE, not "no rooms"', async () => {
    g.roomStore = {
      getAll: () => {
        throw new Error('store exploded');
      },
    };
    g.wallStore = storeOf([]);
    expect(await run(bus, 'room_sq')).toEqual({
      label: 'undetermined',
      reason: 'RELATIONSHIP_NOT_READABLE',
    });
  });

  it('readable stores that do not hold the id ⇒ INVALID_REQUEST', async () => {
    g.roomStore = storeOf([]);
    g.wallStore = storeOf([]);
    expect(await run(bus, 'room_missing')).toEqual({
      label: 'undetermined',
      reason: 'INVALID_REQUEST',
    });
  });

  it('an up-to-date boundary ⇒ DETERMINED-unaffected (the one legal bare empty pair)', async () => {
    g.roomStore = storeOf([sketchedSquare()]);
    g.wallStore = storeOf([]);
    expect(await run(bus, 'room_sq')).toEqual({ label: 'determined-unaffected' });
  });

  it('a stale boundary ⇒ DETERMINED-affected, refusing the write WITH BOTH NUMBERS', async () => {
    g.roomStore = storeOf([sketchedSquare({ area: 0, perimeter: 0 })]);
    g.wallStore = storeOf([]);
    const outcome = await run(bus, 'room_sq');
    expect(outcome.label).toBe('determined-affected');
    // C80 §1.4 — the refusal carries the REAL measured numbers, not prose.
    const detail = (outcome as { detail: string }).detail;
    expect(detail).toMatch(/area 0\.000 m² → 4\.000 m²/);
    expect(detail).toMatch(/perimeter 0\.000 m → 8\.000 m/);
  });

  it('⭐ the five situations produce FIVE DISTINCT outcomes (a no-op produces one)', async () => {
    const labels: string[] = [];

    delete g.roomStore;
    g.wallStore = storeOf([]);
    labels.push(JSON.stringify(await run(bus, 'room_sq')));

    g.roomStore = storeOf([]);
    labels.push(JSON.stringify(await run(bus, 'room_missing')));

    g.roomStore = storeOf([sketchedSquare({ boundaryMode: 'wallBound', seedPoint: null })]);
    labels.push(JSON.stringify(await run(bus, 'room_sq')));

    g.roomStore = storeOf([sketchedSquare()]);
    labels.push(JSON.stringify(await run(bus, 'room_sq')));

    g.roomStore = storeOf([sketchedSquare({ area: 0, perimeter: 0 })]);
    labels.push(JSON.stringify(await run(bus, 'room_sq')));

    expect(new Set(labels).size).toBe(5);
  });

  it('still rejects an empty roomId payload (CA-3 payload validation survives)', async () => {
    g.roomStore = storeOf([]);
    g.wallStore = storeOf([]);
    await expect(bus.executeCommand('room.recomputeBoundary', { roomId: '' })).rejects.toThrow();
  });
});

// ─── 3 · PROOF that this suite differentiates ────────────────────────────────
//
// The two stand-ins below are the failure modes the brief names. They are run
// through the SAME `classify` + the SAME distinctness assertion the real handler
// faces, and each is shown to fail — and to fail for a DIFFERENT reason.

describe('the suite differentiates (self-verification)', () => {
  afterEach(() => {
    delete g.roomStore;
    delete g.wallStore;
  });

  /** The handler as it was before PR-11: an empty pair for every input. */
  class NoOpHandler {
    readonly type = 'room.recomputeBoundary';
    readonly affectedStores = [] as const;
    canExecute(): { valid: true } {
      return { valid: true };
    }
    execute(): HandlerResult {
      return { forward: [], inverse: [] };
    }
  }

  /** A handler that ANSWERS, but with the wrong C78 member: it reports an
   *  unreadable store as "the id is not a room". */
  class WrongImpactHandler extends RecomputeRoomBoundaryHandler {
    override execute(): HandlerResult {
      return {
        forward: [],
        inverse: [],
        refusal: {
          kind: 'refused',
          commandType: 'room.recomputeBoundary',
          reason: 'INVALID_REQUEST',
          asked: 1,
          unaccountedFor: 1,
          protects: 'nothing in particular',
          detail: 'the id is not a room',
        },
      };
    }
  }

  const scenarios = async (bus: CommandBus): Promise<string[]> => {
    const labels: string[] = [];
    delete g.roomStore;
    g.wallStore = storeOf([]);
    labels.push(JSON.stringify(await run(bus, 'room_sq')));
    g.roomStore = storeOf([]);
    labels.push(JSON.stringify(await run(bus, 'room_missing')));
    g.roomStore = storeOf([sketchedSquare()]);
    labels.push(JSON.stringify(await run(bus, 'room_sq')));
    g.roomStore = storeOf([sketchedSquare({ area: 0, perimeter: 0 })]);
    labels.push(JSON.stringify(await run(bus, 'room_sq')));
    return labels;
  };

  it('a NO-OP collapses all four situations into ONE outcome ⇒ the suite fails', async () => {
    const bus = busWith([new NoOpHandler() as never]);
    const labels = await scenarios(bus);
    // The no-op's signature: every situation looks like "determined-unaffected".
    expect(new Set(labels).size).toBe(1);
    expect(JSON.parse(labels[0]!)).toEqual({ label: 'determined-unaffected' });
    // ⇒ the distinctness assertion the real handler passes (size === 4) FAILS here.
    expect(new Set(labels).size).not.toBe(4);
  });

  it('a WRONG IMPACT fails DIFFERENTLY — it is distinguishable from the no-op AND wrong', async () => {
    const bus = busWith([new WrongImpactHandler() as never]);
    const labels = await scenarios(bus);
    const parsed = labels.map((l) => JSON.parse(l) as Outcome);

    // It is NOT the no-op failure: it answers with a refusal, never the bare pair.
    expect(parsed.every((o) => o.label === 'undetermined')).toBe(true);
    expect(parsed.some((o) => o.label === 'determined-unaffected')).toBe(false);

    // And it is WRONG: the unreadable-store situation is answered INVALID_REQUEST
    // when the correct member is RELATIONSHIP_NOT_READABLE.
    expect((parsed[0] as { reason: string }).reason).toBe('INVALID_REQUEST');
    const correct = busWith();
    delete g.roomStore;
    g.wallStore = storeOf([]);
    expect(await run(correct, 'room_sq')).toEqual({
      label: 'undetermined',
      reason: 'RELATIONSHIP_NOT_READABLE',
    });

    // Both stand-ins fail, and the two failures are not the same failure.
    expect(new Set(labels).size).not.toBe(4);
  });
});

// ─── 4 · The C78 §8.1 union is PINNED against its authority ──────────────────
//
// The reasons above are restated structurally in
// `boundaryRecomputeDetermination.ts` (the `roomStoreDetermination` precedent:
// `@pryzm/plugin-sdk` re-exports `UndeterminedReason` but not
// `ImpactDetermination`, and widening the L5 facade is a cross-lane edit). This
// pins the literals so a drift in the closed union fails a test rather than
// forking in silence.

describe('C78 §8.1 members used here exist in the closed union', () => {
  it('every reason this module can produce is a real UndeterminedReason member', async () => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const { dirname, resolve } = await import('node:path');
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(
      resolve(here, '../../../packages/command-bus/src/consequence.ts'),
      'utf8',
    );
    const produced: RoomBoundaryUndeterminedReason[] = [
      'INVALID_REQUEST',
      'RELATIONSHIP_NOT_READABLE',
      'RELATIONSHIP_NOT_RECORDED',
      'GEOMETRY_UNPREDICTABLE',
    ];
    for (const member of produced) {
      expect(src).toContain(`| '${member}'`);
    }
  });
});
