// @vitest-environment happy-dom
//
// (IfcImporter imports `debug` from @pryzm/core-app-model, whose barrel
// transitively reaches @thatopen/ui and touches `document` at module load —
// see the SCC "no barrel access at module load" note. A DOM environment is the
// cheapest correct fix here; untangling that barrel is not this change's scope.)
//
// §FIX-IFC-STOREY-UNIT-SCALE (L-695) — regression guard for the 1000× storey
// elevation error.
//
// Bug (founder-reported, live log): importing a two-storey Revit house produced
//   [IfcLevelImporter] Created level "Foundation"         @ -800.000 m
//   [IfcLevelImporter] Created level "Level 1 Living Rm." @ -550.000 m
//   [IfcLevelImporter] Created level "Ceiling"            @ 2700.000 m
//   [IfcLevelImporter] Created level "Roof Line"          @ 6000.000 m
// — plainly -0.8 / -0.55 / 2.7 / 6.0 m read as if they were metres when the file
// declares MILLIMETRES. Downstream this yielded a "6002.8 m" building height and
// a 202-entry floor selector from a two-storey house.
//
// Root cause: IfcAPI.GetLine() returns RAW STEP scalars in file units and applies
// no unit conversion, while GetGeometry()/StreamAllMeshes() ARE normalised to
// metres inside web-ifc's WASM. The importer read Elevation straight off GetLine,
// so geometry was right and storeys were 1000× wrong. Nothing in the repo read
// IfcUnitAssignment/IfcSIUnit at all.
//
// These tests pin BOTH halves: the pure resolution rule, and the real end-to-end
// parse of an IFC4 fixture whose elevations are the founder's exact numbers.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  resolveLengthUnitScale,
  isPlausibleBuildingHeight,
  MAX_PLAUSIBLE_BUILDING_HEIGHT_M,
  IFC_SI_PREFIX_FACTORS,
  type IfcLengthUnitRecord,
} from '../src/import/ifc/IfcUnitScale';
import { IfcImporter } from '../src/import/ifc/IfcImporter';

const HERE = dirname(fileURLToPath(import.meta.url));
const MM_FIXTURE = join(HERE, 'fixtures', 'storeys-mm.ifc');

// ── The pure resolution rule ────────────────────────────────────────────────

describe('resolveLengthUnitScale', () => {
  it('returns 1e-3 for a MILLI-prefixed metre (every Revit IFC export)', () => {
    const records: IfcLengthUnitRecord[] = [
      { kind: 'SI', unitType: 'LENGTHUNIT', name: 'METRE', prefix: 'MILLI' },
    ];
    expect(resolveLengthUnitScale(records)).toBe(1e-3);
  });

  it('returns 1 for an unprefixed metre', () => {
    expect(
      resolveLengthUnitScale([{ kind: 'SI', unitType: 'LENGTHUNIT', name: 'METRE' }]),
    ).toBe(1);
  });

  it('returns 1e-2 for CENTI', () => {
    expect(
      resolveLengthUnitScale([
        { kind: 'SI', unitType: 'LENGTHUNIT', name: 'METRE', prefix: 'CENTI' },
      ]),
    ).toBe(1e-2);
  });

  it('ignores non-length units when resolving', () => {
    const records: IfcLengthUnitRecord[] = [
      { kind: 'SI', unitType: 'AREAUNIT', name: 'SQUARE_METRE' },
      { kind: 'SI', unitType: 'VOLUMEUNIT', name: 'CUBIC_METRE' },
      { kind: 'SI', unitType: 'LENGTHUNIT', name: 'METRE', prefix: 'MILLI' },
    ];
    expect(resolveLengthUnitScale(records)).toBe(1e-3);
  });

  it('resolves an imperial IfcConversionBasedUnit (FOOT → 0.3048)', () => {
    expect(
      resolveLengthUnitScale([
        { kind: 'CONVERSION', unitType: 'LENGTHUNIT', conversionFactor: 0.3048, conversionUnitScale: 1 },
      ]),
    ).toBeCloseTo(0.3048, 10);
  });

  it('prefers an SI declaration over a conversion-based one', () => {
    expect(
      resolveLengthUnitScale([
        { kind: 'CONVERSION', unitType: 'LENGTHUNIT', conversionFactor: 0.3048 },
        { kind: 'SI', unitType: 'LENGTHUNIT', name: 'METRE', prefix: 'MILLI' },
      ]),
    ).toBe(1e-3);
  });

  it('defaults to 1 (metres) when no LENGTHUNIT is declared — never guesses', () => {
    expect(resolveLengthUnitScale([])).toBe(1);
    expect(resolveLengthUnitScale([{ kind: 'SI', unitType: 'AREAUNIT', name: 'SQUARE_METRE' }])).toBe(1);
  });

  it('defaults to 1 on an unknown prefix rather than corrupting the model', () => {
    expect(
      resolveLengthUnitScale([
        { kind: 'SI', unitType: 'LENGTHUNIT', name: 'METRE', prefix: 'NOT_A_PREFIX' },
      ]),
    ).toBe(1);
  });

  it('exposes the full IfcSIPrefix table', () => {
    expect(IFC_SI_PREFIX_FACTORS.MILLI).toBe(1e-3);
    expect(IFC_SI_PREFIX_FACTORS.KILO).toBe(1e3);
  });
});

// ── The derived-height guard: a 6 km tower can never silently return ─────────

describe('isPlausibleBuildingHeight', () => {
  it('accepts a real two-storey house height', () => {
    expect(isPlausibleBuildingHeight(6.0)).toBe(true);
  });

  it('accepts the tallest real building on earth', () => {
    expect(isPlausibleBuildingHeight(828)).toBe(true);
  });

  it('REJECTS the 6002.8 m tower the unit bug produced', () => {
    expect(isPlausibleBuildingHeight(6002.8)).toBe(false);
  });

  it('rejects anything above the stated ceiling', () => {
    expect(isPlausibleBuildingHeight(MAX_PLAUSIBLE_BUILDING_HEIGHT_M + 0.1)).toBe(false);
    expect(isPlausibleBuildingHeight(Number.POSITIVE_INFINITY)).toBe(false);
    expect(isPlausibleBuildingHeight(Number.NaN)).toBe(false);
  });
});

// ── End-to-end: a real IFC4 file with MILLI units, parsed by the real importer ─

describe('IfcImporter — storey elevations from a MILLI-prefixed IFC4 file', () => {
  async function importFixture(bytes: Uint8Array) {
    // wasmPath: null → let web-ifc resolve its binary next to its own module
    // (the browser default '/wasm/' does not exist under Node).
    const importer = new IfcImporter({ wasmPath: null });
    try {
      return await importer.importFromBytes(bytes);
    } finally {
      importer.dispose();
    }
  }

  it('converts millimetre storey elevations to METRES (the founder\'s exact numbers)', async () => {
    const result = await importFixture(new Uint8Array(readFileSync(MM_FIXTURE)));

    expect(result.lengthUnitScale).toBe(1e-3);

    const byName = new Map(result.storeys.map((s) => [s.name, s.elevation]));

    // -800 / -550 / 2700 / 6000 in the FILE must become metres here.
    expect(byName.get('Foundation')).toBeCloseTo(-0.8, 9);
    expect(byName.get('Level 1 Living Rm.')).toBeCloseTo(-0.55, 9);
    expect(byName.get('Ceiling')).toBeCloseTo(2.7, 9);
    expect(byName.get('Roof Line')).toBeCloseTo(6.0, 9);

    // The pre-fix values must be gone entirely.
    for (const s of result.storeys) {
      expect(Math.abs(s.elevation)).toBeLessThan(10);
    }
  });

  it('keeps the hierarchy nodes in metres too (same seam, one conversion)', async () => {
    const result = await importFixture(new Uint8Array(readFileSync(MM_FIXTURE)));
    const levels = result.hierarchyNodes.filter((n) => n.type === 'level');
    expect(levels).toHaveLength(4);
    for (const l of levels) {
      expect(Math.abs(l.elevation ?? 0)).toBeLessThan(10);
    }
  });

  it('the derived building height is a house, not a 6 km tower', async () => {
    const result = await importFixture(new Uint8Array(readFileSync(MM_FIXTURE)));
    const elevations = result.storeys.map((s) => s.elevation);
    const derivedHeight = Math.max(...elevations) - Math.min(...elevations);

    expect(isPlausibleBuildingHeight(derivedHeight)).toBe(true);
    expect(derivedHeight).toBeCloseTo(6.8, 9); // 6.0 − (−0.8)

    // §FORMA-FULL-HEIGHT tiles storey bands up to the building height at ~2.8 m
    // each and caps at MAX_TILED_STOREYS=200. Before the fix this produced 202
    // bands from a two-storey house; assert we are nowhere near that.
    const tiledBands = Math.ceil(derivedHeight / 2.8);
    expect(tiledBands).toBeLessThanOrEqual(3);
  });

  it('storeys land inside a plan-view level band, so per-level plan views can see them', async () => {
    // Coordinates with the per-level plan-view work: EdgeProjectorService plan
    // bands are [elevation + nearOffset, elevation + farOffset] with defaults
    // 1.2 m / 3.0 m, and the IFC mesh Y-filter uses [near − 2.5, far + 0.5].
    // The imported geometry occupies Y ∈ [0, 3] m (a 3000 mm wall, metre-scaled
    // by web-ifc). With correct storey metres at least one storey band overlaps
    // that geometry; at ±800 m NONE could.
    const result = await importFixture(new Uint8Array(readFileSync(MM_FIXTURE)));

    const GEOMETRY_MIN_Y = 0;
    const GEOMETRY_MAX_Y = 3;
    const overlapping = result.storeys.filter((s) => {
      const near = s.elevation + 1.2;
      const far = s.elevation + 3.0;
      const lowerBound = near - 2.5;
      const upperBound = far + 0.5;
      return !(GEOMETRY_MAX_Y < lowerBound || GEOMETRY_MIN_Y > upperBound);
    });

    expect(overlapping.length).toBeGreaterThan(0);
  });

  it('does NOT scale a file that already declares plain METRES (no double-scaling)', async () => {
    // Same fixture, unit line switched to an unprefixed metre. The RAW numbers
    // are unchanged, so a correct importer must return them untouched — this is
    // what proves the conversion is unit-DRIVEN and applied exactly once.
    const asMetres = readFileSync(MM_FIXTURE, 'utf8').replace(
      'IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.)',
      'IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.)',
    );
    const result = await importFixture(new Uint8Array(Buffer.from(asMetres, 'utf8')));

    expect(result.lengthUnitScale).toBe(1);
    const byName = new Map(result.storeys.map((s) => [s.name, s.elevation]));
    expect(byName.get('Roof Line')).toBeCloseTo(6000, 6);
    expect(byName.get('Foundation')).toBeCloseTo(-800, 6);
  });
});
