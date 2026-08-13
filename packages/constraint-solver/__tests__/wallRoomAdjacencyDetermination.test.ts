/**
 * @vitest-environment happy-dom
 *
 * @file packages/constraint-solver/__tests__/wallRoomAdjacencyDetermination.test.ts
 *
 * **The differentiating test for C78 U-INV-4 in `@pryzm/constraint-solver`.**
 * `ConstraintEngine.ts` calls `window.addEventListener` at module scope, so
 * importing the engine requires a DOM; the package default stays `node`.
 *
 * ─── WHAT THIS FILE PROVES ──────────────────────────────────────────────────
 * Before this change, four tier-1 compliance rules made the wall→room hop as
 * `roomStore.getRoomsAdjacentToWall?.(wallId) ?? []`. Two DIFFERENT facts —
 * "this wall bounds zero rooms" and "this store does not implement wall→room
 * adjacency" — arrived at the rule as the same `[]`, and the rules assert on
 * the ABSENCE of a room from a positive membership set. So a store missing one
 * method emitted, against a perfectly valid model:
 *
 *   · ROOM_NEEDS_DOOR       severity 'error', "no door found on any bounding
 *                           wall", citing Part B fire egress — for EVERY room;
 *   · HABITABLE_NEEDS_WINDOW severity 'error', "habitable room has no window";
 *   · ACCESSIBLE_ROUTE      "widest door is 0mm", citing BS 8300 — a NUMBER
 *                           nobody measured, printed as a measurement.
 *
 * That is the `FacadeOrientationService` shape (C79 §5.2.0): **an absence
 * becoming a positive, regulation-citing claim.**
 *
 * The centre of this file is the pair of cases in
 * `describe('THE DIFFERENTIATOR')`: a genuinely door-less room and an
 * undetermined store now produce DIFFERENT observable engine output. Before the
 * fix, both produced the identical `severity: 'error'` finding.
 *
 * ─── THE NEGATIVE CONTROL (C70 §5.6, and the task's explicit demand) ────────
 * A fix that called EVERY case undetermined would be the same defect with the
 * opposite sign — it would silence every real violation. `describe('NEGATIVE
 * CONTROL')` therefore pins the other direction: over a store that DOES
 * implement the method, every rule still fires exactly as before, at its
 * declared severity, with its real numbers. Refusal is reserved for actual
 * refusal.
 *
 * ─── SUBSTITUTION DECLARED (C74 §3.5) ───────────────────────────────────────
 * The stores are fixtures — plain objects exposing the methods the rules call.
 * That is the rule's INPUT, not the rule: every assertion calls the REAL
 * `constraintEngine.validateAll(ctx)`, and no `ValidationResult` is hand-built.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { constraintEngine, type ValidationResult } from '../src/ConstraintEngine.js';
import {
  AdjacencyPass,
  determineRoomsAdjacentToWall,
} from '../src/wallRoomAdjacencyDetermination.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, '../../..');

// ── Fixtures ────────────────────────────────────────────────────────────────

interface RoomFixture {
  id: string;
  name?: string;
  occupancyType: string;
  levelId: string;
  computed?: { area?: number; boundingBox?: Record<string, number> };
}

function emptyContext(): Record<string, unknown> {
  return {
    roomStore: null, doorStore: null, windowStore: null,
    wallStore: null, stairStore: null, bimManager: null,
  };
}

/** A room store that DOES record wall→room adjacency. */
function readableRoomStore(rooms: RoomFixture[], adjacency: Record<string, string[]> = {}) {
  return {
    getAll: () => rooms,
    getRoomsAdjacentToWall: (wallId: string) =>
      (adjacency[wallId] ?? []).map((id) => rooms.find((r) => r.id === id)).filter(Boolean),
  };
}

/**
 * A room store that does NOT implement the hop — the ARM B case, and the exact
 * runtime shape the `?.` was written to absorb. It is otherwise a perfectly
 * good store: `getAll` works, the rooms are real.
 */
function unreadableRoomStore(rooms: RoomFixture[]) {
  return { getAll: () => rooms };
}

const bedroom: RoomFixture = {
  id: 'room-bed', name: 'Bedroom 1', occupancyType: 'bedroom',
  levelId: 'L0', computed: { area: 12 },
};

const doorStore = (doors: Array<{ id: string; wallId?: string; width?: number }>) => ({
  getAll: () => doors,
});
const windowStore = (wins: Array<{ id: string; wallId?: string }>) => ({ getAll: () => wins });

function findingsFor(ruleId: string, ctx: Record<string, unknown>): ValidationResult[] {
  return constraintEngine.validateAll(ctx).filter((r) => r.ruleId === ruleId);
}

// ═════════════════════════════════════════════════════════════════════════════
// THE DIFFERENTIATOR — the two cases must produce DIFFERENT observable output
// ═════════════════════════════════════════════════════════════════════════════

describe('THE DIFFERENTIATOR — genuinely-zero vs could-not-determine', () => {
  it('ROOM_NEEDS_DOOR: a genuinely door-less room still ERRORS, citing Part B', () => {
    const ctx = {
      ...emptyContext(),
      // The store CAN answer. Wall w1 bounds the bedroom; there are no doors.
      roomStore: readableRoomStore([bedroom], { w1: ['room-bed'] }),
      doorStore: doorStore([]),
    };
    const found = findingsFor('ROOM_NEEDS_DOOR', ctx);

    expect(found).toHaveLength(1);
    expect(found[0]!.severity).toBe('error');
    expect(found[0]!.elementId).toBe('room-bed');
    expect(found[0]!.message).toContain('no door found on any bounding wall');
    // A DETERMINED verdict names the room, not the project.
    expect(found[0]!.elementType).toBe('room');
  });

  it('ROOM_NEEDS_DOOR: an UNREADABLE adjacency REFUSES — and does not accuse the room', () => {
    const ctx = {
      ...emptyContext(),
      roomStore: unreadableRoomStore([bedroom]),
      // A real door exists on a real wall — the model is VALID. Only the hop is gone.
      doorStore: doorStore([{ id: 'door-1', wallId: 'w1', width: 0.9 }]),
    };
    const found = findingsFor('ROOM_NEEDS_DOOR', ctx);

    expect(found).toHaveLength(1);
    // ── THE OBSERVABLE DIFFERENCE ──────────────────────────────────────────
    expect(found[0]!.severity).toBe('info');           // was 'error'
    expect(found[0]!.elementId).toBe('');              // was 'room-bed'
    expect(found[0]!.elementType).toBe('project');     // was 'room'
    expect(found[0]!.message).toContain('could not be determined');
    expect(found[0]!.message).toContain('RELATIONSHIP_NOT_RECORDED');
    // The accusation is GONE. This is the whole point.
    expect(found[0]!.message).not.toContain('no door found');
  });

  it('the two cases are not merely different — they differ in SEVERITY and SUBJECT', () => {
    const determined = findingsFor('ROOM_NEEDS_DOOR', {
      ...emptyContext(),
      roomStore: readableRoomStore([bedroom], { w1: ['room-bed'] }),
      doorStore: doorStore([]),
    })[0]!;
    const undetermined = findingsFor('ROOM_NEEDS_DOOR', {
      ...emptyContext(),
      roomStore: unreadableRoomStore([bedroom]),
      doorStore: doorStore([{ id: 'door-1', wallId: 'w1', width: 0.9 }]),
    })[0]!;

    expect(determined.severity).not.toBe(undetermined.severity);
    expect(determined.elementId).not.toBe(undetermined.elementId);
    expect(determined.message).not.toBe(undetermined.message);
  });

  it('HABITABLE_NEEDS_WINDOW: window-less room ERRORS; unreadable adjacency REFUSES', () => {
    const genuinelyNone = findingsFor('HABITABLE_NEEDS_WINDOW', {
      ...emptyContext(),
      roomStore: readableRoomStore([bedroom], { w1: ['room-bed'] }),
      windowStore: windowStore([]),
    });
    expect(genuinelyNone).toHaveLength(1);
    expect(genuinelyNone[0]!.severity).toBe('error');
    expect(genuinelyNone[0]!.message).toContain('habitable room has no window');

    const cannotTell = findingsFor('HABITABLE_NEEDS_WINDOW', {
      ...emptyContext(),
      roomStore: unreadableRoomStore([bedroom]),
      windowStore: windowStore([{ id: 'win-1', wallId: 'w1' }]),
    });
    expect(cannotTell).toHaveLength(1);
    expect(cannotTell[0]!.severity).toBe('info');
    expect(cannotTell[0]!.message).toContain('could not be determined');
    expect(cannotTell[0]!.message).not.toContain('has no window');
  });

  it('ACCESSIBLE_ROUTE: no longer prints "widest door is 0mm" for a door it never read', () => {
    const wc: RoomFixture = {
      id: 'room-wc', name: 'WC', occupancyType: 'accessible-wc',
      levelId: 'L0', computed: { area: 4 },
    };

    // DETERMINED: the hop works, the only door is genuinely 700mm — a real
    // measurement, and a real violation.
    const measured = findingsFor('ACCESSIBLE_ROUTE', {
      ...emptyContext(),
      roomStore: readableRoomStore([wc], { w1: ['room-wc'] }),
      doorStore: doorStore([{ id: 'door-1', wallId: 'w1', width: 0.7 }]),
    });
    expect(measured).toHaveLength(1);
    expect(measured[0]!.severity).toBe('warning');
    expect(measured[0]!.message).toContain('700mm');

    // UNDETERMINED: a 1000mm door EXISTS and is compliant, but the hop is gone.
    // The old code reported "widest door is 0mm".
    const unread = findingsFor('ACCESSIBLE_ROUTE', {
      ...emptyContext(),
      roomStore: unreadableRoomStore([wc]),
      doorStore: doorStore([{ id: 'door-1', wallId: 'w1', width: 1.0 }]),
    });
    expect(unread).toHaveLength(1);
    expect(unread[0]!.severity).toBe('info');
    // THE REGRESSION THIS PINS: a fabricated measurement.
    expect(unread[0]!.message).not.toContain('0mm');
    expect(unread[0]!.message).toContain('could not be determined');
  });

  it('DOOR_WIDTH_vs_CIRCULATION: the benign arm still reports its incompleteness', () => {
    const found = findingsFor('DOOR_WIDTH_vs_CIRCULATION', {
      ...emptyContext(),
      roomStore: unreadableRoomStore([bedroom]),
      doorStore: doorStore([{ id: 'door-1', wallId: 'w1', width: 1.2 }]),
    });
    // This rule never accused anyone from absence — it merely SKIPPED. The
    // skip is now visible rather than silent.
    expect(found).toHaveLength(1);
    expect(found[0]!.severity).toBe('info');
    expect(found[0]!.message).toContain('could not be determined');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// NEGATIVE CONTROL — refusing EVERYWHERE is the same defect, opposite sign
// ═════════════════════════════════════════════════════════════════════════════

describe('NEGATIVE CONTROL — a readable store never refuses', () => {
  const compliantCtx = () => ({
    ...emptyContext(),
    roomStore: readableRoomStore([bedroom], { w1: ['room-bed'] }),
    doorStore: doorStore([{ id: 'door-1', wallId: 'w1', width: 0.95 }]),
    windowStore: windowStore([{ id: 'win-1', wallId: 'w1' }]),
  });

  it('a fully compliant model produces NO finding from any of the four rules', () => {
    const all = constraintEngine.validateAll(compliantCtx());
    for (const ruleId of [
      'ROOM_NEEDS_DOOR', 'HABITABLE_NEEDS_WINDOW',
      'ACCESSIBLE_ROUTE', 'DOOR_WIDTH_vs_CIRCULATION',
    ]) {
      expect(all.filter((r) => r.ruleId === ruleId), `${ruleId} must stay silent`).toHaveLength(0);
    }
  });

  it('NO refusal finding is emitted anywhere when the store CAN answer', () => {
    const all = constraintEngine.validateAll(compliantCtx());
    expect(all.filter((r) => r.message.includes('RELATIONSHIP_NOT_RECORDED'))).toHaveLength(0);
  });

  it('a REAL violation still fires at full strength beside a readable store', () => {
    const found = findingsFor('ROOM_NEEDS_DOOR', {
      ...emptyContext(),
      roomStore: readableRoomStore([bedroom], { w1: ['room-bed'] }),
      doorStore: doorStore([]),
    });
    expect(found).toHaveLength(1);
    expect(found[0]!.severity).toBe('error');
  });

  it('an EMPTY but READABLE adjacency is determined, not undetermined', () => {
    // Wall w9 bounds nothing. That is a real answer.
    const d = determineRoomsAdjacentToWall(readableRoomStore([bedroom], {}), 'w9');
    expect(d.kind).toBe('determined');
    if (d.kind === 'determined') expect(d.elements).toEqual([]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// The discriminator itself
// ═════════════════════════════════════════════════════════════════════════════

describe('determineRoomsAdjacentToWall', () => {
  it('a present method returning rooms is DETERMINED', () => {
    const d = determineRoomsAdjacentToWall(
      readableRoomStore([bedroom], { w1: ['room-bed'] }), 'w1',
    );
    expect(d.kind).toBe('determined');
    if (d.kind === 'determined') expect(d.elements).toHaveLength(1);
  });

  it('an ABSENT method is UNDETERMINED + RELATIONSHIP_NOT_RECORDED', () => {
    const d = determineRoomsAdjacentToWall(unreadableRoomStore([bedroom]), 'w1');
    expect(d.kind).toBe('undetermined');
    if (d.kind === 'undetermined') {
      expect(d.reason).toBe('RELATIONSHIP_NOT_RECORDED');
      expect(d.scope).toContain('w1');
    }
  });

  it('a THROWING method is UNDETERMINED, never empty', () => {
    const d = determineRoomsAdjacentToWall(
      { getRoomsAdjacentToWall: () => { throw new Error('index cold'); } }, 'w1',
    );
    expect(d.kind).toBe('undetermined');
    if (d.kind === 'undetermined') expect(d.detail).toContain('index cold');
  });

  it('a null store is UNDETERMINED, never empty', () => {
    expect(determineRoomsAdjacentToWall(null, 'w1').kind).toBe('undetermined');
  });

  it('a non-array return is UNDETERMINED', () => {
    const d = determineRoomsAdjacentToWall(
      { getRoomsAdjacentToWall: () => undefined }, 'w1',
    );
    expect(d.kind).toBe('undetermined');
  });

  it('is TOTAL — never throws, whatever it is handed', () => {
    expect(() => determineRoomsAdjacentToWall(undefined, '')).not.toThrow();
    expect(() => determineRoomsAdjacentToWall({} as never, 'w')).not.toThrow();
  });
});

describe('AdjacencyPass', () => {
  it('stays complete across a readable pass', () => {
    const pass = new AdjacencyPass();
    const store = readableRoomStore([bedroom], { w1: ['room-bed'] });
    pass.read(store, 'w1');
    pass.read(store, 'w2'); // genuinely empty — still determined
    expect(pass.incomplete).toBe(false);
  });

  it('ONE undetermined wall makes the whole pass incomplete', () => {
    const pass = new AdjacencyPass();
    pass.read(readableRoomStore([bedroom], { w1: ['room-bed'] }), 'w1');
    pass.read(unreadableRoomStore([bedroom]), 'w2');
    expect(pass.incomplete).toBe(true);
    expect(pass.refusal('scope').reason).toBe('RELATIONSHIP_NOT_RECORDED');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// UNION PIN — no rival vocabulary may be minted (C78 §8.1, closed at eleven)
// ═════════════════════════════════════════════════════════════════════════════

describe('the reason is command-bus vocabulary, not a fork', () => {
  it("'RELATIONSHIP_NOT_RECORDED' is a literal member of command-bus's closed union", () => {
    const src = readFileSync(
      resolve(REPO, 'packages/command-bus/src/consequence.ts'), 'utf8',
    );
    const union = src.slice(
      src.indexOf('export type UndeterminedReason'),
      src.indexOf(';', src.indexOf('export type UndeterminedReason')),
    );
    expect(union).toContain("'RELATIONSHIP_NOT_RECORDED'");
  });

  it('that union is still closed at ELEVEN members — a fork fails here', () => {
    const src = readFileSync(
      resolve(REPO, 'packages/command-bus/src/consequence.ts'), 'utf8',
    );
    const start = src.indexOf('export type UndeterminedReason');
    const union = src.slice(start, src.indexOf(';', start));
    expect(union.match(/\|\s*'[A-Z_]+'/g)).toHaveLength(11);
  });
});
