/**
 * §FIX-BOUNDING-WALLS-UNDETERMINED — THE DIFFERENTIATING TEST.
 *
 * This suite is the whole deliverable of layer (c). It exists to prove ONE
 * thing, in the only way it can be proven: that "this room bounds ZERO walls"
 * and "this room's bounding walls could NOT BE DETERMINED" now produce
 * DIFFERENT OBSERVABLE OUTCOMES at a real reader.
 *
 * Before the fix, `room.boundingWallIds ?? []` collapsed the two into one
 * value, and `resolveRoomFinishes` printed `'—'` for BOTH. C78 §1.4 forbids
 * inferring "unaffected" from missing data; C71 §4.4 says `[]` may only ever
 * mean *zero results*; C79 §5.2.0 names the reason for exactly this defect as
 * `RELATIONSHIP_NOT_RECORDED`.
 *
 * NEGATIVE CONTROL INCLUDED. A test that only asserts the undetermined arm
 * would still pass if the resolver started calling EVERY room undetermined —
 * which would be the same defect wearing the opposite sign. So the zero-walls
 * arm is asserted just as hard, and the two are compared to each other.
 *
 * @vitest-environment happy-dom
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  determineBoundingWalls,
  boundingWallIdsOrUnknown,
  isBoundingWallsUndetermined,
  boundingWallsUndeterminedLabel,
} from './boundingWallDetermination.js';
import { resolveRoomFinishes, FINISH_UNDETERMINED } from './RoomFinishResolver.js';

// ── The two rooms whose difference is the point ──────────────────────────────

/** A room that WAS examined and genuinely bounds zero walls. */
const ZERO_WALLS = { id: 'room-zero', levelId: 'L0', boundingWallIds: [] as string[] };

/** A room whose bounding-wall relationship was never recorded (C79 §7.1 —
 *  the writer's hardcoded `[]` / the field absent entirely). */
const UNDETERMINED = { id: 'room-unknown', levelId: 'L0' };

describe('determineBoundingWalls — the discriminator (C78 §1.4 · C71 §4.4)', () => {
  it('a PRESENT empty array is DETERMINED — zero walls is a real answer', () => {
    const d = determineBoundingWalls(ZERO_WALLS);
    expect(d.kind).toBe('determined');
    expect(d.kind === 'determined' && d.elements).toEqual([]);
    expect(isBoundingWallsUndetermined(d)).toBe(false);
  });

  it('an ABSENT field is UNDETERMINED with the C79 §5.2.0 reason', () => {
    const d = determineBoundingWalls(UNDETERMINED);
    expect(d.kind).toBe('undetermined');
    expect(d.kind === 'undetermined' && d.reason).toBe('RELATIONSHIP_NOT_RECORDED');
    expect(isBoundingWallsUndetermined(d)).toBe(true);
  });

  it('a POPULATED array is DETERMINED and carries the ids verbatim', () => {
    const d = determineBoundingWalls({ id: 'r', boundingWallIds: ['w1', 'w2'] });
    expect(d).toEqual({ kind: 'determined', elements: ['w1', 'w2'] });
  });

  it('a MISSING room record is UNDETERMINED, not zero walls', () => {
    for (const r of [null, undefined] as const) {
      const d = determineBoundingWalls(r);
      expect(d.kind).toBe('undetermined');
      expect(d.kind === 'undetermined' && d.reason).toBe('RELATIONSHIP_NOT_RECORDED');
    }
  });

  it('a NON-array value is UNDETERMINED — it is not an answer either', () => {
    for (const bad of [null, 'w1' as unknown, 0 as unknown, {} as unknown]) {
      const d = determineBoundingWalls({ id: 'r', boundingWallIds: bad as never });
      expect(d.kind).toBe('undetermined');
    }
  });

  it('THE POINT — the two cases are NOT the same value', () => {
    const zero = determineBoundingWalls(ZERO_WALLS);
    const unknown = determineBoundingWalls(UNDETERMINED);
    expect(zero).not.toEqual(unknown);
    expect(zero.kind).not.toBe(unknown.kind);
  });

  it('boundingWallIdsOrUnknown returns [] for zero walls and null for undetermined', () => {
    expect(boundingWallIdsOrUnknown(ZERO_WALLS)).toEqual([]);
    expect(boundingWallIdsOrUnknown(UNDETERMINED)).toBeNull();
    // The regression this guards: `?? []` on the helper's own result would
    // re-collapse the two. `[] ?? []` is `[]`; `null ?? []` is ALSO `[]`.
    expect(boundingWallIdsOrUnknown(UNDETERMINED) ?? []).toEqual(
      boundingWallIdsOrUnknown(ZERO_WALLS),
    );
  });

  it('the UI refusal label names the typed reason, not prose', () => {
    const d = determineBoundingWalls(UNDETERMINED);
    if (!isBoundingWallsUndetermined(d)) throw new Error('expected undetermined');
    expect(boundingWallsUndeterminedLabel(d)).toContain('RELATIONSHIP_NOT_RECORDED');
    expect(boundingWallsUndeterminedLabel(d)).toContain('cannot determine');
  });
});

// ── The anti-fork pin ────────────────────────────────────────────────────────
//
// The brief's hard constraint was "do NOT invent a rival vocabulary". This
// suite cannot import `@pryzm/command-bus` (not a declared dependency of this
// package, and adding one is a manifest change), so the guarantee is made by
// READING the contract's source text and asserting that the member this module
// produces is still a member of the closed union there. If someone renames or
// removes `RELATIONSHIP_NOT_RECORDED` in command-bus, this fails — which is
// the whole point: a silent fork becomes a red test.

describe('anti-fork — the reason is C78 §8.1\'s, not a rival vocabulary', () => {
  it('RELATIONSHIP_NOT_RECORDED is a member of the closed union in command-bus/consequence.ts', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const src = readFileSync(
      resolve(__dirname, '../../command-bus/src/consequence.ts'),
      'utf8',
    );
    // The union declaration itself, not a mention in prose.
    const union = /export type UndeterminedReason\s*=([\s\S]*?);/.exec(src);
    expect(union, 'UndeterminedReason union not found — command-bus moved').toBeTruthy();
    expect(union![1]).toContain("'RELATIONSHIP_NOT_RECORDED'");
    // C78 §8.1 declares it CLOSED at eleven members. A twelfth means the
    // contract changed and this module's assumptions need re-reading.
    const members = union![1]!.match(/'[A-Z_]+'/g) ?? [];
    expect(members).toHaveLength(11);
  });
});

// ── The reader-level proof: resolveRoomFinishes ──────────────────────────────

describe('resolveRoomFinishes — zero walls and undetermined are OBSERVABLY different', () => {
  const w = globalThis as unknown as Record<string, unknown>;
  const saved: Record<string, unknown> = {};
  const STORES = ['wallStore', 'floorStore', 'ceilingStore', 'slabStore', 'doorStore', 'windowStore'];

  beforeEach(() => {
    for (const k of STORES) saved[k] = w[k];
    // A wall that WOULD contribute a finish if it were ever reached, plus a
    // door and a window on it. If the resolver silently treated "undetermined"
    // as "zero walls", these would be invisible in BOTH cases — which is
    // exactly the bug. They are here so the DETERMINED-with-walls arm has
    // something real to find.
    w.wallStore = {
      getById: (id: string) =>
        id === 'w1' ? { id: 'w1', layers: [{ function: 'finish-interior', name: 'Plaster' }] } : undefined,
    };
    w.doorStore = { getAll: () => [{ id: 'd1', wallId: 'w1', finishMaterial: 'Oak' }] };
    w.windowStore = { getAll: () => [{ id: 'n1', wallId: 'w1', finishMaterial: 'Alu' }] };
    w.floorStore = { getAll: (): unknown[] => [] };
    w.ceilingStore = { getAll: (): unknown[] => [] };
    w.slabStore = { getAll: (): unknown[] => [] };
  });

  afterEach(() => {
    for (const k of STORES) w[k] = saved[k];
  });

  it('ZERO WALLS → "—" on walls/doors/windows, and reason null (a real answer)', () => {
    const r = resolveRoomFinishes(ZERO_WALLS);
    expect(r.walls).toBe('—');
    expect(r.doors).toBe('—');
    expect(r.windows).toBe('—');
    expect(r.boundingWallsUndeterminedReason).toBeNull();
  });

  it('UNDETERMINED → the refusal sentinel, and the typed C78 §8.1 reason', () => {
    const r = resolveRoomFinishes(UNDETERMINED);
    expect(r.walls).toBe(FINISH_UNDETERMINED);
    expect(r.doors).toBe(FINISH_UNDETERMINED);
    expect(r.windows).toBe(FINISH_UNDETERMINED);
    expect(r.boundingWallsUndeterminedReason).toBe('RELATIONSHIP_NOT_RECORDED');
  });

  it('THE WHOLE DELIVERABLE — the two rooms no longer produce the same output', () => {
    const zero = resolveRoomFinishes(ZERO_WALLS);
    const unknown = resolveRoomFinishes(UNDETERMINED);

    // Before the fix these three assertions ALL failed: both rooms returned
    // `{ floor:'—', walls:'—', ceiling:'—', doors:'—', windows:'—' }`.
    expect(zero.walls).not.toBe(unknown.walls);
    expect(zero.doors).not.toBe(unknown.doors);
    expect(zero.boundingWallsUndeterminedReason).not.toBe(unknown.boundingWallsUndeterminedReason);
  });

  it('NEGATIVE CONTROL — a room WITH bounding walls still resolves them (the fix did not just make everything undetermined)', () => {
    const r = resolveRoomFinishes({ id: 'room-real', levelId: 'L0', boundingWallIds: ['w1'] });
    expect(r.walls).toBe('Plaster');
    expect(r.doors).toBe('Oak');
    expect(r.windows).toBe('Alu');
    expect(r.boundingWallsUndeterminedReason).toBeNull();
  });

  it('NEGATIVE CONTROL — floor and ceiling are NOT poisoned by an undetermined wall relationship', () => {
    // They are resolved through the floor/ceiling/slab stores and `room.finishes`,
    // paths that never traverse `boundingWallIds`. Marking them undetermined
    // would be an OVERSTATEMENT — the mirror-image dishonesty.
    const r = resolveRoomFinishes({
      id: 'room-unknown-walls',
      levelId: 'L0',
      finishes: { floor: { materialName: 'Screed' }, ceiling: { materialName: 'Skim' } },
    });
    expect(r.floor).toBe('Screed');
    expect(r.ceiling).toBe('Skim');
    expect(r.walls).toBe(FINISH_UNDETERMINED);
  });

  it('an AUTHORED room wall finish survives an undetermined relationship (a direct read, not a traversal)', () => {
    const r = resolveRoomFinishes({
      id: 'room-authored',
      levelId: 'L0',
      finishes: { walls: { materialName: 'Paint RAL9010' } },
    });
    expect(r.walls).toBe('Paint RAL9010');
    // …but the doors/windows, which have NO such direct read, still refuse.
    expect(r.doors).toBe(FINISH_UNDETERMINED);
    expect(r.boundingWallsUndeterminedReason).toBe('RELATIONSHIP_NOT_RECORDED');
  });
});
