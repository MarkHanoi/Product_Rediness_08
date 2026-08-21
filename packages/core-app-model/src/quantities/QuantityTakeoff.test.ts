/**
 * QuantityTakeoff — the arithmetic that a *medición* is signed on.
 *
 * These suites are built on REAL `WallData`/`Opening` records and the REAL
 * `openingOutline()` producer, not on a mirror of the engine's own header. A
 * fake built from the header cannot falsify the header
 * (MEMORY §fake-more-capable-than-real), so every wall case here states the
 * expected square metres as a NUMBER derived by hand, not by re-running the
 * code under test.
 */

import { describe, it, expect } from 'vitest';
import type { WallData } from '@pryzm/geometry-wall';
import { computeTakeoff, openingVoidArea, wallBaselineLength } from './QuantityTakeoff.js';
import { applyRates } from './CostModel.js';
import { parseRateCsv, takeoffToCsv } from './takeoffCsv.js';
import type { TakeoffResult } from './TakeoffTypes.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function wall(over: Partial<WallData> & { id: string }): WallData {
  return {
    type: 'wall',
    baseLine: [
      { x: 0, y: 0, z: 0 },
      { x: 5, y: 0, z: 0 },
    ],
    height: 3,
    thickness: 0.2,
    baseOffset: 0,
    levelId: 'L0',
    childrenIds: [],
    openings: [],
    ...over,
  } as WallData;
}

function bagWithWalls(walls: WallData[]) {
  return {
    walls: { getAll: () => walls },
    rooms: null, floors: null, ceilings: null, roofs: null, slabs: null,
    columns: null, beams: null, handrails: null, stairs: null,
    plumbing: null, furniture: null, curtainWalls: null,
    wallTypeName: () => undefined,
    roomFinishes: null, boundingWalls: null,
  };
}

function wallLine(r: TakeoffResult) {
  return r.lines.find((l) => l.chapter === 'walls');
}

// ── Wall area: the whole reason this engine exists ────────────────────────────

describe('wall area is NET of openings', () => {
  it('measures a plain wall as length × height', () => {
    const r = computeTakeoff(bagWithWalls([wall({ id: 'w1' })]));
    // 5.000 m long × 3.000 m high = 15.00 m²
    expect(wallLine(r)!.quantity).toBeCloseTo(15, 4);
    expect(wallLine(r)!.unit).toBe('m2');
  });

  it('DEDUCTS a rectangular door — a gross area is a wrong number, not an approximate one', () => {
    const w = wall({
      id: 'w1',
      openings: [{
        id: 'o1', elementId: 'd1', type: 'door', doorType: 'single',
        offset: 2, width: 0.9, height: 2.1, sillHeight: 0,
      }],
    });
    // 15.00 − (0.9 × 2.1 = 1.89) = 13.11 m²
    const r = computeTakeoff(bagWithWalls([w]));
    expect(wallLine(r)!.quantity).toBeCloseTo(13.11, 4);
    const deducted = wallLine(r)!.secondary.find((s) => s.label === 'Openings deducted');
    expect(deducted!.value).toBeCloseTo(1.89, 4);
  });

  it('deducts SEVERAL openings on one wall', () => {
    const w = wall({
      id: 'w1',
      openings: [
        { id: 'o1', elementId: 'd1', type: 'door',   offset: 1, width: 0.9, height: 2.1, sillHeight: 0 },
        { id: 'o2', elementId: 'n1', type: 'window', offset: 3, width: 1.2, height: 1.4, sillHeight: 0.9 },
      ],
    });
    // 15.00 − 1.89 − 1.68 = 11.43 m²
    expect(wallLine(computeTakeoff(bagWithWalls([w])))!.quantity).toBeCloseTo(11.43, 4);
  });

  it('deducts the ARCH, not the bounding box, for a round-arch opening', () => {
    // A round-arch void 1.0 m wide, 2.0 m tall: a 1.0 × 1.5 rectangle under a
    // semicircle of r = 0.5. The IDEAL area is 1.5 + π(0.5²)/2 = 1.8926990…;
    // its BOUNDING BOX is 2.0. Deducting the box would over-deduct 0.107 m²
    // per window.
    //
    // ⭐ The measured value is 1.890708 — very slightly UNDER the ideal, because
    // `openingOutline()` returns the TESSELLATED polyline, an inscribed polygon.
    // That is the correct answer and not a defect: it is the area of the hole
    // that was actually cut in the mesh. A take-off that returned the ideal
    // would disagree with the model it claims to measure (C84 EI-11).
    const arch = openingVoidArea({
      width: 1, height: 2, offset: 2, sillHeight: 0, openingProfile: 'round-arch',
    });
    const ideal = 1.5 + (Math.PI * 0.25) / 2;
    expect(arch).not.toBeNull();
    expect(arch!).toBeCloseTo(1.890708, 5);
    expect(arch!).toBeLessThan(ideal);           // inscribed, never circumscribed
    expect(ideal - arch!).toBeLessThan(0.005);   // and within 0.005 m² of it
    expect(arch!).toBeLessThan(2);               // strictly better than the bbox
  });

  it('deducts πr² for a circular opening, not w × h', () => {
    // Ideal π(0.5²) = 0.7853982; measured 0.7814168 — the inscribed tessellation
    // again, and again strictly below both the ideal and the 1.0 m² bounding box.
    const circ = openingVoidArea({ width: 1, height: 1, offset: 2, sillHeight: 1, openingProfile: 'circular' });
    expect(circ!).toBeCloseTo(0.781417, 5);
    expect(circ!).toBeLessThan(Math.PI * 0.25);
    expect(circ!).toBeLessThan(1);
  });

  it('never returns a negative area when openings exceed the wall face', () => {
    const w = wall({
      id: 'w1', height: 2, // face = 10 m²
      openings: [
        { id: 'o1', elementId: 'a', type: 'window', offset: 1, width: 4, height: 1.9, sillHeight: 0 },
        { id: 'o2', elementId: 'b', type: 'window', offset: 1, width: 4, height: 1.9, sillHeight: 0 },
      ],
    });
    const line = wallLine(computeTakeoff(bagWithWalls([w])));
    // 10 − 15.2 clamps to 0 → the group rounds away entirely rather than
    // printing a negative or a zero quantity.
    expect(line).toBeUndefined();
  });
});

describe('wall length', () => {
  it('measures a straight wall as the chord', () => {
    expect(wallBaselineLength({ baseLine: [{ x: 0, y: 0, z: 0 }, { x: 3, y: 0, z: 4 }] } as WallData)).toBeCloseTo(5, 6);
  });

  it('measures a CURVED wall along its arc — always longer than the chord', () => {
    const curved = {
      baseLine: [{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }],
      curve: { control: { x: 2, y: 0, z: 2 }, segments: 32 },
    } as WallData;
    const arc = wallBaselineLength(curved);
    // Quadratic Bézier (0,0)→(2,2)→(4,0). Its speed is √(16 + (4−8t)²), whose
    // closed-form integral over [0,1] is 4.5911743 — verified independently of
    // this code. The chord is 4.000, so measuring a curved wall by its chord
    // would UNDER-measure by 0.59 m, i.e. 12.9 %, on this wall alone.
    expect(arc).toBeGreaterThan(4);
    expect(arc).toBeCloseTo(4.591174, 3);        // tessellated: inscribed, marginally short
    expect(arc).toBeLessThan(4.591174);
  });
});

describe('grouping and traceability', () => {
  it('groups walls of the same type and thickness into ONE line, and names every element', () => {
    const r = computeTakeoff(bagWithWalls([
      wall({ id: 'w1' }),
      wall({ id: 'w2' }),
      wall({ id: 'w3', thickness: 0.4 }),
    ]));
    const lines = r.lines.filter((l) => l.chapter === 'walls');
    expect(lines).toHaveLength(2);
    const thin = lines.find((l) => l.description.includes('200mm'))!;
    expect(thin.quantity).toBeCloseTo(30, 4);
    expect([...thin.elementIds].sort()).toEqual(['w1', 'w2']);
    expect(r.measuredElementCount).toBe(3);
  });

  it('every line names the elements it measured — a row that cannot is not a medición', () => {
    const r = computeTakeoff(bagWithWalls([wall({ id: 'w1' })]));
    for (const l of r.lines) expect(l.elementIds.length).toBeGreaterThan(0);
  });

  it('every line states its measurement basis', () => {
    const r = computeTakeoff(bagWithWalls([wall({ id: 'w1' })]));
    for (const l of r.lines) expect(l.basis.length).toBeGreaterThan(10);
  });

  it('line codes are STABLE across re-runs so a 5D rate survives a model edit', () => {
    const a = computeTakeoff(bagWithWalls([wall({ id: 'w1' })]));
    const b = computeTakeoff(bagWithWalls([wall({ id: 'w1', height: 4 })]));
    expect(wallLine(a)!.code).toBe(wallLine(b)!.code);
    expect(wallLine(a)!.quantity).not.toBeCloseTo(wallLine(b)!.quantity, 4);
  });
});

// ── The honesty half ──────────────────────────────────────────────────────────

describe('coverage: absent is not zero', () => {
  it('an UNREACHABLE store is reported, and produces NO line', () => {
    const r = computeTakeoff(bagWithWalls([wall({ id: 'w1' })]));
    expect(r.unreadableStores).toContain('roofStore');
    expect(r.coverage.find((c) => c.family === 'Roofs')!.state).toBe('NOT_MEASURED');
    expect(r.lines.some((l) => l.chapter === 'roofing')).toBe(false);
  });

  it('an EMPTY store reads MEASURED, not NOT_MEASURED — they are different answers', () => {
    const bag = { ...bagWithWalls([]), walls: { getAll: () => [] } };
    const r = computeTakeoff(bag);
    const walls = r.coverage.find((c) => c.family === 'Walls')!;
    expect(walls.state).toBe('MEASURED');
    expect(walls.note).toMatch(/no walls/i);
    expect(r.unreadableStores).not.toContain('wallStore');
  });

  it('names the trades it does not measure, so the take-off cannot look complete', () => {
    const r = computeTakeoff(bagWithWalls([wall({ id: 'w1' })]));
    const notMeasured = r.coverage.filter((c) => c.state === 'NOT_MEASURED').map((c) => c.family);
    for (const f of ['Foundations', 'Reinforcement', 'Electrical & HVAC', 'Structural steel mass']) {
      expect(notMeasured).toContain(f);
    }
    for (const c of r.coverage) expect(c.note.length).toBeGreaterThan(10);
  });

  it('NEVER emits a line with a zero quantity', () => {
    const r = computeTakeoff(bagWithWalls([wall({ id: 'w1' }), wall({ id: 'w2', height: 0 })]));
    for (const l of r.lines) expect(l.quantity).toBeGreaterThan(0);
  });
});

// ── 5D ────────────────────────────────────────────────────────────────────────

describe('cost: an unpriced line is NOT a zero', () => {
  const takeoff = () => computeTakeoff(bagWithWalls([wall({ id: 'w1' })]));

  it('with NO rate book, nothing is priced and the total says so', () => {
    const c = applyRates(takeoff(), null);
    expect(c.summary.pricedTotal).toBe(0);
    expect(c.summary.pricedLineCount).toBe(0);
    expect(c.summary.currency).toBeNull();
    expect(c.summary.coverageStatement).toMatch(/NO LINE IS PRICED/);
    for (const l of c.lines) {
      expect(l.rate).toBeNull();
      expect(l.amount).toBeNull();
      expect(l.unpricedReason).toBe('NO_RATE');
    }
  });

  it('prices a line that HAS a rate and excludes the ones that do not', () => {
    const t = takeoff();
    const code = wallLine(t)!.code;
    const c = applyRates(t, {
      currency: 'EUR',
      entries: [{ lineCode: code, rate: 42, unit: 'm2', source: 'BEDEC E612 2026' }],
    });
    // 15.00 m² × 42 €/m² = 630.00
    expect(c.summary.pricedTotal).toBeCloseTo(630, 2);
    expect(c.summary.pricedLineCount).toBe(1);
    expect(c.summary.coverageStatement).toMatch(/Total covers 1 of/);
    expect(c.lines.find((l) => l.line.code === code)!.source).toBe('BEDEC E612 2026');
  });

  it('REFUSES a rate quoted in the wrong unit rather than multiplying anyway', () => {
    const t = takeoff();
    const code = wallLine(t)!.code;
    const c = applyRates(t, { currency: 'EUR', entries: [{ lineCode: code, rate: 900, unit: 'ud', source: 'x' }] });
    expect(c.summary.pricedTotal).toBe(0);
    expect(c.summary.unitMismatchLineCodes).toContain(code);
    expect(c.lines.find((l) => l.line.code === code)!.unpricedReason).toBe('UNIT_MISMATCH');
  });

  it('counts rates that carry no source', () => {
    const t = takeoff();
    const c = applyRates(t, { currency: 'EUR', entries: [{ lineCode: wallLine(t)!.code, rate: 42, unit: 'm2', source: '  ' }] });
    expect(c.summary.unsourcedRateCount).toBe(1);
    expect(c.summary.coverageStatement).toMatch(/no stated source/);
  });

  it('the coverage statement always names the unmeasured trades', () => {
    const c = applyRates(takeoff(), null);
    expect(c.summary.coverageStatement).toMatch(/NOT MEASURED and therefore NOT PRICED/);
  });
});

describe('rate CSV import rejects rather than coerces', () => {
  it('imports well-formed rows and reports the rest', () => {
    const r = parseRateCsv([
      '# PRYZM rate book,currency,EUR',
      'Code,Rate,Unit,Source',
      'WALL.generic.200,42.50,m2,BEDEC E612',
      'WALL.generic.400,not-a-number,m2,junk',
      'WALL.generic.300,10,furlongs,junk',
      ',10,m2,orphan',
    ].join('\n'));
    expect(r.currency).toBe('EUR');
    expect(r.entries).toHaveLength(1);
    expect(r.entries[0].rate).toBeCloseTo(42.5, 4);
    expect(r.rejected).toHaveLength(3);
    expect(r.rejected.join(' ')).toMatch(/NOT treated as 0/);
  });
});

describe('CSV export carries the coverage table with it', () => {
  it('exports quantities AND the not-measured list', () => {
    const csv = takeoffToCsv(computeTakeoff(bagWithWalls([wall({ id: 'w1' })])));
    expect(csv).toContain('# COVERAGE');
    expect(csv).toContain('NOT_MEASURED');
    expect(csv).toContain('Foundations');
    expect(csv).toContain('w1');
  });
});
