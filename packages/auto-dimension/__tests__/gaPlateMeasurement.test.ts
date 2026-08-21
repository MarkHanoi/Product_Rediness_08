// §GA-EDITORIAL-LAYER (L-1620) — THE TWO NUMBERS, PINNED.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE BEFORE / AFTER RECORD
// ─────────────────────────────────────────────────────────────────────────────
// Both columns were produced by running THIS FILE'S assertions — via the shared judge in
// `fixtures/judgeGa.ts` — against the SAME GA plate, first with the engine as it stood at
// HEAD (its sources extracted with `git show` into a scratch tree) and then with the
// engine after this lane. One measurement taken twice, not two measurements sharing a
// name:
//
//                                        HEAD        after L-1620/21/22
//     INTERIOR dimensions ............     36                  4
//     report.warnings ................     51                  0
//     exterior dimensions ............     35                 35   (unchanged — the pin)
//     coverage.buildingCount .........      2                  1
//     coverage.roomCount .............      – (no concept)     12
//     interior dims by room ..........  eleven of the twelve   corridor, stair, wc only
//                                       rooms carried at
//                                       least one, several
//                                       carried three
//
// The surviving four are the ones SPEC-AUTODIMENSION §12.3 names: the corridor WIDTH
// (1700), the stair WIDTH (1200), and the WC's two-axis layout (1200 × 1800). Nothing
// else on a twelve-room plate is construction-critical, and §12.3 says so: "Avoid …
// every room edge."
//
// ⚠ THESE ARE ASSERTIONS, NOT A COMMENT. A number in prose rots; a number in an
// expectation fails. If the drawing changes, this test says so.

import { describe, it, expect } from 'vitest';
import { planAutoDimensions } from '../src/index.js';
import type { AutoDimSnapshot, AutoDimWall } from '../src/index.js';
import { gaPlateWalls, gaPlateRooms } from './fixtures/gaPlate.js';
import { judgeGaPlate, perRoomTally } from './fixtures/judgeGa.js';

const OPTS = { viewId: 'view-plan-ga', levelId: 'level-ga', tierGapM: 0.8 } as const;

const fixture = gaPlateWalls();
const snapshot: AutoDimSnapshot = {
  walls: fixture.map((w): AutoDimWall => ({
    id: w.id, a: w.a, b: w.b, thickness: w.thickness, openings: w.openings,
  })),
};
const { strings, report } = planAutoDimensions(snapshot, OPTS);
const judged = judgeGaPlate(fixture, gaPlateRooms(), strings);
const interior = judged.filter((j) => j.interior);

describe('SPEC-AUTODIMENSION §12.3 — the founder\'s two numbers, on the GA plate', () => {
  it('INTERIOR DIMENSIONS: 36 at HEAD → 4', () => {
    expect(interior.length).toBe(4);
    expect(report.coverage.interiorDimCount).toBe(4);
  });

  it('WARNINGS: 51 at HEAD → 0', () => {
    expect(report.warnings.map((w) => `${w.code}: ${w.detail}`)).toEqual([]);
  });

  it('EXTERIOR DIMENSIONS: 35 at HEAD → 35 (the editorial layer did not touch them)', () => {
    expect(judged.length - interior.length).toBe(35);
  });

  it('the four survivors are exactly §12.3\'s allow-list, and nothing else', () => {
    expect(interior.map((j) => `${j.room}/${j.s.orientation}/${j.valueMm}`).sort()).toEqual([
      'corridor/vertical/1700',   // §12.3 "corridor widths"
      'stair/horizontal/1200',    // §12.3 "stair widths"
      'wc/horizontal/1200',       // §12.3 "bathroom layouts" — both axes
      'wc/vertical/1800',
    ]);
  });

  it('§12.3 — MAXIMUM ONE WIDTH AND ONE LENGTH PER ROOM', () => {
    const violations = [...perRoomTally(judged).entries()]
      .filter(([, e]) => e.h > 1 || e.v > 1)
      .map(([r, e]) => `${r}: ${e.h} widths, ${e.v} lengths`)
      .sort();
    expect(violations).toEqual([]);
  });

  it('§12.3 — no interior dimension on an ordinary (non-construction-critical) room', () => {
    const critical = new Set(['corridor', 'stair', 'wc']);
    expect([...new Set(
      interior.map((j) => j.room).filter((r): r is string => r !== null && !critical.has(r)),
    )].sort()).toEqual([]);
  });

  it('§12.3 — every interior dimension is attributable to ONE room', () => {
    // A dimension that measures interior geometry but belongs to no single room is not
    // "one width or one length per room" — it is a fragment of a chain running across
    // rooms, which is the "every room edge" drawing §12.3 forbids. At HEAD two such
    // strings existed (a 17100 mm horizontal and an 11300 mm vertical: the whole
    // partition network measured end to end, as though it were a building).
    expect(interior.filter((j) => j.room === null).map((j) => `${j.s.orientation} ${j.valueMm}mm`)).toEqual([]);
  });

  it('§12.3 — no duplicate dimensions in the emitted set', () => {
    const seen = new Map<string, number>();
    for (const j of judged) {
      const k = `${j.s.orientation}|${Math.round(j.a.x * 1000)},${Math.round(j.a.z * 1000)}` +
        `|${Math.round(j.b.x * 1000)},${Math.round(j.b.z * 1000)}|${Math.round(j.s.offsetMm ?? 0)}`;
      seen.set(k, (seen.get(k) ?? 0) + 1);
    }
    expect([...seen.entries()].filter(([, n]) => n > 1).map(([k, n]) => `${k} x${n}`)).toEqual([]);
  });
});
