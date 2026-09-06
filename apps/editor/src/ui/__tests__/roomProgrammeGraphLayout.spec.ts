/**
 * §ROOM-PROGRAMME — THE INVERSION: the graph is the INPUT to the layout.
 *
 * Subjects:  apps/editor/src/ui/room-programme/roomProgrammeModel.ts
 *            apps/editor/src/ui/room-programme/programmeToEnvelopes.ts
 *            apps/editor/src/ui/room-programme/roomEnvelopePlan.ts
 * Strategy:  STR-RESIDENTIAL-DESIGN-ORCHESTRATOR §9 · §10 · §25.5
 *            (*"the graph should drive the initial layout generation"*)
 * Contracts: C114 §12 (room ⊂ level) · C83 §1.2 (a refusal carries BOTH numbers)
 *
 * ⭐ THE ARM THAT MATTERS IS `PLUGGING A RELATIONSHIP CHANGES THE GEOMETRY`. Everything
 * else here could pass while the graph was decorative. The repo's own history is the
 * reason it is written as a DIFFERENCE between two solves rather than as a property of
 * one: `livingGraphDataHonesty` and the §25.5 finding both describe surfaces that
 * DISPLAY a graph nothing reads.
 */

import { describe, it, expect } from 'vitest';
import type { EnvelopePoint } from '@pryzm/geometry-space-envelope';
import {
  EMPTY_ROOM_PROGRAMME,
  defaultResidentialProgramme,
  linkKey,
  reduceRoomProgramme,
  toProgrammeRoomSpecs,
  type RoomProgramme,
} from '../room-programme/roomProgrammeModel';
import {
  DOOR_CLEAR_WIDTH_M,
  seriateByGraph,
  solveProgrammeLayout,
  type ProgrammeLayout,
} from '../room-programme/programmeToEnvelopes';
import {
  buildRoomEnvelopePlan,
  describeReplacement,
  pickHostLevelEnvelope,
  roomEnvelopesWithin,
  type SpaceEnvelopeRecordLike,
} from '../room-programme/roomEnvelopePlan';

// ── fixtures ────────────────────────────────────────────────────────────────

/** A 24 × 10 m rectangular plate = 240 m². Axis-aligned, CCW in {x, z}. */
const PLATE: readonly EnvelopePoint[] = [
  { x: 0, y: 0, z: 0 },
  { x: 24, y: 0, z: 0 },
  { x: 24, y: 0, z: 10 },
  { x: 0, y: 0, z: 10 },
];

let seq = 0;
const mint = (): string => `r${(seq += 1)}`;

function programmeOf(
  rooms: ReadonlyArray<readonly [string, string, number]>,
  links: ReadonlyArray<readonly [string, string]> = [],
): RoomProgramme {
  let s: RoomProgramme = EMPTY_ROOM_PROGRAMME;
  for (const [id, kind, area] of rooms) {
    s = reduceRoomProgramme(s, {
      type: 'programme.add-room', id, kind: kind as never, name: id,
    });
    s = reduceRoomProgramme(s, { type: 'programme.set-area', id, targetAreaM2: area });
  }
  for (const [a, b] of links) s = reduceRoomProgramme(s, { type: 'programme.link', aId: a, bId: b });
  return s;
}

const ok = (r: ReturnType<typeof solveProgrammeLayout>): ProgrammeLayout => {
  if (!r.ok) throw new Error(`expected a layout, got refusal ${r.code}: ${r.statement}`);
  return r;
};

const ringKey = (l: ProgrammeLayout): string =>
  l.cells
    .map((c) => `${c.roomId}:${c.ring.map((p) => `${p.x.toFixed(3)},${p.z.toFixed(3)}`).join('|')}`)
    .sort()
    .join(' ');

// ── the reducer ─────────────────────────────────────────────────────────────

describe('§ROOM-PROGRAMME — the reducer', () => {
  it('adds, removes, and drops the removed room\'s relationships with it', () => {
    const p = programmeOf([['a', 'living', 20], ['b', 'kitchen', 12]], [['a', 'b']]);
    expect(p.links).toHaveLength(1);
    const q = reduceRoomProgramme(p, { type: 'programme.remove-room', id: 'b' });
    expect(q.entries.map((e) => e.id)).toEqual(['a']);
    expect(q.links).toHaveLength(0);
  });

  it('is keyed by ID, so a RENAME does not break a relationship', () => {
    // ⭐ This is the §ROOM-ADJACENCY-NAME-MISS defect designed out. The shipped
    // name-keyed stash loses the edge here; this one must not.
    const p = programmeOf([['a', 'bedroom', 12], ['b', 'ensuite', 4]], [['a', 'b']]);
    const q = reduceRoomProgramme(p, { type: 'programme.rename-room', id: 'a', name: 'Master' });
    expect(q.entries.find((e) => e.id === 'a')!.name).toBe('Master');
    expect(q.links).toHaveLength(1);
    expect(linkKey(q.links[0]!.aId, q.links[0]!.bId)).toBe(linkKey('a', 'b'));
  });

  it('links are order-independent and never duplicated', () => {
    let p = programmeOf([['a', 'living', 20], ['b', 'kitchen', 12]], [['a', 'b']]);
    p = reduceRoomProgramme(p, { type: 'programme.link', aId: 'b', bId: 'a' });
    expect(p.links).toHaveLength(1);
  });

  it('unlink removes it, and both orders address the same link', () => {
    let p = programmeOf([['a', 'living', 20], ['b', 'kitchen', 12]], [['a', 'b']]);
    p = reduceRoomProgramme(p, { type: 'programme.unlink', aId: 'b', bId: 'a' });
    expect(p.links).toHaveLength(0);
  });

  it('returns the state IDENTICALLY when an intent cannot be honoured', () => {
    const p = programmeOf([['a', 'living', 20]]);
    expect(reduceRoomProgramme(p, { type: 'programme.link', aId: 'a', bId: 'ghost' })).toBe(p);
    expect(reduceRoomProgramme(p, { type: 'programme.set-area', id: 'a', targetAreaM2: -3 })).toBe(p);
    expect(reduceRoomProgramme(p, { type: 'programme.remove-room', id: 'ghost' })).toBe(p);
  });

  it('projects to ProgrammeRoomSpec[] with adjacencies by display NAME', () => {
    const p = programmeOf([['a', 'bedroom', 12], ['b', 'ensuite', 4]], [['a', 'b']]);
    const specs = toProgrammeRoomSpecs(p);
    expect(specs.map((s) => s.occupancyType)).toEqual(['bedroom', 'bathroom']);
    expect(specs[0]!.adjacencies).toEqual(['b']);
    expect(specs[1]!.adjacencies).toEqual(['a']);
  });

  it('the default brief carries STR §9\'s relationships', () => {
    const p = defaultResidentialProgramme(mint);
    expect(p.entries).toHaveLength(7);
    expect(p.links.length).toBeGreaterThanOrEqual(6);
  });
});

// ── seriation ───────────────────────────────────────────────────────────────

describe('§ROOM-PROGRAMME — seriation puts graph neighbours near each other', () => {
  it('places a hub first and its neighbours immediately after', () => {
    const p = programmeOf(
      [['hall', 'hall', 6], ['liv', 'living', 20], ['kit', 'kitchen', 12], ['bed', 'bedroom', 12]],
      [['hall', 'liv'], ['hall', 'bed'], ['liv', 'kit']],
    );
    const order = seriateByGraph(p.entries, p.links);
    expect(order[0]).toBe('hall');           // degree 2 vs 2 vs 1 vs 1; earliest on the tie
    expect(order.slice(1, 3).sort()).toEqual(['bed', 'liv']);
    expect(order).toHaveLength(4);
  });

  it('appends a disconnected room rather than dropping it', () => {
    const p = programmeOf(
      [['a', 'living', 20], ['b', 'kitchen', 12], ['z', 'garage', 18]],
      [['a', 'b']],
    );
    const order = seriateByGraph(p.entries, p.links);
    expect(order).toHaveLength(3);
    expect(order).toContain('z');
  });

  it('is deterministic — the same programme yields the same order every time', () => {
    const p = defaultResidentialProgramme(() => `d${seq++}`);
    const a = seriateByGraph(p.entries, p.links);
    const b = seriateByGraph(p.entries, p.links);
    expect(a).toEqual(b);
  });
});

// ── ⭐ THE INVERSION ────────────────────────────────────────────────────────

describe('§ROOM-PROGRAMME — ⭐ plugging a relationship CHANGES THE GEOMETRY', () => {
  const rooms = [
    ['a', 'living', 60], ['b', 'kitchen', 60], ['c', 'bedroom', 60], ['d', 'bathroom', 60],
  ] as const;

  it('two different graphs over the SAME rooms produce different plans', () => {
    const g1 = ok(solveProgrammeLayout({
      levelRing: PLATE, programme: programmeOf(rooms, [['a', 'b'], ['b', 'c'], ['c', 'd']]),
    }));
    const g2 = ok(solveProgrammeLayout({
      levelRing: PLATE, programme: programmeOf(rooms, [['d', 'c'], ['c', 'a'], ['a', 'b']]),
    }));
    expect(g1.order).not.toEqual(g2.order);
    // The geometry, not just the ordering — this is the claim §25.5 actually makes.
    expect(ringKey(g1)).not.toEqual(ringKey(g2));
  });

  it('UNPLUGGING one relationship re-generates the plan', () => {
    const before = programmeOf(rooms, [['a', 'b'], ['b', 'c'], ['c', 'd']]);
    const after = reduceRoomProgramme(before, { type: 'programme.unlink', aId: 'b', bId: 'c' });
    const l1 = ok(solveProgrammeLayout({ levelRing: PLATE, programme: before }));
    const l2 = ok(solveProgrammeLayout({ levelRing: PLATE, programme: after }));
    expect(ringKey(l1)).not.toEqual(ringKey(l2));
  });

  it('the same graph twice produces the SAME plan — no hidden randomness', () => {
    const p = programmeOf(rooms, [['a', 'b'], ['b', 'c'], ['c', 'd']]);
    expect(ringKey(ok(solveProgrammeLayout({ levelRing: PLATE, programme: p }))))
      .toEqual(ringKey(ok(solveProgrammeLayout({ levelRing: PLATE, programme: p }))));
  });

  it('a plugged relationship is MORE likely to be honoured than an unplugged pair', () => {
    // Not "always" — this is a heuristic and the module says so. What must hold is that
    // the graph's own chain comes out connected on a plate this simple.
    const p = programmeOf(rooms, [['a', 'b'], ['b', 'c'], ['c', 'd']]);
    const l = ok(solveProgrammeLayout({ levelRing: PLATE, programme: p }));
    expect(l.requestedCount).toBe(3);
    expect(l.satisfiedCount).toBe(3);
    for (const v of l.adjacency) expect(v.sharedEdgeM).toBeGreaterThanOrEqual(DOOR_CLEAR_WIDTH_M);
  });
});

// ── areas, residual, containment ────────────────────────────────────────────

describe('§ROOM-PROGRAMME — the arithmetic is stated, not absorbed', () => {
  it('each cell measures the area the brief asked for', () => {
    const p = programmeOf([['a', 'living', 60], ['b', 'kitchen', 40], ['c', 'bedroom', 20]]);
    const l = ok(solveProgrammeLayout({ levelRing: PLATE, programme: p }));
    for (const c of l.cells) expect(c.areaM2).toBeCloseTo(c.targetAreaM2, 3);
  });

  it('the unallocated remainder is REPORTED and drawn, never scaled away', () => {
    const p = programmeOf([['a', 'living', 60], ['b', 'kitchen', 40]]);
    const l = ok(solveProgrammeLayout({ levelRing: PLATE, programme: p }));
    expect(l.levelAreaM2).toBeCloseTo(240, 3);
    expect(l.programmeAreaM2).toBeCloseTo(100, 3);
    expect(l.residualAreaM2).toBeCloseTo(140, 3);
    expect(l.residualRing).not.toBeNull();
    // ⛔ the residual is NOT a cell — it is never created as an envelope.
    expect(l.cells).toHaveLength(2);
  });

  it('every cell stays inside the plate', () => {
    const p = defaultResidentialProgramme(() => `c${seq++}`);
    const l = ok(solveProgrammeLayout({ levelRing: PLATE, programme: p }));
    for (const c of l.cells) {
      for (const q of c.ring) {
        expect(q.x).toBeGreaterThanOrEqual(-1e-6);
        expect(q.x).toBeLessThanOrEqual(24 + 1e-6);
        expect(q.z).toBeGreaterThanOrEqual(-1e-6);
        expect(q.z).toBeLessThanOrEqual(10 + 1e-6);
        expect(q.y).toBe(0);   // C114's schema refines on this
      }
    }
  });

  it('the cells plus the residual account for the whole plate', () => {
    const p = programmeOf([['a', 'living', 60], ['b', 'kitchen', 40]]);
    const l = ok(solveProgrammeLayout({ levelRing: PLATE, programme: p }));
    const sum = l.cells.reduce((s, c) => s + c.areaM2, 0) + l.residualAreaM2;
    expect(sum).toBeCloseTo(l.levelAreaM2, 2);
  });
});

// ── refusals ────────────────────────────────────────────────────────────────

describe('§ROOM-PROGRAMME — refusals carry BOTH numbers and never clamp', () => {
  it('a programme larger than the plate is refused, with both areas', () => {
    const p = programmeOf([['a', 'living', 200], ['b', 'kitchen', 100]]);
    const r = solveProgrammeLayout({ levelRing: PLATE, programme: p });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('unreachable');
    expect(r.code).toBe('programme-exceeds-level');
    expect(r.statement).toContain('300.00');   // asked
    expect(r.statement).toContain('240.00');   // available
    expect(r.statement).toContain('60.00');    // the overshoot
  });

  it('a room below its library floor is refused by name', () => {
    const p = programmeOf([['a', 'living', 2]]);
    const r = solveProgrammeLayout({ levelRing: PLATE, programme: p });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('unreachable');
    expect(r.code).toBe('room-below-minimum');
    expect(r.statement).toContain('2.00');
    expect(r.statement).toContain('10.00');
    // ⚠ and it says what the floor is NOT.
    expect(r.statement).toContain('not a habitability minimum');
  });

  it('an empty programme refuses with the next action, not with an empty plan', () => {
    const r = solveProgrammeLayout({ levelRing: PLATE, programme: EMPTY_ROOM_PROGRAMME });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('unreachable');
    expect(r.code).toBe('no-rooms');
  });

  it('no level ring refuses and NAMES the control that makes one', () => {
    const p = programmeOf([['a', 'living', 20]]);
    const r = solveProgrammeLayout({ levelRing: [], programme: p });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('unreachable');
    expect(r.code).toBe('no-level-ring');
    expect(r.statement).toContain('Fit this on the ground floor');
  });
});

// ── the payload ─────────────────────────────────────────────────────────────

const LEVEL_REC: SpaceEnvelopeRecordLike = {
  id: 'lvl-env-1',
  role: 'level',
  levelId: 'L0',
  name: 'Ground floor envelope',
  baseOffset: 0,
  height: 3,
  withinId: null,
  footprint: PLATE,
};

describe('§ROOM-PROGRAMME — the batch payload', () => {
  it('is ONE spaceEnvelope.batch.create with role room and withinId the level', () => {
    const p = programmeOf([['a', 'living', 60], ['b', 'kitchen', 40]]);
    const l = ok(solveProgrammeLayout({ levelRing: PLATE, programme: p }));
    const pick = pickHostLevelEnvelope([LEVEL_REC], 'L0');
    expect(pick.ok).toBe(true);
    if (!pick.ok) throw new Error('unreachable');
    let n = 0;
    const plan = buildRoomEnvelopePlan(l, pick.level, () => `env-${(n += 1)}`);
    expect(plan.ok).toBe(true);
    if (!plan.ok) throw new Error('unreachable');
    expect(plan.command).toBe('spaceEnvelope.batch.create');
    expect(plan.payload.envelopes).toHaveLength(2);
    for (const e of plan.payload.envelopes) {
      expect(e.role).toBe('room');
      expect(e.withinId).toBe('lvl-env-1');
      expect(e.levelId).toBe('L0');
      expect(e.baseOffset).toBe(0);
      expect(e.height).toBe(3);
      for (const q of e.footprint) expect(q.y).toBe(0);
    }
    // ⛔ C114 §5 — the derived metrics are NOT supplied; the handler recomputes them.
    for (const e of plan.payload.envelopes) {
      expect(e).not.toHaveProperty('footprintAreaM2');
      expect(e).not.toHaveProperty('volumeM3');
    }
  });

  it('carries the occupancy tag, and OMITS it for the no-mapping arm', () => {
    const p = programmeOf([['a', 'bedroom', 60], ['b', 'studio', 40]]);
    const l = ok(solveProgrammeLayout({ levelRing: PLATE, programme: p }));
    const pick = pickHostLevelEnvelope([LEVEL_REC], 'L0');
    if (!pick.ok) throw new Error('unreachable');
    let n = 0;
    const plan = buildRoomEnvelopePlan(l, pick.level, () => `env-${(n += 1)}`);
    if (!plan.ok) throw new Error('unreachable');
    const byName = new Map(plan.payload.envelopes.map((e) => [e.name, e]));
    expect(byName.get('a')!.occupancy).toBe('bedroom');
    expect(Object.prototype.hasOwnProperty.call(byName.get('b')!, 'occupancy')).toBe(false);
  });

  it('refuses when NO level envelope exists, naming the route that makes one', () => {
    const pick = pickHostLevelEnvelope([], 'L0');
    expect(pick.ok).toBe(false);
    if (pick.ok) throw new Error('unreachable');
    expect(pick.code).toBe('none');
    expect(pick.statement).toContain('Fit this on the ground floor');
  });

  it('refuses AMBIGUITY rather than picking one, and names the candidates', () => {
    const second: SpaceEnvelopeRecordLike = { ...LEVEL_REC, id: 'lvl-env-2', levelId: 'L1', name: 'Upper envelope' };
    const pick = pickHostLevelEnvelope([LEVEL_REC, second], null);
    expect(pick.ok).toBe(false);
    if (pick.ok) throw new Error('unreachable');
    expect(pick.code).toBe('ambiguous');
    expect(pick.statement).toContain('Ground floor envelope');
    expect(pick.statement).toContain('Upper envelope');
  });

  it('uses the ONE level envelope even when no storey is active', () => {
    const pick = pickHostLevelEnvelope([LEVEL_REC], null);
    expect(pick.ok).toBe(true);
  });

  it('narrows two candidates by the ACTIVE storey', () => {
    const second: SpaceEnvelopeRecordLike = { ...LEVEL_REC, id: 'lvl-env-2', levelId: 'L1' };
    const pick = pickHostLevelEnvelope([LEVEL_REC, second], 'L1');
    expect(pick.ok).toBe(true);
    if (!pick.ok) throw new Error('unreachable');
    expect(pick.level.id).toBe('lvl-env-2');
  });

  it('names the undo cost of a replacement BEFORE anything is removed', () => {
    const rooms: SpaceEnvelopeRecordLike[] = [
      { id: 'r1', role: 'room', levelId: 'L0', withinId: 'lvl-env-1' },
      { id: 'r2', role: 'room', levelId: 'L0', withinId: 'lvl-env-1' },
    ];
    expect(roomEnvelopesWithin([LEVEL_REC, ...rooms], 'lvl-env-1')).toEqual(['r1', 'r2']);
    const s = describeReplacement(['r1', 'r2'])!;
    expect(s).toContain('3 undo steps');
    expect(s).toContain('no batch DELETE');
    expect(describeReplacement([])).toBeNull();
  });
});
