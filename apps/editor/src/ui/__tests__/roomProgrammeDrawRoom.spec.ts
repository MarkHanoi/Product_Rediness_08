/**
 * §ROOM-DRAW-NEW (L-13120) — DRAWING A ROOM THAT DOES NOT EXIST YET.
 *
 * Subjects:  apps/editor/src/ui/room-programme/roomDrawPlan.ts        (the taxonomy — THE asker)
 *            apps/editor/src/ui/room-programme/roomProgrammeModel.ts  (the one intent)
 *            apps/editor/src/ui/room-programme/roomProgrammePanel.ts  (the gesture)
 * Strategy:  STR-RESIDENTIAL-DESIGN-ORCHESTRATOR §9 · §10 · §25.5 · §26.6.7
 * Contracts: C83 §1.2 / C58 (a refusal carries BOTH numbers, and never clamps) ·
 *            C84 EI-8a (no second copy of a predicate) · C06 §13.3 (one producer per figure) ·
 *            C114 §12 (room ⊂ level) · C52 §3 (session override → re-run)
 *
 * Founder 2026-09-07: *"This room locator needs to be more flexible and more dynamic — I shall
 * be able to reorganize also the rooms on the plan view — draw them etc."*
 *
 * ⭐ WHAT IS PROVEN HERE. `roomProgrammePlanReorder.spec.ts` covers the ORDER;
 * `roomProgrammeWallDrag.spec.ts` covers the FOOTPRINT of rooms that already exist. This covers
 * the third gesture — the only one that CREATES — and, more than the gesture, it covers the
 * TAXONOMY that decides when a drawn shape is refused: IMPOSSIBLE vs INADVISABLE vs FINE
 * (§SPATIAL-VALIDITY-RULES). The refusals are the product here, so most of this file is about
 * them, and every one of them is checked for BOTH NUMBERS and for a REACHABLE way out.
 *
 * ⛔ IT DOES NOT CLAIM A FREEHAND BOUNDARY TOOL, because none was built and none is expressible:
 * `solveProgrammeLayout` PARTITIONS the plate, so a cell's ring is a pure function of the areas
 * and the order. A drawn rectangle contributes an AREA and a POSITION IN THE ORDER, and one test
 * below pins that the panel SAYS the room lands where those put it rather than on the rectangle.
 *
 * ⛔ NOR PERSISTENCE OR UNDO. The programme is a session brief whose own header says *"NOTHING
 * HERE PERSISTS"*; the bus is reached by "Place envelopes in 3D". One test pins that the panel
 * says Ctrl+Z will not take a drawn room back, rather than letting the user assume it will.
 *
 * ── THE SPLIT BETWEEN THE TWO HALVES, STATED ─────────────────────────────────────────────────
 * The TAXONOMY is proven against the pure asker, where every number is chosen by this file. The
 * DOM half proves the WIRING — that a real pointer gesture reaches that asker with the metres the
 * pixels meant, and that arming the third gesture does not break the other two. Proving the
 * taxonomy through the DOM would make the expectations a restatement of the implementation;
 * proving the wiring in the asker would prove nothing about the gesture
 * (§FAKE-MORE-CAPABLE-THAN-REAL).
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  ROOM_DRAW_AREA_ATTR,
  ROOM_DRAW_KIND_TESTID,
  ROOM_DRAW_RECT_ATTR,
  ROOM_DRAW_TOGGLE_TESTID,
  ROOM_DRAW_VERDICT_ATTR,
  ROOM_PROGRAMME_PREVIEW_TESTID,
  ROOM_PROGRAMME_STATUS_TESTID,
  ROOM_SEAM_A_ATTR,
  ROOM_SEAM_B_ATTR,
  ROOM_SEAM_LENGTH_ATTR,
  ROOM_SEAM_NORMAL_ATTR,
  mountRoomProgrammePanel,
  type RoomProgrammePanelDeps,
} from '../room-programme/roomProgrammePanel';
import {
  EMPTY_ROOM_PROGRAMME,
  applyRoomProgrammeIntent,
  clearRoomProgramme,
  getRoomProgramme,
  reduceRoomProgramme,
  type RoomProgramme,
} from '../room-programme/roomProgrammeModel';
import {
  DRAW_PIN_MAJORITY,
  describeDrawnRoom,
  type DrawnRect,
  type DrawnRoomVerdict,
} from '../room-programme/roomDrawPlan';
import {
  probeProgrammeLayout,
  solveProgrammeLayout,
  type ProgrammeLayout,
} from '../room-programme/programmeToEnvelopes';
import { residentialRoomEntry } from '../room-programme/residentialRoomLibrary';
import type { SpaceEnvelopeRecordLike } from '../room-programme/roomEnvelopePlan';

/** The 24 × 10 m plate = 240 m² the sibling specs use. Its dimensions are the scale below. */
const PLATE = [
  { x: 0, y: 0, z: 0 },
  { x: 24, y: 0, z: 0 },
  { x: 24, y: 0, z: 10 },
  { x: 0, y: 0, z: 10 },
];
const PLATE_AREA_M2 = 240;

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

function deps(over: Partial<RoomProgrammePanelDeps> = {}): RoomProgrammePanelDeps {
  let n = 0;
  return {
    resolveRuntime: () => null,
    readSpaceEnvelopes: () => [LEVEL_REC],
    readActiveLevelId: () => 'L0',
    mintId: () => `mint-${(n += 1)}`,
    readProjectRooms: () => [],
    ...over,
  };
}

/** 107 m² of brief on a 240 m² plate ⇒ 133 m² unallocated. Every number below is that arithmetic. */
const ROOMS: ReadonlyArray<readonly [string, string, number]> = [
  ['living', 'living', 40],
  ['kitchen', 'kitchen', 30],
  ['bed', 'bedroom', 25],
  ['bath', 'bathroom', 12],
];
const BRIEF_AREA_M2 = 107;
const FREE_AREA_M2 = PLATE_AREA_M2 - BRIEF_AREA_M2;

function seedProgramme(): void {
  for (const [id, kind, area] of ROOMS) {
    applyRoomProgrammeIntent({ type: 'programme.add-room', id, kind: kind as never, name: id });
    applyRoomProgrammeIntent({ type: 'programme.set-area', id, targetAreaM2: area });
  }
  applyRoomProgrammeIntent({ type: 'programme.link', aId: 'living', bId: 'kitchen' });
}

/** The same programme as a VALUE, for the pure half — no module stash involved. */
function pureProgramme(): RoomProgramme {
  let p: RoomProgramme = EMPTY_ROOM_PROGRAMME;
  for (const [id, kind, area] of ROOMS) {
    p = reduceRoomProgramme(p, { type: 'programme.add-room', id, kind: kind as never, name: id });
    p = reduceRoomProgramme(p, { type: 'programme.set-area', id, targetAreaM2: area });
  }
  return p;
}

function layoutOf(p: RoomProgramme): ProgrammeLayout {
  const r = solveProgrammeLayout({ levelRing: PLATE, programme: p });
  if (!r.ok) throw new Error(`fixture does not solve: ${r.code}`);
  return r;
}

/** Ask the ONE asker about one rectangle. `kind` defaults to a living room (floor 10 m²). */
function ask(
  p: RoomProgramme,
  rect: DrawnRect,
  kind: string = 'living',
  id = 'drawn-1',
): DrawnRoomVerdict {
  return describeDrawnRoom({
    levelRing: PLATE,
    programme: p,
    layout: layoutOf(p),
    kind: kind as never,
    rect,
    id,
  });
}

/** A rectangle from a corner and a size, so every fixture below states its own area. */
const box = (x: number, z: number, w: number, d: number): DrawnRect =>
  ({ x0: x, z0: z, x1: x + w, z1: z + d });

/**
 * A rectangle centred in a cell's bounding box at `frac` of its size.
 *
 * ⭐ EVERY CELL HERE IS CONVEX BY CONSTRUCTION — `subdivideByArea` clips a rectangular plate by
 * axis-aligned half-planes — so a shrunk, centred box is genuinely INSIDE the cell rather than
 * approximately so. That matters: a fixture that leaked over the cell edge would lose the
 * MAJORITY test and the assertion below would pass or fail for the wrong reason.
 */
function insideBoxOf(ring: readonly { x: number; z: number }[], frac: number): DrawnRect {
  let x0 = Infinity; let x1 = -Infinity; let z0 = Infinity; let z1 = -Infinity;
  for (const q of ring) {
    if (q.x < x0) x0 = q.x; if (q.x > x1) x1 = q.x;
    if (q.z < z0) z0 = q.z; if (q.z > z1) z1 = q.z;
  }
  const cx = (x0 + x1) / 2; const cz = (z0 + z1) / 2;
  const w = (x1 - x0) * frac / 2; const d = (z1 - z0) * frac / 2;
  return { x0: cx - w, z0: cz - d, x1: cx + w, z1: cz + d };
}

const totalOf = (p: RoomProgramme): number => p.entries.reduce((s, e) => s + e.targetAreaM2, 0);

// ═════════════════════════════════════════════════════════════════════════════
// THE PURE HALF — THE TAXONOMY, with numbers this file chose
// ═════════════════════════════════════════════════════════════════════════════

describe('§ROOM-DRAW-NEW — FINE: a rectangle inside the free plate becomes a room', () => {
  it('⭐ one rectangle becomes one room at the area it measures, in ONE intent', () => {
    const p0 = pureProgramme();
    const v = ask(p0, box(1, 1, 4, 5)); // 20 m², a living room (floor 10)
    expect(v.ok).toBe(true);
    expect(v.drawnAreaM2).toBe(20);
    expect(v.intent).not.toBeNull();
    // ⭐ ONE intent — not add-room + set-area + pin-room. The end state is reached in one step,
    // so the solver runs once and the plan never flickers through an arrangement nobody asked for.
    expect(v.intent!.type).toBe('programme.draw-room');
    const p1 = reduceRoomProgramme(p0, v.intent!);
    expect(p1.entries).toHaveLength(ROOMS.length + 1);
    expect(p1.entries.at(-1)!.targetAreaM2).toBe(20);
    expect(p1.entries.at(-1)!.kind).toBe('living');
  });

  it('⛔ CONSERVATION: a drawn room consumes UNALLOCATED floor and takes nothing from a neighbour', () => {
    // This is the gesture's invariant, and the counterpart of the wall drag's. The wall drag moves
    // area BETWEEN two rooms and changes no total; the draw consumes only what nothing claims.
    // Between them, neither gesture can silently shrink a room the user did not touch.
    const p0 = pureProgramme();
    const v = ask(p0, box(1, 1, 4, 5));
    const p1 = reduceRoomProgramme(p0, v.intent!);
    for (const [id, , area] of ROOMS) {
      expect(p1.entries.find((e) => e.id === id)!.targetAreaM2).toBe(area);
    }
    expect(totalOf(p1)).toBe(BRIEF_AREA_M2 + 20);
    expect(v.freeAreaM2).toBe(FREE_AREA_M2);
  });

  it('⭐ ACCEPTING IMPLIES THE SOLVER ACCEPTS — the guarantee that keeps one bad draw from costing the plan', () => {
    // ⛔ THE POINT OF RE-SOLVING INSIDE THE ASKER. If an accepted draw could still make
    // `solveProgrammeLayout` refuse, the user would lose the whole plan he was drawing on to one
    // rectangle. Every accepted rectangle below is therefore checked end to end.
    const p0 = pureProgramme();
    for (const r of [box(1, 1, 4, 5), box(0, 0, 3, 4), box(14, 2, 6, 6), box(2, 2, 10, 10)]) {
      const v = ask(p0, r);
      if (!v.ok) continue;
      expect(solveProgrammeLayout({ levelRing: PLATE, programme: reduceRoomProgramme(p0, v.intent!) }).ok)
        .toBe(true);
    }
  });
});

describe('§ROOM-DRAW-NEW — IMPOSSIBLE: off the plate (C114 §12, a room ⊂ its level)', () => {
  it('a rectangle entirely outside the storey is refused, and says 0.00 m² of it is inside', () => {
    const v = ask(pureProgramme(), box(30, 1, 4, 5));
    expect(v.ok).toBe(false);
    expect(v.code).toBe('outside-level');
    expect(v.insideAreaM2).toBe(0);
    // C83 §1.2 — BOTH numbers in the sentence the user reads.
    expect(v.statement).toContain('20.00 m²');
    expect(v.statement).toContain('0.00 m²');
    // ⛔ THE INTENT IS THE ONLY AUTHORISATION, AND A REFUSAL CARRIES NONE.
    expect(v.intent).toBeNull();
  });

  it('⛔ a rectangle HALF outside is refused WHOLE — the part that fits is never quietly kept', () => {
    // The plate ends at x = 24. This 4 × 5 rectangle runs 22 → 26, so exactly half of it is on.
    const v = ask(pureProgramme(), box(22, 1, 4, 5));
    expect(v.ok).toBe(false);
    expect(v.code).toBe('partly-outside-level');
    expect(v.drawnAreaM2).toBe(20);
    expect(v.insideAreaM2).toBe(10);
    // ⛔ NOT CLAMPED TO THE 10 m² THAT FITS (C83). Trimming would report a room the user did not
    // draw as one he did — and he could not see the difference, because the rectangle is not what
    // gets stored. The sentence has to say all three numbers.
    expect(v.statement).toContain('20.00 m²');
    expect(v.statement).toContain('10.00 m²');
    expect(v.statement).toContain('hangs over');
    expect(v.intent).toBeNull();
  });
});

describe('§ROOM-DRAW-NEW — IMPOSSIBLE: under the kind’s floor', () => {
  it('is refused with BOTH numbers, and with a DEPTH the user can act on in the same gesture', () => {
    // 2 m wide × 1 m deep = 2 m², against a living room's 10 m² floor.
    const v = ask(pureProgramme(), box(1, 1, 2, 1), 'living');
    expect(v.ok).toBe(false);
    expect(v.code).toBe('below-minimum');
    expect(v.floorAreaM2).toBe(residentialRoomEntry('living')!.minAreaM2);
    expect(v.statement).toContain('2.00 m²');
    expect(v.statement).toContain('10.00 m²');
    // ⭐ L-942 IN ITS MOST USABLE FORM: the way out as a DIMENSION, not only an area. 10 m² at the
    // 2.00 m width he drew is 5.00 m deep — a number he can reach by continuing the same drag.
    expect(v.statement).toContain('5.00 m deep');
    expect(v.intent).toBeNull();
  });

  it('⛔ the floor is the SAME number the solver refuses on, so an accepted draw cannot trip it', () => {
    // A 3 m² rectangle clears a bathroom's 3 m² floor and fails a living room's 10 m².
    expect(ask(pureProgramme(), box(1, 1, 3, 1), 'bathroom').ok).toBe(true);
    expect(ask(pureProgramme(), box(1, 1, 3, 1), 'living').code).toBe('below-minimum');
    // And the reducer refuses it too — a caller that skipped the asker still cannot get past.
    const p0 = pureProgramme();
    const sneak = reduceRoomProgramme(p0, {
      type: 'programme.draw-room', id: 'sneak', kind: 'living', targetAreaM2: 3,
    });
    expect(sneak).toBe(p0); // referential identity IS the reducer's "that did not happen"
  });
});

describe('§ROOM-DRAW-NEW — IMPOSSIBLE: more floor than the storey has left', () => {
  it('refuses with both numbers and states the invariant it is protecting', () => {
    // The whole plate: 240 m² asked, 133 m² unallocated.
    const v = ask(pureProgramme(), box(0, 0, 24, 10));
    expect(v.ok).toBe(false);
    expect(v.code).toBe('exceeds-free-plate');
    expect(v.statement).toContain('240.00 m²');
    expect(v.statement).toContain('133.00 m²');
    expect(v.statement).toContain('107.00 m²'); // the overshoot, the third honest number
    // ⭐ THE SENTENCE NAMES THE RULE, not just the arithmetic. This is what stops the user
    // concluding that drawing over a room takes floor from it.
    expect(v.statement).toContain('never from its neighbours');
    expect(v.intent).toBeNull();
  });

  it('⭐ L-942 — the escape hatch is REACHABLE: drawing exactly the number it printed is accepted', () => {
    // ⛔ THIS IS THE TEST THAT MAKES THE REFUSAL HONEST. A refusal whose yes-branch is
    // unreachable is *"a regression with a citation attached"*. So the ceiling the refusal
    // printed is taken at face value and drawn — and it has to be accepted.
    const p0 = pureProgramme();
    const refused = ask(p0, box(0, 0, 24, 10));
    expect(refused.largestDrawableM2).toBe(FREE_AREA_M2);
    // 133 m² as 13.3 m × 10 m, inside the plate.
    const hatch = ask(p0, box(0, 0, refused.largestDrawableM2 / 10, 10));
    expect(hatch.drawnAreaM2).toBe(refused.largestDrawableM2);
    expect(hatch.ok).toBe(true);
    expect(hatch.intent).not.toBeNull();
  });

  it('⛔ a DEAD END is named as one, with the three gestures that open it — never a number', () => {
    // Fill the plate to within 0.5 m², below even the smallest floor in the library.
    let p = pureProgramme();
    p = reduceRoomProgramme(p, { type: 'programme.set-area', id: 'living', targetAreaM2: 172.5 });
    const v = ask(p, box(1, 1, 4, 5), 'living');
    expect(v.ok).toBe(false);
    expect(v.freeAreaM2).toBe(0.5);
    // ⭐ ZERO, NOT 0.5. Printing 0.5 would invite a drawing that is then refused for a SECOND
    // reason — the shape of escape hatch that reads as an invitation and is not one.
    expect(v.largestDrawableM2).toBe(0);
    expect(v.statement).toContain('no room left to draw one');
    expect(v.statement).toContain('shrink a room in the list');
    expect(v.statement).toContain('drag a party wall');
    expect(v.statement).toContain('grow the level envelope');
  });
});

describe('§ROOM-DRAW-NEW — INADVISABLE, NOT IMPOSSIBLE: drawn over rooms that already exist', () => {
  it('⭐ is ACCEPTED and SAID, never refused and never silently corrected', () => {
    // §SPATIAL-VALIDITY: the solver PARTITIONS the plate, so nothing overlaps in its output — a
    // straddling rectangle is not a contradiction, it is a request whose result will not look
    // like the rectangle. The user decides by releasing; refusing here would substitute PRYZM's
    // taste for his.
    const p0 = pureProgramme();
    const v = ask(p0, box(0, 0, 6, 8)); // 48 m², squarely on top of the first cells
    expect(v.ok).toBe(true);
    expect(v.overlaps.length).toBeGreaterThan(0);
    for (const name of v.overlaps.map((o) => o.name)) expect(v.statement).toContain(name);
    // ⛔ AND IT SAYS WHAT IT WILL *NOT* DO, then points at the gesture that does.
    expect(v.statement).toContain('does not take floor from them');
    expect(v.statement).toContain('drag the wall between them');
  });

  it('the rooms drawn over keep their areas — the caveat is true, not a hedge', () => {
    const p0 = pureProgramme();
    const v = ask(p0, box(0, 0, 6, 8));
    const p1 = reduceRoomProgramme(p0, v.intent!);
    for (const [id, , area] of ROOMS) {
      expect(p1.entries.find((e) => e.id === id)!.targetAreaM2).toBe(area);
    }
  });
});

describe('§ROOM-DRAW-NEW — WHERE IT LANDS: the second currency the solver can keep', () => {
  it('a rectangle mostly on one room takes THAT room’s position in the order', () => {
    const p0 = pureProgramme();
    const l0 = layoutOf(p0);
    const target = l0.cells[1]!;
    // A small rectangle at the target cell's own centroid is entirely inside it.
    let cx = 0; let cz = 0;
    for (const q of target.ring) { cx += q.x; cz += q.z; }
    cx /= target.ring.length; cz /= target.ring.length;
    const v = ask(p0, box(cx - 1.5, cz - 1.5, 3, 3), 'bathroom');
    expect(v.ok).toBe(true);
    expect(v.overlaps[0]!.roomId).toBe(target.roomId);
    expect(v.pinnedOrder).toBe(l0.order.indexOf(target.roomId));
    expect(v.statement).toContain('where you drew it');
    // And the reduced state actually carries the pin — the verdict reports the OUTCOME.
    const p1 = reduceRoomProgramme(p0, v.intent!);
    expect(p1.entries.find((e) => e.id === 'drawn-1')!.pinnedOrder).toBe(v.pinnedOrder);
  });

  it('⛔ a rectangle spread thin over many rooms is NOT seated — the solver keeps the choice', () => {
    // `applyPinnedOrder` refuses *"a position you did not choose, presented as one you did"*.
    // A rectangle no single cell holds a MAJORITY of is not pointing anywhere in particular.
    const p0 = pureProgramme();
    const v = ask(p0, box(0, 4.4, 24, 1.2)); // a 28.8 m² band across the whole plate
    expect(v.ok).toBe(true);
    expect(v.pinnedOrder).toBeNull();
    const top = v.overlaps[0]?.areaM2 ?? 0;
    expect(top).toBeLessThan(v.drawnAreaM2 * DRAW_PIN_MAJORITY);
    // ⭐ AND IT SAYS SO, then names the gesture that WOULD seat it.
    expect(v.statement).toContain('the position the graph gives it');
    expect(v.statement).toContain('drag it onto another room');
  });

  it('⛔ a position another room has PINNED is not evicted; the verdict reports what it GOT', () => {
    // ⚠ THE FIXTURE HAS TO BE BUILT AGAINST THE LAYOUT THE VERDICT WILL SEE, NOT THE ONE
    // BEFORE THE PIN. A pin RE-SEATS the whole sequence, so a cell picked from the pre-pin layout
    // is at a different position afterwards and the collision this test exists to force never
    // happens. Pinning `bath` to position 0 and then drawing on the cell AT position 0 — which is
    // now bath's own — is the collision, stated in the post-pin layout's own terms.
    const p0 = pureProgramme();
    const pinned = reduceRoomProgramme(p0, { type: 'programme.pin-room', id: 'bath', order: 0 });
    expect(pinned.entries.find((e) => e.id === 'bath')!.pinnedOrder).toBe(0);
    const l1 = layoutOf(pinned);
    expect(l1.order[0]).toBe('bath');
    const v = describeDrawnRoom({
      levelRing: PLATE,
      programme: pinned,
      layout: l1,
      kind: 'bathroom' as never,
      rect: insideBoxOf(l1.cells[0]!.ring, 0.6),
      id: 'drawn-1',
    });
    expect(v.ok).toBe(true);
    expect(v.overlaps[0]!.roomId).toBe('bath');
    // ⭐ THE REQUEST WAS SLOT 0; THE OUTCOME IS UNPINNED, AND THE OUTCOME IS WHAT IS REPORTED.
    // The verdict reads `pinnedOrder` back off the state the reducer produced, so the sentence the
    // user sees can never describe a pin the room did not get.
    expect(v.pinnedOrder).toBeNull();
    expect(v.statement).toContain('the position the graph gives it');
    const after = reduceRoomProgramme(pinned, v.intent!);
    expect(after.entries.find((e) => e.id === 'drawn-1')!.pinnedOrder).toBeUndefined();
    // ⛔ AND NOBODY WAS DISPLACED. A drag that evicts someone else's pin without saying so is
    // a silent overwrite in a nicer costume — `programme.pin-room`'s own words.
    expect(after.entries.find((e) => e.id === 'bath')!.pinnedOrder).toBe(0);
  });
});

describe('§ROOM-DRAW-NEW — the degenerate gestures', () => {
  it('a click is not a drawing: it is refused, and it says what a drawing IS', () => {
    const v = ask(pureProgramme(), box(4, 4, 0, 0));
    expect(v.ok).toBe(false);
    expect(v.code).toBe('nothing-drawn');
    expect(v.statement).toContain('drag out a rectangle');
    expect(v.intent).toBeNull();
  });

  it('a rectangle drawn backwards (right-to-left, bottom-to-top) is the same rectangle', () => {
    const fwd = ask(pureProgramme(), { x0: 1, z0: 1, x1: 5, z1: 6 });
    const back = ask(pureProgramme(), { x0: 5, z0: 6, x1: 1, z1: 1 });
    expect(back.ok).toBe(fwd.ok);
    expect(back.drawnAreaM2).toBe(fwd.drawnAreaM2);
  });
});

describe('§ROOM-DRAW-NEW — the PROBE is the solve with its search truncated, not a rival', () => {
  it('⭐ probe and full solve agree on ok/refused for every programme size, and on the CODE', () => {
    // ⛔ THIS IS THE CORRECTNESS ARGUMENT FOR A PERFORMANCE CHANGE, AND IT HAS TO BE A TEST.
    // `describeDrawnRoom` runs on every pointer move, and the FULL solve was benched at 14.7 ms
    // per move at four rooms and 37.3 ms at twenty — against a 16.7 ms frame budget, i.e. a drag
    // that stutters at a realistic brief and is unusable at a large one. `probeProgrammeLayout`
    // stops at the FIRST cutting discipline that partitions the plate instead of running all
    // three and keeping the best, which is ~3× cheaper (measured 3.1 / 4.9 / 7.3 / 11.8 ms).
    // ⭐ IT CHANGES NO VERDICT because both are refused exactly when EVERY policy fails — the
    // failure arm sits after the loop. That claim is what this test exists to keep true if either
    // the policy list or the selection rule is ever edited.
    const KINDS = ['living', 'kitchen', 'bedroom', 'bathroom', 'hall', 'wc', 'office', 'storage'];
    for (const n of [1, 2, 4, 8, 12, 20]) {
      for (const each of [11, 30]) {
        let p: RoomProgramme = EMPTY_ROOM_PROGRAMME;
        for (let i = 0; i < n; i += 1) {
          p = reduceRoomProgramme(p, {
            type: 'programme.add-room', id: `r${i}`, kind: KINDS[i % KINDS.length] as never });
          p = reduceRoomProgramme(p, { type: 'programme.set-area', id: `r${i}`, targetAreaM2: each });
        }
        const full = solveProgrammeLayout({ levelRing: PLATE, programme: p });
        const probe = probeProgrammeLayout({ levelRing: PLATE, programme: p });
        expect(probe === null).toBe(full.ok);
        // … and when they refuse, they refuse for the SAME REASON. A probe that agreed on the
        // verdict but not the code would put a sentence in front of the user that the full solve
        // would never have written.
        if (!full.ok) expect(probe!.code).toBe(full.code);
      }
    }
    // The empty and the over-full cases too — the refusals that arrive BEFORE the policy loop.
    expect(probeProgrammeLayout({ levelRing: PLATE, programme: EMPTY_ROOM_PROGRAMME })!.code)
      .toBe('no-rooms');
    expect(probeProgrammeLayout({ levelRing: [], programme: pureProgramme() })!.code)
      .toBe('no-level-ring');
  });

  it('⛔ the probe returns NO LAYOUT, so nothing can come to depend on which arrangement won', () => {
    // The truncated search picks a DIFFERENT arrangement from the full solve in general. Returning
    // a refusal-or-null rather than a `ProgrammeLayout` is what makes that difference unreachable
    // instead of merely undocumented — a caller cannot read a `satisfiedCount` this never computed.
    expect(probeProgrammeLayout({ levelRing: PLATE, programme: pureProgramme() })).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// THE DOM HALF — the WIRING: pixels → metres, and three gestures on one pointer
// ═════════════════════════════════════════════════════════════════════════════

/** The strip's viewBox width, from `renderPreview`. The scale below is derived from it. */
const VIEWBOX_W = 300;

let host: HTMLElement;

beforeEach(() => {
  clearRoomProgramme();
  applyRoomProgrammeIntent({ type: 'programme.reset', next: EMPTY_ROOM_PROGRAMME });
  document.body.replaceChildren();
  host = document.createElement('div');
  document.body.appendChild(host);
});

const statusText = (h: HTMLElement): string =>
  h.querySelector(`[data-testid="${ROOM_PROGRAMME_STATUS_TESTID}"]`)?.textContent ?? '';

const toggle = (h: HTMLElement): HTMLButtonElement =>
  h.querySelector<HTMLButtonElement>(`[data-testid="${ROOM_DRAW_TOGGLE_TESTID}"]`)!;

/**
 * Give the plan a REAL, KNOWN layout box.
 *
 * ⚠ happy-dom lays nothing out, so `getBoundingClientRect()` reports zeros — and the panel
 * REFUSES the gesture on a zero-width rect rather than dividing by it. Stubbing the rect on the
 * one element under test is the idiom the sibling spec already uses. Width 300 = the viewBox
 * width, so one client pixel is one viewBox unit and the arithmetic below is checkable by hand.
 */
function armPlan(h: HTMLElement): SVGSVGElement {
  const svg = h.querySelector<SVGSVGElement>(`[data-testid="${ROOM_PROGRAMME_PREVIEW_TESTID}"] svg`)!;
  const vb = (svg.getAttribute('viewBox') ?? '0 0 300 125').split(' ').map(Number);
  Object.defineProperty(svg, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      width: VIEWBOX_W, height: vb[3] ?? 125, left: 0, top: 0,
      right: VIEWBOX_W, bottom: vb[3] ?? 125, x: 0, y: 0, toJSON: () => ({}),
    }),
  });
  return svg;
}

/**
 * World metres → client pixels, recomputed from the PLATE's own dimensions — never from anything
 * the panel reported. This is what makes the pixel→metre chain a MEASURED claim.
 */
function pxOf(svg: SVGSVGElement): (x: number, z: number) => { clientX: number; clientY: number } {
  const H = Number((svg.getAttribute('viewBox') ?? '0 0 300 125').split(' ')[3]);
  const vbPerMx = (VIEWBOX_W - 8) / 24;
  const vbPerMz = (H - 8) / 10;
  return (x, z) => ({ clientX: x * vbPerMx + 4, clientY: z * vbPerMz + 4 });
}

const ptr = (type: string, init: { clientX: number; clientY: number }): Event =>
  new (window as unknown as { PointerEvent: typeof MouseEvent }).PointerEvent(
    type, { bubbles: true, ...init } as MouseEventInit);

/** Arm the gesture and drag a world-space rectangle across the plan. */
function drawRect(h: HTMLElement, r: DrawnRect): void {
  // ⚠ THE SVG IS RE-CREATED BY THE RE-RENDER THE TOGGLE TRIGGERS, so it is re-queried and
  // re-stubbed AFTER arming. Holding the old node would drive a detached element and prove nothing.
  toggle(h).click();
  const svg = armPlan(h);
  const px = pxOf(svg);
  const a = px(r.x0, r.z0);
  const b = px(r.x1, r.z1);
  svg.dispatchEvent(ptr('pointerdown', a));
  svg.dispatchEvent(ptr('pointermove', b));
  svg.dispatchEvent(ptr('pointerup', b));
}

describe('§ROOM-DRAW-NEW — the arm is a control the user can see and reach', () => {
  it('renders a toggle and a kind chooser, and the toggle shows whether it is armed', () => {
    seedProgramme();
    const panel = mountRoomProgrammePanel(host, deps());
    const t = toggle(host);
    expect(t).toBeTruthy();
    expect(t.getAttribute('aria-pressed')).toBe('false');
    expect(t.disabled).toBe(false);
    expect(host.querySelector(`[data-testid="${ROOM_DRAW_KIND_TESTID}"]`)).toBeTruthy();
    t.click();
    // ⛔ A MODE THE USER CANNOT SEE IS A TRAP. The label and `aria-pressed` both move.
    expect(toggle(host).getAttribute('aria-pressed')).toBe('true');
    expect(toggle(host).textContent).toContain('Drawing');
    panel.dispose();
  });

  it('⛔ a full plate DISABLES the arm and PRINTS THE REASON — a dead end named as one', () => {
    seedProgramme();
    applyRoomProgrammeIntent({ type: 'programme.set-area', id: 'living', targetAreaM2: 172.5 });
    const panel = mountRoomProgrammePanel(host, deps());
    const t = toggle(host);
    expect(t.disabled).toBe(true);
    // The §SiteEntryPanel idiom: greyed WITH its reason, and with the way out.
    expect(t.title).toContain('0.50 m² unallocated');
    expect(t.title).toContain('Shrink a room in the list');
    panel.dispose();
  });

  it('the hint says the room lands where its AREA and POSITION put it, not on the rectangle', () => {
    // ⛔ A control that looks live and is not is the one outcome this lane was told to avoid.
    seedProgramme();
    const panel = mountRoomProgrammePanel(host, deps());
    const text = host.querySelector(`[data-testid="${ROOM_PROGRAMME_PREVIEW_TESTID}"]`)?.textContent ?? '';
    expect(text).toContain('Draw a room');
    expect(text).toContain('never from its neighbours');
    expect(text).toContain('Ctrl+Z');
    panel.dispose();
  });
});

describe('§ROOM-DRAW-NEW — a real pointer gesture reaches the reducer with the metres the pixels meant', () => {
  it('⭐ dragging a 4 × 5 m rectangle adds a 20 m² room', () => {
    seedProgramme();
    const panel = mountRoomProgrammePanel(host, deps());
    const before = getRoomProgramme().entries.length;
    drawRect(host, box(1, 1, 4, 5));
    const p = getRoomProgramme();
    expect(p.entries).toHaveLength(before + 1);
    // ⭐ THE AREA CAME FROM THE PLATE'S DIMENSIONS THROUGH THE PIXELS, not from a number this test
    // handed the panel. 20 m², within the centimetre-squared the gesture rounds to.
    expect(p.entries.at(-1)!.targetAreaM2).toBeCloseTo(20, 1);
    expect(statusText(host)).toContain('Added a living');
    // ⛔ THE ADMISSION IS IN THE SENTENCE, not left for the user to discover.
    expect(statusText(host)).toContain('Ctrl+Z will not take it back');
    panel.dispose();
  });

  it('the band carries its own area and verdict while it is being drawn', () => {
    seedProgramme();
    const panel = mountRoomProgrammePanel(host, deps());
    toggle(host).click();
    const svg = armPlan(host);
    const px = pxOf(svg);
    svg.dispatchEvent(ptr('pointerdown', px(1, 1)));
    svg.dispatchEvent(ptr('pointermove', px(5, 6)));
    const band = svg.querySelector(`[${ROOM_DRAW_RECT_ATTR}]`);
    expect(band).toBeTruthy();
    expect(Number(band!.getAttribute(ROOM_DRAW_AREA_ATTR))).toBeCloseTo(20, 1);
    expect(band!.getAttribute(ROOM_DRAW_VERDICT_ATTR)).toBe('ok');
    // ⛔ THE LIMIT IS MET WHILE DRAWING, NOT DISCOVERED ON RELEASE.
    expect(statusText(host)).toContain('Release to add it');
    panel.dispose();
  });

  it('⛔ a refused drawing changes NOTHING and leaves the arm ON — the way out is one drag away', () => {
    seedProgramme();
    const panel = mountRoomProgrammePanel(host, deps());
    const before = getRoomProgramme().entries.length;
    drawRect(host, box(1, 1, 2, 1)); // 2 m², under the living room's 10 m² floor
    expect(getRoomProgramme().entries).toHaveLength(before);
    expect(statusText(host)).toContain('10.00 m²');
    // ⭐ L-942 AT THE SURFACE. Disarming on a refusal would put the escape hatch behind a second
    // click, on a gesture the user has just been told how to get right.
    expect(toggle(host).getAttribute('aria-pressed')).toBe('true');
    panel.dispose();
  });

  it('an ACCEPTED drawing disarms, so the next click is not read as a zero-area rectangle', () => {
    seedProgramme();
    const panel = mountRoomProgrammePanel(host, deps());
    drawRect(host, box(1, 1, 4, 5));
    expect(toggle(host).getAttribute('aria-pressed')).toBe('false');
    panel.dispose();
  });

  it('⛔ an unmeasurable surface REFUSES rather than guessing a scale', () => {
    // happy-dom's own zero rect, left un-stubbed: every pixel of travel would be an infinite
    // number of metres, and a room drawn from that number would be a fabrication.
    seedProgramme();
    const panel = mountRoomProgrammePanel(host, deps());
    const before = getRoomProgramme().entries.length;
    toggle(host).click();
    const svg = host.querySelector<SVGSVGElement>(
      `[data-testid="${ROOM_PROGRAMME_PREVIEW_TESTID}"] svg`)!;
    svg.dispatchEvent(ptr('pointerdown', { clientX: 20, clientY: 20 }));
    svg.dispatchEvent(ptr('pointerup', { clientX: 80, clientY: 60 }));
    expect(getRoomProgramme().entries).toHaveLength(before);
    expect(statusText(host)).toContain('cannot tell where you drew');
    panel.dispose();
  });
});

describe('§ROOM-DRAW-NEW — ONE POINTER, THREE GESTURES, and the arbitration is capture-phase', () => {
  const seams = (h: HTMLElement): SVGLineElement[] =>
    [...h.querySelectorAll<SVGLineElement>(
      `[data-testid="${ROOM_PROGRAMME_PREVIEW_TESTID}"] line[${ROOM_SEAM_A_ATTR}]`)];

  /** Drag one party wall by `transferM2`, exactly as the sibling spec does. */
  function dragWall(h: HTMLElement, line: SVGLineElement, transferM2: number): void {
    const svg = armPlan(h);
    const H = Number((svg.getAttribute('viewBox') ?? '0 0 300 125').split(' ')[3]);
    const vbPerMx = (VIEWBOX_W - 8) / 24;
    const vbPerMz = (H - 8) / 10;
    const [nx, nz] = (line.getAttribute(ROOM_SEAM_NORMAL_ATTR) ?? '0,0').split(',').map(Number);
    const offsetM = transferM2 / Number(line.getAttribute(ROOM_SEAM_LENGTH_ATTR));
    const p = { clientX: offsetM * (nx ?? 0) * vbPerMx, clientY: offsetM * (nz ?? 0) * vbPerMz };
    line.dispatchEvent(ptr('pointerdown', { clientX: 0, clientY: 0 }));
    svg.dispatchEvent(ptr('pointermove', p));
    svg.dispatchEvent(ptr('pointerup', p));
  }

  it('⭐ NEGATIVE CONTROL: with draw DISARMED the party-wall drag still works', () => {
    // The third gesture must be invisible to the other two when it is off. Without this, a green
    // "draw works" suite could be hiding a wall drag this lane silently killed.
    seedProgramme();
    const panel = mountRoomProgrammePanel(host, deps());
    const line = seams(host)[0]!;
    const a = line.getAttribute(ROOM_SEAM_A_ATTR)!;
    const before = getRoomProgramme().entries.find((e) => e.id === a)!.targetAreaM2;
    dragWall(host, line, 3);
    expect(getRoomProgramme().entries.find((e) => e.id === a)!.targetAreaM2).not.toBe(before);
    panel.dispose();
  });

  it('⛔ with draw ARMED, a press on a party wall starts the DRAWING and not the wall drag', () => {
    // ⭐ THE WHOLE ARBITRATION IS ONE `stopPropagation()` IN THE CAPTURE PHASE. If it were wrong,
    // one press would start two gestures with one pointer, and the areas below would move twice.
    seedProgramme();
    const panel = mountRoomProgrammePanel(host, deps());
    toggle(host).click();
    const line = seams(host)[0]!;
    const a = line.getAttribute(ROOM_SEAM_A_ATTR)!;
    const b = line.getAttribute(ROOM_SEAM_B_ATTR)!;
    const areaA = getRoomProgramme().entries.find((e) => e.id === a)!.targetAreaM2;
    const areaB = getRoomProgramme().entries.find((e) => e.id === b)!.targetAreaM2;
    const n = getRoomProgramme().entries.length;
    dragWall(host, line, 3);
    // Neither of the wall's two rooms moved: the wall gesture never started.
    expect(getRoomProgramme().entries.find((e) => e.id === a)!.targetAreaM2).toBe(areaA);
    expect(getRoomProgramme().entries.find((e) => e.id === b)!.targetAreaM2).toBe(areaB);
    // And the drawing DID: either a room was added, or it was refused with a reason — never
    // silence. (The tiny travel above draws a sliver, so the refusal is the expected arm.)
    expect(getRoomProgramme().entries.length === n + 1 || statusText(host).length > 0).toBe(true);
    panel.dispose();
  });
});
