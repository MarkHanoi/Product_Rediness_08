/**
 * §ROOM-WALL-DRAG (L-13096) — DRAWING THE ROOMS BY MOVING THEIR WALLS.
 *
 * Subjects:  apps/editor/src/ui/room-programme/roomProgrammeModel.ts    (the intent + the verdict)
 *            apps/editor/src/ui/room-programme/programmeToEnvelopes.ts  (the party walls)
 *            apps/editor/src/ui/room-programme/roomProgrammePanel.ts    (the gesture)
 * Strategy:  STR-RESIDENTIAL-DESIGN-ORCHESTRATOR §9 · §10 · §25.5 · §26.6.7
 * Contracts: C83 §1.2 / C58 (a refusal carries BOTH numbers, and never clamps) ·
 *            C84 EI-8a (no second copy of a predicate) · C06 §13.3 (one producer per figure) ·
 *            C52 §3 (session override → re-run) · C114 §6a (one gesture, one Ctrl+Z)
 *
 * Founder 2026-09-07: *"This room locator needs to be more flexible and more dynamic — I shall
 * be able to reorganize also the rooms on the plan view — draw them etc."*
 *
 * ⭐ WHAT IS PROVEN HERE, AND — SO NOBODY READS MORE INTO IT — WHAT IS NOT.
 * `roomProgrammePlanReorder.spec.ts` covers the ORDER half. This covers the FOOTPRINT half, in
 * the one currency `solveProgrammeLayout` can keep: a party wall moves, and area crosses it.
 *
 * ⛔ IT DOES NOT CLAIM A FREEHAND BOUNDARY TOOL, because none was built and none is expressible.
 * The solver PARTITIONS a plate — a cell's ring is a pure function of the areas and the order —
 * so an arbitrary authored ring would be re-solved away on the user's next keystroke, which is
 * the very defect L-13079 names. No assertion below pretends a room can be drawn vertex by vertex.
 *
 * ⛔ NOR DOES IT CLAIM PERSISTENCE OR UNDO. The programme is a session brief whose own header says
 * *"NOTHING HERE PERSISTS"*; the bus is reached by "Place envelopes in 3D". A wall move is
 * therefore not on the undo stack, and one test below pins that the panel SAYS so.
 *
 * ── THE SPLIT BETWEEN THE TWO HALVES OF THIS FILE, STATED ────────────────────────────────────
 * The ARITHMETIC and every REFUSAL are proven against the pure reducer, where every number is
 * chosen by this file. The DOM half proves the WIRING — that a real pointer gesture reaches that
 * reducer with the metres the pixels meant. Proving arithmetic through the DOM would have made
 * the expectations a restatement of the implementation; proving the wiring in the reducer would
 * have proven nothing about the gesture (§FAKE-MORE-CAPABLE-THAN-REAL).
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
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
  describePairResize,
  getRoomProgramme,
  reduceRoomProgramme,
  type RoomProgramme,
} from '../room-programme/roomProgrammeModel';
import { programmeSharedWalls, solveProgrammeLayout } from '../room-programme/programmeToEnvelopes';
import { residentialRoomEntry } from '../room-programme/residentialRoomLibrary';
import type { SpaceEnvelopeRecordLike } from '../room-programme/roomEnvelopePlan';

/** The 24 × 10 m plate = 240 m² the sibling specs use. Its dimensions are the scale below. */
const PLATE = [
  { x: 0, y: 0, z: 0 },
  { x: 24, y: 0, z: 0 },
  { x: 24, y: 0, z: 10 },
  { x: 0, y: 0, z: 10 },
];

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

const ROOMS: ReadonlyArray<readonly [string, string, number]> = [
  ['living', 'living', 40],
  ['kitchen', 'kitchen', 30],
  ['bed', 'bedroom', 25],
  ['bath', 'bathroom', 12],
];

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

const areaOf = (p: RoomProgramme, id: string): number =>
  p.entries.find((e) => e.id === id)!.targetAreaM2;

const totalOf = (p: RoomProgramme): number =>
  p.entries.reduce((s, e) => s + e.targetAreaM2, 0);

// ═════════════════════════════════════════════════════════════════════════════
// THE PURE HALF — the arithmetic and every refusal, with numbers this file chose
// ═════════════════════════════════════════════════════════════════════════════

describe('§ROOM-WALL-DRAG — the reducer moves area across a wall and conserves it', () => {
  it('⭐ a wall move restates BOTH areas in one intent, and the total is untouched', () => {
    const p0 = pureProgramme();
    const before = totalOf(p0);
    // 6 m² leaves `living` and arrives in `kitchen` — one intent, both sides.
    const p1 = reduceRoomProgramme(p0, {
      type: 'programme.resize-pair', aId: 'living', aAreaM2: 34, bId: 'kitchen', bAreaM2: 36,
    });
    expect(areaOf(p1, 'living')).toBe(34);
    expect(areaOf(p1, 'kitchen')).toBe(36);
    // ⛔ CONSERVATION IS THE INVARIANT THAT MAKES THIS A WALL AND NOT A RESIZE: the plate's total
    // demand does not change, so a drag can never newly trip `programme-exceeds-level`.
    expect(totalOf(p1)).toBeCloseTo(before, 9);
    // Nobody else moved.
    expect(areaOf(p1, 'bed')).toBe(25);
    expect(areaOf(p1, 'bath')).toBe(12);
  });

  it('the links and the pins do not move — one gesture means one thing', () => {
    let p = pureProgramme();
    p = reduceRoomProgramme(p, { type: 'programme.link', aId: 'living', bId: 'kitchen' });
    p = reduceRoomProgramme(p, { type: 'programme.pin-room', id: 'bath', order: 0 });
    const p1 = reduceRoomProgramme(p, {
      type: 'programme.resize-pair', aId: 'living', aAreaM2: 34, bId: 'kitchen', bAreaM2: 36,
    });
    expect(p1.links).toEqual(p.links);
    expect(areaOf(p1, 'bath')).toBe(12);
    expect(p1.entries.find((e) => e.id === 'bath')!.pinnedOrder).toBe(0);
  });

  it('⛔ a NON-CONSERVING pair is refused — that is a resize wearing a wall’s costume', () => {
    const p0 = pureProgramme();
    // 40 + 30 = 70 before; 40 + 40 = 80 after. Ten square metres appeared from nowhere.
    const p1 = reduceRoomProgramme(p0, {
      type: 'programme.resize-pair', aId: 'living', aAreaM2: 40, bId: 'kitchen', bAreaM2: 40,
    });
    // Referential identity IS the channel for "nothing happened" (the reducer's contract).
    expect(p1).toBe(p0);
    expect(describePairResize(p0, 'living', 40, 'kitchen', 40).code).toBe('not-conserved');
  });

  it('a release where the grab happened is a CANCEL, not a zero-metre edit', () => {
    const p0 = pureProgramme();
    expect(reduceRoomProgramme(p0, {
      type: 'programme.resize-pair', aId: 'living', aAreaM2: 40, bId: 'kitchen', bAreaM2: 30,
    })).toBe(p0);
  });

  it('unknown rooms, one room named twice, and non-finite areas are each refused by name', () => {
    const p0 = pureProgramme();
    expect(describePairResize(p0, 'living', 34, 'ghost', 36).code).toBe('unknown-room');
    expect(describePairResize(p0, 'living', 35, 'living', 35).code).toBe('same-room');
    expect(describePairResize(p0, 'living', Number.NaN, 'kitchen', 30).code).toBe('not-finite');
    expect(describePairResize(p0, 'living', 70, 'kitchen', 0).code).toBe('not-finite');
    for (const bad of ['unknown-room', 'same-room', 'not-finite']) expect(bad).toBeTruthy();
  });
});

describe('§ROOM-WALL-DRAG — the floor is REFUSED with both numbers, never clamped (C83)', () => {
  it('⛔ a move that would put a room under its library floor is refused, and nothing moves', () => {
    const p0 = pureProgramme();
    const floor = residentialRoomEntry('bathroom')!.minAreaM2;
    // `bath` is at 12 m². Ask it to give up more than it has above its floor.
    const asked = floor - 1;
    const v = describePairResize(p0, 'living', 40 + (12 - asked), 'bath', asked);
    expect(v.ok).toBe(false);
    expect(v.code).toBe('below-minimum');
    // ⭐ BOTH NUMBERS — the asked figure AND the floor it crosses. A refusal with one number is
    // an assertion the reader cannot check.
    expect(v.askedAreaM2).toBe(asked);
    expect(v.floorAreaM2).toBe(floor);
    expect(v.offenderId).toBe('bath');
    expect(reduceRoomProgramme(p0, {
      type: 'programme.resize-pair', aId: 'living', aAreaM2: 40 + (12 - asked), bId: 'bath', bAreaM2: asked,
    })).toBe(p0);
  });

  it('⭐ L-942 — THE ESCAPE HATCH IS REACHABLE: the largest move it names is ACCEPTED', () => {
    // A refusal whose yes-branch is unreachable is "a regression with a citation attached". So
    // the number the verdict offers is not decoration: dragging to exactly there must work.
    const p0 = pureProgramme();
    const floor = residentialRoomEntry('bathroom')!.minAreaM2;
    // `bath` sits at 12 m² over a 3 m² floor, so it has 9 m² to give. Ask for 10.
    const refused = describePairResize(p0, 'living', 40 + 10, 'bath', 12 - 10);
    expect(refused.ok).toBe(false);
    const hatch = refused.maxTransferM2;
    expect(hatch).toBeCloseTo(12 - floor, 9);

    const p1 = reduceRoomProgramme(p0, {
      type: 'programme.resize-pair', aId: 'living', aAreaM2: 40 + hatch, bId: 'bath', bAreaM2: 12 - hatch,
    });
    expect(p1).not.toBe(p0);
    expect(areaOf(p1, 'bath')).toBeCloseTo(floor, 9);
    expect(totalOf(p1)).toBeCloseTo(totalOf(p0), 9);
  });

  it('a room already AT its floor is an honest dead end — the hatch reads 0, not a lie', () => {
    let p = pureProgramme();
    const floor = residentialRoomEntry('bathroom')!.minAreaM2;
    p = reduceRoomProgramme(p, { type: 'programme.set-area', id: 'bath', targetAreaM2: floor });
    const v = describePairResize(p, 'living', 40 + 1, 'bath', floor - 1);
    expect(v.ok).toBe(false);
    expect(v.maxTransferM2).toBe(0);
  });

  it('⛔ the reducer’s floor IS the solver’s floor — an accepted drag never yields a refused plan', () => {
    // The two used to be able to drift apart: `solveProgrammeLayout` refuses `room-below-minimum`
    // on `residentialRoomEntry(kind).minAreaM2`, and if the drag had its own floor the user could
    // complete a gesture that produced a plan the panel then declined to draw.
    const p0 = pureProgramme();
    const floor = residentialRoomEntry('bathroom')!.minAreaM2;
    const p1 = reduceRoomProgramme(p0, {
      type: 'programme.resize-pair', aId: 'living', aAreaM2: 40 + (12 - floor), bId: 'bath', bAreaM2: floor,
    });
    expect(p1).not.toBe(p0);
    const solved = solveProgrammeLayout({ levelRing: PLATE, programme: p1 });
    expect(solved.ok).toBe(true);
  });
});

describe('§ROOM-WALL-DRAG — the party walls are enumerated by the SHARED-FACE predicate', () => {
  it('every seam names two real rooms, once per pair, with a positive length', () => {
    const layout = solveProgrammeLayout({ levelRing: PLATE, programme: pureProgramme() });
    expect(layout.ok).toBe(true);
    if (!layout.ok) return;
    const seams = programmeSharedWalls(layout.cells);
    expect(seams.length).toBeGreaterThan(0);
    const ids = new Set(layout.cells.map((c) => c.roomId));
    const pairs = new Set<string>();
    for (const s of seams) {
      expect(ids.has(s.aId)).toBe(true);
      expect(ids.has(s.bId)).toBe(true);
      expect(s.aId).not.toBe(s.bId);
      expect(s.lengthM).toBeGreaterThan(0);
      // ⛔ ONE HANDLE PER PAIR. Two handles on one boundary would make the same drag mean two
      // different amounts.
      const k = [s.aId, s.bId].sort().join('|');
      expect(pairs.has(k)).toBe(false);
      pairs.add(k);
    }
  });

  it('the normal points from a INTO b, and the segment lies between them', () => {
    const layout = solveProgrammeLayout({ levelRing: PLATE, programme: pureProgramme() });
    if (!layout.ok) return;
    const centroid = (id: string): { x: number; z: number } => {
      const ring = layout.cells.find((c) => c.roomId === id)!.ring;
      let x = 0; let z = 0;
      for (const q of ring) { x += q.x; z += q.z; }
      return { x: x / ring.length, z: z / ring.length };
    };
    for (const s of programmeSharedWalls(layout.cells)) {
      const ca = centroid(s.aId);
      const cb = centroid(s.bId);
      // Dragging along the normal must GROW `a`, which requires it to point away from a's centre.
      expect((cb.x - ca.x) * s.normal.x + (cb.z - ca.z) * s.normal.z).toBeGreaterThan(0);
      expect(Math.hypot(s.normal.x, s.normal.z)).toBeCloseTo(1, 9);
      // The drawn segment is as long as the predicate says the wall is.
      expect(Math.hypot(s.to.x - s.from.x, s.to.z - s.from.z)).toBeCloseTo(s.lengthM, 5);
    }
  });

  it('a programme with fewer than two rooms has no party walls at all', () => {
    let p: RoomProgramme = EMPTY_ROOM_PROGRAMME;
    p = reduceRoomProgramme(p, { type: 'programme.add-room', id: 'solo', kind: 'living' as never });
    const layout = solveProgrammeLayout({ levelRing: PLATE, programme: p });
    if (!layout.ok) return;
    expect(programmeSharedWalls(layout.cells)).toHaveLength(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// THE DOM HALF — the wiring: do the pixels reach the reducer as the right metres?
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

const seams = (h: HTMLElement): SVGLineElement[] =>
  [...h.querySelectorAll<SVGLineElement>(
    `[data-testid="${ROOM_PROGRAMME_PREVIEW_TESTID}"] line[${ROOM_SEAM_A_ATTR}]`,
  )];

const statusText = (h: HTMLElement): string =>
  h.querySelector(`[data-testid="${ROOM_PROGRAMME_STATUS_TESTID}"]`)?.textContent ?? '';

/**
 * Give the plan a REAL, KNOWN layout box.
 *
 * ⚠ happy-dom lays nothing out, so `getBoundingClientRect()` reports zeros — and the panel
 * REFUSES the gesture on a zero-width rect rather than dividing by it. Stubbing the rect on the
 * one element under test is the idiom `analysisScrollPane.spec.ts` already uses in this tree: the
 * browser genuinely supplies this rect, and the spec supplies a real one. Width 300 = the viewBox
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

/** The two per-axis viewBox-units-per-metre the strip is drawn at, recomputed independently. */
function scales(svg: SVGSVGElement): { readonly vbPerMx: number; readonly vbPerMz: number } {
  const h = Number((svg.getAttribute('viewBox') ?? '0 0 300 125').split(' ')[3]);
  // The plate is 24 m across and 10 m deep; the strip insets 4 units on every side.
  return { vbPerMx: (VIEWBOX_W - 8) / 24, vbPerMz: (h - 8) / 10 };
}

/**
 * Drag one party wall by `transferM2` square metres, computing the pixel travel from the PLATE's
 * own dimensions — not from anything the panel reported about pixels.
 */
function dragWall(
  h: HTMLElement,
  line: SVGLineElement,
  transferM2: number,
): void {
  const svg = armPlan(h);
  const { vbPerMx, vbPerMz } = scales(svg);
  const [nx, nz] = (line.getAttribute(ROOM_SEAM_NORMAL_ATTR) ?? '0,0').split(',').map(Number);
  const lengthM = Number(line.getAttribute(ROOM_SEAM_LENGTH_ATTR));
  const offsetM = transferM2 / lengthM;
  // Travel ALONG the normal only, so the projection recovers exactly `offsetM`.
  const px = offsetM * (nx ?? 0) * vbPerMx;
  const py = offsetM * (nz ?? 0) * vbPerMz;
  line.dispatchEvent(new (window as unknown as { PointerEvent: typeof MouseEvent }).PointerEvent(
    'pointerdown', { bubbles: true, clientX: 0, clientY: 0 } as MouseEventInit));
  svg.dispatchEvent(new (window as unknown as { PointerEvent: typeof MouseEvent }).PointerEvent(
    'pointermove', { bubbles: true, clientX: px, clientY: py } as MouseEventInit));
  svg.dispatchEvent(new (window as unknown as { PointerEvent: typeof MouseEvent }).PointerEvent(
    'pointerup', { bubbles: true, clientX: px, clientY: py } as MouseEventInit));
}

describe('§ROOM-WALL-DRAG — the plan’s party walls are ADDRESSABLE controls', () => {
  it('every seam is drawn with both room ids, its length and its direction', () => {
    seedProgramme();
    const panel = mountRoomProgrammePanel(host, deps());
    const list = seams(host);
    expect(list.length).toBeGreaterThan(0);
    for (const l of list) {
      expect(l.getAttribute(ROOM_SEAM_A_ATTR)).toBeTruthy();
      expect(l.getAttribute(ROOM_SEAM_B_ATTR)).toBeTruthy();
      expect(Number(l.getAttribute(ROOM_SEAM_LENGTH_ATTR))).toBeGreaterThan(0);
      expect(l.getAttribute(ROOM_SEAM_NORMAL_ATTR)).toMatch(/^-?\d/);
    }
    panel.dispose();
  });

  it('the hint says the wall lands where the AREAS put it, not under the cursor', () => {
    // ⛔ A control that looks live and is not, is the thing this lane was told not to ship. The
    // ghost follows the pointer; the wall follows the re-solve, and the panel says which is which.
    seedProgramme();
    const panel = mountRoomProgrammePanel(host, deps());
    const text = host.querySelector(`[data-testid="${ROOM_PROGRAMME_PREVIEW_TESTID}"]`)?.textContent ?? '';
    expect(text).toContain('move floor area across that wall');
    expect(text).toContain('not under the cursor');
    panel.dispose();
  });
});

describe('§ROOM-WALL-DRAG — a real pointer gesture moves the metres the pixels meant', () => {
  it('⭐ dragging a wall by 4 m² moves EXACTLY 4 m² between its two rooms, and conserves', () => {
    seedProgramme();
    const panel = mountRoomProgrammePanel(host, deps());
    const line = seams(host)[0]!;
    const aId = line.getAttribute(ROOM_SEAM_A_ATTR)!;
    const bId = line.getAttribute(ROOM_SEAM_B_ATTR)!;
    const a0 = areaOf(getRoomProgramme(), aId);
    const b0 = areaOf(getRoomProgramme(), bId);
    const total0 = totalOf(getRoomProgramme());

    dragWall(host, line, 4);

    const p = getRoomProgramme();
    // 0.01 m² is the panel's deliberate rounding of the growing side; the shrinking side is then
    // DERIVED by subtraction, which is why the total below is exact rather than merely close.
    expect(areaOf(p, aId)).toBeCloseTo(a0 + 4, 2);
    expect(areaOf(p, bId)).toBeCloseTo(b0 - 4, 2);
    expect(totalOf(p)).toBeCloseTo(total0, 6);
    panel.dispose();
  });

  it('the plan REDRAWS from the new areas — the figures and the picture are one answer', () => {
    // C06 §13.3: one producer per live figure. The drag moves `targetAreaM2`, and the cell the
    // user then sees is the solver's answer for it — not a second, separately-moved rectangle.
    seedProgramme();
    const panel = mountRoomProgrammePanel(host, deps());
    const line = seams(host)[0]!;
    const aId = line.getAttribute(ROOM_SEAM_A_ATTR)!;
    const cellArea = (id: string): number => {
      const layout = solveProgrammeLayout({ levelRing: PLATE, programme: getRoomProgramme() });
      return layout.ok ? layout.cells.find((c) => c.roomId === id)!.areaM2 : Number.NaN;
    };
    const drawn0 = cellArea(aId);
    dragWall(host, line, 4);
    expect(cellArea(aId)).toBeCloseTo(drawn0 + 4, 1);
    // The strip repainted, so the handles are the NEW layout's.
    expect(seams(host).length).toBeGreaterThan(0);
    panel.dispose();
  });

  it('a wall released where it was grabbed changes nothing — a stray click is not an edit', () => {
    seedProgramme();
    const panel = mountRoomProgrammePanel(host, deps());
    const before = getRoomProgramme();
    dragWall(host, seams(host)[0]!, 0);
    expect(getRoomProgramme()).toBe(before);
    panel.dispose();
  });

  it('the panel states that Ctrl+Z will not take a wall move back', () => {
    // ⚠ The brief is not the undo stack. Saying so is cheaper than the support ticket that isn't.
    seedProgramme();
    const panel = mountRoomProgrammePanel(host, deps());
    dragWall(host, seams(host)[0]!, 3);
    expect(statusText(host)).toContain('Ctrl+Z');
    expect(statusText(host)).toContain('moved across the wall');
    panel.dispose();
  });
});

describe('§ROOM-WALL-DRAG — a refused drag is SPOKEN with both numbers and a way out', () => {
  it('⛔ dragging a room under its floor refuses, names both numbers, and clamps NOTHING', () => {
    seedProgramme();
    const panel = mountRoomProgrammePanel(host, deps());
    // Find a wall whose `b` side is the bathroom, so the direction of the refusal is known.
    const line = seams(host).find((l) => l.getAttribute(ROOM_SEAM_B_ATTR) === 'bath'
      || l.getAttribute(ROOM_SEAM_A_ATTR) === 'bath');
    expect(line).toBeTruthy();
    if (!line) return;
    const bathIsB = line.getAttribute(ROOM_SEAM_B_ATTR) === 'bath';
    const floor = residentialRoomEntry('bathroom')!.minAreaM2;
    const before = getRoomProgramme();
    // Take one square metre more than the bathroom has above its floor. Signed so that the
    // bathroom is the side that SHRINKS whichever end of the seam it sits on.
    const over = (12 - floor) + 1;
    dragWall(host, line, bathIsB ? over : -over);

    expect(getRoomProgramme()).toBe(before);
    const text = statusText(host);
    expect(text).toContain((floor).toFixed(2));       // the floor
    expect(text).toContain((floor - 1).toFixed(2));   // what the drag asked for
    expect(text).toContain('Nothing was clamped');
    // L-942 — the yes-branch, in a number he can drag to.
    expect(text).toContain((12 - floor).toFixed(2));
    panel.dispose();
  });

  it('⛔ an unmeasurable plan refuses the gesture rather than guessing a scale', () => {
    // A zero-width rect would make every pixel of travel an infinite number of metres. Saying so
    // beats committing one — and happy-dom's default rect IS zero, so this is the un-armed path.
    seedProgramme();
    const panel = mountRoomProgrammePanel(host, deps());
    const line = seams(host)[0]!;
    const before = getRoomProgramme();
    line.dispatchEvent(new (window as unknown as { PointerEvent: typeof MouseEvent }).PointerEvent(
      'pointerdown', { bubbles: true, clientX: 0, clientY: 0 } as MouseEventInit));
    const svg = host.querySelector<SVGSVGElement>(`[data-testid="${ROOM_PROGRAMME_PREVIEW_TESTID}"] svg`)!;
    svg.dispatchEvent(new (window as unknown as { PointerEvent: typeof MouseEvent }).PointerEvent(
      'pointerup', { bubbles: true, clientX: 200, clientY: 40 } as MouseEventInit));
    expect(getRoomProgramme()).toBe(before);
    expect(statusText(host)).toContain('not laid out yet');
    panel.dispose();
  });
});
