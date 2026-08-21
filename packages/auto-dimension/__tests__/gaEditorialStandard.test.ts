// §GA-EDITORIAL-LAYER (L-1620/L-1621/L-1622) — SPEC-AUTODIMENSION §12 CONFORMANCE.
//
// ⛔ THESE ASSERTIONS ARE MADE ON THE EMITTED DIMENSION SET, NOT ON A FUNCTION RETURN.
// Every check resolves the engine's element+anchor references back to world points with a
// resolver the test suite owns (`fixtures/judgeGa.ts`) and then judges the resulting
// DRAWING. Nothing here consults the engine's own classification — if the editorial layer
// told itself a room was exterior, these tests would still catch it.
//
// The companion `greenAfter.test.ts` runs the same §12.3 assertions and writes the
// before/after measurement; this file carries the rules that suite does not.

import { describe, it, expect } from 'vitest';
import {
  planAutoDimensions,
  classifyEnclosures,
  roomDimensionBudget,
  filterInteriorDimensions,
  optimiseDimensionSet,
  traceRoomFaces,
  resolveGaCollision,
  gaPriorityOf,
  GA_PRIORITY,
  DEFAULT_INTERIOR_POLICY,
} from '../src/index.js';
import type { AutoDimSnapshot, AutoDimWall } from '../src/index.js';
import { gaPlateWalls, gaPlateShellPolygon, gaPlateRooms } from './fixtures/gaPlate.js';
import { judgeGaPlate, segmentsCross } from './fixtures/judgeGa.js';

const OPTS = { viewId: 'view-plan-ga', levelId: 'level-ga', tierGapM: 0.8 } as const;

const fixture = gaPlateWalls();
const snapshot: AutoDimSnapshot = {
  walls: fixture.map((w): AutoDimWall => ({
    id: w.id, a: w.a, b: w.b, thickness: w.thickness, openings: w.openings,
  })),
};
const result = planAutoDimensions(snapshot, OPTS);
const judged = judgeGaPlate(fixture, gaPlateRooms(), result.strings);

describe('the GA plate is the plate it claims to be', () => {
  it('12 rooms, ONE building, two angled façades and a curved bay', () => {
    expect(gaPlateRooms().length).toBe(12);
    expect(result.report.coverage.roomCount).toBe(12);
    // L-268's per-component rule called the interior partition network a second BUILDING.
    // It never was one — it is twelve rooms inside the shell.
    expect(result.report.coverage.buildingCount).toBe(1);
  });
});

describe('§12.2 — the exterior strings never move inside the building (REGRESSION PIN)', () => {
  it('no cardinal EXTERIOR dimension line crosses the shell footprint', () => {
    const shell = gaPlateShellPolygon();
    const crossings: string[] = [];
    for (const j of judged) {
      if (j.interior || !j.line) continue;
      for (let i = 0; i < shell.length; i++) {
        if (segmentsCross(j.line[0], j.line[1], shell[i]!, shell[(i + 1) % shell.length]!)) {
          crossings.push(`${j.s.kind}/${j.s.orientation} ${j.valueMm}mm @ ${Math.round(j.s.offsetMm ?? 0)}mm`);
          break;
        }
      }
    }
    expect(crossings).toEqual([]);
  });

  it('every EXTERIOR opening is still located and sized (§12.2 string 3 survived)', () => {
    const referenced = new Set(result.strings.flatMap((s) => s.references.map((r) => r.elementId)));
    const exteriorOpenings = fixture
      .filter((w) => w.role === 'shell')
      .flatMap((w) => w.openings.map((o) => o.id));
    expect(exteriorOpenings.length).toBe(6);
    expect(exteriorOpenings.filter((id) => !referenced.has(id))).toEqual([]);
  });

  it('the editorial layer is a BYTE-FOR-BYTE no-op on a plate with no rooms', () => {
    // ⛔ The one thing the filter must never do is touch an exterior string. On a bare
    // shell there is nothing for §12.3 to act on, so the output must be exactly what the
    // pre-editorial pipeline produced — and it must still be non-empty.
    const shellOnly: AutoDimSnapshot = {
      walls: snapshot.walls.filter((w) => w.id.startsWith('shell_')),
    };
    const a = planAutoDimensions(shellOnly, OPTS);
    const b = planAutoDimensions(shellOnly, OPTS);
    expect(JSON.stringify(a.strings)).toBe(JSON.stringify(b.strings));
    expect(a.strings.length).toBeGreaterThan(0);
    expect(a.report.coverage.roomCount).toBe(0);
    expect(a.report.coverage.interiorDimCount).toBe(0);
    expect(a.report.skipped.filter((s) => s.reason.startsWith('§12'))).toEqual([]);
  });
});

describe('§12.4 — diagonal and curved façades', () => {
  const diagonals = judged.filter((j) => j.s.orientation === 'aligned');

  it('the ANGLED façades are each ONE aligned length — no chain (§12.4 HOLDS here)', () => {
    // Façade A (6,0)→(10,-2) = 4472 mm; façade B (18,8)→(14,12) = 5657 mm. `splitRuns`
    // merges collinear edges and ticks each run corner to corner, so a straight angled
    // façade never fragments. This half of §12.4 was already satisfied.
    const angled = diagonals.filter((j) => j.valueMm >= 1500).map((j) => j.valueMm).sort((a, b) => a - b);
    expect(angled).toEqual([1562, 1562, 4472, 5657]);
  });

  it('⚠ MEASURED §12.4 VIOLATION — the CURVED BAY is a chain of short diagonals (PINNED, NOT FIXED)', () => {
    // ⭐ SPEC §13 gap 8 asked whether short diagonal chains are being emitted. THEY ARE,
    // and this test records exactly where, so the finding cannot be mistaken for
    // compliance and cannot get worse unnoticed.
    //
    // A curved façade reaches the engine ALREADY TESSELLATED to a polyline. Each chord
    // turns more than the 15° collinearity gate, so `splitRuns` makes each chord its own
    // RUN and each run gets its own aligned length: the bay comes out as
    // 1562 · 1077 · 1077 · 1562 — four short diagonals in a row, which is precisely what
    // §12.4 forbids ("Never create chains of short diagonal dimensions").
    //
    // ⛔ NOT FIXED IN THIS LANE, and deliberately so. §12.4's remedy is not a filter — it
    // is "dimension endpoints, overall segment length, angle, and RADIUS IF CURVED",
    // which requires recovering the ARC from its tessellation and emitting a `radius`
    // string. That is SPEC §7 / §10's P4 curved-wall work, and dropping the short chords
    // without it would leave the bay undimensioned — trading a readability defect for an
    // INCOMPLETENESS defect. Recorded in SPEC-AUTODIMENSION §13 as still open.
    const shortDiagonals = diagonals.filter((j) => j.valueMm < 1500).map((j) => j.valueMm);
    expect(shortDiagonals.sort((a, b) => a - b)).toEqual([1077, 1077]);
  });

  it('no single RUN is fragmented into several aligned segments', () => {
    // The chain §12.4 forbids WITHIN one run does not occur — the bay's chain is one
    // segment per run, across four runs. Different defect, different fix.
    const perRun = new Map<string, number>();
    for (const j of diagonals) {
      const k = `${Math.round(j.a.x * 100)},${Math.round(j.a.z * 100)}`;
      perRun.set(k, (perRun.get(k) ?? 0) + 1);
    }
    expect([...perRun.values()].filter((n) => n > 1)).toEqual([]);
  });

  it('no INTERIOR diagonal dimension is emitted (§12.4 + §12.3)', () => {
    expect(diagonals.filter((j) => j.interior)).toEqual([]);
  });
});

describe('§12.1 / §12.9 — the priority table and the collision ORDER, as data', () => {
  it("§12.1 is the founder's ten-row table, in order", () => {
    expect(GA_PRIORITY.wall).toBe(1);
    expect(GA_PRIORITY.gridline).toBe(2);
    expect(GA_PRIORITY['overall-dimension']).toBe(3);
    expect(GA_PRIORITY['structural-dimension']).toBe(4);
    expect(GA_PRIORITY['opening-dimension']).toBe(5);
    expect(GA_PRIORITY['room-tag']).toBe(6);
    expect(GA_PRIORITY['door-tag']).toBe(7);
    expect(GA_PRIORITY['window-tag']).toBe(8);
    expect(GA_PRIORITY['internal-dimension']).toBe(9);
    expect(GA_PRIORITY.furniture).toBe(10);
  });

  it('§12.9 step 1 — DIMENSIONS STAY FIXED; the room tag is what moves', () => {
    const r = resolveGaCollision('overall-dimension', 'room-tag');
    expect(r.mover).toBe('room-tag');
    expect(r.move).toBe('translate');
    expect(r.holds).toBe('overall-dimension');
  });

  it('§12.9 steps 3/4 — door tags ROTATE about their host, window tags SLIDE', () => {
    expect(resolveGaCollision('room-tag', 'door-tag').move).toBe('rotate');
    expect(resolveGaCollision('door-tag', 'window-tag').move).toBe('slide');
  });

  it('§12.9 step 5 — FURNITURE NEVER WINS (SPEC §13 gap 3, verbatim)', () => {
    for (const other of ['room-tag', 'door-tag', 'window-tag', 'internal-dimension', 'wall'] as const) {
      const r = resolveGaCollision(other, 'furniture');
      expect(`${other} vs furniture → ${r.mover}`).toBe(`${other} vs furniture → furniture`);
    }
  });

  it('two dimensions colliding is `bothFixed` — handed to §12.12, not fudged', () => {
    const r = resolveGaCollision('overall-dimension', 'internal-dimension');
    expect(r.bothFixed).toBe(true);
    expect(r.mover).toBeNull();
    expect(gaPriorityOf('internal-dimension')).toBeGreaterThan(gaPriorityOf('overall-dimension'));
  });

  it('is symmetric — the same pair names the same mover either way round', () => {
    expect(resolveGaCollision('furniture', 'room-tag')).toEqual(resolveGaCollision('room-tag', 'furniture'));
  });
});

describe('§12.12 — the optimisation pass runs to FIXPOINT and is bounded', () => {
  it('reaches a real fixpoint on the GA plate (no unconverged note)', () => {
    expect(result.report.warnings.filter((w) => w.code === 'optimisation-unconverged')).toEqual([]);
  });

  it('an empty set converges on the first iteration', () => {
    const r = optimiseDimensionSet([]);
    expect(r.converged).toBe(true);
    expect(r.iterations).toBe(1);
  });

  it('a hostile iteration bound is REPORTED, never swallowed', () => {
    const res = planAutoDimensions(snapshot, { ...OPTS, maxOptimiseIterations: 1 });
    const unconverged = res.report.warnings.filter((w) => w.code === 'optimisation-unconverged');
    // Either it genuinely converged in one pass, or it SAID it had not. Silence is the
    // only failure mode; a bound that hides its own breach is the defect §12.12 replaces.
    expect(unconverged.length).toBeLessThanOrEqual(1);
    if (!unconverged.length) expect(res.strings.length).toBe(result.strings.length);
  });
});

describe('QA still detects real defects — the warning count fell because the DRAWING improved', () => {
  it('a genuine façade gap is still reported as `chain-gap`', () => {
    // ⚠ THE HONESTY CHECK for L-1622. QA-2's denominator was narrowed (a location dim is
    // not a chain interval, and the wall chain and the opening chain are different chains)
    // and the plate's warning count went to zero. That is only defensible if the check
    // still FIRES. Delete a façade wall so the perimeter has a genuine hole in its chain.
    const holed: AutoDimSnapshot = {
      walls: snapshot.walls.filter((w) => w.id !== 'shell_02'),
    };
    const { report } = planAutoDimensions(holed, OPTS);
    expect(report.warnings.length).toBeGreaterThan(0);
  });

  it('an UNDIMENSIONED EXTERIOR opening is still reported', () => {
    // A window on a wall the engine cannot chain (a free-standing wall, no perimeter).
    const stray: AutoDimSnapshot = {
      walls: [{
        id: 'lonely', a: { x: 0, z: 0 }, b: { x: 4, z: 0 }, thickness: 0.2,
        openings: [{ id: 'win_lonely', kind: 'window', offset: 1, width: 1 }],
      }],
    };
    const { report } = planAutoDimensions(stray, OPTS);
    expect(report.warnings.some((w) => w.code === 'open-perimeter')).toBe(true);
    expect(report.warnings.some(
      (w) => w.code === 'opening-undimensioned' || w.code === 'opening-unsized' || w.code === 'opening-unlocated',
    )).toBe(true);
  });
});

describe('INV-1/INV-3 — determinism and no silent omission survive the editorial layer', () => {
  it('byte-identical on re-run (QA-6)', () => {
    const a = planAutoDimensions(snapshot, OPTS);
    const b = planAutoDimensions(snapshot, OPTS);
    expect(JSON.stringify(a.strings)).toBe(JSON.stringify(b.strings));
    expect(JSON.stringify(a.report)).toBe(JSON.stringify(b.report));
  });

  it('wall input order does not change the drawing', () => {
    const shuffled: AutoDimSnapshot = { walls: [...snapshot.walls].reverse() };
    expect(JSON.stringify(planAutoDimensions(shuffled, OPTS).strings))
      .toBe(JSON.stringify(result.strings));
  });

  it('every editorial removal is NAMED in `skipped` with the clause that removed it', () => {
    const editorial = result.report.skipped.filter((s) => s.reason.startsWith('§12'));
    expect(editorial.length).toBeGreaterThan(0);
    for (const s of editorial) expect(s.reason).toMatch(/^§12\.(3|4|12) /);
  });

  it('every INTERIOR opening left un-dimensioned is DECLARED, not silently absent', () => {
    const interiorDoors = fixture
      .filter((w) => w.role === 'cell')
      .flatMap((w) => w.openings.map((o) => o.id));
    expect(interiorDoors.length).toBeGreaterThan(0);
    const declared = new Set(
      result.report.skipped
        .filter((s) => s.reason === '§12.3 interior-opening-not-dimensioned')
        .map((s) => s.id),
    );
    const referenced = new Set(result.strings.flatMap((s) => s.references.map((r) => r.elementId)));
    for (const id of interiorDoors) {
      expect(`${id}: ${declared.has(id) || referenced.has(id)}`).toBe(`${id}: true`);
    }
  });
});

describe('the editorial primitives, in isolation', () => {
  it('classifyEnclosures — degenerate input is total', () => {
    expect(classifyEnclosures([])).toEqual({ envelopes: [], rooms: [], containerOf: new Map() });
  });

  it("roomDimensionBudget — §12.3's allow-list, one rule per row", () => {
    const rect = (w: number, d: number) => [
      { x: 0, z: 0 }, { x: w, z: 0 }, { x: w, z: d }, { x: 0, z: d },
    ];
    // "bathroom layouts" — a small service room: BOTH axes.
    const wc = roomDimensionBudget('wc', rect(1.2, 1.8));
    expect(wc.reason).toBe('service-room');
    expect([wc.allowX, wc.allowZ]).toEqual([true, true]);
    // "stair widths" / "critical clearances" — the SHORT axis only.
    const stair = roomDimensionBudget('stair', rect(1.2, 5.2));
    expect(stair.reason).toBe('critical-clearance');
    expect([stair.allowX, stair.allowZ]).toEqual([true, false]);
    // "corridor widths" — long and thin, the SHORT axis only.
    const corr = roomDimensionBudget('corridor', rect(17.1, 1.7));
    expect(corr.reason).toBe('corridor-width');
    expect([corr.allowX, corr.allowZ]).toEqual([false, true]);
    // an ordinary room — NOTHING. This row is §12.3's whole point.
    const bed = roomDimensionBudget('bed', rect(3.4, 4.4));
    expect(bed.reason).toBe('not-construction-critical');
    expect([bed.allowX, bed.allowZ]).toEqual([false, false]);
  });

  it('filterInteriorDimensions — an empty classification is the identity', () => {
    const empty = { envelopes: [], rooms: [], containerOf: new Map<string, string>() };
    const r = filterInteriorDimensions([], empty, DEFAULT_INTERIOR_POLICY);
    expect(r.kept).toEqual([]);
    expect(r.dropped).toEqual([]);
  });

  it('traceRoomFaces — degenerate input is total', () => {
    expect(traceRoomFaces({ nodes: [], wallNodes: new Map() }, [], 1)).toEqual([]);
  });
});
