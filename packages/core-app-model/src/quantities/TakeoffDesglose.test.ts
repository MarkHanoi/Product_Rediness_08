/**
 * TakeoffDesglose — the per-element breakdown, and the two families that were
 * COUNTED and are now MEASURED.
 *
 * §TAKEOFF-DESGLOSE (L-4800) · §OPENING-MEASURED-NOT-COUNTED (L-4810) ·
 * §STAIR-MEASURED-NOT-COUNTED (L-4811) · §MATERIAL-ATTRIBUTION-REASONS (L-4820)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ THESE SUITES ASSERT RULES, NOT LITERALS, WHEREVER A RULE EXISTS
 * ─────────────────────────────────────────────────────────────────────────────
 * `desgloseSumsToLineTotal` is the shape to copy: it says "the total is the sum
 * of the rows" and returns the offending codes. A test that pinned `13.11` for
 * that relation would go red the first time a fixture gained a wall — for a
 * reason that is not a defect.
 *
 * Where a NUMBER is asserted it is one derived BY HAND in the comment above it,
 * never by running the code under test — a fake built from the header cannot
 * falsify the header (MEMORY §fake-more-capable-than-real).
 */

import { describe, it, expect } from 'vitest';
import type { WallData } from '@pryzm/geometry-wall';
import { computeTakeoff, openingPerimeter } from './QuantityTakeoff.js';
import type { OpeningElementLike, StairLike, TakeoffStores } from './QuantityTakeoff.js';
import {
  desgloseSumsToLineTotal,
  elementIdsMatchContributions,
  everyUnattributedLineStatesItsReason,
} from './TakeoffTypes.js';
import type { TakeoffResult } from './TakeoffTypes.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function wall(over: Partial<WallData> & { id: string }): WallData {
  return {
    type: 'wall',
    baseLine: [{ x: 0, y: 0, z: 0 }, { x: 5, y: 0, z: 0 }],
    height: 3,
    thickness: 0.2,
    baseOffset: 0,
    levelId: 'L0',
    childrenIds: [],
    openings: [],
    properties: {},
  } as unknown as WallData;
}

function withWall(over: Partial<WallData> & { id: string }): WallData {
  return { ...wall(over), ...over } as WallData;
}

const EMPTY: TakeoffStores = {
  walls: null, rooms: null, floors: null, ceilings: null, roofs: null, slabs: null,
  columns: null, beams: null, handrails: null, stairs: null,
  plumbing: null, furniture: null, curtainWalls: null, doors: null, windows: null,
  wallTypeName: () => undefined,
  wallTypeLayers: () => null,
  roomFinishes: null, boundingWalls: null,
};

function bag(over: Partial<TakeoffStores>): TakeoffStores {
  return { ...EMPTY, ...over };
}

function line(r: TakeoffResult, prefix: string) {
  return r.lines.find((l) => l.code.startsWith(prefix));
}

// ═════════════════════════════════════════════════════════════════════════════
// 1 · THE DESGLOSE — one row per element, and the total IS their sum
// ═════════════════════════════════════════════════════════════════════════════

describe('§TAKEOFF-DESGLOSE — a line carries one row per element', () => {
  it('keeps the PER-ELEMENT quantity, which the engine previously summed away', () => {
    // Three walls of the same type and thickness collapse into ONE line code.
    // 5 × 3 = 15.00 · 4 × 3 = 12.00 · 2 × 3 = 6.00 m²; the line reads 33.00.
    const walls = [
      withWall({ id: 'w1' }),
      withWall({ id: 'w2', baseLine: [{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }] as WallData['baseLine'] }),
      withWall({ id: 'w3', baseLine: [{ x: 0, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }] as WallData['baseLine'] }),
    ];
    const r = computeTakeoff(bag({ walls: { getAll: () => walls } }));
    const l = line(r, 'WALL.')!;
    expect(l.quantity).toBeCloseTo(33, 4);
    expect(l.contributions).toHaveLength(3);
    expect(l.contributions.map((c) => c.elementId)).toEqual(['w1', 'w2', 'w3']);
    expect(l.contributions.map((c) => c.quantity)).toEqual([15, 12, 6]);
  });

  it('⭐ THE RULE: every line total equals the sum of its own rows', () => {
    const walls = [
      withWall({
        id: 'w1',
        openings: [{ id: 'o1', elementId: 'd1', type: 'door', doorType: 'single', offset: 2, width: 0.9, height: 2.1, sillHeight: 0 }],
      } as Partial<WallData> & { id: string }),
      withWall({ id: 'w2', baseLine: [{ x: 0, y: 0, z: 0 }, { x: 3.33, y: 0, z: 0 }] as WallData['baseLine'] }),
    ];
    const r = computeTakeoff(bag({ walls: { getAll: () => walls } }));
    expect(desgloseSumsToLineTotal(r.lines)).toEqual([]);
    expect(elementIdsMatchContributions(r.lines)).toEqual([]);
  });

  it('carries the element LEVEL and MARK, and reports an absent mark as null — never as a placeholder', () => {
    const walls = [
      withWall({ id: 'w1', levelId: 'L2', properties: { mark: 'W-101' } } as unknown as Partial<WallData> & { id: string }),
      withWall({ id: 'w2', levelId: 'L2' }),
    ];
    const r = computeTakeoff(bag({ walls: { getAll: () => walls } }));
    const rows = line(r, 'WALL.')!.contributions;
    expect(rows[0].mark).toBe('W-101');
    // ⛔ NOT '—', NOT the id, NOT ''. An unmarked wall must READ as unmarked:
    // a placeholder would make it look cross-referenceable to a drawing.
    expect(rows[1].mark).toBeNull();
    expect(rows.every((c) => c.levelId === 'L2')).toBe(true);
  });

  it('drops a DEGENERATE row rather than printing 0.00, and the total still equals the visible sum', () => {
    // A 0.00005 m long wall rounds to 0.0000 m² at the engine's 1e-4 grid.
    const walls = [
      withWall({ id: 'w1' }),
      withWall({ id: 'wTiny', baseLine: [{ x: 0, y: 0, z: 0 }, { x: 0.00001, y: 0, z: 0 }] as WallData['baseLine'] }),
    ];
    const r = computeTakeoff(bag({ walls: { getAll: () => walls } }));
    const l = line(r, 'WALL.')!;
    expect(l.contributions.map((c) => c.elementId)).toEqual(['w1']);
    expect(desgloseSumsToLineTotal(r.lines)).toEqual([]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2 · DOORS AND WINDOWS — measured, not merely counted
// ═════════════════════════════════════════════════════════════════════════════

const DOOR_OPENING = {
  id: 'o1', elementId: 'd1', type: 'door' as const, doorType: 'single' as const,
  offset: 2, width: 0.9, height: 2.1, sillHeight: 0,
};

function doorRec(over: Partial<OpeningElementLike> = {}): OpeningElementLike {
  return { id: 'd1', levelId: 'L0', wallId: 'w1', width: 0.9, height: 2.1, frameWidth: 0.05, ...over };
}

function secondary(r: TakeoffResult, prefix: string, label: string) {
  return line(r, prefix)?.secondary.find((s) => s.label === label);
}

describe('§OPENING-MEASURED-NOT-COUNTED — the coverage card was the specification', () => {
  const walls = () => [withWall({ id: 'w1', openings: [DOOR_OPENING] } as Partial<WallData> & { id: string })];

  it('measures the STRUCTURAL OPENING AREA and the FRAME PERIMETER on the outline that cuts the mesh', () => {
    const r = computeTakeoff(bag({ walls: { getAll: () => walls() }, doors: { getAll: () => [doorRec()] } }));
    // void  = 0.900 × 2.100 = 1.8900 m²
    // perim = 2 × (0.900 + 2.100) = 6.0000 m
    expect(secondary(r, 'DOOR.', 'Structural opening area')!.value).toBeCloseTo(1.89, 4);
    expect(secondary(r, 'DOOR.', 'Frame / lining perimeter')!.value).toBeCloseTo(6, 4);
  });

  it('measures the REVEAL AREA as perimeter × host wall thickness', () => {
    const r = computeTakeoff(bag({ walls: { getAll: () => walls() }, doors: { getAll: () => [doorRec()] } }));
    // 6.0000 m × 0.200 m = 1.2000 m²
    expect(secondary(r, 'DOOR.', 'Reveal area (perimeter × host wall thickness)')!.value).toBeCloseTo(1.2, 4);
  });

  it('measures the LEAF AREA clear of the frame, from the joinery record\'s own frameWidth', () => {
    const r = computeTakeoff(bag({ walls: { getAll: () => walls() }, doors: { getAll: () => [doorRec()] } }));
    // (0.900 − 2 × 0.050) × (2.100 − 2 × 0.050) = 0.800 × 2.000 = 1.6000 m²
    expect(secondary(r, 'DOOR.', 'Leaf area (clear of frame)')!.value).toBeCloseTo(1.6, 4);
  });

  it('⛔ REFUSES the leaf area with a NAMED reason when no joinery record exists — never assumes a frame width', () => {
    const r = computeTakeoff(bag({ walls: { getAll: () => walls() }, doors: { getAll: () => [] } }));
    expect(secondary(r, 'DOOR.', 'Leaf area (clear of frame)')).toBeUndefined();
    expect(line(r, 'DOOR.')!.qualifiers.join(' ')).toContain('no joinery element record');
  });

  it('⛔ REFUSES the leaf area on an ARCHED head — insetting that outline is a polygon offset this engine does not do', () => {
    const arched = [withWall({
      id: 'w1',
      openings: [{ ...DOOR_OPENING, openingProfile: 'round-arch' }],
    } as unknown as Partial<WallData> & { id: string })];
    const r = computeTakeoff(bag({ walls: { getAll: () => arched }, doors: { getAll: () => [doorRec()] } }));
    expect(secondary(r, 'DOOR.', 'Leaf area (clear of frame)')).toBeUndefined();
    expect(line(r, 'DOOR.')!.qualifiers.join(' ')).toContain('polygon offset');

    // ⚠ CORRECTION, RECORDED RATHER THAN DELETED (2026-08-22, lane MEDI14).
    // This assertion was first written as `toBeGreaterThan(6)`, on the belief
    // that "an arch is longer than a rectangle". IT WENT RED AT 5.6117, AND THE
    // TEST WAS WRONG, NOT THE ENGINE. A round arch does not ADD to the rectangle
    // — it REPLACES the two upper corners and the full-height jambs with a
    // shorter path:
    //     jambs  2 × 1.650 (springing at 2.100 − 0.450)  = 3.3000
    //   + sill   0.900                                    = 0.9000
    //   + arc    π × 0.450                                = 1.4137
    //                                                       ─────── 5.6137 m
    // against the rectangle's 2 × (0.900 + 2.100) = 6.0000 m. The measured
    // 5.6117 is the TESSELLATED arc, which is a chord path and therefore
    // slightly SHORTER than the true π r — exactly as it should be, because the
    // frame is fitted to the polygon the mesh is cut with, not to the ideal
    // curve. The real rule is "the arched perimeter is the outline's own, and it
    // is NOT the rectangle's", so that is what is asserted.
    const perim = secondary(r, 'DOOR.', 'Frame / lining perimeter')!.value;
    expect(perim).not.toBeCloseTo(6, 2);
    expect(perim).toBeGreaterThan(3.3 + 0.9);          // longer than jambs + sill alone
    expect(perim).toBeLessThanOrEqual(3.3 + 0.9 + Math.PI * 0.45 + 1e-9);
    expect(perim).toBeCloseTo(3.3 + 0.9 + Math.PI * 0.45, 1);
  });

  it('FIRE RATING joins the code only when the model states one, so an unrated door keeps the code its rate was typed against', () => {
    const unrated = computeTakeoff(bag({ walls: { getAll: () => walls() }, doors: { getAll: () => [doorRec()] } }));
    const rated = computeTakeoff(bag({
      walls: { getAll: () => walls() },
      doors: { getAll: () => [doorRec({ fireRating: 'FD30' })] },
    }));
    expect(line(unrated, 'DOOR.')!.code).toBe('DOOR.single.rectangular.900x2100');
    expect(line(rated, 'DOOR.')!.code).toBe('DOOR.single.rectangular.900x2100.fd30');
    expect(line(rated, 'DOOR.')!.description).toContain('FD30');
  });

  it('the coverage row is no longer COUNTED_ONLY, and names what is STILL not measured', () => {
    const r = computeTakeoff(bag({ walls: { getAll: () => walls() }, doors: { getAll: () => [doorRec()] } }));
    const row = r.coverage.find((c) => c.family === 'Doors')!;
    expect(row.state).toBe('MEASURED');
    expect(row.note).toContain('ironmongery');
    expect(row.note).toContain('Fire rating IS measured');
  });

  it('a WINDOW reports GLAZED area, not leaf area — the two are different words for different trades', () => {
    const win = [withWall({
      id: 'w1',
      openings: [{ id: 'o2', elementId: 'win1', type: 'window' as const, windowType: 'single' as const, offset: 1, width: 1.2, height: 1.4, sillHeight: 0.9 }],
    } as unknown as Partial<WallData> & { id: string })];
    const r = computeTakeoff(bag({
      walls: { getAll: () => win },
      windows: { getAll: () => [doorRec({ id: 'win1', width: 1.2, height: 1.4, frameWidth: 0.06 })] },
    }));
    // (1.200 − 0.120) × (1.400 − 0.120) = 1.080 × 1.280 = 1.3824 m²
    expect(secondary(r, 'WINDOW.', 'Glazed area (clear of frame)')!.value).toBeCloseTo(1.3824, 4);
    expect(secondary(r, 'WINDOW.', 'Leaf area (clear of frame)')).toBeUndefined();
  });
});

describe('openingPerimeter refuses rather than approximating', () => {
  it('returns the rectangle perimeter exactly', () => {
    expect(openingPerimeter({ width: 0.9, height: 2.1, offset: 0, sillHeight: 0, openingProfile: 'rectangular' })!)
      .toBeCloseTo(6, 6);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3 · STAIRS — risers, treads, stringers, landings
// ═════════════════════════════════════════════════════════════════════════════

function stair(over: Partial<StairLike> = {}): StairLike {
  return {
    id: 's1',
    levelId: 'L0',
    shape: 'L',
    width: 1.0,
    riserHeight: 0.175,
    treadDepth: 0.28,
    riserCount: 16,
    flights: [{ riserCount: 8 }, { riserCount: 8 }],
    landings: [{ depth: 1.0 }],
    properties: { stringerType: 'closed', riserVisible: true, material: 'concrete', mark: 'ST-01' },
    ...over,
  };
}

describe('§STAIR-MEASURED-NOT-COUNTED — the flights and landings were already in the model', () => {
  it('counts RISERS across flights and TREADS as risers − 1 per flight', () => {
    const r = computeTakeoff(bag({ stairs: { getAll: () => [stair()] } }));
    // 8 + 8 = 16 risers; (8−1) + (8−1) = 14 treads — the last riser of each
    // flight lands on the landing or the floor above, so it has no tread.
    expect(secondary(r, 'STAIR.', 'Risers')!.value).toBe(16);
    expect(secondary(r, 'STAIR.', 'Treads')!.value).toBe(14);
  });

  it('measures TREAD AREA, TOTAL RISE and PLAN RUN', () => {
    const r = computeTakeoff(bag({ stairs: { getAll: () => [stair()] } }));
    // treads 14 × width 1.000 × going 0.280 = 3.9200 m²
    // rise   16 × 0.175 = 2.8000 m · run 14 × 0.280 = 3.9200 m
    expect(secondary(r, 'STAIR.', 'Tread area')!.value).toBeCloseTo(3.92, 4);
    expect(secondary(r, 'STAIR.', 'Total rise')!.value).toBeCloseTo(2.8, 4);
    expect(secondary(r, 'STAIR.', 'Plan run (going)')!.value).toBeCloseTo(3.92, 4);
  });

  it('measures STRINGER LENGTH along the flight slope, two per flight for a closed stringer', () => {
    const r = computeTakeoff(bag({ stairs: { getAll: () => [stair()] } }));
    // per flight: hypot(8 × 0.175, 7 × 0.280) = hypot(1.4000, 1.9600) = 2.4086510…
    // × 2 stringers × 2 flights = 9.6346042… m
    expect(secondary(r, 'STAIR.', 'Stringer length')!.value).toBeCloseTo(9.6346, 3);
  });

  it('measures LANDING AREA as depth × stair width', () => {
    const r = computeTakeoff(bag({ stairs: { getAll: () => [stair()] } }));
    expect(secondary(r, 'STAIR.', 'Landing area')!.value).toBeCloseTo(1, 4);
  });

  it('⛔ an OPEN-RISER stair has NO riser face — that is an absence, and it is stated, not a zero', () => {
    const r = computeTakeoff(bag({
      stairs: { getAll: () => [stair({ properties: { ...stair().properties, riserVisible: false } })] },
    }));
    expect(secondary(r, 'STAIR.', 'Riser face area')).toBeUndefined();
    expect(line(r, 'STAIR.')!.qualifiers.join(' ')).toContain('open-riser');
  });

  it('a WINDER tread area is flagged as the approximation it is', () => {
    const r = computeTakeoff(bag({ stairs: { getAll: () => [stair({ shape: 'winder' })] } }));
    expect(line(r, 'STAIR.')!.qualifiers.join(' ')).toContain('WEDGE');
  });

  it('falls back to the stair\'s own riserCount when it declares no flights — the same fallback the mesh builder uses', () => {
    const r = computeTakeoff(bag({ stairs: { getAll: () => [stair({ flights: [], landings: [] })] } }));
    expect(secondary(r, 'STAIR.', 'Risers')!.value).toBe(16);
    expect(secondary(r, 'STAIR.', 'Treads')!.value).toBe(15);
  });

  it('the coverage row is MEASURED and names the concrete waist as the reason there is still no carbon figure', () => {
    const r = computeTakeoff(bag({ stairs: { getAll: () => [stair()] } }));
    const row = r.coverage.find((c) => c.family === 'Stairs')!;
    expect(row.state).toBe('MEASURED');
    expect(row.note).toContain('WAIST');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4 · MATERIAL ATTRIBUTION — a line that names no material must say WHY
// ═════════════════════════════════════════════════════════════════════════════

describe('§MATERIAL-ATTRIBUTION-REASONS — the upstream half of 6D', () => {
  it('⭐ THE RULE: no line may be unattributed AND silent about it', () => {
    const r = computeTakeoff(bag({
      walls: { getAll: () => [withWall({ id: 'w1', openings: [DOOR_OPENING] } as Partial<WallData> & { id: string })] },
      doors: { getAll: () => [doorRec()] },
      stairs: { getAll: () => [stair()] },
      furniture: { getAll: () => [{ id: 'f1', furnitureType: 'desk' }] },
      curtainWalls: { getAll: () => [{ id: 'cw1', height: 3, baseLine: [{ x: 0, z: 0 }, { x: 4, z: 0 }] }] },
    }));
    expect(everyUnattributedLineStatesItsReason(r.lines)).toEqual([]);
  });

  it('names the STAIR enum as the reason a stair reaches no catalogue material', () => {
    const r = computeTakeoff(bag({ stairs: { getAll: () => [stair()] } }));
    expect(line(r, 'STAIR.')!.materialGap).toContain('StairMaterial ENUM');
  });

  it('an ATTRIBUTED line carries no reason — the field is a gap explanation, not a note', () => {
    const walls = [withWall({ id: 'w1', systemTypeId: 'wt-1' } as unknown as Partial<WallData> & { id: string })];
    const r = computeTakeoff(bag({
      walls: { getAll: () => walls },
      wallTypeName: () => 'Blockwork 200',
      wallTypeLayers: () => [{ name: 'Blockwork', thickness: 0.2, materialId: 'blockwork-dense' }],
    }));
    const l = line(r, 'WALL.')!;
    expect(l.materialBreakdown).toHaveLength(1);
    expect(l.materialGap).toBeNull();
  });

  it('a wall whose type declares NO layers says so, and does not borrow a neighbour\'s material', () => {
    const walls = [withWall({ id: 'w1', systemTypeId: 'wt-empty' } as unknown as Partial<WallData> & { id: string })];
    const r = computeTakeoff(bag({
      walls: { getAll: () => walls },
      wallTypeName: () => 'Undefined type',
      wallTypeLayers: () => [],
    }));
    expect(line(r, 'WALL.')!.materialBreakdown).toHaveLength(0);
    expect(line(r, 'WALL.')!.materialGap).toContain('declares no layers');
  });
});
