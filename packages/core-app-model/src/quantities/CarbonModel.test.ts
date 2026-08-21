/**
 * CarbonModel — 6D, asserted against numbers derived BY HAND from the cited
 * factors, never by re-running the code under test.
 *
 * ⭐ WHAT MAKES THIS SUITE DIFFERENTIATING. The failure mode 6D exists to avoid
 * is a plausible number, so every assertion below distinguishes a REAL answer
 * from a plausible one:
 *
 *   • 1084.80 kgCO₂e, not "some number" — 4 m³ × 2400 kg/m³ × 0.113 kgCO₂e/kg,
 *     computed here on paper. A code path that lost the density would produce
 *     0.452 and still "have a number";
 *   • a material with a factor and NO density must return `NO_DENSITY`, and a
 *     shape that quietly assumed 2400 kg/m³ would pass a "did it compute?" test
 *     and fail this one;
 *   • a wall's carbon must be split PER LAYER, and the layer volumes must be net
 *     of openings — a whole-wall attribution would still total something.
 */

import { describe, it, expect } from 'vitest';
import type { WallData } from '@pryzm/geometry-wall';
import { computeTakeoff } from './QuantityTakeoff.js';
import { computeCarbon } from './CarbonModel.js';
import type { TakeoffStores } from './QuantityTakeoff.js';

const EMPTY: TakeoffStores = {
  walls: null, rooms: null, floors: null, ceilings: null, roofs: null, slabs: null,
  columns: null, beams: null, handrails: null, stairs: null,
  plumbing: null, furniture: null, curtainWalls: null,
  wallTypeName: () => undefined, wallTypeLayers: () => null,
  roomFinishes: null, boundingWalls: null,
};

function slab(id: string, materialId: string | undefined, thickness: number) {
  return {
    id,
    materialId,
    thickness,
    // 4.000 × 5.000 = 20.00 m² in plan.
    polygon: [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 5 }, { x: 0, z: 5 }],
  };
}

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
    ...over,
  } as WallData;
}

// ── The arithmetic ────────────────────────────────────────────────────────────

describe('6D multiplies volume × density × factor, and shows its working', () => {
  it('a concrete slab reaches the exact hand-computed figure', () => {
    // 20.00 m² × 0.200 m = 4.000 m³ · × 2400 kg/m³ = 9600 kg · × 0.113 = 1084.80
    const takeoff = computeTakeoff({ ...EMPTY, slabs: { getAll: () => [slab('s1', 'concrete-smooth', 0.2)] } });
    const carbon = computeCarbon(takeoff);
    expect(carbon.summary.totalKgCO2e).toBeCloseTo(1084.8, 2);

    const row = carbon.lines.flatMap((l) => l.materials).find((m) => m.materialId === 'concrete-smooth');
    expect(row?.volumeM3).toBeCloseTo(4, 4);
    expect(row?.massKg).toBeCloseTo(9600, 2);
    expect(row?.kgCO2e).toBeCloseTo(1084.8, 2);
  });

  it('every measured row carries a citation, a dataset and a verification state', () => {
    const takeoff = computeTakeoff({ ...EMPTY, slabs: { getAll: () => [slab('s1', 'concrete-smooth', 0.2)] } });
    const carbon = computeCarbon(takeoff);
    const row = carbon.lines.flatMap((l) => l.materials)[0];
    expect(row.factor).not.toBeNull();
    expect(row.factor!.dataset).toBe('ICE v3.0');
    expect(row.factor!.scope).toBe('A1-A3');
    expect(row.factor!.source.length).toBeGreaterThan(40);
    // ⭐ Cited is NOT checked, and the type refuses to let the two be confused.
    expect(row.factor!.verification).toBe('UNVERIFIED_TRANSCRIPTION');
    expect(carbon.summary.unverifiedFactorCount).toBe(1);
  });

  it('the total is never rendered without a coverage statement that names the scope', () => {
    const takeoff = computeTakeoff({ ...EMPTY, slabs: { getAll: () => [slab('s1', 'concrete-smooth', 0.2)] } });
    const s = computeCarbon(takeoff).summary;
    expect(s.coverageStatement).toMatch(/A1.A3/);
    expect(s.coverageStatement).toMatch(/UNVERIFIED/);
    expect(s.coverageStatement).toMatch(/NOT MEASURED/);
  });
});

// ── The refusals — each is a DIFFERENT value, never a zero ────────────────────

describe('6D refuses rather than assumes', () => {
  it('a material with a factor but NO density returns NO_DENSITY, not a guessed mass', () => {
    // `insulation-mineral-wool` ships 1.28 kgCO2e/kg and NO density on purpose:
    // the product ranges 23-150 kg/m³ and choosing one silently multiplies the line.
    const takeoff = computeTakeoff({ ...EMPTY, slabs: { getAll: () => [slab('s1', 'insulation-mineral-wool', 0.2)] } });
    const carbon = computeCarbon(takeoff);
    expect(carbon.summary.totalKgCO2e).toBe(0);
    expect(carbon.summary.measuredVolumeM3).toBe(0);
    expect(carbon.gaps).toHaveLength(1);
    expect(carbon.gaps[0].reason).toBe('NO_DENSITY');
    // The volume is REAL and reported — it is unmeasured carbon, not zero carbon.
    expect(carbon.gaps[0].volumeM3).toBeCloseTo(4, 4);
    expect(carbon.summary.coverageStatement).toMatch(/NO LINE IS MEASURED/);
  });

  it('a user density completes that line — and is reported as the user\'s own', () => {
    const takeoff = computeTakeoff({ ...EMPTY, slabs: { getAll: () => [slab('s1', 'insulation-mineral-wool', 0.2)] } });
    const carbon = computeCarbon(takeoff, {
      entries: {
        'insulation-mineral-wool': {
          density: {
            kgPerM3: 100, source: 'Product datasheet ROCKWOOL RW3', dataset: 'user',
            year: 2026, geography: 'as supplied',
            provenance: 'USER_ENTERED', verification: 'UNVERIFIED_TRANSCRIPTION',
          },
        },
      },
    });
    // 4 m³ × 100 kg/m³ = 400 kg × 1.28 = 512.00
    expect(carbon.summary.totalKgCO2e).toBeCloseTo(512, 2);
    expect(carbon.summary.overriddenFactorCount).toBe(1);
    expect(carbon.gaps).toHaveLength(0);
  });

  it('a material with no factor at all is NOT_MEASURED, not zero', () => {
    // `concrete-white` is deliberately absent from the factor table: white cement
    // is a materially different figure and the generic one does not describe it.
    const takeoff = computeTakeoff({ ...EMPTY, slabs: { getAll: () => [slab('s1', 'concrete-white', 0.2)] } });
    const carbon = computeCarbon(takeoff);
    expect(carbon.gaps[0].reason).toBe('NO_FACTOR');
    expect(carbon.lines[0].kgCO2e).toBeNull();
    expect(carbon.summary.totalKgCO2e).toBe(0);
  });

  it('an unresolvable material id is named, not absorbed', () => {
    const takeoff = computeTakeoff({ ...EMPTY, slabs: { getAll: () => [slab('s1', 'not-a-real-material', 0.2)] } });
    const carbon = computeCarbon(takeoff);
    expect(carbon.gaps[0].reason).toBe('UNKNOWN_MATERIAL');
    expect(carbon.summary.coverageStatement).toContain('not-a-real-material');
  });

  it('a line that names NO material is counted apart from a line with no factor', () => {
    // A slab with no materialId: real volume, no material reference at all. The
    // fix is to tag the element, not to find a factor — so it is its own number.
    const takeoff = computeTakeoff({ ...EMPTY, slabs: { getAll: () => [slab('s1', undefined, 0.2)] } });
    const carbon = computeCarbon(takeoff);
    expect(carbon.summary.unattributedVolumeM3).toBeCloseTo(4, 4);
    expect(carbon.summary.unmeasuredVolumeM3).toBe(0);
    expect(carbon.gaps).toHaveLength(0);
    expect(carbon.summary.coverageStatement).toMatch(/name NO material/);
  });
});

// ── The layer split — the reason walls can be measured at all ─────────────────

describe('a wall is measured PER LAYER, and the layers are net of openings', () => {
  const LAYERS = [
    { name: 'Dense Blockwork', thickness: 0.14, materialId: 'blockwork-dense' },
    { name: 'Mineral Wool', thickness: 0.09, materialId: 'insulation-mineral-wool' },
    { name: 'Plasterboard', thickness: 0.0125, materialId: 'gypsum-plasterboard' },
    { name: 'Air cavity', thickness: 0.05, materialId: undefined },
  ];

  const stores = (openings: WallData['openings']): TakeoffStores => ({
    ...EMPTY,
    walls: { getAll: () => [wall({ id: 'w1', systemTypeId: 'wt-x', openings } as Partial<WallData> & { id: string })] },
    wallTypeName: () => 'Cavity wall',
    wallTypeLayers: () => LAYERS,
  });

  it('splits the wall into one row per layer that names a material', () => {
    const takeoff = computeTakeoff(stores([]));
    const line = takeoff.lines.find((l) => l.chapter === 'walls')!;
    // 4 layers authored, 3 name a material. The air cavity contributes NOTHING —
    // not a share of its neighbours, and not a zero.
    expect(line.materialBreakdown).toHaveLength(3);
    const ids = line.materialBreakdown.map((m) => m.materialId).sort();
    expect(ids).toEqual(['blockwork-dense', 'gypsum-plasterboard', 'insulation-mineral-wool']);
  });

  it('the layer volume uses the NET face area, so an opening is deducted from every layer', () => {
    // 5.000 × 3.000 = 15.00 m² gross; a 0.900 × 2.100 door removes 1.89 m² → 13.11 m² net.
    const takeoff = computeTakeoff(stores([{
      id: 'op-1', elementId: 'door-1', type: 'door', doorType: 'single',
      offset: 2, width: 0.9, height: 2.1, sillHeight: 0,
    } as unknown as NonNullable<WallData['openings']>[number]]));
    const line = takeoff.lines.find((l) => l.chapter === 'walls')!;
    expect(line.quantity).toBeCloseTo(13.11, 2);
    const board = line.materialBreakdown.find((m) => m.materialId === 'gypsum-plasterboard')!;
    // 13.11 m² × 0.0125 m = 0.163875 m³ → rounded to 4 dp by the builder.
    expect(board.volumeM3).toBeCloseTo(0.1639, 4);
    // A whole-wall (gross) attribution would give 15.00 × 0.0125 = 0.1875.
    expect(board.volumeM3).not.toBeCloseTo(0.1875, 3);
  });

  it('carbon for that wall is the SUM of the layers that have factors, and names the rest', () => {
    const takeoff = computeTakeoff(stores([]));
    const carbon = computeCarbon(takeoff);
    // Plasterboard: 15.00 × 0.0125 = 0.1875 m³ × 700 kg/m³ = 131.25 kg × 0.39 = 51.1875
    const board = carbon.lines[0].materials.find((m) => m.materialId === 'gypsum-plasterboard')!;
    expect(board.kgCO2e).toBeCloseTo(51.19, 2);
    // Blockwork ships no factor and mineral wool ships no density: BOTH are gaps,
    // each with its own reason, and the wall's total covers neither.
    const reasons = carbon.gaps.map((g) => `${g.materialId}:${g.reason}`).sort();
    expect(reasons).toEqual(['blockwork-dense:NO_FACTOR', 'insulation-mineral-wool:NO_DENSITY']);
    expect(carbon.summary.totalKgCO2e).toBeCloseTo(51.19, 2);
  });
});
